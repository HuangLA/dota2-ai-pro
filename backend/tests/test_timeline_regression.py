"""Regression tests for pause-aware timeline time mapping."""

from __future__ import annotations

import math
import json
from pathlib import Path

import pandas as pd
import pytest

from parsers.models import PositionSample, WardEvent
from routers.playback import build_time_basis, resolve_game_time, resolve_offset_seconds
from storage.parquet_storage import ParquetStorage


REPO_MATCH_SAMPLES = [8674716612, 8689321714, 8736891827]
REPO_MATCHES_DIR = Path(__file__).resolve().parents[1] / "data" / "matches"


@pytest.fixture
def parquet_storage(tmp_path: Path) -> ParquetStorage:
    """Provide a ParquetStorage instance for direct helper testing."""
    return ParquetStorage(str(tmp_path / "matches"))


@pytest.fixture
def linear_positions() -> list[PositionSample]:
    """Provide baseline linear game_time position samples with no pauses."""
    return [
        PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=0.0),
        PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=1.0),
        PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=2.0),
        PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=3.0),
    ]


@pytest.fixture
def empty_wards() -> list[WardEvent]:
    """Provide an empty ward event list for tests focused on positions."""
    return []


class TestPauseIntervalInference:
    """Coverage for ParquetStorage._infer_pause_intervals regression behavior."""

    def test_no_pauses_returns_empty_intervals(
        self,
        parquet_storage: ParquetStorage,
        linear_positions: list[PositionSample],
        empty_wards: list[WardEvent],
    ) -> None:
        """Returns no pause intervals when game_time increases linearly."""
        intervals = parquet_storage._infer_pause_intervals(linear_positions, empty_wards)
        assert intervals == []

    def test_single_pause_detected(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Detects one pause interval when game_time remains flat."""
        positions = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=0.0),
            PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=1.0),
            PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=1.0),
            PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=1.0),
            PositionSample(tick=120, hero="Axe", handle=1, team=2, x=4.0, y=4.0, game_time=2.0),
        ]

        intervals = parquet_storage._infer_pause_intervals(positions, empty_wards)

        assert len(intervals) == 1
        assert intervals[0]["replay_start_time"] == pytest.approx(1.0)
        assert intervals[0]["replay_end_time"] == pytest.approx(3.0)
        assert intervals[0]["duration_seconds"] == pytest.approx(2.0)
        assert intervals[0]["game_time"] == pytest.approx(1.0)

    def test_multiple_separate_pauses_detected(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Detects two pause intervals when freezes happen in separate ranges."""
        positions = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=0.0),
            PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=1.0),
            PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=1.0),
            PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=2.0),
            PositionSample(tick=120, hero="Axe", handle=1, team=2, x=4.0, y=4.0, game_time=3.0),
            PositionSample(tick=150, hero="Axe", handle=1, team=2, x=5.0, y=5.0, game_time=3.0),
            PositionSample(tick=180, hero="Axe", handle=1, team=2, x=6.0, y=6.0, game_time=4.0),
        ]

        intervals = parquet_storage._infer_pause_intervals(positions, empty_wards)

        assert len(intervals) == 2
        assert intervals[0]["replay_start_time"] == pytest.approx(1.0)
        assert intervals[0]["replay_end_time"] == pytest.approx(2.0)
        assert intervals[1]["replay_start_time"] == pytest.approx(4.0)
        assert intervals[1]["replay_end_time"] == pytest.approx(5.0)

    def test_epsilon_threshold_treats_small_deltas_as_pause(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Treats game_time deltas <= 1e-4 as paused."""
        positions = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=10.0),
            PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=10.00005),
            PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=10.00009),
            PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=11.0),
        ]

        intervals = parquet_storage._infer_pause_intervals(positions, empty_wards)

        assert len(intervals) == 1
        assert intervals[0]["replay_start_time"] == pytest.approx(0.0)
        assert intervals[0]["replay_end_time"] == pytest.approx(2.0)
        assert intervals[0]["duration_seconds"] == pytest.approx(2.0)

    def test_single_tick_pause_creates_short_interval(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Creates a 1-second pause interval for a single frozen adjacent pair."""
        positions = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=0.0),
            PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=1.0),
            PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=1.0),
            PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=2.0),
        ]

        intervals = parquet_storage._infer_pause_intervals(positions, empty_wards)

        assert len(intervals) == 1
        assert intervals[0]["duration_seconds"] == pytest.approx(1.0)
        assert intervals[0]["replay_start_time"] == pytest.approx(1.0)
        assert intervals[0]["replay_end_time"] == pytest.approx(2.0)

    def test_pause_at_game_start_detected(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Detects pause intervals that begin at replay start."""
        positions = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=-90.0),
            PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=-90.0),
            PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=-90.0),
            PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=-89.0),
        ]

        intervals = parquet_storage._infer_pause_intervals(positions, empty_wards)

        assert len(intervals) == 1
        assert intervals[0]["replay_start_time"] == pytest.approx(0.0)
        assert intervals[0]["replay_end_time"] == pytest.approx(2.0)

    def test_pause_at_game_end_detected(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Detects pause intervals that extend to the last sample."""
        positions = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=0.0),
            PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=1.0),
            PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=2.0),
            PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=2.0),
            PositionSample(tick=120, hero="Axe", handle=1, team=2, x=4.0, y=4.0, game_time=2.0),
        ]

        intervals = parquet_storage._infer_pause_intervals(positions, empty_wards)

        assert len(intervals) == 1
        assert intervals[0]["replay_start_time"] == pytest.approx(2.0)
        assert intervals[0]["replay_end_time"] == pytest.approx(4.0)
        assert intervals[0]["duration_seconds"] == pytest.approx(2.0)

    def test_empty_positions_return_empty_intervals(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Returns no intervals when there are no position samples."""
        intervals = parquet_storage._infer_pause_intervals([], empty_wards)
        assert intervals == []

    def test_single_position_returns_empty_intervals(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Returns no intervals when fewer than two samples exist."""
        one_position = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=0.0),
        ]
        intervals = parquet_storage._infer_pause_intervals(one_position, empty_wards)
        assert intervals == []

    def test_non_contiguous_pause_regions_with_same_game_time_split(
        self,
        parquet_storage: ParquetStorage,
        empty_wards: list[WardEvent],
    ) -> None:
        """Splits pause intervals when a non-paused segment appears between freezes."""
        positions = [
            PositionSample(tick=0, hero="Axe", handle=1, team=2, x=0.0, y=0.0, game_time=0.0),
            PositionSample(tick=30, hero="Axe", handle=1, team=2, x=1.0, y=1.0, game_time=1.0),
            PositionSample(tick=60, hero="Axe", handle=1, team=2, x=2.0, y=2.0, game_time=1.0),
            PositionSample(tick=90, hero="Axe", handle=1, team=2, x=3.0, y=3.0, game_time=2.0),
            PositionSample(tick=120, hero="Axe", handle=1, team=2, x=4.0, y=4.0, game_time=1.0),
            PositionSample(tick=150, hero="Axe", handle=1, team=2, x=5.0, y=5.0, game_time=1.0),
            PositionSample(tick=180, hero="Axe", handle=1, team=2, x=6.0, y=6.0, game_time=2.0),
        ]

        intervals = parquet_storage._infer_pause_intervals(positions, empty_wards)

        assert len(intervals) == 2
        assert intervals[0]["replay_start_time"] == pytest.approx(1.0)
        assert intervals[0]["replay_end_time"] == pytest.approx(2.0)
        assert intervals[1]["replay_start_time"] == pytest.approx(4.0)
        assert intervals[1]["replay_end_time"] == pytest.approx(5.0)
        assert intervals[0]["game_time"] == pytest.approx(1.0)
        assert intervals[1]["game_time"] == pytest.approx(1.0)


class TestGameTimeResolution:
    """Coverage for resolve_game_time helper behavior."""

    def test_uses_game_time_when_column_present(self) -> None:
        """Prefers explicit game_time values when available."""
        row = pd.Series({"tick": 90, "game_time": 12.5})
        assert resolve_game_time(row, tick=90) == pytest.approx(12.5)

    def test_falls_back_to_tick_when_game_time_column_missing(self) -> None:
        """Falls back to tick/30 when row has no game_time field."""
        row = pd.Series({"tick": 90, "hero": "Axe"})
        assert resolve_game_time(row, tick=90) == pytest.approx(3.0)

    def test_falls_back_to_tick_when_game_time_is_nan(self) -> None:
        """Falls back to tick/30 when game_time is NaN."""
        row = pd.Series({"tick": 90, "game_time": math.nan})
        assert resolve_game_time(row, tick=90) == pytest.approx(3.0)


class TestTimeBasis:
    """Coverage for build_time_basis output contract."""

    @pytest.fixture
    def pause_intervals(self) -> list[dict[str, float]]:
        """Provide a stable pause interval payload for basis assertions."""
        return [
            {
                "replay_start_time": 1.0,
                "replay_end_time": 2.0,
                "game_time": -89.0,
                "duration_seconds": 1.0,
            }
        ]

    def test_contract_version_uses_game_time_basis(self, pause_intervals: list[dict[str, float]]) -> None:
        """Uses game_time basis when contract version exists and game_time is present."""
        basis = build_time_basis(
            metadata={"time_contract_version": "v1", "ticks_per_second": 30, "game_start_time": 90.0},
            has_game_time=True,
            offset_seconds=90.0,
            clock_zero_source="metadata",
            pause_intervals=pause_intervals,
        )
        assert basis["basis"] == "game_time"

    def test_no_contract_version_uses_tick_fallback_basis(self, pause_intervals: list[dict[str, float]]) -> None:
        """Uses tick_fallback basis when contract version is absent."""
        basis = build_time_basis(
            metadata={"ticks_per_second": 30},
            has_game_time=True,
            offset_seconds=90.0,
            clock_zero_source="sample_inference",
            pause_intervals=pause_intervals,
        )
        assert basis["basis"] == "tick_fallback"
        assert basis["contract_version"] == "legacy"

    def test_uses_metadata_game_start_time_when_present(self, pause_intervals: list[dict[str, float]]) -> None:
        """Keeps metadata game_start_time in time_basis when provided."""
        basis = build_time_basis(
            metadata={"time_contract_version": "v1", "game_start_time": 88.5},
            has_game_time=True,
            offset_seconds=90.0,
            clock_zero_source="metadata",
            pause_intervals=pause_intervals,
        )
        assert basis["game_start_time"] == pytest.approx(88.5)

    def test_falls_back_to_offset_when_metadata_game_start_missing(
        self,
        pause_intervals: list[dict[str, float]],
    ) -> None:
        """Uses offset_seconds as game_start_time fallback when metadata is missing it."""
        basis = build_time_basis(
            metadata={"time_contract_version": "v1", "ticks_per_second": 30},
            has_game_time=False,
            offset_seconds=91.25,
            clock_zero_source="sample_inference",
            pause_intervals=pause_intervals,
        )
        assert basis["basis"] == "tick_fallback"
        assert basis["game_start_time"] == pytest.approx(91.25)


class TestOffsetResolution:
    """Coverage for resolve_offset_seconds priority and fallback behavior."""

    def test_uses_metadata_game_start_time(self) -> None:
        """Resolves offset from metadata when game_start_time exists."""
        offset, source = resolve_offset_seconds(
            metadata={"game_start_time": 90.0, "clock_zero_source": "metadata"},
            primary_df=pd.DataFrame(),
        )
        assert offset == pytest.approx(90.0)
        assert source == "metadata"

    def test_infers_offset_from_samples_when_metadata_missing(self) -> None:
        """Infers offset from sample time-game_time delta when metadata is missing."""
        samples = pd.DataFrame(
            [
                {"tick": 0, "game_time": -90.0},
                {"tick": 30, "game_time": -89.0},
                {"tick": 60, "game_time": -88.0},
            ]
        )
        offset, source = resolve_offset_seconds(
            metadata={},
            primary_df=samples,
        )
        assert offset == pytest.approx(90.0)
        assert source == "sample_inference"

    def test_returns_zero_fallback_when_no_usable_data(self) -> None:
        """Returns fallback offset when metadata and samples are both unusable."""
        offset, source = resolve_offset_seconds(
            metadata={},
            primary_df=pd.DataFrame(columns=["tick", "game_time"]),
        )
        assert offset == pytest.approx(0.0)
        assert source == "fallback"


class TestTwoSampleTimeAxisRegression:
    """SN-3 regression checks on two parsed sample matches."""

    @pytest.mark.parametrize("match_id", REPO_MATCH_SAMPLES)
    def test_sample_has_negative_game_time_before_zero(self, match_id: int) -> None:
        """Each sample must contain pre-zero negative game_time values."""
        positions_path = REPO_MATCHES_DIR / str(match_id) / "positions.parquet"
        if not positions_path.exists():
            pytest.skip(f"Sample match {match_id} positions.parquet not found")

        df = pd.read_parquet(positions_path, columns=["game_time"])
        assert not df.empty
        assert float(df["game_time"].min()) < 0.0

    @pytest.mark.parametrize("match_id", REPO_MATCH_SAMPLES)
    def test_sample_has_near_zero_alignment_point(self, match_id: int) -> None:
        """Each sample must include a point near game_time=0 for timeline alignment."""
        positions_path = REPO_MATCHES_DIR / str(match_id) / "positions.parquet"
        if not positions_path.exists():
            pytest.skip(f"Sample match {match_id} positions.parquet not found")

        df = pd.read_parquet(positions_path, columns=["game_time"])
        assert not df.empty
        closest = float(df["game_time"].abs().min())
        assert closest <= 1.0

    @pytest.mark.parametrize("match_id", REPO_MATCH_SAMPLES)
    def test_sample_game_time_non_decreasing_by_tick(self, match_id: int) -> None:
        """game_time should be non-decreasing by tick (allowing pause freeze)."""
        positions_path = REPO_MATCHES_DIR / str(match_id) / "positions.parquet"
        if not positions_path.exists():
            pytest.skip(f"Sample match {match_id} positions.parquet not found")

        df = pd.read_parquet(positions_path, columns=["tick", "game_time"])
        assert not df.empty

        tick_series = (
            df[["tick", "game_time"]]
            .dropna(subset=["tick", "game_time"])
            .sort_values("tick")
            .drop_duplicates(subset=["tick"], keep="first")
        )
        deltas = tick_series["game_time"].diff().dropna()
        assert bool((deltas >= -1e-4).all())

    @pytest.mark.parametrize("match_id", REPO_MATCH_SAMPLES)
    def test_sample_metadata_pause_intervals_shape(self, match_id: int) -> None:
        """Metadata pause_intervals payload should keep normalized required fields."""
        meta_path = REPO_MATCHES_DIR / str(match_id) / "meta.json"
        if not meta_path.exists():
            pytest.skip(f"Sample match {match_id} meta.json not found")

        with meta_path.open("r", encoding="utf-8") as f:
            metadata = json.load(f)

        pause_intervals = metadata.get("pause_intervals") or []
        assert isinstance(pause_intervals, list)
        for interval in pause_intervals:
            assert {"replay_start_time", "replay_end_time", "game_time", "duration_seconds"}.issubset(
                interval.keys()
            )

    def test_8736891827_opening_samples_stay_in_pregame_window(self) -> None:
        """Regression: 8736891827 should no longer start at a shifted +9:40 clock."""
        positions_path = REPO_MATCHES_DIR / "8736891827" / "positions.parquet"
        if not positions_path.exists():
            pytest.skip("Sample match 8736891827 positions.parquet not found")

        df = pd.read_parquet(positions_path, columns=["tick", "game_time", "hero", "level"])
        assert not df.empty

        opening_tick = int(df["tick"].min())
        opening_rows = df[df["tick"] == opening_tick]
        assert not opening_rows.empty
        assert float(opening_rows["game_time"].min()) < 0.0
        assert float(opening_rows["game_time"].max()) < 0.0
        assert int(opening_rows["level"].max()) == 1

    def test_8736891827_pause_interval_extends_into_negative_time(self) -> None:
        """Regression: the long opening pause should be visible before 0:00 on the timeline."""
        meta_path = REPO_MATCHES_DIR / "8736891827" / "meta.json"
        if not meta_path.exists():
            pytest.skip("Sample match 8736891827 meta.json not found")

        with meta_path.open("r", encoding="utf-8") as f:
            metadata = json.load(f)

        pause_intervals = metadata.get("pause_intervals") or []
        assert pause_intervals
        first_interval = pause_intervals[0]
        assert float(first_interval["game_time"]) < 0.0
        assert float(first_interval["duration_seconds"]) > 600.0

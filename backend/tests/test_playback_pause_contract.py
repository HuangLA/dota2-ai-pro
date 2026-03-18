"""Tests for pause-aware playback time contract."""

from collections.abc import Mapping

import pandas as pd
import pytest

from routers import playback


class _FakeParquetStorage:
    def __init__(
        self,
        metadata: Mapping[str, object],
        positions: pd.DataFrame,
        wards: pd.DataFrame,
        economy: pd.DataFrame | None = None,
    ) -> None:
        self._metadata = dict(metadata)
        self._positions = positions
        self._wards = wards
        self._economy = economy if economy is not None else pd.DataFrame()

    def match_exists(self, match_id: int) -> bool:
        return match_id == 1

    def get_metadata(self, match_id: int) -> dict[str, object]:
        return self._metadata

    def get_positions(self, match_id: int, start_tick=None, end_tick=None, hero=None, team=None) -> pd.DataFrame:
        df = self._positions.copy()
        if start_tick is not None:
            df = df[df["tick"] >= start_tick]
        if end_tick is not None:
            df = df[df["tick"] <= end_tick]
        if hero is not None:
            df = df[df["hero"] == hero]
        if team is not None:
            df = df[df["team"] == team]
        return df

    def get_wards(self, match_id: int, ward_type=None, team=None) -> pd.DataFrame:
        df = self._wards.copy()
        if ward_type is not None:
            df = df[df["ward_type"] == ward_type]
        if team is not None:
            df = df[df["team"] == team]
        return df

    def get_kills(self, match_id: int) -> pd.DataFrame:
        return pd.DataFrame()

    def get_economy(self, match_id: int) -> pd.DataFrame:
        return self._economy.copy()


@pytest.mark.asyncio
async def test_no_pause_regression_returns_empty_pause_intervals(monkeypatch: pytest.MonkeyPatch) -> None:
    metadata = {
        "time_contract_version": "v1",
        "ticks_per_second": 30,
        "game_start_time": 90.0,
        "clock_zero_source": "metadata",
    }
    positions = pd.DataFrame(
        [
            {"tick": 0, "hero": "Axe", "handle": 1, "team": 2, "x": 0.0, "y": 0.0, "game_time": -90.0},
            {"tick": 30, "hero": "Axe", "handle": 1, "team": 2, "x": 1.0, "y": 1.0, "game_time": -89.0},
            {"tick": 60, "hero": "Axe", "handle": 1, "team": 2, "x": 2.0, "y": 2.0, "game_time": -88.0},
        ]
    )
    wards = pd.DataFrame(columns=["type", "ward_type", "tick", "handle", "x", "y", "team", "game_time"])

    monkeypatch.setattr(playback, "parquet_storage", _FakeParquetStorage(metadata, positions, wards))

    response = await playback.get_ticks(match_id=1, start_time=-90, end_time=None, hero=None, team=None, interval=1)
    advantage_response = await playback.get_advantage(match_id=1, start_time=None, end_time=None)

    assert response["pause_intervals"] == []
    assert response["time_basis"]["pause_intervals"] == []
    assert advantage_response["time_basis"]["pause_intervals"] == []
    assert [tick["game_time"] for tick in response["ticks"]] == [-90.0, -89.0, -88.0]
    assert [tick["time"] for tick in response["ticks"]] == [0.0, 1.0, 2.0]


@pytest.mark.asyncio
async def test_pause_intervals_inferred_for_ticks_and_wards(monkeypatch: pytest.MonkeyPatch) -> None:
    metadata = {
        "time_contract_version": "v1",
        "ticks_per_second": 30,
        "game_start_time": 90.0,
        "clock_zero_source": "metadata",
    }
    positions = pd.DataFrame(
        [
            {"tick": 0, "hero": "Axe", "handle": 1, "team": 2, "x": 0.0, "y": 0.0, "game_time": -90.0},
            {"tick": 30, "hero": "Axe", "handle": 1, "team": 2, "x": 1.0, "y": 1.0, "game_time": -89.0},
            {"tick": 60, "hero": "Axe", "handle": 1, "team": 2, "x": 2.0, "y": 2.0, "game_time": -89.0},
            {"tick": 90, "hero": "Axe", "handle": 1, "team": 2, "x": 3.0, "y": 3.0, "game_time": -89.0},
            {"tick": 120, "hero": "Axe", "handle": 1, "team": 2, "x": 4.0, "y": 4.0, "game_time": -88.0},
        ]
    )
    wards = pd.DataFrame(
        [
            {"type": "placed", "ward_type": "observer", "tick": 60, "handle": 11, "x": 10.0, "y": 10.0, "team": 2, "game_time": -89.0},
            {"type": "destroyed", "ward_type": "observer", "tick": 120, "handle": 11, "x": 10.0, "y": 10.0, "team": 2, "game_time": -88.0},
        ]
    )

    monkeypatch.setattr(playback, "parquet_storage", _FakeParquetStorage(metadata, positions, wards))

    ticks_response = await playback.get_ticks(match_id=1, start_time=-90, end_time=None, hero=None, team=None, interval=1)
    wards_response = await playback.get_wards(match_id=1, start_tick=None, end_tick=None, team=None, ward_type=None)
    advantage_response = await playback.get_advantage(match_id=1, start_time=None, end_time=None)

    interval = ticks_response["pause_intervals"][0]
    assert pytest.approx(interval["replay_start_time"], abs=1e-6) == 1.0
    assert pytest.approx(interval["replay_end_time"], abs=1e-6) == 3.0
    assert pytest.approx(interval["duration_seconds"], abs=1e-6) == 2.0
    assert ticks_response["pause_intervals"] == wards_response["pause_intervals"]
    assert ticks_response["time_basis"]["pause_intervals"] == ticks_response["pause_intervals"]
    assert wards_response["time_basis"]["pause_intervals"] == wards_response["pause_intervals"]
    assert advantage_response["time_basis"]["pause_intervals"] == ticks_response["pause_intervals"]
    assert [tick["time"] for tick in ticks_response["ticks"]] == sorted(tick["time"] for tick in ticks_response["ticks"])


@pytest.mark.asyncio
async def test_time_filters_follow_game_time_with_pause(monkeypatch: pytest.MonkeyPatch) -> None:
    metadata = {
        "time_contract_version": "v1",
        "ticks_per_second": 30,
        "game_start_time": 90.0,
        "clock_zero_source": "metadata",
    }
    positions = pd.DataFrame(
        [
            {"tick": 0, "hero": "Axe", "handle": 1, "team": 2, "x": 0.0, "y": 0.0, "game_time": -90.0},
            {"tick": 30, "hero": "Axe", "handle": 1, "team": 2, "x": 1.0, "y": 1.0, "game_time": -89.0},
            {"tick": 60, "hero": "Axe", "handle": 1, "team": 2, "x": 2.0, "y": 2.0, "game_time": -89.0},
            {"tick": 90, "hero": "Axe", "handle": 1, "team": 2, "x": 3.0, "y": 3.0, "game_time": -89.0},
            {"tick": 120, "hero": "Axe", "handle": 1, "team": 2, "x": 4.0, "y": 4.0, "game_time": -88.0},
        ]
    )
    wards = pd.DataFrame(
        [
            {"type": "placed", "ward_type": "observer", "tick": 30, "handle": 11, "x": 10.0, "y": 10.0, "team": 2, "game_time": -89.0},
            {"type": "destroyed", "ward_type": "observer", "tick": 90, "handle": 11, "x": 10.0, "y": 10.0, "team": 2, "game_time": -89.0},
            {"type": "placed", "ward_type": "sentry", "tick": 120, "handle": 12, "x": 11.0, "y": 11.0, "team": 3, "game_time": -88.0},
        ]
    )

    monkeypatch.setattr(playback, "parquet_storage", _FakeParquetStorage(metadata, positions, wards))

    ticks_response = await playback.get_ticks(match_id=1, start_time=-89, end_time=-88, hero=None, team=None, interval=1)
    wards_response = await playback.get_wards(match_id=1, start_tick=90, end_tick=120, team=None, ward_type=None)

    assert [tick["tick"] for tick in ticks_response["ticks"]] == [30, 60, 90, 120]
    assert [tick["game_time"] for tick in ticks_response["ticks"]] == [-89.0, -89.0, -89.0, -88.0]
    assert [ward["tick"] for ward in wards_response["wards"]] == [90, 120]

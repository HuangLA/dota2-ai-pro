"""Tests for duration source consistency between matches endpoints."""

from types import SimpleNamespace

import pytest

from routers import matches as matches_router


def _make_match(match_id: int, duration: int, parse_status: str = "completed") -> SimpleNamespace:
    return SimpleNamespace(
        match_id=match_id,
        start_time=1,
        duration=duration,
        winner_team=2,
        radiant_score=10,
        dire_score=5,
        game_mode=22,
        patch_version=None,
        league_id=None,
        replay_path=None,
        parse_status=parse_status,
        created_at=1,
        updated_at=1,
    )


@pytest.mark.parametrize(
    "meta,fallback,expected",
    [
        ({"duration_seconds": 1800}, 3500, 3500),
        ({"duration_seconds": 1800.8}, 3500, 3500),
        ({"duration_seconds": 0}, 3500, 3500),
        ({"duration_seconds": -5}, 3500, 3500),
        ({"duration_seconds": "1800"}, 3500, 3500),
        (None, 3500, 3500),
        ({"duration_seconds": 4000}, 3500, 4000),  # meta larger than fallback
    ],
)
def test_resolve_duration_seconds(meta: dict | None, fallback: int, expected: int) -> None:
    assert matches_router._resolve_duration_seconds(meta, fallback) == expected


@pytest.mark.asyncio
async def test_list_matches_prefers_parquet_duration_with_sqlite_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    sqlite_matches = [
        _make_match(101, duration=3500, parse_status="completed"),
        _make_match(102, duration=3600, parse_status="completed"),
        _make_match(103, duration=120, parse_status="pending"),
    ]

    class FakeMatchStorage:
        def list_matches(self, **kwargs):
            return sqlite_matches

        def count_matches(self, **kwargs):
            return len(sqlite_matches)

    class FakeParquetStorage:
        def get_metadata(self, match_id: int):
            if match_id == 101:
                return {"duration_seconds": 1800}
            if match_id == 102:
                return {"duration_seconds": None}
            return None

    monkeypatch.setattr(matches_router, "match_storage", FakeMatchStorage())
    monkeypatch.setattr(matches_router, "parquet_storage", FakeParquetStorage())

    response = await matches_router.list_matches(limit=20, offset=0)

    durations = {item.match_id: item.duration for item in response.matches}
    assert durations[101] == 3500
    assert durations[102] == 3600
    assert durations[103] == 120

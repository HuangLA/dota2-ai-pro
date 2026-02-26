"""Tests for OpenDota reference storage (teams/leagues)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from database.sqlite_db import close_database, init_database
from storage.opendota_reference_storage import OpenDotaReferenceStorage


@pytest.fixture(autouse=True)
def db() -> Iterator[None]:
    init_database(":memory:")
    yield
    close_database()


def test_upsert_teams_is_idempotent() -> None:
    storage = OpenDotaReferenceStorage()
    teams = [
        {"team_id": 1, "name": "Team One", "tag": "ONE", "wins": 10, "losses": 2},
        {"team_id": 2, "name": "Team Two", "tag": "TWO", "wins": 8, "losses": 4},
    ]

    assert storage.upsert_teams(teams) == (2, 0)
    assert storage.upsert_teams(teams) == (0, 0)


def test_upsert_leagues_is_idempotent() -> None:
    storage = OpenDotaReferenceStorage()
    leagues = [
        {"leagueid": 100, "name": "Dream League", "tier": "professional"},
        {"leagueid": 200, "name": "Elite League", "tier": "premium"},
    ]

    assert storage.upsert_leagues(leagues) == (2, 0)
    assert storage.upsert_leagues(leagues) == (0, 0)


def test_list_teams_and_leagues_pagination() -> None:
    storage = OpenDotaReferenceStorage()
    storage.upsert_teams(
        [
            {"team_id": 10, "name": "A", "tag": "A", "wins": 1, "losses": 0},
            {"team_id": 20, "name": "B", "tag": "B", "wins": 2, "losses": 1},
            {"team_id": 30, "name": "C", "tag": "C", "wins": 3, "losses": 2},
        ]
    )
    storage.upsert_leagues(
        [
            {"leagueid": 11, "name": "L1", "tier": "professional"},
            {"leagueid": 12, "name": "L2", "tier": "professional"},
        ]
    )

    team_total, team_records = storage.list_teams(limit=2, offset=1)
    league_total, league_records = storage.list_leagues(limit=1, offset=0)

    assert team_total == 3
    assert [row["team_id"] for row in team_records] == [20, 30]
    assert league_total == 2
    assert [row["leagueid"] for row in league_records] == [11]

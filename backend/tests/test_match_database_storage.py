"""Tests for match database aggregated query storage."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from database.sqlite_db import close_database, get_connection, init_database
from storage.match_database_storage import MatchDatabaseStorage
from storage.opendota_match_storage import OpenDotaMatchStorage


@pytest.fixture(autouse=True)
def db() -> Iterator[None]:
    init_database(":memory:")
    yield
    close_database()


def _seed_matches() -> None:
    OpenDotaMatchStorage().upsert_recent_matches(
        [
            {
                "match_id": 9001,
                "start_time": 1701000001,
                "duration": 2400,
                "radiant_team": 15,
                "dire_team": 2163,
                "leagueid": 15475,
                "radiant_name": "Liquid Fallback",
                "dire_name": "Falcons Fallback",
                "league_name": "DreamLeague Fallback",
            },
            {
                "match_id": 9002,
                "start_time": 1701000002,
                "duration": 2450,
                "radiant_team": 39,
                "dire_team": 15,
                "leagueid": 15475,
            },
            {
                "match_id": 9003,
                "start_time": 1701000003,
                "duration": 2500,
                "radiant_team": 111,
                "dire_team": 222,
                "leagueid": 16000,
                "radiant_name": "Fallback Radiant 111",
                "dire_name": "Fallback Dire 222",
                "league_name": "Fallback League 16000",
            },
            {
                "match_id": 9004,
                "start_time": 1701000004,
                "duration": 2200,
                "radiant_team": 15,
                "dire_team": 999,
            },
        ]
    )


def _insert_task(
    *,
    task_id: str,
    match_id: int,
    status: str,
    attempt_count: int,
    download_path: str | None,
    created_at: int,
    updated_at: int,
) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO replay_download_tasks (
            task_id, match_id, status, attempt_count, replay_url, download_path,
            error_code, error_message, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)
        """,
        (task_id, match_id, status, attempt_count, download_path, created_at, updated_at),
    )
    conn.commit()


def _seed_reference_names() -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO opendota_teams (team_id, name, tag, wins, losses, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (15, "Team Liquid", "TL", 1, 1, 1700000000),
    )
    cursor.execute(
        """
        INSERT INTO opendota_teams (team_id, name, tag, wins, losses, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (2163, "Team Falcons", "FLCN", 1, 1, 1700000000),
    )
    cursor.execute(
        """
        INSERT INTO opendota_leagues (leagueid, name, tier, last_synced_at)
        VALUES (?, ?, ?, ?)
        """,
        (15475, "DreamLeague Season 26", "professional", 1700000000),
    )
    conn.commit()


def test_list_match_database_returns_basic_aggregated_structure() -> None:
    _seed_matches()
    _seed_reference_names()
    _insert_task(
        task_id="task-old",
        match_id=9001,
        status="prepared",
        attempt_count=1,
        download_path=None,
        created_at=100,
        updated_at=100,
    )
    _insert_task(
        task_id="task-new",
        match_id=9001,
        status="completed",
        attempt_count=2,
        download_path="backend/data/replays/9001.dem.bz2",
        created_at=200,
        updated_at=200,
    )

    total, records = MatchDatabaseStorage().list_match_database(limit=10, offset=0)

    assert total == 3
    assert len(records) == 3
    assert 9004 not in [record["match_id"] for record in records]
    first = next(record for record in records if record["match_id"] == 9001)
    assert first["download_status"] == "completed"
    assert first["download_task_id"] == "task-new"
    assert first["download_attempt_count"] == 2
    assert first["download_path"] == "backend/data/replays/9001.dem.bz2"
    assert first["radiant_team_name"] == "Team Liquid"
    assert first["dire_team_name"] == "Team Falcons"
    assert first["league_name"] == "DreamLeague Season 26"
    no_task = next(record for record in records if record["match_id"] == 9003)
    assert no_task["download_status"] is None
    assert no_task["download_task_id"] is None
    assert no_task["download_attempt_count"] is None
    assert no_task["download_path"] is None
    assert no_task["radiant_team_name"] == "Fallback Radiant 111"
    assert no_task["dire_team_name"] == "Fallback Dire 222"
    assert no_task["league_name"] == "Fallback League 16000"


def test_list_match_database_filters_team_and_league() -> None:
    _seed_matches()

    storage = MatchDatabaseStorage()
    total_team, team_records = storage.list_match_database(limit=10, offset=0, team_id=15)
    total_league, league_records = storage.list_match_database(
        limit=10,
        offset=0,
        leagueid=16000,
    )

    assert total_team == 2
    assert [record["match_id"] for record in team_records] == [9002, 9001]
    assert total_league == 1
    assert [record["match_id"] for record in league_records] == [9003]


def test_list_match_database_filters_start_time_range() -> None:
    _seed_matches()

    total, records = MatchDatabaseStorage().list_match_database(
        limit=10,
        offset=0,
        start_time_from=1701000002,
        start_time_to=1701000003,
    )

    assert total == 2
    assert [record["match_id"] for record in records] == [9003, 9002]


def test_list_match_database_professional_only_false_includes_public_like_rows() -> None:
    _seed_matches()

    total, records = MatchDatabaseStorage().list_match_database(
        limit=10,
        offset=0,
        professional_only=False,
    )

    assert total == 4
    assert [record["match_id"] for record in records] == [9004, 9003, 9002, 9001]


def test_list_match_database_filters_has_download_true_false() -> None:
    _seed_matches()
    _insert_task(
        task_id="task-a",
        match_id=9001,
        status="prepared",
        attempt_count=0,
        download_path=None,
        created_at=100,
        updated_at=100,
    )

    storage = MatchDatabaseStorage()
    total_has, has_records = storage.list_match_database(limit=10, offset=0, has_download=True)
    total_none, none_records = storage.list_match_database(limit=10, offset=0, has_download=False)

    assert total_has == 1
    assert [record["match_id"] for record in has_records] == [9001]
    assert total_none == 2
    assert [record["match_id"] for record in none_records] == [9003, 9002]

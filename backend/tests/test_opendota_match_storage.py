"""Tests for OpenDota recent match persistence/upsert behavior."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from database.sqlite_db import close_database, get_connection, init_database
from storage.opendota_match_storage import OpenDotaMatchStorage


@pytest.fixture(autouse=True)
def db() -> Iterator[None]:
    init_database(":memory:")
    yield
    close_database()


def test_upsert_recent_matches_is_idempotent() -> None:
    storage = OpenDotaMatchStorage()
    batch = [
        {
            "match_id": 101,
            "start_time": 1700000001,
            "duration": 2200,
            "radiant_team": 15,
            "dire_team": 25,
            "leagueid": 1,
        },
        {
            "match_id": 102,
            "start_time": 1700000002,
            "duration": 2300,
            "radiant_team": 16,
            "dire_team": 26,
            "leagueid": 2,
        },
    ]

    inserted_first, updated_first = storage.upsert_recent_matches(batch)
    assert (inserted_first, updated_first) == (2, 0)

    inserted_second, updated_second = storage.upsert_recent_matches(batch)
    assert (inserted_second, updated_second) == (0, 0)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS cnt FROM opendota_matches")
    assert cursor.fetchone()["cnt"] == 2


def test_upsert_recent_matches_updates_changed_rows() -> None:
    storage = OpenDotaMatchStorage()
    storage.upsert_recent_matches(
        [
            {
                "match_id": 201,
                "start_time": 1700000100,
                "duration": 2100,
                "radiant_team": 30,
                "dire_team": 40,
                "leagueid": 9,
            }
        ]
    )

    inserted, updated = storage.upsert_recent_matches(
        [
            {
                "match_id": 201,
                "start_time": 1700000100,
                "duration": 2150,
                "radiant_team": 30,
                "dire_team": 40,
                "leagueid": 9,
            }
        ]
    )
    assert (inserted, updated) == (0, 1)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT duration FROM opendota_matches WHERE match_id = 201")
    assert cursor.fetchone()["duration"] == 2150


def test_list_recent_matches_returns_total_and_pagination() -> None:
    storage = OpenDotaMatchStorage()
    storage.upsert_recent_matches(
        [
            {
                "match_id": 301,
                "start_time": 1700000301,
                "duration": 2101,
                "radiant_team": 11,
                "dire_team": 21,
                "leagueid": 31,
            },
            {
                "match_id": 302,
                "start_time": 1700000303,
                "duration": 2102,
                "radiant_team": 12,
                "dire_team": 22,
                "leagueid": 32,
            },
            {
                "match_id": 303,
                "start_time": 1700000302,
                "duration": 2103,
                "radiant_team": 13,
                "dire_team": 23,
                "leagueid": 33,
            },
        ]
    )

    total, page = storage.list_recent_matches(limit=2, offset=1)

    assert total == 3
    assert len(page) == 2
    assert page[0]["match_id"] == 303
    assert page[1]["match_id"] == 301
    assert page[0]["last_synced_at"] is not None
    assert page[0]["last_synced_at"] > 0


def test_list_recent_matches_filters_by_team_id() -> None:
    storage = OpenDotaMatchStorage()
    storage.upsert_recent_matches(
        [
            {
                "match_id": 401,
                "start_time": 1700000401,
                "duration": 2101,
                "radiant_team": 101,
                "dire_team": 201,
                "leagueid": 41,
            },
            {
                "match_id": 402,
                "start_time": 1700000402,
                "duration": 2102,
                "radiant_team": 102,
                "dire_team": 101,
                "leagueid": 42,
            },
            {
                "match_id": 403,
                "start_time": 1700000403,
                "duration": 2103,
                "radiant_team": 103,
                "dire_team": 203,
                "leagueid": 43,
            },
        ]
    )

    total, page = storage.list_recent_matches(limit=10, offset=0, team_id=101)

    assert total == 2
    assert [row["match_id"] for row in page] == [402, 401]


def test_list_recent_matches_filters_by_league_and_time_range() -> None:
    storage = OpenDotaMatchStorage()
    storage.upsert_recent_matches(
        [
            {
                "match_id": 501,
                "start_time": 1700000501,
                "duration": 2201,
                "radiant_team": 111,
                "dire_team": 211,
                "leagueid": 99,
            },
            {
                "match_id": 502,
                "start_time": 1700000502,
                "duration": 2202,
                "radiant_team": 112,
                "dire_team": 212,
                "leagueid": 99,
            },
            {
                "match_id": 503,
                "start_time": 1700000600,
                "duration": 2203,
                "radiant_team": 113,
                "dire_team": 213,
                "leagueid": 100,
            },
        ]
    )

    total, page = storage.list_recent_matches(
        limit=10,
        offset=0,
        leagueid=99,
        start_time_from=1700000502,
        start_time_to=1700000600,
    )

    assert total == 1
    assert len(page) == 1
    assert page[0]["match_id"] == 502


def test_upsert_recent_matches_persists_name_fields_and_tracks_name_updates() -> None:
    storage = OpenDotaMatchStorage()
    inserted, updated = storage.upsert_recent_matches(
        [
            {
                "match_id": 701,
                "start_time": 1700000701,
                "duration": 2100,
                "radiant_team": 15,
                "dire_team": 2163,
                "leagueid": 15475,
                "radiant_name": "Team Liquid",
                "dire_name": "Team Falcons",
                "league_name": "DreamLeague S26",
            }
        ]
    )
    assert (inserted, updated) == (1, 0)

    inserted_2, updated_2 = storage.upsert_recent_matches(
        [
            {
                "match_id": 701,
                "start_time": 1700000701,
                "duration": 2100,
                "radiant_team": 15,
                "dire_team": 2163,
                "leagueid": 15475,
                "radiant_name": "Team Liquid Updated",
                "dire_name": "Team Falcons",
                "league_name": "DreamLeague S26",
            }
        ]
    )
    assert (inserted_2, updated_2) == (0, 1)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT radiant_team_name, dire_team_name, league_name
        FROM opendota_matches
        WHERE match_id = 701
        """
    )
    row = cursor.fetchone()
    assert row["radiant_team_name"] == "Team Liquid Updated"
    assert row["dire_team_name"] == "Team Falcons"
    assert row["league_name"] == "DreamLeague S26"


def test_upsert_match_detail_extracts_nested_team_and_league_names() -> None:
    storage = OpenDotaMatchStorage()

    inserted, updated = storage.upsert_match_detail(
        {
            "match_id": 702,
            "start_time": 1700000702,
            "duration": 2200,
            "radiant_team_id": 15,
            "dire_team_id": 2163,
            "leagueid": 15475,
            "radiant_team": {"name": "Team Liquid"},
            "dire_team": {"name": "Team Falcons"},
            "league": {"name": "DreamLeague Season 26"},
        }
    )

    assert (inserted, updated) == (1, 0)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT radiant_team_name, dire_team_name, league_name
        FROM opendota_matches
        WHERE match_id = 702
        """
    )
    row = cursor.fetchone()
    assert row["radiant_team_name"] == "Team Liquid"
    assert row["dire_team_name"] == "Team Falcons"
    assert row["league_name"] == "DreamLeague Season 26"


def test_upsert_recent_matches_tracks_source_and_icon_urls() -> None:
    storage = OpenDotaMatchStorage()

    inserted, updated = storage.upsert_recent_matches(
        [
            {
                "match_id": 801,
                "start_time": 1700000801,
                "duration": 2100,
                "radiant_team": {"name": "R", "logo_url": "r.png"},
                "dire_team": {"name": "D", "logo_url": "d.png"},
                "league": {"name": "L", "image_url": "l.png"},
            }
        ],
        source="public",
    )
    assert (inserted, updated) == (1, 0)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT source, radiant_logo_url, dire_logo_url, league_icon_url
        FROM opendota_matches
        WHERE match_id = 801
        """
    )
    row = cursor.fetchone()
    assert row["source"] == "public"
    assert row["radiant_logo_url"] == "r.png"
    assert row["dire_logo_url"] == "d.png"
    assert row["league_icon_url"] == "l.png"


def test_list_recent_matches_filters_by_source_flags() -> None:
    storage = OpenDotaMatchStorage()
    storage.upsert_recent_matches(
        [{"match_id": 901, "start_time": 1, "duration": 1}],
        source="pro",
    )
    storage.upsert_recent_matches(
        [{"match_id": 902, "start_time": 2, "duration": 1}],
        source="public",
    )

    total_pro, records_pro = storage.list_recent_matches(
        limit=10,
        offset=0,
        include_pro=True,
        include_public=False,
    )
    assert total_pro == 1
    assert [row["match_id"] for row in records_pro] == [901]

    total_public, records_public = storage.list_recent_matches(
        limit=10,
        offset=0,
        include_pro=False,
        include_public=True,
    )
    assert total_public == 1
    assert [row["match_id"] for row in records_public] == [902]

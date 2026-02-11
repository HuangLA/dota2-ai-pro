"""Tests for match list search & filter functionality."""

import sqlite3
import time

import pytest

from database.sqlite_db import init_database, close_database
from storage.match_storage import MatchStorage


@pytest.fixture(autouse=True)
def db():
    """Create an in-memory SQLite database for each test."""
    init_database(":memory:")
    yield
    close_database()


@pytest.fixture()
def storage() -> MatchStorage:
    return MatchStorage()


def _seed(storage: MatchStorage) -> None:
    """Insert deterministic test data: 3 matches, players, and teams."""
    from database.sqlite_db import get_connection

    conn = get_connection()
    cur = conn.cursor()
    now = int(time.time())

    # -- matches --
    for mid in (1001, 1002, 1003):
        cur.execute(
            """INSERT INTO matches
               (match_id, start_time, duration, game_mode, winner_team,
                league_id, parse_status, created_at, updated_at)
               VALUES (?, ?, 3000, 22, 2, ?, 'completed', ?, ?)""",
            (mid, now, mid % 10, now - (1003 - mid), now),
        )

    # -- player_matches --
    rows = [
        # match 1001: hero 1, account 100
        (1001, 100, 1, 0, 2),
        (1001, 200, 2, 1, 3),
        # match 1002: hero 1, account 200
        (1002, 200, 1, 0, 2),
        (1002, 300, 3, 1, 3),
        # match 1003: hero 3, account 300
        (1003, 300, 3, 0, 2),
        (1003, 400, 4, 1, 3),
    ]
    cur.executemany(
        """INSERT INTO player_matches
           (match_id, account_id, hero_id, player_slot, team_id)
           VALUES (?, ?, ?, ?, ?)""",
        rows,
    )

    # -- teams & team_matches --
    cur.execute("INSERT INTO teams (team_id, team_name) VALUES (10, 'Team A')")
    cur.execute("INSERT INTO teams (team_id, team_name) VALUES (20, 'Team B')")
    cur.executemany(
        """INSERT INTO team_matches (match_id, team_id, is_radiant, is_winner)
           VALUES (?, ?, ?, ?)""",
        [
            (1001, 10, 1, 1),
            (1001, 20, 0, 0),
            (1002, 10, 1, 1),
            (1003, 20, 0, 0),
        ],
    )

    conn.commit()


# ---------- Tests ----------


class TestListMatchesFilters:
    def test_no_filters(self, storage: MatchStorage) -> None:
        _seed(storage)
        result = storage.list_matches()
        assert len(result) == 3

    def test_filter_by_hero_id(self, storage: MatchStorage) -> None:
        _seed(storage)
        result = storage.list_matches(hero_id=1)
        ids = {m.match_id for m in result}
        assert ids == {1001, 1002}

    def test_filter_by_account_id(self, storage: MatchStorage) -> None:
        _seed(storage)
        result = storage.list_matches(account_id=200)
        ids = {m.match_id for m in result}
        # account 200 appears in matches 1001 and 1002
        assert ids == {1001, 1002}

    def test_filter_by_team_id(self, storage: MatchStorage) -> None:
        _seed(storage)
        result = storage.list_matches(team_id=10)
        ids = {m.match_id for m in result}
        assert ids == {1001, 1002}

    def test_filter_by_team_id_other(self, storage: MatchStorage) -> None:
        _seed(storage)
        result = storage.list_matches(team_id=20)
        ids = {m.match_id for m in result}
        assert ids == {1001, 1003}

    def test_combined_hero_and_account(self, storage: MatchStorage) -> None:
        _seed(storage)
        # hero_id=1 AND account_id=200 => only match 1002
        # (match 1001 has account 200 with hero 2, not hero 1)
        result = storage.list_matches(hero_id=1, account_id=200)
        ids = {m.match_id for m in result}
        assert ids == {1002}

    def test_combined_hero_and_team(self, storage: MatchStorage) -> None:
        _seed(storage)
        # hero_id=3 AND team_id=20 => match 1003
        result = storage.list_matches(hero_id=3, team_id=20)
        ids = {m.match_id for m in result}
        assert ids == {1003}

    def test_no_results(self, storage: MatchStorage) -> None:
        _seed(storage)
        result = storage.list_matches(hero_id=999)
        assert result == []

    def test_distinct_no_duplicates(self, storage: MatchStorage) -> None:
        """Ensure JOIN does not produce duplicate match rows."""
        _seed(storage)
        # team_id=10 matches 1001 and 1002; each should appear exactly once
        result = storage.list_matches(team_id=10)
        match_ids = [m.match_id for m in result]
        assert len(match_ids) == len(set(match_ids))


class TestCountMatchesFilters:
    def test_count_no_filter(self, storage: MatchStorage) -> None:
        _seed(storage)
        assert storage.count_matches() == 3

    def test_count_by_hero(self, storage: MatchStorage) -> None:
        _seed(storage)
        assert storage.count_matches(hero_id=1) == 2

    def test_count_by_team(self, storage: MatchStorage) -> None:
        _seed(storage)
        assert storage.count_matches(team_id=10) == 2

    def test_count_by_account(self, storage: MatchStorage) -> None:
        _seed(storage)
        assert storage.count_matches(account_id=300) == 2

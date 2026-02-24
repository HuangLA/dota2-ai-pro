"""Tests for /api/v1/library endpoints."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database.sqlite_db import close_database, get_connection, init_database
from routers import library


@pytest.fixture(autouse=True)
def db() -> Iterator[None]:
    init_database(":memory:")
    yield
    close_database()


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    library.DEFAULT_REPLAYS_DIR = tmp_path
    app = FastAPI()
    app.include_router(library.router, prefix="/api/v1/library")
    with TestClient(app) as test_client:
        yield test_client


def _seed_library_rows() -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO matches (match_id, start_time, duration, league_id, replay_path, parse_status, created_at, updated_at)
        VALUES (1001, 1700000001, 2200, 55, 'data/replays/1001.dem', 'completed', 1, 1)
        """
    )
    cursor.execute(
        """
        INSERT INTO matches (match_id, start_time, duration, league_id, replay_path, parse_status, created_at, updated_at)
        VALUES (1002, 1700000002, 2300, 66, 'data/replays/1002.dem', 'completed', 1, 1)
        """
    )
    cursor.execute(
        """
        INSERT INTO player_matches (match_id, account_id, hero_id)
        VALUES (1001, 90001, 1)
        """
    )
    cursor.execute(
        """
        INSERT INTO player_matches (match_id, account_id, hero_id)
        VALUES (1002, 90002, 2)
        """
    )
    cursor.execute(
        """
        INSERT INTO opendota_matches (
            match_id, start_time, duration, radiant_team_id, dire_team_id,
            leagueid, source, radiant_team_name, dire_team_name, league_name, last_synced_at
        )
        VALUES (1001, 1700000001, 2200, 15, 2163, 15475, 'pro', 'A', 'B', 'L1', 1700000300)
        """
    )
    cursor.execute(
        """
        INSERT INTO opendota_matches (
            match_id, start_time, duration, radiant_team_id, dire_team_id,
            leagueid, source, radiant_team_name, dire_team_name, league_name, last_synced_at
        )
        VALUES (1002, 1700000002, 2300, 39, 40, 16666, 'public', 'C', 'D', 'L2', 1700000301)
        """
    )
    conn.commit()


def test_library_matches_filters_by_team_and_player(client: TestClient) -> None:
    _seed_library_rows()

    team_response = client.get("/api/v1/library/matches", params={"team_id": 15})
    assert team_response.status_code == 200
    assert team_response.json()["total"] == 1
    assert team_response.json()["matches"][0]["match_id"] == 1001

    player_response = client.get("/api/v1/library/matches", params={"player_id": 90002})
    assert player_response.status_code == 200
    assert player_response.json()["total"] == 1
    assert player_response.json()["matches"][0]["match_id"] == 1002


def test_library_delete_removes_dem_and_bz2_but_keeps_completed_record(
    client: TestClient,
    tmp_path: Path,
) -> None:
    _seed_library_rows()
    dem = tmp_path / "1001.dem"
    dem.write_bytes(b"dem")
    bz2 = tmp_path / "1001.dem.bz2"
    bz2.write_bytes(b"bz2")

    response = client.post("/api/v1/library/1001/delete")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert len(payload["deleted_files"]) == 2
    assert dem.exists() is False
    assert bz2.exists() is False

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT replay_path, parse_status FROM matches WHERE match_id = 1001")
    row = cursor.fetchone()
    assert row["replay_path"] is None
    assert row["parse_status"] == "completed"

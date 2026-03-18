"""Tests for enriched /api/v1/matches routes."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database.sqlite_db import close_database, get_connection, init_database
from routers import matches as matches_router


class _FakeParquetStorage:
    def __init__(self, metadata_by_match_id: dict[int, dict]) -> None:
        self._metadata_by_match_id = metadata_by_match_id

    def get_metadata(self, match_id: int):
        return self._metadata_by_match_id.get(match_id)


class _FakeOpenDotaService:
    def __init__(self, detail_payload: dict) -> None:
        self._detail_payload = detail_payload

    async def fetch_match_details(self, match_id: int) -> dict:
        return self._detail_payload


@pytest.fixture(autouse=True)
def db() -> Iterator[None]:
    init_database(":memory:")
    yield
    close_database()


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(matches_router, "parquet_storage", _FakeParquetStorage({}))
    app = FastAPI()
    app.include_router(matches_router.router, prefix="/api/v1/matches")
    with TestClient(app) as test_client:
        yield test_client


def _seed_match(*, match_id: int, winner_team: int = 2, league_id: int | None = 15475) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO matches (
            match_id, start_time, duration, winner_team, league_id, replay_path, parse_status, created_at, updated_at
        )
        VALUES (?, 1700000000, 2400, ?, ?, 'data/replays/test.dem', 'completed', 1, 1710000000)
        """,
        (match_id, winner_team, league_id),
    )
    conn.commit()


def test_get_match_returns_enriched_team_context(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_match(match_id=9001, winner_team=2, league_id=15475)
    matches_router.opendota_match_storage.upsert_recent_matches(
        [
            {
                "match_id": 9001,
                "start_time": 1700000000,
                "duration": 2400,
                "radiant_team_name": "Team Liquid",
                "dire_team_name": "Team Falcons",
                "league_name": "DreamLeague",
                "leagueid": 15475,
                "source": "pro",
            }
        ],
        source="pro",
    )
    monkeypatch.setattr(
        matches_router,
        "parquet_storage",
        _FakeParquetStorage({9001: {"duration_seconds": 2500}}),
    )

    response = client.get("/api/v1/matches/9001")

    assert response.status_code == 200
    payload = response.json()
    assert payload["radiant_team_name"] == "Team Liquid"
    assert payload["dire_team_name"] == "Team Falcons"
    assert payload["league_name"] == "DreamLeague"
    assert payload["source"] == "pro"
    assert payload["is_professional"] is True
    assert payload["radiant_win"] is True
    assert payload["winner_display_name"] == "Team Liquid"
    assert payload["duration"] == 2500


def test_get_match_players_fetches_opendota_identities_for_pro_match(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_match(match_id=9002, winner_team=3, league_id=15475)
    matches_router.opendota_match_storage.upsert_recent_matches(
        [
            {
                "match_id": 9002,
                "start_time": 1700000000,
                "duration": 2400,
                "radiant_team_name": "Team Liquid",
                "dire_team_name": "Team Falcons",
                "leagueid": 15475,
                "source": "pro",
            }
        ],
        source="pro",
    )
    monkeypatch.setattr(
        matches_router,
        "parquet_storage",
        _FakeParquetStorage(
            {
                9002: {
                    "players": [
                        {
                            "hero_name": "npc_dota_hero_axe",
                            "player_name": "parser_axe",
                            "game_team": 2,
                        },
                        {
                            "hero_name": "npc_dota_hero_lion",
                            "player_name": "parser_lion",
                            "game_team": 3,
                        },
                    ]
                }
            }
        ),
    )
    monkeypatch.setattr(
        matches_router,
        "opendota_service",
        _FakeOpenDotaService(
            {
                "match_id": 9002,
                "start_time": 1700000000,
                "duration": 2400,
                "radiant_team_name": "Team Liquid",
                "dire_team_name": "Team Falcons",
                "leagueid": 15475,
                "source": "pro",
                "players": [
                    {
                        "account_id": 101,
                        "player_slot": 0,
                        "hero_id": 2,
                        "isRadiant": True,
                        "personaname": "PersonaAxe",
                        "name": "ProAxe",
                    },
                    {
                        "account_id": 202,
                        "player_slot": 128,
                        "hero_id": 26,
                        "isRadiant": False,
                        "personaname": "PersonaLion",
                        "name": "ProLion",
                    },
                ],
            }
        ),
    )

    response = client.get("/api/v1/matches/9002/players")

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_professional"] is True
    assert payload["radiant"][0]["display_name"] == "ProAxe"
    assert payload["radiant"][0]["display_type"] == "pro_name"
    assert payload["radiant"][0]["account_id"] == 101
    assert payload["dire"][0]["display_name"] == "ProLion"


def test_get_match_players_prefers_persona_for_public_and_falls_back_to_parser_name(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_match(match_id=9003, winner_team=2, league_id=16666)
    matches_router.opendota_match_storage.upsert_recent_matches(
        [
            {
                "match_id": 9003,
                "start_time": 1700000000,
                "duration": 2400,
                "leagueid": 16666,
                "source": "public",
            }
        ],
        source="public",
    )
    matches_router.opendota_match_storage.upsert_match_detail(
        {
            "match_id": 9003,
            "start_time": 1700000000,
            "duration": 2400,
            "leagueid": 16666,
            "source": "public",
            "players": [
                {
                    "account_id": 303,
                    "player_slot": 0,
                    "hero_id": 2,
                    "isRadiant": True,
                    "personaname": "PubAxe",
                    "name": "ShouldNotWin",
                }
            ],
        }
    )
    monkeypatch.setattr(
        matches_router,
        "parquet_storage",
        _FakeParquetStorage(
            {
                9003: {
                    "players": [
                        {
                            "hero_name": "npc_dota_hero_axe",
                            "player_name": "parser_axe",
                            "game_team": 2,
                        },
                        {
                            "hero_name": "npc_dota_hero_lion",
                            "player_name": "parser_lion",
                            "game_team": 3,
                        },
                    ]
                }
            }
        ),
    )

    response = client.get("/api/v1/matches/9003/players")

    assert response.status_code == 200
    payload = response.json()
    assert payload["is_professional"] is False
    assert payload["radiant"][0]["display_name"] == "PubAxe"
    assert payload["radiant"][0]["display_type"] == "persona_name"
    assert payload["dire"][0]["display_name"] == "parser_lion"
    assert payload["dire"][0]["display_type"] == "player_name"

"""Tests for enriched match and player responses in matches routes."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import matches as matches_router


def _client(
    monkeypatch: pytest.MonkeyPatch,
    *,
    match_storage: Any,
    parquet_storage: Any,
    opendota_match_storage: Any,
    opendota_service: Any | None = None,
) -> TestClient:
    monkeypatch.setattr(matches_router, "match_storage", match_storage)
    monkeypatch.setattr(matches_router, "parquet_storage", parquet_storage)
    monkeypatch.setattr(matches_router, "opendota_match_storage", opendota_match_storage)
    if opendota_service is not None:
        monkeypatch.setattr(matches_router, "opendota_service", opendota_service)

    app = FastAPI()
    app.include_router(matches_router.router, prefix="/api/v1/matches")
    return TestClient(app)


def _match_record(match_id: int, *, league_id: int | None = None, winner_team: int | None = 2) -> SimpleNamespace:
    return SimpleNamespace(
        match_id=match_id,
        start_time=1700000000,
        duration=2400,
        winner_team=winner_team,
        radiant_score=25,
        dire_score=18,
        game_mode=22,
        patch_version=None,
        league_id=league_id,
        replay_path=None,
        parse_status="completed",
        created_at=1700000001,
        updated_at=1700000002,
    )


def _context_row(match_id: int, *, source: str, is_professional: bool) -> dict[str, Any]:
    return {
        "match_id": match_id,
        "start_time": 1700000000,
        "duration": 2400,
        "radiant_team_id": 1,
        "dire_team_id": 2,
        "leagueid": 999,
        "source": source,
        "is_professional": is_professional,
        "radiant_win": True,
        "radiant_team_name": "Team Liquid",
        "dire_team_name": "Team Falcons",
        "league_name": "DreamLeague",
    }


def test_match_endpoints_include_enriched_context_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    match_record = _match_record(501, league_id=999, winner_team=None)

    class FakeMatchStorage:
        def list_matches(self, **_: object) -> list[SimpleNamespace]:
            return [match_record]

        def count_matches(self, **_: object) -> int:
            return 1

        def get_match(self, match_id: int) -> SimpleNamespace | None:
            return match_record if match_id == 501 else None

    class FakeParquetStorage:
        def get_metadata(self, match_id: int) -> dict[str, Any] | None:
            assert match_id == 501
            return {"duration_seconds": 2600}

    class FakeOpenDotaMatchStorage:
        def list_recent_matches(self, **kwargs: object) -> tuple[int, list[dict[str, Any]]]:
            assert kwargs["include_pro"] is True
            assert kwargs["include_public"] is True
            return 1, [_context_row(501, source="pro", is_professional=True)]

    client = _client(
        monkeypatch,
        match_storage=FakeMatchStorage(),
        parquet_storage=FakeParquetStorage(),
        opendota_match_storage=FakeOpenDotaMatchStorage(),
    )

    list_response = client.get("/api/v1/matches")
    assert list_response.status_code == 200
    list_payload = list_response.json()["matches"][0]
    assert list_payload["radiant_team_name"] == "Team Liquid"
    assert list_payload["dire_team_name"] == "Team Falcons"
    assert list_payload["league_name"] == "DreamLeague"
    assert list_payload["source"] == "pro"
    assert list_payload["is_professional"] is True
    assert list_payload["radiant_win"] is True
    assert list_payload["winner_team"] == 2
    assert list_payload["winner_display_name"] == "Team Liquid"

    detail_response = client.get("/api/v1/matches/501")
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()
    assert detail_payload["radiant_team_name"] == "Team Liquid"
    assert detail_payload["league_name"] == "DreamLeague"
    assert detail_payload["source"] == "pro"
    assert detail_payload["radiant_win"] is True


@pytest.mark.parametrize(
    ("source", "is_professional", "expected_display_name", "expected_display_type"),
    [
        ("pro", True, "Boxi", "pro_name"),
        ("public", False, "Pub Star", "persona_name"),
    ],
)
def test_match_players_display_name_prefers_pro_or_persona_by_context(
    monkeypatch: pytest.MonkeyPatch,
    source: str,
    is_professional: bool,
    expected_display_name: str,
    expected_display_type: str,
) -> None:
    match_record = _match_record(601, league_id=999 if is_professional else None)

    class FakeMatchStorage:
        def get_match(self, match_id: int) -> SimpleNamespace | None:
            return match_record if match_id == 601 else None

        def get_match_players(self, match_id: int) -> list[SimpleNamespace]:
            assert match_id == 601
            return [
                SimpleNamespace(
                    account_id=1,
                    hero_id=2,
                    player_slot=0,
                    team_id=2,
                    kills=3,
                    deaths=1,
                    assists=7,
                    gpm=450,
                    xpm=520,
                    net_worth=12000,
                    last_hits=150,
                    denies=8,
                )
            ]

    class FakeParquetStorage:
        def get_metadata(self, match_id: int) -> dict[str, Any] | None:
            assert match_id == 601
            return {
                "players": [
                    {
                        "hero_name": "npc_dota_hero_axe",
                        "player_name": "Parser Name",
                        "game_team": 2,
                    }
                ]
            }

    class FakeOpenDotaMatchStorage:
        def list_recent_matches(self, **_: object) -> tuple[int, list[dict[str, Any]]]:
            return 1, [_context_row(601, source=source, is_professional=is_professional)]

        def get_match_player_identities(self, match_id: int) -> list[dict[str, Any]]:
            assert match_id == 601
            return [
                {
                    "player_slot": 0,
                    "account_id": 123456,
                    "hero_id": 2,
                    "team_id": 2,
                    "persona_name": "Pub Star",
                    "pro_name": "Boxi",
                    "last_synced_at": 1,
                }
            ]

    async def _unused_fetch(_: int) -> dict[str, Any]:
        raise AssertionError("fetch_match_details should not be called when identities are cached")

    client = _client(
        monkeypatch,
        match_storage=FakeMatchStorage(),
        parquet_storage=FakeParquetStorage(),
        opendota_match_storage=FakeOpenDotaMatchStorage(),
        opendota_service=SimpleNamespace(fetch_match_details=_unused_fetch),
    )

    response = client.get("/api/v1/matches/601/players")
    assert response.status_code == 200
    payload = response.json()
    player = payload["radiant"][0]
    assert payload["is_professional"] is is_professional
    assert player["display_name"] == expected_display_name
    assert player["display_type"] == expected_display_type
    assert player["player_name"] == expected_display_name
    assert player["persona_name"] == "Pub Star"
    assert player["pro_name"] == "Boxi"
    assert player["account_id"] == 123456


def test_match_players_fall_back_to_parser_name_and_best_effort_fetch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    match_record = _match_record(701, league_id=999)
    fetch_calls = {"count": 0}
    identity_state: list[dict[str, Any]] = []

    class FakeMatchStorage:
        def get_match(self, match_id: int) -> SimpleNamespace | None:
            return match_record if match_id == 701 else None

        def get_match_players(self, match_id: int) -> list[SimpleNamespace]:
            assert match_id == 701
            return [
                SimpleNamespace(
                    account_id=10,
                    hero_id=2,
                    player_slot=0,
                    team_id=2,
                    kills=1,
                    deaths=2,
                    assists=3,
                    gpm=300,
                    xpm=320,
                    net_worth=8000,
                    last_hits=90,
                    denies=3,
                )
            ]

    class FakeParquetStorage:
        def get_metadata(self, match_id: int) -> dict[str, Any] | None:
            assert match_id == 701
            return {
                "players": [
                    {
                        "hero_name": "npc_dota_hero_axe",
                        "player_name": "Parser Fallback",
                        "game_team": 2,
                    }
                ]
            }

    class FakeOpenDotaMatchStorage:
        def list_recent_matches(self, **_: object) -> tuple[int, list[dict[str, Any]]]:
            return 1, [_context_row(701, source="pro", is_professional=True)]

        def get_match_player_identities(self, match_id: int) -> list[dict[str, Any]]:
            assert match_id == 701
            return list(identity_state)

        def upsert_match_detail(self, detail: dict[str, Any]) -> tuple[int, int]:
            players = detail["players"]
            identity_state[:] = [
                {
                    "player_slot": 0,
                    "account_id": players[0]["account_id"],
                    "hero_id": players[0]["hero_id"],
                    "team_id": 2,
                    "persona_name": players[0].get("personaname"),
                    "pro_name": players[0].get("name"),
                    "last_synced_at": 1,
                }
            ]
            return 0, 1

    async def _fake_fetch(match_id: int) -> dict[str, Any]:
        assert match_id == 701
        fetch_calls["count"] += 1
        return {
            "match_id": 701,
            "source": "pro",
            "players": [
                {
                    "player_slot": 0,
                    "account_id": 998877,
                    "hero_id": 2,
                    "isRadiant": True,
                    "personaname": None,
                    "name": None,
                }
            ],
        }

    client = _client(
        monkeypatch,
        match_storage=FakeMatchStorage(),
        parquet_storage=FakeParquetStorage(),
        opendota_match_storage=FakeOpenDotaMatchStorage(),
        opendota_service=SimpleNamespace(fetch_match_details=_fake_fetch),
    )

    response = client.get("/api/v1/matches/701/players")
    assert response.status_code == 200
    payload = response.json()
    assert fetch_calls["count"] == 1
    player = payload["radiant"][0]
    assert player["display_name"] == "Parser Fallback"
    assert player["display_type"] == "player_name"
    assert player["player_name"] == "Parser Fallback"
    assert player["account_id"] == 998877
    assert payload["players"][0]["display_name"] == "Parser Fallback"

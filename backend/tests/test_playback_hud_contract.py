"""Contract tests for playback HUD endpoint."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from typing import Mapping

from main import app
from routers import playback


class _FakeHudParquetStorage:
    def __init__(
        self,
        positions: pd.DataFrame,
        kills: pd.DataFrame,
        metadata: Mapping[str, object] | None = None,
    ) -> None:
        self._positions = positions
        self._kills = kills
        self._metadata = dict(metadata) if metadata is not None else {"game_start_time": 0.0}

    def match_exists(self, match_id: int) -> bool:
        return match_id == 1

    def get_positions(self, match_id: int, start_tick=None, end_tick=None, hero=None, team=None) -> pd.DataFrame:
        return self._positions.copy()

    def get_kills(self, match_id: int) -> pd.DataFrame:
        return self._kills.copy()

    def get_metadata(self, match_id: int):
        return self._metadata


def _build_positions() -> pd.DataFrame:
    radiant = ["axe", "crystal_maiden", "juggernaut", "earthshaker", "lina"]
    dire = ["lion", "juggernaut", "slark", "phantom_assassin", "tiny"]

    rows: list[dict[str, object]] = []
    handle = 100
    for team, heroes in ((2, radiant), (3, dire)):
        for hero in heroes:
            rows.append(
                {
                    "tick": 30,
                    "hero": f"npc_dota_hero_{hero}",
                    "handle": handle,
                    "team": team,
                    "x": 100.0,
                    "y": 200.0,
                    "level": 1,
                    "game_time": -89.0,
                }
            )
            rows.append(
                {
                    "tick": 60,
                    "hero": f"npc_dota_hero_{hero}",
                    "handle": handle,
                    "team": team,
                    "x": 110.0,
                    "y": 210.0,
                    "level": 2,
                    "game_time": -88.0,
                }
            )
            handle += 1

    return pd.DataFrame(rows)


def _build_kills() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "time": -89.0,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_lina",
            },
            {
                "time": -88.2,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_lion",
            },
            {
                "time": -88.0,
                "killer": "npc_dota_hero_lina",
                "victim": "npc_dota_hero_axe",
            },
        ]
    )


@pytest.fixture
def client_with_hud_storage(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    fake_storage = _FakeHudParquetStorage(_build_positions(), _build_kills())
    monkeypatch.setattr(playback, "parquet_storage", fake_storage)
    return TestClient(app)


@pytest.fixture
def client_with_hud_assist_storage(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    metadata = {
        "game_start_time": 0.0,
        "players": [
            {"hero_name": "npc_dota_hero_axe"},
            {"hero_name": "npc_dota_hero_crystal_maiden"},
            {"hero_name": "npc_dota_hero_juggernaut"},
            {"hero_name": "npc_dota_hero_earthshaker"},
            {"hero_name": "npc_dota_hero_lina"},
            {"hero_name": "npc_dota_hero_lion"},
            {"hero_name": "npc_dota_hero_juggernaut"},
            {"hero_name": "npc_dota_hero_slark"},
            {"hero_name": "npc_dota_hero_phantom_assassin"},
            {"hero_name": "npc_dota_hero_tiny"},
        ],
    }
    kills = pd.DataFrame(
        [
            {
                "time": -88.0,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_lion",
                "assist_players": "[1, 3]",
            }
        ]
    )
    fake_storage = _FakeHudParquetStorage(_build_positions(), kills, metadata=metadata)
    monkeypatch.setattr(playback, "parquet_storage", fake_storage)
    return TestClient(app)


def test_hud_endpoint_returns_stable_hero_contract(client_with_hud_storage: TestClient) -> None:
    response = client_with_hud_storage.get("/api/v1/playback/1/hud")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["match_id"] == 1
    assert payload["tick"] == 60
    assert payload["game_time"] == -88.0
    assert len(payload["heroes"]) == 10

    required_fields = {
        "hero",
        "team",
        "level",
        "kills",
        "deaths",
        "assists",
        "net_worth",
        "gpm",
        "xpm",
        "items",
    }
    for hero in payload["heroes"]:
        assert required_fields.issubset(hero.keys())
        assert isinstance(hero["items"], list)


def test_hud_endpoint_supports_tick_query_path(client_with_hud_storage: TestClient) -> None:
    response = client_with_hud_storage.get("/api/v1/playback/1/hud", params={"tick": 30})

    assert response.status_code == 200
    payload = response.json()
    assert payload["tick"] == 30
    assert payload["game_time"] == -89.0

    axe = next(hero for hero in payload["heroes"] if hero["hero"] == "npc_dota_hero_axe")
    lina = next(hero for hero in payload["heroes"] if hero["hero"] == "npc_dota_hero_lina")
    assert axe["kills"] == 1
    assert axe["deaths"] == 0
    assert lina["deaths"] == 1


def test_hud_endpoint_game_time_before_first_sample_clamps_to_earliest_tick(
    client_with_hud_storage: TestClient,
) -> None:
    response = client_with_hud_storage.get("/api/v1/playback/1/hud", params={"game_time": -999.0})

    assert response.status_code == 200
    payload = response.json()
    assert payload["tick"] == 30
    assert payload["game_time"] == -89.0


def test_hud_endpoint_game_time_after_last_sample_clamps_to_latest_tick(
    client_with_hud_storage: TestClient,
) -> None:
    response = client_with_hud_storage.get("/api/v1/playback/1/hud", params={"game_time": 999.0})

    assert response.status_code == 200
    payload = response.json()
    assert payload["tick"] == 60
    assert payload["game_time"] == -88.0


def test_hud_endpoint_maps_assists_from_assist_players(
    client_with_hud_assist_storage: TestClient,
) -> None:
    response = client_with_hud_assist_storage.get("/api/v1/playback/1/hud", params={"tick": 60})

    assert response.status_code == 200
    payload = response.json()
    crystal_maiden = next(hero for hero in payload["heroes"] if hero["hero"] == "npc_dota_hero_crystal_maiden")
    earthshaker = next(hero for hero in payload["heroes"] if hero["hero"] == "npc_dota_hero_earthshaker")
    lion = next(hero for hero in payload["heroes"] if hero["hero"] == "npc_dota_hero_lion")

    assert crystal_maiden["assists"] == 1
    assert earthshaker["assists"] == 1
    assert lion["deaths"] == 1


def test_hud_endpoint_rejects_game_time_and_tick_together(client_with_hud_storage: TestClient) -> None:
    response = client_with_hud_storage.get(
        "/api/v1/playback/1/hud",
        params={"game_time": -88.0, "tick": 60},
    )

    assert response.status_code == 422
    payload = response.json()
    assert "Provide only one" in payload["detail"]

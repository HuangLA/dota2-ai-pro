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
        economy: pd.DataFrame,
        metadata: Mapping[str, object] | None = None,
    ) -> None:
        self._positions = positions
        self._kills = kills
        self._economy = economy
        self._metadata = dict(metadata) if metadata is not None else _build_metadata()

    def match_exists(self, match_id: int) -> bool:
        return match_id == 1

    def get_positions(self, match_id: int, start_tick=None, end_tick=None, hero=None, team=None) -> pd.DataFrame:
        return self._positions.copy()

    def get_kills(self, match_id: int) -> pd.DataFrame:
        return self._kills.copy()

    def get_economy(self, match_id: int) -> pd.DataFrame:
        return self._economy.copy()

    def get_metadata(self, match_id: int):
        return self._metadata


def _build_positions(include_summon: bool = False) -> pd.DataFrame:
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
                    "items": "[]",
                    "game_time": 60.0,
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
                    "items": "[\"blink\", \"phase_boots\"]" if hero == "axe" and team == 2 else "[]",
                    "game_time": 120.0,
                }
            )
            handle += 1

    if include_summon:
        rows.extend(
            [
                {
                    "tick": 30,
                    "hero": "npc_dota_hero_beastmaster_boar",
                    "handle": 999,
                    "team": 3,
                    "x": 400.0,
                    "y": 500.0,
                    "level": 1,
                    "items": "[]",
                    "game_time": 60.0,
                },
                {
                    "tick": 60,
                    "hero": "npc_dota_hero_beastmaster_boar",
                    "handle": 999,
                    "team": 3,
                    "x": 420.0,
                    "y": 520.0,
                    "level": 1,
                    "items": "[]",
                    "game_time": 120.0,
                },
            ]
        )

    return pd.DataFrame(rows)


def _build_metadata() -> dict[str, object]:
    radiant = ["axe", "crystal_maiden", "juggernaut", "earthshaker", "lina"]
    dire = ["lion", "juggernaut", "slark", "phantom_assassin", "tiny"]
    players = [
        {"hero_name": f"npc_dota_hero_{hero}", "game_team": 2}
        for hero in radiant
    ] + [
        {"hero_name": f"npc_dota_hero_{hero}", "game_team": 3}
        for hero in dire
    ]
    return {
        "game_start_time": 0.0,
        "players": players,
        "inventory_slot_contract_version": playback.CURRENT_INVENTORY_SLOT_CONTRACT_VERSION,
    }


def _build_kills() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "time": 60.0,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_lina",
            },
            {
                "time": 119.8,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_lion",
            },
            {
                "time": 120.0,
                "killer": "npc_dota_hero_lina",
                "victim": "npc_dota_hero_axe",
            },
        ]
    )


def _build_economy() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "tick": 30,
                "game_time": 60.0,
                "radiant_gold": 2500,
                "dire_gold": 2200,
                "radiant_xp": 3000,
                "dire_xp": 2800,
                "gold_advantage": 300,
                "xp_advantage": 200,
                "radiant_gold_by_player": "[600, 500, 500, 450, 450]",
                "dire_gold_by_player": "[500, 450, 450, 400, 400]",
                "radiant_xp_by_player": "[700, 650, 600, 550, 500]",
                "dire_xp_by_player": "[650, 600, 550, 500, 500]",
                "radiant_net_worth": "[1800, 1700, 1650, 1600, 1550]",
                "dire_net_worth": "[1700, 1600, 1550, 1500, 1450]",
                "radiant_net_worth_total": 8300,
                "dire_net_worth_total": 7800,
                "net_worth_advantage": 500,
            },
            {
                "tick": 60,
                "game_time": 120.0,
                "radiant_gold": 4300,
                "dire_gold": 3900,
                "radiant_xp": 5100,
                "dire_xp": 4700,
                "gold_advantage": 400,
                "xp_advantage": 400,
                "radiant_gold_by_player": "[1000, 900, 850, 800, 750]",
                "dire_gold_by_player": "[950, 800, 750, 700, 700]",
                "radiant_xp_by_player": "[1200, 1100, 1000, 950, 850]",
                "dire_xp_by_player": "[1100, 950, 900, 850, 900]",
                "radiant_net_worth": "[3000, 2800, 2600, 2500, 2400]",
                "dire_net_worth": "[2900, 2500, 2400, 2200, 2100]",
                "radiant_net_worth_total": 13300,
                "dire_net_worth_total": 12100,
                "net_worth_advantage": 1200,
            },
        ]
    )


@pytest.fixture
def client_with_hud_storage(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    fake_storage = _FakeHudParquetStorage(_build_positions(), _build_kills(), _build_economy())
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
                "time": 120.0,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_lion",
                "assist_players": "[1, 3]",
            }
        ]
    )
    fake_storage = _FakeHudParquetStorage(_build_positions(), kills, _build_economy(), metadata=metadata)
    monkeypatch.setattr(playback, "parquet_storage", fake_storage)
    return TestClient(app)


@pytest.fixture
def client_with_summon_storage(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    fake_storage = _FakeHudParquetStorage(
        _build_positions(include_summon=True),
        _build_kills(),
        _build_economy(),
    )
    monkeypatch.setattr(playback, "parquet_storage", fake_storage)
    return TestClient(app)


def test_hud_endpoint_returns_stable_hero_contract(client_with_hud_storage: TestClient) -> None:
    response = client_with_hud_storage.get("/api/v1/playback/1/hud")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["match_id"] == 1
    assert payload["tick"] == 60
    assert payload["game_time"] == 120.0
    assert len(payload["heroes"]) == 10
    assert "message" not in payload

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
    assert payload["game_time"] == 60.0

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
    assert payload["game_time"] == 60.0


def test_hud_endpoint_game_time_after_last_sample_clamps_to_latest_tick(
    client_with_hud_storage: TestClient,
) -> None:
    response = client_with_hud_storage.get("/api/v1/playback/1/hud", params={"game_time": 999.0})

    assert response.status_code == 200
    payload = response.json()
    assert payload["tick"] == 60
    assert payload["game_time"] == 120.0


def test_hud_endpoint_exposes_real_economy_metrics_and_items(
    client_with_hud_storage: TestClient,
) -> None:
    response = client_with_hud_storage.get("/api/v1/playback/1/hud", params={"tick": 60})

    assert response.status_code == 200
    payload = response.json()
    axe = next(hero for hero in payload["heroes"] if hero["hero"] == "npc_dota_hero_axe")
    lion = next(hero for hero in payload["heroes"] if hero["hero"] == "npc_dota_hero_lion")

    assert axe["net_worth"] == 3000
    assert axe["gpm"] == 500
    assert axe["xpm"] == 600
    assert axe["items"] == ["blink", "phase_boots"]
    assert lion["net_worth"] == 2900
    assert lion["gpm"] == 475
    assert lion["xpm"] == 550


def test_hud_endpoint_warns_when_inventory_slot_contract_is_legacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    legacy_storage = _FakeHudParquetStorage(
        _build_positions(),
        _build_kills(),
        _build_economy(),
        metadata={"game_start_time": 0.0, "players": _build_metadata()["players"]},
    )
    monkeypatch.setattr(playback, "parquet_storage", legacy_storage)
    client = TestClient(app)

    response = client.get("/api/v1/playback/1/hud", params={"tick": 60})

    assert response.status_code == 200
    payload = response.json()
    assert "warnings" in payload
    assert any("旧版物品槽契约" in warning for warning in payload["warnings"])
    assert "message" in payload


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


def test_hud_endpoint_filters_non_player_summons(client_with_summon_storage: TestClient) -> None:
    response = client_with_summon_storage.get("/api/v1/playback/1/hud")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["heroes"]) == 10
    assert all(hero["hero"] != "npc_dota_hero_beastmaster_boar" for hero in payload["heroes"])


def test_ticks_endpoint_filters_non_player_summons(client_with_summon_storage: TestClient) -> None:
    response = client_with_summon_storage.get("/api/v1/playback/1/ticks")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ticks"]
    for tick in payload["ticks"]:
        assert len(tick["heroes"]) == 10
        assert all(hero["hero"] != "npc_dota_hero_beastmaster_boar" for hero in tick["heroes"])


def test_heroes_endpoint_filters_non_player_summons(client_with_summon_storage: TestClient) -> None:
    response = client_with_summon_storage.get("/api/v1/playback/1/heroes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 10
    assert all(hero["name"] != "npc_dota_hero_beastmaster_boar" for hero in payload["dire"])


def test_hud_endpoint_rejects_game_time_and_tick_together(client_with_hud_storage: TestClient) -> None:
    response = client_with_hud_storage.get(
        "/api/v1/playback/1/hud",
        params={"game_time": -88.0, "tick": 60},
    )

    assert response.status_code == 422
    payload = response.json()
    assert "Provide only one" in payload["detail"]

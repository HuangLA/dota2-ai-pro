"""Contract tests for playback objective endpoint."""

from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from main import app
from routers import playback


class _FakeObjectiveParquetStorage:
    def __init__(self) -> None:
        self._positions = pd.DataFrame(
            [
                {
                    "tick": 30,
                    "hero": "npc_dota_hero_axe",
                    "handle": 1,
                    "team": 2,
                    "x": 100.0,
                    "y": 200.0,
                    "game_time": 0.0,
                }
            ]
        )
        self._objectives = pd.DataFrame(
            [
                {
                    "type": "destroyed",
                    "objective_type": "tower",
                    "objective_name": "npc_dota_goodguys_tower1_top",
                    "tick": 600,
                    "x": 10084.0,
                    "y": 18184.0,
                    "team": 2,
                    "game_time": 20.0,
                    "attacker_name": "npc_dota_hero_axe",
                },
                {
                    "type": "destroyed",
                    "objective_type": "roshan",
                    "objective_name": "npc_dota_roshan",
                    "tick": 3600,
                    "x": 17500.0,
                    "y": 19200.0,
                    "team": pd.NA,
                    "game_time": 120.0,
                    "attacker_name": "npc_dota_hero_lina",
                },
            ]
        )

    def match_exists(self, match_id: int) -> bool:
        return match_id == 1

    def get_positions(self, match_id: int, start_tick=None, end_tick=None, hero=None, team=None) -> pd.DataFrame:
        return self._positions.copy()

    def get_objectives(self, match_id: int, objective_type=None) -> pd.DataFrame:
        df = self._objectives.copy()
        if objective_type:
            df = df[df["objective_type"] == objective_type]
        return df

    def get_metadata(self, match_id: int):
        return {
            "time_contract_version": "v1",
            "ticks_per_second": 30,
            "game_start_time": 0.0,
        }


@pytest.fixture
def client_with_objective_storage(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(playback, "parquet_storage", _FakeObjectiveParquetStorage())
    return TestClient(app)


def test_objectives_endpoint_returns_expected_schema(client_with_objective_storage: TestClient) -> None:
    response = client_with_objective_storage.get("/api/v1/playback/1/objectives")
    assert response.status_code == 200

    payload = response.json()
    assert payload["match_id"] == 1
    assert payload["summary"]["total"] == 2
    assert payload["summary"]["by_type"]["tower"] == 1
    assert payload["summary"]["by_type"]["roshan"] == 1
    assert isinstance(payload["objectives"], list)

    first = payload["objectives"][0]
    assert {
        "type",
        "objective_type",
        "objective_name",
        "tick",
        "time",
        "game_time",
    }.issubset(first.keys())


def test_objectives_endpoint_supports_type_filter(client_with_objective_storage: TestClient) -> None:
    response = client_with_objective_storage.get(
        "/api/v1/playback/1/objectives",
        params={"objective_type": "roshan"},
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["summary"]["total"] == 1
    assert payload["objectives"][0]["objective_type"] == "roshan"


def test_objectives_endpoint_missing_match_returns_404(client_with_objective_storage: TestClient) -> None:
    response = client_with_objective_storage.get("/api/v1/playback/999/objectives")
    assert response.status_code == 404

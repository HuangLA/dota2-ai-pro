"""End-to-end regression tests for playback API endpoints."""

from __future__ import annotations

from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from routers import playback


MATCH_ID_PRIMARY = 8674716612
MATCH_ID_SECONDARY = 8689321714
MISSING_MATCH_ID = 99999999


def as_object_dict(value: object) -> dict[str, object]:
    """Assert and narrow arbitrary JSON value to dict[str, object]."""
    assert isinstance(value, dict)
    return cast(dict[str, object], value)


def as_object_list(value: object) -> list[object]:
    """Assert and narrow arbitrary JSON value to list[object]."""
    assert isinstance(value, list)
    return cast(list[object], value)


def as_dict_list(value: object) -> list[dict[str, object]]:
    """Assert and narrow arbitrary JSON value to list[dict[str, object]]."""
    return [as_object_dict(item) for item in as_object_list(value)]


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(playback.router, prefix="/api/v1/playback")
    return TestClient(app)


class TestTicksEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/ticks."""

    def test_ticks_response_schema_and_hero_fields(self, client: TestClient) -> None:
        """Returns top-level schema and hero position/resource fields."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/ticks")

        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == MATCH_ID_PRIMARY
        assert isinstance(payload["ticks"], list)
        assert isinstance(payload["time_basis"], dict)
        assert payload["ticks"], "Expected non-empty tick samples for known parsed match"

        ticks = as_dict_list(cast(object, payload["ticks"]))
        
        tick = ticks[0]
        assert {"tick", "heroes"}.issubset(tick.keys())
        assert isinstance(tick["heroes"], list)
        assert tick["heroes"], "Expected at least one hero sample in tick"

        heroes = as_dict_list(cast(object, tick["heroes"]))
        
        hero = heroes[0]
        assert {"hero", "x", "y", "hp", "mana", "max_hp", "max_mana"}.issubset(hero.keys())

    def test_ticks_missing_match_returns_404(self, client: TestClient) -> None:
        """Returns 404 when requested match is not parsed."""
        response = client.get(f"/api/v1/playback/{MISSING_MATCH_ID}/ticks")
        assert response.status_code == 404

    def test_ticks_invalid_interval_validation(self, client: TestClient) -> None:
        """Rejects invalid interval query values outside [1, 30]."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/ticks", params={"interval": 0})
        assert response.status_code == 422

    def test_ticks_invalid_team_returns_empty_result(self, client: TestClient) -> None:
        """Handles unsupported team filters gracefully with empty samples."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/ticks", params={"team": 1})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["ticks"] == []
        assert payload["total_samples"] == 0

    def test_two_sample_matches_have_negative_game_time(self, client: TestClient) -> None:
        """Both sample matches include negative game_time before timeline zero."""
        for match_id in (MATCH_ID_PRIMARY, MATCH_ID_SECONDARY):
            response = client.get(f"/api/v1/playback/{match_id}/ticks")
            assert response.status_code == 200
            payload = as_object_dict(cast(object, response.json()))
            ticks = as_dict_list(cast(object, payload["ticks"]))
            game_times = [cast(float, tick["game_time"]) for tick in ticks]
            assert min(game_times) < 0.0

    def test_two_sample_matches_have_near_zero_alignment(self, client: TestClient) -> None:
        """Both sample matches expose at least one sample close to game_time zero."""
        for match_id in (MATCH_ID_PRIMARY, MATCH_ID_SECONDARY):
            response = client.get(f"/api/v1/playback/{match_id}/ticks")
            assert response.status_code == 200
            payload = as_object_dict(cast(object, response.json()))
            ticks = as_dict_list(cast(object, payload["ticks"]))
            game_times = [abs(cast(float, tick["game_time"])) for tick in ticks]
            assert min(game_times) <= 1.0

    def test_pause_intervals_consistent_across_ticks_wards_and_advantage(self, client: TestClient) -> None:
        """Primary sample keeps pause intervals aligned across major playback endpoints."""
        ticks_response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/ticks")
        wards_response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/wards")
        advantage_response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/advantage")

        assert ticks_response.status_code == 200
        assert wards_response.status_code == 200
        assert advantage_response.status_code == 200

        ticks_payload = as_object_dict(cast(object, ticks_response.json()))
        wards_payload = as_object_dict(cast(object, wards_response.json()))
        advantage_payload = as_object_dict(cast(object, advantage_response.json()))

        ticks_pause = as_object_list(cast(object, ticks_payload["pause_intervals"]))
        assert ticks_pause, "Expected primary sample to include pause intervals"
        assert as_object_list(cast(object, wards_payload["pause_intervals"])) == ticks_pause
        ticks_time_basis = as_object_dict(cast(object, ticks_payload["time_basis"]))
        wards_time_basis = as_object_dict(cast(object, wards_payload["time_basis"]))
        advantage_time_basis = as_object_dict(cast(object, advantage_payload["time_basis"]))
        assert as_object_list(cast(object, ticks_time_basis["pause_intervals"])) == ticks_pause
        assert as_object_list(cast(object, wards_time_basis["pause_intervals"])) == ticks_pause
        assert as_object_list(cast(object, advantage_time_basis["pause_intervals"])) == ticks_pause

    def test_secondary_sample_reports_no_pause_intervals(self, client: TestClient) -> None:
        """Secondary sample acts as no-pause control case for pause metadata."""
        ticks_response = client.get(f"/api/v1/playback/{MATCH_ID_SECONDARY}/ticks")
        assert ticks_response.status_code == 200
        payload = as_object_dict(cast(object, ticks_response.json()))
        assert as_object_list(cast(object, payload["pause_intervals"])) == []


class TestEventsEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/events."""

    def test_events_response_schema_and_data_fields(self, client: TestClient) -> None:
        """Returns kill events with expected event fields and total count."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/events")

        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == MATCH_ID_PRIMARY
        assert isinstance(payload["events"], list)
        assert isinstance(payload["total"], int)
        events = as_dict_list(cast(object, payload["events"]))
        
        
        assert payload["total"] == len(events)
        assert payload["events"], "Expected non-empty events for known parsed match"

        event = events[0]
        assert {"time", "type", "killer", "victim"}.issubset(event.keys())

    def test_events_filter_by_kill_type(self, client: TestClient) -> None:
        """Keeps kill events when event_type=kill is specified."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/events", params={"event_type": "kill"})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        events = as_dict_list(payload["events"])
        
        
        assert all(event["type"] == "kill" for event in events)

    def test_events_empty_result_handling(self, client: TestClient) -> None:
        """Returns empty event list for unsupported event_type filter."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/events", params={"event_type": "assist"})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["events"] == []
        assert payload["total"] == 0

    def test_events_missing_match_returns_404(self, client: TestClient) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{MISSING_MATCH_ID}/events")
        assert response.status_code == 404


class TestWardsEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/wards."""

    def test_wards_response_schema_and_item_fields(self, client: TestClient) -> None:
        """Returns ward list with expected fields and summary."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/wards")

        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == MATCH_ID_PRIMARY
        assert isinstance(payload["wards"], list)
        assert isinstance(payload["time_basis"], dict)
        assert isinstance(payload["summary"], dict)
        assert payload["wards"], "Expected non-empty ward events for known parsed match"

        wards = as_dict_list(cast(object, payload["wards"]))
        
        
        ward = wards[0]
        assert {"type", "ward_type", "tick", "time", "game_time"}.issubset(ward.keys())

    def test_wards_missing_match_returns_404(self, client: TestClient) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{MISSING_MATCH_ID}/wards")
        assert response.status_code == 404

    def test_wards_invalid_team_returns_empty_result(self, client: TestClient) -> None:
        """Handles invalid team value by returning an empty ward list."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/wards", params={"team": 1})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["wards"] == []
        summary = as_object_dict(payload["summary"])
        
        assert summary["total"] == 0


class TestHeroesEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/heroes."""

    def test_heroes_response_schema_and_team_totals(self, client: TestClient) -> None:
        """Returns radiant/dire hero lists that add up to 10 heroes."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_SECONDARY}/heroes")

        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == MATCH_ID_SECONDARY
        assert isinstance(payload["radiant"], list)
        assert isinstance(payload["dire"], list)
        assert isinstance(payload["total"], int)
        radiant = as_dict_list(cast(object, payload["radiant"]))
        
        
        dire = as_dict_list(cast(object, payload["dire"]))
        
        
        assert len(radiant) + len(dire) == payload["total"]
        assert payload["total"] == 10


class TestHudEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/hud."""

    def test_hud_response_schema(self, client: TestClient) -> None:
        """Returns HUD snapshot with status, match_id, and hero rows."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/hud")
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        assert payload["status"] == "ok"
        assert payload["match_id"] == MATCH_ID_PRIMARY
        assert isinstance(payload["heroes"], list)
        heroes = as_dict_list(cast(object, payload["heroes"]))
        
        
        assert len(heroes) == 10

    def test_hud_accepts_game_time_query(self, client: TestClient) -> None:
        """Supports selecting snapshot by game_time."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/hud", params={"game_time": 0})
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        assert payload["status"] == "ok"
        assert isinstance(payload["game_time"], float)
        assert isinstance(payload["tick"], int)

    def test_hud_negative_tick_validation(self, client: TestClient) -> None:
        """Rejects negative tick values."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/hud", params={"tick": -1})
        assert response.status_code == 422

    def test_hud_snapshot_stable_for_pause_game_time(self, client: TestClient) -> None:
        """HUD lookup remains stable when requested at a paused game_time value."""
        ticks_response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/ticks")
        assert ticks_response.status_code == 200
        ticks_payload = as_object_dict(cast(object, ticks_response.json()))
        pause_intervals = as_dict_list(cast(object, ticks_payload["pause_intervals"]))
        assert pause_intervals, "Expected pause interval in primary sample"

        paused_game_time = cast(float, pause_intervals[0]["game_time"])
        hud_a = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/hud", params={"game_time": paused_game_time})
        hud_b = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/hud", params={"game_time": paused_game_time})

        assert hud_a.status_code == 200
        assert hud_b.status_code == 200

        payload_a = as_object_dict(cast(object, hud_a.json()))
        payload_b = as_object_dict(cast(object, hud_b.json()))
        assert payload_a["tick"] == payload_b["tick"]
        assert payload_a["game_time"] == payload_b["game_time"]


class TestAdvantageEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/advantage."""

    def test_advantage_response_schema_and_summary(self, client: TestClient) -> None:
        """Returns advantage curves with full item schema and summary extrema."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/advantage")

        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == MATCH_ID_PRIMARY
        assert isinstance(payload["data"], list)
        assert isinstance(payload["time_basis"], dict)
        assert isinstance(payload["summary"], dict)
        assert payload["data"], "Expected non-empty advantage data for known parsed match"

        data = as_dict_list(cast(object, payload["data"]))
        
        
        item = data[0]
        assert {
            "tick",
            "game_time",
            "radiant_gold",
            "dire_gold",
            "gold_advantage",
            "xp_advantage",
        }.issubset(item.keys())

        summary = as_object_dict(cast(object, payload["summary"]))
        
        assert {
            "max_gold_advantage",
            "min_gold_advantage",
            "max_xp_advantage",
            "min_xp_advantage",
            "total_samples",
        }.issubset(summary.keys())

    def test_advantage_data_sorted_by_game_time(self, client: TestClient) -> None:
        """Ensures returned advantage series is ordered by game_time."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/advantage")
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        data = as_dict_list(payload["data"])
        
        game_times = [cast(float, row["game_time"]) for row in data]
        assert game_times == sorted(game_times)

    def test_advantage_missing_match_returns_404(self, client: TestClient) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{MISSING_MATCH_ID}/advantage")
        assert response.status_code == 404


class TestSmokesEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/smokes."""

    def test_smokes_response_shape(self, client: TestClient) -> None:
        """Returns normalized smokes payload shape with time contract metadata."""
        response = client.get(f"/api/v1/playback/{MATCH_ID_PRIMARY}/smokes")
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == MATCH_ID_PRIMARY
        assert isinstance(payload["smokes"], list)
        assert isinstance(payload["time_basis"], dict)
        assert isinstance(payload["pause_intervals"], list)
        assert isinstance(payload["summary"], dict)

        summary = as_object_dict(cast(object, payload["summary"]))
        assert {"total", "source", "teams"}.issubset(summary.keys())
        assert isinstance(summary["total"], int)
        assert summary["source"] in {"parquet", "metadata"}
        teams = as_object_dict(cast(object, summary["teams"]))
        assert {"radiant", "dire"}.issubset(teams.keys())

    def test_smokes_missing_match_returns_404(self, client: TestClient) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{MISSING_MATCH_ID}/smokes")
        assert response.status_code == 404

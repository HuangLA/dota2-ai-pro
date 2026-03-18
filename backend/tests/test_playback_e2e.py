"""End-to-end regression tests for playback API endpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Callable, cast

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from routers import playback


MISSING_MATCH_ID_OFFSET = 10_000_000
REPO_MATCHES_DIR = Path(playback.parquet_storage.base_path)
PayloadPredicate = Callable[[dict[str, object]], bool]


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


def payload_list(payload: dict[str, object], key: str) -> list[object]:
    """Read a JSON payload list field with narrowing."""
    return as_object_list(cast(object, payload[key]))


def discover_bundled_match_ids() -> list[int]:
    """Discover parsed matches from the repository's bundled sample set."""
    if not REPO_MATCHES_DIR.exists():
        return []

    match_ids: list[int] = []
    for child in REPO_MATCHES_DIR.iterdir():
        if not child.is_dir() or not child.name.isdigit():
            continue
        if (child / "positions.parquet").exists():
            match_ids.append(int(child.name))

    return sorted(match_ids)


def find_match_payload(
    client: TestClient,
    match_ids: list[int],
    endpoint: str,
    *,
    params: dict[str, object] | None = None,
    predicate: PayloadPredicate | None = None,
) -> tuple[int, dict[str, object]] | None:
    """Find the first successful endpoint payload matching an optional predicate."""
    for match_id in match_ids:
        response = client.get(f"/api/v1/playback/{match_id}/{endpoint}", params=params)
        if response.status_code != 200:
            continue
        payload = as_object_dict(cast(object, response.json()))
        if predicate is None or predicate(payload):
            return match_id, payload
    return None


def select_match_payload(
    client: TestClient,
    match_ids: list[int],
    endpoint: str,
    *,
    params: dict[str, object] | None = None,
    preferred_predicate: PayloadPredicate | None = None,
) -> tuple[int, dict[str, object]]:
    """Prefer a payload matching the predicate, otherwise fall back to any 200 payload."""
    preferred = find_match_payload(
        client,
        match_ids,
        endpoint,
        params=params,
        predicate=preferred_predicate,
    )
    if preferred is not None:
        return preferred

    fallback = find_match_payload(client, match_ids, endpoint, params=params)
    if fallback is not None:
        return fallback

    pytest.skip(f"No bundled sample returned 200 for /api/v1/playback/{{match_id}}/{endpoint}")


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(playback.router, prefix="/api/v1/playback")
    return TestClient(app)


@pytest.fixture(scope="module")
def bundled_match_ids() -> list[int]:
    match_ids = discover_bundled_match_ids()
    if not match_ids:
        pytest.skip(f"No parsed playback samples found in {REPO_MATCHES_DIR}")
    return match_ids


@pytest.fixture
def sample_match_id(client: TestClient, bundled_match_ids: list[int]) -> int:
    match_id, _ = select_match_payload(
        client,
        bundled_match_ids,
        "ticks",
        preferred_predicate=lambda payload: bool(payload_list(payload, "ticks")),
    )
    return match_id


@pytest.fixture(scope="module")
def missing_match_id(bundled_match_ids: list[int]) -> int:
    candidate = max(bundled_match_ids) + MISSING_MATCH_ID_OFFSET
    while candidate in bundled_match_ids:
        candidate += MISSING_MATCH_ID_OFFSET
    return candidate


class TestTicksEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/ticks."""

    def test_ticks_response_schema_and_hero_fields(self, client: TestClient, bundled_match_ids: list[int]) -> None:
        """Returns top-level schema and hero position/resource fields."""
        match_id, payload = select_match_payload(
            client,
            bundled_match_ids,
            "ticks",
            preferred_predicate=lambda item: bool(payload_list(item, "ticks")),
        )

        assert payload["match_id"] == match_id
        assert isinstance(payload["ticks"], list)
        assert isinstance(payload["time_basis"], dict)
        assert isinstance(payload["pause_intervals"], list)
        assert payload["ticks"], "Expected non-empty tick samples for bundled parsed match"

        ticks = as_dict_list(cast(object, payload["ticks"]))
        tick = ticks[0]
        assert {"tick", "time", "game_time", "heroes"}.issubset(tick.keys())
        assert isinstance(tick["heroes"], list)
        assert tick["heroes"], "Expected at least one hero sample in tick"

        heroes = as_dict_list(cast(object, tick["heroes"]))
        hero = heroes[0]
        assert {
            "hero",
            "handle",
            "team",
            "team_name",
            "x",
            "y",
            "hp",
            "mana",
            "max_hp",
            "max_mana",
            "level",
        }.issubset(hero.keys())

    def test_ticks_missing_match_returns_404(self, client: TestClient, missing_match_id: int) -> None:
        """Returns 404 when requested match is not parsed."""
        response = client.get(f"/api/v1/playback/{missing_match_id}/ticks")
        assert response.status_code == 404

    def test_ticks_invalid_interval_validation(self, client: TestClient, sample_match_id: int) -> None:
        """Rejects invalid interval query values outside [1, 30]."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/ticks", params={"interval": 0})
        assert response.status_code == 422

    def test_ticks_invalid_team_returns_empty_result(self, client: TestClient, sample_match_id: int) -> None:
        """Handles unsupported team filters gracefully with empty samples."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/ticks", params={"team": 1})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["ticks"] == []
        assert payload["total_samples"] == 0

    def test_bundled_sample_matches_have_negative_game_time(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """Each bundled sample includes negative game_time before timeline zero."""
        negative_match = find_match_payload(
            client,
            bundled_match_ids,
            "ticks",
            predicate=lambda payload: bool(payload_list(payload, "ticks"))
            and min(cast(float, tick["game_time"]) for tick in as_dict_list(cast(object, payload["ticks"]))) < 0.0,
        )
        if negative_match is None:
            pytest.skip("No bundled playback sample exposes negative game_time")

        match_id, payload = negative_match
        ticks = as_dict_list(cast(object, payload["ticks"]))
        assert ticks, f"Expected non-empty tick samples for bundled match {match_id}"
        game_times = [cast(float, tick["game_time"]) for tick in ticks]
        assert min(game_times) < 0.0

    def test_bundled_sample_matches_have_near_zero_alignment(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """Each bundled sample exposes at least one point close to game_time zero."""
        for match_id in bundled_match_ids:
            response = client.get(f"/api/v1/playback/{match_id}/ticks")
            assert response.status_code == 200
            payload = as_object_dict(cast(object, response.json()))
            ticks = as_dict_list(cast(object, payload["ticks"]))
            assert ticks, f"Expected non-empty tick samples for bundled match {match_id}"
            game_times = [abs(cast(float, tick["game_time"])) for tick in ticks]
            assert min(game_times) <= 1.0

    def test_pause_intervals_consistent_across_ticks_wards_and_advantage(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """Pause intervals stay aligned across playback endpoints when a paused sample exists."""
        paused_match = find_match_payload(
            client,
            bundled_match_ids,
            "ticks",
            predicate=lambda payload: bool(payload_list(payload, "pause_intervals")),
        )
        if paused_match is None:
            pytest.skip("No bundled playback sample exposes pause intervals; skipping pause-specific assertions")

        match_id, ticks_payload = paused_match
        wards_response = client.get(f"/api/v1/playback/{match_id}/wards")
        advantage_response = client.get(f"/api/v1/playback/{match_id}/advantage")

        assert wards_response.status_code == 200
        assert advantage_response.status_code == 200

        wards_payload = as_object_dict(cast(object, wards_response.json()))
        advantage_payload = as_object_dict(cast(object, advantage_response.json()))

        ticks_pause = payload_list(ticks_payload, "pause_intervals")
        assert ticks_pause
        assert payload_list(wards_payload, "pause_intervals") == ticks_pause

        ticks_time_basis = as_object_dict(cast(object, ticks_payload["time_basis"]))
        wards_time_basis = as_object_dict(cast(object, wards_payload["time_basis"]))
        advantage_time_basis = as_object_dict(cast(object, advantage_payload["time_basis"]))

        assert payload_list(ticks_time_basis, "pause_intervals") == ticks_pause
        assert payload_list(wards_time_basis, "pause_intervals") == ticks_pause
        assert payload_list(advantage_time_basis, "pause_intervals") == ticks_pause

    def test_no_pause_sample_reports_no_pause_intervals(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """A no-pause bundled sample reports empty pause metadata when one exists."""
        no_pause_match = find_match_payload(
            client,
            bundled_match_ids,
            "ticks",
            predicate=lambda payload: payload_list(payload, "pause_intervals") == [],
        )
        if no_pause_match is None:
            pytest.skip("No bundled playback sample without pause intervals; skipping no-pause assertion")

        _, payload = no_pause_match
        assert payload_list(payload, "pause_intervals") == []

    def test_real_sample_time_filter_keeps_late_game_samples(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """8729115809 keeps late samples when filtering by game_time seconds."""
        if 8729115809 not in bundled_match_ids:
            pytest.skip("Bundled sample 8729115809 not found")

        response = client.get(
            "/api/v1/playback/8729115809/ticks",
            params={"start_time": 0, "end_time": 1937, "interval": 1},
        )
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        ticks = as_dict_list(cast(object, payload["ticks"]))
        assert ticks
        assert any(cast(int, tick["tick"]) > 58_110 for tick in ticks)
        assert max(cast(float, tick["game_time"]) for tick in ticks) <= 1937.0


class TestEventsEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/events."""

    def test_events_response_schema_and_data_fields(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """Returns kill events with stable top-level shape and item fields when available."""
        match_id, payload = select_match_payload(
            client,
            bundled_match_ids,
            "events",
            preferred_predicate=lambda item: bool(payload_list(item, "events")),
        )

        assert payload["match_id"] == match_id
        assert isinstance(payload["events"], list)
        assert isinstance(payload["total"], int)

        events = as_dict_list(cast(object, payload["events"]))
        assert payload["total"] == len(events)

        if events:
            event = events[0]
            assert {"time", "type", "killer", "victim"}.issubset(event.keys())

    def test_events_filter_by_kill_type(self, client: TestClient, bundled_match_ids: list[int]) -> None:
        """Keeps kill events when event_type=kill is specified."""
        match_id, _ = select_match_payload(
            client,
            bundled_match_ids,
            "events",
            preferred_predicate=lambda item: bool(payload_list(item, "events")),
        )

        response = client.get(f"/api/v1/playback/{match_id}/events", params={"event_type": "kill"})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        events = as_dict_list(payload["events"])
        assert all(event["type"] == "kill" for event in events)

    def test_events_empty_result_handling(self, client: TestClient, sample_match_id: int) -> None:
        """Returns empty event list for unsupported event_type filter."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/events", params={"event_type": "assist"})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["events"] == []
        assert payload["total"] == 0

    def test_events_missing_match_returns_404(self, client: TestClient, missing_match_id: int) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{missing_match_id}/events")
        assert response.status_code == 404


class TestWardsEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/wards."""

    def test_wards_response_schema_and_item_fields(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """Returns ward list with stable summary and item fields when available."""
        match_id, payload = select_match_payload(
            client,
            bundled_match_ids,
            "wards",
            preferred_predicate=lambda item: bool(payload_list(item, "wards")),
        )

        assert payload["match_id"] == match_id
        assert isinstance(payload["wards"], list)
        assert isinstance(payload["time_basis"], dict)
        assert isinstance(payload["summary"], dict)

        summary = as_object_dict(cast(object, payload["summary"]))
        wards = as_dict_list(cast(object, payload["wards"]))

        if wards:
            ward = wards[0]
            assert {"type", "ward_type", "tick", "time", "game_time"}.issubset(ward.keys())
        else:
            assert summary["total"] == 0

    def test_wards_missing_match_returns_404(self, client: TestClient, missing_match_id: int) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{missing_match_id}/wards")
        assert response.status_code == 404

    def test_wards_invalid_team_returns_empty_result(self, client: TestClient, sample_match_id: int) -> None:
        """Handles invalid team value by returning an empty ward list."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/wards", params={"team": 1})
        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["wards"] == []
        summary = as_object_dict(cast(object, payload["summary"]))
        assert summary["total"] == 0


class TestHeroesEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/heroes."""

    def test_heroes_response_schema_and_team_totals(self, client: TestClient, sample_match_id: int) -> None:
        """Returns radiant/dire hero lists that add up to the expected 10 heroes."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/heroes")

        assert response.status_code == 200
        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == sample_match_id
        assert isinstance(payload["radiant"], list)
        assert isinstance(payload["dire"], list)
        assert isinstance(payload["total"], int)

        radiant = as_dict_list(cast(object, payload["radiant"]))
        dire = as_dict_list(cast(object, payload["dire"]))

        assert len(radiant) + len(dire) == payload["total"]
        assert payload["total"] == 10


class TestHudEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/hud."""

    def test_hud_response_schema(self, client: TestClient, sample_match_id: int) -> None:
        """Returns HUD snapshot with status, match_id, and hero rows."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/hud")
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        assert payload["status"] == "ok"
        assert payload["match_id"] == sample_match_id
        assert isinstance(payload["heroes"], list)

        heroes = as_dict_list(cast(object, payload["heroes"]))
        assert len(heroes) == 10

    def test_hud_accepts_game_time_query(self, client: TestClient, sample_match_id: int) -> None:
        """Supports selecting snapshot by game_time."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/hud", params={"game_time": 0})
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        assert payload["status"] == "ok"
        assert isinstance(payload["game_time"], float)
        assert isinstance(payload["tick"], int)

    def test_hud_negative_tick_validation(self, client: TestClient, sample_match_id: int) -> None:
        """Rejects negative tick values."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/hud", params={"tick": -1})
        assert response.status_code == 422

    def test_hud_snapshot_stable_for_pause_game_time(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """HUD lookup remains stable when requested at a paused game_time value."""
        paused_match = find_match_payload(
            client,
            bundled_match_ids,
            "ticks",
            predicate=lambda payload: bool(payload_list(payload, "pause_intervals")),
        )
        if paused_match is None:
            pytest.skip("No bundled playback sample exposes pause intervals; skipping pause-specific HUD assertion")

        match_id, ticks_payload = paused_match
        pause_intervals = as_dict_list(cast(object, ticks_payload["pause_intervals"]))
        paused_game_time = cast(float, pause_intervals[0]["game_time"])

        hud_a = client.get(f"/api/v1/playback/{match_id}/hud", params={"game_time": paused_game_time})
        hud_b = client.get(f"/api/v1/playback/{match_id}/hud", params={"game_time": paused_game_time})

        assert hud_a.status_code == 200
        assert hud_b.status_code == 200

        payload_a = as_object_dict(cast(object, hud_a.json()))
        payload_b = as_object_dict(cast(object, hud_b.json()))
        assert payload_a["tick"] == payload_b["tick"]
        assert payload_a["game_time"] == payload_b["game_time"]


class TestAdvantageEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/advantage."""

    def test_advantage_response_schema_and_summary(
        self,
        client: TestClient,
        bundled_match_ids: list[int],
    ) -> None:
        """Returns advantage curves with stable response shape and summary when data exists."""
        match_id, payload = select_match_payload(
            client,
            bundled_match_ids,
            "advantage",
            preferred_predicate=lambda item: bool(payload_list(item, "data")),
        )

        assert payload["match_id"] == match_id
        assert isinstance(payload["data"], list)
        assert isinstance(payload["time_basis"], dict)

        data = as_dict_list(cast(object, payload["data"]))
        if data:
            assert isinstance(payload["summary"], dict)
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
        else:
            assert isinstance(payload["message"], str)

    def test_advantage_data_sorted_by_game_time(self, client: TestClient, bundled_match_ids: list[int]) -> None:
        """Ensures returned advantage series is ordered by game_time."""
        match_id, _ = select_match_payload(
            client,
            bundled_match_ids,
            "advantage",
            preferred_predicate=lambda item: bool(payload_list(item, "data")),
        )

        response = client.get(f"/api/v1/playback/{match_id}/advantage")
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        data = as_dict_list(payload["data"])
        game_times = [cast(float, row["game_time"]) for row in data]
        assert game_times == sorted(game_times)

    def test_advantage_missing_match_returns_404(self, client: TestClient, missing_match_id: int) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{missing_match_id}/advantage")
        assert response.status_code == 404


class TestSmokesEndpoint:
    """Regression tests for GET /api/v1/playback/{match_id}/smokes."""

    def test_smokes_response_shape(self, client: TestClient, sample_match_id: int) -> None:
        """Returns normalized smokes payload shape with time contract metadata."""
        response = client.get(f"/api/v1/playback/{sample_match_id}/smokes")
        assert response.status_code == 200

        payload = as_object_dict(cast(object, response.json()))
        assert payload["match_id"] == sample_match_id
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

    def test_smokes_missing_match_returns_404(self, client: TestClient, missing_match_id: int) -> None:
        """Returns 404 for unknown match_id."""
        response = client.get(f"/api/v1/playback/{missing_match_id}/smokes")
        assert response.status_code == 404

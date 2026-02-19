"""Tests for admin OpenDota sync endpoint slice."""

from __future__ import annotations

from fastapi.testclient import TestClient

from main import app
from routers import admin
from services.opendota_service import OpenDotaServiceError


def test_admin_opendota_sync_recent_success(monkeypatch) -> None:
    async def _fake_fetch(limit: int) -> list[dict[str, int]]:
        assert limit == 2
        return [{"match_id": 1}, {"match_id": 2}]

    monkeypatch.setattr(admin.opendota_service, "fetch_pro_matches", _fake_fetch)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"dry_run": True, "limit": 2},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "fetched": 2,
        "dry_run": True,
        "message": "Dry-run fetch completed (source=pro). [reference_sync=skipped;reason=dry_run_mode]",
        "inserted": 0,
        "updated": 0,
        "reference_teams_inserted": 0,
        "reference_teams_updated": 0,
        "reference_leagues_inserted": 0,
        "reference_leagues_updated": 0,
    }


def test_admin_opendota_sync_recent_persist_success(monkeypatch) -> None:
    async def _fake_fetch(limit: int) -> list[dict[str, int]]:
        assert limit == 2
        return [
            {"match_id": 1, "start_time": 100, "duration": 200},
            {"match_id": 2, "start_time": 101, "duration": 210},
        ]

    def _fake_upsert(matches: list[dict[str, int]]) -> tuple[int, int]:
        assert len(matches) == 2
        return 1, 1

    monkeypatch.setattr(admin.opendota_service, "fetch_pro_matches", _fake_fetch)
    monkeypatch.setattr(admin.opendota_match_storage, "upsert_recent_matches", _fake_upsert)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"dry_run": False, "persist": True, "limit": 2, "sync_reference": False},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "fetched": 2,
        "dry_run": False,
        "message": "Fetch and persistence completed (source=pro). [reference_sync=skipped;reason=disabled_by_request]",
        "inserted": 1,
        "updated": 1,
        "reference_teams_inserted": 0,
        "reference_teams_updated": 0,
        "reference_leagues_inserted": 0,
        "reference_leagues_updated": 0,
    }


def test_admin_opendota_sync_recent_auto_reference_sync(monkeypatch) -> None:
    async def _fake_sync_recent_matches(
        *,
        limit: int,
        dry_run: bool,
        persist: bool,
        pro_only: bool,
    ) -> dict[str, int | bool | str]:
        assert limit == 2
        assert dry_run is False
        assert persist is True
        assert pro_only is True
        return {
            "status": "ok",
            "fetched": 2,
            "dry_run": False,
            "message": "Fetch and persistence completed (source=pro).",
            "inserted": 1,
            "updated": 1,
        }

    called: dict[str, bool] = {"reference": False}

    async def _fake_sync_reference_data(
        *,
        team_limit: int,
        league_limit: int,
        dry_run: bool,
        persist: bool,
    ) -> dict[str, int | bool | str]:
        called["reference"] = True
        assert team_limit == 300
        assert league_limit == 400
        assert dry_run is False
        assert persist is True
        return {
            "status": "ok",
            "dry_run": False,
            "teams_fetched": 300,
            "leagues_fetched": 400,
            "teams_inserted": 5,
            "teams_updated": 6,
            "leagues_inserted": 7,
            "leagues_updated": 8,
            "message": "Reference fetch and persistence completed.",
        }

    monkeypatch.setattr(admin.opendota_sync_service, "sync_recent_matches", _fake_sync_recent_matches)
    monkeypatch.setattr(admin.opendota_sync_service, "sync_reference_data", _fake_sync_reference_data)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={
            "dry_run": False,
            "persist": True,
            "limit": 2,
            "sync_reference": True,
            "reference_team_limit": 300,
            "reference_league_limit": 400,
        },
    )

    assert called["reference"] is True
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "fetched": 2,
        "dry_run": False,
        "message": "Fetch and persistence completed (source=pro). [reference_sync=executed;reason=persist_flow]",
        "inserted": 1,
        "updated": 1,
        "reference_teams_inserted": 5,
        "reference_teams_updated": 6,
        "reference_leagues_inserted": 7,
        "reference_leagues_updated": 8,
    }


def test_admin_opendota_sync_recent_sync_reference_disabled_not_called(monkeypatch) -> None:
    async def _fake_sync_recent_matches(
        *,
        limit: int,
        dry_run: bool,
        persist: bool,
        pro_only: bool,
    ) -> dict[str, int | bool | str]:
        assert limit == 2
        assert dry_run is False
        assert persist is True
        assert pro_only is True
        return {
            "status": "ok",
            "fetched": 2,
            "dry_run": False,
            "message": "Fetch and persistence completed (source=pro).",
            "inserted": 1,
            "updated": 1,
        }

    called: dict[str, bool] = {"reference": False}

    async def _fake_sync_reference_data(
        *,
        team_limit: int,
        league_limit: int,
        dry_run: bool,
        persist: bool,
    ) -> dict[str, int | bool | str]:
        called["reference"] = True
        return {
            "status": "ok",
            "dry_run": dry_run,
            "teams_fetched": 0,
            "leagues_fetched": 0,
            "teams_inserted": 0,
            "teams_updated": 0,
            "leagues_inserted": 0,
            "leagues_updated": 0,
            "message": "Reference fetch completed (persistence disabled).",
        }

    monkeypatch.setattr(admin.opendota_sync_service, "sync_recent_matches", _fake_sync_recent_matches)
    monkeypatch.setattr(admin.opendota_sync_service, "sync_reference_data", _fake_sync_reference_data)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"dry_run": False, "persist": True, "limit": 2, "sync_reference": False},
    )

    assert called["reference"] is False
    assert response.status_code == 200
    assert response.json()["reference_teams_inserted"] == 0
    assert response.json()["reference_leagues_updated"] == 0
    assert "reference_sync=skipped;reason=disabled_by_request" in response.json()["message"]


def test_admin_opendota_sync_recent_controlled_error(monkeypatch) -> None:
    async def _fake_fetch(limit: int) -> list[dict[str, int]]:
        raise OpenDotaServiceError("OpenDota request timed out.")

    monkeypatch.setattr(admin.opendota_service, "fetch_pro_matches", _fake_fetch)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"dry_run": False, "limit": 10},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "error",
        "fetched": 0,
        "dry_run": False,
        "message": "OpenDota request timed out. [reference_sync=skipped;reason=recent_sync_failed]",
        "inserted": 0,
        "updated": 0,
        "reference_teams_inserted": 0,
        "reference_teams_updated": 0,
        "reference_leagues_inserted": 0,
        "reference_leagues_updated": 0,
    }


def test_admin_opendota_sync_recent_limit_validation() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"dry_run": False, "persist": True, "limit": 0},
    )

    assert response.status_code == 422


def test_admin_opendota_sync_recent_reference_limit_validation() -> None:
    client = TestClient(app)

    team_limit_response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"reference_team_limit": 0},
    )
    assert team_limit_response.status_code == 422

    league_limit_response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"reference_league_limit": 1001},
    )
    assert league_limit_response.status_code == 422


def test_admin_opendota_sync_recent_supports_public_source(monkeypatch) -> None:
    async def _fake_fetch_recent(limit: int) -> list[dict[str, int]]:
        assert limit == 3
        return [{"match_id": 11}, {"match_id": 12}, {"match_id": 13}]

    monkeypatch.setattr(admin.opendota_service, "fetch_recent_matches", _fake_fetch_recent)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/recent",
        json={"dry_run": True, "pro_only": False, "limit": 3},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "fetched": 3,
        "dry_run": True,
        "message": "Dry-run fetch completed (source=public). [reference_sync=skipped;reason=dry_run_mode]",
        "inserted": 0,
        "updated": 0,
        "reference_teams_inserted": 0,
        "reference_teams_updated": 0,
        "reference_leagues_inserted": 0,
        "reference_leagues_updated": 0,
    }


def test_admin_opendota_matches_list_success(monkeypatch) -> None:
    def _fake_list_recent_matches(
        *,
        limit: int,
        offset: int,
        team_id: int | None = None,
        leagueid: int | None = None,
        start_time_from: int | None = None,
        start_time_to: int | None = None,
    ) -> tuple[int, list[dict[str, int]]]:
        assert limit == 2
        assert offset == 1
        assert team_id is None
        assert leagueid is None
        assert start_time_from is None
        assert start_time_to is None
        return (
            10,
            [
                {
                    "match_id": 1001,
                    "start_time": 1700001001,
                    "duration": 2300,
                    "radiant_team_id": 101,
                    "dire_team_id": 201,
                    "leagueid": 301,
                    "last_synced_at": 1700002000,
                }
            ],
        )

    monkeypatch.setattr(admin.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)

    client = TestClient(app)
    response = client.get("/api/v1/admin/opendota/matches", params={"limit": 2, "offset": 1})

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "total": 10,
        "limit": 2,
        "offset": 1,
        "matches": [
            {
                "match_id": 1001,
                "start_time": 1700001001,
                "duration": 2300,
                "radiant_team_id": 101,
                "dire_team_id": 201,
                "leagueid": 301,
                "last_synced_at": 1700002000,
            }
        ],
    }


def test_admin_opendota_matches_list_limit_validation() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/admin/opendota/matches", params={"limit": 0})
    assert response.status_code == 422


def test_admin_opendota_matches_list_rejects_reversed_time_range() -> None:
    client = TestClient(app)
    response = client.get(
        "/api/v1/admin/opendota/matches",
        params={"start_time_from": 200, "start_time_to": 100},
    )

    assert response.status_code == 422


def test_admin_match_database_list_success(monkeypatch) -> None:
    def _fake_list_match_database(
        *,
        limit: int,
        offset: int,
        professional_only: bool = True,
        team_id: int | None = None,
        leagueid: int | None = None,
        has_download: bool | None = None,
        start_time_from: int | None = None,
        start_time_to: int | None = None,
    ) -> tuple[int, list[dict[str, object]]]:
        assert limit == 2
        assert offset == 1
        assert professional_only is True
        assert team_id == 15
        assert leagueid == 15475
        assert has_download is True
        assert start_time_from == 1700050000
        assert start_time_to == 1700060000
        return (
            1,
            [
                {
                    "match_id": 8123456789,
                    "start_time": 1700054321,
                    "duration": 2450,
                    "radiant_team_id": 15,
                    "dire_team_id": 2163,
                    "leagueid": 15475,
                    "radiant_team_name": "Team Liquid",
                    "dire_team_name": "Team Falcons",
                    "league_name": "DreamLeague Season 26",
                    "download_status": "prepared",
                    "download_task_id": "task-prepare-1",
                    "download_attempt_count": 0,
                }
            ],
        )

    monkeypatch.setattr(admin.match_database_storage, "list_match_database", _fake_list_match_database)

    client = TestClient(app)
    response = client.get(
        "/api/v1/admin/match-database",
        params={
            "limit": 2,
            "offset": 1,
            "team_id": 15,
            "leagueid": 15475,
            "has_download": True,
            "start_time_from": 1700050000,
            "start_time_to": 1700060000,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "total": 1,
        "limit": 2,
        "offset": 1,
        "matches": [
            {
                "match_id": 8123456789,
                "start_time": 1700054321,
                "duration": 2450,
                "radiant_team_id": 15,
                "dire_team_id": 2163,
                "leagueid": 15475,
                "radiant_team_name": "Team Liquid",
                "dire_team_name": "Team Falcons",
                "league_name": "DreamLeague Season 26",
                "download_status": "prepared",
                "download_task_id": "task-prepare-1",
                "download_attempt_count": 0,
            }
        ],
    }


def test_admin_match_database_list_limit_validation() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/admin/match-database", params={"limit": 0})
    assert response.status_code == 422


def test_admin_match_database_list_rejects_reversed_time_range() -> None:
    client = TestClient(app)
    response = client.get(
        "/api/v1/admin/match-database",
        params={"start_time_from": 200, "start_time_to": 100},
    )

    assert response.status_code == 422


def test_admin_match_database_list_allows_professional_only_false(monkeypatch) -> None:
    def _fake_list_match_database(
        *,
        limit: int,
        offset: int,
        professional_only: bool = True,
        team_id: int | None = None,
        leagueid: int | None = None,
        has_download: bool | None = None,
        start_time_from: int | None = None,
        start_time_to: int | None = None,
    ) -> tuple[int, list[dict[str, object]]]:
        assert professional_only is False
        return 0, []

    monkeypatch.setattr(admin.match_database_storage, "list_match_database", _fake_list_match_database)

    client = TestClient(app)
    response = client.get("/api/v1/admin/match-database", params={"professional_only": False})

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_admin_opendota_sync_reference_success(monkeypatch) -> None:
    async def _fake_sync_reference_data(
        *,
        team_limit: int,
        league_limit: int,
        dry_run: bool,
        persist: bool,
    ) -> dict[str, int | bool | str]:
        assert team_limit == 2
        assert league_limit == 3
        assert dry_run is True
        assert persist is False
        return {
            "status": "ok",
            "dry_run": True,
            "teams_fetched": 2,
            "leagues_fetched": 3,
            "teams_inserted": 0,
            "teams_updated": 0,
            "leagues_inserted": 0,
            "leagues_updated": 0,
            "message": "Reference dry-run fetch completed.",
        }

    monkeypatch.setattr(admin.opendota_sync_service, "sync_reference_data", _fake_sync_reference_data)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/reference",
        json={"dry_run": True, "persist": False, "team_limit": 2, "league_limit": 3},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "dry_run": True,
        "teams_fetched": 2,
        "leagues_fetched": 3,
        "teams_inserted": 0,
        "teams_updated": 0,
        "leagues_inserted": 0,
        "leagues_updated": 0,
        "message": "Reference dry-run fetch completed.",
    }


def test_admin_opendota_sync_reference_team_limit_validation() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/opendota/sync/reference",
        json={"dry_run": True, "team_limit": 0, "league_limit": 10},
    )
    assert response.status_code == 422


def test_admin_opendota_teams_list_success(monkeypatch) -> None:
    def _fake_list_teams(*, limit: int, offset: int) -> tuple[int, list[dict[str, int | str]]]:
        assert limit == 2
        assert offset == 1
        return (
            5,
            [
                {
                    "team_id": 15,
                    "name": "Team A",
                    "tag": "TA",
                    "wins": 10,
                    "losses": 2,
                    "last_synced_at": 1700009999,
                }
            ],
        )

    monkeypatch.setattr(admin.opendota_reference_storage, "list_teams", _fake_list_teams)

    client = TestClient(app)
    response = client.get("/api/v1/admin/opendota/teams", params={"limit": 2, "offset": 1})

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "total": 5,
        "limit": 2,
        "offset": 1,
        "teams": [
            {
                "team_id": 15,
                "name": "Team A",
                "tag": "TA",
                "wins": 10,
                "losses": 2,
                "last_synced_at": 1700009999,
            }
        ],
    }


def test_admin_opendota_leagues_list_success(monkeypatch) -> None:
    def _fake_list_leagues(*, limit: int, offset: int) -> tuple[int, list[dict[str, int | str]]]:
        assert limit == 2
        assert offset == 0
        return (
            3,
            [
                {
                    "leagueid": 15475,
                    "name": "DreamLeague",
                    "tier": "professional",
                    "last_synced_at": 1700010000,
                }
            ],
        )

    monkeypatch.setattr(admin.opendota_reference_storage, "list_leagues", _fake_list_leagues)

    client = TestClient(app)
    response = client.get("/api/v1/admin/opendota/leagues", params={"limit": 2, "offset": 0})

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "total": 3,
        "limit": 2,
        "offset": 0,
        "leagues": [
            {
                "leagueid": 15475,
                "name": "DreamLeague",
                "tier": "professional",
                "last_synced_at": 1700010000,
            }
        ],
    }


def test_admin_replay_prepare_success(monkeypatch) -> None:
    task_state: dict[str, object] = {
        "task_id": "task-1",
        "match_id": 8674716612,
        "status": "pending",
        "attempt_count": 0,
        "replay_url": None,
        "download_path": None,
        "error_message": None,
        "created_at": 1700100000,
        "updated_at": 1700100000,
    }

    def _fake_create_prepare_task(match_id: int) -> dict[str, object]:
        assert match_id == 8674716612
        return dict(task_state)

    async def _fake_fetch_match_details(match_id: int) -> dict[str, int]:
        assert match_id == 8674716612
        return {"cluster": 236, "replay_salt": 55500123}

    def _fake_mark_prepared(task_id: str, replay_url: str) -> dict[str, object]:
        assert task_id == "task-1"
        assert replay_url.endswith("8674716612_55500123.dem.bz2")
        updated = dict(task_state)
        updated["status"] = "prepared"
        updated["replay_url"] = replay_url
        updated["updated_at"] = 1700100001
        return updated

    monkeypatch.setattr(admin.replay_download_storage, "create_prepare_task", _fake_create_prepare_task)
    monkeypatch.setattr(admin.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(admin.replay_download_storage, "mark_prepared", _fake_mark_prepared)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/prepare",
        json={"match_id": 8674716612},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["task"]["status"] == "prepared"
    assert payload["task"]["error_code"] is None
    assert payload["task"]["error_message"] is None
    assert payload["task"]["replay_url"] == (
        "https://replay236.valve.net/570/8674716612_55500123.dem.bz2"
    )


def test_admin_match_database_download_action_prepare_success(monkeypatch) -> None:
    async def _fake_trigger(match_id: int, mode: str) -> dict[str, object]:
        assert match_id == 8674716612
        assert mode == "prepare"
        return {
            "status": "ok",
            "message": "Replay download prepare action finished.",
            "task": {
                "task_id": "task-mdb-prepare-1",
                "match_id": 8674716612,
                "status": "prepared",
                "attempt_count": 0,
                "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
                "download_path": None,
                "error_code": None,
                "error_message": None,
                "created_at": 1700100000,
                "updated_at": 1700100001,
            },
        }

    monkeypatch.setattr(admin.replay_download_service, "trigger_match_download_action", _fake_trigger)

    client = TestClient(app)
    response = client.post("/api/v1/admin/match-database/8674716612/download", json={"mode": "prepare"})

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "message": "Replay download prepare action finished.",
        "task": {
            "task_id": "task-mdb-prepare-1",
            "match_id": 8674716612,
            "status": "prepared",
            "attempt_count": 0,
            "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
            "download_path": None,
            "error_code": None,
            "error_message": None,
            "created_at": 1700100000,
            "updated_at": 1700100001,
        },
    }


def test_admin_match_database_download_action_prepare_and_execute_success(monkeypatch) -> None:
    async def _fake_trigger(match_id: int, mode: str) -> dict[str, object]:
        assert match_id == 8674716612
        assert mode == "prepare_and_execute"
        return {
            "status": "ok",
            "message": "Replay download prepare_and_execute action finished.",
            "task": {
                "task_id": "task-mdb-exec-1",
                "match_id": 8674716612,
                "status": "completed",
                "attempt_count": 1,
                "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
                "download_path": "backend/data/replays/8674716612.dem.bz2",
                "error_code": None,
                "error_message": None,
                "created_at": 1700100050,
                "updated_at": 1700100060,
            },
        }

    monkeypatch.setattr(admin.replay_download_service, "trigger_match_download_action", _fake_trigger)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/match-database/8674716612/download",
        json={"mode": "prepare_and_execute"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["task"]["status"] == "completed"
    assert response.json()["task"]["attempt_count"] == 1


def test_admin_match_database_download_action_blocks_downloading(monkeypatch) -> None:
    async def _fake_trigger(match_id: int, mode: str) -> dict[str, object]:
        assert match_id == 8674716612
        assert mode == "prepare"
        return {
            "status": "error",
            "message": "Replay download already in progress for match_id=8674716612.",
            "task": {
                "task_id": "task-mdb-running-1",
                "match_id": 8674716612,
                "status": "downloading",
                "attempt_count": 1,
                "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
                "download_path": None,
                "error_code": None,
                "error_message": None,
                "created_at": 1700100050,
                "updated_at": 1700100060,
            },
        }

    monkeypatch.setattr(admin.replay_download_service, "trigger_match_download_action", _fake_trigger)

    client = TestClient(app)
    response = client.post("/api/v1/admin/match-database/8674716612/download", json={"mode": "prepare"})

    assert response.status_code == 200
    assert response.json()["status"] == "error"
    assert "already in progress" in response.json()["message"]
    assert response.json()["task"]["status"] == "downloading"


def test_admin_match_database_download_action_mode_invalid_returns_422() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/match-database/8674716612/download",
        json={"mode": "invalid"},
    )

    assert response.status_code == 422


def test_admin_replay_prepare_failure_marks_task_failed(monkeypatch) -> None:
    task_state: dict[str, object] = {
        "task_id": "task-failed",
        "match_id": 8676017978,
        "status": "pending",
        "attempt_count": 0,
        "replay_url": None,
        "download_path": None,
        "error_message": None,
        "created_at": 1700100100,
        "updated_at": 1700100100,
    }

    def _fake_create_prepare_task(match_id: int) -> dict[str, object]:
        assert match_id == 8676017978
        return dict(task_state)

    async def _fake_fetch_match_details(match_id: int) -> dict[str, int]:
        assert match_id == 8676017978
        return {"replay_salt": 9999}

    def _fake_mark_failed(task_id: str, error_message: str, error_code: str) -> dict[str, object]:
        assert task_id == "task-failed"
        assert "Missing required replay fields" in error_message
        assert error_code == "UNKNOWN_ERROR"
        updated = dict(task_state)
        updated["status"] = "failed"
        updated["error_code"] = error_code
        updated["error_message"] = error_message
        updated["updated_at"] = 1700100101
        return updated

    monkeypatch.setattr(admin.replay_download_storage, "create_prepare_task", _fake_create_prepare_task)
    monkeypatch.setattr(admin.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(admin.replay_download_storage, "mark_failed", _fake_mark_failed)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/prepare",
        json={"match_id": 8676017978},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["task"]["status"] == "failed"
    assert payload["task"]["error_code"] == "UNKNOWN_ERROR"
    assert payload["task"]["replay_url"] is None
    assert "Missing required replay fields" in payload["task"]["error_message"]


def test_admin_replay_download_tasks_list_shape(monkeypatch) -> None:
    def _fake_list_tasks(
        *,
        limit: int,
        offset: int,
        status: str | None = None,
        match_id: int | None = None,
    ) -> dict[str, object]:
        assert limit == 2
        assert offset == 1
        assert status is None
        assert match_id is None
        return {
            "total": 3,
            "tasks": [
                {
                    "task_id": "task-2",
                    "match_id": 8123456789,
                    "status": "prepared",
                    "attempt_count": 1,
                    "replay_url": "https://replay236.valve.net/570/8123456789_1000.dem.bz2",
                    "download_path": None,
                    "error_code": None,
                    "error_message": None,
                    "created_at": 1700100200,
                    "updated_at": 1700100201,
                }
            ],
        }

    monkeypatch.setattr(admin.replay_download_storage, "list_tasks", _fake_list_tasks)

    client = TestClient(app)
    response = client.get(
        "/api/v1/admin/replays/download/tasks",
        params={"limit": 2, "offset": 1},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "total": 3,
        "limit": 2,
        "offset": 1,
        "tasks": [
            {
                "task_id": "task-2",
                "match_id": 8123456789,
                "status": "prepared",
                "attempt_count": 1,
                "replay_url": "https://replay236.valve.net/570/8123456789_1000.dem.bz2",
                "download_path": None,
                "error_code": None,
                "error_message": None,
                "created_at": 1700100200,
                "updated_at": 1700100201,
            }
        ],
    }


def test_admin_replay_download_task_detail_success(monkeypatch) -> None:
    def _fake_get_task(task_id: str) -> dict[str, object] | None:
        assert task_id == "task-detail-1"
        return {
            "task_id": "task-detail-1",
            "match_id": 8674716612,
            "status": "completed",
            "attempt_count": 1,
            "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
            "download_path": "backend/data/replays/8674716612.dem.bz2",
            "error_code": None,
            "error_message": None,
            "created_at": 1700101200,
            "updated_at": 1700101210,
        }

    monkeypatch.setattr(admin.replay_download_service, "get_task", _fake_get_task)

    client = TestClient(app)
    response = client.get("/api/v1/admin/replays/download/tasks/task-detail-1")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "message": "Replay download task loaded.",
        "task": {
            "task_id": "task-detail-1",
            "match_id": 8674716612,
            "status": "completed",
            "attempt_count": 1,
            "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
            "download_path": "backend/data/replays/8674716612.dem.bz2",
            "error_code": None,
            "error_message": None,
            "created_at": 1700101200,
            "updated_at": 1700101210,
        },
    }


def test_admin_replay_download_task_detail_not_found(monkeypatch) -> None:
    def _fake_get_task(task_id: str) -> dict[str, object] | None:
        assert task_id == "missing-task"
        return None

    monkeypatch.setattr(admin.replay_download_service, "get_task", _fake_get_task)

    client = TestClient(app)
    response = client.get("/api/v1/admin/replays/download/tasks/missing-task")

    assert response.status_code == 200
    assert response.json() == {
        "status": "error",
        "message": "Replay download task not found: missing-task",
        "task": None,
    }


def test_admin_replay_download_by_match_success(monkeypatch) -> None:
    async def _fake_prepare_and_execute(match_id: int) -> dict[str, object]:
        assert match_id == 8674716612
        return {
            "task_id": "task-by-match-1",
            "match_id": 8674716612,
            "status": "completed",
            "attempt_count": 1,
            "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
            "download_path": "backend/data/replays/8674716612.dem.bz2",
            "error_code": None,
            "error_message": None,
            "created_at": 1700101300,
            "updated_at": 1700101320,
        }

    monkeypatch.setattr(admin.replay_download_service, "prepare_and_execute", _fake_prepare_and_execute)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/by-match",
        json={"match_id": 8674716612},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "task": {
            "task_id": "task-by-match-1",
            "match_id": 8674716612,
            "status": "completed",
            "attempt_count": 1,
            "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
            "download_path": "backend/data/replays/8674716612.dem.bz2",
            "error_code": None,
            "error_message": None,
            "created_at": 1700101300,
            "updated_at": 1700101320,
        },
    }


def test_admin_replay_download_by_match_prepare_failed_task(monkeypatch) -> None:
    async def _fake_prepare_and_execute(match_id: int) -> dict[str, object]:
        assert match_id == 8676017978
        return {
            "task_id": "task-by-match-failed",
            "match_id": 8676017978,
            "status": "failed",
            "attempt_count": 0,
            "replay_url": None,
            "download_path": None,
            "error_code": "UNKNOWN_ERROR",
            "error_message": "Missing required replay fields from OpenDota match details (cluster/replay_salt).",
            "created_at": 1700101400,
            "updated_at": 1700101401,
        }

    monkeypatch.setattr(admin.replay_download_service, "prepare_and_execute", _fake_prepare_and_execute)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/by-match",
        json={"match_id": 8676017978},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "task": {
            "task_id": "task-by-match-failed",
            "match_id": 8676017978,
            "status": "failed",
            "attempt_count": 0,
            "replay_url": None,
            "download_path": None,
            "error_code": "UNKNOWN_ERROR",
            "error_message": "Missing required replay fields from OpenDota match details (cluster/replay_salt).",
            "created_at": 1700101400,
            "updated_at": 1700101401,
        },
    }


def test_admin_replay_download_execute_success(monkeypatch) -> None:
    async def _fake_execute_download(task_id: str) -> dict[str, object]:
        assert task_id == "task-exec-1"
        return {
            "task_id": "task-exec-1",
            "match_id": 8674716612,
            "status": "completed",
            "attempt_count": 1,
            "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
            "download_path": "backend/data/replays/8674716612.dem.bz2",
            "error_code": None,
            "error_message": None,
            "created_at": 1700101000,
            "updated_at": 1700101005,
        }

    monkeypatch.setattr(admin.replay_download_service, "execute_download", _fake_execute_download)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/execute",
        json={"task_id": "task-exec-1"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "message": "Replay download completed.",
        "task": {
            "task_id": "task-exec-1",
            "match_id": 8674716612,
            "status": "completed",
            "attempt_count": 1,
            "replay_url": "https://replay236.valve.net/570/8674716612_55500123.dem.bz2",
            "download_path": "backend/data/replays/8674716612.dem.bz2",
            "error_code": None,
            "error_message": None,
            "created_at": 1700101000,
            "updated_at": 1700101005,
        },
    }


def test_admin_replay_download_execute_non_prepared_is_controlled(monkeypatch) -> None:
    async def _fake_execute_download(task_id: str) -> dict[str, object]:
        raise admin.OpenDotaServiceError(
            f"Replay download task {task_id} must be in prepared status to execute."
        )

    monkeypatch.setattr(admin.replay_download_service, "execute_download", _fake_execute_download)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/execute",
        json={"task_id": "task-already-completed"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "error",
        "message": (
            "Replay download task task-already-completed must be in prepared status to execute."
        ),
        "task": None,
    }


def test_admin_replay_download_execute_download_failure(monkeypatch) -> None:
    async def _fake_execute_download(task_id: str) -> dict[str, object]:
        return {
            "task_id": task_id,
            "match_id": 8676017978,
            "status": "failed",
            "attempt_count": 2,
            "replay_url": "https://replay236.valve.net/570/8676017978_999.dem.bz2",
            "download_path": None,
            "error_code": "HTTP_ERROR",
            "error_message": "Replay download failed with status 404.",
            "created_at": 1700102000,
            "updated_at": 1700102010,
        }

    monkeypatch.setattr(admin.replay_download_service, "execute_download", _fake_execute_download)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/execute",
        json={"task_id": "task-exec-2"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["message"] == "Replay download failed."
    assert response.json()["task"]["status"] == "failed"
    assert "404" in response.json()["task"]["error_message"]


def test_admin_replay_download_retry_success(monkeypatch) -> None:
    def _fake_retry(task_id: str) -> dict[str, object]:
        assert task_id == "task-retry-1"
        return {
            "task_id": "task-retry-1",
            "match_id": 8676017978,
            "status": "prepared",
            "attempt_count": 2,
            "replay_url": "https://replay236.valve.net/570/8676017978_999.dem.bz2",
            "download_path": None,
            "error_code": None,
            "error_message": None,
            "created_at": 1700103000,
            "updated_at": 1700103010,
        }

    monkeypatch.setattr(admin.replay_download_service, "retry_task", _fake_retry)

    client = TestClient(app)
    response = client.post(
        "/api/v1/admin/replays/download/retry",
        json={"task_id": "task-retry-1"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "message": "Replay download task reset to prepared.",
        "task": {
            "task_id": "task-retry-1",
            "match_id": 8676017978,
            "status": "prepared",
            "attempt_count": 2,
            "replay_url": "https://replay236.valve.net/570/8676017978_999.dem.bz2",
            "download_path": None,
            "error_code": None,
            "error_message": None,
            "created_at": 1700103000,
            "updated_at": 1700103010,
        },
    }


def test_admin_replay_download_tasks_status_invalid_returns_422() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/admin/replays/download/tasks", params={"status": "running"})
    assert response.status_code == 422

"""Tests for /api/v1/remote endpoints."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import remote


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(remote.router, prefix="/api/v1/remote")
    return TestClient(app)


def test_remote_matches_include_pro_public_filters(monkeypatch) -> None:
    def _fake_list_recent_matches(
        *,
        limit: int,
        offset: int,
        team_id: int | None = None,
        leagueid: int | None = None,
        match_id: int | None = None,
        include_pro: bool = True,
        include_public: bool = False,
        start_time_from: int | None = None,
        start_time_to: int | None = None,
    ) -> tuple[int, list[dict[str, object]]]:
        assert limit == 20
        assert offset == 5
        assert include_pro is False
        assert include_public is True
        assert match_id == 123
        assert leagueid == 456
        return (
            1,
            [
                {
                    "match_id": 123,
                    "start_time": 1700000000,
                    "duration": 2400,
                    "radiant_team_id": 1,
                    "dire_team_id": 2,
                    "leagueid": 456,
                    "radiant_team_name": "A",
                    "dire_team_name": "B",
                    "league_name": "L",
                    "source": "public",
                    "last_synced_at": 1700000200,
                    "radiant_logo_url": "r.png",
                    "dire_logo_url": "d.png",
                    "league_icon_url": "l.png",
                }
            ],
        )

    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)

    response = _client().get(
        "/api/v1/remote/matches",
        params={
            "limit": 20,
            "offset": 5,
            "include_pro": False,
            "include_public": True,
            "match_id": 123,
            "leagueid": 456,
        },
    )

    assert response.status_code == 200
    assert response.json()["matches"][0]["source"] == "public"


def test_remote_sync_payload_and_result(monkeypatch) -> None:
    async def _fake_sync_selected_sources(
        *,
        include_pro: bool,
        include_public: bool,
        limit: int,
        sync_reference: bool,
    ) -> dict[str, object]:
        assert include_pro is True
        assert include_public is True
        assert limit == 88
        assert sync_reference is False
        return {
            "status": "ok",
            "fetched": {"pro": 10, "public": 11},
            "inserted": {"pro": 2, "public": 3},
            "updated": {"pro": 4, "public": 5},
            "total_inserted": 5,
            "total_updated": 9,
            "reference": {
                "teams_inserted": 0,
                "teams_updated": 0,
                "leagues_inserted": 0,
                "leagues_updated": 0,
            },
        }

    monkeypatch.setattr(remote.opendota_sync_service, "sync_selected_sources", _fake_sync_selected_sources)

    response = _client().post(
        "/api/v1/remote/sync",
        json={"include_pro": True, "include_public": True, "limit": 88, "sync_reference": False},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["total_inserted"] == 5
    assert payload["total_updated"] == 9


def test_remote_ingest_aggregates_success_and_failure(monkeypatch) -> None:
    async def _fake_prepare_and_execute(match_id: int) -> dict[str, object]:
        if match_id == 11:
            return {"task_id": "t-11", "status": "completed"}
        return {"task_id": "t-12", "status": "failed", "error_message": "bad replay"}

    monkeypatch.setattr(remote.replay_download_service, "prepare_and_execute", _fake_prepare_and_execute)

    response = _client().post("/api/v1/remote/ingest", json={"match_ids": [11, 12]})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert payload["succeeded"] == 1
    assert payload["failed"] == 1
    assert payload["results"][1]["message"] == "bad replay"


def test_remote_matches_backfills_missing_league_name_then_refetches(monkeypatch) -> None:
    calls = {"list": 0, "upsert": 0}

    def _row(league_name: str | None) -> dict[str, object]:
        return {
            "match_id": 101,
            "start_time": 1700000000,
            "duration": 2400,
            "radiant_team_id": 1,
            "dire_team_id": 2,
            "leagueid": 19269,
            "radiant_team_name": "A",
            "dire_team_name": "B",
            "league_name": league_name,
            "source": "pro",
            "last_synced_at": 1700000200,
            "radiant_logo_url": None,
            "dire_logo_url": None,
            "league_icon_url": None,
            "radiant_logo_sponsor_url": None,
            "dire_logo_sponsor_url": None,
            "league_image_url": None,
            "league_banner_url": None,
            "download_task_id": None,
            "download_status": None,
            "download_attempt_count": None,
            "download_error_code": None,
            "download_error_message": None,
            "download_updated_at": None,
            "local_parse_status": None,
            "local_replay_path": None,
        }

    def _fake_list_recent_matches(**_: object) -> tuple[int, list[dict[str, object]]]:
        calls["list"] += 1
        if calls["list"] == 1:
            return 1, [_row(None)]
        return 1, [_row("DreamLeague")]

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 101
        return {
            "match_id": 101,
            "start_time": 1700000000,
            "duration": 2400,
            "leagueid": 19269,
            "league_name": "DreamLeague",
            "source": "pro",
        }

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        calls["upsert"] += 1
        assert detail["match_id"] == 101
        return 0, 1

    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)

    response = _client().get("/api/v1/remote/matches")

    assert response.status_code == 200
    payload = response.json()
    assert payload["matches"][0]["league_name"] == "DreamLeague"
    assert calls["upsert"] == 1
    assert calls["list"] == 2


def test_remote_matches_backfill_failure_does_not_block_response(monkeypatch) -> None:
    calls = {"list": 0, "upsert": 0}

    def _row(league_name: str | None) -> dict[str, object]:
        return {
            "match_id": 202,
            "start_time": 1700000000,
            "duration": 2400,
            "radiant_team_id": 1,
            "dire_team_id": 2,
            "leagueid": 19269,
            "radiant_team_name": "A",
            "dire_team_name": "B",
            "league_name": league_name,
            "source": "pro",
            "last_synced_at": 1700000200,
            "radiant_logo_url": None,
            "dire_logo_url": None,
            "league_icon_url": None,
            "radiant_logo_sponsor_url": None,
            "dire_logo_sponsor_url": None,
            "league_image_url": None,
            "league_banner_url": None,
            "download_task_id": None,
            "download_status": None,
            "download_attempt_count": None,
            "download_error_code": None,
            "download_error_message": None,
            "download_updated_at": None,
            "local_parse_status": None,
            "local_replay_path": None,
        }

    def _fake_list_recent_matches(**_: object) -> tuple[int, list[dict[str, object]]]:
        calls["list"] += 1
        return 1, [_row(None)]

    async def _fake_fetch_match_details(_: int) -> dict[str, object]:
        raise RuntimeError("opendota timeout")

    def _fake_upsert_match_detail(_: dict[str, object]) -> tuple[int, int]:
        calls["upsert"] += 1
        return 0, 0

    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)

    response = _client().get("/api/v1/remote/matches")

    assert response.status_code == 200
    payload = response.json()
    assert payload["matches"][0]["league_name"] is None
    assert calls["upsert"] == 0
    assert calls["list"] == 2


def test_remote_search_player_id_calls_opendota_and_returns_enriched_matches(monkeypatch) -> None:
    captured_upserts: list[tuple[str, list[dict[str, object]]]] = []

    async def _fake_fetch_player_matches(
        account_id: int,
        *,
        limit: int,
        offset: int,
        leagueid: int | None = None,
    ) -> list[dict[str, object]]:
        assert account_id == 90001
        assert limit == 20
        assert offset == 0
        assert leagueid == 15475
        return [
            {
                "match_id": 501,
                "start_time": 1700000000,
                "duration": 2400,
                "leagueid": 15475,
            }
        ]

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        captured_upserts.append((source, matches))
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [501]
        return (
            1,
            [
                {
                    "match_id": 501,
                    "start_time": 1700000000,
                    "duration": 2400,
                    "radiant_team_id": 1,
                    "dire_team_id": 2,
                    "leagueid": 15475,
                    "radiant_team_name": "Team Liquid",
                    "dire_team_name": "Team Falcons",
                    "league_name": "DreamLeague",
                    "source": "pro",
                    "last_synced_at": 1700000200,
                    "radiant_icon_url": None,
                    "dire_icon_url": None,
                    "radiant_logo_url": None,
                    "dire_logo_url": None,
                    "league_icon_url": None,
                    "league_logo_url": None,
                    "radiant_logo_sponsor_url": None,
                    "dire_logo_sponsor_url": None,
                    "league_image_url": None,
                    "league_banner_url": None,
                    "download_task_id": None,
                    "download_status": None,
                    "download_attempt_count": None,
                    "download_error_code": None,
                    "download_error_message": None,
                    "download_updated_at": None,
                    "local_parse_status": None,
                    "local_replay_path": None,
                }
            ],
        )

    monkeypatch.setattr(remote.opendota_service, "fetch_player_matches", _fake_fetch_player_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)

    response = _client().get(
        "/api/v1/remote/search",
        params={"player_id": 90001, "leagueid": 15475},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["match_id"] == 501
    assert captured_upserts == [
        (
            "pro",
            [
                {
                    "match_id": 501,
                    "start_time": 1700000000,
                    "duration": 2400,
                    "leagueid": 15475,
                }
            ],
        )
    ]


def test_remote_search_league_id_forces_league_and_persists_as_pro(monkeypatch) -> None:
    captured_upserts: list[tuple[str, list[dict[str, object]]]] = []

    async def _fake_fetch_league_matches(
        league_id: int,
        *,
        limit: int,
        offset: int,
    ) -> list[dict[str, object]]:
        assert league_id == 19269
        assert limit == 20
        assert offset == 0
        return [
            {
                "match_id": 777,
                "start_time": 1700000000,
                "duration": 2500,
            }
        ]

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        captured_upserts.append((source, matches))
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [777]
        return (
            1,
            [
                {
                    "match_id": 777,
                    "start_time": 1700000000,
                    "duration": 2500,
                    "radiant_team_id": 10,
                    "dire_team_id": 20,
                    "leagueid": 19269,
                    "radiant_team_name": "Team Spirit",
                    "dire_team_name": "Xtreme Gaming",
                    "league_name": "Elite League",
                    "source": "pro",
                    "last_synced_at": 1700000200,
                    "radiant_icon_url": None,
                    "dire_icon_url": None,
                    "radiant_logo_url": None,
                    "dire_logo_url": None,
                    "league_icon_url": None,
                    "league_logo_url": None,
                    "radiant_logo_sponsor_url": None,
                    "dire_logo_sponsor_url": None,
                    "league_image_url": None,
                    "league_banner_url": None,
                    "download_task_id": None,
                    "download_status": None,
                    "download_attempt_count": None,
                    "download_error_code": None,
                    "download_error_message": None,
                    "download_updated_at": None,
                    "local_parse_status": None,
                    "local_replay_path": None,
                }
            ],
        )

    monkeypatch.setattr(remote.opendota_service, "fetch_league_matches", _fake_fetch_league_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)

    response = _client().get("/api/v1/remote/search", params={"leagueid": 19269})

    assert response.status_code == 200
    payload = response.json()
    assert payload["matches"][0]["leagueid"] == 19269
    assert captured_upserts == [
        (
            "pro",
            [
                {
                    "match_id": 777,
                    "start_time": 1700000000,
                    "duration": 2500,
                    "leagueid": 19269,
                }
            ],
        )
    ]

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


def test_remote_matches_default_uses_pro_only(monkeypatch) -> None:
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
        assert include_pro is True
        assert include_public is False
        assert match_id is None
        assert leagueid is None
        return (
            1,
            [
                {
                    "match_id": 999,
                    "start_time": 1700000000,
                    "duration": 2400,
                    "radiant_team_id": 1,
                    "dire_team_id": 2,
                    "leagueid": 456,
                    "radiant_team_name": "A",
                    "dire_team_name": "B",
                    "league_name": "L",
                    "source": "pro",
                    "last_synced_at": 1700000200,
                    "radiant_logo_url": "r.png",
                    "dire_logo_url": "d.png",
                    "league_icon_url": "l.png",
                }
            ],
        )

    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)

    response = _client().get("/api/v1/remote/matches")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["source"] == "pro"


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


def test_remote_matches_backfills_missing_player_identities_then_refetches(monkeypatch) -> None:
    calls = {"list": 0, "upsert": 0, "identities": 0}

    def _row() -> dict[str, object]:
        return {
            "match_id": 303,
            "start_time": 1700000000,
            "duration": 2400,
            "radiant_team_id": 1,
            "dire_team_id": 2,
            "leagueid": 19269,
            "radiant_team_name": "Team A",
            "dire_team_name": "Team B",
            "league_name": "DreamLeague",
            "source": "pro",
            "is_professional": 1,
            "radiant_win": True,
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
        return 1, [_row()]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 303
        calls["identities"] += 1
        if calls["identities"] == 1:
            return []
        return [
            {
                "match_id": 303,
                "account_id": 7001,
                "player_slot": 0,
                "hero_id": 11,
                "team": 2,
                "team_id": 2,
                "persona_name": "Alpha",
                "pro_name": "Alpha Pro",
            }
        ]

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 303
        return {
            "match_id": 303,
            "start_time": 1700000000,
            "duration": 2400,
            "leagueid": 19269,
            "league_name": "DreamLeague",
            "radiant_win": True,
            "players": [
                {
                    "player_slot": 0,
                    "account_id": 7001,
                    "hero_id": 11,
                    "isRadiant": True,
                    "personaname": "Alpha",
                    "name": "Alpha Pro",
                }
            ],
        }

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        calls["upsert"] += 1
        assert detail["match_id"] == 303
        return 0, 1

    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)

    response = _client().get("/api/v1/remote/matches")

    assert response.status_code == 200
    payload = response.json()
    assert payload["matches"][0]["players"][0]["display_name"] == "Alpha Pro"
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
    stored_matches: dict[int, dict[str, object]] = {}

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

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 501
        return {
            "match_id": 501,
            "start_time": 1700000000,
            "duration": 2400,
            "leagueid": 15475,
            "radiant_win": True,
            "source": "pro",
            "players": [
                {
                    "player_slot": 0,
                    "account_id": 90001,
                    "hero_id": 1,
                    "isRadiant": True,
                    "personaname": "Pub A",
                    "name": "Pro A",
                },
                {
                    "player_slot": 128,
                    "account_id": 90002,
                    "hero_id": 2,
                    "isRadiant": False,
                    "personaname": "Pub B",
                    "name": "Pro B",
                },
            ],
        }

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        captured_upserts.append((source, matches))
        return 1, 0

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        stored_matches[int(detail["match_id"])] = {
            "match_id": detail["match_id"],
            "start_time": detail["start_time"],
            "duration": detail["duration"],
            "radiant_team_id": 1,
            "dire_team_id": 2,
            "leagueid": detail["leagueid"],
            "radiant_team_name": "Team Liquid",
            "dire_team_name": "Team Falcons",
            "league_name": "DreamLeague",
            "source": "pro",
            "is_professional": 1,
            "radiant_win": detail["radiant_win"],
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [501]
        return 1, [stored_matches[501]]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 501
        return [
            {
                "match_id": 501,
                "account_id": 90001,
                "player_slot": 0,
                "hero_id": 1,
                "team": 2,
                "team_id": 2,
                "persona_name": "Pub A",
                "pro_name": "Pro A",
            },
            {
                "match_id": 501,
                "account_id": 90002,
                "player_slot": 5,
                "hero_id": 2,
                "team": 3,
                "team_id": 3,
                "persona_name": "Pub B",
                "pro_name": "Pro B",
            },
        ]

    monkeypatch.setattr(remote.opendota_service, "fetch_player_matches", _fake_fetch_player_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get(
        "/api/v1/remote/search",
        params={"player_id": 90001, "leagueid": 15475},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["match_id"] == 501
    assert payload["matches"][0]["radiant_win"] is True
    assert payload["matches"][0]["players"][0]["account_id"] == 90001
    assert payload["matches"][0]["players"][0]["display_name"] == "Pro A"
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
    stored_matches: dict[int, dict[str, object]] = {}

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

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 777
        return {
            "match_id": 777,
            "start_time": 1700000000,
            "duration": 2500,
            "leagueid": 19269,
            "source": "pro",
            "radiant_win": True,
            "players": [
                {
                    "player_slot": 0,
                    "account_id": 11,
                    "hero_id": 10,
                    "isRadiant": True,
                    "personaname": "SpiritA",
                    "name": "Spirit Pro A",
                }
            ],
        }

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        captured_upserts.append((source, matches))
        return 1, 0

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        stored_matches[777] = {
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
            "is_professional": 1,
            "radiant_win": True,
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        if kwargs.get("leagueid") == 19269:
            return 0, []
        assert kwargs["match_ids"] == [777]
        return 1, [stored_matches[777]]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 777
        return [
            {
                "match_id": 777,
                "account_id": 11,
                "player_slot": 0,
                "hero_id": 10,
                "team": 2,
                "team_id": 2,
                "persona_name": "SpiritA",
                "pro_name": "Spirit Pro A",
            }
        ]

    monkeypatch.setattr(remote.opendota_service, "fetch_league_matches", _fake_fetch_league_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search", params={"leagueid": 19269})

    assert response.status_code == 200
    payload = response.json()
    assert payload["matches"][0]["leagueid"] == 19269
    assert payload["matches"][0]["players"][0]["display_name"] == "Spirit Pro A"
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


def test_remote_search_league_id_keeps_paginating_when_fetch_page_is_full(monkeypatch) -> None:
    stored_matches: dict[int, dict[str, object]] = {}
    fetched_limits: list[int] = []
    fetched_offsets: list[int] = []
    match_ids = list(range(3000, 3040))

    async def _fake_fetch_league_matches(
        league_id: int,
        *,
        limit: int,
        offset: int,
    ) -> list[dict[str, object]]:
        assert league_id == 15475
        fetched_limits.append(limit)
        fetched_offsets.append(offset)
        return [
            {
                "match_id": match_id,
                "start_time": 1700000000 + index,
                "duration": 1800,
            }
            for index, match_id in enumerate(match_ids[offset : offset + limit], start=offset)
        ]

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id in match_ids
        return {
            "match_id": match_id,
            "start_time": 1700000000 + match_ids.index(match_id),
            "duration": 1800,
            "leagueid": 15475,
            "source": "pro",
            "radiant_team_id": 15,
            "dire_team_id": 2163,
            "radiant_team": {"team_id": 15, "name": "Team Liquid"},
            "dire_team": {"team_id": 2163, "name": "Nigma Galaxy"},
            "league": {"leagueid": 15475, "name": "DreamLeague"},
            "radiant_win": True,
            "players": [],
        }

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        assert source == "pro"
        return len(matches), 0

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        match_id = int(detail["match_id"])
        stored_matches[match_id] = {
            "match_id": match_id,
            "start_time": detail["start_time"],
            "duration": detail["duration"],
            "radiant_team_id": 15,
            "dire_team_id": 2163,
            "leagueid": 15475,
            "radiant_team_name": "Team Liquid",
            "dire_team_name": "Nigma Galaxy",
            "league_name": "DreamLeague",
            "source": "pro",
            "is_professional": 1,
            "radiant_win": True,
            "last_synced_at": 1700000999,
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        if kwargs.get("leagueid") == 15475:
            return 0, []
        queried_match_ids = kwargs["match_ids"]
        assert isinstance(queried_match_ids, list)
        return len(queried_match_ids), [stored_matches[int(match_id)] for match_id in queried_match_ids]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id in match_ids
        return []

    monkeypatch.setattr(remote.opendota_service, "fetch_league_matches", _fake_fetch_league_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    first_response = _client().get("/api/v1/remote/search", params={"leagueid": 15475, "limit": 20})
    second_response = _client().get(
        "/api/v1/remote/search",
        params={"leagueid": 15475, "limit": 20, "offset": 20},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_payload = first_response.json()
    second_payload = second_response.json()
    assert first_payload["total"] == 21
    assert len(first_payload["matches"]) == 20
    assert second_payload["total"] == 41
    assert len(second_payload["matches"]) == 20
    assert fetched_limits == [20, 20, 20]
    assert fetched_offsets == [0, 0, 20]


def test_remote_search_player_name_can_cover_public_matches(monkeypatch) -> None:
    stored_matches: dict[int, dict[str, object]] = {}

    def _fake_search_match_player_identities_by_name(name: str, limit: int = 20) -> list[dict[str, object]]:
        assert name == "Pub Star"
        assert limit >= 20
        return [
            {
                "match_id": 777,
                "account_id": 555,
                "player_slot": 0,
                "hero_id": 2,
                "team_id": 2,
                "persona_name": "Pub Star",
                "pro_name": "Pub Pro",
            }
        ]

    async def _fake_fetch_player_matches(
        account_id: int,
        *,
        limit: int,
        offset: int,
        leagueid: int | None = None,
    ) -> list[dict[str, object]]:
        assert account_id == 555
        assert limit == 20
        assert offset == 0
        assert leagueid is None
        return [
            {
                "match_id": 777,
                "start_time": 1700007777,
                "duration": 2100,
            }
        ]

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 777
        return {
            "match_id": 777,
            "start_time": 1700007777,
            "duration": 2100,
            "source": "public",
            "radiant_win": False,
            "players": [
                {
                    "player_slot": 0,
                    "account_id": 555,
                    "hero_id": 2,
                    "isRadiant": True,
                    "personaname": "Pub Star",
                    "name": "Pub Pro",
                }
            ],
        }

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        assert source == "public"
        assert matches[0]["match_id"] == 777
        return 1, 0

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        stored_matches[777] = {
            "match_id": 777,
            "start_time": 1700007777,
            "duration": 2100,
            "radiant_team_id": None,
            "dire_team_id": None,
            "leagueid": None,
            "radiant_team_name": None,
            "dire_team_name": None,
            "league_name": None,
            "source": "public",
            "is_professional": 0,
            "radiant_win": False,
            "last_synced_at": 1700008888,
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [777]
        return 1, [stored_matches[777]]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 777
        return [
            {
                "match_id": 777,
                "account_id": 555,
                "player_slot": 0,
                "hero_id": 2,
                "team": 2,
                "team_id": 2,
                "persona_name": "Pub Star",
                "pro_name": "Pub Pro",
            }
        ]

    monkeypatch.setattr(remote.opendota_match_storage, "search_match_player_identities_by_name", _fake_search_match_player_identities_by_name)
    monkeypatch.setattr(remote.opendota_service, "fetch_player_matches", _fake_fetch_player_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search", params={"player_name": "Pub Star"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["source"] == "public"
    assert payload["matches"][0]["radiant_win"] is False
    assert payload["matches"][0]["players"][0]["display_name"] == "Pub Star"


def test_remote_search_player_name_falls_back_to_opendota_search(monkeypatch) -> None:
    stored_matches: dict[int, dict[str, object]] = {}

    def _fake_search_match_player_identities_by_name(name: str, limit: int = 20) -> list[dict[str, object]]:
        assert name == "Ame"
        assert limit >= 20
        return []

    async def _fake_search_players(query: str, *, limit: int = 20) -> list[dict[str, object]]:
        assert query == "Ame"
        assert limit >= 10
        return [{"account_id": 86745912, "personaname": "Ame"}]

    async def _fake_fetch_player_matches(
        account_id: int,
        *,
        limit: int,
        offset: int,
        leagueid: int | None = None,
    ) -> list[dict[str, object]]:
        assert account_id == 86745912
        assert limit >= 20
        assert offset == 0
        assert leagueid is None
        return [{"match_id": 990, "start_time": 1700000990, "duration": 2150}]

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 990
        return {
            "match_id": 990,
            "start_time": 1700000990,
            "duration": 2150,
            "source": "public",
            "radiant_win": True,
            "players": [
                {
                    "player_slot": 0,
                    "account_id": 86745912,
                    "hero_id": 48,
                    "isRadiant": True,
                    "personaname": "Ame",
                }
            ],
        }

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        assert source == "public"
        assert matches[0]["match_id"] == 990
        return 1, 0

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        stored_matches[990] = {
            "match_id": 990,
            "start_time": 1700000990,
            "duration": 2150,
            "radiant_team_id": None,
            "dire_team_id": None,
            "leagueid": None,
            "radiant_team_name": None,
            "dire_team_name": None,
            "league_name": None,
            "source": "public",
            "is_professional": 0,
            "radiant_win": True,
            "last_synced_at": 1700001000,
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [990]
        return 1, [stored_matches[990]]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 990
        return [
            {
                "match_id": 990,
                "account_id": 86745912,
                "player_slot": 0,
                "hero_id": 48,
                "team": 2,
                "team_id": 2,
                "persona_name": "Ame",
                "pro_name": None,
            }
        ]

    monkeypatch.setattr(remote.opendota_match_storage, "search_match_player_identities_by_name", _fake_search_match_player_identities_by_name)
    monkeypatch.setattr(remote.opendota_service, "search_players", _fake_search_players)
    monkeypatch.setattr(remote.opendota_service, "fetch_player_matches", _fake_fetch_player_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search", params={"player_name": "Ame", "include_public": True, "include_pro": False})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["source"] == "public"
    assert payload["matches"][0]["players"][0]["display_name"] == "Ame"


def test_remote_search_match_id_returns_match_summary(monkeypatch) -> None:
    stored_matches: dict[int, dict[str, object]] = {}

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 900
        return {
            "match_id": 900,
            "start_time": 1700000900,
            "duration": 1800,
            "source": "public",
            "radiant_win": True,
            "players": [
                {
                    "player_slot": 0,
                    "account_id": 9000,
                    "hero_id": 1,
                    "isRadiant": True,
                    "personaname": "Player A",
                    "name": "Player A Pro",
                }
            ],
        }

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        stored_matches[900] = {
            "match_id": 900,
            "start_time": 1700000900,
            "duration": 1800,
            "radiant_team_id": None,
            "dire_team_id": None,
            "leagueid": None,
            "radiant_team_name": None,
            "dire_team_name": None,
            "league_name": None,
            "source": "public",
            "is_professional": 0,
            "radiant_win": True,
            "last_synced_at": 1700000950,
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [900]
        return 1, [stored_matches[900]]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 900
        return [
            {
                "match_id": 900,
                "account_id": 9000,
                "player_slot": 0,
                "hero_id": 1,
                "team": 2,
                "team_id": 2,
                "persona_name": "Player A",
                "pro_name": "Player A Pro",
            }
        ]

    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search", params={"match_id": 900})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["match_id"] == 900
    assert payload["matches"][0]["radiant_win"] is True
    assert payload["matches"][0]["players"][0]["display_name"] == "Player A"


def test_remote_search_without_query_returns_default_enriched_feed(monkeypatch) -> None:
    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["include_pro"] is True
        assert kwargs["include_public"] is False
        assert kwargs["match_id"] is None
        assert kwargs["leagueid"] is None
        return (
            1,
            [
                {
                    "match_id": 321,
                    "start_time": 1700010000,
                    "duration": 1800,
                    "radiant_team_id": 11,
                    "dire_team_id": 22,
                    "leagueid": 333,
                    "radiant_team_name": "Radiant Side",
                    "dire_team_name": "Dire Side",
                    "league_name": "Unified Cup",
                    "source": "pro",
                    "last_synced_at": 1700010100,
                    "radiant_icon_url": None,
                    "dire_icon_url": None,
                    "radiant_logo_url": None,
                    "dire_logo_url": None,
                    "league_icon_url": None,
                    "league_logo_url": None,
                    "league_image_url": None,
                    "league_banner_url": None,
                    "radiant_logo_sponsor_url": None,
                    "dire_logo_sponsor_url": None,
                    "download_task_id": None,
                    "download_status": None,
                    "download_attempt_count": None,
                    "download_error_code": None,
                    "download_error_message": None,
                    "download_updated_at": None,
                    "local_parse_status": None,
                    "local_replay_path": None,
                    "radiant_win": True,
                }
            ],
        )

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 321
        return [
            {
                "match_id": 321,
                "account_id": 7001,
                "player_slot": 0,
                "hero_id": 11,
                "team": 2,
                "team_id": 2,
                "persona_name": "Alpha",
                "pro_name": "Alpha Pro",
            },
            {
                "match_id": 321,
                "account_id": 7002,
                "player_slot": 128,
                "hero_id": 12,
                "team": 3,
                "team_id": 3,
                "persona_name": "Beta",
                "pro_name": "Beta Pro",
            },
        ]

    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    match = payload["matches"][0]
    assert match["match_id"] == 321
    assert match["hero_ids"] == [11, 12]
    assert match["winner_team"] == "radiant"
    assert match["players"][0]["display_name"] == "Alpha"
    assert match["radiant_players"][0]["display_name"] == "Alpha"
    assert match["dire_players"][0]["display_name"] == "Beta"


def test_remote_search_q_match_id_failure_falls_back_to_empty(monkeypatch) -> None:
    async def _unexpected_fetch_player_matches(
        account_id: int,
        *,
        limit: int,
        offset: int,
        leagueid: int | None = None,
    ) -> list[dict[str, object]]:
        raise AssertionError(
            f"raw match-id search should not query player matches, got account_id={account_id}, limit={limit}, offset={offset}, leagueid={leagueid}"
        )

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 8123456789
        raise remote.OpenDotaServiceError("OpenDota request timed out.")

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [8123456789]
        return 0, []

    monkeypatch.setattr(remote.opendota_service, "fetch_player_matches", _unexpected_fetch_player_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)

    response = _client().get("/api/v1/remote/search", params={"q": "8123456789"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["matches"] == []


def test_remote_search_q_match_id_cached_row_exposes_detail_error(monkeypatch) -> None:
    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 8786096329
        raise remote.OpenDotaServiceError(
            "OpenDota request failed with status 429; 上游提示 daily api limit exceeded，当前 IP 的每日额度已耗尽。"
        )

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert kwargs["match_ids"] == [8786096329]
        return (
            1,
            [
                {
                    "match_id": 8786096329,
                    "start_time": 1777140801,
                    "duration": 1556,
                    "radiant_team_id": None,
                    "dire_team_id": None,
                    "leagueid": None,
                    "radiant_team_name": "Radiant",
                    "dire_team_name": "Dire",
                    "league_name": "Public Match",
                    "source": "public",
                    "is_professional": 0,
                    "radiant_win": False,
                    "last_synced_at": 1777299148,
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

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 8786096329
        return []

    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search", params={"q": "8786096329"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["match_id"] == 8786096329
    assert payload["matches"][0]["players"] == []
    assert "daily api limit exceeded" in payload["message"]


def test_remote_search_q_player_name_exposes_rate_limit_message(monkeypatch) -> None:
    def _fake_search_match_player_identities_by_name(name: str, limit: int = 20) -> list[dict[str, object]]:
        assert name == "DreamLeague"
        assert limit >= 20
        return []

    async def _fake_search_players(query: str, *, limit: int = 20) -> list[dict[str, object]]:
        assert query == "DreamLeague"
        raise remote.OpenDotaServiceError(
            "OpenDota request failed with status 429; 上游提示 daily api limit exceeded，当前 IP 的每日额度已耗尽。"
        )

    def _fake_search_leagues_by_name(name: str, limit: int = 20) -> list[dict[str, object]]:
        assert name == "DreamLeague"
        return []

    def _fake_search_match_ids_by_league_name(name: str, limit: int = 20) -> list[int]:
        assert name == "DreamLeague"
        assert limit >= 20
        return []

    async def _fake_fetch_leagues(limit: int = 100) -> list[dict[str, object]]:
        assert limit >= 100
        raise remote.OpenDotaServiceError(
            "OpenDota request failed with status 429; 上游提示 daily api limit exceeded，当前 IP 的每日额度已耗尽。"
        )

    monkeypatch.setattr(
        remote.opendota_match_storage,
        "search_match_player_identities_by_name",
        _fake_search_match_player_identities_by_name,
    )
    monkeypatch.setattr(remote.opendota_service, "search_players", _fake_search_players)
    monkeypatch.setattr(remote.opendota_reference_storage, "search_leagues_by_name", _fake_search_leagues_by_name)
    monkeypatch.setattr(remote.opendota_match_storage, "search_match_ids_by_league_name", _fake_search_match_ids_by_league_name)
    monkeypatch.setattr(remote.opendota_service, "fetch_leagues", _fake_fetch_leagues)

    response = _client().get("/api/v1/remote/search", params={"q": "DreamLeague"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["matches"] == []
    assert "daily api limit exceeded" in payload["message"]


def test_remote_search_q_plain_text_returns_union_from_player_and_league_hits(monkeypatch) -> None:
    stored_matches: dict[int, dict[str, object]] = {}
    captured_player_match_leagueids: list[int | None] = []

    def _fake_search_match_player_identities_by_name(name: str, limit: int = 20) -> list[dict[str, object]]:
        assert name == "Dream"
        assert limit >= 20
        return [
            {
                "match_id": 501,
                "account_id": 90001,
                "player_slot": 0,
                "hero_id": 1,
                "team_id": 2,
                "persona_name": "Dream",
                "pro_name": None,
            }
        ]

    def _fake_search_leagues_by_name(name: str, limit: int = 20) -> list[dict[str, object]]:
        assert name == "Dream"
        assert limit == 20
        return [{"leagueid": 15475}]

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
        captured_player_match_leagueids.append(leagueid)
        return [{"match_id": 501, "start_time": 1700000501, "duration": 2000}]

    async def _fake_fetch_league_matches(
        league_id: int,
        *,
        limit: int,
        offset: int,
    ) -> list[dict[str, object]]:
        assert league_id == 15475
        assert limit == 20
        assert offset == 0
        return [{"match_id": 777, "start_time": 1700000777, "duration": 2500}]

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        if match_id == 501:
            return {
                "match_id": 501,
                "start_time": 1700000501,
                "duration": 2000,
                "source": "public",
                "radiant_win": True,
                "players": [
                    {
                        "player_slot": 0,
                        "account_id": 90001,
                        "hero_id": 1,
                        "isRadiant": True,
                        "personaname": "Dream",
                    }
                ],
            }
        assert match_id == 777
        return {
            "match_id": 777,
            "start_time": 1700000777,
            "duration": 2500,
            "leagueid": 15475,
            "source": "pro",
            "radiant_win": False,
            "players": [
                {
                    "player_slot": 128,
                    "account_id": 77701,
                    "hero_id": 2,
                    "isRadiant": False,
                    "personaname": "League Player",
                    "name": "League Pro",
                }
            ],
        }

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        assert matches
        assert source in {"pro", "public"}
        return len(matches), 0

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        match_id = int(detail["match_id"])
        if match_id == 501:
            stored_matches[501] = {
                "match_id": 501,
                "start_time": 1700000501,
                "duration": 2000,
                "radiant_team_id": None,
                "dire_team_id": None,
                "leagueid": None,
                "radiant_team_name": None,
                "dire_team_name": None,
                "league_name": None,
                "source": "public",
                "is_professional": 0,
                "radiant_win": True,
                "last_synced_at": 1700000555,
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
        else:
            stored_matches[777] = {
                "match_id": 777,
                "start_time": 1700000777,
                "duration": 2500,
                "radiant_team_id": 10,
                "dire_team_id": 20,
                "leagueid": 15475,
                "radiant_team_name": "League Radiant",
                "dire_team_name": "League Dire",
                "league_name": "DreamLeague Season 26",
                "source": "pro",
                "is_professional": 1,
                "radiant_win": False,
                "last_synced_at": 1700000888,
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        assert set(kwargs["match_ids"]) == {501, 777}
        return 2, [stored_matches[501], stored_matches[777]]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        if match_id == 501:
            return [
                {
                    "match_id": 501,
                    "account_id": 90001,
                    "player_slot": 0,
                    "hero_id": 1,
                    "team": 2,
                    "team_id": 2,
                    "persona_name": "Dream",
                    "pro_name": None,
                }
            ]
        assert match_id == 777
        return [
            {
                "match_id": 777,
                "account_id": 77701,
                "player_slot": 5,
                "hero_id": 2,
                "team": 3,
                "team_id": 3,
                "persona_name": "League Player",
                "pro_name": "League Pro",
            }
        ]

    monkeypatch.setattr(
        remote.opendota_match_storage,
        "search_match_player_identities_by_name",
        _fake_search_match_player_identities_by_name,
    )
    monkeypatch.setattr(
        remote.opendota_reference_storage,
        "search_leagues_by_name",
        _fake_search_leagues_by_name,
    )
    monkeypatch.setattr(remote.opendota_service, "fetch_player_matches", _fake_fetch_player_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_league_matches", _fake_fetch_league_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search", params={"q": "Dream"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 2
    assert [match["match_id"] for match in payload["matches"]] == [777, 501]
    assert payload["matches"][0]["league_name"] == "DreamLeague Season 26"
    assert payload["matches"][1]["players"][0]["display_name"] == "Dream"
    assert captured_player_match_leagueids == [None]


def test_remote_search_q_team_id_returns_team_matches(monkeypatch) -> None:
    stored_matches: dict[int, dict[str, object]] = {}

    async def _fake_fetch_team_matches(
        team_id: int,
        *,
        limit: int,
        offset: int,
    ) -> list[dict[str, object]]:
        assert team_id == 15
        assert limit == 20
        assert offset == 0
        return [
            {
                "match_id": 902,
                "start_time": 1700000902,
                "duration": 2400,
                "leagueid": 15475,
                "radiant": True,
                "opposing_team_id": 9247354,
                "opposing_team_name": "Team Falcons",
            }
        ]

    async def _fake_fetch_match_details(match_id: int) -> dict[str, object]:
        assert match_id == 902
        return {
            "match_id": 902,
            "start_time": 1700000902,
            "duration": 2400,
            "leagueid": 15475,
            "source": "pro",
            "radiant_team_id": 15,
            "dire_team_id": 9247354,
            "radiant_team": {"team_id": 15, "name": "Team Liquid"},
            "dire_team": {"team_id": 9247354, "name": "Team Falcons"},
            "radiant_win": True,
            "players": [],
        }

    def _fake_upsert_recent_matches(
        matches: list[dict[str, object]],
        *,
        source: str = "pro",
    ) -> tuple[int, int]:
        assert matches == [
            {
                "match_id": 902,
                "start_time": 1700000902,
                "duration": 2400,
                "leagueid": 15475,
                "radiant": True,
                "opposing_team_id": 9247354,
                "opposing_team_name": "Team Falcons",
                "radiant_team_id": 15,
                "dire_team_id": 9247354,
                "dire_team_name": "Team Falcons",
            }
        ]
        assert source == "pro"
        return 1, 0

    def _fake_upsert_match_detail(detail: dict[str, object]) -> tuple[int, int]:
        stored_matches[int(detail["match_id"])] = {
            "match_id": 902,
            "start_time": 1700000902,
            "duration": 2400,
            "radiant_team_id": 15,
            "dire_team_id": 9247354,
            "leagueid": 15475,
            "radiant_team_name": "Team Liquid",
            "dire_team_name": "Team Falcons",
            "league_name": "DreamLeague Season 26",
            "source": "pro",
            "is_professional": 1,
            "radiant_win": True,
            "last_synced_at": 1700000999,
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
        return 1, 0

    def _fake_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        if kwargs.get("team_id") == 15:
            return 0, []
        assert kwargs["match_ids"] == [902]
        return 1, [stored_matches[902]]

    def _fake_get_match_player_identities(match_id: int) -> list[dict[str, object]]:
        assert match_id == 902
        return []

    monkeypatch.setattr(remote.opendota_service, "fetch_team_matches", _fake_fetch_team_matches)
    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _fake_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_recent_matches", _fake_upsert_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "upsert_match_detail", _fake_upsert_match_detail)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _fake_list_recent_matches)
    monkeypatch.setattr(remote.opendota_match_storage, "get_match_player_identities", _fake_get_match_player_identities)

    response = _client().get("/api/v1/remote/search", params={"q": "战队 15"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["matches"][0]["match_id"] == 902
    assert payload["matches"][0]["radiant_team_id"] == 15
    assert payload["matches"][0]["radiant_team_name"] == "Team Liquid"


def test_remote_search_q_invalid_explicit_scope_returns_empty(monkeypatch) -> None:
    async def _unexpected_fetch_match_details(match_id: int) -> dict[str, object]:
        raise AssertionError(f"invalid explicit scope should not fetch match details: {match_id}")

    def _unexpected_list_recent_matches(**kwargs: object) -> tuple[int, list[dict[str, object]]]:
        raise AssertionError(f"invalid explicit scope should not fall back to list_recent_matches: {kwargs}")

    monkeypatch.setattr(remote.opendota_service, "fetch_match_details", _unexpected_fetch_match_details)
    monkeypatch.setattr(remote.opendota_match_storage, "list_recent_matches", _unexpected_list_recent_matches)

    response = _client().get("/api/v1/remote/search", params={"q": "比赛 abc"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["matches"] == []


def test_remote_search_unexpected_error_returns_empty(monkeypatch) -> None:
    async def _unexpected_fetch_search_candidates(**_: object) -> tuple[set[int], set[int], set[int], set[int], set[int], bool, list[Exception]]:
        raise RuntimeError("boom")

    monkeypatch.setattr(remote, "_fetch_search_candidates", _unexpected_fetch_search_candidates)

    response = _client().get("/api/v1/remote/search", params={"q": "Ame"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["matches"] == []

"""Tests for OpenDota service connectivity and failure handling."""

from __future__ import annotations

import httpx
import pytest

from services.opendota_service import OpenDotaService, OpenDotaServiceError


class _FakeResponse:
    def __init__(self, payload: object) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> object:
        return self._payload


class _SuccessAsyncClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_SuccessAsyncClient":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    async def get(self, path: str, params: dict[str, object] | None = None) -> _FakeResponse:
        if path == "/publicMatches":
            return _FakeResponse(
                [
                    {"match_id": 1, "avg_rank_tier": 60},
                    {"match_id": 2, "avg_rank_tier": 61},
                ]
            )
        if path == "/proMatches":
            return _FakeResponse(
                [
                    {"match_id": 101, "leagueid": 15475},
                    {"match_id": 102, "leagueid": 15476},
                ]
            )
        if path == "/teams":
            return _FakeResponse(
                [
                    {"team_id": 15, "name": "Team A", "wins": 10, "losses": 3},
                    {"team_id": 25, "name": "Team B", "wins": 8, "losses": 5},
                ]
            )
        if path == "/leagues":
            return _FakeResponse(
                [
                    {"leagueid": 1001, "name": "League A", "tier": "professional"},
                    {"leagueid": 1002, "name": "League B", "tier": "premium"},
                ]
            )
        if path == "/matches/123":
            return _FakeResponse(
                {
                    "match_id": 123,
                    "cluster": 123,
                    "replay_salt": 987654321,
                }
            )
        if path == "/players/456/matches":
            assert params == {"limit": 2, "offset": 10, "significant": 0, "leagueid": 15475}
            return _FakeResponse(
                [
                    {"match_id": 201, "leagueid": 15475},
                    {"match_id": 202, "leagueid": 15475},
                ]
            )
        if path == "/leagues/15475/matches":
            assert params == {"limit": 2, "offset": 5}
            return _FakeResponse(
                [
                    {"match_id": 301, "leagueid": 15475},
                    {"match_id": 302, "leagueid": 15475},
                ]
            )
        if path == "/search":
            assert params == {"q": "Ame"}
            return _FakeResponse(
                [
                    {"account_id": 86745912, "personaname": "Ame"},
                    {"account_id": 11111111, "personaname": "Ame smurf"},
                ]
            )
        raise AssertionError(f"unexpected path: {path}")


class _InvalidJsonAsyncClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_InvalidJsonAsyncClient":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    async def get(self, path: str, params: dict[str, object] | None = None) -> _FakeResponse:
        class _BadJsonResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> object:
                raise ValueError("bad json")

        return _BadJsonResponse()


class _TimeoutAsyncClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_TimeoutAsyncClient":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    async def get(self, path: str, params: dict[str, object] | None = None) -> _FakeResponse:
        raise httpx.TimeoutException("timeout")


class _CaptureHeadersAsyncClient:
    captured_headers: dict[str, str] | None = None

    def __init__(self, *args: object, **kwargs: object) -> None:
        headers = kwargs.get("headers")
        if isinstance(headers, dict):
            self.__class__.captured_headers = dict(headers)

    async def __aenter__(self) -> "_CaptureHeadersAsyncClient":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    async def get(self, path: str, params: dict[str, object] | None = None) -> _FakeResponse:
        return _FakeResponse([])


class _ForbiddenAsyncClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_ForbiddenAsyncClient":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    async def get(self, path: str, params: dict[str, object] | None = None) -> httpx.Response:
        request = httpx.Request("GET", f"https://api.opendota.com/api{path}")
        return httpx.Response(status_code=403, request=request)


class _TooManyRequestsAsyncClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_TooManyRequestsAsyncClient":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        return None

    async def get(self, path: str, params: dict[str, object] | None = None) -> httpx.Response:
        request = httpx.Request("GET", f"https://api.opendota.com/api{path}")
        return httpx.Response(status_code=429, request=request)


@pytest.mark.asyncio
async def test_fetch_recent_matches_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.fetch_recent_matches(limit=1)

    assert result == [{"match_id": 1, "avg_rank_tier": 60}]


@pytest.mark.asyncio
async def test_fetch_recent_matches_timeout_is_controlled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _TimeoutAsyncClient)
    service = OpenDotaService()

    with pytest.raises(OpenDotaServiceError, match="timed out"):
        await service.fetch_recent_matches(limit=10)


@pytest.mark.asyncio
async def test_fetch_pro_matches_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.fetch_pro_matches(limit=1)

    assert result == [{"match_id": 101, "leagueid": 15475}]


@pytest.mark.asyncio
async def test_fetch_teams_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.fetch_teams(limit=1)

    assert result == [{"team_id": 15, "name": "Team A", "wins": 10, "losses": 3}]


@pytest.mark.asyncio
async def test_fetch_leagues_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.fetch_leagues(limit=1)

    assert result == [{"leagueid": 1001, "name": "League A", "tier": "professional"}]


@pytest.mark.asyncio
async def test_fetch_match_details_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.fetch_match_details(match_id=123)

    assert result["match_id"] == 123
    assert result["cluster"] == 123
    assert result["replay_salt"] == 987654321


@pytest.mark.asyncio
async def test_fetch_player_matches_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.fetch_player_matches(
        456,
        limit=2,
        offset=10,
        leagueid=15475,
    )

    assert result == [
        {"match_id": 201, "leagueid": 15475},
        {"match_id": 202, "leagueid": 15475},
    ]


@pytest.mark.asyncio
async def test_fetch_league_matches_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.fetch_league_matches(15475, limit=2, offset=5)

    assert result == [
        {"match_id": 301, "leagueid": 15475},
        {"match_id": 302, "leagueid": 15475},
    ]


@pytest.mark.asyncio
async def test_search_players_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _SuccessAsyncClient)
    service = OpenDotaService()

    result = await service.search_players("Ame", limit=1)

    assert result == [{"account_id": 86745912, "personaname": "Ame"}]


@pytest.mark.asyncio
async def test_opendota_requests_use_default_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    _CaptureHeadersAsyncClient.captured_headers = None
    monkeypatch.setattr(httpx, "AsyncClient", _CaptureHeadersAsyncClient)
    service = OpenDotaService()

    await service.fetch_recent_matches(limit=1)

    assert _CaptureHeadersAsyncClient.captured_headers is not None
    headers = _CaptureHeadersAsyncClient.captured_headers
    assert headers is not None
    assert "Mozilla/5.0" in headers["User-Agent"]
    assert headers["Accept"] == "application/json"
    assert headers["Accept-Language"] == "en-US,en;q=0.9"


@pytest.mark.asyncio
async def test_fetch_recent_matches_403_has_clear_risk_control_hint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _ForbiddenAsyncClient)
    service = OpenDotaService()

    with pytest.raises(
        OpenDotaServiceError,
        match="可能被上游风控拦截，请检查 User-Agent/网络环境",
    ):
        await service.fetch_recent_matches(limit=10)


@pytest.mark.asyncio
async def test_fetch_recent_matches_429_has_clear_rate_limit_hint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _TooManyRequestsAsyncClient)
    service = OpenDotaService()

    with pytest.raises(
        OpenDotaServiceError,
        match="daily api limit exceeded",
    ):
        await service.fetch_recent_matches(limit=10)


@pytest.mark.asyncio
async def test_fetch_recent_matches_invalid_json_is_controlled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(httpx, "AsyncClient", _InvalidJsonAsyncClient)
    service = OpenDotaService()

    with pytest.raises(OpenDotaServiceError, match="invalid JSON"):
        await service.fetch_recent_matches(limit=10)


def test_build_replay_url_success() -> None:
    url = OpenDotaService.build_replay_url(match_id=8123456789, cluster=236, replay_salt=123456789)
    assert url == "http://replay236.valve.net/570/8123456789_123456789.dem.bz2"


def test_build_replay_url_missing_fields_is_controlled_error() -> None:
    with pytest.raises(OpenDotaServiceError, match="Missing required replay fields"):
        OpenDotaService.build_replay_url(match_id=8123456789, cluster=None, replay_salt=None)

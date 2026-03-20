"""OpenDota client service for sync workflows."""

from __future__ import annotations

from typing import Any

import httpx


class OpenDotaServiceError(Exception):
    """Raised when OpenDota API calls fail in a controlled way."""

    @property
    def is_rate_limited(self) -> bool:
        normalized = str(self).lower()
        return "status 429" in normalized or "daily api limit exceeded" in normalized


class OpenDotaService:
    """Typed async client wrapper for OpenDota API."""

    DEFAULT_HEADERS: dict[str, str] = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }

    def __init__(
        self,
        base_url: str = "https://api.opendota.com/api",
        timeout_seconds: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = httpx.Timeout(timeout_seconds)

    async def fetch_recent_matches(self, limit: int = 50) -> list[dict[str, Any]]:
        """Fetch recent public matches from OpenDota with bounded result size."""
        bounded_limit = max(1, min(limit, 200))

        return await self._fetch_list_endpoint(path="/publicMatches", bounded_limit=bounded_limit)

    async def fetch_pro_matches(self, limit: int = 50) -> list[dict[str, Any]]:
        """Fetch recent professional matches from OpenDota with bounded result size."""
        bounded_limit = max(1, min(limit, 200))

        return await self._fetch_list_endpoint(path="/proMatches", bounded_limit=bounded_limit)

    async def fetch_player_matches(
        self,
        account_id: int,
        *,
        limit: int = 20,
        offset: int = 0,
        leagueid: int | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch player match history directly from OpenDota search endpoint."""
        bounded_limit = max(1, min(limit, 100))
        params: dict[str, int] = {
            "limit": bounded_limit,
            "offset": max(0, offset),
            "significant": 0,
        }
        if leagueid is not None and leagueid > 0:
            params["leagueid"] = leagueid

        return await self._fetch_list_endpoint(
            path=f"/players/{account_id}/matches",
            bounded_limit=bounded_limit,
            params=params,
        )

    async def search_players(
        self,
        query: str,
        *,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Search OpenDota player identities by persona name."""
        normalized_query = query.strip()
        if not normalized_query:
            return []

        bounded_limit = max(1, min(limit, 100))
        return await self._fetch_list_endpoint(
            path="/search",
            bounded_limit=bounded_limit,
            params={"q": normalized_query},
        )

    async def fetch_league_matches(
        self,
        league_id: int,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Fetch league matches directly from OpenDota search endpoint."""
        bounded_limit = max(1, min(limit, 100))
        params: dict[str, int] = {
            "limit": bounded_limit,
            "offset": max(0, offset),
        }

        return await self._fetch_list_endpoint(
            path=f"/leagues/{league_id}/matches",
            bounded_limit=bounded_limit,
            params=params,
        )

    async def fetch_teams(self, limit: int = 100) -> list[dict[str, Any]]:
        """Fetch OpenDota teams reference data."""
        bounded_limit = max(1, min(limit, 200))
        return await self._fetch_list_endpoint(path="/teams", bounded_limit=bounded_limit)

    async def fetch_leagues(self, limit: int = 100) -> list[dict[str, Any]]:
        """Fetch OpenDota leagues reference data."""
        bounded_limit = max(1, min(limit, 200))
        return await self._fetch_list_endpoint(path="/leagues", bounded_limit=bounded_limit)

    async def fetch_team_by_id(self, team_id: int) -> dict[str, Any] | None:
        """Fetch single team by ID from OpenDota."""
        try:
            return await self._fetch_dict_endpoint(path=f"/teams/{team_id}")
        except OpenDotaServiceError:
            return None

    async def fetch_league_by_id(self, league_id: int) -> dict[str, Any] | None:
        """Fetch single league by ID from OpenDota."""
        try:
            return await self._fetch_dict_endpoint(path=f"/leagues/{league_id}")
        except OpenDotaServiceError:
            return None

    async def fetch_match_details(self, match_id: int) -> dict[str, Any]:
        """Fetch OpenDota match details for replay preparation."""
        return await self._fetch_dict_endpoint(path=f"/matches/{match_id}")

    @staticmethod
    def build_replay_url(*, match_id: int, cluster: object, replay_salt: object) -> str:
        """Build Valve replay URL from OpenDota match detail fields."""
        cluster_value = OpenDotaService._normalize_positive_int(cluster)
        replay_salt_value = OpenDotaService._normalize_positive_int(replay_salt)
        if cluster_value is None or replay_salt_value is None:
            raise OpenDotaServiceError(
                "Missing required replay fields from OpenDota match details (cluster/replay_salt)."
            )

        return (
            f"http://replay{cluster_value}.valve.net/570/"
            f"{match_id}_{replay_salt_value}.dem.bz2"
        )

    async def _fetch_list_endpoint(
        self,
        *,
        path: str,
        bounded_limit: int,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch a list endpoint and apply shared timeout/error handling."""

        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers=self._request_headers(),
                trust_env=False,
            ) as client:
                response = await client.get(path, params=params)
                response.raise_for_status()

            payload = response.json()
            if not isinstance(payload, list):
                raise OpenDotaServiceError("OpenDota returned an unexpected payload shape.")

            typed_payload: list[dict[str, Any]] = [
                item for item in payload if isinstance(item, dict)
            ]
            return typed_payload[:bounded_limit]

        except httpx.TimeoutException as exc:
            raise OpenDotaServiceError("OpenDota request timed out.") from exc
        except httpx.HTTPStatusError as exc:
            raise OpenDotaServiceError(self._http_status_error_message(exc.response.status_code)) from exc
        except ValueError as exc:
            raise OpenDotaServiceError("OpenDota returned invalid JSON.") from exc
        except httpx.HTTPError as exc:
            raise OpenDotaServiceError("Failed to reach OpenDota API.") from exc

    async def _fetch_dict_endpoint(self, *, path: str) -> dict[str, Any]:
        """Fetch a dict endpoint and apply shared timeout/error handling."""

        try:
            async with httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers=self._request_headers(),
                trust_env=False,
            ) as client:
                response = await client.get(path)
                response.raise_for_status()

            payload = response.json()
            if not isinstance(payload, dict):
                raise OpenDotaServiceError("OpenDota returned an unexpected payload shape.")
            return payload

        except httpx.TimeoutException as exc:
            raise OpenDotaServiceError("OpenDota request timed out.") from exc
        except httpx.HTTPStatusError as exc:
            raise OpenDotaServiceError(self._http_status_error_message(exc.response.status_code)) from exc
        except ValueError as exc:
            raise OpenDotaServiceError("OpenDota returned invalid JSON.") from exc
        except httpx.HTTPError as exc:
            raise OpenDotaServiceError("Failed to reach OpenDota API.") from exc

    @classmethod
    def _request_headers(cls) -> dict[str, str]:
        return dict(cls.DEFAULT_HEADERS)

    @staticmethod
    def _http_status_error_message(status_code: int) -> str:
        if status_code == 403:
            return (
                "OpenDota request failed with status 403; "
                "可能被上游风控拦截，请检查 User-Agent/网络环境。"
            )
        if status_code == 429:
            return (
                "OpenDota request failed with status 429; "
                "上游提示 daily api limit exceeded，当前 IP 的每日额度已耗尽。"
            )
        return f"OpenDota request failed with status {status_code}."

    @staticmethod
    def _normalize_positive_int(value: object) -> int | None:
        if isinstance(value, bool) or value is None:
            return None
        if isinstance(value, int):
            return value if value > 0 else None
        if isinstance(value, float):
            normalized = int(value)
            return normalized if normalized > 0 else None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                normalized = int(stripped)
            except ValueError:
                return None
            return normalized if normalized > 0 else None
        return None

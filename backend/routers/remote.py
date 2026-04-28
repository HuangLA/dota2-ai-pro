"""Remote mirror endpoints for OpenDota sync and ingest workflows."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from database.sqlite_db import get_connection
from services.opendota_service import OpenDotaService, OpenDotaServiceError
from services.opendota_sync_service import OpenDotaSyncService
from services.replay_download_service import ReplayDownloadService
from storage.opendota_match_storage import OpenDotaMatchStorage
from storage.opendota_reference_storage import OpenDotaReferenceStorage
from storage.replay_download_storage import ReplayDownloadStorage

router = APIRouter()
logger = logging.getLogger(__name__)

opendota_service = OpenDotaService()
opendota_match_storage = OpenDotaMatchStorage()
opendota_reference_storage = OpenDotaReferenceStorage()
replay_download_storage = ReplayDownloadStorage()
SEARCH_UPSTREAM_PAGE_SIZE = 20
opendota_sync_service = OpenDotaSyncService(
    opendota_service=opendota_service,
    opendota_match_storage=opendota_match_storage,
    opendota_reference_storage=opendota_reference_storage,
)
replay_download_service = ReplayDownloadService(
    opendota_service=opendota_service,
    replay_download_storage=replay_download_storage,
    opendota_match_storage=opendota_match_storage,
)


class RemoteMatchRecord(BaseModel):
    match_id: int
    start_time: int
    duration: int
    radiant_team_id: int | None = None
    dire_team_id: int | None = None
    leagueid: int | None = None
    radiant_team_name: str | None = None
    dire_team_name: str | None = None
    league_name: str | None = None
    source: str
    last_synced_at: int
    radiant_icon_url: str | None = None
    dire_icon_url: str | None = None
    radiant_logo_url: str | None = None
    dire_logo_url: str | None = None
    league_icon_url: str | None = None
    league_logo_url: str | None = None
    radiant_logo_sponsor_url: str | None = None
    dire_logo_sponsor_url: str | None = None
    league_image_url: str | None = None
    league_banner_url: str | None = None
    download_task_id: str | None = None
    download_status: str | None = None
    download_attempt_count: int | None = None
    download_error_code: str | None = None
    download_error_message: str | None = None
    download_updated_at: int | None = None
    local_parse_status: str | None = None
    local_replay_path: str | None = None
    radiant_win: bool | None = None
    winner_team: str | None = None
    winner_name: str | None = None
    winner_display_name: str | None = None
    hero_ids: list[int] = Field(default_factory=list)
    players: list["RemoteMatchPlayerRecord"] = Field(default_factory=list)
    radiant_players: list["RemoteMatchPlayerRecord"] = Field(default_factory=list)
    dire_players: list["RemoteMatchPlayerRecord"] = Field(default_factory=list)


class RemoteMatchPlayerRecord(BaseModel):
    account_id: int | None = None
    hero_id: int | None = None
    player_slot: int | None = None
    team_id: int | None = None
    team: str | None = None
    persona_name: str | None = None
    pro_name: str | None = None
    player_name: str | None = None
    display_name: str | None = None
    display_type: str | None = None


RemoteMatchRecord.model_rebuild()


class RemoteMatchListResponse(BaseModel):
    status: str
    message: str | None = None
    total: int
    limit: int
    offset: int
    matches: list[RemoteMatchRecord]


class RemoteSyncRequest(BaseModel):
    include_pro: bool = True
    include_public: bool = False
    limit: int = Field(default=100, ge=1, le=200)
    sync_reference: bool = True


class RemoteSyncResponse(BaseModel):
    status: str
    message: str | None = None
    fetched: dict[str, int]
    inserted: dict[str, int]
    updated: dict[str, int]
    total_inserted: int
    total_updated: int
    reference: dict[str, int]


class RemoteIngestRequest(BaseModel):
    match_ids: list[int] = Field(..., min_length=1)


class RemoteIngestItem(BaseModel):
    match_id: int
    status: str
    task_id: str | None = None
    message: str | None = None


class RemoteIngestResponse(BaseModel):
    status: str
    total: int
    succeeded: int
    failed: int
    results: list[RemoteIngestItem]


class RemoteMatchStatusResponse(BaseModel):
    status: str
    match_id: int
    download_task: dict[str, Any] | None = None
    local_parse_status: str | None = None
    local_replay_path: str | None = None
    replay_dem_exists: bool = False
    replay_bz2_exists: bool = False


def _is_missing_name(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    return False


def _normalize_search_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.strip().split())
    return normalized if normalized else None


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


def _summarize_live_search_errors(errors: list[Exception]) -> str | None:
    if not errors:
        return None

    messages = [str(error).strip() for error in errors if str(error).strip()]
    if not messages:
        return None

    for message in messages:
        normalized = message.lower()
        if "status 429" in normalized or "daily api limit exceeded" in normalized:
            return (
                "OpenDota 当前对本机 IP 触发了 daily api limit exceeded；"
                "本次搜索只能返回本地已缓存的结果，未缓存的比赛或联赛暂时无法补抓。"
            )

    return messages[0]


@dataclass(frozen=True)
class DerivedQueryTerms:
    match_id: int | None = None
    player_id: int | None = None
    league_id: int | None = None
    team_id: int | None = None
    player_name: str | None = None
    league_name: str | None = None
    team_name: str | None = None
    apply_player_filter: bool = False
    apply_league_filter: bool = False
    apply_team_filter: bool = False
    has_explicit_scope: bool = False
    is_invalid: bool = False


_QUERY_PREFIX_PATTERN = re.compile(
    r"^(match|match_id|player|player_id|player_name|league|league_id|league_name|team|team_id|team_name|比赛|玩家|联赛|战队|队伍)\s*[:：=]?\s*(.+)$",
    re.IGNORECASE,
)


def _derive_query_terms(
    q: str | None,
) -> DerivedQueryTerms:
    normalized_query = _normalize_search_text(q)
    if normalized_query is None:
        return DerivedQueryTerms()

    prefixed_query = _QUERY_PREFIX_PATTERN.match(normalized_query)
    if prefixed_query:
        normalized_key = prefixed_query.group(1).strip().lower()
        normalized_value = _normalize_search_text(prefixed_query.group(2))
        if normalized_value is None:
            return DerivedQueryTerms(has_explicit_scope=True, is_invalid=True)

        numeric_value = _normalize_positive_int(normalized_value)
        if normalized_key in {"match", "match_id", "比赛"}:
            return DerivedQueryTerms(
                match_id=numeric_value,
                has_explicit_scope=True,
                is_invalid=numeric_value is None,
            )
        if normalized_key in {"player_id"}:
            return DerivedQueryTerms(
                player_id=numeric_value,
                apply_player_filter=numeric_value is not None,
                has_explicit_scope=True,
                is_invalid=numeric_value is None,
            )
        if normalized_key in {"player", "player_name", "玩家"}:
            if numeric_value is not None:
                return DerivedQueryTerms(
                    player_id=numeric_value,
                    apply_player_filter=True,
                    has_explicit_scope=True,
                )
            return DerivedQueryTerms(
                player_name=normalized_value,
                apply_player_filter=True,
                has_explicit_scope=True,
            )
        if normalized_key in {"league_id"}:
            return DerivedQueryTerms(
                league_id=numeric_value,
                apply_league_filter=numeric_value is not None,
                has_explicit_scope=True,
                is_invalid=numeric_value is None,
            )
        if normalized_key in {"league", "league_name", "联赛"}:
            if numeric_value is not None:
                return DerivedQueryTerms(
                    league_id=numeric_value,
                    apply_league_filter=True,
                    has_explicit_scope=True,
                )
            return DerivedQueryTerms(
                league_name=normalized_value,
                apply_league_filter=True,
                has_explicit_scope=True,
            )
        if normalized_key in {"team_id"}:
            return DerivedQueryTerms(
                team_id=numeric_value,
                apply_team_filter=numeric_value is not None,
                has_explicit_scope=True,
                is_invalid=numeric_value is None,
            )
        if normalized_key in {"team", "team_name", "战队", "队伍"}:
            if numeric_value is not None:
                return DerivedQueryTerms(
                    team_id=numeric_value,
                    apply_team_filter=True,
                    has_explicit_scope=True,
                )
            return DerivedQueryTerms(
                team_name=normalized_value,
                apply_team_filter=True,
                has_explicit_scope=True,
            )

    numeric_value = _normalize_positive_int(normalized_query)
    if numeric_value is not None:
        if len(normalized_query) >= 10:
            return DerivedQueryTerms(match_id=numeric_value)
        if len(normalized_query) >= 7:
            return DerivedQueryTerms(player_id=numeric_value, apply_player_filter=True)
        return DerivedQueryTerms(league_id=numeric_value, apply_league_filter=True)

    return DerivedQueryTerms(
        player_name=normalized_query,
        league_name=normalized_query,
    )


def _bucket_team(team_id: int | None) -> str | None:
    if team_id == 2:
        return "radiant"
    if team_id == 3:
        return "dire"
    return None


def _resolve_winner_payload(match_row: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    radiant_win = match_row.get("radiant_win")
    if not isinstance(radiant_win, bool):
        return None, None, None

    winner_team = "radiant" if radiant_win else "dire"
    winner_name = "Radiant" if radiant_win else "Dire"
    if radiant_win:
        winner_display_name = match_row.get("radiant_team_name") or "Radiant"
    else:
        winner_display_name = match_row.get("dire_team_name") or "Dire"
    return winner_team, winner_name, winner_display_name


def _resolve_remote_player_display(
    *,
    is_professional: bool,
    persona_name: object,
    pro_name: object,
    fallback_name: object = None,
) -> tuple[str | None, str | None]:
    persona = _normalize_search_text(persona_name)
    pro = _normalize_search_text(pro_name)
    fallback = _normalize_search_text(fallback_name)

    if is_professional:
        if pro:
            return pro, "pro_name"
        if persona:
            return persona, "persona_name"
        if fallback:
            return fallback, "player_name"
        return None, None

    if persona:
        return persona, "persona_name"
    if pro:
        return pro, "pro_name"
    if fallback:
        return fallback, "player_name"
    return None, None


def _build_remote_player_records(
    *,
    is_professional: bool,
    player_identities: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    all_players: list[dict[str, Any]] = []
    radiant_players: list[dict[str, Any]] = []
    dire_players: list[dict[str, Any]] = []

    for identity in player_identities:
        team_id = identity.get("team_id") or identity.get("team")
        if not isinstance(team_id, int):
            team_id = None

        display_name, display_type = _resolve_remote_player_display(
            is_professional=is_professional,
            persona_name=identity.get("persona_name"),
            pro_name=identity.get("pro_name"),
            fallback_name=(
                str(identity.get("account_id")) if identity.get("account_id") is not None else None
            ),
        )
        player_record = RemoteMatchPlayerRecord(
            account_id=identity.get("account_id") if isinstance(identity.get("account_id"), int) else None,
            hero_id=identity.get("hero_id") if isinstance(identity.get("hero_id"), int) else None,
            player_slot=identity.get("player_slot") if isinstance(identity.get("player_slot"), int) else None,
            team_id=team_id,
            team=_bucket_team(team_id),
            persona_name=_normalize_search_text(identity.get("persona_name")),
            pro_name=_normalize_search_text(identity.get("pro_name")),
            player_name=display_name,
            display_name=display_name,
            display_type=display_type,
        ).model_dump()
        all_players.append(player_record)
        if team_id == 2:
            radiant_players.append(player_record)
        elif team_id == 3:
            dire_players.append(player_record)

    return all_players, radiant_players, dire_players


def _collect_hero_ids(player_identities: list[dict[str, Any]]) -> list[int]:
    hero_ids: list[int] = []
    seen_hero_ids: set[int] = set()
    for identity in player_identities:
        hero_id = identity.get("hero_id")
        if not isinstance(hero_id, int) or hero_id <= 0 or hero_id in seen_hero_ids:
            continue
        seen_hero_ids.add(hero_id)
        hero_ids.append(hero_id)
    return hero_ids


def _build_match_summary(
    *,
    match_row: dict[str, Any],
    player_identities: list[dict[str, Any]],
) -> RemoteMatchRecord:
    is_professional = bool(match_row.get("is_professional"))
    winner_team, winner_name, winner_display_name = _resolve_winner_payload(match_row)
    players, radiant_players, dire_players = _build_remote_player_records(
        is_professional=is_professional,
        player_identities=player_identities,
    )
    hero_ids = _collect_hero_ids(player_identities)
    return RemoteMatchRecord(
        match_id=int(match_row["match_id"]),
        start_time=int(match_row["start_time"]),
        duration=int(match_row["duration"]),
        radiant_team_id=match_row.get("radiant_team_id"),
        dire_team_id=match_row.get("dire_team_id"),
        leagueid=match_row.get("leagueid"),
        radiant_team_name=match_row.get("radiant_team_name"),
        dire_team_name=match_row.get("dire_team_name"),
        league_name=match_row.get("league_name"),
        source=str(match_row.get("source")),
        last_synced_at=int(match_row["last_synced_at"]),
        radiant_icon_url=match_row.get("radiant_icon_url"),
        dire_icon_url=match_row.get("dire_icon_url"),
        radiant_logo_url=match_row.get("radiant_logo_url"),
        dire_logo_url=match_row.get("dire_logo_url"),
        league_icon_url=match_row.get("league_icon_url"),
        league_logo_url=match_row.get("league_logo_url"),
        league_image_url=match_row.get("league_image_url"),
        league_banner_url=match_row.get("league_banner_url"),
        radiant_logo_sponsor_url=match_row.get("radiant_logo_sponsor_url"),
        dire_logo_sponsor_url=match_row.get("dire_logo_sponsor_url"),
        download_task_id=match_row.get("download_task_id"),
        download_status=match_row.get("download_status"),
        download_attempt_count=match_row.get("download_attempt_count"),
        download_error_code=match_row.get("download_error_code"),
        download_error_message=match_row.get("download_error_message"),
        download_updated_at=match_row.get("download_updated_at"),
        local_parse_status=match_row.get("local_parse_status"),
        local_replay_path=match_row.get("local_replay_path"),
        radiant_win=match_row.get("radiant_win"),
        winner_team=winner_team,
        winner_name=winner_name,
        winner_display_name=winner_display_name,
        hero_ids=hero_ids,
        players=players,
        radiant_players=radiant_players,
        dire_players=dire_players,
    )


def _build_remote_match_records(rows: list[dict[str, Any]]) -> list[RemoteMatchRecord]:
    records: list[RemoteMatchRecord] = []
    for row in rows:
        raw_match_id = row.get("match_id")
        if not isinstance(raw_match_id, int):
            continue
        try:
            player_identities = opendota_match_storage.get_match_player_identities(raw_match_id)
        except Exception:
            player_identities = []
        records.append(_build_match_summary(match_row=row, player_identities=player_identities))
    return records


async def _backfill_missing_league_names(*, match_ids: list[int]) -> None:
    for current_match_id in match_ids:
        try:
            detail = await opendota_service.fetch_match_details(current_match_id)
            opendota_match_storage.upsert_match_detail(detail)
        except Exception:
            # Best-effort backfill should never block listing responses.
            continue


def _find_match_ids_with_missing_metadata(records: list[dict[str, Any]]) -> list[int]:
    match_ids: list[int] = []
    for record in records:
        if not (
            _is_missing_name(record.get("radiant_team_name"))
            or _is_missing_name(record.get("dire_team_name"))
            or _is_missing_name(record.get("league_name"))
        ):
            continue

        raw_match_id = record.get("match_id")
        if isinstance(raw_match_id, int):
            match_ids.append(raw_match_id)

    return match_ids


def _find_match_ids_with_missing_player_identities(records: list[dict[str, Any]]) -> list[int]:
    match_ids: list[int] = []
    for record in records:
        raw_match_id = record.get("match_id")
        if not isinstance(raw_match_id, int):
            continue

        try:
            player_identities = opendota_match_storage.get_match_player_identities(raw_match_id)
        except Exception:
            player_identities = []
        if player_identities:
            continue

        match_ids.append(raw_match_id)

    return match_ids


def _normalize_search_matches(
    raw_matches: list[dict[str, Any]],
    *,
    forced_leagueid: int | None = None,
    forced_team_id: int | None = None,
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen_match_ids: set[int] = set()

    for raw in raw_matches:
        match_id = raw.get("match_id")
        if not isinstance(match_id, int) or match_id <= 0 or match_id in seen_match_ids:
            continue

        payload = dict(raw)
        if forced_leagueid is not None and not payload.get("leagueid"):
            payload["leagueid"] = forced_leagueid
        if forced_team_id is not None:
            team_is_radiant = payload.get("radiant")
            opposing_team_id = _normalize_positive_int(payload.get("opposing_team_id"))
            opposing_team_name = _normalize_search_text(payload.get("opposing_team_name"))
            opposing_team_logo = _normalize_search_text(payload.get("opposing_team_logo"))
            if team_is_radiant is True:
                if not payload.get("radiant_team_id"):
                    payload["radiant_team_id"] = forced_team_id
                if opposing_team_id is not None:
                    payload["dire_team_id"] = payload.get("dire_team_id") or opposing_team_id
                if opposing_team_name is not None:
                    payload["dire_team_name"] = payload.get("dire_team_name") or opposing_team_name
                if opposing_team_logo is not None:
                    payload["dire_logo_url"] = payload.get("dire_logo_url") or opposing_team_logo
                    payload["dire_icon_url"] = payload.get("dire_icon_url") or opposing_team_logo
            elif team_is_radiant is False:
                if not payload.get("dire_team_id"):
                    payload["dire_team_id"] = forced_team_id
                if opposing_team_id is not None:
                    payload["radiant_team_id"] = payload.get("radiant_team_id") or opposing_team_id
                if opposing_team_name is not None:
                    payload["radiant_team_name"] = payload.get("radiant_team_name") or opposing_team_name
                if opposing_team_logo is not None:
                    payload["radiant_logo_url"] = payload.get("radiant_logo_url") or opposing_team_logo
                    payload["radiant_icon_url"] = payload.get("radiant_icon_url") or opposing_team_logo
        normalized.append(payload)
        seen_match_ids.add(match_id)

    return normalized


def _upsert_search_matches(matches: list[dict[str, Any]]) -> None:
    pro_matches: list[dict[str, Any]] = []
    public_matches: list[dict[str, Any]] = []

    for match in matches:
        leagueid = match.get("leagueid")
        if isinstance(leagueid, int) and leagueid > 0:
            pro_matches.append(match)
        else:
            public_matches.append(match)

    if pro_matches:
        opendota_match_storage.upsert_recent_matches(pro_matches, source="pro")
    if public_matches:
        opendota_match_storage.upsert_recent_matches(public_matches, source="public")


async def _fetch_search_match_pages(
    fetch_page: Callable[[int, int], Awaitable[list[dict[str, Any]]]],
    *,
    window: int,
    page_size: int = SEARCH_UPSTREAM_PAGE_SIZE,
) -> tuple[list[dict[str, Any]], bool, list[Exception]]:
    """Fetch enough upstream pages to cover the requested search window."""
    rows: list[dict[str, Any]] = []
    errors: list[Exception] = []
    target = max(window, page_size)
    last_page_count = 0

    for page_offset in range(0, target, page_size):
        try:
            page_rows = await fetch_page(page_size, page_offset)
        except Exception as exc:
            errors.append(exc)
            break

        rows.extend(page_rows)
        last_page_count = len(page_rows)
        if last_page_count < page_size:
            return rows, False, errors

    return rows, last_page_count >= page_size, errors


async def _backfill_missing_match_metadata(*, match_ids: list[int]) -> None:
    if not match_ids:
        return

    detail_tasks = [opendota_service.fetch_match_details(match_id) for match_id in match_ids]
    detail_results = await asyncio.gather(*detail_tasks, return_exceptions=True)
    for detail in detail_results:
        if isinstance(detail, dict):
            opendota_match_storage.upsert_match_detail(detail)


async def _load_enriched_matches(match_ids: list[int]) -> list[dict[str, Any]]:
    if not match_ids:
        return []

    _, rows = opendota_match_storage.list_recent_matches(
        limit=len(match_ids),
        offset=0,
        match_ids=match_ids,
        include_pro=True,
        include_public=True,
    )

    missing_match_ids = _find_match_ids_with_missing_metadata(rows)
    if missing_match_ids:
        await _backfill_missing_match_metadata(match_ids=missing_match_ids)
        _, rows = opendota_match_storage.list_recent_matches(
            limit=len(match_ids),
            offset=0,
            match_ids=match_ids,
            include_pro=True,
            include_public=True,
        )

    rows_by_match_id = {
        int(row["match_id"]): row
        for row in rows
        if isinstance(row.get("match_id"), int)
    }
    return [rows_by_match_id[match_id] for match_id in match_ids if match_id in rows_by_match_id]


async def _backfill_search_match_details(match_ids: set[int]) -> list[Exception]:
    if not match_ids:
        return []

    ordered_match_ids = sorted(match_ids)
    detail_results = await asyncio.gather(
        *(opendota_service.fetch_match_details(match_id) for match_id in ordered_match_ids),
        return_exceptions=True,
    )

    errors: list[Exception] = []
    for detail in detail_results:
        if isinstance(detail, dict):
            opendota_match_storage.upsert_match_detail(detail)
        elif isinstance(detail, Exception):
            errors.append(detail)

    return errors


async def _fetch_search_candidates(
    *,
    match_id: int | None,
    league_id: int | None,
    league_name: str | None,
    team_id: int | None,
    team_name: str | None,
    player_id: int | None,
    player_name: str | None,
    apply_player_filter: bool,
    apply_league_filter: bool,
    apply_team_filter: bool,
    limit: int,
) -> tuple[set[int], set[int], set[int], set[int], set[int], bool, list[Exception]]:
    """Resolve live and cached match IDs for remote search inputs."""
    candidate_match_ids: set[int] = set()
    league_ids: set[int] = set()
    team_ids: set[int] = set()
    team_candidate_match_ids: set[int] = set()
    account_ids: set[int] = set()
    has_more_candidates = False
    live_errors: list[Exception] = []

    if match_id is not None:
        candidate_match_ids.add(match_id)

    if league_id is not None:
        league_ids.add(league_id)

    if team_id is not None:
        team_ids.add(team_id)

    if league_name is not None:
        matched_leagues = opendota_reference_storage.search_leagues_by_name(league_name, limit=limit)
        for record in matched_leagues:
            league_value = record.get("leagueid")
            if isinstance(league_value, int):
                league_ids.add(league_value)

        if not league_ids:
            league_name_match_ids = opendota_match_storage.search_match_ids_by_league_name(league_name, limit=limit)
            candidate_match_ids.update(league_name_match_ids)
            has_more_candidates = has_more_candidates or len(league_name_match_ids) >= limit
        if not league_ids and not candidate_match_ids:
            try:
                fetched_leagues = await opendota_service.fetch_leagues(limit=max(limit * 5, 100))
                opendota_reference_storage.upsert_leagues(fetched_leagues)
                matched_leagues = opendota_reference_storage.search_leagues_by_name(league_name, limit=limit)
                for record in matched_leagues:
                    league_value = record.get("leagueid")
                    if isinstance(league_value, int):
                        league_ids.add(league_value)
            except OpenDotaServiceError as exc:
                live_errors.append(exc)

    if team_name is not None:
        matched_teams = opendota_reference_storage.search_teams_by_name(team_name, limit=limit)
        for record in matched_teams:
            team_value = record.get("team_id")
            if isinstance(team_value, int):
                team_ids.add(team_value)

        if not team_ids:
            team_name_match_ids = opendota_match_storage.search_match_ids_by_team_name(team_name, limit=limit)
            candidate_match_ids.update(team_name_match_ids)
            team_candidate_match_ids.update(team_name_match_ids)
            has_more_candidates = has_more_candidates or len(team_name_match_ids) >= limit
        if not team_ids and not candidate_match_ids:
            try:
                fetched_teams = await opendota_service.fetch_teams(limit=max(limit * 5, 100))
                opendota_reference_storage.upsert_teams(fetched_teams)
                matched_teams = opendota_reference_storage.search_teams_by_name(team_name, limit=limit)
                for record in matched_teams:
                    team_value = record.get("team_id")
                    if isinstance(team_value, int):
                        team_ids.add(team_value)
            except OpenDotaServiceError as exc:
                live_errors.append(exc)

    if player_id is not None:
        account_ids.add(player_id)

    if player_name is not None:
        player_rows = opendota_match_storage.search_match_player_identities_by_name(
            player_name,
            limit=max(limit * 2, 20),
        )
        for row in player_rows:
            raw_match_id = row.get("match_id")
            if isinstance(raw_match_id, int):
                candidate_match_ids.add(raw_match_id)
            raw_account_id = row.get("account_id")
            if isinstance(raw_account_id, int):
                account_ids.add(raw_account_id)

        if not account_ids:
            try:
                player_search_rows = await opendota_service.search_players(player_name, limit=max(limit, 10))
                for row in player_search_rows:
                    raw_account_id = row.get("account_id")
                    if isinstance(raw_account_id, int):
                        account_ids.add(raw_account_id)
            except OpenDotaServiceError as exc:
                live_errors.append(exc)

    live_matches: list[dict[str, Any]] = []
    use_intersection_mode = apply_player_filter and apply_league_filter
    if account_ids:
        account_fetch_limit = max(limit, 20)
        if use_intersection_mode and len(league_ids) == 1:
            league_filter = next(iter(league_ids))
            fetch_tasks = [
                opendota_service.fetch_player_matches(
                    account_id,
                    limit=account_fetch_limit,
                    offset=0,
                    leagueid=league_filter,
                )
                for account_id in sorted(account_ids)
            ]
        else:
            fetch_tasks = [
                opendota_service.fetch_player_matches(
                    account_id,
                    limit=account_fetch_limit,
                    offset=0,
                )
                for account_id in sorted(account_ids)
            ]
        fetched_rows = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        for rows in fetched_rows:
            if isinstance(rows, Exception):
                live_errors.append(rows)
                continue
            normalized_rows = _normalize_search_matches(rows)
            live_matches.extend(normalized_rows)
            for raw in normalized_rows:
                raw_match_id = raw.get("match_id")
                if isinstance(raw_match_id, int):
                    candidate_match_ids.add(raw_match_id)

    if league_ids and (not use_intersection_mode or not account_ids):
        league_fetch_limit = max(limit, 20)
        for league_id_value in sorted(league_ids):
            try:
                cached_total, cached_rows = opendota_match_storage.list_recent_matches(
                    limit=league_fetch_limit,
                    offset=0,
                    leagueid=league_id_value,
                    include_pro=True,
                    include_public=True,
                )
                has_more_candidates = has_more_candidates or cached_total > len(cached_rows)
                for row in cached_rows:
                    raw_match_id = row.get("match_id")
                    if isinstance(raw_match_id, int):
                        candidate_match_ids.add(raw_match_id)
            except Exception:
                logger.exception("Failed to read cached OpenDota league matches for leagueid=%s", league_id_value)

            async def fetch_league_page(page_limit: int, page_offset: int, *, current_league_id: int = league_id_value) -> list[dict[str, Any]]:
                return await opendota_service.fetch_league_matches(
                    current_league_id,
                    limit=page_limit,
                    offset=page_offset,
                )

            rows, has_more_league_rows, league_errors = await _fetch_search_match_pages(
                fetch_league_page,
                window=league_fetch_limit,
            )
            live_errors.extend(league_errors)
            has_more_candidates = has_more_candidates or has_more_league_rows
            normalized_rows = _normalize_search_matches(rows, forced_leagueid=league_id_value)
            live_matches.extend(normalized_rows)
            for raw in normalized_rows:
                raw_match_id = raw.get("match_id")
                if isinstance(raw_match_id, int):
                    candidate_match_ids.add(raw_match_id)

    if team_ids:
        team_fetch_limit = max(limit, 20)
        for team_id_value in sorted(team_ids):
            try:
                cached_total, cached_rows = opendota_match_storage.list_recent_matches(
                    limit=team_fetch_limit,
                    offset=0,
                    team_id=team_id_value,
                    include_pro=True,
                    include_public=True,
                )
                has_more_candidates = has_more_candidates or cached_total > len(cached_rows)
                for row in cached_rows:
                    raw_match_id = row.get("match_id")
                    if isinstance(raw_match_id, int):
                        candidate_match_ids.add(raw_match_id)
                        team_candidate_match_ids.add(raw_match_id)
            except Exception:
                logger.exception("Failed to read cached OpenDota team matches for team_id=%s", team_id_value)

            async def fetch_team_page(page_limit: int, page_offset: int, *, current_team_id: int = team_id_value) -> list[dict[str, Any]]:
                return await opendota_service.fetch_team_matches(
                    current_team_id,
                    limit=page_limit,
                    offset=page_offset,
                )

            rows, has_more_team_rows, team_errors = await _fetch_search_match_pages(
                fetch_team_page,
                window=team_fetch_limit,
            )
            live_errors.extend(team_errors)
            has_more_candidates = has_more_candidates or has_more_team_rows
            normalized_rows = _normalize_search_matches(rows, forced_team_id=team_id_value)
            live_matches.extend(normalized_rows)
            for raw in normalized_rows:
                raw_match_id = raw.get("match_id")
                if isinstance(raw_match_id, int):
                    candidate_match_ids.add(raw_match_id)
                    team_candidate_match_ids.add(raw_match_id)

    if live_matches:
        _upsert_search_matches(live_matches)

    return candidate_match_ids, league_ids, account_ids, team_ids, team_candidate_match_ids, has_more_candidates, live_errors


async def _build_remote_search_results(
    *,
    candidate_match_ids: set[int],
    league_ids: set[int],
    account_ids: set[int],
    team_ids: set[int],
    team_candidate_match_ids: set[int],
    apply_player_filter: bool,
    apply_league_filter: bool,
    apply_team_filter: bool,
    include_pro: bool,
    include_public: bool,
) -> list[RemoteMatchRecord]:
    if not candidate_match_ids:
        return []

    ordered_match_ids = sorted(candidate_match_ids)
    match_rows = await _load_enriched_matches(ordered_match_ids)
    if not match_rows:
        return []

    result: list[RemoteMatchRecord] = []
    for row in match_rows:
        source = row.get("source")
        if source == "pro" and not include_pro:
            continue
        if source == "public" and not include_public:
            continue

        row_league_id = row.get("leagueid")
        if apply_league_filter and league_ids and row_league_id not in league_ids:
            continue

        if apply_team_filter and team_ids:
            row_match_id = row.get("match_id")
            row_radiant_team_id = row.get("radiant_team_id")
            row_dire_team_id = row.get("dire_team_id")
            if (
                row_match_id not in team_candidate_match_ids
                and row_radiant_team_id not in team_ids
                and row_dire_team_id not in team_ids
            ):
                continue

        try:
            player_identities = opendota_match_storage.get_match_player_identities(int(row["match_id"]))
        except Exception:
            player_identities = []
        if apply_player_filter and account_ids:
            if not any(
                isinstance(identity.get("account_id"), int)
                and identity.get("account_id") in account_ids
                for identity in player_identities
            ):
                continue

        result.append(_build_match_summary(match_row=row, player_identities=player_identities))

    result.sort(key=lambda item: (item.start_time, item.match_id), reverse=True)
    return result


async def _list_enriched_remote_matches(
    *,
    limit: int,
    offset: int,
    include_pro: bool,
    include_public: bool,
    team_id: int | None = None,
    match_id: int | None = None,
    leagueid: int | None = None,
) -> RemoteMatchListResponse:
    total, rows = opendota_match_storage.list_recent_matches(
        limit=limit,
        offset=offset,
        include_pro=include_pro,
        include_public=include_public,
        team_id=team_id,
        match_id=match_id,
        leagueid=leagueid,
    )

    missing_match_ids = list(
        dict.fromkeys(
            [
                *_find_match_ids_with_missing_metadata(rows),
                *_find_match_ids_with_missing_player_identities(rows),
            ]
        )
    )
    if missing_match_ids:
        await _backfill_missing_match_metadata(match_ids=missing_match_ids[: len(rows)])
        total, rows = opendota_match_storage.list_recent_matches(
            limit=limit,
            offset=offset,
            include_pro=include_pro,
            include_public=include_public,
            team_id=team_id,
            match_id=match_id,
            leagueid=leagueid,
        )

    return RemoteMatchListResponse(
        status="ok",
        total=total,
        limit=limit,
        offset=offset,
        matches=_build_remote_match_records(rows),
    )


@router.get("/matches", response_model=RemoteMatchListResponse)
async def list_remote_matches(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    include_pro: bool = Query(True),
    include_public: bool = Query(False),
    team_id: int | None = Query(None, ge=1),
    match_id: int | None = Query(None, ge=1),
    leagueid: int | None = Query(None, ge=1),
) -> RemoteMatchListResponse:
    """List synced remote mirror matches with source filters and pagination."""
    effective_include_public = include_public if (team_id is not None or match_id is not None or leagueid is not None) else False
    return await _list_enriched_remote_matches(
        limit=limit,
        offset=offset,
        include_pro=include_pro,
        include_public=effective_include_public,
        team_id=team_id,
        match_id=match_id,
        leagueid=leagueid,
    )


@router.get("/search", response_model=RemoteMatchListResponse)
async def search_remote_matches(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None),
    include_pro: bool = Query(True),
    include_public: bool = Query(True),
    match_id: int | None = Query(None, ge=1),
    league_id: int | None = Query(None, ge=1),
    legacy_leagueid: int | None = Query(None, ge=1, alias="leagueid", include_in_schema=False),
    team_id: int | None = Query(None, ge=1),
    player_id: int | None = Query(None, ge=1),
    league_name: str | None = Query(None),
    team_name: str | None = Query(None),
    player_name: str | None = Query(None),
) -> RemoteMatchListResponse:
    """Return a unified enriched remote feed, optionally filtered by a free-form query."""
    try:
        if not include_pro and not include_public:
            return RemoteMatchListResponse(
                status="ok",
                message=None,
                total=0,
                limit=limit,
                offset=offset,
                matches=[],
            )

        derived_terms = _derive_query_terms(q)
        explicit_player_name = _normalize_search_text(player_name)
        explicit_league_name = _normalize_search_text(league_name)
        explicit_team_name = _normalize_search_text(team_name)

        effective_match_id = match_id if match_id is not None else derived_terms.match_id
        effective_player_id = player_id if player_id is not None else derived_terms.player_id
        effective_league_id = (
            league_id
            if league_id is not None
            else legacy_leagueid
            if legacy_leagueid is not None
            else derived_terms.league_id
        )
        effective_team_id = team_id if team_id is not None else derived_terms.team_id
        effective_player_name = (
            explicit_player_name
            if explicit_player_name is not None
            else derived_terms.player_name
        )
        effective_league_name = (
            explicit_league_name
            if explicit_league_name is not None
            else derived_terms.league_name
        )
        effective_team_name = (
            explicit_team_name
            if explicit_team_name is not None
            else derived_terms.team_name
        )
        apply_player_filter = (
            player_id is not None
            or explicit_player_name is not None
            or derived_terms.apply_player_filter
        )
        apply_league_filter = (
            league_id is not None
            or legacy_leagueid is not None
            or explicit_league_name is not None
            or derived_terms.apply_league_filter
        )
        apply_team_filter = (
            team_id is not None
            or explicit_team_name is not None
            or derived_terms.apply_team_filter
        )
        if (
            derived_terms.has_explicit_scope
            and derived_terms.is_invalid
            and match_id is None
            and player_id is None
            and league_id is None
            and legacy_leagueid is None
            and team_id is None
            and explicit_player_name is None
            and explicit_league_name is None
            and explicit_team_name is None
        ):
            return RemoteMatchListResponse(
                status="ok",
                message=None,
                total=0,
                limit=limit,
                offset=offset,
                matches=[],
            )

        if (
            effective_match_id is None
            and effective_league_id is None
            and effective_team_id is None
            and effective_player_id is None
            and effective_league_name is None
            and effective_team_name is None
            and effective_player_name is None
        ):
            effective_include_public = include_public if (
                match_id is not None
                or league_id is not None
                or legacy_leagueid is not None
                or team_id is not None
                or player_id is not None
                or league_name is not None
                or team_name is not None
                or player_name is not None
            ) else False
            return await _list_enriched_remote_matches(
                limit=limit,
                offset=offset,
                include_pro=include_pro,
                include_public=effective_include_public,
            )

        search_window = max(limit + offset, limit)
        (
            candidate_match_ids,
            resolved_league_ids,
            resolved_account_ids,
            resolved_team_ids,
            team_candidate_match_ids,
            has_more_candidates,
            live_errors,
        ) = await _fetch_search_candidates(
            match_id=effective_match_id,
            league_id=effective_league_id,
            league_name=effective_league_name,
            team_id=effective_team_id,
            team_name=effective_team_name,
            player_id=effective_player_id,
            player_name=effective_player_name,
            apply_player_filter=apply_player_filter,
            apply_league_filter=apply_league_filter,
            apply_team_filter=apply_team_filter,
            limit=search_window,
        )

        if not candidate_match_ids:
            return RemoteMatchListResponse(
                status="ok",
                message=_summarize_live_search_errors(live_errors),
                total=0,
                limit=limit,
                offset=offset,
                matches=[],
            )

        detail_errors = await _backfill_search_match_details(candidate_match_ids)
        live_errors.extend(detail_errors)

        matches = await _build_remote_search_results(
            candidate_match_ids=candidate_match_ids,
            league_ids=resolved_league_ids,
            account_ids=resolved_account_ids,
            team_ids=resolved_team_ids,
            team_candidate_match_ids=team_candidate_match_ids,
            apply_player_filter=apply_player_filter,
            apply_league_filter=apply_league_filter,
            apply_team_filter=apply_team_filter,
            include_pro=include_pro,
            include_public=include_public,
        )

        total = len(matches)
        paginated_matches = matches[offset : offset + limit]
        missing_detail_payload = any(
            not match.players and not match.hero_ids
            for match in paginated_matches
        )
        reported_total = (
            max(total, offset + len(paginated_matches) + 1)
            if has_more_candidates and len(paginated_matches) == limit
            else total
        )
        return RemoteMatchListResponse(
            status="ok",
            message=_summarize_live_search_errors(live_errors) if (total == 0 or missing_detail_payload) else None,
            total=reported_total,
            limit=limit,
            offset=offset,
            matches=paginated_matches,
        )
    except OpenDotaServiceError as exc:
        logger.warning("OpenDota search degraded safely: %s", exc)
        return RemoteMatchListResponse(
            status="ok",
            message=_summarize_live_search_errors([exc]),
            total=0,
            limit=limit,
            offset=offset,
            matches=[],
        )
    except Exception:
        logger.exception("Unexpected remote search failure")
        return RemoteMatchListResponse(
            status="ok",
            message="远端搜索发生了未预期异常；本次只能返回空结果。",
            total=0,
            limit=limit,
            offset=offset,
            matches=[],
        )


@router.post("/sync", response_model=RemoteSyncResponse)
async def sync_remote_matches(payload: RemoteSyncRequest) -> RemoteSyncResponse:
    """Trigger remote mirror sync for pro/public sources."""
    if not payload.include_pro and not payload.include_public:
        raise HTTPException(status_code=422, detail="At least one source must be enabled.")

    try:
        result = await opendota_sync_service.sync_selected_sources(
            include_pro=payload.include_pro,
            include_public=payload.include_public,
            limit=payload.limit,
            sync_reference=payload.sync_reference,
        )
    except OpenDotaServiceError as exc:
        return RemoteSyncResponse(
            status="error",
            message=str(exc),
            fetched={"pro": 0, "public": 0},
            inserted={"pro": 0, "public": 0},
            updated={"pro": 0, "public": 0},
            total_inserted=0,
            total_updated=0,
            reference={
                "teams_inserted": 0,
                "teams_updated": 0,
                "leagues_inserted": 0,
                "leagues_updated": 0,
            },
        )

    return RemoteSyncResponse(message=None, **result)


@router.post("/ingest", response_model=RemoteIngestResponse)
async def ingest_remote_matches(payload: RemoteIngestRequest) -> RemoteIngestResponse:
    """Ingest one or more match IDs through prepare+download+parse chain."""
    succeeded = 0
    failed = 0
    results: list[RemoteIngestItem] = []

    for match_id in payload.match_ids:
        try:
            task: dict[str, Any] = await replay_download_service.prepare_and_execute(match_id=match_id)
            status = str(task.get("status", "failed"))
            task_id = task.get("task_id")
            if status == "completed":
                succeeded += 1
            else:
                failed += 1
            results.append(
                RemoteIngestItem(
                    match_id=match_id,
                    status=status,
                    task_id=str(task_id) if isinstance(task_id, str) else None,
                    message=str(task.get("error_message")) if task.get("error_message") else None,
                )
            )
        except Exception as exc:
            failed += 1
            results.append(
                RemoteIngestItem(
                    match_id=match_id,
                    status="failed",
                    task_id=None,
                    message=str(exc),
                )
            )

    return RemoteIngestResponse(
        status="ok",
        total=len(payload.match_ids),
        succeeded=succeeded,
        failed=failed,
        results=results,
    )


@router.get("/matches/{match_id}/status", response_model=RemoteMatchStatusResponse)
async def get_remote_match_status(match_id: int) -> RemoteMatchStatusResponse:
    """Return latest download task and local parse/file status for one match."""
    latest = replay_download_storage.list_tasks(limit=1, offset=0, match_id=match_id)
    tasks = latest.get("tasks", []) if isinstance(latest, dict) else []
    task = tasks[0] if tasks else None

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT parse_status, replay_path FROM matches WHERE match_id = ?",
        (match_id,),
    )
    row = cursor.fetchone()
    local_parse_status = row["parse_status"] if row else None
    local_replay_path = row["replay_path"] if row else None

    replays_dir = Path(__file__).resolve().parent.parent / "data" / "replays"
    dem_path = replays_dir / f"{match_id}.dem"
    bz2_path = replays_dir / f"{match_id}.dem.bz2"

    return RemoteMatchStatusResponse(
        status="ok",
        match_id=match_id,
        download_task=task,
        local_parse_status=str(local_parse_status) if local_parse_status is not None else None,
        local_replay_path=str(local_replay_path) if isinstance(local_replay_path, str) else None,
        replay_dem_exists=dem_path.exists(),
        replay_bz2_exists=bz2_path.exists(),
    )


@router.delete("/matches/{match_id}/download")
async def cancel_match_download(match_id: int) -> dict[str, Any]:
    """Cancel active download task for a match and delete partial artifacts."""
    result = replay_download_service.cancel_match_download(match_id=match_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "No active download found."))
    return result

"""Match data endpoints."""

import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.opendota_service import OpenDotaService
from storage.match_storage import MatchStorage
from storage.opendota_match_storage import OpenDotaMatchStorage
from storage.parquet_storage import ParquetStorage
from utils.hero_mapping import get_hero_id

router = APIRouter()

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _resolve_backend_path(env_key: str, default_relative: str) -> str:
    configured = os.getenv(env_key, default_relative)
    candidate = Path(configured)
    if not candidate.is_absolute():
        candidate = BACKEND_ROOT / candidate
    return str(candidate)


# Initialize storage
match_storage = MatchStorage()
opendota_match_storage = OpenDotaMatchStorage()
opendota_service = OpenDotaService()
parquet_storage = ParquetStorage(_resolve_backend_path("MATCHES_DIR", "data/matches"))


def _resolve_duration_seconds(meta: Optional[dict], fallback_duration: int) -> int:
    """Resolve match duration, preferring parser final-whistle duration when available."""
    if not meta:
        return fallback_duration

    final_whistle_time = meta.get("final_whistle_game_time")
    if isinstance(final_whistle_time, bool):
        return fallback_duration
    if isinstance(final_whistle_time, (int, float)) and final_whistle_time > 0:
        return int(math.ceil(final_whistle_time))

    duration_seconds = meta.get("duration_seconds")
    if isinstance(duration_seconds, bool):
        return fallback_duration
    if isinstance(duration_seconds, (int, float)) and duration_seconds > 0:
        winner = meta.get("game_winner") or meta.get("winner")
        if winner in {2, 3}:
            return int(math.ceil(duration_seconds))
        return max(int(duration_seconds), fallback_duration)

    return fallback_duration


# =========== Models ===========

class MatchResponse(BaseModel):
    """Match data model."""
    match_id: int
    start_time: int
    duration: int
    winner_team: Optional[int] = None
    winner_name: Optional[str] = None
    radiant_score: int = 0
    dire_score: int = 0
    game_mode: Optional[int] = None
    patch_version: Optional[str] = None
    league_id: Optional[int] = None
    league_name: Optional[str] = None
    radiant_team: Optional[str] = None
    dire_team: Optional[str] = None
    radiant_team_name: Optional[str] = None
    dire_team_name: Optional[str] = None
    source: Optional[str] = None
    is_professional: bool = False
    radiant_win: Optional[bool] = None
    winner_display_name: Optional[str] = None
    parsed_at: Optional[str] = None
    replay_path: Optional[str] = None
    parse_status: str = "pending"
    created_at: int
    updated_at: int


class PlayerResponse(BaseModel):
    """Player match data model."""
    account_id: Optional[int] = None
    hero_id: int = 0
    hero_name: Optional[str] = None
    player_name: Optional[str] = None
    persona_name: Optional[str] = None
    pro_name: Optional[str] = None
    display_name: Optional[str] = None
    display_type: Optional[str] = None
    player_slot: Optional[int] = None
    team_id: Optional[int] = None
    team: str  # "radiant" or "dire"
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    gpm: int = 0
    xpm: int = 0
    net_worth: int = 0
    last_hits: int = 0
    denies: int = 0


class DraftResponse(BaseModel):
    """Draft (pick/ban) response."""
    match_id: int
    radiant_picks: list[int] = []
    radiant_bans: list[int] = []
    dire_picks: list[int] = []
    dire_bans: list[int] = []


class MatchListResponse(BaseModel):
    """Response for match list."""
    matches: list[MatchResponse]
    total: int
    limit: int
    offset: int


def _clean_identity_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = "".join(character for character in value if character.isprintable()).strip()
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return None
    if cleaned.count("�") >= max(1, len(cleaned) // 3):
        return None
    return cleaned


def _team_side_label(team_value: int | None) -> str | None:
    if team_value == 2:
        return "Radiant"
    if team_value == 3:
        return "Dire"
    return None


def _resolve_parsed_at(updated_at: int | None, parse_status: str | None) -> str | None:
    if updated_at is None or parse_status != "completed":
        return None
    return datetime.fromtimestamp(updated_at, tz=timezone.utc).isoformat()


def _is_professional_context(context: dict[str, Any] | None) -> bool:
    if not context:
        return False
    is_professional = context.get("is_professional")
    if isinstance(is_professional, bool):
        return is_professional
    if context.get("source") == "pro":
        return True
    return False


def _resolve_match_source(context: dict[str, Any] | None, league_id: int | None) -> str:
    if context and isinstance(context.get("source"), str) and context["source"].strip():
        return context["source"]
    if league_id is not None and league_id > 0:
        return "local"
    return "local"


def _resolve_radiant_win(
    winner_team: int | None,
    context: dict[str, Any] | None,
) -> bool | None:
    if context and isinstance(context.get("radiant_win"), bool):
        return context["radiant_win"]
    if winner_team == 2:
        return True
    if winner_team == 3:
        return False
    return None


def _resolve_match_contexts(match_ids: list[int]) -> dict[int, dict[str, Any]]:
    normalized_ids = [match_id for match_id in match_ids if match_id > 0]
    if not normalized_ids:
        return {}

    _, records = opendota_match_storage.list_recent_matches(
        limit=max(len(normalized_ids), 1),
        offset=0,
        match_ids=normalized_ids,
        include_pro=True,
        include_public=True,
    )
    return {int(record["match_id"]): record for record in records}


def _build_match_response(
    match_record: Any,
    *,
    meta: Optional[dict],
    context: dict[str, Any] | None,
) -> MatchResponse:
    duration = _resolve_duration_seconds(meta, match_record.duration)
    radiant_team_name = context.get("radiant_team_name") if context else None
    dire_team_name = context.get("dire_team_name") if context else None
    winner_team = match_record.winner_team
    radiant_win = _resolve_radiant_win(winner_team, context)
    if winner_team is None and radiant_win is not None:
        winner_team = 2 if radiant_win else 3
    winner_name = _team_side_label(winner_team)
    winner_display_name = (
        radiant_team_name if winner_team == 2 and radiant_team_name
        else dire_team_name if winner_team == 3 and dire_team_name
        else winner_name
    )

    return MatchResponse(
        match_id=match_record.match_id,
        start_time=match_record.start_time,
        duration=duration,
        winner_team=winner_team,
        winner_name=winner_name,
        radiant_score=match_record.radiant_score,
        dire_score=match_record.dire_score,
        game_mode=match_record.game_mode,
        patch_version=match_record.patch_version,
        league_id=match_record.league_id or (context.get("leagueid") if context else None),
        league_name=context.get("league_name") if context else None,
        radiant_team=radiant_team_name or "Radiant",
        dire_team=dire_team_name or "Dire",
        radiant_team_name=radiant_team_name,
        dire_team_name=dire_team_name,
        source=_resolve_match_source(context, match_record.league_id),
        is_professional=_is_professional_context(context),
        radiant_win=radiant_win,
        winner_display_name=winner_display_name,
        parsed_at=_resolve_parsed_at(match_record.updated_at, match_record.parse_status),
        replay_path=match_record.replay_path,
        parse_status=match_record.parse_status,
        created_at=match_record.created_at,
        updated_at=match_record.updated_at,
    )


async def _ensure_player_identity_rows(
    match_id: int,
    *,
    context: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    cached = opendota_match_storage.get_match_player_identities(match_id)
    if cached or not context:
        return cached

    try:
        detail = await opendota_service.fetch_match_details(match_id)
    except Exception:
        return cached

    opendota_match_storage.upsert_match_detail(detail)
    return opendota_match_storage.get_match_player_identities(match_id)


def _resolve_player_display(
    *,
    is_professional: bool,
    parser_name: object,
    persona_name: object,
    pro_name: object,
) -> tuple[str | None, str | None]:
    cleaned_parser_name = _clean_identity_text(parser_name)
    cleaned_persona_name = _clean_identity_text(persona_name)
    cleaned_pro_name = _clean_identity_text(pro_name)

    if is_professional:
        if cleaned_pro_name:
            return cleaned_pro_name, "pro_name"
        if cleaned_persona_name:
            return cleaned_persona_name, "persona_name"
        if cleaned_parser_name:
            return cleaned_parser_name, "player_name"
        return None, None

    if cleaned_persona_name:
        return cleaned_persona_name, "persona_name"
    if cleaned_pro_name:
        return cleaned_pro_name, "pro_name"
    if cleaned_parser_name:
        return cleaned_parser_name, "player_name"
    return None, None


def _normalize_team_id(team_id: object, fallback_index: int | None = None) -> int | None:
    if isinstance(team_id, int) and team_id in {2, 3}:
        return team_id
    if fallback_index is not None:
        return 2 if fallback_index < 5 else 3
    return None


def _team_bucket(team_id: int | None) -> str:
    if team_id == 2:
        return "radiant"
    if team_id == 3:
        return "dire"
    return "unknown"


def _build_player_rows(
    *,
    sqlite_players: list[Any],
    meta: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    rows_by_slot: dict[int, dict[str, Any]] = {}

    if meta and isinstance(meta.get("players"), list):
        for index, raw_player in enumerate(meta["players"]):
            if not isinstance(raw_player, dict):
                continue
            hero_name = raw_player.get("hero_name")
            rows_by_slot[index] = {
                "player_slot": index,
                "account_id": None,
                "hero_id": get_hero_id(str(hero_name or "")),
                "hero_name": hero_name if isinstance(hero_name, str) else None,
                "parser_player_name": _clean_identity_text(raw_player.get("player_name")),
                "team_id": _normalize_team_id(raw_player.get("game_team"), index),
                "kills": 0,
                "deaths": 0,
                "assists": 0,
                "gpm": 0,
                "xpm": 0,
                "net_worth": 0,
                "last_hits": 0,
                "denies": 0,
            }

    for index, sqlite_player in enumerate(sqlite_players):
        slot = sqlite_player.player_slot if isinstance(sqlite_player.player_slot, int) else index
        base_row = rows_by_slot.setdefault(
            slot,
            {
                "player_slot": slot,
                "account_id": None,
                "hero_id": 0,
                "hero_name": None,
                "parser_player_name": None,
                "team_id": _normalize_team_id(sqlite_player.team_id, slot),
                "kills": 0,
                "deaths": 0,
                "assists": 0,
                "gpm": 0,
                "xpm": 0,
                "net_worth": 0,
                "last_hits": 0,
                "denies": 0,
            },
        )
        base_row["account_id"] = sqlite_player.account_id
        base_row["hero_id"] = sqlite_player.hero_id or base_row["hero_id"]
        base_row["team_id"] = _normalize_team_id(sqlite_player.team_id, slot)
        base_row["kills"] = sqlite_player.kills
        base_row["deaths"] = sqlite_player.deaths
        base_row["assists"] = sqlite_player.assists
        base_row["gpm"] = sqlite_player.gpm
        base_row["xpm"] = sqlite_player.xpm
        base_row["net_worth"] = sqlite_player.net_worth
        base_row["last_hits"] = sqlite_player.last_hits
        base_row["denies"] = sqlite_player.denies

    return [rows_by_slot[slot] for slot in sorted(rows_by_slot)]


# =========== Endpoints ===========

@router.get("", response_model=MatchListResponse)
async def list_matches(
    status: Optional[str] = Query(None, description="Filter by parse status (pending/parsing/completed/failed)"),
    league_id: Optional[int] = Query(None, description="Filter by league ID"),
    hero_id: Optional[int] = Query(None, description="Filter matches containing this hero (via player_matches)"),
    account_id: Optional[int] = Query(None, description="Filter matches containing this player account (via player_matches)"),
    team_id: Optional[int] = Query(None, description="Filter matches containing this team (via team_matches)"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> MatchListResponse:
    """
    List matches with optional search & filter.

    Supports filtering by parse status, league, hero, player account, and team.
    Filters on hero_id / account_id use a JOIN on player_matches (indexed).
    Filter on team_id uses a JOIN on team_matches (indexed).
    """
    matches = match_storage.list_matches(
        limit=limit,
        offset=offset,
        status=status,
        league_id=league_id,
        hero_id=hero_id,
        account_id=account_id,
        team_id=team_id,
    )

    total = match_storage.count_matches(
        status=status,
        league_id=league_id,
        hero_id=hero_id,
        account_id=account_id,
        team_id=team_id,
    )

    match_contexts = _resolve_match_contexts([match.match_id for match in matches])
    response_matches: list[MatchResponse] = []
    for m in matches:
        meta = parquet_storage.get_metadata(m.match_id)
        response_matches.append(
            _build_match_response(
                m,
                meta=meta,
                context=match_contexts.get(m.match_id),
            )
        )

    return MatchListResponse(
        matches=response_matches,
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/{match_id}", response_model=MatchResponse)
async def get_match(match_id: int) -> MatchResponse:
    """Get details of a specific match."""
    match = match_storage.get_match(match_id)
    
    if not match:
        raise HTTPException(
            status_code=404, 
            detail=f"Match {match_id} not found"
        )
    
    meta = parquet_storage.get_metadata(match_id)
    match_context = _resolve_match_contexts([match_id]).get(match_id)
    return _build_match_response(match, meta=meta, context=match_context)


@router.get("/{match_id}/players")
async def get_match_players(match_id: int) -> dict:
    """
    Get all players in a match.
    
    Returns players grouped by team (radiant/dire).
    """
    # Check if match exists
    match = match_storage.get_match(match_id)
    if not match:
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found"
        )
    
    sqlite_players = match_storage.get_match_players(match_id)
    meta = parquet_storage.get_metadata(match_id)
    match_context = _resolve_match_contexts([match_id]).get(match_id)
    identity_rows = await _ensure_player_identity_rows(match_id, context=match_context)
    is_professional = _is_professional_context(match_context)
    player_rows = _build_player_rows(sqlite_players=sqlite_players, meta=meta if isinstance(meta, dict) else None)

    identity_by_slot = {
        row.get("player_slot"): row
        for row in identity_rows
        if isinstance(row.get("player_slot"), int)
    }
    identity_by_team_hero = {
        ((row.get("team") or row.get("team_id")), row.get("hero_id")): row
        for row in identity_rows
        if (row.get("team") or row.get("team_id")) in (2, 3) and row.get("hero_id")
    }

    radiant: list[dict[str, Any]] = []
    dire: list[dict[str, Any]] = []
    combined: list[dict[str, Any]] = []

    for player_row in player_rows:
        team_id = player_row.get("team_id")
        hero_id_value = player_row.get("hero_id")
        slot_value = player_row.get("player_slot")
        identity_row = identity_by_slot.get(slot_value)
        if identity_row is None:
            identity_row = identity_by_team_hero.get((team_id, hero_id_value))

        display_name, display_type = _resolve_player_display(
            is_professional=is_professional,
            parser_name=player_row.get("parser_player_name"),
            persona_name=identity_row.get("persona_name") if identity_row else None,
            pro_name=identity_row.get("pro_name") if identity_row else None,
        )
        legacy_player_name = display_name or player_row.get("parser_player_name")
        player_payload = PlayerResponse(
            account_id=(
                identity_row.get("account_id")
                if identity_row and identity_row.get("account_id") is not None
                else player_row.get("account_id")
            ),
            hero_id=int(hero_id_value) if isinstance(hero_id_value, int) else 0,
            hero_name=player_row.get("hero_name"),
            player_name=legacy_player_name,
            persona_name=_clean_identity_text(identity_row.get("persona_name")) if identity_row else None,
            pro_name=_clean_identity_text(identity_row.get("pro_name")) if identity_row else None,
            display_name=display_name,
            display_type=display_type or "unknown",
            player_slot=slot_value if isinstance(slot_value, int) else None,
            team_id=team_id if isinstance(team_id, int) else None,
            team=_team_bucket(team_id if isinstance(team_id, int) else None),
            kills=int(player_row.get("kills") or 0),
            deaths=int(player_row.get("deaths") or 0),
            assists=int(player_row.get("assists") or 0),
            gpm=int(player_row.get("gpm") or 0),
            xpm=int(player_row.get("xpm") or 0),
            net_worth=int(player_row.get("net_worth") or 0),
            last_hits=int(player_row.get("last_hits") or 0),
            denies=int(player_row.get("denies") or 0),
        ).model_dump()
        combined.append(player_payload)

        if team_id == 2:
            radiant.append(player_payload)
        elif team_id == 3:
            dire.append(player_payload)

    return {
        "match_id": match_id,
        "is_professional": is_professional,
        "players": combined,
        "radiant": radiant,
        "dire": dire,
    }


@router.get("/{match_id}/draft", response_model=DraftResponse)
async def get_match_draft(match_id: int) -> DraftResponse:
    """
    Get draft (pick/ban) data for a match.
    
    Returns hero IDs for picks and bans by team.
    """
    # Check if match exists
    match = match_storage.get_match(match_id)
    if not match:
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found"
        )
    
    # Get draft data from Parquet metadata
    meta = parquet_storage.get_metadata(match_id)
    
    radiant_picks = []
    radiant_bans = []
    dire_picks = []
    dire_bans = []
    
    if meta and "picks_bans" in meta:
        for pb in meta["picks_bans"]:
            hero_id = pb.get("hero_id", 0)
            team = pb.get("team", 0)
            is_pick = pb.get("is_pick", False)
            
            if team == 2:  # Radiant
                if is_pick:
                    radiant_picks.append(hero_id)
                else:
                    radiant_bans.append(hero_id)
            elif team == 3:  # Dire
                if is_pick:
                    dire_picks.append(hero_id)
                else:
                    dire_bans.append(hero_id)
    
    return DraftResponse(
        match_id=match_id,
        radiant_picks=radiant_picks,
        radiant_bans=radiant_bans,
        dire_picks=dire_picks,
        dire_bans=dire_bans
    )


@router.delete("/{match_id}")
async def delete_match(match_id: int) -> dict:
    """
    Delete a match and all associated data.
    
    This removes:
    - SQLite metadata
    - Parquet tick data
    """
    # Check if match exists
    match = match_storage.get_match(match_id)
    if not match:
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found"
        )
    
    # Delete from SQLite
    match_storage.delete_match(match_id)
    
    # Delete Parquet data
    parquet_storage.delete_match(match_id)
    
    return {
        "status": "deleted",
        "match_id": match_id
    }

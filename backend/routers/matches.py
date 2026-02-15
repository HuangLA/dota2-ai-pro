"""Match data endpoints."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from storage.match_storage import MatchStorage
from storage.parquet_storage import ParquetStorage
from utils.hero_mapping import get_hero_id

router = APIRouter()

# Initialize storage
match_storage = MatchStorage()
parquet_storage = ParquetStorage("data/matches")


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
    replay_path: Optional[str] = None
    parse_status: str = "pending"
    created_at: int
    updated_at: int


class PlayerResponse(BaseModel):
    """Player match data model."""
    account_id: int
    hero_id: int
    hero_name: Optional[str] = None
    player_name: Optional[str] = None
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
    
    return MatchListResponse(
        matches=[
            MatchResponse(
                match_id=m.match_id,
                start_time=m.start_time,
                duration=m.duration,
                winner_team=m.winner_team,
                winner_name="Radiant" if m.winner_team == 2 else "Dire" if m.winner_team == 3 else None,
                radiant_score=m.radiant_score,
                dire_score=m.dire_score,
                game_mode=m.game_mode,
                patch_version=m.patch_version,
                league_id=m.league_id,
                replay_path=m.replay_path,
                parse_status=m.parse_status,
                created_at=m.created_at,
                updated_at=m.updated_at
            )
            for m in matches
        ],
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
    
    duration = match.duration
    meta = parquet_storage.get_metadata(match_id)
    if meta:
        duration_seconds = meta.get("duration_seconds")
        if isinstance(duration_seconds, (int, float)) and duration_seconds > 0:
            duration = int(duration_seconds)

    return MatchResponse(
        match_id=match.match_id,
        start_time=match.start_time,
        duration=duration,
        winner_team=match.winner_team,
        winner_name="Radiant" if match.winner_team == 2 else "Dire" if match.winner_team == 3 else None,
        radiant_score=match.radiant_score,
        dire_score=match.dire_score,
        game_mode=match.game_mode,
        patch_version=match.patch_version,
        league_id=match.league_id,
        replay_path=match.replay_path,
        parse_status=match.parse_status,
        created_at=match.created_at,
        updated_at=match.updated_at
    )


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
    
    # Get players from SQLite
    players = match_storage.get_match_players(match_id)
    
    # Also try to get from Parquet metadata
    meta = parquet_storage.get_metadata(match_id)
    
    radiant = []
    dire = []
    
    if meta and "players" in meta:
        # Use Parquet metadata (has more info)
        for i, p in enumerate(meta["players"]):
            player_data = {
                "account_id": i + 1,  # Placeholder
                "hero_id": get_hero_id(p.get("hero_name", "")),
                "hero_name": p.get("hero_name", ""),
                "player_name": p.get("player_name", ""),
                "team": "radiant" if p.get("game_team") == 2 else "dire",
                "kills": 0,
                "deaths": 0,
                "assists": 0
            }
            
            if p.get("game_team") == 2:
                radiant.append(player_data)
            else:
                dire.append(player_data)
    else:
        # Use SQLite data
        for p in players:
            player_data = {
                "account_id": p.account_id,
                "hero_id": p.hero_id,
                "team": "radiant" if p.team_id == 2 else "dire",
                "kills": p.kills,
                "deaths": p.deaths,
                "assists": p.assists,
                "gpm": p.gpm,
                "xpm": p.xpm,
                "net_worth": p.net_worth
            }
            
            if p.team_id == 2:
                radiant.append(player_data)
            else:
                dire.append(player_data)
    
    return {
        "match_id": match_id,
        "radiant": radiant,
        "dire": dire
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

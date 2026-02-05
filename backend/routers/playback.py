"""Playback data endpoints for map rendering."""

from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from storage.parquet_storage import ParquetStorage
from storage.match_storage import MatchStorage

router = APIRouter()

# Initialize storage
parquet_storage = ParquetStorage("data/matches")
match_storage = MatchStorage()


# =========== Helper Functions ===========

def tick_to_seconds(tick: int, ticks_per_second: int = 30) -> float:
    """Convert tick number to game time in seconds."""
    return tick / ticks_per_second


def seconds_to_tick(seconds: float, ticks_per_second: int = 30) -> int:
    """Convert game time in seconds to tick number."""
    return int(seconds * ticks_per_second)


# =========== Endpoints ===========

@router.get("/{match_id}/ticks")
async def get_ticks(
    match_id: int,
    start_time: int = Query(0, description="Start time in seconds"),
    end_time: Optional[int] = Query(None, description="End time in seconds"),
    hero: Optional[str] = Query(None, description="Filter by hero name"),
    team: Optional[int] = Query(None, description="Filter by team (2=Radiant, 3=Dire)"),
    interval: int = Query(1, ge=1, le=30, description="Sampling interval in seconds"),
) -> dict:
    """
    Get tick data for map playback.
    
    Returns hero positions, HP, mana at sampled intervals.
    This is the primary data source for the 2D map renderer.
    
    Args:
        match_id: Match ID
        start_time: Start time in game seconds (default 0)
        end_time: End time in game seconds (default: full match)
        hero: Filter by hero name (e.g., "Invoker")
        team: Filter by team (2=Radiant, 3=Dire)
        interval: Sampling interval in seconds (1-30)
        
    Returns:
        Tick data grouped by tick number
    """
    # Check if match exists
    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed"
        )
    
    # Convert time to ticks (30 ticks per second baseline)
    # Note: Our parser samples every 30 ticks = 1 second
    start_tick = seconds_to_tick(start_time)
    end_tick = seconds_to_tick(end_time) if end_time else None
    
    # Get positions from Parquet
    df = parquet_storage.get_positions(
        match_id,
        start_tick=start_tick,
        end_tick=end_tick,
        hero=hero,
        team=team
    )
    
    if df.empty:
        return {
            "match_id": match_id,
            "start_time": start_time,
            "end_time": end_time,
            "interval": interval,
            "ticks": [],
            "total_samples": 0
        }
    
    # Apply interval sampling if needed
    if interval > 1:
        # Our data is already sampled at 1 second intervals (30 ticks)
        # So we filter based on the interval
        tick_interval = interval * 30
        df = df[df["tick"] % tick_interval < 30]  # Keep first sample in each interval
    
    # Group by tick and format response
    ticks_data = []
    for tick, group in df.groupby("tick"):
        tick_entry = {
            "tick": int(tick),
            "time": tick_to_seconds(tick),
            "heroes": []
        }
        
        for _, row in group.iterrows():
            hero_data = {
                "hero": row["hero"],
                "handle": int(row["handle"]),
                "team": int(row["team"]),
                "team_name": "Radiant" if row["team"] == 2 else "Dire",
                "x": float(row["x"]),
                "y": float(row["y"]),
            }
            
            # Add optional stats if available
            if row.get("hp") is not None:
                hero_data["hp"] = int(row["hp"])
            if row.get("max_hp") is not None:
                hero_data["max_hp"] = int(row["max_hp"])
            if row.get("mana") is not None:
                hero_data["mana"] = float(row["mana"])
            if row.get("max_mana") is not None:
                hero_data["max_mana"] = float(row["max_mana"])
            if row.get("level") is not None:
                hero_data["level"] = int(row["level"])
            
            tick_entry["heroes"].append(hero_data)
        
        ticks_data.append(tick_entry)
    
    # Sort by tick
    ticks_data.sort(key=lambda x: x["tick"])
    
    return {
        "match_id": match_id,
        "start_time": start_time,
        "end_time": end_time,
        "interval": interval,
        "ticks": ticks_data,
        "total_samples": len(ticks_data)
    }


@router.get("/{match_id}/events")
async def get_events(
    match_id: int,
    start_time: Optional[int] = Query(None, description="Start time in seconds"),
    end_time: Optional[int] = Query(None, description="End time in seconds"),
    event_type: Optional[str] = Query(None, description="Filter by event type: kill"),
) -> dict:
    """
    Get game events for timeline display.
    
    Currently supports:
    - kill: Hero kill events
    
    Args:
        match_id: Match ID
        start_time: Filter events after this time
        end_time: Filter events before this time
        event_type: Filter by type (currently only "kill")
    """
    # Check if match exists
    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed"
        )
    
    # Get kills from Parquet
    kills_df = parquet_storage.get_kills(match_id)
    
    events = []
    
    if not kills_df.empty:
        for _, row in kills_df.iterrows():
            event_time = row["time"]
            
            # Apply time filters
            if start_time is not None and event_time < start_time:
                continue
            if end_time is not None and event_time > end_time:
                continue
            
            if event_type is None or event_type == "kill":
                event = {
                    "type": "kill",
                    "time": float(event_time),
                    "killer": row["killer"],
                    "victim": row["victim"],
                }
                
                if row.get("x") is not None:
                    event["x"] = float(row["x"])
                if row.get("y") is not None:
                    event["y"] = float(row["y"])
                
                events.append(event)
    
    # Sort by time
    events.sort(key=lambda x: x["time"])
    
    return {
        "match_id": match_id,
        "start_time": start_time,
        "end_time": end_time,
        "event_type": event_type,
        "events": events,
        "total": len(events)
    }


@router.get("/{match_id}/wards")
async def get_wards(
    match_id: int,
    start_tick: Optional[int] = Query(None, description="Start tick"),
    end_tick: Optional[int] = Query(None, description="End tick"),
    team: Optional[int] = Query(None, description="Filter by team (2=Radiant, 3=Dire)"),
    ward_type: Optional[str] = Query(None, description="Filter by type: observer or sentry"),
) -> dict:
    """
    Get ward placement and destruction data.
    
    Args:
        match_id: Match ID
        start_tick: Filter events after this tick
        end_tick: Filter events before this tick
        team: Filter by team (2=Radiant, 3=Dire)
        ward_type: Filter by type (observer or sentry)
    """
    # Check if match exists
    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed"
        )
    
    # Get wards from Parquet
    wards_df = parquet_storage.get_wards(match_id, ward_type=ward_type, team=team)
    
    wards = []
    
    if not wards_df.empty:
        for _, row in wards_df.iterrows():
            ward_tick = row["tick"]
            
            # Apply tick filters
            if start_tick is not None and ward_tick < start_tick:
                continue
            if end_tick is not None and ward_tick > end_tick:
                continue
            
            ward = {
                "type": row["type"],  # "placed" or "destroyed"
                "ward_type": row["ward_type"],  # "observer" or "sentry"
                "tick": int(ward_tick),
                "time": tick_to_seconds(ward_tick),
                "handle": int(row["handle"]),
            }
            
            # Use pandas-safe access for optional columns (handle NaN)
            if "x" in row.index and pd.notna(row["x"]):
                ward["x"] = float(row["x"])
            if "y" in row.index and pd.notna(row["y"]):
                ward["y"] = float(row["y"])
            if "team" in row.index and pd.notna(row["team"]):
                ward["team"] = int(row["team"])
                ward["team_name"] = "Radiant" if row["team"] == 2 else "Dire"
            
            wards.append(ward)
    
    # Sort by tick
    wards.sort(key=lambda x: x["tick"])
    
    # Group into placed/destroyed
    placed = [w for w in wards if w["type"] == "placed"]
    destroyed = [w for w in wards if w["type"] == "destroyed"]
    
    return {
        "match_id": match_id,
        "wards": wards,
        "summary": {
            "total": len(wards),
            "placed": len(placed),
            "destroyed": len(destroyed),
            "observers_placed": len([w for w in placed if w["ward_type"] == "observer"]),
            "sentries_placed": len([w for w in placed if w["ward_type"] == "sentry"])
        }
    }


@router.get("/{match_id}/heroes")
async def get_heroes(match_id: int) -> dict:
    """
    Get unique heroes in a match.
    
    Returns list of heroes with their team affiliation.
    Useful for setting up the map renderer.
    """
    # Check if match exists
    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed"
        )
    
    # Get metadata
    meta = parquet_storage.get_metadata(match_id)
    
    # Get unique heroes from positions
    df = parquet_storage.get_positions(match_id)
    
    heroes = {}
    
    if not df.empty:
        # Get unique hero/team combinations
        unique_heroes = df.groupby(["hero", "team"]).first().reset_index()
        
        for _, row in unique_heroes.iterrows():
            hero_name = row["hero"]
            team = int(row["team"])
            
            if hero_name not in heroes:
                heroes[hero_name] = {
                    "name": hero_name,
                    "team": team,
                    "team_name": "Radiant" if team == 2 else "Dire"
                }
    
    # Separate by team
    radiant = [h for h in heroes.values() if h["team"] == 2]
    dire = [h for h in heroes.values() if h["team"] == 3]
    
    return {
        "match_id": match_id,
        "radiant": radiant,
        "dire": dire,
        "total": len(heroes)
    }


@router.get("/{match_id}/smokes")
async def get_smokes(match_id: int) -> dict:
    """
    Get smoke of deceit usage data.
    
    Note: Smoke detection is not yet implemented in the parser.
    This endpoint returns an empty list until smoke detection is added.
    """
    # Check if match exists
    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed"
        )
    
    return {
        "match_id": match_id,
        "smokes": [],
        "note": "Smoke detection not yet implemented"
    }

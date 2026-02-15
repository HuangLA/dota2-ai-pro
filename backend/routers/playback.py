"""Playback data endpoints for map rendering."""

import math
import os
from pathlib import Path
from typing import Optional, cast

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from storage.parquet_storage import ParquetStorage
from storage.match_storage import MatchStorage

router = APIRouter()

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _resolve_backend_path(env_key: str, default_relative: str) -> str:
    configured = os.getenv(env_key, default_relative)
    candidate = Path(configured)
    if not candidate.is_absolute():
        candidate = BACKEND_ROOT / candidate
    return str(candidate)

# Initialize storage
parquet_storage = ParquetStorage(_resolve_backend_path("MATCHES_DIR", "data/matches"))
match_storage = MatchStorage()


# =========== Helper Functions ===========

def tick_to_seconds(tick: int, ticks_per_second: int = 30) -> float:
    """Convert tick number to game time in seconds."""
    return tick / ticks_per_second


def seconds_to_tick(seconds: float, ticks_per_second: int = 30) -> int:
    """Convert game time in seconds to tick number."""
    return int(seconds * ticks_per_second)


def resolve_game_time(row: pd.Series, tick: int) -> float:
    """Resolve stable game_time, falling back to tick-based time for legacy data."""
    if "game_time" in row.index and pd.notna(row["game_time"]):
        return float(row["game_time"])
    return tick_to_seconds(tick)


def _coerce_float(value: object) -> Optional[float]:
    """Safely coerce values to float."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric_value = float(value)
        if math.isnan(numeric_value):
            return None
        return numeric_value
    if isinstance(value, str):
        try:
            numeric_value = float(value)
            if math.isnan(numeric_value):
                return None
            return numeric_value
        except ValueError:
            return None
    return None


def infer_offset_seconds_from_samples(df: pd.DataFrame) -> Optional[float]:
    """Infer source->game clock offset from first usable sample."""
    if df.empty or "game_time" not in df.columns:
        return None

    valid_rows = df[df["game_time"].notna()]
    if valid_rows.empty:
        return None

    if "tick" in valid_rows.columns:
        valid_rows = valid_rows.sort_values("tick")
    elif "time" in valid_rows.columns:
        valid_rows = valid_rows.sort_values("time")

    for _, row in valid_rows.iterrows():
        game_time = _coerce_float(row.get("game_time"))
        if game_time is None:
            continue

        source_time = _coerce_float(row.get("time"))
        if source_time is None:
            tick_value = _coerce_float(row.get("tick"))
            if tick_value is not None:
                source_time = tick_to_seconds(int(tick_value))
        if source_time is None:
            continue

        return source_time - game_time

    return None


def has_non_null_game_time(df: pd.DataFrame) -> bool:
    """Check whether DataFrame carries at least one non-null game_time sample."""
    return bool(not df.empty and "game_time" in df.columns and df["game_time"].notna().any())


def normalize_pause_intervals(raw_intervals: object) -> list[dict[str, float]]:
    """Normalize pause intervals from metadata into a stable list."""
    if not isinstance(raw_intervals, list):
        return []

    normalized: list[dict[str, float]] = []
    for item in raw_intervals:
        if not isinstance(item, dict):
            continue
        start = _coerce_float(item.get("replay_start_time"))
        end = _coerce_float(item.get("replay_end_time"))
        game_time = _coerce_float(item.get("game_time"))
        if start is None or end is None or game_time is None:
            continue
        if end <= start:
            continue
        duration = _coerce_float(item.get("duration_seconds"))
        if duration is None:
            duration = end - start
        normalized.append(
            {
                "replay_start_time": start,
                "replay_end_time": end,
                "game_time": game_time,
                "duration_seconds": duration,
            }
        )
    return normalized


def infer_pause_intervals_from_df(df: pd.DataFrame) -> list[dict[str, float]]:
    """Infer replay pause intervals using per-tick game_time freezes."""
    if df.empty or "tick" not in df.columns or "game_time" not in df.columns:
        return []

    valid_rows = df[df["game_time"].notna()].copy()
    if valid_rows.empty:
        return []

    tick_game_time: dict[int, float] = {}
    for _, row in valid_rows.sort_values("tick").iterrows():
        tick_value = _coerce_float(row.get("tick"))
        game_time = _coerce_float(row.get("game_time"))
        if tick_value is None or game_time is None:
            continue
        tick_game_time.setdefault(int(tick_value), game_time)

    if len(tick_game_time) < 2:
        return []

    ticks = sorted(tick_game_time)
    epsilon = 1e-4
    intervals: list[dict[str, float]] = []
    active: Optional[dict[str, float]] = None

    for idx in range(1, len(ticks)):
        prev_tick = ticks[idx - 1]
        curr_tick = ticks[idx]
        prev_replay_time = tick_to_seconds(prev_tick)
        curr_replay_time = tick_to_seconds(curr_tick)
        if curr_replay_time <= prev_replay_time:
            continue

        prev_game_time = tick_game_time[prev_tick]
        curr_game_time = tick_game_time[curr_tick]
        is_paused = abs(curr_game_time - prev_game_time) <= epsilon

        if is_paused:
            if active is None:
                active = {
                    "replay_start_time": prev_replay_time,
                    "replay_end_time": curr_replay_time,
                    "game_time": prev_game_time,
                }
            else:
                same_game_time = abs(active["game_time"] - prev_game_time) <= epsilon
                contiguous = abs(active["replay_end_time"] - prev_replay_time) <= epsilon
                if same_game_time and contiguous:
                    active["replay_end_time"] = curr_replay_time
                else:
                    active["duration_seconds"] = active["replay_end_time"] - active["replay_start_time"]
                    intervals.append(active)
                    active = {
                        "replay_start_time": prev_replay_time,
                        "replay_end_time": curr_replay_time,
                        "game_time": prev_game_time,
                    }
        elif active is not None:
            active["duration_seconds"] = active["replay_end_time"] - active["replay_start_time"]
            intervals.append(active)
            active = None

    if active is not None:
        active["duration_seconds"] = active["replay_end_time"] - active["replay_start_time"]
        intervals.append(active)

    return intervals


def resolve_pause_intervals(
    metadata: Optional[dict],
    primary_df: pd.DataFrame,
    fallback_df: Optional[pd.DataFrame] = None,
) -> list[dict[str, float]]:
    """Resolve pause intervals from metadata first, then infer from samples."""
    metadata_intervals = normalize_pause_intervals((metadata or {}).get("pause_intervals"))
    if metadata_intervals:
        return metadata_intervals

    inferred = infer_pause_intervals_from_df(primary_df)
    if inferred:
        return inferred

    if fallback_df is not None:
        return infer_pause_intervals_from_df(fallback_df)

    return []


def resolve_offset_seconds(
    metadata: Optional[dict],
    primary_df: pd.DataFrame,
    fallback_df: Optional[pd.DataFrame] = None,
) -> tuple[float, str]:
    """Resolve offset_seconds and source with unified priority rules."""
    metadata = metadata or {}

    metadata_offset = _coerce_float(metadata.get("game_start_time"))
    if metadata_offset is not None:
        metadata_source = metadata.get("clock_zero_source")
        if isinstance(metadata_source, str) and metadata_source.strip():
            return metadata_offset, metadata_source
        return metadata_offset, "metadata"

    inferred_offset = infer_offset_seconds_from_samples(primary_df)
    if inferred_offset is not None:
        return inferred_offset, "sample_inference"

    if fallback_df is not None:
        inferred_offset = infer_offset_seconds_from_samples(fallback_df)
        if inferred_offset is not None:
            return inferred_offset, "sample_inference"

    return 0.0, "fallback"


def build_time_basis(
    metadata: Optional[dict],
    has_game_time: bool,
    offset_seconds: float,
    clock_zero_source: str,
    pause_intervals: list[dict[str, float]],
) -> dict:
    """Build response-level time mapping metadata.

    Frontend should trust offset_seconds directly:
    game_time = time - offset_seconds.
    """
    metadata = metadata or {}
    ticks_per_second = metadata.get("ticks_per_second") or 30
    contract_version = metadata.get("time_contract_version")
    game_start_time = metadata.get("game_start_time")
    time_mapping = metadata.get("time_mapping")

    stable_game_start_time = _coerce_float(game_start_time)
    if stable_game_start_time is None:
        stable_game_start_time = offset_seconds

    if contract_version:
        basis = "game_time" if has_game_time else "tick_fallback"
        return {
            "basis": basis,
            "contract_version": contract_version,
            "ticks_per_second": ticks_per_second,
            "game_start_time": stable_game_start_time,
            "offset_seconds": offset_seconds,
            "clock_zero_source": clock_zero_source,
            "pause_intervals": pause_intervals,
            "mapping": time_mapping or "game_time = m_fGameTime - m_flGameStartTime",
        }

    return {
        "basis": "tick_fallback",
        "contract_version": "legacy",
        "ticks_per_second": ticks_per_second,
        "game_start_time": stable_game_start_time,
        "offset_seconds": offset_seconds,
        "clock_zero_source": clock_zero_source,
        "pause_intervals": pause_intervals,
        "mapping": "game_time unavailable; use time = tick / ticks_per_second",
    }


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
    meta = parquet_storage.get_metadata(match_id)
    df = parquet_storage.get_positions(
        match_id,
        start_tick=start_tick,
        end_tick=end_tick,
        hero=hero,
        team=team
    )

    fallback_wards_df: Optional[pd.DataFrame] = None
    has_game_time = has_non_null_game_time(df)
    if _coerce_float((meta or {}).get("game_start_time")) is None or not has_game_time:
        fallback_wards_df = parquet_storage.get_wards(match_id)
        has_game_time = has_game_time or has_non_null_game_time(fallback_wards_df)

    offset_seconds, clock_zero_source = resolve_offset_seconds(meta, df, fallback_wards_df)
    pause_intervals = resolve_pause_intervals(meta, df, fallback_wards_df)
    time_basis = build_time_basis(
        meta,
        has_game_time,
        offset_seconds,
        clock_zero_source,
        pause_intervals,
    )
    
    if df.empty:
        return {
            "match_id": match_id,
            "start_time": start_time,
            "end_time": end_time,
            "interval": interval,
            "ticks": [],
            "total_samples": 0,
            "time_basis": time_basis,
            "pause_intervals": pause_intervals,
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
        tick_int = int(cast(int, tick))
        first_row = group.iloc[0]
        tick_entry = {
            "tick": tick_int,
            "time": tick_to_seconds(tick_int),
            "game_time": resolve_game_time(first_row, tick_int),
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
        "total_samples": len(ticks_data),
        "time_basis": time_basis,
        "pause_intervals": pause_intervals,
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
    meta = parquet_storage.get_metadata(match_id)
    wards_df = parquet_storage.get_wards(match_id, ward_type=ward_type, team=team)

    fallback_positions_df: Optional[pd.DataFrame] = None
    has_game_time = has_non_null_game_time(wards_df)
    if _coerce_float((meta or {}).get("game_start_time")) is None or not has_game_time:
        fallback_positions_df = parquet_storage.get_positions(match_id)
        has_game_time = has_game_time or has_non_null_game_time(fallback_positions_df)

    offset_seconds, clock_zero_source = resolve_offset_seconds(meta, wards_df, fallback_positions_df)
    pause_intervals = resolve_pause_intervals(meta, wards_df, fallback_positions_df)
    time_basis = build_time_basis(
        meta,
        has_game_time,
        offset_seconds,
        clock_zero_source,
        pause_intervals,
    )
    
    wards = []
    
    if not wards_df.empty:
        for _, row in wards_df.iterrows():
            ward_tick = row["tick"]
            ward_tick_int = int(cast(int, ward_tick))
            
            # Apply tick filters
            if start_tick is not None and ward_tick < start_tick:
                continue
            if end_tick is not None and ward_tick > end_tick:
                continue
            
            ward = {
                "type": row["type"],  # "placed" or "destroyed"
                "ward_type": row["ward_type"],  # "observer" or "sentry"
                "tick": ward_tick_int,
                "time": tick_to_seconds(ward_tick_int),
                "game_time": resolve_game_time(row, ward_tick_int),
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
        "time_basis": time_basis,
        "pause_intervals": pause_intervals,
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

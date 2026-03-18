"""Playback data endpoints for map rendering."""

import math
import os
import re
from pathlib import Path
from typing import Optional, cast

import pandas as pd
import json
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
CURRENT_INVENTORY_SLOT_CONTRACT_VERSION = "v2_preserve_empty_slots"


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


def normalize_hero_key(hero_name: object) -> str:
    """Normalize hero identifiers across positions and kill events."""
    if not isinstance(hero_name, str):
        return ""

    normalized = hero_name.strip().lower()
    if normalized.startswith("npc_dota_hero_"):
        normalized = normalized.replace("npc_dota_hero_", "", 1)

    return re.sub(r"[^a-z0-9]", "", normalized)


def normalize_item_name(item_name: object) -> str:
    """Normalize item identifiers from parser/entity sources."""
    if not isinstance(item_name, str):
        return ""

    normalized = item_name.strip()
    if not normalized:
        return ""

    if normalized.startswith("CDOTA_Item_"):
        normalized = normalized.removeprefix("CDOTA_Item_")
        normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", normalized).lower()
    elif normalized.startswith("item_"):
        normalized = normalized.removeprefix("item_")
    else:
        normalized = normalized.lower()

    return normalized.strip("_")


def resolve_hud_snapshot_tick(
    positions_df: pd.DataFrame,
    requested_tick: Optional[int],
    requested_game_time: Optional[float],
) -> tuple[int, float]:
    """Resolve target snapshot tick/game_time for HUD queries."""
    if positions_df.empty:
        return 0, 0.0

    tick_df = positions_df[["tick", "game_time"]].dropna(subset=["tick"]).copy()
    if tick_df.empty:
        return 0, 0.0

    tick_df["tick"] = tick_df["tick"].astype(int)
    tick_df = tick_df.sort_values("tick").drop_duplicates(subset=["tick"], keep="last")

    selected_row = tick_df.iloc[-1]

    if requested_tick is not None:
        candidate_df = tick_df[tick_df["tick"] <= requested_tick]
        if candidate_df.empty:
            selected_row = tick_df.iloc[0]
        else:
            selected_row = candidate_df.iloc[-1]
    elif requested_game_time is not None:
        game_time_df = tick_df[tick_df["game_time"].notna()]
        if not game_time_df.empty:
            candidate_df = game_time_df[game_time_df["game_time"] <= requested_game_time]
            if candidate_df.empty:
                selected_row = game_time_df.iloc[0]
            else:
                selected_row = candidate_df.iloc[-1]

    selected_tick = int(selected_row["tick"])
    selected_game_time = resolve_game_time(selected_row, selected_tick)
    return selected_tick, selected_game_time


def _coerce_list_value(value: object) -> list[object]:
    """Coerce JSON/list parquet fields into a stable Python list."""
    if value is None:
        return []
    if isinstance(value, float) and math.isnan(value):
        return []
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return [stripped]
        return parsed if isinstance(parsed, list) else []
    if isinstance(value, (list, tuple)):
        return list(value)
    return []


def _coerce_int(value: object) -> Optional[int]:
    """Safely coerce values to int."""
    numeric_value = _coerce_float(value)
    if numeric_value is None:
        return None
    return int(numeric_value)


def _coerce_int_list(value: object) -> list[int]:
    """Coerce mixed parquet/list values into integer lists."""
    result: list[int] = []
    for item in _coerce_list_value(value):
        numeric_value = _coerce_int(item)
        if numeric_value is not None:
            result.append(numeric_value)
    return result


def _coerce_string_list(value: object) -> list[Optional[str]]:
    """Coerce mixed parquet/list values into slot-preserving normalized string lists."""
    result: list[Optional[str]] = []
    for item in _coerce_list_value(value):
        if item is None:
            result.append(None)
            continue

        normalized = normalize_item_name(item)
        if not normalized and isinstance(item, dict):
            normalized = normalize_item_name(item.get("name"))
        result.append(normalized or None)

    while result and result[-1] is None:
        result.pop()

    return result


def build_player_slot_lookup(metadata: Optional[dict]) -> dict[tuple[int, str], int]:
    """Build team-local slot indices for heroes from match metadata."""
    if not metadata:
        return {}

    players = metadata.get("players")
    if not isinstance(players, list):
        return {}

    counters = {2: 0, 3: 0}
    lookup: dict[tuple[int, str], int] = {}

    for index, player in enumerate(players):
        if not isinstance(player, dict):
            continue

        hero_key = normalize_hero_key(player.get("hero_name"))
        if not hero_key:
            continue

        team_value = _coerce_int(player.get("game_team"))
        if team_value not in (2, 3):
            team_value = 2 if index < 5 else 3

        slot_index = counters.get(team_value, 0)
        if slot_index >= 5:
            continue

        lookup.setdefault((team_value, hero_key), slot_index)
        counters[team_value] = slot_index + 1

    return lookup


def resolve_hud_economy_snapshot(
    economy_df: pd.DataFrame,
    target_tick: int,
    target_game_time: float,
) -> Optional[pd.Series]:
    """Resolve the closest economy snapshot at or before the target time."""
    if economy_df.empty:
        return None

    if "tick" in economy_df.columns and economy_df["tick"].notna().any():
        tick_df = economy_df[economy_df["tick"].notna()].copy()
        tick_df["tick"] = tick_df["tick"].astype(int)
        tick_df = tick_df.sort_values("tick").drop_duplicates(subset=["tick"], keep="last")
        candidate_df = tick_df[tick_df["tick"] <= target_tick]
        if candidate_df.empty:
            return tick_df.iloc[0]
        return candidate_df.iloc[-1]

    if "game_time" in economy_df.columns and economy_df["game_time"].notna().any():
        game_time_df = economy_df[economy_df["game_time"].notna()].sort_values("game_time")
        candidate_df = game_time_df[game_time_df["game_time"] <= target_game_time]
        if candidate_df.empty:
            return game_time_df.iloc[0]
        return candidate_df.iloc[-1]

    return economy_df.iloc[-1]


def build_player_metrics_lookup(
    economy_df: pd.DataFrame,
    target_tick: int,
    target_game_time: float,
    metadata: Optional[dict],
) -> tuple[dict[tuple[int, str], dict[str, int]], bool]:
    """Build per-hero HUD metrics from per-player economy snapshots."""
    snapshot_row = resolve_hud_economy_snapshot(economy_df, target_tick, target_game_time)
    if snapshot_row is None:
        return {}, False

    slot_lookup = build_player_slot_lookup(metadata)
    if not slot_lookup:
        return {}, False

    radiant_gold = _coerce_int_list(snapshot_row.get("radiant_gold_by_player"))
    dire_gold = _coerce_int_list(snapshot_row.get("dire_gold_by_player"))
    radiant_xp = _coerce_int_list(snapshot_row.get("radiant_xp_by_player"))
    dire_xp = _coerce_int_list(snapshot_row.get("dire_xp_by_player"))
    radiant_net_worth = _coerce_int_list(snapshot_row.get("radiant_net_worth"))
    dire_net_worth = _coerce_int_list(snapshot_row.get("dire_net_worth"))

    has_metrics = any(
        len(values) > 0
        for values in (
            radiant_gold,
            dire_gold,
            radiant_xp,
            dire_xp,
            radiant_net_worth,
            dire_net_worth,
        )
    )
    if not has_metrics:
        return {}, False

    minutes_elapsed = max(target_game_time, 0.0) / 60.0

    team_values = {
        2: {
            "gold": radiant_gold,
            "xp": radiant_xp,
            "net_worth": radiant_net_worth,
        },
        3: {
            "gold": dire_gold,
            "xp": dire_xp,
            "net_worth": dire_net_worth,
        },
    }

    lookup: dict[tuple[int, str], dict[str, int]] = {}
    for hero_identity, slot_index in slot_lookup.items():
        team_value = hero_identity[0]
        values = team_values.get(team_value)
        if values is None:
            continue

        gold_value = values["gold"][slot_index] if slot_index < len(values["gold"]) else 0
        xp_value = values["xp"][slot_index] if slot_index < len(values["xp"]) else 0
        net_worth_value = values["net_worth"][slot_index] if slot_index < len(values["net_worth"]) else 0

        lookup[hero_identity] = {
            "net_worth": net_worth_value,
            "gpm": int(round(gold_value / minutes_elapsed)) if minutes_elapsed > 0 else 0,
            "xpm": int(round(xp_value / minutes_elapsed)) if minutes_elapsed > 0 else 0,
        }

    return lookup, True


def build_hud_heroes(
    positions_df: pd.DataFrame,
    kills_df: pd.DataFrame,
    economy_df: pd.DataFrame,
    target_tick: int,
    target_game_time: float,
    game_start_time: float = 0.0,
    metadata: Optional[dict] = None,
) -> tuple[list[dict], bool]:
    """Build hero HUD rows for a single snapshot.

    Computes kills, deaths, and assists for each hero.
    Assists are read from the parser's assist_players data (player slot indices),
    resolved to hero names via metadata.players.
    """
    if positions_df.empty:
        return [], False

    snapshot_df = positions_df[positions_df["tick"] <= target_tick]
    if snapshot_df.empty:
        snapshot_df = positions_df

    snapshot_df = snapshot_df.sort_values("tick").drop_duplicates(subset=["hero", "team"], keep="last")
    player_metrics_lookup, has_realtime_metrics = build_player_metrics_lookup(
        economy_df,
        target_tick,
        target_game_time,
        metadata,
    )

    # Build player index -> hero_key mapping from metadata
    _player_index_to_hero_key: dict[int, str] = {}
    if metadata and "players" in metadata:
        for idx, player in enumerate(metadata["players"]):
            hero_name = player.get("hero_name", "")
            if hero_name:
                _player_index_to_hero_key[idx] = normalize_hero_key(hero_name)

    kill_counts: dict[str, int] = {}
    death_counts: dict[str, int] = {}
    assist_counts: dict[str, int] = {}

    if not kills_df.empty and "time" in kills_df.columns:
        # kills "time" is raw combat log timestamp (cle.getTimestamp()),
        # which includes pre-game warmup. Convert to game_time by subtracting
        # game_start_time so it aligns with positions-derived target_game_time.
        adjusted_time = kills_df["time"] - game_start_time
        kill_events_df = kills_df[adjusted_time <= target_game_time]

        has_assist_col = "assist_players" in kills_df.columns

        for _, event in kill_events_df.iterrows():
            killer_key = normalize_hero_key(event.get("killer"))
            victim_key = normalize_hero_key(event.get("victim"))

            if killer_key:
                kill_counts[killer_key] = kill_counts.get(killer_key, 0) + 1
            if victim_key:
                death_counts[victim_key] = death_counts.get(victim_key, 0) + 1

            # Extract assists from parser data
            if has_assist_col and pd.notna(event.get("assist_players")):
                raw_assists = event["assist_players"]
                # assist_players is stored as JSON string in parquet
                if isinstance(raw_assists, str):
                    try:
                        player_indices = json.loads(raw_assists)
                    except (json.JSONDecodeError, TypeError):
                        player_indices = []
                elif isinstance(raw_assists, list):
                    player_indices = raw_assists
                else:
                    player_indices = []

                for player_idx in player_indices:
                    hero_key = _player_index_to_hero_key.get(player_idx)
                    if hero_key:
                        assist_counts[hero_key] = assist_counts.get(hero_key, 0) + 1

    heroes: list[dict] = []
    for _, row in snapshot_df.sort_values(["team", "hero"]).iterrows():
        hero_name = str(row["hero"])
        hero_key = normalize_hero_key(hero_name)

        team_value = int(row["team"]) if pd.notna(row.get("team")) else 0
        level_value = int(row["level"]) if pd.notna(row.get("level")) else 0
        items = _coerce_string_list(row.get("items"))
        hero_metrics = player_metrics_lookup.get((team_value, hero_key), {})

        heroes.append(
            {
                "hero": hero_name,
                "team": team_value,
                "level": level_value,
                "kills": kill_counts.get(hero_key, 0),
                "deaths": death_counts.get(hero_key, 0),
                "assists": assist_counts.get(hero_key, 0),
                "net_worth": hero_metrics.get("net_worth", 0),
                "gpm": hero_metrics.get("gpm", 0),
                "xpm": hero_metrics.get("xpm", 0),
                "items": items,
            }
        )

    return heroes, has_realtime_metrics


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


def filter_positions_by_time(
    df: pd.DataFrame,
    start_time: Optional[float],
    end_time: Optional[float],
) -> pd.DataFrame:
    """Filter position samples by game_time when available, otherwise by replay tick."""
    if df.empty:
        return df

    if has_non_null_game_time(df):
        if start_time is not None:
            df = df[df["game_time"] >= start_time]
        if end_time is not None:
            df = df[df["game_time"] <= end_time]
        return df

    if start_time is not None:
        df = df[df["tick"] >= seconds_to_tick(start_time)]
    if end_time is not None:
        df = df[df["tick"] <= seconds_to_tick(end_time)]
    return df


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

    meta = parquet_storage.get_metadata(match_id)
    df = parquet_storage.get_positions(
        match_id,
        hero=hero,
        team=team
    )
    df = filter_positions_by_time(df, float(start_time), float(end_time) if end_time is not None else None)

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

    fallback_positions_df = parquet_storage.get_positions(match_id)
    has_game_time = has_non_null_game_time(wards_df) or has_non_null_game_time(fallback_positions_df)

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


@router.get("/{match_id}/hud")
async def get_hud(
    match_id: int,
    game_time: Optional[float] = Query(None, description="Target game_time (seconds)"),
    tick: Optional[int] = Query(None, ge=0, description="Target tick"),
) -> dict:
    """Get real-time HUD metrics snapshot for all heroes."""
    if game_time is not None and tick is not None:
        raise HTTPException(
            status_code=422,
            detail="Provide only one of game_time or tick.",
        )

    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed",
        )

    positions_df = parquet_storage.get_positions(match_id)
    if positions_df.empty:
        return {
            "status": "ok",
            "match_id": match_id,
            "game_time": game_time,
            "tick": tick,
            "heroes": [],
            "message": "No position samples available for HUD snapshot.",
        }

    target_tick, target_game_time = resolve_hud_snapshot_tick(positions_df, tick, game_time)
    kills_df = parquet_storage.get_kills(match_id)
    economy_df = parquet_storage.get_economy(match_id)
    metadata = parquet_storage.get_metadata(match_id)
    game_start_time = float(metadata.get("game_start_time", 0.0)) if metadata else 0.0
    heroes, has_realtime_metrics = build_hud_heroes(
        positions_df,
        kills_df,
        economy_df,
        target_tick,
        target_game_time,
        game_start_time,
        metadata,
    )

    response = {
        "status": "ok",
        "match_id": match_id,
        "game_time": target_game_time,
        "tick": target_tick,
        "heroes": heroes,
    }
    warnings: list[str] = []
    inventory_slot_contract_version = (
        str(metadata.get("inventory_slot_contract_version"))
        if metadata and metadata.get("inventory_slot_contract_version") is not None
        else None
    )
    if inventory_slot_contract_version != CURRENT_INVENTORY_SLOT_CONTRACT_VERSION:
        warnings.append(
            "当前录像仍在使用旧版物品槽契约，背包和中立物品槽位可能不准确，请重新解析该 replay。"
        )
    if not has_realtime_metrics:
        warnings.append(
            "当前录像缺少逐人经济快照，重新解析后才能显示真实的净资产、GPM 和 XPM。"
        )
    if warnings:
        response["warnings"] = warnings
        response["message"] = warnings[0]
    return response


@router.get("/{match_id}/advantage")
async def get_advantage(
    match_id: int,
    start_time: Optional[float] = Query(None, description="Start game_time in seconds"),
    end_time: Optional[float] = Query(None, description="End game_time in seconds"),
) -> dict:
    """
    Get gold and XP advantage curves over time.
    
    Returns team-level gold/xp totals and advantage (radiant - dire) at each sampled tick.
    Used for rendering the advantage chart (Recharts).
    
    Args:
        match_id: Match ID
        start_time: Filter by minimum game_time (seconds)
        end_time: Filter by maximum game_time (seconds)
    """
    # Check if match exists
    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed"
        )
    
    # Get economy data
    economy_df = parquet_storage.get_economy(match_id)
    meta = parquet_storage.get_metadata(match_id)
    
    if economy_df.empty:
        # Fallback: no economy data parsed yet
        positions_df = parquet_storage.get_positions(match_id)
        has_game_time = has_non_null_game_time(positions_df)
        offset_seconds, clock_zero_source = resolve_offset_seconds(meta, positions_df, None)
        pause_intervals = resolve_pause_intervals(meta, positions_df, None)
        time_basis = build_time_basis(
            meta, has_game_time, offset_seconds, clock_zero_source, pause_intervals,
        )
        return {
            "match_id": match_id,
            "data": [],
            "time_basis": time_basis,
            "message": "No economy data available. Re-parse replay with updated parser.",
        }
    
    # Apply time filters
    if start_time is not None:
        economy_df = economy_df[economy_df["game_time"] >= start_time]
    if end_time is not None:
        economy_df = economy_df[economy_df["game_time"] <= end_time]
    
    # Build time_basis from economy data
    has_game_time = True  # economy always has game_time
    positions_df = parquet_storage.get_positions(match_id)
    offset_seconds, clock_zero_source = resolve_offset_seconds(meta, positions_df, None)
    pause_intervals = resolve_pause_intervals(meta, positions_df, None)
    time_basis = build_time_basis(
        meta, has_game_time, offset_seconds, clock_zero_source, pause_intervals,
    )
    
    # Build response data
    data = []
    for _, row in economy_df.iterrows():
        data.append({
            "tick": int(row["tick"]),
            "game_time": float(row["game_time"]),
            "radiant_gold": int(row["radiant_gold"]),
            "dire_gold": int(row["dire_gold"]),
            "radiant_xp": int(row["radiant_xp"]),
            "dire_xp": int(row["dire_xp"]),
            "gold_advantage": int(row["gold_advantage"]),
            "xp_advantage": int(row["xp_advantage"]),
        })
    
    return {
        "match_id": match_id,
        "data": data,
        "time_basis": time_basis,
        "summary": {
            "total_samples": len(data),
            "max_gold_advantage": max((d["gold_advantage"] for d in data), default=0),
            "min_gold_advantage": min((d["gold_advantage"] for d in data), default=0),
            "max_xp_advantage": max((d["xp_advantage"] for d in data), default=0),
            "min_xp_advantage": min((d["xp_advantage"] for d in data), default=0),
        },
    }


@router.get("/{match_id}/smokes")
async def get_smokes(
    match_id: int,
    start_time: Optional[float] = Query(None, description="Start game_time in seconds"),
    end_time: Optional[float] = Query(None, description="End game_time in seconds"),
    team: Optional[int] = Query(None, description="Filter by team (2=Radiant, 3=Dire)"),
) -> dict[str, object]:
    """Get smoke events for a match (Parquet-first, metadata fallback)."""
    if not parquet_storage.match_exists(match_id):
        raise HTTPException(
            status_code=404,
            detail=f"Match {match_id} not found or not parsed",
        )

    meta = parquet_storage.get_metadata(match_id)
    smokes_path = parquet_storage.get_match_dir(match_id) / "smokes.parquet"
    if smokes_path.exists():
        smokes_df = pd.read_parquet(smokes_path)
    else:
        smokes_df = pd.DataFrame()
    source = "parquet"

    if smokes_df.empty:
        source = "metadata"
        meta_smokes = (meta or {}).get("smokes")
        if isinstance(meta_smokes, list):
            smokes_df = pd.DataFrame(meta_smokes)

    positions_df = parquet_storage.get_positions(match_id)
    has_game_time = has_non_null_game_time(smokes_df) or has_non_null_game_time(positions_df)
    offset_seconds, clock_zero_source = resolve_offset_seconds(meta, smokes_df, positions_df)
    pause_intervals = resolve_pause_intervals(meta, smokes_df, positions_df)
    time_basis = build_time_basis(
        meta,
        has_game_time,
        offset_seconds,
        clock_zero_source,
        pause_intervals,
    )

    smokes: list[dict[str, object]] = []
    if not smokes_df.empty:
        if team is not None and "team" in smokes_df.columns:
            smokes_df = smokes_df[smokes_df["team"] == team]

        for _, row in smokes_df.iterrows():
            tick_raw = row.get("tick") if "tick" in row.index else None
            tick_value = _coerce_float(tick_raw)
            tick_int = int(tick_value) if tick_value is not None else None
            game_time_value = _coerce_float(row.get("game_time"))
            if game_time_value is None and tick_int is not None:
                game_time_value = tick_to_seconds(tick_int) - offset_seconds

            if game_time_value is None:
                continue
            if start_time is not None and game_time_value < start_time:
                continue
            if end_time is not None and game_time_value > end_time:
                continue

            item: dict[str, object] = {
                "game_time": game_time_value,
                "time": game_time_value + offset_seconds,
            }
            if tick_int is not None:
                item["tick"] = tick_int
            team_value = _coerce_float(row.get("team"))
            if team_value is not None:
                team_int = int(team_value)
                item["team"] = team_int
                item["team_name"] = "Radiant" if team_int == 2 else "Dire"

            type_value = row.get("type")
            if isinstance(type_value, str) and type_value.strip():
                item["type"] = type_value

            start_tick_value = _coerce_float(row.get("start_tick"))
            if start_tick_value is not None:
                item["start_tick"] = int(start_tick_value)

            end_tick_value = _coerce_float(row.get("end_tick"))
            if end_tick_value is not None:
                item["end_tick"] = int(end_tick_value)

            duration_value = _coerce_float(row.get("duration_seconds"))
            if duration_value is not None:
                item["duration_seconds"] = duration_value

            smokes.append(item)

    smokes.sort(key=lambda x: float(cast(float, x["game_time"])))

    return {
        "match_id": match_id,
        "smokes": smokes,
        "time_basis": time_basis,
        "pause_intervals": pause_intervals,
        "summary": {
            "total": len(smokes),
            "source": source,
            "teams": {
                "radiant": len([s for s in smokes if s.get("team") == 2]),
                "dire": len([s for s in smokes if s.get("team") == 3]),
            },
        },
    }

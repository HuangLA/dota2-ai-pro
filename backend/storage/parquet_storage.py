"""
Parquet storage for replay tick data.

This module handles storing and retrieving high-frequency replay data
(positions, events) using Parquet format for efficient storage and querying.

Storage structure:
    backend/data/matches/{match_id}/
        ├── positions.parquet     # Hero position samples
        ├── kills.parquet         # Kill events
        ├── wards.parquet         # Ward placement/destruction
        ├── economy.parquet       # Team-level gold/xp snapshots
        └── meta.json             # Match metadata
"""

import json
from pathlib import Path
from typing import Optional

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from parsers.models import ParseResult, PositionSample, KillEvent, WardEvent, EconomySample


def _coerce_float(value: object) -> Optional[float]:
    """Coerce values to float, preserving None for invalid input."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        if pd.isna(numeric):
            return None
        return numeric
    return None


class ParquetStorage:
    """
    Handles Parquet file storage for replay data.
    
    Usage:
        storage = ParquetStorage("backend/data/matches")
        storage.save_parse_result(parse_result)
        
        # Query later
        positions_df = storage.get_positions(match_id)
        kills_df = storage.get_kills(match_id)
    """
    
    def __init__(self, base_path: str = "data/matches"):
        """
        Initialize Parquet storage.
        
        Args:
            base_path: Base directory for match data storage
        """
        backend_root = Path(__file__).resolve().parents[1]
        candidate = Path(base_path)
        if not candidate.is_absolute():
            normalized = Path(*candidate.parts[1:]) if candidate.parts and candidate.parts[0] == "backend" else candidate
            candidate = backend_root / normalized

        self.base_path = candidate
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def get_match_dir(self, match_id: int) -> Path:
        """Get the directory for a specific match."""
        return self.base_path / str(match_id)
    
    def match_exists(self, match_id: int) -> bool:
        """Check if match data exists."""
        match_dir = self.get_match_dir(match_id)
        return (match_dir / "positions.parquet").exists()
    
    def save_parse_result(self, result: ParseResult) -> bool:
        """
        Save a complete parse result to Parquet files.
        
        Args:
            result: ParseResult from clarity parser
            
        Returns:
            True if saved successfully
        """
        if not result.success or not result.metadata.match_id:
            return False
        
        match_id = result.metadata.match_id
        match_dir = self.get_match_dir(match_id)
        match_dir.mkdir(parents=True, exist_ok=True)
        
        # Save positions
        self._save_positions(match_dir, result.positions)
        
        # Save kills
        self._save_kills(match_dir, result.kills)
        
        # Save wards
        self._save_wards(match_dir, result.wards)
        
        # Save economy snapshots
        self._save_economy(match_dir, result.economy)
        
        # Save metadata as JSON
        self._save_metadata(match_dir, result)
        
        return True
    
    def _save_positions(self, match_dir: Path, positions: list[PositionSample]) -> None:
        """Save position samples to Parquet."""
        if not positions:
            # Create empty file with schema
            df = pd.DataFrame(columns=[
                "tick", "hero", "handle", "team", "x", "y",
                "hp", "max_hp", "mana", "max_mana", "level", "game_time"
            ])
        else:
            data = []
            for pos in positions:
                data.append({
                    "tick": pos.tick,
                    "hero": pos.hero,
                    "handle": pos.handle,
                    "team": pos.team,
                    "x": pos.x,
                    "y": pos.y,
                    "hp": pos.hp,
                    "max_hp": pos.max_hp,
                    "mana": pos.mana,
                    "max_mana": pos.max_mana,
                    "level": pos.level,
                    "game_time": getattr(pos, "game_time", None)
                })
            df = pd.DataFrame(data)
        
        # Define schema for better compression
        table = pa.Table.from_pandas(df)
        pq.write_table(
            table,
            match_dir / "positions.parquet",
            compression="snappy"
        )
    
    def _save_kills(self, match_dir: Path, kills: list[KillEvent]) -> None:
        """Save kill events to Parquet."""
        if not kills:
            df = pd.DataFrame(columns=["time", "killer", "victim", "x", "y", "assist_players"])
        else:
            data = []
            for kill in kills:
                # Store assist_players as JSON string for parquet compatibility
                ap = json.dumps(kill.assist_players) if kill.assist_players else None
                data.append({
                    "time": kill.time,
                    "killer": kill.killer,
                    "victim": kill.victim,
                    "x": kill.x,
                    "y": kill.y,
                    "assist_players": ap,
                })
            df = pd.DataFrame(data)
        
        table = pa.Table.from_pandas(df)
        pq.write_table(
            table,
            match_dir / "kills.parquet",
            compression="snappy"
        )
    
    def _save_wards(self, match_dir: Path, wards: list[WardEvent]) -> None:
        """Save ward events to Parquet."""
        if not wards:
            df = pd.DataFrame(columns=[
                "type", "ward_type", "tick", "handle", "x", "y", "team", "game_time"
            ])
        else:
            data = []
            for ward in wards:
                data.append({
                    "type": ward.type,
                    "ward_type": ward.ward_type,
                    "tick": ward.tick,
                    "handle": ward.handle,
                    "x": ward.x,
                    "y": ward.y,
                    "team": ward.team,
                    "game_time": getattr(ward, "game_time", None)
                })
            df = pd.DataFrame(data)
        
        table = pa.Table.from_pandas(df)
        pq.write_table(
            table,
            match_dir / "wards.parquet",
            compression="snappy"
        )
    
    def _save_economy(self, match_dir: Path, economy: list[EconomySample]) -> None:
        """Save economy snapshots to Parquet."""
        if not economy:
            df = pd.DataFrame(columns=[
                "tick", "game_time", "radiant_gold", "dire_gold",
                "radiant_xp", "dire_xp", "gold_advantage", "xp_advantage"
            ])
        else:
            data = []
            for e in economy:
                data.append({
                    "tick": e.tick,
                    "game_time": e.game_time,
                    "radiant_gold": e.radiant_gold,
                    "dire_gold": e.dire_gold,
                    "radiant_xp": e.radiant_xp,
                    "dire_xp": e.dire_xp,
                    "gold_advantage": e.gold_advantage,
                    "xp_advantage": e.xp_advantage,
                })
            df = pd.DataFrame(data)
        
        table = pa.Table.from_pandas(df)
        pq.write_table(
            table,
            match_dir / "economy.parquet",
            compression="snappy"
        )
    
    def _save_metadata(self, match_dir: Path, result: ParseResult) -> None:
        """Save match metadata as JSON."""
        pause_intervals = result.metadata.pause_intervals
        if not pause_intervals:
            pause_intervals = self._infer_pause_intervals(result.positions, result.wards)

        meta = {
            "match_id": result.metadata.match_id,
            "game_mode": result.metadata.game_mode,
            "game_winner": result.metadata.game_winner,
            "leagueid": result.metadata.leagueid,
            "duration_seconds": result.metadata.duration_seconds,
            "time_contract_version": result.metadata.time_contract_version,
            "game_start_time": result.metadata.game_start_time,
            "clock_zero_source": result.metadata.clock_zero_source,
            "ticks_per_second": result.metadata.ticks_per_second,
            "time_mapping": result.metadata.time_mapping,
            "pause_intervals": pause_intervals,
            "total_ticks": result.total_ticks,
            "parse_time_ms": result.parse_time_ms,
            "file_size_bytes": result.file_size_bytes,
            "replay_path": result.replay_path,
            "players": [
                {
                    "hero_name": p.hero_name,
                    "player_name": p.player_name,
                    "game_team": p.game_team
                }
                for p in result.metadata.players
            ],
            "picks_bans": [
                {
                    "hero_id": pb.hero_id,
                    "team": pb.team,
                    "is_pick": pb.is_pick
                }
                for pb in result.metadata.picks_bans
            ],
            "heroes": result.heroes
        }
        
        with open(match_dir / "meta.json", "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

    def _infer_pause_intervals(
        self,
        positions: list[PositionSample],
        wards: list[WardEvent],
    ) -> list[dict[str, float]]:
        """Infer pause intervals from replay_time/game_time deltas."""
        per_tick_game_time: dict[int, float] = {}

        for sample in positions:
            game_time = _coerce_float(getattr(sample, "game_time", None))
            if game_time is None:
                continue
            per_tick_game_time.setdefault(sample.tick, game_time)

        if not per_tick_game_time:
            for event in wards:
                game_time = _coerce_float(getattr(event, "game_time", None))
                if game_time is None:
                    continue
                per_tick_game_time.setdefault(event.tick, game_time)

        if len(per_tick_game_time) < 2:
            return []

        ticks = sorted(per_tick_game_time)
        intervals: list[dict[str, float]] = []
        active: Optional[dict[str, float]] = None
        epsilon = 1e-4

        for idx in range(1, len(ticks)):
            prev_tick = ticks[idx - 1]
            curr_tick = ticks[idx]
            prev_replay_time = prev_tick / 30.0
            curr_replay_time = curr_tick / 30.0
            if curr_replay_time <= prev_replay_time:
                continue

            prev_game_time = per_tick_game_time[prev_tick]
            curr_game_time = per_tick_game_time[curr_tick]
            game_delta = curr_game_time - prev_game_time
            is_paused = abs(game_delta) <= epsilon

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
                        active["duration_seconds"] = (
                            active["replay_end_time"] - active["replay_start_time"]
                        )
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
    
    # =========== Query Methods ===========
    
    def get_positions(
        self, 
        match_id: int,
        start_tick: Optional[int] = None,
        end_tick: Optional[int] = None,
        hero: Optional[str] = None,
        team: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Get position samples for a match.
        
        Args:
            match_id: Match ID
            start_tick: Filter by minimum tick
            end_tick: Filter by maximum tick
            hero: Filter by hero name
            team: Filter by team (2=Radiant, 3=Dire)
            
        Returns:
            DataFrame with position data
        """
        parquet_path = self.get_match_dir(match_id) / "positions.parquet"
        
        if not parquet_path.exists():
            return pd.DataFrame()
        
        # Build filters
        filters = []
        if start_tick is not None:
            filters.append(("tick", ">=", start_tick))
        if end_tick is not None:
            filters.append(("tick", "<=", end_tick))
        if team is not None:
            filters.append(("team", "==", team))
        
        # Read with filters
        if filters:
            df = pq.read_table(parquet_path, filters=filters).to_pandas()
        else:
            df = pq.read_table(parquet_path).to_pandas()
        
        # Filter by hero (string filter not supported in Parquet)
        if hero and not df.empty:
            df = df[df["hero"] == hero]

        if "game_time" not in df.columns:
            df["game_time"] = pd.NA
        
        return df
    
    def get_kills(self, match_id: int) -> pd.DataFrame:
        """Get kill events for a match."""
        parquet_path = self.get_match_dir(match_id) / "kills.parquet"
        
        if not parquet_path.exists():
            return pd.DataFrame()
        
        return pq.read_table(parquet_path).to_pandas()
    
    def get_wards(
        self, 
        match_id: int,
        ward_type: Optional[str] = None,
        team: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Get ward events for a match.
        
        Args:
            match_id: Match ID
            ward_type: "observer" or "sentry"
            team: Filter by team (2=Radiant, 3=Dire)
        """
        parquet_path = self.get_match_dir(match_id) / "wards.parquet"
        
        if not parquet_path.exists():
            return pd.DataFrame()
        
        df = pq.read_table(parquet_path).to_pandas()
        
        if ward_type and not df.empty:
            df = df[df["ward_type"] == ward_type]
        if team is not None and not df.empty:
            df = df[df["team"] == team]

        if "game_time" not in df.columns:
            df["game_time"] = pd.NA
        
        return df
    
    def get_economy(self, match_id: int) -> pd.DataFrame:
        """
        Get economy snapshots for a match.
        
        Returns:
            DataFrame with columns: tick, game_time, radiant_gold, dire_gold,
            radiant_xp, dire_xp, gold_advantage, xp_advantage
        """
        parquet_path = self.get_match_dir(match_id) / "economy.parquet"
        
        if not parquet_path.exists():
            return pd.DataFrame()
        
        return pq.read_table(parquet_path).to_pandas()
    
    def get_metadata(self, match_id: int) -> Optional[dict]:
        """Get match metadata."""
        meta_path = self.get_match_dir(match_id) / "meta.json"
        
        if not meta_path.exists():
            return None
        
        with open(meta_path, "r", encoding="utf-8") as f:
            return json.load(f)
    
    def list_matches(self) -> list[int]:
        """List all stored match IDs."""
        matches = []
        for item in self.base_path.iterdir():
            if item.is_dir() and item.name.isdigit():
                if (item / "positions.parquet").exists():
                    matches.append(int(item.name))
        return sorted(matches, reverse=True)
    
    def delete_match(self, match_id: int) -> bool:
        """Delete all data for a match."""
        import shutil
        match_dir = self.get_match_dir(match_id)
        
        if match_dir.exists():
            shutil.rmtree(match_dir)
            return True
        return False
    
    def get_storage_stats(self, match_id: int) -> dict:
        """Get storage statistics for a match."""
        match_dir = self.get_match_dir(match_id)
        
        if not match_dir.exists():
            return {"exists": False}
        
        stats = {"exists": True, "files": {}}
        
        for file in match_dir.iterdir():
            stats["files"][file.name] = {
                "size_bytes": file.stat().st_size,
                "size_kb": file.stat().st_size / 1024
            }
        
        stats["total_size_kb"] = sum(
            f["size_kb"] for f in stats["files"].values()
        )
        
        return stats

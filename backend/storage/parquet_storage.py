"""
Parquet storage for replay tick data.

This module handles storing and retrieving high-frequency replay data
(positions, events) using Parquet format for efficient storage and querying.

Storage structure:
    backend/data/matches/{match_id}/
        ├── positions.parquet     # Hero position samples
        ├── kills.parquet         # Kill events
        ├── wards.parquet         # Ward placement/destruction
        └── meta.json             # Match metadata
"""

import json
from pathlib import Path
from typing import Optional

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from parsers.models import ParseResult, PositionSample, KillEvent, WardEvent


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
    
    def __init__(self, base_path: str = "backend/data/matches"):
        """
        Initialize Parquet storage.
        
        Args:
            base_path: Base directory for match data storage
        """
        self.base_path = Path(base_path)
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
            df = pd.DataFrame(columns=["time", "killer", "victim", "x", "y"])
        else:
            data = []
            for kill in kills:
                data.append({
                    "time": kill.time,
                    "killer": kill.killer,
                    "victim": kill.victim,
                    "x": kill.x,
                    "y": kill.y
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
    
    def _save_metadata(self, match_dir: Path, result: ParseResult) -> None:
        """Save match metadata as JSON."""
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

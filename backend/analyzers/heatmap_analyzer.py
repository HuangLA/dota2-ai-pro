"""
Heatmap Analyzer - Generate movement/position heatmaps from replay data.

Uses DuckDB for efficient aggregation of position data into grid cells.
"""

import time
from dataclasses import dataclass
from typing import Optional

import duckdb
import pandas as pd

from storage.parquet_storage import ParquetStorage


@dataclass
class HeatmapCell:
    """Single cell in a heatmap grid."""
    grid_x: int       # Grid cell X index
    grid_y: int       # Grid cell Y index
    x: float          # World coordinate X (center of cell)
    y: float          # World coordinate Y (center of cell)
    density: int      # Number of position samples in this cell


@dataclass
class HeatmapResult:
    """Result of heatmap generation."""
    match_id: int
    heatmap_type: str
    hero: Optional[str]
    team: Optional[int]
    time_range: tuple[int, int]
    grid_size: int
    map_bounds: dict
    cells: list[HeatmapCell]
    max_density: int
    total_samples: int
    generation_time_ms: float


class HeatmapAnalyzer:
    """
    Analyzer for generating heatmaps from position data.
    
    Uses DuckDB for efficient aggregation of large position datasets
    into configurable grid cells.
    
    Usage:
        analyzer = HeatmapAnalyzer(storage)
        result = analyzer.generate_movement_heatmap(
            match_id=84782020,
            grid_size=64,
            hero="npc_dota_hero_spectre"
        )
    """
    
    # Dota 2 map bounds (based on actual data from parsed replays)
    # Actual range: X: 7974~24992, Y: 7844~24852
    # Using slightly expanded bounds for safety
    DEFAULT_MAP_BOUNDS = {
        "min_x": 7500,
        "max_x": 25500,
        "min_y": 7500,
        "max_y": 25500
    }
    
    def __init__(self, storage: ParquetStorage):
        """
        Initialize the heatmap analyzer.
        
        Args:
            storage: ParquetStorage instance for reading position data
        """
        self.storage = storage
    
    def generate_movement_heatmap(
        self,
        match_id: int,
        grid_size: int = 64,
        hero: Optional[str] = None,
        team: Optional[int] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        map_bounds: Optional[dict] = None
    ) -> HeatmapResult:
        """
        Generate a movement heatmap for a match.
        
        Args:
            match_id: Match ID to analyze
            grid_size: Number of grid cells per axis (default 64 = 64x64 grid)
            hero: Filter by hero name (optional)
            team: Filter by team (2=Radiant, 3=Dire) (optional)
            start_time: Filter by minimum game time in seconds (optional)
            end_time: Filter by maximum game time in seconds (optional)
            map_bounds: Custom map bounds (optional, uses DEFAULT_MAP_BOUNDS if not specified)
            
        Returns:
            HeatmapResult with grid cells and metadata
        """
        start_gen = time.perf_counter()
        
        # Get map bounds
        bounds = map_bounds or self.DEFAULT_MAP_BOUNDS
        
        # Get positions parquet file path
        parquet_path = self.storage.get_match_dir(match_id) / "positions.parquet"
        
        if not parquet_path.exists():
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="movement",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=0
            )
        
        # Calculate cell size
        map_width = bounds["max_x"] - bounds["min_x"]
        map_height = bounds["max_y"] - bounds["min_y"]
        cell_width = map_width / grid_size
        cell_height = map_height / grid_size
        
        # Convert time to ticks (30 ticks per second)
        start_tick = int(start_time * 30) if start_time else None
        end_tick = int(end_time * 30) if end_time else None
        
        # Build DuckDB query for aggregation
        # This is much faster than pandas groupby for large datasets
        query = self._build_aggregation_query(
            parquet_path=str(parquet_path),
            grid_size=grid_size,
            bounds=bounds,
            hero=hero,
            team=team,
            start_tick=start_tick,
            end_tick=end_tick
        )
        
        # Execute query with DuckDB
        con = duckdb.connect(":memory:")
        result_df = con.execute(query).fetchdf()
        con.close()
        
        # Convert to HeatmapCell objects
        cells = []
        max_density = 0
        total_samples = 0
        
        for _, row in result_df.iterrows():
            grid_x = int(row["grid_x"])
            grid_y = int(row["grid_y"])
            density = int(row["density"])
            
            # Calculate world coordinates (center of cell)
            world_x = bounds["min_x"] + (grid_x + 0.5) * cell_width
            world_y = bounds["min_y"] + (grid_y + 0.5) * cell_height
            
            cells.append(HeatmapCell(
                grid_x=grid_x,
                grid_y=grid_y,
                x=world_x,
                y=world_y,
                density=density
            ))
            
            max_density = max(max_density, density)
            total_samples += density
        
        generation_time_ms = (time.perf_counter() - start_gen) * 1000
        
        return HeatmapResult(
            match_id=match_id,
            heatmap_type="movement",
            hero=hero,
            team=team,
            time_range=(start_time or 0, end_time or 0),
            grid_size=grid_size,
            map_bounds=bounds,
            cells=cells,
            max_density=max_density,
            total_samples=total_samples,
            generation_time_ms=generation_time_ms
        )
    
    def _build_aggregation_query(
        self,
        parquet_path: str,
        grid_size: int,
        bounds: dict,
        hero: Optional[str] = None,
        team: Optional[int] = None,
        start_tick: Optional[int] = None,
        end_tick: Optional[int] = None
    ) -> str:
        """
        Build DuckDB SQL query for grid aggregation.
        
        Uses floor division to map coordinates to grid cells,
        then counts samples per cell.
        """
        map_width = bounds["max_x"] - bounds["min_x"]
        map_height = bounds["max_y"] - bounds["min_y"]
        cell_width = map_width / grid_size
        cell_height = map_height / grid_size
        
        # Build WHERE clause
        conditions = []
        
        # Filter out positions outside map bounds
        conditions.append(f"x >= {bounds['min_x']} AND x <= {bounds['max_x']}")
        conditions.append(f"y >= {bounds['min_y']} AND y <= {bounds['max_y']}")
        
        # Filter out dead heroes (hp = 0)
        conditions.append("hp > 0")
        
        if hero:
            conditions.append(f"hero = '{hero}'")
        if team:
            conditions.append(f"team = {team}")
        if start_tick:
            conditions.append(f"tick >= {start_tick}")
        if end_tick:
            conditions.append(f"tick <= {end_tick}")
        
        where_clause = " AND ".join(conditions)
        
        # Grid cell calculation using floor division
        # grid_x = floor((x - min_x) / cell_width)
        # grid_y = floor((y - min_y) / cell_height)
        query = f"""
        SELECT 
            CAST(FLOOR((x - {bounds['min_x']}) / {cell_width}) AS INTEGER) AS grid_x,
            CAST(FLOOR((y - {bounds['min_y']}) / {cell_height}) AS INTEGER) AS grid_y,
            COUNT(*) AS density
        FROM read_parquet('{parquet_path}')
        WHERE {where_clause}
        GROUP BY grid_x, grid_y
        HAVING density > 0
        ORDER BY density DESC
        """
        
        return query
    
    def generate_kill_heatmap(
        self,
        match_id: int,
        grid_size: int = 64,
        hero: Optional[str] = None,
        team: Optional[int] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        map_bounds: Optional[dict] = None
    ) -> HeatmapResult:
        """
        Generate a heatmap of kill locations.
        
        Args:
            match_id: Match ID to analyze
            grid_size: Number of grid cells per axis
            hero: Filter by killer hero (optional)
            team: Filter by killer team (2=Radiant, 3=Dire)
            start_time: Filter by minimum event time in seconds (optional)
            end_time: Filter by maximum event time in seconds (optional)
            map_bounds: Custom map bounds
            
        Returns:
            HeatmapResult with kill density per cell
        """
        start_gen = time.perf_counter()
        
        bounds = map_bounds or self.DEFAULT_MAP_BOUNDS
        parquet_path = self.storage.get_match_dir(match_id) / "kills.parquet"
        
        if not parquet_path.exists():
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="kill",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=0
            )
        
        # Read kills data
        kills_df = pd.read_parquet(parquet_path)
        
        if kills_df.empty:
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="kill",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=(time.perf_counter() - start_gen) * 1000
            )
        
        # Filter out rows with NaN coordinates
        kills_df = kills_df.dropna(subset=["x", "y"])
        
        if kills_df.empty:
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="kill",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=(time.perf_counter() - start_gen) * 1000
            )
        
        kills_df = self._filter_kill_events(
            kills_df,
            match_id=match_id,
            perspective="kill",
            hero=hero,
            team=team,
            start_time=start_time,
            end_time=end_time,
        )

        if kills_df.empty:
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="kill",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=(time.perf_counter() - start_gen) * 1000
            )

        # Filter and aggregate
        map_width = bounds["max_x"] - bounds["min_x"]
        map_height = bounds["max_y"] - bounds["min_y"]
        cell_width = map_width / grid_size
        cell_height = map_height / grid_size
        
        # Calculate grid positions
        kills_df["grid_x"] = ((kills_df["x"] - bounds["min_x"]) / cell_width).astype(int)
        kills_df["grid_y"] = ((kills_df["y"] - bounds["min_y"]) / cell_height).astype(int)
        
        # Filter valid grid cells
        kills_df = kills_df[
            (kills_df["grid_x"] >= 0) & (kills_df["grid_x"] < grid_size) &
            (kills_df["grid_y"] >= 0) & (kills_df["grid_y"] < grid_size)
        ]
        
        # Aggregate
        grouped = kills_df.groupby(["grid_x", "grid_y"]).size().reset_index(name="density")
        
        cells = []
        max_density = 0
        total_samples = 0
        
        for _, row in grouped.iterrows():
            grid_x = int(row["grid_x"])
            grid_y = int(row["grid_y"])
            density = int(row["density"])
            
            world_x = bounds["min_x"] + (grid_x + 0.5) * cell_width
            world_y = bounds["min_y"] + (grid_y + 0.5) * cell_height
            
            cells.append(HeatmapCell(
                grid_x=grid_x,
                grid_y=grid_y,
                x=world_x,
                y=world_y,
                density=density
            ))
            
            max_density = max(max_density, density)
            total_samples += density
        
        generation_time_ms = (time.perf_counter() - start_gen) * 1000
        
        return HeatmapResult(
            match_id=match_id,
            heatmap_type="kill",
            hero=hero,
            team=team,
            time_range=(start_time or 0, end_time or 0),
            grid_size=grid_size,
            map_bounds=bounds,
            cells=cells,
            max_density=max_density,
            total_samples=total_samples,
            generation_time_ms=generation_time_ms
        )
    
    def generate_death_heatmap(
        self,
        match_id: int,
        grid_size: int = 64,
        hero: Optional[str] = None,
        team: Optional[int] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        map_bounds: Optional[dict] = None
    ) -> HeatmapResult:
        """
        Generate a heatmap of death locations.
        
        Similar to kill heatmap but tracks where heroes died.
        """
        start_gen = time.perf_counter()

        bounds = map_bounds or self.DEFAULT_MAP_BOUNDS
        parquet_path = self.storage.get_match_dir(match_id) / "kills.parquet"

        if not parquet_path.exists():
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="death",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=0
            )

        kills_df = pd.read_parquet(parquet_path)
        if kills_df.empty:
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="death",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=(time.perf_counter() - start_gen) * 1000
            )

        kills_df = kills_df.dropna(subset=["x", "y"])
        if kills_df.empty:
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="death",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=(time.perf_counter() - start_gen) * 1000
            )

        kills_df = self._filter_kill_events(
            kills_df,
            match_id=match_id,
            perspective="death",
            hero=hero,
            team=team,
            start_time=start_time,
            end_time=end_time,
        )

        if kills_df.empty:
            return HeatmapResult(
                match_id=match_id,
                heatmap_type="death",
                hero=hero,
                team=team,
                time_range=(start_time or 0, end_time or 0),
                grid_size=grid_size,
                map_bounds=bounds,
                cells=[],
                max_density=0,
                total_samples=0,
                generation_time_ms=(time.perf_counter() - start_gen) * 1000
            )

        map_width = bounds["max_x"] - bounds["min_x"]
        map_height = bounds["max_y"] - bounds["min_y"]
        cell_width = map_width / grid_size
        cell_height = map_height / grid_size

        kills_df["grid_x"] = ((kills_df["x"] - bounds["min_x"]) / cell_width).astype(int)
        kills_df["grid_y"] = ((kills_df["y"] - bounds["min_y"]) / cell_height).astype(int)
        kills_df = kills_df[
            (kills_df["grid_x"] >= 0) & (kills_df["grid_x"] < grid_size) &
            (kills_df["grid_y"] >= 0) & (kills_df["grid_y"] < grid_size)
        ]

        grouped = kills_df.groupby(["grid_x", "grid_y"]).size().reset_index(name="density")

        cells = []
        max_density = 0
        total_samples = 0

        for _, row in grouped.iterrows():
            grid_x = int(row["grid_x"])
            grid_y = int(row["grid_y"])
            density = int(row["density"])

            world_x = bounds["min_x"] + (grid_x + 0.5) * cell_width
            world_y = bounds["min_y"] + (grid_y + 0.5) * cell_height

            cells.append(HeatmapCell(
                grid_x=grid_x,
                grid_y=grid_y,
                x=world_x,
                y=world_y,
                density=density
            ))

            max_density = max(max_density, density)
            total_samples += density

        generation_time_ms = (time.perf_counter() - start_gen) * 1000

        return HeatmapResult(
            match_id=match_id,
            heatmap_type="death",
            hero=hero,
            team=team,
            time_range=(start_time or 0, end_time or 0),
            grid_size=grid_size,
            map_bounds=bounds,
            cells=cells,
            max_density=max_density,
            total_samples=total_samples,
            generation_time_ms=generation_time_ms
        )

    def _build_hero_team_lookup(self, match_id: int) -> dict[str, int]:
        metadata = self.storage.get_metadata(match_id) or {}
        players = metadata.get("players") if isinstance(metadata, dict) else None
        if not isinstance(players, list):
            return {}

        lookup: dict[str, int] = {}
        for player in players:
            if not isinstance(player, dict):
                continue
            hero_name = player.get("hero_name")
            game_team = player.get("game_team")
            if isinstance(hero_name, str) and isinstance(game_team, int):
                lookup[hero_name] = game_team
        return lookup

    def _filter_kill_events(
        self,
        kills_df: pd.DataFrame,
        *,
        match_id: int,
        perspective: str,
        hero: Optional[str] = None,
        team: Optional[int] = None,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
    ) -> pd.DataFrame:
        filtered = kills_df

        if start_time is not None:
            filtered = filtered[filtered["time"] >= start_time]
        if end_time is not None:
            filtered = filtered[filtered["time"] <= end_time]

        actor_column = "killer" if perspective == "kill" else "victim"
        if hero:
            filtered = filtered[filtered[actor_column] == hero]

        if team is not None:
            team_lookup = self._build_hero_team_lookup(match_id)
            if team_lookup:
                actor_teams = filtered[actor_column].map(team_lookup)
                filtered = filtered[actor_teams == team]
            else:
                filtered = filtered.iloc[0:0]

        return filtered

"""
Path Analyzer - Extract and simplify hero movement paths from replay data.

Features:
- Extract movement paths for individual heroes or all heroes
- Douglas-Peucker algorithm for path simplification
- Calculate path statistics (distance, speed, stops)
"""

import math
import time
from dataclasses import dataclass, field
from typing import Optional

import pandas as pd

from storage.parquet_storage import ParquetStorage


@dataclass
class PathPoint:
    """Single point in a movement path."""
    time: float       # Game time in seconds
    x: float          # World coordinate X
    y: float          # World coordinate Y
    hp: int = 0       # HP at this point (0 = dead)
    level: int = 1    # Level at this point


@dataclass
class HeroPath:
    """Complete movement path for a hero."""
    hero: str                           # Hero name
    team: int                           # Team (2=Radiant, 3=Dire)
    points: list[PathPoint]             # Path points
    total_distance: float = 0.0         # Total distance traveled
    avg_speed: float = 0.0              # Average movement speed
    time_alive: float = 0.0             # Total time alive
    time_dead: float = 0.0              # Total time dead
    death_count: int = 0                # Number of deaths


@dataclass
class PathResult:
    """Result of path extraction."""
    match_id: int
    time_range: tuple[float, float]
    paths: list[HeroPath]
    simplified: bool
    epsilon: float                      # Simplification tolerance
    original_points: int                # Points before simplification
    simplified_points: int              # Points after simplification
    generation_time_ms: float


class PathAnalyzer:
    """
    Analyzer for extracting and simplifying hero movement paths.
    
    Uses Douglas-Peucker algorithm to reduce path complexity while
    preserving important shape features.
    
    Usage:
        analyzer = PathAnalyzer(storage)
        result = analyzer.extract_paths(
            match_id=84782020,
            hero="npc_dota_hero_spectre",
            simplify=True,
            epsilon=50.0
        )
    """
    
    # Dota 2 map bounds
    DEFAULT_MAP_BOUNDS = {
        "min_x": 7500,
        "max_x": 25500,
        "min_y": 7500,
        "max_y": 25500
    }
    
    # Default simplification tolerance (in game units)
    # Higher = more simplification, lower = more detail
    DEFAULT_EPSILON = 100.0
    
    def __init__(self, storage: ParquetStorage):
        """
        Initialize the path analyzer.
        
        Args:
            storage: ParquetStorage instance for reading position data
        """
        self.storage = storage
    
    def extract_paths(
        self,
        match_id: int,
        hero: Optional[str] = None,
        team: Optional[int] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        simplify: bool = True,
        epsilon: Optional[float] = None
    ) -> PathResult:
        """
        Extract movement paths from position data.
        
        Args:
            match_id: Match ID to analyze
            hero: Filter by hero name (optional, extracts all heroes if not specified)
            team: Filter by team (2=Radiant, 3=Dire) (optional)
            start_time: Start time in seconds (optional)
            end_time: End time in seconds (optional)
            simplify: Whether to apply Douglas-Peucker simplification
            epsilon: Simplification tolerance in game units (default 100)
            
        Returns:
            PathResult with hero paths and metadata
        """
        start_gen = time.perf_counter()
        
        epsilon = epsilon or self.DEFAULT_EPSILON
        
        # Convert time to ticks
        start_tick = int(start_time * 30) if start_time else None
        end_tick = int(end_time * 30) if end_time else None
        
        # Get position data using optimized query
        positions_df = self._get_positions_optimized(
            match_id=match_id,
            start_tick=start_tick,
            end_tick=end_tick,
            hero=hero,
            team=team
        )
        
        if positions_df.empty:
            return PathResult(
                match_id=match_id,
                time_range=(start_time or 0, end_time or 0),
                paths=[],
                simplified=simplify,
                epsilon=epsilon,
                original_points=0,
                simplified_points=0,
                generation_time_ms=0
            )
        
        # Group by hero and extract paths
        paths = []
        original_points = 0
        simplified_points = 0
        
        # Get unique heroes
        heroes = positions_df["hero"].unique()
        
        for hero_name in heroes:
            hero_df = positions_df[positions_df["hero"] == hero_name].copy()
            hero_df = hero_df.sort_values("tick")
            
            # Get team (should be same for all rows of this hero)
            hero_team = int(hero_df["team"].iloc[0])
            
            # Convert to path points
            points = []
            for _, row in hero_df.iterrows():
                tick = int(row["tick"])
                game_time = tick / 30.0  # Convert tick to seconds
                
                points.append(PathPoint(
                    time=game_time,
                    x=float(row["x"]),
                    y=float(row["y"]),
                    hp=int(row["hp"]) if pd.notna(row["hp"]) else 0,
                    level=int(row["level"]) if pd.notna(row["level"]) else 1
                ))
            
            original_points += len(points)
            
            # Apply simplification if requested
            if simplify and len(points) > 2:
                points = self._douglas_peucker(points, epsilon)
            
            simplified_points += len(points)
            
            # Calculate statistics
            total_distance = self._calculate_distance(points)
            time_alive, time_dead, death_count = self._calculate_alive_stats(hero_df)
            avg_speed = total_distance / time_alive if time_alive > 0 else 0
            
            paths.append(HeroPath(
                hero=hero_name,
                team=hero_team,
                points=points,
                total_distance=total_distance,
                avg_speed=avg_speed,
                time_alive=time_alive,
                time_dead=time_dead,
                death_count=death_count
            ))
        
        generation_time_ms = (time.perf_counter() - start_gen) * 1000
        
        # Determine actual time range
        if not positions_df.empty:
            min_tick = positions_df["tick"].min()
            max_tick = positions_df["tick"].max()
            actual_start = min_tick / 30.0
            actual_end = max_tick / 30.0
        else:
            actual_start = start_time or 0
            actual_end = end_time or 0
        
        return PathResult(
            match_id=match_id,
            time_range=(actual_start, actual_end),
            paths=paths,
            simplified=simplify,
            epsilon=epsilon,
            original_points=original_points,
            simplified_points=simplified_points,
            generation_time_ms=generation_time_ms
        )
    
    def _get_positions_optimized(
        self,
        match_id: int,
        start_tick: Optional[int] = None,
        end_tick: Optional[int] = None,
        hero: Optional[str] = None,
        team: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Get position data with optimized column selection.
        
        Only reads necessary columns to reduce memory and improve performance.
        """
        import duckdb
        
        parquet_path = self.storage.get_match_dir(match_id) / "positions.parquet"
        
        if not parquet_path.exists():
            return pd.DataFrame()
        
        # Build query with only needed columns
        columns = "tick, hero, team, x, y, hp, level"
        conditions = []
        
        if start_tick is not None:
            conditions.append(f"tick >= {start_tick}")
        if end_tick is not None:
            conditions.append(f"tick <= {end_tick}")
        if hero:
            conditions.append(f"hero = '{hero}'")
        if team:
            conditions.append(f"team = {team}")
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        query = f"""
        SELECT {columns}
        FROM read_parquet('{parquet_path}')
        {where_clause}
        ORDER BY hero, tick
        """
        
        con = duckdb.connect(":memory:")
        result_df = con.execute(query).fetchdf()
        con.close()
        
        return result_df

    def _douglas_peucker(
        self, 
        points: list[PathPoint], 
        epsilon: float
    ) -> list[PathPoint]:
        """
        Apply Douglas-Peucker algorithm to simplify a path.
        
        The algorithm recursively finds the point with maximum distance
        from the line segment connecting start and end points. If this
        distance exceeds epsilon, the point is kept and the algorithm
        recurses on both halves. Otherwise, all intermediate points
        are discarded.
        
        Args:
            points: List of path points
            epsilon: Maximum allowed perpendicular distance
            
        Returns:
            Simplified list of path points
        """
        if len(points) <= 2:
            return points
        
        # Find point with maximum distance from line
        max_dist = 0
        max_idx = 0
        
        start = points[0]
        end = points[-1]
        
        for i in range(1, len(points) - 1):
            dist = self._perpendicular_distance(points[i], start, end)
            if dist > max_dist:
                max_dist = dist
                max_idx = i
        
        # If max distance exceeds epsilon, recursively simplify
        if max_dist > epsilon:
            # Recursively simplify both halves
            left = self._douglas_peucker(points[:max_idx + 1], epsilon)
            right = self._douglas_peucker(points[max_idx:], epsilon)
            
            # Combine results (remove duplicate point at junction)
            return left[:-1] + right
        else:
            # All intermediate points can be discarded
            return [start, end]
    
    def _perpendicular_distance(
        self, 
        point: PathPoint, 
        line_start: PathPoint, 
        line_end: PathPoint
    ) -> float:
        """
        Calculate perpendicular distance from point to line segment.
        
        Uses the formula:
        d = |((y2-y1)*x0 - (x2-x1)*y0 + x2*y1 - y2*x1)| / sqrt((y2-y1)^2 + (x2-x1)^2)
        """
        x0, y0 = point.x, point.y
        x1, y1 = line_start.x, line_start.y
        x2, y2 = line_end.x, line_end.y
        
        # Handle case where start and end are the same point
        dx = x2 - x1
        dy = y2 - y1
        
        if dx == 0 and dy == 0:
            # Line is a point, return distance to that point
            return math.sqrt((x0 - x1) ** 2 + (y0 - y1) ** 2)
        
        # Calculate perpendicular distance
        numerator = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1)
        denominator = math.sqrt(dy ** 2 + dx ** 2)
        
        return numerator / denominator
    
    def _calculate_distance(self, points: list[PathPoint]) -> float:
        """
        Calculate total distance traveled along a path.
        
        Only counts distance when hero is alive (hp > 0).
        """
        if len(points) < 2:
            return 0.0
        
        total = 0.0
        for i in range(1, len(points)):
            # Only count if both points are alive
            if points[i - 1].hp > 0 and points[i].hp > 0:
                dx = points[i].x - points[i - 1].x
                dy = points[i].y - points[i - 1].y
                total += math.sqrt(dx ** 2 + dy ** 2)
        
        return total
    
    def _calculate_alive_stats(
        self, 
        hero_df: pd.DataFrame
    ) -> tuple[float, float, int]:
        """
        Calculate time alive/dead and death count from position data.
        
        Returns:
            Tuple of (time_alive_seconds, time_dead_seconds, death_count)
        """
        if hero_df.empty:
            return 0.0, 0.0, 0
        
        # Sort by tick
        hero_df = hero_df.sort_values("tick")
        
        # Calculate time intervals
        ticks = hero_df["tick"].values
        hp_values = hero_df["hp"].values
        
        time_alive = 0.0
        time_dead = 0.0
        death_count = 0
        was_alive = True
        
        for i in range(1, len(ticks)):
            dt = (ticks[i] - ticks[i - 1]) / 30.0  # Convert to seconds
            
            # Check if alive at previous point
            prev_hp = hp_values[i - 1] if pd.notna(hp_values[i - 1]) else 0
            curr_hp = hp_values[i] if pd.notna(hp_values[i]) else 0
            
            if prev_hp > 0:
                time_alive += dt
                was_alive = True
            else:
                time_dead += dt
                if was_alive:
                    death_count += 1
                    was_alive = False
        
        return time_alive, time_dead, death_count
    
    def extract_path_segments(
        self,
        match_id: int,
        hero: str,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        segment_by_death: bool = True
    ) -> list[list[PathPoint]]:
        """
        Extract path as separate segments (split by death/respawn).
        
        Useful for visualizing individual "lives" separately.
        
        Args:
            match_id: Match ID
            hero: Hero name
            start_time: Start time in seconds
            end_time: End time in seconds
            segment_by_death: If True, split path at death/respawn events
            
        Returns:
            List of path segments, each segment is a list of PathPoints
        """
        result = self.extract_paths(
            match_id=match_id,
            hero=hero,
            start_time=start_time,
            end_time=end_time,
            simplify=False  # Don't simplify before segmenting
        )
        
        if not result.paths:
            return []
        
        hero_path = result.paths[0]
        points = hero_path.points
        
        if not segment_by_death:
            return [points]
        
        # Split by death (hp transitions to 0 or from 0)
        segments = []
        current_segment = []
        
        for i, point in enumerate(points):
            if point.hp > 0:
                current_segment.append(point)
            else:
                # Death occurred
                if current_segment:
                    segments.append(current_segment)
                    current_segment = []
        
        # Add final segment
        if current_segment:
            segments.append(current_segment)
        
        return segments

"""
Visualization data endpoints.

Provides APIs for generating heatmaps and movement path visualizations.
"""

from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from storage.parquet_storage import ParquetStorage
from analyzers.heatmap_analyzer import HeatmapAnalyzer
from analyzers.path_analyzer import PathAnalyzer

router = APIRouter()

# Initialize storage and analyzers
storage = ParquetStorage("data/matches")
heatmap_analyzer = HeatmapAnalyzer(storage)
path_analyzer = PathAnalyzer(storage)


class HeatmapRequest(BaseModel):
    """Request model for aggregate heatmap generation."""
    match_ids: list[int] | None = None
    hero: str | None = None
    team: int | None = None
    start_time: int = 0
    end_time: int | None = None
    grid_size: int = 64


class HeatmapResponse(BaseModel):
    """Response model for heatmap data."""
    match_id: int
    heatmap_type: str
    hero: Optional[str] = None
    team: Optional[int] = None
    time_range: dict
    grid_size: int
    map_bounds: dict
    grid_data: list[dict]
    max_density: int
    total_samples: int
    generation_time_ms: float


@router.get("/{match_id}/heatmap")
async def get_single_match_heatmap(
    match_id: int,
    hero: str | None = Query(None, description="Filter by hero name (e.g., npc_dota_hero_spectre)"),
    team: int | None = Query(None, description="Filter by team (2=Radiant, 3=Dire)"),
    heatmap_type: str = Query("movement", description="Heatmap type: movement, kill, death"),
    start_time: int = Query(0, description="Start time in seconds"),
    end_time: int | None = Query(None, description="End time in seconds"),
    grid_size: int = Query(64, ge=16, le=256, description="Grid size (16-256)"),
) -> dict:
    """
    Generate heatmap data for a single match.
    
    Returns grid cells with density values for visualization.
    
    - **movement**: Shows where heroes spent most time
    - **kill**: Shows where kills occurred
    - **death**: Shows where heroes died
    
    Performance target: < 500ms
    """
    # Check if match exists
    if not storage.match_exists(match_id):
        raise HTTPException(
            status_code=404, 
            detail=f"Match {match_id} not found"
        )
    
    # Generate heatmap based on type
    if heatmap_type == "movement":
        result = heatmap_analyzer.generate_movement_heatmap(
            match_id=match_id,
            grid_size=grid_size,
            hero=hero,
            team=team,
            start_time=start_time if start_time > 0 else None,
            end_time=end_time
        )
    elif heatmap_type == "kill":
        result = heatmap_analyzer.generate_kill_heatmap(
            match_id=match_id,
            grid_size=grid_size,
            team=team
        )
    elif heatmap_type == "death":
        result = heatmap_analyzer.generate_death_heatmap(
            match_id=match_id,
            grid_size=grid_size,
            hero=hero,
            team=team
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid heatmap_type: {heatmap_type}. Must be one of: movement, kill, death"
        )
    
    # Convert cells to dict format for JSON response
    grid_data = [
        {
            "grid_x": cell.grid_x,
            "grid_y": cell.grid_y,
            "x": cell.x,
            "y": cell.y,
            "density": cell.density
        }
        for cell in result.cells
    ]
    
    return {
        "data": {
            "match_id": result.match_id,
            "heatmap_type": result.heatmap_type,
            "hero": result.hero,
            "team": result.team,
            "time_range": {
                "start": result.time_range[0],
                "end": result.time_range[1]
            },
            "grid_size": result.grid_size,
            "map_bounds": result.map_bounds,
            "grid_data": grid_data,
            "max_density": result.max_density,
            "total_samples": result.total_samples
        },
        "meta": {
            "generation_time_ms": round(result.generation_time_ms, 2)
        }
    }


@router.get("/{match_id}/paths")
async def get_movement_paths(
    match_id: int,
    hero: str | None = Query(None, description="Filter by hero name (e.g., npc_dota_hero_spectre)"),
    team: int | None = Query(None, description="Filter by team (2=Radiant, 3=Dire)"),
    start_time: float = Query(0, description="Start time in seconds"),
    end_time: float | None = Query(None, description="End time in seconds"),
    simplify: bool = Query(True, description="Simplify path using Douglas-Peucker algorithm"),
    epsilon: float = Query(100.0, ge=10, le=500, description="Simplification tolerance (10-500 game units)"),
) -> dict:
    """
    Get movement paths for heroes.
    
    Returns polylines representing hero movement trajectories.
    Uses Douglas-Peucker algorithm for path simplification to reduce
    data size while preserving important shape features.
    
    - **simplify=True**: Reduces points using Douglas-Peucker (recommended)
    - **epsilon**: Higher values = more simplification, lower = more detail
    
    Response includes:
    - Path points with time, coordinates, hp, level
    - Statistics: total_distance, avg_speed, time_alive, death_count
    
    Performance target: < 500ms
    """
    # Check if match exists
    if not storage.match_exists(match_id):
        raise HTTPException(
            status_code=404, 
            detail=f"Match {match_id} not found"
        )
    
    # Extract paths
    result = path_analyzer.extract_paths(
        match_id=match_id,
        hero=hero,
        team=team,
        start_time=start_time if start_time > 0 else None,
        end_time=end_time,
        simplify=simplify,
        epsilon=epsilon
    )
    
    # Convert to JSON-serializable format
    paths_data = []
    for hero_path in result.paths:
        path_points = [
            {
                "time": round(p.time, 2),
                "x": round(p.x, 1),
                "y": round(p.y, 1),
                "hp": p.hp,
                "level": p.level
            }
            for p in hero_path.points
        ]
        
        paths_data.append({
            "hero": hero_path.hero,
            "team": hero_path.team,
            "team_name": "radiant" if hero_path.team == 2 else "dire",
            "points": path_points,
            "point_count": len(path_points),
            "stats": {
                "total_distance": round(hero_path.total_distance, 1),
                "avg_speed": round(hero_path.avg_speed, 1),
                "time_alive": round(hero_path.time_alive, 1),
                "time_dead": round(hero_path.time_dead, 1),
                "death_count": hero_path.death_count
            }
        })
    
    return {
        "data": {
            "match_id": result.match_id,
            "time_range": {
                "start": round(result.time_range[0], 2),
                "end": round(result.time_range[1], 2)
            },
            "paths": paths_data,
            "hero_count": len(paths_data),
            "simplification": {
                "enabled": result.simplified,
                "epsilon": result.epsilon,
                "original_points": result.original_points,
                "simplified_points": result.simplified_points,
                "reduction_ratio": round(
                    1 - result.simplified_points / result.original_points, 3
                ) if result.original_points > 0 else 0
            }
        },
        "meta": {
            "generation_time_ms": round(result.generation_time_ms, 2)
        }
    }


@router.get("/{match_id}/paths/{hero_name}")
async def get_hero_path(
    match_id: int,
    hero_name: str,
    start_time: float = Query(0, description="Start time in seconds"),
    end_time: float | None = Query(None, description="End time in seconds"),
    simplify: bool = Query(True, description="Simplify path using Douglas-Peucker algorithm"),
    epsilon: float = Query(100.0, ge=10, le=500, description="Simplification tolerance"),
    segment_by_death: bool = Query(False, description="Split path into segments at death/respawn"),
) -> dict:
    """
    Get movement path for a specific hero.
    
    Optionally split the path into segments at death/respawn events,
    useful for analyzing individual "lives" separately.
    """
    # Check if match exists
    if not storage.match_exists(match_id):
        raise HTTPException(
            status_code=404, 
            detail=f"Match {match_id} not found"
        )
    
    if segment_by_death:
        # Get segmented paths
        segments = path_analyzer.extract_path_segments(
            match_id=match_id,
            hero=hero_name,
            start_time=start_time if start_time > 0 else None,
            end_time=end_time,
            segment_by_death=True
        )
        
        # Optionally simplify each segment
        if simplify:
            simplified_segments = []
            for segment in segments:
                if len(segment) > 2:
                    simplified = path_analyzer._douglas_peucker(segment, epsilon)
                    simplified_segments.append(simplified)
                else:
                    simplified_segments.append(segment)
            segments = simplified_segments
        
        # Convert to JSON format
        segments_data = []
        for i, segment in enumerate(segments):
            segment_points = [
                {
                    "time": round(p.time, 2),
                    "x": round(p.x, 1),
                    "y": round(p.y, 1),
                    "hp": p.hp,
                    "level": p.level
                }
                for p in segment
            ]
            segments_data.append({
                "segment_index": i,
                "point_count": len(segment_points),
                "points": segment_points
            })
        
        return {
            "data": {
                "match_id": match_id,
                "hero": hero_name,
                "segment_count": len(segments_data),
                "segments": segments_data
            }
        }
    else:
        # Get single path
        result = path_analyzer.extract_paths(
            match_id=match_id,
            hero=hero_name,
            start_time=start_time if start_time > 0 else None,
            end_time=end_time,
            simplify=simplify,
            epsilon=epsilon
        )
        
        if not result.paths:
            raise HTTPException(
                status_code=404,
                detail=f"Hero {hero_name} not found in match {match_id}"
            )
        
        hero_path = result.paths[0]
        path_points = [
            {
                "time": round(p.time, 2),
                "x": round(p.x, 1),
                "y": round(p.y, 1),
                "hp": p.hp,
                "level": p.level
            }
            for p in hero_path.points
        ]
        
        return {
            "data": {
                "match_id": match_id,
                "hero": hero_path.hero,
                "team": hero_path.team,
                "team_name": "radiant" if hero_path.team == 2 else "dire",
                "time_range": {
                    "start": round(result.time_range[0], 2),
                    "end": round(result.time_range[1], 2)
                },
                "points": path_points,
                "point_count": len(path_points),
                "stats": {
                    "total_distance": round(hero_path.total_distance, 1),
                    "avg_speed": round(hero_path.avg_speed, 1),
                    "time_alive": round(hero_path.time_alive, 1),
                    "time_dead": round(hero_path.time_dead, 1),
                    "death_count": hero_path.death_count
                },
                "simplification": {
                    "enabled": result.simplified,
                    "epsilon": result.epsilon,
                    "original_points": result.original_points,
                    "simplified_points": result.simplified_points
                }
            },
            "meta": {
                "generation_time_ms": round(result.generation_time_ms, 2)
            }
        }


@router.post("/aggregate/heatmap")
async def get_aggregate_heatmap(request: HeatmapRequest) -> dict:
    """
    Generate aggregated heatmap from multiple matches.
    Useful for analyzing patterns across games.
    
    TODO: Implement multi-match aggregation
    """
    if not request.match_ids or len(request.match_ids) == 0:
        raise HTTPException(
            status_code=400,
            detail="match_ids is required and must not be empty"
        )
    
    # For now, generate heatmap for first match only
    # TODO: Implement proper multi-match aggregation
    first_match = request.match_ids[0]
    
    if not storage.match_exists(first_match):
        raise HTTPException(
            status_code=404,
            detail=f"Match {first_match} not found"
        )
    
    result = heatmap_analyzer.generate_movement_heatmap(
        match_id=first_match,
        grid_size=request.grid_size,
        hero=request.hero,
        team=request.team,
        start_time=request.start_time if request.start_time > 0 else None,
        end_time=request.end_time
    )
    
    grid_data = [
        {
            "grid_x": cell.grid_x,
            "grid_y": cell.grid_y,
            "x": cell.x,
            "y": cell.y,
            "density": cell.density
        }
        for cell in result.cells
    ]
    
    return {
        "data": {
            "match_count": len(request.match_ids),
            "grid_size": request.grid_size,
            "grid_data": grid_data,
            "max_density": result.max_density,
            "total_samples": result.total_samples,
            "message": "Multi-match aggregation not yet implemented, showing first match only"
        },
        "meta": {
            "generation_time_ms": round(result.generation_time_ms, 2)
        }
    }


@router.post("/aggregate/ward-clusters")
async def get_ward_clusters(
    match_ids: list[int],
    team: int | None = None,
    ward_type: str | None = None,
    min_samples: int = 3,
) -> dict:
    """
    Analyze ward placement patterns using clustering.
    Returns common ward positions and their frequency.
    
    TODO: Implement scikit-learn clustering
    """
    return {
        "data": {
            "match_count": len(match_ids),
            "clusters": [],
            "message": "Ward clustering not yet implemented"
        }
    }

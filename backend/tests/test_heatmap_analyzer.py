from __future__ import annotations

import json

import pandas as pd

from analyzers.heatmap_analyzer import HeatmapAnalyzer
from storage.parquet_storage import ParquetStorage


def _build_storage(tmp_path) -> tuple[ParquetStorage, int]:
    match_id = 999001
    match_dir = tmp_path / str(match_id)
    match_dir.mkdir(parents=True, exist_ok=True)

    kills = pd.DataFrame(
        [
            {
                "time": 60.0,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_lion",
                "x": 10000.0,
                "y": 10000.0,
            },
            {
                "time": 90.0,
                "killer": "npc_dota_hero_axe",
                "victim": "npc_dota_hero_tiny",
                "x": 11000.0,
                "y": 11000.0,
            },
            {
                "time": 120.0,
                "killer": "npc_dota_hero_lina",
                "victim": "npc_dota_hero_axe",
                "x": 20000.0,
                "y": 20000.0,
            },
            {
                "time": 180.0,
                "killer": "npc_dota_hero_slark",
                "victim": "npc_dota_hero_crystal_maiden",
                "x": 21000.0,
                "y": 21000.0,
            },
        ]
    )
    kills.to_parquet(match_dir / "kills.parquet")

    metadata = {
        "players": [
            {"hero_name": "npc_dota_hero_axe", "game_team": 2},
            {"hero_name": "npc_dota_hero_lina", "game_team": 2},
            {"hero_name": "npc_dota_hero_crystal_maiden", "game_team": 2},
            {"hero_name": "npc_dota_hero_lion", "game_team": 3},
            {"hero_name": "npc_dota_hero_tiny", "game_team": 3},
            {"hero_name": "npc_dota_hero_slark", "game_team": 3},
        ]
    }
    (match_dir / "meta.json").write_text(json.dumps(metadata), encoding="utf-8")

    return ParquetStorage(str(tmp_path)), match_id


def test_generate_kill_heatmap_filters_by_killer_team_hero_and_time_range(tmp_path) -> None:
    storage, match_id = _build_storage(tmp_path)
    analyzer = HeatmapAnalyzer(storage)

    result = analyzer.generate_kill_heatmap(
        match_id=match_id,
        grid_size=8,
        hero="npc_dota_hero_axe",
        team=2,
        start_time=0,
        end_time=100,
    )

    assert result.heatmap_type == "kill"
    assert result.hero == "npc_dota_hero_axe"
    assert result.team == 2
    assert result.time_range == (0, 100)
    assert result.total_samples == 2
    assert len(result.cells) == 1
    assert result.max_density == 2


def test_generate_death_heatmap_filters_by_victim_team_hero_and_time_range(tmp_path) -> None:
    storage, match_id = _build_storage(tmp_path)
    analyzer = HeatmapAnalyzer(storage)

    result = analyzer.generate_death_heatmap(
        match_id=match_id,
        grid_size=8,
        hero="npc_dota_hero_axe",
        team=2,
        start_time=100,
        end_time=130,
    )

    assert result.heatmap_type == "death"
    assert result.hero == "npc_dota_hero_axe"
    assert result.team == 2
    assert result.time_range == (100, 130)
    assert result.total_samples == 1
    assert len(result.cells) == 1

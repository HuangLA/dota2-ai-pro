"""Tests for trimming post-game parser samples after final whistle."""

from parsers.clarity_parser import ClarityParser


def test_convert_to_result_trims_postgame_samples_when_winner_detected() -> None:
    parser = ClarityParser()

    result = parser._convert_to_result(  # noqa: SLF001 - targeted unit test for parser pipeline
        {
            "success": True,
            "parse_time_ms": 1,
            "file_size_bytes": 1,
            "replay_path": "demo.dem",
            "total_ticks": 99999,
            "metadata": {
                "match_id": 123,
                "game_winner": 2,
                "duration_seconds": 1936.5,
                "final_whistle_game_time": 1936.5,
                "final_whistle_replay_time": 2963.1,
                "final_whistle_source": "winner_transition",
            },
            "positions": [
                {
                    "tick": 1,
                    "hero": "npc_dota_hero_axe",
                    "handle": 11,
                    "team": 2,
                    "x": 100.0,
                    "y": 200.0,
                    "game_time": 1936.4,
                },
                {
                    "tick": 2,
                    "hero": "npc_dota_hero_axe",
                    "handle": 11,
                    "team": 2,
                    "x": 150.0,
                    "y": 250.0,
                    "game_time": 1936.6,
                },
            ],
            "wards": [
                {
                    "type": "placed",
                    "ward_type": "observer",
                    "tick": 1,
                    "handle": 99,
                    "x": 100.0,
                    "y": 200.0,
                    "team": 2,
                    "game_time": 1935.0,
                },
                {
                    "type": "placed",
                    "ward_type": "observer",
                    "tick": 2,
                    "handle": 100,
                    "x": 120.0,
                    "y": 220.0,
                    "team": 2,
                    "game_time": 1940.0,
                },
            ],
            "economy": [
                {
                    "tick": 1,
                    "game_time": 1936.0,
                    "radiant_gold": 1,
                    "dire_gold": 1,
                    "radiant_xp": 1,
                    "dire_xp": 1,
                    "gold_advantage": 0,
                    "xp_advantage": 0,
                },
                {
                    "tick": 2,
                    "game_time": 1941.0,
                    "radiant_gold": 2,
                    "dire_gold": 2,
                    "radiant_xp": 2,
                    "dire_xp": 2,
                    "gold_advantage": 0,
                    "xp_advantage": 0,
                },
            ],
            "kills": [
                {
                    "time": 2963.0,
                    "killer": "npc_dota_hero_axe",
                    "victim": "npc_dota_hero_lina",
                    "x": 1.0,
                    "y": 2.0,
                },
                {
                    "time": 2963.2,
                    "killer": "npc_dota_hero_axe",
                    "victim": "npc_dota_hero_lina",
                    "x": 3.0,
                    "y": 4.0,
                },
            ],
            "heroes": {"11": "npc_dota_hero_axe"},
        }
    )

    assert result.metadata.final_whistle_game_time == 1936.5
    assert result.metadata.final_whistle_replay_time == 2963.1
    assert len(result.positions) == 1
    assert len(result.wards) == 1
    assert len(result.economy) == 1
    assert len(result.kills) == 1
    assert result.positions[0].game_time == 1936.4
    assert result.kills[0].time == 2963.0


def test_convert_to_result_keeps_samples_without_terminal_signal() -> None:
    parser = ClarityParser()

    result = parser._convert_to_result(  # noqa: SLF001 - targeted unit test for parser pipeline
        {
            "success": True,
            "parse_time_ms": 1,
            "file_size_bytes": 1,
            "replay_path": "demo.dem",
            "total_ticks": 60,
            "metadata": {
                "match_id": 456,
                "duration_seconds": 120.0,
            },
            "positions": [
                {
                    "tick": 1,
                    "hero": "npc_dota_hero_axe",
                    "handle": 11,
                    "team": 2,
                    "x": 100.0,
                    "y": 200.0,
                    "game_time": 130.0,
                },
            ],
            "wards": [],
            "economy": [],
            "kills": [],
            "heroes": {"11": "npc_dota_hero_axe"},
        }
    )

    assert len(result.positions) == 1

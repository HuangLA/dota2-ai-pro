"""Tests for saved match duration resolution after parsing."""

from parsers.models import MatchMetadata, ParseResult
from storage.match_storage import _resolve_saved_duration


def _result(*, total_ticks: int, duration_seconds: float | None, game_winner: int | None) -> ParseResult:
    return ParseResult(
        success=True,
        parse_time_ms=1,
        file_size_bytes=1,
        replay_path="demo.dem",
        total_ticks=total_ticks,
        metadata=MatchMetadata(
            match_id=1,
            game_winner=game_winner,
            duration_seconds=duration_seconds,
        ),
    )


def test_resolve_saved_duration_prefers_terminal_metadata_duration() -> None:
    result = _result(total_ticks=116645, duration_seconds=1936.5665, game_winner=2)
    assert _resolve_saved_duration(result) == 1937


def test_resolve_saved_duration_falls_back_to_replay_length_without_winner() -> None:
    result = _result(total_ticks=116645, duration_seconds=1936.5665, game_winner=None)
    assert _resolve_saved_duration(result) == 3888

"""
Clarity Parser Python Wrapper

This module provides a Python interface to the Clarity Java parser.
It handles subprocess communication and converts JSON output to typed dataclasses.
"""

import asyncio
import json
import locale
import subprocess
from pathlib import Path
from typing import Any, Optional

from .models import (
    ParseResult,
    MatchMetadata,
    PlayerInfo,
    PickBan,
    PositionSample,
    KillEvent,
    WardEvent,
    EconomySample,
)


def _decode_bytes(raw: bytes) -> str:
    """Decode subprocess bytes robustly across Windows locales."""
    preferred = locale.getpreferredencoding(False) or "utf-8"
    for encoding in ("utf-8", preferred, "gbk"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _coerce_int_list(value: object) -> list[int]:
    """Coerce parser list-like values into a stable int list."""
    if not isinstance(value, list):
        return []

    result: list[int] = []
    for item in value:
        if isinstance(item, bool):
            result.append(int(item))
        elif isinstance(item, (int, float)):
            result.append(int(item))
    return result


def _coerce_string_list(value: object) -> Optional[list[Optional[str]]]:
    """Coerce parser list-like values into a slot-preserving string list."""
    if not isinstance(value, list):
        return None

    result: list[Optional[str]] = []
    for item in value:
        if isinstance(item, str) and item:
            result.append(item)
        elif isinstance(item, dict):
            name = item.get("name")
            if isinstance(name, str) and name:
                result.append(name)
            else:
                result.append(None)
        else:
            result.append(None)

    while result and result[-1] is None:
        result.pop()

    return result or None


class ClarityParserError(Exception):
    """Exception raised when Clarity parser fails."""
    pass


class ClarityParser:
    """
    Python wrapper for the Clarity Java parser.
    
    Usage:
        parser = ClarityParser()
        result = parser.parse("path/to/replay.dem")
        
        # Or async:
        result = await parser.parse_async("path/to/replay.dem")
    """
    
    # Default paths (platform-aware)
    DEFAULT_JAVA_PATH = Path("/opt/homebrew/opt/openjdk@17/bin/java")
    DEFAULT_JAR_PATH = Path(__file__).parent.parent.parent / "parsers" / "build" / "libs" / "clarity-parser-1.0.0-uber.jar"
    
    def __init__(
        self, 
        java_path: Optional[Path] = None,
        jar_path: Optional[Path] = None,
        timeout: int = 120
    ):
        """
        Initialize the Clarity parser wrapper.
        
        Args:
            java_path: Path to Java executable. Defaults to bundled JDK 17.
            jar_path: Path to Clarity uber JAR. Defaults to built JAR.
            timeout: Timeout in seconds for parsing. Default 120s.
        """
        self.java_path = java_path or self.DEFAULT_JAVA_PATH
        self.jar_path = jar_path or self.DEFAULT_JAR_PATH
        self.timeout = timeout
        
    def validate_environment(self) -> tuple[bool, str]:
        """
        Validate that Java and JAR are available.
        
        Returns:
            Tuple of (is_valid, message)
        """
        if not self.java_path.exists():
            return False, f"Java executable not found: {self.java_path}"
        
        if not self.jar_path.exists():
            return False, f"Clarity JAR not found: {self.jar_path}"
        
        # Test Java version
        try:
            result = subprocess.run(
                [str(self.java_path), "-version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if "17" not in result.stderr:
                return False, f"Java 17 required, got: {result.stderr.split(chr(10))[0]}"
        except Exception as e:
            return False, f"Failed to check Java version: {e}"
        
        return True, "Environment OK"
    
    def parse(self, replay_path: str, minimal: bool = False) -> ParseResult:
        """
        Parse a replay file synchronously.
        
        Args:
            replay_path: Path to the .dem replay file
            minimal: If True, only extract basic metadata (faster)
            
        Returns:
            ParseResult with all extracted data
            
        Raises:
            ClarityParserError: If parsing fails
            FileNotFoundError: If replay file doesn't exist
        """
        replay_file = Path(replay_path)
        if not replay_file.exists():
            raise FileNotFoundError(f"Replay file not found: {replay_path}")
        
        # Build command
        cmd = [str(self.java_path), "-jar", str(self.jar_path), str(replay_file)]
        if minimal:
            cmd.append("--minimal")
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=self.timeout
            )
            stdout_str = _decode_bytes(result.stdout)
            stderr_str = _decode_bytes(result.stderr)
            
            # Parse JSON from stdout
            if not stdout_str.strip():
                raise ClarityParserError(
                    f"No output from parser. stderr: {stderr_str[:500]}"
                )
            
            try:
                data = json.loads(stdout_str)
            except json.JSONDecodeError as e:
                raise ClarityParserError(
                    f"Failed to parse JSON output: {e}\nOutput: {stdout_str[:500]}"
                )
            
            return self._convert_to_result(data)
            
        except subprocess.TimeoutExpired:
            raise ClarityParserError(f"Parser timed out after {self.timeout} seconds")
        except ClarityParserError:
            # Re-raise ClarityParserError as-is
            raise
        except Exception as e:
            # Preserve full error details
            error_msg = str(e) or repr(e)
            error_type = type(e).__name__
            raise ClarityParserError(f"Parser failed: [{error_type}] {error_msg}")
    
    async def parse_async(self, replay_path: str, minimal: bool = False) -> ParseResult:
        """
        Parse a replay file asynchronously.
        
        Runs the synchronous parse() in a thread pool to avoid Windows asyncio
        SelectorEventLoop incompatibility with create_subprocess_exec, which
        raises NotImplementedError() on Windows when uvicorn uses SelectorEventLoop.
        
        Args:
            replay_path: Path to the .dem replay file
            minimal: If True, only extract basic metadata (faster)
            
        Returns:
            ParseResult with all extracted data
            
        Raises:
            ClarityParserError: If parsing fails
            FileNotFoundError: If replay file doesn't exist
        """
        return await asyncio.to_thread(self.parse, replay_path, minimal)

    def _convert_to_result(self, data: dict[str, Any]) -> ParseResult:
        """Convert raw JSON data to typed ParseResult."""
        
        # Check for error
        if not data.get("success", False):
            return ParseResult(
                success=False,
                parse_time_ms=0,
                file_size_bytes=0,
                replay_path=data.get("replay_path", ""),
                total_ticks=0,
                metadata=MatchMetadata(),
                error=data.get("error", "Unknown error")
            )
        
        # Parse metadata
        raw_meta = data.get("metadata", {})
        
        # Parse picks/bans
        picks_bans = []
        for pb in raw_meta.get("picks_bans", []):
            picks_bans.append(PickBan(
                hero_id=pb.get("hero_id", 0),
                team=pb.get("team", 0),
                is_pick=pb.get("is_pick", False)
            ))
        
        # Parse players
        players = []
        for p in raw_meta.get("players", []):
            players.append(PlayerInfo(
                hero_name=p.get("hero_name", ""),
                player_name=p.get("player_name", ""),
                game_team=p.get("game_team", 0)
            ))
        
        metadata = MatchMetadata(
            match_id=raw_meta.get("match_id"),
            game_mode=raw_meta.get("game_mode"),
            game_winner=raw_meta.get("game_winner") or raw_meta.get("winner"),
            leagueid=raw_meta.get("leagueid"),
            duration_seconds=raw_meta.get("duration_seconds"),
            time_contract_version=raw_meta.get("time_contract_version"),
            game_start_time=raw_meta.get("game_start_time"),
            clock_zero_source=raw_meta.get("clock_zero_source"),
            ticks_per_second=raw_meta.get("ticks_per_second"),
            time_mapping=raw_meta.get("time_mapping"),
            inventory_slot_contract_version=raw_meta.get("inventory_slot_contract_version"),
            pause_intervals=raw_meta.get("pause_intervals", []),
            picks_bans=picks_bans,
            players=players
        )
        
        # Parse positions
        positions = []
        for pos in data.get("positions", []):
            positions.append(PositionSample(
                tick=pos.get("tick", 0),
                hero=pos.get("hero", ""),
                handle=pos.get("handle", 0),
                team=pos.get("team", 0),
                x=pos.get("x", 0.0),
                y=pos.get("y", 0.0),
                hp=pos.get("hp"),
                max_hp=pos.get("max_hp"),
                mana=pos.get("mana"),
                max_mana=pos.get("max_mana"),
                level=pos.get("level"),
                items=_coerce_string_list(pos.get("items")),
                game_time=pos.get("game_time")
            ))
        
        # Parse kills
        kills = []
        for k in data.get("kills", []):
            kills.append(KillEvent(
                time=k.get("time", 0.0),
                killer=k.get("killer", ""),
                victim=k.get("victim", ""),
                x=k.get("x"),
                y=k.get("y"),
                assist_players=k.get("assist_players"),
            ))
        
        # Parse wards
        wards = []
        for w in data.get("wards", []):
            wards.append(WardEvent(
                type=w.get("type", ""),
                ward_type=w.get("ward_type", ""),
                tick=w.get("tick", 0),
                handle=w.get("handle", 0),
                x=w.get("x"),
                y=w.get("y"),
                team=w.get("team"),
                game_time=w.get("game_time")
            ))
        

        # Parse economy samples
        economy = []
        for e in data.get("economy", []):
            economy.append(EconomySample(
                tick=e.get("tick", 0),
                game_time=e.get("game_time", 0.0),
                radiant_gold=e.get("radiant_gold", 0),
                dire_gold=e.get("dire_gold", 0),
                radiant_xp=e.get("radiant_xp", 0),
                dire_xp=e.get("dire_xp", 0),
                gold_advantage=e.get("gold_advantage", 0),
                xp_advantage=e.get("xp_advantage", 0),
                radiant_gold_by_player=_coerce_int_list(
                    e.get("radiant_gold_by_player", e.get("radiant_gold_by_slot"))
                ),
                dire_gold_by_player=_coerce_int_list(
                    e.get("dire_gold_by_player", e.get("dire_gold_by_slot"))
                ),
                radiant_xp_by_player=_coerce_int_list(
                    e.get("radiant_xp_by_player", e.get("radiant_xp_by_slot"))
                ),
                dire_xp_by_player=_coerce_int_list(
                    e.get("dire_xp_by_player", e.get("dire_xp_by_slot"))
                ),
                radiant_net_worth=_coerce_int_list(e.get("radiant_net_worth")),
                dire_net_worth=_coerce_int_list(e.get("dire_net_worth")),
                radiant_net_worth_total=e.get("radiant_net_worth_total", 0),
                dire_net_worth_total=e.get("dire_net_worth_total", 0),
                net_worth_advantage=e.get("net_worth_advantage", 0),
            ))

        # Parse heroes mapping
        heroes = {}
        raw_heroes = data.get("heroes", {})
        for handle_str, name in raw_heroes.items():
            try:
                heroes[int(handle_str)] = name
            except ValueError:
                pass
        
        return ParseResult(
            success=True,
            parse_time_ms=data.get("parse_time_ms", 0),
            file_size_bytes=data.get("file_size_bytes", 0),
            replay_path=data.get("replay_path", ""),
            total_ticks=data.get("total_ticks", 0),
            metadata=metadata,
            positions=positions,
            kills=kills,
            wards=wards,
            heroes=heroes,
            economy=economy,
        )


# Convenience function for quick parsing
def parse_replay(replay_path: str, minimal: bool = False) -> ParseResult:
    """
    Quick function to parse a replay file.
    
    Args:
        replay_path: Path to the .dem replay file
        minimal: If True, only extract basic metadata
        
    Returns:
        ParseResult with all extracted data
    """
    parser = ClarityParser()
    return parser.parse(replay_path, minimal)


async def parse_replay_async(replay_path: str, minimal: bool = False) -> ParseResult:
    """
    Quick async function to parse a replay file.
    
    Args:
        replay_path: Path to the .dem replay file
        minimal: If True, only extract basic metadata
        
    Returns:
        ParseResult with all extracted data
    """
    parser = ClarityParser()
    return await parser.parse_async(replay_path, minimal)


if __name__ == "__main__":
    # Simple test
    import time
    
    if len(sys.argv) < 2:
        print("Usage: python clarity_parser.py <replay.dem>")
        sys.exit(1)
    
    replay_path = sys.argv[1]
    
    print(f"Parsing: {replay_path}")
    print("-" * 50)
    
    parser = ClarityParser()
    
    # Validate environment
    valid, msg = parser.validate_environment()
    print(f"Environment: {msg}")
    
    if not valid:
        sys.exit(1)
    
    # Parse
    start = time.time()
    result = parser.parse(replay_path)
    elapsed = time.time() - start
    
    print(f"\nParsing completed in {elapsed:.2f}s")
    print(f"Success: {result.success}")
    print(f"Parse time (Java): {result.parse_time_ms}ms")
    print(f"File size: {result.file_size_bytes / 1024 / 1024:.2f} MB")
    print(f"Total ticks: {result.total_ticks}")
    print(f"Duration: {result.duration_seconds:.0f}s ({result.duration_seconds/60:.1f} min)")
    
    print(f"\nMetadata:")
    print(f"  Match ID: {result.metadata.match_id}")
    print(f"  Game Mode: {result.metadata.game_mode}")
    print(f"  Winner: {result.metadata.winner_name}")
    print(f"  Players: {len(result.metadata.players)}")
    print(f"  Picks/Bans: {len(result.metadata.picks_bans)}")
    
    print(f"\nExtracted data:")
    print(f"  Position samples: {len(result.positions)}")
    print(f"  Kill events: {len(result.kills)}")
    print(f"  Ward events: {len(result.wards)}")
    
    print(f"\nRadiant heroes: {result.radiant_heroes[:5]}")  # Show first 5
    print(f"Dire heroes: {result.dire_heroes[:5]}")  # Show first 5
    
    if result.kills:
        print(f"\nFirst 3 kills:")
        for k in result.kills[:3]:
            print(f"  {k.time:.0f}s: {k.killer_hero} killed {k.victim_hero}")

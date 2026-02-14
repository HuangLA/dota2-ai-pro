"""
Clarity Parser Python Wrapper

This module provides a Python interface to the Clarity Java parser.
It handles subprocess communication and converts JSON output to typed dataclasses.
"""

import asyncio
import json
import subprocess
import sys
from pathlib import Path
from typing import Optional

from .models import (
    ParseResult,
    MatchMetadata,
    PlayerInfo,
    PickBan,
    PositionSample,
    KillEvent,
    WardEvent,
)


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
    
    # Default paths (relative to project root)
    DEFAULT_JAVA_PATH = Path(r"N:\dota2-ai-pro\parsers\jdk17\jdk-17.0.18+8\bin\java.exe")
    DEFAULT_JAR_PATH = Path(r"N:\dota2-ai-pro\parsers\build\libs\clarity-parser-1.0.0-uber.jar")
    
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
                text=True,
                timeout=self.timeout
            )
            
            # Parse JSON from stdout
            if not result.stdout.strip():
                raise ClarityParserError(
                    f"No output from parser. stderr: {result.stderr[:500]}"
                )
            
            try:
                data = json.loads(result.stdout)
            except json.JSONDecodeError as e:
                raise ClarityParserError(
                    f"Failed to parse JSON output: {e}\nOutput: {result.stdout[:500]}"
                )
            
            return self._convert_to_result(data)
            
        except subprocess.TimeoutExpired:
            raise ClarityParserError(f"Parser timed out after {self.timeout} seconds")
        except Exception as e:
            raise ClarityParserError(f"Parser failed: {e}")
    
    async def parse_async(self, replay_path: str, minimal: bool = False) -> ParseResult:
        """
        Parse a replay file asynchronously.
        
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
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.timeout
            )
            
            stdout_str = stdout.decode("utf-8")
            
            if not stdout_str.strip():
                raise ClarityParserError(
                    f"No output from parser. stderr: {stderr.decode('utf-8')[:500]}"
                )
            
            try:
                data = json.loads(stdout_str)
            except json.JSONDecodeError as e:
                raise ClarityParserError(
                    f"Failed to parse JSON output: {e}\nOutput: {stdout_str[:500]}"
                )
            
            return self._convert_to_result(data)
            
        except asyncio.TimeoutError:
            raise ClarityParserError(f"Parser timed out after {self.timeout} seconds")
        except Exception as e:
            if isinstance(e, ClarityParserError):
                raise
            raise ClarityParserError(f"Parser failed: {e}")
    
    def _convert_to_result(self, data: dict) -> ParseResult:
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
                y=k.get("y")
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
            heroes=heroes
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

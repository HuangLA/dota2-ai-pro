"""
Data models for Dota 2 replay parsing results.

These dataclasses represent the structured output from the Clarity parser.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PlayerInfo:
    """Information about a player in the match."""
    hero_name: str
    player_name: str
    game_team: int  # 2=Radiant, 3=Dire
    
    @property
    def team_name(self) -> str:
        return "Radiant" if self.game_team == 2 else "Dire" if self.game_team == 3 else "Unknown"


@dataclass
class PickBan:
    """A single pick or ban in the draft phase."""
    hero_id: int
    team: int  # 2=Radiant, 3=Dire
    is_pick: bool
    
    @property
    def team_name(self) -> str:
        return "Radiant" if self.team == 2 else "Dire" if self.team == 3 else "Unknown"
    
    @property
    def action(self) -> str:
        return "pick" if self.is_pick else "ban"


@dataclass
class PositionSample:
    """A single position sample for a hero at a specific tick."""
    tick: int
    hero: str
    handle: int
    team: int  # 2=Radiant, 3=Dire
    x: float
    y: float
    hp: Optional[int] = None
    max_hp: Optional[int] = None
    mana: Optional[float] = None
    max_mana: Optional[float] = None
    level: Optional[int] = None
    
    @property
    def team_name(self) -> str:
        return "Radiant" if self.team == 2 else "Dire" if self.team == 3 else "Unknown"
    
    @property
    def hp_percent(self) -> Optional[float]:
        if self.hp is not None and self.max_hp and self.max_hp > 0:
            return self.hp / self.max_hp * 100
        return None


@dataclass
class KillEvent:
    """A kill event in the match."""
    time: float  # Game time in seconds
    killer: str  # Killer hero/unit name (e.g., "npc_dota_hero_invoker")
    victim: str  # Victim hero name
    x: Optional[float] = None
    y: Optional[float] = None
    
    @property
    def killer_hero(self) -> str:
        """Extract hero name from killer string."""
        if self.killer.startswith("npc_dota_hero_"):
            return self.killer.replace("npc_dota_hero_", "")
        return self.killer
    
    @property
    def victim_hero(self) -> str:
        """Extract hero name from victim string."""
        if self.victim.startswith("npc_dota_hero_"):
            return self.victim.replace("npc_dota_hero_", "")
        return self.victim


@dataclass
class WardEvent:
    """A ward placement or destruction event."""
    type: str  # "placed" or "destroyed"
    ward_type: str  # "observer" or "sentry"
    tick: int
    handle: int
    x: Optional[float] = None
    y: Optional[float] = None
    team: Optional[int] = None  # 2=Radiant, 3=Dire
    
    @property
    def team_name(self) -> Optional[str]:
        if self.team == 2:
            return "Radiant"
        elif self.team == 3:
            return "Dire"
        return None


@dataclass
class MatchMetadata:
    """Metadata about the match."""
    match_id: Optional[int] = None
    game_mode: Optional[int] = None
    game_winner: Optional[int] = None  # 2=Radiant, 3=Dire
    leagueid: Optional[int] = None
    duration_seconds: Optional[float] = None
    picks_bans: list[PickBan] = field(default_factory=list)
    players: list[PlayerInfo] = field(default_factory=list)
    
    @property
    def winner_name(self) -> Optional[str]:
        if self.game_winner == 2:
            return "Radiant"
        elif self.game_winner == 3:
            return "Dire"
        return None
    
    @property
    def duration_minutes(self) -> Optional[float]:
        if self.duration_seconds:
            return self.duration_seconds / 60
        return None


@dataclass
class ParseResult:
    """Complete result of parsing a replay file."""
    success: bool
    parse_time_ms: int
    file_size_bytes: int
    replay_path: str
    total_ticks: int
    
    # Match data
    metadata: MatchMetadata
    positions: list[PositionSample] = field(default_factory=list)
    kills: list[KillEvent] = field(default_factory=list)
    wards: list[WardEvent] = field(default_factory=list)
    heroes: dict[int, str] = field(default_factory=dict)  # handle -> hero_name
    
    # Error info (only set if success=False)
    error: Optional[str] = None
    
    @property
    def duration_seconds(self) -> float:
        """Estimated duration based on ticks (30 ticks per second)."""
        return self.total_ticks / 30.0
    
    @property
    def radiant_heroes(self) -> list[str]:
        """List of unique Radiant hero names."""
        seen = set()
        result = []
        for pos in self.positions:
            if pos.team == 2 and pos.hero not in seen:
                seen.add(pos.hero)
                result.append(pos.hero)
        return result
    
    @property
    def dire_heroes(self) -> list[str]:
        """List of unique Dire hero names."""
        seen = set()
        result = []
        for pos in self.positions:
            if pos.team == 3 and pos.hero not in seen:
                seen.add(pos.hero)
                result.append(pos.hero)
        return result
    
    def get_hero_positions(self, hero_name: str) -> list[PositionSample]:
        """Get all position samples for a specific hero."""
        return [p for p in self.positions if p.hero == hero_name]
    
    def get_kills_for_hero(self, hero_name: str) -> list[KillEvent]:
        """Get all kills by a specific hero."""
        return [k for k in self.kills if k.killer_hero.lower() == hero_name.lower()]
    
    def get_deaths_for_hero(self, hero_name: str) -> list[KillEvent]:
        """Get all deaths of a specific hero."""
        return [k for k in self.kills if k.victim_hero.lower() == hero_name.lower()]

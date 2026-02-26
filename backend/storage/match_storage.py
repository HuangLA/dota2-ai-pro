"""
Match metadata storage using SQLite.

This module handles storing and retrieving match metadata in SQLite database.
"""

import sqlite3
import time
from typing import Optional
from dataclasses import dataclass

from database.sqlite_db import get_connection
from parsers.models import ParseResult
from utils.hero_mapping import get_hero_id


@dataclass
class MatchRecord:
    """Represents a match record from the database."""
    match_id: int
    start_time: int
    duration: int
    game_mode: Optional[int]
    patch_version: Optional[str]
    winner_team: Optional[int]
    radiant_score: int
    dire_score: int
    league_id: Optional[int]
    replay_path: Optional[str]
    parse_status: str
    created_at: int
    updated_at: int


@dataclass
class PlayerMatchRecord:
    """Represents a player's performance in a match."""
    id: int
    match_id: int
    account_id: int
    hero_id: int
    player_slot: Optional[int]
    team_id: Optional[int]
    kills: int
    deaths: int
    assists: int
    gpm: int
    xpm: int
    net_worth: int
    last_hits: int
    denies: int
    hero_damage: int
    tower_damage: int
    hero_healing: int


class MatchStorage:
    """
    Handles match metadata storage in SQLite.
    
    Usage:
        storage = MatchStorage()
        storage.save_from_parse_result(parse_result)
        
        match = storage.get_match(match_id)
        matches = storage.list_matches(limit=20)
    """
    
    def save_from_parse_result(self, result: ParseResult, replay_path: str) -> bool:
        """
        Save match metadata from a parse result.
        
        Args:
            result: ParseResult from clarity parser
            replay_path: Path to the replay file
            
        Returns:
            True if saved successfully
        """
        if not result.success or not result.metadata.match_id:
            return False
        
        conn = get_connection()
        cursor = conn.cursor()
        
        now = int(time.time())
        meta = result.metadata
        
        # Compute duration: prefer tick-based (total_ticks / 30) as it reflects
        # actual replay length including pre-game. meta.duration_seconds can be
        # wrong for some replays (e.g., match 8703862527 reports 1551s but replay
        # source_time extends to ~3474s). Use the larger of the two.
        tick_duration = int(result.total_ticks / 30) if result.total_ticks else 0
        meta_duration = int(meta.duration_seconds) if meta.duration_seconds else 0
        duration = max(tick_duration, meta_duration)

        # Insert or update match
        cursor.execute("""
            INSERT INTO matches (
                match_id, start_time, duration, game_mode, winner_team,
                league_id, replay_path, parse_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)
            ON CONFLICT(match_id) DO UPDATE SET
                duration = excluded.duration,
                game_mode = excluded.game_mode,
                winner_team = excluded.winner_team,
                league_id = excluded.league_id,
                replay_path = excluded.replay_path,
                parse_status = 'completed',
                updated_at = excluded.updated_at
        """, (
            meta.match_id,
            now,  # start_time - we don't have exact time from replay
            duration,
            meta.game_mode,
            meta.game_winner,
            meta.leagueid,
            replay_path,
            now,
            now
        ))
        
        # Insert player data
        for i, player in enumerate(meta.players):
            # Generate a fake account_id from player slot if not available
            account_id = i + 1  # Placeholder
            hero_id = get_hero_id(player.hero_name)  # Convert hero name to ID
            team_id = 2 if player.game_team == 2 else 3
            
            cursor.execute("""
                INSERT OR REPLACE INTO player_matches (
                    match_id, account_id, hero_id, player_slot, team_id
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                meta.match_id,
                account_id,
                hero_id,
                i,
                team_id
            ))
        
        conn.commit()
        return True
    
    def get_match(self, match_id: int) -> Optional[MatchRecord]:
        """Get a match by ID."""
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT match_id, start_time, duration, game_mode, patch_version,
                   winner_team, radiant_score, dire_score, league_id,
                   replay_path, parse_status, created_at, updated_at
            FROM matches
            WHERE match_id = ?
        """, (match_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return MatchRecord(
            match_id=row["match_id"],
            start_time=row["start_time"],
            duration=row["duration"],
            game_mode=row["game_mode"],
            patch_version=row["patch_version"],
            winner_team=row["winner_team"],
            radiant_score=row["radiant_score"],
            dire_score=row["dire_score"],
            league_id=row["league_id"],
            replay_path=row["replay_path"],
            parse_status=row["parse_status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"]
        )
    
    def _build_filter_clause(
        self,
        status: Optional[str] = None,
        league_id: Optional[int] = None,
        hero_id: Optional[int] = None,
        account_id: Optional[int] = None,
        team_id: Optional[int] = None,
    ) -> tuple[str, str, list]:
        """
        Build shared WHERE/JOIN clauses for list and count queries.

        Returns:
            (join_clause, where_clause, params)
        """
        joins: list[str] = []
        conditions: list[str] = []
        params: list = []

        if status:
            conditions.append("m.parse_status = ?")
            params.append(status)

        if league_id is not None:
            conditions.append("m.league_id = ?")
            params.append(league_id)

        # Filter by hero or account via player_matches (single JOIN covers both)
        if hero_id is not None or account_id is not None:
            joins.append(
                "JOIN player_matches pm ON pm.match_id = m.match_id"
            )
            if hero_id is not None:
                conditions.append("pm.hero_id = ?")
                params.append(hero_id)
            if account_id is not None:
                conditions.append("pm.account_id = ?")
                params.append(account_id)

        if team_id is not None:
            joins.append(
                "JOIN team_matches tm ON tm.match_id = m.match_id"
            )
            conditions.append("tm.team_id = ?")
            params.append(team_id)

        join_clause = " ".join(joins)
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        return join_clause, where_clause, params

    def list_matches(
        self,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        league_id: Optional[int] = None,
        hero_id: Optional[int] = None,
        account_id: Optional[int] = None,
        team_id: Optional[int] = None,
    ) -> list[MatchRecord]:
        """
        List matches with pagination and filters.

        Args:
            limit: Maximum number of results
            offset: Skip this many results
            status: Filter by parse status
            league_id: Filter by league
            hero_id: Filter by hero (via player_matches)
            account_id: Filter by player account (via player_matches)
            team_id: Filter by team (via team_matches)
        """
        conn = get_connection()
        cursor = conn.cursor()

        join_clause, where_clause, params = self._build_filter_clause(
            status=status,
            league_id=league_id,
            hero_id=hero_id,
            account_id=account_id,
            team_id=team_id,
        )

        query = f"""
            SELECT DISTINCT
                   m.match_id, m.start_time, m.duration, m.game_mode,
                   m.patch_version, m.winner_team, m.radiant_score,
                   m.dire_score, m.league_id, m.replay_path,
                   m.parse_status, m.created_at, m.updated_at
            FROM matches m
            {join_clause}
            WHERE {where_clause}
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])

        cursor.execute(query, params)

        matches = []
        for row in cursor.fetchall():
            matches.append(MatchRecord(
                match_id=row["match_id"],
                start_time=row["start_time"],
                duration=row["duration"],
                game_mode=row["game_mode"],
                patch_version=row["patch_version"],
                winner_team=row["winner_team"],
                radiant_score=row["radiant_score"],
                dire_score=row["dire_score"],
                league_id=row["league_id"],
                replay_path=row["replay_path"],
                parse_status=row["parse_status"],
                created_at=row["created_at"],
                updated_at=row["updated_at"]
            ))

        return matches

    def count_matches(
        self,
        status: Optional[str] = None,
        league_id: Optional[int] = None,
        hero_id: Optional[int] = None,
        account_id: Optional[int] = None,
        team_id: Optional[int] = None,
    ) -> int:
        """Count total matches matching the given filters."""
        conn = get_connection()
        cursor = conn.cursor()

        join_clause, where_clause, params = self._build_filter_clause(
            status=status,
            league_id=league_id,
            hero_id=hero_id,
            account_id=account_id,
            team_id=team_id,
        )

        query = f"""
            SELECT COUNT(DISTINCT m.match_id)
            FROM matches m
            {join_clause}
            WHERE {where_clause}
        """

        cursor.execute(query, params)
        return cursor.fetchone()[0]
    
    def update_parse_status(
        self, 
        match_id: int, 
        status: str,
        error_message: Optional[str] = None
    ) -> bool:
        """Update the parse status of a match."""
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE matches
            SET parse_status = ?, updated_at = ?
            WHERE match_id = ?
        """, (status, int(time.time()), match_id))
        
        conn.commit()
        return cursor.rowcount > 0
    
    def delete_match(self, match_id: int) -> bool:
        """Delete a match and all related data."""
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("DELETE FROM matches WHERE match_id = ?", (match_id,))
        conn.commit()
        
        return cursor.rowcount > 0
    
    def get_match_players(self, match_id: int) -> list[PlayerMatchRecord]:
        """Get all players for a match."""
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, match_id, account_id, hero_id, player_slot, team_id,
                   kills, deaths, assists, gpm, xpm, net_worth,
                   last_hits, denies, hero_damage, tower_damage, hero_healing
            FROM player_matches
            WHERE match_id = ?
            ORDER BY player_slot
        """, (match_id,))
        
        players = []
        for row in cursor.fetchall():
            players.append(PlayerMatchRecord(
                id=row["id"],
                match_id=row["match_id"],
                account_id=row["account_id"],
                hero_id=row["hero_id"],
                player_slot=row["player_slot"],
                team_id=row["team_id"],
                kills=row["kills"],
                deaths=row["deaths"],
                assists=row["assists"],
                gpm=row["gpm"],
                xpm=row["xpm"],
                net_worth=row["net_worth"],
                last_hits=row["last_hits"],
                denies=row["denies"],
                hero_damage=row["hero_damage"],
                tower_damage=row["tower_damage"],
                hero_healing=row["hero_healing"]
            ))
        
        return players

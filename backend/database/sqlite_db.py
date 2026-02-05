"""SQLite database initialization and connection management."""

import sqlite3
from pathlib import Path
from typing import Optional

_connection: Optional[sqlite3.Connection] = None


def get_connection() -> sqlite3.Connection:
    """Get the global database connection."""
    global _connection
    if _connection is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")
    return _connection


def init_database(db_path: str) -> sqlite3.Connection:
    """
    Initialize SQLite database with schema.
    Creates database file and tables if they don't exist.
    """
    global _connection
    
    # Ensure directory exists
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    
    # Create connection
    _connection = sqlite3.connect(db_path, check_same_thread=False)
    _connection.row_factory = sqlite3.Row
    
    # Apply performance optimizations
    cursor = _connection.cursor()
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA cache_size = -64000;")  # 64MB cache
    cursor.execute("PRAGMA mmap_size = 268435456;")  # 256MB mmap
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Create tables
    _create_tables(cursor)
    
    _connection.commit()
    return _connection


def _create_tables(cursor: sqlite3.Cursor) -> None:
    """Create all database tables."""
    
    # Matches table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS matches (
            match_id INTEGER PRIMARY KEY,
            start_time INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            game_mode INTEGER,
            patch_version TEXT,
            winner_team INTEGER CHECK(winner_team IN (2, 3)),
            radiant_score INTEGER DEFAULT 0,
            dire_score INTEGER DEFAULT 0,
            league_id INTEGER,
            replay_path TEXT,
            parse_status TEXT DEFAULT 'pending' 
                CHECK(parse_status IN ('pending', 'parsing', 'completed', 'failed')),
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    """)
    
    # Player matches table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS player_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            hero_id INTEGER NOT NULL,
            player_slot INTEGER,
            team_id INTEGER,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            gpm INTEGER DEFAULT 0,
            xpm INTEGER DEFAULT 0,
            net_worth INTEGER DEFAULT 0,
            last_hits INTEGER DEFAULT 0,
            denies INTEGER DEFAULT 0,
            hero_damage INTEGER DEFAULT 0,
            tower_damage INTEGER DEFAULT 0,
            hero_healing INTEGER DEFAULT 0,
            FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
            UNIQUE(match_id, account_id)
        )
    """)
    
    # Teams table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS teams (
            team_id INTEGER PRIMARY KEY,
            team_name TEXT NOT NULL,
            team_tag TEXT,
            logo_url TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    """)
    
    # Team matches junction table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS team_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            is_radiant INTEGER NOT NULL,
            is_winner INTEGER,
            FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE,
            FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE,
            UNIQUE(match_id, team_id)
        )
    """)
    
    # Heroes reference table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS heroes (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            localized_name TEXT NOT NULL,
            primary_attr TEXT,
            attack_type TEXT,
            roles TEXT
        )
    """)
    
    # Items reference table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            localized_name TEXT,
            cost INTEGER,
            is_recipe INTEGER DEFAULT 0
        )
    """)
    
    # Parse tasks queue
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parse_tasks (
            task_id TEXT PRIMARY KEY,
            replay_path TEXT NOT NULL,
            status TEXT DEFAULT 'pending'
                CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
            progress REAL DEFAULT 0.0,
            error_message TEXT,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            started_at INTEGER,
            completed_at INTEGER
        )
    """)
    
    # Dota versions tracking
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dota_versions (
            version_id INTEGER PRIMARY KEY AUTOINCREMENT,
            version_string TEXT UNIQUE NOT NULL,
            release_date INTEGER,
            parser_compatible INTEGER DEFAULT 1
        )
    """)
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_time ON matches(start_time DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_league ON matches(league_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_patch ON matches(patch_version)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_status ON matches(parse_status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_account ON player_matches(account_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_hero ON player_matches(hero_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_match ON player_matches(match_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_task_status ON parse_tasks(status)")


def close_database() -> None:
    """Close the database connection."""
    global _connection
    if _connection:
        _connection.close()
        _connection = None

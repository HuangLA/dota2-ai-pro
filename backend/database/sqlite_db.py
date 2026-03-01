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

    # OpenDota recent matches cache/sync table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS opendota_matches (
            match_id INTEGER PRIMARY KEY,
            start_time INTEGER NOT NULL DEFAULT 0,
            duration INTEGER NOT NULL DEFAULT 0,
            radiant_team_id INTEGER,
            dire_team_id INTEGER,
            leagueid INTEGER,
            source TEXT NOT NULL DEFAULT 'pro' CHECK(source IN ('pro','public')),
            radiant_team_name TEXT,
            dire_team_name TEXT,
            league_name TEXT,
            radiant_logo_url TEXT,
            dire_logo_url TEXT,
            league_icon_url TEXT,
            league_image_url TEXT,
            league_banner_url TEXT,
            radiant_logo_sponsor_url TEXT,
            dire_logo_sponsor_url TEXT,
            last_synced_at INTEGER NOT NULL
        )
    """)

    # OpenDota teams reference table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS opendota_teams (
            team_id INTEGER PRIMARY KEY,
            name TEXT,
            tag TEXT,
            logo_url TEXT,
            logo_sponsor_url TEXT,
            wins INTEGER NOT NULL DEFAULT 0,
            losses INTEGER NOT NULL DEFAULT 0,
            last_synced_at INTEGER NOT NULL
        )
    """)

    # OpenDota leagues reference table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS opendota_leagues (
            leagueid INTEGER PRIMARY KEY,
            name TEXT,
            tier TEXT,
            icon_url TEXT,
            image_url TEXT,
            banner_url TEXT,
            last_synced_at INTEGER NOT NULL
        )
    """)

    # Replay download tasks table (Phase 4-3)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS replay_download_tasks (
            task_id TEXT PRIMARY KEY,
            match_id INTEGER NOT NULL,
            status TEXT NOT NULL
                CHECK(status IN ('pending', 'prepared', 'downloading', 'completed', 'failed')),
            attempt_count INTEGER NOT NULL DEFAULT 0,
            replay_url TEXT,
            download_path TEXT,
            error_code TEXT,
            error_message TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    """)

    _ensure_opendota_match_columns(cursor)
    _ensure_opendota_reference_columns(cursor)
    _ensure_replay_download_task_columns(cursor)
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_time ON matches(start_time DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_league ON matches(league_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_patch ON matches(patch_version)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_status ON matches(parse_status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_account ON player_matches(account_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_hero ON player_matches(hero_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_match ON player_matches(match_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_task_status ON parse_tasks(status)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_opendota_matches_start_time ON opendota_matches(start_time DESC)"
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_opendota_matches_source ON opendota_matches(source)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_opendota_teams_name ON opendota_teams(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_opendota_leagues_name ON opendota_leagues(name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_replay_download_tasks_status ON replay_download_tasks(status)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_replay_download_tasks_created_at ON replay_download_tasks(created_at DESC)"
    )


def close_database() -> None:
    """Close the database connection."""
    global _connection
    if _connection:
        _connection.close()
        _connection = None


def _ensure_replay_download_task_columns(cursor: sqlite3.Cursor) -> None:
    """Ensure replay download task schema is upgraded in-place."""
    cursor.execute("PRAGMA table_info(replay_download_tasks)")
    columns = {str(row["name"]) for row in cursor.fetchall()}

    if "attempt_count" not in columns:
        cursor.execute(
            "ALTER TABLE replay_download_tasks ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0"
        )

    if "download_path" not in columns:
        cursor.execute("ALTER TABLE replay_download_tasks ADD COLUMN download_path TEXT")

    if "error_code" not in columns:
        cursor.execute("ALTER TABLE replay_download_tasks ADD COLUMN error_code TEXT")

    cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'replay_download_tasks'"
    )
    row = cursor.fetchone()
    table_sql = str(row["sql"]).lower() if row and row["sql"] else ""
    supports_new_statuses = "downloading" in table_sql and "completed" in table_sql

    if not supports_new_statuses:
        cursor.execute("ALTER TABLE replay_download_tasks RENAME TO replay_download_tasks_legacy")
        cursor.execute(
            """
            CREATE TABLE replay_download_tasks (
                task_id TEXT PRIMARY KEY,
                match_id INTEGER NOT NULL,
                status TEXT NOT NULL
                    CHECK(status IN ('pending', 'prepared', 'downloading', 'completed', 'failed')),
                attempt_count INTEGER NOT NULL DEFAULT 0,
                replay_url TEXT,
                download_path TEXT,
                error_code TEXT,
                error_message TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO replay_download_tasks (
                task_id,
                match_id,
                status,
                attempt_count,
                replay_url,
                download_path,
                error_code,
                error_message,
                created_at,
                updated_at
            )
            SELECT
                task_id,
                match_id,
                status,
                COALESCE(attempt_count, 0),
                replay_url,
                download_path,
                NULL,
                error_message,
                created_at,
                updated_at
            FROM replay_download_tasks_legacy
            """
        )
        cursor.execute("DROP TABLE replay_download_tasks_legacy")


def _ensure_opendota_match_columns(cursor: sqlite3.Cursor) -> None:
    """Ensure opendota_matches supports source/name/icon fields in-place."""
    cursor.execute("PRAGMA table_info(opendota_matches)")
    columns = {str(row["name"]) for row in cursor.fetchall()}

    if "source" not in columns:
        cursor.execute(
            "ALTER TABLE opendota_matches ADD COLUMN source TEXT NOT NULL DEFAULT 'pro'"
        )

    if "radiant_team_name" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN radiant_team_name TEXT")

    if "dire_team_name" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN dire_team_name TEXT")

    if "league_name" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN league_name TEXT")

    if "radiant_logo_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN radiant_logo_url TEXT")

    if "dire_logo_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN dire_logo_url TEXT")

    if "radiant_icon_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN radiant_icon_url TEXT")

    if "dire_icon_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN dire_icon_url TEXT")

    if "league_icon_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN league_icon_url TEXT")

    if "league_logo_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN league_logo_url TEXT")

    if "league_image_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN league_image_url TEXT")

    if "league_banner_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN league_banner_url TEXT")

    if "radiant_logo_sponsor_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN radiant_logo_sponsor_url TEXT")

    if "dire_logo_sponsor_url" not in columns:
        cursor.execute("ALTER TABLE opendota_matches ADD COLUMN dire_logo_sponsor_url TEXT")

    cursor.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'opendota_matches'")
    row = cursor.fetchone()
    table_sql = str(row["sql"]).lower() if row and row["sql"] else ""
    has_source_check = "check(sourcein('pro','public'))" in table_sql.replace(" ", "")

    if not has_source_check:
        cursor.execute("ALTER TABLE opendota_matches RENAME TO opendota_matches_legacy")
        cursor.execute(
            """
            CREATE TABLE opendota_matches (
                match_id INTEGER PRIMARY KEY,
                start_time INTEGER NOT NULL DEFAULT 0,
                duration INTEGER NOT NULL DEFAULT 0,
                radiant_team_id INTEGER,
                dire_team_id INTEGER,
                leagueid INTEGER,
                source TEXT NOT NULL DEFAULT 'pro' CHECK(source IN ('pro','public')),
                radiant_team_name TEXT,
                dire_team_name TEXT,
                league_name TEXT,
                radiant_icon_url TEXT,
                dire_icon_url TEXT,
                radiant_logo_url TEXT,
                dire_logo_url TEXT,
                league_icon_url TEXT,
                league_logo_url TEXT,
                league_image_url TEXT,
                league_banner_url TEXT,
                radiant_logo_sponsor_url TEXT,
                dire_logo_sponsor_url TEXT,
                last_synced_at INTEGER NOT NULL
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO opendota_matches (
                match_id,
                start_time,
                duration,
                radiant_team_id,
                dire_team_id,
                leagueid,
                source,
                radiant_team_name,
                dire_team_name,
                league_name,
                radiant_icon_url,
                dire_icon_url,
                radiant_logo_url,
                dire_logo_url,
                league_icon_url,
                league_logo_url,
                league_image_url,
                league_banner_url,
                radiant_logo_sponsor_url,
                dire_logo_sponsor_url,
                last_synced_at
            )
            SELECT
                match_id,
                COALESCE(start_time, 0),
                COALESCE(duration, 0),
                radiant_team_id,
                dire_team_id,
                leagueid,
                CASE
                    WHEN source IN ('pro', 'public') THEN source
                    ELSE 'pro'
                END,
                radiant_team_name,
                dire_team_name,
                league_name,
                NULL,  -- radiant_icon_url
                NULL,  -- dire_icon_url
                radiant_logo_url,
                dire_logo_url,
                league_icon_url,
                NULL,  -- league_logo_url
                NULL,  -- league_image_url
                NULL,  -- league_banner_url
                NULL,  -- radiant_logo_sponsor_url
                NULL,  -- dire_logo_sponsor_url
                last_synced_at
            FROM opendota_matches_legacy
            """
        )
        cursor.execute("DROP TABLE opendota_matches_legacy")


def _ensure_opendota_reference_columns(cursor: sqlite3.Cursor) -> None:
    """Ensure opendota reference tables support icon/logo fields."""
    cursor.execute("PRAGMA table_info(opendota_teams)")
    team_columns = {str(row["name"]) for row in cursor.fetchall()}
    if "icon_url" not in team_columns:
        cursor.execute("ALTER TABLE opendota_teams ADD COLUMN icon_url TEXT")

    if "logo_url" not in team_columns:
        cursor.execute("ALTER TABLE opendota_teams ADD COLUMN logo_url TEXT")

    if "logo_sponsor_url" not in team_columns:
        cursor.execute("ALTER TABLE opendota_teams ADD COLUMN logo_sponsor_url TEXT")

    cursor.execute("PRAGMA table_info(opendota_leagues)")
    league_columns = {str(row["name"]) for row in cursor.fetchall()}
    if "icon_url" not in league_columns:
        cursor.execute("ALTER TABLE opendota_leagues ADD COLUMN icon_url TEXT")

    if "logo_url" not in league_columns:
        cursor.execute("ALTER TABLE opendota_leagues ADD COLUMN logo_url TEXT")

    if "image_url" not in league_columns:
        cursor.execute("ALTER TABLE opendota_leagues ADD COLUMN image_url TEXT")

    if "banner_url" not in league_columns:
        cursor.execute("ALTER TABLE opendota_leagues ADD COLUMN banner_url TEXT")

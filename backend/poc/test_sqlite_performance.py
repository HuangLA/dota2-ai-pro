"""
POC Test: SQLite Performance for Metadata Storage
Target: Verify metadata queries are fast enough (< 50ms for indexed queries)
"""

import random
import sqlite3
import time
from pathlib import Path


def init_test_db(db_path: Path) -> sqlite3.Connection:
    """Initialize test database with schema."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Apply optimizations
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.execute("PRAGMA cache_size = -64000;")
    
    # Create tables
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS matches (
            match_id INTEGER PRIMARY KEY,
            start_time INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            winner_team INTEGER,
            radiant_score INTEGER DEFAULT 0,
            dire_score INTEGER DEFAULT 0,
            league_id INTEGER,
            patch_version TEXT,
            parse_status TEXT DEFAULT 'completed'
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS player_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            hero_id INTEGER NOT NULL,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            gpm INTEGER DEFAULT 0,
            xpm INTEGER DEFAULT 0,
            FOREIGN KEY (match_id) REFERENCES matches(match_id)
        )
    """)
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_time ON matches(start_time DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_match_league ON matches(league_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_account ON player_matches(account_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_hero ON player_matches(hero_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_player_match ON player_matches(match_id)")
    
    conn.commit()
    return conn


def insert_test_data(conn: sqlite3.Connection, num_matches: int = 500) -> dict:
    """Insert test data."""
    print(f"Inserting {num_matches} matches with player data...")
    
    cursor = conn.cursor()
    
    start = time.perf_counter()
    
    # Generate matches
    base_time = 1700000000
    matches = []
    for i in range(num_matches):
        matches.append((
            8000000000 + i,  # match_id
            base_time + i * 3600,  # start_time
            random.randint(1200, 3600),  # duration
            random.choice([2, 3]),  # winner_team
            random.randint(10, 60),  # radiant_score
            random.randint(10, 60),  # dire_score
            random.choice([None, 15728, 15729, 15730]),  # league_id
            random.choice(['7.35a', '7.35b', '7.35c', '7.36']),  # patch_version
        ))
    
    cursor.executemany("""
        INSERT OR IGNORE INTO matches 
        (match_id, start_time, duration, winner_team, radiant_score, dire_score, league_id, patch_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, matches)
    
    # Generate player matches (10 players per match)
    player_matches = []
    hero_pool = list(range(1, 130))  # ~130 heroes
    account_pool = [100000000 + i for i in range(50)]  # 50 unique players
    
    for match_id, *_ in matches:
        selected_heroes = random.sample(hero_pool, 10)
        selected_accounts = random.sample(account_pool, 10)
        
        for idx, (account_id, hero_id) in enumerate(zip(selected_accounts, selected_heroes)):
            player_matches.append((
                match_id,
                account_id,
                hero_id,
                random.randint(0, 20),  # kills
                random.randint(0, 15),  # deaths
                random.randint(0, 30),  # assists
                random.randint(200, 800),  # gpm
                random.randint(200, 800),  # xpm
            ))
    
    cursor.executemany("""
        INSERT OR IGNORE INTO player_matches 
        (match_id, account_id, hero_id, kills, deaths, assists, gpm, xpm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, player_matches)
    
    conn.commit()
    insert_time = time.perf_counter() - start
    
    return {
        'matches_inserted': len(matches),
        'player_records_inserted': len(player_matches),
        'insert_time_ms': insert_time * 1000,
    }


def test_queries(conn: sqlite3.Connection) -> dict:
    """Test various query patterns."""
    cursor = conn.cursor()
    results = {}
    
    # Test 1: List recent matches (paginated)
    print("\nTest 1: List recent matches (limit 20)...")
    start = time.perf_counter()
    cursor.execute("""
        SELECT * FROM matches 
        ORDER BY start_time DESC 
        LIMIT 20 OFFSET 0
    """)
    rows = cursor.fetchall()
    results['list_matches'] = {
        'time_ms': (time.perf_counter() - start) * 1000,
        'rows': len(rows),
    }
    print(f"  Time: {results['list_matches']['time_ms']:.2f} ms, Rows: {len(rows)}")
    
    # Test 2: Filter by league
    print("\nTest 2: Filter by league_id...")
    start = time.perf_counter()
    cursor.execute("""
        SELECT * FROM matches 
        WHERE league_id = 15728
        ORDER BY start_time DESC
    """)
    rows = cursor.fetchall()
    results['filter_league'] = {
        'time_ms': (time.perf_counter() - start) * 1000,
        'rows': len(rows),
    }
    print(f"  Time: {results['filter_league']['time_ms']:.2f} ms, Rows: {len(rows)}")
    
    # Test 3: Player match history
    print("\nTest 3: Player match history (account_id)...")
    start = time.perf_counter()
    cursor.execute("""
        SELECT pm.*, m.start_time, m.duration
        FROM player_matches pm
        JOIN matches m ON pm.match_id = m.match_id
        WHERE pm.account_id = 100000005
        ORDER BY m.start_time DESC
        LIMIT 50
    """)
    rows = cursor.fetchall()
    results['player_history'] = {
        'time_ms': (time.perf_counter() - start) * 1000,
        'rows': len(rows),
    }
    print(f"  Time: {results['player_history']['time_ms']:.2f} ms, Rows: {len(rows)}")
    
    # Test 4: Hero statistics
    print("\nTest 4: Hero statistics (aggregation)...")
    start = time.perf_counter()
    cursor.execute("""
        SELECT 
            hero_id,
            COUNT(*) as games,
            AVG(kills) as avg_kills,
            AVG(deaths) as avg_deaths,
            AVG(gpm) as avg_gpm
        FROM player_matches
        GROUP BY hero_id
        ORDER BY games DESC
        LIMIT 20
    """)
    rows = cursor.fetchall()
    results['hero_stats'] = {
        'time_ms': (time.perf_counter() - start) * 1000,
        'rows': len(rows),
    }
    print(f"  Time: {results['hero_stats']['time_ms']:.2f} ms, Rows: {len(rows)}")
    
    # Test 5: Full text match details with players
    print("\nTest 5: Match details with all players...")
    start = time.perf_counter()
    cursor.execute("""
        SELECT m.*, pm.*
        FROM matches m
        JOIN player_matches pm ON m.match_id = pm.match_id
        WHERE m.match_id = 8000000050
    """)
    rows = cursor.fetchall()
    results['match_details'] = {
        'time_ms': (time.perf_counter() - start) * 1000,
        'rows': len(rows),
    }
    print(f"  Time: {results['match_details']['time_ms']:.2f} ms, Rows: {len(rows)}")
    
    return results


def run_poc_tests() -> dict:
    """Run all SQLite POC tests."""
    print("=" * 60)
    print("POC Test: SQLite Metadata Performance")
    print("=" * 60)
    
    db_path = Path(__file__).parent.parent.parent / 'data' / 'poc_test' / 'test.db'
    
    # Clean up previous test
    if db_path.exists():
        db_path.unlink()
    
    # Initialize database
    print("\nInitializing database...")
    conn = init_test_db(db_path)
    
    # Insert test data
    insert_results = insert_test_data(conn, num_matches=500)
    print(f"\nInsert time: {insert_results['insert_time_ms']:.2f} ms")
    print(f"Matches: {insert_results['matches_inserted']}")
    print(f"Player records: {insert_results['player_records_inserted']}")
    
    # Run query tests
    query_results = test_queries(conn)
    
    # Summary
    print("\n" + "=" * 60)
    print("Performance Verdict")
    print("=" * 60)
    
    targets = {
        'list_matches': 50,
        'filter_league': 50,
        'player_history': 50,
        'hero_stats': 100,
        'match_details': 50,
    }
    
    all_passed = True
    for test, target_ms in targets.items():
        actual_ms = query_results[test]['time_ms']
        passed = actual_ms < target_ms
        status = "PASS" if passed else "FAIL"
        print(f"  {test}: {actual_ms:.2f}ms (target < {target_ms}ms) [{status}]")
        if not passed:
            all_passed = False
    
    print(f"\nOverall: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    
    conn.close()
    
    return {
        'insert': insert_results,
        'queries': query_results,
        'all_passed': all_passed,
    }


if __name__ == '__main__':
    run_poc_tests()

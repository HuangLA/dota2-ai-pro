"""
Test script for storage and parse service.

Tests:
1. Parquet storage save/load
2. Match storage save/load
3. Parse service full workflow
"""

import sys
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from parsers.clarity_parser import ClarityParser
from storage.parquet_storage import ParquetStorage
from storage.match_storage import MatchStorage
from database.sqlite_db import init_database, close_database
from services.parse_service import ParseService


def test_parquet_storage():
    """Test Parquet storage functionality."""
    print("\n" + "=" * 60)
    print("Test 1: Parquet Storage")
    print("=" * 60)
    
    # First parse a replay
    parser = ClarityParser()
    replay_path = Path(r"N:\dota2-ai-pro\data\replays\8674716612.dem")
    
    if not replay_path.exists():
        print(f"[SKIP] Replay file not found: {replay_path}")
        return False
    
    print(f"Parsing replay: {replay_path.name}")
    start = time.time()
    result = parser.parse(str(replay_path))
    parse_time = time.time() - start
    
    if not result.success:
        print(f"[FAIL] Parse failed: {result.error}")
        return False
    
    print(f"[OK] Parsed in {parse_time:.2f}s")
    print(f"     Match ID: {result.metadata.match_id}")
    print(f"     Positions: {len(result.positions)}")
    print(f"     Kills: {len(result.kills)}")
    print(f"     Wards: {len(result.wards)}")
    
    # Test storage
    storage = ParquetStorage("backend/data/matches")
    
    print("\nSaving to Parquet...")
    start = time.time()
    success = storage.save_parse_result(result)
    save_time = time.time() - start
    
    if not success:
        print("[FAIL] Failed to save to Parquet")
        return False
    
    print(f"[OK] Saved in {save_time:.2f}s")
    
    # Get storage stats
    stats = storage.get_storage_stats(result.metadata.match_id)
    print(f"     Total size: {stats['total_size_kb']:.2f} KB")
    for fname, finfo in stats['files'].items():
        print(f"       {fname}: {finfo['size_kb']:.2f} KB")
    
    # Test loading
    print("\nLoading from Parquet...")
    
    # Load positions
    start = time.time()
    positions_df = storage.get_positions(result.metadata.match_id)
    load_time = time.time() - start
    print(f"[OK] Loaded positions in {load_time*1000:.2f}ms ({len(positions_df)} rows)")
    
    # Load with filter
    start = time.time()
    radiant_df = storage.get_positions(result.metadata.match_id, team=2)
    filter_time = time.time() - start
    print(f"[OK] Filtered Radiant positions in {filter_time*1000:.2f}ms ({len(radiant_df)} rows)")
    
    # Load kills
    kills_df = storage.get_kills(result.metadata.match_id)
    print(f"[OK] Loaded kills: {len(kills_df)} rows")
    
    # Load wards
    wards_df = storage.get_wards(result.metadata.match_id)
    print(f"[OK] Loaded wards: {len(wards_df)} rows")
    
    # Load metadata
    meta = storage.get_metadata(result.metadata.match_id)
    print(f"[OK] Loaded metadata: match_id={meta['match_id']}")
    
    return True


def test_match_storage():
    """Test SQLite match storage."""
    print("\n" + "=" * 60)
    print("Test 2: Match Storage (SQLite)")
    print("=" * 60)
    
    # Initialize database
    db_path = "data/test_matches.db"
    init_database(db_path)
    
    # Parse a replay
    parser = ClarityParser()
    replay_path = str(Path(r"N:\dota2-ai-pro\data\replays\8674716612.dem"))
    
    result = parser.parse(replay_path)
    if not result.success:
        print(f"[FAIL] Parse failed")
        return False
    
    # Save to SQLite
    match_storage = MatchStorage()
    
    print("Saving match metadata to SQLite...")
    success = match_storage.save_from_parse_result(result, replay_path)
    
    if not success:
        print("[FAIL] Failed to save to SQLite")
        return False
    
    print(f"[OK] Saved match {result.metadata.match_id}")
    
    # Retrieve match
    match = match_storage.get_match(result.metadata.match_id)
    if not match:
        print("[FAIL] Failed to retrieve match")
        return False
    
    print(f"[OK] Retrieved match:")
    print(f"     Match ID: {match.match_id}")
    print(f"     Duration: {match.duration}s")
    print(f"     Winner: {'Radiant' if match.winner_team == 2 else 'Dire'}")
    print(f"     Status: {match.parse_status}")
    
    # List matches
    matches = match_storage.list_matches(limit=5)
    print(f"[OK] Listed {len(matches)} matches")
    
    # Count
    count = match_storage.count_matches()
    print(f"[OK] Total matches: {count}")
    
    close_database()
    return True


def test_parse_service():
    """Test full parse service workflow."""
    print("\n" + "=" * 60)
    print("Test 3: Parse Service (Full Workflow)")
    print("=" * 60)
    
    # Initialize database
    db_path = "data/truesight.db"
    init_database(db_path)
    
    # Create parse service
    service = ParseService()
    
    replay_path = str(Path(r"N:\dota2-ai-pro\data\replays\8674716612.dem"))
    
    # Test validation
    print("Testing replay validation...")
    valid, msg = service.validate_replay_path(replay_path)
    print(f"[OK] Validation: {msg}")
    
    # Test task creation
    print("\nCreating parse task...")
    task_id = service.create_parse_task(replay_path)
    print(f"[OK] Created task: {task_id}")
    
    # Get task
    task = service.get_task(task_id)
    print(f"[OK] Task status: {task.status.value}")
    
    # Run task
    print("\nRunning parse task (this may take a few seconds)...")
    start = time.time()
    result = service.run_task(task_id)
    total_time = time.time() - start
    
    if result.success:
        print(f"[OK] Task completed in {total_time:.2f}s")
        print(f"     Match ID: {result.metadata.match_id}")
        print(f"     Winner: {result.metadata.winner_name}")
    else:
        print(f"[FAIL] Task failed: {result.error}")
        return False
    
    # Check task status
    task = service.get_task(task_id)
    print(f"[OK] Final task status: {task.status.value}")
    
    # List tasks
    tasks = service.list_tasks(limit=5)
    print(f"[OK] Listed {len(tasks)} tasks")
    
    close_database()
    return True


def main():
    """Run all tests."""
    print("=" * 60)
    print("Storage & Parse Service Tests")
    print("=" * 60)
    
    results = []
    
    # Test 1: Parquet storage
    try:
        results.append(("Parquet Storage", test_parquet_storage()))
    except Exception as e:
        print(f"[ERROR] Parquet test failed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Parquet Storage", False))
    
    # Test 2: SQLite storage
    try:
        results.append(("Match Storage", test_match_storage()))
    except Exception as e:
        print(f"[ERROR] SQLite test failed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Match Storage", False))
    
    # Test 3: Parse service
    try:
        results.append(("Parse Service", test_parse_service()))
    except Exception as e:
        print(f"[ERROR] Parse service test failed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Parse Service", False))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)
    
    for name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status} {name}")
    
    passed = sum(1 for _, p in results if p)
    print(f"\nTotal: {passed}/{len(results)} tests passed")
    
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())

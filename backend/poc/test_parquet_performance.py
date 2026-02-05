"""
POC Test: Parquet Read/Write Performance
Target: Verify Parquet can handle 100K+ rows with good performance
"""

import time
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq


def generate_mock_tick_data(num_ticks: int = 100_000) -> pd.DataFrame:
    """
    Generate mock tick data simulating a 45-minute match.
    ~81,000 ticks for 45 min at 30 ticks/sec, 10 heroes = 810,000 rows
    For POC, we test with 100K rows.
    """
    print(f"Generating {num_ticks:,} mock tick records...")
    
    np.random.seed(42)
    
    # Generate data
    data = {
        'tick': np.repeat(np.arange(num_ticks // 10), 10),
        'time': np.repeat(np.arange(num_ticks // 10) // 30, 10),  # 30 ticks per second
        'hero_id': np.tile(np.arange(1, 11), num_ticks // 10),
        'player_slot': np.tile(np.arange(10), num_ticks // 10),
        'x': np.random.uniform(0, 16384, num_ticks).astype(np.float32),
        'y': np.random.uniform(0, 16384, num_ticks).astype(np.float32),
        'hp': np.random.randint(0, 3000, num_ticks).astype(np.int16),
        'mana': np.random.randint(0, 2000, num_ticks).astype(np.int16),
        'gold': np.random.randint(0, 50000, num_ticks).astype(np.int32),
        'net_worth': np.random.randint(0, 80000, num_ticks).astype(np.int32),
        'level': np.random.randint(1, 31, num_ticks).astype(np.int8),
        'is_alive': np.random.choice([True, False], num_ticks, p=[0.85, 0.15]),
    }
    
    return pd.DataFrame(data)


def test_parquet_write(df: pd.DataFrame, output_path: Path) -> dict:
    """Test Parquet write performance."""
    print(f"\nWriting {len(df):,} rows to Parquet...")
    
    # Ensure directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write with Snappy compression
    start = time.perf_counter()
    table = pa.Table.from_pandas(df)
    pq.write_table(table, output_path, compression='snappy')
    write_time = time.perf_counter() - start
    
    file_size = output_path.stat().st_size / (1024 * 1024)  # MB
    
    result = {
        'rows': len(df),
        'write_time_ms': write_time * 1000,
        'file_size_mb': file_size,
        'rows_per_second': len(df) / write_time,
    }
    
    print(f"  Write time: {result['write_time_ms']:.2f} ms")
    print(f"  File size: {result['file_size_mb']:.2f} MB")
    print(f"  Throughput: {result['rows_per_second']:,.0f} rows/sec")
    
    return result


def test_parquet_read(file_path: Path) -> dict:
    """Test Parquet read performance."""
    print(f"\nReading Parquet file...")
    
    # Full read
    start = time.perf_counter()
    df = pd.read_parquet(file_path)
    read_time = time.perf_counter() - start
    
    result = {
        'rows': len(df),
        'read_time_ms': read_time * 1000,
        'rows_per_second': len(df) / read_time,
    }
    
    print(f"  Read time: {result['read_time_ms']:.2f} ms")
    print(f"  Rows read: {result['rows']:,}")
    print(f"  Throughput: {result['rows_per_second']:,.0f} rows/sec")
    
    return result


def test_parquet_filtered_read(file_path: Path, hero_id: int = 1) -> dict:
    """Test filtered read (simulating hero-specific query)."""
    print(f"\nFiltered read (hero_id={hero_id})...")
    
    start = time.perf_counter()
    df = pd.read_parquet(
        file_path,
        filters=[('hero_id', '==', hero_id)],
    )
    read_time = time.perf_counter() - start
    
    result = {
        'rows': len(df),
        'read_time_ms': read_time * 1000,
    }
    
    print(f"  Read time: {result['read_time_ms']:.2f} ms")
    print(f"  Rows returned: {result['rows']:,}")
    
    return result


def test_duckdb_aggregation(file_path: Path) -> dict:
    """Test DuckDB aggregation query (heatmap generation)."""
    print("\nDuckDB aggregation query (heatmap)...")
    
    import duckdb
    
    conn = duckdb.connect(':memory:')
    
    query = f"""
    SELECT 
        FLOOR(x / 128) * 128 AS grid_x,
        FLOOR(y / 128) * 128 AS grid_y,
        COUNT(*) AS density
    FROM '{file_path}'
    WHERE hero_id = 1 AND time BETWEEN 0 AND 600
    GROUP BY grid_x, grid_y
    ORDER BY density DESC
    LIMIT 100
    """
    
    start = time.perf_counter()
    result_df = conn.execute(query).fetchdf()
    query_time = time.perf_counter() - start
    
    result = {
        'query_time_ms': query_time * 1000,
        'result_rows': len(result_df),
    }
    
    print(f"  Query time: {result['query_time_ms']:.2f} ms")
    print(f"  Result rows: {result['result_rows']}")
    
    return result


def run_poc_tests() -> dict:
    """Run all POC tests and return results."""
    print("=" * 60)
    print("POC Test: Parquet Read/Write Performance")
    print("=" * 60)
    
    output_dir = Path(__file__).parent.parent.parent / 'data' / 'poc_test'
    output_file = output_dir / 'test_ticks.parquet'
    
    results = {}
    
    # Generate test data
    df = generate_mock_tick_data(100_000)
    results['data_generation'] = {'rows': len(df)}
    
    # Test write
    results['write'] = test_parquet_write(df, output_file)
    
    # Test full read
    results['read'] = test_parquet_read(output_file)
    
    # Test filtered read
    results['filtered_read'] = test_parquet_filtered_read(output_file)
    
    # Test DuckDB aggregation
    results['duckdb_aggregation'] = test_duckdb_aggregation(output_file)
    
    # Summary
    print("\n" + "=" * 60)
    print("POC Test Summary")
    print("=" * 60)
    print(f"  Data rows: {results['data_generation']['rows']:,}")
    print(f"  Write: {results['write']['write_time_ms']:.2f} ms ({results['write']['file_size_mb']:.2f} MB)")
    print(f"  Full read: {results['read']['read_time_ms']:.2f} ms")
    print(f"  Filtered read: {results['filtered_read']['read_time_ms']:.2f} ms")
    print(f"  DuckDB heatmap: {results['duckdb_aggregation']['query_time_ms']:.2f} ms")
    
    # Verdict
    print("\n" + "=" * 60)
    print("Performance Verdict")
    print("=" * 60)
    
    targets = {
        'write': 5000,  # < 5 seconds for 100K rows
        'read': 1000,   # < 1 second
        'filtered_read': 500,  # < 500ms
        'duckdb_aggregation': 500,  # < 500ms (heatmap target)
    }
    
    all_passed = True
    for test, target_ms in targets.items():
        actual_ms = results[test].get('write_time_ms') or results[test].get('read_time_ms') or results[test].get('query_time_ms')
        passed = actual_ms < target_ms
        status = "PASS" if passed else "FAIL"
        print(f"  {test}: {actual_ms:.2f}ms (target < {target_ms}ms) [{status}]")
        if not passed:
            all_passed = False
    
    results['all_passed'] = all_passed
    print(f"\nOverall: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    
    return results


if __name__ == '__main__':
    run_poc_tests()

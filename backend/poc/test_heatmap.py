"""
Test script for heatmap generation performance.

Performance target: < 500ms for single match heatmap generation.
"""

import sys
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from storage.parquet_storage import ParquetStorage
from analyzers.heatmap_analyzer import HeatmapAnalyzer


def test_heatmap_performance():
    """Test heatmap generation performance."""
    print("=" * 60)
    print("Heatmap Generation Performance Test")
    print("=" * 60)
    
    # Initialize
    storage = ParquetStorage("data/matches")
    analyzer = HeatmapAnalyzer(storage)
    
    # Get available matches
    matches = storage.list_matches()
    if not matches:
        print("No parsed matches found. Please parse a replay first.")
        return
    
    match_id = matches[0]
    print(f"\nTesting with Match ID: {match_id}")
    
    # Get match info
    meta = storage.get_metadata(match_id)
    if meta:
        print(f"Duration: {meta.get('duration_seconds', 'N/A')} seconds")
    
    positions_df = storage.get_positions(match_id)
    print(f"Total position samples: {len(positions_df)}")
    
    # Test 1: Full match movement heatmap (64x64 grid)
    print("\n" + "-" * 40)
    print("Test 1: Movement Heatmap (64x64 grid)")
    print("-" * 40)
    
    start = time.perf_counter()
    result = analyzer.generate_movement_heatmap(
        match_id=match_id,
        grid_size=64
    )
    elapsed = (time.perf_counter() - start) * 1000
    
    print(f"Grid size: {result.grid_size}x{result.grid_size}")
    print(f"Cells with data: {len(result.cells)}")
    print(f"Max density: {result.max_density}")
    print(f"Total samples: {result.total_samples}")
    print(f"Generation time: {result.generation_time_ms:.2f} ms")
    print(f"Total elapsed: {elapsed:.2f} ms")
    print(f"Status: {'PASS' if elapsed < 500 else 'FAIL'} (target < 500ms)")
    
    # Test 2: Larger grid (128x128)
    print("\n" + "-" * 40)
    print("Test 2: Movement Heatmap (128x128 grid)")
    print("-" * 40)
    
    start = time.perf_counter()
    result = analyzer.generate_movement_heatmap(
        match_id=match_id,
        grid_size=128
    )
    elapsed = (time.perf_counter() - start) * 1000
    
    print(f"Grid size: {result.grid_size}x{result.grid_size}")
    print(f"Cells with data: {len(result.cells)}")
    print(f"Max density: {result.max_density}")
    print(f"Generation time: {result.generation_time_ms:.2f} ms")
    print(f"Total elapsed: {elapsed:.2f} ms")
    print(f"Status: {'PASS' if elapsed < 500 else 'FAIL'} (target < 500ms)")
    
    # Test 3: Single team filter
    print("\n" + "-" * 40)
    print("Test 3: Movement Heatmap (Radiant only)")
    print("-" * 40)
    
    start = time.perf_counter()
    result = analyzer.generate_movement_heatmap(
        match_id=match_id,
        grid_size=64,
        team=2  # Radiant
    )
    elapsed = (time.perf_counter() - start) * 1000
    
    print(f"Team: Radiant (2)")
    print(f"Cells with data: {len(result.cells)}")
    print(f"Total samples: {result.total_samples}")
    print(f"Generation time: {result.generation_time_ms:.2f} ms")
    print(f"Total elapsed: {elapsed:.2f} ms")
    print(f"Status: {'PASS' if elapsed < 500 else 'FAIL'} (target < 500ms)")
    
    # Test 4: Single hero filter
    print("\n" + "-" * 40)
    print("Test 4: Movement Heatmap (Single hero)")
    print("-" * 40)
    
    # Get a hero name from positions
    if not positions_df.empty:
        hero_name = positions_df["hero"].iloc[0]
        
        start = time.perf_counter()
        result = analyzer.generate_movement_heatmap(
            match_id=match_id,
            grid_size=64,
            hero=hero_name
        )
        elapsed = (time.perf_counter() - start) * 1000
        
        print(f"Hero: {hero_name}")
        print(f"Cells with data: {len(result.cells)}")
        print(f"Total samples: {result.total_samples}")
        print(f"Generation time: {result.generation_time_ms:.2f} ms")
        print(f"Total elapsed: {elapsed:.2f} ms")
        print(f"Status: {'PASS' if elapsed < 500 else 'FAIL'} (target < 500ms)")
    
    # Test 5: Time range filter
    print("\n" + "-" * 40)
    print("Test 5: Movement Heatmap (First 10 minutes)")
    print("-" * 40)
    
    start = time.perf_counter()
    result = analyzer.generate_movement_heatmap(
        match_id=match_id,
        grid_size=64,
        start_time=0,
        end_time=600  # First 10 minutes
    )
    elapsed = (time.perf_counter() - start) * 1000
    
    print(f"Time range: 0-600 seconds")
    print(f"Cells with data: {len(result.cells)}")
    print(f"Total samples: {result.total_samples}")
    print(f"Generation time: {result.generation_time_ms:.2f} ms")
    print(f"Total elapsed: {elapsed:.2f} ms")
    print(f"Status: {'PASS' if elapsed < 500 else 'FAIL'} (target < 500ms)")
    
    # Test 6: Kill heatmap
    print("\n" + "-" * 40)
    print("Test 6: Kill Heatmap (64x64 grid)")
    print("-" * 40)
    
    start = time.perf_counter()
    result = analyzer.generate_kill_heatmap(
        match_id=match_id,
        grid_size=64
    )
    elapsed = (time.perf_counter() - start) * 1000
    
    print(f"Cells with data: {len(result.cells)}")
    print(f"Total kills: {result.total_samples}")
    print(f"Generation time: {result.generation_time_ms:.2f} ms")
    print(f"Total elapsed: {elapsed:.2f} ms")
    print(f"Status: {'PASS' if elapsed < 500 else 'FAIL'} (target < 500ms)")
    
    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print("All tests completed. Check individual test results above.")
    print(f"Performance target: < 500ms per heatmap generation")


def test_api_endpoint():
    """Test the API endpoint directly."""
    import httpx
    
    print("\n" + "=" * 60)
    print("API Endpoint Test")
    print("=" * 60)
    
    base_url = "http://localhost:8000/api/v1/visualization"
    
    # Get matches first
    try:
        matches_resp = httpx.get("http://localhost:8000/api/v1/matches", timeout=10)
        matches = matches_resp.json().get("data", [])
        
        if not matches:
            print("No matches found")
            return
        
        match_id = matches[0]["match_id"]
        print(f"Testing with Match ID: {match_id}")
        
        # Test heatmap endpoint
        start = time.perf_counter()
        resp = httpx.get(
            f"{base_url}/{match_id}/heatmap",
            params={"grid_size": 64, "heatmap_type": "movement"},
            timeout=30
        )
        elapsed = (time.perf_counter() - start) * 1000
        
        if resp.status_code == 200:
            data = resp.json()
            grid_data = data.get("data", {}).get("grid_data", [])
            max_density = data.get("data", {}).get("max_density", 0)
            gen_time = data.get("meta", {}).get("generation_time_ms", 0)
            
            print(f"Status: {resp.status_code}")
            print(f"Cells with data: {len(grid_data)}")
            print(f"Max density: {max_density}")
            print(f"Server generation time: {gen_time:.2f} ms")
            print(f"Total request time: {elapsed:.2f} ms")
            print(f"Status: {'PASS' if elapsed < 1000 else 'FAIL'} (target < 1000ms including network)")
        else:
            print(f"Error: {resp.status_code}")
            print(resp.text)
            
    except httpx.ConnectError:
        print("Cannot connect to backend server at localhost:8000")
        print("Please start the server: uvicorn main:app --reload --port 8000")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    test_heatmap_performance()
    
    # Uncomment to test API endpoint (requires running server)
    # test_api_endpoint()

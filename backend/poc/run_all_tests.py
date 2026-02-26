#!/usr/bin/env python3
"""
POC Test Runner - Run all technical verification tests
Usage: python run_all_tests.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def print_header(title: str) -> None:
    """Print formatted header."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def run_parquet_test() -> dict:
    """Run Parquet performance test."""
    print_header("TEST 1: Parquet + DuckDB Performance")
    try:
        from poc.test_parquet_performance import run_poc_tests
        return run_poc_tests()
    except ImportError as e:
        print(f"ERROR: Missing dependency - {e}")
        print("Install with: pip install pandas pyarrow duckdb numpy")
        return {"error": str(e), "all_passed": False}


def run_sqlite_test() -> dict:
    """Run SQLite performance test."""
    print_header("TEST 2: SQLite Metadata Performance")
    try:
        from poc.test_sqlite_performance import run_poc_tests
        return run_poc_tests()
    except ImportError as e:
        print(f"ERROR: Missing dependency - {e}")
        return {"error": str(e), "all_passed": False}


def run_pixijs_data_gen() -> dict:
    """Generate PixiJS test data."""
    print_header("TEST 3: Generate PixiJS Test Data")
    try:
        from poc.test_pixijs_data import run_data_generation
        run_data_generation()
        return {"all_passed": True}
    except Exception as e:
        print(f"ERROR: {e}")
        return {"error": str(e), "all_passed": False}


def check_dependencies() -> dict:
    """Check if all required dependencies are installed."""
    print_header("Dependency Check")
    
    dependencies = {
        "pandas": False,
        "numpy": False,
        "pyarrow": False,
        "duckdb": False,
        "fastapi": False,
        "uvicorn": False,
        "pydantic": False,
        "scikit-learn": False,
    }
    
    for dep in dependencies:
        try:
            __import__(dep.replace("-", "_"))
            dependencies[dep] = True
            print(f"  [OK] {dep}")
        except ImportError:
            print(f"  [MISSING] {dep}")
    
    all_installed = all(dependencies.values())
    if not all_installed:
        print("\nInstall missing dependencies with:")
        print("  pip install -r requirements.txt")
    
    return {"dependencies": dependencies, "all_installed": all_installed}


def main() -> None:
    """Run all POC tests."""
    print("\n" + "=" * 70)
    print("  TRUE SIGHT - POC TECHNICAL VERIFICATION")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    results = {
        "timestamp": datetime.now().isoformat(),
        "tests": {},
    }
    
    # 1. Check dependencies
    dep_result = check_dependencies()
    results["tests"]["dependencies"] = dep_result
    
    if not dep_result["all_installed"]:
        print("\n[!] Some dependencies are missing. Install them first.")
        print("    pip install -r requirements.txt")
        
        # Try to continue with available tests
        print("\n[*] Attempting to run available tests...\n")
    
    # 2. Run Parquet test
    try:
        parquet_result = run_parquet_test()
        results["tests"]["parquet"] = parquet_result
    except Exception as e:
        results["tests"]["parquet"] = {"error": str(e), "all_passed": False}
    
    # 3. Run SQLite test
    try:
        sqlite_result = run_sqlite_test()
        results["tests"]["sqlite"] = sqlite_result
    except Exception as e:
        results["tests"]["sqlite"] = {"error": str(e), "all_passed": False}
    
    # 4. Generate PixiJS data
    try:
        pixijs_result = run_pixijs_data_gen()
        results["tests"]["pixijs_data"] = pixijs_result
    except Exception as e:
        results["tests"]["pixijs_data"] = {"error": str(e), "all_passed": False}
    
    # Summary
    print_header("FINAL SUMMARY")
    
    all_passed = True
    for test_name, test_result in results["tests"].items():
        if test_name == "dependencies":
            status = "PASS" if test_result.get("all_installed") else "FAIL"
        else:
            status = "PASS" if test_result.get("all_passed") else "FAIL"
        
        if status == "FAIL":
            all_passed = False
        
        print(f"  {test_name}: {status}")
    
    print("\n" + "-" * 70)
    print(f"  OVERALL: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    print("-" * 70)
    
    # Save results
    output_dir = Path(__file__).parent.parent / "data" / "poc_test"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    results_file = output_dir / "poc_results.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n  Results saved to: {results_file}")
    
    # Next steps
    print("\n" + "=" * 70)
    print("  NEXT STEPS")
    print("=" * 70)
    print("""
  1. Frontend PixiJS Test:
     cd frontend && npm install && npm run dev
     -> Open http://localhost:5173
     -> Click "进入 POC 测试" -> "PixiJS Rendering"
     -> Run stress test with 1000+ units

  2. Backend API Test:
     cd backend && pip install -r requirements.txt
     python main.py
     -> Open http://localhost:8000/docs

  3. Parser POC (Clarity):
     - Download: https://github.com/skadistats/clarity
     - Build: ./gradlew build
     - Test with a .dem file
""")
    
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()

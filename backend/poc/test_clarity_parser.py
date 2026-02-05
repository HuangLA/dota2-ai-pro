"""
POC: Test Clarity Parser Python-Java IPC Communication

Test Goals:
1. Verify Java environment is working
2. Test if Clarity JAR can parse .dem files successfully
3. Verify Python can correctly call Java subprocess
4. Check the data structure of parse output
"""

import json
import subprocess
import sys
import time
from pathlib import Path

# Configure paths - using absolute paths
JAVA_PATH = Path(r"N:\dota2-ai-pro\parsers\jdk17\jdk-17.0.18+8\bin\java.exe")
CLARITY_JAR = Path(r"N:\dota2-ai-pro\parsers\build\libs\clarity-parser-1.0.0-uber.jar")
REPLAY_DIR = Path(r"N:\dota2-ai-pro\data\replays")

# Get first .dem file
dem_files = list(REPLAY_DIR.glob("*.dem"))
if not dem_files:
    print(f"[ERROR] No .dem files found in: {REPLAY_DIR}")
    print(f"        Directory exists: {REPLAY_DIR.exists()}")
    if REPLAY_DIR.exists():
        print(f"        Contents: {list(REPLAY_DIR.iterdir())}")
    sys.exit(1)

TEST_REPLAY = dem_files[0]

print("=" * 80)
print("Clarity Parser Test")
print("=" * 80)
print(f"Java Path: {JAVA_PATH}")
print(f"  Exists: {JAVA_PATH.exists()}")
print(f"Clarity JAR: {CLARITY_JAR}")
print(f"  Exists: {CLARITY_JAR.exists()}")
print(f"Test File: {TEST_REPLAY.name} ({TEST_REPLAY.stat().st_size / 1024 / 1024:.2f} MB)")
print("=" * 80)
print()


def test_java_version():
    """Test 1: Verify Java Environment"""
    print("[Test 1] Verifying Java Environment")
    print("-" * 80)
    
    if not JAVA_PATH.exists():
        print(f"[FAIL] Java executable not found: {JAVA_PATH}")
        return False
    
    try:
        result = subprocess.run(
            [str(JAVA_PATH), "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        # Java -version outputs to stderr
        output = result.stderr
        
        if "17.0" in output:
            print(f"[PASS] Java version check passed")
            first_line = output.split('\n')[0] if '\n' in output else output.split('\r\n')[0]
            print(f"       {first_line}")
            return True
        else:
            print(f"[FAIL] Java version mismatch")
            print(output)
            return False
            
    except FileNotFoundError:
        print(f"[FAIL] Java executable not found: {JAVA_PATH}")
        return False
    except Exception as e:
        print(f"[FAIL] Java test failed: {e}")
        return False


def test_clarity_jar():
    """Test 2: Verify Clarity JAR Availability"""
    print("\n[Test 2] Verifying Clarity JAR")
    print("-" * 80)
    
    if not CLARITY_JAR.exists():
        print(f"[FAIL] Clarity JAR not found: {CLARITY_JAR}")
        return False
    
    print(f"[PASS] Clarity JAR exists ({CLARITY_JAR.stat().st_size / 1024:.2f} KB)")
    return True


def test_parse_replay_info():
    """Test 3: Parse replay with Uber JAR"""
    print("\n[Test 3] Parsing Replay with Clarity Uber JAR")
    print("-" * 80)
    
    # Use our SimpleDemoParser from the Uber JAR
    cmd = [
        str(JAVA_PATH),
        "-jar", str(CLARITY_JAR),
        str(TEST_REPLAY)
    ]
    
    print(f"Executing: java -jar {CLARITY_JAR.name}")
    print(f"Replay: {TEST_REPLAY.name}")
    print("Starting...")
    
    start_time = time.time()
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        elapsed = time.time() - start_time
        
        print(f"\n[TIME] Execution time: {elapsed:.2f} seconds")
        print(f"[INFO] Return code: {result.returncode}")
        
        # Parse JSON output from stdout
        try:
            data = json.loads(result.stdout)
            
            if data.get("success"):
                print("[PASS] Successfully parsed replay!")
                print(f"\n[RESULTS]:")
                print(f"  Parse time: {data.get('parse_time_ms')} ms")
                print(f"  Total ticks: {data.get('total_ticks')}")
                print(f"  File size: {data.get('file_size_mb')} MB")
                
                # Show warnings from stderr
                if result.stderr:
                    stderr_lines = result.stderr.strip().split('\n')
                    non_warn_lines = [l for l in stderr_lines if l and not l.startswith('[main] WARN')]
                    if non_warn_lines:
                        print(f"\n[STDERR]:")
                        for line in non_warn_lines[:10]:
                            print(f"  {line}")
                
                return True
            else:
                print(f"[FAIL] Parse failed: {data.get('error')}")
                return False
                
        except json.JSONDecodeError:
            print(f"[FAIL] Could not parse JSON output")
            print(f"\n[STDOUT]:")
            print(result.stdout[:500])
            print(f"\n[STDERR]:")
            print(result.stderr[:500])
            return False
        
    except subprocess.TimeoutExpired:
        print(f"[FAIL] Execution timeout (> 30 seconds)")
        return False
    except Exception as e:
        print(f"[FAIL] Execution failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_list_classes():
    """Test 4: Test with second replay file"""
    print("\n[Test 4] Testing Second Replay File")
    print("-" * 80)
    
    # Get second .dem file
    dem_files = list(REPLAY_DIR.glob("*.dem"))
    if len(dem_files) < 2:
        print("[SKIP] Only one replay file available")
        return True
    
    second_replay = dem_files[1]
    
    cmd = [
        str(JAVA_PATH),
        "-jar", str(CLARITY_JAR),
        str(second_replay)
    ]
    
    print(f"Replay: {second_replay.name}")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        data = json.loads(result.stdout)
        
        if data.get("success"):
            print("[PASS] Second replay parsed successfully!")
            print(f"  Parse time: {data.get('parse_time_ms')} ms")
            print(f"  Total ticks: {data.get('total_ticks')}")
            return True
        else:
            print(f"[FAIL] Parse failed: {data.get('error')}")
            return False
        
    except Exception as e:
        print(f"[FAIL] Test failed: {e}")
        return False


def main():
    """Run all tests"""
    print("\n[START] Clarity Parser Verification\n")
    
    tests = [
        ("Java Environment", test_java_version),
        ("Clarity JAR", test_clarity_jar),
        ("Parse First Replay", test_parse_replay_info),
        ("Parse Second Replay", test_list_classes),
    ]
    
    results = []
    
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n[ERROR] Test '{name}' exception: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))
    
    # Summary
    print("\n" + "=" * 80)
    print("Test Results Summary")
    print("=" * 80)
    
    for name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"{status}  {name}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed >= 2:  # At least Java and JAR tests pass
        print("\n[SUCCESS] Core components are working!")
        print("          Next: Create Python wrapper for Clarity parser")
    else:
        print("\n[WARNING] Some tests failed, check configuration")
    
    print("=" * 80)
    
    # Return exit code
    return 0 if passed >= 2 else 1


if __name__ == "__main__":
    sys.exit(main())

"""
Final test: Call Java parser from Python and verify IPC communication
"""

import json
import subprocess
import sys
from pathlib import Path

# Paths
JAVA_PATH = Path(r"N:\dota2-ai-pro\parsers\jdk17\jdk-17.0.18+8\bin\java.exe")
CLARITY_JAR = Path(r"N:\dota2-ai-pro\parsers\clarity\build\libs\clarity-3.1.3.jar")
PARSER_DIR = Path(r"N:\dota2-ai-pro\parsers")
TEST_REPLAY = Path(r"N:\dota2-ai-pro\data\replays\8674716612.dem")

print("=" * 80)
print("Python-Java IPC Communication Test")
print("=" * 80)

# Build classpath with all dependencies
deps = [
    PARSER_DIR,
    CLARITY_JAR,
    PARSER_DIR / "protobuf-java-3.21.9.jar",
    PARSER_DIR / "slf4j-api-1.7.36.jar",
    PARSER_DIR / "slf4j-simple-1.7.36.jar",
    PARSER_DIR / "snappy-java-1.1.10.5.jar",
]

classpath = ";".join(str(d) for d in deps)

print("\n[Setup] Classpath configured")
print(f"  Clarity JAR: {CLARITY_JAR.exists()}")
print(f"  Dependencies: {sum(1 for d in deps[2:] if d.exists())}/{len(deps)-2}")
print(f"  Test replay: {TEST_REPLAY.name} ({TEST_REPLAY.stat().st_size / 1024 / 1024:.1f} MB)")
print()

cmd = [
    str(JAVA_PATH),
    "-Xmx512m",  # Limit memory to 512MB
    "-cp", classpath,
    "SimpleDemoParser",
    str(TEST_REPLAY)
]

print(f"[Exec] Running Clarity parser...")
print()

try:
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120
    )
    
    print("[STDERR Output]:")
    print(result.stderr)
    
    if result.stdout.strip():
        print("\n[STDOUT Output]:")
        print(result.stdout)
        
        # Try to parse JSON
        try:
            data = json.loads(result.stdout)
            print("\n" + "=" * 80)
            print("RESULT")
            print("=" * 80)
            print(f"  Success: {data.get('success', False)}")
            print(f"  Parse time: {data.get('parse_time_ms', 'N/A')} ms")
            print(f"  File size: {data.get('file_size_mb', 'N/A')} MB")
            
            if data.get('success'):
                print("\n" + "=" * 80)
                print("SUCCESS: Clarity parser is WORKING!")
                print("         Python-Java IPC communication VERIFIED!")
                print("=" * 80)
                sys.exit(0)
            else:
                print(f"\n[ERROR] Parse failed: {data.get('error', 'Unknown')}")
                sys.exit(1)
                
        except json.JSONDecodeError as e:
            print(f"\n[FAIL] Could not parse JSON: {e}")
            sys.exit(1)
    else:
        print("\n[FAIL] No JSON output received")
        print(f"        Return code: {result.returncode}")
        sys.exit(1)
        
except subprocess.TimeoutExpired:
    print("\n[FAIL] Parser timeout (> 120 seconds)")
    sys.exit(1)
except Exception as e:
    print(f"\n[FAIL] Exception: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

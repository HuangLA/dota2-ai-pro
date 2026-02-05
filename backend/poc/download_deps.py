"""
Download all Clarity dependencies
"""

import urllib.request
from pathlib import Path

PARSER_DIR = Path(r"N:\dota2-ai-pro\parsers")

dependencies = [
    ("protobuf", "https://repo1.maven.org/maven2/com/google/protobuf/protobuf-java/3.21.9/protobuf-java-3.21.9.jar"),
    ("slf4j-api", "https://repo1.maven.org/maven2/org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.jar"),
    ("slf4j-simple", "https://repo1.maven.org/maven2/org/slf4j/slf4j-simple/1.7.36/slf4j-simple-1.7.36.jar"),
    ("snappy", "https://repo1.maven.org/maven2/org/xerial/snappy/snappy-java/1.1.10.5/snappy-java-1.1.10.5.jar"),
]

print("Downloading Clarity dependencies...")
print("=" * 80)

for name, url in dependencies:
    filename = PARSER_DIR / url.split("/")[-1]
    
    if filename.exists():
        print(f"[SKIP] {name}: already exists")
    else:
        print(f"[DOWN] {name}: {url}")
        try:
            urllib.request.urlretrieve(url, filename)
            print(f"  [OK] Downloaded to {filename.name}")
        except Exception as e:
            print(f"  [FAIL] {e}")

print("\n" + "=" * 80)
print("Done!")

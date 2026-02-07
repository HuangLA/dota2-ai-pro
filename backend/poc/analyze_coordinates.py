"""
Analyze coordinate ranges from replay data to verify map bounds.
"""

import sys
from pathlib import Path

import pyarrow.parquet as pq

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def analyze_match_coordinates(match_id: int, data_dir: Path):
    """Analyze coordinate ranges for a single match."""
    positions_path = data_dir / str(match_id) / "positions.parquet"

    if not positions_path.exists():
        print(f"File not found: {positions_path}")
        return None

    df = pq.read_table(positions_path).to_pandas()

    print(f"\n{'='*60}")
    print(f"Match {match_id} Coordinate Analysis")
    print(f"{'='*60}")
    print(f"Total samples: {len(df)}")
    print(f"Unique heroes: {df['hero'].nunique()}")

    print(f"\n--- X Coordinate Stats ---")
    print(f"  Min: {df['x'].min():.0f}")
    print(f"  Max: {df['x'].max():.0f}")
    print(f"  Mean: {df['x'].mean():.0f}")
    print(f"  Std: {df['x'].std():.0f}")

    print(f"\n--- Y Coordinate Stats ---")
    print(f"  Min: {df['y'].min():.0f}")
    print(f"  Max: {df['y'].max():.0f}")
    print(f"  Mean: {df['y'].mean():.0f}")
    print(f"  Std: {df['y'].std():.0f}")

    print(f"\n--- Extreme Points (likely fountain) ---")

    # Radiant fountain: bottom-left (low x, low y)
    radiant_fountain = df[(df['x'] < 12000) & (df['y'] < 12000)]
    if len(radiant_fountain) > 0:
        print(f"  Radiant side: x={radiant_fountain['x'].min():.0f}, y={radiant_fountain['y'].min():.0f}")
        print(f"    Samples in area: {len(radiant_fountain)}")

    # Dire fountain: top-right (high x, high y)
    dire_fountain = df[(df['x'] > 21000) & (df['y'] > 21000)]
    if len(dire_fountain) > 0:
        print(f"  Dire side: x={dire_fountain['x'].max():.0f}, y={dire_fountain['y'].max():.0f}")
        print(f"    Samples in area: {len(dire_fountain)}")

    print(f"\n--- By Team ---")
    for team in sorted(df['team'].unique()):
        team_df = df[df['team'] == team]
        team_name = "Radiant" if team == 2 else "Dire"
        print(f"  {team_name} (team={team}):")
        print(f"    X range: {team_df['x'].min():.0f} ~ {team_df['x'].max():.0f}")
        print(f"    Y range: {team_df['y'].min():.0f} ~ {team_df['y'].max():.0f}")

    # Check for 'time' column (may be named 'tick' in some datasets)
    time_col = 'time' if 'time' in df.columns else 'tick' if 'tick' in df.columns else None
    if time_col:
        print(f"\n--- Starting Positions (first 30s) ---")
        early_game = df[df[time_col] < df[time_col].min() + 30]
        for hero in early_game['hero'].unique():
            hero_start = early_game[early_game['hero'] == hero].iloc[0]
            team_name = "Radiant" if hero_start['team'] == 2 else "Dire"
            print(f"  {hero}: ({hero_start['x']:.0f}, {hero_start['y']:.0f}) [{team_name}]")

    return {
        'match_id': match_id,
        'x_min': df['x'].min(),
        'x_max': df['x'].max(),
        'y_min': df['y'].min(),
        'y_max': df['y'].max(),
    }


def analyze_ward_coordinates(match_id: int, data_dir: Path):
    """Analyze ward coordinates."""
    wards_path = data_dir / str(match_id) / "wards.parquet"

    if not wards_path.exists():
        return None

    df = pq.read_table(wards_path).to_pandas()
    placed = df[df['type'] == 'placed']

    print(f"\n--- Ward Coordinates ---")
    print(f"  Placed events: {len(placed)}")
    if len(placed) > 0:
        print(f"  X range: {placed['x'].min():.0f} ~ {placed['x'].max():.0f}")
        print(f"  Y range: {placed['y'].min():.0f} ~ {placed['y'].max():.0f}")

    # Roshan pit area
    roshan_area = placed[(placed['x'] > 16500) & (placed['x'] < 18500) &
                         (placed['y'] > 18500) & (placed['y'] < 21000)]
    if len(roshan_area) > 0:
        print(f"\n--- Roshan Pit Wards ---")
        for _, ward in roshan_area.head(5).iterrows():
            print(f"    ({ward['x']:.0f}, {ward['y']:.0f}) - {ward['ward_type']}")


def main():
    print("=" * 60)
    print("Dota 2 Coordinate Analysis Tool")
    print("=" * 60)

    print("\nCurrent DOTA_MAP_BOUNDS:")
    print("  minX: 7389, maxX: 25455")
    print("  minY: 7174, maxY: 25469")
    print("  width: 18066, height: 18295")

    data_dir = Path(__file__).parent.parent / "data" / "matches"

    if not data_dir.exists():
        print(f"\nError: Data directory not found: {data_dir}")
        return

    all_stats = []

    for match_dir in data_dir.iterdir():
        if match_dir.is_dir():
            try:
                match_id = int(match_dir.name)
                stats = analyze_match_coordinates(match_id, data_dir)
                if stats:
                    all_stats.append(stats)
                analyze_ward_coordinates(match_id, data_dir)
            except ValueError:
                continue

    if all_stats:
        print("\n" + "=" * 60)
        print("Summary Analysis")
        print("=" * 60)

        global_x_min = min(s['x_min'] for s in all_stats)
        global_x_max = max(s['x_max'] for s in all_stats)
        global_y_min = min(s['y_min'] for s in all_stats)
        global_y_max = max(s['y_max'] for s in all_stats)

        print(f"\nActual Coordinate Range (all matches):")
        print(f"  X: {global_x_min:.0f} ~ {global_x_max:.0f}")
        print(f"  Y: {global_y_min:.0f} ~ {global_y_max:.0f}")

        # Suggested bounds with 5% margin
        x_margin = (global_x_max - global_x_min) * 0.05
        y_margin = (global_y_max - global_y_min) * 0.05

        suggested_x_min = global_x_min - x_margin
        suggested_x_max = global_x_max + x_margin
        suggested_y_min = global_y_min - y_margin
        suggested_y_max = global_y_max + y_margin

        print(f"\nSuggested Bounds (5% margin):")
        print(f"  minX: {suggested_x_min:.0f}")
        print(f"  maxX: {suggested_x_max:.0f}")
        print(f"  minY: {suggested_y_min:.0f}")
        print(f"  maxY: {suggested_y_max:.0f}")

        print(f"\nDifference from current settings:")
        print(f"  minX diff: {7389 - suggested_x_min:.0f}")
        print(f"  maxX diff: {25455 - suggested_x_max:.0f}")
        print(f"  minY diff: {7174 - suggested_y_min:.0f}")
        print(f"  maxY diff: {25469 - suggested_y_max:.0f}")

        # Calculate theoretical bounds for comparison
        print(f"\n--- Theoretical Bounds (based on Source 2 engine) ---")
        print(f"  Cell-based center: 16384 (corresponds to game 0,0)")
        print(f"  Typical range: 8192 ~ 24576")
        print(f"  Observed range matches expectations: {'YES' if 8000 < global_x_min < 10000 else 'CHECK'}")


if __name__ == "__main__":
    main()

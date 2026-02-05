"""Quick check of kills data for NaN values."""
import pandas as pd
import pyarrow.parquet as pq

for match_id in [84782020, 86083386]:
    path = f'data/matches/{match_id}/kills.parquet'
    try:
        df = pq.read_table(path).to_pandas()
        print(f'Match {match_id}: {len(df)} kills')
        if not df.empty:
            nan_x = df["x"].isna().sum()
            nan_y = df["y"].isna().sum()
            print(f'  NaN x: {nan_x}')
            print(f'  NaN y: {nan_y}')
            valid = df.dropna(subset=["x", "y"])
            print(f'  Valid with coords: {len(valid)}')
            if len(valid) > 0:
                print(f'  Sample: x={valid["x"].iloc[0]:.0f}, y={valid["y"].iloc[0]:.0f}')
    except Exception as e:
        print(f'Match {match_id}: Error - {e}')

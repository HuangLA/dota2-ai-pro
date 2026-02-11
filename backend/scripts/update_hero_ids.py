"""
Update hero_id in existing match data.

This script updates the hero_id field in the player_matches table
by reading the hero_name from parquet metadata and converting it to ID.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.sqlite_db import get_connection, init_database
from storage.parquet_storage import ParquetStorage
from utils.hero_mapping import get_hero_id


def update_hero_ids():
    """Update hero_id for all matches in the database."""
    # Initialize database first
    init_database("data/truesight.db")
    conn = get_connection()
    cursor = conn.cursor()
    
    # Get all matches
    cursor.execute("SELECT match_id FROM matches")
    matches = cursor.fetchall()
    
    print(f"Found {len(matches)} matches to update")
    
    parquet_storage = ParquetStorage("data/matches")
    
    for match_row in matches:
        match_id = match_row["match_id"]
        print(f"\nUpdating match {match_id}...")
        
        # Get metadata from parquet
        meta = parquet_storage.get_metadata(match_id)
        
        if not meta or "players" not in meta:
            print(f"  ! No metadata found, skipping")
            continue
        
        # Update each player
        for i, player in enumerate(meta["players"]):
            hero_name = player.get("hero_name", "")
            hero_id = get_hero_id(hero_name)
            
            if hero_id == 0:
                print(f"  ! Unknown hero: {hero_name}")
                continue
            
            # Update the hero_id in database
            cursor.execute("""
                UPDATE player_matches
                SET hero_id = ?
                WHERE match_id = ? AND player_slot = ?
            """, (hero_id, match_id, i))
            
            print(f"  + Player {i}: {hero_name} -> ID {hero_id}")
        
        conn.commit()
    
    print("\nAll hero_ids updated successfully!")


if __name__ == "__main__":
    update_hero_ids()

"""Sync missing team and league data - Simple version"""
import asyncio
import sqlite3
from database.sqlite_db import init_database
from services.opendota_service import OpenDotaService
from storage.opendota_reference_storage import OpenDotaReferenceStorage

async def main():
    conn = sqlite3.connect('data/truesight.db')
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Initialize database connection
    init_database('data/truesight.db')
    
    
    # Get all unique team IDs from matches
    print("Analyzing match data...")
    rows = cur.execute("""
        SELECT DISTINCT radiant_team_id, dire_team_id, leagueid
        FROM opendota_matches
        WHERE radiant_team_id IS NOT NULL OR dire_team_id IS NOT NULL OR leagueid IS NOT NULL
    """).fetchall()
    
    all_team_ids = set()
    all_league_ids = set()
    
    for row in rows:
        if row['radiant_team_id']:
            all_team_ids.add(row['radiant_team_id'])
        if row['dire_team_id']:
            all_team_ids.add(row['dire_team_id'])
        if row['leagueid']:
            all_league_ids.add(row['leagueid'])
    
    print(f"Found {len(all_team_ids)} unique teams, {len(all_league_ids)} unique leagues")
    
    # Check which already exist
    existing_teams = set()
    for tid in all_team_ids:
        row = cur.execute('SELECT team_id FROM opendota_teams WHERE team_id = ?', (tid,)).fetchone()
        if row:
            existing_teams.add(tid)
    
    existing_leagues = set()
    for lid in all_league_ids:
        row = cur.execute('SELECT leagueid FROM opendota_leagues WHERE leagueid = ?', (lid,)).fetchone()
        if row:
            existing_leagues.add(lid)
    
    missing_teams = all_team_ids - existing_teams
    missing_leagues = all_league_ids - existing_leagues
    
    print(f"\nDatabase status:")
    print(f"  Teams: {len(existing_teams)}/{len(all_team_ids)} exist, {len(missing_teams)} missing")
    print(f"  Leagues: {len(existing_leagues)}/{len(all_league_ids)} exist, {len(missing_leagues)} missing")
    
    if not missing_teams and not missing_leagues:
        print("\nAll teams and leagues already in database!")
        conn.close()
        return
    
    # Sync missing data
    print(f"\nStarting sync...")
    
    opendota_service = OpenDotaService()
    reference_storage = OpenDotaReferenceStorage()
    
    # Sync missing teams
    if missing_teams:
        print(f"\nSyncing {len(missing_teams)} missing teams...")
        teams_synced = 0
        teams_failed = 0
        
        for team_id in list(missing_teams)[:50]:  # Limit to 50 to avoid rate limit
            try:
                team_data = await opendota_service.fetch_team_by_id(team_id)
                if team_data:
                    reference_storage.upsert_teams([team_data])
                    teams_synced += 1
                    print(f"  OK Team {team_id}: {team_data.get('name', 'N/A')}")
            except Exception as e:
                teams_failed += 1
                print(f"  FAIL Team {team_id}: {e}")
            
            await asyncio.sleep(0.5)  # Avoid rate limit
        
        print(f"\nTeam sync complete: {teams_synced} success, {teams_failed} failed")
    
    # Sync missing leagues
    if missing_leagues:
        print(f"\nSyncing {len(missing_leagues)} missing leagues...")
        leagues_synced = 0
        leagues_failed = 0
        
        for league_id in list(missing_leagues)[:30]:  # Limit to 30
            try:
                league_data = await opendota_service.fetch_league_by_id(league_id)
                if league_data:
                    reference_storage.upsert_leagues([league_data])
                    leagues_synced += 1
                    print(f"  OK League {league_id}: {league_data.get('name', 'N/A')}")
            except Exception as e:
                leagues_failed += 1
                print(f"  FAIL League {league_id}: {e}")
            
            await asyncio.sleep(0.5)
        
        print(f"\nLeague sync complete: {leagues_synced} success, {leagues_failed} failed")
    
    conn.close()
    print("\nSync task complete!")

if __name__ == '__main__':
    asyncio.run(main())

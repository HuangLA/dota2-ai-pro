"""
POC Test: Generate test data for PixiJS rendering performance test.
This script generates JSON data that can be loaded in the frontend for testing.
"""

import json
import math
import random
from pathlib import Path


def generate_hero_movement_data(
    num_heroes: int = 10,
    duration_seconds: int = 60,
    ticks_per_second: int = 30,
) -> dict:
    """
    Generate realistic hero movement data for PixiJS stress test.
    """
    print(f"Generating movement data for {num_heroes} heroes over {duration_seconds}s...")
    
    total_ticks = duration_seconds * ticks_per_second
    heroes = []
    
    for hero_id in range(1, num_heroes + 1):
        # Random starting position
        x = random.uniform(2000, 14000)
        y = random.uniform(2000, 14000)
        
        positions = []
        for tick in range(total_ticks):
            # Simulate movement with some randomness
            angle = random.uniform(0, 2 * math.pi)
            speed = random.uniform(200, 400) / ticks_per_second
            
            x += math.cos(angle) * speed
            y += math.sin(angle) * speed
            
            # Keep within map bounds
            x = max(0, min(16384, x))
            y = max(0, min(16384, y))
            
            # Only record every 3rd tick to reduce data size
            if tick % 3 == 0:
                positions.append({
                    'tick': tick,
                    'x': round(x, 1),
                    'y': round(y, 1),
                    'hp_percent': random.uniform(0.3, 1.0),
                    'is_alive': random.random() > 0.02,
                })
        
        heroes.append({
            'hero_id': hero_id,
            'team': 'radiant' if hero_id <= 5 else 'dire',
            'positions': positions,
        })
    
    return {
        'duration': duration_seconds,
        'tick_rate': ticks_per_second,
        'heroes': heroes,
        'total_positions': sum(len(h['positions']) for h in heroes),
    }


def generate_ward_data(num_wards: int = 50) -> list[dict]:
    """Generate ward placement data."""
    wards = []
    for i in range(num_wards):
        wards.append({
            'ward_id': i + 1,
            'type': random.choice(['observer', 'sentry']),
            'x': random.uniform(1000, 15000),
            'y': random.uniform(1000, 15000),
            'team': random.choice(['radiant', 'dire']),
            'placed_at': random.randint(0, 2700),
            'destroyed_at': random.randint(0, 2700) if random.random() > 0.5 else None,
        })
    return wards


def generate_stress_test_data(
    num_units: int = 1000,
    duration_seconds: int = 10,
) -> dict:
    """
    Generate stress test data with many moving units.
    This tests PixiJS's ability to render 1000+ sprites at 60fps.
    """
    print(f"Generating stress test data for {num_units} units...")
    
    units = []
    for i in range(num_units):
        # Random starting position
        x = random.uniform(0, 16384)
        y = random.uniform(0, 16384)
        
        # Random velocity
        vx = random.uniform(-200, 200)
        vy = random.uniform(-200, 200)
        
        units.append({
            'id': i,
            'start_x': x,
            'start_y': y,
            'velocity_x': vx,
            'velocity_y': vy,
            'color': random.choice(['#22c55e', '#ef4444', '#3b82f6', '#f59e0b']),
        })
    
    return {
        'units': units,
        'duration': duration_seconds,
        'target_fps': 60,
    }


def run_data_generation():
    """Generate all test data files."""
    output_dir = Path(__file__).parent.parent / 'data' / 'poc_test'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("POC: Generating PixiJS Test Data")
    print("=" * 60)
    
    # 1. Hero movement data
    hero_data = generate_hero_movement_data()
    hero_file = output_dir / 'hero_movement.json'
    with open(hero_file, 'w') as f:
        json.dump(hero_data, f)
    print(f"\nHero movement data saved: {hero_file}")
    print(f"  Total positions: {hero_data['total_positions']:,}")
    
    # 2. Ward data
    ward_data = generate_ward_data()
    ward_file = output_dir / 'wards.json'
    with open(ward_file, 'w') as f:
        json.dump(ward_data, f)
    print(f"\nWard data saved: {ward_file}")
    print(f"  Total wards: {len(ward_data)}")
    
    # 3. Stress test data
    stress_data = generate_stress_test_data(num_units=1000)
    stress_file = output_dir / 'stress_test.json'
    with open(stress_file, 'w') as f:
        json.dump(stress_data, f)
    print(f"\nStress test data saved: {stress_file}")
    print(f"  Total units: {len(stress_data['units'])}")
    
    print("\n" + "=" * 60)
    print("Data generation complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Create PixiJS test component in frontend")
    print("2. Load these JSON files and measure FPS")
    print("3. Target: 60 FPS with 1000+ moving units")


if __name__ == '__main__':
    run_data_generation()

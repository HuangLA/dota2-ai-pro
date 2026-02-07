"""
Optimize DOTA_MAP_BOUNDS to contain all observed data points.

Given:
- Observed coordinate range: X(7901~25011), Y(7844~24928)
- Radiant fountain: game(9550, 9950)
- Dire fountain: game(23450, 22750)

Find screen percentages that produce bounds containing all observed data.
"""

import math

print("=" * 70)
print("Optimize DOTA_MAP_BOUNDS")
print("=" * 70)

# Observed data range (from 2 matches)
OBS_X_MIN, OBS_X_MAX = 7901, 25011
OBS_Y_MIN, OBS_Y_MAX = 7844, 24928

# Reference points
RADIANT = (9550, 9950)
DIRE = (23450, 22750)

def calculate_bounds(rx, ry, dx, dy):
    """Calculate bounds from screen percentages."""
    x1, y1 = RADIANT
    x2, y2 = DIRE

    width = (x2 - x1) / (dx - rx)
    minX = x1 - rx * width
    maxX = minX + width

    height = (y2 - y1) / (ry - dy)
    maxY = y1 + ry * height
    minY = maxY - height

    return minX, maxX, minY, maxY

def check_bounds(minX, maxX, minY, maxY):
    """Check if bounds contain all observed data."""
    x_ok = minX <= OBS_X_MIN and maxX >= OBS_X_MAX
    y_ok = minY <= OBS_Y_MIN and maxY >= OBS_Y_MAX
    return x_ok, y_ok

# Method 1: Start from observed data and add margin
print("\n--- Method 1: Based on Observed Data + Margin ---")

margin_pct = 0.02  # 2% margin
obs_x_range = OBS_X_MAX - OBS_X_MIN
obs_y_range = OBS_Y_MAX - OBS_Y_MIN

minX_obs = OBS_X_MIN - obs_x_range * margin_pct
maxX_obs = OBS_X_MAX + obs_x_range * margin_pct
minY_obs = OBS_Y_MIN - obs_y_range * margin_pct
maxY_obs = OBS_Y_MAX + obs_y_range * margin_pct

print(f"With {margin_pct:.0%} margin:")
print(f"  minX: {minX_obs:.0f}")
print(f"  maxX: {maxX_obs:.0f}")
print(f"  minY: {minY_obs:.0f}")
print(f"  maxY: {maxY_obs:.0f}")

# Calculate what screen percentages this implies
width_obs = maxX_obs - minX_obs
height_obs = maxY_obs - minY_obs

rx_obs = (RADIANT[0] - minX_obs) / width_obs
ry_obs = (maxY_obs - RADIANT[1]) / height_obs
dx_obs = (DIRE[0] - minX_obs) / width_obs
dy_obs = (maxY_obs - DIRE[1]) / height_obs

print(f"\nImplied screen positions:")
print(f"  Radiant: ({rx_obs:.3f}, {ry_obs:.3f}) = ({rx_obs:.1%}, {ry_obs:.1%})")
print(f"  Dire: ({dx_obs:.3f}, {dy_obs:.3f}) = ({dx_obs:.1%}, {dy_obs:.1%})")

# Method 2: Find optimal percentages that work
print("\n--- Method 2: Search for Optimal Percentages ---")

best_config = None
best_score = float('inf')

for rx in [x/100 for x in range(5, 15)]:  # 5% to 14%
    for ry in [x/100 for x in range(86, 96)]:  # 86% to 95%
        for dx in [x/100 for x in range(86, 96)]:  # 86% to 95%
            for dy in [x/100 for x in range(5, 15)]:  # 5% to 14%
                minX, maxX, minY, maxY = calculate_bounds(rx, ry, dx, dy)
                x_ok, y_ok = check_bounds(minX, maxX, minY, maxY)

                if x_ok and y_ok:
                    # Calculate score: smaller bounds = better
                    score = (maxX - minX) + (maxY - minY)

                    # Also prefer centered map
                    center_x = (minX + maxX) / 2
                    center_y = (minY + maxY) / 2
                    center_penalty = abs(center_x - 16384) + abs(center_y - 16384)
                    score += center_penalty * 0.1

                    if score < best_score:
                        best_score = score
                        best_config = (rx, ry, dx, dy, minX, maxX, minY, maxY)

if best_config:
    rx, ry, dx, dy, minX, maxX, minY, maxY = best_config
    print(f"Best configuration found:")
    print(f"  Screen positions: Radiant({rx:.0%}, {ry:.0%}), Dire({dx:.0%}, {dy:.0%})")
    print(f"  Bounds: X({minX:.0f}~{maxX:.0f}), Y({minY:.0f}~{maxY:.0f})")
    print(f"  Width: {maxX-minX:.0f}, Height: {maxY-minY:.0f}")
    print(f"  Center: ({(minX+maxX)/2:.0f}, {(minY+maxY)/2:.0f})")
else:
    print("No valid configuration found in search range!")

# Method 3: Use known minimap content area
print("\n--- Method 3: Based on Minimap Content Area ---")
print("Minimap (minimap_740.png) analysis:")
print("  Image size: 1024 x 1024")
print("  Content area: (61, 61) to (962, 962)")
print("  Content size: 901 x 901 pixels")
print("  Border: 6% on each side")

# If content area is 88% of the image (0.06 to 0.94)
# And Radiant/Dire are at the fountain positions inside the content
# Let's assume they're at 10% and 90% of the content area

content_radiant = 0.10  # 10% into content area
content_dire = 0.90     # 90% into content area

# This maps to image coordinates:
# image_pct = content_left + content_pct * content_width_ratio
# = 0.06 + content_pct * 0.88

image_rx = 0.06 + content_radiant * 0.88  # ~0.148
image_dx = 0.06 + content_dire * 0.88     # ~0.852

print(f"\nIf fountains at 10%/90% of content area:")
print(f"  Radiant image position: {image_rx:.3f} ({image_rx:.1%})")
print(f"  Dire image position: {image_dx:.3f} ({image_dx:.1%})")

# Calculate bounds with these values
minX3, maxX3, minY3, maxY3 = calculate_bounds(
    rx=content_radiant, ry=1-content_radiant,  # 10%, 90%
    dx=content_dire, dy=1-content_dire          # 90%, 10%
)
print(f"\nCalculated bounds:")
print(f"  minX: {minX3:.0f}, maxX: {maxX3:.0f}")
print(f"  minY: {minY3:.0f}, maxY: {maxY3:.0f}")

x_ok3, y_ok3 = check_bounds(minX3, maxX3, minY3, maxY3)
print(f"  Contains observed data: X={x_ok3}, Y={y_ok3}")

# Final recommendation
print("\n" + "=" * 70)
print("FINAL RECOMMENDATION")
print("=" * 70)

# Use method 1 (observed data + margin) as it guarantees all data fits
final_minX = int(minX_obs)
final_maxX = int(maxX_obs)
final_minY = int(minY_obs)
final_maxY = int(maxY_obs)

print(f"""
export const DOTA_MAP_BOUNDS = {{
  // Based on observed data from 2 parsed matches
  // with 2% margin for safety
  minX: {final_minX},
  maxX: {final_maxX},
  minY: {final_minY},
  maxY: {final_maxY},
  width: {final_maxX - final_minX},
  height: {final_maxY - final_minY},
}};

// Implied screen positions for calibration markers:
// Radiant fountain: ({rx_obs:.1%}, {ry_obs:.1%})
// Dire fountain: ({dx_obs:.1%}, {dy_obs:.1%})
""")

# Compare with current
print("--- Comparison with Current ---")
current = {"minX": 7389, "maxX": 25455, "minY": 7174, "maxY": 25469}
print(f"{'Parameter':<10} {'Current':>10} {'Recommended':>12} {'Change':>12}")
print("-" * 46)
print(f"{'minX':<10} {current['minX']:>10} {final_minX:>12} {final_minX - current['minX']:>+12}")
print(f"{'maxX':<10} {current['maxX']:>10} {final_maxX:>12} {final_maxX - current['maxX']:>+12}")
print(f"{'minY':<10} {current['minY']:>10} {final_minY:>12} {final_minY - current['minY']:>+12}")
print(f"{'maxY':<10} {current['maxY']:>10} {final_maxY:>12} {final_maxY - current['maxY']:>+12}")

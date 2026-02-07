"""
Calculate optimal DOTA_MAP_BOUNDS based on collected calibration data.

Coordinate system:
- Game coordinates: X increases right, Y increases up
- Screen coordinates: X increases right, Y increases DOWN (inverted)

So for mapping:
- screenX = (gameX - minX) / width
- screenY = (maxY - gameY) / height  (Y is inverted!)

Known reference points from replay data:
- Radiant fountain (bottom-left in game): game ~(9550, 9950)
- Dire fountain (top-right in game): game ~(23450, 22750)

On minimap image:
- Radiant appears at bottom-left: screen ~(9%, 91%)
- Dire appears at top-right: screen ~(89%, 9%)
"""

print("=" * 70)
print("DOTA_MAP_BOUNDS Calibration Calculator (Corrected)")
print("=" * 70)

# Reference points from replay data (average of starting positions)
RADIANT_FOUNTAIN = (9550, 9950)  # Low X, Low Y in game = bottom-left
DIRE_FOUNTAIN = (23450, 22750)   # High X, High Y in game = top-right

# Expected positions on minimap content area
# Radiant: bottom-left of content area
# Dire: top-right of content area
RADIANT_SCREEN_X = 0.09  # 9% from left
RADIANT_SCREEN_Y = 0.91  # 91% from top (near bottom)

DIRE_SCREEN_X = 0.89    # 89% from left (near right)
DIRE_SCREEN_Y = 0.09    # 9% from top (near top)

x1, y1 = RADIANT_FOUNTAIN  # Radiant
x2, y2 = DIRE_FOUNTAIN     # Dire

print("\n--- Reference Points ---")
print(f"Radiant Fountain: game({x1}, {y1}) -> screen({RADIANT_SCREEN_X:.0%}, {RADIANT_SCREEN_Y:.0%})")
print(f"Dire Fountain: game({x2}, {y2}) -> screen({DIRE_SCREEN_X:.0%}, {DIRE_SCREEN_Y:.0%})")

# Mapping equations:
# screenX = (gameX - minX) / (maxX - minX)
# screenY = (maxY - gameY) / (maxY - minY)
#
# From Radiant: RADIANT_SCREEN_X = (x1 - minX) / width
# From Dire:    DIRE_SCREEN_X = (x2 - minX) / width
#
# Solving for width:
# width = (x2 - x1) / (DIRE_SCREEN_X - RADIANT_SCREEN_X)
# minX = x1 - RADIANT_SCREEN_X * width

width = (x2 - x1) / (DIRE_SCREEN_X - RADIANT_SCREEN_X)
minX = x1 - RADIANT_SCREEN_X * width
maxX = minX + width

# For Y (inverted):
# RADIANT_SCREEN_Y = (maxY - y1) / height
# DIRE_SCREEN_Y = (maxY - y2) / height
#
# From these:
# RADIANT_SCREEN_Y * height = maxY - y1
# DIRE_SCREEN_Y * height = maxY - y2
#
# Subtracting:
# (RADIANT_SCREEN_Y - DIRE_SCREEN_Y) * height = y2 - y1
# height = (y2 - y1) / (RADIANT_SCREEN_Y - DIRE_SCREEN_Y)
# maxY = y1 + RADIANT_SCREEN_Y * height

height = (y2 - y1) / (RADIANT_SCREEN_Y - DIRE_SCREEN_Y)
maxY = y1 + RADIANT_SCREEN_Y * height
minY = maxY - height

print("\n--- Calculated Bounds ---")
print(f"minX: {minX:.0f}")
print(f"maxX: {maxX:.0f}")
print(f"minY: {minY:.0f}")
print(f"maxY: {maxY:.0f}")
print(f"width: {width:.0f}")
print(f"height: {height:.0f}")

# Validate
print("\n--- Validation ---")
observed_x_min, observed_x_max = 7901, 25011
observed_y_min, observed_y_max = 7844, 24928

print(f"Observed X range: {observed_x_min} ~ {observed_x_max}")
print(f"Calculated X range: {minX:.0f} ~ {maxX:.0f}")
x_valid = minX <= observed_x_min and maxX >= observed_x_max
print(f"  Contains observed range: {x_valid}")

print(f"\nObserved Y range: {observed_y_min} ~ {observed_y_max}")
print(f"Calculated Y range: {minY:.0f} ~ {maxY:.0f}")
y_valid = minY <= observed_y_min and maxY >= observed_y_max
print(f"  Contains observed range: {y_valid}")

# Map center
map_center_x = (minX + maxX) / 2
map_center_y = (minY + maxY) / 2
print(f"\nCalculated map center: ({map_center_x:.0f}, {map_center_y:.0f})")
print(f"Expected center (Source 2): (16384, 16384)")
print(f"Difference: ({map_center_x - 16384:.0f}, {map_center_y - 16384:.0f})")

# Verify with screen position calculation
print("\n--- Verification (back-calculate screen positions) ---")
def game_to_screen(gx, gy):
    sx = (gx - minX) / width
    sy = (maxY - gy) / height
    return sx, sy

radiant_calc = game_to_screen(x1, y1)
dire_calc = game_to_screen(x2, y2)

print(f"Radiant: expected ({RADIANT_SCREEN_X:.2f}, {RADIANT_SCREEN_Y:.2f}), calculated {radiant_calc[0]:.2f}, {radiant_calc[1]:.2f}")
print(f"Dire: expected ({DIRE_SCREEN_X:.2f}, {DIRE_SCREEN_Y:.2f}), calculated {dire_calc[0]:.2f}, {dire_calc[1]:.2f}")

# Test Roshan pit
roshan_game = (17500, 19850)  # From ward data
roshan_screen = game_to_screen(*roshan_game)
print(f"\nRoshan pit: game{roshan_game} -> screen({roshan_screen[0]:.2f}, {roshan_screen[1]:.2f})")
print(f"  Expected: ~(0.58, 0.35) - slightly right and above center")

# Generate suggested code
print("\n" + "=" * 70)
print("Suggested Code Update")
print("=" * 70)
print("""
export const DOTA_MAP_BOUNDS = {
  // Calibrated using two-point method:
  // - Radiant fountain: game(9550, 9950) -> screen(9%, 91%)
  // - Dire fountain: game(23450, 22750) -> screen(89%, 9%)""")
print(f"  minX: {int(minX)},")
print(f"  maxX: {int(maxX)},")
print(f"  minY: {int(minY)},")
print(f"  maxY: {int(maxY)},")
print(f"  width: {int(maxX - minX)},")
print(f"  height: {int(maxY - minY)},")
print("};")

# Compare with current settings
print("\n--- Comparison with Current Settings ---")
current = {"minX": 7389, "maxX": 25455, "minY": 7174, "maxY": 25469}
print(f"{'Parameter':<10} {'Current':>10} {'Calculated':>12} {'Difference':>12}")
print("-" * 46)
print(f"{'minX':<10} {current['minX']:>10} {int(minX):>12} {int(minX - current['minX']):>+12}")
print(f"{'maxX':<10} {current['maxX']:>10} {int(maxX):>12} {int(maxX - current['maxX']):>+12}")
print(f"{'minY':<10} {current['minY']:>10} {int(minY):>12} {int(minY - current['minY']):>+12}")
print(f"{'maxY':<10} {current['maxY']:>10} {int(maxY):>12} {int(maxY - current['maxY']):>+12}")

# Sensitivity analysis
print("\n" + "=" * 70)
print("Sensitivity Analysis")
print("=" * 70)

configs = [
    (0.085, 0.915, 0.895, 0.085, "Tighter corners (8.5%/91.5%)"),
    (0.095, 0.905, 0.885, 0.095, "Looser corners (9.5%/90.5%)"),
    (0.09, 0.90, 0.89, 0.10, "Asymmetric (based on actual minimap)"),
]

for rx, ry, dx, dy, label in configs:
    w = (x2 - x1) / (dx - rx)
    mnX = x1 - rx * w
    mxX = mnX + w

    h = (y2 - y1) / (ry - dy)
    mxY = y1 + ry * h
    mnY = mxY - h

    print(f"\n{label}:")
    print(f"  minX={int(mnX)}, maxX={int(mxX)}, minY={int(mnY)}, maxY={int(mxY)}")
    print(f"  Center: ({int((mnX+mxX)/2)}, {int((mnY+mxY)/2)})")
    x_ok = mnX <= observed_x_min and mxX >= observed_x_max
    y_ok = mnY <= observed_y_min and mxY >= observed_y_max
    print(f"  Contains observed data: X={x_ok}, Y={y_ok}")

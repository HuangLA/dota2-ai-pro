"""
Analyze minimap image to determine exact content boundaries.
"""

from PIL import Image
from pathlib import Path


def analyze_minimap(image_path: str):
    """Analyze minimap image to find content boundaries."""
    img = Image.open(image_path).convert("RGBA")
    width, height = img.size

    print(f"Image: {Path(image_path).name}")
    print(f"Size: {width} x {height}")
    print()

    pixels = img.load()

    # Find left boundary (first non-transparent column)
    left = 0
    for x in range(width):
        has_content = False
        for y in range(height):
            if pixels[x, y][3] > 10:  # Alpha > 10
                has_content = True
                break
        if has_content:
            left = x
            break

    # Find right boundary
    right = width - 1
    for x in range(width - 1, -1, -1):
        has_content = False
        for y in range(height):
            if pixels[x, y][3] > 10:
                has_content = True
                break
        if has_content:
            right = x
            break

    # Find top boundary
    top = 0
    for y in range(height):
        has_content = False
        for x in range(width):
            if pixels[x, y][3] > 10:
                has_content = True
                break
        if has_content:
            top = y
            break

    # Find bottom boundary
    bottom = height - 1
    for y in range(height - 1, -1, -1):
        has_content = False
        for x in range(width):
            if pixels[x, y][3] > 10:
                has_content = True
                break
        if has_content:
            bottom = y
            break

    content_width = right - left + 1
    content_height = bottom - top + 1

    print(f"--- Content Boundaries ---")
    print(f"  Left:   {left} px ({left/width*100:.2f}%)")
    print(f"  Right:  {right} px ({right/width*100:.2f}%)")
    print(f"  Top:    {top} px ({top/height*100:.2f}%)")
    print(f"  Bottom: {bottom} px ({bottom/height*100:.2f}%)")
    print()
    print(f"--- Content Area ---")
    print(f"  Width:  {content_width} px ({content_width/width*100:.2f}%)")
    print(f"  Height: {content_height} px ({content_height/height*100:.2f}%)")
    print()

    # Current code assumes:
    print(f"--- Current Code Settings ---")
    print(f"  contentLeft:   {61/1024*100:.2f}% (61 px)")
    print(f"  contentRight:  {962/1024*100:.2f}% (962 px)")
    print(f"  contentTop:    {61/1024*100:.2f}% (61 px)")
    print(f"  contentBottom: {962/1024*100:.2f}% (962 px)")
    print()

    # Suggested values
    print(f"--- Suggested Values for MINIMAP_IMAGE_CONFIG ---")
    print(f"  contentLeft:   {left} / {width},   // ~{left/width:.4f}")
    print(f"  contentRight:  {right} / {width},  // ~{right/width:.4f}")
    print(f"  contentTop:    {top} / {height},   // ~{top/height:.4f}")
    print(f"  contentBottom: {bottom} / {height}, // ~{bottom/height:.4f}")

    # Check corners for specific colors (might help identify reference points)
    print()
    print(f"--- Corner Colors (RGB) ---")
    print(f"  Top-Left ({left},{top}): {pixels[left, top][:3]}")
    print(f"  Top-Right ({right},{top}): {pixels[right, top][:3]}")
    print(f"  Bottom-Left ({left},{bottom}): {pixels[left, bottom][:3]}")
    print(f"  Bottom-Right ({right},{bottom}): {pixels[right, bottom][:3]}")

    # Sample some characteristic positions
    print()
    print(f"--- Expected Positions on Image ---")

    # Radiant fountain should be at ~9% from left, ~91% from top
    # (based on game coords 9500/25500 and 10000/25500)
    radiant_x_pct = (9500 - 7389) / (25455 - 7389)
    radiant_y_pct = 1 - (10000 - 7174) / (25469 - 7174)  # Y is inverted

    # Map to content area
    radiant_img_x = left + radiant_x_pct * content_width
    radiant_img_y = top + radiant_y_pct * content_height

    print(f"  Radiant Fountain (game ~9500, 10000):")
    print(f"    Normalized: ({radiant_x_pct:.3f}, {radiant_y_pct:.3f})")
    print(f"    Image position: ({radiant_img_x:.0f}, {radiant_img_y:.0f})")

    # Dire fountain should be at ~89% from left, ~15% from top
    dire_x_pct = (23500 - 7389) / (25455 - 7389)
    dire_y_pct = 1 - (22750 - 7174) / (25469 - 7174)

    dire_img_x = left + dire_x_pct * content_width
    dire_img_y = top + dire_y_pct * content_height

    print(f"  Dire Fountain (game ~23500, 22750):")
    print(f"    Normalized: ({dire_x_pct:.3f}, {dire_y_pct:.3f})")
    print(f"    Image position: ({dire_img_x:.0f}, {dire_img_y:.0f})")


def main():
    print("=" * 60)
    print("Minimap Image Analysis")
    print("=" * 60)
    print()

    # Check for minimap images
    minimap_dir = Path(__file__).parent.parent.parent / "frontend" / "public" / "assets" / "dota" / "minimap"

    if not minimap_dir.exists():
        print(f"Minimap directory not found: {minimap_dir}")
        return

    for img_file in minimap_dir.glob("*.png"):
        analyze_minimap(str(img_file))
        print()
        print("=" * 60)
        print()

    for img_file in minimap_dir.glob("*.jpg"):
        analyze_minimap(str(img_file))
        print()
        print("=" * 60)
        print()


if __name__ == "__main__":
    main()

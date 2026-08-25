# Generates the PWA icons in icons/ from the wheel mark: dark panel,
# X arms, center circle, and four quadrant dots in the dark-scheme
# sector hues from themes.js. Run from the repo root:
#   python3 tools/generate-icons.py
# Outputs: icon-180.png (apple-touch, full bleed), icon-192.png,
# icon-512.png, icon-512-maskable.png (content shrunk to the maskable
# safe zone; Android may crop anything outside the central circle).

import math
from PIL import Image, ImageDraw

BG = '#141414'
LINE = '#4a4a4a'
RING = '#eeeeee'
# Keep in sync with SECTOR_COLORS.dark in themes.js.
SECTOR = {'N': '#93c5fd', 'E': '#fdba74', 'S': '#86efac', 'W': '#e9b8ff'}
SECTOR_MID = {'E': 0, 'S': 90, 'W': 180, 'N': 270}

SS = 4  # supersample factor for clean edges after downscale


def draw_icon(size, content_scale):
    s = size * SS
    img = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(img)
    c = s / 2
    R = s / 2 * 0.84 * content_scale  # wheel radius inside the tile
    ring_r = R * 0.30
    dot_r = R * 0.16
    dot_dist = R * 0.62
    lw = max(SS, int(R * 0.045))

    for arm in (45, 135, 225, 315):
        rad = math.radians(arm)
        d.line(
            [
                (c + ring_r * 1.15 * math.cos(rad), c + ring_r * 1.15 * math.sin(rad)),
                (c + R * math.cos(rad), c + R * math.sin(rad)),
            ],
            fill=LINE, width=lw,
        )
    d.ellipse(
        [c - ring_r, c - ring_r, c + ring_r, c + ring_r],
        outline=RING, width=lw,
    )
    for sector, mid in SECTOR_MID.items():
        rad = math.radians(mid)
        x, y = c + dot_dist * math.cos(rad), c + dot_dist * math.sin(rad)
        d.ellipse(
            [x - dot_r, y - dot_r, x + dot_r, y + dot_r],
            fill=SECTOR[sector],
        )
    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    import os
    os.makedirs('icons', exist_ok=True)
    draw_icon(180, 1.0).save('icons/icon-180.png')
    draw_icon(192, 1.0).save('icons/icon-192.png')
    draw_icon(512, 1.0).save('icons/icon-512.png')
    draw_icon(512, 0.78).save('icons/icon-512-maskable.png')
    print('wrote icons/icon-{180,192,512,512-maskable}.png')

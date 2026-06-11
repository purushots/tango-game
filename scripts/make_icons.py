#!/usr/bin/env python3
"""Generate Tango PWA icons — original golden-sun artwork, stdlib only.

Renders a warm golden sun (8 rounded rays + disc, subtle darker outline) on a
white rounded-square background, anti-aliased via signed-distance fields, and
writes raw RGBA PNGs with zlib/struct (no external imaging libraries).

Outputs (relative to repo root):
  icons/icon-192.png          192x192, rounded-square with transparent corners
  icons/icon-512.png          512x512, rounded-square with transparent corners
  icons/apple-touch-icon.png  180x180, full-bleed opaque (iOS applies its own mask)
"""
import math
import os
import struct
import zlib

SUN = (255, 155, 39)      # #FF9B27 golden orange
EDGE = (217, 122, 16)     # darker golden outline
BG = (255, 255, 255)      # white background


def sd_rounded_rect(x, y, c, half, r):
    dx = abs(x - c) - (half - r)
    dy = abs(y - c) - (half - r)
    return math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0) - r


def sd_circle(x, y, cx, cy, r):
    return math.hypot(x - cx, y - cy) - r


def sd_capsule(x, y, ax, ay, bx, by, r):
    px, py = x - ax, y - ay
    vx, vy = bx - ax, by - ay
    h = max(0.0, min(1.0, (px * vx + py * vy) / (vx * vx + vy * vy)))
    return math.hypot(px - vx * h, py - vy * h) - r


def coverage(d):
    """SDF -> pixel coverage with ~1px anti-aliasing."""
    return max(0.0, min(1.0, 0.5 - d))


def render(size, rounded_bg):
    S = float(size)
    c = S / 2.0
    disc_r = 0.165 * S
    ray_in, ray_out = 0.255 * S, 0.375 * S
    ray_r = 0.0375 * S            # capsule radius (ray half-width)
    outline = max(1.0, 0.018 * S)  # darker rim width
    corner = 0.225 * S

    rays = []
    for k in range(8):
        ang = k * math.pi / 4.0
        ux, uy = math.sin(ang), -math.cos(ang)
        rays.append((c + ux * ray_in, c + uy * ray_in,
                     c + ux * ray_out, c + uy * ray_out))

    rows = []
    for j in range(size):
        y = j + 0.5
        row = bytearray()
        for i in range(size):
            x = i + 0.5
            a_bg = coverage(sd_rounded_rect(x, y, c, S / 2.0, corner)) if rounded_bg else 1.0
            # Combined sun SDF: disc union 8 ray capsules.
            d = sd_circle(x, y, c, c, disc_r)
            for ax, ay, bx, by in rays:
                d = min(d, sd_capsule(x, y, ax, ay, bx, by, ray_r))
            a_fill = coverage(d)            # whole sun shape
            a_core = coverage(d + outline)  # interior (inside the rim)
            a_rim = max(0.0, a_fill - a_core)
            r = BG[0] * (1 - a_fill) + EDGE[0] * a_rim + SUN[0] * a_core
            g = BG[1] * (1 - a_fill) + EDGE[1] * a_rim + SUN[1] * a_core
            b = BG[2] * (1 - a_fill) + EDGE[2] * a_rim + SUN[2] * a_core
            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5), int(a_bg * 255 + 0.5)))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    raw = b''.join(b'\x00' + r for r in rows)  # filter type 0 per scanline
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    for name, size, rounded in (
        ('icon-192.png', 192, True),
        ('icon-512.png', 512, True),
        ('apple-touch-icon.png', 180, False),
    ):
        path = os.path.join(out, name)
        write_png(path, size, render(size, rounded))
        print('wrote', os.path.normpath(path))


if __name__ == '__main__':
    main()

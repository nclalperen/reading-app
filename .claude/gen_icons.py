"""One-off script to generate the app's PWA icons as plain PNGs, no
external image libraries required (pure stdlib zlib/struct PNG writer).
Run once with `python .claude/gen_icons.py`; not part of the app itself.
"""
import struct
import zlib
import os

MOSS_DARK = (0x34, 0x47, 0x3A)
PAPER = (0xED, 0xE9, 0xDB)
GOLD = (0xA9, 0x7F, 0x2E)
RUST = (0xB3, 0x3A, 0x2E)

# 5x7 blocky bitmap font, 1 = filled
LETTER_R = [
    "11110",
    "10001",
    "10001",
    "11110",
    "10100",
    "10010",
    "10001",
]


def write_png(path, width, height, pixels):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b = pixels[y][x]
            raw += bytes((r, g, b))
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def make_icon(size, badge_ratio=0.62, letter_ratio=0.34):
    pixels = [[MOSS_DARK for _ in range(size)] for _ in range(size)]

    cx, cy = size / 2, size / 2
    radius = size * badge_ratio / 2
    for y in range(size):
        for x in range(size):
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2:
                pixels[y][x] = PAPER

    # accent dot, echoes the rust pin used on specimen cards in the app
    dot_r = size * 0.045
    dot_cx, dot_cy = cx + radius * 0.62, cy - radius * 0.62
    for y in range(size):
        for x in range(size):
            if (x - dot_cx) ** 2 + (y - dot_cy) ** 2 <= dot_r ** 2:
                pixels[y][x] = RUST

    # letter R, scaled up from the 5x7 bitmap font, centered in the badge
    font_w, font_h = 5, 7
    letter_h = size * letter_ratio
    scale = letter_h / font_h
    letter_w = font_w * scale
    start_x = cx - letter_w / 2
    start_y = cy - letter_h / 2
    for row in range(font_h):
        for col in range(font_w):
            if LETTER_R[row][col] == "1":
                x0 = int(start_x + col * scale)
                x1 = int(start_x + (col + 1) * scale) + 1
                y0 = int(start_y + row * scale)
                y1 = int(start_y + (row + 1) * scale) + 1
                for y in range(max(0, y0), min(size, y1)):
                    for x in range(max(0, x0), min(size, x1)):
                        pixels[y][x] = GOLD

    return pixels


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)

    for size in (192, 512):
        write_png(os.path.join(out_dir, f"icon-{size}.png"), size, size, make_icon(size))

    # favicon: same design, slightly larger letter so it reads at small sizes
    write_png(os.path.join(out_dir, "favicon-32.png"), 32, 32, make_icon(32, badge_ratio=0.9, letter_ratio=0.5))

    print("Icons written to", os.path.abspath(out_dir))

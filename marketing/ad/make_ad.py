"""Render the Tetris Clash 15-second vertical video ad (TikTok / Reels / Shorts).

    python marketing/ad/make_ad.py

Needs Pillow, numpy and imageio-ffmpeg (`pip install pillow numpy imageio-ffmpeg`) and the
Segoe UI fonts that ship with Windows. Writes to marketing/ad/out/:

    tetrisclash-ad-15s.mp4            1080x1920, 30 fps, music and sound effects
    tetrisclash-ad-15s-sfx-only.mp4   same video with sound effects only, for adding platform music
    cover.png                         a still for the post's cover image

Everything is scripted: board states, piece drops, clears and garbage follow the game's real
rules (a Tetris sends 4, a back-to-back T-spin double sends 5), and the audio is synthesised.
"""

from __future__ import annotations

import math
import random
import subprocess
import wave
from dataclasses import dataclass, field
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 30
DURATION = 15.0
FRAMES = int(FPS * DURATION)
OUT = Path(__file__).resolve().parent / 'out'

FONTS = Path('C:/Windows/Fonts')
BLACK = str(FONTS / 'seguibl.ttf')
BLACK_ITALIC = str(FONTS / 'seguibli.ttf')
SEMIBOLD = str(FONTS / 'seguisb.ttf')

# Colours from the landing page (Tailwind) and the game's canvas renderer.
BG = (7, 10, 23)
PANEL = (13, 18, 36)
INDIGO_500 = (99, 102, 241)
INDIGO_200 = (199, 210, 254)
INDIGO_300 = (165, 180, 252)
AMBER_200 = (253, 230, 138)
AMBER_300 = (252, 211, 77)
AMBER_400 = (251, 191, 36)
AMBER_950 = (69, 26, 3)
ROSE_300 = (253, 164, 175)
ROSE_400 = (251, 113, 133)
FUCHSIA_300 = (240, 171, 252)
FUCHSIA_400 = (232, 121, 249)
FUCHSIA_500 = (217, 70, 239)
CYAN_200 = (165, 243, 252)
CYAN_400 = (34, 211, 238)
PURPLE_400 = (192, 132, 252)
WHITE = (255, 255, 255)
TAGLINE = [AMBER_300, ROSE_400, FUCHSIA_400]


def hex_rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


PIECE_COLORS = {
    'I': hex_rgb('#2ad4f5'),
    'O': hex_rgb('#fcd22b'),
    'T': hex_rgb('#b34ee8'),
    'S': hex_rgb('#5ad43c'),
    'Z': hex_rgb('#f23a4b'),
    'J': hex_rgb('#3a6cf2'),
    'L': hex_rgb('#fa8c28'),
    'G': hex_rgb('#8a8f99'),
    'X': (52, 58, 76),  # topped-out board
}
SPAWN_COL = {'I': 3, 'O': 4, 'T': 3, 'S': 3, 'Z': 3, 'J': 3, 'L': 3}


# ---------------------------------------------------------------- helpers

def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def prog(t: float, start: float, dur: float) -> float:
    return clamp((t - start) / dur)


def ease_out(p: float) -> float:
    return 1 - (1 - p) ** 3


def ease_in(p: float) -> float:
    return p * p


def ease_in_out(p: float) -> float:
    return 3 * p * p - 2 * p * p * p


def ease_out_back(p: float, s: float = 1.9) -> float:
    p -= 1
    return 1 + p * p * ((s + 1) * p + s)


def mix(a, b, k: float):
    return tuple(int(round(x + (y - x) * k)) for x, y in zip(a, b))


_fonts: dict = {}


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    key = (path, size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(path, size)
    return _fonts[key]


def gradient(w: int, h: int, stops) -> Image.Image:
    xs = np.linspace(0, 1, max(w, 2))
    n = len(stops) - 1
    seg = np.minimum((xs * n).astype(int), n - 1)
    local = (xs * n - seg)[:, None]
    stops = np.array(stops, dtype=float)
    row = stops[seg] + (stops[seg + 1] - stops[seg]) * local
    return Image.fromarray(np.repeat(row[None, :, :], h, axis=0).astype(np.uint8)[:, :w], 'RGB')


def text_image(text, size, *, face=BLACK, fill=WHITE, grad=None, glow=None, glow_radius=16,
               glow_strength=1.6, tracking=0, max_width=None, shadow=True) -> Image.Image:
    """Text as an RGBA image cropped to its ink, with optional gradient fill and glow."""

    def width(f):
        if tracking:
            return sum(f.getlength(ch) for ch in text) + tracking * (len(text) - 1)
        return f.getlength(text)

    f = font(face, size)
    while max_width and width(f) > max_width and size > 16:
        size -= 2
        f = font(face, size)

    ascent, descent = f.getmetrics()
    pad = glow_radius * 3 if glow else 24
    w = int(width(f)) + 2 * pad + size // 4
    h = ascent + descent + 2 * pad
    mask = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(mask)
    if tracking:
        x = pad
        for ch in text:
            d.text((x, pad), ch, font=f, fill=255)
            x += f.getlength(ch) + tracking
    else:
        d.text((pad, pad), text, font=f, fill=255)

    l, t, r, b = mask.getbbox()
    mask = mask.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))
    w, h = mask.size

    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    if shadow:
        blur = mask.filter(ImageFilter.GaussianBlur(max(2, size * 0.05)))
        blur = ImageChops.offset(blur, 0, max(2, size // 22)).point(lambda v: int(v * 0.8))
        layer = Image.new('RGBA', (w, h), (0, 0, 0, 255))
        layer.putalpha(blur)
        out.alpha_composite(layer)
    if glow:
        blur = mask.filter(ImageFilter.GaussianBlur(glow_radius))
        blur = blur.point(lambda v: min(255, int(v * glow_strength)))
        layer = Image.new('RGBA', (w, h), glow + (255,))
        layer.putalpha(blur)
        out.alpha_composite(layer)

    fill_img = gradient(w, h, grad) if grad else Image.new('RGB', (w, h), fill)
    ink = fill_img.convert('RGBA')
    ink.putalpha(mask)
    out.alpha_composite(ink)
    return out


def split(img: Image.Image):
    return img.convert('RGB'), img.getchannel('A')


def blit(frame: Image.Image, img: Image.Image, cx: float, cy: float, scale=1.0, alpha=1.0):
    """Paste an RGBA image centred on (cx, cy)."""
    if alpha <= 0.01 or scale <= 0.01:
        return
    if abs(scale - 1) > 0.004:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))),
                         Image.BILINEAR)
    mask = img.getchannel('A')
    if alpha < 0.995:
        mask = mask.point(lambda v: int(v * alpha))
    frame.paste(img.convert('RGB'), (int(cx - img.width / 2), int(cy - img.height / 2)), mask)


_masks: dict = {}


def const_mask(w: int, h: int, a: int) -> Image.Image:
    key = (w, h, a)
    if key not in _masks:
        _masks[key] = Image.new('L', (w, h), a)
    return _masks[key]


def fill_rect(img: Image.Image, color, x0, y0, w, h, alpha: float):
    a = int(clamp(alpha) * 255) // 8 * 8
    if a <= 0 or w <= 0 or h <= 0:
        return
    img.paste(color, (int(x0), int(y0), int(x0) + int(w), int(y0) + int(h)),
              const_mask(int(w), int(h), a))


def overlay(frame: Image.Image, color, alpha: float):
    if alpha > 0.01:
        frame.paste(Image.blend(frame, Image.new('RGB', frame.size, color), clamp(alpha)))


# ---------------------------------------------------------------- blocks and boards

CELL = 38
COLS, ROWS = 10, 20
BW, BH = COLS * CELL, ROWS * CELL
BOARD_Y = 640
INNER = CELL - 2
CLEAR_FLASH = 0.22
RISE = 0.32


def block_sprite(color, size: int, radius: int = 4) -> Image.Image:
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color + (255,))
    band = max(3, size // 9)
    shade = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ds = ImageDraw.Draw(shade)
    ds.rectangle([0, 0, size, band - 1], fill=(255, 255, 255, 90))
    ds.rectangle([0, size - band, size, size], fill=(0, 0, 0, 64))
    shade.putalpha(ImageChops.multiply(shade.getchannel('A'), im.getchannel('A')))
    im.alpha_composite(shade)
    return im


SPRITES = {k: split(block_sprite(c, INNER)) for k, c in PIECE_COLORS.items()}


def ghost_sprite(color) -> Image.Image:
    im = Image.new('RGBA', (INNER, INNER), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle([1, 1, INNER - 2, INNER - 2], radius=4,
                                         fill=color + (40,), outline=color + (170,), width=2)
    return im


GHOSTS = {k: split(ghost_sprite(c)) for k, c in PIECE_COLORS.items()}


def make_empty_board() -> Image.Image:
    im = Image.new('RGB', (BW, BH), PANEL)
    d = ImageDraw.Draw(im)
    empty = mix(PANEL, WHITE, 0.035)
    for r in range(ROWS):
        for c in range(COLS):
            d.rounded_rectangle([c * CELL + 1, r * CELL + 1, c * CELL + INNER, r * CELL + INNER],
                                radius=4, fill=empty)
    return im


EMPTY_BOARD = make_empty_board()


def make_panel():
    pad, margin = 14, 44
    w, h = BW + 2 * (pad + margin), BH + 2 * (pad + margin)
    shadow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(shadow).rounded_rectangle([margin, margin + 18, w - margin, h - margin + 18],
                                             26, fill=190)
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    im = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    im.putalpha(shadow)
    panel = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle([margin, margin, w - margin - 1, h - margin - 1], 24,
                                            fill=PANEL + (255,), outline=mix(PANEL, INDIGO_500, 0.4) + (255,),
                                            width=3)
    im.alpha_composite(panel)
    return split(im), pad + margin


(PANEL_RGB, PANEL_MASK), PANEL_OFF = make_panel()

_streak = Image.linear_gradient('L').resize((1, 256))  # 0 at top, 255 at bottom


def parse(rows: list[str]) -> list[list[str]]:
    rows = ['.' * COLS] * (ROWS - len(rows)) + rows
    return [list(r) for r in rows]


@dataclass
class Drop:
    kind: str
    cells: list
    spawn: float
    land: float
    via: list | None = None
    spin: float | None = None


class Board:
    def __init__(self, x: int, rows: list[str]):
        self.x = x
        self.snaps = [(-1.0, parse(rows))]
        self.drops: list[Drop] = []
        self.locks = []
        self.clears = []
        self.rises = []
        self.hits = []
        self.death = None

    @property
    def grid(self):
        return self.snaps[-1][1]

    def cell_xy(self, c: float, r: float) -> tuple[float, float]:
        return self.x + c * CELL + CELL / 2, BOARD_Y + r * CELL + CELL / 2

    def drop(self, kind, cells, spawn, land, via=None, spin=None):
        self.drops.append(Drop(kind, cells, spawn, land, via, spin))
        g = [row[:] for row in self.grid]
        for c, r in cells:
            g[r][c] = kind
        self.snaps.append((land, g))
        self.locks.append((land, cells))

    def clear(self, t, rows):
        self.clears.append((t, rows))
        kept = [row[:] for i, row in enumerate(self.grid) if i not in rows]
        self.snaps.append((t + CLEAR_FLASH, [['.'] * COLS for _ in rows] + kept))

    def garbage(self, t, lines, hole):
        g = [row[:] for row in self.grid[lines:]]
        g += [['.' if c == hole else 'G' for c in range(COLS)] for _ in range(lines)]
        self.snaps.append((t, g))
        self.rises.append((t, lines))
        self.hits.append(t)

    def grid_at(self, t):
        g = self.snaps[0][1]
        for ts, snap in self.snaps:
            if ts <= t:
                g = snap
        return g

    def piece_at(self, d: Drop, t: float):
        """Falling piece cells (float rows), ghost cells and the hard-drop streak, or None."""
        if not (d.spawn <= t < d.land):
            return None
        if d.via and t >= d.spin:
            return d.cells, None, None
        target = d.via or d.cells
        fall_end = d.spin - 0.2 if d.via else d.land
        if t >= fall_end:
            return target, None, None
        fall_start = fall_end - 0.09
        min_c = min(c for c, _ in target)
        min_r = min(r for _, r in target)
        shift = SPAWN_COL[d.kind] - min_c
        steps = int(clamp((t - d.spawn - 0.08) / 0.05, 0, abs(shift)))
        dc = shift - int(math.copysign(steps, shift)) if shift else 0
        hover = -min_r + min(1, int((min(t, fall_start) - d.spawn) / 0.25))
        if t < fall_start:
            dr = hover
            streak = None
        else:
            dr = hover * (1 - ease_in((t - fall_start) / (fall_end - fall_start)))
            streak = hover - dr  # rows between where the drop started and where the piece is now
        cells = [(c + dc, r + dr) for c, r in target]
        ghost = target if dc == 0 else None
        return cells, ghost, streak

    def offset(self, t) -> tuple[float, float]:
        dx = dy = 0.0
        for lt, _ in self.locks:
            if lt <= t < lt + 0.14:
                dy += 5 * (1 - prog(t, lt, 0.14))
        for ct, rows in self.clears:
            if ct + CLEAR_FLASH <= t < ct + CLEAR_FLASH + 0.2:
                dy += 3 * len(rows) * (1 - prog(t, ct + CLEAR_FLASH, 0.2))
        for ht in self.hits:
            if ht <= t < ht + 0.45:
                p = prog(t, ht, 0.45)
                dx += 16 * (1 - p) ** 2 * math.sin(p * 46)
                dy += 10 * (1 - p) ** 2
        return dx, dy

    def render(self, frame: Image.Image, t: float, alpha: float = 1.0, danger: float = 0.0):
        surf = EMPTY_BOARD.copy()
        g = self.grid_at(t)

        rise = 0.0
        rising = []
        for rt, lines in self.rises:
            if rt <= t < rt + RISE:
                p = prog(t, rt, RISE)
                rise += lines * CELL * (1 - ease_out(p))
                rising.append((lines, p))

        dead = 0
        if self.death is not None and t >= self.death:
            dead = int(round(ease_out(prog(t, self.death, 0.45)) * ROWS))

        for r in range(ROWS):
            y = r * CELL + rise
            if y >= BH:
                continue
            for c in range(COLS):
                v = g[r][c]
                if v == '.':
                    continue
                rgb, m = SPRITES['X' if r >= ROWS - dead else v]
                surf.paste(rgb, (c * CELL + 1, int(y) + 1), m)

        for lines, p in rising:
            band = lines * CELL
            fill_rect(surf, ROSE_400, 0, BH - band + rise, BW, band, 0.45 * (1 - p))

        for ct, rows in self.clears:
            if ct <= t < ct + CLEAR_FLASH:
                a = math.sin(math.pi * prog(t, ct, CLEAR_FLASH)) * 0.9
                for r in rows:
                    fill_rect(surf, WHITE, 0, r * CELL, BW, CELL, a)

        for d in self.drops:
            state = self.piece_at(d, t)
            if not state:
                continue
            cells, ghost, streak = state
            if ghost:
                rgb, m = GHOSTS[d.kind]
                for c, r in ghost:
                    surf.paste(rgb, (c * CELL + 1, r * CELL + 1), m)
            if streak is not None:
                for c in {c for c, _ in cells}:
                    top = min(r for cc, r in cells if cc == c)
                    y0, y1 = (top + streak) * CELL, top * CELL
                    if y1 - y0 > 4:
                        mask = _streak.resize((INNER, int(y1 - y0))).point(lambda v: v // 3)
                        surf.paste(PIECE_COLORS[d.kind], (int(c * CELL + 1), int(y0)), mask)
            rgb, m = SPRITES[d.kind]
            for c, r in cells:
                surf.paste(rgb, (int(c * CELL + 1), int(round(r * CELL)) + 1), m)
            if d.via and t >= d.spin:
                for c, r in cells:
                    fill_rect(surf, FUCHSIA_300, c * CELL + 1, r * CELL + 1, INNER, INNER,
                              0.7 * (1 - prog(t, d.spin, d.land - d.spin)))

        for lt, cells in self.locks:
            if lt <= t < lt + 0.14:
                for c, r in cells:
                    fill_rect(surf, WHITE, c * CELL + 1, r * CELL + 1, INNER, INNER,
                              0.6 * (1 - prog(t, lt, 0.14)))

        for ht in self.hits:
            if ht <= t < ht + 0.35:
                fill_rect(surf, ROSE_400, 0, 0, BW, BH, 0.35 * (1 - prog(t, ht, 0.35)))

        dx, dy = self.offset(t)
        x, y = int(self.x + dx), int(BOARD_Y + dy)
        a = int(clamp(alpha) * 255)
        pmask = PANEL_MASK if a >= 255 else PANEL_MASK.point(lambda v: v * a // 255)
        frame.paste(PANEL_RGB, (x - PANEL_OFF, y - PANEL_OFF), pmask)
        if danger > 0.01:
            color = mix(PANEL, ROSE_400, danger)
            ImageDraw.Draw(frame).rounded_rectangle([x - 14, y - 14, x + BW + 13, y + BH + 13], 24,
                                                    outline=color, width=4)
        frame.paste(surf, (x, y), None if a >= 255 else const_mask(BW, BH, a))


# ---------------------------------------------------------------- effects

@dataclass
class Text:
    img: Image.Image
    cx: float
    cy: float
    t_in: float
    t_out: float
    style: str = 'slam'


def draw_text(frame, el: Text, t: float):
    if t < el.t_in or t > el.t_out + 0.3:
        return
    scale, dy = 1.0, 0.0
    if el.style == 'slam':
        p = prog(t, el.t_in, 0.22)
        scale = 1 + 0.7 * (1 - ease_out(p))
        alpha = clamp(p * 3)
    elif el.style == 'ko':
        p = prog(t, el.t_in, 0.16)
        scale = 1 + 2.4 * (1 - ease_in(p)) if p < 1 else 1 + 0.06 * math.sin((t - el.t_in) * 9) * math.exp(-(t - el.t_in) * 3)
        alpha = clamp(p * 2)
    elif el.style == 'pop':
        p = prog(t, el.t_in, 0.3)
        scale = 0.45 + 0.55 * ease_out_back(p)
        alpha = clamp(p * 3)
    else:  # rise
        p = prog(t, el.t_in, 0.35)
        dy = 46 * (1 - ease_out(p))
        alpha = p
    q = prog(t, el.t_out, 0.25)
    alpha *= 1 - q
    dy -= 40 * ease_in(q)
    blit(frame, el.img, el.cx, el.cy + dy, scale, alpha)


def orb_sprite(color, r: int = 30) -> Image.Image:
    s = r * 5
    base = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(base).ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=color + (255,))
    glow = base.filter(ImageFilter.GaussianBlur(r * 0.9))
    core = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(core).ellipse([s / 2 - r * 0.5, s / 2 - r * 0.5, s / 2 + r * 0.5, s / 2 + r * 0.5],
                                 fill=(255, 255, 255, 255))
    core = core.filter(ImageFilter.GaussianBlur(r * 0.25))
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.alpha_composite(glow)
    out.alpha_composite(glow)
    out.alpha_composite(core)
    return out


@dataclass
class Shot:
    t0: float
    t1: float
    p0: tuple
    p1: tuple
    orb: Image.Image


def draw_shot(frame, s: Shot, t: float):
    if not (s.t0 <= t <= s.t1):
        return
    p = prog(t, s.t0, s.t1 - s.t0)
    ctrl = ((s.p0[0] + s.p1[0]) / 2, min(s.p0[1], s.p1[1]) - 420)

    def at(q):
        q = ease_in_out(q)
        x = (1 - q) ** 2 * s.p0[0] + 2 * (1 - q) * q * ctrl[0] + q * q * s.p1[0]
        y = (1 - q) ** 2 * s.p0[1] + 2 * (1 - q) * q * ctrl[1] + q * q * s.p1[1]
        return x, y

    for k in range(14, -1, -1):
        q = p - k * 0.025
        if q < 0:
            continue
        x, y = at(q)
        blit(frame, s.orb, x, y, scale=1 - k / 17, alpha=(1 - k / 15) * 0.9)


def burst(rng, points, count_each, speed=520, life=(0.5, 0.95), size=(8, 15), up=700):
    parts = []
    for x, y, color in points:
        for _ in range(count_each):
            angle = rng.uniform(0, 2 * math.pi)
            v = rng.uniform(0.3, 1) * speed
            parts.append((x + rng.uniform(-12, 12), y + rng.uniform(-12, 12), math.cos(angle) * v,
                          math.sin(angle) * v - rng.uniform(100, up), color,
                          rng.randint(*size), rng.uniform(*life)))
    return parts


def draw_particles(frame, bursts, t: float):
    for t0, parts in bursts:
        dt = t - t0
        if dt < 0 or dt > 1.5:
            continue
        for x, y, vx, vy, color, size, life in parts:
            if dt > life:
                continue
            k = dt / life
            px, py = x + vx * dt, y + vy * dt + 1100 * dt * dt
            s = max(2, int(size * (1 - 0.5 * k)))
            if 0 <= px - s and px + s < W and 0 <= py - s and py + s < H:
                fill_rect(frame, color, px - s / 2, py - s / 2, s, s, (1 - k) ** 1.4)


# ---------------------------------------------------------------- background

def make_background() -> Image.Image:
    ys = np.linspace(0, 1, H)[:, None]
    top, mid = np.array(BG, float), np.array((14, 18, 44), float)
    col = top + (mid - top) * np.exp(-((ys - 0.5) / 0.32) ** 2)[..., None]
    arr = np.repeat(col, W, axis=1).astype(np.uint8)
    im = Image.fromarray(arr, 'RGB')
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([60, 560, W - 60, 1520], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(140))
    im.paste((67, 56, 202), (0, 0), glow)
    return im


BACKGROUND = make_background()

SHAPES = {
    'I': [(0, 0), (1, 0), (2, 0), (3, 0)], 'O': [(0, 0), (1, 0), (0, 1), (1, 1)],
    'T': [(0, 0), (1, 0), (2, 0), (1, 1)], 'S': [(1, 0), (2, 0), (0, 1), (1, 1)],
    'Z': [(0, 0), (1, 0), (1, 1), (2, 1)], 'J': [(0, 0), (0, 1), (1, 1), (2, 1)],
    'L': [(2, 0), (0, 1), (1, 1), (2, 1)],
}


def silhouette(kind: str, cell: int = 70) -> Image.Image:
    cells = SHAPES[kind]
    w = (max(c for c, _ in cells) + 1) * cell
    h = (max(r for _, r in cells) + 1) * cell
    im = Image.new('RGBA', (w + 4, h + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    color = PIECE_COLORS[kind]
    for c, r in cells:
        d.rounded_rectangle([c * cell + 2, r * cell + 2, c * cell + cell - 4, r * cell + cell - 4], 10,
                            fill=color + (16,), outline=color + (40,), width=2)
    return im


FLOATERS = [(silhouette(k), x, y0, speed) for k, x, y0, speed in [
    ('T', 70, 150, 34), ('L', 930, 420, 26), ('S', 40, 1180, 30), ('I', 780, 1560, 22),
    ('Z', 880, 1000, 38), ('O', 150, 1700, 28), ('J', 520, -100, 24),
]]


def draw_background(t: float) -> Image.Image:
    frame = BACKGROUND.copy()
    for img, x, y0, speed in FLOATERS:
        y = (y0 + speed * t) % (H + 400) - 200
        blit(frame, img, x, y, alpha=0.9)
    return frame


# ---------------------------------------------------------------- the script

@dataclass
class Scene:
    you: Board
    rival: Board
    texts: list = field(default_factory=list)
    shots: list = field(default_factory=list)
    bursts: list = field(default_factory=list)
    shakes: list = field(default_factory=list)
    flashes: list = field(default_factory=list)
    sounds: list = field(default_factory=list)
    assets: dict = field(default_factory=dict)


LEFT_X, RIGHT_X = 110, 590
YOU_CX, RIVAL_CX = LEFT_X + BW / 2, RIGHT_X + BW / 2
MID_Y = BOARD_Y + BH / 2

T_RANK = 8.6      # rank-up scene
T_END = 10.9      # end card


def build_scene() -> Scene:
    rng = random.Random(7)

    # Your stack: a Tetris well in the last column, with a T-spin double slot buried below it.
    you = Board(LEFT_X, [
        '..........',
        'SSJJ...ZZ.',
        'JSSTTTZZL.',
        'JJSSTZZOL.',
        'LL..ZOOJJI',
        'LZ...OOJJI',
        'ZZT.SSOOJI',
    ])
    # The rival's messy stack, eleven rows high.
    rival = Board(RIGHT_X, [
        '....ZZ....',
        'JJ...ZZ..O',
        'J.SS.LLLOO',
        'JSS.TTLI.O',
        'ZZ.TTTLI.S',
        '.ZZLLLOISS',
        'IIIIL.OOIS',
        'JJJ.LLTTTS',
        'OOJ.ZZ.TLL',
        'OO.SSZZ.JL',
        'LLL.SSJJJ.',
    ])
    sc = Scene(you, rival)
    snd = sc.sounds

    # --- 0-2.8s: the hook
    for i, (line, grad) in enumerate([('2 PLAYERS.', None), ('2 MINUTES.', None), ('1 SURVIVOR.', TAGLINE)]):
        img = text_image(line, 112, grad=grad, glow=ROSE_400 if grad else None, glow_radius=22,
                         glow_strength=0.9, max_width=940)
        sc.texts.append(Text(img, W / 2, 300 + i * 118, i * 0.5, 2.7))
        sc.shakes.append((i * 0.5, 0.16, 7))
        snd.append((i * 0.5, 'punch'))

    you.drop('I', [(0, 13), (1, 13), (2, 13), (3, 13)], 0.3, 0.85)
    rival.drop('O', [(7, 9), (8, 9), (7, 10), (8, 10)], 0.55, 1.1)
    you.drop('O', [(4, 13), (5, 13), (4, 14), (5, 14)], 1.0, 1.5)
    rival.drop('I', [(0, 9), (1, 9), (2, 9), (3, 9)], 1.45, 2.0)
    you.drop('L', [(6, 13), (7, 13), (8, 13), (6, 14)], 1.7, 2.25)

    # --- 2.9-5s: a Tetris sends 4 lines
    sc.texts.append(Text(text_image('CLEAR LINES.', 118, max_width=940), W / 2, 330, 2.9, 4.95))
    snd.append((2.9, 'punch'))
    you.drop('I', [(9, 13), (9, 14), (9, 15), (9, 16)], 2.95, 3.5)
    you.clear(3.5, [13, 14, 15, 16])
    sc.shakes.append((3.5, 0.25, 9))
    snd.append((3.5, 'tetris'))
    sc.bursts.append((3.58, burst(rng, [(*you.cell_xy(c, r), PIECE_COLORS[you.grid_at(3.5)[r][c]])
                                         for r in range(13, 17) for c in range(COLS)], 2)))
    sc.texts.append(Text(text_image('TETRIS', 104, face=BLACK_ITALIC, fill=CYAN_200, glow=CYAN_400,
                                    glow_radius=18, max_width=470), YOU_CX, 880, 3.5, 4.55, 'pop'))
    sc.texts.append(Text(text_image('+4 attack', 42, face=SEMIBOLD, fill=ROSE_300), YOU_CX, 965,
                         3.6, 4.55, 'pop'))

    orb_amber = orb_sprite(AMBER_300)
    sc.shots.append(Shot(3.62, 4.05, you.cell_xy(4.5, 14.5), rival.cell_xy(4.5, 17), orb_amber))
    snd.append((3.62, 'whoosh'))
    rival.garbage(4.05, 4, hole=6)
    sc.shakes.append((4.05, 0.3, 11))
    snd.append((4.05, 'impact'))
    sc.bursts.append((4.05, burst(rng, [(*rival.cell_xy(4.5, 18), ROSE_400)] * 3, 14, speed=700)))
    sc.texts.append(Text(text_image('SEND GARBAGE.', 118, grad=TAGLINE, glow=ROSE_400, glow_radius=22,
                                    glow_strength=0.9, max_width=940), W / 2, 460, 4.05, 4.95))
    snd.append((4.05, 'punch'))

    you.drop('O', [(7, 15), (8, 15), (7, 16), (8, 16)], 4.35, 4.85)
    rival.drop('T', [(5, 4), (6, 4), (7, 4), (6, 5)], 4.9, 5.4)

    # --- 5-7s: a back-to-back T-spin double sends 5 more and tops the rival out
    sc.texts.append(Text(text_image('HIT HARDER', 118, max_width=940), W / 2, 330, 5.1, 7.0))
    snd.append((5.1, 'punch'))
    you.drop('T', [(2, 18), (3, 18), (4, 18), (3, 19)], 5.15, 6.0,
             via=[(1, 16), (2, 16), (3, 16), (2, 17)], spin=5.85)
    snd.append((5.85, 'spin'))
    you.clear(6.0, [18, 19])
    sc.shakes.append((6.0, 0.25, 9))
    snd.append((6.0, 'tspin'))
    sc.bursts.append((6.08, burst(rng, [(*you.cell_xy(c, r), PIECE_COLORS[you.grid_at(6.0)[r][c]])
                                         for r in (18, 19) for c in range(COLS)], 3)))
    sc.texts.append(Text(text_image('WITH T-SPINS.', 118, grad=TAGLINE, glow=FUCHSIA_400,
                                    glow_radius=22, glow_strength=0.9, max_width=940),
                         W / 2, 460, 6.0, 7.0))
    sc.texts.append(Text(text_image('BACK-TO-BACK', 46, face=BLACK_ITALIC, fill=AMBER_200,
                                    glow=AMBER_400, glow_radius=12), YOU_CX, 800, 6.0, 6.95, 'pop'))
    sc.texts.append(Text(text_image('T-SPIN DOUBLE', 80, face=BLACK_ITALIC, fill=FUCHSIA_300,
                                    glow=FUCHSIA_500, glow_radius=18, max_width=480),
                         YOU_CX, 875, 6.0, 6.95, 'pop'))
    sc.texts.append(Text(text_image('+5 attack', 42, face=SEMIBOLD, fill=ROSE_300), YOU_CX, 955,
                         6.1, 6.95, 'pop'))

    orb_fuchsia = orb_sprite(FUCHSIA_400)
    sc.shots.append(Shot(6.12, 6.55, you.cell_xy(3, 18.5), rival.cell_xy(4.5, 17), orb_fuchsia))
    snd.append((6.12, 'whoosh'))
    rival.garbage(6.55, 5, hole=2)
    sc.shakes.append((6.55, 0.35, 13))
    snd.append((6.55, 'impact'))
    snd.append((6.55, 'riser'))
    sc.bursts.append((6.55, burst(rng, [(*rival.cell_xy(4.5, 18), FUCHSIA_400)] * 3, 14, speed=700)))
    rival.death = 6.85

    # --- 7.1-8.6s: K.O.
    sc.texts.append(Text(text_image('K.O.', 300, face=BLACK_ITALIC, grad=[AMBER_300, ROSE_400],
                                    glow=ROSE_400, glow_radius=34, glow_strength=1.3),
                         W / 2, MID_Y - 10, 7.1, 8.5, 'ko'))
    sc.shakes.append((7.1, 0.55, 28))
    sc.flashes.append((7.1, 0.35, WHITE, 0.6))
    snd.append((7.1, 'boom'))
    ko_points = [(*rival.cell_xy(c, r), mix(PIECE_COLORS['X'], ROSE_400, rng.random() * 0.8))
                 for r in range(0, ROWS, 2) for c in range(0, COLS, 2)]
    sc.bursts.append((7.12, burst(rng, ko_points, 3, speed=900, life=(0.6, 1.2), size=(10, 20))))
    sc.texts.append(Text(text_image('KNOCK THEM OUT.', 112, grad=TAGLINE, glow=ROSE_400,
                                    glow_radius=22, glow_strength=0.9, max_width=960),
                         W / 2, 390, 7.3, 8.5))

    # --- 8.6-10.9s: rank up
    sc.texts.append(Text(text_image('CLIMB THE RANKS.', 112, max_width=960), W / 2, 330,
                         T_RANK + 0.1, T_END - 0.2))
    snd.append((T_RANK + 0.1, 'punch'))
    sc.texts.append(Text(text_image('From Pebble to Clash Sovereign', 50, face=SEMIBOLD,
                                    fill=INDIGO_200, shadow=False), W / 2, 440,
                         T_RANK + 0.3, T_END - 0.2, 'rise'))
    sc.texts.append(Text(text_image('RANK UP!', 84, face=BLACK_ITALIC, fill=AMBER_200, glow=AMBER_400,
                                    glow_radius=20), W / 2, 700, 9.75, T_END - 0.2, 'pop'))
    sc.flashes.append((9.75, 0.25, WHITE, 0.3))
    sc.shakes.append((9.75, 0.2, 7))
    snd.append((9.0, 'xp'))
    snd.append((9.75, 'rankup'))
    confetti = [(W / 2 + rng.uniform(-360, 360), 980, PIECE_COLORS[rng.choice('IOTSZJL')])
                for _ in range(40)]
    sc.bursts.append((9.75, burst(rng, confetti, 3, speed=650, life=(0.8, 1.4), up=900)))

    sc.assets['card'] = make_card()
    sc.assets['rank_old'] = text_image('TOWER KEEPER', 92, max_width=720)
    sc.assets['rank_new'] = text_image('QUAD STRIKER', 92, grad=[AMBER_300, ROSE_400], glow=AMBER_400,
                                       glow_radius=18, glow_strength=0.8, max_width=720)
    sc.assets['rank_label'] = text_image('YOUR RANK', 34, face=SEMIBOLD, fill=INDIGO_300, tracking=8,
                                         shadow=False)
    sc.assets['xp'] = text_image('+180 XP', 44, face=BLACK, fill=AMBER_300, shadow=False)
    sc.assets['bar'] = gradient(700, 34, [AMBER_300, ROSE_400, FUCHSIA_400])

    # --- 10.9-15s: end card
    sc.assets['logo_block'] = block_sprite(PURPLE_400, 104, radius=16)
    sc.assets['glow'] = end_glow()
    for i in range(4):
        snd.append((T_END + 0.1 + i * 0.09 + 0.2, f'plink{i}'))
    sc.texts.append(Text(text_image('TETRIS CLASH', 138, max_width=980), W / 2, 790, T_END + 0.6,
                         99))
    sc.shakes.append((T_END + 0.6, 0.18, 6))
    snd.append((T_END + 0.6, 'slam'))
    sc.texts.append(Text(text_image('Clear lines.', 80, fill=WHITE), W / 2, 925, T_END + 0.95, 99,
                         'rise'))
    sc.texts.append(Text(text_image('Bury your rival.', 80, grad=TAGLINE, glow=ROSE_400,
                                    glow_radius=18, glow_strength=0.7), W / 2, 1015, T_END + 1.1,
                         99, 'rise'))
    sc.assets['button'] = make_button()
    snd.append((T_END + 1.45, 'cta'))
    sc.texts.append(Text(text_image('tetrisclash.com', 58, face=SEMIBOLD, fill=WHITE), W / 2, 1320,
                         T_END + 1.7, 99, 'rise'))
    sc.texts.append(Text(text_image('Real-time 1v1 battles in your browser', 38, face=SEMIBOLD,
                                    fill=INDIGO_300, shadow=False), W / 2, 1392, T_END + 1.85, 99,
                         'rise'))

    # Board chrome
    sc.assets['vs'] = text_image('VS', 76, face=BLACK_ITALIC, fill=WHITE, glow=FUCHSIA_500,
                                 glow_radius=16)
    sc.assets['you'] = text_image('YOU', 40, face=BLACK, fill=AMBER_300, tracking=10, shadow=False)
    sc.assets['rival'] = text_image('RIVAL', 40, face=BLACK, fill=ROSE_400, tracking=10, shadow=False)
    sc.assets['winner'] = text_image('WINNER', 40, face=BLACK, fill=AMBER_300, tracking=10,
                                     glow=AMBER_400, glow_radius=10, glow_strength=0.8, shadow=False)

    for board, volume in ((you, 1.0), (rival, 0.55)):
        for lt, _ in board.locks:
            snd.append((lt, 'lock', volume))
    return sc


def make_card() -> Image.Image:
    w, h, m = 860, 470, 40
    im = Image.new('RGBA', (w + 2 * m, h + 2 * m), (0, 0, 0, 0))
    shadow = Image.new('L', im.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle([m, m + 20, w + m, h + m + 20], 34, fill=200)
    layer = Image.new('RGBA', im.size, (0, 0, 0, 255))
    layer.putalpha(shadow.filter(ImageFilter.GaussianBlur(26)))
    im.alpha_composite(layer)
    card = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle([m, m, w + m, h + m], 34, fill=PANEL + (255,),
                                           outline=mix(PANEL, FUCHSIA_400, 0.45) + (255,), width=3)
    im.alpha_composite(card)
    return im


def make_button() -> Image.Image:
    w, h, m = 640, 136, 50
    im = Image.new('RGBA', (w + 2 * m, h + 2 * m), (0, 0, 0, 0))
    glow = Image.new('L', im.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle([m, m, w + m, h + m], h // 2, fill=150)
    layer = Image.new('RGBA', im.size, AMBER_400 + (255,))
    layer.putalpha(glow.filter(ImageFilter.GaussianBlur(28)))
    im.alpha_composite(layer)
    pill = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(pill)
    d.rounded_rectangle([m, m, w + m, h + m], h // 2, fill=AMBER_400 + (255,))
    d.rounded_rectangle([m + 6, m + 5, w + m - 6, m + h // 2], h // 2 - 6, fill=(255, 214, 102, 255))
    d.rounded_rectangle([m, m + h // 2 - 20, w + m, h + m], h // 2, fill=AMBER_400 + (255,))
    im.alpha_composite(pill)
    label = text_image('PLAY FREE', 72, face=BLACK, fill=AMBER_950, shadow=False)
    im.alpha_composite(label, (im.width // 2 - label.width // 2, im.height // 2 - label.height // 2 + 2))
    return im


def end_glow() -> Image.Image:
    size = 1000
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([200, 200, 800, 800], fill=120)
    mask = mask.filter(ImageFilter.GaussianBlur(150))
    layer = Image.new('RGBA', (size, size), (147, 51, 234, 255))
    layer.putalpha(mask)
    im.alpha_composite(layer)
    return im


# ---------------------------------------------------------------- frames

def boards_alpha(t: float) -> float:
    return ease_out(prog(t, 0, 0.3)) * (1 - prog(t, T_END - 0.2, 0.3))


def draw_rank_card(frame, sc: Scene, t: float):
    if t < T_RANK + 0.2 or t > T_END + 0.1:
        return
    a = ease_out(prog(t, T_RANK + 0.2, 0.3)) * (1 - prog(t, T_END - 0.2, 0.3))
    cy = 1010 + 40 * (1 - ease_out(prog(t, T_RANK + 0.2, 0.35)))
    blit(frame, sc.assets['card'], W / 2, cy, alpha=a)
    blit(frame, sc.assets['rank_label'], W / 2, cy - 150, alpha=a)

    if t < 9.75:
        blit(frame, sc.assets['rank_old'], W / 2, cy - 55, alpha=a)
    else:
        p = prog(t, 9.75, 0.22)
        blit(frame, sc.assets['rank_new'], W / 2, cy - 55, scale=1 + 0.6 * (1 - ease_out(p)),
             alpha=a * clamp(p * 3))

    # XP bar
    bx, by, bw, bh = W / 2 - 350, cy + 70, 700, 34
    d = ImageDraw.Draw(frame)
    track = mix(PANEL, WHITE, 0.08)
    d.rounded_rectangle([bx, by, bx + bw, by + bh], bh // 2, fill=mix(PANEL, track, a))
    if t < 9.75:
        fill = 0.3 + 0.7 * ease_in_out(prog(t, 9.0, 0.7))
    else:
        fill = 0.12 * ease_out(prog(t, 9.9, 0.4))
    fw = int(bw * fill)
    if fw > bh:
        mask = Image.new('L', (fw, bh), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, fw - 1, bh - 1], bh // 2, fill=int(255 * a))
        frame.paste(sc.assets['bar'].crop((0, 0, fw, bh)), (int(bx), int(by)), mask)
    if 9.72 <= t < 10.0:
        fill_rect(frame, WHITE, bx, by, bw, bh, 0.8 * (1 - prog(t, 9.72, 0.28)))

    if t >= 9.0:
        p = prog(t, 9.0, 0.3)
        blit(frame, sc.assets['xp'], W / 2, cy + 160, scale=0.5 + 0.5 * ease_out_back(p),
             alpha=a * clamp(p * 3))


def draw_end_card(frame, sc: Scene, t: float):
    if t < T_END:
        return
    blit(frame, sc.assets['glow'], W / 2, 560, alpha=ease_out(prog(t, T_END, 0.6)))

    # The T-piece logo drops in one block at a time.
    block = sc.assets['logo_block']
    size, gap = 104, 10
    cells = [(-1, 0), (0, 0), (1, 0), (0, 1)]
    for i, (c, r) in enumerate(cells):
        start = T_END + 0.1 + i * 0.09
        if t < start:
            continue
        p = prog(t, start, 0.3)
        x = W / 2 + c * (size + gap)
        y = 520 + r * (size + gap) - 420 * (1 - ease_out_back(p, 1.2))
        blit(frame, block, x, y, alpha=clamp(p * 4))

    if t >= T_END + 1.45:
        p = prog(t, T_END + 1.45, 0.35)
        pulse = 1 + 0.035 * math.sin((t - T_END - 1.8) * 2 * math.pi * 1.2) if t > T_END + 1.8 else 1
        blit(frame, sc.assets['button'], W / 2, 1180, scale=(0.4 + 0.6 * ease_out_back(p)) * pulse,
             alpha=clamp(p * 3))


def render_frame(sc: Scene, t: float) -> Image.Image:
    frame = draw_background(t)
    ba = boards_alpha(t)

    danger = 0.0
    if 6.55 <= t < 7.1:
        danger = 0.5 + 0.5 * math.sin((t - 6.55) * 30)
    if ba > 0.01:
        sc.you.render(frame, t, ba)
        sc.rival.render(frame, t, ba, danger)
        blit(frame, sc.assets['vs'], W / 2, MID_Y, alpha=ba)
        label_y = BOARD_Y + BH + 52
        you_label = sc.assets['winner'] if t >= 7.2 else sc.assets['you']
        blit(frame, you_label, YOU_CX, label_y, alpha=ba)
        blit(frame, sc.assets['rival'], RIVAL_CX, label_y, alpha=ba * (0.45 if t >= 7.2 else 1))

    for s in sc.shots:
        draw_shot(frame, s, t)
    draw_particles(frame, sc.bursts, t)

    # Board-level texts (callouts, K.O.) sit under the rank scene's dimming; headlines stay on top.
    on_top = [el.cy < 600 or el.t_in >= T_RANK for el in sc.texts]
    for el, top in zip(sc.texts, on_top):
        if not top:
            draw_text(frame, el, t)

    if T_RANK <= t < T_END + 0.4:
        dim = ease_out(prog(t, T_RANK, 0.3)) * (1 - prog(t, T_END - 0.2, 0.4))
        overlay(frame, BG, 0.72 * dim)
    draw_rank_card(frame, sc, t)
    draw_end_card(frame, sc, t)

    for el, top in zip(sc.texts, on_top):
        if top:
            draw_text(frame, el, t)

    for t0, dur, color, amount in sc.flashes:
        if t0 <= t < t0 + dur:
            overlay(frame, color, amount * (1 - prog(t, t0, dur)))

    dx = dy = 0.0
    for t0, dur, amp in sc.shakes:
        if t0 <= t < t0 + dur:
            k = (1 - prog(t, t0, dur)) ** 2
            dx += amp * k * math.sin(t * 97)
            dy += amp * k * math.cos(t * 73)
    if abs(dx) >= 1 or abs(dy) >= 1:
        frame = ImageChops.offset(frame, int(dx), int(dy))
    return frame


# ---------------------------------------------------------------- audio

SR = 44100
N = int(SR * DURATION)


def secs(d: float) -> np.ndarray:
    return np.arange(int(d * SR)) / SR


def place(buf, t, sig, gain=1.0):
    i = int(round(t * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[:j - i] * gain


def lowpass(x, k):
    k = max(1, int(k))
    return np.convolve(x, np.ones(k) / k, mode='same')


def noise(d, seed):
    return np.random.default_rng(seed).standard_normal(int(d * SR))


def attack_env(tt, a=0.004):
    return np.minimum(1, tt / a)


def kick():
    tt = secs(0.35)
    f = 48 + 120 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 8)


def hat(seed):
    n = noise(0.06, seed)
    tt = secs(0.06)
    return (n - lowpass(n, 3)) * np.exp(-tt * 80) * 0.5


def clap(seed):
    n = noise(0.2, seed)
    tt = secs(0.2)
    body = (lowpass(n, 3) - lowpass(n, 18)) * np.exp(-tt * 22)
    return body * 1.6 + np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 30) * 0.3


def saw(freq, d, harmonics=10):
    tt = secs(d)
    s = np.zeros_like(tt)
    for k in range(1, harmonics + 1):
        if freq * k < 12000:
            s += np.sin(2 * np.pi * freq * k * tt) / k
    return s * 0.6


def square(freq, d, harmonics=7):
    tt = secs(d)
    s = np.zeros_like(tt)
    for k in range(1, 2 * harmonics, 2):
        if freq * k < 12000:
            s += np.sin(2 * np.pi * freq * k * tt) / k
    return s * 0.7


def bass_note(freq):
    tt = secs(0.24)
    return saw(freq, 0.24, 8) * np.exp(-tt * 7) * attack_env(tt)


def pluck(freq):
    tt = secs(0.2)
    return square(freq, 0.2, 5) * np.exp(-tt * 16) * attack_env(tt, 0.002)


def bell(freq, d=0.7):
    tt = secs(d)
    s = (np.sin(2 * np.pi * freq * tt)
         + 0.4 * np.sin(2 * np.pi * 2 * freq * tt) * np.exp(-tt * 6)
         + 0.2 * np.sin(2 * np.pi * 3.01 * freq * tt) * np.exp(-tt * 10))
    return s * np.exp(-tt * 5) * attack_env(tt, 0.002)


def whoosh(d=0.45, seed=5):
    n = noise(d, seed)
    e = np.linspace(0, 1, len(n))
    sig = lowpass(n, 30) * (1 - e) * 3 + (n - lowpass(n, 4)) * e * 0.5
    return sig * np.sin(np.pi * e) ** 2 * 0.6


def impact(seed=3):
    tt = secs(0.55)
    f = 40 + 100 * np.exp(-tt * 22)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7)
    crunch = lowpass(noise(0.55, seed), 6) * np.exp(-tt * 20) * 1.2
    return body + crunch


def boom():
    tt = secs(1.9)
    f = 36 + 150 * np.exp(-tt * 9)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.2) * 1.1
    rumble = lowpass(noise(1.9, 9), 40) * np.exp(-tt * 3.5) * 6
    n = noise(1.9, 11)
    crack = (n - lowpass(n, 5)) * np.exp(-tt * 18) * 0.6
    return body + rumble + crack


def riser(d=0.5):
    tt = secs(d)
    f = 300 + 1500 * (tt / d) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (tt / d) ** 2 * 0.25
    n = noise(d, 21)
    hiss = (n - lowpass(n, 3)) * (tt / d) ** 3 * 0.4
    return tone + hiss


def lock_click():
    tt = secs(0.09)
    body = np.sin(2 * np.pi * (170 - 700 * tt) * tt) * np.exp(-tt * 45)
    tick = noise(0.09, 13) * np.exp(-tt * 150) * 0.35
    return body + tick


def punch():
    tt = secs(0.25)
    f = 60 + 160 * np.exp(-tt * 40)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 14)
    n = noise(0.25, 17)
    snap = (n - lowpass(n, 6)) * np.exp(-tt * 40) * 0.5
    return body + snap


def chime(freqs, spacing=0.05, d=0.8):
    out = np.zeros(int((d + spacing * len(freqs)) * SR))
    for i, f in enumerate(freqs):
        place(out, i * spacing, bell(f, d), 1 / len(freqs) ** 0.5)
    return out


def shimmer(d=0.9, seed=31):
    n = noise(d, seed)
    tt = secs(d)
    return (n - lowpass(n, 2)) * np.exp(-tt * 5) * 0.25


def layer(*sigs):
    """Sum signals of different lengths."""
    out = np.zeros(max(len(s) for s in sigs))
    for s in sigs:
        out[:len(s)] += s
    return out


A5, C6, E6, A6 = 880.0, 1046.5, 1318.5, 1760.0
SOUND = {
    'punch': lambda: punch() * 0.55,
    'lock': lambda: lock_click() * 0.45,
    'tetris': lambda: layer(chime([A5, C6, E6, A6]) * 0.5, shimmer(), impact(19) * 0.35),
    'spin': lambda: whoosh(0.2, 41) * 0.8,
    'tspin': lambda: chime([C6, E6, 1568.0, 2093.0]) * 0.5,
    'whoosh': lambda: whoosh(0.45),
    'impact': lambda: impact() * 0.8,
    'riser': lambda: riser(0.52),
    'boom': lambda: boom() * 0.9,
    'rankup': lambda: chime([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.06, 1.0) * 0.55,
    'slam': lambda: layer(impact(7) * 0.6, shimmer(1.0, 33)),
    'cta': lambda: chime([783.99, 1174.66], 0.08) * 0.45,
    'plink0': lambda: bell(659.25, 0.4) * 0.3,
    'plink1': lambda: bell(783.99, 0.4) * 0.3,
    'plink2': lambda: bell(987.77, 0.4) * 0.3,
    'plink3': lambda: bell(1318.5, 0.5) * 0.35,
}


def xp_fill():
    d = 0.72
    tt = secs(d)
    f = 400 + 900 * (tt / d)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
    gate = (np.sin(2 * np.pi * 22 * tt) > 0).astype(float)
    return tone * gate * 0.12 * attack_env(tt, 0.01)


def build_music() -> np.ndarray:
    m = np.zeros(N)
    # Am - F - C - G, one chord per bar at 120 BPM.
    chords = [(110.0, [220.0, 261.63, 329.63]), (87.31, [174.61, 220.0, 261.63]),
              (130.81, [261.63, 329.63, 392.0]), (98.0, [196.0, 246.94, 293.66])]
    kick_sig = kick()
    for b in range(28):
        t = b * 0.5
        place(m, t, kick_sig, 0.8)
        if t >= 2.9:
            place(m, t + 0.25, hat(b), 1.0)
            if b % 2 == 1:
                place(m, t, clap(b), 0.45)
    for e in range(56):
        t = e * 0.25
        root, chord = chords[int(t // 2) % 4]
        place(m, t, bass_note(root * (2 if e % 8 in (2, 5, 7) else 1)), 0.32)
        if t >= 2.9:
            tones = chord + [chord[0] * 2]
            place(m, t, pluck(tones[e % 4] * 2), 0.07)
    # Pads under the end card
    for i, (root, chord) in enumerate([chords[1], chords[2]]):
        t0 = 11.0 + i * 1.5
        tt = secs(1.6)
        env = np.minimum(1, tt / 0.3) * np.exp(-np.maximum(0, tt - 1.3) * 8)
        for f in chord:
            place(m, t0, lowpass(saw(f, 1.6, 6), 6) * env, 0.05)
    # Final stab on A minor.
    tt = secs(1.0)
    stab = sum(saw(f, 1.0, 8) for f in (110.0, 220.0, 261.63, 329.63, 440.0)) * np.exp(-tt * 3)
    place(m, 14.0, stab, 0.12)
    place(m, 14.0, kick_sig, 0.9)

    gain = np.ones(N)
    tt = np.arange(N) / SR
    gain[(tt >= 6.98) & (tt < 7.1)] = 0.0              # a beat of silence before the K.O.
    gain *= np.where((tt >= 7.1) & (tt < 7.8), 0.55, 1.0)
    gain *= np.clip((15.0 - tt) / 0.5, 0, 1)             # fade out
    return m * gain


def build_sfx(sc: Scene) -> np.ndarray:
    s = np.zeros(N)
    for event in sc.sounds:
        t, name = event[0], event[1]
        volume = event[2] if len(event) > 2 else 1.0
        sig = xp_fill() if name == 'xp' else SOUND[name]()
        place(s, t, sig, volume)
    return s


def master(x: np.ndarray) -> np.ndarray:
    x = np.tanh(x * 1.1)
    return x / (np.max(np.abs(x)) + 1e-9) * 0.9


def write_wav(path: Path, x: np.ndarray):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())


# ---------------------------------------------------------------- main

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sc = build_scene()
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    video = OUT / '_video.mp4'

    proc = subprocess.Popen([
        ffmpeg, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
        '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
        '-pix_fmt', 'yuv420p', str(video),
    ], stdin=subprocess.PIPE)

    stills = {int(s * FPS): name for s, name in [
        (0.9, 'still-hook'), (3.62, 'still-tetris'), (6.1, 'still-tspin'), (7.45, 'cover'),
        (9.9, 'still-rank'), (13.5, 'still-end'),
    ]}
    for i in range(FRAMES):
        frame = render_frame(sc, i / FPS)
        proc.stdin.write(frame.tobytes())
        if i in stills:
            frame.save(OUT / f'{stills[i]}.png')
        if i % 30 == 0:
            print(f'frame {i}/{FRAMES}', flush=True)
    proc.stdin.close()
    proc.wait()

    music, sfx = build_music(), build_sfx(sc)
    mixes = {
        'tetrisclash-ad-15s.mp4': master(music * 0.6 + sfx),
        'tetrisclash-ad-15s-sfx-only.mp4': master(sfx),
    }
    for name, audio in mixes.items():
        wav = OUT / '_audio.wav'
        write_wav(wav, audio)
        subprocess.run([
            ffmpeg, '-y', '-loglevel', 'error', '-i', str(video), '-i', str(wav), '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(OUT / name),
        ], check=True)
        wav.unlink()
    video.unlink()
    print('done:', ', '.join(mixes))


if __name__ == '__main__':
    main()

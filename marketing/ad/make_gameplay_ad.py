"""Render the Tetris Clash gameplay ad: a 24-second vertical video (TikTok / Reels / Shorts)
cut from a real screen recording of a ranked match.

    python marketing/ad/make_gameplay_ad.py ~/Desktop/tetris.mov

Needs Pillow, numpy, scipy, opencv-python-headless, pyloudnorm and imageio-ffmpeg
(`pip install pillow numpy scipy opencv-python-headless pyloudnorm imageio-ffmpeg`). The fonts
(Montserrat and Instrument Sans, both SIL Open Font License) download on first run.

The recording is the 3024x1964 Retina capture of TSPinPro vs tspin_tony from 2 Oct 2026
(tetris.mov): a ranked win with a 5-combo Tetris and a knockout. Every shot below points at
moments in it (seconds into the file). Writes to marketing/ad/out/:

    tetrisclash-gameplay-ad.mp4     1080x1920, 30 fps, H.264 + AAC, music and game sound
    tetrisclash-gameplay-cover.png  a still for the post's cover image

The soundtrack is synthesised here: a 128 BPM track in G major, plus the game's own sound
effects (ported from resources/js/tetris/sound.ts) on every clear, Tetris and attack.
"""

from __future__ import annotations

import math
import subprocess
import sys
import urllib.request
import wave
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import imageio_ffmpeg
import numpy as np
import pyloudnorm
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import signal

HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'
FONTS = HERE / 'fonts'
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H = 1080, 1920
FPS = 30
BPM = 128
BEAT = 60 / BPM
BEATS = 52
DURATION = BEATS * BEAT
FRAMES = round(DURATION * FPS)
SR = 48000

# The recording.
SRC_W, SRC_H = 3024, 1964
BOARD = (1212, 436, 1776, 1554)  # the player's field
# The mouse pointer, if it sits somewhere a shot sees: (x0, y0, x1, y1) and a moment where it's on
# a plain background, to take its shape from. In this recording it stays off to the right.
CURSOR: tuple[int, int, int, int] | None = None
CURSOR_SHAPE_AT = 0.0

# Colours from the landing page (Tailwind) and the game.
BG = (7, 10, 23)
INDIGO_200 = (199, 210, 254)
AMBER_300 = (252, 211, 77)
AMBER_400 = (251, 191, 36)
AMBER_950 = (69, 26, 3)
ROSE_400 = (251, 113, 133)
RED_500 = (239, 68, 68)
FUCHSIA_400 = (232, 121, 249)
PURPLE_400 = (192, 132, 252)
CYAN_400 = (34, 211, 238)
WHITE = (255, 255, 255)
TAGLINE = [AMBER_300, ROSE_400, FUCHSIA_400]
DANGER = [AMBER_300, RED_500]
PIECES = [(42, 212, 245), (252, 210, 43), (179, 78, 232), (90, 212, 60), (242, 58, 75), (58, 108, 242), (250, 140, 40)]

FONT_URLS = {
    'Montserrat-Italic.ttf': 'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Italic%5Bwght%5D.ttf',
    'Montserrat.ttf': 'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf',
    'InstrumentSans.ttf': 'https://github.com/google/fonts/raw/main/ofl/instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf',
}


def b(beats: float) -> float:
    """Beats to seconds."""
    return beats * BEAT


# ---------------------------------------------------------------- easing

def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def ease_out_cubic(x: float) -> float:
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x: float) -> float:
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out_back(x: float) -> float:
    x = clamp(x)
    c = 1.9
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


# ---------------------------------------------------------------- shots
#
# A shot is a slice of the timeline (in beats) showing one stretch of the recording. Its time
# map is a list of (output seconds into the shot, source seconds) keyframes, interpolated
# linearly: equal steps play at normal speed, short source steps are slow motion, long ones
# a time-lapse. The camera (centre and scale, in source pixels) is keyframed the same way.


@dataclass
class Shot:
    name: str
    start: float  # beats
    end: float  # beats
    times: list[tuple[float, float]]
    camera: list[tuple[float, float, float, float]]  # (t, cx, cy, scale)
    blend: int = 1  # average this many recent frames (motion blur for time-lapses)
    decode_fps: int = 60
    panel: bool = False  # footage doesn't fill the frame: feather its edges
    blur: float = 0.0  # background-only shots
    dim: float = 0.0

    @property
    def t0(self) -> float:
        return b(self.start)

    @property
    def t1(self) -> float:
        return b(self.end)

    def source_time(self, t: float) -> float:
        return interpolate(self.times, t - self.t0)

    def view(self, t: float) -> tuple[float, float, float]:
        local = t - self.t0
        keys = self.camera
        if local <= keys[0][0]:
            return keys[0][1:]
        for (ta, *a), (tb, *bb) in zip(keys, keys[1:]):
            if local <= tb:
                k = ease_in_out((local - ta) / (tb - ta)) if tb > ta else 1
                return tuple(x + (y - x) * k for x, y in zip(a, bb))
        return keys[-1][1:]


def interpolate(keys: list[tuple[float, float]], x: float) -> float:
    if x <= keys[0][0]:
        return keys[0][1]
    for (xa, ya), (xb, yb) in zip(keys, keys[1:]):
        if x <= xb:
            return ya + (yb - ya) * (x - xa) / (xb - xa)
    return keys[-1][1]


BOARD_CX = (BOARD[0] + BOARD[2]) / 2
BOARD_CY = (BOARD[1] + BOARD[3]) / 2

# Moments in the recording (seconds into the file).
TETRIS_1 = 48.2  # Tetris + 5 combo, the end of a chain; it knocks tspin_tony out
KNOCKOUT = 49.0  # "K.O.!" on tspin_tony's board, until ~49.85
TETRIS_2 = 42.97  # Tetris from a red, near-full board
WIN = 143.8  # "YOU WIN!" after time runs out

SHOTS = [
    # Hook: the 5-combo Tetris lands on beat 1, then slow motion through the burst.
    Shot('hook', 0, 4,
         times=[(0, TETRIS_1 - b(1)), (b(1), TETRIS_1), (b(4), TETRIS_1 + 0.72)],
         camera=[(0, BOARD_CX, 1000, 1.36), (b(1), BOARD_CX, 1000, 1.30), (b(1) + 0.12, BOARD_CX, 1020, 1.42), (b(4), BOARD_CX, 1020, 1.36)]),
    # The same moment from wide: the attack flies across and knocks tspin_tony out.
    Shot('wide', 4, 8,
         times=[(0, 48.35), (b(4), 49.85)],
         camera=[(0, 1732, 905, 0.585), (0.45, 1732, 905, 0.585), (0.95, 2425, 700, 1.2), (b(4), 2425, 700, 1.26)],
         panel=True, decode_fps=30),
    # The ranked battle splash.
    Shot('versus', 8, 12,
         times=[(0, 16.45), (b(4), 16.45 + b(4))],
         camera=[(0, 1529, 975, 0.6), (b(4), 1529, 975, 0.635)],
         panel=True, decode_fps=30),
    # 3, 2, 1, go: one beat each.
    Shot('count3', 12, 13, times=[(0, 20.1), (b(1), 20.1 + b(1))], camera=[(0, BOARD_CX, 990, 1.24), (b(1), BOARD_CX, 990, 1.28)], decode_fps=30),
    Shot('count2', 13, 14, times=[(0, 21.1), (b(1), 21.1 + b(1))], camera=[(0, BOARD_CX, 990, 1.30), (b(1), BOARD_CX, 990, 1.34)], decode_fps=30),
    Shot('count1', 14, 15, times=[(0, 22.1), (b(1), 22.1 + b(1))], camera=[(0, BOARD_CX, 990, 1.36), (b(1), BOARD_CX, 990, 1.40)], decode_fps=30),
    Shot('go', 15, 16, times=[(0, 23.0), (b(1), 23.0 + b(1))], camera=[(0, BOARD_CX, 990, 1.28), (b(1), BOARD_CX, 990, 1.24)], decode_fps=30),
    # The drop: the combo chain, in real time (1, 2, 3 and 4 combo).
    Shot('combo1', 16, 20, times=[(0, 43.9), (b(4), 43.9 + b(4))], camera=[(0, 1605, 1000, 1.1), (b(4), 1605, 1000, 1.16)]),
    Shot('combo2', 20, 24, times=[(0, 43.9 + b(4)), (b(4), 43.9 + b(8))], camera=[(0, 1605, 1040, 1.2), (b(4), 1605, 1040, 1.14)]),
    # Time-lapse: the garbage piles up and the board turns red.
    Shot('buried', 24, 28, times=[(0, 121.5), (b(4), 138.5)], camera=[(0, 1605, 990, 1.08), (b(4), 1605, 990, 1.15)], blend=3, decode_fps=20),
    # The comeback: a Tetris from a red, near-full board, slow motion through the burst.
    Shot('digout', 28, 32,
         times=[(0, TETRIS_2 - b(1)), (b(1), TETRIS_2), (b(4), TETRIS_2 + 0.7)],
         camera=[(0, BOARD_CX, 980, 1.3), (b(1), BOARD_CX, 980, 1.26), (b(1) + 0.12, BOARD_CX, 1000, 1.4), (b(4), BOARD_CX, 1000, 1.34)]),
    # The last seconds on the clock, the board red and nearly full. Framed to keep the
    # match clock (top) in view under the headline.
    Shot('lastsec', 32, 36, times=[(0, 139.2), (b(4), 142.95)], camera=[(0, BOARD_CX, 735, 0.94), (b(4), BOARD_CX, 735, 0.98)]),
    # The win, with the rating it earned.
    Shot('win', 36, 40, times=[(0, WIN + 0.05), (b(4), WIN + 1.4)], camera=[(0, BOARD_CX, 900, 1.18), (b(4), BOARD_CX, 900, 1.3)]),
    # Under the feature list and the end card: the board, blurred and dimmed.
    Shot('features', 40, 44, times=[(0, 26.0), (b(4), 30.0)], camera=[(0, 1605, 990, 1.2), (b(4), 1605, 990, 1.26)], decode_fps=30, blur=18, dim=0.55),
    Shot('end', 44, 52, times=[(0, 64.0), (b(8), 64.0 + b(8) * 0.6)], camera=[(0, 1605, 990, 1.3), (b(8), 1605, 990, 1.4)], decode_fps=30, blur=22, dim=0.68),
]


def shot_at(t: float) -> Shot:
    for shot in SHOTS:
        if shot.t0 <= t < shot.t1:
            return shot
    return SHOTS[-1]


def output_times(source: float) -> list[float]:
    """Every moment in the ad that shows this moment of the recording."""
    found = []
    for shot in SHOTS:
        if shot.blur:
            continue
        keys = shot.times
        for (xa, ya), (xb, yb) in zip(keys, keys[1:]):
            if ya <= source <= yb and yb > ya:
                found.append(shot.t0 + xa + (source - ya) / (yb - ya) * (xb - xa))
                break
    return found


# ---------------------------------------------------------------- footage


class Footage:
    """Streams one shot's stretch of the recording, cropped, with the cursor painted out."""

    def __init__(self, path: Path, shot: Shot):
        self.shot = shot
        self.fps = shot.decode_fps
        times = [shot.source_time(shot.t0 + i / FPS) for i in range(round((shot.t1 - shot.t0) * FPS) + 1)]
        self.start = max(0.0, min(times) - (shot.blend - 1) / self.fps - 0.05)
        end = max(times) + 0.1

        # Crop to what the camera ever sees, so frames stay small.
        xs, ys = [], []
        for i in range(0, round((shot.t1 - shot.t0) * FPS) + 1, 3):
            cx, cy, s = shot.view(shot.t0 + i / FPS)
            xs += [cx - W / s / 2 - 8, cx + W / s / 2 + 8]
            ys += [cy - H / s / 2 - 8, cy + H / s / 2 + 8]
        x0, x1 = max(0, int(min(xs))) & ~1, min(SRC_W, int(max(xs)) + 1) & ~1
        y0, y1 = max(0, int(min(ys))) & ~1, min(SRC_H, int(max(ys)) + 1) & ~1
        self.box = (x0, y0, x1, y1)
        self.size = (x1 - x0, y1 - y0)

        self.cursor = None
        if CURSOR is not None:
            cx0, cy0, cx1, cy1 = CURSOR
            if cx0 >= x0 and cy0 >= y0 and cx1 <= x1 and cy1 <= y1:
                self.cursor = (cx0 - x0, cy0 - y0, cx1 - x0, cy1 - y0)

        self.proc = subprocess.Popen(
            [FFMPEG, '-loglevel', 'error', '-ss', f'{self.start:.3f}', '-t', f'{end - self.start:.3f}',
             '-i', str(path), '-vf', f'fps={self.fps},crop={x1 - x0}:{y1 - y0}:{x0}:{y0}',
             '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
            stdout=subprocess.PIPE)
        self.index = -1
        self.recent: deque[np.ndarray] = deque(maxlen=shot.blend)

    def _read(self) -> bool:
        w, h = self.size
        raw = self.proc.stdout.read(w * h * 3)
        if len(raw) < w * h * 3:
            return False
        frame = np.frombuffer(raw, np.uint8).reshape(h, w, 3).copy()
        if self.cursor:
            frame = paint_out_cursor(frame, self.cursor)
        self.recent.append(frame)
        self.index += 1
        return True

    def at(self, source: float) -> np.ndarray:
        want = round((source - self.start) * self.fps)
        while self.index < want and self._read():
            pass
        frames = list(self.recent)
        if len(frames) == 1:
            return frames[0]
        return np.mean(np.stack(frames).astype(np.float32), axis=0).astype(np.uint8)

    def close(self) -> None:
        self.proc.kill()
        self.proc.stdout.close()
        self.proc.wait()


POINTER_MASK: np.ndarray | None = None


def load_pointer_mask(recording: Path) -> None:
    """The pointer's exact shape, from the VS screen, where it sits on a plain dark background."""
    global POINTER_MASK
    if CURSOR is None:
        return
    x0, y0, x1, y1 = CURSOR
    raw = subprocess.run(
        [FFMPEG, '-loglevel', 'error', '-ss', str(CURSOR_SHAPE_AT), '-i', str(recording), '-frames:v', '1',
         '-vf', f'crop={x1 - x0}:{y1 - y0}:{x0}:{y0}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
        capture_output=True, check=True).stdout
    lum = np.frombuffer(raw, np.uint8).reshape(y1 - y0, x1 - x0, 3).mean(axis=2)
    mask = (np.abs(lum - np.median(lum)) > 12).astype(np.uint8) * 255
    POINTER_MASK = cv2.dilate(mask, np.ones((5, 5), np.uint8))


def paint_out_cursor(frame: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    x0, y0, x1, y1 = box
    pad = 8
    px0, py0 = max(0, x0 - pad), max(0, y0 - pad)
    patch = np.ascontiguousarray(frame[py0:y1 + pad, px0:x1 + pad])
    mask = np.zeros(patch.shape[:2], np.uint8)
    mask[y0 - py0:y1 - py0, x0 - px0:x1 - px0] = POINTER_MASK
    frame[py0:y1 + pad, px0:x1 + pad] = cv2.inpaint(patch, mask, 3, cv2.INPAINT_TELEA)
    return frame


def render_view(footage: Footage, frame: np.ndarray, cx: float, cy: float, s: float) -> tuple[np.ndarray, np.ndarray]:
    """The camera's view of a cropped frame: RGB float image and its coverage mask."""
    x0, y0, _, _ = footage.box
    pre = min(1.0, s)
    if pre < 0.98:
        frame = cv2.resize(frame, None, fx=pre, fy=pre, interpolation=cv2.INTER_AREA)
    k = s / pre
    # Source pixel (cx, cy) lands in the middle of the output.
    m = np.array([[k, 0, W / 2 - (cx - x0) * pre * k], [0, k, H / 2 - (cy - y0) * pre * k]], np.float32)
    flags = cv2.INTER_CUBIC if k > 1.05 else cv2.INTER_LINEAR
    img = cv2.warpAffine(frame, m, (W, H), flags=flags, borderMode=cv2.BORDER_CONSTANT)
    cover = cv2.warpAffine(np.full(frame.shape[:2], 255, np.uint8), m, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    img = img.astype(np.float32) / 255
    if k > 1.1:
        soft = cv2.GaussianBlur(img, (0, 0), 1.4)
        img = np.clip(img + (img - soft) * 0.45, 0, 1)
    return img, cover.astype(np.float32) / 255


# ---------------------------------------------------------------- text and graphics


def fonts_ready() -> None:
    FONTS.mkdir(exist_ok=True)
    for name, url in FONT_URLS.items():
        if not (FONTS / name).exists():
            print(f'downloading {name}')
            urllib.request.urlretrieve(url, FONTS / name)


_font_cache: dict = {}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    key = (kind, size)
    if key not in _font_cache:
        file, variation = {
            'black-italic': ('Montserrat-Italic.ttf', 'Black Italic'),
            'xbold-italic': ('Montserrat-Italic.ttf', 'ExtraBold Italic'),
            'black': ('Montserrat.ttf', 'Black'),
            'sans-bold': ('InstrumentSans.ttf', 'Bold'),
            'sans-semibold': ('InstrumentSans.ttf', 'SemiBold'),
        }[kind]
        f = ImageFont.truetype(str(FONTS / file), size)
        f.set_variation_by_name(variation)
        _font_cache[key] = f
    return _font_cache[key]


def gradient(width: int, height: int, colors: list[tuple[int, int, int]]) -> Image.Image:
    xs = np.linspace(0, 1, width)
    stops = np.linspace(0, 1, len(colors))
    channels = [np.interp(xs, stops, [c[i] for c in colors]) for i in range(3)]
    row = np.stack(channels, axis=1).astype(np.uint8)
    return Image.fromarray(np.repeat(row[None], height, axis=0))


Sprite = np.ndarray  # float32 RGBA, premultiplied, 0..1
_sprite_cache: dict = {}


def text_sprite(text: str, kind: str, size: int, fill=WHITE, glow=None, shadow: float = 0.6, tracking: int = 0) -> Sprite:
    key = (text, kind, size, str(fill), str(glow), shadow, tracking)
    if key in _sprite_cache:
        return _sprite_cache[key]
    f = font(kind, size)
    pad = int(size * 0.6)
    if tracking:
        widths = [f.getlength(ch) + tracking for ch in text]
        tw = int(sum(widths) - tracking)
    else:
        tw = int(f.getlength(text))
    asc, desc = f.getmetrics()
    w, h = tw + pad * 2 + int(size * 0.25), asc + desc + pad * 2
    mask = Image.new('L', (w, h))
    d = ImageDraw.Draw(mask)
    if tracking:
        x = pad
        for ch, cw in zip(text, widths):
            d.text((x, pad), ch, font=f, fill=255)
            x += cw
    else:
        d.text((pad, pad), text, font=f, fill=255)
    bbox = mask.getbbox() or (0, 0, w, h)
    color = gradient(w, h, fill) if isinstance(fill, list) else Image.new('RGB', (w, h), fill)
    if isinstance(fill, list):
        # Stretch the gradient across the glyphs, not the padding.
        color = gradient(bbox[2] - bbox[0], h, fill)
        full = Image.new('RGB', (w, h), fill[0])
        full.paste(color, (bbox[0], 0))
        right = Image.new('RGB', (w - bbox[2], h), fill[-1]) if w > bbox[2] else None
        if right:
            full.paste(right, (bbox[2], 0))
        color = full

    out = np.zeros((h, w, 4), np.float32)
    m = np.asarray(mask, np.float32) / 255
    if shadow:
        sh = np.asarray(mask.filter(ImageFilter.GaussianBlur(size * 0.12)), np.float32) / 255
        sh = np.roll(sh, int(size * 0.06), axis=0) * shadow
        out[..., 3] = sh
    if glow:
        g = np.asarray(mask.filter(ImageFilter.GaussianBlur(size * 0.22)), np.float32) / 255 * 0.85
        gc = np.array(glow, np.float32) / 255
        a = g * (1 - out[..., 3])
        out[..., :3] += gc * a[..., None]
        out[..., 3] += a
    c = np.asarray(color, np.float32) / 255
    out[..., :3] = c * m[..., None] + out[..., :3] * (1 - m[..., None])
    out[..., 3] = m + out[..., 3] * (1 - m)
    _sprite_cache[key] = out
    return out


def blit(canvas: np.ndarray, sprite: Sprite, cx: float, cy: float, scale: float = 1.0, alpha: float = 1.0) -> None:
    if alpha <= 0.003 or scale <= 0.01:
        return
    spr = sprite
    if abs(scale - 1) > 0.004:
        spr = cv2.resize(sprite, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR if scale > 1 else cv2.INTER_AREA)
    h, w = spr.shape[:2]
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x0 + w), min(H, y0 + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    part = spr[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
    a = part[..., 3:4] * alpha
    region = canvas[dy0:dy1, dx0:dx1]
    region *= 1 - a
    region += part[..., :3] * alpha


def rounded_rect_sprite(w: int, h: int, radius: int, fill, border=None, glow=None, alpha: float = 1.0) -> Sprite:
    pad = 60 if glow else 4
    img = Image.new('L', (w + pad * 2, h + pad * 2))
    ImageDraw.Draw(img).rounded_rectangle([pad, pad, pad + w, pad + h], radius, fill=255)
    m = np.asarray(img, np.float32) / 255
    color = gradient(w + pad * 2, h + pad * 2, fill) if isinstance(fill, list) else Image.new('RGB', img.size, fill)
    out = np.zeros((*m.shape, 4), np.float32)
    if glow:
        g = np.asarray(img.filter(ImageFilter.GaussianBlur(26)), np.float32) / 255 * 0.7
        out[..., :3] = np.array(glow, np.float32) / 255 * g[..., None]
        out[..., 3] = g
    c = np.asarray(color, np.float32) / 255
    out[..., :3] = c * (m * alpha)[..., None] + out[..., :3] * (1 - m * alpha)[..., None]
    out[..., 3] = m * alpha + out[..., 3] * (1 - m * alpha)
    if border:
        ring = Image.new('L', img.size)
        ImageDraw.Draw(ring).rounded_rectangle([pad, pad, pad + w, pad + h], radius, outline=255, width=3)
        r = np.asarray(ring, np.float32) / 255 * 0.8
        out[..., :3] = np.array(border, np.float32)[None, None] / 255 * r[..., None] + out[..., :3] * (1 - r[..., None])
        out[..., 3] = r + out[..., 3] * (1 - r)
    return out


def logo_sprite(cell: int, color=PURPLE_400) -> Sprite:
    """The T-tetromino mark from the favicon."""
    gap = max(2, cell // 9)
    w, h = cell * 3 + gap * 2, cell * 2 + gap
    pad = cell
    img = Image.new('L', (w + pad * 2, h + pad * 2))
    d = ImageDraw.Draw(img)
    for x, y in [(0, 0), (1, 0), (2, 0), (1, 1)]:
        d.rounded_rectangle([pad + x * (cell + gap), pad + y * (cell + gap), pad + x * (cell + gap) + cell, pad + y * (cell + gap) + cell], cell // 6, fill=255)
    m = np.asarray(img, np.float32) / 255
    g = np.asarray(img.filter(ImageFilter.GaussianBlur(cell * 0.45)), np.float32) / 255 * 0.8
    out = np.zeros((*m.shape, 4), np.float32)
    c = np.array(color, np.float32) / 255
    out[..., :3] = c * g[..., None]
    out[..., 3] = g
    out[..., :3] = c * m[..., None] + out[..., :3] * (1 - m[..., None])
    out[..., 3] = m + out[..., 3] * (1 - m)
    return out


@dataclass
class Caption:
    """A line of text that pops in on a beat."""

    text: str
    beat: float
    until: float  # beats
    y: float
    kind: str = 'black-italic'
    size: int = 118
    fill: object = WHITE
    glow: object = None
    pop: float = 1.35
    x: float = W / 2
    tracking: int = 0
    pulse: bool = False

    def draw(self, canvas: np.ndarray, t: float) -> None:
        local = t - b(self.beat)
        if local < 0 or t >= b(self.until):
            return
        sprite = text_sprite(self.text, self.kind, self.size, self.fill, self.glow, tracking=self.tracking)
        # Shrink lines wider than the safe area (the sprite has 1.45 em of padding).
        fit = min(1.0, 960 / max(1, sprite.shape[1] - 1.45 * self.size))
        k = ease_out_back(local / 0.2)
        scale = (self.pop + (1 - self.pop) * k) * fit
        if self.pulse:
            beat_phase = (t / BEAT) % 1
            scale *= 1 + 0.045 * math.exp(-beat_phase * 6)
        alpha = clamp(local / 0.06)
        blit(canvas, sprite, self.x, self.y + (1 - ease_out_cubic(local / 0.2)) * 18, scale, alpha)


HEAD = 330  # headline baseline region: below the app's top bar, above the action
HEAD2 = HEAD + 130

CAPTIONS = [
    Caption('CLEAR 4 LINES.', 0, 4, HEAD + 60, size=112),
    Caption('BURY YOUR', 4, 8, HEAD, size=128),
    Caption('RIVAL.', 4.5, 8, HEAD2 + 10, size=170, fill=TAGLINE, glow=FUCHSIA_400),
    Caption('REAL-TIME', 8, 12, HEAD, size=120),
    Caption('1V1 BATTLES', 8.5, 12, HEAD2, size=132, fill=TAGLINE, glow=FUCHSIA_400),
    Caption('Live ranked matches  ·  Free in your browser', 9.5, 12, 1420, kind='sans-semibold', size=44, fill=INDIGO_200, pop=1.0),
    Caption('READY?', 12, 15, HEAD + 40, size=120),
    Caption('3', 12, 13, 1000, size=440, fill=TAGLINE, glow=FUCHSIA_400, pop=1.8),
    Caption('2', 13, 14, 1000, size=440, fill=TAGLINE, glow=FUCHSIA_400, pop=1.8),
    Caption('1', 14, 15, 1000, size=440, fill=TAGLINE, glow=FUCHSIA_400, pop=1.8),
    Caption('GO!', 15, 16, 1000, size=360, fill=[AMBER_300, AMBER_400], glow=AMBER_400, pop=2.0),
    Caption('CHAIN', 16, 22, HEAD, size=128),
    Caption('COMBOS.', 16.5, 22, HEAD2, size=150, fill=TAGLINE, glow=FUCHSIA_400),
    Caption('SEND', 22, 24, HEAD, size=128),
    Caption('GARBAGE.', 22.25, 24, HEAD2, size=150, fill=TAGLINE, glow=FUCHSIA_400),
    Caption('BURIED IN', 24, 28, HEAD, size=128),
    Caption('GARBAGE?', 24.5, 28, HEAD2, size=150, fill=DANGER, glow=RED_500),
    Caption('DIG OUT.', 28, 32, HEAD, size=128),
    Caption('FIGHT BACK.', 30, 32, HEAD2, size=140, fill=TAGLINE, glow=FUCHSIA_400),
    Caption('FINAL SECONDS...', 32, 36, HEAD - 20, size=124, fill=DANGER, glow=RED_500),
    Caption('CLIMB', 36, 40, HEAD, size=128),
    Caption('THE RANKS.', 36.5, 40, HEAD2, size=150, fill=TAGLINE, glow=FUCHSIA_400),
    Caption('FREE TO PLAY', 40, 44, 520, size=96, fill=TAGLINE, glow=FUCHSIA_400),
]

FEATURES = ['RANKED LADDER', 'TOURNAMENTS', '5 PRACTICE MODES', 'MATCH REPLAYS']


# ---------------------------------------------------------------- frame


@dataclass
class Fx:
    flashes: list[tuple[float, float]] = field(default_factory=list)  # (time, strength)
    shakes: list[tuple[float, float]] = field(default_factory=list)  # (time, pixels)


def build_fx() -> Fx:
    fx = Fx()
    for source, strength in [(TETRIS_1, 0.75), (TETRIS_2, 0.7), (KNOCKOUT, 0.5), (WIN, 0.6)]:
        for t in output_times(source):
            fx.flashes.append((t, strength))
            fx.shakes.append((t, 26))
    for beat in [4, 8, 16, 28, 44]:
        fx.flashes.append((b(beat), 0.35))
    for beat in [12, 13, 14, 15]:
        fx.shakes.append((b(beat), 10))
    for beat in [8, 16, 44]:
        fx.shakes.append((b(beat), 18))
    return fx


def background(t: float) -> np.ndarray:
    """Brand navy with two slow glows, like the landing page."""
    yy, xx = BG_GRID
    g1 = np.exp(-(((xx - 0.2 - 0.08 * math.sin(t * 0.7)) / 0.55) ** 2 + ((yy - 0.25) / 0.35) ** 2))
    g2 = np.exp(-(((xx - 0.85) / 0.5) ** 2 + ((yy - 0.75 - 0.05 * math.cos(t * 0.5)) / 0.4) ** 2))
    base = np.array(BG, np.float32) / 255
    img = base + g1[..., None] * (np.array((139, 92, 246), np.float32) / 255 * 0.28) + g2[..., None] * (np.array((244, 63, 94), np.float32) / 255 * 0.18)
    return img.astype(np.float32)


_ys, _xs = np.mgrid[0:H:4, 0:W:4]
BG_GRID = (_ys / H, _xs / W)
TOP_SHADE = np.clip(1 - np.linspace(0, 1, H) / 0.42, 0, 1) ** 1.6 * 0.82
BOTTOM_SHADE = np.clip((np.linspace(0, 1, H) - 0.8) / 0.2, 0, 1) ** 1.5 * 0.55
_vy, _vx = np.mgrid[0:H, 0:W]
VIGNETTE = (1 - 0.32 * (((_vx / W - 0.5) * 1.6) ** 2 + ((_vy / H - 0.5) * 1.1) ** 2)).clip(0.55, 1).astype(np.float32)[..., None]
PANEL_FEATHER = 28
WIDE_SHADE = (np.clip((640 - np.arange(H)) / 140, 0, 1) * 0.88).astype(np.float32)


class Renderer:
    def __init__(self, recording: Path):
        self.recording = recording
        self.fx = build_fx()
        self.footage: dict[str, Footage] = {}
        self.feature_sprites = [text_sprite(f, 'xbold-italic', 74) for f in FEATURES]
        self.bullets = [rounded_rect_sprite(34, 34, 7, PIECES[i % len(PIECES)], glow=PIECES[i % len(PIECES)]) for i in range(len(FEATURES))]
        self.brand = self._brand_bug()
        self.rng = np.random.default_rng(7)
        self.particles = [(self.rng.uniform(0, W), self.rng.uniform(-H, H), self.rng.uniform(40, 120), self.rng.uniform(16, 44), PIECES[i % 7]) for i in range(26)]
        self.block_sprites = {}

    def _brand_bug(self) -> Sprite:
        logo = logo_sprite(16)
        word = text_sprite('TETRIS CLASH', 'black', 34, WHITE, shadow=0.5, tracking=3)
        h = max(logo.shape[0], word.shape[0])
        overlap = 16  # the sprites' padding, less a gap between mark and word
        w = logo.shape[1] + word.shape[1] - overlap
        out = np.zeros((h, w, 4), np.float32)
        lh, lw = logo.shape[:2]
        out[(h - lh) // 2:(h - lh) // 2 + lh, :lw] = logo
        wh, ww = word.shape[:2]
        region = out[(h - wh) // 2:(h - wh) // 2 + wh, lw - overlap:lw - overlap + ww]
        region[:] = word + region * (1 - word[..., 3:4])
        return out

    def footage_for(self, shot: Shot) -> Footage:
        if shot.name not in self.footage:
            for name, f in list(self.footage.items()):
                f.close()
                del self.footage[name]
            self.footage[shot.name] = Footage(self.recording, shot)
        return self.footage[shot.name]

    def frame(self, n: int) -> np.ndarray:
        t = n / FPS
        shot = shot_at(t)
        canvas = cv2.resize(background(t), (W, H), interpolation=cv2.INTER_LINEAR)

        # Camera shake.
        dx = dy = 0.0
        for at, px in self.fx.shakes:
            k = t - at
            if 0 <= k < 0.35:
                amp = px * math.exp(-k * 11)
                dx += amp * math.sin(k * 90)
                dy += amp * math.cos(k * 73)

        footage = self.footage_for(shot)
        cx, cy, s = shot.view(t)
        img, cover = render_view(footage, footage.at(shot.source_time(t)), cx - dx / s, cy - dy / s, s)
        if shot.blur:
            img = cv2.GaussianBlur(img, (0, 0), shot.blur)
            img *= 1 - shot.dim
        if shot.panel:
            cover = cv2.GaussianBlur(cover, (0, 0), PANEL_FEATHER)
        canvas = canvas * (1 - cover[..., None]) + img * cover[..., None]

        if shot.name == 'buried':
            pulse = 0.5 + 0.5 * math.cos((t - shot.t0) / BEAT * math.pi * 2)
            canvas[..., 0] += 0.10 * pulse
            canvas[..., 1:] *= 1 - 0.12 * pulse
        if shot.name == 'wide':
            # Once zoomed onto the opponent, hide their name plate under the headline.
            zoom = clamp((t - shot.t0 - 0.55) / 0.65)
            canvas *= 1 - (WIDE_SHADE * ease_in_out(zoom))[:, None, None]
        if shot.name == 'lastsec':
            self._clock_ring(canvas, t, shot)

        canvas *= VIGNETTE
        canvas *= (1 - TOP_SHADE)[:, None, None]
        canvas *= (1 - BOTTOM_SHADE)[:, None, None]

        if shot.name in ('features', 'end'):
            self._falling_blocks(canvas, t)
        if shot.name == 'wide':
            self._garbage_label(canvas, t)

        # A small brand tag where the footage leaves the top clear.
        if shot.panel or shot.name == 'features':
            blit(canvas, self.brand, W / 2, 150, 1.0, 0.92)

        for caption in CAPTIONS:
            caption.draw(canvas, t)
        if shot.name == 'features':
            self._features(canvas, t)
        if shot.name == 'end':
            self._end_card(canvas, t)

        # Flashes, with a touch of chromatic split on the big ones.
        flash = 0.0
        for at, strength in self.fx.flashes:
            k = t - at
            if 0 <= k < 0.25:
                flash = max(flash, strength * math.exp(-k * 16))
        if flash > 0.01:
            canvas = canvas + (1 - canvas) * flash
            if flash > 0.3:
                shift = int(flash * 14)
                canvas[..., 0] = np.roll(canvas[..., 0], shift, axis=1)
                canvas[..., 2] = np.roll(canvas[..., 2], -shift, axis=1)

        # Fade in from black on frame 0 is too slow for a hook; fade out at the very end only.
        tail = clamp((DURATION - t) / 0.35)
        canvas *= tail
        return (np.clip(canvas, 0, 1) * 255).astype(np.uint8)

    def _garbage_label(self, canvas: np.ndarray, t: float) -> None:
        # Once the camera has settled on tspin_tony's board, as the K.O. lands.
        local = t - output_times(KNOCKOUT)[0]
        if local < 0:
            return
        pill = text_sprite('KNOCKOUT!', 'black-italic', 96, [AMBER_300, RED_500], glow=RED_500)
        k = ease_out_back(local / 0.22)
        blit(canvas, pill, W / 2, 1360, 1.5 - 0.5 * k, clamp(local / 0.08))

    def _clock_ring(self, canvas: np.ndarray, t: float, shot: Shot) -> None:
        # Pulse a red ring around the match clock (source box 1668..1852 x 240..335).
        cx, cy, s = shot.view(t)
        x = W / 2 + (1760 - cx) * s
        y = H / 2 + (288 - cy) * s
        beat_phase = ((t - shot.t0) / BEAT) % 1
        ring = rounded_rect_sprite(int(205 * s), int(118 * s), int(26 * s), (0, 0, 0), border=RED_500, glow=RED_500, alpha=0.0)
        blit(canvas, ring, x, y, 1.0 + 0.06 * math.exp(-beat_phase * 5), 0.55 + 0.45 * math.exp(-beat_phase * 4))

    def _falling_blocks(self, canvas: np.ndarray, t: float) -> None:
        for x, y0, speed, size, color in self.particles:
            y = (y0 + t * speed * 3) % (H + 200) - 100
            key = (int(size), color)
            if key not in self.block_sprites:
                self.block_sprites[key] = rounded_rect_sprite(int(size), int(size), int(size) // 5, color, glow=color, alpha=0.9)
            blit(canvas, self.block_sprites[key], x + 30 * math.sin(t * 0.8 + y0), y, 1.0, 0.35)

    def _features(self, canvas: np.ndarray, t: float) -> None:
        # Left-aligned lines, the block as a whole centred.
        pad = 1.45 * 74
        widest = max(s.shape[1] for s in self.feature_sprites) - pad
        left = (W - (widest + 60)) / 2
        for i, (sprite, bullet) in enumerate(zip(self.feature_sprites, self.bullets)):
            local = t - b(40 + i)
            if local < 0:
                continue
            k = ease_out_back(local / 0.2)
            y = 760 + i * 150
            x_off = (1 - ease_out_cubic(local / 0.2)) * 120
            alpha = clamp(local / 0.06)
            blit(canvas, bullet, left + 17 + x_off, y, 1.0, alpha)
            blit(canvas, sprite, left + 60 + (sprite.shape[1] - pad) / 2 + x_off, y, 1.0 + 0.2 * (1 - k), alpha)

    def _end_card(self, canvas: np.ndarray, t: float) -> None:
        local = t - b(44)
        logo = logo_sprite(54)
        k = ease_out_back(local / 0.25)
        blit(canvas, logo, W / 2, 600, 1.6 - 0.6 * k, clamp(local / 0.08))
        word = text_sprite('TETRIS CLASH', 'black', 112, WHITE, glow=PURPLE_400, tracking=4)
        blit(canvas, word, W / 2, 790, 1.3 - 0.3 * k, clamp(local / 0.08))

        tag = text_sprite('Clear lines. Bury your rival.', 'black-italic', 66, TAGLINE, glow=FUCHSIA_400)
        lt = t - b(45)
        if lt >= 0:
            blit(canvas, tag, W / 2, 925 + (1 - ease_out_cubic(lt / 0.25)) * 30, 1.0, clamp(lt / 0.12))

        sub = text_sprite('Free  ·  In your browser  ·  No download', 'sans-semibold', 44, INDIGO_200)
        lt = t - b(46)
        if lt >= 0:
            blit(canvas, sub, W / 2, 1030, 1.0, clamp(lt / 0.15))

        lt = t - b(47)
        if lt >= 0:
            beat_phase = (t / BEAT) % 1
            pulse = 1 + 0.05 * math.exp(-beat_phase * 6)
            button = rounded_rect_sprite(640, 128, 64, [AMBER_300, AMBER_400], glow=AMBER_400)
            label = text_sprite('PLAY FREE NOW', 'black-italic', 64, AMBER_950, shadow=0)
            kk = ease_out_back(lt / 0.22)
            scale = (1.4 - 0.4 * kk) * pulse
            blit(canvas, button, W / 2, 1210, scale, clamp(lt / 0.08))
            blit(canvas, label, W / 2, 1206, scale, clamp(lt / 0.08))

        lt = t - b(48)
        if lt >= 0:
            url = text_sprite('tetrisclash.com', 'sans-bold', 62, WHITE, glow=CYAN_400)
            blit(canvas, url, W / 2, 1370, 1.0 + 0.15 * (1 - ease_out_back(lt / 0.2)), clamp(lt / 0.1))

    def close(self) -> None:
        for f in self.footage.values():
            f.close()


# ---------------------------------------------------------------- audio
#
# The game's synth, rebuilt offline: oscillators and filtered noise with exponential
# envelopes, a small-room reverb send, then the music on top.

N_SAMPLES = int((DURATION + 0.6) * SR)
OVERSAMPLE = 2


def biquad(kind: str, freq: float, q: float, sr: int = SR) -> np.ndarray:
    freq = min(freq, sr * 0.45)
    w0 = 2 * math.pi * freq / sr
    alpha = math.sin(w0) / (2 * q)
    cos = math.cos(w0)
    if kind == 'lowpass':
        bb = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
    elif kind == 'highpass':
        bb = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
    else:  # bandpass, constant peak gain
        bb = [alpha, 0, -alpha]
    a = [1 + alpha, -2 * cos, 1 - alpha]
    return np.array([[bb[0] / a[0], bb[1] / a[0], bb[2] / a[0], 1, a[1] / a[0], a[2] / a[0]]])


def sweep_filter(x: np.ndarray, kind: str, f0: float, f1: float, q: float = 0.707, sr: int = SR, block: int = 128) -> np.ndarray:
    """A biquad whose cutoff glides exponentially from f0 to f1 over the signal."""
    if abs(f1 - f0) < 1e-6:
        return signal.sosfilt(biquad(kind, f0, q, sr), x)
    out = np.empty_like(x)
    zi = np.zeros((1, 2))
    n = len(x)
    for i in range(0, n, block):
        f = f0 * (f1 / f0) ** (i / max(1, n))
        out[i:i + block], zi = signal.sosfilt(biquad(kind, f, q, sr), x[i:i + block], zi=zi)
    return out


def exp_env(n: int, attack: float, peak: float, sr: int = SR) -> np.ndarray:
    """Web Audio style: 0.0001 → peak over attack, then exponentially down to 0.0001."""
    t = np.arange(n) / sr
    dur = n / sr
    a = max(attack, 1e-4)
    env = np.where(
        t < a,
        0.0001 * (peak / 0.0001) ** (t / a),
        peak * (0.0001 / peak) ** ((t - a) / max(1e-4, dur - a)),
    )
    return env


def osc(kind: str, freq: float, dur: float, slide: float | None = None, cents: float = 0) -> np.ndarray:
    sr = SR * OVERSAMPLE
    n = int(dur * sr)
    t = np.arange(n) / sr
    f = freq * 2 ** (cents / 1200)
    if slide:
        f = f * (slide / freq) ** (t / dur)
        phase = np.cumsum(np.broadcast_to(f, t.shape)) / sr
    else:
        phase = f * t
    phase = phase % 1
    if kind == 'sine':
        wave_ = np.sin(2 * math.pi * phase)
    elif kind == 'triangle':
        wave_ = 1 - 4 * np.abs(phase - 0.5)
    elif kind == 'square':
        wave_ = np.where(phase < 0.5, 1.0, -1.0)
    else:
        wave_ = 2 * phase - 1
    return signal.resample_poly(wave_, 1, OVERSAMPLE)


class Mix:
    def __init__(self):
        self.dry = np.zeros((2, N_SAMPLES))
        self.send = np.zeros((2, N_SAMPLES))

    def add(self, x: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0, wet: float = 0.0) -> None:
        i = int(at * SR)
        if i >= N_SAMPLES or i + len(x) <= 0:
            return
        if i < 0:
            x = x[-i:]
            i = 0
        x = x[: N_SAMPLES - i]
        left, right = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
        for ch, g in ((0, left), (1, right)):
            self.dry[ch, i:i + len(x)] += x * gain * g * math.sqrt(2)
            if wet:
                self.send[ch, i:i + len(x)] += x * gain * g * wet * math.sqrt(2)

    def render(self, ir_seconds: float = 1.6, seed: int = 1) -> np.ndarray:
        rng = np.random.default_rng(seed)
        n = int(ir_seconds * SR)
        decay = (1 - np.arange(n) / n) ** 3
        out = self.dry.copy()
        for ch in range(2):
            ir = rng.uniform(-1, 1, n) * decay
            ir /= np.sqrt(np.sum(ir ** 2))
            out[ch] += signal.fftconvolve(self.send[ch], ir)[:N_SAMPLES] * 0.9
        return out


def voice(mix: Mix, at: float, freq: float, dur: float, kind: str = 'triangle', gain: float = 0.15, slide=None,
          attack: float = 0.004, filt: float = 6000, filt_to=None, detune: float = 0, wet: float = 0.15, pan: float = 0.0) -> None:
    n = int(dur * SR)
    sig = np.zeros(n)
    for cents in ([-detune, detune] if detune > 0 else [0]):
        sig += osc(kind, freq, dur, slide, cents)[:n]
    sig = sweep_filter(sig, 'lowpass', filt, filt_to or filt, 1.0)
    sig *= exp_env(n, attack, gain)
    tail = np.zeros(int(0.05 * SR))
    mix.add(np.concatenate([sig, tail]), at, pan=pan, wet=wet)


_noise_rng = np.random.default_rng(3)


def noise(mix: Mix, at: float, dur: float, gain: float = 0.2, kind: str = 'lowpass', f0: float = 1200, f1: float = 200,
          q: float = 1.0, attack: float = 0.002, wet: float = 0.1, pan: float = 0.0) -> None:
    n = int(dur * SR)
    sig = _noise_rng.uniform(-1, 1, n)
    sig = sweep_filter(sig, kind, f0, f1, q)
    sig *= exp_env(n, attack, gain)
    mix.add(sig, at, pan=pan, wet=wet)


ROOT = 392.0  # the game's G4
PENTATONIC = [0, 2, 4, 7, 9]


def semitones(base: float, steps: float) -> float:
    return base * 2 ** (steps / 12)


def scale_note(step: int) -> float:
    return semitones(ROOT, 12 * (step // len(PENTATONIC)) + PENTATONIC[step % len(PENTATONIC)])


# The game's sound effects (resources/js/tetris/sound.ts).

def sfx_kick(mix: Mix, at: float, gain: float = 0.5) -> None:
    voice(mix, at, 150, 0.18, 'sine', gain, slide=42, wet=0)
    noise(mix, at, 0.02, gain * 0.3, 'highpass', 3000, 3000, wet=0)


def sfx_cymbal(mix: Mix, at: float, gain: float = 0.15) -> None:
    noise(mix, at, 1.2, gain, 'highpass', 5000, 9000, wet=0.4)


def sfx_hard_drop(mix: Mix, at: float) -> None:
    sfx_kick(mix, at, 0.4)
    noise(mix, at, 0.08, 0.12, 'lowpass', 1500, 200, wet=0)


def sfx_clear(mix: Mix, at: float, lines: int, combo: int) -> None:
    tier = 0 if combo < 1 else 1 if combo < 4 else 2 if combo < 7 else 3
    base = scale_note(min(combo, 14))
    bright = 1800 + tier * 1600
    wet = 0.15 + tier * 0.05
    tetris = lines >= 4
    for i, step in enumerate([0, 4, 7, 12][: max(1, lines)]):
        voice(mix, at + i * (0.012 if tetris else 0.03), semitones(base, step), 0.45 if tetris else 0.22,
              'sawtooth' if tetris else 'triangle', 0.07 if tetris else 0.1, detune=8 if tetris else 0,
              filt=900 if tetris else bright, filt_to=7000 if tetris else None, wet=wet, pan=(i - 1.5) * 0.2)
    if tier >= 1:
        voice(mix, at + 0.05, semitones(base, 12), 0.12, 'sine', 0.06, wet=wet)
    if tetris:
        sfx_kick(mix, at, 0.45)
        sfx_cymbal(mix, at, 0.1)
        for i, step in enumerate([19, 24]):
            voice(mix, at + 0.18 + i * 0.07, semitones(base, step), 0.3, 'sine', 0.06, wet=0.4)


def sfx_attack(mix: Mix, at: float, lines: int) -> None:
    size = min(1, lines / 6)
    voice(mix, at, 300, 0.18, 'sawtooth', 0.05 + size * 0.05, slide=1800, filt=4000, detune=8, wet=0.15)
    noise(mix, at, 0.2, 0.06 + size * 0.08, 'bandpass', 500, 5000, q=2, wet=0.1)
    if lines >= 4:
        sfx_kick(mix, at, 0.4)


def sfx_incoming(mix: Mix, at: float) -> None:
    for delay, f in ((0, 233), (0.16, 196)):
        voice(mix, at + delay, f, 0.14, 'square', 0.07, filt=1200, wet=0.1)


def sfx_countdown(mix: Mix, at: float) -> None:
    voice(mix, at, scale_note(5), 0.16, 'sine', 0.14, wet=0.2)


def sfx_ko(mix: Mix, at: float) -> None:
    sfx_kick(mix, at, 0.6)
    noise(mix, at, 0.8, 0.3, 'lowpass', 3000, 120, wet=0.35)
    voice(mix, at, 420, 0.7, 'sawtooth', 0.1, slide=40, filt=2000, filt_to=200, detune=15, wet=0.3)


def sfx_win(mix: Mix, at: float) -> None:
    for i, step in enumerate([0, 4, 7, 12]):
        voice(mix, at + i * 0.1, semitones(ROOT, step + 12), 0.16, 'square', 0.07, filt=4000, wet=0.2)
    for step in [0, 4, 7, 12]:
        voice(mix, at + 0.42, semitones(ROOT, step + 12), 0.9, 'sawtooth', 0.045, filt=1500, filt_to=5000, detune=10, wet=0.4)
    sfx_kick(mix, at + 0.42, 0.45)
    sfx_cymbal(mix, at + 0.42, 0.1)


def sfx_go(mix: Mix, at: float) -> None:
    for step in [0, 4, 7, 12]:
        voice(mix, at, semitones(scale_note(5), step), 0.45, 'sawtooth', 0.05, detune=8, filt=2500, wet=0.3)
    sfx_kick(mix, at, 0.4)


# Clears in the recording: (seconds into the file, lines, combo).
CLEARS = [
    (TETRIS_2, 4, 0), (44.22, 1, 1), (45.42, 1, 2), (46.62, 1, 3), (47.22, 2, 4), (TETRIS_1, 4, 5),
    (140.78, 1, 0),
]


def game_sounds(mix: Mix) -> None:
    for source, lines, combo in CLEARS:
        for at in output_times(source):
            sfx_hard_drop(mix, at)
            sfx_clear(mix, at, lines, combo)
            if lines >= 2 or combo >= 1:
                sfx_attack(mix, at + 0.12, 4 if lines >= 4 else lines + combo)
    for beat in (12, 13, 14):
        sfx_countdown(mix, b(beat))
    sfx_go(mix, b(15))
    for beat in (24.5, 26.5):
        sfx_incoming(mix, b(beat))
    for at in output_times(KNOCKOUT):
        sfx_ko(mix, at)
    for at in output_times(WIN):
        sfx_win(mix, at)


# The music: 128 BPM, G major, vi-IV-I-V (Em C G D).

CHORDS = [
    (82.41, [64, 67, 71]),   # Em: E4 G4 B4 (MIDI)
    (65.41, [64, 67, 72]),   # C:  E4 G4 C5
    (98.00, [62, 67, 71]),   # G:  D4 G4 B4
    (73.42, [62, 66, 69]),   # D:  D4 F#4 A4
]


def midi(note: float) -> float:
    return 440 * 2 ** ((note - 69) / 12)


def section(beat: float) -> str:
    if beat < 8:
        return 'groove'
    if beat < 12:
        return 'breakdown'
    if beat < 16:
        return 'build'
    if beat < 24:
        return 'drop'
    if beat < 28:
        return 'tension'
    if beat < 32:
        return 'drop'
    if beat < 36:
        return 'build2'
    if beat < 40:
        return 'slowmo'
    if beat < 44:
        return 'groove'
    return 'outro'


def kick(n_dur: float = 0.42) -> np.ndarray:
    n = int(n_dur * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    click = _noise_rng.uniform(-1, 1, n) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6) * 0.9


def clap() -> np.ndarray:
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for k, d in enumerate((0, 0.011, 0.022)):
        env += (t >= d) * np.exp(-(t - d).clip(0) / (0.006 if k < 2 else 0.11))
    x = signal.sosfilt(biquad('bandpass', 1500, 0.9), _noise_rng.uniform(-1, 1, n)) * env
    return x * 2.2


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.14 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    x = signal.sosfilt(biquad('highpass', 8000, 0.7), _noise_rng.uniform(-1, 1, n))
    return x * np.exp(-t / (0.05 if open_ else 0.012))


def saw_stack(freq: float, dur: float, voices: int = 5, spread: float = 18) -> np.ndarray:
    n = int(dur * SR)
    out = np.zeros(n)
    for i in range(voices):
        cents = (i - (voices - 1) / 2) * spread / max(1, (voices - 1) / 2)
        out += osc('sawtooth', freq, dur, cents=cents)[:n]
    return out / voices


def music(mix: Mix) -> None:
    # Sidechain: everything melodic ducks under each kick.
    duck = np.ones(N_SAMPLES)
    kicks = []
    for beat in range(BEATS):
        sec = section(beat)
        if sec in ('breakdown',) or (sec == 'build' and beat < 14):
            continue
        if sec == 'slowmo' and beat % 2:
            continue
        if sec == 'outro' and beat >= 50:
            continue
        kicks.append(b(beat))
    t_dur = int(0.3 * SR)
    curve = 1 - 0.75 * np.exp(-np.arange(t_dur) / SR / 0.09)
    for at in kicks:
        i = int(at * SR)
        duck[i:i + t_dur] = np.minimum(duck[i:i + t_dur], curve[: len(duck[i:i + t_dur])])

    pad_bus = np.zeros(N_SAMPLES)
    bass_bus = np.zeros(N_SAMPLES)
    lead_bus = np.zeros(N_SAMPLES)

    def place(bus: np.ndarray, x: np.ndarray, at: float, gain: float = 1.0) -> None:
        i = int(at * SR)
        x = x[: max(0, N_SAMPLES - i)]
        bus[i:i + len(x)] += x * gain

    K = kick()
    for at in kicks:
        mix.add(K, at, gain=0.95)

    for bar in range(BEATS // 4):
        beat0 = bar * 4
        sec = section(beat0)
        root, notes = CHORDS[bar % 4]
        dur = b(4)

        # Pads.
        for note in notes:
            x = saw_stack(midi(note), dur + 0.15)
            cutoff = {'breakdown': (500, 1400), 'build': (900, 3200), 'tension': (700, 700), 'slowmo': (1600, 500),
                      'build2': (1200, 3500), 'outro': (2600, 1800)}.get(sec, (2600, 2600))
            x = sweep_filter(x, 'lowpass', cutoff[0], cutoff[1], 0.8)
            n = len(x)
            env = np.minimum(1, np.arange(n) / (0.02 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.12 * SR))
            place(pad_bus, x * env, b(beat0), 0.11)

        # Bass: off-beat eighths (sustained notes in the breakdown and slow motion).
        if sec in ('breakdown', 'slowmo'):
            x = osc('sine', root, dur) * 0.9 + osc('sawtooth', root, dur) * 0.15
            x = x[: int(dur * SR)] * np.minimum(1, np.arange(int(dur * SR)) / (0.03 * SR))
            place(bass_bus, x, b(beat0), 0.32)
        elif sec != 'build' or beat0 >= 12:
            for k in range(8):
                if k % 2 == 0:
                    continue
                d = b(0.5) * 0.9
                x = osc('sawtooth', root, d) * 0.6 + osc('square', root * 2, d) * 0.2 + osc('sine', root, d) * 0.7
                x = signal.sosfilt(biquad('lowpass', 520, 0.9), x)
                x *= np.exp(-np.arange(len(x)) / SR / 0.16)
                place(bass_bus, x, b(beat0 + k * 0.5), 0.42)

        # Lead: a 16th-note arpeggio in the drops and the closing groove.
        if sec in ('drop', 'groove', 'outro') and beat0 >= 4:
            pattern = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 3, 2, 1, 0]
            tones = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 24]
            for k, p in enumerate(pattern):
                d = b(0.25)
                x = osc('sawtooth', midi(tones[p]), d * 1.6) * 0.7 + osc('square', midi(tones[p]) * 1.003, d * 1.6) * 0.3
                x = sweep_filter(x, 'lowpass', 5200, 900, 1.2)
                x *= np.exp(-np.arange(len(x)) / SR / 0.09)
                place(lead_bus, x, b(beat0 + k * 0.25), 0.075 if sec != 'outro' else 0.05)

    # Drums.
    C, Hc, Ho = clap(), hat(), hat(True)
    for beat in range(BEATS):
        sec = section(beat)
        if sec in ('breakdown',):
            continue
        if sec in ('drop', 'groove', 'tension', 'build2') or (sec == 'outro' and beat < 50):
            if beat % 2 == 1:
                mix.add(C, b(beat), gain=0.32, wet=0.25)
            for k in range(4):
                g = 0.11 if k == 2 else 0.05
                mix.add(Ho if k == 2 else Hc, b(beat + k * 0.25), gain=g, pan=0.25 if k % 2 else -0.25)
        if sec == 'slowmo' and beat % 4 == 2:
            mix.add(C, b(beat), gain=0.3, wet=0.6)

    # Snare rolls into the drops.
    for start, end in ((12, 15.5), (32, 36)):
        beat = start
        while beat < end:
            progress = (beat - start) / (end - start)
            mix.add(C, b(beat), gain=0.1 + 0.22 * progress, wet=0.2)
            beat += 1 if progress < 0.25 else 0.5 if progress < 0.5 else 0.25 if progress < 0.75 else 0.125

    # Risers, impacts, whooshes.
    def riser(at: float, dur: float, gain: float = 0.18) -> None:
        n = int(dur * SR)
        x = sweep_filter(_noise_rng.uniform(-1, 1, n), 'bandpass', 300, 9000, 1.4)
        x *= (np.arange(n) / n) ** 2 * gain
        mix.add(x, at, wet=0.3)

    def impact(at: float, gain: float = 0.6) -> None:
        n = int(1.6 * SR)
        t = np.arange(n) / SR
        boom = np.sin(2 * math.pi * np.cumsum(38 + 40 * np.exp(-t / 0.08)) / SR) * np.exp(-t / 0.5)
        crack = sweep_filter(_noise_rng.uniform(-1, 1, n), 'lowpass', 6000, 200) * np.exp(-t / 0.12)
        mix.add(np.tanh((boom + crack * 0.6) * 1.4) * gain, at, wet=0.35)

    def whoosh(at: float, dur: float = 0.45, gain: float = 0.12) -> None:
        n = int(dur * SR)
        x = sweep_filter(_noise_rng.uniform(-1, 1, n), 'bandpass', 600, 5000, 2.0)
        x *= np.sin(np.linspace(0, math.pi, n)) ** 2 * gain
        mix.add(x, at - dur * 0.7, pan=-0.3, wet=0.2)

    def reverse_swell(at: float, dur: float, gain: float = 0.16) -> None:
        n = int(dur * SR)
        x = sweep_filter(_noise_rng.uniform(-1, 1, n), 'highpass', 2000, 7000, 0.7)
        x *= (np.arange(n) / n) ** 3 * gain
        mix.add(x, at - dur, wet=0.4)

    riser(b(12), b(3.5))
    riser(b(32), b(4))
    reverse_swell(b(8), b(2))
    reverse_swell(b(40), b(2))
    reverse_swell(b(44), b(1.5))
    for beat in (0, 8, 16, 28, 36, 44):
        impact(b(beat), 0.55 if beat in (16, 36, 44) else 0.4)
    for beat in (4, 12, 24, 32, 40):
        whoosh(b(beat))
    for i in range(4):
        voice(mix, b(40 + i), midi(CHORDS[2][1][i % 3] + 12), 0.25, 'sawtooth', 0.05, detune=10, filt=3000, wet=0.3)

    # Final chord hit on the end card, held out.
    for note in CHORDS[2][1] + [55]:
        voice(mix, b(44), midi(note), b(8), 'sawtooth', 0.035, attack=0.01, filt=3000, filt_to=900, detune=12, wet=0.5)

    mix.dry[0] += (pad_bus * duck + bass_bus * duck + lead_bus * 0.8) * 0.9
    mix.dry[1] += (pad_bus * duck + bass_bus * duck + lead_bus * 0.8) * 0.9
    # Stereo width on the lead: a dotted-eighth echo to each side.
    for delay, pan, g in ((b(0.75), 0, 0.3), (b(1.5), 1, 0.18)):
        d = int(delay * SR)
        mix.dry[pan, d:] += lead_bus[:-d] * g
    mix.send[0] += pad_bus * duck * 0.2 + lead_bus * 0.25
    mix.send[1] += pad_bus * duck * 0.2 + lead_bus * 0.25


def soundtrack(path: Path) -> None:
    mix = Mix()
    music(mix)
    sfx = Mix()
    game_sounds(sfx)
    audio = mix.render(1.8, seed=1) + sfx.render(1.4, seed=2) * 1.6

    # Gentle high-pass and glue, then loudness to -14 LUFS with a soft limiter.
    audio = signal.sosfilt(biquad('highpass', 28, 0.7), audio, axis=1)
    meter = pyloudnorm.Meter(SR)
    loud = meter.integrated_loudness(audio.T)
    audio *= 10 ** ((-13.0 - loud) / 20)
    audio = np.tanh(audio * 1.2) / 1.2
    loud = meter.integrated_loudness(audio.T)
    audio *= 10 ** ((-14.0 - loud) / 20)
    audio = np.clip(audio, -0.89, 0.89)

    fade = int(0.35 * SR)
    end = int(DURATION * SR)
    audio[:, end - fade:end] *= np.linspace(1, 0, fade)
    audio = audio[:, :end]

    pcm = (audio.T * 32767).astype(np.int16)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'audio: {meter.integrated_loudness(audio.T):.1f} LUFS')


# ---------------------------------------------------------------- main


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit('usage: make_gameplay_ad.py path/to/recording.mov [--preview=seconds,seconds]')
    recording = Path(args[0]).expanduser()
    fonts_ready()
    load_pointer_mask(recording)
    OUT.mkdir(exist_ok=True)

    preview = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--preview=')), None)
    if preview:
        # Stills at the given times, for checking a layout without a full render.
        for t in [float(x) for x in preview.split(',')]:
            r = Renderer(recording)
            Image.fromarray(r.frame(round(t * FPS))).save(OUT / f'preview-{t:05.2f}.png')
            r.close()
        return

    audio = OUT / 'soundtrack.wav'
    soundtrack(audio)

    video = OUT / 'tetrisclash-gameplay-ad.mp4'
    encoder = subprocess.Popen(
        [FFMPEG, '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
         '-i', '-', '-i', str(audio), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high',
         '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
         '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', str(video)],
        stdin=subprocess.PIPE)
    renderer = Renderer(recording)
    cover_frame = round(output_times(TETRIS_1)[0] * FPS) + 5
    for n in range(FRAMES):
        frame = renderer.frame(n)
        encoder.stdin.write(frame.tobytes())
        if n == cover_frame:
            Image.fromarray(frame).save(OUT / 'tetrisclash-gameplay-cover.png')
        if n % 60 == 0:
            print(f'frame {n}/{FRAMES}')
    renderer.close()
    encoder.stdin.close()
    encoder.wait()
    print(f'wrote {video}')


if __name__ == '__main__':
    main()

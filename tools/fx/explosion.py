"""A knockout explosion drawn the way an 80s mecha show drew one, as a flipbook.

Eight drawings (two-thirds of a second on twos):
  0  the flash: a ragged white starburst
  1  the fireball bursts out of it, debris flying
  2-3  the fireball swells and boils, dark smoke rolling out behind it
  4-5  the smoke takes over and starts to swallow the fire
  6-7  the smoke breaks into separate puffs and goes

Every shape is painted like a cel: puffs with a wobbling edge, each in three
flat tones (a lit crescent toward the light, a mid tone, a deep tone on the
far side) and traced in a dark line, laid down back to front. The fire has no
ink line, only a darker rim. Rendered at twice the size and halved.

    python3 tools/fx/explosion.py <outdir> [size] [seed]

The game's atlas is the sheet at size 384, seed 7, copied to
src/client/render/sprites/explosion.png.
"""
import math
import os
import sys

import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 256
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 7
SS = 2
N = SIZE * SS
rng = np.random.default_rng(SEED)
os.makedirs(OUT, exist_ok=True)

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
X = (xx + 0.5) / N * 2 - 1
Y = 1 - (yy + 0.5) / N * 2
ANG = np.arctan2(Y, X)
R = np.hypot(X, Y)
L = np.array([-0.55, 0.8])
L /= np.linalg.norm(L)
PX = 2.0 / N
LW = 2.4 * PX * SS  # ink line width: ~2.4 px at the final size

C = lambda h: np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
WHITE, PALE = C('#fffbe8'), C('#fff1a8')
YELLOW, ORANGE, RED, EMBER = C('#ffd23f'), C('#ff8a1c'), C('#d9381e'), C('#8f1d17')
SMOKE_LIT, SMOKE, SMOKE_DEEP = C('#8a7a8c'), C('#54465c'), C('#2f2638')
FIRELIT = C('#b4563c')
THIN_LIT, THIN, THIN_DEEP = C('#a99aa6'), C('#7a6a7e'), C('#55475e')
INK = C('#160f1f')


def wobble(n=5, amp=0.12, fmax=9):
    ph = rng.uniform(0, 2 * math.pi, n)
    fr = rng.integers(2, fmax, n)
    am = rng.uniform(0.4, 1.0, n)
    am = am / am.sum() * amp
    return lambda a, k=0: sum(am[i] * np.sin(fr[i] * a + ph[i] + k * 0.9 * (i % 3 - 1)) for i in range(n))


def lattice_noise(scale, seed):
    """Smooth value noise over the canvas."""
    r = np.random.default_rng(seed)
    g = r.random((scale + 3, scale + 3)).astype(np.float32)
    u = (X * 0.5 + 0.5) * scale
    v = (Y * 0.5 + 0.5) * scale
    i, j = np.floor(u).astype(int), np.floor(v).astype(int)
    fu, fv = u - i, v - j
    fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
    a, b, c, d = g[i, j], g[i + 1, j], g[i, j + 1], g[i + 1, j + 1]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


class Canvas:
    def __init__(self):
        self.rgb = np.zeros((N, N, 3), np.float32)
        self.a = np.zeros((N, N), np.float32)

    def paint(self, mask, col):
        self.rgb[mask] = col
        self.a[mask] = 1.0

    def puff(self, cx, cy, r, wob, k, tones, ink=True, firelit=0.0):
        """One puff: three flat tones by which way it faces the light, then its line."""
        dx, dy = X - cx, Y - cy
        d = np.hypot(dx, dy)
        sdf = d - r * (1 + wob(np.arctan2(dy, dx), k))
        inside = sdf < 0
        lit = (dx * L[0] + dy * L[1]) / r
        lit_t, mid_t, deep_t = tones
        self.paint(inside, mid_t)
        # The lit crescent: offset toward the light, so it hugs that edge.
        crescent = inside & (np.hypot(dx - L[0] * r * 0.32, dy - L[1] * r * 0.32) > r * 0.78) & (lit > 0.1)
        self.paint(crescent, lit_t)
        # The shadow: a curved terminator, the edge of a circle shifted toward the light.
        self.paint(inside & (np.hypot(dx - L[0] * r * 0.42, dy - L[1] * r * 0.42) > r * 0.98) & (lit < 0.2), deep_t)
        if firelit > 0:
            # The side facing the fire glows: light from the centre of the blast.
            toward = -(dx * cx + dy * cy) / (r * max(math.hypot(cx, cy), 1e-3))
            self.paint(inside & (toward > 1 - firelit), FIRELIT)
        if ink:
            self.paint((sdf < 0) & (sdf > -LW), INK)

    def rgba(self):
        rgba = np.concatenate([self.rgb, self.a[..., None]], -1)
        rgba[..., :3] *= rgba[..., 3:4]
        small = rgba.reshape(SIZE, SS, SIZE, SS, 4).mean((1, 3))
        a = small[..., 3:4]
        small[..., :3] = np.where(a > 0, small[..., :3] / np.maximum(a, 1e-6), 0)
        return Image.fromarray((np.clip(small, 0, 1) * 255).astype(np.uint8), 'RGBA')


class Puff:
    def __init__(self, ang, dist, r, rise=0.0):
        self.ang, self.dist, self.r, self.rise = ang, dist, r, rise
        self.wob = wobble(3, 0.045, 5)
        self.drift = rng.uniform(0.9, 1.12)


FIRE = [Puff(i / 8 * 2 * math.pi + rng.uniform(-0.3, 0.3), rng.uniform(0.1, 0.24), rng.uniform(0.17, 0.25)) for i in range(8)]
FIRE.append(Puff(0, 0, 0.26))
SMOKE_P = [Puff(i / 12 * 2 * math.pi + rng.uniform(-0.18, 0.18), rng.uniform(0.3, 0.42), rng.uniform(0.15, 0.22), rng.uniform(0, 0.1)) for i in range(12)]
# Puffs that later roll in front of the fire.
FRONT_P = [Puff(rng.uniform(0, 2 * math.pi), rng.uniform(0.08, 0.2), rng.uniform(0.13, 0.19), rng.uniform(0, 0.06)) for _ in range(6)]
DEBRIS = [(i / 7 * 2 * math.pi + rng.uniform(-0.3, 0.3), rng.uniform(0.75, 1.0)) for i in range(7)]
FIRE_EDGE = wobble(7, 0.1)
NOISE = [lattice_noise(6, SEED * 10 + k) for k in range(8)]


def starburst(c, spikes, inner, outer, jitter, col, seed):
    r = np.random.default_rng(seed)
    n = spikes * 2
    angs = np.arange(n) / n * 2 * math.pi + r.uniform(-0.08, 0.08, n)
    rads = np.where(np.arange(n) % 2 == 0, outer * (1 - jitter + r.random(n) * jitter), inner * (0.85 + r.random(n) * 0.3))
    # Point-in-star: interpolate the radius between the polygon's vertices by angle.
    a = np.mod(ANG, 2 * math.pi)
    idx = np.searchsorted(np.append(angs, 2 * math.pi + angs[0]), a) - 1
    idx = np.clip(idx, 0, n - 1)
    a0 = angs[idx]
    a1 = np.where(idx + 1 < n, angs[(idx + 1) % n], angs[0] + 2 * math.pi)
    r0, r1 = rads[idx], rads[(idx + 1) % n]
    f = np.clip((a - a0) / np.maximum(a1 - a0, 1e-6), 0, 1)
    edge = r0 + (r1 - r0) * f
    c.paint(R < edge, col)


def debris(c, t):
    for a0, ln in DEBRIS:
        r0 = 0.3 + 0.62 * t
        r1 = r0 + 0.16 * ln
        da = np.angle(np.exp(1j * (ANG - a0)))
        # A tapered shard: wide at its head, a point at its tail.
        along = np.clip((R - r0) / (r1 - r0), 0, 1)
        w = 0.003 + 0.02 * along
        shard = (np.abs(da) * R < w) & (R > r0) & (R < r1)
        c.paint(shard, INK)
        # A hot fleck at the head.
        hx, hy = math.cos(a0) * r1, math.sin(a0) * r1
        c.paint(np.hypot(X - hx, Y - hy) < 0.022, ORANGE)


def fire(c, k, scale, lift):
    if scale <= 0:
        return
    sdfs = []
    for p in FIRE:
        cx = math.cos(p.ang) * p.dist * scale
        cy = math.sin(p.ang) * p.dist * scale + lift
        dx, dy = X - cx, Y - cy
        sdfs.append(np.hypot(dx, dy) - p.r * scale * (1 + p.wob(np.arctan2(dy, dx), k)))
    f = np.min(np.stack(sdfs), 0)
    inside = f < 0
    # Heat: depth into the fireball, plus a boil that changes each drawing.
    depth = -f / (0.2 * scale)
    heat = depth + (NOISE[k] - 0.5) * 0.45
    cool = [0, -0.25, -0.1, 0.05, 0.22, 0.4, 0.6, 0.8][k]
    col = np.where((heat > 0.72 + cool)[..., None], WHITE,
          np.where((heat > 0.42 + cool * 0.6)[..., None], YELLOW,
          np.where((heat > 0.16 + cool * 0.3)[..., None], ORANGE, RED)))
    c.rgb[inside] = col[inside]
    c.a[inside] = 1
    c.paint((f < 0) & (f > -LW * 1.1), EMBER)


def draw(k):
    t = k / 7.0
    c = Canvas()
    if k == 0:
        starburst(c, 15, 0.3, 0.98, 0.5, PALE, SEED)
        starburst(c, 11, 0.24, 0.62, 0.4, WHITE, SEED + 1)
        return c
    # Smoke behind, rolling out from drawing 2.
    if k >= 2:
        g = 0.62 + 0.8 * t
        order = sorted(SMOKE_P, key=lambda p: -math.sin(p.ang))  # top ones first, so lower puffs overlap them
        for p in order:
            shrink = 1 - max(0.0, t - 0.72) * 1.4
            r = p.r * (0.75 + 0.85 * t) * shrink
            if r < 0.02:
                continue
            spread = 1 + max(0.0, t - 0.7) * 0.9
            cx = math.cos(p.ang) * p.dist * g * p.drift * spread
            cy = math.sin(p.ang) * p.dist * g * p.drift * spread + p.rise * t + 0.1 * max(0.0, t - 0.4)
            glow = [0, 0, 0.7, 0.65, 0.5, 0.35, 0.0, 0.0][k]
            tones = (THIN_LIT, THIN, THIN_DEEP) if k >= 7 else (SMOKE_LIT, SMOKE, SMOKE_DEEP)
            c.puff(cx, cy, r, p.wob, k, tones, firelit=glow)
    if 1 <= k <= 5:
        debris(c, t)
    scale = [0, 1.0, 1.3, 1.42, 1.3, 1.0, 0.6, 0.0][k]
    fire(c, k, scale, 0.04 * t)
    # Smoke rolling over the fire as it dies.
    if k >= 4:
        for i, p in enumerate(FRONT_P[: (k - 3) * 2]):
            r = p.r * (0.8 + 0.6 * t) * (1 - max(0.0, t - 0.8) * 2.6)
            if r < 0.02:
                continue
            cx = math.cos(p.ang) * p.dist * (1 + t)
            cy = math.sin(p.ang) * p.dist * (1 + t) + p.rise + 0.08 * t
            c.puff(cx, cy, r, p.wob, k, (SMOKE_LIT, SMOKE, SMOKE_DEEP) if k < 7 else (THIN_LIT, THIN, THIN_DEEP), firelit=0.4 if k <= 5 else 0)
    return c


frames = [draw(k).rgba() for k in range(8)]
sheet = Image.new('RGBA', (SIZE * 8, SIZE))
for i, f in enumerate(frames):
    f.save(os.path.join(OUT, f'explosion_{i}.png'))
    sheet.paste(f, (i * SIZE, 0))
sheet.save(os.path.join(OUT, 'explosion_sheet.png'))
print('wrote', len(frames), 'drawings to', OUT)

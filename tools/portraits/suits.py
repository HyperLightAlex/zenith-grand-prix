"""Builds what the game needs to put any cast pilot's portrait in any team's
colours, from the keyed pilots in art/portraits/keyed/ (each cast portrait
repainted in ChatGPT with a flat green ground and the suit and headset in
the key colours; see art/portraits/PROMPTS.md, Stage A0).

For each pilot, into src/client/ui/art/pilots/:

- face-<name>.webp: the portrait cut out of its green ground (512 x 512, its
  edges un-mixed from the green: each edge pixel re-blended from the nearest
  solid colour, so fine hair keeps no fringe);
- suit-<name>.png: which pixels are suit or headset, and how: 0 for none,
  else 1 + 30 x key + shade, the key one of main, main shadow, accent,
  accent shadow, trim, trim shadow, inner, inner shadow (0 to 7) and the
  shade (0 to 29) how far the pixel runs from the ink to the key's colour.
  The game paints each such pixel ink + shade x (the team's colour - ink).

And once:

- ground-<team>.webp: each team's ground behind its pilots (256 x 256), put
  together from its three portraits (the rows they leave uncovered; the
  ground is a vertical fade with scan lines);
- ground-league.webp: the same fade and lines in grey, for a pilot flying for
  no team (tinted with their pilot colour in the game);
- suits.json: the cast in order, each team's suit colours (taken from its
  own three pilots: the original colour under each key), and which pilots
  are always repainted (their own painting carries something the player's
  version leaves out: Squall's Tempest bolt).

Which pixels are suit: the area the repaint changed in the key colours, kept
where it runs off the bottom edge (the suit) or holds several key colours
together (the headset), so a strand of hair redrawn in a red near the key's
is left alone; closed over the ink between panels and filled to the bottom
edge; plus every blue patch touching it (Solstice's blue is the key's blue,
so its blue panels did not change in the repaint).

    python3 tools/portraits/suits.py
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[2]
KEYED = ROOT / 'art/portraits/keyed'
ART = ROOT / 'src/client/ui/art'
OUT = ART / 'pilots'

# The cast, in the game's order (hudArt.ts PILOTS): by team, then forward,
# midfielder, defender.
CAST = ['kite', 'lark', 'atlas', 'shrike', 'moth', 'golem', 'sirocco', 'ibis', 'dune', 'orion', 'vesper', 'bastion', 'squall', 'gale', 'anvil']
TEAMS = ['solstice', 'vanta', 'mirage', 'aurora', 'tempest']
# Pilots whose player's version is their keyed portrait with something taken
# out (keyed/pilot-<name>-plain.png): always repainted, on their own team too.
PLAIN = ['squall']

N = 512
INK = np.array([28, 22, 34], float)
# The keys (PROMPTS.md), and how near a colour must be to count as one.
KEYS = [
    ('main', (224, 48, 48), 45),
    ('main_s', (160, 30, 30), 40),
    ('acc', (48, 80, 224), 45),
    ('acc_s', (31, 53, 160), 40),
    ('trim', (240, 192, 32), 45),
    ('trim_s', (176, 138, 16), 35),
    ('under', (42, 42, 51), 14),
    ('under_s', (26, 26, 32), 10),
]
K = np.array([k for _, k, _ in KEYS], float)
SHADES = 30


def disk(r):
    return np.add.outer(np.arange(-r, r + 1) ** 2, np.arange(-r, r + 1) ** 2) <= r * r


def close(x, r):
    """A closing that carries on past the picture's edges (so the suit's bottom rows, which run off it, are not eaten)."""
    p = r + 1
    return ndi.binary_closing(np.pad(x, p, mode='edge'), structure=disk(r))[p:-p, p:-p]


def load(name):
    orig = np.asarray(Image.open(ART / f'pilot-{name}.webp').convert('RGB').resize((N, N), Image.LANCZOS), float)
    src = KEYED / (f'pilot-{name}-plain.png' if name in PLAIN else f'pilot-{name}.png')
    keyed = np.asarray(Image.open(src).convert('RGB').resize((N, N), Image.LANCZOS), float)
    return orig, keyed


def shade(k, i):
    """How far each pixel runs from the ink to key i (0 to 1), and how far off that line it is."""
    v = K[i] - INK
    t = np.clip(((k - INK) @ v) / (v @ v), 0, 1)
    return t, np.linalg.norm(k - (INK + t[..., None] * v), axis=-1)


def classify(o, k):
    """Each pixel's key (0 to 7) where it is suit or headset, else -1."""
    h, w, _ = k.shape
    dk = np.stack([np.linalg.norm(k - c, axis=-1) for c in K], -1)
    near = np.argmin(dk, -1)
    dmin = np.min(dk, -1)
    core = np.zeros((h, w), bool)
    lab0 = np.full((h, w), -1)
    for i, (_, _, reach) in enumerate(KEYS):
        m = (near == i) & (dmin < reach)
        lab0[m] = i
        core |= m
    changed = ndi.gaussian_filter(np.linalg.norm(k - o, axis=-1), 1.5) > 45
    seed = close(changed & core, 7)
    comp, n = ndi.label(seed)
    keep = np.zeros(n + 1, bool)
    for c in range(1, n + 1):
        m = comp == c
        if m[-1].any():
            keep[c] = True
            continue
        kinds = sum(1 for grp in ([0, 1], [2, 3], [4, 5]) if np.isin(lab0[m], grp).sum() >= 40)
        keep[c] = kinds >= 2
    seed = keep[comp]
    floor = np.ones((1, w), bool)
    region = ndi.binary_fill_holes(np.vstack([seed, floor]))[:-1]
    blue = np.isin(lab0, [2, 3])
    comp, _ = ndi.label(blue)
    for _ in range(3):
        touch = np.unique(comp[ndi.binary_dilation(region, iterations=3) & blue])
        region |= np.isin(comp, touch[touch > 0])
        region = ndi.binary_fill_holes(np.vstack([close(region, 3), floor]))[:-1]
    region = ndi.binary_dilation(region, iterations=2)
    lab = np.where(region & core, lab0, -1)
    for i in range(len(KEYS)):
        grown = ndi.binary_dilation(lab == i, iterations=2) & (lab == -1) & region
        _, off = shade(k, i)
        lab[grown & (off < 28)] = i
    return lab


def cut_out(k):
    """The ground's share of each pixel (1: all green) and each pixel's colour without it."""
    g0 = np.median(np.concatenate([k[:4].reshape(-1, 3), k[:, :4].reshape(-1, 3)]), axis=0)
    ex = k[..., 1] - np.maximum(k[..., 0], k[..., 2])
    a0 = np.clip(ex / (g0[1] - max(g0[0], g0[2])), 0, 1)
    solid = (a0 < 0.03).astype(float)

    def box(x):
        return ndi.uniform_filter(x, size=9)

    wsum = np.maximum(box(solid), 1e-6)
    near = np.stack([box(k[..., c] * solid) for c in range(3)], -1) / wsum[..., None]
    d = g0 - near
    a = np.clip(((k - near) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-6), 0, 1)
    a = np.where(box(solid) > 0.02, a, a0)
    a[a0 < 0.03] = 0
    a[a0 > 0.97] = 1
    rgb = k.copy()
    edge = (a > 0) & (a < 1)
    rgb[edge] = near[edge]
    return a, rgb, solid > 0


def suit_map(k, lab, ground, solid):
    """The suit map's values (see the top): edge pixels against the ground take their solid neighbours' key."""
    v = np.zeros(lab.shape, np.uint8)
    t_all = np.zeros(lab.shape)
    for i in range(len(KEYS)):
        m = lab == i
        t, _ = shade(k, i)
        t_all[m] = t[m]
    # Edge pixels (part ground) that are not keyed themselves: the key most of their solid neighbours have.
    edge = (ground > 0) & (ground < 1) & (lab < 0)
    if edge.any():
        votes = np.stack([ndi.uniform_filter(((lab == i) & solid).astype(float), size=5) for i in range(len(KEYS))], -1)
        tsum = np.stack([ndi.uniform_filter(np.where((lab == i) & solid, t_all, 0), size=5) for i in range(len(KEYS))], -1)
        best = np.argmax(votes, -1)
        share = np.take_along_axis(votes, best[..., None], -1)[..., 0]
        tmean = np.take_along_axis(tsum, best[..., None], -1)[..., 0] / np.maximum(share, 1e-6)
        take = edge & (share > 0.25)
        lab = lab.copy()
        lab[take] = best[take]
        t_all[take] = tmean[take]
    m = lab >= 0
    v[m] = 1 + lab[m] * SHADES + np.round(np.clip(t_all[m], 0, 1) * (SHADES - 1)).astype(np.uint8)
    return v


def ground_of(team_names, cuts):
    """A team's ground (256): each row's colour, the median of its pilots' originals where their keyed portraits are ground (the ground is a vertical fade with scan lines, the same across a row); rows they all cover carry the fade on."""
    rows = [[] for _ in range(256)]
    for name in team_names:
        o = np.asarray(Image.open(ART / f'pilot-{name}.webp').convert('RGB').resize((256, 256), Image.LANCZOS), float)
        a = np.asarray(Image.fromarray((cuts[name] * 255).astype(np.uint8)).resize((256, 256), Image.BILINEAR), float) / 255
        # Clear ground only, kept off the portrait's edges.
        clear = ndi.binary_erosion(a > 0.98, iterations=3)
        for y in range(256):
            if clear[y].any():
                rows[y].append(o[y][clear[y]])
    col = np.full((256, 3), np.nan)
    for y in range(256):
        px = np.concatenate(rows[y]) if rows[y] else np.zeros((0, 3))
        if len(px) >= 12:
            col[y] = np.median(px, axis=0)
    known = np.nonzero(~np.isnan(col[:, 0]))[0]
    if len(known) < 40:
        sys.exit(f'{team_names}: too little ground to see')
    ys = np.arange(256)
    for c in range(3):
        v = col[:, c]
        inside = (ys >= known[0]) & (ys <= known[-1])
        v[inside] = np.interp(ys[inside], known, v[known])
        # Past the last row seen, the fade carried on as it ran over the last rows seen (no darker than near black).
        for end, span in (('top', known[:24]), ('bottom', known[-24:])):
            fit = np.polyfit(span, v[span], 1)
            out = ys < known[0] if end == 'top' else ys > known[-1]
            v[out] = np.polyval(fit, ys[out])
        col[:, c] = np.clip(v, 6, 255)
    return np.repeat(col[:, None, :], 256, axis=1)


def save_webp(arr, path, alpha=None, quality=92):
    rgb = np.clip(np.round(arr), 0, 255).astype(np.uint8)
    if alpha is not None:
        rgba = np.dstack([rgb, np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)])
        Image.fromarray(rgba, 'RGBA').save(path, 'WEBP', quality=quality, alpha_quality=100, method=6)
    else:
        Image.fromarray(rgb, 'RGB').save(path, 'WEBP', quality=quality, method=6)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cuts = {}
    colours = {t: {nm: [] for nm, _, _ in KEYS} for t in TEAMS}
    for idx, name in enumerate(CAST):
        o, k = load(name)
        lab = classify(o, k)
        ground, rgb, solid = cut_out(k)
        cuts[name] = ground
        save_webp(rgb, OUT / f'face-{name}.webp', alpha=1 - ground)
        Image.fromarray(suit_map(k, lab, ground, solid), 'L').save(OUT / f'suit-{name}.png', optimize=True)
        team = TEAMS[idx // 3]
        for i, (nm, _, _) in enumerate(KEYS):
            colours[team][nm].append(o[lab == i])
        print('%-8s suit %5.1f%% of the frame' % (name, 100 * (lab >= 0).mean()))

    suits = []
    for t in TEAMS:
        pal = {}
        for nm, _, _ in KEYS:
            px = np.concatenate(colours[t][nm])
            pal[nm] = [int(x) for x in np.median(px, axis=0)] if len(px) > 200 else None
        for nm in ('main', 'acc', 'trim', 'under'):
            if pal[nm] is None:
                sys.exit(f'{t}: too little {nm} to take its colour from')
            if pal[nm + '_s'] is None:
                pal[nm + '_s'] = [int(x * 0.72) for x in pal[nm]]
        suits.append(pal)
    # Solstice's pilots line their collars in blue, which would make every
    # inner suit (straps and all) blue in Solstice: dark like everyone's.
    suits[0]['under'] = [30, 34, 58]
    suits[0]['under_s'] = [20, 22, 40]

    grounds = []
    for i, t in enumerate(TEAMS):
        g = ground_of(CAST[i * 3: i * 3 + 3], cuts)
        save_webp(g, OUT / f'ground-{t}.webp', quality=90)
        grounds.append(g)
    # The league's: Solstice's fade and lines in grey, brightest at 1.
    lum = grounds[0].mean(-1)
    lum = lum / lum.max() * 255
    save_webp(np.dstack([lum] * 3), OUT / 'ground-league.webp', quality=90)

    (OUT / 'suits.json').write_text(json.dumps({
        'cast': CAST,
        'keys': [nm for nm, _, _ in KEYS],
        'shades': SHADES,
        'ink': [int(x) for x in INK],
        'teams': suits,
        'plain': PLAIN,
    }, indent=1) + '\n')
    for t, pal in zip(TEAMS, suits):
        print('%-8s %s' % (t, ' '.join('%s=%s' % (k, '#%02x%02x%02x' % tuple(v)) for k, v in pal.items())))


if __name__ == '__main__':
    main()

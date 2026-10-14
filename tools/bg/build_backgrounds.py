"""Build each circuit's painted background (the anime look) from the sheets in
art/bg-sheets: the sky all the way round, the horizon strips, the cloud cards
and the surface textures.

    python3 tools/bg/build_backgrounds.py [circuit ...]

Writes src/client/render/backgrounds/<circuit>/*.webp and a generated module
src/client/render/backgrounds/<circuit>.ts that the game imports. Run it again
after replacing a sheet.

What it does to the sheets:
- Sky: the sun-side half and the half facing away (or one half used twice,
  for a sky with no sun side) side by side, their colours matched across both
  joins, resampled so the horizon sits on a fixed row; horizon to zenith.
- Horizon: each strip found, cut out of the green with a colour-difference
  key, its two ends blended so it repeats.
- Clouds: each cloud cut out by its own outline (grouped by the cell of the
  sheet its middle falls in) and packed into an atlas.
- Surfaces: each square cut to the length that wraps best both ways, its
  seams blended, so it repeats.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SHEETS = os.path.join(ROOT, 'art', 'bg-sheets')
OUT = os.path.join(ROOT, 'src', 'client', 'render', 'backgrounds')

# The sky texture: SKY_W x SKY_H, the horizon HAZE rows above the bottom.
SKY_W, SKY_H, HAZE = 3072, 768, 24

CIRCUITS = {
    'meridian': dict(
        sky=['bg-m1-sky.png', 'bg-m1b-sky.png'],
        horizon='bg-m2-horizon.png',
        clouds='bg-m3-clouds.png',
        surfaces='bg-m4-surfaces.png',
        tiles=['sea', 'office', 'hotel', 'dark', 'concrete', 'panels'],
    ),
    'canyon': dict(
        sky=['bg-c1-sky.png', 'bg-c1b-sky.png'],
        # C1's left edge carries more of the sunset than C1B's right edge.
        join_band=640,
        horizon='bg-c2-horizon.png',
        clouds='bg-c3-clouds.png',
        # A sliver of grey-blue painted sky between two of the cloudlets:
        # everything in these clouds is clearly redder than it is green.
        drop_cool=True,
        surfaces='bg-c4-surfaces.png',
        tiles=['strata', 'caprock', 'sand', 'gorge', 'hoodoo', 'lakebed'],
    ),
    'helios': dict(
        # The sun is overhead and the light even all round: one half, used twice.
        sky=['bg-h1-sky.png'],
        horizon='bg-h2-horizon.png',
        clouds='bg-h3-clouds.png',
        # Bits of the green left in the ragged cloud's gaps come out teal: no
        # noon cloud's colour is much greener than the mean of its red and blue.
        clamp_teal=True,
        surfaces='bg-h4-surfaces.png',
        tiles=['cloudsea', 'islandrock', 'meadow', 'whitewall', 'snow', 'gold'],
    ),
}


def load(name):
    return np.asarray(Image.open(os.path.join(SHEETS, name)).convert('RGB')).astype(np.float32) / 255


def save(arr, path, quality=86):
    mode = 'RGBA' if arr.shape[-1] == 4 else 'RGB'
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), mode).save(path, 'WEBP', quality=quality, method=6)
    return os.path.getsize(path)


# ---- sky -------------------------------------------------------------------

def horizon_row(sky):
    """The row where the painted sky meets the flat haze."""
    rowdiff = np.abs(np.diff(sky.mean(1), axis=0)).sum(1)
    lo = sky.shape[0] // 2
    return int(np.argmax(rowdiff[lo:]) + lo)


def sun_column(sky, hz):
    """Where the sun's glow is brightest, across the sheet."""
    from PIL import ImageFilter
    im = Image.fromarray((sky[:hz] * 255).astype(np.uint8)).convert('L').filter(ImageFilter.GaussianBlur(40))
    a = np.asarray(im).astype(np.float32)
    return int(np.unravel_index(np.argmax(a), a.shape)[1])


def sky_half(sky, width):
    """Horizon to the top edge, resampled so the horizon lands on a fixed row, with haze below."""
    hz = horizon_row(sky)
    up = Image.fromarray((sky[:hz] * 255).astype(np.uint8)).resize((width, SKY_H - HAZE), Image.LANCZOS)
    down = Image.fromarray((sky[hz + 4:hz + 4 + HAZE * 2] * 255).astype(np.uint8)).resize((width, HAZE), Image.LANCZOS)
    out = np.concatenate([np.asarray(up), np.asarray(down)], 0).astype(np.float32) / 255
    return out, hz


def edge_colour(img, side, n=40):
    """The sky's own colour along one edge, row by row: the median across a
    band by the edge, then down the rows (so the clouds in it do not count),
    smoothed; the sky and the haze below the horizon each on their own."""
    cols = img[:, :n] if side == 'left' else img[:, -n:]
    c = np.median(cols, 1)
    h = SKY_H - HAZE
    sky = ndimage.gaussian_filter1d(ndimage.median_filter(c[:h], size=(61, 1), mode='nearest'), 12, axis=0, mode='nearest')
    haze = ndimage.gaussian_filter1d(ndimage.median_filter(c[h:], size=(9, 1), mode='nearest'), 2, axis=0, mode='nearest')
    return np.concatenate([sky, haze], 0)


def match_joins(a, b, band=320):
    """Shift b's colours near both its edges to meet a's (a | b, wrapping round)."""
    b = b.copy()
    w = b.shape[1]
    ramp = (1 - np.arange(band) / band)[None, :, None]
    d1 = edge_colour(a, 'right') - edge_colour(b, 'left')
    b[:, :band] += d1[:, None, :] * ramp
    d2 = edge_colour(a, 'left') - edge_colour(b, 'right')
    b[:, w - band:] += (d2[:, None, :] * ramp)[:, ::-1]
    return b


def soften_seams(p, xs, r=10):
    """Blur a few columns either side of each join a little, so a cloud cut there fades across it."""
    p = p.copy()
    w = p.shape[1]
    for x in xs:
        idx = (np.arange(x - r * 3, x + r * 3)) % w
        seg = p[:, idx]
        blurred = ndimage.gaussian_filter1d(seg, r * 0.6, axis=1, mode='wrap')
        k = np.exp(-((np.arange(len(idx)) - r * 3) / r) ** 2)[None, :, None]
        p[:, idx] = seg * (1 - k) + blurred * k
    return p


def build_sky(spec):
    halves = [load(n) for n in spec['sky']]
    a, hz = sky_half(halves[0], SKY_W // 2)
    sun = sun_column(halves[0], hz) / halves[0].shape[1] * 0.5
    if len(halves) > 1:
        b, _ = sky_half(halves[1], SKY_W // 2)
        b = match_joins(a, b, spec.get('join_band', 320))
    else:
        b = a.copy()
    pano = np.concatenate([a, b], 1)
    pano = soften_seams(pano, [0, SKY_W // 2])
    return np.clip(pano, 0, 1), sun


# ---- keyed sheets ------------------------------------------------------------

def key_channels(bg):
    """The key's channels (those it is bright in: green's one, magenta's two) and the rest."""
    K = [c for c in range(3) if bg[c] > 0.5]
    return K, [c for c in range(3) if c not in K]


def keyness(x, K, O):
    """How far a colour leans toward the key: its weakest key channel over its strongest other one."""
    return np.min(x[..., K], -1) - np.max(x[..., O], -1)


def keyed(rgb, refine=True):
    """Cut a sheet out of its flat key colour (green, or magenta for art that
    is itself green). Alpha is how little the key's channels stand above the
    rest; edge pixels have the key taken back out; any of the key's hue left
    over is clamped away (nothing painted on these sheets is that colour); and
    the hidden colour under transparent pixels is filled from the nearest
    solid one, so filtering never pulls in the key."""
    bg = np.median(np.concatenate([rgb[:24, :24], rgb[-24:, -24:]]).reshape(-1, 3), 0)
    K, O = key_channels(bg)
    excess = keyness(rgb, K, O)
    full = float(keyness(bg, K, O))
    a = np.clip(1 - (excess - 0.04) / (full * 0.9 - 0.04), 0, 1)
    col = np.where(a[..., None] > 0.02, (rgb - (1 - a[..., None]) * bg) / np.maximum(a[..., None], 0.02), 0)
    col = np.clip(col, 0, 1)
    if len(K) == 1:
        k, o = K[0], O
        col[..., k] = np.minimum(col[..., k], np.maximum(col[..., o[0]], col[..., o[1]]))
    else:
        col[..., K] -= np.maximum(keyness(col, K, O), 0)[..., None]
    _, (iy, ix) = ndimage.distance_transform_edt(a < 0.98, return_indices=True)
    solid = a >= 0.98
    col = np.where(solid[..., None], col, col[iy, ix])
    if refine:
        a, col = refine_edges(rgb, bg, a, col)
    return np.concatenate([col, a[..., None]], -1)


def refine_edges(rgb, bg, a, col, inset=3, reach=40):
    """A second, closer look at the edges. The key alone misjudges an edge
    whose colour has some of the key's channel in it: a blue-white cloud's
    rim against green reads as solid (its blue hides the green; it comes out
    teal), an orange one as more solid than it is (it comes out olive).
    Instead each edge pixel is taken as a mix of the key and the colour a few
    pixels further in, and its alpha is how far along that line it lies."""
    core = ndimage.binary_erosion(a >= 0.98, iterations=inset)
    dist, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    F = rgb[iy, ix]
    d = F - bg
    al = np.clip(((rgb - bg) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-4), 0, 1)
    edge = ~core & (dist <= reach)
    a2 = np.where(edge, np.minimum(a, al), a)
    un = np.clip((rgb - (1 - a2[..., None]) * bg) / np.maximum(a2[..., None], 0.02), 0, 1)
    K, O = key_channels(bg)
    # Nothing on the sheets leans further toward the key than the colour inside it.
    if len(K) == 1:
        k, o = K[0], O
        lim = np.maximum(np.maximum(un[..., o[0]], un[..., o[1]]), F[..., k] - np.maximum(F[..., o[0]], F[..., o[1]]) + np.maximum(un[..., o[0]], un[..., o[1]]))
        un[..., k] = np.minimum(un[..., k], lim)
    else:
        un[..., K] -= np.maximum(keyness(un, K, O) - np.maximum(keyness(F, K, O), 0), 0)[..., None]
    w = np.clip((a2 - 0.2) / 0.5, 0, 1)[..., None]
    c2 = un * w + F * (1 - w)
    col = np.where(edge[..., None], c2, col)
    return a2, col


def wrap_ends(img, ov=32):
    """Blend a strip's last `ov` columns into its first ones and drop them, so it repeats end to end."""
    out = img[:, :-ov].copy()
    w = np.linspace(0, 1, ov)[None, :, None]
    pm_a = img[:, :ov, :3] * img[:, :ov, 3:]
    pm_b = img[:, -ov:, :3] * img[:, -ov:, 3:]
    al = img[:, :ov, 3:] * w + img[:, -ov:, 3:] * (1 - w)
    pm = pm_a * w + pm_b * (1 - w)
    out[:, :ov, :3] = np.where(al > 1e-3, pm / np.maximum(al, 1e-3), img[:, :ov, :3])
    out[:, :ov, 3:] = al
    return out


def build_horizon(spec):
    rgba = keyed(load(spec['horizon']))
    solid = rgba[..., 3] > 0.5
    rows = np.nonzero(solid.sum(1) > 20)[0]
    bands, s0, prev = [], rows[0], rows[0]
    for y in rows[1:]:
        if y > prev + 5:
            bands.append((s0, prev + 1))
            s0 = y
        prev = y
    bands.append((s0, prev + 1))
    strips = []
    for y0, y1 in bands:
        # A few rows of headroom above the highest peak, none below the flat bottom.
        strips.append(wrap_ends(rgba[max(0, y0 - 4):y1]))
    return strips


def build_clouds(spec):
    rgba = keyed(load(spec['clouds']))
    if spec.get('drop_cool'):
        rgba[..., 3] *= np.clip((rgba[..., 0] - rgba[..., 1] - 0.02) / 0.05, 0, 1)
    if spec.get('clamp_teal'):
        rgba[..., 1] = np.minimum(rgba[..., 1], (rgba[..., 0] + rgba[..., 2]) / 2 + 0.03)
    lab, n = ndimage.label(rgba[..., 3] > 0.5)
    sizes = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
    cents = ndimage.center_of_mass(np.ones(lab.shape), lab, range(1, n + 1))
    H, W = lab.shape
    cell_of = {}
    for i, (cy, cx) in enumerate(cents):
        if sizes[i] < 200:
            continue
        cell = int(cy // (H / 2)) * 3 + int(cx // (W / 3))
        cell_of.setdefault(cell, []).append(i + 1)
    atlas = np.zeros((1024, 1536, 4), np.float32)
    cards = []
    for cell in range(6):
        ids = cell_of.get(cell, [])
        if not ids:
            continue
        m = np.isin(lab, ids)
        # The soft edge around each cloud as well.
        m = ndimage.binary_dilation(m, iterations=3)
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        card = rgba[y0:y1, x0:x1].copy()
        card[..., 3] *= m[y0:y1, x0:x1]
        h, w = card.shape[:2]
        s = min(1.0, 500 / w, 500 / h)
        if s < 1:
            im = Image.fromarray((card * 255).astype(np.uint8), 'RGBA').resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
            card = np.asarray(im).astype(np.float32) / 255
            h, w = card.shape[:2]
        r, c = divmod(cell, 3)
        ox = c * 512 + (512 - w) // 2
        oy = r * 512 + (512 - h) // 2
        atlas[oy:oy + h, ox:ox + w] = card
        # Texture coordinates run up from the bottom.
        cards.append(dict(u0=ox / 1536, v0=1 - (oy + h) / 1024, u1=(ox + w) / 1536, v1=1 - oy / 1024, aspect=round(w / h, 4)))
    # Fill the colour under the empty atlas with its neighbours', for clean filtering.
    _, (iy, ix) = ndimage.distance_transform_edt(atlas[..., 3] < 0.02, return_indices=True)
    atlas[..., :3] = np.where(atlas[..., 3:] >= 0.02, atlas[..., :3], atlas[iy, ix, :3])
    return atlas, cards


# ---- surfaces ------------------------------------------------------------------

def best_len(t, axis, lo=320):
    first = np.take(t, 0, axis=axis)
    return min((np.abs(np.take(t, L, axis=axis) - first).mean(), L) for L in range(lo, t.shape[axis]))[1]


def fade(t, axis, ov=16):
    t = np.moveaxis(t, axis, 0).copy()
    n = t.shape[0]
    w = np.linspace(0, 1, ov)[:, None, None]
    t[:ov] = t[:ov] * w + t[n - ov:] * (1 - w)
    return np.moveaxis(t[:n - ov], 0, axis)


def seamless(t):
    t = t[:, :best_len(t, 1)]
    t = t[:best_len(t, 0)]
    t = fade(fade(t, 1), 0)
    im = Image.fromarray((np.clip(t, 0, 1) * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def build_surfaces(spec):
    sheet = load(spec['surfaces'])
    out = {}
    for i, name in enumerate(spec['tiles']):
        r, c = divmod(i, 3)
        out[name] = seamless(sheet[r * 512:(r + 1) * 512, c * 512:(c + 1) * 512])
    return out


# ---- the module the game imports -------------------------------------------------

def ident(s):
    return ''.join(w.capitalize() if i else w for i, w in enumerate(s.replace('-', '_').split('_')))


def main():
    names = sys.argv[1:] or list(CIRCUITS)
    for name in names:
        spec = CIRCUITS[name]
        d = os.path.join(OUT, name)
        os.makedirs(d, exist_ok=True)
        files = {}
        sky, sun = build_sky(spec)
        files['sky'] = save(sky, os.path.join(d, 'sky.webp'), 84)
        strips = build_horizon(spec)
        for i, s in enumerate(strips):
            files[f'horizon{i}'] = save(s, os.path.join(d, f'horizon{i}.webp'))
        atlas, cards = build_clouds(spec)
        files['clouds'] = save(atlas, os.path.join(d, 'clouds.webp'))
        surfaces = build_surfaces(spec)
        for k, t in surfaces.items():
            files[k] = save(t, os.path.join(d, f'{k}.webp'), 84)
        lines = [
            f'// Generated by tools/bg/build_backgrounds.py from art/bg-sheets. Do not edit by hand.',
            "import type { PaintedSet } from '../painted';",
            f"import sky from './{name}/sky.webp';",
            f"import clouds from './{name}/clouds.webp';",
        ]
        for i in range(len(strips)):
            lines.append(f"import horizon{i} from './{name}/horizon{i}.webp';")
        for k in surfaces:
            lines.append(f"import {ident(k)} from './{name}/{k}.webp';")
        strip_list = ', '.join(f'{{ url: horizon{i}, aspect: {round(s.shape[1] / s.shape[0], 4)} }}' for i, s in enumerate(strips))
        surf = ', '.join(f'{json.dumps(k)}: {ident(k)}' for k in surfaces)
        lines += [
            '',
            'const set: PaintedSet = {',
            '  sky,',
            f'  sunU: {round(sun, 4)},',
            f'  horizonV: {round(HAZE / SKY_H, 5)},',
            f'  horizon: [{strip_list}],',
            f'  clouds: {{ url: clouds, cards: {json.dumps(cards)} }},',
            f'  surfaces: {{ {surf} }},',
            '};',
            'export default set;',
            '',
        ]
        with open(os.path.join(OUT, f'{name}.ts'), 'w') as fh:
            fh.write('\n'.join(lines))
        total = sum(files.values()) // 1024
        print(f'{name}: {total} KB ' + ', '.join(f'{k} {v // 1024}' for k, v in files.items()))


if __name__ == '__main__':
    main()

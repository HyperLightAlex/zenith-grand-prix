"""Build the painted hangar kit (the anime look) from the sheets in
art/hangar-sheets: the surface textures and the signs; and the newer teams'
names from the F2 sheet in art/faction-sheets.

    python3 tools/bg/build_hangar.py

Writes src/client/render/backgrounds/hangar/*.webp and a generated module
src/client/render/backgrounds/hangar.ts that the game imports. Run it again
after replacing a sheet.

What it does to the sheets:
- Surfaces: each square found by the joins between them and cut just inside
  them, then made to repeat: cut to the length that wraps best each way (for
  the hazard stripes, a whole number of stripes across and down, so they meet
  themselves at every edge) and its seams blended. The floor is cut from one
  of its joints; the wall services strip repeats along only, keeping its
  whole height.
- Signs: each cut out of the green by everything in its own cell of the
  3x2 grid (the team names' letters are separate pieces), trimmed a pixel
  inside its edge, kept at its own shape. Mirage's and Aurora's names are cut
  the same way from the bottom row of F2's 2x2 grid.
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

from build_backgrounds import fade, best_len, keyed, save
from build_track import join_near, to_size

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SHEETS = os.path.join(ROOT, 'art', 'hangar-sheets')
OUT = os.path.join(ROOT, 'src', 'client', 'render', 'backgrounds')

SURFACES = ['floor', 'cladding', 'roof', 'grating', 'hazard', 'services']
FACTION_SHEETS = os.path.join(ROOT, 'art', 'faction-sheets')

SIGNS_H2 = ['solstice', 'vanta', 'caution', 'noSmoking', 'firePoint', 'voltage']
SIGNS_F2 = ['mirage', 'aurora']
SIGNS = SIGNS_H2 + SIGNS_F2


def sheet(name, where=SHEETS):
    return np.asarray(Image.open(os.path.join(where, name)).convert('RGB')).astype(np.float32) / 255


def joint_at(profile, reach=80):
    """Where the darkest line is near the start of a profile: a floor joint."""
    return int(np.argmin(profile[:reach]))


def build_surfaces():
    a = sheet('hangar-h1-surfaces.png')
    xs = [0, join_near(a.mean(0), 512), join_near(a.mean(0), 1024), a.shape[1]]
    ys = [0, join_near(a.mean(1), 512), a.shape[0]]
    inset = 3
    out = {}
    for i, name in enumerate(SURFACES):
        r, c = divmod(i, 3)
        t = a[ys[r] + (inset if r else 0):ys[r + 1] - (inset if r == 0 else 0), xs[c] + (inset if c else 0):xs[c + 1] - (inset if c < 2 else 0)]
        if name == 'floor':
            # Start on a joint each way, so the slab's joint is at the tile's edge.
            t = t[:, joint_at(t.mean((0, 2))):]
            t = t[joint_at(t.mean((1, 2))):]
            t = t[:, :best_len(t, 1)]
            t = t[:best_len(t, 0)]
            t = fade(fade(t, 1, 8), 0, 8)
        elif name == 'services':
            # Along the wall only: the strip keeps its whole height.
            t = fade(t[:, :best_len(t, 1, 380)], 1)
        else:
            t = t[:, :best_len(t, 1)]
            t = t[:best_len(t, 0)]
            t = fade(fade(t, 1), 0)
        out[name] = to_size(t, 512, round(512 * t.shape[0] / t.shape[1])) if name == 'services' else to_size(t)
    return out


def cut_cells(rgb, cols=3, rows=2, min_area=400):
    """Each sign on a sheet, in reading order: the pieces whose middles fall in
    its cell of the grid (a name's letters can be separate pieces, and a wide
    one can run over its cell's edge). The pieces are found on the plain cut
    (the edge refinement can leave faint lines on the green), then the
    refined cut is kept within a few pixels of them."""
    plain = keyed(rgb, refine=False)[..., 3] > 0.5
    k = keyed(rgb)
    lab, n = ndimage.label(plain)
    sizes = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
    centres = ndimage.center_of_mass(plain, lab, range(1, n + 1))
    h, w = plain.shape
    cells = [[] for _ in range(cols * rows)]
    for i, (cy, cx) in enumerate(centres):
        if sizes[i] >= min_area:
            cells[int(cy * rows // h) * cols + int(cx * cols // w)].append(i + 1)
    out = []
    for ids in cells:
        assert ids, 'an empty cell'
        mask = ndimage.binary_dilation(np.isin(lab, ids), iterations=3)
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        piece = k[y0:y1, x0:x1].copy()
        piece[..., 3] *= mask[y0:y1, x0:x1]
        out.append(piece)
    return out


def main():
    d = os.path.join(OUT, 'hangar')
    os.makedirs(d, exist_ok=True)
    files = {}
    surfaces = build_surfaces()
    for name, t in surfaces.items():
        files[name] = save(t, os.path.join(d, f'{name}.webp'), 84)
    # F2's top row is the emblems (build_hud.py); its bottom row, the names.
    signs = cut_cells(sheet('hangar-h2-signs.png')) + cut_cells(sheet('faction-f2-emblems.png', FACTION_SHEETS), 2, 2)[2:]
    aspect = {}
    for name, s in zip(SIGNS, signs):
        files[name] = save(s, os.path.join(d, f'sign-{name}.webp'), 90)
        aspect[name] = round(s.shape[1] / s.shape[0], 4)
    lines = [
        '// Generated by tools/bg/build_hangar.py from art/hangar-sheets. Do not edit by hand.',
        "import type { PaintedHangar } from '../painted';",
    ]
    for name in surfaces:
        lines.append(f"import {name} from './hangar/{name}.webp';")
    for name in SIGNS:
        lines.append(f"import {name}Sign from './hangar/sign-{name}.webp';")
    lines += [
        '',
        'const kit: PaintedHangar = {',
        f"  surfaces: {{ {', '.join(surfaces)} }},",
        f"  servicesAspect: {round(surfaces['services'].shape[1] / surfaces['services'].shape[0], 4)},",
        f"  signs: {{ {', '.join(f'{n}: {{ url: {n}Sign, aspect: {aspect[n]} }}' for n in SIGNS)} }},",
        '};',
        'export default kit;',
        '',
    ]
    with open(os.path.join(OUT, 'hangar.ts'), 'w') as fh:
        fh.write('\n'.join(lines))
    total = sum(files.values()) // 1024
    print(f'hangar: {total} KB ' + ', '.join(f'{k} {v // 1024}' for k, v in files.items()))
    print('aspects', json.dumps(aspect))


if __name__ == '__main__':
    main()

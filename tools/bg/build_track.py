"""Build the painted track kit (the anime look) from the sheets in
art/track-sheets: the surface textures, the sponsor boards, the circuits'
boards and the start banner.

    python3 tools/bg/build_track.py

Writes src/client/render/backgrounds/track/*.webp and a generated module
src/client/render/backgrounds/track.ts that the game imports. Run it again
after replacing a sheet.

What it does to the sheets:
- Surfaces: each square found by the joins between them (the sheet's grid
  can sit a pixel or two off the 512 lines) and cut just inside them, then
  made to repeat: cut to the length that wraps best and its seams blended,
  both ways or, for the barrier armour (whose face takes the whole height),
  along only; the crowd is cut on whole rows of seats.
- Boards and the banner: each cut out of the green by its outline (they are
  plain rectangles), trimmed a pixel inside its edge, kept at its own shape.
- T4, Neon Crucible's: its board (in with the others) and the neon sign over
  the way into its pit. T5, Frostline's: its board and the sign over the Ice
  Barrel's mouth.
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

from build_backgrounds import best_len, cut_boards, fade, load, save

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SHEETS = os.path.join(ROOT, 'art', 'track-sheets')
OUT = os.path.join(ROOT, 'src', 'client', 'render', 'backgrounds')

SURFACES = ['road', 'armour', 'steel', 'concrete', 'gantry', 'crowd']
BOARDS = ['kestrel', 'nova', 'aoki', 'halcyon', 'zgpLive', 'zenith']
CIRCUITS = ['meridian', 'canyon', 'helios']


def sheet(name):
    rgb = np.asarray(Image.open(os.path.join(SHEETS, name)).convert('RGB')).astype(np.float32) / 255
    return rgb


def join_near(profile, at, reach=8):
    """The strongest step in a row or column profile within `reach` of `at`."""
    step = np.abs(np.diff(profile, axis=0)).sum(1)
    lo = at - reach
    return lo + int(np.argmax(step[lo:at + reach])) + 1


def to_size(t, w=512, h=512):
    im = Image.fromarray((np.clip(t, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def row_period(t, lo=40, hi=200):
    """The spacing of the crowd's rows of seats, from how the rows' brightness repeats."""
    p = t.mean((1, 2))
    p = p - p.mean()
    ac = np.array([(p[:-k] * p[k:]).mean() for k in range(lo, hi)])
    return lo + int(np.argmax(ac))


def build_surfaces():
    a = sheet('track-t1-surfaces.png')
    xs = [0, join_near(a.mean(0), 512), join_near(a.mean(0), 1024), a.shape[1]]
    ys = [0, join_near(a.mean(1), 512), a.shape[0]]
    inset = 3
    out = {}
    for i, name in enumerate(SURFACES):
        r, c = divmod(i, 3)
        t = a[ys[r] + (inset if r else 0):ys[r + 1] - (inset if r == 0 else 0), xs[c] + (inset if c else 0):xs[c + 1] - (inset if c < 2 else 0)]
        if name == 'armour':
            # Along the barrier only: the face takes the whole height.
            t = fade(t[:, :best_len(t, 1, 440)], 1)
        elif name == 'crowd':
            per = row_period(t)
            rows = t.shape[0] // per
            # Start the cut on the same place in a row as it ends.
            t = t[:rows * per]
            # As much of the crowd as will repeat, for variety.
            t = fade(t[:, :best_len(t, 1, 440)], 1)
        else:
            t = t[:, :best_len(t, 1)]
            t = t[:best_len(t, 0)]
            t = fade(fade(t, 1), 0)
        # The crowd keeps its shape (whole rows seldom make a square); the rest are squares.
        out[name] = to_size(t, 512, round(512 * t.shape[0] / t.shape[1])) if name == 'crowd' else to_size(t)
    return out


def cut_out(rgb, min_size=5000):
    """Each board on a sheet, cut by its outline, in reading order (rows, then left to right)."""
    return cut_boards(rgb, min_size)


def main():
    d = os.path.join(OUT, 'track')
    os.makedirs(d, exist_ok=True)
    files = {}
    surfaces = build_surfaces()
    for name, t in surfaces.items():
        files[name] = save(t, os.path.join(d, f'{name}.webp'), 84)
    boards = cut_out(sheet('track-t2-boards.png'))
    assert len(boards) == len(BOARDS), f'{len(boards)} boards on T2'
    circuit = cut_out(sheet('track-t3-circuits.png'))
    assert len(circuit) == len(CIRCUITS) + 1, f'{len(circuit)} boards on T3'
    crucible = cut_out(sheet('track-t4-crucible.png'))
    assert len(crucible) == 2, f'{len(crucible)} boards on T4'
    frostline = cut_out(sheet('track-t5-frostline.png'))
    assert len(frostline) == 2, f'{len(frostline)} boards on T5'
    titan = cut_out(sheet('track-t6-titan.png'))
    assert len(titan) == 2, f'{len(titan)} boards on T6'
    # (Zenith Ring's board and sign: 'zenith' is the Zenith Grand Prix's board on T2.)
    zenith = cut_out(sheet('track-t7-zenith.png'))
    assert len(zenith) == 2, f'{len(zenith)} boards on T7'
    signs = list(zip(BOARDS, boards)) + list(zip(CIRCUITS, circuit[:3])) + [('crucible', crucible[0]), ('frostline', frostline[0]), ('titan', titan[0]), ('zenithRing', zenith[0]), ('banner', circuit[3]), ('crucibleSign', crucible[1]), ('frostlineSign', frostline[1]), ('titanSign', titan[1]), ('zenithRingSign', zenith[1])]
    aspect = {}
    for name, b in signs:
        files[name] = save(b, os.path.join(d, f'board-{name}.webp'), 90)
        aspect[name] = round(b.shape[1] / b.shape[0], 4)
    lines = [
        '// Generated by tools/bg/build_track.py from art/track-sheets. Do not edit by hand.',
        "import type { PaintedTrack } from '../painted';",
    ]
    for name in surfaces:
        lines.append(f"import {name} from './track/{name}.webp';")
    for name, _ in signs:
        lines.append(f"import {name}Board from './track/board-{name}.webp';")
    sign = lambda n: f'{{ url: {n}Board, aspect: {aspect[n]} }}'
    lines += [
        '',
        'const kit: PaintedTrack = {',
        f"  surfaces: {{ {', '.join(surfaces)} }},",
        f"  crowdAspect: {round(surfaces['crowd'].shape[1] / surfaces['crowd'].shape[0], 4)},",
        f"  boards: [{', '.join(sign(n) for n in BOARDS)}],",
        f"  circuits: {{ {', '.join(f'{n}: {sign(n)}' for n in CIRCUITS + ['crucible', 'frostline', 'titan'])}, zenith: {sign('zenithRing')} }},",
        f"  banner: {sign('banner')},",
        f"  circuitSigns: {{ crucible: {sign('crucibleSign')}, frostline: {sign('frostlineSign')}, titan: {sign('titanSign')}, zenith: {sign('zenithRingSign')} }},",
        '};',
        'export default kit;',
        '',
    ]
    with open(os.path.join(OUT, 'track.ts'), 'w') as fh:
        fh.write('\n'.join(lines))
    total = sum(files.values()) // 1024
    print(f'track: {total} KB ' + ', '.join(f'{k} {v // 1024}' for k, v in files.items()))
    print('aspects', json.dumps(aspect))


if __name__ == '__main__':
    main()

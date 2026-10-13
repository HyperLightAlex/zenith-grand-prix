"""Build the game's drawn-effect atlases from the sheets in art/fx-sheets.

Each atlas is a grid: one row per variation, one column per drawing, every
cell the same size. The game picks a row at random and plays its columns
on the look's drawing clock (src/client/render/sprites.ts).

    python3 tools/fx/build_sprites.py

Writes src/client/render/sprites/fx-*.png. Run it again after replacing a
sheet. The sheets are painted in cyan; the game recolours them per team,
weapon and moment, keeping the white cores white.
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from ingest import cut  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SHEETS = os.path.join(ROOT, 'art', 'fx-sheets')
OUT = os.path.join(ROOT, 'src', 'client', 'render', 'sprites')

# name: sheet, cell size and the rows of panels to use (each a list of panel
# indices, 0-5 reading across then down), plus how to cut it:
#   centre   move each drawing's middle to the middle of its cell (radial effects)
#   offsets  how far to move each row's window down the sheet, in sheet pixels
#   bands    each row's own stretch of the sheet, so a moved window misses the other
#   wall     line up every drawing's flat left edge (the barrier) at this x in the cell
#   colors   palette size (flat cels survive a small one, which keeps the file small)
ATLASES = {
    'fx-spark': dict(sheet='fx-01-hit-spark.png', size=192, centre=True, rows=[[0, 1, 2], [3, 4, 5]]),
    'fx-impact': dict(sheet='fx-02-heavy-impact.png', size=256, centre=True, rows=[[0, 1, 2, 3, 4, 5]]),
    'fx-parry': dict(sheet='fx-03-parry-glint.png', size=256, centre=True, rows=[[0, 1, 2], [3, 4, 5]]),
    'fx-cut-light': dict(sheet='fx-04b-light-cut.png', size=256, rows=[[0, 1, 2], [3, 4, 5]]),
    'fx-cut-heavy': dict(sheet='fx-04-blade-arcs.png', size=256, rows=[[3, 4, 5]]),
    'fx-lance': dict(sheet='fx-05-lance-thrust.png', size=256, rows=[[0, 1, 2], [3, 4, 5]]),
    'fx-ring': dict(sheet='fx-06-shock-rings.png', size=256, centre=True, rows=[[3, 4, 5]]),
    'fx-ground-ring': dict(sheet='fx-06b-ground-ring.png', size=256, centre=True, rows=[[0, 1, 2], [3, 4, 5]]),
    # The flames hang from a nozzle at the top of each cell; the overdrive row
    # was painted starting above its panel, so both windows move to the nozzles.
    'fx-flame': dict(sheet='fx-07-thruster-flame.png', size=256, rows=[[0, 1, 2], [3, 4, 5]], offsets=(59, -42), bands=((0, 468), (468, 1024))),
    # Painted grey; the game shades it to the dust or smoke it wants.
    'fx-smoke': dict(sheet='fx-08-smoke-puffs.png', size=256, centre=True, rows=[[0, 1, 2], [3, 4, 5]]),
    # The burst against the barrier: its flat side wanders a little between drawings.
    'fx-wall': dict(sheet='fx-09b-barrier-strike.png', size=256, rows=[[0, 1, 2, 3, 4, 5]], wall=32),
    # Loops: four bolts bracketing a mech, and a ring.
    'fx-crackle': dict(sheet='fx-10-energy-crackle.png', size=256, centre=True, rows=[[0, 1, 2], [3, 4, 5]]),
    # One animation of six; the bottom row was painted 12 px high.
    'fx-sparkle': dict(sheet='fx-11-pickup-sparkle.png', size=256, rows=[[0, 1, 2, 3, 4, 5]], offsets=(0, -12)),
    # The knockout, in its own colours.
    'fx-explosion': dict(sheet='fx-12-knockout-explosion.png', size=384, rows=[[0, 1, 2, 3, 4, 5]], colors=128),
}


def wall_left(img, x):
    """Move a drawing sideways so its first solid column sits at `x`."""
    a = np.asarray(img)[..., 3] > 128
    cols = np.nonzero(a.sum(0) > 8)[0]
    if not len(cols):
        return img
    out = Image.new('RGBA', img.size)
    out.paste(img, (x - int(cols[0]), 0))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, spec in ATLASES.items():
        size, rows = spec['size'], spec['rows']
        panels = cut(os.path.join(SHEETS, spec['sheet']), size, spec.get('centre', False), spec.get('offsets', (0, 0)), spec.get('bands'))
        if 'wall' in spec:
            panels = [wall_left(p, spec['wall']) for p in panels]
        cols = max(len(r) for r in rows)
        atlas = Image.new('RGBA', (cols * size, len(rows) * size))
        for ri, row in enumerate(rows):
            for ci, idx in enumerate(row):
                atlas.paste(panels[idx], (ci * size, ri * size))
        # Flat cel colours survive a small palette, which keeps the file small.
        small = atlas.quantize(colors=spec.get('colors', 96), method=Image.Quantize.FASTOCTREE)
        path = os.path.join(OUT, f'{name}.png')
        small.save(path, optimize=True)
        print(f'{name}: {cols}x{len(rows)} cells of {size}, {os.path.getsize(path) // 1024} KB')


if __name__ == '__main__':
    main()

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

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from ingest import cut  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SHEETS = os.path.join(ROOT, 'art', 'fx-sheets')
OUT = os.path.join(ROOT, 'src', 'client', 'render', 'sprites')

# name: (sheet, cell size, centre, rows of panels to use (each a list of panel
# indices)[, how far to move each row's window, each row's own stretch of the sheet])
ATLASES = {
    'fx-spark': ('fx-01-hit-spark.png', 192, True, [[0, 1, 2], [3, 4, 5]]),
    'fx-impact': ('fx-02-heavy-impact.png', 256, True, [[0, 1, 2, 3, 4, 5]]),
    'fx-parry': ('fx-03-parry-glint.png', 256, True, [[0, 1, 2], [3, 4, 5]]),
    'fx-cut-light': ('fx-04b-light-cut.png', 256, False, [[0, 1, 2], [3, 4, 5]]),
    'fx-cut-heavy': ('fx-04-blade-arcs.png', 256, False, [[3, 4, 5]]),
    'fx-lance': ('fx-05-lance-thrust.png', 256, False, [[0, 1, 2], [3, 4, 5]]),
    'fx-ring': ('fx-06-shock-rings.png', 256, True, [[3, 4, 5]]),
    'fx-ground-ring': ('fx-06b-ground-ring.png', 256, True, [[0, 1, 2], [3, 4, 5]]),
    # The flames hang from a nozzle at the top of each cell; the overdrive row
    # was painted starting above its panel, so both windows move to the nozzles.
    'fx-flame': ('fx-07-thruster-flame.png', 256, False, [[0, 1, 2], [3, 4, 5]], (59, -42), ((0, 468), (468, 1024))),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, spec in ATLASES.items():
        sheet, size, centre, rows = spec[:4]
        offsets = spec[4] if len(spec) > 4 else (0, 0)
        bands = spec[5] if len(spec) > 5 else None
        panels = cut(os.path.join(SHEETS, sheet), size, centre, offsets, bands)
        cols = max(len(r) for r in rows)
        atlas = Image.new('RGBA', (cols * size, len(rows) * size))
        for ri, row in enumerate(rows):
            for ci, idx in enumerate(row):
                atlas.paste(panels[idx], (ci * size, ri * size))
        # Flat cel colours survive a small palette, which keeps the file small.
        small = atlas.quantize(colors=96, method=Image.Quantize.FASTOCTREE)
        path = os.path.join(OUT, f'{name}.png')
        small.save(path, optimize=True)
        print(f'{name}: {cols}x{len(rows)} cells of {size}, {os.path.getsize(path) // 1024} KB')


if __name__ == '__main__':
    main()

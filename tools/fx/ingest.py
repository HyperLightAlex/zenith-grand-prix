"""Turn a generated effect sheet into game sprites.

The sheets are painted (by an image model, from the prompt in docs/ART.md) as
a 3 x 2 grid of square panels on flat magenta. This keys out the magenta
(taking the magenta back out of the edge pixels, so nothing comes out with a
pink fringe), cuts the panels, and writes each animation as a horizontal
strip: one row of the sheet per strip, or all six panels as one strip.

    python3 tools/fx/ingest.py <sheet.png> <outdir> [rows|all] [size] [centre]

`rows` (the default) makes two strips of three drawings; `all` makes one
strip of six. `size` is the size of each drawing in the strip (default 256).
`centre` moves each drawing so the middle of its bounding box sits on the
middle of the frame: for radial effects (bursts, rings, glints), which the
model does not always place exactly. Leave it off for directional ones.
It also writes a preview of each strip over a sky and a road colour, and a
looping GIF, to check the cut before it goes in the game.

tools/fx/build_sprites.py uses cut() to make the game's atlases.
"""
import os
import sys

import numpy as np
from PIL import Image


def cut(src, size=256, centre=False):
    """The six panels of a sheet, keyed and cut, as RGBA images `size` square."""
    rgb = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
    H, W, _ = rgb.shape
    # The background colour, from the four corners.
    k = 24
    corners = np.concatenate([rgb[:k, :k], rgb[:k, -k:], rgb[-k:, :k], rgb[-k:, -k:]]).reshape(-1, 3)
    bg = np.median(corners, 0)
    # Alpha from how far a pixel is from the background, softly over a narrow band.
    dist = np.linalg.norm(rgb - bg, axis=-1)
    a = np.clip((dist - 0.12) / (0.45 - 0.12), 0, 1)
    # Unmix: an edge pixel is this colour laid over magenta at that alpha.
    col = np.where(a[..., None] > 0.01, (rgb - (1 - a[..., None]) * bg) / np.maximum(a[..., None], 0.01), 0)
    col = np.clip(col, 0, 1)
    rgba = np.concatenate([col, a[..., None]], -1)

    cols, rows = 3, 2
    pw, ph = W / cols, H / rows
    out = []
    for r in range(rows):
        for c in range(cols):
            x0, y0 = int(round(c * pw)), int(round(r * ph))
            x1, y1 = int(round((c + 1) * pw)), int(round((r + 1) * ph))
            p = rgba[y0:y1, x0:x1]
            # Square, centred on the panel's centre.
            s = min(p.shape[0], p.shape[1])
            oy, ox = (p.shape[0] - s) // 2, (p.shape[1] - s) // 2
            p = p[oy:oy + s, ox:ox + s]
            if centre:
                ys, xs = np.nonzero(p[..., 3] > 0.5)
                if len(xs):
                    dy = int(round(s / 2 - (ys.min() + ys.max()) / 2))
                    dx = int(round(s / 2 - (xs.min() + xs.max()) / 2))
                    p = np.roll(np.roll(p, dy, 0), dx, 1)
            out.append(to_img(p, size))
    return out


def to_img(p, size):
    # Premultiply before resizing so edges stay clean, then undo.
    pm = p.copy()
    pm[..., :3] *= pm[..., 3:4]
    im = Image.fromarray((pm * 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32) / 255
    al = arr[..., 3:4]
    arr[..., :3] = np.where(al > 0, arr[..., :3] / np.maximum(al, 1e-4), 0)
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGBA')


def main():
    src, out = sys.argv[1], sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else 'rows'
    size = int(sys.argv[4]) if len(sys.argv) > 4 else 256
    centre = len(sys.argv) > 5 and sys.argv[5] == 'centre'
    name = os.path.splitext(os.path.basename(src))[0]
    os.makedirs(out, exist_ok=True)
    panels = cut(src, size, centre)
    groups = [panels[:3], panels[3:]] if mode == 'rows' else [panels]
    for gi, frames in enumerate(groups):
        tag = f'{name}-{"ab"[gi]}' if mode == 'rows' else name
        strip = Image.new('RGBA', (size * len(frames), size))
        for i, f in enumerate(frames):
            strip.paste(f, (i * size, 0))
        strip.save(os.path.join(out, f'{tag}.png'))
        # Preview: over a sky colour and a road colour.
        prev = Image.new('RGBA', (strip.width, size * 2), (126, 160, 214, 255))
        prev.paste(Image.new('RGBA', (strip.width, size), (120, 118, 132, 255)), (0, size))
        prev.alpha_composite(strip, (0, 0))
        prev.alpha_composite(strip, (0, size))
        prev.convert('RGB').save(os.path.join(out, f'{tag}-preview.png'))
        gif = []
        for f in frames + [Image.new('RGBA', (size, size))] * 2:
            b = Image.new('RGBA', (size, size), (126, 160, 214, 255))
            b.alpha_composite(f)
            gif.append(b.convert('P', palette=Image.ADAPTIVE, colors=64))
        gif[0].save(os.path.join(out, f'{tag}.gif'), save_all=True, append_images=gif[1:], duration=83, loop=0, disposal=2)
        print('wrote', tag)


if __name__ == '__main__':
    main()

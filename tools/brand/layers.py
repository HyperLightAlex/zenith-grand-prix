"""Cuts the studio card's three layers out of the studio logo and writes them
into index.html.

The logo (art/brand/infinite-maybe-games.png) is white on black. The card
(#ident in index.html) animates it in three parts that sit over each other:
the infinity-into-question-mark, the question mark's dot, and the name under
them. Each layer is the same 1100x861 frame cut round the logo (so they
line up with no offsets), white, with the alpha taken from the brightness, kept
as lossless WebP and written into the page itself as a data: URL: the card
then needs nothing fetched and plays as soon as the page is in, in every
build (the one-file build has nothing beside it).

    python3 tools/brand/layers.py            # rewrite the layers in index.html
    python3 tools/brand/layers.py --files    # and keep the .webp files in art/brand/
"""

import base64
import io
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art/brand/infinite-maybe-games.png'
PAGE = ROOT / 'index.html'

# The frame round the logo in the original (x0, y0, x1, y1), and where the
# layers part in it (rows of the frame): the mark ends at 469, the dot is
# 486-587, the name starts at 620.
FRAME = (82, 221, 1182, 1082)
CUTS = {'mark': (0, 478), 'dot': (478, 604), 'words': (604, 861)}
# Brightness to alpha: the black ground clear, the white solid, the edges between.
LO, HI = 14, 250


def layers():
    img = Image.open(SRC).convert('L').crop(FRAME)
    lum = np.asarray(img, dtype=np.float32)
    alpha = np.clip((lum - LO) / (HI - LO), 0, 1)
    out = {}
    for name, (r0, r1) in CUTS.items():
        a = np.zeros_like(alpha)
        a[r0:r1] = alpha[r0:r1]
        rgba = np.empty(alpha.shape + (4,), dtype=np.uint8)
        rgba[..., :3] = 255
        rgba[..., 3] = np.round(a * 255).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(rgba, 'RGBA').save(buf, 'WEBP', lossless=True, quality=100, method=6, exact=False)
        out[name] = buf.getvalue()
    return out


def main():
    data = layers()
    page = PAGE.read_text()
    for name, webp in data.items():
        url = 'data:image/webp;base64,' + base64.b64encode(webp).decode()
        page, n = re.subn(r'(<img class="%s" src=")[^"]*(")' % name, lambda m: m.group(1) + url + m.group(2), page)
        if n != 1:
            sys.exit('index.html: expected one <img class="%s">, found %d' % (name, n))
        if '--files' in sys.argv:
            (ROOT / 'art/brand' / ('infinite-maybe-%s.webp' % name)).write_bytes(webp)
        print('%-5s %6d bytes' % (name, len(webp)))
    PAGE.write_text(page)


if __name__ == '__main__':
    main()

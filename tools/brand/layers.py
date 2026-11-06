"""Builds the studio card (#ident in index.html) from the studio logo and
writes it into the page.

The logo (art/brand/infinite-maybe-games.png) is white on black. The card
draws it as if by hand: the infinity is drawn along its own line, from the
middle round the left loop, back through the middle and round into the
question mark's hook, and the dot then drips from the end of the hook. This
works out what that needs:

- the pen's path: the line's centre, from the logo's skeleton, smoothed;
- the ink, in two layers: every pixel of the line belongs to the nearest
  point of the path, the first stretch of the path in one layer and the rest
  in the other, so the pen starting by the middle does not show the line
  that crosses there before it gets back to it (each layer is revealed only
  by its own stretch of the path: in index.html a wide round-capped stroke
  along it, its dash growing, cuts the layer out);
- the outline of the hook's end and where the dot sits, for the drip (drawn
  in the page as a drop of liquid that swells out of the hook's end, hangs,
  pinches off and lands as the dot);
- the dot and the name, as they are.

Every picture is the same 1100x861 frame cut round the logo (so they line up
with no offsets), white, with the alpha taken from the brightness, kept as
lossless WebP and written into the page itself as a data: URL, so the card
needs nothing fetched and plays as soon as the page is in, in every build
(the one-file build has nothing beside it).

    python3 tools/brand/layers.py            # rewrite the card in index.html
    python3 tools/brand/layers.py --preview DIR  # and save the layers and a map of the pen's order in DIR
"""

import base64
import io
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from skimage.measure import find_contours
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'art/brand/infinite-maybe-games.png'
PAGE = ROOT / 'index.html'

# The frame round the logo in the original (x0, y0, x1, y1), and where the
# parts sit in it (rows of the frame): the mark ends at 469, the dot is
# 486-587, the name starts at 620.
FRAME = (82, 221, 1182, 1082)
CUTS = {'mark': (0, 478), 'dot': (478, 604), 'words': (604, 861)}
# Brightness to alpha: the black ground clear, the white solid, the edges between.
LO, HI = 14, 250
# The pen starts this far up the arm that comes in from the left loop's top
# (from the point where the three arms meet), and the crossing is bridged
# from this far out on the two arms of the diagonal through it.
START_OUT, BRIDGE_OUT = 30, 55
# The first layer: the line owned by the path up to here (well round the
# left loop's top, clear of the middle).
SPLIT = 150
# How far the ownership of each layer is grown into the other (pixels), so
# the two together leave no seam where they meet.
OVERLAP = 2


def alpha_frame():
    lum = np.asarray(Image.open(SRC).convert('L').crop(FRAME), dtype=np.float64)
    return np.clip((lum - LO) / (HI - LO), 0, 1)


def part(alpha, name):
    r0, r1 = CUTS[name]
    a = np.zeros_like(alpha)
    a[r0:r1] = alpha[r0:r1]
    return a


def webp(a):
    rgba = np.empty(a.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = np.round(a * 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgba, 'RGBA').save(buf, 'WEBP', lossless=True, quality=100, method=6, exact=False)
    return buf.getvalue()


def data_url(b):
    return 'data:image/webp;base64,' + base64.b64encode(b).decode()


def resample(p, step):
    seg = np.hypot(*np.diff(p, axis=0).T)
    s = np.r_[0, np.cumsum(seg)]
    ss = np.r_[np.arange(0, s[-1], step), s[-1]]
    return np.c_[np.interp(ss, s, p[:, 0]), np.interp(ss, s, p[:, 1])]


def arc(p):
    return np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]


def pen_path(mark):
    """The line's centre in drawing order, as (x, y) points one pixel apart."""
    sk = skeletonize(mark > 0.5)
    pts = set(map(tuple, np.argwhere(sk)))

    def nbrs(p):
        y, x = p
        return [(y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (y + dy, x + dx) in pts]

    junction = {p for p in pts if len(nbrs(p)) >= 3}
    if not junction:
        sys.exit('the skeleton has no crossing: is this still the infinity?')
    J = np.mean(sorted(junction), 0)[::-1]

    def trace(start):
        path, seen, cur = [start], set(junction) | {start}, start
        while True:
            nx = sorted((q for q in nbrs(cur) if q not in seen), key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
            if not nx:
                return np.array(path, float)[:, ::-1], any(q in junction for q in nbrs(cur)) and len(path) > 5
            cur = nx[0]
            seen.add(cur)
            path.append(cur)

    branches, used = [], set()
    for s0 in sorted({q for j in junction for q in nbrs(j) if q not in junction}):
        if s0 in used:
            continue
        br, closed = trace(s0)
        used.update(map(tuple, br[:, ::-1].astype(int)))
        branches.append((br, closed))
    loops = [b for b, c in branches if c]
    tails = [b for b, c in branches if not c]
    if len(loops) != 1 or len(tails) != 1:
        sys.exit('expected one loop and one tail off the crossing, found %d and %d' % (len(loops), len(tails)))
    loop, tail = loops[0], tails[0]

    def out(br, r):
        return br[np.argmax(np.hypot(*(br - J).T) > r)]

    # Round the loop from the arm that comes in from its top (the higher one).
    if out(loop, 60)[1] > out(loop[::-1], 60)[1]:
        loop = loop[::-1]
    d = np.hypot(*(loop - J).T)
    loop = loop[np.argmax(d > START_OUT): len(loop) - np.argmax(d[::-1] > BRIDGE_OUT)]
    tail = tail[np.argmax(np.hypot(*(tail - J).T) > BRIDGE_OUT):]

    # Across the crossing: a smooth curve from the loop's last arm into the tail's first.
    def unit(v):
        return v / np.hypot(*v)

    p0, p1 = loop[-1], tail[0]
    t0, t1 = unit(loop[-1] - loop[-15]), unit(tail[15] - tail[0])
    k = np.hypot(*(p1 - p0))
    u = np.linspace(0, 1, 40)[1:-1, None]
    bridge = (2 * u**3 - 3 * u**2 + 1) * p0 + (u**3 - 2 * u**2 + u) * k * t0 + (-2 * u**3 + 3 * u**2) * p1 + (u**3 - u**2) * k * t1
    p = resample(np.vstack([loop, bridge, tail]), 1.0)
    # Smoothed (the skeleton is pixel-stepped), the ends held where they are.
    n = 25
    q = np.vstack([2 * p[0] - p[n:0:-1], p, 2 * p[-1] - p[-2:-n - 2:-1]])
    q = np.c_[ndi.gaussian_filter1d(q[:, 0], 7), ndi.gaussian_filter1d(q[:, 1], 7)][n:-n]
    return resample(q, 1.0)


def simplify(p, tol):
    """Ramer-Douglas-Peucker."""
    keep = np.zeros(len(p), bool)
    keep[[0, -1]] = True
    stack = [(0, len(p) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = p[i], p[j]
        ab = b - a
        n = np.hypot(*ab) or 1.0
        seg = p[i + 1:j]
        dist = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / n
        k = int(np.argmax(dist))
        if dist[k] > tol:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return p[keep]


def svg_d(p):
    return 'M' + ' '.join('%.1f,%.1f' % (x, y) for x, y in p)


def build():
    alpha = alpha_frame()
    mark = part(alpha, 'mark')
    path = simplify(pen_path(mark), 0.25)
    s = arc(path)
    dense = resample(path, 0.5)
    ds = arc(dense)

    # Who owns each pixel of the line: the nearest point of the path.
    ys, xs = np.nonzero(mark > 0)
    dist, idx = cKDTree(dense).query(np.c_[xs, ys])
    owner = np.full(mark.shape, np.inf)
    owner[ys, xs] = ds[idx]
    reach = float(dist[mark[ys, xs] > 0.02].max())
    first = ndi.binary_dilation(owner < SPLIT, iterations=OVERLAP)
    rest = ndi.binary_dilation((owner >= SPLIT) & np.isfinite(owner), iterations=OVERLAP)

    # The pen: a stroke wide enough to cover the line anywhere (its round cap
    # is the pen's leading edge), in two stretches that keep step: the second
    # starts half a stroke before the split, so the edge runs on across it.
    width = 2 * (np.ceil(reach) + 3)
    from2 = SPLIT - width / 2
    pen1 = path[: np.searchsorted(s, SPLIT) + 1]
    pen2 = path[np.searchsorted(s, from2) - 1:]
    from2 = s[np.searchsorted(s, from2) - 1]

    # The drip: the hook's end (where the path stops, and how wide the line is
    # there) and the dot (its centre and radius from its area).
    dot = part(alpha, 'dot')
    area = dot.sum()
    gy, gx = np.mgrid[: dot.shape[0], : dot.shape[1]]
    dot_c = ((dot * gx).sum() / area, (dot * gy).sum() / area)
    dot_r = float(np.sqrt(area / np.pi))
    # The hook's end: its outline round the end (the line's edge at half
    # alpha, from a little above where the pen stops, closed across the top
    # inside the line), and the bottom of it.
    tip = path[-1]
    top = int(tip[1] - 45)
    window = mark[top:CUTS['mark'][1], int(tip[0] - 90): int(tip[0] + 90)]
    edges = [e for e in find_contours(np.pad(window, ((0, 1), (1, 1))), 0.5)]
    edge = max(edges, key=len)
    edge = edge[:, ::-1] + [tip[0] - 90 - 1, top]
    if np.hypot(*(edge[0] - edge[-1])) < 1:
        sys.exit('the outline of the hook end closed on itself: widen the window?')
    tail = simplify(edge, 0.3)
    bottom = float(tail[:, 1].max())

    return {
        'alpha': alpha,
        'ink1': mark * first,
        'ink2': mark * rest,
        'dot': dot,
        'words': part(alpha, 'words'),
        'pen1': svg_d(pen1),
        'pen2': svg_d(pen2),
        'from2': from2,
        'length': s[-1],
        'width': width,
        'drip': (dot_c[0], dot_c[1], dot_r, bottom),
        'tail': ' '.join('%.1f,%.1f' % (x, y) for x, y in tail),
        'owner': owner,
        'path': path,
    }


def sub(page, pattern, value, what):
    page, n = re.subn(pattern, lambda m: m.group(1) + value + m.group(2), page)
    if n != 1:
        sys.exit('index.html: expected one %s, found %d' % (what, n))
    return page


def main():
    c = build()
    page = PAGE.read_text()
    sizes = {}
    for name in ('ink1', 'ink2', 'dot', 'words'):
        b = webp(c[name])
        sizes[name] = len(b)
        page = sub(page, r'(<img class="%s" src=")[^"]*(")' % name, data_url(b), name)
    attrs = {
        'data-length': '%.1f' % c['length'],
        'data-width': '%d' % c['width'],
        'data-from2': '%.1f' % c['from2'],
        'data-pen1': c['pen1'],
        'data-pen2': c['pen2'],
        'data-drip': ' '.join('%.1f' % v for v in c['drip']),
        'data-tail': c['tail'],
    }
    for name, value in attrs.items():
        page = sub(page, r'(\s%s=")[^"]*(")' % name, value, name)
    PAGE.write_text(page)
    for k, v in sizes.items():
        print('%-5s %6d bytes' % (k, v))
    print('pen: %.0f long, %d wide, second stretch from %.1f; dot and hook bottom %s; hook end outline %d points' % (c['length'], c['width'], c['from2'], ' '.join('%.1f' % v for v in c['drip']), len(c['tail'].split())))

    if '--preview' in sys.argv:
        out = Path(sys.argv[sys.argv.index('--preview') + 1])
        out.mkdir(parents=True, exist_ok=True)
        own = c['owner']
        t = np.where(np.isfinite(own), own / c['length'], 0)
        rgb = np.stack([np.clip(1.5 - abs(4 * t - 3), 0, 1), np.clip(1.5 - abs(4 * t - 2), 0, 1), np.clip(1.5 - abs(4 * t - 1), 0, 1)], -1)
        img = (rgb * c['ink1'][..., None] * [1, 1, 1] + rgb * c['ink2'][..., None] * 0.6) * 255
        for x, y in resample(c['path'], 3).astype(int):
            img[y, x] = 255
        Image.fromarray(np.clip(img[:480], 0, 255).astype(np.uint8)).save(out / 'pen-order.png')
        for name in ('ink1', 'ink2'):
            Image.fromarray((c[name] * 255).astype(np.uint8)).save(out / ('%s.png' % name))


if __name__ == '__main__':
    main()

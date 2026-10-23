# Draws tools/titan/fit.ts's JSON: the road of Titan's Rest over the titan, in
# plan (from above, north up) and from the south side.
#   python3 tools/titan/plot_fit.py titan-fit.json titan-fit.png
import json
import sys

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

COL = {'armour': '#e6e0d2', 'red': '#b84a3a', 'slate': '#6e7486', 'gold': '#c9a04a', 'frame': '#8a6a3a', 'visor': '#2a2e38', 'blade': '#3a3f4a'}


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def turn(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and turn(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and turn(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def main(src, out):
    data = json.load(open(src))
    road = data['road']
    fig, (top, side) = plt.subplots(2, 1, figsize=(18, 22), gridspec_kw={'height_ratios': [3, 1.3]})
    for ax in (top, side):
        ax.set_facecolor('#efe6d0')
        ax.set_aspect('equal')
        ax.grid(True, color='#d8ccb0', lw=0.5)
    # Plan: x east to the right, z south down (north up).
    order = sorted(data['shapes'], key=lambda s: max(p[1] for p in s['pts']))
    for s in order:
        h = hull([(p[0], p[2]) for p in s['pts']])
        top.add_patch(Polygon(h, closed=True, fc=COL.get(s['mat'], '#ccc'), ec='#555', lw=0.6, alpha=0.9))
    for i in range(len(road) - 1):
        a, b = road[i], road[i + 1]
        col = '#3a4a66' if a[7] else '#d03030'
        quad = [(a[0] - a[4] * a[3], a[2] - a[5] * a[3]), (a[0] + a[4] * a[3], a[2] + a[5] * a[3]), (b[0] + b[4] * b[3], b[2] + b[5] * b[3]), (b[0] - b[4] * b[3], b[2] - b[5] * b[3])]
        top.add_patch(Polygon(quad, closed=True, fc=col, ec='none', alpha=0.55))
    for l in data['labels']:
        top.annotate(l['name'], (l['x'], l['z']), fontsize=8, color='#102040', ha='left', xytext=(6, 4), textcoords='offset points')
    top.invert_yaxis()
    top.set_title("Titan's Rest: the road over the titan, from above (north up)")
    # From the south: x east to the right, y up.
    order = sorted(data['shapes'], key=lambda s: -max(p[2] for p in s['pts']))
    for s in order:
        h = hull([(p[0], p[1]) for p in s['pts']])
        side.add_patch(Polygon(h, closed=True, fc=COL.get(s['mat'], '#ccc'), ec='#555', lw=0.6, alpha=0.85))
    side.axhline(0, color='#a08050', lw=1)
    xs = [p[0] for p in road]
    ys = [p[1] for p in road]
    side.plot(xs, ys, '.', color='#203050', ms=1.5)
    for l in data['labels']:
        side.annotate(l['name'], (l['x'], l['y']), fontsize=7, color='#102040', rotation=60, xytext=(2, 6), textcoords='offset points')
    side.set_title('From the south (height exaggerated 1:1)')
    xmin = min(min(xs), min(p[0] for s in data['shapes'] for p in s['pts'])) - 50
    xmax = max(max(xs), max(p[0] for s in data['shapes'] for p in s['pts'])) + 50
    for ax in (top, side):
        ax.set_xlim(xmin, xmax)
    zs = [p[2] for p in road] + [p[2] for s in data['shapes'] for p in s['pts']]
    top.set_ylim(max(zs) + 50, min(zs) - 50)
    side.set_ylim(-150, max(max(ys), max(p[1] for s in data['shapes'] for p in s['pts'])) + 40)
    fig.tight_layout()
    fig.savefig(out, dpi=80)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

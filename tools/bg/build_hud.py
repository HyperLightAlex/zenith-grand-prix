"""Build the HUD art for the anime look from the sheets in art/hud-sheets
and art/faction-sheets: the icons, the pilots' portraits, the team emblems
and the countdown.

    python3 tools/bg/build_hud.py

Writes src/client/ui/art/*.webp and a generated module src/client/ui/hudArt.ts
that the HUD imports. Run it again after replacing a sheet.

What it does to the sheets:
- Icons (U1): each cut out of the green by its own outline, its parts grouped
  by the cell of the 6x4 grid their middle falls in (a few run a little over
  their cell's edge), centred on a square and kept white, so the HUD can
  colour it as a mask.
- Pilots (U2, and F1 for the two newer teams): each square found by the
  joins between them (the grid can sit a pixel or two off the 512 lines) and
  cut just inside them.
- Emblems and countdown (U3): each piece cut out by its outline; the emblems
  centred on squares, the lettering kept at its own shape. Mirage's and
  Aurora's emblems come the same way from the top row of the F2 sheet's 2x2
  grid, each replaced by its redo on its own sheet (F2b) when that is there.
- Tempest (T1, keyed on magenta, its art being green): the pilots across the
  top, cut like the others; below them the emblem and the team's name, told
  apart as the two clusters of pieces on the magenta (the squarer one is the
  emblem). The sheet can also come as two: the pilots (T1a) and the emblem
  and name (T1b). Until it comes, the game draws Tempest's stand-ins.
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

from build_backgrounds import keyed, save

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SHEETS = os.path.join(ROOT, 'art', 'hud-sheets')
FACTION_SHEETS = os.path.join(ROOT, 'art', 'faction-sheets')
OUT = os.path.join(ROOT, 'src', 'client', 'ui')

ICONS = [
    'overdrive', 'breakaway', 'snare', 'disruptor', 'ram', 'aegis',
    'blitz', 'run', 'shield', 'mark', 'slipstream', 'slingshot',
    'weaponsLocked', 'lockedOn', 'escorting', 'momentum', 'snared', 'charging',
    'parry', 'dodge', 'guard', 'forward', 'midfielder', 'defender',
]
# By team (Solstice, Vanta from U2; Mirage, Aurora from F1), then role.
PILOTS_U2 = ['kite', 'lark', 'atlas', 'shrike', 'moth', 'golem']
PILOTS_F1 = ['sirocco', 'ibis', 'dune', 'orion', 'vesper', 'bastion']
PILOTS_T1 = ['squall', 'gale', 'anvil']
PILOTS = PILOTS_U2 + PILOTS_F1
U3 = ['solstice', 'vanta', 'go', 'three', 'two', 'one']
F2 = ['mirage', 'aurora']


def sheet(name, where=SHEETS):
    return np.asarray(Image.open(os.path.join(where, name)).convert('RGB')).astype(np.float32) / 255


def pieces(rgb, cols, rows, min_size=30):
    """Each cell's cut-out (RGBA), its parts grouped by where their middles fall."""
    k = keyed(rgb)
    lab, n = ndimage.label(k[..., 3] > 0.5)
    sizes = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
    cents = ndimage.center_of_mass(np.ones(lab.shape), lab, range(1, n + 1))
    H, W = lab.shape
    cell_of = {}
    for i, (cy, cx) in enumerate(cents):
        if sizes[i] < min_size:
            continue
        c = int(cy // (H / rows)) * cols + int(cx // (W / cols))
        cell_of.setdefault(c, []).append(i + 1)
    out = []
    for c in range(cols * rows):
        ids = cell_of[c]
        m = ndimage.binary_dilation(np.isin(lab, ids), iterations=3)
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        p = k[y0:y1, x0:x1].copy()
        p[..., 3] *= m[y0:y1, x0:x1]
        out.append(p)
    return out


def on_square(p, size, pad=0.06):
    """A cut-out centred on a transparent square, `pad` of it clear round the edge."""
    h, w = p.shape[:2]
    side = int(max(h, w) * (1 + 2 * pad))
    sq = np.zeros((side, side, 4), np.float32)
    oy, ox = (side - h) // 2, (side - w) // 2
    sq[oy:oy + h, ox:ox + w] = p
    return resized(sq, size, size)


def resized(p, w, h):
    # Premultiplied while resampling, so the transparent edge does not darken.
    pm = np.concatenate([p[..., :3] * p[..., 3:], p[..., 3:]], -1)
    im = Image.fromarray((np.clip(pm, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    q = np.asarray(im).astype(np.float32) / 255
    a = q[..., 3:]
    rgb = np.where(a > 1e-3, q[..., :3] / np.maximum(a, 1e-3), 0)
    return np.concatenate([np.clip(rgb, 0, 1), a], -1)


def join_near(profile, at, reach=8):
    step = np.abs(np.diff(profile, axis=0)).sum(1)
    lo = at - reach
    return lo + int(np.argmax(step[lo:at + reach])) + 1


def tempest_sheets():
    """Tempest's pilots sheet (the top row is the pilots) and its emblem and
    name cut out of the magenta, from T1, or from T1a and T1b; None for any
    not painted yet."""
    one = os.path.join(FACTION_SHEETS, 'faction-t1-tempest.png')
    if os.path.exists(one):
        a = sheet('faction-t1-tempest.png', FACTION_SHEETS)
        y = join_near(a.mean(1), 512)
        pilots, keyed_part = a, a[y + 8:]
    else:
        pa = os.path.join(FACTION_SHEETS, 'faction-t1a-tempest-pilots.png')
        pb = os.path.join(FACTION_SHEETS, 'faction-t1b-tempest-emblem.png')
        pilots = sheet(os.path.basename(pa), FACTION_SHEETS) if os.path.exists(pa) else None
        keyed_part = sheet(os.path.basename(pb), FACTION_SHEETS) if os.path.exists(pb) else None
    emblem = name = None
    if keyed_part is not None:
        k = keyed(keyed_part)
        solid = k[..., 3] > 0.5
        lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=24))
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        out = []
        for i in np.argsort(sizes)[::-1][:2]:
            m = ndimage.binary_dilation(solid & (lab == i + 1), iterations=3)
            ys, xs = np.nonzero(m)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            p = k[y0:y1, x0:x1].copy()
            p[..., 3] *= m[y0:y1, x0:x1]
            out.append(p)
        out.sort(key=lambda p: abs(np.log(p.shape[1] / p.shape[0])))
        emblem, name = out[0], out[1]
    return pilots, emblem, name


def main():
    d = os.path.join(OUT, 'art')
    os.makedirs(d, exist_ok=True)
    files = {}
    # Icons: white, kept as masks.
    for name, p in zip(ICONS, pieces(sheet('hud-u1-icons.png'), 6, 4)):
        p[..., :3] = 1.0
        files[name] = save(on_square(p, 128), os.path.join(d, f'icon-{name}.webp'), 92)
    # Pilots: two sheets of six, each 3x2, and Tempest's three across the top of its own.
    t_pilots, t_emblem, _ = tempest_sheets()
    sheets = [(sheet('hud-u2-pilots.png'), PILOTS_U2), (sheet('faction-f1-pilots.png', FACTION_SHEETS), PILOTS_F1)]
    if t_pilots is not None:
        sheets.append((t_pilots, PILOTS_T1))
    pilots = PILOTS + (PILOTS_T1 if t_pilots is not None else [])
    for a, names in sheets:
        xs = [0, join_near(a.mean(0), 512), join_near(a.mean(0), 1024), a.shape[1]]
        ys = [0, join_near(a.mean(1), 512), a.shape[0]]
        inset = 3
        for i, name in enumerate(names):
            r, c = divmod(i, 3)
            t = a[ys[r] + (inset if r else 0):ys[r + 1] - (inset if r == 0 else 0), xs[c] + (inset if c else 0):xs[c + 1] - (inset if c < 2 else 0)]
            # A pilot redone on its own square image (T2) replaces the sheet's.
            redo = f'faction-t2-{name}.png'
            if os.path.exists(os.path.join(FACTION_SHEETS, redo)):
                t = sheet(redo, FACTION_SHEETS)
                side = min(t.shape[:2])
                y0, x0 = (t.shape[0] - side) // 2, (t.shape[1] - side) // 2
                t = t[y0:y0 + side, x0:x0 + side]
            im = Image.fromarray((t * 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS)
            files[name] = save(np.asarray(im).astype(np.float32) / 255, os.path.join(d, f'pilot-{name}.webp'), 88)
    # Emblems and the countdown.
    aspect = {}
    for name, p in zip(U3, pieces(sheet('hud-u3-emblems.png'), 3, 2, 2000)):
        if name in ('solstice', 'vanta'):
            q = on_square(p, 192, 0.02)
        else:
            h = 320
            q = resized(p, max(1, round(p.shape[1] * h / p.shape[0])), h)
            aspect[name] = round(q.shape[1] / q.shape[0], 4)
        files[name] = save(q, os.path.join(d, f'{name}.webp'), 90)
    # The newer teams' emblems: F2's top row, each replaced by its redo (F2b) when that is there.
    f2 = pieces(sheet('faction-f2-emblems.png', FACTION_SHEETS), 2, 2, 2000)[:2]
    for name, p in zip(F2, f2):
        redo = f'faction-f2b-{name}-emblem.png'
        if os.path.exists(os.path.join(FACTION_SHEETS, redo)):
            p = pieces(sheet(redo, FACTION_SHEETS), 1, 1, 2000)[0]
        files[name] = save(on_square(p, 192, 0.02), os.path.join(d, f'{name}.webp'), 90)
    emblems = ['solstice', 'vanta'] + F2
    if t_emblem is not None:
        files['tempest'] = save(on_square(t_emblem, 192, 0.02), os.path.join(d, 'tempest.webp'), 90)
        emblems.append('tempest')
    lines = [
        '// Generated by tools/bg/build_hud.py from art/hud-sheets and art/faction-sheets. Do not edit by hand.',
        '// The HUD art for the anime look: white icons (masks), the pilots, the team emblems and the countdown.',
    ]
    for name in ICONS:
        lines.append(f"import icon_{name} from './art/icon-{name}.webp';")
    for name in pilots:
        lines.append(f"import pilot_{name} from './art/pilot-{name}.webp';")
    for name in U3 + emblems[2:]:
        lines.append(f"import art_{name} from './art/{name}.webp';")
    lines += [
        '',
        'export const ICONS = {',
        *[f'  {name}: icon_{name},' for name in ICONS],
        '} as const;',
        'export type IconName = keyof typeof ICONS;',
        '',
        '/** By team (Solstice, Vanta, Mirage, Aurora, then Tempest once painted), then role (forward, midfielder, defender). */',
        f"export const PILOTS: string[] = [{', '.join(f'pilot_{n}' for n in pilots)}];",
        '',
        '/** By team: Solstice, Vanta, Mirage, Aurora, then Tempest once painted. */',
        f"export const EMBLEMS: string[] = [{', '.join(f'art_{n}' for n in emblems)}];",
        '',
        '/** The countdown, as painted: 3, 2, 1 and GO!, each with its width over its height. */',
        'export const COUNT: Record<string, { url: string; aspect: number }> = {',
        f"  '3': {{ url: art_three, aspect: {aspect['three']} }},",
        f"  '2': {{ url: art_two, aspect: {aspect['two']} }},",
        f"  '1': {{ url: art_one, aspect: {aspect['one']} }},",
        f"  GO: {{ url: art_go, aspect: {aspect['go']} }},",
        '};',
        '',
    ]
    with open(os.path.join(OUT, 'hudArt.ts'), 'w') as fh:
        fh.write('\n'.join(lines))
    print(f'hud: {sum(files.values()) // 1024} KB, {len(files)} files')


if __name__ == '__main__':
    main()

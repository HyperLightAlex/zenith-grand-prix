"""Check the fallen titan against the space Titan's Rest's road needs. Run it
in Blender 5.2 on the production file:

    blender --background titan-production.blend --python art/blender/titan/fit/check_clearance.py -- [--strict] [--collection TITAN] [--step 4]

It takes every mesh object in the collection (default TITAN; its children
too), with modifiers applied and in world space, and tests its vertices,
points along its edges and points across its faces about --step metres apart
against road.json: the space round the road (KEEP_OUT: past each edge, below
the deck, and above it, each route of the Hull's fork its own box) must be
empty, and the sky over it (to KEEP_OUT.sky) should be, bar the parts meant
to pass over the road. It prints, per object, how many points are inside
each and on which pieces of the road, and with --strict exits 1 if anything
is in the space round the road. The same test runs in the game's tests on
the exported model.
"""
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load_road():
    road = json.load(open(os.path.join(HERE, 'road.json')))
    S = road['samples']
    f = lambda k: np.array([s[k] for s in S], dtype=np.float64)
    return dict(
        ds=road['ds'], keep=road['KEEP_OUT'], pieces=[p['name'] or f"#{p['index']}" for p in road['pieces']],
        p=f('p'), t=f('t'), r=f('r'), u=f('u'), hw=f('hw'), median=f('median'), shift=f('shift'), rise=f('rise'),
        piece=np.array([s['piece'] for s in S]),
    )


def boxes(R, up):
    """Per sample, two boxes (d0, d1, h0, h1): the whole road twice where it is not forked, each route through a fork."""
    k = R['keep']
    hw = R['hw'] + k['side']
    sL, sR = R['shift'][:, 0], R['shift'][:, 1]
    rL, rR = R['rise'][:, 0], R['rise'][:, 1]
    forked = (R['median'] > 0.01) | (sL != 0) | (sR != 0) | (rL != 0) | (rR != 0)
    left = np.stack([np.where(forked, -hw + sL, -hw), np.where(forked, k['side'] + sL, hw), np.where(forked, -k['down'] + rL, -k['down']), np.where(forked, up + rL, up)], 1)
    right = np.stack([np.where(forked, -k['side'] + sR, -hw), np.where(forked, hw + sR, hw), np.where(forked, -k['down'] + rR, -k['down']), np.where(forked, up + rR, up)], 1)
    return left, right


def inside(Q, R, up, chunk=1500):
    """For points Q (game axes), the sample each is inside the space of (up to `up` over the deck), or -1."""
    left, right = boxes(R, up)
    reach = float(np.max(np.hypot(np.maximum(np.abs(left[:, :2]).max(1), np.abs(right[:, :2]).max(1)), up))) + R['ds']
    hit = np.full(len(Q), -1)
    P, T, Rr, U = R['p'], R['t'], R['r'], R['u']
    for a in range(0, len(Q), chunk):
        q = Q[a:a + chunk]
        v = q[:, None, :] - P[None, :, :]
        near = (np.abs(v) < reach).all(2)
        rows, cols = np.nonzero(near)
        if len(rows) == 0:
            continue
        vv = v[rows, cols]
        along = np.einsum('ij,ij->i', vv, T[cols])
        d = np.einsum('ij,ij->i', vv, Rr[cols])
        h = np.einsum('ij,ij->i', vv, U[cols])
        ok = np.abs(along) <= R['ds']
        inL = (d >= left[cols, 0]) & (d <= left[cols, 1]) & (h >= left[cols, 2]) & (h <= left[cols, 3])
        inR = (d >= right[cols, 0]) & (d <= right[cols, 1]) & (h >= right[cols, 2]) & (h <= right[cols, 3])
        m = ok & (inL | inR)
        hit[a + rows[m]] = cols[m]
    return hit


def points(obj, step):
    """The object's surface in game axes: its vertices, and points along its edges and across its faces."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    mw = obj.matrix_world
    V = np.array([tuple(mw @ v.co) for v in bm.verts], dtype=np.float64)
    tris = np.array([[v.index for v in f.verts] for f in bm.faces], dtype=np.int64)
    bm.free()
    ev.to_mesh_clear()
    out = [V]
    if len(tris):
        A, B, C = V[tris[:, 0]], V[tris[:, 1]], V[tris[:, 2]]
        longest = np.max(np.stack([np.linalg.norm(B - A, axis=1), np.linalg.norm(C - B, axis=1), np.linalg.norm(A - C, axis=1)], 1), 1)
        for n in np.unique(np.clip(np.ceil(longest / step), 1, 64).astype(int)):
            if n < 2:
                continue
            sel = np.ceil(longest / step).clip(1, 64).astype(int) == n
            a, b, c = A[sel], B[sel], C[sel]
            for i in range(n + 1):
                for j in range(n + 1 - i):
                    if (i, j) in ((0, 0), (n, 0), (0, n)):
                        continue
                    w1, w2 = i / n, j / n
                    out.append(a + (b - a) * w1 + (c - a) * w2)
    P = np.concatenate(out, 0)
    # Blender (X, Y, Z) is the game's (x, z = -Y, y = Z).
    return np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    arg = lambda k, dflt: argv[argv.index(k) + 1] if k in argv else dflt
    strict = '--strict' in argv
    step = float(arg('--step', 4))
    name = arg('--collection', 'TITAN')
    col = bpy.data.collections.get(name)
    if col is None:
        print(f'no collection {name}')
        sys.exit(2)
    R = load_road()
    k = R['keep']
    bad = 0
    print(f"Checking {name} against the road: the space round it {k['side']} m past each edge, {k['down']} m under the deck to {k['up']} m over it; the sky to {k['sky']} m.")
    for obj in sorted((o for o in col.all_objects if o.type == 'MESH'), key=lambda o: o.name):
        Q = points(obj, step)
        hard = inside(Q, R, k['up'])
        soft = inside(Q, R, k['sky'])
        soft[hard >= 0] = -1
        line = []
        for label, hits in (('IN THE ROAD SPACE', hard), ('in the sky over the road', soft)):
            if (hits >= 0).any():
                where = {}
                for i in hits[hits >= 0]:
                    pc = R['pieces'][R['piece'][i]]
                    where[pc] = where.get(pc, 0) + 1
                line.append(f"{label}: {int((hits >= 0).sum())} points ({', '.join(f'{w} {n}' for w, n in sorted(where.items(), key=lambda x: -x[1]))})")
        if (hard >= 0).any():
            bad += 1
        print(f"  {obj.name}: {len(Q)} points{'; ' + '; '.join(line) if line else ', clear'}")
    print(f'{bad} object(s) in the space round the road' if bad else 'Clear of the road.')
    if strict and bad:
        sys.exit(1)


main()

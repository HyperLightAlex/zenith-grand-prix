"""The outposts' buildings: what stands round a circuit out in the wild,
built as their real counterparts are (art/blender/outposts/README.txt):
foundations under them, frames that carry their loads, walls and roofs
closed, doors, stairs and rails where people go in and out.

Run with the bpy module (tools/blender.sh):

    sh tools/blender.sh run art/blender/outposts/build_outposts.py -- \\
        [--glb src/client/render/outposts/assets/outposts.glb] [--preview out.png]

Metres, Blender's axes (Z up). Each building is one empty named for its
kind, at the origin, its meshes its children; its origin is on the ground
at its middle, its front (doors, the way it faces the street) toward -Y
(in the exported glTF, +Z). Each mesh carries one material, named for its
slot, which the game paints: paint (tinted per building: containers,
modules, cranes, cars), steel, concrete, cladding (ribbed metal), panel
(smooth wall panels), roof, glass, dark (doors, tyres, cables), marking
(white), accent (safety orange), lamp (lit). UVs are box-projected, one
unit to a metre.
"""

import math
import sys

import bpy  # (first: the module brings bmesh and mathutils with it)
import bmesh
from mathutils import Matrix, Vector

SLOTS = {
    "paint": (0.92, 0.92, 0.9),
    "steel": (0.27, 0.3, 0.35),
    "concrete": (0.66, 0.65, 0.62),
    "cladding": (0.7, 0.72, 0.74),
    "panel": (0.88, 0.86, 0.8),
    "roof": (0.36, 0.33, 0.32),
    "glass": (0.16, 0.24, 0.34),
    "dark": (0.14, 0.15, 0.17),
    "marking": (0.95, 0.95, 0.92),
    "accent": (1.0, 0.45, 0.1),
    "lamp": (1.0, 0.92, 0.7),
}


# The slots a texture may go on one day (the outposts' art sheets): these keep UVs.
TEXTURED = {"paint", "concrete", "cladding", "panel", "roof"}


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = {"glb": None, "blend": None, "preview": None}
    for i in range(0, len(argv) - 1, 2):
        out[argv[i].lstrip("-")] = argv[i + 1]
    return out


def material(slot):
    m = bpy.data.materials.get(slot) or bpy.data.materials.new(slot)
    m.diffuse_color = (*SLOTS[slot], 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*SLOTS[slot], 1.0)
        bsdf.inputs["Roughness"].default_value = 0.6
        if slot == "lamp":
            bsdf.inputs["Emission Color"].default_value = (*SLOTS[slot], 1.0)
            bsdf.inputs["Emission Strength"].default_value = 3.0
    return m


class Part:
    """One mesh of a building: pieces in a bmesh, one material."""

    def __init__(self, slot):
        self.slot = slot
        self.bm = bmesh.new()

    def _new(self, verts):
        return verts

    def box(self, cx, cy, cz, sx, sy, sz, rz=0.0):
        """A box centred at (cx, cy, cz), sx by sy by sz, turned rz about Z."""
        m = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1.0))
        bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self

    def span(self, x0, x1, y0, y1, z0, z1):
        return self.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))

    def tube(self, a, b, r, seg=6):
        a, b = Vector(a), Vector(b)
        axis = b - a
        if axis.length < 1e-6:
            return self
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation((a + b) / 2) @ rot
        # (A thin member's ends are lost in the joints it meets: no caps.)
        bmesh.ops.create_cone(self.bm, cap_ends=r >= 0.06, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=axis.length, matrix=m)
        return self

    def cyl(self, cx, cy, z0, z1, r, seg=16, r_top=None, smooth=False, caps=True):
        m = Matrix.Translation((cx, cy, (z0 + z1) / 2))
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r if r_top is None else r_top, depth=z1 - z0, matrix=m)
        if smooth:
            vs = set(res["verts"])
            for f in self.bm.faces:
                if all(v in vs for v in f.verts) and len(f.verts) == 4:
                    f.smooth = True
        return self

    def prism(self, axis, a0, a1, profile):
        """A prism along `axis` ('x', 'y' or 'z') from a0 to a1, its section the closed `profile` (2D points in the other two axes, in order)."""

        def p3(t, u, v):
            if axis == "x":
                return (t, u, v)
            if axis == "y":
                return (u, t, v)
            return (u, v, t)

        lo = [self.bm.verts.new(p3(a0, u, v)) for u, v in profile]
        hi = [self.bm.verts.new(p3(a1, u, v)) for u, v in profile]
        self.bm.faces.new(lo)
        self.bm.faces.new(list(reversed(hi)))
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        return self

    def quad(self, pts):
        self.bm.faces.new([self.bm.verts.new(p) for p in pts])
        return self

    def merge(self, other):
        """Bring another part's pieces into this one."""
        mesh = bpy.data.meshes.new("tmp")
        other.bm.to_mesh(mesh)
        other.bm.free()
        self.bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
        return self


class Kind:
    """A building: its parts by slot."""

    def __init__(self, name):
        self.name = name
        self.parts = {}

    def __getitem__(self, slot):
        if slot not in self.parts:
            self.parts[slot] = Part(slot)
        return self.parts[slot]


def box_uvs(bm):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 2:
                loop[uv].uv = (co.x, co.y)
            elif ax == 0:
                loop[uv].uv = (co.y, co.z)
            else:
                loop[uv].uv = (co.x, co.z)


def emit(kind, col):
    root = bpy.data.objects.new(kind.name, None)
    col.objects.link(root)
    for slot, part in kind.parts.items():
        bm = part.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if slot in TEXTURED:
            box_uvs(bm)
        mesh = bpy.data.meshes.new(f"{kind.name}.{slot}")
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(material(slot))
        obj = bpy.data.objects.new(f"{kind.name}.{slot}", mesh)
        obj["slot"] = slot
        col.objects.link(obj)
        obj.parent = root
    return root


# ---- the kit -----------------------------------------------------------------------


def lattice(part, x, y, z0, z1, w, step, chord=0.09, brace=0.05):
    """A square lattice mast: four chords, a strut round each section's top, a diagonal across each face (turning each section)."""
    h = w / 2
    corners = [(-h, -h), (h, -h), (h, h), (-h, h)]
    for cx, cy in corners:
        part.tube((x + cx, y + cy, z0), (x + cx, y + cy, z1), chord, 4)
    n = max(1, round((z1 - z0) / step))
    for k in range(n + 1):
        z = z0 + (z1 - z0) * k / n
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            part.tube((x + a[0], y + a[1], z), (x + b[0], y + b[1], z), brace, 4)
            if k < n:
                zn = z0 + (z1 - z0) * (k + 1) / n
                if k % 2:
                    a, b = b, a
                part.tube((x + a[0], y + a[1], z), (x + b[0], y + b[1], zn), brace, 4)


def tri_lattice(part, a, b, w, h, step, chord=0.08, brace=0.045):
    """A triangular lattice girder from a to b (horizontal): two bottom chords w apart, one top chord h above, zigzag between."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = Vector((-d.y, d.x, 0)).normalized()
    up = Vector((0, 0, 1))
    ends = [(-w / 2, 0), (w / 2, 0), (0, h)]
    chords = [(a + side * s + up * z, b + side * s + up * z) for s, z in ends]
    for p, q in chords:
        part.tube(p, q, chord, 4)
    n = max(1, round((b - a).length / step))
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        for i in range(3):
            p0 = chords[i][0].lerp(chords[i][1], t0)
            q1 = chords[(i + 1) % 3][0].lerp(chords[(i + 1) % 3][1], t1)
            part.tube(p0, q1, brace, 4)
        # The bottom's cross strut.
        part.tube(chords[0][0].lerp(chords[0][1], t0), chords[1][0].lerp(chords[1][1], t0), brace, 4)


def stair(k, x, y0, z_top, width, along="y", sign=1, slot="steel"):
    """A steel stair up to z_top, its foot on the ground `sign` along `along` from (x, y0): stringers, treads, handrails, a post at each end."""
    steps = max(2, round(z_top / 0.18))
    run = steps * 0.27
    p = k[slot]
    for s in (-1, 1):
        if along == "y":
            a, b = (x + s * width / 2, y0 + sign * run, 0.0), (x + s * width / 2, y0, z_top)
        else:
            a, b = (x + sign * run, y0 + s * width / 2, 0.0), (x, y0 + s * width / 2, z_top)
        p.tube(a, b, 0.07, 4)
        p.tube((a[0], a[1], a[2] + 1.0), (b[0], b[1], b[2] + 1.0), 0.035, 4)
        p.tube(a, (a[0], a[1], a[2] + 1.0), 0.035, 4)
        p.tube(b, (b[0], b[1], b[2] + 1.0), 0.035, 4)
    for i in range(1, steps + 1):
        f = i / steps
        z = z_top * f
        if along == "y":
            p.box(x, y0 + sign * run * (1 - f), z - 0.02, width, 0.26, 0.04)
        else:
            p.box(x + sign * run * (1 - f), y0, z - 0.02, 0.26, width, 0.04)


def rail(part, pts, h=1.0, post=1.5, r=0.03):
    """A handrail along the points (a mid rail and posts)."""
    for (ax, ay, az), (bx, by, bz) in zip(pts, pts[1:]):
        for dz in (h, h / 2):
            part.tube((ax, ay, az + dz), (bx, by, bz + dz), r, 4)
        n = max(1, round(math.hypot(bx - ax, by - ay) / post))
        for i in range(n + 1):
            f = i / n
            px, py, pz = ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f
            part.tube((px, py, pz), (px, py, pz + h), r, 4)


def corrugated(part, axis, a0, a1, fixed, z0, z1, pitch=0.5, depth=0.06, outward=1):
    """A ribbed wall: in the plane `fixed` (x or y, by `axis`: the wall runs along that axis), from a0 to a1, z0 to z1, ribs every pitch."""
    n = max(2, round((a1 - a0) / pitch))
    for i in range(n):
        u0 = a0 + (a1 - a0) * i / n
        u1 = a0 + (a1 - a0) * (i + 1) / n
        um = (u0 + u1) / 2
        for (p, q, d0, d1) in ((u0, um, 0.0, depth), (um, u1, depth, 0.0)):
            if axis == "x":
                pts = [(p, fixed + outward * d0, z0), (q, fixed + outward * d1, z0), (q, fixed + outward * d1, z1), (p, fixed + outward * d0, z1)]
            else:
                pts = [(fixed + outward * d0, p, z0), (fixed + outward * d1, q, z0), (fixed + outward * d1, q, z1), (fixed + outward * d0, p, z1)]
            part.quad(pts)


def container():
    k = Kind("container")
    L, W, H = 12.19, 2.44, 2.59
    p = k["paint"]
    # The frame: corner posts, top and bottom rails, the end frames.
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box(sx * (W / 2 - 0.08), sy * (L / 2 - 0.08), H / 2, 0.16, 0.16, H)
        for z in (0.08, H - 0.08):
            p.box(sx * (W / 2 - 0.08), 0, z, 0.16, L - 0.3, 0.16)
    for sy in (-1, 1):
        for z in (0.08, H - 0.08):
            p.box(0, sy * (L / 2 - 0.08), z, W - 0.3, 0.16, 0.16)
    # Corrugated sides, the roof, the front end panel, the floor.
    for sx in (-1, 1):
        corrugated(p, "y", -L / 2 + 0.16, L / 2 - 0.16, sx * (W / 2 - 0.12), 0.16, H - 0.16, 0.42, 0.05, sx)
    p.box(0, 0, H - 0.05, W - 0.2, L - 0.2, 0.06)
    p.box(0, 0, 0.12, W - 0.2, L - 0.2, 0.08)
    p.box(0, -L / 2 + 0.1, H / 2, W - 0.3, 0.06, H - 0.3)
    # The doors at the back, with their locking bars and hinges.
    p.box(0, L / 2 - 0.1, H / 2, W - 0.3, 0.06, H - 0.3)
    s = k["steel"]
    for x in (-0.85, -0.35, 0.35, 0.85):
        s.tube((x, L / 2 + 0.02, 0.2), (x, L / 2 + 0.02, H - 0.2), 0.025, 4)
        s.box(x, L / 2 + 0.04, H * 0.45, 0.1, 0.06, 0.16)
    # Corner castings.
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (0.09, H - 0.09):
                s.box(sx * (W / 2 - 0.09), sy * (L / 2 - 0.09), z, 0.19, 0.19, 0.18)
    return k


def cabin():
    """A site cabin: a steel-framed box on concrete blocks, a door up steps, windows, an air conditioner."""
    k = Kind("cabin")
    L, W, H, lift = 9.6, 3.0, 2.7, 0.5
    for x in (-4.2, 0, 4.2):
        for y in (-1.1, 1.1):
            k["concrete"].box(x, y, lift / 2 - 0.05, 0.5, 0.5, lift + 0.1)
    p = k["paint"]
    p.box(0, 0, lift + H / 2, L, W, H)
    st = k["steel"]
    # The frame round its floor and its roof, the corner posts.
    for z in (lift + 0.06, lift + H - 0.06):
        st.box(0, -W / 2 - 0.02, z, L + 0.08, 0.1, 0.14).box(0, W / 2 + 0.02, z, L + 0.08, 0.1, 0.14)
        st.box(-L / 2 - 0.02, 0, z, 0.1, W + 0.08, 0.14).box(L / 2 + 0.02, 0, z, 0.1, W + 0.08, 0.14)
    for sx in (-1, 1):
        for sy in (-1, 1):
            st.box(sx * (L / 2 + 0.02), sy * (W / 2 + 0.02), lift + H / 2, 0.12, 0.12, H)
    # Its roof, a little proud, falling to the back.
    k["roof"].box(0, 0.05, lift + H + 0.06, L + 0.2, W + 0.3, 0.12)
    # The door on its front, up its steps; windows front and back.
    k["dark"].box(2.6, -W / 2 - 0.03, lift + 1.05, 0.95, 0.06, 2.05)
    st.box(2.6, -W / 2 - 0.05, lift + 2.12, 1.1, 0.08, 0.08)
    for x in (-3.0, -0.6):
        k["glass"].box(x, -W / 2 - 0.03, lift + 1.55, 1.2, 0.06, 0.9)
        st.box(x, -W / 2 - 0.06, lift + 1.05, 1.32, 0.12, 0.08)
    k["glass"].box(-1.8, W / 2 + 0.03, lift + 1.55, 1.2, 0.06, 0.9)
    # The landing and the steps.
    st.box(2.6, -W / 2 - 0.7, lift - 0.02, 1.4, 1.2, 0.06)
    for sx in (-0.65, 0.65):
        st.tube((2.6 + sx, -W / 2 - 1.28, 0), (2.6 + sx, -W / 2 - 1.28, lift), 0.04, 4)
    stair(k, 2.6, -W / 2 - 1.3, lift, 1.0, "y", -1)
    rail(st, [(1.9, -W / 2 - 1.3, lift), (1.9, -W / 2 - 0.1, lift)])
    # The air conditioner on its end.
    k["panel"].box(L / 2 + 0.35, 0.6, lift + 1.9, 0.6, 0.9, 0.6)
    return k


def workshop():
    """A portal-frame workshop: a slab, steel frames at its corners and gables, ribbed walls and gables, a pitched roof with gutters and downpipes, a roller door in its front gable, a door beside it, high windows along its sides."""
    k = Kind("workshop")
    W, L, eave, ridge = 20.0, 30.0, 8.0, 10.2
    k["concrete"].box(0, 0, 0.1, W + 1.2, L + 1.2, 0.3)
    c = k["cladding"]
    for sx in (-1, 1):
        corrugated(c, "y", -L / 2, L / 2, sx * W / 2, 0.25, eave, 0.5, 0.07, sx)
    for sy in (-1, 1):
        corrugated(c, "x", -W / 2, W / 2, sy * L / 2, 0.25, eave, 0.5, 0.07, sy)
        # The gable's triangle over the wall.
        c.prism("y", sy * L / 2 - 0.05, sy * L / 2 + 0.05, [(-W / 2, eave), (W / 2, eave), (0, ridge)])
    st = k["steel"]
    # The frames: a column at each corner and every 7.5 m along the sides, a rafter over each.
    for y in (-L / 2, -L / 4, 0, L / 4, L / 2):
        for sx in (-1, 1):
            st.box(sx * (W / 2 + 0.15), y, eave / 2, 0.3, 0.4, eave)
            st.tube((sx * (W / 2 + 0.15), y, eave), (0, y, ridge + 0.1), 0.18, 4)
    # The roof, its two slopes overhanging, gutters along the eaves, downpipes at the corners, a vent along the ridge.
    pitch = math.atan2(ridge - eave, W / 2)
    run = W / 2 + 0.6
    slope = run / math.cos(pitch)
    for sx in (-1, 1):
        # Each slope a slab from the ridge out past the eave, laid on the rafters.
        r = Part("roof")
        r.box(0, 0, 0, slope, L + 1.0, 0.16)
        mid_z = ridge + 0.3 - (run / 2) * math.tan(pitch)
        r.bm.transform(Matrix.Translation((sx * run / 2, 0, mid_z)) @ Matrix.Rotation(sx * pitch, 4, "Y"))
        k["roof"].merge(r)
    k["roof"].box(0, 0, ridge + 0.45, 1.2, L - 4, 0.3)
    for sx in (-1, 1):
        st.box(sx * (W / 2 + 0.75), 0, eave - 0.1, 0.25, L + 1.0, 0.25)
        for sy in (-1, 1):
            st.tube((sx * (W / 2 + 0.75), sy * (L / 2 + 0.3), 0.3), (sx * (W / 2 + 0.75), sy * (L / 2 + 0.3), eave - 0.1), 0.07, 6)
    # The roller door in the front gable, its frame and its drum; a door beside it.
    k["dark"].box(-2.0, -L / 2 - 0.12, 3.2, 9.0, 0.1, 6.0)
    st.box(-2.0, -L / 2 - 0.2, 6.45, 9.8, 0.35, 0.6)
    for x in (-6.6, 2.6):
        st.box(x, -L / 2 - 0.16, 3.2, 0.25, 0.2, 6.4)
    k["dark"].box(6.5, -L / 2 - 0.1, 1.3, 1.0, 0.08, 2.1)
    st.box(6.5, -L / 2 - 0.14, 2.45, 1.2, 0.12, 0.12)
    # High windows along each side.
    for sx in (-1, 1):
        for y in (-10, -5, 0, 5, 10):
            k["glass"].box(sx * (W / 2 + 0.09), y, eave - 1.6, 0.06, 3.2, 0.9)
    return k


def crane():
    """A tower crane: a foundation with its ballast, a lattice mast, a slewing ring and cab, the tower head, a lattice jib with its trolley and hook out front (-Y), the counter-jib with its counterweights and winch behind, pendant ties from the head."""
    k = Kind("crane")
    H = 42.0
    k["concrete"].box(0, 0, -0.5, 7.0, 7.0, 1.4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k["concrete"].box(sx * 1.6, sy * 1.6, 0.6, 1.6, 1.6, 0.8)
    p = k["paint"]
    lattice(p, 0, 0, 0.2, H, 2.0, 2.5)
    st = k["steel"]
    st.cyl(0, 0, H, H + 0.9, 1.5, 20)
    p.box(0, 0, H + 1.2, 2.4, 2.4, 0.6)
    # The cab, at the jib's foot, glazed to the front.
    p.box(1.8, -0.6, H + 2.2, 1.6, 2.0, 2.2)
    k["glass"].box(1.8, -1.62, H + 2.4, 1.4, 0.06, 1.4)
    # The tower head.
    apex = (0, 0, H + 9.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.tube((sx * 1.0, sy * 1.0, H + 1.5), apex, 0.14, 4)
    # The jib out front, the counter-jib behind.
    tri_lattice(p, (0, -1.2, H + 1.5), (0, -52, H + 1.5), 1.6, 1.6, 2.6)
    st.box(0, 8.0, H + 1.4, 2.4, 15.0, 0.25)
    for sx in (-1, 1):
        st.tube((sx * 1.2, 0.6, H + 1.4), (sx * 1.2, 15.5, H + 1.4), 0.12, 4)
    rail(st, [(-1.2, 1.0, H + 1.5), (-1.2, 15.0, H + 1.5)], 1.0, 2.0)
    rail(st, [(1.2, 1.0, H + 1.5), (1.2, 15.0, H + 1.5)], 1.0, 2.0)
    for y in (11.5, 12.6, 13.7, 14.8):
        k["concrete"].box(0, y, H + 0.4, 2.2, 0.9, 2.0)
    k["dark"].box(0, 7.0, H + 2.2, 1.8, 2.2, 1.4)
    # Pendant ties from the head to the jib and the counter-jib.
    for y in (-24.0, -44.0):
        k["dark"].tube(apex, (0, y, H + 3.1), 0.05, 4)
    k["dark"].tube(apex, (0, 15.0, H + 1.6), 0.05, 4)
    # The trolley, its cables and the hook block.
    st.box(0, -32.0, H + 1.2, 1.4, 1.6, 0.5)
    for sx in (-0.25, 0.25):
        k["dark"].tube((sx, -32.0, H + 1.0), (sx, -32.0, 21.0), 0.03, 4)
    k["accent"].box(0, -32.0, 20.6, 0.9, 0.7, 1.0)
    k["dark"].tube((0, -32.0, 20.1), (0, -32.0, 19.2), 0.12, 6)
    # A climbing ladder up the mast; lamps at the head and the jib's tip.
    for sy in (-0.45, 0.45):
        st.tube((1.05, sy, 0.3), (1.05, sy, H), 0.03, 4)
    k["lamp"].cyl(0, 0, H + 9.0, H + 9.5, 0.3, 8)
    k["lamp"].box(0, -52.0, H + 3.3, 0.4, 0.4, 0.4)
    return k


def tankfarm():
    """Three fuel tanks in a row inside a bund wall: each on a ring foundation, its shell in three courses, a conical roof with a rail round it, a caged ladder up its front; pipes from their feet to a manifold at the front."""
    k = Kind("tankfarm")
    R, H, gap = 5.5, 8.0, 13.0
    xs = (-gap, 0.0, gap)
    c = k["concrete"]
    # The bund: a floor and a low wall round it, steps over it.
    c.box(0, 0, 0.1, 3 * gap + 6, 2 * R + 6, 0.2)
    for sy in (-1, 1):
        c.box(0, sy * (R + 3), 0.75, 3 * gap + 6, 0.3, 1.3)
    for sx in (-1, 1):
        c.box(sx * (1.5 * gap + 3), 0, 0.75, 0.3, 2 * R + 6, 1.3)
    stair(k, 0, -(R + 3.15), 1.4, 0.9, "y", -1)
    p = k["paint"]
    st = k["steel"]
    for x in xs:
        c.cyl(x, 0, 0.0, 0.5, R + 0.4, 28)
        p.cyl(x, 0, 0.5, 0.5 + H, R, 28, smooth=True)
        for z in (0.5 + H / 3, 0.5 + 2 * H / 3):
            st.cyl(x, 0, z - 0.04, z + 0.04, R + 0.03, 28, caps=False)
        p.cyl(x, 0, 0.5 + H, 0.5 + H + 1.2, R + 0.05, 28, r_top=0.6)
        top = 0.5 + H
        ring = [(x + math.cos(a) * (R - 0.2), math.sin(a) * (R - 0.2), top) for a in [i * math.tau / 24 for i in range(25)]]
        rail(st, ring, 1.0, 2.5)
        # The caged ladder up its front.
        for sx in (-0.25, 0.25):
            st.tube((x + sx, -R - 0.25, 0.5), (x + sx, -R - 0.25, top + 1.0), 0.03, 4)
        for z in [0.5 + 0.3 * i for i in range(int(H / 0.3) + 1)]:
            st.tube((x - 0.25, -R - 0.25, z), (x + 0.25, -R - 0.25, z), 0.015, 4)
        # Its cage: hoops from 2.5 m up, and straps up them.
        hoop = [(x + 0.45 * math.cos(math.pi * (1 + j / 4)), -R - 0.25 + 0.45 * math.sin(math.pi * (1 + j / 4)), 0) for j in range(5)]
        for z in [2.5 + 1.1 * i for i in range(int((H - 1.5) / 1.1) + 1)]:
            for (ax, ay, _), (bx, by, _) in zip(hoop, hoop[1:]):
                st.tube((ax, ay, z), (bx, by, z), 0.02, 4)
        for hx, hy, _ in hoop[1:-1]:
            st.tube((hx, hy, 2.5), (hx, hy, top + 1.0), 0.015, 4)
        # Its pipe to the manifold, a valve on it, a support under it.
        st.tube((x + 1.6, -R + 0.2, 0.9), (x + 1.6, -R - 1.6, 0.9), 0.18, 8)
        k["accent"].box(x + 1.6, -R - 1.0, 0.9, 0.5, 0.3, 0.5)
        c.box(x + 1.6, -R - 1.3, 0.35, 0.5, 0.4, 0.5)
    st.tube((-gap + 1.6, -R - 1.6, 0.9), (gap + 1.6, -R - 1.6, 0.9), 0.22, 8)
    st.tube((gap + 1.6, -R - 1.6, 0.9), (gap + 1.6, -R - 3.5, 0.9), 0.22, 8)
    return k


def mast():
    """A guyed lattice mast: a pad, a triangular lattice, antennas and a dish, guy wires from two levels to anchor blocks, lamps."""
    k = Kind("mast")
    H = 36.0
    k["concrete"].box(0, 0, 0.2, 2.2, 2.2, 0.6)
    p = k["paint"]
    w = 1.2
    pts = [(w * math.cos(a), w * math.sin(a)) for a in (math.pi / 2, math.pi / 2 + 2 * math.pi / 3, math.pi / 2 + 4 * math.pi / 3)]
    pts = [(x * 0.58, y * 0.58) for x, y in pts]
    for x, y in pts:
        p.tube((x, y, 0.5), (x, y, H), 0.07, 4)
    n = int(H / 1.5)
    for i in range(n):
        z0, z1 = 0.5 + i * 1.5, 0.5 + (i + 1) * 1.5
        for j in range(3):
            a, b = pts[j], pts[(j + 1) % 3]
            if i % 2:
                a, b = b, a
            p.tube((a[0], a[1], z0), (b[0], b[1], z1), 0.035, 4)
            p.tube((a[0], a[1], z1), (b[0], b[1], z1), 0.035, 4)
    st = k["steel"]
    for a in (0.3, 2.4, 4.5):
        st.box(math.cos(a) * 0.9, math.sin(a) * 0.9, 30.0, 0.3, 0.6, 2.4, a)
    st.cyl(0.0, -0.9, 25.5, 25.7, 0.15, 8)
    dish = Part("paint")
    dish.cyl(0, 0, 0, 0.6, 1.1, 18, r_top=0.2)
    dish.bm.transform(Matrix.Translation((0, -1.4, 25.6)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    p.merge(dish)
    # Guys: three ways, from two levels, to anchor blocks.
    for i in range(3):
        a = math.pi / 2 + i * 2 * math.pi / 3
        ax, ay = math.cos(a) * 18.0, math.sin(a) * 18.0
        k["concrete"].box(ax, ay, 0.3, 1.4, 1.4, 0.8)
        for z in (17.0, 33.0):
            k["dark"].tube((pts[i][0], pts[i][1], z), (ax, ay, 0.6), 0.025, 4)
    k["lamp"].cyl(0, 0, H, H + 0.6, 0.3, 8)
    k["lamp"].box(0.5, 0, 18.0, 0.3, 0.3, 0.3)
    return k


def helipad():
    """A helipad: a raised slab with a kerb, its circle and H, lights round it, a windsock beside it."""
    k = Kind("helipad")
    R = 12.0
    k["concrete"].cyl(0, 0, 0, 0.5, R, 40)
    k["concrete"].cyl(0, 0, 0.5, 0.62, R, 40, r_top=R - 0.3)
    m = k["marking"]
    ring = Part("marking")
    for i in range(40):
        a0, a1 = i * math.tau / 40, (i + 1) * math.tau / 40
        r0, r1 = R * 0.7, R * 0.78
        ring.quad([(math.cos(a0) * r0, math.sin(a0) * r0, 0.64), (math.cos(a1) * r0, math.sin(a1) * r0, 0.64), (math.cos(a1) * r1, math.sin(a1) * r1, 0.64), (math.cos(a0) * r1, math.sin(a0) * r1, 0.64)])
    m.merge(ring)
    for sx in (-1, 1):
        m.box(sx * R * 0.22, 0, 0.64, R * 0.09, R * 0.6, 0.02)
    m.box(0, 0, 0.64, R * 0.44, R * 0.09, 0.02)
    for i in range(12):
        a = i * math.tau / 12
        k["lamp"].cyl(math.cos(a) * (R - 0.4), math.sin(a) * (R - 0.4), 0.62, 0.85, 0.18, 6)
    # The windsock.
    k["steel"].tube((R + 3, 0, 0), (R + 3, 0, 6.0), 0.06, 6)
    sock = Part("accent")
    sock.cyl(0, 0, 0, 2.6, 0.45, 10, r_top=0.2, caps=False)
    sock.bm.transform(Matrix.Translation((R + 3, -1.3, 5.9)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    k["accent"].merge(sock)
    return k


def lamp():
    """A street lamp: a footing, a tapered pole, an arm, the lamp's head lit underneath."""
    k = Kind("lamp")
    k["concrete"].box(0, 0, 0.1, 0.7, 0.7, 0.4)
    k["steel"].box(0, 0, 0.32, 0.4, 0.4, 0.04)
    k["steel"].cyl(0, 0, 0.3, 8.0, 0.11, 8, r_top=0.07)
    k["steel"].tube((0, 0, 7.8), (0, -1.5, 8.1), 0.05, 6)
    k["dark"].box(0, -1.7, 8.1, 0.35, 0.8, 0.18)
    k["lamp"].box(0, -1.7, 7.99, 0.28, 0.65, 0.04)
    return k


def module():
    """A polar station module: on four legs with skid feet, braced across, a frame under it; its body with chamfered edges, a band of lit windows each side, a door at its front up a stair to a landing."""
    k = Kind("module")
    L, D, H, lift = 34.0, 12.0, 4.5, 3.4
    st = k["steel"]
    for x in (-12.0, 12.0):
        for y in (-4.5, 4.5):
            st.box(x, y, lift / 2, 0.6, 0.6, lift)
            st.box(x, y, 0.1, 1.8, 0.9, 0.2)
        st.tube((x, -4.5, 0.4), (x, 4.5, lift - 0.4), 0.08, 4)
        st.tube((x, 4.5, 0.4), (x, -4.5, lift - 0.4), 0.08, 4)
    for y in (-4.5, 4.5):
        st.box(0, y, lift - 0.2, L - 4, 0.5, 0.4)
        st.tube((-12, y, 0.5), (12, y, lift - 0.5), 0.07, 4)
    c = 0.8
    prof = [(-D / 2 + c, 0), (D / 2 - c, 0), (D / 2, c), (D / 2, H - c), (D / 2 - c, H), (-D / 2 + c, H), (-D / 2, H - c), (-D / 2, c)]
    body = [(y, z + lift) for y, z in prof]
    k["paint"].prism("x", -L / 2, L / 2, body)
    for sy in (-1, 1):
        for i in range(10):
            x = -L / 2 + 2.5 + i * 3.2
            k["lamp"].box(x, sy * (D / 2 + 0.03), lift + 2.5, 1.6, 0.06, 1.0)
            st.box(x, sy * (D / 2 + 0.05), lift + 1.95, 1.8, 0.1, 0.08)
    k["dark"].box(-8.0, -D / 2 - 0.05, lift + 1.1, 1.0, 0.08, 2.1)
    st.box(-8.0, -D / 2 - 1.0, lift - 0.05, 1.8, 2.0, 0.1)
    rail(st, [(-8.9, -D / 2 - 2.0, lift), (-7.1, -D / 2 - 2.0, lift)])
    stair(k, -8.9, -D / 2 - 1.5, lift, 1.1, "x", -1)
    # Vents and a rail along its roof.
    for x in (-10, 0, 10):
        k["panel"].box(x, 0, lift + H + 0.3, 1.6, 1.2, 0.6)
    return k


def link():
    """The corridor between two modules, at their height, glazed along its sides, on two legs."""
    k = Kind("link")
    L, lift = 4.6, 3.4
    k["paint"].box(0, 0, lift + 1.6, L, 3.2, 3.0)
    for sy in (-1, 1):
        k["glass"].box(0, sy * 1.62, lift + 1.9, L - 1.0, 0.06, 1.0)
    for sy in (-1, 1):
        k["steel"].box(0, sy * 1.2, lift / 2, 0.4, 0.4, lift)
        k["steel"].box(0, sy * 1.2, 0.1, 1.2, 0.8, 0.2)
    k["steel"].tube((0, -1.2, 0.4), (0, 1.2, lift - 0.4), 0.06, 4)
    return k


def radome():
    """A radome on its equipment building: a slab, a box with a door and a stair, a ring on its roof, the dome of flat panels."""
    k = Kind("radome")
    S, Hb, R = 9.0, 4.0, 5.5
    k["concrete"].box(0, 0, 0.1, S + 1, S + 1, 0.3)
    k["panel"].box(0, 0, 0.25 + Hb / 2, S, S, Hb)
    k["dark"].box(2.0, -S / 2 - 0.05, 1.3, 1.0, 0.08, 2.1)
    k["steel"].cyl(0, 0, 0.25 + Hb, 0.25 + Hb + 0.4, R + 0.1, 32)
    rail(k["steel"], [(-S / 2 + 0.2, -S / 2 + 0.2, Hb + 0.25), (S / 2 - 0.2, -S / 2 + 0.2, Hb + 0.25), (S / 2 - 0.2, S / 2 - 0.2, Hb + 0.25), (-S / 2 + 0.2, S / 2 - 0.2, Hb + 0.25), (-S / 2 + 0.2, -S / 2 + 0.2, Hb + 0.25)])
    dome = Part("paint")
    bmesh.ops.create_icosphere(dome.bm, subdivisions=2, radius=R)
    bmesh.ops.delete(dome.bm, geom=[v for v in dome.bm.verts if v.co.z < -0.3], context="VERTS")
    dome.bm.transform(Matrix.Translation((0, 0, 0.25 + Hb + 0.4)))
    k["paint"].merge(dome)
    k["steel"].tube((0, -S / 2 - 0.4, 0), (0, -S / 2 - 0.4, Hb + 0.25), 0.04, 4)
    return k


def hangar():
    """An arched hangar: a slab, ribbed arches of cladding, ribs proud of it, end walls; the big door in its front, a door at its back."""
    k = Kind("hangar")
    W, L, Ht = 26.0, 36.0, 12.0
    k["concrete"].box(0, 0, 0.1, W + 1.2, L + 1.2, 0.3)
    n = 20
    arch = [(W / 2 * math.cos(math.pi * i / n), 0.25 + Ht * math.sin(math.pi * i / n)) for i in range(n + 1)]
    c = k["cladding"]
    for i in range(n):
        (x0, z0), (x1, z1) = arch[i], arch[i + 1]
        c.quad([(x0, -L / 2, z0), (x1, -L / 2, z1), (x1, L / 2, z1), (x0, L / 2, z0)])
    st = k["steel"]
    for y in [-L / 2 + 0.2 + i * (L - 0.4) / 8 for i in range(9)]:
        for i in range(n):
            (x0, z0), (x1, z1) = arch[i], arch[i + 1]
            st.tube((x0 * 1.01, y, z0 * 1.005), (x1 * 1.01, y, z1 * 1.005), 0.09, 4)
    for sy in (-1, 1):
        wall = Part("panel")
        wall.prism("y", sy * L / 2 - 0.1, sy * L / 2 + 0.1, [(x, z) for x, z in arch])
        k["panel"].merge(wall)
    k["dark"].box(0, -L / 2 - 0.14, 4.1, 14.0, 0.1, 7.6)
    st.box(0, -L / 2 - 0.2, 8.1, 15.0, 0.3, 0.5)
    for x in (-7.3, 7.3):
        st.box(x, -L / 2 - 0.2, 4.1, 0.4, 0.3, 8.0)
    k["dark"].box(5.0, L / 2 + 0.12, 1.3, 1.0, 0.08, 2.1)
    k["lamp"].box(0, -L / 2 - 0.3, 8.6, 1.0, 0.3, 0.25)
    return k


def garages():
    """A row of ten team garages: a slab, a concrete frame (columns along the front, a roof slab with its parapet), panel walls, a roller door between each pair of columns under its lintel, a canopy over the front, plant on the roof; at the back a roller door and a door to each bay."""
    k = Kind("garages")
    L, D, H = 170.0, 22.0, 8.0
    bay = L / 10
    c = k["concrete"]
    c.box(0, 0, 0.15, L + 2, D + 6, 0.3)
    for i in range(11):
        x = -L / 2 + i * bay
        c.box(x, -D / 2, H / 2 + 0.3, 0.8, 0.8, H)
        c.box(x, D / 2, H / 2 + 0.3, 0.6, 0.6, H)
    c.box(0, 0, H + 0.8, L + 0.8, D + 0.8, 1.0)
    for sy in (-1, 1):
        k["panel"].box(0, sy * (D / 2 + 0.3), H + 1.75, L + 0.8, 0.2, 0.9)
    for sx in (-1, 1):
        k["panel"].box(sx * (L / 2 + 0.3), 0, H + 1.75, 0.2, D + 0.8, 0.9)
        k["panel"].box(sx * L / 2, 0, H / 2 + 0.3, 0.3, D, H)
    k["panel"].box(0, D / 2, H / 2 + 0.3, L, 0.3, H)
    # At the back, each bay's way out to the paddock: a roller door, a door beside it, a lamp over them.
    for i in range(10):
        x = -L / 2 + (i + 0.5) * bay
        k["dark"].box(x - 1.5, D / 2 + 0.17, 0.3 + 2.25, 5.0, 0.06, 4.5)
        k["steel"].box(x - 1.5, D / 2 + 0.22, 0.3 + 4.75, 5.6, 0.12, 0.5)
        k["dark"].box(x + 3.6, D / 2 + 0.17, 0.3 + 1.05, 1.0, 0.06, 2.1)
        k["lamp"].box(x + 1.0, D / 2 + 0.3, 0.3 + 5.4, 0.6, 0.25, 0.2)
    for i in range(10):
        x = -L / 2 + (i + 0.5) * bay
        k["dark"].box(x, -D / 2 + 0.2, 3.3, bay - 1.6, 0.12, 6.0)
        c.box(x, -D / 2, 6.9, bay - 0.8, 0.6, 1.4)
        k["lamp"].box(x, -D / 2 - 0.4, 6.15, bay - 4.0, 0.1, 0.12)
    # The canopy over the front, on brackets from the columns.
    k["roof"].box(0, -D / 2 - 1.8, H + 0.1, L + 0.8, 3.6, 0.25)
    k["accent"].box(0, -D / 2 - 3.6, H + 0.1, L + 0.8, 0.12, 0.6)
    for i in range(11):
        x = -L / 2 + i * bay
        k["steel"].tube((x, -D / 2 - 0.4, H - 1.0), (x, -D / 2 - 3.4, H), 0.08, 4)
    for x in (-60, -20, 20, 60):
        k["panel"].box(x, 3.0, H + 1.9, 4.0, 3.0, 1.8)
    return k


def hospitality():
    """A two-storey hospitality unit: a frame of columns, a glazed ground floor, a panel upper floor with a band of windows and a stripe in the team's colour, a roof terrace with its rail and awning, a stair at its end."""
    k = Kind("hospitality")
    L, D, h = 44.0, 20.0, 4.6
    k["concrete"].box(0, 0, 0.1, L + 2, D + 2, 0.3)
    st = k["steel"]
    for x in [-L / 2 + i * L / 6 for i in range(7)]:
        for y in (-D / 2, D / 2):
            st.box(x, y, h, 0.4, 0.4, 2 * h)
    k["glass"].box(0, -D / 2 + 0.3, h / 2 + 0.2, L - 0.6, 0.1, h - 0.4)
    k["panel"].box(0, 0.3, h / 2 + 0.2, L - 0.6, D - 0.6, h - 0.4)
    k["panel"].box(0, 0, h + h / 2 + 0.2, L, D, h)
    k["glass"].box(0, -D / 2 - 0.03, h + 2.5, L - 4, 0.06, 1.6)
    k["paint"].box(0, -D / 2 - 0.05, 2 * h + 0.05, L + 0.1, 0.12, 0.7)
    k["concrete"].box(0, 0, h + 0.1, L + 0.4, D + 0.4, 0.3)
    k["concrete"].box(0, 0, 2 * h + 0.35, L + 0.4, D + 0.4, 0.3)
    rail(st, [(-L / 2, -D / 2, 2 * h + 0.5), (L / 2, -D / 2, 2 * h + 0.5), (L / 2, D / 2, 2 * h + 0.5), (-L / 2, D / 2, 2 * h + 0.5), (-L / 2, -D / 2, 2 * h + 0.5)], 1.1, 2.0)
    for x in (-15, 0, 15):
        for y in (-6, 6):
            st.tube((x, y, 2 * h + 0.5), (x, y, 2 * h + 3.2), 0.06, 4)
        k["roof"].box(x, 0, 2 * h + 3.3, 10.0, 14.0, 0.12)
    stair(k, L / 2 + 1.0, -D / 2 + 3.0, 2 * h + 0.5, 1.4, "y", 1)
    return k


def truck():
    """A team's truck: its tractor (chassis, cab with windscreen, fuel tanks, wheels) and its box trailer (chassis, box, landing legs, wheels); the front toward -Y."""
    k = Kind("truck")
    st = k["steel"]
    dk = k["dark"]
    p = k["paint"]
    st.box(0, -6.5, 0.9, 1.0, 6.0, 0.3)
    p.box(0, -8.3, 2.3, 2.5, 2.2, 2.6)
    k["glass"].box(0, -9.42, 2.9, 2.2, 0.06, 1.0)
    st.box(0, -9.45, 1.2, 2.5, 0.12, 0.6)
    for sx in (-1, 1):
        st.cyl(sx * 1.05, -6.6, 0.6, 1.3, 0.35, 10)
    st.box(0, -4.6, 1.35, 1.8, 1.4, 0.2)
    for y in (-8.0, -5.0, -4.0):
        for sx in (-1, 1):
            w = Part("dark")
            w.cyl(0, 0, -0.15, 0.15, 0.52, 14)
            w.bm.transform(Matrix.Translation((sx * 1.05, y, 0.52 * math.cos(math.pi / 14))) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
            dk.merge(w)
    # The trailer.
    st.box(0, 2.6, 1.0, 1.1, 13.0, 0.3)
    p.box(0, 2.6, 2.75, 2.5, 13.6, 2.9)
    st.box(0, 2.6, 1.25, 2.5, 13.6, 0.2)
    for sx in (-1, 1):
        st.box(sx * 0.9, -2.5, 0.6, 0.15, 0.15, 1.0)
        st.box(sx * 0.9, -2.5, 0.08, 0.4, 0.4, 0.06)
    for y in (6.0, 7.3, 8.6):
        for sx in (-1, 1):
            w = Part("dark")
            w.cyl(0, 0, -0.2, 0.2, 0.5, 14)
            w.bm.transform(Matrix.Translation((sx * 0.95, y, 0.5 * math.cos(math.pi / 14))) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
            dk.merge(w)
    return k


def canopy():
    """A fuel stop's canopy: columns on footings, the deck with its deep fascia, lights under it; four pump islands under it along the way through, two pumps on each, a bollard at the end of each."""
    k = Kind("canopy")
    L, D, H = 36.0, 22.0, 5.6
    c = k["concrete"]
    c.box(0, 0, 0.05, L + 6, D + 6, 0.1)
    for x in (-12.0, 12.0):
        for y in (-6.0, 6.0):
            c.box(x, y, 0.15, 1.2, 1.2, 0.3)
            k["panel"].box(x, y, H / 2, 0.6, 0.6, H)
    # The deck, its fascia round it, the lights set in its soffit.
    k["panel"].box(0, 0, H + 0.6, L - 0.4, D - 0.4, 1.25)
    k["accent"].box(0, 0, H + 0.7, L + 0.2, D + 0.2, 0.9)
    for x in (-12, 0, 12):
        for y in (-5, 5):
            k["lamp"].box(x, y, H - 0.04, 5.0, 1.6, 0.04)
    # The islands, along the forecourt (the way cars drive through it), the columns standing on them: two pumps on each, a bollard at its open end.
    for y in (-6.0, 6.0):
        for sx in (-1, 1):
            c.box(sx * 7.4, y, 0.2, 10.8, 1.3, 0.3)
            for x in (sx * 4.6, sx * 8.8):
                k["panel"].box(x, y, 1.3, 0.6, 0.8, 1.9)
                for sy in (-1, 1):
                    k["glass"].box(x, y + sy * 0.41, 1.75, 0.4, 0.04, 0.4)
                    k["dark"].tube((x, y + sy * 0.42, 1.5), (x + 0.2, y + sy * 0.6, 0.45), 0.04, 4)
            k["accent"].cyl(sx * 2.4, y, 0.35, 1.25, 0.12, 8)
    return k


def shop():
    """The fuel stop's shop: a slab, ribbed walls, a glazed front with its mullions and door, a flat roof behind a parapet with its coping, plant on the roof."""
    k = Kind("shop")
    L, D, H = 22.0, 10.0, 4.5
    k["concrete"].box(0, 0, 0.1, L + 3, D + 4, 0.2)
    c = k["cladding"]
    for sx in (-1, 1):
        corrugated(c, "y", -D / 2, D / 2, sx * L / 2, 0.2, H, 0.45, 0.06, sx)
    corrugated(c, "x", -L / 2, L / 2, D / 2, 0.2, H, 0.45, 0.06, 1)
    k["panel"].box(0, -D / 2, H - 0.45, L, 0.2, 0.9)
    k["glass"].box(0, -D / 2 + 0.05, (H - 0.9) / 2 + 0.2, L - 0.4, 0.06, H - 1.1)
    for x in [-L / 2 + i * L / 6 for i in range(7)]:
        k["steel"].box(x, -D / 2, (H - 0.9) / 2 + 0.2, 0.12, 0.14, H - 1.1)
    k["dark"].box(3.0, -D / 2 - 0.04, 1.25, 1.8, 0.06, 2.1)
    k["roof"].box(0, 0, H + 0.05, L, D, 0.2)
    for sy in (-1, 1):
        k["panel"].box(0, sy * D / 2, H + 0.45, L + 0.2, 0.2, 0.7)
    for sx in (-1, 1):
        k["panel"].box(sx * L / 2, 0, H + 0.45, 0.2, D + 0.2, 0.7)
    k["steel"].box(4.0, 1.5, H + 0.7, 2.0, 1.4, 1.1)
    k["roof"].box(0, -D / 2 - 1.2, H - 1.0, L, 2.4, 0.15)
    return k


def car():
    """A car: its body with the bonnet and boot lower than the cabin, glazed all round, four wheels; the front toward -Y."""
    k = Kind("car")
    body = [(-0.9, 0.3), (0.9, 0.3), (0.9, 0.95), (-0.9, 0.95)]
    k["paint"].prism("y", -2.2, 2.2, body)
    cab = Part("glass")
    # The cabin, its windscreen raked at the front, the rear window steeper.
    cab.prism("x", -0.82, 0.82, [(-1.3, 0.95), (0.9, 0.95), (0.5, 1.45), (-0.8, 1.45)])
    k["glass"].merge(cab)
    k["paint"].box(0, -0.15, 1.47, 1.5, 1.2, 0.05)
    for y in (-1.4, 1.4):
        for sx in (-1, 1):
            w = Part("dark")
            w.cyl(0, 0, -0.11, 0.11, 0.33, 10)
            # (Its centre as high as its lowest flat stands it on the ground.)
            w.bm.transform(Matrix.Translation((sx * 0.85, y, 0.33 * math.cos(math.pi / 10))) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
            k["dark"].merge(w)
    return k


def flag():
    """A runway marker: a pole in a weighted foot, a flag."""
    k = Kind("flag")
    k["dark"].box(0, 0, 0.1, 0.4, 0.4, 0.2)
    k["dark"].tube((0, 0, 0.2), (0, 0, 1.9), 0.03, 4)
    k["accent"].prism("x", -0.01, 0.01, [(0, 1.3), (0.7, 1.55), (0, 1.85)])
    return k


KINDS = [container, cabin, workshop, crane, tankfarm, mast, helipad, lamp, module, link, radome, hangar, garages, hospitality, truck, canopy, shop, car, flag]


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new("outposts")
    bpy.context.scene.collection.children.link(col)
    roots = []
    for make in KINDS:
        roots.append(emit(make(), col))
    return roots


def preview(path, roots, only=None, view=(-0.55, -1.0, 0.55)):
    """Each kind on its own, from its front three-quarter, framed to fit; the frames tiled into one sheet at `path`."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.color = (0.55, 0.62, 0.72)
    scene.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.clip_end = 2000
    scene.collection.objects.link(cam)
    scene.camera = cam
    ground = bpy.data.objects.new("ground", bpy.data.meshes.new("ground"))
    gbm = bmesh.new()
    bmesh.ops.create_grid(gbm, x_segments=1, y_segments=1, size=400)
    gbm.to_mesh(ground.data)
    gbm.free()
    gmat = bpy.data.materials.new("ground")
    gmat.diffuse_color = (0.42, 0.4, 0.36, 1)
    ground.data.materials.append(gmat)
    scene.collection.objects.link(ground)
    frames = []
    d = Vector(view).normalized()
    for r in roots:
        if only and r.name not in only:
            continue
        for o in roots:
            hide = o is not r
            o.hide_render = hide
            for c in o.children:
                c.hide_render = hide
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for c in r.children:
            for v in c.data.vertices:
                p = c.matrix_world @ v.co
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))
        mid = (lo + hi) / 2
        size = (hi - lo).length
        cam.data.ortho_scale = size * 1.05
        cam.location = mid + d * size * 2
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        out = f"{path[:-4]}.{r.name}.png"
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        frames.append((r.name, out))
    return frames


def main():
    a = args()
    roots = build()
    for r in roots:
        tris = sum(len(p.vertices) - 2 for c in r.children for p in c.data.polygons)
        print(f"  {r.name}: {tris} triangles")
    if a["glb"]:
        bpy.ops.export_scene.gltf(filepath=a["glb"], export_format="GLB", export_yup=True, export_apply=True, export_extras=True, export_texcoords=True, export_normals=True, export_materials="EXPORT")
        print("exported", a["glb"])
    if a["blend"]:
        bpy.ops.wm.save_as_mainfile(filepath=a["blend"])
    if a["preview"]:
        only = a.get("only")
        frames = preview(a["preview"], roots, only.split(",") if only else None)
        try:
            from PIL import Image, ImageDraw

            cols = 4
            rows = (len(frames) + cols - 1) // cols
            sheet = Image.new("RGB", (640 * cols, 480 * rows), (40, 40, 40))
            for i, (name, f) in enumerate(frames):
                im = Image.open(f).convert("RGB")
                ImageDraw.Draw(im).text((8, 8), name, fill=(0, 0, 0))
                sheet.paste(im, ((i % cols) * 640, (i // cols) * 480))
            sheet.save(a["preview"])
        except ImportError:
            pass


main()

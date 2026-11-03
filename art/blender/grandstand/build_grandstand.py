"""A grandstand: one stand of the ones either side of the start straight
(art/blender/grandstand/README.txt). Terraced seating in five blocks between
four aisles, behind a parapet; closed at its ends and back by concrete walls,
a band of hospitality windows along the back; a cantilevered roof on five
columns, its fascia lit along the front.

Run with the bpy module (tools/blender.sh):

    sh tools/blender.sh run art/blender/grandstand/build_grandstand.py -- \
        [--glb src/client/render/grandstand/assets/grandstand.glb] [--preview out.png]

Metres, Blender's axes (Z up). The stand's front (the parapet's face) is on
y = 0 facing -Y (in the exported glTF, +Z), the road's level is z = 0, and it
runs 120 m along x, centred. Its walls go down to z = -14, for circuits whose
ground is below the road.

Each mesh carries one material, named for its slot, which the game paints:
crowd (the seating, with UVs: u along the stand's length 0 to 1, v up its
rows, a row to every 1/16: each row's people on the riser behind it, its
step on the tread, see build()), concrete, roof, steel, accent (the
fascia's band and the parapet's strip), glass and lamp (lit).
"""

import math
import sys

import bpy  # (first: the module brings bmesh and mathutils with it)
import bmesh
from mathutils import Vector

SLOTS = {
    "crowd": (0.45, 0.4, 0.5),
    "concrete": (0.62, 0.63, 0.66),
    "roof": (0.88, 0.9, 0.93),
    "steel": (0.28, 0.31, 0.36),
    "accent": (1.0, 0.45, 0.1),
    "glass": (0.18, 0.3, 0.42),
    "lamp": (1.0, 0.95, 0.8),
}

LENGTH = 120.0
HALF = LENGTH / 2
ROWS = 16
ROW_DEPTH = 1.25
ROW_RISE = 0.9
FIRST_Y = 1.2  # the first row's front, behind the parapet
FIRST_Z = 4.6  # the first row's tread
PARAPET_TOP = 5.6
BACK_Y = FIRST_Y + ROWS * ROW_DEPTH  # 21.2
LAST_Z = FIRST_Z + (ROWS - 1) * ROW_RISE
BACK_TOP = LAST_Z + 3.4
BOTTOM = -14.0
# The ground floor's slab under BOTTOM, its beams' underside, and the lines
# of its beams (and the columns the game stands it on where the ground falls
# away): along x every 16 m, and under the front wall, the middle, the back wall.
SLAB = 0.8
UNDERSIDE = BOTTOM - 2.2
COLUMN_XS = tuple(float(x) for x in range(-56, 57, 16))
COLUMN_YS = (0.6, 11.2, 21.8)
AISLES = (-36.0, -12.0, 12.0, 36.0)
AISLE_HALF = 0.8
ROOF_FRONT_Y = 4.0
ROOF_BACK_Y = BACK_Y + 2.6
ROOF_FRONT_Z = 27.0
ROOF_BACK_Z = 25.6
ROOF_T = 0.7
COLUMNS = (-48.0, -24.0, 0.0, 24.0, 48.0)
# Of each row's span of the crowd's UVs, the step's share (the rest is its people).
STEP = 0.31


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
        bsdf.inputs["Roughness"].default_value = 0.7
        if slot == "lamp":
            bsdf.inputs["Emission Color"].default_value = (*SLOTS[slot], 1.0)
            bsdf.inputs["Emission Strength"].default_value = 3.0
    return m


class Part:
    """One mesh: pieces in a bmesh, one material."""

    def __init__(self, name, slot):
        self.name = name
        self.slot = slot
        self.bm = bmesh.new()
        self.uv = None

    def box(self, x0, x1, y0, y1, z0, z1):
        new = bmesh.ops.create_cube(self.bm, size=1.0)["verts"]
        for v in new:
            v.co = Vector((x0 + (v.co.x + 0.5) * (x1 - x0), y0 + (v.co.y + 0.5) * (y1 - y0), z0 + (v.co.z + 0.5) * (z1 - z0)))
        return self

    def tube(self, a, b, r, segments=8):
        a, b = Vector(a), Vector(b)
        axis = b - a
        if axis.length < 1e-6:
            return self
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        from mathutils import Matrix

        m = Matrix.Translation((a + b) / 2) @ rot
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r, radius2=r, depth=axis.length, matrix=m)
        return self

    def prism(self, x0, x1, profile):
        """A wall of thickness x0..x1 with `profile` (y, z points, counter-clockwise seen from +x) as its face."""
        left = [self.bm.verts.new((x0, y, z)) for y, z in profile]
        right = [self.bm.verts.new((x1, y, z)) for y, z in profile]
        self.bm.faces.new(list(reversed(left)))
        self.bm.faces.new(right)
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((left[i], left[j], right[j], right[i]))
        return self

    def quad(self, corners, uvs=None):
        verts = [self.bm.verts.new(c) for c in corners]
        f = self.bm.faces.new(verts)
        if uvs:
            if self.uv is None:
                self.uv = self.bm.loops.layers.uv.new("UVMap")
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv
        return f

    def build(self, col, recalc=True):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        # (Closed shapes only: an open surface is wound as it was built.)
        if recalc:
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(material(self.slot))
        obj = bpy.data.objects.new(self.name, mesh)
        obj["slot"] = self.slot
        col.objects.link(obj)
        return obj


def row_z(k):
    return FIRST_Z + k * ROW_RISE


def row_y(k):
    return FIRST_Y + k * ROW_DEPTH


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new("grandstand")
    bpy.context.scene.collection.children.link(col)

    # ---- the seating: the rows' treads and risers, in blocks between the aisles
    # Seen from the road it is the risers that show, so a row's people are on
    # the riser behind it (in front of which they sit) and its tread is the
    # step: the UVs run on up the rows unbroken, the people of row k from
    # k to k + 1 - STEP on riser k + 1, then the step from there to k + 1 on
    # tread k + 1 (the first tread, before any row, from -STEP to 0), over ROWS.
    # The last row's people are on a riser up the back wall to the windows.
    crowd = Part("crowd", "crowd")
    edges = [-HALF + 0.8] + [x for a in AISLES for x in (a - AISLE_HALF, a + AISLE_HALF)] + [HALF - 0.8]
    blocks = [(edges[i], edges[i + 1]) for i in range(0, len(edges), 2)]
    u = lambda x: (x + HALF) / LENGTH
    v = lambda c: c / ROWS
    for x0, x1 in blocks:
        for k in range(ROWS + 1):
            y0 = row_y(k) - (0.02 if k == ROWS else 0.0)
            if k > 0:
                z0, z1 = row_z(k - 1), row_z(k)
                a, b = v(k - 1), v(k - STEP)
                crowd.quad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], [(u(x0), a), (u(x1), a), (u(x1), b), (u(x0), b)])
            if k < ROWS:
                y1, z = row_y(k + 1), row_z(k)
                a, b = v(k - STEP), v(k)
                crowd.quad([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [(u(x0), a), (u(x1), a), (u(x1), b), (u(x0), b)])
    crowd.build(col, recalc=False)

    concrete = Part("structure", "concrete")
    # The aisles: stairs of two steps to a row.
    for a in AISLES:
        for k in range(ROWS):
            for half in (0, 1):
                y0 = row_y(k) + half * ROW_DEPTH / 2
                z = row_z(k) - (1 - half) * ROW_RISE / 2
                concrete.box(a - AISLE_HALF, a + AISLE_HALF, y0, y0 + ROW_DEPTH / 2, z - 0.4, z)
    # The parapet along the front, the back wall, and a wall closing each end.
    concrete.box(-HALF, HALF, 0.0, FIRST_Y, BOTTOM, PARAPET_TOP)
    concrete.box(-HALF, HALF, BACK_Y, BACK_Y + 1.2, BOTTOM, BACK_TOP)
    profile = [(0.0, BOTTOM), (BACK_Y + 1.2, BOTTOM), (BACK_Y + 1.2, BACK_TOP + 0.4), (BACK_Y, BACK_TOP + 0.4), (FIRST_Y, PARAPET_TOP + 1.2), (0.0, PARAPET_TOP + 1.2)]
    for sgn in (-1, 1):
        x = sgn * HALF
        concrete.prism(min(x, x + sgn * 1.0), max(x, x + sgn * 1.0), profile)
    # Under the rows: a floor slab to stand them on (the space beneath is closed by the walls).
    for k in range(ROWS):
        concrete.box(-HALF, HALF, row_y(k), row_y(k + 1), row_z(k) - 0.6, row_z(k) - 0.35)
    # Pilasters up the back wall, between the windows.
    for x in range(-56, 57, 8):
        concrete.box(x - 0.5, x + 0.5, BACK_Y + 1.2, BACK_Y + 1.6, BOTTOM, BACK_TOP)
    # Its ground floor, at the walls' foot: a slab under the whole stand on a
    # grid of beams, under the front wall, the middle and the back wall, and
    # across them every 16 m. On the ground it is its foundation; where the
    # ground falls away (a raised road, over the sea), the game stands it on
    # columns under the beams' crossings (UNDERSIDE, COLUMN_XS, COLUMN_YS).
    concrete.box(-HALF - 1.0, HALF + 1.0, 0.0, BACK_Y + 1.6, BOTTOM - SLAB, BOTTOM)
    for y in COLUMN_YS:
        concrete.box(-HALF - 1.0, HALF + 1.0, y - 0.6, y + 0.6, UNDERSIDE, BOTTOM - SLAB)
    for x in COLUMN_XS:
        concrete.box(x - 0.6, x + 0.6, 0.0, BACK_Y + 1.6, UNDERSIDE, BOTTOM - SLAB)
    concrete.build(col)

    # The hospitality boxes' windows along the back, above the last row.
    glass = Part("windows", "glass")
    glass.box(-HALF + 1, HALF - 1, BACK_Y - 0.05, BACK_Y + 0.05, LAST_Z + 0.9, BACK_TOP - 0.5)
    glass.box(-HALF + 1, HALF - 1, BACK_Y + 1.15, BACK_Y + 1.25, 2.0, 8.0)
    glass.build(col)

    # The parapet's strip, and the roof's fascia, in the circuit's colour.
    accent = Part("accent", "accent")
    accent.box(-HALF, HALF, -0.06, 0.02, PARAPET_TOP - 1.0, PARAPET_TOP - 0.35)

    # ---- the roof: a slab out over the rows, on cantilevered beams from five columns
    roof = Part("roof", "roof")
    rz = lambda y: ROOF_BACK_Z + (ROOF_FRONT_Z - ROOF_BACK_Z) * (ROOF_BACK_Y - y) / (ROOF_BACK_Y - ROOF_FRONT_Y)
    for z_off in (0.0,):
        bm = roof.bm
        top = [
            bm.verts.new((-HALF - 1, ROOF_FRONT_Y, ROOF_FRONT_Z + z_off)),
            bm.verts.new((HALF + 1, ROOF_FRONT_Y, ROOF_FRONT_Z + z_off)),
            bm.verts.new((HALF + 1, ROOF_BACK_Y, ROOF_BACK_Z + z_off)),
            bm.verts.new((-HALF - 1, ROOF_BACK_Y, ROOF_BACK_Z + z_off)),
        ]
        bot = [bm.verts.new((v.co.x, v.co.y, v.co.z - ROOF_T)) for v in top]
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((top[i], bot[i], bot[j], top[j]))
    roof.build(col)
    accent.box(-HALF - 1.05, HALF + 1.05, ROOF_FRONT_Y - 0.12, ROOF_FRONT_Y, ROOF_FRONT_Z - ROOF_T - 0.5, ROOF_FRONT_Z + 0.15)
    accent.build(col)

    steel = Part("steel", "steel")
    lamps = Part("lamps", "lamp")
    for x in COLUMNS:
        # A column up the back, and a tapered beam from its head out over the roof.
        head = Vector((x, BACK_Y + 0.6, ROOF_BACK_Z + 6.5))
        steel.box(x - 0.6, x + 0.6, BACK_Y + 0.0, BACK_Y + 1.2, BACK_TOP, head.z + 0.6)
        tip = Vector((x, ROOF_FRONT_Y + 0.6, ROOF_FRONT_Z + 0.4))
        for dz, r in ((0.0, 0.42), (-1.4, 0.3)):
            steel.tube((head.x, head.y, head.z + dz), (tip.x, tip.y, tip.z + dz * 0.25), r, 8)
        # Ties down from the beam to the roof.
        for t in (0.35, 0.7):
            p = head.lerp(tip, t)
            steel.tube((p.x, p.y, p.z - 0.2), (p.x, p.y, rz(p.y) + 0.05), 0.12, 6)
    # Floodlights under the roof's front edge, and a rail along the parapet.
    for i in range(15):
        x = -HALF + 4 + i * 8
        steel.box(x - 0.9, x + 0.9, ROOF_FRONT_Y + 0.4, ROOF_FRONT_Y + 1.1, ROOF_FRONT_Z - ROOF_T - 0.6, ROOF_FRONT_Z - ROOF_T)
        lamps.box(x - 0.75, x + 0.75, ROOF_FRONT_Y + 0.35, ROOF_FRONT_Y + 0.42, ROOF_FRONT_Z - ROOF_T - 0.52, ROOF_FRONT_Z - ROOF_T - 0.08)
    steel.tube((-HALF, 0.6, PARAPET_TOP + 1.0), (HALF, 0.6, PARAPET_TOP + 1.0), 0.06, 6)
    for x in range(-58, 59, 4):
        steel.tube((x, 0.6, PARAPET_TOP), (x, 0.6, PARAPET_TOP + 1.0), 0.04, 4)
    # Rails up each aisle.
    for a in AISLES:
        for s in (-1, 1):
            xa = a + s * (AISLE_HALF - 0.05)
            steel.tube((xa, row_y(0), row_z(0) + 1.0), (xa, row_y(ROWS - 1), row_z(ROWS - 1) + 1.0), 0.05, 4)
    steel.build(col)
    lamps.build(col)
    return col


def preview(path, at=(-55, -48, 10), target=(10, 10, 12)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    world = bpy.data.worlds.new("w")
    world.color = (0.55, 0.62, 0.72)
    scene.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 24
    scene.collection.objects.link(cam)
    target = Vector(target)
    cam.location = Vector(at)
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    a = args()
    build()
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
    print(f"grandstand: {len([o for o in bpy.data.objects if o.type == 'MESH'])} meshes, {tris} triangles")
    if a["glb"]:
        bpy.ops.export_scene.gltf(filepath=a["glb"], export_format="GLB", export_yup=True, export_apply=True, export_extras=True, export_texcoords=True, export_normals=True, export_materials="EXPORT")
        print("exported", a["glb"])
    if a["blend"]:
        bpy.ops.wm.save_as_mainfile(filepath=a["blend"])
    if a["preview"]:
        preview(a["preview"])
        # From behind and above one end, too.
        preview(a["preview"].replace(".png", "-back.png"), (95, 75, 55), (0, 10, 10))
        preview(a["preview"].replace(".png", "-front.png"), (-20, -42, 6), (0, 10, 13))


main()

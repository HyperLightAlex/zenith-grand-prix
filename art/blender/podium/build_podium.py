"""The podium set: three tiers on a stage, a backdrop of screens behind them,
and a lighting truss over it on two towers (art/blender/podium/README.txt).

Run with the bpy module (tools/blender.sh):

    sh tools/blender.sh run art/blender/podium/build_podium.py -- \
        [--layout pilots|teams] \
        [--glb src/client/render/podium/assets/podium.glb] [--blend out.blend] [--preview out.png]

(--layout teams builds the teams' podium, podium-teams.glb.)

Built from code so it can be built again exactly: every piece is a box, a
plane or a tube. Metres, Blender's axes (Z up); the front faces -Y, so in the
exported glTF (Y up) it faces +Z. The ground the stage stands on is z = 0,
the middle of the front edge of the winner's tier is x = 0.

Each mesh is named for what it is and carries one material, named for its
slot; the game paints the slots (render/podium/podium.ts). The planes the
game draws on (the numerals, the screens) are named for which they are and
have their UVs 0 to 1 across their faces, seen from the front.
"""

import math
import sys

import bpy  # (first: the module brings bmesh and mathutils with it)
import bmesh
from mathutils import Matrix, Vector

# Each slot's colour here is only for the preview and the .blend: the game
# paints them its own way.
SLOTS = {
    "stage": (0.13, 0.15, 0.2),  # the stage and the tiers' sides: dark slate
    "top": (0.86, 0.88, 0.9),  # the tiers' tops: pale
    "gold": (0.95, 0.72, 0.2),
    "silver": (0.75, 0.78, 0.84),
    "bronze": (0.72, 0.45, 0.26),
    "led": (0.2, 0.95, 1.0),  # light strips: the winners' colour in the game
    "frame": (0.2, 0.22, 0.28),  # the backdrop's frames
    "screen": (0.05, 0.07, 0.12),  # drawn on by the game
    "numeral": (0.95, 0.95, 0.95),  # drawn on by the game
    "truss": (0.62, 0.65, 0.7),
    "lamp": (1.0, 0.93, 0.7),  # the spotlights' lenses
    "metal": (0.35, 0.37, 0.42),
}

# Sized for the mechs: 8.7 to 8.8 m tall, up to 8 m across (a Defender).
STAGE_TOP = 0.8
TIER_BACK = 5.0
# Two layouts. The pilots' podium: a mech to a tier (a Sprint's first three,
# a team's three). The teams' podium (a Grand Prix's first three factions):
# a team to a tier, three abreast, its leader in front, the other two a step
# behind either side; the set as much wider as it needs, the same height.
#   tiers: x from, x to, height above the stage, the front's y, the trim's slot
#   stage: its half width; steps: the front steps' half width
#   back: the backdrop's centre panel's half width; side: a side panel's
#   width and how far it is swung forward (degrees)
#   tower: the truss's towers' x; lamps: the spotlights' x; cannons: the pyro
#   cannons' x
LAYOUTS = {
    "pilots": dict(
        tiers={1: (-6.5, 6.5, 4.6, -6.0, "gold"), 2: (-19.5, -7.0, 3.4, -5.5, "silver"), 3: (7.0, 19.5, 2.4, -5.5, "bronze")},
        stage=24.0,
        steps=6.0,
        back=14.0,
        side=(13.0, 24),
        tower=29.0,
        lamps=(-18, -11, -4, 4, 11, 18),
        cannons=22.5,
    ),
    "teams": dict(
        tiers={1: (-12.0, 12.0, 4.6, -6.5, "gold"), 2: (-37.5, -13.0, 3.4, -6.0, "silver"), 3: (13.0, 37.5, 2.4, -6.0, "bronze")},
        stage=41.0,
        steps=10.0,
        back=18.0,
        side=(15.0, 16),
        tower=46.0,
        lamps=(-32, -22, -8, 8, 22, 32),
        cannons=39.5,
    ),
}
L = LAYOUTS["pilots"]
TIERS = L["tiers"]
# The backdrop's centre panel: half its width (the layout's), its front's y, its top.
BACK_HALF = L["back"]
BACK_Y = 10.0
BACK_TOP = 21.0
# The truss: its top, and the towers' x.
TRUSS_TOP = 23.5
TOWER_X = L["tower"]


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = {"glb": None, "blend": None, "preview": None, "layout": "pilots"}
    i = 0
    while i < len(argv):
        key = argv[i].lstrip("-")
        out[key] = argv[i + 1]
        i += 2
    return out


def material(slot):
    m = bpy.data.materials.get(slot) or bpy.data.materials.new(slot)
    m.diffuse_color = (*SLOTS[slot], 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*SLOTS[slot], 1.0)
        bsdf.inputs["Roughness"].default_value = 0.6
        if slot in ("led", "lamp"):
            bsdf.inputs["Emission Color"].default_value = (*SLOTS[slot], 1.0)
            bsdf.inputs["Emission Strength"].default_value = 2.0
    return m


class Part:
    """One mesh of the set: its pieces gathered in one bmesh, one material."""

    def __init__(self, name, slot):
        self.name = name
        self.slot = slot
        self.bm = bmesh.new()

    def box(self, x0, x1, y0, y1, z0, z1, bevel=0.0):
        new = bmesh.ops.create_cube(self.bm, size=1.0)["verts"]
        for v in new:
            v.co = Vector(
                (
                    x0 + (v.co.x + 0.5) * (x1 - x0),
                    y0 + (v.co.y + 0.5) * (y1 - y0),
                    z0 + (v.co.z + 0.5) * (z1 - z0),
                )
            )
        if bevel > 0:
            edges = list({e for v in new for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=2, affect="EDGES", profile=0.5)
        return self

    def turned_box(self, cx, cy, w, d, z0, z1, angle, bevel=0.0):
        """A box w wide and d deep round (cx, cy), turned about z by angle."""
        before = set(self.bm.verts)
        self.box(-w / 2, w / 2, -d / 2, d / 2, z0, z1, bevel)
        rot = Matrix.Rotation(angle, 3, "Z")
        for v in self.bm.verts:
            if v in before:
                continue
            p = rot @ Vector((v.co.x, v.co.y, 0.0))
            v.co.x, v.co.y = p.x + cx, p.y + cy
        return self

    def tube(self, a, b, r, segments=8):
        a, b = Vector(a), Vector(b)
        axis = b - a
        length = axis.length
        if length < 1e-6:
            return self
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation((a + b) / 2) @ rot
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r, radius2=r, depth=length, matrix=m)
        return self

    def build(self, collection):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(material(self.slot))
        for poly in mesh.polygons:
            poly.use_smooth = False
        obj = bpy.data.objects.new(self.name, mesh)
        obj["slot"] = self.slot
        collection.objects.link(obj)
        return obj


def plane(collection, name, slot, corners):
    """A quad the game draws on: corners bottom left, bottom right, top right, top left (seen from the front)."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([Vector(c) for c in corners], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name="UVMap")
    for loop, co in zip(mesh.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop.index].uv = co
    mesh.materials.append(material(slot))
    obj = bpy.data.objects.new(name, mesh)
    obj["slot"] = slot
    collection.objects.link(obj)
    return obj


def front_plane(collection, name, slot, x0, x1, y, z0, z1):
    return plane(collection, name, slot, [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)])


def truss_beam(part, a, b, size, step):
    """A square truss from a to b (along one axis): four chords and zigzag braces on each face."""
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    # Two directions across the beam.
    u = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    v = axis.cross(u).normalized()
    u = v.cross(axis).normalized()
    h = size / 2
    corners = [u * h + v * h, u * h - v * h, -u * h - v * h, -u * h + v * h]
    for c in corners:
        part.tube(a + c, b + c, 0.09)
    length = (b - a).length
    n = max(1, round(length / step))
    for i in range(n):
        p0 = a + axis * (length * i / n)
        p1 = a + axis * (length * (i + 1) / n)
        for k in range(4):
            c0, c1 = corners[k], corners[(k + 1) % 4]
            if i % 2 == 0:
                part.tube(p0 + c0, p1 + c1, 0.05, 6)
            else:
                part.tube(p0 + c1, p1 + c0, 0.05, 6)
        # A ring at each end of a bay.
        for k in range(4):
            part.tube(p0 + corners[k], p0 + corners[(k + 1) % 4], 0.05, 6)
    for k in range(4):
        part.tube(b + corners[k], b + corners[(k + 1) % 4], 0.05, 6)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new("podium")
    bpy.context.scene.collection.children.link(col)

    # ---- the stage, its front steps and its light strip
    stage = Part("stage", "stage")
    half = L["stage"]
    stage.box(-half, half, -8.5, 11.5, 0, STAGE_TOP, bevel=0.12)
    for y0, z1 in ((-10.9, 0.27), (-10.1, 0.54)):
        stage.box(-L["steps"], L["steps"], y0, -8.4, 0, z1, bevel=0.04)
    stage.build(col)
    led = Part("led", "led")
    led.box(-half + 0.2, half - 0.2, -8.56, -8.48, 0.36, 0.5)

    # ---- the tiers: a block each, a pale top over it with its trim in gold,
    # silver or bronze, the numeral's panel set into its front, and a light
    # strip up each front corner.
    tiers = Part("tiers", "stage")
    tops = Part("tops", "top")
    trims = {s: Part(f"trim_{s}", s) for s in ("gold", "silver", "bronze")}
    for n, (x0, x1, h, y0, trim) in TIERS.items():
        z1 = STAGE_TOP + h
        tiers.box(x0, x1, y0, TIER_BACK, STAGE_TOP, z1 - 0.3, bevel=0.1)
        tops.box(x0 - 0.15, x1 + 0.15, y0 - 0.15, TIER_BACK + 0.15, z1 - 0.3, z1, bevel=0.06)
        trims[trim].box(x0 - 0.05, x1 + 0.05, y0 - 0.12, y0 + 0.4, z1 - 0.62, z1 - 0.32, bevel=0.03)
        for x in (x0 + 0.35, x1 - 0.35):
            led.box(x - 0.08, x + 0.08, y0 - 0.06, y0 + 0.02, STAGE_TOP + 0.2, z1 - 0.75)
        # The numeral's panel: a frame round a recess, the plane the game draws on inside it.
        w = min(5.0, (x1 - x0) * 0.4)
        cx = (x0 + x1) / 2
        zb, zt = STAGE_TOP + 0.25, z1 - 0.72
        frame = Part(f"numeral_frame_{n}", "frame")
        frame.box(cx - w / 2 - 0.18, cx + w / 2 + 0.18, y0 - 0.08, y0 + 0.05, zb - 0.18, zt + 0.18, bevel=0.03)
        frame.build(col)
        front_plane(col, f"numeral_{n}", "numeral", cx - w / 2, cx + w / 2, y0 - 0.1, zb, zt)
    tiers.build(col)
    tops.build(col)
    for t in trims.values():
        t.build(col)

    # ---- the backdrop: a wide panel behind the tiers and one either side,
    # turned to face in, each framed round a screen.
    frame = Part("backdrop", "frame")
    frame.box(-BACK_HALF, BACK_HALF, BACK_Y, BACK_Y + 0.8, STAGE_TOP, BACK_TOP, bevel=0.15)
    front_plane(col, "screen_center", "screen", -BACK_HALF + 1, BACK_HALF - 1, BACK_Y - 0.05, 6.4, BACK_TOP - 0.9)
    led.box(-BACK_HALF, BACK_HALF, BACK_Y - 0.08, BACK_Y, BACK_TOP - 0.45, BACK_TOP - 0.25)
    led.box(-BACK_HALF, BACK_HALF, BACK_Y - 0.08, BACK_Y, 5.85, 6.05)
    side = L["side"][0]
    turn = math.radians(L["side"][1])
    for sgn, name in ((-1, "screen_left"), (1, "screen_right")):
        # Hinged at the centre panel's edge, swung forward.
        hx, hy = sgn * BACK_HALF, BACK_Y
        cx = hx + sgn * (side / 2) * math.cos(turn)
        cy = hy - (side / 2) * math.sin(turn)
        angle = -sgn * turn
        # Its front face through (cx, cy): the box set back half its depth.
        frame.turned_box(cx - 0.4 * math.sin(angle), cy + 0.4 * math.cos(angle), side, 0.8, STAGE_TOP, BACK_TOP - 4, angle, bevel=0.15)
        # Its screen, on its front.
        ux, uy = math.cos(angle), math.sin(angle)  # along the panel
        nx, ny = math.sin(angle), -math.cos(angle)  # out of its front
        fx, fy = cx + nx * 0.05, cy + ny * 0.05
        half = side / 2 - 0.9
        x_l, y_l = fx - ux * half, fy - uy * half
        x_r, y_r = fx + ux * half, fy + uy * half
        plane(col, name, "screen", [(x_l, y_l, 5.0), (x_r, y_r, 5.0), (x_r, y_r, BACK_TOP - 4.8), (x_l, y_l, BACK_TOP - 4.8)])
    frame.build(col)

    # ---- the truss over the tiers on two towers, and its spotlights
    truss = Part("truss", "truss")
    tyc = 3.8
    top_z = TRUSS_TOP
    truss_beam(truss, (-TOWER_X, tyc, top_z), (TOWER_X, tyc, top_z), 1.3, 1.6)
    for x in (-TOWER_X, TOWER_X):
        truss_beam(truss, (x, tyc, 0.3), (x, tyc, top_z - 0.65), 1.3, 1.6)
    truss.build(col)
    metal = Part("metal", "metal")
    lamps = Part("lamps", "lamp")
    # The towers' feet: a plate each, on the stage or the ground beside it.
    for x in (-TOWER_X, TOWER_X):
        metal.box(x - 1.3, x + 1.3, tyc - 1.3, tyc + 1.3, 0, 0.3, bevel=0.05)
    for x in L["lamps"]:
        # A can hung under the truss, aimed down at the tiers.
        hang = Vector((x, tyc - 0.3, top_z - 0.65))
        aim = (Vector((x * 0.7, -4.0, STAGE_TOP + 6)) - hang).normalized()
        metal.tube(hang, hang + Vector((0, 0, -0.5)), 0.08, 6)
        body0 = hang + Vector((0, 0, -0.6))
        metal.tube(body0, body0 + aim * 1.1, 0.42, 12)
        lamps.tube(body0 + aim * 1.1, body0 + aim * 1.16, 0.36, 12)
    # The pyro cannons at the stage's corners.
    for x in (-L["cannons"], L["cannons"]):
        for y in (-7.0, 9.5):
            metal.tube((x, y, STAGE_TOP), (x, y, STAGE_TOP + 1.0), 0.5, 12)
            led.tube((x, y, STAGE_TOP + 1.0), (x, y, STAGE_TOP + 1.08), 0.42, 12)
    metal.build(col)
    lamps.build(col)
    led.build(col)
    return col


def preview(path):
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
    cam.data.lens = 28
    scene.collection.objects.link(cam)
    target = Vector((0, 2, 8))
    k = L["stage"] / 24.0
    cam.location = Vector((-22 * k, -52 * k, 12 * k))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    global L, TIERS, BACK_HALF, TOWER_X
    a = args()
    L = LAYOUTS[a["layout"]]
    TIERS, BACK_HALF, TOWER_X = L["tiers"], L["back"], L["tower"]
    build()
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
    print(f"podium: {len([o for o in bpy.data.objects if o.type == 'MESH'])} meshes, {tris} triangles")
    if a["glb"]:
        bpy.ops.export_scene.gltf(
            filepath=a["glb"],
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_extras=True,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
        )
        print("exported", a["glb"])
    if a["blend"]:
        bpy.ops.wm.save_as_mainfile(filepath=a["blend"])
    if a["preview"]:
        preview(a["preview"])


main()

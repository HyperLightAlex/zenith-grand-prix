"""A hover screen: one of the big screens held up over the grandstands by
the start, showing the race to the crowd (art/blender/hoverscreen/README.txt).
A 16:9 screen in a deep bezel, its housing behind it; held up by two lift
nacelles at its sides, each ringed by two glowing lift rings with an
emitter under it, and a keel along its foot with three more emitters; a
spine along its top with aerials and lamps.

Run with the bpy module (tools/blender.sh):

    sh tools/blender.sh run art/blender/hoverscreen/build_hoverscreen.py -- \
        [--glb src/client/render/screens/assets/hoverscreen.glb] [--preview out.png]

Metres, Blender's axes (Z up). The screen's middle is the origin, its face
toward -Y (in the exported glTF, +Z), 32 m across and 18 m high.

Each mesh carries one material, named for its slot, which the game paints:
screen (the picture, UVs 0 to 1 across its face as seen from the front, v
up), frame, trim (the circuit's orange), glow (the lift rings and the
emitters, lit in the game's lift colour), lamp (the aerials' lamps), beam
(the lift's glow down from each emitter: open cones, v 0 at the emitter to
1 at its end, which the game fades out).
"""

import math
import sys

import bpy  # (first: the module brings bmesh and mathutils with it)
import bmesh
from mathutils import Matrix, Vector

SLOTS = {
    "screen": (0.05, 0.08, 0.12),
    "frame": (0.2, 0.23, 0.28),
    "trim": (1.0, 0.45, 0.1),
    "glow": (0.3, 0.95, 1.0),
    "lamp": (1.0, 0.25, 0.2),
    "beam": (0.3, 0.95, 1.0),
}

W = 32.0
H = 18.0
BEZEL = 0.9
NACELLE_X = W / 2 + BEZEL + 2.6
NACELLE_R = 1.6
NACELLE_Z = (-7.5, 7.0)
KEEL_Z = -H / 2 - BEZEL
EMITTERS = (-9.0, 0.0, 9.0)
BEAM = 9.0


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
        bsdf.inputs["Roughness"].default_value = 0.5
        if slot in ("glow", "lamp", "beam"):
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

    def cylinder(self, centre, r, depth, axis="Z", segments=16, r2=None):
        rot = {"Z": Matrix.Identity(4), "X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
        m = Matrix.Translation(Vector(centre)) @ rot
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r, radius2=r if r2 is None else r2, depth=depth, matrix=m)
        return self

    def sphere(self, centre, r, segments=16, rings=8):
        bmesh.ops.create_uvsphere(self.bm, u_segments=segments, v_segments=rings, radius=r, matrix=Matrix.Translation(Vector(centre)))
        return self

    def torus(self, centre, major, minor, segments=24, sides=8):
        verts = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring = []
            for j in range(sides):
                b = 2 * math.pi * j / sides
                rr = major + minor * math.cos(b)
                ring.append(self.bm.verts.new((centre[0] + rr * math.cos(a), centre[1] + rr * math.sin(a), centre[2] + minor * math.sin(b))))
            verts.append(ring)
        for i in range(segments):
            for j in range(sides):
                a, b = verts[i][j], verts[(i + 1) % segments][j]
                c, d = verts[(i + 1) % segments][(j + 1) % sides], verts[i][(j + 1) % sides]
                self.bm.faces.new((a, b, c, d))
        return self

    def cone(self, top, r0, r1, length, segments=16):
        """An open cone down from `top` (its v 0 there, 1 at its foot)."""
        if self.uv is None:
            self.uv = self.bm.loops.layers.uv.new("UVMap")
        a = [self.bm.verts.new((top[0] + r0 * math.cos(2 * math.pi * i / segments), top[1] + r0 * math.sin(2 * math.pi * i / segments), top[2])) for i in range(segments)]
        b = [self.bm.verts.new((top[0] + r1 * math.cos(2 * math.pi * i / segments), top[1] + r1 * math.sin(2 * math.pi * i / segments), top[2] - length)) for i in range(segments)]
        for i in range(segments):
            j = (i + 1) % segments
            f = self.bm.faces.new((a[i], b[i], b[j], a[j]))
            for loop, uv in zip(f.loops, ((i / segments, 0), (i / segments, 1), ((i + 1) / segments, 1), ((i + 1) / segments, 0))):
                loop[self.uv].uv = uv
        return self

    def build(self, col, recalc=True):
        mesh = bpy.data.meshes.new(self.name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        if recalc:
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(material(self.slot))
        for p in mesh.polygons:
            p.use_smooth = self.slot in ("glow",)
        obj = bpy.data.objects.new(self.name, mesh)
        obj["slot"] = self.slot
        col.objects.link(obj)
        return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new("hoverscreen")
    bpy.context.scene.collection.children.link(col)

    # ---- the picture: one quad, set a little back in the bezel
    screen = Part("screen", "screen")
    bm = screen.bm
    screen.uv = bm.loops.layers.uv.new("UVMap")
    corners = [(-W / 2, 0.0, -H / 2), (W / 2, 0.0, -H / 2), (W / 2, 0.0, H / 2), (-W / 2, 0.0, H / 2)]
    # (Anticlockwise seen from the front: facing -Y.)
    f = bm.faces.new([bm.verts.new(c) for c in corners])
    for loop in f.loops:
        x, _, z = loop.vert.co
        loop[screen.uv].uv = ((x + W / 2) / W, (z + H / 2) / H)
    screen.build(col, recalc=False)

    frame = Part("frame", "frame")
    # The bezel round it, standing proud of the picture, and the housing behind.
    bx, bz = W / 2 + BEZEL, H / 2 + BEZEL
    frame.box(-bx, bx, -0.5, 1.4, H / 2, bz)
    frame.box(-bx, bx, -0.5, 1.4, -bz, -H / 2)
    frame.box(-bx, -W / 2, -0.5, 1.4, -H / 2, H / 2)
    frame.box(W / 2, bx, -0.5, 1.4, -H / 2, H / 2)
    frame.box(-W / 2, W / 2, 0.02, 1.4, -H / 2, H / 2)
    frame.box(-W / 2 + 1.5, W / 2 - 1.5, 1.4, 3.6, -H / 2 + 1.5, H / 2 - 1.5)
    # Ribs across the housing's back.
    for z in (-5.0, 0.0, 5.0):
        frame.box(-W / 2 + 1.0, W / 2 - 1.0, 3.6, 4.0, z - 0.4, z + 0.4)
    # The spine along the top, with its aerials.
    frame.box(-W / 2 + 2, W / 2 - 2, 0.2, 2.8, bz, bz + 1.1)
    for x in (-12.0, 12.0):
        frame.cylinder((x, 1.5, bz + 1.1 + 1.6), 0.12, 3.2, segments=6)
    # The keel along the foot, its emitters' housings under it.
    frame.box(-12.5, 12.5, 0.0, 2.6, KEEL_Z - 1.2, KEEL_Z)
    for x in EMITTERS:
        frame.cylinder((x, 1.3, KEEL_Z - 1.2 - 0.3), 1.35, 0.6, segments=20)
    # The nacelles: a capsule each side on two struts, its emitter's housing at its foot.
    for sgn in (-1, 1):
        x = sgn * NACELLE_X
        z0, z1 = NACELLE_Z
        frame.cylinder((x, 1.0, (z0 + z1) / 2), NACELLE_R, z1 - z0, segments=20)
        frame.sphere((x, 1.0, z1), NACELLE_R, segments=20, rings=10)
        frame.cylinder((x, 1.0, z0 - 0.5), NACELLE_R * 1.05, 1.0, segments=20, r2=NACELLE_R * 0.8)
        for z in (-4.0, 4.5):
            frame.box(min(sgn * bx, x - sgn * NACELLE_R * 0.6), max(sgn * bx, x - sgn * NACELLE_R * 0.6), 0.4, 1.6, z - 0.6, z + 0.6)
    frame.build(col)

    # A band of the circuit's colour under the picture, and down the nacelles.
    trim = Part("trim", "trim")
    trim.box(-bx, bx, -0.56, -0.48, -bz, -bz + 0.35)
    trim.box(-W / 2 + 2, W / 2 - 2, 0.12, 0.2, bz + 0.3, bz + 0.8)
    for sgn in (-1, 1):
        x = sgn * NACELLE_X
        trim.cylinder((x, 1.0, 1.0), NACELLE_R + 0.03, 0.6, segments=20)
    trim.build(col)

    # The lift: two rings round each nacelle, and the emitters' faces.
    glow = Part("lift", "glow")
    for sgn in (-1, 1):
        x = sgn * NACELLE_X
        for z in (-3.6, 4.4):
            glow.torus((x, 1.0, z), NACELLE_R + 0.75, 0.32)
        glow.cylinder((x, 1.0, NACELLE_Z[0] - 1.05), NACELLE_R * 0.75, 0.12, segments=20)
    for x in EMITTERS:
        glow.cylinder((x, 1.3, KEEL_Z - 1.85), 1.05, 0.12, segments=20)
    glow.build(col)

    lamps = Part("lamps", "lamp")
    for x in (-12.0, 12.0):
        lamps.sphere((x, 1.5, bz + 1.1 + 3.3), 0.3, segments=8, rings=4)
    for sgn in (-1, 1):
        lamps.sphere((sgn * NACELLE_X, 1.0, NACELLE_Z[1] + NACELLE_R + 0.15), 0.28, segments=8, rings=4)
    lamps.build(col)

    # The lift's glow down from each emitter.
    beam = Part("beams", "beam")
    for sgn in (-1, 1):
        beam.cone((sgn * NACELLE_X, 1.0, NACELLE_Z[0] - 1.12), NACELLE_R * 0.75, NACELLE_R * 1.6, BEAM)
    for x in EMITTERS:
        beam.cone((x, 1.3, KEEL_Z - 1.92), 1.05, 2.4, BEAM * 0.8)
    beam.build(col, recalc=False)
    return col


def preview(path, at=(-30, -48, -6), target=(0, 0, -2)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    world = bpy.data.worlds.get("w") or bpy.data.worlds.new("w")
    world.color = (0.55, 0.62, 0.72)
    scene.world = world
    cam = bpy.data.objects.get("cam")
    if cam is None:
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
    print(f"hoverscreen: {len([o for o in bpy.data.objects if o.type == 'MESH'])} meshes, {tris} triangles")
    if a["glb"]:
        bpy.ops.export_scene.gltf(filepath=a["glb"], export_format="GLB", export_yup=True, export_apply=True, export_extras=True, export_texcoords=True, export_normals=True, export_materials="EXPORT")
        print("exported", a["glb"])
    if a["blend"]:
        bpy.ops.wm.save_as_mainfile(filepath=a["blend"])
    if a["preview"]:
        preview(a["preview"])
        # From behind and above.
        preview(a["preview"].replace(".png", "-back.png"), (40, 45, 25), (0, 0, 0))


main()

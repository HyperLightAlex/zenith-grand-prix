"""The Grand Prix trophy: the cup presented on the podium at an event's end
(a cup's, the Grand Tour's, a season's Zenith Cup), set on the winners'
step in front of their leader (art/blender/trophy/README.txt).

Run with the bpy module (tools/blender.sh):

    sh tools/blender.sh run art/blender/trophy/build_trophy.py -- \\
        [--glb src/client/render/podium/assets/trophy.glb] [--preview out.png]

Sized for the mechs (8.7 m tall): 3.4 m to the top of its ring. Metres,
Blender's axes (Z up), standing on z = 0 at the origin, its front toward -Y.
Each mesh one material, named for its slot, which the game paints: gold, base
(its plinth), glow (the light in its ring, the winners' colour).

A plinth (an octagon, banded in gold); a foot, a stem with a knop, a bowl
turned on a lathe with a lip; two handles; and over the bowl, held up on
two arms, a ring standing on edge, the Zenith Ring's, lit inside.
"""

import math
import sys

import bpy  # (first: the module brings bmesh and mathutils with it)
import bmesh
from mathutils import Matrix, Vector

SLOTS = {"gold": (0.95, 0.72, 0.2), "base": (0.12, 0.13, 0.18), "glow": (0.3, 0.95, 1.0)}


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = {"glb": None, "preview": None}
    for i in range(0, len(argv) - 1, 2):
        out[argv[i].lstrip("-")] = argv[i + 1]
    return out


def material(slot):
    m = bpy.data.materials.get(slot) or bpy.data.materials.new(slot)
    m.diffuse_color = (*SLOTS[slot], 1.0)
    return m


def lathe(bm, profile, segments=40):
    """Turn a profile (radius, height pairs, bottom to top) round z: a solid of revolution, closed top and bottom."""
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * k / segments), r * math.sin(2 * math.pi * k / segments), z)) for k in range(segments)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            j = (k + 1) % segments
            f = bm.faces.new((a[k], a[j], b[j], b[k]))
            f.smooth = True
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def torus(bm, centre, major, minor, axis="y", seg=40, ring=10, arc=(0.0, 2 * math.pi), caps=False):
    """A torus (or an arc of one) round `centre`, its ring in the plane across `axis`."""
    cx, cy, cz = centre
    a0, a1 = arc
    full = abs(a1 - a0) >= 2 * math.pi - 1e-6
    n = seg if full else seg + 1
    loops = []
    for i in range(n):
        u = a0 + (a1 - a0) * i / seg
        loop = []
        for j in range(ring):
            v = 2 * math.pi * j / ring
            rr = major + minor * math.cos(v)
            w = minor * math.sin(v)
            if axis == "y":
                p = (cx + rr * math.cos(u), cy + w, cz + rr * math.sin(u))
            else:
                p = (cx + w, cy + rr * math.cos(u), cz + rr * math.sin(u))
            loop.append(bm.verts.new(p))
        loops.append(loop)
    pairs = list(zip(loops, loops[1:])) + ([(loops[-1], loops[0])] if full else [])
    for a, b in pairs:
        for j in range(ring):
            k = (j + 1) % ring
            f = bm.faces.new((a[j], b[j], b[k], a[k]))
            f.smooth = True
    if caps and not full:
        bm.faces.new(loops[0])
        bm.faces.new(list(reversed(loops[-1])))


def emit(col, name, slot, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material(slot))
    obj = bpy.data.objects.new(name, mesh)
    obj["slot"] = slot
    col.objects.link(obj)
    return obj


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.data.collections.new("trophy")
    bpy.context.scene.collection.children.link(col)
    # The plinth: an octagon, a gold band round its top.
    base = bmesh.new()
    bmesh.ops.create_cone(base, cap_ends=True, cap_tris=False, segments=8, radius1=0.95, radius2=0.85, depth=0.55, matrix=Matrix.Translation((0, 0, 0.275)) @ Matrix.Rotation(math.pi / 8, 4, "Z"))
    emit(col, "trophy_base", "base", base)
    gold = bmesh.new()
    bmesh.ops.create_cone(gold, cap_ends=True, cap_tris=False, segments=8, radius1=0.88, radius2=0.88, depth=0.08, matrix=Matrix.Translation((0, 0, 0.59)) @ Matrix.Rotation(math.pi / 8, 4, "Z"))
    # The cup: foot, stem with its knop, bowl, lip (radius, height).
    lathe(
        gold,
        [
            (0.0, 0.63),
            (0.62, 0.63),
            (0.62, 0.72),
            (0.42, 0.82),
            (0.16, 0.98),
            (0.13, 1.25),
            (0.24, 1.36),
            (0.24, 1.44),
            (0.13, 1.55),
            (0.15, 1.72),
            (0.42, 1.86),
            (0.66, 2.1),
            (0.76, 2.42),
            (0.8, 2.62),
            (0.86, 2.66),
            (0.86, 2.72),
            (0.0, 2.72),
        ],
    )
    # Its handles: an arc each side out from the bowl, both its ends in the bowl's side (under the lip, and at its waist).
    for sgn in (-1, 1):
        a0, a1 = (math.radians(-110), math.radians(110)) if sgn > 0 else (math.radians(70), math.radians(290))
        torus(gold, (sgn * 0.72, 0, 2.3), 0.3, 0.06, axis="y", seg=16, ring=8, arc=(a0, a1), caps=True)
    # The ring over the bowl, on edge and facing the front, held up on two arms.
    ring_z = 3.0
    torus(gold, (0, 0, ring_z), 0.36, 0.07, axis="y", seg=40, ring=10)
    for sgn in (-1, 1):
        a = Vector((sgn * 0.5, 0, 2.68))
        b = Vector((sgn * 0.31, 0, ring_z - 0.18))
        d = b - a
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        bmesh.ops.create_cone(gold, cap_ends=True, cap_tris=False, segments=8, radius1=0.05, radius2=0.04, depth=d.length, matrix=Matrix.Translation((a + b) / 2) @ rot)
    emit(col, "trophy_gold", "gold", gold)
    # The light inside the ring.
    glow = bmesh.new()
    torus(glow, (0, 0, ring_z), 0.29, 0.025, axis="y", seg=40, ring=6)
    emit(col, "trophy_glow", "glow", glow)
    return col


def preview(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    world = bpy.data.worlds.new("w")
    world.color = (0.55, 0.62, 0.72)
    scene.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    target = Vector((0, 0, 1.7))
    cam.location = Vector((-3.2, -7.5, 3.4))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    a = args()
    build()
    tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
    print(f"trophy: {tris} triangles")
    if a["glb"]:
        bpy.ops.export_scene.gltf(filepath=a["glb"], export_format="GLB", export_yup=True, export_apply=True, export_extras=True, export_normals=True, export_materials="EXPORT")
        print("exported", a["glb"])
    if a["preview"]:
        preview(a["preview"])


main()

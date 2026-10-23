"""Pose the titan's Blender model (its rig, as exported to glTF) as the wreck
of Titan's Rest, at the targets in art/blender/titan/fit/pose.json, so the
road can be fitted to its real shapes. Run with Blender 5.2's Python (the
bpy module, or blender --background --python):

    python3 tools/titan/pose_model.py -- <model.glb> <out dir> [pose.json]

It lies the rig on its back where pose.json puts it (head west, face up,
its back plate burialDepth under the sand), aims each arm along its joint
targets (the right flung out south across the sand, palm up; the left
raised over the road along its north side), leaves the legs straight and
the head face up, stands the halo upright on its struts round the Halo
roll, and drives the sword in along the line the Sword corkscrews round,
its grip cut off above the guard as the wreck has it. It writes:
  posed.glb      the posed model, in the game's axes (glTF, +Y up)
  rig-pose.json  the rig's placement and every bone's posed matrix
                 (armature space and world, Blender axes), the halo's and
                 the sword's world matrices: the pose as numbers
"""
import json
import math
import os
import sys

import bpy
import bmesh  # after bpy: as the bpy module, bpy puts it on the path
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
MODEL, OUT = argv[0], argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
POSE = argv[2] if len(argv) > 2 else os.path.join(HERE, '..', '..', 'art', 'blender', 'titan', 'fit', 'pose.json')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(MODEL))
for o in [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('titan/')]:
    bpy.data.objects.remove(o, do_unlink=True)  # the importer's bone-display helper
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
pose = json.load(open(POSE))
B = lambda key: Vector(pose['joints'][key]['blender'])
bones = rig.data.bones

# ---- the body, on its back ----------------------------------------------------------
# Standing, the model faces -Y with +Z up and its right at -X. Lying: up its
# body is west (-X), out of its chest is up (+Z), its right is south (-Y).
lie = Matrix(((0, 0, -1), (1, 0, 0), (0, -1, 0))).to_4x4()


def part_objects(part):
    return [o for o in bpy.data.objects if o.type == 'MESH' and (o.get('part') or o.get('titan_part')) == part]


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


# At rest, before anything moves: the back plate, the halo's ring, the sword.
back = bounds(part_objects('chest'))[1].y
ring = max(part_objects('halo'), key=lambda o: bounds([o])[1].x - bounds([o])[0].x)
rlo, rhi = bounds([ring])
centre_rest = (rlo + rhi) / 2
radius = (rhi.x - rlo.x) / 2
sword = part_objects('sword')[0]
slo, shi = bounds([sword])
shoulder = bones['upper_arm.R'].head_local.copy()
# Its shoulder pivots across the targets' place (west-east), its centreline on theirs, its back at the burial depth.
mid = (B('shoulderR') + B('shoulderL')) / 2
rig.matrix_world = Matrix.Translation((mid.x + shoulder.z, mid.y, back - pose['burialDepth'])) @ lie
bpy.context.view_layer.update()


def aim(name, to):
    """Turn a bone about its head so it points along `to` (world), the least turn that does it."""
    pb = rig.pose.bones[name]
    A = rig.matrix_world
    head = A @ pb.head
    now = (A @ pb.tail) - head
    q = now.rotation_difference(to.normalized())
    M = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ (A @ pb.matrix)
    pb.matrix = A.inverted() @ M
    bpy.context.view_layer.update()


# ---- the arms -------------------------------------------------------------------------
for side in 'RL':
    aim(f'upper_arm.{side}', B(f'elbow{side}') - B(f'shoulder{side}'))
    aim(f'forearm.{side}', B(f'wrist{side}') - B(f'elbow{side}'))
    aim(f'hand.{side}', B(f'fingertip{side}') - B(f'wrist{side}'))


# ---- the head: tipped forward on its neck (chin toward the chest) by pose.json head.pitch degrees,
# and propped up by pose.json head.lift metres (its neck broken, the head on its fallen collar plates and drifted sand).
pitch = pose.get('head', {}).get('pitch', 0)
lift = pose.get('head', {}).get('lift', 0)
if pitch or lift:
    pb = rig.pose.bones['head']
    A = rig.matrix_world
    pivot = A @ pb.head
    # Lying, its face looks up (+Z) and its feet are east (+X): the chin goes toward the chest about +Y.
    R = Matrix.Rotation(math.radians(pitch), 4, 'Y')
    pb.matrix = A.inverted() @ (Matrix.Translation(pivot + Vector((0, 0, lift))) @ R @ Matrix.Translation(-pivot) @ (A @ pb.matrix))
    bpy.context.view_layer.update()


# ---- the halo: torn off, upright on its struts, facing along the road --------------------------
# At rest its ring faces forward (its axis along the model's Y, the struts at its bottom
# and back). Upright on the sand: its axis along the road (world X), its struts down.
halo = rig.pose.bones['halo']
A = rig.matrix_world
rest = rig.data.bones['halo'].matrix_local
upright = Matrix(((0, 1, 0), (-1, 0, 0), (0, 0, 1))).to_4x4()  # model X -> -Y, Y -> X, Z -> Z
want = Matrix.Translation(Vector(pose['halo']['centre']['blender'])) @ upright @ Matrix.Translation(-centre_rest)
# Geometry in world = A @ P @ rest^-1 @ x_model: so P = A^-1 @ want @ rest.
halo.matrix = A.inverted() @ want @ rest
bpy.context.view_layer.update()

# ---- the sword: driven in along the Sword's line, its grip cut off above the guard -------------
blade = pose['sword']['blade']
# At rest it lies along +Y from the pommel to the point; the blade is the last 437 m of it.
guard_y = shi.y - 437.0
cut = guard_y - blade.get('grip', 26)
bm = bmesh.new()
bm.from_mesh(sword.data)
geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, cut, 0), plane_no=(0, 1, 0), clear_inner=True)
bmesh.ops.holes_fill(bm, edges=[e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)], sides=0)
bm.to_mesh(sword.data)
bm.free()
dirw = Vector(pose['sword']['towardPoint']['blender']).normalized()
q = Vector((0, 1, 0)).rotation_difference(dirw)
sword.matrix_world = Matrix.Translation(Vector(pose['sword']['guard']['blender'])) @ q.to_matrix().to_4x4() @ Matrix.Translation((0, -guard_y, 0))
bpy.context.view_layer.update()

# ---- out ----------------------------------------------------------------------------------
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
# The pose baked into each part: off the rig, where it now is.
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in bpy.data.objects:
    o.select_set(o in meshes)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'posed.glb'), export_format='GLB', export_yup=True, use_selection=True, export_extras=True, export_apply=True, export_texcoords=False, export_normals=True)
mat = lambda M: [list(map(lambda v: round(v, 6), row)) for row in M]
json.dump(
    {
        'about': "The titan's rig posed as the wreck of Titan's Rest (tools/titan/pose_model.py): the rig object's world matrix, each bone's posed matrix in armature space and in the world, and the halo's and the sword's world matrices for their geometry. Blender axes (X east, Y north, Z up), metres.",
        'rig': mat(rig.matrix_world),
        'bones': {pb.name: {'armature': mat(pb.matrix), 'world': mat(rig.matrix_world @ pb.matrix)} for pb in rig.pose.bones},
        'halo': {'world': mat(want), 'restCentre': list(centre_rest), 'radius': radius},
        'sword': {'world': mat(sword.matrix_world), 'cutAtRestY': cut, 'guardAtRestY': guard_y},
    },
    open(os.path.join(OUT, 'rig-pose.json'), 'w'),
    indent=1,
)
print('posed', len(meshes), 'meshes; halo radius', round(radius, 1), '; wrote', OUT)

"""Export the saved standing refinement, never an unsaved review pose.
blender --background art/blender/titan/titan-production.blend --python art/blender/titan/export_titan.py
"""
import bpy
import collections
import hashlib
import json
from pathlib import Path
from mathutils import Matrix, Vector

HERE = Path(bpy.data.filepath).resolve().parent
ROOT = HERE.parents[2]
rig = bpy.data.objects['titan_rig']
if any(pb.matrix_basis != Matrix.Identity(4) for pb in rig.pose.bones):
    raise RuntimeError('Export requires the neutral rest pose; reopen the production scene.')
bpy.context.view_layer.update()
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and 'titan_part' in o]
counts = collections.defaultdict(int)
for o in meshes:
    # Keep the original alias for Phase 1 consumers; the game also reads part.
    expected = o['titan_part']
    if 'part' in o and o['part'] != expected:
        raise RuntimeError(f'Conflicting part tags on {o.name}')
    o['part'] = expected
    o.data.calc_loop_triangles()
    counts[expected] += len(o.data.loop_triangles)
    assert not o.data.uv_layers and not o.vertex_groups
    assert all(abs(float(s)-1) < 1e-5 for s in o.scale), o.name
    assert expected == 'sword' or (o.parent == rig and o.parent_type == 'BONE' and o.parent_bone == expected)
assert sum(counts.values()) < 600000

joints = {'schema': 1, 'units': 'metres',
          'coordinates': 'Blender: +Z up, -Y forward, +X anatomical left',
          'armature': 'titan_rig', 'pose': 'rest', 'bones': {}}
for b in rig.data.bones:
    joints['bones'][b.name] = {'head': list(b.head_local), 'tail': list(b.tail_local),
                              'parent': b.parent.name if b.parent else None}
# An independent frozen copy of the approved blockout prevents a rebuild from
# silently changing the pivots that the game-side fit already uses. The user
# explicitly approved scaling only the 30 finger bones with the larger hands.
reference_path = HERE / 'joints-step1.json'
reference_bytes = reference_path.read_bytes()
assert hashlib.sha256(reference_bytes).hexdigest() == '88823721acf0cbf2e32fcae64a5adbc780c303c27007bd3af9fb8867a97e6ec7'
reference = json.loads(reference_bytes)['bones']
assert set(reference) == set(joints['bones']), 'Joint names changed from the approved blockout'
joint_error = 0.0
finger_joint_changes = {}
for name, current in joints['bones'].items():
    old = reference[name]
    assert current['parent'] == old['parent'], f'Joint parent changed: {name}'
    delta = max(abs(current[key][i]-old[key][i]) for key in ('head', 'tail') for i in range(3))
    is_finger = name.split('.')[0] in ('thumb', 'index', 'middle', 'ring', 'pinky')
    if is_finger:
        finger_joint_changes[name] = {'before': old, 'after': current, 'max_coordinate_delta_metres': delta}
    else:
        joint_error = max(joint_error, delta)
        assert delta <= 1e-5, f'Fixed joint moved: {name} ({delta} m)'

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = rig
out = ROOT / 'src/client/render/titan/assets/titan-blockout.glb'
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
    export_yup=True, export_normals=True, export_texcoords=False, export_animations=False,
    export_skins=True, export_def_bones=False, export_extras=True,
    export_cameras=False, export_lights=False)
(HERE / 'joints.json').write_text(json.dumps(joints, indent=2)+'\n')

def points(objects):
    return [o.matrix_world @ v.co for o in objects for v in o.data.vertices]

def bounds(objects):
    vs = points(objects)
    lo = [min(v[i] for v in vs) for i in range(3)]
    hi = [max(v[i] for v in vs) for i in range(3)]
    return {'min': lo, 'max': hi, 'size': [hi[i]-lo[i] for i in range(3)]}

def named(*names):
    return [bpy.data.objects[name] for name in names]

def section_size(objects):
    # Profiles lie in horizontal rings. Their cross-sections isolate armour
    # bulk from a limb's sloping centreline, unlike its whole-part AABB.
    levels = collections.defaultdict(list)
    for p in points(objects):
        levels[round(p.z, 2)].append(p)
    sections = [p for p in levels.values() if len(p) >= 4]
    return [max(max(p[i] for p in ring)-min(p[i] for p in ring) for ring in sections)
            for i in (0, 1)]

helmet = bounds(named('titan/head/helmet'))
body = bounds([o for o in meshes if o['part'] != 'sword'])
shoulder = bounds([o for o in meshes if o['part'].startswith('shoulder.')])
chest = bounds([o for o in meshes if o['part'] == 'chest' and 'vent' not in o.name and 'collar' not in o.name])
palm = bounds(named('titan/hand.L/palm-frame'))
hand_objects = [o for o in meshes if o['part'] == 'hand.L' or
                any(o['part'].startswith(f'{f}.') and o['part'].endswith('.L')
                    for f in ('thumb', 'index', 'middle', 'ring', 'pinky'))]
wrist = rig.data.bones['hand.L'].head_local
shoulder_pivot = rig.data.bones['upper_arm.L'].head_local
hand_vertices = points(hand_objects)
visor = bounds(named('titan/head/visor-band'))
blade_vertices = []
sword = bpy.data.objects['titan/sword/assembly']
for face in sword.data.polygons:
    if sword.data.materials[face.material_index].name in ('blade', 'edge'):
        blade_vertices.extend(sword.matrix_world @ sword.data.vertices[i].co for i in face.vertices)
blade_dimensions = [max(p[i] for p in blade_vertices)-min(p[i] for p in blade_vertices) for i in range(3)]
halo = bounds(named('titan/halo/main-ring'))
sword_bounds = bounds([sword])
measurements = {
    'crown_to_soles': helmet['max'][2]-body['min'][2],
    'shoulder_span': shoulder['size'][0],
    'chest_depth_excluding_vents': chest['size'][1],
    'helmet_width': helmet['size'][0],
    'helmet_chin_to_crown': helmet['size'][2],
    'shoulder_to_middle_fingertip': max((shoulder_pivot-p).length for p in hand_vertices),
    'wrist_to_middle_fingertip': max((wrist-p).length for p in hand_vertices),
    'hand_length_projected_Z': wrist.z-min(p.z for p in hand_vertices),
    'palm_width': palm['size'][0],
    'face_forward_of_shoulder_pivots': shoulder_pivot.y-visor['min'][1],
    'crotch_to_soles': rig.data.bones['pelvis'].head_local.z-body['min'][2],
    'halo_outer_diameter': halo['size'][0],
    'sword_overall': sword_bounds['size'][1],
    'blade_length': blade_dimensions[1], 'blade_width': blade_dimensions[0],
    'blade_thickness': blade_dimensions[2], 'blade_aspect': blade_dimensions[1]/blade_dimensions[0],
}
limbs = {'thigh': ['titan/thigh.L/thigh-armour'],
         'shin': ['titan/shin.L/greave-side-shell', 'titan/shin.L/greave-armour'],
         'upper_arm': ['titan/upper_arm.L/upper-arm-armour'],
         'forearm': ['titan/forearm.L/forearm-armour']}
for part, names in limbs.items():
    objects = named(*names)
    measurements[f'{part}_armour_bounds_XYZ'] = bounds(objects)['size']
    measurements[f'{part}_armour_ring_section_width_depth'] = section_size(objects)
report = {'phase': '1.2', 'blender': bpy.app.version_string, 'source_commit': rig['source_commit'],
          'triangles_total': sum(counts.values()), 'triangles_by_part': dict(sorted(counts.items())),
          'mesh_count': len(meshes), 'bone_count': len(rig.data.bones),
          'joint_reference': 'joints-step1.json', 'max_fixed_rest_joint_delta_metres': joint_error,
          'finger_joint_changes': finger_joint_changes,
          'measurements_metres': measurements, 'body_bounds': body,
          'materials': list(bpy.data.materials.keys()), 'export': str(out.relative_to(ROOT)),
          'measurement_notes': 'Hand length uses actual mesh tips, not finger bone tails. Limb ring sections exclude centreline slope. Visor front surface defines face offset.'}
(HERE / 'blockout-report.json').write_text(json.dumps(report, indent=2)+'\n')
print('TITAN_REPORT', json.dumps(report))

"""Independent Phase 1 Titan QA; never saves or modifies the source assets.
Usage: Blender --background --python validate_titan.py -- BLEND GLB REPORT.json
Production bone parenting is required. An unskinned GLB may round-trip as the
same rigid joint-node hierarchy: glTF has no native Blender armature datatype.
"""
import argparse
import collections
import json
import math
from pathlib import Path
import struct
import sys
import traceback

import bpy
import bmesh
from mathutils import Matrix, Quaternion, Vector

MATERIAL_HEX = {
    'armour': 'E6E0D2', 'red': 'B84A3A', 'slate': '6E7486', 'gold': 'C9A04A',
    'frame': '8A6A3A', 'verdigris': '5FA08A', 'visor': '2A2E38',
    'jewel': '3E9C9A', 'blade': '3A3F4A', 'edge': 'B8BCC8',
}
PARENTS = {'root': None, 'pelvis': 'root', 'spine': 'pelvis', 'chest': 'spine',
           'neck': 'chest', 'head': 'neck', 'halo': 'chest'}
for side in ('L', 'R'):
    PARENTS.update({
        f'shoulder.{side}': 'chest', f'upper_arm.{side}': 'chest',
        f'forearm.{side}': f'upper_arm.{side}', f'hand.{side}': f'forearm.{side}',
        f'thigh.{side}': 'pelvis', f'shin.{side}': f'thigh.{side}',
        f'foot.{side}': f'shin.{side}',
    })
    for finger in ('thumb', 'index', 'middle', 'ring', 'pinky'):
        for number in (1, 2, 3):
            PARENTS[f'{finger}.{number:02d}.{side}'] = (
                f'hand.{side}' if number == 1 else f'{finger}.{number-1:02d}.{side}')
assert len(PARENTS) == 51


def arguments():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('blendPath')
    parser.add_argument('glbPath')
    parser.add_argument('reportPath')
    parser.add_argument('--tolerance', type=float, default=0.01,
                        help='World-space tolerance in metres (default 1 cm at 1300 m scale).')
    return parser.parse_args(argv)


ARGS = arguments()
TOL = ARGS.tolerance
REPORT = {'blender': bpy.app.version_string, 'blend': str(Path(ARGS.blendPath).resolve()),
          'glb': str(Path(ARGS.glbPath).resolve()), 'tolerance_metres': TOL,
          'scope': 'Phase 1 step 1 only; no scene or GLB is saved',
          'failures': [], 'warnings': [], 'checks': []}


def check(condition, name, detail=None):
    REPORT['checks'].append({'name': name, 'passed': bool(condition)})
    if not condition:
        REPORT['failures'].append({'check': name, 'detail': detail})
    return bool(condition)


def warning(name, detail):
    REPORT['warnings'].append({'check': name, 'detail': detail})


def xyz(v):
    return [float(v[i]) for i in range(3)]


def bounds(points):
    if not points:
        return None
    lo = [min(p[k] for p in points) for k in range(3)]
    hi = [max(p[k] for p in points) for k in range(3)]
    return {'min': lo, 'max': hi, 'size': [hi[k]-lo[k] for k in range(3)],
            'centre': [(hi[k]+lo[k])/2 for k in range(3)]}


def unit_scale(ob):
    return max(abs(float(s)-1) for s in ob.scale) < 2e-5


def close_points(a, b, tolerance=TOL):
    return len(a) == len(b) and all(abs(x-y) <= tolerance for x, y in zip(a, b))


def linear_rgb(hex_string):
    rgb = [int(hex_string[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]


def mesh_snapshot(objects, phase):
    dg = bpy.context.evaluated_depsgraph_get()
    result = {}
    for ob in objects:
        eo = ob.evaluated_get(dg)
        me = eo.to_mesh(preserve_all_data_layers=True, depsgraph=dg)
        try:
            me.calc_loop_triangles()
            vertices = [xyz(eo.matrix_world @ v.co) for v in me.vertices]
            material_names = [m.name if m else None for m in me.materials]
            mat_points = collections.defaultdict(list)
            tris_per_material = collections.Counter()
            zero_area = 0
            for tri in me.loop_triangles:
                p = [Vector(vertices[i]) for i in tri.vertices]
                if (p[1]-p[0]).cross(p[2]-p[0]).length <= 1e-8:
                    zero_area += 1
                mat = material_names[tri.material_index] if tri.material_index < len(material_names) else None
                tris_per_material[mat] += 1
                for i in tri.vertices:
                    mat_points[mat].append(vertices[i])
            bm = bmesh.new()
            try:
                bm.from_mesh(me)
                raw_nonmanifold = sum(not e.is_manifold for e in bm.edges)
                raw_boundary = sum(e.is_boundary for e in bm.edges)
                wire = sum(e.is_wire for e in bm.edges)
                stray = sum(not v.link_faces for v in bm.verts)
                # glTF legitimately splits vertices at normal/material seams.
                # Audit geometric closure after welding coincident positions only.
                bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-5)
                nonmanifold = sum(not e.is_manifold for e in bm.edges)
                boundary = sum(e.is_boundary for e in bm.edges)
            finally:
                bm.free()
            part = str(ob.get('titan_part', ob.name.split('/')[1] if '/' in ob.name else 'unknown'))
            result[ob.name] = {
                'part': part, 'vertices': vertices, 'bounds': bounds(vertices),
                'triangles': len(me.loop_triangles), 'zero_area_triangles': zero_area,
                'nonmanifold_edges': nonmanifold, 'boundary_edges': boundary,
                'raw_nonmanifold_edges': raw_nonmanifold, 'raw_boundary_edges': raw_boundary,
                'closure_weld_tolerance_local_metres': 1e-5,
                'wire_edges': wire, 'stray_vertices': stray,
                'uv_maps': len(me.uv_layers), 'materials': material_names,
                'triangles_per_material': dict(tris_per_material),
                'material_points': dict(mat_points),
                'sharp_edges': sum(e.use_edge_sharp for e in me.edges),
                'smooth_polygons': sum(p.use_smooth for p in me.polygons),
                'scale': xyz(ob.scale), 'matrix_world': [list(row) for row in ob.matrix_world],
                'parent': ob.parent.name if ob.parent else None,
                'parent_type': ob.parent_type, 'parent_bone': ob.parent_bone,
                'vertex_groups': len(ob.vertex_groups),
                'armature_modifiers': sum(m.type == 'ARMATURE' for m in ob.modifiers),
                'origin': xyz(ob.matrix_world.translation),
            }
            check(len(me.vertices) > 0 and len(me.polygons) > 0, f'{phase}: populated mesh {ob.name}')
            check(zero_area == 0, f'{phase}: no zero-area triangles {ob.name}', zero_area)
            check(wire == 0 and stray == 0, f'{phase}: no stray geometry {ob.name}', {'wire': wire, 'vertices': stray})
            check(len(me.uv_layers) == 0, f'{phase}: no UV maps {ob.name}', len(me.uv_layers))
            check(None not in material_names and all(m in MATERIAL_HEX for m in material_names),
                  f'{phase}: valid material slots {ob.name}', material_names)
            check(unit_scale(ob), f'{phase}: applied object scale {ob.name}', xyz(ob.scale))
            if nonmanifold:
                warning(f'{phase}: inspect nonmanifold geometry {ob.name}',
                        {'edges': nonmanifold, 'boundary': boundary, 'wire': wire})
        finally:
            eo.to_mesh_clear()
    return result


def compact_meshes(meshes):
    return {name: {k: v for k, v in item.items() if k not in ('vertices', 'material_points')}
            for name, item in meshes.items()}


def by_part(meshes):
    result = collections.defaultdict(lambda: {'triangles': 0, 'vertices': []})
    for item in meshes.values():
        result[item['part']]['triangles'] += item['triangles']
        result[item['part']]['vertices'].extend(item['vertices'])
    return {part: {'triangles': item['triangles'], 'bounds': bounds(item['vertices'])}
            for part, item in result.items()}


def reflected_mismatch(points, tolerance=TOL):
    """Bijection within tolerance; preserves duplicate-vertex multiplicity."""
    buckets = collections.defaultdict(list)
    def cell(p):
        return tuple(math.floor(v/tolerance) for v in p)
    for p in points:
        buckets[cell(p)].append(p)
    unmatched = []
    max_error = 0.0
    for source in points:
        p = (-source[0], source[1], source[2])
        c = cell(p)
        best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    key = (c[0]+dx, c[1]+dy, c[2]+dz)
                    for i, q in enumerate(buckets.get(key, ())):
                        d2 = sum((p[k]-q[k])**2 for k in range(3))
                        if d2 <= tolerance*tolerance and (best is None or d2 < best[0]):
                            best = (d2, key, i)
        if best is None:
            unmatched.append(list(p))
        else:
            max_error = max(max_error, math.sqrt(best[0]))
            _, key, i = best
            buckets[key].pop(i)
    return {'unmatched': len(unmatched), 'sample': unmatched[:12], 'max_matched_error': max_error,
            'vertices': len(points)}


def production():
    bpy.ops.wm.open_mainfile(filepath=str(Path(ARGS.blendPath).resolve()))
    scene = bpy.context.scene
    check(bpy.app.version[:3] == (5, 2, 2), 'Blender version 5.2.2', bpy.app.version_string)
    check(scene.unit_settings.system == 'METRIC' and abs(scene.unit_settings.scale_length-1) < 1e-8,
          'production: metres, one Blender unit per metre',
          {'system': scene.unit_settings.system, 'scale_length': scene.unit_settings.scale_length})
    for ob in scene.objects:
        check(unit_scale(ob), f'production: every object has applied scale {ob.name}', xyz(ob.scale))
    armatures = [ob for ob in scene.objects if ob.type == 'ARMATURE']
    check(len(armatures) == 1 and armatures[0].name == 'titan_rig',
          'production: one armature named titan_rig', [o.name for o in armatures])
    if len(armatures) != 1:
        raise RuntimeError('Cannot validate Titan without one production armature')
    rig = armatures[0]
    check(unit_scale(rig), 'production: applied rig scale', xyz(rig.scale))
    check(rig.matrix_world.translation.length <= TOL, 'production: rig origin', xyz(rig.matrix_world.translation))
    actual_parents = {b.name: b.parent.name if b.parent else None for b in rig.data.bones}
    check(actual_parents == PARENTS, 'production: exact 51-bone hierarchy',
          {'expected': PARENTS, 'actual': actual_parents})
    bones = {b.name: {'parent': actual_parents[b.name], 'head': xyz(rig.matrix_world @ b.head_local),
                      'tail': xyz(rig.matrix_world @ b.tail_local), 'length': b.length}
             for b in rig.data.bones}
    check(all(b['length'] > 1e-5 for b in bones.values()), 'production: all bones have nonzero length')
    for name, bone in bones.items():
        if name.endswith('.L') and name[:-2]+'.R' in bones:
            opposite = bones[name[:-2]+'.R']
            for endpoint in ('head', 'tail'):
                point = bone[endpoint]
                check(close_points([-point[0], point[1], point[2]], opposite[endpoint]),
                      f'production: mirrored rig {name} {endpoint}', opposite[endpoint])
    meshes = [ob for ob in scene.objects if ob.type == 'MESH']
    check(all(ob.name.startswith('titan/') for ob in meshes), 'production: every mesh follows Titan naming',
          [ob.name for ob in meshes if not ob.name.startswith('titan/')])
    sword = [ob for ob in meshes if ob.name == 'titan/sword/assembly']
    check(len(sword) == 1, 'production: one independent sword assembly')
    for ob in meshes:
        part = ob.get('titan_part')
        named_part = ob.name.split('/')[1] if '/' in ob.name else None
        check(part == named_part and part in set(PARENTS) | {'sword'},
              f'production: semantic part {ob.name}', {'property': part, 'name': named_part})
        if part == 'sword':
            check(ob.parent is None and ob.name == 'titan/sword/assembly',
                  'production: sword is independent of rig', ob.parent.name if ob.parent else None)
            check(ob.location.length <= TOL, 'production: sword object at origin', xyz(ob.location))
        else:
            check(ob.parent == rig and ob.parent_type == 'BONE' and ob.parent_bone == part,
                  f'production: rigid single-bone parent {ob.name}',
                  {'parent': ob.parent.name if ob.parent else None, 'type': ob.parent_type, 'bone': ob.parent_bone})
        check(len(ob.vertex_groups) == 0 and not any(m.type == 'ARMATURE' for m in ob.modifiers),
              f'production: no weights or deformation {ob.name}')
    data = mesh_snapshot(meshes, 'production')
    check(sum(d['triangles'] for d in data.values()) < 100000, 'production: fewer than 100000 triangles',
          sum(d['triangles'] for d in data.values()))
    used = {m for d in data.values() for m in d['materials']}
    check(used == set(MATERIAL_HEX), 'production: all ten exact material names assigned', sorted(used))
    check(set(m.name for m in bpy.data.materials) == set(MATERIAL_HEX),
          'production: exactly ten material datablocks', [m.name for m in bpy.data.materials])
    mat_report = {}
    for mat in bpy.data.materials:
        nodes = list(mat.node_tree.nodes) if mat.node_tree else []
        texture_nodes = [n.name for n in nodes if n.type.startswith('TEX_') or getattr(n, 'image', None)]
        check(not texture_nodes, f'production: no textures in {mat.name}', texture_nodes)
        principled = [n for n in nodes if n.type == 'BSDF_PRINCIPLED']
        rgba = list(principled[0].inputs['Base Color'].default_value) if principled else list(mat.diffuse_color)
        mat_report[mat.name] = {'base_colour_linear': rgba, 'expected_srgb_hex': MATERIAL_HEX.get(mat.name)}
        if mat.name in MATERIAL_HEX:
            expected = linear_rgb(MATERIAL_HEX[mat.name])
            check(close_points(rgba[:3], expected, 2e-4), f'production: flat colour {mat.name}',
                  {'actual_linear': rgba[:3], 'expected_linear': expected})
        if principled:
            check(not principled[0].inputs['Base Color'].is_linked, f'production: constant colour {mat.name}')
    body_points = [p for d in data.values() if d['part'] != 'sword' for p in d['vertices']]
    body_bounds = bounds(body_points)
    check(abs(body_bounds['min'][2]) <= TOL, 'production: soles at ground Z=0', body_bounds['min'][2])
    check(abs(body_bounds['centre'][0]) <= TOL, 'production: centred on X=0', body_bounds['centre'][0])
    symmetry = reflected_mismatch(body_points)
    check(symmetry['unmatched'] == 0, 'production: body X symmetry including vertex multiplicity', symmetry)
    helmet = data.get('titan/head/helmet')
    check(helmet is not None, 'production: identified helmet excludes horns')
    measures = {'body_including_horns': body_bounds}
    if helmet:
        check(bpy.data.objects['titan/head/helmet'].get('role') == 'helmet', 'production: helmet role marker')
        crown_height = helmet['bounds']['max'][2] - body_bounds['min'][2]
        check(abs(crown_height-1300) <= TOL, 'production: 1300 m helmet crown to soles', crown_height)
        measures.update({'helmet_crown_to_soles': crown_height, 'helmet_width': helmet['bounds']['size'][0],
                         'helmet_chin_to_crown': helmet['bounds']['size'][2]})
        visor = [p for d in data.values() if d['part'] == 'head' for p in d['material_points'].get('visor', [])]
        if visor:
            check(bounds(visor)['centre'][1] < helmet['bounds']['centre'][1],
                  'production: visor faces front (-Y)', bounds(visor)['centre'][1])
    shoulder_points = [p for d in data.values() if d['part'].startswith('shoulder.') for p in d['vertices']]
    if shoulder_points:
        measures['shoulder_armour_span'] = bounds(shoulder_points)['size'][0]
    chest_points = [p for name, d in data.items() if d['part'] == 'chest' and 'vent' not in name.lower() for p in d['vertices']]
    if chest_points:
        measures['chest_depth_excluding_named_vents'] = bounds(chest_points)['size'][1]
    for side in ('L', 'R'):
        hand_parts = {f'hand.{side}'} | {f'{f}.{n:02d}.{side}' for f in ('thumb','index','middle','ring','pinky') for n in (1,2,3)}
        hand_points = [p for d in data.values() if d['part'] in hand_parts for p in d['vertices']]
        if hand_points and f'hand.{side}' in bones and f'upper_arm.{side}' in bones:
            wrist, shoulder = Vector(bones[f'hand.{side}']['head']), Vector(bones[f'upper_arm.{side}']['head'])
            measures[f'hand.{side}_wrist_to_furthest_tip'] = max((Vector(p)-wrist).length for p in hand_points)
            measures[f'arm.{side}_shoulder_to_furthest_tip'] = max((Vector(p)-shoulder).length for p in hand_points)
        palm_points = [p for d in data.values() if d['part'] == f'hand.{side}' for p in d['vertices']]
        if palm_points:
            measures[f'hand.{side}_palm_part_width_X'] = bounds(palm_points)['size'][0]
        if f'thigh.{side}' in bones:
            measures[f'leg.{side}_hip_joint_to_ground_Z'] = bones[f'thigh.{side}']['head'][2] - body_bounds['min'][2]
    halo_points = [p for name,d in data.items() if d['part'] == 'halo' and 'strut' not in name.lower() for p in d['vertices']]
    if halo_points:
        measures['halo_extent_excluding_named_struts'] = bounds(halo_points)['size']
    sw = data.get('titan/sword/assembly')
    if sw:
        measures['sword_overall'] = sw['bounds']
        check(abs(sw['bounds']['size'][1]-600) <= 60, 'production: sword about 600 m overall', sw['bounds']['size'][1])
        blade_points = sw['material_points'].get('blade', []) + sw['material_points'].get('edge', [])
        bb = bounds(blade_points)
        check(bb is not None, 'production: sword blade material surfaces identified')
        if bb:
            measures['sword_blade'] = bb
            ratio = bb['size'][1]/bb['size'][0] if bb['size'][0] else None
            measures['sword_blade_length_width_ratio'] = ratio
            check(bb['size'][0] <= 40+TOL and bb['size'][2] <= 12+TOL,
                  'production: blade at most 40 m wide and 12 m thick', bb['size'])
            check(ratio is not None and abs(ratio-19) <= 1.9, 'production: blade length about 19 widths', ratio)
            check(bb['size'][1] > bb['size'][0] > bb['size'][2] and bb['max'][1] > 0,
                  'production: sword length +Y, flat across Z', bb)
    clips = [s.clip_end for screen in bpy.data.screens for area in screen.areas if area.type == 'VIEW_3D'
             for s in area.spaces if s.type == 'VIEW_3D']
    check(bool(clips) and min(clips) >= 20000, 'production: viewport clip end at least 20 km', clips)
    REPORT['production'] = {'bones': bones, 'materials': mat_report, 'meshes': compact_meshes(data),
                            'triangles': sum(d['triangles'] for d in data.values()), 'per_part': by_part(data),
                            'measurements_metres': measures, 'symmetry': symmetry, 'viewport_clip_end': clips}
    return data, bones


def read_glb():
    raw = Path(ARGS.glbPath).read_bytes()
    magic, version, length = struct.unpack_from('<4sII', raw, 0)
    check(magic == b'glTF' and version == 2 and length == len(raw), 'GLB: valid binary glTF 2 header')
    offset = 12
    doc = None
    while offset+8 <= len(raw):
        size, kind = struct.unpack_from('<II', raw, offset)
        offset += 8
        if kind == 0x4E4F534A:
            doc = json.loads(raw[offset:offset+size])
        offset += size
    if doc is None:
        raise RuntimeError('GLB has no JSON chunk')
    return doc


def validate_glb(source, bones):
    doc = read_glb()
    nodes = doc.get('nodes', [])
    named = collections.defaultdict(list)
    parents = {}
    for i, n in enumerate(nodes):
        named[n.get('name', '')].append(i)
        for child in n.get('children', []):
            check(child not in parents, 'GLB: node has only one parent', child)
            parents[child] = i
    def parent_bone(i):
        while i in parents:
            i = parents[i]
            name = nodes[i].get('name')
            if name in PARENTS:
                return name
        return None
    def world(i):
        n = nodes[i]
        if 'matrix' in n:
            a = n['matrix']; local = Matrix([[a[c*4+r] for c in range(4)] for r in range(4)])
        else:
            t = Matrix.Translation(Vector(n.get('translation', [0,0,0])))
            q = n.get('rotation', [0,0,0,1]); rot = Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4()
            scale = Matrix.Diagonal((*n.get('scale', [1,1,1]), 1))
            local = t @ rot @ scale
        return world(parents[i]) @ local if i in parents else local
    check(len(named.get('titan_rig', [])) == 1, 'GLB: titan_rig hierarchy included', named.get('titan_rig'))
    for bone, parent in PARENTS.items():
        ids = named.get(bone, [])
        check(len(ids) == 1, f'GLB: unique joint node {bone}', ids)
        if len(ids) == 1:
            check(parent_bone(ids[0]) == parent, f'GLB: hierarchy {bone}', parent_bone(ids[0]))
            p = world(ids[0]).translation
            blender_p = [p.x, -p.z, p.y]
            check(close_points(blender_p, bones[bone]['head']), f'GLB: +Y-up joint position {bone}',
                  {'imported_blender_axes': blender_p, 'source': bones[bone]['head']})
    names = [m.get('name') for m in doc.get('materials', [])]
    check(len(names) == 10 and set(names) == set(MATERIAL_HEX), 'GLB: ten exact materials', names)
    check(not doc.get('textures') and not doc.get('images'), 'GLB: no textures or images')
    primitives = [p for m in doc.get('meshes', []) for p in m.get('primitives', [])]
    check(all(p.get('mode', 4) == 4 for p in primitives), 'GLB: triangle primitives only (no modelled ink lines)')
    check(all('NORMAL' in p.get('attributes', {}) for p in primitives), 'GLB: exported normals on every primitive')
    check(all(not any(a.startswith(('TEXCOORD_', 'JOINTS_', 'WEIGHTS_')) for a in p.get('attributes', {})) for p in primitives),
          'GLB: no UV or deformation attributes')
    actual_meshes = [n for n in nodes if 'mesh' in n]
    check(set(n.get('name') for n in actual_meshes) == set(source), 'GLB: all and only production meshes',
          {'source_count': len(source), 'GLB_count': len(actual_meshes)})
    for i, node in enumerate(nodes):
        if 'mesh' not in node:
            continue
        name = node.get('name', '')
        expected = source.get(name, {}).get('part')
        if expected:
            check(parent_bone(i) == (None if expected == 'sword' else expected),
                  f'GLB: rigid attachment {name}', {'expected': expected, 'actual': parent_bone(i)})
        check(close_points(node.get('scale', [1,1,1]), [1,1,1], 2e-5), f'GLB: mesh unit scale {name}', node.get('scale'))
    REPORT['glb'] = {'nodes': len(nodes), 'meshes': len(actual_meshes), 'materials': names,
                     'primitives': len(primitives), 'skin_count': len(doc.get('skins', [])),
                     'rig_joint_nodes': sum(len(named.get(n, [])) for n in PARENTS),
                     'representation': 'rigid joint nodes; no skin required for bone-parented rigid meshes'}


def roundtrip(source, bones):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(ARGS.glbPath).resolve()))
    objects = list(bpy.context.scene.objects)
    armatures = [o for o in objects if o.type == 'ARMATURE']
    # Blender 5.2.2's io_scene_gltf2/blender/imp/node.py armature_display()
    # creates an Icosphere solely for pose-bone display. It is not GLB content.
    # Never filter by a generic object name: require live pose references,
    # exclusive membership in the importer's hidden collection, and no matching
    # name anywhere in the source GLB (including actual exported mesh names).
    from io_scene_gltf2.blender.com.blender_default import BLENDER_GLTF_SPECIAL_COLLECTION
    doc = read_glb()
    glb_names = {item.get('name') for kind in ('nodes', 'meshes') for item in doc.get(kind, [])}
    helper_references = collections.defaultdict(list)
    for rig in armatures:
        for bone in rig.pose.bones:
            if bone.custom_shape is not None:
                helper_references[bone.custom_shape].append(f'{rig.name}/{bone.name}')
    excluded_helpers = {}
    for helper, references in helper_references.items():
        collections_used = list(helper.users_collection)
        importer_collection = (len(collections_used) == 1
                               and collections_used[0].name == BLENDER_GLTF_SPECIAL_COLLECTION
                               and collections_used[0].hide_viewport
                               and collections_used[0].hide_render)
        if (helper.type == 'MESH' and importer_collection
                and helper.name not in glb_names and helper.name not in source):
            excluded_helpers[helper] = {
                'name': helper.name, 'custom_shape_references': sorted(references),
                'collection': collections_used[0].name,
                'collection_hidden_viewport': collections_used[0].hide_viewport,
                'collection_hidden_render': collections_used[0].hide_render,
                'absent_from_glb_nodes_and_meshes': True,
                'reason': 'Importer-generated pose-bone display shape; not exported model geometry',
            }
    meshes = [o for o in objects if o.type == 'MESH' and o not in excluded_helpers]
    imported = mesh_snapshot(meshes, 'roundtrip')
    check(set(imported) == set(source), 'roundtrip: mesh names retained',
          {'missing': sorted(set(source)-set(imported)), 'extra': sorted(set(imported)-set(source))})
    representation = 'armature' if armatures else 'rigid joint empties'
    if armatures:
        check(len(armatures) == 1, 'roundtrip: exactly one reconstructed armature')
        rig = armatures[0]
        check({b.name: b.parent.name if b.parent else None for b in rig.data.bones} == PARENTS,
              'roundtrip: reconstructed bone hierarchy')
    else:
        node_objects = {o.name: o for o in objects if o.type == 'EMPTY'}
        for bone, parent in PARENTS.items():
            ob = node_objects.get(bone)
            check(ob is not None, f'roundtrip: preserved rigid joint {bone}')
            if ob:
                actual_parent = ob.parent.name if ob.parent and ob.parent.name in PARENTS else None
                check(actual_parent == parent, f'roundtrip: joint parent {bone}', actual_parent)
                check(close_points(xyz(ob.matrix_world.translation), bones[bone]['head']),
                      f'roundtrip: rest joint head {bone}', xyz(ob.matrix_world.translation))
    max_bound_error = 0
    for name in sorted(set(imported) & set(source)):
        a, b = source[name], imported[name]
        delta = max(abs(a['bounds'][side][k]-b['bounds'][side][k]) for side in ('min','max') for k in range(3))
        max_bound_error = max(max_bound_error, delta)
        check(delta <= TOL, f'roundtrip: unchanged world bounds {name}', delta)
        check(a['triangles'] == b['triangles'], f'roundtrip: unchanged triangle count {name}',
              {'source': a['triangles'], 'imported': b['triangles']})
        check(a['triangles_per_material'] == b['triangles_per_material'], f'roundtrip: material assignments {name}',
              {'source': a['triangles_per_material'], 'imported': b['triangles_per_material']})
        ob = bpy.data.objects[name]
        if a['part'] == 'sword':
            check(ob.parent is None, 'roundtrip: sword remains independent')
        elif armatures:
            check(ob.parent == armatures[0] and ob.parent_type == 'BONE' and ob.parent_bone == a['part'],
                  f'roundtrip: rigid bone attachment {name}')
        else:
            check(ob.parent is not None and ob.parent.name == a['part'], f'roundtrip: rigid joint attachment {name}',
                  ob.parent.name if ob.parent else None)
        check(not ob.vertex_groups and not any(m.type == 'ARMATURE' for m in ob.modifiers),
              f'roundtrip: no deforming weights {name}')
    REPORT['roundtrip'] = {'representation': representation, 'mesh_count': len(imported),
                          'excluded_importer_helpers': list(excluded_helpers.values()),
                          'triangles': sum(m['triangles'] for m in imported.values()),
                          'max_world_bounds_delta_metres': max_bound_error,
                          'meshes': compact_meshes(imported)}


try:
    source, bones = production()
    validate_glb(source, bones)
    roundtrip(source, bones)
except Exception as error:
    REPORT['failures'].append({'check': 'validation execution', 'detail': str(error), 'traceback': traceback.format_exc()})
REPORT['passed'] = not REPORT['failures']
REPORT['check_count'] = len(REPORT['checks'])
REPORT['failure_count'] = len(REPORT['failures'])
REPORT['warning_count'] = len(REPORT['warnings'])
Path(ARGS.reportPath).write_text(json.dumps(REPORT, indent=2) + '\n')
print(json.dumps({'passed': REPORT['passed'], 'checks': REPORT['check_count'],
                  'failures': REPORT['failure_count'], 'warnings': REPORT['warning_count'],
                  'production_triangles': REPORT.get('production', {}).get('triangles'),
                  'roundtrip_representation': REPORT.get('roundtrip', {}).get('representation'),
                  'report': str(Path(ARGS.reportPath).resolve())}, indent=2))
if not REPORT['passed']:
    sys.exit(1)

"""Read-only Phase 2 source, target and GLB contract audit (Blender 5.2).
blender --background art/blender/titan/titan-production.blend \
  --python-exit-code 1 --python art/blender/titan/validate_wreck.py
Writes phase2-validation.json; never edits or saves the scene or the export.
Run check_clearance.py --strict and measure_wreck.py separately for road fit.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SLOTS = {'armour', 'red', 'slate', 'gold', 'frame', 'verdigris', 'visor', 'jewel', 'blade', 'edge'}
APPROVED_SHA = 'c459af81162f68f5c860592429c0562445788085a8047c265215657cb3a17b5f'
ALLOWED_SRC = 'src/client/render/titan/assets/titan.glb'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def game(v):
    return Vector((v[0], -v[2], v[1]))


def delta(a, b):
    return max(abs(a[r][c] - b[r][c]) for r in range(4) for c in range(4))


def points(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


def radial_face_min(triangle, center, axis):
    """Exact radial distance to a planar triangle, including its interior."""
    q = [p - center - axis * (p - center).dot(axis) for p in triangle]
    # In the plane normal to axis, the origin lies in the triangle exactly
    # when the signed edge cross products have the same orientation.
    signs = [q[i].cross(q[(i + 1) % 3]).dot(axis) for i in range(3)]
    area = (q[1] - q[0]).cross(q[2] - q[0]).length
    if area > 1e-10 and (min(signs) >= -1e-8 or max(signs) <= 1e-8):
        return 0.0
    best = float('inf')
    for i in range(3):
        a, b = q[i], q[(i + 1) % 3]
        d = b - a
        t = max(0.0, min(1.0, -a.dot(d) / d.length_squared)) if d.length_squared else 0.0
        best = min(best, (a + d * t).length)
    return best


def read_glb(path):
    raw = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', raw)
    if (magic, version, size) != (b'glTF', 2, len(raw)):
        raise ValueError('Invalid glTF binary header')
    doc, binary = None, None
    cursor = 12
    while cursor < len(raw):
        count, kind = struct.unpack_from('<I4s', raw, cursor)
        chunk = raw[cursor + 8:cursor + 8 + count]
        if kind == b'JSON':
            doc = json.loads(chunk)
        elif kind == b'BIN\0':
            binary = chunk
        cursor += 8 + count
    if doc is None or binary is None:
        raise ValueError('Missing GLB JSON or BIN chunk')
    return doc, binary


def access(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    dtype = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    item = np.dtype(dtype).itemsize
    return np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
                      offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
                      strides=(view.get('byteStride', item * width), item))


def expected_obj_vertices(path):
    by_name = {}
    name = None
    for line in path.read_text().splitlines():
        if line.startswith('o '):
            name = line[2:].strip()
            by_name[name] = set()
        elif line.startswith('v ') and name:
            x, y, z = map(float, line.split()[1:4])
            by_name[name].add((round(x, 3), round(-z, 3), round(y, 3)))
    return by_name


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=HERE / 'phase2-validation.json')
    args = parser.parse_args(argv)
    checks, failures, warnings = [], [], []
    def check(label, passed, detail=None):
        checks.append({'check': label, 'pass': bool(passed), 'detail': detail})
        if not passed:
            failures.append(label)
    pose = json.loads((HERE / 'fit/pose.json').read_text())
    rigpose = json.loads((HERE / 'fit/rig-pose.json').read_text())
    source = HERE / 'titan-standing.blend'
    check('approved standing source hash', sha(source) == APPROVED_SHA, sha(source))
    check('Blender 5.2', bpy.app.version[:2] == (5, 2), bpy.app.version_string)
    rig = bpy.data.objects.get('titan_rig')
    check('inspection rig retained', rig is not None and rig.type == 'ARMATURE')
    if rig is None:
        raise RuntimeError('No source rig for target audit')
    check('rig world matrix equals supplied pose', delta(rig.matrix_world, Matrix(rigpose['rig'])) <= .002,
          delta(rig.matrix_world, Matrix(rigpose['rig'])))
    bone_deltas = {b.name: delta(b.matrix, Matrix(rigpose['bones'][b.name]['armature'])) for b in rig.pose.bones}
    check('all 51 pose matrices equal supplied pose', len(bone_deltas) == 51 and max(bone_deltas.values()) <= .002, bone_deltas)
    head = rig.pose.bones['head']
    rest = rig.data.bones['head']
    rotation = head.matrix.to_quaternion() @ rest.matrix_local.to_quaternion().inverted()
    pitch = math.degrees(rotation.angle)
    lift = ((rig.matrix_world @ head.head) - (rig.matrix_world @ rest.head_local)).z
    check('head rig pitch target', abs(pitch - pose['head']['pitch']) <= .01, pitch)
    check('head rig lift target', abs(lift - pose['head']['lift']) <= .002, lift)
    blockout = json.loads((HERE / 'blockout-report.json').read_text())
    inferred_burial = blockout['body_bounds']['max'][1] - rig.matrix_world.translation.z
    check('source burial transform target', abs(inferred_burial - pose['burialDepth']) <= .002, inferred_burial)
    target_report = {'head': {'rig_pitch_degrees': pitch, 'rig_lift_m': lift,
                             'note': 'Rig target only. The fitted head mesh contains local seating refinements; its surface is not a rigid 45-degree copy.'},
                     'burial_m_before_below_sand_trimming': inferred_burial}
    col = bpy.data.collections.get('TITAN')
    check('TITAN collection exists', col is not None)
    if col is None:
        raise RuntimeError('No TITAN collection')
    meshes = [o for o in col.all_objects if o.type == 'MESH' and len(o.data.polygons)]
    counts = Counter()
    valid_parts = set(rig.data.bones.keys()) | {'sword'}
    for o in meshes:
        part = o.get('part')
        o.data.calc_loop_triangles()
        counts[part] += len(o.data.loop_triangles)
        check(o.name + ': source part/name contract', part in valid_parts and o.get('titan_part') == part and o.name.startswith('titan/' + str(part) + '/'))
        check(o.name + ': no UVs', len(o.data.uv_layers) == 0)
        check(o.name + ': exact allowed materials', all(m is not None and m.name in SLOTS for m in o.data.materials))
    check('source triangle budget', sum(counts.values()) <= 600000, sum(counts.values()))
    main_ring = bpy.data.objects.get('titan/halo/main-ring')
    if main_ring:
        a = np.array([tuple(p) for p in points(main_ring)])
        center = Vector(((a.min(0) + a.max(0)) / 2).tolist())
        cov = np.cov(a - np.array(center), rowvar=False)
        vals, axes = np.linalg.eigh(cov)
        axis = Vector(axes[:, np.argmin(vals)].tolist()).normalized()
        target_axis = Vector(pose['halo']['axis']['blender']).normalized()
        if axis.dot(target_axis) < 0:
            axis.negate()
        target_center = Vector(pose['halo']['centre']['blender'])
        ring_objects = [o for o in meshes if o.get('part') == 'halo' and 'mount-' not in o.name]
        radial_min = float('inf')
        for o in ring_objects:
            vs = points(o)
            for tri in o.data.loop_triangles:
                radial_min = min(radial_min, radial_face_min([vs[i] for i in tri.vertices], target_center, target_axis))
        check('halo centre target', (center - target_center).length <= .01, list(center))
        check('halo unoriented axis target', axis.dot(target_axis) >= .99999, list(axis))
        check('halo ring and inward tabs minimum inner radius', radial_min >= pose['halo']['minInnerRadius'] - .01, radial_min)
        target_report['halo'] = {'center_blender': list(center), 'axis_blender': list(axis),
                                 'inner_radius_surface_min_m': radial_min,
                                 'target_min_m': pose['halo']['minInnerRadius'],
                                 'note': 'Exact radial minimum over ring/tab triangle interiors; separate mounting struts excluded from ring-opening measurement and covered by strict road clearance.'}
    else:
        check('halo main ring retained', False)
    sword = bpy.data.objects.get('titan/sword/assembly')
    broken = bpy.data.objects.get('titan/sword/broken-grip-and-pommel')
    check('sword and broken grip retained', sword is not None and broken is not None)
    if sword:
        transform = Matrix(rigpose['sword']['world'])
        inverse = transform.inverted()
        guard = transform @ Vector((0, rigpose['sword']['guardAtRestY'], 0))
        target_guard = Vector(pose['sword']['guard']['blender'])
        direction = (transform.to_3x3() @ Vector((0, 1, 0))).normalized()
        expected_direction = Vector(pose['sword']['towardPoint']['blender']).normalized()
        vs = points(sword)
        blade_vertices = set()
        for p in sword.data.polygons:
            if sword.data.materials[p.material_index].name in ('blade', 'edge'):
                blade_vertices.update(p.vertices)
        radial_max = max(((vs[i] - guard) - direction * (vs[i] - guard).dot(direction)).length for i in blade_vertices)
        grip_length = max(0, rigpose['sword']['guardAtRestY'] - min((inverse @ p).y for p in vs))
        check('sword guard transform target', (guard - target_guard).length <= .002, list(guard))
        check('sword blade axis target', direction.dot(expected_direction) >= .99999, list(direction))
        check('sword blade radial maximum', radial_max <= pose['sword']['maxBladeRadius'] + .002, radial_max)
        check('remaining grip no longer than 26m', grip_length <= 26.002, grip_length)
        target_report['sword'] = {'guard_blender': list(guard), 'axis_blender': list(direction),
                                  'blade_radial_max_m': radial_max, 'target_radius_max_m': pose['sword']['maxBladeRadius'],
                                  'grip_remaining_m': grip_length}
        if broken:
            bs = points(broken)
            bc = Vector([sum(p[i] for p in bs) / len(bs) for i in range(3)])
            check('broken grip/pommel east of blade', min(p.x for p in bs) > guard.x, list(bc))
            check('broken grip/pommel rests in sand', min(p.z for p in bs) <= .01 and max(p.z for p in bs) >= 0,
                  {'min_z': min(p.z for p in bs), 'max_z': max(p.z for p in bs)})
            target_report['sword']['broken_grip_center_blender'] = list(bc)
            target_report['sword']['broken_grip_min_z'] = min(p.z for p in bs)
            target_report['sword']['broken_grip_max_z'] = max(p.z for p in bs)
    fit = {}
    for file, cname in [('road.obj', 'FIT/road'), ('keepout.obj', 'FIT/keepout'), ('sky.obj', 'FIT/sky')]:
        expected = expected_obj_vertices(HERE / 'fit' / file)
        c = bpy.data.collections.get(cname)
        check(cname + ': retained', c is not None)
        if not c:
            continue
        for name, wanted in expected.items():
            objs = [o for o in c.all_objects if o.type == 'MESH' and (o.name == name or o.name.startswith(name + '.'))]
            actual = {tuple(round(float(x), 3) for x in p) for o in objs for p in points(o)}
            check(cname + '/' + name + ': world geometry unchanged', actual == wanted,
                  {'expected_unique_vertices': len(wanted), 'actual_unique_vertices': len(actual),
                   'missing': len(wanted - actual), 'extra': len(actual - wanted)})
        check(cname + ': selection locked', all(o.hide_select for o in c.all_objects))
    for p in sorted((HERE / 'fit').iterdir()):
        if p.is_file():
            fit[p.name] = sha(p)
            relative = str(p.relative_to(ROOT))
            head_bytes = subprocess.run(['git', 'show', 'HEAD:' + relative], cwd=ROOT, capture_output=True)
            if head_bytes.returncode == 0:
                check('fit input unmodified: ' + p.name, hashlib.sha256(head_bytes.stdout).hexdigest() == fit[p.name])
    glb = ROOT / ALLOWED_SRC
    doc, binary = read_glb(glb)
    check('export has no rigs, skins, animations, cameras or images', not any(doc.get(k) for k in ('skins', 'animations', 'cameras', 'images', 'textures')))
    names = {m.get('name') for m in doc.get('materials', [])}
    check('export retains exactly ten named material slots', names == SLOTS, sorted(names))
    glb_counts = Counter()
    for node in doc.get('nodes', []):
        name = node.get('name', '')
        extra = node.get('extras', {})
        part = extra.get('part')
        check(name + ': meshes-only node', 'mesh' in node and 'skin' not in node and 'camera' not in node)
        check(name + ': exported part/name contract', part in valid_parts and extra.get('titan_part') == part and name.startswith('titan/' + str(part) + '/'))
        if 'mesh' not in node:
            continue
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            attributes = primitive['attributes']
            check(name + ': triangle primitive with explicit normals and no UVs/weights', primitive.get('mode', 4) == 4 and 'NORMAL' in attributes and not any(a.startswith(('TEXCOORD', 'JOINTS', 'WEIGHTS')) for a in attributes))
            count = doc['accessors'][primitive['indices']]['count'] if 'indices' in primitive else doc['accessors'][attributes['POSITION']]['count']
            glb_counts[part] += count // 3
            check(name + ': finite positions and normals', np.isfinite(access(doc, binary, attributes['POSITION'])).all() and np.isfinite(access(doc, binary, attributes['NORMAL'])).all())
    check('export triangle count equals saved source by part', dict(glb_counts) == dict(counts), dict(sorted(glb_counts.items())))
    check('export triangle budget', sum(glb_counts.values()) <= 600000, sum(glb_counts.values()))
    dirty_src = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--', 'src'], cwd=ROOT, text=True).splitlines()
    untracked_src = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', 'src'], cwd=ROOT, text=True).splitlines()
    check('only permitted src file changed', set(dirty_src + untracked_src) <= {ALLOWED_SRC}, dirty_src + untracked_src)
    changed_tests = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--', 'tests'], cwd=ROOT, text=True).splitlines()
    check('no game tests edited', not changed_tests, changed_tests)
    report = {'blender': bpy.app.version_string, 'source': str(source), 'source_sha256': sha(source),
              'production_sha256': sha(bpy.data.filepath), 'export_sha256': sha(glb), 'fit_sha256': fit,
              'checks_total': len(checks), 'failures': failures, 'warnings': warnings,
              'triangles_by_part': dict(sorted(glb_counts.items())), 'triangles_total': sum(glb_counts.values()),
              'export_meshes': len(doc.get('meshes', [])), 'targets': target_report, 'checks': checks,
              'limitations': ['No continuous collision proof; use strict checker and game surface tests.', 'Seating changes intentionally deform surface geometry while retaining exact supplied rig transforms.']}
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(f"Titan Phase 2 validation: {len(checks)} checks, {len(failures)} failures, {len(warnings)} warnings; {sum(glb_counts.values()):,} triangles.")
    print(json.dumps(target_report, indent=2))
    for failure in failures:
        print('FAIL:', failure)
    print('Report:', args.output)
    if failures:
        sys.exit(1)


if __name__ == '__main__':
    main()

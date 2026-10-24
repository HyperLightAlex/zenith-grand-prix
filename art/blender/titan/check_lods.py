"""Read-only Phase 4 audit of the exact exported GLBs (Blender 5.2).

For each level, from the repository root:
  blender --background --python-exit-code 1 --python \
    art/blender/titan/check_lods.py -- --level 0
  # Repeat with --level 1 and --level 2.

Imports the selected GLB into a fresh TITAN collection, then executes the
existing fit/check_clearance.py with --strict. It does not save a blend, edit
an asset or regenerate the game's titan-top.json. Reports go to reports/phase4.
Use --contract-only for the fast binary contract audit without a surface scan.
"""
import argparse
from collections import Counter
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import re
import runpy
import struct
import subprocess
import sys

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ASSETS = ROOT / 'src/client/render/titan/assets'
FILES = ('titan.glb', 'titan-lod1.glb', 'titan-lod2.glb')
BUDGETS = (600000, 150000, 40000)
SLOTS = {'armour', 'red', 'slate', 'gold', 'frame', 'verdigris', 'visor', 'jewel', 'blade', 'edge'}
PHASE3_SHA256 = '01d05dca1f842bdb47860a3515d928bca09d9c3c0327ab712f19c326c9cde32a'
ALLOWED_SRC = {'src/client/render/titan/assets/titan-lod1.glb',
               'src/client/render/titan/assets/titan-lod2.glb'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_glb(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), 'Invalid GLB header'
    doc, binary, cursor = None, None, 12
    while cursor < len(raw):
        size, kind = struct.unpack_from('<I4s', raw, cursor)
        chunk = raw[cursor + 8:cursor + 8 + size]
        if kind == b'JSON':
            doc = json.loads(chunk)
        elif kind == b'BIN\0':
            binary = chunk
        cursor += 8 + size
    assert doc is not None and binary is not None, 'Missing GLB JSON or BIN chunk'
    return doc, binary


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    view = doc['bufferViews'][a['bufferView']]
    dtype = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    item = np.dtype(dtype).itemsize
    return np.ndarray((a['count'], width), dtype=dtype, buffer=binary,
                      offset=view.get('byteOffset', 0) + a.get('byteOffset', 0),
                      strides=(view.get('byteStride', item * width), item))


class Tee(io.StringIO):
    def __init__(self, stream):
        super().__init__()
        self.stream = stream

    def write(self, text):
        self.stream.write(text)
        self.stream.flush()
        return super().write(text)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--level', type=int, choices=(0, 1, 2), default=0)
    parser.add_argument('--output', type=Path, default=HERE / 'reports/phase4')
    parser.add_argument('--contract-only', action='store_true')
    args = parser.parse_args(argv)
    args.output.mkdir(parents=True, exist_ok=True)
    checks, failures = [], []

    def check(label, passed, detail=None):
        checks.append({'check': label, 'pass': bool(passed), 'detail': detail})
        if not passed:
            failures.append(label)

    fit_before = {p.name: sha(p) for p in sorted((HERE / 'fit').iterdir()) if p.is_file()}
    check('Blender 5.2', bpy.app.version[:2] == (5, 2), bpy.app.version_string)
    check('Phase 3 titan.glb remains byte-identical', sha(ASSETS / FILES[0]) == PHASE3_SHA256,
          sha(ASSETS / FILES[0]))
    levels = []
    source_names = {}
    source_parts = set()
    documents = {}
    for level, (file, budget) in enumerate(zip(FILES, BUDGETS)):
        path = ASSETS / file
        check(file + ': exists', path.is_file())
        if not path.is_file():
            continue
        doc, binary = read_glb(path)
        documents[level] = doc
        check(file + ': meshes only, no textures or animations',
              not any(doc.get(k) for k in ('skins', 'animations', 'cameras', 'images', 'textures')))
        check(file + ': exactly ten material names', {m.get('name') for m in doc.get('materials', [])} == SLOTS,
              sorted(m.get('name', '') for m in doc.get('materials', [])))
        counts = Counter()
        names = []
        for node in doc.get('nodes', []):
            name, extras = node.get('name', ''), node.get('extras', {})
            part = extras.get('part')
            names.append(name)
            check(file + '/' + name + ': named and tagged mesh', 'mesh' in node and 'skin' not in node and
                  'camera' not in node and isinstance(part, str) and extras.get('titan_part') == part and
                  name.startswith('titan/' + str(part) + '/'))
            if level == 0:
                source_names[name] = part
            else:
                check(file + '/' + name + ': source object name and part retained',
                      source_names.get(name) == part)
            if 'mesh' not in node:
                continue
            for n, primitive in enumerate(doc['meshes'][node['mesh']]['primitives']):
                label = file + '/' + name + '/primitive-' + str(n)
                attrs = primitive['attributes']
                check(label + ': triangles with explicit normals, no UVs or skinning',
                      primitive.get('mode', 4) == 4 and 'POSITION' in attrs and 'NORMAL' in attrs and
                      not any(a.startswith(('TEXCOORD', 'JOINTS', 'WEIGHTS')) for a in attrs))
                material = primitive.get('material')
                check(label + ': known material', material is not None and
                      doc['materials'][material].get('name') in SLOTS)
                if 'POSITION' not in attrs or 'NORMAL' not in attrs:
                    continue
                pos = accessor(doc, binary, attrs['POSITION'])
                normals = accessor(doc, binary, attrs['NORMAL'])
                check(label + ': finite positions and unit normals', np.isfinite(pos).all() and
                      np.isfinite(normals).all() and np.all(np.abs(np.linalg.norm(normals, axis=1) - 1) < .001))
                count = len(accessor(doc, binary, primitive['indices'])) if 'indices' in primitive else len(pos)
                check(label + ': triangle vertex/index count', count > 0 and count % 3 == 0, count)
                if 'indices' in primitive:
                    ids = accessor(doc, binary, primitive['indices'])
                    check(label + ': indices in bounds', bool((ids >= 0).all() and (ids < len(pos)).all()))
                counts[part] += count // 3
        check(file + ': unique object names', len(names) == len(set(names)))
        if level:
            check(file + ': exact source object-name set', set(names) == set(source_names),
                  {'missing': sorted(set(source_names) - set(names)), 'extra': sorted(set(names) - set(source_names))})
        check(file + ': triangle budget', sum(counts.values()) <= budget, sum(counts.values()))
        if level == 0:
            source_parts = set(counts)
            check(file + ': approved 48-part contract', len(source_parts) == 48, sorted(source_parts))
        else:
            check(file + ': exact source part parity', set(counts) == source_parts,
                  {'missing': sorted(source_parts - set(counts)), 'extra': sorted(set(counts) - source_parts)})
        levels.append({'level': level, 'file': file, 'sha256': sha(path), 'triangles': sum(counts.values()),
                       'triangles_by_part': dict(sorted(counts.items())), 'meshes': len(names)})

    clearance = None
    if not args.contract_only and args.level in documents:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(ASSETS / FILES[args.level]), merge_vertices=False)
        col = bpy.data.collections.new('TITAN')
        bpy.context.scene.collection.children.link(col)
        imported = list(bpy.context.scene.objects)
        expected = {n['name']: n for n in documents[args.level].get('nodes', [])}
        count = Counter()
        for obj in imported:
            check(obj.name + ': imported mesh and exact name', obj.type == 'MESH' and obj.name in expected)
            if obj.type != 'MESH':
                continue
            for old in tuple(obj.users_collection):
                old.objects.unlink(obj)
            col.objects.link(obj)
            ext = expected.get(obj.name, {}).get('extras', {})
            check(obj.name + ': importer preserved part extras', obj.get('part') == ext.get('part') and
                  obj.get('titan_part') == ext.get('titan_part'))
            check(obj.name + ': importer preserved exception metadata',
                  obj.get('titan_sky_exceptions') == ext.get('titan_sky_exceptions'))
            obj.data.calc_loop_triangles()
            count[obj.get('part')] += len(obj.data.loop_triangles)
        wanted = next(x['triangles_by_part'] for x in levels if x['level'] == args.level)
        check('import retains exact exported triangle counts per part', dict(count) == wanted, dict(sorted(count.items())))
        check('import retains every exported object', set(o.name for o in imported) == set(expected))
        stream = Tee(sys.stdout)
        original_argv = sys.argv[:]
        exit_code = 0
        try:
            sys.argv = [str(HERE / 'fit/check_clearance.py'), '--', '--strict', '--collection', 'TITAN']
            with redirect_stdout(stream):
                try:
                    runpy.run_path(str(HERE / 'fit/check_clearance.py'), run_name='__main__')
                except SystemExit as ex:
                    exit_code = int(ex.code or 0)
        finally:
            sys.argv = original_argv
        output = stream.getvalue()
        (args.output / ('clearance-lod' + str(args.level) + '.txt')).write_text(output)
        check('unchanged strict clearance checker succeeds', exit_code == 0 and output.rstrip().endswith('Clear of the road.'), exit_code)
        hits = []
        total_points = 0
        object_count = 0
        for line in output.splitlines():
            match = re.match(r'^  (.*): (\d+) points(?:; (.*)|, clear)$', line)
            if not match:
                continue
            name, points, rest = match.groups()
            total_points += int(points)
            object_count += 1
            if not rest or 'in the sky over the road' not in rest:
                continue
            sky = re.search(r'in the sky over the road: (\d+) points \((.*?)\)(?:;|$)', rest)
            check(name + ': sky report parsed', sky is not None, rest)
            if sky is None:
                continue
            part = expected.get(name, {}).get('extras', {}).get('part')
            by_piece = {}
            for token in sky.group(2).split(', '):
                piece, n = token.rsplit(' ', 1)
                by_piece[piece] = int(n)
            # Name/part classification is independent of the artist's exception
            # metadata. Arbitrary chest pieces cannot declare themselves roofs.
            allowed = {'the Long Flank'} if part in ('upper_arm.L', 'forearm.L') else \
                      {'the Halo'} if part == 'halo' else \
                      {'the Hull'} if part == 'chest' and (name == 'titan/chest/hull-left-roof' or
                                                          name.startswith('titan/chest/hull-roof-crossmember-')) else set()
            check(name + ': only an approved sky overlap', set(by_piece) <= allowed,
                  {'hits': by_piece, 'allowed': sorted(allowed)})
            hits.append({'object': name, 'part': part, 'points': int(sky.group(1)), 'pieces': by_piece})
        check('clearance scanned every imported mesh', object_count == len(expected), object_count)
        clearance = {'level': args.level, 'file': FILES[args.level], 'strict_exit_code': exit_code,
                     'objects': object_count, 'surface_points': total_points, 'sky_overlaps': hits,
                     'sky_points': sum(h['points'] for h in hits),
                     'full_output': 'clearance-lod' + str(args.level) + '.txt'}

    check('finest export still byte-identical after audit', sha(ASSETS / FILES[0]) == PHASE3_SHA256)
    check('FIT files unchanged during audit', fit_before == {p.name: sha(p) for p in sorted((HERE / 'fit').iterdir()) if p.is_file()})
    changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--', 'src'], cwd=ROOT, text=True).splitlines()
    extra = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', 'src'], cwd=ROOT, text=True).splitlines()
    check('only two LOD exports changed under src', set(changed + extra) <= ALLOWED_SRC, changed + extra)
    check('FIT files unchanged from branch baseline', not subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--', 'art/blender/titan/fit'], cwd=ROOT, text=True).strip())
    check('tests unchanged', not subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--', 'tests'], cwd=ROOT, text=True).strip())
    result = {'blender': bpy.app.version_string, 'finest_expected_sha256': PHASE3_SHA256,
              'fit_sha256': fit_before, 'levels': levels, 'clearance': clearance,
              'checks_total': len(checks), 'failures': failures, 'checks': checks,
              'limitation': 'Surface sampling is the specified checker, not a continuous collision proof.'}
    path = args.output / ('contract.json' if args.contract_only else 'validation-lod' + str(args.level) + '.json')
    path.write_text(json.dumps(result, indent=2) + '\n')
    print(f'Phase 4 GLB audit: {len(checks)} checks, {len(failures)} failures.')
    print('Report:', path)
    for item in failures:
        print('FAIL:', item)
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

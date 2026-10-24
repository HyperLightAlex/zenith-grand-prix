"""Render the exact exported Titan LODs at the twenty approved Phase 3 cameras.

    blender --background --python art/blender/titan/render_lods.py
    blender --background --python art/blender/titan/render_lods.py -- \
        --only overview palm breach halo armour-wear --scale 50 --samples 8

Only previews/phase4 is written. The production file supplies unchanged FIT road
context; its TITAN objects are removed from the unsaved render scene and replaced
by one imported GLB at a time. No source model, export or fit input is saved.
All three levels use exactly the same recorded camera, lights and flat palette.
"""
import argparse
from collections import Counter
import hashlib
import html
import importlib.util
import json
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE / 'previews' / 'phase4'
SOURCE = HERE / 'titan-production.blend'
CAMERAS = HERE / 'previews' / 'phase3' / 'framing.json'
ASSETS = ROOT / 'src/client/render/titan/assets'
LEVELS = {'lod0': 'titan.glb', 'lod1': 'titan-lod1.glb', 'lod2': 'titan-lod2.glb'}
ORDER = ('overview', 'palm', 'arm-shoulder', 'brow', 'collar', 'halo', 'breach',
         'ribcage', 'ribcage-high', 'hull-left', 'hull-gallery', 'exit', 'sword',
         'knuckles', 'fingertip-support', 'wound-roots', 'peeled-wound',
         'ribs-cables', 'sand-drift', 'armour-wear')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def helper_module():
    spec = importlib.util.spec_from_file_location('titan_weathered_review', HERE / 'render_weathered.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def import_level(path, helper, samples, scale):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    titan = bpy.data.collections.get('TITAN')
    if not titan:
        raise RuntimeError('Production context has no TITAN collection.')
    for obj in list(titan.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path), import_shading='NORMALS')
    imported = set(bpy.data.objects) - before
    meshes = [obj for obj in imported if obj.type == 'MESH']
    if not meshes:
        raise RuntimeError('GLB import contains no meshes: ' + str(path))
    canonical = {name: helper.review_material(name, value) for name, value in helper.PALETTE.items()}
    counts = Counter()
    for obj in meshes:
        part = obj.get('part')
        if not part or obj.get('titan_part') != part or not obj.name.startswith('titan/' + part + '/'):
            raise RuntimeError('Imported object lost its production name or part tags: ' + obj.name)
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        titan.objects.link(obj)
        # glTF import gives duplicate Blender datablocks .001 suffixes. Restore
        # the named review palette only; never modify material assignments.
        for slot in obj.material_slots:
            if slot.material is None:
                raise RuntimeError('Unassigned material slot: ' + obj.name)
            name = re.sub(r'\.\d{3}$', '', slot.material.name)
            if name not in canonical:
                raise RuntimeError('Unexpected imported material: ' + slot.material.name)
            slot.material = canonical[name]
        obj.data.calc_loop_triangles()
        counts[part] += len(obj.data.loop_triangles)
    scene, camera, fill, titan_meshes = helper.setup_scene(samples, scale)
    # Importing +Y-up glTF through Blender restores the production +Z-up frame.
    # Parent empties keep the importer transform; nothing is repositioned here.
    bounds = {}
    for part in counts:
        points = [obj.matrix_world @ vertex.co for obj in meshes if obj['part'] == part for vertex in obj.data.vertices]
        low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
        high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
        radius = (high-low).length / 2
        bounds[part] = {'centerBlender': list((low+high)/2), 'radius': radius,
                        'lod1Distance': radius*1.5+400, 'lod2Distance': radius*4+1200}
    return scene, camera, fill, {'triangles': sum(counts.values()), 'trianglesByPart': dict(sorted(counts.items())),
                                 'objects': len(meshes), 'partBounds': bounds}


def write_gallery(manifest):
    escape = html.escape
    sections = []
    for key in ORDER:
        source = manifest['cameras'][key]
        figures = []
        for level in LEVELS:
            record = manifest.get('levels', {}).get(level, {}).get('views', {}).get(key)
            if record and (OUT / record['image']).exists():
                image = escape(record['image'])
                figures.append(f'<figure><figcaption>{level.upper()}</figcaption><a href="{image}"><img src="{image}" alt="{escape(source["title"])} at {level.upper()}" loading="lazy"></a></figure>')
            else:
                figures.append(f'<figure><figcaption>{level.upper()}</figcaption><div class="pending">Render pending</div></figure>')
        if any(key in level.get('views', {}) for level in manifest.get('levels', {}).values()):
            sections.append(f'<section id="{key}"><h2>{escape(source["title"])}</h2><div class="comparison">'+''.join(figures)+f'</div><p>{escape(source["caption"])}</p></section>')
    chips = []
    for level, data in manifest.get('levels', {}).items():
        chips.append(f'<span>{level.upper()}: {data["triangles"]:,} triangles</span>')
    navigation = ''.join(f'<a href="#{key}">{escape(manifest["cameras"][key]["title"].split(" · ")[0])}</a>' for key in ORDER)
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Titan · Phase 4 LOD comparison</title><style>
:root{font:16px/1.5 system-ui,sans-serif;color:#202936;background:#e4e6ec}body{max-width:2040px;margin:auto;padding:28px 20px 70px}h1{font-size:34px;margin-bottom:5px}h2{font-size:23px;margin:0 0 12px}header>p{max-width:1150px}a{color:#23557a}nav,.counts{display:flex;flex-wrap:wrap;gap:8px 16px;margin:16px 0}section{padding:20px;margin:24px 0;background:#f4f5f7;border:1px solid #c4cbd5;border-radius:12px}.comparison{display:grid;grid-template-columns:repeat(3,minmax(260px,1fr));gap:12px;overflow-x:auto}figure{margin:0}figcaption{font-weight:700;margin:0 0 6px}img{display:block;width:100%;height:auto;border-radius:4px}section p{color:#465367;margin-bottom:0}.note{padding:14px;border-left:4px solid #a7894d;background:#f2eee4}.counts span{background:#dbe2eb;border-radius:20px;padding:4px 13px}.pending{aspect-ratio:14/9;display:grid;place-items:center;background:#e1e5eb;color:#556070}
</style><header><h1>Titan’s Rest · levels of detail</h1><p>The exact three exported game models at all twenty Phase 3 viewpoints. Each row uses the same camera, framing, light and material palette. Open an image for its full resolution.</p>
<p class="note">The game switches each part independently: LOD1 begins at 1.5 × its radius + 400 m, LOD2 at 4 × its radius + 1200 m. These close views deliberately expose simplification for review; nearby road-bearing parts remain at full detail in game. The far overview shows the across-course silhouette. The fixed road and white Z = 0 review sand are context only and are not exported.</p>
<div class="counts">''' + ''.join(chips) + '''</div><nav><a href="../phase3/index.html">Phase 3 review</a><a href="../../fit/plan.png">Road plan</a><a href="framing.json">Cameras, hashes and render record</a></nav><nav>''' + navigation + '</nav></header>' + '\n'.join(sections) + '</html>\n'
    (OUT / 'index.html').write_text(page)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', nargs='*', default=[])
    parser.add_argument('--levels', nargs='+', choices=tuple(LEVELS), default=list(LEVELS))
    parser.add_argument('--samples', type=int, default=16)
    parser.add_argument('--scale', type=int, default=100)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not 1 <= args.samples <= 24 or not 25 <= args.scale <= 100:
        raise ValueError('Samples must be 1–24 and scale 25–100.')
    unknown = set(args.only) - set(ORDER)
    if unknown:
        raise ValueError('Unknown views: ' + ', '.join(sorted(unknown)))
    camera_source = json.loads(CAMERAS.read_text())
    if set(camera_source['views']) != set(ORDER):
        raise RuntimeError('Phase 3 camera list changed; review all required views before rendering.')
    source_hash = digest(SOURCE)
    camera_hash = digest(CAMERAS)
    fit_hashes = {p.name: digest(p) for p in (HERE/'fit').iterdir() if p.is_file()}
    initial_assets = {level: digest(ASSETS / filename) for level, filename in LEVELS.items()}
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'framing.json'
    manifest = json.loads(path.read_text()) if path.exists() else {}
    if manifest.get('cameraSourceSha256') != camera_hash or manifest.get('productionContextSha256') != source_hash:
        manifest = {}
    manifest.update({'phase': 4, 'blender': bpy.app.version_string, 'engine': 'EEVEE',
                     'cameraSource': '../phase3/framing.json', 'cameraSourceSha256': camera_hash,
                     'productionContext': 'titan-production.blend', 'productionContextSha256': source_hash,
                     'fitSha256': fit_hashes, 'reviewSandZ': 0, 'sourceFilesSaved': False,
                     'switchingDistance': {'lod1': 'radius * 1.5 + 400', 'lod2': 'radius * 4 + 1200',
                                           'gameReferenceBounds': 'levels.lod0.partBounds'},
                     'cameras': {key: camera_source['views'][key] for key in ORDER}})
    levels = manifest.setdefault('levels', {})
    helper = helper_module()
    for level in args.levels:
        scene, camera, fill, metadata = import_level(ASSETS / LEVELS[level], helper, args.samples, args.scale)
        previous = levels.get(level, {})
        records = previous.get('views', {}) if previous.get('sha256') == initial_assets[level] else {}
        levels[level] = dict(metadata, file=LEVELS[level], sha256=initial_assets[level], views=records)
        destination = OUT / level
        destination.mkdir(exist_ok=True)
        for key in ORDER:
            if args.only and key not in args.only:
                continue
            source = camera_source['views'][key]
            view = dict(key=key, title=source['title'], caption=source['caption'],
                        target=Vector(source['target']), eye=Vector(source['camera']),
                        lens=source['lens'], fit=None)
            record = helper.render_view(scene, camera, fill, view, destination)
            record.update(image=level + '/' + key + '.png', sourceSha256=initial_assets[level],
                          samples=args.samples, resolutionPercent=args.scale,
                          width=scene.render.resolution_x*args.scale//100,
                          height=scene.render.resolution_y*args.scale//100)
            records[key] = record
            path.write_text(json.dumps(manifest, indent=2) + '\n')
            write_gallery(manifest)
            print('TITAN_LOD_RENDER', level, key, initial_assets[level], flush=True)
    if source_hash != digest(SOURCE) or camera_hash != digest(CAMERAS):
        raise RuntimeError('A source file changed during rendering.')
    if initial_assets != {level: digest(ASSETS / filename) for level, filename in LEVELS.items()}:
        raise RuntimeError('A model export changed during rendering; review images require rerendering.')
    if fit_hashes != {p.name: digest(p) for p in (HERE/'fit').iterdir() if p.is_file()}:
        raise RuntimeError('Fit inputs changed during rendering.')
    print('TITAN_LOD_RENDERS', str(OUT), flush=True)
    print('Exact GLBs rendered. Production, assets, fit inputs and Phase 3 cameras were not saved.', flush=True)


if __name__ == '__main__':
    main()

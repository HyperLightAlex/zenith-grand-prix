"""Render Phase 3 damage and fitting review without saving or editing production geometry.

    blender --background art/blender/titan/titan-production.blend \
        --python art/blender/titan/render_weathered.py

Optional arguments after --: --only palm brow, --samples 12, --scale 75.
Only previews/phase3 is written. The white sand plane, camera, lights and
review road/material settings exist solely in the unsaved render process.
All camera placements are in metres and follow the unmodified FIT road.
"""
import argparse
import html
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = Path(__file__).resolve().parent
FIT = HERE / 'fit'
OUT = HERE / 'previews' / 'phase3'
PALETTE = {
    'armour': '#E6E0D2', 'red': '#B84A3A', 'slate': '#6E7486',
    'gold': '#C9A04A', 'frame': '#8A6A3A', 'verdigris': '#5FA08A',
    'visor': '#2A2E38', 'jewel': '#3E9C9A', 'blade': '#3A3F4A',
    'edge': '#B8BCC8',
}


def srgb_hex(value):
    channels = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
                 for c in channels) + (1,)


def review_material(name, value, emission=.13):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    rgba = srgb_hex(value)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = 1
    bsdf.inputs['Specular IOR Level'].default_value = .16
    bsdf.inputs['Emission Color'].default_value = rgba
    bsdf.inputs['Emission Strength'].default_value = emission
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat


def game_vector(p):
    return Vector((p[0], -p[2], p[1]))


def mesh_points(objects, minimum_z=None):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        ev = obj.evaluated_get(depsgraph)
        for vertex in ev.data.vertices:
            point = ev.matrix_world @ vertex.co
            if minimum_z is None or point.z >= minimum_z:
                points.append(point)
    return points


def setup_scene(samples, scale):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = samples
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = scale
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.world = bpy.data.worlds.new('REVIEW white desert sky')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.82, .87, 1, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .3

    titan = bpy.data.collections.get('TITAN')
    road = bpy.data.collections.get('FIT/road')
    if not titan or not road:
        raise RuntimeError('Open the posed production file with TITAN and FIT/road before rendering.')
    titan_meshes = [o for o in titan.all_objects if o.type == 'MESH']
    road_meshes = [o for o in road.all_objects if o.type == 'MESH']
    if not titan_meshes or not road_meshes:
        raise RuntimeError('TITAN and FIT/road must contain meshes.')
    visible = set(titan_meshes + road_meshes)
    for obj in scene.objects:
        obj.hide_render = obj not in visible
        if obj in visible:
            obj.hide_set(False)
    for collection in bpy.data.collections:
        if collection.name == 'TITAN' or collection.name.startswith('FIT'):
            collection.hide_render = False
    for name, value in PALETTE.items():
        review_material(name, value)
    road_mat = review_material('REVIEW road', '#3C5269', .22)
    for obj in road_meshes:
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(road_mat)
        for poly in obj.data.polygons:
            poly.material_index = 0

    review = bpy.data.collections.new('REVIEW temporary')
    scene.collection.children.link(review)
    plane_mesh = bpy.data.meshes.new('REVIEW sand plane')
    plane_mesh.from_pydata([(-10000, -8000, -.15), (10000, -8000, -.15),
                          (10000, 12000, -.15), (-10000, 12000, -.15)], [], [(0, 1, 2, 3)])
    plane = bpy.data.objects.new('REVIEW white sand Z=0', plane_mesh)
    review.objects.link(plane)
    plane.data.materials.append(review_material('REVIEW white sand', '#EEECE4', .1))
    sun_data = bpy.data.lights.new('REVIEW sun', 'SUN')
    sun_data.energy = 2.2
    sun_data.angle = math.radians(12)
    sun = bpy.data.objects.new('REVIEW sun', sun_data)
    review.objects.link(sun)
    sun.rotation_euler = Vector((.4, .25, -1)).to_track_quat('-Z', 'Y').to_euler()
    fill_data = bpy.data.lights.new('REVIEW camera fill', 'AREA')
    fill_data.energy = 450000
    fill_data.shape = 'DISK'
    fill_data.size = 90
    fill_data.use_shadow = False
    fill = bpy.data.objects.new('REVIEW camera fill', fill_data)
    review.objects.link(fill)
    camera_data = bpy.data.cameras.new('REVIEW wreck camera')
    camera_data.clip_start = .2
    camera_data.clip_end = 30000
    camera_data.lens = 44
    camera = bpy.data.objects.new('REVIEW wreck camera', camera_data)
    review.objects.link(camera)
    scene.camera = camera
    return scene, camera, fill, titan_meshes


def make_views(road, pose, titan_meshes):
    samples = road['samples']
    def at(distance):
        return min(samples, key=lambda sample: abs(sample['s'] - distance))

    def route_point(distance, route):
        s = at(distance)
        # Negative lateral offsets are the left corridor. At a split the
        # half-width, median, shift and rise are taken from the fit samples.
        lateral = (-1 if route == 0 else 1) * (s['hw'] + s['median']) / 2 + s['shift'][route]
        return game_vector(s['p']) + game_vector(s['r']) * lateral + game_vector(s['u']) * s['rise'][route]

    def view(key, title, target, eye, caption, lens=44, fit=None):
        return dict(key=key, title=title, target=Vector(target), eye=Vector(eye),
                    caption=caption, lens=lens, fit=fit)

    torso_points = mesh_points(titan_meshes, minimum_z=-20)
    bounds_min = Vector(tuple(min(p[i] for p in torso_points) for i in range(3)))
    bounds_max = Vector(tuple(max(p[i] for p in torso_points) for i in range(3)))
    middle = (bounds_min + bounds_max) / 2
    overview_eye = middle + Vector((-1.1, -1.3, 1.25)).normalized() * 3000
    views = [view('overview', 'The fallen titan', middle, overview_eye,
                  'Full wreck on the unchanged road. White review sand marks Z = 0; buried geometry is intentionally occluded.',
                  lens=48, fit=torso_points)]
    views += [
        view('palm', 'Palm · fingertips to wrist', (0, 610, 90), (-260, 340, 255),
             'Approach over the open right hand. Inspect the road support across its full width.'),
        view('arm-shoulder', 'Arm and shoulder', (0, 1000, 125), (-430, 770, 440),
             'Forearm seating and the approved pylon-supported climb above the upper arm.', lens=42),
        view('brow', 'Brow · face and propped head', (-125, 1422, 190), (180, 1030, 710),
             'Face, chin and forehead beneath the road, with the broken-neck supports below.', lens=44),
        view('collar', 'Collar and chin', (-40, 1365, 200), (310, 1150, 390),
             'Transition from the chest to the lifted head; collar plates and frame remain visible.', lens=48),
        view('halo', 'Halo · full roll', pose['halo']['centre']['blender'], (-1030, 1100, 355),
             'Detached halo standing beyond the crown. The road rolls through the opening.', lens=48, fit=mesh_points([o for o in titan_meshes if o.get('part', o.get('titan_part')) == 'halo'], minimum_z=-20)),
        view('breach', 'Breach · north flank entrance', (231, 1600, 70), (420, 1900, 205),
             'The northern wound, seen from outside along the approach into the chest.', lens=48),
        view('ribcage', 'Ribcage · chamber overview', (198, 1500, 90), (300, 1830, 400),
             'The northern chest opening, bronze ribs and frame surrounding the loop.', lens=26),
        view('ribcage-high', 'Ribcage · inside the chamber', (198, 1500, 90), (300, 1550, 100),
             'Wide view from inside the chest: the complete loop and the surrounding bronze frame.', lens=10),
    ]
    left_eye = route_point(5900, 0) + Vector((0, 0, 8))
    left_target = route_point(5990, 0) + Vector((0, 0, 11))
    gallery_eye = route_point(5870, 1) + Vector((0, 0, 32))
    gallery_target = route_point(5960, 1) + Vector((0, 0, 5))
    views += [
        view('hull-left', 'Hull · left bronze corridor', left_target, left_eye,
             'Inside the left route. Inspect the bronze walls and roof clearance over the road.', lens=21),
        view('hull-gallery', 'Hull · right open gallery', gallery_target, gallery_eye,
             'Looking toward the south exit along the raised right route, beside the ribs and the bronze left corridor; the gallery has no enclosing outer wall or roof.', lens=24),
        view('exit', 'Exit · south flank', (160, 1220, 45), (410, 920, 175),
             'The opening where the two routes leave the southern flank.', lens=44),
    ]
    sword_points = mesh_points([o for o in titan_meshes if o.get('part', o.get('titan_part')) == 'sword'], minimum_z=-20)
    sword_target = Vector(pose['sword']['guard']['blender']) + Vector(pose['sword']['towardPoint']['blender']) * 115
    views.append(view('sword', 'Sword · blade, guard and broken grip', sword_target, (820, 0, 380),
                      'The road around the buried blade. The snapped grip and pommel rest east of it.', lens=48, fit=sword_points))
    views.extend(damage_views(samples, titan_meshes))
    return views


def damage_views(samples, titan_meshes):
    """Road-relative knuckle view plus bounds-framed authored damage.

    Name prefixes identify reproducible authored geometry, rather than editing
    the production scene. Each closeup includes the intact surrounding model.
    """
    def record(key, title, target, direction, distance, caption, lens=48, fit=None):
        target = Vector(target)
        return dict(key=key, title=title, target=target,
                    eye=target + Vector(direction).normalized() * distance,
                    caption=caption, lens=lens, fit=fit)
    sample = min(samples, key=lambda item: abs(item['s'] - 558))
    target = game_vector(sample['p']) + game_vector(sample['u']) * -12
    views = [record('knuckles', 'Palm · knuckle support', target, (-1, .12, .15), 245,
                    'Close inspection of the bent support at s 550–565. The fingers remain spread around the supported central route.', 43)]
    first = min(samples, key=lambda item: abs(item['s'] - 506))
    views.append(record('fingertip-support', 'Palm · fingertip bearing from the side', game_vector(first['p']) + game_vector(first['u']) * -20, (-1, -.3, .18), 265,
                        'Low side inspection of the bent fingertip supports and their attachment to the spread fingers.', 46))
    shell_lips = [obj for obj in titan_meshes if 'peeled-wound-shell-' in obj.name]
    lip_points = mesh_points(shell_lips) if shell_lips else []
    if lip_points:
        low = Vector(tuple(min(point[i] for point in lip_points) for i in range(3)))
        high = Vector(tuple(max(point[i] for point in lip_points) for i in range(3)))
        views.append(record('wound-roots', 'Breach · roots of the peeled armour', (low+high)/2, (1.2,1.4,1.0), 260,
                            'Looking into the north wound from above, showing where the peeled lips join the surviving ivory shell.', 47, lip_points))
    groups = [
        ('peeled-wound', 'Breach · peeled wound plates', ('peeled', 'wound-petal', 'wound-flap'), (1.1, 1.3, .65), 260,
         'Armour folded outward around the north chest wound, with the road entrance and exposed bronze frame visible.'),
        ('ribs-cables', 'Ribcage · snapped ribs and cut cables', ('snapped', 'cable', 'conduit'), (1.2, 1.5, .8), 280,
         'The damaged rib ends and hanging services around the chamber. The complete model remains visible, including the loop.'),
        ('sand-drift', 'Burial · sand at the north wound', ('sand-drift-north-wound', 'sand-drift-ribcage-hollow'), (1.0, 1.5, .65), 330,
         'Modelled sand gathered against the wreck and in its hollows, using an existing production material slot.'),
    ]
    for key, title, patterns, direction, distance, caption in groups:
        objects = [obj for obj in titan_meshes if any(pattern in obj.name for pattern in patterns)]
        if not objects:
            continue
        points = mesh_points(objects, minimum_z=-2)
        if not points:
            continue
        lower = Vector(tuple(min(point[i] for point in points) for i in range(3)))
        upper = Vector(tuple(max(point[i] for point in points) for i in range(3)))
        views.append(record(key, title, (lower + upper) / 2, direction, distance, caption, 45, points))
    chipped = [obj for obj in titan_meshes if obj.get('part') == 'shoulder.R' and obj.get('damage')]
    if chipped:
        points = mesh_points(chipped, minimum_z=-2)
        low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
        high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
        views.append(record('armour-wear', 'Shoulder · chipped and dented armour', (low+high)/2, (1,-.5,.7), 420,
                            'A broad capped edge chip and shallow dent on the surviving right pauldron; primary markings and silhouette remain recognizable.', 48, points))
    return views


def render_view(scene, camera, fill, view, out):
    camera.data.type = 'PERSP'
    camera.data.lens = view['lens']
    target = view['target']
    direction = (view['eye'] - target).normalized()
    distance = (view['eye'] - target).length
    def place():
        camera.location = target + direction * distance
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
    place()
    # Whole-wreck and sword views grow only far enough to keep all visible
    # production vertices within a 5% image border. No model is transformed.
    points = view.get('fit')
    if points:
        for _ in range(30):
            projected = [world_to_camera_view(scene, camera, p) for p in points]
            if all(.05 <= p.x <= .95 and .05 <= p.y <= .95 and p.z > 0 for p in projected):
                break
            distance *= 1.08
            place()
        else:
            raise RuntimeError('Could not frame the whole assembly for ' + view['key'])
    fill.location = camera.location + Vector((0, 0, 10))
    fill.rotation_euler = camera.rotation_euler
    fill.data.energy = 30000 if view['key'] in ('ribcage', 'ribcage-high', 'hull-left', 'hull-gallery', 'knuckles', 'fingertip-support', 'wound-roots', 'sand-drift') else 450000
    scene.render.filepath = str(out / (view['key'] + '.png'))
    bpy.ops.render.render(write_still=True)
    return dict(title=view['title'], caption=view['caption'], image=view['key'] + '.png',
                camera=list(camera.location), target=list(target), lens=camera.data.lens,
                wholeAssemblyFramed=bool(points))


def write_gallery(views, records):
    sections = []
    for view in views:
        record = records.get(view['key'])
        if not record or not (OUT / record['image']).exists():
            continue
        sections.append('<section id="{}"><h2>{}</h2><a href="{}"><img src="{}" alt="{}" loading="lazy"></a><p>{}</p></section>'.format(
            html.escape(view['key']), html.escape(record['title']), html.escape(record['image']),
            html.escape(record['image']), html.escape(record['title']), html.escape(record['caption'])))
    gallery = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Titan · Phase 3 damage and weathering review</title><style>
:root{font:16px/1.5 system-ui,sans-serif;color:#202936;background:#e4e6ec}body{max-width:1440px;margin:auto;padding:30px 24px 80px}h1{font-size:34px;margin-bottom:6px}h2{font-size:23px;margin:0 0 16px}header{max-width:960px;margin-bottom:32px}a{color:#23557a}nav{display:flex;flex-wrap:wrap;gap:16px}section{padding:24px;margin:24px 0;background:#f4f5f7;border:1px solid #c4cbd5;border-radius:12px}img{display:block;width:100%;height:auto;border-radius:5px}section p{color:#465367;margin-bottom:0}.note{padding:15px;border-left:4px solid #a7894d;background:#f2eee4}
</style><header><h1>Titan’s Rest · broken and weathered</h1><p>Phase 3 review: the regenerated fixed road, supported knuckles, peeled armour, snapped ribs, cut cables, and drifted sand. Phase 4 LODs await review.</p>
<p class="note">All production geometry is shown. The road and white Z = 0 sand plane are review context and are not exported. Material colours are the ten named production slots, lit for inspection. Clearance and seating measurements are recorded separately in the production reports.</p>
<nav><a href="../phase2/index.html">Phase 2 review</a><a href="../index.html">Standing sheet comparisons</a><a href="../../fit/plan.png">Road plan</a><a href="../../../../model-sheets/model-g4-titan-chest.png">G4 chest reference</a><a href="framing.json">Camera / render record</a></nav></header>''' + '\n'.join(sections) + '</html>\n'
    (OUT / 'index.html').write_text(gallery)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', nargs='*', default=[])
    parser.add_argument('--samples', type=int, default=16)
    parser.add_argument('--scale', type=int, default=100)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not 1 <= args.samples <= 24:
        raise ValueError('Review samples must be between 1 and 24.')
    if not 25 <= args.scale <= 100:
        raise ValueError('Review resolution scale must be between 25 and 100.')
    OUT.mkdir(parents=True, exist_ok=True)
    road = json.loads((FIT / 'road.json').read_text())
    pose = json.loads((FIT / 'pose.json').read_text())
    source_digest = hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()
    scene, camera, fill, meshes = setup_scene(args.samples, args.scale)
    views = make_views(road, pose, meshes)
    unknown = set(args.only) - {view['key'] for view in views}
    if unknown:
        raise ValueError('Unknown views: ' + ', '.join(sorted(unknown)))
    manifest = OUT / 'framing.json'
    records = json.loads(manifest.read_text()).get('views', {}) if manifest.exists() else {}
    for view in views:
        if args.only and view['key'] not in args.only:
            continue
        records[view['key']] = render_view(scene, camera, fill, view, OUT)
        records[view['key']]['sourceSha256'] = source_digest
        manifest.write_text(json.dumps({'phase': 3, 'blender': bpy.app.version_string,
                                       'source': 'titan-production.blend', 'sourceSha256': source_digest,
                                       'engine': 'EEVEE',
                                       'samples': args.samples, 'resolutionPercent': args.scale,
                                       'reviewSandZ': 0, 'productionSaved': False,
                                       'views': records}, indent=2) + '\n')
        write_gallery(views, records)
    print('TITAN_WEATHERED_RENDERS', str(OUT))
    print('Production file was not saved. Road transforms and production geometry were not changed.')


if __name__ == '__main__':
    main()

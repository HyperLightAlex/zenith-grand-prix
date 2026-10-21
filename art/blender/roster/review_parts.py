"""Render the actual tagged Blender production pieces for the parts audit.

Run: Blender -b --python art/blender/roster/review_parts.py -- --all
The source files are opened read-only: review colours/cameras are never saved.
Use --model NAME for one design. --allow-untagged is only for the initial
rule audit; final review images must be generated without it.
"""
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'art/blender/roster/previews/parts'
MODELS = ['sunhawk', 'daystar', 'rampart', 'razor', 'stinger', 'maul',
          'anubis', 'horus', 'sobek', 'seraph', 'longbow', 'paladin',
          'kamaitachi', 'fujin', 'raijin']
# Widely separated, deliberately non-faction colours. Both arms differ.
COLOURS = {'head': '#f9df32', 'shoulders': '#f36d21', 'chest': '#e93661',
           'backpack': '#7556d9', 'waist': '#94a5b5', 'hips': '#20b5ad',
           'armL': '#4e9fea', 'armR': '#293f98', 'thighs': '#95d440',
           'shins': '#bd70c5', 'feet': '#a47b49'}
JOINT_PARTS = {'head': 'head', 'wingL': 'backpack', 'wingR': 'backpack',
               'spine': 'waist', 'hips': 'hips', 'skirtL': 'hips',
               'skirtR': 'hips', 'skirtBack': 'hips', 'towerL': 'shoulders',
               'towerR': 'shoulders', 'elL': 'armL', 'wrL': 'armL',
               'elR': 'armR', 'wrR': 'armR', 'hipL': 'thighs',
               'hipR': 'thighs', 'kneeL': 'shins', 'kneeR': 'shins',
               'ankleL': 'feet', 'ankleR': 'feet'}
SUNHAWK_JOINTS = {'hips': 'hips', 'spine': 'spine', 'chest': 'chest', 'head': 'head',
    'shoulder.L': 'shL', 'elbow.L': 'elL', 'wrist.L': 'wrL',
    'shoulder.R': 'shR', 'elbow.R': 'elR', 'wrist.R': 'wrR',
    'hip.L': 'hipL', 'knee.L': 'kneeL', 'ankle.L': 'ankleL',
    'hip.R': 'hipR', 'knee.R': 'kneeR', 'ankle.R': 'ankleR',
    'wing.L': 'wingL', 'wing.R': 'wingR'}
SUNHAWK_SKIP = ('Solar crest', 'Solar center', 'Solar ray', 'Tower hazard',
                'Hazard bar', 'Race roundel', 'Race number')


def srgb_colour(hex_colour):
    rgb = [int(hex_colour[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def source_joint(ob, model):
    if model != 'sunhawk':
        return ob['joint']
    joint = SUNHAWK_JOINTS[ob.parent.name.split('JNT / ')[1]]
    if 'Pylon bracket' in ob.name or 'Tower ' in ob.name:
        return 'towerL' if joint == 'shL' else 'towerR'
    if any(s in ob.name for s in ('Floating hip shield', 'Hip brow', 'Rear pelvis plate', 'Rear cobalt clasp')):
        return 'hips'
    return joint


def rule_part(ob, joint):
    local = ob.parent.matrix_world.inverted() @ ob.matrix_world
    points = [local @ vertex.co for vertex in ob.data.vertices]
    centre = [(min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(3)]
    game = (centre[0], centre[2], -centre[1])
    if joint == 'chest':
        part = 'backpack' if game[2] < -.75 else 'chest'
    elif joint in ('shL', 'shR'):
        part = 'shoulders' if abs(game[0]) > .3 or game[1] > .1 else 'arm' + joint[-1]
    else:
        part = JOINT_PARTS[joint]
    return part, [round(c, 6) for c in game]


def render(model, allow_untagged=False):
    filename = ROOT / ('art/blender/sunhawk/sunhawk-production.blend' if model == 'sunhawk'
                       else f'art/blender/roster/{model}-production.blend')
    bpy.ops.wm.open_mainfile(filepath=str(filename))
    scene = next(s for s in bpy.data.scenes if s.get('sunhawk_production')) if model == 'sunhawk' else bpy.data.scenes['ROSTER / ' + model.title()]
    bpy.context.window.scene = scene
    scene.frame_set(1)
    selected = []
    inventory = []
    for ob in scene.objects:
        eligible = (ob.type == 'MESH' and
            ((model == 'sunhawk' and ob.name.startswith('B / ') and not any(s in ob.name for s in SUNHAWK_SKIP))
             or (model != 'sunhawk' and 'joint' in ob)))
        ob.hide_render = not eligible
        if not eligible:
            continue
        joint = ob.get('part_joint', source_joint(ob, model))
        rule, centre = rule_part(ob, joint)
        rule = ob.get('part_rule', rule)
        centre = list(ob.get('part_center_game', centre))
        part = ob.get('part')
        if not part and allow_untagged:
            part = rule
        if part not in COLOURS:
            raise ValueError(f'{model}: missing/invalid part on {ob.name}: {part!r}')
        ob.color = srgb_colour(COLOURS[part])
        for mod in ob.modifiers:
            if mod.type == 'SOLIDIFY':
                mod.show_render = mod.show_viewport = False
        selected.append(ob)
        inventory.append({'name': ob.name, 'source_piece': ob.get('part_source', ob.name),
                          'joint': joint, 'part': part, 'rule_part': rule,
                          'joint_local_game_centre': centre})
    if not selected:
        raise ValueError(f'No production pieces in {filename}')
    if model == 'sunhawk':
        for ob in scene.objects:
            if 'JNT / ankle.' in ob.name:
                ob.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    points = [ob.matrix_world @ Vector(corner) for ob in selected for corner in ob.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    target = (low + high) / 2
    height = high.z - low.z
    width = max(high.x - low.x, high.y - low.y)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'FLAT'
    scene.display.shading.color_type = 'OBJECT'
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = False
    scene.display.shading.show_specular_highlight = False
    scene.display.shading.show_object_outline = True
    scene.display.shading.object_outline_color = (.035, .045, .06)
    scene.display.shading.background_type = 'WORLD'
    if not scene.world:
        scene.world = bpy.data.worlds.new('Parts review background')
    scene.world.color = (.82, .84, .88)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.compression = 100
    scene.render.film_transparent = False
    camera_data = bpy.data.cameras.new('Part review camera')
    camera = bpy.data.objects.new('Part review camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = max(height * 1.12, width * 1.48)
    camera_data.lens = 50
    views = {'front': Vector((0, -1, 0)), 'back': Vector((0, 1, 0)),
             'rear-three-quarter': Vector((1, 1.5, .2)).normalized()}
    for view, direction in views.items():
        camera.location = target + direction * 30
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(OUT / f'{model}-{view}.png')
        bpy.ops.render.render(write_still=True)
    (OUT / f'{model}-pieces.json').write_text(json.dumps({'model': model,
        'blender_version': bpy.app.version_string, 'strict_tags': not allow_untagged,
        'pieces': inventory}, indent=2) + '\n')
    print(f'PART REVIEW {model}: {len(selected)} pieces, front/back/three-quarter rear')


def write_index():
    legend = ''.join(f'<li><i style="background:{colour}"></i><code>{part}</code></li>' for part, colour in COLOURS.items())
    sections = []
    for model in MODELS:
        if not (OUT / f'{model}-front.png').exists():
            continue
        views = ''.join(f'<figure><a href="{model}-{view}.png"><img src="{model}-{view}.png" alt="{model.title()} {label} part colours"></a><figcaption>{label}</figcaption></figure>'
                        for view, label in [('front', 'Front'), ('back', 'Back'), ('rear-three-quarter', 'Three-quarter rear')])
        sections.append(f'<section id="{model}"><h2>{model.title()}</h2><div class="views">{views}</div><a href="{model}-pieces.json">Source-piece audit</a></section>')
    (OUT / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><title>Zenith GP part tags</title>
<style>body{margin:0;background:#131922;color:#ecf0f5;font:16px system-ui}header{padding:20px 28px;background:#202b39;position:sticky;top:0;z-index:1}h1{font-size:24px;margin:0 0 10px}p{margin:8px 0}ul{list-style:none;display:flex;gap:16px;flex-wrap:wrap;padding:0;margin:12px 0 0}li{display:flex;gap:7px;align-items:center}i{width:20px;height:20px;display:block;border:1px solid white}.views{display:flex;gap:12px}figure{margin:0;flex:1;min-width:0}img{width:100%;display:block}figcaption{padding:8px}section{padding:24px;border-bottom:1px solid #536273}a{color:#a3cfff}code{font-size:14px}</style>
<header><h1>Zenith GP · Part tag review</h1><p>Actual Blender source pieces, in a single flat colour per swappable part. Front, back and three-quarter rear. Click a picture for full resolution.</p><p><a href="boundary-review.md">Boundary review and all overrides</a> · <a href="triangle-equivalence.json">Triangle and ink equivalence report</a></p><ul>''' + legend + '</ul></header>' + ''.join(sections) + '</html>\n')
    (OUT / 'palette.json').write_text(json.dumps(COLOURS, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', choices=MODELS)
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--allow-untagged', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    if not args.model and not args.all:
        parser.error('Choose --model NAME or --all')
    for name in MODELS if args.all else [args.model]:
        render(name, args.allow_untagged)
    write_index()

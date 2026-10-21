"""Review modelled faction badges and their replacement-emblem anchors.

Blender -b --python art/blender/roster/review_insignia.py -- --all
Use --model seraph for one design. Opens production scenes read-only and
renders the saved insignia tags/anchors; never changes or saves model assets.
"""
import argparse
import html
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'art/blender/roster/previews/insignia'
MODELS = ['daystar', 'rampart', 'razor', 'stinger', 'maul', 'anubis', 'horus',
          'sobek', 'seraph', 'longbow', 'paladin', 'kamaitachi', 'fujin', 'raijin']
BADGE_COLOURS = {'chest': '#ee8d24', 'shoulderL': '#995bdf', 'shoulderR': '#e34569'}
GUIDE_COLOURS = {'footprint': '#00b8d9', 'normal': '#e128c2', 'up': '#109447'}


def colour(hex_colour):
    rgb = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb) + (1,)


def cv(vec):
    """Game +Y up / +Z forward to Blender +Z up / -Y forward."""
    return Vector((vec[0], -vec[2], vec[1]))


def rod(scene, name, a, b, radius, hex_colour):
    delta = b - a
    if delta.length < 1e-8:
        return
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=delta.length,
        end_fill_type='NGON', location=(a + b) / 2)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    ob.color = colour(hex_colour)
    return ob


def arrow(scene, name, a, b, radius, hex_colour):
    rod(scene, name, a, b, radius, hex_colour)
    delta = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=radius * 3.5, radius2=0,
        depth=radius * 9, location=b)
    ob = bpy.context.object
    ob.name = name + ' tip'
    ob.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    ob.color = colour(hex_colour)


def overlay_text(scene, camera, text, x, y, size, hex_colour='#273547'):
    data = bpy.data.curves.new('Review label', 'FONT')
    data.body = text
    data.size = size
    data.align_y = 'TOP_BASELINE'
    ob = bpy.data.objects.new('Review label / ' + text, data)
    scene.collection.objects.link(ob)
    ob.parent = camera
    ob.location = (x, y, -10)
    ob.color = colour(hex_colour)
    return ob


def render(model):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / f'art/blender/roster/{model}-production.blend'))
    scene = bpy.data.scenes['ROSTER / ' + model.title()]
    bpy.context.window.scene = scene
    scene.frame_set(1)
    if 'insignia_json' not in scene:
        raise ValueError(f'{model}: production scene has no insignia_json; rebuild before review')
    anchors = json.loads(scene['insignia_json'])
    if not isinstance(anchors, list):
        raise ValueError(f'{model}: insignia_json must be a list')
    anchors_by_id = {anchor['id']: anchor for anchor in anchors}
    if len(anchors_by_id) != len(anchors):
        raise ValueError(f'{model}: duplicate anchor IDs')
    selected = []
    badges = []
    joints = {ob['roster_joint']: ob for ob in scene.objects if 'roster_joint' in ob}
    for ob in scene.objects:
        eligible = ob.type == 'MESH' and 'joint' in ob
        ob.hide_render = not eligible
        if not eligible:
            continue
        badge = ob.get('insignia')
        if badge and badge not in anchors_by_id:
            raise ValueError(f'{model}: {ob.name} has insignia without an anchor: {badge}')
        ob.color = colour(BADGE_COLOURS[badge] if badge else '#aab5c5')
        for mod in ob.modifiers:
            if mod.type == 'SOLIDIFY':
                mod.show_render = mod.show_viewport = False
        selected.append(ob)
        if badge:
            badges.append({'source': ob.get('part_source', ob.name), 'insignia': badge,
                           'joint': ob['joint'], 'part': ob['part'],
                           'insignia_anchor_method': ob.get('insignia_anchor_method', 'not recorded')})
    if set(anchors_by_id) != {badge['insignia'] for badge in badges}:
        raise ValueError(f'{model}: anchor IDs and tagged source badges differ')
    bpy.context.view_layer.update()
    world_points = [ob.matrix_world @ Vector(corner) for ob in selected for corner in ob.bound_box]
    low = Vector(tuple(min(p[i] for p in world_points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in world_points) for i in range(3)))
    target = (low + high) / 2
    guide_inventory = []
    for anchor in anchors:
        joint = joints[anchor['joint']]
        normal_local = cv(anchor['normal'])
        up_local = cv(anchor['up'])
        if abs(normal_local.length - 1) > .001 or abs(up_local.length - 1) > .001 or abs(normal_local.dot(up_local)) > .001:
            raise ValueError(f'{model}: anchor {anchor["id"]} needs an orthonormal frame')
        center = joint.matrix_world @ cv(anchor['center'])
        normal = (joint.matrix_world.to_3x3() @ normal_local).normalized()
        up = (joint.matrix_world.to_3x3() @ up_local).normalized()
        right = up.cross(normal).normalized()
        half = anchor['width'] / 2
        if half <= 0:
            raise ValueError(f'{model}: nonpositive anchor width')
        # Tiny guide-only lift prevents the footprint line from z-fighting with
        # the actual armour. The saved/exported anchor remains exactly as authored.
        display_center = center + normal * .018
        corners = [display_center + right * sx * half + up * sy * half
                   for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
        radius = max(.009, anchor['width'] * .012)
        for i in range(4):
            rod(scene, 'Review square / ' + anchor['id'], corners[i], corners[(i + 1) % 4], radius, GUIDE_COLOURS['footprint'])
        # Centre cross lies on the exact guide plane. Arrows show the actual
        # normal and upright vectors rather than screen-space directions.
        for axis in (right, up):
            rod(scene, 'Review centre / ' + anchor['id'], display_center - axis * half * .09,
                display_center + axis * half * .09, radius, GUIDE_COLOURS['footprint'])
        arrow(scene, 'Review outward normal / ' + anchor['id'], display_center,
              display_center + normal * anchor['width'] * .55, radius, GUIDE_COLOURS['normal'])
        start = display_center - right * half * 1.16
        arrow(scene, 'Review upright / ' + anchor['id'], start - up * half * .7,
              start + up * half * .7, radius, GUIDE_COLOURS['up'])
        guide_inventory.append(dict(anchor, square_corners_world=[list(c - normal * .018) for c in corners]))
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'FLAT'
    shading.color_type = 'OBJECT'
    shading.show_shadows = False
    shading.show_cavity = False
    shading.show_specular_highlight = False
    shading.show_object_outline = True
    shading.object_outline_color = (.035, .045, .06)
    shading.background_type = 'WORLD'
    if not scene.world:
        scene.world = bpy.data.worlds.new('Insignia review world')
    scene.world.color = (.82, .84, .88)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1400
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.compression = 75
    scene.render.dither_intensity = 0
    scene.render.film_transparent = False
    data = bpy.data.cameras.new('Insignia review camera')
    camera = bpy.data.objects.new('Insignia review camera', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type = 'ORTHO'
    data.ortho_scale = max((high.z - low.z) * 1.22, (high.x - low.x) * 1.58)
    overlay = []

    def render_view(view, direction, focus, scale, status, closeup=False):
        scene.render.resolution_x = 1100 if not closeup else 1000
        scene.render.resolution_y = 1400 if not closeup else 900
        data.ortho_scale = scale
        camera.location = focus + direction.normalized() * 30
        camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
        for ob in overlay:
            bpy.data.objects.remove(ob, do_unlink=True)
        overlay.clear()
        vertical = data.ortho_scale / 2 * min(1, scene.render.resolution_y / scene.render.resolution_x)
        horizontal = data.ortho_scale / 2 * min(1, scene.render.resolution_x / scene.render.resolution_y)
        size = data.ortho_scale * .017
        overlay.append(overlay_text(scene, camera, f'{model.upper()}  /  {view.replace("-", " ")}', -horizontal * .94, vertical * .95, size * 1.15))
        overlay.append(overlay_text(scene, camera, status, -horizontal * .94, vertical * .89, size * .68))
        labels = [('Cyan square + cross: replacement footprint and centre', GUIDE_COLOURS['footprint']),
            ('Green arrow: up     Magenta arrow: outward normal', GUIDE_COLOURS['up']),
            ('Highlighted: chest / left shoulder / right shoulder badges', '#765b33')]
        for i, (label, swatch) in enumerate(labels):
            overlay.append(overlay_text(scene, camera, label, -horizontal * .94, -vertical * (.83 + i * .05), size * .65, swatch))
        scene.render.filepath = str(OUT / f'{model}-{view}.png')
        bpy.ops.render.render(write_still=True)

    body_scale = data.ortho_scale
    status = f'{len(anchors)} replacement anchors / {len(badges)} badge pieces' if anchors else 'No modelled faction insignia — design motifs remain armour'
    for view, direction in [('front', Vector((0, -1, 0))), ('three-quarter', Vector((1, -1.7, .12)))]:
        render_view(view, direction, target, body_scale, status)
    for anchor in anchors:
        joint = joints[anchor['joint']]
        center = joint.matrix_world @ cv(anchor['center'])
        normal = (joint.matrix_world.to_3x3() @ cv(anchor['normal'])).normalized()
        up = (joint.matrix_world.to_3x3() @ cv(anchor['up'])).normalized()
        right = up.cross(normal).normalized()
        detail = f'{anchor["joint"]} / {anchor["part"]}   width {anchor["width"]:.4f} game units'
        # Look in from the outside of each shoulder so the breastplate
        # cannot hide the opposite shoulder's footprint in its close-up.
        side = -1 if anchor['id'] == 'shoulderR' else 1
        render_view('anchor-' + anchor['id'], normal + right * (.55 * side) + up * .12,
                    center, max(anchor['width'] * 2.9, .9), detail, closeup=True)
    (OUT / f'{model}-anchors.json').write_text(json.dumps({'model': model,
        'blender_version': bpy.app.version_string, 'badge_pieces': badges, 'anchors': guide_inventory,
        'review_guide_lift': .018}, indent=2) + '\n')
    print(f'INSIGNIA REVIEW {model}: {len(badges)} source pieces / {len(anchors)} anchors')


def write_index():
    sections = []
    for model in MODELS:
        inventory = OUT / f'{model}-anchors.json'
        if not inventory.exists():
            continue
        data = json.loads(inventory.read_text())
        views = ''.join(f'<figure><a href="{model}-{view}.png"><img src="{model}-{view}.png" alt="{model.title()} {view} insignia and anchors"></a><figcaption>{view.replace("-", " ").title()}</figcaption></figure>' for view in ['front', 'three-quarter'])
        if data['anchors']:
            rows = ''.join('<tr>' + ''.join(f'<td>{html.escape(str(a[k]))}</td>' for k in ['id', 'joint', 'part', 'center', 'normal', 'up', 'width']) + '</tr>' for a in data['anchors'])
            table = '<div class="scroll"><table><tr><th>Badge</th><th>Joint</th><th>Part</th><th>Centre</th><th>Normal</th><th>Up</th><th>Width</th></tr>' + rows + '</table></div>'
        else:
            table = '<p>No modelled faction insignia or replacement anchors. Existing design motifs stay as armour.</p>'
        details = ''.join(f'<figure><a href="{model}-anchor-{a["id"]}.png"><img src="{model}-anchor-{a["id"]}.png" alt="{model.title()} {a["id"]} anchor close-up"></a><figcaption>{a["id"]} · width {a["width"]:.4f}</figcaption></figure>' for a in data['anchors'])
        sections.append(f'<section id="{model}"><h2>{model.title()}</h2><div class="views">{views}</div><div class="details">{details}</div>{table}<p><a href="{model}-anchors.json">Exact anchors and source badges</a></p></section>')
    (OUT / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zenith GP insignia review</title>
<style>body{margin:0;background:#17202b;color:#eef3f8;font:16px system-ui}header{padding:24px;background:#253346}h1{margin:0 0 12px}section{padding:24px;border-bottom:1px solid #58687a}.views{display:flex;gap:18px}.details{display:flex;gap:18px;margin-top:16px}.details figure{max-width:720px}figure{margin:0;flex:1;min-width:0}img{width:100%;display:block}figcaption{padding:8px}a{color:#9dd8ff}.scroll{overflow:auto}table{border-collapse:collapse;margin-top:12px;font:13px ui-monospace,monospace}td,th{padding:8px;text-align:left;border:1px solid #58687a}.legend{display:flex;gap:18px;flex-wrap:wrap}.legend span{padding:7px 11px;border:1px solid #637386;border-radius:4px}</style>
<header><h1>Zenith GP · Faction insignia review</h1><p>Actual production geometry with badge pieces highlighted; cyan squares mark the replacement-emblem footprint. Front and three-quarter views. Click a picture for full resolution.</p>
<div class="legend"><span style="color:#ee8d24">Chest badge</span><span style="color:#b68be9">Left shoulder badge</span><span style="color:#f2718b">Right shoulder badge</span><span style="color:#00c6e9">Square + cross: width and centre</span><span style="color:#57ce85">Green: up</span><span style="color:#f36dda">Magenta: outward normal</span></div>
<p>Anchor vectors use game joint-local axes. Review guides have a 0.018-unit outward lift solely to prevent z-fighting; source geometry and exported anchors are unchanged.</p><p><a href="audit.md">Visual audit</a> · <a href="triangle-equivalence.json">Triangle and ink equivalence report</a></p></header>''' + ''.join(sections) + '</html>\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model', choices=MODELS)
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not args.all and not args.model:
        parser.error('Choose --all or --model NAME')
    OUT.mkdir(parents=True, exist_ok=True)
    for model in MODELS if args.all else [args.model]:
        render(model)
    write_index()

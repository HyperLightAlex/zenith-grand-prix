"""Load Titan's Rest's road and the space round it into the open Blender file,
for fitting the fallen titan to it. Run it in Blender 5.2:

    blender titan-production.blend --python art/blender/titan/fit/load_fit.py
    blender --background --python art/blender/titan/fit/load_fit.py -- --save art/blender/titan/fit/titan-fit-start.blend

It (re)makes one collection, FIT, holding:
  FIT/road       the deck, the slab under it and the barriers (road.obj)
  FIT/keepout    the space round the road the titan must leave empty (keepout.obj), drawn as wire
  FIT/sky        the sky over the road that should stay open (sky.obj), hidden at first
  FIT/guide      the placeholder titan where each part goes (guide.obj), drawn as wire
  FIT/targets    empties at the joints, the halo's centre and the sword's guard (pose.json)
Everything in FIT is locked against selection and excluded from export by
its name; run it again after the road changes. The files are in the game's
axes and import with Y up and -Z forward, so a game point (x, y, z) lands at
Blender (x, -z, y). Exported glTF with +Y up comes back to the game's axes.
"""
import json
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))


def collection(name, parent):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
    if c.name not in parent.children:
        parent.children.link(c)
    return c


def clear(c):
    for o in list(c.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for child in list(c.children):
        clear(child)
        bpy.data.collections.remove(child)


def import_obj(path, into):
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=path, forward_axis='NEGATIVE_Z', up_axis='Y')
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        into.objects.link(o)
        o.hide_select = True
    return new


def material(name, rgba):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = rgba
    return m


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    save = argv[argv.index('--save') + 1] if '--save' in argv else None
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.clip_end = 20000
    fit = collection('FIT', scene.collection)
    clear(fit)
    road = collection('FIT/road', fit)
    for o in import_obj(os.path.join(HERE, 'road.obj'), road):
        o.data.materials.append(material('FIT road', (0.25, 0.3, 0.4, 1)))
    keep = collection('FIT/keepout', fit)
    for o in import_obj(os.path.join(HERE, 'keepout.obj'), keep):
        o.display_type = 'WIRE'
        o.data.materials.append(material('FIT keepout', (1, 0.2, 0.2, 1)))
    sky = collection('FIT/sky', fit)
    for o in import_obj(os.path.join(HERE, 'sky.obj'), sky):
        o.display_type = 'WIRE'
        o.hide_set(True)
    guide = collection('FIT/guide', fit)
    for o in import_obj(os.path.join(HERE, 'guide.obj'), guide):
        o.display_type = 'WIRE'
    targets = collection('FIT/targets', fit)
    pose = json.load(open(os.path.join(HERE, 'pose.json')))
    def empty(name, at, size, kind='SPHERE'):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = kind
        e.empty_display_size = size
        e.location = Vector(at)
        targets.objects.link(e)
        e.hide_select = True
        return e
    for name, p in pose['joints'].items():
        empty(f'FIT/target/{name}', p['blender'], 20)
    empty('FIT/target/halo', pose['halo']['centre']['blender'], pose['halo']['minInnerRadius'], 'CIRCLE').rotation_euler = Vector(pose['halo']['axis']['blender']).to_track_quat('Z', 'Y').to_euler()
    guard = empty('FIT/target/sword guard', pose['sword']['guard']['blender'], 30, 'SINGLE_ARROW')
    guard.rotation_euler = Vector(pose['sword']['towardPoint']['blender']).to_track_quat('Z', 'Y').to_euler()
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(save), compress=True)
    print(f"FIT loaded: road, keep-out, sky, guide and {len(pose['joints']) + 2} targets")


main()

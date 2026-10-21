"""Rigid customization parts; classification never edits source geometry.

The split planes are in game joint-local axes: +Y up, +Z forward, +X left.
Overrides use explicit, stable source-piece names and always carry a reason.
"""
import json
from collections import defaultdict
from pathlib import Path

PARTS = ('head', 'shoulders', 'chest', 'backpack', 'waist', 'hips',
         'armL', 'armR', 'thighs', 'shins', 'feet')
JOINT_PARTS = {
    'head': ('head',), 'chest': ('chest', 'backpack'), 'spine': ('waist',),
    'hips': ('hips',), 'skirtL': ('hips',), 'skirtR': ('hips',), 'skirtBack': ('hips',),
    'wingL': ('backpack',), 'wingR': ('backpack',),
    'towerL': ('shoulders',), 'towerR': ('shoulders',),
    'shL': ('armL', 'shoulders'), 'elL': ('armL',), 'wrL': ('armL',),
    'shR': ('armR', 'shoulders'), 'elR': ('armR',), 'wrR': ('armR',),
    'hipL': ('thighs',), 'hipR': ('thighs',),
    'kneeL': ('shins',), 'kneeR': ('shins',),
    'ankleL': ('feet',), 'ankleR': ('feet',),
}
OVERRIDES = json.loads((Path(__file__).parent / 'roster/part-overrides.json').read_text())


def rule_part(joint, center_game):
    x, y, z = center_game
    if joint == 'chest':
        return 'backpack' if z < -.75 else 'chest'
    if joint in ('shL', 'shR'):
        return 'shoulders' if abs(x) > .3 or y > .1 else 'arm' + joint[-1]
    return JOINT_PARTS[joint][0]


def classify(model, ob, joint, center_game):
    source = ob.get('part_source', ob.name)
    initial = rule_part(joint, center_game)
    override = OVERRIDES.get('models', {}).get(model, {}).get(source)
    part = override['part'] if override else initial
    if part not in JOINT_PARTS[joint]:
        raise ValueError(f'{model}: {source}: {part} is incompatible with {joint}')
    if override and not override.get('reason', '').strip():
        raise ValueError(f'{model}: {source}: override needs a review reason')
    ob['part'] = part
    ob['part_rule'] = initial
    ob['part_center_game'] = list(center_game)
    if override:
        ob['part_reason'] = override['reason']
    elif 'part_reason' in ob:
        del ob['part_reason']
    return part


def check_overrides(model, objects):
    """Fail a rebuild if a reviewed piece was renamed or silently disappeared."""
    actual = {ob.get('part_source', ob.name) for ob in objects}
    missing = set(OVERRIDES.get('models', {}).get(model, {})) - actual
    if missing:
        raise ValueError(f'{model}: stale part overrides: {sorted(missing)}')


def export_part_lines(scene, root, segments, material, separator='/'):
    """Preserve the old per-joint first-occurrence ink dedup, then split parts.

    Input stays in source traversal order, including duplicate endpoints. Doing
    the dedup independently in each part would create extra coincident strokes.
    The winning source piece owns the stroke; its effective legacy category
    is preserved below, including the Blender loose-edge exporter ordering.
    """
    import bpy
    by_joint = defaultdict(list)
    seen = defaultdict(set)
    for joint, part, a, b, kind in segments:
        key = tuple(sorted((tuple(round(v, 5) for v in a), tuple(round(v, 5) for v in b))))
        if key in seen[joint]:
            continue
        seen[joint].add(key)
        by_joint[joint].append((part, a, b, kind))
    groups = defaultdict(list)
    for joint, strokes in by_joint.items():
        # Blender 5.2.2's glTF loose-edge path sorts the vertex_index/FLOAT
        # attribute records by their uint64 representation, while POSITION
        # keeps vertex-index order. Thus the pre-parts GLBs carry sorted kinds
        # across each original joint's ordered strokes. Preserve that effective
        # runtime stream before partitioning it; each part's monotone subsequence
        # then survives the exporter unchanged. Source design_edges is untouched.
        # tools/parts-compare.mjs checks these categories as well as endpoints.
        effective_kinds = sorted(kind for part, a, b, kind in strokes)
        for (part, a, b, source_kind), kind in zip(strokes, effective_kinds):
            groups[(joint, part)].append((a, b, kind))
    meshes = []
    count = 0
    for (joint, part), strokes in sorted(groups.items()):
        name = separator.join((joint, part, 'LINES'))
        vs = [p for a, b, kind in strokes for p in (a, b)]
        kinds = [kind for a, b, kind in strokes]
        me = bpy.data.meshes.new(name)
        me.from_pydata(vs, [(i, i + 1) for i in range(0, len(vs), 2)], [])
        me.update()
        attr = me.attributes.new('_LINE_KIND', 'FLOAT', 'POINT')
        for item, value in zip(attr.data, [kind for kind in kinds for _ in (0, 1)]):
            item.value = value
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        ob.parent = root
        ob['joint'] = joint
        ob['part'] = part
        ob['ink_lines'] = 1
        ob['line_kinds'] = kinds
        me.materials.append(material)
        meshes.append(me)
        count += len(strokes)
    return meshes, count

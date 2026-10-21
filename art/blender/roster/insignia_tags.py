"""Exact faction-badge selection and joint-local replacement anchors.

Only the named badge reliefs are tagged: their backing shields, decorative
lightning, sword-shaped equipment and faction-shaped armour remain ordinary
parts. This module never edits vertices, modifiers, paint, or outlines.
"""
from collections import defaultdict

AURORA_PIECES = (
    'chest / Aurora / sword sigil',
    'chest / Aurora / sword guard',
    'chest / Aurora / sigil feather',
    *(f'chest / Aurora / sigil feather [{i}]' for i in range(2, 7)),
)
# Exact stable authoring identities, not Blender's scene-dependent .001 names.
BADGES = {
    model: {'chest': AURORA_PIECES}
    for model in ('seraph', 'longbow', 'paladin')
}
for _model in ('kamaitachi', 'fujin', 'raijin'):
    _shoulder = 'Fujin / shoulder lightning' if _model == 'fujin' else 'Tempest / centred shoulder bolt'
    BADGES[_model] = {
        'chest': ('chest / Tempest / centred chest bolt',),
        'shoulderL': ('shL / ' + _shoulder,),
        'shoulderR': ('shR / ' + _shoulder,),
    }


def _support_source(model, badge):
    if model in ('seraph', 'longbow', 'paladin'):
        return ('chest / Seraph / pearl heart cuirass' if model == 'seraph'
                else 'chest / Aurora / pearl lower breastplate')
    if badge == 'chest':
        return 'chest / Tempest / dark storm shield'
    joint = 'sh' + badge[-1]
    return joint + (' / Fujin / rounded shoulder turbine armor' if model == 'fujin'
                    else ' / Tempest / shoulder storm field')


def _game(point):
    from mathutils import Vector
    return Vector((point.x, point.z, -point.y))


def _geometry(ob, depsgraph):
    """Read evaluated LOD0 geometry in its joint frame, without changing it."""
    ev = ob.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    try:
        mesh.calc_loop_triangles()
        points = [_game(ob.matrix_local @ vertex.co) for vertex in mesh.vertices]
        triangles = [tuple(points[i] for i in triangle.vertices) for triangle in mesh.loop_triangles]
        return points, triangles
    finally:
        ev.to_mesh_clear()


def _front_z(triangles, x, y):
    """Outer surface hit by a +Z game-axis ray at one XY sample."""
    hits = []
    for a, b, c in triangles:
        den = (b.y-c.y)*(a.x-c.x) + (c.x-b.x)*(a.y-c.y)
        if abs(den) < 1e-10:
            continue
        u = ((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y)) / den
        v = ((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y)) / den
        if min(u, v, 1-u-v) >= -1e-6:
            hits.append(u*a.z+v*b.z+(1-u-v)*c.z)
    return max(hits) if hits else None


def _surface_normal(points, support_triangles):
    """Fit a tangent to symmetric samples of the actual badge support.

    A bolt is chiral: averaging its own face normals would bias the anchor
    towards whichever half of a curved shield has more lightning area. A
    symmetric 5x5 support sample gives the same mount basis to paired badges.
    Aurora's fitted relief and Fujin's rounded turbine are handled equally.
    """
    from mathutils import Matrix, Vector
    lo = [min(p[i] for p in points) for i in range(2)]
    hi = [max(p[i] for p in points) for i in range(2)]
    cx, cy = [(a+b)/2 for a, b in zip(lo, hi)]
    samples = []
    for iy in range(5):
        y = lo[1] + (hi[1]-lo[1])*iy/4
        for ix in range(5):
            x = lo[0] + (hi[0]-lo[0])*ix/4
            z = _front_z(support_triangles, x, y)
            if z is not None:
                samples.append((x-cx, y-cy, z))
    if len(samples) < 9:
        raise ValueError('Insignia support does not cover its badge: fewer than 9 surface samples')
    rows = [Vector((x, y, 1)) for x, y, z in samples]
    matrix = Matrix([[sum(r[i]*r[j] for r in rows) for j in range(3)] for i in range(3)])
    if abs(matrix.determinant()) < 1e-12:
        raise ValueError('Insignia support samples do not define a surface plane')
    rhs = Vector(tuple(sum(r[i]*s[2] for r, s in zip(rows, samples)) for i in range(3)))
    slope = matrix.inverted() @ rhs
    return Vector((-slope.x, -slope.y, 1)).normalized()


def _anchor(model, badge, objects, support, depsgraph):
    from mathutils import Vector
    from mathutils.geometry import closest_point_on_tri, intersect_ray_tri
    points, triangles = [], []
    for ob in objects:
        vertices, faces = _geometry(ob, depsgraph)
        points.extend(vertices)
        triangles.extend(faces)
    if not points or not triangles:
        raise ValueError(f'{model}/{badge}: empty insignia geometry')
    support_points, support_triangles = _geometry(support, depsgraph)
    normal = _surface_normal(points, support_triangles)
    up = Vector((0, 1, 0))
    up = (up-normal*up.dot(normal)).normalized()
    right = up.cross(normal).normalized()
    projected = [(p.dot(right), p.dot(up)) for p in points]
    low = [min(p[i] for p in projected) for i in range(2)]
    high = [max(p[i] for p in projected) for i in range(2)]
    center = right*((low[0]+high[0])/2) + up*((low[1]+high[1])/2)
    origin = center + normal*(max(p.dot(normal) for p in points)+1)
    front = [tri for tri in triangles
             if (tri[1]-tri[0]).cross(tri[2]-tri[0]).normalized().dot(normal) > .2]
    hits = [hit for a, b, c in front
            if (hit := intersect_ray_tri(a, b, c, -normal, origin, True)) is not None]
    method = 'visible badge surface'
    if hits:
        # The outermost hit is the actual relief surface, not its volume centre
        # or a floating plane outside the highest point of a curved badge.
        center = max(hits, key=lambda p: p.dot(normal))
    else:
        # A multi-piece sword/feather badge can have negative space at its
        # centre. Extend the nearest front triangle's tangent into that gap.
        # This keeps the replacement on the seated badge surface, with no
        # renderer offset baked into its model-space centre.
        target = Vector(((low[0]+high[0])/2, (low[1]+high[1])/2, 0))
        candidates = []
        for a, b, c in front:
            flat = [Vector((p.dot(right), p.dot(up), 0)) for p in (a, b, c)]
            near = closest_point_on_tri(target, *flat)
            face_normal = (b-a).cross(c-a).normalized()
            denominator = face_normal.dot(normal)
            if denominator > .2:
                depth = face_normal.dot(a-center)/denominator
                candidates.append(((near-target).length_squared, depth))
        if not candidates:
            raise ValueError(f'{model}/{badge}: no outward insignia surface')
        center += normal*min(candidates, key=lambda candidate: candidate[0])[1]
        method = 'nearest front triangle extended across badge negative space'
    width = max(high[i]-low[i] for i in range(2))*1.02
    if width <= 0:
        raise ValueError(f'{model}/{badge}: zero-width insignia')
    for ob in objects:
        ob['insignia_anchor_method'] = method
    return {
        'id': badge, 'joint': objects[0]['joint'], 'part': objects[0]['part'],
        'center': list(center), 'normal': list(normal), 'up': list(up), 'width': width,
    }


def tag_insignias(model, objects):
    """Tag exactly the specified source pieces; return one anchor per badge.

    Call after the final polish and part classification, before adding export
    LOD modifiers. The exact identities make a renamed or missing badge a hard
    rebuild error instead of silently retaining another faction's insignia.
    """
    import bpy
    objects = list(objects)
    by_source = defaultdict(list)
    for ob in objects:
        by_source[ob.get('part_source', ob.name)].append(ob)
    badges = BADGES.get(model, {})
    expected_sources = {source for sources in badges.values() for source in sources}
    unexpected = [ob.get('part_source', ob.name) for ob in objects
                  if ob.get('insignia') and ob.get('part_source', ob.name) not in expected_sources]
    if unexpected:
        raise ValueError(f'{model}: unexpected pre-existing insignias: {unexpected}')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    anchors = []
    for badge, sources in badges.items():
        selected = []
        joint = 'chest' if badge == 'chest' else 'sh'+badge[-1]
        part = 'chest' if badge == 'chest' else 'shoulders'
        for source in sources:
            matches = by_source[source]
            if len(matches) != 1:
                raise ValueError(f'{model}: expected exactly one insignia {source!r}; found {len(matches)}')
            ob = matches[0]
            if ob.type != 'MESH' or ob.get('joint') != joint or ob.get('part') != part:
                raise ValueError(f'{model}: insignia {source!r} must be a mesh on {joint}/{part}')
            ob['insignia'] = badge
            selected.append(ob)
        support_source = _support_source(model, badge)
        support_matches = by_source[support_source]
        if len(support_matches) != 1:
            raise ValueError(f'{model}: expected exactly one insignia support {support_source!r}; found {len(support_matches)}')
        support = support_matches[0]
        if support.get('joint') != joint or support.get('part') != part:
            raise ValueError(f'{model}: insignia support {support_source!r} must belong to {joint}/{part}')
        anchors.append(_anchor(model, badge, selected, support, depsgraph))
    return anchors


def export_insignia_lines(scene, root, segments, material):
    """Keep legacy joint-global ink dedup/categories before badge partitioning.

    The winning source piece owns coincident ink, exactly as export_part_lines.
    Sorting effective kinds BEFORE splitting retains the Blender 5.2.2 loose-
    edge attribute-order behaviour and the baseline runtime segment stream.
    Input: (joint, part, insignia-or-empty, a, b, kind), in source traversal order.
    Returns mesh datablocks for the export caller's existing cleanup.
    """
    import bpy
    by_joint = defaultdict(list)
    seen = defaultdict(set)
    for joint, part, insignia, a, b, kind in segments:
        key = tuple(sorted((tuple(round(v, 5) for v in a), tuple(round(v, 5) for v in b))))
        if key in seen[joint]:
            continue
        seen[joint].add(key)
        by_joint[joint].append((part, insignia, a, b, kind))
    groups = defaultdict(list)
    for joint, strokes in by_joint.items():
        effective_kinds = sorted(kind for part, insignia, a, b, kind in strokes)
        for (part, insignia, a, b, source_kind), kind in zip(strokes, effective_kinds):
            groups[(joint, part, insignia)].append((a, b, kind))
    meshes = []
    count = 0
    for (joint, part, insignia), strokes in sorted(groups.items()):
        name = '/'.join((joint, part, 'LINES') + (('insignia-' + insignia,) if insignia else ()))
        vertices = [p for a, b, kind in strokes for p in (a, b)]
        kinds = [kind for a, b, kind in strokes]
        me = bpy.data.meshes.new(name)
        me.from_pydata(vertices, [(i, i+1) for i in range(0, len(vertices), 2)], [])
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
        if insignia:
            ob['insignia'] = insignia
            ob['slot'] = 'D'
        me.materials.append(material)
        meshes.append(me)
        count += len(strokes)
    return meshes, count

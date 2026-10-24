"""Exact surface subtraction for the Phase 2 Titan road fit.

The fit files use game axes; meshes and public ``make_box`` use Blender world
axes.  Unlike the game's disposable preview cut, this retains the part of each
triangle outside the union of road boxes, including large faces whose corners
are all outside.  It intentionally does not cap wounds: the authored chamber,
corridor and wound framing supplies their visible interiors.

Import bpy before any optional bmesh import when run with pip's bpy.
"""
import json
import math
from dataclasses import dataclass

import bpy
import numpy as np
from mathutils import Matrix

EPS = 1e-8
MIN_AREA_SQUARED = 1e-14


@dataclass
class ClipBox:
    """Intersection of six half-spaces, with a conservative world AABB."""
    planes: tuple  # (nx, ny, nz, constant); inside means n.dot(point) <= constant
    minimum: np.ndarray
    maximum: np.ndarray
    label: str = ''
    piece: str = ''
    sample: int = -1


def game_to_blender(vector):
    return (float(vector[0]), -float(vector[2]), float(vector[1]))


def make_box(center, axes, ranges, label='', piece='', sample=-1):
    """Make a box in Blender world space.

    ``axes`` is three row vectors; ``ranges`` is three (low, high) distances
    along those vectors from ``center``. They need not be perfectly orthogonal:
    the supplied half-spaces are honored exactly, matching rounded road.json.
    """
    c = np.asarray(center, dtype=np.float64)
    a = np.asarray(axes, dtype=np.float64)
    bounds = np.asarray(ranges, dtype=np.float64)
    if c.shape != (3,) or a.shape != (3, 3) or bounds.shape != (3, 2):
        raise ValueError('make_box requires center[3], axes[3][3], ranges[3][2]')
    if not np.isfinite(c).all() or not np.isfinite(a).all() or not np.isfinite(bounds).all():
        raise ValueError('Non-finite clipping box')
    if np.any(bounds[:, 0] >= bounds[:, 1]):
        raise ValueError('Clipping box has an empty axis')
    inv = np.linalg.inv(a)
    corners = np.array([[x, y, z] for x in bounds[0] for y in bounds[1] for z in bounds[2]]) @ inv.T + c
    planes = []
    for axis, bound in zip(a, bounds):
        offset = float(axis @ c)
        planes.append((float(axis[0]), float(axis[1]), float(axis[2]), offset + float(bound[1])))
        planes.append((-float(axis[0]), -float(axis[1]), -float(axis[2]), -offset - float(bound[0])))
    return ClipBox(tuple(planes), corners.min(0) - EPS, corners.max(0) + EPS, label, piece, sample)


def load_road_boxes(road_path, margin=0.8):
    """Return hard and sky box lists, one pair per route and road sample.

    A non-forked sample contributes just one box. At the Hull fork the two
    routes stay independent: their inner edge stops at the back of its median
    wall. This preserves the space between diverging routes for real structure.
    """
    with open(road_path, encoding='utf8') as stream:
        road = json.load(stream)
    k = road['KEEP_OUT']
    pieces = {p['index']: p['name'] or '#%s' % p['index'] for p in road['pieces']}
    hard, sky = [], []
    for sample in road['samples']:
        center = game_to_blender(sample['p'])
        axes = [game_to_blender(sample[key]) for key in ('t', 'r', 'u')]
        hw = sample['hw'] + k['side']
        median = sample['median'] - k['side']
        left, right = sample['shift']
        rise_left, rise_right = sample['rise']
        forked = sample['median'] > 0.01 or left != 0 or right != 0 or rise_left != 0 or rise_right != 0
        routes = [(-hw + left, -median + left, rise_left),
                  (median + right, hw + right, rise_right)] if forked else [(-hw, hw, 0)]
        for route, (lo, hi, rise) in enumerate(routes):
            for collection, up in ((hard, k['up']), (sky, k['sky'])):
                collection.append(make_box(
                    center, axes,
                    ((-road['ds'] - margin, road['ds'] + margin),
                     (lo - margin, hi + margin),
                     (-k['down'] + rise - margin, up + rise + margin)),
                    label='sample-%s-route-%s-up-%s' % (sample['i'], route, up),
                    piece=pieces[sample['piece']], sample=sample['i']))
    return hard, sky


def _distance(point, plane):
    return point[0] * plane[0] + point[1] * plane[1] + point[2] * plane[2] - plane[3]


def _clean_polygon(polygon):
    if not polygon:
        return []
    cleaned = [polygon[0]]
    for point in polygon[1:]:
        previous = cleaned[-1]
        if sum((point[i] - previous[i]) ** 2 for i in range(3)) > EPS * EPS:
            cleaned.append(point)
    if len(cleaned) > 1 and sum((cleaned[0][i] - cleaned[-1][i]) ** 2 for i in range(3)) <= EPS * EPS:
        cleaned.pop()
    return cleaned if len(cleaned) >= 3 else []


def _split_polygon(polygon, plane):
    """Split a convex polygon into inside/outside portions of one plane."""
    distances = [_distance(point, plane) for point in polygon]
    if max(distances) <= EPS:
        return polygon, []
    if min(distances) >= -EPS:
        return [], polygon
    inner, outer = [], []
    previous = polygon[-1]
    previous_d = distances[-1]
    for current, current_d in zip(polygon, distances):
        previous_inside, current_inside = previous_d <= 0, current_d <= 0
        if previous_inside != current_inside:
            fraction = previous_d / (previous_d - current_d)
            crossing = tuple(previous[i] + (current[i] - previous[i]) * fraction for i in range(3))
            inner.append(crossing)
            outer.append(crossing)
        (inner if current_inside else outer).append(current)
        previous, previous_d = current, current_d
    return _clean_polygon(inner), _clean_polygon(outer)


def subtract_polygon(polygon, box):
    """Return convex polygon fragments outside a box; no triangle sampling."""
    inside = polygon
    outside = []
    for plane in box.planes:
        inside, fragment = _split_polygon(inside, plane)
        if fragment:
            outside.append(fragment)
        if not inside:
            break
    return outside


def _polygon_overlaps(polygon, box):
    # Cheap AABB rejection first; exact single-plane rejection avoids splitting
    # polygons close to a rotated box that do not actually overlap it.
    for axis in range(3):
        values = [v[axis] for v in polygon]
        if max(values) < box.minimum[axis] or min(values) > box.maximum[axis]:
            return False
    for plane in box.planes:
        if min(_distance(point, plane) for point in polygon) >= EPS:
            return False
    return True


def _tri_area_squared(a, b, c):
    x1, y1, z1 = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    x2, y2, z2 = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    x, y, z = y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2
    return x * x + y * y + z * z


def subtract_boxes(obj, boxes):
    """Subtract the union of ClipBoxes from one baked mesh, preserving tags.

    Mesh coordinates are read through matrix_world and written as world-space
    positions with identity transform. Materials are copied by slot and every
    output face uses its original triangle's material. Output faces are flat
    shaded, so cut edges preserve the blockout's sharp mechanical normals.
    No UV, image or other generated attribute is created. Returns statistics.
    """
    if obj.type != 'MESH':
        raise ValueError('subtract_boxes requires a mesh object')
    if obj.modifiers:
        raise ValueError('%s must be baked before clipping (has modifiers)' % obj.name)
    mesh = obj.data
    mesh.calc_loop_triangles()
    mw = obj.matrix_world
    positions = np.asarray([tuple(mw @ vertex.co) for vertex in mesh.vertices], dtype=np.float64)
    triangles = [(tuple(triangle.vertices), triangle.material_index) for triangle in mesh.loop_triangles]
    stats = dict(object=obj.name, source_triangles=len(triangles), output_triangles=0,
                 candidate_boxes=0, clipped_triangles=0, removed_triangles=0,
                 tested_fragments=0, output_vertices=0)
    if not len(positions) or not triangles or not boxes:
        stats.update(output_triangles=len(triangles), output_vertices=len(positions))
        return stats
    obj_min, obj_max = positions.min(0), positions.max(0)
    candidates = [box for box in boxes if np.all(box.maximum >= obj_min) and np.all(box.minimum <= obj_max)]
    stats['candidate_boxes'] = len(candidates)
    if not candidates:
        stats.update(output_triangles=len(triangles), output_vertices=len(positions))
        return stats
    box_min = np.asarray([box.minimum for box in candidates])
    box_max = np.asarray([box.maximum for box in candidates])
    new_vertices, new_faces, materials = [], [], []
    lookup = {}

    def vertex_index(point):
        # Shared intersections are welded to micrometre precision. This is six
        # orders below the deliberate clearance margin and prevents seam cracks.
        key = tuple(round(float(value), 6) for value in point)
        found = lookup.get(key)
        if found is None:
            found = len(new_vertices)
            lookup[key] = found
            new_vertices.append(tuple(float(value) for value in point))
        return found

    for indices, material in triangles:
        tri = positions[list(indices)]
        near = np.flatnonzero(np.all(box_max >= tri.min(0), axis=1) & np.all(box_min <= tri.max(0), axis=1))
        polygons = [[tuple(v) for v in tri]]
        changed = False
        for box_index in near:
            box = candidates[box_index]
            kept = []
            for polygon in polygons:
                if _polygon_overlaps(polygon, box):
                    stats['tested_fragments'] += 1
                    fragments = subtract_polygon(polygon, box)
                    changed = True
                    kept.extend(fragments)
                else:
                    kept.append(polygon)
            polygons = kept
            if not polygons:
                break
        if changed:
            stats['clipped_triangles'] += 1
        if not polygons:
            stats['removed_triangles'] += 1
        for polygon in polygons:
            for i in range(1, len(polygon) - 1):
                a, b, c = polygon[0], polygon[i], polygon[i + 1]
                if _tri_area_squared(a, b, c) <= MIN_AREA_SQUARED:
                    continue
                face = (vertex_index(a), vertex_index(b), vertex_index(c))
                if len(set(face)) != 3:
                    continue
                new_faces.append(face)
                materials.append(material)
    replacement = bpy.data.meshes.new(mesh.name + '/road-fit')
    replacement.from_pydata(new_vertices, [], new_faces)
    for material in mesh.materials:
        replacement.materials.append(material)
    for polygon, material in zip(replacement.polygons, materials):
        polygon.material_index = material
        polygon.use_smooth = False
    replacement.update()
    obj.data = replacement
    obj.matrix_world = Matrix.Identity(4)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
    stats.update(output_triangles=len(new_faces), output_vertices=len(new_vertices))
    return stats


def _metadata_exemptions(obj):
    value = obj.get('titan_sky_exceptions', [])
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            value = [piece.strip() for piece in value.split(',') if piece.strip()]
    return set(value)


def clip_objects(objects, road_path, margin=0.8, sky_exemptions=None, progress=True):
    """Clip baked objects clear of hard keepout and non-exempt sky boxes.

    ``sky_exemptions`` may be a callable obj -> iterable of exact road piece
    names, or a dict keyed by object name. Otherwise the object's explicit
    ``titan_sky_exceptions`` property is read. Only three piece names are legal:
    'the Long Flank', 'the Halo', and 'the Hull'. Set these ONLY on their approved
    left-arm, halo, and Hull-roof objects respectively. All hard boxes always
    apply, even on an exempt object. The default is no sky exemption.
    """
    hard, sky = load_road_boxes(road_path, margin)
    allowed = {'the Long Flank', 'the Halo', 'the Hull'}
    selections = {}
    results = []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        if callable(sky_exemptions):
            exempt = set(sky_exemptions(obj))
        elif sky_exemptions is not None:
            exempt = set(sky_exemptions.get(obj.name, []))
        else:
            exempt = _metadata_exemptions(obj)
        if exempt - allowed:
            raise ValueError('%s has non-approved sky exceptions: %s' % (obj.name, sorted(exempt - allowed)))
        key = tuple(sorted(exempt))
        if key not in selections:
            selections[key] = [hard_box if hard_box.piece in exempt else sky_box
                               for hard_box, sky_box in zip(hard, sky)]
        stats = subtract_boxes(obj, selections[key])
        stats['sky_exceptions'] = list(key)
        results.append(stats)
        if progress and stats['clipped_triangles']:
            print('FIT %s: %s -> %s triangles (%s clipped, %s removed)' %
                  (obj.name, stats['source_triangles'], stats['output_triangles'],
                   stats['clipped_triangles'], stats['removed_triangles']), flush=True)
    return {'margin_m': margin, 'objects': results,
            'source_triangles': sum(r['source_triangles'] for r in results),
            'output_triangles': sum(r['output_triangles'] for r in results),
            'clipped_triangles': sum(r['clipped_triangles'] for r in results),
            'removed_triangles': sum(r['removed_triangles'] for r in results)}

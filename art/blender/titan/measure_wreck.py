"""Measure road seating on the saved, evaluated TITAN surfaces without editing it.

Run from the repository root with Blender 5.2:
  blender --background art/blender/titan/titan-production.blend --python \
    art/blender/titan/measure_wreck.py -- [--output report.json]

At every road.json sample of each ON stretch, cast down in the road's own
banked up direction from the actual slab bottom (6.2 m below its deck).
Cross-width stations include both edges and the centre, no farther than
--width-step apart (2 m by default). This measures the nearest real triangle,
not sampled model vertices or the highest point anywhere across the road.
It is a seating audit, not a substitute for check_clearance.py --strict.
No object, mesh, material, pose, FIT data or blend file is changed.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
SLAB_DEPTH = 6.2


def game_to_blender(v):
    return Vector((v[0], -v[2], v[1]))


def round_number(value):
    return round(float(value), 4)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def make_surface(collection):
    """World-space evaluated triangles with stable face-to-source lookup."""
    deps = bpy.context.evaluated_depsgraph_get()
    vertices, triangles, sources = [], [], []
    for obj in sorted(collection.all_objects, key=lambda o: o.name):
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            offset = len(vertices)
            vertices.extend(evaluated.matrix_world @ v.co for v in mesh.vertices)
            source = {'object': obj.name, 'part': obj.get('part', obj.get('titan_part', 'UNTAGGED'))}
            for tri in mesh.loop_triangles:
                triangles.append(tuple(offset + i for i in tri.vertices))
                sources.append(source)
        finally:
            evaluated.to_mesh_clear()
    if not triangles:
        raise RuntimeError('TITAN has no evaluated mesh triangles')
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=0.0), sources, len(triangles)


def lanes(sample):
    """Actual deck intervals. ON stretches currently have no forks, but honour them."""
    hw = sample['hw']
    median = sample.get('median', 0)
    for side, lo, hi in ((0, -hw, -median), (1, median, hw)):
        if not sample.get('road', [1, 1])[side]:
            continue
        shift = sample.get('shift', [0, 0])[side]
        rise = sample.get('rise', [0, 0])[side]
        yield lo + shift, hi + shift, rise


def stations(sample, width_step):
    """No duplicate centre station; each half includes its endpoints."""
    points = {}
    for lo, hi, rise in lanes(sample):
        n = max(1, math.ceil((hi - lo) / width_step))
        for i in range(n + 1):
            d = lo + (hi - lo) * i / n
            points[(round(d, 8), round(rise, 8))] = (d, rise)
    return sorted(points.values())


def measure_ray(sample, across, rise, bvh, sources, max_gap):
    p = game_to_blender(sample['p'])
    right = game_to_blender(sample['r']).normalized()
    up = game_to_blender(sample['u']).normalized()
    origin = p + right * across + up * (rise - SLAB_DEPTH)
    epsilon = 0.001
    location, normal, face, distance = bvh.ray_cast(origin + epsilon * up, -up, max_gap + epsilon)
    record = {'d': round_number(across), 'rise': round_number(rise), 'gap': None}
    if face is not None:
        gap = max(0.0, distance - epsilon)
        record.update(sources[face])
        record.update(gap=round_number(gap), surface=[round_number(x) for x in location],
                      surface_normal=[round_number(x) for x in normal])
    return record


def summarize(rays):
    hits = [r for r in rays if r['gap'] is not None]
    gaps = [r['gap'] for r in hits]
    seated = sum(1 <= g <= 6 for g in gaps)
    result = {
        'rays': len(rays), 'hits': len(hits), 'misses': len(rays) - len(hits),
        'gap_min': min(gaps) if gaps else None,
        'gap_max': max(gaps) if gaps else None,
        'less_than_1m': sum(g < 1 for g in gaps),
        'within_1_to_6m': seated, 'over_6m': sum(g > 6 for g in gaps),
        'seated_percent_of_all_rays': round(100 * seated / len(rays), 2) if rays else 0,
        'covered_percent': round(100 * len(hits) / len(rays), 2) if rays else 0,
        'parts': dict(sorted(Counter(r['part'] for r in hits).items())),
    }
    return result


def sample_status(sample):
    q = sample['all_width']
    if q['hits'] == 0:
        return 'no_surface_within_search_distance'
    if q['misses']:
        return 'partial_width_coverage'
    if q['within_1_to_6m'] == q['rays']:
        return 'seated_across_sampled_width'
    if q['less_than_1m']:
        return 'less_than_1m_somewhere_across_width'
    return 'gap_over_6m_somewhere_across_width'


def longitude_ranges(samples):
    """Contiguous classifications, plus their actual measured distances."""
    groups = []
    for sample in samples:
        state = sample['status']
        if not groups or groups[-1]['status'] != state:
            groups.append({'status': state, 'samples': []})
        groups[-1]['samples'].append(sample)
    result = []
    for group in groups:
        subset = group['samples']
        result.append({'status': group['status'], 's_first': subset[0]['s'], 's_last': subset[-1]['s'],
                       'sample_count': len(subset),
                       'all_width': summarize([r for s in subset for r in s['rays']])})
    return result


def fixed_bins(samples, s0, s1, size=50):
    result = []
    a = s0
    while a < s1:
        b = min(a + size, s1)
        subset = [s for s in samples if a <= s['s'] < b]
        if subset:
            result.append({'s0': round_number(a), 's1': round_number(b), 'sample_count': len(subset),
                           'all_width': summarize([r for s in subset for r in s['rays']]),
                           'centre': summarize([s['centre'] for s in subset])})
        a = b
    return result


def format_summary(q):
    gap = 'no hits' if q['gap_min'] is None else f"{q['gap_min']:.2f}..{q['gap_max']:.2f} m"
    return (f"gap {gap}; seated {q['seated_percent_of_all_rays']:.1f}%; "
            f"coverage {q['covered_percent']:.1f}%; misses {q['misses']}/{q['rays']}")


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=HERE / 'phase2-seating.json')
    parser.add_argument('--collection', default='TITAN')
    parser.add_argument('--width-step', type=float, default=2.0)
    parser.add_argument('--max-gap', type=float, default=500.0)
    args = parser.parse_args(argv)
    if args.width_step <= 0 or args.max_gap <= 0:
        raise ValueError('width-step and max-gap must be positive')
    collection = bpy.data.collections.get(args.collection)
    if collection is None:
        raise RuntimeError(f'No collection {args.collection}')
    road_file = HERE / 'fit' / 'road.json'
    stretches_file = HERE / 'fit' / 'stretches.json'
    road = json.loads(road_file.read_text())
    stretches = json.loads(stretches_file.read_text())
    bvh, sources, triangles = make_surface(collection)
    report = {
        'about': 'Measured first downward triangle intersection from the actual road slab bottom; all TITAN evaluated meshes, FIT excluded. Distances follow the road up axis, not global height. Misses are not counted as seated. Surface coordinates/normals are Blender world axes.',
        'method': {'slab_depth_m': SLAB_DEPTH, 'longitudinal_sample_spacing_m': road['ds'],
                   'maximum_cross_width_spacing_m': args.width_step, 'maximum_downward_search_m': args.max_gap,
                   'pass_band_m': [1, 6], 'triangle_count': triangles,
                   'limitation': 'Finite road and cross-width stations, not a continuous mathematical proof. Clearance is checked separately. A ray that starts below an intruding surface can hit a deeper surface; this report never substitutes for strict clearance.'},
        'source': {'blend': bpy.data.filepath, 'blend_sha256': digest(bpy.data.filepath) if bpy.data.filepath else None,
                   'road_sha256': digest(road_file), 'stretches_sha256': digest(stretches_file),
                   'blender': bpy.app.version_string},
        'stretches': [],
    }
    print(f"Road seating: {triangles:,} evaluated TITAN triangles; slab bottom {SLAB_DEPTH} m below deck; cross-width spacing <= {args.width_step} m.")
    for stretch in stretches['on']:
        samples = []
        for sample in road['samples']:
            if not stretch['s0'] <= sample['s'] < stretch['s1']:
                continue
            rays = [measure_ray(sample, d, rise, bvh, sources, args.max_gap) for d, rise in stations(sample, args.width_step)]
            if not rays:
                continue
            centre = measure_ray(sample, 0.0, 0.0, bvh, sources, args.max_gap)
            measured = {'i': sample['i'], 's': sample['s'], 'centre': centre,
                        'all_width': summarize(rays), 'rays': rays}
            measured['status'] = sample_status(measured)
            samples.append(measured)
        entry = dict(stretch)
        entry.update(all_width=summarize([r for s in samples for r in s['rays']]),
                     centre=summarize([s['centre'] for s in samples]),
                     sample_count=len(samples),
                     fully_seated_samples=sum(s['status'] == 'seated_across_sampled_width' for s in samples),
                     longitude_ranges=longitude_ranges(samples),
                     bins_50m=fixed_bins(samples, stretch['s0'], stretch['s1']), samples=samples)
        # Distinguish a road approach before the first actual TITAN footprint from
        # intermittent holes or uncovered sides; keep all of them in the totals.
        supported = [i for i, s in enumerate(samples) if s['all_width']['hits']]
        entry['leading_no_footprint'] = None
        entry['trailing_no_footprint'] = None
        if supported and supported[0]:
            subset = samples[:supported[0]]
            entry['leading_no_footprint'] = {'s_first': subset[0]['s'], 's_last': subset[-1]['s'], 'sample_count': len(subset)}
        if supported and supported[-1] < len(samples) - 1:
            subset = samples[supported[-1] + 1:]
            entry['trailing_no_footprint'] = {'s_first': subset[0]['s'], 's_last': subset[-1]['s'], 'sample_count': len(subset)}
        if stretch['piece'] == 'the Palm':
            entry['interpretation'] = 'Leading rays without any TITAN hit identify the approach before the fingertips. Partial-width misses remain separately visible; they are not excused as approach.'
        elif stretch['piece'] == 'the Shoulder':
            entry['interpretation'] = 'The brief explicitly retains the climb above the upper arm with game-side pylons. Large gaps whose hit part is upper_arm.R are reported unchanged, rather than called seated.'
            entry['upper_arm_pylon_zone'] = summarize([r for s in samples for r in s['rays'] if r.get('part') == 'upper_arm.R'])
        report['stretches'].append(entry)
        print(f"{stretch['piece']}: all width {format_summary(entry['all_width'])}; centre {format_summary(entry['centre'])}")
        if entry['leading_no_footprint']:
            q = entry['leading_no_footprint']
            print(f"  approach before TITAN footprint: s {q['s_first']:.1f}..{q['s_last']:.1f}")
        if entry['trailing_no_footprint']:
            q = entry['trailing_no_footprint']
            print(f"  trailing absent footprint: s {q['s_first']:.1f}..{q['s_last']:.1f}")
        for q in entry['bins_50m']:
            print(f"  s {q['s0']:.1f}..{q['s1']:.1f}: {format_summary(q['all_width'])}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(f'Seating report: {args.output}')


if __name__ == '__main__':
    main()

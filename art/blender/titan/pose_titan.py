"""Independent Titan articulation review; never saves the Blender scene.
Usage: Blender --background --python pose_titan.py -- BLEND OUTPUT_DIRECTORY REPORT
Outputs two temporary views and a contact/pivot report, not collision certification.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import traceback

import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('blendPath'); p.add_argument('outputDirectory'); p.add_argument('reportPath')
a = p.parse_args(argv)
source = Path(a.blendPath).resolve(); out = Path(a.outputDirectory).resolve()
report_path = Path(a.reportPath).resolve()
TOL = .01  # metres; same tolerance as independent GLB roundtrip QA
report = {'source': str(source), 'blender': bpy.app.version_string,
          'scope': 'Rigid frame pivot/contact articulation only; no armour collision-clearance claim; scene is never saved',
          'tolerance_metres': TOL, 'checks': [], 'failures': [], 'cases': []}
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()


def check(ok, name, detail=None):
    item = {'name': name, 'passed': bool(ok)}
    if detail is not None: item['detail'] = detail
    report['checks'].append(item)
    if not ok: report['failures'].append(item)


def vec(v): return [float(x) for x in v]


def mesh_world(ob):
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh(); mesh.calc_loop_triangles()
    vertices = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    evaluated.to_mesh_clear()
    return vertices, triangles


def mean(vs): return sum(vs, Vector())/len(vs)


def convex_violation(point, vertices, triangles):
    # A sphere gimbal is a closed convex faceted mesh. Orient each triangle
    # outward relative to its centroid, then test all actual facet half-spaces.
    centre = mean(vertices); violation = -float('inf')
    for tri in triangles:
        x, y, z = [vertices[i] for i in tri]
        normal = (y-x).cross(z-x)
        if normal.length < 1e-9: continue
        normal.normalize()
        if normal.dot((x+y+z)/3-centre) < 0: normal.negate()
        violation = max(violation, normal.dot(point-x))
    return violation


try:
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene; rig = bpy.data.objects['titan_rig']
    bones = rig.pose.bones
    meshes = [o for o in scene.objects if o.type == 'MESH']
    body = [o for o in meshes if o.get('titan_part') not in (None, 'sword')]
    check(len(rig.data.bones) == 51, 'source has 51 bones')
    original_matrices = {o.name: o.matrix_world.copy() for o in body}
    original_geometry = {o.name: [v.co.copy() for v in o.data.vertices] for o in body}
    for bone in bones:
        bone.rotation_mode = 'QUATERNION'; bone.matrix_basis.identity()
    bpy.context.view_layer.update()

    # Each contact compares actual rigid parent frame geometry with its child
    # closed sphere gimbal. No inferred radius or bounding-box overlap is used.
    contacts = []
    rotations = []
    for side, sign in [('L', 1), ('R', -1)]:
        rotations += [
            (f'upper_arm.{side}', -90*sign, (0,1,0), 'shoulder abduction'),
            (f'shoulder.{side}', -90*sign, (0,1,0), 'independent shoulder cap'),
            (f'forearm.{side}', -120, (1,0,0), 'elbow flexion'),
            (f'shin.{side}', 60, (1,0,0), 'knee flexion'),
            (f'hand.{side}', -45, (1,0,0), 'wrist flexion'),
        ]
        contacts += [
            (f'upper_arm.{side}', f'titan/upper_arm.{side}/shoulder-gimbal', 'titan/chest/closed-thorax'),
            (f'forearm.{side}', f'titan/forearm.{side}/elbow-gimbal', f'titan/upper_arm.{side}/upper-arm-core'),
            (f'hand.{side}', f'titan/hand.{side}/wrist-gimbal', f'titan/forearm.{side}/forearm-core'),
            (f'shin.{side}', f'titan/shin.{side}/knee-gimbal', f'titan/thigh.{side}/thigh-frame'),
        ]
        for finger in ('thumb', 'index', 'middle', 'ring', 'pinky'):
            for segment in (1,2,3):
                name = f'{finger}.{segment:02d}.{side}'
                rotations.append((name, -90, (1,0,0), 'finger knuckle flexion'))
                parent_mesh = (f'titan/hand.{side}/palm-frame' if segment == 1 else
                               f'titan/{finger}.{segment-1:02d}.{side}/phalange-core')
                contacts.append((name, f'titan/{name}/knuckle', parent_mesh))
    contact_map = {v[0]:v for v in contacts}
    report['requested_rotations'] = [
        {'bone':name,'degrees':degrees,'rest_world_axis':list(axis),'purpose':purpose}
        for name,degrees,axis,purpose in rotations]
    report['contact_method'] = ('Evaluate actual world-space parent-frame triangles; find their nearest surface point '
                                'to child pivot, then require that point inside every outward half-space of '
                                'the actual closed convex gimbal. Also compare gimbal centre and transformed '
                                'parent attachment landmark to the child pivot. A nonpositive signed facet '
                                'violation establishes an occupied frame junction, not armour clearance.')
    for _, gimbal, parent in contacts:
        check(gimbal in bpy.data.objects, f'contact gimbal exists: {gimbal}')
        check(parent in bpy.data.objects, f'parent frame exists: {parent}')

    # Parent-local landmark is derived from the actual rest pose once, not
    # recomputed from the child after posing.
    landmarks = {}
    for name,_,_,_ in rotations:
        bone = bones[name]
        landmarks[name] = bone.parent.matrix.inverted() @ bone.head if bone.parent else bone.head.copy()

    def reset():
        for b in bones: b.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()

    def rotate(name, degrees, rest_axis):
        # Convert an explicit world-rest axis to the bone's rest local basis.
        # The resulting rotation follows parent motion naturally in chains.
        local_axis = rig.data.bones[name].matrix_local.to_3x3().inverted() @ Vector(rest_axis)
        bones[name].rotation_quaternion = Quaternion(local_axis.normalized(), math.radians(degrees))

    def inspect(case, selected):
        bpy.context.view_layer.update()
        result = {'case':case, 'joints':[], 'passed':True}
        for name in selected:
            bone = bones[name]
            pivot = rig.matrix_world @ bone.head
            expected = rig.matrix_world @ (bone.parent.matrix @ landmarks[name] if bone.parent else landmarks[name])
            gap = (pivot-expected).length
            item = {'bone':name,'attachment_gap_metres':gap}
            check(gap <= TOL, f'{case}: unchanged attachment {name}', gap)
            if name in contact_map:
                _, gimbal_name, frame_name = contact_map[name]
                gv, gt = mesh_world(bpy.data.objects[gimbal_name])
                fv, ft = mesh_world(bpy.data.objects[frame_name])
                centre_gap = (mean(gv)-pivot).length
                closest, _, _, distance = BVHTree.FromPolygons(fv,ft,all_triangles=True).find_nearest(pivot)
                violation = convex_violation(closest,gv,gt)
                check(centre_gap <= TOL, f'{case}: gimbal centred at pivot {name}', centre_gap)
                check(violation <= TOL, f'{case}: parent frame touches or penetrates gimbal {name}',
                      {'nearest_parent_surface_distance_metres':distance,'signed_facet_violation_metres':violation})
                item.update(gimbal=gimbal_name,parent_frame=frame_name,gimbal_centre_gap_metres=centre_gap,
                            parent_surface_distance_metres=distance,signed_facet_violation_metres=violation,
                            frame_contact=violation <= TOL)
                result['passed'] &= gap <= TOL and centre_gap <= TOL and violation <= TOL
            else:
                # Cap and upper arm are independent chest children with one
                # mechanical pivot; their pose rotations must not translate it.
                other = bones[name.replace('shoulder.', 'upper_arm.')]
                cap_gap = (bone.head-other.head).length
                check(cap_gap <= TOL, f'{case}: shoulder cap shares arm pivot {name}', cap_gap)
                item['cap_to_arm_pivot_gap_metres'] = cap_gap
                result['passed'] &= gap <= TOL and cap_gap <= TOL
            result['joints'].append(item)
        report['cases'].append(result)

    inspect('rest', [r[0] for r in rotations])
    for name, degrees, axis, _ in rotations:
        reset(); rotate(name,degrees,axis)
        # Include descendants to catch propagation failures, not just the
        # directly rotated joint (all finger joints included independently).
        selected = [r[0] for r in rotations if r[0] == name or bones[name] in bones[r[0]].parent_recursive]
        inspect(f'isolated/{name}/{degrees:g}deg', selected)
    reset()
    for name, degrees, axis, _ in rotations: rotate(name,degrees,axis)
    inspect('combined-extreme-review', [r[0] for r in rotations])
    for name,degrees,axis,_ in rotations:
        actual = math.degrees(bones[name].rotation_quaternion.angle)
        check(abs(actual-abs(degrees)) < 1e-3, f'combined: applied rotation {name}', actual)
    for ob in body:
        check(len(ob.data.vertices) == len(original_geometry[ob.name]) and
              all((v.co-old).length < 1e-8 for v,old in zip(ob.data.vertices, original_geometry[ob.name])),
              f'pose never edits geometry: {ob.name}')
        check(ob.parent == rig and ob.parent_type == 'BONE' and ob.parent_bone == ob['titan_part'],
              f'pose retains rigid parent: {ob.name}')

    # Review-only rendering: no new camera/visibility/poses are saved to source.
    for ob in meshes: ob.hide_render = ob not in body
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light='STUDIO'; shading.studio_light='paint.sl'; shading.color_type='MATERIAL'
    shading.show_shadows=False; shading.show_cavity=False
    shading.show_object_outline=False; shading.show_specular_highlight=False
    scene.render.film_transparent=False
    shading.background_type='WORLD'
    if scene.world is None: scene.world=bpy.data.worlds.new('pose-QA-world')
    scene.world.color=(.72,.74,.77)
    scene.view_settings.view_transform='Standard'
    scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
    scene.render.resolution_x=1400; scene.render.resolution_y=1400
    scene.render.resolution_percentage=100; scene.display.render_aa='32'
    camera_data=bpy.data.cameras.new('pose-QA-camera'); camera=bpy.data.objects.new('pose-QA-camera',camera_data)
    scene.collection.objects.link(camera);scene.camera=camera
    camera_data.type='ORTHO'; camera_data.clip_start=.1;camera_data.clip_end=20000
    points=[p for ob in body for p in mesh_world(ob)[0]]
    lo=Vector([min(p[k] for p in points) for k in range(3)])
    hi=Vector([max(p[k] for p in points) for k in range(3)])
    target=(lo+hi)/2
    out.mkdir(parents=True,exist_ok=True)
    images=[]
    for name,direction,horizontal in [('pose-front',(0,-1,0),0),('pose-side',(1,0,0),1)]:
        camera.location=target+Vector(direction)*5000
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        camera_data.ortho_scale=max(hi.z-lo.z,hi[horizontal]-lo[horizontal])*1.13
        scene.render.filepath=str(out/(name+'.png'))
        bpy.ops.render.render(write_still=True)
        images.append(str(out/(name+'.png')))
    report['review_images']=images
    report['combined_pose_world_bounds']={'min':vec(lo),'max':vec(hi)}
    reset()
    check(hashlib.sha256(source.read_bytes()).hexdigest() == source_hash,'source blend remains byte-identical')
except Exception as error:
    report['failures'].append({'name':'execution','detail':str(error),'traceback':traceback.format_exc()})
report['source_sha256']=source_hash
report['passed']=not report['failures'];report['check_count']=len(report['checks'])
report['failure_count']=len(report['failures'])
report_path.parent.mkdir(parents=True,exist_ok=True)
report_path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['passed','check_count','failure_count']},indent=2))
print('POSE_REPORT',str(report_path))
if report['failures']: sys.exit(1)

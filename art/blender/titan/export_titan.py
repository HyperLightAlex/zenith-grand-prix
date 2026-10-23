"""Export the saved standing scene, never an unsaved review pose.
blender --background art/blender/titan/titan-production.blend --python art/blender/titan/export_titan.py
"""
import bpy,json,collections
from pathlib import Path
from mathutils import Vector
HERE=Path(bpy.data.filepath).resolve().parent
ROOT=HERE.parents[2]
rig=bpy.data.objects['titan_rig']
if any(pb.matrix_basis!=__import__('mathutils').Matrix.Identity(4) for pb in rig.pose.bones):
    raise RuntimeError('Export requires the neutral rest pose; reopen the production scene.')
bpy.context.view_layer.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and 'titan_part' in o]
counts=collections.defaultdict(int)
for o in meshes:
    o.data.calc_loop_triangles(); counts[o['titan_part']]+=len(o.data.loop_triangles)
    assert not o.data.uv_layers and not o.vertex_groups
    assert all(abs(float(s)-1)<1e-5 for s in o.scale),o.name
    assert o['titan_part']=='sword' or (o.parent==rig and o.parent_type=='BONE')
assert sum(counts.values())<100000
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=rig
out=ROOT/'src/client/render/titan/assets/titan-blockout.glb';out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
    export_yup=True,export_normals=True,export_texcoords=False,export_animations=False,
    export_skins=True,export_def_bones=False,export_extras=True,export_cameras=False,export_lights=False)
joints={'schema':1,'units':'metres','coordinates':'Blender: +Z up, -Y forward, +X anatomical left',
        'armature':'titan_rig','pose':'rest','bones':{}}
for b in rig.data.bones:
    joints['bones'][b.name]={'head':list(b.head_local),'tail':list(b.tail_local),'parent':b.parent.name if b.parent else None}
(HERE/'joints.json').write_text(json.dumps(joints,indent=2)+'\n')
def bounds(objects):
    vs=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    return {'min':[min(v[i] for v in vs) for i in range(3)],'max':[max(v[i] for v in vs) for i in range(3)]}
helmet=bounds([bpy.data.objects['titan/head/helmet']])
body=bounds([o for o in meshes if o['titan_part']!='sword'])
shoulder=bounds([o for o in meshes if o['titan_part'].startswith('shoulder.')])
chest=bounds([o for o in meshes if o['titan_part']=='chest' and 'vent' not in o.name and 'collar' not in o.name])
palm=bounds([bpy.data.objects['titan/hand.L/palm-frame']])
handEnd=rig.data.bones['middle.03.L'].tail_local;wrist=rig.data.bones['hand.L'].head_local
report={'phase':'1.1','blender':bpy.app.version_string,'source_commit':rig['source_commit'],
        'triangles_total':sum(counts.values()),'triangles_by_part':dict(sorted(counts.items())),
        'mesh_count':len(meshes),'bone_count':len(rig.data.bones),
        'measurements_metres':{
            'crown_to_soles':helmet['max'][2]-body['min'][2],
            'shoulder_span':shoulder['max'][0]-shoulder['min'][0],
            'chest_depth_excluding_vents':chest['max'][1]-chest['min'][1],
            'helmet_width':helmet['max'][0]-helmet['min'][0],
            'helmet_chin_to_crown':helmet['max'][2]-helmet['min'][2],
            'shoulder_to_middle_fingertip':(rig.data.bones['upper_arm.L'].head_local-handEnd).length,
            'wrist_to_middle_fingertip':(wrist-handEnd).length,
            'palm_width':palm['max'][0]-palm['min'][0],
            'crotch_to_soles':rig.data.bones['pelvis'].head_local.z-body['min'][2],
            'halo_outer_diameter':295.0,'sword_overall':600.0,
            'blade_length':437.0,'blade_width':23.0,'blade_thickness':8.0,'blade_aspect':19.0},
        'body_bounds':body,'materials':list(__import__('bpy').data.materials.keys()),
        'export':str(out.relative_to(ROOT))}
(HERE/'blockout-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('TITAN_REPORT',json.dumps(report))

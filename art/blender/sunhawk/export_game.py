"""Export production-prepared copies of both Sunhawks; preserve the art scene.

Run in the saved comparison .blend. Evaluates bevels/custom normals, omits
preview ink shells and drawn markings, consolidates by rigid joint/paint slot,
and introduces hip armor hinges. No source geometry is changed or deleted.
"""
import bpy
import math
import json
from pathlib import Path
from collections import defaultdict
from mathutils import Matrix, Vector

PROJECT=Path(bpy.data.filepath).resolve().parents[3]
if not (PROJECT/'src/client/render/mech').is_dir():
    raise RuntimeError('Open art/blender/sunhawk/sunhawk-comparison.blend in the project first')
OUT=PROJECT/'src/client/render/mech/assets'
OUT.mkdir(parents=True,exist_ok=True)
source=bpy.context.scene
source_frame=source.frame_current
source.frame_set(1)
saved_rotations={o:o.rotation_euler.copy() for o in source.objects if 'JNT / ankle.' in o.name}
for o in saved_rotations: o.rotation_euler=(0,0,0)
ink_mods=[m for o in source.objects if o.name.startswith(('A / ','B / ')) for m in o.modifiers if m.type=='SOLIDIFY']
visibility=[(m,m.show_viewport,m.show_render) for m in ink_mods]
for m,_,_ in visibility: m.show_viewport=m.show_render=False
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
JOINTS={'hips':'hips','spine':'spine','chest':'chest','head':'head',
        'shoulder.L':'shL','elbow.L':'elL','wrist.L':'wrL','shoulder.R':'shR','elbow.R':'elR','wrist.R':'wrR',
        'hip.L':'hipL','knee.L':'kneeL','ankle.L':'ankleL','hip.R':'hipR','knee.R':'kneeR','ankle.R':'ankleR','wing.L':'wingL','wing.R':'wingR'}
SLOTS={'porcelain armor':'P','cobalt enamel':'S','solar gold':'T','navy structure':'F',
       'flex joints':'K','wheel rubber':'D','ink':'D','cyan light':'G','light core':'G'}
SKIP=('Solar crest','Solar center','Solar ray','Tower hazard','Hazard bar','Race roundel','Race number')
reports=[]
staging=[]
staging_meshes=[]
staging_materials=[]
try:
    for prefix,variant in [('A / ','current'),('B / ','updated')]:
        u=variant=='updated'
        root=next(o for o in source.objects if o.name==prefix+'SUNHAWK')
        root_inv=root.matrix_world.inverted()
        joints={JOINTS[o.name.split('JNT / ')[1]]:o for o in source.objects if o.name.startswith(prefix+'JNT / ')}
        groups=defaultdict(lambda:{'pos':[],'normal':[]})
        source_count=0
        for ob in source.objects:
            if ob.type!='MESH' or not ob.name.startswith(prefix) or any(key in ob.name for key in SKIP): continue
            source_count+=1
            assert ob.parent in joints.values(), ob.name
            joint=JOINTS[ob.parent.name.split('JNT / ')[1]]
            local=ob.parent.matrix_world.inverted()@ob.matrix_world
            # Towers are fixed shoulder equipment, not part of the arm swing.
            # Otherwise a racing tuck drives their tips down through the knees.
            if 'Pylon bracket' in ob.name or 'Tower ' in ob.name:
                joint='chest'
                local=joints['chest'].matrix_world.inverted()@ob.matrix_world
            # The source's hip plates were static presentation pieces. Give them
            # the same independently driven hinges used by the game's other mechs.
            if 'Floating hip shield' in ob.name or 'Hip brow' in ob.name:
                center=sum((v.co.x for v in ob.data.vertices))/len(ob.data.vertices)
                sign=1 if center>0 else -1
                joint='skirtL' if sign==1 else 'skirtR'
                hinge=Vector((sign*.65,-.36,5.46))
                local=Matrix.Translation(-hinge)@root_inv@ob.matrix_world
            elif 'Rear pelvis plate' in ob.name or 'Rear cobalt clasp' in ob.name:
                joint='skirtBack'
                local=Matrix.Translation(Vector((0,-.34,-5.50)))@root_inv@ob.matrix_world
            normal_matrix=local.to_3x3().inverted().transposed()
            evaluated=ob.evaluated_get(deps)
            me=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
            me.calc_loop_triangles()
            try:
                for tri in me.loop_triangles:
                    material=me.materials[tri.material_index]
                    role=material.name.split('Sunhawk / ')[1].split('.')[0]
                    slot=SLOTS[role]
                    bucket=groups[(joint,slot)]
                    for vi,li in zip(tri.vertices,tri.loops):
                        p=local@me.vertices[vi].co
                        n=(normal_matrix@me.corner_normals[li].vector).normalized()
                        if not all(math.isfinite(v) for v in (*p,*n)): raise ValueError(ob.name+' nonfinite export')
                        bucket['pos'].append(tuple(p)); bucket['normal'].append(tuple(n))
            finally: evaluated.to_mesh_clear()
        scene=bpy.data.scenes.new('GAME EXPORT / '+variant); staging.append(scene)
        bpy.context.window.scene=scene
        asset=bpy.data.objects.new('Sunhawk_'+variant,None); scene.collection.objects.link(asset)
        asset['sunhawk_schema']=1; asset['variant']=variant
        asset['dims']={'hipY':5.35,'hipX':.73,'hipDrop':.23,'thigh':1.96,'shin':2.33,'ankleY':.83,
            'spineY':.45,'chestY':.75,'shoulderX':1.44 if u else 1.36,'shoulderY':.88,
            'headY':1.47,'headZ':0.,'upperArm':1.31,'foreArm':1.47,'height':9.35}
        mats={}
        for slot in sorted({slot for joint,slot in groups}):
            m=bpy.data.materials.new('Sunhawk_export_'+variant+'_'+slot); mats[slot]=m
            staging_materials.append(m)
            m.diffuse_color={'P':(.9,.92,.96,1),'S':(.02,.16,.8,1),'T':(1,.45,.02,1),
                'F':(.04,.055,.09,1),'K':(.02,.03,.05,1),'D':(.01,.015,.025,1),'G':(.06,.8,1,1)}[slot]
            m.use_nodes=True
            m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color
        for (joint,slot),data in sorted(groups.items()):
            me=bpy.data.meshes.new('Sunhawk_export_'+variant+'_'+joint+'_'+slot)
            staging_meshes.append(me)
            vs=data['pos']; me.from_pydata(vs,[],[(i,i+1,i+2) for i in range(0,len(vs),3)])
            me.update()
            for face in me.polygons: face.use_smooth=True
            me.normals_split_custom_set(data['normal'])
            ob=bpy.data.objects.new(joint+'_'+slot,me); scene.collection.objects.link(ob)
            ob.parent=asset; ob['joint']=joint; ob['slot']=slot
            # Joint-local geometry intentionally stays at the origin in this
            # transport scene; the game attaches it to the matching live pivot.
            me.materials.append(mats[slot])
        bpy.ops.export_scene.gltf(filepath=str(OUT/('sunhawk-'+variant+'.glb')),export_format='GLB',
            use_active_scene=True,export_yup=True,export_normals=True,export_texcoords=False,
            export_extras=True,export_animations=False,export_skins=False,export_cameras=False,
            export_lights=False,export_apply=False,export_materials='EXPORT')
        reports.append({'variant':variant,'source_meshes':source_count,'joint_material_meshes':len(groups),
            'triangles':sum(len(g['pos'])//3 for g in groups.values()),
            'bytes':(OUT/('sunhawk-'+variant+'.glb')).stat().st_size,
            'joints':sorted({j for j,slot in groups})})
        bpy.context.window.scene=source
finally:
    bpy.context.window.scene=source
    for m,view,render in visibility: m.show_viewport=view; m.show_render=render
    for ob,rot in saved_rotations.items(): ob.rotation_euler=rot
    source.frame_set(source_frame)
    # Only generated transport scenes are removed; the editable comparison stays.
    for scene in staging:
        for ob in list(scene.objects): bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.scenes.remove(scene)
    for me in staging_meshes: bpy.data.meshes.remove(me)
    for mat in staging_materials: bpy.data.materials.remove(mat)
    bpy.context.view_layer.update()
(PROJECT/'art/blender/sunhawk/game-export-manifest.json').write_text(json.dumps(reports,indent=2)+'\n')
result={'exports':reports,'source_scene_preserved':source.name}

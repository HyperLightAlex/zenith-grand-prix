"""Correct palm orientation on both production copies; keep the art archive intact.

Inner thumbs require backward-facing palms in this relaxed wrist pose. The
original hands had forward curls and rear back plates, giving them the wrong
chirality. Reflect their depth, including face winding, about the wrist plane.
"""
import bpy
import bmesh

scene=bpy.context.scene
assert scene.get('sunhawk_production'), 'Open sunhawk-production.blend'
changed=[]
for ob in scene.objects:
    if ob.type!='MESH' or not ob.name.startswith(('A / ','B / ')): continue
    if not any(key in ob.name for key in ('Palm','Back of hand plate','Finger ','Thumb ')): continue
    if ob.get('hand_orientation_fixed'): continue
    assert 'JNT / wrist.' in ob.parent.name and ob.location.length<1e-5, ob.name
    if ob.data.users>1: ob.data=ob.data.copy()
    bm=bmesh.new(); bm.from_mesh(ob.data)
    for v in bm.verts: v.co.y=-v.co.y
    bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.normal_update(); bm.to_mesh(ob.data); bm.free()
    ob.data.update(); ob['hand_orientation_fixed']=True
    changed.append(ob.name)
bpy.context.view_layer.update()
scene['sunhawk_polish_notes']='Updated B: clearance, bevels and UV details. Current A: reference body; both designs have corrected hand chirality.'
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
result={'corrected_hand_parts':len(changed),'variants':['current','updated']}

"""Reversible edge and normal pass for the authored Sunhawk meshes."""
import bpy
import math

s=bpy.context.scene
bpy.ops.object.select_all(action='DESELECT')
finished=[]
for ob in s.objects:
    if not ob.name.startswith(('A / ','B / ')) or ob.type!='MESH': continue
    if ob.get('surface_role')=='white':
        if not any(m.type=='BEVEL' for m in ob.modifiers):
            bevel=ob.modifiers.new('Armor edge radius','BEVEL')
            bevel.width=.025; bevel.segments=2; bevel.limit_method='ANGLE'
            bevel.angle_limit=math.radians(24)
            ob.modifiers.move(len(ob.modifiers)-1,0)
        for mod in ob.modifiers:
            if mod.type=='BEVEL': mod.segments=2
        if not ob.modifiers.get('Broad face normals'):
            wn=ob.modifiers.new('Broad face normals','WEIGHTED_NORMAL')
            wn.keep_sharp=True; wn.weight=60
            ob.modifiers.move(len(ob.modifiers)-1,len(ob.modifiers)-2)
        ob.select_set(True); finished.append(ob)
if finished:
    bpy.context.view_layer.objects.active=finished[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35),keep_sharp_edges=True)
for prefix in ('A / ','B / '):
    for side,sign in [('L',1),('R',-1)]:
        ankle=next(o for o in s.objects if o.name.startswith(prefix+'JNT / ankle.'+side))
        ankle.rotation_euler.z=math.radians(12*sign)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active=None
result={'finished_armor_parts':len(finished)}

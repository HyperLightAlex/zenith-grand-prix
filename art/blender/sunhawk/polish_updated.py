"""Polish the approved B design in a new editable file. A stays untouched.

Run from sunhawk-comparison.blend; repeat runs are safe. The production file
is the source for subsequent game exports, while the comparison remains an
unchanged art-study checkpoint.
"""
import bpy
from pathlib import Path

folder=Path(bpy.data.filepath).parent
source=bpy.context.scene
assert source.name=='SUNHAWK • Art comparison'
destination=folder/'sunhawk-production.blend'
if Path(bpy.data.filepath)!=destination:
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
changed=[]
for ob in source.objects:
    if ob.type!='MESH' or not ob.name.startswith('B / ') or ob.get('production_surface_v1'): continue
    name=ob.name
    if any(s in name for s in ('Upper arm fitted shell','Thigh porcelain shell','Knee shield','Pelvic central keel','Shin aerodynamic shell')):
        ob.data=ob.data.copy()
        if 'Upper arm fitted shell' in name:
            # Clearance at the armpit without shrinking the outer shoulder.
            side=1 if ob.parent.name.endswith('.L') else -1
            for v in ob.data.vertices:
                if v.co.x*side<0: v.co.x*=.82
        elif 'Thigh porcelain shell' in name:
            for v in ob.data.vertices:
                if v.co.z>-.5:
                    v.co.x*=.92
                    if v.co.y>0: v.co.y*=.80
        elif 'Knee shield' in name:
            ob.location.y-=.045
            for v in ob.data.vertices:
                if v.co.z>.22: v.co.z-=.055
        elif 'Pelvic central keel' in name:
            for v in ob.data.vertices:
                if v.co.z<-.30: v.co.z+=.07
        elif 'Shin aerodynamic shell' in name:
            # Open a small mechanical joint gap below the knee cap.
            for v in ob.data.vertices:
                if v.co.z>-.42: v.co.z-=.045
        ob.data.update(); changed.append(name)
    # A single controlled edge radius avoids bright, noisy double bevels.
    if ob.get('surface_role')=='white':
        for mod in ob.modifiers:
            if mod.type=='BEVEL':
                mod.width=min(mod.width,.022)
                mod.segments=2
            elif mod.type=='WEIGHTED_NORMAL': mod.weight=75
    ob['production_surface_v1']=True
source['sunhawk_production']=1
source['sunhawk_polish_notes']='Updated B: arm/hip/knee clearance and restrained armor bevels. A is the frozen reference.'
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(destination))
result={'file':str(destination),'updated_parts_refined':changed,'current_design_preserved':True}

"""Sunhawk art-to-3D comparison, authored from the two design sheets.

Run in Blender's Python environment. No game geometry/code is imported.
Creates a new scene, leaving existing scenes and objects untouched.
Blender coordinates: Z up, -Y forward; metres. Editable rigid-part hierarchy.
"""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector

OUT = Path('/Users/alexanderkelley/Projects/igpx/art/blender/sunhawk')
OUT.mkdir(parents=True, exist_ok=True)
SCENE = bpy.data.scenes.new('SUNHAWK • Art comparison')
bpy.context.window.scene = SCENE
SCENE.unit_settings.system = 'METRIC'
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.resolution_x = 1800
SCENE.render.resolution_y = 1400
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = 'PNG'
SCENE.render.film_transparent = False
SCENE.view_settings.view_transform = 'Standard'
SCENE.view_settings.look = 'None'
SCENE.world = bpy.data.worlds.new('Sunhawk • pale studio')
SCENE.world.use_nodes = True
SCENE.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.73,.76,.81,1)
SCENE.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .8

def rgba(h):
    v = [int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in v)+(1,)

def material(name, base, shade=None, mid=None):
    m = bpy.data.materials.new('Sunhawk / '+name)
    m.diffuse_color = rgba(base)
    m.use_nodes = True
    ns=m.node_tree.nodes; ns.clear(); lk=m.node_tree.links
    out=ns.new('ShaderNodeOutputMaterial'); out.location=(610,0)
    em=ns.new('ShaderNodeEmission'); em.location=(400,0)
    lk.new(em.outputs[0],out.inputs['Surface'])
    if shade:
        geom=ns.new('ShaderNodeNewGeometry'); geom.location=(-600,0)
        dot=ns.new('ShaderNodeVectorMath'); dot.operation='DOT_PRODUCT'; dot.location=(-380,0)
        dot.inputs[1].default_value=Vector((-.52,-.68,.75)).normalized()
        lk.new(geom.outputs['Normal'],dot.inputs[0])
        ramp=ns.new('ShaderNodeValToRGB'); ramp.location=(-120,0)
        ramp.label='Authored cel palette • fixed shared key direction'
        ramp.color_ramp.interpolation='CONSTANT'
        ramp.color_ramp.elements[0].position=0
        ramp.color_ramp.elements[0].color=rgba(shade)
        ramp.color_ramp.elements[1].position=.52
        ramp.color_ramp.elements[1].color=rgba(base)
        if mid:
            e=ramp.color_ramp.elements.new(.12); e.color=rgba(mid)
        lk.new(dot.outputs['Value'],ramp.inputs['Fac'])
        lk.new(ramp.outputs['Color'],em.inputs[0])
    else: em.inputs[0].default_value=rgba(base)
    return m

M={
    'white':material('porcelain armor','F4F6FB','A6A3C8','D9DBE7'),
    'blue':material('cobalt enamel','2374F6','1E2A9C','2055CE'),
    'gold':material('solar gold','FFC342','AC571E','F5A914'),
    'frame':material('navy structure','374158','171D2E','262F43'),
    'joint':material('flex joints','263043','111827','1E2739'),
    'rubber':material('wheel rubber','273144','111927','1A2435'),
    'cyan':material('cyan light','45E8FF'),
    'ice':material('light core','C5FFFF'),
    'ink':material('ink','121A2B'),
    'paper':material('sheet background','E5E9F0'),
    'rule':material('sheet rules','A6B1C2'),
    'muted':material('sheet small type','5F6D82'),
}
M['ink'].use_backface_culling=True

CURRENT_COLLECTION=None
ROOT=None
PART=None
PIVOTS={}
PREFIX=''

def collection(name):
    c=bpy.data.collections.new(name); SCENE.collection.children.link(c); return c

def mesh(name, verts, faces, mat='white', bevel=0, ink=True):
    p=PIVOTS.get(PART,Vector((0,0,0)))
    me=bpy.data.meshes.new(PREFIX+name)
    me.from_pydata([tuple(Vector(v)-p) for v in verts],[],faces); me.update()
    bm=bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(me); bm.free()
    ob=bpy.data.objects.new(PREFIX+name,me); CURRENT_COLLECTION.objects.link(ob)
    if PART: ob.parent=PART
    elif ROOT: ob.parent=ROOT
    me.materials.append(M[mat])
    if bevel:
        mod=ob.modifiers.new('Small manufactured edge', 'BEVEL')
        mod.width=bevel; mod.segments=1
        mod.affect='EDGES'
    if ink:
        me.materials.append(M['ink'])
        mod=ob.modifiers.new('Removable anime silhouette','SOLIDIFY')
        mod.thickness=.010 if mat in ('frame','joint','rubber') else .012
        mod.offset=1; mod.use_flip_normals=True
        mod.material_offset=1; mod.material_offset_rim=1
    ob['surface_role']=mat
    return ob

def loft(name,rings,mat='white',bevel=0,ink=True):
    n=len(rings[0]); vs=[v for r in rings for v in r]
    fs=[tuple(reversed(range(n)))]
    for j in range(len(rings)-1):
        for i in range(n): fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    fs.append(tuple(range((len(rings)-1)*n,len(rings)*n)))
    return mesh(name,vs,fs,mat,bevel,ink)

def armor(name,x,slices,mat='white',ridge=.05,bevel=0,ink=True):
    # Each slice is z, half-width, forward y, rear y. Broad planes, narrow chamfers.
    rings=[]
    for z,w,f,b in slices:
        rings.append([(x,y,z) for x,y in [
            (x,f-ridge),(x+w*.66,f),(x+w,f+(b-f)*.18),
            (x+w*.94,b-(b-f)*.1),(x+w*.64,b),(x-w*.64,b),
            (x-w*.94,b-(b-f)*.1),(x-w,f+(b-f)*.18),(x-w*.66,f)]])
    return loft(name,rings,mat,bevel,ink)

def panel(name,outline,y,depth,mat='white',bevel=.025,ink=True):
    return loft(name,[[(x,y,z) for x,z in outline],[(x,y+depth,z) for x,z in outline]],mat,bevel,ink)

def box(name,center,size,mat='frame',bevel=.035,ink=True):
    x,y,z=center; w,d,h=(s/2 for s in size)
    return loft(name,[[(x-w,y-d,z-h),(x+w,y-d,z-h),(x+w,y+d,z-h),(x-w,y+d,z-h)],
                      [(x-w,y-d,z+h),(x+w,y-d,z+h),(x+w,y+d,z+h),(x-w,y+d,z+h)]],mat,bevel,ink)

def cylinder(name,a,b,r1,r2=None,mat='joint',n=12,ink=True):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    ref=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0))
    u=axis.cross(ref).normalized(); v=axis.cross(u)
    rings=[]
    for p,r in [(a,r1),(b,r1 if r2 is None else r2)]:
        rings.append([tuple(p+r*(u*math.cos(i*math.tau/n)+v*math.sin(i*math.tau/n))) for i in range(n)])
    return loft(name,rings,mat,ink=ink)

def rod(name,a,b,r,mat='cyan',n=8,ink=False):
    return cylinder(name,a,b,r,mat=mat,n=n,ink=ink)

def hoop(name,center,axis,r,t,mat='cyan',n=32,ink=False):
    axis=Vector(axis).normalized(); c=Vector(center)
    ref=Vector((0,0,1)) if abs(axis.z)<.9 else Vector((0,1,0))
    u=axis.cross(ref).normalized(); v=axis.cross(u)
    rings=[]
    for j in range(n):
        radial=u*math.cos(j*math.tau/n)+v*math.sin(j*math.tau/n)
        rings.append([tuple(c+radial*(r+t*math.cos(k*math.tau/6))+axis*t*math.sin(k*math.tau/6)) for k in range(6)])
    rings.append(rings[0]); return loft(name,rings,mat,ink=ink)

def blade(name,a,b,width,thick,mat='gold'):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    u=axis.cross(Vector((0,1,0))).normalized()
    if u.length<.1: u=Vector((1,0,0))
    v=axis.cross(u).normalized()
    rings=[]
    for p,w,t in [(a,width*.72,thick),(a.lerp(b,.14),width,thick),(b,width*.045,thick*.16)]:
        rings.append([tuple(p+u*w),tuple(p+v*t),tuple(p-u*w),tuple(p-v*t)])
    return loft(name,rings,mat)

def joint(name,pos,parent=None):
    o=bpy.data.objects.new(PREFIX+'JNT / '+name,None); CURRENT_COLLECTION.objects.link(o)
    o.empty_display_type='PLAIN_AXES'; o.empty_display_size=.18
    o.parent=parent if parent else ROOT
    pp=PIVOTS.get(parent,Vector((0,0,0)))
    o.location=Vector(pos)-pp; PIVOTS[o]=Vector(pos)
    o['rigid_part_pivot']=True
    return o

def text_obj(name,body,pos,size,mat='ink',align='CENTER',rear=False):
    cu=bpy.data.curves.new(name,'FONT'); cu.body=body; cu.size=size
    cu.align_x=align; cu.align_y='CENTER'; cu.space_character=1.05
    ob=bpy.data.objects.new(PREFIX+name,cu); CURRENT_COLLECTION.objects.link(ob)
    cu.materials.append(M[mat]); ob.rotation_euler=(math.pi/2,0,math.pi if rear else 0)
    if PART:
        ob.parent=PART; ob.location=Vector(pos)-PIVOTS[PART]
    else: ob.location=pos
    return ob

def nozzle(name,c,r):
    x,y,z=c
    cylinder(name+' housing',(x,y-.24,z+.10),(x,y,z),r*1.18,r,'frame',20)
    cylinder(name+' well',(x,y+.005,z),(x,y+.025,z),r*.81,mat='joint',n=24)
    hoop(name+' rim',(x,y+.04,z),(0,1,0),r*.91,.032,'frame')
    hoop(name+' cyan annulus',(x,y+.055,z),(0,1,0),r*.66,.025,'cyan')
    cylinder(name+' core',(x,y+.026,z),(x,y+.03,z),r*.48,mat='blue',n=20,ink=False)

def fin_section(name,a,b,w1,w2,mat):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized()
    cross=axis.cross(Vector((0,1,0))).normalized()
    rings=[]
    for p,w in ((a,w1),(b,w2)):
        rings.append([tuple(p+cross*w+Vector((0,-.045,0))),tuple(p-cross*w+Vector((0,-.045,0))),tuple(p-cross*w+Vector((0,.045,0))),tuple(p+cross*w+Vector((0,.045,0)))])
    return loft(name,rings,mat)

def emblem(x,y,z,sun):
    if sun:
        hoop('Solar crest',(x,y,z),(0,1,0),.095,.014,'gold',20)
        cylinder('Solar center',(x,y,z),(x,y-.008,z),.057,mat='gold',n=16,ink=False)
        for i in range(8):
            a=i*math.tau/8
            rod('Solar ray',(x+.12*math.cos(a),y,z+.12*math.sin(a)),(x+.17*math.cos(a),y,z+.17*math.sin(a)),.011,'gold',6)
    else:
        pts=[(x-.115,y,z-.10),(x+.115,y,z-.10),(x,y,z+.13)]
        for i in range(3): rod('Tower hazard',pts[i],pts[(i+1)%3],.018,'gold')
        rod('Hazard bar',(x,y,z-.025),(x,y,z+.055),.012,'gold')

def make_model(updated,offset):
    global CURRENT_COLLECTION,ROOT,PART,PREFIX
    PREFIX='B / ' if updated else 'A / '
    CURRENT_COLLECTION=collection('B • UPDATED • fuller armor' if updated else 'A • CURRENT • attached reference')
    ROOT=bpy.data.objects.new(PREFIX+'SUNHAWK',None); CURRENT_COLLECTION.objects.link(ROOT)
    ROOT.location.x=offset; ROOT.empty_display_size=.5
    ROOT['design_source']='Updated painted model sheet' if updated else 'User attached current-design sheet'
    ROOT['build_method']='Independent art-to-3D geometry; no procedural game mesh imported'
    ROOT['front_axis']='-Y'; ROOT['version']='First art-model comparison'
    u=updated
    shoulder=1.44 if u else 1.36
    hip=.73
    J={}
    J['hips']=joint('hips',(0,0,5.35))
    J['spine']=joint('spine',(0,0,5.8),J['hips'])
    J['chest']=joint('chest',(0,0,6.55),J['spine'])
    J['head']=joint('head',(0,0,8.02),J['chest'])
    PART=J['hips']
    box('Pelvic chassis',(0,0,5.28),(1.16,.64,.58),'joint',.12)
    armor('Pelvic central keel',0,[(4.72,.035,-.40,-.20),(4.96,.20,-.48,.30),(5.53,.30,-.38,.34)],ridge=.07)
    for s in (-1,1):
        x=s*.65
        panel('Hip brow',[(x-.27,5.46),(x+.27,5.44),(x+.28,5.15),(x,5.08),(x-.25,5.19)],-.36,.42,'white',.06)
        panel('Floating hip shield',[(s*.94,5.55),(s*1.12,5.45),(s*1.18,4.90),(s*.99,4.70),(s*.86,5.04)],-.12,.37,'white',.035)
    panel('Rear pelvis plate',[(-.32,5.50),(.32,5.50),(.21,4.99),(0,4.77),(-.21,4.99)],.34,.21,'white',.025)
    panel('Rear cobalt clasp',[(-.16,5.44),(.16,5.44),(.14,5.10),(-.14,5.10)],.56,.02,'blue',.015)
    PART=J['spine']
    cylinder('Abdominal spine',(0,0,5.48),(0,0,6.55),.27 if not u else .34,mat='joint',n=10)
    for i in range(4):
        z=5.62+i*.215
        armor('Floating abdominal vertebra %02d'%i,0,[(z,.34 if not u else .45,-.30,.28),(z+.08,.42 if not u else .52,-.35,.31),(z+.16,.33 if not u else .43,-.29,.27)],'frame',ridge=.015)
    PART=J['chest']
    box('Thoracic chassis',(0,0,7.05),(1.60 if u else 1.40,.88,1.24),'joint',.17)
    # Independent contour measurements from the illustrations.
    W=1.17 if u else 1.00
    f=-.78 if u else -.58
    chest_slices=[(6.29,.10,f+.098,.09),(6.49,.38,f-.018,.16),(6.78,W*.85,f-.055,.21),(7.40,W-.035,f-.035,.27),(7.62,W*.88,f+.035,.27),(7.76,.54,f+.115,.20)]
    armor('Cuirass porcelain face',0,chest_slices,'white',ridge=.08)
    # Only a narrow front-edge piping is gold; side walls remain porcelain.
    edge=[]
    for z,w,front,back in chest_slices:
        edge.append((w,front+(back-front)*.18-.018,z))
    for s in (-1,1):
        pts=[(s*x,y,z) for x,y,z in edge]
        for i in range(len(pts)-1): rod('Cuirass fine gold trim',pts[i],pts[i+1],.018,'gold',8)
        rod('Cuirass collar trim',pts[-1],(0,f+.02,7.76),.018,'gold',8)
        rod('Cuirass pointed trim',pts[0],(0,f+.008,6.27),.018,'gold',8)
    # Actual surface geometry, not a projected generic panel texture.
    zc=7.09
    panel('Diamond dark socket',[(0,zc-.42),(.22,zc),(0,zc+.43),(-.22,zc)],f-.15,.075,'ink',.006,False)
    panel('Diamond luminous insert',[(0,zc-.29),(.12,zc),(0,zc+.29),(-.12,zc)],f-.164,.018,'cyan',.003,False)
    panel('Diamond central glint',[(0,zc-.21),(.055,zc),(0,zc+.21),(-.055,zc)],f-.183,.008,'ice',0,False)
    for s in (-1,1):
        for i in range(3):
            z=7.31-i*.205; x=s*(.58 if u else .52)
            rod('Recessed gill lip',(x-s*.145,f-.07,z-.065),(x+s*.145,f-.015,z+.085),.051,'frame',8,True)
            rod('Cobalt gill',(x-s*.14,f-.09,z-.065),(x+s*.14,f-.035,z+.08),.033,'blue',8)
        panel('Raised collar',[(s*.26,7.72),(s*.39,7.98),(s*.65,7.94),(s*.77,7.73)],-.25,.62,'white',.04)
        cylinder('Shoulder axle',(s*1.00,0,7.45),(s*shoulder,0,7.45),.29,mat='joint',n=12)
        armor('Lower rib armor',s*.73,[(6.34,.10,-.20,.32),(6.54,.25,-.28,.43),(6.85,.25,-.24,.42)],'frame',ridge=.02)
    if u: panel('Lower cobalt latch',[(-.22,6.35),(.22,6.35),(.16,6.21),(-.16,6.21)],f+.04,.18,'blue',.02)
    # Clean rear identity, readable from the racing camera.
    armor('Backpack main shell',0,[(6.48,.48,.43,.80),(6.78,.56,.43,.96),(7.46,.49,.43,.89),(7.70,.33,.38,.72)],'frame',ridge=0)
    for s in (-1,1):
        armor('Backpack porcelain rail',s*.51,[(6.56,.11,.40,.72),(6.78,.17,.38,.87),(7.43,.15,.35,.78),(7.61,.09,.35,.59)],ridge=0)
        nozzle('Main thruster', (s*.30,1.01,6.76),.24 if u else .22)
    cylinder('Race roundel',(0,.91,7.34),(0,.94,7.34),.28,mat='white',n=40)
    text_obj('Race number','1',(0,.963,7.34),.43,'gold' if u else 'ink',rear=True)
    # Two swept stabilizers with separate color fields and a cyan leading seam.
    for s in (-1,1):
        J['wing'+str(s)]=joint('wing.L' if s==1 else 'wing.R',(s*.62,.65,7.54),J['chest'])
        PART=J['wing'+str(s)]
        a=Vector((s*.62,.65,7.54)); b=Vector((s*1.04,1.75,6.91)); c=Vector((s*1.47,2.54 if u else 2.8,5.83 if u else 5.97))
        fin_section('Stabilizer cobalt plane',a,b,.16,.13,'blue')
        fin_section('Stabilizer gold tip',b,c,.13,.014,'gold')
        rod('Stabilizer cyan seam',a+Vector((0,.058,0)),b+Vector((0,.058,0)),.02,'cyan')
    PART=J['head']
    cylinder('Neck stem',(0,.03,7.71),(0,-.12,8.25),.18,mat='joint',n=10)
    for z in (7.86,8.03): cylinder('Neck collar',(0,-.05,z),(0,-.08,z+.08),.23,mat='frame',n=10)
    front=-1.14 if u else -.77
    def hring(y,w,top,bot):
        return [(0,y,top),(w*.65,y,top-.025),(w,y,(top+bot)*.5+.04),(w*.72,y,bot),(-w*.72,y,bot),(-w,y,(top+bot)*.5+.04),(-w*.65,y,top-.025)]
    loft('Avian helmet',[hring(.27,.27,8.48,8.05),hring(-.05,.36,8.62,8.07),hring(-.43,.30,8.54,8.17),hring(front,.045,8.29,8.23)],'white')
    # Side sockets follow the taper of the head; visible from front and profile.
    for s in (-1,1):
        v=[(s*.35,-.10,8.43),(s*.28,-.49,8.43),(s*.135,front+.18,8.29),(s*.285,-.43,8.28),(s*.355,-.12,8.31)]
        ob=mesh('Visor side',v,[tuple(range(5))],'ink',ink=False)
        rod('Eye slit',(s*.302,-.37,8.37),(s*.245,-.56,8.36),.018,'cyan',6)
        blade('Swept crown horn',(s*.28,.01,8.48),(s*.38,.94 if u else .59,9.02),.09,.065,'gold')
        cylinder('Temple hinge',(s*.30,.13,8.26),(s*.37,.13,8.26),.12,mat='frame',n=12)
    loft('Separate lower beak',[hring(.12,.22,8.12,7.98),hring(-.36,.23,8.20,8.08),hring(front+.13,.025,8.23,8.19)],'white')
    panel('Crown cobalt crest',[(-.13,8.55),(0,8.69),(.13,8.55)],.01,.17,'blue',.01)

    # Articulated upper limbs. Wrist pivots and finger segments remain separate.
    for s in (-1,1):
        side='L' if s==1 else 'R'; sx=s*shoulder
        ex=s*(shoulder+.13); wx=s*(shoulder+.26)
        sh=joint('shoulder.'+side,(sx,0,7.43),J['chest'])
        el=joint('elbow.'+side,(ex,-.015,6.12),sh)
        wr=joint('wrist.'+side,(wx,-.035,4.65),el)
        PART=sh
        cylinder('Shoulder swivel',(sx-s*.28,0,7.43),(sx+s*.28,0,7.43),.32,mat='frame',n=20)
        cap=cylinder('Shoulder rounded outer cap',(sx+s*.23,0,7.43),(sx+s*.33,0,7.43),.29,mat='frame',n=16)
        mod=cap.modifiers.new('Shoulder cap bevel','BEVEL'); mod.width=.045; mod.segments=2
        cylinder('Upper arm underframe',(sx,0,7.34),(ex,-.015,6.24),.23 if u else .19,mat='joint',n=10)
        if u:
            armor('Upper arm fitted shell',sx,[(6.36,.20,-.31,.22),(6.53,.34,-.36,.29),(7.14,.32,-.31,.31),(7.25,.26,-.25,.26)],ridge=.035)
        else:
            armor('Upper arm inset plate',sx+s*.07,[(6.60,.145,-.26,.04),(7.16,.16,-.28,.09)],ridge=.015,bevel=.035)
            rod('Upper arm cyan tendon',(sx-s*.05,-.242,6.36),(sx-s*.05,-.242,7.12),.015,'cyan')
        # Pylon towers stand on a separate black mounting block.
        px=s*(1.63 if u else 1.83); pw=.36 if u else .28
        box('Pylon bracket',(px,.04,7.53),(pw*1.55,.64,.32),'frame',.07)
        armor('Tower cobalt foundation',px,[(7.50,pw*.75,-.37,.38),(7.64,pw*1.12,-.43,.43),(8.05,pw*1.08,-.41,.41),(8.13,pw,-.37,.38)],'blue',ridge=.025)
        armor('Tower white taper',px,[(8.04,pw*1.03,-.365,.37),(9.22,pw*.69,-.27,.27)],ridge=.012)
        armor('Tower gold crown',px,[(9.22,pw*.72,-.28,.28),(9.35,pw*.70,-.27,.27)],'gold',ridge=.012,bevel=.025)
        emblem(px,-.387,8.34,s==-1)
        PART=el
        cylinder('Elbow drum',(ex-.27,-.015,6.12),(ex+.27,-.015,6.12),.23,mat='frame',n=14)
        cylinder('Forearm underframe',(ex,-.015,6.0),(wx,-.035,4.72),.18,mat='joint',n=10)
        if u:
            armor('Forearm sculpted gauntlet',wx,[(4.76,.21,-.33,.21),(5.02,.24,-.34,.29),(5.72,.35,-.39,.34),(5.96,.28,-.31,.27)],ridge=.055)
            panel('Gauntlet cobalt side channel',[(wx+s*.20,5.12),(wx+s*.28,5.70),(wx+s*.32,5.73),(wx+s*.26,5.10)],-.35,.025,'blue',.012)
        else:
            armor('Forearm separate plate',ex,[(5.50,.18,-.29,.09),(6.00,.21,-.29,.11)],ridge=.015,bevel=.02)
            rod('Forearm cyan tendon',(wx,-.22,4.81),(ex,-.25,5.51),.017,'cyan')
        bx=s*(shoulder+.52)
        tip=3.12 if not u else 3.22
        blade_outline=[(bx-s*.055,6.02),(bx+s*.025,6.21),(bx+s*.13,5.97),(bx+s*.18,tip+.22),(bx+s*.12,tip),(bx+s*.055,tip+.18),(bx-s*.045,5.62)]
        panel('Long solar arm blade',blade_outline,-.14,.15,'gold',.017)
        rod('Arm blade cyan cutting edge',(bx+s*.14,-.166,5.88),(bx+s*.18,-.166,tip+.23),.016,'cyan')
        PART=wr
        cylinder('Wrist cuff',(wx,-.035,4.55),(wx,-.035,4.75),.18,mat='frame',n=12)
        box('Palm',(wx,-.025,4.38),(.34,.25,.42),'frame',.065)
        armor('Back of hand plate',wx,[(4.25,.14,.105,.18),(4.57,.17,.11,.19)],ridge=.01)
        for i in range(4):
            fx=wx+(i-1.5)*.095
            z=4.19-abs(i-1.5)*.035
            a=(fx,-.035,z); b=(fx,-.12,z-.20); c=(fx,-.235,z-.32); d=(fx,-.30,z-.29)
            for j,(p,q) in enumerate(((a,b),(b,c),(c,d))):
                rod('Finger %d phalanx %d'%(i+1,j+1),p,q,.043,'frame',8,True)
        rod('Thumb base',(wx-s*.18,-.035,4.44),(wx-s*.28,-.15,4.25),.062,'frame',8,True)
        rod('Thumb tip',(wx-s*.28,-.15,4.25),(wx-s*.24,-.26,4.15),.055,'frame',8,True)

    for s in (-1,1):
        side='L' if s==1 else 'R'; x=s*hip
        hj=joint('hip.'+side,(x,0,5.12),J['hips'])
        kj=joint('knee.'+side,(x,-.025,3.16),hj)
        aj=joint('ankle.'+side,(x,.02,.83),kj)
        PART=hj
        cylinder('Hip bearing',(x-.27,0,5.12),(x+.27,0,5.12),.28,mat='joint',n=14)
        cylinder('Femur structure',(x,0,4.98),(x,-.025,3.25),.26 if u else .23,mat='frame',n=10)
        if u:
            armor('Thigh porcelain shell',x,[(3.55,.20,-.31,.15),(3.74,.28,-.39,.26),(4.61,.37,-.37,.30),(4.92,.29,-.27,.22)],ridge=.06)
        else:
            armor('Thigh suspended plate',x,[(3.91,.22,-.31,.13),(4.90,.26,-.31,.13)],ridge=.035,bevel=.025)
        rod('Thigh cyan seam',(x+s*.22,-.13,3.42),(x+s*.28,-.13,4.48),.017,'cyan')
        if not u: rod('Knee approach cyan tendon',(x,-.25,3.37),(x,-.29,3.95),.018,'cyan')
        PART=kj
        cylinder('Knee transverse bearing',(x-.34,-.025,3.16),(x+.34,-.025,3.16),.26,mat='joint',n=16)
        panel('Knee shield',[(x-.16,2.83),(x+.16,2.83),(x+.27,3.03),(x+.25,3.39),(x+.15,3.53),(x-.16,3.53),(x-.27,3.26),(x-.24,2.99)],-.43,.25,'white',.045)
        blade('Rear knee spur',(x,.17,3.14),(x,.98,3.65),.10,.08,'gold')
        cylinder('Tibia structure',(x,.03,1.01),(x,.015,2.98),.22 if not u else .19,mat='frame',n=10)
        if u:
            armor('Shin aerodynamic shell',x,[(.93,.26,-.33,.24),(1.10,.29,-.38,.30),(1.43,.24,-.34,.32),(2.29,.40,-.44,.53),(2.82,.35,-.33,.40),(2.99,.22,-.25,.24)],ridge=.065)
        else:
            armor('Shin long porcelain plate',x,[(1.01,.20,-.31,.05),(1.16,.25,-.34,.09),(1.90,.29,-.38,.16),(2.85,.21,-.30,.10)],ridge=.035)
        if u:
            pts=[(x+s*.185,.322,1.10),(x+s*.154,.342,1.43),(x+s*.256,.552,2.29)]
            for i in range(2): rod('Calf cyan tendon',pts[i],pts[i+1],.016,'cyan')
        else:
            rod('Calf cyan tendon',(x+s*.15,.205,1.10),(x+s*.15,.205,2.29),.017,'cyan')
        nozzle('Calf thruster',(x,.72 if u else .52,1.91),.22 if u else .16)
        PART=aj
        cylinder('Ankle bearing',(x-.20,.02,.83),(x+.20,.02,.83),.21,mat='joint',n=14)
        # A faceted skate carapace with three true inline wheels.
        fr=-1.00 if u else -.92
        def footring(y,w,top,bot):
            return [(x,y,top),(x+w*.70,y,top-.045),(x+w,y,bot+.07),(x+w*.8,y,bot),(x-w*.8,y,bot),(x-w,y,bot+.07),(x-w*.7,y,top-.045)]
        loft('Skate porcelain carapace',[footring(.58,.25,.62,.42),footring(.20,.36 if u else .29,.84,.43),footring(-.40,.39 if u else .30,.68,.42),footring(fr,.29 if u else .23,.47,.36)],'white')
        box('Skate rail',(x,-.18,.34),(.24,1.72,.13),'joint',.025)
        for i,y in enumerate((-.78,-.11,.56)):
            cylinder('Inline tire %d'%i,(x-.16,y,.27),(x+.16,y,.27),.265,mat='rubber',n=32)
            for side in (-1,1):
                xx=x+side*.169
                cylinder('Wheel hub %d'%i,(xx,y,.27),(xx+side*.012,y,.27),.169,mat='frame',n=24)
                hoop('Cyan wheel ring',(xx+side*.019,y,.27),(1,0,0),.13,.027,'cyan')
                cylinder('Wheel inner disc',(xx+side*.02,y,.27),(xx+side*.021,y,.27),.086,mat='cyan',n=20,ink=False)
        for i in (-1,0,1):
            blade('Gold toe claw',(x+i*.23,fr+.17,.51),(x+i*.33,fr-.36,.23),.055,.055,'gold')
        blade('Gold heel spur',(x,.43,.53),(x,.98,.77),.09,.075,'gold')
    # Broad dark rear fields, as painted in the updated sheet; white side armor.
    if u:
        for ob in CURRENT_COLLECTION.objects:
            if ob.type=='MESH' and ('Thigh porcelain shell' in ob.name or 'Shin aerodynamic shell' in ob.name):
                ob.data.materials.append(M['frame']); ob.data.materials.append(M['ink'])
                for face in ob.data.polygons:
                    if face.normal.y > .8: face.material_index=2
    PART=None
    return ROOT,CURRENT_COLLECTION

A,CA=make_model(False,-3.0)
B,CB=make_model(True,3.0)
ROOT=None; PART=None; PREFIX='Studio / '
CURRENT_COLLECTION=collection('C • Comparison studio')
text_obj('Main title','SUNHAWK', (0,0,10.18),.38,'ink')
text_obj('Main subtitle','SOLSTICE  /  SWIFT CLASS  /  ART-TO-3D STUDY', (0,0,9.81),.13,'muted')
text_obj('Label A','A  /  CURRENT DESIGN',(-3,-.4,-.44),.22,'ink')
text_obj('Label B','B  /  UPDATED DESIGN',(3,-.4,-.44),.22,'ink')
text_obj('Caption A','Lean frame  •  separate armor plates',(-3,-.4,-.76),.13,'muted')
text_obj('Caption B','Fuller armor  •  broader shadow planes',(3,-.4,-.76),.13,'muted')
VIEW_LABEL=text_obj('View label','THREE-QUARTER / SAME SCALE + CEL PALETTE',(0,-.4,-1.14),.13,'muted')
rod('Baseline',(-6,-.4,-.05),(6,-.4,-.05),.007,'rule')
rod('Divider',(0,1,.25),(0,1,9.25),.006,'rule')
panel('Background',[(-30,-10),(30,-10),(30,25),(-30,25)],6,.02,'paper',0,False)
camdata=bpy.data.cameras.new('Sunhawk comparison orthographic')
CAM=bpy.data.objects.new('Sunhawk comparison camera',camdata); CURRENT_COLLECTION.objects.link(CAM)
CAM.location=(0,-35,4.55); CAM.rotation_euler=(math.pi/2,0,0)
camdata.type='ORTHO'; camdata.ortho_scale=15.4; camdata.lens=50
SCENE.camera=CAM
for root in (A,B): root.rotation_euler.z=math.radians(-27)
SCENE['source_policy']='Both models authored from painted design sheets; no game mesh/code imported.'
SCENE['comparison_policy']='Identical orthographic camera, scale, root yaw and palette.'
SCENE['export_note']='Cel preview shader and removable outline modifiers are presentation-only; map base colors in the game.'
SCENE.frame_start=1; SCENE.frame_end=121
SCENE.render.fps=24
for root in (A,B):
    root.rotation_euler.z=0; root.keyframe_insert(data_path='rotation_euler',frame=1)
    root.rotation_euler.z=-math.tau; root.keyframe_insert(data_path='rotation_euler',frame=121)
    action=root.animation_data.action
    for slot in action.slots:
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for fc in bag.fcurves:
                        for key in fc.keyframe_points: key.interpolation='LINEAR'
for frame,name in [(1,'FRONT'),(10,'THREE QUARTER'),(31,'SIDE'),(61,'REAR'),(91,'OTHER SIDE')]:
    SCENE.timeline_markers.new(name,frame=frame)
SCENE.frame_set(10)
refs=collection('D • Packed art references (hidden)')
refs.hide_render=True; refs.hide_viewport=True
for name,path in [('CURRENT','current-design.png'),('UPDATED','updated-design.png')]:
    img=bpy.data.images.load(str(OUT/'references'/path),check_existing=True); img.pack()
    ob=bpy.data.objects.new('REFERENCE / '+name,None); refs.objects.link(ob)
    ob.empty_display_type='IMAGE'; ob.data=img; ob.empty_display_size=12
    ob.rotation_euler=(math.pi/2,0,0); ob.location=(0,5,5)
readme=bpy.data.texts.new('START HERE — Sunhawk comparison')
readme.write('SUNHAWK — two independent art-to-3D models\n\nA is the attached slender design. B is the fuller updated design.\nBoth were modeled directly from the painted sheets; no game geometry was imported.\n\nScene: SUNHAWK • Art comparison. A is left, B is right.\nTimeline: frame 1 front; 10 three-quarter; 31 side; 61 rear.\nPlay frames 1–121 for synchronized turntables.\nEach model has editable rigid-part joint empties, individual plates, and named materials.\nReferences are packed in hidden collection D.\nRemove or hide the Solidify silhouette modifiers to inspect the base meshes.\n\nThis is a first modeling pass for design review, not a finished runtime asset.\nThe cel materials use a shared normal-based palette for a fair comparison.\nUVs, runtime materials, LODs, collision and pose-clearance validation remain future integration work.\nThe painted views disagree in places (especially stabilizer pitch); the 3D interpretation uses one consistent shape.\n')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
exec(compile((OUT/'finish_surfaces.py').read_text(),'finish_surfaces.py','exec'))
bpy.context.view_layer.update()
SCENE.render.filepath=str(OUT/'previews'/'sunhawk-three-quarter.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sunhawk-comparison.blend'),check_existing=False)
result={'scene':SCENE.name,'models':[A.name,B.name], 'objects':len(SCENE.objects),'file':str(OUT/'sunhawk-comparison.blend')}

"""Titan's Rest — Phase 1 step 2. Run with Blender 5.2.2 --background --python.

Procedural source for the standing refinement review, not the wreck or final LODs.
All dimensions are metres. Front is -Y; anatomical left is +X.
"""
import bpy, bmesh, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
COLORS = {'armour':'E6E0D2','red':'B84A3A','slate':'6E7486','gold':'C9A04A',
          'frame':'8A6A3A','verdigris':'5FA08A','visor':'2A2E38','jewel':'3E9C9A',
          'blade':'3A3F4A','edge':'B8BCC8'}

def linear(v):
    v = int(v,16)/255
    return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4

def fresh():
    # This script is run in a new background process, never in an artist's scene.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.name = 'Titan — standing refinement'
    s.unit_settings.system='METRIC'; s.unit_settings.scale_length=1
    s.unit_settings.length_unit='METERS'
    mats={}
    for name, h in COLORS.items():
        m=bpy.data.materials.new(name); rgb=tuple(linear(h[i:i+2]) for i in (0,2,4))
        m.diffuse_color=(*rgb,1); m.use_nodes=True
        bs=m.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=(*rgb,1)
        bs.inputs['Roughness'].default_value=.8
        bs.inputs['Specular IOR Level'].default_value=.15
        mats[name]=m
    return mats

MATS=fresh()
BODY=bpy.data.collections.new('TITAN — rigid armour'); bpy.context.scene.collection.children.link(BODY)
SWORD=bpy.data.collections.new('SWORD — independent'); bpy.context.scene.collection.children.link(SWORD)
PARTS=[]

def mesh(bone, name, verts, faces, mat='armour', face_mats=None):
    data=bpy.data.meshes.new('titan/'+bone+'/'+name)
    data.from_pydata(verts,[],faces); data.update()
    bm=bmesh.new(); bm.from_mesh(data); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(data); bm.free()
    for e in data.edges: e.use_edge_sharp=True
    for f in data.polygons: f.use_smooth=False
    for m in MATS.values(): data.materials.append(m)
    for i,p in enumerate(data.polygons): p.material_index=list(MATS).index(face_mats[i] if face_mats else mat)
    o=bpy.data.objects.new('titan/'+bone+'/'+name,data)
    (SWORD if bone=='sword' else BODY).objects.link(o)
    o['titan_part']=bone; o['part']=bone; o['phase']='1.2'; PARTS.append(o)
    return o

def loft(bone,name,rings,mat='armour',bands=None):
    n=len(rings[0]); vs=[v for r in rings for v in r]
    fs=[tuple(reversed(range(n)))]; ms=[mat]
    for j in range(len(rings)-1):
        for i in range(n): fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)); ms.append(bands[j] if bands else mat)
    fs.append(tuple((len(rings)-1)*n+i for i in range(n))); ms.append(mat)
    return mesh(bone,name,vs,fs,mat,ms)

OCT=[(-.68,-1),(.68,-1),(1,-.68),(1,.68),(.68,1),(-.68,1),(-1,.68),(-1,-.68)]
def body_loft(bone,name,levels,mat='armour',bands=None):
    # Each ring: z, centre x/y, halfwidth/depth. Octagonal closed faceted plate.
    return loft(bone,name,[[(x+a*w,y+b*d,z) for a,b in OCT] for z,x,y,w,d in levels],mat,bands)

def plate(bone,name,poly,yfront,yback,mat='armour',ridge=0):
    # Polygon in X/Z, solid thickness. Optional central front facet apex.
    n=len(poly); vs=[(x,yfront,z) for x,z in poly]+[(x,yback,z) for x,z in poly]
    fs=[]
    if ridge:
        vs.append((sum(x for x,z in poly)/n,yfront-ridge,sum(z for x,z in poly)/n))
        for i in range(n): fs.append((i,(i+1)%n,2*n))
    else: fs.append(tuple(range(n)))
    fs.append(tuple(reversed(range(n,2*n))))
    fs.extend((i,n+i,n+(i+1)%n,(i+1)%n) for i in range(n))
    return mesh(bone,name,vs,fs,mat)

def box(bone,name,center,size,mat='frame',bevel=0):
    x,y,z=center; w,d,h=[n/2 for n in size]
    o=body_loft(bone,name,[(z-h,x,y,w,d),(z+h,x,y,w,d)],mat)
    if bevel:
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        mod=o.modifiers.new('applied plate bevel','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name); o.select_set(False)
        for e in o.data.edges:e.use_edge_sharp=True
    return o

def cylinder(bone,name,a,b,r,mat='frame',n=16,r2=None):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    u=axis.cross(Vector((0,0,1)))
    if u.length<.1:u=axis.cross(Vector((0,1,0)))
    u.normalize(); v=axis.cross(u)
    rings=[[tuple(p+radius*(math.cos(i*2*math.pi/n)*u+math.sin(i*2*math.pi/n)*v)) for i in range(n)] for p,radius in [(a,r),(b,r if r2 is None else r2)]]
    return loft(bone,name,rings,mat)

def ball(bone,name,p,r,mat='slate'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=p)
    o=bpy.context.object; o.name='titan/'+bone+'/'+name
    for c in list(o.users_collection):c.objects.unlink(o)
    BODY.objects.link(o)
    sc=(r,r,r) if isinstance(r,(int,float)) else r
    for v in o.data.vertices:v.co=Vector((v.co.x*sc[0],v.co.y*sc[1],v.co.z*sc[2]))
    for layer in list(o.data.uv_layers):o.data.uv_layers.remove(layer)
    o.data.materials.append(MATS[mat])
    for e in o.data.edges:e.use_edge_sharp=True
    o['titan_part']=bone; o['part']=bone; o['phase']='1.2'; PARTS.append(o); o.select_set(False)
    return o

def tube(bone,name,points,radii,mat='gold',n=8):
    rings=[]
    for i,(point,r) in enumerate(zip(points,radii)):
        p=Vector(point); axis=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        axis.normalize(); u=axis.cross(Vector((0,1,0)))
        if u.length<.01:u=axis.cross(Vector((1,0,0)))
        u.normalize(); v=axis.cross(u)
        rings.append([tuple(p+r*(math.cos(k*math.tau/n)*u+math.sin(k*math.tau/n)*v)) for k in range(n)])
    return loft(bone,name,rings,mat)

def annulus(bone,name,center,outer,inner,depth,mat='gold',n=64,plane='XZ'):
    # Flat washer, deliberately not a torus. Four closed rings, quad faces.
    x,y,z=center; vs=[]
    for d,r in [(-depth/2,outer),(-depth/2,inner),(depth/2,outer),(depth/2,inner)]:
        for k in range(n):
            a=math.tau*k/n
            vs.append((x+r*math.cos(a),y+d,z+r*math.sin(a)) if plane=='XZ' else (x+r*math.cos(a),y+r*math.sin(a),z+d))
    fs=[]
    for k in range(n):
        j=(k+1)%n
        fs += [(k,j,n+j,n+k),(2*n+k,3*n+k,3*n+j,2*n+j),(k,2*n+k,2*n+j,j),(n+k,n+j,3*n+j,3*n+k)]
    return mesh(bone,name,vs,fs,mat)

# Bone heads/tails are authored at real mechanical pivots, not mesh origins.
BONES={}
def bone(name,a,b,parent=None): BONES[name]=(a,b,parent)
bone('root',(0,0,0),(0,0,140))
bone('pelvis',(0,0,650),(0,0,760),'root')
bone('spine',(0,0,760),(0,0,900),'pelvis')
bone('chest',(0,0,900),(0,0,1155),'spine')
bone('neck',(0,0,1155),(0,0,1190),'chest')
bone('head',(0,0,1190),(0,0,1300),'neck')
bone('halo',(0,142,1170),(0,142,1290),'chest')

for s,side in [(1,'L'),(-1,'R')]:
    shoulder=(s*235,0,1085); elbow=(s*278,0,825); wrist=(s*310,0,555)
    bone('shoulder.'+side,shoulder,(s*292,0,1085),'chest')
    bone('upper_arm.'+side,shoulder,elbow,'chest')
    bone('forearm.'+side,elbow,wrist,'upper_arm.'+side)
    bone('hand.'+side,wrist,(s*310,0,493),'forearm.'+side)
    # Fingers spread very slightly; G3's broad palm, 3 armoured phalanges.
    for finger,offset,length in [('index',-30,73),('middle',-10,83),('ring',10,77),('pinky',30,61)]:
        start=Vector((s*(310+offset),-3,493)); delta=Vector((s*offset*.16,0,-length/3))
        for k in range(3):bone(f'{finger}.{k+1:02}.{side}',tuple(start+k*delta),tuple(start+(k+1)*delta),'hand.'+side if k==0 else f'{finger}.{k:02}.{side}')
    thumb=[(s*274,-2,535),(s*255,-5,519),(s*245,-8,498),(s*240,-8,478)]
    for k in range(3):bone(f'thumb.{k+1:02}.{side}',thumb[k],thumb[k+1],'hand.'+side if k==0 else f'thumb.{k:02}.{side}')
    bone('thigh.'+side,(s*100,0,650),(s*132,0,425),'pelvis')
    bone('shin.'+side,(s*132,0,425),(s*150,0,110),'thigh.'+side)
    bone('foot.'+side,(s*150,0,110),(s*150,-100,45),'shin.'+side)

# Closed thorax; no wound, corridors, road cut-outs or final detail in this pass.
body_loft('chest','closed-thorax',[(855,0,0,76,80),(935,0,0,146,123),(1040,0,0,187,135),(1120,0,0,185,135),(1150,0,0,140,110)],'slate')
rows=[(1145,156,-147),(1122,178,-169),(1045,174,-190),(966,139,-178),(884,65,-147),(847,5,-113)]
# Continuous armour below the segmented face: its surface is recessed 3m,
# making the 3m-wide panel breaks actual 3m-deep grooves, not deep open slits.
bed=[]
for z,w,y in rows:
    fs=[-1,-.55,-.36,-.19,0,.19,.36,.55,1]
    front=[(w*f,y+38*f*f+3,z) for f in fs]
    back=[(w*f,y+38*f*f+15,z) for f in reversed(fs)]
    bed.append(front+back)
loft('chest','breastplate-groove-bed',bed,'armour')
# Five panels per side; 3m open seams expose the solid shell set 3m behind.
fractions=[0,.19,.36,.55,1]
for s,side in [(1,'L'),(-1,'R')]:
    for k,(fa,fb) in enumerate(zip(fractions,fractions[1:])):
        rings=[]
        for z,w,y in rows:
            gap=min(1.5,w*.06)
            xa=s*(w*fa+(gap if fa else 0)); xb=s*(w*fb-gap)
            ya=y+38*fa*fa; yb=y+38*fb*fb
            rings.append([(xa,ya,z),(xb,yb,z),(xb,yb+12,z),(xa,ya+12,z)])
        loft('chest',f'breastplate-{side}-{k+1}',rings,'red' if k==2 else 'armour')
    # Exposed curved side rib armour, three descending plates with bronze roots.
    for j in range(3):
        z=970-j*54
        poly=[(s*112,z+24),(s*183,z+62),(s*196,z+34),(s*175,z+6),(s*126,z-24),(s*104,z-7)]
        plate('chest',f'rib-base-{side}-{j+1}',poly,-78,81,'gold',5)
        plate('chest',f'rib-plate-{side}-{j+1}',[(s*(abs(x)-3),zz+5) for x,zz in poly],-91,-72,'armour',5)
    # Twin rear exhaust housings and recessed dark slats.
    box('chest',f'rear-vent-frame-{side}',(s*77,147,1048),(99,49,207),'gold',4)
    box('chest',f'rear-vent-recess-{side}',(s*77,176,1048),(73,16,177),'visor',2)
    for j in range(8):box('chest',f'rear-vent-louvre-{side}-{j+1}',(s*77,187,980+j*19),(68,9,7),'slate')
    plate('chest',f'back-shell-{side}',[(s*8,1148),(s*128,1137),(s*185,1089),(s*174,949),(s*99,887),(s*8,931)],115,138,'armour')

# Segmented bronze abdomen: solid overlapping core inside the cage.
body_loft('spine','abdomen-core',[(722,0,0,75,68),(790,0,0,87,79),(883,0,0,95,94),(916,0,0,80,85)],'slate')
for z,w in [(750,80),(797,89),(844,95),(883,96)]:
    body_loft('spine',f'bronze-rib-{z}',[(z-11,0,0,w,85),(z+11,0,0,w+3,89)],'frame')
for s,side in [(1,'L'),(-1,'R')]:
    for j in range(3):
        plate('spine',f'cage-{side}-{j}',[(s*54,745+j*43),(s*88,760+j*43),(s*101,795+j*43),(s*78,807+j*43),(s*65,774+j*43)],-91,32,'frame',3)
        box('spine',f'oxidized-inset-{side}-{j}',(s*79,-96,776+j*43),(9,3,18),'verdigris')

# Hip girdle and pointed front/back tassets.
body_loft('pelvis','hip-frame',[(605,0,0,88,68),(650,0,0,143,90),(735,0,0,123,84),(761,0,0,85,64)],'frame')
plate('pelvis','front-central-tasset',[(-29,752),(29,752),(39,704),(20,620),(0,601),(-20,620),(-39,704)],-111,-88,'armour',8)
plate('pelvis','rear-central-tasset',[(-27,751),(27,751),(37,702),(19,632),(0,620),(-19,632),(-37,702)],94,112,'armour')
for s,side in [(1,'L'),(-1,'R')]:
    plate('pelvis',f'waist-chevron-{side}',[(s*29,735),(s*110,760),(s*133,732),(s*38,690)],-104,-85,'armour')
    poly=[(s*120,756),(s*153,766),(s*200,612),(s*174,596),(s*133,636)]
    plate('pelvis',f'hip-skirt-trim-{side}',poly,-61,51,'gold',7)
    plate('pelvis',f'hip-skirt-{side}',[(s*139,746),(s*150,746),(s*188,620),(s*176,615),(s*145,645)],-73,-60,'armour',3)

# Collar: separated tall flared plates; the head sits down inside this ring.
cylinder('neck','neck-bearing',(0,0,1135),(0,0,1208),44,'slate',16)
for i in range(12):
    # Flared, overlapping collar sectors, an actual open oval in the G2 top view.
    a0=math.tau*i/12+.012; a1=math.tau*(i+1)/12-.012
    def collar_point(a,t,inside=0):
        return ((128-24*t-inside)*math.cos(a),(105-22*t-inside)*math.sin(a),1130+65*t+24*math.sin(a))
    rings=[[collar_point(a0,t),collar_point(a1,t),collar_point(a1,t,15),collar_point(a0,t,15)] for t in [0,1]]
    loft('chest',f'collar-sector-{i:02}-rim',rings,'gold')
    aa=a0+(a1-a0)*.10; bb=a1-(a1-a0)*.10
    rings=[[collar_point(aa,t,-2),collar_point(bb,t,-2),collar_point(bb,t,2),collar_point(aa,t,2)] for t in [.10,.9]]
    loft('chest',f'collar-sector-{i:02}-ivory',rings,'armour')

# Helmet envelope (G2 smooth centre line; no fin or raised central crest).
helmet=body_loft('head','helmet',[(1185,0,-12,22,24),(1198,0,-7,40,35),(1241,0,-2,55,43),(1276,0,0,51,42),(1293,0,0,29,33),(1300,0,0,2,16)],'armour')
helmet['role']='helmet'
plate('head','visor-surround',[(-52,1250),(0,1243),(52,1250),(48,1224),(26,1213),(0,1220),(-26,1213),(-48,1224)],-45,-34,'slate')
plate('head','visor-band',[(-48,1245),(0,1237),(48,1245),(42,1227),(23,1219),(0,1226),(-23,1219),(-42,1227)],-49,-43,'visor')
plate('head','chin-mask',[(-23,1226),(0,1220),(23,1226),(19,1196),(0,1185),(-19,1196)],-52,-33,'armour',3)
cylinder('head','jewel-bezel',(0,-40,1269),(0,-49,1269),12,'gold')
cylinder('head','forehead-jewel',(0,-49,1269),(0,-52,1269),8.5,'jewel')
for s,side in [(1,'L'),(-1,'R')]:
    cylinder('head',f'temple-{side}',(s*46,0,1230),(s*61,0,1230),17,'gold')
    cylinder('head',f'temple-disc-{side}',(s*61,0,1230),(s*63,0,1230),12,'jewel')
    plate('head',f'cheek-{side}',[(s*25,1220),(s*47,1230),(s*46,1206),(s*25,1194)],-39,-21,'armour')
    tube('head',f'horn-{side}',[(s*43,-7,1265),(s*66,10,1288),(s*80,45,1312),(s*77,85,1330),(s*67,105,1355),(s*62,102,1380),(s*63,95,1390)], [17,20,17,13,8,3.5,.7],'gold')

# Halo with three structural upper-back mounting struts (G1 mounting, G2 rim).
annulus('halo','main-ring',(0,142,1303),147.5,112.5,24,'gold')
annulus('halo','outer-rim',(0,142,1303),147.5,142,29,'gold')
annulus('halo','inner-rim',(0,142,1303),117.5,112.5,29,'gold')
for name,poly in [('top',[(-9,1448),(9,1448),(6,1401),(-6,1401)]),('left',[(-144,1313),(-94,1308),(-94,1299),(-144,1293)]),('right',[(144,1313),(94,1308),(94,1299),(144,1293)])]:
    plate('halo','inward-spoke-'+name,poly,128,155,'gold')
for i,(a,b) in enumerate([((-75,142,1135),(-91,142,1187)),((75,142,1135),(91,142,1187)),((0,155,1130),(0,155,1212))]):
    cylinder('halo',f'mount-strut-{i+1}',a,b,12,'gold',8)
    ball('halo',f'mount-bearing-{i+1}',a,17,'frame')

def limb_plate(bone,name,a,b,start,end,w,d,mat='armour',redband=None):
    a,b=Vector(a),Vector(b)
    ts=[start,start+.06,(start+end)*.5,end-.05,end]
    if redband:ts=sorted(set(ts+list(redband)))
    rings=[]
    for t in ts:
        c=a.lerp(b,t)
        taper=.80 if t==ts[0] or t==ts[-1] else (1 if t<=.65 else .9)
        rings.append([(c.x+u*w*taper,c.y+v*d*taper,c.z) for u,v in OCT])
    bands=[('red' if redband and redband[0]<=((ta+tb)/2)<=redband[1] else mat) for ta,tb in zip(ts,ts[1:])]
    return loft(bone,name,rings,mat,bands)

for s,side in [(1,'L'),(-1,'R')]:
    shoulder,elbow,wrist=[Vector(v) for v in [BONES['upper_arm.'+side][0],BONES['forearm.'+side][0],BONES['hand.'+side][0]]]
    up='upper_arm.'+side; fore='forearm.'+side; hand='hand.'+side; sh='shoulder.'+side
    # Spherical continuous gimbals under shells remain occupied when posing.
    ball(up,'shoulder-gimbal',shoulder,64)
    cylinder(up,'upper-arm-core',shoulder,elbow,40,'frame')
    ball(fore,'elbow-gimbal',elbow,42)
    cylinder(fore,'forearm-core',elbow,wrist,34,'slate')
    ball(hand,'wrist-gimbal',wrist,27)
    # Broad dome crossing the shoulder, with its lower opening around the arm.
    levels=[(1010,s*263,0,67,94),(1054,s*270,0,75,110),(1128,s*263,0,72,110),(1170,s*236,0,41,73)]
    body_loft(sh,'pauldron-shell',levels,'armour')
    body_loft(sh,'pauldron-lower-rim',[(1010,s*263,0,67,94),(1027,s*266,0,71,101)],'gold')
    plate(sh,'pauldron-inner-trim',[(s*195,1023),(s*214,1026),(s*222,1137),(s*243,1163),(s*226,1173),(s*204,1142)],-105,85,'gold')
    body_loft(sh,'pauldron-ivory',[(1029,s*264,-4,53,98),(1068,s*270,-5,63,112),(1120,s*259,-4,62,110),(1156,s*237,-1,34,68)],'armour')
    # Rear opening and bearing establish a movable arm beneath the cap.
    cylinder(sh,'pauldron-outer-bearing',(s*325,10,1071),(s*340,10,1071),51,'frame')
    cylinder(sh,'pauldron-outer-inset',(s*340,10,1071),(s*343,10,1071),38,'slate')
    limb_plate(up,'upper-arm-armour',shoulder,elbow,.30,.86,57,60,redband=(.49,.64))
    limb_plate(fore,'forearm-armour',elbow,wrist,.15,.91,58,57,redband=(.61,.75))
    # Blade-like gold side rails are armour trim, not weapons.
    for outside in [-1,1]:
        if outside==1:
            plate(fore,'outer-gold-rail',[(s*320,860),(s*336,830),(s*360,568),(s*345,539),(s*333,620),(s*307,820)],-35,40,'gold',4)
    # Broad ivory palm and dark socket, no extra fingers or fused hand.
    body_loft(hand,'palm-frame',[(548,s*310,0,32,25),(520,s*310,0,40,26),(491,s*310,0,36,22)],'slate')
    plate(hand,'palm-bezel',[(s*280,544),(s*340,544),(s*351,520),(s*344,492),(s*276,492),(s*269,520)],-27,-16,'gold')
    plate(hand,'palm-plate',[(s*282,540),(s*338,540),(s*347,520),(s*341,497),(s*279,497),(s*273,520)],-30,-24,'armour',2)
    plate(hand,'backhand-plate',[(s*282,540),(s*338,540),(s*346,519),(s*341,496),(s*279,496),(s*274,519)],19,29,'armour')
    for finger in ['thumb','index','middle','ring','pinky']:
        for k in range(1,4):
            n=f'{finger}.{k:02}.{side}'; a,b,_=BONES[n]; a,b=Vector(a),Vector(b)
            radius=9 if finger=='thumb' else 8
            ball(n,'knuckle',a,radius,'gold')
            cylinder(n,'phalange-core',a,b,radius*.68,'slate',8)
            c=(a+b)/2
            # Rounded octagonal cuboid with applied orientation/scale.
            direction=b-a; length=direction.length
            o=body_loft(n,'ivory-segment',[(-length*.40,0,0,radius*.90,radius*.8),(length*.40,0,0,radius*.90,radius*.8)],'armour')
            rot=Vector((0,0,1)).rotation_difference(direction.normalized()).to_matrix()
            for v in o.data.vertices:v.co=rot@v.co+c
    # Legs: visibly continuous bronze/slate frame, pointed ivory plates.
    thigh='thigh.'+side; shin='shin.'+side; foot='foot.'+side
    hip,knee,ankle=[Vector(BONES[n][0]) for n in [thigh,shin,foot]]
    ball(thigh,'hip-gimbal',hip,54,'slate'); cylinder(thigh,'thigh-frame',hip,knee,44,'frame')
    ball(shin,'knee-gimbal',knee,49,'slate'); cylinder(shin,'shin-frame',knee,ankle,42,'frame')
    ball(foot,'ankle-gimbal',ankle,42,'slate')
    limb_plate(thigh,'thigh-armour',hip,knee,.09,.83,65,69)
    plate(shin,'knee-shield',[(s*104,476),(s*150,476),(s*169,433),(s*149,382),(s*119,382),(s*98,434)],-74,-46,'slate',8)
    cylinder(shin,'knee-disc',(s*169,0,425),(s*189,0,425),40,'gold')
    cylinder(shin,'knee-disc-inset',(s*189,0,425),(s*192,0,425),28,'frame')
    # Calf with a wider upper bell and narrow ankle, red stripe integrated.
    body_loft(shin,'greave-side-shell',[(115,s*150,-5,79,69),(170,s*148,-8,68,72),(280,s*141,-4,85,81),(371,s*134,-1,71,75),(394,s*132,0,56,59)],'armour')
    body_loft(shin,'greave-lower-rim',[(115,s*150,-5,79,69),(129,s*150,-5,77,71)],'gold')
    body_loft(shin,'greave-armour',[(132,s*150,-14,72,67),(178,s*148,-14,60,70),(262,s*141,-12,78,80),(300,s*139,-9,79,80),(370,s*134,-4,65,72),(383,s*132,-2,51,57)],'armour',['armour','armour','red','armour','armour'])
    # Back spine and actuators between the two calf panels.
    cylinder(shin,'rear-actuator',(s*132,68,383),(s*150,64,145),20,'frame')
    for j in range(5):box(shin,f'rear-segment-{j}',(s*(136+j*3),75,350-j*43),(42,22,25),'slate')
    cylinder(foot,'ankle-disc',(s*187,0,110),(s*205,0,110),38,'gold')
    cylinder(foot,'ankle-disc-inset',(s*205,0,110),(s*207,0,110),25,'frame')
    # Closed broad feet, no wheels on the titan. Soles at precisely Z=0.
    body_loft(foot,'sole',[(0,s*150,-36,91,126),(23,s*150,-36,91,126)],'slate')
    body_loft(foot,'foot-shell',[(21,s*150,-41,88,123),(77,s*150,-26,78,105),(118,s*150,-7,47,62)],'armour')
    box(foot,'toe-gold-cap',(s*150,-139,37),(67,44,74),'gold',5)
    for off in [-73,73]:box(foot,f'toe-side-{off}',(s*(150+off),-126,32),(19,51,64),'gold',4)
    box(foot,'heel-gold',(s*150,73,29),(104,40,58),'gold',4)

# G1 silhouette calibration: the sheet's tall shoulder caps and very broad,
# long closed feet are larger than a conventional humanoid blockout. Keep all
# arm/hip/knee pivots, crown and sole height fixed. Widen ankle stance 30m/side.
for o in BODY.objects:
    part=o['titan_part']; s=1 if part.endswith('.L') else -1
    for v in o.data.vertices:
        p=o.matrix_world@v.co
        if part.startswith('shoulder.') and p.z>1085:
            p.z=1085+(p.z-1085)*1.5
        if part.startswith('shoulder.') and 'pauldron-outer-' in o.name:
            p.x+=s*7
        if part.startswith('shin.') and '/knee-' not in o.name:
            p.x+=s*30*max(0,min(1,(425-p.z)/315))
        if part.startswith('foot.'):
            if any(token in o.name for token in ['sole','foot-shell','toe-','heel-']):
                p.x=s*150+(p.x-s*150)*1.65
                p.y*=1.8
            p.x+=s*30
        if part=='chest' and 'breastplate' in o.name and p.z<966:
            p.z-=20*(966-p.z)/119
        if part=='pelvis' and p.z>700:
            p.z+=20*min(1,(p.z-700)/61)
        v.co=o.matrix_world.inverted()@p
    # Recalculate facets after the nonuniform geometry edits, never object scale.
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
for s,side in [(1,'L'),(-1,'R')]:
    a,b,parent=BONES['shin.'+side];BONES['shin.'+side]=(a,(s*180,b[1],b[2]),parent)
    a,b,parent=BONES['foot.'+side];BONES['foot.'+side]=((s*180,a[1],a[2]),(s*180,b[1],b[2]),parent)

# Independent 600m sword: pommel starts Y=0; tip exactly Y=600.
annulus('sword','pommel-ring',(0,19,0),19,11,9,'gold',32,'XY')
for off in [-1,1]:box('sword',f'pommel-spoke-{off}',(off*11,19,0),(13,5,10),'gold')
cylinder('sword','grip-core',(0,36,0),(0,150,0),7,'frame',12)
for j in range(11):cylinder('sword',f'red-binding-{j}',(0,40+j*8.9,0),(0,48+j*8.9,0),9,'red',8)
for y in [38,49,139,151]:cylinder('sword',f'grip-collar-{y}',(0,y-2,0),(0,y+2,0),11,'gold',12)
# Crossguard crescent, squared root and ends swept towards the tip.
guard=[(-9,143),(-30,148),(-45,159),(-53,175),(-47,179),(-34,164),(-14,160),(0,163),(14,160),(34,164),(47,179),(53,175),(45,159),(30,148),(9,143)]
o=plate('sword','crescent-crossguard',guard,-5,5,'gold',0)
# plate helper X/Z -> sword X/Y, thickness becomes Z.
for v in o.data.vertices:v.co=(v.co.x,v.co.z,-v.co.y)
box('sword','guard-socket',(0,159,0),(27,19,12),'gold',2)
# Blade 437m / 23m =19:1; 8m thick with genuine 3m centre groove.
ys=[163,170,551,590,600]; widths=[11.5,11.5,11.5,3.7,.08]
vs=[]
for y,w in zip(ys,widths):
    # top left edge, bevel root, groove shoulders/floor, opposite edge; mirror bottom.
    profile=[(-w,0),(-w*.72,4),(-1.5,4),(-1.5,1),(1.5,1),(1.5,4),(w*.72,4),(w,0),(w*.72,-4),(1.5,-4),(1.5,-1),(-1.5,-1),(-1.5,-4),(-w*.72,-4)]
    if y>=590:profile=[(x*(w/11.5) if abs(x)==1.5 else x,z*(w/11.5)) for x,z in profile]
    vs.extend((x,y,z) for x,z in profile)
n=14; fs=[tuple(reversed(range(n)))]; ms=['blade']
for j in range(len(ys)-1):
    for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i));ms.append('edge' if i in [0,6,7,13] else 'blade')
fs.append(tuple((len(ys)-1)*n+i for i in range(n)));ms.append('edge')
blade=mesh('sword','blade',vs,fs,'blade',ms)
blade['role']='blade'
# Merge sword to the one independent object requested, material slots retained.
bpy.ops.object.select_all(action='DESELECT')
for o in list(SWORD.objects):o.select_set(True)
bpy.context.view_layer.objects.active=blade; bpy.ops.object.join()
blade.name='titan/sword/assembly'; blade['titan_part']='sword'; blade['role']='sword'
blade.select_set(False)

# Step 2 reshapes only geometry; reviewed body pivots remain immutable.
exec(compile((HERE/'refine_titan.py').read_text(),str(HERE/'refine_titan.py'),'exec'))

# Armature and rigid bone parenting, preserving authored metre coordinates.
data=bpy.data.armatures.new('titan_rig'); rig=bpy.data.objects.new('titan_rig',data)
bpy.context.scene.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(a,b,parent) in BONES.items():
    eb=data.edit_bones.new(name); eb.head=a; eb.tail=b
    if parent:eb.parent=data.edit_bones[parent]
    eb.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT'); rig.show_in_front=True; data.display_type='OCTAHEDRAL'
for o in BODY.objects:
    world=o.matrix_world.copy(); o.parent=rig; o.parent_type='BONE'; o.parent_bone=o['titan_part']
    bpy.context.view_layer.update(); o.matrix_world=world
rig['phase']='1.2 — standing refinement only'; rig['source_commit']=__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=str(ROOT),text=True).strip()
rig['units']='metres; Blender -Y forward, Z up, +X anatomical left'
rig['pose_notes']='Rigid segments. Move upper-arm and shoulder-cap bones independently. Halo detach with Keep Transform. Sword is independent.'
for b in data.bones:b.use_deform=False
for s in bpy.data.screens:
    for area in s.areas:
        if area.type=='VIEW_3D':area.spaces.active.clip_end=20000;area.spaces.active.clip_start=.5
bpy.context.scene['phase']='1.2'
bpy.context.scene['brief']='Phase1 step2 standing refinement; no wreck pose, breaks, corridors, road fitting or LODs.'
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active=rig
bpy.context.view_layer.update()

# Store source and export with a separate reproducible exporter, not hand-edited GLB.
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'titan-production.blend'),compress=True)
exec(compile((HERE/'export_titan.py').read_text(),str(HERE/'export_titan.py'),'exec'))

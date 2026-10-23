"""Phase 1 step 2 — executed by build_titan.py before rigid parenting.
Sheet refinement remains reproducible. All body bones retain step-1 pivots;
only finger knuckles move, as explicitly approved with the larger hands.
No Phase 2 geometry, fitting or posing is performed here.
"""

def discard(part, names):
    for name in names:
        ob=bpy.data.objects.get(f'titan/{part}/{name}')
        if ob:
            PARTS.remove(ob)
            bpy.data.objects.remove(ob,do_unlink=True)

def world_edit(ob, fn):
    inv=ob.matrix_world.inverted()
    for v in ob.data.vertices:v.co=inv@fn(ob.matrix_world@v.co)
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()

def radius_scale(ob, centre, factors):
    c=Vector(centre)
    world_edit(ob,lambda p:c+Vector(tuple((p[i]-c[i])*factors[i] for i in range(3))))

# More closely rounded, still flat-faceted envelopes. The broad flat front
# leaves 84% of the width on one plane, with two shallow corner facets.
PROFILE=[(-.84,-1),(.84,-1),(.96,-.91),(1,-.65),(1,.50),(.86,.83),(.52,1),
         (-.52,1),(-.86,.83),(-1,.50),(-1,-.65),(-.96,-.91)]
def shaped(part,name,levels,mat='armour',bands=None):
    return loft(part,name,[[(x+u*w,y+v*d,z) for u,v in PROFILE] for z,x,y,w,d in levels],mat,bands)

def arm_shell(part,name,a,b,samples,mat='armour',bands=None):
    a,b=Vector(a),Vector(b)
    return shaped(part,name,[(a.lerp(b,t).z,a.lerp(b,t).x,0,w,d) for t,w,d in samples],mat,bands)

# G3's two rails enclose three flat strips separated by real 3m grooves.
def forearm_face(part,a,b):
    a,b=Vector(a),Vector(b)
    ts=[.17,.24,.40,.60,.61,.75,.84,.90]
    ws=[51,64,69,69,69,66,58,51]
    for strip,(fa,fb) in enumerate([(-1,-1/3),(-1/3,1/3),(1/3,1)]):
        rings=[]
        for t,w in zip(ts,ws):
            c=a.lerp(b,t); gap=1.5
            left=c.x+w*fa+(gap if fa!=-1 else 0)
            right=c.x+w*fb-(gap if fb!=1 else 0)
            rings.append([(left,-76,c.z),(right,-76,c.z),(right,-73,c.z),(left,-73,c.z)])
        mats=['red' if .61<=(ta+tb)/2<=.75 else 'armour' for ta,tb in zip(ts,ts[1:])]
        loft(part,f'inner-flat-panel-{strip+1}',rings,'armour',mats)
    # Continuous 3m-deep backing, itself attached to the closed cuff.
    rings=[]
    for t,w in zip(ts,ws):
        c=a.lerp(b,t)
        rings.append([(c.x-w,-73,c.z),(c.x+w,-73,c.z),(c.x+w,-67,c.z),(c.x-w,-67,c.z)])
    loft(part,'inner-panel-groove-bed',rings,'slate')
    for side,name in [(-1,'inner'),(1,'outer')]:
        rings=[]
        for t,w in zip(ts,ws):
            c=a.lerp(b,t); x=c.x+side*(w+7)
            rings.append([(x-6,-74,c.z),(x+6,-74,c.z),(x+6,-35,c.z),(x-6,-35,c.z)])
        loft(part,f'{name}-gold-rail',rings,'gold')

# Closed, curved pauldron shell with a genuine concave underside. Sampling
# across X and around Y/Z gives a wrap rather than a solid vertical side wall.
def arch(part,name,s,stations,angles,thickness,mat):
    verts=[];nx=len(stations);na=len(angles)
    for inner in [False,True]:
        for x,ry,rz in stations:
            for deg in angles:
                a=math.radians(deg);d=thickness if inner else 0
                verts.append((s*x,(ry-d)*math.sin(a),1085+(rz-d)*math.cos(a)))
    layer=nx*na;faces=[]
    for i in range(nx-1):
        for j in range(na-1):
            a=i*na+j;b=a+na
            faces.extend([(a,a+1,b+1,b),(layer+a,layer+b,layer+b+1,layer+a+1)])
    for i in range(nx-1):
        for j in [0,na-1]:
            a=i*na+j;b=a+na;faces.append((a,b,layer+b,layer+a))
    for i in [0,nx-1]:
        for j in range(na-1):
            a=i*na+j;faces.append((a,layer+a,layer+a+1,a+1))
    return mesh(part,name,verts,faces,mat)

for sign,side in [(1,'L'),(-1,'R')]:
    up='upper_arm.'+side;fore='forearm.'+side;hand='hand.'+side;sh='shoulder.'+side
    thigh='thigh.'+side;shin='shin.'+side;foot='foot.'+side
    shoulder=Vector(BONES[up][0]);elbow=Vector(BONES[fore][0]);wrist=Vector(BONES[hand][0])
    hip=Vector(BONES[thigh][0]);knee=Vector(BONES[shin][0]);ankle=Vector(BONES[foot][0])

    discard(sh,['pauldron-shell','pauldron-lower-rim','pauldron-inner-trim','pauldron-ivory'])
    stations=[(189,77,100),(204,100,116),(235,124,130),(272,134,132),(310,124,113),(343,91,72)]
    angles=list(range(-108,109,3))
    # Three inset ivory fields expose the structural gold rim and 3m seams.
    def shell_radius(x):
        for (xa,ya,za),(xb,yb,zb) in zip(stations,stations[1:]):
            if xa<=x<=xb:
                t=(x-xa)/(xb-xa)
                return (x,ya+(yb-ya)*t+2,za+(zb-za)*t+2)
        raise ValueError(x)
    panels=[shell_radius(x) for x in [211,235,272,307,310,326]]
    # Identical station and angle tessellation prevents one faceted surface
    # cutting through the other between its control rings.
    additions=[(x,y-2,z-2) for x,y,z in panels if x not in [p[0] for p in stations]]
    stations=sorted(stations+additions)
    arch(sh,'pauldron-shell',sign,stations,angles,19,'gold')
    for n,(lo,hi) in enumerate([(-96,-36),(-33,33),(36,96)]):
        steps=list(range(lo,hi+1,3))
        arch(sh,f'pauldron-ivory-{n+1}',sign,panels,steps,5,'armour')
    # Hub and three internal ribs physically seat the shell on its bearing.
    cylinder(sh,'pauldron-hub',(sign*235,0,1085),(sign*338,0,1085),38,'slate',24)
    for n,deg in enumerate([-65,0,65]):
        a=math.radians(deg)
        cylinder(sh,f'pauldron-inner-rib-{n+1}',
                 (sign*335,35*math.sin(a),1085+35*math.cos(a)),
                 (sign*335,83*math.sin(a),1085+65*math.cos(a)),11,'frame',12)

    # Widen armour, leaving the reviewed shoulder/elbow/wrist pivots untouched.
    discard(up,['upper-arm-armour'])
    arm_shell(up,'upper-arm-armour',shoulder,elbow,
              [(.28,47,48),(.36,61,61),(.49,65,65),(.64,65,65),(.73,61,62),(.86,47,47)],
              bands=['armour','armour','red','armour','armour'])
    discard(fore,['forearm-armour','outer-gold-rail'])
    arm_shell(fore,'forearm-armour',elbow,wrist,
              [(.14,58,58),(.22,76,69),(.40,82.5,71),(.61,82.5,71),(.75,78,69),(.84,71,64),(.91,58,55)],
              bands=['armour','armour','armour','red','armour','armour'])
    forearm_face(fore,elbow,wrist)
    radius_scale(bpy.data.objects[f'titan/{fore}/elbow-gimbal'],elbow,(1.3,1.3,1.3))
    cylinder(fore,'elbow-outer-bezel',elbow+Vector((sign*45,0,0)),elbow+Vector((sign*57,0,0)),44,'gold',24)
    cylinder(fore,'elbow-outer-cap',elbow+Vector((sign*57,0,0)),elbow+Vector((sign*60,0,0)),33,'slate',24)
    # G3 exposes paired actuator cheeks around the elbow and wrist sockets.
    for flank in [-1,1]:
        c=elbow+Vector((flank*35,4,-1))
        cylinder(up,f'elbow-actuator-{flank}',c+Vector((0,20,62)),c,12,'frame',12)

    # Thigh barrel: outward shift of armour only prevents centreline overlap.
    discard(thigh,['thigh-armour'])
    shaped(thigh,'thigh-armour',[(628,sign*110,0,74,78),(608,sign*121,0,101,104),
        (570,sign*129,0,117.5,117.5),(530,sign*133,0,117.5,117.5),
        (487,sign*136,0,101,106),(463,sign*136,0,68,78)])
    radius_scale(bpy.data.objects[f'titan/{shin}/knee-gimbal'],knee,(1.55,1.55,1.55))
    radius_scale(bpy.data.objects[f'titan/{thigh}/thigh-frame'],hip,(1.25,1.25,1))
    # Scale knee armour around its immutable bearing, independent of stance.
    for name in ['knee-shield','knee-disc','knee-disc-inset']:
        radius_scale(bpy.data.objects[f'titan/{shin}/{name}'],knee,(1.5,1.5,1.3))
    discard(shin,['greave-side-shell','greave-lower-rim','greave-armour'])
    # Centre follows the existing fixed knee -> ankle line; only the envelope grows.
    def legx(z):return knee.lerp(ankle,(425-z)/315).x
    levels=[(115,legx(115),-5,99,92),(146,legx(146),-5,93,92),(190,legx(190),-4,102,104),
            (240,legx(240),0,120,121),(278,legx(278),0,127.5,127.5),
            (303,legx(303),0,124,123),(350,legx(350),0,101,106),(386,legx(386),0,69,74)]
    shaped(shin,'greave-side-shell',levels,'armour',['armour','armour','armour','red','red','armour','armour'])
    shaped(shin,'greave-lower-rim',[(115,legx(115),-5,99,92),(129,legx(129),-5,98,94)],'gold')
    # Front inset follows the bell, with a shallow central ridge and real side gaps.
    front=[]
    for z,x,y,w,d in levels[1:-1]:
        front.append([(x-w*.70,y-d-3,z),(x,y-d-8,z),(x+w*.70,y-d-3,z),
                      (x+w*.70,y-d+2,z),(x,y-d+2,z),(x-w*.70,y-d+2,z)])
    loft(shin,'greave-armour',front,'armour',['armour','armour','red','red','armour'])
    # Longer rear frame collars follow the existing actuator, never its pivots.
    for ob in list(BODY.objects):
        if ob.get('titan_part')==shin and '/rear-' in ob.name:
            world_edit(ob,lambda p:Vector((p.x,p.y*1.55,p.z)))

    # Palm grows about the fixed wrist; all three knuckles keep proportional
    # spacing after explicit user approval. Non-finger bones are NOT modified.
    factors=(1.25,1.35,1.23)
    finger_names=[f'{finger}.{n:02}.{side}' for finger in ['thumb','index','middle','ring','pinky'] for n in [1,2,3]]
    def hand_point(p):return wrist+Vector(tuple((p[i]-wrist[i])*factors[i] for i in range(3)))
    for ob in list(BODY.objects):
        part=ob['titan_part']
        if part==hand and '/wrist-gimbal' not in ob.name or part in finger_names:
            world_edit(ob,hand_point)
    radius_scale(bpy.data.objects[f'titan/{hand}/wrist-gimbal'],wrist,(1.15,1.15,1.15))
    for name in finger_names:
        a,b,parent=BONES[name];BONES[name]=(tuple(hand_point(Vector(a))),tuple(hand_point(Vector(b))),parent)
        # Slightly chunkier finger plates while preserving the new 25m spacing.
        mid=(Vector(BONES[name][0])+Vector(BONES[name][1]))*.5
        ob=bpy.data.objects[f'titan/{name}/ivory-segment']
        radius_scale(ob,mid,(1.10,1.13,1))

# Move the head's complete visible assembly; retain original head/neck bones.
# The collar remains attached to the chest. Mechanical neck and skull yokes
# bridge the original pivot to the advanced helmet, rather than leaving a gap.
for ob in list(BODY.objects):
    if ob['titan_part']=='head':world_edit(ob,lambda p:p+Vector((0,-76,0)))
cylinder('neck','forward-neck-core',(0,0,1169),(0,-76,1205),32,'slate',24)
for sign,side in [(1,'L'),(-1,'R')]:
    tube('neck',f'neck-yoke-{side}',[(sign*27,5,1158),(sign*31,-40,1173),(sign*31,-73,1210)],[11,13,11],'frame',12)
    box('neck',f'neck-yoke-pad-{side}',(sign*31,-54,1186),(15,22,22),'gold',2)
cylinder('head','skull-pivot-yoke',(0,0,1190),(0,-71,1211),24,'slate',24)

# Small physical edge chamfers replace step-1 razor edges. Do not bevel the
# segmented chest seams or sword groove, whose exact approved spacing stays.
for ob in list(BODY.objects):
    name=ob.name
    if any(key in name for key in ['ivory-segment','palm-','backhand','knee-shield','hip-skirt','tasset','waist-chevron','toe-','heel-']):
        bpy.context.view_layer.objects.active=ob;ob.select_set(True)
        mod=ob.modifiers.new('sheet edge chamfer','BEVEL');mod.width=1.8;mod.segments=2
        mod.limit_method='ANGLE';mod.angle_limit=math.radians(35)
        bpy.ops.object.modifier_apply(modifier=mod.name);ob.select_set(False)
    for e in ob.data.edges:e.use_edge_sharp=True
    for face in ob.data.polygons:face.use_smooth=False
    ob['part']=ob['titan_part'];ob['phase']='1.2'
for ob in SWORD.objects:ob['part']='sword';ob['phase']='1.2'

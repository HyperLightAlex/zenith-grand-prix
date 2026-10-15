"""Refine one reference design into editable, articulated production geometry.
Set MODEL (e.g. 'daystar') before running. Only this script's own scene is rebuilt.
Original game builders and the Sunhawk source scenes are never edited.
Coordinate conversion: game +Y up/+Z forward -> Blender +Z up/-Y forward.
"""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector, Matrix
from collections import defaultdict
ROOT=Path('/Users/alexanderkelley/Projects/igpx')
BASE=ROOT/'art/blender/roster'
MODEL=globals().get('MODEL','daystar')
data=json.loads((BASE/'source'/f'{MODEL}.json').read_text())
role=data['role']; family=data['livery']['id']; dims=data['dims']
# Individual silhouette decisions. Preserve each frame's characteristic equipment.
PROFILES={
 'daystar':(1.16,1.10,1.08,'Racing fairings, layered knee armor and reinforced skate decks'),
 'rampart':(1.05,1.04,1.03,'Broad gauntlets, recessed joint discs and a crisp fanged chest'),
 'razor':(1.18,1.14,1.09,'Lean blade carrier, split armor and faceted shin shells'),
 'stinger':(1.12,1.10,1.06,'Compact rifle platform, stronger forearm housings and visor brow'),
 'maul':(1.05,1.06,1.04,'Heavy knuckle armor, protected wrists and clean layered spikes'),
 'anubis':(1.22,1.16,1.12,'Tapered obelisk armor, gold-edged joints and layered jackal cheek plates'),
 'horus':(1.16,1.12,1.08,'Falcon mask, feather armor and a clear staff grip'),
 'sobek':(1.06,1.07,1.04,'Crocodile jaw planes, column bracers and heavy articulated hands'),
 'seraph':(1.20,1.16,1.09,'Slender knight, layered pearl armor and separated feather fins'),
 'longbow':(1.14,1.12,1.08,'Lance-bearing knight with stronger greaves and closed weapon grip'),
 'paladin':(1.05,1.06,1.04,'Shield knight with articulated knuckles and reinforced elbow covers'),
 'kamaitachi':(1.20,1.16,1.10,'Fast samurai, tapered bracers and articulated blade-bearing arms'),
 'fujin':(1.14,1.12,1.08,'Wind-ring samurai, layered shin shells and reinforced staff grip'),
 'raijin':(1.05,1.06,1.04,'Thunder-drum defender with heavy knuckles and mechanical joint rings')
}
arm_gain,thigh_gain,shin_gain,design_note=PROFILES[MODEL]
old_scene=bpy.context.scene
name='ROSTER / '+MODEL.title()
existing=bpy.data.scenes.get(name)
if existing:
    if not existing.get('roster_generated'): raise RuntimeError('Refusing to replace non-generated scene')
    for ob in list(existing.objects): bpy.data.objects.remove(ob,do_unlink=True)
    bpy.data.scenes.remove(existing)
scene=bpy.data.scenes.new(name); scene['roster_generated']=True;scene['model']=MODEL;scene['design_notes']=design_note
bpy.context.window.scene=scene
collection=scene.collection
mats={}
def rgb(hexval):
    return tuple(((hexval>>s)&255)/255 for s in (16,8,0))
colors={k:data['livery'][v] for k,v in {'P':'primary','S':'secondary','T':'trim','K':'frame','F':'frame','D':'frame','C':'glow','G':'glow'}.items()}
colors['K']=0x303a4d; colors['D']=0x151b29
for slot,color in colors.items():
    m=bpy.data.materials.new(MODEL+' / '+slot);m.diffuse_color=(*rgb(color),1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=m.diffuse_color
    bs.inputs['Roughness'].default_value=.65
    if slot=='G': bs.inputs['Emission Color'].default_value=m.diffuse_color;bs.inputs['Emission Strength'].default_value=1.2
    mats[slot]=m

def cv(v): return (v[0],-v[2],v[1])
joints={}
for key,info in data['joints'].items():
    ob=bpy.data.objects.new('JNT / '+key,None);collection.objects.link(ob);ob.location=cv(info['world']);ob.empty_display_size=.12
    ob['roster_joint']=key
    joints[key]=ob
# Keep the editable Blender source articulated too. Exports remain joint-local.
PARENTS={'spine':'hips','chest':'spine','head':'chest','wingL':'chest','wingR':'chest',
 'shL':'chest','shR':'chest','elL':'shL','elR':'shR','wrL':'elL','wrR':'elR',
 'hipL':'hips','hipR':'hips','kneeL':'hipL','kneeR':'hipR','ankleL':'kneeL','ankleR':'kneeR',
 'skirtL':'hips','skirtR':'hips','skirtBack':'hips'}
for key,parent in PARENTS.items():
    joints[key].parent=joints[parent];joints[key].location=cv(data['joints'][key]['position'])
meshes=[]
def mesh(name,joint,slot,vs,faces,bevel=.018,detail=False):
    if role==2 and name.startswith(('Hand /','Finger ','Thumb /')):
        # Defender fists must read as short, broad striking tools, not scaled-up
        # slender runner hands. Keep wrist origins and the rearward curl.
        vs=[(x*1.18,y*.72,z) for x,y,z in vs]
    me=bpy.data.meshes.new(name);me.from_pydata([cv(v) for v in vs],[],faces);me.update()
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if not any(e.is_boundary for e in bm.edges) and bm.calc_volume(signed=True)<-1e-8:
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bmesh.ops.dissolve_limit(bm,angle_limit=.012,verts=list(bm.verts),edges=list(bm.edges),use_dissolve_boundaries=False)
    bm.to_mesh(me);bm.free();me.update()
    ob=bpy.data.objects.new(name,me);collection.objects.link(ob);ob.parent=joints[joint]
    ob['joint']=joint;ob['slot']=slot;ob['detail']=detail;me.materials.append(mats[slot])
    for p in me.polygons: p.use_smooth=True
    if bevel and slot not in ('G','C'):
        mod=ob.modifiers.new('Fine production edge radius','BEVEL');mod.width=bevel;mod.segments=2
        mod.limit_method='ANGLE';mod.angle_limit=1.05;mod.use_clamp_overlap=True
    mod=ob.modifiers.new('Area weighted armor normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=60
    meshes.append(ob);return ob

def block(name,joint,slot,at,size,bevel=.02):
    x,y,z=at;w,h,d=[s/2 for s in size]
    vs=[(x+a*w,y+b*h,z+c*d) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    return mesh(name,joint,slot,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],bevel)

def plate(name,joint,slot,pts,z,depth=.045,bevel=.012):
    vs=[(x,y,z+d) for d in (-depth/2,depth/2) for x,y in pts];n=len(pts)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,joint,slot,vs,faces,bevel)

def disc(name,joint,slot,at,r,depth,axis='x',sides=16):
    vs=[]
    for d in (-depth/2,depth/2):
        for i in range(sides):
            a=2*math.pi*i/sides
            p=(d,math.cos(a)*r,math.sin(a)*r) if axis=='x' else (math.cos(a)*r,math.sin(a)*r,d)
            vs.append(tuple(at[j]+p[j] for j in range(3)))
    faces=[tuple(range(sides-1,-1,-1)),tuple(range(sides,2*sides))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    return mesh(name,joint,slot,vs,faces,.01)

def is_shell(joint,slot,lo,hi):
    # Sobek's lathed column bracers carry the flutes and flared capitals.
    if MODEL=='sobek' and joint.startswith('el'): return False
    if MODEL=='paladin' and joint.startswith('sh') and abs((lo[0]+hi[0])/2)>.5: return False
    h=hi[1]-lo[1];cy=(hi[1]+lo[1])/2
    return slot=='P' and (
        (joint.startswith('sh') and cy<-.35 and h>dims['upperArm']*.48) or
        (joint.startswith('el') and cy<-.35 and h>dims['foreArm']*.65) or
        (joint.startswith('hip') and joint!='hips' and h>dims['thigh']*.62) or
        (joint.startswith('knee') and cy<-.55 and h>dims['shin']*.58))
for i,part in enumerate(data['parts']):
    joint=part['joint'];slot=part['slot'];pos=part['positions']
    # Replace the old hand geometry; retain rifle/staff components and cuffs.
    if joint.startswith('wr') and (role!=1 or part.get('hand')): continue
    vs=[list(pos[n:n+3]) for n in range(0,len(pos),3)]
    # The old grips were offset for forward-facing palms. Mirror the weapon,
    # then seat it against the new palm; centered wrist cuffs stay centered.
    held_weapon=joint=='wrR' and (min(v[2] for v in vs)+max(v[2] for v in vs))/2>.15
    # A small increase in limb cross section gives the armor planes room to read.
    gain=arm_gain if joint.startswith('el') else thigh_gain if joint.startswith('hip') and joint!='hips' else shin_gain if joint.startswith('knee') else 1
    for v in vs:
        if joint.startswith('wr'): v[2]=-v[2]+(.18 if held_weapon else 0)
        if gain!=1: v[0]*=gain
    # Rebuild long primary limb shells as five sculpted armor rings, retaining
    # their attachment, paint plane and bounding silhouette. Small ornaments,
    # bands, weapons, pauldrons and the head remain the reference geometry.
    lo=[min(v[a] for v in vs) for a in range(3)];hi=[max(v[a] for v in vs) for a in range(3)]
    h=hi[1]-lo[1];cy=(hi[1]+lo[1])/2
    long_shell=is_shell(joint,slot,lo,hi)
    if long_shell:
        cx=(lo[0]+hi[0])/2;hw=(hi[0]-lo[0])/2;depth=hi[2]-lo[2]
        rings=[]
        widths=(.78,.96,1,.92,.72)
        if family=='mirage':widths=(.92,1,.88,.77,.69) # obelisk lineage
        for t,w in zip((0,.12,.63,.90,1),widths):
            y=lo[1]+h*t
            # Follow the reference's front/back contour at this height, so
            # cuffs, colored insets and painted markings retain their clearance.
            zs=[]
            for n in range(0,len(vs),3):
                tri=vs[n:n+3]
                for a,b in zip(tri,tri[1:]+tri[:1]):
                    if min(a[1],b[1])-1e-6<=y<=max(a[1],b[1])+1e-6:
                        if abs(a[1]-b[1])<1e-6:zs.extend((a[2],b[2]))
                        else:zs.append(a[2]+(b[2]-a[2])*(y-a[1])/(b[1]-a[1]))
            front=max(zs) if zs else hi[2];back=min(zs) if zs else lo[2]
            cut=min(hw*.28,max(0,front-back)*.20)
            rings.append([(cx-hw*w+cut,y,front),(cx+hw*w-cut,y,front),(cx+hw*w,y,front-cut),
                (cx+hw*w,y,back+cut),(cx+hw*w-cut,y,back),(cx-hw*w+cut,y,back),
                (cx-hw*w,y,back+cut),(cx-hw*w,y,front-cut)])
        vs=[v for ring in rings for v in ring]
        faces=[tuple(range(7,-1,-1)),tuple(range(32,40))]+[(j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k) for j in range(4) for k in range(8)]
        mesh(f'{MODEL} / sculpted {joint} / {i:03}',joint,slot,vs,faces,.022)
        continue
    # Keep both flat paint faces and purposeful facets; remove triangulation noise.
    bb=[max(v[a] for v in vs)-min(v[a] for v in vs) for a in range(3)]
    edge=min(.024,min(bb)*.14) if slot in ('P','S','T','F','K') else .008
    mesh(f'{MODEL} / {joint} / {slot} / {i:03}',joint,slot,vs,[(n,n+1,n+2) for n in range(0,len(vs),3)],edge)

# Anatomically consistent hands, four fingers, inner thumbs, front back plates.
for side in (1,-1):
    joint='wrL' if side==1 else 'wrR';k=(.95,1.02,1.65)[role]
    block('Hand / palm',joint,'F',(0,-.26*k,0),(.42*k,.43*k,.30*k),.025)
    plate('Hand / dorsal armor',joint,'P',[(-.21*k,-.10*k),(.21*k,-.10*k),(.23*k,-.36*k),(.16*k,-.46*k),(-.16*k,-.46*k),(-.23*k,-.36*k)],.18*k,.09*k,.015)
    for f in range(4):
        x=side*(f-1.5)*.105*k;length=(.20,.25,.24,.18)[f]*k
        block(f'Finger {f+1} / knuckle',joint,'F',(x,-.45*k,.09*k),(.087*k,.12*k,.14*k),.012)
        block(f'Finger {f+1} / proximal',joint,'F',(x,-.48*k-length/2,-.01*k),(.084*k,length,.115*k),.012)
        block(f'Finger {f+1} / curl',joint,'F',(x,-.50*k-length,-.11*k),(.078*k,.11*k,.18*k),.012)
        block(f'Finger {f+1} / tip',joint,'D',(x,-.48*k-length,-.20*k),(.07*k,.12*k,.09*k),.009)
    block('Thumb / inner metacarpal',joint,'F',(-side*.255*k,-.29*k,-.04*k),(.12*k,.23*k,.16*k),.025)
    block('Thumb / opposing tip',joint,'F',(-side*.20*k,-.42*k,-.19*k),(.13*k,.14*k,.13*k),.02)
    if role==2:
        # Retain each defender's characteristic striking surface.
        band_slot='S' if family in ('solstice','vanta') else 'T'
        block('Hand / faction knuckle guard',joint,band_slot,(0,-.43*k,.24*k),(.45*k,.09*k,.08*k),.012)
        if MODEL=='maul':
            for f in range(4):
                x=(f-1.5)*.105*k
                plate('Hand / fang knuckle',joint,'T',[(x-.035*k,-.43*k),(x+.035*k,-.43*k),(x,-.55*k)],.29*k,.035*k,.004)
        if MODEL=='paladin':
            for f in range(4):
                x=(f-1.5)*.105*k
                mesh('Hand / silver gadling',joint,'T',[(x-.04*k,-.47*k,.28*k),(x+.04*k,-.47*k,.28*k),(x+.04*k,-.40*k,.28*k),(x-.04*k,-.40*k,.28*k),(x,-.435*k,.37*k)],[(0,3,2,1),(0,1,4),(1,2,4),(2,3,4),(3,0,4)],.003)
    # Joint rings and small mechanical bearings, never large floating balls.
    elbow='elL' if side==1 else 'elR';knee='kneeL' if side==1 else 'kneeR'
    r=(.23,.28,.36)[role]
    disc('Elbow / bearing cap',elbow,'F',(side*r*1.15,0,0),r*.86,.08)
    disc('Elbow / inset hub',elbow,'D',(side*(r*1.15+.045),0,0),r*.48,.025)
    disc('Elbow / axle',elbow,'T',(side*(r*1.15+.064),0,0),r*.23,.025)
    disc('Knee / bearing cap',knee,'F',(side*r*1.20,0,0),r*.9,.08)
    disc('Knee / inset hub',knee,'D',(side*(r*1.20+.045),0,0),r*.48,.025)
    disc('Knee / axle',knee,'T',(side*(r*1.20+.064),0,0),r*.23,.025)

# Frame-specific armor relief. Thin perimeter shells preserve the faction motifs;
# unlike projected noise these details stay attached to an actual panel.
for side in (1,-1):
    hip='hipL' if side==1 else 'hipR';elbow='elL' if side==1 else 'elR'
    knee='kneeL' if side==1 else 'kneeR'
    if family in ('mirage','tempest','aurora'):
        w=(.28,.34,.43)[role];h=dims['thigh']
        z=(.36,.44,.53)[role]
        # Back-side reinforcement leaves the decorated front planes unobscured.
        plate('Thigh / rear split armor',hip,'P',[(-w,-.38),(w,-.38),(w*.9,-h+.42),(0,-h+.24),(-w*.9,-h+.42)],-z,.09,.025)
        block('Thigh / rear service recess',hip,'D',(0,-h*.55,-z-.055),(.10,h*.24,.022),.006)
    if MODEL in ('daystar','stinger','longbow','fujin','horus'):
        # A shaped front knee cover replaces the exposed ball's toy-like read.
        w=.30
        plate('Knee / layered cap',knee,'P',[(-w,.20),(w,.20),(w+.04,-.12),(.17,-.36),(-.17,-.36),(-w-.04,-.12)],.39,.12,.025)
    if MODEL in ('anubis','razor','seraph','kamaitachi'):
        # Slim runners need a little armor volume without losing their lean outline.
        w=.20;h=dims['foreArm'];z=.29
        plate('Bracer / inset back shell',elbow,'P',[(-w,-.23),(w,-.23),(.24,-h+.28),(0,-h+.10),(-.24,-h+.28)],-z,.075,.018)
        block('Bracer / service line',elbow,'S',(0,-h*.60,-z-.045),(.055,h*.38,.02),.004)
    if MODEL in ('rampart','maul','paladin','raijin','sobek'):
        # Heavy frames get recessed wrist armor rather than larger fingers alone.
        block('Gauntlet / wrist gasket',elbow,'D',(0,-dims['foreArm']+.03,0),(.82,.13,.78),.035)

# Studio references are embedded into the source blend for future hand editing.
ref=BASE.parent.parent/'model-sheets'/'refs'/f'ref-{MODEL}-current.png'
if ref.exists():
    img=bpy.data.images.load(str(ref),check_existing=True);img.pack()
    ob=bpy.data.objects.new('REFERENCE / original design',None);collection.objects.link(ob)
    ob.empty_display_type='IMAGE';ob.data=img;ob.empty_display_size=12;ob.location=(0,3,5);ob.hide_render=True
scene['dims_json']=json.dumps(dims);scene['source_reference']=str(ref)
scene.world=bpy.data.worlds.new(MODEL+' studio');scene.world.color=(.18,.18,.18)
scene.render.engine='BLENDER_EEVEE_NEXT' if bpy.app.version<(4,2,0) else 'CYCLES'
# A sensible saved front view and orthographic camera for editing/review.
camdata=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',camdata);collection.objects.link(cam)
cam.location=(11,-20,10);target=Vector((0,0,4.8));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=12;scene.camera=cam
for name,loc,power,size in [('Key',(-6,-10,14),1500,7),('Fill',(8,-4,7),800,8)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    ob=bpy.data.objects.new(name,light);collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
bpy.context.view_layer.update()
bpy.data.libraries.write(str(BASE/f'{MODEL}-production.blend'),{scene},fake_user=True,compress=True)

# Consolidate by joint/paint slot, preserving authored normals and shared vertices.
reports=[]
for level,ratio in [(0,1),(1,.52),(2,.26)]:
    temp=bpy.data.scenes.new('ROSTER EXPORT');bpy.context.window.scene=scene
    groups=defaultdict(lambda:{'vertices':[],'normals':[],'faces':[],'lookup':{}})
    mods=[]
    for ob in meshes:
        if level:
            dec=ob.modifiers.new('Export-only LOD','DECIMATE');dec.ratio=ratio;dec.use_collapse_triangulate=True;mods.append((ob,dec))
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    for ob in meshes:
        ev=ob.evaluated_get(deps);me=ev.to_mesh();me.calc_loop_triangles()
        b=groups[(ob['joint'],ob['slot'])]
        for tri in me.loop_triangles:
            face=[]
            for vi,li in zip(tri.vertices,tri.loops):
                p=tuple(me.vertices[vi].co);n=tuple(me.corner_normals[li].vector)
                key=tuple(round(v,6) for v in (*p,*n))
                idx=b['lookup'].get(key)
                if idx is None:
                    idx=len(b['vertices']);b['lookup'][key]=idx;b['vertices'].append(p);b['normals'].append(n)
                face.append(idx)
            if len(set(face))==3:b['faces'].append(face)
        ev.to_mesh_clear()
    for ob,mod in mods:ob.modifiers.remove(mod)
    root=bpy.data.objects.new(MODEL,None);temp.collection.objects.link(root)
    root['roster_schema']=1;root['model']=MODEL;root['dims']=dims;root['level']=level
    export_meshes=[]
    for (joint,slot),g in groups.items():
        me=bpy.data.meshes.new(joint+'/'+slot);me.from_pydata(g['vertices'],[],g['faces']);me.update()
        for face in me.polygons:face.use_smooth=True
        me.normals_split_custom_set_from_vertices(g['normals']);me.materials.append(mats[slot]);export_meshes.append(me)
        ob=bpy.data.objects.new(joint+'/'+slot,me);temp.collection.objects.link(ob);ob.parent=root;ob['joint']=joint;ob['slot']=slot
    bpy.context.window.scene=temp
    out=ROOT/'src/client/render/mech/assets/roster'/f'{MODEL}{"-lod"+str(level) if level else ""}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_active_scene=True,export_yup=True,export_normals=True,export_texcoords=False,export_extras=True,export_animations=False,export_skins=False,export_cameras=False,export_lights=False,export_materials='EXPORT')
    reports.append({'level':level,'triangles':sum(len(g['faces']) for g in groups.values()),'bytes':out.stat().st_size,'parts':len(groups)})
    bpy.context.window.scene=scene
    for ob in list(temp.objects):bpy.data.objects.remove(ob,do_unlink=True)
    bpy.data.scenes.remove(temp)
    for me in export_meshes:bpy.data.meshes.remove(me)
(BASE/f'{MODEL}-manifest.json').write_text(json.dumps({'model':MODEL,'design':design_note,'levels':reports},indent=2)+'\n')
bpy.context.window.scene=old_scene
result={'model':MODEL,'source_parts':len(meshes),'levels':reports,'blend':str(BASE/f'{MODEL}-production.blend')}

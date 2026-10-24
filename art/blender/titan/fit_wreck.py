"""Phase 2 only: pose the approved standing production source and fit the road.
Blender 5.2 --background --python art/blender/titan/fit_wreck.py
The immutable standing source is retained; FIT is read-only and never exported.
"""
import bpy
import bmesh
import sys, json, math, runpy, hashlib
from pathlib import Path
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from collections import Counter
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(HERE))
SOURCE=HERE/'titan-standing.blend'
POSE=json.loads((HERE/'fit/pose.json').read_text())
RIGPOSE=json.loads((HERE/'fit/rig-pose.json').read_text())
ROAD=json.loads((HERE/'fit/road.json').read_text())
MATERIALS=['armour','red','slate','gold','frame','verdigris','visor','jewel','blade','edge']

def log(*a): print(*a,flush=True)
def world_bake(o):
    m=o.matrix_world.copy(); o.parent=None; o.data.transform(m); o.matrix_world=Matrix.Identity(4); o.data.update()
def mesh(part,name,vs,fs,mat='frame',mats=None):
    me=bpy.data.meshes.new('titan/'+part+'/'+name); me.from_pydata(vs,[],fs); me.update()
    for n in MATERIALS: me.materials.append(bpy.data.materials[n])
    for i,p in enumerate(me.polygons): p.material_index=MATERIALS.index(mats[i] if mats else mat); p.use_smooth=False
    for e in me.edges: e.use_edge_sharp=True
    o=bpy.data.objects.new('titan/'+part+'/'+name,me); TITAN.objects.link(o)
    o['part']=part; o['titan_part']=part; o['phase']='2'; return o

def box(part,name,lo,hi,mat='frame'):
    vs=[(x,y,z) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
    return mesh(part,name,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],mat)

def tube(part,name,points,radius,mat='frame',sides=8):
    vs=[]; fs=[]
    for i,p in enumerate(points):
        p=Vector(p); tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        u=tangent.cross(Vector((1,0,0)))
        if u.length<.01:u=tangent.cross(Vector((0,1,0)))
        u.normalize(); v=tangent.cross(u)
        vs.extend(tuple(p+radius*(math.cos(k*math.tau/sides)*u+math.sin(k*math.tau/sides)*v)) for k in range(sides))
    fs.append(tuple(reversed(range(sides))))
    for j in range(len(points)-1):
        fs.extend((j*sides+k,j*sides+(k+1)%sides,(j+1)*sides+(k+1)%sides,(j+1)*sides+k) for k in range(sides))
    fs.append(tuple((len(points)-1)*sides+k for k in range(sides)))
    return mesh(part,name,vs,fs,mat)

def cut_plane(o,point,normal,clear_inner=True):
    bm=bmesh.new(); bm.from_mesh(o.data)
    res=bmesh.ops.bisect_plane(bm,geom=bm.verts[:]+bm.edges[:]+bm.faces[:],plane_co=point,plane_no=normal,clear_inner=clear_inner,clear_outer=not clear_inner,dist=.0001)
    edges=[e for e in res['geom_cut'] if isinstance(e,bmesh.types.BMEdge) and e.is_boundary]
    if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()

def pose_source():
    global TITAN
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    assert bpy.app.version[:2]==(5,2)
    TITAN=bpy.data.collections.new('TITAN'); bpy.context.scene.collection.children.link(TITAN)
    rig=bpy.data.objects['titan_rig']; rig.matrix_world=Matrix(RIGPOSE['rig'])
    for b in rig.data.bones:
        rig.pose.bones[b.name].matrix=Matrix(RIGPOSE['bones'][b.name]['armature']); bpy.context.view_layer.update()
    objects=[o for o in bpy.data.objects if o.type=='MESH' and o.get('part')]
    for o in objects:
        for c in list(o.users_collection):c.objects.unlink(o)
        TITAN.objects.link(o)
        if o['part']!='sword':world_bake(o)
        o['phase']='2'
    sword=next(o for o in objects if o['part']=='sword')
    broken=sword.copy(); broken.data=sword.data.copy(); TITAN.objects.link(broken)
    broken.name='titan/sword/broken-grip-and-pommel'
    cut=RIGPOSE['sword']['cutAtRestY']
    cut_plane(sword,(0,cut,0),(0,1,0),True)
    cut_plane(broken,(0,cut,0),(0,1,0),False)
    sword.matrix_world=Matrix(RIGPOSE['sword']['world']); world_bake(sword)
    broken.matrix_world=Matrix.Translation((505,350,4)) @ Matrix.Rotation(math.radians(-34),4,'Z') @ Matrix.Translation((0,-68,0)); world_bake(broken)
    rig.hide_render=True; rig.hide_set(True)
    # Preserve posed rig for inspection, but its armour is baked, never exported.
    rig['phase']='2'; bpy.context.scene.name='Titan — Phase 2 road fit'
    sys.argv=[__file__]
    runpy.run_path(str(HERE/'fit/load_fit.py'),run_name='__main__')
    for cname in ['FIT/keepout','FIT/sky','FIT/guide','FIT/targets']:
        c=bpy.data.collections.get(cname)
        if c:
            c.hide_render=True
            for o in c.all_objects:o.hide_set(True)
    log('PHASE2_POSED',len(objects),'objects')


def densify(o,spacing=12):
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=bm.faces[:])
    for _ in range(6):
        es=[e for e in bm.edges if e.calc_length()>spacing]
        if not es:break
        bmesh.ops.subdivide_edges(bm,edges=es,cuts=1,use_grid_fill=True)
        bmesh.ops.triangulate(bm,faces=bm.faces[:])
    bm.to_mesh(o.data);bm.free()

def road_ceiling(x,y):
    # Nearest continuous road frame, with a broad smooth transition back into
    # the original armour. No stair-step edge following the 4m sample boxes.
    candidates=[s for s in ROAD['samples'] if s['piece'] in (1,2,3,4,5,6,7)]
    sample=min(candidates,key=lambda s:(x-s['p'][0])**2+(y+s['p'][2])**2)
    px,py,pz=sample['p'][0],-sample['p'][2],sample['p'][1]
    rx,ry=sample['r'][0],-sample['r'][2]
    d=abs((x-px)*rx+(y-py)*ry)
    if (x-px)**2+(y-py)**2>(sample['hw']+65)**2:return None
    ux,uy,uz=sample['u'][0],-sample['u'][2],sample['u'][1]
    if uz<.4:return None
    h=pz+(-10.2-ux*(x-px)-uy*(y-py))/uz
    w=max(0,min(1,(sample['hw']+45-d)/30))
    return h,w*w*(3-2*w)

def seat_surfaces():
    groups={k:[] for k in ('hand','fore','head','collar')}
    for o in list(TITAN.all_objects):
        if o.type!='MESH':continue
        p=o['part'];n=o.name
        if p=='hand.R' or (p.endswith('.R') and p.split('.')[0] in ('thumb','index','middle','ring','pinky')):kind='hand'
        elif p=='forearm.R':kind='fore'
        elif p=='head':kind='head'
        elif p=='chest' and ('breastplate' in n or 'collar' in n):kind='collar'
        else:continue
        densify(o,10 if kind in ('head','collar') else 12)
        groups[kind].append(o)
    for kind,objects in groups.items():
        # Deform each vertical column as one piece. Capping vertices separately
        # crushed both sides of thin armour, and its recessed bed, onto one plane.
        # A shared envelope preserves thickness and the existing layer offsets.
        vs=[];fs=[]
        for o in objects:
            off=len(vs);vs.extend(v.co.copy() for v in o.data.vertices)
            fs.extend(tuple(off+i for i in f.vertices) for f in o.data.polygons)
        tree=BVHTree.FromPolygons(vs,fs,all_triangles=True,epsilon=.0001)
        raytop=max(v.z for v in vs)+100
        # Sample the displacement on a continuous grid. Exact vertex rays can
        # graze the front face and hit its back instead, creating isolated spikes
        # in the recessed bed. Median filtering removes those ray discontinuities.
        step=3.0
        x0=math.floor(min(v.x for v in vs)/step)*step-step
        y0=math.floor(min(v.y for v in vs)/step)*step-step
        nx=math.ceil((max(v.x for v in vs)-x0)/step)+2
        ny=math.ceil((max(v.y for v in vs)-y0)/step)+2
        field={}
        for i in range(nx):
            for j in range(ny):
                x=x0+i*step;y=y0+j*step
                hits=[tree.ray_cast(Vector((x+dx,y+dy,raytop)),Vector((0,0,-1)))[0]
                      for dx,dy in ((0,0),(.05,0),(-.05,0),(0,.05),(0,-.05))]
                heights=[h.z for h in hits if h is not None]
                if not heights:continue
                top=max(heights);dz=0
                if kind=='hand':dz=max(0,min(55,20+.17*(y-480)))
                elif kind=='fore':dz=max(0,min(13,(855-y)*.065))
                elif kind=='head':
                    knots=[(-270,0),(-195,0),(-160,40),(-140,42),(-120,25),(-95,16),(-65,10),(-10,0)]
                    for (a,da),(b,db) in zip(knots,knots[1:]):
                        if a<=x<=b:dz=da+(db-da)*(x-a)/(b-a);break
                    dz*=max(0,min(1,(top-110)/70))
                elif kind=='collar':
                    dz=38*max(0,1-abs(x+10)/130)*max(0,min(1,(y-1240)/45))*max(0,min(1,(1480-y)/80))*max(0,min(1,(top-160)/40))
                cap=road_ceiling(x,y)
                recess=1.2 if kind in ('hand','head') else 0
                if cap is not None and top+dz>cap[0]-recess and top>50:
                    dz+=(cap[0]-recess-top-dz)*cap[1]
                field[i,j]=dz
        # Extend only near the silhouette so every actual mesh vertex has a field.
        for _ in range(3):
            expanded=dict(field)
            for i in range(nx):
                for j in range(ny):
                    if (i,j) in field:continue
                    ns=[field[ii,jj] for ii in range(i-1,i+2) for jj in range(j-1,j+2) if (ii,jj) in field]
                    if ns:expanded[i,j]=sum(ns)/len(ns)
            field=expanded
        smooth={}
        for (i,j),value in field.items():
            ns=sorted(field[ii,jj] for ii in range(i-1,i+2) for jj in range(j-1,j+2) if (ii,jj) in field)
            smooth[i,j]=ns[len(ns)//2]
        for o in objects:
            for v in o.data.vertices:
                gx=(v.co.x-x0)/step;gy=(v.co.y-y0)/step
                i=math.floor(gx);j=math.floor(gy);a=gx-i;b=gy-j
                v.co.z+=sum(smooth.get((i+di,j+dj),0)*w for di,dj,w in
                            [(0,0,(1-a)*(1-b)),(1,0,a*(1-b)),(0,1,(1-a)*b),(1,1,a*b)])
            o.data.update()
    log('SEATING_SHAPED_WITH_LAYER_THICKNESS')

def chamber():
    from wreck_clearance import make_box, subtract_boxes
    # Angular G4 chamber, entry/exit portals and a shared fork vestibule.
    # These are authorial openings, larger than the road's minimum safe boxes.
    cavities=[((117,1220,-24),(290,1626,198),'rib-chamber'),
              ((188,1550,-24),(293,1700,120),'north-breach'),
              ((103,1165,-24),(249,1445,94),'south-hull-exit')]
    cutters=[make_box((0,0,0),((1,0,0),(0,1,0),(0,0,1)),tuple(zip(lo,hi)),label=n) for lo,hi,n in cavities]
    for o in list(TITAN.all_objects):
        if o.type=='MESH' and o['part'] in ('chest','spine'):
            subtract_boxes(o,cutters)
    # G4's bronze oval ribs, broad structural web, and paired longitudinal rails.
    for j,x in enumerate((113,143,177,214,254,284)):
        pts=[(x,1502+112*math.cos(a),92+112*math.sin(a)) for a in [math.tau*i/32 for i in range(33)]]
        tube('chest',f'chamber-rib-{j+1}',pts,7.5,'frame',8)
        if j in (0,5):
            tube('chest',f'chamber-edge-trim-{j+1}',[(x-2,y,z) for _,y,z in pts],2,'gold',6)
    for j,a in enumerate((.35,.95,1.57,2.2,2.8,3.45,5.9)):
        y=1502+120*math.cos(a);z=92+120*math.sin(a)
        tube('chest',f'chamber-longitudinal-frame-{j+1}',[(96,y,z),(293,y,z)],6,'frame',8)
    # The loop's chamber backing is outside its whole swept belt, not a face over it.
    box('chest','chamber-west-backing',(100,1380,-18),(110,1624,190),'frame')
    # Angled wound jambs keep the breach a deliberate G4 opening.
    tube('chest','breach-west-jamb',[(174,1622,0),(176,1624,115),(191,1620,143)],9,'frame')
    tube('chest','breach-east-jamb',[(287,1620,0),(287,1620,113),(273,1620,143)],9,'frame')
    tube('chest','breach-header',[(191,1620,143),(229,1620,152),(273,1620,143)],10,'armour')
    # Permanent broad collar plates are the support under the lifted broken neck.
    box('neck','head-support-lower-collar',(-224,1358,-12),(-65,1486,53),'slate')
    box('neck','head-support-upper-collar',(-199,1368,46),(-63,1476,102),'frame')
    tube('neck','head-support-west-yoke',[(-220,1378,35),(-203,1378,86),(-177,1389,125)],13,'armour')
    tube('neck','head-support-east-yoke',[(-220,1466,35),(-203,1466,86),(-177,1455,125)],13,'armour')
    # No Phase3 weathering/debris. These are the load-bearing plates required by Phase2.
    log('G4_CHAMBER_BUILT')

def corridors():
    samples=[s for s in ROAD['samples'] if 5812<=s['s']<=6056]
    def point(s,d,h):
        p=Vector((s['p'][0],-s['p'][2],s['p'][1]));r=Vector((s['r'][0],-s['r'][2],s['r'][1]));u=Vector((s['u'][0],-s['u'][2],s['u'][1]))
        return tuple(p+r*d+u*h)
    def strip(name,bounds,mat,roof=False):
        vs=[];fs=[]
        for s in samples:
            lo,hi,h0,h1=bounds(s);vs.extend(point(s,d,h) for d,h in [(lo,h0),(hi,h0),(hi,h1),(lo,h1)])
        fs.append((3,2,1,0))
        for i in range(len(samples)-1):
            fs.extend((4*i+k,4*i+(k+1)%4,4*(i+1)+(k+1)%4,4*(i+1)+k) for k in range(4))
        fs.append(tuple(4*(len(samples)-1)+k for k in range(4)))
        o=mesh('chest',name,vs,fs,mat)
        if roof:o['titan_sky_exceptions']='the Hull'
        return o
    # Routes are distinct. At their common mouth the median wall is legitimately open.
    strip('hull-left-floor',lambda s:(-s['hw']+s['shift'][0]-7,-s['median']+s['shift'][0]+7,s['rise'][0]-16,s['rise'][0]-10.2),'frame')
    strip('hull-left-outer-wall',lambda s:(-s['hw']+s['shift'][0]-10,-s['hw']+s['shift'][0]-5.5,s['rise'][0]-16,s['rise'][0]+25),'frame')
    strip('hull-left-inner-wall',lambda s:(-s['median']+s['shift'][0]+5.5,-s['median']+s['shift'][0]+10,s['rise'][0]-16,s['rise'][0]+25),'frame')
    strip('hull-left-roof',lambda s:(-s['hw']+s['shift'][0]-10,-s['median']+s['shift'][0]+10,s['rise'][0]+23,s['rise'][0]+29),'frame',True)
    # Raised gallery: under-deck frame and inner support, deliberately no outside wall/roof.
    strip('hull-gallery-sill',lambda s:(s['median']+s['shift'][1]-7,s['hw']+s['shift'][1]+6,s['rise'][1]-16,s['rise'][1]-10.2),'frame')
    strip('hull-gallery-inner-frame',lambda s:(s['median']+s['shift'][1]-10,s['median']+s['shift'][1]-5.5,-18,s['rise'][1]-10.2),'frame')
    for j,s in enumerate(samples[::6]):
        lo=-s['hw']+s['shift'][0]-8;hi=-s['median']+s['shift'][0]+8;h=s['rise'][0]
        tube('chest',f'hull-corridor-outer-upright-{j}',[point(s,lo,h-16),point(s,lo,h+25)],3,'gold')
        tube('chest',f'hull-corridor-inner-upright-{j}',[point(s,hi,h-16),point(s,hi,h+25)],3,'gold')
        o=tube('chest',f'hull-roof-crossmember-{j}',[point(s,lo,h+24.5),point(s,hi,h+24.5)],2,'frame');o['titan_sky_exceptions']='the Hull'
    log('HULL_CORRIDORS_BUILT')

def export_wreck(phase=2, refinements=None):
    for o in TITAN.all_objects:
        if o.type!='MESH':continue
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm,faces=bm.faces[:])
        degenerate=[f for f in bm.faces if f.calc_area()<1e-8]
        if degenerate:bmesh.ops.delete(bm,geom=degenerate,context='FACES_ONLY')
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
        bm.to_mesh(o.data);bm.free()
        # glTF also validates source data. Do it explicitly before counting so
        # the report, saved production mesh and export describe the same faces.
        if o.data.validate(verbose=False):log('VALIDATED_MESH',o.name)
        o.data.update()
    bpy.context.view_layer.update()
    for empty in list(TITAN.all_objects):
        if empty.type=='MESH' and not len(empty.data.polygons):bpy.data.objects.remove(empty,do_unlink=True)
    counts=Counter(); objects=[o for o in TITAN.all_objects if o.type=='MESH' and len(o.data.polygons)]
    for o in objects:
        o.data.calc_loop_triangles();counts[o['part']]+=len(o.data.loop_triangles)
        assert o.name.startswith('titan/'+o['part']+'/') and o['part']==o['titan_part']
        assert not o.data.uv_layers
    assert sum(counts.values())<=600000,counts
    for o in bpy.context.scene.objects:o.select_set(False)
    for o in objects:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(ROOT/'src/client/render/titan/assets/titan.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_texcoords=False,export_animations=False,export_skins=False,export_extras=True,export_cameras=False,export_lights=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'titan-production.blend'),compress=True)
    report={'phase':phase,'blender':bpy.app.version_string,'source':'titan-standing.blend','source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'fit_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (HERE/'fit').iterdir() if p.suffix in ('.json','.obj')},'triangles_by_part':dict(sorted(counts.items())),'triangles_total':sum(counts.values()),'meshes':len(objects),'pose':'rig-pose.json applied; rigid body matrix and all rig pose matrices preserved','refinements':['Right hand/fingers lifted by a continuous Y-dependent field20..55m; right forearm armour blended0..13m. No road changed.','Head/neck targetrig retained45degree pitch+25m lift; local brow/head crown facets raised0..42m toward slab.','Collar/breastplate upper facets raised up to38m within local road bearing area.','Shoulder rise deliberately left for game pylons.','Broken grip and pommel placed east of blade, centre(505,350,4)Blender.','G4 chest chamber, north breach, south exit, enclosed left Hull corridor and open outside gallery.','Load-bearing fallen collar plates/yokes under propped head; no Phase3 weathering.']}
    if refinements is not None: report['refinements']=refinements
    (HERE/f'phase{phase}-report.json').write_text(json.dumps(report,indent=2)+'\n');log(f'PHASE{phase}_REPORT',json.dumps(report))

def bearing_plates():
    # Broad helmet forehead plate, still faceted at its shoulders. The shaped
    # top supplies the final full-width Brow bearing without moving its target.
    rings=[]
    for x,w,z in [(-161,34,253.8),(-149,46,253.8),(-128,51,253.8),(-102,50,253.8),(-79,40,253.8)]:
        slope=max(0,min(.11,(x+160)*.0015))
        rings.append([(x,1422-w,224),(x,1422-w*.84,z+slope*w*.84),(x,1422+w*.84,z-slope*w*.84),(x,1422+w,224)])
    vs=[v for ring in rings for v in ring];fs=[(3,2,1,0)]
    for i in range(len(rings)-1):fs.extend((4*i+k,4*i+(k+1)%4,4*(i+1)+(k+1)%4,4*(i+1)+k) for k in range(4))
    fs.append(tuple(4*(len(rings)-1)+k for k in range(4)))
    o=mesh('head','forehead-bearing-plate',vs,fs,'armour');densify(o,9)
    for v in o.data.vertices:
        cap=road_ceiling(v.co.x,v.co.y)
        if cap is not None and v.co.z>cap[0]:v.co.z+=(cap[0]-v.co.z)*cap[1]
    # Fallen collar's upper plate bridges the short gap from chin to chest.
    ss=[s for s in ROAD['samples'] if 1452<=s['s']<=1524]
    vs=[];fs=[]
    for s in ss:
        p=Vector((s['p'][0],-s['p'][2],s['p'][1]));r=Vector((s['r'][0],-s['r'][2],s['r'][1]));u=Vector((s['u'][0],-s['u'][2],s['u'][1]))
        w=38
        vs.extend(tuple(p+r*d+u*h) for d,h in [(-w,-31),(-w+5,-10.2),(w-5,-10.2),(w,-31)])
    fs.append((3,2,1,0))
    for i in range(len(ss)-1):fs.extend((4*i+k,4*i+(k+1)%4,4*(i+1)+(k+1)%4,4*(i+1)+k) for k in range(4))
    fs.append(tuple(4*(len(ss)-1)+k for k in range(4)))
    mesh('neck','fallen-collar-upper-bearing',vs,fs,'armour')


def palm_bearing():
    # The broad G3 palm plate continues over its wrist socket. Keep individual
    # fingers visible and do not extend the hand out into the approach road.
    rings=[]
    for y,w in [(548,32),(564,45),(595,48),(632,48),(663,43),(690,34)]:
        cap=road_ceiling(0,y);z=cap[0] if cap else 110
        rings.append([(-w,y,z-24),(-w+6,y,z),(w-6,y,z),(w,y,z-24)])
    vs=[v for ring in rings for v in ring];fs=[(3,2,1,0)]
    for i in range(len(rings)-1):fs.extend((4*i+k,4*i+(k+1)%4,4*(i+1)+(k+1)%4,4*(i+1)+k) for k in range(4))
    fs.append(tuple(4*(len(rings)-1)+k for k in range(4)))
    o=mesh('hand.R','palm-wrist-bearing-armour',vs,fs,'armour');densify(o,9)
    for v in o.data.vertices:
        cap=road_ceiling(v.co.x,v.co.y)
        if cap is not None and v.co.z>cap[0]:v.co.z=cap[0]
    for side in [-1,1]:
        tube('hand.R','palm-bearing-edge-'+str(side),[(side*(w-2),y,z-12) for (y,w),z in zip([(548,32),(564,45),(595,48),(632,48),(663,43),(690,34)],[r[1][2] for r in rings])],2,'gold')


def build_wreck():
    pose_source()
    # Saved staging is outside the repository; the approved source stays immutable.
    bpy.ops.wm.save_as_mainfile(filepath='/private/tmp/titan-phase2-posed.blend',compress=True)
    seat_surfaces();chamber();corridors();bearing_plates();palm_bearing()
    for o in list(TITAN.all_objects):
        if o.type=='MESH':
            if o['part'] in ('upper_arm.L','forearm.L'):o['titan_sky_exceptions']='the Long Flank'
            if o['part']=='halo':o['titan_sky_exceptions']='the Halo'
            cut_plane(o,(0,0,-20),(0,0,1),True)
    from wreck_clearance import clip_objects
    stats=clip_objects([o for o in TITAN.all_objects if o.type=='MESH'],HERE/'fit/road.json',margin=1.0)
    (HERE/'phase2-clipping.json').write_text(json.dumps(stats,indent=2)+'\n')
    export_wreck()

if __name__=='__main__':
    build_wreck()

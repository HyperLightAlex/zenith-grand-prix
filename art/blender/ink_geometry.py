"""Deterministic design edges + outline data, shared by both game exporters.
Coordinates here are Blender joint-local. Custom glTF vectors are explicitly
converted to Y-up (the glTF exporter does not transform custom attributes).
"""
import bpy, bmesh, math, json, re
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path

RULES=json.loads((Path(__file__).with_name('ink-overrides.json')).read_text())

def named(name, key):
    """Match complete part-name words, including plurals, never fin in fine/finger."""
    return re.search(r'(?<![a-z])'+re.escape(key.lower())+r'(?:e?s)?(?![a-z])', name.lower()) is not None


def settings(model, ob):
    out=dict(RULES['defaults'])
    out.update(RULES.get('models',{}).get(model,{}).get('defaults',{}))
    for rule in RULES['rules']+RULES.get('models',{}).get(model,{}).get('rules',[]):
        if any(named(ob.name, s) for s in rule['contains']):
            out.update({k:v for k,v in rule.items() if k!='contains'})
    return out

def outline_weight(model, ob):
    cfg=settings(model,ob)
    if ob.get('slot')=='G' or ob.get('surface_detail') or ob.get('ink_exclude'): return 0.
    if 'ink_width' in ob:return float(ob['ink_width'])
    if 'width' in cfg: return cfg['width']
    size=sorted(max(v.co[i] for v in ob.data.vertices)-min(v.co[i] for v in ob.data.vertices) for i in range(3))
    # Surface relief is lined explicitly: no expanding shell to fight its seat.
    if size[0]<.065 or size[2]<.22: return 0.
    if size[0]<.15 and size[2]>.6: return .35
    return 1.

def smooth_normals(me):
    """One area-weighted normal for each welded position, across split seams."""
    me.calc_loop_triangles()
    sums={}
    keys=[tuple(round(c,5) for c in v.co) for v in me.vertices]
    for tri in me.loop_triangles:
        a,b,c=(me.vertices[i].co for i in tri.vertices)
        n=(b-a).cross(c-a)
        for i in tri.vertices:sums[keys[i]]=sums.get(keys[i],Vector())+n
    return [(sums.get(k,Vector((0,0,1))).normalized()) for k in keys]

def set_outline_attributes(me, normals, weights):
    for name,kind,values in [('_OUTLINE_NORMAL','FLOAT_VECTOR',normals),('_INK_WIDTH','FLOAT',weights)]:
        old=me.attributes.get(name)
        if old:me.attributes.remove(old)
        attr=me.attributes.new(name,kind,'POINT')
        for item,value in zip(attr.data,values):
            if kind=='FLOAT_VECTOR':item.vector=(value[0],value[2],-value[1])
            else:item.value=value

def design_edges(model, ob, transform, evaluated, level):
    """Read only the clean control cage; project each stroke onto its bevel.
    Strokes carry a category (crease/paint/rim) for distance thinning. A raised
    plate's largest opposing faces supply the rims, never its thickness edges.
    """
    if level==2 or ob.get('slot')=='G' or ob.get('surface_detail') or ob.get('ink_exclude'):return []
    cfg=settings(model,ob)
    if cfg.get('skip'):return []
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5)
    bm.normal_update()
    # Source normals, including hand-authored plates, are not modified here.
    # Exporting must leave the plain-look geometry exactly as it was.
    bevel=max((m.width for m in ob.modifiers if m.type=='BEVEL'),default=0.)
    bvh=BVHTree.FromPolygons([v.co for v in evaluated.vertices],[p.vertices[:] for p in evaluated.polygons],all_triangles=False)
    width=outline_weight(model,ob)
    area=max((f.calc_area() for f in bm.faces),default=0)
    threshold=math.radians(cfg['angle'])
    edges=[]
    for e in bm.edges:
        faces=list(e.link_faces)
        if not faces:continue
        boundary=len(faces)==1
        slot=ob.get('slot')
        if slot is None and ob.data.materials:
            name=ob.data.materials[faces[0].material_index].name
            slot='T' if 'solar gold' in name else 'S' if 'cobalt enamel' in name else 'P'
        paint=len({f.material_index for f in faces})>1 or (width==0 and slot in ('S','T'))
        angle=faces[0].normal.angle(faces[1].normal,0) if len(faces)==2 else math.pi
        rim=width==0 and any(f.calc_area()>=area*.45 for f in faces)
        if not (boundary or paint or (angle>=threshold and (width>0 or rim))):continue
        if e.calc_length()<cfg['min_length']*(1.8 if level else 1):continue
        if level and not (paint or rim or boundary or angle>=math.radians(65)):continue
        avg=sum((f.normal for f in faces),Vector()).normalized()
        a,b=[v.co-avg*bevel/3 for v in e.verts]
        # Near the three-way corner the bevel runs off; nearest-surface sampling
        # keeps endpoints on the evaluated LOD rather than above/below a chamfer.
        pts=[]
        for p in (a,b):
            hit=bvh.find_nearest(p)
            pts.append(transform@(hit[0] if hit and hit[0] is not None else p))
        if (pts[0]-pts[1]).length<.025:continue
        kind=1 if paint else 2 if rim or boundary else 0
        edges.append((tuple(pts[0]),tuple(pts[1]),kind))
    bm.free()
    # Overrides are in the same joint-local Blender coordinates as source data.
    for a,b,kind in cfg.get('add',[]):edges.append((tuple(a),tuple(b),kind))
    removed={tuple(sorted((tuple(a),tuple(b)))) for a,b in cfg.get('remove',[])}
    return [e for e in edges if tuple(sorted((tuple(round(v,5) for v in e[0]),tuple(round(v,5) for v in e[1])))) not in removed]

def export_lines(scene,root,groups,material):
    meshes=[];count=0
    for joint,segments in sorted(groups.items()):
        seen=set();vs=[];kinds=[]
        for a,b,kind in segments:
            key=tuple(sorted((tuple(round(v,5) for v in a),tuple(round(v,5) for v in b))))
            if key in seen:continue
            seen.add(key);vs.extend([a,b]);kinds.extend([kind,kind])
        if not vs:continue
        me=bpy.data.meshes.new(joint+'/LINES')
        me.from_pydata(vs,[(i,i+1) for i in range(0,len(vs),2)],[]);me.update()
        attr=me.attributes.new('_LINE_KIND','FLOAT','POINT')
        for item,value in zip(attr.data,kinds):item.value=value
        # Also store per-edge categories in extras: Blender omits arbitrary
        # attributes on loose edges in some exporter versions.
        ob=bpy.data.objects.new(joint+'/LINES',me);scene.collection.objects.link(ob)
        ob.parent=root;ob['joint']=joint;ob['ink_lines']=1;ob['line_kinds']=kinds[::2]
        me.materials.append(material);meshes.append(me);count+=len(vs)//2
    return meshes,count

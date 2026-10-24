"""Phase 4: repeatable Titan LOD exports from the approved Phase 3 production.

  blender --background --python-exit-code 1 --python art/blender/titan/build_lods.py

Never writes titan.glb, titan-top.json, production .blend or FIT inputs.
Retains object names, rigid part tags and material boundaries. Every coarser
surface is clipped again against the exact current road/sky swept boxes.
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
ASSETS=ROOT/'src/client/render/titan/assets'
SOURCE=HERE/'titan-production.blend'
MATERIALS=['armour','red','slate','gold','frame','verdigris','visor','jewel','blade','edge']
APPROVED_FINE='01d05dca1f842bdb47860a3515d928bca09d9c3c0327ab712f19c326c9cde32a'
sys.path.insert(0,str(HERE))
from wreck_clearance import clip_objects


def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def tris(obj):obj.data.calc_loop_triangles();return len(obj.data.loop_triangles)
def bounds(objects):
    vs=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    return {'min':[min(v[k] for v in vs) for k in range(3)],'max':[max(v[k] for v in vs) for k in range(3)]}
def by_part(objects):
    out={}
    for o in objects:out.setdefault(o['part'],[]).append(o)
    return out


def planar(obj):
    # Remove the dense fit's almost-coplanar subdivisions while preserving
    # outer boundaries and every armour/red/gold/frame material boundary.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=bm.verts[:],dist=0.00001)
    bmesh.ops.dissolve_limit(bm,angle_limit=math.radians(.15),use_dissolve_boundaries=False,
                            verts=bm.verts[:],edges=bm.edges[:],delimit={'MATERIAL'})
    bmesh.ops.triangulate(bm,faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(obj.data);bm.free()
    obj.data.update()


def ratio_for(obj):
    name=obj.name;part=obj['part']
    # Multi-material meshes are deliberately exempt from collapse. Blender's
    # collapse modifier can move a red-band/armour border even when planar
    # dissolve respects it. These meshes are only 9k triangles after dissolve.
    used={p.material_index for p in obj.data.polygons}
    if len(used)>1:return 1.,'material boundaries retained; planar only'
    if name.startswith('titan/chest/hull-'):
        return 1.,'Hull walls, roofs and gallery outlines retained without collapse'
    if name in {
        'titan/chest/hull-gallery-sill', 'titan/chest/hull-gallery-inner-frame',
        'titan/chest/breach-header', 'titan/forearm.L/forearm-core',
        'titan/chest/sand-drift-south-exit', 'titan/chest/sand-drift-north-wound',
        'titan/thigh.L/thigh-armour', 'titan/thigh.R/thigh-armour',
        'titan/forearm.R/outer-gold-rail', 'titan/neck/forward-neck-core',
        'titan/shoulder.L/pauldron-hub', 'titan/shoulder.R/pauldron-hub',
        'titan/chest/breastplate-L-3', 'titan/pelvis/front-central-tasset',
        'titan/forearm.L/elbow-outer-bezel',
    }:
        return 1.,'thin opening/support or primary low-poly silhouette retained'
    if tris(obj)<80:return 1.,'small closed feature retained'
    if part=='sword':return 1.,'blade, guard and grip silhouette retained'
    if '/knuckle' in name:return .08,'round finger joint reduced; gold joint retained'
    if any(k in name for k in ('gimbal','pivot','mount-bearing','actuator')):
        return .14,'curved mechanical joint reduced'
    if 'groove-bed' in name:return .05,'recessed fit bed reduced'
    if part=='halo':return .65,'halo aperture and circular silhouette protected'
    if 'horn-' in name:return .50,'horn curvature reduced; pointed ends retained'
    if part=='head':return .45,'head silhouette given additional budget'
    if any(k in name for k in ('chamber-rib','chamber-edge-trim','chamber-longitudinal','snapped-')):
        return .45,'rib/opening outline given additional budget'
    if any(k in name for k in ('conduit','cable','sand-drift','wound-debris')):
        return .35,'small damage reduced to coarse shape'
    if 'rim' in name:return .35,'gold rim curvature reduced'
    return .15,'secondary facets and dense fit subdivisions reduced'


def collapse(obj,ratio):
    if ratio>=1:return
    bpy.context.view_layer.objects.active=obj
    modifier=obj.modifiers.new('Phase4 distance simplification','DECIMATE')
    modifier.decimate_type='COLLAPSE';modifier.ratio=ratio
    modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def cleanup(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=bm.faces[:])
    bad=[f for f in bm.faces if f.calc_area()<1e-8]
    if bad:bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY')
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(obj.data);bm.free()
    obj.data.validate(verbose=False);obj.data.update()
    for p in obj.data.polygons:p.use_smooth=False
    for e in obj.data.edges:e.use_edge_sharp=True


def snapshot(objects):
    result={}
    for o in objects:
        vertices=[o.matrix_world@v.co for v in o.data.vertices]
        o.data.calc_loop_triangles()
        tree=BVHTree.FromPolygons(vertices,[tuple(t.vertices) for t in o.data.loop_triangles],all_triangles=True)
        result[o.name]={'tree':tree,'triangles':len(o.data.loop_triangles),'bounds':bounds([o]),
                        'vertices':vertices,'part':o['part']}
    return result


def deviation(obj,source):
    # A sampled surface-distance audit is a visual review aid, not a clearance
    # proof. The strict road checker and game tests independently check faces.
    obj.data.calc_loop_triangles()
    vs=[obj.matrix_world@v.co for v in obj.data.vertices]
    tree=BVHTree.FromPolygons(vs,[tuple(t.vertices) for t in obj.data.loop_triangles],all_triangles=True)
    source_vs=source['vertices'];s=source['tree']
    a=[tree.find_nearest(v)[3] for v in source_vs[::max(1,len(source_vs)//200)]]
    b=[s.find_nearest(v)[3] for v in vs[::max(1,len(vs)//200)]]
    return {'source_to_lod_sample_max_m':max(x for x in a if x is not None),
            'lod_to_source_sample_max_m':max(x for x in b if x is not None)}


def build(level,budget):
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    titan=bpy.data.collections['TITAN']
    objects=sorted([o for o in titan.all_objects if o.type=='MESH'],key=lambda o:o.name)
    original=snapshot(objects)
    source_parts=set(by_part(objects))
    original_bounds={p:bounds(os) for p,os in by_part(objects).items()}
    rows=[]
    for obj in objects:
        assert obj.name.startswith('titan/'+obj['part']+'/') and obj['part']==obj['titan_part']
        # Older source objects use a subset or different order of the ten
        # named slots. Normalize the copy's full slot table, remapping faces
        # by name so all painted colour blocks stay exactly the same.
        face_materials=[obj.data.materials[p.material_index].name for p in obj.data.polygons]
        assert all(name in MATERIALS for name in face_materials)
        obj.data.materials.clear()
        for name in MATERIALS:obj.data.materials.append(bpy.data.materials[name])
        for polygon,name in zip(obj.data.polygons,face_materials):polygon.material_index=MATERIALS.index(name)
        assert [m.name for m in obj.data.materials]==MATERIALS
        planar(obj)
        ratio,reason=(1.,'material-delimited nearly planar dissolve') if level==1 else ratio_for(obj)
        collapse(obj,ratio);cleanup(obj)
        obj['lod']=level
        rows.append({'object':obj.name,'part':obj['part'],'source_triangles':original[obj.name]['triangles'],
                     'planar_or_collapsed_triangles':tris(obj),'collapse_ratio':ratio,'decision':reason})
    # Simplification may bridge an old cut or bulge toward a lane. Subtract the
    # complete road box union from every actual triangle, with the inherited
    # three narrowly scoped sky permissions only; never simplify after this.
    clipping=clip_objects(objects,HERE/'fit/road.json',margin=1.0)
    for obj in objects:cleanup(obj)
    empty=[o for o in objects if not len(o.data.polygons)]
    if empty:raise RuntimeError('LOD removed objects unexpectedly: '+', '.join(o.name for o in empty))
    parts=by_part(objects);assert set(parts)==source_parts
    counts={p:sum(tris(o) for o in os) for p,os in sorted(parts.items())}
    total=sum(counts.values())
    print('LOD_TOTAL',level,total,flush=True)
    print('LOD_PART_COUNTS',level,json.dumps(counts,sort_keys=True),flush=True)
    if total>budget:raise RuntimeError(f'LOD{level} is {total} triangles; budget {budget}')
    for row,obj in zip(rows,objects):
        row['final_triangles']=tris(obj);row['surface_deviation']=deviation(obj,original[obj.name])
    part_bounds={}
    for p,os in sorted(parts.items()):
        new=bounds(os);old=original_bounds[p]
        radius=Vector([old['max'][i]-old['min'][i] for i in range(3)]).length/2
        part_bounds[p]={'fine':old,'lod':new,'max_extents_change_m':max(abs(new[k][i]-old[k][i]) for k in ('min','max') for i in range(3)),
                        'fine_radius_m':radius,'switch_distance_m':1.5*radius+400 if level==1 else 4*radius+1200}
    for obj in bpy.context.scene.objects:obj.select_set(False)
    for obj in objects:obj.hide_set(False);obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    output=ASSETS/f'titan-lod{level}.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,
        export_apply=True,export_normals=True,export_texcoords=False,export_animations=False,export_skins=False,
        export_extras=True,export_cameras=False,export_lights=False)
    return {'level':level,'triangles':total,'budget':budget,'objects':len(objects),'parts':sorted(parts),
            'triangles_by_part':counts,'bounds_by_part':part_bounds,'objects_audit':rows,
            'clipping':clipping,'export_sha256':sha(output)}


def main():
    assert bpy.app.version[:2]==(5,2)
    fine=ASSETS/'titan.glb';top=ASSETS/'titan-top.json'
    assert sha(fine)==APPROVED_FINE,'Phase3 finest changed; review before rebuilding LODs'
    immutable={str(p.relative_to(ROOT)):sha(p) for p in [SOURCE,fine,top]+sorted((HERE/'fit').iterdir()) if p.is_file()}
    levels=[build(1,150000),build(2,40000)]
    for name,digest in immutable.items():assert sha(ROOT/name)==digest,'Unexpected input change: '+name
    report={'phase':4,'blender':bpy.app.version_string,'source':'titan-production.blend',
            'immutable_inputs_sha256':immutable,'finest_triangles':196114,'finest_unchanged':True,
            'policy':'All 386 object names retained. Material boundaries preserved. No object/part deletion. Exact road/sky clipping after simplification.',
            'levels':levels}
    (HERE/'phase4-lod-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('PHASE4_LODS_READY',[(r['level'],r['triangles']) for r in levels],flush=True)

if __name__=='__main__':main()

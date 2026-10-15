"""Render the four matched comparison views from sunhawk-comparison.blend."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

out=Path('/Users/alexanderkelley/Projects/igpx/art/blender/sunhawk')
s=bpy.context.scene
label=next(o for o in s.objects if o.name.startswith('Studio / View label'))
s.render.resolution_percentage=100
views=[(1,'front','FRONT'),(10,'three-quarter','THREE-QUARTER'),(31,'side','SIDE'),(61,'rear','REAR')]
rendered=[]
for frame,slug,title in views:
    s.frame_set(frame)
    label.data.body=title+' / SAME SCALE + CEL PALETTE'
    s.render.filepath=str(out/'previews'/('sunhawk-'+slug+'.png'))
    bpy.ops.render.render(write_still=True)
    rendered.append(s.render.filepath)

# Measure at the neutral front orientation; these are base meshes without ink shells.
s.frame_set(1)
bpy.context.view_layer.update()
models=[]
for prefix in ('A / ','B / '):
    meshes=[ob for ob in s.objects if ob.name.startswith(prefix) and ob.type=='MESH']
    coords=[ob.matrix_world@v.co for ob in meshes for v in ob.data.vertices]
    assert all(math.isfinite(c) for v in coords for c in v)
    lo=[min(v[i] for v in coords) for i in range(3)]
    hi=[max(v[i] for v in coords) for i in range(3)]
    assert all(ob.parent is not None for ob in meshes)
    models.append({'version':'current' if prefix.startswith('A') else 'updated',
        'mesh_objects':len(meshes),'vertices':sum(len(o.data.vertices) for o in meshes),
        'base_triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),
        'dimensions_m':[round(hi[i]-lo[i],3) for i in range(3)],
        'rigid_joint_pivots':sum(1 for o in s.objects if o.name.startswith(prefix) and o.get('rigid_part_pivot'))})

s.frame_set(10)
label.data.body='THREE-QUARTER / SAME SCALE + CEL PALETTE'
s.render.filepath=str(out/'previews'/'sunhawk-three-quarter.png')
report={'models':models,'renders':rendered,'render_size':[s.render.resolution_x,s.render.resolution_y],
    'reference_images_packed':all(im.packed_file is not None for im in bpy.data.images if im.name in ('current-design.png','updated-design.png')),
    'source':'Independent modeling from two painted sheets; no game meshes imported.',
    'status':'First art-model comparison. Runtime materials, UVs/LODs and animation clearance are not finalized.'}
(out/'comparison-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'sunhawk-comparison.blend'),check_existing=False)
result=report

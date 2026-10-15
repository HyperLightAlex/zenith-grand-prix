"""Add conforming UV detail surfaces only to the approved updated model."""
import bpy
from pathlib import Path

scene=bpy.context.scene
assert scene.get('sunhawk_production')
root=Path(bpy.data.filepath).resolve().parents[3]
path=root/'src/client/render/mech/assets/sunhawk-details.png'
image=bpy.data.images.load(str(path),check_existing=True)
image.pack()
mat=bpy.data.materials.get('Sunhawk / authored detail') or bpy.data.materials.new('Sunhawk / authored detail')
mat.use_nodes=True
nodes=mat.node_tree.nodes; nodes.clear()
tex=nodes.new('ShaderNodeTexImage'); tex.image=image
bsdf=nodes.new('ShaderNodeBsdfPrincipled'); bsdf.inputs['Roughness'].default_value=.85
output=nodes.new('ShaderNodeOutputMaterial')
mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
mat.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
mat.node_tree.links.new(bsdf.outputs[0],output.inputs[0])
targets={'Cuirass porcelain face':0,'Forearm sculpted gauntlet':1,'Shin aerodynamic shell':2,'Thigh porcelain shell':3}
created=[]
for ob in list(scene.objects):
    if ob.type!='MESH' or not ob.name.startswith('B / '): continue
    tile=next((t for name,t in targets.items() if ob.name.startswith('B / '+name)),None)
    if tile is None: continue
    name='B / UV details / '+ob.name[4:]
    if bpy.data.objects.get(name): continue
    base=ob.data
    xmin=min(v.co.x for v in base.vertices); xmax=max(v.co.x for v in base.vertices)
    zmin=min(v.co.z for v in base.vertices); zmax=max(v.co.z for v in base.vertices)
    vs=[]; faces=[]; uvs=[]
    for face in base.polygons:
        if face.normal.y>-.55: continue
        inds=[]
        for vi in face.vertices:
            v=base.vertices[vi].co
            inds.append(len(vs)); vs.append(tuple(v+face.normal*.009))
            # Image rows start at the top; glTF/Blender UVs at the bottom.
            u=(v.x-xmin)/max(.001,xmax-xmin)
            vv=(v.z-zmin)/max(.001,zmax-zmin)
            uvs.append(((tile%2+u)/2,(1-tile//2+vv)/2))
        faces.append(inds)
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],faces); mesh.update()
    uv=mesh.uv_layers.new(name='SunhawkDetailAtlas')
    for loop in mesh.loops: uv.data[loop.index].uv=uvs[loop.vertex_index]
    detail=bpy.data.objects.new(name,mesh); ob.users_collection[0].objects.link(detail)
    detail.parent=ob.parent; detail.matrix_basis=ob.matrix_basis.copy()
    detail['surface_detail']=True; detail['surface_role']='detail'
    mesh.materials.append(mat); created.append(name)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
result={'detail_surfaces':created,'atlas':str(path),'uv_tiles':4}

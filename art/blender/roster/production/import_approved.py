"""One-time capture of an approved roster into independent production sources.
Releases thereafter rebuild with export.py, without the experiment directory.
"""
import bpy
from pathlib import Path
import argparse, copy, hashlib, json, sys
import numpy as np
from mathutils import Euler, Matrix
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import export as E
from asset_io import read,expanded,sha
G2B=E.B2G.T
COLORS={'P':(.72,.75,.80),'S':(.1,.24,.40),'T':(.8,.48,.08),'F':(.035,.05,.07),'K':(.1,.13,.18),'D':(.015,.02,.025),'C':(.15,.75,.65),'G':(.3,1,.8)}

def text(name,value):
 block=bpy.data.texts.new(name);block.write(json.dumps(value,separators=(',',':')))

def point_attribute(mesh,name,values):
 values=np.asarray(values,dtype=np.float32);size=values.shape[1]
 attr=mesh.attributes.new(name,'FLOAT_VECTOR'if size==3 else'FLOAT','POINT')
 attr.data.foreach_set('vector'if size==3 else'value',values.ravel())

def capture(id,source_root):
 folder=source_root/id;source_manifest=json.loads((folder/'manifest.json').read_text());bpy.ops.wm.read_factory_settings(use_empty=True)
 materials={}
 for slot,color in COLORS.items():
  mat=bpy.data.materials.new('Paint '+slot);mat.diffuse_color=(*color,1);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=1;materials[slot]=mat
 approved=[]
 for level in range(3):
  path=folder/('model'+(f'-lod{level}'if level else'')+'.glb');doc,blob=read(path);root=next(n for n in doc['nodes']if n.get('extras',{}).get('roster_schema'));meta=root['extras']
  text(f'GLB_HEADER_LOD{level}',{'asset':doc['asset'],'root':{k:v for k,v in root.items()if k!='children'}})
  collection=bpy.data.collections.new(f'LOD{level}');bpy.context.scene.collection.children.link(collection)
  rigs=bpy.data.collections.new(f'LOD{level} joints');collection.children.link(rigs);joints={};fits=json.loads(meta['fittings_json'])['joints']
  for joint,fit in fits.items():
   obj=bpy.data.objects.new(f'LOD{level} / JNT / {joint}',None);obj['joint']=joint;obj.empty_display_type='PLAIN_AXES';obj.empty_display_size=.1;rigs.objects.link(obj);joints[joint]=obj
  for joint,fit in fits.items():
   obj=joints[joint];obj.parent=joints.get(fit.get('joint'));obj.location=G2B@np.array(fit['position']);obj.hide_render=True
   if fit.get('rotation') and any(fit['rotation']):
    obj.rotation_mode='QUATERNION';obj.rotation_quaternion=(Matrix(G2B)@Euler(fit['rotation'],'XYZ').to_matrix()@Matrix(E.B2G)).to_quaternion()
  number=0
  for node in doc['nodes']:
   if'mesh'not in node:continue
   for primitive in doc['meshes'][node['mesh']]['primitives']:
    attrs,_=expanded(doc,blob,primitive);mode=primitive.get('mode',4);position=attrs['POSITION'];vertices=position@G2B.T;step=3 if mode==4 else 2;groups=np.arange(len(vertices)).reshape(-1,step).tolist()
    mesh=bpy.data.meshes.new(node['name']);mesh.from_pydata(vertices.tolist(),groups if mode==1 else[],groups if mode==4 else[]);mesh.update()
    obj=bpy.data.objects.new(f'LOD{level} / '+node['name'],mesh);collection.objects.link(obj);obj.parent=joints[node['extras']['joint']]
    obj['glb_name']=node['name'];obj['glb_order']=number;number+=1;obj['glb_mode']=mode;obj['glb_extras_json']=json.dumps(node['extras'],separators=(',',':'));obj['glb_attributes_json']=json.dumps(list(attrs))
    for key in ['joint','part','slot','insignia','ink_lines']:
     if key in node['extras']:obj[key]=node['extras'][key]
    obj['source_pieces_json']=json.dumps(node['extras'].get('source_pieces',[]));obj.data.materials.append(materials[node['extras']['slot']])
    for name,values in attrs.items():
     point_attribute(mesh,'export_'+name,values)
    if mode==4:
     for poly in mesh.polygons:poly.use_smooth=True
     mesh.normals_split_custom_set_from_vertices((attrs['NORMAL']@G2B.T).tolist())
    else:obj.hide_render=True
  collection.hide_viewport=level!=0;collection.hide_render=level!=0
  approved.append({'level':level,'source_file':path.name,'sha256':sha(path),'triangles':source_manifest['lods'][level]['triangles']})
 manifest={'model':id,'production_schema':1,'source':'Accepted selective roster hybrid; final exported surfaces captured as standalone editable Blender authoring data.','accepted_source_branch':'alexander/kamaitachi-conversion','original_main_commit':source_manifest.get('main_commit'),'blender_source_version':bpy.app.version_string,'dims':source_manifest['dims'],'joints':source_manifest['joints'],'source_blend':f'art/blender/roster/production/sources/{id}.blend','approved_exports':approved,'thrusters':source_manifest.get('thrusters',[]),'insignias':source_manifest.get('insignias',[]),'source_manifest_sha256':sha(folder/'manifest.json'),'source_authoring_blend_sha256':sha(folder/(id+'-hybrid.blend')),'limitations':source_manifest.get('limitations',[])}
 text('PRODUCTION_MANIFEST',manifest);text('README',{'editing':'LOD0 is visible. LOD1 and LOD2 are separate hidden collections. Mesh coordinates are Blender axes; export_NORMAL and export__OUTLINE_NORMAL are exact game-axis float data, export__INK_WIDTH and export__LINE_KIND preserve the anime pipeline. Body/part ownership and root metadata are authoritative. Exporter applies local object transforms to armor and ink; transform them together. No experimental model dependency remains.'})
 bpy.context.scene['production_schema']=1;bpy.context.scene['model']=id;bpy.context.scene['accepted_geometry_only']=True;bpy.context.scene.unit_settings.system='METRIC';bpy.context.preferences.filepaths.save_version=0
 dest=E.source_path(id);dest.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(dest),compress=True)
 (HERE/'manifests').mkdir(exist_ok=True);manifest['source_blend_sha256']=sha(dest);(HERE/'manifests'/f'{id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print('CAPTURED',id,flush=True)

def main():
 p=argparse.ArgumentParser();p.add_argument('--input-root',required=True,type=Path);p.add_argument('--design',choices=E.IDS);args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
 for id in E.IDS:
  if args.design is None or id==args.design:capture(id,args.input_root)
if __name__=='__main__':main()

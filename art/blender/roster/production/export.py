"""Export the accepted roster from its self-contained Blender sources.
Run Blender 5.2.2: --background --factory-startup --python export.py -- --all
No experiment, old donor model, texture, or external source directory is read.
"""
import bpy
from pathlib import Path
import argparse, collections, copy, hashlib, json, sys
import numpy as np
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
sys.path.insert(0,str(HERE))
from asset_io import read, write, expanded, add_mesh, sha
IDS=['sunhawk','daystar','rampart','razor','stinger','maul','anubis','horus','sobek','seraph','longbow','paladin','kamaitachi','fujin','raijin']
PARTS={'head','chest','waist','hips','shoulders','armL','armR','thighs','shins','feet','backpack'}
B2G=np.array([[1.,0,0],[0,0,1],[0,-1,0]])

def runtime_path(id,level):
 suffix=''if level==0 else f'-lod{level}'
 return ROOT/'src/client/render/mech/assets'/('sunhawk-updated'+suffix+'.glb'if id=='sunhawk'else'roster/'+id+suffix+'.glb')

def source_path(id):return HERE/'sources'/f'{id}.blend'
def payload(data):return json.loads(bpy.data.texts[data].as_string())
def array_attribute(mesh,name):
 attr=mesh.attributes.get(name)
 if attr is None:raise ValueError(f'Missing exact authored attribute {name} on {mesh.name}')
 size=3 if attr.data_type=='FLOAT_VECTOR'else 1
 data=np.empty(len(mesh.vertices)*size,dtype=np.float32)
 attr.data.foreach_get('vector'if size==3 else'value',data)
 return data.reshape(-1,size)

def object_attributes(obj):
 mesh=obj.data;mode=int(obj['glb_mode']);order=json.loads(obj['glb_attributes_json']);count=len(mesh.vertices)
 # Do not silently ignore topology edits. This format is deliberately expanded:
 # each triangle owns its 3 vertices; each ink segment owns its 2 endpoints.
 expected=np.arange(count,dtype=np.int32)
 if mode==4:
  if len(mesh.polygons)*3!=count or any(len(p.vertices)!=3 for p in mesh.polygons):raise ValueError(f'Triangulate/re-expand edited topology on {obj.name}')
  actual=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',actual)
 elif mode==1:
  actual=np.empty(len(mesh.edges)*2,dtype=np.int32);mesh.edges.foreach_get('vertices',actual)
 else:raise ValueError(f'Unsupported primitive mode {mode}')
 if not np.array_equal(actual,expected):raise ValueError(f'Expanded primitive order changed on {obj.name}; re-author the explicit export streams')
 positions=np.empty(count*3,dtype=np.float32);mesh.vertices.foreach_get('co',positions);positions=positions.reshape(-1,3);positions=np.column_stack((positions[:,0],positions[:,2],-positions[:,1]));original=array_attribute(mesh,'export_POSITION');positions=np.where(positions==original,original,positions)
 matrix=np.array(obj.matrix_basis,dtype=float);rotation=B2G@matrix[:3,:3]@B2G.T;offset=B2G@matrix[:3,3]
 transformed=not np.array_equal(matrix,np.eye(4))
 if transformed:positions=positions@rotation.T+offset
 attrs={}
 for name in order:
  values=positions if name=='POSITION'else array_attribute(mesh,'export_'+name)
  if transformed and name in ['NORMAL','_OUTLINE_NORMAL']:
   values=values@np.linalg.inv(rotation);values/=np.maximum(np.linalg.norm(values,axis=1,keepdims=True),1e-12)
  attrs[name]=np.asarray(values,dtype='<f4')
 if transformed and np.linalg.det(rotation)<0:
  step=3 if mode==4 else 2
  attrs={k:a.reshape(-1,step,a.shape[1])[:,::-1].reshape(a.shape)for k,a in attrs.items()}
 if not all(np.isfinite(a).all()for a in attrs.values()):raise ValueError(f'Nonfinite authored attributes on {obj.name}')
 for key in ['NORMAL','_OUTLINE_NORMAL']:
  if key in attrs and np.max(abs(np.linalg.norm(attrs[key],axis=1)-1))>.002:raise ValueError(f'Invalid {key} on {obj.name}')
 return attrs

def export_level(id,level,path):
 header=payload(f'GLB_HEADER_LOD{level}');root=copy.deepcopy(header['root']);root['children']=[]
 doc={'asset':header['asset'],'scene':0,'scenes':[{'nodes':[0]}],'nodes':[root],'meshes':[],'accessors':[],'bufferViews':[],'buffers':[{}]};blob=bytearray();counts=collections.Counter();groups=[];parts=set()
 objects=sorted((o for o in bpy.data.collections[f'LOD{level}'].all_objects if o.type=='MESH'),key=lambda o:int(o['glb_order']))
 for obj in objects:
  extra=json.loads(obj['glb_extras_json'])
  for key in ['joint','part','slot','insignia','ink_lines']:
   if key in obj:extra[key]=obj[key]
  mode=int(obj['glb_mode']);attrs=object_attributes(obj);name=str(obj['glb_name']);parts.add(extra['part'])
  add_mesh(doc,blob,root,name,extra,attrs,mode)
  number=len(attrs['POSITION'])//(3 if mode==4 else 2)
  if mode==4:counts[extra['part']]+=number
  groups.append({'name':name,'joint':extra['joint'],'part':extra['part'],'slot':extra['slot'],'mode':mode,'count':number})
 if parts!=PARTS:raise ValueError((id,level,'Expected all eleven parts',parts))
 path.parent.mkdir(parents=True,exist_ok=True);write(path,doc,blob)
 return {'level':level,'file':str(path.relative_to(ROOT))if path.is_relative_to(ROOT)else str(path),'sha256':sha(path),'triangles':sum(counts.values()),'by_part':dict(counts),'groups':groups}

def signatures(path):
 doc,blob=read(path);root=next(n for n in doc['nodes']if n.get('extras',{}).get('roster_schema'));groups=[]
 for node in doc['nodes']:
  if'mesh'not in node:continue
  for prim in doc['meshes'][node['mesh']]['primitives']:
   attrs,_=expanded(doc,blob,prim);h=hashlib.sha256()
   for key in sorted(attrs):h.update(key.encode()+np.asarray(attrs[key],dtype='<f4').tobytes())
   groups.append({'name':node['name'],'extras':node['extras'],'mode':prim.get('mode',4),'attributes':sorted(attrs),'stream_sha256':h.hexdigest()})
 return {'root':root['extras'],'groups':groups}

def run(id,output_root=None,check=False):
 bpy.ops.wm.open_mainfile(filepath=str(source_path(id)))
 records=[]
 for level in range(3):
  target=runtime_path(id,level)
  if output_root is not None:target=output_root/target.relative_to(ROOT)
  if check and output_root is None:raise ValueError('--check requires --output-root (never overwrite before comparison)')
  rec=export_level(id,level,target)
  if check:
   reference=runtime_path(id,level)
   if signatures(reference)!=signatures(target):raise ValueError((id,level,'Expanded geometry/ink or metadata changed'))
   rec['expanded_streams_and_metadata_exact']=True;rec['bytes_exact']=reference.read_bytes()==target.read_bytes()
  records.append(rec)
 if output_root is None:
  manifest=payload('PRODUCTION_MANIFEST');manifest['lods']=records;manifest['source_blend_sha256']=sha(source_path(id));manifest['blender_export_version']=bpy.app.version_string
  (HERE/'manifests'/f'{id}.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(id,json.dumps([{'level':r['level'],'triangles':r['triangles'],'sha256':r['sha256'],'bytes_exact':r.get('bytes_exact')}for r in records]),flush=True)
 return records

def main():
 p=argparse.ArgumentParser();p.add_argument('--all',action='store_true');p.add_argument('--design',choices=IDS);p.add_argument('--output-root',type=Path);p.add_argument('--check',action='store_true');p.add_argument('--report',type=Path)
 args=p.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
 if not args.all and not args.design:p.error('Choose --all or --design')
 results={id:run(id,args.output_root,args.check)for id in IDS if args.all or id==args.design}
 if args.report:args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(results,indent=2)+'\n')
if __name__=='__main__':main()

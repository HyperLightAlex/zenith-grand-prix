"""Deterministic GLB transport for the accepted production roster."""
from pathlib import Path
import copy, json, struct, hashlib
import numpy as np

SIZE={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
DT={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1',5122:'<i2',5120:'i1'}
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):
 raw=Path(path).read_bytes();assert raw[:4]==b'glTF'
 size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);offset=20+size
 n,kind=struct.unpack_from('<II',raw,offset);assert kind==0x004e4942
 return doc,bytearray(raw[offset+8:offset+8+n])
def write(path,doc,blob):
 doc['buffers'][0]['byteLength']=len(blob)
 j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
 b=bytes(blob)+b'\0'*((-len(blob))%4)
 Path(path).write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b)
def array(doc,blob,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dim=SIZE[a['type']];dtype=np.dtype(DT[a['componentType']]);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
 stride=v.get('byteStride',dim*dtype.itemsize)
 return np.ndarray((a['count'],dim),dtype=dtype,buffer=blob,offset=offset,strides=(stride,dtype.itemsize)).copy()
def expanded(doc,blob,primitive):
 attrs={key:array(doc,blob,i) for key,i in primitive['attributes'].items()}
 indices=array(doc,blob,primitive['indices']).ravel() if 'indices' in primitive else np.arange(len(attrs['POSITION']))
 return {key:a[indices] for key,a in attrs.items()},indices

def acc(doc,blob,values,size,integer=False):
 a=np.asarray(values,dtype='<u4' if integer else '<f4').reshape(-1,size)
 assert len(a) and np.isfinite(a).all()
 blob+=b'\0'*((-len(blob))%4);offset=len(blob);blob+=a.tobytes()
 vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes,'target':34963 if integer else 34962})
 v={'bufferView':vi,'byteOffset':0,'componentType':5125 if integer else 5126,'count':len(a),'type':{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[size]}
 if size==3:v.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
 index=len(doc['accessors']);doc['accessors'].append(v);return index

def add_mesh(doc,blob,root,name,extra,attrs,mode=4):
 count=len(np.asarray(attrs['POSITION']).reshape(-1,3));assert count%(3 if mode==4 else 2)==0
 sizes={'POSITION':3,'NORMAL':3,'_OUTLINE_NORMAL':3,'_INK_WIDTH':1,'_LINE_KIND':1,'TEXCOORD_0':2}
 attributes={k:acc(doc,blob,a,sizes[k]) for k,a in attrs.items()}
 assert all(doc['accessors'][i]['count']==count for i in attributes.values())
 mi=len(doc['meshes']);doc['meshes'].append({'name':name,'primitives':[{'attributes':attributes,'indices':acc(doc,blob,np.arange(count),1,True),'mode':mode}]})
 ni=len(doc['nodes']);doc['nodes'].append({'name':name,'mesh':mi,'extras':copy.deepcopy(extra)})
 root.setdefault('children',[]).append(ni)
 return ni

def rx(a):
 c,s=np.cos(a),np.sin(a);return np.array([[1.,0,0],[0,c,-s],[0,s,c]])

def ray_rear(triangles,x,y):
 """Lowest Z hit for a ray through XY; accepts projected nondegenerate triangles."""
 p=np.asarray(triangles).reshape(-1,3,3);a=p[:,0,:2];u=p[:,1,:2]-a;v=p[:,2,:2]-a;d=np.array([x,y])-a
 det=u[:,0]*v[:,1]-u[:,1]*v[:,0];good=np.abs(det)>1e-12
 b=np.divide(d[:,0]*v[:,1]-d[:,1]*v[:,0],det,out=np.zeros(len(det)),where=good)
 c=np.divide(u[:,0]*d[:,1]-u[:,1]*d[:,0],det,out=np.zeros(len(det)),where=good)
 hit=good&(b>=-1e-6)&(c>=-1e-6)&(b+c<=1+1e-6)
 z=p[:,0,2]+b*(p[:,1,2]-p[:,0,2])+c*(p[:,2,2]-p[:,0,2])
 return float(z[hit].min()) if hit.any() else None

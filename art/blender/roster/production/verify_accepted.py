"""Audit promotion against a reviewed intake bundle, without copying that bundle.
Run using Blender's Python; --accepted-root is only required for this intake audit.
Normal production rebuilds use export.py --check and the self-contained sources.
"""
import argparse, copy, hashlib, json, sys
from pathlib import Path
import numpy as np
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from asset_io import read, expanded, sha
from export import runtime_path, IDS

def stream_groups(doc,blob):
 result=[]
 for node in doc['nodes']:
  if 'mesh'not in node:continue
  for prim in doc['meshes'][node['mesh']]['primitives']:
   attrs,_=expanded(doc,blob,prim);h=hashlib.sha256()
   for key in sorted(attrs):h.update(key.encode()+np.asarray(attrs[key],dtype='<f4').tobytes())
   result.append({'name':node['name'],'extras':node['extras'],'mode':prim.get('mode',4),'attributes':sorted(attrs),'stream_sha256':h.hexdigest()})
 return result

def audit_anchors(doc,blob):
 root=next(n for n in doc['nodes']if n.get('extras',{}).get('roster_schema'));records=[]
 for anchor in json.loads(root['extras'].get('insignia_json','[]')):
  arrays=[]
  for node in doc['nodes']:
   if 'mesh'not in node or node.get('extras',{}).get('insignia')!=anchor['id']:continue
   for prim in doc['meshes'][node['mesh']]['primitives']:
    if prim.get('mode',4)==4:arrays.append(expanded(doc,blob,prim)[0]['POSITION'])
  points=np.concatenate(arrays).astype(float);center=np.asarray(anchor['center']);normal=np.asarray(anchor['normal']);up=np.asarray(anchor['up']);right=np.cross(up,normal)
  assert abs(np.linalg.norm(normal)-1)<1e-6 and abs(np.linalg.norm(up)-1)<1e-6 and abs(normal@up)<1e-6
  tangent=np.column_stack(((points-center)@right,(points-center)@up));lo=tangent.min(axis=0);hi=tangent.max(axis=0);span=float(max(hi-lo));center_error=float(max(abs((lo+hi)/2)));cover_error=float(max(0,max(abs(lo).max(),abs(hi).max())-anchor['width']/2))
  assert center_error<1e-4 and cover_error<=1e-5 and 0<anchor['width']<span*1.1,(anchor['id'],center_error,cover_error,span,anchor['width'])
  records.append({'id':anchor['id'],'center_error':center_error,'coverage_error':cover_error,'tangent_span':span,'width':anchor['width'],'pass':True})
 return records

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--accepted-root',required=True,type=Path);parser.add_argument('--report',required=True,type=Path)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else sys.argv[1:])
 corrections=json.loads((HERE/'anchor-corrections.json').read_text());provenance=json.loads((HERE/'provenance.json').read_text());expected={x['model']:x for x in provenance['accepted_models']};results={};anchor_checks={}
 for design in IDS:
  levels=[]
  for level in range(3):
   before=args.accepted_root/design/('model'+(f'-lod{level}'if level else '')+'.glb');after=runtime_path(design,level)
   oldhash=sha(before);newhash=sha(after)
   assert oldhash==expected[design]['lods'][level]['sha256'],(design,level,'Unreviewed intake bytes')
   old,oldbin=read(before);new,newbin=read(after)
   og=stream_groups(old,oldbin);ng=stream_groups(new,newbin)
   if level==0:anchor_checks[design]=audit_anchors(new,newbin)
   assert og==ng,(design,level,'Changed geometry, ink, groups, or mesh extras')
   assert oldbin==newbin,(design,level,'Changed binary payload')
   allowed=[];normalized=copy.deepcopy(new)
   if design in corrections:
    oldroot=next(n for n in old['nodes']if n.get('extras',{}).get('roster_schema'));newroot=next(n for n in normalized['nodes']if n.get('extras',{}).get('roster_schema'))
    oa=json.loads(oldroot['extras']['insignia_json']);na=json.loads(newroot['extras']['insignia_json'])
    for correction in corrections[design]:
     o=next(a for a in oa if a['id']==correction['id']);n=next(a for a in na if a['id']==correction['id'])
     assert o==correction['before']and n==correction['after'],(design,level,'Unexpected anchor correction')
     for key in ['center','width']:
      if o[key]!=n[key]:allowed.append({'insignia':correction['id'],'field':key,'before':o[key],'after':n[key]})
      n[key]=o[key]
    assert oa==na,(design,level,'Changed other insignia metadata')
    newroot['extras']['insignia_json']=oldroot['extras']['insignia_json']
   assert old==normalized,(design,level,'Changed unapproved metadata')
   levels.append({'level':level,'file':str(after.relative_to(HERE.parents[3])),'accepted_sha256':oldhash,'production_sha256':newhash,'bytes_exact':oldhash==newhash,'expanded_triangle_and_ink_streams_exact':True,'binary_payload_exact':True,'mesh_groups_and_extras_exact':True,'approved_metadata_only_changes':allowed,'groups':len(ng),'stream_sha256':hashlib.sha256(json.dumps(ng,sort_keys=True,separators=(',',':')).encode()).hexdigest()})
  results[design]=levels
 report={'summary':{'designs':len(results),'files':45,'byte_exact':sum(r['bytes_exact']for a in results.values()for r in a),'geometry_and_ink_exact':45,'metadata_only_files':sum(bool(r['approved_metadata_only_changes'])for a in results.values()for r in a)},'designs':results,'insignia_anchor_audit':anchor_checks}
 args.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['summary']),flush=True)
if __name__=='__main__':main()

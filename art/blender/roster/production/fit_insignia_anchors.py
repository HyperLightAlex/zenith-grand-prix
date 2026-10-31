"""Refit the five reviewed replacement-emblem anchors; never move geometry.
Blender: --background --factory-startup --python fit_insignia_anchors.py -- --apply
Targets were audited when the accepted hybrid roster entered production. All other
anchors stay authored. This tool only updates root metadata and its source manifest.
"""
import bpy
import argparse, copy, json, sys
from pathlib import Path
import numpy as np
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from export import source_path, payload, object_attributes
TARGETS={'kamaitachi':{'chest','shoulderL','shoulderR'},'fujin':{'shoulderL','shoulderR'}}

def replace_text(name,value):
 text=bpy.data.texts[name];text.clear();text.write(json.dumps(value,indent=2))

def refit(design,apply=False):
 bpy.ops.wm.open_mainfile(filepath=str(source_path(design)))
 headers=[payload(f'GLB_HEADER_LOD{level}')for level in range(3)]
 original=[json.loads(h['root']['extras']['insignia_json'])for h in headers]
 assert all(a==original[0]for a in original),'Anchors must already match across LODs'
 corrected=copy.deepcopy(original[0]);records=[]
 for anchor in corrected:
  if anchor['id']not in TARGETS[design]:continue
  points=[]
  for obj in bpy.data.collections['LOD0'].all_objects:
   if obj.type!='MESH'or int(obj['glb_mode'])!=4:continue
   if obj.get('insignia')!=anchor['id']:continue
   assert obj['joint']==anchor['joint']and obj['part']==anchor['part']
   points.append(object_attributes(obj)['POSITION'])
  if not points:raise ValueError((design,anchor['id'],'No badge triangles'))
  p=np.concatenate(points).astype(float);normal=np.asarray(anchor['normal'],float);up=np.asarray(anchor['up'],float);right=np.cross(up,normal)
  assert abs(np.linalg.norm(normal)-1)<1e-6 and abs(np.linalg.norm(up)-1)<1e-6 and abs(normal@up)<1e-6
  tangent=np.column_stack((p@right,p@up));lo=tangent.min(axis=0);hi=tangent.max(axis=0);mid=(lo+hi)/2;span=float(max(hi-lo))
  newcenter=right*mid[0]+up*mid[1]+normal*(np.asarray(anchor['center'])@normal)
  before=copy.deepcopy(anchor)
  if np.max(np.abs(newcenter-np.asarray(anchor['center'])))>1e-7:anchor['center']=[round(float(v),9)for v in newcenter]
  anchor['width']=round(span*1.05,9)
  records.append({'id':anchor['id'],'reason':'Replacement emblem must be centered on, and cover, the complete modelled badge. 5% margin on the largest tangent extent.','before':before,'after':copy.deepcopy(anchor),'tangent_bounds':{'min':lo.tolist(),'max':hi.tolist()},'triangle_count':len(p)//3})
 if apply:
  encoded=json.dumps(corrected,separators=(',',':'))
  for level,h in enumerate(headers):h['root']['extras']['insignia_json']=encoded;replace_text(f'GLB_HEADER_LOD{level}',h)
  manifest=payload('PRODUCTION_MANIFEST');manifest['insignias']=corrected;manifest['reviewed_metadata_corrections']=[{'id':r['id'],'reason':r['reason']}for r in records];replace_text('PRODUCTION_MANIFEST',manifest)
  bpy.context.preferences.filepaths.save_version=0
  bpy.ops.wm.save_as_mainfile(filepath=str(source_path(design)),compress=True)
 return records

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');parser.add_argument('--report',type=Path)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
 prior=json.loads(args.report.read_text())if args.report and args.report.exists()else{}
 report={design:refit(design,args.apply)for design in TARGETS}
 for design,records in report.items():
  for record in records:
   previous=next((r for r in prior.get(design,[])if r['id']==record['id']),None)
   if previous:
    assert record['before']==previous['after'],'Source anchor changed since the recorded correction'
    record['before']=previous['before']
 if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2),flush=True)
if __name__=='__main__':main()

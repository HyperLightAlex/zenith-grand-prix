import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHash } from 'node:crypto';
import records from '../src/client/render/mech/assets/roster/prepared-markings.json';
import audit from '../art/blender/roster/production/prepared-markings-audit.json';
import { loadPreparedRosterMarkings } from '../src/client/render/mech/preparedMarkings';
import { stockBuild } from '../src/custom/mechBuild';
import { ROLE } from '../src/sim/config';
import { LIVERIES } from '../src/client/render/palette';
import { buildFrame, designBuilder } from '../src/client/render/mech/frames';
import { buildCustomFrame } from '../src/client/render/mech/customFrame';
import { markingsMaterial } from '../src/client/render/mech/decals';
import { frameCtx } from '../src/client/render/mech/parts';
import { MechRig } from '../src/client/render/mech/rig';
import { rosterAnchors } from '../src/client/render/mech/importedRoster';
import { readRosterAsset, registerRosterAssets, type PreparedRosterMarking, type RosterAsset } from '../src/client/render/mech/rosterAsset';
const here = new URL('.',import.meta.url);
const ids=['daystar','rampart','razor','stinger','maul','anubis','horus','sobek','longbow','paladin','fujin','raijin'];
const current = new Map<string,RosterAsset>();
const hashes = new Map<string,string>();
async function load(path:string,id:string):Promise<RosterAsset> {
  const b=await readFile(new URL(path,here));
  hashes.set(id,createHash('sha256').update(b).digest('hex'));
  return readRosterAsset((await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene,id);
}
function marks(r:MechRig):THREE.Mesh[] { const m:THREE.Mesh[]=[];r.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.preparedMarking)m.push(o);});return m; }
function register(id:string,a:RosterAsset):void { registerRosterAssets(id,[a,a,a]); }
function marker(part:'chest'|'backpack',x:number):PreparedRosterMarking { return {joint:'chest',part,geometry:new THREE.BufferGeometry().copy(new THREE.PlaneGeometry(.4,.3)),position:[x,.2,.5],quaternion:[0,0,0,1],scale:[1,2,1],renderOrder:2}; }
beforeAll(async()=>{
  const ctx=new Proxy({}, {get:(_t,k)=>k==='measureText'?(s:string)=>({width:s.length*12}):()=>undefined});
  const image=()=>({addEventListener(){},removeEventListener(){},src:'',crossOrigin:''});
  vi.stubGlobal('document',{createElement:(tag:string)=>tag==='canvas'?{width:1,height:1,getContext:()=>ctx,toDataURL:()=>'',style:{}}:image(),createElementNS:image});
  await Promise.all(ids.map(async id=>{
    current.set(id,await load(`../src/client/render/mech/assets/roster/${id}.glb`,id));
  }));
},60_000);
afterAll(()=>vi.unstubAllGlobals());
describe('opt-in prepared native markings',()=>{
  for(const id of ids)it(`${id}: ships the approved retained decals on existing owned surfaces`,()=>{
    const a=current.get(id)!, expected=(records.records as Record<string,unknown[]>)[id];
    const evidence=(audit.inputs as Record<string,{approved:string}>)[id];
    const decisions=(audit.decisions as Record<string,Array<{restored:boolean}>>)[id];
    expect(hashes.get(id)).toBe(evidence.approved);
    expect(a.preparedMarkings).toHaveLength(expected.length);
    expect(expected).toHaveLength(decisions.filter(d=>d.restored).length);
    for(const m of a.preparedMarkings??[]){
      expect(a.parts.some(p=>p.joint===m.joint&&p.part===m.part)).toBe(true);
      expect(m.geometry.getAttribute('uv').count).toBe(m.geometry.getAttribute('position').count);
      expect(m.geometry.index?.count).toBe(6);
      expect([...m.position,...m.quaternion,...m.scale].every(Number.isFinite)).toBe(true);
      expect(m.scale.every(s=>s>0)).toBe(true);expect(Math.hypot(...m.quaternion)).toBeCloseTo(1,6);
      for(const attr of Object.values(m.geometry.attributes))expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
      expect(m.renderOrder).toBe(2);
    }
  });
  it('stock native import attaches cloned team markings with their exact transforms and render order',()=>{
    const a=current.get('daystar')!,mark=marker('backpack',.37);let sourceDisposed=0;
    mark.geometry.addEventListener('dispose',()=>sourceDisposed++);
    register('daystar',{...a,preparedMarkings:[mark]});
    const r=buildFrame(ROLE.MF,LIVERIES[0],'2'),attached=marks(r);
    expect(attached).toHaveLength(1);expect(attached[0].parent).toBe(r.joints.chest);
    expect(attached[0].geometry).not.toBe(mark.geometry);expect(attached[0].material).toBe(markingsMaterial(LIVERIES[0],false));
    expect(attached[0].position.toArray()).toEqual(mark.position);expect(attached[0].quaternion.toArray()).toEqual(mark.quaternion);expect(attached[0].scale.toArray()).toEqual(mark.scale);expect(attached[0].renderOrder).toBe(2);expect(attached[0].userData.part).toBe('backpack');
    attached[0].geometry.dispose();expect(sourceDisposed).toBe(0);
    register('daystar',a);
  });
  it('custom donors move only explicitly selected parts and repaint them with the receiver team and paint',()=>{
    const daystar=current.get('daystar')!,stinger=current.get('stinger')!;
    const selected=marker('backpack',.71),excluded=marker('chest',-.71);let disposed=0;
    selected.geometry.addEventListener('dispose',()=>disposed++);excluded.geometry.addEventListener('dispose',()=>disposed++);
    register('daystar',{...daystar,preparedMarkings:[]});register('stinger',{...stinger,preparedMarkings:[selected,excluded]});
    const b=stockBuild(0);b.parts.backpack=1;b.own.backpack={main:3};
    const r=buildCustomFrame(ROLE.MF,LIVERIES[0],b,'2'),m=marks(r);
    const originalJet=stinger.mainThrusters!.find(t=>t.id==='mainL')!,fittedJet=r.flames.find(f=>f.bank==='main'&&f.mesh.position.x>0)!;
    const mountingShift=fittedJet.mesh.position.clone().sub(new THREE.Vector3(...originalJet.outlet));
    expect(m).toHaveLength(1);expect(m[0].position.toArray()).toEqual(new THREE.Vector3(...selected.position).add(mountingShift).toArray());expect(m[0].userData.part).toBe('backpack');expect(m[0].parent).toBe(r.joints.chest);
    expect(m[0].material).toBe(markingsMaterial(LIVERIES[0],true));expect(m[0].material).not.toBe(markingsMaterial(LIVERIES[1],true));expect(disposed).toBe(0);
    register('stinger',stinger);
  });
  it('reapplying native fittings does not accumulate prepared markings or dispose source geometry/shared atlas',()=>{
    const mark=marker('chest',0),a={...current.get('daystar')!,preparedMarkings:[mark]};
    const r=new MechRig(a.dims);designBuilder(ROLE.MF,0)(frameCtx(r,LIVERIES[0],false),'2');
    let geometryDisposed=0,materialDisposed=0;mark.geometry.addEventListener('dispose',()=>geometryDisposed++);
    const mat=markingsMaterial(LIVERIES[0],false);mat.addEventListener('dispose',()=>materialDisposed++);
    rosterAnchors(r,'daystar',a,LIVERIES[0]);const first=marks(r)[0];rosterAnchors(r,'daystar',a,LIVERIES[0]);
    expect(marks(r)).toHaveLength(1);expect(marks(r)[0]).not.toBe(first);expect(geometryDisposed).toBe(0);expect(materialDisposed).toBe(0);
  });
  it('assets without prepared metadata retain native defaults and never add restored planes',()=>{
    const a={...current.get('daystar')!,preparedMarkings:undefined};register('daystar',a);
    const r=buildFrame(ROLE.MF,LIVERIES[0],'2');expect(marks(r)).toHaveLength(0);expect(r.flames).toHaveLength(4);
    const b=stockBuild(0),custom=buildCustomFrame(ROLE.MF,LIVERIES[0],b,'2');expect(marks(custom)).toHaveLength(0);expect(custom.flames).toHaveLength(4);
  });
  it('keeps Sunhawk outside the restoration adapter',()=>{
    expect(loadPreparedRosterMarkings('sunhawk')).toEqual([]);
  });
});

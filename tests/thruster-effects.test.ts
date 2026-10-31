/** Independent runtime and artifact checks for nozzle-independent exhaust sizing. */
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FRAME_DESIGNS, stockBuild } from '../src/custom/mechBuild';
import { ROLE, type Role } from '../src/sim/config';
import { LIVERIES } from '../src/client/render/palette';
import { buildCustomFrame } from '../src/client/render/mech/customFrame';
import { designBuilder } from '../src/client/render/mech/frames';
import { frameCtx } from '../src/client/render/mech/parts';
import { MechRig, type Flame } from '../src/client/render/mech/rig';
import { nativeRosterFittings, rosterAnchors, thrusterEffectSize } from '../src/client/render/mech/importedRoster';
import { sunhawkFittings, sunhawkJoints } from '../src/client/render/mech/importedSunhawk';
import { readRosterAsset, registerRosterAssets, type RosterAsset } from '../src/client/render/mech/rosterAsset';
import { readSunhawkAsset, registerSunhawkAssets, type SunhawkAsset } from '../src/client/render/mech/sunhawkAsset';

const here = new URL('../src/client/render/mech/assets/', import.meta.url);
const assetPath=(id:string,level=0)=>`${id==='sunhawk'?'sunhawk-updated':`roster/${id}`}${level?`-lod${level}`:''}.glb`;
const ids = ['sunhawk','daystar','rampart','razor','stinger','maul','anubis','horus','sobek','seraph','longbow','paladin','kamaitachi','fujin','raijin'];
const dirs = ids;
const roles = [ROLE.FW, ROLE.MF, ROLE.DF] as const;
const assets = new Map<string, RosterAsset>();
const scenes = new Map<string, THREE.Group>();
const original = new Map<string, Record<string, { width:number; length:number }>>();
function flameId(f:Flame, rig:MechRig):string {
 return f.bank === 'main' ? 'main' + (f.mesh.position.x > 0 ? 'L' : 'R') : 'calf' + (f.mesh.parent === rig.joints.kneeL ? 'L' : 'R');
}
async function file(path:string) { return readFile(new URL(path, here)); }
async function scene(path:string) {
 const b = await file(path);
 return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene;
}
function meta(s:THREE.Group):Record<string,any> {
 let found:Record<string,any>|undefined; s.traverse(o=>{if(o.userData.roster_schema===1)found=o.userData;});
 if(!found)throw Error('missing native metadata'); return found;
}
function rawMeta(b:Buffer):Record<string,any> {
 const doc=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 return doc.nodes.find((n:any)=>n.extras?.roster_schema===1).extras;
}
function register(id:string,a:RosterAsset) {
 if(id==='sunhawk')registerSunhawkAssets([0,1,2].map(()=>({...a,parts:a.parts.map(p=>({...p,detail:false}))})) as SunhawkAsset[]);
 else registerRosterAssets(id,[a,a,a]);
}
/** Frozen main dd1675932ad9eb40c1422ec2929755c74783df19 effect dimensions.
 * Kept independent of the replacement exports so a smaller physical bell can
 * never silently shrink the flame. These are the original builders' sizes. */
function originalEffects(id:string):Record<string,{width:number;length:number}> {
 const role=roles[ids.indexOf(id)%3];
 const main=id==='sunhawk'?{width:.22,length:3.4}:role===ROLE.FW?{width:.20,length:3.4}:role===ROLE.MF?{width:.24,length:3.2}:{width:.40,length:3.0};
 const calf={width:id==='sunhawk'?.18:role===ROLE.FW?.16:role===ROLE.MF?.20:.26,length:1.6};
 return {mainL:main,mainR:main,calfL:calf,calfR:calf};
}
beforeAll(async()=>{
 const context=new Proxy({}, {get:(_t,key)=>key==='measureText'?(s:string)=>({width:s.length*12}):()=>undefined});
 const image=()=>({addEventListener(){},removeEventListener(){},src:'',crossOrigin:''});
 vi.stubGlobal('document',{createElement:(tag:string)=>tag==='canvas'?{width:1,height:1,getContext:()=>context,toDataURL:()=>'',style:{}}:image(),createElementNS:image});
 for(const id of ids){
  original.set(id,originalEffects(id));
  const current=await scene(assetPath(id));scenes.set(id,current);
  const candidate=readRosterAsset(current,id);assets.set(id,candidate);register(id,candidate);
 }
},60_000);
afterAll(()=>vi.unstubAllGlobals());

describe('authored exhaust size independent of physical nozzle size',()=>{
 for(const dir of dirs)it(`${dir}: all four exact frozen-main effect dimensions survive all three LODs`,async()=>{
  const id=dir.split('/')[0],expected=original.get(id)!;
  expect(Object.keys(expected).sort()).toEqual(['calfL','calfR','mainL','mainR']);
  for(const level of [0,1,2]){
   const m=rawMeta(await file(assetPath(id,level)));
   const main=JSON.parse(m.main_thrusters_json),calf=JSON.parse(m.calf_thrusters_json);
   const thrusters=[...main,...calf.map((t:any)=>({...t,id:t.joint==='kneeL'?'calfL':'calfR'}))];
   for(const t of thrusters){
    expect({width:t.effectWidth,length:t.effectLength},`${dir}/LOD${level}/${t.id}`).toEqual(expected[t.id]);
    expect(thrusterEffectSize(t)).toEqual(expected[t.id]);
   }
   const all=JSON.parse(m.all_thrusters_json);
   for(const t of all)expect({width:t.effectWidth,length:t.effectLength}).toEqual(expected[t.id]);
  }
 });

 for(const bank of ['main_thrusters_json','calf_thrusters_json'])for(const field of ['effectWidth','effectLength']){
  it(`${bank}: rejects an invalid explicit ${field}`,()=>{
   for(const invalid of [0,-.01,null,'0.3',true,{},NaN,Infinity]){
    const s=scenes.get('daystar')!.clone(true),m=meta(s),list=JSON.parse(m[bank]);list[0][field]=invalid;m[bank]=JSON.stringify(list);
    expect(()=>readRosterAsset(s,'daystar')).toThrow(new RegExp(`thruster ${field}`));
   }
  });
  it(`${bank}: accepts omitted and independent ${field} without changing the physical fields`,()=>{
   const s=scenes.get('daystar')!.clone(true),m=meta(s),list=JSON.parse(m[bank]);
   for(const t of list){delete t.effectWidth;delete t.effectLength;}list[0][field]=.913;
   m[bank]=JSON.stringify(list);const parsed=readRosterAsset(s,'daystar');
   const actual=bank==='main_thrusters_json'?parsed.mainThrusters!:parsed.calfThrusters;
   expect(actual).toEqual(JSON.parse(JSON.stringify(list)));
  });
 }
 it('retains the old per-field formula only when its explicit dimension is absent',()=>{
  expect(thrusterEffectSize({radius:.3,length:.1})).toEqual({width:.3*.72,length:.65});
  expect(thrusterEffectSize({radius:.3,length:1,effectWidth:.9})).toEqual({width:.9,length:4});
  expect(thrusterEffectSize({radius:.3,length:.1,effectLength:2.1})).toEqual({width:.3*.72,length:2.1});
  expect(thrusterEffectSize({radius:.3,length:.1,effectWidth:.9,effectLength:2.1})).toEqual({width:.9,length:2.1});
 });
 it('old native exports without effect sizes retain identical runtime flame dimensions',()=>{
  const source=assets.get('daystar')!;
  const legacy={...source,mainThrusters:source.mainThrusters!.map(t=>{const {effectWidth,effectLength,...old}=t;return old;}),calfThrusters:source.calfThrusters.map(t=>{const {effectWidth,effectLength,...old}=t;return old;})};
  const r=new MechRig(legacy.dims);designBuilder(ROLE.MF,0)(frameCtx(r,LIVERIES[0],false),'2');nativeRosterFittings(r,legacy);
  for(const f of r.flames){const id=flameId(f,r),t=id.startsWith('main')?legacy.mainThrusters.find(t=>t.id===id)!:legacy.calfThrusters.find(t=>t.joint==='knee'+id.slice(-1))!;
   expect(f.width).toBe(t.radius*.72);expect(f.length).toBe(Math.max(.65,t.length*4));
  }
 });
 it('binding changes no flame geometry, materials, shader uniforms or drawn/burner children',()=>{
  const a=assets.get('daystar')!,r=new MechRig(a.dims);designBuilder(ROLE.MF,0)(frameCtx(r,LIVERIES[0],false),'2');
  const before=r.flames.map(f=>({f,geo:f.mesh.geometry,mat:f.mesh.material,children:[...f.mesh.children],drawn:f.drawn,burner:f.burner,drawnMat:f.drawn?.material,burnerMat:f.burner?.material,
   uniforms:[f.mesh,f.drawn,f.burner].map(m=>m&&Object.fromEntries(Object.entries((m.material as THREE.ShaderMaterial).uniforms).map(([k,u])=>[k,u.value])))}));
  nativeRosterFittings(r,a);
  for(const b of before){const f=b.f;expect(f.mesh.geometry).toBe(b.geo);expect(f.mesh.material).toBe(b.mat);expect(f.mesh.children).toEqual(b.children);expect(f.drawn).toBe(b.drawn);expect(f.burner).toBe(b.burner);expect(f.drawn?.material).toBe(b.drawnMat);expect(f.burner?.material).toBe(b.burnerMat);
   expect([f.mesh,f.drawn,f.burner].map(m=>m&&Object.fromEntries(Object.entries((m.material as THREE.ShaderMaterial).uniforms).map(([k,u])=>[k,u.value])))).toEqual(b.uniforms);
   expect({width:f.width,length:f.length}).toEqual(original.get('daystar')![flameId(f,r)]);
  }
 });
 it('native Sunhawk creates the four original-sized effects on the authored physical outlets',()=>{
  const a=assets.get('sunhawk')! as SunhawkAsset,r=new MechRig(a.dims),towers=sunhawkJoints(r,true,a);
  sunhawkFittings(frameCtx(r,LIVERIES[0],false),'1',true,towers,a);expect(r.flames).toHaveLength(4);
  for(const f of r.flames){const id=flameId(f,r),t=id.startsWith('main')?a.mainThrusters!.find(t=>t.id===id)!:a.calfThrusters!.find(t=>t.joint==='knee'+id.slice(-1))!;
   expect({width:f.width,length:f.length}).toEqual(original.get('sunhawk')![id]);expect(f.mesh.position.toArray()).toEqual(t.outlet);expect(f.mesh.rotation.toArray().slice(0,3)).toEqual(t.rotation);expect(f.drawn?.parent).toBe(f.mesh);expect(f.burner?.parent).toBe(f.mesh);
  }
 });
 for(const role of roles)for(const [pack,shins] of [[4,3],[0,2],[2,0]])it(`frame ${role}: exhaust belongs to backpack ${pack} and shins ${shins}, including Sunhawk donors`,()=>{
  // Deliberately distinct per-side, per-bank values make ownership errors detectable
  // even where several production designs happen to share identical effect sizes.
  const family=FRAME_DESIGNS[role];
  const sentinel=(faction:number,main:boolean,left:boolean)=>({effectWidth:.2+faction*.07+(main?.03:0)+(left?.001:.002),effectLength:1+faction*.41+(main?.2:0)+(left?.01:.02)});
  try{
   for(const [faction,id]of family.entries()){
    const a=assets.get(id)!;register(id,{...a,mainThrusters:a.mainThrusters!.map(t=>({...t,...sentinel(faction,true,t.id==='mainL')})),calfThrusters:a.calfThrusters.map(t=>({...t,...sentinel(faction,false,t.joint==='kneeL')}))});
   }
   const b=stockBuild(1);b.parts.backpack=pack;b.parts.shins=shins;const r=buildCustomFrame(role,LIVERIES[1],b,String(role+1));expect(r.flames).toHaveLength(4);
   // Measure the assembled module at its independent wing mounting roots.
   // The physical outlet remains donor-local; engines must share this rigid
   // translation rather than changing their angle or authored flame sizes.
   const packAsset=assets.get(family[pack])!,leftRoot=packAsset.fittings!.joints!.wingL!.position;
   const packMountZ=r.joints.wingL.position.z-leftRoot[2];
   for(const wing of ['wingL','wingR'] as const){const p=packAsset.fittings!.joints![wing]!.position;
    expect(r.joints[wing].position.x).toBe(p[0]);expect(r.joints[wing].position.y).toBe(p[1]);
    expect(r.joints[wing].position.z-p[2]).toBeCloseTo(packMountZ,10);
   }
   for(const f of r.flames){const main=f.bank==='main',left=main?f.mesh.position.x>0:f.mesh.parent===r.joints.kneeL,source=main?pack:shins,s=sentinel(source,main,left);
    expect({width:f.width,length:f.length}).toEqual({width:s.effectWidth,length:s.effectLength});expect(f.drawn?.parent).toBe(f.mesh);expect(f.burner?.parent).toBe(f.mesh);
    expect(f.mesh.parent).toBe(main?r.joints.chest:left?r.joints.kneeL:r.joints.kneeR);
    if(main)expect(f.mesh.userData.part).toBe('backpack');
    const a=assets.get(family[source])!,t=main?a.mainThrusters!.find(t=>t.id===(left?'mainL':'mainR'))!:a.calfThrusters.find(t=>t.joint===(left?'kneeL':'kneeR'))!;
    if(main){const mounted=new THREE.Vector3(...t.outlet);if(t.joint==='chest')mounted.z+=packMountZ;
     expect(f.mesh.position.distanceTo(mounted)).toBeLessThan(1e-9);
    }else expect(f.mesh.position.toArray()).toEqual(t.outlet);
    expect(f.mesh.rotation.toArray().slice(0,3)).toEqual(t.rotation);
   }
  }finally{for(const id of family)register(id,assets.get(id)!);}
 });
});

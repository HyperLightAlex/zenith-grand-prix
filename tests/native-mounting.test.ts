/** Mechanical integration checks on the real imported custom rigs. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FRAME_DESIGNS, stockBuild, type PartSlot } from '../src/custom/mechBuild';
import { ROLE, type Role } from '../src/sim/config';
import { LIVERIES } from '../src/client/render/palette';
import { buildFrame } from '../src/client/render/mech/frames';
import { buildCustomFrame, customDims } from '../src/client/render/mech/customFrame';
import { nativeHeadSeat } from '../src/client/render/mech/nativeMounts';
import { POSES } from '../src/client/render/mech/poses';
import { MechRig } from '../src/client/render/mech/rig';
import { readRosterAsset, registerRosterAssets, type RosterAsset, type PreparedRosterMarking } from '../src/client/render/mech/rosterAsset';
import { readSunhawkAsset, registerSunhawkAssets, type SunhawkAsset } from '../src/client/render/mech/sunhawkAsset';
const here=new URL('../src/client/render/mech/assets/',import.meta.url),roles=[ROLE.FW,ROLE.MF,ROLE.DF] as const;
const data=new Map<string,RosterAsset[]>(),before=new Map<string,string>();
const ids=roles.flatMap(role=>FRAME_DESIGNS[role]);
function register(id:string,levels:RosterAsset[]):void {
 if(id==='sunhawk')registerSunhawkAssets(levels.map(a=>({...a,parts:a.parts.map(p=>({...p,detail:false}))})) as SunhawkAsset[]);
 else registerRosterAssets(id,levels);
}
function digest(levels:RosterAsset[]):string {
 const h=createHash('sha256');
 const bytes=(a:ArrayBufferView)=>h.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));
 for(const a of levels){
  h.update(JSON.stringify([a.dims,a.mainThrusters,a.calfThrusters,a.fittings]));
  for(const p of a.parts){h.update(JSON.stringify([p.joint,p.part,p.slot]));for(const key of Object.keys(p.geometry.attributes).sort()){h.update(key);bytes(p.geometry.getAttribute(key).array);}if(p.geometry.index)bytes(p.geometry.index.array);}
  for(const l of a.lines){bytes(l.positions);bytes(l.kinds);}
 }
 return h.digest('hex');
}
async function load(id:string,level:number):Promise<RosterAsset>{
 const b=await readFile(new URL(`${id==='sunhawk'?'sunhawk-updated':`roster/${id}`}${level?`-lod${level}`:''}.glb`,here));
 const scene=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene;
 return {...(id==='sunhawk'?readSunhawkAsset(scene,'updated'):readRosterAsset(scene,id)),preparedMarkings:undefined} as RosterAsset;
}
function release(r:MechRig):void {
 const effects=new Set<THREE.Object3D>();for(const f of r.flames)f.mesh.traverse(o=>effects.add(o));
 const geos=new Set<THREE.BufferGeometry>();r.root.traverse(o=>{if(o instanceof THREE.Mesh&&!effects.has(o))geos.add(o.geometry);});
 geos.forEach(g=>g.dispose());r.root.userData.disposeMechInk?.();r.root.clear();
}
function marker():PreparedRosterMarking{return{joint:'chest',part:'backpack',geometry:new THREE.PlaneGeometry(.23,.17),position:[.73,.44,-1.1],quaternion:[0,0,0,1],scale:[1,1,1],renderOrder:2};}
const tolerance=2e-5;
function vec(a:number[],b:number[],label:string):void {expect(a.length,label).toBe(b.length);for(let i=0;i<a.length;i++)expect(Math.abs(a[i]-b[i]),`${label}/${i}`).toBeLessThan(tolerance);}
function key(x:number,y:number,z:number):string{return`${Math.round(x*100000)},${Math.round(y*100000)},${Math.round(z*100000)}`;}
function xyz(g:THREE.BufferGeometry,attr='position'):Set<string>{const out=new Set<string>(),p=g.getAttribute(attr);for(let i=0;i<p.count;i++)out.add(key(p.getX(i),p.getY(i),p.getZ(i)));return out;}
function allArmourPoints(r:MechRig,level:number,joint:string):Set<string>{
 const out=new Set<string>();for(const group of r.detailLevels[level])if(group.parent===r.joints[joint as keyof typeof r.joints])group.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry.hasAttribute('aMat'))for(const k of xyz(o.geometry))out.add(k);});return out;
}
function inkHullPoints(r:MechRig,level:number,joint:string):Set<string>{
 const hull=r.detailLevels[level].find(g=>g.name==='Mech geometry ink')?.getObjectByName('Batched ink hull') as THREE.Mesh;
 expect(hull).toBeDefined();const jointNames=[...Object.keys(r.joints),'skirtL','skirtR','skirtBack','skirtFront',...(r.root.getObjectByName('towerL')?['towerL','towerR']:[])];
 const n=jointNames.indexOf(joint),p=hull.geometry.getAttribute('position'),j=hull.geometry.getAttribute('aJoint'),out=new Set<string>();
 for(let i=0;i<p.count;i++)if(j.getX(i)===n)out.add(key(p.getX(i),p.getY(i),p.getZ(i)));return out;
}
function inkSegments(r:MechRig,level:number,joint:string):Set<string>{
 const mesh=r.detailLevels[level].find(g=>g.name==='Mech geometry ink')?.getObjectByName('Batched authored ink') as THREE.Mesh|undefined;if(!mesh)return new Set();
 const names=[...Object.keys(r.joints),'skirtL','skirtR','skirtBack','skirtFront',...(r.root.getObjectByName('towerL')?['towerL','towerR']:[])];
 const g=mesh.geometry,s=g.getAttribute('instanceStart'),e=g.getAttribute('instanceEnd'),j=g.getAttribute('instanceJoint'),out=new Set<string>();
 for(let i=0;i<s.count;i++)if(j.getX(i)===names.indexOf(joint))out.add(key(s.getX(i),s.getY(i),s.getZ(i))+'|'+key(e.getX(i),e.getY(i),e.getZ(i)));return out;
}
function expectPoints(r:MechRig,a:RosterAsset,level:number,part:PartSlot,joint:string,dz:number,dy=0):void{
 const armour=allArmourPoints(r,level,joint),ink=inkHullPoints(r,level,joint);let checked=0;
 for(const p of a.parts.filter(p=>p.part===part&&p.joint===joint&&p.slot!=='G')){const v=p.geometry.getAttribute('position');for(let i=0;i<v.count;i++){
  const point=key(v.getX(i),Math.fround(v.getY(i)+dy),Math.fround(v.getZ(i)+dz));
  expect(armour.has(point),`${part}/${joint}/LOD${level} armour ${point}`).toBe(true);expect(ink.has(point),`${part}/${joint}/LOD${level} ink hull ${point}`).toBe(true);checked++;
 }}expect(checked).toBeGreaterThan(0);
 const actualLines=inkSegments(r,level,joint);
 for(const l of a.lines.filter(l=>l.part===part&&l.joint===joint))for(let i=0;i<l.positions.length;i+=6){const p=l.positions;const expected=key(p[i],Math.fround(p[i+1]+dy),Math.fround(p[i+2]+dz))+'|'+key(p[i+3],Math.fround(p[i+4]+dy),Math.fround(p[i+5]+dz));expect(actualLines.has(expected),`${part}/${joint}/LOD${level} line ${i/6}`).toBe(true);}
}
// Independent actual-triangle ray tests, rather than calling the seating solver.
// The deliberately different5cm grid checks mechanical overlap to12cm (roughly
// 1% of a mech's height), allowing its2cm rounded fitting and edge samples.
const grid=Array.from({length:11},(_,i)=>-.25+i*.05);
function surface(a:RosterAsset,head:boolean):number[]{
 const out:number[]=[];const ray=new THREE.Ray(),tri=new THREE.Triangle(),hit=new THREE.Vector3();
 for(const x of grid)for(const z of grid){let best=head?Infinity:-Infinity;
  ray.set(new THREE.Vector3(x,head?-20:20,z+(head?0:a.dims.headZ)),new THREE.Vector3(0,head?1:-1,0));
  for(const p of a.parts.filter(p=>p.joint===(head?'head':'chest')&&p.part===(head?'head':'chest'))){const v=p.geometry.getAttribute('position'),ix=p.geometry.index,count=ix?.count??v.count;
   for(let t=0;t<count;t+=3){tri.a.fromBufferAttribute(v,ix?ix.getX(t):t);tri.b.fromBufferAttribute(v,ix?ix.getX(t+1):t+1);tri.c.fromBufferAttribute(v,ix?ix.getX(t+2):t+2);
    if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,hit)&& (head||hit.y<=a.dims.headY+.6))best=head?Math.min(best,hit.y):Math.max(best,hit.y);
   }
  }out.push(best);
 }return out;
}
const tops=new Map<string,number[]>(),bottoms=new Map<string,number[]>(),stockDepth=new Map<string,number>();
function depth(chest:string,head:string,y:number):number{const top=tops.get(chest)!,bottom=bottoms.get(head)!;return Math.max(...top.flatMap((v,i)=>Number.isFinite(v)&&Number.isFinite(bottom[i])?[v-bottom[i]-y]:[]));}
beforeAll(async()=>{
 const ctx=new Proxy({}, {get:(_t,k)=>k==='measureText'?(s:string)=>({width:s.length*12}):()=>undefined});const image=()=>({addEventListener(){},removeEventListener(){},src:'',crossOrigin:''});
 vi.stubGlobal('document',{createElement:(tag:string)=>tag==='canvas'?{width:1,height:1,getContext:()=>ctx,toDataURL:()=>'',style:{}}:image(),createElementNS:image});
 for(const id of ids){const a=await Promise.all([0,1,2].map(l=>load(id,l)));data.set(id,a);before.set(id,digest(a));register(id,a);tops.set(id,surface(a[0],false));bottoms.set(id,surface(a[0],true));stockDepth.set(id,depth(id,id,a[0].dims.headY));}
},120_000);
afterAll(()=>{for(const[id,a]of data)expect(digest(a),`${id} immutable loaded data`).toBe(before.get(id));vi.unstubAllGlobals();});

describe('native custom-part mechanical mounting',()=>{
 for(const role of roles)for(let faction=0;faction<5;faction++)it(`${FRAME_DESIGNS[role][faction]} stock build keeps every body joint and every emitter exact`,()=>{
  const id=FRAME_DESIGNS[role][faction],r=buildCustomFrame(role,LIVERIES[faction],stockBuild(faction),String(role+1)),stock=buildFrame(role,LIVERIES[faction],String(role+1));
  for(const name of Object.keys(r.joints) as (keyof typeof r.joints)[]){vec(r.joints[name].position.toArray(),stock.joints[name].position.toArray(),`${id}/${name}/position`);vec(r.joints[name].quaternion.toArray(),stock.joints[name].quaternion.toArray(),`${id}/${name}/rotation`);}
  expect(r.flames).toHaveLength(stock.flames.length);for(let i=0;i<r.flames.length;i++){const f=r.flames[i],s=stock.flames.find(s=>s.bank===f.bank&&s.mesh.parent?.name===f.mesh.parent?.name&&Math.sign(s.mesh.position.x)===Math.sign(f.mesh.position.x))!;expect(s).toBeDefined();vec(f.mesh.position.toArray(),s.mesh.position.toArray(),`${id}/emitter`);vec(f.mesh.quaternion.toArray(),s.mesh.quaternion.toArray(),`${id}/emitter angle`);expect([f.width,f.length]).toEqual([s.width,s.length]);}
  release(r);release(stock);
 });
 for(const role of roles)for(let chest=0;chest<5;chest++)for(let head=0;head<5;head++)it(`${FRAME_DESIGNS[role][head]} head on ${FRAME_DESIGNS[role][chest]} chest preserves the authored neck engagement`,()=>{
  const cid=FRAME_DESIGNS[role][chest],hid=FRAME_DESIGNS[role][head],b=stockBuild(chest);b.parts.head=head;
  const r=buildCustomFrame(role,LIVERIES[chest],b,String(role+1));const y=r.joints.head.position.y;
  expect(Number.isFinite(y)).toBe(true);if(head===chest)expect(y).toBe(data.get(cid)![0].dims.headY);
  const overlap=depth(cid,hid,y),allowed=head===chest?stockDepth.get(cid)!:Math.min((data.get(cid)![0].fittings?.mounts?.headCapacity??stockDepth.get(cid)!)-(data.get(cid)![0].fittings?.mounts?.headClearance??0),data.get(hid)![0].fittings?.mounts?.headInsertion??stockDepth.get(hid)!);
  const correction=head===chest?0:data.get(cid)![0].fittings?.headSeatOffsets?.[hid]??0;
  expect(Number.isFinite(overlap),`${cid}/${hid} neck coverage`).toBe(true);expect(Math.abs(overlap-(allowed-correction)),`${cid}/${hid} neck engagement drift`).toBeLessThan(.12);
  release(r);
 });
 for(const [role,receiver,donor]of [[ROLE.FW,4,0],[ROLE.MF,2,1],[ROLE.DF,3,4]] as const)it(`${FRAME_DESIGNS[role][donor]} backpack on ${FRAME_DESIGNS[role][receiver]} carries geometry, ink, wings, decals and flames as one module at all LODs`,()=>{
  const id=FRAME_DESIGNS[role][donor],a=data.get(id)!,mark=marker();register(id,a.map(x=>({...x,preparedMarkings:[mark]})));
  const b=stockBuild(receiver);b.parts.backpack=donor;const r=buildCustomFrame(role,LIVERIES[donor],b,String(role+1)),stock=buildFrame(role,LIVERIES[donor],String(role+1));
  const main=r.flames.filter(f=>f.bank==='main'),left=main.find(f=>f.mesh.position.x>0)!;const t=a[0].mainThrusters!.find(t=>t.id==='mainL')!;
  const dz=left.mesh.position.z-t.outlet[2];expect(Number.isFinite(dz)).toBe(true);
  for(const f of main){const m=a[0].mainThrusters!.find(t=>t.id===(f.mesh.position.x>0?'mainL':'mainR'))!;vec(f.mesh.position.toArray(),[m.outlet[0],m.outlet[1],m.outlet[2]+dz],'main common translation');vec(f.mesh.rotation.toArray().slice(0,3)as number[],m.rotation,'main approved angles');expect(f.mesh.userData.part).toBe('backpack');}
  const m:THREE.Object3D[]=[];r.root.traverse(o=>{if(o.userData.preparedMarking)m.push(o);});expect(m).toHaveLength(id==='sunhawk'?0:1);if(m.length)vec(m[0].position.toArray(),[mark.position[0],mark.position[1],mark.position[2]+dz],'decal common translation');
  for(const wing of ['wingL','wingR']as const){const p=a[0].fittings!.joints![wing]!.position;vec(r.joints[wing].position.toArray(),[p[0],p[1],p[2]+dz],`${wing} root`);vec(r.joints[wing].quaternion.toArray(),stock.joints[wing].quaternion.toArray(),`${wing} unchanged orientation`);}
  for(let level=0;level<3;level++){expectPoints(r,a[level],level,'backpack','chest',dz);for(const wing of ['wingL','wingR'])if(a[level].parts.some(p=>p.part==='backpack'&&p.joint===wing))expectPoints(r,a[level],level,'backpack',wing,0);}
  release(r);release(stock);register(id,a);
 });
 it('Sunhawk helmet seats down over the Kamaitachi neck support instead of stacking exposed necks',()=>{
  const b=stockBuild(4);b.parts.head=0;const r=buildCustomFrame(ROLE.FW,LIVERIES[0],b,'1');
  expect(data.get('sunhawk')![0].fittings?.mounts?.headInsertion).toBe(.4);
  expect(r.joints.head.position.y).toBeGreaterThanOrEqual(1.42);
  expect(r.joints.head.position.y).toBeLessThanOrEqual(1.50);
  release(r);
 });
 for(const head of [1,2,4])it(`foreign Swift head ${head} clears Seraph's raised collar`,()=>{
  const b=stockBuild(3);b.parts.head=head;const r=buildCustomFrame(ROLE.FW,LIVERIES[3],b,'1');
  const id=FRAME_DESIGNS[ROLE.FW][head],overlap=depth('seraph',id,r.joints.head.position.y);
  expect(stockDepth.get('seraph')!-overlap).toBeGreaterThan(.07);
  expect(stockDepth.get('seraph')!-overlap).toBeLessThan(.18);
  release(r);
 });
 for(const hips of [0,1,2,3,4])it(`Kamaitachi waist bearing follows Swift hip socket ${hips} without shifting the chest at rest`,()=>{
  const b=stockBuild(hips);b.parts.waist=4;const r=buildCustomFrame(ROLE.FW,LIVERIES[hips],b,'1');
  const dz=hips===4?0:-.28;
  expect(r.joints.spine.position.z).toBeCloseTo(dz,5);expect(r.joints.chest.position.z).toBeCloseTo(-dz,5);
  r.root.updateMatrixWorld(true);
  expect(r.joints.chest.getWorldPosition(new THREE.Vector3()).z).toBeCloseTo(0,5);
  for(let l=0;l<3;l++)expectPoints(r,data.get('kamaitachi')![l],l,'waist','spine',0);
  const initial=[r.joints.spine.position.clone(),r.joints.chest.position.clone()];
  for(const pose of Object.values(POSES)){
   r.apply(structuredClone(pose));r.root.updateMatrixWorld(true);
   expect(r.joints.spine.position.distanceTo(initial[0])).toBeLessThan(1e-9);
   expect(r.joints.chest.position.distanceTo(initial[1])).toBeLessThan(1e-9);
   expect(r.joints.chest.matrixWorld.elements.every(Number.isFinite)).toBe(true);
  }
  release(r);
 });
 it('the reviewed Daystar/Fujin correction changes exactly one of the75 same-frame head pairs',()=>{
  for(const id of ids)for(const a of data.get(id)!)expect(a.fittings?.headSeatOffsets??{}).toEqual(id==='daystar'?{fujin:-.08}:{});
  const daystar=data.get('daystar')!,without=daystar.map(a=>({...a,fittings:{...a.fittings,headSeatOffsets:undefined}}));
  const builds=roles.flatMap(role=>FRAME_DESIGNS[role].flatMap((chest,c)=>FRAME_DESIGNS[role].map((head,h)=>{const b=stockBuild(c);b.parts.head=h;return{role,chest,head,b};})));
  const approved=builds.map(({role,b})=>customDims(role,b));
  try{
   register('daystar',without);
   for(let i=0;i<builds.length;i++){
    const {role,chest,head,b}=builds[i],plain=customDims(role,b),difference=chest==='daystar'&&head==='fujin'?-.08:0;
    expect(approved[i].headY-plain.headY,`${head} on ${chest}`).toBeCloseTo(difference,10);
    expect({...approved[i],headY:plain.headY}).toEqual(plain);
   }
  }finally{register('daystar',daystar);}
 });
 it('a reviewed correction changes only the assembled head position, including after pose resets',()=>{
  const original=data.get('daystar')!,b=stockBuild(0);b.parts.head=4;
  let approved:MechRig|undefined,plain:MechRig|undefined;
  try{
   approved=buildCustomFrame(ROLE.MF,LIVERIES[0],b,'2');
   register('daystar',original.map(a=>({...a,fittings:{...a.fittings,headSeatOffsets:undefined}})));
   plain=buildCustomFrame(ROLE.MF,LIVERIES[0],b,'2');
   expect(approved.joints.head.position.y-plain.joints.head.position.y).toBeCloseTo(-.08,10);
   for(const name of Object.keys(approved.joints)as(keyof typeof approved.joints)[])if(name!=='head')vec(approved.joints[name].position.toArray(),plain.joints[name].position.toArray(),`unchanged ${name}`);
   for(let i=0;i<approved.flames.length;i++){
    const f=approved.flames[i],p=plain.flames[i];vec(f.mesh.position.toArray(),p.mesh.position.toArray(),'unchanged flame position');vec(f.mesh.quaternion.toArray(),p.mesh.quaternion.toArray(),'unchanged flame rotation');expect([f.width,f.length]).toEqual([p.width,p.length]);
   }
   const y=approved.joints.head.position.y;
   for(const pose of Object.values(POSES)){approved.apply(structuredClone(pose));expect(approved.joints.head.position.y).toBe(y);}
  }finally{register('daystar',original);if(approved)release(approved);if(plain)release(plain);}
 });
 it('reviewed head offsets update immediately when metadata is replaced while geometry remains shared',()=>{
  const original=data.get('daystar')!,head=data.get('fujin')![0],b=stockBuild(0);b.parts.head=4;
  const geometric=nativeHeadSeat(original[0],head)!;
  try{
   for(const correction of [-.08,.05,undefined,-.08]){
    const replacement=original.map(a=>({...a,fittings:{...a.fittings,headSeatOffsets:correction===undefined?undefined:{fujin:correction}}}));
    expect(replacement[0].parts).toBe(original[0].parts);register('daystar',replacement);
    expect(nativeHeadSeat(replacement[0],head)).toBe(geometric);
    expect(customDims(ROLE.MF,b).headY).toBeCloseTo(original[0].dims.headY+geometric+(correction??0),10);
   }
   // Even a direct, unparsed
   // self-reference must never displace a same-design stock assembly.
   register('daystar',original.map(a=>({...a,fittings:{...a.fittings,headSeatOffsets:{daystar:-.20,fujin:-.08}}})));
   expect(customDims(ROLE.MF,stockBuild(0)).headY).toBe(original[0].dims.headY);
  }finally{register('daystar',original);}
 });
 it('reviewed head offsets parser rejects invalid containers, donors and magnitudes',async()=>{
  const bytes=await readFile(new URL('roster/daystar.glb',here));
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const roots:THREE.Object3D[]=[];scene.traverse(o=>{if(o.userData.roster_schema)roots.push(o);});
  expect(roots).toHaveLength(1);const root=roots[0],base=JSON.parse(root.userData.fittings_json);delete base.headSeatOffsets;
  const malformed=['null','[]','"wrong"','0','{"unknown":0.1}','{"daystar":0.1}','{"fujin":null}','{"fujin":"-0.08"}','{"fujin":true}','{"fujin":1e999}','{"fujin":-1e999}','{"fujin":0.250001}','{"fujin":-0.250001}'];
  for(const raw of malformed){root.userData.fittings_json=JSON.stringify(base).slice(0,-1)+',"headSeatOffsets":'+raw+'}';expect(()=>readRosterAsset(scene,'daystar'),raw).toThrow('reviewed head seats');}
  for(const value of [-.25,0,.25]){root.userData.fittings_json=JSON.stringify({...base,headSeatOffsets:{fujin:value}});expect(readRosterAsset(scene,'daystar').fittings!.headSeatOffsets).toEqual({fujin:value});}
  root.userData.fittings_json=JSON.stringify(base);expect(readRosterAsset(scene,'daystar').fittings!.headSeatOffsets).toBeUndefined();
 });
 it('metadata-only interface replacements invalidate the head-seat cache without replacing geometry',()=>{
  const c=data.get('kamaitachi')![0],h=data.get('sunhawk')![0],before=nativeHeadSeat(c,h)!;
  const changed={...h,fittings:{...h.fittings,mounts:{...h.fittings?.mounts,headInsertion:0}}};
  const next=nativeHeadSeat(c,changed)!;
  expect(next-before).toBeCloseTo(.4,2);expect(nativeHeadSeat(c,h)).toBe(before);
  const collar={...c,fittings:{...c.fittings,mounts:{...c.fittings?.mounts,headClearance:.2}}};
  expect(nativeHeadSeat(collar,h)!-before).toBeCloseTo(.2,2);expect(nativeHeadSeat(c,h)).toBe(before);
 });
 for(const head of [0,1,3,4])it(`Sobek socket hides donor ${head}'s neck stem while respecting the reviewed visible collar clearance`,()=>{
  const b=stockBuild(2);b.parts.head=head;const r=buildCustomFrame(ROLE.DF,LIVERIES[2],b,'3');
  const donor=FRAME_DESIGNS[ROLE.DF][head];
  expect(data.get('sobek')![0].fittings?.mounts?.headCapacity).toBe(.55);
  expect(r.joints.head.position.y).toBeLessThan(1.4);
  expect(Math.abs(depth('sobek',donor,r.joints.head.position.y)-Math.min(.55,stockDepth.get(donor)!))).toBeLessThan(.12);
  release(r);
 });
 it('receiver socket capacity is part of the cache identity even when shared geometry is reused',()=>{
  const c=data.get('sobek')![0],h=data.get('rampart')![0],before=nativeHeadSeat(c,h)!;
  const shallow={...c,fittings:{...c.fittings,mounts:{...c.fittings?.mounts,headCapacity:.2}}};
  const raised=nativeHeadSeat(shallow,h)!;
  expect(raised-before).toBeGreaterThan(.30);expect(raised-before).toBeLessThan(.40);
  expect(nativeHeadSeat(c,h)).toBe(before);
 });
 it('mount-interface metadata is identical across all three levels and rejects malformed values',async()=>{
  for(const id of ids){const a=data.get(id)!;for(const level of a)expect(level.fittings?.mounts).toEqual(a[0].fittings?.mounts);}
  const bytes=await readFile(new URL('roster/kamaitachi.glb',here));
  for(const mounts of [{waistAxisZ:NaN},{headInsertion:-1},{headClearance:Infinity},{headCapacity:-.1},{headCapacity:Infinity},{headCapacity:3},{arbitrary:1}]){
   const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
   scene.traverse(o=>{if(o.userData.roster_schema){const fittings=JSON.parse(o.userData.fittings_json);fittings.mounts=mounts;o.userData.fittings_json=JSON.stringify(fittings);}});
   expect(()=>readRosterAsset(scene,'kamaitachi')).toThrow('mount interfaces');
  }
 });
 it('registry replacement invalidates a previous backpack fit without mutating cached source assets',()=>{
  const receiver='horus',donor='stinger',a=data.get(receiver)!,b=stockBuild(2);b.parts.backpack=1;
  const first=buildCustomFrame(ROLE.MF,LIVERIES[1],b,'2'),z=first.flames.find(f=>f.bank==='main')!.mesh.position.z;release(first);
  const replacement=a.map(level=>({...level,parts:level.parts.map(p=>p.joint==='chest'&&p.part==='chest'?{...p,geometry:p.geometry.clone().translate(0,0,.19)}:p)}));register(receiver,replacement);
  const second=buildCustomFrame(ROLE.MF,LIVERIES[1],b,'2'),next=second.flames.find(f=>f.bank==='main')!.mesh.position.z;
  expect(next-z).toBeCloseTo(.19,4);release(second);register(receiver,a);expect(digest(a)).toBe(before.get(receiver));
 });
 for(const torso of [0,1,2,3,4])it(`Sobek's crocodile nape swaps with its head on Bulwark torso ${torso}`,()=>{
  const b=stockBuild(torso);b.parts.head=2;const r=buildCustomFrame(ROLE.DF,LIVERIES[2],b,'3'),a=data.get('sobek')!;
  const dy=r.joints.head.position.y-a[0].dims.headY,dz=r.joints.head.position.z-a[0].dims.headZ;
  for(let l=0;l<3;l++)expectPoints(r,a[l],l,'head','chest',dz,dy);
  release(r);
 });
 for(const torso of [0,1,2,3,4])it(`Maul chest-joint head cowl stays registered with its head on Bulwark torso ${torso}`,()=>{
  const b=stockBuild(torso);b.parts.head=1;const r=buildCustomFrame(ROLE.DF,LIVERIES[1],b,'3'),a=data.get('maul')!;
  const dy=r.joints.head.position.y-a[0].dims.headY,dz=r.joints.head.position.z-a[0].dims.headZ;
  for(let l=0;l<3;l++)expectPoints(r,a[l],l,'head','chest',dz,dy);
  release(r);
 });
});

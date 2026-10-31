import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readRosterAsset, ROSTER_IDS, type RosterAsset } from '../src/client/render/mech/rosterAsset';
import { attachRosterCalfJets, fitRosterPose } from '../src/client/render/mech/importedRoster';
import { MechRig, blendPose, copyPose, makePose } from '../src/client/render/mech/rig';
import { POSES } from '../src/client/render/mech/poses';

const heavy = new Set(['rampart','maul','sobek','paladin','raijin']);
const mid = new Set(['daystar','stinger','horus','longbow','fujin']);
const cache = new Map<string,Promise<RosterAsset>>();
function load(id: string, level=0): Promise<RosterAsset> {
  const key=`${id}:${level}`;
  if (!cache.has(key)) cache.set(key,(async()=>{
    const bytes=await readFile(new URL(`../src/client/render/mech/assets/roster/${id}${level?`-lod${level}`:''}.glb`,import.meta.url));
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    return readRosterAsset(gltf.scene,id);
  })());
  return cache.get(key)!;
}

for(const id of ROSTER_IDS) describe(`${id} production asset`,()=>{
  it('has three complete, finite exports with authored unit normals and progressively reduced geometry',async()=>{
    const counts:number[]=[];
    let contract:string[]=[];
    for(let level=0;level<3;level++) {
      const asset=await load(id,level);
      const keys=[...new Set(asset.parts.map(p=>`${p.joint}/${p.part}`))].sort();
      if(level)expect(keys).toEqual(contract); else contract=keys;
      let triangles=0;
      for(const {geometry} of asset.parts) {
        const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
        expect(n.count).toBe(p.count);
        expect(geometry.index).not.toBeNull();
        let error=0;
        for(let i=0;i<p.count;i++) {
          if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))throw new Error(`${id}: non-finite geometry`);
          error=Math.max(error,Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1));
        }
        expect(error).toBeLessThan(.001);
        triangles+=geometry.index!.count/3;
      }
      counts.push(triangles);
    }
    expect(counts[0]).toBeGreaterThan(15_000);
    // Includes the continuous internal frame and seated calf-nozzle housings.
    expect(counts[0]).toBeLessThan(50_000);
    // Keep explicit distance budgets: small attached accessories retain their
    // silhouette instead of being reduced by the old uniform decimation ratio.
    expect(counts[1]).toBeLessThan(25_000);
    expect(counts[2]).toBeLessThan(15_000);
    expect(counts[1]/counts[0]).toBeLessThan(.60);
    expect(counts[2]/counts[0]).toBeLessThan(.45);
    expect(counts[2]).toBeLessThan(counts[1]);
    expect((await load(id,2)).dims).toEqual((await load(id)).dims);
  });

  it('carries authored ink at near/mid LODs and valid outline data at every LOD',async()=>{
    const counts:number[]=[];
    for(let level=0;level<3;level++) {
      const asset=await load(id,level);
      expect(asset.ink).toBe(true);
      for(const part of asset.parts) {
        const normal=part.geometry.getAttribute('_outline_normal'),width=part.geometry.getAttribute('_ink_width');
        expect(normal.count).toBe(part.geometry.attributes.position.count);
        expect(width.count).toBe(normal.count);
        for(let i=0;i<normal.count;i++) {
          expect(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))).toBeCloseTo(1,3);
          expect(width.getX(i)).toBeGreaterThanOrEqual(0);
          expect(width.getX(i)).toBeLessThanOrEqual(1);
        }
      }
      for(const line of asset.lines) {
        expect(asset.parts.some(p=>p.joint===line.joint)).toBe(true);
        expect(line.positions.length).toBe(line.kinds.length*6);
        expect(Array.from(line.positions).every(Number.isFinite)).toBe(true);
        expect(Array.from(line.kinds).every(k=>[0,1,2].includes(k))).toBe(true);
      }
      counts.push(asset.lines.reduce((n,l)=>n+l.kinds.length,0));
    }
    expect(counts[0]).toBeGreaterThan(100);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[1]).toBeLessThan(counts[0]);
    // Only the reviewed silhouette seams survive at far distance.
    expect(counts[2]).toBeLessThan(200);
    expect(counts[2]).toBeLessThan(counts[1] * .20);
  });

  it('seats calf jets on the actual shin and keeps effects on the bell outlets through motion',async()=>{
    const asset=await load(id);
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const rig=new MechRig(asset.dims);
    rig.fitPose=p=>fitRosterPose(p,heavy.has(id),id);
    for(const t of asset.calfThrusters) {
      const axis=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(...t.rotation));
      // The new bells cant down to account for the forward racing lean.
      expect(axis.z).toBeLessThan(-.5);
      expect(axis.y).toBeLessThan(-.4);
      const outlet=new THREE.Vector3().fromArray(t.outlet);
      const base=new THREE.Vector3().fromArray(t.base);
      expect(outlet.clone().sub(base).dot(axis)).toBeGreaterThan(t.length * .5);
      for(let level=0;level<3;level++) {
        const detail=await load(id,level);
        expect(detail.calfThrusters).toEqual(asset.calfThrusters);
        const meshes=detail.parts.filter(p=>p.joint===t.joint && p.slot!=='G').map(p=>new THREE.Mesh(p.geometry,material));
        const ray=new THREE.Raycaster(new THREE.Vector3(t.surface[0],t.surface[1],-5),new THREE.Vector3(0,0,1));
        const hits=ray.intersectObjects(meshes,false);
        expect(hits.length,`${id} LOD${level} missing calf surface`).toBeGreaterThan(0);
        // New models include frame-colour socket plates at the mounting
        // surface. The nozzle shell may be hit before that buried surface.
        expect(Math.min(...hits.map(hit=>Math.abs(hit.point.z-t.surface[2]))),`${id} LOD${level} calf mounting surface`).toBeLessThan(.08);
        const bell=detail.parts.filter(p=>p.joint===t.joint && ['F','S','T','G'].includes(p.slot)).map(p=>new THREE.Mesh(p.geometry,material));
        const up=new THREE.Vector3(0,1,0).applyEuler(new THREE.Euler(...t.rotation));
        ray.set(outlet.clone().addScaledVector(up,t.radius*.91).addScaledVector(axis,.05),axis.clone().negate());
        const lip=ray.intersectObjects(bell,false)[0];
        expect(lip,`${id} LOD${level} outlet missed its bell`).toBeDefined();
        expect(lip.distance).toBeLessThan(.14);
      }
      const mesh=new THREE.Mesh();rig.joints[t.joint].add(mesh);
      rig.flames.push({mesh,bank:'leg',width:t.radius,length:1.6});
    }
    attachRosterCalfJets(rig,asset.calfThrusters);
    for(const pose of [POSES.standby,POSES.boost,POSES.guard,POSES.victory]) {
      rig.apply(pose);rig.root.updateMatrixWorld(true);
      for(const t of asset.calfThrusters) {
        const flame=rig.flames.find(f=>f.mesh.parent===rig.joints[t.joint])!.mesh;
        const expected=rig.joints[t.joint].localToWorld(new THREE.Vector3().fromArray(t.outlet));
        expect(flame.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-6);
        const expectedAxis=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(...t.rotation)).transformDirection(rig.joints[t.joint].matrixWorld);
        const flameAxis=new THREE.Vector3(0,0,-1).transformDirection(flame.matrixWorld);
        expect(flameAxis.distanceTo(expectedAxis)).toBeLessThan(1e-6);
      }
    }
    material.dispose();
  });

  // These designs retain the original internal chassis. Reconstructed frames
  // have independent native socket/rigidity coverage in native-roster-assets.
  if(!['daystar','stinger','seraph','longbow','kamaitachi','raijin'].includes(id)) it('has solid internal support across the waist and limb attachment seams',async()=>{
    const asset=await load(id),d=asset.dims;
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    // Section rays inspect real exported geometry, including just above the
    // old waist cap where Anubis and the other frames had daylight gaps.
    const sections:[string,number][]=[['spine',-.25],['spine',d.chestY+.12],['chest',0],['head',-.1]];
    for(const s of ['L','R'])sections.push([`sh${s}`,-d.upperArm+.03],[`el${s}`,-d.foreArm+.03],[`wr${s}`,0],[`hip${s}`,-d.thigh+.03],[`knee${s}`,-d.shin+.03],[`ankle${s}`,0]);
    for(const [joint,y] of sections) {
      const meshes=asset.parts.filter(p=>p.joint===joint && p.slot==='F').map(p=>new THREE.Mesh(p.geometry,material));
      const front=new THREE.Raycaster(new THREE.Vector3(0,y,2),new THREE.Vector3(0,0,-1)).intersectObjects(meshes,false);
      const back=new THREE.Raycaster(new THREE.Vector3(0,y,-2),new THREE.Vector3(0,0,1)).intersectObjects(meshes,false);
      expect(front.length,`${id} ${joint} front support`).toBeGreaterThan(0);
      expect(back.length,`${id} ${joint} back support`).toBeGreaterThan(0);
      expect(front[0].point.z-back[0].point.z).toBeGreaterThan(.16);
    }
    material.dispose();
  });

  // The three reconstructed hands use a different articulated plate layout.
  if(!['daystar','seraph','kamaitachi'].includes(id)) it('has forward dorsal plates, inward thumbs and mirrored rear-curling fingers',async()=>{
    const {parts}=await load(id);
    const k=heavy.has(id)?1.65:mid.has(id)?1.02:.95;
    const kx=k*(heavy.has(id)?1.18:1),ky=k*(heavy.has(id)?.72:1);
    const hands=parts.filter(p=>p.joint==='wrL'||p.joint==='wrR');
    // The part of each hand below the palm excludes retained weapon geometry.
    const fingerPositions=(joint:string)=>{
      const g=hands.find(p=>p.joint===joint && p.slot==='F')!.geometry;
      const p=g.getAttribute('position');
      const out:THREE.Vector3[]=[];
      for(let i=0;i<p.count;i++) if(p.getY(i)<-.50*ky && p.getY(i)>-.82*ky && Math.abs(p.getX(i))<.23*kx) {
        const x=p.getX(i)*(joint==='wrR'?-1:1);
        out.push(new THREE.Vector3(x,p.getY(i),p.getZ(i)));
      }
      return out;
    };
    expect(fingerPositions('wrL').length).toBeGreaterThan(30);
    const left=fingerPositions('wrL'),right=fingerPositions('wrR');
    // Blender bevel operations can differ at sub-micrometre precision when mirrored.
    // Right-hand slots can also contain the held rifle or staff. Every left
    // finger vertex must have a reflected match, allowing that extra equipment.
    expect(left.every(p=>right.some(q=>p.distanceToSquared(q)<1e-10))).toBe(true);
    const palm=hands.find(p=>p.joint==='wrL'&&p.slot==='F')!.geometry;
    palm.computeBoundingBox();
    expect(palm.boundingBox!.min.x).toBeLessThan(-.29*kx);
    expect(palm.boundingBox!.max.x).toBeLessThan(.23*kx);
    for(const joint of ['wrL','wrR']) {
      const plate=hands.find(p=>p.joint===joint&&p.slot==='P')!.geometry;
      const p=plate.getAttribute('position');
      let dorsal=0;
      for(let i=0;i<p.count;i++) if(p.getY(i)<-.1*ky && p.getY(i)>-.47*ky && p.getZ(i)>.12*k)dorsal++;
      expect(dorsal).toBeGreaterThan(10);
      const tips=hands.find(p=>p.joint===joint&&p.slot==='D')!.geometry.getAttribute('position');
      let curled=0;
      for(let i=0;i<tips.count;i++) if(tips.getY(i)<-.55*ky && tips.getZ(i)<-.15*k)curled++;
      expect(curled).toBeGreaterThan(10);
    }
  });

  it('fits animated poses continuously without changing authored poses or skate targets',async()=>{
    const rig=new MechRig((await load(id)).dims);
    rig.keepFeetOnRoad=true; rig.fitPose=p=>fitRosterPose(p,heavy.has(id),id);
    for(const end of [POSES.boost,POSES.guard,POSES.victory,POSES.lanceHit,POSES.slashHit]) {
      let previous:THREE.Quaternion[]|undefined;
      for(let i=0;i<=50;i++) {
        const p=blendPose(copyPose(makePose(),POSES.standby),end,i/50);
        const before=JSON.stringify(p);
        rig.apply(p);rig.root.updateMatrixWorld(true);
        expect(JSON.stringify(p)).toBe(before);
        for(const [joint,foot] of [[rig.joints.ankleL,p.footL],[rig.joints.ankleR,p.footR]] as const) {
          const target=new THREE.Vector3(foot[0],rig.dims.ankleY+foot[1],foot[2]);
          expect(joint.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(.04);
        }
        const now=[rig.joints.shL,rig.joints.shR,rig.joints.wingL,rig.joints.wingR].map(o=>o.quaternion.clone());
        if(previous)now.forEach((q,j)=>expect(q.angleTo(previous![j])).toBeLessThan(.10));
        previous=now;
      }
    }
  });
});

it('rejects missing joints and incomplete dimension metadata',async()=>{
  const bytes=await readFile(new URL('../src/client/render/mech/assets/roster/daystar.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.traverse(o=>{if(o.userData.roster_schema)delete o.userData.dims.thigh;});
  expect(()=>readRosterAsset(scene,'daystar')).toThrow('Incomplete');
  scene.traverse(o=>{if(o.userData.roster_schema)o.userData.dims.thigh=2.2;});
  const remove:THREE.Object3D[]=[];
  scene.traverse(o=>{if(o.userData.joint==='ankleR')remove.push(o);});
  remove.forEach(o=>o.removeFromParent());
  expect(()=>readRosterAsset(scene,'daystar')).toThrow('Incomplete');
});

it('keeps the sheet-derived eye lights and Daystar fin pair bilaterally symmetric',async()=>{
  const positions=(a:RosterAsset,joint:string,slot:string)=>{
    const p=a.parts.find(p=>p.joint===joint&&p.slot===slot)!.geometry.getAttribute('position');
    return Array.from({length:p.count},(_,i)=>new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));
  };
  const mirrored=(left:THREE.Vector3[],right:THREE.Vector3[],tolerance=1e-5)=>
    left.every(p=>right.some(q=>Math.hypot(p.x+q.x,p.y-q.y,p.z-q.z)<tolerance));
  for(const id of ['razor','stinger','maul','anubis','seraph','kamaitachi','fujin','raijin']) {
    const eye=positions(await load(id),'head','G');
    expect(eye.length).toBeGreaterThanOrEqual(8);
    expect(mirrored(eye,eye),`${id} eye lights`).toBe(true);
  }
  const daystar=await load('daystar');
  for(const slot of ['S','T','G']) {
    const left=positions(daystar,'wingL',slot),right=positions(daystar,'wingR',slot);
    // Blender clamps the 12 mm edge bevel slightly differently on the two
    // swept tips. Allow 2 mm, well below the bevel and the 9 m model scale.
    expect(mirrored(left,right,.002),`Daystar ${slot} fins`).toBe(true);
    expect(mirrored(right,left,.002),`Daystar ${slot} fins`).toBe(true);
  }
});

it('keeps carbine barrels aligned with their authored gameplay muzzle anchors',async()=>{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const id of ['daystar','stinger','longbow','fujin'])for(let lod=0;lod<3;lod++) {
    const a=await load(id,lod),muzzle=a.fittings?.anchors?.muzzle;
    expect(muzzle,`${id} authored muzzle`).toBeDefined();
    const gun=a.parts.filter(p=>p.joint===muzzle!.joint).map(p=>new THREE.Mesh(p.geometry,mat));
    const point=new THREE.Vector3().fromArray(muzzle!.position);
    const ray=new THREE.Raycaster(point.clone().add(new THREE.Vector3(0,-.1,0)),new THREE.Vector3(0,1,0));
    const hit=ray.intersectObjects(gun,false)[0];
    expect(hit,`${id} LOD${lod} bore`).toBeDefined();
    expect(hit.point.distanceTo(point),`${id} LOD${lod} muzzle seating`).toBeLessThan(.08);
  }
  mat.dispose();
});

it('centres Tempest chest lightning and seats it on the dark armor at every LOD',async()=>{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const id of ['kamaitachi','fujin','raijin'])for(let lod=0;lod<3;lod++) {
    const a=await load(id,lod);
    // Chest and backpack can share a joint/paint slot after part grouping.
    const bolt=a.parts.filter(p=>p.joint==='chest'&&p.insignia==='chest'&&p.slot==='G').flatMap(part=>{
      const glow=part.geometry.getAttribute('position');
      return Array.from({length:glow.count},(_,i)=>new THREE.Vector3(glow.getX(i),glow.getY(i),glow.getZ(i)));
    }).filter(v=>v.z>.3);
    expect(bolt.length).toBeGreaterThan(12);
    expect(Math.abs(Math.min(...bolt.map(v=>v.x))+Math.max(...bolt.map(v=>v.x)))).toBeLessThan(.025);
    const armor=a.parts.filter(p=>p.joint==='chest'&&p.slot==='S').map(p=>new THREE.Mesh(p.geometry,mat));
    // Kamaitachi's approved reconstruction uses a raised, flat crest over
    // a faceted chest (0.024–0.129m), rather than the other two flush inlays.
    const maxGap=id==='kamaitachi'?.14:.055;
    const nearestGap=id==='kamaitachi'?.04:.025;
    let nearest=Infinity;
    for(const v of bolt) {
      const hit=new THREE.Raycaster(new THREE.Vector3(v.x,v.y,v.z+1),new THREE.Vector3(0,0,-1)).intersectObjects(armor,false)[0];
      expect(hit,`${id} LOD${lod} lightning misses shield`).toBeDefined();
      const gap=v.z-hit.point.z;
      nearest=Math.min(nearest,gap);
      expect(gap,`${id} LOD${lod} buried lightning`).toBeGreaterThan(-.012);
      // A raised solid badge has thickness; its back still seats on the plate.
      expect(gap,`${id} LOD${lod} floating lightning`).toBeLessThan(maxGap);
    }
    expect(nearest,`${id} LOD${lod} lightning not seated`).toBeLessThan(nearestGap);
  }
  mat.dispose();
});

it('keeps Raijin’s halo supports clear of the two main jet throats',async()=>{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(let lod=0;lod<3;lod++) {
    const a=await load('raijin',lod);
    const trim=a.parts.filter(p=>p.joint==='chest'&&p.slot==='T').map(p=>new THREE.Mesh(p.geometry,mat));
    for(const s of [-1,1]) {
      const ray=new THREE.Raycaster(new THREE.Vector3(s*.72,.4,-2.36),new THREE.Vector3(0,Math.sin(.25),Math.cos(.25)),0,.8);
      expect(ray.intersectObjects(trim,false),`LOD${lod} blocked main nozzle`).toHaveLength(0);
    }
  }
  mat.dispose();
});

it('keeps Longbow a midfielder without the concept sheet’s paired forearm blades',async()=>{
  for(let lod=0;lod<3;lod++) {
    const asset=await load('longbow',lod);
    for(const part of asset.parts.filter(p=>p.joint==='elL'||p.joint==='elR')) {
      part.geometry.computeBoundingBox();
      expect(part.geometry.boundingBox!.min.y).toBeGreaterThan(-asset.dims.foreArm-.30);
    }
    // The only long handheld component is the right rifle. Left-hand
    // geometry ends at the fingertips rather than extending into a blade.
    for(const part of asset.parts.filter(p=>p.joint==='wrL')) {
      part.geometry.computeBoundingBox();
      expect(part.geometry.boundingBox!.min.y).toBeGreaterThan(-1);
    }
  }
});

it('keeps tall and swept rear fins on their own side through boost and victory',async()=>{
  for(const id of ['razor','anubis','rampart','daystar','stinger','maul']) {
    const asset=await load(id);
    const fittings=asset.fittings!.joints!;
    const rig=new MechRig(asset.dims);
    rig.fitPose=p=>fitRosterPose(p,heavy.has(id),id);
    for(const joint of ['wingL','wingR'] as const) rig.joints[joint].position.fromArray(fittings[joint]!.position);
    for(const pose of [POSES.standby,POSES.boost,POSES.guard,POSES.victory]) {
      rig.apply(pose);rig.root.updateMatrixWorld(true);
      for(const joint of ['wingL','wingR'] as const) {
        const sign=joint==='wingL'?1:-1;
        for(const part of asset.parts.filter(p=>p.joint===joint)) {
          const p=part.geometry.getAttribute('position');
          for(let i=0;i<p.count;i++) {
            const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(rig.joints[joint].matrixWorld);
            expect(v.x*sign,`${id} / ${joint}`).toBeGreaterThan(.05);
          }
        }
      }
    }
  }
});


// Inspect authored GLB extras independently of the runtime parser: every
// render batch needs explicit ownership for whole-part customization swaps.
const PART_TAGS = ['head','shoulders','chest','backpack','waist','hips','armL','armR','thighs','shins','feet'] as const;
const JOINT_PARTS: Record<string, readonly string[]> = {
  head:['head'], chest:['chest','backpack','head'], spine:['waist'], hips:['hips'],
  shL:['shoulders','armL'], shR:['shoulders','armR'],
  elL:['armL'], wrL:['armL'], elR:['armR'], wrR:['armR'],
  hipL:['thighs'], hipR:['thighs'], kneeL:['shins'], kneeR:['shins'],
  ankleL:['feet'], ankleR:['feet'], wingL:['backpack'], wingR:['backpack'],
  towerL:['shoulders'], towerR:['shoulders'], skirtL:['hips'], skirtR:['hips'], skirtBack:['hips'], skirtFront:['hips'],
};
type TaggedGlb = {
  nodes: {name: string; mesh?: number; extras?: {joint?: string; part?: string; slot?: string; ink_lines?: number; detail?: boolean; insignia?: string; insignia_json?: string; roster_schema?: number; model?: string}}[];
  meshes: {primitives: {mode?: number; attributes: Record<string,number>; indices?: number}[]}[];
  accessors: {count: number}[];
};
async function taggedGlb(id: string, level: number): Promise<TaggedGlb> {
  const file=id==='sunhawk'?`sunhawk-updated${level?`-lod${level}`:''}.glb`:`roster/${id}${level?`-lod${level}`:''}.glb`;
  const bytes=await readFile(new URL(`../src/client/render/mech/assets/${file}`,import.meta.url));
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
}

for(const id of [...ROSTER_IDS,'sunhawk']) describe(`${id} customization part tags`,()=>{
  it('tags every armour and ink group with its allowed joint part and exact export name',async()=>{
    let armorContract: string[]|undefined;
    for(let level=0;level<3;level++) {
      const glb=await taggedGlb(id,level), armor=new Set<string>(), lines=new Set<string>(), present=new Set<string>(), armorAttachments=new Set<string>();
      for(const node of glb.nodes.filter(n=>n.mesh!==undefined)) {
        const {joint,part,slot,ink_lines,detail,insignia}=node.extras??{};
        const context=`${id} LOD${level} ${node.name}`;
        expect(PART_TAGS,`${context}: invalid part`).toContain(part);
        expect(JOINT_PARTS[joint??''],`${context}: invalid joint`).toBeDefined();
        expect(JOINT_PARTS[joint!],`${context}: part not allowed on joint`).toContain(part);
        // The cowl/neck enclosure travels with these heads during swaps, but
        // stays fixed to the receiving torso when the inner head turns.
        if(joint==='chest'&&part==='head') expect(['maul','sobek'],context).toContain(id);
        const primitives=glb.meshes[node.mesh!].primitives;
        expect(primitives.length,context).toBeGreaterThan(0);
        const separator='/', suffix=insignia===undefined?[]:[`insignia-${insignia}`];
        const attachment=`${joint}/${part}/${insignia??''}`;
        if(insignia!==undefined) {
          expect(id,`${context}: Sunhawk format must stay unchanged`).not.toBe('sunhawk');
          expect(['chest','shoulderL','shoulderR'],context).toContain(insignia);
        }
        if(ink_lines===1) {
          expect(node.name).toBe([joint,part,'LINES',...suffix].join(separator));
          if(insignia!==undefined) expect(slot,`${context}: insignia ink paint slot`).toBe('D');
          expect(lines.has(attachment),`${context}: duplicate ink group`).toBe(false);
          lines.add(attachment);
          for(const primitive of primitives) {
            expect(primitive.mode).toBe(1);
            expect(primitive.attributes._LINE_KIND,context).toBeDefined();
            expect(glb.accessors[primitive.attributes.POSITION].count,context).toBeGreaterThan(0);
          }
        } else {
          expect(['P','S','T','K','F','D','C','G'],`${context}: invalid paint slot`).toContain(slot);
          if(!detail) expect(node.name).toBe([joint,part,slot,...suffix].join(separator));
          const key=[joint,part,slot,...suffix].join('/');
          if(!detail) {
            expect(armor.has(key),`${context}: duplicate armour group`).toBe(false);
            armor.add(key);armorAttachments.add(attachment);present.add(part!);
          }
          for(const primitive of primitives) {
            expect(primitive.mode??4).toBe(4);
            expect(glb.accessors[primitive.attributes.POSITION].count,context).toBeGreaterThan(0);
            expect(primitive.indices,context).toBeDefined();
            expect(glb.accessors[primitive.indices!].count,context).toBeGreaterThan(0);
          }
        }
      }
      expect(armor.size).toBeGreaterThan(0);
      for(const part of PART_TAGS) expect(present,`${id} LOD${level}: missing ${part}`).toContain(part);
      for(const line of lines) expect(armorAttachments.has(line),`${id}: ink without matching armour ${line}`).toBe(true);
      if(level<2) expect(lines.size).toBeGreaterThan(0);
      // Paint batches for tiny details may vanish, but no attachment/part may
      // disappear when distance switches that part independently.
      const keys=[...new Set([...armor].map(key=>key.split('/').slice(0,2).join('/')))].sort();
      if(armorContract) expect(keys,`${id}: inconsistent attachment parts across LODs`).toEqual(armorContract); else armorContract=keys;
    }
  });
});


const INSIGNIA_BADGES: Record<string, readonly {id:string; joint:string; part:string}[]> = {
  seraph:[{id:'chest',joint:'chest',part:'chest'}],
  longbow:[{id:'chest',joint:'chest',part:'chest'}],
  paladin:[{id:'chest',joint:'chest',part:'chest'}],
  kamaitachi:[{id:'chest',joint:'chest',part:'chest'},{id:'shoulderL',joint:'shL',part:'shoulders'},{id:'shoulderR',joint:'shR',part:'shoulders'}],
  fujin:[{id:'chest',joint:'chest',part:'chest'},{id:'shoulderL',joint:'shL',part:'shoulders'},{id:'shoulderR',joint:'shR',part:'shoulders'}],
  raijin:[{id:'chest',joint:'chest',part:'chest'},{id:'shoulderL',joint:'shL',part:'shoulders'},{id:'shoulderR',joint:'shR',part:'shoulders'}],
};
type InsigniaAnchor = {id:string; joint:string; part:string; center:number[]; normal:number[]; up:number[]; width:number};

async function insigniaVertices(id:string): Promise<Map<string,THREE.Vector3[]>> {
  const bytes=await readFile(new URL(`../src/client/render/mech/assets/roster/${id}.glb`,import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  const vertices=new Map<string,THREE.Vector3[]>();
  scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||typeof object.userData.insignia!=='string') return;
    const id=object.userData.insignia;
    if(!vertices.has(id)) vertices.set(id,[]);
    const position=object.geometry.getAttribute('position');
    for(let i=0;i<position.count;i++) vertices.get(id)!.push(new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld));
  });
  return vertices;
}

for(const id of ROSTER_IDS) describe(`${id} faction insignias`,()=>{
  it('isolates exactly the modelled badges and retains finite, stable replacement anchors at every LOD',async()=>{
    const expected=INSIGNIA_BADGES[id]??[],expectedIds=expected.map(b=>b.id).sort();
    const vertices=expected.length?await insigniaVertices(id):new Map<string,THREE.Vector3[]>();
    let originalJson:string|undefined;
    for(let level=0;level<3;level++) {
      const glb=await taggedGlb(id,level);
      const root=glb.nodes.find(n=>n.extras?.roster_schema===1&&n.extras.model===id);
      expect(root,`${id} LOD${level}: missing root`).toBeDefined();
      const json=root!.extras!.insignia_json;
      expect(typeof json,`${id} LOD${level}: missing insignia_json`).toBe('string');
      const anchors:InsigniaAnchor[]=JSON.parse(json!);
      expect(Array.isArray(anchors)).toBe(true);
      expect(anchors.map(a=>a.id).sort()).toEqual(expectedIds);
      if(originalJson!==undefined) expect(json,`${id}: anchors changed with LOD`).toBe(originalJson); else originalJson=json;
      const tagged=glb.nodes.filter(n=>n.mesh!==undefined&&n.extras?.insignia!==undefined);
      const armour=tagged.filter(n=>n.extras?.ink_lines!==1);
      const armourIds=[...new Set(armour.map(n=>n.extras!.insignia!))].sort();
      if(level<2) {
        expect(armourIds,`${id} LOD${level}: missing badge armour`).toEqual(expectedIds);
        const aurora=['seraph','longbow','paladin'].includes(id);
        for(const badge of expected) {
          const slots=[...new Set(armour.filter(n=>n.extras!.insignia===badge.id).map(n=>n.extras!.slot))].sort();
          // Longbow/Paladin retain their two-colour sword; reconstructed Seraph's
          // reviewed single-paint crest still remains separately replaceable.
          expect(slots,`${id} LOD${level} ${badge.id}: incomplete badge paint groups`).toEqual(aurora?(id==='seraph'?['P']:['P','T']):['G']);
          if(aurora&&level===0) {
            const ink=tagged.filter(n=>n.extras!.ink_lines===1&&n.extras!.insignia===badge.id);
            expect(ink,`${id}: missing authored badge ink`).toHaveLength(1);
            for(const primitive of glb.meshes[ink[0].mesh!].primitives) {
              const count=glb.accessors[primitive.indices??primitive.attributes.POSITION].count;
              expect(count,`${id}: empty badge ink`).toBeGreaterThan(0);
            }
          }
        }
      }
      for(const node of tagged) {
        const badge=expected.find(b=>b.id===node.extras!.insignia);
        expect(badge,`${id}: unexpected tagged design motif ${node.name}`).toBeDefined();
        expect(node.extras!.joint).toBe(badge!.joint);
        expect(node.extras!.part).toBe(badge!.part);
      }
      for(const anchor of anchors) {
        const badge=expected.find(b=>b.id===anchor.id)!;
        expect(anchor.joint).toBe(badge.joint);expect(anchor.part).toBe(badge.part);
        for(const vector of [anchor.center,anchor.normal,anchor.up]) {
          expect(Array.isArray(vector)).toBe(true);expect(vector).toHaveLength(3);
          expect(vector.every(Number.isFinite)).toBe(true);
        }
        const normal=new THREE.Vector3().fromArray(anchor.normal),up=new THREE.Vector3().fromArray(anchor.up);
        expect(normal.length()).toBeCloseTo(1,5);expect(up.length()).toBeCloseTo(1,5);
        expect(normal.dot(up)).toBeCloseTo(0,5);
        expect(normal.z,`${id} ${anchor.id}: badge normal must face outward`).toBeGreaterThan(0);
        expect(up.y,`${id} ${anchor.id}: emblem must be upright`).toBeGreaterThan(.5);
        expect(Number.isFinite(anchor.width)).toBe(true);expect(anchor.width).toBeGreaterThan(0);
        if(level===0) {
          // Measure the actual exported badge, independently of source object
          // names or the anchor builder. The replacement must cover it and be
          // centred in its tangent plane, including shoulder turbine tilt.
          const points=vertices.get(anchor.id)!;
          expect(points?.length,`${id} ${anchor.id}: no badge geometry`).toBeGreaterThan(0);
          const center=new THREE.Vector3().fromArray(anchor.center),right=new THREE.Vector3().crossVectors(up,normal);
          const projections=points.map(point=>{const delta=point.clone().sub(center);return [delta.dot(right),delta.dot(up)];});
          let span=0;
          for(const axis of [0,1]) {
            const values=projections.map(p=>p[axis]),min=Math.min(...values),max=Math.max(...values);
            expect(Math.abs((min+max)/2),`${id} ${anchor.id}: off-centre replacement`).toBeLessThan(1e-4);
            expect(Math.max(Math.abs(min),Math.abs(max)),`${id} ${anchor.id}: replacement does not cover badge`).toBeLessThanOrEqual(anchor.width/2+1e-5);
            span=Math.max(span,max-min);
          }
          expect(anchor.width,`${id} ${anchor.id}: oversized replacement`).toBeLessThan(span*1.1);
        }
      }
    }
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readRosterAsset, ROSTER_IDS, type RosterAsset } from '../src/client/render/mech/rosterAsset';
import { fitRosterPose } from '../src/client/render/mech/importedRoster';
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
      const keys=asset.parts.map(p=>`${p.joint}/${p.slot}`).sort();
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
    expect(counts[0]).toBeLessThan(45_000);
    expect(counts[1]/counts[0]).toBeLessThan(.55);
    expect(counts[2]/counts[0]).toBeLessThan(.29);
    expect((await load(id,2)).dims).toEqual((await load(id)).dims);
  });

  it('has forward dorsal plates, inward thumbs and mirrored rear-curling fingers',async()=>{
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

it('keeps the tall rear fins on their own side through boost and victory',async()=>{
  for(const id of ['razor','anubis','rampart']) {
    const asset=await load(id);
    const source=JSON.parse(await readFile(new URL(`../art/blender/roster/source/${id}.json`,import.meta.url),'utf8'));
    const rig=new MechRig(asset.dims);
    rig.fitPose=p=>fitRosterPose(p,heavy.has(id),id);
    for(const joint of ['wingL','wingR'] as const) rig.joints[joint].position.fromArray(source.joints[joint].position);
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

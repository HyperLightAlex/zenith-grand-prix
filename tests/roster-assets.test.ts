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
    // Includes the continuous internal frame and seated calf-nozzle housings.
    expect(counts[0]).toBeLessThan(50_000);
    expect(counts[1]/counts[0]).toBeLessThan(.55);
    expect(counts[2]/counts[0]).toBeLessThan(.29);
    expect((await load(id,2)).dims).toEqual((await load(id)).dims);
  });

  it('seats calf jets on the actual shin and keeps effects on the bell outlets through motion',async()=>{
    const asset=await load(id);
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const rig=new MechRig(asset.dims);
    rig.fitPose=p=>fitRosterPose(p,heavy.has(id),id);
    for(const t of asset.calfThrusters) {
      const axis=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(...t.rotation));
      expect(axis.z).toBeLessThan(-.98);
      expect(axis.y).toBeLessThanOrEqual(0);
      expect(axis.y).toBeGreaterThan(-.2);
      const outlet=new THREE.Vector3().fromArray(t.outlet);
      const base=new THREE.Vector3().fromArray(t.base);
      expect(outlet.clone().sub(base).normalize().distanceTo(axis)).toBeLessThan(1e-5);
      for(let level=0;level<3;level++) {
        const detail=await load(id,level);
        expect(detail.calfThrusters).toEqual(asset.calfThrusters);
        const meshes=detail.parts.filter(p=>p.joint===t.joint && ['P','K'].includes(p.slot)).map(p=>new THREE.Mesh(p.geometry,material));
        const ray=new THREE.Raycaster(new THREE.Vector3(0,t.surface[1],-5),new THREE.Vector3(0,0,1));
        const hit=ray.intersectObjects(meshes,false)[0];
        expect(hit,`${id} LOD${level} missing calf surface`).toBeDefined();
        expect(Math.abs(hit.point.z-t.surface[2])).toBeLessThan(.06);
        const bell=detail.parts.filter(p=>p.joint===t.joint && p.slot==='D').map(p=>new THREE.Mesh(p.geometry,material));
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

  it('has solid internal support across the waist and limb attachment seams',async()=>{
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

it('keeps the sheet-derived eye lights and Daystar fin pair bilaterally symmetric',async()=>{
  const positions=(a:RosterAsset,joint:string,slot:string)=>{
    const p=a.parts.find(p=>p.joint===joint&&p.slot===slot)!.geometry.getAttribute('position');
    return Array.from({length:p.count},(_,i)=>new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));
  };
  const mirrored=(left:THREE.Vector3[],right:THREE.Vector3[],tolerance=1e-5)=>
    left.every(p=>right.some(q=>Math.hypot(p.x+q.x,p.y-q.y,p.z-q.z)<tolerance));
  for(const id of ['razor','stinger','maul','anubis']) {
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

it('keeps the new carbine barrels aligned with the existing gameplay muzzle anchors',async()=>{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const [id,y] of [['daystar',-2.32],['stinger',-2.86]] as const) {
    for(let lod=0;lod<3;lod++) {
      const a=await load(id,lod);
      const gun=a.parts.filter(p=>p.joint==='wrR'&&p.slot==='D').map(p=>new THREE.Mesh(p.geometry,mat));
      // Existing builders author z=.46, then importedRoster seats it at
      // -.46+.18. Raycast the exported bore, not an authoring metadata label.
      const ray=new THREE.Raycaster(new THREE.Vector3(0,y-.1,-.28),new THREE.Vector3(0,1,0));
      const hit=ray.intersectObjects(gun,false)[0];
      expect(hit,`${id} LOD${lod} bore`).toBeDefined();
      expect(Math.abs(hit.point.y-y)).toBeLessThan(.025);
    }
  }
  mat.dispose();
});

it('keeps tall and swept rear fins on their own side through boost and victory',async()=>{
  for(const id of ['razor','anubis','rampart','daystar','stinger','maul']) {
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

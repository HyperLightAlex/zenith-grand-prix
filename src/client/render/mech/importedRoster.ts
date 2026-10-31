import { MechInkBuilder, type InkLines, type InsigniaId } from './ink';
import * as THREE from 'three';
import { Kit, type Slot } from './kit';
import { rosterAsset, type CalfThruster, type FittingTransform, type RosterAsset } from './rosterAsset';
import type { Livery } from '../palette';
import type { MechRig, Pose } from './rig';
import { getSunhawkPanels } from './sunhawkSelection';
import { setMechDetail } from './detail';
import { sunhawkDetailMaterial } from './sunhawkDetails';
import { markingsMaterial } from './decals';
import type { PartSlot } from '../../../custom/mechBuild';

/** Match the source Blender silhouette gains, including the attached markings. */
export const ROSTER_GAINS: Record<string,readonly [number,number,number]> = {
  daystar:[1.16,1.10,1.08],rampart:[1.05,1.04,1.03],razor:[1.18,1.14,1.09],
  stinger:[1.12,1.10,1.06],maul:[1.05,1.06,1.04],anubis:[1.22,1.16,1.12],
  horus:[1.16,1.12,1.08],sobek:[1.06,1.07,1.04],seraph:[1.20,1.16,1.09],
  longbow:[1.14,1.12,1.08],paladin:[1.05,1.06,1.04],kamaitachi:[1.20,1.16,1.10],
  fujin:[1.14,1.12,1.08],raijin:[1.05,1.06,1.04],
};
export function fitRosterPose(p: Pose, heavy: boolean, id = ''): void {
  const before=p.hips[2]+p.spine[0]+p.chest[0];
  if(p.hips[2]>0)p.hips[2]*=.92;
  if(p.spine[0]>0)p.spine[0]*=.90;
  if(p.chest[0]>0)p.chest[0]*=.90;
  const pitch=p.hips[2]+p.spine[0]+p.chest[0];
  p.head[0]+=before-pitch;
  if (['razor','anubis','rampart','daystar','stinger','maul'].includes(id)) {
    // Rear fins open outward; the old canard yaw folded the physical fins
    // across each other behind the helmet, including the shorter swept pair.
    p.wingL[2]=-Math.abs(p.wingL[2])*.65;
    p.wingR[2]=Math.abs(p.wingR[2])*.65;
    p.wingL[1]=-Math.abs(p.wingL[1])*.35;
    p.wingR[1]=Math.abs(p.wingR[1])*.35;
  }
  for(const side of [1,-1]) {
    const arm=side===1?p.shL:p.shR, elbow=side===1?p.elL:p.elR;
    const tuck=THREE.MathUtils.smoothstep(arm[0],.3,.9);
    arm[0]+=(Math.min(arm[0]*.76,Math.max(.2,1.65-pitch))-arm[0])*tuck;
    const guard=THREE.MathUtils.smoothstep(-arm[0],.5,1.1)*THREE.MathUtils.smoothstep(-elbow[0],1,1.6);
    arm[2]+=(side*Math.max(side*arm[2],heavy?.5:.34)-arm[2])*guard;
    elbow[0]*=1-guard*(heavy?.18:.1);
  }
}

/** Both the physical bell and its flame use the same Blender-authored outlet. */
export function attachRosterCalfJets(rig: MechRig, thrusters: readonly CalfThruster[]): void {
  for(const f of rig.flames.filter(f=>f.bank==='leg')) {
    const mount=thrusters.find(t=>rig.joints[t.joint]===f.mesh.parent);
    if(!mount) throw new Error('Calf flame has no matching nozzle');
    f.mesh.position.fromArray(mount.outlet);
    f.mesh.rotation.set(...mount.rotation);
  }
}

/** Retain the original effect/weapon/number anchors; only replace rigid armor. */
export function buildImportedRoster(rig: MechRig, livery: Livery, id: string, heavy: boolean): void {
  rosterAnchors(rig,id,rosterAsset(id),livery);
  // Cooler, restrained shadow paint; each faction keeps its actual palette.
  const paint={...livery,shades:{...livery.shades,frame:0x182236}};
  const joints={...rig.joints,skirtL:rig.skirts.l,skirtR:rig.skirts.r,skirtBack:rig.skirts.back,skirtFront:rig.skirts.front};
  addArmour(rig,joints,[0,1,2].map(level=>({parts:rosterAsset(id,level).parts,lines:rosterAsset(id,level).lines})),()=>paint,rosterAsset(id).ink);
  finishRoster(rig);
  rig.fitPose=p=>fitRosterPose(p,heavy,id);
  rig.root.userData.rosterModel='updated';rig.root.userData.modelId=id;
}

/**
 * A design's fittings on a rig built for it, without its armour: the calf
 * jets on its authored nozzles, the weapon, number and marking anchors
 * seated for its thicker limbs, its own moved markings, and the wrists'
 * hands and muzzle turned to its palms. (The design's code builder, run
 * without geometry, has put them there first.)
 */
export function rosterAnchors(rig: MechRig, id: string, asset: RosterAsset=rosterAsset(id), livery?: Livery): void {
  attachRosterCalfJets(rig,asset.calfThrusters);
  if(asset.sourceTextureSchema===1){nativeRosterFittings(rig,asset);if(livery)attachPreparedMarkings(rig,asset,livery);return;}
  const joints={...rig.joints,skirtL:rig.skirts.l,skirtR:rig.skirts.r,skirtBack:rig.skirts.back,skirtFront:rig.skirts.front};
  const gains=ROSTER_GAINS[id];
  for(const [name,joint] of Object.entries(joints)) {
    const gain=name.startsWith('el')?gains[0]:/^hip[LR]/.test(name)?gains[1]:name.startsWith('knee')?gains[2]:1;
    for(const child of joint.children) {
      if(child===rig.muzzle)child.position.x*=gain;
      // Direct decal planes, not bones, have an authored attachment to this surface.
      if(child instanceof THREE.Mesh && child.geometry.type==='PlaneGeometry') {
        child.position.x*=gain;
        if(Math.abs(child.rotation.y)<.2)child.scale.x*=gain;
        if(['kamaitachi','fujin','raijin'].includes(id)) {
          // The new shoulder shields/turbines occupy the old side marking
          // locations. Seat these small marks on the upper-arm armor instead.
          if(name==='shL'||name==='shR') {
            child.position.set(0,-1.0,id==='raijin'?.50:id==='fujin'?.40:.37);
            child.rotation.set(0,0,0);
            if(id==='fujin')child.scale.setScalar(.22);
          }
          if(id==='fujin' && name==='hipL') {
            child.position.set(0,-1.14,.455);
            child.rotation.set(0,0,0);
          }
          if(id==='raijin' && name==='chest' && child.position.y>.7) {
            child.position.set(0,1.24,child.userData.ownMaterial?-1.849:-1.845);
            child.scale.setScalar(child.userData.ownMaterial?.62:.72);
          }
        }
      }
    }
  }
  if(id==='fujin') {
    // Reuse the authored race-number material, keeping the actual team
    // number. The supplied sheet puts it on a centred rear panel as well.
    const source=rig.joints.shL.children.find(c=>c instanceof THREE.Mesh&&c.geometry.type==='PlaneGeometry');
    if(source instanceof THREE.Mesh) {
      const rear=source.clone();rear.position.set(0,1.15,-1.365);
      rear.rotation.set(0,Math.PI,0);rear.scale.setScalar(.45);
      rear.userData.ownMaterial=false; // The original shoulder number owns the shared material.
      rig.joints.chest.add(rear);
    }
  }
  for(const j of [rig.joints.wrL,rig.joints.wrR]) {
    for(const child of j.children) {
      if(child===rig.muzzle)child.position.z=-child.position.z+.18;
      else if(child===rig.handL || child===rig.handR)child.position.z*=-1;
    }
  }
}

/** Restore only explicitly prepared markings after native fittings clear legacy decal planes. */
export function attachPreparedMarkings(rig: MechRig, asset: Pick<RosterAsset, 'preparedMarkings'>, livery: Livery): void {
  if (!asset.preparedMarkings) return;
  const joints: Record<string, THREE.Object3D> = { ...rig.joints, skirtL: rig.skirts.l, skirtR: rig.skirts.r, skirtBack: rig.skirts.back, skirtFront: rig.skirts.front };
  for (const mark of asset.preparedMarkings) {
    const target = joints[mark.joint];
    if (!target) throw new Error(`Prepared marking has no joint ${mark.joint}`);
    const mesh = new THREE.Mesh(mark.geometry.clone(), markingsMaterial(livery, livery.darkArmour));
    mesh.position.fromArray(mark.position);
    mesh.quaternion.fromArray(mark.quaternion);
    mesh.scale.fromArray(mark.scale);
    mesh.renderOrder = mark.renderOrder;
    mesh.userData.part = mark.part;
    mesh.userData.ownMaterial = false;
    mesh.userData.preparedMarking = true;
    target.add(mesh);
  }
}

/** Keep authored exhaust size separate from nozzle dimensions; old native exports retain their exact mapping. */
export function thrusterEffectSize(t: Pick<CalfThruster,'radius'|'length'|'effectWidth'|'effectLength'>): {width:number;length:number} {
  return {width:t.effectWidth??t.radius*.72,length:t.effectLength??Math.max(.65,t.length*4)};
}

/** Native exports author the physical fittings instead of inheriting old armour offsets. */
export function nativeRosterFittings(rig: MechRig, asset: Pick<RosterAsset, 'fittings'|'mainThrusters'> & { calfThrusters?: readonly CalfThruster[] }, extraJoints: Record<string, THREE.Object3D> = {}): void {
  const joints:Record<string,THREE.Object3D>={...rig.joints,...extraJoints,skirtL:rig.skirts.l,skirtR:rig.skirts.r,skirtBack:rig.skirts.back,skirtFront:rig.skirts.front};
  const apply=(node:THREE.Object3D,f:FittingTransform)=>{
    if(f.joint)joints[f.joint].add(node);
    node.position.fromArray(f.position);
    if(f.rotation)node.rotation.set(...f.rotation);
    if(f.scale)node.scale.fromArray(f.scale);
  };
  for(const [name,f] of Object.entries(asset.fittings?.joints??{}))if(f)apply(joints[name],f);
  const anchors=asset.fittings?.anchors??{};
  let number:THREE.Object3D|undefined;
  // Old procedural badges sit on the old armour. Native insignia meshes and
  // their existing custom-team replacement system now own those locations.
  for(const joint of Object.values(joints))for(const child of [...joint.children]){
    if(!(child instanceof THREE.Mesh)||(child.geometry.type!=='PlaneGeometry'&&!child.userData.preparedMarking))continue;
    const materials=Array.isArray(child.material)?child.material:[child.material];
    if(materials.some(m=>m instanceof THREE.ShaderMaterial))continue;
    if(child.userData.ownMaterial&&anchors.raceNumber&&!number){number=child;continue;}
    child.removeFromParent();child.geometry.dispose();
    if(child.userData.ownMaterial)for(const m of materials){(m as THREE.MeshBasicMaterial).map?.dispose();m.dispose();}
  }
  const own:Record<string,THREE.Object3D|undefined>={handL:rig.handL,handR:rig.handR,muzzle:rig.muzzle,heelL:rig.heels[0],heelR:rig.heels[1],raceNumber:number};
  for(const [name,f] of Object.entries(anchors))if(f&&own[name])apply(own[name]!,f);
  if(number)number.userData.part=anchors.raceNumber?.part??'backpack';
  const unused=new Set(rig.flames.filter(f=>f.bank==='main'));
  for(const t of asset.mainThrusters??[]){
    const sign=t.id==='mainL'?1:-1;
    const f=[...unused].find(f=>Math.sign(f.mesh.position.x)===sign);
    if(!f)throw new Error(`Native roster missing ${t.id} effect`);
    unused.delete(f);joints[t.joint].add(f.mesh);f.mesh.position.fromArray(t.outlet);f.mesh.rotation.set(...t.rotation);
    // Explicit ownership avoids ambiguous overlapping chest/accessory bounds.
    // The flame's drawn card and burner remain attached to this same object.
    f.mesh.userData.part=t.part??'backpack';
    const size=thrusterEffectSize(t);f.width=size.width;f.length=size.length;
  }
  for(const f of rig.flames.filter(f=>f.bank==='leg')){
    const t=asset.calfThrusters?.find(t=>rig.joints[t.joint]===f.mesh.parent);
    if(t){const size=thrusterEffectSize(t);f.width=size.width;f.length=size.length;}
  }
}

/** A piece of imported armour (a roster design's or the Sunhawk's). */
export interface ArmourPiece { joint: string; part?: PartSlot; insignia?: InsigniaId; slot: Slot|'G'; geometry: THREE.BufferGeometry; detail?: boolean }

/**
 * Hang imported armour on a rig, level of detail by level: each joint's
 * pieces merged by the paint they wear (`paintFor`: a whole design wears one;
 * a custom mech's parts each their own), the Sunhawk's painted details on
 * their own material, and the authored ink over all of it.
 */
export function addArmour(rig: MechRig, joints: Record<string,THREE.Object3D>, levels: Array<{parts: readonly ArmourPiece[]; lines: readonly InkLines[]}>, paintFor: (p: ArmourPiece)=>Livery, ink: boolean, details?: THREE.Material): void {
  const inker=ink ? new MechInkBuilder(rig,joints) : null;
  for(const {parts,lines} of levels) {
    const kits=new Map<string,{joint:string;kit:Kit}>();
    const groups: THREE.Object3D[]=[];
    const paints=new Map<Livery,number>();
    for(const p of parts) {
      if(p.detail) {
        const mesh=new THREE.Mesh(p.geometry.clone(),details ?? sunhawkDetailMaterial());
        mesh.name=`Sunhawk details / ${p.joint}`;
        mesh.renderOrder=2;
        joints[p.joint].add(mesh);groups.push(mesh);
        continue;
      }
      const paint=paintFor(p);
      let n=paints.get(paint);
      if(n===undefined)paints.set(paint,n=paints.size);
      const key=`${p.joint}|${n}`;
      let k=kits.get(key);
      if(!k)kits.set(key,k={joint:p.joint,kit:new Kit(paint,.018,1.15,true)});
      k.kit.geometry(p.slot,p.geometry,getSunhawkPanels()?undefined:-1);
    }
    for(const {joint,kit} of kits.values()) {
      const built=kit.build(/^(el|wr|hip[LR]|knee|ankle)/.test(joint));
      joints[joint].add(built.group);groups.push(built.group);
      if(built.glow)rig.glowMeshes.push(built.glow);
    }
    inker?.addLevel(parts.filter(p=>!p.detail),lines,groups);
    rig.detailLevels.push(groups);
  }
}

/** The last of an imported design: nearest detail showing, skates on the road, its flames' end-on burners. */
export function finishRoster(rig: MechRig): void {
  setMechDetail(rig,0);
  rig.keepFeetOnRoad=true;
  for(const f of rig.flames) {
    if(f.burner)(f.burner.material as THREE.ShaderMaterial).uniforms.uSize.value=.72;
    if(f.drawn)(f.drawn.material as THREE.ShaderMaterial).uniforms.uEndOnFade.value=1;
  }
}

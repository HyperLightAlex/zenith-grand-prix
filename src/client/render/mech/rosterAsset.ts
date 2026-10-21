import { insigniaTag, partTag, readInkLines, validateOutline, type InkLines, type InsigniaId } from './ink';
import type { PartSlot } from '../../../custom/mechBuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { JOINTS, type FrameDims, type JointName } from './rig';
import type { Slot } from './kit';
import { prepareAssetGeometry } from './assetGeometry';
export type RosterJoint = JointName | 'skirtL' | 'skirtR' | 'skirtBack';
export interface RosterPart { joint: RosterJoint; part?: PartSlot; insignia?: InsigniaId; slot: Slot | 'G'; geometry: THREE.BufferGeometry }
/**
 * Where a team's emblem goes in place of a modelled insignia (the model's
 * insignia_json): on a joint, for a part, joint-local in the game's axes.
 */
export interface InsigniaAnchor {
  id: InsigniaId;
  joint: RosterJoint;
  part: PartSlot;
  /** The middle of the badge, on its surface. */
  center: [number, number, number];
  /** Out of the surface, and upright on the badge (unit vectors, at right angles). */
  normal: [number, number, number];
  up: [number, number, number];
  /** Enough to cover the badge. */
  width: number;
}
export interface CalfThruster {
  joint: 'kneeL' | 'kneeR';
  surface: [number,number,number];
  base: [number,number,number];
  outlet: [number,number,number];
  rotation: [number,number,number];
  radius: number;
  length: number;
}
export interface RosterAsset { dims: FrameDims; parts: RosterPart[]; lines: InkLines<RosterJoint>[]; ink: boolean; calfThrusters: CalfThruster[]; insignias: InsigniaAnchor[] }
export const ROSTER_IDS = ['daystar','rampart','razor','stinger','maul','anubis','horus','sobek','seraph','longbow','paladin','kamaitachi','fujin','raijin'] as const;
const urls = import.meta.glob('./assets/roster/*.glb', {eager:true,query:'?url',import:'default'}) as Record<string,string>;
const assets = new Map<string,RosterAsset>();
const DIM_KEYS: (keyof FrameDims)[] = ['hipY','hipX','hipDrop','thigh','shin','ankleY','spineY','chestY','shoulderX','shoulderY','headY','headZ','upperArm','foreArm','height'];
export function readRosterAsset(scene: THREE.Group, id: string): RosterAsset {
  let dims: FrameDims | undefined;
  let calfThrusters: CalfThruster[]=[];
  let insignias: InsigniaAnchor[]=[];
  const parts: RosterPart[]=[];
  const lines: InkLines<RosterJoint>[]=[];
  let ink=false;
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(o.userData.ink_schema===1)ink=true;
    if(o.userData.roster_schema===1 && o.userData.model===id) {
      dims={...o.userData.dims};
      calfThrusters=JSON.parse(o.userData.calf_thrusters_json ?? '[]');
      insignias=readInsignias(o.userData.insignia_json,id);
    }
    if(o instanceof THREE.LineSegments) {
      const ink=readInkLines<RosterJoint>(o,[...JOINTS,'skirtL','skirtR','skirtBack']);
      const insignia=insigniaTag(o.userData.insignia,o.name);
      lines.push(insignia ? {...ink,insignia} : ink);
      return;
    }
    if(!(o instanceof THREE.Mesh)) return;
    const {joint,slot}=o.userData;
    if(![...JOINTS,'skirtL','skirtR','skirtBack'].includes(joint) || !['P','S','T','F','K','D','C','G'].includes(slot)) throw new Error(`Invalid ${id} part ${o.name}`);
    if(!o.geometry.hasAttribute('normal')) throw new Error(`Missing ${id} normals`);
    const insignia=insigniaTag(o.userData.insignia,o.name);
    parts.push({joint,part:partTag(o.userData.part,o.name),...(insignia ? {insignia} : {}),slot,geometry:prepareAssetGeometry(o.geometry,o.matrixWorld)});
  });
  const required=JOINTS.filter(j=>j!=='wingL' && j!=='wingR');
  if(!dims || DIM_KEYS.some(k=>!Number.isFinite(dims![k]) || dims![k]<=0) || required.some(j=>!parts.some(p=>p.joint===j))) throw new Error(`Incomplete ${id} export`);
  if(calfThrusters.length!==2 || ['kneeL','kneeR'].some(j=>calfThrusters.filter(t=>t.joint===j).length!==1) || calfThrusters.some(t=>
    [t.surface,t.base,t.outlet,t.rotation].some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n))) ||
    !Number.isFinite(t.radius)||t.radius<=0||!Number.isFinite(t.length)||t.length<=0)) throw new Error(`Invalid ${id} calf thrusters`);
  if(ink)parts.filter(p=>p.slot!=='G').forEach(p=>validateOutline(p.geometry));
  return {dims,parts,calfThrusters,lines,ink,insignias};
}

/** The model's insignia anchors (none for a design with no modelled insignia, or an export from before them). */
function readInsignias(json: unknown, id: string): InsigniaAnchor[] {
  if(json===undefined) return [];
  const list=JSON.parse(String(json)) as InsigniaAnchor[];
  const vec=(v: unknown)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  const unit=(v: number[])=>Math.abs(Math.hypot(v[0],v[1],v[2])-1)<1e-3;
  if(!Array.isArray(list)) throw new Error(`Invalid ${id} insignias`);
  for(const a of list) {
    insigniaTag(a.id,`${id} insignia_json`);
    partTag(a.part,`${id} insignia_json`);
    if(![...JOINTS,'skirtL','skirtR','skirtBack'].includes(a.joint) || ![a.center,a.normal,a.up].every(vec) || !unit(a.normal) || !unit(a.up) ||
      Math.abs(a.normal[0]*a.up[0]+a.normal[1]*a.up[1]+a.normal[2]*a.up[2])>1e-3 || !Number.isFinite(a.width) || a.width<=0) throw new Error(`Invalid ${id} insignia ${a.id}`);
  }
  return list;
}
export function rosterAsset(id: string, level=0): RosterAsset {
  const asset=assets.get(`${id}:${level}`);
  if(!asset) throw new Error(`Roster asset ${id}:${level} was not preloaded`);
  return asset;
}
let loading: Promise<void> | undefined;
/** Loads every roster model, all three levels of detail. `loaded` hears of each file as it lands (the boot screen's progress). */
export function preloadRoster(loaded?: (id: string, level: number) => void): Promise<void> {
  return loading ??= Promise.all(ROSTER_IDS.flatMap(id=>[0,1,2].map(async level=>{
    const path=`./assets/roster/${id}${level?`-lod${level}`:''}.glb`;
    const url=urls[path];
    if(!url) throw new Error(`Missing roster asset ${id}:${level}`);
    const gltf=await new GLTFLoader().loadAsync(url);
    assets.set(`${id}:${level}`,readRosterAsset(gltf.scene,id));
    loaded?.(id,level);
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.LineSegments)) return;
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose();
    });
  }))).then(()=>{});
}
export const hasRosterAsset = (id: string): boolean => assets.has(`${id}:0`);

import { partTag, readInkLines, validateOutline, type InkLines } from './ink';
import type { PartSlot } from '../../../custom/mechBuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { JOINTS, type FrameDims, type JointName } from './rig';
import type { Slot } from './kit';
import { prepareAssetGeometry } from './assetGeometry';
export type RosterJoint = JointName | 'skirtL' | 'skirtR' | 'skirtBack';
export interface RosterPart { joint: RosterJoint; part?: PartSlot; slot: Slot | 'G'; geometry: THREE.BufferGeometry }
export interface CalfThruster {
  joint: 'kneeL' | 'kneeR';
  surface: [number,number,number];
  base: [number,number,number];
  outlet: [number,number,number];
  rotation: [number,number,number];
  radius: number;
  length: number;
}
export interface RosterAsset { dims: FrameDims; parts: RosterPart[]; lines: InkLines<RosterJoint>[]; ink: boolean; calfThrusters: CalfThruster[] }
export const ROSTER_IDS = ['daystar','rampart','razor','stinger','maul','anubis','horus','sobek','seraph','longbow','paladin','kamaitachi','fujin','raijin'] as const;
const urls = import.meta.glob('./assets/roster/*.glb', {eager:true,query:'?url',import:'default'}) as Record<string,string>;
const assets = new Map<string,RosterAsset>();
const DIM_KEYS: (keyof FrameDims)[] = ['hipY','hipX','hipDrop','thigh','shin','ankleY','spineY','chestY','shoulderX','shoulderY','headY','headZ','upperArm','foreArm','height'];
export function readRosterAsset(scene: THREE.Group, id: string): RosterAsset {
  let dims: FrameDims | undefined;
  let calfThrusters: CalfThruster[]=[];
  const parts: RosterPart[]=[];
  const lines: InkLines<RosterJoint>[]=[];
  let ink=false;
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(o.userData.ink_schema===1)ink=true;
    if(o.userData.roster_schema===1 && o.userData.model===id) {
      dims={...o.userData.dims};
      calfThrusters=JSON.parse(o.userData.calf_thrusters_json ?? '[]');
    }
    if(o instanceof THREE.LineSegments) { lines.push(readInkLines<RosterJoint>(o,[...JOINTS,'skirtL','skirtR','skirtBack'])); return; }
    if(!(o instanceof THREE.Mesh)) return;
    const {joint,slot}=o.userData;
    if(![...JOINTS,'skirtL','skirtR','skirtBack'].includes(joint) || !['P','S','T','F','K','D','C','G'].includes(slot)) throw new Error(`Invalid ${id} part ${o.name}`);
    if(!o.geometry.hasAttribute('normal')) throw new Error(`Missing ${id} normals`);
    parts.push({joint,part:partTag(o.userData.part,o.name),slot,geometry:prepareAssetGeometry(o.geometry,o.matrixWorld)});
  });
  const required=JOINTS.filter(j=>j!=='wingL' && j!=='wingR');
  if(!dims || DIM_KEYS.some(k=>!Number.isFinite(dims![k]) || dims![k]<=0) || required.some(j=>!parts.some(p=>p.joint===j))) throw new Error(`Incomplete ${id} export`);
  if(calfThrusters.length!==2 || ['kneeL','kneeR'].some(j=>calfThrusters.filter(t=>t.joint===j).length!==1) || calfThrusters.some(t=>
    [t.surface,t.base,t.outlet,t.rotation].some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n))) ||
    !Number.isFinite(t.radius)||t.radius<=0||!Number.isFinite(t.length)||t.length<=0)) throw new Error(`Invalid ${id} calf thrusters`);
  if(ink)parts.filter(p=>p.slot!=='G').forEach(p=>validateOutline(p.geometry));
  return {dims,parts,calfThrusters,lines,ink};
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

import { insigniaTag, partTag, readInkLines, validateOutline, type InkLines, type InsigniaId } from './ink';
import type { PartSlot } from '../../../custom/mechBuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { JOINTS, type FrameDims, type JointName } from './rig';
import type { Slot } from './kit';
import { prepareAssetGeometry } from './assetGeometry';
import { loadPreparedRosterMarkings } from './preparedMarkings';
export type RosterJoint = JointName | 'skirtL' | 'skirtR' | 'skirtBack' | 'skirtFront' | 'towerL' | 'towerR';
const rosterJoints: readonly string[] = [...JOINTS,'skirtL','skirtR','skirtBack','skirtFront','towerL','towerR'];
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
/** Art-directed exhaust dimensions, independent of the physical nozzle. */
export interface ThrusterEffectSize {
  effectWidth?: number;
  effectLength?: number;
}
export interface CalfThruster extends ThrusterEffectSize {
  joint: 'kneeL' | 'kneeR';
  surface: [number,number,number];
  base: [number,number,number];
  outlet: [number,number,number];
  rotation: [number,number,number];
  radius: number;
  length: number;
}
export interface MainThruster extends ThrusterEffectSize {
  /** The swappable module carrying the engine; old exports default to backpack. */
  part?: PartSlot;
  id: 'mainL' | 'mainR'; joint: RosterJoint; outlet: [number,number,number]; rotation: [number,number,number]; radius: number; length: number;
}
export interface FittingTransform { part?: PartSlot; joint?: RosterJoint; position: [number,number,number]; rotation?: [number,number,number]; scale?: [number,number,number] }
export interface RosterMounts {
  /** Reviewed neck stem insertion on foreign torsos; metres, not a design-pair offset. */
  headInsertion?: number;
  /** Extra helmet clearance above this receiver collar for foreign heads. */
  headClearance?: number;
  /** Receiver socket capacity for hidden donor stems; defaults to its own head engagement. */
  headCapacity?: number;
  /** Fore/aft axis of this design's hip socket and waist bearing, in joint-local metres. */
  waistAxisZ?: number;
}
export interface RosterFittings {
  /** Reviewed mixed-head Y corrections on this torso, keyed by donor design.
   * Applied after geometric seating; stock heads never use these exceptions.
   */
  headSeatOffsets?: Readonly<Record<string,number>>;
  mounts?: RosterMounts;
  joints?: Partial<Record<RosterJoint,FittingTransform>>;
  anchors?: Partial<Record<'handL'|'handR'|'muzzle'|'heelL'|'heelR'|'raceNumber',FittingTransform>>;
}
/** Opt-in, pre-reviewed decal geometry; each rig clones it and uses its team's shared sheet. */
export interface PreparedRosterMarking {
  joint: RosterJoint;
  part: PartSlot;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  renderOrder: number;
}
export interface RosterAsset { preparedMarkings?: readonly PreparedRosterMarking[]; dims: FrameDims; parts: RosterPart[]; lines: InkLines<RosterJoint>[]; ink: boolean; calfThrusters: CalfThruster[]; insignias: InsigniaAnchor[]; mainThrusters?: MainThruster[]; fittings?: RosterFittings; /** Legacy export marker for authored fittings; these models use solid paint. */ sourceTextureSchema?: number }
export const ROSTER_IDS = ['daystar','rampart','razor','stinger','maul','anubis','horus','sobek','seraph','longbow','paladin','kamaitachi','fujin','raijin'] as const;
const urls = import.meta.glob('./assets/roster/*.glb', {eager:true,query:'?url',import:'default'}) as Record<string,string>;
const assets = new Map<string,RosterAsset>();
const DIM_KEYS: (keyof Omit<FrameDims,'hipZ'>)[] = ['hipY','hipX','hipDrop','thigh','shin','ankleY','spineY','chestY','shoulderX','shoulderY','headY','headZ','upperArm','foreArm','height'];
export function readRosterAsset(scene: THREE.Group, id: string): RosterAsset {
  let dims: FrameDims | undefined;
  let calfThrusters: CalfThruster[]=[];
  let insignias: InsigniaAnchor[]=[];
  let mainThrusters: MainThruster[]|undefined, fittings: RosterFittings|undefined, sourceTextureSchema: number|undefined;
  const parts: RosterPart[]=[];
  const lines: InkLines<RosterJoint>[]=[];
  let ink=false, preparedMarkings: PreparedRosterMarking[]|undefined;
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(o.userData.ink_schema===1)ink=true;
    if(o.userData.roster_schema===1 && o.userData.model===id) {
      dims={...o.userData.dims};
      calfThrusters=JSON.parse(o.userData.calf_thrusters_json ?? '[]');
      insignias=readInsignias(o.userData.insignia_json,id);
      mainThrusters=readMainThrusters(o.userData.main_thrusters_json,id);
      fittings=readFittings(o.userData.fittings_json,id);
      sourceTextureSchema=o.userData.source_texture_schema;
      if(sourceTextureSchema!==undefined&&sourceTextureSchema!==1)throw new Error(`Unsupported ${id} authored fitting schema`);
      if(sourceTextureSchema===1 && o.userData.hybrid_markings_json!==undefined)preparedMarkings=loadPreparedRosterMarkings(id);
    }
    if(o instanceof THREE.LineSegments) {
      const ink=readInkLines<RosterJoint>(o,rosterJoints);
      if(ink.joint==='skirtFront'&&ink.part!=='hips')throw new Error(`Invalid ${id} front skirt owner ${o.name}`);
      const insignia=insigniaTag(o.userData.insignia,o.name);
      lines.push(insignia ? {...ink,insignia} : ink);
      return;
    }
    if(!(o instanceof THREE.Mesh)) return;
    const {joint,slot}=o.userData;
    if(!rosterJoints.includes(joint) || !['P','S','T','F','K','D','C','G'].includes(slot)) throw new Error(`Invalid ${id} part ${o.name}`);
    if(!o.geometry.hasAttribute('normal')) throw new Error(`Missing ${id} normals`);
    const insignia=insigniaTag(o.userData.insignia,o.name);
    if(o.userData.texture_set!==undefined)throw new Error(`Unsupported textured ${id} armour ${o.name}`);
    const part=partTag(o.userData.part,o.name);
    if(joint==='skirtFront'&&part!=='hips')throw new Error(`Invalid ${id} front skirt owner ${o.name}`);
    parts.push({joint,part,...(insignia ? {insignia} : {}),slot,
      geometry:prepareAssetGeometry(o.geometry,o.matrixWorld)});
  });
  const required=JOINTS.filter(j=>j!=='wingL' && j!=='wingR');
  if(!dims || DIM_KEYS.some(k=>!Number.isFinite(dims![k]) || (!['hipDrop','spineY','chestY','shoulderY','headY','headZ'].includes(k) && dims![k]<=0)) || required.some(j=>!parts.some(p=>p.joint===j))) throw new Error(`Incomplete ${id} export`);
  if(dims.hipZ!==undefined&&!Number.isFinite(dims.hipZ))throw new Error(`Invalid ${id} hip socket`);
  if(calfThrusters.length!==2 || ['kneeL','kneeR'].some(j=>calfThrusters.filter(t=>t.joint===j).length!==1) || calfThrusters.some(t=>
    [t.surface,t.base,t.outlet,t.rotation].some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n))) ||
    !Number.isFinite(t.radius)||t.radius<=0||!Number.isFinite(t.length)||t.length<=0)) throw new Error(`Invalid ${id} calf thrusters`);
  if(ink)parts.filter(p=>p.slot!=='G').forEach(p=>validateOutline(p.geometry));
  calfThrusters.forEach(t=>validateThrusterEffectSize(t,id));
  return {dims,parts,calfThrusters,lines,ink,insignias,...(preparedMarkings?{preparedMarkings}:{}),...(mainThrusters?{mainThrusters}:{}),...(fittings?{fittings}:{}),...(sourceTextureSchema?{sourceTextureSchema}:{})};
}

function validateThrusterEffectSize(t: ThrusterEffectSize, id: string): void {
  for (const key of ['effectWidth','effectLength'] as const) {
    const value=t[key];
    if(value!==undefined && (typeof value!=='number'||!Number.isFinite(value)||value<=0)) throw new Error(`Invalid ${id} thruster ${key}`);
  }
}

/** Optional native-model fittings; old exports retain their procedural fittings. */
function readMainThrusters(json: unknown, id: string): MainThruster[]|undefined {
  if(json===undefined)return undefined;
  const list=JSON.parse(String(json)) as MainThruster[];
  const vec=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(!Array.isArray(list)||list.length!==2||new Set(list.map(t=>t.id)).size!==2||list.some(t=>
    !['mainL','mainR'].includes(t.id)||!rosterJoints.includes(t.joint)||!vec(t.outlet)||!vec(t.rotation)||!(t.radius>0)||!(t.length>0)||!Number.isFinite(t.radius+t.length)))throw new Error(`Invalid ${id} main thrusters`);
  for(const t of list){partTag(t.part,`${id} main thruster ${t.id}`);validateThrusterEffectSize(t,id);}
  return list;
}
function readFittings(json:unknown,id:string):RosterFittings|undefined {
  if(json===undefined)return undefined;
  const fittings=JSON.parse(String(json)) as RosterFittings;
  const vec=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(!fittings||typeof fittings!=='object')throw new Error(`Invalid ${id} fittings`);
  const mounts=fittings.mounts;
  if(mounts!==undefined && (!mounts || typeof mounts!=='object' || Array.isArray(mounts) || Object.entries(mounts).some(([key,value])=>
    !['headInsertion','headClearance','headCapacity','waistAxisZ'].includes(key) || typeof value!=='number' || !Number.isFinite(value) || Math.abs(value)>2 || key!=='waistAxisZ'&&value<0)))throw new Error(`Invalid ${id} mount interfaces`);
  const headSeats=fittings.headSeatOffsets;
  if(headSeats!==undefined && (!headSeats || typeof headSeats!=='object' || Array.isArray(headSeats) || Object.entries(headSeats).some(([donor,dy])=>
    donor===id || !(['sunhawk',...ROSTER_IDS] as readonly string[]).includes(donor) || typeof dy!=='number' || !Number.isFinite(dy) || Math.abs(dy)>.25)))throw new Error(`Invalid ${id} reviewed head seats`);
  const jointNames=rosterJoints;
  for(const [name,f] of Object.entries(fittings.joints??{}))if(!jointNames.includes(name)||!f||!vec(f.position)||f.joint!==undefined&&!jointNames.includes(f.joint)||name==='skirtFront'&&f.joint!==undefined&&f.joint!=='hips'||f.rotation!==undefined&&!vec(f.rotation)||f.scale!==undefined&&!vec(f.scale))throw new Error(`Invalid ${id} fitting ${name}`);
  for(const [name,f] of Object.entries(fittings.anchors??{}))if(!['handL','handR','muzzle','heelL','heelR','raceNumber'].includes(name)||!f||!vec(f.position)||f.joint!==undefined&&!jointNames.includes(f.joint)||f.rotation!==undefined&&!vec(f.rotation)||f.scale!==undefined&&!vec(f.scale))throw new Error(`Invalid ${id} anchor ${name}`);
  for(const [name,f] of Object.entries({...fittings.joints,...fittings.anchors}))if(f)partTag(f.part,`${id} fitting ${name}`);
  return fittings;
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
    if(!rosterJoints.includes(a.joint) || ![a.center,a.normal,a.up].every(vec) || !unit(a.normal) || !unit(a.up) ||
      Math.abs(a.normal[0]*a.up[0]+a.normal[1]*a.up[1]+a.normal[2]*a.up[2])>1e-3 || !Number.isFinite(a.width) || a.width<=0) throw new Error(`Invalid ${id} insignia ${a.id}`);
  }
  return list;
}
export function rosterAsset(id: string, level=0): RosterAsset {
  const asset=assets.get(`${id}:${level}`);
  if(!asset) throw new Error(`Roster asset ${id}:${level} was not preloaded`);
  return asset;
}
/** Install three already-validated asset levels; also used by headless integration tests. */
export function registerRosterAssets(id: string, levels: readonly RosterAsset[]): void {
  if (!(ROSTER_IDS as readonly string[]).includes(id) || levels.length !== 3) throw new Error(`Invalid roster asset levels for ${id}`);
  levels.forEach((asset, level) => assets.set(`${id}:${level}`, asset));
}
let loading: Promise<void> | undefined;
/** Loads every roster model, all three levels of detail. `loaded` hears of each file as it lands (the boot screen's progress). */
export function preloadRoster(loaded?: (id: string, level: number) => void): Promise<void> {
  return loading ??= Promise.all(ROSTER_IDS.flatMap(id=>[0,1,2].map(async level=>{
    const path=`./assets/roster/${id}${level?`-lod${level}`:''}.glb`;
    const url=urls[path];
    if(!url) throw new Error(`Missing roster asset ${id}:${level}`);
    const gltf=await new GLTFLoader().loadAsync(url);
    const asset=readRosterAsset(gltf.scene,id);
    assets.set(`${id}:${level}`,asset);
    loaded?.(id,level);
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.LineSegments)) return;
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose();
    });
  }))).then(()=>{});
}
export const hasRosterAsset = (id: string): boolean => assets.has(`${id}:0`);

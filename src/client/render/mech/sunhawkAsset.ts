import { partTag, readInkLines, validateOutline, type InkLines } from './ink';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import currentUrl from './assets/sunhawk-current.glb?url';
import updatedUrl from './assets/sunhawk-updated.glb?url';
import mediumUrl from './assets/sunhawk-updated-lod1.glb?url';
import farUrl from './assets/sunhawk-updated-lod2.glb?url';
import { preloadSunhawkDetails } from './sunhawkDetails';
import { JOINTS, type FrameDims, type JointName } from './rig';
import type { SunhawkAssetVariant } from './sunhawkSelection';
import { prepareAssetGeometry } from './assetGeometry';
import { readRosterAsset, type RosterAsset, type RosterPart } from './rosterAsset';

export type AssetJoint = JointName | 'skirtL' | 'skirtR' | 'skirtBack' | 'skirtFront' | 'towerL' | 'towerR';
export interface SunhawkPart extends RosterPart { joint: AssetJoint; detail: boolean }
export interface SunhawkAsset extends Partial<Pick<RosterAsset, 'calfThrusters'|'mainThrusters'|'fittings'|'sourceTextureSchema'|'insignias'>> { dims: FrameDims; parts: SunhawkPart[]; lines: InkLines<AssetJoint>[]; ink: boolean }
const assets = new Map<string, SunhawkAsset>();
const dimensions: Array<keyof Omit<FrameDims,'hipZ'>> = ['hipY','hipX','hipDrop','thigh','shin','ankleY','spineY','chestY','shoulderX','shoulderY','headY','headZ','upperArm','foreArm','height'];
const jointNames: readonly string[] = [...JOINTS, 'skirtL', 'skirtR', 'skirtBack', 'skirtFront', 'towerL', 'towerR'];

/** Validate the export contract before any race or garage uses the asset. */
export function readSunhawkAsset(scene: THREE.Group, variant: SunhawkAssetVariant): SunhawkAsset {
  let native = false;
  scene.traverse(o => { if (o.userData.roster_schema === 1 && o.userData.model === 'sunhawk' && o.userData.source_texture_schema === 1) native = true; });
  if (native) {
    const asset = readRosterAsset(scene, 'sunhawk');
    return { ...asset, parts: asset.parts.map(p => ({ ...p, detail: false })) };
  }
  let dims: FrameDims | undefined;
  const parts: SunhawkPart[] = [];
  const lines: InkLines<AssetJoint>[]=[];
  let ink=false;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if(o.userData.ink_schema===1)ink=true;
    if (o.userData.sunhawk_schema === 1 && o.userData.variant === variant) {
      const d = o.userData.dims as FrameDims | undefined;
      if (!d || dimensions.some((k) => !Number.isFinite(d[k]) || (!['hipDrop','spineY','chestY','shoulderY','headY','headZ'].includes(k) && d[k] < 0))) throw new Error(`Invalid ${variant} Sunhawk dimensions`);
      if(d.hipZ!==undefined&&!Number.isFinite(d.hipZ))throw new Error(`Invalid ${variant} Sunhawk hip socket`);
      dims = { ...d };
    }
    if(o instanceof THREE.LineSegments) {
      const line=readInkLines<AssetJoint>(o,jointNames);
      if(line.joint==='skirtFront'&&line.part!=='hips')throw new Error(`Invalid Sunhawk front skirt owner ${o.name}`);
      lines.push(line); return;
    }
    if (!(o instanceof THREE.Mesh)) return;
    const { joint, slot } = o.userData;
    if (!jointNames.includes(joint) || !['P','S','T','F','K','D','C','G'].includes(slot)) throw new Error(`Invalid Sunhawk part ${o.name}`);
    if (!o.geometry.hasAttribute('normal')) throw new Error(`Missing authored normals on ${o.name}`);
    // The export contains joint-local meshes; transport transforms are baked once.
    const detail = o.userData.detail === true;
    const geometry = prepareAssetGeometry(o.geometry, o.matrixWorld, detail);
    if (detail && !geometry.hasAttribute('uv')) throw new Error(`Missing detail UVs on ${o.name}`);
    const part=partTag(o.userData.part,o.name);
    if(joint==='skirtFront'&&part!=='hips')throw new Error(`Invalid Sunhawk front skirt owner ${o.name}`);
    parts.push({ joint, part, slot, geometry, detail });
  });
  if (!dims || jointNames.filter(j=>j!=='skirtFront').some((j) => !parts.some((p) => p.joint === j))) throw new Error(`Incomplete ${variant} Sunhawk export`);
  if(ink)parts.filter(p=>p.slot!=='G'&&!p.detail).forEach(p=>validateOutline(p.geometry));
  return { dims, parts, lines, ink };
}

let loading: Promise<void> | undefined;
/**
 * The files preloadSunhawks loads: the updated design's three levels of
 * detail and the detail atlas, and the earlier design ('current', only for
 * comparing the two) when asked for.
 */
export const sunhawkFiles = (comparison: boolean): number => (comparison ? 5 : 4);

/**
 * Loads the Sunhawk and the detail atlas, and with `comparison` the earlier
 * design too (?sunhawk=current, or art review, where B switches between
 * them). `loaded` hears of each file as it lands (the boot screen's progress).
 */
export function preloadSunhawks(loaded?: () => void, comparison = false): Promise<void> {
  const exports: Array<[SunhawkAssetVariant, number, string]> = [['updated',0,updatedUrl],['updated',1,mediumUrl],['updated',2,farUrl]];
  if (comparison) exports.unshift(['current',0,currentUrl]);
  return loading ??= Promise.all([preloadSunhawkDetails().then(() => loaded?.()), ...exports.map(async ([variant, level, url]) => {
    const gltf = await new GLTFLoader().loadAsync(url);
    const asset = readSunhawkAsset(gltf.scene, variant);
    assets.set(`${variant}:${level}`, asset);
    loaded?.();
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.LineSegments)) return;
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) material.dispose();
    });
  })]).then(() => {});
}
/** Whether a design of the Sunhawk was loaded (the earlier one is only for comparisons). */
export const hasSunhawkAsset = (variant: SunhawkAssetVariant): boolean => assets.has(`${variant}:0`);
export function sunhawkAsset(variant: SunhawkAssetVariant, level = 0): SunhawkAsset {
  const asset = assets.get(`${variant}:${level}`);
  if (!asset) throw new Error('Sunhawk assets must load before constructing a frame');
  return asset;
}

/** Install the three validated updated-Sunhawk levels for runtime integration tests. */
export function registerSunhawkAssets(levels: readonly SunhawkAsset[]): void {
  if (levels.length !== 3) throw new Error('Invalid Sunhawk asset levels');
  levels.forEach((asset, level) => assets.set(`updated:${level}`, asset));
}

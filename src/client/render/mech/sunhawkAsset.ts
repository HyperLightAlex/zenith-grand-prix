import { partTag, readInkLines, validateOutline, type InkLines } from './ink';
import type { PartSlot } from '../../../custom/mechBuild';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import currentUrl from './assets/sunhawk-current.glb?url';
import updatedUrl from './assets/sunhawk-updated.glb?url';
import mediumUrl from './assets/sunhawk-updated-lod1.glb?url';
import farUrl from './assets/sunhawk-updated-lod2.glb?url';
import { preloadSunhawkDetails } from './sunhawkDetails';
import { JOINTS, type FrameDims, type JointName } from './rig';
import type { Slot } from './kit';
import type { SunhawkAssetVariant } from './sunhawkSelection';
import { prepareAssetGeometry } from './assetGeometry';

export type AssetJoint = JointName | 'skirtL' | 'skirtR' | 'skirtBack' | 'towerL' | 'towerR';
export interface SunhawkPart { joint: AssetJoint; part?: PartSlot; slot: Slot | 'G'; geometry: THREE.BufferGeometry; detail: boolean }
export interface SunhawkAsset { dims: FrameDims; parts: SunhawkPart[]; lines: InkLines<AssetJoint>[]; ink: boolean }
const assets = new Map<string, SunhawkAsset>();
const dimensions: Array<keyof FrameDims> = ['hipY','hipX','hipDrop','thigh','shin','ankleY','spineY','chestY','shoulderX','shoulderY','headY','headZ','upperArm','foreArm','height'];
const jointNames: readonly string[] = [...JOINTS, 'skirtL', 'skirtR', 'skirtBack', 'towerL', 'towerR'];

/** Validate the export contract before any race or garage uses the asset. */
export function readSunhawkAsset(scene: THREE.Group, variant: SunhawkAssetVariant): SunhawkAsset {
  let dims: FrameDims | undefined;
  const parts: SunhawkPart[] = [];
  const lines: InkLines<AssetJoint>[]=[];
  let ink=false;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if(o.userData.ink_schema===1)ink=true;
    if (o.userData.sunhawk_schema === 1 && o.userData.variant === variant) {
      const d = o.userData.dims as FrameDims | undefined;
      if (!d || dimensions.some((k) => !Number.isFinite(d[k]) || d[k] < 0)) throw new Error(`Invalid ${variant} Sunhawk dimensions`);
      dims = { ...d };
    }
    if(o instanceof THREE.LineSegments) { lines.push(readInkLines<AssetJoint>(o,jointNames)); return; }
    if (!(o instanceof THREE.Mesh)) return;
    const { joint, slot } = o.userData;
    if (!jointNames.includes(joint) || !['P','S','T','F','K','D','C','G'].includes(slot)) throw new Error(`Invalid Sunhawk part ${o.name}`);
    if (!o.geometry.hasAttribute('normal')) throw new Error(`Missing authored normals on ${o.name}`);
    // The export contains joint-local meshes; transport transforms are baked once.
    const detail = o.userData.detail === true;
    const geometry = prepareAssetGeometry(o.geometry, o.matrixWorld, detail);
    if (detail && !geometry.hasAttribute('uv')) throw new Error(`Missing detail UVs on ${o.name}`);
    parts.push({ joint, part: partTag(o.userData.part, o.name), slot, geometry, detail });
  });
  if (!dims || jointNames.some((j) => !parts.some((p) => p.joint === j))) throw new Error(`Incomplete ${variant} Sunhawk export`);
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
    assets.set(`${variant}:${level}`, readSunhawkAsset(gltf.scene, variant));
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

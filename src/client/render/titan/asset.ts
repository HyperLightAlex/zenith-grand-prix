// The fallen titan's Blender model (art/blender/titan/README.txt), when it is
// in: titan.glb with titan-lod1.glb and titan-lod2.glb beside it in
// ./assets, in the game's axes, posed and fitted to the road. Each mesh is one
// part of the titan (its rig's bone, from its node's `part` extra or its name,
// titan/<part>/...) in one of ten material slots, by the material's name.
// Until it is in, Titan's Rest shows the placeholder (placeholder.ts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Track } from '../../../sim/track';
import { titanGround, type TitanGround } from './placeholder';
import { readTitanLevel, topGridHeights, type TitanAsset, type TitanPartGeometry, type TitanSlot, type TitanTopGrid } from './read';

export { readTitanLevel, slotOf, TITAN_SLOTS, type TitanAsset, type TitanPartGeometry, type TitanSlot } from './read';

// Only the model's own levels: the blockout and anything else beside them are not built in.
const urls = import.meta.glob(['./assets/titan.glb', './assets/titan-lod1.glb', './assets/titan-lod2.glb'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Whether the model is in the build at all. */
export const hasTitanModel = (): boolean => './assets/titan.glb' in urls;

// The model's top from above (tools/titan/top.ts), small enough to build in.
const tops = import.meta.glob('./assets/titan-top.json', { eager: true, import: 'default' }) as Record<string, TitanTopGrid>;

const grounds = new WeakMap<Track, TitanGround | null>();
/**
 * Where the titan is from above, for the road's supports to stand on and the
 * scenery to keep off: the model's own top when it is in the build, the
 * placeholder's otherwise (and on any other track, null).
 */
export function titanGroundOf(track: Track): TitanGround | null {
  if (grounds.has(track)) return grounds.get(track)!;
  const grid = tops['./assets/titan-top.json'];
  let g: TitanGround | null;
  if (track.def.id !== 'titan' || !hasTitanModel() || !grid) g = titanGround(track);
  else {
    const h = topGridHeights(grid);
    const at = (a: number, b: number) => (a < 0 || b < 0 || a >= grid.nx || b >= grid.nz || h[b * grid.nx + a] === -32768 ? -Infinity : h[b * grid.nx + a] / 10);
    g = {
      topAt: (x, z) => at(Math.floor((x - grid.x0) / grid.cell), Math.floor((z - grid.z0) / grid.cell)),
      minX: grid.x0,
      maxX: grid.x0 + grid.nx * grid.cell,
      minZ: grid.z0,
      maxZ: grid.z0 + grid.nz * grid.cell,
    };
  }
  grounds.set(track, g);
  return g;
}

let loading: Promise<TitanAsset | null> | undefined;
/** Load the model's levels of detail, or null if it is not in the build. */
export function loadTitan(): Promise<TitanAsset | null> {
  return (loading ??= (async () => {
    if (!hasTitanModel()) return null;
    const files = ['./assets/titan.glb', './assets/titan-lod1.glb', './assets/titan-lod2.glb'].filter((p) => p in urls);
    const levels = await Promise.all(files.map(async (p) => readTitanLevel((await new GLTFLoader().loadAsync(urls[p])).scene)));
    const parts = new Map<string, TitanPartGeometry[]>();
    for (const level of levels) {
      for (const [part, geo] of level) {
        let list = parts.get(part);
        if (!list) parts.set(part, (list = []));
        list.push(geo);
      }
    }
    return { parts };
  })());
}

/**
 * The model as scenery: one LOD per part, each level a mesh per slot in the
 * given materials. A part switches to its next level further off the bigger
 * it is.
 */
export function titanModel(asset: TitanAsset, material: (slot: TitanSlot) => THREE.Material, onMesh?: (mesh: THREE.Mesh, slot: TitanSlot) => void): THREE.Group {
  const group = new THREE.Group();
  group.name = 'titan';
  for (const [part, levels] of asset.parts) {
    const lod = new THREE.LOD();
    lod.name = `titan/${part}`;
    // Centre the LOD on the part, so its distance is measured from the part itself.
    const box = new THREE.Box3();
    for (const g of Object.values(levels[0])) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    lod.position.copy(centre);
    levels.forEach((level, k) => {
      const holder = new THREE.Group();
      for (const slot of Object.keys(level) as TitanSlot[]) {
        const g = level[slot]!.clone();
        g.translate(-centre.x, -centre.y, -centre.z);
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, material(slot));
        mesh.name = `titan/${part}/${slot}`;
        holder.add(mesh);
        onMesh?.(mesh, slot);
      }
      lod.addLevel(holder, k === 0 ? 0 : k === 1 ? radius * 1.5 + 400 : radius * 4 + 1200);
    });
    group.add(lod);
  }
  return group;
}

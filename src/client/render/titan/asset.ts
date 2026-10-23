// The fallen titan's Blender model (art/blender/titan/README.txt), when it is
// in: titan.glb with titan-lod1.glb and titan-lod2.glb beside it in
// ./assets, in the game's axes, posed and fitted to the road. Each mesh is one
// part of the titan (its rig's bone, from its node's `part` extra or its name,
// titan/<part>/...) in one of ten material slots, by the material's name.
// Until it is in, Titan's Rest shows the placeholder (placeholder.ts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** The model's material slots, by name. */
export const TITAN_SLOTS = ['armour', 'red', 'slate', 'gold', 'frame', 'verdigris', 'visor', 'jewel', 'blade', 'edge'] as const;
export type TitanSlot = (typeof TITAN_SLOTS)[number];

/** One part at one level of detail: its geometry in each slot, in world space. */
export type TitanPartGeometry = Partial<Record<TitanSlot, THREE.BufferGeometry>>;
export interface TitanAsset {
  /** part -> one entry per level of detail, finest first. */
  parts: Map<string, TitanPartGeometry[]>;
}

const urls = import.meta.glob('./assets/titan*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Whether the model is in the build at all. */
export const hasTitanModel = (): boolean => './assets/titan.glb' in urls;

/** The part a mesh belongs to: its node's (or a parent's) `part` extra, or titan/<part>/... in its name. */
function partOf(o: THREE.Object3D): string {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (typeof p.userData.part === 'string') return p.userData.part;
    const m = /^titan\/([^/]+)/.exec(p.name);
    if (m) return m[1];
  }
  return 'body';
}

/** The slot a material is, from its name: exactly, or its first word (Blender's .001 suffixes and the like dropped). */
export function slotOf(name: string): TitanSlot | null {
  const n = name.toLowerCase().replace(/[.\s_-]\d+$/, '');
  return (TITAN_SLOTS as readonly string[]).includes(n) ? (n as TitanSlot) : null;
}

/** Read one exported level: every mesh's geometry, in world space, grouped by part and slot. */
export function readTitanLevel(scene: THREE.Object3D): Map<string, TitanPartGeometry> {
  scene.updateMatrixWorld(true);
  const lists = new Map<string, Partial<Record<TitanSlot, THREE.BufferGeometry[]>>>();
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const part = partOf(o);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const groups = o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count, materialIndex: 0 }];
    for (const grp of groups) {
      const slot = slotOf(mats[grp.materialIndex ?? 0]?.name ?? '') ?? 'armour';
      const g = sliceTriangles(o.geometry, grp.start, grp.count);
      g.applyMatrix4(o.matrixWorld);
      let byPart = lists.get(part);
      if (!byPart) lists.set(part, (byPart = {}));
      (byPart[slot] ??= []).push(g);
    }
  });
  const out = new Map<string, TitanPartGeometry>();
  for (const [part, bySlot] of lists) {
    const merged: TitanPartGeometry = {};
    for (const slot of Object.keys(bySlot) as TitanSlot[]) merged[slot] = mergeTriangles(bySlot[slot]!);
    out.set(part, merged);
  }
  return out;
}

/** Triangles [start, start + count) of a geometry's index (or vertices), as their own non-indexed geometry with positions and normals. */
function sliceTriangles(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const idx = g.index;
  const P = new Float32Array(count * 3);
  const N = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const v = idx ? idx.getX(start + k) : start + k;
    P[k * 3] = pos.getX(v);
    P[k * 3 + 1] = pos.getY(v);
    P[k * 3 + 2] = pos.getZ(v);
    if (nor) {
      N[k * 3] = nor.getX(v);
      N[k * 3 + 1] = nor.getY(v);
      N[k * 3 + 2] = nor.getZ(v);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (!nor) out.computeVertexNormals();
  return out;
}

function mergeTriangles(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (gs.length === 1) return gs[0];
  const n = gs.reduce((a, g) => a + g.attributes.position.count, 0);
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  let o = 0;
  for (const g of gs) {
    P.set(g.attributes.position.array as Float32Array, o);
    N.set(g.attributes.normal.array as Float32Array, o);
    o += g.attributes.position.count * 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
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

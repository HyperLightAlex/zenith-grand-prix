// Reading the fallen titan's Blender model (art/blender/titan/README.txt):
// each mesh is one part of the titan (its rig's bone, from its node's `part`
// extra or its name, titan/<part>/...) in one of ten material slots, by the
// material's name. Apart from asset.ts so tools can use it outside Vite.
import * as THREE from 'three';

/** The model's material slots, by name. */
export const TITAN_SLOTS = ['armour', 'red', 'slate', 'gold', 'frame', 'verdigris', 'visor', 'jewel', 'blade', 'edge'] as const;
export type TitanSlot = (typeof TITAN_SLOTS)[number];

/** One part at one level of detail: its geometry in each slot, in world space. */
export type TitanPartGeometry = Partial<Record<TitanSlot, THREE.BufferGeometry>>;
export interface TitanAsset {
  /** part -> one entry per level of detail, finest first. */
  parts: Map<string, TitanPartGeometry[]>;
}

/** The part a mesh belongs to: its node's (or a parent's) `part` (or `titan_part`) extra, or titan/<part>/... in its name. */
function partOf(o: THREE.Object3D): string {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (typeof p.userData.part === 'string') return p.userData.part;
    if (typeof p.userData.titan_part === 'string') return p.userData.titan_part;
    // three takes the slashes out of node names; the exporter keeps the original in extras.
    const m = /^titan\/([^/]+)/.exec(typeof p.userData.name === 'string' ? p.userData.name : p.name);
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


/**
 * The model's top from above, for the road's supports to stand on and the
 * scenery to keep off: the highest point of its surface in each `cell`-unit
 * square (parts more than 5 under the sand left out), as decimetres in a
 * grid, -32768 where it is not. Made from titan.glb by tools/titan/top.ts
 * into assets/titan-top.json; the tests check the two agree.
 */
export interface TitanTopGrid {
  cell: number;
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** nx * nz Int16 decimetres, x fastest, base64. */
  dm: string;
}

export function titanTopGrid(level: Map<string, TitanPartGeometry>, cell = 10): TitanTopGrid {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const geo of level.values()) {
    for (const g of Object.values(geo)) {
      const p = g!.attributes.position.array as Float32Array;
      for (let k = 0; k < p.length; k += 3) {
        if (p[k + 1] < -5) continue;
        x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]);
        z0 = Math.min(z0, p[k + 2]); z1 = Math.max(z1, p[k + 2]);
      }
    }
  }
  x0 = Math.floor(x0 / cell) * cell;
  z0 = Math.floor(z0 / cell) * cell;
  const nx = Math.floor((x1 - x0) / cell) + 1;
  const nz = Math.floor((z1 - z0) / cell) + 1;
  const top = new Int16Array(nx * nz).fill(-32768);
  const put = (x: number, y: number, z: number) => {
    if (y < -5) return;
    const a = Math.floor((x - x0) / cell);
    const b = Math.floor((z - z0) / cell);
    if (a < 0 || b < 0 || a >= nx || b >= nz) return;
    const v = Math.round(y * 10);
    if (v > top[b * nx + a]) top[b * nx + a] = v;
  };
  const step = cell * 0.5;
  for (const geo of level.values()) {
    for (const g of Object.values(geo)) {
      const p = g!.attributes.position.array as Float32Array;
      for (let k = 0; k + 8 < p.length; k += 9) {
        const ax = p[k], ay = p[k + 1], az = p[k + 2];
        const bx = p[k + 3] - ax, by = p[k + 4] - ay, bz = p[k + 5] - az;
        const cx = p[k + 6] - ax, cy = p[k + 7] - ay, cz = p[k + 8] - az;
        const n = Math.max(1, Math.min(64, Math.ceil(Math.max(Math.hypot(bx, bz), Math.hypot(cx, cz), Math.hypot(cx - bx, cz - bz)) / step)));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) put(ax + bx * (i / n) + cx * (j / n), ay + by * (i / n) + cy * (j / n), az + bz * (i / n) + cz * (j / n));
      }
    }
  }
  const bytes = new Uint8Array(top.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { cell, x0, z0, nx, nz, dm: btoa(bin) };
}

/** The grid's heights back (decimetres, -32768 where the titan is not). */
export function topGridHeights(grid: TitanTopGrid): Int16Array {
  const bin = atob(grid.dm);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// Derive a checked seating snapshot from the shipped head/chest geometry.
// Native assets use nativeMounts.ts directly at runtime, including their authored
// neck interfaces and reviewed exceptions. This independent full-grid sampler
// verifies that policy against all same-frame pairs; HEAD_SEATS remains the
// fallback for legacy-only pairs and an inspectable generated diagnostic.
//
//   npx tsx tools/head-seats.ts            (write the table and print a report)
//   npx tsx tools/head-seats.ts --check    (verify the checked-in snapshot)

import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareAssetGeometry } from '../src/client/render/mech/assetGeometry';
import { nativeHeadSeat, type HeadSeatAsset } from '../src/client/render/mech/nativeMounts';
import type { RosterFittings } from '../src/client/render/mech/rosterAsset';

const FRAMES = [
  ['sunhawk', 'razor', 'anubis', 'seraph', 'kamaitachi'],
  ['daystar', 'stinger', 'horus', 'longbow', 'fujin'],
  ['rampart', 'maul', 'sobek', 'paladin', 'raijin'],
];
const OUT = new URL('../src/client/render/mech/headSeats.ts', import.meta.url);
/** A chest's top is below this far over the neck's pivot (what is higher arches over the head: Maul's hood). */
const CAP = 0.6;
/** The neck: how far across and along from under the head's pivot (metres). */
const NECK = 0.3;

interface Design {
  native: boolean;
  asset: HeadSeatAsset;
  headY: number;
  headZ: number;
  /** Triangles, nine numbers each: the chest in the chest joint's space, the head in the head joint's. */
  chest: Float32Array;
  head: Float32Array;
}

async function load(id: string): Promise<Design> {
  const path = id === 'sunhawk' ? '../src/client/render/mech/assets/sunhawk-updated.glb' : `../src/client/render/mech/assets/roster/${id}.glb`;
  const bytes = await readFile(new URL(path, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  scene.updateMatrixWorld(true);
  let dims: { headY: number; headZ: number } | undefined;
  let native = false, fittings: RosterFittings | undefined;
  const parts: HeadSeatAsset['parts'][number][] = [];
  const chest: number[] = [];
  const head: number[] = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (o.userData.dims) dims ??= o.userData.dims;
    if (o.userData.roster_schema === 1 && o.userData.model === id) {
      native = o.userData.source_texture_schema === 1;
      fittings = o.userData.fittings_json === undefined ? undefined : JSON.parse(o.userData.fittings_json);
    }
    if (!(o instanceof THREE.Mesh)) return;
    parts.push({ joint:o.userData.joint, part:o.userData.part, geometry:prepareAssetGeometry(o.geometry,o.matrixWorld) });
    const into = o.userData.joint === 'chest' && o.userData.part === 'chest' ? chest : o.userData.joint === 'head' && o.userData.part === 'head' ? head : null;
    if (!into) return;
    const g = o.geometry as THREE.BufferGeometry;
    const p = g.getAttribute('position');
    const n = g.index ? g.index.count : p.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, g.index ? g.index.getX(i) : i).applyMatrix4(o.matrixWorld);
      into.push(v.x, v.y, v.z);
    }
  });
  if (!dims || !chest.length || !head.length) throw new Error(`${id}: no chest, head or skeleton`);
  return { native, asset:{ dims, fittings, parts }, headY: dims.headY, headZ: dims.headZ, chest: new Float32Array(chest), head: new Float32Array(head) };
}

// ---- height maps from above and below, cell by cell (x across, z along) ---------
const CELL = 0.02;
const X0 = -2;
const X1 = 2;
const Z0 = -2;
const Z1 = 3;
const NX = Math.round((X1 - X0) / CELL);
const NZ = Math.round((Z1 - Z0) / CELL);

/**
 * For each cell, the highest point of the triangles (`up`) under `cap`, or
 * the lowest, after moving them by (0, dy, dz). NaN where there is none.
 */
function heights(tris: Float32Array, up: boolean, dy: number, dz: number, cap = Infinity): Float32Array {
  const out = new Float32Array(NX * NZ).fill(NaN);
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1] + dy, az = tris[t + 2] + dz;
    const bx = tris[t + 3], by = tris[t + 4] + dy, bz = tris[t + 5] + dz;
    const cx = tris[t + 6], cy = tris[t + 7] + dy, cz = tris[t + 8] + dz;
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - X0) / CELL));
    const i1 = Math.min(NX - 1, Math.floor((Math.max(ax, bx, cx) - X0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - Z0) / CELL));
    const j1 = Math.min(NZ - 1, Math.floor((Math.max(az, bz, cz) - Z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      const pz = Z0 + (j + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        const px = X0 + (i + 0.5) * CELL;
        const w0 = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / area;
        const w1 = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const y = w0 * ay + w1 * by + w2 * cy;
        if (up && y > cap) continue;
        const at = j * NX + i;
        const was = out[at];
        if (Number.isNaN(was) || (up ? y > was : y < was)) out[at] = y;
      }
    }
  }
  return out;
}

/**
 * How far a head, hung from a chest's neck, is sunk below where its neck would
 * first touch the chest's top coming down. Only the neck counts (what is
 * under the head's pivot, NECK across and along): a head's sides may hang
 * lower (Anubis's headdress), and resting on them would hold its neck clear
 * of the chest.
 */
function sunk(chest: Design, head: Design): number {
  const top = heights(chest.chest, true, 0, 0, chest.headY + CAP);
  const bottom = heights(head.head, false, chest.headY, chest.headZ);
  let most = -Infinity;
  for (let j = 0; j < NZ; j++) {
    const z = Z0 + (j + 0.5) * CELL;
    if (Math.abs(z - chest.headZ) > NECK) continue;
    for (let i = 0; i < NX; i++) {
      const x = X0 + (i + 0.5) * CELL;
      if (Math.abs(x) > NECK) continue;
      const at = j * NX + i;
      if (!Number.isNaN(top[at]) && !Number.isNaN(bottom[at])) most = Math.max(most, top[at] - bottom[at]);
    }
  }
  if (!Number.isFinite(most)) throw new Error('a head with no chest under it');
  return most;
}

const designs = new Map<string, Design>();
for (const id of FRAMES.flat()) designs.set(id, await load(id));
/** How deep each design's head sits in its own chest. */
const own = new Map([...designs].map(([id, d]) => [id, sunk(d, d)]));

const table: Record<string, Record<string, number>> = {};
let nativePairs = 0;
const report: string[] = [`each head in its own chest: ${[...own].map(([id, s]) => `${id} ${s.toFixed(2)}`).join(', ')}`];
for (const frame of FRAMES) {
  for (const c of frame) {
    table[c] = {};
    for (const h of frame) {
      const chest = designs.get(c)!, head = designs.get(h)!;
      const native = chest.native || head.native;
      if (h === c) {
        if (native) {
          if (nativeHeadSeat(chest.asset,head.asset) !== 0) throw new Error(`${c}: stock head was displaced`);
          nativePairs++;
        }
        continue;
      }
      const now = sunk(chest,head);
      const cm = native ? chest.asset.fittings?.mounts : undefined;
      const hm = native ? head.asset.fittings?.mounts : undefined;
      const want = Math.min(hm?.headInsertion ?? own.get(h)!, (cm?.headCapacity ?? own.get(c)!) - (cm?.headClearance ?? 0));
      const correction = native ? chest.asset.fittings?.headSeatOffsets?.[h] ?? 0 : 0;
      const dy = Math.round((now - want) * 50) / 50 + correction;
      if (native) {
        const measured = nativeHeadSeat(chest.asset,head.asset);
        if (measured === undefined || Math.abs(measured + correction - dy) > 1e-8) {
          throw new Error(`${c}/${h}: independent head seating ${dy} differs from runtime ${measured} + reviewed ${correction}`);
        }
        nativePairs++;
      }
      if (dy !== 0) table[c][h] = dy;
      report.push(`${c.padEnd(10)} ${h.padEnd(10)} ${(dy >= 0 ? '+' : '') + dy.toFixed(2)}  (sunk ${now.toFixed(2)}, to ${want.toFixed(2)})`);
    }
  }
}

const lines = Object.entries(table)
  .filter(([, row]) => Object.keys(row).length)
  .map(([c, row]) => `  ${c}: { ${Object.entries(row).map(([h, dy]) => `${h}: ${dy}`).join(', ')} },`);
const text = `// Written by tools/head-seats.ts: do not edit by hand (run it again instead).
//
// Shipped geometry's seating snapshot: metres up, by chest then donor head.
// Includes authored neck interfaces and reviewed pair corrections. Native
// assets use nativeMounts.ts directly; the generator independently verifies
// every native pair against it. Legacy-only pairs use this fallback table.
// An omitted pair preserves the receiving skeleton's head position.
export const HEAD_SEATS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
${lines.join('\n')}
};
`;
console.log(report.join('\n'));
console.log(`validated ${nativePairs} native head/chest pairs against runtime seating`);
if (process.argv.includes('--check')) {
  const now = await readFile(OUT, 'utf8').catch(() => '');
  if (now !== text) {
    console.error('headSeats.ts is not what tools/head-seats.ts writes: run it again');
    process.exit(1);
  }
  console.log('headSeats.ts is up to date');
} else {
  await writeFile(OUT, text);
  console.log(`wrote ${OUT.pathname}`);
}

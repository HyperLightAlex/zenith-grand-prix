// How high each design's head sits on each other design's chest of its frame
// (docs/CUSTOMIZATION.md, "Heads on other chests"), written to
// src/client/render/mech/headSeats.ts.
//
// The designs share a skeleton, so every head hangs from the same point on
// the chest; but their chests' tops and their heads' necks differ (Razor's
// low head sinks deep into a chest cut away at the front for it; Seraph's
// tall chest plate takes a head only a little way), so a head on another
// chest can vanish into it or stand clear of it.
//
// So each head is set down on the chest from above until its neck touches
// the chest's top, and sunk into it as far as the shallower of the two allows:
// as far as the head sinks into its own chest, and as far as the chest's
// own head sinks into it. On its own chest a head sits where it always has.
// A chest's top is its highest surface under the head below a cap over the
// neck, so Maul's hood, which arches over its head, is not its top.
//
//   npx tsx tools/head-seats.ts            (writes the table; prints a report)
//   npx tsx tools/head-seats.ts --check    (fails if the table is not what it would write)

import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
  const chest: number[] = [];
  const head: number[] = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (o.userData.dims) dims ??= o.userData.dims;
    if (!(o instanceof THREE.Mesh)) return;
    const into = o.userData.joint === 'chest' && o.userData.part === 'chest' ? chest : o.userData.joint === 'head' ? head : null;
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
  return { headY: dims.headY, headZ: dims.headZ, chest: new Float32Array(chest), head: new Float32Array(head) };
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
const report: string[] = [`each head in its own chest: ${[...own].map(([id, s]) => `${id} ${s.toFixed(2)}`).join(', ')}`];
for (const frame of FRAMES) {
  for (const c of frame) {
    table[c] = {};
    for (const h of frame) {
      if (h === c) continue;
      const now = sunk(designs.get(c)!, designs.get(h)!);
      const want = Math.min(own.get(h)!, own.get(c)!);
      const dy = Math.round((now - want) * 50) / 50;
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
// How far (metres, up) a design's head is moved on another design's chest of
// its frame, so it sits on that chest's top, sunk into it only as far as the
// shallower of the two takes a head. By chest, then head; a head not listed
// sits where the skeleton puts it.
export const HEAD_SEATS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
${lines.join('\n')}
};
`;
console.log(report.join('\n'));
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

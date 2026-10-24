// The fallen titan of Titan's Rest and the road through it: the pose the road
// is laid to (render/titan/pose.ts), the placeholder built from it, and the
// Blender model when it is in (render/titan/assets/titan*.glb). None of it may
// reach into the space the road needs.
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildTrack } from '../src/sim/track';
import { TITANS_REST } from '../src/sim/tracks/titan';
import { pieceStarts } from '../src/sim/circuit';
import { KEEP_OUT, RoadIndex } from '../src/client/render/titan/keepout';
import { fitToRoad, STANDING, titanJoints, titanShapes, TITAN_POSE } from '../src/client/render/titan/pose';
import { titanGround, titanPlaceholder } from '../src/client/render/titan/placeholder';
import { readTitanLevel, slotOf, titanTopGrid, TITAN_SLOTS, type TitanTopGrid } from '../src/client/render/titan/read';
import type * as THREE from 'three';

const t = buildTrack(TITANS_REST);
const index = new RoadIndex(t);
const starts = pieceStarts(TITANS_REST);
const piece = (name: string): [number, number] => {
  const k = TITANS_REST.pieces.findIndex((p) => p.name === name);
  return [starts[k], k + 1 < starts.length ? starts[k + 1] : t.length];
};
const at = (s: number) => Math.round(s / t.ds) % t.n;

/** Points over every triangle of a geometry, about `step` apart, and its vertices. */
function* surface(g: THREE.BufferGeometry, step: number): Generator<[number, number, number]> {
  const p = g.attributes.position.array as ArrayLike<number>;
  for (let k = 0; k < p.length; k += 9) {
    const a = [p[k], p[k + 1], p[k + 2]], b = [p[k + 3], p[k + 4], p[k + 5]], c = [p[k + 6], p[k + 7], p[k + 8]];
    const longest = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]), Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]));
    const n = Math.max(1, Math.min(64, Math.ceil(longest / step)));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n;
        yield [a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v];
      }
    }
  }
}

describe("Titan's Rest: the titan and the road", () => {
  const pose = fitToRoad(TITAN_POSE, t);
  const j = titanJoints(pose);
  // The head where it lies: tipped forward and propped up.
  const helmet = titanShapes(pose).find((s) => s.part === 'head' && s.kind === 'ellipsoid')!;
  const head = helmet.kind === 'ellipsoid' ? helmet.c : j.head;
  /** The least distance in plan from p to the road over a piece. */
  const over = (p: number[], name: string) => {
    const [a, b] = piece(name);
    let best = Infinity;
    for (let s = a; s < b; s += 4) best = Math.min(best, Math.hypot(p[0] - t.px[at(s)], p[2] - t.pz[at(s)]));
    return best;
  };

  it('lies with the road on it: the arm under the climb, the head under the brow, the halo round the roll, the chest round the loop', () => {
    const near = (p: number[], s: number, within: number) => Math.hypot(p[0] - t.px[at(s)], p[2] - t.pz[at(s)]) < within;
    expect(over(j.elbowR, 'the Shoulder')).toBeLessThan(10);
    expect(Math.min(over(head, 'the Brow'), over(head, 'T1 the Chin'))).toBeLessThan(40);
    const [h0, h1] = piece('the Halo');
    expect(near(pose.halo, (h0 + h1) / 2, 1)).toBe(true);
    // The loop goes round inside the chest: its top under the chest's top.
    const [l0, l1] = piece('the Ribcage');
    let top = 0;
    for (let s = l0; s < l1; s += 4) top = Math.max(top, t.py[at(s)]);
    const chestTop = STANDING.chest.dep + STANDING.chest.half[1] - pose.burial;
    expect(top + KEEP_OUT.down).toBeLessThan(chestTop);
    const mid = at((l0 + l1) / 2);
    expect(Math.abs(t.pz[mid] - pose.zc)).toBeLessThan(STANDING.chest.half[2]);
  });

  it('leaves the halo open round the roll, and the sword blade under the road all the way round', () => {
    const [h0, h1] = piece('the Halo');
    const inner = STANDING.halo.R - STANDING.halo.width;
    for (let s = h0; s < h1; s += 8) {
      const i = at(s);
      // Every corner of the road's space through the roll is inside the ring's opening.
      for (const d of [-(t.hw[i] + KEEP_OUT.side), t.hw[i] + KEEP_OUT.side]) {
        for (const h of [-KEEP_OUT.down, KEEP_OUT.up]) {
          const y = t.py[i] + t.ry[i] * d + t.uy[i] * h, z = t.pz[i] + t.rz[i] * d + t.uz[i] * h;
          expect(Math.hypot(y - pose.halo[1], z - pose.halo[2])).toBeLessThan(inner);
        }
      }
    }
    const blade = pose.sword;
    expect(Math.hypot(blade.width / 2, blade.thick / 2)).toBeLessThan(20);
  });

  it('builds a placeholder clear of the road, and knows where its top is (for the pylons standing on it)', () => {
    const geo = titanPlaceholder(t);
    let n = 0, hits = 0;
    const scratch: number[] = [];
    for (const list of Object.values(geo)) {
      for (const g of list) {
        const p = g.attributes.position.array as Float32Array;
        for (let k = 0; k < p.length; k += 9) {
          n++;
          if (index.hit(p[k], p[k + 1], p[k + 2], KEEP_OUT.up, scratch) >= 0) hits++;
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(hits).toBe(0);
    const ground = titanGround(t)!;
    expect(ground.topAt(head[0], head[2])).toBeGreaterThan(150);
    expect(ground.topAt(0, 500)).toBe(-Infinity);
  });
});

const ASSETS = new URL('../src/client/render/titan/assets/', import.meta.url);
const model = existsSync(new URL('titan.glb', ASSETS));
describe.skipIf(!model)("Titan's Rest: the titan's Blender model", () => {
  const level = async (file: string) => {
    const bytes = await readFile(new URL(file, ASSETS));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const names: string[] = [];
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const mat of Array.isArray(m) ? m : [m]) names.push(mat.name);
    });
    return { parts: readTitanLevel(gltf.scene), names };
  };

  it('has its levels of detail (the finest, and the two coarser ones once made), each with known material slots and within its triangle budget', async () => {
    const budget = [600_000, 150_000, 40_000];
    let contract: string[] = [];
    for (const [k, file] of ['titan.glb', 'titan-lod1.glb', 'titan-lod2.glb'].entries()) {
      if (!existsSync(new URL(file, ASSETS))) continue;
      const { parts, names } = await level(file);
      for (const name of names) expect(slotOf(name), `material ${name} in ${file}`).not.toBeNull();
      let tris = 0;
      for (const geo of parts.values()) for (const g of Object.values(geo)) tris += g.attributes.position.count / 3;
      expect(tris, file).toBeLessThanOrEqual(budget[k]);
      const keys = [...parts.keys()].sort();
      if (k) expect(keys, file).toEqual(contract);
      else contract = keys;
    }
    expect(TITAN_SLOTS.length).toBe(10);
  });

  it('has its top from above (titan-top.json, for the supports and the scenery) made from this model: npx tsx tools/titan/top.ts', async () => {
    const { parts } = await level('titan.glb');
    const file = new URL('titan-top.json', ASSETS);
    expect(existsSync(file)).toBe(true);
    const saved = JSON.parse(readFileSync(file, 'utf8')) as TitanTopGrid;
    expect(saved).toEqual(titanTopGrid(parts));
  });

  it('leaves the space round the road empty, at every level of detail', async () => {
    const scratch: number[] = [];
    const where = new Map<string, number>();
    for (const file of ['titan.glb', 'titan-lod1.glb', 'titan-lod2.glb']) {
      if (!existsSync(new URL(file, ASSETS))) continue;
      const { parts } = await level(file);
      for (const [part, geo] of parts) {
        for (const g of Object.values(geo)) {
          for (const [x, y, z] of surface(g, 4)) {
            const i = index.hit(x, y, z, KEEP_OUT.up, scratch);
            if (i < 0) continue;
            let k = 0;
            while (k + 1 < starts.length && starts[k + 1] <= i * t.ds) k++;
            const key = `${file}: ${part} on ${TITANS_REST.pieces[k]?.name ?? `#${k}`}`;
            where.set(key, (where.get(key) ?? 0) + 1);
          }
        }
      }
    }
    expect(Object.fromEntries(where)).toEqual({});
  });
});

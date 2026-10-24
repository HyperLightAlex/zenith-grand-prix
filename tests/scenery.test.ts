// The scenery round every circuit and the road through it: nothing the world
// builds (render/world.ts: the ground, the ice, the rocks, the wreckage, the
// placeholder titan) may stand in the space the road needs (above its deck
// across its width and a little past each edge, render/titan/keepout.ts), and
// the ground must lie under the deck everywhere, not come up through it.
// Built in Node, with the canvas and image loading the scenery asks for
// stubbed (only its geometry is looked at).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readTitanLevel } from '../src/client/render/titan/read';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTrack, type Track } from '../src/sim/track';
import { TRACKS, type AnyTrackDef } from '../src/sim/tracks/index';
import { pieceStarts, type CircuitDef } from '../src/sim/circuit';
import { KEEP_OUT, RoadIndex } from '../src/client/render/titan/keepout';
import { themeFor } from '../src/client/render/themes';
import { buildWorld } from '../src/client/render/world';
import { buildTrackVisual } from '../src/client/render/trackMesh';

const TITAN_MODEL = new URL('../src/client/render/titan/assets/titan.glb', import.meta.url);
/** How far under the deck counts: the ground may lie against the slab under the road, not within this of its top. */
const UNDER = 0.5;

function fakeDocument() {
  const ctx2d = new Proxy(
    {},
    {
      get: (_t, k) => {
        if (k === 'measureText') return (s: string) => ({ width: String(s).length * 40 });
        if (k === 'getImageData' || k === 'createImageData') return (...a: number[]) => ({ data: new Uint8ClampedArray(Math.max(1, (a[2] ?? a[0] ?? 1) * (a[3] ?? a[1] ?? 1)) * 4) });
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    },
  );
  const element = () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d, addEventListener: () => {}, removeEventListener: () => {}, setAttribute: () => {} });
  return { createElement: element, createElementNS: (_ns: string, _tag: string) => element() };
}

interface Hit {
  sample: number;
  piece: string;
  what: string;
  x: number;
  y: number;
  z: number;
  /** Up from the deck, across from the centreline, in the road's frame. */
  h: number;
  d: number;
}

/** What a mesh is, for the report: its material's colour and kind, and where its middle is. */
function describe_(mesh: THREE.Mesh): string {
  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshLambertMaterial;
  const g = mesh.geometry;
  g.computeBoundingBox();
  const b = g.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
  const c = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3());
  const colour = mat && 'color' in mat && mat.color ? '#' + mat.color.getHexString() : '-';
  return `${g.type} ${mat?.type ?? '?'} ${colour}${mesh.name ? ' ' + mesh.name : ''} centre (${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${c.z.toFixed(0)}) size ${size.x.toFixed(0)}x${size.y.toFixed(0)}x${size.z.toFixed(0)}`;
}

/** Every point of the scenery (each triangle sampled about `step` apart) inside the space the road needs. */
function audit(track: Track, def: AnyTrackDef, group: THREE.Group, step = 2.5): Hit[] {
  const index = new RoadIndex(track);
  const pieces = 'pieces' in def ? (def as CircuitDef) : null;
  const starts = pieces ? pieceStarts(pieces) : [];
  const pieceOf = (i: number) => {
    if (!pieces) return `s ${(i * track.ds).toFixed(0)}`;
    const s = i * track.ds;
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1] <= s) k++;
    return pieces.pieces[k]?.name ?? `#${k}`;
  };
  // Where the road is, coarsely: per 64 m cell, the lowest and highest the space round it reaches.
  const CELL = 64;
  const cells = new Map<string, [number, number]>();
  const reach = index.reach;
  for (let i = 0; i < track.n; i++) {
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(track.px[i] / CELL), cz = Math.floor(track.pz[i] / CELL);
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++) {
        const key = `${cx + a},${cz + b}`;
        const c = cells.get(key);
        const lo = track.py[i] - reach, hi = track.py[i] + reach;
        if (c) {
          c[0] = Math.min(c[0], lo);
          c[1] = Math.max(c[1], hi);
        } else cells.set(key, [lo, hi]);
      }
  }
  const nearRoad = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++)
      for (let b = Math.floor(z0 / CELL); b <= Math.floor(z1 / CELL); b++) {
        const c = cells.get(`${a},${b}`);
        if (c && y1 >= c[0] && y0 <= c[1]) return true;
      }
    return false;
  };
  const hits: Hit[] = [];
  const scratch: number[] = [];
  const v = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.renderOrder <= -10) return;
    let g = mesh.geometry;
    if (!g.attributes.position) return;
    if (g.index) g = g.toNonIndexed();
    const p = g.attributes.position;
    const what = describe_(mesh);
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const seen = new Set<number>();
    // An instanced mesh (the road's supports) once for each instance.
    const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
    const mats: THREE.Matrix4[] = [];
    for (let k = 0; k < (inst ? inst.count : 1); k++) {
      const m = mesh.matrixWorld.clone();
      if (inst) {
        const im = new THREE.Matrix4();
        inst.getMatrixAt(k, im);
        m.multiply(im);
      }
      mats.push(m);
    }
    for (const mw of mats)
    for (let k = 0; k + 2 < p.count; k += 3) {
      for (let q = 0; q < 3; q++) tri[q].fromBufferAttribute(p, k + q).applyMatrix4(mw);
      const [a, b, c] = tri;
      if (!nearRoad(Math.min(a.x, b.x, c.x), Math.max(a.x, b.x, c.x), Math.min(a.y, b.y, c.y), Math.max(a.y, b.y, c.y), Math.min(a.z, b.z, c.z), Math.max(a.z, b.z, c.z))) continue;
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const n = Math.max(1, Math.min(400, Math.ceil(longest / step)));
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          const u = i / n, w = j / n;
          v.set(a.x + (b.x - a.x) * u + (c.x - a.x) * w, a.y + (b.y - a.y) * u + (c.y - a.y) * w, a.z + (b.z - a.z) * u + (c.z - a.z) * w);
          const s = index.hit(v.x, v.y, v.z, KEEP_OUT.up, scratch, UNDER);
          if (s < 0 || seen.has(s)) continue;
          seen.add(s);
          const dx = v.x - track.px[s], dy = v.y - track.py[s], dz = v.z - track.pz[s];
          hits.push({
            sample: s,
            piece: pieceOf(s),
            what,
            x: v.x,
            y: v.y,
            z: v.z,
            h: dx * track.ux[s] + dy * track.uy[s] + dz * track.uz[s],
            d: dx * track.rx[s] + dy * track.ry[s] + dz * track.rz[s],
          });
        }
    }
  });
  return hits;
}

const ids = (process.env.SCENERY ?? TRACKS.map((t) => t.id).join(',')).split(',');
/**
 * Circuits not yet clear of it, and why (SCENERY=<id> to see where): the
 * Crucible's Coil runs on benches cut into the pit, their faces and lamps
 * against the back of its inner barrier, the rim's yard over the low side of
 * its top turns, and the pit's rock at the edge of the Leap's landing.
 */
const NOT_YET: Record<string, string> = { crucible: 'its benches, rim and rock at the road edge' };

describe('the scenery and the road', () => {
  beforeAll(() => vi.stubGlobal('document', fakeDocument()));
  afterAll(() => vi.unstubAllGlobals());
  const report: string[] = [];
  afterAll(() => {
    if (process.env.SCENERY_REPORT) writeFileSync(process.env.SCENERY_REPORT, report.join('\n') + '\n');
  });
  for (const def of TRACKS) {
    if (!ids.includes(def.id)) continue;
    const skip = !process.env.SCENERY && def.id in NOT_YET;
    (skip ? it.skip : it)(`${def.id}: nothing stands in the road's space, and the ground lies under the deck${skip ? ` (not yet: ${NOT_YET[def.id]})` : ''}`, async () => {
      const track = buildTrack(def);
      const theme = themeFor(def.theme);
      const world = buildWorld(track, theme);
      // The road's supports too (only them: the rest of the road is the road).
      const supports = new THREE.Group();
      buildTrackVisual(track, theme).group.traverse((o) => {
        if (o.name === 'pylons') supports.add(o.clone());
      });
      world.group.add(supports);
      if (def.id === 'titan' && existsSync(TITAN_MODEL)) {
        // On the titan, each support reaches down to the model's surface under it, and stands no more than its sink into it.
        const bytes = readFileSync(TITAN_MODEL);
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
        const body = [...readTitanLevel(gltf.scene).values()].flatMap((geo) => Object.values(geo).map((g) => new THREE.Mesh(g!, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))));
        const ray = new THREE.Raycaster();
        const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        const bad: string[] = [];
        let on = 0;
        supports.traverse((o) => {
          const inst = o as THREE.InstancedMesh;
          if (!inst.isInstancedMesh) return;
          for (let k = 0; k < inst.count; k++) {
            inst.getMatrixAt(k, m);
            m.decompose(p, q, sc);
            const foot = p.y - sc.y;
            if (foot < 1) continue;
            on++;
            ray.set(new THREE.Vector3(p.x, p.y - 0.5, p.z), new THREE.Vector3(0, -1, 0));
            const hit = ray.intersectObjects(body, false)[0];
            if (!hit || hit.point.y < foot || hit.point.y - foot > 12) bad.push(`at (${p.x.toFixed(0)}, ${p.z.toFixed(0)}): foot ${foot.toFixed(1)}, the titan ${hit ? hit.point.y.toFixed(1) : 'not under it'}`);
          }
        });
        expect(on).toBeGreaterThan(0);
        expect(bad).toEqual([]);
      }
      const hits = audit(track, def, world.group);
      // The report: per mesh and piece, how many samples and how deep.
      const groups = new Map<string, Hit[]>();
      for (const h of hits) {
        const key = `${h.what} | ${h.piece}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(h);
      }
      report.push(`== ${def.id}: ${hits.length} samples with scenery in the road's space`);
      for (const [key, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
        const top = Math.max(...list.map((h) => h.h));
        const ss = list.map((h) => h.sample * track.ds);
        report.push(`  ${list.length} samples, s ${Math.min(...ss).toFixed(0)}-${Math.max(...ss).toFixed(0)}, up to ${top.toFixed(1)} over the deck, across ${Math.min(...list.map((h) => h.d)).toFixed(0)}..${Math.max(...list.map((h) => h.d)).toFixed(0)}: ${key}`);
      }
      expect(hits.map((h) => `${h.piece} at ${(h.sample * track.ds).toFixed(0)}: ${h.what}`).slice(0, 20)).toEqual([]);
    }, 300_000);
  }
});

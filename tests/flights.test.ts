// The fastest flights clear the scenery. Every jump on every circuit, taken
// as fast as a mech can take it: Overdrive on the speed lap with a speed
// pad's push held through the lip, on the jump's own side of the road for a
// gap on one side. Nothing the world builds (render/world.ts) may stand
// where a mech flies: within a mech's half height and a margin of the middle
// of its body, all the way from the lip to where it comes down. (The road's
// own space, scenery.test.ts, only reaches KEEP_OUT.up over the deck; a jump
// flown in Overdrive goes higher and further than that.)
// Built in Node, with the canvas and image loading the scenery asks for
// stubbed (only its geometry is looked at).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTrack, wrapS, type Track } from '../src/sim/track';
import { TRACKS } from '../src/sim/tracks/index';
import { pieceStarts, type CircuitDef } from '../src/sim/circuit';
import { fastestFlight } from '../src/sim/flight';
import { themeFor } from '../src/client/render/themes';
import { buildWorld } from '../src/client/render/world';
import { buildTrackVisual } from '../src/client/render/trackMesh';
import { trackPoint } from '../src/client/render/trackSpace';

/** How far from the middle of a flying mech's body scenery must keep: half a mech's height (8.8) and a margin. */
const CLEAR = 6.5;
/** The middle of a mech's body over its skates. */
const BODY = 4.4;

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

/** The jumps: runs of samples with no road, and which side (0 both, -1 left, 1 right). */
function jumps(t: Track): Array<{ s: number; side: number }> {
  const out: Array<{ i0: number; i1: number; side: number }> = [];
  for (let i = 0; i < t.n; i++) {
    const l = !t.roadL[i];
    const r = !t.roadR[i];
    if (!l && !r) continue;
    const side = l && r ? 0 : l ? -1 : 1;
    const last = out[out.length - 1];
    if (last && last.i1 === i - 1 && last.side === side) last.i1 = i;
    else out.push({ i0: i, i1: i, side });
  }
  return out.map((j) => ({ s: j.i0 * t.ds, side: j.side }));
}

/** The flight over the jump at `s` (sim/flight.ts), on its own side of the road: where the middle of the mech's body goes. */
function flightPath(t: Track, s: number, side: number) {
  const f = fastestFlight(t, s, side * hwAt(t, s) * 0.5);
  const path = f.s.map((at, i) => trackPoint(t, at, f.d[i], f.h[i] + BODY, new THREE.Vector3()));
  return { ...f, path };
}

function hwAt(t: Track, s: number): number {
  return t.hw[Math.floor(wrapS(t, s) / t.ds) % t.n];
}

/** Scenery under `root` within CLEAR of any point of `path`: per mesh, how many of its triangles. */
function inTheWay(root: THREE.Object3D, path: THREE.Vector3[]): Map<string, number> {
  const R = CLEAR;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const grid = new Map<string, THREE.Vector3[]>();
  const box = new THREE.Box3();
  for (const p of path) {
    box.expandByPoint(p);
    const k = key(Math.floor(p.x / R), Math.floor(p.y / R), Math.floor(p.z / R));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(p);
  }
  box.expandByScalar(R);
  const near = (v: THREE.Vector3) => {
    const cx = Math.floor(v.x / R), cy = Math.floor(v.y / R), cz = Math.floor(v.z / R);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) for (const p of grid.get(key(cx + a, cy + b, cz + c)) ?? []) if (p.distanceTo(v) < R) return true;
    return false;
  };
  const hits = new Map<string, number>();
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const v = new THREE.Vector3();
  const tb = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // (Drawn-behind backdrops, renderOrder -10 and under, are far off.)
    if (!mesh.isMesh || mesh.renderOrder <= -10) return;
    let g = mesh.geometry;
    if (!g.attributes.position) return;
    if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position;
    const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
    const what = mesh.name || `${g.type} ${(mesh.material as THREE.Material).type}`;
    for (let q = 0; q < (inst ? inst.count : 1); q++) {
      const mw = mesh.matrixWorld.clone();
      if (inst) {
        const im = new THREE.Matrix4();
        inst.getMatrixAt(q, im);
        mw.multiply(im);
      }
      for (let k = 0; k + 2 < pos.count; k += 3) {
        for (let j = 0; j < 3; j++) tri[j].fromBufferAttribute(pos, k + j).applyMatrix4(mw);
        tb.setFromPoints(tri);
        if (!tb.intersectsBox(box)) continue;
        const [a, b, c] = tri;
        // Sampled about 2 apart across the triangle.
        const n = Math.max(1, Math.min(200, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 2)));
        let hit = false;
        for (let i = 0; i <= n && !hit; i++)
          for (let j = 0; j <= n - i && !hit; j++) {
            const u = i / n, w = j / n;
            v.set(a.x + (b.x - a.x) * u + (c.x - a.x) * w, a.y + (b.y - a.y) * u + (c.y - a.y) * w, a.z + (b.z - a.z) * u + (c.z - a.z) * w);
            hit = near(v);
          }
        if (hit) hits.set(what, (hits.get(what) ?? 0) + 1);
      }
    }
  });
  return hits;
}

describe('the fastest flights clear the scenery', () => {
  beforeAll(() => vi.stubGlobal('document', fakeDocument()));
  afterAll(() => vi.unstubAllGlobals());
  for (const def of TRACKS) {
    if (!('pieces' in def)) continue;
    it(`${def.id}: every jump, in Overdrive off a pad, flies clear`, () => {
      const t = buildTrack(def);
      const list = jumps(t);
      if (!list.length) return;
      const starts = pieceStarts(def as CircuitDef);
      const pieceAt = (s: number) => {
        let k = 0;
        while (k + 1 < starts.length && starts[k + 1] <= s) k++;
        return (def as CircuitDef).pieces[k]?.name ?? `piece ${k}`;
      };
      const theme = themeFor(def.theme);
      const world = buildWorld(t, theme);
      // The road's supports and the grandstands too (the rest of the road is the road).
      const supports = new THREE.Group();
      buildTrackVisual(t, theme).group.traverse((o) => {
        if (o.name === 'pylons' || o.name === 'grandstand') supports.add(o.clone());
      });
      world.group.add(supports);
      const bad: string[] = [];
      for (const j of list) {
        const f = flightPath(t, j.s, j.side);
        expect(f.path.length).toBeGreaterThan(10);
        for (const [what, n] of inTheWay(world.group, f.path)) {
          bad.push(`${pieceAt(j.s)} at ${j.s.toFixed(0)} (${f.speed.toFixed(0)} u/s, ${f.peak.toFixed(0)} up, down at ${f.down.toFixed(0)}): ${what}, ${n} triangles`);
        }
      }
      expect(bad).toEqual([]);
    }, 300_000);
  }
});

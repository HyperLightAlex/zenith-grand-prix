// The scenery's matrices are computed once (render/still.ts): only objects
// marked as moving keep being updated. Here every circuit is built in Node
// (canvas and images stubbed, as in scenery.test.ts), frozen as the game
// freezes it, and run through its own per-frame updates with a camera going
// round the lap and the look switching on and off: nothing frozen may move,
// or it would be drawn where it was when frozen.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTrack, frameAt, makeFrame } from '../src/sim/track';
import { TRACKS } from '../src/sim/tracks/index';
import { themeFor } from '../src/client/render/themes';
import { buildWorld } from '../src/client/render/world';
import { buildTrackVisual } from '../src/client/render/trackMesh';
import { look } from '../src/client/render/look';
import { freezeStill } from '../src/client/render/still';

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
  return { createElement: element, createElementNS: () => element() };
}

const where = (o: THREE.Object3D) => {
  const names: string[] = [];
  for (let p: THREE.Object3D | null = o; p; p = p.parent) names.push(p.name || p.type);
  const mesh = o as THREE.Mesh;
  return `${names.reverse().join('/')} (${mesh.geometry?.type ?? o.type})`;
};

describe('still scenery', () => {
  const lookWas = look.on;
  beforeAll(() => vi.stubGlobal('document', fakeDocument()));
  afterAll(() => {
    look.on = lookWas;
    vi.unstubAllGlobals();
  });
  for (const def of TRACKS) {
    it(`${def.id}: nothing frozen is moved by the scenery's updates`, () => {
      const track = buildTrack(def);
      const theme = themeFor(def.theme);
      const world = buildWorld(track, theme);
      const vis = buildTrackVisual(track, theme);
      freezeStill(world.group);
      freezeStill(vis.group);
      const frozen = new Map<THREE.Object3D, number[]>();
      const pose = (o: THREE.Object3D) => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()];
      let movers = 0;
      for (const g of [world.group, vis.group]) g.traverse((o) => (o.matrixAutoUpdate ? movers++ : frozen.set(o, pose(o))));
      expect(frozen.size).toBeGreaterThan(50);
      const cam = new THREE.PerspectiveCamera(66, 16 / 9, 0.5, 40000);
      const f = makeFrame();
      const moved = new Set<string>();
      for (let i = 0; i < 200; i++) {
        look.on = i % 50 < 35;
        frameAt(track, (i / 200) * track.length, f);
        cam.position.set(f.px, f.py + 6, f.pz);
        cam.lookAt(f.px + f.tx * 50, f.py + f.ty * 50 + 6, f.pz + f.tz * 50);
        cam.updateMatrixWorld(true);
        const t = i * 0.77;
        world.update(t, cam);
        vis.update(t);
        for (const [o, was] of frozen) {
          const now = pose(o);
          if (now.some((v, k) => Math.abs(v - was[k]) > 1e-9)) moved.add(where(o));
        }
      }
      expect([...moved], 'moved by the updates but frozen: mark them with moves() where they are made').toEqual([]);
      // (And not everything marked: the point is that most of it stands still.)
      expect(movers).toBeLessThan(frozen.size / 4);
    });
  }
});

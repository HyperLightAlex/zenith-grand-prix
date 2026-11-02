// The hover screens over the stands by the start (render/screens/): the
// model is whole and the way round the game takes it, and on every circuit
// they hang over stands, never over the road nor near any other stretch of
// it, facing back across the road.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TRACKS, buildTrack } from '../src/sim/index';
import { frameAt, makeFrame } from '../src/sim/track';
import { useGrandstandModel } from '../src/client/render/grandstand/grandstand';
import { HOVER, HOVER_SCREEN_SLOTS, hoverScreenSpots, type HoverScreenModel } from '../src/client/render/screens/hoverScreens';
import { KEEP_OUT } from '../src/client/render/titan/keepout';
import { buildTrackVisual } from '../src/client/render/trackMesh';
import { themeFor } from '../src/client/render/themes';
import { readGrandstandFile, readHoverScreenFile } from './grandstandModel';

function fakeDocument() {
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  const element = () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d, addEventListener: () => {}, removeEventListener: () => {}, setAttribute: () => {} });
  return { createElement: element, createElementNS: () => element() };
}

let screen: HoverScreenModel;
beforeAll(async () => {
  screen = await readHoverScreenFile();
});

const bounds = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('the hover screen model', () => {
  it('has every slot; its picture 16:9 on z = 0 facing +z, UVs across it the right way up', () => {
    expect([...screen.keys()].sort()).toEqual([...HOVER_SCREEN_SLOTS].sort());
    const pic = screen.get('screen')!;
    const b = bounds(pic);
    expect((b.max.x - b.min.x) / (b.max.y - b.min.y)).toBeCloseTo(16 / 9, 3);
    expect(b.min.z).toBeCloseTo(0, 3);
    expect(b.max.z).toBeCloseTo(0, 3);
    const n = pic.attributes.normal;
    for (let i = 0; i < n.count; i++) expect(n.getZ(i)).toBeCloseTo(1, 3);
    const p = pic.attributes.position;
    const uv = pic.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      // Left to right and bottom to top, as seen from the front.
      expect(uv.getX(i)).toBeCloseTo((p.getX(i) - b.min.x) / (b.max.x - b.min.x), 3);
      expect(uv.getY(i)).toBeCloseTo((p.getY(i) - b.min.y) / (b.max.y - b.min.y), 3);
    }
    // Nothing of it reaches far in front of its picture (the lift's rings and the bezel only).
    for (const g of screen.values()) expect(bounds(g).max.z).toBeLessThan(2);
  });

  it("lays the lift's glow from its emitters (v 0) down to nothing (v 1)", () => {
    const beam = screen.get('beam')!;
    const p = beam.attributes.position;
    const uv = beam.attributes.uv;
    const top: number[] = [];
    const foot: number[] = [];
    for (let i = 0; i < uv.count; i++) (uv.getY(i) < 0.5 ? top : foot).push(p.getY(i));
    expect(top.length).toBe(foot.length);
    // Every emitter above every cone's foot.
    expect(Math.min(...top)).toBeGreaterThan(Math.max(...foot));
  });
});

describe('the hover screens on the circuits', () => {
  beforeAll(async () => {
    vi.stubGlobal('document', fakeDocument());
    useGrandstandModel(await readGrandstandFile());
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    useGrandstandModel(null);
  });

  it('hang over the stands by the start, well clear of the road, facing back across it', () => {
    const f = makeFrame();
    const all = new THREE.Box3();
    for (const g of screen.values()) all.union(bounds(g));
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(k & 1 ? all.max.x : all.min.x, k & 2 ? all.max.y : all.min.y, k & 4 ? all.max.z : all.min.z));
    const counts: string[] = [];
    for (const def of TRACKS) {
      const track = buildTrack(def);
      const vis = buildTrackVisual(track, themeFor(def.theme));
      const spots = hoverScreenSpots(track, vis.group);
      counts.push(`${def.id} ${spots.length}`);
      expect(spots.length, def.id).toBeGreaterThan(0);
      expect(spots.length, def.id).toBeLessThanOrEqual(4);
      for (const m of spots) {
        const at = new THREE.Vector3().setFromMatrixPosition(m);
        // Its own stretch of road: the nearest sample to it.
        let best = Infinity;
        let s = 0;
        for (let i = 0; i < track.n; i++) {
          const d2 = (track.px[i] - at.x) ** 2 + (track.pz[i] - at.z) ** 2;
          if (d2 < best) [best, s] = [d2, i * track.ds];
        }
        frameAt(track, s, f);
        const side = Math.sign((at.x - f.px) * f.rx + (at.z - f.pz) * f.rz);
        const across = Math.hypot(f.rx, f.rz);
        for (const c of corners) {
          const w = c.clone().applyMatrix4(m);
          // Out past the barrier, by more than the screen's drift.
          const out = (((w.x - f.px) * f.rx + (w.z - f.pz) * f.rz) / across) * side;
          expect(out, `${def.id} at ${s}`).toBeGreaterThan(track.halfWidth + KEEP_OUT.side + 2);
        }
        // High over its road, under the stand's roof nowhere.
        expect(at.y - f.py, def.id).toBeGreaterThan(HOVER.up - 3);
        // Facing back across the road, tipped forward a little.
        const facing = new THREE.Vector3(0, 0, 1).transformDirection(m);
        expect(((facing.x * f.rx + facing.z * f.rz) / across) * side, def.id).toBeLessThan(-0.95);
        expect(facing.y, def.id).toBeCloseTo(-Math.sin(HOVER.tilt), 2);
      }
    }
    console.log(counts.join(', '));
  }, 300_000);
});

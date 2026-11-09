// The grandstands (render/grandstand/, art/blender/grandstand): the model is
// whole and the way round the game takes it, its crowd's rows where the
// game (and the crowd's flashes) expect them, and every circuit stands some
// along its start, facing the road.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TRACKS, buildTrack } from '../src/sim/index';
import { CROWD_STEP, GRANDSTAND_DEPTH, GRANDSTAND_LENGTH, GRANDSTAND_SLOTS, SEATING, useGrandstandModel, type GrandstandModel } from '../src/client/render/grandstand/grandstand';
import { buildTrackVisual } from '../src/client/render/trackMesh';
import { themeFor } from '../src/client/render/themes';
import { Crowd } from '../src/client/render/crowd';
import { frameAt, makeFrame } from '../src/sim/track';
import { readGrandstandFile } from './grandstandModel';

function fakeDocument() {
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
  const element = () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d, addEventListener: () => {}, removeEventListener: () => {}, setAttribute: () => {} });
  return { createElement: element, createElementNS: () => element() };
}

let model: GrandstandModel;
beforeAll(async () => {
  model = await readGrandstandFile();
});

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('the grandstand model', () => {
  it('has every slot, the stand its length, its front on z = 0 and the rest behind it', () => {
    expect([...model.keys()].sort()).toEqual([...GRANDSTAND_SLOTS].sort());
    const all = new THREE.Box3();
    for (const g of model.values()) all.union(box(g));
    expect(all.max.x - all.min.x).toBeGreaterThan(GRANDSTAND_LENGTH);
    expect(all.max.x - all.min.x).toBeLessThan(GRANDSTAND_LENGTH + 4);
    // Only the parapet's strip stands proud of its face, by a few centimetres.
    expect(all.max.z).toBeLessThan(0.1);
    expect(all.min.z).toBeGreaterThan(-GRANDSTAND_DEPTH);
    // Down to below the road for lower ground, up past its roof.
    expect(all.min.y).toBeLessThan(-10);
    expect(all.max.y).toBeGreaterThan(27);
  });

  it("lays its crowd up the rows SEATING describes, a row to every 1/16 of v", () => {
    const crowd = model.get('crowd')!;
    const b = box(crowd);
    const [fy, fz] = SEATING.front;
    const [by, bz] = SEATING.back;
    expect(b.min.y).toBeCloseTo(fy, 2);
    // The last row's people up the back wall, a row's rise over its tread.
    expect(b.max.y).toBeCloseTo(by + (by - fy) / (SEATING.rows - 1), 2);
    expect(b.max.z).toBeCloseTo(fz, 2);
    expect(b.min.z).toBeCloseTo(bz - SEATING.depth, 1);
    expect(b.max.x).toBeLessThanOrEqual(SEATING.half + 0.5);
    const uv = crowd.attributes.uv;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      lo = Math.min(lo, uv.getY(i));
      hi = Math.max(hi, uv.getY(i));
    }
    // (Up the picture, as the game reads them.)
    expect(lo).toBeCloseTo(-CROWD_STEP / SEATING.rows, 3);
    expect(hi).toBeCloseTo(1 - CROWD_STEP / SEATING.rows, 3);
    // Lower rows lower down it: the first row's people at the bottom.
    let low = 0;
    for (let i = 0; i < uv.count; i++) if (crowd.attributes.position.getY(i) < fy + 1) low = Math.max(low, uv.getY(i));
    expect(low).toBeLessThan(1.5 / SEATING.rows);
    // Its people face the road.
    const n = crowd.attributes.normal;
    let toward = 0;
    for (let i = 0; i < n.count; i++) if (n.getZ(i) > 0.9) toward++;
    expect(toward).toBeGreaterThan(n.count / 3);
  });
});

describe('the grandstands on the circuits', () => {
  beforeAll(() => {
    vi.stubGlobal('document', fakeDocument());
    useGrandstandModel(model);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    useGrandstandModel(null);
  });

  it('stand along every start, facing the road, with the crowd over them', () => {
    const f = makeFrame();
    for (const def of TRACKS) {
      const track = buildTrack(def);
      const vis = buildTrackVisual(track, themeFor(def.theme));
      vis.group.updateMatrixWorld(true);
      const stands: THREE.Object3D[] = [];
      vis.group.traverse((o) => {
        if (o.name === 'grandstand' && o.userData.seating) stands.push(o);
      });
      expect(stands.length, def.id).toBeGreaterThanOrEqual(2);
      for (const st of stands) {
        // Out past the road's edge on its side, its front facing back across the road.
        const { s, side } = st.userData.seating as { s: number; side: number };
        const at = new THREE.Vector3().setFromMatrixPosition(st.matrixWorld);
        const facing = new THREE.Vector3(0, 0, 1).transformDirection(st.matrixWorld);
        frameAt(track, s, f);
        const out = (at.x - f.px) * f.rx + (at.y - f.py) * f.ry + (at.z - f.pz) * f.rz;
        expect(out * side, `${def.id} at ${s}`).toBeGreaterThan(track.halfWidth + 5);
        // Level, upright (the road's banking or not), straight across the road.
        expect(Math.abs(facing.y), `${def.id} at ${s}`).toBeLessThan(1e-6);
        expect(new THREE.Vector3(0, 1, 0).transformDirection(st.matrixWorld).y, `${def.id} at ${s}`).toBeCloseTo(1, 6);
        expect((facing.x * f.rx + facing.z * f.rz) / Math.hypot(f.rx, f.rz), `${def.id} at ${s}`).toBeCloseTo(-side, 2);
      }
      // No more than the crowd can take, and the crowd takes them.
      expect(stands.length).toBeLessThanOrEqual(8);
      const crowd = new Crowd(vis.group, [
        { field: 0xff0000, band: 0xffffff, emblem: '' },
        { field: 0x0000ff, band: 0xffffff, emblem: '' },
      ]);
      expect(crowd.group.children.length, def.id).toBe(2);
      // Both teams' banners are waved, on every stand.
      const banners = crowd.group.getObjectByName('banners') as THREE.InstancedMesh;
      expect([...new Set(banners.geometry.getAttribute('aBanner').array)].sort(), def.id).toEqual([0, 1]);
      crowd.dispose();
    }
  }, 300_000);
});

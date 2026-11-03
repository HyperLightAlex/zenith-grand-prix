// The outposts (render/outposts/outposts.ts, art/blender/outposts): the
// buildings round a circuit out in the wild are built as their real
// counterparts are, and put down where they make sense. Each of the kit's
// kinds stands on the ground (on its foundations, none floating, none sunk
// deep) with its door toward its front; a stack of containers is each on the
// one under it; and in the worlds that have them (Corkscrew Canyon's paddock
// and fuel stop, Titan's Rest's salvage camp, Frostline's polar station) no
// building stands in another.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OUTPOST_KINDS, OUTPOST_SLOTS, Site, readOutposts, useOutpostModel, type OutpostKind, type OutpostModel } from '../src/client/render/outposts/outposts';
import { buildTrack } from '../src/sim/track';
import { TRACKS } from '../src/sim/tracks/index';
import { themeFor } from '../src/client/render/themes';
import { OUTPOST_SKINS, buildWorld } from '../src/client/render/world';
import { paintedSet } from '../src/client/render/painted';
import { OUTPOSTS_FILE } from './grandstandModel';

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

let kit: OutpostModel;

beforeAll(async () => {
  const bytes = readFileSync(OUTPOSTS_FILE);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  kit = readOutposts(gltf.scene);
});

describe("the outposts' kit", () => {
  it('has every kind, each of the known slots', () => {
    expect([...kit.keys()].sort()).toEqual([...OUTPOST_KINDS].sort());
    for (const [, shape] of kit) for (const slot of shape.slots.keys()) expect(OUTPOST_SLOTS).toContain(slot);
  });

  it('stands each kind on the ground: down to it (its foundations a little into it), nothing floating, nothing sunk deep', () => {
    for (const [kind, shape] of kit) {
      expect(shape.box.min.y, kind).toBeLessThanOrEqual(0.01);
      expect(shape.box.min.y, kind).toBeGreaterThan(-1.5);
      expect(shape.box.max.y, kind).toBeGreaterThan(1);
    }
  });

  it("turns their ribbed walls and the hangar's skin outward (seen from outside, not culled away)", () => {
    // Of each wall face (not a roof or a floor), whether it faces away from the
    // building's middle (from the hangar's arch's axis, along z, 0.25 up).
    const outward = (kind: OutpostKind, slot: string, axis = false) => {
      const g = kit.get(kind)!.slots.get(slot as never)!.toNonIndexed();
      const p = g.attributes.position;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      let walls = 0, out = 0;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const m = a.clone().add(b).add(c).divideScalar(3);
        if (!axis && Math.abs(n.y) > 0.5) continue;
        walls++;
        const from = axis ? new THREE.Vector3(m.x, m.y - 0.25, 0) : new THREE.Vector3(m.x, 0, m.z);
        if (n.dot(from) > 0) out++;
      }
      return out / walls;
    };
    // (Of a container's, the frame's posts' and rails' inner faces face in: a sheet the wrong way round would leave half its ribs facing in.)
    expect(outward('container', 'paint')).toBeGreaterThan(0.8);
    expect(outward('workshop', 'cladding')).toBeGreaterThan(0.9);
    expect(outward('shop', 'cladding')).toBeGreaterThan(0.9);
    expect(outward('hangar', 'cladding', true)).toBe(1);
  });

  it('turns their doors to their fronts (+z)', () => {
    // The kinds whose one door is all their dark slot.
    for (const kind of ['cabin', 'module', 'radome', 'shop'] as const) {
      const g = kit.get(kind)!.slots.get('dark')!;
      g.computeBoundingBox();
      expect(g.boundingBox!.min.z, kind).toBeGreaterThan(0);
    }
  });
});

describe('a site', () => {
  beforeAll(() => useOutpostModel(kit));
  afterAll(() => useOutpostModel(null));

  it('stacks each container on the one under it', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const site = new Site(0, 0, 0, 0);
    for (let k = 0; k < 20; k++) site.containers(k * 30, 0, 6, 4, [0xff0000], rnd, k * 0.3);
    const at = new Set(site.placed.map((p) => `${p.m.elements[12].toFixed(2)},${p.m.elements[13].toFixed(2)},${p.m.elements[14].toFixed(2)}`));
    let upper = 0;
    for (const p of site.placed) {
      const y = p.m.elements[13];
      if (y < 0.01) continue;
      upper++;
      expect(at.has(`${p.m.elements[12].toFixed(2)},${(y - 2.59).toFixed(2)},${p.m.elements[14].toFixed(2)}`)).toBe(true);
    }
    expect(upper).toBeGreaterThan(20);
  });

  it('draws each kind instanced, the paint per building, leaving out what it is told to', () => {
    const site = new Site(100, 5, -50, 0.5);
    site.place('cabin', 0, 0, 0, 0xff0000).place('cabin', 20, 0, 0, 0x00ff00).place('lamp', 0, 30);
    const all = site.meshes() as THREE.InstancedMesh[];
    const paint = all.find((m) => m.name === 'outpost cabin paint')!;
    expect(paint.count).toBe(2);
    expect(paint.getColorAt(1, new THREE.Color()).getHex()).toBe(0x00ff00);
    const m = new THREE.Matrix4();
    paint.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([100, 5, -50]);
    // Without the lamp (its box is turned down).
    const some = site.meshes((g) => {
      g.computeBoundingBox();
      return g.boundingBox!.max.y < 5 + 5;
    });
    expect(some.some((o) => o.name.startsWith('outpost lamp'))).toBe(false);
    expect(some.some((o) => o.name.startsWith('outpost cabin'))).toBe(true);
  });
});

/** Every building put down in a world: its kind and where (one instance each, from its kind's first slot). */
function buildings(group: THREE.Object3D): Array<{ kind: OutpostKind; m: THREE.Matrix4 }> {
  const out: Array<{ kind: OutpostKind; m: THREE.Matrix4 }> = [];
  group.traverse((o) => {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.name.startsWith('outpost ')) return;
    const [, kind, slot] = mesh.name.split(' ') as [string, OutpostKind, string];
    if ([...kit.get(kind)!.slots.keys()][0] !== slot) return;
    for (let i = 0; i < mesh.count; i++) {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(i, m);
      out.push({ kind, m: m.premultiply(mesh.matrixWorld) });
    }
  });
  return out;
}

/** Whether two buildings' boxes (each shrunk by `slack` all round) overlap: in height, and in plan (separating axes). */
function overlap(a: { kind: OutpostKind; m: THREE.Matrix4 }, b: { kind: OutpostKind; m: THREE.Matrix4 }, slack = 0.4): boolean {
  const corners = (p: { kind: OutpostKind; m: THREE.Matrix4 }) => {
    const box = kit.get(p.kind)!.box.clone().expandByScalar(-slack);
    const pts = [
      [box.min.x, box.min.z],
      [box.max.x, box.min.z],
      [box.max.x, box.max.z],
      [box.min.x, box.max.z],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(p.m));
    const y = p.m.elements[13];
    return { pts, y0: y + box.min.y, y1: y + box.max.y };
  };
  const A = corners(a);
  const B = corners(b);
  if (A.y1 <= B.y0 || B.y1 <= A.y0) return false;
  for (const poly of [A.pts, B.pts]) {
    for (let i = 0; i < 2; i++) {
      const e = poly[i + 1].clone().sub(poly[i]);
      const n = new THREE.Vector2(-e.z, e.x);
      const span = (ps: THREE.Vector3[]) => ps.map((p) => p.x * n.x + p.z * n.y);
      const sa = span(A.pts);
      const sb = span(B.pts);
      if (Math.max(...sa) <= Math.min(...sb) || Math.max(...sb) <= Math.min(...sa)) return false;
    }
  }
  return true;
}

describe('the outposts in their worlds', () => {
  beforeAll(() => {
    vi.stubGlobal('document', fakeDocument());
    useOutpostModel(kit);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    useOutpostModel(null);
  });

  const expected: Record<string, OutpostKind[]> = {
    canyon: ['garages', 'truck', 'hospitality', 'helipad', 'car', 'lamp', 'canopy', 'shop'],
    titan: ['crane', 'container', 'cabin', 'workshop', 'tankfarm', 'helipad', 'mast', 'lamp', 'tarp'],
    frostline: ['module', 'link', 'radome', 'hangar', 'tankfarm', 'helipad', 'mast', 'flag'],
  };
  for (const [id, kinds] of Object.entries(expected)) {
    it(`${id}: its buildings are all there, and none stands in another`, () => {
      const def = TRACKS.find((t) => t.id === id)!;
      const world = buildWorld(buildTrack(def), themeFor(def.theme));
      world.group.updateMatrixWorld(true);
      const all = buildings(world.group);
      for (const kind of kinds) expect(all.some((b) => b.kind === kind), kind).toBe(true);
      for (const b of all) for (const v of b.m.elements) expect(Number.isFinite(v)).toBe(true);
      // (A crane's jib and a mast's guys reach out over what is under them.)
      const solid = all.filter((b) => b.kind !== 'crane' && b.kind !== 'mast');
      const clashes: string[] = [];
      for (let i = 0; i < solid.length; i++)
        for (let j = i + 1; j < solid.length; j++)
          if (overlap(solid[i], solid[j])) {
            const p = new THREE.Vector3().setFromMatrixPosition(solid[i].m);
            clashes.push(`${solid[i].kind} and ${solid[j].kind} at (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
          }
      expect(clashes).toEqual([]);
      // And nothing in the world with no shape: every position a number.
      const bad: string[] = [];
      world.group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        const p = g?.attributes?.position?.array;
        if (p && Array.prototype.some.call(p, (v: number) => !Number.isFinite(v))) bad.push(o.name || (o as THREE.Mesh).type);
      });
      expect(bad).toEqual([]);
    }, 120000);
  }
});

describe("the outposts' painting (the painted background's skins)", () => {
  for (const [id, skin] of Object.entries(OUTPOST_SKINS)) {
    it(`${id}: lays the circuit's own squares, each on a slot its buildings have, with UVs to lay it by`, () => {
      const def = TRACKS.find((t) => t.id === id)!;
      const surfaces = paintedSet(themeFor(def.theme).id)?.surfaces ?? {};
      for (const [key, lay] of Object.entries(skin)) {
        expect(surfaces[lay!.tile], `${key}: ${lay!.tile}`).toBeTruthy();
        if (lay!.lit) expect(surfaces[lay!.lit], `${key}: ${lay!.lit}`).toBeTruthy();
        const [kind, slot] = key.includes('.') ? key.split('.') : [null, key];
        expect(OUTPOST_SLOTS).toContain(slot);
        if (!kind) continue;
        const g = kit.get(kind as OutpostKind)?.slots.get(slot as never);
        expect(g, key).toBeTruthy();
        expect(g!.attributes.uv, key).toBeTruthy();
      }
    });
  }
});

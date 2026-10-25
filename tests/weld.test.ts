// The fast weld (render/mech/weld.ts) against three.js's mergeVertices, on
// every part of every model the game loads, as the game prepares them: the
// same vertices in the same order, the same index, bit for bit.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { weldVertices } from '../src/client/render/mech/weld';

const DIRS = ['src/client/render/mech/assets/roster/', 'src/client/render/mech/assets/'];
const files = DIRS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.glb')).map((f) => d + f));

function same(a: THREE.BufferGeometry, b: THREE.BufferGeometry, what: string): void {
  expect(Object.keys(b.attributes), what).toEqual(Object.keys(a.attributes));
  for (const name of Object.keys(a.attributes)) {
    const x = a.getAttribute(name) as THREE.BufferAttribute, y = b.getAttribute(name) as THREE.BufferAttribute;
    expect(y.array.constructor, `${what} ${name}`).toBe(x.array.constructor);
    expect([y.itemSize, y.normalized, y.count], `${what} ${name}`).toEqual([x.itemSize, x.normalized, x.count]);
    const ax = x.array as ArrayLike<number>, ay = y.array as ArrayLike<number>;
    for (let i = 0; i < ax.length; i++) if (!Object.is(ax[i], ay[i]) && !(ax[i] !== ax[i] && ay[i] !== ay[i])) throw new Error(`${what} ${name}[${i}]: ${ax[i]} vs ${ay[i]}`);
  }
  const ia = a.getIndex()!, ib = b.getIndex()!;
  expect(ib.array.constructor, `${what} index`).toBe(ia.array.constructor);
  expect(Array.from(ib.array as ArrayLike<number>)).toEqual(Array.from(ia.array as ArrayLike<number>));
  expect(b.groups).toEqual(a.groups);
  expect(b.drawRange).toEqual(a.drawRange);
  expect(b.boundingBox).toEqual(a.boundingBox);
  expect(b.boundingSphere).toEqual(a.boundingSphere);
  expect(b.name).toBe(a.name);
}

describe('welding the models', () => {
  it('finds the models', () => expect(files.length).toBeGreaterThanOrEqual(40));
  for (const file of files) {
    it(`${file.split('/').pop()}: the same as mergeVertices`, async () => {
      const bytes = readFileSync(file);
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      gltf.scene.updateMatrixWorld(true);
      let parts = 0;
      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
      for (const o of meshes) {
        // As prepareAssetGeometry has it before welding.
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        g.deleteAttribute('uv');
        same(mergeVertices(g, 1e-5), weldVertices(g, 1e-5), `${o.name}`);
        parts++;
      }
      expect(parts).toBeGreaterThan(0);
    }, 120000);
  }
  it('welds random meshes the same: repeated vertices, near misses, normalized attributes', () => {
    let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let trial = 0; trial < 30; trial++) {
      const n = 50 + Math.floor(rnd() * 400);
      const pool = Array.from({ length: 1 + Math.floor(rnd() * 60) }, () => [rnd() * 10 - 5, rnd() * 10 - 5, rnd() * 10 - 5]);
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const p = pool[Math.floor(rnd() * pool.length)];
        // Some exactly repeated, some a hair off (inside or outside the tolerance).
        const jitter = rnd() < 0.3 ? (rnd() - 0.5) * 1e-4 : 0;
        pos.set([p[0] + jitter, p[1], p[2]], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const col = new Uint8Array(n * 4).map(() => (rnd() < 0.7 ? 255 : Math.floor(rnd() * 256)));
      g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
      g.setAttribute('extra', new THREE.BufferAttribute(new Float32Array(n * 2).map(() => Math.floor(rnd() * 3) / 2), 2));
      if (trial % 2) g.setIndex(Array.from({ length: n * 2 }, () => Math.floor(rnd() * n)));
      g.addGroup(0, 6, 0);
      const tol = [1e-3, 1e-4, 1e-5][trial % 3];
      const a = mergeVertices(g, tol), b = weldVertices(g, tol);
      same(a, b, `trial ${trial}`);
    }
  });

  it('welds a made-up mesh the same, NaN and all', () => {
    const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3).toNonIndexed();
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    p.setX(5, NaN);
    p.setX(9, NaN);
    p.setY(11, -0);
    same(mergeVertices(g, 1e-4), weldVertices(g, 1e-4), 'box');
    const indexed = new THREE.SphereGeometry(1, 12, 8);
    same(mergeVertices(indexed), weldVertices(indexed), 'sphere');
  });
});

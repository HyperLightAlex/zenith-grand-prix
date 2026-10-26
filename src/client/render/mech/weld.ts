// Welding a model's vertices: three.js's mergeVertices, made fast. The
// boot spends seconds in mergeVertices (every mech, every level of detail,
// each part welded as it loads), most of it building a text key for every
// vertex. This gives exactly the same geometry (the same vertices in the
// same order, the same index; tests/weld.test.ts compares the two on every
// model shipped) from numbers instead: each vertex's attributes rounded as
// mergeVertices rounds them, looked up by a hash of those numbers.
import { BufferGeometry, type BufferAttribute } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const GET = ['getX', 'getY', 'getZ', 'getW'] as const;
const SET = ['setX', 'setY', 'setZ', 'setW'] as const;

/** mergeVertices(geometry, tolerance), the same result, faster. */
export function weldVertices(geometry: BufferGeometry, tolerance = 1e-4): BufferGeometry {
  // (Morph targets or interleaved attributes: mergeVertices itself. No model here has either.)
  if (Object.keys(geometry.morphAttributes).length || Object.values(geometry.attributes).some((a) => (a as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute)) return mergeVertices(geometry, tolerance);
  tolerance = Math.max(tolerance, Number.EPSILON);
  const indices = geometry.getIndex();
  const positions = geometry.getAttribute('position');
  const count = indices ? indices.count : positions.count;
  const names = Object.keys(geometry.attributes);
  const attrs = names.map((n) => geometry.getAttribute(n) as BufferAttribute);
  const width = attrs.reduce((a, at) => a + at.itemSize, 0);
  // mergeVertices' rounding: each value times 10^log10(1/tolerance), plus half the tolerance so scaled, truncated.
  const exponent = Math.log10(1 / tolerance);
  const multiplier = Math.pow(10, exponent);
  const additive = tolerance * 0.5 * multiplier;
  const out = attrs.map((at) => new (at.constructor as new (a: ArrayLike<number>, s: number, n: boolean) => BufferAttribute)(new (at.array.constructor as new (n: number) => ArrayLike<number>)(at.count * at.itemSize), at.itemSize, at.normalized));
  // Plain arrays read and written directly; normalized ones through their accessors, as mergeVertices does.
  const direct = attrs.map((at) => !at.normalized);
  const src = attrs.map((at) => at.array as ArrayLike<number>);
  const dst = out.map((o) => o.array as unknown as { [i: number]: number });
  const sizes = attrs.map((at) => at.itemSize);
  // The rounded values of each vertex kept so far, and the buckets of the hash.
  let keys = new Float64Array(Math.max(16, positions.count) * width);
  const buckets = new Map<number, number | number[]>();
  const key = new Float64Array(width);
  const values = new Float64Array(width);
  const newIndices = new Array<number>(count);
  // Equal keys as mergeVertices compares them (as text: NaN equals NaN, 0 equals -0).
  const same = (at: number): boolean => {
    const o = at * width;
    for (let c = 0; c < width; c++) {
      const a = keys[o + c], b = key[c];
      if (a !== b && !(a !== a && b !== b)) return false;
    }
    return true;
  };
  const idx = indices ? (indices.array as ArrayLike<number>) : null;
  const idxDirect = !!indices && !indices.normalized;
  let next = 0;
  for (let i = 0; i < count; i++) {
    const index = indices ? (idxDirect ? idx![i] : indices.getX(i)) : i;
    let h = 0x811c9dc5;
    for (let j = 0, c = 0; j < attrs.length; j++) {
      const n = sizes[j], arr = src[j], at = attrs[j], plain = direct[j];
      for (let k = 0; k < n; k++, c++) {
        const raw = plain ? arr[index * n + k] : at[GET[k]](index);
        values[c] = raw;
        const v = Math.trunc(raw * multiplier + additive);
        key[c] = v;
        h = Math.imul(h ^ (v | 0), 16777619);
        h = Math.imul(h ^ ((v / 4294967296) | 0), 16777619);
      }
    }
    const bucket = buckets.get(h);
    let found = -1;
    if (typeof bucket === 'number') found = same(bucket) ? bucket : -1;
    else if (bucket) for (const at of bucket) if (same(at)) { found = at; break; }
    if (found >= 0) {
      newIndices[i] = found;
      continue;
    }
    for (let j = 0, c = 0; j < attrs.length; j++) {
      const n = sizes[j];
      if (direct[j]) {
        const d = dst[j];
        for (let k = 0; k < n; k++, c++) d[next * n + k] = values[c];
      } else {
        const o = out[j];
        for (let k = 0; k < n; k++, c++) o[SET[k]](next, values[c]);
      }
    }
    if ((next + 1) * width > keys.length) {
      const grown = new Float64Array(keys.length * 2);
      grown.set(keys);
      keys = grown;
    }
    keys.set(key, next * width);
    if (bucket === undefined) buckets.set(h, next);
    else if (typeof bucket === 'number') buckets.set(h, [bucket, next]);
    else bucket.push(next);
    newIndices[i] = next++;
  }
  // As mergeVertices: the same geometry (its name, groups, bounds, draw range,
  // as BufferGeometry.copy has them), with the welded attributes and index.
  // (Not copy() itself: it would copy every attribute only to replace it.)
  const result = new BufferGeometry();
  result.name = geometry.name;
  result.morphTargetsRelative = geometry.morphTargetsRelative;
  for (const g of geometry.groups) result.addGroup(g.start, g.count, g.materialIndex);
  if (geometry.boundingBox) result.boundingBox = geometry.boundingBox.clone();
  if (geometry.boundingSphere) result.boundingSphere = geometry.boundingSphere.clone();
  result.drawRange.start = geometry.drawRange.start;
  result.drawRange.count = geometry.drawRange.count;
  result.userData = geometry.userData;
  names.forEach((name, j) => {
    const o = out[j];
    result.setAttribute(name, new (o.constructor as new (a: ArrayLike<number>, s: number, n: boolean) => BufferAttribute)((o.array as Float32Array).slice(0, next * o.itemSize), o.itemSize, o.normalized));
  });
  result.setIndex(newIndices);
  return result;
}

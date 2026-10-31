import * as THREE from 'three';
import data from './assets/roster/prepared-markings.json';
import type { PreparedRosterMarking } from './rosterAsset';

/** Approved decal planes, captured against retained main-model surfaces.
 * Production loads this small cache rather than carrying the old models and
 * reconstructing their procedural decals on every page load. */
type StoredMarking = Omit<PreparedRosterMarking, 'geometry'> & {
  attributes: Record<string, { itemSize: number; array: number[] }>;
  index: number[];
};
const records = data.records as unknown as Record<string, StoredMarking[]>;
const cache = new Map<string, PreparedRosterMarking[]>();

export function loadPreparedRosterMarkings(id: string): PreparedRosterMarking[] {
  const cached = cache.get(id);
  if (cached) return cached;
  const marks = (records[id] ?? []).map(({ attributes, index, ...mark }) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(attributes)) {
      geometry.setAttribute(name, new THREE.Float32BufferAttribute(attribute.array, attribute.itemSize));
    }
    geometry.setIndex(index);
    return { ...mark, geometry };
  });
  cache.set(id, marks);
  return marks;
}

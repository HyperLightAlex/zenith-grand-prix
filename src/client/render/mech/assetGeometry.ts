import type { BufferGeometry, Matrix4 } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bake and compact once at load time, retaining authored normal seams.
 * Armor uses projected panels; only the separate detail overlays need UVs. */
export function prepareAssetGeometry(source: BufferGeometry, transform: Matrix4, detail = false): BufferGeometry {
  const geometry = source.clone().applyMatrix4(transform);
  if (detail) return geometry;
  geometry.deleteAttribute('uv');
  const compact = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  return compact;
}

import { Matrix3, type BufferGeometry, type Matrix4 } from 'three';
import { weldVertices } from './weld';

/** Bake and compact once at load time, retaining authored normal seams.
 * Armor uses projected panels; only the separate detail overlays need UVs. */
export function prepareAssetGeometry(source: BufferGeometry, transform: Matrix4, detail = false): BufferGeometry {
  const geometry = source.clone().applyMatrix4(transform);
  const outline=geometry.getAttribute('_outline_normal');
  if (outline) outline.applyNormalMatrix(new Matrix3().getNormalMatrix(transform));
  if (detail) return geometry;
  geometry.deleteAttribute('uv');
  // (mergeVertices, the same result, faster: weld.ts.)
  const compact = weldVertices(geometry, 1e-5);
  geometry.dispose();
  return compact;
}

// Many small still meshes drawn as a few: the scenery built a piece at a
// time (a billboard's board, its back and posts; a brake board; a gate's
// posts and lintel) costs a draw call a piece, and on a circuit those come
// to hundreds. Merged, each material's pieces are one mesh and one call.
// For what never moves on its own, nor is looked up by name after: what
// moves, blinks or is found later stays as it was.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const inverse = new THREE.Matrix4();
const local = new THREE.Matrix4();

/**
 * The meshes under `roots` (taken out of the scene), merged by material
 * into one group's meshes, placed as they were relative to `into` (whose
 * child the group is to be). Their own visibility is kept by leaving out
 * any mesh hidden at the time; the group stands for all the roots together
 * (show or hide it as they were shown or hidden together).
 */
export function mergeStatic(roots: THREE.Object3D[], into: THREE.Object3D, name = 'merged'): THREE.Group {
  const out = new THREE.Group();
  out.name = name;
  into.updateMatrixWorld(true);
  inverse.copy(into.matrixWorld).invert();
  // By material, and by the attributes the pieces carry (merged geometries must carry the same).
  const sets = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[]; renderOrder: number; first: THREE.Mesh }>();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(mesh.material)) return;
      // (Hidden inside the root itself: it stays hidden.)
      for (let p: THREE.Object3D | null = mesh; p && p !== root.parent; p = p.parent) if (!p.visible && p !== root) return;
      local.multiplyMatrices(inverse, mesh.matrixWorld);
      let g = mesh.geometry.clone().applyMatrix4(local);
      if (g.index) g = g.toNonIndexed();
      g.morphAttributes = {};
      g.clearGroups();
      const names = Object.keys(g.attributes).sort().join(',');
      const key = `${mesh.material.uuid}|${names}|${mesh.renderOrder}`;
      const set = sets.get(key) ?? { material: mesh.material, parts: [], renderOrder: mesh.renderOrder, first: mesh };
      set.parts.push(g);
      sets.set(key, set);
    });
    root.parent?.remove(root);
  }
  for (const { material, parts, renderOrder, first } of sets.values()) {
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = first.name;
    mesh.renderOrder = renderOrder;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.frustumCulled = first.frustumCulled;
    // It stands still: no matrix to work out each frame.
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  out.matrixAutoUpdate = false;
  return out;
}

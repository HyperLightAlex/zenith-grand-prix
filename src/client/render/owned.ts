// What a circuit's scenery owns that its meshes do not show: freed with it
// (disposeTree in themes.ts). A material's textures are found on it when they
// are its own properties or its uniforms; one that hands textures to its
// shader by itself (onBeforeCompile) names them here, and a mesh that
// changes material with the look names the one it is not wearing.
import type * as THREE from 'three';

/** Textures `material` uses that are not on it where disposeTree looks: freed with it. */
export function ownTextures(material: THREE.Material, ...textures: Array<THREE.Texture | null | undefined>): void {
  const own = (material.userData.ownTextures ??= []) as THREE.Texture[];
  for (const t of textures) if (t && !own.includes(t)) own.push(t);
}

/** Materials `object` wears now and then (the look's two): freed with it, whichever it has on. */
export function alsoWears(object: THREE.Object3D, ...materials: Array<THREE.Material | null | undefined>): void {
  const all = (object.userData.alsoWears ??= []) as THREE.Material[];
  for (const m of materials) if (m && !all.includes(m)) all.push(m);
}

// A Blender model built of material slots (the grandstand, the hover
// screen, the outposts' buildings): each mesh one material, named for its
// slot, which the game paints itself. Read into one geometry to a slot, in
// the model's own frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** A model's meshes, one geometry to a slot (its own frame). */
export type SlotModel<S extends string> = Map<S, THREE.BufferGeometry>;

/**
 * Read a model's slots from its scene: each mesh's geometry, its node's
 * transforms baked in, by its material's name (`frame`: into that frame,
 * from the world's). Its UVs' v turned to run up the picture as Blender's
 * do (glTF's run down it), so the game's own textures (drawn the right way
 * up) lie on it as the Blender script lays them out.
 */
export function readSlots<S extends string>(scene: THREE.Object3D, slots: readonly S[], frame?: THREE.Matrix4): SlotModel<S> {
  const out: SlotModel<S> = new Map();
  scene.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name as S;
    if (!slots.includes(name) || out.has(name)) return;
    const g = mesh.geometry.clone().applyMatrix4(frame ? m.multiplyMatrices(frame, mesh.matrixWorld) : mesh.matrixWorld);
    const uv = g.attributes.uv;
    if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    out.set(name, g);
  });
  return out;
}

/**
 * The model at `url` (none: not in the build), loaded once at boot for
 * whatever is built after, read by `read`; `get` is null until then, or
 * without it.
 */
export function modelLoader<M>(url: string | undefined, read: (scene: THREE.Object3D) => M, what: string) {
  let model: M | null = null;
  let loading: Promise<M | null> | undefined;
  return {
    load(): Promise<M | null> {
      return (loading ??= (async () => {
        if (!url) return null;
        try {
          model = read((await new GLTFLoader().loadAsync(url)).scene);
        } catch (error) {
          console.warn(`The ${what} model failed to load`, error);
          model = null;
        }
        return model;
      })());
    },
    get: (): M | null => model,
    /** Use this model (the tests', read from the file), or none. */
    use(m: M | null): void {
      model = m;
    },
  };
}

/** A slot model at `url` (modelLoader). */
export function slotModel<S extends string>(url: string | undefined, slots: readonly S[], what: string) {
  return modelLoader(url, (scene) => readSlots(scene, slots), what);
}

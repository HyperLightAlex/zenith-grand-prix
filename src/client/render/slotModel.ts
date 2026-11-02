// A Blender model built of material slots (the grandstand, the hover
// screen): each mesh one material, named for its slot, which the game
// paints itself. Read into one geometry to a slot, in the model's own frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** A model's meshes, one geometry to a slot (its own frame). */
export type SlotModel<S extends string> = Map<S, THREE.BufferGeometry>;

/**
 * Read a model's slots from its scene: each mesh's geometry, its node's
 * transforms baked in, by its material's name. Its UVs' v turned to run up
 * the picture as Blender's do (glTF's run down it), so the game's own
 * textures (drawn the right way up) lie on it as the Blender script lays
 * them out.
 */
export function readSlots<S extends string>(scene: THREE.Object3D, slots: readonly S[]): SlotModel<S> {
  const out: SlotModel<S> = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name as S;
    if (!slots.includes(name) || out.has(name)) return;
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const uv = g.attributes.uv;
    if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    out.set(name, g);
  });
  return out;
}

/**
 * The model at `url` (none: not in the build), loaded once at boot for
 * whatever is built after; `get` is null until then, or without it.
 */
export function slotModel<S extends string>(url: string | undefined, slots: readonly S[], what: string) {
  let model: SlotModel<S> | null = null;
  let loading: Promise<SlotModel<S> | null> | undefined;
  return {
    load(): Promise<SlotModel<S> | null> {
      return (loading ??= (async () => {
        if (!url) return null;
        try {
          model = readSlots((await new GLTFLoader().loadAsync(url)).scene, slots);
        } catch (error) {
          console.warn(`The ${what} model failed to load`, error);
          model = null;
        }
        return model;
      })());
    },
    get: (): SlotModel<S> | null => model,
    /** Use this model (the tests', read from the file), or none. */
    use(m: SlotModel<S> | null): void {
      model = m;
    },
  };
}

// The grandstands' Blender model (art/blender/grandstand/README.txt): one
// stand, terraced seating behind a parapet, walled at its ends and back, a
// cantilevered roof on five columns. The track (trackMesh.ts) puts one at
// each place a stand goes and paints it; the crowd's flashes and flags
// (crowd.ts) go on its seating.
//
// The stand's own frame, as the model is: its front (the parapet's face) on
// z = 0 facing +z, toward the road; the road's level on y = 0; 120 along x,
// centred. Each mesh is one material slot, by its material's name.
import type * as THREE from 'three';
import { readSlots, slotModel, type SlotModel } from '../slotModel';

const urls = import.meta.glob('./assets/grandstand.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const GRANDSTAND_SLOTS = ['crowd', 'concrete', 'roof', 'steel', 'accent', 'glass', 'lamp'] as const;
export type GrandstandSlot = (typeof GRANDSTAND_SLOTS)[number];

/** The stand's length (along x), and how far back from its front it reaches. */
export const GRANDSTAND_LENGTH = 120;
export const GRANDSTAND_DEPTH = 24;
/** How far below the road its walls go (the Blender script's BOTTOM). */
export const GRANDSTAND_FOOT = -14;

/**
 * Where the crowd is, in the stand's frame: along x from -half to half,
 * up the rows from the first (its tread's front edge at `front`: y, z) to
 * the last (at `back`), `rows` of them, each `depth` deep. A row's people
 * stand against the riser at the back of its tread, a little under a metre.
 */
export const SEATING = { half: 59, front: [4.6, -1.2], back: [18.1, -19.95], rows: 16, depth: 1.25 } as const;

/**
 * The crowd's UVs (see the Blender script): a row to every 1/rows of v, each
 * row's people on the riser behind it and then its step on the tread, the
 * step's share of the row this much.
 */
export const CROWD_STEP = 0.31;

/** The model's meshes, one geometry to a slot (its own frame). */
export type GrandstandModel = SlotModel<GrandstandSlot>;

/** Read the model's slots from its scene (slotModel.ts). */
export const readGrandstand = (scene: THREE.Object3D): GrandstandModel => readSlots(scene, GRANDSTAND_SLOTS);

const model = slotModel(urls['./assets/grandstand.glb'], GRANDSTAND_SLOTS, 'grandstand');
/** Load the model (once), for the tracks built after it to use. Null when it is not in the build. */
export const loadGrandstand = model.load;
/** The model once loaded; null before (or without it), when the track builds its plain stands. */
export const grandstandModel = model.get;
/** Use this model (the tests', read from the file), or none. */
export const useGrandstandModel = model.use;

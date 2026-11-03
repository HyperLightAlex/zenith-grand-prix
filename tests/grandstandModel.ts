// The grandstands' (and the hover screens', the outposts') models for the
// tests that build circuits' scenery: read from their files (the game loads
// them at boot), so what they check is what the game shows. Not a test file
// itself.

import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readGrandstand, useGrandstandModel, type GrandstandModel } from '../src/client/render/grandstand/grandstand';

export const GRANDSTAND_FILE = new URL('../src/client/render/grandstand/assets/grandstand.glb', import.meta.url);

export async function readGrandstandFile(): Promise<GrandstandModel> {
  const bytes = readFileSync(GRANDSTAND_FILE);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return readGrandstand(gltf.scene);
}

/** Build with the model's stands from here on (until `useGrandstandModel(null)`). */
export async function withGrandstandModel(): Promise<void> {
  useGrandstandModel(await readGrandstandFile());
}

export const HOVER_SCREEN_FILE = new URL('../src/client/render/screens/assets/hoverscreen.glb', import.meta.url);

export async function readHoverScreenFile() {
  const { readHoverScreen } = await import('../src/client/render/screens/hoverScreens');
  const bytes = readFileSync(HOVER_SCREEN_FILE);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return readHoverScreen(gltf.scene);
}

export const OUTPOSTS_FILE = new URL('../src/client/render/outposts/assets/outposts.glb', import.meta.url);

/** Build with the outposts' buildings from here on (until `useOutpostModel(null)`). */
export async function withOutpostModel(): Promise<void> {
  const { readOutposts, useOutpostModel } = await import('../src/client/render/outposts/outposts');
  const bytes = readFileSync(OUTPOSTS_FILE);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  useOutpostModel(readOutposts(gltf.scene));
}

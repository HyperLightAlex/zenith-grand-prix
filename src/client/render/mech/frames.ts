// The three frame types and each faction's design of them. Solstice's: the
// Swift (forward) gaunt and biomechanical, the Vector (midfielder) a
// motorsport machine, the Bulwark (defender) a spiky super robot; Vanta's
// (vanta/): the Razor, the Stinger and the Maul. Original designs, built part
// by part with the kit; each design's builder is in its own file. Model
// space: +z forward, +y up, +x to the mech's left.
import type * as THREE from 'three';
import { ROLE, type Role } from '../../../sim/config';
import type { Livery } from '../palette';
import { buildBulwark } from './bulwark';
import { glowMaterial } from './kit';
import { frameCtx } from './parts';
import { MechRig, type FrameDims } from './rig';
import { buildSwift } from './swift';
import { buildVector } from './vector';
import { buildMaul } from './vanta/maul';
import { buildRazor } from './vanta/razor';
import { buildStinger } from './vanta/stinger';

const DIMS: Record<Role, FrameDims> = {
  [ROLE.FW]: { hipY: 5.5, hipX: 0.72, hipDrop: 0.25, thigh: 2.35, shin: 2.3, ankleY: 0.6, spineY: 0.4, chestY: 0.8, shoulderX: 1.5, shoulderY: 0.95, headY: 1.5, headZ: 0.15, upperArm: 1.5, foreArm: 1.45, height: 8.8 },
  [ROLE.MF]: { hipY: 5.25, hipX: 0.82, hipDrop: 0.25, thigh: 2.2, shin: 2.15, ankleY: 0.65, spineY: 0.45, chestY: 0.85, shoulderX: 1.75, shoulderY: 1.0, headY: 1.55, headZ: 0.12, upperArm: 1.5, foreArm: 1.5, height: 8.7 },
  [ROLE.DF]: { hipY: 5.05, hipX: 1.0, hipDrop: 0.3, thigh: 2.05, shin: 2.0, ankleY: 0.7, spineY: 0.5, chestY: 0.95, shoulderX: 2.25, shoulderY: 1.05, headY: 1.55, headZ: 0.2, upperArm: 1.55, foreArm: 1.6, height: 8.7 },
};

type Builder = (c: ReturnType<typeof frameCtx>, number: string) => void;

/**
 * Each faction's own design of each frame type, by role (docs/FACTIONS.md).
 * Every design is built on its frame type's skeleton (DIMS) with its weapons
 * and thrusters in the same places, so the poses and the balance carry over.
 * A faction without its own designs yet flies Solstice's.
 */
const DESIGNS: Record<string, Partial<Record<Role, Builder>>> = {
  solstice: { [ROLE.FW]: buildSwift, [ROLE.MF]: buildVector, [ROLE.DF]: buildBulwark },
  vanta: { [ROLE.FW]: buildRazor, [ROLE.MF]: buildStinger, [ROLE.DF]: buildMaul },
};

export function buildFrame(role: Role, livery: Livery, number: string): MechRig {
  const rig = new MechRig(DIMS[role]);
  const build = DESIGNS[livery.id]?.[role] ?? DESIGNS.solstice[role]!;
  build(frameCtx(rig, livery), number);
  return rig;
}

/** The flame time uniform is on the team's shared flame material; update it for a rig's flames. */
export function setFlameTime(rig: MechRig, t: number): void {
  if (rig.flames.length) (rig.flames[0].mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
}

export { glowMaterial };

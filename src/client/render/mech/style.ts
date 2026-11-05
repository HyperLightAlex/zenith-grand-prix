// A mech's livery style on its armour (docs/CUSTOMIZATION.md, "Livery"): a
// pattern over its main paint in a paint of its own, how its paint is
// finished, and how worn it is. Each mech has its armour material of its own
// for it (one program for all of them: only the values differ), and the race
// view keeps its wear up with its armour.

import * as THREE from 'three';
import { decodeBuild, LINES, PAINTS, raceNumber, styleOf, WEARS, type LiveryStyle } from '../../../custom/mechBuild';
import type { Role } from '../../../sim/index';
import { video } from '../../video';
import type { Livery } from '../palette';
import { buildCustomFrame } from './customFrame';
import { buildFrame } from './frames';
import { armorMat, armorStyle, type ArmorStyle } from './kit';
import type { MechRig } from './rig';

/** How worn a mech starts, and how much its armour going adds, by its wear (WEARS). */
const WEAR_BASE = { race: 0, clean: 0, veteran: 0.45 } as const;
const WEAR_GAIN = { race: 0.85, clean: 0, veteran: 0.55 } as const;

interface Dressed {
  style: ArmorStyle;
  material: THREE.MeshToonMaterial;
  base: number;
  gain: number;
  /** The most worn it has been: armour coming back does not clean it. */
  worst: number;
}

const dressed = new WeakMap<MechRig, Dressed>();

/** Give a rig its armour material of its own, in a livery style. */
export function dressRig(rig: MechRig, s: LiveryStyle): void {
  const style = armorStyle();
  const shared = armorMat();
  const material = armorMat(style);
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material === shared) mesh.material = material;
  });
  // (The cel shading goes on with the rest of the mech's, once it is marked
  // as a character: markCharacter, then celify.)
  const paint = PAINTS[s.patternPaint] ?? PAINTS[0];
  style.uPattern.value = s.pattern;
  style.uPatColor.value.setHex(paint.color);
  style.uPatShade.value.setHex(paint.shade);
  style.uFinish.value = s.finish;
  style.uPanels.value = LINES[s.lines] === 'off' ? 0 : 1;
  const wear = WEARS[s.wear] ?? 'race';
  style.uWear.value = WEAR_BASE[wear];
  dressed.set(rig, { style, material, base: WEAR_BASE[wear], gain: WEAR_GAIN[wear], worst: 0 });
}

/**
 * How much of its armour a mech has lost (0 to 1; a knockout counts as all
 * of it), for its wear: the worst it has been this race.
 */
export function wearRig(rig: MechRig, lost: number): void {
  const d = dressed.get(rig);
  if (!d) return;
  d.worst = Math.max(d.worst, Math.min(1, Math.max(0, lost)));
  // Battle damage off (Settings, Video): the livery's own wear, nothing gathered.
  d.style.uWear.value = Math.min(1, d.base + (video.damage ? d.worst * d.gain : 0));
}

/** Its material, freed with it. */
export function undressRig(rig: MechRig): void {
  dressed.get(rig)?.material.dispose();
  dressed.delete(rig);
}

/**
 * A seat's mech: its custom build (its parts, paint, number and style) or
 * its faction's stock mech, in `livery`, its race number on it.
 */
export function rigForSeat(m: { role: Role; look: string }, livery: Livery): MechRig {
  const custom = m.look ? decodeBuild(m.look) : null;
  const number = raceNumber(m.role, custom);
  const rig = custom ? buildCustomFrame(m.role, livery, custom, number) : buildFrame(m.role, livery, number);
  dressRig(rig, styleOf(custom));
  return rig;
}

// Victory poses: how a pilot stands on the podium (and in the hangar while
// one is being chosen). Each is a pose held, and moved a little in time: a
// fist pumped, a bounce, a breath. Angles as in rig.ts: an arm's x swings it
// back (negative: forward and up), its z lifts it out to the side (the left
// arm's positive, the right's negative); an elbow's x bends it.
//
// No arm is ever raised straight out ahead and up, still or on its way
// anywhere: a single arm goes up only to the sky, near upright, bent or with
// a fist. Nothing here can read as a salute.

import { makePose, type Pose } from './rig';

export const VICTORY_IDS = ['fist', 'arms', 'crossed', 'hips', 'point', 'bow', 'clap', 'pump', 'champion'] as const;
export type VictoryId = (typeof VICTORY_IDS)[number];

export const VICTORY_NAMES: Record<VictoryId, string> = {
  fist: 'Fist in the air',
  arms: 'Both arms up',
  crossed: 'Arms crossed',
  point: 'Pointing to the sky',
  hips: 'Hands on hips',
  bow: 'A bow',
  clap: 'Applause for the crowd',
  pump: 'The double fist pump',
  champion: "The champion's flex",
};

/** Upright, feet planted a little apart, chest out. */
const stance = makePose({
  hips: [-0.22, 0, 0.02, 0, 0],
  spine: [-0.06, 0, 0],
  chest: [-0.08, 0, 0],
  head: [-0.12, 0, 0],
  shL: [0.08, 0, 0.22],
  elL: [-0.3, 0, 0],
  shR: [0.08, 0, -0.22],
  elR: [-0.3, 0, 0],
  footL: [1.2, 0, 0.15, 0, -0.12],
  footR: [-1.2, 0, -0.05, 0, 0.12],
  wingL: [0.05, 0.35, 0.2],
  wingR: [0.05, -0.35, -0.2],
});

const BASE: Record<VictoryId, Pose> = {
  fist: makePose({
    ...stance,
    chest: [-0.12, -0.08, 0],
    head: [-0.28, 0.1, 0],
    shL: [0.15, 0, 0.3],
    elL: [-0.55, 0, 0],
    shR: [-2.9, 0, -0.28],
    elR: [-0.45, 0, 0],
    wrR: [0, 0, 0],
  }),
  arms: makePose({
    ...stance,
    chest: [-0.2, 0, 0],
    head: [-0.38, 0, 0],
    shL: [-2.55, 0, 0.62],
    elL: [-0.2, 0, 0],
    shR: [-2.55, 0, -0.62],
    elR: [-0.2, 0, 0],
    wingL: [0.15, 0.7, 0.35],
    wingR: [0.15, -0.7, -0.35],
  }),
  crossed: makePose({
    ...stance,
    hips: [-0.2, 0, 0.0, 0.12, 0.04],
    chest: [-0.12, -0.1, 0],
    head: [-0.1, -0.12, 0],
    shL: [-0.05, -1.15, 0.55],
    elL: [-1.7, 0, 0],
    shR: [-0.1, 1.15, -0.55],
    elR: [-1.7, 0, 0],
    footL: [1.3, 0, 0.2, 0, -0.2],
    footR: [-1.15, 0, -0.1, 0, 0.1],
  }),
  // The right hand on high, straight up at the sky (upright: never out ahead), the left on the hip.
  point: makePose({
    ...stance,
    chest: [-0.15, -0.12, 0],
    head: [-0.55, -0.1, 0],
    shL: [0.15, 0, 0.9],
    elL: [-0.3, 0, -1.5],
    shR: [-3.02, 0, -0.16],
    elR: [-0.05, 0, 0],
  }),
  hips: makePose({
    ...stance,
    hips: [-0.25, 0, 0.0, 0, 0],
    chest: [-0.18, 0, 0],
    head: [-0.2, 0, 0],
    shL: [0.15, 0, 0.9],
    elL: [-0.3, 0, -1.5],
    shR: [0.15, 0, -0.9],
    elR: [-0.3, 0, 1.5],
    footL: [1.35, 0, 0.1, 0, -0.15],
    footR: [-1.35, 0, 0.1, 0, 0.15],
  }),
  bow: makePose({
    ...stance,
    hips: [-0.3, -0.15, -0.15, 0, 0],
    spine: [0.35, 0, 0],
    chest: [0.35, 0, 0],
    head: [0.35, 0, 0],
    shL: [-0.25, 0, 0.12],
    elL: [-0.2, 0, 0],
    shR: [-0.45, 0, -0.2],
    elR: [-1.5, 0, 0],
    footL: [0.9, 0, 0.05, 0, 0],
    footR: [-0.9, 0, 0.05, 0, 0],
  }),
  // Applauding the crowd: both hands together in front of the chest.
  clap: makePose({
    ...stance,
    chest: [-0.16, 0, 0],
    head: [-0.22, 0, 0],
    shL: [-0.4, -0.9, 0.35],
    elL: [-1.05, 0, 0],
    shR: [-0.4, 0.9, -0.35],
    elR: [-1.05, 0, 0],
  }),
  // Both fists pulled down to the waist, knees giving: "Yes!"
  pump: makePose({
    ...stance,
    hips: [-0.3, 0, 0.0, 0, 0],
    chest: [-0.1, 0, 0],
    head: [-0.34, 0, 0],
    shL: [0.3, 0, 0.32],
    elL: [-1.9, 0, 0],
    shR: [0.3, 0, -0.32],
    elR: [-1.9, 0, 0],
    footL: [1.4, 0, 0.18, 0, -0.18],
    footR: [-1.4, 0, 0.18, 0, 0.18],
  }),
  // Both arms out, bent up at the elbows: the strongman's double flex.
  champion: makePose({
    ...stance,
    hips: [-0.26, 0, 0.0, 0, 0],
    chest: [-0.24, 0, 0],
    head: [-0.3, 0, 0],
    shL: [-0.15, 0, 1.35],
    elL: [0, 0, 1.75],
    shR: [-0.15, 0, -1.35],
    elR: [0, 0, -1.75],
    footL: [1.35, 0, 0.12, 0, -0.18],
    footR: [-1.35, 0, 0.12, 0, 0.18],
    wingL: [0.15, 0.6, 0.3],
    wingR: [0.15, -0.6, -0.3],
  }),
};

/**
 * The pose at time `t` (seconds since it was struck), written into `out`:
 * the held pose, moving.
 */
export function victoryPose(id: VictoryId, t: number, out: Pose): Pose {
  const base = BASE[id] ?? BASE.fist;
  for (const k of Object.keys(base) as Array<keyof Pose>) {
    const a = out[k] as number[];
    const b = base[k] as number[];
    for (let i = 0; i < a.length; i++) a[i] = b[i];
  }
  const breath = Math.sin(t * 1.4);
  out.chest[0] += breath * 0.015;
  switch (id) {
    case 'fist': {
      // Pumped, quickly at first, then now and then.
      const pump = Math.max(0, Math.sin(t * 9)) * Math.max(0.25, 1 - t / 2.5);
      out.shR[0] += pump * 0.35;
      out.elR[0] -= pump * 0.6;
      break;
    }
    case 'arms': {
      // A bounce on the knees.
      const b = Math.abs(Math.sin(t * 4.2)) * Math.max(0.2, 1 - t / 3);
      out.hips[0] -= b * 0.18;
      out.shL[2] += b * 0.08;
      out.shR[2] -= b * 0.08;
      break;
    }
    case 'crossed':
      // A slow nod.
      out.head[0] += Math.sin(t * 0.9) * 0.05;
      break;
    case 'point':
      out.shR[0] += Math.sin(t * 1.1) * 0.05;
      break;
    case 'hips':
      // Looking round the crowd.
      out.head[1] += Math.sin(t * 0.7) * 0.25;
      out.chest[1] += Math.sin(t * 0.7) * 0.06;
      break;
    case 'clap': {
      // Hands apart and together, three claps a second.
      const c = Math.max(0, Math.sin(t * 18));
      out.shL[1] += c * 0.2;
      out.shR[1] -= c * 0.2;
      out.head[1] += Math.sin(t * 0.6) * 0.18;
      break;
    }
    case 'pump': {
      // Pulled down hard, twice, then again now and then.
      const k = Math.max(0, Math.sin(t * 8)) * Math.max(0.2, 1 - t / 2.2);
      out.shL[0] += k * 0.3;
      out.shR[0] += k * 0.3;
      out.elL[0] -= k * 0.35;
      out.elR[0] -= k * 0.35;
      out.hips[0] -= k * 0.12;
      out.head[0] -= k * 0.08;
      break;
    }
    case 'champion': {
      // The flex squeezed, twice a second for a moment, then held and breathing.
      const squeeze = Math.max(0, Math.sin(t * 6)) * Math.max(0.15, 1 - t / 2.5);
      out.elL[2] += squeeze * 0.22;
      out.elR[2] -= squeeze * 0.22;
      out.chest[0] -= squeeze * 0.05;
      break;
    }
    case 'bow': {
      // Down, held, and up again for a moment, every five seconds.
      const p = (t % 5) / 5;
      const down = p < 0.12 ? p / 0.12 : p < 0.55 ? 1 : p < 0.7 ? 1 - (p - 0.55) / 0.15 : 0;
      const k = 1 - down;
      out.spine[0] -= k * 0.4;
      out.chest[0] -= k * 0.42;
      out.head[0] -= k * 0.5;
      out.hips[2] += k * 0.15;
      break;
    }
  }
  return out;
}

/** A computer pilot's pose: its own, always the same. */
export function victoryFor(name: string): VictoryId {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return VICTORY_IDS[(h >>> 0) % VICTORY_IDS.length];
}

export function isVictoryId(v: unknown): v is VictoryId {
  return typeof v === 'string' && (VICTORY_IDS as readonly string[]).includes(v);
}

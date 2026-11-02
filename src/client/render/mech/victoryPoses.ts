// Victory poses: how a pilot stands on the podium (and in the hangar while
// one is being chosen). Each is a pose held, and moved a little in time: a
// fist pumped, a bounce, a breath. Angles as in rig.ts: an arm's x swings it
// back (negative: forward and up), its z lifts it out to the side (the left
// arm's positive, the right's negative); an elbow's x bends it.

import { makePose, type Pose } from './rig';

export const VICTORY_IDS = ['fist', 'arms', 'crossed', 'hips', 'point', 'bow'] as const;
export type VictoryId = (typeof VICTORY_IDS)[number];

export const VICTORY_NAMES: Record<VictoryId, string> = {
  fist: 'Fist in the air',
  arms: 'Both arms up',
  crossed: 'Arms crossed',
  point: 'Pointing to the sky',
  hips: 'Hands on hips',
  bow: 'A bow',
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
  point: makePose({
    ...stance,
    chest: [-0.15, -0.15, 0],
    head: [-0.45, -0.15, 0],
    shL: [0.15, 0, 0.9],
    elL: [-0.3, 0, -1.5],
    shR: [-2.45, 0, -0.55],
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

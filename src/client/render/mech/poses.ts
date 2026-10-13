// The pose library. Every pose is a full-body target; the animator blends
// between them. Angles are radians; see rig.ts for the axis conventions.
import { ATK } from '../../../sim/config';
import { makePose, mirrorPose, type Pose } from './rig';

/** Speed mode: a skater's tuck, arms swept back, wings spread. */
const tuck = makePose({
  hips: [-1.55, -0.2, 0.5, 0, 0],
  spine: [0.35, 0, 0],
  chest: [0.25, 0, 0],
  head: [-0.95, 0, 0],
  shL: [1.05, 0, 0.3],
  elL: [-0.35, 0, 0],
  shR: [1.05, 0, -0.3],
  elR: [-0.35, 0, 0],
  footL: [0.95, 0, 0.95, 0, -0.05],
  footR: [-0.95, 0, -1.25, 0, 0.05],
  wingL: [0.1, 0.5, 0.25],
  wingR: [0.1, -0.5, -0.25],
});

/** Deeper tuck under boost. */
const boost = makePose({
  hips: [-1.95, -0.1, 0.62, 0, 0],
  spine: [0.4, 0, 0],
  chest: [0.28, 0, 0],
  head: [-1.15, 0, 0],
  shL: [1.35, 0, 0.18],
  elL: [-0.1, 0, 0],
  shR: [1.35, 0, -0.18],
  elR: [-0.1, 0, 0],
  footL: [0.8, 0, 0.6, 0, 0],
  footR: [-0.8, 0, -0.9, 0, 0],
  wingL: [0.2, 0.8, 0.4],
  wingR: [0.2, -0.8, -0.4],
});

/**
 * Carving to the right: down low, the outside skate pushed wide and the
 * inside hand trailing along the road. Mirrored for a left carve.
 */
const carveRight = makePose({
  hips: [-2.1, -0.15, 0.62, 0, 0],
  spine: [0.4, 0, -0.08],
  chest: [0.25, 0, -0.06],
  head: [-1.0, -0.15, 0],
  shL: [1.25, 0, 0.35],
  elL: [-0.3, 0, 0],
  shR: [0.35, 0, -0.95],
  elR: [-0.25, 0, 0],
  footL: [1.6, 0, -0.55, 0, -0.18],
  footR: [-0.55, 0, 0.75, 0, 0.12],
  wingL: [0.2, 0.75, 0.4],
  wingR: [0.2, -0.75, -0.4],
});

/** Battle mode: upright, hands up, weight on the back foot. */
const battle = makePose({
  hips: [-0.65, 0, 0.12, 0.25, 0],
  spine: [0.08, 0, 0],
  chest: [0.1, 0.1, 0],
  head: [-0.18, -0.3, 0],
  shL: [-0.85, -0.25, 0.3],
  elL: [-1.55, 0, 0],
  shR: [-0.45, 0.2, -0.45],
  elR: [-1.75, 0, 0],
  footL: [1.0, 0, 0.9, 0, -0.25],
  footR: [-1.15, 0, -0.75, 0, 0.45],
  wingL: [-0.25, 0.1, 0],
  wingR: [-0.25, -0.1, 0],
});

/** Guard: crouched behind crossed forearms. */
const guard = makePose({
  hips: [-1.1, -0.2, 0.2, 0, 0],
  spine: [0.2, 0, 0],
  chest: [0.2, 0, 0],
  head: [-0.3, 0, 0],
  shL: [-1.45, -0.55, 0.1],
  elL: [-1.75, 0, 0],
  shR: [-1.3, 0.55, -0.1],
  elR: [-1.85, 0, 0],
  footL: [1.2, 0, 0.6, 0, -0.3],
  footR: [-1.2, 0, -0.6, 0, 0.3],
  wingL: [-0.4, 0, 0],
  wingR: [-0.4, 0, 0],
});

/** Hit: thrown back off balance. */
const stagger = makePose({
  hips: [-0.5, -0.5, -0.32, 0.2, 0.12],
  spine: [-0.3, 0, 0.1],
  chest: [-0.25, 0.3, 0],
  head: [0.35, 0.2, 0.1],
  shL: [0.2, 0, 1.25],
  elL: [-0.7, 0, 0],
  shR: [-0.5, 0, -1.45],
  elR: [-0.4, 0, 0],
  footL: [1.3, 0.5, 0.9, -0.35, -0.2],
  footR: [-1.0, 0, -0.9, 0, 0.3],
  wingL: [0.3, 0.3, 0.3],
  wingR: [-0.2, -0.1, 0],
});

/** Dash: low and leaning hard into it. */
const dash = makePose({
  hips: [-1.7, 0.4, 0.55, 0, 0],
  spine: [0.3, 0, 0],
  chest: [0.2, 0, 0],
  head: [-0.8, 0, 0],
  shL: [1.2, 0, 0.5],
  elL: [-0.2, 0, 0],
  shR: [1.2, 0, -0.5],
  elR: [-0.2, 0, 0],
  footL: [1.0, 0, 1.6, 0, 0],
  footR: [-1.0, 0.2, -1.9, 0.5, 0],
  wingL: [0.2, 0.9, 0.4],
  wingR: [0.2, -0.9, -0.4],
});

/** Knocked out: down on one knee, head hanging. */
const ko = makePose({
  hips: [-2.75, -0.4, 0.75, 0.2, 0.1],
  spine: [0.4, 0, 0],
  chest: [0.35, 0, 0.1],
  head: [0.55, 0.2, 0],
  shL: [0.1, 0, 0.25],
  elL: [-0.3, 0, 0],
  shR: [-0.3, 0, -0.2],
  elR: [-0.6, 0, 0],
  footL: [0.9, 0, 1.3, 0, -0.2],
  footR: [-1.0, 0, -1.6, 0.9, 0.3],
  wingL: [-0.6, -0.2, -0.2],
  wingR: [-0.7, 0.1, 0.1],
});

/** Across the line: coasting upright with a fist in the air. */
const victory = makePose({
  hips: [-0.5, 0, 0.05, 0, 0],
  spine: [-0.05, 0, 0],
  chest: [-0.1, 0, 0],
  head: [-0.25, 0, 0],
  shL: [0.2, 0, 0.3],
  elL: [-0.5, 0, 0],
  shR: [-2.85, 0, -0.35],
  elR: [-0.5, 0, 0],
  footL: [0.95, 0, 0.5, 0, -0.1],
  footR: [-0.95, 0, -0.6, 0, 0.15],
  wingL: [0.1, 0.5, 0.3],
  wingR: [0.1, -0.5, -0.3],
});

// ---- attacks ---------------------------------------------------------------

const slashWind = makePose({
  hips: [-0.85, -0.1, 0.15, -0.35, 0],
  spine: [0.05, -0.3, 0],
  chest: [0.05, -0.55, 0],
  head: [-0.15, 0.7, 0],
  shL: [-0.9, -0.3, 0.3],
  elL: [-1.5, 0, 0],
  shR: [-0.5, 0, -1.55],
  elR: [-0.5, 0, 0],
  footL: [1.0, 0, 1.0, 0, -0.2],
  footR: [-1.2, 0, -0.9, 0, 0.5],
  wingL: [0, 0.3, 0.1],
  wingR: [0, -0.3, -0.1],
});
const slashHit = makePose({
  hips: [-1.0, 0.4, 0.25, 0.45, 0],
  spine: [0.15, 0.35, 0],
  chest: [0.15, 0.6, 0],
  head: [-0.25, -0.8, 0],
  shL: [0.5, 0, 0.5],
  elL: [-0.8, 0, 0],
  shR: [-1.45, 0, 0.75],
  elR: [-0.15, 0, 0],
  footL: [1.0, 0, 1.4, 0, -0.1],
  footR: [-1.2, 0, -1.1, 0.2, 0.4],
  wingL: [0.1, 0.6, 0.3],
  wingR: [0.1, -0.6, -0.3],
});
const finishWind = makePose({
  hips: [-0.5, -0.3, -0.12, 0, 0],
  spine: [-0.25, 0, 0],
  chest: [-0.2, 0, 0],
  head: [0.2, 0, 0],
  shL: [-2.9, 0, 0.35],
  elL: [-0.5, 0, 0],
  shR: [-2.9, 0, -0.35],
  elR: [-0.5, 0, 0],
  footL: [1.0, 0, 0.6, 0, -0.2],
  footR: [-1.0, 0, -0.8, 0, 0.3],
  wingL: [0.2, 0.9, 0.4],
  wingR: [0.2, -0.9, -0.4],
});
const finishHit = makePose({
  hips: [-1.6, 0.5, 0.45, 0, 0],
  spine: [0.45, 0, 0],
  chest: [0.35, 0, 0],
  head: [-0.7, 0, 0],
  shL: [-1.05, 0, -0.3],
  elL: [-0.2, 0, 0],
  shR: [-1.05, 0, 0.3],
  elR: [-0.2, 0, 0],
  footL: [1.1, 0, 1.5, 0, -0.1],
  footR: [-1.1, 0, -1.3, 0.3, 0.2],
  wingL: [-0.2, 0.2, 0],
  wingR: [-0.2, -0.2, 0],
});
const lanceWind = makePose({
  hips: [-1.75, -0.6, 0.45, -0.3, 0],
  spine: [0.25, -0.2, 0],
  chest: [0.2, -0.3, 0],
  head: [-0.6, 0.5, 0],
  shL: [-1.0, -0.3, 0.2],
  elL: [-1.2, 0, 0],
  shR: [0.9, 0, -0.35],
  elR: [-1.5, 0, 0],
  footL: [1.0, 0, 0.9, 0, -0.1],
  footR: [-1.1, 0, -1.6, 0.4, 0.3],
  wingL: [0.2, 0.9, 0.4],
  wingR: [0.2, -0.9, -0.4],
});
const lanceHit = makePose({
  hips: [-1.45, 0.9, 0.7, 0.35, 0],
  spine: [0.3, 0.2, 0],
  chest: [0.2, 0.3, 0],
  head: [-1.05, -0.45, 0],
  shL: [1.3, 0, 0.4],
  elL: [-0.2, 0, 0],
  shR: [-2.55, 0, 0.12],
  elR: [-0.05, 0, 0],
  footL: [1.0, 0, 2.0, 0, 0],
  footR: [-1.0, 0.3, -2.3, 0.7, 0],
  wingL: [0.25, 1.0, 0.5],
  wingR: [0.25, -1.0, -0.5],
});

/** Arm cannon levelled at the target (battle stance). */
const aim = makePose({
  hips: [-0.8, 0, 0.1, 0.5, 0],
  spine: [0.05, 0.1, 0],
  chest: [0.05, 0.2, 0],
  head: [-0.1, -0.75, 0],
  shL: [-0.6, 0, 0.3],
  elL: [-1.3, 0, 0],
  shR: [-1.5, 0.75, -0.08],
  elR: [-0.06, 0, 0],
  footL: [1.05, 0, 1.0, 0, -0.3],
  footR: [-1.2, 0, -0.9, 0, 0.55],
  wingL: [-0.2, 0.1, 0],
  wingR: [-0.2, -0.1, 0],
});
const aimKick = makePose({ ...aim, shR: [-1.72, 0.75, -0.08], elR: [-0.3, 0, 0], chest: [-0.02, 0.24, 0] });
/** Arm cannon out ahead while staying in the tuck. */
const tuckAim = makePose({ ...tuck, shR: [-2.62, 0, -0.06], elR: [-0.05, 0, 0], head: [-1.0, 0, 0] });
const tuckAimKick = makePose({ ...tuckAim, shR: [-2.85, 0, -0.06], elR: [-0.3, 0, 0] });

const kickWind = makePose({
  hips: [-0.7, -0.3, -0.15, 0.5, 0],
  spine: [-0.1, 0, 0],
  chest: [0, 0.2, 0],
  head: [-0.1, -0.6, 0],
  shL: [-0.8, 0, 0.5],
  elL: [-1.2, 0, 0],
  shR: [0.3, 0, -0.7],
  elR: [-0.8, 0, 0],
  footL: [0.7, 0, 0.1, 0, -0.4],
  footR: [-0.5, 1.9, 0.5, 0.6, 0],
  wingL: [0, 0.4, 0.2],
  wingR: [0, -0.4, -0.2],
});
const kickHit = makePose({
  hips: [-0.6, 0.3, -0.5, 0.9, 0],
  spine: [-0.2, 0, 0],
  chest: [-0.1, -0.3, 0],
  head: [0.35, -0.6, 0],
  shL: [-0.3, 0, 0.9],
  elL: [-0.7, 0, 0],
  shR: [0.6, 0, -0.9],
  elR: [-0.4, 0, 0],
  footL: [0.7, 0, -0.2, 0, -0.6],
  footR: [-0.2, 2.9, 3.6, -1.35, 0],
  wingL: [0.1, 0.7, 0.3],
  wingR: [0.1, -0.7, -0.3],
});

const hookWind = makePose({
  hips: [-1.0, -0.3, 0.15, -0.5, 0],
  spine: [0.05, -0.35, 0],
  chest: [0.05, -0.55, 0],
  head: [-0.15, 0.85, 0],
  shL: [-1.0, -0.3, 0.3],
  elL: [-1.5, 0, 0],
  shR: [0.45, 0, -1.0],
  elR: [-1.75, 0, 0],
  footL: [1.2, 0, 1.0, 0, -0.2],
  footR: [-1.3, 0, -0.9, 0, 0.6],
  wingL: [0, 0, 0],
  wingR: [0, 0, 0],
});
const hookHit = makePose({
  hips: [-1.2, 0.5, 0.3, 0.6, 0],
  spine: [0.2, 0.4, 0],
  chest: [0.15, 0.65, 0],
  head: [-0.3, -0.95, 0],
  shL: [0.5, 0, 0.6],
  elL: [-1.2, 0, 0],
  shR: [-1.5, 0, 0.5],
  elR: [-0.55, 0, 0],
  footL: [1.2, 0, 1.5, 0, -0.1],
  footR: [-1.3, 0, -1.1, 0.25, 0.4],
  wingL: [0, 0, 0],
  wingR: [0, 0, 0],
});
const slamWind = makePose({
  hips: [-0.45, -0.3, -0.2, 0, 0],
  spine: [-0.3, 0, 0],
  chest: [-0.25, 0, 0],
  head: [0.3, 0, 0],
  shL: [-2.95, 0, 0.45],
  elL: [-0.7, 0, 0],
  shR: [-2.95, 0, -0.45],
  elR: [-0.7, 0, 0],
  footL: [1.3, 0, 0.5, 0, -0.25],
  footR: [-1.3, 0, -0.7, 0, 0.3],
  wingL: [0.2, 0, 0.2],
  wingR: [0.2, 0, -0.2],
});
const slamHit = makePose({
  hips: [-1.9, 0.5, 0.55, 0, 0],
  spine: [0.5, 0, 0],
  chest: [0.4, 0, 0],
  head: [-0.8, 0, 0],
  shL: [-0.75, 0, -0.25],
  elL: [-0.35, 0, 0],
  shR: [-0.75, 0, 0.25],
  elR: [-0.35, 0, 0],
  footL: [1.4, 0, 1.4, 0, -0.15],
  footR: [-1.4, 0, -1.2, 0.3, 0.2],
  wingL: [-0.3, 0, 0],
  wingR: [-0.3, 0, 0],
});
/** Scatter cannon: right arm braced by the left hand, wide stance. */
const brace = makePose({
  hips: [-1.15, -0.1, 0.2, 0.35, 0],
  spine: [0.1, 0.1, 0],
  chest: [0.1, 0.15, 0],
  head: [-0.3, -0.5, 0],
  shL: [-1.25, -0.75, 0.1],
  elL: [-1.0, 0, 0],
  shR: [-1.5, 0.5, -0.05],
  elR: [-0.08, 0, 0],
  footL: [1.4, 0, 1.0, 0, -0.3],
  footR: [-1.4, 0, -0.9, 0, 0.5],
  wingL: [0, 0, 0],
  wingR: [0, 0, 0],
});
const braceKick = makePose({ ...brace, hips: [-1.05, -0.6, 0.05, 0.35, 0], shR: [-1.85, 0.5, -0.05], elR: [-0.5, 0, 0], spine: [-0.1, 0.1, 0] });
const tuckBrace = makePose({ ...tuck, shR: [-2.62, 0, -0.06], elR: [-0.05, 0, 0] });
const tuckBraceKick = makePose({ ...tuckBrace, shR: [-2.95, 0, -0.06], elR: [-0.45, 0, 0] });

export const POSES = {
  stand: makePose(),
  tuck,
  boost,
  carveRight,
  battle,
  guard,
  stagger,
  dash,
  ko,
  victory,
  slashWind,
  slashHit,
  finishWind,
  finishHit,
  lanceWind,
  lanceHit,
  aim,
  aimKick,
  tuckAim,
  kickWind,
  kickHit,
  hookWind,
  hookHit,
  slamWind,
  slamHit,
  brace,
  braceKick,
} satisfies Record<string, Pose>;

export interface Clip {
  wind: Pose;
  hit: Pose;
  /** Shots: the pose pair to use when fired from the tuck. */
  speedWind?: Pose;
  speedHit?: Pose;
}

/** Animation for each attack, indexed like ATTACKS. */
export const CLIPS: Record<number, Clip> = {
  [ATK.FW_SLASH1]: { wind: slashWind, hit: slashHit },
  [ATK.FW_SLASH2]: { wind: mirrorPose(slashWind), hit: mirrorPose(slashHit) },
  [ATK.FW_SLASH3]: { wind: finishWind, hit: finishHit },
  [ATK.FW_LANCE]: { wind: lanceWind, hit: lanceHit },
  [ATK.MF_BURST]: { wind: aim, hit: aimKick, speedWind: tuckAim, speedHit: tuckAimKick },
  [ATK.MF_KICK]: { wind: kickWind, hit: kickHit },
  [ATK.DF_HAMMER1]: { wind: hookWind, hit: hookHit },
  [ATK.DF_HAMMER2]: { wind: slamWind, hit: slamHit },
  [ATK.DF_SCATTER]: { wind: brace, hit: braceKick, speedWind: tuckBrace, speedHit: tuckBraceKick },
};

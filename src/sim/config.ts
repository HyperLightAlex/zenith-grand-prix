// Tuning data for the simulation: timing, classes and attacks.
// Everything here is plain data so balance changes never touch the logic.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const LAPS = 3;
/** Points by finishing position. A retired mech scores nothing. */
export const POINTS = [15, 7, 5, 3, 2, 1];

/** The limiter: nobody outruns this on laps 1 and 2 without boost. */
export const PACE = 96;
/**
 * The limiter is tied to the race leader: fall more than PACK_SLACK behind
 * and it lets go a little, up to PACK_BONUS, so the field stays one pack
 * for the battle lap. Lap 3 has no limiter at all.
 */
export const PACK_SLACK = 40;
export const PACK_FULL = 300;
export const PACK_BONUS = 0.14;
/** Display scale only: 96 u/s reads as 288 mph, a 128 u/s forward as 384. */
export const MPH_PER_UNIT = 3;

export const COUNTDOWN_TICKS = 4 * TICK_RATE;
/** A throttle press this close to GO earns a launch bonus. */
export const PERFECT_START_WINDOW = 22;
/** Seconds the race stays open after the winner crosses the line. */
export const FINISH_GRACE_TICKS = 25 * TICK_RATE;
/** Hard stop: a race that somehow has no finisher is flagged after this long. */
export const MAX_RACE_TICKS = 10 * 60 * TICK_RATE;

export const ROLE = { FW: 0, MF: 1, DF: 2 } as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];
export const ROLE_KEYS = ['FW', 'MF', 'DF'] as const;
export const ROLE_NAMES = ['Forward', 'Midfielder', 'Defender'] as const;

export const MODE = { SPEED: 0, BATTLE: 1 } as const;
export type Mode = (typeof MODE)[keyof typeof MODE];

export const ACT = { NONE: 0, ATTACK: 1, STAGGER: 2, DASH: 3 } as const;
export type Act = (typeof ACT)[keyof typeof ACT];

export const PHASE = { COUNTDOWN: 0, RACING: 1, FINISHED: 2 } as const;
export type Phase = (typeof PHASE)[keyof typeof PHASE];

/** Team tactics, set with the D-pad. FREE lets each pilot play their role. */
export const TACTIC = { FREE: 0, BLITZ: 1, RUN: 2, SHIELD: 3, MARK: 4 } as const;
export type Tactic = (typeof TACTIC)[keyof typeof TACTIC];
export const TACTIC_NAMES = ['FREE', 'BLITZ', 'RUN', 'SHIELD', 'MARK'] as const;

/** Held-button bitmask sent by a controller each tick. */
export const BTN = {
  A: 1, // boost (speed mode) / dash (battle mode)
  X: 2, // primary attack
  Y: 4, // secondary attack
  GUARD: 8,
  LOCK: 16, // lock on to an enemy / release
  ALLY: 32, // lock on to a teammate / release
  TNEXT: 64,
  TPREV: 128,
} as const;

// ---- Drive gauge ---------------------------------------------------------
export const DRIVE_MAX = 100;
export const DRIVE_START = 35;
export const DRIVE_STRIP = 10; // per second on a charge strip
export const DRIVE_DRAFT = 3; // per second in a slipstream
export const DRIVE_PASSIVE = 0.8;
export const DRIVE_PER_DAMAGE_DEALT = 0.07;
export const DRIVE_PER_DAMAGE_TAKEN = 0.05;

// ---- Speed mode ----------------------------------------------------------
export const BOOST_MULT = 1.16;
export const BOOST_ACCEL = 1.6;
export const BOOST_COST = 15; // per second
/** Drive needed to light the boost; once lit it burns to empty. */
export const BOOST_MIN_START = 6;
/** Nothing free-steering goes faster than this multiple of its current cap. */
export const SPEED_CEILING = 1.22;
export const DRAFT_MULT = 1.04;
export const DRAFT_MIN = 4;
export const DRAFT_MAX = 46;
export const DRAFT_WIDTH = 5.5;
export const COAST_DRAG = 14;
export const OVERCAP_DRAG = 30;
export const STAGGER_DRAG = 26;
export const STEER_RATE = 7; // how fast steering input ramps, per second
export const WALL_DRAG = 22;
export const MAX_HEADING = 1.2;
/** Lap 3 top speed scales with remaining armour: from this, up to 1. */
export const HP_SPEED_FLOOR = 0.86;

// ---- Battle mode ---------------------------------------------------------
export const LOCK_RANGE = 95;
export const LOCK_BREAK = 125;
export const LOCK_BREAK_TICKS = 40;
export const AUTO_LOCK_RANGE = 45;
export const BATTLE_CAP_MULT = 1.04; // of PACE on laps 1-2, closing on a target ahead
export const BATTLE_CAP_LAP3 = 0.93; // of the class top speed on lap 3
export const BATTLE_MIN = PACE * 0.55;
export const FACE_RATE = 12;
export const ATTACK_MOVE_SCALE = 0.35;
export const LINK_RANGE = 26; // escorting an ally inside this shares Drive
export const DRIVE_LINK = 2.5;

// ---- Combat --------------------------------------------------------------
export const GUARD_REDUCTION = 0.15; // damage multiplier while guarding
export const GUARD_ARC = 1.9; // radians either side of facing
export const GUARD_REGEN_DELAY = 50;
export const GUARD_BREAK_STAGGER = 70;
export const PARRY_WINDOW = 8; // ticks after raising guard
/** The guard must have been down this long for the next raise to parry. */
export const PARRY_REARM = 30;
export const PARRY_STAGGER = 36;
export const DASH_TICKS = 14;
export const DASH_COOLDOWN = 36;
export const COMBO_CANCEL_DELAY = 4;
export const CHAIN_LIMIT = 4; // hits in one stagger chain before a free escape
export const CHAIN_TICKS = 75;
export const ESCAPE_IFRAMES = 50;
export const ESCAPE_SHOVE_RANGE = 14;
/** A wall splat is credited to whoever landed a hit this recently. */
export const SPLAT_CREDIT_TICKS = 150;
export const COUNTER_HIT = 1.15; // damage bonus for hitting a wind-up
export const WALL_SPLAT_MIN = 14;
export const WALL_SPLAT_DAMAGE = 1.6; // per u/s of lateral speed
export const HIT_SLOW_MAX = 0.35;
export const HIT_SLOW_PER_DAMAGE = 1 / 400;
export const CRITICAL_HP = 0.25;

export interface ClassDef {
  role: Role;
  /** Frame (mech model) name. */
  frame: string;
  blurb: string;
  maxHp: number;
  radius: number;
  mass: number;
  topSpeed: number;
  accel: number;
  brake: number;
  /** Lateral acceleration available for steering, u/s^2. */
  grip: number;
  turnMax: number;
  battleAccel: number;
  strafe: number;
  approach: number;
  guardMax: number;
  guardRegen: number;
  dash: number;
  dashCost: number;
  dashIframes: number;
  /** First attack of the primary chain, and the secondary. Indices into ATTACKS. */
  primary: number;
  secondary: number;
  /** Range the AI likes to fight at (centre to centre). */
  aiRange: number;
}

export interface ShotDef {
  /** Trigger pulls in the move, and ticks between them. */
  count: number;
  interval: number;
  /** Projectiles per trigger pull. */
  pellets: number;
  speed: number;
  /** Half-angle of the random spread, radians. */
  spread: number;
  range: number;
}

export interface AttackDef {
  key: string;
  name: string;
  kind: 'melee' | 'shot';
  windup: number;
  active: number;
  recovery: number;
  /** Melee reach beyond the two body radii. */
  reach: number;
  /** Melee half-angle. */
  arc: number;
  damage: number;
  guardDamage: number;
  stagger: number;
  knockback: number;
  guardBreak: boolean;
  /** The attacker shrugs off light hits while this move is winding up. */
  armor: boolean;
  /** Closing speed toward the target during wind-up and active frames. */
  advance: number;
  driveCost: number;
  /** Ticks before the same slot can be used again, counted from the end. */
  cooldown: number;
  /** Combo follow-up, or -1. */
  next: number;
  heavy: boolean;
  shot?: ShotDef;
}

const melee = (a: Partial<AttackDef> & Pick<AttackDef, 'key' | 'name' | 'windup' | 'active' | 'recovery' | 'damage'>): AttackDef => ({
  kind: 'melee',
  reach: 5.5,
  arc: 1.05,
  guardDamage: Math.round(a.damage * 0.4),
  stagger: 16,
  knockback: 8,
  guardBreak: false,
  armor: false,
  advance: 20,
  driveCost: 0,
  cooldown: 0,
  next: -1,
  heavy: false,
  ...a,
});

export const ATK = {
  FW_SLASH1: 0,
  FW_SLASH2: 1,
  FW_SLASH3: 2,
  FW_LANCE: 3,
  MF_BURST: 4,
  MF_KICK: 5,
  DF_HAMMER1: 6,
  DF_HAMMER2: 7,
  DF_SCATTER: 8,
} as const;

export const ATTACKS: AttackDef[] = [
  // Forward: fast three-hit blade string, plus a gap-closing lance.
  melee({ key: 'fw_slash1', name: 'Edge', windup: 5, active: 4, recovery: 14, damage: 20, stagger: 14, knockback: 8, advance: 22, next: ATK.FW_SLASH2 }),
  melee({ key: 'fw_slash2', name: 'Edge', windup: 5, active: 4, recovery: 14, damage: 22, stagger: 14, knockback: 8, advance: 22, next: ATK.FW_SLASH3 }),
  melee({ key: 'fw_slash3', name: 'Edge Finish', windup: 9, active: 5, recovery: 24, damage: 40, stagger: 24, knockback: 30, advance: 26, heavy: true }),
  melee({ key: 'fw_lance', name: 'Lance Dash', windup: 12, active: 10, recovery: 26, damage: 56, stagger: 28, knockback: 34, reach: 6.5, advance: 75, armor: true, driveCost: 12, cooldown: 150, heavy: true }),
  // Midfielder: carbine bursts at range, and a kick to make space.
  {
    key: 'mf_burst', name: 'Carbine', kind: 'shot',
    windup: 7, active: 15, recovery: 12,
    reach: 0, arc: 0.4,
    damage: 6, guardDamage: 3, stagger: 4, knockback: 2,
    guardBreak: false, armor: false, advance: 0, driveCost: 0, cooldown: 48, next: -1, heavy: false,
    shot: { count: 3, interval: 5, pellets: 1, speed: 240, spread: 0.065, range: 62 },
  },
  melee({ key: 'mf_kick', name: 'Stun Kick', windup: 9, active: 5, recovery: 22, damage: 34, stagger: 28, knockback: 38, reach: 6, cooldown: 70, heavy: true }),
  // Defender: slow hammer blows that break guards, and a scatter cannon.
  melee({ key: 'df_hammer1', name: 'Breaker', windup: 14, active: 5, recovery: 18, damage: 36, guardDamage: 30, stagger: 20, knockback: 14, reach: 6.5, arc: 1.15, advance: 14, armor: true, next: ATK.DF_HAMMER2 }),
  melee({ key: 'df_hammer2', name: 'Breaker Slam', windup: 18, active: 6, recovery: 30, damage: 54, guardDamage: 60, stagger: 30, knockback: 44, reach: 6.5, arc: 1.15, advance: 16, armor: true, guardBreak: true, heavy: true }),
  {
    key: 'df_scatter', name: 'Scatter Cannon', kind: 'shot',
    windup: 13, active: 2, recovery: 26,
    reach: 0, arc: 0.5,
    damage: 6, guardDamage: 5, stagger: 7, knockback: 5,
    guardBreak: false, armor: true, advance: 0, driveCost: 0, cooldown: 200, next: -1, heavy: true,
    shot: { count: 1, interval: 1, pellets: 6, speed: 210, spread: 0.22, range: 30 },
  },
];

export const CLASSES: ClassDef[] = [
  {
    role: ROLE.FW, frame: 'Swift',
    blurb: 'Lightest and fastest. Wins the sprint if it survives the fight.',
    maxHp: 1600, radius: 3.0, mass: 0.8,
    topSpeed: 128, accel: 36, brake: 70, grip: 100, turnMax: 2.2,
    battleAccel: 80, strafe: 30, approach: 34,
    guardMax: 80, guardRegen: 18, dash: 78, dashCost: 10, dashIframes: 13,
    primary: ATK.FW_SLASH1, secondary: ATK.FW_LANCE, aiRange: 0,
  },
  {
    role: ROLE.MF, frame: 'Vector',
    blurb: 'Balanced all-rounder. Controls space with carbine fire.',
    maxHp: 1800, radius: 3.4, mass: 1.0,
    topSpeed: 122, accel: 32, brake: 70, grip: 90, turnMax: 2.0,
    battleAccel: 68, strafe: 26, approach: 30,
    guardMax: 100, guardRegen: 18, dash: 68, dashCost: 15, dashIframes: 10,
    primary: ATK.MF_BURST, secondary: ATK.MF_KICK, aiRange: 30,
  },
  {
    role: ROLE.DF, frame: 'Bulwark',
    blurb: 'Heavy bruiser. Breaks guards and shrugs off light hits.',
    maxHp: 2200, radius: 4.0, mass: 1.45,
    topSpeed: 116, accel: 28, brake: 70, grip: 80, turnMax: 1.8,
    battleAccel: 56, strafe: 22, approach: 26,
    guardMax: 130, guardRegen: 20, dash: 58, dashCost: 18, dashIframes: 8,
    primary: ATK.DF_HAMMER1, secondary: ATK.DF_SCATTER, aiRange: 0,
  },
];

export function attackTotal(a: AttackDef): number {
  return a.windup + a.active + a.recovery;
}

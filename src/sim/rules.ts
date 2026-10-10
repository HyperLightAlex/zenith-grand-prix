// Race rules that can be changed without touching the logic: per race, from
// a match setting, or live from the tuning panel. They live in the race state
// as plain numbers so a race stays a self-contained, copyable value.
//
// Everything a player might want to dial in is here. Things that are part of
// how a move works (frame data, reach, damage of ordinary attacks) stay in
// config.ts.

import { TICK_RATE } from './config';

export interface Rules {
  // --- pace
  /** Limiter on the formation lap, u/s. */
  limiter1: number;
  /** Limiter on the battle lap(s), u/s. */
  limiter2: number;
  /** Multiplies every frame's own top speed on the speed lap. */
  topScale: number;
  /** Speed cap multiplier while boosting. */
  boostMult: number;
  /** Lap 3 top speed with no armour left, as a share of the full figure. */
  armourFloor: number;

  // --- slipstream
  /** Extra top speed at full tow on laps 1 and 2. */
  tow: number;
  /** ... and on the speed lap, where it is the main way back into a race. */
  tow3: number;
  /** How far back a tow reaches, u. */
  towRange: number;
  towRange3: number;
  /** Seconds in the tow to charge it fully. The bonus is at full strength from half charge. */
  towBuild: number;
  /** Seconds a full charge takes to drain after pulling out: the slingshot. Full bonus for the first half. */
  slingshot: number;

  // --- Drive
  driveStart: number;
  /** Per second, from lap 2 on. */
  drivePassive: number;
  /** Per second on a charge strip, from lap 2 on. */
  driveStrip: number;
  /** Per second on a charge strip during the formation lap. */
  driveStripLap1: number;
  /** Per second in a slipstream, from lap 2 on. */
  driveDraft: number;
  /** 1 = the formation lap also gives the passive and slipstream trickle. */
  lap1Trickle: number;

  // --- lock-on
  /** Scales how fast a mech moves around the thing it is locked on to. */
  battleMove: number;

  // --- Cells and gates
  cellMax: number;
  cellStart: number;
  /** Cells for threading one gate. */
  gateValue: number;
  /** Gates are lit for this many laps from the start. */
  gateLaps: number;

  // --- abilities (each costs one cell)
  overdriveMult: number;
  overdriveSecs: number;
  /** Seconds nobody can lock on to a forward after it breaks away. */
  breakawaySecs: number;
  snareMult: number;
  snareSecs: number;
  pulseRange: number;
  pulseDrain: number;
  ramMult: number;
  ramSecs: number;
  ramDamage: number;
  aegisSecs: number;
  aegisRange: number;
  /** Damage multiplier under an Aegis. */
  aegisDamage: number;

  // --- scoring
  /** Points to the team for each knockout it is credited with. */
  koPoints: number;
}

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  limiter1: 110,
  limiter2: 125,
  topScale: 1,
  boostMult: 1.2,
  armourFloor: 0.94,

  tow: 0.04,
  tow3: 0.08,
  towRange: 46,
  towRange3: 160,
  towBuild: 1.2,
  slingshot: 2.4,

  driveStart: 0,
  drivePassive: 0.8,
  driveStrip: 10,
  driveStripLap1: 6,
  driveDraft: 3,
  lap1Trickle: 0,

  battleMove: 1.35,

  cellMax: 3,
  cellStart: 0,
  gateValue: 0.5,
  gateLaps: 1,

  overdriveMult: 1.3,
  overdriveSecs: 4,
  breakawaySecs: 1.5,
  snareMult: 0.74,
  snareSecs: 3.5,
  pulseRange: 26,
  pulseDrain: 30,
  ramMult: 1.12,
  ramSecs: 3.5,
  ramDamage: 80,
  aegisSecs: 4,
  aegisRange: 34,
  aegisDamage: 0.35,

  koPoints: 3,
});

export type RuleKey = keyof Rules;
export const RULE_KEYS = Object.keys(DEFAULT_RULES) as RuleKey[];

/**
 * The range each rule is held to. Rules can arrive from a saved tuning, a
 * pasted block of text or, one day, a host's match settings, so nothing is
 * taken on trust: a value outside its range is pulled back to the nearest end.
 */
export const RULE_LIMITS: Readonly<Record<RuleKey, readonly [number, number]>> = Object.freeze({
  limiter1: [40, 400],
  limiter2: [40, 400],
  topScale: [0.25, 3],
  boostMult: [1, 3],
  armourFloor: [0.2, 1],

  tow: [0, 1],
  tow3: [0, 1],
  towRange: [0, 1000],
  towRange3: [0, 1000],
  towBuild: [0, 30],
  slingshot: [0, 30],

  driveStart: [0, 100],
  drivePassive: [0, 100],
  driveStrip: [0, 1000],
  driveStripLap1: [0, 1000],
  driveDraft: [0, 100],
  lap1Trickle: [0, 1],

  battleMove: [0.1, 5],

  cellMax: [0, 6],
  cellStart: [0, 6],
  gateValue: [0, 6],
  gateLaps: [0, 99],

  overdriveMult: [1, 3],
  overdriveSecs: [0, 60],
  breakawaySecs: [0, 60],
  snareMult: [0.1, 1],
  snareSecs: [0, 60],
  pulseRange: [0, 500],
  pulseDrain: [0, 100],
  ramMult: [1, 3],
  ramSecs: [0, 60],
  ramDamage: [0, 100000],
  aegisSecs: [0, 60],
  aegisRange: [0, 500],
  aegisDamage: [0, 1],

  koPoints: [0, 100],
});

/** One rule value, held to its range. Not a finite number: the default. */
export function clampRule(key: RuleKey, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_RULES[key];
  const [lo, hi] = RULE_LIMITS[key];
  return v < lo ? lo : v > hi ? hi : v;
}

/** A full rule set from defaults plus overrides. Anything not a finite number is ignored; the rest is held to RULE_LIMITS. */
export function makeRules(over?: Partial<Rules> | null): Rules {
  const r: Rules = { ...DEFAULT_RULES };
  if (over) {
    for (const k of RULE_KEYS) {
      const v = over[k];
      if (typeof v === 'number' && Number.isFinite(v)) r[k] = clampRule(k, v);
    }
  }
  return r;
}

/** Rule durations are written in seconds; the simulation counts ticks. */
export function ticks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE));
}

// Helpers shared by movement, combat and AI.

import { CLASSES, LOCK_RANGE, MAX_HEADING, MODE, PACK_BONUS, PACK_FULL, PACK_SLACK, type ClassDef } from './config';
import { clamp, wrapAngle } from './math';
import { deltaS, type Track } from './track';
import type { MechState, RaceState } from './types';

export function classOf(m: MechState): ClassDef {
  return CLASSES[m.role];
}

/** Still racing: not knocked out and not across the line. */
export function isActive(m: MechState): boolean {
  return !m.retired && !m.finished;
}

/** Distance between two mechs on the track surface. */
export function distance(track: Track, a: MechState, b: MechState): number {
  return Math.hypot(deltaS(track, a.s, b.s), a.d - b.d);
}

export function hpFraction(m: MechState): number {
  return m.hp / classOf(m).maxHp;
}

/** The limiter in force: one figure for the formation lap, another for the battle laps. */
export function limiterOf(race: RaceState): number {
  return race.lapPhase <= 1 ? race.rules.limiter1 : race.rules.limiter2;
}

/** How far the limiter opens for a mech that has dropped off the pack. */
export function packBonus(race: RaceState, m: MechState): number {
  const gap = race.leaderS - m.s;
  return clamp((gap - PACK_SLACK) / (PACK_FULL - PACK_SLACK), 0, 1) * PACK_BONUS;
}

/** A frame's own top speed on the speed lap, cut a little for missing armour. */
export function ownTopSpeed(race: RaceState, m: MechState, c: ClassDef): number {
  const floor = race.rules.armourFloor;
  // Overdrive runs the engine past what the damage would allow.
  const armour = m.overdriveT > 0 ? 1 : floor + (1 - floor) * hpFraction(m);
  return c.topSpeed * race.rules.topScale * armour;
}

/** Top speed available to a mech in speed mode, before boost and slipstream. */
export function speedCap(race: RaceState, m: MechState, c: ClassDef): number {
  if (m.finished) return limiterOf(race) * 0.75;
  let cap = race.lapPhase < 3 ? limiterOf(race) * (1 + packBonus(race, m)) : ownTopSpeed(race, m, c);
  if (m.overdriveT > 0) cap *= race.rules.overdriveMult;
  if (m.ramT > 0) cap *= race.rules.ramMult;
  if (m.snareT > 0) cap *= race.rules.snareMult;
  return cap;
}

/**
 * Extra top speed the slipstream is giving this mech, as a fraction. The
 * charge builds while tucked in behind someone and drains after pulling out,
 * but the bonus stays at full strength for the first half of the drain: that
 * held burst is the slingshot, and it is long enough to finish a pass.
 */
export function towBonus(race: RaceState, m: MechState): number {
  return (race.lapPhase >= 3 ? race.rules.tow3 : race.rules.tow) * Math.min(1, Math.max(0, m.tow) * 2);
}

/** Can `by` take a lock on `o`? A forward that has just broken away cannot be locked by enemies. */
export function lockable(o: MechState, by: MechState): boolean {
  return isActive(o) && (o.team === by.team || o.cloakT <= 0);
}

/** Ability effects end with the mech's race: called when it finishes or is knocked out. */
export function clearEffects(m: MechState): void {
  m.overdriveT = 0;
  m.ramT = 0;
  m.ramHits = 0;
  m.shieldT = 0;
  m.snareT = 0;
  m.cloakT = 0;
  m.cdAbility = 0;
  m.tow = 0;
}

/** Keep speed/heading and vs/vd in agreement after the speed-mode values change. */
export function syncFromSpeed(m: MechState): void {
  m.vs = m.speed * Math.cos(m.heading);
  m.vd = m.speed * Math.sin(m.heading);
}

/** Add a velocity impulse in track coordinates. */
export function addVelocity(m: MechState, dvs: number, dvd: number): void {
  m.vs += dvs;
  m.vd += dvd;
  if (m.mode === MODE.SPEED) {
    // Free steering has no reverse: a shove from the front can stop a mech
    // dead but never turns into speed down the road.
    const fwd = Math.max(m.vs, 0);
    const sp = Math.hypot(fwd, m.vd);
    if (sp > 1) {
      m.heading = clamp(Math.atan2(m.vd, Math.max(fwd, 0.01)), -MAX_HEADING, MAX_HEADING);
    }
    m.speed = sp;
    syncFromSpeed(m);
  }
}

export function setTarget(race: RaceState, m: MechState, id: number): void {
  if (m.target === id) return;
  m.target = id;
  m.outOfRange = 0;
  if (id >= 0) {
    m.mode = MODE.BATTLE;
    race.events.push({ type: 'lock', mech: m.id, target: id });
  } else {
    if (m.mode === MODE.BATTLE) {
      m.mode = MODE.SPEED;
      m.speed = Math.hypot(m.vs, m.vd);
      m.heading = clamp(Math.atan2(m.vd, Math.max(m.vs, 1)), -0.6, 0.6);
      m.facing = m.heading;
      syncFromSpeed(m);
    }
    m.guarding = false;
    race.events.push({ type: 'unlock', mech: m.id });
  }
}

/**
 * Best lock-on candidate: close, and roughly where the pilot is facing.
 * `ally` picks teammates instead of enemies.
 */
export function pickTarget(
  race: RaceState,
  track: Track,
  m: MechState,
  ally: boolean,
  exclude: number,
  range: number = LOCK_RANGE,
): number {
  let best = -1;
  let bestScore = Infinity;
  for (const o of race.mechs) {
    if (o.id === m.id || o.id === exclude || !lockable(o, m)) continue;
    if ((o.team === m.team) !== ally) continue;
    const ds = deltaS(track, o.s, m.s);
    const dd = o.d - m.d;
    const dist = Math.hypot(ds, dd);
    if (dist > range) continue;
    const ang = Math.abs(wrapAngle(Math.atan2(dd, ds) - m.facing));
    const score = dist + ang * 14;
    if (score < bestScore) {
      bestScore = score;
      best = o.id;
    }
  }
  return best;
}

/** Next candidate clockwise (dir = 1) or anticlockwise from the current target. */
export function cycleTarget(race: RaceState, track: Track, m: MechState, dir: number): number {
  const cur = m.target >= 0 ? race.mechs[m.target] : null;
  const ally = cur ? cur.team === m.team : false;
  const list: Array<{ id: number; ang: number }> = [];
  for (const o of race.mechs) {
    if (o.id === m.id || !lockable(o, m)) continue;
    if ((o.team === m.team) !== ally) continue;
    const ds = deltaS(track, o.s, m.s);
    const dd = o.d - m.d;
    if (Math.hypot(ds, dd) > LOCK_RANGE) continue;
    list.push({ id: o.id, ang: Math.atan2(dd, ds) });
  }
  if (list.length === 0) return -1;
  list.sort((a, b) => a.ang - b.ang || a.id - b.id);
  const idx = list.findIndex((e) => e.id === m.target);
  if (idx < 0) return list[0].id;
  return list[(idx + dir + list.length) % list.length].id;
}

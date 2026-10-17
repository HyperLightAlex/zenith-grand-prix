// Helpers shared by movement, combat and AI.

import { CARVE_STEER_MID, CARVE_STEER_WIDE, CLASSES, LOCK_BREAK, LOCK_RANGE, MAX_HEADING, MODE, PACK_BONUS, PACK_FULL, PACK_SLACK, ROLE, type ClassDef } from './config';
import { clamp, wrapAngle } from './math';
import { deltaS, splitApart, type Track } from './track';
import type { MechState, RaceState } from './types';

export function classOf(m: MechState): ClassDef {
  return CLASSES[m.role];
}

/** Still racing: not knocked out and not across the line. */
export function isActive(m: MechState): boolean {
  return !m.retired && !m.finished;
}

/** Racing and on the circuit: not out of it for a moment after a fall. */
export function inPlay(m: MechState): boolean {
  return !m.retired && !m.finished && m.fallT === 0;
}

/** Distance between two mechs on the track surface. */
export function distance(track: Track, a: MechState, b: MechState): number {
  return Math.hypot(deltaS(track, a.s, b.s), a.d - b.d);
}

export function hpFraction(m: MechState): number {
  return m.hp / m.maxHp;
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
  return inPlay(o) && (o.team === by.team || o.cloakT <= 0);
}

/** Can a and b reach each other at all? Not with the wall of a fork between them. */
export function sameRoute(track: Track, a: MechState, b: MechState): boolean {
  return !splitApart(track, a.s, a.d, b.s, b.d);
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
  m.momentum = 0;
  m.padT = 0;
  dropCarve(m);
  m.carveT = 0;
  m.carveBoost = 0;
}

/** How hard a carve turning `dir` (1 right, -1 left) turns, as a fraction of full lock, for stick `mx`. */
export function carveSteer(dir: number, mx: number): number {
  const lean = clamp(mx * dir, -1, 1);
  return dir * (lean >= 0 ? CARVE_STEER_MID + lean * (1 - CARVE_STEER_MID) : CARVE_STEER_MID + lean * (CARVE_STEER_MID - CARVE_STEER_WIDE));
}

/** The stick that makes a carve turning `dir` turn at `want` (the inverse of carveSteer, held to the stick's travel). */
export function carveStick(dir: number, want: number): number {
  const w = want * dir;
  const lean = w >= CARVE_STEER_MID ? (w - CARVE_STEER_MID) / (1 - CARVE_STEER_MID) : (w - CARVE_STEER_MID) / (CARVE_STEER_MID - CARVE_STEER_WIDE);
  return dir * clamp(lean, -1, 1);
}

/** A carve ends with nothing to show for it: knocked about, locked on, or out of the race. */
export function dropCarve(m: MechState): void {
  m.carving = false;
  m.carveCharge = 0;
  m.carveTier = 0;
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
    if (race.mechs[id].team !== m.team) m.lastFoe = id;
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
 * Back from escorting to the fight: the rival last locked on to, if the lock
 * could still hold it, else the best rival in reach (as the lock button
 * picks), else -1.
 */
export function backToFight(race: RaceState, track: Track, m: MechState): number {
  const f = m.lastFoe >= 0 ? race.mechs[m.lastFoe] : null;
  if (f && f.team !== m.team && lockable(f, m) && sameRoute(track, m, f) && Math.hypot(deltaS(track, f.s, m.s), f.d - m.d) <= LOCK_BREAK) return f.id;
  return pickTarget(race, track, m, false, -1);
}

/** Lock-on scoring: points per radian off the line of sight, per unit away, and off for the rival forward. */
export const LOCK_AIM_WEIGHT = 40;
export const LOCK_DIST_WEIGHT = 0.25;
export const LOCK_FORWARD_PULL = 15;
/** More than this far off the line of sight (about 100 degrees) is behind the pilot: a last resort. */
export const LOCK_BEHIND = 1.75;

/**
 * Best lock-on candidate. Pressing lock takes whoever is nearest the middle
 * of the picture (the way the mech faces, which is where the camera looks),
 * then the nearer, with a pull toward the rival forward, the mech that
 * decides the race. Behind the pilot only counts if nobody is in front.
 * `near` scores by distance first instead: for a strike, which wants
 * whoever is in reach, and for moving a lock on after a knockout.
 * `ally` picks teammates instead of enemies.
 */
export function pickTarget(
  race: RaceState,
  track: Track,
  m: MechState,
  ally: boolean,
  exclude: number,
  range: number = LOCK_RANGE,
  near = false,
): number {
  let best = -1;
  let bestScore = Infinity;
  for (const o of race.mechs) {
    if (o.id === m.id || o.id === exclude || !lockable(o, m) || !sameRoute(track, m, o)) continue;
    if ((o.team === m.team) !== ally) continue;
    const ds = deltaS(track, o.s, m.s);
    const dd = o.d - m.d;
    const dist = Math.hypot(ds, dd);
    if (dist > range) continue;
    const ang = Math.abs(wrapAngle(Math.atan2(dd, ds) - m.facing));
    let score: number;
    if (near) {
      score = dist + ang * 14;
    } else {
      score = ang * LOCK_AIM_WEIGHT + dist * LOCK_DIST_WEIGHT;
      if (!ally && o.role === ROLE.FW) score -= LOCK_FORWARD_PULL;
      if (ang > LOCK_BEHIND) score += 1000;
    }
    if (score < bestScore) {
      bestScore = score;
      best = o.id;
    }
  }
  return best;
}

/**
 * The next target to the right (dir = 1) or left (dir = -1) of the current
 * one, as the pilot sees them: by angle from the way the mech is facing, which
 * in a lock is the way the camera looks. Past the last one it wraps round.
 * Anything the lock could hold (inside LOCK_BREAK) can be switched to.
 */
export function cycleTarget(race: RaceState, track: Track, m: MechState, dir: number): number {
  const cur = m.target >= 0 ? race.mechs[m.target] : null;
  const ally = cur ? cur.team === m.team : false;
  const list: Array<{ id: number; ang: number }> = [];
  for (const o of race.mechs) {
    if (o.id === m.id || !lockable(o, m) || !sameRoute(track, m, o)) continue;
    if ((o.team === m.team) !== ally) continue;
    const ds = deltaS(track, o.s, m.s);
    const dd = o.d - m.d;
    if (Math.hypot(ds, dd) > LOCK_BREAK) continue;
    list.push({ id: o.id, ang: wrapAngle(Math.atan2(dd, ds) - m.facing) });
  }
  if (list.length === 0) return -1;
  list.sort((a, b) => a.ang - b.ang || a.id - b.id);
  const idx = list.findIndex((e) => e.id === m.target);
  if (idx < 0) return list[0].id;
  return list[(idx + dir + list.length) % list.length].id;
}

/**
 * When the mech a pilot is locked on to is knocked out or finishes, a person
 * flying is moved straight on to the nearest other rival close by, so a fight
 * does not drop them back into free steering mid-combo. Computer pilots pick
 * their own targets.
 */
export function retarget(race: RaceState, track: Track, m: MechState, lost: number): void {
  const prev = m.target >= 0 ? race.mechs[m.target] : null;
  const next = m.human && prev && prev.team !== m.team ? pickTarget(race, track, m, false, lost, RETARGET_RANGE, true) : -1;
  setTarget(race, m, next);
}

/** How near another rival must be for a lock to move on to it by itself. */
export const RETARGET_RANGE = 60;

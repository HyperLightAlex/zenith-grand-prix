// The race simulation. One call to stepRace advances the whole race by one
// fixed tick (1/60 s). It is deterministic: the same seed and the same inputs
// always produce the same race, which is what lets the identical code run in
// the browser for solo play and on a server for online play.

import { aiCaptain, aiControl } from './ai';
import { retire, setStagger, stepAction, stepProjectiles } from './combat';
import {
  ACT,
  ATTACKS,
  ATTACK_MOVE_SCALE,
  BATTLE_CAP_LAP3,
  BATTLE_CAP_MULT,
  BATTLE_MIN,
  BOOST_ACCEL,
  BOOST_COST,
  BOOST_MIN_START,
  BOOST_MULT,
  BTN,
  CLASSES,
  COAST_DRAG,
  COUNTDOWN_TICKS,
  DRAFT_MAX,
  DRAFT_MIN,
  DRAFT_MULT,
  DRAFT_WIDTH,
  DRIVE_DRAFT,
  DRIVE_LINK,
  DRIVE_MAX,
  DRIVE_PASSIVE,
  DRIVE_START,
  DRIVE_STRIP,
  DT,
  FACE_RATE,
  FINISH_GRACE_TICKS,
  HP_SPEED_FLOOR,
  LAPS,
  LINK_RANGE,
  LOCK_BREAK,
  LOCK_BREAK_TICKS,
  MAX_HEADING,
  MAX_RACE_TICKS,
  MODE,
  OVERCAP_DRAG,
  PACE,
  PACK_BONUS,
  PACK_FULL,
  PACK_SLACK,
  PERFECT_START_WINDOW,
  PHASE,
  POINTS,
  SPEED_CEILING,
  SPLAT_CREDIT_TICKS,
  STAGGER_DRAG,
  STEER_RATE,
  TACTIC,
  TICK_RATE,
  WALL_DRAG,
  WALL_SPLAT_DAMAGE,
  WALL_SPLAT_MIN,
  type ClassDef,
  type Tactic,
} from './config';
import { addVelocity, classOf, cycleTarget, distance, hpFraction, isActive, pickTarget, setTarget, syncFromSpeed } from './core';
import { approach, approachAngle, clamp, rngNext } from './math';
import { deltaS, kappaAt, onStrip, type Track } from './track';
import { emptyInput, type MechInput, type MechState, type RaceConfig, type RaceState } from './types';

export function createRace(track: Track, cfg: RaceConfig): RaceState {
  const race: RaceState = {
    tick: 0,
    phase: PHASE.COUNTDOWN,
    rng: cfg.seed | 0,
    laps: cfg.laps ?? LAPS,
    lapPhase: 1,
    leaderS: 0,
    mechs: [],
    projectiles: [],
    nextProjId: 1,
    teams: [
      { tactic: TACTIC.FREE, mark: -1, captainAt: 0, captainPhase: 1 },
      { tactic: TACTIC.FREE, mark: -1, captainAt: 0, captainPhase: 1 },
    ],
    firstFinishTick: -1,
    endTick: -1,
    events: [],
  };
  cfg.seats.forEach((seat, id) => {
    const c = CLASSES[seat.role];
    // Grid: forwards on the front row, defenders at the back. The teams swap
    // sides row by row so neither owns the inside line into turn one.
    const s = -(10 + seat.role * 12);
    const d = (seat.team === 0) !== (seat.role === 1) ? -9 : 9;
    race.mechs.push({
      id,
      team: seat.team,
      role: seat.role,
      human: seat.human,
      name: seat.name,
      skill: seat.skill,
      s,
      d,
      vs: 0,
      vd: 0,
      speed: 0,
      heading: 0,
      facing: 0,
      steer: 0,
      mode: MODE.SPEED,
      target: -1,
      outOfRange: 0,
      hp: c.maxHp,
      guard: c.guardMax,
      drive: DRIVE_START,
      act: ACT.NONE,
      actT: 0,
      actDur: 0,
      attack: 0,
      attackStart: 0,
      attackHit: false,
      comboQueued: false,
      guarding: false,
      guardT: 0,
      guardIdle: 0,
      guardRest: 1000,
      iframes: 0,
      chain: 0,
      chainT: 0,
      chainTick: -1,
      cdPrimary: 0,
      cdSecondary: 0,
      cdDash: 0,
      boosting: false,
      onStrip: false,
      drafting: false,
      linked: false,
      wall: 0,
      lap: 0,
      finished: false,
      finishTime: 0,
      retired: false,
      retireTick: 0,
      place: id + 1,
      points: 0,
      prevButtons: 0,
      prevCmd: 0,
      prevThrottle: 0,
      throttleTick: -9999,
      throttleRest: 0,
      lastHitBy: -1,
      lastHitTick: -9999,
      deniedTick: -9999,
      dmgDealt: 0,
      dmgTaken: 0,
      kos: 0,
      ai: {
        intent: 0,
        intentTarget: -1,
        nextThink: id * 2,
        lane: (rngNext(race) * 2 - 1) * 7,
        orbit: rngNext(race) < 0.5 ? -1 : 1,
        orbitUntil: 0,
        attackAt: 0,
        guardFrom: 0,
        guardUntil: 0,
        dodgeAt: -1,
        reactedTo: -1,
        comboLeft: 0,
        boostUntil: 0,
        boutUntil: 0,
        restUntil: 0,
      },
    });
  });
  updatePlaces(race);
  return race;
}

/** Top speed available to a mech in speed mode, before boost and slipstream. */
export function speedCap(race: RaceState, m: MechState, c: ClassDef): number {
  if (m.finished) return PACE * 0.75;
  if (race.lapPhase < 3) return PACE * (1 + packBonus(race, m));
  return c.topSpeed * (HP_SPEED_FLOOR + (1 - HP_SPEED_FLOOR) * hpFraction(m));
}

/** How far the limiter opens for a mech that has dropped off the pack. */
export function packBonus(race: RaceState, m: MechState): number {
  const gap = race.leaderS - m.s;
  return clamp((gap - PACK_SLACK) / (PACK_FULL - PACK_SLACK), 0, 1) * PACK_BONUS;
}

function battleCap(race: RaceState, m: MechState, c: ClassDef, targetAhead: boolean): number {
  if (race.lapPhase < 3) {
    const pack = PACE * (1 + packBonus(race, m));
    return targetAhead ? Math.max(PACE * BATTLE_CAP_MULT, pack) : pack;
  }
  return c.topSpeed * (HP_SPEED_FLOOR + (1 - HP_SPEED_FLOOR) * hpFraction(m)) * BATTLE_CAP_LAP3;
}

// --------------------------------------------------------------------------
// Movement
// --------------------------------------------------------------------------

function stepSpeedMode(race: RaceState, track: Track, m: MechState, c: ClassDef, input: MechInput): void {
  const staggered = m.act === ACT.STAGGER;
  m.steer = approach(m.steer, staggered ? 0 : clamp(input.mx, -1, 1), STEER_RATE * DT);

  let cap = speedCap(race, m, c);
  const wasBoosting = m.boosting;
  m.boosting = false;
  // A tick of boost has to be paid for in full: with `drive > 0` the passive
  // trickle alone kept an empty gauge boosting for as long as A was held.
  const fuel = wasBoosting ? BOOST_COST * DT : BOOST_MIN_START;
  if (!staggered && !m.finished && (input.buttons & BTN.A) !== 0 && m.drive >= fuel && input.throttle > 0.2) {
    m.boosting = true;
    cap *= BOOST_MULT;
    m.drive = Math.max(0, m.drive - BOOST_COST * DT);
    if (!wasBoosting) race.events.push({ type: 'boost', mech: m.id });
  }
  if (m.drafting) cap *= DRAFT_MULT;

  const throttle = staggered ? 0 : clamp(input.throttle, 0, 1);
  const brake = staggered ? 0 : clamp(input.brake, 0, 1);
  const want = cap * throttle;
  if (m.speed < want) {
    // Acceleration tails off toward the cap.
    const room = clamp(1.2 - m.speed / cap, 0.18, 1);
    m.speed = Math.min(want, m.speed + c.accel * (m.boosting ? BOOST_ACCEL : 1) * room * DT);
  } else if (m.speed > want) {
    const drag = COAST_DRAG + (m.speed > cap ? OVERCAP_DRAG : 0);
    m.speed = Math.max(want, m.speed - drag * DT);
  }
  if (brake > 0) m.speed -= brake * c.brake * DT;
  if (staggered) m.speed -= STAGGER_DRAG * DT;
  if (m.speed < 0) m.speed = 0;
  // Whatever threw the mech forward (a dash carried out of a lock, a shove),
  // free steering tops out a little above the cap.
  if (m.speed > cap * SPEED_CEILING) m.speed = cap * SPEED_CEILING;

  // Steering fights the bend of the road: hold a line or run wide.
  const omegaMax = Math.min(c.turnMax, c.grip / Math.max(m.speed, 24)) * Math.min(1, m.speed / 12);
  const kappa = kappaAt(track, m.s);
  const sdot = (m.speed * Math.cos(m.heading)) / Math.max(0.35, 1 - kappa * m.d);
  m.heading = clamp(m.heading + (m.steer * omegaMax - kappa * sdot) * DT, -MAX_HEADING, MAX_HEADING);
  m.facing = m.heading;
  syncFromSpeed(m);
}

function stepBattleMode(race: RaceState, track: Track, m: MechState, c: ClassDef, input: MechInput): void {
  const t = race.mechs[m.target];
  const ds = deltaS(track, t.s, m.s);
  const dd = t.d - m.d;
  const dist = Math.hypot(ds, dd) || 1e-3;
  const us = ds / dist;
  const ud = dd / dist;
  m.facing = approachAngle(m.facing, Math.atan2(ud, us), FACE_RATE * DT);
  m.steer = approach(m.steer, 0, STEER_RATE * DT);
  m.boosting = false;

  if (m.act === ACT.STAGGER) {
    // Tumbling: no control, bleed speed.
    m.vs = approach(m.vs, BATTLE_MIN, STAGGER_DRAG * DT);
    m.vd *= 0.955;
  } else if (m.act === ACT.DASH) {
    // The dash impulse was applied when it started; just let it run out.
    m.vd *= 0.985;
  } else {
    let mx = clamp(input.mx, -1, 1);
    let my = clamp(input.my, -1, 1);
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const minDist = c.radius + classOf(t).radius + 0.6;
    if (dist < minDist && my > 0) my = 0;
    let scale = 1;
    let advance = 0;
    if (m.act === ACT.ATTACK) {
      const a = ATTACKS[m.attack];
      scale = ATTACK_MOVE_SCALE;
      if (a.advance > 0 && m.actT < a.windup + a.active && dist > minDist) {
        // Light moves step in; the lance commits fully once it goes active.
        advance = a.advance >= 60 ? (m.actT >= a.windup ? a.advance : a.advance * 0.25) : a.advance;
      }
    }
    if (m.guarding) scale *= 0.5;
    const rs = (us * my * c.approach - ud * mx * c.strafe) * scale + us * advance;
    const rd = (ud * my * c.approach + us * mx * c.strafe) * scale + ud * advance;

    // The track carries you at your target's pace, easing toward the
    // limiter so a long fight does not grind to a halt.
    const ref = race.lapPhase < 3 ? PACE : battleCap(race, m, c, true);
    const carry = t.vs * 0.88 + ref * 0.12;
    const cap = battleCap(race, m, c, ds > 2) + advance * 0.6;
    const wantVs = clamp(carry + rs, BATTLE_MIN, cap);
    const wantVd = rd;
    const acc = c.battleAccel * (advance > 0 ? 2.2 : 1) * DT;
    let dvs = wantVs - m.vs;
    let dvd = wantVd - m.vd;
    const dm = Math.hypot(dvs, dvd);
    if (dm > acc) {
      dvs *= acc / dm;
      dvd *= acc / dm;
    }
    m.vs += dvs;
    m.vd += dvd;
  }
  m.speed = Math.hypot(m.vs, m.vd);
  m.heading = Math.atan2(m.vd, Math.max(m.vs, 1e-3));
}

function stepRetired(track: Track, m: MechState): void {
  // A wreck coasts down and drifts to the nearest wall.
  m.speed = Math.max(0, m.speed - 46 * DT);
  m.heading = approach(m.heading, 0, 1.5 * DT);
  m.steer = 0;
  m.boosting = false;
  syncFromSpeed(m);
  const edge = (m.d >= 0 ? 1 : -1) * (track.halfWidth - classOf(m).radius - 1);
  m.vd = clamp((edge - m.d) * 1.2, -7, 7);
}

function integrate(race: RaceState, track: Track, m: MechState, c: ClassDef): void {
  const kappa = kappaAt(track, m.s);
  // The inside of a bend is the shorter way round.
  m.s += (m.vs / Math.max(0.35, 1 - kappa * m.d)) * DT;
  m.d += m.vd * DT;

  const lim = track.halfWidth - c.radius;
  if (Math.abs(m.d) > lim) {
    const side = m.d > 0 ? 1 : -1;
    m.d = side * lim;
    const into = m.vd * side;
    if (into > 0) {
      if (!m.retired) {
        if (into > 7 && m.wall === 0) {
          race.events.push({ type: 'wall', mech: m.id, intensity: into });
        }
        if (m.act === ACT.STAGGER && into > WALL_SPLAT_MIN && isActive(m)) {
          // Knocked into the barrier: extra damage and a longer tumble.
          const dmg = Math.min(m.hp, into * WALL_SPLAT_DAMAGE);
          m.hp -= dmg;
          m.dmgTaken += dmg;
          setStagger(m, 20);
          race.events.push({ type: 'splat', mech: m.id, damage: dmg });
          const credit = m.lastHitBy >= 0 && race.tick - m.lastHitTick <= SPLAT_CREDIT_TICKS;
          if (m.hp <= 0.001) retire(race, m, credit ? race.mechs[m.lastHitBy] : null);
        }
      }
      if (m.mode === MODE.SPEED) {
        // Scrub speed by how square the impact was, then slide along the wall.
        const sin = Math.min(1, into / Math.max(m.speed, 1));
        m.speed *= 1 - 0.45 * sin;
        m.heading = -side * 0.03;
        syncFromSpeed(m);
      } else {
        m.vd = -m.vd * 0.25;
      }
    }
    if (m.mode === MODE.SPEED && !m.retired) {
      m.speed = Math.max(0, m.speed - WALL_DRAG * DT);
      syncFromSpeed(m);
    }
    m.wall = Math.min(m.wall + 1, 600);
  } else {
    m.wall = 0;
  }
}

function collide(race: RaceState, track: Track): void {
  const ms = race.mechs;
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    if (!isActive(a)) continue;
    const ca = classOf(a);
    for (let j = i + 1; j < ms.length; j++) {
      const b = ms[j];
      if (!isActive(b)) continue;
      const cb = classOf(b);
      const ds = deltaS(track, a.s, b.s);
      const dd = a.d - b.d;
      const minD = ca.radius + cb.radius;
      const d2 = ds * ds + dd * dd;
      if (d2 >= minD * minD) continue;
      const dist = Math.sqrt(d2) || 1e-3;
      const ns = ds / dist;
      const nd = dd / dist;
      const overlap = minD - dist;
      const wa = cb.mass / (ca.mass + cb.mass);
      const wb = 1 - wa;
      a.s += ns * overlap * wa;
      a.d += nd * overlap * wa;
      b.s -= ns * overlap * wb;
      b.d -= nd * overlap * wb;
      // A shove must not leave either mech through the barrier.
      const la = track.halfWidth - ca.radius;
      const lb = track.halfWidth - cb.radius;
      a.d = clamp(a.d, -la, la);
      b.d = clamp(b.d, -lb, lb);
      const rv = (a.vs - b.vs) * ns + (a.vd - b.vd) * nd;
      if (rv < 0) {
        const j2 = -rv * 1.15;
        addVelocity(a, ns * j2 * wa, nd * j2 * wa);
        addVelocity(b, -ns * j2 * wb, -nd * j2 * wb);
        if (-rv > 9) race.events.push({ type: 'bump', a: a.id, b: b.id, intensity: -rv });
      }
    }
  }
}

// --------------------------------------------------------------------------
// Inputs that are not movement: locks and team commands
// --------------------------------------------------------------------------

function handleLock(race: RaceState, track: Track, m: MechState, pressed: number): void {
  const cur = m.target >= 0 ? race.mechs[m.target] : null;
  if (pressed & BTN.LOCK) {
    if (cur && cur.team !== m.team) {
      setTarget(race, m, -1);
    } else {
      const t = pickTarget(race, track, m, false, -1);
      if (t >= 0) setTarget(race, m, t);
      else if (race.tick - m.deniedTick > 30) {
        m.deniedTick = race.tick;
        race.events.push({ type: 'denied', mech: m.id, reason: 'target' });
      }
    }
  } else if (pressed & BTN.ALLY) {
    if (cur && cur.team === m.team) {
      // Second press hops to the other teammate, or lets go.
      const other = pickTarget(race, track, m, true, cur.id);
      setTarget(race, m, other);
    } else {
      const t = pickTarget(race, track, m, true, -1);
      if (t >= 0) setTarget(race, m, t);
    }
  } else if (pressed & (BTN.TNEXT | BTN.TPREV) && cur) {
    const t = cycleTarget(race, track, m, pressed & BTN.TNEXT ? 1 : -1);
    if (t >= 0 && t !== m.target) setTarget(race, m, t);
  }
}

export function setTactic(race: RaceState, team: number, tactic: Tactic, by: number, mark: number): void {
  const ts = race.teams[team];
  ts.tactic = tactic;
  ts.mark = tactic === TACTIC.MARK ? mark : -1;
  race.events.push({ type: 'tactic', team, tactic, by, mark: ts.mark });
}

function handleCommand(race: RaceState, m: MechState, cmd: number): void {
  if (cmd <= 0 || cmd > 4) return;
  const ts = race.teams[m.team];
  let tactic = cmd as Tactic;
  let mark = -1;
  if (tactic === TACTIC.MARK) {
    // Mark what the caller is locked on to, else the rival forward.
    const cur = m.target >= 0 ? race.mechs[m.target] : null;
    if (cur && cur.team !== m.team) mark = cur.id;
    else {
      const fw = race.mechs.find((o) => o.team !== m.team && o.role === 0 && isActive(o));
      const any = race.mechs.find((o) => o.team !== m.team && isActive(o));
      mark = fw ? fw.id : any ? any.id : -1;
    }
    if (ts.tactic === TACTIC.MARK && ts.mark === mark) tactic = TACTIC.FREE;
  } else if (ts.tactic === tactic) {
    // Calling the same play again cancels it.
    tactic = TACTIC.FREE;
  }
  setTactic(race, m.team, tactic, m.id, mark);
}

// --------------------------------------------------------------------------
// Race bookkeeping
// --------------------------------------------------------------------------

const order: MechState[] = [];

/** Current running order. Finishers first, then by distance, wrecks last. */
export function updatePlaces(race: RaceState): void {
  order.length = 0;
  for (const m of race.mechs) order.push(m);
  order.sort((a, b) => {
    const ra = a.retired ? 2 : a.finished ? 0 : 1;
    const rb = b.retired ? 2 : b.finished ? 0 : 1;
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.finishTime - b.finishTime || a.id - b.id;
    if (ra === 1) return b.s - a.s || a.id - b.id;
    return b.retireTick - a.retireTick || a.id - b.id;
  });
  for (let i = 0; i < order.length; i++) order[i].place = i + 1;
}

/** Points each mech would bank if the race ended in the current order. */
export function pointsFor(m: MechState): number {
  return m.retired ? 0 : (POINTS[m.place - 1] ?? 0);
}

export function teamPoints(race: RaceState, team: number): number {
  let sum = 0;
  for (const m of race.mechs) if (m.team === team) sum += pointsFor(m);
  return sum;
}

function finalize(race: RaceState): void {
  for (const m of race.mechs) {
    if (isActive(m)) {
      // Still running when the flag fell: classified by distance covered.
      m.finished = true;
      m.finishTime = 1e9 - m.s;
      m.act = ACT.NONE;
      m.guarding = false;
      if (m.target >= 0) setTarget(race, m, -1);
    }
  }
  updatePlaces(race);
  for (const m of race.mechs) m.points = pointsFor(m);
  race.phase = PHASE.FINISHED;
  race.projectiles.length = 0;
  race.events.push({ type: 'raceEnd' });
}

// Scratch storage reused every tick. stepRace never keeps a reference to a
// caller's input object: human inputs are copied (and cleaned) into here.
const scratch: MechInput[] = [];
const controls: MechInput[] = [];
/** Ticks the throttle must be up before a press can earn the launch bonus. */
const LAUNCH_REST = 30;

const fin = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? clamp(v, lo, hi) : 0);

/** Copy a controller state into `out`, discarding anything out of range or not a number. */
function sanitize(inp: MechInput, out: MechInput): MechInput {
  out.mx = fin(inp.mx, -1, 1);
  out.my = fin(inp.my, -1, 1);
  out.throttle = fin(inp.throttle, 0, 1);
  out.brake = fin(inp.brake, 0, 1);
  out.buttons = Number.isFinite(inp.buttons) ? inp.buttons & 0xff : 0;
  out.cmd = Number.isFinite(inp.cmd) && inp.cmd >= 0 && inp.cmd <= 4 ? inp.cmd | 0 : 0;
  return out;
}

/**
 * Advance the race one tick. `inputs[id]` is the controller state for a
 * human seat; leave it null and the AI flies that mech (also used when a
 * player drops out).
 */
export function stepRace(race: RaceState, track: Track, inputs: ReadonlyArray<MechInput | null | undefined>): void {
  race.events.length = 0;
  race.tick++;
  const tick = race.tick;
  const ms = race.mechs;
  while (scratch.length < ms.length) scratch.push(emptyInput());

  if (race.phase === PHASE.COUNTDOWN) {
    const remaining = COUNTDOWN_TICKS - tick;
    for (const m of ms) {
      const inp = m.human ? inputs[m.id] : null;
      const th = inp && Number.isFinite(inp.throttle) ? inp.throttle : 0;
      if (th > 0.5) {
        if (m.prevThrottle <= 0.5) {
          // Only a press after a proper pause counts; blipping the throttle
          // through the countdown is a jump start, not a launch.
          m.throttleTick = m.throttleRest >= LAUNCH_REST ? tick : -9999;
        }
        m.throttleRest = 0;
      } else {
        m.throttleRest++;
      }
      m.prevThrottle = th;
      // Buttons held through the countdown are not presses on the GO tick.
      if (inp) {
        m.prevButtons = inp.buttons | 0;
        m.prevCmd = inp.cmd | 0;
      }
    }
    if (remaining > 0) {
      if (remaining % TICK_RATE === 0) race.events.push({ type: 'countdown', n: remaining / TICK_RATE });
      return;
    }
    race.phase = PHASE.RACING;
    race.events.push({ type: 'countdown', n: 0 });
    for (const m of ms) {
      // Launch bonus: squeeze the throttle just before the lights go out.
      const good = m.human
        ? m.prevThrottle > 0.5 && tick - m.throttleTick <= PERFECT_START_WINDOW
        : rngNext(race) < m.skill * 0.6;
      if (good) {
        m.speed = 38;
        m.drive = Math.min(DRIVE_MAX, m.drive + 10);
        syncFromSpeed(m);
        race.events.push({ type: 'launch', mech: m.id });
      }
    }
  }

  // 1. Gather controls. AI fills every seat without a live input.
  for (const m of ms) {
    const inp = m.human ? inputs[m.id] : null;
    controls[m.id] = inp ? sanitize(inp, scratch[m.id]) : aiControl(race, track, m, scratch[m.id]);
  }
  if (race.phase === PHASE.RACING) {
    for (let team = 0; team < 2; team++) aiCaptain(race, track, team);
  }

  // 2. Locks, commands and actions. The order flips every tick so neither
  //    team gets to swing first in a trade.
  for (let k = 0; k < ms.length; k++) {
    const m = ms[tick & 1 ? ms.length - 1 - k : k];
    const ctl = controls[m.id];
    // A knocked-out pilot can still call plays from the pit wall.
    if (m.human && race.phase === PHASE.RACING && ctl.cmd !== m.prevCmd && ctl.cmd > 0) handleCommand(race, m, ctl.cmd);
    if (isActive(m) && race.phase === PHASE.RACING) {
      const pressed = ctl.buttons & ~m.prevButtons;
      if (m.act !== ACT.STAGGER) handleLock(race, track, m, pressed);
      stepAction(race, track, m, ctl, pressed);
    }
    m.prevButtons = ctl.buttons;
    m.prevCmd = ctl.cmd;
  }

  // 3. Movement.
  for (const m of ms) {
    const c = classOf(m);
    if (m.retired) stepRetired(track, m);
    else if (m.mode === MODE.BATTLE && m.target >= 0) stepBattleMode(race, track, m, c, controls[m.id]);
    else stepSpeedMode(race, track, m, c, controls[m.id]);
    const sBefore = m.s;
    integrate(race, track, m, c);

    // Laps and the finish line.
    if (isActive(m) && race.phase === PHASE.RACING) {
      const lap = Math.floor(m.s / track.length);
      if (lap > m.lap) {
        m.lap = lap;
        if (lap >= race.laps) {
          const line = race.laps * track.length;
          const frac = m.s > sBefore ? clamp((line - sBefore) / (m.s - sBefore), 0, 1) : 1;
          m.finished = true;
          m.finishTime = (tick - 1 + frac) * DT;
          if (m.target >= 0) setTarget(race, m, -1);
          for (const o of ms) if (o.target === m.id) setTarget(race, o, -1);
          m.act = ACT.NONE;
          if (race.firstFinishTick < 0) race.firstFinishTick = tick;
          updatePlaces(race);
          race.events.push({ type: 'finish', mech: m.id, place: m.place });
        } else {
          race.events.push({ type: 'lap', mech: m.id, lap: lap + 1 });
        }
      }
    }
  }
  // Mechs that cross the line on the same tick are ranked by time, not by
  // seat, so a place announced earlier in the loop may have moved.
  for (const e of race.events) if (e.type === 'finish') e.place = ms[e.mech].place;

  // 4. Bodies and bullets.
  collide(race, track);
  if (race.phase === PHASE.RACING) stepProjectiles(race, track);

  // 5. Gauges, slipstream, links, and locks that have drifted out of range.
  for (const m of ms) {
    m.linked = false;
  }
  for (const m of ms) {
    if (!isActive(m)) {
      m.onStrip = false;
      m.drafting = false;
      continue;
    }
    m.onStrip = m.speed > 30 && onStrip(track, m.s, m.d);
    m.drafting = false;
    if (m.speed > 50) {
      for (const o of ms) {
        if (o === m || !isActive(o) || o.speed < 50) continue;
        const ahead = deltaS(track, o.s, m.s);
        if (ahead >= DRAFT_MIN && ahead <= DRAFT_MAX && Math.abs(o.d - m.d) < DRAFT_WIDTH) {
          m.drafting = true;
          break;
        }
      }
    }
    if (m.target >= 0) {
      const t = race.mechs[m.target];
      const dist = distance(track, m, t);
      if (!isActive(t)) {
        setTarget(race, m, -1);
      } else if (dist > LOCK_BREAK) {
        if (++m.outOfRange >= LOCK_BREAK_TICKS) setTarget(race, m, -1);
      } else {
        m.outOfRange = 0;
        if (t.team === m.team && dist < LINK_RANGE) {
          m.linked = true;
          t.linked = true;
        }
      }
    }
  }
  if (race.phase === PHASE.RACING) {
    for (const m of ms) {
      if (!isActive(m)) continue;
      const gain = DRIVE_PASSIVE + (m.onStrip ? DRIVE_STRIP : 0) + (m.drafting ? DRIVE_DRAFT : 0) + (m.linked ? DRIVE_LINK : 0);
      m.drive = Math.min(DRIVE_MAX, m.drive + gain * DT);
    }
  }

  // 6. Order, lap phase, and the end of the race.
  updatePlaces(race);
  let leaderS = -1e9;
  for (const m of ms) if (isActive(m) && m.s > leaderS) leaderS = m.s;
  if (leaderS > -1e8) race.leaderS = leaderS;
  if (race.phase === PHASE.RACING) {
    // First lap is formation, last lap is the speed lap, anything between is
    // a battle lap. A finisher counts as being on the last lap, not beyond it.
    let leaderLap = 0;
    for (const m of ms) if (!m.retired) leaderLap = Math.max(leaderLap, Math.min(m.lap, race.laps - 1));
    const phase = leaderLap <= 0 ? 1 : leaderLap >= race.laps - 1 ? 3 : 2;
    if (phase > race.lapPhase) {
      race.lapPhase = phase;
      race.events.push({ type: 'lapPhase', lap: phase });
    }

    let running = 0;
    for (const m of ms) if (isActive(m)) running++;
    if (running === 0) {
      if (race.endTick < 0) race.endTick = tick + 90;
    }
    if (race.firstFinishTick >= 0 && tick >= race.firstFinishTick + FINISH_GRACE_TICKS) finalize(race);
    else if (race.endTick >= 0 && tick >= race.endTick) finalize(race);
    else if (tick >= MAX_RACE_TICKS) finalize(race);
  }
}

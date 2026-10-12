// The race simulation. One call to stepRace advances the whole race by one
// fixed tick (1/60 s). It is deterministic: the same seed and the same inputs
// always produce the same race, which is what lets the identical code run in
// the browser for solo play and on a server for online play.

import { aiCaptain, aiControl } from './ai';
import { applyHit, retire, setStagger, stepAction, stepProjectiles, weaponsFree } from './combat';
import {
  ACT,
  ALIGN_RATE,
  ATK,
  ATTACKS,
  ATTACK_MOVE_SCALE,
  BATTLE_CAP_LAP3,
  BATTLE_CAP_MULT,
  BATTLE_CARRY_PACE,
  BATTLE_MIN_FRAC,
  BATTLE_STAGGER_DRAG,
  BOOST_ACCEL,
  BOOST_COST,
  BOOST_MIN_START,
  BTN,
  BTN_MASK,
  BUMP_TURN,
  CLASSES,
  COAST_DRAG,
  COUNTDOWN_TICKS,
  DASH_BLEED,
  DASH_OVER,
  DRAFT_MIN,
  DRAFT_WIDTH,
  DRIVE_LINK,
  DRIVE_MAX,
  DT,
  FACE_RATE,
  FINISH_GRACE_TICKS,
  LAPS,
  LINK_RANGE,
  LOCK_BREAK,
  LOCK_BREAK_TICKS,
  MAX_HEADING,
  MAX_RACE_TICKS,
  MODE,
  OVERCAP_DRAG,
  OVERDRIVE_ACCEL,
  PERFECT_START_WINDOW,
  PHASE,
  POINTS,
  RAM_ARC,
  RAM_MASS,
  RAM_MIN_CLOSING,
  RAM_SHOVE,
  SPEED_CEILING,
  SPLAT_CREDIT_TICKS,
  STAGGER_DRAG,
  STAGGER_THROTTLE,
  STEER_RATE,
  TACTIC,
  TICK_RATE,
  TOW_FAR,
  TOW_NEAR,
  WALL_DRAG,
  WALL_SPLAT_DAMAGE,
  WALL_SPLAT_MIN,
  AIR_CONTROL,
  FALL_DAMAGE,
  FALL_DEPTH,
  FALL_TICKS,
  GRAVITY,
  HARD_LANDING,
  MAG_PULL,
  PAD_MULT,
  PAD_TICKS,
  RECOVER_IFRAMES,
  RECOVER_SPEED,
  RINGOUT_BOUNCE,
  RINGOUT_DRIVE,
  RINGOUT_STAGGER,
  MOMENTUM_TOW,
  type ClassDef,
  type Tactic,
} from './config';
import {
  addVelocity,
  classOf,
  clearEffects,
  cycleTarget,
  distance,
  inPlay,
  isActive,
  limiterOf,
  ownTopSpeed,
  packBonus,
  pickTarget,
  retarget,
  setTarget,
  speedCap,
  syncFromSpeed,
  towBonus,
} from './core';
import { approach, approachAngle, clamp, lerp, rngNext, wrapAngle } from './math';
import { makeRules } from './rules';
import { deltaS, gateCrossed, gripAt, hwAt, kappaAt, kvAt, laneAt, magAt, medianAt, onPad, onStrip, roadAt, splitApart, upYAt, wallAt, type Track } from './track';
import { emptyInput, type MechInput, type MechState, type RaceConfig, type RaceState } from './types';

export { packBonus, speedCap } from './core';

export function createRace(track: Track, cfg: RaceConfig): RaceState {
  const race: RaceState = {
    tick: 0,
    phase: PHASE.COUNTDOWN,
    rng: cfg.seed | 0,
    rules: makeRules(cfg.rules),
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
    // sides row by row so neither owns the inside line into turn one, and a
    // match flips the whole grid from one round to the next.
    const s = -(10 + seat.role * 12);
    const d = ((seat.team === 0) !== (seat.role === 1) ? -9 : 9) * (cfg.gridFlip ? -1 : 1);
    // Which gates an AI pilot will bother with: the better the pilot, the more.
    let gates = 0;
    for (let g = 0; g < track.gates.length; g++) {
      if (rngNext(race) < lerp(0.3, 0.95, seat.skill)) gates |= 1 << g;
    }
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
      h: 0,
      vh: 0,
      air: false,
      fallT: 0,
      padT: 0,
      mode: MODE.SPEED,
      target: -1,
      outOfRange: 0,
      hp: c.maxHp,
      guard: c.guardMax,
      drive: clamp(race.rules.driveStart, 0, DRIVE_MAX),
      act: ACT.NONE,
      actT: 0,
      actDur: 0,
      attack: 0,
      attackStart: 0,
      attackHit: false,
      atkCharged: false,
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
      cells: clamp(race.rules.cellStart, 0, race.rules.cellMax),
      gateMask: 0,
      cdAbility: 0,
      overdriveT: 0,
      ramT: 0,
      ramHits: 0,
      shieldT: 0,
      snareT: 0,
      cloakT: 0,
      boosting: false,
      onStrip: false,
      drafting: false,
      tow: 0,
      momentum: 0,
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
        gates,
        abilityAt: 0,
        hotUntil: 0,
        hotNext: 0,
      },
    });
  });
  updatePlaces(race);
  return race;
}

function battleCap(race: RaceState, m: MechState, c: ClassDef, targetAhead: boolean): number {
  let cap: number;
  if (race.lapPhase < 3) {
    const limiter = limiterOf(race);
    const pack = limiter * (1 + packBonus(race, m));
    cap = targetAhead ? Math.max(limiter * BATTLE_CAP_MULT, pack) : pack;
  } else {
    cap = ownTopSpeed(race, m, c) * BATTLE_CAP_LAP3;
  }
  return m.snareT > 0 ? cap * race.rules.snareMult : cap;
}

// --------------------------------------------------------------------------
// Movement
// --------------------------------------------------------------------------

function stepSpeedMode(race: RaceState, track: Track, m: MechState, c: ClassDef, input: MechInput): void {
  const staggered = m.act === ACT.STAGGER;
  m.steer = approach(m.steer, staggered ? 0 : clamp(input.mx, -1, 1), STEER_RATE * DT);

  let cap = speedCap(race, m, c);
  const wasBoosting = m.boosting;
  const overdrive = m.overdriveT > 0;
  m.boosting = false;
  // A tick of boost has to be paid for in full: with `drive > 0` the passive
  // trickle alone kept an empty gauge boosting for as long as A was held.
  // Overdrive takes the place of boost, and a snared mech cannot light it.
  const fuel = wasBoosting ? BOOST_COST * DT : BOOST_MIN_START;
  if (!staggered && !m.finished && !overdrive && m.snareT <= 0 && (input.buttons & BTN.A) !== 0 && m.drive >= fuel && input.throttle > 0.2) {
    m.boosting = true;
    cap *= race.rules.boostMult;
    m.drive = Math.max(0, m.drive - BOOST_COST * DT);
    if (!wasBoosting) race.events.push({ type: 'boost', mech: m.id });
  }
  // The tow: full strength after a moment behind someone, and it lingers for
  // a moment after pulling out, which is what makes a slingshot pass.
  cap *= 1 + towBonus(race, m);
  // A speed pad pushes harder still for a moment.
  const padded = m.padT > 0;
  if (padded) cap *= PAD_MULT;

  // A stagger takes the stick and the boost away, not the pace.
  const throttle = staggered ? Math.min(clamp(input.throttle, 0, 1), STAGGER_THROTTLE) : clamp(input.throttle, 0, 1);
  const brake = staggered ? 0 : clamp(input.brake, 0, 1);
  const want = cap * throttle;
  if (m.speed < want) {
    // Acceleration tails off toward the cap.
    const room = clamp(1.2 - m.speed / cap, 0.18, 1);
    m.speed = Math.min(want, m.speed + c.accel * (overdrive ? OVERDRIVE_ACCEL : m.boosting || padded ? BOOST_ACCEL : 1) * room * DT);
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

  // Steering fights the bend of the road: hold a line or run wide. A turn
  // banked toward its inside grips harder; in the air there is little grip at all.
  const grip = c.grip * gripAt(track, m.s);
  const omegaMax = Math.min(c.turnMax, grip / Math.max(m.speed, 24)) * Math.min(1, m.speed / 12) * (m.air ? AIR_CONTROL : 1);
  const kappa = kappaAt(track, m.s);
  const sdot = (m.speed * Math.cos(m.heading)) / Math.max(0.35, 1 - kappa * m.d);
  const align = -m.heading * ALIGN_RATE * (1 - Math.abs(m.steer));
  m.heading = clamp(m.heading + (m.steer * omegaMax - kappa * sdot + align) * DT, -MAX_HEADING, MAX_HEADING);
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
  const limiter = limiterOf(race);
  const floor = limiter * BATTLE_MIN_FRAC;
  const move = race.rules.battleMove;

  if (m.act === ACT.STAGGER) {
    // Tumbling: no control, bleed speed.
    m.vs = approach(m.vs, floor, BATTLE_STAGGER_DRAG * DT);
    m.vd *= 0.955;
  } else if (m.act === ACT.DASH) {
    // The dash impulse was applied when it started; just let it run out.
    // Down the road it only counts for part of its speed over the cap, or
    // dash after dash would be a quicker way round the lap than the boost.
    m.vd *= 0.985;
    const over = battleCap(race, m, c, true) + c.dash * DASH_OVER;
    if (m.vs > over) m.vs = over;
    // The same the other way: a hop back takes only so much off, so hop
    // after hop cannot stop a mech dead or send it backwards down the road.
    const under = Math.min(over, floor) - c.dash * DASH_OVER;
    if (m.vs < under) m.vs = under;
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
    scale *= move;
    const rs = (us * my * c.approach - ud * mx * c.strafe) * scale + us * advance;
    const rd = (ud * my * c.approach + us * mx * c.strafe) * scale + ud * advance;

    // The track carries you at your target's pace, easing toward the
    // limiter so a long fight does not grind to a halt.
    const ref = race.lapPhase < 3 ? limiter : battleCap(race, m, c, true);
    // Carried at the target's pace, leaning toward race pace, so a fight
    // moves down the road as fast as the race does.
    const carry = lerp(t.vs, ref, BATTLE_CARRY_PACE);
    const cap = battleCap(race, m, c, ds > 2) + advance * 0.6;
    // Whatever a dash (or a shove) left over the cap, or under the slowest a
    // fight is carried, is made up at once.
    const low = Math.min(floor, cap);
    if (m.vs > cap) m.vs = Math.max(cap, m.vs - DASH_BLEED * DT);
    else if (m.vs < low) m.vs = Math.min(low, m.vs + DASH_BLEED * DT);
    const wantVs = clamp(carry + rs, Math.min(floor, cap), cap);
    const wantVd = rd;
    const acc = c.battleAccel * move * (advance > 0 ? 2.2 : 1) * DT;
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
  const edge = (m.d >= 0 ? 1 : -1) * (hwAt(track, m.s) - classOf(m).radius - 1);
  m.vd = clamp((edge - m.d) * 1.2, -7, 7);
  // ...or, with no road under it, drops out of sight.
  if (track.air && (m.air || m.h < 0 || !roadAt(track, m.s, m.d))) {
    m.air = true;
    m.vh -= GRAVITY * DT;
    m.h = Math.max(-400, m.h + m.vh * DT);
  }
}

// --------------------------------------------------------------------------
// Off the ground: jumps, crests, open edges, falls and the recovery drone
// --------------------------------------------------------------------------

/**
 * Height above the road. On the ground the road holds a mech while its push
 * against the surface (gravity's share plus the curve of the road) stays
 * positive; over a crest taken fast enough, or past the end of the road, it
 * leaves it and flies, and comes down where the road is. A mech that comes
 * down with no road under it has fallen. Loops and corkscrews hold whatever
 * the speed. Plan tracks never get here.
 */
function stepAir(race: RaceState, track: Track, m: MechState): void {
  if (!track.air || m.retired || m.finished) return;
  const on = roadAt(track, m.s, m.d);
  if (!m.air) {
    if (!on || (!magAt(track, m.s) && GRAVITY * upYAt(track, m.s) + kvAt(track, m.s) * m.vs * m.vs < 0)) {
      m.air = true;
      m.vh = 0;
      race.events.push({ type: 'airborne', mech: m.id });
    } else {
      return;
    }
  }
  // Over a loop or a corkscrew the skates' grip on the rail pulls a mech in
  // whichever way up the road is; elsewhere it is gravity and the road's curve.
  const pull = magAt(track, m.s) ? -MAG_PULL : -GRAVITY * upYAt(track, m.s) - kvAt(track, m.s) * m.vs * m.vs;
  m.vh += pull * DT;
  m.h += m.vh * DT;
  if (m.h > 0) return;
  if (on) {
    const hit = -m.vh;
    m.h = 0;
    m.vh = 0;
    m.air = false;
    if (hit > HARD_LANDING && m.mode === MODE.SPEED) {
      m.speed *= 1 - Math.min(0.12, (hit - HARD_LANDING) * 0.004);
      syncFromSpeed(m);
    }
    race.events.push({ type: 'land', mech: m.id, intensity: hit });
  } else if (m.h < -FALL_DEPTH) {
    startFall(race, track, m);
  }
}

/** Fallen: out of the race for a moment, armour lost, credited like a ring-out. */
function startFall(race: RaceState, track: Track, m: MechState): void {
  m.fallT = FALL_TICKS;
  m.air = true;
  if (m.vh > 0) m.vh = 0;
  m.act = ACT.NONE;
  m.guarding = false;
  m.boosting = false;
  m.comboQueued = false;
  m.chain = 0;
  m.padT = 0;
  m.momentum = 0;
  m.iframes = Math.max(m.iframes, FALL_TICKS + RECOVER_IFRAMES);
  if (m.target >= 0) setTarget(race, m, -1);
  for (const o of race.mechs) if (o.target === m.id) retarget(race, track, o, m.id);
  const credit = m.lastHitBy >= 0 && race.tick - m.lastHitTick <= SPLAT_CREDIT_TICKS;
  const by = credit ? race.mechs[m.lastHitBy] : null;
  const dmg = Math.min(m.hp, FALL_DAMAGE);
  m.hp -= dmg;
  m.dmgTaken += dmg;
  if (by) by.dmgDealt += dmg;
  race.events.push({ type: 'fall', mech: m.id, by: by ? by.id : -1, damage: dmg });
  if (m.hp <= 0.001) retire(race, m, by, track);
}

/** A fallen mech drifts on, dropping, until the drone has it. */
function stepFalling(race: RaceState, track: Track, m: MechState, c: ClassDef): void {
  m.vs *= 1 - 0.9 * DT;
  m.vd *= 1 - 2 * DT;
  m.speed = Math.hypot(m.vs, m.vd);
  m.s += m.vs * DT;
  m.d += m.vd * DT;
  m.vh -= GRAVITY * DT;
  m.h = Math.max(-400, m.h + m.vh * DT);
  m.steer = 0;
  if (--m.fallT > 0) return;
  // Put back on the road, on its own side, where there is road to stand on.
  const side = m.d >= 0 ? 1 : -1;
  let s = m.s;
  for (let k = 0; k < 250 && !roadAt(track, s, side); k++) s += 4;
  s += 12;
  const [lo, hi] = laneAt(track, s, side, c.radius);
  m.s = s;
  m.d = lo + 2 < hi - 2 ? clamp(m.d, lo + 2, hi - 2) : (lo + hi) / 2;
  m.h = 0;
  m.vh = 0;
  m.air = false;
  const pace = race.lapPhase < 3 ? limiterOf(race) : ownTopSpeed(race, m, c);
  m.speed = pace * RECOVER_SPEED;
  m.heading = 0;
  m.facing = 0;
  m.mode = MODE.SPEED;
  syncFromSpeed(m);
  m.iframes = RECOVER_IFRAMES;
  race.events.push({ type: 'recover', mech: m.id });
}

function integrate(race: RaceState, track: Track, m: MechState, c: ClassDef): void {
  const kappa = kappaAt(track, m.s);
  const home = m.d >= 0 ? 1 : -1;
  // The inside of a bend is the shorter way round.
  m.s += (m.vs / Math.max(0.35, 1 - kappa * m.d)) * DT;
  m.d += m.vd * DT;

  // The lane this mech may use: the road, less the wall down the middle of a
  // fork if it is in one. An edge with no barrier lets it go over.
  const [lo, hi] = laneAt(track, m.s, home, c.radius);
  let side = 0;
  let limit = 0;
  if (m.d > hi) {
    const outer = home > 0;
    if (!outer || wallAt(track, m.s, 1)) {
      side = 1;
      limit = hi;
    }
  } else if (m.d < lo) {
    const outer = home < 0;
    if (!outer || wallAt(track, m.s, -1)) {
      side = -1;
      limit = lo;
    }
  }
  if (side !== 0) {
    m.d = limit;
    // Where the wall's face is: the road's edge, or the side of a fork's middle wall.
    const face = limit + side * c.radius;
    const into = m.vd * side;
    if (into > 0) {
      let bounce = 0.25;
      if (!m.retired) {
        const ringOut = m.act === ACT.STAGGER && into > WALL_SPLAT_MIN && isActive(m);
        if (into > 7 && m.wall === 0 && !ringOut) {
          race.events.push({ type: 'wall', mech: m.id, intensity: into, s: m.s, side, face });
        }
        if (ringOut) {
          // Knocked into the barrier while reeling: a ring-out. Heavy damage,
          // a long tumble, and thrown back off the wall into the fight.
          const dmg = Math.min(m.hp, race.rules.ringoutDamage + into * WALL_SPLAT_DAMAGE);
          m.hp -= dmg;
          m.dmgTaken += dmg;
          setStagger(m, RINGOUT_STAGGER);
          const credit = m.lastHitBy >= 0 && race.tick - m.lastHitTick <= SPLAT_CREDIT_TICKS;
          const by = credit ? race.mechs[m.lastHitBy] : null;
          if (by) {
            by.dmgDealt += dmg;
            by.drive = Math.min(DRIVE_MAX, by.drive + RINGOUT_DRIVE);
          }
          race.events.push({ type: 'splat', mech: m.id, by: by ? by.id : -1, damage: dmg, intensity: into, s: m.s, side, face });
          if (m.hp <= 0.001) retire(race, m, by, track);
          else bounce = RINGOUT_BOUNCE;
        }
      }
      if (m.mode === MODE.SPEED) {
        // Scrub speed by how square the impact was, then slide along the wall.
        const sin = Math.min(1, into / Math.max(m.speed, 1));
        m.speed *= 1 - 0.45 * sin;
        // Slide along the barrier, or after a ring-out, glance back off it.
        m.heading = -side * (bounce > 0.25 ? 0.15 : 0.03);
        syncFromSpeed(m);
      } else {
        m.vd = -m.vd * bounce;
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

/** Hold d inside [lo, hi], except past an edge with no barrier. */
function clampLane(track: Track, s: number, d: number, lo: number, hi: number): number {
  if (d > hi && (hi < 0 || wallAt(track, s, 1))) return hi;
  if (d < lo && (lo > 0 || wallAt(track, s, -1))) return lo;
  return d;
}

function collide(race: RaceState, track: Track): void {
  const ms = race.mechs;
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    if (!inPlay(a)) continue;
    const ca = classOf(a);
    for (let j = i + 1; j < ms.length; j++) {
      const b = ms[j];
      if (!inPlay(b)) continue;
      // One flying over the other does not touch it.
      if (Math.abs(a.h - b.h) > 6) continue;
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
      // A ramming mech carries through whatever it hits.
      const ma = ca.mass * (a.ramT > 0 ? RAM_MASS : 1);
      const mb = cb.mass * (b.ramT > 0 ? RAM_MASS : 1);
      const wa = mb / (ma + mb);
      const wb = 1 - wa;
      const aHome = a.d >= 0 ? 1 : -1;
      const bHome = b.d >= 0 ? 1 : -1;
      a.s += ns * overlap * wa;
      a.d += nd * overlap * wa;
      b.s -= ns * overlap * wb;
      b.d -= nd * overlap * wb;
      // A shove must not leave either mech through the barrier (an open edge
      // is another matter: a mech can be shoved off it).
      const [alo, ahi] = laneAt(track, a.s, aHome, ca.radius);
      const [blo, bhi] = laneAt(track, b.s, bHome, cb.radius);
      a.d = clampLane(track, a.s, a.d, alo, ahi);
      b.d = clampLane(track, b.s, b.d, blo, bhi);
      const rv = (a.vs - b.vs) * ns + (a.vd - b.vd) * nd;
      if (rv < 0) {
        const j2 = -rv * 1.15;
        // Racing contact moves a mech over more than it turns it.
        const ta = a.mode === MODE.SPEED ? BUMP_TURN : 1;
        const tb = b.mode === MODE.SPEED ? BUMP_TURN : 1;
        addVelocity(a, ns * j2 * wa, nd * j2 * wa * ta);
        addVelocity(b, -ns * j2 * wb, -nd * j2 * wb * tb);
        if (-rv > 9) race.events.push({ type: 'bump', a: a.id, b: b.id, intensity: -rv });
        if (a.team !== b.team && -rv >= RAM_MIN_CLOSING) {
          // Two rams meeting head on: who lands first alternates tick by tick, like every other trade.
          const first = race.tick & 1 ? b : a;
          const second = first === a ? b : a;
          if (first.ramT > 0) ram(race, track, first, second);
          if (second.ramT > 0 && isActive(a) && isActive(b)) ram(race, track, second, first);
          if (!isActive(a)) break;
        }
      }
    }
  }
}

/** A ramming defender has run into `vic`: one heavy hit per target, and a shove toward the wall. */
function ram(race: RaceState, track: Track, att: MechState, vic: MechState): void {
  const bit = 1 << vic.id;
  if (att.ramHits & bit || !weaponsFree(race)) return;
  // The prow is at the front: something that runs into the back of a ramming mech is not rammed.
  const dd = vic.d - att.d;
  if (Math.abs(wrapAngle(Math.atan2(dd, deltaS(track, vic.s, att.s)) - att.facing)) > RAM_ARC) return;
  // A rival mid-dodge slips it for now; the ram is not used up on them.
  if (vic.iframes > 0) return;
  const def = { ...ATTACKS[ATK.DF_RAM], damage: race.rules.ramDamage };
  const braced = vic.shieldT > 0 || vic.ramT > 0 || vic.guarding;
  if (!applyHit(race, track, att, vic, def, ATK.DF_RAM)) return;
  att.ramHits |= bit;
  if (!isActive(vic)) return;
  // Sideways, away from the attacker; from dead astern, toward the nearer wall.
  const side = Math.abs(dd) > 0.5 ? Math.sign(dd) : vic.d >= 0 ? 1 : -1;
  addVelocity(vic, 0, side * RAM_SHOVE * (braced ? 0.3 : 1));
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
    else if (race.tick - m.deniedTick > 30) {
      // Say so, rather than doing nothing: there is nobody else in reach.
      m.deniedTick = race.tick;
      race.events.push({ type: 'denied', mech: m.id, reason: 'switch' });
    }
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

/** Placing points a mech would bank if the race ended in the current order. */
export function pointsFor(m: MechState): number {
  return m.retired ? 0 : (POINTS[m.place - 1] ?? 0);
}

/** Points a mech has earned for its team by knocking rivals out. They survive its own retirement. */
export function koBonus(race: RaceState, m: MechState): number {
  return m.kos * race.rules.koPoints;
}

export function teamPoints(race: RaceState, team: number): number {
  let sum = 0;
  for (const m of race.mechs) if (m.team === team) sum += pointsFor(m) + koBonus(race, m);
  return sum;
}

function finalize(race: RaceState): void {
  for (const m of race.mechs) {
    if (isActive(m)) {
      // Still running when the flag fell: classified by distance covered.
      m.finished = true;
      m.fallT = 0;
      m.air = false;
      m.h = 0;
      m.vh = 0;
      m.finishTime = 1e9 - m.s;
      m.act = ACT.NONE;
      m.guarding = false;
      clearEffects(m);
      if (m.target >= 0) setTarget(race, m, -1);
    }
  }
  updatePlaces(race);
  for (const m of race.mechs) m.points = pointsFor(m) + koBonus(race, m);
  race.phase = PHASE.FINISHED;
  race.projectiles.length = 0;
  race.events.push({ type: 'raceEnd' });
}

// Scratch storage reused every tick. stepRace never keeps a reference to a
// caller's input object: human inputs are copied (and cleaned) into here.
const scratch: MechInput[] = [];
const controls: MechInput[] = [];
/**
 * Where each mech was when this tick's movement began, and where its own
 * movement took it before collisions. Filled and used within one stepRace call.
 */
const startS: number[] = [];
const movedS: number[] = [];
const movedD: number[] = [];
/** Ticks the throttle must be up before a press can earn the launch bonus. */
const LAUNCH_REST = 30;

const fin = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? clamp(v, lo, hi) : 0);

/** Copy a controller state into `out`, discarding anything out of range or not a number. */
function sanitize(inp: MechInput, out: MechInput): MechInput {
  out.mx = fin(inp.mx, -1, 1);
  out.my = fin(inp.my, -1, 1);
  out.throttle = fin(inp.throttle, 0, 1);
  out.brake = fin(inp.brake, 0, 1);
  out.buttons = Number.isFinite(inp.buttons) ? inp.buttons & BTN_MASK : 0;
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
        m.speed = 44;
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
    if (inPlay(m) && race.phase === PHASE.RACING) {
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
    const sBefore = m.s;
    startS[m.id] = sBefore;
    if (m.fallT > 0 && !m.retired) {
      // Fallen: out of it until the recovery drone puts it back.
      stepFalling(race, track, m, c);
      movedS[m.id] = m.s;
      movedD[m.id] = m.d;
      continue;
    }
    if (m.retired) stepRetired(track, m);
    else if (m.mode === MODE.BATTLE && m.target >= 0) stepBattleMode(race, track, m, c, controls[m.id]);
    else stepSpeedMode(race, track, m, c, controls[m.id]);
    // Momentum: racing hard (a boost, an Overdrive, a charged slipstream, a
    // speed pad) primes the next attack for a moment. A fight only spends it.
    if (isActive(m) && m.mode === MODE.SPEED && m.act !== ACT.STAGGER && (m.boosting || m.overdriveT > 0 || m.padT > 0 || m.tow >= MOMENTUM_TOW)) {
      m.momentum = Math.round(race.rules.momentumSecs * TICK_RATE);
    } else if (m.momentum > 0) {
      m.momentum--;
    }
    integrate(race, track, m, c);
    stepAir(race, track, m);
    movedS[m.id] = m.s;
    movedD[m.id] = m.d;

    if (inPlay(m) && race.phase === PHASE.RACING) {
      // Laps and the finish line.
      const lap = Math.floor(m.s / track.length);
      if (lap > m.lap) {
        m.lap = lap;
        m.gateMask = 0;
        if (lap >= race.laps) {
          const line = race.laps * track.length;
          const frac = m.s > sBefore ? clamp((line - sBefore) / (m.s - sBefore), 0, 1) : 1;
          m.finished = true;
          m.finishTime = (tick - 1 + frac) * DT;
          if (m.target >= 0) setTarget(race, m, -1);
          for (const o of ms) if (o.target === m.id) retarget(race, track, o, m.id);
          m.act = ACT.NONE;
          clearEffects(m);
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
  let finishers = 0;
  for (const e of race.events) {
    if (e.type !== 'finish') continue;
    e.place = ms[e.mech].place;
    finishers++;
  }
  if (finishers > 1) {
    // ...and announce them in finishing order.
    const fin = race.events.filter((e) => e.type === 'finish').sort((x, y) => (x.type === 'finish' && y.type === 'finish' ? x.place - y.place : 0));
    let k = 0;
    for (let i = 0; i < race.events.length; i++) if (race.events[i].type === 'finish') race.events[i] = fin[k++];
  }

  // 4. Bodies and bullets.
  collide(race, track);
  if (race.phase === PHASE.RACING) stepProjectiles(race, track);

  // Cell gates. Checked over everything a mech moved this tick, shoves
  // included, so being shunted through an arch still counts. Lit for as many
  // laps as the rules say (the whole race by default), each gate once a lap,
  // and a full mech takes nothing.
  if (race.phase === PHASE.RACING && track.gates.length > 0) {
    for (const m of ms) {
      if (!inPlay(m) || m.lap >= race.rules.gateLaps || m.cells >= race.rules.cellMax) continue;
      // The line has to be behind the mech when the tick ends. The opening is
      // judged on where it ended up, or on where it was when it crossed under
      // its own power, so contact cannot take a gate away.
      let g = gateCrossed(track, startS[m.id], m.s, m.d, m.gateMask);
      if (g < 0) g = gateCrossed(track, startS[m.id], Math.min(movedS[m.id], m.s), movedD[m.id], m.gateMask);
      if (g < 0) continue;
      const worth = m.lap <= 0 ? race.rules.gateValue : race.rules.gateValueLater;
      if (worth <= 0) continue;
      m.gateMask |= 1 << g;
      m.cells = Math.min(race.rules.cellMax, m.cells + worth);
      race.events.push({ type: 'gate', mech: m.id, gate: g, cells: m.cells });
    }
  }

  // 5. Gauges, slipstream, links, and locks that have drifted out of range.
  const rules = race.rules;
  const towRange = Math.max(DRAFT_MIN + 1, race.lapPhase >= 3 ? rules.towRange3 : rules.towRange);
  const towNear = Math.min(towRange - 1, Math.max(TOW_NEAR, towRange * 0.4));
  for (const m of ms) {
    m.linked = false;
  }
  for (const m of ms) {
    if (!inPlay(m)) {
      m.onStrip = false;
      m.drafting = false;
      m.tow = 0;
      m.padT = 0;
      continue;
    }
    // Strips and pads work through the skates: not in the air.
    m.onStrip = m.speed > 30 && !m.air && onStrip(track, m.s, m.d);
    if (!m.air && track.pads.length > 0 && onPad(track, m.s, m.d)) {
      if (m.padT === 0) race.events.push({ type: 'pad', mech: m.id });
      m.padT = PAD_TICKS;
    } else if (m.padT > 0) {
      m.padT--;
    }
    // Slipstream: how well tucked in behind somebody this mech is. Close up
    // the tow is at full strength; at the far end of its reach it is a third.
    m.drafting = false;
    let strength = 0;
    if (m.speed > 50) {
      for (const o of ms) {
        if (o === m || !inPlay(o) || o.speed < 50) continue;
        const ahead = deltaS(track, o.s, m.s);
        if (ahead < DRAFT_MIN || ahead > towRange || Math.abs(o.d - m.d) >= DRAFT_WIDTH) continue;
        if (splitApart(track, m.s, m.d, o.s, o.d)) continue;
        m.drafting = true;
        strength = Math.max(strength, ahead <= towNear ? 1 : lerp(1, TOW_FAR, (ahead - towNear) / (towRange - towNear)));
      }
    }
    if (m.tow < strength) m.tow = Math.min(strength, m.tow + DT / Math.max(0.05, rules.towBuild));
    else m.tow = Math.max(strength, m.tow - DT / Math.max(0.05, rules.slingshot));
    if (m.target >= 0) {
      const t = race.mechs[m.target];
      const dist = distance(track, m, t);
      if (!inPlay(t) || splitApart(track, m.s, m.d, t.s, t.d)) {
        // Gone (or behind the wall of a fork): the lock cannot hold.
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
    // On the formation lap Drive comes from the charge strips and nowhere else.
    const lap1 = race.lapPhase <= 1;
    const trickle = lap1 && rules.lap1Trickle < 0.5 ? 0 : 1;
    const strip = lap1 ? rules.driveStripLap1 : rules.driveStrip;
    for (const m of ms) {
      if (!inPlay(m)) continue;
      const gain = (m.onStrip ? strip : 0) + trickle * (rules.drivePassive + (m.drafting ? rules.driveDraft : 0) + (m.linked ? DRIVE_LINK : 0));
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

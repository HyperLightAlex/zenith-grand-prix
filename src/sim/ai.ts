// AI pilots. They fly through the same MechInput a person does, so an AI
// seat and a human seat are interchangeable and nothing the AI does is
// outside the rules. (The one shortcut: an AI names its lock target directly
// instead of cycling with the shoulder buttons.)

import { abilityFor, weaponsFree } from './combat';
import {
  ABILITY,
  ACT,
  ATK,
  ATTACKS,
  BTN,
  CARVE_MIN_SPEED,
  CARVE_MIN_STEER,
  CARVE_STEER_WIDE,
  CARVE_TURN,
  LOCK_RANGE,
  MODE,
  PHASE,
  ROLE,
  CALLER,
  TACTIC,
  type Tactic,
} from './config';
import { carveStick, classOf, distance, hpFraction, inPlay, lockable, sameRoute, setTarget, speedCap } from './core';
import { clamp, lerp, rngNext, wrapAngle } from './math';
import { setTactic } from './sim';
import { deltaS, forkAt, gripAt, hwAt, kappaAheadAt, kappaAt, laneAt, lineAt, splitApart, wallAt, wrapS, type Fork, type Track } from './track';
import type { AttackDef } from './config';
import type { MechInput, MechState, RaceState } from './types';

const INTENT = { RACE: 0, ENGAGE: 1, ESCORT: 2 } as const;
/** In a Sprint, how far down the road a pilot will go after the leader (metres): out of reach of a lock, it runs them down. */
const HUNT_RANGE = 450;

/** Set a button only on a tick where it was up before, so the sim sees a press. */
function press(out: MechInput, m: MechState, bit: number): void {
  if ((m.prevButtons & bit) === 0) out.buttons |= bit;
}

/**
 * Whether to hold a heavy just thrown and charge it, and for how long. A
 * rival already staggered is a free hit worth charging, and so is a lance
 * from a long run-up; otherwise now and then, the better pilot more often,
 * so the charge is a tell a person learns to read. Never when a blow is
 * coming its way.
 */
function holdHeavy(race: RaceState, ai: MechState['ai'], m: MechState, t: MechState, a: AttackDef, out: MechInput): void {
  const full = a.charge ?? 0;
  if (full <= 0 || (out.buttons & BTN.Y) === 0) return;
  const threatened = race.mechs.some((e) => e.team !== m.team && e.act === ACT.ATTACK && e.target === m.id && e.actT < ATTACKS[e.attack].windup);
  if (threatened) return;
  const free = t.act === ACT.STAGGER;
  const runUp = a.advance >= 60 && distanceS(t, m) > 22;
  const p = free ? 0.7 : runUp ? 0.35 : 0.1 + 0.25 * m.skill;
  if (rngNext(race) >= p) return;
  const share = free ? 1 : 0.4 + 0.6 * rngNext(race);
  ai.holdUntil = race.tick + a.windup + Math.round(full * share);
}

/** Rough distance down the road between two mechs (enough for a run-up). */
function distanceS(a: MechState, b: MechState): number {
  return Math.abs(a.s - b.s);
}

function ownForward(race: RaceState, m: MechState): MechState | null {
  for (const o of race.mechs) {
    if (o.team === m.team && o.role === ROLE.FW && inPlay(o)) return o;
  }
  return null;
}

function think(race: RaceState, track: Track, m: MechState): void {
  const ai = m.ai;
  ai.nextThink = race.tick + 8 + Math.floor(rngNext(race) * 5);
  if (!weaponsFree(race) || m.finished) {
    ai.intent = INTENT.RACE;
    ai.intentTarget = -1;
    return;
  }
  const ts = race.teams[m.team];
  const tactic = ts.tactic;
  const fw = ownForward(race, m);
  const hp = hpFraction(m);
  const lap3 = race.lapPhase >= 3;
  const maxRange = lap3 ? 60 : 150;

  const ordered = tactic === TACTIC.BLITZ || tactic === TACTIC.MARK;
  const resting = !ordered && race.tick < ai.restUntil;

  let best = -1;
  let bestScore = 28;
  for (const e of race.mechs) {
    if (e.team === m.team || !inPlay(e)) continue;
    const ds = deltaS(track, e.s, m.s);
    const dist = Math.hypot(ds, e.d - m.d);
    // In a Sprint whoever leads is the one to beat: they are run down from
    // much further off than anyone else is gone after.
    const hunt = race.sprint && e.place === 1 && m.place > 1;
    if (dist > (hunt && !lap3 ? HUNT_RANGE : maxRange)) continue;
    if (lap3) {
      // The speed lap is for racing. Support pilots may pounce on a forward
      // as it comes through (in a Sprint, anyone on the leader); anyone may
      // answer an attacker on top of them.
      const pounce = ((m.role !== ROLE.FW && e.role === ROLE.FW) || hunt) && ds < 8 && dist < 45 && tactic !== TACTIC.RUN;
      const answer = e.target === m.id && dist < 14 && e.mode === MODE.BATTLE;
      if (!pounce && !answer) continue;
    } else if (resting && !(e.target === m.id && dist < 16)) {
      continue;
    }
    let sc = 46 - Math.min(dist, 150) * 0.3 - Math.max(0, dist - 150) * 0.05;
    const onMe = e.target === m.id && dist < 30;
    const onFw = fw !== null && fw !== m && (e.target === fw.id || distance(track, e, fw) < 28);
    const onAlly = e.target >= 0 && race.mechs[e.target].team === m.team && e.target !== m.id;
    // Role doctrine: forwards race, midfielders back up whoever is in a
    // fight, defenders peel attackers off their own forward. In a Sprint
    // every pilot is out to win: the leader is the one to catch and bring
    // down (whoever it is as the lead changes hands), the racer just ahead
    // the one in the way; the rest of the field is left to itself unless it
    // starts something. Several may go after the leader, but the field does
    // not pile onto anyone else.
    if (race.sprint) {
      if (hunt) sc += 50;
      else if (e.place === m.place - 1) sc += 8;
      else sc += e.place < m.place ? -4 : -14;
      if (onMe) sc += 32;
      let others = 0;
      for (const o of race.mechs) if (o !== m && o !== e && o.target === e.id && inPlay(o)) others++;
      // A second on the leader is welcome; a third has to be given a reason (they are on it).
      sc -= hunt ? (others > 0 ? 10 + (others - 1) * 40 : 0) : others * 24;
    } else if (m.role === ROLE.FW) {
      // A forward's job is the finish line: it fights when it is picked on,
      // or when the team calls for it.
      sc += e.role === ROLE.FW ? -20 : e.role === ROLE.DF ? -34 : -26;
      if (onMe) sc += 32;
    } else if (m.role === ROLE.MF) {
      // Leave the forwards to their duel unless told otherwise.
      if (e.role === ROLE.FW) sc -= 26;
      else if (onAlly) sc += 14;
      if (e.role === ROLE.MF) sc += 6;
    } else {
      if (e.role === ROLE.FW) sc -= 26;
      else if (onFw) sc += 30;
      else sc += 8;
    }
    // Team tactics. Even on the attack a forward only joins in on what is
    // right beside it; the support pilots do the hunting.
    if (tactic === TACTIC.BLITZ) sc += m.role === ROLE.FW ? 14 : 22;
    else if (tactic === TACTIC.RUN) sc += onMe ? -20 : -45;
    else if (tactic === TACTIC.SHIELD) sc += m.role === ROLE.FW ? -15 : onFw ? 35 : -25;
    else if (tactic === TACTIC.MARK) sc += e.id === ts.mark ? (m.role === ROLE.FW ? 20 : 55) : -18;
    if (lap3) sc += 20;
    if (hp < 0.3 && tactic !== TACTIC.BLITZ) sc -= 35;
    if (hpFraction(e) < 0.3) sc += 14;
    if (ai.intent === INTENT.ENGAGE && e.id === ai.intentTarget) sc += 12;
    sc += (rngNext(race) - 0.5) * 6;
    if (sc > bestScore) {
      bestScore = sc;
      best = e.id;
    }
  }

  if (best >= 0) {
    if (ai.intent !== INTENT.ENGAGE || race.tick > ai.boutUntil + 120) {
      // A fresh bout: fight for a while, then break off and reset.
      const len = lap3 ? 300 : 600 + Math.floor(rngNext(race) * 420);
      ai.boutUntil = race.tick + len;
    }
    ai.intent = INTENT.ENGAGE;
    ai.intentTarget = best;
    if (!ordered && race.tick >= ai.boutUntil) {
      ai.restUntil = race.tick + (lap3 ? 480 : 150 + Math.floor(rngNext(race) * 150));
      ai.intent = INTENT.RACE;
      ai.intentTarget = -1;
    }
  } else if (tactic === TACTIC.SHIELD && m.role !== ROLE.FW && fw && fw !== m && distance(track, m, fw) < 150) {
    ai.intent = INTENT.ESCORT;
    ai.intentTarget = fw.id;
  } else {
    ai.intent = INTENT.RACE;
    ai.intentTarget = -1;
  }

  // Badly hurt and not under orders to brawl: break away, if there is the
  // Drive to actually get clear. Without it, running only means taking hits
  // in the back, so stand and defend instead.
  if (hp < 0.3 && tactic !== TACTIC.BLITZ && m.lastHitTick > race.tick - 120 && m.drive >= 35 && race.tick >= ai.restUntil) {
    ai.intent = INTENT.RACE;
    ai.intentTarget = -1;
    ai.boostUntil = race.tick + 150;
    ai.restUntil = race.tick + 360;
  }
}

/**
 * Which route to take at a fork coming up (or under way): -1 left, 1 right,
 * 0 when there is no fork near. Drive-hungry pilots go for strips, pilots
 * short of a Cell for the gate, the rest for speed (pads, the jump) unless
 * they are too slow to clear it; ties split the field by pilot.
 */
function routeSide(race: RaceState, track: Track, m: MechState, look: number): number {
  const here = forkAt(track, m.s);
  if (here) return m.d >= 0 ? 1 : -1; // already in: stay on this side of the wall
  let fork: Fork | null = null;
  for (const ahead of [look, look + 80, look + 160]) {
    fork = forkAt(track, m.s + ahead);
    if (fork) break;
  }
  if (!fork) return 0;
  const lap3 = race.lapPhase >= 3;
  const wantDrive = m.drive < 55 ? 2 : m.drive < 85 ? 0.5 : 0;
  // (A gate is no use to a pilot that could not bank a whole Cell from it.)
  const wantCell = m.cells > race.rules.cellMax - 1 ? 0 : m.cells < Math.min(1, race.rules.cellMax) && m.lap < race.rules.gateLaps ? 2.5 : 0.6;
  // Forwards are racers first: they like the quick way (the pad, the jump)
  // better than the others do, so the field splits instead of queueing.
  const racer = m.role === ROLE.FW;
  const score = (r: Fork['left']) =>
    r.strips * wantDrive + r.gates * wantCell + r.pads * (lap3 ? 2 : 1) * (racer ? 2.2 : 1) + (r.jump ? (m.speed > 100 ? (racer ? 1.2 : 0.5) : -3) : 0);
  // Each pilot has a side it favours (the lane it likes to run in), worth
  // about as much as a speed pad: close calls go its way, clear ones do not.
  const lean = clamp(m.ai.lane / 5, -1, 1) * 1.4;
  const l = score(fork.left) - lean;
  const r = score(fork.right) + lean;
  if (Math.abs(l - r) < 0.25) return m.ai.lane >= 0 ? 1 : -1;
  return l > r ? -1 : 1;
}

function race_(race: RaceState, track: Track, m: MechState, out: MechInput): void {
  const ai = m.ai;
  const c = classOf(m);
  const tick = race.tick;
  const cap = speedCap(race, m, c);

  // --- where to put the mech across the road
  const look = 14 + m.speed * 0.35;
  let dWant = lineAt(track, m.s + look) * 0.85 + ai.lane;
  let throttle = 1;
  let wantBoost = tick < ai.boostUntil;

  const rules = race.rules;
  const lap3 = race.lapPhase >= 3;
  // Lining up a gate: hold the line and follow others through in single file.
  let threading = false;
  // A ramming defender steers at this mech instead of around it.
  let ramAt: MechState | null = null;

  const chase0 = ai.intentTarget >= 0 ? race.mechs[ai.intentTarget] : null;
  // Someone on the other route of a fork cannot be chased down.
  const chase = chase0 && !splitApart(track, m.s, m.d, chase0.s, chase0.d) ? chase0 : null;
  const hot = tick < ai.hotUntil;
  // Running someone down from far off (a Sprint's leader): race the line,
  // gates and strips as usual, and boost to close the gap.
  const far = !!chase && inPlay(chase) && !hot && Math.abs(deltaS(track, chase.s, m.s)) >= 160;
  if (far) wantBoost = wantBoost || m.drive > 30;
  if (chase && inPlay(chase) && !far) {
    const ds = deltaS(track, chase.s, m.s);
    if (hot) {
      // Run up on the infield side, so the blow throws them at their barrier.
      const inside = chase.d - (chase.d >= 0 ? 1 : -1) * 5;
      dWant = Math.abs(ds) < 160 ? inside : dWant;
      if (ds > 3) wantBoost = wantBoost || m.drive > 8;
    } else {
      if (Math.abs(ds) < 160) dWant = lerp(dWant, chase.d, 0.6);
      if (ds > 20) wantBoost = wantBoost || m.drive > 30;
      else if (ds < -12) throttle = 0.92; // ease off a touch and let them come
    }
  } else if (!m.finished) {
    const ws = wrapS(track, m.s);
    let found = false;
    // A Cell gate this pilot means to take. Only one that can bank a whole
    // Cell can take one at all. The formation lap is for filling up; after
    // it a detour is worth it to a pilot running short, or to the team: the
    // gate pays each teammate its share, so a support goes for the gates a
    // forward cannot reach.
    const gateWorth = m.lap <= 0 ? rules.gateValue : rules.gateValueLater;
    const canTake = rules.cellMax > 0 && m.cells <= rules.cellMax - Math.min(gateWorth, rules.cellMax);
    let teamNeed = 0;
    if (rules.gateShare > 0) {
      for (const t of race.mechs) {
        if (t !== m && t.team === m.team && inPlay(t)) teamNeed += Math.min(gateWorth * rules.gateShare, rules.cellMax - t.cells);
      }
    }
    const worthIt = m.lap <= 0 || m.cells < Math.min(2, rules.cellMax) || teamNeed >= 0.5;
    if (m.lap < rules.gateLaps && gateWorth > 0 && canTake && worthIt) {
      let nearest = 320;
      for (let g = 0; g < track.gates.length; g++) {
        const bit = 1 << g;
        if ((ai.gates & bit) === 0 || (m.gateMask & bit) !== 0) continue;
        let ahead = track.gates[g].s - ws;
        if (ahead < -4) ahead += track.length;
        // Someone has just taken it: only worth lining up if it will be lit again by the time we get there.
        if (race.gateDark[g] > tick + (Math.max(0, ahead) / Math.max(m.speed, 50)) * 60) continue;
        if (ahead < nearest) {
          nearest = ahead;
          dWant = track.gates[g].d;
          threading = ahead < 150;
          found = true;
        }
      }
    }
    // Otherwise top up on a charge strip if one is coming.
    if (!found && m.drive < 85) {
      for (const st of track.strips) {
        let ahead = st.s0 - ws;
        if (ahead < -(st.s1 - st.s0)) ahead += track.length;
        if (ahead < 190 && ahead > -(st.s1 - st.s0) + 10) {
          dWant = st.d;
          found = true;
          break;
        }
      }
    }
    // On the speed lap, tuck in behind whoever is ahead and take the tow.
    if (!found && lap3) {
      let nearest = rules.towRange3 + 40;
      for (const o of race.mechs) {
        if (o === m || !inPlay(o)) continue;
        const ahead = deltaS(track, o.s, m.s);
        if (ahead < 30 || ahead > nearest || Math.abs(o.d - m.d) > 26) continue;
        nearest = ahead;
        dWant = o.d;
      }
    }
  }
  if (m.ramT > 0) {
    // Mid-ram: aim the charge at the nearest rival it has not hit yet.
    let nearest = 70;
    for (const e of race.mechs) {
      if (e.team === m.team || !inPlay(e) || (m.ramHits & (1 << e.id)) !== 0) continue;
      const ahead = deltaS(track, e.s, m.s);
      if (ahead < -8 || ahead > nearest) continue;
      nearest = ahead;
      ramAt = e;
    }
    if (ramAt) {
      dWant = ramAt.d;
      wantBoost = wantBoost || m.drive > 10;
    }
  }

  // --- do not drive into the back of someone
  for (const o of race.mechs) {
    if (o === m || o.retired) continue;
    const ahead = deltaS(track, o.s, m.s);
    // On the speed lap, stay in the tow until the last moment so the
    // slingshot is spent on the pass and not on the run up to it.
    const pullOut = lap3 ? clamp(8 + (m.speed - o.speed) * 0.9, 12, 34) : 34;
    if (ahead < 3 || ahead > pullOut) continue;
    const dd = o.d - m.d;
    if (Math.abs(dd) > 7.5) continue;
    if (o.speed > m.speed + 4) continue;
    if (chase === o || ramAt === o) continue;
    if (threading && ahead > 7) continue;
    const side = dd === 0 ? (o.id < m.id ? 1 : -1) : dd > 0 ? -1 : 1;
    dWant = o.d + side * 9.5;
    break;
  }
  // ... or lean on someone running alongside.
  for (const o of race.mechs) {
    if (o === m || o.retired || chase === o || ramAt === o) continue;
    if (Math.abs(deltaS(track, o.s, m.s)) > 7) continue;
    const dd = o.d - m.d;
    const room = c.radius + classOf(o).radius + 2.5;
    if (Math.abs(dd) < room) dWant += (dd > 0 ? -1 : 1) * (room - Math.abs(dd)) * 1.5;
  }
  // Pick a route at a fork, and keep inside the road: the narrowest of it
  // between here and the look-ahead point, wider of an edge with no barrier.
  const route = routeSide(race, track, m, look);
  if (route !== 0 && Math.sign(dWant) !== route) dWant = route * 14;
  const side = route !== 0 ? route : m.d >= 0 ? 1 : -1;
  let lo = -Infinity;
  let hi = Infinity;
  for (const ahead of [0, look * 0.5, look]) {
    const [l, h] = laneAt(track, m.s + ahead, side, c.radius + 2.5);
    lo = Math.max(lo, l + (wallAt(track, m.s + ahead, -1) || l > 0 ? 0 : 5));
    hi = Math.min(hi, h - (wallAt(track, m.s + ahead, 1) || h < 0 ? 0 : 5));
  }
  dWant = lo <= hi ? clamp(dWant, lo, hi) : (lo + hi) / 2;

  // --- steer: feed forward the bend, correct toward the line. A carve grips
  // harder, so the same turn needs less stick.
  const kappa = kappaAt(track, m.s + m.speed * 0.12);
  const carveGrip = m.carving ? rules.carveGrip : 1;
  const omegaMax = Math.min(c.turnMax * (m.carving ? CARVE_TURN : 1), (c.grip * carveGrip) / Math.max(m.speed, 24)) * Math.min(1, m.speed / 12) || 1;
  const headingWant = clamp(Math.atan2(dWant - m.d, look), -0.5, 0.5);
  const sdot = m.speed * Math.cos(m.heading);
  const rate = kappa * sdot + (headingWant - m.heading) * 3.2;
  out.mx = clamp(rate / omegaMax, -1, 1);

  // --- slow for corners that are too tight for this speed
  let kMax = 0;
  const reach = 24 + m.speed * 0.75;
  // A turn banked toward its inside can be taken faster: its grip goes into the sum.
  for (let a = 0; a <= reach; a += 12) kMax = Math.max(kMax, Math.abs(kappaAt(track, m.s + a)) / gripAt(track, m.s + a));
  const vCorner = kMax > 1e-5 ? Math.sqrt((c.grip * 0.95) / kMax) * 1.04 : 999;
  // Carving through it, a turn can be taken this much faster.
  const vCarve = vCorner * Math.sqrt(rules.carveGrip);

  // --- carve: through any proper bend, for the burst on the way out. The
  // trigger with the stick over is a carve; on the way in, stick still
  // straight, it is the brake.
  const bend = kappaAt(track, m.s + m.speed * 0.08);
  const bendDir = Math.abs(bend) > 1 / 650 ? Math.sign(bend) : 0;
  if (bendDir !== ai.carveFor) {
    // A new bend: does this pilot carve it? The better the pilot, the likelier.
    ai.carveFor = bendDir;
    ai.carveGo = bendDir !== 0 && rngNext(race) < 0.35 + 0.6 * m.skill;
  }
  // Is the bend running out (or turning the other way) a moment ahead?
  const exitAhead = kappaAt(track, m.s + m.speed * 0.3);
  const endsFor = (dir: number) => Math.abs(exitAhead) < 1 / 900 || Math.sign(exitAhead) !== dir;
  const needGrip = m.speed > vCorner - 2 && bendDir !== 0;
  let carve = false;
  if (!hot && !m.finished && m.speed > CARVE_MIN_SPEED + 5 && !threading) {
    // A carve cannot turn less than CARVE_STEER_WIDE: once the line wants
    // less than that (or the bend runs out) it is time to let go. Nor is one
    // started on the way out of a bend, only to be let go the next moment.
    if (m.carving) carve = !endsFor(m.carveDir) && out.mx * m.carveDir > CARVE_STEER_WIDE - 0.1;
    else carve = bendDir !== 0 && !endsFor(bendDir) && (ai.carveGo || needGrip) && out.mx * bendDir > CARVE_STEER_WIDE + 0.05;
  }
  if (carve) {
    out.brake = 1;
    // Lean into it hard enough to start the carve; after that, the stick
    // that makes the carve turn the way the line wants.
    if (!m.carving) out.mx = bendDir * Math.max(Math.abs(out.mx), CARVE_MIN_STEER + 0.05);
    else out.mx = carveStick(m.carveDir, out.mx);
    if (m.speed > vCarve + 3) throttle = 0;
    else if (m.speed > vCarve - 3) throttle = Math.min(throttle, 0.7);
    wantBoost = false;
  } else if (m.carving) {
    // Letting go: the trigger comes all the way up, or a touch of brake
    // would hold the carve on.
    out.brake = 0;
  } else if (m.speed > vCorner + 3) {
    out.brake = clamp((m.speed - vCorner) / 14, 0.2, 1);
    // Braking is done with the stick near the middle: further over and the trigger would carve.
    if (Math.abs(out.mx) >= CARVE_MIN_STEER) out.brake = 0;
    throttle = 0;
    wantBoost = false;
  } else if (m.speed > vCorner - 3) {
    throttle = Math.min(throttle, 0.6);
    wantBoost = false;
  }

  // --- boost on the speed lap when the road is straight enough
  if (race.lapPhase >= 3 && !m.finished && kMax < 0.0022 && m.drive > 12) wantBoost = true;
  // At the brim, what the trickle brings in is spent rather than wasted: one
  // short burn (about the minimum) each time it fills, not a tap per tick.
  if (m.drive > 97 && kMax < 0.0015 && race.lapPhase >= 2) ai.boostFloor = Math.max(ai.boostFloor, 90);
  // The formation lap is a racing lap: spend down to a reserve for the fights
  // to come, on the straights (and never through a carve), a real burn at a time.
  if (race.lapPhase <= 1 && !m.carving && m.drive > 55 && kMax < 0.0015) ai.boostFloor = Math.max(ai.boostFloor, 45);
  // A burn for the gauge runs down to its floor while the road stays straight.
  if (ai.boostFloor >= 0) {
    if (m.drive > ai.boostFloor && kMax < 0.0015 && !m.carving && !m.finished) wantBoost = true;
    else ai.boostFloor = -1;
  }
  if (wantBoost && m.drive > 3 && throttle >= 1) out.buttons |= BTN.A;
  out.throttle = throttle;

  // --- the free-steering ability
  if (weaponsFree(race) && m.cells >= 1 && m.cdAbility === 0 && m.act !== ACT.STAGGER && tick >= ai.abilityAt) {
    ai.abilityAt = tick + 12;
    if (wantFreeAbility(race, track, m, throttle >= 1) && rngNext(race) < 0.3 + 0.6 * m.skill) press(out, m, BTN.ABILITY);
  }

  // --- guns work at racing speed: take the shot if someone is in the sights
  if (weaponsFree(race) && m.act === ACT.NONE && tick >= ai.attackAt && (m.role === ROLE.MF || m.role === ROLE.DF)) {
    const slot = m.role === ROLE.MF ? 0 : 1;
    const idx = slot === 0 ? c.primary : c.secondary;
    const a = ATTACKS[idx];
    if ((slot === 0 ? m.cdPrimary : m.cdSecondary) === 0 && a.shot) {
      for (const e of race.mechs) {
        if (e.team === m.team || !inPlay(e)) continue;
        const ds = deltaS(track, e.s, m.s);
        const dd = e.d - m.d;
        const dist = Math.hypot(ds, dd);
        if (dist > a.shot.range - 4) continue;
        if (Math.abs(wrapAngle(Math.atan2(dd, ds) - m.facing)) > a.arc * 0.8) continue;
        press(out, m, slot === 0 ? BTN.X : BTN.Y);
        ai.attackAt = tick + Math.round(lerp(110, 55, m.skill) + rngNext(race) * 40);
        break;
      }
    }
  }
}

/**
 * Aegis: over yourself when you are hurt and being hit, or over the team's
 * forward when they are (on the speed lap, whenever they are being hit).
 */
function wantAegis(race: RaceState, track: Track, m: MechState): boolean {
  if (m.shieldT > 0) return false;
  const lap3 = race.lapPhase >= 3;
  const hot = (o: MechState) => race.tick - o.lastHitTick < 50;
  if (hpFraction(m) < (lap3 ? 0.4 : 0.3) && hot(m)) return true;
  for (const f of race.mechs) {
    if (f.team !== m.team || f === m || !inPlay(f) || f.shieldT > 0 || f.role !== ROLE.FW) continue;
    if (distance(track, f, m) > race.rules.aegisRange * 0.9 || !hot(f)) continue;
    const fhp = hpFraction(f);
    if (lap3 || fhp < 0.35 || (fhp < 0.55 && m.cells >= 2)) return true;
  }
  return false;
}

/**
 * Ram, locked on: charge the target when it is close enough to reach, not
 * shielded or dodging, and worth a Cell (the rival forward always; on the
 * speed lap anyone near the front; otherwise someone already hurt).
 */
function wantRam(race: RaceState, track: Track, m: MechState): boolean {
  if (m.ramT > 0 || m.target < 0) return false;
  const t = race.mechs[m.target];
  if (!inPlay(t) || t.shieldT > 0 || t.iframes > 0 || t.ramT > 0) return false;
  if (distance(track, t, m) > 40) return false;
  const lap3 = race.lapPhase >= 3;
  if (t.role === ROLE.FW) return lap3 || m.cells >= 2;
  return lap3 ? t.place <= 3 : m.cells >= 2 && hpFraction(t) < 0.5;
}

/** Should this pilot spend a Cell on its free-steering ability right now? */
function wantFreeAbility(race: RaceState, track: Track, m: MechState, flatOut: boolean): boolean {
  const c = classOf(m);
  const rules = race.rules;
  const lap3 = race.lapPhase >= 3;
  switch (c.abilityFree) {
    case ABILITY.OVERDRIVE: {
      // The speed lap is what Overdrive is for. Use it on a straight, to run
      // someone down, to hold them off, or to shake a Snare.
      if (!lap3 || m.overdriveT > 0 || !flatOut || kappaAheadAt(track, m.s) > 0.0019) return false;
      if (m.snareT > 30) return true;
      const toGo = race.laps * track.length - m.s;
      let chasing = false;
      let hunted = false;
      for (const e of race.mechs) {
        if (e.team === m.team || !inPlay(e)) continue;
        const ahead = deltaS(track, e.s, m.s);
        if (ahead > 10 && ahead < 380) chasing = true;
        if (ahead < 0 && ahead > -70) hunted = true;
      }
      return chasing || (hunted && (m.cells >= 2 || toGo < 1500));
    }
    case ABILITY.PULSE: {
      // Racing in a crowd: knock the rivals round it out of their swings and
      // drain their Drive. Worth a Cell with two in reach, or one about to hit.
      let near = 0;
      let pressing = false;
      for (const e of race.mechs) {
        if (e.team === m.team || !inPlay(e) || e.iframes > 0 || !sameRoute(track, m, e)) continue;
        const dist = distance(track, e, m);
        if (dist > rules.pulseRange * 0.9) continue;
        near++;
        if (e.target === m.id && e.act === ACT.ATTACK && ATTACKS[e.attack].kind === 'melee' && e.actT < ATTACKS[e.attack].windup && dist < 16) pressing = true;
      }
      if (lap3) return near >= 2 || pressing;
      return m.cells >= 2 && (near >= 2 || pressing);
    }
    case ABILITY.RAM:
      return wantRam(race, track, m);
    case ABILITY.AEGIS:
      return wantAegis(race, track, m);
    default:
      void rules;
      return false;
  }
}

/** Should this pilot spend a Cell on the ability its button gives in a lock (or, for a forward, break away)? */
function wantLockedAbility(race: RaceState, track: Track, m: MechState): boolean {
  const rules = race.rules;
  const lap3 = race.lapPhase >= 3;
  const hp = hpFraction(m);
  // What the button gives here (escorting a team-mate, a defender's is the Aegis).
  switch (abilityFor(m, race)) {
    case ABILITY.BREAKAWAY: {
      const staggered = m.act === ACT.STAGGER;
      let hunters = 0;
      for (const e of race.mechs) {
        if (e.team !== m.team && inPlay(e) && e.target === m.id && distance(track, e, m) < 34) hunters++;
      }
      // On the speed lap any hit is the race. Before that a Cell is worth
      // more as an Overdrive later, so only a spare one, or real danger, goes.
      if (lap3) return staggered;
      if (staggered && hp < 0.35) return true;
      return m.cells >= 2 && ((staggered && m.chain >= 2 && hp < 0.6) || (hunters >= 2 && hp < 0.5));
    }
    case ABILITY.PULSE: {
      // (A midfielder escorting a team-mate: its button is the Disruptor.)
      let near = 0;
      let swinging = false;
      let pressing = false;
      for (const e of race.mechs) {
        if (e.team === m.team || !inPlay(e)) continue;
        const dist = distance(track, e, m);
        if (dist > rules.pulseRange * 0.9) continue;
        near++;
        if (e.act === ACT.ATTACK && ATTACKS[e.attack].kind === 'melee' && e.actT < ATTACKS[e.attack].windup) {
          swinging = true;
          if (dist < 16) pressing = true;
        }
      }
      if (pressing && hp < 0.35) return true;
      if (lap3) return near >= 2 || pressing;
      return m.cells >= 2 && near >= 2 && swinging;
    }
    case ABILITY.SNARE: {
      // The bolt at the lock's target: drag back a rival who would otherwise
      // get away. On the speed lap the forward, or anyone in the top two; on
      // the battle lap a marked target, or the rival forward, with a Cell to spare.
      const t = race.mechs[m.target];
      if (!t || t.team === m.team || !inPlay(t) || t.snareT > 0 || t.shieldT > 0 || t.iframes > 0) return false;
      const a = ATTACKS[ATK.MF_SNARE];
      if (distance(track, t, m) > a.shot!.range - 12) return false;
      const ts = race.teams[m.team];
      if (lap3) return t.role === ROLE.FW || t.place <= 2;
      return m.cells >= 2 && ((ts.tactic === TACTIC.MARK && ts.mark === t.id) || t.role === ROLE.FW);
    }
    case ABILITY.AEGIS:
      return wantAegis(race, track, m);
    case ABILITY.RAM:
      return wantRam(race, track, m);
    default:
      return false;
  }
}

function fight(race: RaceState, track: Track, m: MechState, out: MechInput): void {
  const ai = m.ai;
  const c = classOf(m);
  const tick = race.tick;
  const t = race.mechs[m.target];
  const ds = deltaS(track, t.s, m.s);
  const dd = t.d - m.d;
  const dist = Math.hypot(ds, dd) || 1e-3;
  const us = ds / dist;
  const ud = dd / dist;
  const radii = c.radius + classOf(t).radius;
  // On the trigger, unless the one it wants is behind and too far: then off
  // it, so they come back to it (see lockPace).
  out.throttle = 1;

  if (t.team === m.team) {
    // Escort: sit just off the ally's shoulder, on the side away from the wall.
    const pref = radii + 9;
    out.my = clamp((dist - pref) / 6, -1, 1);
    out.mx = 0;
    lockPace(m, ds, dist - pref, out, false);
    return;
  }

  // --- spacing
  // Melee pilots hang back between bursts, then step in to strike.
  let pref = c.aiRange > 0 ? c.aiRange : radii + 4.2;
  if (c.aiRange === 0 && m.act === ACT.NONE && tick < ai.attackAt - 24) pref = radii + (m.role === ROLE.FW ? 15 : 9);
  // A midfielder gunning at range now and then closes in to kick: on a rival
  // its carbine has staggered, or between bursts, the better pilot more often.
  if (m.role === ROLE.MF && m.cdSecondary === 0 && tick >= ai.closeUntil + 60 && weaponsFree(race)) {
    const stunned = t.act === ACT.STAGGER;
    if ((stunned && dist < 40) || (m.act === ACT.NONE && rngNext(race) < (0.004 + 0.01 * m.skill))) ai.closeUntil = tick + 100;
  }
  if (m.role === ROLE.MF && tick < ai.closeUntil && m.cdSecondary === 0) pref = radii + 3;
  if (m.role === ROLE.MF && dist < 13 && m.cdSecondary > 0) pref = 34;
  out.my = clamp((dist - pref) / 5, -1, 1);
  if (tick > ai.orbitUntil) {
    ai.orbit = rngNext(race) < 0.5 ? -1 : 1;
    ai.orbitUntil = tick + 40 + Math.floor(rngNext(race) * 80);
  }
  // Do not circle into the barrier.
  const lateral = us * ai.orbit;
  // ...and keep well clear of an edge with no barrier: a blow there is a fall.
  const edge = hwAt(track, m.s) - (wallAt(track, m.s, m.d) ? 9 : 16);
  if (Math.abs(m.d) > edge && lateral * m.d > 0) {
    ai.orbit = -ai.orbit;
    ai.orbitUntil = tick + 50;
  }
  out.mx = ai.orbit * (m.role === ROLE.MF ? 0.7 : 0.4);
  lockPace(m, ds, dist - pref, out, weaponsFree(race));

  // --- attack
  if (m.act === ACT.NONE && tick >= ai.attackAt && weaponsFree(race)) {
    const primary = ATTACKS[c.primary];
    const secondary = ATTACKS[c.secondary];
    const r = rngNext(race);
    let used = false;
    if (m.role === ROLE.FW) {
      if (dist <= primary.reach + radii + 1.5) {
        press(out, m, BTN.X);
        ai.comboLeft = r < 0.5 + 0.4 * m.skill ? 2 : r < 0.8 ? 1 : 0;
        used = true;
      } else if (dist > 12 && dist < 36 && m.cdSecondary === 0 && m.drive >= secondary.driveCost && r < 0.3) {
        press(out, m, BTN.Y);
        holdHeavy(race, ai, m, t, secondary, out);
        used = true;
      }
    } else if (m.role === ROLE.MF) {
      if (dist <= secondary.reach + radii + 1 && m.cdSecondary === 0) {
        press(out, m, BTN.Y);
        holdHeavy(race, ai, m, t, secondary, out);
        ai.closeUntil = 0;
        used = true;
      } else if (dist <= primary.shot!.range - 6 && m.cdPrimary === 0) {
        press(out, m, BTN.X);
        used = true;
      }
    } else {
      if (dist <= 22 && m.cdSecondary === 0 && r < 0.55) {
        press(out, m, BTN.Y);
        holdHeavy(race, ai, m, t, secondary, out);
        used = true;
      } else if (dist <= primary.reach + radii + 1.5) {
        press(out, m, BTN.X);
        ai.comboLeft = r < 0.45 + 0.4 * m.skill ? 1 : 0;
        used = true;
      }
    }
    // Attack in bursts with a breather between, so there is a rhythm to read.
    if (used) ai.attackAt = tick + Math.round(lerp(105, 45, m.skill) + rngNext(race) * 40);
  } else if (m.act === ACT.ATTACK && m.chargeOn && tick < ai.holdUntil) {
    // Charging a heavy: keep it held.
    out.buttons |= BTN.Y;
  } else if (m.act === ACT.ATTACK && ai.comboLeft > 0) {
    const a = ATTACKS[m.attack];
    if (a.next >= 0 && m.actT >= a.windup && !m.comboQueued && (m.attackHit || m.actT >= a.windup + a.active)) {
      if (m.attackHit) {
        press(out, m, BTN.X);
        if (out.buttons & BTN.X) ai.comboLeft--;
      } else {
        ai.comboLeft = 0; // whiffed: do not swing at air
      }
    }
  }

  // --- defend against a blow that is winding up
  for (const e of race.mechs) {
    if (e.team === m.team || !inPlay(e) || e.act !== ACT.ATTACK) continue;
    const a = ATTACKS[e.attack];
    if (a.kind !== 'melee' || e.actT >= a.windup) continue;
    const ed = distance(track, e, m);
    const lunging = a.advance >= 60;
    if (ed > a.reach + radii + (lunging ? 30 : 5)) continue;
    if (e.target !== m.id && ed > a.reach + radii) continue;
    const key = e.id * 100000 + (e.attackStart % 100000);
    if (key === ai.reactedTo) continue;
    ai.reactedTo = key;
    const r = rngNext(race);
    const pDodge = a.heavy ? 0.1 + 0.25 * m.skill : 0.04;
    // A pilot in trouble turtles up.
    const pGuard = 0.3 + 0.5 * m.skill + (hpFraction(m) < 0.4 ? 0.2 : 0);
    const reaction = Math.round(lerp(13, 5, m.skill) + rngNext(race) * 4);
    const toHit = a.windup - e.actT;
    // Swinging round the attacker, rather than hopping away, puts the dodger
    // at its side: the better pilots do it more, against the blow they are
    // locked on to.
    const arc = race.rules.arcAngle > 0 && m.target === e.id && rngNext(race) < 0.15 + 0.45 * m.skill;
    if (r < pDodge && m.drive >= c.dashCost) {
      ai.dodgeAt = tick + Math.max(0, Math.min(reaction, toHit - 3));
      ai.dodgeArc = arc;
    } else if (r < pDodge + pGuard && !a.guardBreak) {
      ai.guardFrom = tick + reaction;
      ai.guardUntil = tick + toHit + a.active + 6;
    } else if (r < pDodge + pGuard && m.drive >= c.dashCost) {
      // Cannot block a guard breaker: get out of the way instead.
      ai.dodgeAt = tick + Math.max(0, Math.min(reaction, toHit - 3));
      ai.dodgeArc = arc;
    }
  }
  // Under fire from the front with nothing better to do: raise the guard.
  if (m.act === ACT.NONE && tick >= ai.guardUntil && tick >= ai.attackAt - 40) {
    for (const p of race.projectiles) {
      if (p.team === m.team) continue;
      const pds = deltaS(track, m.s, p.s);
      const pdd = m.d - p.d;
      const pd = Math.hypot(pds, pdd);
      if (pd > 26) continue;
      // Heading our way?
      if ((p.vs - m.vs) * pds + (p.vd - m.vd) * pdd <= 0) continue;
      if (rngNext(race) < 0.25 + 0.5 * m.skill) {
        ai.guardFrom = tick;
        ai.guardUntil = tick + 26;
      }
      break;
    }
  }
  if (tick >= ai.guardFrom && tick < ai.guardUntil && m.act === ACT.NONE && (out.buttons & (BTN.X | BTN.Y)) === 0) {
    out.buttons |= BTN.GUARD;
  }
  if (tick === ai.dodgeAt && m.act === ACT.NONE) {
    out.mx = ai.orbit;
    out.my = -0.4;
    // A guard swing needs the guard up as A goes in, and the stick square to the side.
    if (ai.dodgeArc && m.guard > 0) {
      out.buttons |= BTN.GUARD;
      out.my = 0;
    }
    press(out, m, BTN.A);
  }
}

/**
 * Closing on whoever a lock is on, the way a person does: a rival well behind
 * is let come back (off the trigger, by as much as the gap), one well ahead is
 * run down on a boost (A held, stick at it), while there is Drive to spare.
 * `gap` is how much further away than it wants to be.
 */
function lockPace(m: MechState, ds: number, gap: number, out: MechInput, boost: boolean): void {
  if (ds < -4 && gap > 10) out.throttle = clamp(1 - (gap - 10) / 30, 0.4, 1);
  if (boost && ds > 4 && gap > 22 && m.drive > 40 && m.act === ACT.NONE && out.my > 0.5) {
    out.mx *= 0.3;
    out.buttons |= BTN.A;
  }
}

/**
 * A momentum strike, the computer's way: a melee pilot with its target ahead
 * sometimes holds off the lock, runs up on a boost or a tow, and swings the
 * moment it arrives, so the strike lands charged. Returns true while it is
 * holding off (stay free); on arrival it takes the lock and presses attack.
 */
function flyInHot(race: RaceState, track: Track, m: MechState, want: number, out: MechInput): boolean {
  const ai = m.ai;
  const tick = race.tick;
  const c = classOf(m);
  const t = race.mechs[want];
  if (t.team === m.team || c.aiRange > 0 || !weaponsFree(race) || m.target >= 0) {
    ai.hotUntil = 0;
    return false;
  }
  const ahead = deltaS(track, t.s, m.s);
  const dist = distance(track, m, t);
  if (tick >= ai.hotUntil) {
    // Only from behind and with something to run up on.
    if (tick < ai.hotNext || ahead < 12 || dist > 150 || (m.drive < 25 && m.tow < 0.5 && m.overdriveT <= 0)) return false;
    ai.hotNext = tick + 240;
    if (rngNext(race) >= lerp(0.25, 0.7, m.skill)) return false;
    ai.hotUntil = tick + 240;
  }
  if (ahead < -2 || dist > 170) {
    ai.hotUntil = 0;
    return false;
  }
  const reach = ATTACKS[c.primary].reach + c.radius + classOf(t).radius + 1.5;
  if (dist > reach) return true;
  // Arrived: lock and swing in the same tick.
  ai.hotUntil = 0;
  setTarget(race, m, want);
  press(out, m, BTN.X);
  return false;
}

export function aiControl(race: RaceState, track: Track, m: MechState, out: MechInput): MechInput {
  out.mx = 0;
  out.my = 0;
  out.throttle = 0;
  out.brake = 0;
  out.buttons = 0;
  out.cmd = 0;
  if (m.retired || m.fallT > 0 || race.phase === PHASE.COUNTDOWN) return out;
  const ai = m.ai;
  if (race.tick >= ai.nextThink) think(race, track, m);

  if (inPlay(m) && m.act !== ACT.STAGGER) {
    // Turn the intent into a lock (or let go of one).
    let want = -1;
    if (ai.intent !== INTENT.RACE && ai.intentTarget >= 0) {
      const t = race.mechs[ai.intentTarget];
      // Having just broken away, stay away: no enemy lock until the cloak has run out.
      if (lockable(t, m) && sameRoute(track, m, t) && !(m.cloakT > 0 && t.team !== m.team)) {
        const dist = distance(track, m, t);
        if (dist < LOCK_RANGE - 6 || (m.target === t.id && dist < LOCK_RANGE + 20)) want = t.id;
      }
    }
    if (want >= 0 && want !== m.target && flyInHot(race, track, m, want, out)) want = m.target;
    if (want !== m.target) setTarget(race, m, want);
  }

  if (m.mode === MODE.BATTLE && m.target >= 0) fight(race, track, m, out);
  else race_(race, track, m, out);

  // The locked-on ability. A forward's Break Away also works from a stagger at racing speed.
  const breaker = classOf(m).abilityLocked === ABILITY.BREAKAWAY;
  const inFight = m.mode === MODE.BATTLE && m.target >= 0;
  if (
    inPlay(m) && weaponsFree(race) && m.cells >= 1 && m.cdAbility === 0 && race.tick >= ai.abilityAt &&
    (m.act === ACT.STAGGER ? breaker : inFight)
  ) {
    ai.abilityAt = race.tick + 10;
    if (wantLockedAbility(race, track, m) && rngNext(race) < 0.25 + 0.6 * m.skill) {
      press(out, m, BTN.ABILITY);
      if (breaker && (out.buttons & BTN.ABILITY) !== 0) {
        // Breaking away means leaving: race on, boost clear, and do not come straight back.
        ai.intent = INTENT.RACE;
        ai.intentTarget = -1;
        ai.boostUntil = race.tick + 120;
        ai.restUntil = Math.max(ai.restUntil, race.tick + 300);
      }
    }
  }
  return out;
}

/**
 * Picks tactics for a team with nobody human on it, or for one whose room
 * has handed the calls to the computer captain (see TeamState.caller).
 */
export function aiCaptain(race: RaceState, track: Track, team: number): void {
  const ts = race.teams[team];
  if (ts.caller !== CALLER.CAPTAIN) {
    if (ts.caller !== CALLER.ANY) return;
    for (const m of race.mechs) if (m.team === team && m.human) return;
  }
  if (race.lapPhase !== ts.captainPhase) {
    ts.captainPhase = race.lapPhase;
    ts.captainAt = 0;
  }
  if (race.lapPhase === 2 && ts.tactic !== TACTIC.SHIELD && race.tick >= ts.captainAt - 1200 && race.tick % 90 === team * 45) {
    // Forward in trouble? Call the shield without waiting for the next review.
    for (const f of race.mechs) {
      if (f.team !== team || f.role !== ROLE.FW || !inPlay(f)) continue;
      let hunters = 0;
      for (const e of race.mechs) if (e.team !== team && inPlay(e) && e.target === f.id) hunters++;
      if (hunters >= 2 || (hunters >= 1 && hpFraction(f) < 0.45)) {
        setTactic(race, team, TACTIC.SHIELD, -1, -1);
        ts.captainAt = race.tick + 1500;
        return;
      }
    }
  }
  if (race.tick < ts.captainAt) return;
  ts.captainAt = race.tick + 2100 + Math.floor(rngNext(race) * 900);

  let tactic: Tactic = TACTIC.FREE;
  let mark = -1;
  if (race.lapPhase === 2) {
    let ownFw: MechState | null = null;
    let enemyFw: MechState | null = null;
    for (const m of race.mechs) {
      if (m.role !== ROLE.FW || !inPlay(m)) continue;
      if (m.team === team) ownFw = m;
      else enemyFw = m;
    }
    const r = rngNext(race);
    if (ownFw && hpFraction(ownFw) < 0.4) tactic = TACTIC.SHIELD;
    else if (enemyFw && r < 0.22) {
      tactic = TACTIC.MARK;
      mark = enemyFw.id;
    } else if (r < 0.5) tactic = TACTIC.BLITZ;
    else if (r < 0.7) tactic = TACTIC.SHIELD;
  }
  if (tactic !== ts.tactic || mark !== ts.mark) setTactic(race, team, tactic, -1, mark);
  void track;
}

// Shared helpers for the simulation tests. Not a test file itself.

import {
  BTN,
  BTN_MASK,
  CLASSES,
  COUNTDOWN_TICKS,
  MERIDIAN,
  PHASE,
  ROLE,
  buildTrack,
  clamp,
  createRace,
  emptyInput,
  kappaAt,
  limiterOf,
  rngNext,
  stepRace,
} from '../src/sim/index';
import type { MechInput, MechState, RaceState, Rules, SeatConfig, SimEvent, Track } from '../src/sim/index';

/** The one circuit. A built track is read-only, so every test can share it. */
export const TRACK: Track = buildTrack(MERIDIAN);

// Seat ids on the standard grid (the layout tools/headless-race.ts uses):
// id = role * 2 + team.
export const FW0 = 0;
export const FW1 = 1;
export const MF0 = 2;
export const MF1 = 3;
export const DF0 = 4;
export const DF1 = 5;

export type Inputs = Array<MechInput | null>;

/** Standard 3v3 grid. `humans` lists the seat ids a person holds. */
export function makeSeats(humans: readonly number[] | 'all' = [], skill: number | readonly [number, number] = 0.6): SeatConfig[] {
  const names = [
    ['Kite', 'Lark', 'Atlas'],
    ['Shrike', 'Moth', 'Golem'],
  ];
  const out: SeatConfig[] = [];
  for (const role of [ROLE.FW, ROLE.MF, ROLE.DF]) {
    for (let team = 0; team < 2; team++) {
      const id = out.length;
      out.push({
        team,
        role,
        human: humans === 'all' || humans.includes(id),
        name: names[team][role],
        skill: typeof skill === 'number' ? skill : skill[team],
      });
    }
  }
  return out;
}

export interface RaceOpts {
  humans?: readonly number[] | 'all';
  skill?: number | readonly [number, number];
  laps?: number;
  /** Overrides for the default rules (race.rules). */
  rules?: Partial<Rules>;
  /** Mirror the grid, as a match does on every other round. */
  gridFlip?: boolean;
}

export function newRace(seed: number, opts: RaceOpts = {}): RaceState {
  return createRace(TRACK, {
    seed,
    seats: makeSeats(opts.humans ?? [], opts.skill ?? 0.6),
    laps: opts.laps,
    rules: opts.rules,
    gridFlip: opts.gridFlip,
  });
}

/** One input slot per seat: an idle controller for humans, null (AI) otherwise. */
export function makeInputs(race: RaceState): Inputs {
  return race.mechs.map((m) => (m.human ? emptyInput() : null));
}

/** Step to the tick the lights go out (the GO tick has run when this returns). */
export function runCountdown(race: RaceState, inputs: Inputs = []): void {
  while (race.tick < COUNTDOWN_TICKS) stepRace(race, TRACK, inputs);
}

/** 8 simulated minutes: far longer than any race should take. */
export const MAX_RACE_TICKS = 8 * 60 * 60;

/** Run to the chequered flag. Returns false if the tick budget ran out first. */
export function runToEnd(
  race: RaceState,
  inputs: Inputs = [],
  onTick?: (race: RaceState) => void,
  maxTicks: number = MAX_RACE_TICKS,
): boolean {
  while (race.phase !== PHASE.FINISHED && race.tick < maxTicks) {
    stepRace(race, TRACK, inputs);
    if (onTick) onTick(race);
  }
  return race.phase === PHASE.FINISHED;
}

// ---- state inspection ------------------------------------------------------

/** Everything that defines the race, as text. Events are per-tick output, not state. */
export function snapshot(race: RaceState): string {
  const { events: _events, ...state } = race;
  return JSON.stringify(state);
}

/** 32-bit FNV-1a, enough to compare two snapshots cheaply. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stateHash(race: RaceState): string {
  return hash(snapshot(race));
}

/**
 * Sum of every numeric field of a mech, AI state included. Any NaN or
 * +-Infinity among them makes the sum non-finite. Written out by hand
 * because it runs for every mech on every tick of every test race; the
 * "covers every numeric field" test in determinism.test.ts fails if a field
 * is ever added to the state and not to this list.
 */
function mechSum(m: MechState): number {
  const ai = m.ai;
  return (
    m.id + m.team + m.role + m.skill +
    m.s + m.d + m.vs + m.vd + m.speed + m.heading + m.facing + m.steer + m.h + m.vh + m.fallT + m.padT +
    m.mode + m.target + m.outOfRange +
    m.hp + m.guard + m.drive +
    m.act + m.actT + m.actDur + m.attack + m.attackStart + m.guardT + m.guardIdle + m.guardRest +
    m.iframes + m.chain + m.chainT + m.chainTick + m.cdPrimary + m.cdSecondary + m.cdDash +
    m.cells + m.gateMask + m.cdAbility + m.overdriveT + m.ramT + m.ramHits + m.shieldT + m.snareT + m.cloakT +
    m.tow + m.momentum + m.wall +
    m.lap + m.finishTime + m.retireTick + m.place + m.points +
    m.prevButtons + m.prevCmd + m.prevThrottle + m.throttleTick + m.throttleRest +
    m.lastHitBy + m.lastHitTick + m.deniedTick + m.dmgDealt + m.dmgTaken + m.kos +
    ai.intent + ai.intentTarget + ai.nextThink + ai.lane + ai.orbit + ai.orbitUntil +
    ai.attackAt + ai.guardFrom + ai.guardUntil + ai.dodgeAt + ai.reactedTo + ai.comboLeft +
    ai.boostUntil + ai.boutUntil + ai.restUntil + ai.gates + ai.abilityAt + ai.hotUntil + ai.hotNext
  );
}

/**
 * Name of the first state field holding NaN or +-Infinity, or null when the
 * whole race state is finite. Looks at every numeric field of every mech
 * (AI state included), every projectile, every team, the rules and the race
 * itself.
 */
export function findNonFinite(race: RaceState): string | null {
  if (!Number.isFinite(race.tick + race.phase + race.rng + race.laps + race.leaderS + race.lapPhase + race.firstFinishTick + race.endTick + race.nextProjId)) {
    return `race header (tick ${race.tick})`;
  }
  // The rules are part of the state (and the tuning panel writes to them
  // live), so a bad number there is as bad as one in a mech. Looped rather
  // than written out: a rule added later is covered without touching this.
  const rules = race.rules as unknown as Record<string, number>;
  let ruleSum = 0;
  for (const k in rules) ruleSum += rules[k];
  if (!Number.isFinite(ruleSum)) {
    for (const k in rules) if (!Number.isFinite(rules[k])) return `rules.${k} = ${rules[k]} (tick ${race.tick})`;
    return `rules (tick ${race.tick})`;
  }
  for (const m of race.mechs) {
    if (Number.isFinite(mechSum(m))) continue;
    // Something is off: look again, slowly, to name the field.
    const rec = m as unknown as Record<string, unknown>;
    for (const k of Object.keys(rec)) if (typeof rec[k] === 'number' && !Number.isFinite(rec[k])) return `mech ${m.id}.${k} = ${rec[k]} (tick ${race.tick})`;
    const ai = m.ai as unknown as Record<string, unknown>;
    for (const k of Object.keys(ai)) if (typeof ai[k] === 'number' && !Number.isFinite(ai[k])) return `mech ${m.id}.ai.${k} = ${ai[k]} (tick ${race.tick})`;
    return `mech ${m.id} (tick ${race.tick})`;
  }
  for (const p of race.projectiles) {
    if (!Number.isFinite(p.id + p.owner + p.team + p.attack + p.s + p.d + p.h + p.vs + p.vd + p.life)) return `projectile ${p.id} (tick ${race.tick})`;
  }
  for (const t of race.teams) {
    if (!Number.isFinite(t.tactic + t.mark + t.captainAt + t.captainPhase)) return `team state (tick ${race.tick})`;
  }
  return null;
}

/** The furthest a mech's centre may sit from the centreline. */
export function wallLimit(m: MechState): number {
  return TRACK.halfWidth - CLASSES[m.role].radius;
}

/** How far a mech is beyond its wall, in units (0 when inside). */
export function wallOvershoot(m: MechState): number {
  return Math.max(0, Math.abs(m.d) - wallLimit(m));
}

export function dist(a: MechState, b: MechState): number {
  // Test scenarios never straddle half a lap, so plain subtraction is fine.
  return Math.hypot(a.s - b.s, a.d - b.d);
}

// ---- scripted "human" pilots -----------------------------------------------

/** A small seeded random source for input scripts (not the race's own rng). */
export function makeRandom(seed: number): () => number {
  const holder = { rng: seed | 0 };
  return () => rngNext(holder);
}

/**
 * A plain line-following pilot working only through MechInput, like a person
 * would: full throttle, steer to hold lateral offset `dWant`. A pure function
 * of the mech's state, so runs that use it are reproducible.
 */
export function steerToward(m: MechState, out: MechInput, dWant = 0): MechInput {
  const c = CLASSES[m.role];
  const look = 14 + m.speed * 0.35;
  const kappa = kappaAt(TRACK, m.s + m.speed * 0.12);
  const omegaMax = Math.min(c.turnMax, c.grip / Math.max(m.speed, 24)) * Math.min(1, m.speed / 12) || 1;
  const headingWant = clamp(Math.atan2(dWant - m.d, look), -0.5, 0.5);
  const rate = kappa * m.speed * Math.cos(m.heading) + (headingWant - m.heading) * 3.2;
  out.mx = clamp(rate / omegaMax, -1, 1);
  out.throttle = 1;
  return out;
}

/** Button-mashing: random sticks, triggers, buttons and tactic calls. */
export function mash(rnd: () => number, inp: MechInput): void {
  if (rnd() < 0.08) {
    inp.mx = rnd() * 2 - 1;
    inp.my = rnd() * 2 - 1;
  }
  if (rnd() < 0.03) inp.throttle = rnd() < 0.8 ? 1 : rnd();
  if (rnd() < 0.02) inp.brake = rnd() < 0.8 ? 0 : rnd();
  // Every button a controller has, the ability button included.
  if (rnd() < 0.2) inp.buttons = Math.floor(rnd() * (BTN_MASK + 1));
  if (rnd() < 0.01) inp.cmd = Math.floor(rnd() * 5);
}

// ---- Cells, lap phases and effects -------------------------------------------

/** Hand a mech ability charges (three, a full set, unless told otherwise). */
export function giveCells(m: MechState, n = 3): MechState {
  m.cells = n;
  return m;
}

/**
 * Put a race on a lap phase by hand (1 formation, 2 battle, 3 speed). The sim
 * only ever moves the phase forwards, so this sticks unless the leader's own
 * lap count calls for a later one.
 */
export function setLapPhase(race: RaceState, phase: 1 | 2 | 3): RaceState {
  race.lapPhase = phase;
  return race;
}

/** Every effect timer a mech carries, for "nothing is running" checks. */
export function effectTimers(m: MechState): number[] {
  return [m.overdriveT, m.ramT, m.shieldT, m.snareT, m.cloakT];
}

// ---- controlled scenarios --------------------------------------------------

export type LoggedEvent = SimEvent & { tick: number };

/**
 * A race with a person in every seat, so nothing moves unless the test says
 * so: no AI, no AI captain, no random numbers drawn. The countdown has run,
 * and all six mechs are parked far apart behind the stage. `put` brings one
 * on stage, on the Grand Straight where the road is dead straight.
 */
export class Arena {
  readonly race: RaceState;
  readonly inputs: MechInput[];
  /** Every event since the arena was made (or since `clearLog`). */
  log: LoggedEvent[] = [];
  /** s of the start line on the lap the scenario plays on. */
  readonly base: number;

  /**
   * `rules` overrides the default rules for this arena, so a test about one
   * mechanism can pin (or switch off) the others. Momentum is off unless a
   * test asks for it: on stage mechs sit in each other's slipstream, which
   * would quietly turn the first blow of most tests into a momentum strike.
   */
  constructor(lapPhase: 1 | 2 | 3 = 2, seed = 1, rules?: Partial<Rules>) {
    this.race = createRace(TRACK, { seed, seats: makeSeats('all'), rules: { momentumSecs: 0, ...rules } });
    this.inputs = this.race.mechs.map(() => emptyInput());
    runCountdown(this.race, this.inputs);
    this.base = (lapPhase - 1) * TRACK.length;
    this.race.lapPhase = lapPhase;
    for (const m of this.race.mechs) {
      m.s = this.base - 1500 - 500 * m.id;
      m.d = 0;
      m.speed = m.vs = m.vd = m.heading = m.facing = 0;
    }
    // The race's idea of where the leader is still dates from the grid;
    // bring it in line with the parked field, so the first mech put on stage
    // is not handed a tick of pack bonus for being "behind" a leader that is
    // no longer there.
    this.race.leaderS = this.base - 1500;
  }

  mech(id: number): MechState {
    return this.race.mechs[id];
  }

  /** The limiter in force right now: what a mech on stage cruises at on laps 1 and 2. */
  get pace(): number {
    return limiterOf(this.race);
  }

  /**
   * Place a mech `s` units past the start line at lateral `d`, cruising at
   * `speed` (by default the live limiter, so on laps 1 and 2 it just holds it).
   */
  put(id: number, s: number, d = 0, speed: number = this.pace): MechState {
    const m = this.race.mechs[id];
    m.s = this.base + s;
    m.lap = Math.round(this.base / TRACK.length);
    m.d = d;
    m.speed = m.vs = speed;
    m.vd = m.heading = m.facing = 0;
    this.inputs[id].throttle = speed > 0 ? 1 : 0;
    return m;
  }

  step(n = 1, each?: () => void): this {
    for (let i = 0; i < n; i++) {
      stepRace(this.race, TRACK, this.inputs);
      for (const e of this.race.events) this.log.push({ ...e, tick: this.race.tick });
      if (each) each();
    }
    return this;
  }

  hold(id: number, buttons: number): this {
    this.inputs[id].buttons |= buttons;
    return this;
  }

  release(id: number, buttons: number): this {
    this.inputs[id].buttons &= ~buttons;
    return this;
  }

  /** Press for exactly one tick. Returns the tick on which the press landed. */
  tap(id: number, buttons: number): number {
    this.hold(id, buttons).step(1).release(id, buttons);
    return this.race.tick;
  }

  /** Tap the ability button. Returns the tick on which the press landed. */
  ability(id: number): number {
    return this.tap(id, BTN.ABILITY);
  }

  /**
   * For runs longer than the Grand Straight (it is dead straight from about
   * 250 units before the line to 600 after it): call this every tick, and
   * whenever the first of the given mechs gets `past` units beyond the line
   * the whole group is moved back `back` units together. Gaps, speeds and
   * lap counts are untouched; the race's leader reference moves with them.
   */
  recenter(ids: readonly number[], past = 300, back = 500): void {
    let front = -Infinity;
    for (const id of ids) front = Math.max(front, this.race.mechs[id].s);
    if (front - this.base <= past) return;
    for (const id of ids) this.race.mechs[id].s -= back;
    let leader = -Infinity;
    for (const m of this.race.mechs) if (!m.retired && !m.finished) leader = Math.max(leader, m.s);
    if (leader > -Infinity) this.race.leaderS = leader;
  }

  clearLog(): this {
    this.log = [];
    return this;
  }

  events<T extends SimEvent['type']>(type: T): Array<Extract<LoggedEvent, { type: T }>> {
    return this.log.filter((e) => e.type === type) as Array<Extract<LoggedEvent, { type: T }>>;
  }

  /** Step until `done()` is true; returns ticks taken, or -1 after `limit`. */
  until(done: () => boolean, limit = 600): number {
    for (let i = 0; i < limit; i++) {
      if (done()) return i;
      this.step(1);
    }
    return done() ? limit : -1;
  }
}

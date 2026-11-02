// Replays. The simulation is deterministic: a race is its setup (the circuit
// and the RaceConfig, seed included) plus what the person flying it pressed,
// tick by tick. Everything else (every computer pilot, every blow) follows.
// So a replay records just that, run-length encoded (an input usually holds
// for several ticks), and plays the race back by running it again.
//
// The person's inputs are quantized as online play quantizes them (a stick
// to 1/127), at the source, so what is recorded is exactly what the race was
// given.

import { packInput, unpackInput, type WireInput } from '../../net/protocol';
import {
  DT,
  PHASE,
  TICK_RATE,
  assignData,
  buildTrack,
  copyData,
  createRace,
  emptyInput,
  stepRace,
  trackById,
  type MechInput,
  type RaceConfig,
  type RaceState,
  type SimEvent,
  type Track,
} from '../../sim/index';
import type { Session } from './session';

/** A race to watch again. Plain data: it can be kept (localStorage) and sent. */
export interface Replay {
  v: 1;
  /** The circuit's id. */
  track: string;
  /** The race as it was made (seed, seats, rules, lesson...). */
  cfg: RaceConfig;
  /** The seat that was flown (its inputs are the ones recorded), or -1. */
  local: number;
  /** Which faction each race team was (the view's liveries). */
  factions: number[];
  /** What it was: "Free Play", "Grand Prix, round 2 of 4"... */
  label: string;
  /** The local seat's input each tick, run-length encoded: [ticks it held for, the input (0: none)]. */
  inputs: Array<[number, WireInput]>;
  /** Ticks recorded. */
  ticks: number;
  /** The race as it ended, to tell a replay that no longer plays out the same (see fingerprint). */
  end: string;
  /** When it was raced (ms since 1970). */
  at: number;
}

/** A short fingerprint of where a race stands: tick, and each mech's place, distance and armour. */
export function fingerprint(race: RaceState): string {
  return `${race.tick}|${race.mechs.map((m) => `${m.place}:${Math.round(m.s * 10)}:${Math.round(m.hp)}`).join(',')}`;
}

/** The ticks run after the flag that a replay keeps (the cool-down, the camera's last look). */
export const AFTER_FLAG = 3 * TICK_RATE;

/** Records the local seat's input as the session feeds it to the race. */
export class Recorder {
  readonly inputs: Array<[number, WireInput]> = [];
  ticks = 0;
  /** No more ticks (the race ended, and its cool-down has been kept). */
  done = false;
  /** The race's fingerprint as the recording stopped (see fingerprint). */
  end = '';
  private finishedAt = -1;

  /** The input given to the race on a tick (call once per stepRace, before it). */
  record(input: MechInput | null): void {
    if (this.done) return;
    const w = packInput(input);
    const last = this.inputs[this.inputs.length - 1];
    if (last && same(last[1], w)) last[0]++;
    else this.inputs.push([1, w]);
    this.ticks++;
  }

  /** After each tick: stop a little after the flag. */
  after(race: RaceState): void {
    if (this.done) return;
    if (race.phase === PHASE.FINISHED && this.finishedAt < 0) this.finishedAt = race.tick;
    if (this.finishedAt >= 0 && race.tick >= this.finishedAt + AFTER_FLAG) {
      this.done = true;
      this.end = fingerprint(race);
    }
  }
}

function same(a: WireInput, b: WireInput): boolean {
  if (a === 0 || b === 0) return a === b;
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A moment worth jumping to. */
export interface Highlight {
  tick: number;
  /** Whose moment it is (the camera goes to them). */
  mech: number;
  kind: 'start' | 'lap' | 'ko' | 'ringout' | 'parry' | 'lead' | 'finish';
  label: string;
}

/** Seconds of a replay before a highlight that a jump to it starts from. */
export const LEAD_IN = 3;

/** Ticks between the snapshots a replay keeps for seeking. */
const SNAP_EVERY = 10 * TICK_RATE;

/**
 * Plays a replay: the race made again from its setup, stepped with the
 * recorded inputs at whatever speed is asked, paused, or sent to any tick
 * (from the nearest snapshot taken on the way through).
 */
export class ReplaySession implements Session {
  readonly track: Track;
  readonly race: RaceState;
  readonly localId: number;
  readonly prevS: Float64Array;
  readonly prevD: Float32Array;
  readonly prevFacing: Float32Array;
  readonly prevH: Float32Array;
  readonly events: SimEvent[] = [];
  alpha = 1;
  /** Playback speed (1: as raced). */
  speed = 1;
  /** Slow motion asked for by the game (a knockout), on top of the speed. */
  timeScale = 1;
  paused = false;
  /** The moments worth jumping to, found while preparing. */
  readonly highlights: Highlight[] = [];
  /** Whether the race played out as it was raced (false: the game has changed since; it is still watchable). */
  faithful = true;
  /** How far preparing has got, 0 to 1. */
  progress = 0;
  private snaps = new Map<number, RaceState>();
  private inputs: Array<MechInput | null> = [];
  /** Where each run of inputs starts, by tick. */
  private runStart: number[] = [];
  private acc = 0;
  private hold = 0;
  private prepared = false;
  private prepRace: RaceState;
  private lead = -1;

  constructor(readonly replay: Replay) {
    this.track = buildTrack(trackById(replay.track));
    this.race = createRace(this.track, copyData(replay.cfg));
    this.prepRace = copyData(this.race);
    this.localId = replay.local;
    const n = this.race.mechs.length;
    this.prevS = new Float64Array(n);
    this.prevD = new Float32Array(n);
    this.prevFacing = new Float32Array(n);
    this.prevH = new Float32Array(n);
    this.inputs = new Array(n).fill(null);
    let t = 0;
    for (const [count] of replay.inputs) {
      this.runStart.push(t);
      t += count;
    }
    this.snaps.set(0, copyData(this.race));
    this.snapshot();
  }

  /** Ticks in the replay. */
  get length(): number {
    return this.replay.ticks;
  }

  /** The input the local seat was given on the step from `tick` to `tick + 1`. */
  private inputAt(tick: number): MechInput | null {
    const runs = this.replay.inputs;
    let lo = 0;
    let hi = this.runStart.length - 1;
    if (hi < 0) return null;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.runStart[mid] <= tick) lo = mid;
      else hi = mid - 1;
    }
    return unpackInput(runs[lo][1]);
  }

  /** One step of a race, as it was raced. */
  private step(race: RaceState): void {
    if (this.localId >= 0) this.inputs[this.localId] = this.inputAt(race.tick);
    stepRace(race, this.track, this.inputs);
  }

  /**
   * Run the whole replay through once, a slice at a time (`budgetMs` of work
   * per call): the snapshots for seeking, the highlights, and whether it plays
   * out as raced. True once done.
   */
  prepare(budgetMs = 12): boolean {
    if (this.prepared) return true;
    const r = this.prepRace;
    const until = performance.now() + budgetMs;
    while (r.tick < this.replay.ticks) {
      this.step(r);
      this.findHighlights(r);
      if (r.tick % SNAP_EVERY === 0) this.snaps.set(r.tick, copyData(r));
      if ((r.tick & 63) === 0 && performance.now() > until) break;
    }
    this.progress = r.tick / Math.max(1, this.replay.ticks);
    if (r.tick < this.replay.ticks) return false;
    this.faithful = fingerprint(r) === this.replay.end;
    this.prepared = true;
    this.prepRace = null as unknown as RaceState;
    return true;
  }

  private findHighlights(r: RaceState): void {
    const name = (id: number) => r.mechs[id]?.name ?? '?';
    // (Once for the same thing by the same pilot within two seconds: a
    // ring-out reported as each piece of the wall is hit is one moment.)
    const add = (h: Highlight) => {
      for (let i = this.highlights.length - 1; i >= 0 && h.tick - this.highlights[i].tick < 2 * TICK_RATE; i--) {
        if (this.highlights[i].label === h.label) return;
      }
      this.highlights.push(h);
    };
    for (const e of r.events) {
      switch (e.type) {
        case 'countdown':
          if (e.n === 0) add({ tick: r.tick, mech: this.localId >= 0 ? this.localId : 0, kind: 'start', label: 'The start' });
          break;
        case 'lapPhase':
          add({ tick: r.tick, mech: this.localId >= 0 ? this.localId : 0, kind: 'lap', label: e.lap >= 3 ? 'Speed lap' : 'Battle lap' });
          break;
        case 'ko':
          add({ tick: r.tick, mech: e.by >= 0 ? e.by : e.mech, kind: 'ko', label: e.by >= 0 ? `${name(e.by)} knocks out ${name(e.mech)}` : `${name(e.mech)} is out` });
          break;
        case 'splat':
          if (e.by >= 0) add({ tick: r.tick, mech: e.by, kind: 'ringout', label: `${name(e.by)} rings out ${name(e.mech)}` });
          break;
        case 'parry':
          if (e.mech === this.localId) add({ tick: r.tick, mech: e.mech, kind: 'parry', label: `${name(e.mech)} parries ${name(e.attacker)}` });
          break;
        case 'finish':
          if (e.place === 1 || e.mech === this.localId) add({ tick: r.tick, mech: e.mech, kind: 'finish', label: `${name(e.mech)} finishes ${ordinal(e.place)}` });
          break;
      }
    }
    // A change of leader on the battle or speed lap (not the jostling of the first seconds).
    if (r.phase === PHASE.RACING && r.tick % 30 === 0) {
      const leader = r.mechs.find((m) => m.place === 1 && !m.finished);
      if (leader && leader.id !== this.lead) {
        if (this.lead >= 0 && r.lapPhase >= 2) add({ tick: r.tick, mech: leader.id, kind: 'lead', label: `${leader.name} takes the lead` });
        this.lead = leader.id;
      }
    }
  }

  private snapshot(): void {
    for (const m of this.race.mechs) {
      this.prevS[m.id] = m.s;
      this.prevD[m.id] = m.d;
      this.prevFacing[m.id] = m.facing;
      this.prevH[m.id] = m.h;
    }
  }

  freeze(seconds: number): void {
    this.hold = Math.max(this.hold, seconds);
  }

  /** Watch on: `dt` seconds of the picture (the recorded input is the race's own; `input` is ignored). */
  update(dt: number, _input: MechInput | null): void {
    this.events.length = 0;
    if (this.paused) return;
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    this.acc += Math.min(dt, 0.1) * this.speed * this.timeScale;
    let steps = 0;
    // (Fast forward runs more ticks a frame than the race did.)
    const most = Math.ceil(8 * Math.max(1, this.speed));
    while (this.acc >= DT && steps < most && this.race.tick < this.replay.ticks) {
      this.snapshot();
      this.step(this.race);
      for (const e of this.race.events) this.events.push(e);
      this.acc -= DT;
      steps++;
    }
    if (steps === most) this.acc = 0;
    if (this.race.tick >= this.replay.ticks) {
      this.acc = 0;
      this.paused = true;
    }
    this.alpha = Math.min(1, this.acc / DT);
  }

  /** Go to a tick (clamped to the replay): from the nearest snapshot at or before it. */
  seek(tick: number): void {
    const want = Math.max(0, Math.min(this.replay.ticks, Math.round(tick)));
    let from = 0;
    for (const t of this.snaps.keys()) if (t <= want && t > from) from = t;
    // Going forward a little from where it is now is quicker than from a snapshot.
    if (!(want >= this.race.tick && this.race.tick >= from)) assignData(this.race, copyData(this.snaps.get(from)!));
    while (this.race.tick < want) this.step(this.race);
    this.race.events.length = 0;
    this.events.length = 0;
    this.acc = 0;
    this.hold = 0;
    this.snapshot();
    this.alpha = 1;
    if (this.race.tick < this.replay.ticks && this.paused && this.race.tick < want) this.paused = false;
  }
}

function ordinal(n: number): string {
  return ['1st', '2nd', '3rd', '4th', '5th', '6th'][n - 1] ?? `${n}th`;
}

/**
 * Make a replay of a race from the session's recording (the race as it is
 * now: still being recorded, or with its recording ended).
 */
export function makeReplay(recorder: Recorder, track: string, cfg: RaceConfig, local: number, factions: readonly number[], label: string, race: RaceState): Replay {
  const made = copyData(cfg);
  // A seat handed to the computer before the race began (a demo) is the computer's.
  made.seats.forEach((seat, i) => (seat.human = !!race.mechs[i]?.human));
  return {
    v: 1,
    track,
    cfg: made,
    local: local >= 0 && race.mechs[local]?.human ? local : -1,
    factions: [...factions],
    label,
    inputs: recorder.inputs.map(([n, w]) => [n, w === 0 ? 0 : ([...w] as WireInput)]),
    ticks: recorder.ticks,
    end: recorder.done ? recorder.end : fingerprint(race),
    at: Date.now(),
  };
}

/** An input as the race is given it (the person's, quantized as online). */
export function quantize(input: MechInput | null, out: MechInput = emptyInput()): MechInput | null {
  const w = packInput(input);
  if (w === 0) return null;
  out.mx = w[0] / 127;
  out.my = w[1] / 127;
  out.throttle = w[2] / 255;
  out.brake = w[3] / 255;
  out.buttons = w[4];
  out.cmd = w[5];
  return out;
}

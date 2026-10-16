// The Session for an online race: what is drawn is the prediction (see
// src/net/prediction.ts), smoothed so that a correction from the server
// eases in over a few frames instead of jumping.
//
// Online nothing stops the race for one person, so the presentation tricks
// that stop the clock offline only hold the picture here: a hold leaves the
// race running underneath, and when it lifts the picture catches up (the
// smoothing turns the jump into a quick slide).

import { DT, PHASE, assignData, cloneRace, emptyInput, type MechInput, type RaceState, type SimEvent, type Track } from '../../sim/index';
import { Predictor } from '../../net/prediction';
import type { KeyMsg, MatchStartMsg, TickMsg, WireInput } from '../../net/protocol';
import type { Session } from './session';

/** Corrections this large are snapped, not eased (a recovery drone, a respawn). */
const SNAP_S = 40;
const SNAP_D = 18;
/** How fast a correction eases out (seconds, roughly the time to fade to a third). */
const EASE = 0.1;

export class NetSession implements Session {
  readonly track: Track;
  /** What is drawn: the prediction plus the easing offsets. */
  readonly race: RaceState;
  readonly localId: number;
  readonly prevS: Float64Array;
  readonly prevD: Float32Array;
  readonly prevFacing: Float32Array;
  readonly prevH: Float32Array;
  readonly events: SimEvent[] = [];
  alpha = 1;
  /** Slow motion has no place online (the race does not wait); kept for the Session's users, unused. */
  timeScale = 1;
  readonly predictor: Predictor;
  private acc = 0;
  private hold = 0;
  private incoming: SimEvent[] = [];
  private offS: Float64Array;
  private offD: Float64Array;
  private offF: Float64Array;
  private offH: Float64Array;
  private latched = 0;
  private latchedCmd = 0;
  private lastTick: number;
  /** Your inputs go to the computer pilot while true (the pause menu). */
  autopilot = false;

  constructor(
    start: MatchStartMsg,
    private sendInputs: (msg: { s: number; i: WireInput[]; e: number }) => void,
    private askResync: () => void,
  ) {
    this.predictor = new Predictor(start);
    this.track = this.predictor.track;
    this.localId = start.seat;
    this.race = cloneRace(this.predictor.predicted);
    const n = this.race.mechs.length;
    this.prevS = new Float64Array(n);
    this.prevD = new Float32Array(n);
    this.prevFacing = new Float32Array(n);
    this.prevH = new Float32Array(n);
    this.offS = new Float64Array(n);
    this.offD = new Float64Array(n);
    this.offF = new Float64Array(n);
    this.offH = new Float64Array(n);
    this.lastTick = this.race.tick;
    this.snapshotPrev();
  }

  private snapshotPrev(): void {
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

  /** The server's ticks: the confirmed race moves on and the prediction is replayed. */
  onTicks(msg: TickMsg): void {
    const before = this.positions();
    this.incoming.push(...this.predictor.applyTicks(msg));
    this.absorb(before);
    if (this.predictor.needResync) {
      this.predictor.needResync = false;
      this.askResync();
    }
  }

  onKey(msg: KeyMsg): void {
    const before = this.positions();
    this.predictor.applyKey(msg.race);
    this.absorb(before);
  }

  private positions(): number[] {
    const out: number[] = [];
    for (const m of this.predictor.predicted.mechs) out.push(m.s, m.d, m.facing, m.h);
    return out;
  }

  /** Whatever the replay moved, the picture keeps where it was and eases across. */
  private absorb(before: number[]): void {
    const after = this.predictor.predicted.mechs;
    for (const m of after) {
      const i = m.id * 4;
      const ds = before[i] - m.s;
      const dd = before[i + 1] - m.d;
      if (Math.abs(ds) > SNAP_S || Math.abs(dd) > SNAP_D) {
        this.offS[m.id] = this.offD[m.id] = this.offF[m.id] = this.offH[m.id] = 0;
        continue;
      }
      this.offS[m.id] += ds;
      this.offD[m.id] += dd;
      let df = before[i + 2] - m.facing;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      this.offF[m.id] += df;
      this.offH[m.id] += before[i + 3] - m.h;
    }
  }

  update(dt: number, input: MechInput | null): void {
    this.events.length = 0;
    if (input) {
      this.latched |= input.buttons;
      if (input.cmd) this.latchedCmd = input.cmd;
    }
    for (const e of this.incoming) this.events.push(e);
    this.incoming.length = 0;
    const p = this.predictor;
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= DT && steps < 12) {
      if (p.confirmed.phase === PHASE.FINISHED) {
        // After the flag every mech is the computer's: the race runs on here, exactly.
        for (const e of p.runOn()) this.events.push(e);
      } else if (p.canStep()) {
        let inp: MechInput | null = null;
        if (!this.autopilot && input) {
          inp = { ...input };
          if (steps === 0) {
            inp.buttons |= this.latched;
            inp.cmd = inp.cmd || this.latchedCmd;
            this.latched = 0;
            this.latchedCmd = 0;
          }
        } else if (!this.autopilot) inp = emptyInput();
        for (const e of p.step(inp)) this.events.push(e);
      }
      this.acc -= DT;
      steps++;
    }
    if (steps === 12) this.acc = 0;
    const out = p.takeOutbox();
    if (out) this.sendInputs(out);
    this.alpha = Math.min(1, this.acc / DT);

    // The picture: held, or the prediction plus what is left of the corrections.
    if (this.hold > 0) {
      this.hold -= dt;
      this.alpha = 1;
      // What the picture still shows becomes the starting point of the catch-up.
      if (this.hold <= 0) this.absorbHeld();
      return;
    }
    const k = Math.exp(-dt / EASE);
    const pred = p.predicted;
    if (pred.tick !== this.lastTick) {
      this.snapshotPrev();
      this.lastTick = pred.tick;
    }
    assignData(this.race, pred);
    for (const m of this.race.mechs) {
      this.offS[m.id] *= k;
      this.offD[m.id] *= k;
      this.offF[m.id] *= k;
      this.offH[m.id] *= k;
      m.s += this.offS[m.id];
      m.d += this.offD[m.id];
      m.facing += this.offF[m.id];
      m.h = Math.max(0, m.h + this.offH[m.id]);
    }
  }

  /**
   * The hold has lifted: the offsets become exactly the gap between what the
   * picture shows and the prediction (whatever they gathered during the hold
   * is dropped), or nothing at all for a mech too far off to slide.
   */
  private absorbHeld(): void {
    for (const m of this.predictor.predicted.mechs) {
      const shown = this.race.mechs[m.id];
      const ds = shown.s - m.s;
      const dd = shown.d - m.d;
      if (Math.abs(ds) > SNAP_S * 2 || Math.abs(dd) > SNAP_D) {
        this.offS[m.id] = this.offD[m.id] = this.offF[m.id] = this.offH[m.id] = 0;
        continue;
      }
      let df = shown.facing - m.facing;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      this.offS[m.id] = ds;
      this.offD[m.id] = dd;
      this.offF[m.id] = df;
      this.offH[m.id] = shown.h - m.h;
    }
  }

  /** The confirmed race: what the server's results are scored from. */
  get confirmed(): RaceState {
    return this.predictor.confirmed;
  }
}

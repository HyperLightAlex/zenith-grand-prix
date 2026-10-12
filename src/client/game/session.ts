// A Session owns a race and feeds it time and inputs. The game only ever
// talks to this interface, so swapping the in-browser simulation for one
// that mirrors a server is a matter of adding a second implementation.
import {
  DT,
  buildTrack,
  createRace,
  emptyInput,
  stepRace,
  type MechInput,
  type RaceConfig,
  type RaceState,
  type SimEvent,
  type Track,
  type TrackDef,
} from '../../sim/index';

export interface Session {
  readonly track: Track;
  readonly race: RaceState;
  /** The mech this player flies, or -1 when only watching. */
  readonly localId: number;
  /** Where each mech was one tick ago, for smooth drawing between ticks. */
  readonly prevS: Float64Array;
  readonly prevD: Float32Array;
  readonly prevFacing: Float32Array;
  /** 0..1: how far the picture is between the previous tick and the current one. */
  alpha: number;
  /** Everything that happened during the last update call. */
  readonly events: SimEvent[];
  update(dt: number, input: MechInput | null): void;
  /** Hold the simulation for a moment (hit-stop). */
  freeze(seconds: number): void;
}

export class LocalSession implements Session {
  readonly track: Track;
  readonly race: RaceState;
  readonly prevS: Float64Array;
  readonly prevD: Float32Array;
  readonly prevFacing: Float32Array;
  readonly events: SimEvent[] = [];
  alpha = 1;
  /** Slow motion factor, eased back to 1 by the game. */
  timeScale = 1;
  private acc = 0;
  private hold = 0;
  private inputs: Array<MechInput | null>;
  /**
   * Buttons (and a team call) seen on frames that ran no tick: a hit-stop,
   * or a fast display drawing more frames than the simulation has ticks.
   * The next tick gets them, so a quick tap is never lost in between.
   */
  private latched = 0;
  private latchedCmd = 0;
  private first = emptyInput();

  constructor(trackDef: TrackDef, cfg: RaceConfig, readonly localId: number) {
    this.track = buildTrack(trackDef);
    this.race = createRace(this.track, cfg);
    const n = this.race.mechs.length;
    this.prevS = new Float64Array(n);
    this.prevD = new Float32Array(n);
    this.prevFacing = new Float32Array(n);
    this.inputs = new Array(n).fill(null);
    this.snapshot();
  }

  private snapshot(): void {
    for (const m of this.race.mechs) {
      this.prevS[m.id] = m.s;
      this.prevD[m.id] = m.d;
      this.prevFacing[m.id] = m.facing;
    }
  }

  freeze(seconds: number): void {
    this.hold = Math.max(this.hold, seconds);
  }

  update(dt: number, input: MechInput | null): void {
    this.events.length = 0;
    if (input) {
      this.latched |= input.buttons;
      if (input.cmd) this.latchedCmd = input.cmd;
    }
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    this.acc += Math.min(dt, 0.1) * this.timeScale;
    const live = input ?? emptyInput();
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      this.snapshot();
      if (this.localId >= 0) {
        if (steps === 0) {
          // The first tick of the frame also carries whatever was pressed since the last tick.
          Object.assign(this.first, live);
          this.first.buttons = live.buttons | this.latched;
          this.first.cmd = live.cmd || this.latchedCmd;
          this.inputs[this.localId] = this.first;
          this.latched = 0;
          this.latchedCmd = 0;
        } else {
          this.inputs[this.localId] = live;
        }
      }
      stepRace(this.race, this.track, this.inputs);
      for (const e of this.race.events) this.events.push(e);
      this.acc -= DT;
      steps++;
    }
    if (steps === 8) this.acc = 0;
    this.alpha = this.acc / DT;
  }

  /** Run the simulation forward without drawing (used by attract mode and tests). */
  fastForward(seconds: number): void {
    const ticks = Math.round(seconds / DT);
    for (let i = 0; i < ticks; i++) stepRace(this.race, this.track, this.inputs);
    this.snapshot();
  }
}

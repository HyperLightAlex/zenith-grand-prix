// A client's two copies of an online race.
//
//   confirmed  The race as the server ran it: stepped with exactly the inputs
//              the server used, tick by tick, from its packets. Identical to
//              the server's (a keyframe puts it right if it ever is not).
//   predicted  The confirmed race, then this player's own inputs the server
//              has not used yet, replayed on top. Everyone else is assumed to
//              keep doing what they last did; the computer pilots are exact.
//              This is what is drawn: your mech answers the stick at once.
//
// Events (sounds, sparks, the HUD's calls) come from the confirmed race,
// except your own actions (a swing, a boost, a lock), which come from the
// prediction so they start the moment you press, and are not repeated when
// the confirmed race catches up with them.

import { buildTrack, cloneRace, copyData, createRace, raceChecksum, restoreRace, stepRace, trackById, TRACKS, type MechInput, type RaceState, type SimEvent, type Track } from '../sim/index';
import { packInput, unpackInput, type MatchStartMsg, type TickMsg, type WireInput } from './protocol';

/** Your own actions: shown from the prediction. */
const OWN = new Set<SimEvent['type']>(['swing', 'charge', 'windup', 'shot', 'dash', 'boost', 'arc', 'lock', 'unlock', 'denied', 'carve', 'carveBurst', 'ability', 'launch']);
/** Predicted inputs not yet used beyond this many and prediction waits (the server has stopped taking them). */
const MAX_AHEAD = 90;

interface Pending {
  seq: number;
  wire: WireInput;
}

function ownKey(e: SimEvent): string {
  const x = e as { attack?: number; ability?: number; tier?: number; target?: number };
  return `${e.type}:${x.attack ?? x.ability ?? x.tier ?? x.target ?? ''}`;
}

export class Predictor {
  readonly track: Track;
  readonly confirmed: RaceState;
  readonly predicted: RaceState;
  /** Your mech, or -1 when only watching. */
  readonly seat: number;
  /** Echoed with every input (see MatchStartMsg.epoch). */
  readonly epoch: number;
  /** The confirmed race disagreed with the server's checksum, or skipped a tick: ask for a keyframe. */
  needResync = false;
  /** Packets that arrived with ticks missing before them. */
  gaps = 0;
  /** Times the prediction was replayed from the confirmed race. */
  rebuilds = 0;
  private pending: Pending[] = [];
  private nextSeq = 1;
  private unsent: Pending[] = [];
  /** Each seat's last confirmed input: what the prediction assumes they keep doing. */
  private lastWire: WireInput[];
  /** Your own events shown from the prediction, kept a while to match against the confirmed ones. */
  private shown: Array<{ key: string; tick: number }> = [];

  constructor(start: MatchStartMsg) {
    this.track = buildTrack(trackById(start.track) ?? TRACKS[0]);
    this.seat = start.seat;
    this.epoch = start.epoch ?? 0;
    if (start.key) {
      this.confirmed = copyData(start.key);
    } else {
      this.confirmed = createRace(this.track, { seed: start.seed, seats: start.seats, gridFlip: start.gridFlip, laps: start.laps, mode: start.mode, grid: start.grid });
      this.confirmed.teams[0].caller = start.callers[0];
      this.confirmed.teams[1].caller = start.callers[1];
    }
    this.predicted = cloneRace(this.confirmed);
    this.lastWire = this.confirmed.mechs.map((m) => (m.human ? packInput({ mx: 0, my: 0, throttle: 0, brake: 0, buttons: 0, cmd: 0 }) : 0));
  }

  /** Inputs made but not yet used by the server. */
  get ahead(): number {
    return this.pending.length;
  }

  /** Whether the prediction may run another tick (it waits once too far ahead of what the server has used). */
  canStep(): boolean {
    return this.seat >= 0 && this.pending.length < MAX_AHEAD;
  }

  /**
   * One tick of yours: the input (null: let the computer pilot fly, as in
   * the pause menu) goes out to the server and into the prediction. Returns
   * your own events from that tick.
   */
  step(input: MechInput | null): SimEvent[] {
    const p: Pending = { seq: this.nextSeq++, wire: packInput(input) };
    this.pending.push(p);
    this.unsent.push(p);
    return this.stepPredicted(p.wire, true);
  }

  /** Inputs not yet sent, as one message, or null. */
  takeOutbox(): { s: number; i: WireInput[]; e: number } | null {
    if (!this.unsent.length) return null;
    const msg = { s: this.unsent[0].seq, i: this.unsent.map((p) => p.wire), e: this.epoch };
    this.unsent = [];
    return msg;
  }

  /** Start numbering inputs afresh and forget unused ones (after a reconnect). */
  resetInputs(): void {
    this.pending = [];
    this.unsent = [];
    this.nextSeq = 1;
  }

  /**
   * One predicted tick. Your own events are shown the first time an input is
   * run (`fresh`), never on a replay: a replay after a correction may run the
   * same input at a different tick, and going by ticks would show its swing
   * twice or not at all. Whatever a replay changes is heard from the
   * confirmed race instead.
   */
  private stepPredicted(own: WireInput, fresh: boolean): SimEvent[] {
    const race = this.predicted;
    const inputs = race.mechs.map((m) => (m.id === this.seat ? unpackInput(own) : m.human ? unpackInput(this.lastWire[m.id]) : null));
    stepRace(race, this.track, inputs);
    const out: SimEvent[] = [];
    if (!fresh) return out;
    for (const e of race.events) {
      if (OWN.has(e.type) && (e as { mech?: number }).mech === this.seat) {
        out.push(e);
        this.shown.push({ key: ownKey(e), tick: race.tick });
      }
    }
    return out;
  }

  /**
   * The server's inputs for some ticks. Runs the confirmed race through
   * them, then replays the prediction on top. Returns the confirmed events
   * to present (your own actions already shown are left out).
   */
  applyTicks(msg: TickMsg): SimEvent[] {
    const out: SimEvent[] = [];
    const race = this.confirmed;
    for (let k = 0; k < msg.i.length; k++) {
      const tick = msg.t + k;
      if (tick <= race.tick) continue;
      if (tick !== race.tick + 1) {
        this.needResync = true;
        this.gaps++;
        break;
      }
      if (msg.ops) for (const [at, team, caller] of msg.ops) if (at === tick && race.teams[team]) race.teams[team].caller = caller;
      const row = msg.i[k];
      const inputs = race.mechs.map((m) => unpackInput(row[m.id]));
      race.mechs.forEach((m) => {
        if (m.human) this.lastWire[m.id] = row[m.id] ?? 0;
      });
      stepRace(race, this.track, inputs);
      for (const e of race.events) {
        if (OWN.has(e.type) && (e as { mech?: number }).mech === this.seat) {
          const key = ownKey(e);
          const i = this.shown.findIndex((s) => s.key === key && Math.abs(s.tick - tick) <= 30);
          if (i >= 0) {
            this.shown.splice(i, 1);
            continue;
          }
        }
        out.push(e);
      }
      if (msg.sum && msg.sum[0] === tick && raceChecksum(race) !== msg.sum[1]) this.needResync = true;
    }
    this.shown = this.shown.filter((s) => s.tick > race.tick - 120);
    const ack = this.seat >= 0 ? msg.a?.[this.seat] : undefined;
    if (typeof ack === 'number') this.pending = this.pending.filter((p) => p.seq > ack);
    this.rebuild();
    return out;
  }

  /** The whole race from the server: the confirmed race becomes it. */
  applyKey(race: RaceState): void {
    restoreRace(this.confirmed, race);
    this.needResync = false;
    this.rebuild();
  }

  /** The prediction again, from the confirmed race and the inputs the server has not used yet. */
  rebuild(): void {
    restoreRace(this.predicted, this.confirmed);
    this.predicted.events = [];
    for (const p of this.pending) this.stepPredicted(p.wire, false);
    this.rebuilds++;
  }

  /**
   * After the flag the server stops sending ticks: every mech is the
   * computer's by then, so both copies run on locally, exactly.
   */
  runOn(): SimEvent[] {
    stepRace(this.confirmed, this.track, []);
    const events = [...this.confirmed.events];
    restoreRace(this.predicted, this.confirmed);
    this.pending = [];
    return events;
  }
}

// A room and its clients with no network: messages are handed over after a
// set delay on a shared clock. Not a test file itself.

import { PHASE, emptyInput, type MechInput } from '../src/sim/index';
import { Predictor } from '../src/net/prediction';
import { RoomCore, type CoreIO } from '../src/net/roomCore';
import type { ClientMessages, GpRequest, LobbyView, MatchStartMsg, RoundEndMsg, ServerMessages, TickMsg } from '../src/net/protocol';
import type { JoinInfo } from '../src/net/lobby';
import { makeRandom } from './helpers';

interface Letter {
  at: number;
  run: () => void;
}

export class TestClient {
  lobby: LobbyView | null = null;
  predictor: Predictor | null = null;
  start: MatchStartMsg | null = null;
  roundEnds: RoundEndMsg[] = [];
  notices: string[] = [];
  errors: string[] = [];
  received: Array<keyof ServerMessages> = [];
  /** Inputs for this client's mech, tick by tick (null: let the computer fly). */
  drive: (c: TestClient) => MechInput | null = () => emptyInput();
  /** One-way delay to and from the room, in ms. */
  latency = 40;
  connected = true;
  /** The confirmed race diverged from the room's: set when a checksum or tick mismatch was seen. */
  resyncs = 0;
  constructor(
    readonly net: TestNet,
    readonly pid: string,
  ) {}

  deliver<K extends keyof ServerMessages>(type: K, msg: ServerMessages[K]): void {
    if (!this.connected) return;
    this.received.push(type);
    // A copy, as the wire would give.
    const m = JSON.parse(JSON.stringify(msg)) as ServerMessages[K];
    switch (type) {
      case 'lobby':
        this.lobby = m as LobbyView;
        break;
      case 'matchStart':
        this.start = m as MatchStartMsg;
        this.predictor = new Predictor(this.start);
        break;
      case 'tick':
        this.predictor?.applyTicks(m as TickMsg);
        if (this.predictor?.needResync) {
          this.resyncs++;
          this.predictor.needResync = false;
          this.send('resync', {});
        }
        break;
      case 'key':
        this.predictor?.applyKey((m as ServerMessages['key']).race);
        break;
      case 'roundEnd':
        this.roundEnds.push(m as RoundEndMsg);
        break;
      case 'lobbyAgain':
        this.predictor = null;
        this.start = null;
        break;
      case 'notice':
        this.notices.push((m as ServerMessages['notice']).text);
        break;
      case 'error':
        this.errors.push((m as ServerMessages['error']).text);
        break;
      default:
        break;
    }
  }

  send<K extends keyof ClientMessages>(type: K, msg: ClientMessages[K]): void {
    if (!this.connected) return;
    const copy = JSON.parse(JSON.stringify(msg));
    this.net.post(this.latency, () => this.net.core.message(this.pid, type, copy));
  }

  /** One tick of play: predict and send. */
  tick(): void {
    const p = this.predictor;
    if (!p || p.seat < 0 || !this.connected) return;
    if (p.confirmed.phase === PHASE.FINISHED) return;
    if (p.canStep()) p.step(this.drive(this));
    const out = p.takeOutbox();
    if (out) this.send('input', out);
  }
}

export class TestNet {
  clock = 0;
  readonly core: RoomCore;
  readonly clients = new Map<string, TestClient>();
  private mail: Letter[] = [];
  readonly random = makeRandom(77);

  constructor(opts: { laps?: number; faction?: number; gp?: GpRequest } = {}) {
    const io: CoreIO = {
      send: (pid, type, msg) => {
        const c = this.clients.get(pid);
        if (c) this.post(c.latency, () => c.deliver(type, msg));
      },
      broadcast: (type, msg) => {
        for (const m of this.core.lobby.members) {
          const c = this.clients.get(m.pid);
          if (c && m.connected) {
            const copy = JSON.parse(JSON.stringify(msg));
            this.post(c.latency, () => c.deliver(type, copy));
          }
        }
      },
      now: () => this.clock,
      random: this.random,
    };
    this.core = new RoomCore('K7Q2X', 'test', io, opts.faction ?? 0, { laps: opts.laps, gp: opts.gp });
  }

  post(delay: number, run: () => void): void {
    this.mail.push({ at: this.clock + delay, run });
  }

  join(pid: string, info: Partial<JoinInfo> = {}, latency = 40): TestClient {
    const c = new TestClient(this, pid);
    c.latency = latency;
    this.clients.set(pid, c);
    const res = this.core.join({ pid, deviceId: pid, callsign: pid, loadout: { faction: 0, role: 0 }, ...info });
    if (!res.ok) c.errors.push(res.text);
    return c;
  }

  /** Advance the shared clock by `ms`, a sixtieth of a second at a time. */
  run(ms: number, until?: () => boolean): void {
    const step = 1000 / 60;
    const end = this.clock + ms;
    while (this.clock < end) {
      this.clock += step;
      const due = this.mail.filter((l) => l.at <= this.clock).sort((a, b) => a.at - b.at);
      this.mail = this.mail.filter((l) => l.at > this.clock);
      for (const l of due) l.run();
      for (const c of this.clients.values()) c.tick();
      this.core.update(step);
      if (until && until()) return;
    }
  }
}

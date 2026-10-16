// The authoritative room: its lobby, its match and the race itself. It knows
// nothing of sockets: the server's Colyseus room (server/raceRoom.ts) feeds
// it joins, drops and messages and gives it a way to send, and the tests
// drive it the same way with no network at all.

import {
  BTN_MASK,
  CALLER,
  PHASE,
  ROLE,
  TRACKS,
  buildTrack,
  createMatch,
  createRace,
  emptyInput,
  raceChecksum,
  recordRound,
  stepRace,
  trackById,
  type MatchState,
  type RaceState,
  type Role,
  type SeatConfig,
  type Track,
} from '../sim/index';
import { PILOT_NAMES } from './factions';
import {
  addMember,
  allReady,
  callerAction,
  callerOf,
  clearReady,
  createLobby,
  expireHolds,
  kick,
  lobbyView,
  member,
  pickFrame,
  nextHost,
  removeMember,
  settleFrames,
  switchTeam,
  setFaction,
  setReady,
  setSettings,
  type JoinInfo,
  type JoinResult,
  type Lobby,
  type Outcome,
} from './lobby';
import {
  CHECKSUM_TICKS,
  FINAL_SECONDS,
  KEYFRAME_TICKS,
  MATCH_FORMATS,
  READY_COUNTDOWN,
  RECONNECT_SECONDS,
  RESULTS_SECONDS,
  SKILL_VALUES,
  TICKS_PER_PACKET,
  packInput,
  unpackInput,
  type ClientMessages,
  type RoomPhase,
  type ServerMessages,
  type TickMsg,
  type WireInput,
} from './protocol';

export interface CoreIO {
  send<K extends keyof ServerMessages>(pid: string, type: K, msg: ServerMessages[K]): void;
  /** To everyone connected. */
  broadcast<K extends keyof ServerMessages>(type: K, msg: ServerMessages[K]): void;
  /** Milliseconds, any origin. */
  now(): number;
  random(): number;
  log?(...args: unknown[]): void;
  /** Close someone's connection (they were removed), with the reason they are shown. */
  disconnect?(pid: string, text: string): void;
}

const TICK_MS = 1000 / 60;
/** Inputs queued beyond this many get folded together, so a fast client cannot build up lag. */
const QUEUE_SOFT = 6;
const QUEUE_HARD = 60;
/** A seat with no input for this many ticks is flown by its computer pilot until inputs come again. */
const STARVED_TICKS = 30;
const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];

interface Queued {
  seq: number;
  wire: WireInput;
}

export class RoomCore {
  readonly lobby: Lobby;
  phase: RoomPhase = 'lobby';
  match: MatchState | null = null;
  race: RaceState | null = null;
  track: Track | null = null;
  /** The pid in each race seat (null for a computer pilot), for the round being run. */
  seatPid: Array<string | null> = [];
  private factions: [number, number] = [0, 1];
  private queue: Queued[][] = [];
  private last: WireInput[] = [];
  private acks: number[] = [];
  private starved: number[] = [];
  /** Each seat's current epoch (see MatchStartMsg.epoch). */
  private epochs: number[] = [];
  private epochCount = 0;
  private rows: Array<{ tick: number; row: WireInput[] }> = [];
  private opsDue: Array<[number, number, number]> = [];
  private opsOut: Array<[number, number, number]> = [];
  private sum: [number, number] | undefined;
  private acc = 0;
  private timerEnd = -1;
  private continued = new Set<string>();
  private dirty = true;
  private lastLobbySend = 0;
  private resyncAt = new Map<string, number>();
  /** Every member removed: the host should close the room. */
  empty = false;

  constructor(
    readonly code: string,
    readonly version: string,
    private io: CoreIO,
    firstFaction = 0,
    /** Test settings: shorter races. */
    private opts: { laps?: number } = {},
  ) {
    this.lobby = createLobby(code, version, firstFaction);
  }

  private now(): number {
    return this.io.now();
  }

  // ---- people ---------------------------------------------------------------

  /**
   * Someone arrives. A device already in the room takes its seat back (a
   * reload, a dropped connection, the same room opened in another tab).
   */
  join(info: JoinInfo): JoinResult & { resumed?: boolean } {
    // Known by the device's private key, never by the public pid (which
    // everyone in the room is shown).
    const known = this.lobby.members.find((m) => m.deviceId === info.deviceId);
    if (known) {
      known.callsign = info.callsign || known.callsign;
      this.reconnect(known.pid);
      return { ok: true, member: known, resumed: true };
    }
    const midMatch = this.phase === 'race' || this.phase === 'results' || this.phase === 'final';
    const res = addMember(this.lobby, info, this.now(), midMatch);
    if (!res.ok) return res;
    this.io.send(info.pid, 'welcome', { pid: info.pid, code: this.code });
    if (this.phase === 'countdown') this.toLobbyPhase();
    this.dirty = true;
    return res;
  }

  /** Left on purpose: out of the room now; in a race the seat's computer pilot takes over. */
  leave(pid: string): void {
    const m = removeMember(this.lobby, pid);
    if (!m) return;
    this.continued.delete(pid);
    this.recomputeCallers(false);
    this.afterRemoval();
  }

  /** The connection dropped: the seat is kept for RECONNECT_SECONDS. */
  drop(pid: string): void {
    const m = member(this.lobby, pid);
    if (!m || !m.connected) return;
    m.connected = false;
    m.droppedAt = this.now();
    m.ready = false;
    if (this.lobby.host === pid) this.lobby.host = nextHost(this.lobby, pid) ?? pid;
    this.recomputeCallers(false);
    this.dirty = true;
  }

  /** Back again (the same device): the seat, and the race if one is under way. */
  reconnect(pid: string): void {
    const m = member(this.lobby, pid);
    if (!m) return;
    m.connected = true;
    m.droppedAt = -1;
    this.io.send(pid, 'welcome', { pid, code: this.code });
    const seat = this.seatPid.indexOf(pid);
    if (this.race && this.match && seat >= 0) {
      // Their inputs start over from a fresh count, in a new epoch: anything
      // still on its way from before the drop is ignored.
      this.queue[seat] = [];
      this.acks[seat] = 0;
      this.epochs[seat] = ++this.epochCount;
      this.last[seat] = packInput(emptyInput());
      this.recomputeCallers(true);
      this.sendMatchStart(pid, true);
    }
    this.dirty = true;
  }

  private afterRemoval(): void {
    if (this.lobby.members.length === 0) this.empty = true;
    if (this.phase === 'countdown' && !allReady(this.lobby)) this.toLobbyPhase();
    this.dirty = true;
  }

  // ---- messages ---------------------------------------------------------------

  message<K extends keyof ClientMessages>(pid: string, type: K, msg: ClientMessages[K]): void {
    const m = member(this.lobby, pid);
    if (!m) return;
    const inLobby = this.phase === 'lobby' || this.phase === 'countdown';
    const report = (o: Outcome) => {
      if (!o.ok) this.io.send(pid, 'notice', { text: o.text });
      this.dirty = true;
      if (this.phase === 'countdown' && !allReady(this.lobby)) this.toLobbyPhase();
    };
    const body = (msg ?? {}) as Record<string, unknown>;
    switch (type) {
      case 'input':
        this.onInput(pid, body as ClientMessages['input']);
        return;
      case 'ping': {
        const rtt = Number(body.rtt);
        if (Number.isFinite(rtt) && rtt >= 0) {
          const ms = Math.min(9999, Math.round(rtt));
          if (Math.abs(ms - m.ping) > 8) this.dirtyPing = true;
          m.ping = ms;
        }
        this.io.send(pid, 'pong', { t: Number(body.t) || 0 });
        return;
      }
      case 'pick':
        if (!inLobby) return;
        report(pickFrame(this.lobby, pid, Number(body.role) as Role));
        return;
      case 'team':
        if (!inLobby) return;
        report(switchTeam(this.lobby, pid, Number(body.side), body.role === undefined ? undefined : (Number(body.role) as Role)));
        return;
      case 'faction':
        if (!inLobby) return;
        report(setFaction(this.lobby, pid, Number(body.faction), body.side === undefined ? undefined : Number(body.side)));
        return;
      case 'caller': {
        if (!inLobby) return;
        const action = String(body.action) as ClientMessages['caller']['action'];
        const o = callerAction(this.lobby, pid, action);
        report(o);
        if (o.ok && action === 'ask' && o.note === 'asked') {
          const holder = callerOf(this.lobby, m.side);
          if (holder) this.io.send(holder.pid, 'callerAsk', { from: pid });
        }
        return;
      }
      case 'settings':
        if (!inLobby) return;
        report(setSettings(this.lobby, pid, body as ClientMessages['settings']));
        return;
      case 'ready':
        if (!inLobby) return;
        report(setReady(this.lobby, pid, !!body.ready));
        return;
      case 'start':
        if (!inLobby) return;
        if (this.lobby.host !== pid) return report({ ok: false, text: 'Only the host starts early' });
        if (!allReady(this.lobby)) return report({ ok: false, text: 'Not everyone is ready' });
        this.startMatch();
        return;
      case 'kick': {
        const target = String(body.pid);
        const o = kick(this.lobby, pid, target);
        report(o);
        if (!o.ok) return;
        this.io.send(target, 'error', { code: 'kicked', text: 'The host removed you from the room.' });
        this.io.disconnect?.(target, 'The host removed you from the room.');
        this.continued.delete(target);
        this.recomputeCallers(false);
        this.afterRemoval();
        return;
      }
      case 'continue':
        if (this.phase !== 'results' && this.phase !== 'final') return;
        this.continued.add(pid);
        this.dirty = true;
        return;
      case 'endMatch':
        if (this.lobby.host !== pid) return report({ ok: false, text: 'Only the host ends the match' });
        if (!inLobby) this.backToLobby('ended');
        return;
      case 'resync': {
        const at = this.resyncAt.get(pid) ?? -1e9;
        if (this.race && this.now() - at > 1000) {
          this.resyncAt.set(pid, this.now());
          this.io.send(pid, 'key', { race: this.race });
        }
        return;
      }
      case 'loadout': {
        const f = Number(body.faction);
        const r = Number(body.role);
        if (Number.isInteger(f) && f >= 0 && f < 5) m.loadout.faction = f;
        if (r === ROLE.FW || r === ROLE.MF || r === ROLE.DF) m.loadout.role = r;
        return;
      }
      default:
        return;
    }
  }
  private dirtyPing = false;

  private onInput(pid: string, msg: ClientMessages['input']): void {
    const seat = this.seatPid.indexOf(pid);
    if (seat < 0 || !this.race || !msg || !Array.isArray(msg.i)) return;
    // Inputs for an earlier start of play (before a reconnect): not this race's.
    if (Number(msg.e) !== this.epochs[seat]) return;
    const s0 = Math.floor(Number(msg.s));
    if (!Number.isFinite(s0) || s0 < 1) return;
    const q = this.queue[seat];
    const after = q.length ? q[q.length - 1].seq : this.acks[seat];
    for (let k = 0; k < msg.i.length && k < 120; k++) {
      const seq = s0 + k;
      if (seq <= after) continue;
      q.push({ seq, wire: cleanWire(msg.i[k]) });
    }
    while (q.length > QUEUE_HARD) q.shift();
  }

  // ---- the clock ------------------------------------------------------------------

  /** Call often (the server does, 60 times a second) with the milliseconds since the last call. */
  update(dtMs: number): void {
    const now = this.now();
    expireHolds(this.lobby, now);
    for (const m of [...this.lobby.members]) {
      if (!m.connected && m.droppedAt >= 0 && now - m.droppedAt > RECONNECT_SECONDS * 1000) {
        removeMember(this.lobby, m.pid);
        this.continued.delete(m.pid);
        this.recomputeCallers(false);
        this.afterRemoval();
      }
    }
    switch (this.phase) {
      case 'lobby':
        if (allReady(this.lobby)) {
          this.phase = 'countdown';
          this.timerEnd = now + READY_COUNTDOWN * 1000;
          this.dirty = true;
        }
        break;
      case 'countdown':
        if (!allReady(this.lobby)) this.toLobbyPhase();
        else if (now >= this.timerEnd) this.startMatch();
        break;
      case 'race': {
        this.acc += Math.max(0, Math.min(dtMs, 250));
        let n = 0;
        while (this.acc >= TICK_MS && n < 15 && this.phase === 'race') {
          this.stepOnce();
          this.acc -= TICK_MS;
          n++;
        }
        if (n === 15) this.acc = 0;
        break;
      }
      case 'results':
        if (now >= this.timerEnd || this.everyoneContinued()) this.nextRound();
        break;
      case 'final':
        if (now >= this.timerEnd || this.everyoneContinued()) this.backToLobby('over');
        break;
    }
    // The lobby goes out on any change, and every two seconds for the pings.
    if (this.dirtyPing && now - this.lastLobbySend > 2000) this.dirty = true;
    if (this.dirty || ((this.phase === 'countdown' || this.phase === 'results' || this.phase === 'final') && now - this.lastLobbySend > 1000)) this.sendLobby();
  }

  private toLobbyPhase(): void {
    this.phase = 'lobby';
    this.timerEnd = -1;
    this.dirty = true;
  }

  private everyoneContinued(): boolean {
    const racing = this.lobby.members.filter((m) => m.connected && m.side >= 0 && !m.nextRound);
    return racing.length > 0 && racing.every((m) => this.continued.has(m.pid));
  }

  sendLobby(): void {
    const timer = this.timerEnd > 0 ? Math.max(0, Math.ceil((this.timerEnd - this.now()) / 1000)) : -1;
    this.io.broadcast('lobby', lobbyView(this.lobby, this.phase, timer, this.match, [...this.continued]));
    this.dirty = false;
    this.dirtyPing = false;
    this.lastLobbySend = this.now();
  }

  // ---- the match --------------------------------------------------------------------

  private startMatch(): void {
    this.match = createMatch((MATCH_FORMATS[this.lobby.settings.match] ?? MATCH_FORMATS[0]).cfg);
    this.factions = [this.lobby.factions[0], this.lobby.factions[1]];
    // Frames as locked in (and anyone who had not locked in, around them).
    settleFrames(this.lobby);
    clearReady(this.lobby);
    this.startRound();
  }

  /** The grid for the next round: everyone in their frame, computer pilots in the rest. */
  private buildSeats(): SeatConfig[] {
    const skill = SKILL_VALUES[this.lobby.settings.skill] ?? SKILL_VALUES[1];
    const seats: SeatConfig[] = [];
    this.seatPid = [];
    // Late arrivals take frames nobody on their team has.
    settleFrames(this.lobby);
    for (const role of ROLES) {
      for (let team = 0; team < 2; team++) {
        const who = this.lobby.members.find((m) => m.side === team && m.role === role);
        seats.push({ team, role, human: !!who, name: who ? who.callsign : PILOT_NAMES[this.factions[team]][role], skill: who ? 0.6 : skill });
        this.seatPid.push(who ? who.pid : null);
      }
    }
    return seats;
  }

  private startRound(): void {
    if (!this.match) return;
    for (const m of this.lobby.members) m.nextRound = false;
    const round = this.match.rounds.length;
    const def = trackById(this.lobby.settings.track) ?? TRACKS[0];
    this.track = buildTrack(def);
    const seats = this.buildSeats();
    const seed = Math.floor(this.io.random() * 1e9);
    this.race = createRace(this.track, { seed, seats, gridFlip: round % 2 === 1, laps: this.opts.laps });
    this.queue = seats.map(() => []);
    this.acks = seats.map(() => 0);
    this.starved = seats.map(() => 0);
    this.epochs = seats.map(() => ++this.epochCount);
    this.last = this.seatPid.map((pid) => (pid && member(this.lobby, pid)?.connected ? packInput(emptyInput()) : 0));
    this.rows = [];
    this.opsDue = [];
    this.opsOut = [];
    this.sum = undefined;
    this.acc = 0;
    this.continued.clear();
    this.recomputeCallers(false, true);
    this.phase = 'race';
    this.timerEnd = -1;
    this.roundStart = { seed, seats, gridFlip: round % 2 === 1, round };
    this.io.log?.('round', round + 1, 'start', seats.filter((x) => x.human).length, 'people');
    for (const m of this.lobby.members) if (m.connected) this.sendMatchStart(m.pid, false);
    this.dirty = true;
  }
  private roundStart: { seed: number; seats: SeatConfig[]; gridFlip: boolean; round: number } | null = null;

  private sendMatchStart(pid: string, withKey: boolean): void {
    if (!this.race || !this.match || !this.roundStart) return;
    const rs = this.roundStart;
    this.io.send(pid, 'matchStart', {
      round: rs.round,
      seed: rs.seed,
      track: this.lobby.settings.track,
      seats: rs.seats,
      factions: [this.factions[0], this.factions[1]],
      gridFlip: rs.gridFlip,
      laps: this.opts.laps,
      seat: this.seatPid.indexOf(pid),
      callers: [this.race.teams[0].caller, this.race.teams[1].caller],
      epoch: this.epochs[this.seatPid.indexOf(pid)] ?? 0,
      match: this.match,
      key: withKey || this.race.tick > 0 ? this.race : null,
    });
  }

  /**
   * Who calls each team's tactics in the race, from who is there. Changes
   * go to the race (and to every client) before the next tick runs.
   */
  private recomputeCallers(reconnecting: boolean, atStart = false): void {
    const race = this.race;
    if (!race || this.phase === 'results' || this.phase === 'final') {
      if (!atStart) return;
    }
    if (!race) return;
    for (let team = 0; team < 2; team++) {
      const seatsOfTeam = race.mechs.filter((m) => m.team === team && m.human).map((m) => m.id);
      const present = seatsOfTeam.filter((id) => member(this.lobby, this.seatPid[id])?.connected);
      const cur = race.teams[team].caller;
      let v: number;
      if (seatsOfTeam.length === 0) v = CALLER.ANY;
      else if (present.length === 0) v = CALLER.CAPTAIN;
      else if (present.length === 3) v = CALLER.NONE;
      else if (present.length === 1) v = present[0];
      else if (atStart) {
        const pid = callerOf(this.lobby, team)?.pid;
        const id = pid ? this.seatPid.indexOf(pid) : -1;
        v = id >= 0 ? id : present[0];
      } else if (reconnecting && cur >= 0 && present.includes(cur)) v = cur;
      else if (cur >= 0 && present.includes(cur)) v = cur;
      else {
        // The one of the two who has been in the room longest.
        const order = present.map((id) => member(this.lobby, this.seatPid[id])!).sort((a, b) => a.joinedAt - b.joinedAt);
        v = this.seatPid.indexOf(order[0].pid);
      }
      if (atStart) race.teams[team].caller = v;
      else if (v !== cur) this.opsDue.push([race.tick + 1, team, v]);
    }
  }

  private stepOnce(): void {
    const race = this.race!;
    const track = this.track!;
    const t = race.tick + 1;
    for (const op of this.opsDue) {
      if (op[0] <= t) {
        op[0] = t;
        race.teams[op[1]].caller = op[2];
        this.opsOut.push(op);
      }
    }
    this.opsDue = this.opsDue.filter((op) => op[0] > t);
    const row: WireInput[] = [];
    const inputs = race.mechs.map((m) => {
      const pid = this.seatPid[m.id];
      if (!pid) {
        row.push(0);
        return null;
      }
      const who = member(this.lobby, pid);
      if (!who || !who.connected) {
        row.push(0);
        return null;
      }
      const q = this.queue[m.id];
      while (q.length > QUEUE_SOFT) fold(q);
      const next = q.shift();
      if (next) {
        this.last[m.id] = next.wire;
        this.acks[m.id] = next.seq;
        this.starved[m.id] = 0;
      } else {
        this.starved[m.id] = (this.starved[m.id] ?? 0) + 1;
      }
      // Inputs stopped coming (a hidden tab, a stalled connection): the
      // computer pilot flies until they start again.
      const wire = this.starved[m.id] > STARVED_TICKS ? 0 : this.last[m.id];
      const auto = wire === 0;
      if (auto !== who.autopilot) {
        who.autopilot = auto;
        this.dirty = true;
      }
      row.push(wire);
      return unpackInput(wire);
    });
    stepRace(race, track, inputs);
    this.rows.push({ tick: t, row });
    if (t % CHECKSUM_TICKS === 0) this.sum = [t, raceChecksum(race)];
    const ended = race.events.some((e) => e.type === 'raceEnd') || race.phase === PHASE.FINISHED;
    if (t % TICKS_PER_PACKET === 0 || ended) this.flush();
    if (t % KEYFRAME_TICKS === 0) this.io.broadcast('key', { race });
    if (ended) this.endRound();
  }

  private flush(): void {
    if (!this.rows.length) return;
    const a: Record<number, number> = {};
    this.seatPid.forEach((pid, seat) => {
      if (pid) a[seat] = this.acks[seat];
    });
    const msg: TickMsg = { t: this.rows[0].tick, i: this.rows.map((r) => r.row), a };
    if (this.opsOut.length) msg.ops = this.opsOut;
    if (this.sum) msg.sum = this.sum;
    this.io.broadcast('tick', msg);
    this.rows = [];
    this.opsOut = [];
    this.sum = undefined;
  }

  private endRound(): void {
    if (!this.race || !this.match) return;
    const result = recordRound(this.match, this.race);
    this.io.log?.('round', result.round, 'points', result.points.join('-'), 'winner', result.winner, 'tick', this.race.tick);
    this.io.broadcast('roundEnd', { round: result, match: this.match });
    const over = this.match.winner >= 0;
    this.phase = over ? 'final' : 'results';
    this.timerEnd = this.now() + (over ? FINAL_SECONDS : RESULTS_SECONDS) * 1000;
    this.continued.clear();
    this.dirty = true;
  }

  private nextRound(): void {
    this.startRound();
  }

  private backToLobby(reason: 'over' | 'ended'): void {
    this.phase = 'lobby';
    this.race = null;
    this.track = null;
    this.match = null;
    this.seatPid = [];
    this.timerEnd = -1;
    this.continued.clear();
    clearReady(this.lobby);
    for (const m of this.lobby.members) {
      m.nextRound = false;
      m.autopilot = false;
    }
    this.io.broadcast('lobbyAgain', { reason });
    this.dirty = true;
  }
}

/** An input off the wire, checked: anything out of range becomes no input at all. */
export function cleanWire(w: unknown): WireInput {
  if (!Array.isArray(w) || w.length < 6) return 0;
  const n = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : 0);
  return [n(w[0], -127, 127), n(w[1], -127, 127), n(w[2], 0, 255), n(w[3], 0, 255), (n(w[4], 0, 0x7fffffff) & BTN_MASK) >>> 0, n(w[5], 0, 4)];
}

/** Fold the two oldest queued inputs into one: the later stick, either one's presses. */
function fold(q: Queued[]): void {
  const [a, b] = q;
  if (a.wire && b.wire) {
    b.wire = [b.wire[0], b.wire[1], b.wire[2], b.wire[3], (b.wire[4] | a.wire[4]) >>> 0, b.wire[5] || a.wire[5]];
  }
  q.shift();
}

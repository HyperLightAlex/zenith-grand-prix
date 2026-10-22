// The connection to the game server: the room you are in and your squad.
// Built on the Colyseus client; everything above this file sees plain
// messages and events.

import { Client, type Room } from '@colyseus/sdk';
import { JOIN_TIMEOUT_SECONDS, NET_PROTOCOL, VIEW_RETRY_SECONDS, type GpRequest, type JoinOptions, type LobbyView, type Loadout, type ServerMessages, type SquadServerMessages, type SquadTicket, type SquadView } from '../../net/protocol';
import { callsign, customLook, deviceId, pilotColour, portrait, readResume, seatLook, writeResume } from './identity';

export interface OnlineEvents {
  lobby: LobbyView;
  matchStart: ServerMessages['matchStart'];
  tick: ServerMessages['tick'];
  key: ServerMessages['key'];
  roundEnd: ServerMessages['roundEnd'];
  lobbyAgain: ServerMessages['lobbyAgain'];
  callerAsk: ServerMessages['callerAsk'];
  notice: { text: string };
  error: { code: string; text: string };
  /** You are out of the room (left, removed, or it closed). */
  roomLeft: { text: string | null };
  /** The connection to the room dropped; the client is trying to get it back. */
  drop: Record<string, never>;
  reconnect: Record<string, never>;
  squad: SquadView;
  follow: SquadServerMessages['follow'];
  squadLeft: { text: string | null };
}

type Handler<K extends keyof OnlineEvents> = (msg: OnlineEvents[K]) => void;

/** Where the server is: ?server=, else the page's own address (the dev server's port 8090 in development). */
export function serverEndpoint(): string | null {
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q;
  if (location.protocol === 'file:') return null;
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:8090`;
  // Served below a path (example.com/zenith/): the server is there too.
  const dir = location.pathname.replace(/\/[^/]*$/, '');
  return location.origin + dir;
}

const TIMED_OUT = 'The room is not answering. Try joining again in a moment.';

/**
 * A create or join that gives up after JOIN_TIMEOUT_SECONDS rather than wait
 * for ever; if it gets in after all, it leaves again.
 */
function inTime(join: Promise<Room>): Promise<Room> {
  return new Promise((ok, fail) => {
    let done = false;
    const timer = window.setTimeout(() => {
      done = true;
      fail(new Error(TIMED_OUT));
    }, JOIN_TIMEOUT_SECONDS * 1000);
    join.then(
      (room) => {
        window.clearTimeout(timer);
        if (done) void room.leave(true).catch(() => {});
        else ok(room);
      },
      (err) => {
        window.clearTimeout(timer);
        if (!done) fail(err);
      },
    );
  });
}

/** A failed create or join, in words a player can act on. */
export function failure(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : String((e as { message?: string })?.message ?? e);
  if (/not found|does not exist|no rooms? (found|available)/i.test(msg)) return 'No room with that code. Check it and try again.';
  if (/locked|maxClients|is full/i.test(msg)) return 'Room full';
  if (/fetch|network|ECONNREFUSED|Failed to|NetworkError|load failed/i.test(msg)) return "Can't reach the game server. Check your connection and try again.";
  if (/Too many/i.test(msg)) return 'Too many room codes tried. Wait a minute.';
  return msg || 'Something went wrong.';
}

export class Online {
  readonly endpoint: string | null;
  private client: Client | null = null;
  room: Room | null = null;
  squad: Room | null = null;
  pid = '';
  squadPid = '';
  lobby: LobbyView | null = null;
  squadView: SquadView | null = null;
  /** Round trip to the server, ms. */
  rtt = 0;
  /** The room's connection has dropped and is being retried. */
  dropped = false;
  private handlers = new Map<string, Set<(msg: never) => void>>();
  private pinger = 0;

  constructor() {
    this.endpoint = serverEndpoint();
  }

  get available(): boolean {
    return this.endpoint !== null;
  }

  private sdk(): Client {
    if (!this.client) this.client = new Client(this.endpoint ?? location.origin);
    return this.client;
  }

  on<K extends keyof OnlineEvents>(type: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as (msg: never) => void);
    return () => set!.delete(fn as (msg: never) => void);
  }

  private emit<K extends keyof OnlineEvents>(type: K, msg: OnlineEvents[K]): void {
    for (const fn of this.handlers.get(type) ?? []) (fn as Handler<K>)(msg);
  }

  private options(loadout: Loadout, squad?: SquadTicket): JoinOptions {
    return { version: typeof __BUILD__ === 'string' ? __BUILD__ : 'dev', protocol: NET_PROTOCOL, callsign: callsign(), portrait: portrait(), looks: [seatLook(0), seatLook(1), seatLook(2)], colour: pilotColour(), sprint: customLook(0), deviceId: deviceId(), loadout, squad };
  }

  // ---- rooms -------------------------------------------------------------------

  /** A new room, with you as host; `gp`: your squad's Grand Prix. */
  async createRoom(loadout: Loadout, squad?: SquadTicket, gp?: GpRequest): Promise<void> {
    await this.leaveRoom();
    this.attachRoom(await inTime(this.sdk().create('race', { ...this.options(loadout, squad), gp })));
  }

  async joinRoom(code: string, loadout: Loadout, squad?: SquadTicket): Promise<void> {
    if (this.room && this.room.roomId === code) return;
    // Already on the way into it (a follow and a link at once): the same join.
    if (this.joining?.code === code) return this.joining.done;
    await this.leaveRoom();
    const done = (async () => {
      this.attachRoom(await inTime(this.sdk().joinById(code, this.options(loadout, squad))));
    })();
    this.joining = { code, done };
    try {
      await done;
    } finally {
      if (this.joining?.done === done) this.joining = null;
    }
  }
  private joining: { code: string; done: Promise<void> } | null = null;
  /** Waiting for the room's view after joining: ask again, then give up. */
  private viewWait = 0;

  private attachRoom(room: Room): void {
    // Only ever one: anything still connected is left.
    if (this.room && this.room !== room) void this.room.leave(true).catch(() => {});
    this.room = room;
    this.dropped = false;
    this.lobby = null;
    // Nothing from a room you have moved on from counts.
    const mine = () => this.room === room;
    const resume = readResume();
    resume.room = { code: room.roomId, token: room.reconnectionToken };
    writeResume(resume);
    room.onMessage('welcome', (m: ServerMessages['welcome']) => {
      if (mine()) this.pid = m.pid;
    });
    room.onMessage('lobby', (v: LobbyView) => {
      if (!mine()) return;
      this.lobby = v;
      window.clearInterval(this.viewWait);
      this.emit('lobby', v);
    });
    // The room's view comes straight after joining. If it has not come (a
    // message lost, or a server too busy to send it), ask again now and then,
    // and in the end give up and say so rather than wait for ever.
    window.clearInterval(this.viewWait);
    const joinedAt = performance.now();
    this.viewWait = window.setInterval(() => {
      if (this.room !== room || this.lobby) return window.clearInterval(this.viewWait);
      if (performance.now() - joinedAt > JOIN_TIMEOUT_SECONDS * 1000) {
        window.clearInterval(this.viewWait);
        this.room = null;
        const r = readResume();
        delete r.room;
        writeResume(r);
        void room.leave(true).catch(() => {});
        this.emit('roomLeft', { text: TIMED_OUT });
        return;
      }
      room.send('view', {});
    }, VIEW_RETRY_SECONDS * 1000);
    room.onMessage('pong', (m: { t: number }) => {
      this.rtt = Math.max(0, performance.now() - m.t);
    });
    room.onMessage('error', (m: { code: string; text: string }) => mine() && this.emit('error', m));
    for (const t of ['matchStart', 'tick', 'key', 'roundEnd', 'lobbyAgain', 'callerAsk', 'notice'] as const) {
      room.onMessage(t, (m: never) => mine() && this.emit(t, m));
    }
    room.onDrop(() => {
      if (!mine()) return;
      this.dropped = true;
      this.emit('drop', {});
    });
    room.onReconnect(() => {
      if (!mine()) return;
      this.dropped = false;
      const r = readResume();
      r.room = { code: room.roomId, token: room.reconnectionToken };
      writeResume(r);
      this.emit('reconnect', {});
    });
    room.onLeave((code: number, reason?: string) => {
      if (this.room !== room) return;
      this.room = null;
      this.lobby = null;
      this.dropped = false;
      this.home();
      const r = readResume();
      delete r.room;
      writeResume(r);
      // 1000: left on purpose.
      this.emit('roomLeft', { text: code === 1000 ? null : reason || 'You lost the connection to the room.' });
    });
    window.clearInterval(this.pinger);
    this.pinger = window.setInterval(() => this.ping(), 2000);
    this.ping();
  }

  private ping(): void {
    const t = performance.now();
    this.room?.send('ping', { t, rtt: Math.round(this.rtt) });
    this.squad?.send('ping', { t, rtt: Math.round(this.rtt) });
  }

  sendRoom(type: string, msg: unknown = {}): void {
    this.room?.send(type, msg);
  }

  async leaveRoom(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.room = null;
    this.lobby = null;
    this.home();
    const r = readResume();
    delete r.room;
    writeResume(r);
    try {
      await room.leave(true);
    } catch {
      /* already gone */
    }
  }

  // ---- squads ------------------------------------------------------------------
  //
  // One squad operation at a time. Opening Online makes you a squad of one in
  // the background, and joining a friend's squad (a link, a code) can come
  // while that is still on its way: run together, the second to finish won,
  // which could leave you in a squad of your own while your friends' squad
  // still showed you, connected, for ever. Queued, a join waits for the
  // squad of one and then leaves it.

  private squadOps: Promise<unknown> = Promise.resolve();
  private squadViewWait = 0;
  private queueSquad<T>(op: () => Promise<T>): Promise<T> {
    const run = this.squadOps.then(op, op);
    this.squadOps = run.catch(() => {});
    return run;
  }

  /** A squad of your own, unless you are in one by the time it is your turn. */
  createSquad(loadout: Loadout): Promise<void> {
    return this.queueSquad(async () => {
      if (this.squad) return;
      this.attachSquad(await inTime(this.sdk().create('squad', this.options(loadout))));
    });
  }

  joinSquad(code: string, loadout: Loadout): Promise<void> {
    return this.queueSquad(() => this.joinSquadNow(code, loadout));
  }

  private async joinSquadNow(code: string, loadout: Loadout): Promise<void> {
    if (this.squad && this.squad.roomId === code) return;
    const next = await inTime(this.sdk().joinById(code, this.options(loadout)));
    // Listening to the new squad straight away (its welcome and first view
    // come at once), and the old one left after: waiting to leave it first
    // lost them on a real connection, and the squad showed nothing until it
    // next changed.
    this.attachSquad(next);
  }

  private attachSquad(room: Room): void {
    // Only ever one: anything still connected is left.
    if (this.squad && this.squad !== room) void this.squad.leave(true).catch(() => {});
    window.clearInterval(this.squadViewWait);
    this.squad = room;
    this.squadView = null;
    const resume = readResume();
    resume.squad = { code: room.roomId, token: room.reconnectionToken };
    writeResume(resume);
    // Nothing from a squad you have moved on from counts.
    const mine = () => this.squad === room;
    room.onMessage('welcome', (m: { pid: string }) => {
      if (mine()) this.squadPid = m.pid;
    });
    room.onMessage('squad', (v: SquadView) => {
      if (!mine()) return;
      this.squadView = v;
      window.clearInterval(this.squadViewWait);
      this.emit('squad', v);
    });
    // As with a room: if the squad's view has not come, ask for it again.
    this.squadViewWait = window.setInterval(() => {
      if (!mine() || this.squadView) return window.clearInterval(this.squadViewWait);
      room.send('view', {});
    }, VIEW_RETRY_SECONDS * 1000);
    room.onMessage('follow', (m: SquadServerMessages['follow']) => mine() && this.emit('follow', m));
    room.onMessage('notice', (m: { text: string }) => mine() && this.emit('notice', m));
    room.onMessage('error', (m: { code: string; text: string }) => mine() && this.emit('error', m));
    room.onMessage('pong', () => {});
    room.onLeave((code: number, reason?: string) => {
      if (!mine()) return;
      this.squad = null;
      this.squadView = null;
      const r = readResume();
      delete r.squad;
      writeResume(r);
      this.emit('squadLeft', { text: code === 1000 ? null : reason || 'You lost the connection to your squad.' });
    });
    if (!this.pinger) this.pinger = window.setInterval(() => this.ping(), 2000);
  }

  sendSquad(type: string, msg: unknown = {}): void {
    this.squad?.send(type, msg);
  }

  /** Out of a room: if you lead a squad, it no longer takes newcomers to it. */
  private home(): void {
    if (this.squad && this.squadView && this.squadView.members.length > 0 && this.leading) this.squad.send('home', {});
  }

  leaveSquad(): Promise<void> {
    return this.queueSquad(() => this.leaveSquadNow());
  }

  private async leaveSquadNow(): Promise<void> {
    const room = this.squad;
    if (!room) return;
    this.squad = null;
    this.squadView = null;
    const r = readResume();
    delete r.squad;
    writeResume(r);
    try {
      await room.leave(true);
    } catch {
      /* already gone */
    }
  }

  /** Whether you lead your squad (a squad of one is led by you). */
  get leading(): boolean {
    return !this.squadView || this.squadView.leader === this.squadPid;
  }

  get squadSize(): number {
    return this.squadView?.members.length ?? 1;
  }

  /** After a reload: back into the room and squad this tab was in, if they are still there. */
  async resume(loadout: Loadout): Promise<boolean> {
    const r = readResume();
    let back = false;
    if (r.squad) {
      const squad = r.squad;
      await this.queueSquad(async () => {
        try {
          this.attachSquad(await inTime(this.sdk().reconnect(squad.token)));
        } catch {
          try {
            await this.joinSquadNow(squad.code, loadout);
          } catch {
            delete r.squad;
          }
        }
      });
    }
    if (r.room) {
      try {
        this.attachRoom(await inTime(this.sdk().reconnect(r.room.token)));
        back = true;
      } catch {
        try {
          await this.joinRoom(r.room.code, loadout);
          back = true;
        } catch {
          const now = readResume();
          delete now.room;
          writeResume(now);
        }
      }
    }
    return back;
  }

  /** The invite link for a room or squad code: this page's address with ?room= or ?squad=. */
  link(kind: 'room' | 'squad', code: string): string {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set(kind, code);
    return u.toString();
  }
}

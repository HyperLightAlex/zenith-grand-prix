// The connection to the game server: the room you are in and your squad.
// Built on the Colyseus client; everything above this file sees plain
// messages and events.

import { Client, type Room } from '@colyseus/sdk';
import { NET_PROTOCOL, type JoinOptions, type LobbyView, type Loadout, type ServerMessages, type SquadServerMessages, type SquadTicket, type SquadView } from '../../net/protocol';
import { callsign, deviceId, readResume, writeResume } from './identity';

export interface OnlineEvents {
  lobby: LobbyView;
  matchStart: ServerMessages['matchStart'];
  tick: ServerMessages['tick'];
  key: ServerMessages['key'];
  roundEnd: ServerMessages['roundEnd'];
  lobbyAgain: ServerMessages['lobbyAgain'];
  swapAsk: ServerMessages['swapAsk'];
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
    return { version: typeof __BUILD__ === 'string' ? __BUILD__ : 'dev', protocol: NET_PROTOCOL, callsign: callsign(), deviceId: deviceId(), loadout, squad };
  }

  // ---- rooms -------------------------------------------------------------------

  async createRoom(loadout: Loadout, squad?: SquadTicket): Promise<void> {
    await this.leaveRoom();
    this.attachRoom(await this.sdk().create('race', this.options(loadout, squad)));
  }

  async joinRoom(code: string, loadout: Loadout, squad?: SquadTicket): Promise<void> {
    if (this.room && this.room.roomId === code) return;
    await this.leaveRoom();
    this.attachRoom(await this.sdk().joinById(code, this.options(loadout, squad)));
  }

  private attachRoom(room: Room): void {
    this.room = room;
    this.dropped = false;
    this.lobby = null;
    const resume = readResume();
    resume.room = { code: room.roomId, token: room.reconnectionToken };
    writeResume(resume);
    room.onMessage('welcome', (m: ServerMessages['welcome']) => {
      this.pid = m.pid;
    });
    room.onMessage('lobby', (v: LobbyView) => {
      this.lobby = v;
      this.emit('lobby', v);
    });
    room.onMessage('pong', (m: { t: number }) => {
      this.rtt = Math.max(0, performance.now() - m.t);
    });
    room.onMessage('error', (m: { code: string; text: string }) => this.emit('error', m));
    for (const t of ['matchStart', 'tick', 'key', 'roundEnd', 'lobbyAgain', 'swapAsk', 'callerAsk', 'notice'] as const) {
      room.onMessage(t, (m: never) => this.emit(t, m));
    }
    room.onDrop(() => {
      this.dropped = true;
      this.emit('drop', {});
    });
    room.onReconnect(() => {
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

  async createSquad(loadout: Loadout): Promise<void> {
    await this.leaveSquad();
    this.attachSquad(await this.sdk().create('squad', this.options(loadout)));
  }

  async joinSquad(code: string, loadout: Loadout): Promise<void> {
    if (this.squad && this.squad.roomId === code) return;
    const next = await this.sdk().joinById(code, this.options(loadout));
    await this.leaveSquad();
    this.attachSquad(next);
  }

  private attachSquad(room: Room): void {
    this.squad = room;
    const resume = readResume();
    resume.squad = { code: room.roomId, token: room.reconnectionToken };
    writeResume(resume);
    room.onMessage('welcome', (m: { pid: string }) => {
      this.squadPid = m.pid;
    });
    room.onMessage('squad', (v: SquadView) => {
      this.squadView = v;
      this.emit('squad', v);
    });
    room.onMessage('follow', (m: SquadServerMessages['follow']) => this.emit('follow', m));
    room.onMessage('notice', (m: { text: string }) => this.emit('notice', m));
    room.onMessage('error', (m: { code: string; text: string }) => this.emit('error', m));
    room.onMessage('pong', () => {});
    room.onLeave((code: number, reason?: string) => {
      if (this.squad !== room) return;
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

  async leaveSquad(): Promise<void> {
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
      try {
        this.attachSquad(await this.sdk().reconnect(r.squad.token));
      } catch {
        try {
          await this.joinSquad(r.squad.code, loadout);
        } catch {
          delete r.squad;
        }
      }
    }
    if (r.room) {
      try {
        this.attachRoom(await this.sdk().reconnect(r.room.token));
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

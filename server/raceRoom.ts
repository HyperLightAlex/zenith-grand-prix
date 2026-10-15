// The Colyseus room around RoomCore: it maps connections to people and
// passes everything else straight through.

import crypto from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import { RoomCore } from '../src/net/roomCore';
import { NET_PROTOCOL, RECONNECT_SECONDS, callsignProblem, cleanCallsign, versionText, type ClientMessages, type JoinOptions } from '../src/net/protocol';
import { claimCode, releaseCode } from './codes';
import { log } from './log';
import { TEST_LAPS } from './config';

export const ERR = { VERSION: 4100, BAD: 4101, REFUSED: 4102 } as const;

/** The build the server is serving ('dev' when it is not serving one). */
export let SERVER_BUILD = 'dev';
export function setServerBuild(b: string): void {
  SERVER_BUILD = b;
}

/** Reject a create or join that cannot go ahead: a different build, or options that make no sense. */
export function checkOptions(options: Partial<JoinOptions> | undefined, roomVersion: string | null): void {
  const o = options ?? {};
  if (o.protocol !== NET_PROTOCOL || typeof o.version !== 'string') throw new ServerError(ERR.VERSION, 'This game is out of date: reload the page.');
  if (SERVER_BUILD !== 'dev' && o.version !== SERVER_BUILD && o.version !== 'dev') throw new ServerError(ERR.VERSION, 'The game has been updated: reload the page.');
  if (roomVersion !== null && o.version !== roomVersion) throw new ServerError(ERR.VERSION, versionText(roomVersion, o.version));
  if (typeof o.deviceId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(o.deviceId)) throw new ServerError(ERR.BAD, 'Bad request');
  const name = cleanCallsign(String(o.callsign ?? ''));
  const problem = callsignProblem(name);
  if (problem) throw new ServerError(ERR.BAD, `Callsign: ${problem}`);
}

export class RaceRoom extends Room {
  override maxClients = 16;
  private core!: RoomCore;
  /** sessionId to pid, and pid to the connection that holds the seat now. */
  private pidOf = new Map<string, string>();
  private holder = new Map<string, Client>();

  override onCreate(options: JoinOptions): void {
    const code = claimCode();
    this.roomId = code;
    void this.setPrivate(true);
    // A slow phone can take a while to open its connection after the code is accepted.
    this.seatReservationTimeout = 30;
    const version = typeof options?.version === 'string' ? options.version : SERVER_BUILD;
    this.core = new RoomCore(code, version, {
      send: (pid, type, msg) => this.holder.get(pid)?.send(type, msg),
      broadcast: (type, msg) => this.broadcast(type, msg),
      now: () => Date.now(),
      random: () => crypto.randomInt(0, 1 << 30) / (1 << 30),
      log: (...a) => log('room', code, ...a),
      disconnect: (pid, text) => {
        const c = this.holder.get(pid);
        this.holder.delete(pid);
        if (c) {
          this.pidOf.delete(c.sessionId);
          c.leave(4001, text);
        }
      },
    }, Number(options?.loadout?.faction) || 0, { laps: TEST_LAPS });
    this.setSimulationInterval((dt) => {
      this.core.update(dt);
      if (this.core.empty && this.clients.length === 0) void this.disconnect();
    }, 1000 / 60);
    this.onMessage('*', (client, type, msg) => {
      const pid = this.pidOf.get(client.sessionId);
      if (pid && typeof type === 'string') this.core.message(pid, type as keyof ClientMessages, msg as never);
    });
    log('room', code, 'created');
  }

  override onAuth(_client: Client, options: JoinOptions): boolean {
    checkOptions(options, this.core.version);
    return true;
  }

  override onJoin(client: Client, options: JoinOptions): void {
    const existing = this.core.lobby.members.find((m) => m.deviceId === options.deviceId);
    const pid = existing?.pid ?? crypto.randomBytes(6).toString('base64url');
    // The same device, connected again (a reload, another tab): the newest connection holds the seat.
    const old = this.holder.get(pid);
    if (old && old !== client) {
      old.send('error', { code: 'replaced', text: 'You opened this room somewhere else.' });
      this.pidOf.delete(old.sessionId);
      old.leave(4000, 'You opened this room somewhere else.');
    }
    // Registered before the core hears of them: it greets them straight away.
    const before = this.holder.get(pid);
    this.holder.set(pid, client);
    const res = this.core.join({
      pid,
      deviceId: options.deviceId,
      callsign: cleanCallsign(options.callsign),
      loadout: options.loadout,
      squad: options.squad && typeof options.squad.id === 'string' ? { id: options.squad.id.slice(0, 8), size: Math.max(1, Math.min(3, Number(options.squad.size) | 0)), follow: options.squad.follow === true } : undefined,
    });
    if (!res.ok) {
      if (before) this.holder.set(pid, before);
      else this.holder.delete(pid);
      throw new ServerError(ERR.REFUSED, res.text);
    }
    this.pidOf.set(client.sessionId, pid);
    log('room', this.roomId, existing ? 'back' : 'join', pid, this.core.lobby.members.length);
  }

  override onDrop(client: Client): void {
    const pid = this.pidOf.get(client.sessionId);
    if (!pid || this.holder.get(pid) !== client) return;
    // Rejected when the client never finished joining: nothing to wait for.
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
    this.core.drop(pid);
    log('room', this.roomId, 'drop', pid);
  }

  override onReconnect(client: Client): void {
    const pid = this.pidOf.get(client.sessionId);
    // Back too late (their seat was given up) or removed meanwhile: out.
    if (!pid || !this.core.lobby.members.some((m) => m.pid === pid)) {
      this.pidOf.delete(client.sessionId);
      client.leave(4001, 'You are no longer in this room.');
      return;
    }
    this.holder.set(pid, client);
    this.core.reconnect(pid);
    log('room', this.roomId, 'reconnect', pid);
  }

  override onLeave(client: Client): void {
    const pid = this.pidOf.get(client.sessionId);
    this.pidOf.delete(client.sessionId);
    if (!pid || this.holder.get(pid) !== client) return;
    this.holder.delete(pid);
    this.core.leave(pid);
    log('room', this.roomId, 'leave', pid);
  }

  override onDispose(): void {
    releaseCode(this.roomId);
    log('room', this.roomId, 'closed');
  }
}

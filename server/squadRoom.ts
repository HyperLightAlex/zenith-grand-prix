// The Colyseus room around SquadCore.

import crypto from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import { SquadCore } from '../src/net/squadCore';
import { RECONNECT_SECONDS, cleanCallsign, cleanPortrait, type JoinOptions } from '../src/net/protocol';
import { claimCode, releaseCode } from './codes';
import { ERR, checkOptions } from './raceRoom';
import { log } from './log';

export class SquadRoom extends Room {
  override maxClients = 8;
  private core!: SquadCore;
  private pidOf = new Map<string, string>();
  private holder = new Map<string, Client>();
  private devices = new Map<string, string>();

  override onCreate(): void {
    const code = claimCode();
    this.roomId = code;
    void this.setPrivate(true);
    // A slow phone can take a while to open its connection after the code is accepted.
    this.seatReservationTimeout = 30;
    this.core = new SquadCore(code, {
      send: (pid, type, msg) => this.holder.get(pid)?.send(type, msg),
      broadcast: (type, msg) => this.broadcast(type, msg),
      now: () => Date.now(),
      disconnect: (pid, text) => {
        const c = this.holder.get(pid);
        this.holder.delete(pid);
        if (c) {
          this.pidOf.delete(c.sessionId);
          c.leave(4001, text);
        }
      },
    });
    this.setSimulationInterval(() => {
      this.core.update();
      if (this.core.empty && this.clients.length === 0) void this.disconnect();
    }, 200);
    this.onMessage('*', (client, type, msg) => {
      const pid = this.pidOf.get(client.sessionId);
      if (pid && typeof type === 'string') this.core.message(pid, type, (msg ?? {}) as Record<string, unknown>);
    });
    log('squad', code, 'created');
  }

  override onAuth(_client: Client, options: JoinOptions): boolean {
    checkOptions(options, null);
    return true;
  }

  override onJoin(client: Client, options: JoinOptions): void {
    const pid = this.devices.get(options.deviceId) ?? crypto.randomBytes(6).toString('base64url');
    const old = this.holder.get(pid);
    if (old && old !== client) {
      this.pidOf.delete(old.sessionId);
      old.leave(4000, 'You opened your squad somewhere else.');
    }
    this.holder.set(pid, client);
    const res = this.core.join(pid, cleanCallsign(options.callsign), options.loadout, cleanPortrait(options.portrait));
    if (!res.ok) {
      this.holder.delete(pid);
      throw new ServerError(ERR.REFUSED, res.text);
    }
    this.devices.set(options.deviceId, pid);
    this.pidOf.set(client.sessionId, pid);
  }

  override onDrop(client: Client): void {
    const pid = this.pidOf.get(client.sessionId);
    if (!pid || this.holder.get(pid) !== client) return;
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
    this.core.drop(pid);
  }

  override onReconnect(client: Client): void {
    const pid = this.pidOf.get(client.sessionId);
    if (!pid || !this.core.members.some((m) => m.pid === pid)) {
      this.pidOf.delete(client.sessionId);
      client.leave(4001, 'You are no longer in this squad.');
      return;
    }
    this.holder.set(pid, client);
    this.core.join(pid, '', { faction: 0, role: 0 });
  }

  override onLeave(client: Client): void {
    const pid = this.pidOf.get(client.sessionId);
    this.pidOf.delete(client.sessionId);
    if (!pid || this.holder.get(pid) !== client) return;
    this.holder.delete(pid);
    this.core.leave(pid);
  }

  override onDispose(): void {
    releaseCode(this.roomId);
    log('squad', this.roomId, 'closed');
  }
}

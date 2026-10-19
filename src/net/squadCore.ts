// A squad: up to three people who stay together from room to room and always
// take the same team. The leader picks the faction and takes everyone into
// rooms; members follow without being asked. Everyone picks whatever frame
// they like here (two of a frame is shown, not refused): in a room, Ready
// locks frames in and sorts it out. Like the room, it knows nothing of
// sockets (server/squadRoom.ts wraps it).

import { ROLE, type Role } from '../sim/index';
import { RECONNECT_SECONDS, SQUAD_SIZE, type Loadout, type SquadServerMessages, type SquadView } from './protocol';

export interface SquadIO {
  send<K extends keyof SquadServerMessages>(pid: string, type: K, msg: SquadServerMessages[K]): void;
  broadcast<K extends keyof SquadServerMessages>(type: K, msg: SquadServerMessages[K]): void;
  now(): number;
  /** Close someone's connection (the leader removed them), with the reason they are shown. */
  disconnect?(pid: string, text: string): void;
}

interface Person {
  pid: string;
  callsign: string;
  loadout: Loadout;
  connected: boolean;
  joinedAt: number;
  droppedAt: number;
}

const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];

export class SquadCore {
  members: Person[] = [];
  leader: string | null = null;
  /** The room the leader is in, so someone joining the squad later can follow them in. */
  room: string | null = null;
  /** New members to send after the leader, once they have the squad's view. */
  private toFollow = new Set<string>();
  private arrivals = 0;
  private dirty = true;
  empty = false;

  constructor(
    readonly code: string,
    private io: SquadIO,
  ) {}

  join(pid: string, callsign: string, loadout: Loadout): { ok: true } | { ok: false; text: string } {
    const known = this.members.find((m) => m.pid === pid);
    if (known) {
      known.connected = true;
      known.droppedAt = -1;
      known.callsign = callsign || known.callsign;
      this.io.send(pid, 'welcome', { pid, code: this.code });
      this.dirty = true;
      return { ok: true };
    }
    if (this.members.length >= SQUAD_SIZE) return { ok: false, text: 'That squad is full' };
    const role = ROLES.includes(loadout?.role) ? loadout.role : ROLE.FW;
    const faction = Number.isInteger(loadout?.faction) && loadout.faction >= 0 && loadout.faction < 5 ? loadout.faction : 0;
    this.members.push({ pid, callsign, loadout: { faction, role }, connected: true, joinedAt: ++this.arrivals, droppedAt: -1 });
    if (!this.leader) this.leader = pid;
    else if (this.room) this.toFollow.add(pid);
    this.io.send(pid, 'welcome', { pid, code: this.code });
    this.dirty = true;
    return { ok: true };
  }

  leave(pid: string): void {
    const i = this.members.findIndex((m) => m.pid === pid);
    if (i < 0) return;
    this.members.splice(i, 1);
    this.toFollow.delete(pid);
    if (this.leader === pid) {
      this.leader = this.longest();
      this.room = null;
    }
    if (!this.members.length) this.empty = true;
    this.dirty = true;
  }

  drop(pid: string): void {
    const m = this.members.find((x) => x.pid === pid);
    if (!m) return;
    m.connected = false;
    m.droppedAt = this.io.now();
    this.dirty = true;
  }

  private longest(): string | null {
    const order = [...this.members].sort((a, b) => a.joinedAt - b.joinedAt);
    return (order.find((m) => m.connected) ?? order[0])?.pid ?? null;
  }

  message(pid: string, type: string, msg: Record<string, unknown>): void {
    const me = this.members.find((m) => m.pid === pid);
    if (!me) return;
    const lead = this.leader === pid;
    switch (type) {
      case 'loadout': {
        const r = Number(msg.role) as Role;
        const f = Number(msg.faction);
        if (ROLES.includes(r)) me.loadout.role = r;
        // Only the leader's faction counts: the squad is one team.
        if (Number.isInteger(f) && f >= 0 && f < 5) me.loadout.faction = f;
        this.dirty = true;
        return;
      }
      case 'kick': {
        if (!lead) return void this.io.send(pid, 'notice', { text: 'Only the leader removes people' });
        const target = String(msg.pid);
        if (target === pid) return;
        if (this.members.some((m) => m.pid === target)) {
          this.leave(target);
          this.io.disconnect?.(target, 'The leader removed you from the squad.');
        }
        return;
      }
      case 'go': {
        if (!lead) return;
        const code = String(msg.code ?? '');
        if (!/^[A-Z0-9]{5}$/.test(code)) return;
        this.room = code;
        for (const m of this.members) if (m.pid !== pid && m.connected) this.io.send(m.pid, 'follow', { code, size: this.members.length });
        return;
      }
      case 'home': {
        if (lead) this.room = null;
        return;
      }
      case 'view':
        // Joined but not heard the squad yet: everyone gets it again on the next update.
        this.dirty = true;
        return;
      case 'ping':
        this.io.send(pid, 'pong', { t: Number(msg.t) || 0 });
        return;
    }
  }

  /** Two of the squad have picked the same frame (shown, not refused). */
  clashes(): boolean {
    const roles = this.members.map((m) => m.loadout.role);
    return new Set(roles).size !== roles.length;
  }

  view(): SquadView {
    const leader = this.members.find((m) => m.pid === this.leader);
    return {
      code: this.code,
      leader: this.leader,
      faction: leader?.loadout.faction ?? 0,
      members: [...this.members].sort((a, b) => a.joinedAt - b.joinedAt).map((m) => ({ pid: m.pid, callsign: m.callsign, role: m.loadout.role, connected: m.connected })),
    };
  }

  update(): void {
    const now = this.io.now();
    for (const m of [...this.members]) if (!m.connected && m.droppedAt >= 0 && now - m.droppedAt > RECONNECT_SECONDS * 1000) this.leave(m.pid);
    if (this.leader && !this.members.find((m) => m.pid === this.leader)?.connected) {
      const next = this.longest();
      if (next && next !== this.leader && this.members.find((m) => m.pid === next)?.connected) {
        this.leader = next;
        this.room = null;
        this.dirty = true;
      }
    }
    if (this.dirty) {
      this.io.broadcast('squad', this.view());
      this.dirty = false;
    }
    // Joined while the leader is in a room: after them, now the squad's view is out.
    for (const pid of this.toFollow) {
      if (this.room && pid !== this.leader && this.members.find((m) => m.pid === pid)?.connected) this.io.send(pid, 'follow', { code: this.room, size: this.members.length });
    }
    this.toFollow.clear();
  }
}

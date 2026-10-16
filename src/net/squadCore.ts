// A squad: up to three people who stay together from room to room and always
// take the same team. The leader picks the faction and takes everyone into
// rooms; members follow without being asked. Each member has a position
// (forward, midfield, defence), never shared: a newcomer gets theirs if it is
// open, and a position someone has is swapped for by asking, as seats are in a
// room. Like the room, it knows nothing of sockets (server/squadRoom.ts wraps it).

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
  /** Position swaps asked for: [from, to]. */
  swaps: Array<[string, string]> = [];
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
    // Your position if it is open, otherwise the first open one.
    const want = ROLES.includes(loadout?.role) ? loadout.role : ROLE.FW;
    const role = this.holder(want) ? ROLES.find((r) => !this.holder(r))! : want;
    const faction = Number.isInteger(loadout?.faction) && loadout.faction >= 0 && loadout.faction < 5 ? loadout.faction : 0;
    this.members.push({ pid, callsign, loadout: { faction, role }, connected: true, joinedAt: ++this.arrivals, droppedAt: -1 });
    if (!this.leader) this.leader = pid;
    this.io.send(pid, 'welcome', { pid, code: this.code });
    this.dirty = true;
    return { ok: true };
  }

  leave(pid: string): void {
    const i = this.members.findIndex((m) => m.pid === pid);
    if (i < 0) return;
    this.members.splice(i, 1);
    this.swaps = this.swaps.filter(([a, b]) => a !== pid && b !== pid);
    if (this.leader === pid) this.leader = this.longest();
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
        const f = Number(msg.faction);
        // Only the leader's faction counts: the squad is one team.
        if (Number.isInteger(f) && f >= 0 && f < 5 && f !== me.loadout.faction) {
          me.loadout.faction = f;
          this.dirty = true;
        }
        this.position(me, Number(msg.role) as Role);
        return;
      }
      case 'position':
        this.position(me, Number(msg.role) as Role);
        return;
      case 'swapAnswer': {
        const from = String(msg.from);
        const i = this.swaps.findIndex(([a, b]) => a === from && b === pid);
        if (i < 0) return; // already settled or withdrawn
        this.swaps.splice(i, 1);
        const other = this.members.find((m) => m.pid === from);
        if (msg.accept === true && other) [me.loadout.role, other.loadout.role] = [other.loadout.role, me.loadout.role];
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
        for (const m of this.members) if (m.pid !== pid && m.connected) this.io.send(m.pid, 'follow', { code, size: this.members.length });
        return;
      }
      case 'ping':
        this.io.send(pid, 'pong', { t: Number(msg.t) || 0 });
        return;
    }
  }

  private holder(role: Role): Person | undefined {
    return this.members.find((m) => m.loadout.role === role);
  }

  /** Move to an open position, or ask whoever has it to swap (once, however often asked). */
  private position(me: Person, role: Role): void {
    if (!ROLES.includes(role) || me.loadout.role === role) return;
    const there = this.holder(role);
    if (!there) {
      me.loadout.role = role;
      // Moving withdraws what you had asked for.
      this.swaps = this.swaps.filter(([a]) => a !== me.pid);
    } else {
      if (this.swaps.some(([a, b]) => a === me.pid && b === there.pid)) return;
      this.swaps = this.swaps.filter(([a]) => a !== me.pid);
      this.swaps.push([me.pid, there.pid]);
    }
    this.dirty = true;
  }

  view(): SquadView {
    const leader = this.members.find((m) => m.pid === this.leader);
    return {
      code: this.code,
      leader: this.leader,
      faction: leader?.loadout.faction ?? 0,
      members: [...this.members].sort((a, b) => a.joinedAt - b.joinedAt).map((m) => ({ pid: m.pid, callsign: m.callsign, role: m.loadout.role, connected: m.connected })),
      swaps: this.swaps.map(([a, b]) => [a, b] as [string, string]),
    };
  }

  update(): void {
    const now = this.io.now();
    for (const m of [...this.members]) if (!m.connected && m.droppedAt >= 0 && now - m.droppedAt > RECONNECT_SECONDS * 1000) this.leave(m.pid);
    if (this.leader && !this.members.find((m) => m.pid === this.leader)?.connected) {
      const next = this.longest();
      if (next && next !== this.leader && this.members.find((m) => m.pid === next)?.connected) {
        this.leader = next;
        this.dirty = true;
      }
    }
    if (this.dirty) {
      this.io.broadcast('squad', this.view());
      this.dirty = false;
    }
  }
}

// A room's lobby: who is in it, where they sit, who is host and captain and
// shot caller, the settings and the ready marks. Plain rules over plain data,
// with no network in it, so every rule can be tested on its own.
//
//   Seats      Two teams of three, one forward, one midfielder and one
//              defender each. People take seats; computer pilots sit in the rest.
//   Host       Changes the settings and can remove people. Whoever has been in
//              the room longest takes over when the host leaves.
//   Captain    The first person on a team. Picks the team's faction, which
//              must differ from the other team's.
//   Shot caller  Only on a team of two people and one computer pilot: the one
//              of the two whose calls the computer pilot follows. It starts
//              with the captain (or the squad's leader) and can be passed.

import { ROLE, TRACKS, type Role } from '../sim/index';
import {
  MATCH_FORMATS,
  ROOM_SIZE,
  SKILL_NAMES,
  SQUAD_HOLD_SECONDS,
  type LobbyPlayer,
  type LobbyView,
  type Loadout,
  type RoomPhase,
  type RoomSettings,
  type SideView,
  type SquadTicket,
} from './protocol';
import type { MatchState } from '../sim/index';

export const FACTION_COUNT = 5;
const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];

export interface Member extends LobbyPlayer {
  deviceId: string;
  /** Order of arrival: lower has been here longer. */
  joinedAt: number;
  /** When the connection dropped (ms), or -1. */
  droppedAt: number;
  loadout: Loadout;
}

interface Hold {
  squad: string;
  side: number;
  role: Role;
  /** Until when (ms). */
  until: number;
}

export interface Lobby {
  code: string;
  version: string;
  host: string | null;
  settings: RoomSettings;
  factions: [number, number];
  /** The shot caller each side chose; only counts on a side of two people. */
  callers: [string | null, string | null];
  members: Member[];
  holds: Hold[];
  /** Devices the host removed: they cannot come back to this room. */
  banned: string[];
  /** A request for shot calling, by side: who asked. */
  callerAsks: [string | null, string | null];
  /** Seat swaps asked for: [from, to]. */
  swaps: Array<[string, string]>;
  arrivals: number;
}

export interface JoinInfo {
  pid: string;
  deviceId: string;
  callsign: string;
  loadout: Loadout;
  squad?: SquadTicket;
}

export type JoinResult = { ok: true; member: Member } | { ok: false; code: 'full' | 'squad' | 'kicked'; text: string };

export function defaultSettings(): RoomSettings {
  return { track: TRACKS[0].id, match: 1, skill: 1 };
}

export function createLobby(code: string, version: string, firstFaction = 0): Lobby {
  const f0 = validFaction(firstFaction) ? firstFaction : 0;
  return {
    code,
    version,
    host: null,
    settings: defaultSettings(),
    factions: [f0, (f0 + 1) % FACTION_COUNT],
    callers: [null, null],
    members: [],
    holds: [],
    banned: [],
    callerAsks: [null, null],
    swaps: [],
    arrivals: 0,
  };
}

function validFaction(f: number): boolean {
  return Number.isInteger(f) && f >= 0 && f < FACTION_COUNT;
}

function validRole(r: number): r is Role {
  return r === ROLE.FW || r === ROLE.MF || r === ROLE.DF;
}

export function member(lobby: Lobby, pid: string | null | undefined): Member | undefined {
  return pid ? lobby.members.find((m) => m.pid === pid) : undefined;
}

/** People seated on a side, longest-standing first. */
export function onSide(lobby: Lobby, side: number): Member[] {
  return lobby.members.filter((m) => m.side === side).sort((a, b) => a.joinedAt - b.joinedAt);
}

export function seated(lobby: Lobby): Member[] {
  return lobby.members.filter((m) => m.side >= 0);
}

export function seatHolder(lobby: Lobby, side: number, role: Role): Member | undefined {
  return lobby.members.find((m) => m.side === side && m.role === role);
}

function heldFor(lobby: Lobby, side: number, role: Role): Hold | undefined {
  return lobby.holds.find((h) => h.side === side && h.role === role);
}

/** Roles free on a side: nobody in them and not held (unless held for `squad`). */
export function freeRoles(lobby: Lobby, side: number, squad: string | null = null): Role[] {
  return ROLES.filter((r) => {
    if (seatHolder(lobby, side, r)) return false;
    const h = heldFor(lobby, side, r);
    return !h || (squad !== null && h.squad === squad);
  });
}

export function captainOf(lobby: Lobby, side: number): Member | undefined {
  return onSide(lobby, side)[0];
}

/** The shot caller of a side: only a side of exactly two people has one. */
export function callerOf(lobby: Lobby, side: number): Member | undefined {
  const people = onSide(lobby, side);
  if (people.length !== 2) return undefined;
  const chosen = people.find((m) => m.pid === lobby.callers[side]);
  return chosen ?? people[0];
}

function becameCaptain(lobby: Lobby, m: Member): void {
  // The first person on a team brings their faction with them, unless the
  // other team already flies it.
  if (captainOf(lobby, m.side) !== m) return;
  const other = lobby.factions[1 - m.side];
  if (validFaction(m.loadout.faction) && m.loadout.faction !== other) lobby.factions[m.side] = m.loadout.faction;
}

/** Seat a newcomer. Mid-match arrivals sit out until the next round (`nextRound`). */
export function addMember(lobby: Lobby, info: JoinInfo, now: number, midMatch = false): JoinResult {
  expireHolds(lobby, now);
  if (lobby.banned.includes(info.deviceId)) return { ok: false, code: 'kicked', text: 'The host removed you from this room.' };
  if (seated(lobby).length >= ROOM_SIZE) return { ok: false, code: 'full', text: 'Room full' };
  const loadout: Loadout = { faction: validFaction(info.loadout?.faction) ? info.loadout.faction : 0, role: validRole(info.loadout?.role) ? info.loadout.role : ROLE.FW };
  let side = -1;
  let role: Role = loadout.role;
  const squad = info.squad && typeof info.squad.id === 'string' ? info.squad : undefined;
  const followHolds = squad ? lobby.holds.filter((h) => h.squad === squad.id) : [];
  if (squad && followHolds.length > 0) {
    // Following a squad's leader in: one of the seats held for us.
    const mine = followHolds.find((h) => h.role === loadout.role) ?? followHolds[0];
    side = mine.side;
    role = mine.role;
    lobby.holds.splice(lobby.holds.indexOf(mine), 1);
  } else if (squad && squad.size > 1 && !squad.follow) {
    // A squad's leader: every member needs a seat on the same side.
    const need = Math.min(3, Math.max(1, squad.size | 0));
    const sides = [0, 1].filter((s) => freeRoles(lobby, s).length >= need).sort((a, b) => freeRoles(lobby, b).length - freeRoles(lobby, a).length || onSide(lobby, a).length - onSide(lobby, b).length);
    if (!sides.length) {
      const best = [0, 1].sort((a, b) => freeRoles(lobby, b).length - freeRoles(lobby, a).length)[0];
      const free = freeRoles(lobby, best).length;
      return { ok: false, code: 'squad', text: `Team ${best + 1} has ${free} free seat${free === 1 ? '' : 's'}; your squad has ${need}.` };
    }
    side = sides[0];
    const free = freeRoles(lobby, side);
    role = free.includes(loadout.role) ? loadout.role : free[0];
    for (const r of free.filter((r) => r !== role).slice(0, need - 1)) lobby.holds.push({ squad: squad.id, side, role: r, until: now + SQUAD_HOLD_SECONDS * 1000 });
  } else {
    // On your own: the side with fewer people, in your frame if it is free.
    const sides = [0, 1].filter((s) => freeRoles(lobby, s).length > 0).sort((a, b) => onSide(lobby, a).length - onSide(lobby, b).length || a - b);
    if (!sides.length) return { ok: false, code: 'full', text: 'Room full' };
    side = sides.find((s) => freeRoles(lobby, s).includes(loadout.role)) ?? sides[0];
    // ...but not onto a fuller side just for the frame.
    if (onSide(lobby, side).length > onSide(lobby, sides[0]).length) side = sides[0];
    // Following a squad whose held seats have run out: with the squad if there is room.
    const mates = squad ? lobby.members.find((x) => x.squad === squad.id && x.side >= 0 && freeRoles(lobby, x.side).length > 0) : undefined;
    if (mates) side = mates.side;
    const free = freeRoles(lobby, side);
    role = free.includes(loadout.role) ? loadout.role : free[0];
  }
  const m: Member = {
    pid: info.pid,
    deviceId: info.deviceId,
    callsign: info.callsign,
    side,
    role,
    ready: false,
    connected: true,
    ping: 0,
    squad: squad ? squad.id : null,
    nextRound: midMatch,
    autopilot: false,
    joinedAt: ++lobby.arrivals,
    droppedAt: -1,
    loadout,
  };
  lobby.members.push(m);
  if (!lobby.host) lobby.host = m.pid;
  becameCaptain(lobby, m);
  // A squad's leader starts as its team's shot caller.
  if (squad && followHolds.length === 0 && squad.size > 1 && !squad.follow) lobby.callers[side] = m.pid;
  return { ok: true, member: m };
}

/** Take someone out of the room. */
export function removeMember(lobby: Lobby, pid: string): Member | undefined {
  const m = member(lobby, pid);
  if (!m) return undefined;
  lobby.members.splice(lobby.members.indexOf(m), 1);
  for (let s = 0; s < 2; s++) {
    if (lobby.callers[s] === pid) lobby.callers[s] = null;
    if (lobby.callerAsks[s] === pid) lobby.callerAsks[s] = null;
  }
  lobby.swaps = lobby.swaps.filter(([a, b]) => a !== pid && b !== pid);
  if (lobby.host === pid) lobby.host = nextHost(lobby);
  return m;
}

/** Whoever has been in the room longest and is still connected (else anyone left). */
export function nextHost(lobby: Lobby, except?: string): string | null {
  const order = [...lobby.members].filter((m) => m.pid !== except).sort((a, b) => a.joinedAt - b.joinedAt);
  return (order.find((m) => m.connected) ?? order[0])?.pid ?? null;
}

export function expireHolds(lobby: Lobby, now: number): void {
  lobby.holds = lobby.holds.filter((h) => h.until > now);
}

export type Outcome = { ok: true; note?: string } | { ok: false; text: string };
const no = (text: string): Outcome => ({ ok: false, text });
const yes = (note?: string): Outcome => ({ ok: true, note });

/** Move to a seat: straight in if it is free, else a swap request to whoever sits there. */
export function moveSeat(lobby: Lobby, pid: string, side: number, role: Role): Outcome {
  const m = member(lobby, pid);
  if (!m || m.side < 0) return no('You have no seat');
  if ((side !== 0 && side !== 1) || !validRole(role)) return no('No such seat');
  if (m.side === side && m.role === role) return yes();
  const there = seatHolder(lobby, side, role);
  if (there) {
    // Asking again while the first ask is waiting changes nothing.
    if (lobby.swaps.some(([a, b]) => a === pid && b === there.pid)) return yes();
    lobby.swaps.push([pid, there.pid]);
    return yes('asked');
  }
  if (heldFor(lobby, side, role) && heldFor(lobby, side, role)!.squad !== m.squad) return no('That seat is held for a squad');
  const wasSide = m.side;
  m.side = side;
  m.role = role;
  m.ready = false;
  lobby.swaps = lobby.swaps.filter(([a]) => a !== pid);
  if (wasSide !== side) {
    if (lobby.callers[wasSide] === pid) lobby.callers[wasSide] = null;
    becameCaptain(lobby, m);
  }
  return yes();
}

/** Answer a swap request: the two trade seats. */
export function answerSwap(lobby: Lobby, pid: string, from: string, accept: boolean): Outcome {
  const i = lobby.swaps.findIndex(([a, b]) => a === from && b === pid);
  if (i < 0) return yes(); // already settled or withdrawn
  lobby.swaps.splice(i, 1);
  if (!accept) return yes('declined');
  const a = member(lobby, from);
  const b = member(lobby, pid);
  if (!a || !b || a.side < 0 || b.side < 0) return no('They have left');
  const [side, role] = [a.side, a.role];
  a.side = b.side;
  a.role = b.role;
  b.side = side;
  b.role = role;
  a.ready = false;
  b.ready = false;
  if (a.side !== b.side) {
    for (let s = 0; s < 2; s++) if (lobby.callers[s] === a.pid || lobby.callers[s] === b.pid) lobby.callers[s] = null;
  }
  return yes();
}

/** A captain picks their team's faction. */
/**
 * A team's faction. Its captain picks it; in a private room the host can set
 * either team's too (a team of computer pilots has nobody else to). `side`
 * defaults to your own team.
 */
export function setFaction(lobby: Lobby, pid: string, faction: number, side?: number): Outcome {
  const m = member(lobby, pid);
  if (!m) return no('You are not in this room');
  const s = side === 0 || side === 1 ? side : m.side;
  if (s !== 0 && s !== 1) return no('You have no seat');
  if (lobby.host !== pid && captainOf(lobby, s) !== m) return no(s === m.side ? "Only your team's captain or the host picks its faction" : "Only that team's captain or the host picks its faction");
  if (!validFaction(faction)) return no('No such faction');
  if (faction === lobby.factions[1 - s]) return no('The other team flies that faction');
  if (lobby.factions[s] === faction) return yes();
  lobby.factions[s] = faction;
  clearReady(lobby);
  return yes();
}

/** The host changes the circuit, the format or the computer pilots' skill. Everyone's ready mark clears. */
export function setSettings(lobby: Lobby, pid: string, s: Partial<RoomSettings>): Outcome {
  if (lobby.host !== pid) return no('Only the host changes the settings');
  const next = { ...lobby.settings };
  if (s.track !== undefined) {
    if (!TRACKS.some((t) => t.id === s.track)) return no('No such circuit');
    next.track = s.track;
  }
  if (s.match !== undefined) {
    if (!Number.isInteger(s.match) || s.match < 0 || s.match >= MATCH_FORMATS.length) return no('No such format');
    next.match = s.match;
  }
  if (s.skill !== undefined) {
    if (!Number.isInteger(s.skill) || s.skill < 0 || s.skill >= SKILL_NAMES.length) return no('No such skill');
    next.skill = s.skill;
  }
  if (next.track === lobby.settings.track && next.match === lobby.settings.match && next.skill === lobby.settings.skill) return yes();
  lobby.settings = next;
  clearReady(lobby);
  return yes();
}

export function setReady(lobby: Lobby, pid: string, ready: boolean): Outcome {
  const m = member(lobby, pid);
  if (!m || m.side < 0) return no('You have no seat');
  m.ready = !!ready;
  return yes();
}

export function clearReady(lobby: Lobby): void {
  for (const m of lobby.members) m.ready = false;
}

/** Everyone connected and seated is ready, and there is at least one of them. */
export function allReady(lobby: Lobby): boolean {
  const people = seated(lobby).filter((m) => m.connected);
  return people.length > 0 && people.every((m) => m.ready);
}

/** Shot calling: pass it on, ask for it, or answer an ask. */
export function callerAction(lobby: Lobby, pid: string, action: 'pass' | 'ask' | 'accept' | 'decline' | 'cancel'): Outcome {
  const m = member(lobby, pid);
  if (!m || m.side < 0) return no('You have no seat');
  const side = m.side;
  const people = onSide(lobby, side);
  if (people.length !== 2) return no('Shot calling is only for a team of two people and one computer pilot');
  const holder = callerOf(lobby, side)!;
  const mate = people.find((p) => p.pid !== pid)!;
  switch (action) {
    case 'pass':
      if (holder.pid !== pid) return no("You aren't the shot caller");
      lobby.callers[side] = mate.pid;
      lobby.callerAsks[side] = null;
      return yes();
    case 'ask':
      // Asking again while the first ask is waiting changes nothing.
      if (holder.pid === pid || lobby.callerAsks[side] === pid) return yes();
      lobby.callerAsks[side] = pid;
      return yes('asked');
    case 'cancel':
      if (lobby.callerAsks[side] === pid) lobby.callerAsks[side] = null;
      return yes();
    case 'accept':
    case 'decline': {
      // An answer to an ask that is already settled (or withdrawn) is ignored.
      const asker = lobby.callerAsks[side];
      if (holder.pid !== pid || !asker) return yes();
      lobby.callerAsks[side] = null;
      if (action === 'accept') lobby.callers[side] = asker;
      return yes(action === 'accept' ? 'passed' : 'declined');
    }
  }
  return no('Unknown');
}

/** The host removes someone, who cannot come back. */
export function kick(lobby: Lobby, pid: string, target: string): Outcome {
  if (lobby.host !== pid) return no('Only the host removes people');
  if (pid === target) return no("You can't remove yourself");
  const t = member(lobby, target);
  if (!t) return no('Already gone');
  lobby.banned.push(t.deviceId);
  removeMember(lobby, target);
  return yes();
}

/** What every client is shown. */
export function lobbyView(lobby: Lobby, phase: RoomPhase, timer: number, match: MatchState | null, continued: string[]): LobbyView {
  const sides = [0, 1].map((side): SideView => {
    const seats = ROLES.map((r) => seatHolder(lobby, side, r)?.pid ?? null) as [string | null, string | null, string | null];
    const held = ROLES.map((r) => !seatHolder(lobby, side, r) && !!heldFor(lobby, side, r)) as [boolean, boolean, boolean];
    return { faction: lobby.factions[side], captain: captainOf(lobby, side)?.pid ?? null, caller: callerOf(lobby, side)?.pid ?? null, seats, held };
  }) as [SideView, SideView];
  const players: LobbyPlayer[] = [...lobby.members]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ pid, callsign, side, role, ready, connected, ping, squad, nextRound, autopilot }) => ({ pid, callsign, side, role, ready, connected, ping, squad, nextRound, autopilot }));
  return {
    code: lobby.code,
    version: lobby.version,
    phase,
    host: lobby.host,
    settings: { ...lobby.settings },
    sides,
    players,
    timer,
    match,
    callerAsks: [...lobby.callerAsks] as [string | null, string | null],
    swaps: lobby.swaps.map(([a, b]) => [a, b] as [string, string]),
    continued: [...continued],
  };
}

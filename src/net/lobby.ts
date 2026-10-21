// A room's lobby: who is in it, which team they are on and which frame they
// have picked, who is host and captain and shot caller, the settings and the
// ready marks. Plain rules over plain data, with no network in it, so every
// rule can be tested on its own.
//
//   Teams      Two teams of three places. People join a team; computer pilots
//              fly the frames nobody on it picked.
//   Frames     Anyone may pick any frame, as often as they like, to look at
//              it. Ready locks it in: it is refused while a teammate has
//              that frame locked, so the first to lock a frame keeps it and a
//              team can never start with two of one frame. Not ready unlocks.
//   Host       Changes the settings and can remove people. Whoever has been in
//              the room longest takes over when the host leaves.
//   Captain    The first person on a team. Picks the team's faction, which
//              must differ from the other team's (the host can too).
//   Shot caller  Only on a team of two people and one computer pilot: the one
//              of the two whose calls the computer pilot follows. It starts
//              with the captain (or the squad's leader) and can be passed.
//   Grand Prix A squad's cup or season (`fixed`): the event sets the factions,
//              circuit, format and skill, and the other team is computer
//              pilots only, so people sit on team 1 (side 0) alone.

import { ROLE, TRACKS, type Role } from '../sim/index';
import {
  MATCH_FORMATS,
  ROOM_SIZE,
  SKILL_NAMES,
  SQUAD_HOLD_SECONDS,
  type LobbyPlayer,
  type LobbyView,
  type Loadout,
  type Looks,
  type RoomPhase,
  type RoomSettings,
  type SideView,
  type SquadTicket,
} from './protocol';
import type { MatchState } from '../sim/index';
import type { GpEvent } from '../gp/grandPrix';

export const FACTION_COUNT = 5;
const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];

export interface Member extends LobbyPlayer {
  deviceId: string;
  /** Order of arrival: lower has been here longer. */
  joinedAt: number;
  /** When the connection dropped (ms), or -1. */
  droppedAt: number;
  loadout: Loadout;
  /** The mech they fly in each frame (checked: see protocol cleanLooks). Shown to everyone in the race, not in the lobby. */
  looks: Looks;
}

/** A place on a team kept for a squad member on their way in. */
interface Hold {
  squad: string;
  side: number;
  /** Until when (ms). */
  until: number;
}

/** Places on a team. */
export const TEAM_SIZE = 3;

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
  arrivals: number;
  /** A squad's Grand Prix: factions and settings come from the event, and only side 0 takes people. */
  fixed: boolean;
}

export interface JoinInfo {
  pid: string;
  deviceId: string;
  callsign: string;
  /** Their portrait (protocol PORTRAITS), or -1. */
  portrait?: number;
  /** Their mechs (checked). */
  looks?: Looks;
  loadout: Loadout;
  squad?: SquadTicket;
}

export type JoinResult = { ok: true; member: Member } | { ok: false; code: 'full' | 'squad' | 'kicked' | 'gp'; text: string };

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
    arrivals: 0,
    fixed: false,
  };
}

/** The sides people may sit on: both, or in a Grand Prix only the squad's. */
function openSides(lobby: Lobby): number[] {
  return lobby.fixed ? [0] : [0, 1];
}

/** Why something a Grand Prix decides cannot be changed by hand. */
const FIXED_TEXT = 'The Grand Prix sets this';

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

/** Who on a side has locked in a frame (is ready with it). */
export function lockedBy(lobby: Lobby, side: number, role: Role): Member | undefined {
  return lobby.members.find((m) => m.side === side && m.role === role && m.ready);
}

/** Places free on a side: three, less the people on it and the places held for squads (other than `squad`). */
export function placesFree(lobby: Lobby, side: number, squad: string | null = null): number {
  const held = lobby.holds.filter((h) => h.side === side && (squad === null || h.squad !== squad)).length;
  return TEAM_SIZE - onSide(lobby, side).length - held;
}

/**
 * Each person's frame for a race: their pick, locked-in picks first; anyone
 * whose pick is taken (a late arrival, someone who dropped before locking in)
 * gets a frame nobody has. Updates `role` to match. Returns the frames the
 * computer pilots fly, by side.
 */
export function settleFrames(lobby: Lobby): [Role[], Role[]] {
  const cpu: [Role[], Role[]] = [[], []];
  for (const side of [0, 1]) {
    const people = onSide(lobby, side).sort((a, b) => Number(b.ready) - Number(a.ready) || a.joinedAt - b.joinedAt);
    const used = new Set<Role>();
    const later: Member[] = [];
    for (const m of people) {
      if (!used.has(m.role)) used.add(m.role);
      else later.push(m);
    }
    for (const m of later) {
      const free = ROLES.find((r) => !used.has(r));
      if (free === undefined) continue;
      m.role = free;
      used.add(free);
    }
    cpu[side] = ROLES.filter((r) => !used.has(r));
  }
  return cpu;
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
  // other team already flies it (or a Grand Prix has set it).
  if (lobby.fixed || captainOf(lobby, m.side) !== m) return;
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
  const squad = info.squad && typeof info.squad.id === 'string' ? info.squad : undefined;
  const hold = squad ? lobby.holds.find((h) => h.squad === squad.id) : undefined;
  const fewer = (a: number, b: number) => onSide(lobby, a).length - onSide(lobby, b).length || a - b;
  if (squad && hold) {
    // Following a squad's leader in: one of the places held for us.
    side = hold.side;
    lobby.holds.splice(lobby.holds.indexOf(hold), 1);
  } else if (squad && squad.size > 1 && !squad.follow) {
    // A squad's leader: every member needs a place on the same team.
    const need = Math.min(TEAM_SIZE, Math.max(1, squad.size | 0));
    const sides = openSides(lobby).filter((s) => placesFree(lobby, s) >= need).sort((a, b) => placesFree(lobby, b) - placesFree(lobby, a) || fewer(a, b));
    if (!sides.length) {
      const best = openSides(lobby).sort((a, b) => placesFree(lobby, b) - placesFree(lobby, a))[0];
      const free = Math.max(0, placesFree(lobby, best));
      return { ok: false, code: 'squad', text: `Team ${best + 1} has ${free} free place${free === 1 ? '' : 's'}; your squad has ${need}.` };
    }
    side = sides[0];
    for (let i = 1; i < need; i++) lobby.holds.push({ squad: squad.id, side, until: now + SQUAD_HOLD_SECONDS * 1000 });
  } else {
    // On your own: the team with fewer people; a squad member whose held
    // places have run out goes to the squad's team if it has room.
    const sides = openSides(lobby).filter((s) => placesFree(lobby, s) > 0).sort(fewer);
    if (!sides.length) return { ok: false, code: 'full', text: lobby.fixed ? 'The squad is full' : 'Room full' };
    side = sides[0];
    const mates = squad ? lobby.members.find((x) => x.squad === squad.id && x.side >= 0 && placesFree(lobby, x.side) > 0) : undefined;
    if (mates) side = mates.side;
  }
  // Your frame is your pick, whoever else has it: Ready sorts that out.
  const role: Role = loadout.role;
  const m: Member = {
    pid: info.pid,
    deviceId: info.deviceId,
    callsign: info.callsign,
    portrait: info.portrait ?? -1,
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
    looks: info.looks ?? ['', '', ''],
  };
  lobby.members.push(m);
  if (!lobby.host) lobby.host = m.pid;
  becameCaptain(lobby, m);
  // A squad's leader starts as its team's shot caller.
  if (squad && !hold && squad.size > 1 && !squad.follow) lobby.callers[side] = m.pid;
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

/** Pick a frame to fly (or just to look at): any frame, unless you are locked in. */
export function pickFrame(lobby: Lobby, pid: string, role: Role): Outcome {
  const m = member(lobby, pid);
  if (!m || m.side < 0) return no('You have no place on a team');
  if (!validRole(role)) return no('No such frame');
  if (m.role === role) return yes();
  if (m.ready) return no("You're locked in: press Not ready to change your frame");
  m.role = role;
  return yes();
}

/** Move to the other team (and pick a frame there), if it has a free place. */
export function switchTeam(lobby: Lobby, pid: string, side: number, role?: Role): Outcome {
  const m = member(lobby, pid);
  if (!m || m.side < 0) return no('You have no place on a team');
  if (side !== 0 && side !== 1) return no('No such team');
  if (m.side === side) return role === undefined ? yes() : pickFrame(lobby, pid, role);
  if (!openSides(lobby).includes(side)) return no('Computer pilots fly the other team in a Grand Prix');
  if (placesFree(lobby, side, m.squad) < 1) return no('That team is full');
  // A place held there for your own squad is the one you take.
  const hold = m.squad ? lobby.holds.find((h) => h.side === side && h.squad === m.squad) : undefined;
  if (hold) lobby.holds.splice(lobby.holds.indexOf(hold), 1);
  const was = m.side;
  m.side = side;
  m.ready = false;
  if (role !== undefined && validRole(role)) m.role = role;
  if (lobby.callers[was] === pid) lobby.callers[was] = null;
  if (lobby.callerAsks[was] === pid) lobby.callerAsks[was] = null;
  becameCaptain(lobby, m);
  return yes();
}

/**
 * A team's faction. Its captain picks it; in a private room the host can set
 * either team's too (a team of computer pilots has nobody else to). `side`
 * defaults to your own team.
 */
export function setFaction(lobby: Lobby, pid: string, faction: number, side?: number): Outcome {
  const m = member(lobby, pid);
  if (!m) return no('You are not in this room');
  if (lobby.fixed) return no(FIXED_TEXT);
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
  if (lobby.fixed) return no(FIXED_TEXT);
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

/** Ready locks your frame in; refused while a teammate has that frame locked in. */
export function setReady(lobby: Lobby, pid: string, ready: boolean): Outcome {
  const m = member(lobby, pid);
  if (!m || m.side < 0) return no('You have no place on a team');
  if (ready && !m.ready) {
    const holder = lockedBy(lobby, m.side, m.role);
    if (holder && holder !== m) return no(`${holder.callsign} has locked in that frame: pick another`);
  }
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
export function lobbyView(lobby: Lobby, phase: RoomPhase, timer: number, match: MatchState | null, continued: string[], gp: GpEvent | null = null): LobbyView {
  const sides = [0, 1].map(
    (side): SideView => ({
      faction: lobby.factions[side],
      captain: captainOf(lobby, side)?.pid ?? null,
      caller: callerOf(lobby, side)?.pid ?? null,
      held: lobby.holds.filter((h) => h.side === side).length,
    }),
  ) as [SideView, SideView];
  const players: LobbyPlayer[] = [...lobby.members]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ pid, callsign, portrait, side, role, ready, connected, ping, squad, nextRound, autopilot }) => ({ pid, callsign, portrait, side, role, ready, connected, ping, squad, nextRound, autopilot }));
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
    continued: [...continued],
    gp,
  };
}

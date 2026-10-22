// What the game client and the room server say to each other. Shared by
// both, so it stays free of DOM and Node code (tsconfig.sim.json checks it).
//
// The race online: the server runs the one true race, stepping it 60 times a
// second with every person's input. It sends each client the inputs it used,
// tick by tick, so a client can run the same race to the same result (its
// "confirmed" race), and now and then the whole race (a keyframe) in case a
// client's copy has drifted. On top of the confirmed race each client
// replays its own inputs the server has not used yet, so its own mech
// answers the stick at once (prediction).

import type { MatchConfig, MatchState, MechInput, RaceState, Role, RoundResult, SeatConfig } from '../sim/index';
import type { GpEvent, GpKind } from '../gp/grandPrix';
import { decodeBuild } from '../custom/mechBuild';

/** Bumped when a message changes shape: a client and a room must agree on it. (2: the squad's Grand Prix; 3: pilots' portraits; 4: custom mechs.) */
export const NET_PROTOCOL = 4;

/** The server sends the inputs it used every this many ticks (30 packets a second). */
export const TICKS_PER_PACKET = 2;
/** A whole-race keyframe goes to everyone this often (ticks). */
export const KEYFRAME_TICKS = 300;
/** A checksum of the race rides with the inputs this often (ticks). */
export const CHECKSUM_TICKS = 30;
/** How long a dropped person's seat is kept for them (seconds). */
export const RECONNECT_SECONDS = 60;
/** The countdown once everyone is ready (seconds). */
export const READY_COUNTDOWN = 5;
/** Between rounds: the next starts when everyone continues, or after this long (seconds). */
export const RESULTS_SECONDS = 15;
/** After the match: the final results stay up this long before the room's lobby (seconds). */
export const FINAL_SECONDS = 10;
/** A Grand Prix room: once every result of a round is in, the table stays up until everyone continues, or this long (seconds). */
export const STANDINGS_SECONDS = 30;
/**
 * A Grand Prix room races the other factions' fixtures between the server's
 * other work: at most this many ticks, and this many milliseconds, each time
 * the room updates (60 times a second). The time limit keeps a slow server
 * answering while it does (the whole cup's other fixtures are several
 * seconds of work, done just as the squad is coming in).
 */
export const GP_BACKGROUND_TICKS = 40;
export const GP_BACKGROUND_MS = 3;
/** A client that has joined a room asks for it again after this long without hearing it (seconds), and gives up after JOIN_TIMEOUT_SECONDS. */
export const VIEW_RETRY_SECONDS = 2;
/** How long joining a room may take before the client gives up and says so (seconds). */
export const JOIN_TIMEOUT_SECONDS = 20;
/** Seats held for a squad's members while they follow their leader in (seconds). */
export const SQUAD_HOLD_SECONDS = 20;
/** At most this many people in a room. */
export const ROOM_SIZE = 6;
/** At most this many in a squad: one team. */
export const SQUAD_SIZE = 3;

// ---- room and squad codes -----------------------------------------------------

/** 31 characters nobody misreads: no 0/O, no 1/I/L. */
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function makeCode(rand: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length) % CODE_CHARS.length];
  return s;
}

/** A code as typed or pasted (any case, spaces, or a whole invite link), or null if it is not one. */
export function normalizeCode(text: string): string | null {
  let t = text.trim();
  const m = /[?&](?:room|squad)=([A-Za-z0-9]+)/.exec(t);
  if (m) t = m[1];
  t = t.replace(/[\s-]/g, '').toUpperCase();
  if (t.length !== CODE_LENGTH) return null;
  for (const ch of t) if (!CODE_CHARS.includes(ch)) return null;
  return t;
}

// ---- callsigns ------------------------------------------------------------------

export const CALLSIGN_MIN = 3;
export const CALLSIGN_MAX = 16;
/** Letters, digits, and a few joiners. */
export const CALLSIGN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -_.';

/** A short list of words no callsign may contain (matched without spaces or joiners, any case). */
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'bitch', 'retard', 'kike', 'spic', 'chink', 'dick', 'cock', 'pussy', 'penis', 'vagina'];

/** Why a callsign cannot be used, or null if it can. */
export function callsignProblem(name: string): string | null {
  const t = name.trim();
  if (t.length < CALLSIGN_MIN) return `At least ${CALLSIGN_MIN} characters`;
  if (t.length > CALLSIGN_MAX) return `At most ${CALLSIGN_MAX} characters`;
  for (const ch of t) if (!CALLSIGN_CHARS.includes(ch)) return 'Letters, numbers, spaces and - _ . only';
  const flat = t.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
  if (BLOCKED.some((w) => flat.includes(w))) return 'Pick another callsign';
  return null;
}

export function cleanCallsign(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, CALLSIGN_MAX);
}

// ---- portraits -------------------------------------------------------------------

/**
 * How many portraits a pilot may wear: the gallery (hudArt.ts PILOTS, the
 * factions' pilots for now). A seat's portrait is an index into it, or -1
 * for the seat's own faction pilot (a computer pilot's, or nobody chosen).
 */
export const PORTRAITS = 15;

/** A portrait index as sent (anything else is -1: the faction's own pilot). */
export function cleanPortrait(p: unknown): number {
  return typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < PORTRAITS ? p : -1;
}

// ---- pilot colours ---------------------------------------------------------------

/**
 * The pilot colours (RGB): what a pilot flying for no faction (a person in a
 * Sprint) wears on their mech's lights, their name plate and their seat. A
 * pilot's colour is an index into them. The first five are the factions'
 * colours, the portraits' backgrounds: until a pilot picks one, theirs is
 * their portrait's (portraitColour).
 */
export const PILOT_COLOURS: readonly number[] = [0x3d8bff, 0xff3d5a, 0xff8f2e, 0xa66bff, 0x3ddc84, 0x45e8ff, 0xffc93a, 0xff5fc8, 0xb4f03a, 0xe8eef8];
export const PILOT_COLOUR_NAMES: readonly string[] = ['Blue', 'Red', 'Orange', 'Violet', 'Green', 'Cyan', 'Gold', 'Pink', 'Lime', 'White'];

/** A pilot colour as sent (anything else is -1: none). */
export function cleanColour(c: unknown): number {
  return typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < PILOT_COLOURS.length ? c : -1;
}

/** The colour of a portrait's background (its faction's: the gallery is five factions' pilots, three each). */
export function portraitColour(portrait: number): number {
  return portrait >= 0 ? Math.floor(portrait / 3) % 5 : 0;
}

/** A `pilot` message checked: the callsign as on joining, the portrait and the mechs as below. */
export function pilotChange(msg: Record<string, unknown>): { ok: true; callsign: string; portrait: number; looks: Looks } | { ok: false; text: string } {
  const callsign = cleanCallsign(String(msg.callsign ?? ''));
  const problem = callsignProblem(callsign);
  if (problem) return { ok: false, text: `Callsign: ${problem}` };
  return { ok: true, callsign, portrait: cleanPortrait(msg.portrait), looks: cleanLooks(msg.looks) };
}

/** A pilot's mech in each frame: a custom mech as text, or '' for the stock one. */
export type Looks = [string, string, string];

/** Mechs as sent: each one a custom mech that reads back (custom/mechBuild.ts), or '' (stock). */
export function cleanLooks(looks: unknown): Looks {
  const list = Array.isArray(looks) ? looks : [];
  return [0, 1, 2].map((i) => (decodeBuild(list[i]) ? (list[i] as string) : '')) as Looks;
}

// ---- inputs on the wire ---------------------------------------------------------

/**
 * One tick's input as sent: stick and triggers as small whole numbers,
 * buttons and the tactic as they are. 0 stands for "no input": the seat's
 * computer pilot flies it (a pause menu, a dropped connection).
 */
export type WireInput = 0 | [number, number, number, number, number, number];

export function packInput(inp: MechInput | null): WireInput {
  if (!inp) return 0;
  const q = (v: number, k: number, lo: number) => (Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(1, v)) * k) : 0);
  return [q(inp.mx, 127, -1), q(inp.my, 127, -1), q(inp.throttle, 255, 0), q(inp.brake, 255, 0), (inp.buttons | 0) >>> 0, inp.cmd | 0];
}

export function unpackInput(w: WireInput | null | undefined): MechInput | null {
  if (!w || !Array.isArray(w)) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { mx: n(w[0]) / 127, my: n(w[1]) / 127, throttle: n(w[2]) / 255, brake: n(w[3]) / 255, buttons: n(w[4]) | 0, cmd: n(w[5]) | 0 };
}

/** An input as the server will see it, so a client predicts with exactly what the server applies. */
export function quantizeInput(inp: MechInput | null): MechInput | null {
  return unpackInput(packInput(inp));
}

export function sameWire(a: WireInput | null | undefined, b: WireInput | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- the room -------------------------------------------------------------------

export interface Loadout {
  /** Faction, an index into the liveries. */
  faction: number;
  role: Role;
}

export interface SquadTicket {
  /** The squad's code. */
  id: string;
  /** How many of the squad are coming, the leader included. */
  size: number;
  /** A member following the leader in (not the leader). */
  follow?: boolean;
}

/** What a client sends with a create or join. */
export interface JoinOptions {
  version: string;
  protocol: number;
  callsign: string;
  /** The pilot's portrait (see PORTRAITS). */
  portrait?: number;
  /** The mech the pilot flies in each frame (forward, midfielder, defender): a custom mech as text (custom/mechBuild.ts), or '' for the stock one. */
  looks?: string[];
  deviceId: string;
  loadout: Loadout;
  /** Coming as a squad (the leader), or following one (a member). */
  squad?: SquadTicket;
  /** With a create: the room is the squad's Grand Prix, against computer pilots. */
  gp?: GpRequest;
}

/** A squad's Grand Prix: a cup or a season, at a difficulty, for the leader's faction. */
export interface GpRequest {
  kind: GpKind;
  /** 0 rookie, 1 pro, 2 ace. */
  difficulty: number;
}

/**
 * Where a room is. A Grand Prix room adds two: `standings` (after your
 * match, or a matchday you sit out: the table, once the other results are
 * in) and `award` (the event is over). Its `lobby` is the round's briefing.
 */
export type RoomPhase = 'lobby' | 'countdown' | 'race' | 'results' | 'final' | 'standings' | 'award';

export interface RoomSettings {
  /** Circuit id. */
  track: string;
  /** Index into the match formats (MATCH_FORMATS). */
  match: number;
  /** Computer pilots' skill: 0 rookie, 1 pro, 2 ace. */
  skill: number;
}

/** The match formats a room offers (the same as Free Play's). */
export const MATCH_FORMATS: Array<{ label: string; cfg: MatchConfig }> = [
  { label: 'Single race', cfg: { mode: 'series', bestOf: 1, target: 50 } },
  { label: 'Series, best of 3', cfg: { mode: 'series', bestOf: 3, target: 50 } },
  { label: 'Series, best of 5', cfg: { mode: 'series', bestOf: 5, target: 50 } },
  { label: 'Points race to 50', cfg: { mode: 'points', bestOf: 3, target: 50 } },
  { label: 'Points race to 80', cfg: { mode: 'points', bestOf: 3, target: 80 } },
];
export const SKILL_NAMES = ['Rookie', 'Pro', 'Ace'] as const;
export const SKILL_VALUES = [0.28, 0.55, 0.82] as const;
/** Computer teammates on a team with people on it fly at this skill, as in Free Play. */
export const TEAMMATE_SKILL = 0.6;

export interface LobbyPlayer {
  pid: string;
  callsign: string;
  /** Their portrait (see PORTRAITS), or -1. */
  portrait: number;
  /** 0 or 1, the team; -1 while waiting for a place. */
  side: number;
  /** The frame they picked; locked in while they are ready. */
  role: Role;
  ready: boolean;
  connected: boolean;
  /** Round trip in ms, as the player's client last measured it. */
  ping: number;
  squad: string | null;
  /** Arrived mid-match: races from the next round. */
  nextRound: boolean;
  /** In the pause menu: the seat's computer pilot is flying for them. */
  autopilot: boolean;
}

export interface SideView {
  faction: number;
  /** The first person to sit on this side; picks its faction. */
  captain: string | null;
  /** Only on a side of two people and one computer pilot: whoever gives the computer pilot its orders. */
  caller: string | null;
  /** Places kept for squad members on their way in. */
  held: number;
}

export interface LobbyView {
  code: string;
  version: string;
  phase: RoomPhase;
  host: string | null;
  settings: RoomSettings;
  sides: [SideView, SideView];
  players: LobbyPlayer[];
  /** Seconds left of the countdown or of the results, or -1. */
  timer: number;
  /** The match so far (rounds played, score), or null in the lobby. */
  match: MatchState | null;
  /** Shot calling asked for: the pid that asked, by side. */
  callerAsks: [string | null, string | null];
  /** People who have pressed continue on the results. */
  continued: string[];
  /** A squad's Grand Prix: the event as it stands (schedule, results), or null in an ordinary room. */
  gp: GpEvent | null;
}

// ---- messages -------------------------------------------------------------------

/** Client to room. */
export interface ClientMessages {
  /** Pick a frame on your team (any frame: Ready locks it in). */
  pick: { role: Role };
  /** Your pilot changed: the callsign (checked as on joining), the portrait and the mechs (see JoinOptions). A race already begun keeps the old. */
  pilot: { callsign: string; portrait: number; looks?: string[] };
  /** Move to a team with a free place, picking a frame there. */
  team: { side: number; role?: Role };
  /** A team's faction (`side`: whose; your own if left out). */
  faction: { faction: number; side?: number };
  caller: { action: 'pass' | 'ask' | 'accept' | 'decline' | 'cancel' };
  settings: Partial<RoomSettings>;
  ready: { ready: boolean };
  start: Record<string, never>;
  kick: { pid: string };
  /** Inputs for consecutive ticks, the first numbered `s`, for the race begun by the matchStart with epoch `e`. */
  input: { s: number; i: WireInput[]; e: number };
  /** On from the results (or a Grand Prix's standings): `at` the phase it was pressed in, so a late press does not skip the next. */
  continue: { at?: RoomPhase };
  endMatch: Record<string, never>;
  resync: Record<string, never>;
  /** Send me the room as it is now: a client that has joined but not heard it yet asks again. */
  view: Record<string, never>;
  ping: { t: number; rtt: number };
  loadout: Loadout;
}

/** The race a round is run on, everything a client needs to build the same one. */
export interface MatchStartMsg {
  round: number;
  seed: number;
  track: string;
  seats: SeatConfig[];
  /** Which faction each race team is. */
  factions: [number, number];
  gridFlip: boolean;
  /** Laps, when not the usual (tests run short races). */
  laps?: number;
  /** Your seat (mech id) in this race, or -1 if you are watching. */
  seat: number;
  /** Who calls each team's tactics at the start (TeamState.caller). */
  callers: [number, number];
  /**
   * Numbers this start of play for you. Your inputs carry it back, and the
   * room ignores inputs from an earlier one (sent before a reconnect, say).
   * Input numbers start again from 1 with each epoch.
   */
  epoch: number;
  match: MatchState;
  /** The race as it stands, when joining a round already under way. */
  key: RaceState | null;
}

/** Inputs the server applied, ticks t, t+1, ... One row per tick, one entry per seat. */
export interface TickMsg {
  t: number;
  i: WireInput[][];
  /** The last input number used, by seat, for seats whose inputs the server is using. */
  a: Record<number, number>;
  /** Changes to the race made between ticks: [tick, team, caller]. Applied before that tick runs. */
  ops?: Array<[number, number, number]>;
  /** [tick, raceChecksum] after that tick ran. */
  sum?: [number, number];
}

export interface KeyMsg {
  race: RaceState;
}

export interface RoundEndMsg {
  round: RoundResult;
  match: MatchState;
}

export interface ErrorMsg {
  code: 'full' | 'version' | 'started' | 'squad' | 'kicked' | 'replaced' | 'closed' | 'bad' | 'host' | 'gp';
  text: string;
}

/** Room to client. */
export interface ServerMessages {
  welcome: { pid: string; code: string };
  lobby: LobbyView;
  matchStart: MatchStartMsg;
  tick: TickMsg;
  key: KeyMsg;
  roundEnd: RoundEndMsg;
  /** The match is over or was ended: back to the lobby. */
  lobbyAgain: { reason: 'over' | 'ended' };
  callerAsk: { from: string };
  notice: { text: string };
  error: ErrorMsg;
  pong: { t: number };
}

/** "This room is on a newer version" and the like, for a version mismatch either way. */
export function versionText(room: string, mine: string): string {
  return room > mine ? 'This room is on a newer version of the game: reload the page.' : 'This room is on an older version of the game: ask its host to reload and make a new one.';
}

// ---- squads ---------------------------------------------------------------------

export interface SquadMember {
  pid: string;
  callsign: string;
  /** Their portrait (see PORTRAITS), or -1. */
  portrait: number;
  role: Role;
  connected: boolean;
}

export interface SquadView {
  code: string;
  leader: string | null;
  /** The squad is one team, so one faction: the leader's. */
  faction: number;
  members: SquadMember[];
}

/** Client to squad. */
export interface SquadClientMessages {
  /** Your faction (it counts for the leader) and the frame you picked. */
  loadout: Loadout;
  kick: { pid: string };
  /** The leader is going into a room: everyone follows (and anyone who joins the squad while they are in it). */
  go: { code: string };
  /** The leader is out of their room again. */
  home: Record<string, never>;
  /** Send me the squad as it is now (joined, but not heard it yet). */
  view: Record<string, never>;
  ping: { t: number; rtt: number };
}

/** Squad to client. */
export interface SquadServerMessages {
  welcome: { pid: string; code: string };
  squad: SquadView;
  /** Your leader has gone into this room: follow them in. */
  follow: { code: string; size: number };
  error: ErrorMsg;
  notice: { text: string };
  pong: { t: number };
}

// Personal records, kept on this device (no account needed): the fastest
// speed lap and the fastest race on each circuit in each frame, and a
// career's totals. Offline races only (Free Play and the Grand Prix): the
// tutorial is a lesson, and online races wait for accounts.
//
// A lap record keeps its lap as a ghost: the mech sampled ten times a second
// (where it was on the road, which way it faced, how fast, boosting or
// carving), enough to draw it running that lap again beside you. Nothing
// draws ghosts yet; a time trial will (docs/DESIGN.md, "Records").
//
// The speed lap (the third, the limiter off) is the lap a record is kept
// for: the first two run at a limiter, so they say little about the pilot,
// and a time trial will be raced flat out as the speed lap is.

import { COUNTDOWN_TICKS, DT, mentions, type MechState, type PilotLine, type RaceState, type Role, type Track } from '../../sim/index';

/** Samples a second in a ghost. */
export const GHOST_RATE = 10;
/** Values each sample holds (see Ghost.data). */
const CHANNELS = 6;
/** The flags in a sample. */
export const GHOST_FLAG = { BOOST: 1, CARVE: 2, CARVE_RIGHT: 4, AIR: 8, OVERDRIVE: 16 } as const;

/**
 * One lap of a mech, to draw it again: a time trial's ghost.
 *
 * `data` is base64 of little-endian 16-bit integers, CHANNELS a sample, at
 * GHOST_RATE: the distance along the road since the line (each sample's
 * step, in tenths of a unit), across it (twentieths), the height above it
 * (twentieths), the facing (thousandths of a radian), the speed (tenths of
 * a unit a second), and GHOST_FLAG bits. The first sample is at the line,
 * the last at the end of the lap.
 */
export interface Ghost {
  v: 1;
  /** The circuit's id. */
  track: string;
  role: Role;
  /** What the mech looked like: its faction, its custom build ('' for the stock frame), its pilot's colour and name. */
  look: { faction: number; build: string; colour: number; name: string };
  /** The lap's time (s). */
  time: number;
  rate: number;
  data: string;
}

/** Where a ghost is at a moment of its lap. */
export interface GhostPose {
  s: number;
  d: number;
  h: number;
  facing: number;
  speed: number;
  flags: number;
}

export interface LapRecord {
  /** Seconds. */
  time: number;
  /** When it was set (ms since 1970). */
  at: number;
  /** Free Play, Sprint or Grand Prix. */
  mode: string;
  ghost: Ghost | null;
}

export interface RaceRecord {
  time: number;
  at: number;
  mode: string;
  place: number;
}

/** A career's totals, added up race by race (Free Play and the Grand Prix). */
export interface Career {
  races: number;
  wins: number;
  podiums: number;
  /** Points: placing, knockouts and support. */
  points: number;
  support: number;
  kos: number;
  /** Times knocked out. */
  out: number;
  /** Matches where you were the MVP (the most points of anyone). */
  mvps: number;
  /** Races and wins in each frame (Forward, Midfielder, Defender). */
  byRole: Array<{ races: number; wins: number }>;
  /** Races, wins and the best finish on each circuit. */
  byTrack: Record<string, { races: number; wins: number; best: number }>;
}

export interface RecordsFile {
  v: 1;
  /** The fastest speed lap, by circuit and frame (`recordKey`). */
  laps: Record<string, LapRecord>;
  /** The fastest race, start to flag, by circuit and frame. */
  races: Record<string, RaceRecord>;
  career: Career;
}

/** A record's key: the circuit and the frame. A time trial will keep its own (`trial|...`). */
export function recordKey(track: string, role: Role): string {
  return `${track}|${role}`;
}

export function emptyCareer(): Career {
  return { races: 0, wins: 0, podiums: 0, points: 0, support: 0, kos: 0, out: 0, mvps: 0, byRole: [0, 1, 2].map(() => ({ races: 0, wins: 0 })), byTrack: {} };
}

export function emptyRecords(): RecordsFile {
  return { v: 1, laps: {}, races: {}, career: emptyCareer() };
}

// ---- the ghost's samples ------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const clamp16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

/** Pack samples (each [s since the line, d, h, facing, speed, flags]) as Ghost.data. */
export function packGhost(samples: ReadonlyArray<readonly number[]>): string {
  const buf = new ArrayBuffer(samples.length * CHANNELS * 2);
  const view = new DataView(buf);
  // (Each step is taken from what is stored so far, so the rounding never drifts.)
  let stored = 0;
  samples.forEach((p, i) => {
    const step = clamp16((p[0] - stored) * 10);
    stored += step / 10;
    const vals = [step, p[1] * 20, p[2] * 20, p[3] * 1000, p[4] * 10, p[5]];
    for (let c = 0; c < CHANNELS; c++) view.setInt16((i * CHANNELS + c) * 2, clamp16(vals[c]), true);
  });
  return toBase64(new Uint8Array(buf));
}

/** A ghost's samples, unpacked: [s, d, h, facing, speed, flags] each. */
export function unpackGhost(g: Pick<Ghost, 'data'>): number[][] {
  const bytes = fromBase64(g.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.floor(bytes.length / (CHANNELS * 2));
  const out: number[][] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const at = (c: number) => view.getInt16((i * CHANNELS + c) * 2, true);
    s += at(0) / 10;
    out.push([s, at(1) / 20, at(2) / 20, at(3) / 1000, at(4) / 10, at(5)]);
  }
  return out;
}

/** Where the ghost is `t` seconds into its lap (eased between its samples; held at either end). */
export function ghostAt(g: Ghost, t: number, samples = unpackGhost(g)): GhostPose {
  const n = samples.length;
  if (n === 0) return { s: 0, d: 0, h: 0, facing: 0, speed: 0, flags: 0 };
  const x = Math.max(0, Math.min(n - 1, t * g.rate));
  const i = Math.min(n - 2, Math.floor(x));
  if (n === 1 || i < 0) {
    const p = samples[0];
    return { s: p[0], d: p[1], h: p[2], facing: p[3], speed: p[4], flags: p[5] };
  }
  const f = x - i;
  const a = samples[i];
  const b = samples[i + 1];
  const mix = (k: number) => a[k] + (b[k] - a[k]) * f;
  let df = b[3] - a[3];
  if (df > Math.PI) df -= 2 * Math.PI;
  if (df < -Math.PI) df += 2 * Math.PI;
  return { s: mix(0), d: mix(1), h: mix(2), facing: a[3] + df * f, speed: mix(4), flags: f < 0.5 ? a[5] : b[5] };
}

// ---- timing and tracing a mech's laps --------------------------------------------

/** A finished lap, timed and traced. */
export interface TracedLap {
  /** Which lap (1 is the first). */
  lap: number;
  /** Seconds. */
  time: number;
  /** The samples, as packGhost takes them. */
  samples: number[][];
}

function flagsOf(m: MechState): number {
  return (m.boosting ? GHOST_FLAG.BOOST : 0) | (m.carving ? GHOST_FLAG.CARVE : 0) | (m.carveDir > 0 ? GHOST_FLAG.CARVE_RIGHT : 0) | (m.air ? GHOST_FLAG.AIR : 0) | (m.overdriveT > 0 ? GHOST_FLAG.OVERDRIVE : 0);
}

/**
 * Times and traces every lap one mech runs, tick by tick (call `after` once
 * a tick, after the race steps). A lap starts as the mech crosses the line,
 * timed to the part of a tick (as the finish is); the first starts at the
 * lights. Works for any race, so a time trial can use it as it is.
 */
export class LapTracer {
  readonly laps: TracedLap[] = [];
  /** The lap under way (1 is the first; 0 before the lights, Infinity once out or home). */
  private lap = 0;
  private startTime = 0;
  /** Where the lap under way started (its line, along the road). */
  private startS = 0;
  private prevS = 0;
  private samples: number[][] = [];
  private nextSample = 0;
  /** Ticks between samples. */
  private readonly every = Math.max(1, Math.round(1 / DT / GHOST_RATE));

  constructor(
    readonly mechId: number,
    readonly track: Track,
  ) {}

  after(race: RaceState): void {
    const m = race.mechs[this.mechId];
    if (!m) return;
    const tick = race.tick;
    if (this.lap === 0) {
      // The first lap starts as the lights go out, from the line.
      if (tick >= COUNTDOWN_TICKS) this.begin(m, tick, COUNTDOWN_TICKS * DT, 1, 0);
      this.prevS = m.s;
      return;
    }
    if (this.lap === Infinity) return;
    if (m.retired) {
      this.lap = Infinity;
      return;
    }
    const line = this.startS + this.track.length;
    if (m.s >= line && this.prevS < line) {
      // Over the line: the lap's time, to the part of the tick it was crossed
      // in (the finish's own, which the race works out the same way).
      const frac = m.s > this.prevS ? Math.max(0, Math.min(1, (line - this.prevS) / (m.s - this.prevS))) : 1;
      const when = m.finished && m.finishTime < 1e6 ? m.finishTime : (tick - 1 + frac) * DT;
      this.samples.push([this.track.length, m.d, m.h, m.facing, m.speed, flagsOf(m)]);
      this.laps.push({ lap: this.lap, time: when - this.startTime, samples: this.samples });
      if (m.finished) this.lap = Infinity;
      else this.begin(m, tick, when, this.lap + 1, line);
    } else if (tick >= this.nextSample) {
      this.samples.push([Math.max(0, m.s - this.startS), m.d, m.h, m.facing, m.speed, flagsOf(m)]);
      this.nextSample = tick + this.every;
    }
    this.prevS = m.s;
  }

  private begin(m: MechState, tick: number, at: number, lap: number, startS: number): void {
    this.lap = lap;
    this.startTime = at;
    this.startS = startS;
    this.samples = [[Math.max(0, m.s - startS), m.d, m.h, m.facing, m.speed, flagsOf(m)]];
    this.nextSample = tick + this.every;
  }
}

// ---- the book --------------------------------------------------------------------

const KEY = 'zgp.records';

/** What a race left in the book: the records it set (and what they beat). */
export interface NewRecords {
  lap: { time: number; was: number | null } | null;
  race: { time: number; was: number | null } | null;
}

/** What `addRace` needs to know about the race just run. */
export interface RaceDone {
  race: RaceState;
  track: string;
  local: number;
  /** 'Free Play', 'Sprint', 'Grand Prix'. */
  mode: string;
  /** The local mech's laps (LapTracer.laps). */
  laps: readonly TracedLap[];
  /** How the mech looks (for its ghost). */
  look: Ghost['look'];
}

export class RecordBook {
  data: RecordsFile;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.data = this.load();
  }

  /** The fastest speed lap on a circuit in a frame, if any. */
  lap(track: string, role: Role): LapRecord | null {
    return this.data.laps[recordKey(track, role)] ?? null;
  }

  raceBest(track: string, role: Role): RaceRecord | null {
    return this.data.races[recordKey(track, role)] ?? null;
  }

  /**
   * A race run (to the flag): its speed lap and its time against the
   * records, and the career's totals. Returns the records it set.
   */
  addRace(done: RaceDone): NewRecords {
    const { race, local, track } = done;
    const me = race.mechs[local];
    const out: NewRecords = { lap: null, race: null };
    if (!me) return out;
    const key = recordKey(track, me.role);
    // The speed lap: the last of the race, run to the line (not out of the race in it).
    const last = done.laps.find((l) => l.lap === race.laps);
    if (last && me.finished && !me.retired && last.time > 1) {
      const was = this.data.laps[key]?.time ?? null;
      if (was === null || last.time < was - 1e-6) {
        this.data.laps[key] = {
          time: last.time,
          at: Date.now(),
          mode: done.mode,
          ghost: { v: 1, track, role: me.role, look: done.look, time: last.time, rate: GHOST_RATE, data: packGhost(last.samples) },
        };
        out.lap = { time: last.time, was };
      }
    }
    // The race: start to flag.
    if (me.finished && !me.retired && me.finishTime < 1e6) {
      const time = me.finishTime - COUNTDOWN_TICKS * DT;
      const was = this.data.races[key]?.time ?? null;
      if (was === null || time < was - 1e-6) {
        this.data.races[key] = { time, at: Date.now(), mode: done.mode, place: me.place };
        out.race = { time, was };
      }
    }
    // The career.
    const c = this.data.career;
    const won = me.place === 1 && !me.retired;
    c.races++;
    if (won) c.wins++;
    if (!me.retired && me.place <= 3) c.podiums++;
    c.points += me.points;
    c.support += me.support;
    c.kos += me.kos;
    if (me.retired) c.out++;
    const r = c.byRole[me.role] ?? (c.byRole[me.role] = { races: 0, wins: 0 });
    r.races++;
    if (won) r.wins++;
    const t = c.byTrack[track] ?? (c.byTrack[track] = { races: 0, wins: 0, best: 99 });
    t.races++;
    if (won) t.wins++;
    if (!me.retired) t.best = Math.min(t.best, me.place);
    this.save();
    return out;
  }

  /** A match decided (Free Play): an MVP if the local pilot scored the most of anyone in it. */
  addMatch(pilots: readonly PilotLine[], local: number): boolean {
    const mvp = mentions(pilots).find((x) => x.kind === 'mvp');
    const me = pilots.find((l) => l.id === local && l.human);
    if (!mvp || !me || mvp.id !== me.id) return false;
    this.data.career.mvps++;
    this.save();
    return true;
  }

  /** Start again from nothing (the Records screen asks first). */
  clear(): void {
    this.data = emptyRecords();
    this.save();
  }

  private load(): RecordsFile {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return emptyRecords();
      const d = JSON.parse(raw) as Partial<RecordsFile>;
      if (!d || d.v !== 1) return emptyRecords();
      const base = emptyRecords();
      const career = { ...base.career, ...(d.career ?? {}) };
      if (!Array.isArray(career.byRole) || career.byRole.length < 3) career.byRole = base.career.byRole;
      if (typeof career.byTrack !== 'object' || career.byTrack === null) career.byTrack = {};
      return { v: 1, laps: typeof d.laps === 'object' && d.laps ? d.laps : {}, races: typeof d.races === 'object' && d.races ? d.races : {}, career };
    } catch {
      return emptyRecords();
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* full or blocked: kept for this visit */
    }
  }
}

/** A time as the game shows one: 1:02.37, or 58.42 under a minute. */
export function fmtRecord(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
}

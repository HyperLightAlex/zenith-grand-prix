// Grand Prix: the offline events. Two kinds, both against the other four
// factions, both with a five-faction table filled by races the other
// factions run in the background:
//
//   Cup     Three single races, one per circuit, each against a different
//           faction. Not every faction races every round (five teams cannot
//           pair off), so the table ranks by average points per race.
//           First to third win gold, silver and bronze.
//   Season  A round robin: five matchdays, every faction plays the other
//           four once in a best-of-3 match and sits one matchday out. The
//           table ranks by matches won, then rounds won less lost, then
//           points. Top it to take the Zenith Cup.
//
// This module is plain logic over plain data (no DOM), so it saves as JSON
// and the background races can run in a worker or in a test.

import { ROLE, createMatch, createRace, recordRound, stepRace, buildTrack, trackById, PHASE, TRACKS, type SeatConfig, type MatchConfig } from '../sim/index';

export type GpKind = 'cup' | 'season';

export interface CupDef {
  id: string;
  name: string;
  /** Circuit ids, raced in this order. */
  circuits: string[];
}

/** The cups on offer. Each new circuit makes room for another. */
export const CUPS: CupDef[] = [{ id: 'horizon', name: 'Horizon Cup', circuits: ['meridian', 'canyon', 'helios'] }];

/** Difficulty names and the computer pilots' skill at each. */
export const GP_DIFFICULTY = ['Rookie', 'Pro', 'Ace'] as const;
export const GP_SKILL = [0.28, 0.55, 0.82] as const;
/** Your teammates' skill: the same at every difficulty, as in Free Play. */
export const GP_TEAMMATE_SKILL = 0.6;

export const MEDALS = ['gold', 'silver', 'bronze'] as const;
export type Medal = (typeof MEDALS)[number];

/** One race or match between two factions. */
export interface GpFixture {
  /** Factions (indexes into the liveries). `a` is you in your own fixture. */
  a: number;
  b: number;
  circuit: string;
  seed: number;
  /** Filled in once it has been played. */
  result: GpFixtureResult | null;
}

export interface GpFixtureResult {
  /** Rounds won by a and b (a single race is a match of one round). */
  wins: [number, number];
  /** Race points scored by a and b, all rounds together. */
  points: [number, number];
  /** Races run. */
  races: number;
  /** 0: a won, 1: b won. */
  winner: 0 | 1;
}

export interface GpRound {
  circuit: string;
  /** Your fixture, or null on a matchday you sit out (a season's bye). */
  you: GpFixture | null;
  /** The other factions' fixtures, raced in the background. */
  others: GpFixture[];
}

export interface GpEvent {
  v: 1;
  kind: GpKind;
  /** Which cup (cups only). */
  cup: string;
  difficulty: number;
  /** Your faction, fixed for the whole event. */
  faction: number;
  rounds: GpRound[];
  /** The round being played (equal to rounds.length once it is over). */
  current: number;
}

export interface GpRow {
  faction: number;
  /** Races (cup) or matches (season) played. */
  played: number;
  won: number;
  lost: number;
  /** Rounds won and lost (seasons). */
  roundsFor: number;
  roundsAgainst: number;
  points: number;
  races: number;
}

const FACTIONS = 5;

/** A tiny seeded generator, so a schedule is the same for the same seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], next: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const fixture = (a: number, b: number, circuit: string, next: () => number): GpFixture => ({ a, b, circuit, seed: Math.floor(next() * 1e9), result: null });

/** A new cup for `faction`. */
export function newCup(cupId: string, faction: number, difficulty: number, seed: number): GpEvent {
  const cup = CUPS.find((c) => c.id === cupId) ?? CUPS[0];
  const next = rng(seed);
  const o = shuffled(
    Array.from({ length: FACTIONS }, (_, f) => f).filter((f) => f !== faction),
    next,
  );
  // You race o0, o1, o2 in turn. o3, the one you never meet, races every
  // round in the background; the others race once more each.
  const pairs: Array<[number, [number, number]]> = [
    [o[0], [o[1], o[3]]],
    [o[1], [o[2], o[3]]],
    [o[2], [o[0], o[3]]],
  ];
  const rounds: GpRound[] = cup.circuits.slice(0, pairs.length).map((circuit, r) => ({
    circuit,
    you: fixture(faction, pairs[r][0], circuit, next),
    others: [fixture(pairs[r][1][0], pairs[r][1][1], circuit, next)],
  }));
  return { v: 1, kind: 'cup', cup: cup.id, difficulty: clampDifficulty(difficulty), faction, rounds, current: 0 };
}

/** The circuits a season visits, matchday by matchday (one hosts twice while there are only three). */
export function seasonCircuits(): string[] {
  const ids = TRACKS.map((t) => t.id);
  return Array.from({ length: FACTIONS }, (_, i) => ids[i % ids.length]);
}

/** A new season for `faction`: a five-matchday round robin. */
export function newSeason(faction: number, difficulty: number, seed: number): GpEvent {
  const next = rng(seed);
  // The circle method over five teams and a bye (-1).
  const teams = [faction, ...shuffled(Array.from({ length: FACTIONS }, (_, f) => f).filter((f) => f !== faction), next), -1];
  const circuits = seasonCircuits();
  const rounds: GpRound[] = [];
  const ring = teams.slice(1);
  for (let day = 0; day < FACTIONS; day++) {
    const order = [teams[0], ...ring];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < order.length / 2; i++) pairs.push([order[i], order[order.length - 1 - i]]);
    const circuit = circuits[day];
    let you: GpFixture | null = null;
    const others: GpFixture[] = [];
    for (const [a, b] of pairs) {
      if (a < 0 || b < 0) continue;
      if (a === faction || b === faction) you = fixture(faction, a === faction ? b : a, circuit, next);
      else others.push(fixture(a, b, circuit, next));
    }
    rounds.push({ circuit, you, others });
    ring.unshift(ring.pop()!);
  }
  // Your bye falls on the first matchday of the circle; move it into the
  // middle of the season, so it opens and closes with a match of yours.
  const bye = rounds.findIndex((r) => !r.you);
  if (bye >= 0) {
    const [r] = rounds.splice(bye, 1);
    rounds.splice(2, 0, r);
    rounds.forEach((rd, i) => {
      rd.circuit = circuits[i];
      if (rd.you) rd.you.circuit = circuits[i];
      for (const f of rd.others) f.circuit = circuits[i];
    });
  }
  return { v: 1, kind: 'season', cup: '', difficulty: clampDifficulty(difficulty), faction, rounds, current: 0 };
}

function clampDifficulty(d: number): number {
  return Math.max(0, Math.min(GP_DIFFICULTY.length - 1, Math.round(d) || 0));
}

/** The match format of an event's fixtures: a single race in a cup, best of 3 in a season. */
export function matchFormat(ev: GpEvent): MatchConfig {
  return ev.kind === 'cup' ? { mode: 'series', bestOf: 1, target: 50 } : { mode: 'series', bestOf: 3, target: 50 };
}

/** Display name of an event: the cup's, or the season's. */
export function eventName(ev: GpEvent): string {
  if (ev.kind === 'season') return 'Zenith Cup season';
  return CUPS.find((c) => c.id === ev.cup)?.name ?? 'Cup';
}

/** Rounds in which you race (a season has one matchday off). */
export function playedRounds(ev: GpEvent): number {
  return ev.rounds.filter((r) => r.you).length;
}

/** Your round number among the rounds you race in, for "Round 2 of 4". */
export function yourRoundNumber(ev: GpEvent, index = ev.current): number {
  return ev.rounds.slice(0, index + 1).filter((r) => r.you).length;
}

export function isOver(ev: GpEvent): boolean {
  return ev.current >= ev.rounds.length;
}

/** Background fixtures not yet played, earliest first. */
export function pendingFixtures(ev: GpEvent): GpFixture[] {
  return ev.rounds.flatMap((r) => r.others).filter((f) => !f.result);
}

/** Whether every fixture of rounds up to and including `index` has a result (yours included). */
export function roundComplete(ev: GpEvent, index: number): boolean {
  const r = ev.rounds[index];
  return !!r && (!r.you || !!r.you.result) && r.others.every((f) => !!f.result);
}

/** Record your own result for the current round. */
export function recordYours(ev: GpEvent, result: GpFixtureResult): void {
  const r = ev.rounds[ev.current];
  if (r?.you) r.you.result = result;
}

/**
 * Move on past the current round once its results are all in. A matchday
 * you sit out is passed over too, once its results are in. Returns whether
 * it moved.
 */
export function advance(ev: GpEvent): boolean {
  if (isOver(ev) || !roundComplete(ev, ev.current)) return false;
  ev.current++;
  return true;
}

/** The standings after rounds 0..upTo (inclusive), best first. */
export function standings(ev: GpEvent, upTo = ev.current): GpRow[] {
  const rows = new Map<number, GpRow>();
  for (let f = 0; f < FACTIONS; f++) rows.set(f, { faction: f, played: 0, won: 0, lost: 0, roundsFor: 0, roundsAgainst: 0, points: 0, races: 0 });
  ev.rounds.slice(0, upTo + 1).forEach((r) => {
    for (const fx of r.you ? [r.you, ...r.others] : r.others) {
      const res = fx.result;
      if (!res) continue;
      const a = rows.get(fx.a)!;
      const b = rows.get(fx.b)!;
      a.played++;
      b.played++;
      a.races += res.races;
      b.races += res.races;
      a.points += res.points[0];
      b.points += res.points[1];
      a.roundsFor += res.wins[0];
      a.roundsAgainst += res.wins[1];
      b.roundsFor += res.wins[1];
      b.roundsAgainst += res.wins[0];
      if (res.winner === 0) {
        a.won++;
        b.lost++;
      } else {
        b.won++;
        a.lost++;
      }
    }
  });
  const list = [...rows.values()];
  if (ev.kind === 'cup') list.sort((x, y) => average(y) - average(x) || y.points - x.points || y.won - x.won || x.faction - y.faction);
  else list.sort((x, y) => y.won - x.won || y.roundsFor - y.roundsAgainst - (x.roundsFor - x.roundsAgainst) || y.points - x.points || x.faction - y.faction);
  return list;
}

/** Average race points (the cup's ranking). */
export function average(row: GpRow): number {
  return row.races > 0 ? row.points / row.races : 0;
}

/** Where you finished, 1 to 5, on the final table. */
export function finalPlace(ev: GpEvent): number {
  return standings(ev, ev.rounds.length - 1).findIndex((r) => r.faction === ev.faction) + 1;
}

/** The cup's medal for a final place, or null. */
export function medalFor(place: number): Medal | null {
  return place >= 1 && place <= 3 ? MEDALS[place - 1] : null;
}

/** The better of two medals (null for none). */
export function betterMedal(a: Medal | null | undefined, b: Medal | null | undefined): Medal | null {
  const rank = (m: Medal | null | undefined) => (m ? MEDALS.indexOf(m) : 9);
  return rank(a) <= rank(b) ? (a ?? null) : (b ?? null);
}

// ---- the background races ---------------------------------------------------

/** The grid for a race between factions a (team 0) and b (team 1), every seat a computer pilot. */
export function backgroundSeats(skill: number, names: [string[], string[]]): SeatConfig[] {
  const seats: SeatConfig[] = [];
  for (const role of [ROLE.FW, ROLE.MF, ROLE.DF]) {
    for (let team = 0; team < 2; team++) seats.push({ team, role, human: false, name: names[team][role] ?? '', skill });
  }
  return seats;
}

/**
 * A background fixture raced a slice at a time: a single race, or a
 * best-of-3 series, between computer pilots of equal skill. Deterministic
 * for a seed, however it is sliced. The online Grand Prix runs its slices
 * between the server's other work; offline it runs whole in a worker.
 */
export class FixtureSim {
  private readonly track;
  private readonly match;
  private race: ReturnType<typeof createRace> | null = null;
  private races = 0;
  private guard = 0;
  result: GpFixtureResult | null = null;

  constructor(
    readonly fx: GpFixture,
    cfg: MatchConfig,
    private readonly skill: number,
    private readonly names: [string[], string[]] = [['', '', ''], ['', '', '']],
    /** Test setting: shorter races. */
    private readonly laps?: number,
  ) {
    this.track = buildTrack(trackById(fx.circuit) ?? TRACKS[0]);
    this.match = createMatch(cfg);
  }

  /** Race up to `ticks` more ticks; the result once the match is decided. */
  step(ticks: number): GpFixtureResult | null {
    while (!this.result && ticks > 0) {
      if (!this.race) {
        if (this.match.winner >= 0 || this.races >= 9) {
          const m = this.match;
          this.result = { wins: [m.wins[0], m.wins[1]], points: [m.totals[0], m.totals[1]], races: this.races, winner: (m.winner === 1 ? 1 : 0) as 0 | 1 };
          break;
        }
        this.race = createRace(this.track, { seed: this.fx.seed + this.races * 7919, seats: backgroundSeats(this.skill, this.names), gridFlip: this.races % 2 === 1, laps: this.laps });
        this.guard = 0;
      }
      const race = this.race;
      while (race.phase !== PHASE.FINISHED && this.guard < 60 * 60 * 10 && ticks > 0) {
        stepRace(race, this.track, []);
        this.guard++;
        ticks--;
      }
      if (race.phase === PHASE.FINISHED || this.guard >= 60 * 60 * 10) {
        recordRound(this.match, race);
        this.races++;
        this.race = null;
      }
    }
    // A decided match whose last race ended on the final tick of a slice.
    if (!this.result && !this.race && (this.match.winner >= 0 || this.races >= 9)) this.step(1);
    return this.result;
  }
}

/**
 * Race a background fixture to its end: a single race, or a best-of-3
 * series, between computer pilots of equal skill. Deterministic for a seed.
 * Takes a second or so per race.
 */
export function simulateFixture(fx: GpFixture, cfg: MatchConfig, skill: number, names: [string[], string[]] = [['', '', ''], ['', '', '']]): GpFixtureResult {
  const sim = new FixtureSim(fx, cfg, skill, names);
  let result: GpFixtureResult | null = null;
  while (!result) result = sim.step(1e9);
  return result;
}

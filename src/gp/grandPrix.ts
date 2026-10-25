// Grand Prix: the events. Three kinds, all against the other four
// factions, all with a five-faction table filled by races the other
// factions run in the background:
//
//   Cup     Three single races, one per circuit, each against a different
//           faction: the Horizon Cup (Meridian, Canyon, Helios), the
//           Frontier Cup (the Crucible, Frostline, Titan's Rest) and the
//           Ascent Cup (Abyss Line, Monsoon Ruins, Zenith Ring). Not every
//           faction races every round (five teams cannot pair off), so the
//           table ranks by average points per race. First to third win
//           gold, silver and bronze. A cup opens once the one before it
//           has given a medal.
//   Tour    The Grand Tour: nine single races, every circuit in turn, from
//           Meridian to Zenith Ring. You meet each rival twice in the first
//           eight; the ninth, at Zenith Ring, is a decider against whoever
//           is nearest you on the table. Ranked and medalled as a cup; open
//           once all three cups have given a medal.
//   Season  A double round robin: ten matchdays, every faction plays every
//           other twice in a best-of-3 match and sits two matchdays out.
//           Each half visits four circuits and ends at Zenith Ring. The
//           table ranks by matches won, then rounds won less lost, then
//           points. Top it to take the Zenith Cup. Online, where an event
//           cannot be put away and taken up later, a short season: one
//           round robin, five matchdays, four circuits drawn for it, then
//           Zenith Ring.
//
// This module is plain logic over plain data (no DOM), so it saves as JSON
// and the background races can run in a worker or in a test.

import { ROLE, createMatch, createRace, recordRound, stepRace, sharedTrack, trackById, PHASE, TRACKS, type SeatConfig, type MatchConfig } from '../sim/index';

export type GpKind = 'cup' | 'tour' | 'season';

export interface CupDef {
  id: string;
  name: string;
  /** Circuit ids, raced in this order. */
  circuits: string[];
}

/** The cups on offer, in the order they open. */
export const CUPS: CupDef[] = [
  { id: 'horizon', name: 'Horizon Cup', circuits: ['meridian', 'canyon', 'helios'] },
  { id: 'frontier', name: 'Frontier Cup', circuits: ['crucible', 'frostline', 'titan'] },
  { id: 'ascent', name: 'Ascent Cup', circuits: ['abyss', 'monsoon', 'zenith'] },
];

/** The Grand Tour's id, where its medals are kept with the cups'. */
export const TOUR_ID = 'tour';
/** Where every season ends (and its first half). */
export const FINALE = 'zenith';

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
  /** The Grand Tour's last round, its rival not yet chosen (it is the one nearest you on the table once the round before is in). */
  decider?: boolean;
  /** Your fixture, or null on a matchday you sit out (a season's bye). */
  you: GpFixture | null;
  /** The other factions' fixtures, raced in the background. */
  others: GpFixture[];
}

export interface GpEvent {
  v: 1;
  kind: GpKind;
  /** Which cup (cups), or TOUR_ID (the Grand Tour); '' for a season. */
  cup: string;
  /** A season of one round robin (the short season, online), not two. */
  short?: boolean;
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

/** Every circuit but the finale, in the order of the list. */
function field(): string[] {
  return TRACKS.map((t) => t.id).filter((id) => id !== FINALE);
}

/**
 * The circuits a season visits, matchday by matchday. A full season's two
 * halves each visit four circuits, in the list's order, and end at Zenith
 * Ring; a short season draws four (shown in the list's order) and ends there.
 */
export function seasonCircuits(short = false, next: () => number = rng(1)): string[] {
  const ids = field();
  if (short) {
    const drawn = new Set(shuffled(ids, next).slice(0, 4));
    return [...ids.filter((id) => drawn.has(id)), FINALE];
  }
  return [...ids.slice(0, 4), FINALE, ...ids.slice(4, 8), FINALE];
}

/**
 * One round robin over the five factions (the circle method, with a bye):
 * five matchdays of two pairings, each faction sitting one out, yours in
 * the middle, so it opens and closes with a match of yours.
 */
function roundRobin(faction: number, next: () => number): Array<Array<[number, number]>> {
  const teams = [faction, ...shuffled(Array.from({ length: FACTIONS }, (_, f) => f).filter((f) => f !== faction), next), -1];
  const ring = teams.slice(1);
  const days: Array<Array<[number, number]>> = [];
  for (let day = 0; day < FACTIONS; day++) {
    const order = [teams[0], ...ring];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < order.length / 2; i++) if (order[i] >= 0 && order[order.length - 1 - i] >= 0) pairs.push([order[i], order[order.length - 1 - i]]);
    days.push(pairs);
    ring.unshift(ring.pop()!);
  }
  const bye = days.findIndex((d) => !d.some(([a, b]) => a === faction || b === faction));
  if (bye >= 0) {
    const [d] = days.splice(bye, 1);
    days.splice(2, 0, d);
  }
  return days;
}

/** A matchday's round from its pairings, on `circuit`. */
function matchday(faction: number, pairs: Array<[number, number]>, circuit: string, next: () => number): GpRound {
  let you: GpFixture | null = null;
  const others: GpFixture[] = [];
  for (const [a, b] of pairs) {
    if (a === faction || b === faction) you = fixture(faction, a === faction ? b : a, circuit, next);
    else others.push(fixture(a, b, circuit, next));
  }
  return { circuit, you, others };
}

/**
 * A new season for `faction`: a double round robin (ten matchdays; the
 * second half meets everyone again), or with `short` one round robin of five.
 */
export function newSeason(faction: number, difficulty: number, seed: number, opts: { short?: boolean } = {}): GpEvent {
  const next = rng(seed);
  const short = !!opts.short;
  const half = roundRobin(faction, next);
  // The second half: the same pairings, in another order that keeps your
  // matchday off in its middle and never starts with the rival the first
  // half ended with.
  const days = short ? half : [...half, half[3], half[4], half[2], half[0], half[1]];
  const circuits = seasonCircuits(short, next);
  const rounds = days.map((pairs, i) => matchday(faction, pairs, circuits[i], next));
  return { v: 1, kind: 'season', cup: '', ...(short ? { short: true } : {}), difficulty: clampDifficulty(difficulty), faction, rounds, current: 0 };
}

/**
 * A new Grand Tour for `faction`: every circuit, in the list's order. You
 * meet each rival twice in the first eight rounds (never the same one twice
 * running); in each, of the other three, two race each other and one sits
 * out, each of them twice. The last round, at Zenith Ring, is settled once
 * the one before it is in (see advance).
 */
export function newTour(faction: number, difficulty: number, seed: number): GpEvent {
  const next = rng(seed);
  const circuits = [...field(), FINALE];
  const rivals = shuffled(
    Array.from({ length: FACTIONS }, (_, f) => f).filter((f) => f !== faction),
    next,
  );
  let second = shuffled(rivals, next);
  while (second[0] === rivals[3]) second = shuffled(rivals, next);
  const order = [...rivals, ...second];
  const out = new Map<number, number>(rivals.map((f) => [f, 0]));
  const rounds: GpRound[] = [];
  for (let r = 0; r < order.length; r++) {
    const rest = rivals.filter((f) => f !== order[r]);
    // Who sits out: whoever has sat out least, and has the fewest chances left to.
    const left = (f: number) => order.slice(r + 1).filter((o) => o !== f).length;
    const sits = [...rest].sort((x, y) => out.get(x)! - out.get(y)! || left(x) - left(y) || x - y)[0];
    out.set(sits, out.get(sits)! + 1);
    const pair = rest.filter((f) => f !== sits);
    const circuit = circuits[r];
    rounds.push({ circuit, you: fixture(faction, order[r], circuit, next), others: [fixture(pair[0], pair[1], circuit, next)] });
  }
  // The decider: its rival and the others' race chosen when it comes.
  const circuit = circuits[order.length];
  rounds.push({ circuit, decider: true, you: fixture(faction, rivals[0], circuit, next), others: [] });
  return { v: 1, kind: 'tour', cup: TOUR_ID, difficulty: clampDifficulty(difficulty), faction, rounds, current: 0 };
}

/**
 * The Grand Tour's decider, once the rounds before it are in: you against
 * the faction just above you on the table (just below, if you lead it); of
 * the other three, the one who has raced most sits out and the other two
 * race each other.
 */
function settleDecider(ev: GpEvent, index: number): void {
  const r = ev.rounds[index];
  if (!r?.decider || !r.you) return;
  const table = standings(ev, index - 1);
  const at = table.findIndex((row) => row.faction === ev.faction);
  const rival = table[at > 0 ? at - 1 : at + 1].faction;
  const rest = table.filter((row) => row.faction !== ev.faction && row.faction !== rival);
  const sits = [...rest].sort((x, y) => y.races - x.races || x.points - y.points || x.faction - y.faction)[0].faction;
  const pair = rest.map((row) => row.faction).filter((f) => f !== sits);
  const seed = r.you.seed;
  r.you = { a: ev.faction, b: rival, circuit: r.circuit, seed, result: null };
  r.others = [{ a: pair[0], b: pair[1], circuit: r.circuit, seed: (seed * 7 + 12345) % 1e9, result: null }];
  r.decider = false;
}

function clampDifficulty(d: number): number {
  return Math.max(0, Math.min(GP_DIFFICULTY.length - 1, Math.round(d) || 0));
}

/** Whether an event is raced in single races, ranked by average points and medalled (a cup or the Grand Tour), rather than a season. */
export function singleRaces(ev: { kind: GpKind }): boolean {
  return ev.kind !== 'season';
}

/** The match format of an event's fixtures: a single race in a cup or the Grand Tour, best of 3 in a season. */
export function matchFormat(ev: GpEvent): MatchConfig {
  return singleRaces(ev) ? { mode: 'series', bestOf: 1, target: 50 } : { mode: 'series', bestOf: 3, target: 50 };
}

/** Display name of an event: the cup's, the Grand Tour, or the season's. */
export function eventName(ev: GpEvent): string {
  if (ev.kind === 'season') return ev.short ? 'Zenith Cup short season' : 'Zenith Cup season';
  if (ev.kind === 'tour') return 'Grand Tour';
  return CUPS.find((c) => c.id === ev.cup)?.name ?? 'Cup';
}

/** Whether a cup is open: the first always; each other once the one before it has given a medal (any, at any difficulty). */
export function cupOpen(cupId: string, medals: Record<string, Record<number, Medal | undefined>>): boolean {
  const i = CUPS.findIndex((c) => c.id === cupId);
  if (i <= 0) return true;
  return Object.values(medals[CUPS[i - 1].id] ?? {}).some((m) => !!m);
}

/** Whether the Grand Tour is open: every cup has given a medal. */
export function tourOpen(medals: Record<string, Record<number, Medal | undefined>>): boolean {
  return CUPS.every((c) => Object.values(medals[c.id] ?? {}).some((m) => !!m));
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
  settleDecider(ev, ev.current);
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
  if (singleRaces(ev)) list.sort((x, y) => average(y) - average(x) || y.points - x.points || y.won - x.won || x.faction - y.faction);
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
    this.track = sharedTrack(trackById(fx.circuit) ?? TRACKS[0]);
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

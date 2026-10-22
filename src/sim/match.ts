// A match is one or more races ("rounds") between the same sides: two teams,
// or in a Sprint every pilot (each its own team). This layer only keeps
// score: it never touches a race in progress, so the race simulation stays
// exactly the same whichever mode is being played.
//
// Team races:
//   series   Best of 1, 3 or 5. A round goes to the team with more points;
//            level on points, it goes to the team whose mech came home first.
//   points   Round points add up. The first team to reach the target at the
//            end of a round wins the match.
// Sprints (a round goes to the pilot who wins the race; points by place):
//   races    A set number of races (1, 3 or 5); the most points after them
//            wins (level: the more race wins, then the better finish in the
//            last race). One race is a single race: its winner wins.
//   wins     The first to win `wins` races, or after `races` races (the cap:
//            six pilots could trade wins a long time) the most race wins
//            (level: the more points, then the better finish in the last race).

import { koBonus, pointsFor } from './sim';
import type { RaceState } from './types';

export type MatchMode = 'series' | 'points' | 'races' | 'wins';

export interface MatchConfig {
  mode: MatchMode;
  /** Series: 1, 3 or 5 rounds. */
  bestOf: number;
  /** Points race: total needed to win. */
  target: number;
  /** Sprint: the races to run ('races'), or the most to run ('wins'). */
  races?: number;
  /** Sprint 'wins': race wins needed. */
  wins?: number;
}

export const DEFAULT_MATCH: Readonly<MatchConfig> = Object.freeze({ mode: 'series', bestOf: 3, target: 50 });

/** Whether a match's format is a Sprint's (every pilot for themselves). */
export function isSprintFormat(cfg: Pick<MatchConfig, 'mode'>): boolean {
  return cfg.mode === 'races' || cfg.mode === 'wins';
}

export interface RoundResult {
  round: number;
  /** Round points per side (team, or Sprint pilot): placing points, knockout points and support points. */
  points: number[];
  place: number[];
  ko: number[];
  support: number[];
  /** Each side's best place (1 for the race winner's; a wreck's counts, below every finisher's). */
  rank: number[];
  /** Side of the mech classified first. */
  first: number;
  /** The points were level and the round was settled on who came home first. */
  tied: boolean;
  winner: number;
}

export interface MatchState {
  cfg: MatchConfig;
  rounds: RoundResult[];
  /** Rounds won per side. */
  wins: number[];
  /** Points across all rounds per side. */
  totals: number[];
  /** -1 while the match is still being played. */
  winner: number;
}

/**
 * A fresh match. `sides`: how many sides score (2 teams; a Sprint's pilots).
 * A Sprint's formats are 'races' and 'wins'; a team race's 'series' and 'points'.
 */
export function createMatch(cfg?: Partial<MatchConfig> | null, sides = 2): MatchState {
  const n = Math.max(2, sides | 0);
  if (cfg?.mode === 'races' || cfg?.mode === 'wins') {
    if (cfg.mode === 'races') {
      const races = cfg.races === 1 || cfg.races === 5 ? cfg.races : 3;
      return { cfg: { mode: 'races', bestOf: 1, target: 0, races }, rounds: [], wins: new Array(n).fill(0), totals: new Array(n).fill(0), winner: -1 };
    }
    const wins = cfg.wins === 3 ? 3 : 2;
    return { cfg: { mode: 'wins', bestOf: 1, target: 0, wins, races: wins * 2 + 1 }, rounds: [], wins: new Array(n).fill(0), totals: new Array(n).fill(0), winner: -1 };
  }
  const mode = cfg?.mode === 'points' ? 'points' : 'series';
  const bestOf = cfg?.bestOf === 1 || cfg?.bestOf === 5 ? cfg.bestOf : 3;
  const target = typeof cfg?.target === 'number' && Number.isFinite(cfg.target) ? Math.max(1, Math.round(cfg.target)) : DEFAULT_MATCH.target;
  return { cfg: { mode, bestOf, target }, rounds: [], wins: new Array(n).fill(0), totals: new Array(n).fill(0), winner: -1 };
}

/** Round wins needed to take a team series. */
export function roundsToWin(cfg: MatchConfig): number {
  return Math.floor(cfg.bestOf / 2) + 1;
}

/** Score a finished (or running) race as a round, without recording it. */
export function scoreRound(race: RaceState, round = 1): RoundResult {
  const n = race.teams.length;
  const place = new Array(n).fill(0);
  const ko = new Array(n).fill(0);
  const support = new Array(n).fill(0);
  const rank = new Array(n).fill(race.mechs.length);
  let first = 0;
  for (const m of race.mechs) {
    place[m.team] += pointsFor(m, race.sprint);
    ko[m.team] += koBonus(race, m);
    support[m.team] += m.support;
    rank[m.team] = Math.min(rank[m.team], m.place);
    if (m.place === 1) first = m.team;
  }
  const points = place.map((p, i) => p + ko[i] + support[i]);
  if (race.sprint) {
    // A Sprint's round is the race: its winner takes it.
    return { round, points, place, ko, support, rank, first, tied: false, winner: first };
  }
  const tied = points[0] === points[1];
  const winner = tied ? first : points[0] > points[1] ? 0 : 1;
  return { round, points, place, ko, support, rank, first, tied, winner };
}

/** The side ahead by these measures in turn (each: higher is better), or -1 for none. */
function ahead(sides: number, ...by: Array<(i: number) => number>): number {
  let best = -1;
  for (let i = 0; i < sides; i++) {
    if (best < 0) {
      best = i;
      continue;
    }
    for (const f of by) {
      const d = f(i) - f(best);
      if (d > 0) best = i;
      if (d !== 0) break;
    }
  }
  return best;
}

/**
 * Add a finished race to the match and work out whether the match is over.
 * A match that has been decided stays decided: a further race is scored and
 * returned, but not recorded.
 */
export function recordRound(match: MatchState, race: RaceState): RoundResult {
  const r = scoreRound(race, match.rounds.length + 1);
  if (match.winner >= 0) return r;
  const n = Math.max(match.wins.length, r.points.length);
  while (match.wins.length < n) match.wins.push(0);
  while (match.totals.length < n) match.totals.push(0);
  match.rounds.push(r);
  match.wins[r.winner]++;
  for (let i = 0; i < r.points.length; i++) match.totals[i] += r.points[i];
  const cfg = match.cfg;
  // Ties in a Sprint fall to the better finish in the last race.
  const lastFinish = (i: number) => -(r.rank[i] ?? 99);
  if (cfg.mode === 'series') {
    const need = roundsToWin(cfg);
    if (match.wins[0] >= need) match.winner = 0;
    else if (match.wins[1] >= need) match.winner = 1;
  } else if (cfg.mode === 'points') {
    if (match.totals[0] >= cfg.target || match.totals[1] >= cfg.target) {
      // Both over the line in the same round: the bigger total, then that round's winner.
      match.winner = match.totals[0] === match.totals[1] ? r.winner : match.totals[0] > match.totals[1] ? 0 : 1;
    }
  } else if (cfg.mode === 'races') {
    if (match.rounds.length >= (cfg.races ?? 3)) match.winner = ahead(n, (i) => match.totals[i], (i) => match.wins[i], lastFinish);
  } else if (match.wins[r.winner] >= (cfg.wins ?? 2)) {
    match.winner = r.winner;
  } else if (match.rounds.length >= (cfg.races ?? 5)) {
    match.winner = ahead(n, (i) => match.wins[i], (i) => match.totals[i], lastFinish);
  }
  return r;
}

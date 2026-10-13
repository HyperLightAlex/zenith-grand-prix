// A match is one or more races ("rounds") between the same two teams. This
// layer only keeps score: it never touches a race in progress, so the race
// simulation stays exactly the same whichever mode is being played.
//
//   series   Best of 1, 3 or 5. A round goes to the team with more points;
//            level on points, it goes to the team whose mech came home first.
//   points   Round points add up. The first team to reach the target at the
//            end of a round wins the match.

import { koBonus, pointsFor } from './sim';
import type { RaceState } from './types';

export type MatchMode = 'series' | 'points';

export interface MatchConfig {
  mode: MatchMode;
  /** Series: 1, 3 or 5 rounds. */
  bestOf: number;
  /** Points race: total needed to win. */
  target: number;
}

export const DEFAULT_MATCH: Readonly<MatchConfig> = Object.freeze({ mode: 'series', bestOf: 3, target: 50 });

export interface RoundResult {
  round: number;
  /** Round points per team: placing points, knockout points and support points. */
  points: [number, number];
  place: [number, number];
  ko: [number, number];
  support: [number, number];
  /** Team of the mech classified first. */
  first: number;
  /** The points were level and the round was settled on who came home first. */
  tied: boolean;
  winner: number;
}

export interface MatchState {
  cfg: MatchConfig;
  rounds: RoundResult[];
  /** Rounds won per team. */
  wins: [number, number];
  /** Points across all rounds per team. */
  totals: [number, number];
  /** -1 while the match is still being played. */
  winner: number;
}

export function createMatch(cfg?: Partial<MatchConfig> | null): MatchState {
  const mode: MatchMode = cfg?.mode === 'points' ? 'points' : 'series';
  const bestOf = cfg?.bestOf === 1 || cfg?.bestOf === 5 ? cfg.bestOf : 3;
  const target = typeof cfg?.target === 'number' && Number.isFinite(cfg.target) ? Math.max(1, Math.round(cfg.target)) : DEFAULT_MATCH.target;
  return { cfg: { mode, bestOf, target }, rounds: [], wins: [0, 0], totals: [0, 0], winner: -1 };
}

/** Round wins needed to take a series. */
export function roundsToWin(cfg: MatchConfig): number {
  return Math.floor(cfg.bestOf / 2) + 1;
}

/** Score a finished (or running) race as a round, without recording it. */
export function scoreRound(race: RaceState, round = 1): RoundResult {
  const place: [number, number] = [0, 0];
  const ko: [number, number] = [0, 0];
  const support: [number, number] = [0, 0];
  let first = 0;
  for (const m of race.mechs) {
    place[m.team] += pointsFor(m);
    ko[m.team] += koBonus(race, m);
    support[m.team] += m.support;
    if (m.place === 1) first = m.team;
  }
  const points: [number, number] = [place[0] + ko[0] + support[0], place[1] + ko[1] + support[1]];
  const tied = points[0] === points[1];
  const winner = tied ? first : points[0] > points[1] ? 0 : 1;
  return { round, points, place, ko, support, first, tied, winner };
}

/**
 * Add a finished race to the match and work out whether the match is over.
 * A match that has been decided stays decided: a further race is scored and
 * returned, but not recorded.
 */
export function recordRound(match: MatchState, race: RaceState): RoundResult {
  const r = scoreRound(race, match.rounds.length + 1);
  if (match.winner >= 0) return r;
  match.rounds.push(r);
  match.wins[r.winner]++;
  match.totals[0] += r.points[0];
  match.totals[1] += r.points[1];
  if (match.cfg.mode === 'series') {
    const need = roundsToWin(match.cfg);
    if (match.wins[0] >= need) match.winner = 0;
    else if (match.wins[1] >= need) match.winner = 1;
  } else if (match.totals[0] >= match.cfg.target || match.totals[1] >= match.cfg.target) {
    // Both over the line in the same round: the bigger total, then that round's winner.
    match.winner = match.totals[0] === match.totals[1] ? r.winner : match.totals[0] > match.totals[1] ? 0 : 1;
  }
  return r;
}

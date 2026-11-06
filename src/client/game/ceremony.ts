// The ceremony at the end of a match or an event (and only then): who stands
// on the podium, and the mentions and the table read out after it.
//
//   A Sprint      its first three pilots by the match's standings, a mech
//                 to a step (the pilots' podium); none behind the winner
//                 with no points (out of a single race, say).
//   A team match  the winners only: their three, their best first (the
//                 match's MVP of them on the top step), a mech to a step.
//   A Grand Prix  the event's first three factions by its final table, a
//                 team to a step (the teams' podium), each its best first;
//                 a cup's or the Grand Tour's medals on them, and the
//                 trophy on the winners'.
//   A Sprint      (the Sprint series's cups and Tour) its first three pilots
//   event         by its final table, a mech to a step (the pilots'
//                 podium), their medals on them and the trophy on the
//                 winner's.
//
// Plain logic over the match's and the event's ledgers (sim/ledger.ts).

import { AWARD_COUNT, ROLE, byPoints, mentions, standings as matchStandings, teamOrder, seatKey, type MatchState, type Mention, type PilotLine } from '../../sim/index';
import { finalPlace, medalFor, singleRaces, sprintStandings, standings as eventStandings, type GpEvent, type Medal } from '../../gp/grandPrix';
import { PILOT_NAMES } from '../../net/factions';

export interface CeremonyStep {
  /** Who stands on it, its leader first (on the pilots' podium, one). */
  pilots: PilotLine[];
  /** Whose place it is: a team in the match, a Sprint's pilot, or an event's faction. */
  side: number;
  /** An event's medal for it (a cup's, the Grand Tour's). */
  medal: Medal | null;
}

export interface Ceremony {
  kind: 'sprint' | 'team' | 'event';
  layout: 'pilots' | 'teams';
  /** First to third. */
  steps: CeremonyStep[];
  /** Everyone in it, best first: the readout's table. */
  lines: PilotLine[];
  mentions: Mention[];
  /** An event's trophy on the winners' step. */
  trophy: boolean;
}

/** The ceremony at a match's end (none while it is still being played). */
export function matchCeremony(match: MatchState | null, sprint: boolean): Ceremony | null {
  if (!match || match.winner < 0) return null;
  const lines = [...(match.pilots ?? [])].sort(byPoints);
  if (!lines.length) return null;
  let steps: CeremonyStep[];
  if (sprint) {
    // (Each pilot its own side.)
    steps = matchStandings(match)
      .slice(0, 3)
      .map((side) => ({ pilots: lines.filter((l) => l.team === side).slice(0, 1), side, medal: null }))
      .filter((s, place) => s.pilots.length > 0 && (place === 0 || s.pilots[0].points > 0));
  } else {
    steps = teamOrder(lines, match.winner)
      .slice(0, 3)
      .map((l) => ({ pilots: [l], side: match.winner, medal: null }));
  }
  return { kind: sprint ? 'sprint' : 'team', layout: 'pilots', steps, lines, mentions: mentions(lines), trophy: false };
}

/** A faction's seat with no line in the event (it never met you): its pilot for the role, nothing scored. */
function standIn(faction: number, role: number): PilotLine {
  return {
    id: seatKey(faction, role),
    name: PILOT_NAMES[faction]?.[role] ?? '',
    team: -1,
    role,
    human: false,
    portrait: -1,
    look: '',
    colour: -1,
    faction,
    races: 0,
    wins: 0,
    podiums: 0,
    placing: 0,
    koPts: 0,
    support: 0,
    awards: new Array(AWARD_COUNT).fill(0),
    kos: 0,
    out: 0,
    dmgDealt: 0,
    dmgTaken: 0,
    points: 0,
  };
}

/**
 * A faction's three for its step: its best first (by what they scored in
 * your races), any seat it never raced you in filled by its own pilot.
 * One that never met you stands forward first, then midfielder, defender.
 */
export function factionTeam(ev: GpEvent, faction: number): PilotLine[] {
  const raced = (ev.pilots ?? []).filter((l) => l.faction === faction);
  const all = [ROLE.FW, ROLE.MF, ROLE.DF].map((role) => raced.find((l) => l.role === role) ?? standIn(faction, role));
  return raced.length ? all.sort(byPoints) : all;
}

/** The ceremony at an event's end (none before). */
export function eventCeremony(ev: GpEvent | null): Ceremony | null {
  if (!ev || ev.current < ev.rounds.length) return null;
  if (ev.sprint) return sprintEventCeremony(ev);
  const table = eventStandings(ev, ev.rounds.length - 1);
  const medals = singleRaces(ev);
  const steps = table.slice(0, 3).map((row, i) => ({ pilots: factionTeam(ev, row.faction), side: row.faction, medal: medals ? medalFor(i + 1) : null }));
  const lines = [...(ev.pilots ?? [])].sort(byPoints);
  return { kind: 'event', layout: 'teams', steps, lines, mentions: mentions(lines), trophy: true };
}

/** Where you finished an event, and your medal if any (as the award has it). */
export function eventAward(ev: GpEvent): { place: number; medal: Medal | null } {
  const place = finalPlace(ev);
  return { place, medal: singleRaces(ev) ? medalFor(place) : null };
}

/**
 * A Sprint event's: its first three pilots by the final table, a mech to a
 * step; and every pilot read out in the table's order (each its line in the
 * event, by seat: 0 you, f + 1 faction f's pilot).
 */
function sprintEventCeremony(ev: GpEvent): Ceremony {
  const table = sprintStandings(ev, ev.rounds.length - 1);
  const lineOf = (seat: number): PilotLine => (ev.pilots ?? []).find((l) => l.id === seat) ?? { ...standIn(seat - 1, ROLE.FW), id: seat, team: seat };
  const lines = table.map((row) => lineOf(row.seat));
  const steps = table.slice(0, 3).map((row, i) => ({ pilots: [lineOf(row.seat)], side: row.seat, medal: medalFor(i + 1) }));
  return { kind: 'event', layout: 'pilots', steps, lines, mentions: mentions(lines), trophy: true };
}

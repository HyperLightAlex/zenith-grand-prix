// The pilots' ledger: each pilot's scoring and contribution added up over a
// match (and, in a Grand Prix, over the event's races you ran), for the
// ceremony at its end: where their points came from (placing, knockouts,
// support, and the support by kind), what they did (damage dealt and taken,
// knockouts, race wins, podium finishes), and the mentions it hands out
// whatever the result (the MVP, the most knockouts, the best support...).
//
// Plain data: it travels with the match online (match.ts) and saves with an
// event (gp/grandPrix.ts).

import { AWARD_COUNT } from './config';
import { koBonus, pointsFor } from './sim';
import type { RaceState } from './types';

export interface PilotLine {
  /** The seat in its match (its mech's id); in an event, its faction's seat (`seatKey`). */
  id: number;
  name: string;
  /** Its side in the match (its team; in a Sprint, itself). */
  team: number;
  role: number;
  human: boolean;
  /** As the mech shows it (sim/types MechState). */
  portrait: number;
  look: string;
  colour: number;
  /** In a Grand Prix, its faction; -1 elsewhere. */
  faction: number;
  /** Races run, won, and finished in the first three. */
  races: number;
  wins: number;
  podiums: number;
  /** Where its points came from: placing, knockouts (none in a Sprint), support (and by award kind, AWARD). */
  placing: number;
  koPts: number;
  support: number;
  awards: number[];
  /** Rivals it knocked out; times it was knocked out. */
  kos: number;
  out: number;
  dmgDealt: number;
  dmgTaken: number;
  /** All its points: placing, knockouts and support. */
  points: number;
}

/** In an event, a pilot is its faction's seat for its role. */
export function seatKey(faction: number, role: number): number {
  return faction * 3 + role;
}

/** Add a finished race to the ledger, each mech to its own line (`key`: which; its id by default). */
export function addRace(lines: PilotLine[], race: RaceState, key: (id: number) => number = (id) => id, faction: (team: number) => number = () => -1): void {
  for (const m of race.mechs) {
    const id = key(m.id);
    let l = lines.find((x) => x.id === id);
    if (!l) {
      l = { id, name: m.name, team: m.team, role: m.role, human: m.human, portrait: m.portrait, look: m.look, colour: m.colour, faction: faction(m.team), races: 0, wins: 0, podiums: 0, placing: 0, koPts: 0, support: 0, awards: new Array(AWARD_COUNT).fill(0), kos: 0, out: 0, dmgDealt: 0, dmgTaken: 0, points: 0 };
      lines.push(l);
    }
    // (Whoever holds the seat now: a person who took over a computer's seat online, a new look.)
    l.name = m.name;
    l.human = m.human;
    l.portrait = m.portrait;
    l.look = m.look;
    l.colour = m.colour;
    l.races++;
    if (!m.retired && m.place === 1) l.wins++;
    if (!m.retired && m.place <= 3) l.podiums++;
    const placing = pointsFor(m, race.sprint);
    const ko = koBonus(race, m);
    l.placing += placing;
    l.koPts += ko;
    l.support += m.support;
    for (let k = 0; k < AWARD_COUNT; k++) l.awards[k] = (l.awards[k] ?? 0) + (m.awardPts[k] ?? 0);
    l.kos += m.kos;
    if (m.retired) l.out++;
    l.dmgDealt += Math.round(m.dmgDealt);
    l.dmgTaken += Math.round(m.dmgTaken);
    l.points += placing + ko + m.support;
  }
}

/** Fold one ledger into another (an event's: a match's lines, each under its event seat). */
export function addLines(into: PilotLine[], from: readonly PilotLine[], key: (l: PilotLine) => number, faction: (l: PilotLine) => number): void {
  for (const f of from) {
    const id = key(f);
    let l = into.find((x) => x.id === id);
    if (!l) {
      l = { ...f, id, faction: faction(f), awards: new Array(AWARD_COUNT).fill(0), races: 0, wins: 0, podiums: 0, placing: 0, koPts: 0, support: 0, kos: 0, out: 0, dmgDealt: 0, dmgTaken: 0, points: 0 };
      into.push(l);
    }
    l.name = f.name;
    l.human = f.human;
    l.portrait = f.portrait;
    l.look = f.look;
    l.colour = f.colour;
    l.team = f.team;
    l.races += f.races;
    l.wins += f.wins;
    l.podiums += f.podiums;
    l.placing += f.placing;
    l.koPts += f.koPts;
    l.support += f.support;
    for (let k = 0; k < AWARD_COUNT; k++) l.awards[k] = (l.awards[k] ?? 0) + (f.awards[k] ?? 0);
    l.kos += f.kos;
    l.out += f.out;
    l.dmgDealt += f.dmgDealt;
    l.dmgTaken += f.dmgTaken;
    l.points += f.points;
  }
}

/** Best first: by points, then race wins, placing points, damage dealt; then by seat. */
export function byPoints(a: PilotLine, b: PilotLine): number {
  return b.points - a.points || b.wins - a.wins || b.placing - a.placing || b.dmgDealt - a.dmgDealt || a.id - b.id;
}

/** A team's pilots, its best first (the MVP of a winning team stands on the top step). */
export function teamOrder(lines: readonly PilotLine[], team: number): PilotLine[] {
  return lines.filter((l) => l.team === team).sort(byPoints);
}

export type MentionKind = 'mvp' | 'racer' | 'kos' | 'support' | 'damage' | 'ironclad';

/** A mention at the end: what for, who (a line's id), and the number it is for. */
export interface Mention {
  kind: MentionKind;
  id: number;
  value: number;
}

export const MENTION_NAMES: Record<MentionKind, string> = {
  mvp: 'MVP',
  racer: 'Top racer',
  kos: 'Most knockouts',
  support: 'Best support',
  damage: 'Heavy hitter',
  ironclad: 'Ironclad',
};

/** What each mention is for, under its name. */
export function mentionLine(m: Mention): string {
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  switch (m.kind) {
    case 'mvp':
      return `Most points: ${m.value}`;
    case 'racer':
      return `Most placing points: ${m.value}`;
    case 'kos':
      return n(m.value, 'knockout', 'knockouts');
    case 'support':
      return `${n(m.value, 'support point', 'support points')}`;
    case 'damage':
      return `${m.value} damage dealt`;
    case 'ironclad':
      return `Never knocked out, ${m.value} damage taken`;
  }
}

/**
 * The mentions, whatever the result: the MVP (the most points), the top
 * racer (the most placing points, when that is not the MVP), the most
 * knockouts, the best support, the heaviest hitter, and the ironclad (never
 * knocked out in any race run, the least damage taken). Each only when
 * someone earned it (none for no knockouts, no support, no fighting).
 */
export function mentions(lines: readonly PilotLine[]): Mention[] {
  const raced = lines.filter((l) => l.races > 0);
  if (!raced.length) return [];
  const best = (f: (l: PilotLine) => number, from = raced) => [...from].sort((a, b) => f(b) - f(a) || byPoints(a, b))[0];
  const out: Mention[] = [];
  const mvp = [...raced].sort(byPoints)[0];
  out.push({ kind: 'mvp', id: mvp.id, value: mvp.points });
  const racer = best((l) => l.placing);
  if (racer.placing > 0 && racer.id !== mvp.id) out.push({ kind: 'racer', id: racer.id, value: racer.placing });
  const kos = best((l) => l.kos);
  if (kos.kos > 0) out.push({ kind: 'kos', id: kos.id, value: kos.kos });
  const support = best((l) => l.support);
  if (support.support > 0) out.push({ kind: 'support', id: support.id, value: support.support });
  const damage = best((l) => l.dmgDealt);
  if (damage.dmgDealt > 0) out.push({ kind: 'damage', id: damage.id, value: damage.dmgDealt });
  // Never out, in every race the most of them ran; the least damage taken (when there was a fight).
  const most = Math.max(...raced.map((l) => l.races));
  const whole = raced.filter((l) => l.out === 0 && l.races === most);
  if (whole.length && raced.some((l) => l.dmgTaken > 0)) {
    const iron = best((l) => -l.dmgTaken, whole);
    out.push({ kind: 'ironclad', id: iron.id, value: iron.dmgTaken });
  }
  return out;
}

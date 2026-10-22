// Who each race team is, to look at: a faction (its livery, colour, emblem
// and name), or, for a pilot flying for no faction (a person in a Sprint,
// where every pilot is a team of their own), the league's livery lit in the
// pilot's colour, the league's badge, and "Independent".

import { PILOT_COLOURS } from '../../net/protocol';
import type { RaceState } from '../../sim/index';
import { INDEPENDENT, LIVERIES, factionName, leagueLivery, type Livery } from '../render/palette';
import { emblemUrl } from './factionArt';

export interface TeamLook {
  /** An index into LIVERIES, or -1 for none (the league's). */
  faction: number;
  livery: Livery;
  /** The team's colour on the HUD and the menus. */
  css: string;
  /** Its emblem, as an image URL. */
  emblem: string;
  /** What it is called where a faction is named. */
  name: string;
}

/** A pilot colour (an index into PILOT_COLOURS; anything else the first) as RGB. */
export function colourOf(i: number): number {
  return PILOT_COLOURS[i] ?? PILOT_COLOURS[0];
}

/** A pilot colour as CSS. */
export function colourCss(i: number): string {
  return '#' + colourOf(i).toString(16).padStart(6, '0');
}

/** How a team looks with no faction: the league's livery in this pilot colour. */
export function independent(colour: number): TeamLook {
  const livery = leagueLivery(colourOf(colour));
  return { faction: -1, livery, css: livery.css, emblem: emblemUrl(-1), name: INDEPENDENT };
}

/** How a faction's team looks. */
export function factionLook(f: number): TeamLook {
  const livery = LIVERIES[f] ?? LIVERIES[0];
  return { faction: Math.max(0, f), livery, css: livery.css, emblem: emblemUrl(Math.max(0, f)), name: factionName(livery) };
}

/**
 * Each race team's look, given which faction each is (-1 for none: then the
 * colour of the pilot on it).
 */
export function teamLooks(race: RaceState, factions: readonly number[]): TeamLook[] {
  return race.teams.map((_, team) => {
    const f = factions[team] ?? team;
    if (f >= 0) return factionLook(f);
    const pilot = race.mechs.find((m) => m.team === team);
    return independent(pilot ? pilot.colour : 0);
  });
}

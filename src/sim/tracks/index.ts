// Every circuit the game knows, in the order the garage offers them.
import type { CircuitDef } from '../circuit';
import type { TrackDef } from '../track';
import { CANYON } from './canyon';
import { CRUCIBLE } from './crucible';
import { FROSTLINE } from './frostline';
import { HELIOS } from './helios';
import { MERIDIAN } from './meridian';
import { MONSOON_RUINS } from './monsoon';
import { ABYSS_LINE } from './abyss';
import { TITANS_REST } from './titan';
import { ZENITH_RING } from './zenith';

export type AnyTrackDef = TrackDef | CircuitDef;

export const TRACKS: readonly AnyTrackDef[] = [MERIDIAN, CANYON, HELIOS, CRUCIBLE, FROSTLINE, TITANS_REST, ABYSS_LINE, MONSOON_RUINS, ZENITH_RING];

/** The circuit with this id, or Meridian. */
export function trackById(id: string | undefined | null): AnyTrackDef {
  return TRACKS.find((t) => t.id === id) ?? MERIDIAN;
}

export { ABYSS_LINE, CANYON, CRUCIBLE, FROSTLINE, HELIOS, MERIDIAN, MONSOON_RUINS, TITANS_REST, ZENITH_RING };

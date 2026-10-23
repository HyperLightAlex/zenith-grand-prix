// Every circuit the game knows, in the order the garage offers them.
import type { CircuitDef } from '../circuit';
import type { TrackDef } from '../track';
import { CANYON } from './canyon';
import { CRUCIBLE } from './crucible';
import { FROSTLINE } from './frostline';
import { HELIOS } from './helios';
import { MERIDIAN } from './meridian';

export type AnyTrackDef = TrackDef | CircuitDef;

export const TRACKS: readonly AnyTrackDef[] = [MERIDIAN, CANYON, HELIOS, CRUCIBLE, FROSTLINE];

/** The circuit with this id, or Meridian. */
export function trackById(id: string | undefined | null): AnyTrackDef {
  return TRACKS.find((t) => t.id === id) ?? MERIDIAN;
}

export { CANYON, CRUCIBLE, FROSTLINE, HELIOS, MERIDIAN };

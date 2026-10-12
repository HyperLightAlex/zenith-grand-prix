// Every circuit the game knows, in the order the garage offers them.
import type { CircuitDef } from '../circuit';
import type { TrackDef } from '../track';
import { CANYON } from './canyon';
import { HELIOS } from './helios';
import { MERIDIAN } from './meridian';

export type AnyTrackDef = TrackDef | CircuitDef;

export const TRACKS: readonly AnyTrackDef[] = [MERIDIAN, CANYON, HELIOS];

/** The circuit with this id, or Meridian. */
export function trackById(id: string | undefined | null): AnyTrackDef {
  return TRACKS.find((t) => t.id === id) ?? MERIDIAN;
}

export { CANYON, HELIOS, MERIDIAN };

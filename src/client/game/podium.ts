// Who stands on the podium, and how: the first three home in a race, and the
// victory pose each strikes.

import type { RaceState } from '../../sim/index';
import { isVictoryId, victoryFor, type VictoryId } from '../render/mech/victoryPoses';

/**
 * The first three home, first to third: those who finished, in the order
 * they finished (then, if fewer than three did, those still racing, by
 * where they were). Never a pilot out of the race.
 */
export function podiumOrder(race: RaceState): number[] {
  return race.mechs
    .filter((m) => !m.retired)
    .sort((a, b) => (a.finished === b.finished ? a.place - b.place : a.finished ? -1 : 1))
    .slice(0, 3)
    .map((m) => m.id);
}

/**
 * The pose a pilot strikes: yours (the local pilot's, as chosen in the
 * hangar) or, for anyone else, their own (by name, always the same).
 */
export function poseFor(race: RaceState, id: number, local: number, chosen: unknown): VictoryId {
  if (id === local && race.mechs[id]?.human && isVictoryId(chosen)) return chosen;
  return victoryFor(race.mechs[id]?.name ?? String(id));
}

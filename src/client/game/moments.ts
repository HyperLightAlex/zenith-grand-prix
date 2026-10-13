// Which moments are the player's own, for the effects that should only fire
// for those: slow motion on a knockout, the camera's punch-in.
import { TICK_RATE, type RaceState } from '../../sim/index';

/**
 * Did `who` take part in the knockout of `victim` (by `by`)? Landing it,
 * taking it, having hurt the victim in the assist window, or having been
 * locked on to it (`lastTarget`) all count.
 */
export function inKnockout(race: RaceState, victim: number, by: number, who: number, lastTarget: number): boolean {
  if (who < 0) return false;
  if (victim === who || by === who || lastTarget === victim) return true;
  const hurt = race.mechs[victim]?.hurtBy[who];
  return hurt !== undefined && hurt >= race.tick - race.rules.assistSecs * TICK_RATE;
}

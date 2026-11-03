// The victory pose each pilot strikes on the podium (who stands on it is the
// ceremony's to say: ceremony.ts).

import type { PilotLine } from '../../sim/index';
import { isVictoryId, victoryFor, type VictoryId } from '../render/mech/victoryPoses';

/**
 * The pose a pilot strikes: yours (your line, `me`, as you chose it in the
 * hangar) or, for anyone else, their own (by name, always the same).
 */
export function poseFor(line: Pick<PilotLine, 'id' | 'name' | 'human'>, me: number, chosen: unknown): VictoryId {
  if (line.id === me && line.human && isVictoryId(chosen)) return chosen;
  return victoryFor(line.name || String(line.id));
}

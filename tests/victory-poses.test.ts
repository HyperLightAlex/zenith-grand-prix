// The victory poses (client/render/mech/victoryPoses.ts) never raise one arm
// straight out ahead and up, at any moment of their movement: a single arm
// goes up only to the sky (near upright) or bent (a fist). Nothing on the
// podium can be taken for a salute. Both arms up together (a cheer) is fine.

import { describe, expect, it } from 'vitest';
import { makePose } from '../src/client/render/mech/rig';
import { VICTORY_IDS, victoryPose } from '../src/client/render/mech/victoryPoses';

/** An arm held out ahead and up, near straight: swung forward between about 70 and 158 degrees, not out wide, the elbow barely bent. */
function outAhead(sh: readonly number[], el: readonly number[]): boolean {
  return sh[0] <= -1.2 && sh[0] >= -2.75 && Math.abs(sh[2]) < 1.0 && Math.abs(el[0]) < 0.6 && Math.abs(el[2]) < 0.6;
}

describe('the victory poses', () => {
  it.each(VICTORY_IDS)('%s never holds a single arm out ahead and up', (id) => {
    const out = makePose();
    for (let t = 0; t <= 8; t += 1 / 30) {
      const p = victoryPose(id, t, out);
      const left = outAhead(p.shL, p.elL);
      const right = outAhead(p.shR, p.elR);
      expect(left !== right, `${id} at ${t.toFixed(2)} s`).toBe(false);
    }
  });
});

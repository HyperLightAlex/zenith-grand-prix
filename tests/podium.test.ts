// The podium's poses (client/game/podium.ts, render/mech/victoryPoses.ts):
// each strikes a victory pose, yours as you chose it and everyone else's
// their own. (Who stands on it: ceremony.test.ts.)

import { describe, expect, it } from 'vitest';
import { poseFor } from '../src/client/game/podium';
import { VICTORY_IDS, victoryFor, victoryPose } from '../src/client/render/mech/victoryPoses';
import { makePose } from '../src/client/render/mech/rig';
import { FW0, newRace } from './helpers';

describe('the podium', () => {
  it('gives you the pose you chose, and everyone else their own', () => {
    const race = newRace(3, { humans: [FW0] });
    const you = race.mechs[FW0];
    expect(poseFor(you, FW0, 'bow')).toBe('bow');
    // Not a pose: your own by name instead.
    expect(poseFor(you, FW0, 'moonwalk')).toBe(victoryFor(you.name));
    // A computer pilot keeps its own whatever you chose, even in your seat (an event's stand-in).
    const other = race.mechs.find((m) => !m.human)!;
    expect(poseFor(other, FW0, 'bow')).toBe(victoryFor(other.name));
    expect(poseFor({ ...other, id: FW0 }, FW0, 'bow')).toBe(victoryFor(other.name));
    expect(victoryFor(other.name)).toBe(victoryFor(other.name));
    // Between them the pilots strike more than one.
    expect(new Set(race.mechs.map((m) => victoryFor(m.name))).size).toBeGreaterThan(1);
  });

  it('poses are whole and finite at every moment, and the same at the same moment', () => {
    for (const id of VICTORY_IDS) {
      for (const t of [0, 0.2, 1.3, 4.9, 30]) {
        const a = victoryPose(id, t, makePose());
        const b = victoryPose(id, t, makePose({ hips: [9, 9, 9, 9, 9] }));
        expect(a).toEqual(b);
        for (const v of Object.values(a).flat()) expect(Number.isFinite(v), `${id} at ${t}`).toBe(true);
      }
    }
  });
});

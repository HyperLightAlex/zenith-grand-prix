// The podium (client/game/podium.ts, render/mech/victoryPoses.ts): the first
// three home stand on it, never a pilot out of the race; each strikes a
// victory pose, yours as you chose it and everyone else's their own.

import { describe, expect, it } from 'vitest';
import { podiumOrder, poseFor } from '../src/client/game/podium';
import { VICTORY_IDS, victoryFor, victoryPose } from '../src/client/render/mech/victoryPoses';
import { makePose } from '../src/client/render/mech/rig';
import { FW0, newRace, runToEnd } from './helpers';

describe('the podium', () => {
  it('holds the first three home, in the order they finished', () => {
    const race = newRace(6);
    runToEnd(race);
    const order = podiumOrder(race);
    expect(order).toHaveLength(3);
    const byPlace = race.mechs.filter((m) => m.finished && !m.retired).sort((a, b) => a.place - b.place).map((m) => m.id);
    expect(order).toEqual(byPlace.slice(0, 3));
  });

  it('never has a pilot out of the race on it, and fills up from those still running', () => {
    const race = newRace(2);
    runToEnd(race);
    const first = podiumOrder(race)[0];
    race.mechs[first].retired = true;
    expect(podiumOrder(race)).not.toContain(first);
    // Only one home: the rest by where they were.
    for (const m of race.mechs) m.finished = false;
    const winner = race.mechs.find((m) => !m.retired)!;
    winner.finished = true;
    const order = podiumOrder(race);
    expect(order[0]).toBe(winner.id);
    expect(order).toHaveLength(3);
  });

  it('gives you the pose you chose, and everyone else their own', () => {
    const race = newRace(3, { humans: [FW0] });
    expect(poseFor(race, FW0, FW0, 'bow')).toBe('bow');
    // Not a pose: your own by name instead.
    expect(poseFor(race, FW0, FW0, 'moonwalk')).toBe(victoryFor(race.mechs[FW0].name));
    // A computer pilot keeps its own whatever you chose.
    const other = race.mechs.find((m) => !m.human)!;
    expect(poseFor(race, other.id, FW0, 'bow')).toBe(victoryFor(other.name));
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

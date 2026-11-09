// A race nobody will finish (every pilot a person who has stopped) is flagged
// at about twice the time it takes to win, not left to run on: everyone
// still out there is classified by how far they got.
import { describe, expect, it } from 'vitest';
import { MAX_RACE_TICKS, PHASE, TRACKS, buildTrack, raceTickLimit, stepRace } from '../src/sim/index';
import { TRACK, makeInputs, newRace } from './helpers';

describe('race time limit', () => {
  it('is about twice a winning time on every circuit, and never past the hard stop', () => {
    for (const def of TRACKS) {
      const t = buildTrack(def);
      const limit = raceTickLimit(3, t.length) / 60;
      // Winners take about 3 to 4 minutes over three laps.
      expect(limit, def.id).toBeGreaterThan(6 * 60);
      expect(limit, def.id).toBeLessThanOrEqual(MAX_RACE_TICKS / 60);
    }
    // A short race gets a short limit.
    expect(raceTickLimit(1, TRACK.length)).toBeLessThan(raceTickLimit(3, TRACK.length) / 2);
  });

  it('flags a race where nobody moves at the limit, everyone classified', () => {
    const race = newRace(5, { humans: 'all', laps: 1 });
    const inputs = makeInputs(race);
    const limit = raceTickLimit(1, TRACK.length);
    while (race.phase !== PHASE.FINISHED && race.tick < MAX_RACE_TICKS) stepRace(race, TRACK, inputs);
    expect(race.phase).toBe(PHASE.FINISHED);
    expect(race.tick).toBe(limit);
    expect(race.mechs.every((m) => m.finished || m.retired)).toBe(true);
  });
});

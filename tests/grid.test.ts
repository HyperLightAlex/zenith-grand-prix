// The starting grid (sim/config.ts, GRID): rows of two behind the line, the
// rows in inner and outer lanes by turns, so a good launch (the rev start)
// has its lane clear ahead instead of running into the back of the mech in
// front, as it did when the rows were 12 apart and every mech straight
// behind another.

import { describe, expect, it } from 'vitest';
import { CLASSES, COUNTDOWN_TICKS, GRID, ROLE, TRACKS, createRace, emptyInput, hwAt, sharedTrack, stepRace, type SeatConfig } from '../src/sim/index';
import { TRACK, makeSeats } from './helpers';

const sprintSeats = (): SeatConfig[] => Array.from({ length: 6 }, (_, k) => ({ team: k, role: ROLE.FW, human: true, name: `S${k}`, skill: 0.6 }));

describe('the starting grid', () => {
  it('no mech starts in the lane of the one just ahead of it: a row over and a lane over', () => {
    for (const race of [createRace(TRACK, { seed: 1, seats: makeSeats() }), createRace(TRACK, { seed: 1, seats: sprintSeats(), mode: 'sprint' })]) {
      for (const a of race.mechs) {
        for (const b of race.mechs) {
          if (a === b) continue;
          const ahead = b.s - a.s;
          const apart = Math.abs(a.d - b.d);
          const touch = CLASSES[a.role].radius + CLASSES[b.role].radius;
          // The row just ahead: never in its lane.
          if (ahead > 0 && ahead <= GRID.row + 0.01) expect(apart).toBeGreaterThan(touch + 2);
          // Two rows ahead, in the same lane: room for a launch to see it coming.
          if (ahead > GRID.row + 0.01 && apart < touch) expect(ahead - touch).toBeGreaterThan(25);
        }
      }
    }
  });

  it('stands on the road, clear of the walls, behind every start line', () => {
    for (const def of TRACKS) {
      const t = sharedTrack(def);
      const race = createRace(t, { seed: 1, seats: makeSeats() });
      for (const m of race.mechs) {
        const at = (m.s + t.length) % t.length;
        expect(Math.abs(m.d) + CLASSES[m.role].radius).toBeLessThan(hwAt(t, at) - 1);
      }
    }
  });

  it('a perfect launch behind plain starts in the front two rows runs into nobody', () => {
    for (const [seats, mode] of [
      [makeSeats(), undefined],
      [sprintSeats(), 'sprint'],
    ] as const) {
      // The second row's two (seats 2 and 3 in both).
      for (const k of [2, 3]) {
        const race = createRace(TRACK, { seed: 3, seats: seats.map((s) => ({ ...s, human: true })), mode });
        let hit = false;
        for (let t = 0; t < COUNTDOWN_TICKS + 150; t++) {
          const inputs = race.mechs.map((m) => {
            const i = emptyInput();
            // The launcher revs into the green; the rest sit on the line and pull away from cold.
            i.throttle = race.tick < COUNTDOWN_TICKS ? (m.id === k && race.tick >= COUNTDOWN_TICKS - 75 ? 1 : 0) : 1;
            return i;
          });
          stepRace(race, TRACK, inputs);
          for (const e of race.events) if (e.type === 'bump' && (e.a === k || e.b === k)) hit = true;
          for (const e of race.events) if (e.type === 'launch' && e.mech === k) expect(e.grade).toBe(3);
        }
        expect(hit).toBe(false);
      }
    }
  });
});

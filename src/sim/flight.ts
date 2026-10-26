// The fastest flight over a jump: Overdrive on the speed lap, with a speed
// pad's push held through the lip. How high over the road a mech goes and
// where it comes down, for whatever has to clear it (the tube over Abyss
// Line's Trench Leap: render/abyss.ts; tests/flights.test.ts flies every jump).
import { COUNTDOWN_TICKS, MODE, ROLE } from './config';
import { createRace, stepRace } from './sim';
import { deltaS, wrapS, type Track } from './track';
import { emptyInput, type SeatConfig } from './types';

export interface Flight {
  /** Along the road, each tick it was in the air: where it was, and how high over the road. */
  s: number[];
  d: number[];
  h: number[];
  /** Its top speed, highest point over the road and where it came down. */
  speed: number;
  peak: number;
  down: number;
}

/**
 * The flight over the jump whose gap starts at `s`, on the line across
 * `d` (held there: how a mech steers is not what is flown), as fast as a
 * Swift can take it.
 */
export function fastestFlight(track: Track, s: number, d: number): Flight {
  const seats: SeatConfig[] = [ROLE.FW, ROLE.FW, ROLE.MF, ROLE.MF, ROLE.DF, ROLE.DF].map((role, i) => ({ team: i % 2, role, human: true, name: `seat ${i}`, skill: 0.6 }));
  const race = createRace(track, { seed: 1, seats });
  const inputs = race.mechs.map(() => emptyInput());
  while (race.tick < COUNTDOWN_TICKS) stepRace(race, track, inputs);
  // The speed lap: each frame's own top speed, which Overdrive raises.
  race.lapPhase = 3;
  race.mechs.forEach((o, k) => {
    if (k) {
      o.s = wrapS(track, s + track.length / 2 + k * 30);
      o.speed = o.vs = o.vd = 0;
    }
  });
  const m = race.mechs[0];
  Object.assign(m, { s: wrapS(track, s - 600), d, h: 0, vh: 0, air: false, speed: 150, vs: 150, vd: 0, heading: 0, facing: 0, mode: MODE.SPEED });
  inputs[0].throttle = 1;
  const out: Flight = { s: [], d: [], h: [], speed: 0, peak: 0, down: -1 };
  let flying = false;
  for (let k = 0; k < 2400 && out.down < 0; k++) {
    const x = deltaS(track, m.s, s);
    m.overdriveT = Math.max(m.overdriveT, 10);
    if (x < -2) m.padT = Math.max(m.padT, 30);
    m.d = d;
    m.vd = 0;
    m.heading = 0;
    stepRace(race, track, inputs);
    out.speed = Math.max(out.speed, m.speed);
    if (m.air && x > -200) {
      flying = true;
      out.peak = Math.max(out.peak, m.h);
      out.s.push(m.s);
      out.d.push(m.d);
      out.h.push(m.h);
    } else if (flying) out.down = m.s;
    if (x > 900) break;
  }
  return out;
}

// Computer pilots as teammates and rivals (sim/ai.ts): support pilots come
// back to clear the way for their forward when it is boxed in, and sooner
// and from further under Shield; on the speed lap a pilot in a rival's tow
// sits in it and strikes on the run to the line, and a leader with a rival
// on its tail keeps Drive back and breaks the tow.

import { describe, expect, it } from 'vitest';
import { MODE, TACTIC, createRace, deltaS, emptyInput, setTactic, stepRace, type MechInput, type MechState, type RaceState } from '../src/sim/index';
import { DF0, DF1, FW0, FW1, MF0, MF1, TRACK, makeSeats, runCountdown, steerToward } from './helpers';

/** The longest straight on the circuit: where it starts, and how long it runs. */
function straight(): { s: number; len: number } {
  let best = { s: 0, len: 0 };
  let start = -1;
  for (let k = 0; k <= TRACK.n; k++) {
    const flat = k < TRACK.n && Math.abs(TRACK.kappa[k]) < 1 / 3000 && TRACK.forks.every((f) => k * TRACK.ds < f.s0 - 50 || k * TRACK.ds > f.s1 + 50);
    if (flat && start < 0) start = k;
    if (!flat && start >= 0) {
      const len = (k - start) * TRACK.ds;
      if (len > best.len) best = { s: start * TRACK.ds, len };
      start = -1;
    }
  }
  return best;
}

/** A race on lap `lap` with the given seats held by people; everyone placed by hand (s past the start line on that lap). */
function stage(lap: 2 | 3, humans: number[], at: Record<number, [number, number]>, speed: number): { race: RaceState; inputs: Array<MechInput | null> } {
  const race = createRace(TRACK, { seed: 5, seats: makeSeats(humans, 0.7), rules: { momentumSecs: 0, drivePass: 0 } });
  const inputs = race.mechs.map((m) => (m.human ? emptyInput() : null));
  runCountdown(race, inputs);
  race.lapPhase = lap;
  const base = (lap - 1) * TRACK.length;
  for (const m of race.mechs) {
    const [s, d] = at[m.id] ?? [straight().s + 2000 + m.id * 60, 0];
    m.s = base + s;
    m.lap = lap - 1;
    m.d = d;
    m.speed = m.vs = speed;
    m.vd = m.heading = m.facing = 0;
    m.drive = 100;
  }
  return { race, inputs };
}

describe('support pilots and their forward', () => {
  it('come back to clear the way for a forward boxed in behind a rival support pilot', () => {
    const st = straight();
    expect(st.len).toBeGreaterThan(500);
    const s0 = st.s + 40;
    // Our forward (a person) at the back, stuck behind their defender; our support pilots 250 up the road.
    const { race, inputs } = stage(2, [FW0], { [DF1]: [s0, 0], [FW0]: [s0 - 16, 0], [MF0]: [s0 + 250, -8], [DF0]: [s0 + 260, 8] }, 120);
    const me = race.mechs[FW0];
    const them = race.mechs[DF1];
    const inp = inputs[FW0]!;
    let cameFor = false;
    let closest = Infinity;
    for (let t = 0; t < 8 * 60; t++) {
      // Stuck: right on its tail, no way round.
      steerToward(me, inp, them.d);
      inp.throttle = deltaS(TRACK, them.s, me.s) > 14 ? 1 : 0.7;
      stepRace(race, TRACK, inputs);
      for (const id of [MF0, DF0]) {
        const m = race.mechs[id];
        if (m.ai.intentTarget === DF1 || m.target === DF1) cameFor = true;
        closest = Math.min(closest, Math.abs(deltaS(TRACK, m.s, them.s)));
      }
    }
    expect(cameFor).toBe(true);
    // They dropped back to it: from 250 ahead to on top of it.
    expect(closest).toBeLessThan(40);
  });

  it('leave the forwards\' own duel to them: an enemy forward on ours brings nobody back from up the road', () => {
    const st = straight();
    const s0 = st.s + 40;
    const { race, inputs } = stage(2, [FW0], { [FW1]: [s0 + 4, 3], [FW0]: [s0, 0], [MF0]: [s0 + 320, -8], [DF0]: [s0 + 330, 8] }, 120);
    const me = race.mechs[FW0];
    const inp = inputs[FW0]!;
    let cameFor = false;
    for (let t = 0; t < 5 * 60; t++) {
      steerToward(me, inp, 0);
      stepRace(race, TRACK, inputs);
      for (const id of [MF0, DF0]) if (race.mechs[id].ai.intentTarget === FW1) cameFor = true;
    }
    expect(cameFor).toBe(false);
  });

  it('under Shield, keep the forward company from well up the road: they come back to it', () => {
    const st = straight();
    const s0 = st.s + 40;
    const { race, inputs } = stage(2, [FW0], { [FW0]: [s0, 0], [MF0]: [s0 + 330, -8], [DF0]: [s0 + 340, 8] }, 120);
    setTactic(race, 0, TACTIC.SHIELD, FW0, -1);
    const me = race.mechs[FW0];
    const inp = inputs[FW0]!;
    let closest = Infinity;
    for (let t = 0; t < 8 * 60; t++) {
      steerToward(me, inp, 0);
      stepRace(race, TRACK, inputs);
      closest = Math.min(closest, ...[MF0, DF0].map((id) => Math.abs(deltaS(TRACK, race.mechs[id].s, me.s))));
    }
    expect(closest).toBeLessThan(60);
  });
});

describe('the speed lap', () => {
  /** A person racing the middle of the road flat out, never boosting. */
  const cruise = (m: MechState, inp: MechInput, d = 0) => {
    steerToward(m, inp, d);
    inp.buttons = 0;
  };

  it('a computer pilot in a rival\'s tow sits in it, a way from the line, rather than going by', () => {
    const st = straight();
    const s0 = st.s + 40;
    // Their forward in our forward's tow, the line a long way off.
    const { race, inputs } = stage(3, [FW0], { [FW0]: [s0 + 20, 0], [FW1]: [s0, 0], [MF0]: [s0 + 900, 0], [MF1]: [s0 + 1000, 0], [DF0]: [s0 + 1100, 0], [DF1]: [s0 + 1200, 0] }, 160);
    const me = race.mechs[FW0];
    const them = race.mechs[FW1];
    const inp = inputs[FW0]!;
    let passed = false;
    let farthest = 0;
    for (let t = 0; t < 5 * 60; t++) {
      cruise(me, inp);
      stepRace(race, TRACK, inputs);
      const gap = deltaS(TRACK, me.s, them.s);
      if (gap < 0) passed = true;
      farthest = Math.max(farthest, gap);
      expect(them.mode).toBe(MODE.SPEED);
    }
    expect(passed).toBe(false);
    // ...and kept in the tow (its full strength reaches a good way back).
    expect(farthest).toBeLessThan(64);
  });

  it('and strikes on the run to the line: by it before the flag', () => {
    // The line ahead: our forward 650 from it, theirs in its tow.
    const line = 3 * TRACK.length;
    const { race, inputs } = stage(3, [FW0], { [FW0]: [TRACK.length - 650, 0], [FW1]: [TRACK.length - 668, 0], [MF0]: [TRACK.length - 1600, 0], [MF1]: [TRACK.length - 1700, 0], [DF0]: [TRACK.length - 1800, 0], [DF1]: [TRACK.length - 1900, 0] }, 160);
    const me = race.mechs[FW0];
    const them = race.mechs[FW1];
    const inp = inputs[FW0]!;
    for (let t = 0; t < 12 * 60 && !me.finished; t++) {
      cruise(me, inp);
      stepRace(race, TRACK, inputs);
    }
    expect(line - TRACK.length * 2).toBeGreaterThan(0);
    expect(them.finished).toBe(true);
    expect(them.place).toBeLessThan(me.place);
  });

  it('a computer pilot with a rival on its tail breaks the tow and keeps Drive back to answer a pass', () => {
    const st = straight();
    const s0 = st.s + 40;
    const { race, inputs } = stage(3, [FW0], { [FW1]: [s0 + 20, 0], [FW0]: [s0, 0], [MF0]: [s0 + 900, 0], [MF1]: [s0 + 1000, 0], [DF0]: [s0 + 1100, 0], [DF1]: [s0 + 1200, 0] }, 160);
    const me = race.mechs[FW0];
    const them = race.mechs[FW1];
    const inp = inputs[FW0]!;
    const d0 = them.d;
    let moved = 0;
    let low = Infinity;
    for (let t = 0; t < 4 * 60; t++) {
      // Sitting in its tow.
      cruise(me, inp, them.d);
      stepRace(race, TRACK, inputs);
      moved = Math.max(moved, Math.abs(them.d - d0));
      low = Math.min(low, them.drive);
    }
    expect(moved).toBeGreaterThan(6);
    expect(low).toBeGreaterThan(30);
  });
});

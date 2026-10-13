// Cell gates. Threading a gate (crossing its line with the mech's centre
// inside its opening) earns a Cell, which pays for one ability
// (abilities.test.ts). Gates are contested: the first mech through takes it
// and it goes dark for rules.gateRelight seconds, but a mech that is already
// full passes through without using it up.
import { describe, expect, it } from 'vitest';
import { BTN, CLASSES, DEFAULT_RULES, MERIDIAN, MODE, PHASE, buildTrack, gateCrossed, stepRace } from '../src/sim/index';
import type { MechInput, Rules, TrackDef } from '../src/sim/index';
import { retire } from '../src/sim/combat';
import { Arena, DF0, FW0, FW1, MF0, MF1, TRACK, giveCells, makeInputs, newRace, runCountdown, steerToward } from './helpers';

const L = TRACK.length;
const GATES = TRACK.gates;
/** The gate on the Grand Straight: the road is dead straight either side of it. */
const G0 = GATES[0];

/** A mech `before` units short of gate `g`, `off` units from the middle of its opening. */
function approach(a: Arena, id: number, g: number, off = 0, before = 3) {
  const gate = GATES[g];
  return a.put(id, gate.s - before, gate.d + off);
}

describe('the gates on the track', () => {
  it('are built from the definition: lap fraction to distance, same opening', () => {
    expect(MERIDIAN.gates!.length).toBe(6);
    expect(GATES.length).toBe(6);
    GATES.forEach((g, i) => {
      const def = MERIDIAN.gates![i];
      expect(g.s).toBeCloseTo(def.at * L, 6);
      expect(g.d).toBe(def.d);
      expect(g.halfW).toBe(def.halfW);
    });
  });

  it('sit on the road, in lap order, where a mech of any frame can reach them', () => {
    let prev = 0;
    for (const g of GATES) {
      expect(g.s).toBeGreaterThan(prev);
      expect(g.s).toBeLessThan(L);
      prev = g.s;
      expect(g.halfW).toBeGreaterThan(0);
      expect(Math.abs(g.d) + g.halfW).toBeLessThanOrEqual(TRACK.halfWidth);
      // The widest frame, hard against the wall on that side, is still inside the opening.
      for (const c of CLASSES) expect(TRACK.halfWidth - c.radius).toBeGreaterThan(Math.abs(g.d) - g.halfW);
      // Not so close to the line that the grid (up to 34 units back) starts on top of one.
      expect(g.s).toBeGreaterThan(100);
      expect(g.s).toBeLessThan(L - 100);
    }
  });

  it('each is off the racing line and clear of the charge strips: a choice, not a freebie', () => {
    for (const g of GATES) {
      expect(Math.abs(g.d)).toBeGreaterThan(g.halfW + 6); // the centreline misses it by a margin
      for (const st of TRACK.strips) {
        const along = g.s >= st.s0 && g.s <= st.s1;
        const across = Math.abs(g.d - st.d) < g.halfW + st.halfW;
        expect(along && across).toBe(false);
      }
    }
  });

  it('a track without gates has none, and one with too many keeps 30 (one bit each)', () => {
    const { gates: _gates, ...bare } = MERIDIAN;
    const none = buildTrack(bare as TrackDef);
    expect(none.gates).toEqual([]);
    expect(gateCrossed(none, 0, 5000, 0, 0)).toBe(-1);
    const many: TrackDef = { ...MERIDIAN, gates: Array.from({ length: 40 }, (_, i) => ({ at: 0.02 + i * 0.02, d: 0, halfW: 3 })) };
    const t = buildTrack(many);
    expect(t.gates.length).toBe(30);
    expect(t.gates[29].s).toBeCloseTo((0.02 + 29 * 0.02) * t.length, 6);
  });

  it('building the track twice gives the same gates', () => {
    expect(buildTrack(MERIDIAN).gates).toEqual(GATES);
  });
});

describe('gateCrossed', () => {
  const g = G0;

  it('finds a gate whose line lies in (s0, s1] with d inside the opening', () => {
    expect(gateCrossed(TRACK, g.s - 1, g.s + 1, g.d, 0)).toBe(0);
    expect(gateCrossed(TRACK, g.s - 3, g.s - 1, g.d, 0)).toBe(-1); // not there yet
    expect(gateCrossed(TRACK, g.s + 1, g.s + 3, g.d, 0)).toBe(-1); // already past
    for (let i = 0; i < GATES.length; i++) {
      expect(gateCrossed(TRACK, GATES[i].s - 1, GATES[i].s + 1, GATES[i].d, 0)).toBe(i);
    }
  });

  it('the far end of the step counts, the near end does not: a line is crossed exactly once', () => {
    expect(gateCrossed(TRACK, g.s - 2, g.s, g.d, 0)).toBe(0); // stopped exactly on the line
    expect(gateCrossed(TRACK, g.s, g.s + 2, g.d, 0)).toBe(-1); // and set off from it again
    // Any way of cutting the approach into steps finds it in exactly one of them.
    for (const step of [0.31, 1.83, 2.6, 7]) {
      let hits = 0;
      for (let s = g.s - 20; s < g.s + 20; s += step) if (gateCrossed(TRACK, s, s + step, g.d, 0) === 0) hits++;
      expect(hits).toBe(1);
    }
  });

  it('the opening is halfW either side of the gate\'s d, edges included', () => {
    const through = (d: number) => gateCrossed(TRACK, g.s - 1, g.s + 1, d, 0);
    expect(through(g.d + g.halfW)).toBe(0);
    expect(through(g.d - g.halfW)).toBe(0);
    expect(through(g.d + g.halfW + 0.01)).toBe(-1);
    expect(through(g.d - g.halfW - 0.01)).toBe(-1);
    expect(through(0)).toBe(-1);
    expect(through(-g.d)).toBe(-1);
  });

  it('skips gates whose bit is set in the mask', () => {
    expect(gateCrossed(TRACK, g.s - 1, g.s + 1, g.d, 1)).toBe(-1);
    expect(gateCrossed(TRACK, g.s - 1, g.s + 1, g.d, 0b111110)).toBe(0);
    expect(gateCrossed(TRACK, GATES[3].s - 1, GATES[3].s + 1, GATES[3].d, 0b001000)).toBe(-1);
    expect(gateCrossed(TRACK, GATES[3].s - 1, GATES[3].s + 1, GATES[3].d, 0b110111)).toBe(3);
  });

  it('going backwards, or nowhere, crosses nothing', () => {
    expect(gateCrossed(TRACK, g.s + 1, g.s - 1, g.d, 0)).toBe(-1);
    expect(gateCrossed(TRACK, g.s, g.s, g.d, 0)).toBe(-1);
    expect(gateCrossed(TRACK, g.s - 1, g.s - 1, g.d, 0)).toBe(-1);
  });

  it('takes distances on any lap, and behind the line', () => {
    for (const laps of [1, 2, 3, -1]) {
      expect(gateCrossed(TRACK, g.s - 1 + laps * L, g.s + 1 + laps * L, g.d, 0)).toBe(0);
      expect(gateCrossed(TRACK, g.s + 1 + laps * L, g.s + 3 + laps * L, g.d, 0)).toBe(-1);
    }
    // The grid: from behind the line to just past it crosses no gate.
    expect(gateCrossed(TRACK, -34, 5, g.d, 0)).toBe(-1);
    for (const d of [-9, 9]) expect(gateCrossed(TRACK, -10, -8, d, 0)).toBe(-1);
  });

  it('a gate at the start line is found by a step that straddles the line', () => {
    // Just past the line, and just short of it.
    for (const at of [0.0002, 0.9998]) {
      const t = buildTrack({ ...MERIDIAN, gates: [{ at, d: 5, halfW: 4 }] });
      const gs = t.gates[0].s;
      const line = t.length;
      // A step from 3 units short of the line to 3 past it, on any lap.
      for (const lap of [0, 1, 2]) {
        expect(gateCrossed(t, lap * line + line - 3, lap * line + line + 3, 5, 0)).toBe(0);
      }
      expect(gateCrossed(t, -3, 3, 5, 0)).toBe(0); // off the grid
      // Steps wholly on one side of the gate do not find it.
      if (gs < 10) {
        expect(gateCrossed(t, line - 3, line - 1, 5, 0)).toBe(-1);
        expect(gateCrossed(t, gs + 0.5, gs + 3, 5, 0)).toBe(-1);
      } else {
        expect(gateCrossed(t, gs + 0.5, line + 3, 5, 0)).toBe(-1);
        expect(gateCrossed(t, gs - 4, gs - 0.5, 5, 0)).toBe(-1);
      }
      // And a full lap of small steps finds it once.
      let hits = 0;
      for (let s = 100; s < 100 + line; s += 1.9) if (gateCrossed(t, s, s + 1.9, 5, 0) === 0) hits++;
      expect(hits).toBe(1);
    }
  });

  it('with two gates inside one step, reports the first by index', () => {
    const t = buildTrack({ ...MERIDIAN, gates: [{ at: 0.05, d: 0, halfW: 5 }, { at: 0.0501, d: 0, halfW: 5 }] });
    const s = t.gates[0].s;
    expect(t.gates[1].s - s).toBeLessThan(1.5);
    expect(gateCrossed(t, s - 1, s + 3, 0, 0)).toBe(0);
    expect(gateCrossed(t, s - 1, s + 3, 0, 1)).toBe(1);
    expect(gateCrossed(t, s - 1, s + 3, 0, 3)).toBe(-1);
  });
});

describe('threading a gate', () => {
  it('scores rules.gateValue of a Cell, sets the gate\'s bit and raises a gate event', () => {
    for (let g = 0; g < GATES.length; g++) {
      const a = new Arena(1);
      const m = approach(a, MF0, g);
      expect(m.cells).toBe(0);
      expect(m.gateMask).toBe(0);
      const n = a.until(() => m.cells > 0, 10);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(3);
      expect(m.cells).toBe(a.race.rules.gateValue);
      expect(m.cells).toBe(1);
      expect(m.gateMask).toBe(1 << g);
      expect(a.events('gate')).toEqual([{ type: 'gate', mech: MF0, gate: g, cells: 1, tick: a.race.tick }]);
      // The event comes on the tick the mech's s passes the gate's.
      expect(m.s - a.base).toBeGreaterThanOrEqual(GATES[g].s);
      expect(m.s - a.base - m.vs / 60).toBeLessThan(GATES[g].s + 0.5);
      // Nothing more on the way out.
      a.step(30);
      expect(a.events('gate').length).toBe(1);
      expect(m.cells).toBe(1);
    }
  });

  it('every frame scores the same', () => {
    for (const id of [FW0, MF0, DF0, FW1]) {
      const a = new Arena(1);
      const m = approach(a, id, 0);
      a.step(5);
      expect(m.cells).toBe(1);
    }
  });

  it('is a matter of where the centre of the mech is: just inside the opening scores, just outside does not', () => {
    for (const side of [1, -1]) {
      const inside = new Arena(1);
      const mi = approach(inside, FW0, 0, side * (G0.halfW - 0.2));
      inside.step(5);
      expect(mi.cells).toBe(1);

      const outside = new Arena(1);
      const mo = approach(outside, FW0, 0, side * (G0.halfW + 0.2));
      outside.step(5);
      expect(mo.s - outside.base).toBeGreaterThan(G0.s);
      expect(mo.cells).toBe(0);
      expect(mo.gateMask).toBe(0);
      expect(outside.events('gate').length).toBe(0);
    }
    // Down the middle of the road, or through the mirror-image spot: nothing.
    for (const d of [0, -G0.d]) {
      const a = new Arena(1);
      const m = a.put(FW0, G0.s - 3, d);
      a.step(5);
      expect(m.cells).toBe(0);
    }
  });

  it('a miss can be put right: the gate stays open for a mech that has not scored it', () => {
    // (Nothing drives backwards, but a shove can put a mech back behind the line.)
    const a = new Arena(1);
    const m = approach(a, FW0, 0, G0.halfW + 2);
    a.step(5);
    expect(m.cells).toBe(0);
    m.s = a.base + G0.s - 3;
    m.d = G0.d;
    a.step(5);
    expect(m.cells).toBe(1);
  });

  it('once per lap per gate, even if the mech is shoved back across the line', () => {
    const a = new Arena(1);
    const m = approach(a, FW0, 0);
    a.step(5);
    expect(m.cells).toBe(1);
    for (let rep = 0; rep < 5; rep++) {
      m.s = a.base + G0.s - 3; // thrown back behind the gate
      a.step(5);
      expect(m.s - a.base).toBeGreaterThan(G0.s);
    }
    expect(m.cells).toBe(1);
    expect(m.gateMask).toBe(1);
    expect(a.events('gate').length).toBe(1);
  });

  it('a real shove back across the line does not score twice either', () => {
    // A forward runs into the back of a parked defender just past the gate.
    // Its own move takes it over the line, and the collision in the same tick
    // throws it back behind the line again. A gate is judged on where the
    // mech ends the tick, shoves included, so that is not a crossing yet...
    const a = new Arena(1);
    const m = approach(a, FW0, 0, 0, 1.7);
    const block = a.put(DF0, G0.s + 6.13, G0.d, 0);
    a.inputs[DF0].brake = 1;
    expect(a.pace / 60).toBeGreaterThan(1.7); // one tick's move, on its own, takes it over the line
    a.step(1);
    expect(a.events('bump').length).toBe(1);
    expect(m.s - a.base).toBeLessThan(G0.s); // but it ends the tick behind it again
    expect(a.events('gate').length).toBe(0);
    expect(m.cells).toBe(0);
    expect(m.gateMask).toBe(0);
    // ...and it scores when it shoulders the obstacle along and ends a tick past the line.
    const n = a.until(() => m.s - a.base > G0.s, 60);
    expect(n).toBeGreaterThan(0);
    expect(a.events('gate')).toEqual([{ type: 'gate', mech: FW0, gate: 0, cells: 1, tick: a.race.tick }]);
    // Once, however much more to-ing and fro-ing there is.
    a.step(120);
    expect(m.s - a.base).toBeGreaterThan(G0.s + 2);
    expect(m.cells).toBe(1);
    expect(m.gateMask).toBe(1);
    expect(a.events('gate').length).toBe(1);
    // (The defender, pushed along from well past the line, never crossed it.)
    expect(block.cells).toBe(0);
  });

  it('knocked back and forth over the line again and again: still one score in total', () => {
    // The same forward, held against the line by hand so that it is thrown
    // back behind it every time it gets across: over, back, over, back.
    const a = new Arena(1);
    const m = approach(a, FW0, 0, 0, 1.7);
    let crossings = 0;
    let wasPast = false;
    a.step(200, () => {
      const past = m.s - a.base > G0.s;
      if (past && !wasPast) crossings++;
      wasPast = past;
      if (past && a.race.tick % 7 === 0) {
        m.s = a.base + G0.s - 1; // shoved back
        wasPast = false;
      }
    });
    expect(crossings).toBeGreaterThan(5);
    expect(a.events('gate').length).toBe(1);
    expect(m.cells).toBe(1);
  });

  it('each gate of the lap pays separately; three fill the Cells, and a full mech takes no more', () => {
    const a = new Arena(1);
    const m = a.put(FW0, 0, 0);
    for (let g = 0; g < GATES.length; g++) {
      m.s = a.base + GATES[g].s - 3;
      m.d = GATES[g].d;
      m.heading = 0;
      a.step(4);
      expect(m.cells).toBe(Math.min(a.race.rules.cellMax, (g + 1) * a.race.rules.gateValue));
    }
    expect(m.cells).toBe(a.race.rules.cellMax);
    expect(m.gateMask).toBe(0b000111);
    expect(a.events('gate').map((e) => [e.gate, e.cells])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    // The three it passed full are still lit for whoever comes next.
    expect([3, 4, 5].map((g) => a.race.gateDark[g])).toEqual([0, 0, 0]);
  });


  it('counts in battle mode too: it is about where the mech goes, not how it is flown', () => {
    const a = new Arena(1);
    const m = a.put(MF0, G0.s - 20, G0.d);
    a.put(FW1, G0.s + 10, G0.d - 12);
    a.tap(MF0, BTN.LOCK);
    expect(m.mode).toBe(MODE.BATTLE);
    a.step(30);
    expect(m.mode).toBe(MODE.BATTLE);
    expect(m.s - a.base).toBeGreaterThan(G0.s);
    expect(m.cells).toBe(1);
  });

  it('a gate straddled by a tick is scored on the tick that takes the mech past it, whatever the speed', () => {
    // (130 is over the formation-lap limiter: a mech still being dragged back to it.)
    for (const speed of [20, 55, 110, 130]) {
      const perTick = speed / 60;
      for (const before of [0.01, perTick / 2, perTick * 0.95]) {
        const a = new Arena(1);
        const m = a.put(FW0, G0.s - before, G0.d, speed);
        a.inputs[FW0].throttle = speed / a.pace; // hold that speed (or be dragged down toward it)
        const s0 = m.s;
        a.step(1);
        // One tick moves it further than `before`, so that tick crossed the line.
        expect(m.s - s0).toBeGreaterThan(before);
        expect(m.cells).toBe(1);
        expect(a.events('gate').length).toBe(1);
        a.step(3);
        expect(a.events('gate').length).toBe(1);
      }
      // Starting a hair past the line never scores.
      const b = new Arena(1);
      const past = b.put(FW0, G0.s + 0.01, G0.d, speed);
      b.step(3);
      expect(past.cells).toBe(0);
    }
  });

  it('the event says how many Cells the mech now has', () => {
    const a = new Arena(1);
    const m = approach(a, FW0, 2);
    m.cells = 1.25;
    a.step(4);
    const [e] = a.events('gate');
    expect(e).toEqual({ type: 'gate', mech: FW0, gate: 2, cells: 2.25, tick: e.tick });
    expect(m.cells).toBe(2.25);
  });
});

describe('contested gates', () => {
  const dark = () => Math.round(DEFAULT_RULES.gateRelight * 60);

  it('the first mech through takes it, and it goes dark for rules.gateRelight seconds', () => {
    const a = new Arena(1);
    const first = approach(a, FW0, 0);
    const next = a.put(FW1, G0.s - 30, G0.d); // half a second behind
    a.step(30);
    expect(first.cells).toBe(1);
    expect(next.s - a.base).toBeGreaterThan(G0.s);
    expect(next.cells).toBe(0);
    expect(a.events('gate').map((e) => e.mech)).toEqual([FW0]);
    const took = a.events('gate')[0].tick;
    expect(a.race.gateDark[0]).toBe(took + dark());
    // Nothing else changes: the other gates are still lit, and the one who missed out can still score this one later.
    expect(a.race.gateDark.slice(1).every((t) => t === 0)).toBe(true);
    expect(next.gateMask).toBe(0);
  });

  it('it relights: a mech through once the time is up scores a full Cell', () => {
    const a = new Arena(1);
    approach(a, FW0, 0);
    a.step(4);
    const took = a.events('gate')[0].tick;
    // Arrive one tick before it relights: nothing. Arrive after: a Cell.
    const early = a.put(MF0, G0.s - 3, G0.d);
    a.until(() => a.race.tick >= took + dark() - 3, 400);
    early.s = a.base + G0.s - 0.5;
    a.step(1);
    expect(a.race.tick).toBeLessThan(took + dark());
    expect(early.cells).toBe(0);
    const late = a.put(MF1, G0.s - 3, G0.d);
    a.until(() => late.s - a.base > G0.s, 30);
    expect(a.race.tick).toBeGreaterThanOrEqual(took + dark());
    expect(late.cells).toBe(1);
  });

  it('two through on the same tick: the one in front has it', () => {
    for (const ahead of [FW0, FW1]) {
      const behind = ahead === FW0 ? FW1 : FW0;
      const a = new Arena(1);
      a.put(ahead, G0.s - 1, G0.d - 3);
      a.put(behind, G0.s - 1.4, G0.d + 3.5);
      a.step(1);
      expect(a.events('gate').map((e) => e.mech)).toEqual([ahead]);
      expect(a.mech(behind).cells).toBe(0);
    }
  });

  it('a mech already full passes without using the gate up', () => {
    const a = new Arena(1);
    const full = giveCells(approach(a, FW0, 0), 3);
    const next = a.put(FW1, G0.s - 30, G0.d);
    a.until(() => full.s - a.base > G0.s, 10);
    expect(full.cells).toBe(3);
    expect(a.race.gateDark[0]).toBe(0);
    // ...so the mech behind it still finds it lit.
    a.step(30);
    expect(next.cells).toBe(1);
    expect(a.events('gate').map((e) => e.mech)).toEqual([FW1]);
  });

  it('rules.gateRelight 0: never dark, every mech that threads it scores', () => {
    const a = new Arena(1, 1, { gateRelight: 0 });
    const first = a.put(FW0, G0.s - 3, G0.d - 3);
    const second = a.put(FW1, G0.s - 3, G0.d + 3.5);
    const third = a.put(MF1, G0.s - 30, G0.d);
    a.step(30);
    expect([first.cells, second.cells, third.cells]).toEqual([1, 1, 1]);
    expect(a.race.gateDark[0]).toBe(0);
  });

  it('a new race starts with every gate lit', () => {
    const race = newRace(3);
    expect(race.gateDark).toEqual(GATES.map(() => 0));
  });
});

describe('the Cell cap', () => {
  it('a gate tops the Cells up to rules.cellMax and no further', () => {
    const a = new Arena(1);
    const m = approach(a, FW0, 0);
    m.cells = 2.75;
    a.step(4);
    expect(m.cells).toBe(3);
    expect(a.events('gate')).toMatchObject([{ gate: 0, cells: 3 }]);
  });

  it('a full mech takes nothing: no Cell, no event, and the gate is not marked', () => {
    const a = new Arena(1);
    const m = approach(a, FW0, 0);
    giveCells(m, 3);
    a.step(4);
    expect(m.s - a.base).toBeGreaterThan(G0.s);
    expect(m.cells).toBe(3);
    expect(m.gateMask).toBe(0);
    expect(a.events('gate').length).toBe(0);
  });

  it('whatever rules.gateValue is, one gate cannot overfill', () => {
    for (const [gateValue, want] of [
      [0.25, 0.25],
      [1, 1],
      [2.9, 2.9],
      [5, 3],
      [1e9, 3],
    ] as const) {
      const a = new Arena(1, 1, { gateValue });
      const m = approach(a, FW0, 0);
      a.step(4);
      expect(m.cells).toBe(want);
      expect(a.events('gate')[0].cells).toBe(want);
    }
  });

  it('rules.cellMax is the cap: 1 fills from one gate, 0 means no Cells at all', () => {
    const one = new Arena(1, 1, { cellMax: 1 });
    const m = one.put(FW0, 0, 0);
    for (let g = 0; g < 4; g++) {
      m.s = one.base + GATES[g].s - 3;
      m.d = GATES[g].d;
      m.heading = 0;
      one.step(4);
    }
    expect(m.cells).toBe(1);
    expect(one.events('gate').length).toBe(1);

    const none = new Arena(1, 1, { cellMax: 0 });
    const z = approach(none, FW0, 0);
    none.step(4);
    expect(z.cells).toBe(0);
    expect(none.events('gate').length).toBe(0);
  });

  it('rules.cellStart puts Cells in hand on the grid, never more than the cap', () => {
    expect(newRace(1, { rules: { cellStart: 1.5 } }).mechs.every((m) => m.cells === 1.5)).toBe(true);
    expect(newRace(1, { rules: { cellStart: 7 } }).mechs.every((m) => m.cells === 3)).toBe(true);
    expect(newRace(1, { rules: { cellStart: 7, cellMax: 5 } }).mechs.every((m) => m.cells === 5)).toBe(true);
    expect(newRace(1, { rules: { cellStart: -2 } }).mechs.every((m) => m.cells === 0)).toBe(true);
    expect(newRace(1, { rules: { cellStart: 2, cellMax: 0 } }).mechs.every((m) => m.cells === 0)).toBe(true);
  });

  it('a gate worth nothing is dark: no Cell, no event, and it is not marked', () => {
    const a = new Arena(1, 1, { gateValue: 0 });
    const m = approach(a, FW0, 0);
    a.step(4);
    expect(m.cells).toBe(0);
    expect(m.gateMask).toBe(0);
    expect(a.events('gate')).toEqual([]);
  });
});

describe('which laps the gates are lit', () => {
  /** A mech on its lap `lapIndex + 1` driven through gate 0. Returns its Cells afterwards. */
  function onLap(lapIndex: number, rules?: Partial<Rules>): number {
    const a = new Arena((Math.min(lapIndex, 2) + 1) as 1 | 2 | 3, 1, rules);
    const m = approach(a, FW0, 0);
    expect(m.lap).toBe(lapIndex);
    a.step(4);
    expect(m.s - a.base).toBeGreaterThan(G0.s);
    return m.cells;
  }

  it('by default on every lap, so a spent Cell can be earned back', () => {
    expect(DEFAULT_RULES.gateLaps).toBe(3);
    expect(DEFAULT_RULES.gateValueLater).toBe(DEFAULT_RULES.gateValue);
    expect(onLap(0)).toBe(1);
    expect(onLap(1)).toBe(1);
    expect(onLap(2)).toBe(1);
  });

  it('rules.gateLaps 1 is the formation lap only; 2 adds the battle lap; 0 never', () => {
    expect(onLap(0, { gateLaps: 1 })).toBe(1);
    expect(onLap(1, { gateLaps: 1 })).toBe(0);
    expect(onLap(2, { gateLaps: 1 })).toBe(0);
    expect(onLap(0, { gateLaps: 2 })).toBe(1);
    expect(onLap(1, { gateLaps: 2 })).toBe(1);
    expect(onLap(2, { gateLaps: 2 })).toBe(0);
    expect(onLap(2, { gateLaps: 3 })).toBe(1);
    expect(onLap(0, { gateLaps: 0 })).toBe(0);
  });

  it('rules.gateValueLater sets what a gate is worth after the formation lap', () => {
    expect(onLap(0, { gateValueLater: 0.25 })).toBe(1);
    expect(onLap(1, { gateValueLater: 0.25 })).toBe(0.25);
    expect(onLap(2, { gateValueLater: 0.25 })).toBe(0.25);
    expect(onLap(1, { gateValueLater: 0.5 })).toBe(0.5);
    // Nothing: the gates are out after lap 1, however many laps they are "lit" for.
    expect(onLap(1, { gateValueLater: 0 })).toBe(0);
    expect(onLap(2, { gateValueLater: 0 })).toBe(0);
    expect(onLap(0, { gateValueLater: 0 })).toBe(1);
  });

  it('a Cell spent on the battle lap can be won back at the next gate', () => {
    const a = new Arena(2);
    const m = giveCells(a.put(FW0, 0, 0), 1);
    a.ability(FW0);
    expect(m.cells).toBe(0);
    m.s = a.base + GATES[0].s - 3;
    m.d = GATES[0].d;
    m.heading = 0;
    a.step(5);
    expect(m.cells).toBe(1);
    expect(a.events('gate').length).toBe(1);
  });

  it('it is the mech\'s own lap that counts, not the leader\'s', () => {
    // The race is on its battle lap (the leader started lap 2), but this
    // back-marker is still on its first lap: the gates are lit for it.
    const a = new Arena(2);
    const leader = a.put(FW1, 500, 0);
    const back = a.put(MF0, 0, 0);
    back.s = G0.s - 3; // lap 1 distance, not a.base + ...
    back.d = G0.d;
    back.lap = 0;
    a.step(4);
    expect(a.race.lapPhase).toBe(2);
    expect(leader.lap).toBe(1);
    expect(back.cells).toBe(1);
  });

  it('starting a new lap clears the record of gates taken', () => {
    const a = new Arena(1);
    const m = a.put(FW0, L - 20, 0);
    m.gateMask = 0b101101;
    m.cells = 2;
    const n = a.until(() => m.lap === 1, 30);
    expect(n).toBeGreaterThan(0);
    expect(m.gateMask).toBe(0);
    expect(m.cells).toBe(2); // the Cells themselves carry over
    expect(a.events('lap')).toMatchObject([{ mech: FW0, lap: 2 }]);
  });

  it('with the gates lit for two laps, each one pays once on each lap', () => {
    // Half a Cell a gate and no going dark, so a lap of them is three and two laps six.
    const a = new Arena(1, 1, { gateLaps: 2, cellMax: 6, gateValue: 0.5, gateValueLater: 0.5, gateRelight: 0 });
    const m = a.put(FW0, 0, 0);
    const lapOfGates = () => {
      for (let g = 0; g < GATES.length; g++) {
        m.s = m.lap * L + GATES[g].s - 3;
        m.d = GATES[g].d;
        m.heading = 0;
        a.step(4);
        // And shoved back for a second go at it: nothing.
        m.s = m.lap * L + GATES[g].s - 3;
        a.step(4);
      }
    };
    lapOfGates();
    expect(m.cells).toBe(3);
    expect(m.gateMask).toBe(0b111111);
    // Round to the line and into lap 2.
    m.s = L - 10;
    m.d = 0;
    a.step(10);
    expect(m.lap).toBe(1);
    expect(m.gateMask).toBe(0);
    lapOfGates();
    expect(m.cells).toBe(6);
    expect(a.events('gate').length).toBe(12);
    // Lap 3: lights out.
    m.s = 2 * L - 10;
    m.d = 0;
    a.step(10);
    expect(m.lap).toBe(2);
    m.cells = 0;
    lapOfGates();
    expect(m.cells).toBe(0);
    expect(a.events('gate').length).toBe(12);
  });

  it('gates work at unwrapped distances: the same gate on lap 2 is at s + one lap', () => {
    const a = new Arena(2, 1, { gateLaps: 2 });
    const m = approach(a, MF1, 4);
    expect(m.s).toBeGreaterThan(L);
    a.step(4);
    expect(m.cells).toBe(1);
    expect(a.events('gate')).toMatchObject([{ mech: MF1, gate: 4 }]);
  });
});

describe('who cannot score', () => {
  it('a wreck coasting through a gate scores nothing', () => {
    const a = new Arena(1);
    const m = a.put(FW0, G0.s - 30, G0.d);
    retire(a.race, m, null);
    a.step(120);
    expect(m.s - a.base).toBeGreaterThan(G0.s);
    expect(m.cells).toBe(0);
    expect(m.gateMask).toBe(0);
    expect(a.events('gate').length).toBe(0);
  });

  it('nor does a finished mech on its cool-down lap, even with the gates lit all race', () => {
    const a = new Arena(3, 1, { gateLaps: 99 });
    const m = a.put(FW0, L - 30, 0);
    a.until(() => m.finished, 60);
    expect(m.finished).toBe(true);
    m.s = 3 * L + G0.s - 10;
    m.d = G0.d;
    a.step(60);
    expect(m.s).toBeGreaterThan(3 * L + G0.s);
    expect(m.cells).toBe(0);
    expect(a.events('gate').length).toBe(0);
    // (A mech still racing on that lap does score with this rule, for contrast.)
    const racer = a.put(MF1, G0.s - 3, G0.d);
    a.step(4);
    expect(racer.cells).toBe(1);
  });

  it('nobody scores during the countdown, or after the flag', () => {
    const race = newRace(4, { humans: 'all', laps: 1, rules: { gateLaps: 99 } });
    const inputs = makeInputs(race);
    // Parked on the grid with a gate moved onto it would be the only way; the
    // real check is simply that nothing changes before GO.
    for (let i = 0; i < 200; i++) {
      stepRace(race, TRACK, inputs);
      expect(race.mechs.every((m) => m.cells === 0 && m.gateMask === 0)).toBe(true);
    }
    runCountdown(race, inputs);
    // One mech finishes; the rest are flagged where they stand when the grace runs out.
    race.mechs[FW0].s = L - 5;
    (inputs[FW0] as MechInput).throttle = 1;
    while (race.phase !== PHASE.FINISHED && race.tick < 4000) stepRace(race, TRACK, inputs);
    expect(race.phase).toBe(PHASE.FINISHED);
    const m = race.mechs[MF0];
    m.s = G0.s - 3;
    m.d = G0.d;
    m.speed = m.vs = 100;
    (inputs[MF0] as MechInput).throttle = 1;
    for (let i = 0; i < 60; i++) {
      stepRace(race, TRACK, inputs);
      expect(race.events.some((e) => e.type === 'gate')).toBe(false);
    }
    expect(m.s).toBeGreaterThan(G0.s);
    expect(m.cells).toBe(0);
  });
});

describe('a lap of gates, driven', () => {
  /** A human steering for each gate in turn through plain MechInput. Returns the race at the end of lap 1. */
  function gateRun(seed: number, gatesWanted: number) {
    const race = newRace(seed, { humans: 'all' });
    const inputs = makeInputs(race) as MechInput[];
    runCountdown(race, inputs);
    for (const m of race.mechs) if (m.id !== MF0) m.d = Math.sign(m.d) * 23; // parked out of the way
    const me = race.mechs[MF0];
    const events: Array<{ gate: number; cells: number; tick: number }> = [];
    while (me.lap < 1 && race.tick < 7000) {
      // Aim at the next gate this lap, if it is one of the first `gatesWanted`.
      const ws = me.s;
      let dWant = 0;
      for (let g = 0; g < gatesWanted; g++) {
        const ahead = GATES[g].s - ws;
        if (ahead > -2 && ahead < 320 && (me.gateMask & (1 << g)) === 0) {
          dWant = GATES[g].d;
          break;
        }
      }
      steerToward(me, inputs[MF0], dWant);
      stepRace(race, TRACK, inputs);
      for (const e of race.events) if (e.type === 'gate') events.push({ gate: e.gate, cells: e.cells, tick: race.tick });
    }
    return { race, me, events };
  }

  it('the first three in one formation lap are a full set of three Cells; the rest it passes full', () => {
    const { race, me, events } = gateRun(3, 6);
    expect(me.lap).toBe(1);
    expect(events.map((e) => e.gate)).toEqual([0, 1, 2]);
    expect(events.map((e) => e.cells)).toEqual([1, 2, 3]);
    expect(me.cells).toBe(race.rules.cellMax);
    // The parked field scored nothing.
    for (const m of race.mechs) if (m !== me) expect(m.cells).toBe(0);
  });

  it('two of them is two Cells, and the record is wiped at the line', () => {
    const { me, events } = gateRun(3, 2);
    expect(events.map((e) => e.gate)).toEqual([0, 1]);
    expect(me.cells).toBe(2);
    expect(me.gateMask).toBe(0);
  });

  it('going for the gates costs time against the racing line', () => {
    const lapTick = (gatesWanted: number) => gateRun(3, gatesWanted).race.tick;
    const none = lapTick(0);
    const all = lapTick(6);
    expect(all).toBeGreaterThan(none);
    // ...but not the earth: under two seconds on an 80 second lap.
    expect(all - none).toBeLessThan(120);
  });
});

describe('a gate and a shove from behind', () => {
  // Gates are scored after the collisions of the tick, over everything the
  // mech moved in it: its own move and any shove. (They used to be scored on
  // the mech's own move alone, so a mech that stopped a fraction short of the
  // line and was shunted across it by contact from behind went through the
  // arch and got nothing.)
  it('a mech pushed through a gate by a rear-end shunt still scores it', () => {
    // A forward doing 40 u/s, a little short of gate 0 and in line with it;
    // a defender at the limiter 8.5 units behind runs into the back of it.
    for (const short of [1.4, 1.6, 1.8]) {
      const a = new Arena(1);
      const fw = a.put(FW0, G0.s - short, G0.d, 40);
      a.inputs[FW0].throttle = 40 / a.pace;
      const df = a.put(DF0, G0.s - short - 8.5, G0.d);
      a.step(2);
      expect(a.events('bump').length).toBe(1);
      expect(fw.s - a.base).toBeGreaterThan(G0.s); // through the gate, dead centre
      // Scored on the tick of the shunt itself.
      expect(a.events('gate')).toEqual([{ type: 'gate', mech: FW0, gate: 0, cells: 1, tick: a.race.tick }]);
      expect(a.events('bump')[0].tick).toBe(a.race.tick);
      expect(fw.cells).toBe(1);
      // The defender that did the shoving is through a moment later, and finds the gate dark.
      a.step(10);
      expect(df.s - a.base).toBeGreaterThan(G0.s);
      expect(df.cells).toBe(0);
      expect(fw.cells).toBe(1);
      expect(a.events('gate').length).toBe(1);
    }
  });

  it('(the shunt itself: the mech in front ends the tick past the line, in the opening)', () => {
    const a = new Arena(1);
    const fw = a.put(FW0, G0.s - 1.6, G0.d, 40);
    a.inputs[FW0].throttle = 40 / a.pace;
    a.put(DF0, G0.s - 1.6 - 8.5, G0.d);
    a.step(1);
    expect(fw.s - a.base).toBeLessThan(G0.s);
    expect(a.events('bump').length).toBe(0);
    a.step(1);
    expect(a.events('bump').length).toBe(1);
    expect(fw.s - a.base).toBeGreaterThan(G0.s);
    expect(Math.abs(fw.d - G0.d)).toBeLessThan(G0.halfW);
    // Its own two moves alone would have left it short: 40 u/s is two thirds of a unit a tick.
    expect(G0.s - 1.6 + 2 * (40 / 60)).toBeLessThan(G0.s);
  });

  it('a shove decides it sideways too: where the mech ends the tick is what counts', () => {
    // Crossing well inside the opening and nudged about within it: scores.
    const a = new Arena(1);
    const fw = a.put(FW0, G0.s - 1, G0.d + G0.halfW - 0.6);
    const df = a.put(DF0, G0.s - 1, G0.d + G0.halfW - 0.6 - 7.05); // alongside, almost touching
    df.heading = 0.25; // swinging out into it
    a.step(1);
    expect(a.events('bump').length).toBe(1);
    expect(fw.d).toBeGreaterThan(G0.d + G0.halfW - 0.6); // moved over, still inside
    expect(fw.d).toBeLessThan(G0.d + G0.halfW);
    expect(fw.cells).toBe(1);
    // Crossing outside the opening and nudged about outside it: nothing.
    const b = new Arena(1);
    const out = b.put(FW0, G0.s - 1, G0.d + G0.halfW + 0.3);
    b.put(DF0, G0.s - 1, G0.d + G0.halfW + 0.3 - 7.05).heading = 0.25;
    b.step(1);
    expect(out.cells).toBe(0);
  });

  // Fixed in 0.2: the after-collision gate pass used to read the mech's
  // lateral position only after the tick's collisions, so a mech that crossed
  // just inside the opening and was nudged out by contact in the same tick
  // lost the gate. The opening is now judged on where the mech ended up OR
  // where it was when it crossed under its own power.
  it('a mech that crosses inside the opening scores even if contact then nudges it out of it', () => {
    for (const inside of [0.1, 0.2]) {
      const a = new Arena(1);
      const fw = a.put(FW0, G0.s - 1, G0.d + G0.halfW - inside);
      a.put(DF0, G0.s - 1, G0.d + G0.halfW - inside - 7.05).heading = 0.25;
      a.step(1);
      expect(fw.s - a.base).toBeGreaterThan(G0.s);
      expect(a.events('bump').length).toBe(1);
      expect(fw.cells).toBe(1);
    }
  });
});

describe('AI pilots and the gates', () => {
  const bitsIn = (mask: number) => {
    let n = 0;
    for (let m = mask; m; m >>= 1) n += m & 1;
    return n;
  };

  it('each pilot picks its gates at the start: a mask of the six, more of them the better the pilot', () => {
    const mean = (skill: number) => {
      let bits = 0;
      let n = 0;
      for (let seed = 1; seed <= 150; seed++) {
        for (const m of newRace(seed, { skill }).mechs) {
          expect(m.ai.gates).toBeGreaterThanOrEqual(0);
          expect(m.ai.gates).toBeLessThan(1 << GATES.length);
          expect(m.ai.abilityAt).toBe(0);
          bits += bitsIn(m.ai.gates);
          n++;
        }
      }
      return bits / n / GATES.length;
    };
    // The chance of wanting any one gate runs from 30% for the worst pilot to 95% for the best.
    expect(mean(0)).toBeGreaterThan(0.25);
    expect(mean(0)).toBeLessThan(0.35);
    expect(mean(0.5)).toBeGreaterThan(0.57);
    expect(mean(0.5)).toBeLessThan(0.68);
    expect(mean(1)).toBeGreaterThan(0.92);
    expect(mean(1)).toBeLessThan(0.98);
  });

  it('the choice comes from the race seed, and human seats draw theirs too', () => {
    const a = newRace(42);
    const b = newRace(42);
    const c = newRace(43);
    expect(b.mechs.map((m) => m.ai.gates)).toEqual(a.mechs.map((m) => m.ai.gates));
    expect(c.mechs.map((m) => m.ai.gates)).not.toEqual(a.mechs.map((m) => m.ai.gates));
    // Who holds a seat does not change what is drawn for it (or for anyone after it).
    const withHumans = newRace(42, { humans: [FW0, MF1] });
    expect(withHumans.mechs.map((m) => m.ai.gates)).toEqual(a.mechs.map((m) => m.ai.gates));
    expect(withHumans.mechs.map((m) => m.ai.lane)).toEqual(a.mechs.map((m) => m.ai.lane));
    expect(withHumans.rng).toBe(a.rng);
  });

  it('on the formation lap they fight for them: every gate is taken, by a pilot who meant to', () => {
    // The pack is together on lap 1 and a gate goes dark for seconds once
    // taken, so each one goes to whoever gets there first.
    let meant = 0;
    let stray = 0;
    for (const [seed, skill] of [
      [11, 0.9],
      [12, 0.6],
      [13, 0.3],
    ] as const) {
      const race = newRace(seed, { skill });
      const masks = race.mechs.map((m) => m.ai.gates);
      const taken = new Set<number>();
      while (race.lapPhase === 1 && race.tick < 7000) {
        stepRace(race, TRACK, []);
        for (const e of race.events) {
          if (e.type !== 'gate') continue;
          taken.add(e.gate);
          if (masks[e.mech] & (1 << e.gate)) meant++;
          else stray++;
        }
        // Nothing is refused on the way round: an AI never presses what it cannot use.
        expect(race.events.some((e) => e.type === 'denied' || e.type === 'ability')).toBe(false);
      }
      expect(race.lapPhase).toBe(2);
      expect(taken.size).toBeGreaterThanOrEqual(GATES.length - 1);
      // By the time the battle lap starts, the gate record of whoever is round has been wiped.
      for (const m of race.mechs) if (m.lap >= 1) expect(m.gateMask).toBe(0);
    }
    expect(meant).toBeGreaterThanOrEqual(3 * (GATES.length - 1));
    expect(stray).toBeLessThan(meant * 0.2); // few by accident
  });

  it('a pilot with full Cells stops going for gates', () => {
    const race = newRace(11, { skill: 1, rules: { cellStart: 3 } });
    let gates = 0;
    while (race.lapPhase === 1 && race.tick < 7000) {
      stepRace(race, TRACK, []);
      gates += race.events.filter((e) => e.type === 'gate').length;
    }
    expect(gates).toBe(0);
    expect(race.mechs.every((m) => m.cells === 3)).toBe(true);
  });
});

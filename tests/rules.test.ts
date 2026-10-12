// The tunable rules (src/sim/rules.ts): the defaults, how overrides are taken,
// and that the simulation reads them from the race state on every tick. The
// rules that belong to one system (the tow, Cells and gates, each ability,
// knock-out points) are tested with that system; this file covers the rule
// set itself, the pace rules and the Drive economy.
import { describe, expect, it } from 'vitest';
import {
  BOOST_COST,
  BTN,
  CLASSES,
  DEFAULT_RULES,
  DRIVE_LINK,
  DRIVE_MAX,
  DT,
  MODE,
  PACE,
  PACK_BONUS,
  PHASE,
  RULE_KEYS,
  RULE_LIMITS,
  TICK_RATE,
  clampRule,
  createRace,
  hpFraction,
  limiterOf,
  makeRules,
  ownTopSpeed,
  speedCap,
  stepRace,
  ticks,
} from '../src/sim/index';
import type { MechInput, RuleKey, Rules } from '../src/sim/index';
import { retire } from '../src/sim/combat';
import { Arena, DF0, FW0, FW1, MF0, MF1, TRACK, findNonFinite, makeInputs, makeSeats, newRace, runCountdown, setLapPhase, snapshot } from './helpers';

const L = TRACK.length;
const EPS = 1e-9;

describe('the default rules', () => {
  it('are the v0.2 rule sheet', () => {
    // The whole table, on purpose: this is the one place the numbers are
    // written down a second time. Retune rules.ts and this is the test to
    // update with it; everything else reads the rules from the race.
    expect({ ...DEFAULT_RULES }).toEqual({
      limiter1: 110,
      limiter2: 125,
      topScale: 1,
      boostMult: 1.2,
      armourFloor: 0.94,
      tow: 0.04,
      tow3: 0.08,
      towRange: 46,
      towRange3: 160,
      towBuild: 1.2,
      slingshot: 2.4,
      driveStart: 0,
      drivePassive: 0.8,
      driveStrip: 10,
      driveStripLap1: 6,
      driveDraft: 3,
      lap1Trickle: 0,
      battleMove: 1.6,
      momentumSecs: 0.75,
      momentumDamage: 1.35,
      momentumKnock: 1.5,
      ringoutThrow: 1.3,
      ringoutDamage: 14,
      cellMax: 3,
      cellStart: 0,
      gateValue: 0.5,
      gateValueLater: 0.5,
      gateLaps: 3,
      overdriveMult: 1.3,
      overdriveSecs: 4,
      breakawaySecs: 1.5,
      snareMult: 0.74,
      snareSecs: 3.5,
      pulseRange: 26,
      pulseDrain: 30,
      ramMult: 1.12,
      ramSecs: 3.5,
      ramDamage: 80,
      aegisSecs: 4,
      aegisRange: 34,
      aegisDamage: 0.35,
      koPoints: 3,
    });
  });

  it('are plain finite numbers, frozen, and listed by RULE_KEYS', () => {
    expect(Object.isFrozen(DEFAULT_RULES)).toBe(true);
    expect([...RULE_KEYS].sort()).toEqual(Object.keys(DEFAULT_RULES).sort());
    expect(new Set(RULE_KEYS).size).toBe(RULE_KEYS.length);
    for (const k of RULE_KEYS) {
      expect(typeof DEFAULT_RULES[k]).toBe('number');
      expect(Number.isFinite(DEFAULT_RULES[k])).toBe(true);
      expect(DEFAULT_RULES[k]).toBeGreaterThanOrEqual(0);
    }
    expect(() => {
      (DEFAULT_RULES as Rules).limiter1 = 1;
    }).toThrow();
    expect(DEFAULT_RULES.limiter1).toBe(110);
  });

  it('hang together', () => {
    const r = DEFAULT_RULES;
    // The battle lap is quicker than the formation lap, and every frame's
    // own top speed, even with no armour left, is quicker than both.
    expect(r.limiter2).toBeGreaterThan(r.limiter1);
    for (const c of CLASSES) expect(c.topSpeed * r.topScale * r.armourFloor).toBeGreaterThan(r.limiter2);
    expect(PACE).toBe(r.limiter1); // the presentation's reference pace
    expect(r.boostMult).toBeGreaterThan(1);
    expect(r.armourFloor).toBeGreaterThan(0);
    expect(r.armourFloor).toBeLessThanOrEqual(1);
    // The tow matters most on the speed lap, and reaches further there.
    expect(r.tow3).toBeGreaterThan(r.tow);
    expect(r.towRange3).toBeGreaterThan(r.towRange);
    expect(r.towBuild).toBeGreaterThan(0);
    expect(r.slingshot).toBeGreaterThan(0);
    // Charge strips pay less on the formation lap than later.
    expect(r.driveStripLap1).toBeLessThan(r.driveStrip);
    expect(r.driveStripLap1).toBeGreaterThan(0);
    // A lap through every gate fills the Cells exactly, or more than fills them.
    expect(TRACK.gates.length * r.gateValue).toBeGreaterThanOrEqual(r.cellMax);
    expect(r.cellMax).toBeGreaterThanOrEqual(1);
    expect(r.cellStart).toBeLessThanOrEqual(r.cellMax);
    // Abilities: speed-ups speed up, the Snare slows, the shield reduces.
    expect(r.overdriveMult).toBeGreaterThan(1);
    expect(r.ramMult).toBeGreaterThan(1);
    expect(r.snareMult).toBeGreaterThan(0);
    expect(r.snareMult).toBeLessThan(1);
    expect(r.aegisDamage).toBeGreaterThanOrEqual(0);
    expect(r.aegisDamage).toBeLessThan(1);
    for (const k of ['overdriveSecs', 'breakawaySecs', 'snareSecs', 'ramSecs', 'aegisSecs'] as const) expect(r[k]).toBeGreaterThan(0);
  });
});

/** A few values strictly inside a rule's range: either side of the default, and near each end. */
function inside(k: RuleKey): number[] {
  const [lo, hi] = RULE_LIMITS[k];
  const def = DEFAULT_RULES[k];
  const span = hi - lo;
  return [lo + span * 0.01, (lo + def) / 2, (def + hi) / 2, hi - span * 0.01].filter((v) => v > lo && v < hi);
}

describe('RULE_LIMITS: the range each rule is held to', () => {
  it('every rule has a range, and only rules do', () => {
    expect(Object.keys(RULE_LIMITS).sort()).toEqual([...RULE_KEYS].sort());
    expect(Object.isFrozen(RULE_LIMITS)).toBe(true);
    for (const k of RULE_KEYS) {
      const range = RULE_LIMITS[k];
      expect(range.length).toBe(2);
      const [lo, hi] = range;
      expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
      if (!(lo < hi)) throw new Error(`${k}: the range ${lo}..${hi} is empty`);
    }
  });

  it('the defaults lie inside their ranges', () => {
    for (const k of RULE_KEYS) {
      const [lo, hi] = RULE_LIMITS[k];
      if (DEFAULT_RULES[k] < lo || DEFAULT_RULES[k] > hi) throw new Error(`${k}: default ${DEFAULT_RULES[k]} is outside ${lo}..${hi}`);
      expect(clampRule(k, DEFAULT_RULES[k])).toBe(DEFAULT_RULES[k]);
    }
    expect(makeRules({ ...DEFAULT_RULES })).toEqual({ ...DEFAULT_RULES });
  });

  it('no range lets a rule go negative, or turn a bonus into a penalty', () => {
    for (const k of RULE_KEYS) expect(RULE_LIMITS[k][0]).toBeGreaterThanOrEqual(0);
    // Nothing can be parked, or run backwards: the limiters and the speed
    // multipliers all have a floor above zero.
    for (const k of ['limiter1', 'limiter2', 'topScale', 'armourFloor', 'battleMove', 'snareMult'] as const) expect(RULE_LIMITS[k][0]).toBeGreaterThan(0);
    // Things that speed a mech up cannot be set to slow it down...
    for (const k of ['boostMult', 'overdriveMult', 'ramMult'] as const) expect(RULE_LIMITS[k][0]).toBe(1);
    // ...and things that take something away cannot be set to give it.
    for (const k of ['snareMult', 'aegisDamage', 'armourFloor'] as const) expect(RULE_LIMITS[k][1]).toBe(1);
    // The Cell rules agree with each other, and gates stay one bit each.
    expect(RULE_LIMITS.cellStart[1]).toBeLessThanOrEqual(RULE_LIMITS.cellMax[1]);
    expect(RULE_LIMITS.driveStart[1]).toBe(DRIVE_MAX);
    expect(RULE_LIMITS.pulseDrain[1]).toBe(DRIVE_MAX);
  });

  it('clampRule: inside the range is left alone, the ends included', () => {
    for (const k of RULE_KEYS) {
      const [lo, hi] = RULE_LIMITS[k];
      expect(clampRule(k, lo)).toBe(lo);
      expect(clampRule(k, hi)).toBe(hi);
      for (const v of inside(k)) expect(clampRule(k, v)).toBe(v);
    }
  });

  it('clampRule: outside the range lands on the nearest end', () => {
    for (const k of RULE_KEYS) {
      const [lo, hi] = RULE_LIMITS[k];
      for (const below of [lo - 1e-9, lo - 1, -1, -1e9, -Number.MAX_VALUE]) {
        if (below < lo) expect(clampRule(k, below)).toBe(lo);
      }
      for (const above of [hi + 1e-9, hi + 1, hi * 10 + 1, 1e12, Number.MAX_VALUE]) expect(clampRule(k, above)).toBe(hi);
    }
  });

  it('clampRule: what is not a finite number gets the default', () => {
    for (const k of RULE_KEYS) {
      for (const bad of [NaN, Infinity, -Infinity, '5', null, undefined, true, {}, [5]] as unknown[]) {
        expect(clampRule(k, bad)).toBe(DEFAULT_RULES[k]);
      }
    }
  });

  it('makeRules holds every rule to its range, whichever way it is out', () => {
    const allLow = makeRules(Object.fromEntries(RULE_KEYS.map((k) => [k, -1e9])) as unknown as Partial<Rules>);
    const allHigh = makeRules(Object.fromEntries(RULE_KEYS.map((k) => [k, 1e12])) as unknown as Partial<Rules>);
    for (const k of RULE_KEYS) {
      expect(allLow[k]).toBe(RULE_LIMITS[k][0]);
      expect(allHigh[k]).toBe(RULE_LIMITS[k][1]);
      // One at a time, next to a perfectly good neighbour.
      const one = makeRules({ [k]: -1e9, koPoints: k === 'koPoints' ? -1e9 : 7 } as Partial<Rules>);
      expect(one[k]).toBe(RULE_LIMITS[k][0]);
      if (k !== 'koPoints') expect(one.koPoints).toBe(7);
    }
  });

  it('a race is made with clamped rules', () => {
    const race = createRace(TRACK, { seed: 1, seats: makeSeats(), rules: { limiter1: -50, limiter2: 1e9, cellMax: -1, cellStart: 99, gateValue: -1, drivePassive: -1, ramDamage: -1, topScale: 0 } });
    expect(race.rules.limiter1).toBe(RULE_LIMITS.limiter1[0]);
    expect(race.rules.limiter2).toBe(RULE_LIMITS.limiter2[1]);
    expect(race.rules.cellMax).toBe(0);
    expect(race.rules.cellStart).toBe(RULE_LIMITS.cellStart[1]);
    expect(race.rules.gateValue).toBe(0);
    expect(race.rules.drivePassive).toBe(0);
    expect(race.rules.ramDamage).toBe(0);
    expect(race.rules.topScale).toBe(RULE_LIMITS.topScale[0]);
    for (const k of RULE_KEYS) {
      expect(race.rules[k]).toBeGreaterThanOrEqual(RULE_LIMITS[k][0]);
      expect(race.rules[k]).toBeLessThanOrEqual(RULE_LIMITS[k][1]);
    }
    // No mech starts in the red: Cells at zero (the cap came out as zero), not below it.
    for (const m of race.mechs) expect(m.cells).toBe(0);
  });

  it('only makeRules and createRace clamp: a number written into race.rules is used as it stands', () => {
    // (This is how the tuning panel retunes a race in progress; its sliders have their own ranges.)
    const race = newRace(1);
    race.rules.limiter1 = 5;
    race.rules.koPoints = 1e6;
    expect(race.rules.limiter1).toBe(5);
    expect(limiterOf(race)).toBe(5);
    runCountdown(race);
    for (let i = 0; i < 300; i++) stepRace(race, TRACK, []);
    expect(race.rules.limiter1).toBe(5);
    expect(race.rules.koPoints).toBe(1e6);
    for (const m of race.mechs) expect(m.speed).toBeLessThan(10);
  });
});

describe('makeRules', () => {
  it('with nothing to override gives a fresh copy of the defaults', () => {
    for (const arg of [undefined, null, {}] as const) {
      const r = makeRules(arg);
      expect(r).toEqual({ ...DEFAULT_RULES });
      expect(r).not.toBe(DEFAULT_RULES);
      expect(Object.isFrozen(r)).toBe(false);
    }
    const a = makeRules();
    const b = makeRules();
    expect(a).not.toBe(b);
    a.limiter1 = 1;
    expect(b.limiter1).toBe(DEFAULT_RULES.limiter1);
    expect(DEFAULT_RULES.limiter1).toBe(110);
  });

  it('takes overrides for the keys given and leaves the rest alone', () => {
    const r = makeRules({ limiter1: 90, koPoints: 0, cellMax: 5 });
    expect(r.limiter1).toBe(90);
    expect(r.koPoints).toBe(0);
    expect(r.cellMax).toBe(5);
    for (const k of RULE_KEYS) {
      if (k === 'limiter1' || k === 'koPoints' || k === 'cellMax') continue;
      expect(r[k]).toBe(DEFAULT_RULES[k]);
    }
  });

  it('every rule can be overridden, anywhere inside its range', () => {
    for (const k of RULE_KEYS) {
      for (const value of inside(k)) {
        const r = makeRules({ [k]: value } as Partial<Rules>);
        expect(r[k]).toBe(value);
        expect(Object.keys(r).length).toBe(RULE_KEYS.length);
        // ...and nothing else moved.
        for (const other of RULE_KEYS) if (other !== k) expect(r[other]).toBe(DEFAULT_RULES[other]);
      }
    }
  });

  it('ignores anything that is not a finite number', () => {
    const junk: unknown[] = [NaN, Infinity, -Infinity, '90', '', null, undefined, true, false, {}, [], [90], () => 90, BigInt(90)];
    for (const k of RULE_KEYS) {
      for (const bad of junk) {
        const r = makeRules({ [k]: bad } as unknown as Partial<Rules>);
        expect(r[k]).toBe(DEFAULT_RULES[k]);
      }
    }
    // A mix: the good values are taken, the junk next to them is not.
    const mixed = makeRules({ limiter1: 95, limiter2: NaN, boostMult: '2', tow: Infinity, towBuild: 0.5 } as unknown as Partial<Rules>);
    expect(mixed).toEqual({ ...DEFAULT_RULES, limiter1: 95, towBuild: 0.5 });
  });

  it('does not pick up keys that are not rules', () => {
    const r = makeRules({ limiter1: 95, turbo: 9, __proto__: { koPoints: 99 }, constructor: 1 } as unknown as Partial<Rules>) as unknown as Record<string, unknown>;
    expect(Object.keys(r).sort()).toEqual([...RULE_KEYS].sort());
    expect(r.turbo).toBeUndefined();
    expect(r.limiter1).toBe(95);
  });

  it('takes zero where zero is in range, and pulls a finite value outside its range to the nearest end', () => {
    // (Not-a-number is ignored, default kept; a number that is merely
    // absurd is held to RULE_LIMITS. The limits have their own tests below.)
    const r = makeRules({ tow: 0, koPoints: 0, driveStart: -5, limiter1: 1e9, limiter2: 0, cellMax: -1, ramDamage: -80 });
    expect(r.tow).toBe(0);
    expect(r.koPoints).toBe(0);
    expect(r.driveStart).toBe(0);
    expect(r.limiter1).toBe(RULE_LIMITS.limiter1[1]);
    expect(r.limiter2).toBe(RULE_LIMITS.limiter2[0]);
    expect(r.cellMax).toBe(0);
    expect(r.ramDamage).toBe(0);
  });

  it('does not write to what it is given', () => {
    const over = Object.freeze({ limiter1: 95, limiter2: NaN });
    const r = makeRules(over);
    r.limiter1 = 1;
    expect(over.limiter1).toBe(95);
  });
});

describe('ticks()', () => {
  it('turns seconds into whole ticks, never fewer than one', () => {
    expect(ticks(1)).toBe(TICK_RATE);
    expect(ticks(4)).toBe(240);
    expect(ticks(3.5)).toBe(210);
    expect(ticks(1.5)).toBe(90);
    expect(ticks(0.01)).toBe(1);
    expect(ticks(0.024)).toBe(1);
    expect(ticks(0.026)).toBe(2);
    expect(ticks(0)).toBe(1);
    expect(ticks(-3)).toBe(1);
    for (const k of ['overdriveSecs', 'breakawaySecs', 'snareSecs', 'ramSecs', 'aegisSecs'] as const) {
      expect(ticks(DEFAULT_RULES[k])).toBe(DEFAULT_RULES[k] * TICK_RATE);
    }
  });
});

describe('rules in a race', () => {
  it('a race gets the defaults unless the config says otherwise', () => {
    const race = newRace(1);
    expect(race.rules).toEqual({ ...DEFAULT_RULES });
    expect(race.rules).not.toBe(DEFAULT_RULES);
    const tuned = newRace(1, { rules: { limiter1: 100, tow3: 0.12 } });
    expect(tuned.rules).toEqual({ ...DEFAULT_RULES, limiter1: 100, tow3: 0.12 });
  });

  it('junk in the config is ignored, key by key', () => {
    const race = createRace(TRACK, {
      seed: 1,
      seats: makeSeats(),
      rules: { limiter1: NaN, limiter2: Infinity, boostMult: 1.5, koPoints: 'lots', bogus: 4 } as unknown as Partial<Rules>,
    });
    expect(race.rules).toEqual({ ...DEFAULT_RULES, boostMult: 1.5 });
    expect(findNonFinite(race)).toBe(null);
  });

  it('the rules live in the race state as plain numbers', () => {
    const race = newRace(1, { rules: { limiter1: 100 } });
    expect(Object.keys(race.rules).sort()).toEqual([...RULE_KEYS].sort());
    expect(Object.getPrototypeOf(race.rules)).toBe(Object.prototype);
    // So they travel with a snapshot, a copy, or a save file...
    expect(JSON.parse(snapshot(race)).rules).toEqual(race.rules);
    expect(structuredClone(race).rules).toEqual(race.rules);
    // ...and each race has its own.
    const other = newRace(1);
    race.rules.koPoints = 9;
    expect(other.rules.koPoints).toBe(DEFAULT_RULES.koPoints);
  });

  it('stepping a race never changes its rules', () => {
    const race = newRace(12, { rules: { tow: 0.05, cellStart: 1 } });
    const before = JSON.stringify(race.rules);
    for (let i = 0; i < 6000; i++) stepRace(race, TRACK, []);
    expect(race.lapPhase).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(race.rules)).toBe(before);
  });
});

describe('the limiter, by lap phase', () => {
  it('limiterOf is limiter1 on the formation lap and limiter2 from then on', () => {
    const race = newRace(1, { rules: { limiter1: 101, limiter2: 137 } });
    expect(race.lapPhase).toBe(1);
    expect(limiterOf(race)).toBe(101);
    setLapPhase(race, 2);
    expect(limiterOf(race)).toBe(137);
    // The speed lap has no limiter; what is left of it (the pace a fight is
    // carried at, a finished mech's cruise) uses the battle-lap figure.
    setLapPhase(race, 3);
    expect(limiterOf(race)).toBe(137);
  });

  it('speedCap follows it: the limiter on laps 1 and 2, the frame on lap 3', () => {
    for (const id of [FW0, MF0, DF0]) {
      const a = new Arena(1);
      const m = a.put(id, 0);
      const c = CLASSES[m.role];
      a.race.leaderS = m.s;
      expect(speedCap(a.race, m, c)).toBe(a.race.rules.limiter1);
      setLapPhase(a.race, 2);
      expect(speedCap(a.race, m, c)).toBe(a.race.rules.limiter2);
      setLapPhase(a.race, 3);
      expect(speedCap(a.race, m, c)).toBe(c.topSpeed);
    }
  });

  it('a mech is held to each limiter in turn as the race moves on', () => {
    // One mech on its own crosses the line to start lap 2: the limiter it
    // runs under changes with the lap phase, on the very next tick.
    const a = new Arena(1);
    const m = a.put(FW0, L - 60);
    const { limiter1, limiter2 } = a.race.rules;
    let max1 = 0;
    const crossed = a.until(() => {
      if (a.race.lapPhase === 1) max1 = Math.max(max1, m.speed);
      return a.race.lapPhase === 2;
    }, 200);
    expect(crossed).toBeGreaterThan(0);
    expect(max1).toBe(limiter1);
    expect(a.events('lapPhase')).toMatchObject([{ lap: 2 }]);
    expect(m.speed).toBe(limiter1);
    a.step(1);
    expect(m.speed).toBeGreaterThan(limiter1);
    let max2 = 0;
    a.step(240, () => (max2 = Math.max(max2, m.speed)));
    expect(max2).toBeCloseTo(limiter2, 9);
    expect(max2).toBeLessThanOrEqual(limiter2 + EPS);
  });

  it('changing race.rules mid-race takes effect on the next tick', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
    a.step(30);
    expect(m.speed).toBe(110);
    // Turn the limiter down: the mech is dragged to the new figure.
    a.race.rules.limiter1 = 90;
    expect(a.pace).toBe(90);
    a.step(1);
    expect(m.speed).toBeLessThan(110);
    a.step(60);
    expect(m.speed).toBeCloseTo(90, 9);
    // And up again: it accelerates to it.
    a.race.rules.limiter1 = 130;
    a.step(1);
    expect(m.speed).toBeGreaterThan(90);
    a.step(300);
    expect(m.speed).toBeCloseTo(130, 9);
    // limiter2 is not in force on the formation lap, so changing it does nothing yet.
    a.race.rules.limiter2 = 50;
    a.step(60);
    expect(m.speed).toBeCloseTo(130, 9);
    setLapPhase(a.race, 2);
    a.step(120);
    expect(m.speed).toBeCloseTo(50, 9);
  });

  it('the pack bonus opens whichever limiter is in force', () => {
    for (const lapPhase of [1, 2] as const) {
      const a = new Arena(lapPhase, 1, { limiter1: 100, limiter2: 140 });
      const m = a.put(MF0, -250);
      a.put(FW1, 2500, 20, 0); // the leader, parked far up the road
      a.step(400);
      expect(m.speed).toBeCloseTo((lapPhase === 1 ? 100 : 140) * (1 + PACK_BONUS), 6);
    }
  });

  it('a limiter cannot be configured below its floor: asking for zero gets the slowest race allowed', () => {
    const race = newRace(3, { rules: { limiter1: 0 } });
    const floor = RULE_LIMITS.limiter1[0];
    expect(race.rules.limiter1).toBe(floor);
    expect(floor).toBeGreaterThan(0);
    runCountdown(race);
    let max = 0;
    for (let i = 0; i < 900; i++) {
      stepRace(race, TRACK, []);
      expect(findNonFinite(race)).toBe(null);
      // (Perfect launches leave the line a little over this limiter, and are dragged back to it.)
      if (i > 300) for (const m of race.mechs) if (m.mode === MODE.SPEED) max = Math.max(max, m.speed);
    }
    // Slow, but a race: the field is under way at the floor (pack bonus and tow on top).
    expect(max).toBeGreaterThan(floor - 1);
    expect(max).toBeLessThanOrEqual(floor * (1 + PACK_BONUS) * (1 + race.rules.tow) * race.rules.boostMult + EPS);
    for (const m of race.mechs) expect(m.s).toBeGreaterThan(300);
  });

  it('a limiter of zero written into a running race parks the field without breaking anything', () => {
    // Not reachable through the config any more, but the tuning panel writes
    // race.rules directly, so the sim still has to live with it.
    const race = newRace(3);
    runCountdown(race);
    race.rules.limiter1 = 0;
    for (let i = 0; i < 600; i++) {
      stepRace(race, TRACK, []);
      expect(findNonFinite(race)).toBe(null);
    }
    for (const m of race.mechs) {
      // (A perfect launch still leaves the line at its bonus speed, then is dragged to a stop.)
      expect(m.speed).toBe(0);
      expect(m.s).toBeLessThan(200);
    }
    expect(race.phase).toBe(PHASE.RACING);
  });
});

describe('the speed lap: topScale and the armour penalty', () => {
  it('ownTopSpeed is the class figure x rules.topScale at full armour', () => {
    for (const topScale of [1, 0.8, 1.25]) {
      const a = new Arena(3, 1, { topScale });
      for (const id of [FW0, MF0, DF0]) {
        const m = a.mech(id);
        const c = CLASSES[m.role];
        expect(hpFraction(m)).toBe(1);
        expect(ownTopSpeed(a.race, m, c)).toBeCloseTo(c.topSpeed * topScale, 9);
        expect(speedCap(a.race, m, c)).toBe(ownTopSpeed(a.race, m, c));
      }
    }
  });

  it('missing armour costs speed linearly, down to rules.armourFloor with none left', () => {
    for (const armourFloor of [DEFAULT_RULES.armourFloor, 0.5, 0.86]) {
      const a = new Arena(3, 1, { armourFloor });
      for (const id of [FW0, MF0, DF0]) {
        const m = a.mech(id);
        const c = CLASSES[m.role];
        let prev = Infinity;
        for (const frac of [1, 0.75, 0.5, 0.25, 0.01]) {
          m.hp = c.maxHp * frac;
          const top = ownTopSpeed(a.race, m, c);
          expect(top).toBeCloseTo(c.topSpeed * (armourFloor + (1 - armourFloor) * frac), 9);
          // Bounds: never below the floor, never above the frame's own figure.
          expect(top).toBeGreaterThanOrEqual(c.topSpeed * armourFloor);
          expect(top).toBeLessThanOrEqual(c.topSpeed);
          expect(top).toBeLessThan(prev + EPS);
          prev = top;
        }
        m.hp = c.maxHp;
      }
    }
  });

  it('armourFloor 1 means damage never costs speed', () => {
    const a = new Arena(3, 1, { armourFloor: 1 });
    const m = a.put(DF0, -250);
    const c = CLASSES[m.role];
    m.hp = 1;
    expect(ownTopSpeed(a.race, m, c)).toBe(c.topSpeed);
    a.step(600, () => a.recenter([DF0]));
    expect(m.speed).toBeCloseTo(c.topSpeed, 6);
  });

  it('a damaged mech is really held to its reduced top speed, and gets it back if the rule changes', () => {
    const a = new Arena(3);
    const m = a.put(FW0, -250);
    const c = CLASSES[m.role];
    m.hp = c.maxHp * 0.25;
    const floor = a.race.rules.armourFloor;
    const cap = c.topSpeed * (floor + (1 - floor) * 0.25);
    let max = 0;
    a.step(600, () => {
      a.recenter([FW0]);
      max = Math.max(max, m.speed);
    });
    expect(max).toBeCloseTo(cap, 9);
    expect(max).toBeLessThan(c.topSpeed - 5);
    a.race.rules.armourFloor = 1;
    a.step(600, () => a.recenter([FW0]));
    expect(m.speed).toBeCloseTo(c.topSpeed, 6);
  });

  it('the penalty is a speed-lap matter: on laps 1 and 2 a wounded mech runs the limiter like anyone', () => {
    for (const lapPhase of [1, 2] as const) {
      const a = new Arena(lapPhase);
      const m = a.put(DF0, -250);
      m.hp = 1;
      expect(speedCap(a.race, m, CLASSES[m.role])).toBe(a.pace);
      a.step(120);
      expect(m.speed).toBe(a.pace);
    }
  });

  it('topScale scales what a mech actually does on lap 3', () => {
    const a = new Arena(3, 1, { topScale: 0.9 });
    const m = a.put(MF1, -250);
    a.step(900, () => a.recenter([MF1]));
    expect(m.speed).toBeCloseTo(CLASSES[m.role].topSpeed * 0.9, 6);
  });
});

describe('boostMult', () => {
  it('1 is a boost that burns Drive for no speed at all', () => {
    const a = new Arena(2, 1, { boostMult: 1 });
    const m = a.put(FW0, -250);
    m.drive = 50;
    a.hold(FW0, BTN.A).step(60);
    expect(m.boosting).toBe(true);
    expect(m.speed).toBe(a.pace);
    expect(m.drive).toBeCloseTo(50 - 60 * (BOOST_COST - a.race.rules.drivePassive) * DT, 6);
  });

  it('scales the cap on the speed lap as well', () => {
    const a = new Arena(3, 1, { boostMult: 1.1 });
    const m = a.put(FW0, -250);
    m.drive = 100;
    a.hold(FW0, BTN.A);
    let max = 0;
    a.step(360, () => {
      a.recenter([FW0]);
      max = Math.max(max, m.speed);
    });
    expect(max).toBeCloseTo(CLASSES[m.role].topSpeed * 1.1, 4);
    expect(max).toBeLessThanOrEqual(CLASSES[m.role].topSpeed * 1.1 + EPS);
  });
});

describe('Drive on the formation lap', () => {
  const strip = TRACK.strips[0];

  it('nothing trickles in: a mech cruising off the strips keeps exactly what it had', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250, 0);
    m.drive = 12;
    a.step(300, () => expect(m.onStrip).toBe(false));
    expect(m.drive).toBe(12);
  });

  it('a slipstream gives the tow but no Drive', () => {
    const a = new Arena(1);
    const me = a.put(FW0, -250, 0);
    a.put(FW1, -225, 0);
    me.drive = 12;
    a.step(120, () => expect(me.drafting).toBe(true));
    expect(me.tow).toBe(1);
    expect(me.speed).toBeGreaterThan(a.pace);
    expect(me.drive).toBe(12);
  });

  it('a charge strip pays rules.driveStripLap1 per second, and that is all there is', () => {
    const a = new Arena(1);
    const on = a.put(FW0, strip.s0 + 5, strip.d);
    const off = a.put(MF0, strip.s0 + 5, strip.d + strip.halfW + 6);
    on.drive = off.drive = 20;
    a.step(100, () => expect(on.onStrip).toBe(true));
    expect(on.drive).toBeCloseTo(20 + 100 * a.race.rules.driveStripLap1 * DT, 9);
    expect(off.drive).toBe(20);
  });

  it('the perfect-launch Drive is the only other source', () => {
    // An all-AI formation lap: whatever Drive anyone holds came from a
    // launch (+10) or from time on a strip (6 a second). Nobody boosts it
    // away on lap 1 unless they have it, so the gauge never exceeds that.
    const race = newRace(21, { skill: 1 });
    const launched = race.mechs.map(() => 0);
    const stripTicks = race.mechs.map(() => 0);
    while (race.lapPhase === 1 && race.tick < 7000) {
      stepRace(race, TRACK, []);
      for (const e of race.events) if (e.type === 'launch') launched[e.mech] = 10;
      if (race.lapPhase !== 1) break;
      for (const m of race.mechs) {
        if (m.onStrip) stripTicks[m.id]++;
        expect(m.drive).toBeLessThanOrEqual(launched[m.id] + stripTicks[m.id] * race.rules.driveStripLap1 * DT + 1e-6);
      }
    }
    expect(race.lapPhase).toBe(2);
    expect(Math.max(...stripTicks)).toBeGreaterThan(100);
    expect(launched.some((d) => d > 0)).toBe(true);
  });

  it('the strip rate of each lap is its own rule', () => {
    const lap1 = new Arena(1, 1, { driveStripLap1: 2.5, driveStrip: 40 });
    const m1 = lap1.put(FW0, strip.s0 + 5, strip.d);
    lap1.step(60);
    expect(m1.drive).toBeCloseTo(60 * 2.5 * DT, 9);

    const lap2 = new Arena(2, 1, { driveStripLap1: 2.5, driveStrip: 40, drivePassive: 0 });
    const m2 = lap2.put(FW0, strip.s0 + 5, strip.d);
    lap2.step(60);
    expect(m2.drive).toBeCloseTo(60 * 40 * DT, 9);

    // Zero switches the strips off.
    const off = new Arena(1, 1, { driveStripLap1: 0 });
    const m3 = off.put(FW0, strip.s0 + 5, strip.d);
    off.step(60, () => expect(m3.onStrip).toBe(true));
    expect(m3.drive).toBe(0);
  });

  it('rules.lap1Trickle turns the passive, slipstream and link Drive back on for lap 1', () => {
    const a = new Arena(1, 1, { lap1Trickle: 1 });
    const { drivePassive, driveDraft } = a.race.rules;
    const alone = a.put(MF0, -250, -12);
    const me = a.put(FW0, -250, 0);
    a.put(FW1, -225, 0);
    // (With the trickle on, the GO tick itself already paid a tick of it.)
    const d0 = [alone.drive, me.drive];
    a.step(60, () => expect(me.drafting && !alone.drafting && !alone.onStrip && !me.onStrip).toBe(true));
    expect(alone.drive - d0[0]).toBeCloseTo(60 * drivePassive * DT, 9);
    expect(me.drive - d0[1]).toBeCloseTo(60 * (drivePassive + driveDraft) * DT, 9);
    // The strip still pays the lap-1 rate, now on top of the trickle.
    const on = a.put(DF0, strip.s0 + 5, strip.d);
    const before = on.drive;
    a.step(60, () => expect(on.onStrip).toBe(true));
    expect(on.drive - before).toBeCloseTo(60 * (a.race.rules.driveStripLap1 + drivePassive) * DT, 9);
  });

  it('lap1Trickle is a switch: on from 0.5 up, off below', () => {
    const gain = (lap1Trickle: number) => {
      const a = new Arena(1, 1, { lap1Trickle });
      const m = a.put(FW0, -250, 0);
      const d0 = m.drive;
      a.step(60);
      return m.drive - d0;
    };
    expect(gain(0)).toBe(0);
    expect(gain(0.49)).toBe(0);
    expect(gain(0.5)).toBeCloseTo(60 * DEFAULT_RULES.drivePassive * DT, 9);
    expect(gain(1)).toBeCloseTo(60 * DEFAULT_RULES.drivePassive * DT, 9);
    // (Anything over 1 is clamped to 1 by the rule's range: still "on".)
    expect(gain(7)).toBeCloseTo(60 * DEFAULT_RULES.drivePassive * DT, 9);
    expect(RULE_LIMITS.lap1Trickle).toEqual([0, 1]);
  });
});

describe('Drive from the battle lap on', () => {
  const strip = TRACK.strips[0];

  it('the passive trickle, the strip rate and the slipstream rate are rules', () => {
    const a = new Arena(2, 1, { drivePassive: 2, driveStrip: 7, driveDraft: 5 });
    const alone = a.put(MF0, -250, -12);
    const me = a.put(FW0, -250, 0);
    a.put(FW1, -225, 0);
    const on = a.put(DF0, strip.s0 + 5, strip.d);
    const d0 = [alone.drive, me.drive, on.drive];
    a.step(60, () => {
      expect(me.drafting).toBe(true);
      expect(on.onStrip).toBe(true);
      expect(alone.onStrip || alone.drafting || me.onStrip).toBe(false);
    });
    expect(alone.drive - d0[0]).toBeCloseTo(60 * 2 * DT, 9);
    expect(me.drive - d0[1]).toBeCloseTo(60 * (2 + 5) * DT, 9);
    expect(on.drive - d0[2]).toBeCloseTo(60 * (2 + 7) * DT, 9);
  });

  it('the trickle starts for everyone when the leader starts lap 2, back-markers included', () => {
    // The switch is the race's lap phase, not the mech's own lap count.
    const a = new Arena(1);
    const leader = a.put(FW0, L - 30, 0);
    const back = a.put(MF1, 2000, 0); // a long way behind, still on its first lap
    expect(a.until(() => a.race.lapPhase === 2, 100)).toBeGreaterThan(0);
    expect(leader.drive).toBe(0);
    expect(back.drive).toBe(0);
    expect(back.lap).toBe(0);
    a.step(60);
    // (Out of slipstream range of anything, and it rides no strip in this second.)
    expect(back.onStrip || back.drafting).toBe(false);
    expect(back.drive).toBeCloseTo(60 * a.race.rules.drivePassive * DT, 9);
    expect(leader.drive).toBeCloseTo(60 * a.race.rules.drivePassive * DT, 9);
  });

  it('linked team-mates share DRIVE_LINK on top (a constant, not a rule)', () => {
    const a = new Arena(2, 1, { drivePassive: 0 });
    const me = a.put(MF0, 0, 0);
    const mate = a.put(FW0, 18, 6);
    a.tap(MF0, BTN.ALLY);
    const d0 = [me.drive, mate.drive];
    a.step(60, () => expect(me.linked && mate.linked).toBe(true));
    expect(me.drive - d0[0]).toBeCloseTo(60 * DRIVE_LINK * DT, 9);
    expect(mate.drive - d0[1]).toBeCloseTo(60 * DRIVE_LINK * DT, 9);
  });

  it('the gauge still stops at DRIVE_MAX, and wrecks get nothing', () => {
    const a = new Arena(2, 1, { drivePassive: RULE_LIMITS.drivePassive[1], driveStart: 40 });
    const m = a.put(FW0, -250);
    const wreck = a.put(MF1, -200, 10);
    retire(a.race, wreck, null);
    a.step(60);
    expect(m.drive).toBe(DRIVE_MAX);
    expect(wreck.drive).toBe(40);
  });
});

describe('rules.driveStart', () => {
  it('fills every gauge on the grid', () => {
    const race = newRace(1, { rules: { driveStart: 35 } });
    for (const m of race.mechs) expect(m.drive).toBe(35);
  });

  it('with the default of zero, nobody can boost off the line without a perfect launch', () => {
    const race = newRace(5, { humans: [FW0], skill: 0 });
    const inputs = makeInputs(race);
    const mine = inputs[FW0] as MechInput;
    runCountdown(race, inputs); // throttle shut through the countdown: no launch bonus
    mine.throttle = 1;
    let boosts = 0;
    // The run down to the first charge strip: nothing to light a boost with.
    for (let i = 0; i < 150; i++) {
      mine.buttons = i % 20 < 10 ? BTN.A : 0;
      stepRace(race, TRACK, inputs);
      boosts += race.events.filter((e) => e.type === 'boost').length;
      expect(race.mechs[FW0].boosting).toBe(false);
    }
    expect(race.mechs[FW0].s).toBeLessThan(TRACK.strips[0].s0);
    expect(race.mechs[FW0].s).toBeGreaterThan(50);
    expect(boosts).toBe(0);
    expect(race.mechs[FW0].drive).toBe(0);
  });
});

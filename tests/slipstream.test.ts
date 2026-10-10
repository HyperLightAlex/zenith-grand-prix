// The tow. Tucked in behind another mech a pilot builds a charge (m.tow,
// 0..1); the charge lifts the top speed, and it lingers after pulling out,
// at full strength for the first half of the drain: the slingshot.
import { describe, expect, it } from 'vitest';
import {
  BTN,
  CLASSES,
  DEFAULT_RULES,
  DRAFT_MIN,
  DRAFT_WIDTH,
  DT,
  MODE,
  PACK_BONUS,
  RULE_LIMITS,
  TOW_FAR,
  TOW_NEAR,
  speedCap,
  towBonus,
} from '../src/sim/index';
import type { MechState, Rules } from '../src/sim/index';
import { retire } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK } from './helpers';

const L = TRACK.length;
const EPS = 1e-9;

/** Ticks a full charge takes to build, and to drain, under the given rules. */
const buildTicks = (r: Rules) => Math.round(r.towBuild / DT);
const drainTicks = (r: Rules) => Math.round(r.slingshot / DT);

/**
 * A follower (FW0) `gap` units behind a leader (FW1) in the same lane. With
 * `still`, the tow is worth no speed (rules.tow and tow3 are zero). On the
 * speed lap the two, being the same frame, then keep their gap to the last
 * decimal for as long as it takes. (On laps 1 and 2 a follower more than
 * PACK_SLACK behind still creeps up on the pack bonus; `follow` below holds
 * the gap by hand where that matters.)
 */
function pair(lapPhase: 1 | 2 | 3, gap: number, opts: { still?: boolean; side?: number; rules?: Partial<Rules> } = {}) {
  const rules = { ...(opts.still ? { tow: 0, tow3: 0 } : {}), ...opts.rules };
  const a = new Arena(lapPhase, 1, rules);
  const me = a.put(FW0, -250, 0);
  const lead = a.put(FW1, -250 + gap, opts.side ?? 0);
  return { a, me, lead };
}

/** Step `n` ticks with the leader held exactly `gap` ahead of the follower (and the pair kept on the straight). */
function follow(a: Arena, me: MechState, lead: MechState, gap: number, n: number, each?: () => void): void {
  a.step(n, () => {
    a.recenter([me.id, lead.id]);
    lead.s = me.s + gap;
    if (each) each();
  });
}

describe('the slipstream itself', () => {
  it('is felt directly behind another mech: from DRAFT_MIN back to rules.towRange on laps 1 and 2', () => {
    const range = DEFAULT_RULES.towRange;
    expect(range).toBeGreaterThan(DRAFT_MIN);
    for (const lapPhase of [1, 2] as const) {
      for (const [gap, yes] of [
        [10, true],
        [25, true],
        [range - 0.5, true],
        [range + 0.5, false],
        [range + 40, false],
      ] as const) {
        const { a, me, lead } = pair(lapPhase, gap, { still: true });
        follow(a, me, lead, gap, 5);
        if (me.drafting !== yes) throw new Error(`lap ${lapPhase}, ${gap} behind: drafting is ${me.drafting}`);
        expect(lead.drafting).toBe(false);
        expect(me.tow > 0).toBe(yes);
        expect(lead.tow).toBe(0);
      }
    }
  });

  it('reaches rules.towRange3 on the speed lap', () => {
    const { towRange, towRange3 } = DEFAULT_RULES;
    expect(towRange3).toBeGreaterThan(towRange * 2);
    for (const [gap, yes] of [
      [25, true],
      [towRange + 10, true], // out of reach on lap 2, well inside on lap 3
      [100, true],
      [towRange3 - 0.5, true],
      [towRange3 + 0.5, false],
      [towRange3 + 100, false],
    ] as const) {
      const { a, me, lead } = pair(3, gap, { still: true });
      a.step(5);
      expect(lead.s - me.s).toBeCloseTo(gap, 6);
      if (me.drafting !== yes) throw new Error(`lap 3, ${gap} behind: drafting is ${me.drafting}`);
    }
  });

  it('the reach of each lap is a rule', () => {
    const near = pair(2, 30, { still: true, rules: { towRange: 20 } });
    near.a.step(5);
    expect(near.me.drafting).toBe(false);
    const far = pair(2, 80, { still: true, rules: { towRange: 90 } });
    follow(far.a, far.me, far.lead, 80, 5);
    expect(far.me.drafting).toBe(true);
    const lap3 = pair(3, 80, { still: true, rules: { towRange3: 60 } });
    lap3.a.step(5);
    expect(lap3.me.drafting).toBe(false);
    // towRange is not what counts on lap 3, nor towRange3 before it.
    const wrong3 = pair(3, 30, { still: true, rules: { towRange: 500, towRange3: 20 } });
    wrong3.a.step(5);
    expect(wrong3.me.drafting).toBe(false);
    const wrong2 = pair(2, 80, { still: true, rules: { towRange3: 500 } });
    follow(wrong2.a, wrong2.me, wrong2.lead, 80, 5);
    expect(wrong2.me.drafting).toBe(false);
  });

  it('not from closer than DRAFT_MIN: alongside is not behind', () => {
    // Offset sideways so that the two bodies do not touch at four units.
    const at = (ahead: number) => {
      const { a, me } = pair(2, ahead, { still: true, side: DRAFT_WIDTH - 0.2 });
      a.step(3);
      expect(a.events('bump').length).toBe(0);
      return me.drafting;
    };
    expect(at(DRAFT_MIN + 0.2)).toBe(true);
    expect(at(DRAFT_MIN - 0.2)).toBe(false);
    expect(at(0)).toBe(false);
    expect(at(-10)).toBe(false);
  });

  it('the lane is DRAFT_WIDTH either side, exclusive', () => {
    for (const lapPhase of [2, 3] as const) {
      for (const [side, yes] of [
        [0, true],
        [DRAFT_WIDTH - 0.1, true],
        [-(DRAFT_WIDTH - 0.1), true],
        [DRAFT_WIDTH, false],
        [-DRAFT_WIDTH, false],
        [DRAFT_WIDTH + 0.1, false],
        [12, false],
      ] as const) {
        const { a, me } = pair(lapPhase, 25, { still: true, side });
        a.step(4);
        if (me.drafting !== yes) throw new Error(`lap ${lapPhase}, ${side} to the side: drafting is ${me.drafting}`);
        expect(me.tow > 0).toBe(yes);
      }
    }
  });

  it('needs both mechs moving: the follower above 50 u/s, the leader at 50 or more', () => {
    const at = (mySpeed: number, leadSpeed: number) => {
      const a = new Arena(2, 1, { tow: 0 });
      const me = a.put(FW0, -250, 0, mySpeed);
      const lead = a.put(FW1, -225, 0, leadSpeed);
      a.inputs[FW0].throttle = mySpeed / a.pace;
      a.inputs[FW1].throttle = leadSpeed / a.pace;
      a.step(2);
      expect(me.speed).toBeCloseTo(mySpeed, 6);
      expect(lead.speed).toBeCloseTo(leadSpeed, 6);
      return me.drafting;
    };
    expect(at(60, 60)).toBe(true);
    expect(at(51, 51)).toBe(true);
    expect(at(49, 60)).toBe(false);
    expect(at(60, 49)).toBe(false);
    expect(at(40, 40)).toBe(false);
  });

  it('anyone gives a tow: a rival, a team-mate, any frame', () => {
    for (const leadId of [FW1, MF0, DF1, DF0]) {
      const a = new Arena(2);
      const me = a.put(FW0, -250, 0);
      a.put(leadId, -225, 0);
      a.step(10);
      expect(me.drafting).toBe(true);
      expect(me.tow).toBeGreaterThan(0);
    }
  });

  it('works across the start line', () => {
    const a = new Arena(2, 1, { tow: 0 });
    const me = a.put(FW0, L - 10, 0); // ten short of the line
    const lead = a.put(FW1, L + 15, 0); // fifteen past it
    lead.lap = 2;
    a.step(1);
    expect(me.drafting).toBe(true);
  });
});

describe('the charge', () => {
  it('builds at DT / rules.towBuild per tick: full after towBuild seconds', () => {
    for (const lapPhase of [1, 2, 3] as const) {
      const { a, me, lead } = pair(lapPhase, 25);
      const rules = a.race.rules;
      const full = buildTicks(rules);
      expect(full).toBe(72);
      expect(me.tow).toBe(0);
      const seen: number[] = [];
      follow(a, me, lead, 25, full + 30, () => seen.push(me.tow));
      for (let k = 1; k <= full + 30; k++) {
        expect(seen[k - 1]).toBeCloseTo(Math.min(1, (k * DT) / rules.towBuild), 9);
      }
      // Monotonic, never past 1, and exactly 1 once it is there.
      for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeGreaterThanOrEqual(seen[k - 1]);
      expect(seen[full - 2]).toBeLessThan(1);
      expect(seen[full]).toBe(1);
      expect(Math.max(...seen)).toBe(1);
    }
  });

  it('drains at DT / rules.slingshot per tick after pulling out: gone after slingshot seconds', () => {
    for (const lapPhase of [1, 2, 3] as const) {
      const { a, me, lead } = pair(lapPhase, 25);
      const rules = a.race.rules;
      const empty = drainTicks(rules);
      expect(empty).toBe(144);
      follow(a, me, lead, 25, buildTicks(rules) + 5);
      expect(me.tow).toBe(1);
      // The leader moves out of the lane (or, the same thing, the follower pulls out).
      lead.d = me.d + DRAFT_WIDTH + 4;
      const seen: number[] = [];
      follow(a, me, lead, 25, empty + 20, () => {
        expect(me.drafting).toBe(false);
        seen.push(me.tow);
      });
      for (let k = 1; k <= empty + 20; k++) {
        expect(seen[k - 1]).toBeCloseTo(Math.max(0, 1 - (k * DT) / rules.slingshot), 9);
      }
      expect(seen[empty - 2]).toBeGreaterThan(0);
      expect(seen[empty]).toBe(0);
      expect(Math.min(...seen)).toBe(0);
    }
  });

  it('towBuild and slingshot are rules', () => {
    const { a, me, lead } = pair(2, 25, { rules: { towBuild: 0.5, slingshot: 1 } });
    follow(a, me, lead, 25, 15);
    expect(me.tow).toBeCloseTo(0.5, 9);
    follow(a, me, lead, 25, 15);
    expect(me.tow).toBeCloseTo(1, 9);
    follow(a, me, lead, 25, 5);
    expect(me.tow).toBe(1);
    lead.d = 12;
    follow(a, me, lead, 25, 30);
    expect(me.tow).toBeCloseTo(0.5, 9);
    follow(a, me, lead, 25, 30);
    expect(me.tow).toBeCloseTo(0, 9);
    follow(a, me, lead, 25, 5);
    expect(me.tow).toBe(0);
  });

  it('a partial charge drains from where it got to', () => {
    const { a, me, lead } = pair(2, 25);
    const rules = a.race.rules;
    follow(a, me, lead, 25, 18);
    const got = me.tow;
    expect(got).toBeCloseTo((18 * DT) / rules.towBuild, 9);
    lead.d = 12;
    follow(a, me, lead, 25, 10);
    expect(me.tow).toBeCloseTo(got - (10 * DT) / rules.slingshot, 9);
    // Back in line: it builds again from there, no reset.
    lead.d = 0;
    const low = me.tow;
    follow(a, me, lead, 25, 6);
    expect(me.tow).toBeCloseTo(low + (6 * DT) / rules.towBuild, 9);
  });

  it('stays between 0 and 1 whatever happens', () => {
    const { a, me, lead } = pair(3, 25);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 12; i++) {
      lead.d = i % 2 ? 12 : 0;
      follow(a, me, lead, i % 3 ? 25 : 150, 55 + i * 9, () => {
        lo = Math.min(lo, me.tow);
        hi = Math.max(hi, me.tow);
      });
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi).toBe(1);
  });
});

describe('strength: how well tucked in', () => {
  // Inside the near distance (TOW_NEAR, or 40% of the reach if that is more)
  // the charge goes to 1. Beyond it the ceiling tapers, linearly, to TOW_FAR
  // at the far end of the reach. TOW_FAR is a CHARGE (0.15): since the bonus
  // is full from half charge up, that is 30% of the bonus at the far end.
  const strengthAt = (ahead: number, range: number) => {
    const near = Math.min(range - 1, Math.max(TOW_NEAR, range * 0.4));
    return ahead <= near ? 1 : 1 + (TOW_FAR - 1) * ((ahead - near) / (range - near));
  };

  it('lap 3: full out to 64 units (40% of the reach), tapering to TOW_FAR at 160', () => {
    const range = DEFAULT_RULES.towRange3;
    expect(Math.max(TOW_NEAR, range * 0.4)).toBe(64);
    for (const gap of [10, 40, 63.5, 64.5, 88, 112, 136, 159.5]) {
      const { a, me, lead } = pair(3, gap, { still: true });
      a.step(200);
      expect(lead.s - me.s).toBeCloseTo(gap, 6);
      expect(me.drafting).toBe(true);
      expect(me.tow).toBeCloseTo(strengthAt(gap, range), 6);
    }
    expect(strengthAt(64, range)).toBe(1);
    expect(strengthAt(112, range)).toBeCloseTo((1 + TOW_FAR) / 2, 9);
    expect(strengthAt(160, range)).toBeCloseTo(TOW_FAR, 9);
    expect(TOW_FAR).toBe(0.15);
  });

  it('the bonus that goes with it: all of it three-quarters of the way in, 30% at the far end', () => {
    const { towRange3: range, tow3 } = DEFAULT_RULES;
    const near = Math.max(TOW_NEAR, range * 0.4);
    // Where the strength of the spot is exactly a half charge: full bonus from there in.
    const fullFrom = near + (range - near) * (0.5 / (1 - TOW_FAR));
    expect(fullFrom).toBeGreaterThan(115);
    expect(fullFrom).toBeLessThan(125);
    expect((range - fullFrom) / range).toBeCloseTo(0.25, 1); // the last quarter of the reach is where it fades
    const bonusAt = (gap: number) => {
      // Let the charge settle with the tow worth no speed (so the gap holds),
      // then ask what the default bonus would make of that charge.
      const { a, me, lead } = pair(3, gap, { still: true });
      a.step(200);
      expect(lead.s - me.s).toBeCloseTo(gap, 6);
      a.race.rules.tow3 = tow3;
      return towBonus(a.race, me) / tow3;
    };
    expect(bonusAt(30)).toBe(1);
    expect(bonusAt(100)).toBe(1);
    expect(bonusAt(fullFrom - 1)).toBe(1);
    expect(bonusAt(fullFrom + 5)).toBeLessThan(1);
    expect(bonusAt(140)).toBeCloseTo(2 * strengthAt(140, range), 6);
    // Right at the end of the reach: twice TOW_FAR, i.e. 30%.
    expect(bonusAt(range - 0.01)).toBeCloseTo(2 * TOW_FAR, 3);
    expect(2 * TOW_FAR).toBeCloseTo(0.3, 12);
    // And a step past it: nothing.
    expect(bonusAt(range + 1)).toBe(0);
  });

  it('laps 1 and 2: full out to TOW_NEAR, then a short taper to the end of the reach', () => {
    const range = DEFAULT_RULES.towRange;
    expect(range).toBeGreaterThan(TOW_NEAR);
    for (const gap of [10, 39.5, 41, 43, 45.5]) {
      const { a, me, lead } = pair(2, gap, { still: true });
      follow(a, me, lead, gap, 200);
      // (Held by hand: the follower creeps a hair closer within each tick.)
      expect(me.tow).toBeCloseTo(strengthAt(gap, range), 2);
    }
    expect(strengthAt(43, range)).toBeCloseTo(1 + (TOW_FAR - 1) * 0.5, 9);
  });

  it('builds to the strength of the spot and stops there, at the usual rate', () => {
    const gap = 136; // three-quarters of the way down the taper on lap 3: a charge of about 0.36
    const { a, me } = pair(3, gap, { still: true });
    const want = strengthAt(gap, DEFAULT_RULES.towRange3);
    const seen: number[] = [];
    a.step(120, () => seen.push(me.tow));
    const ticksToFill = Math.ceil(want / (DT / DEFAULT_RULES.towBuild));
    for (let k = 1; k < ticksToFill; k++) expect(seen[k - 1]).toBeCloseTo((k * DT) / DEFAULT_RULES.towBuild, 9);
    for (let k = ticksToFill; k <= 120; k++) expect(seen[k - 1]).toBeCloseTo(want, 6);
  });

  it('dropping back from close up to the far end drains the charge down to that spot\'s strength, no lower', () => {
    const { a, me, lead } = pair(3, 30, { still: true });
    a.step(100);
    expect(me.tow).toBe(1);
    lead.s = me.s + 150;
    const want = strengthAt(150, DEFAULT_RULES.towRange3);
    a.step(1);
    expect(me.drafting).toBe(true);
    expect(me.tow).toBeCloseTo(1 - DT / DEFAULT_RULES.slingshot, 9);
    a.step(200);
    expect(lead.s - me.s).toBeCloseTo(150, 6);
    expect(me.tow).toBeCloseTo(want, 6);
  });

  it('with several mechs ahead, the best-placed one sets the strength', () => {
    const a = new Arena(3, 1, { tow3: 0 });
    const me = a.put(FW0, -250, 0);
    a.put(FW1, -250 + 150, 0); // far: a charge of under a quarter
    a.step(150);
    const far = me.tow;
    expect(far).toBeCloseTo(strengthAt(150, DEFAULT_RULES.towRange3), 3);
    a.put(MF1, me.s - a.base + 30, 3, me.speed); // and someone close, slightly offset
    a.step(100);
    expect(me.tow).toBe(1);
  });
});

describe('the bonus', () => {
  it('towBonus is rules.tow (tow3 on the speed lap) x min(1, 2 x charge)', () => {
    const a = new Arena(2);
    const m = a.mech(FW0);
    const { tow, tow3 } = a.race.rules;
    for (const lapPhase of [1, 2, 3] as const) {
      a.race.lapPhase = lapPhase;
      const full = lapPhase === 3 ? tow3 : tow;
      for (const [charge, share] of [
        [0, 0],
        [0.1, 0.2],
        [0.25, 0.5],
        [0.49, 0.98],
        [0.5, 1],
        [0.75, 1],
        [1, 1],
      ] as const) {
        m.tow = charge;
        expect(towBonus(a.race, m)).toBeCloseTo(full * share, 12);
      }
      // A charge is never negative, but if one ever were the bonus would not
      // turn into a penalty: it is clamped at nothing.
      for (const bad of [-0.01, -0.5, -3]) {
        m.tow = bad;
        expect(towBonus(a.race, m)).toBe(0);
      }
    }
    m.tow = 0;
  });

  it('is at full strength from half charge: after half of towBuild in the tow', () => {
    const { a, me, lead } = pair(2, 25);
    const rules = a.race.rules;
    const half = buildTicks(rules) / 2;
    follow(a, me, lead, 25, half - 1);
    expect(towBonus(a.race, me)).toBeLessThan(rules.tow);
    expect(towBonus(a.race, me)).toBeCloseTo(rules.tow * ((half - 1) / half), 9);
    follow(a, me, lead, 25, 1);
    expect(towBonus(a.race, me)).toBeCloseTo(rules.tow, 12);
    follow(a, me, lead, 25, 60);
    expect(towBonus(a.race, me)).toBe(rules.tow);
  });

  it('the slingshot: full bonus for the first half of the drain, then it fades out', () => {
    for (const lapPhase of [2, 3] as const) {
      const { a, me, lead } = pair(lapPhase, 25);
      const rules = a.race.rules;
      const full = lapPhase === 3 ? rules.tow3 : rules.tow;
      const drain = drainTicks(rules);
      follow(a, me, lead, 25, buildTicks(rules) + 5);
      lead.d = 12; // pull out
      const seen: number[] = [];
      follow(a, me, lead, 25, drain + 10, () => seen.push(towBonus(a.race, me)));
      for (let k = 1; k <= drain / 2; k++) {
        if (seen[k - 1] !== full) throw new Error(`lap ${lapPhase}: bonus ${seen[k - 1]} on tick ${k} of the slingshot`);
      }
      // One tick later it has started to go...
      expect(seen[drain / 2]).toBeLessThan(full);
      // ...in a straight line down to nothing at the end of the drain.
      for (let k = drain / 2 + 1; k <= drain; k++) {
        expect(seen[k - 1]).toBeCloseTo(full * 2 * (1 - k / drain), 9);
      }
      expect(seen[drain - 1]).toBeCloseTo(0, 9);
      expect(seen[drain + 5]).toBe(0);
    }
  });

  it('is applied to the cap: a mech in the tow tops out at the limiter x (1 + rules.tow)', () => {
    for (const lapPhase of [1, 2] as const) {
      const { a, me, lead } = pair(lapPhase, 25);
      const rules = a.race.rules;
      let max = 0;
      follow(a, me, lead, 25, 240, () => (max = Math.max(max, me.speed)));
      expect(max).toBeCloseTo(a.pace * (1 + rules.tow), 9);
      expect(max).toBeLessThanOrEqual(a.pace * (1 + rules.tow) + EPS);
      expect(lead.speed).toBe(a.pace);
      // speedCap is the cap before boost and tow: it has not moved.
      expect(speedCap(a.race, me, CLASSES[me.role])).toBe(a.pace);
    }
  });

  it('on the speed lap it is rules.tow3 on top of the frame\'s own top speed', () => {
    const { a, me, lead } = pair(3, 25);
    const top = CLASSES[me.role].topSpeed;
    let max = 0;
    follow(a, me, lead, 25, 600, () => (max = Math.max(max, me.speed)));
    expect(max).toBeCloseTo(top * (1 + a.race.rules.tow3), 6);
    expect(max).toBeLessThanOrEqual(top * (1 + a.race.rules.tow3) + EPS);
    expect(lead.speed).toBeCloseTo(top, 6);
  });

  it('the speed follows the bonus through the slingshot: held, then eased back to the cap', () => {
    const { a, me, lead } = pair(2, 25);
    const rules = a.race.rules;
    follow(a, me, lead, 25, 240);
    const fast = a.pace * (1 + rules.tow);
    expect(me.speed).toBeCloseTo(fast, 9);
    lead.d = 12;
    const drain = drainTicks(rules);
    const speeds: number[] = [];
    follow(a, me, lead, 25, drain + 30, () => speeds.push(me.speed));
    // Still at full tow speed half way through the drain...
    for (let k = 1; k <= drain / 2; k++) expect(speeds[k - 1]).toBeCloseTo(fast, 9);
    // ...never rising, and back on the bare limiter when the charge is gone.
    for (let k = 1; k < speeds.length; k++) expect(speeds[k]).toBeLessThanOrEqual(speeds[k - 1] + EPS);
    expect(speeds[drain * 0.75]).toBeLessThan(fast - 0.5);
    expect(speeds[drain * 0.75]).toBeGreaterThan(a.pace + 0.5);
    expect(speeds[drain + 20]).toBeCloseTo(a.pace, 9);
  });

  it('the bonus sizes are rules, and zero switches the tow\'s speed off (the charge still builds)', () => {
    const big = pair(2, 25, { rules: { tow: 0.1 } });
    follow(big.a, big.me, big.lead, 25, 300);
    expect(big.me.speed).toBeCloseTo(big.a.pace * 1.1, 6);

    const none = pair(2, 25, { rules: { tow: 0 } });
    none.a.step(200);
    expect(none.me.tow).toBe(1);
    expect(none.me.drafting).toBe(true);
    expect(none.me.speed).toBe(none.a.pace);

    const lap3 = pair(3, 25, { rules: { tow3: 0.2, tow: 0 } });
    let max = 0;
    follow(lap3.a, lap3.me, lap3.lead, 25, 700, () => (max = Math.max(max, lap3.me.speed)));
    expect(max).toBeCloseTo(CLASSES[0].topSpeed * 1.2, 4);
  });

  it('stacks with the pack bonus and the boost, each multiplying the cap', () => {
    const { a, me, lead } = pair(2, 25);
    a.put(MF1, 2500, 20, 0); // a parked leader far ahead: full pack bonus for both
    me.drive = 100;
    a.hold(FW0, BTN.A);
    let max = 0;
    a.step(200, () => {
      lead.s = me.s + 25;
      max = Math.max(max, me.speed);
    });
    const { boostMult, tow } = a.race.rules;
    expect(max).toBeCloseTo(a.pace * (1 + PACK_BONUS) * boostMult * (1 + tow), 6);
  });

  it('does nothing for a mech that is locked on: a fight is carried at its own pace', () => {
    const a = new Arena(2);
    const me = a.put(FW0, -250, 0);
    const lead = a.put(FW1, -225, 0);
    a.tap(FW0, BTN.LOCK);
    a.step(200, () => a.recenter([FW0, FW1]));
    expect(me.mode).toBe(MODE.BATTLE);
    // The charge is there (it is about position, not mode)...
    expect(me.drafting).toBe(true);
    expect(me.tow).toBe(1);
    // ...but in a lock the mech just holds station on its target.
    expect(me.vs).toBeCloseTo(lead.vs, 3);
    expect(lead.s - me.s).toBeCloseTo(25, 1);
  });
});

describe('a slingshot pass', () => {
  it('sit in the tow, pull out, and the held bonus carries the pass', () => {
    // Speed lap, two forwards: identical frames, so without the tow the gap
    // would never change.
    const a = new Arena(3);
    const me = a.put(FW0, -250, 0);
    const lead = a.put(FW1, -250 + 60, 0);
    const top = CLASSES[0].topSpeed;
    // Both wind up to top speed; the follower, in the tow, reels the leader
    // in at up to tow3 x top speed (about 13 u/s) until it is right behind.
    let ticks = 0;
    while (lead.s - me.s > 16 && ticks < 900) {
      a.step(1);
      a.recenter([FW0, FW1]);
      ticks++;
    }
    expect(ticks).toBeGreaterThan(buildTicks(a.race.rules));
    expect(ticks).toBeLessThan(900);
    expect(me.tow).toBe(1);
    expect(lead.speed).toBeCloseTo(top, 6);
    expect(me.speed).toBeCloseTo(top * (1 + a.race.rules.tow3), 6);
    expect(a.events('bump').length).toBe(0);
    // Pull out of line (set by hand: this is about the tow, not the steering).
    me.d = lead.d + DRAFT_WIDTH + 2;
    const drain = drainTicks(a.race.rules);
    let aheadAt = -1;
    a.step(drain, () => {
      a.recenter([FW0, FW1]);
      expect(me.drafting).toBe(false);
      if (aheadAt < 0 && me.s > lead.s) aheadAt = a.race.tick;
    });
    // The charge is spent, and it was enough to get by.
    expect(me.tow).toBeCloseTo(0, 9);
    expect(aheadAt).toBeGreaterThan(0);
    expect(me.s).toBeGreaterThan(lead.s);
    expect(me.place).toBeLessThan(lead.place);
    // Out on its own it is no quicker than the mech it passed. (The one it
    // passed is in line to do the same back: it now has a tow of its own if
    // it tucks in.)
    a.step(60, () => a.recenter([FW0, FW1]));
    expect(me.speed).toBeCloseTo(top, 6);
  });
});

describe('who gets no tow', () => {
  it('a wreck neither gives nor gets one, and loses any charge at once', () => {
    const { a, me, lead } = pair(2, 25);
    follow(a, me, lead, 25, 100);
    expect(me.tow).toBe(1);
    // The follower is knocked out mid-tow.
    retire(a.race, me, null);
    a.step(1);
    expect(me.tow).toBe(0);
    expect(me.drafting).toBe(false);
    a.step(30, () => expect(me.tow).toBe(0));

    // The leader is a wreck: nothing to tuck in behind.
    const b = pair(2, 25);
    retire(b.a.race, b.lead, null);
    b.a.step(40, () => {
      b.lead.s = b.me.s + 25; // keep the wreck right in front
      expect(b.me.drafting).toBe(false);
      expect(b.me.tow).toBe(0);
    });
    expect(b.me.speed).toBe(b.a.pace);
  });

  it('a wreck\'s own charge is wiped even though it was full', () => {
    const { a, me, lead } = pair(2, 25);
    follow(a, me, lead, 25, 100);
    retire(a.race, lead, null); // the tow car goes: the follower's charge just drains
    a.step(1);
    expect(me.drafting).toBe(false);
    expect(me.tow).toBeCloseTo(1 - DT / a.race.rules.slingshot, 9);
    expect(lead.tow).toBe(0);
  });

  it('a finished mech neither gives nor gets one', () => {
    const a = new Arena(3);
    const done = a.put(FW1, L - 30, 0);
    a.until(() => done.finished, 60);
    expect(done.finished).toBe(true);
    a.step(60);
    // A back-marker two laps down comes up behind the finisher on its cool-down lap.
    const racer = a.put(FW0, 0, 0);
    racer.s = done.s - 2 * L - 25;
    racer.lap = Math.floor(racer.s / L);
    done.tow = 0.8; // even if it somehow had one
    a.step(1);
    expect(done.tow).toBe(0);
    a.step(30, () => {
      expect(racer.drafting).toBe(false);
      expect(racer.tow).toBe(0);
      expect(done.drafting).toBe(false);
      expect(done.tow).toBe(0);
    });
    // And the finisher gets nothing from a racer going by ahead of it.
    racer.s = done.s - 2 * L + 25;
    a.step(30, () => {
      expect(done.drafting).toBe(false);
      expect(done.tow).toBe(0);
    });
  });

  it('there is no tow in the countdown', () => {
    const a = new Arena(1);
    // (Arena has run the countdown; a fresh race has not.)
    expect(a.race.mechs.every((m) => m.tow === 0 && !m.drafting)).toBe(true);
  });
});

describe('odd rule values', () => {
  it('towBuild 0 and slingshot 0 are instant (three ticks), not a division by zero', () => {
    const { a, me, lead } = pair(2, 25, { rules: { towBuild: 0, slingshot: 0 } });
    follow(a, me, lead, 25, 1);
    expect(me.tow).toBeCloseTo(1 / 3, 9);
    follow(a, me, lead, 25, 2);
    expect(me.tow).toBe(1);
    lead.d = 12;
    follow(a, me, lead, 25, 1);
    expect(me.tow).toBeCloseTo(2 / 3, 9);
    follow(a, me, lead, 25, 2);
    expect(me.tow).toBeCloseTo(0, 9);
    follow(a, me, lead, 25, 2);
    expect(me.tow).toBe(0);
    expect(Number.isFinite(me.speed + me.s)).toBe(true);
  });

  it('a reach of zero (or less than DRAFT_MIN) leaves a sliver just behind DRAFT_MIN, and no NaN', () => {
    // -50 through the config is clamped to zero; written into a running race
    // (as the tuning panel writes) it is used as it stands. Either way: a sliver.
    for (const [towRange, live] of [
      [0, false],
      [1, false],
      [DRAFT_MIN, false],
      [-50, false],
      [-50, true],
      [0, true],
    ] as const) {
      const set = (p: ReturnType<typeof pair>) => {
        if (live) p.a.race.rules.towRange = towRange;
        else expect(p.a.race.rules.towRange).toBe(Math.max(0, towRange));
        return p;
      };
      const far = set(pair(2, 10, { still: true, rules: live ? {} : { towRange } }));
      far.a.step(20);
      expect(far.me.drafting).toBe(false);
      expect(far.me.tow).toBe(0);
      const close = set(pair(2, DRAFT_MIN + 0.5, { still: true, side: DRAFT_WIDTH - 0.2, rules: live ? {} : { towRange } }));
      close.a.step(20);
      expect(close.me.drafting).toBe(true);
      expect(close.me.tow).toBeGreaterThan(0);
      expect(close.me.tow).toBeLessThanOrEqual(1);
      expect(Number.isFinite(close.me.tow)).toBe(true);
    }
  });

  it('the longest reach the rules allow (and longer, written in live) is everyone ahead in the lane', () => {
    // 300 units is nearly twice the default reach...
    const usual = pair(3, 300, { still: true });
    usual.a.step(80);
    expect(usual.me.drafting).toBe(false);
    expect(usual.me.tow).toBe(0);
    // ...and well inside the longest one a race can be set up with (a
    // million is clamped to that), at full strength inside 40% of it.
    const { a, me, lead } = pair(3, 300, { still: true, rules: { towRange3: 1e6 } });
    expect(a.race.rules.towRange3).toBe(RULE_LIMITS.towRange3[1]);
    expect(RULE_LIMITS.towRange3[1] * 0.4).toBeGreaterThan(300);
    a.step(80);
    expect(lead.s - me.s).toBeCloseTo(300, 6);
    expect(me.drafting).toBe(true);
    expect(me.tow).toBe(1);
    // The same with a million written straight into the running race.
    const live = pair(3, 300, { still: true });
    live.a.race.rules.towRange3 = 1e6;
    live.a.step(80);
    expect(live.me.drafting).toBe(true);
    expect(live.me.tow).toBe(1);
    expect(Number.isFinite(live.me.tow + live.me.speed)).toBe(true);
  });
});

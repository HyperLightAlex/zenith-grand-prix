// The guard swing: guard up, stick to one side, A, and the mech carves a fast
// arc round its target instead of dashing.
import { describe, expect, it } from 'vitest';
import { ACT, ARC_IFRAME_SHARE, ARC_MAX_SPEED, BTN, CLASSES, MODE, hwAt, ticks, wrapAngle, type Rules } from '../src/sim/index';
import { setStagger } from '../src/sim/combat';
import { Arena, FW0, FW1, TRACK } from './helpers';

/** Locked on to a rival `gap` ahead, guard up, Drive to spare. */
function fight(gap = 12, d = 0, rules?: Partial<Rules>) {
  // (No Drive trickling in, so the cost can be read off exactly.)
  const a = new Arena(2, 1, { drivePassive: 0, driveDraft: 0, ...rules });
  const me = a.put(FW0, 0, d);
  const them = a.put(FW1, gap, d);
  a.inputs[FW1].throttle = 1;
  a.tap(FW0, BTN.LOCK);
  expect(me.mode).toBe(MODE.BATTLE);
  me.drive = 60;
  a.hold(FW0, BTN.GUARD).step(2);
  expect(me.guarding).toBe(true);
  return { a, me, them };
}

/** Where `m` is seen from `t`: the angle in (s, d), and how far. */
function from(t: { s: number; d: number }, m: { s: number; d: number }) {
  return { ang: Math.atan2(m.d - t.d, m.s - t.s), dist: Math.hypot(m.s - t.s, m.d - t.d) };
}

/** Run the swing out, adding up how far round the target it went (signed) and how far the distance strayed. */
function swing(a: Arena, me: { act: number; s: number; d: number }, them: { s: number; d: number }, before: { ang: number; dist: number }) {
  let prev = before;
  const start = before.dist;
  let turned = 0;
  let stray = 0;
  let fastest = 0;
  a.until(() => {
    const now = from(them, me);
    const step = wrapAngle(now.ang - prev.ang);
    turned += step;
    fastest = Math.max(fastest, Math.abs(step) * now.dist * 60);
    stray = Math.max(stray, Math.abs(now.dist - start));
    prev = now;
    return me.act !== ACT.DASH;
  }, 90);
  return { turned, stray, fastest, end: prev };
}

describe('the guard swing', () => {
  it('guard up, stick right, A: half a circle round the target, clockwise seen from above, at the same distance', () => {
    const { a, me, them } = fight(12);
    const before = from(them, me);
    const drive = me.drive;
    a.inputs[FW0].mx = 1;
    const t0 = a.tap(FW0, BTN.A);
    expect(a.events('arc')).toEqual([{ type: 'arc', mech: FW0, dir: 1, tick: t0 }]);
    expect(a.events('dash')).toEqual([]);
    expect(me.drive).toBe(drive - CLASSES[me.role].dashCost);
    expect(me.guarding).toBe(false);
    const dur = ticks(a.race.rules.arcSecs);
    expect(me.iframes).toBe(Math.round(dur * ARC_IFRAME_SHARE));
    const { turned, stray, end } = swing(a, me, them, before);
    expect(turned).toBeCloseTo(-Math.PI, 1);
    expect(Math.abs(end.dist - before.dist)).toBeLessThan(1.5);
    expect(stray).toBeLessThan(1.5);
    // It ends where it should, moving with the fight, not flung on round the circle.
    expect(me.arcDir).toBe(0);
    expect(Math.abs(me.vs - them.vs)).toBeLessThan(15);
  });

  it('stick left: the other way round', () => {
    const { a, me, them } = fight(12);
    const before = from(them, me);
    a.inputs[FW0].mx = -1;
    a.tap(FW0, BTN.A);
    expect(a.events('arc').map((e) => e.dir)).toEqual([-1]);
    expect(swing(a, me, them, before).turned).toBeCloseTo(Math.PI, 1);
  });

  it('without the guard up, A is the ordinary dash, sideways or not', () => {
    const { a, me } = fight(12);
    a.release(FW0, BTN.GUARD).step(1);
    a.inputs[FW0].mx = 1;
    a.tap(FW0, BTN.A);
    expect(a.events('arc')).toEqual([]);
    expect(a.events('dash')).toHaveLength(1);
    expect(me.arcDir).toBe(0);
  });

  it('guard up but the stick back (or centred): the ordinary hop back', () => {
    for (const [mx, my] of [
      [0, -1],
      [0, 0],
      [0.3, -0.9],
    ]) {
      const { a } = fight(12);
      a.inputs[FW0].mx = mx;
      a.inputs[FW0].my = my;
      a.tap(FW0, BTN.A);
      expect(a.events('arc')).toEqual([]);
      expect(a.events('dash')).toHaveLength(1);
    }
  });

  it(`from further out it goes less far round: never quicker round the circle than ARC_MAX_SPEED`, () => {
    const { a, me, them } = fight(40);
    const before = from(them, me);
    a.inputs[FW0].mx = 1;
    a.tap(FW0, BTN.A);
    const { turned, fastest } = swing(a, me, them, before);
    expect(-turned).toBeLessThan(Math.PI * 0.5);
    expect(-turned).toBeGreaterThan(Math.PI * 0.2);
    expect(fastest).toBeLessThan(ARC_MAX_SPEED * 1.1);
  });

  it('a blow in the middle of it ends it there', () => {
    const { a, me } = fight(12);
    a.inputs[FW0].mx = 1;
    a.tap(FW0, BTN.A);
    a.step(3);
    setStagger(me, 20);
    expect(me.act).toBe(ACT.STAGGER);
    expect(me.arcDir).toBe(0);
    a.step(1);
    expect(me.act).toBe(ACT.STAGGER);
  });

  it('stays on the road beside the barrier', () => {
    const hw = hwAt(TRACK, 0);
    const { a, me } = fight(10, hw - 6);
    const limit = hw - CLASSES[me.role].radius;
    a.inputs[FW0].mx = -1;
    a.tap(FW0, BTN.A);
    a.until(() => {
      expect(Math.abs(me.d)).toBeLessThanOrEqual(limit + 1e-6);
      return me.act !== ACT.DASH;
    }, 60);
  });

  it('rules.arcAngle 0 turns it off: guard + A to the side is a dash again', () => {
    const { a } = fight(12, 0, { arcAngle: 0 });
    a.inputs[FW0].mx = 1;
    a.tap(FW0, BTN.A);
    expect(a.events('arc')).toEqual([]);
    expect(a.events('dash')).toHaveLength(1);
  });
});

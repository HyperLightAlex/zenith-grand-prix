// The hangar's stat bars come from the frames' own numbers.
import { describe, expect, it } from 'vitest';
import { CLASSES, ROLE } from '../src/sim/index';
import { STAT_LABELS, combatRange, frameStats, hittingPower, primaryDps } from '../src/client/ui/frameStats';

const [FW, MF, DF] = [CLASSES[ROLE.FW], CLASSES[ROLE.MF], CLASSES[ROLE.DF]];

describe('frame stats', () => {
  it('five bars, each between 0 and 1, the strongest frame full in hitting power and combat range', () => {
    expect(STAT_LABELS).toEqual(['Top speed', 'Armour', 'Handling', 'Hitting power', 'Combat range']);
    for (const c of CLASSES) {
      const s = frameStats(c, CLASSES);
      expect(s).toHaveLength(5);
      for (const v of s) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(Math.max(...CLASSES.map((c) => frameStats(c, CLASSES)[3]))).toBeCloseTo(1, 9);
    expect(Math.max(...CLASSES.map((c) => frameStats(c, CLASSES)[4]))).toBeCloseTo(1, 9);
  });

  it('attack speed counts: the carbine fires a burst of three 8s every 27 ticks', () => {
    expect(primaryDps(MF)).toBeCloseTo((3 * 8) / (27 / 60), 6);
    // The blade string, cancelled as early as it can be: 82 in a second.
    expect(primaryDps(FW)).toBeCloseTo(82, 6);
  });

  it('the defender hits hardest (its guard breaks), the forward next, the midfielder least', () => {
    expect(hittingPower(DF)).toBeGreaterThan(hittingPower(FW));
    expect(hittingPower(FW)).toBeGreaterThan(hittingPower(MF));
  });

  it('the midfielder has the longest reach by far: its carbine', () => {
    expect(combatRange(MF)).toBe(62);
    expect(combatRange(MF)).toBeGreaterThan(2 * combatRange(DF));
    expect(combatRange(FW)).toBeGreaterThan(15); // the Lance Dash's lunge
  });
});

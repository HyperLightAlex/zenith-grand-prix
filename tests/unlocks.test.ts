// What the Grand Prix earns for your mech (client/game/unlocks.ts): patterns,
// finishes, a wear and victory poses, each opened by a medal (this good or
// better, at any difficulty) or a Zenith Cup; the rest open from the start.

import { describe, expect, it } from 'vitest';
import { FINISHES, PATTERNS, WEARS } from '../src/custom/mechBuild';
import { VICTORY_IDS } from '../src/client/render/mech/victoryPoses';
import { UNLOCKS, earned, howTo, lockedWhy, newlyEarned, openOf, unlockName, type Progress } from '../src/client/game/unlocks';

const none: Progress = { byCup: {}, season: {} };

describe('the Grand Prix rewards', () => {
  it('name things that exist, once each', () => {
    const lists = { pattern: PATTERNS, finish: FINISHES, wear: WEARS, pose: VICTORY_IDS } as const;
    for (const u of UNLOCKS) expect((lists[u.kind] as readonly string[]).includes(u.id), `${u.kind} ${u.id}`).toBe(true);
    expect(new Set(UNLOCKS.map((u) => `${u.kind}:${u.id}`)).size).toBe(UNLOCKS.length);
    for (const u of UNLOCKS) {
      expect(unlockName(u)).toMatch(/\((pattern|finish|wear|victory pose)\)$/);
      expect(howTo(u).length).toBeGreaterThan(10);
    }
  });

  it('leave something of each kind open from the start, and the plain choices always', () => {
    expect(openOf('pattern', PATTERNS, none)).toEqual(['none', 'stripes']);
    expect(openOf('finish', FINISHES, none)).toEqual(['satin', 'matte']);
    expect(openOf('wear', WEARS, none)).toEqual(['race', 'clean']);
    expect(openOf('pose', VICTORY_IDS, none)).toEqual(['fist', 'arms', 'crossed']);
    expect(lockedWhy('pattern', 'chevrons', none)).toBe('A bronze or better in the Horizon Cup');
    expect(lockedWhy('pattern', 'stripes', none)).toBeNull();
  });

  it('open with a medal this good or better, at any difficulty', () => {
    const bronze: Progress = { byCup: { horizon: { 0: 'bronze' } }, season: {} };
    expect(lockedWhy('pattern', 'chevrons', bronze)).toBeNull();
    expect(lockedWhy('finish', 'gloss', bronze)).toBe('A silver or better in the Horizon Cup');
    const gold: Progress = { byCup: { horizon: { 0: 'bronze', 2: 'gold' } }, season: {} };
    expect(openOf('pose', VICTORY_IDS, gold)).toContain('point');
    expect(lockedWhy('finish', 'gloss', gold)).toBeNull();
    // Another cup's medal opens nothing of this one's.
    expect(lockedWhy('pattern', 'checks', gold)).not.toBeNull();
    const tour: Progress = { byCup: { tour: { 1: 'silver' } }, season: {} };
    expect(lockedWhy('pattern', 'digital', tour)).toBeNull();
    expect(lockedWhy('pose', 'bow', tour)).toBe('Gold in the Grand Tour');
    const cup: Progress = { byCup: {}, season: { 1: 1 } };
    expect(openOf('wear', WEARS, cup)).toEqual(['race', 'clean', 'veteran']);
    expect(earned(UNLOCKS.find((u) => u.id === 'hips')!, cup)).toBe(true);
  });

  it('say what an award has just opened', () => {
    const before: Progress = { byCup: { horizon: { 1: 'bronze' } }, season: {} };
    const after: Progress = { byCup: { horizon: { 1: 'gold' } }, season: {} };
    expect(newlyEarned(before, after).map((u) => u.id)).toEqual(['gloss', 'point']);
    expect(newlyEarned(after, after)).toEqual([]);
    // Everything, won: nothing left locked.
    const all: Progress = { byCup: { horizon: { 0: 'gold' }, frontier: { 0: 'gold' }, ascent: { 0: 'gold' }, tour: { 0: 'gold' } }, season: { 0: 1 } };
    expect(newlyEarned(none, all)).toHaveLength(UNLOCKS.length);
  });
});

// What the Grand Prix earns for your mech (client/game/unlocks.ts): patterns,
// finishes, a wear and victory poses, each opened by a medal (this good or
// better, at any difficulty) or a Zenith Cup; the rest open from the start.

import { describe, expect, it } from 'vitest';
import { FINISHES, PAINTS, PATTERNS, WEARS } from '../src/custom/mechBuild';
import { VICTORY_IDS } from '../src/client/render/mech/victoryPoses';
import { UNLOCKS, earned, howTo, lockedWhy, newlyEarned, openOf, paintOpen, sprintUnlock, unlockName, type Progress } from '../src/client/game/unlocks';

const none: Progress = { byCup: {}, season: {} };

describe('the Grand Prix rewards', () => {
  it('name things that exist, once each', () => {
    const lists = { pattern: PATTERNS, finish: FINISHES, wear: WEARS, pose: VICTORY_IDS, paint: PAINTS.map((p) => p.name) } as const;
    for (const u of UNLOCKS) expect((lists[u.kind] as readonly string[]).includes(u.id), `${u.kind} ${u.id}`).toBe(true);
    expect(new Set(UNLOCKS.map((u) => `${u.kind}:${u.id}`)).size).toBe(UNLOCKS.length);
    for (const u of UNLOCKS) {
      expect(unlockName(u)).toMatch(/\((pattern|finish|wear|victory pose|paint)\)$/);
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
    const all: Progress = { byCup: { horizon: { 0: 'gold' }, frontier: { 0: 'gold' }, ascent: { 0: 'gold' }, tour: { 0: 'gold' } }, season: { 0: 1 }, sprint: { horizon: { 0: 'gold' }, frontier: { 0: 'gold' }, ascent: { 0: 'gold' }, tour: { 0: 'gold' } } };
    expect(newlyEarned(none, all)).toHaveLength(UNLOCKS.length);
  });
});

describe('the Sprint ladder rewards', () => {
  it('thirteen of their own: patterns, finishes, paints and poses, a medal slot each (two at the Sprint Tour gold)', () => {
    const sprint = UNLOCKS.filter(sprintUnlock);
    expect(sprint).toHaveLength(13);
    expect(new Set(sprint.map((u) => u.kind))).toEqual(new Set(['pattern', 'finish', 'paint', 'pose']));
    // Every Sprint Cup and the Sprint Tour gives something at each medal.
    for (const cup of ['horizon', 'frontier', 'ascent', 'tour']) {
      for (const medal of ['bronze', 'silver', 'gold']) expect(sprint.some((u) => 'cup' in u.need && u.need.cup === cup && u.need.medal === medal), `${cup} ${medal}`).toBe(true);
    }
    expect(lockedWhy('pattern', 'flames', none)).toBe('A bronze or better in the Horizon Sprint Cup');
    expect(lockedWhy('pose', 'champion', none)).toBe('Gold in the Sprint Tour');
  });

  it('open only with Sprint medals: the team series opens none of them, nor the Sprint series the team ones', () => {
    const team: Progress = { byCup: { horizon: { 2: 'gold' }, frontier: { 2: 'gold' }, ascent: { 2: 'gold' }, tour: { 2: 'gold' } }, season: { 2: 3 } };
    for (const u of UNLOCKS) expect(earned(u, team)).toBe(!sprintUnlock(u));
    const sprint: Progress = { byCup: {}, season: {}, sprint: { horizon: { 0: 'silver' } } };
    expect(lockedWhy('pattern', 'flames', sprint)).toBeNull();
    expect(lockedWhy('paint', 'Electric Blue', sprint)).toBeNull();
    expect(lockedWhy('pose', 'clap', sprint)).toBe('Gold in the Sprint Horizon Cup'.replace('Sprint Horizon', 'Horizon Sprint'));
    expect(lockedWhy('pattern', 'chevrons', sprint)).not.toBeNull();
    expect(newlyEarned(none, sprint).map((u) => u.id)).toEqual(['flames', 'Electric Blue']);
  });

  it('lock the earned paints and only those, wherever a paint is chosen', () => {
    const locked = PAINTS.map((_, i) => i).filter((i) => !paintOpen(i, none));
    expect(locked.map((i) => PAINTS[i].name)).toEqual(['Electric Blue', 'Hot Pink', 'Acid Green', 'Champion Gold']);
    // The factions' paints (the first fifteen) are always open.
    for (let i = 0; i < 15; i++) expect(paintOpen(i, none)).toBe(true);
    const all: Progress = { byCup: {}, season: {}, sprint: { horizon: { 0: 'gold' }, frontier: { 0: 'gold' }, ascent: { 0: 'gold' }, tour: { 0: 'gold' } } };
    expect(PAINTS.every((_, i) => paintOpen(i, all))).toBe(true);
  });
});

// The frame primers (client/game/primers.ts): what they quote is the game's
// own scoring, and the first-race tip shows once on the grid, holds the race
// until it has been read, and words itself for every device.

import { describe, expect, it } from 'vitest';
import { AEGIS_SAVED, AWARD_NAMES, AWARD_POINTS, DEFAULT_RULES, PHASE, ROLE, createRace, emptyInput, stepRace, type Role } from '../src/sim/index';
import { FrameTip, PRIMERS } from '../src/client/game/primers';
import { CARD_MIN } from '../src/client/game/tutorial';
import { KEYS } from '../src/client/ui/keyNames';
import { keyLabel } from '../src/client/ui/tutorialPanel';
import { MF0, TRACK, makeSeats } from './helpers';

describe('the frame primers', () => {
  it('quote the awards as the game scores them', () => {
    for (const role of [ROLE.MF, ROLE.DF] as Role[]) {
      const p = PRIMERS[role];
      expect(p.awards.length).toBeGreaterThan(3);
      for (const [what, pts] of p.awards) {
        const name = what.split(':')[0];
        const i = AWARD_NAMES.indexOf(name as (typeof AWARD_NAMES)[number]);
        expect(i, name).toBeGreaterThanOrEqual(0);
        expect(Number(pts), name).toBe(AWARD_POINTS[i]);
      }
      expect(p.scoreNote).toContain(`up to ${DEFAULT_RULES.supportCap} a race`);
    }
    const all = JSON.stringify(PRIMERS);
    expect(all).toContain(`every ${DEFAULT_RULES.backupDamage} damage`);
    expect(all).toContain(`every ${DEFAULT_RULES.pressureDamage} damage`);
    expect(all).toContain(`${AEGIS_SAVED} damage or more`);
    expect(all).toContain(`the ${DEFAULT_RULES.assistSecs} s before`);
    // The Forward earns no support points.
    expect(PRIMERS[ROLE.FW].awards).toEqual([]);
  });

  it('tip a first Midfielder race once, on the grid, until read', () => {
    const race = createRace(TRACK, { seed: 2, seats: makeSeats([MF0]) });
    let seen = 0;
    const tip = new FrameTip(ROLE.MF, () => seen++);
    const inputs = race.mechs.map((m) => (m.human ? emptyInput() : null));
    while (!tip.card && race.tick < 200) {
      stepRace(race, TRACK, inputs);
      tip.update(race, race.events, 1 / 60);
    }
    expect(tip.card).toBe('frame');
    expect(race.phase).toBe(PHASE.COUNTDOWN);
    expect(seen).toBe(1);
    expect(tip.dismiss()).toBe(false);
    tip.held(CARD_MIN);
    expect(tip.dismiss()).toBe(true);
    expect(tip.over).toBe(true);
    expect(tip.goalView(race, 'pad')).toBeNull();
    for (let i = 0; i < 400; i++) {
      stepRace(race, TRACK, inputs);
      tip.update(race, race.events, 1 / 60);
    }
    expect(tip.card).toBeNull();
    expect(seen).toBe(1);
  });

  it('gives up if the grid has gone by', () => {
    const race = createRace(TRACK, { seed: 2, seats: makeSeats([MF0]) });
    const inputs = race.mechs.map((m) => (m.human ? emptyInput() : null));
    while (race.phase === PHASE.COUNTDOWN) stepRace(race, TRACK, inputs);
    const tip = new FrameTip(ROLE.DF);
    tip.update(race, [], 1 / 60);
    expect(tip.over).toBe(true);
    expect(tip.card).toBeNull();
  });

  it('words its tips for every device, every mark a control that device has', () => {
    for (const role of [ROLE.MF, ROLE.DF] as Role[]) {
      const tip = new FrameTip(role);
      tip.card = 'frame';
      const race = createRace(TRACK, { seed: 1, seats: makeSeats([MF0]) });
      for (const device of ['pad', 'keys', 'touch'] as const) {
        const c = tip.cardText(race, device)!;
        expect(c.lines.length).toBe(3);
        for (const line of c.lines) {
          for (const [, name] of line.matchAll(/\[([^\]]+)\]/g)) {
            if (name in KEYS[device]) expect(keyLabel(device, name), `${device}: [${name}]`).not.toBe(name);
            else expect(name, `${device}: [${name}]`).toMatch(/^[A-Z]/);
          }
        }
      }
    }
  });
});

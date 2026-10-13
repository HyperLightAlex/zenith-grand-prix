// Support points: what each action pays, the per-rival cooldown, the cap,
// and that they count for the team.
import { describe, expect, it } from 'vitest';
import { AEGIS_SAVED, ATK, AWARD, AWARD_POINTS, BODYGUARD_RANGE, LEADOUT_TICKS, MODE, TICK_RATE, teamPoints, type MechState } from '../src/sim/index';
import { award, onHit, onKnockout, onPass, onRingout, onSnare, type HitFacts } from '../src/sim/awards';
import { retire } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK } from './helpers';

/** A blow by `att` on `victim`, which was fighting `victimTarget` (or not fighting at all). */
function facts(over: Partial<HitFacts> = {}): HitFacts {
  return { attack: ATK.DF_HAMMER1, damage: 30, blocked: false, broke: false, inWindup: false, victimTarget: -1, victimMode: MODE.SPEED, prevented: 0, ...over };
}

function awards(a: Arena, mech?: number) {
  return a.events('award').filter((e) => mech === undefined || e.mech === mech);
}

/** Events land in race.events, which the arena only logs when it steps: run a hook, then log what it pushed. */
function hook(a: Arena, fn: () => void): void {
  a.race.events.length = 0;
  fn();
  for (const e of a.race.events) a.log.push({ ...e, tick: a.race.tick });
  a.race.events.length = 0;
}

describe('award()', () => {
  it('adds to the pilot, the action and the team, with an event', () => {
    const a = new Arena(2);
    const df = a.mech(DF0);
    const before = teamPoints(a.race, 0);
    hook(a, () => award(a.race, df, AWARD.PEEL, FW1));
    expect(df.support).toBe(AWARD_POINTS[AWARD.PEEL]);
    expect(df.awardPts[AWARD.PEEL]).toBe(AWARD_POINTS[AWARD.PEEL]);
    expect(teamPoints(a.race, 0)).toBe(before + AWARD_POINTS[AWARD.PEEL]);
    expect(awards(a)).toEqual([expect.objectContaining({ mech: DF0, kind: AWARD.PEEL, points: 1, victim: FW1 })]);
  });

  it('the same action on the same rival scores once every rules.awardCooldown seconds; another rival is a fresh one', () => {
    const a = new Arena(2);
    const df = a.mech(DF0);
    expect(award(a.race, df, AWARD.PEEL, FW1)).toBe(1);
    expect(award(a.race, df, AWARD.PEEL, FW1)).toBe(0);
    expect(award(a.race, df, AWARD.PEEL, MF1)).toBe(1);
    // A different action on the same rival is not held back either.
    expect(award(a.race, df, AWARD.SAVE, FW1)).toBe(2);
    a.step(a.race.rules.awardCooldown * TICK_RATE - 1);
    expect(award(a.race, df, AWARD.PEEL, FW1)).toBe(0);
    a.step(1);
    expect(award(a.race, df, AWARD.PEEL, FW1)).toBe(1);
  });

  it('stops at rules.supportCap for the race, cutting the last award short', () => {
    const a = new Arena(2, 1, { supportCap: 5 });
    const df = a.mech(DF0);
    for (const v of [FW1, MF1]) award(a.race, df, AWARD.SAVE, v); // 4
    hook(a, () => expect(award(a.race, df, AWARD.SAVE, DF1)).toBe(1));
    expect(df.support).toBe(5);
    expect(awards(a).map((e) => e.points)).toEqual([1]);
    hook(a, () => expect(award(a.race, df, AWARD.PEEL, -1, 1, false)).toBe(0));
    expect(awards(a)).toHaveLength(1);
    // supportCap 0 turns support points off altogether.
    const b = new Arena(2, 1, { supportCap: 0 });
    expect(award(b.race, b.mech(DF0), AWARD.SAVE, FW1)).toBe(0);
  });

  it('a wreck earns nothing more, and keeps what it had', () => {
    const a = new Arena(2);
    const df = a.mech(DF0);
    award(a.race, df, AWARD.SAVE, FW1);
    retire(a.race, df, null);
    expect(award(a.race, df, AWARD.PEEL, MF1)).toBe(0);
    expect(df.support).toBe(2);
  });
});

describe('the Bulwark', () => {
  /** A defender, its forward, and a rival fighting that forward. */
  function scene() {
    const a = new Arena(2);
    const df = a.put(DF0, 0, 0);
    const fw = a.put(FW0, 10, 0);
    const rival = a.put(MF1, 14, 4);
    return { a, df, fw, rival, onFw: { victimTarget: FW0, victimMode: MODE.BATTLE } };
  }

  it('Peel: a blow on a rival fighting your forward', () => {
    const { a, df, rival, onFw } = scene();
    hook(a, () => onHit(a.race, TRACK, df, rival, facts(onFw)));
    expect(awards(a, DF0)).toEqual([expect.objectContaining({ kind: AWARD.PEEL, points: 1, victim: MF1 })]);
  });

  it('Save: the same blow breaking its attack is worth 2 instead', () => {
    const { a, df, rival, onFw } = scene();
    hook(a, () => onHit(a.race, TRACK, df, rival, facts({ ...onFw, broke: true })));
    expect(awards(a, DF0)).toEqual([expect.objectContaining({ kind: AWARD.SAVE, points: 2 })]);
  });

  it('nothing for hitting a rival that is not on your forward, or for a blow it blocks', () => {
    const { a, df, rival, onFw } = scene();
    hook(a, () => onHit(a.race, TRACK, df, rival, facts()));
    hook(a, () => onHit(a.race, TRACK, df, rival, facts({ victimTarget: MF0, victimMode: MODE.BATTLE })));
    hook(a, () => onHit(a.race, TRACK, df, rival, facts({ ...onFw, blocked: true })));
    expect(awards(a, DF0)).toEqual([]);
  });

  it(`Bodyguard: a blow taken on the guard within ${BODYGUARD_RANGE} of your forward`, () => {
    const { a, df, rival } = scene();
    hook(a, () => onHit(a.race, TRACK, rival, df, facts({ attack: ATK.MF_KICK, blocked: true })));
    expect(awards(a, DF0)).toEqual([expect.objectContaining({ kind: AWARD.BODYGUARD, points: 1, victim: MF1 })]);
    // Far from the forward, the same block earns nothing.
    const b = new Arena(2);
    const df2 = b.put(DF0, 0, 0);
    b.put(FW0, BODYGUARD_RANGE + 40, 0);
    const r2 = b.put(MF1, 4, 4);
    hook(b, () => onHit(b.race, TRACK, r2, df2, facts({ attack: ATK.MF_KICK, blocked: true })));
    expect(awards(b, DF0)).toEqual([]);
  });

  it(`Aegis: once its shield has kept ${AEGIS_SAVED} damage off the team, it pays its caster 2, once`, () => {
    const { a, df, fw, rival } = scene();
    fw.shieldBy = DF0;
    df.aegisSaved = 0;
    df.aegisPaid = false;
    hook(a, () => onHit(a.race, TRACK, rival, fw, facts({ attack: ATK.MF_KICK, damage: 10, prevented: AEGIS_SAVED - 1 })));
    expect(awards(a, DF0)).toEqual([]);
    hook(a, () => onHit(a.race, TRACK, rival, fw, facts({ attack: ATK.MF_KICK, damage: 10, prevented: 5 })));
    hook(a, () => onHit(a.race, TRACK, rival, fw, facts({ attack: ATK.MF_KICK, damage: 10, prevented: 500 })));
    expect(awards(a, DF0)).toEqual([expect.objectContaining({ kind: AWARD.AEGIS, points: 2 })]);
  });

  it('Ring-out: 2 for the rival forward, 1 for anyone else; only a defender earns it', () => {
    const a = new Arena(2);
    hook(a, () => {
      onRingout(a.race, a.mech(DF0), a.mech(FW1));
      onRingout(a.race, a.mech(DF0), a.mech(MF1));
      onRingout(a.race, a.mech(MF0), a.mech(DF1));
      onRingout(a.race, a.mech(DF0), a.mech(MF0)); // a teammate
    });
    expect(awards(a).map((e) => [e.mech, e.kind, e.points])).toEqual([
      [DF0, AWARD.RINGOUT, 2],
      [DF0, AWARD.RINGOUT, 1],
    ]);
  });
});

describe('the Vector', () => {
  it('Snare: 2 on the rival forward, 1 on anyone else', () => {
    const a = new Arena(2);
    hook(a, () => {
      onSnare(a.race, a.mech(MF0), a.mech(FW1));
      onSnare(a.race, a.mech(MF0), a.mech(DF1));
    });
    expect(awards(a, MF0).map((e) => [e.kind, e.points])).toEqual([
      [AWARD.SNARE, 2],
      [AWARD.SNARE, 1],
    ]);
  });

  it('Interrupt: a Disruptor or Stun Kick that breaks a blow still winding up', () => {
    const a = new Arena(2);
    const mf = a.mech(MF0);
    const v = a.mech(DF1);
    hook(a, () => onHit(a.race, TRACK, mf, v, facts({ attack: ATK.MF_KICK, broke: true, inWindup: true })));
    hook(a, () => onHit(a.race, TRACK, mf, a.mech(MF1), facts({ attack: ATK.MF_PULSE, broke: true, inWindup: true })));
    // Breaking a blow already swinging, or with the carbine, is not an interrupt.
    hook(a, () => onHit(a.race, TRACK, mf, a.mech(FW1), facts({ attack: ATK.MF_KICK, broke: true, inWindup: false })));
    hook(a, () => onHit(a.race, TRACK, mf, a.mech(FW1), facts({ attack: ATK.MF_BURST, broke: true, inWindup: true })));
    expect(awards(a, MF0).filter((e) => e.kind === AWARD.INTERRUPT).map((e) => e.victim)).toEqual([DF1, MF1]);
  });

  it('Back-up: 1 for every rules.backupDamage dealt to rivals fighting a teammate', () => {
    const a = new Arena(2);
    const mf = a.mech(MF0);
    const v = a.mech(DF1);
    const need = a.race.rules.backupDamage;
    const blow = (damage: number) => hook(a, () => onHit(a.race, TRACK, mf, v, facts({ attack: ATK.MF_BURST, damage, victimTarget: FW0, victimMode: MODE.BATTLE })));
    blow(need * 0.6);
    expect(mf.support).toBe(0);
    blow(need * 0.6);
    expect(mf.support).toBe(1);
    blow(need * 2);
    expect(mf.support).toBe(3);
    // Fighting the Vector itself, the same damage is not back-up.
    const before = mf.support;
    hook(a, () => onHit(a.race, TRACK, mf, v, facts({ attack: ATK.MF_BURST, damage: need * 3, victimTarget: MF0, victimMode: MODE.BATTLE })));
    expect(mf.support).toBe(before);
  });

  it('Pressure: 1 for every rules.pressureDamage dealt to the rival forward', () => {
    const a = new Arena(2);
    const mf = a.mech(MF0);
    const need = a.race.rules.pressureDamage;
    hook(a, () => onHit(a.race, TRACK, mf, a.mech(FW1), facts({ attack: ATK.MF_BURST, damage: need * 2.5 })));
    expect(awards(a, MF0).map((e) => e.kind)).toEqual([AWARD.PRESSURE, AWARD.PRESSURE]);
    // The rival defender is not the forward.
    hook(a, () => onHit(a.race, TRACK, mf, a.mech(DF1), facts({ attack: ATK.MF_BURST, damage: need * 3 })));
    expect(awards(a, MF0)).toHaveLength(2);
  });
});

describe('anyone', () => {
  it(`Assist: 2 to each teammate of the one who scored a knockout that hurt the victim in the last rules.assistSecs`, () => {
    const a = new Arena(2);
    const victim = a.mech(FW1);
    hook(a, () => onHit(a.race, TRACK, a.mech(MF0), victim, facts({ attack: ATK.MF_BURST, damage: 20 })));
    a.step(a.race.rules.assistSecs * TICK_RATE - 1);
    hook(a, () => onHit(a.race, TRACK, a.mech(DF0), victim, facts({ damage: 20 })));
    a.step(2);
    // MF0's hit is now just out of the window; DF0's is in it. FW0 lands the knockout and gets no assist for it.
    hook(a, () => onKnockout(a.race, victim, a.mech(FW0)));
    expect(awards(a).filter((e) => e.kind === AWARD.ASSIST).map((e) => [e.mech, e.points, e.victim])).toEqual([[DF0, 2, FW1]]);
  });

  it('no assists for a knockout nobody is credited with', () => {
    const a = new Arena(2);
    const victim = a.mech(FW1);
    hook(a, () => onHit(a.race, TRACK, a.mech(MF0), victim, facts({ attack: ATK.MF_BURST, damage: 20 })));
    hook(a, () => onKnockout(a.race, victim, null));
    expect(awards(a)).toEqual([]);
  });

  it(`Lead-out: on lap 3, a support whose tow your forward has just left gets 2 when it passes a rival`, () => {
    const a = new Arena(3);
    const fw = a.mech(FW0);
    const tow = (by: MechState, ago: number) => {
      fw.towBy = by.id;
      fw.towByTick = a.race.tick - ago;
    };
    tow(a.mech(MF0), 10);
    hook(a, () => onPass(a.race, fw, a.mech(DF1)));
    expect(awards(a)).toEqual([expect.objectContaining({ mech: MF0, kind: AWARD.LEADOUT, points: 2, victim: DF1 })]);
    // Too long out of the tow, a rival's tow, or not the speed lap: nothing.
    tow(a.mech(DF0), LEADOUT_TICKS + 1);
    hook(a, () => onPass(a.race, fw, a.mech(MF1)));
    tow(a.mech(FW1), 10);
    hook(a, () => onPass(a.race, fw, a.mech(MF1)));
    expect(awards(a)).toHaveLength(1);
    const b = new Arena(2);
    b.mech(FW0).towBy = MF0;
    b.mech(FW0).towByTick = b.race.tick;
    hook(b, () => onPass(b.race, b.mech(FW0), b.mech(DF1)));
    expect(awards(b)).toEqual([]);
  });
});

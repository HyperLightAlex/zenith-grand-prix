// Momentum strikes, ring-outs and how the lock picks its target.
import { describe, expect, it } from 'vitest';
import {
  ACT,
  ATK,
  ATTACKS,
  BTN,
  CLASSES,
  DRIVE_PER_DAMAGE_DEALT,
  MODE,
  MOMENTUM_STAGGER,
  MOMENTUM_TOW,
  RINGOUT_DRIVE,
  RINGOUT_STAGGER,
  TICK_RATE,
  WALL_SPLAT_DAMAGE,
  type Rules,
} from '../src/sim/index';
import { applyHit, setStagger } from '../src/sim/combat';
import { LOCK_BEHIND, pickTarget } from '../src/sim/core';
import { Arena, DF1, FW0, FW1, MF0, MF1, TRACK, wallLimit } from './helpers';

/** The test arena keeps momentum off; these tests want the real rule. */
const ON: Partial<Rules> = { momentumSecs: 0.75 };
const window = Math.round(0.75 * TICK_RATE);

function arena(rules: Partial<Rules> = {}, lapPhase: 1 | 2 | 3 = 2): Arena {
  const a = new Arena(lapPhase, 1, { ...ON, ...rules });
  for (const m of a.race.mechs) m.drive = 100;
  return a;
}

describe('momentum', () => {
  it('a boost primes the next attack, and it lingers for rules.momentumSecs after', () => {
    const a = arena({ tow: 0 });
    const me = a.put(FW0, 300, 0);
    a.hold(FW0, BTN.A).step(10);
    expect(me.boosting).toBe(true);
    expect(me.momentum).toBe(window);
    a.release(FW0, BTN.A).step(1);
    expect(me.boosting).toBe(false);
    expect(me.momentum).toBe(window - 1);
    a.step(window - 2);
    expect(me.momentum).toBe(1);
    a.step(1);
    expect(me.momentum).toBe(0);
  });

  it('so do an Overdrive and a charged slipstream', () => {
    const a = arena();
    const me = a.put(FW0, 300, 0);
    me.overdriveT = 60;
    a.step(1);
    expect(me.momentum).toBe(window);

    const b = arena();
    const tucked = b.put(FW0, 300, 0);
    b.put(MF1, 320, 0); // twenty units ahead, dead in line
    const n = b.until(() => tucked.momentum > 0, 120);
    expect(n).toBeGreaterThan(0);
    // It arrives as the tow reaches half charge, where its bonus is at full strength.
    expect(tucked.tow).toBeGreaterThanOrEqual(MOMENTUM_TOW - 1e-9);
    expect(tucked.tow).toBeLessThan(MOMENTUM_TOW + 0.05);
  });

  it('battle mode spends it but never builds it, even sitting in a slipstream', () => {
    const a = arena();
    const me = a.put(FW0, 300, 0);
    a.put(MF1, 320, 0);
    a.tap(FW0, BTN.LOCK);
    expect(me.mode).toBe(MODE.BATTLE);
    me.momentum = 0;
    a.step(120);
    expect(me.tow).toBeGreaterThan(MOMENTUM_TOW);
    expect(me.momentum).toBe(0);
  });

  it('rules.momentumSecs at 0 turns it off', () => {
    const a = arena({ momentumSecs: 0 });
    const me = a.put(FW0, 300, 0);
    a.hold(FW0, BTN.A).step(10);
    expect(me.boosting).toBe(true);
    expect(me.momentum).toBe(0);
  });

  it('a momentum strike hits harder and staggers longer, and only the first blow of a string is one', () => {
    const a = arena();
    const att = a.put(FW0, 300, 0);
    const vic = a.put(FW1, 308, 0);
    att.momentum = 20;
    const T = a.tap(FW0, BTN.X);
    expect(att.momentum).toBe(0);
    expect(att.atkCharged).toBe(true);
    expect(a.events('windup')).toEqual([{ type: 'windup', mech: FW0, attack: ATK.FW_SLASH1, charged: true, tick: T }]);
    a.until(() => a.events('hit').length > 0, 20);
    const slash = ATTACKS[ATK.FW_SLASH1];
    expect(a.events('hit')).toMatchObject([{ attacker: FW0, victim: FW1, charged: true, damage: slash.damage * a.race.rules.momentumDamage }]);
    expect(vic.act).toBe(ACT.STAGGER);
    expect(vic.actDur).toBe(Math.round(slash.stagger * MOMENTUM_STAGGER));
    // The follow-up is an ordinary blow.
    a.tap(FW0, BTN.X);
    a.until(() => a.events('hit').length > 1, 40);
    expect(a.events('hit')[1]).toMatchObject({ attack: ATK.FW_SLASH2, charged: false, damage: ATTACKS[ATK.FW_SLASH2].damage });
    expect(a.events('windup')[1]).toMatchObject({ attack: ATK.FW_SLASH2, charged: false });
  });

  it('throws further and drains a guard harder', () => {
    const a = arena();
    const att = a.put(MF0, 300, 0);
    const vic = a.put(FW1, 300, 8);
    a.step(1);
    const kick = ATTACKS[ATK.MF_KICK];
    applyHit(a.race, TRACK, att, vic, kick, ATK.MF_KICK, true);
    const r = a.race.rules;
    expect(vic.heading).toBeCloseTo(Math.atan2(kick.knockback * r.momentumKnock * r.ringoutThrow, a.pace), 6);
    expect(vic.hp).toBeCloseTo(CLASSES[vic.role].maxHp - kick.damage * r.momentumDamage, 9);

    const b = arena();
    const att2 = b.put(FW0, 300, 0);
    const vic2 = b.put(FW1, 308, 0);
    b.step(1);
    vic2.facing = Math.PI; // facing the attacker
    vic2.guarding = true;
    vic2.guardT = 60; // raised long ago: a block, not a parry
    const g0 = vic2.guard;
    const slash = ATTACKS[ATK.FW_SLASH1];
    applyHit(b.race, TRACK, att2, vic2, slash, ATK.FW_SLASH1, true);
    expect(g0 - vic2.guard).toBeCloseTo(slash.guardDamage * r.momentumDamage, 9);
  });

  it('only a blow takes it: guns already work at racing speed, so a burst is fired plain and the momentum kept', () => {
    const a = arena({ tow: 0 });
    const mf = a.put(MF0, 300, 0);
    a.put(FW1, 330, 0);
    mf.momentum = 30;
    a.tap(MF0, BTN.X);
    expect(mf.atkCharged).toBe(false);
    expect(mf.momentum).toBe(29);
    a.step(40);
    const hits = a.events('hit').filter((e) => e.attacker === MF0);
    expect(hits.length).toBe(3);
    for (const h of hits) expect(h).toMatchObject({ charged: false, damage: 6 });
    expect(mf.mode).toBe(MODE.SPEED); // guns need no lock
  });
});

describe('ring-outs', () => {
  it('nobody to credit: the wall takes it, and nobody gets the Drive', () => {
    const a = arena();
    const m = a.put(FW1, 300, 20);
    setStagger(m, 30);
    m.heading = 0.4; // sliding hard right, out of control
    const hp0 = m.hp;
    a.until(() => a.events('splat').length > 0, 30);
    const [splat] = a.events('splat');
    expect(splat).toMatchObject({ mech: FW1, by: -1, side: 1 });
    expect(splat.damage).toBeCloseTo(a.race.rules.ringoutDamage + splat.intensity * WALL_SPLAT_DAMAGE, 9);
    expect(m.hp).toBeCloseTo(hp0 - splat.damage, 9);
    expect(m.act).toBe(ACT.STAGGER);
    expect(m.actDur).toBe(RINGOUT_STAGGER);
    // Glances back off the barrier rather than sliding along it.
    a.step(10);
    expect(m.d).toBeLessThan(wallLimit(m) - 0.5);
  });

  it('pays the pilot who threw it some Drive on top', () => {
    const a = arena({ tow: 0 });
    const vic = a.put(FW1, 300, 23);
    const att = a.put(MF0, 300, 15);
    a.tap(MF0, BTN.LOCK);
    a.step(12);
    att.drive = 0;
    a.tap(MF0, BTN.Y);
    a.until(() => a.events('splat').length > 0, 30);
    const hit = a.events('hit').find((e) => e.attacker === MF0)!;
    const [splat] = a.events('splat');
    expect(splat.by).toBe(MF0);
    expect(att.drive).toBeGreaterThanOrEqual(RINGOUT_DRIVE + hit.damage * DRIVE_PER_DAMAGE_DEALT - 1e-9);
    expect(att.drive).toBeLessThan(RINGOUT_DRIVE + hit.damage * DRIVE_PER_DAMAGE_DEALT + 1);
    expect(vic.retired).toBe(false);
  });
});

describe('choosing a lock', () => {
  it('takes whoever is in front over a nearer rival off to the side', () => {
    const a = arena();
    const me = a.put(FW0, 300, 0);
    a.put(MF1, 312, 12); // 17 away, 45 degrees right
    a.put(DF1, 340, 0); // 40 away, dead ahead
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(DF1);
  });

  it('among rivals ahead, leans to the rival forward', () => {
    const a = arena();
    const me = a.put(FW0, 300, 0);
    a.put(MF1, 320, 0); // 20 away, dead ahead
    a.put(FW1, 350, 3); // 50 away, all but dead ahead
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(FW1);
    // ...but not to the far end of the lock's reach.
    const b = arena();
    const me2 = b.put(FW0, 300, 0);
    b.put(MF1, 320, 0);
    b.put(FW1, 390, 0);
    b.tap(FW0, BTN.LOCK);
    expect(me2.target).toBe(MF1);
  });

  it('turns with the pilot: what is in front is where the mech faces', () => {
    const a = arena();
    const me = a.put(FW0, 300, 0);
    a.put(MF1, 330, -14); // ahead and left
    a.put(DF1, 330, 14); // ahead and right
    me.facing = me.heading = 0.45; // turned right
    expect(pickTarget(a.race, TRACK, me, false, -1)).toBe(DF1);
    me.facing = me.heading = -0.45;
    expect(pickTarget(a.race, TRACK, me, false, -1)).toBe(MF1);
  });

  it('a rival behind is a last resort', () => {
    const a = arena();
    const me = a.put(FW0, 300, 0);
    a.put(FW1, 285, 0); // the rival forward, right behind
    a.put(DF1, 385, 4); // far, but ahead
    expect(Math.PI).toBeGreaterThan(LOCK_BEHIND);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(DF1);
    const b = arena();
    const me2 = b.put(FW0, 300, 0);
    b.put(FW1, 285, 0);
    b.tap(FW0, BTN.LOCK);
    expect(me2.target).toBe(FW1);
  });

  it('a strike in reach still goes to the nearest rival, whatever the lock would have chosen', () => {
    const a = arena();
    const me = a.put(FW0, 300, 0);
    a.put(MF1, 307, -4); // in reach
    a.put(FW1, 330, 0); // the forward, ahead but out of reach
    expect(pickTarget(a.race, TRACK, me, false, -1)).toBe(FW1);
    a.tap(FW0, BTN.X);
    expect(me.target).toBe(MF1);
  });
});

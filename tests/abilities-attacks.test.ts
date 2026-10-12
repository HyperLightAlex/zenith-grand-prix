// Abilities, part two: the moves that act on other mechs. The midfielder's
// Snare (free steering) and Disruptor pulse (locked on), the defender's Ram
// (free steering) and Aegis (locked on). The button itself, its cost and its
// cooldown are in abilities.test.ts.
import { describe, expect, it } from 'vitest';
import {
  ABILITY,
  ABILITY_COOLDOWN,
  ACT,
  ATK,
  ATTACKS,
  BATTLE_CAP_MULT,
  BTN,
  CLASSES,
  COUNTER_HIT,
  DEFAULT_RULES,
  DRIVE_MAX,
  DRIVE_PER_DAMAGE_DEALT,
  DRIVE_PER_DAMAGE_TAKEN,
  GUARD_BREAK_STAGGER,
  GUARD_REDUCTION,
  HIT_SLOW_PER_DAMAGE,
  MODE,
  PARRY_WINDOW,
  RAM_ARC,
  RAM_MASS,
  RAM_MIN_CLOSING,
  RAM_SHOVE,
  WALL_SPLAT_DAMAGE,
  WALL_SPLAT_MIN,
  abilityFor,
  koBonus,
  setTarget,
  speedCap,
  ticks,
} from '../src/sim/index';
import type { MechState, Rules } from '../src/sim/index';
import { applyHit, retire } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK, dist, giveCells, wallLimit, wallOvershoot } from './helpers';

const SNARE = ATTACKS[ATK.MF_SNARE];
const PULSE = ATTACKS[ATK.MF_PULSE];
const RAM = ATTACKS[ATK.DF_RAM];

/**
 * Rules that leave the Drive gauge alone unless something hits it, for exact
 * sums: no trickle, no slipstream charge, and dead charge strips (one of
 * them runs down the right of the straight these scenes are played on).
 */
const QUIET: Partial<Rules> = { drivePassive: 0, driveDraft: 0, driveStrip: 0, driveStripLap1: 0 };

const hitsOn = (a: Arena, victim: number) => a.events('hit').filter((e) => e.victim === victim);
const maxHp = (m: MechState) => CLASSES[m.role].maxHp;

// =============================================================================
// SNARE
// =============================================================================

describe('Snare', () => {
  /** A midfielder with Cells and a rival forward `ahead` units up the road, `side` units across. */
  function sights(ahead = 40, side = 0, rules?: Partial<Rules>, lapPhase: 2 | 3 = 2) {
    const a = new Arena(lapPhase, 1, rules);
    const mf = giveCells(a.put(MF0, -200, 0));
    const foe = a.put(FW1, -200 + ahead, side);
    return { a, mf, foe };
  }

  /** Fire, and step until the bolt is gone. Returns the tick it was fired and the tick it ended. */
  function fire(a: Arena): { T: number; end: number } {
    const T = a.ability(MF0);
    const n = a.until(() => a.race.projectiles.length === 0, 60);
    expect(n).toBeGreaterThanOrEqual(0);
    return { T, end: a.race.tick };
  }

  it('fires one bolt at the rival in the sights; a hit snares it for rules.snareSecs', () => {
    const { a, mf, foe } = sights();
    expect(abilityFor(mf)).toBe(ABILITY.SNARE);
    const T = a.ability(MF0);
    expect(a.events('ability')).toEqual([{ type: 'ability', mech: MF0, ability: ABILITY.SNARE, tick: T }]);
    const shots = a.events('shot');
    expect(shots).toMatchObject([{ mech: MF0, attack: ATK.MF_SNARE, tick: T }]);
    expect(a.race.projectiles).toMatchObject([{ id: shots[0].proj, owner: MF0, team: 0, attack: ATK.MF_SNARE }]);
    expect(mf.cells).toBe(2);
    // It needs no lock and takes none; the bolt leaves at once, with no wind-up.
    expect(mf.target).toBe(-1);
    expect(mf.act).toBe(ACT.NONE);
    expect(foe.snareT).toBe(0);
    const n = a.until(() => foe.snareT > 0, 30);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(12); // 40 units at 320 u/s
    const H = a.race.tick;
    expect(a.events('hit')).toEqual([
      { type: 'hit', attacker: MF0, victim: FW1, attack: ATK.MF_SNARE, damage: SNARE.damage, blocked: false, heavy: false, charged: false, s: foe.s, d: foe.d, tick: H },
    ]);
    expect(a.events('snared')).toEqual([{ type: 'snared', mech: FW1, by: MF0, tick: H }]);
    expect(a.events('projEnd')).toMatchObject([{ proj: shots[0].proj, hit: true, tick: H }]);
    expect(foe.snareT).toBe(ticks(a.race.rules.snareSecs));
    expect(foe.snareT).toBe(210);
    expect(foe.hp).toBe(maxHp(foe) - 18);
    expect(a.race.projectiles.length).toBe(0);
    // The clock runs down a tick at a time and stops.
    a.step(209);
    expect(foe.snareT).toBe(1);
    a.step(1);
    expect(foe.snareT).toBe(0);
    a.step(5);
    expect(foe.snareT).toBe(0);
  });

  it('a snared mech is held to rules.snareMult of its cap, then let go', () => {
    const { a, mf, foe } = sights();
    const c = CLASSES[foe.role];
    fire(a);
    expect(foe.snareT).toBeGreaterThan(0);
    a.put(MF0, -3000, 0, 0); // the midfielder's part is done: off the stage
    const slow = a.pace * a.race.rules.snareMult;
    expect(speedCap(a.race, foe, c)).toBeCloseTo(slow, 9);
    a.step(60);
    expect(foe.speed).toBeCloseTo(slow, 6);
    let max = 0;
    a.step(100, () => (max = Math.max(max, foe.speed)));
    expect(max).toBeCloseTo(slow, 6);
    expect(max).toBeLessThan(a.pace - 20);
    // When the clock runs out the cap is back and it accelerates away again.
    a.until(() => foe.snareT === 0, 100);
    expect(speedCap(a.race, foe, c)).toBe(a.pace);
    a.step(200, () => a.recenter([FW1]));
    expect(foe.speed).toBeCloseTo(a.pace, 6);
    void mf;
  });

  it('on the speed lap it is the frame\'s own top speed that is cut', () => {
    const { a, foe } = sights(40, 0, undefined, 3);
    fire(a);
    expect(foe.snareT).toBeGreaterThan(0);
    const top = CLASSES[foe.role].topSpeed;
    // (Top speed with what armour the bolt left it: the Snare does 18 damage.)
    const floor = a.race.rules.armourFloor;
    const own = top * (floor + (1 - floor) * (foe.hp / maxHp(foe)));
    expect(speedCap(a.race, foe, CLASSES[foe.role])).toBeCloseTo(own * a.race.rules.snareMult, 9);
    expect(own * a.race.rules.snareMult).toBeLessThan(a.race.rules.limiter2);
  });

  it('kills the boost: one that is burning goes out, and none can be lit while snared', () => {
    const { a, foe } = sights(40, 0, QUIET);
    foe.drive = 60;
    a.hold(FW1, BTN.A).step(20);
    expect(foe.boosting).toBe(true);
    a.inputs[MF0].throttle = 0.7; // do not chase it down while it boosts
    const T = a.ability(MF0);
    a.until(() => foe.snareT > 0, 40);
    expect(foe.snareT).toBeGreaterThan(0);
    expect(foe.boosting).toBe(false);
    const drive = foe.drive;
    a.clearLog();
    a.put(MF0, -3000, 0, 0);
    // The button stays down for the whole Snare: nothing lights, nothing burns.
    let snaredTicks = 0;
    const n = a.until(() => {
      if (foe.snareT > 0) {
        snaredTicks++;
        expect(foe.boosting).toBe(false);
        expect(foe.drive).toBe(drive);
        expect(a.events('boost').length).toBe(0);
      }
      return foe.snareT === 0;
    }, 300);
    expect(n).toBeGreaterThan(200);
    expect(snaredTicks).toBe(n);
    // On the very tick the Snare runs out, the button (still down) lights it again.
    expect(foe.boosting).toBe(true);
    expect(a.events('boost').length).toBe(1);
    expect(foe.drive).toBeLessThan(drive);
    expect(T).toBeGreaterThan(0);
  });

  it('slows a mech that is locked on, too: the pace a fight is carried at is cut the same way', () => {
    const a = new Arena(2);
    const mf = giveCells(a.put(MF0, -200, 0));
    const foe = a.put(FW1, -160, 0);
    const lead = a.put(DF1, -130, 8); // its own team-mate, ahead: something to hold station on
    a.tap(FW1, BTN.ALLY);
    expect(foe.target).toBe(DF1);
    expect(foe.mode).toBe(MODE.BATTLE);
    a.step(20);
    expect(foe.vs).toBeCloseTo(a.pace, 3);
    fire(a);
    expect(foe.snareT).toBeGreaterThan(0);
    a.inputs[MF0].throttle = 0;
    a.inputs[MF0].brake = 1;
    a.step(60);
    expect(foe.mode).toBe(MODE.BATTLE);
    // Chasing a target ahead tops out at the limiter x BATTLE_CAP_MULT; snared, at snareMult of that.
    expect(foe.vs).toBeCloseTo(a.pace * BATTLE_CAP_MULT * a.race.rules.snareMult, 6);
    expect(lead.s - foe.s).toBeGreaterThan(40); // its escort is leaving it behind
    void mf;
  });

  it('a guard facing the bolt blocks it: chip damage, and the Snare does not take hold', () => {
    const { a, mf, foe } = sights();
    a.tap(FW1, BTN.LOCK); // turn to face the midfielder
    a.step(24);
    a.hold(FW1, BTN.GUARD).step(20);
    expect(foe.guarding).toBe(true);
    a.clearLog();
    fire(a);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, attack: ATK.MF_SNARE, blocked: true }]);
    expect(a.events('hit')[0].damage).toBeCloseTo(SNARE.damage * GUARD_REDUCTION, 9);
    expect(a.events('snared').length).toBe(0);
    expect(foe.snareT).toBe(0);
    expect(foe.guard).toBe(CLASSES[foe.role].guardMax - SNARE.guardDamage);
    // The Cell is spent all the same.
    expect(mf.cells).toBe(2);
    expect(speedCap(a.race, foe, CLASSES[foe.role])).toBe(a.pace);
  });

  it('a guard facing the other way does not help', () => {
    const { a, foe } = sights();
    a.put(MF0, -200, 0);
    const ahead = a.put(DF0, -120, 0); // a rival up the road for the forward to face
    a.tap(FW1, BTN.LOCK);
    expect(foe.target).toBe(DF0);
    a.step(10);
    a.hold(FW1, BTN.GUARD).step(20);
    expect(foe.guarding).toBe(true);
    a.clearLog();
    fire(a);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, blocked: false, damage: SNARE.damage }]);
    expect(a.events('snared')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(foe.snareT).toBeGreaterThan(0);
    void ahead;
  });

  it('a guard broken by the bolt does not block it', () => {
    const { a, foe } = sights();
    a.tap(FW1, BTN.LOCK);
    a.step(24);
    a.hold(FW1, BTN.GUARD).step(20);
    foe.guard = SNARE.guardDamage; // just enough left to be broken
    a.clearLog();
    fire(a);
    expect(a.events('guardBreak')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(a.events('snared').length).toBe(1);
    expect(foe.snareT).toBeGreaterThan(0);
  });

  it('an Aegis stops it taking hold (the bolt still does its reduced damage)', () => {
    const { a, mf, foe } = sights();
    foe.shieldT = 300;
    fire(a);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, blocked: false }]);
    expect(a.events('hit')[0].damage).toBeCloseTo(SNARE.damage * a.race.rules.aegisDamage, 9);
    expect(a.events('snared').length).toBe(0);
    expect(foe.snareT).toBe(0);
    expect(foe.act).toBe(ACT.NONE);
    expect(mf.cells).toBe(2);
  });

  it('i-frames carry a mech through it', () => {
    const { a, foe } = sights();
    foe.iframes = 30;
    fire(a);
    expect(a.events('evade')).toMatchObject([{ mech: FW1 }]);
    expect(a.events('hit').length).toBe(0);
    expect(a.events('snared').length).toBe(0);
    expect(foe.snareT).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
  });

  it('with nobody in the sights it is refused ("target"): no bolt, no Cell spent, no cooldown', () => {
    const cases: Array<{ ahead: number; side: number; why: string }> = [
      { ahead: SNARE.shot!.range + 12, side: 0, why: 'too far up the road' },
      { ahead: 10, side: 20, why: 'well off the nose (63 degrees; the sights cover about 31)' },
      { ahead: -30, side: 0, why: 'behind' },
      { ahead: 0, side: 15, why: 'alongside' },
    ];
    for (const c of cases) {
      const { a, mf } = sights(c.ahead, c.side);
      const T = a.ability(MF0);
      if (a.events('ability').length) throw new Error(`fired although the rival was ${c.why}`);
      expect(a.events('denied')).toEqual([{ type: 'denied', mech: MF0, reason: 'target', tick: T }]);
      expect(mf.cells).toBe(3);
      expect(mf.cdAbility).toBe(0);
      expect(a.race.projectiles.length).toBe(0);
      expect(a.events('shot').length).toBe(0);
    }
  });

  it('the refusal costs nothing, so the next press with a rival in the sights fires at once', () => {
    const { a, mf, foe } = sights(SNARE.shot!.range + 12, 0);
    a.ability(MF0);
    expect(a.events('ability').length).toBe(0);
    foe.s = mf.s + 40;
    a.step(1);
    a.ability(MF0);
    expect(a.events('ability')).toMatchObject([{ ability: ABILITY.SNARE }]);
    expect(mf.cells).toBe(2);
  });

  it('reaches about a hundred units, and just inside the edge of the sights', () => {
    const far = sights(SNARE.shot!.range - 2, 0);
    fire(far.a);
    expect(far.foe.snareT).toBeGreaterThan(0);
    // 28 degrees off the nose at 40 units.
    const wide = sights(35, 19);
    expect((Math.atan2(19, 35) * 180) / Math.PI).toBeGreaterThan(28);
    expect(Math.atan2(19, 35)).toBeLessThan(SNARE.arc);
    fire(wide.a);
    expect(wide.foe.snareT).toBeGreaterThan(0);
  });

  it('team-mates are not targets, and the bolt passes through them', () => {
    const only = new Arena(2);
    const mf = giveCells(only.put(MF0, -200, 0));
    only.put(FW0, -170, 0);
    only.put(DF0, -150, 4);
    only.ability(MF0);
    expect(only.events('ability').length).toBe(0);
    expect(only.events('denied').map((e) => e.reason)).toEqual(['target']);
    expect(mf.cells).toBe(3);

    const { a, foe } = sights(50, 0);
    const mate = a.put(FW0, -175, 0); // dead in line, half way to the rival
    fire(a);
    expect(a.events('hit').map((e) => e.victim)).toEqual([FW1]);
    expect(foe.snareT).toBeGreaterThan(0);
    expect(mate.snareT).toBe(0);
    expect(mate.hp).toBe(maxHp(mate));
  });

  it('with two rivals in the sights it goes for the nearer, straighter one', () => {
    const { a, foe } = sights(45, 0);
    const other = a.put(MF1, -200 + 70, 10);
    fire(a);
    expect(foe.snareT).toBeGreaterThan(0);
    expect(other.snareT).toBe(0);
    expect(a.events('snared').map((e) => e.mech)).toEqual([FW1]);
  });

  it('the bolt itself is a light hit: a short stagger, 18 damage, a little pace', () => {
    const { a, foe } = sights();
    a.ability(MF0);
    const v0 = foe.speed;
    a.until(() => foe.snareT > 0, 30);
    expect(foe.act).toBe(ACT.STAGGER);
    expect(foe.actDur).toBe(SNARE.stagger);
    expect(SNARE.damage).toBe(18);
    expect(SNARE.kind).toBe('shot');
    // (A tenth of its small knockback down the road, then the hit-slow.)
    expect(foe.speed).toBeCloseTo((v0 + SNARE.knockback * 0.1) * (1 - SNARE.damage * HIT_SLOW_PER_DAMAGE), 6);
    a.step(SNARE.stagger + 1);
    expect(foe.act).toBe(ACT.NONE);
  });

  it('a bolt that takes the last of the armour is a knock-out, credited, and nobody is "snared"', () => {
    const { a, mf, foe } = sights();
    foe.hp = 10;
    fire(a);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, damage: 10 }]);
    expect(a.events('ko')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(a.events('snared').length).toBe(0);
    expect(foe.retired).toBe(true);
    expect(foe.snareT).toBe(0);
    expect(mf.kos).toBe(1);
    expect(koBonus(a.race, mf)).toBe(a.race.rules.koPoints);
  });

  it('a second Snare restarts the clock; the slow-down does not stack', () => {
    const { a, mf, foe } = sights();
    fire(a);
    a.step(ABILITY_COOLDOWN + 20, () => {
      foe.s = mf.s + 40;
    });
    expect(foe.snareT).toBeLessThan(160);
    expect(foe.snareT).toBeGreaterThan(100);
    fire(a);
    expect(a.events('snared').length).toBe(2);
    expect(foe.snareT).toBeGreaterThan(200);
    expect(foe.snareT).toBeLessThanOrEqual(210);
    expect(speedCap(a.race, foe, CLASSES[foe.role])).toBeCloseTo(a.pace * a.race.rules.snareMult, 9);
    expect(mf.cells).toBe(1);
  });

  it('does not take hold on a ramming defender: the bolt hurts, and that is all', () => {
    // Mid-ram a defender is unstoppable: nothing staggers it, slows it or
    // snares it (the same rule as under an Aegis).
    const a = new Arena(2);
    const mf = giveCells(a.put(MF0, -200, 0));
    const df = giveCells(a.put(DF1, -160, 0));
    a.ability(DF1);
    expect(df.ramT).toBeGreaterThan(0);
    a.step(1);
    fire(a);
    expect(hitsOn(a, DF1)).toMatchObject([{ attacker: MF0, attack: ATK.MF_SNARE, damage: SNARE.damage, blocked: false }]);
    expect(df.hp).toBe(maxHp(df) - SNARE.damage);
    expect(a.events('snared').length).toBe(0);
    expect(df.snareT).toBe(0);
    expect(df.act).toBe(ACT.NONE); // no stagger mid-ram
    expect(df.ramT).toBeGreaterThan(0);
    expect(speedCap(a.race, df, CLASSES[df.role])).toBeCloseTo(a.pace * a.race.rules.ramMult, 9);
    expect(mf.cells).toBe(2); // the Cell is spent all the same
    // Once the charge is over the defender is as open to a Snare as anyone.
    a.step(ticks(a.race.rules.ramSecs), () => {
      df.s = mf.s + 40;
      df.d = mf.d;
    });
    expect(df.ramT).toBe(0);
    fire(a);
    expect(a.events('snared')).toMatchObject([{ mech: DF1, by: MF0 }]);
    expect(df.snareT).toBeGreaterThan(0);
    expect(speedCap(a.race, df, CLASSES[df.role])).toBeCloseTo(a.pace * a.race.rules.snareMult, 9);
  });

  it('the length and the strength are rules', () => {
    const { a, foe } = sights(40, 0, { snareSecs: 1, snareMult: 0.5 });
    fire(a);
    expect(foe.snareT).toBeGreaterThan(50);
    expect(foe.snareT).toBeLessThanOrEqual(60);
    expect(speedCap(a.race, foe, CLASSES[foe.role])).toBeCloseTo(a.pace * 0.5, 9);
    // snareMult 1 is a Snare that slows nothing (it still kills the boost).
    const soft = sights(40, 0, { snareMult: 1 });
    fire(soft.a);
    expect(soft.foe.snareT).toBeGreaterThan(0);
    expect(speedCap(soft.a.race, soft.foe, CLASSES[soft.foe.role])).toBe(soft.a.pace);
  });

  it('the same button in a lock is the Disruptor, not a Snare', () => {
    const { a, mf } = sights(15, 6);
    a.tap(MF0, BTN.LOCK);
    expect(abilityFor(mf)).toBe(ABILITY.PULSE);
    a.step(1);
    a.ability(MF0);
    expect(a.events('ability')).toMatchObject([{ ability: ABILITY.PULSE }]);
    expect(a.events('shot').length).toBe(0);
  });
});

// =============================================================================
// DISRUPTOR PULSE
// =============================================================================

describe('Disruptor pulse', () => {
  /** A midfielder locked on a rival forward 16 units ahead and a little to the side. */
  function locked(rules: Partial<Rules> = QUIET) {
    const a = new Arena(2, 1, rules);
    const mf = giveCells(a.put(MF0, -200, 0));
    const foe = a.put(FW1, -184, 6);
    a.tap(MF0, BTN.LOCK);
    expect(mf.target).toBe(FW1);
    a.step(2);
    a.clearLog();
    return { a, mf, foe };
  }

  it('hits every rival within rules.pulseRange, and only them', () => {
    const { a, mf, foe } = locked();
    const range = a.race.rules.pulseRange;
    const beside = a.put(MF1, mf.s - a.base, 20); // 20 across
    const behind = a.put(DF1, mf.s - a.base - 18, -12); // behind, about 21.6 away
    const mate = a.put(FW0, mf.s - a.base + 10, -8); // a team-mate right in the middle of it
    const mate2 = a.put(DF0, mf.s - a.base - 9, 8);
    for (const m of [foe, beside, behind]) expect(dist(mf, m)).toBeLessThan(range);
    expect(abilityFor(mf)).toBe(ABILITY.PULSE);
    const T = a.ability(MF0);
    expect(a.events('ability')).toEqual([{ type: 'ability', mech: MF0, ability: ABILITY.PULSE, tick: T }]);
    const hits = a.events('hit');
    expect(hits.map((e) => e.victim).sort()).toEqual([FW1, MF1, DF1]);
    for (const e of hits) {
      expect(e).toMatchObject({ attacker: MF0, attack: ATK.MF_PULSE, damage: PULSE.damage, blocked: false, heavy: true, tick: T });
    }
    expect(PULSE.damage).toBe(26);
    for (const m of [foe, beside, behind]) {
      expect(m.hp).toBe(maxHp(m) - 26);
      expect(m.act).toBe(ACT.STAGGER);
      expect(m.lastHitBy).toBe(MF0);
    }
    for (const m of [mate, mate2, mf]) {
      expect(m.hp).toBe(maxHp(m));
      expect(m.act).toBe(ACT.NONE);
    }
    expect(mf.cells).toBe(2);
    expect(mf.dmgDealt).toBe(3 * 26);
    // No bolt, no wind-up: it is all over on the tick of the press.
    expect(a.race.projectiles.length).toBe(0);
    expect(a.events('shot').length + a.events('windup').length).toBe(0);
    a.step(30);
    expect(a.events('hit').length).toBe(3);
  });

  it('the range is measured centre to centre: just inside is hit, just outside is not', () => {
    const range = DEFAULT_RULES.pulseRange;
    // (Measured along the road: across it, the walls are closer than the pulse reaches.)
    const at = (ahead: number) => {
      const { a, mf, foe } = locked();
      const edge = a.put(MF1, mf.s - a.base + ahead, 0);
      const before = edge.hp;
      a.ability(MF0);
      expect(hitsOn(a, FW1).length).toBe(1);
      expect(foe.hp).toBeLessThan(maxHp(foe));
      return before - edge.hp;
    };
    expect(at(range - 0.5)).toBe(26);
    expect(at(-(range - 0.5))).toBe(26);
    expect(at(range + 0.5)).toBe(0);
    expect(at(-(range + 0.5))).toBe(0);
    expect(wallLimit(locked().mf)).toBeLessThan(range);
  });

  it('a rival caught against the wall is thrown into it: the splat comes on top', () => {
    const { a, mf } = locked();
    const pinned = a.put(MF1, mf.s - a.base, 24); // level with the midfielder, nearly on the barrier
    a.ability(MF0);
    a.step(6);
    const [splat] = a.events('splat');
    expect(splat.mech).toBe(MF1);
    expect(splat.damage).toBeGreaterThan(WALL_SPLAT_MIN * WALL_SPLAT_DAMAGE);
    expect(pinned.hp).toBeCloseTo(maxHp(pinned) - PULSE.damage - splat.damage, 9);
    expect(wallOvershoot(pinned)).toBe(0);
  });

  it('drains rules.pulseDrain Drive from every rival it hits, never below zero', () => {
    const { a, mf, foe } = locked();
    const rich = a.put(MF1, mf.s - a.base, 20);
    const poor = a.put(DF1, mf.s - a.base - 18, -12);
    const mate = a.put(FW0, mf.s - a.base + 10, -8);
    foe.drive = 50;
    rich.drive = DRIVE_MAX;
    poor.drive = 12;
    mate.drive = 50;
    mf.drive = 0;
    a.ability(MF0);
    const drain = a.race.rules.pulseDrain;
    const gain = PULSE.damage * DRIVE_PER_DAMAGE_TAKEN; // being hit feeds the gauge first, as ever
    expect(drain).toBe(30);
    expect(foe.drive).toBeCloseTo(50 + gain - drain, 9);
    expect(rich.drive).toBeCloseTo(DRIVE_MAX - drain, 9); // the gauge was full: nothing to add
    expect(poor.drive).toBe(0);
    expect(mate.drive).toBe(50);
    // The attacker gets the usual Drive for damage dealt, three times over.
    expect(mf.drive).toBeCloseTo(3 * PULSE.damage * DRIVE_PER_DAMAGE_DEALT, 9);
  });

  it('with no rival in range it is refused ("target") and costs nothing', () => {
    const a = new Arena(2);
    const mf = giveCells(a.put(MF0, -200, 0));
    const foe = a.put(FW1, -200 + 27, 0); // locked, in plain view, a unit too far
    a.tap(MF0, BTN.LOCK);
    a.step(1);
    foe.s = mf.s + 27;
    expect(mf.target).toBe(FW1);
    a.clearLog();
    const T = a.ability(MF0);
    expect(a.events('ability').length).toBe(0);
    expect(a.events('denied')).toEqual([{ type: 'denied', mech: MF0, reason: 'target', tick: T }]);
    expect(mf.cells).toBe(3);
    expect(mf.cdAbility).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
    // Close the gap and the very next press goes off.
    foe.s = mf.s + 20;
    a.step(1);
    a.ability(MF0);
    expect(a.events('ability').length).toBe(1);
    expect(foe.hp).toBe(maxHp(foe) - 26);
  });

  it('a rival mid-dodge is not somebody it would reach: with only dodging rivals in range it is refused, and the Cell is kept', () => {
    const { a, mf, foe } = locked();
    const other = a.put(MF1, mf.s - a.base, 20);
    foe.iframes = 12;
    other.iframes = 12;
    for (const m of [foe, other]) expect(dist(mf, m)).toBeLessThan(a.race.rules.pulseRange);
    const T = a.ability(MF0);
    expect(a.events('ability').length).toBe(0);
    expect(a.events('denied')).toEqual([{ type: 'denied', mech: MF0, reason: 'target', tick: T }]);
    // Refused before anything was thrown: nothing to evade, nothing lost.
    expect(a.events('evade').length).toBe(0);
    expect(a.events('hit').length).toBe(0);
    expect(mf.cells).toBe(3);
    expect(mf.cdAbility).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
    expect(other.hp).toBe(maxHp(other));
    // One of the two comes out of its dodge: now there is somebody to hit,
    // and the next press goes off. The one still dodging is missed, as ever.
    a.step(1);
    other.iframes = 0;
    foe.iframes = 12;
    const U = a.ability(MF0);
    expect(a.events('ability')).toEqual([{ type: 'ability', mech: MF0, ability: ABILITY.PULSE, tick: U }]);
    expect(a.events('hit').map((e) => e.victim)).toEqual([MF1]);
    expect(a.events('evade')).toMatchObject([{ mech: FW1 }]);
    expect(mf.cells).toBe(2);
    expect(mf.cdAbility).toBe(ABILITY_COOLDOWN);
    expect(other.hp).toBe(maxHp(other) - 26);
    expect(foe.hp).toBe(maxHp(foe));
  });

  it('a real dodge: the locked rival dashes, and for as long as its i-frames last the pulse is refused', () => {
    const { a, mf, foe } = locked();
    a.tap(FW1, BTN.LOCK);
    expect(foe.target).toBe(MF0);
    foe.drive = 50;
    a.step(2);
    a.clearLog();
    a.inputs[FW1].mx = 1; // sideways: it stays well inside the pulse
    a.tap(FW1, BTN.A);
    a.inputs[FW1].mx = 0;
    expect(a.events('dash')).toMatchObject([{ mech: FW1 }]);
    expect(foe.iframes).toBeGreaterThan(0);
    // Press on every tick of the dodge: refused each time (one "denied" is
    // logged; the refusals after it are silent), and nothing is spent.
    let presses = 0;
    while (foe.iframes > 1) {
      a.inputs[MF0].buttons = presses % 2 === 0 ? BTN.ABILITY : 0;
      a.step(1);
      presses++;
      expect(dist(mf, foe)).toBeLessThan(a.race.rules.pulseRange);
    }
    a.inputs[MF0].buttons = 0;
    expect(presses).toBeGreaterThan(6);
    expect(a.events('ability').length).toBe(0);
    expect(a.events('denied')).toMatchObject([{ mech: MF0, reason: 'target' }]);
    expect(mf.cells).toBe(3);
    expect(mf.cdAbility).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
    // The dodge over, it lands.
    a.step(1);
    expect(foe.iframes).toBe(0);
    a.ability(MF0);
    expect(a.events('ability').length).toBe(1);
    expect(hitsOn(a, FW1)).toMatchObject([{ attack: ATK.MF_PULSE, damage: 26 }]);
    expect(mf.cells).toBe(2);
  });

  it('it is the rivals in range that matter, not the one that is locked', () => {
    // Locked on a team-mate (escorting), with a rival alongside.
    const a = new Arena(2);
    const mf = giveCells(a.put(MF0, -200, 0));
    a.put(FW0, -180, -6);
    const foe = a.put(DF1, -205, 12);
    a.tap(MF0, BTN.ALLY);
    expect(mf.target).toBe(FW0);
    expect(abilityFor(mf)).toBe(ABILITY.PULSE);
    a.step(1);
    a.ability(MF0);
    expect(a.events('hit').map((e) => e.victim)).toEqual([DF1]);
    expect(foe.act).toBe(ACT.STAGGER);
    // And locked on a rival out of range, with another one inside it.
    const b = new Arena(2);
    const mf2 = giveCells(b.put(MF0, -200, 0));
    const farFoe = b.put(FW1, -150, 0);
    const nearFoe = b.put(MF1, -205, 12);
    setTarget(b.race, mf2, FW1);
    expect(dist(mf2, farFoe)).toBeGreaterThan(b.race.rules.pulseRange);
    b.step(1);
    expect(mf2.target).toBe(FW1);
    b.ability(MF0);
    expect(b.events('hit').map((e) => e.victim)).toEqual([MF1]);
    expect(farFoe.hp).toBe(maxHp(farFoe));
    expect(nearFoe.hp).toBe(maxHp(nearFoe) - 26);
  });

  it('is heavy: it interrupts an armoured wind-up that a light hit would not', () => {
    const { a, mf, foe } = locked();
    void foe;
    const df = a.put(DF1, mf.s - a.base - 11, 0); // right behind, in hammer range
    a.tap(DF1, BTN.X);
    expect(df.act).toBe(ACT.ATTACK);
    expect(df.attack).toBe(ATK.DF_HAMMER1);
    expect(ATTACKS[ATK.DF_HAMMER1].armor).toBe(true);
    a.step(4);
    // A light hit now: damage (a counter hit, even), but the hammer keeps coming.
    a.race.tick++;
    applyHit(a.race, TRACK, mf, df, ATTACKS[ATK.MF_BURST], ATK.MF_BURST);
    expect(df.act).toBe(ACT.ATTACK);
    a.clearLog();
    a.ability(MF0);
    const hit = hitsOn(a, DF1)[0];
    expect(hit).toMatchObject({ attack: ATK.MF_PULSE, heavy: true });
    expect(hit.damage).toBeCloseTo(PULSE.damage * COUNTER_HIT, 9); // caught in its wind-up
    expect(df.act).toBe(ACT.STAGGER);
    expect(df.actDur).toBe(PULSE.stagger);
    // The swing never comes.
    a.step(40);
    expect(a.events('swing').filter((e) => e.mech === DF1).length).toBe(0);
    expect(hitsOn(a, MF0).length).toBe(0);
    expect(mf.hp).toBe(maxHp(mf));
  });

  it('cannot be parried: a guard raised at the perfect moment only blocks it', () => {
    const { a, mf, foe } = locked();
    a.tap(FW1, BTN.LOCK);
    a.step(24); // turn to face the midfielder
    expect(foe.target).toBe(MF0);
    foe.drive = 50;
    a.clearLog();
    // Guard up two ticks before the pulse: inside the parry window by a mile.
    a.hold(FW1, BTN.GUARD).step(2);
    expect(foe.guarding).toBe(true);
    expect(foe.guardT).toBeLessThanOrEqual(PARRY_WINDOW);
    a.ability(MF0);
    expect(a.events('parry').length).toBe(0);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, attack: ATK.MF_PULSE, blocked: true }]);
    expect(a.events('hit')[0].damage).toBeCloseTo(PULSE.damage * GUARD_REDUCTION, 9);
    expect(mf.act).toBe(ACT.NONE); // the attacker is not turned
    expect(foe.act).toBe(ACT.NONE);
    expect(foe.guard).toBe(CLASSES[foe.role].guardMax - PULSE.guardDamage);
    // Blocked is still hit: the Drive goes.
    expect(foe.drive).toBeCloseTo(50 + PULSE.damage * GUARD_REDUCTION * DRIVE_PER_DAMAGE_TAKEN - a.race.rules.pulseDrain, 9);
    // The same guard against an ordinary blow would have parried it.
    const slash = ATTACKS[ATK.FW_SLASH1];
    expect(slash.noParry).toBeFalsy();
    const c = locked();
    c.a.tap(FW1, BTN.LOCK);
    c.a.step(24);
    c.a.hold(FW1, BTN.GUARD).step(2);
    c.a.race.events.length = 0;
    applyHit(c.a.race, TRACK, c.mf, c.foe, slash, ATK.FW_SLASH1);
    expect(c.a.race.events.map((e) => e.type)).toContain('parry');
  });

  it('breaks a guard that is nearly spent', () => {
    const { a, foe } = locked();
    a.tap(FW1, BTN.LOCK);
    a.step(24);
    a.hold(FW1, BTN.GUARD).step(20);
    foe.guard = PULSE.guardDamage; // 40 of guard damage against 40 of guard
    a.clearLog();
    a.ability(MF0);
    expect(a.events('guardBreak')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, blocked: false }]);
    expect(a.events('hit')[0].damage).toBeCloseTo(PULSE.damage * 0.6, 9);
    expect(foe.act).toBe(ACT.STAGGER);
    expect(foe.actDur).toBe(GUARD_BREAK_STAGGER);
  });

  it('a rival in its i-frames is missed entirely: no damage, no Drive lost', () => {
    const { a, foe } = locked();
    foe.iframes = 20;
    foe.drive = 50;
    const other = a.put(MF1, a.mech(MF0).s - a.base, 20);
    a.ability(MF0);
    expect(a.events('evade')).toMatchObject([{ mech: FW1 }]);
    expect(a.events('hit').map((e) => e.victim)).toEqual([MF1]);
    expect(foe.hp).toBe(maxHp(foe));
    expect(foe.drive).toBe(50);
    expect(other.act).toBe(ACT.STAGGER);
  });

  it('under an Aegis a rival is hurt less and not staggered, but still drained', () => {
    const { a, foe } = locked();
    foe.shieldT = 100;
    foe.drive = 50;
    a.ability(MF0);
    const dmg = PULSE.damage * a.race.rules.aegisDamage;
    expect(a.events('hit')[0].damage).toBeCloseTo(dmg, 9);
    expect(foe.act).toBe(ACT.NONE);
    expect(foe.drive).toBeCloseTo(50 + dmg * DRIVE_PER_DAMAGE_TAKEN - a.race.rules.pulseDrain, 9);
  });

  it('throws its victims outward', () => {
    const { a, mf } = locked();
    const right = a.put(MF1, mf.s - a.base, 12);
    const left = a.put(DF1, mf.s - a.base, -12);
    a.ability(MF0);
    expect(right.vd).toBeGreaterThan(PULSE.knockback * 0.9);
    expect(left.vd).toBeLessThan(-PULSE.knockback * 0.9);
  });

  it('can score the knock-out, and leaves wrecks and finishers alone', () => {
    const { a, mf, foe } = locked();
    foe.hp = 20;
    const wreck = a.put(MF1, mf.s - a.base, 15);
    retire(a.race, wreck, null);
    a.step(1);
    a.clearLog();
    a.ability(MF0);
    expect(a.events('hit').map((e) => [e.victim, e.damage])).toEqual([[FW1, 20]]);
    expect(a.events('ko')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(mf.kos).toBe(1);
    expect(foe.retired).toBe(true);
  });

  it('counts as one hit of a stagger chain, like any other blow', () => {
    const { a, foe } = locked();
    a.ability(MF0);
    expect(foe.chain).toBe(1);
  });

  it('the reach and the drain are rules', () => {
    const wide = locked({ ...QUIET, pulseRange: 60, pulseDrain: 100 });
    const far = wide.a.put(MF1, wide.mf.s - wide.a.base + 50, 0);
    far.drive = 90;
    wide.a.ability(MF0);
    expect(hitsOn(wide.a, MF1).length).toBe(1);
    expect(far.drive).toBe(0);

    const dry = locked({ ...QUIET, pulseDrain: 0 });
    dry.foe.drive = 50;
    dry.a.ability(MF0);
    expect(dry.foe.drive).toBeCloseTo(50 + PULSE.damage * DRIVE_PER_DAMAGE_TAKEN, 9);

    const short = locked({ ...QUIET, pulseRange: 10 });
    short.a.ability(MF0);
    expect(short.a.events('ability').length).toBe(0);
    expect(short.a.events('denied').map((e) => e.reason)).toEqual(['target']);
  });

  it('free steering, the same button is the Snare: there is no pulse without a lock', () => {
    const a = new Arena(2);
    const mf = giveCells(a.put(MF0, -200, 0));
    const foe = a.put(FW1, -200, 12); // alongside: in pulse range, not in the Snare's sights
    expect(abilityFor(mf)).toBe(ABILITY.SNARE);
    a.ability(MF0);
    expect(a.events('ability').length).toBe(0);
    expect(a.events('denied').map((e) => e.reason)).toEqual(['target']);
    expect(foe.hp).toBe(maxHp(foe));
  });
});

// =============================================================================
// RAM
// =============================================================================

describe('Ram', () => {
  /** A defender with Cells and a rival forward `gap` ahead in the same lane, both at the limiter. */
  function charge(rules?: Partial<Rules>, gap = 12, victim = FW1) {
    const a = new Arena(2, 1, rules);
    const df = giveCells(a.put(DF0, -200, 0));
    const foe = a.put(victim, -200 + gap, 0);
    return { a, df, foe };
  }

  /** Start the ram and step until it has hit `victim` (or the limit runs out). Returns ticks from the press, or -1. */
  function ramInto(a: Arena, victim: number, limit = 200): number {
    const T = a.ability(DF0);
    const n = a.until(() => a.events('hit').some((e) => e.victim === victim) || a.events('evade').some((e) => e.mech === victim), limit);
    return n < 0 ? -1 : a.race.tick - T;
  }

  it('starts an unstoppable charge: rules.ramSecs long, rules.ramMult quicker', () => {
    const { a, df } = charge();
    const c = CLASSES[df.role];
    const T = a.ability(DF0);
    expect(a.events('ability')).toEqual([{ type: 'ability', mech: DF0, ability: ABILITY.RAM, tick: T }]);
    expect(df.ramT).toBe(ticks(a.race.rules.ramSecs));
    expect(df.ramT).toBe(210);
    expect(df.ramHits).toBe(0);
    expect(df.cells).toBe(2);
    expect(speedCap(a.race, df, c)).toBeCloseTo(a.pace * a.race.rules.ramMult, 9);
    expect(df.mode).toBe(MODE.SPEED);
    expect(df.act).toBe(ACT.NONE);
  });

  it('the charge really is quicker, for exactly as long as it lasts', () => {
    const a = new Arena(2);
    const df = giveCells(a.put(DF0, -200, 0));
    const c = CLASSES[df.role];
    a.ability(DF0);
    const fast = a.pace * a.race.rules.ramMult;
    let max = 0;
    a.step(209, () => {
      a.recenter([DF0]);
      expect(speedCap(a.race, df, c)).toBeCloseTo(fast, 9);
      max = Math.max(max, df.speed);
    });
    expect(max).toBeCloseTo(fast, 6);
    expect(df.ramT).toBe(1);
    a.step(1);
    expect(df.ramT).toBe(0);
    expect(speedCap(a.race, df, c)).toBe(a.pace);
    a.step(60, () => a.recenter([DF0]));
    expect(df.speed).toBeCloseTo(a.pace, 6);
  });

  it('running into a rival is a heavy hit for rules.ramDamage, and the rival is thrown aside', () => {
    const { a, df, foe } = charge();
    const n = ramInto(a, FW1);
    expect(n).toBeGreaterThan(10);
    const H = a.race.tick;
    const hits = a.events('hit');
    expect(hits).toMatchObject([{ attacker: DF0, victim: FW1, attack: ATK.DF_RAM, damage: 80, blocked: false, heavy: true, tick: H }]);
    expect(a.race.rules.ramDamage).toBe(80);
    expect(foe.hp).toBe(maxHp(foe) - 80);
    expect(foe.dmgTaken).toBe(80);
    expect(df.dmgDealt).toBe(80);
    expect(foe.lastHitBy).toBe(DF0);
    expect(foe.act).toBe(ACT.STAGGER);
    expect(foe.actDur).toBe(RAM.stagger);
    // Shoved sideways at RAM_SHOVE (from dead astern, toward one wall or the other).
    expect(Math.abs(foe.vd)).toBeCloseTo(RAM_SHOVE, 6);
    expect(df.ramHits).toBe(1 << FW1);
    // The defender carries on through: not staggered, still charging.
    expect(df.act).toBe(ACT.NONE);
    expect(df.ramT).toBeGreaterThan(0);
    expect(df.hp).toBe(maxHp(df));
    a.step(90);
    expect(Math.abs(foe.d)).toBeGreaterThan(8);
    expect(df.s).toBeGreaterThan(foe.s); // and is past it
    expect(hitsOn(a, FW1).length).toBe(1);
  });

  it('hits each rival once per charge, however long they stay in contact', () => {
    // Pin the rival in front of the defender for the whole charge.
    const { a, df, foe } = charge();
    a.ability(DF0);
    a.step(215, () => {
      a.recenter([DF0, FW1]);
      foe.s = df.s + 6.5; // overlapping, every tick
      foe.d = df.d;
      foe.vs = foe.speed = Math.max(0, df.speed - 20); // and always being run into
    });
    expect(df.ramT).toBe(0);
    expect(hitsOn(a, FW1).length).toBe(1);
    expect(foe.hp).toBe(maxHp(foe) - 80);
  });

  it('a second rival is hit as well, once', () => {
    const { a, df, foe } = charge();
    const second = a.put(MF1, -200 + 34, 0);
    a.ability(DF0);
    a.step(205);
    expect(hitsOn(a, FW1).length).toBe(1);
    expect(hitsOn(a, MF1).length).toBe(1);
    expect(df.ramHits).toBe((1 << FW1) | (1 << MF1));
    expect(foe.hp).toBe(maxHp(foe) - 80);
    expect(second.hp).toBe(maxHp(second) - 80);
    expect(df.dmgDealt).toBe(160);
  });

  it('a new charge can hit the same rival again', () => {
    const { a, df, foe } = charge();
    expect(ramInto(a, FW1)).toBeGreaterThan(0);
    a.until(() => df.ramT === 0, 300);
    a.step(10);
    // Line it up again and go.
    foe.s = df.s + 12;
    foe.d = df.d;
    foe.vd = 0;
    foe.heading = 0;
    a.clearLog();
    expect(ramInto(a, FW1)).toBeGreaterThan(0);
    expect(hitsOn(a, FW1).length).toBe(1);
    expect(foe.hp).toBe(maxHp(foe) - 160);
    expect(df.cells).toBe(1);
  });

  it('never hurts a team-mate: running into one is just a bump', () => {
    const { a, df, foe: mate } = charge(undefined, 12, MF0);
    a.ability(DF0);
    a.step(120);
    expect(a.events('hit').length).toBe(0);
    expect(mate.hp).toBe(maxHp(mate));
    expect(mate.act).toBe(ACT.NONE);
    expect(df.ramHits).toBe(0);
    expect(dist(df, mate)).toBeLessThan(40); // they did meet
  });

  it('needs closing speed: leaning on a rival is not ramming it', () => {
    // A charge that is barely quicker than the rival ahead, and no tow.
    const { a, df, foe } = charge({ ramMult: 1.01, tow: 0, ramSecs: 30 }, 8.5);
    a.ability(DF0);
    let touched = 0;
    a.step(400, () => {
      a.recenter([DF0, FW1]);
      if (dist(df, foe) < 8.01) touched++;
    });
    expect(touched).toBeGreaterThan(100);
    expect(a.race.rules.ramMult * a.pace - a.pace).toBeLessThan(RAM_MIN_CLOSING);
    expect(a.events('hit').length).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
    expect(df.ramHits).toBe(0); // not spent: the rival has not been rammed yet
    // Even the rival standing on the brakes does not make a ram of it: while
    // the two are touching, each tick's contact takes up the difference.
    a.inputs[FW1].throttle = 0;
    a.inputs[FW1].brake = 1;
    a.step(30);
    expect(a.events('hit').length).toBe(0);
    // Run into it from a gap, with real speed between them, and that is a ram.
    foe.s = df.s + 14;
    foe.vs = foe.speed = df.speed - 25;
    const n = a.until(() => a.events('hit').length > 0, 60);
    expect(n).toBeGreaterThan(0);
    expect(hitsOn(a, FW1)).toMatchObject([{ attack: ATK.DF_RAM, damage: 80 }]);
    expect(RAM_MIN_CLOSING).toBe(3);
  });

  it('cannot be parried, but a guard takes most of it', () => {
    /** The rival turns to face the charge and raises its guard `lead` ticks before contact (never, if negative). */
    const run = (lead: number, contact = -1) => {
      const { a, df, foe } = charge();
      a.tap(FW1, BTN.LOCK);
      expect(foe.target).toBe(DF0);
      a.step(24);
      const T = a.ability(DF0);
      const out = { a, df, foe, T, contact: -1 };
      for (let i = 0; i < 200; i++) {
        if (lead >= 0 && a.race.tick + 1 === contact - lead) a.hold(FW1, BTN.GUARD);
        a.step(1);
        if (a.events('hit').length || a.events('parry').length) {
          out.contact = a.race.tick;
          break;
        }
      }
      return out;
    };
    const plain = run(-1);
    expect(plain.contact).toBeGreaterThan(plain.T);
    expect(plain.a.events('hit')).toMatchObject([{ damage: 80, blocked: false }]);

    // The guard goes up three ticks before the same contact: a parry, for any ordinary blow.
    const guarded = run(3, plain.contact);
    expect(guarded.contact).toBe(plain.contact);
    expect(guarded.foe.guardT).toBeLessThanOrEqual(PARRY_WINDOW);
    expect(guarded.a.events('parry').length).toBe(0);
    const [hit] = guarded.a.events('hit');
    expect(hit).toMatchObject({ attacker: DF0, victim: FW1, attack: ATK.DF_RAM, blocked: true });
    expect(hit.damage).toBeCloseTo(80 * GUARD_REDUCTION, 9);
    expect(guarded.foe.hp).toBeCloseTo(maxHp(guarded.foe) - 80 * GUARD_REDUCTION, 9);
    expect(guarded.foe.guard).toBe(CLASSES[guarded.foe.role].guardMax - RAM.guardDamage);
    expect(guarded.foe.act).toBe(ACT.NONE);
    expect(guarded.df.act).toBe(ACT.NONE);
    // Braced, it is shoved a third as hard.
    expect(Math.abs(guarded.foe.vd)).toBeLessThan(Math.abs(plain.foe.vd) * 0.5);
    expect(RAM.noParry).toBe(true);
  });

  it('the rammer cannot be staggered or slowed by hits, though they still hurt', () => {
    const { a, df, foe } = charge(undefined, 40);
    a.ability(DF0);
    a.step(60);
    const v0 = df.speed;
    const hp0 = df.hp;
    foe.s = df.s - 8; // the rival is right behind it, landing blows
    foe.d = df.d;
    const blows = [ATK.MF_KICK, ATK.FW_LANCE, ATK.DF_HAMMER2, ATK.FW_SLASH1, ATK.MF_PULSE];
    let dealt = 0;
    for (const atk of blows) {
      a.race.tick++;
      expect(applyHit(a.race, TRACK, foe, df, ATTACKS[atk], atk)).toBe(true);
      dealt += ATTACKS[atk].damage;
      expect(df.act).toBe(ACT.NONE);
      expect(df.chain).toBe(0);
    }
    expect(df.hp).toBe(hp0 - dealt);
    expect(df.speed).toBeGreaterThanOrEqual(v0); // no hit-slow (only a nudge of knockback from behind)
    // The very same blows on a defender that is not charging stagger it and cost it pace.
    const b = charge(undefined, 40);
    b.a.step(61);
    b.foe.s = b.df.s - 8;
    const before = b.df.speed;
    applyHit(b.a.race, TRACK, b.foe, b.df, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(b.df.act).toBe(ACT.STAGGER);
    expect(b.df.speed).toBeLessThan(before);
  });

  it('a real fight: kicked mid-charge, the defender does not flinch', () => {
    const { a, df } = charge(undefined, 60);
    const mf = a.put(MF1, -190, 9); // a rival midfielder alongside
    a.tap(MF1, BTN.LOCK);
    a.step(12);
    a.ability(DF0);
    a.tap(MF1, BTN.Y);
    a.step(20);
    const kicks = hitsOn(a, DF0).filter((e) => e.attack === ATK.MF_KICK);
    expect(kicks.length).toBe(1);
    expect(df.act).toBe(ACT.NONE);
    expect(df.hp).toBe(maxHp(df) - ATTACKS[ATK.MF_KICK].damage);
    void mf;
  });

  it('the damage is rules.ramDamage', () => {
    for (const ramDamage of [200, 5, 0]) {
      const { a, foe } = charge({ ramDamage });
      expect(ramInto(a, FW1)).toBeGreaterThan(0);
      expect(hitsOn(a, FW1)).toMatchObject([{ attack: ATK.DF_RAM, damage: ramDamage }]);
      expect(foe.hp).toBe(maxHp(foe) - ramDamage);
      expect(foe.act).toBe(ACT.STAGGER); // thrown aside whatever the damage
    }
  });

  it('a knock-out by ram is the defender\'s, and it pays', () => {
    const { a, df, foe } = charge();
    foe.hp = 50;
    expect(ramInto(a, FW1)).toBeGreaterThan(0);
    expect(hitsOn(a, FW1)).toMatchObject([{ damage: 50 }]);
    expect(a.events('ko')).toMatchObject([{ mech: FW1, by: DF0 }]);
    expect(foe.retired).toBe(true);
    expect(df.kos).toBe(1);
    expect(koBonus(a.race, df)).toBe(a.race.rules.koPoints);
    // The wreck is no obstacle; the charge goes on.
    a.step(30);
    expect(df.ramT).toBeGreaterThan(0);
    expect(df.act).toBe(ACT.NONE);
  });

  it('thrown into the wall, the rival takes a splat on top, and that knock-out is credited too', () => {
    // Both hard against the right-hand wall: the only way to be thrown is into it.
    const a = new Arena(2);
    const df = giveCells(a.put(DF0, -200, 24));
    const foe = a.put(FW1, -188, 24.5);
    expect(ramInto(a, FW1)).toBeGreaterThan(0);
    const hitTick = a.race.tick;
    a.step(8, () => {
      expect(wallOvershoot(foe)).toBe(0);
      expect(wallOvershoot(df)).toBe(0);
    });
    const [splat] = a.events('splat');
    expect(splat.mech).toBe(FW1);
    expect(splat.tick).toBeGreaterThan(hitTick);
    expect(splat.damage).toBeGreaterThan(WALL_SPLAT_MIN * WALL_SPLAT_DAMAGE);
    expect(splat.damage).toBeCloseTo(a.race.rules.ringoutDamage + RAM_SHOVE * WALL_SPLAT_DAMAGE, -1);
    expect(splat.by).toBe(DF0);
    expect(foe.hp).toBeCloseTo(maxHp(foe) - 80 - splat.damage, 9);

    const b = new Arena(2);
    const df2 = giveCells(b.put(DF0, -200, 24));
    const foe2 = b.put(FW1, -188, 24.5);
    foe2.hp = 100; // survives the ram, not the wall
    expect(ramInto(b, FW1)).toBeGreaterThan(0);
    b.step(8);
    expect(b.events('ko')).toMatchObject([{ mech: FW1, by: DF0 }]);
    expect(df2.kos).toBe(1);
  });

  it('carries three times its weight in a collision (RAM_MASS)', () => {
    // Two defenders overlapping nose to tail at the same speed: with no ram
    // they are pushed apart evenly; ramming, the charger gives a quarter of
    // the ground and the other three quarters. (ramMult 1: no closing speed,
    // so this is the push alone, not a hit.)
    const split = (ramming: boolean) => {
      const a = new Arena(2, 1, { ramMult: 1, tow: 0 });
      const back = giveCells(a.put(DF0, -200, 0));
      const front = a.put(DF1, -195, 0);
      if (ramming) {
        a.ability(DF0);
        front.s = back.s + 5;
      } else {
        a.step(1);
        front.s = back.s + 5;
      }
      const s0 = [back.s, front.s];
      a.step(1);
      expect(a.events('hit').length).toBe(0);
      const moved = a.pace / 60;
      const backPush = s0[0] + moved - back.s;
      const frontPush = front.s - (s0[1] + moved);
      expect(backPush + frontPush).toBeCloseTo(3, 6); // the three units of overlap
      return frontPush / backPush;
    };
    expect(split(false)).toBeCloseTo(1, 6);
    expect(split(true)).toBeCloseTo(RAM_MASS, 6);
    expect(RAM_MASS).toBe(3);
  });

  it('against a shielded rival: reduced damage, no stagger, a light shove', () => {
    const { a, foe } = charge();
    foe.shieldT = 400;
    expect(ramInto(a, FW1)).toBeGreaterThan(0);
    expect(hitsOn(a, FW1)[0].damage).toBeCloseTo(80 * a.race.rules.aegisDamage, 9);
    expect(foe.act).toBe(ACT.NONE);
    expect(Math.abs(foe.vd)).toBeLessThan(RAM_SHOVE * 0.5);
  });

  it('a rival in its i-frames slips it for now: the charge is not used up, and lands the moment the dodge is over', () => {
    const { a, df, foe } = charge();
    const pin = () => {
      foe.s = df.s + 6.5; // overlapping, and always being run into
      foe.d = df.d;
      foe.vs = foe.speed = df.speed - 20;
    };
    a.ability(DF0);
    a.step(1);
    pin();
    foe.iframes = 30;
    let dodged = 0;
    let landedOn = -1;
    for (let i = 0; i < 60 && landedOn < 0; i++) {
      const left = foe.iframes; // (it counts down before contact is worked out)
      a.step(1);
      if (a.events('hit').length) landedOn = left;
      else {
        dodged++;
        // Slipped, not missed: no "evade", and the charge has not had its go.
        expect(df.ramHits).toBe(0);
        expect(foe.hp).toBe(maxHp(foe));
      }
      pin();
    }
    // In contact with real closing speed all the while...
    expect(a.events('bump').length).toBeGreaterThanOrEqual(dodged);
    expect(a.events('evade').length).toBe(0);
    // ...and hit on the tick the last i-frame ran out, not one before.
    expect(dodged).toBe(29);
    expect(landedOn).toBe(1);
    expect(hitsOn(a, FW1)).toMatchObject([{ attacker: DF0, attack: ATK.DF_RAM, damage: 80 }]);
    expect(df.ramHits).toBe(1 << FW1);
    expect(foe.hp).toBe(maxHp(foe) - 80);
    // Now it has had its go: the rest of the charge does nothing more to that rival.
    a.step(100, pin);
    expect(hitsOn(a, FW1).length).toBe(1);
  });

  it('a rival that dodges through the whole charge is never hit, and never "evades" it either', () => {
    const { a, df, foe } = charge();
    foe.iframes = 400;
    a.ability(DF0);
    a.step(215, () => {
      a.recenter([DF0, FW1]);
      foe.s = df.s + 6.5;
      foe.d = df.d;
      foe.vs = foe.speed = Math.max(0, df.speed - 20);
    });
    expect(df.ramT).toBe(0);
    expect(a.events('hit').length).toBe(0);
    expect(a.events('evade').length).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
    expect(df.ramHits).toBe(0);
  });

  /**
   * A charging defender and a rival forward overlapping at `bearing` (radians
   * off the defender's nose: 0 dead ahead, pi dead astern), closing on each
   * other along that line at 20 u/s, for one tick. ramMult 1, so the charge
   * is no quicker than the road and the geometry is exactly as set.
   */
  function contactAt(bearing: number) {
    const a = new Arena(2, 1, { ramMult: 1 });
    const df = giveCells(a.put(DF0, -200, 0));
    const foe = a.put(FW1, -260, 0);
    a.ability(DF0);
    a.step(1);
    const closing = 20;
    foe.s = df.s + 6.5 * Math.cos(bearing);
    foe.d = df.d + 6.5 * Math.sin(bearing);
    foe.vs = df.speed - closing * Math.cos(bearing);
    foe.vd = -closing * Math.sin(bearing);
    foe.speed = Math.hypot(foe.vs, foe.vd);
    foe.heading = Math.atan2(foe.vd, foe.vs);
    a.clearLog();
    a.step(1);
    // Real contact, with real closing speed, whichever way it came from.
    expect(a.events('bump').length).toBe(1);
    expect(a.events('bump')[0].intensity).toBeGreaterThan(RAM_MIN_CLOSING * 3);
    expect(df.facing).toBeCloseTo(0, 6);
    return { a, df, foe, hits: hitsOn(a, FW1).length };
  }

  it('the prow is at the front: only a rival within RAM_ARC of where the defender is facing is rammed', () => {
    expect(RAM_ARC).toBe(1.9); // a little more than abeam: 109 degrees either side of the nose
    expect(RAM_ARC).toBeGreaterThan(Math.PI / 2);
    expect(RAM_ARC).toBeLessThan(Math.PI);
    for (const side of [1, -1]) {
      for (const bearing of [0, 0.8, Math.PI / 2, RAM_ARC - 0.1]) {
        const { df, foe, hits } = contactAt(side * bearing);
        expect([bearing, hits]).toEqual([bearing, 1]);
        expect(df.ramHits).toBe(1 << FW1);
        expect(foe.hp).toBe(maxHp(foe) - 80);
        expect(foe.act).toBe(ACT.STAGGER);
      }
      for (const bearing of [RAM_ARC + 0.1, 2.5, Math.PI]) {
        const { df, foe, hits } = contactAt(side * bearing);
        expect([bearing, hits]).toEqual([bearing, 0]);
        expect(df.ramHits).toBe(0);
        expect(foe.hp).toBe(maxHp(foe));
        expect(foe.act).toBe(ACT.NONE);
        expect(df.hp).toBe(maxHp(df));
      }
    }
  });

  it('something that runs into the back of a ramming mech is not rammed, and the charge is not used up on it', () => {
    const { a, df, foe } = charge(undefined, 300);
    a.ability(DF0);
    a.step(1);
    // The rival comes up from behind, quicker than the charge, and runs into it.
    foe.s = df.s - 12;
    foe.d = df.d;
    const n = a.until(() => {
      foe.vs = foe.speed = df.speed + 25;
      return a.events('bump').length > 0;
    }, 60);
    expect(n).toBeGreaterThan(0);
    expect(a.events('bump')[0].intensity).toBeGreaterThan(RAM_MIN_CLOSING);
    expect(a.events('hit').length).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
    expect(foe.act).toBe(ACT.NONE);
    expect(df.ramHits).toBe(0);
    expect(df.ramT).toBeGreaterThan(0);
    // The same charge, the same rival, now in front of it: that is a ram.
    foe.s = df.s + 14;
    foe.d = df.d;
    foe.vd = 0;
    foe.heading = 0;
    foe.vs = foe.speed = df.speed - 25;
    const m = a.until(() => a.events('hit').length > 0, 60);
    expect(m).toBeGreaterThan(0);
    expect(hitsOn(a, FW1)).toMatchObject([{ attacker: DF0, attack: ATK.DF_RAM, damage: 80 }]);
    expect(df.ramHits).toBe(1 << FW1);
  });

  it('a locked rammer faces its target: it rams what it is looking at, wherever that is on the road', () => {
    // Charging, then locked on a rival that is BEHIND it: the defender turns
    // to face it, and the prow goes round with it.
    const { a, df, foe } = charge(undefined, -15);
    const other = a.put(MF1, -260, 0);
    a.ability(DF0);
    a.step(1);
    setTarget(a.race, df, FW1);
    a.step(40, () => {
      foe.s = df.s - 15;
    });
    expect(df.mode).toBe(MODE.BATTLE);
    expect(df.target).toBe(FW1);
    expect(Math.abs(df.facing)).toBeGreaterThan(3); // looking back down the road
    expect(df.ramT).toBeGreaterThan(0);
    // A second rival, ahead of it on the road but behind its back, runs into it: not a ram.
    other.s = df.s + 6.5;
    other.d = df.d;
    other.vs = other.speed = Math.max(0, df.vs - 20);
    a.clearLog();
    a.step(1);
    expect(a.events('bump').length).toBe(1);
    expect(a.events('hit').length).toBe(0);
    expect(df.ramHits).toBe(0);
    other.s = df.s + 300; // (out of the way)
    // The one it is facing runs into it from behind on the road: rammed.
    a.clearLog();
    const n = a.until(() => {
      foe.vs = foe.speed = df.vs + 30;
      return a.events('hit').length > 0;
    }, 60);
    expect(n).toBeGreaterThan(0);
    expect(a.events('hit')).toMatchObject([{ attacker: DF0, victim: FW1, attack: ATK.DF_RAM, damage: 80 }]);
    expect(df.ramHits).toBe(1 << FW1);
    expect(other.hp).toBe(maxHp(other));
  });

  it('two charging defenders nose to tail: the one behind rams the one ahead, which cannot ram what is behind it', () => {
    const a = new Arena(2);
    const back = giveCells(a.put(DF0, -200, 0));
    const front = giveCells(a.put(DF1, -188, 0));
    a.hold(DF0, BTN.ABILITY).hold(DF1, BTN.ABILITY).step(1);
    a.release(DF0, BTN.ABILITY).release(DF1, BTN.ABILITY);
    expect(back.ramT).toBeGreaterThan(0);
    expect(front.ramT).toBeGreaterThan(0);
    // The one ahead lifts a little so that they meet.
    a.inputs[DF1].throttle = 0.8;
    const n = a.until(() => a.events('hit').length >= 1, 200);
    expect(n).toBeGreaterThan(0);
    a.step(20);
    expect(a.events('hit')).toMatchObject([{ attacker: DF0, victim: DF1, attack: ATK.DF_RAM, damage: 80 }]);
    expect(back.ramHits).toBe(1 << DF1);
    expect(front.ramHits).toBe(0);
    expect(back.hp).toBe(maxHp(back));
    expect(front.hp).toBe(maxHp(front) - 80);
    // Mid-ram itself, the one that was hit is braced: hurt, not staggered.
    expect(back.act).toBe(ACT.NONE);
    expect(front.act).toBe(ACT.NONE);
  });

  /**
   * Two rival defenders, both charging, level with each other and steered
   * together, so that each has the other on its beam (inside RAM_ARC) when
   * they meet. `pre` idle ticks first shift the tick of contact by as many.
   */
  function sideOn(pre = 0, hp?: number) {
    const a = new Arena(2);
    a.step(pre);
    const left = giveCells(a.put(DF0, -200, -6));
    const right = giveCells(a.put(DF1, -200, 6));
    a.hold(DF0, BTN.ABILITY).hold(DF1, BTN.ABILITY).step(1);
    a.release(DF0, BTN.ABILITY).release(DF1, BTN.ABILITY);
    expect(left.ramT).toBeGreaterThan(0);
    expect(right.ramT).toBeGreaterThan(0);
    left.heading = 0.15;
    right.heading = -0.15;
    left.d = -6;
    right.d = 6;
    right.s = left.s;
    if (hp !== undefined) left.hp = right.hp = hp;
    a.clearLog();
    const n = a.until(() => a.events('hit').length > 0, 40);
    expect(n).toBeGreaterThan(0);
    return { a, left, right, hits: a.events('hit'), T: a.race.tick };
  }

  it('two charging defenders meeting side-on both take the hit, and neither is staggered', () => {
    const { a, left, right, hits } = sideOn();
    expect(hits.map((e) => [e.attacker, e.victim]).sort()).toEqual([
      [DF0, DF1],
      [DF1, DF0],
    ]);
    expect(hits.every((e) => e.attack === ATK.DF_RAM && e.damage === 80 && e.tick === hits[0].tick)).toBe(true);
    expect(left.act).toBe(ACT.NONE);
    expect(right.act).toBe(ACT.NONE);
    expect(left.hp).toBe(maxHp(left) - 80);
    expect(right.hp).toBe(maxHp(right) - 80);
    expect(left.ramHits).toBe(1 << DF1);
    expect(right.ramHits).toBe(1 << DF0);
    // Once each: they stay leaning on each other and nothing more comes of it.
    a.step(60);
    expect(a.events('hit').length).toBe(2);
  });

  it('when two rams meet, who lands first alternates tick by tick', () => {
    // Like every other trade of blows: the lower-numbered mech goes first on
    // an even tick, the other on an odd one.
    const order = (pre: number) => {
      const { hits, T } = sideOn(pre);
      expect(hits.length).toBe(2);
      expect(hits[0].tick).toBe(T);
      return { T, first: hits[0].attacker };
    };
    const runs = [0, 1, 2, 3].map(order);
    for (let i = 1; i < runs.length; i++) expect(runs[i].T).toBe(runs[i - 1].T + 1);
    for (const r of runs) expect([r.T, r.first]).toEqual([r.T, r.T % 2 === 0 ? DF0 : DF1]);
  });

  it('...which decides it when the first of the two blows is a knock-out', () => {
    // Both on their last legs: whoever lands first wrecks the other, and a wreck rams nobody.
    for (const pre of [0, 1, 2, 3]) {
      const { a, left, right, hits, T } = sideOn(pre, 50);
      const [winner, loser] = T % 2 === 0 ? [left, right] : [right, left];
      expect(hits).toMatchObject([{ attacker: winner.id, victim: loser.id, attack: ATK.DF_RAM, damage: 50 }]);
      expect(a.events('ko')).toMatchObject([{ mech: loser.id, by: winner.id }]);
      expect(loser.retired).toBe(true);
      expect(winner.retired).toBe(false);
      expect(winner.hp).toBe(50);
      expect(winner.kos).toBe(1);
      expect(loser.kos).toBe(0);
      // The wreck's charge ended with it.
      expect(loser.ramT).toBe(0);
      expect(winner.ramT).toBeGreaterThan(0);
    }
  });

  it('once the charge is over, contact is just contact', () => {
    const { a, df, foe } = charge(undefined, 300);
    a.ability(DF0);
    a.until(() => df.ramT === 0, 300);
    foe.s = df.s + 12;
    foe.d = df.d;
    a.inputs[FW1].throttle = 0.6;
    a.step(120);
    expect(a.events('bump').length).toBeGreaterThan(0);
    expect(a.events('hit').length).toBe(0);
    expect(foe.hp).toBe(maxHp(foe));
  });

  it('still counts if the defender has locked on since: it is the contact that matters', () => {
    const { a, df, foe } = charge();
    df.drive = 50;
    a.ability(DF0);
    a.step(1);
    a.tap(DF0, BTN.LOCK);
    expect(df.mode).toBe(MODE.BATTLE);
    // (In a lock the charge is no quicker than any other fight, and closing
    // on the target is done at a walk: it takes a dash to run into it, and
    // from close by, now that a dash down the road is held to the battle cap
    // plus a share of itself.)
    a.inputs[DF0].my = 1;
    a.step(20);
    expect(a.events('hit').length).toBe(0);
    expect(dist(df, foe)).toBeGreaterThan(9);
    a.tap(DF0, BTN.A);
    expect(a.events('dash').length).toBe(1);
    const n = a.until(() => a.events('hit').length > 0, 30);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(a.events('hit')).toMatchObject([{ attacker: DF0, victim: FW1, attack: ATK.DF_RAM, damage: 80 }]);
    expect(foe.act).toBe(ACT.STAGGER);
    expect(df.mode).toBe(MODE.BATTLE);
  });

  it('wrecks and finishers are not rammed', () => {
    const { a, df, foe } = charge();
    retire(a.race, foe, null);
    a.ability(DF0);
    a.step(100, () => {
      foe.s = df.s + 6;
      foe.d = df.d;
    });
    expect(a.events('hit').length).toBe(0);
    expect(a.events('bump').length).toBe(0);
    expect(df.ramHits).toBe(0);
  });

  it('the length and the speed are rules', () => {
    const a = new Arena(2, 1, { ramSecs: 1, ramMult: 1.4 });
    const df = giveCells(a.put(DF0, -200, 0));
    a.ability(DF0);
    expect(df.ramT).toBe(60);
    expect(speedCap(a.race, df, CLASSES[df.role])).toBeCloseTo(a.pace * 1.4, 9);
  });

  it('the same button in a lock is the Aegis, not a Ram', () => {
    const { a, df } = charge(undefined, 25);
    a.tap(DF0, BTN.LOCK);
    a.step(1);
    a.ability(DF0);
    expect(a.events('ability')).toMatchObject([{ ability: ABILITY.AEGIS }]);
    expect(df.ramT).toBe(0);
    expect(df.shieldT).toBeGreaterThan(0);
  });
});

// =============================================================================
// AEGIS
// =============================================================================

describe('Aegis', () => {
  /** A defender locked on a rival ahead, a forward of its own team close by. */
  function wall(rules?: Partial<Rules>) {
    const a = new Arena(2, 1, rules);
    const df = giveCells(a.put(DF0, -200, 0));
    const foe = a.put(FW1, -170, 8);
    const fw = a.put(FW0, -190, -10);
    a.tap(DF0, BTN.LOCK);
    expect(df.target).toBe(FW1);
    a.step(2);
    a.clearLog();
    return { a, df, foe, fw };
  }

  /** Shield length on the tick it is raised: a mech the sim updates after the defender has already counted one tick off. */
  const fresh = (t: number, secs: number) => t === ticks(secs) || t === ticks(secs) - 1;

  it('shields the defender and every team-mate within rules.aegisRange for rules.aegisSecs', () => {
    const { a, df, foe, fw } = wall();
    const range = a.race.rules.aegisRange;
    const farMate = a.put(MF0, df.s - a.base + 50, 0);
    const nearFoe = a.put(MF1, df.s - a.base - 5, 12);
    expect(dist(df, fw)).toBeLessThan(range);
    expect(dist(df, farMate)).toBeGreaterThan(range);
    expect(abilityFor(df)).toBe(ABILITY.AEGIS);
    const T = a.ability(DF0);
    expect(a.events('ability')).toEqual([{ type: 'ability', mech: DF0, ability: ABILITY.AEGIS, tick: T }]);
    expect(df.shieldT).toBe(ticks(a.race.rules.aegisSecs));
    expect(df.shieldT).toBe(240);
    expect(fresh(fw.shieldT, a.race.rules.aegisSecs)).toBe(true);
    // Not the team-mate out of range, and never a rival, however close.
    expect(farMate.shieldT).toBe(0);
    expect(foe.shieldT).toBe(0);
    expect(nearFoe.shieldT).toBe(0);
    expect(df.cells).toBe(2);
    // The lock is kept: this is a move for the middle of a fight.
    expect(df.target).toBe(FW1);
    expect(df.mode).toBe(MODE.BATTLE);
  });

  it('the range is centre to centre: just inside is covered, just outside is not', () => {
    const range = DEFAULT_RULES.aegisRange;
    const at = (ahead: number) => {
      const { a, df } = wall();
      const mate = a.put(MF0, df.s - a.base + ahead, 0);
      a.ability(DF0);
      void df;
      return mate.shieldT > 0;
    };
    expect(at(range - 0.5)).toBe(true);
    expect(at(-(range - 0.5))).toBe(true);
    expect(at(range + 0.5)).toBe(false);
    expect(at(-(range + 0.5))).toBe(false);
  });

  it('lasts exactly its time and then drops', () => {
    const { a, df, fw } = wall();
    a.ability(DF0);
    a.step(239);
    expect(df.shieldT).toBe(1);
    expect(fw.shieldT).toBeLessThanOrEqual(1);
    a.step(1);
    expect(df.shieldT).toBe(0);
    expect(fw.shieldT).toBe(0);
  });

  it('cuts damage to rules.aegisDamage, and the shielded mech is neither staggered nor slowed', () => {
    const { a, df, foe, fw } = wall();
    a.ability(DF0);
    const mult = a.race.rules.aegisDamage;
    expect(mult).toBe(0.35);
    foe.s = fw.s - 8; // the rival is right behind the shielded forward
    foe.d = fw.d;
    const blows = [ATK.FW_SLASH1, ATK.MF_KICK, ATK.FW_LANCE, ATK.DF_HAMMER2, ATK.MF_PULSE];
    let hp = fw.hp;
    for (const atk of blows) {
      const v0 = fw.speed;
      a.race.tick++;
      a.race.events.length = 0;
      expect(applyHit(a.race, TRACK, foe, fw, ATTACKS[atk], atk)).toBe(true);
      const [hit] = a.race.events.filter((e) => e.type === 'hit');
      expect(hit.type === 'hit' && hit.damage).toBeCloseTo(ATTACKS[atk].damage * mult, 9);
      hp -= ATTACKS[atk].damage * mult;
      expect(fw.hp).toBeCloseTo(hp, 9);
      expect(fw.act).toBe(ACT.NONE);
      expect(fw.chain).toBe(0);
      // No hit-slow; only a third of the knockback (from behind, mostly swallowed).
      expect(fw.speed).toBeGreaterThanOrEqual(v0);
      expect(fw.speed).toBeLessThan(v0 + ATTACKS[atk].knockback * 0.3 * 0.25 + 1e-6);
    }
    // The defender itself is covered the same way.
    const hp0 = df.hp;
    applyHit(a.race, TRACK, foe, df, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(df.hp).toBeCloseTo(hp0 - ATTACKS[ATK.MF_KICK].damage * mult, 9);
    expect(df.act).toBe(ACT.NONE);
  });

  it('the same blows without the shield stagger and slow, for comparison', () => {
    const { a, foe, fw } = wall();
    foe.s = fw.s - 8;
    foe.d = fw.d;
    const v0 = fw.speed;
    applyHit(a.race, TRACK, foe, fw, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(fw.hp).toBe(maxHp(fw) - ATTACKS[ATK.MF_KICK].damage);
    expect(fw.act).toBe(ACT.STAGGER);
    expect(fw.speed).toBeLessThan(v0 + ATTACKS[ATK.MF_KICK].knockback * 0.25);
    expect(fw.chain).toBe(1);
  });

  it('a real attack on a shielded mech: the Edge string lands for a third and never staggers', () => {
    const { a, foe, fw } = wall();
    a.ability(DF0);
    foe.s = fw.s - 9;
    foe.d = fw.d;
    a.clearLog();
    a.tap(FW1, BTN.X);
    a.step(2);
    a.tap(FW1, BTN.X);
    a.step(12);
    a.tap(FW1, BTN.X);
    a.step(60, () => expect(fw.act).toBe(ACT.NONE));
    const hits = hitsOn(a, FW0);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    for (const e of hits) expect(e.damage).toBeCloseTo(ATTACKS[e.attack].damage * a.race.rules.aegisDamage, 9);
    expect(a.events('escape').length).toBe(0);
  });

  it('stacks with a guard: both reductions apply, and a broken guard under a shield is no stagger', () => {
    const { a, df, foe } = wall();
    a.step(22); // facing the rival
    a.ability(DF0);
    a.hold(DF0, BTN.GUARD).step(20);
    expect(df.guarding).toBe(true);
    const hp = df.hp;
    a.race.tick++;
    applyHit(a.race, TRACK, foe, df, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(hp - df.hp).toBeCloseTo(ATTACKS[ATK.MF_KICK].damage * a.race.rules.aegisDamage * GUARD_REDUCTION, 9);
    // The guard-breaker: the guard goes, the mech stands.
    a.race.events.length = 0;
    a.race.tick++;
    applyHit(a.race, TRACK, foe, df, ATTACKS[ATK.DF_HAMMER2], ATK.DF_HAMMER2);
    expect(a.race.events.map((e) => e.type)).toContain('guardBreak');
    expect(df.act).toBe(ACT.NONE);
  });

  it('a shielded mech cannot be splatted against the wall (it is never staggered)', () => {
    const a = new Arena(2);
    const df = giveCells(a.put(DF0, -200, 10));
    const fw = a.put(FW0, -190, 24.5); // against the right-hand wall
    const foe = a.put(MF1, -190, 16.5); // a rival alongside, on the inside
    a.put(FW1, -160, 0);
    a.tap(DF0, BTN.LOCK);
    a.tap(MF1, BTN.LOCK);
    expect(foe.target).toBe(FW0);
    a.step(12);
    a.ability(DF0);
    expect(fw.shieldT).toBeGreaterThan(0);
    a.clearLog();
    a.tap(MF1, BTN.Y); // Stun Kick, straight at the wall
    a.step(30);
    expect(hitsOn(a, FW0).length).toBe(1);
    expect(a.events('splat').length).toBe(0);
    expect(fw.hp).toBeCloseTo(maxHp(fw) - ATTACKS[ATK.MF_KICK].damage * a.race.rules.aegisDamage, 9);
    void df;
  });

  it('does not make anyone immortal', () => {
    const { a, foe, fw } = wall();
    a.ability(DF0);
    fw.hp = 5;
    foe.s = fw.s - 8;
    foe.d = fw.d;
    a.race.events.length = 0;
    applyHit(a.race, TRACK, foe, fw, ATTACKS[ATK.FW_LANCE], ATK.FW_LANCE);
    expect(fw.retired).toBe(true);
    expect(foe.kos).toBe(1);
  });

  it('wrecks and finishers get no shield, and a second Aegis tops the time back up', () => {
    const { a, df, foe, fw } = wall();
    const wreck = a.put(MF0, df.s - a.base - 10, 8);
    retire(a.race, wreck, null);
    a.ability(DF0);
    expect(wreck.shieldT).toBe(0);
    a.step(100, () => {
      foe.s = df.s + 30; // keep the lock in range
      fw.s = df.s + 10;
    });
    expect(df.shieldT).toBe(140);
    a.ability(DF0);
    expect(df.shieldT).toBe(240); // back to full, not 380
    expect(fresh(fw.shieldT, a.race.rules.aegisSecs)).toBe(true);
    expect(df.cells).toBe(1);
  });

  it('a longer shield already running is not cut short by a shorter one', () => {
    const { a, df, fw } = wall({ aegisSecs: 1 });
    fw.shieldT = 500;
    a.ability(DF0);
    expect(df.shieldT).toBe(60);
    expect(fw.shieldT).toBeGreaterThanOrEqual(499);
  });

  it('locked on a team-mate (escorting), it is the same move', () => {
    const a = new Arena(2);
    const df = giveCells(a.put(DF0, -200, 0));
    const fw = a.put(FW0, -180, 6);
    a.tap(DF0, BTN.ALLY);
    expect(df.target).toBe(FW0);
    a.step(1);
    a.ability(DF0);
    expect(a.events('ability')).toMatchObject([{ ability: ABILITY.AEGIS }]);
    expect(df.shieldT).toBeGreaterThan(0);
    expect(fw.shieldT).toBeGreaterThan(0);
  });

  it('with nobody else about it still shields the defender', () => {
    const a = new Arena(2);
    const df = giveCells(a.put(DF0, -200, 0));
    a.put(FW1, -170, 8);
    a.tap(DF0, BTN.LOCK);
    a.step(1);
    a.ability(DF0);
    expect(df.shieldT).toBe(240);
    expect(a.race.mechs.filter((m) => m.shieldT > 0).map((m) => m.id)).toEqual([DF0]);
  });

  it('the length, the reach and the strength are rules', () => {
    const { a, df, foe, fw } = wall({ aegisSecs: 1.5, aegisRange: 8, aegisDamage: 0 });
    a.ability(DF0);
    expect(df.shieldT).toBe(90);
    expect(fw.shieldT).toBe(0); // 14 away, out of an 8 unit reach
    // aegisDamage 0: blows land (and are reported) for nothing.
    const hp = df.hp;
    a.race.events.length = 0;
    expect(applyHit(a.race, TRACK, foe, df, ATTACKS[ATK.FW_LANCE], ATK.FW_LANCE)).toBe(true);
    expect(df.hp).toBe(hp);
    expect(a.race.events.filter((e) => e.type === 'hit')).toMatchObject([{ damage: 0 }]);

    // aegisDamage 1: full damage, but still no stagger.
    const b = wall({ aegisDamage: 1 });
    b.a.ability(DF0);
    const hp1 = b.df.hp;
    applyHit(b.a.race, TRACK, b.foe, b.df, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(b.df.hp).toBe(hp1 - ATTACKS[ATK.MF_KICK].damage);
    expect(b.df.act).toBe(ACT.NONE);

    const wide = wall({ aegisRange: 200 });
    const farMate = wide.a.put(MF0, wide.df.s - wide.a.base + 150, 0);
    wide.a.ability(DF0);
    expect(farMate.shieldT).toBeGreaterThan(0);
  });
});

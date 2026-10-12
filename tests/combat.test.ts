import { describe, expect, it } from 'vitest';
import {
  ACT,
  ATK,
  ATTACKS,
  BTN,
  CHAIN_LIMIT,
  CHAIN_TICKS,
  CLASSES,
  COMBO_CANCEL_DELAY,
  COUNTER_HIT,
  DASH_COOLDOWN,
  DASH_TICKS,
  DRIVE_PER_DAMAGE_DEALT,
  DRIVE_PER_DAMAGE_TAKEN,
  DT,
  ESCAPE_IFRAMES,
  GUARD_ARC,
  GUARD_BREAK_STAGGER,
  GUARD_REDUCTION,
  GUARD_REGEN_DELAY,
  HIT_SLOW_PER_DAMAGE,
  MODE,
  PARRY_STAGGER,
  PARRY_WINDOW,
  PHASE,
  WALL_SPLAT_DAMAGE,
  WALL_SPLAT_MIN,
  attackTotal,
  pointsFor,
  stepRace,
  weaponsFree,
  wrapAngle,
} from '../src/sim/index';
import type { AttackDef, MechState } from '../src/sim/index';
import { applyHit, setStagger } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK, dist, newRace, runCountdown, wallLimit } from './helpers';

const L = TRACK.length;

/** Centre-to-centre distance at which a melee move reaches. */
function meleeRange(att: MechState, vic: MechState, a: AttackDef): number {
  return a.reach + CLASSES[att.role].radius + CLASSES[vic.role].radius;
}

/**
 * Drive every pilot in a fight scenario arrives with. The default rules start
 * the gauge empty (rules.driveStart is 0), and an empty gauge would refuse the
 * Lance and the dash before the thing under test ever happened.
 */
const FIGHT_DRIVE = 35;

/** A battle-lap (by default) arena whose pilots all have FIGHT_DRIVE in the gauge. */
function arena(lapPhase: 1 | 2 | 3 = 2): Arena {
  const a = new Arena(lapPhase, 1, { driveStart: FIGHT_DRIVE });
  for (const m of a.race.mechs) expect(m.drive).toBe(FIGHT_DRIVE);
  return a;
}

/** Attacker `gap` units behind the victim on the Grand Straight, both at pace. */
function duel(attId: number, vicId: number, gap: number, lapPhase: 1 | 2 | 3 = 2) {
  const a = arena(lapPhase);
  const att = a.put(attId, 300, 0);
  const vic = a.put(vicId, 300 + gap, 0);
  return { a, att, vic };
}

/**
 * Like `duel`, but the victim has locked on to the attacker and turned to
 * face it, which is what guarding and dashing need.
 */
function faceOff(attId: number, vicId: number, gap: number) {
  const d = duel(attId, vicId, gap);
  d.a.tap(vicId, BTN.LOCK);
  d.a.step(24); // FACE_RATE needs 16 ticks for the half turn
  expect(d.vic.target).toBe(attId);
  expect(Math.abs(wrapAngle(d.vic.facing - Math.PI))).toBeLessThan(1e-6);
  d.a.clearLog();
  return d;
}

describe('weapons lock', () => {
  it('weaponsFree is false in the countdown, on lap 1 and after the flag', () => {
    const race = newRace(1, { laps: 1 });
    expect(weaponsFree(race)).toBe(false);
    runCountdown(race);
    expect(race.phase).toBe(PHASE.RACING);
    expect(weaponsFree(race)).toBe(false);
    race.lapPhase = 2;
    expect(weaponsFree(race)).toBe(true);
    race.lapPhase = 3;
    expect(weaponsFree(race)).toBe(true);
    race.phase = PHASE.FINISHED;
    expect(weaponsFree(race)).toBe(false);
  });

  it('no attack of any class can start on the formation lap', () => {
    for (const [attId, gap] of [[FW0, 9], [MF0, 9], [DF0, 10]] as const) {
      const { a, att, vic } = duel(attId, FW1, gap, 1);
      const drive0 = att.drive;
      for (const btn of [BTN.X, BTN.Y, BTN.X | BTN.Y]) {
        a.tap(attId, btn);
        expect(att.act).toBe(ACT.NONE);
        a.step(35);
      }
      // Mash both for two seconds for good measure.
      for (let i = 0; i < 60; i++) {
        a.tap(attId, i % 2 ? BTN.X : BTN.Y);
        a.step(1);
      }
      expect(a.events('windup').length).toBe(0);
      expect(a.events('swing').length).toBe(0);
      expect(a.events('shot').length).toBe(0);
      expect(a.events('hit').length).toBe(0);
      // Not even the automatic lock that normally comes with a melee press.
      expect(a.events('lock').length).toBe(0);
      expect(att.target).toBe(-1);
      const denied = a.events('denied');
      expect(denied.length).toBeGreaterThan(2);
      expect(denied.every((e) => e.mech === attId && e.reason === 'weapons')).toBe(true);
      expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
      expect(att.dmgDealt).toBe(0);
      expect(a.race.projectiles.length).toBe(0);
      // No Drive was charged for the refused moves.
      expect(att.drive).toBeGreaterThanOrEqual(drive0);
      expect(a.race.lapPhase).toBe(1);
    }
  });

  it('the "denied" cue is not repeated more than twice a second', () => {
    const { a } = duel(FW0, FW1, 9, 1);
    for (let i = 0; i < 30; i++) {
      a.tap(FW0, BTN.X);
      a.step(1);
    }
    expect(a.events('denied').length).toBe(2);
  });

  it('the very same press works once the battle lap is on', () => {
    const { a, vic } = duel(FW0, FW1, 9, 2);
    a.tap(FW0, BTN.X);
    a.step(10);
    expect(a.events('hit').length).toBe(1);
    expect(vic.hp).toBeLessThan(CLASSES[vic.role].maxHp);
  });
});

describe('melee attacks: range, timing and damage', () => {
  const moves = [
    { name: 'Forward primary (Edge)', att: FW0, btn: BTN.X, atk: ATK.FW_SLASH1, damage: 20, heavy: false },
    { name: 'Forward secondary (Lance Dash)', att: FW0, btn: BTN.Y, atk: ATK.FW_LANCE, damage: 56, heavy: true },
    { name: 'Midfielder secondary (Stun Kick)', att: MF0, btn: BTN.Y, atk: ATK.MF_KICK, damage: 34, heavy: true },
    { name: 'Defender primary (Breaker)', att: DF0, btn: BTN.X, atk: ATK.DF_HAMMER1, damage: 36, heavy: false },
  ];

  for (const mv of moves) {
    const def = ATTACKS[mv.atk];

    it(`${mv.name} connects inside its reach for ${mv.damage}`, () => {
      expect(def.damage).toBe(mv.damage);
      expect(def.kind).toBe('melee');
      const probe = duel(mv.att, FW1, 10);
      const gap = meleeRange(probe.att, probe.vic, def) - 1;
      const { a, att, vic } = duel(mv.att, FW1, gap);
      const hp0 = vic.hp;
      const T = a.tap(mv.att, mv.btn);
      // Pressing attack beside an enemy takes the lock for you.
      expect(att.target).toBe(FW1);
      expect(att.mode).toBe(MODE.BATTLE);
      expect(att.act).toBe(ACT.ATTACK);
      expect(att.attack).toBe(mv.atk);
      a.step(def.windup + def.active + 2);
      expect(a.events('windup')).toEqual([{ type: 'windup', mech: mv.att, attack: mv.atk, charged: false, tick: T }]);
      expect(a.events('swing')).toEqual([{ type: 'swing', mech: mv.att, attack: mv.atk, tick: T + def.windup + 1 }]);
      const hits = a.events('hit');
      expect(hits.length).toBe(1);
      expect(hits[0]).toMatchObject({ attacker: mv.att, victim: FW1, attack: mv.atk, damage: mv.damage, blocked: false, heavy: mv.heavy });
      // The blow lands on the first active frame.
      expect(hits[0].tick).toBe(T + def.windup + 1);
      expect(vic.hp).toBe(hp0 - mv.damage);
      expect(att.dmgDealt).toBe(mv.damage);
      expect(vic.dmgTaken).toBe(mv.damage);
      expect(vic.lastHitBy).toBe(mv.att);
      expect(vic.act).toBe(ACT.STAGGER);
      expect(att.hp).toBe(CLASSES[att.role].maxHp);
    });

    it(`${mv.name} whiffs when the target is out of reach`, () => {
      const probe = duel(mv.att, FW1, 10);
      const gap = meleeRange(probe.att, probe.vic, def) + 15;
      const { a, att, vic } = duel(mv.att, FW1, gap);
      const T = a.tap(mv.att, mv.btn);
      a.step(attackTotal(def) + 2);
      expect(a.events('swing').length).toBe(1);
      expect(a.events('hit').length).toBe(0);
      expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
      expect(att.attackHit).toBe(false);
      expect(att.act).toBe(ACT.NONE);
      expect(att.dmgDealt).toBe(0);
      expect(T).toBeGreaterThan(0);
    });

    it(`${mv.name} hits exactly when the target is inside reach and arc on an active frame`, () => {
      // Sweep the starting gap through the edge of the move's reach. On
      // every active frame, work out from the positions the sim will see
      // whether the blow can land, and require the sim to agree.
      let hitRuns = 0;
      let missRuns = 0;
      for (let gap = 7.5; gap <= 32; gap += 0.5) {
        const { a, att, vic } = duel(mv.att, FW1, gap);
        a.tap(mv.att, mv.btn);
        let expectedHitTick = -1;
        for (let i = 0; i < attackTotal(def) + 1; i++) {
          const active = att.act === ACT.ATTACK && att.actT >= def.windup && att.actT < def.windup + def.active;
          if (active && expectedHitTick < 0) {
            const ds = vic.s - att.s;
            const dd = vic.d - att.d;
            const inReach = Math.hypot(ds, dd) <= meleeRange(att, vic, def);
            const inArc = Math.abs(wrapAngle(Math.atan2(dd, ds) - att.facing)) <= def.arc;
            if (inReach && inArc) expectedHitTick = a.race.tick + 1;
          }
          a.step(1);
        }
        const hits = a.events('hit');
        if (expectedHitTick < 0) {
          expect(hits.length).toBe(0);
          missRuns++;
        } else {
          expect(hits.length).toBe(1);
          expect(hits[0].tick).toBe(expectedHitTick);
          expect(hits[0].damage).toBe(mv.damage);
          hitRuns++;
        }
      }
      expect(hitRuns).toBeGreaterThan(5);
      expect(missRuns).toBeGreaterThan(5);
    });
  }

  it('melee needs a target: with no enemy near, the press is refused', () => {
    const a = arena(2);
    const att = a.put(FW0, 300, 0);
    a.put(FW1, 300 + 60, 0); // beyond the automatic lock
    a.put(MF0, 310, 5); // a team-mate close by is not a target
    a.tap(FW0, BTN.X);
    expect(att.act).toBe(ACT.NONE);
    expect(a.events('denied').map((e) => e.reason)).toEqual(['target']);
    expect(a.events('windup').length).toBe(0);
  });

  it('an attack locked on an ally retargets the nearest enemy', () => {
    const a = arena(2);
    const att = a.put(FW0, 300, 0);
    a.put(MF0, 320, 8);
    const foe = a.put(FW1, 309, 0);
    a.tap(FW0, BTN.ALLY);
    expect(att.target).toBe(MF0);
    a.step(1);
    a.tap(FW0, BTN.X);
    expect(att.target).toBe(FW1);
    a.step(8);
    expect(a.events('hit').map((e) => e.victim)).toEqual([FW1]);
    expect(foe.hp).toBe(CLASSES[foe.role].maxHp - 20);
    expect(a.mech(MF0).hp).toBe(CLASSES[a.mech(MF0).role].maxHp);
  });

  it('a hit costs the victim pace and feeds both Drive gauges', () => {
    // Side by side, so that neither is in the other's slipstream.
    const a = arena(2);
    const att = a.put(FW0, 300, -4);
    const vic = a.put(FW1, 300, 4);
    a.tap(FW0, BTN.LOCK);
    a.step(12);
    const before = { att: att.drive, vic: vic.drive };
    a.tap(FW0, BTN.X);
    a.step(6);
    expect(a.events('hit').length).toBe(1);
    const ticks = 7;
    const passive = a.race.rules.drivePassive; // the battle-lap trickle, for both
    expect(att.drive - before.att).toBeCloseTo(20 * DRIVE_PER_DAMAGE_DEALT + ticks * passive * DT, 6);
    expect(vic.drive - before.vic).toBeCloseTo(20 * DRIVE_PER_DAMAGE_TAKEN + ticks * passive * DT, 6);
    expect(vic.speed).toBeLessThan(a.pace * (1 - 20 * HIT_SLOW_PER_DAMAGE) + 1e-6);

    // The slow-down itself, on its own: 20 damage takes 5% off.
    const b = duel(FW0, FW1, 8);
    applyHit(b.a.race, TRACK, b.att, b.vic, ATTACKS[ATK.FW_SLASH1], ATK.FW_SLASH1);
    expect(b.vic.speed).toBeCloseTo(Math.hypot(b.a.pace + 0.1 * 8, 0) * (1 - 20 * HIT_SLOW_PER_DAMAGE), 9);
  });

  it('a mech cannot act while staggered', () => {
    const { a, vic } = duel(FW0, MF1, 10);
    a.tap(FW0, BTN.X);
    a.until(() => vic.act === ACT.STAGGER, 20);
    expect(vic.act).toBe(ACT.STAGGER);
    a.clearLog();
    for (const btn of [BTN.X, BTN.Y, BTN.LOCK, BTN.A, BTN.GUARD]) {
      a.tap(MF1, btn);
      expect(vic.act).toBe(ACT.STAGGER);
    }
    expect(a.events('windup').filter((e) => e.mech === MF1).length).toBe(0);
    expect(a.events('lock').filter((e) => e.mech === MF1).length).toBe(0);
    expect(vic.guarding).toBe(false);
    // It recovers after the stagger runs out.
    expect(a.until(() => vic.act === ACT.NONE, 40)).toBeGreaterThan(0);
  });
});

describe('combos', () => {
  const s1 = ATTACKS[ATK.FW_SLASH1];
  const s2 = ATTACKS[ATK.FW_SLASH2];
  const s3 = ATTACKS[ATK.FW_SLASH3];
  const cancel1 = s1.windup + s1.active + COMBO_CANCEL_DELAY;
  const cancel2 = s2.windup + s2.active + COMBO_CANCEL_DELAY;

  it('the Edge string advances only when X is pressed again: 20, 22, 40', () => {
    const { a, att, vic } = duel(FW0, FW1, 10);
    const T = a.tap(FW0, BTN.X);
    a.step(2);
    a.tap(FW0, BTN.X); // during the first wind-up: buffered
    a.step(12);
    a.tap(FW0, BTN.X); // during the second swing
    a.until(() => att.act === ACT.NONE, 120);
    expect(a.events('windup').map((e) => [e.attack, e.tick])).toEqual([
      [ATK.FW_SLASH1, T],
      [ATK.FW_SLASH2, T + cancel1],
      [ATK.FW_SLASH3, T + cancel1 + cancel2],
    ]);
    expect(a.events('hit').map((e) => [e.attack, e.damage, e.heavy, e.tick])).toEqual([
      [ATK.FW_SLASH1, 20, false, T + s1.windup + 1],
      [ATK.FW_SLASH2, 22, false, T + cancel1 + s2.windup + 1],
      [ATK.FW_SLASH3, 40, true, T + cancel1 + cancel2 + s3.windup + 1],
    ]);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 82);
    expect(a.race.tick).toBe(T + cancel1 + cancel2 + attackTotal(s3));
  });

  it('one press is one swing', () => {
    const { a, att } = duel(FW0, FW1, 10);
    const T = a.tap(FW0, BTN.X);
    a.until(() => att.act === ACT.NONE, 60);
    expect(a.race.tick).toBe(T + attackTotal(s1));
    a.step(30);
    expect(a.events('windup').length).toBe(1);
    expect(a.events('hit').map((e) => e.damage)).toEqual([20]);
  });

  it('holding X down is still one swing', () => {
    const { a, att } = duel(FW0, FW1, 10);
    a.hold(FW0, BTN.X);
    a.step(120);
    expect(a.events('windup').length).toBe(1);
    expect(a.events('hit').length).toBe(1);
    expect(att.act).toBe(ACT.NONE);
  });

  it('two presses stop after the second swing', () => {
    const { a, att, vic } = duel(FW0, FW1, 10);
    a.tap(FW0, BTN.X);
    a.step(2);
    a.tap(FW0, BTN.X);
    a.until(() => att.act === ACT.NONE, 120);
    a.step(30);
    expect(a.events('windup').map((e) => e.attack)).toEqual([ATK.FW_SLASH1, ATK.FW_SLASH2]);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 42);
  });

  it('the secondary button never advances a combo, and the finisher has no follow-up', () => {
    const { a, att } = duel(FW0, FW1, 10);
    a.tap(FW0, BTN.X);
    a.step(2);
    a.tap(FW0, BTN.Y);
    a.until(() => att.act === ACT.NONE, 60);
    expect(a.events('windup').map((e) => e.attack)).toEqual([ATK.FW_SLASH1]);
    expect(ATTACKS[ATK.FW_SLASH3].next).toBe(-1);
    expect(ATTACKS[ATK.DF_HAMMER2].next).toBe(-1);
  });

  it('the Breaker chains into the Slam for 36 then 54', () => {
    const h1 = ATTACKS[ATK.DF_HAMMER1];
    const h2 = ATTACKS[ATK.DF_HAMMER2];
    const { a, att, vic } = duel(DF0, FW1, 12);
    const T = a.tap(DF0, BTN.X);
    a.step(4);
    a.tap(DF0, BTN.X);
    a.until(() => att.act === ACT.NONE, 150);
    const second = T + h1.windup + h1.active + COMBO_CANCEL_DELAY;
    expect(a.events('hit').map((e) => [e.attack, e.damage, e.heavy, e.tick])).toEqual([
      [ATK.DF_HAMMER1, 36, false, T + h1.windup + 1],
      [ATK.DF_HAMMER2, 54, true, second + h2.windup + 1],
    ]);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 90);
  });
});

describe('shots and projectiles', () => {
  const burst = ATTACKS[ATK.MF_BURST];
  const scatter = ATTACKS[ATK.DF_SCATTER];

  it('Midfielder primary (Carbine) fires three rounds that hit for 6 each', () => {
    const { a, att, vic } = duel(MF0, FW1, 30);
    const T = a.tap(MF0, BTN.X);
    // Guns need no lock.
    expect(att.target).toBe(-1);
    expect(att.mode).toBe(MODE.SPEED);
    a.step(40);
    const shots = a.events('shot');
    expect(shots.map((e) => e.tick)).toEqual([0, 1, 2].map((k) => T + burst.windup + 1 + k * burst.shot!.interval));
    expect(shots.every((e) => e.mech === MF0 && e.attack === ATK.MF_BURST)).toBe(true);
    expect(new Set(shots.map((e) => e.proj)).size).toBe(3);
    const hits = a.events('hit');
    expect(hits.map((e) => e.damage)).toEqual([6, 6, 6]);
    expect(hits.every((e) => e.attacker === MF0 && e.victim === FW1 && !e.blocked && !e.heavy)).toBe(true);
    expect(a.events('projEnd').map((e) => e.hit)).toEqual([true, true, true]);
    expect(a.events('projEnd').map((e) => e.proj).sort()).toEqual(shots.map((e) => e.proj).sort());
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 18);
    expect(a.race.projectiles.length).toBe(0);
  });

  it('a burst at nothing flies its range and expires', () => {
    const { a, vic } = duel(MF0, FW1, 110);
    const T = a.tap(MF0, BTN.X);
    a.step(60);
    expect(a.events('shot').length).toBe(3);
    expect(a.events('hit').length).toBe(0);
    const ends = a.events('projEnd');
    expect(ends.map((e) => e.hit)).toEqual([false, false, false]);
    const life = Math.ceil((burst.shot!.range / burst.shot!.speed) * 60);
    expect(ends[0].tick).toBe(T + burst.windup + 1 + life - 1);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
    expect(a.race.projectiles.length).toBe(0);
  });

  it('an enemy beside the muzzle, outside the sights, is missed', () => {
    const a = arena(2);
    a.put(MF0, 300, 0);
    const vic = a.put(FW1, 320, 16); // about 39 degrees off the nose; the sights cover 23
    a.tap(MF0, BTN.X);
    a.step(60);
    expect(a.events('shot').length).toBe(3);
    expect(a.events('hit').length).toBe(0);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
  });

  it('a locked gunner leads a target that is off the nose', () => {
    const a = arena(2);
    a.put(MF0, 300, 0);
    const vic = a.put(FW1, 320, 16);
    a.tap(MF0, BTN.LOCK);
    a.step(10);
    a.tap(MF0, BTN.X);
    a.step(60);
    expect(a.events('hit').length).toBe(3);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 18);
  });

  it('rounds that leave the road are removed', () => {
    const a = arena(2);
    a.put(MF0, 300, 0);
    a.race.projectiles.push({ id: 900, owner: MF0, team: 0, attack: ATK.MF_BURST, charged: false, s: a.base + 300, d: 26, h: 0, vs: a.pace, vd: 240, life: 30 });
    a.step(1);
    expect(a.events('projEnd')).toMatchObject([{ proj: 900, hit: false }]);
    expect(a.race.projectiles.length).toBe(0);
  });

  it('there is no friendly fire: rounds pass through team-mates', () => {
    const a = arena(2);
    a.put(MF0, 300, 0);
    const mate = a.put(FW0, 320, 0);
    const foe = a.put(FW1, 345, 0);
    a.tap(MF0, BTN.X);
    a.step(50);
    expect(a.events('hit').map((e) => e.victim)).toEqual([FW1, FW1, FW1]);
    expect(mate.hp).toBe(CLASSES[mate.role].maxHp);
    expect(foe.hp).toBe(CLASSES[foe.role].maxHp - 18);
  });

  it('Defender secondary (Scatter Cannon) fires six pellets at once, 6 damage each', () => {
    const { a, vic } = duel(DF0, FW1, 15);
    const T = a.tap(DF0, BTN.Y);
    a.step(30);
    const shots = a.events('shot');
    expect(shots.length).toBe(scatter.shot!.pellets);
    expect(shots.every((e) => e.tick === T + scatter.windup + 1 && e.attack === ATK.DF_SCATTER)).toBe(true);
    const hits = a.events('hit');
    expect(hits.length).toBeGreaterThanOrEqual(CHAIN_LIMIT);
    expect(hits.length).toBeLessThanOrEqual(6);
    expect(hits.every((e) => e.damage === 6 && e.heavy && e.victim === FW1)).toBe(true);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 6 * hits.length);
    expect(a.events('projEnd').length).toBe(6);
  });

  // OPEN QUESTION (see report): every pellet is its own hit for the stagger
  // chain. A point-blank Scatter Cannon is six hits on one tick, so the
  // fifth pellet trips the victim's CHAIN_LIMIT escape and the sixth is
  // evaded: the full blast does 30, not 36, and hands the victim 50 ticks of
  // invulnerability. That may or may not be what "chain limit" is meant to do.
  it('a point-blank Scatter Cannon lands all six pellets (36 damage)', () => {
    const { a, vic } = duel(DF0, FW1, 15);
    a.tap(DF0, BTN.Y);
    a.step(30);
    expect(a.events('hit').length).toBe(6);
    expect(a.events('escape').length).toBe(0);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 36);
  });

  it('the scatter pattern is too short-ranged to reach a distant target', () => {
    const { a, vic } = duel(DF0, FW1, 60);
    a.tap(DF0, BTN.Y);
    a.step(40);
    expect(a.events('shot').length).toBe(6);
    expect(a.events('hit').length).toBe(0);
    expect(a.events('projEnd').every((e) => !e.hit)).toBe(true);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
  });
});

describe('drive costs and cooldowns', () => {
  it('only the Lance Dash costs Drive: 12, taken when it starts', () => {
    // (The ability moves in the table cost a Cell, never Drive.)
    for (const a of ATTACKS) expect(a.driveCost).toBe(a.key === 'fw_lance' ? 12 : 0);
    const { a, att } = duel(FW0, FW1, 11);
    const { drivePassive, driveDraft } = a.race.rules;
    att.drive = 30;
    a.tap(FW0, BTN.Y);
    // (One tick of trickle and of slipstream charge came in as well.)
    expect(att.drafting).toBe(true);
    expect(att.drive).toBeCloseTo(30 - 12 + (drivePassive + driveDraft) * DT, 9);
  });

  it('the Lance is refused, and nothing is charged, without 12 Drive', () => {
    const { a, att, vic } = duel(FW0, FW1, 11);
    att.drive = 11.5;
    a.tap(FW0, BTN.Y);
    expect(att.act).toBe(ACT.NONE);
    expect(a.events('denied').map((e) => e.reason)).toEqual(['drive']);
    expect(att.drive).toBeCloseTo(11.5 + (a.race.rules.drivePassive + a.race.rules.driveDraft) * DT, 9);
    a.step(40);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
    // The primary is free and still works.
    a.tap(FW0, BTN.X);
    expect(att.act).toBe(ACT.ATTACK);
  });

  const cooled = [
    { name: 'Lance Dash', att: FW0, btn: BTN.Y, atk: ATK.FW_LANCE, cd: 120, gap: 11 },
    { name: 'Carbine', att: MF0, btn: BTN.X, atk: ATK.MF_BURST, cd: 40, gap: 30 },
    { name: 'Stun Kick', att: MF0, btn: BTN.Y, atk: ATK.MF_KICK, cd: 55, gap: 11 },
    { name: 'Scatter Cannon', att: DF0, btn: BTN.Y, atk: ATK.DF_SCATTER, cd: 160, gap: 15 },
  ];
  for (const mv of cooled) {
    it(`${mv.name} cannot be used again for ${mv.cd} ticks after it ends`, () => {
      const def = ATTACKS[mv.atk];
      expect(def.cooldown).toBe(mv.cd);
      /** Use the move, then press again on tick `end + offset`. Did it start? */
      const retry = (offset: number): boolean => {
        const { a, att, vic } = duel(mv.att, FW1, mv.gap);
        att.drive = 100;
        const T = a.tap(mv.att, mv.btn);
        const end = T + attackTotal(def);
        a.until(() => att.act === ACT.NONE, 200);
        expect(a.race.tick).toBe(end);
        a.step(offset - 1);
        // Keep the target in front for the retry, whatever the first use did to it.
        vic.s = att.s + mv.gap;
        vic.d = att.d;
        a.clearLog();
        expect(a.tap(mv.att, mv.btn)).toBe(end + offset);
        // A cooldown is silent: it is not a "denied".
        expect(a.events('denied').length).toBe(0);
        return a.events('windup').length === 1;
      };
      expect(retry(1)).toBe(false);
      expect(retry(Math.floor(mv.cd / 2))).toBe(false);
      expect(retry(mv.cd - 1)).toBe(false);
      expect(retry(mv.cd)).toBe(true);
    });
  }

  // OPEN QUESTION (see report): the cooldown is only written when a move
  // runs to its natural end. If the pilot is staggered out of it (or
  // escapes, or finishes) nothing is recorded, so being hit refunds the
  // cooldown: here a Scatter Cannon (200 ticks) is back 47 ticks after the
  // first shot because a kick landed during its recovery.
  it('a move interrupted after it has fired still goes on cooldown', () => {
    const a = arena(2);
    const df = a.put(DF0, 300, 0);
    const foe = a.put(FW1, 315, 0);
    a.put(MF1, 300, 9); // an enemy alongside the defender
    a.tap(MF1, BTN.LOCK);
    a.step(12);
    a.tap(DF0, BTN.Y); // pellets leave 14 ticks later
    a.step(4);
    a.tap(MF1, BTN.Y); // the kick lands just after they do
    a.step(20);
    expect(a.events('shot').length).toBe(6);
    expect(df.act).toBe(ACT.STAGGER);
    a.until(() => df.act === ACT.NONE, 100);
    expect(df.cdSecondary).toBeGreaterThan(100);
    foe.s = df.s + 15;
    a.step(1);
    a.clearLog();
    a.tap(DF0, BTN.Y);
    expect(a.events('windup').length).toBe(0);
  });

  it('the two slots cool down independently, and chains without a cooldown repeat freely', () => {
    const { a, att, vic } = duel(MF0, FW1, 11);
    a.tap(MF0, BTN.Y); // kick
    a.until(() => att.act === ACT.NONE, 100);
    expect(att.cdSecondary).toBe(ATTACKS[ATK.MF_KICK].cooldown);
    expect(att.cdPrimary).toBe(0);
    vic.s = att.s + 25;
    a.step(1);
    a.clearLog();
    a.tap(MF0, BTN.X); // carbine is ready
    expect(a.events('windup').map((e) => e.attack)).toEqual([ATK.MF_BURST]);

    const f = duel(FW0, FW1, 10);
    f.a.tap(FW0, BTN.X);
    f.a.until(() => f.att.act === ACT.NONE, 60);
    f.a.step(1);
    f.a.tap(FW0, BTN.X);
    expect(f.a.events('windup').length).toBe(2);
  });
});

describe('guard', () => {
  it('only exists in battle mode: an unlocked pilot holding guard takes it all', () => {
    const { a, vic } = duel(FW0, FW1, 10);
    a.hold(FW1, BTN.GUARD).step(20);
    expect(vic.guarding).toBe(false);
    a.tap(FW0, BTN.X);
    a.step(8);
    expect(a.events('hit')).toMatchObject([{ damage: 20, blocked: false }]);
  });

  it('a held guard cuts frontal damage to GUARD_REDUCTION and drains the gauge instead', () => {
    const slash = ATTACKS[ATK.FW_SLASH1];
    const { a, vic } = faceOff(FW0, FW1, 10);
    a.hold(FW1, BTN.GUARD).step(20);
    expect(vic.guarding).toBe(true);
    const guard0 = vic.guard;
    expect(guard0).toBe(CLASSES[vic.role].guardMax);
    a.tap(FW0, BTN.X);
    a.step(8);
    expect(a.events('hit')).toMatchObject([{ attacker: FW0, victim: FW1, damage: 20 * GUARD_REDUCTION, blocked: true }]);
    expect(vic.hp).toBeCloseTo(CLASSES[vic.role].maxHp - 20 * GUARD_REDUCTION, 9);
    expect(vic.guard).toBe(guard0 - slash.guardDamage);
    expect(slash.guardDamage).toBe(8);
    // A block is not a stagger: the guard stays up.
    expect(vic.act).toBe(ACT.NONE);
    expect(vic.guarding).toBe(true);
    expect(vic.chain).toBe(0);
    expect(a.events('parry').length).toBe(0);
    expect(a.events('guardBreak').length).toBe(0);
  });

  it('blocks a whole Edge string, each hit taking its guard damage', () => {
    const { a, att, vic } = faceOff(FW0, FW1, 10);
    a.hold(FW1, BTN.GUARD).step(20);
    a.tap(FW0, BTN.X);
    a.step(2);
    a.tap(FW0, BTN.X);
    a.step(12);
    a.tap(FW0, BTN.X);
    a.until(() => att.act === ACT.NONE, 120);
    const hits = a.events('hit');
    expect(hits.map((e) => e.blocked)).toEqual([true, true, true]);
    expect(hits.map((e) => e.damage)).toEqual([20, 22, 40].map((d) => d * GUARD_REDUCTION));
    expect(vic.guard).toBe(80 - 8 - 9 - 16);
    expect(vic.hp).toBeCloseTo(CLASSES[vic.role].maxHp - 82 * GUARD_REDUCTION, 9);
  });

  it('does nothing against a blow from behind', () => {
    // The victim guards facing an enemy ahead of it; the attacker is behind.
    const a = arena(2);
    a.put(FW0, 300, 0);
    const vic = a.put(FW1, 310, 0);
    a.put(MF0, 340, 0);
    a.tap(FW1, BTN.LOCK);
    expect(vic.target).toBe(MF0);
    a.step(10);
    a.hold(FW1, BTN.GUARD).step(20);
    expect(vic.guarding).toBe(true);
    expect(Math.abs(vic.facing)).toBeLessThan(Math.PI - GUARD_ARC);
    a.tap(FW0, BTN.X);
    a.step(8);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, damage: 20, blocked: false }]);
    expect(vic.guard).toBe(CLASSES[vic.role].guardMax);
    expect(vic.act).toBe(ACT.STAGGER);
    expect(vic.guarding).toBe(false);
  });

  it('breaks when the gauge runs out: 60% damage, a long stagger, gauge back to 40%', () => {
    const { a, vic } = faceOff(FW0, FW1, 10);
    a.hold(FW1, BTN.GUARD).step(20);
    vic.guard = 5;
    a.tap(FW0, BTN.X);
    a.step(6);
    expect(a.events('guardBreak')).toMatchObject([{ mech: FW1, by: FW0 }]);
    expect(a.events('hit')).toMatchObject([{ damage: 20 * 0.6, blocked: false }]);
    expect(vic.guard).toBeCloseTo(CLASSES[vic.role].guardMax * 0.4, 9);
    expect(vic.act).toBe(ACT.STAGGER);
    expect(vic.actDur).toBe(GUARD_BREAK_STAGGER);
    expect(vic.guarding).toBe(false);
    // Holding the button through the stagger does not bring the guard back early.
    a.step(GUARD_BREAK_STAGGER - 10);
    expect(vic.guarding).toBe(false);
    expect(vic.act).toBe(ACT.STAGGER);
  });

  it('the Breaker Slam breaks any guard outright, however full the gauge', () => {
    const { a, vic } = faceOff(DF0, FW1, 12);
    a.hold(FW1, BTN.GUARD).step(20);
    a.tap(DF0, BTN.X);
    a.step(4);
    a.tap(DF0, BTN.X);
    a.step(60);
    const hits = a.events('hit');
    expect(hits.map((e) => [e.attack, e.blocked])).toEqual([
      [ATK.DF_HAMMER1, true],
      [ATK.DF_HAMMER2, false],
    ]);
    expect(hits[0].damage).toBeCloseTo(36 * GUARD_REDUCTION, 9);
    expect(hits[1].damage).toBeCloseTo(54 * 0.6, 9);
    expect(a.events('guardBreak')).toMatchObject([{ mech: FW1, by: DF0, tick: hits[1].tick }]);
    expect(vic.guard).toBeLessThanOrEqual(CLASSES[vic.role].guardMax * 0.4 + 1);
    expect(ATTACKS[ATK.DF_HAMMER2].guardBreak).toBe(true);
    expect(ATTACKS.filter((x) => x.guardBreak).length).toBe(1);
  });

  it('the gauge refills only after GUARD_REGEN_DELAY ticks with the guard down', () => {
    const { a, vic } = faceOff(FW0, FW1, 10);
    const c = CLASSES[vic.role];
    a.hold(FW1, BTN.GUARD).step(20);
    a.tap(FW0, BTN.X);
    a.step(8);
    const drained = vic.guard;
    expect(drained).toBeLessThan(c.guardMax);
    a.step(120); // still holding: no regeneration
    expect(vic.guard).toBe(drained);
    a.release(FW1, BTN.GUARD);
    a.step(GUARD_REGEN_DELAY);
    expect(vic.guard).toBe(drained);
    a.step(10);
    expect(vic.guard).toBeCloseTo(drained + 10 * c.guardRegen * DT, 9);
    a.step(120);
    expect(vic.guard).toBe(c.guardMax);
  });

  it('starting an attack drops the guard', () => {
    const { a, vic } = faceOff(FW0, FW1, 10);
    a.hold(FW1, BTN.GUARD).step(5);
    expect(vic.guarding).toBe(true);
    a.tap(FW1, BTN.X);
    expect(vic.act).toBe(ACT.ATTACK);
    expect(vic.guarding).toBe(false);
    a.step(3);
    expect(vic.guarding).toBe(false);
  });

  it('halves movement while it is up', () => {
    const free = faceOff(FW0, FW1, 30);
    free.a.inputs[FW1].mx = 1;
    free.a.step(40);
    const guarded = faceOff(FW0, FW1, 30);
    guarded.a.hold(FW1, BTN.GUARD);
    guarded.a.inputs[FW1].mx = 1;
    guarded.a.step(40);
    // Strafing circles the target, so the sideways speed is the class
    // strafe speed (scaled by rules.battleMove, like all movement around a
    // lock) times how square-on the target still is.
    const strafe = CLASSES[free.vic.role].strafe * free.a.race.rules.battleMove;
    expect(free.a.race.rules.battleMove).toBeGreaterThan(0);
    const squareOn = (d: { att: MechState; vic: MechState }) => Math.abs(d.att.s - d.vic.s) / dist(d.att, d.vic);
    expect(Math.abs(free.vic.vd) / squareOn(free)).toBeGreaterThan(strafe * 0.95);
    expect(Math.abs(free.vic.vd) / squareOn(free)).toBeLessThan(strafe * 1.05);
    expect(Math.abs(guarded.vic.vd) / squareOn(guarded)).toBeGreaterThan(strafe * 0.5 * 0.95);
    expect(Math.abs(guarded.vic.vd) / squareOn(guarded)).toBeLessThan(strafe * 0.5 * 1.05);
    expect(Math.abs(guarded.vic.d)).toBeGreaterThan(1);
    expect(Math.abs(guarded.vic.d)).toBeLessThan(Math.abs(free.vic.d) * 0.75);
  });
});

describe('parry', () => {
  const slash = ATTACKS[ATK.FW_SLASH1];

  it('a guard raised just before a melee hit turns it: no damage, attacker staggered', () => {
    const { a, att, vic } = faceOff(FW0, FW1, 10);
    const drive0 = vic.drive;
    const tick0 = a.race.tick;
    const T = a.tap(FW0, BTN.X);
    const hitTick = T + slash.windup + 1;
    a.step(hitTick - 3 - 1 - a.race.tick);
    a.hold(FW1, BTN.GUARD); // goes up 3 ticks before the blow
    a.step(4);
    expect(a.race.tick).toBe(hitTick);
    expect(a.events('parry')).toEqual([{ type: 'parry', mech: FW1, attacker: FW0, tick: hitTick }]);
    expect(a.events('hit').length).toBe(0);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
    expect(vic.guard).toBe(CLASSES[vic.role].guardMax);
    expect(att.act).toBe(ACT.STAGGER);
    expect(att.actDur).toBe(PARRY_STAGGER);
    expect(vic.drive - drive0).toBeCloseTo(12 + (hitTick - tick0) * a.race.rules.drivePassive * DT, 6);
    // The attacker's string is over; the defender is free to answer.
    a.step(20);
    expect(att.act).toBe(ACT.STAGGER);
    expect(a.events('hit').length).toBe(0);
  });

  it('works for a guard raised up to PARRY_WINDOW ticks ahead; earlier is just a block', () => {
    // The Breaker's 14-tick wind-up leaves room to try the whole window.
    const hammer = ATTACKS[ATK.DF_HAMMER1];
    const outcome = (lead: number): string => {
      const { a } = faceOff(DF0, FW1, 12);
      const T = a.tap(DF0, BTN.X);
      const hitTick = T + hammer.windup + 1;
      a.step(hitTick - lead - 1 - a.race.tick);
      a.hold(FW1, BTN.GUARD); // the guard goes up `lead` ticks before the blow
      a.step(hitTick - a.race.tick);
      if (a.events('parry').length) return 'parry';
      const hits = a.events('hit');
      return hits.length === 1 && hits[0].blocked ? 'block' : 'hit';
    };
    expect(outcome(1)).toBe('parry');
    expect(outcome(4)).toBe('parry');
    expect(outcome(PARRY_WINDOW)).toBe('parry');
    // (PARRY_WINDOW + 1 is a parry or a block depending on which of the two
    // pilots the sim happens to update first that tick.)
    expect(outcome(PARRY_WINDOW + 2)).toBe('block');
    expect(outcome(hammer.windup)).toBe('block');
    expect(slash.windup + 1).toBeLessThanOrEqual(PARRY_WINDOW);
  });

  it('a guard that has been up for a while blocks instead', () => {
    const { a, att } = faceOff(FW0, FW1, 10);
    a.hold(FW1, BTN.GUARD).step(PARRY_WINDOW + 4);
    a.tap(FW0, BTN.X);
    a.step(8);
    expect(a.events('parry').length).toBe(0);
    expect(a.events('hit')).toMatchObject([{ blocked: true }]);
    expect(att.act).toBe(ACT.ATTACK);
  });

  it('applyHit: the window is guardT <= PARRY_WINDOW, melee only, never a guard-breaker', () => {
    const run = (guardT: number, atk: number) => {
      const { a, att, vic } = faceOff(FW0, FW1, 8);
      vic.guarding = true;
      vic.guardT = guardT;
      applyHit(a.race, TRACK, att, vic, ATTACKS[atk], atk);
      return a.race.events.map((e) => e.type);
    };
    expect(run(0, ATK.FW_SLASH1)).toContain('parry');
    expect(run(PARRY_WINDOW, ATK.FW_SLASH1)).toContain('parry');
    expect(run(PARRY_WINDOW + 1, ATK.FW_SLASH1)).not.toContain('parry');
    expect(run(PARRY_WINDOW + 1, ATK.FW_SLASH1)).toContain('hit');
    // Heavy and armoured moves can be parried too...
    expect(run(0, ATK.FW_LANCE)).toContain('parry');
    // ...but not the guard-breaker, and not bullets.
    expect(run(0, ATK.DF_HAMMER2)).toEqual(expect.arrayContaining(['guardBreak', 'hit']));
    expect(run(0, ATK.DF_HAMMER2)).not.toContain('parry');
    expect(run(0, ATK.MF_BURST)).not.toContain('parry');
    expect(run(0, ATK.DF_SCATTER)).not.toContain('parry');
  });

  it('carbine fire into a fresh guard is blocked, not parried', () => {
    const { a, vic } = faceOff(MF0, FW1, 30);
    const T = a.tap(MF0, BTN.X);
    a.step(T + 10 - a.race.tick);
    a.hold(FW1, BTN.GUARD);
    a.step(30);
    expect(a.events('parry').length).toBe(0);
    const hits = a.events('hit');
    expect(hits.length).toBe(3);
    expect(hits.every((e) => e.blocked)).toBe(true);
    expect(vic.hp).toBeCloseTo(CLASSES[vic.role].maxHp - 3 * 6 * GUARD_REDUCTION, 9);
    expect(vic.guard).toBe(CLASSES[vic.role].guardMax - 3 * ATTACKS[ATK.MF_BURST].guardDamage);
  });
});

describe('dash', () => {
  it('needs a lock: in speed mode the same button is the boost', () => {
    const { a, att } = duel(FW0, FW1, 20);
    a.tap(FW0, BTN.A);
    expect(a.events('dash').length).toBe(0);
    expect(a.events('boost').length).toBe(1);
    expect(att.act).toBe(ACT.NONE);
  });

  it('costs the class dash price, grants its i-frames and goes on cooldown', () => {
    for (const id of [FW0, MF0, DF0]) {
      /** Dash, then press again `offset` ticks later. How many dashes happened? */
      const dashTwice = (offset: number): number => {
        const a = arena(2);
        const me = a.put(id, 300, 0);
        a.put(FW1, 330, 0);
        const c = CLASSES[me.role];
        a.tap(id, BTN.LOCK);
        a.step(2);
        me.drive = 50;
        const T = a.tap(id, BTN.A);
        expect(a.events('dash')).toEqual([{ type: 'dash', mech: id, tick: T }]);
        // (One tick of trickle came in as well, and of slipstream charge for
        // the heavier frames, whose shorter hop back leaves them in the tow.)
        const { drivePassive, driveDraft } = a.race.rules;
        expect(me.drive).toBeCloseTo(50 - c.dashCost + (drivePassive + (me.drafting ? driveDraft : 0)) * DT, 9);
        expect(me.act).toBe(ACT.DASH);
        expect(me.iframes).toBe(c.dashIframes);
        expect(me.cdDash).toBe(DASH_COOLDOWN);
        a.step(DASH_TICKS);
        expect(me.act).toBe(ACT.NONE);
        expect(me.iframes).toBe(Math.max(0, c.dashIframes - DASH_TICKS));
        a.step(offset - 1 - DASH_TICKS);
        expect(a.tap(id, BTN.A)).toBe(T + offset);
        return a.events('dash').length;
      };
      expect(dashTwice(DASH_TICKS + 1)).toBe(1);
      expect(dashTwice(DASH_COOLDOWN - 1)).toBe(1);
      expect(dashTwice(DASH_COOLDOWN)).toBe(2);
    }
    expect(CLASSES.map((c) => c.dashCost)).toEqual([10, 15, 18]);
    expect(CLASSES.map((c) => c.dashIframes)).toEqual([13, 10, 8]);
  });

  it('is refused without the Drive for it', () => {
    const a = arena(2);
    const me = a.put(DF0, 300, 0);
    a.put(FW1, 330, 0);
    a.tap(DF0, BTN.LOCK);
    me.drive = CLASSES[me.role].dashCost - 1;
    a.tap(DF0, BTN.A);
    expect(a.events('dash').length).toBe(0);
    expect(a.events('denied').map((e) => e.reason)).toEqual(['drive']);
    expect(me.act).toBe(ACT.NONE);
  });

  it('goes where the stick points, relative to the target; no stick hops straight back', () => {
    const run = (mx: number, my: number) => {
      const a = arena(2);
      const me = a.put(FW0, 300, 0);
      const foe = a.put(FW1, 330, 0);
      a.tap(FW0, BTN.LOCK);
      a.step(2);
      const gap0 = foe.s - me.s;
      a.inputs[FW0].mx = mx;
      a.inputs[FW0].my = my;
      a.tap(FW0, BTN.A);
      a.inputs[FW0].mx = a.inputs[FW0].my = 0;
      a.step(8);
      return { closed: gap0 - (foe.s - me.s), side: me.d };
    };
    const toward = run(0, 1);
    const away = run(0, -1);
    const neutral = run(0, 0);
    const right = run(1, 0);
    const left = run(-1, 0);
    expect(toward.closed).toBeGreaterThan(3);
    expect(away.closed).toBeLessThan(-5);
    expect(neutral.closed).toBeCloseTo(away.closed, 6);
    expect(right.side).toBeGreaterThan(5);
    expect(left.side).toBeLessThan(-5);
    expect(Math.abs(toward.side)).toBeLessThan(1e-6);
  });

  it('i-frames carry the pilot through a hit that would have landed', () => {
    const slash = ATTACKS[ATK.FW_SLASH1];
    const { a, att, vic } = faceOff(FW0, FW1, 10);
    const T = a.tap(FW0, BTN.X);
    a.step(2);
    a.inputs[FW1].my = 1; // dash INTO the attacker, so it is the i-frames and not the distance
    a.tap(FW1, BTN.A);
    a.inputs[FW1].my = 0;
    expect(vic.iframes).toBe(CLASSES[vic.role].dashIframes);
    a.step(T + slash.windup + 1 - a.race.tick);
    expect(dist(att, vic)).toBeLessThan(meleeRange(att, vic, slash));
    expect(a.events('evade')).toEqual([{ type: 'evade', mech: FW1, tick: T + slash.windup + 1 }]);
    a.step(10);
    expect(a.events('hit').length).toBe(0);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
    expect(vic.act === ACT.STAGGER).toBe(false);
    // The swing is spent on the evade.
    expect(att.attackHit).toBe(true);
  });

  it('the same dash made too early does not save you', () => {
    const { a, vic } = faceOff(FW0, FW1, 10);
    a.inputs[FW1].my = 1;
    a.tap(FW1, BTN.A);
    a.inputs[FW1].my = 0;
    a.step(CLASSES[vic.role].dashIframes + 2); // i-frames gone
    expect(vic.iframes).toBe(0);
    a.tap(FW0, BTN.X);
    a.step(8);
    expect(a.events('evade').length).toBe(0);
    expect(a.events('hit')).toMatchObject([{ victim: FW1, damage: 20 }]);
  });

  it('i-frames stop bullets too (the round is spent)', () => {
    const { a, vic } = faceOff(MF0, FW1, 30);
    vic.iframes = 60;
    a.tap(MF0, BTN.X);
    a.step(40);
    expect(a.events('evade').length).toBe(3);
    expect(a.events('hit').length).toBe(0);
    expect(a.events('projEnd').length).toBe(3);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp);
  });
});

describe('counter hits and armour', () => {
  it('catching an enemy in its wind-up does COUNTER_HIT damage and stops its attack', () => {
    const { a, att, vic } = duel(FW0, MF1, 10);
    a.hold(FW0, BTN.X).hold(MF1, BTN.Y).step(1); // both commit on the same tick
    a.release(FW0, BTN.X).release(MF1, BTN.Y);
    expect(vic.act).toBe(ACT.ATTACK);
    expect(vic.attack).toBe(ATK.MF_KICK);
    a.step(30);
    // The Edge (wind-up 5) beats the kick (wind-up 9).
    expect(a.events('hit')).toMatchObject([{ attacker: FW0, victim: MF1, damage: 20 * COUNTER_HIT }]);
    expect(att.hp).toBe(CLASSES[att.role].maxHp);
    expect(vic.hp).toBeCloseTo(CLASSES[vic.role].maxHp - 20 * COUNTER_HIT, 9);
  });

  it('an armoured wind-up shrugs off a light hit (damage, but no stagger) and swings through', () => {
    const { a, att, vic } = duel(FW0, DF1, 10);
    a.hold(FW0, BTN.X).hold(DF1, BTN.X).step(1);
    a.release(FW0, BTN.X).release(DF1, BTN.X);
    a.step(7);
    expect(a.events('hit')).toMatchObject([{ attacker: FW0, victim: DF1, damage: 20 * COUNTER_HIT }]);
    expect(vic.act).toBe(ACT.ATTACK); // still coming
    expect(vic.chain).toBe(0);
    a.step(12);
    const hits = a.events('hit');
    expect(hits.length).toBe(2);
    expect(hits[1]).toMatchObject({ attacker: DF1, victim: FW0, attack: ATK.DF_HAMMER1, damage: 36 });
    expect(att.act).toBe(ACT.STAGGER);
  });

  it('a heavy hit goes straight through armour', () => {
    const { a, vic } = duel(FW0, DF1, 11);
    // Lance (heavy, 15 wind-up) v a Breaker (14) thrown three ticks later, so
    // the lance lands while the Breaker's armour is up.
    a.hold(FW0, BTN.Y).step(1);
    a.release(FW0, BTN.Y).step(2);
    a.hold(DF1, BTN.X).step(1);
    a.release(DF1, BTN.X);
    a.step(40);
    const hits = a.events('hit');
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ attacker: FW0, victim: DF1, heavy: true });
    expect(hits[0].damage).toBeCloseTo(56 * COUNTER_HIT, 9);
    expect(vic.attackHit).toBe(false);
    expect(ATTACKS.filter((x) => x.armor).map((x) => x.key).sort()).toEqual(['df_hammer1', 'df_hammer2', 'df_scatter', 'fw_lance']);
  });

  it('in an even trade the first swing alternates between the teams tick by tick', () => {
    // Both forwards face each other and press on the same tick. Only one
    // blow can land (it staggers the other pilot); who gets it must not
    // depend on the team, only on the parity of the tick.
    const winner = (delay: number): number => {
      const a = arena(2);
      a.put(FW0, 300, 0);
      a.put(FW1, 309, 0);
      a.tap(FW0, BTN.LOCK);
      a.tap(FW1, BTN.LOCK);
      a.step(24 + delay);
      a.clearLog();
      a.hold(FW0, BTN.X).hold(FW1, BTN.X).step(1);
      a.release(FW0, BTN.X).release(FW1, BTN.X);
      a.step(10);
      const hits = a.events('hit');
      expect(hits.length).toBe(1);
      return hits[0].attacker;
    };
    const w0 = winner(0);
    const w1 = winner(1);
    expect([w0, w1].sort()).toEqual([FW0, FW1]);
    expect(winner(2)).toBe(w0);
    expect(winner(3)).toBe(w1);
  });
});

describe('stagger chains', () => {
  it('applyHit: CHAIN_LIMIT hits stagger, the next one sets the victim free', () => {
    const { a, att, vic } = duel(FW0, FW1, 8);
    const slash = ATTACKS[ATK.FW_SLASH1];
    a.race.events.length = 0;
    const staggers: number[] = [];
    for (let i = 1; i <= CHAIN_LIMIT; i++) {
      vic.act = ACT.NONE; // as if the last stagger had just run out
      a.race.tick++; // hits on the same tick count once (a scatter blast is one hit)
      expect(applyHit(a.race, TRACK, att, vic, slash, ATK.FW_SLASH1)).toBe(true);
      expect(vic.act).toBe(ACT.STAGGER);
      expect(vic.chain).toBe(i);
      staggers.push(vic.actDur);
    }
    // Each stagger in a chain is 12% shorter than the one before.
    expect(staggers).toEqual([0, 1, 2, 3].map((n) => Math.max(4, Math.round(slash.stagger * Math.pow(0.88, n)))));
    expect(staggers[0]).toBe(slash.stagger);
    expect(staggers[3]).toBeLessThan(staggers[0]);
    expect(a.race.events.filter((e) => e.type === 'escape').length).toBe(0);
    // One more: it still hurts, but the victim bursts free.
    const hp = vic.hp;
    a.race.tick++;
    expect(applyHit(a.race, TRACK, att, vic, slash, ATK.FW_SLASH1)).toBe(true);
    expect(a.race.events.filter((e) => e.type === 'escape')).toEqual([{ type: 'escape', mech: FW1 }]);
    expect(vic.hp).toBe(hp - slash.damage);
    expect(vic.act).toBe(ACT.NONE);
    expect(vic.chain).toBe(0);
    expect(vic.iframes).toBe(ESCAPE_IFRAMES);
    // And now it cannot be touched.
    expect(applyHit(a.race, TRACK, att, vic, slash, ATK.FW_SLASH1)).toBe(false);
    expect(a.race.events[a.race.events.length - 1]).toEqual({ type: 'evade', mech: FW1 });
    expect(vic.hp).toBe(hp - slash.damage);
  });

  it('two Edge strings back to back: the fifth hit triggers the escape, the sixth is evaded', () => {
    const { a, att, vic } = duel(FW0, FW1, 10);
    const string = () => {
      a.tap(FW0, BTN.X);
      a.step(2);
      a.tap(FW0, BTN.X);
      a.step(12);
      a.tap(FW0, BTN.X);
      a.until(() => att.act === ACT.NONE, 120);
      a.step(1);
    };
    string();
    expect(vic.chain).toBe(3);
    string();
    const hits = a.events('hit');
    expect(hits.map((e) => e.damage)).toEqual([20, 22, 40, 20, 22]);
    const escapes = a.events('escape');
    expect(escapes).toMatchObject([{ mech: FW1, tick: hits[4].tick }]);
    expect(a.events('evade')).toMatchObject([{ mech: FW1 }]);
    expect(a.events('evade')[0].tick).toBeGreaterThan(escapes[0].tick);
    expect(vic.hp).toBe(CLASSES[vic.role].maxHp - 124);
  });

  it('the chain count is forgotten CHAIN_TICKS after the last hit', () => {
    const { a, vic } = duel(FW0, FW1, 10);
    const T = a.tap(FW0, BTN.X);
    a.step(7);
    expect(vic.chain).toBe(1);
    const hitTick = a.events('hit')[0].tick;
    expect(hitTick).toBe(T + 6);
    a.step(hitTick + CHAIN_TICKS - 2 - a.race.tick);
    expect(vic.chain).toBe(1);
    a.step(3);
    expect(vic.chain).toBe(0);
  });

  it('a new hit during a stagger never shortens it', () => {
    const { a, vic } = duel(FW0, FW1, 8);
    setStagger(vic, 50);
    a.step(10);
    setStagger(vic, 5);
    expect(vic.actDur - vic.actT).toBe(40);
    setStagger(vic, 60);
    expect(vic.actDur - vic.actT).toBe(60);
  });
});

describe('knock-outs', () => {
  it('armour at zero retires the mech, credits the attacker and frees every lock on it', () => {
    const a = arena(2);
    const att = a.put(FW0, 300, 0);
    const vic = a.put(FW1, 310, 0);
    const mate = a.put(MF0, 285, 8);
    const foe2 = a.put(MF1, 330, -6);
    a.tap(MF0, BTN.LOCK); // a second pilot locks the same victim
    a.tap(MF1, BTN.ALLY); // and one of its own team-mates escorts it
    expect(mate.target).toBe(FW1);
    expect(foe2.target).toBe(FW1);
    vic.hp = 15;
    a.clearLog();
    const T = a.tap(FW0, BTN.X);
    a.step(6);
    expect(a.events('hit')).toMatchObject([{ attacker: FW0, victim: FW1, damage: 15 }]);
    expect(a.events('ko')).toEqual([{ type: 'ko', mech: FW1, by: FW0, tick: T + 6 }]);
    expect(vic.retired).toBe(true);
    expect(vic.hp).toBe(0);
    expect(vic.retireTick).toBe(T + 6);
    expect(vic.finished).toBe(false);
    expect(vic.act).toBe(ACT.NONE);
    expect(att.kos).toBe(1);
    expect(att.dmgDealt).toBe(15); // not the nominal 20
    expect(vic.dmgTaken).toBe(15);
    // The two that were locked on to it move straight on to the only other
    // rival in reach (people flying do; it saves them dropping out of the
    // fight mid-combo). The team-mate escorting it is simply let go.
    for (const m of [att, mate]) {
      expect(m.target).toBe(MF1);
      expect(m.mode).toBe(MODE.BATTLE);
    }
    expect(foe2.target).toBe(-1);
    expect(foe2.mode).toBe(MODE.SPEED);
    expect(a.events('unlock').map((e) => e.mech).sort()).toEqual([MF1]);
    expect(a.events('lock').map((e) => [e.mech, e.target]).sort()).toEqual([[FW0, FW1], [FW0, MF1], [MF0, MF1]]); // (the first is the attack locking on)
    // Out of the race: last place, no points, and it will not be classified.
    a.step(1);
    expect(vic.place).toBe(6);
    expect(pointsFor(vic)).toBe(0);
    a.step(300);
    expect(vic.retired).toBe(true);
    expect(vic.hp).toBe(0);
    expect(vic.speed).toBe(0);
  });

  it('a wreck cannot be hit, shot or locked again', () => {
    const { a, att, vic } = duel(FW0, FW1, 10);
    vic.hp = 1;
    a.tap(FW0, BTN.X);
    a.step(30);
    expect(vic.retired).toBe(true);
    a.clearLog();
    vic.s = att.s + 9;
    vic.d = att.d;
    a.tap(FW0, BTN.X);
    a.step(1);
    a.tap(FW0, BTN.LOCK);
    expect(att.target).toBe(-1);
    expect(a.events('windup').length).toBe(0);
    expect(a.events('ko').length).toBe(0);
    expect(att.kos).toBe(1);
    // Bullets fly through it.
    const b = duel(MF0, FW1, 30);
    b.vic.hp = 1;
    b.a.tap(MF0, BTN.X);
    b.a.step(50);
    expect(b.a.events('ko').length).toBe(1);
    expect(b.a.events('hit').length).toBe(1);
    expect(b.a.events('projEnd').filter((e) => !e.hit).length).toBe(2);
  });

  it('a bullet can score the knock-out', () => {
    const { a, att, vic } = duel(MF0, FW1, 30);
    vic.hp = 8;
    a.tap(MF0, BTN.X);
    a.step(40);
    expect(a.events('hit').map((e) => e.damage)).toEqual([6, 2]);
    expect(a.events('ko')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(att.kos).toBe(1);
  });
});

describe('wall splat', () => {
  it('a staggered mech knocked into the barrier takes extra damage by impact speed', () => {
    const a = arena(2);
    const vic = a.put(FW1, 300, 23); // two units off the right-hand wall
    const att = a.put(MF0, 300, 15); // alongside, on its left
    a.tap(MF0, BTN.LOCK);
    a.step(12);
    a.clearLog();
    a.tap(MF0, BTN.Y); // Stun Kick: 38 u/s of knockback, straight at the wall
    a.step(30);
    const hit = a.events('hit')[0];
    expect(hit).toMatchObject({ attacker: MF0, victim: FW1, damage: 34 });
    const splat = a.events('splat')[0];
    expect(splat.mech).toBe(FW1);
    expect(splat.tick).toBeGreaterThan(hit.tick);
    expect(splat.tick).toBeLessThan(hit.tick + 6);
    // A ring-out is reported once, as a splat, not as an ordinary wall hit too.
    expect(a.events('wall').filter((e) => e.mech === FW1).length).toBe(0);
    expect(splat.intensity).toBeGreaterThan(WALL_SPLAT_MIN);
    expect(splat.side).toBe(1);
    // Where it struck the barrier: down the road from the blow, behind where the mech is now.
    expect(splat.s).toBeGreaterThan(hit.s);
    expect(splat.s).toBeLessThan(vic.s);
    expect(splat.damage).toBeCloseTo(a.race.rules.ringoutDamage + splat.intensity * WALL_SPLAT_DAMAGE, 9);
    expect(a.events('splat').length).toBe(1);
    expect(vic.hp).toBeCloseTo(CLASSES[vic.role].maxHp - 34 - splat.damage, 9);
    expect(vic.dmgTaken).toBeCloseTo(34 + splat.damage, 9);
    // The ring-out is credited to the last attacker: the damage, and some Drive.
    expect(splat.by).toBe(MF0);
    expect(att.dmgDealt).toBeCloseTo(34 + splat.damage, 9);
    // A long tumble, and thrown back off the wall rather than pinned to it.
    expect(vic.act).toBe(ACT.STAGGER);
    expect(vic.d).toBeLessThan(wallLimit(vic));
  });

  it('the wall can finish the job, and the last attacker gets the knock-out', () => {
    const a = arena(2);
    const vic = a.put(FW1, 300, 23);
    const att = a.put(MF0, 300, 15);
    a.tap(MF0, BTN.LOCK);
    a.step(12);
    vic.hp = 50;
    a.tap(MF0, BTN.Y);
    a.step(30);
    expect(a.events('hit').map((e) => e.damage)).toEqual([34]);
    expect(a.events('splat')[0].damage).toBe(16);
    expect(a.events('ko')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(vic.retired).toBe(true);
    expect(att.kos).toBe(1);
  });

  it('driving into the wall under control is not a splat', () => {
    const a = arena(2);
    const m = a.put(FW0, 300, 15);
    a.inputs[FW0].mx = 1;
    a.step(120);
    expect(a.events('wall').length).toBeGreaterThan(0);
    expect(a.events('splat').length).toBe(0);
    expect(m.hp).toBe(CLASSES[m.role].maxHp);
  });
});

describe('knockback', () => {
  it('pushes the victim away from the attacker, sideways at full strength', () => {
    const a = arena(2);
    const att = a.put(MF0, 300, 0);
    const vic = a.put(FW1, 300, 8); // level, to the attacker's right
    a.step(1);
    applyHit(a.race, TRACK, att, vic, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(vic.vd).toBeGreaterThan(30);
    // Thrown sideways at the kick's 38 u/s, and a heavy blow throws harder
    // across the road (rules.ringoutThrow), while still doing the limiter down it.
    expect(vic.heading).toBeCloseTo(Math.atan2(ATTACKS[ATK.MF_KICK].knockback * a.race.rules.ringoutThrow, a.pace), 6);
    expect(vic.heading).toBeGreaterThan(0.25);
    // A light blow has no extra throw.
    const b = arena(2);
    const att2 = b.put(MF0, 300, 0);
    const vic2 = b.put(FW1, 300, 8);
    b.step(1);
    applyHit(b.race, TRACK, att2, vic2, ATTACKS[ATK.FW_SLASH1], ATK.FW_SLASH1);
    expect(vic2.heading).toBeCloseTo(Math.atan2(ATTACKS[ATK.FW_SLASH1].knockback, b.pace), 6);
  });

  it('a shove from behind is mostly swallowed: it is not a free push down the road', () => {
    const { a, att, vic } = duel(MF0, FW1, 8);
    a.step(1);
    const before = vic.vs;
    applyHit(a.race, TRACK, att, vic, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    // 38 u/s of knockback, only a tenth of it forwards, and the hit itself
    // costs pace: all told the victim is no quicker than before.
    expect(vic.vs).toBeCloseTo((before + 38 * 0.1) * (1 - 34 * HIT_SLOW_PER_DAMAGE), 9);
    expect(vic.vs).toBeLessThan(before + 1);
  });

  it('a blow from the front knocks a racing mech back', () => {
    const a = arena(2);
    const vic = a.put(FW1, 300, 0);
    const att = a.put(MF0, 308, 0); // the attacker is ahead of its victim
    a.step(1);
    applyHit(a.race, TRACK, att, vic, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(vic.vs).toBeLessThan(a.pace - 38);
    expect(vic.vs).toBeGreaterThan(0);
  });

  // OPEN QUESTION (see report): speed mode has no reverse. addVelocity
  // takes the magnitude of the new velocity as the speed, so when a blow
  // from the front is stronger than the victim's own pace (a mech that is
  // parked, crawling or just off a wall) the knockback comes out FORWARDS:
  // a crawling mech hit head-on by the Breaker Slam leaves at ~30 u/s
  // towards the mech that hit it.
  it('a blow from the front never throws a slow mech forwards', () => {
    const a = arena(2);
    const vic = a.put(FW1, 300, 0, 10);
    a.inputs[FW1].throttle = 0.1;
    const att = a.put(DF0, 308, 0);
    a.step(1);
    const before = vic.vs;
    applyHit(a.race, TRACK, att, vic, ATTACKS[ATK.DF_HAMMER2], ATK.DF_HAMMER2);
    expect(vic.vs).toBeLessThanOrEqual(before);
  });
});

describe('who can be hurt', () => {
  it('finished mechs are out of the fight: blows and bullets pass them by', () => {
    const a = arena(3);
    const done = a.put(FW1, L - 20, 0);
    a.until(() => done.finished, 60);
    const att = a.put(FW0, 0, 0);
    const gun = a.put(MF0, 0, 10);
    // Two back-markers arrive at the piece of road the finisher is on.
    att.s = done.s - 2 * L - 9;
    gun.s = done.s - 2 * L - 30;
    att.lap = gun.lap = Math.floor(att.s / L);
    gun.d = done.d;
    att.d = done.d;
    a.clearLog();
    a.tap(FW0, BTN.X);
    a.tap(MF0, BTN.X);
    a.step(50);
    expect(a.events('hit').length).toBe(0);
    expect(a.events('windup').map((e) => e.mech)).toEqual([MF0]); // melee had no target at all
    expect(done.hp).toBe(CLASSES[done.role].maxHp);
  });

  it('team-mates are never hit by a melee swing', () => {
    const a = arena(2);
    a.put(FW0, 300, 0);
    const mate = a.put(MF0, 308, 3);
    const foe = a.put(FW1, 309, -3);
    a.tap(FW0, BTN.X);
    a.step(10);
    expect(a.events('hit').map((e) => e.victim)).toEqual([FW1]);
    expect(mate.hp).toBe(CLASSES[mate.role].maxHp);
    expect(foe.hp).toBe(CLASSES[foe.role].maxHp - 20);
  });

  it('a swing prefers the locked target over a nearer enemy', () => {
    const a = arena(2);
    const att = a.put(FW0, 300, 0);
    const far = a.put(FW1, 309, 3.5);
    const near = a.put(MF1, 307, -3.5);
    const slash = ATTACKS[ATK.FW_SLASH1];
    expect(dist(att, near)).toBeLessThan(dist(att, far));
    expect(dist(att, far)).toBeLessThan(meleeRange(att, far, slash));
    a.tap(FW0, BTN.LOCK); // the lock goes to the rival forward...
    expect(att.target).toBe(FW1);
    a.step(1);
    a.clearLog();
    a.tap(FW0, BTN.X);
    a.step(8);
    expect(a.events('hit').map((e) => e.victim)).toEqual([FW1]);
    expect(near.hp).toBe(CLASSES[near.role].maxHp);

    // Without a lock on either, the nearer enemy takes it.
    const b = arena(2);
    b.put(FW0, 300, 0);
    b.put(FW1, 309, 3.5);
    b.put(MF1, 307, -3.5);
    b.tap(FW0, BTN.X); // a strike auto-locks the nearer one
    b.step(8);
    expect(b.events('hit').map((e) => e.victim)).toEqual([MF1]);
  });

  it('damage never exceeds the armour that is left, and hp never goes negative', () => {
    const { a, att, vic } = duel(FW0, FW1, 8);
    vic.hp = 3;
    applyHit(a.race, TRACK, att, vic, ATTACKS[ATK.FW_LANCE], ATK.FW_LANCE);
    expect(vic.hp).toBe(0);
    expect(att.dmgDealt).toBe(3);
    expect(vic.retired).toBe(true);
    // Hitting a wreck's object again cannot resurrect or double-count it.
    for (let i = 0; i < 3; i++) stepRace(a.race, TRACK, a.inputs);
    expect(att.kos).toBe(1);
  });
});

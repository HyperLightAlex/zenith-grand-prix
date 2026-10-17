import { describe, expect, it } from 'vitest';
import {
  ACT,
  BATTLE_CAP_MULT,
  BATTLE_EASE_FLOOR,
  BATTLE_MIN_FRAC,
  BATTLE_STAGGER_DRAG,
  BTN,
  CLASSES,
  DRIVE_LINK,
  DT,
  LINK_RANGE,
  LOCK_BREAK,
  LOCK_BREAK_TICKS,
  LOCK_RANGE,
  MODE,
  RULE_LIMITS,
  cycleTarget,
  pickTarget,
  setTarget,
} from '../src/sim/index';
import { retire, setStagger } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK, dist, giveCells } from './helpers';
import type { MechState } from '../src/sim/index';

const L = TRACK.length;

describe('acquiring and releasing a lock', () => {
  it('LOCK takes the enemy in range and switches to battle mode; LOCK again lets go', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(FW1, 40, 5);
    expect(me.mode).toBe(MODE.SPEED);
    const t = a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(FW1);
    expect(me.mode).toBe(MODE.BATTLE);
    expect(a.events('lock')).toEqual([{ type: 'lock', mech: FW0, target: FW1, tick: t }]);
    a.step(5);
    const t2 = a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(-1);
    expect(me.mode).toBe(MODE.SPEED);
    expect(a.events('unlock')).toEqual([{ type: 'unlock', mech: FW0, tick: t2 }]);
    // The other mech was never involved.
    expect(a.mech(FW1).target).toBe(-1);
    expect(a.mech(FW1).mode).toBe(MODE.SPEED);
  });

  it('works on the formation lap too: locking is not a weapon', () => {
    const a = new Arena(1);
    a.put(MF0, 0, 0);
    a.put(DF1, 30, 0);
    a.tap(MF0, BTN.LOCK);
    expect(a.mech(MF0).target).toBe(DF1);
  });

  it('is edge triggered: holding the button is one press', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(FW1, 40, 5);
    a.hold(FW0, BTN.LOCK).step(40);
    expect(me.target).toBe(FW1);
    expect(a.events('lock').length).toBe(1);
    expect(a.events('unlock').length).toBe(0);
  });

  it('reaches LOCK_RANGE and no further; a miss is "denied", at most twice a second', () => {
    const near = new Arena(1);
    near.put(FW0, 0, 0);
    near.put(FW1, LOCK_RANGE - 1, 0);
    near.tap(FW0, BTN.LOCK);
    expect(near.mech(FW0).target).toBe(FW1);

    const far = new Arena(1);
    const me = far.put(FW0, 0, 0);
    const foe = far.put(FW1, LOCK_RANGE + 1, 0);
    const t = far.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(-1);
    expect(me.mode).toBe(MODE.SPEED);
    expect(far.events('denied')).toEqual([{ type: 'denied', mech: FW0, reason: 'target', tick: t }]);
    far.step(3);
    far.tap(FW0, BTN.LOCK);
    expect(far.events('denied').length).toBe(1);
    far.step(40);
    foe.s = me.s + LOCK_RANGE + 1; // (the pack bonus had been reeling it in)
    far.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(-1);
    expect(far.events('denied').length).toBe(2);
  });

  it('prefers the enemy that is close and in front', () => {
    const a = new Arena(1);
    a.put(MF0, 100, 0);
    a.put(FW1, 130, 4); // 30 ahead
    a.put(MF1, 160, -4); // 60 ahead
    a.put(DF1, 75, 0); // 25 behind: nearest of all, but behind the pilot's back
    a.tap(MF0, BTN.LOCK);
    expect(a.mech(MF0).target).toBe(FW1);
    expect(pickTarget(a.race, TRACK, a.mech(MF0), false, FW1)).toBe(MF1);
  });

  it('LOCK only ever picks enemies', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 20, 0);
    a.put(DF0, 30, 6);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(-1);
    expect(a.events('denied').length).toBe(1);
  });

  it('sees across the start line', () => {
    const a = new Arena(2);
    const me = a.put(FW0, L - 20, 0); // 20 short of the line, end of lap 2
    const foe = a.put(FW1, 0, 0);
    foe.s = a.base + L + 15; // 15 past it
    foe.lap = 2;
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(FW1);
    a.step(60);
    expect(me.target).toBe(FW1);
  });

  it('a staggered pilot cannot work the lock', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 0, 0);
    a.put(FW1, 40, 5);
    setStagger(me, 30);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(-1);
    a.step(40);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(FW1);
  });
});

describe('ally lock', () => {
  it('ALLY locks a team-mate; a second press, with no rival to go back to, lets go', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    const foe = a.put(FW1, 20, 8); // an enemy even closer: must be ignored
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF0);
    expect(me.mode).toBe(MODE.BATTLE);
    a.step(3);
    // No rival about any more: the second press lets go.
    a.put(FW1, 600, 8);
    void foe;
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(-1);
    expect(me.mode).toBe(MODE.SPEED);
  });

  it('the escort button toggles: a stray press mid-fight costs one more press, and the same rival comes back', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.put(DF0, 50, 5);
    a.put(FW1, 40, 6);
    a.put(MF1, 25, -8); // nearer, and more in the middle of the picture
    setTarget(a.race, me, FW1); // fighting the forward
    a.step(2);
    a.tap(FW0, BTN.ALLY);
    expect([MF0, DF0]).toContain(me.target);
    a.step(3);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(FW1);
    // The lock button does the same from an escort.
    a.step(2);
    a.tap(FW0, BTN.ALLY);
    expect([MF0, DF0]).toContain(me.target);
    a.step(2);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(FW1);
  });

  it('escorting, the target switch steps between team-mates', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.put(DF0, 50, 5);
    a.tap(FW0, BTN.ALLY);
    const first = me.target;
    expect([MF0, DF0]).toContain(first);
    a.step(3);
    a.tap(FW0, BTN.TNEXT);
    expect(me.target).toBe(first === MF0 ? DF0 : MF0);
    a.step(3);
    a.tap(FW0, BTN.TNEXT);
    expect(me.target).toBe(first);
  });

  it('back to the fight: a rival that has gone (out of reach) is replaced by the best one in reach', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.put(FW1, 40, 6);
    a.put(MF1, 60, -4);
    setTarget(a.race, me, FW1);
    a.step(2);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF0);
    a.step(2);
    a.put(FW1, 700, 0); // gone up the road
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF1);
  });

  it('LOCK and ALLY switch sides directly', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.put(FW1, 40, 6);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF0);
    a.step(2);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(FW1);
    a.step(2);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF0);
    expect(me.mode).toBe(MODE.BATTLE);
  });

  it('LOCK while escorting with no enemy about lets go', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.tap(FW0, BTN.ALLY);
    a.step(2);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(-1);
    expect(me.mode).toBe(MODE.SPEED);
  });

  /**
   * An escort and its charge inside LINK_RANGE, and a team-mate out on its
   * own, off every tow line. The charge sits 8 to the side: clear of
   * DRAFT_WIDTH, not on its edge, where a rounding error decides it.
   */
  function escort(lapPhase: 1 | 2, rules?: ConstructorParameters<typeof Arena>[2]) {
    const a = new Arena(lapPhase, 1, rules);
    const me = a.put(MF0, 0, 0);
    const mate = a.put(FW0, 18, 8);
    const loner = a.put(DF0, 80, -8);
    me.drive = mate.drive = loner.drive = 10;
    a.tap(MF0, BTN.ALLY);
    expect(me.target).toBe(FW0);
    expect(dist(me, mate)).toBeLessThan(LINK_RANGE);
    const n = 60;
    const d0 = [me.drive, mate.drive, loner.drive];
    a.step(n, () => {
      expect(me.linked).toBe(true);
      expect(mate.linked).toBe(true);
      expect(loner.linked).toBe(false);
      expect(me.drafting || mate.drafting || loner.drafting).toBe(false);
    });
    return { a, n, gained: [me.drive - d0[0], mate.drive - d0[1], loner.drive - d0[2]] };
  }

  it('escorting a team-mate inside LINK_RANGE links the pair and shares Drive', () => {
    // From the battle lap on: the trickle for everyone, and the link on top for the pair.
    const { a, n, gained } = escort(2);
    const passive = a.race.rules.drivePassive;
    expect(gained[0]).toBeCloseTo(n * (passive + DRIVE_LINK) * DT, 6);
    expect(gained[1]).toBeCloseTo(n * (passive + DRIVE_LINK) * DT, 6);
    expect(gained[2]).toBeCloseTo(n * passive * DT, 6);
  });

  it('on the formation lap the pair still links, but no Drive comes of it', () => {
    const { gained } = escort(1);
    expect(gained).toEqual([0, 0, 0]);
  });

  it('...unless rules.lap1Trickle turns the formation-lap trickle back on', () => {
    const { a, n, gained } = escort(1, { lap1Trickle: 1 });
    const passive = a.race.rules.drivePassive;
    expect(gained[0]).toBeCloseTo(n * (passive + DRIVE_LINK) * DT, 6);
    expect(gained[1]).toBeCloseTo(n * (passive + DRIVE_LINK) * DT, 6);
    expect(gained[2]).toBeCloseTo(n * passive * DT, 6);
  });

  it('no link beyond LINK_RANGE, and none from an enemy lock', () => {
    const a = new Arena(1);
    const me = a.put(MF0, 0, 0);
    const mate = a.put(FW0, LINK_RANGE + 10, 0);
    a.tap(MF0, BTN.ALLY);
    a.step(5);
    expect(me.target).toBe(FW0);
    expect(me.linked).toBe(false);
    expect(mate.linked).toBe(false);

    const b = new Arena(1);
    const hunter = b.put(MF0, 0, 0);
    const prey = b.put(FW1, 15, 0);
    b.tap(MF0, BTN.LOCK);
    b.step(5);
    expect(hunter.linked).toBe(false);
    expect(prey.linked).toBe(false);
  });
});

describe('target cycling', () => {
  function threeEnemies() {
    const a = new Arena(1);
    const me = a.put(FW0, 100, 0);
    a.put(FW1, 140, -12); // ahead left
    a.put(MF1, 150, 0); // dead ahead
    a.put(DF1, 140, 12); // ahead right
    a.put(MF0, 130, 20); // a team-mate in the middle of it all
    return { a, me };
  }

  it('TNEXT steps clockwise through the enemies in range and wraps', () => {
    const { a, me } = threeEnemies();
    a.tap(FW0, BTN.LOCK);
    // Nearest first (the two flankers tie; the lower id wins the tie).
    expect(me.target).toBe(FW1);
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      a.step(1);
      a.tap(FW0, BTN.TNEXT);
      seen.push(me.target);
    }
    // Left to right across the windscreen, then round again.
    expect(seen).toEqual([MF1, DF1, FW1, MF1, DF1, FW1]);
    expect(me.mode).toBe(MODE.BATTLE);
  });

  it('TPREV goes the other way', () => {
    const { a, me } = threeEnemies();
    a.tap(FW0, BTN.LOCK);
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      a.step(1);
      a.tap(FW0, BTN.TPREV);
      seen.push(me.target);
    }
    expect(seen).toEqual([DF1, MF1, FW1, DF1]);
  });

  it('cycling stays on the side that is locked: allies cycle among allies', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 100, 0);
    a.put(MF0, 130, -8);
    a.put(DF0, 130, 8);
    a.put(FW1, 120, 0);
    a.tap(FW0, BTN.ALLY);
    const first = me.target;
    expect([MF0, DF0]).toContain(first);
    a.step(1);
    a.tap(FW0, BTN.TNEXT);
    expect(me.target).toBe(first === MF0 ? DF0 : MF0);
    a.step(1);
    a.tap(FW0, BTN.TNEXT);
    expect(me.target).toBe(first);
  });

  it('does nothing without a lock, or with only one candidate', () => {
    const { a, me } = threeEnemies();
    a.tap(FW0, BTN.TNEXT);
    expect(me.target).toBe(-1);
    expect(a.events('lock').length).toBe(0);

    const b = new Arena(1);
    const solo = b.put(FW0, 0, 0);
    b.put(FW1, 40, 0);
    b.tap(FW0, BTN.LOCK);
    b.step(1);
    b.tap(FW0, BTN.TNEXT);
    b.step(1);
    b.tap(FW0, BTN.TPREV);
    expect(solo.target).toBe(FW1);
    expect(b.events('lock').length).toBe(1);
    expect(cycleTarget(b.race, TRACK, solo, 1)).toBe(FW1);
  });
});

describe('losing a lock', () => {
  it('breaks after LOCK_BREAK_TICKS beyond LOCK_BREAK', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    const foe = a.put(FW1, 50, 0);
    a.tap(FW0, BTN.LOCK);
    a.step(10);
    foe.s = me.s + LOCK_BREAK + 60;
    a.clearLog();
    a.step(LOCK_BREAK_TICKS - 1);
    expect(me.target).toBe(FW1);
    expect(me.outOfRange).toBe(LOCK_BREAK_TICKS - 1);
    a.step(1);
    expect(me.target).toBe(-1);
    expect(me.mode).toBe(MODE.SPEED);
    expect(a.events('unlock').map((e) => e.mech)).toEqual([FW0]);
  });

  it('coming back inside the range in time keeps it, and resets the clock', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    const foe = a.put(FW1, 50, 0);
    a.tap(FW0, BTN.LOCK);
    foe.s = me.s + LOCK_BREAK + 60;
    a.step(LOCK_BREAK_TICKS - 5);
    foe.s = me.s + 60;
    a.step(1);
    expect(me.outOfRange).toBe(0);
    foe.s = me.s + LOCK_BREAK + 60;
    a.step(LOCK_BREAK_TICKS - 1);
    expect(me.target).toBe(FW1);
  });

  it('holds between LOCK_RANGE and LOCK_BREAK', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    const foe = a.put(FW1, 50, 0);
    a.tap(FW0, BTN.LOCK);
    foe.s = me.s + (LOCK_RANGE + LOCK_BREAK) / 2;
    a.step(200);
    expect(me.target).toBe(FW1);
    // ...but that far out it could not be acquired.
    expect(pickTarget(a.race, TRACK, me, false, -1)).toBe(-1);
  });

  it('drops the moment the target is knocked out, for everyone locked on it', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 0, 0);
    const mate = a.put(MF0, 10, 8);
    const foe = a.put(FW1, 40, 0);
    a.tap(FW0, BTN.LOCK);
    a.tap(MF0, BTN.LOCK);
    expect([me.target, mate.target]).toEqual([FW1, FW1]);
    a.clearLog();
    retire(a.race, foe, null);
    expect([me.target, mate.target]).toEqual([-1, -1]);
    expect([me.mode, mate.mode]).toEqual([MODE.SPEED, MODE.SPEED]);
    a.step(1);
    expect(a.race.events.filter((e) => e.type === 'lock').length).toBe(0);
  });

  it('retired and finished mechs cannot be targeted at all', () => {
    const a = new Arena(3);
    const me = a.put(FW0, L - 300, 0);
    const wreck = a.put(FW1, L - 270, 0);
    const done = a.put(MF1, L - 30, 0);
    const mate = a.put(MF0, L - 280, 10);
    retire(a.race, wreck, null);
    retire(a.race, mate, null);
    a.until(() => done.finished, 100);
    expect(done.finished).toBe(true);
    done.s = me.s + 25; // parade it right in front of the pilot
    a.clearLog();
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(-1);
    a.step(1);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(-1);
    expect(pickTarget(a.race, TRACK, me, false, -1)).toBe(-1);
    expect(pickTarget(a.race, TRACK, me, true, -1)).toBe(-1);
    expect(cycleTarget(a.race, TRACK, me, 1)).toBe(-1);
  });

  it('drops when the target takes the flag, and when the pilot does', () => {
    const a = new Arena(3);
    const chaser = a.put(MF0, L - 60, 0);
    const leader = a.put(FW1, L - 30, 0);
    a.tap(MF0, BTN.LOCK);
    a.tap(FW1, BTN.LOCK);
    expect(chaser.target).toBe(FW1);
    expect(leader.target).toBe(MF0);
    a.until(() => leader.finished, 100);
    expect(leader.finished).toBe(true);
    expect(leader.target).toBe(-1);
    expect(leader.mode).toBe(MODE.SPEED);
    expect(chaser.target).toBe(-1);
    expect(chaser.mode).toBe(MODE.SPEED);
    // A finished pilot cannot lock anyone either.
    a.step(2);
    a.tap(FW1, BTN.LOCK);
    expect(leader.target).toBe(-1);
  });
});

describe('battle mode movement', () => {
  it('stick neutral: the track carries you at the target\'s pace and you turn to face it', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 0, 0);
    const foe = a.put(FW1, 30, 10);
    a.tap(FW0, BTN.LOCK);
    const gap = foe.s - me.s;
    a.step(90);
    expect(foe.s - me.s).toBeCloseTo(gap, 1);
    expect(me.d).toBeCloseTo(0, 6);
    expect(me.vs).toBeCloseTo(a.pace, 3);
    expect(me.vs).toBeCloseTo(foe.vs, 3);
    expect(me.facing).toBeCloseTo(Math.atan2(foe.d - me.d, foe.s - me.s), 6);
    // The target, in speed mode, still faces down the road.
    expect(foe.facing).toBeCloseTo(0, 9);
  });

  it('my > 0 closes in, my < 0 backs away', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 0, 0);
    const foe = a.put(FW1, 30, 0);
    a.tap(FW0, BTN.LOCK);
    const gap0 = foe.s - me.s;
    a.inputs[FW0].my = 1;
    a.step(60);
    const gap1 = foe.s - me.s;
    expect(gap1).toBeLessThan(gap0 - 2);
    // Chasing a target ahead tops out a little over the (live) limiter.
    expect(me.vs).toBeLessThanOrEqual(a.pace * BATTLE_CAP_MULT + 1e-9);
    expect(me.vs).toBeGreaterThan(a.pace);
    // Backing off a target ahead is slow work: a fight is never carried below
    // BATTLE_MIN_FRAC of the limiter, so it opens the gap but does not stop dead.
    a.inputs[FW0].my = -1;
    a.step(60);
    expect(foe.s - me.s).toBeGreaterThan(gap1 + 8);
    expect(me.vs).toBeGreaterThanOrEqual(a.pace * BATTLE_MIN_FRAC - 1e-9);
  });

  it('closing on a target behind means slowing down to it', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 40, 0);
    const foe = a.put(FW1, 0, 0);
    a.tap(FW0, BTN.LOCK);
    a.inputs[FW0].my = 1;
    a.step(45);
    expect(me.vs).toBeLessThan(a.pace - 10);
    // ...but never below the slowest a fight is carried.
    expect(me.vs).toBeGreaterThanOrEqual(a.pace * BATTLE_MIN_FRAC - 1e-9);
    expect(me.s - foe.s).toBeLessThan(30);
    expect(me.s - foe.s).toBeGreaterThan(0);
  });

  it('mx circles: stick right goes to the right of a target ahead', () => {
    for (const dir of [1, -1]) {
      const a = new Arena(2);
      const me = a.put(FW0, 0, 0);
      a.put(FW1, 30, 0);
      a.tap(FW0, BTN.LOCK);
      a.inputs[FW0].mx = dir;
      a.step(30);
      expect(Math.sign(me.d)).toBe(dir);
      expect(Math.abs(me.d)).toBeGreaterThan(3);
    }
  });

  it('cannot be pushed through the target: closing stops at arm\'s length', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 30, 0);
    const foe = a.put(DF1, 0, 0);
    a.tap(FW0, BTN.LOCK);
    a.inputs[FW0].my = 1;
    const radii = CLASSES[me.role].radius + CLASSES[foe.role].radius;
    a.step(240, () => expect(dist(me, foe)).toBeGreaterThan(radii - 0.5));
    expect(dist(me, foe)).toBeLessThan(radii + 2);
  });

  it('stays inside the walls while strafing', () => {
    const a = new Arena(2);
    const me = a.put(DF0, 0, 15);
    a.put(FW1, 30, 15);
    a.tap(DF0, BTN.LOCK);
    a.inputs[DF0].mx = 1;
    const lim = TRACK.halfWidth - CLASSES[me.role].radius;
    a.step(200, () => expect(Math.abs(me.d)).toBeLessThanOrEqual(lim));
    expect(me.d).toBeGreaterThan(lim - 1);
  });

  it('letting go returns to free steering at the speed you had', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 0, 0);
    a.put(FW1, 30, 9); // off to one side, so there is no slipstream to pick up
    a.tap(FW0, BTN.LOCK);
    a.step(30);
    a.tap(FW0, BTN.LOCK);
    expect(me.mode).toBe(MODE.SPEED);
    expect(me.speed).toBeCloseTo(a.pace, 2);
    expect(me.heading).toBeCloseTo(0, 6);
    a.step(60);
    expect(me.speed).toBeCloseTo(a.pace, 6);
  });

  it('approach, strafe and acceleration around a lock all scale with rules.battleMove', () => {
    // Circle a target for half a second at several settings of the rule.
    // (`live`: written into the running race, as the tuning panel does,
    // rather than given in the config, where it is held to RULE_LIMITS.)
    const strafeAfter = (battleMove: number, ticks: number, live = false) => {
      const a = new Arena(2, 1, live ? undefined : { battleMove });
      if (live) a.race.rules.battleMove = battleMove;
      const me = a.put(FW0, 0, 0);
      a.put(FW1, 30, 0);
      a.tap(FW0, BTN.LOCK);
      a.inputs[FW0].mx = 1;
      a.step(ticks);
      return Math.abs(me.vd);
    };
    const c = CLASSES[0];
    // Early on it is the acceleration that shows: battleAccel x battleMove.
    expect(strafeAfter(1, 3)).toBeCloseTo(3 * c.battleAccel * DT, 1);
    expect(strafeAfter(2, 3)).toBeCloseTo(3 * c.battleAccel * 2 * DT, 1);
    // Once it has settled, the strafe speed itself: strafe x battleMove (the
    // target is still nearly dead ahead).
    const slow = strafeAfter(1, 30);
    const quick = strafeAfter(2, 30);
    expect(slow).toBeGreaterThan(c.strafe * 0.9);
    expect(slow).toBeLessThanOrEqual(c.strafe + 1e-9);
    expect(quick).toBeGreaterThan(c.strafe * 2 * 0.8);
    expect(quick).toBeLessThanOrEqual(c.strafe * 2 + 1e-9);
    // The rule has a floor: a race cannot be set up with locked mechs frozen
    // in place. Asking for zero gets the slowest setting there is...
    const floor = RULE_LIMITS.battleMove[0];
    expect(floor).toBeGreaterThan(0);
    expect(strafeAfter(0, 30)).toBeCloseTo(strafeAfter(floor, 30), 12);
    expect(strafeAfter(0, 30)).toBeGreaterThan(c.strafe * floor * 0.9);
    expect(strafeAfter(0, 30)).toBeLessThanOrEqual(c.strafe * floor + 1e-9);
    // ...while a zero written straight into a running race is a mech that
    // can only be carried along: no closing, no circling.
    expect(strafeAfter(0, 30, true)).toBe(0);
  });

  it('closing speed scales with rules.battleMove too', () => {
    const closed = (battleMove: number, live = false) => {
      // Side by side, so closing in is all across the road: down the road a
      // fight is carried at race pace (BATTLE_MIN_FRAC of the limiter at the
      // least), which would cut short any test of how fast it closes.
      const a = new Arena(2, 1, live ? { tow: 0 } : { battleMove, tow: 0 });
      if (live) a.race.rules.battleMove = battleMove;
      const me = a.put(FW0, 0, -14);
      const foe = a.put(FW1, 0, 14);
      a.tap(FW0, BTN.LOCK);
      expect(me.target).toBe(FW1);
      const gap0 = Math.hypot(foe.s - me.s, foe.d - me.d);
      a.inputs[FW0].my = 1;
      a.step(40);
      return gap0 - Math.hypot(foe.s - me.s, foe.d - me.d);
    };
    const half = closed(0.5);
    const one = closed(1);
    expect(half).toBeGreaterThan(5);
    // Both the approach speed and the acceleration toward it scale, so the ground made up does exactly.
    expect(one).toBeCloseTo(half * 2, 6);
    expect(closed(0.25)).toBeCloseTo(half / 2, 6);
    // At the floor of the rule's range it still closes, a tenth as fast; a
    // zero written in live does not close at all.
    expect(closed(0)).toBeCloseTo(closed(RULE_LIMITS.battleMove[0]), 12);
    expect(closed(0)).toBeCloseTo(one * RULE_LIMITS.battleMove[0], 6);
    expect(closed(0, true)).toBeCloseTo(0, 6);
  });

  it('a stagger in a lock bleeds speed toward BATTLE_MIN_FRAC of the limiter at BATTLE_STAGGER_DRAG', () => {
    for (const lapPhase of [1, 2] as const) {
      const a = new Arena(lapPhase);
      const me = a.put(FW0, 0, 0);
      const foe = a.put(FW1, 30, 9);
      a.tap(FW0, BTN.LOCK);
      a.step(5);
      const floor = a.pace * BATTLE_MIN_FRAC;
      const v0 = me.vs;
      expect(v0).toBeCloseTo(a.pace, 3);
      setStagger(me, 600);
      a.step(30);
      expect(me.act).toBe(ACT.STAGGER);
      expect(me.vs).toBeCloseTo(v0 - 30 * BATTLE_STAGGER_DRAG * DT, 6);
      // It stops bleeding at the floor, and stays there (the target is kept
      // in range by hand, so the lock, and battle mode with it, holds).
      a.step(400, () => {
        foe.s = me.s + 30;
        expect(me.vs).toBeGreaterThanOrEqual(floor - 1e-9);
      });
      expect(me.mode).toBe(MODE.BATTLE);
      expect(me.vs).toBeCloseTo(floor, 9);
    }
  });
});

describe('who an attacker hunts when several lock at once', () => {
  it('two team-mates and an enemy can all hold locks on each other', () => {
    const a = new Arena(2);
    a.put(FW0, 0, -6);
    a.put(MF0, 0, 6);
    a.put(DF1, 35, 0);
    a.tap(FW0, BTN.LOCK);
    a.tap(MF0, BTN.LOCK);
    a.tap(DF1, BTN.LOCK);
    expect(a.mech(FW0).target).toBe(DF1);
    expect(a.mech(MF0).target).toBe(DF1);
    expect([FW0, MF0]).toContain(a.mech(DF1).target);
    a.step(120);
    expect(a.mech(FW0).target).toBe(DF1);
    expect(a.mech(MF0).target).toBe(DF1);
    for (const id of [FW0, MF0, DF1, FW1, MF1, DF0]) expect(Number.isFinite(a.mech(id).s + a.mech(id).d)).toBe(true);
  });
});

describe('locked-on pace: the trigger, the boost, and lunges at the target', () => {
  const gap = (a: Arena, me: number, t: number) => a.mech(t).s - a.mech(me).s;

  it('on the trigger the lock carries you at fighting pace; off it, the pace eases to BATTLE_EASE_FLOOR of it', () => {
    for (const [th, want] of [[1, 1], [0, BATTLE_EASE_FLOOR], [0.5, (1 + BATTLE_EASE_FLOOR) / 2]] as const) {
      const a = new Arena(2);
      const me = a.put(FW0, -200, 0);
      a.put(FW1, -230, 6);
      setTarget(a.race, me, FW1);
      a.inputs[FW0].throttle = th;
      a.step(120, () => a.recenter([FW0, FW1]));
      expect(me.vs).toBeCloseTo(a.pace * want, 1);
    }
  });

  it('off the trigger, a target behind comes to you', () => {
    const a = new Arena(2);
    const me = a.put(FW0, -200, 0);
    a.put(FW1, -240, 6);
    setTarget(a.race, me, FW1);
    a.inputs[FW0].throttle = 0;
    a.step(60, () => a.recenter([FW0, FW1]));
    expect(gap(a, FW0, FW1)).toBeGreaterThan(-25);
  });

  /** Ticks to get within 12 of a target `ahead` units up the road (negative: behind), stick at it, A held or not. */
  function close(ahead: number, holdA: boolean): { ticks: number; me: MechState; a: Arena } {
    const a = new Arena(2);
    const me = a.put(FW0, -200, 0);
    a.put(FW1, -200 + ahead, 6);
    setTarget(a.race, me, FW1);
    me.drive = 100;
    a.inputs[FW0].my = 1;
    a.inputs[FW0].buttons = holdA ? BTN.A : 0;
    let n = 0;
    while (n < 240 && Math.abs(gap(a, FW0, FW1)) > 12) {
      a.step(1);
      a.recenter([FW0, FW1]);
      n++;
    }
    return { ticks: n, me, a };
  }

  it('A held with the stick at the target: the dash runs on into a boost at it, paid for like a boost', () => {
    const plain = close(60, false);
    const boosted = close(60, true);
    expect(plain.ticks).toBe(240); // on the stick alone it barely gains
    expect(boosted.ticks).toBeLessThan(110);
    expect(boosted.a.events('dash')).toHaveLength(1);
    expect(boosted.a.events('boost')).toHaveLength(1);
    expect(boosted.me.boosting).toBe(true);
    const spent = 100 - boosted.me.drive;
    expect(spent).toBeGreaterThan(CLASSES[boosted.me.role].dashCost);
  });

  it('...and at a target behind, the boost is a brake: it closes just as fast', () => {
    const plain = close(-60, false);
    const boosted = close(-60, true);
    expect(boosted.ticks).toBeLessThan(110);
    expect(boosted.ticks).toBeLessThan(plain.ticks - 60);
  });

  it('no boost with the stick to the side or back (those are a side dash and a hop back)', () => {
    for (const [mx, my] of [[1, 0], [-1, 0.2], [0, -1]] as const) {
      const a = new Arena(2);
      const me = a.put(FW0, -200, 0);
      a.put(FW1, -140, 6);
      setTarget(a.race, me, FW1);
      me.drive = 100;
      a.inputs[FW0].mx = mx;
      a.inputs[FW0].my = my;
      a.inputs[FW0].buttons = BTN.A;
      a.step(40, () => a.recenter([FW0, FW1]));
      expect(me.boosting).toBe(false);
      expect(a.events('boost')).toHaveLength(0);
    }
  });

  it('a Ram lands on a target behind as surely as on one ahead', () => {
    for (const off of [40, -40, 70, -70]) {
      const a = new Arena(2);
      const df = giveCells(a.put(DF0, -200, 0));
      a.put(MF1, -200 + off, 6);
      setTarget(a.race, df, MF1);
      a.ability(DF0);
      let n = 0;
      while (n < 210 && df.ramHits === 0) {
        a.step(1);
        a.recenter([DF0, MF1]);
        n++;
      }
      expect(df.ramHits).not.toBe(0);
      expect(n).toBeLessThan(90);
    }
  });

  it('the Lance Dash lunges at a target behind as well as one ahead', () => {
    for (const off of [20, -20]) {
      const a = new Arena(2);
      const me = a.put(FW0, -200, 0);
      a.put(FW1, -200 + off, 0);
      setTarget(a.race, me, FW1);
      me.drive = 100;
      a.step(2);
      a.tap(FW0, BTN.Y);
      a.step(30);
      expect(a.events('hit').filter((e) => e.attacker === FW0)).toHaveLength(1);
    }
  });
});

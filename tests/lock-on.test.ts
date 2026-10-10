import { describe, expect, it } from 'vitest';
import {
  BATTLE_CAP_MULT,
  BTN,
  CLASSES,
  DRIVE_LINK,
  DRIVE_PASSIVE,
  DT,
  LINK_RANGE,
  LOCK_BREAK,
  LOCK_BREAK_TICKS,
  LOCK_RANGE,
  MODE,
  PACE,
  cycleTarget,
  pickTarget,
} from '../src/sim/index';
import { retire, setStagger } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK, dist } from './helpers';

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
  it('ALLY locks a team-mate; a second press lets go when there is nobody else', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.put(FW1, 20, 8); // an enemy even closer: must be ignored
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF0);
    expect(me.mode).toBe(MODE.BATTLE);
    a.step(3);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(-1);
    expect(me.mode).toBe(MODE.SPEED);
  });

  it('a second press hops to the other team-mate when both are in range', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.put(DF0, 50, 5);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF0);
    a.step(3);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(DF0);
    a.step(3);
    a.tap(FW0, BTN.ALLY);
    expect(me.target).toBe(MF0);
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

  it('LOCK with no enemy about keeps the ally lock and says so', () => {
    const a = new Arena(1);
    const me = a.put(FW0, 0, 0);
    a.put(MF0, 30, -5);
    a.tap(FW0, BTN.ALLY);
    a.step(2);
    a.tap(FW0, BTN.LOCK);
    expect(me.target).toBe(MF0);
    expect(a.events('denied').map((e) => e.reason)).toEqual(['target']);
  });

  it('escorting a team-mate inside LINK_RANGE links the pair and shares Drive', () => {
    const a = new Arena(1);
    const me = a.put(MF0, 0, 0);
    const mate = a.put(FW0, 18, 6);
    const loner = a.put(DF0, 80, 0);
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
    });
    expect(me.drive - d0[0]).toBeCloseTo(n * (DRIVE_PASSIVE + DRIVE_LINK) * DT, 6);
    expect(mate.drive - d0[1]).toBeCloseTo(n * (DRIVE_PASSIVE + DRIVE_LINK) * DT, 6);
    expect(loner.drive - d0[2]).toBeCloseTo(n * DRIVE_PASSIVE * DT, 6);
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
    expect(me.vs).toBeCloseTo(PACE, 3);
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
    // Chasing a target ahead tops out a little over the limiter.
    expect(me.vs).toBeLessThanOrEqual(PACE * BATTLE_CAP_MULT + 1e-9);
    a.inputs[FW0].my = -1;
    a.step(60);
    expect(foe.s - me.s).toBeGreaterThan(gap1 + 15);
  });

  it('closing on a target behind means slowing down to it', () => {
    const a = new Arena(2);
    const me = a.put(FW0, 40, 0);
    const foe = a.put(FW1, 0, 0);
    a.tap(FW0, BTN.LOCK);
    a.inputs[FW0].my = 1;
    a.step(45);
    expect(me.vs).toBeLessThan(PACE - 10);
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
    expect(me.speed).toBeCloseTo(PACE, 2);
    expect(me.heading).toBeCloseTo(0, 6);
    a.step(60);
    expect(me.speed).toBeCloseTo(PACE, 6);
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

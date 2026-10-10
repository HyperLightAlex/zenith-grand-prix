import { describe, expect, it } from 'vitest';
import {
  ACT,
  BATTLE_CAP_LAP3,
  BATTLE_CAP_MULT,
  BOOST_COST,
  BOOST_MIN_START,
  BTN,
  BTN_MASK,
  CLASSES,
  COAST_DRAG,
  DASH_BLEED,
  DASH_COOLDOWN,
  DASH_OVER,
  DASH_TICKS,
  DEFAULT_RULES,
  DRIVE_MAX,
  DT,
  MAX_HEADING,
  MODE,
  PACK_BONUS,
  PACK_FULL,
  PACK_SLACK,
  PHASE,
  POINTS,
  SPEED_CEILING,
  deltaS,
  emptyInput,
  limiterOf,
  ownTopSpeed,
  packBonus,
  speedCap,
  stepRace,
} from '../src/sim/index';
import type { MechInput, MechState, RaceState } from '../src/sim/index';
import { retire } from '../src/sim/combat';
import {
  Arena,
  DF0,
  DF1,
  FW0,
  FW1,
  MF0,
  MF1,
  TRACK,
  findNonFinite,
  makeInputs,
  makeRandom,
  mash,
  newRace,
  runCountdown,
  steerToward,
  wallLimit,
  wallOvershoot,
} from './helpers';

const L = TRACK.length;
const EPS = 1e-9;

/**
 * The most a free-steering mech may do under the limiter: the limiter, opened
 * by the full pack bonus, with the boost lit and a full tow. Computed from the
 * live rules, for the lap phase the race is on.
 */
function limiterCeiling(race: RaceState): number {
  return limiterOf(race) * (1 + PACK_BONUS) * race.rules.boostMult * (1 + race.rules.tow);
}

/** Drive per second that arrives on its own (nothing on the formation lap by default). */
function trickle(race: RaceState): number {
  return race.lapPhase <= 1 && race.rules.lap1Trickle < 0.5 ? 0 : race.rules.drivePassive;
}

describe('the limiter (laps 1 and 2) and the speed lap', () => {
  // A person drives three clean laps alone: the other five stay parked on
  // the grid, pushed to the walls so they are not in the way.
  for (const id of [FW0, MF1, DF0]) {
    const c = CLASSES[id >> 1];
    it(`${c.frame}: holding the throttle reaches the limiter and never passes it until lap 3`, () => {
      const race = newRace(1, { humans: 'all' });
      const inputs = race.mechs.map(() => emptyInput());
      runCountdown(race, inputs);
      for (const m of race.mechs) if (m.id !== id) m.d = Math.sign(m.d) * 23;
      const me = race.mechs[id];
      const { limiter1, limiter2 } = race.rules;
      const max = [0, 0, 0, 0];
      const lapStart: number[] = [];
      let ticksAtLimiter = 0;
      while (!me.finished && race.tick < 60 * 60 * 6) {
        steerToward(me, inputs[id]);
        const phase = race.lapPhase;
        // The cap that applies to this tick is the one of the phase it begins in.
        const limiter = limiterOf(race);
        stepRace(race, TRACK, inputs);
        max[phase] = Math.max(max[phase], me.speed);
        if (phase < 3 && me.speed >= limiter - EPS) ticksAtLimiter++;
        for (const e of race.events) if (e.type === 'lap' || e.type === 'finish') lapStart.push(race.tick);
      }
      expect(me.finished).toBe(true);
      // Laps 1 and 2: the leader of the race gets the limiter of that lap and
      // not a hair more. The battle lap's limiter is the higher of the two.
      expect(max[1]).toBeLessThanOrEqual(limiter1 + EPS);
      expect(max[2]).toBeLessThanOrEqual(limiter2 + EPS);
      expect(max[1]).toBeGreaterThan(limiter1 - EPS);
      expect(max[2]).toBeGreaterThan(limiter2 - EPS);
      expect(limiter2).toBeGreaterThan(limiter1);
      // ...and it spends nearly all of both laps sitting on it.
      expect(ticksAtLimiter).toBeGreaterThan(lapStart[1] * 0.9);
      // A lap at the battle-lap limiter: 8640 units at 125 u/s is 69 seconds.
      const lap2 = (lapStart[1] - lapStart[0]) * DT;
      expect(lap2).toBeGreaterThan(L / limiter2 - 0.01);
      expect(lap2).toBeLessThan((L / limiter2) * 1.02);
      // Lap 3: the class top speed, at full armour.
      expect(max[3]).toBeGreaterThan(c.topSpeed - 2);
      expect(max[3]).toBeLessThanOrEqual(c.topSpeed + EPS);
      const lap3 = (lapStart[2] - lapStart[1]) * DT;
      expect(lap3).toBeLessThan(lap2 - 5);
      // Alone on the racing line it threads no gate and so earns no Cell.
      expect(me.cells).toBe(0);
    });
  }

  it('accelerates smoothly from rest up to the limiter', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250, 0, 0);
    a.inputs[FW0].throttle = 1;
    let prev = 0;
    let reached = -1;
    a.step(480, () => {
      expect(m.speed).toBeGreaterThanOrEqual(prev);
      expect(m.speed).toBeLessThanOrEqual(a.pace + EPS);
      if (reached < 0 && m.speed >= a.pace - EPS) reached = a.race.tick;
      prev = m.speed;
    });
    expect(m.speed).toBeCloseTo(a.pace, 9);
    expect(reached).toBeGreaterThan(0);
    // No steering on a straight road: dead ahead.
    expect(m.d).toBeCloseTo(0, 9);
    expect(m.vs).toBeCloseTo(m.speed, 9);
  });

  it('partial throttle holds a proportion of the limiter', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250, 0, 0);
    a.inputs[FW0].throttle = 0.5;
    a.step(400);
    expect(m.speed).toBeCloseTo(a.pace * 0.5, 9);
  });

  it('packBonus opens the limiter for mechs dropped by the leader, up to PACK_BONUS', () => {
    const a = new Arena(1);
    const m = a.put(FW0, 0);
    const c = CLASSES[m.role];
    const at = (gap: number) => {
      a.race.leaderS = m.s + gap;
      return packBonus(a.race, m);
    };
    expect(at(0)).toBe(0);
    expect(at(-50)).toBe(0); // the leader itself, or anyone ahead of the reference
    expect(at(PACK_SLACK)).toBe(0);
    expect(at((PACK_SLACK + PACK_FULL) / 2)).toBeCloseTo(PACK_BONUS / 2, 12);
    expect(at(PACK_FULL)).toBeCloseTo(PACK_BONUS, 12);
    expect(at(5000)).toBeCloseTo(PACK_BONUS, 12);
    a.race.leaderS = m.s + PACK_FULL;
    expect(speedCap(a.race, m, c)).toBeCloseTo(a.race.rules.limiter1 * (1 + PACK_BONUS), 9);
    a.race.lapPhase = 2;
    expect(speedCap(a.race, m, c)).toBeCloseTo(a.race.rules.limiter2 * (1 + PACK_BONUS), 9);
    // No pack bonus on the speed lap: class speed only.
    a.race.lapPhase = 3;
    expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed, 9);
  });

  it('a straggler runs at up to the limiter x (1 + PACK_BONUS), and no faster', () => {
    for (const lapPhase of [1, 2] as const) {
      const a = new Arena(lapPhase);
      const m = a.put(FW0, -250);
      a.put(MF1, 2500, 20, 0); // the "leader", parked far up the road
      let max = 0;
      a.step(300, () => (max = Math.max(max, m.speed)));
      expect(max).toBeCloseTo(a.pace * (1 + PACK_BONUS), 6);
      expect(max).toBeLessThanOrEqual(a.pace * (1 + PACK_BONUS) + EPS);
    }
  });

  it('lap 3 top speed scales with remaining armour, from rules.armourFloor up to 1', () => {
    for (const id of [FW0, MF0, DF0]) {
      const a = new Arena(3);
      const m = a.put(id, 0);
      const c = CLASSES[m.role];
      const floor = a.race.rules.armourFloor;
      expect(floor).toBeGreaterThan(0);
      expect(floor).toBeLessThan(1);
      expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed, 9);
      m.hp = c.maxHp / 2;
      expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed * (floor + (1 - floor) / 2), 9);
      m.hp = 1e-6;
      expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed * floor, 4);
      // speedCap on the speed lap is the frame's own top speed, nothing else.
      expect(speedCap(a.race, m, c)).toBe(ownTopSpeed(a.race, m, c));
    }
    // And the mech really is held to it.
    const a = new Arena(3);
    const m = a.put(DF0, -250);
    m.hp = CLASSES[m.role].maxHp * 0.5;
    const cap = speedCap(a.race, m, CLASSES[m.role]);
    m.speed = m.vs = cap - 1;
    let max = 0;
    a.step(300, () => (max = Math.max(max, m.speed)));
    expect(max).toBeCloseTo(cap, 9);
    expect(max).toBeLessThanOrEqual(cap + EPS);
  });

  it('classes differ on the speed lap: forward fastest, defender slowest', () => {
    expect(CLASSES[0].topSpeed).toBeGreaterThan(CLASSES[1].topSpeed);
    expect(CLASSES[1].topSpeed).toBeGreaterThan(CLASSES[2].topSpeed);
    // The v0.2 frame sheet: 160 / 152.5 / 145 u/s flat out, the quicker
    // frames quicker off the mark as well, and the same brakes for all.
    expect(CLASSES.map((c) => c.topSpeed)).toEqual([160, 152.5, 145]);
    expect(CLASSES.map((c) => c.accel)).toEqual([45, 40, 35]);
    expect(CLASSES.map((c) => c.brake)).toEqual([90, 90, 90]);
    // Even with no armour left, every frame is quicker on the speed lap than
    // either limiter allows.
    const { armourFloor, limiter1, limiter2 } = DEFAULT_RULES;
    for (const c of CLASSES) expect(c.topSpeed * armourFloor).toBeGreaterThan(Math.max(limiter1, limiter2));
  });

  it('a mech above the cap is dragged back down to it', () => {
    for (const lapPhase of [1, 2] as const) {
      const a = new Arena(lapPhase);
      const m = a.put(FW0, -250, 0, a.pace + 30);
      let prev = m.speed;
      a.step(60, () => {
        expect(m.speed).toBeLessThanOrEqual(prev);
        prev = m.speed;
      });
      expect(m.speed).toBeCloseTo(a.pace, 9);
    }
  });

  it('a finished mech cruises at three quarters of the pace', () => {
    const a = new Arena(3);
    const m = a.put(FW0, L - 100, 0);
    a.until(() => m.finished, 200);
    expect(m.finished).toBe(true);
    a.hold(FW0, BTN.A).step(240);
    // "The pace" after the flag is the battle-lap limiter.
    expect(m.speed).toBeCloseTo(a.race.rules.limiter2 * 0.75, 6);
    expect(speedCap(a.race, m, CLASSES[m.role])).toBe(limiterOf(a.race) * 0.75);
    expect(m.boosting).toBe(false);
  });
});

describe('the limiter in traffic', () => {
  it('a free-steering human among AIs never beats the limiter x pack bonus x boost x slipstream on laps 1-2', () => {
    // Throttle wide open for two laps, boost on for half of every few
    // seconds, AIs all around (slipstreams, bumps, and on lap 2 gunfire,
    // Snares and Rams). The human never touches the ability button, so
    // nothing but the pack bonus, the boost and the tow can lift its cap.
    const race = newRace(2, { humans: [MF1] });
    const inputs = makeInputs(race);
    const me = race.mechs[MF1];
    const inp = inputs[MF1] as MechInput;
    const max = [0, 0, 0];
    let over = 0;
    let checked = 0;
    let boosted = 0;
    let drafted = 0;
    // Being run into (or hit) can throw a mech past its cap for a moment;
    // the drag has it back within a second. That is contact, not the limiter
    // leaking, so those moments are left out of the strict check.
    let thrownUntil = -1;
    while (race.lapPhase < 3 && race.tick < 13000) {
      steerToward(me, inp, 6);
      inp.buttons = race.tick % 400 < 200 ? BTN.A : 0;
      // The limiter of the lap phase the tick begins in is the one that applies.
      const phase = race.lapPhase;
      const ceiling = limiterCeiling(race);
      stepRace(race, TRACK, inputs);
      for (const e of race.events) {
        if ((e.type === 'bump' && (e.a === MF1 || e.b === MF1)) || (e.type === 'hit' && e.victim === MF1)) thrownUntil = race.tick + 60;
      }
      if (race.tick > thrownUntil) {
        checked++;
        max[phase] = Math.max(max[phase], me.speed);
        if (me.speed > ceiling + EPS) over++;
      }
      if (me.boosting) boosted++;
      if (me.drafting) drafted++;
    }
    expect(race.lapPhase).toBe(3);
    expect(me.retired).toBe(false);
    expect(me.mode).toBe(MODE.SPEED);
    expect(boosted).toBeGreaterThan(100);
    expect(drafted).toBeGreaterThan(100);
    expect(checked).toBeGreaterThan(race.tick * 0.6);
    expect(over).toBe(0);
    // The boost was really used: on the battle lap, where Drive trickles in,
    // the human got well past what the limiter and a tow alone would give.
    expect(max[2]).toBeGreaterThan(race.rules.limiter2 * (1 + race.rules.tow) * 1.05);
    expect(max[1]).toBeGreaterThan(race.rules.limiter1 - EPS);
  });
});

describe('boost', () => {
  // The same on the formation lap and on the battle lap, each with its own
  // limiter; what differs is whether Drive trickles in while it burns.
  for (const lapPhase of [1, 2] as const) {
    it(`lap ${lapPhase}: raises the cap by rules.boostMult and drains Drive at BOOST_COST per second`, () => {
      const a = new Arena(lapPhase);
      const m = a.put(FW0, -250);
      const pace = a.pace;
      const mult = a.race.rules.boostMult;
      expect(pace).toBe(lapPhase === 1 ? a.race.rules.limiter1 : a.race.rules.limiter2);
      expect(mult).toBeGreaterThan(1);
      m.drive = 60;
      a.hold(FW0, BTN.A);
      let max = 0;
      const n = 120;
      a.step(n, () => {
        expect(m.boosting).toBe(true);
        max = Math.max(max, m.speed);
      });
      expect(a.events('boost').length).toBe(1);
      expect(a.events('boost')[0].mech).toBe(FW0);
      expect(m.drive).toBeCloseTo(60 - n * (BOOST_COST - trickle(a.race)) * DT, 6);
      expect(max).toBeGreaterThan(pace + 5);
      expect(max).toBeLessThanOrEqual(pace * mult + EPS);
      a.step(100);
      expect(m.speed).toBeCloseTo(pace * mult, 6);
      // Let go: the boost ends and the speed comes back to the limiter.
      a.release(FW0, BTN.A).step(60);
      expect(m.boosting).toBe(false);
      expect(m.speed).toBeCloseTo(pace, 6);
    });
  }

  it('the boost multiplier is a rule: pinned limiters and a different boostMult', () => {
    const a = new Arena(2, 1, { limiter1: 100, limiter2: 100, boostMult: 1.5, drivePassive: 0 });
    const m = a.put(FW0, -250);
    expect(m.speed).toBe(100);
    m.drive = 100;
    a.hold(FW0, BTN.A).step(300);
    expect(m.boosting).toBe(true);
    expect(m.speed).toBeCloseTo(150, 6);
    expect(m.drive).toBeCloseTo(100 - 300 * BOOST_COST * DT, 6);
  });

  it('needs the throttle open', () => {
    const a = new Arena(2);
    const m = a.put(FW0, -250);
    a.inputs[FW0].throttle = 0.2;
    m.drive = 60;
    a.hold(FW0, BTN.A).step(30);
    expect(m.boosting).toBe(false);
    expect(a.events('boost').length).toBe(0);
    // Nothing was burnt; the battle-lap trickle even added a little.
    expect(m.drive).toBeCloseTo(60 + 30 * a.race.rules.drivePassive * DT, 9);
    expect(m.drive).toBeGreaterThan(60);
  });

  it('each new press is a new boost event', () => {
    const a = new Arena(1);
    a.put(FW0, -250).drive = 60;
    a.hold(FW0, BTN.A).step(10).release(FW0, BTN.A).step(10).hold(FW0, BTN.A).step(10);
    expect(a.events('boost').length).toBe(2);
  });

  it('stops when the Drive gauge is empty, even with the button held', () => {
    // On the battle lap, where the gauge has a passive trickle to relight from.
    const a = new Arena(2);
    const m = a.put(FW0, -250);
    const passive = a.race.rules.drivePassive;
    expect(passive).toBeGreaterThan(0);
    m.drive = 20;
    a.hold(FW0, BTN.A);
    // 20 Drive buys about 1.4 seconds.
    const dry = a.until(() => !m.boosting && a.race.tick > 250, 200);
    expect(dry).toBeGreaterThan(70);
    expect(dry).toBeLessThan(100);
    // From here on the button is still down but the tank is empty. The boost
    // only relights once the passive trickle has put BOOST_MIN_START back in
    // the gauge, then burns that off again.
    const window = 600;
    let boostTicks = 0;
    let maxDrive = 0;
    let maxSpeed = 0;
    a.step(60); // let the over-speed bleed off first
    a.step(window, () => {
      if (m.boosting) boostTicks++;
      maxDrive = Math.max(maxDrive, m.drive);
      maxSpeed = Math.max(maxSpeed, m.speed);
    });
    const gained = window * DT * passive;
    expect(boostTicks).toBeLessThanOrEqual(Math.ceil((gained + BOOST_MIN_START) / (BOOST_COST * DT)) + 1);
    expect(maxDrive).toBeLessThan(BOOST_MIN_START + passive * DT + EPS);
    expect(maxSpeed).toBeLessThan(a.pace * a.race.rules.boostMult + 0.5);
    expect(a.events('boost').filter((e) => e.tick > a.race.tick - window).length).toBeLessThanOrEqual(2);
    expect(m.drive).toBeGreaterThanOrEqual(0);
  });

  it('on the formation lap an empty gauge stays empty: the boost never relights by itself', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
    m.drive = 20;
    a.hold(FW0, BTN.A).step(1);
    expect(m.boosting).toBe(true);
    // 20 Drive buys 80 ticks, and not one more: nothing comes in to stretch it.
    // (One has been spent already; `until` sees the first dry tick.)
    const dry = a.until(() => !m.boosting, 200);
    expect(dry).toBe(20 / (BOOST_COST * DT));
    const left = m.drive;
    expect(left).toBeLessThan(BOOST_COST * DT);
    a.clearLog();
    a.step(900, () => expect(m.boosting).toBe(false));
    expect(m.drive).toBe(left);
    expect(a.events('boost').length).toBe(0);
    expect(m.speed).toBeCloseTo(a.pace, 6);
  });

  it('never takes Drive below zero', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
    m.drive = 1;
    a.hold(FW0, BTN.A).step(300, () => expect(m.drive).toBeGreaterThanOrEqual(0));
  });
});

describe('slipstream', () => {
  // (The tow's charge, range and slingshot have their own file, slipstream.test.ts.)
  it('tucking in behind another mech lifts the cap by rules.tow and feeds Drive', () => {
    // On the battle lap: the formation lap gives the tow but no Drive for it.
    const a = new Arena(2);
    const me = a.put(FW0, -250, 0);
    const tow = a.put(FW1, -225, 0);
    const { tow: bonus, drivePassive, driveDraft } = a.race.rules;
    const drive0 = me.drive;
    let max = 0;
    a.step(120, () => {
      expect(me.drafting).toBe(true);
      expect(tow.drafting).toBe(false);
      max = Math.max(max, me.speed);
    });
    expect(max).toBeGreaterThan(a.pace + 1);
    expect(max).toBeLessThanOrEqual(a.pace * (1 + bonus) + EPS);
    expect(tow.speed).toBeCloseTo(a.pace, 9);
    expect(me.drive - drive0).toBeCloseTo(120 * (drivePassive + driveDraft) * DT, 6);
  });

  it('needs the tow to be in line and in front, and both mechs up to speed', () => {
    const cases: Array<{ ahead: number; side: number; towSpeed: number; why: string }> = [
      { ahead: 25, side: 6, towSpeed: -1, why: 'out of line' },
      { ahead: -25, side: 0, towSpeed: -1, why: 'tow is behind' },
      { ahead: 25, side: 0, towSpeed: 40, why: 'tow is too slow to punch a hole in the air' },
    ];
    for (const c of cases) {
      const a = new Arena(1);
      const me = a.put(FW0, -250, 0);
      const towSpeed = c.towSpeed < 0 ? a.pace : c.towSpeed;
      a.put(FW1, -250 + c.ahead, c.side, towSpeed);
      if (towSpeed < a.pace) a.inputs[FW1].throttle = towSpeed / a.pace;
      a.step(12, () => {
        if (me.drafting) throw new Error(`drafting although ${c.why}`);
      });
      expect(me.tow).toBe(0);
      expect(me.speed).toBeLessThanOrEqual(a.pace + EPS);
    }
  });

  it('boost and slipstream stack, and that is the most the limiter ever allows', () => {
    for (const lapPhase of [1, 2] as const) {
      const a = new Arena(lapPhase);
      const me = a.put(FW0, -250, 0);
      a.put(FW1, -215, 0);
      a.put(MF1, 2500, 20, 0); // far-away leader: full pack bonus for both
      me.drive = 100;
      a.hold(FW0, BTN.A);
      let max = 0;
      a.step(240, () => (max = Math.max(max, me.speed)));
      expect(max).toBeLessThanOrEqual(limiterCeiling(a.race) + EPS);
      expect(max).toBeGreaterThan(a.pace * (1 + PACK_BONUS) * a.race.rules.boostMult);
    }
  });
});

describe('steering, braking and the walls', () => {
  it('stick right moves right (positive d), stick left moves left', () => {
    for (const dir of [1, -1]) {
      const a = new Arena(1);
      const m = a.put(FW0, -250);
      a.inputs[FW0].mx = dir;
      a.step(20);
      expect(Math.sign(m.d)).toBe(dir);
      expect(Math.sign(m.heading)).toBe(dir);
      expect(Math.sign(m.vd)).toBe(dir);
      expect(Math.abs(m.d)).toBeGreaterThan(0.5);
      // Centre the stick and counter-steer: the slide stops and reverses.
      const dTurn = m.d;
      a.inputs[FW0].mx = -dir;
      a.step(50);
      expect(Math.sign(m.heading)).toBe(-dir);
      expect(m.d * dir).toBeLessThan(dTurn * dir + 8);
    }
  });

  it('with the stick centred a mech holds its line down the straight', () => {
    const a = new Arena(1);
    const m = a.put(MF0, -250, 7);
    a.step(200);
    expect(m.d).toBeCloseTo(7, 9);
    expect(m.heading).toBeCloseTo(0, 9);
  });

  it('with the stick centred the road bends away under the mech in a corner', () => {
    // T1 is a right-hander (positive curvature): no steering runs wide left.
    const a = new Arena(1);
    const m = a.put(MF0, 1100, 0);
    a.step(60);
    expect(m.d).toBeLessThan(-1);
  });

  it('heading never exceeds MAX_HEADING', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250, -20, 20);
    a.inputs[FW0].throttle = 0.2;
    a.inputs[FW0].mx = 1;
    let max = 0;
    a.step(90, () => (max = Math.max(max, m.heading)));
    expect(max).toBeCloseTo(MAX_HEADING, 9);
    expect(max).toBeLessThanOrEqual(MAX_HEADING);
  });

  it('braking slows to a stop and no further', () => {
    const a = new Arena(1);
    const m = a.put(DF0, -250);
    const c = CLASSES[m.role];
    a.inputs[DF0].throttle = 0;
    a.inputs[DF0].brake = 1;
    a.step(30);
    expect(m.speed).toBeCloseTo(a.pace - 30 * (c.brake + COAST_DRAG) * DT, 6);
    expect(m.speed).toBeGreaterThan(0);
    a.step(60);
    expect(m.speed).toBe(0);
    const s = m.s;
    a.step(30, () => expect(m.speed).toBe(0));
    expect(m.s).toBe(s);
  });

  it('braking beats the throttle; lifting off just coasts', () => {
    const a = new Arena(1);
    const braking = a.put(FW0, -250, -10);
    const coasting = a.put(FW1, -250, 10);
    a.inputs[FW0].brake = 1; // throttle still fully open
    a.inputs[FW1].throttle = 0;
    a.step(30);
    expect(braking.speed).toBeLessThan(a.pace - 15);
    expect(coasting.speed).toBeCloseTo(a.pace - 30 * COAST_DRAG * DT, 6);
    expect(braking.speed).toBeLessThan(coasting.speed);
  });

  it('a mech steered at a wall stops exactly on it, and pays for the hit', () => {
    for (const id of [FW0, MF0, DF0]) {
      for (const dir of [1, -1]) {
        const a = new Arena(1);
        const m = a.put(id, -250);
        const lim = wallLimit(m);
        expect(lim).toBe(TRACK.halfWidth - CLASSES[m.role].radius);
        a.inputs[id].mx = dir;
        let touched = false;
        let scraping = 0;
        a.step(180, () => {
          expect(Math.abs(m.d)).toBeLessThanOrEqual(lim);
          if (Math.abs(m.d) === lim) touched = true;
          if (m.wall > 0) scraping++;
        });
        expect(touched).toBe(true);
        expect(scraping).toBeGreaterThan(0);
        expect(m.d * dir).toBeGreaterThan(lim - 1);
        const walls = a.events('wall').filter((e) => e.mech === id);
        expect(walls.length).toBeGreaterThan(0);
        expect(walls[0].intensity).toBeGreaterThan(7);
        // Grinding along the barrier is slow.
        expect(m.speed).toBeLessThan(a.pace - 10);
      }
    }
  });

  it('retired wrecks coast to a stop beside the nearer wall and are no obstacle', () => {
    const a = new Arena(2);
    const wreck = a.put(DF1, 0, 6);
    retire(a.race, wreck, null);
    const follower = a.put(FW0, -40, 6);
    a.step(400, () => {
      expect(wallOvershoot(wreck)).toBe(0);
      expect(follower.speed).toBeGreaterThan(a.pace - 1); // drove straight through
    });
    expect(a.events('bump').length).toBe(0);
    expect(wreck.speed).toBe(0);
    expect(wreck.d).toBeGreaterThan(wallLimit(wreck) - 1.1);
    expect(wreck.d).toBeLessThanOrEqual(wallLimit(wreck) - 1);
    expect(follower.s).toBeGreaterThan(wreck.s);
    expect(wreck.drive).toBeLessThanOrEqual(DRIVE_MAX);
    // A wreck gives no tow either.
    expect(follower.tow).toBe(0);
    expect(follower.speed).toBeLessThanOrEqual(a.pace + EPS);
  });
});

describe('collisions', () => {
  it('overlapping mechs are pushed apart, the lighter one further', () => {
    const a = new Arena(1);
    const light = a.put(FW0, 0, 0);
    const heavy = a.put(DF1, 5, 0);
    const minDist = CLASSES[light.role].radius + CLASSES[heavy.role].radius;
    a.step(1);
    expect(heavy.s - light.s).toBeGreaterThanOrEqual(minDist - 1e-6);
    // Both moved one tick at the limiter, then were separated along s.
    const moved = a.pace * DT;
    const lightPush = -(light.s - (a.base + 0 + moved));
    const heavyPush = heavy.s - (a.base + 5 + moved);
    expect(lightPush).toBeGreaterThan(0);
    expect(heavyPush).toBeGreaterThan(0);
    expect(lightPush / heavyPush).toBeCloseTo(CLASSES[heavy.role].mass / CLASSES[light.role].mass, 6);
  });

  it('running into the back of someone is a bump: momentum is passed on, nobody overlaps', () => {
    const a = new Arena(1);
    const back = a.put(FW0, 0, 0, a.pace);
    const front = a.put(MF1, 12, 0, a.pace - 30);
    const minDist = CLASSES[back.role].radius + CLASSES[front.role].radius;
    a.step(90, () => expect(front.s - back.s).toBeGreaterThan(minDist - 0.75));
    const bumps = a.events('bump');
    expect(bumps.length).toBeGreaterThan(0);
    expect(bumps[0].intensity).toBeGreaterThan(9);
    expect([bumps[0].a, bumps[0].b].sort()).toEqual([FW0, MF1]);
    expect(front.s).toBeGreaterThan(back.s);
  });

  it('finished mechs are ghosts: no bumps on the cool-down lap', () => {
    const a = new Arena(3);
    const done = a.put(DF1, L - 60, 0);
    a.until(() => done.finished, 100);
    a.step(60);
    // A back-marker two laps down comes through the same piece of road.
    const racer = a.put(FW0, 0, 0, a.pace);
    racer.s = done.s - 2 * L - 30;
    racer.lap = Math.floor(racer.s / L);
    expect(deltaS(TRACK, done.s, racer.s)).toBeCloseTo(30, 6);
    a.step(240);
    expect(deltaS(TRACK, racer.s, done.s)).toBeGreaterThan(10);
    expect(racer.finished).toBe(false);
    expect(a.events('bump').length).toBe(0);
  });
});

describe('charge strips and the Drive gauge', () => {
  const strip = TRACK.strips[0]; // Grand Straight, left side

  // From lap 2 a strip pays rules.driveStrip on top of the passive trickle. On
  // the formation lap it pays rules.driveStripLap1, and there is no trickle.
  for (const lapPhase of [1, 2] as const) {
    it(`lap ${lapPhase}: riding a strip refills Drive at the strip rate of that lap, on top of any trickle`, () => {
      const a = new Arena(lapPhase);
      const rules = a.race.rules;
      const rate = lapPhase === 1 ? rules.driveStripLap1 : rules.driveStrip;
      const passive = trickle(a.race);
      expect(rate).toBeGreaterThan(0);
      expect(passive).toBe(lapPhase === 1 ? 0 : rules.drivePassive);
      const on = a.put(FW0, strip.s0 + 5, strip.d);
      const off = a.put(FW1, strip.s0 + 5, strip.d + strip.halfW + 6);
      on.drive = off.drive = 20;
      const n = 100;
      a.step(n, () => {
        expect(on.onStrip).toBe(true);
        expect(off.onStrip).toBe(false);
      });
      expect(on.drive).toBeCloseTo(20 + n * (passive + rate) * DT, 6);
      expect(off.drive).toBeCloseTo(20 + n * passive * DT, 6);
      // Run off the end: charging stops.
      a.until(() => !on.onStrip, 200);
      expect(on.s - a.base).toBeGreaterThan(strip.s1);
      const after = on.drive;
      a.step(60);
      expect(on.drive).toBeCloseTo(after + 60 * passive * DT, 6);
    });

    it(`lap ${lapPhase}: a strip does nothing for a mech crawling over it`, () => {
      const a = new Arena(lapPhase);
      const m = a.put(FW0, strip.s0 + 5, strip.d, 25);
      a.inputs[FW0].throttle = 25 / a.pace; // holds 25 u/s, under the 30 needed
      m.drive = 20;
      a.step(100, () => expect(m.onStrip).toBe(false));
      expect(m.speed).toBeCloseTo(25, 6);
      expect(m.drive).toBeCloseTo(20 + 100 * trickle(a.race) * DT, 6);
    });
  }

  it('Drive tops out at DRIVE_MAX', () => {
    const a = new Arena(1);
    const m = a.put(FW0, strip.s0 + 5, strip.d);
    m.drive = DRIVE_MAX - 0.5;
    a.step(120, () => expect(m.drive).toBeLessThanOrEqual(DRIVE_MAX));
    expect(m.drive).toBe(DRIVE_MAX);
  });

  it('Drive does not trickle in for mechs out of the race', () => {
    const a = new Arena(2);
    const wreck = a.put(FW0, 0, 0);
    wreck.drive = 20;
    retire(a.race, wreck, null);
    a.step(120);
    expect(wreck.drive).toBe(20);
  });
});

describe('fuzz: whatever a person does with the controller', () => {
  /** Full race with button-mashing humans; checks every tick. */
  function fuzzRace(seed: number, humans: number[]): { ended: boolean; ticks: number; abilities: number } {
    const race = newRace(seed, { humans });
    const inputs = makeInputs(race);
    const rnd = makeRandom(seed * 7919 + humans.length);
    const fail = (what: string): never => {
      throw new Error(`seed ${seed} tick ${race.tick}: ${what}`);
    };
    const was = race.mechs.map((m) => ({ hp: m.hp, lap: m.lap, cells: m.cells, retired: false, finished: false }));
    const rules = race.rules;
    let phase = race.lapPhase;
    let kos = 0;
    let credited = 0;
    let abilities = 0;
    while (race.phase !== PHASE.FINISHED && race.tick < 60 * 60 * 8) {
      for (const id of humans) mash(rnd, inputs[id] as MechInput);
      const phaseBefore = race.lapPhase;
      stepRace(race, TRACK, inputs);
      const bad = findNonFinite(race);
      if (bad) fail(`non-finite ${bad}`);
      if (race.lapPhase < phase) fail(`lap phase went back from ${phase} to ${race.lapPhase}`);
      phase = race.lapPhase;
      for (const e of race.events) {
        // Mashing X, Y and the ability button all through the formation lap must achieve nothing.
        if (phaseBefore === 1 && (e.type === 'windup' || e.type === 'shot' || e.type === 'hit' || e.type === 'splat' || e.type === 'ko' || e.type === 'ability' || e.type === 'snared')) {
          fail(`'${e.type}' on the formation lap`);
        }
        if (e.type === 'ko') {
          kos++;
          if (e.by >= 0) credited++;
        }
        if (e.type === 'ability') {
          abilities++;
          // Every use costs exactly one whole Cell, and there was one to spend.
          const w = was[e.mech];
          if (w.cells < 1 || race.mechs[e.mech].cells !== w.cells - 1) fail(`mech ${e.mech} ability with cells ${w.cells} -> ${race.mechs[e.mech].cells}`);
        }
      }
      for (const m of race.mechs) {
        const c = CLASSES[m.role];
        const w = was[m.id];
        if (wallOvershoot(m) > EPS) fail(`mech ${m.id} is ${wallOvershoot(m)} through the wall`);
        if (m.hp < 0 || m.hp > w.hp) fail(`mech ${m.id} hp ${w.hp} -> ${m.hp}`);
        if (m.drive < 0 || m.drive > DRIVE_MAX) fail(`mech ${m.id} drive ${m.drive}`);
        if (m.guard < 0 || m.guard > c.guardMax) fail(`mech ${m.id} guard ${m.guard}`);
        if (m.speed < 0) fail(`mech ${m.id} speed ${m.speed}`);
        if (m.cells < 0 || m.cells > rules.cellMax) fail(`mech ${m.id} cells ${m.cells}`);
        if (m.tow < 0 || m.tow > 1) fail(`mech ${m.id} tow ${m.tow}`);
        if (m.cdAbility < 0 || m.overdriveT < 0 || m.ramT < 0 || m.shieldT < 0 || m.snareT < 0 || m.cloakT < 0) fail(`mech ${m.id} has a negative timer`);
        // Cells only ever arrive from gates, and only before the weapons are free for that mech.
        if (m.cells > w.cells && m.lap >= rules.gateLaps) fail(`mech ${m.id} gained a Cell on lap ${m.lap + 1}`);
        w.cells = m.cells;
        if ((m.mode === MODE.BATTLE) !== (m.target >= 0)) fail(`mech ${m.id} mode/target mismatch`);
        if (m.target >= 0 && (m.target === m.id || race.mechs[m.target].retired || race.mechs[m.target].finished)) {
          fail(`mech ${m.id} is locked on to ${m.target}, who is out of the race`);
        }
        if (m.lap < w.lap || (w.retired && !m.retired) || (w.finished && !m.finished)) fail(`mech ${m.id} went back in time`);
        if (m.retired && (m.finished || m.hp !== 0)) fail(`mech ${m.id} is a wreck with hp ${m.hp} / finished ${m.finished}`);
        if (phaseBefore === 1 && race.lapPhase === 1 && m.hp !== c.maxHp) fail(`mech ${m.id} lost armour on the formation lap`);
        w.hp = m.hp;
        w.lap = m.lap;
        w.retired = m.retired;
        w.finished = m.finished;
      }
    }
    // The result still adds up: placing points for the classified runners,
    // plus rules.koPoints for every knock-out somebody was credited with.
    const classified = race.mechs.filter((m) => !m.retired).length;
    expect(kos).toBe(race.mechs.length - classified);
    expect(race.mechs.reduce((sum, m) => sum + m.kos, 0)).toBe(credited);
    expect(race.mechs.map((m) => m.place).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(race.mechs.reduce((sum, m) => sum + m.points, 0)).toBe(POINTS.slice(0, classified).reduce((a, b) => a + b, 0) + credited * rules.koPoints);
    for (const m of race.mechs) expect(m.points).toBe((m.retired ? 0 : POINTS[m.place - 1]) + m.kos * rules.koPoints);
    return { ended: race.phase === PHASE.FINISHED, ticks: race.tick, abilities };
  }

  it('one masher among AIs: state stays finite, inside the walls and in range (3 seeds)', () => {
    expect(fuzzRace(11, [FW0]).ended).toBe(true);
    expect(fuzzRace(22, [MF1]).ended).toBe(true);
    expect(fuzzRace(33, [DF0]).ended).toBe(true);
  });

  it('several mashers: one per team, and a full grid of them', () => {
    expect(fuzzRace(55, [FW1, DF0]).ended).toBe(true);
    const full = fuzzRace(66, [FW0, FW1, MF0, MF1, DF0, DF1]);
    expect(full.ended).toBe(true);
    // Nobody steers a masher through a gate on purpose, so a grid of them has few Cells to burn.
    expect(full.abilities).toBeLessThanOrEqual(6 * DEFAULT_RULES.cellMax);
  });

  it('out-of-range (but finite) stick and trigger values are clamped, not trusted', () => {
    const race = newRace(5, { humans: [FW0, MF1] });
    const inputs = makeInputs(race);
    const rnd = makeRandom(99);
    runCountdown(race, inputs);
    let maxSpeed = 0;
    for (let i = 0; i < 4000; i++) {
      for (const id of [FW0, MF1]) {
        const inp = inputs[id] as MechInput;
        if (rnd() < 0.1) {
          inp.mx = (rnd() - 0.5) * 2000;
          inp.my = (rnd() - 0.5) * 2000;
          inp.throttle = (rnd() - 0.2) * 1000;
          inp.brake = rnd() < 0.8 ? -500 * rnd() : rnd() * 1000;
          inp.buttons = Math.floor(rnd() * (BTN_MASK + 1));
        }
      }
      // Speed at the moment it is used: after the tick's own movement, before
      // any contact with another mech adds to it.
      stepRace(race, TRACK, inputs);
      expect(findNonFinite(race)).toBe(null);
      let bumped = false;
      for (const e of race.events) if (e.type === 'bump') bumped = true;
      for (const id of [FW0, MF1]) {
        expect(wallOvershoot(race.mechs[id])).toBeLessThanOrEqual(EPS);
        if (race.mechs[id].mode === MODE.SPEED && !bumped) maxSpeed = Math.max(maxSpeed, race.mechs[id].speed);
      }
    }
    // 4000 ticks is still the formation lap. A huge throttle value is no
    // faster than a full one: the most the limiter allows, and a little over
    // for a mech that has just been thrown (a dash carried out of a lock).
    expect(race.lapPhase).toBe(1);
    expect(maxSpeed).toBeGreaterThan(race.rules.limiter1 - 1);
    expect(maxSpeed).toBeLessThanOrEqual(limiterCeiling(race) * SPEED_CEILING + EPS);
  });

  // OPEN QUESTION (see report): stepRace trusts the numbers it is given. A
  // NaN stick value goes straight through clamp() into steer -> heading ->
  // position and poisons the mech for the rest of the race. In the browser
  // the input layer never produces NaN, but a server taking inputs off the
  // network must validate them, or stepRace should.
  it('non-finite inputs do not corrupt the race state', () => {
    const race = newRace(5, { humans: [FW0] });
    const inputs = makeInputs(race);
    runCountdown(race, inputs);
    (inputs[FW0] as MechInput).mx = NaN;
    (inputs[FW0] as MechInput).throttle = 1;
    for (let i = 0; i < 10; i++) stepRace(race, TRACK, inputs);
    expect(findNonFinite(race)).toBe(null);
  });
});

describe('dash and the limiter', () => {
  // Once the most important OPEN QUESTION of this suite: dashing was not held
  // to the limiter, and releasing the lock used to turn the whole dash
  // velocity into free-steering speed. Lock - dash - unlock, repeated on the
  // dash cooldown, stacked to more than twice the limiter (it worked on the
  // formation lap, and with a team-mate as the "target"). The rules say boost,
  // slipstream and pack bonus are the only things above the limiter on laps
  // 1-2. Two things hold that now: free steering is cut to SPEED_CEILING x
  // the cap as it moves, and inside the lock a dash down the road is capped
  // (battle cap + DASH_OVER of the dash) and scrubbed when it ends.
  for (const lapPhase of [1, 2] as const) {
    it(`lap ${lapPhase}: lock-dash-unlock cannot be chained to outrun the limiter`, () => {
      // (On the battle lap the limiter is higher and a fight is carried
      // faster, rules.battleMove; the answer has to be the same.)
      const a = new Arena(lapPhase);
      const me = a.put(FW0, -250, 0);
      const mate = a.put(MF0, -210, 8);
      const s0 = me.s;
      const t0 = a.race.tick;
      me.drive = 100;
      let max = 0;
      let dashSpeed = 0;
      for (let rep = 0; rep < 8; rep++) {
        mate.s = me.s + 40; // keep someone to lock on to just ahead
        a.tap(FW0, BTN.ALLY);
        a.inputs[FW0].my = 1;
        a.tap(FW0, BTN.A);
        dashSpeed = Math.max(dashSpeed, me.vs);
        a.inputs[FW0].my = 0;
        a.tap(FW0, BTN.ALLY);
        expect(me.mode).toBe(MODE.SPEED);
        // Out of the lock: held to the ceiling on the very tick it lets go.
        expect(me.speed).toBeLessThanOrEqual(speedCap(a.race, me, CLASSES[me.role]) * (1 + a.race.rules.tow) * SPEED_CEILING + EPS);
        a.step(34, () => (max = Math.max(max, me.speed)));
      }
      // The trick was really tried: eight dashes, each well over the limiter while it lasted.
      expect(a.events('dash').length).toBe(8);
      expect(dashSpeed).toBeGreaterThan(a.pace * 1.3);
      expect(max).toBeLessThanOrEqual(limiterCeiling(a.race) + EPS);
      // And over the whole exercise (five seconds, 80 Drive) it has covered
      // more ground than the limiter allows, but less than simply holding
      // the boost button for the same time would have: it is not a way round
      // the rules, just a clumsy way to spend Drive.
      // (Measured at the time of writing: 16% up on the limiter; the boost is 20%.)
      const atLimiter = a.pace * (a.race.tick - t0) * DT;
      const gain = me.s - s0 - atLimiter;
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThan(atLimiter * (a.race.rules.boostMult - 1));
      expect(me.drive).toBeLessThan(100 - 8 * CLASSES[me.role].dashCost + 30);
    });
  }

  /**
   * The other half of the old question: never let go of the lock at all.
   * Lock a mech that is BEHIND, leave the stick alone and press dash on
   * every cooldown: with no direction held the dash "hops straight back",
   * away from the target, which is straight down the road. Dashes used to
   * stack this way (each one started before the last had worn off): 282 u/s
   * after four of them on a 110 u/s formation lap, and 431 u/s for two
   * team-mates locked on each other. Now a dash down the road carries only
   * DASH_OVER of its speed over the battle cap, and whatever is over the cap
   * when it ends is scrubbed at DASH_BLEED, long before the next one is ready.
   */
  function hopAway(lapPhase: 1 | 2 | 3, ticks: number, chaserId = FW1) {
    const a = new Arena(lapPhase);
    const me = a.put(FW0, -200, 0);
    const chaser = a.put(chaserId, -212, 6); // twelve units behind
    if (lapPhase === 3) {
      a.step(200, () => a.recenter([FW0, chaserId]));
      chaser.s = me.s - 12;
    }
    me.drive = 100;
    const top = me.speed;
    a.tap(FW0, chaserId === FW1 ? BTN.LOCK : BTN.ALLY);
    expect(me.target).toBe(chaserId);
    let maxVs = 0;
    let dist = 0;
    let prev = me.s;
    const peaks: number[] = [];
    for (let i = 0; i < ticks; i++) {
      a.inputs[FW0].buttons = me.mode === MODE.BATTLE && me.cdDash === 0 && (me.prevButtons & BTN.A) === 0 ? BTN.A : 0;
      a.step(1);
      dist += me.s - prev;
      a.recenter([FW0, chaserId]);
      prev = me.s;
      maxVs = Math.max(maxVs, me.vs);
      if (a.race.events.some((e) => e.type === 'dash')) peaks.push(me.vs);
    }
    return { a, me, top, maxVs, peaks, avg: dist / (ticks * DT), dashes: a.events('dash').length, driveUsed: 100 - me.drive };
  }

  /** The most a dash may carry a locked mech to: the battle cap for a target ahead, plus DASH_OVER of the dash. */
  function dashCeiling(race: RaceState, m: MechState): number {
    const c = CLASSES[m.role];
    const limiter = limiterOf(race);
    const cap = race.lapPhase < 3 ? Math.max(limiter * BATTLE_CAP_MULT, limiter * (1 + packBonus(race, m))) : ownTopSpeed(race, m, c) * BATTLE_CAP_LAP3;
    return cap + c.dash * DASH_OVER;
  }

  it('(the hop itself works as a dash should: away from the target, paid for, on its cooldown)', () => {
    const { a, dashes, driveUsed, me } = hopAway(1, 300);
    // A dash every DASH_COOLDOWN or so for as long as the lock holds and the Drive lasts.
    expect(dashes).toBeGreaterThanOrEqual(4);
    expect(dashes).toBeLessThanOrEqual(10);
    expect(driveUsed).toBeCloseTo(dashes * CLASSES[me.role].dashCost, 6);
    const at = a.events('dash').map((e) => e.tick);
    for (let k = 1; k < at.length; k++) expect(at[k] - at[k - 1]).toBeGreaterThanOrEqual(DASH_COOLDOWN);
    expect(me.s).toBeGreaterThan(a.mech(FW1).s + 12); // it did get away from the chaser
  });

  for (const lapPhase of [1, 2, 3] as const) {
    for (const id of [FW0, MF0, DF0]) {
      const c = CLASSES[id >> 1];
      it(`lap ${lapPhase}, ${c.frame}: a dash down the road is capped at the battle cap + DASH_OVER of the dash, for as long as it lasts`, () => {
        const a = new Arena(lapPhase);
        const me = a.put(id, -200, 0);
        const foe = a.put(FW1, -170, 8);
        if (lapPhase === 3) a.step(150, () => {
          a.recenter([id, FW1]);
          foe.s = me.s + 30;
        });
        me.drive = 100;
        a.tap(id, BTN.LOCK);
        a.step(20, () => {
          a.recenter([id, FW1]);
          foe.s = me.s + 30;
        });
        const before = me.vs;
        const ceiling = dashCeiling(a.race, me);
        // The whole impulse would have taken it well past that.
        expect(before + c.dash).toBeGreaterThan(ceiling + 15);
        a.inputs[id].my = 1; // straight at the target, which is straight down the road
        a.tap(id, BTN.A);
        a.inputs[id].my = 0;
        expect(me.act).toBe(ACT.DASH);
        expect(me.vs).toBeCloseTo(ceiling, 9);
        for (let k = 1; k < DASH_TICKS; k++) {
          foe.s = me.s + 30;
          a.step(1);
          expect(me.act).toBe(ACT.DASH);
          expect(me.vs).toBeLessThanOrEqual(ceiling + EPS);
          expect(me.vs).toBeCloseTo(ceiling, 6);
        }
        expect(DASH_OVER).toBeGreaterThan(0);
        expect(DASH_OVER).toBeLessThan(1);
      });
    }
  }

  it('when the dash ends, what is left over the battle cap is scrubbed at DASH_BLEED, well inside the cooldown', () => {
    for (const lapPhase of [2, 3] as const) {
      const a = new Arena(lapPhase);
      const me = a.put(FW0, -200, 0);
      const foe = a.put(FW1, -170, 8);
      if (lapPhase === 3) a.step(150, () => {
        a.recenter([FW0, FW1]);
        foe.s = me.s + 30;
      });
      me.drive = 100;
      a.tap(FW0, BTN.LOCK);
      a.step(20, () => {
        a.recenter([FW0, FW1]);
        foe.s = me.s + 30;
      });
      const ceiling = dashCeiling(a.race, me);
      const cap = ceiling - CLASSES[0].dash * DASH_OVER;
      a.inputs[FW0].my = 1;
      a.tap(FW0, BTN.A);
      a.inputs[FW0].my = 0;
      a.step(DASH_TICKS - 1, () => {
        foe.s = me.s + 30;
      });
      expect(me.act).toBe(ACT.DASH);
      expect(me.vs).toBeCloseTo(ceiling, 6);
      // From the tick the dash is over: at least DASH_BLEED a second comes
      // off (the ordinary easing toward the target's pace is on top of that)
      // until it is back on the cap.
      let ticksOver = 0;
      let cdWhenBack = -1;
      let prev = me.vs;
      while (me.cdDash > 0) {
        foe.s = me.s + 30;
        a.step(1);
        expect(me.act).toBe(ACT.NONE);
        if (prev > cap + EPS) {
          ticksOver++;
          expect(me.vs).toBeLessThanOrEqual(Math.max(cap, prev - DASH_BLEED * DT) + EPS);
        } else {
          expect(me.vs).toBeLessThanOrEqual(cap + EPS);
        }
        if (cdWhenBack < 0 && me.vs <= cap + EPS) cdWhenBack = me.cdDash;
        prev = me.vs;
      }
      expect(ticksOver).toBeGreaterThan(3);
      expect(ticksOver).toBeLessThanOrEqual(Math.ceil((CLASSES[0].dash * DASH_OVER) / (DASH_BLEED * DT)));
      // It was back on the cap with more than half the wait for the next dash
      // still to run, so the next dash starts from the cap, not from above it.
      expect(cdWhenBack).toBeGreaterThan((DASH_COOLDOWN - DASH_TICKS) / 2);
      expect(me.cdDash).toBe(0);
      expect(me.vs).toBeLessThanOrEqual(cap + EPS);
      expect(DASH_BLEED).toBeGreaterThan(CLASSES[0].battleAccel * a.race.rules.battleMove);
    }
  });

  it('speed over the battle cap that came from somewhere else (a shove) is scrubbed the same way', () => {
    const a = new Arena(2);
    const me = a.put(FW0, -200, 0);
    const foe = a.put(FW1, -170, 8);
    a.tap(FW0, BTN.LOCK);
    a.step(10, () => {
      foe.s = me.s + 30;
    });
    const cap = a.pace * BATTLE_CAP_MULT;
    me.vs = cap + 50;
    a.step(1);
    expect(me.vs).toBeLessThanOrEqual(cap + 50 - DASH_BLEED * DT + EPS);
    expect(me.vs).toBeGreaterThan(cap);
    const n = a.until(() => me.vs <= cap + EPS, 60);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(Math.ceil(50 / (DASH_BLEED * DT)));
  });

  it('a dash across the road is a full dash: only the speed down the road is capped', () => {
    const a = new Arena(2);
    const me = a.put(FW0, -200, 0);
    const foe = a.put(FW1, -170, 0);
    me.drive = 100;
    a.tap(FW0, BTN.LOCK);
    a.step(10, () => {
      foe.s = me.s + 30;
    });
    a.inputs[FW0].mx = 1;
    a.tap(FW0, BTN.A);
    a.inputs[FW0].mx = 0;
    expect(Math.abs(me.vd)).toBeGreaterThan(CLASSES[0].dash * 0.95);
    expect(me.vs).toBeLessThanOrEqual(dashCeiling(a.race, me) + EPS);
  });

  for (const lapPhase of [1, 2, 3] as const) {
    it(`lap ${lapPhase}: dash after dash inside a lock does not stack: every hop peaks at the same capped speed`, () => {
      const { a, top, maxVs, peaks, me, dashes } = hopAway(lapPhase, 300, MF0); // an escort lock: the team-mate keeps up better
      const ceiling = dashCeiling(a.race, me);
      expect(dashes).toBeGreaterThanOrEqual(6);
      expect(maxVs).toBeLessThanOrEqual(ceiling + EPS);
      // Never more than a fraction of one dash over what the mech was doing...
      expect(maxVs).toBeLessThan(top + CLASSES[me.role].dash * 0.6);
      // ...the eighth hop no quicker than the first...
      for (const v of peaks) expect(v).toBeLessThanOrEqual(peaks[0] + EPS);
      expect(Math.max(...peaks) - Math.min(...peaks)).toBeLessThan(40);
    });

    it(`lap ${lapPhase}: hopping down the road in a lock is slower than the boost, and dearer`, () => {
      // Five seconds of each, from the same speed, with a full gauge.
      const hop = hopAway(lapPhase, 300, MF0);
      const b = new Arena(lapPhase);
      const boosted = b.put(FW0, -200, 0);
      if (lapPhase === 3) b.step(200, () => b.recenter([FW0]));
      boosted.drive = 100;
      b.hold(FW0, BTN.A);
      let dist = 0;
      let prev = boosted.s;
      b.step(300, () => {
        dist += boosted.s - prev;
        b.recenter([FW0]);
        prev = boosted.s;
      });
      const boostAvg = dist / (300 * DT);
      const boostDrive = 100 - boosted.drive;
      expect(boostAvg).toBeGreaterThan(hop.top * 1.1);
      expect(hop.avg).toBeLessThan(boostAvg);
      // Ground gained on simply cruising, per point of Drive spent: the boost is the better buy.
      const hopGain = (hop.avg - hop.top) / hop.driveUsed;
      const boostGain = (boostAvg - hop.top) / boostDrive;
      expect(hopGain).toBeLessThan(boostGain);
    });
  }

  it('two team-mates locked on each other cannot dash-chain their way past the same cap', () => {
    // (This pair used to reach 431 u/s on the formation lap.)
    const a = new Arena(1);
    const front = a.put(FW0, -200, -4);
    const back = a.put(MF0, -214, 4);
    front.drive = back.drive = 100;
    a.hold(FW0, BTN.ALLY).hold(MF0, BTN.ALLY).step(1);
    expect([front.target, back.target]).toEqual([MF0, FW0]);
    a.inputs[MF0].my = 1; // the one behind dashes at its partner; the one ahead hops away
    let max = 0;
    let over = 0;
    for (let i = 0; i < 300; i++) {
      for (const m of [front, back]) {
        a.inputs[m.id].buttons = m.mode === MODE.BATTLE && m.cdDash === 0 && (m.prevButtons & BTN.A) === 0 ? BTN.A : 0;
      }
      a.step(1);
      a.recenter([FW0, MF0]);
      max = Math.max(max, front.vs, back.vs);
      for (const m of [front, back]) if (m.mode === MODE.BATTLE && m.vs > dashCeiling(a.race, m) + EPS) over++;
    }
    expect(a.events('dash').length).toBeGreaterThan(10);
    expect(over).toBe(0);
    expect(max).toBeLessThanOrEqual(a.pace * (1 + PACK_BONUS) + CLASSES[0].dash * DASH_OVER + EPS);
    expect(max).toBeLessThan(limiterCeiling(a.race));
  });

  // Fixed in 0.2: dashes used to stack downwards too. A hop back from a
  // target ahead took the full impulse off vs with no floor, so three hops
  // had a forward travelling backwards down the road. A dash now takes at
  // most DASH_OVER of its speed below the slowest a fight is carried, and
  // what is missing is made up at DASH_BLEED as soon as the dash ends.
  it('hopping back from a target ahead, dash after dash, never sends a mech backwards down the road', () => {
    for (const [lapPhase, id] of [[1, FW0], [2, FW0], [2, MF0], [2, DF0], [3, FW0]] as const) {
      const a = new Arena(lapPhase);
      const me = a.put(id, -200, 0);
      const foe = a.put(FW1, -170, 8);
      me.drive = 100;
      a.tap(id, BTN.LOCK);
      let minVs = Infinity;
      for (let i = 0; i < 200; i++) {
        a.recenter([id, FW1]);
        foe.s = Math.max(foe.s, me.s + 30); // the target stays ahead, and in range
        a.inputs[id].buttons = me.mode === MODE.BATTLE && me.cdDash === 0 && (me.prevButtons & BTN.A) === 0 ? BTN.A : 0;
        const before = me.s;
        a.step(1);
        minVs = Math.min(minVs, me.vs);
        if (me.s < before - EPS) throw new Error(`lap ${lapPhase}, mech ${id}: moved backwards at tick ${i} (vs ${me.vs})`);
      }
      expect(minVs).toBeGreaterThanOrEqual(0);
    }
  });
});

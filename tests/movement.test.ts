import { describe, expect, it } from 'vitest';
import {
  BOOST_COST,
  BOOST_MIN_START,
  BOOST_MULT,
  BTN,
  CLASSES,
  COAST_DRAG,
  DRAFT_MULT,
  DRIVE_DRAFT,
  DRIVE_MAX,
  DRIVE_PASSIVE,
  DRIVE_STRIP,
  DT,
  HP_SPEED_FLOOR,
  MAX_HEADING,
  MODE,
  PACE,
  PACK_BONUS,
  PACK_FULL,
  PACK_SLACK,
  PHASE,
  POINTS,
  deltaS,
  emptyInput,
  packBonus,
  speedCap,
  stepRace,
} from '../src/sim/index';
import type { MechInput } from '../src/sim/index';
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
      const max = [0, 0, 0, 0];
      const lapStart: number[] = [];
      let ticksAtLimiter = 0;
      while (!me.finished && race.tick < 60 * 60 * 6) {
        steerToward(me, inputs[id]);
        const phase = race.lapPhase;
        stepRace(race, TRACK, inputs);
        // The cap that applied to this tick is the one of the phase it began in.
        max[phase] = Math.max(max[phase], me.speed);
        if (phase < 3 && me.speed >= PACE - EPS) ticksAtLimiter++;
        for (const e of race.events) if (e.type === 'lap' || e.type === 'finish') lapStart.push(race.tick);
      }
      expect(me.finished).toBe(true);
      // Laps 1 and 2: the leader of the race gets PACE and not a hair more.
      expect(max[1]).toBeLessThanOrEqual(PACE + EPS);
      expect(max[2]).toBeLessThanOrEqual(PACE + EPS);
      expect(max[1]).toBeGreaterThan(PACE - EPS);
      expect(max[2]).toBeGreaterThan(PACE - EPS);
      // ...and it spends nearly all of both laps sitting on it.
      expect(ticksAtLimiter).toBeGreaterThan(lapStart[1] * 0.9);
      // 8640 units at 96 u/s is a 90 second lap.
      const lap2 = (lapStart[1] - lapStart[0]) * DT;
      expect(lap2).toBeGreaterThan(86);
      expect(lap2).toBeLessThan(94);
      // Lap 3: the class top speed, at full armour.
      expect(max[3]).toBeGreaterThan(c.topSpeed - 2);
      expect(max[3]).toBeLessThanOrEqual(c.topSpeed + EPS);
      const lap3 = (lapStart[2] - lapStart[1]) * DT;
      expect(lap3).toBeLessThan(lap2 - 5);
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
      expect(m.speed).toBeLessThanOrEqual(PACE + EPS);
      if (reached < 0 && m.speed >= PACE - EPS) reached = a.race.tick;
      prev = m.speed;
    });
    expect(m.speed).toBeCloseTo(PACE, 9);
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
    expect(m.speed).toBeCloseTo(PACE * 0.5, 9);
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
    expect(speedCap(a.race, m, c)).toBeCloseTo(PACE * (1 + PACK_BONUS), 9);
    a.race.lapPhase = 2;
    expect(speedCap(a.race, m, c)).toBeCloseTo(PACE * (1 + PACK_BONUS), 9);
    // No pack bonus on the speed lap: class speed only.
    a.race.lapPhase = 3;
    expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed, 9);
  });

  it('a straggler runs at up to PACE x (1 + PACK_BONUS), and no faster', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
    a.put(MF1, 2500, 20, 0); // the "leader", parked far up the road
    let max = 0;
    a.step(300, () => (max = Math.max(max, m.speed)));
    expect(max).toBeCloseTo(PACE * (1 + PACK_BONUS), 6);
    expect(max).toBeLessThanOrEqual(PACE * (1 + PACK_BONUS) + EPS);
  });

  it('lap 3 top speed scales with remaining armour, from HP_SPEED_FLOOR up to 1', () => {
    for (const id of [FW0, MF0, DF0]) {
      const a = new Arena(3);
      const m = a.put(id, 0);
      const c = CLASSES[m.role];
      expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed, 9);
      m.hp = c.maxHp / 2;
      expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed * (HP_SPEED_FLOOR + (1 - HP_SPEED_FLOOR) / 2), 9);
      m.hp = 1e-6;
      expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed * HP_SPEED_FLOOR, 4);
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
    for (const c of CLASSES) expect(c.topSpeed * HP_SPEED_FLOOR).toBeGreaterThan(PACE);
  });

  it('a mech above the cap is dragged back down to it', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250, 0, PACE + 30);
    let prev = m.speed;
    a.step(60, () => {
      expect(m.speed).toBeLessThanOrEqual(prev);
      prev = m.speed;
    });
    expect(m.speed).toBeCloseTo(PACE, 9);
  });

  it('a finished mech cruises at three quarters of the pace', () => {
    const a = new Arena(3);
    const m = a.put(FW0, L - 100, 0, PACE);
    a.until(() => m.finished, 200);
    expect(m.finished).toBe(true);
    a.hold(FW0, BTN.A).step(240);
    expect(m.speed).toBeCloseTo(PACE * 0.75, 6);
    expect(m.boosting).toBe(false);
  });
});

describe('the limiter in traffic', () => {
  it('a free-steering human among AIs never beats PACE x pack bonus x boost x slipstream on laps 1-2', () => {
    // Throttle wide open for two laps, boost on for half of every few
    // seconds, AIs all around (slipstreams, bumps, and on lap 2 gunfire).
    const race = newRace(2, { humans: [MF1] });
    const inputs = makeInputs(race);
    const me = race.mechs[MF1];
    const inp = inputs[MF1] as MechInput;
    const ceiling = PACE * (1 + PACK_BONUS) * BOOST_MULT * DRAFT_MULT;
    let max = 0;
    let boosted = 0;
    let drafted = 0;
    while (race.lapPhase < 3 && race.tick < 13000) {
      steerToward(me, inp, 6);
      inp.buttons = race.tick % 400 < 200 ? BTN.A : 0;
      stepRace(race, TRACK, inputs);
      max = Math.max(max, me.speed);
      if (me.boosting) boosted++;
      if (me.drafting) drafted++;
    }
    expect(race.lapPhase).toBe(3);
    expect(me.retired).toBe(false);
    expect(boosted).toBeGreaterThan(100);
    expect(drafted).toBeGreaterThan(100);
    expect(max).toBeGreaterThan(PACE * BOOST_MULT - 1);
    expect(max).toBeLessThanOrEqual(ceiling + EPS);
  });
});

describe('boost', () => {
  it('raises the cap by BOOST_MULT and drains Drive at BOOST_COST per second', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
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
    expect(m.drive).toBeCloseTo(60 - n * (BOOST_COST - DRIVE_PASSIVE) * DT, 6);
    expect(max).toBeGreaterThan(PACE + 5);
    expect(max).toBeLessThanOrEqual(PACE * BOOST_MULT + EPS);
    a.step(100);
    expect(m.speed).toBeCloseTo(PACE * BOOST_MULT, 6);
    // Let go: the boost ends and the speed comes back to the limiter.
    a.release(FW0, BTN.A).step(60);
    expect(m.boosting).toBe(false);
    expect(m.speed).toBeCloseTo(PACE, 6);
  });

  it('needs the throttle open', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
    a.inputs[FW0].throttle = 0.2;
    m.drive = 60;
    a.hold(FW0, BTN.A).step(30);
    expect(m.boosting).toBe(false);
    expect(a.events('boost').length).toBe(0);
    expect(m.drive).toBeGreaterThan(60);
  });

  it('each new press is a new boost event', () => {
    const a = new Arena(1);
    a.put(FW0, -250).drive = 60;
    a.hold(FW0, BTN.A).step(10).release(FW0, BTN.A).step(10).hold(FW0, BTN.A).step(10);
    expect(a.events('boost').length).toBe(2);
  });

  it('stops when the Drive gauge is empty, even with the button held', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
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
    const gained = window * DT * DRIVE_PASSIVE;
    expect(boostTicks).toBeLessThanOrEqual(Math.ceil((gained + BOOST_MIN_START) / (BOOST_COST * DT)) + 1);
    expect(maxDrive).toBeLessThan(BOOST_MIN_START + DRIVE_PASSIVE * DT + EPS);
    expect(maxSpeed).toBeLessThan(PACE * BOOST_MULT + 0.5);
    expect(a.events('boost').filter((e) => e.tick > a.race.tick - window).length).toBeLessThanOrEqual(2);
    expect(m.drive).toBeGreaterThanOrEqual(0);
  });

  it('never takes Drive below zero', () => {
    const a = new Arena(1);
    const m = a.put(FW0, -250);
    m.drive = 1;
    a.hold(FW0, BTN.A).step(300, () => expect(m.drive).toBeGreaterThanOrEqual(0));
  });
});

describe('slipstream', () => {
  it('tucking in behind another mech lifts the cap by DRAFT_MULT and feeds Drive', () => {
    const a = new Arena(1);
    const me = a.put(FW0, -250, 0);
    const tow = a.put(FW1, -225, 0);
    const drive0 = me.drive;
    let max = 0;
    a.step(120, () => {
      expect(me.drafting).toBe(true);
      expect(tow.drafting).toBe(false);
      max = Math.max(max, me.speed);
    });
    expect(max).toBeGreaterThan(PACE + 1);
    expect(max).toBeLessThanOrEqual(PACE * DRAFT_MULT + EPS);
    expect(tow.speed).toBeCloseTo(PACE, 9);
    expect(me.drive - drive0).toBeCloseTo(120 * (DRIVE_PASSIVE + DRIVE_DRAFT) * DT, 6);
  });

  it('needs the tow to be in line and in front, and both mechs up to speed', () => {
    const cases: Array<{ ahead: number; side: number; towSpeed: number; why: string }> = [
      { ahead: 25, side: 6, towSpeed: PACE, why: 'out of line' },
      { ahead: -25, side: 0, towSpeed: PACE, why: 'tow is behind' },
      { ahead: 25, side: 0, towSpeed: 40, why: 'tow is too slow to punch a hole in the air' },
    ];
    for (const c of cases) {
      const a = new Arena(1);
      const me = a.put(FW0, -250, 0);
      a.put(FW1, -250 + c.ahead, c.side, c.towSpeed);
      if (c.towSpeed < PACE) a.inputs[FW1].throttle = c.towSpeed / PACE;
      a.step(12, () => {
        if (me.drafting) throw new Error(`drafting although ${c.why}`);
      });
      expect(me.speed).toBeLessThanOrEqual(PACE + EPS);
    }
  });

  it('boost and slipstream stack, and that is the most the limiter ever allows', () => {
    const a = new Arena(1);
    const me = a.put(FW0, -250, 0);
    a.put(FW1, -215, 0);
    a.put(MF1, 2500, 20, 0); // far-away leader: full pack bonus for both
    me.drive = 100;
    a.hold(FW0, BTN.A);
    let max = 0;
    a.step(240, () => (max = Math.max(max, me.speed)));
    const ceiling = PACE * (1 + PACK_BONUS) * BOOST_MULT * DRAFT_MULT;
    expect(max).toBeLessThanOrEqual(ceiling + EPS);
    expect(max).toBeGreaterThan(PACE * (1 + PACK_BONUS) * BOOST_MULT);
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
    expect(m.speed).toBeCloseTo(PACE - 30 * (c.brake + COAST_DRAG) * DT, 6);
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
    expect(braking.speed).toBeLessThan(PACE - 15);
    expect(coasting.speed).toBeCloseTo(PACE - 30 * COAST_DRAG * DT, 6);
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
        expect(m.speed).toBeLessThan(PACE - 10);
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
      expect(follower.speed).toBeGreaterThan(PACE - 1); // drove straight through
    });
    expect(a.events('bump').length).toBe(0);
    expect(wreck.speed).toBe(0);
    expect(wreck.d).toBeGreaterThan(wallLimit(wreck) - 1.1);
    expect(wreck.d).toBeLessThanOrEqual(wallLimit(wreck) - 1);
    expect(follower.s).toBeGreaterThan(wreck.s);
    expect(wreck.drive).toBeLessThanOrEqual(DRIVE_MAX);
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
    // Both moved one tick at PACE, then were separated along s.
    const moved = PACE * DT;
    const lightPush = -(light.s - (a.base + 0 + moved));
    const heavyPush = heavy.s - (a.base + 5 + moved);
    expect(lightPush).toBeGreaterThan(0);
    expect(heavyPush).toBeGreaterThan(0);
    expect(lightPush / heavyPush).toBeCloseTo(CLASSES[heavy.role].mass / CLASSES[light.role].mass, 6);
  });

  it('running into the back of someone is a bump: momentum is passed on, nobody overlaps', () => {
    const a = new Arena(1);
    const back = a.put(FW0, 0, 0, PACE);
    const front = a.put(MF1, 12, 0, PACE - 30);
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
    const racer = a.put(FW0, 0, 0, PACE);
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

  it('riding a strip refills Drive at DRIVE_STRIP per second on top of the trickle', () => {
    const a = new Arena(1);
    const on = a.put(FW0, strip.s0 + 5, strip.d);
    const off = a.put(FW1, strip.s0 + 5, strip.d + strip.halfW + 6);
    on.drive = off.drive = 20;
    const n = 100;
    a.step(n, () => {
      expect(on.onStrip).toBe(true);
      expect(off.onStrip).toBe(false);
    });
    expect(on.drive).toBeCloseTo(20 + n * (DRIVE_PASSIVE + DRIVE_STRIP) * DT, 6);
    expect(off.drive).toBeCloseTo(20 + n * DRIVE_PASSIVE * DT, 6);
    // Run off the end: charging stops.
    a.until(() => !on.onStrip, 200);
    expect(on.s - a.base).toBeGreaterThan(strip.s1);
    const after = on.drive;
    a.step(60);
    expect(on.drive).toBeCloseTo(after + 60 * DRIVE_PASSIVE * DT, 6);
  });

  it('a strip does nothing for a mech crawling over it', () => {
    const a = new Arena(1);
    const m = a.put(FW0, strip.s0 + 5, strip.d, 25);
    a.inputs[FW0].throttle = 0.25; // holds 24 u/s, under the 30 needed
    m.drive = 20;
    a.step(100, () => expect(m.onStrip).toBe(false));
    expect(m.drive).toBeCloseTo(20 + 100 * DRIVE_PASSIVE * DT, 6);
  });

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
  function fuzzRace(seed: number, humans: number[]): { ended: boolean; ticks: number } {
    const race = newRace(seed, { humans });
    const inputs = makeInputs(race);
    const rnd = makeRandom(seed * 7919 + humans.length);
    const fail = (what: string): never => {
      throw new Error(`seed ${seed} tick ${race.tick}: ${what}`);
    };
    const was = race.mechs.map((m) => ({ hp: m.hp, lap: m.lap, retired: false, finished: false }));
    let phase = race.lapPhase;
    let kos = 0;
    while (race.phase !== PHASE.FINISHED && race.tick < 60 * 60 * 8) {
      for (const id of humans) mash(rnd, inputs[id] as MechInput);
      const phaseBefore = race.lapPhase;
      stepRace(race, TRACK, inputs);
      const bad = findNonFinite(race);
      if (bad) fail(`non-finite ${bad}`);
      if (race.lapPhase < phase) fail(`lap phase went back from ${phase} to ${race.lapPhase}`);
      phase = race.lapPhase;
      for (const e of race.events) {
        // Mashing X and Y all through the formation lap must achieve nothing.
        if (phaseBefore === 1 && (e.type === 'windup' || e.type === 'shot' || e.type === 'hit' || e.type === 'splat' || e.type === 'ko')) {
          fail(`'${e.type}' on the formation lap`);
        }
        if (e.type === 'ko') kos++;
      }
      for (const m of race.mechs) {
        const c = CLASSES[m.role];
        const w = was[m.id];
        if (wallOvershoot(m) > EPS) fail(`mech ${m.id} is ${wallOvershoot(m)} through the wall`);
        if (m.hp < 0 || m.hp > w.hp) fail(`mech ${m.id} hp ${w.hp} -> ${m.hp}`);
        if (m.drive < 0 || m.drive > DRIVE_MAX) fail(`mech ${m.id} drive ${m.drive}`);
        if (m.guard < 0 || m.guard > c.guardMax) fail(`mech ${m.id} guard ${m.guard}`);
        if (m.speed < 0) fail(`mech ${m.id} speed ${m.speed}`);
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
    // The result still adds up.
    const classified = race.mechs.filter((m) => !m.retired).length;
    expect(kos).toBe(race.mechs.length - classified);
    expect(race.mechs.map((m) => m.place).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(race.mechs.reduce((sum, m) => sum + m.points, 0)).toBe(POINTS.slice(0, classified).reduce((a, b) => a + b, 0));
    for (const m of race.mechs) expect(m.points).toBe(m.retired ? 0 : POINTS[m.place - 1]);
    return { ended: race.phase === PHASE.FINISHED, ticks: race.tick };
  }

  it('one masher among AIs: state stays finite, inside the walls and in range (3 seeds)', () => {
    expect(fuzzRace(11, [FW0]).ended).toBe(true);
    expect(fuzzRace(22, [MF1]).ended).toBe(true);
    expect(fuzzRace(33, [DF0]).ended).toBe(true);
  });

  it('several mashers: one per team, and a full grid of them', () => {
    expect(fuzzRace(55, [FW1, DF0]).ended).toBe(true);
    expect(fuzzRace(66, [FW0, FW1, MF0, MF1, DF0, DF1]).ended).toBe(true);
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
          inp.buttons = Math.floor(rnd() * 256);
        }
      }
      stepRace(race, TRACK, inputs);
      expect(findNonFinite(race)).toBe(null);
      for (const id of [FW0, MF1]) {
        expect(wallOvershoot(race.mechs[id])).toBeLessThanOrEqual(EPS);
        if (race.mechs[id].mode === MODE.SPEED) maxSpeed = Math.max(maxSpeed, race.mechs[id].speed);
      }
    }
    // A huge throttle value is no faster than a full one.
    expect(maxSpeed).toBeLessThan(260);
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
  // OPEN QUESTION (see report), the most important one: dashing is not held
  // to the limiter, and releasing the lock turns the whole dash velocity
  // into free-steering speed. Lock - dash - unlock, repeated on the dash
  // cooldown, stacks: about 240 u/s average and 320 u/s peak on a lap where
  // the limiter is 96 (it works on the formation lap, and with a team-mate
  // as the "target"). The rules say boost, slipstream and pack bonus are the
  // only things above PACE on laps 1-2.
  it('lock-dash-unlock cannot be chained to outrun the limiter', () => {
    const a = new Arena(1);
    const me = a.put(FW0, -250, 0);
    const mate = a.put(MF0, -210, 8);
    me.drive = 100;
    let max = 0;
    for (let rep = 0; rep < 8; rep++) {
      mate.s = me.s + 40; // keep someone to lock on to just ahead
      a.tap(FW0, BTN.ALLY);
      a.inputs[FW0].my = 1;
      a.tap(FW0, BTN.A);
      a.inputs[FW0].my = 0;
      a.tap(FW0, BTN.ALLY);
      a.step(34, () => (max = Math.max(max, me.speed)));
    }
    expect(max).toBeLessThanOrEqual(PACE * (1 + PACK_BONUS) * BOOST_MULT * DRAFT_MULT + EPS);
  });
});

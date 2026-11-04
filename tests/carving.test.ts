// Carving: the held drift on the brake trigger, its charge and its burst.
import { describe, expect, it } from 'vitest';
import {
  BTN,
  CARVE_TURN,
  CLASSES,
  CARVE_BEND_MAX,
  CARVE_BEND_MIN,
  CARVE_BURST,
  CARVE_BURST_SECS,
  CARVE_MIN_SPEED,
  CARVE_MIN_STEER,
  CARVE_STEER_MID,
  CARVE_STEER_WIDE,
  CARVE_TIERS,
  DT,
  MODE,
  OVERDRIVE_CARVE_GRIP,
  ROLE,
  buildTrack,
  carveBiteSpeed,
  carveSteer,
  carveStick,
  clamp,
  createRace,
  emptyInput,
  kappaAt,
  speedCap,
  stepRace,
  ticks,
} from '../src/sim/index';
import { setStagger } from '../src/sim/combat';
import { MONSOON_RUINS } from '../src/sim/tracks/monsoon';
import { Arena, FW0, FW1, TRACK, makeSeats, runCountdown, wallLimit } from './helpers';

/** Where the tightest corner on the circuit (the Harbour Hairpin) starts, and which way it turns. */
function hairpin(): { s: number; dir: number } {
  let worst = 0;
  for (let i = 1; i < TRACK.n; i++) if (Math.abs(TRACK.kappa[i]) > Math.abs(TRACK.kappa[worst])) worst = i;
  let i = worst;
  while (Math.abs(TRACK.kappa[i - 1]) > Math.abs(TRACK.kappa[worst]) * 0.98) i--;
  return { s: i * TRACK.ds + 8, dir: Math.sign(TRACK.kappa[worst]) };
}

/** The trigger pulled and the stick at `mx`. */
function carve(a: Arena, id: number, mx: number, brake = 1): void {
  a.inputs[id].mx = mx;
  a.inputs[id].brake = brake;
}

describe('starting a carve', () => {
  it('the trigger with the stick near the middle is still the brake', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, 0);
    carve(a, FW0, CARVE_MIN_STEER - 0.05);
    a.step(20);
    expect(m.carving).toBe(false);
    expect(m.speed).toBeLessThan(a.pace - 15);
    expect(a.events('carve')).toEqual([]);
  });

  it('with the stick over, the trigger carves that way instead, and does not brake', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, -12);
    carve(a, FW0, 0.6);
    a.step(1);
    expect(m.carving).toBe(true);
    expect(m.carveDir).toBe(1);
    a.step(19);
    // Only the carve's own small bleed, nothing like the brake above.
    expect(m.speed).toBeGreaterThan(a.pace - a.race.rules.carveDrag * (20 / 60) - 0.5);

    const b = new Arena(2);
    const n = b.put(FW0, 0, 12);
    carve(b, FW0, -0.6);
    b.step(1);
    expect(n.carving).toBe(true);
    expect(n.carveDir).toBe(-1);
  });

  it('is only a carve above CARVE_MIN_SPEED: slower, the trigger brakes', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, 0, CARVE_MIN_SPEED - 5);
    a.inputs[FW0].throttle = 0;
    carve(a, FW0, 1);
    a.step(1);
    expect(m.carving).toBe(false);
  });
});

describe('holding a carve', () => {
  it('the stick shapes the carve: middle, tight into the turn, wide out of it, never straight', () => {
    for (const dir of [1, -1]) {
      expect(carveSteer(dir, 0)).toBeCloseTo(dir * CARVE_STEER_MID, 12);
      expect(carveSteer(dir, dir)).toBeCloseTo(dir, 12);
      expect(carveSteer(dir, -dir)).toBeCloseTo(dir * CARVE_STEER_WIDE, 12);
      // Tighter the further the stick goes into the turn, and the inverse finds
      // the stick for any turn in range.
      let prev = -Infinity;
      for (let i = -20; i <= 20; i++) {
        const x = (i / 20) * dir;
        const k = carveSteer(dir, x) * dir;
        expect(k).toBeGreaterThanOrEqual(prev - 1e-12);
        expect(k).toBeGreaterThanOrEqual(CARVE_STEER_WIDE - 1e-12);
        prev = k;
        expect(carveSteer(dir, carveStick(dir, carveSteer(dir, x)))).toBeCloseTo(carveSteer(dir, x), 9);
      }
    }
  });

  it('centring the stick keeps the carve going, still turning; only the trigger ends it', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, -14);
    carve(a, FW0, 0.6);
    a.step(1);
    carve(a, FW0, 0);
    a.step(30, () => expect(m.carving).toBe(true));
    expect(m.steer).toBeCloseTo(CARVE_STEER_MID, 2);
    // Steering against it opens the carve out; it still does not end.
    carve(a, FW0, -1);
    a.step(30, () => expect(m.carving).toBe(true));
    expect(m.steer).toBeCloseTo(CARVE_STEER_WIDE, 2);
    carve(a, FW0, -1, 0);
    a.step(1);
    expect(m.carving).toBe(false);
  });

  it('in Overdrive (the Forward\'s) a carve grips harder, so it opens out less than the pace would make it', () => {
    // Carving at full lock on the straight, flat out (Overdrive's pace or
    // not): the grip it turns with, the turn rate times the speed.
    const carveGrip = (od: boolean) => {
      // (No bite: the grip alone. The bite has tests of its own, below.)
      const a = new Arena(2, 1, { carveBiteRadius: 1000 });
      const m = a.put(FW0, 0, -12, 200);
      m.overdriveT = od ? 600 : 0;
      carve(a, FW0, 1);
      a.step(1);
      expect(m.carving).toBe(true);
      // The stick at full lock and the heading straight before each tick: ten ticks' turn.
      let grip = 0;
      const hold = () => {
        m.steer = 1;
        m.heading = 0;
      };
      hold();
      a.step(10, () => {
        grip += (m.heading / DT) * m.speed;
        hold();
      });
      return { grip: grip / 10, speed: m.speed };
    };
    const plain = carveGrip(false);
    const od = carveGrip(true);
    expect(od.speed).toBeGreaterThan(plain.speed * 1.1);
    expect(od.grip / plain.grip).toBeCloseTo(OVERDRIVE_CARVE_GRIP, 2);
    // So the carve's radius (speed squared over grip) grows less than the pace's square.
    const radius = (r: { grip: number; speed: number }) => (r.speed * r.speed) / r.grip;
    expect(radius(od) / radius(plain)).toBeLessThan((od.speed / plain.speed) ** 2 / 1.15);
  });

  it('a blow ends the carve with nothing to show for it', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, -14);
    carve(a, FW0, 0.6);
    a.step(1);
    m.carveCharge = CARVE_TIERS[1] + 0.01;
    a.step(1);
    expect(m.carveTier).toBe(2);
    setStagger(m, 30);
    a.step(1);
    expect(m.carving).toBe(false);
    expect(m.carveCharge).toBe(0);
    expect(m.carveT).toBe(0);
    expect(a.events('carveBurst')).toEqual([]);
  });

  it('scraping the barrier takes the charge, not the carve', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, wallLimit(a.mech(FW0)) - 3);
    carve(a, FW0, 1);
    a.step(1);
    m.carveCharge = CARVE_TIERS[2] + 0.01;
    a.until(() => m.wall > 0, 120);
    a.step(1);
    expect(m.carving).toBe(true);
    expect(m.carveCharge).toBeLessThan(CARVE_TIERS[0]);
  });

  it('locking on ends the carve, and any burst', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, 0);
    a.put(FW1, 35, 4);
    carve(a, FW0, 0.6);
    a.step(1);
    m.carveCharge = CARVE_TIERS[2] + 0.01;
    a.step(1);
    a.tap(FW0, BTN.LOCK);
    expect(m.mode).toBe(MODE.BATTLE);
    a.step(1);
    expect(m.carving).toBe(false);
    expect(m.carveT).toBe(0);
    expect(a.events('carveBurst')).toEqual([]);

    // A burst already running when the lock goes on is spent too.
    const b = new Arena(2);
    const n = b.put(FW0, 0, 0);
    b.put(FW1, 35, 4);
    carve(b, FW0, 0.6);
    b.step(1);
    n.carveCharge = CARVE_TIERS[2] + 0.01;
    b.step(1);
    carve(b, FW0, 0, 0);
    b.step(1);
    expect(n.carveT).toBeGreaterThan(0);
    b.tap(FW0, BTN.LOCK);
    expect(n.mode).toBe(MODE.BATTLE);
    b.step(1);
    expect(n.carveT).toBe(0);
  });
});

describe('the charge', () => {
  it('builds faster the tighter the carve is held, the tighter the bend and up to CARVE_FULL_SPEED the faster', () => {
    const { s, dir } = hairpin();
    const first = (mx: number) => dir * Math.max(CARVE_MIN_STEER, Math.abs(mx));
    const run = (at: number, mx: number, speed = 110) => {
      // (No bite: the charge alone, at the pace it is put at.)
      const a = new Arena(2, 1, { carveBiteRadius: 1000 });
      const m = a.put(FW0, at, 0, speed);
      if (speed < 100) a.inputs[FW0].throttle = 0;
      // The stick has to be over to start it; after that it can go anywhere.
      carve(a, FW0, first(mx));
      a.step(1);
      carve(a, FW0, dir * mx);
      a.step(19);
      return m.carveCharge;
    };
    const expected = (mx: number, bend: number) => DT * bend * (Math.abs(carveSteer(dir, first(mx))) + 19 * Math.abs(carveSteer(dir, dir * mx)));
    // Tight into the hairpin: the bend factor is at its cap.
    expect(run(s, 1)).toBeCloseTo(expected(1, CARVE_BEND_MAX), 6);
    // The stick in the middle charges at CARVE_STEER_MID of that.
    expect(run(s, 0)).toBeCloseTo(expected(0, CARVE_BEND_MAX), 6);
    expect(expected(0, 1)).toBeLessThan(expected(1, 1) * 0.6);
    // A straight hardly charges at all.
    expect(run(100, 1)).toBeCloseTo(expected(1, CARVE_BEND_MIN), 6);
    // And slower than CARVE_FULL_SPEED it charges slower in proportion.
    expect(run(s, 1, 55)).toBeLessThan(run(s, 1) * 0.6);
  });

  it('climbs the three tiers in order, one event each', () => {
    const a = new Arena(2, 1, { carveCharge: 10 });
    const { s, dir } = hairpin();
    const m = a.put(FW0, s, 0, 110);
    carve(a, FW0, dir);
    a.until(() => m.carveTier === 3, 60);
    expect(a.events('carve').map((e) => e.tier)).toEqual([1, 2, 3]);
    expect(a.events('carve').every((e) => e.mech === FW0)).toBe(true);
  });
});

describe('the burst', () => {
  for (const tier of [1, 2, 3]) {
    it(`letting go at tier ${tier} pays its burst: +${CARVE_BURST[tier - 1] * 100}% for ${CARVE_BURST_SECS[tier - 1]} s`, () => {
      const a = new Arena(2);
      const m = a.put(FW0, 0, -14);
      carve(a, FW0, 0.6);
      a.step(1);
      m.carveCharge = CARVE_TIERS[tier - 1] + 0.001;
      a.step(1);
      carve(a, FW0, 0, 0);
      a.step(1);
      expect(m.carving).toBe(false);
      expect(a.events('carveBurst')).toEqual([expect.objectContaining({ mech: FW0, tier })]);
      // (The tick it was let go has already used one.)
      expect(m.carveT).toBe(ticks(CARVE_BURST_SECS[tier - 1]) - 1);
      expect(m.carveBoost).toBeCloseTo(CARVE_BURST[tier - 1], 12);
      let top = 0;
      a.step(ticks(CARVE_BURST_SECS[tier - 1]), () => (top = Math.max(top, m.speed)));
      expect(top).toBeGreaterThan(a.pace * 1.04);
      expect(top).toBeLessThan(a.pace * (1 + CARVE_BURST[tier - 1]) + 0.5);
      expect(m.carveT).toBe(0);
    });
  }

  it('let go short of tier 1, there is no burst', () => {
    const a = new Arena(2);
    const m = a.put(FW0, 0, -14);
    carve(a, FW0, 0.6);
    a.step(3);
    carve(a, FW0, 0, 0);
    a.step(1);
    expect(m.carving).toBe(false);
    expect(m.carveT).toBe(0);
    expect(a.events('carveBurst')).toEqual([]);
  });

  it('rules.carveBurst scales it: at 0 the tier still shows but the burst is gone', () => {
    const a = new Arena(2, 1, { carveBurst: 0 });
    const m = a.put(FW0, 0, -14);
    carve(a, FW0, 0.6);
    a.step(1);
    m.carveCharge = CARVE_TIERS[2] + 0.001;
    a.step(1);
    carve(a, FW0, 0, 0);
    let top = 0;
    a.step(80, () => (top = Math.max(top, m.speed)));
    expect(a.events('carveBurst').map((e) => e.tier)).toEqual([3]);
    expect(top).toBeLessThan(a.pace + 0.5);
  });
});

describe('the bite', () => {
  // The stick pushed into a carve past the middle digs the skates in: too fast
  // for the line it asks for, the carve sheds speed until it is not, rather
  // than running wide. In the middle or eased out of the turn it does not.
  const fullPush = (a: Arena) => carveBiteSpeed(CLASSES[ROLE.FW].grip * a.race.rules.carveGrip, a.race.rules.carveBiteRadius, 1);

  it('pushed all the way in, sheds speed about as hard as carveBiteDrag', () => {
    const a = new Arena(3);
    const m = a.put(FW0, 100, -14, 160);
    carve(a, FW0, 1);
    a.step(10);
    expect(m.carving).toBe(true);
    // The bite and the carve's own drag, for ten ticks.
    const drop = 160 - m.speed;
    expect(drop).toBeGreaterThan((a.race.rules.carveBiteDrag + a.race.rules.carveDrag) * 10 * DT * 0.9);
    expect(drop).toBeLessThan((a.race.rules.carveBiteDrag + a.race.rules.carveDrag) * 10 * DT * 1.1);
    expect(m.carveBite).toBe(1);
  });

  it('down to the pace that holds its line, and no lower', () => {
    const a = new Arena(3);
    const v = fullPush(a);
    // (Bitten all the way, a Forward holds carveBiteRadius at about 91.)
    expect(v).toBeGreaterThan(85);
    expect(v).toBeLessThan(97);
    const m = a.put(FW0, 100, -14, v + 6);
    carve(a, FW0, 1);
    let low = Infinity;
    a.step(20, () => (low = Math.min(low, m.speed)));
    expect(m.speed).toBeLessThan(v + 0.01);
    expect(low).toBeGreaterThan(v - 2);
  });

  it('in the middle, or eased out of the turn, there is no bite: only the carve\'s own drag', () => {
    for (const mx of [0, -0.8]) {
      const a = new Arena(3);
      const m = a.put(FW0, 100, -14, 160);
      carve(a, FW0, 0.6);
      a.step(1);
      carve(a, FW0, mx);
      a.step(10);
      expect(m.carving).toBe(true);
      expect(160 - m.speed).toBeLessThan(a.race.rules.carveDrag * 11 * DT + 0.5);
      expect(m.carveBite).toBe(0);
    }
  });

  it('pushed in part of the way, it bites only at a higher pace', () => {
    const a = new Arena(3);
    const m = a.put(FW0, 100, -14, 160);
    carve(a, FW0, 0.75);
    a.step(1);
    // A three-quarter push holds its line up to a third more than a full one.
    expect(fullPush(a) / 0.75).toBeLessThan(160);
    expect(m.carveBite).toBeCloseTo(0.75, 6);
    const b = new Arena(3);
    const n = b.put(FW0, 100, -14, 160);
    carve(b, FW0, 0.4);
    b.step(1);
    expect(fullPush(b) / 0.4).toBeGreaterThan(160);
    expect(n.carveBite).toBe(0);
  });

  it('no bite and no limit without the grip: it follows the carve\'s, so Overdrive bites at a higher pace', () => {
    const a = new Arena(3);
    expect(carveBiteSpeed(100 * a.race.rules.carveGrip * OVERDRIVE_CARVE_GRIP, 50, 1)).toBeGreaterThan(fullPush(a));
    expect(carveBiteSpeed(165, 50, 0)).toBe(Infinity);
  });

  it('a boost waits while the bite holds the mech under its pace: no Drive spent, lit again as it lets go', () => {
    const a = new Arena(3, 1, { drivePassive: 0 });
    const m = a.put(FW0, 100, -14, 150);
    m.drive = 100;
    a.hold(FW0, BTN.A);
    carve(a, FW0, 1);
    a.step(10);
    expect(m.carving).toBe(true);
    expect(m.boosting).toBe(false);
    expect(m.drive).toBe(100);
    // Eased back to the middle: the bite lets go and the boost lights.
    carve(a, FW0, 0);
    a.step(2);
    expect(m.boosting).toBe(true);
    expect(m.drive).toBeLessThan(100);
  });

  it("round Monsoon's Stairway hairpins on the boost, laps 2 and 3, bitten in, without touching the barrier", () => {
    const track = buildTrack(MONSOON_RUINS);
    // The hairpins: the runs of road tighter than 70 round.
    const pins: Array<{ s0: number; s1: number; dir: number }> = [];
    for (let k = 0; k < track.n; k++) {
      const tight = Math.abs(track.kappa[k]) > 1 / 70;
      const last = pins[pins.length - 1];
      if (tight && last && k * track.ds - last.s1 <= track.ds * 1.5) last.s1 = k * track.ds;
      else if (tight) pins.push({ s0: k * track.ds, s1: k * track.ds, dir: Math.sign(track.kappa[k]) });
    }
    const stair = pins.filter((p) => p.s1 - p.s0 > 120).slice(0, 2);
    expect(stair).toHaveLength(2);
    for (const [pin, lap] of stair.flatMap((p) => [[p, 2], [p, 3]] as const)) {
      const race = createRace(track, { seed: 3, seats: makeSeats('all'), rules: { momentumSecs: 0, drivePass: 0 } });
      const inputs = race.mechs.map(() => emptyInput());
      runCountdown(race, inputs);
      race.lapPhase = lap;
      // Everyone else well out of the way.
      for (const o of race.mechs) if (o.id !== FW0) o.s = track.length + 9000 + o.id * 50;
      const m = race.mechs[FW0];
      const boosted = speedCap(race, race.mechs[FW0], CLASSES[ROLE.FW]) * race.rules.boostMult;
      // Down the ramp to it on the boost, on the outside of the road.
      m.s = track.length + pin.s0 - 80;
      m.d = -pin.dir * 12;
      m.speed = m.vs = boosted;
      m.vd = m.heading = m.facing = 0;
      m.drive = 100;
      const inp = inputs[FW0];
      inp.throttle = 1;
      inp.buttons = BTN.A;
      let walls = 0;
      let top = 0;
      let low = Infinity;
      for (let t = 0; t < 8 * 60; t++) {
        const at = m.s - track.length;
        const inPin = at > pin.s0 - 12 && at < pin.s1 - 15;
        // A pilot's line: the bend fed forward, the heading put toward the line.
        const c = CLASSES[m.role];
        const look = 14 + m.speed * 0.35;
        const dWant = inPin ? -pin.dir * 4 : -pin.dir * 12;
        const rate = kappaAt(track, m.s + m.speed * 0.12) * m.speed * Math.cos(m.heading) + (Math.atan2(dWant - m.d, look) - m.heading) * 3.2;
        const grip = c.grip * (m.carving ? race.rules.carveGrip : 1);
        const omega = Math.min(c.turnMax * (m.carving ? CARVE_TURN : 1), grip / Math.max(m.speed, 24));
        if (inPin) {
          // Carving it: in hard enough to start, then as the line wants (all
          // the way in, biting, when it wants more than the grip gives).
          inp.brake = 1;
          inp.mx = m.carving ? carveStick(m.carveDir, clamp(rate / omega, -1, 1)) : pin.dir;
        } else {
          inp.brake = 0;
          inp.mx = clamp(rate / omega, -1, 1);
        }
        stepRace(race, track, inputs);
        for (const e of race.events) if (e.type === 'wall' && e.mech === FW0) walls++;
        if (at < pin.s0 - 20) top = Math.max(top, m.speed);
        if (inPin) low = Math.min(low, m.speed);
        if (at > pin.s1 + 60) break;
      }
      expect(top).toBeGreaterThan(boosted - 2);
      expect(m.s - track.length).toBeGreaterThan(pin.s1 + 60);
      expect(walls).toBe(0);
      // It made it at the pace its line holds, not at a crawl.
      expect(low).toBeGreaterThan(80);
    }
  });
});

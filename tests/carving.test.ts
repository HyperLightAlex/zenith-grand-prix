// Carving: the held drift on the brake trigger, its charge and its burst.
import { describe, expect, it } from 'vitest';
import {
  BTN,
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
  carveSteer,
  carveStick,
  ticks,
} from '../src/sim/index';
import { setStagger } from '../src/sim/combat';
import { Arena, FW0, FW1, TRACK, wallLimit } from './helpers';

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
  });
});

describe('the charge', () => {
  it('builds faster the tighter the carve is held, the tighter the bend and up to CARVE_FULL_SPEED the faster', () => {
    const { s, dir } = hairpin();
    const first = (mx: number) => dir * Math.max(CARVE_MIN_STEER, Math.abs(mx));
    const run = (at: number, mx: number, speed = 110) => {
      const a = new Arena(2);
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

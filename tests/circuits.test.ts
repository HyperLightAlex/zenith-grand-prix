// The 3D circuits: Corkscrew Canyon, Helios Drop, Neon Crucible, Frostline, Titan's Rest and Zenith Ring. Their
// geometry, and the things only they have: jumps and falls, open edges, forks
// with a wall down the middle, speed pads, loops and corkscrews, a straight
// drop and a spiral climb.

import { describe, expect, it } from 'vitest';
import {
  ABYSS_LINE,
  ATK,
  BTN,
  CANYON,
  CARVE_TIERS,
  CLASSES,
  COUNTDOWN_TICKS,
  CRUCIBLE,
  FALL_DAMAGE,
  FALL_TICKS,
  FROSTLINE,
  HARD_LANDING,
  HELIOS,
  LANDING_AIR_TICKS,
  MERIDIAN,
  MODE,
  MONSOON_RUINS,
  CORKSCREW,
  STAIRWAY,
  STONE_RING,
  PHASE,
  TITANS_REST,
  TRACKS,
  ZENITH_RING,
  RING,
  MOBIUS,
  DOME,
  TWIST,
  buildTrack,
  closure,
  createRace,
  emptyInput,
  forkAt,
  hwAt,
  laneAt,
  limiterOf,
  medianAt,
  onPad,
  pieceStarts,
  roadAt,
  spiralRun,
  splitApart,
  stepRace,
  trackById,
  wrapS,
} from '../src/sim/index';
import type { CircuitDef, MechInput, RaceState, SimEvent, Track } from '../src/sim/index';
import { pitOf } from '../src/client/render/pit';
import { frameAt, makeFrame } from '../src/sim/track';
import { findNonFinite, hash, makeSeats, snapshot } from './helpers';

const CIRCUITS: CircuitDef[] = [CANYON, HELIOS, CRUCIBLE, FROSTLINE, TITANS_REST, ABYSS_LINE, MONSOON_RUINS, ZENITH_RING];
/** The circuits with a fork. */
const FORKED: CircuitDef[] = [CANYON, HELIOS, FROSTLINE, TITANS_REST, ABYSS_LINE, MONSOON_RUINS, ZENITH_RING];
const BUILT = new Map<string, Track>(CIRCUITS.map((d) => [d.id, buildTrack(d)]));
const track = (def: CircuitDef) => BUILT.get(def.id)!;

/** Runs of samples matching `on`, as [start, end) distances. */
function runs(t: Track, on: (i: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < t.n; i++) {
    if (on(i) && !on((i - 1 + t.n) % t.n)) {
      let j = i;
      while (on(j % t.n) && j < i + t.n) j++;
      out.push([i * t.ds, j * t.ds]);
    }
  }
  return out;
}
const gaps = (t: Track) => runs(t, (i) => !t.roadL[i] && !t.roadR[i]);
const openRuns = (t: Track) => runs(t, (i) => !t.wallL[i] && !t.wallR[i] && t.roadL[i] === 1 && t.roadR[i] === 1);

describe('the circuit list', () => {
  it('has Meridian first, then the 3D circuits, each found by id', () => {
    expect(TRACKS.map((d) => d.id)).toEqual(['meridian', 'canyon', 'helios', 'crucible', 'frostline', 'titan', 'abyss', 'monsoon', 'zenith']);
    for (const d of TRACKS) expect(trackById(d.id)).toBe(d);
    // An unknown id falls back to Meridian rather than failing.
    expect(trackById('nowhere')).toBe(MERIDIAN);
  });

  it('leaves Meridian flat: no air, no gaps, no forks, no pads, barriers both sides', () => {
    const t = buildTrack(MERIDIAN);
    expect(t.air).toBe(false);
    expect(t.forks.length).toBe(0);
    expect(t.pads.length).toBe(0);
    for (let i = 0; i < t.n; i++) {
      expect(t.roadL[i] && t.roadR[i] && t.wallL[i] && t.wallR[i]).toBe(1);
      expect(t.median[i]).toBe(0);
      expect(t.mag[i]).toBe(0);
    }
  });
});

describe.each(CIRCUITS)('$name: geometry', (def) => {
  const t = track(def);

  it('holds only finite numbers', () => {
    for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'ux', 'uy', 'uz', 'kappa', 'hw', 'median', 'kv', 'upY', 'grip', 'shiftL', 'shiftR', 'riseL', 'riseR'] as const) {
      const a = t[k] as ArrayLike<number>;
      expect(a.length, k).toBe(t.n);
      for (let i = 0; i < t.n; i++) if (!Number.isFinite(a[i])) throw new Error(`${k}[${i}] = ${a[i]}`);
    }
  });

  it('draws a fork whose routes cross with room for a mech between the decks', () => {
    // Where the two routes are drawn over one another, the lower one's mechs
    // (about 11 units with fins) and the upper deck's underside (6.2 deep)
    // must not meet: at least 20 units between the two road surfaces.
    for (let k = 0; k < t.n; k++) {
      const m = t.median[k];
      if (m < 0.5) continue;
      const hw = t.hw[k];
      const lo = Math.max(-hw + t.shiftL[k], m + t.shiftR[k]);
      const hi = Math.min(-m + t.shiftL[k], hw + t.shiftR[k]);
      if (hi <= lo) continue;
      const gap = Math.abs(t.riseL[k] - t.riseR[k]);
      if (gap < 20) throw new Error(`fork decks ${gap.toFixed(1)} apart where they overlap, at s ${(k * t.ds).toFixed(0)}`);
    }
  });

  it('closes: evenly spaced samples all the way round, seam included', () => {
    expect(t.n * t.ds).toBeCloseTo(t.length, 6);
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      const gap = Math.hypot(t.px[j] - t.px[i], t.py[j] - t.py[i], t.pz[j] - t.pz[i]);
      if (Math.abs(gap - t.ds) > t.ds * 0.08) throw new Error(`spacing ${gap.toFixed(3)} at sample ${i}`);
    }
  });

  it('frames are orthonormal and turn smoothly, seam included', () => {
    for (let i = 0; i < t.n; i++) {
      const T = [t.tx[i], t.ty[i], t.tz[i]];
      const R = [t.rx[i], t.ry[i], t.rz[i]];
      const U = [t.ux[i], t.uy[i], t.uz[i]];
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      for (const v of [T, R, U]) expect(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1)).toBeLessThan(1e-3);
      expect(Math.abs(dot(T, R)) + Math.abs(dot(T, U)) + Math.abs(dot(R, U))).toBeLessThan(3e-3);
      // Right-handed: forward x right = up (with +y up and -z forward at the start).
      const j = (i + 1) % t.n;
      const turn = Math.acos(Math.min(1, t.tx[i] * t.tx[j] + t.ty[i] * t.ty[j] + t.tz[i] * t.tz[j]));
      if (turn > 0.12) throw new Error(`tangent jumps ${turn.toFixed(3)} rad at sample ${i}`);
    }
  });

  it('closed by lengthening real straights and a real climb', () => {
    const c = closure(def);
    expect(c.a).toBeGreaterThan(40);
    expect(c.b).toBeGreaterThan(40);
    expect(Number.isFinite(c.settle)).toBe(true);
    const starts = pieceStarts(def);
    expect(starts.length).toBe(def.pieces.length);
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1]);
    expect(starts[starts.length - 1]).toBeLessThan(t.length);
  });

  it('builds the same track every time', () => {
    const again = buildTrack(def);
    expect(hash(JSON.stringify(Array.from(again.px)) + JSON.stringify(Array.from(again.uy)))).toBe(hash(JSON.stringify(Array.from(t.px)) + JSON.stringify(Array.from(t.uy))));
  });

  it('has the features it was designed with', () => {
    expect(t.air).toBe(true);
    expect(gaps(t).length).toBeGreaterThanOrEqual(1);
    expect(t.forks.length).toBe(FORKED.includes(def) ? 1 : 0);
    expect(t.pads.length).toBeGreaterThanOrEqual(2);
    // Loops and corkscrews hold mechs on, and somewhere the road is upside
    // down; but not in the rain at Monsoon Ruins, whose road keeps its
    // feet on the ground (its features climb, fly and wind instead).
    let mag = 0;
    let minUp = 1;
    for (let i = 0; i < t.n; i++) {
      mag += t.mag[i];
      minUp = Math.min(minUp, t.upY[i]);
    }
    if (def === MONSOON_RUINS) {
      expect(mag).toBe(0);
      expect(minUp).toBeGreaterThan(0.9);
    } else {
      expect(mag).toBeGreaterThan(20);
      expect(minUp).toBeLessThan(-0.9);
    }
    if (def === CANYON) expect(openRuns(t).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps gates, strips and pads on road a mech can reach', () => {
    for (const g of t.gates) {
      expect(roadAt(t, g.s, g.d), `gate at ${g.s}`).toBe(true);
      expect(Math.abs(g.d) + g.halfW).toBeLessThanOrEqual(hwAt(t, g.s) + 0.01);
      expect(Math.abs(g.d)).toBeGreaterThan(medianAt(t, g.s));
    }
    for (const st of t.strips) {
      const mid = (st.s0 + st.s1) / 2;
      expect(roadAt(t, mid, st.d), `strip at ${mid}`).toBe(true);
    }
    for (const p of t.pads) {
      const mid = (p.s0 + p.s1) / 2;
      expect(roadAt(t, mid, p.d), `pad at ${mid}`).toBe(true);
      expect(onPad(t, mid, p.d)).toBe(true);
      expect(onPad(t, mid, p.d + p.halfW + 1)).toBe(false);
    }
  });

});

// ---- the physics on the new circuits ------------------------------------------------

/** A race on `def` with every seat a person sitting still, past the countdown. */
function quietRace(def: CircuitDef, seed = 1): { race: RaceState; t: Track; inputs: MechInput[] } {
  const t = track(def);
  const race = createRace(t, { seed, seats: makeSeats('all') });
  const inputs = race.mechs.map(() => emptyInput());
  while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
  expect(race.phase).toBe(PHASE.RACING);
  return { race, t, inputs };
}

/** Put mech `id` at (s, d) running straight at `speed`, everybody else parked far away. */
function place(race: RaceState, t: Track, id: number, s: number, d: number, speed: number): void {
  race.mechs.forEach((o, k) => {
    if (k === id) return;
    o.s = wrapS(t, s + t.length / 2 + k * 30);
    o.d = (k % 2 ? 1 : -1) * 6;
    o.speed = o.vs = o.vd = 0;
  });
  const m = race.mechs[id];
  m.s = wrapS(t, s);
  m.d = d;
  m.h = 0;
  m.vh = 0;
  m.air = false;
  m.speed = speed;
  m.vs = speed;
  m.vd = 0;
  m.heading = 0;
  m.facing = 0;
  m.mode = MODE.SPEED;
}

function stepFor(race: RaceState, t: Track, inputs: MechInput[], ticks: number, seen: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < ticks; i++) {
    stepRace(race, t, inputs);
    seen.push(...race.events);
  }
  return seen;
}

describe('jumps', () => {
  it('a mech at racing pace flies the Hop and lands on the far side', () => {
    const { race, t, inputs } = quietRace(CANYON);
    const [g0, g1] = gaps(t)[0];
    place(race, t, 0, g0 - 150, 0, limiterOf(race));
    inputs[0].throttle = 1;
    const ev = stepFor(race, t, inputs, 240).filter((e) => 'mech' in e && e.mech === 0);
    const types = ev.map((e) => e.type);
    expect(types).toContain('airborne');
    expect(types).toContain('land');
    expect(types).not.toContain('fall');
    const m = race.mechs[0];
    expect(m.air).toBe(false);
    expect(m.h).toBe(0);
    expect(m.s).toBeGreaterThan(g1);
    expect(m.hp).toBe(CLASSES[m.role].maxHp);
  });

  it('a real jump landed clean is worth rules.driveLanding; a short hop or a hard landing is not', () => {
    // Drop a mech onto the start straight from the air and see what the
    // landing alone is worth: the same drop with rules.driveLanding at 0
    // takes away everything else that trickles in.
    const drop = (vh: number, airT: number, driveLanding: number) => {
      const t = track(CANYON);
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { driveLanding } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      place(race, t, 0, 120, 0, 100);
      const m = race.mechs[0];
      m.air = true;
      m.h = 2;
      m.vh = vh;
      m.airT = airT;
      m.drive = 20;
      const ev = stepFor(race, t, inputs, 20).filter((e) => e.type === 'land' && e.mech === 0);
      expect(ev).toHaveLength(1);
      return m.drive;
    };
    const worth = (vh: number, airT: number) => drop(vh, airT, 6) - drop(vh, airT, 0);
    expect(worth(-8, LANDING_AIR_TICKS + 5)).toBeCloseTo(6, 9);
    expect(worth(-8, 3)).toBe(0);
    expect(worth(-(HARD_LANDING + 15), LANDING_AIR_TICKS + 5)).toBe(0);
  });

  it('too slow, it drops into the gap; the drone puts it back further on, armour and time lost', () => {
    const { race, t, inputs } = quietRace(CANYON);
    const [g0, g1] = gaps(t)[0];
    // Rolling off the lip at half the speed the jump is built for.
    place(race, t, 0, g0 - 8, 0, 40);
    const m = race.mechs[0];
    const hp0 = m.hp;
    let fallTick = -1;
    let recoverTick = -1;
    for (let i = 0; i < 400 && recoverTick < 0; i++) {
      stepRace(race, t, inputs);
      for (const e of race.events) {
        if (e.type === 'fall' && e.mech === 0) {
          fallTick = race.tick;
          expect(e.by).toBe(-1);
          expect(e.damage).toBe(FALL_DAMAGE);
        }
        if (e.type === 'recover' && e.mech === 0) recoverTick = race.tick;
      }
      if (fallTick > 0 && recoverTick < 0 && race.tick > fallTick) {
        // Out of play while it falls: nobody can lock on to it or hit it.
        expect(m.fallT).toBeGreaterThan(0);
        expect(m.target).toBe(-1);
      }
    }
    expect(fallTick).toBeGreaterThan(0);
    expect(recoverTick - fallTick).toBe(FALL_TICKS);
    expect(m.hp).toBeCloseTo(hp0 - FALL_DAMAGE, 6);
    expect(m.fallT).toBe(0);
    expect(m.h).toBe(0);
    expect(m.air).toBe(false);
    expect(roadAt(t, m.s, m.d)).toBe(true);
    expect(m.s).toBeGreaterThan(g1);
    expect(m.iframes).toBeGreaterThan(0);
    expect(m.speed).toBeGreaterThan(0);
  });

  it('a fall can end a mech that had little armour left, credited to whoever hit it last', () => {
    const { race, t, inputs } = quietRace(CANYON);
    const [g0] = gaps(t)[0];
    place(race, t, 0, g0 - 8, 0, 40);
    const m = race.mechs[0];
    m.hp = 30;
    m.lastHitBy = 1;
    m.lastHitTick = race.tick;
    const ev = stepFor(race, t, inputs, 120);
    const fall = ev.find((e) => e.type === 'fall');
    expect(fall).toMatchObject({ mech: 0, by: 1, damage: 30 });
    expect(m.retired).toBe(true);
    expect(ev.some((e) => e.type === 'ko' && e.mech === 0 && e.by === 1)).toBe(true);
    expect(race.mechs[1].kos).toBe(1);
  });

  it('the Drop is cleared at the formation-lap limiter, and not by much; well short of it, it is not', () => {
    const t = track(HELIOS);
    const [g0, g1] = gaps(t).sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
    expect(g1 - g0).toBeGreaterThanOrEqual(100);
    const run = (limiter: number) => {
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { limiter1: limiter } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      place(race, t, 0, g0 - 160, 0, limiter);
      // Everyone else well behind, so the limiter is not opened for a straggler.
      race.mechs.forEach((o, k) => {
        if (k) o.s = wrapS(t, g0 - 1500 - k * 30);
      });
      inputs[0].throttle = 1;
      let landed = -1;
      let fell = false;
      for (let i = 0; i < 400 && landed < 0 && !fell; i++) {
        stepRace(race, t, inputs);
        for (const e of race.events) {
          if (e.type === 'land' && e.mech === 0 && race.mechs[0].s > g0) landed = race.mechs[0].s;
          if (e.type === 'fall' && e.mech === 0) fell = true;
        }
      }
      return { landed, fell };
    };
    const lap1 = run(110);
    expect(lap1.fell).toBe(false);
    expect(lap1.landed).toBeGreaterThan(g1);
    expect(lap1.landed - g1).toBeLessThan(g1 - g0);
    expect(run(92).fell).toBe(true);
  });
});

describe('open edges', () => {
  const bridge = openRuns(track(CANYON))[0];

  it('a carve goes over the edge with the mech: no burst on the way down, none after the drone puts it back', () => {
    const { race, t, inputs } = quietRace(CANYON);
    const s = bridge[0] + 80;
    place(race, t, 0, s, 0, 110);
    const m = race.mechs[0];
    m.d = hwAt(t, s) - 6;
    // Carving hard right, charged to the second tier, with a burst still running from the last one.
    inputs[0].mx = 1;
    inputs[0].brake = 1;
    stepFor(race, t, inputs, 1);
    expect(m.carving).toBe(true);
    m.carveCharge = CARVE_TIERS[1] + 0.01;
    m.carveTier = 2;
    m.carveT = 30;
    m.carveBoost = 0.25;
    const ev = stepFor(race, t, inputs, 60);
    expect(ev.some((e) => e.type === 'fall' && e.mech === 0)).toBe(true);
    expect(m.carving).toBe(false);
    expect(m.carveCharge).toBe(0);
    expect(m.carveT).toBe(0);
    // Still holding everything through the fall and the recovery.
    const after = stepFor(race, t, inputs, FALL_TICKS + 30);
    expect([...ev, ...after].some((e) => e.type === 'carveBurst')).toBe(false);
  });

  it('a mech that goes over the side of the Sky Bridge falls, credited to whoever hit it last', () => {
    const { race, t, inputs } = quietRace(CANYON);
    const s = bridge[0] + 80;
    place(race, t, 0, s, 0, 100);
    const m = race.mechs[0];
    m.d = hwAt(t, s) - 3;
    inputs[0].mx = 1;
    m.lastHitBy = 3;
    m.lastHitTick = race.tick;
    const dealt = race.mechs[3].dmgDealt;
    const ev = stepFor(race, t, inputs, 60);
    expect(ev.some((e) => e.type === 'wall' && e.mech === 0)).toBe(false);
    expect(ev.find((e) => e.type === 'fall')).toMatchObject({ mech: 0, by: 3, damage: FALL_DAMAGE });
    expect(race.mechs[3].dmgDealt).toBeCloseTo(dealt + FALL_DAMAGE, 6);
  });

  it('the same run where there is a barrier ends up against the barrier instead', () => {
    const { race, t, inputs } = quietRace(CANYON);
    const s = bridge[0] - 400;
    expect(t.wallR[Math.floor(wrapS(t, s) / t.ds)]).toBe(1);
    place(race, t, 0, s, 0, 100);
    const m = race.mechs[0];
    m.d = hwAt(t, s) - 3;
    inputs[0].mx = 1;
    const ev = stepFor(race, t, inputs, 60);
    expect(ev.some((e) => e.type === 'fall')).toBe(false);
    expect(m.wall).not.toBe(0);
    expect(Math.abs(m.d)).toBeLessThanOrEqual(hwAt(t, m.s));
    expect(m.fallT).toBe(0);
  });
});

describe('forks', () => {
  for (const def of FORKED) {
    const t = track(def);
    const f = t.forks[0];
    const mid = (f.s0 + f.s1) / 2;

    it(`${def.name}: opens the fork gradually and closes it again`, () => {
      expect(f.s1).toBeGreaterThan(f.s0 + 200);
      expect(forkAt(t, mid)).toBe(f);
      expect(forkAt(t, wrapS(t, f.s1 + 200))).toBeNull();
      expect(medianAt(t, mid)).toBeCloseTo(f.median, 1);
      expect(medianAt(t, wrapS(t, f.s0 - 50))).toBe(0);
      // The wall grows from nothing rather than appearing at full width.
      expect(medianAt(t, f.s0 + 10)).toBeLessThan(f.median);
      // In the middle each side is a lane of its own.
      const r = CLASSES[0].radius;
      const [lo, hi] = laneAt(t, mid, -1, r);
      expect(hi).toBeLessThanOrEqual(-(f.median + r) + 1e-6);
      expect(lo).toBeLessThan(hi);
      const [lo2, hi2] = laneAt(t, mid, 1, r);
      expect(lo2).toBeGreaterThanOrEqual(f.median + r - 1e-6);
      expect(hi2).toBeGreaterThan(lo2);
      expect(splitApart(t, mid, -15, mid + 5, 15)).toBe(true);
      expect(splitApart(t, mid, -15, mid + 5, -20)).toBe(false);
      expect(splitApart(t, wrapS(t, f.s0 - 100), -15, wrapS(t, f.s0 - 100), 15)).toBe(false);
    });

    it(`${def.name}: no lock-on, blow or shot across the wall down the middle`, () => {
      const { race, inputs } = quietRace(def);
      // Forward 0 (team 0) on the left, forward 1 (team 1) on the right, side by side.
      place(race, t, 0, mid, -18, 60);
      const enemy = race.mechs[1];
      enemy.s = mid + 6;
      enemy.d = 18;
      enemy.speed = enemy.vs = 60;
      inputs[0].buttons = BTN.LOCK;
      stepFor(race, t, inputs, 2);
      inputs[0].buttons = 0;
      expect(race.mechs[0].target).toBe(-1);

      // A round fired straight across stops at the wall.
      race.projectiles.push({ id: 991, owner: 0, team: 0, attack: ATK.MF_BURST, charged: false, power: 1, s: race.mechs[0].s, d: -12, h: 0, vs: 60, vd: 240, life: 40 });
      const hp = enemy.hp;
      const ev = stepFor(race, t, inputs, 10);
      expect(ev.find((e) => e.type === 'projEnd')).toMatchObject({ proj: 991, hit: false });
      expect(enemy.hp).toBe(hp);

      // Join the same side and the lock takes.
      enemy.s = race.mechs[0].s + 8;
      enemy.d = race.mechs[0].d - 1;
      enemy.vd = 0;
      inputs[0].buttons = BTN.LOCK;
      stepFor(race, t, inputs, 2);
      expect(race.mechs[0].target).toBe(1);
    });

    it(`${def.name}: the wall keeps each mech in its own lane`, () => {
      const { race, inputs } = quietRace(def);
      place(race, t, 0, mid - 40, -(f.median + 6), 80);
      inputs[0].throttle = 1;
      inputs[0].mx = 1; // steer hard toward the middle
      const r = CLASSES[race.mechs[0].role].radius;
      for (let i = 0; i < 30; i++) {
        stepRace(race, t, inputs);
        const m = race.mechs[0];
        if (medianAt(t, m.s) > r) expect(m.d).toBeLessThanOrEqual(-medianAt(t, m.s) + 1e-6);
      }
    });
  }
});

describe('Neon Crucible', () => {
  const def = CRUCIBLE;
  const t = track(def);
  const starts = pieceStarts(def);
  const piece = (name: string): [number, number] => {
    const i = def.pieces.findIndex((p) => p.name === name);
    if (i < 0) throw new Error(`no piece ${name}`);
    return [starts[i], i + 1 < starts.length ? starts[i + 1] : t.length];
  };
  const at = (s: number) => Math.floor(wrapS(t, s) / t.ds) % t.n;
  const gapOver = (r: [number, number]) => gaps(t).find(([a, b]) => a < r[1] && b > r[0])!;
  const TAU = Math.PI * 2;

  it('drops the field straight down through the gap the Leap has just flown over', () => {
    const [l0, l1] = gapOver(piece('gap'));
    const [p0, p1] = piece('the Plunge');
    expect(gapOver([p0, p1])).toBeDefined();
    // The Plunge: no road, pointing straight down.
    const mid = at((p0 + p1) / 2);
    expect(t.roadL[mid] + t.roadR[mid]).toBe(0);
    expect(t.ty[mid]).toBeLessThan(-0.97);
    // Through the Leap's gap: inside its span and its width, from above it to below.
    const g = at((l0 + l1) / 2);
    const a = at(l0);
    const l = Math.hypot(t.tx[g], t.tz[g]);
    const along = ((t.px[mid] - t.px[a]) * t.tx[g] + (t.pz[mid] - t.pz[a]) * t.tz[g]) / l;
    expect(along).toBeGreaterThan(0);
    expect(along).toBeLessThan(l1 - l0);
    expect(Math.abs((t.px[mid] - t.px[g]) * t.rx[g] + (t.pz[mid] - t.pz[g]) * t.rz[g])).toBeLessThan(t.hw[g]);
    expect(t.py[at(p0)]).toBeGreaterThan(t.py[g] + 20);
    expect(t.py[at(p1)]).toBeLessThan(t.py[g] - 20);
  });

  it('carries a mech down the Plunge along the road\'s line onto the Drill: no fall', () => {
    const { race, inputs } = quietRace(def);
    const [p0, p1] = piece('the Plunge');
    place(race, t, 0, p0 + 10, 0, 100);
    // In the air off the Hook, pulled toward the road as the hold lets go.
    const m = race.mechs[0];
    m.air = true;
    m.h = 4;
    m.vh = -40;
    inputs[0].throttle = 1;
    const ev = stepFor(race, t, inputs, 120);
    expect(ev.some((e) => e.type === 'fall' && e.mech === 0)).toBe(false);
    expect(m.fallT).toBe(0);
    expect(m.s).toBeGreaterThan(p1);
  });

  it('clears the Leap at the formation-lap limiter; well short of it, it drops into the pit', () => {
    const [g0, g1] = gapOver(piece('gap'));
    const run = (limiter: number) => {
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { limiter1: limiter } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      // Off the speed pad, so the jump alone is tried.
      place(race, t, 0, g0 - 160, 13, limiter);
      race.mechs.forEach((o, k) => {
        if (k) o.s = wrapS(t, g0 - 1500 - k * 30);
      });
      inputs[0].throttle = 1;
      let landed = -1;
      let fell = false;
      for (let i = 0; i < 400 && landed < 0 && !fell; i++) {
        stepRace(race, t, inputs);
        for (const e of race.events) {
          if (e.type === 'land' && e.mech === 0 && race.mechs[0].s > g0) landed = race.mechs[0].s;
          if (e.type === 'fall' && e.mech === 0) fell = true;
        }
      }
      return { landed, fell };
    };
    const lap1 = run(110);
    expect(lap1.fell).toBe(false);
    expect(lap1.landed).toBeGreaterThan(g1);
    expect(run(70).fell).toBe(true);
  });

  it('climbs the Coil round the drop: four and a quarter turns, each outside and well above the one below', () => {
    const pit = pitOf(t)!;
    expect(pit).not.toBeNull();
    expect((pit.total * 180) / Math.PI).toBeGreaterThan(1500);
    expect(t.py[pit.idx[0]]).toBeLessThan(60);
    expect(t.py[pit.idx[pit.idx.length - 1]]).toBeGreaterThan(400);
    for (let q = 1; q < pit.idx.length; q++) expect(t.py[pit.idx[q]]).toBeGreaterThanOrEqual(t.py[pit.idx[q - 1]] - 1e-6);
    // Like a parking garage's ramp: no turn roofs the road of the one below.
    let checked = 0;
    for (let q = 0; q < pit.idx.length; q++) {
      if (pit.phi[q] < TAU) continue;
      const i = pit.idx[q];
      const j = pit.idx[Math.round(pit.at(pit.phi[q] - TAU))];
      const inner = Math.hypot(t.px[i] + t.rx[i] * t.hw[i] - pit.cx, t.pz[i] + t.rz[i] * t.hw[i] - pit.cz);
      const outer = Math.hypot(t.px[j] - t.rx[j] * t.hw[j] - pit.cx, t.pz[j] - t.rz[j] * t.hw[j] - pit.cz);
      if (inner - outer < 0.5) throw new Error(`turn over turn at s ${(i * t.ds).toFixed(0)}: ${(inner - outer).toFixed(2)}`);
      if (t.py[i] - t.py[j] < 40) throw new Error(`turns ${(t.py[i] - t.py[j]).toFixed(1)} apart at s ${(i * t.ds).toFixed(0)}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('keeps every road over the pit floor clear of the melt, banked edges and all', () => {
    const pit = pitOf(t)!;
    // The Hearth across the floor and the Coil's first turn are banked toward
    // the middle: their inner edges, barriers and all, stay well above it.
    let checked = 0;
    for (let i = 0; i < t.n; i++) {
      if (t.py[i] > pit.floor + 60) continue;
      for (const d of [-(t.hw[i] + 2.3), 0, t.hw[i] + 2.3]) {
        const y = t.py[i] + t.ry[i] * d;
        if (y - pit.floor < 3.9) throw new Error(`road ${(y - pit.floor).toFixed(2)} above the melt at s ${(i * t.ds).toFixed(0)}, d ${d.toFixed(1)}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('climbs at one steady grade across the cuts between its pieces', () => {
    const run = spiralRun({ r0: 135, r1: 360, degrees: 1545, grade: 0.0575, cuts: [450, 900] });
    const sp = run.map((p) => (p as { spiral: [number, number, number, number, string] }).spiral);
    expect(sp.reduce((a, x) => a + x[2], 0)).toBeCloseTo(1545, 9);
    expect(sp[0][1]).toBeCloseTo(sp[1][0], 9);
    expect(sp[1][1]).toBeCloseTo(sp[2][0], 9);
    expect(sp.map((x) => x[4])).toEqual(['in', 'none', 'out']);
    for (const name of ['the Coil, open turn', 'the Coil, top turns']) {
      const [s0] = piece(name);
      for (const ds of [-24, 0, 24]) {
        const i = at(s0 + ds);
        expect(t.ty[i] / Math.hypot(t.tx[i], t.tz[i]), `${name} ${ds}`).toBeCloseTo(0.0575, 2);
      }
    }
  });

  it('has no barrier inside its open turn: a knock that way is a fall; on the turns either side, the barrier', () => {
    const [o0, o1] = piece('the Coil, open turn');
    for (let s = o0 + 8; s < o1 - 8; s += 4) {
      expect(t.wallR[at(s)]).toBe(0);
      expect(t.wallL[at(s)]).toBe(1);
    }
    const knocked = (s: number) => {
      const { race, inputs } = quietRace(def);
      place(race, t, 0, s, 0, 100);
      race.mechs[0].d = hwAt(t, s) - 3;
      inputs[0].mx = 1;
      return stepFor(race, t, inputs, 60).some((e) => e.type === 'fall' && e.mech === 0);
    };
    expect(knocked((o0 + o1) / 2)).toBe(true);
    expect(knocked(piece('the Coil, bottom turns')[0] + 400)).toBe(false);
    expect(knocked(piece('the Coil, top turns')[0] + 600)).toBe(false);
  });
});

describe('Frostline', () => {
  const def = FROSTLINE;
  const t = track(def);
  const starts = pieceStarts(def);
  const piece = (name: string): [number, number] => {
    const i = def.pieces.findIndex((p) => p.name === name);
    if (i < 0) throw new Error(`no piece ${name}`);
    return [starts[i], i + 1 < starts.length ? starts[i + 1] : t.length];
  };
  const at = (s: number) => Math.floor(wrapS(t, s) / t.ds) % t.n;
  const fork = t.forks[0];

  it('splits at the Aurora: the bridge on the left has no barrier on its outside, the caves on the right do', () => {
    for (let s = fork.s0 + 80; s < fork.s1 - 80; s += 8) {
      expect(t.wallL[at(s)]).toBe(0);
      expect(t.wallR[at(s)]).toBe(1);
    }
    // The bridge has the speed pad, the caves the Cell.
    expect(fork.left.pads).toBe(1);
    expect(fork.right.gates).toBe(1);
    const knocked = (d: number, push: number) => {
      const { race, inputs } = quietRace(def);
      const s = (fork.s0 + fork.s1) / 2;
      place(race, t, 0, s, d, 100);
      inputs[0].mx = push;
      return stepFor(race, t, inputs, 60).some((e) => e.type === 'fall' && e.mech === 0);
    };
    expect(knocked(-(hwAt(t, (fork.s0 + fork.s1) / 2) - 3), -1)).toBe(true);
    expect(knocked(hwAt(t, (fork.s0 + fork.s1) / 2) - 3, 1)).toBe(false);
  });

  it('climbs through the Ice Barrel rolling a full turn, upside down half way, held to the road', () => {
    const [b0, b1] = piece('the Ice Barrel');
    let minUp = 1;
    for (let s = b0 + 8; s < b1 - 8; s += 4) {
      minUp = Math.min(minUp, t.upY[at(s)]);
      expect(t.mag[at(s)]).toBe(1);
    }
    expect(minUp).toBeLessThan(-0.85);
    expect(t.py[at(piece('out on top')[1])] - t.py[at(piece('into the glacier')[0])]).toBeGreaterThan(180);
  });

  it('flies the Calving over the Aurora Split, far above it', () => {
    const [p0, p1] = piece('gap');
    const [g0, g1] = gaps(t).find(([a, b]) => a < p1 && b > p0)!;
    let over = 0;
    for (let s = g0; s < g1; s += 4) {
      const i = at(s);
      expect(t.roadL[i] + t.roadR[i]).toBe(0);
      for (let k = Math.floor(fork.s0 / t.ds); k < Math.ceil(fork.s1 / t.ds); k += 2) {
        if (Math.hypot(t.px[i] - t.px[k], t.pz[i] - t.pz[k]) > t.hw[k]) continue;
        expect(t.py[i] - t.py[k]).toBeGreaterThan(150);
        over++;
      }
    }
    expect(over).toBeGreaterThan(0);
  });

  it('clears the Calving at the formation-lap limiter; well short of it, it drops onto the shelf below', () => {
    const [p0, p1] = piece('gap');
    const [g0, g1] = gaps(t).find(([a, b]) => a < p1 && b > p0)!;
    const run = (limiter: number) => {
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { limiter1: limiter } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      // Off the speed pad, so the jump alone is tried.
      place(race, t, 0, g0 - 300, 10, limiter);
      race.mechs.forEach((o, k) => {
        if (k) o.s = wrapS(t, g0 - 2500 - k * 30);
      });
      inputs[0].throttle = 1;
      let landed = -1;
      let fell = false;
      for (let i = 0; i < 600 && landed < 0 && !fell; i++) {
        stepRace(race, t, inputs);
        for (const e of race.events) {
          if (e.type === 'land' && e.mech === 0 && race.mechs[0].s > g0) landed = race.mechs[0].s;
          if (e.type === 'fall' && e.mech === 0) fell = true;
        }
      }
      return { landed, fell };
    };
    const lap1 = run(110);
    expect(lap1.fell).toBe(false);
    expect(lap1.landed).toBeGreaterThan(g1);
    expect(run(90).fell).toBe(true);
  });

  it('winds down the Icefall a full turn, then turns over in the Aurora Loop', () => {
    const [i0, i1] = piece('the Icefall');
    expect(t.py[at(i0)] - t.py[at(i1)]).toBeGreaterThan(70);
    const [l0, l1] = piece('the Aurora Loop');
    let minUp = 1;
    for (let s = l0; s < l1; s += 4) minUp = Math.min(minUp, t.upY[at(s)]);
    expect(minUp).toBeLessThan(-0.95);
  });
});

describe("Titan's Rest", () => {
  const def = TITANS_REST;
  const t = track(def);
  const starts = pieceStarts(def);
  const piece = (name: string): [number, number] => {
    const i = def.pieces.findIndex((p) => p.name === name);
    if (i < 0) throw new Error(`no piece ${name}`);
    return [starts[i], i + 1 < starts.length ? starts[i + 1] : t.length];
  };
  const at = (s: number) => Math.floor(wrapS(t, s) / t.ds) % t.n;
  const fork = t.forks[0];

  it('climbs the Arm and over the shoulder, high over the sand', () => {
    expect(t.py[at(piece('the Collar')[0])] - t.py[at(0)]).toBeGreaterThan(160);
  });

  it('rolls through the Halo and turns over in the Ribcage, held to the road', () => {
    for (const name of ['the Halo', 'the Ribcage']) {
      const [a, b] = piece(name);
      let minUp = 1;
      for (let s = a + 8; s < b - 8; s += 4) {
        minUp = Math.min(minUp, t.upY[at(s)]);
        expect(t.mag[at(s)], name).toBe(1);
      }
      expect(minUp, name).toBeLessThan(-0.9);
    }
  });

  it('wraps the Sword: twice round the outside of its blade, the road facing away from it all the way', () => {
    const [a, b] = piece('the Sword');
    const i0 = at(a);
    const i1 = at(b);
    const sword = def.pieces.find((p) => p.name === 'the Sword');
    const R = sword && 'barrel' in sword ? Math.abs(sword.barrel[2]) : 0;
    // The blade: the line the road wraps round, R below where it starts.
    const ax = [t.px[i0] - t.ux[i0] * R, t.py[i0] - t.uy[i0] * R, t.pz[i0] - t.uz[i0] * R];
    const bx = [t.px[i1] - t.ux[i1] * R, t.py[i1] - t.uy[i1] * R, t.pz[i1] - t.uz[i1] * R];
    const dir = [bx[0] - ax[0], bx[1] - ax[1], bx[2] - ax[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    let turns = 0;
    let prevUp = t.uy[i0];
    for (let s = a + 4; s < b - 4; s += 4) {
      const i = at(s);
      const rel = [t.px[i] - ax[0], t.py[i] - ax[1], t.pz[i] - ax[2]];
      const along = (rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2]) / len;
      const off = [rel[0] - (dir[0] / len) * along, rel[1] - (dir[1] / len) * along, rel[2] - (dir[2] / len) * along];
      const r = Math.hypot(off[0], off[1], off[2]);
      expect(r).toBeGreaterThan(R - 2);
      expect(r).toBeLessThan(R + 2);
      // Up points straight away from the blade.
      expect((off[0] * t.ux[i] + off[1] * t.uy[i] + off[2] * t.uz[i]) / r).toBeGreaterThan(0.97);
      expect(t.mag[i]).toBe(1);
      if (prevUp < 0 && t.uy[i] >= 0) turns++;
      prevUp = t.uy[i];
    }
    expect(turns).toBe(2);
    // Down the blade from the hilt to the point.
    expect(t.py[i0] - t.py[i1]).toBeGreaterThan(100);
  });

  it('splits through the Hull: the gallery open on its outside, the corridors walled', () => {
    for (let s = fork.s0 + 80; s < fork.s1 - 80; s += 8) {
      expect(t.wallR[at(s)]).toBe(0);
      expect(t.wallL[at(s)]).toBe(1);
    }
    expect(fork.right.pads).toBe(1);
    expect(fork.left.gates).toBe(1);
    const knocked = (d: number, push: number) => {
      const { race, inputs } = quietRace(def);
      const s = (fork.s0 + fork.s1) / 2;
      place(race, t, 0, s, d, 100);
      inputs[0].mx = push;
      return stepFor(race, t, inputs, 60).some((e) => e.type === 'fall' && e.mech === 0);
    };
    expect(knocked(hwAt(t, (fork.s0 + fork.s1) / 2) - 3, 1)).toBe(true);
    expect(knocked(-(hwAt(t, (fork.s0 + fork.s1) / 2) - 3), -1)).toBe(false);
  });

  it('clears the Crown Drop at the formation-lap limiter; well short of it, it falls to the sand', () => {
    const [p0, p1] = piece('gap');
    const [g0, g1] = gaps(t).find(([a, b]) => a < p1 && b > p0)!;
    const run = (limiter: number) => {
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { limiter1: limiter } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      // Off the speed pad, so the jump alone is tried.
      place(race, t, 0, g0 - 70, 12, limiter);
      race.mechs.forEach((o, k) => {
        if (k) o.s = wrapS(t, g0 - 2500 - k * 30);
      });
      inputs[0].throttle = 1;
      let landed = -1;
      let fell = false;
      for (let i = 0; i < 600 && landed < 0 && !fell; i++) {
        stepRace(race, t, inputs);
        for (const e of race.events) {
          if (e.type === 'land' && e.mech === 0 && race.mechs[0].s > g0) landed = race.mechs[0].s;
          if (e.type === 'fall' && e.mech === 0) fell = true;
        }
      }
      return { landed, fell };
    };
    const lap1 = run(110);
    expect(lap1.fell).toBe(false);
    expect(lap1.landed).toBeGreaterThan(g1);
    expect(run(75).fell).toBe(true);
  });
});

describe('Abyss Line', () => {
  const def = ABYSS_LINE;
  const t = track(def);
  const starts = pieceStarts(def);
  const piece = (name: string): [number, number] => {
    const i = def.pieces.findIndex((p) => p.name === name);
    if (i < 0) throw new Error(`no piece ${name}`);
    return [starts[i], i + 1 < starts.length ? starts[i + 1] : t.length];
  };
  const at = (s: number) => Math.floor(wrapS(t, s) / t.ds) % t.n;
  const fork = t.forks[0];

  it("twists the Braid's strands twice round each other, crossing over and under with room between", () => {
    let crossings = 0;
    let prev = 0;
    let stacked = 0;
    for (let s = fork.s0 + 4; s < fork.s1 - 4; s += 4) {
      const i = at(s);
      const above = t.riseR[i] - t.riseL[i];
      if (Math.abs(above) > 20 && prev !== 0 && Math.sign(above) !== prev) crossings++;
      if (Math.abs(above) > 20) prev = Math.sign(above);
      // One right over the other (side by side within a strand's width): far enough apart for a mech between.
      const across = Math.abs(t.shiftR[i] - t.shiftL[i] + (t.hw[i] + t.median[i]));
      if (across < 20) {
        stacked++;
        expect(Math.abs(above)).toBeGreaterThan(60);
      }
    }
    // Over, under, over, under: twice round.
    expect(crossings).toBe(3);
    expect(stacked).toBeGreaterThan(20);
  });

  it('runs the Dome Run up the dome, across under its roof upside down round its middle, and down', () => {
    const [a, b] = piece('under the roof');
    const f0 = frameAt(t, a, makeFrame());
    const R = DOME.radius - DOME.under;
    const c = [f0.px + f0.ux * R, f0.py + f0.uy * R, f0.pz + f0.uz * R];
    for (let s = a + 4; s < b - 4; s += 4) {
      const i = at(s);
      const off = [t.px[i] - c[0], t.py[i] - c[1], t.pz[i] - c[2]];
      const along = off[0] * f0.rx + off[1] * f0.ry + off[2] * f0.rz;
      const r = Math.hypot(off[0] - f0.rx * along, off[1] - f0.ry * along, off[2] - f0.rz * along);
      expect(Math.abs(r - R)).toBeLessThan(1);
      expect(t.uy[i]).toBeLessThan(-0.85);
      expect(t.mag[i]).toBe(1);
    }
    // The roof is over the town: the road under it is the circuit's highest.
    let top = -Infinity;
    for (let i = 0; i < t.n; i++) top = Math.max(top, t.py[i]);
    expect(t.py[at((a + b) / 2)]).toBeCloseTo(top, 0);
  });

  it('runs the Twist twice round the inside of its tube, the road facing in to its axis all the way', () => {
    const [a, b] = piece('the Twist');
    const i0 = at(a);
    const i1 = at(b);
    const R = TWIST.radius;
    const ax = [t.px[i0] + t.ux[i0] * R, t.py[i0] + t.uy[i0] * R, t.pz[i0] + t.uz[i0] * R];
    const bx = [t.px[i1] + t.ux[i1] * R, t.py[i1] + t.uy[i1] * R, t.pz[i1] + t.uz[i1] * R];
    const dir = [bx[0] - ax[0], bx[1] - ax[1], bx[2] - ax[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    let turns = 0;
    let prevUp = t.uy[i0];
    for (let s = a + 4; s < b - 4; s += 4) {
      const i = at(s);
      const rel = [t.px[i] - ax[0], t.py[i] - ax[1], t.pz[i] - ax[2]];
      const along = (rel[0] * dir[0] + rel[1] * dir[1] + rel[2] * dir[2]) / len;
      const off = [rel[0] - (dir[0] / len) * along, rel[1] - (dir[1] / len) * along, rel[2] - (dir[2] / len) * along];
      const r = Math.hypot(off[0], off[1], off[2]);
      expect(r).toBeGreaterThan(R - 2);
      expect(r).toBeLessThan(R + 2);
      // Up points in toward the axis.
      expect(-(off[0] * t.ux[i] + off[1] * t.uy[i] + off[2] * t.uz[i]) / r).toBeGreaterThan(0.97);
      expect(t.mag[i]).toBe(1);
      if (prevUp < 0 && t.uy[i] >= 0) turns++;
      prevUp = t.uy[i];
    }
    expect(turns).toBe(TWIST.turns);
    // A long straight, level: the axis neither climbs nor falls.
    expect(Math.abs(ax[1] - bx[1])).toBeLessThan(1);
    expect(len).toBeGreaterThan(TWIST.length - 5);
  });

  it('clears the Trench Leap at the formation-lap limiter off the pad; well short of it, it falls into the chasm', () => {
    const [p0, p1] = piece('gap');
    const [g0, g1] = gaps(t).find(([a, b]) => a < p1 && b > p0)!;
    const run = (limiter: number) => {
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { limiter1: limiter } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      place(race, t, 0, g0 - 70, 14, limiter);
      race.mechs.forEach((o, k) => {
        if (k) o.s = wrapS(t, g0 - 2500 - k * 30);
      });
      inputs[0].throttle = 1;
      let landed = -1;
      let fell = false;
      for (let i = 0; i < 600 && landed < 0 && !fell; i++) {
        stepRace(race, t, inputs);
        for (const e of race.events) {
          if (e.type === 'land' && e.mech === 0 && race.mechs[0].s > g0) landed = race.mechs[0].s;
          if (e.type === 'fall' && e.mech === 0) fell = true;
        }
      }
      return { landed, fell };
    };
    const lap1 = run(110);
    expect(lap1.fell).toBe(false);
    expect(lap1.landed).toBeGreaterThan(g1);
    expect(run(75).fell).toBe(true);
  });
});

describe('Monsoon Ruins', () => {
  const def = MONSOON_RUINS;
  const t = track(def);
  const starts = pieceStarts(def);
  const piece = (name: string): [number, number] => {
    const i = def.pieces.findIndex((p) => p.name === name);
    if (i < 0) throw new Error(`no piece ${name}`);
    return [starts[i], i + 1 < starts.length ? starts[i + 1] : t.length];
  };
  const at = (s: number) => Math.floor(wrapS(t, s) / t.ds) % t.n;
  /** The plan heading at s, radians. */
  const heading = (s: number) => Math.atan2(t.tz[at(s)], t.tx[at(s)]);

  it('climbs the Stairway: three steep ramps zigzagging up, two hairpins between, onto the summit, the highest level road', () => {
    const ramps = ['the Stairway', 'second ramp', 'top ramp'].map(piece);
    // The ramps run one way, back, and the first way again; each climbs steeply.
    const dirs = ramps.map(([a, b]) => heading((a + b) / 2));
    expect(Math.cos(dirs[0] - dirs[1])).toBeLessThan(-0.99);
    expect(Math.cos(dirs[0] - dirs[2])).toBeGreaterThan(0.99);
    for (const [a, b] of ramps) {
      const grade = (t.py[at(b - 2)] - t.py[at(a + 2)]) / (b - a);
      expect(grade).toBeGreaterThan(0.1);
    }
    // The hairpins: tight, of their radius.
    for (const name of ['first hairpin', 'second hairpin']) {
      const [a, b] = piece(name);
      const k = Math.abs(t.kappa[at((a + b) / 2)]);
      expect(1 / k).toBeGreaterThan(STAIRWAY.hairpin - 3);
      expect(1 / k).toBeLessThan(STAIRWAY.hairpin + 3);
    }
    // Up and up, never down, from the foot of the Stairway to the summit.
    const [s0] = piece('the Stairway');
    const [s1, s2] = piece('the summit');
    for (let s = s0 + 8; s < s1; s += 8) expect(t.py[at(s)]).toBeGreaterThanOrEqual(t.py[at(s - 8)] - 0.01);
    let top = -Infinity;
    for (let i = 0; i < t.n; i++) if (Math.abs(t.ty[i]) < 0.01 && t.roadL[i]) top = Math.max(top, t.py[i]);
    expect(t.py[at((s1 + s2) / 2)]).toBeCloseTo(top, 0);
  });

  const [g0, g1] = (() => {
    const [p0, p1] = piece('gap');
    return gaps(t).find(([a, b]) => a < p1 && b > p0)!;
  })();

  it('clears the Summit Leap at the formation-lap limiter off the summit pad; well short of it, it falls into the gorge', () => {
    const run = (limiter: number) => {
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { limiter1: limiter } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      place(race, t, 0, g0 - 70, 0, limiter);
      race.mechs.forEach((o, k) => {
        if (k) o.s = wrapS(t, g0 - 2500 - k * 30);
      });
      inputs[0].throttle = 1;
      let landed = -1;
      let fell = false;
      for (let i = 0; i < 600 && landed < 0 && !fell; i++) {
        stepRace(race, t, inputs);
        for (const e of race.events) {
          if (e.type === 'land' && e.mech === 0 && race.mechs[0].s > g0) landed = race.mechs[0].s;
          if (e.type === 'fall' && e.mech === 0) fell = true;
        }
      }
      return { landed, fell };
    };
    const lap1 = run(110);
    expect(lap1.fell).toBe(false);
    expect(lap1.landed).toBeGreaterThan(g1);
    expect(run(75).fell).toBe(true);
  });

  it('flies the Leap through the middle of the Ring at any pace that clears it, the road\'s space inside its stone', () => {
    // The Ring: square to the road over the middle of the gap, lifted over the arc.
    const f = frameAt(t, (g0 + g1) / 2, makeFrame());
    const c = [f.px + f.ux * STONE_RING.lift, f.py + f.uy * STONE_RING.lift, f.pz + f.uz * STONE_RING.lift];
    const inner = STONE_RING.radius - 3.6;
    // The road's space there (its width and a margin, from its deck to 18 over it) lies inside the stone.
    for (const d of [-1, 1]) for (const h of [-0.5, 18]) {
      const x = f.rx * d * (t.hw[at((g0 + g1) / 2)] + 3.8) + f.ux * (h - STONE_RING.lift);
      const y = f.ry * d * (t.hw[at((g0 + g1) / 2)] + 3.8) + f.uy * (h - STONE_RING.lift);
      const z = f.rz * d * (t.hw[at((g0 + g1) / 2)] + 3.8) + f.uz * (h - STONE_RING.lift);
      expect(Math.hypot(x, y, z)).toBeLessThan(inner);
    }
    // Off the lip at 100 to 160, in free flight: through the Ring's plane well inside it.
    const lip = frameAt(t, g0, makeFrame());
    for (const v of [100, 110, 130, 160]) {
      let p = [lip.px, lip.py, lip.pz];
      let w = [lip.tx * v, lip.ty * v, lip.tz * v];
      const side = (q: number[]) => (q[0] - c[0]) * f.tx + (q[1] - c[1]) * f.ty + (q[2] - c[2]) * f.tz;
      let crossed = false;
      for (let k = 0; k < 400 && !crossed; k++) {
        const next = [p[0] + w[0] / 120, p[1] + w[1] / 120, p[2] + w[2] / 120];
        w = [w[0], w[1] - 45 / 120, w[2]];
        if (side(p) < 0 && side(next) >= 0) {
          crossed = true;
          expect(Math.hypot(next[0] - c[0], next[1] - c[1], next[2] - c[2])).toBeLessThan(inner - 8);
        }
        p = next;
      }
      expect(crossed).toBe(true);
    }
  });

  it('winds the Waterfall Corkscrew twice round the cenote, tightening, down its drop', () => {
    const [a, b] = piece('the Waterfall Corkscrew');
    const f = frameAt(t, a + 1, makeFrame());
    const l = Math.hypot(f.rx, f.rz);
    const c = [f.px + (f.rx / l) * CORKSCREW.r0, f.pz + (f.rz / l) * CORKSCREW.r0];
    let turned = 0;
    let prev = Math.atan2(t.pz[at(a)] - c[1], t.px[at(a)] - c[0]);
    for (let s = a + 4; s <= b; s += 4) {
      const i = at(s);
      const r = Math.hypot(t.px[i] - c[0], t.pz[i] - c[1]);
      expect(r).toBeGreaterThan(CORKSCREW.r1 - 2);
      expect(r).toBeLessThan(CORKSCREW.r0 + 2);
      const ang = Math.atan2(t.pz[i] - c[1], t.px[i] - c[0]);
      let d = ang - prev;
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
      turned += d;
      prev = ang;
    }
    expect(Math.abs(turned * 180) / Math.PI).toBeCloseTo(CORKSCREW.degrees, -1);
    expect(t.py[at(a)] - t.py[at(b)]).toBeCloseTo(CORKSCREW.drop, 0);
    // Each turn clear of the one below it.
    expect(t.py[at(a + (b - a) * 0.25)] - t.py[at(a + (b - a) * 0.75)]).toBeGreaterThan(40);
  });

  it('forks on the last bend: the halls on its inside, shorter, with the gate and a strip; the causeway round the outside with the pads', () => {
    const fork = t.forks.find((fk) => fk.s0 > piece('closing A')[0])!;
    expect(fork).toBeTruthy();
    // The bend turns right, so the right route is its inside.
    const [b0, b1] = piece('the Temple Halls');
    const bend = def.pieces[def.pieces.findIndex((p) => p.name === 'the Temple Halls') + 1];
    expect('turn' in bend && bend.turn[1] > 0).toBe(true);
    expect(fork.right.gates).toBe(1);
    expect(fork.right.strips).toBe(1);
    expect(fork.right.pads).toBe(0);
    expect(fork.left.pads).toBe(2);
    expect(fork.left.gates).toBe(0);
    // Round the middle of each route, the halls' way is the shorter.
    let left = 0;
    let right = 0;
    for (let s = fork.s0; s < fork.s1; s += t.ds) {
      const i = at(s);
      const mid = (t.hw[i] + t.median[i]) / 2;
      left += t.ds * (1 + t.kappa[i] * mid);
      right += t.ds * (1 - t.kappa[i] * mid);
    }
    expect(right).toBeLessThan(left - 40);
    void b0;
    void b1;
  });
});

describe('Zenith Ring', () => {
  const def = ZENITH_RING;
  const t = track(def);
  const starts = pieceStarts(def);
  const piece = (name: string): [number, number] => {
    const i = def.pieces.findIndex((p) => p.name === name);
    if (i < 0) throw new Error(`no piece ${name}`);
    return [starts[i], i + 1 < starts.length ? starts[i + 1] : t.length];
  };
  const at = (s: number) => Math.floor(wrapS(t, s) / t.ds) % t.n;
  const fork = t.forks[0];
  type V = [number, number, number];
  const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const pos = (i: number): V => [t.px[i], t.py[i], t.pz[i]];
  const up = (i: number): V => [t.ux[i], t.uy[i], t.uz[i]];
  /** Round an axis through `c` along `axis`: how far out a sample is, which way out, and how far along. */
  const round = (c: V, axis: V, i: number) => {
    const rel = sub(pos(i), c);
    const along = dot(rel, axis);
    const off: V = [rel[0] - axis[0] * along, rel[1] - axis[1] * along, rel[2] - axis[2] * along];
    const r = Math.hypot(off[0], off[1], off[2]);
    return { r, out: [off[0] / r, off[1] / r, off[2] / r] as V, along };
  };

  it('rides the Ring: up its inside, through the Hatch onto its outside, down that upside down, round one centre', () => {
    const [a] = piece('up the inside');
    const [h0, h1] = piece('the Hatch');
    const [, b] = piece('down the outside');
    // Where it comes in, between samples, and the way it faces on the
    // straight into it (the road's frame on the Ring leans with its drift
    // across the band).
    const f0 = frameAt(t, a, makeFrame());
    const fs = frameAt(t, a - 20, makeFrame());
    const i0 = at(a);
    const c: V = [f0.px + fs.ux * RING.radius, f0.py + fs.uy * RING.radius, f0.pz + fs.uz * RING.radius];
    const axis: V = [fs.rx, fs.ry, fs.rz];
    let minUp = 1;
    for (let s = a + 8; s < h0; s += 4) {
      const { r, out } = round(c, axis, at(s));
      expect(Math.abs(r - RING.radius)).toBeLessThan(1);
      // Its up toward the centre: on the band's inner face.
      expect(-dot(up(at(s)), out)).toBeGreaterThan(0.97);
    }
    for (let s = h0; s < h1; s += 4) expect(t.mag[at(s)]).toBe(1);
    for (let s = h1 + 8; s < b - 8; s += 4) {
      const { r, out } = round(c, axis, at(s));
      expect(Math.abs(r - (RING.radius + RING.band))).toBeLessThan(1);
      // Its up away from the centre: on the band's outer face, held whatever the speed.
      expect(dot(up(at(s)), out)).toBeGreaterThan(0.97);
      expect(t.mag[at(s)]).toBe(1);
      minUp = Math.min(minUp, t.uy[at(s)]);
    }
    expect(minUp).toBeLessThan(-0.99);
    // Across the band on the way round, so it comes out clear of where it went in.
    expect(round(c, axis, at(b)).along - round(c, axis, i0).along).toBeCloseTo(RING.across, 0);
  });

  it('turns over round the core in the Möbius: up its inside, over the top on its outside, down its inside', () => {
    const [a] = piece('the Möbius');
    const [o0, o1] = piece('over the core');
    const f0 = frameAt(t, a, makeFrame());
    const fs = frameAt(t, a - 20, makeFrame());
    const i0 = at(a);
    const c: V = [f0.px + fs.ux * MOBIUS.radius, f0.py + fs.uy * MOBIUS.radius, f0.pz + fs.uz * MOBIUS.radius];
    const axis: V = [fs.rx, fs.ry, fs.rz];
    const end = starts[def.pieces.findIndex((p) => p.name === 'over the core') + 2];
    for (let s = a + 8; s < end - 8; s += 4) {
      const { r } = round(c, axis, at(s));
      expect(Math.abs(r - MOBIUS.radius)).toBeLessThan(1);
      if (s > o0 && s < o1) expect(t.mag[at(s)]).toBe(1);
    }
    // At the top, upright on the outside, over the core.
    const top = at((o0 + o1) / 2);
    expect(t.uy[top]).toBeGreaterThan(0.99);
    expect(dot(up(top), round(c, axis, top).out)).toBeGreaterThan(0.99);
    // Out where it went in, moved along the core, the right way up.
    expect(t.uy[at(end)]).toBeGreaterThan(0.99);
    expect(Math.abs(t.py[at(end)] - t.py[i0])).toBeLessThan(1);
    expect(Math.abs(round(c, axis, at(end)).along - round(c, axis, i0).along)).toBeCloseTo(MOBIUS.across, 0);
  });

  it('splits through the Dock: over its back, open on the outside, with the pad; through it, walled, with the gate', () => {
    for (let s = fork.s0 + 80; s < fork.s1 - 80; s += 8) {
      expect(t.wallR[at(s)]).toBe(0);
      expect(t.wallL[at(s)]).toBe(1);
    }
    expect(fork.right.pads).toBe(1);
    expect(fork.left.gates).toBe(1);
  });

  it('has no barrier on the outside of the Solar Wings\' bends: a knock that way is a fall', () => {
    const [a] = piece('the Solar Wings');
    const [b] = piece('down off the wings');
    let open = 0;
    for (let s = a; s < b; s += 4) if (!t.wallL[at(s)] || !t.wallR[at(s)]) open++;
    expect(open * 4).toBeGreaterThan((b - a) * 0.95);
    // Half way round its first bend, a left: open on the right.
    const [w0, w1] = piece('the Solar Wings');
    const s = (w0 + w1) / 2;
    const { race, inputs } = quietRace(def);
    place(race, t, 0, s, hwAt(t, s) - 3, 100);
    inputs[0].mx = 1;
    expect(stepFor(race, t, inputs, 60).some((e) => e.type === 'fall' && e.mech === 0)).toBe(true);
  });

  it('clears the docking ring at the formation-lap limiter off the pads; well short of it, it falls', () => {
    const [p0, p1] = piece('gap');
    const [g0, g1] = gaps(t).find(([a, b]) => a < p1 && b > p0)!;
    const run = (limiter: number) => {
      const race = createRace(t, { seed: 1, seats: makeSeats('all'), rules: { limiter1: limiter } });
      const inputs = race.mechs.map(() => emptyInput());
      while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
      place(race, t, 0, g0 - 70, 19, limiter);
      race.mechs.forEach((o, k) => {
        if (k) o.s = wrapS(t, g0 - 2500 - k * 30);
      });
      inputs[0].throttle = 1;
      let landed = -1;
      let fell = false;
      for (let i = 0; i < 600 && landed < 0 && !fell; i++) {
        stepRace(race, t, inputs);
        for (const e of race.events) {
          if (e.type === 'land' && e.mech === 0 && race.mechs[0].s > g0) landed = race.mechs[0].s;
          if (e.type === 'fall' && e.mech === 0) fell = true;
        }
      }
      return { landed, fell };
    };
    const lap1 = run(110);
    expect(lap1.fell).toBe(false);
    expect(lap1.landed).toBeGreaterThan(g1);
    expect(run(75).fell).toBe(true);
  });
});

describe('speed pads', () => {
  it('lift the speed past the limiter for a moment', () => {
    const { race, t, inputs } = quietRace(HELIOS);
    const pad = t.pads.find((p) => Math.abs(p.d) < 1)!;
    const lim = limiterOf(race);
    place(race, t, 0, pad.s0 - 60, pad.d, lim);
    inputs[0].throttle = 1;
    let top = 0;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 90; i++) {
      stepRace(race, t, inputs);
      ev.push(...race.events);
      top = Math.max(top, race.mechs[0].speed);
    }
    expect(ev.filter((e) => e.type === 'pad' && e.mech === 0).length).toBe(1);
    expect(top).toBeGreaterThan(lim * 1.08);
  });
});

describe('loops and corkscrews', () => {
  it('hold a mech to the road all the way round, even at a crawl', () => {
    // (Every circuit but Monsoon Ruins, which has none.)
    for (const def of CIRCUITS.filter((d) => d !== MONSOON_RUINS)) {
      const t = track(def);
      const held = runs(t, (i) => t.mag[i] === 1 && t.upY[i] < 0)[0];
      expect(held, def.name).toBeDefined();
      const { race, inputs } = quietRace(def);
      place(race, t, 0, held[0] - 80, 0, 70);
      inputs[0].throttle = 1;
      let maxH = 0;
      for (let i = 0; i < 300; i++) {
        stepRace(race, t, inputs);
        const m = race.mechs[0];
        if (t.mag[Math.floor(wrapS(t, m.s) / t.ds) % t.n] === 1) maxH = Math.max(maxH, m.h);
        expect(race.events.some((e) => e.type === 'fall')).toBe(false);
      }
      expect(maxH, def.name).toBeLessThan(3);
    }
  });
});

describe.each(CIRCUITS)('$name: computer races', (def) => {
  it('two full races finish, stay finite and every fall ends in a recovery or a retirement', () => {
    const t = track(def);
    for (const seed of [11, 12]) {
      const race = createRace(t, { seed, seats: makeSeats([], seed === 11 ? 0.6 : [0.3, 0.9]), gridFlip: seed === 12 });
      const falling = new Set<number>();
      while (race.phase !== PHASE.FINISHED && race.tick < 8 * 60 * 60) {
        stepRace(race, t, []);
        for (const e of race.events) {
          if (e.type === 'fall') falling.add(e.mech);
          if (e.type === 'recover' || (e.type === 'ko' && falling.has(e.mech))) falling.delete(e.mech);
        }
        const bad = findNonFinite(race);
        if (bad) throw new Error(`${def.id} seed ${seed}: ${bad}`);
      }
      expect(race.phase, `${def.id} seed ${seed}`).toBe(PHASE.FINISHED);
      // Anyone still falling at the flag is mid-recovery, never stuck.
      for (const id of falling) expect(race.mechs[id].fallT).toBeGreaterThan(0);
      for (const m of race.mechs) expect(m.finished || m.retired, `${def.id} seed ${seed} mech ${m.id}`).toBe(true);
    }
  });

  it('is deterministic', () => {
    const t = track(def);
    const run = () => {
      const race = createRace(t, { seed: 5, seats: makeSeats() });
      for (let i = 0; i < COUNTDOWN_TICKS + 60 * 90; i++) stepRace(race, t, []);
      return hash(snapshot(race));
    };
    expect(run()).toBe(run());
  });
});

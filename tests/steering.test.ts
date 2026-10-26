// Free steering on rolled road. A mech steers against the bend of the road
// (kappa): let go and it runs wide, as on any corner. On a barrel or a
// twist that bend is the road's own turn within its surface, worked out
// from the built road: a barrel's plan has none, but its road swings out
// round its column and back, and with kappa 0 there the road used to carry
// a mech round its swing as a lock-on does. The skates' hold there grips as
// hard as the swing needs (Track.hold), so it can be steered at full pace.
// The same goes for a fork's routes as they part (see the end).
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  COUNTDOWN_TICKS,
  MODE,
  TRACKS,
  buildTrack,
  createRace,
  deltaS,
  emptyInput,
  gripAt,
  holdAt,
  kappaAt,
  pieceStarts,
  routeBendAt,
  routeSlopeAt,
  stepRace,
  wrapS,
  type CircuitDef,
  type Track,
} from '../src/sim/index';
import { makeSeats } from './helpers';

const kindOf = (p: object) => Object.keys(p).find((k) => ['straight', 'turn', 'climb', 'pitch', 'loop', 'roll', 'barrel', 'spiral', 'twist'].includes(k));

/** The road's own sideways bend at sample k: how its direction turns toward its right, per unit along. */
function realBend(t: Track, k: number): number {
  const a = (k - 1 + t.n) % t.n;
  const b = (k + 1) % t.n;
  return ((t.tx[b] - t.tx[a]) * t.rx[k] + (t.ty[b] - t.ty[a]) * t.ry[k] + (t.tz[b] - t.tz[a]) * t.rz[k]) / (2 * t.ds);
}

/** The circuits' barrels and twists, by name and where they run. */
const rolled = TRACKS.flatMap((def) => {
  if (!('pieces' in def)) return [];
  const c = def as CircuitDef;
  const starts = pieceStarts(c);
  return c.pieces.flatMap((p, i) => {
    const kind = kindOf(p);
    if (kind !== 'barrel' && kind !== 'twist') return [];
    return [{ def: c, name: p.name ?? `${kind} ${i}`, kind, s0: starts[i], s1: starts[i + 1] }];
  });
});

describe('steering on rolled road', () => {
  it('there are barrels and twists to steer through', () => {
    expect(rolled.filter((r) => r.kind === 'barrel').map((r) => `${r.def.id} ${r.name}`)).toEqual(['titan the Sword', 'abyss the Twist']);
    expect(rolled.filter((r) => r.kind === 'twist').length).toBeGreaterThanOrEqual(3);
  });

  for (const r of rolled) {
    it(`${r.def.id}, ${r.name}: the bend steered by is the road's own, turn for turn`, () => {
      const t = buildTrack(r.def);
      let real = 0;
      let steered = 0;
      let realAbs = 0;
      let gapAbs = 0;
      for (let k = Math.ceil(r.s0 / t.ds); k < Math.floor(r.s1 / t.ds); k++) {
        const g = realBend(t, k);
        real += g * t.ds;
        realAbs += Math.abs(g) * t.ds;
        steered += t.kappa[k] * t.ds;
        gapAbs += Math.abs(g - t.kappa[k]) * t.ds;
      }
      // It does turn (a barrel's swing out and back, a twist's), and kappa
      // follows it: what it turns overall, and all but a sliver of each swing
      // (kappa is the road's bend smoothed a little).
      expect(realAbs).toBeGreaterThan(0.3);
      expect(Math.abs(steered - real)).toBeLessThan(0.05);
      expect(gapAbs / realAbs).toBeLessThan(0.2);
    });
  }

  /**
   * Mech `seat` through [s0, s1] at its frame's top pace: stick centred, or
   * steered by the bend ahead and back toward the middle. How often it meets
   * the barrier and how far it strays.
   */
  function drive(def: CircuitDef, s0: number, s1: number, seat: number, steer: boolean, d0 = 0, pace?: number) {
    const t = buildTrack(def);
    const race = createRace(t, { seed: 1, seats: makeSeats('all') });
    const inputs = race.mechs.map(() => emptyInput());
    while (race.tick < COUNTDOWN_TICKS) stepRace(race, t, inputs);
    race.lapPhase = 3;
    race.mechs.forEach((o, k) => {
      if (k !== seat) {
        o.s = wrapS(t, s0 + t.length / 2 + k * 30);
        o.speed = o.vs = 0;
      }
    });
    const m = race.mechs[seat];
    const c = CLASSES[m.role];
    const v = pace ?? c.topSpeed;
    Object.assign(m, { s: s0, d: d0, h: 0, vh: 0, air: false, speed: v, vs: v, vd: 0, heading: 0, facing: 0, mode: MODE.SPEED });
    inputs[seat].throttle = 1;
    let hits = 0;
    let widest = 0;
    for (let i = 0; i < 3000 && deltaS(t, m.s, s0) < s1 - s0; i++) {
      if (pace !== undefined && m.speed > pace) m.speed = pace;
      if (steer) {
        // Feed forward the bend (the road's, and a steered fork route's own), and back toward the line.
        const can = Math.min(c.turnMax, (c.grip * gripAt(t, m.s) * holdAt(t, m.s)) / Math.max(m.speed, 24));
        const bend = (kappaAt(t, m.s) + routeBendAt(t, m.s, m.d)) * m.speed * Math.cos(Math.atan(routeSlopeAt(t, m.s, m.d)));
        inputs[seat].mx = Math.max(-1, Math.min(1, bend / can - m.heading * 2 - (m.d - d0) * 0.05));
      }
      stepRace(race, t, inputs);
      if (m.wall === 1) hits++;
      widest = Math.max(widest, Math.abs(m.d - d0));
    }
    return { hits, widest, speed: m.speed };
  }

  for (const r of rolled.filter((x) => x.kind === 'barrel')) {
    it(`${r.def.id}, ${r.name}: hands off, a mech runs wide into the barrier; steered, every frame holds its line flat out`, () => {
      const loose = drive(r.def, r.s0 - 20, r.s1 + 20, 0, false);
      expect(loose.hits).toBeGreaterThan(2);
      // The swift (seat 0) and the heavy frame (seat 4).
      for (const seat of [0, 4]) {
        const held = drive(r.def, r.s0 - 20, r.s1 + 20, seat, true);
        expect(held.hits).toBe(0);
        expect(held.widest).toBeLessThan(6);
      }
    });
  }

  // ---- forks ---------------------------------------------------------------
  // A fork's routes are drawn moved apart from the road. Where it has room
  // (Canyon, Helios, Frostline, Monsoon) they part gently, and a route's
  // parting is a bend like any other, steered into; the short or twisted
  // ones (the Hull, the Dock, the Braid) still carry a mech apart.
  const forks = TRACKS.flatMap((def) => (buildTrack(def).forks.length ? [def] : []));

  it('the short and the twisted forks carry a mech apart; the rest are steered', () => {
    const carried = forks.filter((def) => buildTrack(def).forks.every((f) => f.carried)).map((d) => d.id);
    expect(carried.sort()).toEqual(['abyss', 'titan', 'zenith']);
    expect(forks.map((d) => d.id).filter((id) => !carried.includes(id)).sort()).toEqual(['canyon', 'frostline', 'helios', 'monsoon']);
  });

  for (const def of forks) {
    const t = buildTrack(def);
    for (const f of t.forks.filter((x) => !x.carried)) {
      it(`${def.id}: a route's parting bends gently, and steering is what holds a mech to it`, () => {
        // Its own bend, from its slope, no tighter than about 220.
        let tightest = 0;
        for (const bend of [t.bendL, t.bendR]) for (let k = Math.floor(f.s0 / t.ds); k <= Math.ceil(f.s1 / t.ds); k++) tightest = Math.max(tightest, Math.abs(bend[k % t.n]));
        expect(tightest).toBeGreaterThan(0.001);
        expect(1 / tightest).toBeGreaterThan(220);
        // On each route, at a pace its tightest bend (the road's and its own
        // together) can be held at without a carve, by the heaviest frame
        // (at most the formation lap's): hands off, the route swings away and
        // the mech runs off its line; steered by the bend, it holds it, the
        // light frame and the heavy. (From where the road has widened for the
        // fork to where its routes have closed up again.)
        const gripMin = Math.min(...CLASSES.map((c) => c.grip));
        for (const side of [-1, 1]) {
          let worst = 0;
          for (let k = Math.floor(f.s0 / t.ds); k <= Math.ceil(f.s1 / t.ds); k++) worst = Math.max(worst, Math.abs(t.kappa[k % t.n] + (side < 0 ? t.bendL : t.bendR)[k % t.n]));
          const pace = Math.min(110, 0.9 * Math.sqrt(gripMin / worst));
          const d0 = side * (t.hw[Math.floor((f.s0 + f.s1) / 2 / t.ds)] + f.median) / 2;
          const loose = drive(def as CircuitDef, f.s0 + 50, f.s1 - 60, 0, false, d0, pace);
          expect(loose.widest).toBeGreaterThan(8);
          for (const seat of [0, 4]) {
            const held = drive(def as CircuitDef, f.s0 + 50, f.s1 - 60, seat, true, d0, pace);
            expect(held.hits).toBe(0);
            expect(held.widest).toBeLessThan(5);
          }
        }
      });
    }
  }
});

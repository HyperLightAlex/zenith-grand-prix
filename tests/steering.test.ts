// Free steering on rolled road. A mech steers against the bend of the road
// (kappa): let go and it runs wide, as on any corner. On a barrel or a
// twist that bend is the road's own turn within its surface, worked out
// from the built road: a barrel's plan has none, but its road swings out
// round its column and back, and with kappa 0 there the road used to carry
// a mech round its swing as a lock-on does. The skates' hold there grips as
// hard as the swing needs (Track.hold), so it can be steered at full pace.
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
  function drive(def: CircuitDef, s0: number, s1: number, seat: number, steer: boolean) {
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
    Object.assign(m, { s: s0, d: 0, h: 0, vh: 0, air: false, speed: c.topSpeed, vs: c.topSpeed, vd: 0, heading: 0, facing: 0, mode: MODE.SPEED });
    inputs[seat].throttle = 1;
    let hits = 0;
    let widest = 0;
    for (let i = 0; i < 3000 && deltaS(t, m.s, s0) < s1 - s0; i++) {
      if (steer) {
        const can = Math.min(c.turnMax, (c.grip * gripAt(t, m.s) * holdAt(t, m.s)) / Math.max(m.speed, 24));
        inputs[seat].mx = Math.max(-1, Math.min(1, (kappaAt(t, m.s) * m.speed) / can - m.heading * 2 - m.d * 0.05));
      }
      stepRace(race, t, inputs);
      if (m.wall === 1) hits++;
      widest = Math.max(widest, Math.abs(m.d));
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
});

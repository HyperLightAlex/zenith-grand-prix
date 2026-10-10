import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTACKS, CLASSES, MERIDIAN, PHASE, POINTS, createRace, emptyInput, rngNext, stepRace } from '../src/sim/index';
import type { MechInput, RaceState } from '../src/sim/index';
import { FW0, MF1, TRACK, findNonFinite, hash, makeInputs, makeRandom, makeSeats, mash, newRace, snapshot, stateHash } from './helpers';
import type { Inputs, RaceOpts } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const EVERY = 500;

/**
 * Fingerprint of a run: a hash of the whole state every 500 ticks (keyed by
 * tick), one at the end, and one of the complete event stream.
 */
interface Trace {
  at: Map<number, string>;
  endTick: number;
  end: string;
  events: string;
}

function trace(race: RaceState, ticks: number, inputsAt: (tick: number) => Inputs, onTick?: (race: RaceState) => void): Trace {
  const at = new Map<number, string>();
  at.set(race.tick, stateHash(race));
  let events = '';
  for (let i = 0; i < ticks && race.phase !== PHASE.FINISHED; i++) {
    stepRace(race, TRACK, inputsAt(race.tick + 1));
    if (race.events.length) events += race.tick + JSON.stringify(race.events);
    if (race.tick % EVERY === 0) at.set(race.tick, stateHash(race));
    if (onTick) onTick(race);
  }
  return { at, endTick: race.tick, end: stateHash(race), events: hash(events) };
}

const flat = (t: Trace) => [...t.at.entries()].map(([tick, h]) => `${tick}:${h}`).concat(`end ${t.endTick}:${t.end}`, `events:${t.events}`);
const noInputs = (): Inputs => [];

/**
 * A reproducible "person": the whole input script comes from one seed. Every
 * tick the sim is handed frozen copies, so a write to an input would throw.
 */
function scriptedHumans(race: RaceState, humans: number[], seed: number): (tick: number) => Inputs {
  const rnd = makeRandom(seed);
  const inputs = makeInputs(race);
  return () => {
    for (const id of humans) mash(rnd, inputs[id] as MechInput);
    return Object.freeze(inputs.map((inp) => (inp ? Object.freeze({ ...inp }) : null))) as Inputs;
  };
}

const tables = () => JSON.stringify([ATTACKS, CLASSES, MERIDIAN, POINTS]);
const trackPrint = () =>
  hash(JSON.stringify([TRACK.length, TRACK.strips, Array.from(TRACK.kappa), Array.from(TRACK.line), Array.from(TRACK.px), Array.from(TRACK.bank), Array.from(TRACK.kappaAhead)]));

// Two reference runs the tests below share: a complete all-AI race, and the
// first 9000 ticks (into the battle lap) of a race with two scripted humans.
const AI_SEED = 4242;
const HUMAN_SEED = 606;
const humanRace = () => newRace(HUMAN_SEED, { humans: [FW0, MF1] });
const tablesBefore = tables();
const trackBefore = trackPrint();
const aiRun = trace(newRace(AI_SEED), 30000, noInputs);
const humanRun = (() => {
  const race = humanRace();
  return trace(race, 9000, scriptedHumans(race, [FW0, MF1], 31337));
})();

describe('the random number generator', () => {
  it('is mulberry32, with its state in the holder', () => {
    const h = { rng: 1 };
    const seq = [rngNext(h), rngNext(h), rngNext(h), rngNext(h)];
    expect(seq).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741]);
    expect(h.rng).toBe(-1263671339);
    const again = { rng: 1 };
    expect([rngNext(again), rngNext(again), rngNext(again), rngNext(again)]).toEqual(seq);
  });

  it('stays in [0, 1) and looks uniform', () => {
    const h = { rng: 2026 };
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = rngNext(h);
      if (!(v >= 0 && v < 1)) throw new Error(`out of range: ${v}`);
      sum += v;
    }
    expect(sum / n).toBeGreaterThan(0.49);
    expect(sum / n).toBeLessThan(0.51);
  });

  it('the race seed is a 32-bit integer', () => {
    expect(newRace(7).rng).toBe(newRace(7 + 2 ** 32).rng);
    expect(snapshot(newRace(7))).toBe(snapshot(newRace(7 + 2 ** 32)));
    expect(snapshot(newRace(7.9))).toBe(snapshot(newRace(7)));
  });
});

describe('same seed, same race', () => {
  it('two all-AI runs agree at every checkpoint, to the flag, events included', () => {
    expect(aiRun.at.size).toBeGreaterThan(30); // a checkpoint every 500 ticks of a ~16000 tick race
    const again = trace(newRace(AI_SEED), 30000, noInputs);
    expect(flat(again)).toEqual(flat(aiRun));
  });

  it('holds for other seeds, skills and lap counts', () => {
    // (laps: 2 makes the second lap the speed lap, so weapons are live
    // from tick ~5600 and these runs include a good stretch of fighting.)
    const cases: Array<[number, RaceOpts, number]> = [
      [1, { skill: [0.2, 1] }, 6500],
      [123456789, { skill: 1, laps: 2 }, 6500],
      [-99, { skill: 0, laps: 1 }, 2000],
    ];
    for (const [seed, opts, ticks] of cases) {
      expect(flat(trace(newRace(seed, opts), ticks, noInputs))).toEqual(flat(trace(newRace(seed, opts), ticks, noInputs)));
    }
  });

  it('different seeds give different races', () => {
    const other = trace(newRace(AI_SEED + 1), 1500, noInputs);
    // From the very first snapshot: the seed sets up the AI pilots.
    for (const [tick, h] of other.at) expect(h).not.toBe(aiRun.at.get(tick));
    const finals = new Set<string>();
    for (let seed = 10; seed < 20; seed++) finals.add(trace(newRace(seed), 600, noInputs).end);
    expect(finals.size).toBe(10);
  });

  it('a scripted human run is reproducible, tick for tick', () => {
    const race = humanRace();
    const again = trace(race, 9000, scriptedHumans(race, [FW0, MF1], 31337));
    expect(humanRun.endTick).toBe(9000);
    expect(flat(again)).toEqual(flat(humanRun));
  });

  it('and it is the inputs that matter: another script, another race', () => {
    const race = humanRace();
    const other = trace(race, 2000, scriptedHumans(race, [FW0, MF1], 31338));
    expect(other.at.get(0)).toBe(humanRun.at.get(0));
    expect(other.at.get(2000)).not.toBe(humanRun.at.get(2000));
  });

  it('one changed input on one tick is enough to change the race', () => {
    const run = (press: boolean) => {
      const race = newRace(5, { humans: [FW0] });
      const inputs = makeInputs(race);
      (inputs[FW0] as MechInput).throttle = 1;
      return trace(race, 1000, (tick) => {
        (inputs[FW0] as MechInput).mx = press && tick === 400 ? 1 : 0;
        return inputs;
      });
    };
    const a = run(false);
    const b = run(true);
    expect(b.at.get(0)).toBe(a.at.get(0));
    expect(b.end).not.toBe(a.end);
    expect(run(true).end).toBe(b.end);
  });
});

describe('no hidden state: a race is its RaceState and nothing else', () => {
  it('copies taken mid-race (structuredClone, and through JSON) carry on exactly like the original', () => {
    const race = newRace(AI_SEED);
    const at = 6500; // well into the battle lap
    for (let i = 0; i < at; i++) stepRace(race, TRACK, []);
    expect(stateHash(race)).toBe(aiRun.at.get(at));
    const copies = [structuredClone(race), JSON.parse(JSON.stringify(race)) as RaceState];
    for (const copy of copies) {
      expect(snapshot(copy)).toBe(snapshot(race));
      const t = trace(copy, 3000, noInputs);
      expect(t.endTick).toBe(at + 3000);
      for (const [tick, h] of t.at) expect(h).toBe(aiRun.at.get(tick));
    }
  });

  it('races stepped side by side in one process do not disturb each other', () => {
    // The two reference races again, but interleaved tick by tick, with a
    // third race of a different shape (one mech per team) between them.
    const r1 = newRace(AI_SEED);
    const r2 = humanRace();
    const script = scriptedHumans(r2, [FW0, MF1], 31337);
    const r3 = createRace(TRACK, { seed: 3, seats: [makeSeats()[0], makeSeats()[5]], laps: 1 });
    let checked = 0;
    for (let i = 0; i < 6000; i++) {
      stepRace(r1, TRACK, []);
      stepRace(r3, TRACK, []);
      stepRace(r2, TRACK, script(r2.tick + 1));
      if (r1.tick % EVERY === 0) {
        expect(stateHash(r1)).toBe(aiRun.at.get(r1.tick));
        expect(stateHash(r2)).toBe(humanRun.at.get(r2.tick));
        checked++;
      }
    }
    expect(checked).toBe(12);
  });

  it('a race is unaffected by how many races ran before it', () => {
    // By now this process has run a dozen races of various shapes.
    const again = trace(newRace(AI_SEED), 1500, noInputs);
    for (const [tick, h] of again.at) expect(h).toBe(aiRun.at.get(tick));
  });

  it('a one-against-one race works too (the sim does not assume six seats)', () => {
    const seats = [makeSeats()[0], makeSeats()[1]];
    const race = createRace(TRACK, { seed: 9, seats, laps: 1 });
    for (let i = 0; i < 9000 && race.phase !== PHASE.FINISHED; i++) stepRace(race, TRACK, []);
    expect(race.phase).toBe(PHASE.FINISHED);
    expect(race.mechs.map((m) => m.points).sort((x, y) => y - x)).toEqual(POINTS.slice(0, 2));
  });

  it('the state is plain data: nothing is lost in a JSON round trip', () => {
    const race = newRace(13);
    for (let i = 0; i < 6000; i++) stepRace(race, TRACK, []);
    const text = JSON.stringify(race);
    const round = JSON.parse(text) as RaceState;
    expect(JSON.stringify(round)).toBe(text);
    // No NaN/Infinity (JSON would have turned them into null) and no
    // undefined fields (JSON would have dropped them).
    expect(text.includes('null')).toBe(false);
    expect(Object.keys(round.mechs[0]).length).toBe(Object.keys(race.mechs[0]).length);
    expect(Object.keys(round).sort()).toEqual(Object.keys(race).sort());
  });
});

describe('the test suite\'s own NaN detector', () => {
  it('covers every numeric field of the race state', () => {
    // findNonFinite is what the fuzz and whole-race tests rely on. Poison
    // each number in turn and make sure it notices, so that a field added
    // to the state later cannot slip past it.
    const race = newRace(3, { humans: [FW0] });
    const inputs = makeInputs(race);
    (inputs[FW0] as MechInput).throttle = 1;
    for (let i = 0; i < 300; i++) stepRace(race, TRACK, inputs);
    race.projectiles.push({ id: 1, owner: 0, team: 0, attack: 4, s: 0, d: 0, vs: 0, vd: 0, life: 5 });
    expect(findNonFinite(race)).toBe(null);
    let poisoned = 0;
    const poison = (label: string, obj: object) => {
      const rec = obj as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        const keep = rec[key];
        if (typeof keep !== 'number') continue;
        for (const bad of [NaN, Infinity, -Infinity]) {
          rec[key] = bad;
          if (findNonFinite(race) === null) throw new Error(`findNonFinite missed ${label}.${key} = ${bad}`);
        }
        rec[key] = keep;
        poisoned++;
      }
    };
    poison('race', race);
    for (const m of race.mechs) {
      poison(`mech ${m.id}`, m);
      poison(`mech ${m.id}.ai`, m.ai);
    }
    for (const p of race.projectiles) poison('projectile', p);
    for (const t of race.teams) poison('team', t);
    expect(findNonFinite(race)).toBe(null);
    expect(poisoned).toBeGreaterThan(6 * 60);
  });
});

describe('the sim only reads what it is given', () => {
  it('never calls Math.random or the clock', () => {
    const race = newRace(8, { humans: [MF1] });
    const script = scriptedHumans(race, [MF1], 5);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const perf = vi.spyOn(performance, 'now').mockReturnValue(0);
    for (let i = 0; i < 7000; i++) stepRace(race, TRACK, script(i));
    const calls = [random.mock.calls.length, now.mock.calls.length, perf.mock.calls.length];
    vi.restoreAllMocks();
    expect(calls).toEqual([0, 0, 0]);
    expect(race.tick).toBe(7000);
  });

  it('does not write to the inputs, the seat list or the config', () => {
    // (The scripted-human runs above also feed the sim frozen inputs.)
    const seats = makeSeats([FW0, MF1]);
    seats.forEach((s) => Object.freeze(s));
    const cfg = Object.freeze({ seed: 5, seats: Object.freeze(seats) as typeof seats, laps: 1 });
    const race = createRace(TRACK, cfg);
    const rnd = makeRandom(1);
    for (let i = 0; i < 2500; i++) {
      const inputs: Inputs = race.mechs.map((m) => {
        if (!m.human) return null;
        const inp = emptyInput();
        inp.throttle = 1;
        inp.mx = rnd() * 2 - 1;
        inp.my = rnd() * 2 - 1;
        inp.buttons = Math.floor(rnd() * 256);
        inp.cmd = Math.floor(rnd() * 5);
        return Object.freeze(inp); // a write would throw: modules are strict
      });
      stepRace(race, TRACK, Object.freeze(inputs) as Inputs);
    }
    expect(race.tick).toBe(2500);
    expect(cfg.seats.length).toBe(6);
  });

  it('does not write to the track or the tuning tables', () => {
    // Compared with fingerprints taken before any race in this file ran.
    expect(tables()).toBe(tablesBefore);
    expect(trackPrint()).toBe(trackBefore);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ABILITIES,
  ATTACKS,
  BTN,
  BTN_MASK,
  CLASSES,
  DEFAULT_RULES,
  MERIDIAN,
  PHASE,
  POINTS,
  RULE_KEYS,
  createRace,
  emptyInput,
  rngNext,
  stepRace,
} from '../src/sim/index';
import type { MechInput, RaceState, Rules, SimEvent } from '../src/sim/index';
import { DF0, FW0, MF0, MF1, TRACK, findNonFinite, hash, makeInputs, makeRandom, makeSeats, mash, newRace, snapshot, stateHash } from './helpers';
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

const tables = () => JSON.stringify([ATTACKS, CLASSES, MERIDIAN, POINTS, ABILITIES, DEFAULT_RULES, RULE_KEYS]);
const trackPrint = () =>
  hash(JSON.stringify([TRACK.length, TRACK.strips, TRACK.gates, Array.from(TRACK.kappa), Array.from(TRACK.line), Array.from(TRACK.px), Array.from(TRACK.bank), Array.from(TRACK.kappaAhead)]));

/** How many events of each type a run raised, to show a run really exercised a system. */
type Counts = Partial<Record<SimEvent['type'], number>>;
function counter(): { counts: Counts; onTick: (race: RaceState) => void } {
  const counts: Counts = {};
  return {
    counts,
    onTick: (race) => {
      for (const e of race.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    },
  };
}

// Two reference runs the tests below share: a complete all-AI race, and the
// first 9000 ticks (well into the battle lap) of a race with two scripted
// humans. The humans start with a full set of Cells (rules.cellStart), so
// the ability button in their input stream really does something.
const AI_SEED = 4242;
const HUMAN_SEED = 606;
const HUMAN_RULES: Partial<Rules> = { cellStart: 3 };
const humanRace = () => newRace(HUMAN_SEED, { humans: [FW0, MF1], rules: HUMAN_RULES });
const tablesBefore = tables();
const trackBefore = trackPrint();
const aiCount = counter();
const aiRun = trace(newRace(AI_SEED), 30000, noInputs, aiCount.onTick);
const humanCount = counter();
const humanRun = (() => {
  const race = humanRace();
  return trace(race, 9000, scriptedHumans(race, [FW0, MF1], 31337), humanCount.onTick);
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
    expect(aiRun.at.size).toBeGreaterThan(22); // a checkpoint every 500 ticks of a ~13000 tick race
    const again = trace(newRace(AI_SEED), 30000, noInputs);
    expect(flat(again)).toEqual(flat(aiRun));
  });

  it('and that reference race has the new systems in play: gates, Cells, abilities, the tow', () => {
    // Otherwise "identical" would say nothing about them.
    const c = aiCount.counts;
    expect(c.gate ?? 0).toBeGreaterThan(6);
    expect(c.ability ?? 0).toBeGreaterThan(2);
    expect(c.hit ?? 0).toBeGreaterThan(50);
    expect(c.raceEnd).toBe(1);
    // The same race again, watching the state the events do not show.
    const race = newRace(AI_SEED);
    const seen = { tow: 0, slingshot: 0, cells: 0, timers: 0, gateMask: 0 };
    while (race.phase !== PHASE.FINISHED && race.tick < 30000) {
      stepRace(race, TRACK, []);
      for (const m of race.mechs) {
        if (m.tow > 0) seen.tow++;
        if (m.tow > 0 && !m.drafting) seen.slingshot++;
        if (m.cells > 0) seen.cells++;
        if (m.gateMask !== 0) seen.gateMask++;
        if (m.overdriveT + m.ramT + m.shieldT + m.snareT + m.cloakT > 0) seen.timers++;
      }
    }
    expect(stateHash(race)).toBe(aiRun.end);
    for (const [what, ticks] of Object.entries(seen)) {
      if (ticks < 100) throw new Error(`the reference race hardly touched '${what}' (${ticks} mech-ticks)`);
    }
  });

  it('the rules are part of the race: same seed with another rule is another race', () => {
    const base = trace(newRace(AI_SEED), 1500, noInputs);
    for (const [tick, h] of base.at) expect(h).toBe(aiRun.at.get(tick));
    // Spelling the defaults out changes nothing...
    const spelled = trace(newRace(AI_SEED, { rules: { ...DEFAULT_RULES } }), 1500, noInputs);
    expect(flat(spelled)).toEqual(flat(base));
    // ...one different number does, from the first snapshot (it is in the state)...
    const other = trace(newRace(AI_SEED, { rules: { limiter1: 111 } }), 1500, noInputs);
    for (const [tick, h] of other.at) expect(h).not.toBe(base.at.get(tick));
    // ...and that race is just as repeatable.
    expect(flat(trace(newRace(AI_SEED, { rules: { limiter1: 111 } }), 1500, noInputs))).toEqual(flat(other));
  });

  it('a mirrored grid is another race, and just as repeatable', () => {
    const flipped = trace(newRace(AI_SEED, { gridFlip: true }), 1500, noInputs);
    expect(flipped.end).not.toBe(trace(newRace(AI_SEED), 1500, noInputs).end);
    expect(flat(trace(newRace(AI_SEED, { gridFlip: true }), 1500, noInputs))).toEqual(flat(flipped));
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

  it('...and the script includes the ability button, pressed to effect', () => {
    // The mashers' own presses: abilities fired by the two human seats.
    const race = humanRace();
    const script = scriptedHumans(race, [FW0, MF1], 31337);
    let pressed = 0;
    const byHumans: number[] = [];
    const denied = new Set<string>();
    for (let i = 0; i < 9000; i++) {
      const inputs = script(race.tick + 1);
      for (const id of [FW0, MF1]) if (inputs[id]!.buttons & BTN.ABILITY) pressed++;
      stepRace(race, TRACK, inputs);
      for (const e of race.events) {
        if (e.type === 'ability' && (e.mech === FW0 || e.mech === MF1)) byHumans.push(e.ability);
        if (e.type === 'denied' && (e.mech === FW0 || e.mech === MF1)) denied.add(e.reason);
      }
    }
    expect(stateHash(race)).toBe(humanRun.end);
    expect(pressed).toBeGreaterThan(1000);
    expect(byHumans.length).toBeGreaterThan(0);
    // Three Cells at most at a time, and the gates are lit for three laps: no way past that.
    expect(byHumans.length).toBeLessThanOrEqual(2 * 3 * 3);
    expect(denied.has('weapons')).toBe(true); // mashing it on the formation lap
    expect(humanCount.counts.ability ?? 0).toBeGreaterThanOrEqual(byHumans.length);
  });

  it('a recorded input stream, ability presses and all, replays to the identical race', () => {
    // Record what three humans (one of each frame) send, tick by tick, then
    // feed the recording to a fresh race: a replay file, or a server
    // re-simulating a client's race.
    const make = () => newRace(909, { humans: [FW0, MF0, DF0], rules: { cellStart: 3 } });
    const live = make();
    const script = scriptedHumans(live, [FW0, MF0, DF0], 2718);
    const tape: string[] = [];
    const liveEvents: string[] = [];
    const liveMarks: string[] = [];
    const abilities = new Set<number>();
    for (let i = 0; i < 7500; i++) {
      const inputs = script(live.tick + 1);
      tape.push(JSON.stringify(inputs));
      stepRace(live, TRACK, inputs);
      if (live.events.length) liveEvents.push(live.tick + JSON.stringify(live.events));
      if (live.tick % 250 === 0) liveMarks.push(stateHash(live));
      for (const e of live.events) if (e.type === 'ability' && live.mechs[e.mech].human) abilities.add(e.ability);
    }
    // The humans' own presses fired abilities (and of more than one kind).
    expect(abilities.size).toBeGreaterThan(1);
    expect(tape.some((t) => (JSON.parse(t) as Inputs).some((inp) => inp !== null && (inp.buttons & BTN.ABILITY) !== 0))).toBe(true);
    const replay = make();
    const replayEvents: string[] = [];
    const replayMarks: string[] = [];
    for (const frame of tape) {
      stepRace(replay, TRACK, JSON.parse(frame) as Inputs);
      if (replay.events.length) replayEvents.push(replay.tick + JSON.stringify(replay.events));
      if (replay.tick % 250 === 0) replayMarks.push(stateHash(replay));
    }
    expect(replayMarks).toEqual(liveMarks);
    expect(replayMarks.length).toBe(30);
    expect(snapshot(replay)).toBe(snapshot(live));
    expect(replayEvents).toEqual(liveEvents);
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
    expect(race.lapPhase).toBe(2);
    expect(stateHash(race)).toBe(aiRun.at.get(at));
    const copies = [structuredClone(race), JSON.parse(JSON.stringify(race)) as RaceState];
    for (const copy of copies) {
      expect(snapshot(copy)).toBe(snapshot(race));
      // A copy shares nothing with the original: not the mechs, not the rules.
      expect(copy.rules).not.toBe(race.rules);
      expect(copy.rules).toEqual(race.rules);
      const t = trace(copy, 3000, noInputs);
      expect(t.endTick).toBe(at + 3000);
      for (const [tick, h] of t.at) expect(h).toBe(aiRun.at.get(tick));
    }
  });

  it('a copy taken on the speed lap, effects running, finishes the same race as the original', () => {
    // Copy the race at the first moment on lap 3 when an ability effect is
    // live and somebody is in a slingshot, then run both to the flag.
    const race = newRace(AI_SEED);
    let found = false;
    while (race.phase !== PHASE.FINISHED && race.tick < 30000) {
      stepRace(race, TRACK, []);
      if (race.lapPhase < 3) continue;
      const effect = race.mechs.some((m) => m.overdriveT > 0 || m.ramT > 0 || m.shieldT > 0 || m.snareT > 0 || m.cloakT > 0);
      const slingshot = race.mechs.some((m) => m.tow > 0 && !m.drafting);
      if (effect && slingshot) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    const copy = structuredClone(race);
    expect(snapshot(copy)).toBe(snapshot(race));
    const rest = (r: RaceState) => {
      let events = '';
      while (r.phase !== PHASE.FINISHED && r.tick < 30000) {
        stepRace(r, TRACK, []);
        if (r.events.length) events += r.tick + JSON.stringify(r.events);
      }
      return hash(events);
    };
    const eventsOriginal = rest(race);
    const eventsCopy = rest(copy);
    expect(eventsCopy).toBe(eventsOriginal);
    expect(snapshot(copy)).toBe(snapshot(race));
    expect(stateHash(copy)).toBe(aiRun.end);
  });

  it('stepping a copy does not touch the original', () => {
    const race = newRace(AI_SEED);
    for (let i = 0; i < 5600; i++) stepRace(race, TRACK, []);
    const before = snapshot(race);
    const copy = structuredClone(race);
    copy.rules.limiter2 = 60; // retune the copy only
    for (let i = 0; i < 600; i++) stepRace(copy, TRACK, []);
    expect(snapshot(race)).toBe(before);
    expect(race.rules.limiter2).toBe(DEFAULT_RULES.limiter2);
    expect(snapshot(copy)).not.toBe(before);
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
    race.projectiles.push({ id: 1, owner: 0, team: 0, attack: 4, charged: false, power: 1, s: 0, d: 0, h: 0, vs: 0, vd: 0, life: 5 });
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
    poison('rules', race.rules);
    expect(Object.keys(race.rules).sort()).toEqual([...RULE_KEYS].sort());
    for (const m of race.mechs) {
      poison(`mech ${m.id}`, m);
      poison(`mech ${m.id}.ai`, m.ai);
    }
    for (const p of race.projectiles) poison('projectile', p);
    for (const t of race.teams) poison('team', t);
    expect(findNonFinite(race)).toBe(null);
    expect(poisoned).toBeGreaterThan(6 * 70 + RULE_KEYS.length);
  });

  it('knows the v0.2 fields by name', () => {
    const race = newRace(3);
    const m = race.mechs[2] as unknown as Record<string, number>;
    for (const key of ['cells', 'gateMask', 'cdAbility', 'overdriveT', 'ramT', 'ramHits', 'shieldT', 'snareT', 'cloakT', 'tow']) {
      expect(typeof m[key]).toBe('number');
      const keep = m[key];
      m[key] = NaN;
      expect(findNonFinite(race)).toContain(`mech 2.${key}`);
      m[key] = keep;
    }
    const ai = race.mechs[2].ai as unknown as Record<string, number>;
    for (const key of ['gates', 'abilityAt']) {
      const keep = ai[key];
      ai[key] = Infinity;
      expect(findNonFinite(race)).toContain(`mech 2.ai.${key}`);
      ai[key] = keep;
    }
    race.rules.towBuild = NaN;
    expect(findNonFinite(race)).toContain('rules.towBuild');
    race.rules.towBuild = DEFAULT_RULES.towBuild;
    expect(findNonFinite(race)).toBe(null);
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
        inp.buttons = Math.floor(rnd() * (BTN_MASK + 1));
        inp.cmd = Math.floor(rnd() * 5);
        return Object.freeze(inp); // a write would throw: modules are strict
      });
      stepRace(race, TRACK, Object.freeze(inputs) as Inputs);
    }
    expect(race.tick).toBe(2500);
    expect(cfg.seats.length).toBe(6);
  });

  it('copies the rules it is given: the config\'s object is never written to, or kept', () => {
    const given: Partial<Rules> = Object.freeze({ limiter1: 100, cellStart: 2, towBuild: 0.5 });
    const cfg = Object.freeze({ seed: 5, seats: makeSeats(), laps: 1, rules: given });
    const race = createRace(TRACK, cfg);
    expect(race.rules).not.toBe(given);
    expect(race.rules.limiter1).toBe(100);
    for (let i = 0; i < 1500; i++) stepRace(race, TRACK, []);
    expect(given).toEqual({ limiter1: 100, cellStart: 2, towBuild: 0.5 });
    // Retuning the race afterwards does not reach back into the config either,
    // and never into the shared defaults.
    race.rules.limiter1 = 90;
    expect(given.limiter1).toBe(100);
    expect(DEFAULT_RULES.limiter1).toBe(110);
    expect(Object.isFrozen(DEFAULT_RULES)).toBe(true);
    // Two races made from one config do not share a rules object.
    const other = createRace(TRACK, cfg);
    expect(other.rules).not.toBe(race.rules);
    expect(other.rules.limiter1).toBe(100);
  });

  it('does not write to the track or the tuning tables', () => {
    // Compared with fingerprints taken before any race in this file ran.
    expect(tables()).toBe(tablesBefore);
    expect(trackPrint()).toBe(trackBefore);
  });
});

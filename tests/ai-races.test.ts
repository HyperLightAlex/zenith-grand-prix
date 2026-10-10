import { beforeAll, describe, expect, it } from 'vitest';
import {
  BOOST_MULT,
  CLASSES,
  COUNTDOWN_TICKS,
  DRAFT_MULT,
  DRIVE_MAX,
  DT,
  FINISH_GRACE_TICKS,
  MODE,
  PACE,
  PHASE,
  POINTS,
  TICK_RATE,
  stepRace,
} from '../src/sim/index';
import { MAX_RACE_TICKS, TRACK, findNonFinite, newRace, wallOvershoot } from './helpers';

// Forty complete three-lap races with AI in every seat, checked on every
// tick. The seeds are the ones `npm run sim -- 40` uses, and the skill mix
// varies so that lopsided grids are covered as well.
const RACES = 40;
const SKILLS: Array<readonly [number, number]> = [
  [0.6, 0.6],
  [0.3, 0.9],
  [0.9, 0.3],
  [1, 1],
  [0, 0],
];
/** Above this a mech is not racing any more, it is a bug. Top speed lap 3 is 128, x boost x draft = 154, plus a dash is ~230. */
const SPEED_CEILING = 260;
const COMBAT_EVENTS = new Set(['windup', 'swing', 'shot', 'hit', 'parry', 'guardBreak', 'evade', 'escape', 'splat', 'ko', 'projEnd']);

interface Summary {
  seed: number;
  finished: boolean;
  ticks: number;
  firstFinishTick: number;
  nonFinite: string | null;
  wallBreak: string | null;
  gaugeBreak: string | null;
  lockBreak: string | null;
  placeBreak: string | null;
  maxSpeed: number;
  lap1Combat: string[];
  lap1HpLost: number;
  phaseEvents: Array<[number, number]>;
  phaseWentBack: boolean;
  firstLap: number[];
  raceEnds: number;
  finishPlaces: number[];
  staleFinish: number;
  hitDamage: number;
  splatDamage: number;
  koEvents: number;
  koCredited: number;
  points: number[];
  places: number[];
  retired: boolean[];
  finishedFlags: boolean[];
  finishTimes: number[];
  hp: number[];
  dmgTaken: number[];
  dmgDealt: number[];
  kos: number[];
  team: number[];
  role: number[];
}

const results: Summary[] = [];

function runOne(seed: number, skill: readonly [number, number]): Summary {
  const race = newRace(seed, { skill });
  const n = race.mechs.length;
  const sum: Summary = {
    seed,
    finished: false,
    ticks: 0,
    firstFinishTick: -1,
    nonFinite: null,
    wallBreak: null,
    gaugeBreak: null,
    lockBreak: null,
    placeBreak: null,
    maxSpeed: 0,
    lap1Combat: [],
    lap1HpLost: 0,
    phaseEvents: [],
    phaseWentBack: false,
    firstLap: new Array<number>(n).fill(-1),
    raceEnds: 0,
    finishPlaces: [],
    staleFinish: 0,
    hitDamage: 0,
    splatDamage: 0,
    koEvents: 0,
    koCredited: 0,
    points: [],
    places: [],
    retired: [],
    finishedFlags: [],
    finishTimes: [],
    hp: [],
    dmgTaken: [],
    dmgDealt: [],
    kos: [],
    team: race.mechs.map((m) => m.team),
    role: race.mechs.map((m) => m.role),
  };
  const announced: Array<[number, number]> = [];
  let lastPhase = race.lapPhase;
  while (race.phase !== PHASE.FINISHED && race.tick < MAX_RACE_TICKS) {
    const phaseBefore = race.lapPhase;
    stepRace(race, TRACK, []);
    const tick = race.tick;
    if (race.lapPhase < lastPhase) sum.phaseWentBack = true;
    lastPhase = race.lapPhase;

    if (!sum.nonFinite) sum.nonFinite = findNonFinite(race);
    let placeMask = 0;
    for (const m of race.mechs) {
      const c = CLASSES[m.role];
      placeMask |= 1 << m.place;
      if (m.speed > sum.maxSpeed) sum.maxSpeed = m.speed;
      if (!sum.wallBreak && wallOvershoot(m) > 1e-9) sum.wallBreak = `tick ${tick}: mech ${m.id} d=${m.d}`;
      if (!sum.gaugeBreak && (m.hp < 0 || m.hp > c.maxHp || m.drive < 0 || m.drive > DRIVE_MAX || m.guard < 0 || m.guard > c.guardMax || m.speed < 0)) {
        sum.gaugeBreak = `tick ${tick}: mech ${m.id} hp=${m.hp} drive=${m.drive} guard=${m.guard} speed=${m.speed}`;
      }
      if (!sum.lockBreak) {
        if ((m.mode === MODE.BATTLE) !== (m.target >= 0)) sum.lockBreak = `tick ${tick}: mech ${m.id} mode ${m.mode} with target ${m.target}`;
        else if (m.target >= 0) {
          const t = race.mechs[m.target];
          if (t === m || t.retired || t.finished || m.retired || m.finished) sum.lockBreak = `tick ${tick}: mech ${m.id} locked on ${m.target}`;
        }
      }
      if (phaseBefore === 1 && race.lapPhase === 1) sum.lap1HpLost += c.maxHp - m.hp;
    }
    if (!sum.placeBreak && placeMask !== (1 << (n + 1)) - 2) sum.placeBreak = `tick ${tick}: places ${race.mechs.map((m) => m.place)}`;

    for (const e of race.events) {
      // An event belongs to lap 1 if the formation phase was on when the tick began.
      if (phaseBefore === 1 && COMBAT_EVENTS.has(e.type)) sum.lap1Combat.push(`${tick}:${e.type}`);
      switch (e.type) {
        case 'lapPhase':
          sum.phaseEvents.push([tick, e.lap]);
          break;
        case 'lap':
          if (e.lap === 2) sum.firstLap[e.mech] = (tick - COUNTDOWN_TICKS) * DT;
          break;
        case 'finish':
          sum.finishPlaces.push(e.place);
          announced.push([e.mech, e.place]);
          break;
        case 'raceEnd':
          sum.raceEnds++;
          break;
        case 'hit':
          sum.hitDamage += e.damage;
          break;
        case 'splat':
          sum.splatDamage += e.damage;
          break;
        case 'ko':
          sum.koEvents++;
          if (e.by >= 0) sum.koCredited++;
          break;
      }
    }
  }
  sum.finished = race.phase === PHASE.FINISHED;
  sum.ticks = race.tick;
  sum.firstFinishTick = race.firstFinishTick;
  for (const [id, place] of announced) if (race.mechs[id].place !== place) sum.staleFinish++;
  for (const m of race.mechs) {
    sum.points.push(m.points);
    sum.places.push(m.place);
    sum.retired.push(m.retired);
    sum.finishedFlags.push(m.finished);
    sum.finishTimes.push(m.finishTime);
    sum.hp.push(m.hp);
    sum.dmgTaken.push(m.dmgTaken);
    sum.dmgDealt.push(m.dmgDealt);
    sum.kos.push(m.kos);
  }
  return sum;
}

beforeAll(() => {
  for (let r = 0; r < RACES; r++) results.push(runOne(1 + r * 7919, SKILLS[r % SKILLS.length]));
}, 120_000);

/** Run a check against every race, reporting the seed that broke it. */
function each(check: (s: Summary) => void): void {
  expect(results.length).toBe(RACES);
  for (const s of results) {
    try {
      check(s);
    } catch (err) {
      throw new Error(`seed ${s.seed}: ${(err as Error).message}`);
    }
  }
}

describe(`${RACES} all-AI races`, () => {
  it('every race reaches the flag within 8 simulated minutes', () => {
    each((s) => {
      expect(s.finished).toBe(true);
      expect(s.ticks).toBeLessThan(MAX_RACE_TICKS);
      expect(s.raceEnds).toBe(1);
      // Three 90-second laps at the limiter is the long way to do it.
      expect(s.ticks * DT).toBeGreaterThan(4 * 60);
      expect(s.ticks * DT).toBeLessThan(5.5 * 60);
    });
  });

  it('no NaN or Infinity ever appears in the state', () => {
    each((s) => expect(s.nonFinite).toBe(null));
  });

  it('no mech is ever outside the walls', () => {
    each((s) => expect(s.wallBreak).toBe(null));
  });

  it('armour, Drive, guard and speed stay inside their ranges', () => {
    each((s) => expect(s.gaugeBreak).toBe(null));
  });

  it('nobody is ever locked on to itself or to a mech that is out of the race', () => {
    each((s) => expect(s.lockBreak).toBe(null));
  });

  it('places are a clean 1..6 on every tick', () => {
    each((s) => expect(s.placeBreak).toBe(null));
  });

  it(`no mech exceeds ${SPEED_CEILING} u/s`, () => {
    each((s) => {
      expect(s.maxSpeed).toBeLessThan(SPEED_CEILING);
      // ...and the speed lap does get properly quick.
      expect(s.maxSpeed).toBeGreaterThan(PACE * BOOST_MULT * DRAFT_MULT);
    });
  });

  it('the formation lap is clean: no attack starts, no damage of any kind', () => {
    each((s) => {
      expect(s.lap1Combat).toEqual([]);
      expect(s.lap1HpLost).toBe(0);
    });
  });

  it('the phases run 1 -> 2 -> 3, once each, never backwards', () => {
    each((s) => {
      expect(s.phaseEvents.map((p) => p[1])).toEqual([2, 3]);
      expect(s.phaseWentBack).toBe(false);
    });
  });

  it('first laps take between 80 and 110 seconds, for the whole field', () => {
    each((s) => {
      for (const t of s.firstLap) {
        expect(t).toBeGreaterThan(80);
        expect(t).toBeLessThan(110);
      }
      // The leader's first lap is the moment the battle phase starts.
      expect(Math.min(...s.firstLap)).toBe((s.phaseEvents[0][0] - COUNTDOWN_TICKS) * DT);
      // The pack bonus keeps the field together on the limiter.
      expect(Math.max(...s.firstLap) - Math.min(...s.firstLap)).toBeLessThan(5);
    });
  });

  it('points are handed out correctly: 15-7-5-3-2-1 down the classified runners, 0 for wrecks', () => {
    each((s) => {
      const classified = s.retired.filter((r) => !r).length;
      expect([...s.places].sort()).toEqual([1, 2, 3, 4, 5, 6]);
      for (let id = 0; id < 6; id++) {
        if (s.retired[id]) {
          expect(s.points[id]).toBe(0);
          expect(s.places[id]).toBeGreaterThan(classified);
          expect(s.hp[id]).toBe(0);
          expect(s.finishedFlags[id]).toBe(false);
        } else {
          expect(s.points[id]).toBe(POINTS[s.places[id] - 1]);
          expect(s.places[id]).toBeLessThanOrEqual(classified);
          expect(s.finishedFlags[id]).toBe(true);
          expect(s.hp[id]).toBeGreaterThan(0);
        }
      }
      const total = s.points.reduce((a, b) => a + b, 0);
      expect(total).toBe(POINTS.slice(0, classified).reduce((a, b) => a + b, 0));
      const t0 = s.points.filter((_, id) => s.team[id] === 0).reduce((a, b) => a + b, 0);
      const t1 = s.points.filter((_, id) => s.team[id] === 1).reduce((a, b) => a + b, 0);
      expect(t0 + t1).toBe(total);
    });
  });

  it('the classification is ordered by finish time, and finish events agree with it', () => {
    each((s) => {
      const classified = [0, 1, 2, 3, 4, 5].filter((id) => !s.retired[id]).sort((a, b) => s.places[a] - s.places[b]);
      for (let i = 1; i < classified.length; i++) {
        expect(s.finishTimes[classified[i]]).toBeGreaterThanOrEqual(s.finishTimes[classified[i - 1]]);
      }
      expect(s.staleFinish).toBe(0);
      expect(s.finishPlaces).toEqual(s.finishPlaces.map((_, i) => i + 1));
      if (s.firstFinishTick >= 0) {
        expect(s.ticks).toBeLessThanOrEqual(s.firstFinishTick + FINISH_GRACE_TICKS);
        const winner = classified[0];
        expect(s.finishTimes[winner]).toBeLessThanOrEqual(s.firstFinishTick * DT);
        expect(s.finishTimes[winner]).toBeGreaterThan((s.firstFinishTick - 1) * DT);
      }
    });
  });

  it('damage books balance: dealt + wall damage = taken = armour lost', () => {
    each((s) => {
      for (let id = 0; id < 6; id++) {
        expect(s.dmgTaken[id]).toBeCloseTo(CLASSES[s.role[id]].maxHp - s.hp[id], 6);
      }
      const dealt = s.dmgDealt.reduce((a, b) => a + b, 0);
      const taken = s.dmgTaken.reduce((a, b) => a + b, 0);
      expect(dealt).toBeCloseTo(s.hitDamage, 6);
      expect(dealt + s.splatDamage).toBeCloseTo(taken, 6);
      // There was a real fight on lap 2 in every one of them.
      expect(s.hitDamage).toBeGreaterThan(500);
    });
  });

  it('every knock-out is one retirement and at most one credit', () => {
    each((s) => {
      expect(s.koEvents).toBe(s.retired.filter(Boolean).length);
      expect(s.kos.reduce((a, b) => a + b, 0)).toBe(s.koCredited);
    });
  });

  it('neither side of the grid has a built-in advantage', () => {
    // Even-skill races only. Not a balance test: with update-order or grid
    // bias one team would win nearly all of these.
    let even = 0;
    const wins = [0, 0];
    for (const s of results) {
      const idx = results.indexOf(s) % SKILLS.length;
      if (SKILLS[idx][0] !== SKILLS[idx][1]) continue;
      even++;
      const t0 = s.points.filter((_, id) => s.team[id] === 0).reduce((a, b) => a + b, 0);
      const t1 = s.points.filter((_, id) => s.team[id] === 1).reduce((a, b) => a + b, 0);
      if (t0 > t1) wins[0]++;
      else if (t1 > t0) wins[1]++;
    }
    expect(even).toBe(24);
    expect(wins[0]).toBeGreaterThanOrEqual(5);
    expect(wins[1]).toBeGreaterThanOrEqual(5);
  });

  it('skill matters: the stronger team wins most lopsided races', () => {
    let strong = 0;
    let lopsided = 0;
    results.forEach((s, r) => {
      const [a, b] = SKILLS[r % SKILLS.length];
      if (a === b) return;
      lopsided++;
      const t0 = s.points.filter((_, id) => s.team[id] === 0).reduce((x, y) => x + y, 0);
      const t1 = s.points.filter((_, id) => s.team[id] === 1).reduce((x, y) => x + y, 0);
      if (a > b ? t0 > t1 : t1 > t0) strong++;
    });
    expect(lopsided).toBe(16);
    expect(strong).toBeGreaterThan(lopsided / 2);
  });

  it('runs comfortably faster than real time', () => {
    // Not a benchmark, just a tripwire against something quadratic sneaking in.
    const race = newRace(424242);
    const t0 = Date.now();
    for (let i = 0; i < 50 * TICK_RATE; i++) stepRace(race, TRACK, []);
    const wall = Math.max(0.001, (Date.now() - t0) / 1000);
    expect((race.tick * DT) / wall).toBeGreaterThan(50);
  });
});

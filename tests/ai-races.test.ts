import { beforeAll, describe, expect, it } from 'vitest';
import {
  ABILITIES,
  ABILITY,
  CLASSES,
  COUNTDOWN_TICKS,
  DEFAULT_RULES,
  DRIVE_MAX,
  DT,
  FINISH_GRACE_TICKS,
  MODE,
  PHASE,
  POINTS,
  SPEED_CEILING,
  TICK_RATE,
  scoreRound,
  stepRace,
} from '../src/sim/index';
import { MAX_RACE_TICKS, TRACK, findNonFinite, newRace, wallOvershoot } from './helpers';

// Forty complete three-lap races with AI in every seat, checked on every
// tick. The seeds and the grids are the ones `npm run sim -- 40` uses (every
// other race is run on the mirrored grid, as a match would), all on the
// default rules, and the skill mix varies so that lopsided grids are covered
// as well.
const RACES = 40;
const SKILLS: Array<readonly [number, number]> = [
  [0.6, 0.6],
  [0.3, 0.9],
  [0.9, 0.3],
  [1, 1],
  [0, 0],
];
const RULES = DEFAULT_RULES;
/**
 * Above this a mech is not racing any more, it is a bug. The quickest thing
 * the rules allow is a forward in Overdrive with a full speed-lap tow (160 x
 * 1.3 x 1.08 = 225 u/s); anything thrown past its cap is cut to SPEED_CEILING
 * times that the moment it moves.
 */
const SPEED_BOUND = CLASSES[0].topSpeed * RULES.topScale * RULES.overdriveMult * (1 + RULES.tow3) * SPEED_CEILING;
const COMBAT_EVENTS = new Set(['windup', 'swing', 'shot', 'hit', 'parry', 'guardBreak', 'evade', 'escape', 'splat', 'ko', 'projEnd', 'ability', 'snared']);

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
  // --- v0.2: Cells, gates, abilities, the tow
  /** First thing that went wrong with a Cell count, a gate or an ability, or null. */
  cellBreak: string | null;
  timerBreak: string | null;
  /** Gates threaded, per mech. */
  gates: number[];
  /** Gates scored on each mech's formation lap only. */
  gatesLap1: number[];
  /** Cells each mech held when the battle lap began. */
  cellsAtLap2: number[];
  /** Uses of each ability, by ABILITY index. */
  abilityUses: number[];
  abilitiesByMech: number[];
  snared: number;
  /** Ticks somebody spent with a tow charge, and in the slingshot after pulling out. */
  towTicks: number;
  slingshotTicks: number;
  /** Tick the leader started lap 2, counted from the start of the countdown. */
  lap2Tick: number;
  winner: number;
  roundPoints: [number, number];
}

const results: Summary[] = [];

function runOne(seed: number, skill: readonly [number, number], gridFlip: boolean): Summary {
  const race = newRace(seed, { skill, gridFlip });
  const n = race.mechs.length;
  const rules = race.rules;
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
    cellBreak: null,
    timerBreak: null,
    gates: new Array<number>(n).fill(0),
    gatesLap1: new Array<number>(n).fill(0),
    cellsAtLap2: [],
    abilityUses: ABILITIES.map(() => 0),
    abilitiesByMech: new Array<number>(n).fill(0),
    snared: 0,
    towTicks: 0,
    slingshotTicks: 0,
    lap2Tick: -1,
    winner: -1,
    roundPoints: [0, 0],
  };
  const announced: Array<[number, number]> = [];
  let lastPhase = race.lapPhase;
  /** Cells each mech should hold, kept up to date from the events alone. */
  const cells = race.mechs.map((m) => m.cells);
  const lapBefore = race.mechs.map((m) => m.lap);
  const gateSeen = race.mechs.map(() => 0);
  while (race.phase !== PHASE.FINISHED && race.tick < MAX_RACE_TICKS) {
    const phaseBefore = race.lapPhase;
    stepRace(race, TRACK, []);
    const tick = race.tick;
    if (race.lapPhase < lastPhase) sum.phaseWentBack = true;
    lastPhase = race.lapPhase;

    // Cells: every change is accounted for by a gate (+rules.gateValue on the
    // mech's first lap, +rules.gateValueLater after it, up to the cap, each
    // gate once a lap) or an ability (-1, only with weapons free and a whole
    // Cell in hand).
    for (const e of race.events) {
      if (e.type === 'gate') {
        sum.gates[e.mech]++;
        if (lapBefore[e.mech] <= 0) sum.gatesLap1[e.mech]++;
        const worth = lapBefore[e.mech] <= 0 ? rules.gateValue : rules.gateValueLater;
        const bit = 1 << e.gate;
        if (!sum.cellBreak) {
          if (lapBefore[e.mech] >= rules.gateLaps) sum.cellBreak = `tick ${tick}: mech ${e.mech} scored gate ${e.gate} on lap ${lapBefore[e.mech] + 1}`;
          else if (e.gate < 0 || e.gate >= TRACK.gates.length) sum.cellBreak = `tick ${tick}: gate ${e.gate} does not exist`;
          else if (gateSeen[e.mech] & bit) sum.cellBreak = `tick ${tick}: mech ${e.mech} scored gate ${e.gate} twice`;
          else if (cells[e.mech] >= rules.cellMax) sum.cellBreak = `tick ${tick}: mech ${e.mech} scored a gate with its Cells already full`;
          else if (e.cells !== Math.min(rules.cellMax, cells[e.mech] + worth)) sum.cellBreak = `tick ${tick}: gate event says ${e.cells} cells after ${cells[e.mech]}`;
        }
        gateSeen[e.mech] |= bit;
        cells[e.mech] = e.cells;
      } else if (e.type === 'ability') {
        sum.abilityUses[e.ability]++;
        sum.abilitiesByMech[e.mech]++;
        const c = CLASSES[race.mechs[e.mech].role];
        if (!sum.cellBreak) {
          if (phaseBefore < 2) sum.cellBreak = `tick ${tick}: mech ${e.mech} used an ability on the formation lap`;
          else if (cells[e.mech] < 1) sum.cellBreak = `tick ${tick}: mech ${e.mech} used an ability with ${cells[e.mech]} cells`;
          else if (e.ability !== c.abilityFree && e.ability !== c.abilityLocked) sum.cellBreak = `tick ${tick}: mech ${e.mech} used ability ${e.ability}, which is not its own`;
        }
        cells[e.mech] -= 1;
      } else if (e.type === 'snared') {
        sum.snared++;
      }
    }
    for (const m of race.mechs) {
      if (!sum.cellBreak) {
        if (m.cells < 0 || m.cells > rules.cellMax) sum.cellBreak = `tick ${tick}: mech ${m.id} has ${m.cells} cells`;
        else if (m.cells !== cells[m.id]) sum.cellBreak = `tick ${tick}: mech ${m.id} has ${m.cells} cells, the events add up to ${cells[m.id]}`;
        else if (m.gateMask !== gateSeen[m.id] && m.lap === lapBefore[m.id]) sum.cellBreak = `tick ${tick}: mech ${m.id} gateMask ${m.gateMask}, events say ${gateSeen[m.id]}`;
      }
      if (!sum.timerBreak) {
        if (m.cdAbility < 0 || m.overdriveT < 0 || m.ramT < 0 || m.shieldT < 0 || m.snareT < 0 || m.cloakT < 0) sum.timerBreak = `tick ${tick}: mech ${m.id} has a negative timer`;
        else if (m.tow < 0 || m.tow > 1) sum.timerBreak = `tick ${tick}: mech ${m.id} tow ${m.tow}`;
        else if ((m.retired || m.finished) && (m.tow !== 0 || m.drafting)) sum.timerBreak = `tick ${tick}: mech ${m.id} is out of the race with a tow`;
        else if (phaseBefore === 1 && race.lapPhase === 1 && m.overdriveT + m.ramT + m.shieldT + m.snareT + m.cloakT + m.cdAbility !== 0) sum.timerBreak = `tick ${tick}: mech ${m.id} has an effect running on the formation lap`;
      }
      if (m.tow > 0) {
        sum.towTicks++;
        if (!m.drafting) sum.slingshotTicks++;
      }
      // A new lap wipes the gate record: every gate can be scored once a lap.
      if (m.lap > lapBefore[m.id]) {
        gateSeen[m.id] = 0;
        if (!sum.cellBreak && m.gateMask !== 0) sum.cellBreak = `tick ${tick}: mech ${m.id} started lap ${m.lap + 1} with gateMask ${m.gateMask}`;
      }
      lapBefore[m.id] = m.lap;
    }

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
          if (e.lap === 2) {
            sum.lap2Tick = tick;
            sum.cellsAtLap2 = race.mechs.map((m) => m.cells);
          }
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
  const round = scoreRound(race);
  sum.winner = round.winner;
  sum.roundPoints = round.points;
  return sum;
}

beforeAll(() => {
  for (let r = 0; r < RACES; r++) results.push(runOne(1 + r * 7919, SKILLS[r % SKILLS.length], r % 2 === 1));
}, 120_000);

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;

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
      // A lap at each limiter (79 s and 69 s) and a speed lap of about a
      // minute, plus the countdown: three and a half minutes or so.
      expect(s.ticks * DT).toBeGreaterThan(3.25 * 60);
      expect(s.ticks * DT).toBeLessThan(4.25 * 60);
    });
  });

  it('an average race lasts between 3.5 and 3.8 minutes', () => {
    // (Measured at the time of writing: 3:38 on average, 3:31 to 3:45.)
    const minutes = mean(results.map((s) => s.ticks * DT)) / 60;
    expect(minutes).toBeGreaterThan(3.5);
    expect(minutes).toBeLessThan(3.8);
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

  it(`no mech exceeds ${SPEED_BOUND.toFixed(0)} u/s`, () => {
    each((s) => {
      expect(s.maxSpeed).toBeLessThan(SPEED_BOUND);
      // ...and the speed lap does get properly quick: somebody in every race
      // beats what a forward can do on its own with a full tow.
      expect(s.maxSpeed).toBeGreaterThan(CLASSES[0].topSpeed * (1 + RULES.tow3));
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

  it('first laps take between 75 and 86 seconds from GO, for the whole field', () => {
    // 8640 units at the formation limiter (110 u/s) is 78.5 seconds. The pack
    // bonus and the tow let the followers do it a little quicker than that;
    // a detour through the gates costs a little.
    const flat = TRACK.length / RULES.limiter1;
    expect(flat).toBeGreaterThan(75);
    expect(flat).toBeLessThan(86);
    each((s) => {
      for (const t of s.firstLap) {
        expect(t).toBeGreaterThan(75);
        expect(t).toBeLessThan(86);
      }
      // The leader's first lap is the moment the battle phase starts.
      expect(Math.min(...s.firstLap)).toBe((s.phaseEvents[0][0] - COUNTDOWN_TICKS) * DT);
      expect(s.lap2Tick).toBe(s.phaseEvents[0][0]);
      // The pack bonus keeps the field together on the limiter.
      expect(Math.max(...s.firstLap) - Math.min(...s.firstLap)).toBeLessThan(5);
    });
  });

  it('counted from the start of the countdown, lap 1 takes between 80 and 86 seconds', () => {
    // (Measured at the time of writing: 82.3 to 83.7, 82.9 on average. This
    // is the "lap 1" figure `npm run sim` prints.)
    each((s) => {
      expect(s.lap2Tick * DT).toBeGreaterThan(80);
      expect(s.lap2Tick * DT).toBeLessThan(86);
    });
    const avg = mean(results.map((s) => s.lap2Tick * DT));
    expect(avg).toBeGreaterThan(81.5);
    expect(avg).toBeLessThan(84.5);
  });

  it('points are handed out correctly: 15-7-5-3-2-1 down the classified runners, 0 for wrecks, plus 3 per knock-out scored', () => {
    each((s) => {
      const classified = s.retired.filter((r) => !r).length;
      expect([...s.places].sort()).toEqual([1, 2, 3, 4, 5, 6]);
      for (let id = 0; id < 6; id++) {
        // A wreck keeps the bonus for any knock-out it scored before it went.
        const bonus = s.kos[id] * RULES.koPoints;
        if (s.retired[id]) {
          expect(s.points[id]).toBe(bonus);
          expect(s.places[id]).toBeGreaterThan(classified);
          expect(s.hp[id]).toBe(0);
          expect(s.finishedFlags[id]).toBe(false);
        } else {
          expect(s.points[id]).toBe(POINTS[s.places[id] - 1] + bonus);
          expect(s.places[id]).toBeLessThanOrEqual(classified);
          expect(s.finishedFlags[id]).toBe(true);
          expect(s.hp[id]).toBeGreaterThan(0);
        }
      }
      const total = s.points.reduce((a, b) => a + b, 0);
      expect(total).toBe(POINTS.slice(0, classified).reduce((a, b) => a + b, 0) + s.koCredited * RULES.koPoints);
      const t0 = s.points.filter((_, id) => s.team[id] === 0).reduce((a, b) => a + b, 0);
      const t1 = s.points.filter((_, id) => s.team[id] === 1).reduce((a, b) => a + b, 0);
      expect(t0 + t1).toBe(total);
      // The match layer scores the round the same way.
      expect(s.roundPoints).toEqual([t0, t1]);
      if (t0 !== t1) expect(s.winner).toBe(t0 > t1 ? 0 : 1);
      else expect(s.winner).toBe(s.team[s.places.indexOf(1)]);
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

  // ---- v0.2: Cells, gates, abilities and the tow ---------------------------

  it('Cells only ever move by a gate (+0.5, capped, lap 1, once per gate) or an ability (-1)', () => {
    each((s) => expect(s.cellBreak).toBe(null));
  });

  it('timers and the tow stay in range, and nothing runs on the formation lap', () => {
    each((s) => expect(s.timerBreak).toBe(null));
  });

  it('AI pilots thread gates on the formation lap and start the battle lap with Cells in hand', () => {
    each((s) => {
      expect(s.cellsAtLap2.length).toBe(6);
      // No more than the six there are on the formation lap, nor than six a lap after it.
      for (let id = 0; id < 6; id++) {
        expect(s.gatesLap1[id]).toBeLessThanOrEqual(TRACK.gates.length);
        expect(s.gates[id]).toBeLessThanOrEqual(TRACK.gates.length * 3);
        expect(s.cellsAtLap2[id]).toBeLessThanOrEqual(RULES.cellMax);
        expect(s.cellsAtLap2[id]).toBeGreaterThanOrEqual(0);
      }
      // Somebody in every race has at least one whole Cell to spend.
      expect(Math.max(...s.cellsAtLap2)).toBeGreaterThanOrEqual(1);
    });
    // About 1.5 Cells per mech across the batch (measured: 1.44), i.e. about
    // three of the six gates each.
    const perMech = mean(results.map((s) => mean(s.cellsAtLap2)));
    expect(perMech).toBeGreaterThan(1.0);
    expect(perMech).toBeLessThan(2.0);
    const gatesPerMech = mean(results.map((s) => mean(s.gatesLap1)));
    expect(gatesPerMech).toBeGreaterThan(2.0);
    expect(gatesPerMech).toBeLessThan(4.0);
    // Nobody has had a chance to spend one yet, so Cells held = gates x value.
    expect(perMech).toBeCloseTo(gatesPerMech * RULES.gateValue, 1);
  });

  it('better pilots go for more gates', () => {
    const bySkill = new Map<number, number[]>();
    results.forEach((s, r) => {
      const skill = SKILLS[r % SKILLS.length];
      for (let id = 0; id < 6; id++) {
        const k = skill[s.team[id]];
        if (!bySkill.has(k)) bySkill.set(k, []);
        bySkill.get(k)!.push(s.gatesLap1[id]);
      }
    });
    const avg = (k: number) => mean(bySkill.get(k)!);
    expect(avg(0)).toBeLessThan(avg(0.6));
    expect(avg(0.6)).toBeLessThan(avg(1));
    expect(avg(0.3)).toBeLessThan(avg(0.9));
    // Even the worst pilots pick some up; even the best leave a few.
    expect(avg(0)).toBeGreaterThan(0.5);
    expect(avg(1)).toBeLessThan(TRACK.gates.length);
  });

  it('the AI uses every one of the six abilities across the batch', () => {
    const total = ABILITIES.map((_, i) => results.reduce((sum, s) => sum + s.abilityUses[i], 0));
    // (Measured at the time of writing, over the 40 races: between 25 and 55 uses of each.)
    for (const ab of [ABILITY.OVERDRIVE, ABILITY.BREAKAWAY, ABILITY.SNARE, ABILITY.PULSE, ABILITY.RAM, ABILITY.AEGIS]) {
      if (total[ab] < 8) throw new Error(`${ABILITIES[ab].name} was used ${total[ab]} times in ${RACES} races`);
    }
    expect(total.length).toBe(6);
    // Most races see several; no pilot can use more than it has Cells for.
    const perRace = results.map((s) => s.abilityUses.reduce((a, b) => a + b, 0));
    expect(mean(perRace)).toBeGreaterThan(2);
    expect(mean(perRace)).toBeLessThan(6 * RULES.cellMax);
    each((s) => {
      for (let id = 0; id < 6; id++) expect(s.abilitiesByMech[id]).toBeLessThanOrEqual(Math.floor(s.gates[id] * RULES.gateValue));
    });
    // Snares land now and then, but not every Snare fired takes hold.
    const snared = results.reduce((sum, s) => sum + s.snared, 0);
    expect(snared).toBeGreaterThan(0);
    expect(snared).toBeLessThanOrEqual(total[ABILITY.SNARE]);
  });

  it('the tow is part of every race: time in a slipstream, and slingshots out of one', () => {
    each((s) => {
      expect(s.towTicks).toBeGreaterThan(600);
      expect(s.slingshotTicks).toBeGreaterThan(60);
      expect(s.slingshotTicks).toBeLessThan(s.towTicks);
    });
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

import { describe, expect, it } from 'vitest';
import {
  ATK,
  ATTACKS,
  BTN,
  DEFAULT_RULES,
  DT,
  FINISH_GRACE_TICKS,
  PHASE,
  POINTS,
  SPLAT_CREDIT_TICKS,
  koBonus,
  pointsFor,
  scoreRound,
  stepRace,
  teamPoints,
  updatePlaces,
} from '../src/sim/index';
import type { MechState, Rules, SimEvent } from '../src/sim/index';
import { applyHit, retire, setStagger } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK, newRace, runCountdown, runToEnd } from './helpers';

const L = TRACK.length;

/**
 * Final-lap run-in: the given mechs approach the line in that order, 15
 * units apart and spread across the road. Everyone else stays parked far
 * behind (still "running", so they get flagged when the grace period ends).
 */
function runIn(order: number[], rules?: Partial<Rules>): Arena {
  const a = new Arena(3, 1, rules);
  const lanes = [-20, -12, -4, 4, 12, 20];
  order.forEach((id, k) => a.put(id, L - 20 - 15 * k, lanes[id]));
  return a;
}

function toFlag(a: Arena): void {
  const n = a.until(() => a.race.phase === PHASE.FINISHED, FINISH_GRACE_TICKS + 2000);
  expect(n).toBeGreaterThanOrEqual(0);
}

const team = (id: number) => id & 1;

describe('points table', () => {
  it('is 15, 7, 5, 3, 2, 1', () => {
    expect(POINTS).toEqual([15, 7, 5, 3, 2, 1]);
    expect(POINTS.reduce((s, p) => s + p, 0)).toBe(33);
  });
});

describe('everyone finishes', () => {
  const order = [MF1, FW0, DF1, FW1, DF0, MF0];
  const a = runIn(order);
  toFlag(a);
  const race = a.race;

  it('places follow the order across the line', () => {
    expect(order.map((id) => race.mechs[id].place)).toEqual([1, 2, 3, 4, 5, 6]);
    const fins = a.events('finish');
    expect(fins.map((e) => e.mech)).toEqual(order);
    expect(fins.map((e) => e.place)).toEqual([1, 2, 3, 4, 5, 6]);
    const times = order.map((id) => race.mechs[id].finishTime);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    expect(new Set(times).size).toBe(6);
  });

  it('points are handed out by place', () => {
    expect(order.map((id) => race.mechs[id].points)).toEqual(POINTS);
    for (const m of race.mechs) expect(m.points).toBe(pointsFor(m));
  });

  it('team totals add up to the whole table', () => {
    const t0 = order.filter((id) => team(id) === 0).reduce((s, id) => s + race.mechs[id].points, 0);
    const t1 = order.filter((id) => team(id) === 1).reduce((s, id) => s + race.mechs[id].points, 0);
    expect(teamPoints(race, 0)).toBe(t0);
    expect(teamPoints(race, 1)).toBe(t1);
    // MF1 1st, DF1 3rd, FW1 4th  v  FW0 2nd, DF0 5th, MF0 6th
    expect(t1).toBe(15 + 5 + 3);
    expect(t0).toBe(7 + 2 + 1);
    expect(t0 + t1).toBe(33);
  });

  it('the race ends 90 ticks after the last one is home, with one raceEnd', () => {
    const fins = a.events('finish');
    const ends = a.events('raceEnd');
    expect(ends.length).toBe(1);
    expect(ends[0].tick).toBe(fins[5].tick + 90);
    expect(race.firstFinishTick).toBe(fins[0].tick);
    expect(race.endTick).toBe(ends[0].tick);
  });
});

describe('retirements', () => {
  it('one retirement: five score 15-7-5-3-2, the wreck is last with nothing', () => {
    const order = [FW0, FW1, MF0, MF1, DF0, DF1];
    const a = runIn(order);
    retire(a.race, a.mech(MF0), null); // running third when it goes
    toFlag(a);
    const finishers = order.filter((id) => id !== MF0);
    expect(finishers.map((id) => a.mech(id).place)).toEqual([1, 2, 3, 4, 5]);
    expect(finishers.map((id) => a.mech(id).points)).toEqual([15, 7, 5, 3, 2]);
    expect(a.mech(MF0).place).toBe(6);
    expect(a.mech(MF0).points).toBe(0);
    expect(a.mech(MF0).finished).toBe(false);
    expect(a.events('finish').length).toBe(5);
    expect(teamPoints(a.race, 0) + teamPoints(a.race, 1)).toBe(32);
    // FW0 1st, DF0 4th (MF0 out)  v  FW1 2nd, MF1 3rd, DF1 5th
    expect(teamPoints(a.race, 0)).toBe(15 + 3);
    expect(teamPoints(a.race, 1)).toBe(7 + 5 + 2);
  });

  it('several retirements: wrecks fill the last places, most recent first, all on zero', () => {
    const order = [FW0, FW1, MF0, MF1, DF0, DF1];
    const a = runIn(order);
    retire(a.race, a.mech(FW0), null); // the leader goes first
    a.step(3);
    retire(a.race, a.mech(DF1), null);
    a.step(3);
    retire(a.race, a.mech(MF1), null);
    toFlag(a);
    expect([FW1, MF0, DF0].map((id) => a.mech(id).place)).toEqual([1, 2, 3]);
    expect([FW1, MF0, DF0].map((id) => a.mech(id).points)).toEqual([15, 7, 5]);
    // Last to retire is best of the wrecks.
    expect([MF1, DF1, FW0].map((id) => a.mech(id).place)).toEqual([4, 5, 6]);
    expect([MF1, DF1, FW0].map((id) => a.mech(id).points)).toEqual([0, 0, 0]);
    expect(teamPoints(a.race, 0)).toBe(7 + 5);
    expect(teamPoints(a.race, 1)).toBe(15);
    // It did not matter that the leader had covered the most ground.
    expect(a.mech(FW0).s).toBeGreaterThan(0);
  });

  it('wrecks from the same tick are split by seat number', () => {
    const a = runIn([FW0, FW1, MF0, MF1, DF0, DF1]);
    retire(a.race, a.mech(DF0), null);
    retire(a.race, a.mech(MF1), null);
    toFlag(a);
    expect(a.mech(MF1).place).toBe(5);
    expect(a.mech(DF0).place).toBe(6);
  });

  it('a whole team knocked out scores nothing', () => {
    const a = runIn([FW0, FW1, MF0, MF1, DF0, DF1]);
    for (const id of [FW1, MF1, DF1]) retire(a.race, a.mech(id), null);
    toFlag(a);
    expect(teamPoints(a.race, 1)).toBe(0);
    expect(teamPoints(a.race, 0)).toBe(15 + 7 + 5);
    expect([FW0, MF0, DF0].map((id) => a.mech(id).place)).toEqual([1, 2, 3]);
  });

  it('everyone knocked out: no points at all', () => {
    const a = runIn([FW0, FW1, MF0, MF1, DF0, DF1]);
    for (const m of a.race.mechs) retire(a.race, m, null);
    toFlag(a);
    expect(a.race.mechs.map((m) => m.points)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(a.race.mechs.map((m) => m.place).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(a.race.firstFinishTick).toBe(-1);
  });

  it('a knock-out in combat scores the same as any other retirement', () => {
    const order = [FW1, FW0, MF0, MF1, DF0, DF1];
    const a = runIn(order);
    // FW0 is right behind FW1: one blow with 1 hp left.
    a.mech(FW1).hp = 1;
    a.mech(FW0).s = a.mech(FW1).s - 9;
    a.mech(FW0).d = a.mech(FW1).d;
    a.inputs[FW0].buttons = 2; // BTN.X
    a.step(1);
    a.inputs[FW0].buttons = 0;
    toFlag(a);
    expect(a.events('ko')).toMatchObject([{ mech: FW1, by: FW0 }]);
    expect(a.mech(FW1).place).toBe(6);
    expect(a.mech(FW1).points).toBe(0);
    // For the victim and for the placings, that is: the five runners take
    // 15-7-5-3-2 as after any retirement...
    const placing = (m: MechState) => m.points - koBonus(a.race, m);
    expect(a.race.mechs.filter((m) => !m.retired).map(placing).sort((x, y) => y - x)).toEqual([15, 7, 5, 3, 2]);
    // ...and the pilot who scored it has the knock-out bonus on top.
    expect(a.mech(FW0).kos).toBe(1);
    expect(a.mech(FW0).place).toBe(1);
    expect(a.mech(FW0).points).toBe(15 + a.race.rules.koPoints);
    expect(a.race.mechs.filter((m) => m.id !== FW0).every((m) => m.kos === 0 && koBonus(a.race, m) === 0)).toBe(true);
  });
});

describe('knock-out points', () => {
  const ORDER = [FW0, FW1, MF1, DF1, MF0, DF0];

  it('each credited knock-out is worth rules.koPoints (3) to the scorer, live and at the flag', () => {
    expect(DEFAULT_RULES.koPoints).toBe(3);
    const a = runIn(ORDER);
    const scorer = a.mech(MF1);
    expect(koBonus(a.race, scorer)).toBe(0);
    a.step(1); // so the running order is the one on the road
    expect(ORDER.map((id) => a.mech(id).place)).toEqual([1, 2, 3, 4, 5, 6]);
    const before = [teamPoints(a.race, 0), teamPoints(a.race, 1)];
    expect(before).toEqual([15 + 2 + 1, 7 + 5 + 3]);
    retire(a.race, a.mech(DF0), scorer); // DF0 was last on the road: nobody's place changes
    expect(a.race.events.filter((e) => e.type === 'ko')).toEqual([{ type: 'ko', mech: DF0, by: MF1 }]);
    a.step(1);
    expect(scorer.kos).toBe(1);
    expect(koBonus(a.race, scorer)).toBe(3);
    // The live team total moves at once: the victim's team loses its placing
    // point, the scorer's team gains the bonus.
    expect(teamPoints(a.race, 0)).toBe(before[0] - POINTS[5]);
    expect(teamPoints(a.race, 1)).toBe(before[1] + 3);
    expect(a.race.mechs.map((m) => m.points)).toEqual([0, 0, 0, 0, 0, 0]); // nothing is banked yet
    toFlag(a);
    expect(scorer.place).toBe(3);
    expect(scorer.points).toBe(POINTS[2] + 3);
    expect(a.mech(DF0).points).toBe(0);
    for (const m of a.race.mechs) expect(m.points).toBe(pointsFor(m) + koBonus(a.race, m));
    expect(teamPoints(a.race, 0)).toBe(15 + 2);
    expect(teamPoints(a.race, 1)).toBe(7 + 5 + 3 + 3);
    for (const team of [0, 1]) {
      expect(teamPoints(a.race, team)).toBe(a.race.mechs.filter((m) => m.team === team).reduce((s, m) => s + m.points, 0));
    }
  });

  it('several knock-outs by one pilot add up', () => {
    const a = runIn(ORDER);
    retire(a.race, a.mech(DF0), a.mech(DF1));
    retire(a.race, a.mech(MF0), a.mech(DF1));
    toFlag(a);
    expect(a.mech(DF1).kos).toBe(2);
    expect(a.mech(DF1).points).toBe(POINTS[3] + 6);
    expect(koBonus(a.race, a.mech(DF1))).toBe(6);
  });

  it('the bonus survives the scorer being knocked out later', () => {
    const a = runIn(ORDER);
    const scorer = a.mech(MF1);
    retire(a.race, a.mech(DF0), scorer);
    a.step(2);
    retire(a.race, scorer, a.mech(FW0)); // and then it is taken out itself
    toFlag(a);
    expect(scorer.retired).toBe(true);
    expect(pointsFor(scorer)).toBe(0);
    expect(scorer.kos).toBe(1);
    expect(scorer.points).toBe(3); // no placing points, but the knock-out still counts
    expect(a.mech(FW0).points).toBe(15 + 3);
    expect(teamPoints(a.race, 1)).toBe(7 + 5 + 3); // FW1 2nd, DF1 3rd, MF1's bonus
    expect(teamPoints(a.race, 0)).toBe(15 + 3 + 3); // FW0 1st and its bonus, MF0 4th
  });

  it('a whole team knocked out still keeps the knock-outs it scored', () => {
    const a = runIn(ORDER);
    retire(a.race, a.mech(DF0), a.mech(FW1));
    for (const id of [FW1, MF1, DF1]) retire(a.race, a.mech(id), null);
    toFlag(a);
    expect(teamPoints(a.race, 1)).toBe(3);
    expect(a.mech(FW1).points).toBe(3);
    expect(teamPoints(a.race, 0)).toBe(15 + 7);
  });

  it('an uncredited retirement gives nobody a bonus', () => {
    const a = runIn(ORDER);
    retire(a.race, a.mech(DF0), null);
    expect(a.race.events.filter((e) => e.type === 'ko')).toEqual([{ type: 'ko', mech: DF0, by: -1 }]);
    toFlag(a);
    expect(a.race.mechs.map((m) => m.kos)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(a.race.mechs.reduce((s, m) => s + m.points, 0)).toBe(15 + 7 + 5 + 3 + 2);
    for (const m of a.race.mechs) expect(m.points).toBe(pointsFor(m));
  });

  it('retiring the same mech twice credits one knock-out, to whoever got there first', () => {
    const a = runIn(ORDER);
    retire(a.race, a.mech(DF0), a.mech(MF1));
    retire(a.race, a.mech(DF0), a.mech(DF1));
    retire(a.race, a.mech(DF0), a.mech(MF1));
    expect(a.mech(MF1).kos).toBe(1);
    expect(a.mech(DF1).kos).toBe(0);
  });

  /** A staggered mech with 5 armour left, flung at the right-hand wall two units away. */
  function flungAtWall(lastHitBy: number, ticksSinceHit: number) {
    const a = new Arena(2);
    const vic = a.put(FW1, 300, 23);
    a.put(MF0, 300, 0);
    a.step(1);
    vic.hp = 5;
    vic.lastHitBy = lastHitBy;
    vic.lastHitTick = a.race.tick - ticksSinceHit;
    setStagger(vic, 40);
    vic.heading = 0.6; // about 70 u/s sideways
    a.step(6);
    expect(a.events('splat').length).toBe(1);
    expect(vic.retired).toBe(true);
    return a;
  }

  it('a wall splat with no attacker behind it is nobody\'s knock-out', () => {
    const a = flungAtWall(-1, 0);
    expect(a.events('ko')).toMatchObject([{ mech: FW1, by: -1 }]);
    expect(a.race.mechs.map((m) => m.kos)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(teamPoints(a.race, 0) - a.race.mechs.filter((m) => m.team === 0).reduce((s, m) => s + pointsFor(m), 0)).toBe(0);
  });

  it('a wall splat is credited to the last attacker for SPLAT_CREDIT_TICKS, and to nobody after that', () => {
    const fresh = flungAtWall(MF0, SPLAT_CREDIT_TICKS - 10);
    expect(fresh.events('ko')).toMatchObject([{ mech: FW1, by: MF0 }]);
    expect(fresh.mech(MF0).kos).toBe(1);
    expect(koBonus(fresh.race, fresh.mech(MF0))).toBe(fresh.race.rules.koPoints);

    const stale = flungAtWall(MF0, SPLAT_CREDIT_TICKS + 10);
    expect(stale.events('ko')).toMatchObject([{ mech: FW1, by: -1 }]);
    expect(stale.mech(MF0).kos).toBe(0);
  });

  it('rules.koPoints sets the price; 0 switches the bonus off', () => {
    for (const koPoints of [0, 1, 5, 10]) {
      const a = runIn(ORDER, { koPoints });
      retire(a.race, a.mech(DF0), a.mech(MF1));
      retire(a.race, a.mech(MF0), a.mech(MF1));
      expect(koBonus(a.race, a.mech(MF1))).toBe(2 * koPoints);
      toFlag(a);
      expect(a.mech(MF1).points).toBe(POINTS[2] + 2 * koPoints);
      expect(teamPoints(a.race, 1)).toBe(7 + 5 + 3 + 2 * koPoints);
      expect(teamPoints(a.race, 0)).toBe(15);
    }
  });

  it('the bonus follows the rule live: changing race.rules.koPoints changes the standings at once', () => {
    const a = runIn(ORDER);
    retire(a.race, a.mech(DF0), a.mech(MF1));
    a.step(1);
    const base = teamPoints(a.race, 1) - 3;
    a.race.rules.koPoints = 8;
    expect(teamPoints(a.race, 1)).toBe(base + 8);
    a.race.rules.koPoints = 0;
    expect(teamPoints(a.race, 1)).toBe(base);
  });

  it('a knock-out landed by a real blow, and one by a bullet, both pay', () => {
    const a = new Arena(2, 1, { driveStart: 35 });
    const fw = a.put(FW0, 300, -10);
    const foe = a.put(FW1, 309, -10);
    const gun = a.put(MF0, 300, 10);
    const target = a.put(MF1, 330, 10);
    foe.hp = 1;
    target.hp = 1;
    a.tap(FW0, BTN.X);
    a.tap(MF0, BTN.X);
    a.step(30);
    expect(a.events('ko').map((e) => [e.mech, e.by]).sort()).toEqual([
      [FW1, FW0],
      [MF1, MF0],
    ]);
    expect(koBonus(a.race, fw)).toBe(3);
    expect(koBonus(a.race, gun)).toBe(3);
    expect(teamPoints(a.race, 0)).toBe(a.race.mechs.filter((m) => m.team === 0).reduce((s, m) => s + pointsFor(m), 0) + 6);
  });

  it('applyHit on the last of the armour is the knock-out: the attacker in the call gets it', () => {
    const a = new Arena(2);
    const att = a.put(DF0, 300, 0);
    const vic = a.put(FW1, 308, 0);
    vic.hp = 10;
    expect(applyHit(a.race, TRACK, att, vic, ATTACKS[ATK.DF_HAMMER1], ATK.DF_HAMMER1)).toBe(true);
    expect(vic.retired).toBe(true);
    expect(att.kos).toBe(1);
    expect(koBonus(a.race, att)).toBe(a.race.rules.koPoints);
  });
});

describe('the round the designer cares about', () => {
  // Team 0's forward wins the race, but both its team-mates are knocked out
  // by team 1, which brings all three home behind the winner.
  function headline(rules?: Partial<Rules>): Arena {
    const a = runIn([FW0, FW1, MF1, DF1, MF0, DF0], rules);
    retire(a.race, a.mech(MF0), a.mech(MF1));
    retire(a.race, a.mech(DF0), a.mech(DF1));
    toFlag(a);
    expect([FW0, FW1, MF1, DF1].map((id) => a.mech(id).place)).toEqual([1, 2, 3, 4]);
    expect(a.mech(MF0).retired && a.mech(DF0).retired).toBe(true);
    return a;
  }

  it('winning the race is not enough: 15 loses to 2nd + 3rd + 4th with two knock-outs', () => {
    const a = headline();
    expect(teamPoints(a.race, 0)).toBe(15);
    expect(teamPoints(a.race, 1)).toBe(7 + 5 + 3 + 2 * 3);
    expect(teamPoints(a.race, 1)).toBeGreaterThan(teamPoints(a.race, 0));
    expect(a.race.mechs.map((m) => m.points)).toEqual([15, 7, 0, 5 + 3, 0, 3 + 3]);
    const round = scoreRound(a.race);
    expect(round).toEqual({ round: 1, points: [15, 21], place: [15, 15], ko: [0, 6], support: [0, 0], first: 0, tied: false, winner: 1 });
  });

  it('one knock-out is already enough to turn it', () => {
    const a = runIn([FW0, FW1, MF1, DF1, MF0, DF0]);
    retire(a.race, a.mech(MF0), a.mech(MF1));
    retire(a.race, a.mech(DF0), null); // the other wreck was nobody's doing
    toFlag(a);
    expect(scoreRound(a.race)).toMatchObject({ points: [15, 18], place: [15, 15], ko: [0, 3], support: [0, 0], first: 0, tied: false, winner: 1 });
  });

  it('without the knock-out bonus the same race is level, and goes to the winner\'s team', () => {
    const a = headline({ koPoints: 0 });
    expect(teamPoints(a.race, 0)).toBe(15);
    expect(teamPoints(a.race, 1)).toBe(15);
    expect(scoreRound(a.race)).toMatchObject({ points: [15, 15], ko: [0, 0], support: [0, 0], first: 0, tied: true, winner: 0 });
  });

  it('if the wrecks were nobody\'s knock-outs it is level too', () => {
    const a = runIn([FW0, FW1, MF1, DF1, MF0, DF0]);
    retire(a.race, a.mech(MF0), null);
    retire(a.race, a.mech(DF0), null);
    toFlag(a);
    expect(scoreRound(a.race)).toMatchObject({ points: [15, 15], tied: true, winner: 0 });
  });
});

describe('the flag after the grace period', () => {
  it('runners still out are classified by distance and do score; wrecks do not', () => {
    const a = new Arena(3);
    a.put(FW1, L - 20, 0); // the only one who makes it home
    // Parked at different points of the final lap (throttle closed).
    a.put(MF0, 5000, 0, 0);
    a.put(DF1, 3000, 0, 0);
    a.put(FW0, 4000, 0, 0);
    a.put(MF1, 6000, 0, 0);
    a.put(DF0, 7000, 0, 0);
    retire(a.race, a.mech(DF0), null); // furthest round, but out
    toFlag(a);
    expect(a.race.tick).toBe(a.race.firstFinishTick + FINISH_GRACE_TICKS);
    expect([FW1, MF1, MF0, FW0, DF1, DF0].map((id) => a.mech(id).place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect([FW1, MF1, MF0, FW0, DF1, DF0].map((id) => a.mech(id).points)).toEqual([15, 7, 5, 3, 2, 0]);
    for (const id of [MF1, MF0, FW0, DF1]) {
      expect(a.mech(id).finished).toBe(true);
      expect(a.mech(id).retired).toBe(false);
    }
    expect(a.events('finish').length).toBe(1); // only the real finisher is announced
    expect(a.events('raceEnd').length).toBe(1);
  });

  it('a real finisher always beats a flagged runner', () => {
    const a = new Arena(3);
    a.put(DF0, L - 20, 0);
    a.put(FW1, L - 0.5, 12, 0); // parked half a unit short of the line, out of the way
    toFlag(a);
    expect(a.mech(DF0).place).toBe(1);
    expect(a.mech(FW1).place).toBe(2);
    expect(a.mech(FW1).finishTime).toBeGreaterThan(a.mech(DF0).finishTime);
  });
});

describe('ties and running order', () => {
  it('two mechs crossing on the same tick are split by the time inside the tick', () => {
    const a = new Arena(3);
    // Seat 0 is 0.5 short of the line, seat 1 only 0.1 short: same tick,
    // but seat 1 gets there first.
    a.put(FW0, L - 0.5, -10);
    a.put(FW1, L - 0.1, 10);
    a.put(MF0, L - 300, -20);
    a.put(MF1, L - 320, -5);
    a.put(DF0, L - 340, 5);
    a.put(DF1, L - 360, 20);
    a.step(1);
    expect(a.mech(FW0).finished && a.mech(FW1).finished).toBe(true);
    expect(a.mech(FW1).finishTime).toBeLessThan(a.mech(FW0).finishTime);
    expect(a.mech(FW0).finishTime - a.mech(FW1).finishTime).toBeLessThan(DT);
    expect(a.mech(FW1).place).toBe(1);
    expect(a.mech(FW0).place).toBe(2);
    // The finish events must agree with the classification.
    const fins = a.events('finish');
    expect(fins.length).toBe(2);
    for (const e of fins) expect(e.place).toBe(a.mech(e.mech).place);
    expect(fins.map((e) => e.place).sort()).toEqual([1, 2]);
    toFlag(a);
    expect(a.mech(FW1).points).toBe(15);
    expect(a.mech(FW0).points).toBe(7);
    expect(a.race.mechs.map((m) => m.place).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a dead heat to the last bit goes to the lower seat, the same way every time', () => {
    for (let rep = 0; rep < 3; rep++) {
      const a = new Arena(3);
      a.put(MF1, L - 0.7, 12);
      a.put(MF0, L - 0.7, -12);
      a.step(1);
      expect(a.mech(MF0).finishTime).toBe(a.mech(MF1).finishTime);
      expect(a.mech(MF0).place).toBe(1);
      expect(a.mech(MF1).place).toBe(2);
      expect(a.events('finish').map((e) => [e.mech, e.place])).toEqual([
        [MF0, 1],
        [MF1, 2],
      ]);
    }
  });

  it('finish events of a whole AI field name the final places', () => {
    // A complete race. With the tuning at the time of writing, seed 2209 has
    // two mechs cross the line on one tick with the higher seat in front
    // (the case the test above builds by hand); the check holds for any seed.
    const race = newRace(2209);
    const fins: Array<Extract<SimEvent, { type: 'finish' }>> = [];
    expect(runToEnd(race, [], (r) => r.events.forEach((e) => e.type === 'finish' && fins.push(e)))).toBe(true);
    expect(fins.length).toBe(race.mechs.filter((m) => !m.retired).length);
    for (const e of fins) expect(e.place).toBe(race.mechs[e.mech].place);
    expect(new Set(fins.map((e) => e.place)).size).toBe(fins.length);
  });

  it('running order: finishers, then runners by distance, then wrecks; seat number splits ties', () => {
    const race = newRace(1);
    runCountdown(race);
    const [a, b, c, d, e, f] = race.mechs;
    a.s = 500;
    b.s = 900;
    c.s = 900; // level with b
    d.s = 100;
    e.s = 5000;
    f.s = 7000;
    retire(race, f, null); // furthest, but a wreck
    e.finished = true;
    e.finishTime = 99;
    updatePlaces(race);
    expect([e, b, c, a, d, f].map((m) => m.place)).toEqual([1, 2, 3, 4, 5, 6]);
    // Provisional points follow the running order.
    expect([e, b, c, a, d, f].map((m) => pointsFor(m))).toEqual([15, 7, 5, 3, 2, 0]);
    expect(teamPoints(race, 0) + teamPoints(race, 1)).toBe(32);
    // Knock-outs on the books show in the provisional team totals as well.
    d.kos = 2;
    expect(teamPoints(race, 0) + teamPoints(race, 1)).toBe(32 + 2 * race.rules.koPoints);
    expect(teamPoints(race, d.team)).toBe(race.mechs.filter((m) => m.team === d.team).reduce((s, m) => s + pointsFor(m), 0) + 2 * race.rules.koPoints);
  });

  it('points are banked only when the race is over', () => {
    const a = runIn([FW0, FW1, MF0, MF1, DF0, DF1]);
    a.until(() => a.mech(MF0).finished, 400);
    expect(a.race.phase).toBe(PHASE.RACING);
    expect(a.race.mechs.map((m) => m.points)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(pointsFor(a.mech(FW0))).toBe(15); // though the live standings already show them
    toFlag(a);
    expect(a.mech(FW0).points).toBe(15);
  });

  it('places are a permutation of 1..6 on every tick, wrecks and finishers included', () => {
    const a = runIn([FW0, FW1, MF0, MF1, DF0, DF1]);
    retire(a.race, a.mech(MF1), null);
    a.put(DF1, 4000, 0, 0); // one never makes it
    let bad = 0;
    const check = () => {
      let mask = 0;
      for (const m of a.race.mechs) mask |= 1 << m.place;
      if (mask !== 0b1111110) bad++;
    };
    a.until(() => {
      check();
      return a.race.phase === PHASE.FINISHED;
    }, FINISH_GRACE_TICKS + 500);
    for (let i = 0; i < 10; i++) {
      stepRace(a.race, TRACK, a.inputs);
      check();
    }
    expect(bad).toBe(0);
  });
});

// The match layer (src/sim/match.ts): a series of rounds, or a points race,
// between the same two teams. It only keeps score.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH,
  PHASE,
  POINTS,
  createMatch,
  koBonus,
  pointsFor,
  recordRound,
  roundsToWin,
  scoreRound,
  stepRace,
  teamPoints,
  updatePlaces,
} from '../src/sim/index';
import type { MatchConfig, MatchState, RaceState, Rules } from '../src/sim/index';
import { retire } from '../src/sim/combat';
import { DF0, DF1, FW0, FW1, MF0, MF1, TRACK, newRace, runToEnd, snapshot } from './helpers';

/**
 * A finished race with a given result, built by hand: `order` is the
 * finishing order (seat ids), `out` the mechs that were knocked out (last to
 * go first, as [victim, credited-to or -1]).
 */
function result(order: number[], out: Array<[number, number]> = [], rules?: Partial<Rules>): RaceState {
  const race = newRace(1, { rules });
  race.phase = PHASE.RACING;
  race.tick = 13000;
  order.forEach((id, k) => {
    const m = race.mechs[id];
    m.finished = true;
    m.finishTime = 200 + k;
    m.lap = race.laps;
  });
  // Earlier wrecks rank lower: retire in reverse so the first listed went last.
  [...out].reverse().forEach(([victim, by], k) => {
    race.tick = 9000 + k * 100;
    retire(race, race.mechs[victim], by >= 0 ? race.mechs[by] : null);
  });
  race.tick = 13000;
  expect(order.length + out.length).toBe(6);
  updatePlaces(race);
  for (const m of race.mechs) m.points = pointsFor(m) + koBonus(race, m);
  race.phase = PHASE.FINISHED;
  race.events.length = 0;
  return race;
}

/** Team 0 takes 1st, 3rd, 5th (22 points); team 1 takes 2nd, 4th, 6th (11). */
const win0 = () => result([FW0, FW1, MF0, MF1, DF0, DF1]);
/** The mirror image: team 1 wins 22 to 11. */
const win1 = () => result([FW1, FW0, MF1, MF0, DF1, DF0]);
/** Team 1 sweeps the first three places: 27 to 6. */
const sweep1 = () => result([FW1, MF1, DF1, FW0, MF0, DF0]);
/** Team 0 sweeps the first three places: 27 to 6. */
const sweep0 = () => result([FW0, MF0, DF0, FW1, MF1, DF1]);
/** Level on points (15 each), with team 0's forward home first. */
const level0 = () => result([FW0, FW1, MF1, DF1], [[MF0, -1], [DF0, -1]]);
/** Level on points (15 each), with team 1's forward home first. */
const level1 = () => result([FW1, FW0, MF0, DF0], [[MF1, -1], [DF1, -1]]);

function play(match: MatchState, ...rounds: Array<() => RaceState>): MatchState {
  for (const r of rounds) recordRound(match, r());
  return match;
}

describe('the result builder used below', () => {
  it('produces the places and points it is asked for', () => {
    const race = win0();
    expect([FW0, FW1, MF0, MF1, DF0, DF1].map((id) => race.mechs[id].place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(teamPoints(race, 0)).toBe(15 + 5 + 2);
    expect(teamPoints(race, 1)).toBe(7 + 3 + 1);
    const wrecks = result([FW0, FW1, MF1, DF1], [[MF0, MF1], [DF0, -1]]);
    expect([FW0, FW1, MF1, DF1, MF0, DF0].map((id) => wrecks.mechs[id].place)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(wrecks.mechs[MF1].kos).toBe(1);
    expect(wrecks.mechs.map((m) => m.points)).toEqual([15, 7, 0, 5 + 3, 0, 3]);
  });
});

describe('createMatch', () => {
  it('defaults to a best-of-three series', () => {
    expect(DEFAULT_MATCH).toEqual({ mode: 'series', bestOf: 3, target: 50 });
    expect(Object.isFrozen(DEFAULT_MATCH)).toBe(true);
    for (const cfg of [undefined, null, {}] as const) {
      const m = createMatch(cfg);
      expect(m).toEqual({ cfg: { mode: 'series', bestOf: 3, target: 50 }, rounds: [], wins: [0, 0], totals: [0, 0], winner: -1 });
      expect(m.cfg).not.toBe(DEFAULT_MATCH);
    }
  });

  it('takes what it is given when it makes sense', () => {
    expect(createMatch({ mode: 'points', target: 80 }).cfg).toEqual({ mode: 'points', bestOf: 3, target: 80 });
    expect(createMatch({ bestOf: 1 }).cfg.bestOf).toBe(1);
    expect(createMatch({ bestOf: 3 }).cfg.bestOf).toBe(3);
    expect(createMatch({ bestOf: 5 }).cfg.bestOf).toBe(5);
    expect(createMatch({ mode: 'series', bestOf: 5, target: 20 }).cfg).toEqual({ mode: 'series', bestOf: 5, target: 20 });
  });

  it('cleans up a series length that is not 1, 3 or 5', () => {
    for (const bestOf of [0, 2, 4, 6, 7, -1, 1.5, NaN, Infinity, '5', null, undefined, true, [5]] as unknown[]) {
      expect(createMatch({ bestOf } as Partial<MatchConfig>).cfg.bestOf).toBe(3);
    }
  });

  it('cleans up the mode: anything but "points" is a series', () => {
    for (const mode of ['series', 'POINTS', 'point', '', 'ffa', 0, 1, null, undefined, {}] as unknown[]) {
      expect(createMatch({ mode } as Partial<MatchConfig>).cfg.mode).toBe('series');
    }
    expect(createMatch({ mode: 'points' }).cfg.mode).toBe('points');
  });

  it('cleans up the target: a whole number of at least 1, or the default', () => {
    expect(createMatch({ target: 49.4 }).cfg.target).toBe(49);
    expect(createMatch({ target: 49.5 }).cfg.target).toBe(50);
    expect(createMatch({ target: 1 }).cfg.target).toBe(1);
    expect(createMatch({ target: 0 }).cfg.target).toBe(1);
    expect(createMatch({ target: 0.2 }).cfg.target).toBe(1);
    expect(createMatch({ target: -30 }).cfg.target).toBe(1);
    expect(createMatch({ target: 1e6 }).cfg.target).toBe(1e6);
    for (const target of [NaN, Infinity, -Infinity, '80', null, undefined, true, {}] as unknown[]) {
      expect(createMatch({ target } as Partial<MatchConfig>).cfg.target).toBe(50);
    }
  });

  it('starts every match clean and separate from every other', () => {
    const cfg = { mode: 'points' as const, bestOf: 5, target: 30 };
    const a = createMatch(cfg);
    const b = createMatch(cfg);
    recordRound(a, win0());
    expect(b.rounds).toEqual([]);
    expect(b.wins).toEqual([0, 0]);
    expect(b.totals).toEqual([0, 0]);
    expect(cfg).toEqual({ mode: 'points', bestOf: 5, target: 30 });
    expect(a.cfg).not.toBe(cfg);
    expect(createMatch().wins).not.toBe(createMatch().wins);
  });

  it('roundsToWin is the majority of the series', () => {
    expect(roundsToWin(createMatch({ bestOf: 1 }).cfg)).toBe(1);
    expect(roundsToWin(createMatch({ bestOf: 3 }).cfg)).toBe(2);
    expect(roundsToWin(createMatch({ bestOf: 5 }).cfg)).toBe(3);
  });
});

describe('scoreRound', () => {
  it('adds up placing points and knock-out points per team', () => {
    expect(scoreRound(win0())).toEqual({ round: 1, points: [22, 11], place: [22, 11], ko: [0, 0], support: [0, 0], rank: [1, 2], first: 0, tied: false, winner: 0 });
    expect(scoreRound(win1())).toEqual({ round: 1, points: [11, 22], place: [11, 22], ko: [0, 0], support: [0, 0], rank: [2, 1], first: 1, tied: false, winner: 1 });
    expect(scoreRound(sweep1())).toMatchObject({ points: [6, 27], first: 1, winner: 1 });
    const fight = result([FW0, FW1, MF1, DF1], [[MF0, MF1], [DF0, DF1]]);
    expect(scoreRound(fight)).toEqual({ round: 1, points: [15, 21], place: [15, 15], ko: [0, 6], support: [0, 0], rank: [1, 2], first: 0, tied: false, winner: 1 });
  });

  it('agrees with teamPoints and with the points the race banked', () => {
    for (const race of [win0(), sweep1(), level0(), result([FW1, DF0, MF1], [[FW0, DF1], [MF0, -1], [DF1, FW0]])]) {
      const r = scoreRound(race);
      for (const team of [0, 1]) {
        expect(r.points[team]).toBe(teamPoints(race, team));
        expect(r.points[team]).toBe(r.place[team] + r.ko[team]);
        expect(r.points[team]).toBe(race.mechs.filter((m) => m.team === team).reduce((s, m) => s + m.points, 0));
      }
    }
  });

  it('more points wins the round, whoever came home first', () => {
    // Team 0 has the winner, team 1 has the points.
    const r = scoreRound(result([FW0, FW1, MF1, DF1, MF0, DF0]));
    expect(r).toMatchObject({ points: [15 + 2 + 1, 7 + 5 + 3], first: 0, tied: false, winner: 0 });
    const r2 = scoreRound(result([FW0, FW1, MF1, DF1], [[MF0, MF1], [DF0, -1]]));
    expect(r2).toMatchObject({ points: [15, 18], first: 0, tied: false, winner: 1 });
  });

  it('level on points, the round goes to the team whose mech was classified first', () => {
    expect(scoreRound(level0())).toEqual({ round: 1, points: [15, 15], place: [15, 15], ko: [0, 0], support: [0, 0], rank: [1, 2], first: 0, tied: true, winner: 0 });
    expect(scoreRound(level1())).toEqual({ round: 1, points: [15, 15], place: [15, 15], ko: [0, 0], support: [0, 0], rank: [2, 1], first: 1, tied: true, winner: 1 });
    // Level through knock-out points: 15 + 3 against 7 + 5 + 3 + 3.
    const viaKo = result([FW0, FW1, MF1, DF1], [[MF0, MF1], [DF0, FW0]]);
    expect(scoreRound(viaKo)).toMatchObject({ points: [18, 18], ko: [3, 3], tied: true, first: 0, winner: 0 });
  });

  it('with nobody home at all, "first" is the last mech standing', () => {
    // Everyone knocked out: the wrecks are ranked most recent first.
    const race = result([], [[MF1, -1], [FW0, -1], [FW1, -1], [MF0, -1], [DF0, -1], [DF1, -1]]);
    expect(race.mechs[MF1].place).toBe(1);
    expect(scoreRound(race)).toEqual({ round: 1, points: [0, 0], place: [0, 0], ko: [0, 0], support: [0, 0], rank: [2, 1], first: 1, tied: true, winner: 1 });
    // The same, but team 0 scored a knock-out on the way: that settles it.
    const ko = result([], [[MF1, -1], [FW0, -1], [FW1, FW0], [MF0, -1], [DF0, -1], [DF1, -1]]);
    expect(scoreRound(ko)).toMatchObject({ points: [3, 0], tied: false, winner: 0, first: 1 });
  });

  it('follows rules.koPoints of the race it is scoring', () => {
    const order = [FW0, FW1, MF1, DF1];
    const out: Array<[number, number]> = [[MF0, MF1], [DF0, DF1]];
    expect(scoreRound(result(order, out, { koPoints: 0 }))).toMatchObject({ points: [15, 15], ko: [0, 0], tied: true, winner: 0 });
    expect(scoreRound(result(order, out, { koPoints: 1 }))).toMatchObject({ points: [15, 17], ko: [0, 2], winner: 1 });
    expect(scoreRound(result(order, out, { koPoints: 10 }))).toMatchObject({ points: [15, 35], ko: [0, 20], winner: 1 });
  });

  it('numbers the round as told (1 by default)', () => {
    expect(scoreRound(win0()).round).toBe(1);
    expect(scoreRound(win0(), 4).round).toBe(4);
  });

  it('does not change the race it scores', () => {
    for (const race of [win0(), level1(), result([FW0, FW1, MF1, DF1], [[MF0, MF1], [DF0, -1]])]) {
      const before = JSON.stringify(race);
      Object.freeze(race.rules);
      for (const m of race.mechs) Object.freeze(m);
      Object.freeze(race.mechs);
      Object.freeze(race);
      const a = scoreRound(race);
      const b = scoreRound(race);
      expect(b).toEqual(a);
      expect(JSON.stringify(race)).toBe(before);
    }
  });

  it('can score a race that is still running: the standings as they are now', () => {
    const race = newRace(31);
    for (let i = 0; i < 7000; i++) stepRace(race, TRACK, []);
    expect(race.phase).toBe(PHASE.RACING);
    const before = snapshot(race);
    const r = scoreRound(race);
    expect(snapshot(race)).toBe(before);
    expect(r.points).toEqual([teamPoints(race, 0), teamPoints(race, 1)]);
    expect(r.points[0] + r.points[1]).toBe(POINTS.reduce((s, p) => s + p, 0) - race.mechs.filter((m) => m.retired).reduce((s, m) => s + POINTS[m.place - 1], 0) + r.ko[0] + r.ko[1] + r.support[0] + r.support[1]);
    expect(r.first).toBe(race.mechs.find((m) => m.place === 1)!.team);
  });

  it('scores a real race the way the race banked it', () => {
    const race = newRace(2209, { laps: 2 });
    expect(runToEnd(race)).toBe(true);
    const r = scoreRound(race);
    for (const team of [0, 1]) expect(r.points[team]).toBe(race.mechs.filter((m) => m.team === team).reduce((s, m) => s + m.points, 0));
    expect(r.first).toBe(race.mechs.find((m) => m.place === 1)!.team);
    expect(r.winner).toBe(r.points[0] === r.points[1] ? r.first : r.points[0] > r.points[1] ? 0 : 1);
  });
});

describe('a series', () => {
  it('best of one is over after one round', () => {
    const m = play(createMatch({ bestOf: 1 }), win1);
    expect(m.winner).toBe(1);
    expect(m.wins).toEqual([0, 1]);
    expect(m.rounds.length).toBe(1);
  });

  it('best of three: 2-0 ends it early, 1-1 goes to a decider', () => {
    const early = createMatch({ bestOf: 3 });
    recordRound(early, win0());
    expect(early.winner).toBe(-1);
    expect(early.wins).toEqual([1, 0]);
    recordRound(early, win0());
    expect(early.winner).toBe(0);
    expect(early.wins).toEqual([2, 0]);
    expect(early.rounds.length).toBe(2);

    const full = createMatch({ bestOf: 3 });
    play(full, win0, win1);
    expect(full.winner).toBe(-1);
    expect(full.wins).toEqual([1, 1]);
    recordRound(full, win1());
    expect(full.winner).toBe(1);
    expect(full.wins).toEqual([1, 2]);
  });

  it('best of five: three wins take it, in three, four or five rounds', () => {
    const three = play(createMatch({ bestOf: 5 }), win1, win1);
    expect(three.winner).toBe(-1);
    recordRound(three, win1());
    expect(three.winner).toBe(1);
    expect(three.rounds.length).toBe(3);

    const four = play(createMatch({ bestOf: 5 }), win0, win1, win0);
    expect(four.winner).toBe(-1);
    recordRound(four, win0());
    expect(four.winner).toBe(0);
    expect(four.wins).toEqual([3, 1]);

    const five = play(createMatch({ bestOf: 5 }), win0, win1, win1, win0);
    expect(five.winner).toBe(-1);
    expect(five.wins).toEqual([2, 2]);
    recordRound(five, win1());
    expect(five.winner).toBe(1);
    expect(five.wins).toEqual([2, 3]);
    expect(five.rounds.map((r) => r.winner)).toEqual([0, 1, 1, 0, 1]);
  });

  it('is decided on rounds, not on points: a big win counts once', () => {
    // Team 1 sweeps one round 27-6; team 0 takes two close ones.
    const m = play(createMatch({ bestOf: 3 }), sweep1, win0, win0);
    expect(m.totals).toEqual([6 + 22 + 22, 27 + 11 + 11]);
    expect(m.winner).toBe(0);
    const narrow = play(createMatch({ bestOf: 3 }), sweep1, level0, level0);
    expect(narrow.totals).toEqual([36, 57]);
    expect(narrow.wins).toEqual([2, 1]);
    expect(narrow.winner).toBe(0);
  });

  it('a round level on points goes to the first finisher\'s team, and counts as a full win', () => {
    const m = createMatch({ bestOf: 3 });
    const r1 = recordRound(m, level1());
    expect(r1).toMatchObject({ tied: true, first: 1, winner: 1, points: [15, 15] });
    expect(m.wins).toEqual([0, 1]);
    const r2 = recordRound(m, level1());
    expect(r2.tied).toBe(true);
    expect(m.winner).toBe(1);
    expect(m.totals).toEqual([30, 30]);
  });

  it('keeps the totals as well, though they do not decide a series', () => {
    const m = play(createMatch({ bestOf: 5 }), win0, win1, sweep1);
    expect(m.totals).toEqual([22 + 11 + 6, 11 + 22 + 27]);
    expect(m.winner).toBe(-1);
  });

  it('the target means nothing in a series', () => {
    const m = play(createMatch({ mode: 'series', bestOf: 5, target: 1 }), win0);
    expect(m.winner).toBe(-1);
  });
});

describe('a points match', () => {
  it('runs until a team reaches the target at the end of a round', () => {
    const m = createMatch({ mode: 'points', target: 50 });
    recordRound(m, win0());
    expect(m.totals).toEqual([22, 11]);
    expect(m.winner).toBe(-1);
    recordRound(m, win0());
    expect(m.totals).toEqual([44, 22]);
    expect(m.winner).toBe(-1);
    recordRound(m, win1());
    expect(m.totals).toEqual([55, 44]);
    expect(m.winner).toBe(0); // the loser of that round, but first to 50
    expect(m.rounds.length).toBe(3);
  });

  it('reaching the target exactly is enough', () => {
    const m = play(createMatch({ mode: 'points', target: 44 }), win0);
    expect(m.winner).toBe(-1);
    recordRound(m, win0());
    expect(m.totals[0]).toBe(44);
    expect(m.winner).toBe(0);
    const short = play(createMatch({ mode: 'points', target: 45 }), win0, win0);
    expect(short.winner).toBe(-1);
  });

  it('rounds won are still counted, but they do not decide it', () => {
    // Team 0 wins two rounds narrowly on the first-finisher rule; team 1 gets there on points.
    const m = play(createMatch({ mode: 'points', target: 40, bestOf: 1 }), level0, level0);
    expect(m.wins).toEqual([2, 0]);
    expect(m.totals).toEqual([30, 30]);
    expect(m.winner).toBe(-1);
    recordRound(m, sweep1());
    expect(m.totals).toEqual([36, 57]);
    expect(m.winner).toBe(1);
    expect(m.wins).toEqual([2, 1]);
  });

  it('both teams past the target in the same round: the bigger total wins', () => {
    // 27-6 after one round, with 28 to play to. Team 1 wins the second round
    // 22-11, which takes both past the target: 38 plays 28.
    const m = play(createMatch({ mode: 'points', target: 28 }), sweep0);
    expect(m.totals).toEqual([27, 6]);
    expect(m.winner).toBe(-1);
    const last = recordRound(m, win1());
    expect(m.totals).toEqual([38, 28]);
    expect(last.winner).toBe(1); // team 1 took the round...
    expect(m.winner).toBe(0); // ...and team 0 the match, on the bigger total
    // And the other way about.
    const other = play(createMatch({ mode: 'points', target: 28 }), sweep1, win0);
    expect(other.totals).toEqual([28, 38]);
    expect(other.winner).toBe(1);
    // Both passing it by a distance changes nothing: still the bigger total.
    const far = play(createMatch({ mode: 'points', target: 10 }), win1);
    expect(far.totals).toEqual([11, 22]);
    expect(far.winner).toBe(1);
  });

  it('equal totals at the target go to the winner of that last round', () => {
    const m = play(createMatch({ mode: 'points', target: 33 }), win1);
    const last = recordRound(m, win0());
    expect(m.totals).toEqual([33, 33]);
    expect(last.winner).toBe(0);
    expect(m.winner).toBe(0);

    const other = play(createMatch({ mode: 'points', target: 33 }), win0);
    recordRound(other, win1());
    expect(other.totals).toEqual([33, 33]);
    expect(other.winner).toBe(1);
  });

  it('equal totals after a round that was itself level go to that round\'s first finisher', () => {
    const m = play(createMatch({ mode: 'points', target: 30 }), level0);
    expect(m.winner).toBe(-1);
    const last = recordRound(m, level1());
    expect(m.totals).toEqual([30, 30]);
    expect(last).toMatchObject({ tied: true, first: 1, winner: 1 });
    expect(m.winner).toBe(1);
  });

  it('knock-out points count toward the target', () => {
    const fight = () => result([FW0, FW1, MF1, DF1], [[MF0, MF1], [DF0, DF1]]); // 15 - 21
    const m = play(createMatch({ mode: 'points', target: 40 }), fight);
    expect(m.totals).toEqual([15, 21]);
    recordRound(m, fight());
    expect(m.totals).toEqual([30, 42]);
    expect(m.winner).toBe(1);
  });

  it('a target of 1 is decided by the first round that scores at all', () => {
    const m = play(createMatch({ mode: 'points', target: 1 }), win1);
    expect(m.winner).toBe(1);
    // A round in which nobody scores leaves it open.
    const dead = () => result([], [[MF1, -1], [FW0, -1], [FW1, -1], [MF0, -1], [DF0, -1], [DF1, -1]]);
    const open = play(createMatch({ mode: 'points', target: 1 }), dead);
    expect(open.totals).toEqual([0, 0]);
    expect(open.winner).toBe(-1);
  });
});

describe('recordRound', () => {
  it('returns the round it recorded, numbered from 1', () => {
    const m = createMatch({ bestOf: 5 });
    const r1 = recordRound(m, win0());
    const r2 = recordRound(m, win1());
    expect(r1.round).toBe(1);
    expect(r2.round).toBe(2);
    expect(m.rounds).toEqual([r1, r2]);
    expect(m.rounds[0]).toBe(r1);
    expect(r1).toEqual(scoreRound(win0(), 1));
  });

  it('does not change the race', () => {
    const race = result([FW0, FW1, MF1, DF1], [[MF0, MF1], [DF0, -1]]);
    const before = JSON.stringify(race);
    for (const m of race.mechs) Object.freeze(m);
    Object.freeze(race);
    recordRound(createMatch(), race);
    recordRound(createMatch({ mode: 'points' }), race);
    expect(JSON.stringify(race)).toBe(before);
  });

  it('the match is plain data: it survives a JSON round trip and carries on', () => {
    const m = play(createMatch({ bestOf: 5 }), win0, win1);
    const copy = JSON.parse(JSON.stringify(m)) as MatchState;
    expect(copy).toEqual(m);
    play(copy, win1, win1);
    play(m, win1, win1);
    expect(copy).toEqual(m);
    expect(copy.winner).toBe(1);
  });

  it('wins always add up to the rounds played, and totals to the points scored', () => {
    const m = createMatch({ mode: 'points', target: 1e6 });
    const rounds = [win0, win1, sweep1, level0, level1, win0, sweep1];
    play(m, ...rounds);
    expect(m.wins[0] + m.wins[1]).toBe(rounds.length);
    expect(m.totals[0]).toBe(m.rounds.reduce((s, r) => s + r.points[0], 0));
    expect(m.totals[1]).toBe(m.rounds.reduce((s, r) => s + r.points[1], 0));
    expect(m.winner).toBe(-1);
  });

  // Fixed in 0.2: recordRound used to keep scoring after the match was over,
  // and a later round could change who had won it. A decided match now stays
  // decided: a further race is scored and returned, but not recorded.
  it('a match that has been decided stays decided', () => {
    const series = play(createMatch({ bestOf: 3 }), win1, win1);
    expect(series.winner).toBe(1);
    play(series, win0, win0);
    expect(series.winner).toBe(1);

    const points = play(createMatch({ mode: 'points', target: 20 }), win1);
    expect(points.winner).toBe(1);
    play(points, sweep0);
    expect(points.winner).toBe(1);
  });
});

describe('a match played for real', () => {
  it('a best-of-three of one-lap rounds on alternating grids runs until somebody has two', () => {
    const match = createMatch({ bestOf: 3 });
    const gridSide: number[] = [];
    for (let round = 0; round < 3 && match.winner < 0; round++) {
      const race = newRace(500 + round, { laps: 1, gridFlip: round % 2 === 1 });
      gridSide.push(Math.sign(race.mechs[FW0].d));
      expect(runToEnd(race)).toBe(true);
      const r = recordRound(match, race);
      expect(r.round).toBe(round + 1);
      expect(r.points[0] + r.points[1]).toBe(33); // a formation lap only: everyone home, no knock-outs
      expect(r.ko).toEqual([0, 0]);
    }
    expect(match.winner).toBeGreaterThanOrEqual(0);
    expect(match.wins[match.winner]).toBe(2);
    expect(match.rounds.length).toBe(match.wins[0] + match.wins[1]);
    expect(match.totals[0] + match.totals[1]).toBe(33 * match.rounds.length);
    // The teams swapped sides of the grid from one round to the next.
    expect(gridSide[1]).toBe(-gridSide[0]);
  });

  it('a points match of full races ends on the round that takes a team to the target', () => {
    const match = createMatch({ mode: 'points', target: 30 });
    let round = 0;
    while (match.winner < 0 && round < 6) {
      const race = newRace(900 + round * 13, { gridFlip: round % 2 === 1 });
      expect(runToEnd(race)).toBe(true);
      const before = [...match.totals];
      const r = recordRound(match, race);
      expect(match.totals).toEqual([before[0] + r.points[0], before[1] + r.points[1]]);
      // Decided if, and only if, somebody is at the target now.
      expect(match.winner >= 0).toBe(Math.max(...match.totals) >= 30);
      round++;
    }
    expect(match.winner).toBeGreaterThanOrEqual(0);
    expect(match.totals[match.winner]).toBeGreaterThanOrEqual(30);
    expect(match.totals[match.winner]).toBeGreaterThanOrEqual(match.totals[1 - match.winner]);
    // Thirty points takes two rounds at least (a clean sweep is 27 before knock-outs), usually two.
    expect(match.rounds.length).toBeGreaterThanOrEqual(1);
    expect(match.rounds.length).toBeLessThanOrEqual(4);
  });
});

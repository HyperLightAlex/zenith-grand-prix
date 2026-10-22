// Sprint (docs/DESIGN.md, "Sprint"): six forwards, every pilot for
// themselves. Each pilot is its own team, so the race code's rival checks
// work unchanged; what is a team's (plays, escorts, support awards, knockout
// points) is off.
import { describe, expect, it } from 'vitest';
import {
  AWARD,
  PHASE,
  ROLE,
  SPRINT_POINTS,
  TACTIC,
  award,
  createMatch,
  emptyInput,
  isSprintFormat,
  koBonus,
  mayCall,
  pointsFor,
  recordRound,
  scoreRound,
  sprintGrid,
  standings,
  stepRace,
  updatePlaces,
} from '../src/sim/index';
import type { MatchState, RaceState } from '../src/sim/index';
import { retire } from '../src/sim/combat';
import { TRACK, findNonFinite, newRace, newSprint, runCountdown, runToEnd, stateHash } from './helpers';

/** A finished Sprint: `order` the finishing order (seat ids), `out` the pilots knocked out (the last to go first). */
function sprintResult(order: number[], out: number[] = []): RaceState {
  const race = newSprint(1);
  race.phase = PHASE.RACING;
  order.forEach((id, k) => {
    const m = race.mechs[id];
    m.finished = true;
    m.finishTime = 200 + k;
    m.lap = race.laps;
  });
  [...out].reverse().forEach((id, k) => {
    race.tick = 9000 + k * 100;
    retire(race, race.mechs[id], null);
  });
  race.tick = 13000;
  updatePlaces(race);
  race.phase = PHASE.FINISHED;
  race.events.length = 0;
  return race;
}

function play(match: MatchState, ...orders: number[][]): MatchState {
  for (const o of orders) recordRound(match, sprintResult(o));
  return match;
}

describe('a Sprint race', () => {
  it('puts every pilot on a team of their own, all forwards', () => {
    const race = newSprint(3);
    expect(race.sprint).toBe(true);
    expect(race.teams.length).toBe(6);
    expect(race.mechs.map((m) => m.team)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(race.mechs.every((m) => m.role === ROLE.FW)).toBe(true);
    expect(newRace(3).sprint).toBe(false);
    expect(newRace(3).teams.length).toBe(2);
  });

  it('lines the field up two by two, in the grid order given', () => {
    const race = newSprint(3);
    expect(new Set(race.mechs.map((m) => `${m.s},${m.d}`)).size).toBe(6);
    const [a, b, c] = race.mechs;
    expect(a.s).toBe(b.s);
    expect(a.d).toBe(-b.d);
    expect(c.s).toBeLessThan(a.s);
    const grid = [4, 2, 0, 5, 1, 3];
    const other = newSprint(3, { grid });
    grid.forEach((id, slot) => {
      expect(other.mechs[id].s).toBe(race.mechs[slot].s);
      expect(other.mechs[id].d).toBe(race.mechs[slot].d);
    });
  });

  it('carries a pilot colour, -1 for none', () => {
    expect(newSprint(3).mechs.every((m) => m.colour === -1)).toBe(true);
  });

  it('has no team plays to call', () => {
    const race = newSprint(3, { humans: [0] });
    expect(mayCall(race, race.mechs[0])).toBe(false);
    runCountdown(race);
    const call = { ...emptyInput(), cmd: TACTIC.BLITZ };
    let calls = 0;
    for (let t = 0; t < 30; t++) {
      stepRace(race, TRACK, [call]);
      calls += race.events.filter((e) => e.type === 'tactic').length;
    }
    expect(calls).toBe(0);
    expect(race.teams[0].tactic).toBe(TACTIC.FREE);
  });

  it('scores places 10 8 6 4 2 1, with no knockout or support points', () => {
    const race = sprintResult([3, 1, 4, 0], [2, 5]);
    expect(race.mechs.map((m) => m.place)).toEqual([4, 2, 5, 1, 3, 6]);
    expect(race.mechs.map((m) => pointsFor(m, true))).toEqual([4, 8, 0, 10, 6, 0]);
    race.mechs[1].kos = 2;
    expect(koBonus(race, race.mechs[1])).toBe(0);
    expect(award(race, race.mechs[1], AWARD.SNARE, 0, 2)).toBe(0);
    expect(race.mechs[1].support).toBe(0);
    expect(SPRINT_POINTS).toEqual([10, 8, 6, 4, 2, 1]);
    const r = scoreRound(race);
    expect(r.points).toEqual([4, 8, 0, 10, 6, 0]);
    expect(r.winner).toBe(3);
    expect(r.tied).toBe(false);
    expect(r.rank).toEqual([4, 2, 5, 1, 3, 6]);
  });
});

describe('Sprint formats', () => {
  it('are told from team formats', () => {
    expect(isSprintFormat({ mode: 'races' })).toBe(true);
    expect(isSprintFormat({ mode: 'wins' })).toBe(true);
    expect(isSprintFormat({ mode: 'series' })).toBe(false);
    expect(isSprintFormat({ mode: 'points' })).toBe(false);
  });

  it('clean up their settings', () => {
    expect(createMatch({ mode: 'races', races: 1 }, 6).cfg).toEqual({ mode: 'races', bestOf: 1, target: 0, races: 1 });
    expect(createMatch({ mode: 'races', races: 5 }, 6).cfg.races).toBe(5);
    expect(createMatch({ mode: 'races', races: 4 }, 6).cfg.races).toBe(3);
    expect(createMatch({ mode: 'wins', wins: 3 }, 6).cfg).toEqual({ mode: 'wins', bestOf: 1, target: 0, wins: 3, races: 7 });
    expect(createMatch({ mode: 'wins', wins: 9 }, 6).cfg).toEqual({ mode: 'wins', bestOf: 1, target: 0, wins: 2, races: 5 });
    expect(createMatch({ mode: 'races' }, 6).wins).toEqual([0, 0, 0, 0, 0, 0]);
    expect(createMatch({ mode: 'races' }, 6).totals).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('a single race goes to its winner', () => {
    expect(play(createMatch({ mode: 'races', races: 1 }, 6), [2, 0, 1, 3, 4, 5]).winner).toBe(2);
  });

  it('a set of races goes to the most points, not the most wins', () => {
    const m = createMatch({ mode: 'races', races: 3 }, 6);
    play(m, [0, 1, 2, 3, 4, 5], [2, 1, 0, 3, 4, 5]);
    expect(m.winner).toBe(-1);
    play(m, [3, 1, 0, 2, 4, 5]);
    // 1 never wins, but 8 + 8 + 8 beats 0's 10 + 6 + 6.
    expect(m.totals.slice(0, 4)).toEqual([22, 24, 20, 18]);
    expect(m.wins.slice(0, 4)).toEqual([1, 0, 1, 1]);
    expect(m.winner).toBe(1);
  });

  it('level on points, the more race wins takes it', () => {
    const m = play(createMatch({ mode: 'races', races: 3 }, 6), [0, 2, 1, 3, 4, 5], [2, 1, 0, 3, 4, 5], [3, 1, 0, 4, 5, 2]);
    expect(m.totals).toEqual([22, 22, 19, 18, 8, 4]);
    expect(m.wins).toEqual([1, 0, 1, 1, 0, 0]);
    expect(m.winner).toBe(0);
  });

  it('level on points and wins, the better finish in the last race takes it', () => {
    const m = play(createMatch({ mode: 'races', races: 3 }, 6), [0, 2, 1, 3, 4, 5], [1, 0, 3, 2, 4, 5], [4, 1, 0, 2, 3, 5]);
    expect(m.totals).toEqual([24, 24, 16, 12, 14, 3]);
    expect(m.wins).toEqual([1, 1, 0, 0, 1, 0]);
    expect(m.winner).toBe(1);
  });

  it('first to N wins ends as soon as somebody has them', () => {
    const m = createMatch({ mode: 'wins', wins: 2 }, 6);
    play(m, [0, 1, 2, 3, 4, 5], [1, 0, 2, 3, 4, 5]);
    expect(m.winner).toBe(-1);
    play(m, [0, 1, 2, 3, 4, 5]);
    expect(m.winner).toBe(0);
    expect(m.rounds.length).toBe(3);
    // Decided stays decided.
    play(m, [5, 4, 3, 2, 1, 0]);
    expect(m.rounds.length).toBe(3);
    expect(m.winner).toBe(0);
  });

  it('first to N wins stops at its cap: the most wins, then the most points', () => {
    const m = createMatch({ mode: 'wins', wins: 2 }, 6);
    // Five races, five winners; 5 is second every time but never wins.
    play(m, [0, 5, 1, 2, 3, 4], [1, 5, 0, 2, 3, 4], [2, 5, 0, 1, 3, 4], [3, 5, 0, 1, 2, 4]);
    expect(m.winner).toBe(-1);
    play(m, [4, 5, 0, 1, 2, 3]);
    expect(m.rounds.length).toBe(5);
    expect(m.wins).toEqual([1, 1, 1, 1, 1, 0]);
    expect(m.totals[5]).toBe(40);
    expect(m.totals[0]).toBe(34);
    expect(m.winner).toBe(0);
  });

  it('three wins runs to seven races at most', () => {
    const m = createMatch({ mode: 'wins', wins: 3 }, 6);
    play(m, [0, 1, 2, 3, 4, 5], [1, 0, 2, 3, 4, 5], [2, 0, 1, 3, 4, 5], [0, 1, 2, 3, 4, 5], [1, 0, 2, 3, 4, 5], [2, 0, 1, 3, 4, 5]);
    expect(m.wins.slice(0, 3)).toEqual([2, 2, 2]);
    expect(m.winner).toBe(-1);
    play(m, [3, 2, 1, 0, 4, 5]);
    // 2, 2, 2 wins: 0 has 10+8+8+10+8+8+4 = 56, 1 8+10+6+8+10+6+6 = 54, 2 6+6+10+6+6+10+8 = 52.
    expect(m.totals.slice(0, 3)).toEqual([56, 54, 52]);
    expect(m.winner).toBe(0);
  });
});

describe("a Sprint's grid", () => {
  it('is drawn by lot for the first race: every pilot once, and not always the same', () => {
    const grids = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const g = sprintGrid(null, 6, seed);
      expect([...g].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      expect(sprintGrid(createMatch({ mode: 'races' }, 6), 6, seed)).toEqual(g);
      grids.add(g.join());
    }
    expect(grids.size).toBeGreaterThan(10);
  });

  it('is the standings reversed after that: the leader starts at the back', () => {
    const m = play(createMatch({ mode: 'races', races: 3 }, 6), [3, 1, 0, 2, 4, 5]);
    expect(standings(m)).toEqual([3, 1, 0, 2, 4, 5]);
    expect(sprintGrid(m, 6, 1)).toEqual([5, 4, 2, 0, 1, 3]);
    // First to N wins ranks by wins first (5 has as many points, but none), then points, then the last race.
    const w = play(createMatch({ mode: 'wins', wins: 3 }, 6), [0, 5, 1, 2, 3, 4], [1, 5, 0, 2, 3, 4]);
    expect(w.totals.slice(0, 2)).toEqual([16, 16]);
    expect(w.totals[5]).toBe(16);
    expect(standings(w).slice(0, 3)).toEqual([1, 0, 5]);
    expect(sprintGrid(w, 6, 1).slice(-3)).toEqual([5, 0, 1]);
  });
});

describe('Sprint computer pilots', () => {
  it('race to the flag, go after the leader, and do not gang up on one pilot', () => {
    let pile = 0;
    let pileLeader = 0;
    let onLeader = 0;
    let battle = 0;
    let hits = 0;
    const winners = new Set<number>();
    for (let seed = 1; seed <= 4; seed++) {
      const race = newSprint(seed);
      const ok = runToEnd(race, [], (r) => {
        for (const e of r.events) if (e.type === 'hit') hits++;
        const bad = findNonFinite(r);
        if (bad) throw new Error(bad);
        if (r.lapPhase !== 2) return;
        battle++;
        const leader = r.mechs.find((m) => m.place === 1)!;
        const on = new Map<number, number>();
        for (const m of r.mechs) if (m.target >= 0) on.set(m.target, (on.get(m.target) ?? 0) + 1);
        for (const [id, n] of on) if (n >= 3) id === leader.id ? pileLeader++ : pile++;
        if (r.mechs.some((m) => m !== leader && (m.target === leader.id || m.ai.intentTarget === leader.id))) onLeader++;
      });
      expect(ok).toBe(true);
      expect(race.phase).toBe(PHASE.FINISHED);
      winners.add(race.mechs.find((m) => m.place === 1)!.id);
      expect(race.mechs.every((m) => m.support === 0)).toBe(true);
    }
    expect(hits).toBeGreaterThan(200);
    console.log(`3+ on the leader ${(100 * pileLeader / battle).toFixed(1)}%, on anyone else ${(100 * pile / battle).toFixed(1)}%, leader hunted ${(100 * onLeader / battle).toFixed(0)}%`);
    // Somebody is after whoever leads nearly all the battle lap; a third on them is rare, and on anyone else rarer.
    expect(onLeader / battle).toBeGreaterThan(0.8);
    expect(pileLeader / battle).toBeLessThan(0.12);
    expect(pile / battle).toBeLessThan(0.03);
    expect(winners.size).toBeGreaterThan(1);
  }, 240000);

  it('are deterministic', () => {
    const a = newSprint(9, { grid: [5, 4, 3, 2, 1, 0] });
    const b = newSprint(9, { grid: [5, 4, 3, 2, 1, 0] });
    for (let t = 0; t < 3000; t++) {
      stepRace(a, TRACK, []);
      stepRace(b, TRACK, []);
    }
    expect(stateHash(a)).toBe(stateHash(b));
  });
});

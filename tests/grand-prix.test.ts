import { describe, expect, it } from 'vitest';
import {
  CUPS,
  advance,
  betterMedal,
  finalPlace,
  isOver,
  medalFor,
  newCup,
  newSeason,
  pendingFixtures,
  playedRounds,
  recordYours,
  roundComplete,
  simulateFixture,
  standings,
  yourRoundNumber,
  type GpEvent,
  type GpFixtureResult,
} from '../src/gp/grandPrix';

const win = (pa: number, pb: number): GpFixtureResult => ({ wins: [pa > pb ? 1 : 0, pa > pb ? 0 : 1], points: [pa, pb], races: 1, winner: pa > pb ? 0 : 1 });

/** Fill every background fixture with a result that favours the lower faction index. */
function fillBackground(ev: GpEvent): void {
  for (const f of pendingFixtures(ev)) f.result = f.a < f.b ? win(30, 20) : win(20, 30);
}

describe('cups', () => {
  it('three races on the cup circuits, each against a different faction', () => {
    const ev = newCup('horizon', 2, 1, 7);
    expect(ev.rounds.map((r) => r.circuit)).toEqual(CUPS[0].circuits);
    const rivals = ev.rounds.map((r) => r.you!.b);
    expect(new Set(rivals).size).toBe(3);
    expect(rivals).not.toContain(2);
    // The other factions race too, never you, never twice in one round.
    for (const r of ev.rounds) {
      const busy = [r.you!.a, r.you!.b, ...r.others.flatMap((f) => [f.a, f.b])];
      expect(new Set(busy).size).toBe(busy.length);
    }
    // As even as five teams allow: you and the one you never meet race three times, the rest twice.
    const counts = [0, 0, 0, 0, 0];
    for (const r of ev.rounds) for (const f of [r.you!, ...r.others]) {
      counts[f.a]++;
      counts[f.b]++;
    }
    expect(counts.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.max(...counts)).toBe(3);
    expect(Math.min(...counts)).toBe(2);
  });

  it('is the same for the same seed', () => {
    expect(JSON.stringify(newCup('horizon', 0, 0, 99))).toBe(JSON.stringify(newCup('horizon', 0, 0, 99)));
  });

  it('ranks by average points and awards medals', () => {
    const ev = newCup('horizon', 0, 1, 3);
    fillBackground(ev);
    for (let r = 0; r < 3; r++) {
      expect(roundComplete(ev, r)).toBe(false);
      recordYours(ev, win(40, 10));
      expect(advance(ev)).toBe(true);
    }
    expect(isOver(ev)).toBe(true);
    const table = standings(ev);
    expect(table[0].faction).toBe(0);
    expect(finalPlace(ev)).toBe(1);
    expect(medalFor(1)).toBe('gold');
    expect(medalFor(4)).toBe(null);
    expect(betterMedal('bronze', 'silver')).toBe('silver');
    expect(betterMedal(null, 'bronze')).toBe('bronze');
  });
});

describe('seasons', () => {
  it('is a round robin: every faction meets every other once and sits one matchday out', () => {
    const ev = newSeason(1, 2, 12345);
    expect(ev.rounds).toHaveLength(5);
    expect(playedRounds(ev)).toBe(4);
    // Your matchday off falls in the middle.
    expect(ev.rounds[2].you).toBeNull();
    expect(ev.rounds[0].you).not.toBeNull();
    expect(ev.rounds[4].you).not.toBeNull();
    const met = new Set<string>();
    const played = [0, 0, 0, 0, 0];
    for (const r of ev.rounds) {
      const fx = r.you ? [r.you, ...r.others] : r.others;
      expect(fx).toHaveLength(2);
      for (const f of fx) {
        met.add([f.a, f.b].sort().join('-'));
        played[f.a]++;
        played[f.b]++;
        expect(f.circuit).toBe(r.circuit);
      }
    }
    expect(met.size).toBe(10);
    expect(played).toEqual([4, 4, 4, 4, 4]);
    expect(yourRoundNumber(ev, 3)).toBe(3);
  });

  it('passes over the matchday off once its results are in', () => {
    const ev = newSeason(0, 1, 5);
    recordYours(ev, { wins: [2, 0], points: [60, 30], races: 2, winner: 0 });
    expect(advance(ev)).toBe(false); // the others are still racing
    fillBackground(ev);
    expect(advance(ev)).toBe(true);
    recordYours(ev, { wins: [2, 1], points: [70, 66], races: 3, winner: 0 });
    expect(advance(ev)).toBe(true);
    expect(ev.current).toBe(2);
    expect(ev.rounds[2].you).toBeNull();
    expect(advance(ev)).toBe(true);
    const table = standings(ev);
    const me = table.find((r) => r.faction === 0)!;
    expect(me.won).toBe(2);
    expect(me.roundsFor - me.roundsAgainst).toBe(3);
  });
});

describe('background races', () => {
  it('play a fixture to the end, the same way every time', () => {
    const ev = newCup('horizon', 0, 1, 1);
    const fx = { ...ev.rounds[0].others[0], circuit: 'helios' };
    const a = simulateFixture(fx, { mode: 'series', bestOf: 1, target: 50 }, 0.55);
    const b = simulateFixture(fx, { mode: 'series', bestOf: 1, target: 50 }, 0.55);
    expect(a).toEqual(b);
    expect(a.races).toBe(1);
    expect(a.wins[a.winner]).toBe(1);
    expect(a.points[0] + a.points[1]).toBeGreaterThan(0);
  });
});

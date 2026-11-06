import { describe, expect, it } from 'vitest';
import { TRACKS } from '../src/sim/index';
import {
  CUPS,
  FINALE,
  advance,
  betterMedal,
  cupOpen,
  eventMedal,
  finalPlace,
  isOver,
  medalFor,
  newCup,
  newSeason,
  newTour,
  pendingFixtures,
  perfectRun,
  playedRounds,
  recordYours,
  roundComplete,
  simulateFixture,
  standings,
  tourOpen,
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

  it('three cups of three: every circuit once, in the order of the list, the finale last', () => {
    expect(CUPS.map((c) => c.id)).toEqual(['horizon', 'frontier', 'ascent']);
    expect(CUPS.flatMap((c) => c.circuits)).toEqual(TRACKS.map((t) => t.id));
    expect(CUPS[2].circuits[2]).toBe(FINALE);
    for (const c of CUPS) expect(newCup(c.id, 1, 1, 5).rounds.map((r) => r.circuit)).toEqual(c.circuits);
  });

  it('opens each cup with a medal in the one before, and the Grand Tour with one in each', () => {
    expect(cupOpen('horizon', {})).toBe(true);
    expect(cupOpen('frontier', {})).toBe(false);
    expect(cupOpen('frontier', { horizon: { 0: 'bronze' } })).toBe(true);
    expect(cupOpen('ascent', { horizon: { 2: 'gold' } })).toBe(false);
    expect(cupOpen('ascent', { horizon: { 2: 'gold' }, frontier: { 1: 'silver' } })).toBe(true);
    expect(tourOpen({ horizon: { 0: 'gold' }, frontier: { 0: 'gold' } })).toBe(false);
    expect(tourOpen({ horizon: { 0: 'gold' }, frontier: { 0: 'gold' }, ascent: { 2: 'bronze' } })).toBe(true);
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

  it('platinum for a perfect run: first, with every round won; gold for first with a round lost', () => {
    const perfect = newCup('horizon', 0, 1, 3);
    fillBackground(perfect);
    for (let r = 0; r < 3; r++) {
      recordYours(perfect, win(40, 10));
      advance(perfect);
    }
    expect(perfectRun(perfect)).toBe(true);
    expect(eventMedal(perfect)).toBe('platinum');
    // A place never earns platinum by itself, and it outranks gold.
    expect(medalFor(1)).toBe('gold');
    expect(betterMedal('gold', 'platinum')).toBe('platinum');
    expect(betterMedal('platinum', 'gold')).toBe('platinum');

    const dropped = newCup('horizon', 0, 1, 3);
    fillBackground(dropped);
    for (const [a, b] of [
      [40, 10],
      [24, 26],
      [44, 6],
    ]) {
      recordYours(dropped, win(a, b));
      advance(dropped);
    }
    expect(perfectRun(dropped)).toBe(false);
    expect(finalPlace(dropped)).toBe(1);
    expect(eventMedal(dropped)).toBe('gold');
    // ...and a season gives no medal at all.
    expect(eventMedal(newSeason(0, 1, 3))).toBe(null);
  });
});

/** Each pairing met and each faction's matches over some rounds. */
function tally(rounds: GpEvent['rounds']) {
  const met = new Map<string, number>();
  const played = [0, 0, 0, 0, 0];
  for (const r of rounds) {
    for (const f of r.you ? [r.you, ...r.others] : r.others) {
      const k = [f.a, f.b].sort().join('-');
      met.set(k, (met.get(k) ?? 0) + 1);
      played[f.a]++;
      played[f.b]++;
      expect(f.circuit).toBe(r.circuit);
    }
  }
  return { met, played };
}

describe('seasons', () => {
  it('is a double round robin: every faction meets every other twice, once in each half, and sits two matchdays out', () => {
    const ev = newSeason(1, 2, 12345);
    expect(ev.rounds).toHaveLength(10);
    expect(ev.short).toBeUndefined();
    expect(playedRounds(ev)).toBe(8);
    // Your matchdays off fall in the middle of each half.
    expect(ev.rounds.map((r, i) => (r.you ? -1 : i)).filter((i) => i >= 0)).toEqual([2, 7]);
    for (const r of ev.rounds) expect((r.you ? [r.you, ...r.others] : r.others).length).toBe(2);
    for (const half of [ev.rounds.slice(0, 5), ev.rounds.slice(5)]) {
      const { met, played } = tally(half);
      expect(met.size).toBe(10);
      expect([...met.values()].every((n) => n === 1)).toBe(true);
      expect(played).toEqual([4, 4, 4, 4, 4]);
    }
    // Never the same rival two matchdays running (not even across the halves).
    const rivals = ev.rounds.map((r) => r.you?.b ?? -1);
    for (let i = 1; i < rivals.length; i++) if (rivals[i] >= 0) expect(rivals[i]).not.toBe(rivals[i - 1]);
    // Each half visits four circuits, in the list's order, and ends at Zenith Ring: every circuit is visited.
    const ids = TRACKS.map((t) => t.id).filter((id) => id !== FINALE);
    expect(ev.rounds.map((r) => r.circuit)).toEqual([...ids.slice(0, 4), FINALE, ...ids.slice(4), FINALE]);
    expect(new Set(ev.rounds.map((r) => r.circuit)).size).toBe(TRACKS.length);
    expect(yourRoundNumber(ev, 3)).toBe(3);
  });

  it('short (online): one round robin, four circuits drawn for it in the order of the list, then Zenith Ring', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const ev = newSeason(0, 1, seed, { short: true });
      expect(ev.short).toBe(true);
      expect(ev.rounds).toHaveLength(5);
      expect(ev.rounds[2].you).toBeNull();
      const { met, played } = tally(ev.rounds);
      expect(met.size).toBe(10);
      expect(played).toEqual([4, 4, 4, 4, 4]);
      const cs = ev.rounds.map((r) => r.circuit);
      expect(cs[4]).toBe(FINALE);
      expect(new Set(cs).size).toBe(5);
      const order = TRACKS.map((t) => t.id);
      expect([...cs.slice(0, 4)].sort((x, y) => order.indexOf(x) - order.indexOf(y))).toEqual(cs.slice(0, 4));
      cs.forEach((c) => seen.add(c));
    }
    // Different seasons draw different circuits.
    expect(seen.size).toBeGreaterThan(6);
    expect(JSON.stringify(newSeason(3, 0, 42, { short: true }))).toBe(JSON.stringify(newSeason(3, 0, 42, { short: true })));
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

describe('the Grand Tour', () => {
  it('nine single races, every circuit in turn; each rival twice in the first eight, never twice running', () => {
    for (const seed of [1, 7, 99, 12345]) {
      const ev = newTour(2, 1, seed);
      expect(ev.kind).toBe('tour');
      expect(ev.rounds.map((r) => r.circuit)).toEqual(TRACKS.map((t) => t.id));
      expect(playedRounds(ev)).toBe(9);
      const first = ev.rounds.slice(0, 8);
      const rivals = first.map((r) => r.you!.b);
      for (const f of [0, 1, 3, 4]) expect(rivals.filter((x) => x === f)).toHaveLength(2);
      for (let i = 1; i < 8; i++) expect(rivals[i]).not.toBe(rivals[i - 1]);
      // Of the other three, two race and one sits out, each sitting out twice.
      const out = [0, 0, 0, 0, 0];
      for (const r of first) {
        expect(r.others).toHaveLength(1);
        const busy = [r.you!.a, r.you!.b, r.others[0].a, r.others[0].b];
        expect(new Set(busy).size).toBe(4);
        for (let f = 0; f < 5; f++) if (!busy.includes(f)) out[f]++;
      }
      expect(out).toEqual([2, 2, 0, 2, 2].map((n, f) => (f === 2 ? 0 : n)));
      // The decider is not raced in the background before it is settled.
      expect(ev.rounds[8].decider).toBe(true);
      expect(ev.rounds[8].others).toHaveLength(0);
    }
  });

  it('settles the decider once the round before it is in: you against the team just above you', () => {
    const ev = newTour(0, 1, 31);
    fillBackground(ev);
    for (let r = 0; r < 8; r++) {
      recordYours(ev, r % 2 ? win(20, 30) : win(26, 24));
      expect(advance(ev)).toBe(true);
    }
    const d = ev.rounds[8];
    expect(d.decider).toBe(false);
    const table = standings(ev, 7);
    const at = table.findIndex((row) => row.faction === 0);
    expect(d.you!.b).toBe(table[at > 0 ? at - 1 : at + 1].faction);
    expect(d.others).toHaveLength(1);
    expect(new Set([d.you!.a, d.you!.b, d.others[0].a, d.others[0].b]).size).toBe(4);
    // Its other race is now there to run.
    expect(pendingFixtures(ev)).toEqual([d.others[0]]);
    fillBackground(ev);
    recordYours(ev, win(40, 10));
    expect(advance(ev)).toBe(true);
    expect(isOver(ev)).toBe(true);
    expect(finalPlace(ev)).toBeGreaterThanOrEqual(1);
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

  it('come out the same on a circuit shared with other races (built once, never written to)', () => {
    const ev = newCup('horizon', 0, 1, 1);
    const cfg = { mode: 'series' as const, bestOf: 1, target: 50 };
    const fx = { ...ev.rounds[0].others[0], circuit: 'helios' };
    const first = simulateFixture(fx, cfg, 0.55);
    // Another race on the same circuit in between, then the first again.
    simulateFixture({ ...ev.rounds[0].others[1], circuit: 'helios', seed: fx.seed + 17 }, cfg, 0.55);
    expect(simulateFixture(fx, cfg, 0.55)).toEqual(first);
  });
});

// ---- the Sprint series ----------------------------------------------------------

import {
  SPRINT_EDGES,
  SPRINT_FIELD,
  TOUR_ID,
  eventName as gpEventName,
  kindOf,
  nearestRival,
  newSprintCup,
  newSprintTour,
  recordSprint,
  slotOf,
  sprintEventGrid,
  sprintFavourite,
  sprintPoints,
  sprintSkill,
  sprintStandings,
  GP_SKILL,
} from '../src/gp/grandPrix';

/** A race's places by seat (1 to 6, 0 knocked out), from a finishing order of seats (anyone left out knocked out). */
const placesOf = (order: number[]): number[] => Array.from({ length: SPRINT_FIELD }, (_, seat) => order.indexOf(seat) + 1);

describe('the Sprint series', () => {
  it('a Sprint Cup: the cup circuits, one race of the six each, no faction for you, the five rivals spread about the difficulty', () => {
    const ev = newSprintCup('frontier', 2, 11);
    expect(ev.kind).toBe('cup');
    expect(ev.faction).toBe(-1);
    expect(ev.rounds.map((r) => r.circuit)).toEqual(CUPS[1].circuits);
    expect(ev.rounds.every((r) => r.sprint && !r.you && r.others.length === 0 && !r.sprint.finale)).toBe(true);
    expect([...ev.sprint!.edge].sort()).toEqual([...SPRINT_EDGES].sort());
    expect(gpEventName(ev)).toBe('Frontier Sprint Cup');
    expect(slotOf(ev)).toBe('sprint-cup');
    expect(kindOf('sprint-cup')).toBe('cup');
    expect(playedRounds(ev)).toBe(3);
    expect(pendingFixtures(ev)).toEqual([]);
    // Your skill is yours; theirs the difficulty's, each with its edge; the favourite the strongest.
    expect(sprintSkill(ev, 0, 0.6)).toBe(0.6);
    const fav = sprintFavourite(ev);
    expect(sprintSkill(ev, fav, 0.6)).toBeCloseTo(GP_SKILL[2] + 0.06, 6);
    for (let seat = 1; seat < SPRINT_FIELD; seat++) expect(sprintSkill(ev, seat, 0.6)).toBeLessThanOrEqual(sprintSkill(ev, fav, 0.6));
  });

  it('a Sprint Tour: every circuit in turn, the last at Zenith Ring the Showdown', () => {
    const ev = newSprintTour(1, 5);
    expect(ev.kind).toBe('tour');
    expect(ev.cup).toBe(TOUR_ID);
    expect(ev.rounds.map((r) => r.circuit)).toEqual(TRACKS.map((t) => t.id).filter((id) => id !== FINALE).concat(FINALE));
    expect(ev.rounds.map((r) => !!r.sprint!.finale)).toEqual([false, false, false, false, false, false, false, false, true]);
    expect(gpEventName(ev)).toBe('Sprint Tour');
    expect(slotOf(ev)).toBe('sprint-tour');
  });

  it('scores each race by Sprint points, the table by points, then wins, then the latest finish', () => {
    const ev = newSprintCup('horizon', 1, 3);
    // Race 1: you win, seat 2 second, seat 5 knocked out.
    recordSprint(ev, placesOf([0, 2, 1, 3, 4]));
    expect(ev.rounds[0].sprint!.result!.points).toEqual([10, 6, 8, 4, 2, 0]);
    expect(advance(ev)).toBe(true);
    // Race 2: seat 2 wins, you second.
    recordSprint(ev, placesOf([2, 0, 1, 3, 4, 5]));
    const table = sprintStandings(ev, 1);
    // You and seat 2 level on 18 and a win each: seat 2 finished the latest race ahead.
    expect(table.slice(0, 2).map((r) => [r.seat, r.points, r.wins])).toEqual([
      [2, 18, 1],
      [0, 18, 1],
    ]);
    expect(table.find((r) => r.seat === 5)!.points).toBe(1);
    // The grid for race 3: the table reversed, the leader at the back.
    expect(advance(ev)).toBe(true);
    expect(sprintEventGrid(ev)).toEqual(table.map((r) => r.seat).reverse());
    recordSprint(ev, placesOf([0, 1, 2, 3, 4, 5]));
    expect(advance(ev)).toBe(true);
    expect(isOver(ev)).toBe(true);
    expect(finalPlace(ev)).toBe(1);
    expect(medalFor(finalPlace(ev))).toBe('gold');
    // First, but beaten to a race by seat 2: gold, not platinum.
    expect(perfectRun(ev)).toBe(false);
    expect(eventMedal(ev)).toBe('gold');
    // Every race won: platinum.
    const perfect = newSprintCup('horizon', 1, 3);
    for (let r = 0; r < 3; r++) {
      recordSprint(perfect, placesOf([0, 1, 2, 3, 4, 5]));
      advance(perfect);
    }
    expect(eventMedal(perfect)).toBe('platinum');
  });

  it('the first grid is drawn by lot, the same each time it is asked for; a race recorded twice keeps its pilots once', () => {
    const ev = newSprintCup('ascent', 0, 9);
    const lot = sprintEventGrid(ev);
    expect([...lot].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sprintEventGrid(ev)).toEqual(lot);
    const line = (team: number, placing: number) => ({ id: team, name: `P${team}`, team, role: 0, human: team === 0, portrait: -1, look: '', colour: -1, faction: -1, races: 1, wins: placing === 10 ? 1 : 0, podiums: 1, placing, koPts: 0, support: 0, awards: [], kos: 0, out: 0, dmgDealt: 0, dmgTaken: 0, points: placing });
    recordSprint(ev, placesOf([0, 1, 2, 3, 4, 5]), [line(0, 10), line(1, 8)]);
    recordSprint(ev, placesOf([0, 1, 2, 3, 4, 5]), [line(0, 10), line(1, 8)]);
    expect(ev.pilots!.map((l) => [l.id, l.points, l.faction])).toEqual([
      [0, 10, -1],
      [1, 8, 0],
    ]);
  });

  it('the Showdown: double points, and your nearest rival marked once the rounds before it are in', () => {
    const ev = newSprintTour(1, 21);
    // Eight races: seat 3 wins each, you second.
    for (let i = 0; i < 8; i++) {
      recordSprint(ev, placesOf([3, 0, 1, 2, 4, 5]));
      expect(advance(ev)).toBe(true);
    }
    const last = ev.rounds[8].sprint!;
    expect(last.finale).toBe(true);
    // You are second: the rival is the leader just above you.
    expect(last.rival).toBe(3);
    expect(nearestRival(ev, 7)).toBe(3);
    // Double points: you win it, seat 3 is knocked out, and you take the Tour.
    const line = (team: number, placing: number) => ({ id: team, name: '', team, role: 0, human: team === 0, portrait: -1, look: '', colour: -1, faction: -1, races: 1, wins: 0, podiums: 0, placing, koPts: 0, support: 0, awards: [], kos: 0, out: 0, dmgDealt: 0, dmgTaken: 0, points: placing });
    const pointsBefore = sprintStandings(ev, 7).find((r) => r.seat === 0)!.points;
    recordSprint(ev, placesOf([0, 1, 2, 4, 5]), [line(0, 10)]);
    expect(last.result!.points[0]).toBe(sprintPoints(1, true));
    expect(sprintPoints(1, true)).toBe(20);
    expect(sprintStandings(ev, 8).find((r) => r.seat === 0)!.points).toBe(pointsBefore + 20);
    // (Its pilots' lines scored as the table does: doubled.)
    expect(ev.pilots!.find((l) => l.id === 0)!.points).toBe(20);
    expect(advance(ev)).toBe(true);
    expect(finalPlace(ev)).toBe(1);
  });

  it('leading into the Showdown, your rival is the one just below you', () => {
    const ev = newSprintTour(1, 4);
    for (let i = 0; i < 8; i++) {
      recordSprint(ev, placesOf([0, 4, 1, 2, 3, 5]));
      advance(ev);
    }
    expect(ev.rounds[8].sprint!.rival).toBe(4);
  });

  it('its own ladder: Sprint medals open the Sprint Cups and the Sprint Tour, and team medals open none of them', () => {
    const team = { horizon: { 0: 'gold' as const }, frontier: { 1: 'bronze' as const }, ascent: { 2: 'silver' as const } };
    const sprint: Record<string, Record<number, 'gold' | 'silver' | 'bronze'>> = {};
    expect(cupOpen('frontier', sprint)).toBe(false);
    expect(tourOpen(sprint)).toBe(false);
    expect(tourOpen(team)).toBe(true);
    sprint.horizon = { 1: 'bronze' };
    expect(cupOpen('frontier', sprint)).toBe(true);
    expect(cupOpen('ascent', sprint)).toBe(false);
    sprint.frontier = { 0: 'silver' };
    sprint.ascent = { 2: 'gold' };
    expect(tourOpen(sprint)).toBe(true);
  });
});

// The ceremony at a match's or an event's end (client/game/ceremony.ts,
// sim/ledger.ts): each pilot's points and where they came from, added up
// over the match (and the event); the mentions, whoever earned them; and
// who stands on the podium: a Sprint's first three, a team match's winners
// (their best on the top step), a Grand Prix's first three factions, a team
// to a step, with their medals and the trophy.

import { describe, expect, it } from 'vitest';
import { AWARD_COUNT, ROLE, addRace, createMatch, mentions, recordRound, seatKey, standings, type PilotLine } from '../src/sim/index';
import { CUPS, newCup, playedRounds, recordYours, advance, isOver, pendingFixtures, standings as eventStandings, type GpEvent } from '../src/gp/grandPrix';
import { eventCeremony, factionTeam, matchCeremony } from '../src/client/game/ceremony';
import { PILOT_NAMES } from '../src/net/factions';
import { newRace, newSprint, runToEnd } from './helpers';

function line(id: number, team: number, over: Partial<PilotLine> = {}): PilotLine {
  return { id, name: `P${id}`, team, role: id % 3, human: false, portrait: -1, look: '', colour: -1, faction: -1, races: 1, wins: 0, podiums: 0, placing: 0, koPts: 0, support: 0, awards: new Array(AWARD_COUNT).fill(0), kos: 0, out: 0, dmgDealt: 0, dmgTaken: 0, points: 0, ...over };
}

describe('the pilots\' ledger', () => {
  it('adds each race to each pilot: placing, knockouts and support make their points', () => {
    const lines: PilotLine[] = [];
    const a = newRace(3);
    runToEnd(a);
    const b = newRace(4);
    runToEnd(b);
    addRace(lines, a);
    addRace(lines, b);
    expect(lines).toHaveLength(6);
    for (const l of lines) {
      const ma = a.mechs[l.id];
      const mb = b.mechs[l.id];
      expect(l.races).toBe(2);
      expect(l.points).toBe(l.placing + l.koPts + l.support);
      expect(l.points).toBe(ma.points + mb.points);
      expect(l.kos).toBe(ma.kos + mb.kos);
      expect(l.support).toBe(ma.support + mb.support);
      expect(l.awards.reduce((x, y) => x + y, 0)).toBe(ma.awardPts.reduce((x, y) => x + y, 0) + mb.awardPts.reduce((x, y) => x + y, 0));
      expect(l.wins).toBe((ma.place === 1 && !ma.retired ? 1 : 0) + (mb.place === 1 && !mb.retired ? 1 : 0));
    }
  });

  it('is kept with the match, for the rounds it records and no more', () => {
    const m = createMatch({ mode: 'series', bestOf: 1 });
    const race = newRace(5);
    runToEnd(race);
    recordRound(m, race);
    expect(m.winner).toBeGreaterThanOrEqual(0);
    expect(m.pilots.map((l) => l.races)).toEqual([1, 1, 1, 1, 1, 1]);
    // A race after the match is decided is scored but not recorded.
    recordRound(m, race);
    expect(m.pilots.every((l) => l.races === 1)).toBe(true);
    // It travels as JSON (online, saved).
    expect(JSON.parse(JSON.stringify(m)).pilots).toEqual(m.pilots);
  });
});

describe('the mentions', () => {
  it('names the MVP, and whoever did most of each thing, wherever they placed', () => {
    const lines = [
      line(0, 0, { points: 30, placing: 30, dmgDealt: 100, dmgTaken: 300 }),
      line(1, 0, { points: 22, placing: 10, support: 12, dmgDealt: 900, dmgTaken: 50 }),
      line(2, 1, { points: 14, placing: 4, koPts: 10, kos: 4, dmgDealt: 500, dmgTaken: 80, out: 1 }),
      line(3, 1, { points: 2, placing: 2, dmgDealt: 50, dmgTaken: 120 }),
    ];
    const ms = mentions(lines);
    const who = (k: string) => ms.find((m) => m.kind === k)?.id;
    expect(who('mvp')).toBe(0);
    // The top racer is the MVP here: not named twice.
    expect(who('racer')).toBeUndefined();
    expect(who('kos')).toBe(2);
    expect(who('support')).toBe(1);
    expect(who('damage')).toBe(1);
    // Never knocked out, least damage taken: not 2 (knocked out once), so 1.
    expect(who('ironclad')).toBe(1);
  });

  it('hands out none for what nobody did', () => {
    const ms = mentions([line(0, 0, { points: 10, placing: 10 }), line(1, 1, { points: 4, placing: 4 })]);
    expect(ms.map((m) => m.kind)).toEqual(['mvp']);
  });
});

describe('who stands on the podium', () => {
  it('none while the match is still being played', () => {
    const m = createMatch({ mode: 'series', bestOf: 3 });
    const race = newRace(6);
    runToEnd(race);
    recordRound(m, race);
    expect(m.winner).toBe(-1);
    expect(matchCeremony(m, false)).toBeNull();
  });

  it('a team match: its winners only, their best first, a mech to a step', () => {
    const m = createMatch({ mode: 'series', bestOf: 1 });
    const race = newRace(7);
    runToEnd(race);
    recordRound(m, race);
    const c = matchCeremony(m, false)!;
    expect(c.layout).toBe('pilots');
    expect(c.trophy).toBe(false);
    expect(c.steps).toHaveLength(3);
    for (const s of c.steps) {
      expect(s.pilots).toHaveLength(1);
      expect(s.pilots[0].team).toBe(m.winner);
    }
    const pts = c.steps.map((s) => s.pilots[0].points);
    expect([...pts].sort((a, b) => b - a)).toEqual(pts);
    // Everyone is in the readout, and the mentions are there.
    expect(c.lines).toHaveLength(6);
    expect(c.mentions[0].kind).toBe('mvp');
  });

  it('a Sprint: its first three by the standings, a pilot each', () => {
    // A Sprint whose first three all scored (in plenty the field is knocked
    // out behind the winner: see below).
    let m = createMatch({ mode: 'races', races: 1 }, 6);
    for (let seed = 8; seed < 40; seed++) {
      m = createMatch({ mode: 'races', races: 1 }, 6);
      const race = newSprint(seed);
      runToEnd(race);
      recordRound(m, race);
      if (standings(m).slice(0, 3).every((side) => m.pilots.some((l) => l.team === side && l.points > 0))) break;
    }
    const c = matchCeremony(m, true)!;
    expect(c.kind).toBe('sprint');
    expect(c.steps.map((s) => s.side)).toEqual(standings(m).slice(0, 3));
    expect(c.steps.map((s) => s.pilots[0].team)).toEqual(standings(m).slice(0, 3));
    // Nobody behind the winner stands there on no points (knocked out of a single race, say).
    const third = m.pilots.find((l) => l.team === standings(m)[2])!;
    third.points = 0;
    expect(matchCeremony(m, true)!.steps.map((s) => s.side)).toEqual(standings(m).slice(0, 2));
  });
});

/** A cup played to its end: you win every race 30 to 10 (the background races run as the event does). */
function playCup(): GpEvent {
  const ev = newCup(CUPS[0].id, 2, 1, 1234);
  const race = newRace(9);
  runToEnd(race);
  for (let k = 0; k < playedRounds(ev); k++) {
    for (const f of pendingFixtures(ev)) if (f !== ev.rounds[ev.current].you) f.result = { wins: [1, 0], points: [20, 18], races: 1, winner: 0 };
    const m = createMatch({ mode: 'series', bestOf: 1 });
    recordRound(m, race);
    recordYours(ev, { wins: [1, 0], points: [30, 10], races: 1, winner: 0 }, m.pilots);
    advance(ev);
  }
  return ev;
}

describe("a Grand Prix's ceremony", () => {
  it('keeps the pilots of your races over the event, each under their faction\'s seat', () => {
    const ev = playCup();
    expect(isOver(ev)).toBe(true);
    const mine = ev.pilots!.filter((l) => l.faction === ev.faction);
    expect(mine).toHaveLength(3);
    for (const l of mine) {
      expect(l.id).toBe(seatKey(ev.faction, l.role));
      expect(l.races).toBe(3);
    }
    // Each rival met once, its three under its own seats.
    const rivals = new Set(ev.pilots!.filter((l) => l.faction !== ev.faction).map((l) => l.faction));
    expect(rivals.size).toBe(3);
  });

  it('puts the first three factions up, a team to a step, with their medals and the trophy', () => {
    const ev = playCup();
    const c = eventCeremony(ev)!;
    expect(c.layout).toBe('teams');
    expect(c.trophy).toBe(true);
    expect(c.steps.map((s) => s.side)).toEqual(eventStandings(ev).slice(0, 3).map((r) => r.faction));
    // (Every round of yours won, and first: the winners' step is platinum.)
    expect(c.steps.map((s) => s.medal)).toEqual(['platinum', 'silver', 'bronze']);
    for (const s of c.steps) {
      expect(s.pilots).toHaveLength(3);
      expect(new Set(s.pilots.map((p) => p.role)).size).toBe(3);
      for (const p of s.pilots) expect(p.faction).toBe(s.side);
    }
  });

  it('a cup won with a round lost: gold on the winners\' step', () => {
    const ev = playCup();
    ev.rounds[1].you!.result = { wins: [0, 1], points: [10, 30], races: 1, winner: 1 };
    const c = eventCeremony(ev)!;
    if (c.steps[0].side === ev.faction) expect(c.steps[0].medal).toBe('gold');
    expect(c.steps.map((s) => s.medal)).not.toContain('platinum');
  });

  it("fills a faction you never raced with its own pilots, forward first", () => {
    const ev = newCup(CUPS[0].id, 0, 1, 99);
    ev.pilots = [];
    const team = factionTeam(ev, 4);
    expect(team.map((p) => p.role)).toEqual([ROLE.FW, ROLE.MF, ROLE.DF]);
    expect(team.map((p) => p.name)).toEqual([...PILOT_NAMES[4]]);
    expect(eventCeremony(ev)).toBeNull();
  });
});

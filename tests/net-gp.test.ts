import { describe, expect, it } from 'vitest';
import { ROLE } from '../src/sim/index';
import { TestNet, type TestClient } from './netHarness';
import { READY_COUNTDOWN } from '../src/net/protocol';
import { isOver, roundComplete, standings, type GpFixtureResult } from '../src/gp/grandPrix';

const SQUAD = 'SQ7KX';

/** A squad of two in a Grand Prix room: the leader (who brings the event) and a member following. */
function squadRoom(kind: 'cup' | 'season', faction = 2): { net: TestNet; lead: TestClient; mate: TestClient } {
  const net = new TestNet({ laps: 1, faction, gp: { kind, difficulty: 0 } });
  const lead = net.join('lead', { loadout: { faction, role: ROLE.FW }, squad: { id: SQUAD, size: 2 } });
  const mate = net.join('mate', { loadout: { faction: 0, role: ROLE.MF }, squad: { id: SQUAD, size: 2, follow: true } });
  // Let the computer fly both: what is under test is the event around the races.
  lead.drive = () => null;
  mate.drive = () => null;
  net.run(200);
  return { net, lead, mate };
}

/** Ready up, race the match out, and continue through its results to the standings. */
function playMatch(net: TestNet, ...cs: TestClient[]): void {
  for (const c of cs) c.send('ready', { ready: true });
  net.run((READY_COUNTDOWN + 1) * 1000, () => net.core.phase === 'race');
  expect(net.core.phase).toBe('race');
  // The squad flies for team 1; every rival is a computer pilot.
  const race = net.core.race!;
  expect(race.mechs.filter((m) => m.human).map((m) => m.team)).toEqual(cs.map(() => 0));
  for (let guard = 0; guard < 6 && net.core.phase !== 'standings'; guard++) {
    net.run(4 * 60 * 1000, () => net.core.phase === 'results' || net.core.phase === 'final');
    net.run(300);
    for (const c of cs) c.send('continue', {});
    net.run(1000, () => net.core.phase === 'race' || net.core.phase === 'standings');
  }
  expect(net.core.phase).toBe('standings');
  net.run(300);
}

/** Wait for the round's other results, then everyone continues. */
function onFromStandings(net: TestNet, ...cs: TestClient[]): void {
  const ev = net.core.gp!.event;
  net.run(5 * 60 * 1000, () => roundComplete(ev, ev.current) && (cs[0].lobby?.timer ?? -1) > 0);
  expect(roundComplete(ev, ev.current)).toBe(true);
  for (const c of cs) c.send('continue', {});
  net.run(500);
}

describe("a Grand Prix room's continue", () => {
  it('a press from the results that arrives late does not skip the standings', () => {
    const { net, lead, mate } = squadRoom('cup');
    net.core.phase = 'standings';
    const ev = net.core.gp!.event;
    ev.rounds[0].you!.result = result(0);
    net.run(5 * 60 * 1000, () => roundComplete(ev, 0) && (lead.lobby?.timer ?? -1) > 0);
    for (const c of [lead, mate]) c.send('continue', { at: 'final' });
    net.run(1000);
    expect(net.core.phase).toBe('standings');
    for (const c of [lead, mate]) c.send('continue', { at: 'standings' });
    net.run(1000);
    expect(net.core.phase).toBe('lobby');
  }, 120_000);
});

const result = (winner: 0 | 1): GpFixtureResult => ({ wins: winner === 0 ? [2, 1] : [1, 2], points: [40, 38], races: 3, winner });

describe("a squad's Grand Prix online", () => {
  it('takes only its squad, on team 1, against computer pilots, with the event setting the round', () => {
    const net = new TestNet({ laps: 1, faction: 2, gp: { kind: 'cup', difficulty: 0 } });
    // Not a squad: refused, and the event is still waiting for its squad.
    const solo = net.join('solo', { loadout: { faction: 2, role: ROLE.FW } });
    expect(solo.errors.join(' ')).toMatch(/squad of two or three/);
    const lead = net.join('lead', { loadout: { faction: 2, role: ROLE.FW }, squad: { id: SQUAD, size: 2 } });
    const mate = net.join('mate', { loadout: { faction: 4, role: ROLE.DF }, squad: { id: SQUAD, size: 2, follow: true } });
    const stranger = net.join('stranger', { loadout: { faction: 1, role: ROLE.FW } });
    const other = net.join('other', { loadout: { faction: 1, role: ROLE.FW }, squad: { id: 'ZZ9ZZ', size: 2 } });
    expect(stranger.errors.join(' ')).toMatch(/squad's Grand Prix/);
    expect(other.errors.join(' ')).toMatch(/squad's Grand Prix/);
    net.run(300);
    const v = lead.lobby!;
    const ev = v.gp!;
    expect(ev.kind).toBe('cup');
    expect(ev.faction).toBe(2);
    expect(v.players.map((p) => [p.pid, p.side])).toEqual([
      ['lead', 0],
      ['mate', 0],
    ]);
    // The event's round: its circuit, a single race, its rival, at its skill.
    expect(v.sides[0].faction).toBe(2);
    expect(v.sides[1].faction).toBe(ev.rounds[0].you!.b);
    expect(v.settings).toEqual({ track: ev.rounds[0].circuit, match: 0, skill: 0 });
    // None of it can be changed by hand, nobody moves to the rivals' team, and a match is not ended early.
    lead.send('settings', { track: 'helios' });
    lead.send('faction', { faction: 3 });
    mate.send('team', { side: 1 });
    lead.send('endMatch', {});
    net.run(300);
    expect(lead.notices.filter((n) => /Grand Prix sets this/.test(n))).toHaveLength(2);
    expect(mate.notices.join(' ')).toMatch(/Computer pilots fly the other team/);
    expect(lead.notices.join(' ')).toMatch(/plays to its end/);
    expect(mate.lobby!.players.find((p) => p.pid === 'mate')!.side).toBe(0);
    expect(mate.lobby!.sides[0].faction).toBe(2);
    // Back after a reload (no squad ticket this time): the same device still gets in.
    net.core.leave('mate');
    const again = net.join('mate2', { deviceId: 'mate', loadout: { faction: 4, role: ROLE.DF } });
    expect(again.errors).toEqual([]);
  });

  it('plays a cup through: briefing, match, standings with the other results, the next briefing, the award', () => {
    const { net, lead, mate } = squadRoom('cup');
    const ev = net.core.gp!.event;
    for (let round = 0; round < 3; round++) {
      expect(net.core.phase).toBe('lobby');
      const rival = ev.rounds[round].you!.b;
      expect(lead.lobby!.sides[1].faction).toBe(rival);
      expect(lead.lobby!.settings.track).toBe(ev.rounds[round].circuit);
      playMatch(net, lead, mate);
      // The race is over for everyone, and the squad's match is in the event.
      expect(lead.received).toContain('lobbyAgain');
      expect(ev.rounds[round].you!.result).not.toBeNull();
      expect(ev.rounds[round].you!.result!.races).toBe(1);
      expect(lead.lobby!.phase).toBe('standings');
      onFromStandings(net, lead, mate);
    }
    expect(isOver(ev)).toBe(true);
    expect(net.core.phase).toBe('award');
    expect(lead.lobby!.phase).toBe('award');
    // Every fixture raced, and a table of all five.
    expect(ev.rounds.every((r) => r.you!.result && r.others.every((f) => f.result))).toBe(true);
    expect(standings(ev, ev.rounds.length - 1)).toHaveLength(5);
    // The squad's event as everyone sees it.
    expect(mate.lobby!.gp!.rounds[2].you!.result).toEqual(ev.rounds[2].you!.result);
  }, 300_000);

  it('passes a matchday off in a season: its standings, then the next briefing', () => {
    const { net, lead, mate } = squadRoom('season');
    const ev = net.core.gp!.event;
    const bye = ev.rounds.findIndex((r) => !r.you);
    expect(bye).toBe(2);
    // The first two matchdays as if played (theirs and everyone else's).
    for (let i = 0; i < bye; i++) {
      ev.rounds[i].you!.result = result(0);
      for (const f of ev.rounds[i].others) f.result = result(1);
    }
    ev.current = bye - 1;
    net.core.phase = 'standings';
    net.run(500);
    onFromStandings(net, lead, mate);
    // The matchday off: its standings, waiting on the other two fixtures.
    expect(ev.current).toBe(bye);
    expect(net.core.phase).toBe('standings');
    onFromStandings(net, lead, mate);
    // Then the next briefing, set up for that matchday's rival.
    expect(ev.current).toBe(bye + 1);
    expect(net.core.phase).toBe('lobby');
    expect(lead.lobby!.sides[1].faction).toBe(ev.rounds[bye + 1].you!.b);
    expect(lead.lobby!.settings.match).toBe(1); // best of 3
    expect(ev.rounds[bye].others.every((f) => f.result)).toBe(true);
  }, 300_000);
});

describe('a room asked for its view again', () => {
  it('sends it: someone who joined but has not heard it yet', () => {
    const { net, lead } = squadRoom('cup');
    const before = lead.received.filter((t) => t === 'lobby').length;
    net.run(500);
    expect(lead.received.filter((t) => t === 'lobby').length).toBe(before);
    lead.send('view', {});
    net.run(200);
    expect(lead.received.filter((t) => t === 'lobby').length).toBe(before + 1);
  });
});

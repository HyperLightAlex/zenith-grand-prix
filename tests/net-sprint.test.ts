// A room set to a Sprint (src/net/lobby.ts, roomCore.ts): six Forwards,
// every pilot for themselves. People fly their own Forward in their colour,
// for no faction; computer pilots in factions' Forwards fill the rest. The
// places are fixed for the whole match, so the standings follow each pilot.
import { describe, expect, it } from 'vitest';
import { PHASE, ROLE, emptyInput, raceChecksum, type MechInput } from '../src/sim/index';
import { PILOT_NAMES } from '../src/net/factions';
import { READY_COUNTDOWN, SPRINT_FORMATS, portraitColour } from '../src/net/protocol';
import { decodeBuild, encodeBuild, stockBuild } from '../src/custom/mechBuild';
import { TestNet, type TestClient } from './netHarness';
import { makeRandom, mash, steerToward } from './helpers';

function pilot(seed: number): (c: TestClient) => MechInput {
  const rand = makeRandom(seed);
  const pad = emptyInput();
  return (c) => {
    const p = c.predictor!;
    mash(rand, pad);
    steerToward(p.predicted.mechs[p.seat], pad, 0);
    return { ...pad };
  };
}

function readyUp(net: TestNet, ...cs: TestClient[]): void {
  net.run(200);
  for (const c of cs) c.send('ready', { ready: true });
  net.run((READY_COUNTDOWN + 1) * 1000, () => net.core.phase === 'race');
  net.run(300);
}

describe('a room set to a Sprint', () => {
  it('is the host\'s to set, and Ready locks in no frame', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.FW } });
    const b = net.join('b', { loadout: { faction: 1, role: ROLE.FW } });
    const c = net.join('c', { loadout: { faction: 2, role: ROLE.FW } });
    net.run(200);
    b.send('settings', { mode: 'sprint' });
    net.run(200);
    expect(a.lobby?.settings.mode).toBe('teams');
    a.send('settings', { mode: 'sprint', sprint: 3 });
    net.run(200);
    expect(b.lobby?.settings).toMatchObject({ mode: 'sprint', sprint: 3 });
    a.send('settings', { sprint: SPRINT_FORMATS.length });
    net.run(200);
    expect(b.lobby?.settings.sprint).toBe(3);
    // a and c both picked the Forward on team 1 (b is on team 2): both may be ready in a Sprint.
    expect(a.lobby?.players.find((p) => p.pid === 'c')?.side).toBe(a.lobby?.players.find((p) => p.pid === 'a')?.side);
    a.send('ready', { ready: true });
    c.send('ready', { ready: true });
    net.run(200);
    expect(a.lobby?.players.filter((p) => p.ready).map((p) => p.pid).sort()).toEqual(['a', 'c']);
  });

  it('seats everyone in their own Forward in their colour, and computer pilots of the factions in the rest', () => {
    const net = new TestNet({ laps: 1 });
    const mine = encodeBuild({ ...stockBuild(3), name: 'Halo' });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.MF }, portrait: 4, colour: 7, sprint: mine });
    const b = net.join('b', { loadout: { faction: 2, role: ROLE.DF }, portrait: 10 });
    a.send('settings', { mode: 'sprint', sprint: 0 });
    readyUp(net, a, b);
    expect(net.core.phase).toBe('race');
    const start = a.start!;
    expect(start.mode).toBe('sprint');
    expect(start.seats).toHaveLength(6);
    expect(start.seats.every((s, i) => s.team === i && s.role === ROLE.FW)).toBe(true);
    expect(start.factions).toHaveLength(6);
    const sa = start.seats[a.start!.seat];
    const sb = start.seats[b.start!.seat];
    expect(sa).toMatchObject({ human: true, name: 'a', portrait: 4, colour: 7, look: mine });
    // b sent no colour and no Forward: their portrait's colour, their faction's stock Forward.
    expect(sb).toMatchObject({ human: true, name: 'b', colour: portraitColour(10) });
    expect(decodeBuild(sb.look)).toEqual(stockBuild(2));
    expect(start.factions[a.start!.seat]).toBe(-1);
    expect(start.factions[b.start!.seat]).toBe(-1);
    const cpu = start.seats.filter((s) => !s.human);
    expect(cpu).toHaveLength(4);
    const cpuFactions = start.seats.map((s, i) => (s.human ? -1 : start.factions[i])).filter((f) => f >= 0);
    expect(new Set(cpuFactions).size).toBe(4);
    for (const [i, s] of start.seats.entries()) if (!s.human) expect(s.name).toBe(PILOT_NAMES[start.factions[i]][ROLE.FW]);
    // Everyone's copy of the race is a Sprint, on the same grid.
    expect(a.predictor!.confirmed.sprint).toBe(true);
    expect(raceChecksum(a.predictor!.confirmed)).toBe(raceChecksum(b.predictor!.confirmed));
    expect(a.predictor!.confirmed.mechs.map((m) => [m.s, m.d])).toEqual(net.core.race!.mechs.map((m) => [m.s, m.d]));
  });

  it('runs a Sprint of three races to its end, the standings following each pilot, with no drift', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.FW } }, 45);
    const b = net.join('b', { loadout: { faction: 1, role: ROLE.MF } }, 80);
    a.drive = pilot(1);
    b.drive = pilot(2);
    a.send('settings', { mode: 'sprint', sprint: 1 });
    readyUp(net, a, b);
    const seatA = a.start!.seat;
    const sums = new Map<number, number>();
    let compared = 0;
    const grids: string[] = [];
    let lastStart = a.start;
    net.run(12 * 60 * 1000, () => {
      const server = net.core.race;
      if (server && server.tick % 97 === 0) sums.set(server.tick, raceChecksum(server));
      for (const c of [a, b]) {
        const p = c.predictor;
        if (p && sums.has(p.confirmed.tick)) {
          expect(raceChecksum(p.confirmed)).toBe(sums.get(p.confirmed.tick));
          sums.delete(p.confirmed.tick);
          compared++;
        }
      }
      if (a.start && a.start !== lastStart) lastStart = a.start;
      if (a.start && grids.length < (a.start.round + 1)) grids.push(JSON.stringify(a.start.grid));
      // Everyone continues as soon as the results are up.
      if (net.core.phase === 'results') for (const c of [a, b]) c.send('continue', { at: 'results' });
      return net.core.phase === 'final' || net.core.phase === 'lobby';
    });
    expect(net.core.phase).toBe('final');
    expect(compared).toBeGreaterThan(10);
    expect(a.resyncs + b.resyncs).toBe(0);
    net.run(500);
    expect(a.roundEnds).toHaveLength(3);
    const match = a.roundEnds[2].match;
    expect(match.rounds).toHaveLength(3);
    expect(match.winner).toBeGreaterThanOrEqual(0);
    expect(match.totals).toHaveLength(6);
    // The same place every race: a's seat is a's side.
    expect(a.start!.seat).toBe(seatA);
    expect(a.lobby?.sprint?.[seatA]).toBe('a');
    // The grid: by lot, then the standings reversed.
    expect(new Set(grids).size).toBeGreaterThan(1);
    expect(net.core.race!.mechs.every((m) => m.support === 0)).toBe(true);
    net.run(11000);
    expect(net.core.phase).toBe('lobby');
    expect(a.lobby?.sprint).toBeNull();
    expect(a.lobby?.settings.mode).toBe('sprint');
  }, 120_000);

  it('keeps a leaver\'s place for the match, flown by the computer, and seats a newcomer in the next Sprint', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a');
    const b = net.join('b');
    a.send('settings', { mode: 'sprint', sprint: 1 });
    readyUp(net, a, b);
    const seatB = b.start!.seat;
    net.run(3000);
    net.core.leave('b');
    const late = net.join('late');
    net.run(300);
    expect(late.lobby?.players.find((p) => p.pid === 'late')?.nextRound).toBe(true);
    expect(late.start).toBeNull();
    // Into the next race: b's place is the computer's, still b's; late still waits.
    net.run(6 * 60 * 1000, () => net.core.phase === 'results');
    a.send('continue', { at: 'results' });
    net.run(16000, () => net.core.phase === 'race' && net.core.race!.tick > 0);
    expect(net.core.race!.mechs[seatB].human).toBe(false);
    expect(net.core.race!.mechs[seatB].name).toBe('b');
    expect(net.core.race!.mechs[seatB].look).not.toBe('');
    expect(late.lobby?.players.find((p) => p.pid === 'late')?.nextRound).toBe(true);
    expect(net.core.seatPid).not.toContain('late');
    expect(net.core.race!.phase).not.toBe(PHASE.FINISHED);
  }, 60_000);
});

import { describe, expect, it } from 'vitest';
import { CALLER, PHASE, ROLE, TACTIC, emptyInput, raceChecksum, type MechInput } from '../src/sim/index';
import { TestNet, type TestClient } from './netHarness';
import { steerToward, makeRandom, mash } from './helpers';
import { cleanWire } from '../src/net/roomCore';
import { READY_COUNTDOWN } from '../src/net/protocol';

/** A person who keeps to the racing line, with some random button presses. */
function pilot(seed: number): (c: TestClient) => MechInput {
  const rand = makeRandom(seed);
  const pad = emptyInput();
  return (c) => {
    const p = c.predictor!;
    const m = p.predicted.mechs[p.seat];
    mash(rand, pad);
    steerToward(m, pad, 0);
    return { ...pad };
  };
}

function readyUp(net: TestNet, ...cs: TestClient[]): void {
  net.run(200);
  for (const c of cs) c.send('ready', { ready: true });
  net.run((READY_COUNTDOWN + 1) * 1000, () => net.core.phase === 'race');
  net.run(300);
}

describe('an online room', () => {
  it('runs a race whose confirmed copies match the server tick for tick, and predicts ahead of it', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.FW } }, 45);
    const b = net.join('b', { loadout: { faction: 1, role: ROLE.MF } }, 80);
    a.drive = pilot(1);
    b.drive = pilot(2);
    net.core.message('a', 'settings', { match: 0 });
    readyUp(net, a, b);
    expect(net.core.phase).toBe('race');
    expect(a.start?.seat).toBe(0);
    expect(b.start?.seat).toBe(3); // MF of team 1
    let compared = 0;
    let ahead = 0;
    let steps = 0;
    const sums = new Map<number, number>();
    const seen = new Set<string>();
    net.run(4 * 60 * 1000, () => {
      // Every so often, compare a client's confirmed race with the server's at the same tick.
      const server = net.core.race;
      if (server && server.tick % 97 === 0) sums.set(server.tick, raceChecksum(server));
      for (const c of [a, b]) {
        const p = c.predictor;
        const key = `${c.pid}:${p?.confirmed.tick}`;
        if (p && sums.has(p.confirmed.tick) && !seen.has(key)) {
          seen.add(key);
          expect(raceChecksum(p.confirmed)).toBe(sums.get(p.confirmed.tick));
          compared++;
        }
        if (p && p.confirmed.phase !== PHASE.FINISHED) {
          ahead += p.predicted.tick - p.confirmed.tick;
          steps++;
        }
      }
      return net.core.phase !== 'race';
    });
    expect(net.core.phase).toBe('final');
    expect(compared).toBeGreaterThan(10);
    // Prediction runs ahead of what the server has confirmed by about a round trip.
    expect(ahead / steps).toBeGreaterThan(4);
    expect(ahead / steps).toBeLessThan(20);
    expect(a.resyncs + b.resyncs).toBe(0);
    net.run(500);
    expect(a.roundEnds).toHaveLength(1);
    expect(b.roundEnds[0].match.winner).toBeGreaterThanOrEqual(0);
    // Both people drove: the server applied their inputs, not the computer's.
    expect(net.core.race!.mechs[0].human).toBe(true);
    expect(net.core.race!.mechs[0].finished || net.core.race!.mechs[0].retired).toBe(true);
    // After the final results, everyone is back in the lobby on their team, in their frame.
    net.run(11000);
    expect(net.core.phase).toBe('lobby');
    expect(a.lobby?.phase).toBe('lobby');
    const back = a.lobby?.players.find((p) => p.pid === 'a');
    expect(back?.side).toBe(0);
    expect(back?.role).toBe(ROLE.FW);
  }, 60_000);

  it('hands a dropped seat to its computer pilot and back on reconnect', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', {}, 30);
    const b = net.join('b', {}, 30);
    a.drive = pilot(3);
    b.drive = pilot(4);
    readyUp(net, a, b);
    net.run(6000);
    // a's connection drops.
    a.connected = false;
    net.core.drop('a');
    net.run(3000);
    const row = net.core.race!;
    expect(row.teams[0].caller).toBe(CALLER.CAPTAIN);
    expect(a.lobby).not.toBeNull();
    // Back: the room sends the race as it stands, and a picks up from there.
    a.connected = true;
    a.predictor = null;
    net.core.join({ pid: 'a', deviceId: 'a', callsign: 'a', loadout: { faction: 0, role: ROLE.FW } });
    net.run(500);
    expect(a.predictor).not.toBeNull();
    expect(a.start?.key).not.toBeNull();
    net.run(3000);
    const server = net.core.race!;
    expect(a.predictor!.confirmed.tick).toBeGreaterThan(server.tick - 10);
    expect(server.teams[0].caller).toBe(0);
    expect(a.resyncs).toBe(0);
  }, 60_000);

  it('gives the race the shot caller the room chose, and moves it when they drop', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.FW } });
    const b = net.join('b', { loadout: { faction: 1, role: ROLE.FW } });
    const c = net.join('c', { loadout: { faction: 0, role: ROLE.MF } });
    net.run(200);
    expect(c.lobby?.sides[0].caller).toBe('a');
    a.send('caller', { action: 'pass' });
    net.run(200);
    expect(a.lobby?.sides[0].caller).toBe('c');
    readyUp(net, a, b, c);
    const race = net.core.race!;
    const seatC = net.core.seatPid.indexOf('c');
    expect(race.teams[0].caller).toBe(seatC);
    expect(race.teams[1].caller).toBe(net.core.seatPid.indexOf('b'));
    // a's calls are ignored; c's count.
    a.drive = () => ({ ...emptyInput(), throttle: 1, cmd: TACTIC.BLITZ });
    net.run(5000);
    expect(net.core.race!.teams[0].tactic).toBe(TACTIC.FREE);
    // c drops: a is alone with two computer pilots, and calls.
    c.connected = false;
    net.core.drop('c');
    a.drive = () => ({ ...emptyInput(), throttle: 1 });
    net.run(500);
    expect(net.core.race!.teams[0].caller).toBe(0);
    a.drive = () => ({ ...emptyInput(), throttle: 1, cmd: TACTIC.SHIELD });
    net.run(500);
    expect(net.core.race!.teams[0].tactic).toBe(TACTIC.SHIELD);
    // Everyone's confirmed race saw the same change at the same tick.
    expect(a.predictor!.confirmed.teams[0].caller).toBe(0);
    expect(a.resyncs + b.resyncs).toBe(0);
  }, 60_000);

  it('runs the computer pilot while you sit in the pause menu', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a');
    a.drive = pilot(9);
    readyUp(net, a);
    net.run(6000);
    a.drive = () => null;
    net.run(1000);
    expect(a.lobby?.players[0].autopilot).toBe(true);
    const before = net.core.race!.mechs[0].s;
    net.run(2000);
    expect(net.core.race!.mechs[0].s).toBeGreaterThan(before + 50);
  }, 60_000);

  it('starts only when everyone has locked in a frame of their own', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.MF } });
    const b = net.join('b', { loadout: { faction: 1, role: ROLE.FW } });
    const c = net.join('c', { loadout: { faction: 0, role: ROLE.MF } }); // a's team, a's frame
    net.run(200);
    a.send('ready', { ready: true });
    b.send('ready', { ready: true });
    net.run(200);
    c.send('ready', { ready: true });
    net.run(7000);
    expect(net.core.phase).toBe('lobby'); // c could not lock in a's frame
    expect(c.notices.join(' ')).toMatch(/a has locked in that frame/);
    c.send('pick', { role: ROLE.DF });
    c.send('ready', { ready: true });
    net.run(7000);
    expect(net.core.phase).toBe('race');
    const race = net.core.race!;
    const frame = (pid: string) => race.mechs[net.core.seatPid.indexOf(pid)].role;
    expect(frame('a')).toBe(ROLE.MF);
    expect(frame('c')).toBe(ROLE.DF);
  }, 60_000);

  it('lets someone in mid-match for the next round, and the host can end the match', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a');
    net.core.message('a', 'settings', { match: 1 });
    readyUp(net, a);
    net.run(3000);
    const late = net.join('late');
    net.run(300);
    expect(late.lobby?.players.find((p) => p.pid === 'late')?.nextRound).toBe(true);
    expect(late.start).toBeNull();
    a.send('endMatch', {});
    net.run(500);
    expect(net.core.phase).toBe('lobby');
    expect(a.received).toContain('lobbyAgain');
  });

  it('cleans what comes off the wire', () => {
    expect(cleanWire([1e9, -1e9, 300, Number.NaN, 0xffffffff, 99])).toEqual([127, -127, 255, 0, expect.any(Number), 4]);
    expect(cleanWire('junk')).toBe(0);
    expect(cleanWire([1, 2])).toBe(0);
  });
});

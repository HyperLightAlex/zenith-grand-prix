// Quick Play (src/net/roomCore.ts, lobby.ts): a matchmade room. Nobody is
// host: its playlist sets the mode and the way of winning, its circuit is
// drawn by lot, its race starts by itself with a computer pilot in every
// place nobody has, and it is a lobby again after each match, open to
// whoever is searching. A squad is seated together on one team.
import { describe, expect, it } from 'vitest';
import { ROLE, TRACKS, emptyInput, type MechInput } from '../src/sim/index';
import { MATCH_FORMATS, PLAYLISTS, QUICK_CEREMONY_SECONDS, QUICK_GATHER_SECONDS, QUICK_MERGE_SECONDS, QUICK_NEXT_SECONDS, QUICK_READY_SECONDS, QUICK_SKILL, ROOM_SIZE, SPRINT_FORMATS, playlistById } from '../src/net/protocol';
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

const S = 1000;

describe('the playlists', () => {
  it('are each a mode and one of its formats, with a name and a line saying what it is', () => {
    expect(PLAYLISTS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(PLAYLISTS.map((p) => p.id)).size).toBe(PLAYLISTS.length);
    for (const p of PLAYLISTS) {
      expect((p.mode === 'sprint' ? SPRINT_FORMATS : MATCH_FORMATS)[p.format], p.id).toBeDefined();
      expect(p.name.length, p.id).toBeGreaterThan(2);
      expect(p.blurb.length, p.id).toBeGreaterThan(10);
      expect(playlistById(p.id)).toBe(p);
    }
    // Both modes can be searched for.
    expect(new Set(PLAYLISTS.map((p) => p.mode))).toEqual(new Set(['teams', 'sprint']));
    expect(playlistById('nope')).toBeUndefined();
    expect(playlistById(3)).toBeUndefined();
  });
});

describe('a Quick Play room', () => {
  it('takes its settings from its playlist, has no host, and nobody changes it or removes anyone', () => {
    const net = new TestNet({ laps: 1, quick: 'team-points' });
    const a = net.join('a');
    const b = net.join('b');
    net.run(200);
    const v = a.lobby!;
    expect(v.quick).toBe('team-points');
    expect(v.host).toBeNull();
    expect(v.settings).toMatchObject({ mode: 'teams', match: 3, skill: QUICK_SKILL });
    expect(TRACKS.some((t) => t.id === v.settings.track)).toBe(true);
    a.send('settings', { track: TRACKS[0].id === v.settings.track ? TRACKS[1].id : TRACKS[0].id, match: 0, mode: 'sprint', skill: 2 });
    a.send('kick', { pid: 'b' });
    a.send('ready', { ready: true });
    b.send('ready', { ready: true });
    net.run(200);
    a.send('start', {});
    net.run(200);
    expect(a.lobby!.settings).toEqual(v.settings);
    expect(a.lobby!.players.map((p) => p.pid)).toEqual(['a', 'b']);
    expect(net.core.phase).toBe('lobby');
    expect(a.notices.join(' ')).toMatch(/Quick Play sets this/);
    expect(a.notices.join(' ')).toMatch(/starts by itself/);
    // They were put on opposite teams: the team with fewer people each time.
    expect(a.lobby!.players.map((p) => p.side)).toEqual([0, 1]);
    const sprint = new TestNet({ quick: 'sprint-series' });
    sprint.join('a');
    sprint.run(200);
    expect(sprint.clients.get('a')!.lobby!.settings).toMatchObject({ mode: 'sprint', sprint: 1 });
  });

  it('starts by itself after the wait, with a computer pilot in every place nobody has', () => {
    const net = new TestNet({ laps: 1, quick: 'team-race' });
    const a = net.join('a', { loadout: { faction: 2, role: ROLE.MF } });
    net.run(1500);
    // The lobby counts down, and says so.
    expect(a.lobby!.phase).toBe('lobby');
    expect(a.lobby!.timer).toBeGreaterThan(QUICK_GATHER_SECONDS - 3);
    expect(a.lobby!.timer).toBeLessThanOrEqual(QUICK_GATHER_SECONDS);
    net.run((QUICK_GATHER_SECONDS - 3) * S);
    expect(net.core.phase).toBe('lobby');
    net.run(3 * S, () => net.core.phase === 'race');
    expect(net.core.phase).toBe('race');
    net.run(300);
    // Six mechs: the one person in the frame they picked, five computer pilots.
    expect(a.start!.seats).toHaveLength(6);
    expect(a.start!.seats.filter((s) => s.human)).toHaveLength(1);
    expect(a.start!.seats[a.start!.seat]).toMatchObject({ human: true, role: ROLE.MF, team: 0 });
    // Their faction is their team's (they were its first), the other team another.
    expect(a.start!.factions[0]).toBe(2);
    expect(a.start!.factions[1]).not.toBe(2);
    expect(a.start!.track).toBe(a.lobby!.settings.track);
  });

  it('starts sooner once everyone is ready, or once it is full of people', () => {
    const net = new TestNet({ laps: 1, quick: 'team-race' });
    const a = net.join('a');
    const b = net.join('b');
    net.run(2 * S);
    a.send('ready', { ready: true });
    net.run(2 * S);
    // One of two ready: still the full wait.
    expect(a.lobby!.timer).toBeGreaterThan(QUICK_READY_SECONDS);
    b.send('ready', { ready: true });
    net.run(S);
    expect(a.lobby!.timer).toBeLessThanOrEqual(QUICK_READY_SECONDS);
    net.run(QUICK_READY_SECONDS * S, () => net.core.phase === 'race');
    expect(net.core.phase).toBe('race');
    expect(net.clock).toBeLessThan((QUICK_GATHER_SECONDS - 5) * S);

    const full = new TestNet({ laps: 1, quick: 'sprint' });
    for (let i = 0; i < ROOM_SIZE; i++) full.join(`p${i}`);
    full.run(S);
    expect(full.clients.get('p0')!.lobby!.timer).toBeLessThanOrEqual(QUICK_READY_SECONDS);
    // A seventh finds it full.
    expect(full.join('late').errors).toEqual(['Room full']);
    full.run((QUICK_READY_SECONDS + 1) * S, () => full.core.phase === 'race');
    expect(full.core.phase).toBe('race');
    full.run(300);
    expect(full.clients.get('p3')!.start!.seats.filter((s) => s.human)).toHaveLength(ROOM_SIZE);
  });

  it('seats a squad together on one team, whoever else is there', () => {
    const net = new TestNet({ laps: 1, quick: 'team-race' });
    // Two people searching alone are in already, one on each team.
    net.join('x');
    net.join('y');
    expect(net.core.quickState().fits).toEqual([true, true, false]);
    // A squad of two: its leader, then the other following (a place was kept).
    const lead = net.join('l', { squad: { id: 'SQ', size: 2 }, loadout: { faction: 3, role: ROLE.FW } });
    expect(lead.errors).toEqual([]);
    expect(net.core.quickState().people).toBe(3);
    // A place is kept for the squad's other member, so its team is full; the other team has two places yet.
    expect(net.core.quickState().fits).toEqual([true, true, false]);
    const z = net.join('z');
    expect(net.core.quickState().fits).toEqual([true, false, false]);
    const mate = net.join('m', { squad: { id: 'SQ', size: 2, follow: true }, loadout: { faction: 3, role: ROLE.DF } });
    expect(mate.errors).toEqual([]);
    net.run(300);
    const side = (pid: string) => lead.lobby!.players.find((p) => p.pid === pid)!.side;
    expect(side('m')).toBe(side('l'));
    expect(side('z')).not.toBe(side('l'));
    // A squad of three finds no team with three places.
    expect(net.join('q', { squad: { id: 'S3', size: 3 } }).errors[0]).toMatch(/free place/);
    expect(z.errors).toEqual([]);
    // Ready locks a frame in, here as in any room: the squad's two lock theirs.
    lead.send('ready', { ready: true });
    mate.send('ready', { ready: true });
    net.run((QUICK_GATHER_SECONDS + 1) * S, () => net.core.phase === 'race');
    net.run(300);
    const seat = (c: TestClient) => c.start!.seats[c.start!.seat];
    expect(seat(mate).team).toBe(seat(lead).team);
    expect(seat(lead).role).toBe(ROLE.FW);
    expect(seat(mate).role).toBe(ROLE.DF);
    // Every place taken: five people and one computer pilot.
    expect(lead.start!.seats.filter((s) => s.human)).toHaveLength(5);
  });

  it('is a lobby again after the match, on another circuit, takes nobody mid-match, and drops whoever was never at the controls', () => {
    const net = new TestNet({ laps: 1, quick: 'team-race' });
    const a = net.join('a');
    const b = net.join('b');
    a.drive = pilot(1);
    // (b never touches the controls: an empty input, the same every tick.)
    net.run((QUICK_GATHER_SECONDS + 1) * S, () => net.core.phase === 'race');
    const first = a.lobby!.settings.track;
    // Racing: no search is put in here.
    expect(net.core.quickState()).toMatchObject({ open: false, fits: [false, false, false], people: 2 });
    net.run(5 * 60 * S, () => net.core.phase === 'final');
    expect(net.core.phase).toBe('final');
    expect(net.core.quickState().open).toBe(false);
    net.run(2 * S);
    expect(a.lobby!.timer).toBeLessThan(QUICK_CEREMONY_SECONDS);
    // Everyone has seen the results: no waiting out the clock.
    a.send('continue', {});
    b.send('continue', {});
    net.run(2 * S, () => net.core.phase === 'lobby');
    expect(net.core.phase).toBe('lobby');
    net.run(S);
    expect(net.core.matches).toBe(1);
    expect(a.lobby!.settings.track).not.toBe(first);
    expect(a.lobby!.timer).toBeGreaterThan(QUICK_NEXT_SECONDS - 4);
    // b is gone, and told why; a stays for the next race, and the room is open again.
    expect(a.lobby!.players.map((p) => p.pid)).toEqual(['a']);
    expect(b.errors.join(' ')).toMatch(/away for the whole race/);
    expect(net.core.quickState()).toMatchObject({ open: true, people: 1 });
    net.run((QUICK_NEXT_SECONDS + 1) * S, () => net.core.phase === 'race');
    expect(net.core.phase).toBe('race');
  });

  it('can be folded into a fuller lobby: its people are told to search again, and the other waits for them', () => {
    const big = new TestNet({ laps: 1, quick: 'team-race', code: 'AAAAA' });
    big.join('x');
    big.join('y', { squad: { id: 'SQ', size: 2 } });
    big.join('z', { squad: { id: 'SQ', size: 2, follow: true } });
    const small = new TestNet({ laps: 1, quick: 'team-race', code: 'BBBBB' });
    const a = small.join('a', { squad: { id: 'S2', size: 2 } });
    const b = small.join('b', { squad: { id: 'S2', size: 2, follow: true } });
    big.run((QUICK_GATHER_SECONDS - 2) * S);
    small.run(S);
    // The small lobby's people: one squad of two. The big one has x alone on one team and a squad of two on the other.
    expect(small.core.quickState().parties).toEqual([2]);
    expect(big.core.quickState().parties).toEqual([2, 1]);
    expect(big.core.couldTake([2])).toBe(true);
    expect(big.core.couldTake([3])).toBe(false);
    expect(big.core.couldTake([2, 2])).toBe(false);
    expect(big.core.couldTake([2, 1])).toBe(true);
    // The server folds the small one in (raceRoom.ts): the big one waits, the small one sends its people on.
    big.core.expect();
    small.core.requeue();
    small.run(300);
    expect([a.requeued, b.requeued]).toEqual(['team-race', 'team-race']);
    expect(small.core.quickState().open).toBe(false);
    // Its people have not left yet: it does not start a race meanwhile.
    small.run((QUICK_MERGE_SECONDS - 2) * S);
    expect(small.core.phase).toBe('lobby');
    // The big one, two seconds from its start, gave them time to arrive.
    big.run(3 * S);
    expect(big.core.phase).toBe('lobby');
    big.join('a', { squad: { id: 'S2', size: 2 } });
    big.join('b', { squad: { id: 'S2', size: 2, follow: true } });
    big.run((QUICK_MERGE_SECONDS + 1) * S, () => big.core.phase === 'race');
    big.run(300);
    const x = big.clients.get('x')!;
    expect(x.start!.seats.filter((s) => s.human)).toHaveLength(5);
    const team = (pid: string) => big.clients.get(pid)!.start!.seats[big.clients.get(pid)!.start!.seat].team;
    expect(team('a')).toBe(team('b'));
    expect(team('y')).toBe(team('z'));
    // Anyone who stayed behind in the folded lobby races there after all.
    small.run((QUICK_GATHER_SECONDS + 4) * S, () => small.core.phase === 'race');
    expect(small.core.phase).toBe('race');
  });
});

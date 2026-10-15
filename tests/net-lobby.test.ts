import { describe, expect, it } from 'vitest';
import { ROLE } from '../src/sim/index';
import {
  addMember,
  allReady,
  answerSwap,
  callerAction,
  callerOf,
  captainOf,
  createLobby,
  freeRoles,
  kick,
  lobbyView,
  moveSeat,
  removeMember,
  setFaction,
  setReady,
  setSettings,
  type JoinInfo,
  type Lobby,
} from '../src/net/lobby';
import { callsignProblem, makeCode, normalizeCode, packInput, quantizeInput, unpackInput, CODE_CHARS } from '../src/net/protocol';
import { FACTION_NAMES, PILOT_NAMES } from '../src/net/factions';
import { LIVERIES } from '../src/client/render/palette';

const join = (lobby: Lobby, pid: string, extra: Partial<JoinInfo> = {}, now = 0) => addMember(lobby, { pid, deviceId: pid, callsign: pid, loadout: { faction: 0, role: ROLE.FW }, ...extra }, now);

describe('codes and callsigns', () => {
  it('makes five-character codes from the unambiguous set', () => {
    let s = 1;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
      const c = makeCode(rand);
      expect(c).toMatch(/^[A-Z2-9]{5}$/);
      for (const ch of c) expect(CODE_CHARS).toContain(ch);
    }
    expect(CODE_CHARS).not.toMatch(/[01OIL]/);
    expect(CODE_CHARS.length).toBe(31);
  });

  it('reads a code as typed, pasted or inside a link', () => {
    expect(normalizeCode(' k7q2x ')).toBe('K7Q2X');
    expect(normalizeCode('https://zenith.example/?room=k7q2x')).toBe('K7Q2X');
    expect(normalizeCode('K7Q2')).toBeNull();
    expect(normalizeCode('K0Q2X')).toBeNull();
  });

  it('checks callsigns', () => {
    expect(callsignProblem('Ace')).toBeNull();
    expect(callsignProblem('ab')).toMatch(/At least/);
    expect(callsignProblem('x'.repeat(17))).toMatch(/At most/);
    expect(callsignProblem('<script>')).toMatch(/only/);
    expect(callsignProblem('Sh1tLord')).toMatch(/another/);
  });

  it('packs inputs so the prediction sees exactly what the server will', () => {
    const inp = { mx: 0.31, my: -1.4, throttle: 0.5, brake: Number.NaN, buttons: 5, cmd: 2 };
    const q = quantizeInput(inp)!;
    expect(q.my).toBe(-1);
    expect(q.brake).toBe(0);
    expect(unpackInput(packInput(q))).toEqual(q);
    expect(packInput(null)).toBe(0);
  });

  it('knows the same factions as the palette', () => {
    expect(FACTION_NAMES).toEqual(LIVERIES.map((l) => l.name));
    expect(PILOT_NAMES).toEqual(LIVERIES.map((l) => l.pilots));
  });
});

describe('the lobby', () => {
  it('seats people on the emptier side, in their frame when it is free', () => {
    const l = createLobby('AAAAA', 'v', 2);
    expect(join(l, 'a', { loadout: { faction: 2, role: ROLE.MF } }).ok).toBe(true);
    expect(l.host).toBe('a');
    expect(l.factions[0]).toBe(2);
    const b = join(l, 'b', { loadout: { faction: 2, role: ROLE.MF } });
    expect(b.ok && b.member.side).toBe(1);
    expect(b.ok && b.member.role).toBe(ROLE.MF);
    // The other team already flies Mirage: b keeps the default.
    expect(l.factions[1]).not.toBe(2);
    const c = join(l, 'c', { loadout: { faction: 4, role: ROLE.MF } });
    expect(c.ok && c.member.side).toBe(0);
    expect(c.ok && c.member.role).not.toBe(ROLE.MF);
  });

  it('turns away a seventh person', () => {
    const l = createLobby('AAAAA', 'v');
    for (let i = 0; i < 6; i++) expect(join(l, 'p' + i).ok).toBe(true);
    const r = join(l, 'p6');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.text).toBe('Room full');
  });

  it('passes the host on to whoever has been in longest', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a');
    join(l, 'b');
    join(l, 'c');
    removeMember(l, 'a');
    expect(l.host).toBe('b');
  });

  it('lets only a captain pick a faction, and never the other team\'s', () => {
    const l = createLobby('AAAAA', 'v', 0);
    join(l, 'a');
    join(l, 'b');
    join(l, 'c');
    expect(captainOf(l, 0)?.pid).toBe('a');
    expect(setFaction(l, 'c', 3).ok).toBe(false);
    expect(setFaction(l, 'a', l.factions[1]).ok).toBe(false);
    setReady(l, 'b', true);
    expect(setFaction(l, 'a', 3).ok).toBe(true);
    expect(l.factions[0]).toBe(3);
    // A faction change clears the ready marks.
    expect(l.members.find((m) => m.pid === 'b')!.ready).toBe(false);
  });

  it('moves into an empty seat and asks for an occupied one', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a');
    join(l, 'b');
    expect(moveSeat(l, 'a', 1, ROLE.DF).ok).toBe(true);
    expect(l.members[0].side).toBe(1);
    const bRole = l.members[1].role;
    const ask = moveSeat(l, 'a', 1, bRole);
    expect(ask.ok && ask.note).toBe('asked');
    expect(answerSwap(l, 'b', 'a', true).ok).toBe(true);
    expect(l.members[0].role).toBe(bRole);
    expect(l.members[1].role).toBe(ROLE.DF);
  });

  it('gives a team of two people and one computer pilot a shot caller, and only that team', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a');
    join(l, 'b');
    expect(callerOf(l, 0)).toBeUndefined(); // one person: they call automatically
    join(l, 'c');
    expect(callerOf(l, 0)?.pid).toBe('a'); // a and c: the captain starts with it
    expect(callerAction(l, 'c', 'pass').ok).toBe(false);
    expect(callerAction(l, 'c', 'ask').ok).toBe(true);
    expect(lobbyView(l, 'lobby', -1, null, []).callerAsks[0]).toBe('c');
    expect(callerAction(l, 'a', 'accept').ok).toBe(true);
    expect(callerOf(l, 0)?.pid).toBe('c');
    expect(callerAction(l, 'c', 'pass').ok).toBe(true);
    expect(callerOf(l, 0)?.pid).toBe('a');
    join(l, 'd');
    join(l, 'e');
    expect(callerOf(l, 0)).toBeUndefined(); // three people: nobody to order
    expect(lobbyView(l, 'lobby', -1, null, []).sides[0].caller).toBeNull();
  });

  it('holds seats for a squad following its leader, and refuses a squad with no room', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'x');
    join(l, 'y');
    moveSeat(l, 'y', 0, ROLE.DF);
    const lead = join(l, 'lead', { squad: { id: 'SQ', size: 3 } }, 0);
    expect(lead.ok).toBe(true);
    if (!lead.ok) return;
    // Two seats held on the leader's side, out of reach of anyone else.
    expect(freeRoles(l, lead.member.side)).toHaveLength(0);
    expect(freeRoles(l, lead.member.side, 'SQ')).toHaveLength(2);
    expect(callerOf(l, lead.member.side)).toBeUndefined();
    const m1 = join(l, 'm1', { squad: { id: 'SQ', size: 3 } }, 1000);
    expect(m1.ok && m1.member.side).toBe(lead.member.side);
    const other = join(l, 'z', {}, 1000);
    expect(other.ok && other.member.side).not.toBe(lead.member.side);
    // Holds lapse: after 20 s the last held seat is anyone's.
    const late = join(l, 'w', {}, 30000);
    expect(late.ok).toBe(true);
    const l2 = createLobby('BBBBB', 'v');
    for (const p of ['a', 'b', 'c', 'd']) join(l2, p);
    const squad = join(l2, 's', { squad: { id: 'S2', size: 3 } });
    expect(squad.ok).toBe(false);
    expect(!squad.ok && squad.text).toMatch(/1 free seat; your squad has 3/);
  });

  it('seats a late follower with its squad, as a member and not a second leader', () => {
    const l = createLobby('AAAAA', 'v');
    const lead = join(l, 'lead', { squad: { id: 'SQ', size: 3 } }, 0);
    if (!lead.ok) throw new Error('leader refused');
    expect(lead.member.side).toBe(0);
    // The holds lapse before the members arrive, and strangers take seats on both sides.
    join(l, 'a', {}, 25000);
    join(l, 'b', {}, 25000);
    expect(l.members.filter((x) => x.side === 0)).toHaveLength(2);
    expect(l.callers[0]).toBe('lead');
    // On its own the follower would take the emptier side (team 2); it joins its squad instead.
    const late = join(l, 'm1', { squad: { id: 'SQ', size: 3, follow: true } }, 26000);
    if (!late.ok) throw new Error('follower refused');
    expect(late.member.side).toBe(0);
    expect(l.holds).toHaveLength(0); // a second leader would have held seats...
    expect(l.callers[0]).toBe('lead'); // ...and taken the shot calling
  });

  it('starts once everyone connected is ready, and settings clear the marks', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a');
    join(l, 'b');
    expect(allReady(l)).toBe(false);
    setReady(l, 'a', true);
    setReady(l, 'b', true);
    expect(allReady(l)).toBe(true);
    expect(setSettings(l, 'b', { skill: 2 }).ok).toBe(false);
    expect(setSettings(l, 'a', { track: 'helios', skill: 2 }).ok).toBe(true);
    expect(allReady(l)).toBe(false);
    expect(setSettings(l, 'a', { track: 'nowhere' }).ok).toBe(false);
  });

  it('lets the host remove someone for good', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a');
    join(l, 'b');
    expect(kick(l, 'b', 'a').ok).toBe(false);
    expect(kick(l, 'a', 'b').ok).toBe(true);
    expect(join(l, 'b').ok).toBe(false);
  });
});

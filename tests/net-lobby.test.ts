import { describe, expect, it } from 'vitest';
import { ROLE } from '../src/sim/index';
import {
  addMember,
  allReady,
  callerAction,
  callerOf,
  captainOf,
  createLobby,
  lockedBy,
  pickFrame,
  placesFree,
  settleFrames,
  switchTeam,
  kick,
  lobbyView,
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
  it('puts people on the emptier team, each with the frame they picked', () => {
    const l = createLobby('AAAAA', 'v', 2);
    expect(join(l, 'a', { loadout: { faction: 2, role: ROLE.MF } }).ok).toBe(true);
    expect(l.host).toBe('a');
    expect(l.factions[0]).toBe(2);
    const b = join(l, 'b', { loadout: { faction: 2, role: ROLE.MF } });
    expect(b.ok && b.member.side).toBe(1);
    expect(b.ok && b.member.role).toBe(ROLE.MF);
    // The other team already flies Mirage: b keeps the default.
    expect(l.factions[1]).not.toBe(2);
    // Two of a frame on one team is allowed while picking: Ready sorts it out.
    const c = join(l, 'c', { loadout: { faction: 4, role: ROLE.MF } });
    expect(c.ok && c.member.side).toBe(0);
    expect(c.ok && c.member.role).toBe(ROLE.MF);
  });

  it('locks a frame in with Ready: first to lock keeps it, Not ready lets go', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a', { loadout: { faction: 0, role: ROLE.FW } });
    join(l, 'b');
    join(l, 'c', { loadout: { faction: 0, role: ROLE.FW } }); // a's team, a's frame
    expect(setReady(l, 'c', true).ok).toBe(true); // c locks the forward first
    expect(lockedBy(l, 0, ROLE.FW)?.pid).toBe('c');
    const refused = setReady(l, 'a', true);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.text).toMatch(/c has locked in that frame/);
    // Locked in, c can't change frame until Not ready.
    expect(pickFrame(l, 'c', ROLE.DF).ok).toBe(false);
    // a looks at other frames freely, picks one nobody has locked, and readies.
    expect(pickFrame(l, 'a', ROLE.DF).ok).toBe(true);
    expect(pickFrame(l, 'a', ROLE.MF).ok).toBe(true);
    expect(setReady(l, 'a', true).ok).toBe(true);
    expect(setReady(l, 'b', true).ok).toBe(true);
    expect(allReady(l)).toBe(true);
    // Everyone ready means no team has two of a frame.
    for (const side of [0, 1]) {
      const roles = l.members.filter((m) => m.side === side).map((m) => m.role);
      expect(new Set(roles).size).toBe(roles.length);
    }
    expect(setReady(l, 'c', false).ok).toBe(true);
    expect(pickFrame(l, 'c', ROLE.DF).ok).toBe(true);
  });

  it('gives anyone whose pick is taken a free frame when the race is built', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a', { loadout: { faction: 0, role: ROLE.MF } });
    join(l, 'b');
    join(l, 'c', { loadout: { faction: 0, role: ROLE.MF } }); // a late arrival on a's frame
    setReady(l, 'a', true);
    const cpu = settleFrames(l);
    expect(l.members.find((m) => m.pid === 'a')!.role).toBe(ROLE.MF);
    expect(l.members.find((m) => m.pid === 'c')!.role).not.toBe(ROLE.MF);
    expect(cpu[0]).toHaveLength(1);
    expect(cpu[1]).toHaveLength(2);
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

  it('lets a captain pick their team\'s faction, and the host either team\'s', () => {
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
    // b captains team 2 but is not the host: not team 1's faction.
    expect(setFaction(l, 'b', 4, 0).ok).toBe(false);
    expect(setFaction(l, 'b', 4).ok).toBe(true);
    expect(l.factions[1]).toBe(4);
    // The host can set the other team's, but still not to the same faction as theirs.
    expect(setFaction(l, 'a', 3, 1).ok).toBe(false);
    expect(setFaction(l, 'a', 1, 1).ok).toBe(true);
    expect(l.factions[1]).toBe(1);
    // A team of computer pilots: only the host can set it.
    const solo = createLobby('BBBBB', 'v', 0);
    join(solo, 'h');
    const empty = 1 - solo.members[0].side;
    expect(setFaction(solo, 'h', 4, empty).ok).toBe(true);
    expect(solo.factions[empty]).toBe(4);
  });

  it('moves to the other team when it has a place, with the frame picked there', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a');
    join(l, 'b');
    setReady(l, 'a', true);
    expect(switchTeam(l, 'a', 1, ROLE.DF).ok).toBe(true);
    expect(l.members[0].side).toBe(1);
    expect(l.members[0].role).toBe(ROLE.DF);
    expect(l.members[0].ready).toBe(false); // a move unlocks
    for (const p of ['c', 'd', 'e']) join(l, p); // team 1 fills up: c, d and e
    expect(placesFree(l, 0)).toBe(0);
    const refused = switchTeam(l, 'a', 0);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.text).toBe('That team is full');
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

  it('holds places for a squad following its leader, and refuses a squad with no room', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'x');
    join(l, 'y');
    switchTeam(l, 'y', 0);
    const lead = join(l, 'lead', { squad: { id: 'SQ', size: 3 } }, 0);
    expect(lead.ok).toBe(true);
    if (!lead.ok) return;
    // Two places held on the leader's team, out of reach of anyone else.
    expect(placesFree(l, lead.member.side)).toBe(0);
    expect(placesFree(l, lead.member.side, 'SQ')).toBe(2);
    expect(lobbyView(l, 'lobby', -1, null, []).sides[lead.member.side].held).toBe(2);
    expect(callerOf(l, lead.member.side)).toBeUndefined();
    const m1 = join(l, 'm1', { squad: { id: 'SQ', size: 3 } }, 1000);
    expect(m1.ok && m1.member.side).toBe(lead.member.side);
    const other = join(l, 'z', {}, 1000);
    expect(other.ok && other.member.side).not.toBe(lead.member.side);
    // Holds lapse: after 20 s the last held place is anyone's.
    const late = join(l, 'w', {}, 30000);
    expect(late.ok).toBe(true);
    const l2 = createLobby('BBBBB', 'v');
    for (const p of ['a', 'b', 'c', 'd']) join(l2, p);
    const squad = join(l2, 's', { squad: { id: 'S2', size: 3 } });
    expect(squad.ok).toBe(false);
    expect(!squad.ok && squad.text).toMatch(/1 free place; your squad has 3/);
  });

  it('takes a repeated shot-calling ask once, and ignores answers to settled asks', () => {
    const l = createLobby('AAAAA', 'v');
    join(l, 'a');
    join(l, 'b');
    const side = l.members.find((m) => m.pid === 'a')!.side;
    switchTeam(l, 'b', side, ROLE.DF); // a and b on one team, with one computer pilot
    join(l, 'c'); // alone on the other
    const holder = callerOf(l, side)!.pid;
    const asker = holder === 'a' ? 'b' : 'a';
    const first = callerAction(l, asker, 'ask');
    expect(first.ok && first.note).toBe('asked');
    const again = callerAction(l, asker, 'ask');
    expect(again.ok && again.note).toBeUndefined(); // not sent to the shot caller a second time
    expect(callerAction(l, holder, 'accept').ok).toBe(true);
    expect(callerOf(l, side)!.pid).toBe(asker);
    // A second Hand it over, from a dialog that was already answered: nothing happens, no error.
    const late = callerAction(l, holder, 'accept');
    expect(late.ok).toBe(true);
    expect(callerOf(l, side)!.pid).toBe(asker);
  });

  it('puts a late follower with its squad, as a member and not a second leader', () => {
    const l = createLobby('AAAAA', 'v');
    const lead = join(l, 'lead', { squad: { id: 'SQ', size: 3 } }, 0);
    if (!lead.ok) throw new Error('leader refused');
    expect(lead.member.side).toBe(0);
    // The holds lapse before the members arrive, and strangers take places on both teams.
    join(l, 'a', {}, 25000);
    join(l, 'b', {}, 25000);
    expect(l.members.filter((x) => x.side === 0)).toHaveLength(2);
    expect(l.callers[0]).toBe('lead');
    // On its own the follower would take the emptier side (team 2); it joins its squad instead.
    const late = join(l, 'm1', { squad: { id: 'SQ', size: 3, follow: true } }, 26000);
    if (!late.ok) throw new Error('follower refused');
    expect(late.member.side).toBe(0);
    expect(l.holds).toHaveLength(0); // a second leader would have held places...
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

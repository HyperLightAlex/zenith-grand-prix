import { describe, expect, it } from 'vitest';
import { ROLE } from '../src/sim/index';
import { SquadCore } from '../src/net/squadCore';
import type { SquadServerMessages } from '../src/net/protocol';

function squad() {
  let clock = 0;
  const inbox: Array<[string, keyof SquadServerMessages, unknown]> = [];
  const core: SquadCore = new SquadCore('SQUAD', {
    send: (pid, type, msg) => inbox.push([pid, type, msg]),
    broadcast: (type, msg) => core.members.forEach((m) => inbox.push([m.pid, type, msg])),
    now: () => clock,
  });
  return { core, inbox, tick: (ms: number) => ((clock += ms), core.update()) };
}

describe('squads', () => {
  it('holds three at most and makes the first the leader', () => {
    const { core } = squad();
    expect(core.join('a', 'A', { faction: 2, role: ROLE.FW }).ok).toBe(true);
    expect(core.join('b', 'B', { faction: 0, role: ROLE.FW }).ok).toBe(true);
    expect(core.join('c', 'C', { faction: 0, role: ROLE.FW }).ok).toBe(true);
    expect(core.join('d', 'D', { faction: 0, role: ROLE.FW }).ok).toBe(false);
    expect(core.leader).toBe('a');
    // One team, the leader's faction.
    expect(core.view().faction).toBe(2);
  });

  it('lets everyone pick any frame, and shows when two have the same', () => {
    const { core } = squad();
    core.join('a', 'A', { faction: 0, role: ROLE.MF });
    core.join('b', 'B', { faction: 0, role: ROLE.MF });
    const roles = () => Object.fromEntries(core.view().members.map((m) => [m.pid, m.role]));
    expect(roles()).toEqual({ a: ROLE.MF, b: ROLE.MF });
    expect(core.clashes()).toBe(true);
    core.message('b', 'loadout', { faction: 0, role: ROLE.DF });
    expect(roles()).toEqual({ a: ROLE.MF, b: ROLE.DF });
    expect(core.clashes()).toBe(false);
    // The leader's faction is the squad's.
    core.message('a', 'loadout', { faction: 3, role: ROLE.MF });
    expect(core.view().faction).toBe(3);
  });

  it('sends members after their leader, and hands the lead on when the leader goes', () => {
    const { core, inbox, tick } = squad();
    core.join('a', 'A', { faction: 0, role: ROLE.FW });
    core.join('b', 'B', { faction: 0, role: ROLE.MF });
    core.message('b', 'go', { code: 'K7Q2X' });
    expect(inbox.some(([, t]) => t === 'follow')).toBe(false);
    core.message('a', 'go', { code: 'K7Q2X' });
    expect(inbox.filter(([, t]) => t === 'follow').map(([p]) => p)).toEqual(['b']);
    core.leave('a');
    expect(core.leader).toBe('b');
    core.drop('b');
    tick(61_000);
    expect(core.empty).toBe(true);
  });

  it('takes someone who joins while the leader is in a room in after them, once they have the squad', () => {
    const { core, inbox, tick } = squad();
    core.join('a', 'A', { faction: 0, role: ROLE.FW });
    core.join('b', 'B', { faction: 0, role: ROLE.MF });
    core.message('a', 'go', { code: 'K7Q2X' });
    tick(16);
    inbox.length = 0;
    // The third arrives: the squad's view first, then where to follow.
    core.join('c', 'C', { faction: 0, role: ROLE.DF });
    expect(inbox.some(([p, t]) => p === 'c' && t === 'follow')).toBe(false);
    tick(16);
    const toC = inbox.filter(([p]) => p === 'c').map(([, t, m]) => [t, m]);
    expect(toC.map(([t]) => t)).toEqual(['welcome', 'squad', 'follow']);
    expect(toC[2][1]).toEqual({ code: 'K7Q2X', size: 3 });
    // Nobody else is sent again, and a reconnect is not sent (it has its own way back).
    expect(inbox.filter(([p, t]) => p !== 'c' && t === 'follow')).toHaveLength(0);
    inbox.length = 0;
    core.drop('c');
    core.join('c', 'C', { faction: 0, role: ROLE.DF });
    tick(16);
    expect(inbox.some(([, t]) => t === 'follow')).toBe(false);
  });

  it('stops taking newcomers in once the leader is out of the room, or someone else leads', () => {
    const { core, inbox, tick } = squad();
    core.join('a', 'A', { faction: 0, role: ROLE.FW });
    core.message('a', 'go', { code: 'K7Q2X' });
    // A member saying they are home does not count: only the leader.
    core.join('b', 'B', { faction: 0, role: ROLE.MF });
    core.message('b', 'home', {});
    tick(16);
    expect(inbox.filter(([p, t]) => p === 'b' && t === 'follow')).toHaveLength(1);
    core.message('a', 'home', {});
    core.join('c', 'C', { faction: 0, role: ROLE.DF });
    tick(16);
    expect(inbox.some(([p, t]) => p === 'c' && t === 'follow')).toBe(false);
    // A new leader starts with no room.
    core.message('a', 'go', { code: 'ABCDE' });
    core.leave('a');
    expect(core.room).toBeNull();
  });

  it('sends the squad again to anyone who asks (joined, and not heard it yet)', () => {
    const { core, inbox, tick } = squad();
    core.join('a', 'A', { faction: 0, role: ROLE.FW });
    tick(200);
    inbox.length = 0;
    tick(200);
    expect(inbox.some(([, t]) => t === 'squad')).toBe(false);
    core.message('a', 'view', {});
    tick(200);
    expect(inbox.filter(([, t]) => t === 'squad').map(([p]) => p)).toEqual(['a']);
  });
});

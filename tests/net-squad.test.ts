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
});

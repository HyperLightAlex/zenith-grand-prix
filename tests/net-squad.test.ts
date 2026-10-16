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

  it('gives everyone their own position, and swaps them only when asked and accepted', () => {
    const { core, tick } = squad();
    core.join('a', 'A', { faction: 0, role: ROLE.MF });
    core.join('b', 'B', { faction: 0, role: ROLE.MF }); // taken: the first open one
    core.join('c', 'C', { faction: 0, role: ROLE.DF });
    const roles = () => Object.fromEntries(core.view().members.map((m) => [m.pid, m.role]));
    expect(roles()).toEqual({ a: ROLE.MF, b: ROLE.FW, c: ROLE.DF });
    // All three taken: picking someone's position asks them, once however often.
    core.message('a', 'position', { role: ROLE.DF });
    core.message('a', 'position', { role: ROLE.DF });
    core.message('a', 'loadout', { faction: 0, role: ROLE.DF });
    tick(10);
    expect(core.view().swaps).toEqual([['a', 'c']]);
    expect(roles().a).toBe(ROLE.MF);
    // A no, then an answer to an ask that is already settled: nothing changes.
    core.message('c', 'swapAnswer', { from: 'a', accept: false });
    core.message('c', 'swapAnswer', { from: 'a', accept: true });
    expect(roles()).toEqual({ a: ROLE.MF, b: ROLE.FW, c: ROLE.DF });
    // Asked again and accepted: they trade.
    core.message('a', 'position', { role: ROLE.DF });
    core.message('c', 'swapAnswer', { from: 'a', accept: true });
    expect(roles()).toEqual({ a: ROLE.DF, b: ROLE.FW, c: ROLE.MF });
    // The leader asks like anyone else.
    core.message('a', 'position', { role: ROLE.FW });
    expect(core.view().swaps).toEqual([['a', 'b']]);
    // Someone leaving takes their asks with them, and frees their position.
    core.leave('b');
    expect(core.view().swaps).toEqual([]);
    core.message('c', 'position', { role: ROLE.FW });
    expect(roles()).toEqual({ a: ROLE.DF, c: ROLE.FW });
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

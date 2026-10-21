import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PILOT_NAMES } from '../src/net/factions';
import { PORTRAITS, READY_COUNTDOWN, cleanLooks, cleanPortrait, pilotChange, type SquadServerMessages } from '../src/net/protocol';
import { encodeBuild, stockBuild } from '../src/custom/mechBuild';
import { SquadCore } from '../src/net/squadCore';
import { ROLE } from '../src/sim/index';
import { TestNet } from './netHarness';

describe('a pilot on the wire', () => {
  it('takes a portrait only as a whole number in the gallery, and the faction pilot otherwise', () => {
    expect(cleanPortrait(0)).toBe(0);
    expect(cleanPortrait(PORTRAITS - 1)).toBe(PORTRAITS - 1);
    for (const bad of [PORTRAITS, -1, -2, 1.5, '3', null, undefined, NaN, {}]) expect(cleanPortrait(bad)).toBe(-1);
  });

  it('checks a pilot change as a join is checked', () => {
    expect(pilotChange({ callsign: '  Comet  ', portrait: 4 })).toEqual({ ok: true, callsign: 'Comet', portrait: 4, looks: ['', '', ''] });
    expect(pilotChange({ callsign: 'Comet', portrait: 99 })).toEqual({ ok: true, callsign: 'Comet', portrait: -1, looks: ['', '', ''] });
    expect(pilotChange({ callsign: 'ab', portrait: 1 }).ok).toBe(false);
    expect(pilotChange({ portrait: 1 }).ok).toBe(false);
  });

  it('has a portrait painted for every place in the gallery', () => {
    const painted = readdirSync(new URL('../src/client/ui/art/', import.meta.url)).filter((f) => /^pilot-.*\.webp$/.test(f));
    expect(painted.length).toBe(PORTRAITS);
  });
});

describe('a pilot in a room', () => {
  it('shows each person with their portrait, seats them in it, and keeps the faction pilots for the computer', () => {
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.FW }, portrait: 7 });
    const b = net.join('b', { loadout: { faction: 1, role: ROLE.MF } });
    net.run(200);
    const seen = Object.fromEntries((a.lobby?.players ?? []).map((p) => [p.pid, p.portrait]));
    expect(seen).toEqual({ a: 7, b: -1 });
    net.core.message('a', 'settings', { match: 0 });
    // A change before the race: the race wears it.
    net.core.message('a', 'pilot', { callsign: 'Comet', portrait: 3 });
    net.run(200);
    for (const c of [a, b]) c.send('ready', { ready: true });
    net.run((READY_COUNTDOWN + 1) * 1000, () => net.core.phase === 'race');
    net.run(300);
    const seats = a.start!.seats;
    expect(seats[a.start!.seat]).toMatchObject({ human: true, name: 'Comet', portrait: 3 });
    expect(seats[b.start!.seat]).toMatchObject({ human: true, name: 'b', portrait: -1 });
    for (const s of seats.filter((x) => !x.human)) {
      expect(s.portrait).toBe(-1);
      expect(s.name).toBe(PILOT_NAMES[a.start!.factions[s.team]][s.role]);
    }
    // And the mechs carry it, as everyone's copy of the race does.
    expect(a.predictor!.confirmed.mechs[a.start!.seat].portrait).toBe(3);
    expect(b.predictor!.confirmed.mechs[a.start!.seat].portrait).toBe(3);
  });

  it('races each person in the custom mech they fly in their frame, and drops one that does not read', () => {
    const mine = encodeBuild({ ...stockBuild(2), name: 'Storm Kite' });
    const net = new TestNet({ laps: 1 });
    const a = net.join('a', { loadout: { faction: 0, role: ROLE.MF }, looks: cleanLooks(['', mine, '']) });
    const b = net.join('b', { loadout: { faction: 1, role: ROLE.FW }, looks: cleanLooks(['c1/not-a-mech', '', '']) });
    net.run(200);
    net.core.message('a', 'settings', { match: 0 });
    for (const c of [a, b]) c.send('ready', { ready: true });
    net.run((READY_COUNTDOWN + 1) * 1000, () => net.core.phase === 'race');
    net.run(300);
    const seats = a.start!.seats;
    expect(seats[a.start!.seat].look).toBe(mine);
    expect(seats[b.start!.seat].look).toBe('');
    for (const s of seats.filter((x) => !x.human)) expect(s.look).toBe('');
    expect(b.predictor!.confirmed.mechs[a.start!.seat].look).toBe(mine);
  });

  it('takes new custom mechs with a pilot change, for the next race', () => {
    const net = new TestNet();
    net.join('a', { loadout: { faction: 0, role: ROLE.DF } });
    const mine = encodeBuild(stockBuild(4));
    net.core.message('a', 'pilot', { callsign: 'Comet', portrait: 1, looks: ['', '', mine] });
    expect(net.core.lobby.members[0].looks).toEqual(['', '', mine]);
    net.core.message('a', 'pilot', { callsign: 'Comet', portrait: 1, looks: 'nonsense' as unknown as string[] });
    expect(net.core.lobby.members[0].looks).toEqual(['', '', '']);
  });

  it('refuses a pilot change with a callsign a join would refuse, and says why', () => {
    const net = new TestNet();
    const a = net.join('a', { portrait: 2 });
    net.run(200);
    net.core.message('a', 'pilot', { callsign: 'x', portrait: 5 });
    net.run(200);
    expect(a.notices.some((n) => n.startsWith('Callsign'))).toBe(true);
    expect(a.lobby?.players.find((p) => p.pid === 'a')).toMatchObject({ callsign: 'a', portrait: 2 });
  });

  it('keeps a returning device\'s portrait up to date', () => {
    const net = new TestNet();
    net.join('a', { portrait: 2 });
    net.run(200);
    net.core.join({ pid: 'a2', deviceId: 'a', callsign: 'a', portrait: 9, loadout: { faction: 0, role: 0 } });
    net.run(200);
    expect(net.core.lobby.members.find((m) => m.deviceId === 'a')?.portrait).toBe(9);
  });
});

describe('a pilot in a squad', () => {
  function squad() {
    const inbox: Array<[string, keyof SquadServerMessages, unknown]> = [];
    const core: SquadCore = new SquadCore('SQUAD', {
      send: (pid, type, msg) => inbox.push([pid, type, msg]),
      broadcast: (type, msg) => core.members.forEach((m) => inbox.push([m.pid, type, msg])),
      now: () => 0,
    });
    return { core, inbox };
  }

  it('shows each member with their portrait, keeps it over a reconnect, and takes a change', () => {
    const { core, inbox } = squad();
    core.join('a', 'Alpha', { faction: 0, role: ROLE.FW }, 4);
    core.join('b', 'Bravo', { faction: 0, role: ROLE.MF });
    const faces = () => Object.fromEntries(core.view().members.map((m) => [m.pid, [m.callsign, m.portrait]]));
    expect(faces()).toEqual({ a: ['Alpha', 4], b: ['Bravo', -1] });
    // A reconnect says nothing of the pilot: it is kept.
    core.join('a', '', { faction: 0, role: 0 });
    expect(faces().a).toEqual(['Alpha', 4]);
    core.message('a', 'pilot', { callsign: 'Comet', portrait: 11 });
    expect(faces().a).toEqual(['Comet', 11]);
    core.message('b', 'pilot', { callsign: 'no', portrait: 1 });
    expect(faces().b).toEqual(['Bravo', -1]);
    expect(inbox.some(([pid, t]) => pid === 'b' && t === 'notice')).toBe(true);
  });
});

describe('your pilot on this device', () => {
  afterEach(() => vi.unstubAllGlobals());
  async function fresh(store = new Map<string, string>()) {
    vi.resetModules();
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
    return { id: await import('../src/client/net/identity'), store };
  }

  it('is made on the first run, a made-up callsign and a portrait, and kept', async () => {
    const { id, store } = await fresh();
    expect(id.callsign()).toBe('');
    expect(id.callsignChosen()).toBe(false);
    const name = id.pilotName();
    expect(id.MADE_CALLSIGNS).toContain(name);
    expect(id.portrait()).toBeGreaterThanOrEqual(0);
    expect(id.portrait()).toBeLessThan(PORTRAITS);
    const again = await fresh(store);
    expect(again.id.pilotName()).toBe(name);
    expect(again.id.portrait()).toBe(id.portrait());
  });

  it('wears the callsign you choose in place of the made-up one, and the portrait you pick', async () => {
    const { id, store } = await fresh();
    expect(id.setCallsign('Comet 7')).toBeNull();
    expect(id.pilotName()).toBe('Comet 7');
    expect(id.callsignChosen()).toBe(true);
    id.setPortrait(12);
    id.setPortrait(PORTRAITS + 3); // not a portrait: ignored
    expect(id.portrait()).toBe(12);
    expect((await fresh(store)).id.portrait()).toBe(12);
  });

  it('makes no made-up callsign that is a faction pilot\'s', async () => {
    const { id } = await fresh();
    const pilots = new Set(PILOT_NAMES.flat());
    for (const c of id.MADE_CALLSIGNS) expect(pilots.has(c)).toBe(false);
  });

  it('starts again from a record it cannot read', async () => {
    const store = new Map([['zgp.pilot', '{"v":1,"portrait":"x"']]);
    const { id } = await fresh(store);
    expect(id.portrait()).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(store.get('zgp.pilot')!).v).toBe(1);
  });
});

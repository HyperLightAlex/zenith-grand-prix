// Quick Play's search, through the real room server (Colyseus) on a local
// port: a search is put into a room of its playlist with places for its
// party, a squad follows its leader onto one team, and a lobby folds into
// a fuller one.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import { defineRooms } from '../server/rooms';
import { NET_PROTOCOL, type JoinOptions, type LobbyView, type SquadTicket } from '../src/net/protocol';

let server: Server;
let endpoint = '';

beforeAll(async () => {
  process.env.QUIET = '1';
  const httpServer = http.createServer();
  server = new Server({ transport: new WebSocketTransport({ server: httpServer }), greet: false, gracefullyShutdown: false });
  defineRooms(server);
  await server.listen(0, '127.0.0.1');
  endpoint = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

const options = (name: string, party: number, squad?: SquadTicket): JoinOptions & { quick?: string } => ({
  version: 'dev',
  protocol: NET_PROTOCOL,
  callsign: name,
  deviceId: `device-${name}`.padEnd(12, 'x'),
  loadout: { faction: 0, role: 0 },
  squad,
  [`fit${party}`]: true,
});

interface Seat {
  room: Room;
  lobby: () => LobbyView | null;
  requeued: () => string | null;
}

async function search(playlist: string, name: string, party = 1, squad?: SquadTicket): Promise<Seat> {
  const room = await new Client(endpoint).joinOrCreate('quick', { ...options(name, party, squad), quick: playlist });
  return listen(room);
}

function listen(room: Room): Seat {
  let view: LobbyView | null = null;
  let again: string | null = null;
  room.onMessage('lobby', (v: LobbyView) => (view = v));
  room.onMessage('requeue', (m: { playlist: string }) => (again = m.playlist));
  room.onMessage('*', () => {});
  return { room, lobby: () => view, requeued: () => again };
}

const until = async (what: () => boolean, ms = 4000): Promise<void> => {
  const t0 = Date.now();
  while (!what()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("Quick Play's search", () => {
  it('puts people searching a playlist in one room, on opposite teams, and another playlist in another', async () => {
    const a = await search('team-series', 'Ada');
    const b = await search('team-series', 'Bix');
    const c = await search('sprint', 'Cal');
    expect(b.room.roomId).toBe(a.room.roomId);
    expect(c.room.roomId).not.toBe(a.room.roomId);
    await until(() => a.lobby()?.players.length === 2 && !!c.lobby());
    expect(a.lobby()!.quick).toBe('team-series');
    expect(a.lobby()!.settings).toMatchObject({ mode: 'teams', match: 1 });
    expect(a.lobby()!.players.map((p) => p.side).sort()).toEqual([0, 1]);
    expect(c.lobby()!.settings.mode).toBe('sprint');
    // Not a playlist: no room is made.
    await expect(search('nope', 'Dee')).rejects.toThrow();
    expect((await matchMaker.query({ name: 'quick' })).length).toBe(2);
    for (const s of [a, b, c]) await s.room.leave();
  });

  it('finds a squad a room with a whole team free, and its members follow onto that team', async () => {
    // Two alone, one on each team: two places a side, so no team for three.
    const a = await search('team-race', 'Ada');
    const b = await search('team-race', 'Bix');
    expect(b.room.roomId).toBe(a.room.roomId);
    const ticket = { id: 'SQUAD', size: 3 };
    const lead = await search('team-race', 'Lea', 3, ticket);
    expect(lead.room.roomId).not.toBe(a.room.roomId);
    // The others come in by the room's code, as a squad's members do.
    const follow = (name: string) => new Client(endpoint).joinById(lead.room.roomId, options(name, 1, { ...ticket, follow: true })).then(listen);
    const m1 = await follow('Moe');
    const m2 = await follow('Nan');
    await until(() => lead.lobby()?.players.length === 3);
    const sides = lead.lobby()!.players.map((p) => p.side);
    expect(new Set(sides).size).toBe(1);
    // Someone alone is put with the squad (three people) rather than the two: the fullest room that fits. They face the squad.
    const solo = await search('team-race', 'Sol');
    expect(solo.room.roomId).toBe(lead.room.roomId);
    await until(() => lead.lobby()?.players.length === 4);
    expect(lead.lobby()!.players.find((p) => p.callsign === 'Sol')!.side).toBe(1 - sides[0]);
    // A second squad of three: the other team has one person on it, so they get a room of their own.
    const other = await search('team-race', 'Oto', 3, { id: 'OTHER', size: 3 });
    expect(other.room.roomId).not.toBe(lead.room.roomId);
    expect(other.room.roomId).not.toBe(a.room.roomId);
    for (const s of [a, b, lead, m1, m2, solo, other]) await s.room.leave();
  });

  it('folds a lobby that opens again with few people into a fuller one', async () => {
    const big1 = await search('sprint-series', 'Ada');
    const big2 = await search('sprint-series', 'Bix');
    const big3 = await search('sprint-series', 'Cal');
    // A room of its own for one more (as if they had been racing while the others gathered).
    const lone = listen(await new Client(endpoint).create('quick', { ...options('Lon', 1), quick: 'sprint-series' }));
    expect(lone.room.roomId).not.toBe(big1.room.roomId);
    await until(() => !!lone.lobby() && big1.lobby()?.players.length === 3);
    // Its match is over and it is a lobby again: the server looks for a fuller one.
    const local = matchMaker.getLocalRoomById(lone.room.roomId) as unknown as { core: { matches: number } };
    local.core.matches++;
    await until(() => lone.requeued() !== null);
    expect(lone.requeued()).toBe('sprint-series');
    // Searching again puts them with the three.
    await lone.room.leave();
    const again = await search('sprint-series', 'Lon');
    expect(again.room.roomId).toBe(big1.room.roomId);
    await until(() => big1.lobby()?.players.length === 4);
    // The fuller room is not folded the other way.
    const kept = matchMaker.getLocalRoomById(big1.room.roomId) as unknown as { core: { matches: number } };
    kept.core.matches++;
    await new Promise((r) => setTimeout(r, 300));
    expect(big1.requeued()).toBeNull();
    for (const s of [big1, big2, big3, again]) await s.room.leave();
  });
});

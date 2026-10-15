// Bot players for a running server: in each room one bot creates it, the
// rest join by its code, they ready up and race to the flag, keeping to the
// racing line with the odd button press. It checks the whole online path the
// browser takes (matchmaking, the room, inputs, prediction, keyframes) and,
// with several rooms, it is the load test.
//
//   npx tsx tools/bots.ts                       2 bots, 1 room, localhost:8090
//   npx tsx tools/bots.ts 6 4                   4 rooms of 6 bots
//   npx tsx tools/bots.ts 2 1 https://zgp.example.com
//   MATCH=1 plays a best of 3 (default: a single race). A server started
//   with TEST_LAPS=1 runs one-lap races, for a quick check.

import { Client, type Room } from '@colyseus/sdk';
import { CLASSES, PHASE, clamp, emptyInput, kappaAt, type MechInput } from '../src/sim/index';
import { Predictor } from '../src/net/prediction';
import { NET_PROTOCOL, type JoinOptions, type LobbyView, type MatchStartMsg, type RoundEndMsg, type TickMsg } from '../src/net/protocol';

const perRoom = Number(process.argv[2] ?? 2);
const rooms = Number(process.argv[3] ?? 1);
const endpoint = process.argv[4] ?? 'http://localhost:8090';
const version = process.env.BUILD ?? 'dev';

interface Stats {
  rounds: number;
  ticks: number;
  resyncs: number;
  maxAhead: number;
  started: number;
}

function steer(p: Predictor, rand: () => number, pad: MechInput): MechInput {
  const m = p.predicted.mechs[p.seat];
  const c = CLASSES[m.role];
  const look = 14 + m.speed * 0.35;
  const kappa = kappaAt(p.track, m.s + m.speed * 0.12);
  const omegaMax = Math.min(c.turnMax, c.grip / Math.max(m.speed, 24)) * Math.min(1, m.speed / 12) || 1;
  const headingWant = clamp(Math.atan2(-m.d, look), -0.5, 0.5);
  const rate = kappa * m.speed * Math.cos(m.heading) + (headingWant - m.heading) * 3.2;
  pad.mx = clamp(rate / omegaMax, -1, 1);
  pad.throttle = 1;
  pad.buttons = rand() < 0.02 ? 1 << Math.floor(rand() * 6) : 0;
  return { ...pad };
}

async function bot(name: string, code: string | null, seed: number): Promise<{ code: string; done: Promise<Stats> }> {
  const client = new Client(endpoint);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const opts: JoinOptions = {
    version,
    protocol: NET_PROTOCOL,
    callsign: name,
    deviceId: `bot-${seed}-${Math.random().toString(36).slice(2, 10)}`,
    loadout: { faction: seed % 5, role: (seed % 3) as 0 | 1 | 2 },
  };
  const room: Room = code ? await client.joinById(code, opts) : await client.create('race', opts);
  const stats: Stats = { rounds: 0, ticks: 0, resyncs: 0, maxAhead: 0, started: Date.now() };
  let predictor: Predictor | null = null;
  let lobby: LobbyView | null = null;
  const pad = emptyInput();
  let timer: ReturnType<typeof setInterval> | null = null;
  const done = new Promise<Stats>((resolve) => {
    let set = false;
    room.onMessage('lobby', (v: LobbyView) => {
      lobby = v;
      if (!code && !set && v.phase === 'lobby') {
        set = true;
        room.send('settings', { match: Number(process.env.MATCH ?? 0) });
      }
      const me = v.players.find((p) => p.callsign === name);
      if (v.phase === 'lobby' && me && !me.ready && v.players.length >= perRoom) room.send('ready', { ready: true });
    });
    room.onMessage('matchStart', (m: MatchStartMsg) => {
      predictor = new Predictor(m);
      if (timer) clearInterval(timer);
      let last = performance.now();
      let acc = 0;
      timer = setInterval(() => {
        const p = predictor;
        if (!p) return;
        const now = performance.now();
        acc += Math.min(0.25, (now - last) / 1000);
        last = now;
        while (acc >= 1 / 60) {
          acc -= 1 / 60;
          if (p.confirmed.phase === PHASE.FINISHED) p.runOn();
          else if (p.canStep()) p.step(steer(p, rand, pad));
        }
        const out = p.takeOutbox();
        if (out) room.send('input', out);
        stats.maxAhead = Math.max(stats.maxAhead, p.ahead);
      }, 1000 / 60);
    });
    room.onMessage('tick', (t: TickMsg) => {
      if (!predictor) return;
      predictor.applyTicks(t);
      stats.ticks += t.i.length;
      if (predictor.needResync) {
        stats.resyncs++;
        predictor.needResync = false;
        room.send('resync', {});
      }
    });
    room.onMessage('key', (k: { race: Parameters<Predictor['applyKey']>[0] }) => predictor?.applyKey(k.race));
    room.onMessage('roundEnd', (r: RoundEndMsg) => {
      stats.rounds++;
      if (r.match.winner >= 0) room.send('continue', {});
      else setTimeout(() => room.send('continue', {}), 2000);
    });
    room.onMessage('lobbyAgain', () => {
      if (timer) clearInterval(timer);
      void room.leave(true);
      resolve(stats);
    });
    for (const t of ['welcome', 'pong', 'notice', 'error', 'swapAsk', 'callerAsk']) room.onMessage(t, () => {});
  });
  void lobby;
  return { code: room.roomId, done };
}

async function main(): Promise<void> {
  console.log(`${rooms} room(s) of ${perRoom} bot(s) on ${endpoint}`);
  const all: Array<Promise<Stats>> = [];
  for (let r = 0; r < rooms; r++) {
    const first = await bot(`Bot ${r}-0`, null, r * 10 + 1);
    all.push(first.done);
    for (let i = 1; i < perRoom; i++) {
      const b = await bot(`Bot ${r}-${i}`, first.code, r * 10 + i + 1);
      all.push(b.done);
    }
    console.log(`room ${first.code}: ${perRoom} in`);
  }
  const t0 = Date.now();
  const results = await Promise.all(all);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const resyncs = results.reduce((a, s) => a + s.resyncs, 0);
  const ahead = Math.max(...results.map((s) => s.maxAhead));
  console.log(`done in ${secs}s: ${results.length} bots, rounds ${results.map((s) => s.rounds).join(',')}, resyncs ${resyncs}, most inputs ahead ${ahead}`);
  process.exit(resyncs > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
// Zenith GP's server: the built game as static files, and the online rooms
// and squads (Colyseus) beside it, on one port. Run it behind your domain
// the way Dead End Dash's server runs.
//
// Endpoints:  GET /             the built game, from dist/
//             GET /health       "ok" (also /healthz)
//             /matchmake/...    Colyseus: create and join rooms by code
//             WS  /<id>/<room>  Colyseus: a room's connection
//
// Settings come from the environment: see server/config.ts.

import http from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { HOST, HOPS, ORIGINS, PORT, ROOMS_ONLY, STATIC_DIR, playerAddress, readBuild } from './config';
import { staticFiles } from './static';
import { RaceRoom, setServerBuild } from './raceRoom';
import { SquadRoom } from './squadRoom';
import { codesInUse } from './codes';
import { log } from './log';

// One misbehaving connection must never take the server down.
process.on('unhandledRejection', (reason) => log('unhandled rejection', reason instanceof Error ? reason.message : String(reason)));

const build = readBuild();
setServerBuild(build);

const httpServer = http.createServer();
const transport = new WebSocketTransport({
  server: httpServer,
  pingInterval: 4000,
  pingMaxRetries: 3,
  // Keyframes go out, not in: what comes in is small.
  maxPayload: 16 * 1024,
  verifyClient: ORIGINS.length ? (info: { origin: string }) => ORIGINS.includes(info.origin) : undefined,
});
const files = ROOMS_ONLY ? null : staticFiles(STATIC_DIR);

const gameServer = new Server({
  transport,
  greet: false,
  express: (app) => {
    app.use((req: http.IncomingMessage, res: http.ServerResponse) => {
      const path = (req.url || '/').split('?')[0];
      if (path === '/health' || path === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
        res.end('ok');
        return;
      }
      if (files) files(req, res);
      else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
      }
    });
  },
});
gameServer.define('race', RaceRoom);
gameServer.define('squad', SquadRoom);

/**
 * Codes are an invitation, not a secret: what stands between a stranger and
 * a room is the size of the code space and how fast codes can be tried. With
 * FORWARDED_HOPS set, one address may try 30 codes a minute.
 */
const tries = new Map<string, { n: number; since: number }>();
const TRIES_PER_MINUTE = 30;
function refused(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const path = (req.url || '/').split('?')[0];
  if (!path.startsWith('/matchmake/')) return false;
  const origin = String(req.headers.origin || '');
  if (ORIGINS.length && origin && !ORIGINS.includes(origin)) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 403, error: 'Not allowed from this site' }));
    return true;
  }
  if (!path.startsWith('/matchmake/joinById')) return false;
  const who = playerAddress(req.headers, req.socket.remoteAddress);
  if (who === null) return false;
  const now = Date.now();
  const t = tries.get(who);
  if (!t || now - t.since > 60_000) tries.set(who, { n: 1, since: now });
  else if (++t.n > TRIES_PER_MINUTE) {
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
    res.end(JSON.stringify({ code: 429, error: 'Too many room codes tried. Wait a minute.' }));
    return true;
  }
  if (tries.size > 10_000) tries.clear();
  return false;
}

await gameServer.listen(PORT, HOST);
// In front of everything Colyseus put on the server: the limits above.
const handlers = httpServer.listeners('request') as Array<(req: http.IncomingMessage, res: http.ServerResponse) => void>;
httpServer.removeAllListeners('request');
httpServer.on('request', (req, res) => {
  if (refused(req, res)) return;
  for (const h of handlers) h.call(httpServer, req, res);
});

console.log(`Zenith GP server listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (${ROOMS_ONLY ? 'rooms only' : 'static: ' + STATIC_DIR}; build ${build})`);
if (HOPS === null) console.log('Per-address limits are off. Set FORWARDED_HOPS (0 if players connect straight to this server) to turn them on.');
setInterval(() => log('codes in use', codesInUse()), 10 * 60 * 1000).unref();

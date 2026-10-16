// The server's settings, from the environment, as Dead End Dash's server
// takes them:
//
//   PORT             default 8090
//   HOST             default 0.0.0.0
//   ALLOWED_ORIGINS  comma-separated; default: any origin
//   FORWARDED_HOPS   where a player's address is: 0 if players connect
//                    straight to this server, 1 behind one proxy you run
//                    (then read from X-Forwarded-For), and so on. Unset, the
//                    per-address limit on trying room codes is off.
//   ROOMS_ONLY=1     serve the rooms and the health check, no game files
//   STATIC_DIR       the built game (default: dist/ beside this server)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The repository: this file runs from server/ (tsx) or dist-server/ (built). */
export const REPO = path.resolve(here, '..');

export const PORT = Number(process.env.PORT) || 8090;
export const HOST = process.env.HOST || '0.0.0.0';
export const ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
export const ROOMS_ONLY = process.env.ROOMS_ONLY === '1';
export const STATIC_DIR = path.resolve(process.env.STATIC_DIR || path.join(REPO, 'dist'));

export function parseHops(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 8 ? n : null;
}
export const HOPS = parseHops(process.env.FORWARDED_HOPS);
/** Testing only: races of this many laps. */
export const TEST_LAPS = Number(process.env.TEST_LAPS) > 0 ? Math.min(9, Number(process.env.TEST_LAPS)) : undefined;

/**
 * The game build this server serves, as the client knows itself. A room
 * remembers the build that made it, and everyone in it must be on the same.
 */
export function readBuild(): string {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(STATIC_DIR, 'build.json'), 'utf8')) as { build?: string };
    if (typeof info.build === 'string' && info.build) return info.build;
  } catch {
    /* no build yet: a development server */
  }
  return 'dev';
}

/** A player's address, per FORWARDED_HOPS, or null when it cannot be known. */
export function playerAddress(headers: Record<string, string | string[] | undefined>, socketAddress: string | undefined): string | null {
  if (HOPS === null) return null;
  if (HOPS === 0) return socketAddress ?? null;
  const raw = headers['x-forwarded-for'];
  const list = (Array.isArray(raw) ? raw.join(',') : raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length >= HOPS ? list[list.length - HOPS] : null;
}

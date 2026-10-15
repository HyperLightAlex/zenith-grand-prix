// Who you are online, for the MVP: a callsign you choose and a random device
// key this browser keeps. There are no accounts. The device key is never
// shown to anyone: rooms know you by it, so a reload or a dropped connection
// gets your seat back.
//
// ?player=2 (any word) on the URL keeps a separate identity, so two tabs of
// one browser can be two players when testing.

import { callsignProblem, cleanCallsign } from '../../net/protocol';

const q = new URLSearchParams(location.search);
const suffix = (q.get('player') ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
const key = (k: string) => (suffix ? `${k}.${suffix}` : k);

function read(k: string): string | null {
  try {
    return localStorage.getItem(key(k));
  } catch {
    return null;
  }
}

function write(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(key(k));
    else localStorage.setItem(key(k), v);
  } catch {
    /* private window: kept for this visit only */
  }
}

let memoryDevice = '';

export function deviceId(): string {
  let id = read('zgp.device');
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('') + (suffix ? '-' + suffix : '');
    id = id.padEnd(16, 'x');
    write('zgp.device', id);
    if (!read('zgp.device')) memoryDevice = memoryDevice || id;
  }
  return memoryDevice || id;
}

export function callsign(): string {
  const c = read('zgp.callsign');
  return c && !callsignProblem(c) ? c : '';
}

/** Save a callsign; returns why it cannot be used, or null. */
export function setCallsign(name: string): string | null {
  const c = cleanCallsign(name);
  const problem = callsignProblem(c);
  if (problem) return problem;
  write('zgp.callsign', c);
  return null;
}

/** Per tab: the room and squad to go back to after a reload. */
export interface Resume {
  room?: { code: string; token: string };
  squad?: { code: string; token: string };
}

export function readResume(): Resume {
  try {
    return JSON.parse(sessionStorage.getItem(key('zgp.resume')) || '{}') as Resume;
  } catch {
    return {};
  }
}

export function writeResume(r: Resume): void {
  try {
    sessionStorage.setItem(key('zgp.resume'), JSON.stringify(r));
  } catch {
    /* nothing to do */
  }
}

// Who you are: your pilot (a callsign and a portrait, shown on your seat
// offline and online) and a random device key this browser keeps. There are
// no accounts. The device key is never shown to anyone: rooms know you by
// it, so a reload or a dropped connection gets your seat back.
//
// ?player=2 (any word) on the URL keeps a separate identity, so two tabs of
// one browser can be two players when testing.

import { PORTRAITS, callsignProblem, cleanCallsign, cleanPortrait } from '../../net/protocol';

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

// ---- the pilot -------------------------------------------------------------------

/**
 * The rest of the pilot, kept beside the callsign: the portrait, and the
 * callsign made up on the first run, which the seat wears until one is
 * chosen. (The pilot's custom mechs will live here too.)
 */
interface PilotRecord {
  v: 1;
  /** An index into the portraits (protocol PORTRAITS). */
  portrait: number;
  /** Worn until a callsign is chosen. */
  made: string;
}

/**
 * Made-up callsigns for a new pilot, none of them a faction pilot's (those
 * are the computer pilots' names: Kite, Shrike, Sirocco and the rest).
 */
export const MADE_CALLSIGNS = [
  'Comet', 'Falcon', 'Vega', 'Nova', 'Rook', 'Jinx', 'Echo', 'Blaze', 'Orbit', 'Rally', 'Sable', 'Flint', 'Zephyr', 'Quill', 'Ember',
  'Halo', 'Kestrel', 'Lumen', 'Pike', 'Rune', 'Talon', 'Vortex', 'Wren', 'Bolt', 'Cinder', 'Glint', 'Nyx', 'Corsair', 'Mistral', 'Raven',
];

let memoryPilot: PilotRecord | null = null;

function pilotRecord(): PilotRecord {
  if (memoryPilot) return memoryPilot;
  let rec: PilotRecord | null = null;
  try {
    const raw = JSON.parse(read('zgp.pilot') ?? 'null') as Partial<PilotRecord> | null;
    if (raw && raw.v === 1) {
      const portrait = cleanPortrait(raw.portrait);
      const made = typeof raw.made === 'string' && !callsignProblem(raw.made) ? raw.made : '';
      if (portrait >= 0 && made) rec = { v: 1, portrait, made };
    }
  } catch {
    /* made again below */
  }
  if (!rec) {
    const pick = new Uint32Array(2);
    crypto.getRandomValues(pick);
    rec = { v: 1, portrait: pick[0] % PORTRAITS, made: MADE_CALLSIGNS[pick[1] % MADE_CALLSIGNS.length] };
    savePilot(rec);
  }
  return rec;
}

function savePilot(rec: PilotRecord): void {
  write('zgp.pilot', JSON.stringify(rec));
  // A private window keeps it for this visit only.
  memoryPilot = read('zgp.pilot') ? null : rec;
}

/** The name your seat wears: your callsign, or the one made up for you until you choose. */
export function pilotName(): string {
  return callsign() || pilotRecord().made;
}

/** Whether you have chosen a callsign (online asks for one until you have). */
export function callsignChosen(): boolean {
  return callsign() !== '';
}

/** Your portrait: an index into the portraits (protocol PORTRAITS). */
export function portrait(): number {
  return pilotRecord().portrait;
}

export function setPortrait(i: number): void {
  const p = cleanPortrait(i);
  if (p < 0) return;
  savePilot({ ...pilotRecord(), portrait: p });
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

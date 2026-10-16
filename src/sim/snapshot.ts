// Copying a race and putting it back. A RaceState is plain data (numbers,
// booleans, strings, arrays and objects of them, nothing else), so a copy is
// complete: a copy run on with the same inputs stays identical to the
// original, tick for tick. Online play depends on that: the server sends a
// copy of its race to a client that joins late or drifts, and the client's
// prediction keeps a confirmed copy and replays its own inputs on top of it.

import type { RaceState } from './types';

type Data = number | string | boolean | null | undefined | Data[] | { [k: string]: Data };

/** A deep copy of plain data. */
export function copyData<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = copyData(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v as Record<string, unknown>) out[k] = copyData((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Make `dst` equal to `src`, reusing `dst`'s own objects and arrays wherever
 * the shapes match, so anything holding a reference into `dst` (a view
 * holding a mech, say) sees the new values. Returns `dst`.
 */
export function assignData<T>(dst: T, src: T): T {
  if (src === null || typeof src !== 'object' || dst === null || typeof dst !== 'object') return copyData(src);
  if (Array.isArray(src)) {
    if (!Array.isArray(dst)) return copyData(src);
    const d = dst as unknown as Data[];
    const s = src as unknown as Data[];
    for (let i = 0; i < s.length; i++) {
      const sv = s[i];
      d[i] = sv !== null && typeof sv === 'object' && i < d.length ? (assignData(d[i], sv) as Data) : copyData(sv);
    }
    d.length = s.length;
    return dst;
  }
  if (Array.isArray(dst)) return copyData(src);
  const d = dst as unknown as Record<string, Data>;
  const s = src as unknown as Record<string, Data>;
  for (const k in s) {
    const sv = s[k];
    d[k] = sv !== null && typeof sv === 'object' && k in d ? (assignData(d[k], sv) as Data) : copyData(sv);
  }
  for (const k in d) if (!(k in s)) delete d[k];
  return dst;
}

/** A complete, independent copy of a race. */
export function cloneRace(race: RaceState): RaceState {
  return copyData(race);
}

/** Put `src` into `dst` in place (see assignData). */
export function restoreRace(dst: RaceState, src: RaceState): RaceState {
  return assignData(dst, src);
}

/**
 * A short fingerprint of the parts of a race that drift first if two copies
 * disagree: every mech's position, speed, armour, Drive and action, the
 * tick and the random number state. Two races with the same checksum at the
 * same tick are, for practical purposes, the same race.
 */
export function raceChecksum(race: RaceState): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    // Exact: the shortest decimal that reads back as the same double.
    const s = String(n);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193);
  };
  mix(race.tick);
  mix(race.rng);
  mix(race.phase);
  for (const m of race.mechs) {
    mix(m.s);
    mix(m.d);
    mix(m.speed);
    mix(m.facing);
    mix(m.h);
    mix(m.hp);
    mix(m.drive);
    mix(m.act);
    mix(m.actT);
    mix(m.cells);
    mix(m.target);
  }
  mix(race.projectiles.length);
  return h >>> 0;
}

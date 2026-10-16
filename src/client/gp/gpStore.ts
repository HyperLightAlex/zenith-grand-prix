// Grand Prix saves, kept in this browser: the cup and the season in
// progress (one of each), the medals won and the Zenith Cups.

import type { GpEvent, GpKind, Medal } from '../../gp/grandPrix';
import { betterMedal } from '../../gp/grandPrix';

const KEYS = { cup: 'zgp.gp.cup', season: 'zgp.gp.season', medals: 'zgp.gp.medals', cups: 'zgp.gp.cupsWon', difficulty: 'zgp.gp.difficulty' } as const;

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(k: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: this visit only */
  }
}

export function loadEvent(kind: GpKind): GpEvent | null {
  const ev = read<GpEvent | null>(KEYS[kind], null);
  return ev && ev.v === 1 && ev.kind === kind && Array.isArray(ev.rounds) ? ev : null;
}

export function saveEvent(ev: GpEvent): void {
  write(KEYS[ev.kind], ev);
}

export function clearEvent(kind: GpKind): void {
  write(KEYS[kind], null);
}

/** Best medal per cup, per difficulty. */
export function medals(): Record<string, Record<number, Medal>> {
  return read(KEYS.medals, {});
}

export function awardMedal(cup: string, difficulty: number, medal: Medal | null): void {
  if (!medal) return;
  const all = medals();
  const mine = (all[cup] ??= {});
  mine[difficulty] = betterMedal(mine[difficulty], medal) ?? medal;
  write(KEYS.medals, all);
}

/** Zenith Cups won, per difficulty. */
export function cupsWon(): Record<number, number> {
  return read(KEYS.cups, {});
}

export function awardZenithCup(difficulty: number): void {
  const all = cupsWon();
  all[difficulty] = (all[difficulty] ?? 0) + 1;
  write(KEYS.cups, all);
}

export function difficulty(): number {
  const d = read<number>(KEYS.difficulty, 1);
  return d === 0 || d === 2 ? d : 1;
}

export function setDifficulty(d: number): void {
  write(KEYS.difficulty, d);
}

// Grand Prix saves, kept in this browser: the cup, the Grand Tour and the
// season in progress (one of each), the Sprint series's cup and Tour, the
// medals won (each series's apart) and the Zenith Cups.

import type { GpEvent, GpSlot, Medal } from '../../gp/grandPrix';
import { betterMedal, kindOf, slotOf, sprintSlot } from '../../gp/grandPrix';

const KEYS = {
  cup: 'zgp.gp.cup',
  tour: 'zgp.gp.tour',
  season: 'zgp.gp.season',
  'sprint-cup': 'zgp.gp.sprintCup',
  'sprint-tour': 'zgp.gp.sprintTour',
  medals: 'zgp.gp.medals',
  sprintMedals: 'zgp.gp.sprintMedals',
  cups: 'zgp.gp.cupsWon',
  difficulty: 'zgp.gp.difficulty',
} as const;

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

export function loadEvent(slot: GpSlot): GpEvent | null {
  const ev = read<GpEvent | null>(KEYS[slot], null);
  if (!ev || ev.v !== 1 || ev.kind !== kindOf(slot) || !Array.isArray(ev.rounds)) return null;
  // (A Sprint event only where the Sprint series keeps its own, and only whole.)
  if (!!ev.sprint !== sprintSlot(slot)) return null;
  if (ev.sprint && (!Array.isArray(ev.sprint.edge) || ev.rounds.some((r) => !r.sprint))) return null;
  // (Saved before the pilots' ledger, or spoilt: the ceremony's readout starts it again.)
  if (ev.pilots !== undefined && !Array.isArray(ev.pilots)) delete ev.pilots;
  return ev;
}

export function saveEvent(ev: GpEvent): void {
  write(KEYS[slotOf(ev)], ev);
}

export function clearEvent(slot: GpSlot): void {
  write(KEYS[slot], null);
}

/** Best medal per cup (and the Grand Tour), per difficulty. */
export function medals(): Record<string, Record<number, Medal>> {
  return read(KEYS.medals, {});
}

export function awardMedal(cup: string, difficulty: number, medal: Medal | null, sprint = false): void {
  if (!medal) return;
  const all = sprint ? sprintMedals() : medals();
  const mine = (all[cup] ??= {});
  mine[difficulty] = betterMedal(mine[difficulty], medal) ?? medal;
  write(sprint ? KEYS.sprintMedals : KEYS.medals, all);
}

/** The Sprint series's best medal per Sprint Cup (and the Sprint Tour), per difficulty: kept apart from the team series's. */
export function sprintMedals(): Record<string, Record<number, Medal>> {
  return read(KEYS.sprintMedals, {});
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

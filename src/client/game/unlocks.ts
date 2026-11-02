// What the Grand Prix earns for your mech (docs/CUSTOMIZATION.md, "Earned in
// the Grand Prix"): livery patterns, finishes, a wear and victory poses, each
// opened by a medal in a cup or the Grand Tour, or the Zenith Cup. The rest
// are open from the start. Kept as the medals are (gp/gpStore.ts): nothing of
// its own is saved, so what is open always follows from what was won.

import { CUPS, MEDALS, TOUR_ID, type Medal } from '../../gp/grandPrix';
import { FINISHES, PATTERNS, WEARS, FINISH_NAMES, PATTERN_NAMES, WEAR_NAMES } from '../../custom/mechBuild';
import { VICTORY_IDS, VICTORY_NAMES } from '../render/mech/victoryPoses';

/** What has been won: the best medal per cup (and the Grand Tour) per difficulty, and Zenith Cups per difficulty. */
export interface Progress {
  byCup: Record<string, Record<number, Medal>>;
  season: Record<number, number>;
}

export type UnlockKind = 'pattern' | 'finish' | 'wear' | 'pose';

export interface Unlock {
  kind: UnlockKind;
  /** The item's id (PATTERNS, FINISHES, WEARS, VICTORY_IDS). */
  id: string;
  /** What opens it: a medal (this good or better) in a cup or the Grand Tour, or a Zenith Cup. */
  need: { cup: string; medal: Medal } | { zenithCup: true };
}

/** The earned ones, easiest first. Anything not listed is open from the start. */
export const UNLOCKS: readonly Unlock[] = [
  { kind: 'pattern', id: 'chevrons', need: { cup: 'horizon', medal: 'bronze' } },
  { kind: 'finish', id: 'gloss', need: { cup: 'horizon', medal: 'silver' } },
  { kind: 'pose', id: 'point', need: { cup: 'horizon', medal: 'gold' } },
  { kind: 'pattern', id: 'checks', need: { cup: 'frontier', medal: 'bronze' } },
  { kind: 'pattern', id: 'splinter', need: { cup: 'frontier', medal: 'silver' } },
  { kind: 'finish', id: 'flake', need: { cup: 'frontier', medal: 'gold' } },
  { kind: 'pattern', id: 'hex', need: { cup: 'ascent', medal: 'bronze' } },
  { kind: 'pattern', id: 'slashes', need: { cup: 'ascent', medal: 'silver' } },
  { kind: 'finish', id: 'pearl', need: { cup: 'ascent', medal: 'gold' } },
  { kind: 'pattern', id: 'digital', need: { cup: TOUR_ID, medal: 'bronze' } },
  { kind: 'pose', id: 'bow', need: { cup: TOUR_ID, medal: 'gold' } },
  { kind: 'wear', id: 'veteran', need: { zenithCup: true } },
  { kind: 'pose', id: 'hips', need: { zenithCup: true } },
];

const rank = (m: Medal | undefined) => (m ? MEDALS.indexOf(m) : 9);

/** The best medal won in a cup (or the Grand Tour), at any difficulty. */
function best(p: Progress, cup: string): Medal | undefined {
  return Object.values(p.byCup[cup] ?? {}).sort((a, b) => rank(a) - rank(b))[0];
}

/** Whether an unlock's need has been met. */
export function earned(u: Unlock, p: Progress): boolean {
  if ('zenithCup' in u.need) return Object.values(p.season).some((n) => n > 0);
  return rank(best(p, u.need.cup)) <= rank(u.need.medal);
}

/** Why an item cannot be chosen yet (what opens it), or null if it can. */
export function lockedWhy(kind: UnlockKind, id: string, p: Progress): string | null {
  const u = UNLOCKS.find((x) => x.kind === kind && x.id === id);
  return u && !earned(u, p) ? howTo(u) : null;
}

/** What opens it, in words: "A bronze in the Horizon Cup", "Gold in the Grand Tour", "Win the Zenith Cup". */
export function howTo(u: Unlock): string {
  if ('zenithCup' in u.need) return 'Win the Zenith Cup in a season';
  const where = u.need.cup === TOUR_ID ? 'the Grand Tour' : `the ${CUPS.find((c) => c.id === (u.need as { cup: string }).cup)?.name ?? 'cup'}`;
  const medal = u.need.medal;
  return medal === 'gold' ? `Gold in ${where}` : `A ${medal} or better in ${where}`;
}

/** What it is called: "Chevrons (pattern)". */
export function unlockName(u: Unlock): string {
  const kind = { pattern: 'pattern', finish: 'finish', wear: 'wear', pose: 'victory pose' }[u.kind];
  const name =
    u.kind === 'pattern'
      ? PATTERN_NAMES[u.id as (typeof PATTERNS)[number]]
      : u.kind === 'finish'
        ? FINISH_NAMES[u.id as (typeof FINISHES)[number]]
        : u.kind === 'wear'
          ? WEAR_NAMES[u.id as (typeof WEARS)[number]]
          : VICTORY_NAMES[u.id as (typeof VICTORY_IDS)[number]];
  return `${name} (${kind})`;
}

/** What winning took from locked to open: the unlocks earned in `after` but not in `before`. */
export function newlyEarned(before: Progress, after: Progress): Unlock[] {
  return UNLOCKS.filter((u) => earned(u, after) && !earned(u, before));
}

/** Of a list of ids, those open (in order). */
export function openOf<T extends string>(kind: UnlockKind, ids: readonly T[], p: Progress): T[] {
  return ids.filter((id) => lockedWhy(kind, id, p) === null);
}

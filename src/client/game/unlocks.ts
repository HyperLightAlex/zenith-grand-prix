// What the Grand Prix earns for your mech (docs/CUSTOMIZATION.md, "Earned in
// the Grand Prix"): livery patterns, finishes, paints, a wear and victory
// poses, each opened by a medal in a cup or the Grand Tour, or the Zenith
// Cup; and the Sprint series's own, by its medals (its Sprint Cups and the
// Sprint Tour), for a custom mech of any frame. The rest are open from the
// start. Kept as the medals are (gp/gpStore.ts): nothing of its own is
// saved, so what is open always follows from what was won.

import { CUPS, MEDALS, TOUR_ID, type Medal } from '../../gp/grandPrix';
import { FINISHES, PAINTS, PATTERNS, WEARS, FINISH_NAMES, PATTERN_NAMES, WEAR_NAMES } from '../../custom/mechBuild';
import { VICTORY_IDS, VICTORY_NAMES } from '../render/mech/victoryPoses';

/** What has been won: the best medal per cup (and the Grand Tour) per difficulty, Zenith Cups per difficulty, and the Sprint series's medals. */
export interface Progress {
  byCup: Record<string, Record<number, Medal>>;
  season: Record<number, number>;
  /** The Sprint series's best medal per Sprint Cup (and the Sprint Tour, TOUR_ID), per difficulty: a ladder of its own. */
  sprint?: Record<string, Record<number, Medal>>;
}

export type UnlockKind = 'pattern' | 'finish' | 'wear' | 'pose' | 'paint';

export interface Unlock {
  kind: UnlockKind;
  /** The item's id (PATTERNS, FINISHES, WEARS, VICTORY_IDS; a paint by its name in PAINTS). */
  id: string;
  /** What opens it: a medal (this good or better) in a cup or the Grand Tour (`sprint`: the Sprint series's), or a Zenith Cup. */
  need: { cup: string; medal: Medal; sprint?: true } | { zenithCup: true };
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
  // The Sprint series's ladder.
  { kind: 'pattern', id: 'flames', need: { cup: 'horizon', medal: 'bronze', sprint: true } },
  { kind: 'paint', id: 'Electric Blue', need: { cup: 'horizon', medal: 'silver', sprint: true } },
  { kind: 'pose', id: 'clap', need: { cup: 'horizon', medal: 'gold', sprint: true } },
  { kind: 'pattern', id: 'pinstripes', need: { cup: 'frontier', medal: 'bronze', sprint: true } },
  { kind: 'finish', id: 'chrome', need: { cup: 'frontier', medal: 'silver', sprint: true } },
  { kind: 'paint', id: 'Hot Pink', need: { cup: 'frontier', medal: 'gold', sprint: true } },
  { kind: 'pattern', id: 'lightning', need: { cup: 'ascent', medal: 'bronze', sprint: true } },
  { kind: 'paint', id: 'Acid Green', need: { cup: 'ascent', medal: 'silver', sprint: true } },
  { kind: 'finish', id: 'chameleon', need: { cup: 'ascent', medal: 'gold', sprint: true } },
  { kind: 'pattern', id: 'sunburst', need: { cup: TOUR_ID, medal: 'bronze', sprint: true } },
  { kind: 'pose', id: 'pump', need: { cup: TOUR_ID, medal: 'silver', sprint: true } },
  { kind: 'pose', id: 'champion', need: { cup: TOUR_ID, medal: 'gold', sprint: true } },
  { kind: 'paint', id: 'Champion Gold', need: { cup: TOUR_ID, medal: 'gold', sprint: true } },
];

const rank = (m: Medal | undefined) => (m ? MEDALS.indexOf(m) : 9);

/** The best medal won in a cup (or the Grand Tour; `sprint`: the Sprint series's), at any difficulty. */
function best(p: Progress, cup: string, sprint = false): Medal | undefined {
  const won = sprint ? (p.sprint ?? {}) : p.byCup;
  return Object.values(won[cup] ?? {}).sort((a, b) => rank(a) - rank(b))[0];
}

/** Whether an unlock's need has been met. */
export function earned(u: Unlock, p: Progress): boolean {
  if ('zenithCup' in u.need) return Object.values(p.season).some((n) => n > 0);
  return rank(best(p, u.need.cup, !!u.need.sprint)) <= rank(u.need.medal);
}

/** Whether the series an unlock is earned in is the Sprint's. */
export function sprintUnlock(u: Unlock): boolean {
  return 'cup' in u.need && !!u.need.sprint;
}

/** Why an item cannot be chosen yet (what opens it), or null if it can. */
export function lockedWhy(kind: UnlockKind, id: string, p: Progress): string | null {
  const u = UNLOCKS.find((x) => x.kind === kind && x.id === id);
  return u && !earned(u, p) ? howTo(u) : null;
}

/** What opens it, in words: "A bronze in the Horizon Cup", "Gold in the Sprint Tour", "Win the Zenith Cup". */
export function howTo(u: Unlock): string {
  if ('zenithCup' in u.need) return 'Win the Zenith Cup in a season';
  const need = u.need;
  const cupName = CUPS.find((c) => c.id === need.cup)?.name ?? 'Cup';
  const where = need.cup === TOUR_ID ? (need.sprint ? 'the Sprint Tour' : 'the Grand Tour') : `the ${need.sprint ? cupName.replace(/ Cup$/, ' Sprint Cup') : cupName}`;
  return need.medal === 'gold' ? `Gold in ${where}` : `A ${need.medal} or better in ${where}`;
}

/** What it is called: "Chevrons (pattern)". */
export function unlockName(u: Unlock): string {
  const kind = { pattern: 'pattern', finish: 'finish', wear: 'wear', pose: 'victory pose', paint: 'paint' }[u.kind];
  const name =
    u.kind === 'pattern'
      ? PATTERN_NAMES[u.id as (typeof PATTERNS)[number]]
      : u.kind === 'finish'
        ? FINISH_NAMES[u.id as (typeof FINISHES)[number]]
        : u.kind === 'wear'
          ? WEAR_NAMES[u.id as (typeof WEARS)[number]]
          : u.kind === 'paint'
            ? u.id
            : VICTORY_NAMES[u.id as (typeof VICTORY_IDS)[number]];
  return `${name} (${kind})`;
}

/** Whether a paint (an index into PAINTS) is open: every paint but the ones the Grand Prix earns. */
export function paintOpen(i: number, p: Progress): boolean {
  const paint = PAINTS[i];
  return !!paint && lockedWhy('paint', paint.name, p) === null;
}

/** What winning took from locked to open: the unlocks earned in `after` but not in `before`. */
export function newlyEarned(before: Progress, after: Progress): Unlock[] {
  return UNLOCKS.filter((u) => earned(u, after) && !earned(u, before));
}

/** Of a list of ids, those open (in order). */
export function openOf<T extends string>(kind: UnlockKind, ids: readonly T[], p: Progress): T[] {
  return ids.filter((id) => lockedWhy(kind, id, p) === null);
}

// The hangar's stat bars, worked out from the frames themselves rather than
// set by hand, so a change to an attack shows up in the readout.

import { ATTACKS, COMBO_CANCEL_DELAY, GUARD_REDUCTION, TICK_RATE, attackTotal, type AttackDef, type ClassDef } from '../../sim/config';

/** Damage an attack does if every bullet or pellet lands. */
function volley(a: AttackDef): number {
  return a.damage * (a.shot ? a.shot.count * a.shot.pellets : 1);
}

/**
 * The primary attack's damage per second, kept up for as long as there is
 * someone to hit: its string thrown whole (each blow but the last cancelled
 * into the next as early as it can be), then again. `guarded`: into a raised
 * guard, which only a guard break gets through.
 */
export function primaryDps(c: ClassDef, guarded = false): number {
  let ticks = 0;
  let dmg = 0;
  for (let i = c.primary; i >= 0; i = ATTACKS[i].next) {
    const a = ATTACKS[i];
    ticks += a.next >= 0 ? a.windup + a.active + COMBO_CANCEL_DELAY : attackTotal(a) + a.cooldown;
    dmg += volley(a) * (guarded && !a.guardBreak ? GUARD_REDUCTION : 1);
  }
  return dmg / (ticks / TICK_RATE);
}

/** The secondary attack's damage per second, used every time its cooldown allows. */
export function secondaryDps(c: ClassDef): number {
  const a = ATTACKS[c.secondary];
  return volley(a) / ((attackTotal(a) + a.cooldown) / TICK_RATE);
}

/**
 * Hitting power: what the frame's attacks do in a second, attack speed and
 * all. Half against an open rival and half against a guard (which is where
 * a guard breaker earns its keep), plus half the secondary's share.
 */
export function hittingPower(c: ClassDef): number {
  return (primaryDps(c) + primaryDps(c, true)) / 2 + secondaryDps(c) / 2;
}

/**
 * Combat range: the furthest the frame can hit from, units centre to edge. A
 * gun's range; a blow's reach plus the ground its lunge covers.
 */
export function combatRange(c: ClassDef): number {
  let best = 0;
  for (const idx of [c.primary, c.secondary]) {
    for (let i = idx; i >= 0; i = ATTACKS[i].next) {
      const a = ATTACKS[i];
      if (a.shot) {
        best = Math.max(best, a.shot.range);
        continue;
      }
      // A lunge steps in through the wind-up (a quarter of it for the long
      // ones, which commit as they go live) and runs through the live frames.
      const lunge = a.advance >= 60 ? a.advance * (a.windup * 0.25 + a.active) : a.advance * (a.windup + a.active);
      best = Math.max(best, a.reach + lunge / TICK_RATE);
    }
  }
  return best;
}

/** The five bars, 0 to 1, in the order the hangar shows them. */
export const STAT_LABELS = ['Top speed', 'Armour', 'Handling', 'Hitting power', 'Combat range'] as const;

export function frameStats(c: ClassDef, all: readonly ClassDef[]): number[] {
  const power = Math.max(...all.map(hittingPower));
  const range = Math.max(...all.map(combatRange));
  return [(c.topSpeed - 130) / 30, c.maxHp / 2200, (c.grip - 60) / 40, hittingPower(c) / power, combatRange(c) / range];
}

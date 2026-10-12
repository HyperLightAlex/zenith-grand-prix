// Wind-up tells: which heavy blows are coming, when they land, and what
// answers them. Read straight from the race state each frame, so the
// renderer (closing rings), the HUD (warnings over name plates) and the
// sound all agree, and nothing new has to travel from the simulation.
import { ACT, ATTACKS, COMBO_CANCEL_DELAY, PARRY_WINDOW, isActive, type MechState } from '../../sim/index';

/**
 * parry: a melee blow a guard raised at the last moment turns.
 * dodge: a guard breaker; only a dash's invulnerability gets out of it.
 * block: a heavy gun; a guard takes most of it, nothing parries it.
 */
export type TellKind = 'parry' | 'dodge' | 'block';

export interface Tell {
  kind: TellKind;
  /** Ticks until the blow lands. */
  left: number;
  /** The attack that will land. */
  attack: number;
  /** Stable for one blow, from the first warning to the impact: mech and impact tick. */
  key: number;
  /** Inside the parry window: a guard raised now turns a 'parry' blow. */
  now: boolean;
}

function kindOf(attack: number): TellKind {
  const a = ATTACKS[attack];
  if (a.kind !== 'melee') return 'block';
  return a.guardBreak || a.noParry ? 'dodge' : 'parry';
}

/**
 * The heavy blow `m` is winding up, or has committed to as the next move of
 * its string (a queued finisher shows from the moment it is queued, which is
 * the earliest it can be read), or null.
 */
export function tellOf(m: MechState, tick: number): Tell | null {
  if (!isActive(m) || m.act !== ACT.ATTACK) return null;
  const a = ATTACKS[m.attack];
  let attack = -1;
  let left = 0;
  if (a.heavy && m.actT < a.windup) {
    attack = m.attack;
    left = a.windup - m.actT;
  } else if (m.comboQueued && a.next >= 0 && ATTACKS[a.next].heavy) {
    attack = a.next;
    left = Math.max(1, a.windup + a.active + COMBO_CANCEL_DELAY - m.actT) + ATTACKS[a.next].windup;
  }
  if (attack < 0) return null;
  return { kind: kindOf(attack), left, attack, key: m.id * 10_000_000 + tick + left, now: left <= PARRY_WINDOW };
}

export const TELL_COLOR: Record<TellKind, number> = {
  parry: 0xffd25a,
  dodge: 0xff3b3b,
  block: 0xff8a2a,
};

export const TELL_LABEL: Record<TellKind, string> = {
  parry: 'Parry',
  dodge: 'Dodge',
  block: 'Guard',
};

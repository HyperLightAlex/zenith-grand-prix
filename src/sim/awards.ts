// Support points: what a midfielder or a defender (and anyone, for an
// assist) earns the team by doing its job. They go into the team's round
// score next to placing and knockout points.
//
// Each pilot's total is capped per race (rules.supportCap), so a strong
// support race is worth about a second place and never a win. Most awards can
// only score once every rules.awardCooldown seconds against the same rival,
// so a burst of carbine fire is one Back-up, not six.

import { AEGIS_SAVED, ATK, AWARD, AWARD_COUNT, AWARD_POINTS, BODYGUARD_RANGE, LEADOUT_TICKS, MODE, ROLE, TICK_RATE, type Award } from './config';
import { distance, inPlay } from './core';
import type { Track } from './track';
import type { MechState, RaceState } from './types';

/** Rival slots per award kind in MechState.awardTick. */
export const AWARD_SLOTS = 8;
const NEVER = -1e9;

export function freshAwardTicks(): number[] {
  return new Array(AWARD_COUNT * AWARD_SLOTS).fill(NEVER);
}

export function freshHurtBy(): number[] {
  return new Array(AWARD_SLOTS).fill(NEVER);
}

/**
 * Give `m` an award. `victim` is the rival it was earned against (-1 for
 * none); with `cooldown`, the same kind against the same rival cannot score
 * again for rules.awardCooldown seconds. Returns the points actually given
 * (the cap may cut them, to nothing).
 */
export function award(race: RaceState, m: MechState, kind: Award, victim = -1, points: number = AWARD_POINTS[kind], cooldown = true): number {
  if (m.retired) return 0;
  const rules = race.rules;
  if (cooldown && victim >= 0 && victim < AWARD_SLOTS) {
    const k = kind * AWARD_SLOTS + victim;
    if (race.tick - m.awardTick[k] < rules.awardCooldown * TICK_RATE) return 0;
    m.awardTick[k] = race.tick;
  }
  const pts = Math.min(points, rules.supportCap - m.support);
  if (pts <= 0) return 0;
  m.support += pts;
  m.awardPts[kind] += pts;
  race.events.push({ type: 'award', mech: m.id, kind, points: pts, victim });
  return pts;
}

function ownForward(race: RaceState, m: MechState): MechState | null {
  for (const o of race.mechs) if (o.team === m.team && o.role === ROLE.FW && o !== m && inPlay(o)) return o;
  return null;
}

/** What applyHit knew about the victim before the blow landed. */
export interface HitFacts {
  attack: number;
  damage: number;
  blocked: boolean;
  /** The blow turned an attack into a stagger. */
  broke: boolean;
  /** ...and that attack was still winding up. */
  inWindup: boolean;
  /** The victim's lock and mode before the blow. */
  victimTarget: number;
  victimMode: number;
  /** Damage an Aegis kept off the victim. */
  prevented: number;
}

/** A blow (or a pellet, or a round) connected. */
export function onHit(race: RaceState, track: Track, att: MechState, victim: MechState, f: HitFacts): void {
  if (att.team === victim.team) return;
  if (f.damage > 0.5 && att.id < AWARD_SLOTS) victim.hurtBy[att.id] = race.tick;

  // An Aegis that keeps enough off its team pays its caster once.
  if (f.prevented > 0 && victim.shieldBy >= 0) {
    const caster = race.mechs[victim.shieldBy];
    caster.aegisSaved += f.prevented;
    if (!caster.aegisPaid && caster.aegisSaved >= AEGIS_SAVED) {
      caster.aegisPaid = true;
      award(race, caster, AWARD.AEGIS, -1, AWARD_POINTS[AWARD.AEGIS], false);
    }
  }

  const fighting = f.victimMode === MODE.BATTLE && f.victimTarget >= 0;
  const onTeammate = fighting && f.victimTarget !== att.id && race.mechs[f.victimTarget].team === att.team;

  if (att.role === ROLE.MF) {
    if ((f.attack === ATK.MF_PULSE || f.attack === ATK.MF_KICK) && f.broke && f.inWindup) award(race, att, AWARD.INTERRUPT, victim.id);
    else if (onTeammate && !f.blocked) award(race, att, AWARD.BACKUP, victim.id);
    if (victim.role === ROLE.FW) {
      att.pressure += f.damage;
      const need = race.rules.pressureDamage;
      while (att.pressure >= need) {
        att.pressure -= need;
        award(race, att, AWARD.PRESSURE, victim.id, AWARD_POINTS[AWARD.PRESSURE], false);
      }
    }
  } else if (att.role === ROLE.DF) {
    const fw = ownForward(race, att);
    if (fw && fighting && f.victimTarget === fw.id) {
      if (f.broke) award(race, att, AWARD.SAVE, victim.id);
      else if (!f.blocked) award(race, att, AWARD.PEEL, victim.id);
    }
  }

  // A defender that takes a blow on the guard (or turns it) beside its forward.
  if (f.blocked && victim.role === ROLE.DF) bodyguard(race, track, victim, att);
}

/** A defender blocked or parried `att`: worth a point if its forward is close by. */
export function bodyguard(race: RaceState, track: Track, df: MechState, att: MechState): void {
  if (df.role !== ROLE.DF || att.team === df.team) return;
  const fw = ownForward(race, df);
  if (fw && distance(track, df, fw) <= BODYGUARD_RANGE) award(race, df, AWARD.BODYGUARD, att.id);
}

/** A Snare landed. */
export function onSnare(race: RaceState, att: MechState, victim: MechState): void {
  if (att.role === ROLE.MF && att.team !== victim.team) award(race, att, AWARD.SNARE, victim.id, victim.role === ROLE.FW ? 2 : 1);
}

/** Knocked into the barrier, or off the road, with `by` credited. */
export function onRingout(race: RaceState, by: MechState | null, victim: MechState): void {
  if (by && by.role === ROLE.DF && by.team !== victim.team) award(race, by, AWARD.RINGOUT, victim.id, victim.role === ROLE.FW ? 2 : 1);
}

/** `victim` was knocked out by `by`: everyone on `by`'s team who hurt it lately has an assist. */
export function onKnockout(race: RaceState, victim: MechState, by: MechState | null): void {
  if (!by || by.team === victim.team) return;
  const since = race.tick - race.rules.assistSecs * TICK_RATE;
  for (const m of race.mechs) {
    if (m === by || m.team !== by.team || m.id >= AWARD_SLOTS) continue;
    if (victim.hurtBy[m.id] >= since) award(race, m, AWARD.ASSIST, victim.id, AWARD_POINTS[AWARD.ASSIST], false);
  }
}

/** `m` passed `o` close enough to touch. On the speed lap a forward fresh out of a teammate's tow pays that teammate a Lead-out. */
export function onPass(race: RaceState, m: MechState, o: MechState): void {
  if (race.lapPhase < 3 || m.role !== ROLE.FW || o.team === m.team || m.towBy < 0) return;
  const t = race.mechs[m.towBy];
  if (t.team !== m.team || t.role === ROLE.FW || race.tick - m.towByTick > LEADOUT_TICKS) return;
  award(race, t, AWARD.LEADOUT, o.id);
}

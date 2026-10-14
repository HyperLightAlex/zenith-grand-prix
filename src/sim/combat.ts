// Attacks, hits, guards and projectiles.

import {
  ABILITY,
  ABILITY_COOLDOWN,
  ACT,
  ARC_IFRAME_SHARE,
  ARC_MAX_SPEED,
  ARC_MIN_STEER,
  ATK,
  ATTACKS,
  AUTO_LOCK_RANGE,
  BREAKAWAY_IFRAMES,
  BTN,
  CHAIN_LIMIT,
  CHAIN_SAME_SHOT,
  CHARGE_BONUS,
  INPUT_BUFFER,
  CHAIN_TICKS,
  COMBO_CANCEL_DELAY,
  COUNTER_HIT,
  DASH_COOLDOWN,
  DASH_TICKS,
  DRIVE_MAX,
  DRIVE_PER_DAMAGE_DEALT,
  DRIVE_PER_DAMAGE_TAKEN,
  DT,
  ESCAPE_IFRAMES,
  ESCAPE_SHOVE_RANGE,
  PARRY_REARM,
  GUARD_ARC,
  GUARD_BREAK_STAGGER,
  GUARD_REDUCTION,
  GUARD_REGEN_DELAY,
  HIT_SLOW_MAX,
  HIT_SLOW_PER_DAMAGE,
  MODE,
  MOMENTUM_STAGGER,
  PARRY_STAGGER,
  PARRY_WINDOW,
  PHASE,
  TICK_RATE,
  attackTotal,
  type Ability,
  type AttackDef,
} from './config';
import { bodyguard, onHit, onKnockout, onSnare } from './awards';
import { addVelocity, classOf, clearEffects, dropCarve, inPlay, pickTarget, retarget, sameRoute, setTarget, speedCap, syncFromSpeed } from './core';
import { ticks } from './rules';
import { rngNext, wrapAngle } from './math';
import { deltaS, hwAt, medianAt, type Track } from './track';
import type { MechInput, MechState, RaceState } from './types';

function deny(race: RaceState, m: MechState, reason: 'weapons' | 'drive' | 'target' | 'cells'): void {
  if (race.tick - m.deniedTick < 30) return;
  m.deniedTick = race.tick;
  race.events.push({ type: 'denied', mech: m.id, reason });
}

export function weaponsFree(race: RaceState): boolean {
  return race.phase === PHASE.RACING && race.lapPhase >= 2;
}

function beginAttack(race: RaceState, track: Track, m: MechState, idx: number): void {
  const a = ATTACKS[idx];
  // Locked on, a blow is aimed at its target as it starts; from then on it
  // commits (see ATTACK_TRACK_RATE), so a swing that reads it gets away.
  if (m.mode === MODE.BATTLE && m.target >= 0) {
    const t = race.mechs[m.target];
    m.facing = Math.atan2(t.d - m.d, deltaS(track, t.s, m.s));
  }
  m.act = ACT.ATTACK;
  m.actT = 0;
  m.actDur = attackTotal(a);
  // The cooldown starts with the move, so being knocked out of it does not
  // hand the move straight back.
  if (a.cooldown > 0) {
    const cd = m.actDur + a.cooldown;
    if (isInChain(classOf(m).primary, idx)) m.cdPrimary = Math.max(m.cdPrimary, cd);
    else m.cdSecondary = Math.max(m.cdSecondary, cd);
  }
  m.attack = idx;
  m.attackStart = race.tick;
  m.attackHit = false;
  m.chargeT = 0;
  m.chargeOn = false;
  // Momentum from a boost or a slipstream goes into the first blow thrown,
  // not into a whole combo (a follow-up starts from a standing fight), and
  // only into a blow: guns already work at racing speed, and a gunner sat in
  // a slipstream would otherwise fire nothing but charged rounds.
  m.atkCharged = a.kind === 'melee' && m.momentum > 0;
  if (m.atkCharged) m.momentum = 0;
  m.comboQueued = false;
  m.guarding = false;
  race.events.push({ type: 'windup', mech: m.id, attack: idx, charged: m.atkCharged });
}

/** Start the primary (slot 0) or secondary (slot 1) attack if allowed. */
export function tryAttack(race: RaceState, track: Track, m: MechState, slot: number): boolean {
  const c = classOf(m);
  const idx = slot === 0 ? c.primary : c.secondary;
  const a = ATTACKS[idx];
  if (!weaponsFree(race)) {
    deny(race, m, 'weapons');
    return false;
  }
  if ((slot === 0 ? m.cdPrimary : m.cdSecondary) > 0) return false;
  if (m.drive < a.driveCost) {
    deny(race, m, 'drive');
    return false;
  }
  if (a.kind === 'melee') {
    // Melee needs a lock. Pressing attack near an enemy takes one for you.
    const cur = m.target >= 0 ? race.mechs[m.target] : null;
    if (!cur || cur.team === m.team) {
      const t = pickTarget(race, track, m, false, -1, AUTO_LOCK_RANGE, true);
      if (t < 0) {
        deny(race, m, 'target');
        return false;
      }
      setTarget(race, m, t);
    }
  }
  m.drive -= a.driveCost;
  beginAttack(race, track, m, idx);
  m.chargeOn = slot === 1 && (a.charge ?? 0) > 0;
  return true;
}

/** How hard a mech's current attack hits from a held charge: 1 uncharged, up to 1 + CHARGE_BONUS. */
export function chargePower(m: MechState): number {
  const full = ATTACKS[m.attack].charge ?? 0;
  return full > 0 ? 1 + (CHARGE_BONUS * Math.min(m.chargeT, full)) / full : 1;
}

export function tryDash(race: RaceState, track: Track, m: MechState, input: MechInput): boolean {
  if (m.mode !== MODE.BATTLE || m.cdDash > 0 || m.target < 0) return false;
  const c = classOf(m);
  if (m.drive < c.dashCost) {
    deny(race, m, 'drive');
    return false;
  }
  const t = race.mechs[m.target];
  const ds = deltaS(track, t.s, m.s);
  const dd = t.d - m.d;
  const dist = Math.hypot(ds, dd) || 1e-3;
  // Guard up and the stick to one side: a guard swing instead.
  const side = Math.abs(input.mx);
  if (m.guarding && side >= ARC_MIN_STEER && side >= Math.abs(input.my) && race.rules.arcAngle > 0) {
    startArc(race, m, t, -ds, -dd, dist, input.mx > 0 ? 1 : -1);
    return true;
  }
  const us = ds / dist;
  const ud = dd / dist;
  let mx = input.mx;
  let my = input.my;
  const mag = Math.hypot(mx, my);
  if (mag < 0.3) {
    // No direction held: hop straight back.
    mx = 0;
    my = -1;
  } else {
    mx /= mag;
    my /= mag;
  }
  m.drive -= c.dashCost;
  m.act = ACT.DASH;
  m.actT = 0;
  m.actDur = DASH_TICKS;
  m.arcDir = 0;
  m.iframes = Math.max(m.iframes, c.dashIframes);
  m.cdDash = DASH_COOLDOWN;
  m.guarding = false;
  m.vs += (us * my - ud * mx) * c.dash;
  m.vd += (ud * my + us * mx) * c.dash;
  race.events.push({ type: 'dash', mech: m.id });
  return true;
}

/**
 * A guard swing: a fast arc round the target to the side the stick is
 * pushed (`dir` 1 right, -1 left, as the pilot sees it facing the target),
 * as far round as rules.arcAngle, or less from further out, so it never goes
 * round faster than ARC_MAX_SPEED. Invulnerable for the first part. Paid for
 * like a dash; the guard comes down while it runs. (ps, pd) is where the mech
 * is seen from the target.
 */
function startArc(race: RaceState, m: MechState, t: MechState, ps: number, pd: number, dist: number, dir: 1 | -1): void {
  const c = classOf(m);
  const r = Math.max(dist, c.radius + classOf(t).radius + 1.5);
  const dur = Math.max(2, ticks(race.rules.arcSecs));
  // The swing eases out along a quarter sine, quickest at the start: pi/2
  // times its average speed round the circle.
  const sweep = Math.min((race.rules.arcAngle * Math.PI) / 180, (ARC_MAX_SPEED * dur * DT) / ((Math.PI / 2) * r));
  m.drive -= c.dashCost;
  m.act = ACT.DASH;
  m.actT = 0;
  m.actDur = dur;
  m.arcDir = dir;
  m.arcFrom = Math.atan2(pd, ps);
  // Pushed right, the mech goes round the target clockwise as seen from
  // above in (s, d): its angle from the target falls.
  m.arcSweep = -dir * sweep;
  m.arcR = r;
  m.iframes = Math.max(m.iframes, Math.round(dur * ARC_IFRAME_SHARE));
  m.cdDash = dur + DASH_COOLDOWN - DASH_TICKS;
  m.guarding = false;
  race.events.push({ type: 'arc', mech: m.id, dir });
}

/** A guard swing over, or cut short. (It moved the mech, not its velocity: nothing to undo.) */
export function endArc(m: MechState): void {
  m.arcDir = 0;
}

/** Which ability the button would fire right now, or -1 if the mech is in no state to use one. */
export function abilityFor(m: MechState): Ability | -1 {
  const c = classOf(m);
  const locked = m.mode === MODE.BATTLE && m.target >= 0;
  if (m.act === ACT.STAGGER) {
    // Only a Break Away can be thrown while reeling from a hit.
    return c.abilityLocked === ABILITY.BREAKAWAY ? ABILITY.BREAKAWAY : -1;
  }
  return locked ? c.abilityLocked : c.abilityFree;
}

/** Spend a Cell on the frame's ability: one move free steering, another locked on. */
export function tryAbility(race: RaceState, track: Track, m: MechState): boolean {
  if (m.cdAbility > 0) return false;
  const ab = abilityFor(m);
  if (ab === -1) return false;
  if (!weaponsFree(race)) {
    deny(race, m, 'weapons');
    return false;
  }
  if (m.cells < 1) {
    deny(race, m, 'cells');
    return false;
  }
  const rules = race.rules;
  // Attacks that would hit nothing are refused rather than wasted.
  if (ab === ABILITY.SNARE && !shotTarget(race, track, m, ATTACKS[ATK.MF_SNARE])) {
    deny(race, m, 'target');
    return false;
  }
  if (ab === ABILITY.PULSE) {
    let any = false;
    for (const o of race.mechs) {
      // Somebody it would actually reach: a rival mid-dodge does not count.
      if (o.team !== m.team && inPlay(o) && sameRoute(track, m, o) && o.iframes <= 0 && Math.hypot(deltaS(track, o.s, m.s), o.d - m.d) <= rules.pulseRange) any = true;
    }
    if (!any) {
      deny(race, m, 'target');
      return false;
    }
  }
  m.cells -= 1;
  m.cdAbility = ABILITY_COOLDOWN;
  race.events.push({ type: 'ability', mech: m.id, ability: ab });

  switch (ab) {
    case ABILITY.OVERDRIVE: {
      m.overdriveT = ticks(rules.overdriveSecs);
      // The surge burns a Snare off, so a forward with a Cell always has an answer to one.
      m.snareT = 0;
      break;
    }
    case ABILITY.BREAKAWAY: {
      m.act = ACT.NONE;
      m.actT = 0;
      m.chain = 0;
      m.chainT = 0;
      m.guarding = false;
      m.comboQueued = false;
      m.snareT = 0;
      m.iframes = Math.max(m.iframes, BREAKAWAY_IFRAMES);
      m.cloakT = ticks(rules.breakawaySecs);
      for (const o of race.mechs) {
        if (o.team !== m.team && o.target === m.id) setTarget(race, o, -1);
      }
      if (m.target >= 0) setTarget(race, m, -1);
      // Thrown clear: straightened up and a little over the cap.
      m.heading *= 0.3;
      m.facing = m.heading;
      m.speed = Math.max(m.speed, speedCap(race, m, classOf(m)) * 1.1);
      syncFromSpeed(m);
      break;
    }
    case ABILITY.SNARE: {
      fireShot(race, track, m, ATTACKS[ATK.MF_SNARE], ATK.MF_SNARE, false);
      break;
    }
    case ABILITY.PULSE: {
      const a = ATTACKS[ATK.MF_PULSE];
      for (const o of race.mechs) {
        if (o.team === m.team || !inPlay(o) || !sameRoute(track, m, o)) continue;
        if (Math.hypot(deltaS(track, o.s, m.s), o.d - m.d) > rules.pulseRange) continue;
        if (applyHit(race, track, m, o, a, ATK.MF_PULSE)) o.drive = Math.max(0, o.drive - rules.pulseDrain);
      }
      break;
    }
    case ABILITY.RAM: {
      m.ramT = ticks(rules.ramSecs);
      m.ramHits = 0;
      break;
    }
    case ABILITY.AEGIS: {
      const dur = ticks(rules.aegisSecs);
      // What this shield keeps off the team is counted toward the caster's award.
      m.aegisSaved = 0;
      m.aegisPaid = false;
      for (const o of race.mechs) {
        if (o.team !== m.team || !inPlay(o) || !sameRoute(track, m, o)) continue;
        if (o !== m && Math.hypot(deltaS(track, o.s, m.s), o.d - m.d) > rules.aegisRange) continue;
        o.shieldT = Math.max(o.shieldT, dur);
        o.shieldBy = m.id;
      }
      break;
    }
  }
  return true;
}

export function setStagger(m: MechState, dur: number): void {
  if (m.act === ACT.STAGGER) {
    m.actDur = Math.max(m.actDur - m.actT, dur);
    m.actT = 0;
  } else {
    m.act = ACT.STAGGER;
    m.actT = 0;
    m.actDur = dur;
  }
  if (m.arcDir !== 0) endArc(m);
  m.guarding = false;
  m.comboQueued = false;
}

export function retire(race: RaceState, m: MechState, by: MechState | null, track?: Track): void {
  if (m.retired) return;
  m.retired = true;
  m.retireTick = race.tick;
  m.hp = 0;
  m.fallT = 0;
  m.act = ACT.NONE;
  m.guarding = false;
  m.boosting = false;
  clearEffects(m);
  if (m.target >= 0) setTarget(race, m, -1);
  for (const o of race.mechs) {
    if (o.target !== m.id) continue;
    if (track && !o.retired && !o.finished) retarget(race, track, o, m.id);
    else setTarget(race, o, -1);
  }
  if (by) by.kos++;
  race.events.push({ type: 'ko', mech: m.id, by: by ? by.id : -1 });
  onKnockout(race, m, by);
}

/**
 * Land an attack. Returns true if it connected (even on a guard). Knockback
 * and whether the victim's guard faces the blow both come from where the
 * attacker is standing. A `charged` hit is a momentum strike.
 */
export function applyHit(
  race: RaceState,
  track: Track,
  att: MechState,
  victim: MechState,
  a: AttackDef,
  attackIdx: number,
  charged = false,
  power = 1,
): boolean {
  if (victim.iframes > 0) {
    race.events.push({ type: 'evade', mech: victim.id });
    return false;
  }
  const rules = race.rules;
  const ds = deltaS(track, victim.s, att.s);
  const dd = victim.d - att.d;
  const dist = Math.hypot(ds, dd) || 1e-3;
  // Knockback points from attacker to victim, but a shove from behind must
  // not work as a free push down the road. Heavy blows throw harder across
  // the road than along it: stand a rival between you and the barrier.
  let ux = ds / dist;
  const uy = dd / dist;
  if (ux > 0) ux *= 0.1;
  const kb = a.knockback * (charged ? rules.momentumKnock : 1) * power;
  const us = ux * kb;
  const ud = uy * kb * (a.heavy ? rules.ringoutThrow : 1);
  const toAttacker = Math.atan2(-dd, -ds);
  const front = Math.abs(wrapAngle(toAttacker - victim.facing)) <= GUARD_ARC;
  let dmg = a.damage * (charged ? rules.momentumDamage : 1) * power;
  const guardDmg = a.guardDamage * (charged ? rules.momentumDamage : 1) * power;
  const stagger = a.stagger * (charged ? MOMENTUM_STAGGER : 1);
  let blocked = false;
  // What the victim was doing when the blow arrived, for the support awards.
  const victimTarget = victim.target;
  const victimMode = victim.mode;
  // Mid-swing: winding up or with the blow still live (recovery does not count).
  const wasAttacking = victim.act === ACT.ATTACK && victim.actT < ATTACKS[victim.attack].windup + ATTACKS[victim.attack].active;
  const inWindup = wasAttacking && victim.actT < ATTACKS[victim.attack].windup;
  let broke = false;
  // Under an Aegis, or mid-ram, nothing staggers, slows or snares the mech,
  // or breaks its carve.
  const shielded = victim.shieldT > 0;
  const unstoppable = shielded || victim.ramT > 0;
  let prevented = 0;
  if (shielded) {
    // (A first guess; worked out properly below, once the guard has had its say.)
    prevented = dmg * (1 - rules.aegisDamage);
    dmg *= rules.aegisDamage;
  }

  if (victim.guarding && front) {
    if (a.kind === 'melee' && victim.guardT <= PARRY_WINDOW && !a.guardBreak && !a.noParry) {
      // A guard raised at the last moment turns the blow.
      setStagger(att, PARRY_STAGGER);
      addVelocity(att, -ux * 14, -uy * 14);
      victim.drive = Math.min(DRIVE_MAX, victim.drive + 12);
      race.events.push({ type: 'parry', mech: victim.id, attacker: att.id });
      bodyguard(race, track, victim, att);
      return true;
    }
    victim.guard -= guardDmg;
    victim.guardIdle = 0;
    if (a.guardBreak || victim.guard <= 0) {
      victim.guard = classOf(victim).guardMax * 0.4;
      dmg *= 0.6;
      if (!unstoppable) {
        broke = wasAttacking;
        setStagger(victim, GUARD_BREAK_STAGGER);
      }
      addVelocity(victim, us, ud);
      race.events.push({ type: 'guardBreak', mech: victim.id, by: att.id });
    } else {
      dmg *= GUARD_REDUCTION;
      blocked = true;
      addVelocity(victim, us * 0.25, ud * 0.25);
    }
  } else {
    let armored = unstoppable;
    if (victim.act === ACT.ATTACK) {
      const va = ATTACKS[victim.attack];
      if (victim.actT < va.windup) dmg *= COUNTER_HIT;
      armored = armored || (va.armor && !a.heavy && victim.actT < va.windup + va.active);
    }
    if (armored) {
      addVelocity(victim, us * 0.3, ud * 0.3);
    } else {
      // One count per tick (a scatter blast is one hit for this purpose), and
      // one per burst of the same gun: a carbine's rounds are one hit too.
      const key = att.id * 64 + attackIdx;
      const sameBurst = a.kind === 'shot' && victim.chainKey === key && race.tick - victim.chainTick <= CHAIN_SAME_SHOT;
      if (victim.chainTick !== race.tick && !sameBurst) victim.chain++;
      victim.chainTick = race.tick;
      victim.chainKey = key;
      victim.chainT = CHAIN_TICKS;
      if (victim.chain > CHAIN_LIMIT) {
        // Enough: the victim bursts free rather than being juggled forever.
        victim.chain = 0;
        victim.iframes = ESCAPE_IFRAMES;
        victim.act = ACT.NONE;
        if (dist < ESCAPE_SHOVE_RANGE) addVelocity(att, -ux * 22, -uy * 22);
        race.events.push({ type: 'escape', mech: victim.id });
      } else {
        broke = wasAttacking;
        setStagger(victim, Math.max(4, Math.round(stagger * Math.pow(0.88, victim.chain - 1))));
        addVelocity(victim, us, ud);
      }
    }
    if (victim.mode === MODE.SPEED && !unstoppable) {
      // A hit at racing speed costs pace.
      victim.speed *= 1 - Math.min(HIT_SLOW_MAX, dmg * HIT_SLOW_PER_DAMAGE);
      syncFromSpeed(victim);
    }
    // ...and whatever a carve had built up (unless nothing can touch it).
    if (!unstoppable) dropCarve(victim);
  }

  // What the shield kept off is what would have landed without it: the guard
  // takes its share of a blow whether or not there is a shield over it.
  if (shielded && rules.aegisDamage > 0.001) prevented = dmg * (1 / rules.aegisDamage - 1);
  dmg = Math.min(dmg, victim.hp);
  victim.hp -= dmg;
  victim.dmgTaken += dmg;
  att.dmgDealt += dmg;
  victim.lastHitBy = att.id;
  victim.lastHitTick = race.tick;
  victim.drive = Math.min(DRIVE_MAX, victim.drive + dmg * DRIVE_PER_DAMAGE_TAKEN);
  att.drive = Math.min(DRIVE_MAX, att.drive + dmg * DRIVE_PER_DAMAGE_DEALT);
  race.events.push({
    type: 'hit',
    attacker: att.id,
    victim: victim.id,
    attack: attackIdx,
    damage: dmg,
    blocked,
    heavy: a.heavy,
    charged,
    s: victim.s,
    d: victim.d,
  });
  onHit(race, track, att, victim, { attack: attackIdx, damage: dmg, blocked, broke, inWindup, victimTarget, victimMode, prevented });
  if (victim.hp <= 0.001) retire(race, victim, att, track);
  else if (attackIdx === ATK.MF_SNARE && !blocked && !unstoppable) {
    victim.snareT = ticks(rules.snareSecs);
    victim.boosting = false;
    race.events.push({ type: 'snared', mech: victim.id, by: att.id });
    onSnare(race, att, victim);
  }
  return true;
}

function resolveMelee(race: RaceState, track: Track, m: MechState, a: AttackDef): void {
  const c = classOf(m);
  let victim: MechState | null = null;
  let best = Infinity;
  for (const o of race.mechs) {
    if (o.team === m.team || !inPlay(o) || !sameRoute(track, m, o)) continue;
    const ds = deltaS(track, o.s, m.s);
    const dd = o.d - m.d;
    // Height counts: a mech in the air above you is out of reach of a blade.
    const dist = Math.hypot(ds, dd, o.h - m.h);
    if (dist > a.reach + c.radius + classOf(o).radius) continue;
    if (Math.abs(wrapAngle(Math.atan2(dd, ds) - m.facing)) > a.arc) continue;
    const score = dist - (o.id === m.target ? 1000 : 0);
    if (score < best) {
      best = score;
      victim = o;
    }
  }
  if (victim) {
    m.attackHit = true;
    applyHit(race, track, m, victim, a, m.attack, m.atkCharged, chargePower(m));
  }
}

/** Who a shot would be aimed at: the locked enemy, else whoever sits in the sights. */
function shotTarget(race: RaceState, track: Track, m: MechState, a: AttackDef): MechState | null {
  const sh = a.shot!;
  if (m.target >= 0 && race.mechs[m.target].team !== m.team) return race.mechs[m.target];
  let t: MechState | null = null;
  let best = Infinity;
  for (const o of race.mechs) {
    if (o.team === m.team || !inPlay(o) || !sameRoute(track, m, o)) continue;
    const ds = deltaS(track, o.s, m.s);
    const dd = o.d - m.d;
    const dist = Math.hypot(ds, dd);
    if (dist > sh.range + 8) continue;
    const ang = Math.abs(wrapAngle(Math.atan2(dd, ds) - m.facing));
    if (ang > a.arc) continue;
    const score = dist + ang * 30;
    if (score < best) {
      best = score;
      t = o;
    }
  }
  return t;
}

function fireShot(race: RaceState, track: Track, m: MechState, a: AttackDef, idx: number, charged: boolean): void {
  const sh = a.shot!;
  const c = classOf(m);
  const t = shotTarget(race, track, m, a);
  let aim = m.facing;
  if (t) {
    const ds = deltaS(track, t.s, m.s);
    const dd = t.d - m.d;
    const tof = Math.hypot(ds, dd) / sh.speed;
    aim = Math.atan2(dd + (t.vd - m.vd) * tof, ds + (t.vs - m.vs) * tof);
  }
  for (let p = 0; p < sh.pellets; p++) {
    const ang = aim + (rngNext(race) * 2 - 1) * sh.spread;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    const id = race.nextProjId++;
    race.projectiles.push({
      id,
      owner: m.id,
      team: m.team,
      attack: idx,
      charged,
      power: chargePower(m),
      s: m.s + cs * (c.radius + 0.5),
      d: m.d + sn * (c.radius + 0.5),
      h: m.h,
      vs: m.vs + cs * sh.speed,
      vd: m.vd + sn * sh.speed,
      life: Math.ceil((sh.range / sh.speed) * TICK_RATE),
    });
    race.events.push({ type: 'shot', mech: m.id, attack: idx, proj: id });
  }
}

/** Advance one mech's timers and action state for this tick. */
export function stepAction(race: RaceState, track: Track, m: MechState, input: MechInput, pressed: number): void {
  const c = classOf(m);
  if (m.cdPrimary > 0) m.cdPrimary--;
  if (m.cdSecondary > 0) m.cdSecondary--;
  if (m.cdDash > 0) m.cdDash--;
  if (m.cdAbility > 0) m.cdAbility--;
  if (m.iframes > 0) m.iframes--;
  if (m.chainT > 0 && --m.chainT === 0) m.chain = 0;
  if (m.overdriveT > 0) m.overdriveT--;
  if (m.ramT > 0) m.ramT--;
  if (m.shieldT > 0) m.shieldT--;
  if (m.snareT > 0) m.snareT--;
  if (m.cloakT > 0) m.cloakT--;

  // The ability comes first: a forward can break away in the middle of a hit.
  if (pressed & BTN.ABILITY) tryAbility(race, track, m);

  // A parry needs a deliberate press: the button down this tick after a real
  // pause, with the mech free to raise its guard at that moment. Holding the
  // button through a stagger, or fluttering it, only ever gives a block.
  const guardHeld = (input.buttons & BTN.GUARD) !== 0;
  const freshPress = (pressed & BTN.GUARD) !== 0 && m.guardRest >= PARRY_REARM;
  m.guardRest = guardHeld ? 0 : m.guardRest + 1;

  // Guard: battle mode only, and not in the middle of something else.
  const wantGuard = (input.buttons & BTN.GUARD) !== 0 && m.mode === MODE.BATTLE && m.act === ACT.NONE && m.guard > 0;
  if (wantGuard) {
    if (!m.guarding) {
      m.guarding = true;
      m.guardT = freshPress ? 0 : PARRY_WINDOW + 1;
    } else {
      m.guardT++;
    }
    m.guardIdle = 0;
  } else {
    m.guarding = false;
    m.guardIdle++;
    if (m.guardIdle > GUARD_REGEN_DELAY) m.guard = Math.min(c.guardMax, m.guard + c.guardRegen * DT);
  }

  // The buffer: the latest press of X, Y or A (A only locked on, where it is
  // the dash; free, it is the boost and is held) waits INPUT_BUFFER ticks.
  const buffered = BTN.X | BTN.Y | (m.mode === MODE.BATTLE ? BTN.A : 0);
  if (pressed & buffered) {
    m.bufBtn = pressed & buffered;
    m.bufT = INPUT_BUFFER;
  } else if (m.bufT > 0 && --m.bufT === 0) {
    m.bufBtn = 0;
  }
  const want = pressed | (m.bufT > 0 ? m.bufBtn : 0);

  switch (m.act) {
    case ACT.NONE: {
      // A gun keeps firing while its trigger is held.
      const autofire = (input.buttons & BTN.X) !== 0 && ATTACKS[c.primary].kind === 'shot' && m.cdPrimary === 0;
      let done = false;
      if (want & BTN.X || autofire) done = tryAttack(race, track, m, 0);
      else if (want & BTN.Y) done = tryAttack(race, track, m, 1);
      else if (want & BTN.A && m.mode === MODE.BATTLE) done = tryDash(race, track, m, input);
      if (done) m.bufBtn = m.bufT = 0;
      break;
    }
    case ACT.ATTACK: {
      const a = ATTACKS[m.attack];
      if (pressed & BTN.X && a.next >= 0) m.comboQueued = true;
      // A heavy held through its wind-up holds at the end of it and charges,
      // the clock (and the cooldown) standing still, until let go or full.
      if (m.chargeOn && (input.buttons & BTN.Y) === 0) m.chargeOn = false;
      const full = a.charge ?? 0;
      if (m.chargeOn && m.actT === a.windup - 1 && m.chargeT < full) {
        if (m.chargeT === 0) race.events.push({ type: 'charge', mech: m.id, attack: m.attack, full: false });
        m.chargeT++;
        m.cdSecondary++;
        if (m.chargeT === full) race.events.push({ type: 'charge', mech: m.id, attack: m.attack, full: true });
        break;
      }
      const t = m.actT;
      if (t === a.windup) race.events.push({ type: 'swing', mech: m.id, attack: m.attack });
      if (a.kind === 'melee') {
        if (t >= a.windup && t < a.windup + a.active && !m.attackHit) resolveMelee(race, track, m, a);
      } else if (a.shot) {
        for (let k = 0; k < a.shot.count; k++) {
          if (t === a.windup + k * a.shot.interval) fireShot(race, track, m, a, m.attack, m.atkCharged);
        }
      }
      m.actT++;
      const activeEnd = a.windup + a.active;
      if (m.comboQueued && a.next >= 0 && m.actT >= activeEnd + COMBO_CANCEL_DELAY) {
        beginAttack(race, track, m, a.next);
      } else if (m.actT >= m.actDur) {
        m.act = ACT.NONE;
      }
      break;
    }
    case ACT.STAGGER:
    case ACT.DASH: {
      m.actT++;
      if (m.actT >= m.actDur) {
        m.act = ACT.NONE;
        if (m.arcDir !== 0) endArc(m);
      }
      break;
    }
  }
}

function isInChain(start: number, idx: number): boolean {
  let i = start;
  for (let guard = 0; guard < 8 && i >= 0; guard++) {
    if (i === idx) return true;
    i = ATTACKS[i].next;
  }
  return false;
}

export function stepProjectiles(race: RaceState, track: Track): void {
  const list = race.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.s += p.vs * DT;
    p.d += p.vd * DT;
    p.life--;
    // Off the road, or into the wall down the middle of a fork.
    let done = p.life <= 0 || Math.abs(p.d) > hwAt(track, p.s) || Math.abs(p.d) < medianAt(track, p.s);
    let hit = false;
    if (!done) {
      for (const o of race.mechs) {
        if (o.team === p.team || !inPlay(o)) continue;
        const ds = deltaS(track, o.s, p.s);
        const dd = o.d - p.d;
        const dh = o.h - p.h;
        const r = classOf(o).radius + 0.9;
        if (ds * ds + dd * dd + dh * dh <= r * r) {
          applyHit(race, track, race.mechs[p.owner], o, ATTACKS[p.attack], p.attack, p.charged, p.power);
          done = true;
          hit = true;
          break;
        }
      }
    }
    if (done) {
      race.events.push({ type: 'projEnd', proj: p.id, hit });
      list.splice(i, 1);
    }
  }
}

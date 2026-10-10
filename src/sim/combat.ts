// Attacks, hits, guards and projectiles.

import {
  ACT,
  ATTACKS,
  AUTO_LOCK_RANGE,
  BTN,
  CHAIN_LIMIT,
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
  PARRY_STAGGER,
  PARRY_WINDOW,
  PHASE,
  TICK_RATE,
  attackTotal,
  type AttackDef,
} from './config';
import { addVelocity, classOf, isActive, pickTarget, setTarget, syncFromSpeed } from './core';
import { rngNext, wrapAngle } from './math';
import { deltaS, type Track } from './track';
import type { MechInput, MechState, RaceState } from './types';

function deny(race: RaceState, m: MechState, reason: 'weapons' | 'drive' | 'target'): void {
  if (race.tick - m.deniedTick < 30) return;
  m.deniedTick = race.tick;
  race.events.push({ type: 'denied', mech: m.id, reason });
}

export function weaponsFree(race: RaceState): boolean {
  return race.phase === PHASE.RACING && race.lapPhase >= 2;
}

function beginAttack(race: RaceState, m: MechState, idx: number): void {
  const a = ATTACKS[idx];
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
  m.comboQueued = false;
  m.guarding = false;
  race.events.push({ type: 'windup', mech: m.id, attack: idx });
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
      const t = pickTarget(race, track, m, false, -1, AUTO_LOCK_RANGE);
      if (t < 0) {
        deny(race, m, 'target');
        return false;
      }
      setTarget(race, m, t);
    }
  }
  m.drive -= a.driveCost;
  beginAttack(race, m, idx);
  return true;
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
  m.iframes = Math.max(m.iframes, c.dashIframes);
  m.cdDash = DASH_COOLDOWN;
  m.guarding = false;
  m.vs += (us * my - ud * mx) * c.dash;
  m.vd += (ud * my + us * mx) * c.dash;
  race.events.push({ type: 'dash', mech: m.id });
  return true;
}

export function setStagger(m: MechState, ticks: number): void {
  if (m.act === ACT.STAGGER) {
    m.actDur = Math.max(m.actDur - m.actT, ticks);
    m.actT = 0;
  } else {
    m.act = ACT.STAGGER;
    m.actT = 0;
    m.actDur = ticks;
  }
  m.guarding = false;
  m.comboQueued = false;
}

export function retire(race: RaceState, m: MechState, by: MechState | null): void {
  if (m.retired) return;
  m.retired = true;
  m.retireTick = race.tick;
  m.hp = 0;
  m.act = ACT.NONE;
  m.guarding = false;
  m.boosting = false;
  if (m.target >= 0) setTarget(race, m, -1);
  for (const o of race.mechs) {
    if (o.target === m.id) setTarget(race, o, -1);
  }
  if (by) by.kos++;
  race.events.push({ type: 'ko', mech: m.id, by: by ? by.id : -1 });
}

/**
 * Land an attack. Returns true if it connected (even on a guard). Knockback
 * and whether the victim's guard faces the blow both come from where the
 * attacker is standing.
 */
export function applyHit(
  race: RaceState,
  track: Track,
  att: MechState,
  victim: MechState,
  a: AttackDef,
  attackIdx: number,
): boolean {
  if (victim.iframes > 0) {
    race.events.push({ type: 'evade', mech: victim.id });
    return false;
  }
  const ds = deltaS(track, victim.s, att.s);
  const dd = victim.d - att.d;
  const dist = Math.hypot(ds, dd) || 1e-3;
  // Knockback points from attacker to victim, but a shove from behind must
  // not work as a free push down the road.
  let us = ds / dist;
  const ud = dd / dist;
  if (us > 0) us *= 0.25;
  const toAttacker = Math.atan2(-dd, -ds);
  const front = Math.abs(wrapAngle(toAttacker - victim.facing)) <= GUARD_ARC;
  let dmg = a.damage;
  let blocked = false;

  if (victim.guarding && front) {
    if (a.kind === 'melee' && victim.guardT <= PARRY_WINDOW && !a.guardBreak) {
      // A guard raised at the last moment turns the blow.
      setStagger(att, PARRY_STAGGER);
      addVelocity(att, -us * 14, -ud * 14);
      victim.drive = Math.min(DRIVE_MAX, victim.drive + 12);
      race.events.push({ type: 'parry', mech: victim.id, attacker: att.id });
      return true;
    }
    victim.guard -= a.guardDamage;
    victim.guardIdle = 0;
    if (a.guardBreak || victim.guard <= 0) {
      victim.guard = classOf(victim).guardMax * 0.4;
      dmg *= 0.6;
      setStagger(victim, GUARD_BREAK_STAGGER);
      addVelocity(victim, us * a.knockback, ud * a.knockback);
      race.events.push({ type: 'guardBreak', mech: victim.id, by: att.id });
    } else {
      dmg *= GUARD_REDUCTION;
      blocked = true;
      addVelocity(victim, us * a.knockback * 0.25, ud * a.knockback * 0.25);
    }
  } else {
    let armored = false;
    if (victim.act === ACT.ATTACK) {
      const va = ATTACKS[victim.attack];
      if (victim.actT < va.windup) dmg *= COUNTER_HIT;
      armored = va.armor && !a.heavy && victim.actT < va.windup + va.active;
    }
    if (armored) {
      addVelocity(victim, us * a.knockback * 0.3, ud * a.knockback * 0.3);
    } else {
      // One count per tick: a scatter blast is one hit for this purpose.
      if (victim.chainTick !== race.tick) {
        victim.chainTick = race.tick;
        victim.chain++;
      }
      victim.chainT = CHAIN_TICKS;
      if (victim.chain > CHAIN_LIMIT) {
        // Enough: the victim bursts free rather than being juggled forever.
        victim.chain = 0;
        victim.iframes = ESCAPE_IFRAMES;
        victim.act = ACT.NONE;
        if (dist < ESCAPE_SHOVE_RANGE) addVelocity(att, -us * 22, -ud * 22);
        race.events.push({ type: 'escape', mech: victim.id });
      } else {
        setStagger(victim, Math.max(4, Math.round(a.stagger * Math.pow(0.88, victim.chain - 1))));
        addVelocity(victim, us * a.knockback, ud * a.knockback);
      }
    }
    if (victim.mode === MODE.SPEED) {
      // A hit at racing speed costs pace.
      victim.speed *= 1 - Math.min(HIT_SLOW_MAX, dmg * HIT_SLOW_PER_DAMAGE);
      syncFromSpeed(victim);
    }
  }

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
    s: victim.s,
    d: victim.d,
  });
  if (victim.hp <= 0.001) retire(race, victim, att);
  return true;
}

function resolveMelee(race: RaceState, track: Track, m: MechState, a: AttackDef): void {
  const c = classOf(m);
  let victim: MechState | null = null;
  let best = Infinity;
  for (const o of race.mechs) {
    if (o.team === m.team || !isActive(o)) continue;
    const ds = deltaS(track, o.s, m.s);
    const dd = o.d - m.d;
    const dist = Math.hypot(ds, dd);
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
    applyHit(race, track, m, victim, a, m.attack);
  }
}

function fireShot(race: RaceState, track: Track, m: MechState, a: AttackDef): void {
  const sh = a.shot!;
  const c = classOf(m);
  // Aim at the locked enemy, or at whoever sits in the sights.
  let t: MechState | null = null;
  if (m.target >= 0 && race.mechs[m.target].team !== m.team) {
    t = race.mechs[m.target];
  } else {
    let best = Infinity;
    for (const o of race.mechs) {
      if (o.team === m.team || !isActive(o)) continue;
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
  }
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
      attack: m.attack,
      s: m.s + cs * (c.radius + 0.5),
      d: m.d + sn * (c.radius + 0.5),
      vs: m.vs + cs * sh.speed,
      vd: m.vd + sn * sh.speed,
      life: Math.ceil((sh.range / sh.speed) * TICK_RATE),
    });
    race.events.push({ type: 'shot', mech: m.id, attack: m.attack, proj: id });
  }
}

/** Advance one mech's timers and action state for this tick. */
export function stepAction(race: RaceState, track: Track, m: MechState, input: MechInput, pressed: number): void {
  const c = classOf(m);
  if (m.cdPrimary > 0) m.cdPrimary--;
  if (m.cdSecondary > 0) m.cdSecondary--;
  if (m.cdDash > 0) m.cdDash--;
  if (m.iframes > 0) m.iframes--;
  if (m.chainT > 0 && --m.chainT === 0) m.chain = 0;

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

  switch (m.act) {
    case ACT.NONE: {
      if (pressed & BTN.X) tryAttack(race, track, m, 0);
      else if (pressed & BTN.Y) tryAttack(race, track, m, 1);
      else if (pressed & BTN.A && m.mode === MODE.BATTLE) tryDash(race, track, m, input);
      break;
    }
    case ACT.ATTACK: {
      const a = ATTACKS[m.attack];
      if (pressed & BTN.X && a.next >= 0) m.comboQueued = true;
      const t = m.actT;
      if (t === a.windup) race.events.push({ type: 'swing', mech: m.id, attack: m.attack });
      if (a.kind === 'melee') {
        if (t >= a.windup && t < a.windup + a.active && !m.attackHit) resolveMelee(race, track, m, a);
      } else if (a.shot) {
        for (let k = 0; k < a.shot.count; k++) {
          if (t === a.windup + k * a.shot.interval) fireShot(race, track, m, a);
        }
      }
      m.actT++;
      const activeEnd = a.windup + a.active;
      if (m.comboQueued && a.next >= 0 && m.actT >= activeEnd + COMBO_CANCEL_DELAY) {
        beginAttack(race, m, a.next);
      } else if (m.actT >= m.actDur) {
        m.act = ACT.NONE;
      }
      break;
    }
    case ACT.STAGGER:
    case ACT.DASH: {
      m.actT++;
      if (m.actT >= m.actDur) m.act = ACT.NONE;
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
    let done = p.life <= 0 || Math.abs(p.d) > track.halfWidth;
    let hit = false;
    if (!done) {
      for (const o of race.mechs) {
        if (o.team === p.team || !isActive(o)) continue;
        const ds = deltaS(track, o.s, p.s);
        const dd = o.d - p.d;
        const r = classOf(o).radius + 0.9;
        if (ds * ds + dd * dd <= r * r) {
          applyHit(race, track, race.mechs[p.owner], o, ATTACKS[p.attack], p.attack);
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

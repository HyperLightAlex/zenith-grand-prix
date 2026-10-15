// Tuning data for the simulation: timing, classes and attacks.
// Everything here is plain data so balance changes never touch the logic.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const LAPS = 3;
/** Points by finishing position. A retired mech scores nothing. */
export const POINTS = [15, 7, 5, 3, 2, 1];

/**
 * Support actions that score for the team (awards.ts). Each pilot's total is
 * capped per race (rules.supportCap); most can score only once every few
 * seconds against the same rival (rules.awardCooldown).
 */
export const AWARD = { ASSIST: 0, SNARE: 1, INTERRUPT: 2, PRESSURE: 3, BACKUP: 4, PEEL: 5, SAVE: 6, BODYGUARD: 7, AEGIS: 8, RINGOUT: 9, LEADOUT: 10 } as const;
export type Award = (typeof AWARD)[keyof typeof AWARD];
export const AWARD_COUNT = 11;
export const AWARD_NAMES = ['Assist', 'Snare', 'Interrupt', 'Pressure', 'Back-up', 'Peel', 'Save', 'Bodyguard', 'Aegis', 'Ring-out', 'Lead-out'] as const;
/** Points for each award. A Snare or a ring-out on the rival forward is worth one more. */
export const AWARD_POINTS = [2, 1, 2, 1, 1, 1, 2, 1, 2, 1, 2] as const;
/** Bodyguard: a block or a parry within this distance of your own forward. */
export const BODYGUARD_RANGE = 30;
/** Aegis: damage the shield must keep off teammates (caster included) for the award. */
export const AEGIS_SAVED = 100;
/** Lead-out: the forward makes its pass within this many ticks of leaving a teammate's tow. */
export const LEADOUT_TICKS = 150;

/**
 * Reference pace: the default formation-lap limiter. The live limiters are
 * rules (race.rules.limiter1 and limiter2); this is for presentation code
 * that needs a "normal racing speed" to scale against.
 */
export const PACE = 110;
/**
 * The limiter is tied to the race leader: fall more than PACK_SLACK behind
 * and it lets go a little, up to PACK_BONUS, so the field stays one pack
 * for the battle lap. Lap 3 has no limiter at all.
 */
export const PACK_SLACK = 40;
export const PACK_FULL = 300;
export const PACK_BONUS = 0.14;
/** Display scale only: 110 u/s reads as 330 mph, a 160 u/s forward as 480. */
export const MPH_PER_UNIT = 3;

export const COUNTDOWN_TICKS = 4 * TICK_RATE;
/** A throttle press this close to GO earns a launch bonus. */
export const PERFECT_START_WINDOW = 22;
/** Seconds the race stays open after the winner crosses the line. */
export const FINISH_GRACE_TICKS = 25 * TICK_RATE;
/** Hard stop: a race that somehow has no finisher is flagged after this long. */
export const MAX_RACE_TICKS = 10 * 60 * TICK_RATE;

export const ROLE = { FW: 0, MF: 1, DF: 2 } as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];
export const ROLE_KEYS = ['FW', 'MF', 'DF'] as const;
export const ROLE_NAMES = ['Forward', 'Midfielder', 'Defender'] as const;

export const MODE = { SPEED: 0, BATTLE: 1 } as const;
export type Mode = (typeof MODE)[keyof typeof MODE];

export const ACT = { NONE: 0, ATTACK: 1, STAGGER: 2, DASH: 3 } as const;
export type Act = (typeof ACT)[keyof typeof ACT];

export const PHASE = { COUNTDOWN: 0, RACING: 1, FINISHED: 2 } as const;
export type Phase = (typeof PHASE)[keyof typeof PHASE];

/** Team tactics, set with the D-pad. FREE lets each pilot play their role. */
export const TACTIC = { FREE: 0, BLITZ: 1, RUN: 2, SHIELD: 3, MARK: 4 } as const;
export type Tactic = (typeof TACTIC)[keyof typeof TACTIC];
export const TACTIC_NAMES = ['FREE', 'BLITZ', 'RUN', 'SHIELD', 'MARK'] as const;
/**
 * TeamState.caller values below zero. A value of zero or more is the one
 * mech whose calls count (an online team's shot caller).
 */
export const CALLER = {
  /** Any person on the team calls; the computer captain calls if nobody human is on it. */
  ANY: -1,
  /** Nobody calls: a team of three people has no computer pilot to order. */
  NONE: -2,
  /** The computer captain calls, though the team has human seats (its people have all dropped out). */
  CAPTAIN: -3,
} as const;

/** Held-button bitmask sent by a controller each tick. */
export const BTN = {
  A: 1, // boost (speed mode) / dash (battle mode)
  X: 2, // primary attack
  Y: 4, // secondary attack
  GUARD: 8,
  LOCK: 16, // lock on to an enemy / release
  ALLY: 32, // lock on to a teammate / release
  TNEXT: 64,
  TPREV: 128,
  ABILITY: 256, // role ability: one move free, another locked on
} as const;
/** Every bit a controller may send. */
export const BTN_MASK = 0x1ff;

// ---- Drive gauge ---------------------------------------------------------
// How fast it fills (strips, slipstream, the trickle) is in rules.ts.
export const DRIVE_MAX = 100;
export const DRIVE_PER_DAMAGE_DEALT = 0.07;
export const DRIVE_PER_DAMAGE_TAKEN = 0.05;

// ---- Speed mode ----------------------------------------------------------
export const BOOST_ACCEL = 1.6;
export const OVERDRIVE_ACCEL = 2.4;
export const BOOST_COST = 15; // per second
/** Drive needed to light the boost; once lit it burns while A is held, to empty. */
export const BOOST_MIN_START = 6;
/**
 * Once lit, a boost burns for at least this many ticks (half a second) with
 * A held or not. Without it a boost could be tapped a tick at a time: a
 * sliver of speed over the cap for no more Drive than the trickle brings in,
 * and a fresh ignition every other tick.
 */
export const BOOST_MIN_BURN = 30;
/**
 * A boost picked straight back up, inside this many ticks of going out, is
 * the same boost carried on: no fresh ignition (no flash, no sound), so
 * mashing A sounds like holding it. Lighting it still takes BOOST_MIN_START.
 */
export const BOOST_RELIGHT = 20;
/** Nothing free-steering goes faster than this multiple of its current cap. */
export const SPEED_CEILING = 1.22;
export const DRAFT_MIN = 4;
export const DRAFT_WIDTH = 6;
/** Inside this distance (or 40% of the tow's reach) the slipstream charges fully... */
export const TOW_NEAR = 40;
/**
 * ...and at the far end of its reach it settles at this charge. The bonus is
 * full from half charge up, so this is 30% of the bonus at the far end,
 * rising to all of it about three-quarters of the way in.
 */
export const TOW_FAR = 0.15;
export const COAST_DRAG = 14;
export const OVERCAP_DRAG = 30;
/** Extra slowing while staggered at racing speed. Kept small: a hit costs control, not the race. */
export const STAGGER_DRAG = 6;
/** The most of its throttle a staggered mech keeps at racing speed: it rides the hit out. */
export const STAGGER_THROTTLE = 0.9;
export const STEER_RATE = 7; // how fast steering input ramps, per second
export const WALL_DRAG = 22;
/**
 * With the stick centred a mech straightens up along the road at this rate
 * (per second). It still runs wide in a bend unless steered, but a nudge or
 * a tap of steering does not send it into the far wall.
 */
export const ALIGN_RATE = 1.6;
/** Share of a sideways shove that turns a free-steering mech's heading. */
export const BUMP_TURN = 0.4;
export const MAX_HEADING = 1.2;

// ---- Leaving the road (circuits with jumps, crests and open edges) ---------
/**
 * Gravity, u/s^2. Game gravity: about seven times the real thing at this
 * scale, so a jump is a leap and not a float.
 */
export const GRAVITY = 45;
/** Steering left in the air, as a share of the grip on the road. */
export const AIR_CONTROL = 0.3;
/** Below the road surface by this much, with no road under it: the mech has fallen. */
export const FALL_DEPTH = 3;
/** Ticks a fallen mech is out of the race before the recovery drone puts it back. */
export const FALL_TICKS = 96;
/** Armour a fall costs. Credited like a ring-out to whoever knocked it there. */
export const FALL_DAMAGE = 70;
/** Speed a recovered mech is put back at, as a share of the limiter (lap 3: of its top speed). */
export const RECOVER_SPEED = 0.6;
/** Invulnerable ticks after a recovery. */
export const RECOVER_IFRAMES = 60;
/** On a loop or corkscrew a mech in the air is pulled back to the road this hard, u/s^2. */
export const MAG_PULL = 220;
/** A landing harder than this (u/s straight down) costs a little speed. */
export const HARD_LANDING = 22;
/** Air time (ticks) a landing needs before it can earn Drive. */
export const LANDING_AIR_TICKS = 20;
/** Two mechs this close across the road when one passes the other: a close pass. */
export const PASS_WIDTH = 10;
/** A pass on the same rival only pays Drive again after this many ticks (no weaving to farm it). */
export const PASS_COOLDOWN = 300;
/** Moved further than this in one tick (put back on the road after a fall): not a pass. */
export const PASS_JUMP = 8;

// ---- Carving ---------------------------------------------------------------
// A held drift: pull the brake trigger with the stick over and the mech digs
// its skates in, turning that way for as long as the trigger stays held. More
// grip, a little speed bled, and charge for a burst on release. How much grip
// and drag, and scales on the charge and the burst, are rules; the shape is here.
/** Trigger needed to start a carve, and to keep one going. */
export const CARVE_TRIGGER = 0.5;
export const CARVE_HOLD_TRIGGER = 0.3;
/** Stick needed to start a carve: below it the trigger brakes. */
export const CARVE_MIN_STEER = 0.35;
/**
 * Once a carve is on, the stick only shapes it, it cannot straighten it: with
 * the stick in the middle the carve turns at CARVE_STEER_MID of full lock,
 * pushed into the turn it tightens to full lock, pushed out of it it opens to
 * CARVE_STEER_WIDE. The tighter the carve, the faster it charges.
 */
export const CARVE_STEER_MID = 0.55;
export const CARVE_STEER_WIDE = 0.15;
/** Too slow to carve: below this the trigger brakes. */
export const CARVE_MIN_SPEED = 40;
/** Turn rate ceiling while carving, as a multiple of the frame's own. */
export const CARVE_TURN = 1.35;
/** Charge for each tier: a carve at full lock through a bend of CARVE_BEND_RADIUS charges 1 a second. */
export const CARVE_TIERS = [0.5, 1.1, 1.8] as const;
/** Burst for each tier: extra top speed, and seconds it lasts. */
export const CARVE_BURST = [0.15, 0.25, 0.35] as const;
export const CARVE_BURST_SECS = [0.5, 0.8, 1.1] as const;
/**
 * How the bend sets the charge rate: a carve with the bend charges at
 * (CARVE_BEND_RADIUS / radius), held to [CARVE_BEND_MIN, CARVE_BEND_MAX]; a
 * straight, or a carve against the bend, at CARVE_BEND_MIN. Weaving down a
 * straight earns next to nothing.
 */
export const CARVE_BEND_RADIUS = 250;
export const CARVE_BEND_MIN = 0.15;
export const CARVE_BEND_MAX = 1.6;
/** Speed (u/s) at which the charge rate stops growing with speed. */
export const CARVE_FULL_SPEED = 100;

/** Speed pads: ticks of extra top speed, and how much. */
export const PAD_TICKS = 60;
export const PAD_MULT = 1.18;

// ---- Battle mode ---------------------------------------------------------
export const LOCK_RANGE = 95;
export const LOCK_BREAK = 125;
export const LOCK_BREAK_TICKS = 40;
export const AUTO_LOCK_RANGE = 45;
export const BATTLE_CAP_MULT = 1.04; // of the limiter on laps 1-2, closing on a target ahead
export const BATTLE_CAP_LAP3 = 0.93; // of the class top speed on lap 3
export const BATTLE_MIN_FRAC = 0.9; // of the limiter: the slowest a fight is carried
/** A stagger bleeds less speed in a lock than at racing speed, so a fight keeps moving. */
export const BATTLE_STAGGER_DRAG = 6;
/** How far a lock's carry leans toward race pace rather than the target's own speed. */
export const BATTLE_CARRY_PACE = 0.3;
export const FACE_RATE = 12;
/**
 * How fast an attacker still turns after its target while an attack winds
 * up (rad/s); once the blow is live it turns no more, and its lunge goes the
 * way it faces. Quick enough to follow a rival strafing at fighting range
 * (about 3 rad/s at 10 units), far too slow to follow a guard swing, so a
 * swing that reads the tell takes the mech out of the blow's arc. At
 * FACE_RATE every blow turned with the swing and landed once its
 * invulnerability ran out.
 */
export const ATTACK_TRACK_RATE = 3;
export const ATTACK_MOVE_SCALE = 0.35;
export const LINK_RANGE = 26; // escorting an ally inside this shares Drive
export const DRIVE_LINK = 2.5;

// ---- Combat --------------------------------------------------------------
export const GUARD_REDUCTION = 0.15; // damage multiplier while guarding
export const GUARD_ARC = 1.9; // radians either side of facing
export const GUARD_REGEN_DELAY = 50;
export const GUARD_BREAK_STAGGER = 70;
export const PARRY_WINDOW = 8; // ticks after raising guard
/** The guard must have been down this long for the next raise to parry. */
export const PARRY_REARM = 30;
export const PARRY_STAGGER = 36;
export const DASH_TICKS = 14;
/**
 * Guard swing: with the guard up, A and the stick to one side carve a fast
 * arc round the target instead of a dash. The stick has to be at least this
 * far over, and further to the side than up or down.
 */
export const ARC_MIN_STEER = 0.35;
/**
 * Fastest a swing carries a mech round its target (u/s, at the start of the
 * swing, where it is quickest): from further out it goes less far round.
 */
export const ARC_MAX_SPEED = 150;
/** Share of the swing (from the start) that is invulnerable. */
export const ARC_IFRAME_SHARE = 0.6;
/**
 * A dash down the road only carries this share of its speed over the battle
 * cap, and what is left over is scrubbed off as soon as the dash ends. A dash
 * is for moving around a fight; it is not a second, cheaper boost.
 */
export const DASH_OVER = 0.3;
export const DASH_BLEED = 300;
export const DASH_COOLDOWN = 26;
export const COMBO_CANCEL_DELAY = 3;
/**
 * An attack, heavy or dash pressed while the mech cannot do it yet (still in
 * another move, staggered, cooling down) is held this many ticks and done
 * the moment it can be, so a press a beat early is not lost.
 */
export const INPUT_BUFFER = 8;
export const CHAIN_LIMIT = 4; // hits in one stagger chain before a free escape
/**
 * The rounds of one burst from one gun, landing inside this many ticks of
 * each other, count once toward a stagger chain: a carbine's three rounds
 * are one hit for this purpose, as a scatter blast already was.
 */
export const CHAIN_SAME_SHOT = 20;
/** How much harder a fully charged heavy hits (see AttackDef.charge). */
export const CHARGE_BONUS = 0.6;
export const CHAIN_TICKS = 75;
export const ESCAPE_IFRAMES = 50;
export const ESCAPE_SHOVE_RANGE = 14;
/** A wall splat is credited to whoever landed a hit this recently. */
export const SPLAT_CREDIT_TICKS = 150;
export const COUNTER_HIT = 1.15; // damage bonus for hitting a wind-up
export const WALL_SPLAT_MIN = 14;
export const WALL_SPLAT_DAMAGE = 1.6; // per u/s of lateral speed, on top of rules.ringoutDamage
/** A ring-out (knocked into the barrier while staggered) leaves the mech tumbling this long... */
export const RINGOUT_STAGGER = 36;
/** ...and throws it back off the barrier at this share of the speed it arrived with. */
export const RINGOUT_BOUNCE = 0.45;
/** Drive to the pilot credited with a ring-out. */
export const RINGOUT_DRIVE = 8;
/**
 * Momentum: free steering on a boost, an Overdrive or a charged slipstream
 * (the tow is at full strength from half charge) primes the next attack for
 * rules.momentumSecs. Battle mode only spends it, and only a melee blow
 * takes it.
 */
export const MOMENTUM_TOW = 0.5;
/** A momentum strike's stagger, as a multiple of the move's own. */
export const MOMENTUM_STAGGER = 1.25;
/** A clean hit at racing speed costs a little pace: about 1% per 9 damage, never more than 12%. */
export const HIT_SLOW_MAX = 0.12;
export const HIT_SLOW_PER_DAMAGE = 1 / 900;
export const CRITICAL_HP = 0.25;

// ---- Abilities -----------------------------------------------------------
// Each frame has two, on one button: one while free steering, one while
// locked on. Each use burns a Cell. Durations and strengths are in rules.ts.
export const ABILITY = { OVERDRIVE: 0, BREAKAWAY: 1, SNARE: 2, PULSE: 3, RAM: 4, AEGIS: 5 } as const;
export type Ability = (typeof ABILITY)[keyof typeof ABILITY];
export interface AbilityDef {
  key: string;
  name: string;
  blurb: string;
}
export const ABILITIES: AbilityDef[] = [
  { key: 'overdrive', name: 'Overdrive', blurb: 'A few seconds far past top speed. Ignores armour damage.' },
  { key: 'breakaway', name: 'Break Away', blurb: 'Works even mid-hit: shake every lock and burst clear.' },
  { key: 'snare', name: 'Snare', blurb: 'A bolt that drags a rival\'s top speed down and kills its boost.' },
  { key: 'pulse', name: 'Disruptor', blurb: 'A pulse that interrupts everyone close by and drains their Drive.' },
  { key: 'ram', name: 'Ram', blurb: 'An unstoppable charge. Whatever it hits is thrown aside.' },
  { key: 'aegis', name: 'Aegis', blurb: 'A shield over you and teammates nearby.' },
];
/** Ticks between ability uses, so one press cannot burn two Cells. */
export const ABILITY_COOLDOWN = 45;
export const BREAKAWAY_IFRAMES = 40;
/** A ram only lands with at least this much closing speed, u/s. */
export const RAM_MIN_CLOSING = 3;
/** ...and only on something in front of the rammer: radians either side of its facing. */
export const RAM_ARC = 1.9;
export const RAM_SHOVE = 30;
export const RAM_MASS = 3;

export interface ClassDef {
  role: Role;
  /** Frame (mech model) name. */
  frame: string;
  blurb: string;
  maxHp: number;
  radius: number;
  mass: number;
  topSpeed: number;
  accel: number;
  brake: number;
  /** Lateral acceleration available for steering, u/s^2. */
  grip: number;
  turnMax: number;
  battleAccel: number;
  strafe: number;
  approach: number;
  guardMax: number;
  guardRegen: number;
  dash: number;
  dashCost: number;
  dashIframes: number;
  /** First attack of the primary chain, and the secondary. Indices into ATTACKS. */
  primary: number;
  secondary: number;
  /** Range the AI likes to fight at (centre to centre). */
  aiRange: number;
  /** Ability while free steering, and while locked on. Indices into ABILITIES. */
  abilityFree: Ability;
  abilityLocked: Ability;
}

export interface ShotDef {
  /** Trigger pulls in the move, and ticks between them. */
  count: number;
  interval: number;
  /** Projectiles per trigger pull. */
  pellets: number;
  speed: number;
  /** Half-angle of the random spread, radians. */
  spread: number;
  range: number;
}

export interface AttackDef {
  key: string;
  name: string;
  kind: 'melee' | 'shot';
  windup: number;
  active: number;
  recovery: number;
  /** Melee reach beyond the two body radii. */
  reach: number;
  /** Melee half-angle. */
  arc: number;
  damage: number;
  guardDamage: number;
  stagger: number;
  knockback: number;
  guardBreak: boolean;
  /** The attacker shrugs off light hits while this move is winding up. */
  armor: boolean;
  /** Closing speed toward the target during wind-up and active frames. */
  advance: number;
  driveCost: number;
  /** Ticks before the same slot can be used again, counted from the end. */
  cooldown: number;
  /** Combo follow-up, or -1. */
  next: number;
  heavy: boolean;
  /** A guard blocks it but cannot turn it. */
  noParry?: boolean;
  /**
   * Held through its wind-up, it holds there and charges for up to this many
   * ticks (0: it cannot be charged); let go, or fully charged, it goes. A
   * full charge hits CHARGE_BONUS harder (damage, guard damage, knockback).
   */
  charge?: number;
  shot?: ShotDef;
}

const melee = (a: Partial<AttackDef> & Pick<AttackDef, 'key' | 'name' | 'windup' | 'active' | 'recovery' | 'damage'>): AttackDef => ({
  kind: 'melee',
  reach: 5.5,
  arc: 1.05,
  guardDamage: Math.round(a.damage * 0.4),
  stagger: 16,
  knockback: 8,
  guardBreak: false,
  armor: false,
  advance: 20,
  driveCost: 0,
  cooldown: 0,
  next: -1,
  heavy: false,
  ...a,
});

export const ATK = {
  FW_SLASH1: 0,
  FW_SLASH2: 1,
  FW_SLASH3: 2,
  FW_LANCE: 3,
  MF_BURST: 4,
  MF_KICK: 5,
  DF_HAMMER1: 6,
  DF_HAMMER2: 7,
  DF_SCATTER: 8,
  // Ability hits. Not reachable from the attack buttons.
  MF_SNARE: 9,
  MF_PULSE: 10,
  DF_RAM: 11,
} as const;

export const ATTACKS: AttackDef[] = [
  // Forward: fast three-hit blade string, plus a gap-closing lance.
  melee({ key: 'fw_slash1', name: 'Edge', windup: 5, active: 4, recovery: 11, damage: 20, stagger: 14, knockback: 8, advance: 24, next: ATK.FW_SLASH2 }),
  melee({ key: 'fw_slash2', name: 'Edge', windup: 5, active: 4, recovery: 11, damage: 22, stagger: 14, knockback: 8, advance: 24, next: ATK.FW_SLASH3 }),
  melee({ key: 'fw_slash3', name: 'Edge Finish', windup: 11, active: 5, recovery: 20, damage: 40, stagger: 24, knockback: 30, advance: 28, heavy: true }),
  melee({ key: 'fw_lance', name: 'Lance Dash', windup: 15, active: 10, recovery: 22, damage: 56, stagger: 28, knockback: 34, reach: 6.5, advance: 75, armor: true, driveCost: 12, cooldown: 120, heavy: true, charge: 36 }),
  // Midfielder: carbine bursts at range, and a kick to make space.
  {
    // A burst about every half second, 21 to a burst: about 38 a second at
    // range, against the blades' 75 to 80 up close. Hold the trigger to keep
    // firing. (It was a burst every 1.2 s, 18 to a burst: 15 a second.)
    key: 'mf_burst', name: 'Carbine', kind: 'shot',
    windup: 5, active: 10, recovery: 8,
    reach: 0, arc: 0.4,
    damage: 7, guardDamage: 3, stagger: 4, knockback: 2,
    guardBreak: false, armor: false, advance: 0, driveCost: 0, cooldown: 10, next: -1, heavy: false,
    shot: { count: 3, interval: 4, pellets: 1, speed: 240, spread: 0.065, range: 62 },
  },
  melee({ key: 'mf_kick', name: 'Stun Kick', windup: 12, active: 5, recovery: 18, damage: 34, stagger: 28, knockback: 38, reach: 6, cooldown: 55, heavy: true, charge: 36 }),
  // Defender: slow hammer blows that break guards, and a scatter cannon.
  melee({ key: 'df_hammer1', name: 'Breaker', windup: 14, active: 5, recovery: 15, damage: 36, guardDamage: 30, stagger: 20, knockback: 14, reach: 6.5, arc: 1.15, advance: 14, armor: true, next: ATK.DF_HAMMER2 }),
  melee({ key: 'df_hammer2', name: 'Breaker Slam', windup: 20, active: 6, recovery: 25, damage: 54, guardDamage: 60, stagger: 30, knockback: 44, reach: 6.5, arc: 1.15, advance: 16, armor: true, guardBreak: true, heavy: true }),
  {
    key: 'df_scatter', name: 'Scatter Cannon', kind: 'shot',
    windup: 13, active: 2, recovery: 26,
    reach: 0, arc: 0.5,
    damage: 6, guardDamage: 5, stagger: 7, knockback: 5,
    // (Its cooldown was 160 ticks: at about 11 a second point blank it was the
    // weakest heavy of the three, and the defender's second button seldom
    // worth pressing.)
    guardBreak: false, armor: true, advance: 0, driveCost: 0, cooldown: 90, next: -1, heavy: true, charge: 36,
    shot: { count: 1, interval: 1, pellets: 6, speed: 210, spread: 0.22, range: 30 },
  },
  // Midfielder abilities: the Snare bolt and the Disruptor pulse.
  {
    key: 'mf_snare', name: 'Snare', kind: 'shot',
    windup: 0, active: 1, recovery: 0,
    reach: 0, arc: 0.55,
    damage: 18, guardDamage: 10, stagger: 6, knockback: 2,
    guardBreak: false, armor: false, advance: 0, driveCost: 0, cooldown: 0, next: -1, heavy: false,
    shot: { count: 1, interval: 1, pellets: 1, speed: 320, spread: 0.008, range: 100 },
  },
  melee({ key: 'mf_pulse', name: 'Disruptor', windup: 0, active: 1, recovery: 0, damage: 26, guardDamage: 40, stagger: 40, knockback: 30, advance: 0, heavy: true, noParry: true }),
  // Defender ability: the Ram. Damage comes from the rules.
  melee({ key: 'df_ram', name: 'Ram', windup: 0, active: 1, recovery: 0, damage: 80, guardDamage: 50, stagger: 34, knockback: 34, advance: 0, heavy: true, noParry: true }),
];

export const CLASSES: ClassDef[] = [
  {
    role: ROLE.FW, frame: 'Swift',
    blurb: 'Lightest and fastest. Wins the sprint if it survives the fight.',
    maxHp: 1600, radius: 3.0, mass: 0.8,
    topSpeed: 160, accel: 45, brake: 90, grip: 100, turnMax: 2.2,
    battleAccel: 80, strafe: 30, approach: 34,
    guardMax: 80, guardRegen: 18, dash: 78, dashCost: 10, dashIframes: 13,
    primary: ATK.FW_SLASH1, secondary: ATK.FW_LANCE, aiRange: 0,
    abilityFree: ABILITY.OVERDRIVE, abilityLocked: ABILITY.BREAKAWAY,
  },
  {
    role: ROLE.MF, frame: 'Vector',
    blurb: 'Balanced all-rounder. Controls space with carbine fire.',
    maxHp: 1600, radius: 3.4, mass: 1.0,
    topSpeed: 152.5, accel: 40, brake: 90, grip: 90, turnMax: 2.0,
    battleAccel: 68, strafe: 26, approach: 30,
    guardMax: 100, guardRegen: 18, dash: 68, dashCost: 15, dashIframes: 10,
    primary: ATK.MF_BURST, secondary: ATK.MF_KICK, aiRange: 30,
    abilityFree: ABILITY.SNARE, abilityLocked: ABILITY.PULSE,
  },
  {
    role: ROLE.DF, frame: 'Bulwark',
    blurb: 'Heavy bruiser. Breaks guards and shrugs off light hits.',
    maxHp: 2000, radius: 4.0, mass: 1.45,
    topSpeed: 145, accel: 35, brake: 90, grip: 80, turnMax: 1.8,
    battleAccel: 56, strafe: 22, approach: 26,
    guardMax: 130, guardRegen: 20, dash: 58, dashCost: 18, dashIframes: 8,
    primary: ATK.DF_HAMMER1, secondary: ATK.DF_SCATTER, aiRange: 0,
    abilityFree: ABILITY.RAM, abilityLocked: ABILITY.AEGIS,
  },
];

export function attackTotal(a: AttackDef): number {
  return a.windup + a.active + a.recovery;
}

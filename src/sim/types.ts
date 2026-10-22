import type { Ability, Act, Mode, Phase, Role, Tactic } from './config';
import type { Rules } from './rules';

/** What a controller (pad, keyboard, network client or AI) asks for each tick. */
export interface MechInput {
  /** Left stick. Speed mode: mx steers. Battle mode: my closes on the target, mx circles it. */
  mx: number;
  my: number;
  throttle: number;
  brake: number;
  /** Held buttons, a BTN bitmask. The sim finds the press edges itself. */
  buttons: number;
  /** Tactic key held this tick: 0 for none, else a TACTIC value. */
  cmd: number;
}

export function emptyInput(): MechInput {
  return { mx: 0, my: 0, throttle: 0, brake: 0, buttons: 0, cmd: 0 };
}

export interface AiState {
  /** 0 race, 1 engage an enemy, 2 escort an ally. */
  intent: number;
  intentTarget: number;
  nextThink: number;
  /** Personal lateral bias so the field does not queue on one line. */
  lane: number;
  orbit: number;
  orbitUntil: number;
  attackAt: number;
  guardFrom: number;
  guardUntil: number;
  dodgeAt: number;
  /** ...and whether that dodge is a guard swing round the attacker rather than a dash. */
  dodgeArc: boolean;
  /** Attack instance (attacker id * 100000 + start tick) already reacted to. */
  reactedTo: number;
  comboLeft: number;
  boostUntil: number;
  /** A burn started to spend the gauge runs down to this much Drive (-1: none under way). */
  boostFloor: number;
  /** AI fights in bouts: engaged until boutUntil, then rests until restUntil. */
  boutUntil: number;
  restUntil: number;
  /** Gates this pilot means to go for on the formation lap, one bit each. */
  gates: number;
  /** Next tick the pilot will consider using an ability. */
  abilityAt: number;
  /** Flying in hot: until this tick, hold off the lock and strike on arrival. */
  hotUntil: number;
  /** Next tick a hot approach may be considered. */
  hotNext: number;
  /** The bend (its direction, 1 or -1; 0 for none) the carve decision below was made for. */
  carveFor: number;
  /** Whether this pilot carves through that bend. */
  carveGo: boolean;
  /** A heavy held to charge: Y stays down until this tick. */
  holdUntil: number;
  /** A midfielder closing in for a kick, until this tick. */
  closeUntil: number;
}

export interface MechState {
  id: number;
  team: number;
  role: Role;
  /** True when a person holds this seat. AI flies it otherwise. */
  human: boolean;
  name: string;
  /** The pilot's portrait: an index into the gallery, or -1 for the faction's own pilot for the seat. Shown only. */
  portrait: number;
  /** A custom mech (custom/mechBuild.ts, as text), or '' for the faction's stock mech. Shown only. */
  look: string;
  /**
   * The pilot's colour, an index into the pilot colours (net/protocol
   * PILOT_COLOURS): a pilot flying for no faction (a person in a Sprint)
   * wears it. -1 for none. Shown only: the race never reads it.
   */
  colour: number;
  /** AI skill 0..1. */
  skill: number;

  // --- position, in track coordinates
  /** Distance from the start line, not wrapped: lap = floor(s / length). */
  s: number;
  d: number;
  vs: number;
  vd: number;
  speed: number;
  /** Direction of travel relative to the track, radians, positive to the right. */
  heading: number;
  /** Which way the body faces, relative to the track. */
  facing: number;
  steer: number;
  /** Height above the road surface and its rate of change (only ever non-zero off the ground). */
  h: number;
  vh: number;
  /** Off the ground: over a jump, off a crest, over an open edge. */
  air: boolean;
  /** Ticks left out of the race after falling (into a jump gap, off an open edge); 0 in play. */
  fallT: number;
  /** Ticks left of a speed pad's push. */
  padT: number;

  // --- lock-on
  mode: Mode;
  target: number;
  outOfRange: number;
  /**
   * The rival last locked on to, or -1. Escorting a team-mate, the escort
   * button (or the lock button) goes back to it, so a stray press on the
   * escort button costs one more press, not the fight.
   */
  lastFoe: number;

  // --- gauges
  hp: number;
  /** Armour when undamaged: the frame's, scaled by the rules. */
  maxHp: number;
  guard: number;
  drive: number;

  // --- action state machine
  act: Act;
  actT: number;
  actDur: number;
  attack: number;
  attackStart: number;
  attackHit: boolean;
  /** The attack under way is a momentum strike. */
  atkCharged: boolean;
  comboQueued: boolean;
  guarding: boolean;
  guardT: number;
  guardIdle: number;
  /** Ticks the guard button has been up, for re-arming the parry. */
  guardRest: number;
  iframes: number;
  chain: number;
  chainT: number;
  /** Tick the chain counter last went up (one count per tick, however many pellets land). */
  chainTick: number;
  /** Who last added to the chain, and with what (attacker id * 64 + attack), for CHAIN_SAME_SHOT. */
  chainKey: number;
  /** A press of X, Y or A waiting to be done (see INPUT_BUFFER), and ticks it has left. */
  bufBtn: number;
  bufT: number;
  /** Ticks the current attack has been held charging (see AttackDef.charge). */
  chargeT: number;
  /** The current attack was started by its own button, which may still be held to charge it. */
  chargeOn: boolean;
  cdPrimary: number;
  cdSecondary: number;
  cdDash: number;

  // --- Cells and abilities
  /** Ability charges. A gate gives a fraction of one; an ability burns one. */
  cells: number;
  /** Gates already threaded this lap, one bit each. */
  gateMask: number;
  cdAbility: number;
  /** Ticks left of each effect. */
  overdriveT: number;
  ramT: number;
  /** Mechs this ram has already hit, one bit each. */
  ramHits: number;
  shieldT: number;
  snareT: number;
  /** While this runs no enemy can lock on. */
  cloakT: number;

  // --- carving
  /** Holding a carve (the brake trigger with the stick over). */
  carving: boolean;
  /** Which way the carve turns: 1 right, -1 left. */
  carveDir: number;
  /** Charge built in this carve, in seconds of a full carve. */
  carveCharge: number;
  /** Tier the charge has reached, 0 to 3. */
  carveTier: number;
  /** Ticks left of a carve's burst, and the extra top speed it gives. */
  carveT: number;
  carveBoost: number;
  /**
   * A guard swing under way: which way (1 right, -1 left, 0 none), where it
   * started (the angle of the mech seen from its target, in (s, d)), how far
   * round it goes (signed, radians) and at what radius.
   */
  arcDir: number;
  arcFrom: number;
  arcSweep: number;
  arcR: number;
  /** Ticks off the ground in the current flight (for a clean landing). */
  airT: number;

  // --- flags for presentation
  boosting: boolean;
  /** Ticks left of a lit boost's minimum burn (see BOOST_MIN_BURN). */
  boostT: number;
  /** Ticks left in which a boost that went out can be picked back up as the same one (see BOOST_RELIGHT). */
  relightT: number;
  onStrip: boolean;
  drafting: boolean;
  /** Slipstream charge 0..1: builds in a tow, lingers after pulling out. */
  tow: number;
  /**
   * The last support teammate (a midfielder or defender) whose slipstream this
   * mech was in, and when: a pass soon after pays that teammate a Lead-out.
   * Rivals' tows do not count, so closing up behind the mech about to be
   * passed does not wipe it.
   */
  towBy: number;
  towByTick: number;
  /** When this mech last earned Drive for passing each rival (by id). */
  passTick: number[];
  /** Ticks the next attack stays primed by a boost, Overdrive or slipstream. */
  momentum: number;
  linked: boolean;
  wall: number;

  // --- race progress
  lap: number;
  finished: boolean;
  finishTime: number;
  retired: boolean;
  retireTick: number;
  place: number;
  points: number;

  // --- bookkeeping
  prevButtons: number;
  prevCmd: number;
  /** The rev-up on the grid, 0 to 1 (see REV_RISE): where it stands at GO sets the start. */
  rev: number;
  /** An AI's rev-up: the countdown tick it starts holding the throttle (-1: it does not). */
  revFrom: number;
  /** Ticks left of a bogged start, the throttle doing nothing (see BOG_TICKS). */
  bogT: number;
  lastHitBy: number;
  lastHitTick: number;
  deniedTick: number;
  dmgDealt: number;
  dmgTaken: number;
  kos: number;

  // --- support points
  /** Support points earned this race (capped by rules.supportCap). They count for the team. */
  support: number;
  /** Points earned by each kind of award (AWARD), for the results. */
  awardPts: number[];
  /** Tick each award kind last scored against each rival: [kind * 8 + rival]. */
  awardTick: number[];
  /** Tick this mech last took damage from each mech, by id: for assists. */
  hurtBy: number[];
  /** Damage dealt to the rival forward not yet turned into Pressure points. */
  pressure: number;
  /** Damage dealt to rivals fighting a teammate, not yet turned into Back-up points. */
  backup: number;
  /** Damage an Aegis this mech cast has kept off teammates, and whether it has scored yet. */
  aegisSaved: number;
  aegisPaid: boolean;
  /** Who cast the Aegis this mech is under, or -1. */
  shieldBy: number;
  ai: AiState;
}

export interface Projectile {
  id: number;
  owner: number;
  team: number;
  attack: number;
  /** Fired as a momentum strike. */
  charged: boolean;
  /** How hard it hits from a held charge: 1, up to 1 + CHARGE_BONUS. */
  power: number;
  s: number;
  d: number;
  /** Height above the road it was fired at. */
  h: number;
  vs: number;
  vd: number;
  life: number;
}

export interface TeamState {
  tactic: Tactic;
  /** Enemy mech the team is told to focus, or -1. */
  mark: number;
  /** Next tick the AI captain reconsiders (teams without a human). */
  captainAt: number;
  captainPhase: number;
  /**
   * Who may call this team's tactics (see CALLER). CALLER.ANY, the default,
   * is the offline rule: any person on the team calls, and the computer
   * captain calls for a team with nobody human on it. Online the room sets
   * it: one seat (a mech id), nobody, or the computer captain.
   */
  caller: number;
}

export type SimEvent =
  | { type: 'countdown'; n: number }
  /** Each mech's start, at GO: `grade` is a START value. */
  | { type: 'launch'; mech: number; grade: number }
  | { type: 'lapPhase'; lap: number }
  | { type: 'lap'; mech: number; lap: number }
  | { type: 'finish'; mech: number; place: number }
  | { type: 'raceEnd' }
  | { type: 'swing'; mech: number; attack: number }
  /** A heavy held to charge: `full` false as the charge starts, true when it is full. */
  | { type: 'charge'; mech: number; attack: number; full: boolean }
  | { type: 'windup'; mech: number; attack: number; charged: boolean }
  | { type: 'shot'; mech: number; attack: number; proj: number }
  | { type: 'hit'; attacker: number; victim: number; attack: number; damage: number; blocked: boolean; heavy: boolean; charged: boolean; s: number; d: number }
  | { type: 'parry'; mech: number; attacker: number }
  | { type: 'guardBreak'; mech: number; by: number }
  | { type: 'evade'; mech: number }
  | { type: 'escape'; mech: number }
  /**
   * A ring-out: knocked into the barrier while reeling. `by` is the pilot
   * credited, or -1. `side` is the way the mech was travelling into the
   * wall; `face` is where the wall's face is (d), which is not the edge of
   * the road when it is the wall down the middle of a fork.
   */
  | { type: 'splat'; mech: number; by: number; damage: number; intensity: number; s: number; side: number; face: number }
  | { type: 'ko'; mech: number; by: number }
  | { type: 'wall'; mech: number; intensity: number; s: number; side: number; face: number }
  /** Left the ground (a jump, a crest, an open edge). */
  | { type: 'airborne'; mech: number }
  /** Back on the road. `intensity` is how fast it was coming down. */
  | { type: 'land'; mech: number; intensity: number }
  /** Fell (short of a landing, off an open edge). `by` is the pilot credited, or -1. */
  | { type: 'fall'; mech: number; by: number; damage: number }
  /** Put back on the road by the recovery drone. */
  | { type: 'recover'; mech: number }
  /** Ran over a speed pad. */
  | { type: 'pad'; mech: number }
  | { type: 'bump'; a: number; b: number; intensity: number }
  | { type: 'lock'; mech: number; target: number }
  | { type: 'unlock'; mech: number }
  | { type: 'dash'; mech: number }
  | { type: 'arc'; mech: number; dir: number }
  | { type: 'boost'; mech: number }
  | { type: 'denied'; mech: number; reason: 'weapons' | 'drive' | 'target' | 'cells' | 'switch' | 'lap' | 'cooldown' }
  | { type: 'gate'; mech: number; gate: number; cells: number }
  /** A teammate's gate paid this mech its share (see rules.gateShare). */
  | { type: 'gateShare'; mech: number; from: number; gate: number; cells: number }
  /** A carve's charge reached a new tier (1 to 3). */
  | { type: 'carve'; mech: number; tier: number }
  /** A carve let go with charge in it: the burst. */
  | { type: 'carveBurst'; mech: number; tier: number }
  /** Passed another mech close enough to touch. */
  | { type: 'pass'; mech: number; other: number }
  /** A support action scored: `points` for the team (after the cap), against `victim` (or -1). */
  | { type: 'award'; mech: number; kind: number; points: number; victim: number }
  | { type: 'ability'; mech: number; ability: Ability }
  | { type: 'snared'; mech: number; by: number }
  | { type: 'tactic'; team: number; tactic: Tactic; by: number; mark: number }
  | { type: 'projEnd'; proj: number; hit: boolean };

export interface RaceState {
  tick: number;
  phase: Phase;
  /** Sprint (RaceConfig.mode): every pilot its own team, no team play, placing points only. */
  sprint: boolean;
  rng: number;
  /** Tunable rules for this race. Plain numbers, part of the state. */
  rules: Rules;
  laps: number;
  /** 1 formation, 2 battle, 3 speed. Follows the race leader. */
  lapPhase: number;
  /** Distance of the leading mech still racing. */
  leaderS: number;
  mechs: MechState[];
  projectiles: Projectile[];
  nextProjId: number;
  teams: TeamState[];
  firstFinishTick: number;
  endTick: number;
  /** Tick until which each Cell gate is dark after being taken; lit once the tick passes it. */
  gateDark: number[];
  /** Events raised during the most recent step. */
  events: SimEvent[];
}

export interface SeatConfig {
  team: number;
  role: Role;
  human: boolean;
  name: string;
  /** The pilot's portrait (see MechState.portrait); -1 if left out. */
  portrait?: number;
  /** A custom mech (see MechState.look); stock if left out. */
  look?: string;
  /** The pilot's colour (see MechState.colour); none if left out. */
  colour?: number;
  skill: number;
}

export interface RaceConfig {
  seed: number;
  seats: SeatConfig[];
  laps?: number;
  /** Overrides for the default rules. */
  rules?: Partial<Rules>;
  /** Swap the two teams' sides of the grid (alternated round by round). */
  gridFlip?: boolean;
  /**
   * 'teams' (the default): two teams of three. 'sprint': every pilot for
   * themselves, each seat its own team (seat.team its own number), all
   * Forwards; no team play, and placing points only (SPRINT_POINTS).
   */
  mode?: 'teams' | 'sprint';
  /** Sprint: the grid, mech ids from pole back (by seat order if left out). */
  grid?: number[];
}

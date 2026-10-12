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
  /** Attack instance (attacker id * 100000 + start tick) already reacted to. */
  reactedTo: number;
  comboLeft: number;
  boostUntil: number;
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
}

export interface MechState {
  id: number;
  team: number;
  role: Role;
  /** True when a person holds this seat. AI flies it otherwise. */
  human: boolean;
  name: string;
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

  // --- lock-on
  mode: Mode;
  target: number;
  outOfRange: number;

  // --- gauges
  hp: number;
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

  // --- flags for presentation
  boosting: boolean;
  onStrip: boolean;
  drafting: boolean;
  /** Slipstream charge 0..1: builds in a tow, lingers after pulling out. */
  tow: number;
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
  prevThrottle: number;
  /** Tick the throttle last went down, for the launch bonus. */
  throttleTick: number;
  /** Ticks the throttle had been up before that press. */
  throttleRest: number;
  lastHitBy: number;
  lastHitTick: number;
  deniedTick: number;
  dmgDealt: number;
  dmgTaken: number;
  kos: number;
  ai: AiState;
}

export interface Projectile {
  id: number;
  owner: number;
  team: number;
  attack: number;
  /** Fired as a momentum strike. */
  charged: boolean;
  s: number;
  d: number;
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
}

export type SimEvent =
  | { type: 'countdown'; n: number }
  | { type: 'launch'; mech: number }
  | { type: 'lapPhase'; lap: number }
  | { type: 'lap'; mech: number; lap: number }
  | { type: 'finish'; mech: number; place: number }
  | { type: 'raceEnd' }
  | { type: 'swing'; mech: number; attack: number }
  | { type: 'windup'; mech: number; attack: number; charged: boolean }
  | { type: 'shot'; mech: number; attack: number; proj: number }
  | { type: 'hit'; attacker: number; victim: number; attack: number; damage: number; blocked: boolean; heavy: boolean; charged: boolean; s: number; d: number }
  | { type: 'parry'; mech: number; attacker: number }
  | { type: 'guardBreak'; mech: number; by: number }
  | { type: 'evade'; mech: number }
  | { type: 'escape'; mech: number }
  /** A ring-out: knocked into the barrier while reeling. `by` is the pilot credited, or -1. */
  | { type: 'splat'; mech: number; by: number; damage: number; intensity: number; s: number; side: number }
  | { type: 'ko'; mech: number; by: number }
  | { type: 'wall'; mech: number; intensity: number; s: number; side: number }
  | { type: 'bump'; a: number; b: number; intensity: number }
  | { type: 'lock'; mech: number; target: number }
  | { type: 'unlock'; mech: number }
  | { type: 'dash'; mech: number }
  | { type: 'boost'; mech: number }
  | { type: 'denied'; mech: number; reason: 'weapons' | 'drive' | 'target' | 'cells' | 'switch' }
  | { type: 'gate'; mech: number; gate: number; cells: number }
  | { type: 'ability'; mech: number; ability: Ability }
  | { type: 'snared'; mech: number; by: number }
  | { type: 'tactic'; team: number; tactic: Tactic; by: number; mark: number }
  | { type: 'projEnd'; proj: number; hit: boolean };

export interface RaceState {
  tick: number;
  phase: Phase;
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
  /** Events raised during the most recent step. */
  events: SimEvent[];
}

export interface SeatConfig {
  team: number;
  role: Role;
  human: boolean;
  name: string;
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
}

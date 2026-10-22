// Everything that can be dialled in while playing. Two kinds of number live
// here: race rules (simulation, see src/sim/rules.ts) and "feel" (camera and
// effects, client only). The tuning panel edits both through one list of
// descriptors, and the values are remembered between visits.
//
// When a set of values feels right, "Copy values" on the panel gives a small
// block of text to paste back so they can be made the defaults.
import { DEFAULT_RULES, MPH_PER_UNIT, RULE_KEYS, makeRules, type RuleKey, type Rules } from '../../sim/index';

export interface Feel {
  /** The 80s anime look (1) or the plain one (0). */
  look: number;
  /** Its film layer: grain, halation, softness, aberration. */
  lookFilm: number;
  /** Its ink lines. */
  lookInk: number;
  /** How much the lines and grain boil from one drawing to the next. */
  lookBoil: number;
  /** Drawings a second for mech poses and effects; 0 animates smoothly. */
  lookSteps: number;
  /** A frame or two of flat ink on a big hit. */
  lookImpact: number;
  /** A painted still when you take part in a knockout. */
  lookStill: number;
  /** The anime look drawn at 30 frames a second (the race still runs at 60). */
  lookThirty: number;
  camHeight: number;
  camDist: number;
  camDistSpeed: number;
  camLookAhead: number;
  camLookHeight: number;
  camFov: number;
  camFovSpeed: number;
  camFovBoost: number;
  /** Degrees the view jumps wider for a moment as a boost lights. */
  camLurch: number;
  camLockDist: number;
  camLockHeight: number;
  camShake: number;
  camPunch: number;
  camRumble: number;
  speedBlur: number;
  speedLines: number;
  lockSpeedFx: number;
  sparks: number;
  trails: number;
  rumble: number;
  bloom: number;
  /** Size of the wind-up tells; 0 turns them off. */
  tells: number;
  /** Brightness of the barrier's pulse where something hits it. */
  wallPulse: number;
  // sound
  volMaster: number;
  volMusic: number;
  volEffects: number;
  mixEngine: number;
  mixWind: number;
  mixAfterburner: number;
  mixStrip: number;
  mixSlipstream: number;
  mixScrape: number;
  mixAlarm: number;
}

export const DEFAULT_FEEL: Readonly<Feel> = Object.freeze({
  look: 1,
  lookFilm: 1,
  lookInk: 1,
  lookBoil: 1,
  lookSteps: 12,
  lookImpact: 1,
  lookStill: 1,
  lookThirty: 0,
  camHeight: 8.4,
  camDist: 13,
  camDistSpeed: 2.4,
  camLookAhead: 26,
  camLookHeight: 4,
  camFov: 64,
  camFovSpeed: 18,
  camFovBoost: 9,
  camLurch: 7,
  camLockDist: 12.5,
  camLockHeight: 8.2,
  camShake: 1,
  camPunch: 1,
  camRumble: 1,
  speedBlur: 1,
  speedLines: 1,
  lockSpeedFx: 1,
  sparks: 1,
  trails: 1,
  rumble: 1,
  bloom: 0.42,
  tells: 1,
  wallPulse: 1,
  volMaster: 0.8,
  volMusic: 0.45,
  volEffects: 0.9,
  mixEngine: 1,
  mixWind: 1,
  mixAfterburner: 1,
  mixStrip: 1,
  mixSlipstream: 1,
  mixScrape: 1,
  mixAlarm: 1,
});

export type FeelKey = keyof Feel;
export const FEEL_KEYS = Object.keys(DEFAULT_FEEL) as FeelKey[];

export interface TuneItem {
  kind: 'rule' | 'feel';
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** How the number is shown. Rules stay in simulation units underneath. */
  show?: 'mph' | 'pct' | 'bonus' | 'x' | 'sec' | 'int' | 'onoff';
  hint?: string;
}

export interface TuneGroup {
  title: string;
  items: TuneItem[];
}

const rule = (key: RuleKey, label: string, min: number, max: number, step: number, show?: TuneItem['show'], hint?: string): TuneItem => ({ kind: 'rule', key, label, min, max, step, show, hint });
const feel = (key: FeelKey, label: string, min: number, max: number, step: number, show?: TuneItem['show'], hint?: string): TuneItem => ({ kind: 'feel', key, label, min, max, step, show, hint });

export const TUNE_GROUPS: TuneGroup[] = [
  {
    title: 'Look',
    items: [
      feel('look', '80s anime look', 0, 1, 1, 'onoff', 'Cel shading, ink lines, film and animation drawn on twos. Off: the plain look. G on the keyboard switches it too.'),
      feel('lookFilm', 'Film', 0, 2, 0.05, 'x', 'Grain, halation, softness and colour fringe.'),
      feel('lookInk', 'Ink lines', 0, 2, 0.05, 'x'),
      feel('lookBoil', 'Line boil', 0, 2, 0.05, 'x', 'How much the lines and the grain shift from one drawing to the next.'),
      feel('lookSteps', 'Drawings a second', 0, 30, 1, 'int', 'Mech poses and effects. 12 is animation on twos; 8 on threes; 30 is the smoother choice in Video settings; 0 animates smoothly. The race and the camera always run at full speed.'),
      feel('lookImpact', 'Impact frames', 0, 1, 1, 'onoff', 'A flash of flat ink on a big hit you are part of. At most one every 1.2 seconds.'),
      feel('lookStill', 'Knockout still', 0, 1, 1, 'onoff', 'A painted freeze-frame when you take part in a knockout.'),
      feel('lookThirty', '30 frames a second', 0, 1, 1, 'onoff', 'Draw the anime look at 30 frames a second, as the series was shown. The race, the controls and the HUD still run at full speed.'),
    ],
  },
  {
    title: 'Pace',
    items: [
      rule('limiter1', 'Limiter, lap 1', 80, 160, 1, 'mph'),
      rule('limiter2', 'Limiter, lap 2', 80, 180, 1, 'mph'),
      rule('topScale', 'Top speed, lap 3', 0.7, 1.4, 0.01, 'x', 'Scales every frame. 1.00 puts the forward at 480 mph.'),
      rule('boostMult', 'Boost', 1.05, 1.5, 0.01, 'bonus'),
      rule('armourFloor', 'Speed left with no armour', 0.7, 1, 0.01, 'pct', 'Lap 3 only. 100% means damage never costs speed.'),
    ],
  },
  {
    title: 'Combat',
    items: [
      rule('battleMove', 'Movement while locked on', 0.6, 2.2, 0.05, 'x'),
      rule('momentumSecs', 'Momentum lasts', 0, 2, 0.05, 'sec', 'How long a boost, Overdrive or slipstream keeps your next blow primed. 0 turns momentum off.'),
      rule('momentumDamage', 'Momentum strike damage', 1, 2, 0.05, 'x'),
      rule('momentumKnock', 'Momentum strike knockback', 1, 2.5, 0.05, 'x'),
      rule('ringoutThrow', 'Heavy blows: throw across the road', 0.8, 2, 0.05, 'x', 'How hard heavy blows throw a mech toward the barrier.'),
      rule('ringoutDamage', 'Ring-out damage', 0, 60, 1, 'int', 'Damage for being thrown into the barrier, before the part that grows with the impact.'),
      rule('arcAngle', 'Guard swing: how far round', 0, 270, 5, 'int', 'Degrees round the target. Less from further out, so it never goes round faster than 150 u/s. 0 turns the swing off.'),
      rule('arcSecs', 'Guard swing: time', 0.2, 0.8, 0.01, 'sec'),
      rule('armourScale', 'Armour', 0.5, 1.5, 0.05, 'x', 'Scales every frame. 1.00 is 1600 for the Swift and Vector, 2000 for the Bulwark.'),
    ],
  },
  {
    title: 'Carving',
    items: [
      rule('carveGrip', 'Grip while carving', 1, 2.5, 0.05, 'x'),
      rule('carveDrag', 'Speed lost carving', 0, 30, 1, 'int', 'Per second, with the stick hard over. Less with less stick.'),
      rule('carveCharge', 'Charge rate', 0.3, 3, 0.05, 'x', 'How fast a carve climbs the three spark colours.'),
      rule('carveBurst', 'Burst on release', 0, 2, 0.05, 'x', 'Scales the burst: +15%, +25% or +35% for 0.5, 0.8 or 1.1 seconds. 0 turns it off.'),
    ],
  },
  {
    title: 'Slipstream',
    items: [
      rule('tow', 'Tow, laps 1 and 2', 0, 0.15, 0.005, 'bonus'),
      rule('tow3', 'Tow, lap 3', 0, 0.2, 0.005, 'bonus'),
      rule('towRange3', 'Tow reach, lap 3', 30, 320, 5, 'int', 'How far back the tow can be felt, in metres.'),
      rule('towBuild', 'Time to build', 0.2, 3, 0.1, 'sec'),
      rule('slingshot', 'Slingshot length', 0.2, 5, 0.1, 'sec', 'How long the tow lasts after you pull out. Full strength for the first half.'),
    ],
  },
  {
    title: 'Drive and Cells',
    items: [
      rule('driveStart', 'Drive on the grid', 0, 100, 5, 'int'),
      rule('driveStripLap1', 'Charge strip, lap 1', 0, 20, 0.5, 'int', 'Drive per second.'),
      rule('driveStrip', 'Charge strip, later laps', 0, 20, 0.5, 'int'),
      rule('lap1Trickle', 'Free Drive on lap 1', 0, 1, 1, 'onoff', 'Off: on lap 1 Drive comes only from the strips, landings and passes.'),
      rule('driveLanding', 'Drive for a clean landing', 0, 20, 1, 'int'),
      rule('drivePass', 'Drive for a close pass', 0, 20, 1, 'int'),
      rule('cellStart', 'Cells on the grid', 0, 3, 0.5, 'int'),
      rule('gateValue', 'Cells per gate, lap 1', 0.25, 1, 0.25, 'int'),
      rule('gateValueLater', 'Cells per gate, later laps', 0, 1, 0.25, 'int', 'Lower this to make a spent Cell harder to earn back. 0 puts the gates out after lap 1.'),
      rule('gateLaps', 'Laps the gates are lit', 1, 3, 1, 'int'),
      rule('gateRelight', 'Gate relights after', 0, 15, 0.5, 'sec', 'A gate goes dark for everyone when someone takes it. 0: never dark.'),
      rule('gateShare', 'Gate share to teammates', 0, 1, 0.05, 'x', 'Each teammate still racing gets this much of a gate one of them takes, and the gate pays each team once a lap. 0: only the mech through it, each mech once a lap.'),
      rule('gateTrail', 'Sprint: dark gate pays', 0, 1, 0.05, 'x', 'A Sprint has no teammates to share a gate with: threading one someone has just taken (still dark) pays this much of it. The first through still takes it whole. 0: nothing, as in a team race.'),
    ],
  },
  {
    title: 'Abilities',
    items: [
      rule('overdriveMult', 'Overdrive speed', 1.05, 1.6, 0.01, 'bonus'),
      rule('overdriveSecs', 'Overdrive length', 1, 8, 0.25, 'sec'),
      rule('overdriveLap', 'Overdrive from lap', 2, 3, 1, 'int', '2: the battle lap; 3: only the speed lap. Break Away is there from the battle lap either way.'),
      rule('breakawaySecs', 'Break Away: cannot be locked', 0, 4, 0.25, 'sec'),
      rule('snareMult', 'Snare: speed left', 0.4, 1, 0.01, 'pct'),
      rule('snareSecs', 'Snare length', 1, 8, 0.25, 'sec'),
      rule('pulseRange', 'Disruptor reach', 10, 50, 1, 'int'),
      rule('pulseDrain', 'Disruptor Drive drain', 0, 100, 5, 'int'),
      rule('ramMult', 'Ram speed', 1, 1.4, 0.01, 'bonus'),
      rule('ramSecs', 'Ram length', 1, 8, 0.25, 'sec'),
      rule('ramDamage', 'Ram damage', 0, 300, 5, 'int'),
      rule('aegisSecs', 'Aegis length', 1, 8, 0.25, 'sec'),
      rule('aegisDamage', 'Aegis: damage let through', 0, 1, 0.05, 'pct'),
    ],
  },
  {
    title: 'Scoring',
    items: [
      rule('koPoints', 'Points per knockout', 0, 10, 1, 'int'),
      rule('supportCap', 'Support points per pilot', 0, 20, 1, 'int', 'The most one pilot can add to the team score with support actions in a race. 0 turns them off.'),
      rule('awardCooldown', 'Same action, same rival: again after', 0, 20, 0.5, 'sec'),
      rule('pressureDamage', 'Vector Pressure: damage per point', 50, 500, 10, 'int'),
      rule('backupDamage', 'Vector Back-up: damage per point', 40, 400, 10, 'int'),
      rule('assistSecs', 'Assist window', 1, 15, 0.5, 'sec'),
    ],
  },
  {
    title: 'Camera',
    items: [
      feel('camHeight', 'Height', 3, 14, 0.1),
      feel('camDist', 'Distance', 6, 24, 0.5),
      feel('camDistSpeed', 'Pull back with speed', 0, 8, 0.2),
      feel('camLookAhead', 'Look ahead', 8, 60, 1),
      feel('camLookHeight', 'Look height', 0, 10, 0.2, undefined, 'Higher puts the mech lower in the picture.'),
      feel('camFov', 'Field of view', 45, 90, 1),
      feel('camFovSpeed', 'Wider with speed', 0, 40, 1),
      feel('camFovBoost', 'Wider on boost', 0, 30, 1),
      feel('camLurch', 'Boost lurch', 0, 20, 0.5, undefined, 'The view jumps this much wider for a moment as a boost lights, and settles back.'),
      feel('camLockDist', 'Locked on: distance', 6, 24, 0.5),
      feel('camLockHeight', 'Locked on: height', 3, 14, 0.1),
      feel('camShake', 'Shake on hits', 0, 2, 0.05, 'x'),
      feel('camPunch', 'Punch-in on big hits', 0, 2, 0.05, 'x', 'A short dart in on heavy blows, parries, guard breaks and knockouts. 0 turns it off.'),
      feel('camRumble', 'Road rumble', 0, 3, 0.1, 'x'),
    ],
  },
  {
    title: 'Effects',
    items: [
      feel('speedBlur', 'Speed blur', 0, 3, 0.05, 'x'),
      feel('speedLines', 'Speed lines', 0, 3, 0.05, 'x'),
      feel('lockSpeedFx', 'Speed effects while locked on', 0, 1, 0.05, 'pct'),
      feel('sparks', 'Skate sparks', 0, 3, 0.1, 'x'),
      feel('trails', 'Light trails', 0, 3, 0.1, 'x'),
      feel('rumble', 'Gamepad rumble', 0, 2, 0.05, 'x'),
      feel('bloom', 'Glow', 0, 1.2, 0.02),
      feel('tells', 'Wind-up tells', 0, 1.6, 0.05, 'x', 'The ring that closes on a mech winding up a heavy blow. 0 turns them off.'),
      feel('wallPulse', 'Barrier pulse', 0, 2, 0.05, 'x'),
    ],
  },
  {
    title: 'Sound',
    items: [
      feel('volMaster', 'Master volume', 0, 1, 0.05, 'pct'),
      feel('volMusic', 'Music', 0, 1, 0.05, 'pct'),
      feel('volEffects', 'Effects and engine', 0, 1, 0.05, 'pct', 'Everything that is not music: hits, shots, abilities and all the layers below.'),
      feel('mixEngine', 'Engine and turbine whine', 0, 1, 0.05, 'pct'),
      feel('mixWind', 'Wind and road', 0, 1, 0.05, 'pct'),
      feel('mixAfterburner', 'Afterburner (boost, Overdrive)', 0, 1, 0.05, 'pct'),
      feel('mixStrip', 'Charge strip hum', 0, 1, 0.05, 'pct'),
      feel('mixSlipstream', 'Slipstream', 0, 1, 0.05, 'pct'),
      feel('mixScrape', 'Barrier scrape', 0, 1, 0.05, 'pct'),
      feel('mixAlarm', 'Low-armour alarm', 0, 1, 0.05, 'pct'),
    ],
  },
];

/** A value formatted the way its descriptor asks. */
export function showValue(item: TuneItem, v: number): string {
  switch (item.show) {
    case 'mph':
      return `${Math.round(v * MPH_PER_UNIT)} mph`;
    case 'pct':
      return `${Math.round(v * 100)}%`;
    case 'bonus':
      return `+${((item.kind === 'rule' && item.key.startsWith('tow') ? v : v - 1) * 100).toFixed(1).replace(/\.0$/, '')}%`;
    case 'x':
      return `${v.toFixed(2)}×`;
    case 'sec':
      return `${Math.round(v * 100) / 100} s`;
    case 'onoff':
      return v >= 0.5 ? 'On' : 'Off';
    case 'int':
      return String(Math.round(v * 100) / 100);
    default:
      return String(Math.round(v * 100) / 100);
  }
}

const STORE_KEY = 'zenith-gp.tuning.v3';
/** 0.3 and earlier: the rules have moved on since, so only the feel carries over. */
const OLD_STORE_KEY = 'zenith-gp.tuning.v2';

export class Tuning {
  /** Live values. The camera and effects read these every frame. */
  readonly feel: Feel = { ...DEFAULT_FEEL };
  /** The full rule set every new race starts from. */
  rules: Rules = makeRules();
  /** Called after any change, with what changed. */
  onChange: (kind: 'rule' | 'feel' | 'all') => void = () => {};

  constructor() {
    this.load();
  }

  get(item: TuneItem): number {
    return item.kind === 'rule' ? this.rules[item.key as RuleKey] : this.feel[item.key as FeelKey];
  }

  defaultOf(item: TuneItem): number {
    return item.kind === 'rule' ? DEFAULT_RULES[item.key as RuleKey] : DEFAULT_FEEL[item.key as FeelKey];
  }

  set(item: TuneItem, value: number): void {
    if (!Number.isFinite(value)) return;
    const v = Math.min(item.max, Math.max(item.min, value));
    if (item.kind === 'rule') this.rules[item.key as RuleKey] = v;
    else this.feel[item.key as FeelKey] = v;
    this.save();
    this.onChange(item.kind);
  }

  reset(): void {
    Object.assign(this.feel, DEFAULT_FEEL);
    this.rules = makeRules();
    this.save();
    this.onChange('all');
  }

  /** Only what differs from the defaults. */
  changes(): { rules: Partial<Rules>; feel: Partial<Feel> } {
    const rules: Partial<Rules> = {};
    const feelOut: Partial<Feel> = {};
    for (const k of RULE_KEYS) if (Math.abs(this.rules[k] - DEFAULT_RULES[k]) > 1e-9) rules[k] = this.rules[k];
    for (const k of FEEL_KEYS) if (Math.abs(this.feel[k] - DEFAULT_FEEL[k]) > 1e-9) feelOut[k] = this.feel[k];
    return { rules, feel: feelOut };
  }

  changedCount(): number {
    const c = this.changes();
    return Object.keys(c.rules).length + Object.keys(c.feel).length;
  }

  /** Text to paste back to whoever maintains the defaults. */
  exportText(): string {
    const c = this.changes();
    return JSON.stringify({ zenithTuning: 2, ...c }, null, 2);
  }

  /** Apply text produced by exportText. Returns false if it is not that. */
  importText(text: string): boolean {
    try {
      const data = JSON.parse(text) as { zenithTuning?: unknown; rules?: Partial<Rules>; feel?: Partial<Feel> };
      if (typeof data !== 'object' || data === null || Array.isArray(data) || typeof data.zenithTuning !== 'number') return false;
      this.rules = makeRules(data.rules);
      this.takeFeel(data.feel);
      this.save();
      this.onChange('all');
      return true;
    } catch {
      return false;
    }
  }

  /** Feel values from outside (storage, pasted text): defaults first, then whatever is a number, held to its slider's range. */
  private takeFeel(src: Partial<Feel> | undefined): void {
    Object.assign(this.feel, DEFAULT_FEEL);
    if (typeof src !== 'object' || src === null) return;
    for (const group of TUNE_GROUPS) {
      for (const item of group.items) {
        if (item.kind !== 'feel') continue;
        const v = src[item.key as FeelKey];
        if (typeof v === 'number' && Number.isFinite(v)) this.feel[item.key as FeelKey] = Math.min(item.max, Math.max(item.min, v));
      }
    }
  }

  // Browser storage can be missing or refuse (private windows, embedded
  // previews), so the game must work the same without it.
  private load(): void {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) {
        const old = window.localStorage.getItem(OLD_STORE_KEY);
        if (old) this.takeFeel((JSON.parse(old) as { feel?: Partial<Feel> }).feel);
        return;
      }
      const data = JSON.parse(raw) as { rules?: Partial<Rules>; feel?: Partial<Feel> };
      this.rules = makeRules(data.rules);
      this.takeFeel(data.feel);
    } catch {
      /* start from the defaults */
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(this.changes()));
    } catch {
      /* not remembered this time */
    }
  }
}

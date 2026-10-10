// Everything that can be dialled in while playing. Two kinds of number live
// here: race rules (simulation, see src/sim/rules.ts) and "feel" (camera and
// effects, client only). The tuning panel edits both through one list of
// descriptors, and the values are remembered between visits.
//
// When a set of values feels right, "Copy values" on the panel gives a small
// block of text to paste back so they can be made the defaults.
import { DEFAULT_RULES, MPH_PER_UNIT, RULE_KEYS, makeRules, type RuleKey, type Rules } from '../../sim/index';

export interface Feel {
  camHeight: number;
  camDist: number;
  camDistSpeed: number;
  camLookAhead: number;
  camLookHeight: number;
  camFov: number;
  camFovSpeed: number;
  camFovBoost: number;
  camLockDist: number;
  camLockHeight: number;
  camShake: number;
  camRumble: number;
  speedBlur: number;
  speedLines: number;
  lockSpeedFx: number;
  sparks: number;
  trails: number;
  rumble: number;
  bloom: number;
}

export const DEFAULT_FEEL: Readonly<Feel> = Object.freeze({
  camHeight: 8.4,
  camDist: 13,
  camDistSpeed: 2.4,
  camLookAhead: 26,
  camLookHeight: 4,
  camFov: 64,
  camFovSpeed: 18,
  camFovBoost: 9,
  camLockDist: 12.5,
  camLockHeight: 8.2,
  camShake: 1,
  camRumble: 1,
  speedBlur: 1,
  speedLines: 1,
  lockSpeedFx: 1,
  sparks: 1,
  trails: 1,
  rumble: 1,
  bloom: 0.42,
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
    title: 'Pace',
    items: [
      rule('limiter1', 'Limiter, lap 1', 80, 160, 1, 'mph'),
      rule('limiter2', 'Limiter, lap 2', 80, 180, 1, 'mph'),
      rule('topScale', 'Top speed, lap 3', 0.7, 1.4, 0.01, 'x', 'Scales every frame. 1.00 puts the forward at 480 mph.'),
      rule('boostMult', 'Boost', 1.05, 1.5, 0.01, 'bonus'),
      rule('armourFloor', 'Speed left with no armour', 0.7, 1, 0.01, 'pct', 'Lap 3 only. 100% means damage never costs speed.'),
      rule('battleMove', 'Movement while locked on', 0.6, 2.2, 0.05, 'x'),
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
      rule('lap1Trickle', 'Free Drive on lap 1', 0, 1, 1, 'onoff', 'Off: on lap 1 Drive comes only from the strips.'),
      rule('cellStart', 'Cells on the grid', 0, 3, 0.5, 'int'),
      rule('gateValue', 'Cells per gate', 0.25, 1, 0.25, 'int'),
      rule('gateLaps', 'Laps the gates are lit', 1, 3, 1, 'int'),
    ],
  },
  {
    title: 'Abilities',
    items: [
      rule('overdriveMult', 'Overdrive speed', 1.05, 1.6, 0.01, 'bonus'),
      rule('overdriveSecs', 'Overdrive length', 1, 8, 0.25, 'sec'),
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
    items: [rule('koPoints', 'Points per knockout', 0, 10, 1, 'int')],
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
      feel('camLockDist', 'Locked on: distance', 6, 24, 0.5),
      feel('camLockHeight', 'Locked on: height', 3, 14, 0.1),
      feel('camShake', 'Shake on hits', 0, 2, 0.05, 'x'),
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
      return `+${Math.round((item.kind === 'rule' && item.key.startsWith('tow') ? v : v - 1) * 100)}%`;
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

const STORE_KEY = 'zenith-gp.tuning.v2';

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
      const data = JSON.parse(text) as { rules?: Partial<Rules>; feel?: Partial<Feel> };
      if (typeof data !== 'object' || data === null) return false;
      this.rules = makeRules(data.rules);
      Object.assign(this.feel, DEFAULT_FEEL);
      for (const k of FEEL_KEYS) {
        const v = data.feel?.[k];
        if (typeof v === 'number' && Number.isFinite(v)) this.feel[k] = v;
      }
      this.save();
      this.onChange('all');
      return true;
    } catch {
      return false;
    }
  }

  // Browser storage can be missing or refuse (private windows, embedded
  // previews), so the game must work the same without it.
  private load(): void {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { rules?: Partial<Rules>; feel?: Partial<Feel> };
      this.rules = makeRules(data.rules);
      for (const k of FEEL_KEYS) {
        const v = data.feel?.[k];
        if (typeof v === 'number' && Number.isFinite(v)) this.feel[k] = v;
      }
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

// What each frame is for: its primer under How to play (ui/screens/howto.ts),
// and the short tip the first time a Midfielder or a Defender is raced
// (a card on the grid, as the tutorial's are). The figures quoted are the
// game's own (docs/DESIGN.md: Abilities, Fighting, support points).

import { CARD_MIN, type CardText, type Coach, type GoalView } from './tutorial';
import { DEFAULT_RULES, PHASE, ROLE, type RaceState, type Role, type SimEvent } from '../../sim/index';
import type { Device } from '../input/input';

export interface FramePrimer {
  /** One line, for the How to play list. */
  line: string;
  /** What the frame is for. */
  synopsis: string;
  /** What to do with it in a race. */
  job: string[];
  /** How it scores. */
  scoreNote: string;
  /** Its support awards, [what, points]. */
  awards: Array<[string, string]>;
}

const R = DEFAULT_RULES;
/** What a knockout costs a support pilot, said plainly (rules.supportLoss). */
const LOSS =
  R.supportLoss >= 1 ? ' Knocked out, you lose them all.' : R.supportLoss > 0 ? ` Knocked out, you lose ${R.supportLoss === 0.5 ? 'half' : `${Math.round(R.supportLoss * 100)}%`} of them.` : '';

/** The awards both support frames can earn. */
const SHARED: Array<[string, string]> = [
  ['Lead-out: on the speed lap, your Forward pulls out of your tow and passes someone', '2'],
  ['Assist: you hurt a rival in the 5 s before a teammate knocks it out', '2'],
];

export const PRIMERS: Record<Role, FramePrimer> = {
  [ROLE.FW]: {
    line: 'The racer: the finish line is the job',
    synopsis:
      'The lightest and fastest frame, and the one a race is about. First across the line scores 15 for the team, more than anything else on the track, so a Forward races first and fights when it has to.',
    job: [
      'Race the line: carve the corners, take the tow, keep your Drive up.',
      'Fight on your terms: the blade string up close, the Lance Dash across a gap. Rivals will come for you, so read their rings.',
      'Keep a Cell for the speed lap: Overdrive is four seconds far past top speed.',
    ],
    scoreNote: 'Your place is your score: 15, 7, 5, 3, 2 or 1. A knocked-out mech scores nothing for its place, so the armour you keep matters.',
    awards: [],
  },
  [ROLE.MF]: {
    line: 'The hunter: opens up the rival Forward for the team',
    synopsis:
      "The frame with the only gun that reaches, and the Snare. A Midfielder's job is the rival Forward: keep it under fire, pin it with the Snare so it cannot boost or dash away, and let the team finish it. It backs up teammates in a fight on the way.",
    job: [
      'Hunt the rival Forward: keep your carbine on it from range, where its blades cannot reach you.',
      `Snare it when a teammate is close: for ${R.snareSecs} s it cannot boost or dash, and every hit your team lands on it scores you.`,
      'Break up heavy blows: a Stun Kick or a Disruptor that lands during a wind-up stops it. Back up a teammate who is in a fight.',
    ],
    scoreNote: `Your place scores like anyone's, and hunting scores support points for the team, up to ${R.supportCap} a race.${LOSS}`,
    awards: [
      [`Opener: every ${R.openerDamage} damage your team deals to a rival you snared, while it is snared`, '1'],
      ['Snare: a Snare lands (on their Forward, 2)', '1'],
      [`Pressure: every ${R.pressureDamage} damage to the rival Forward`, '1'],
      ['Interrupt: a Stun Kick or Disruptor breaks a wind-up', '2'],
      [`Back-up: every ${R.backupDamage} damage to a rival who is fighting a teammate`, '1'],
      ...SHARED,
    ],
  },
  [ROLE.DF]: {
    line: 'The wall: guards the Forward, breaks guards',
    synopsis:
      "The heaviest frame: the most armour, the biggest guard, and a hammer that breaks guards. A Defender's job is its own Forward: staying close, peeling attackers off it, and shielding the team when it is under fire.",
    job: [
      'Stay near your Forward and hit whoever attacks it. Break their swing if you can.',
      'Use that guard: your blocks and parries near your Forward count for the team.',
      'Shield the team: the Aegis takes most of the damage off you and every teammate near you.',
    ],
    scoreNote: `Your place scores like anyone's, and protecting scores support points for the team, up to ${R.supportCap} a race.${LOSS}`,
    awards: [
      ['Peel: a hit on a rival who is attacking your Forward', '1'],
      ['Save: the same hit, breaking their attack', '2'],
      ['Bodyguard: a block or parry near your Forward', '1'],
      ['Aegis: it keeps 100 damage or more off your teammates', '2'],
      ['Ring-out: a rival knocked into the barrier (their Forward, 2)', '1'],
      ...SHARED,
    ],
  },
};

/** The first-race tip's words, for the device in hand (`[marks]` as on the tutorial's cards). */
function tipText(role: Role, device: Device): CardText {
  const touch = device === 'touch';
  const guide = "There's a full guide to every frame under How to play.";
  if (role === ROLE.MF) {
    return {
      title: 'Flying the Midfielder',
      lines: [
        touch
          ? '[Attack] fires your carbine, at racing speed and without a lock. Locked on, [Special] is the Stun Kick.'
          : '[x] fires your carbine, at racing speed and without a lock: hold it to keep firing. Locked on, [y] is the Stun Kick.',
        'Your job is the rival Forward: keep it under fire, and Snare it when a teammate is close. Their hits on it while it is snared score for you.',
        touch
          ? `[Disruptor] knocks back everyone near you; locked on, [Snare] slows your target. ${guide}`
          : `[ability] fires the Disruptor, or locked on, the Snare. [ally] escorts a teammate. ${guide}`,
      ],
    };
  }
  return {
    title: 'Flying the Defender',
    lines: [
      touch
        ? 'Locked on, [Attack] swings the Breaker, whose second blow breaks a guard, and [Special] fires the Scatter Cannon.'
        : '[y] fires the Scatter Cannon, close up and at racing speed. Locked on, [x] swings the Breaker: its second blow breaks a guard.',
      'Your job is your own Forward: stay near it and hit whoever attacks it. That scores support points.',
      touch
        ? `[Aegis] shields you and teammates near you; locked on, [Ram] charges your target. ${guide}`
        : `[ability] raises the Aegis over you and teammates near you, or locked on, charges in a Ram. ${guide}`,
    ],
  };
}

/**
 * The first race in a Midfielder or a Defender: one card on the grid saying
 * what the frame is for, then out of the way.
 */
export class FrameTip implements Coach {
  card: string | null = null;
  cardAge = 0;
  readonly timeScale = 1;
  over = false;
  private shown = false;

  constructor(
    readonly role: Role,
    /** Called as the card goes up (to remember it has been seen). */
    private readonly onShown: () => void = () => {},
  ) {}

  held(dt: number): void {
    this.cardAge += dt;
  }

  dismiss(): boolean {
    if (!this.card || this.cardAge < CARD_MIN) return false;
    this.stop();
    return true;
  }

  stop(): void {
    this.card = null;
    this.over = true;
  }

  update(race: RaceState, _events: readonly SimEvent[], _dt: number): void {
    if (this.over || this.card) return;
    if (race.phase !== PHASE.COUNTDOWN) return this.stop();
    if (!this.shown && race.tick >= 20) {
      this.shown = true;
      this.card = 'frame';
      this.cardAge = 0;
      this.onShown();
    }
  }

  cardText(_race: RaceState, device: Device): CardText | null {
    return this.card ? tipText(this.role, device) : null;
  }

  goalView(_race: RaceState, _device: Device): GoalView | null {
    return null;
  }
}

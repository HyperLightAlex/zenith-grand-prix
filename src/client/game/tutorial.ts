// The tutorial: a guided first race. The race is a lesson (see Lesson in
// the simulation): the field leaves the learner to its sparring partner, the
// rival forward, which keeps it company and duels it on the battle lap. Over
// it this director lays the teaching: at the right moment a card holds the
// race and says what to do, and a try-it goal stays up afterwards until it is
// done or has had its chance (nothing is failed). The beats come from the
// race as it runs (a strip coming up, the battle lap starting, the partner's
// heavy winding up), each at most once, one lesson at a time.
//
// No DOM here: the game shows `card` and `goal` (ui/tutorialPanel.ts),
// holds the race while a card is up, and applies `timeScale`.

import {
  ABILITY,
  ATTACKS,
  COUNTDOWN_TICKS,
  LOCK_RANGE,
  MODE,
  PHASE,
  ROLE,
  START,
  deltaS,
  inPlay,
  kappaAt,
  wrapS,
  type MechState,
  type RaceState,
  type SimEvent,
  type Track,
} from '../../sim/index';
import type { Device } from '../input/input';
import { tellOf, type TellKind } from './tells';

export type BeatId =
  | 'welcome'
  | 'rev'
  | 'strip'
  | 'boost'
  | 'gate'
  | 'carve'
  | 'draft'
  | 'battle'
  | 'lock'
  | 'attack'
  | 'tell'
  | 'dash'
  | 'escape'
  | 'ko'
  | 'speed'
  | 'overdrive'
  | 'tow'
  | 'plays';

/**
 * A card's words for the device in hand. `[name]` marks a control, drawn
 * as a key cap: a name the key table knows (accel, lock, guard...) becomes
 * that device's key, anything else is shown as written (a touch button's name).
 */
export interface CardText {
  title: string;
  lines: string[];
  /** The tell colours, each with its answer. */
  legend?: Array<{ kind: TellKind; text: string }>;
}

export interface GoalView {
  id: BeatId;
  text: string;
  /** Done: shown ticked for a moment, then gone. */
  done: boolean;
  /** Let go unfinished, with a word on why (shown for a moment, not ticked). */
  missed: boolean;
  /** A word on how it went (a cyan carve, a bogged start), or ''. */
  note: string;
}

/**
 * Anything that puts cards over an offline race (the tutorial, a frame's
 * first-race tip): while `card` is up the game holds the race; `timeScale`
 * slows it; a try-it goal, if any, shows after the card.
 */
export interface Coach {
  readonly card: string | null;
  readonly cardAge: number;
  readonly timeScale: number;
  readonly over: boolean;
  held(dt: number): void;
  dismiss(): boolean;
  stop(): void;
  update(race: RaceState, events: readonly SimEvent[], dt: number): void;
  cardText(race: RaceState, device: Device): CardText | null;
  goalView(race: RaceState, device: Device): GoalView | null;
}

/** Seconds a card stays up before it can be closed (so a press meant for the race cannot close it unread). */
export const CARD_MIN = 0.6;
/** Slow motion on the partner's heavies while the parry is being learnt. */
export const TELL_ASSIST = 0.4;
/** Seconds a finished goal stays up, ticked. */
const DONE_SHOW = 1.6;
/** Seconds of racing between one card and the next, unless a beat cannot wait. */
const GAP = 3.5;
/** Seconds the HUD's banners (a new lap, a knockout) are up: a card about the same thing waits for them. */
const BANNER = 3.1;

/** Beats that cannot wait for the lesson before to finish: they are about what is happening now. */
const URGENT = new Set<BeatId>(['welcome', 'rev', 'ko', 'tell', 'attack', 'battle', 'speed']);

/** In the order they are looked for: the first due is the one shown. */
const ORDER: BeatId[] = ['welcome', 'rev', 'ko', 'tell', 'attack', 'battle', 'speed', 'lock', 'dash', 'escape', 'overdrive', 'tow', 'plays', 'strip', 'gate', 'carve', 'boost', 'draft'];

interface Goal {
  id: BeatId;
  /** Seconds of racing it has left before it lapses (non-failing: it just goes). */
  life: number;
  done: boolean;
  /** Seconds since it was done (it goes after DONE_SHOW). */
  doneT: number;
  missed: boolean;
  note: string;
  /** Progress, for the goals that count (blows landed, tells read). */
  n: number;
}

export class Tutorial implements Coach {
  /** The card up, or null. While there is one the race is held. */
  card: BeatId | null = null;
  /** How long the card has been up, in seconds. */
  cardAge = 0;
  /** Slow motion asked for this frame (1: none). */
  timeScale = 1;
  /** Stopped: skipped from the pause menu, or the pupil is home. */
  over = false;
  /** Every card shown so far, in order. */
  readonly shown: BeatId[] = [];
  private seen = new Set<BeatId>();
  private goal: Goal | null = null;
  /** Seconds of racing since the last card closed. */
  private since = 0;
  /** Seconds of the speed lap so far. */
  private lap3T = 0;
  // How long, in a row or in all, the pupil has done a thing (seconds).
  private draftT = 0;
  private stripT = 0;
  private boostT = 0;
  /** Seconds since the partner was knocked out by the pupil (-1: it was not). */
  private koT = -1;
  /** The lap phase, and seconds since it began (its banner has its say first). */
  private phase = 1;
  private phaseT = 0;

  constructor(
    private readonly track: Track,
    readonly pupil: number,
    readonly spar: number,
  ) {}

  /** The pupil's sparring partner, if it is still in the race. */
  private partner(race: RaceState): MechState | null {
    const s = this.spar >= 0 ? race.mechs[this.spar] : null;
    return s && inPlay(s) ? s : null;
  }

  /** Stop: no more cards or goals (the race runs on as an ordinary one). */
  stop(): void {
    this.over = true;
    this.card = null;
    this.goal = null;
    this.timeScale = 1;
  }

  /** Continue: close the card, once it has been up long enough to have been read. */
  dismiss(): boolean {
    if (!this.card || this.cardAge < CARD_MIN) return false;
    this.card = null;
    this.since = 0;
    return true;
  }

  /** While a card is up: the race is held, only the card's clock runs. */
  held(dt: number): void {
    this.cardAge += dt;
  }

  /**
   * After each update of the race: `events` are what happened in it, `dt` the
   * seconds of the frame. Moves the goal on, and opens the next card when
   * one is due (the game then holds the race until it is closed).
   */
  update(race: RaceState, events: readonly SimEvent[], dt: number): void {
    if (this.over || this.card) return;
    const me = race.mechs[this.pupil];
    if (!me) return;
    if (me.finished || me.retired) return this.stop();
    if (race.phase === PHASE.RACING) {
      this.since += dt;
      if (race.lapPhase >= 3) this.lap3T += dt;
    } else this.since += dt;
    this.draftT = me.drafting && me.mode === MODE.SPEED ? this.draftT + dt : 0;
    if (race.lapPhase !== this.phase) {
      this.phase = race.lapPhase;
      this.phaseT = 0;
    } else this.phaseT += dt;
    if (this.koT >= 0) this.koT += dt;
    for (const e of events) this.heard(race, e);
    this.watch(race, me, dt);
    this.timeScale = this.assist(race);
    const next = this.due(race, me);
    if (next) this.open(next, race);
  }

  /** The goal as it should be shown, worded for the device. */
  goalView(race: RaceState, device: Device): GoalView | null {
    const g = this.goal;
    if (!g || this.over) return null;
    return { id: g.id, text: goalText(g, race, this, device), done: g.done && !g.missed, missed: g.missed, note: g.note };
  }

  /** The card's words, for the device in hand. */
  cardText(race: RaceState, device: Device): CardText | null {
    return this.card ? cardText(this.card, race, this, device) : null;
  }

  // ---- goals ----------------------------------------------------------------

  private open(id: BeatId, race: RaceState): void {
    this.card = id;
    this.cardAge = 0;
    this.seen.add(id);
    this.shown.push(id);
    // A new try-it takes the place of one unfinished; a card with none leaves it be.
    const life = GOAL_LIFE[id];
    if (life) {
      this.goal = { id, life, done: false, doneT: 0, missed: false, note: '', n: 0 };
      this.stripT = 0;
      this.boostT = 0;
    }
    // (The lock is already on: that one is done before it starts. And once
    // the duel is on, the card about starting one has had its moment.)
    if (id === 'lock' && race.mechs[this.pupil].target === this.spar) this.finish('');
    if (id === 'attack') this.seen.add('lock');
  }

  private finish(note: string): void {
    const g = this.goal;
    if (!g || g.done) return;
    g.done = true;
    g.doneT = 0;
    g.note = note;
  }

  /** A goal let go unfinished: shown a moment with a word on it, if it deserves one, else gone. */
  private lapse(note = ''): void {
    const g = this.goal;
    if (!g) return;
    if (!note) {
      this.goal = null;
      return;
    }
    g.done = true;
    g.missed = true;
    g.doneT = 0;
    g.note = note;
  }

  private heard(race: RaceState, e: SimEvent): void {
    const g = this.goal;
    const p = this.pupil;
    if (e.type === 'ko' && e.mech === this.spar && e.by === p && this.koT < 0) this.koT = 0;
    if (!g || g.done) return;
    switch (g.id) {
      case 'rev':
        if (e.type === 'launch' && e.mech === p) {
          if (e.grade === START.PERFECT) this.finish('Perfect launch');
          else if (e.grade === START.GOOD) this.finish('Good start. The green is perfect');
          else this.lapse(e.grade === START.BOG ? 'Bogged down: ease off before the red' : 'A slow start: hold the revs through the lights');
        }
        break;
      case 'gate':
        if (e.type === 'gate' && e.mech === p) this.finish('A Cell banked');
        break;
      case 'carve':
        if (e.type === 'carveBurst' && e.mech === p) {
          if (e.tier >= 2) this.finish(e.tier >= 3 ? 'Magenta burst' : 'Gold burst');
          else g.note = 'Cyan. Hold the carve longer for gold';
        }
        break;
      case 'draft':
        if (e.type === 'pass' && e.mech === p) this.finish('Slingshot');
        break;
      case 'attack':
        if (e.type === 'hit' && e.attacker === p && e.victim === this.spar && !e.blocked && ++g.n >= 3) this.finish('');
        break;
      case 'tell':
        if (e.type === 'parry' && e.mech === p) this.finish('Parried');
        // Each of the partner's heavies at the pupil is a try.
        if (e.type === 'windup' && e.mech === this.spar && ATTACKS[e.attack].heavy && race.mechs[this.spar].target === p && ++g.n > 6) this.lapse('Parrying is all timing: it comes with practice');
        break;
      case 'dash':
        if ((e.type === 'dash' || e.type === 'arc') && e.mech === p) this.finish('');
        break;
      case 'escape':
        if ((e.type === 'unlock' && e.mech === p) || (e.type === 'ability' && e.mech === p && e.ability === ABILITY.BREAKAWAY)) this.finish('');
        break;
      case 'overdrive':
        if (e.type === 'ability' && e.mech === p && e.ability === ABILITY.OVERDRIVE) this.finish('');
        break;
      case 'plays':
        if (e.type === 'tactic' && e.by === p) this.finish('Your team has its orders');
        break;
    }
  }

  /** The goals kept by watching the pupil, and every goal's clock. */
  private watch(race: RaceState, me: MechState, dt: number): void {
    const g = this.goal;
    if (!g) return;
    if (g.done) {
      g.doneT += dt;
      if (g.doneT >= DONE_SHOW + (g.note ? 0.8 : 0)) this.goal = null;
      return;
    }
    // A goal's clock runs with the race (the countdown counts for the start).
    g.life -= dt;
    switch (g.id) {
      case 'strip':
        this.stripT += me.onStrip ? dt : 0;
        if (this.stripT >= 0.6) this.finish('Drive filling');
        break;
      case 'boost':
        this.boostT += me.boosting ? dt : 0;
        if (this.boostT >= 1) this.finish('');
        break;
      case 'lock':
        if (me.target === this.spar && this.spar >= 0) this.finish('');
        break;
      case 'tell':
      case 'attack':
      case 'dash':
      case 'escape':
        // The duel is over without it: the lesson goes with it.
        if (!this.partner(race) || race.lapPhase >= 3) this.goal = null;
        break;
    }
    if (this.goal && !this.goal.done && this.goal.life <= 0) {
      this.lapse(g.id === 'tell' ? 'Parrying is all timing: it comes with practice' : '');
    }
  }

  /** Slow motion on the partner's heavies at the pupil while the parry is being learnt. */
  private assist(race: RaceState): number {
    const g = this.goal;
    if (!g || g.id !== 'tell' || g.done) return 1;
    const s = this.partner(race);
    if (!s || s.target !== this.pupil) return 1;
    return tellOf(s, race.tick) ? TELL_ASSIST : 1;
  }

  // ---- when each card is due ------------------------------------------------

  /** How far ahead of the pupil, down the road, `s` is (0 to a lap). */
  private ahead(me: MechState, s: number): number {
    let a = wrapS(this.track, s) - wrapS(this.track, me.s);
    if (a < 0) a += this.track.length;
    return a;
  }

  /** The road from `from` to `to` metres ahead is straight enough to boost on. */
  private straight(me: MechState, from: number, to: number): boolean {
    for (let a = from; a <= to; a += 10) if (Math.abs(kappaAt(this.track, me.s + a)) > 1 / 500) return false;
    return true;
  }

  private due(race: RaceState, me: MechState): BeatId | null {
    // (A goal just done stays up a moment, ticked, before the next lesson.)
    const busy = !!this.goal;
    for (const id of ORDER) {
      if (this.seen.has(id)) continue;
      if (!URGENT.has(id) && (busy || this.since < GAP)) continue;
      if (this.when(id, race, me)) return id;
    }
    return null;
  }

  private when(id: BeatId, race: RaceState, me: MechState): boolean {
    const racing = race.phase === PHASE.RACING && inPlay(me) && me.fallT <= 0;
    const free = racing && me.mode === MODE.SPEED;
    const s = this.partner(race);
    const duel = racing && !!s && me.target === this.spar && me.mode === MODE.BATTLE;
    const rules = race.rules;
    switch (id) {
      case 'welcome':
        return race.phase === PHASE.COUNTDOWN && race.tick >= 20;
      case 'rev':
        return race.phase === PHASE.COUNTDOWN && this.seen.has('welcome') && this.since >= 0.3 && COUNTDOWN_TICKS - race.tick > 100;
      // (The HUD's own banners, for a knockout and a new lap, have their say first.)
      case 'ko':
        return this.koT >= BANNER;
      case 'tell':
        return duel && this.seen.has('attack') && !!s && s.target === this.pupil && !!tellOf(s, race.tick);
      case 'attack':
        return duel && race.lapPhase === 2 && this.seen.has('battle') && this.since >= 0.4;
      case 'battle':
        return racing && race.lapPhase === 2 && this.phaseT >= BANNER;
      case 'speed':
        return racing && race.lapPhase >= 3 && this.phaseT >= BANNER;
      case 'lock': {
        // (Locked on to someone else, it is still the lesson: the goal says how to switch.)
        if (!racing || race.lapPhase !== 2 || !this.seen.has('battle') || !s || me.target === this.spar) return false;
        return Math.hypot(deltaS(this.track, s.s, me.s), s.d - me.d) < LOCK_RANGE - 15;
      }
      case 'dash':
        return duel && race.lapPhase === 2 && this.seen.has('tell') && this.since >= 1.5 && !!s && !tellOf(s, race.tick);
      case 'escape':
        return duel && race.lapPhase === 2 && this.seen.has('dash') && this.since >= 2.5 && !!s && !tellOf(s, race.tick);
      case 'overdrive':
        return free && race.lapPhase >= 3 && this.seen.has('speed') && this.straight(me, 0, 200);
      case 'tow':
        return free && race.lapPhase >= 3 && this.seen.has('speed') && this.draftT >= 0.5;
      case 'plays':
        return free && !race.sprint && race.lapPhase >= 3 && (this.seen.has('overdrive') || this.lap3T > 20);
      case 'strip': {
        if (!free || me.drive >= 70 || me.speed < 30) return false;
        return this.track.strips.some((st) => {
          const a = this.ahead(me, st.s0);
          return a > 60 && a < 200;
        });
      }
      case 'gate': {
        if (!free || me.lap >= rules.gateLaps || me.cells > rules.cellMax - 1 || me.speed < 30) return false;
        return this.track.gates.some((gt, i) => {
          const a = this.ahead(me, gt.s);
          return a > 110 && a < 260 && race.gateDark[i] <= race.tick;
        });
      }
      case 'carve': {
        if (!free || me.speed < 70) return false;
        for (let a = 50; a <= 240; a += 10) if (Math.abs(kappaAt(this.track, me.s + a)) > 1 / 250) return true;
        return false;
      }
      case 'boost':
        return free && me.drive >= 20 && !me.carving && this.straight(me, 0, 150);
      case 'draft':
        return free && race.lapPhase <= 2 && this.draftT >= 0.5;
    }
  }
}

/** Seconds of racing each try-it is given (the beats with none have no goal). */
const GOAL_LIFE: Partial<Record<BeatId, number>> = {
  rev: 30,
  strip: 12,
  boost: 15,
  gate: 25,
  carve: 45,
  draft: 12,
  lock: 45,
  attack: 30,
  tell: 45,
  dash: 20,
  escape: 30,
  overdrive: 40,
  plays: 25,
};

// ---- the words --------------------------------------------------------------

/** The partner's name, or "their Forward". */
function sparName(race: RaceState, t: Tutorial): string {
  return t.spar >= 0 ? race.mechs[t.spar].name : 'their Forward';
}

function goalText(g: Goal, race: RaceState, t: Tutorial, device: Device): string {
  const me = race.mechs[t.pupil];
  const spar = sparName(race, t);
  const touch = device === 'touch';
  switch (g.id) {
    case 'rev':
      return 'Launch in the green';
    case 'strip':
      return 'Ride the charge strip';
    case 'boost':
      return 'Boost for a second: hold [boost]';
    case 'gate':
      return 'Take the gold gate';
    case 'carve':
      return 'Carve to gold, then let go';
    case 'draft':
      return 'Pull out and pass';
    case 'lock':
      if (me.target >= 0 && me.target !== t.spar) return `That's ${race.mechs[me.target].name}. ${touch ? '[Switch]' : '[swap]'} switches to ${spar}`;
      return `Lock on to ${spar}: ${touch ? '[Lock on]' : '[lock]'}`;
    case 'attack':
      return `Land 3 blows on ${spar} (${Math.min(3, g.n)} of 3)`;
    case 'tell':
      return `Parry: tap ${touch ? '[Guard]' : '[guard]'} as the gold ring turns white`;
    case 'dash':
      return `Dash: ${touch ? '[Dash]' : '[dash]'}`;
    case 'escape':
      return `Let go of the lock: ${touch ? '[Let go]' : '[lock]'}`;
    case 'overdrive':
      return me.cells >= 1 ? `Fire Overdrive on a straight: ${touch ? '[Overdrive]' : '[ability]'}` : 'Take a gold gate for a Cell, then fire Overdrive';
    case 'plays':
      return touch ? 'Call a play: [Team]' : 'Call a play: [up] [right] [down] [left]';
    default:
      return '';
  }
}

function cardText(id: BeatId, race: RaceState, t: Tutorial, device: Device): CardText {
  const touch = device === 'touch';
  const spar = sparName(race, t);
  const me = race.mechs[t.pupil];
  switch (id) {
    case 'welcome':
      return {
        title: 'Your first race',
        lines: [
          'Three laps, three a side. Lap 1 lines the field up, lap 2 is for fighting, lap 3 is flat out.',
          touch ? 'Steer with your left thumb anywhere on the left of the screen. The throttle is held for you.' : 'Steer with [steer]. [accel] drives and [brake] brakes.',
          touch ? 'The pause button, top right, pauses or skips the tutorial.' : '[pause] pauses, or skips the tutorial.',
        ],
      };
    case 'rev':
      return {
        title: 'Rev up',
        lines: [
          `${touch ? 'Hold the stick' : 'Hold [accel]'} now to rev. Keep the needle in the green as the lights go out for a perfect launch: extra speed and Drive.`,
          'Into the red and you bog down.',
        ],
      };
    case 'strip':
      return {
        title: 'Charge strips',
        lines: ['The glowing lane ahead is a charge strip. Run along it to fill your Drive, the bar beside your speed.', 'Drive pays for boosts, and later for dashes and your heavy blow.'],
      };
    case 'boost':
      return { title: 'Boost', lines: ['Hold [boost] to boost: a big lift in top speed while it burns Drive.', 'It needs a little Drive to light, so keep the bar topped up.'] };
    case 'gate':
      return {
        title: 'Gold gates',
        lines: ['Fly between the posts of a gold gate for a Cell, and each teammate gets half of one.', 'Cells, up to three, pay for abilities. Those arm on lap 2.'],
      };
    case 'carve':
      return {
        title: 'Carve the corners',
        lines: [
          'Steer into a corner and hold [brake] to carve. You grip harder and build charge: cyan, then gold, then magenta.',
          'Too hot for a hairpin? Push the stick hard into the turn: the carve bites, shedding speed to hold the line.',
          'Let go as the corner opens for a burst of speed.',
        ],
      };
    case 'draft':
      return {
        title: 'Slipstream',
        lines: ["Close behind a rival you're in their slipstream: it pulls you along and tops up your Drive.", "Pull out late and the stored pull carries you past. That's the slingshot."],
      };
    case 'battle': {
      const lines = ['Weapons are free. Places score 15, 7, 5, 3, 2 and 1, and every knockout scores 3 for the team, so a fight can swing a race.'];
      if (t.spar >= 0 && inPlay(race.mechs[t.spar])) lines.push(`${spar}, their Forward, is up for a duel.`);
      return { title: 'Battle lap', lines };
    }
    case 'lock':
      return {
        title: 'Lock on',
        lines: [
          `${touch ? '[Lock on]' : '[lock]'} locks on to the rival nearest the middle of your view: the corner brackets show who.`,
          'Locked on, the track carries you and the stick moves you round your target.',
        ],
      };
    case 'attack':
      return {
        title: 'Attack',
        lines: [
          `${touch ? '[Attack]' : '[x]'} swings your blade. Press it again as each blow lands for a three-hit string.`,
          `${touch ? '[Special]' : '[y]'} throws your heavy, the Lance Dash: a lunge across a gap that costs Drive.${touch ? '' : ' Hold [y] to charge it.'}`,
        ],
      };
    case 'tell':
      return {
        title: 'Read the ring',
        lines: [`${spar} is winding up a heavy blow. The ring closes on them and turns white just before it lands.`, 'Its colour tells you the answer. These first few run in slow motion.'],
        legend: [
          { kind: 'parry', text: `Gold: tap ${touch ? '[Guard]' : '[guard]'} as it turns white to parry. They're left reeling.` },
          { kind: 'dodge', text: `Red: dash out of the way with ${touch ? '[Dash]' : '[dash]'}. A guard can't stop it.` },
          { kind: 'block', text: `Orange: hold ${touch ? '[Guard]' : '[guard]'}. It's a heavy gun.` },
        ],
      };
    case 'dash':
      return {
        title: 'Dash and swing',
        lines: touch
          ? ['[Dash] dashes the way you push the stick, and for a moment nothing can touch you.', 'Hold [Guard], push the stick to the side and tap [Dash]: you swing round your target instead.']
          : ['Locked on, [dash] dashes the way you steer, and for a moment nothing can touch you.', 'With your guard up and steering to one side, [swing] swings you round your target instead.'],
      };
    case 'escape':
      return {
        title: 'Leave the fight',
        lines: [
          `${touch ? '[Let go]' : '[lock]'} lets go of the lock, and you race on.`,
          `In real trouble, ${touch ? '[Break Away]' : '[ability] Break Away'} shakes off every lock on you and bursts you clear. It costs a Cell.`,
        ],
      };
    case 'ko':
      return { title: 'Knockout', lines: [`${spar} is out of the race: 3 points to your team.`, "A mech that's knocked out scores nothing for its place."] };
    case 'speed':
      return {
        title: 'Speed lap',
        lines: ["The limiter is off: every frame runs at its own top speed, and armour you've lost costs a little of it.", 'Most races are won here.'],
      };
    case 'overdrive': {
      const lines = [`${touch ? '[Overdrive]' : '[ability]'} fires Overdrive: four seconds far past top speed, on this lap only. It costs a Cell.`];
      if (me.cells < 1) lines.push('You have no Cell yet: take a gold gate first.');
      return { title: 'Overdrive', lines };
    }
    case 'tow':
      return {
        title: 'Tow and slingshot',
        lines: ['On the speed lap the slipstream reaches much further and pulls twice as hard.', "Sit in a rival's tow, then pull out late to slingshot past."],
      };
    case 'plays':
      return {
        title: 'Team plays',
        lines: touch
          ? ['Your teammates take orders: tap [Team], then a play.', 'Blitz attacks anyone near. Run races and stays out of fights. Shield guards you. Mark sends them all at your target.']
          : ['Your teammates take orders. [up] Blitz: attack anyone near. [right] Run: race, stay out of fights. [down] Shield: guard you. [left] Mark: all on your target.', 'Call the same play again to stand them down.'],
      };
  }
}

/** The tutorial's last word, over its results: how the points came, and where to go next. */
export function debrief(race: RaceState, pupil: number): string[] {
  const me = race.mechs[pupil];
  const lines = [
    "Your team's score adds up all three of its places (15, 7, 5, 3, 2 and 1), plus 3 for each knockout and a few points for support, like backing up a teammate in a fight.",
    'Free Play races any circuit against any rival, in any format. The Grand Prix runs cups for medals.',
  ];
  // (Played as a Forward: the other two frames are the next thing to try.)
  if (!me || me.role === ROLE.FW) lines.push("The Midfielder and the Defender fly differently: the Midfielder's carbine works at range, and the Defender guards hard and shields the team. Try them in Free Play.");
  return lines;
}

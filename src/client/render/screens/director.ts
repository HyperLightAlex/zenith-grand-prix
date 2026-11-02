// The hover screens' director: what the feed shows, the way a race's
// broadcast picks its pictures. By default the leader; a fight or a close
// pass anywhere in the field when there is one; and it cuts in for the big
// moments (a knockout, a ring-out, a heavy blow landed, a new leader, the
// winner crossing the line), holding each a few seconds before it lets the
// next take over. Only the screens' feed follows it; the pilot's own camera
// is never moved.
import { MODE, type RaceState, type SimEvent } from '../../../sim/index';

/** What a shot is of, and so how it is framed and captioned. */
export type Story = 'leader' | 'lead' | 'fight' | 'pass' | 'knockout' | 'ringout' | 'finish';

export interface Cut {
  story: Story;
  /** The mech it follows, and the other in it (-1: none). */
  subject: number;
  partner: number;
}

interface Offer extends Cut {
  /** How much it is worth showing (0 to 100), and for how long it holds once on. */
  worth: number;
  hold: number;
  /** Seconds it has waited to go on: an old offer is stale. */
  age: number;
}

/** How long a story holds on before anything but a big moment may cut in. */
export const MIN_HOLD = 2;
/** A big moment cuts in at once (from this worth up). */
const URGENT = 90;
/** An offer not yet on is dropped after this long (longer than MIN_HOLD: one made as a shot goes on can wait it out). */
const STALE = 2.5;
/** How long the leader (or a fight found in the field) holds before the director looks again. */
const AMBIENT = 6.5;
/** A fight in the field: a pair locked on and within this far of each other along the road. */
const FIGHT_RANGE = 40;

export class FeedDirector {
  story: Story = 'leader';
  subject = -1;
  partner = -1;
  /** Seconds on the story so far, and left of it. */
  private held = 0;
  private left = 0;
  private hold = 0;
  private worth = 0;
  private offer: Offer | null = null;
  private leader = -1;
  /** Bumped at every cut: the screens start a new shot on a change. */
  cuts = 0;

  /** Something the race reported, that may be worth a cut. */
  note(e: SimEvent, race: RaceState): void {
    const live = (id: number) => id >= 0 && id < race.mechs.length;
    switch (e.type) {
      case 'ko':
        this.offerCut({ story: 'knockout', subject: e.mech, partner: live(e.by) ? e.by : -1 }, 100, 5);
        break;
      case 'fall':
        this.offerCut({ story: 'ringout', subject: e.mech, partner: live(e.by) ? e.by : -1 }, live(e.by) ? 95 : 60, 4.5);
        break;
      case 'finish':
        if (e.place === 1) this.offerCut({ story: 'finish', subject: e.mech, partner: -1 }, 96, 6);
        break;
      case 'hit':
        if (!e.blocked && (e.heavy || e.charged)) this.offerCut({ story: 'fight', subject: e.attacker, partner: e.victim }, 50, 4);
        break;
      case 'guardBreak':
        if (live(e.by)) this.offerCut({ story: 'fight', subject: e.by, partner: e.mech }, 45, 4);
        break;
      case 'pass':
        this.offerCut({ story: 'pass', subject: e.mech, partner: e.other }, race.mechs[e.mech].place <= 3 ? 40 : 30, 3.5);
        break;
      case 'lock':
        if (live(e.target)) this.offerCut({ story: 'fight', subject: e.mech, partner: e.target }, 25, 4);
        break;
    }
  }

  /** Each frame: the story runs down; a waiting offer goes on when it may; when nothing is on, the leader or a fight in the field. Returns whether it cut. */
  update(dt: number, race: RaceState): boolean {
    this.held += dt;
    this.left -= dt;
    const cuts = this.cuts;
    // A new leader is a story of its own.
    const lead = leaderOf(race);
    if (lead >= 0 && lead !== this.leader) {
      if (this.leader >= 0 && race.tick > 0) this.offerCut({ story: 'lead', subject: lead, partner: this.leader }, 70, 5);
      this.leader = lead;
    }
    // Someone in the story out of it (and it was not about them going out): it is over.
    const gone = (id: number) => id >= 0 && race.mechs[id]?.retired && this.story !== 'knockout' && this.story !== 'ringout';
    if (gone(this.subject)) this.left = 0;
    if (this.offer) {
      this.offer.age += dt;
      if (this.offer.age > STALE) this.offer = null;
      else if (this.may(this.offer.worth)) this.take(this.offer);
    }
    // Nothing on: from the leader to a fight in the field if there is one,
    // and back to the leader after it (or after anything else).
    if (this.left <= 0 && this.cuts === cuts) {
      const fight = this.story === 'leader' && this.cuts > 0 ? fightIn(race) : null;
      if (fight) this.take({ story: 'fight', subject: fight[0], partner: fight[1], worth: 35, hold: AMBIENT, age: 0 });
      else if (lead >= 0) this.take({ story: 'leader', subject: lead, partner: -1, worth: 20, hold: AMBIENT, age: 0 });
    }
    // On the leader, the leader it is (unless the new leader's own story is waiting to go on).
    if (this.story === 'leader' && lead >= 0 && this.subject !== lead && !this.offer) this.take({ story: 'leader', subject: lead, partner: -1, worth: 20, hold: AMBIENT, age: 0 });
    return this.cuts !== cuts;
  }

  /** What is on. */
  get cut(): Cut {
    return { story: this.story, subject: this.subject, partner: this.partner };
  }

  /** How much the story on is still worth: its full worth while it is new, running down to nothing as it ends. */
  private worthNow(): number {
    if (this.left <= 0) return 0;
    return this.held < MIN_HOLD ? this.worth : this.worth * Math.min(1, this.left / Math.max(0.1, this.hold));
  }

  /** Whether something worth `worth` may cut in now. */
  private may(worth: number): boolean {
    if (worth <= this.worthNow()) return false;
    return worth >= URGENT || this.held >= MIN_HOLD || this.left <= 0;
  }

  private offerCut(c: Cut, worth: number, hold: number): void {
    if (c.subject < 0) return;
    const o: Offer = { ...c, worth, hold, age: 0 };
    if (this.may(worth)) this.take(o);
    else if (!this.offer || worth >= this.offer.worth) this.offer = o;
  }

  private take(o: Offer): void {
    this.story = o.story;
    this.subject = o.subject;
    this.partner = o.partner;
    this.worth = o.worth;
    this.hold = o.hold;
    this.left = o.hold;
    this.held = 0;
    this.offer = null;
    this.cuts++;
  }
}

/** The mech in the lead (still racing, or the winner), or -1. */
export function leaderOf(race: RaceState): number {
  let best = -1;
  for (const m of race.mechs) {
    if (m.retired && !m.finished) continue;
    if (best < 0 || m.place < race.mechs[best].place) best = m.id;
  }
  return best;
}

/** A fight in the field: two rivals locked in battle near each other, the one nearest the front; or null. */
export function fightIn(race: RaceState): [number, number] | null {
  let best: [number, number] | null = null;
  let bestPlace = Infinity;
  for (const m of race.mechs) {
    if (m.retired || m.finished || m.mode !== MODE.BATTLE || m.target < 0) continue;
    const o = race.mechs[m.target];
    if (!o || o.retired || o.finished || Math.abs(o.s - m.s) > FIGHT_RANGE) continue;
    const place = Math.min(m.place, o.place);
    if (place < bestPlace) {
      bestPlace = place;
      best = [m.id, o.id];
    }
  }
  return best;
}

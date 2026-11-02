// The hover screens' director (render/screens/director.ts): the leader by
// default, a fight in the field between, and the big moments cutting in,
// each held a little before the next may take over.

import { describe, expect, it } from 'vitest';
import { MODE, type RaceState } from '../src/sim/index';
import { FeedDirector, MIN_HOLD, fightIn, leaderOf } from '../src/client/render/screens/director';
import { newRace } from './helpers';

/** A race with its places set: `order` the mech ids from first. */
function raced(order: number[]): RaceState {
  const race = newRace(5);
  race.tick = 600;
  order.forEach((id, k) => (race.mechs[id].place = k + 1));
  return race;
}

/** Run the director `seconds` on, a frame at a time. */
function run(dir: FeedDirector, race: RaceState, seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 30) dir.update(1 / 30, race);
}

describe('the feed director', () => {
  it('starts on the leader, and follows the lead when it changes, with the new leader as a story', () => {
    const race = raced([2, 0, 1, 3, 4, 5]);
    const dir = new FeedDirector();
    run(dir, race, 0.1);
    expect(leaderOf(race)).toBe(2);
    expect(dir.cut).toEqual({ story: 'leader', subject: 2, partner: -1 });
    run(dir, race, MIN_HOLD + 0.1);
    race.mechs[2].place = 2;
    race.mechs[0].place = 1;
    run(dir, race, 0.1);
    expect(dir.cut).toEqual({ story: 'lead', subject: 0, partner: 2 });
  });

  it('cuts to a knockout at once, whoever was on, and holds it over a lesser moment', () => {
    const race = raced([0, 1, 2, 3, 4, 5]);
    const dir = new FeedDirector();
    run(dir, race, 0.1);
    dir.note({ type: 'hit', attacker: 3, victim: 4, attack: 0, damage: 30, blocked: false, heavy: true, charged: false, s: 0, d: 0 }, race);
    // Not yet: the leader has only just gone on.
    expect(dir.cut.story).toBe('leader');
    dir.note({ type: 'ko', mech: 5, by: 1 }, race);
    expect(dir.cut).toEqual({ story: 'knockout', subject: 5, partner: 1 });
    // A lock-on, or a heavy blow, does not take it off.
    dir.note({ type: 'lock', mech: 2, target: 3 }, race);
    dir.note({ type: 'hit', attacker: 3, victim: 4, attack: 0, damage: 30, blocked: false, heavy: true, charged: false, s: 0, d: 0 }, race);
    run(dir, race, MIN_HOLD + 0.5);
    expect(dir.cut.story).toBe('knockout');
    // Until it has run its time: then back to the leader.
    run(dir, race, 4);
    expect(dir.cut).toEqual({ story: 'leader', subject: 0, partner: -1 });
  });

  it('puts a heavy blow on once the shot on has held, and lets a stale one go', () => {
    const race = raced([0, 1, 2, 3, 4, 5]);
    const dir = new FeedDirector();
    run(dir, race, 0.1);
    dir.note({ type: 'hit', attacker: 3, victim: 4, attack: 0, damage: 30, blocked: false, heavy: true, charged: false, s: 0, d: 0 }, race);
    run(dir, race, MIN_HOLD);
    expect(dir.cut).toEqual({ story: 'fight', subject: 3, partner: 4 });

    const later = new FeedDirector();
    run(later, race, 0.1);
    later.note({ type: 'ko', mech: 1, by: 2 }, race);
    // A pass during the knockout: worth less than it for longer than it waits, so it is dropped.
    later.note({ type: 'pass', mech: 4, other: 5 }, race);
    run(later, race, 3);
    expect(later.cut.story).toBe('knockout');
    run(later, race, 3);
    expect(later.cut).toEqual({ story: 'leader', subject: 0, partner: -1 });
  });

  it("goes from the leader to a fight in the field and back, the fight nearest the front", () => {
    const race = raced([0, 1, 2, 3, 4, 5]);
    for (const [a, b] of [[4, 5], [2, 3]]) {
      race.mechs[a].mode = MODE.BATTLE;
      race.mechs[a].target = b;
      race.mechs[b].s = race.mechs[a].s + 10;
    }
    expect(fightIn(race)).toEqual([2, 3]);
    const dir = new FeedDirector();
    run(dir, race, 0.1);
    expect(dir.cut.story).toBe('leader');
    run(dir, race, 7);
    expect(dir.cut).toEqual({ story: 'fight', subject: 2, partner: 3 });
    run(dir, race, 7);
    expect(dir.cut.story).toBe('leader');
  });

  it('shows the winner crossing the line', () => {
    const race = raced([0, 1, 2, 3, 4, 5]);
    const dir = new FeedDirector();
    run(dir, race, 0.1);
    dir.note({ type: 'finish', mech: 0, place: 1 }, race);
    expect(dir.cut).toEqual({ story: 'finish', subject: 0, partner: -1 });
  });
});

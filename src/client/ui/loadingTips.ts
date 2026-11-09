// The tips the loading card cycles through: short, true to the rules (see
// docs/DESIGN.md), each for the races it fits (a team race or a Sprint, a
// frame, a circuit) and naming the controls as the player's device has them.

import type { Device } from '../input/input';
import { KEYS } from './keyNames';

export interface Tip {
  id: string;
  /** The tip, with {control} for a control's name on the player's device (KEYS). */
  text: string;
  /** Only in a team race, or only in a Sprint. */
  mode?: 'team' | 'sprint';
  /** Only for these frames (0 Forward, 1 Midfielder, 2 Defender). */
  roles?: number[];
  /** Only on this circuit. */
  track?: string;
  /** Not on these devices (a control they have no name for). */
  not?: Device[];
}

export const TIPS: readonly Tip[] = [
  // The start and the laps.
  { id: 'rev', text: 'Rev on the grid: hold the throttle so the gauge sits in the green as the lights go out, for a running start and 10 Drive.' },
  { id: 'formation', text: 'Lap 1 is the formation lap: weapons are locked, and everyone runs to the same limiter.' },
  { id: 'pack', text: 'Drop more than 40 m behind the leader on laps 1 and 2 and your limiter opens up, so the pack is hard to lose.' },
  { id: 'tow', text: 'On lap 3 the limiter is off. Sit in a rival’s tow, then pull out: the slingshot carries you past.' },
  // Drive.
  { id: 'strips', text: 'Drive starts empty. Charge strips fill it fastest, 10 a second while you ride them.' },
  { id: 'boost', text: 'Boost costs 6 Drive to light and 15 a second after that. Even a tap burns for half a second.' },
  { id: 'landing', text: 'Land softly after a real jump for 6 Drive. Pass a rival close by for 4 more.' },
  // Carving.
  { id: 'carve', text: 'Carve into a tight corner with {carve}, then let go on the way out. The sparks’ colour shows the burst you’ve charged.' },
  { id: 'bite', text: 'Push the stick all the way into a carve and it bites: a tighter line, paid for in speed. Ease off to keep your pace.' },
  { id: 'scrape', text: 'Scrape the barrier mid-carve and the charge is gone. Keep off the wall to keep the burst.' },
  { id: 'inside', text: 'The inside line really is shorter. Take it when you can.' },
  // Cells and abilities.
  { id: 'gates', text: 'Thread a gold gate for a Cell. The first one through takes it, and it goes dark for 4 seconds.' },
  { id: 'abilities', text: 'Abilities arm on lap 2 and cost a Cell each. The same button does one thing free steering and another locked on.' },
  // Fighting.
  { id: 'lock', text: 'Lock on with {lock} to fight: the track carries you at your target’s pace while you close in, circle and strike.' },
  { id: 'momentum', text: 'Arrive in a fight hot: a boost or a charged tow makes your first blow a momentum strike, 35% harder.' },
  { id: 'rings', text: 'A gold ring closing on a rival: parry as it turns white. Red breaks guards, so dash. Orange is a heavy gun, so guard.' },
  { id: 'ringout', text: 'Knock a reeling rival into the barrier for a ring-out. If it takes their last armour, the knockout is yours.' },
  // Team races.
  { id: 'share', text: 'Your gates give each teammate half a Cell. Spread out across the gates and the team banks more.', mode: 'team' },
  { id: 'plays', text: 'Call a team play with {plays}: Blitz, Run, Shield or Mark. Call it again to go back to Free.', mode: 'team', not: ['touch'] },
  { id: 'escort', text: 'From lap 2, escort a teammate within 26 m with {ally} and you both gain Drive.', mode: 'team' },
  { id: 'points', text: 'Places pay 15, 7, 5, 3, 2 and 1, and each knockout 3 more. Second, third and fourth beat a lone winner.', mode: 'team' },
  { id: 'support', text: 'Support points count for the team, up to 8 a pilot a race: a strong support race is worth about a second place.', mode: 'team' },
  { id: 'leadout', text: 'On lap 3, tow your Forward and let them pull out past someone: a lead-out is 2 support points.', mode: 'team', roles: [1, 2] },
  { id: 'opener', text: 'Snare the rival Forward for 2 support points, and earn more for every 60 damage your team deals while it holds.', mode: 'team', roles: [1] },
  { id: 'peel', text: 'Hit a rival who’s attacking your Forward to peel them off: a support point, or two if it breaks their attack.', mode: 'team', roles: [2] },
  // Sprints.
  { id: 'sprint', text: 'In a Sprint every pilot is a rival. Places pay 10, 8, 6, 4, 2 and 1.', mode: 'sprint' },
  { id: 'trail', text: 'In a Sprint, follow someone through a gate they’ve just darkened and you still get half a Cell.', mode: 'sprint' },
  { id: 'grid', text: 'After the first race of a Sprint the grid is the standings reversed: the leader starts at the back.', mode: 'sprint' },
  // The frames.
  { id: 'overdrive', text: 'Overdrive, from lap 3: four seconds at 30% over, damage or not. It closes a gap too big for the tow.', roles: [0] },
  { id: 'breakaway', text: 'Locked on and in trouble? Break Away ends a stagger, clears a Snare and drops every lock on you.', roles: [0] },
  { id: 'carbine', text: 'The carbine reaches 62 m. Hold {x} to keep firing.', roles: [1] },
  { id: 'snare', text: 'A clean Snare holds your target to 74% of its pace for 3.5 seconds, with no boost.', roles: [1] },
  { id: 'disruptor', text: 'Disruptor, free steering: every rival within 26 m takes a heavy hit and loses 30 Drive.', roles: [1] },
  { id: 'aegis', text: 'Aegis: you and every teammate within 34 m take 35% of the damage and can’t be staggered, for 4 seconds.', roles: [2] },
  { id: 'ram', text: 'Ram, locked on: 3.5 seconds of charge at three times the mass. Drive them into a wall.', roles: [2] },
  { id: 'breaker', text: 'The Breaker’s second blow breaks a guard.', roles: [2] },
  // The circuits.
  { id: 'meridian', text: 'The Harbour Hairpin is the best carve on any circuit. Hold it tight for the biggest burst.', track: 'meridian' },
  { id: 'canyon', text: 'Canyon’s esses swing 80 degrees each way: carve the first, let go, carve the second.', track: 'canyon' },
  { id: 'helios', text: 'Coming down from the Drop, the Switchback flicks left then right. Be on your line for both.', track: 'helios' },
  { id: 'crucible', text: 'The Coil climbs four and a quarter turns round the pit: the longest carve anywhere, with a big burst out of it.', track: 'crucible' },
  { id: 'frostline', text: 'The Aurora Split parts the road in two. Pick your route before the wall between them grows in.', track: 'frostline' },
  { id: 'titan', text: 'The road climbs the fallen titan: up the Palm, along the Arm and over the Shoulder.', track: 'titan' },
  { id: 'abyss', text: 'The Trench Leap is open underneath. Hit the pad with your speed up and fly it.', track: 'abyss' },
  { id: 'monsoon', text: 'The Stairway’s hairpins are too tight to take flat. Push all the way into the carve so it bites.', track: 'monsoon' },
  { id: 'zenith', text: 'The Möbius barrel rolls the road round. Hands off, you run wide: steer through it.', track: 'zenith' },
];

/** The control names a tip can ask for, on a device. */
function control(name: string, device: Device): string {
  if (name === 'plays') return device === 'pad' ? 'the D-pad' : `${KEYS.keys.up} to ${KEYS.keys.left}`;
  return KEYS[device][name] ?? name;
}

/** A tip's text in parts: plain text, and the controls (to be drawn as keys). */
export function tipParts(tip: Tip, device: Device): Array<{ text: string; key?: boolean }> {
  const out: Array<{ text: string; key?: boolean }> = [];
  let at = 0;
  for (const m of tip.text.matchAll(/\{(\w+)\}/g)) {
    if (m.index > at) out.push({ text: tip.text.slice(at, m.index) });
    out.push({ text: control(m[1], device), key: true });
    at = m.index + m[0].length;
  }
  if (at < tip.text.length) out.push({ text: tip.text.slice(at) });
  return out;
}

const SEEN_KEY = 'zgp.tipsSeen';
const SEEN_KEEP = 16;

function seen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** A tip has been shown: it goes to the back of the queue for the next loads. */
export function markSeen(id: string): void {
  try {
    const list = [id, ...seen().filter((x) => x !== id)].slice(0, SEEN_KEEP);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    // (Not kept: the next load may show it again.)
  }
}

/**
 * The tips for a race, in the order to show them: one about this circuit
 * or your frame first (half the time), then the rest that fit, shuffled,
 * the ones shown lately last.
 */
export function tipsFor(c: { sprint: boolean; role: number; track: string; device: Device }, rng: () => number = Math.random): Tip[] {
  const fits = TIPS.filter((t) => (!t.mode || t.mode === (c.sprint ? 'sprint' : 'team')) && (!t.roles || t.roles.includes(c.role)) && (!t.track || t.track === c.track) && !t.not?.includes(c.device));
  const recent = seen();
  const order = fits
    .map((t) => ({ t, k: rng() + (recent.includes(t.id) ? 2 + (SEEN_KEEP - recent.indexOf(t.id)) / SEEN_KEEP : 0) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.t);
  const own = order.find((t) => (t.track || t.roles) && !recent.slice(0, 4).includes(t.id));
  if (own && rng() < 0.5) return [own, ...order.filter((t) => t !== own)];
  return order;
}

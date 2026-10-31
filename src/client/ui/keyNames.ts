// What each control is called on each device, for the HUD's hints and the
// tutorial's cards: the pad's buttons, the keyboard's keys, the touch
// screen's buttons by their names ('' where touch has none: the throttle is
// held for you).
import type { Device } from '../input/input';

export const KEYS: Record<Device, Record<string, string>> = {
  pad: { accel: 'RT', brake: 'LT', carve: 'LT + stick', boost: 'A', dash: 'A', swing: 'LT + ◀▶ + A', lock: 'LB', ally: 'L3', ability: 'B', x: 'X', y: 'Y', guard: 'LT', swap: 'R stick ◀ ▶', up: '▲', right: '▶', down: '▼', left: '◀', pause: 'Start' },
  keys: { accel: 'W', brake: 'S', carve: 'S + A/D', boost: 'Space', dash: 'Space', swing: 'L + A/D + Space', lock: 'Q', ally: 'E', ability: 'R', x: 'J', y: 'K', guard: 'L', swap: 'Z C', up: '1', right: '2', down: '3', left: '4', pause: 'Esc' },
  // The on-screen buttons go by their names, and the HUD shows no keys for them (no hints bar, no plays diamond).
  touch: { accel: '', brake: 'Carve', carve: 'Carve', boost: 'Boost', dash: 'Dash', swing: 'Guard + Dash', lock: '◎', ally: 'Escort', ability: '', x: 'Attack', y: 'Special', guard: 'Guard', swap: 'Switch', up: '', right: '', down: '', left: '', pause: '' },
};

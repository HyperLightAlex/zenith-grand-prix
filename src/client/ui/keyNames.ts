// What each control is called on each device, for the HUD's hints and the
// tutorial's cards: the pad's buttons, the keyboard's keys, the touch
// screen's buttons by their names ('' where touch has none: the throttle is
// held for you). The pad's and the keyboard's follow the controls as
// remapped in Settings (see applyBindingNames).
import type { Device } from '../input/input';
import { keysLabel, padButton, padName, type ActionId } from '../settings';

export const KEYS: Record<Device, Record<string, string>> = {
  pad: { accel: 'RT', brake: 'LT', carve: 'LT + stick', boost: 'A', dash: 'A', swing: 'LT + ◀▶ + A', lock: 'LB', ally: 'L3', ability: 'B', x: 'X', y: 'Y', guard: 'LT', swap: 'R stick ◀ ▶', up: '▲', right: '▶', down: '▼', left: '◀', pause: 'Start' },
  keys: { accel: 'W', brake: 'S', carve: 'S + A/D', boost: 'Space', dash: 'Space', swing: 'L + A/D + Space', lock: 'Q', ally: 'E', ability: 'R', x: 'J', y: 'K', guard: 'L', swap: 'Z C', up: '1', right: '2', down: '3', left: '4', pause: 'Esc' },
  // The on-screen buttons go by their names, and the HUD shows no keys for them (no hints bar, no plays diamond).
  touch: { accel: '', brake: 'Carve', carve: 'Carve', boost: 'Boost', dash: 'Dash', swing: 'Guard + Dash', lock: '◎', ally: 'Escort', ability: '', x: 'Attack', y: 'Special', guard: 'Guard', swap: 'Switch', up: '', right: '', down: '', left: '', pause: '' },
};

/** Bumped each time the names change, so whatever caches them (the HUD's hints) draws them again. */
export let keysVersion = 0;

/** The names, after the controls as they are now (remapped or not). */
export function applyBindingNames(): void {
  const p = (id: ActionId) => padName(padButton(id) ?? 0);
  const k = keysLabel;
  Object.assign(KEYS.pad, {
    accel: p('accel'),
    brake: p('brake'),
    carve: `${p('brake')} + stick`,
    boost: p('boost'),
    dash: p('boost'),
    swing: `${p('brake')} + ◀▶ + ${p('boost')}`,
    lock: p('lock'),
    ally: p('escort'),
    ability: p('ability'),
    x: p('attack'),
    y: p('special'),
    guard: p('brake'),
  });
  Object.assign(KEYS.keys, {
    accel: k('accel'),
    brake: k('brake'),
    carve: `${k('brake')} + ${k('left')}/${k('right')}`,
    boost: k('boost'),
    dash: k('boost'),
    swing: `${k('guard')} + ${k('left')}/${k('right')} + ${k('boost')}`,
    lock: k('lock'),
    ally: k('escort'),
    ability: k('ability'),
    x: k('attack'),
    y: k('special'),
    guard: k('guard'),
    swap: `${k('targetPrev')} ${k('targetNext')}`,
  });
  keysVersion++;
}

applyBindingNames();

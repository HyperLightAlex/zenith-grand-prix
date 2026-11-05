// The player's own settings, kept on this device: the controls (each
// action's gamepad button and keys, remapped or as they come), how the race
// camera's look works, and the accessibility options. (The picture's are in
// video.ts; the sound's volumes and the camera's distance and effects are
// "feel" values in game/tuning.ts, which the Settings screen sets.)

import { BTN } from '../sim/index';

/** What can be remapped. Menus keep their own buttons whatever is done here. */
export type ActionId = 'accel' | 'brake' | 'left' | 'right' | 'boost' | 'attack' | 'special' | 'guard' | 'lock' | 'ability' | 'escort' | 'lookBack' | 'targetPrev' | 'targetNext';

export interface ActionDef {
  id: ActionId;
  label: string;
  /** The gamepad button it comes on (standard layout), or null for one the stick does (`padFixed` names it). */
  pad: number | null;
  padFixed?: string;
  /** The keys it comes on, the first shown. */
  keys: string[];
  /** The race button it presses, if it is one. */
  bit?: number;
}

export const ACTIONS: readonly ActionDef[] = [
  { id: 'accel', label: 'Accelerate', pad: 7, keys: ['KeyW', 'ArrowUp'] },
  { id: 'brake', label: 'Brake, carve (guard when locked on)', pad: 6, keys: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Steer left', pad: null, padFixed: 'Left stick', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Steer right', pad: null, padFixed: 'Left stick', keys: ['KeyD', 'ArrowRight'] },
  { id: 'boost', label: 'Boost, dash', pad: 0, keys: ['Space'], bit: BTN.A },
  { id: 'attack', label: 'Attack', pad: 2, keys: ['KeyJ'], bit: BTN.X },
  { id: 'special', label: 'Special', pad: 3, keys: ['KeyK'], bit: BTN.Y },
  { id: 'guard', label: 'Guard', pad: 5, keys: ['KeyL', 'ShiftLeft', 'ShiftRight'], bit: BTN.GUARD },
  { id: 'lock', label: 'Lock on, let go', pad: 4, keys: ['KeyQ', 'Tab'], bit: BTN.LOCK },
  { id: 'ability', label: 'Ability', pad: 1, keys: ['KeyR'], bit: BTN.ABILITY },
  { id: 'escort', label: 'Escort a teammate', pad: 10, keys: ['KeyE'], bit: BTN.ALLY },
  { id: 'lookBack', label: 'Look back', pad: 11, keys: ['KeyV'] },
  { id: 'targetPrev', label: 'Switch target left', pad: null, padFixed: 'Right stick ◀', keys: ['KeyZ'], bit: BTN.TPREV },
  { id: 'targetNext', label: 'Switch target right', pad: null, padFixed: 'Right stick ▶', keys: ['KeyC'], bit: BTN.TNEXT },
];

/** Gamepad buttons the game keeps for itself: Back (the tuning panel), Start (pause), the D-pad (team plays). */
export const PAD_RESERVED: ReadonlySet<number> = new Set([8, 9, 12, 13, 14, 15]);
/** Keys the game keeps for itself: pause and back, full screen, the hangar's music, the team plays. */
export const KEYS_RESERVED: ReadonlySet<string> = new Set(['Escape', 'KeyP', 'KeyF', 'KeyM', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Backquote', 'KeyT', 'KeyG']);

export interface Settings {
  v: 1;
  /** The look on the right stick, turned round. */
  invertX: boolean;
  invertY: boolean;
  /** The screen's flashes softened, the anime look's impact frames off, lightning dimmed. */
  reduceFlashes: boolean;
  /** No shake, no lurch on a boost, fewer speed effects; the menus' movement off. */
  reduceMotion: boolean;
  /** The race HUD's size (1 as drawn). */
  hudScale: number;
  /** The button hints along the bottom of a race. */
  hints: boolean;
  /** Guard and carve: held (false) or pressed once to start and again to stop (true). */
  toggleGuard: boolean;
  toggleCarve: boolean;
  /** Remapped controls (what is not here is as it comes). */
  pad: Partial<Record<ActionId, number>>;
  keys: Partial<Record<ActionId, string[]>>;
}

export const HUD_SCALES = [0.85, 1, 1.15, 1.3] as const;

export function defaultSettings(): Settings {
  return { v: 1, invertX: false, invertY: false, reduceFlashes: false, reduceMotion: false, hudScale: 1, hints: true, toggleGuard: false, toggleCarve: false, pad: {}, keys: {} };
}

const KEY = 'zgp.settings';

/** The settings in force (read everywhere; changed through `changeSettings`). */
export const settings: Settings = load();

/** Called after any change. */
export const settingsListeners: Array<(s: Settings) => void> = [];

function load(): Settings {
  const base = defaultSettings();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<Settings>;
    if (!d || typeof d !== 'object' || d.v !== 1) return base;
    const out = { ...base };
    for (const k of ['invertX', 'invertY', 'reduceFlashes', 'reduceMotion', 'hints', 'toggleGuard', 'toggleCarve'] as const) if (typeof d[k] === 'boolean') out[k] = d[k];
    if (typeof d.hudScale === 'number' && (HUD_SCALES as readonly number[]).includes(d.hudScale)) out.hudScale = d.hudScale;
    out.pad = {};
    out.keys = {};
    for (const a of ACTIONS) {
      const p = d.pad?.[a.id];
      if (a.pad !== null && typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < 32 && !PAD_RESERVED.has(p)) out.pad[a.id] = p;
      const k = d.keys?.[a.id];
      if (Array.isArray(k) && k.length && k.every((c) => typeof c === 'string' && c.length < 32 && !KEYS_RESERVED.has(c))) out.keys[a.id] = k.slice(0, 4);
    }
    return out;
  } catch {
    return base;
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* kept for this visit */
  }
}

export function changeSettings(change: Partial<Settings>): void {
  Object.assign(settings, change);
  save();
  for (const f of settingsListeners) f(settings);
}

const DEF = new Map(ACTIONS.map((a) => [a.id, a]));

/** The gamepad button an action is on (null: the stick's). */
export function padButton(id: ActionId): number | null {
  const a = DEF.get(id)!;
  return a.pad === null ? null : (settings.pad[id] ?? a.pad);
}

/** The keys an action is on. */
export function actionKeys(id: ActionId): readonly string[] {
  return settings.keys[id] ?? DEF.get(id)!.keys;
}

/**
 * Put an action on a gamepad button. Whatever was on it takes this
 * action's old button, so nothing is left with none.
 */
export function bindPad(id: ActionId, button: number): void {
  if (PAD_RESERVED.has(button) || DEF.get(id)!.pad === null) return;
  const old = padButton(id)!;
  const pad = { ...settings.pad };
  for (const a of ACTIONS) if (a.id !== id && padButton(a.id) === button) pad[a.id] = old;
  pad[id] = button;
  for (const a of ACTIONS) if (pad[a.id] === a.pad) delete pad[a.id];
  changeSettings({ pad });
}

/**
 * Put an action on a key: it becomes the action's first key (any others it
 * had stay, but for one that was it). An action the key is taken from gets
 * this action's old first key if that leaves it with none.
 */
export function bindKey(id: ActionId, code: string): void {
  if (KEYS_RESERVED.has(code)) return;
  const old = actionKeys(id);
  const keys: Partial<Record<ActionId, string[]>> = { ...settings.keys };
  for (const a of ACTIONS) {
    if (a.id === id) continue;
    const ks = actionKeys(a.id);
    if (!ks.includes(code)) continue;
    const left = ks.filter((c) => c !== code);
    keys[a.id] = left.length ? left : [old[0]];
  }
  keys[id] = [code, ...old.slice(1).filter((c) => c !== code && c !== old[0])];
  for (const a of ACTIONS) {
    const k = keys[a.id];
    if (k && k.length === a.keys.length && k.every((c, i) => c === a.keys[i])) delete keys[a.id];
  }
  changeSettings({ keys });
}

/** An action (or all of them) back as it comes. */
export function resetBinding(id?: ActionId): void {
  if (!id) return changeSettings({ pad: {}, keys: {} });
  const pad = { ...settings.pad };
  const keys = { ...settings.keys };
  delete pad[id];
  delete keys[id];
  changeSettings({ pad, keys });
}

/** A gamepad button's name (the standard layout, as Xbox pads print them). */
export function padName(i: number): string {
  return ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', '▲', '▼', '◀', '▶'][i] ?? `Button ${i}`;
}

/** A key's name, as it is printed on it. */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'R Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R Ctrl',
    AltLeft: 'Alt',
    AltRight: 'R Alt',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    CapsLock: 'Caps',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Minus: '-',
    Equal: '=',
  };
  return named[code] ?? code;
}

/** An action's keys as the hints print them: the first, and the second if it is a letter's alternative worth showing. */
export function keysLabel(id: ActionId): string {
  const ks = actionKeys(id);
  return keyName(ks[0] ?? '');
}

// Controller input. Gamepad first, keyboard as a full fallback. Produces the
// MechInput the simulation wants, plus menu navigation and camera controls.
import { BTN, CARVE_MIN_STEER, emptyInput, type MechInput } from '../../sim/index';
import { toggleFullscreen } from '../fullscreen';
import { ACTIONS, actionKeys, padButton, settings, type ActionId } from '../settings';
import type { TouchControls } from './touch';

/** What was used last: the HUD and the menus show its buttons (touch: on-screen controls, no key glyphs). */
export type Device = 'pad' | 'keys' | 'touch';

/** One menu press. Presses are queued, so none are lost on a slow frame. */
/** 'track': on to the next track of the hangar's music (M, or the right stick pressed). */
export type MenuInput = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'tune' | 'look' | 'model' | 'rosterModel' | 'x' | 'y' | 'lb' | 'rb' | 'track';

/** Whether the keyboard is typing into a text field (a callsign, a code): its keys are not controls then. */
export function typing(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** The race buttons, by the action that presses them (see settings.ts: remappable). */
const BUTTON_ACTIONS = ACTIONS.filter((a) => a.bit !== undefined) as ReadonlyArray<{ id: ActionId; bit: number }>;

/** What a rebinding was given: a key, a gamepad button, or nothing (it was called off). */
export type Captured = { key: string } | { pad: number } | { cancel: true };

/**
 * Carving on the keys (S with A or D), a key held into the carve digs in
 * over a moment, as a stick would be pushed: from this much of the way over
 * (just past the middle of a carve's range, nowhere near a bite at the
 * first laps' pace) to all the way in after KEY_DIG_SECS. A key is all or
 * nothing, and all the way in at once would bite every carve hard.
 */
const KEY_DIG_FROM = 0.6;
const KEY_DIG_SECS = 0.6;

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

function dead(v: number, zone: number): number {
  const a = Math.abs(v);
  if (a < zone) return 0;
  return (Math.sign(v) * (a - zone)) / (1 - zone);
}

export class Input {
  /** Controls for the simulation this frame. */
  readonly state: MechInput = emptyInput();
  /** Right stick, for the camera. */
  camX = 0;
  camY = 0;
  lookBack = false;
  /** Menu presses since the last consumeMenu(), in order. */
  private menu: MenuInput[] = [];
  /** Which device was touched last; the HUD shows matching button hints. */
  device: Device = 'keys';
  /** The on-screen controls, once the game has made them. */
  private touchPad: TouchControls | null = null;
  padName = '';
  private keys = new Set<string>();
  /** Keys pressed since the last poll, so a tap shorter than a frame still counts. */
  private tapped = new Set<string>();
  private prevPad: boolean[] = [];
  private prevStickX = 0;
  private prevStickY = 0;
  private prevFlick = 0;
  private flickHold = 0;
  /** A carve's direction key held (its sign, 0 for none), and since when (ms). */
  private digDir = 0;
  private digAt = 0;
  /** Rebinding: called with the next key or gamepad button (see capture). */
  private capturing: ((c: Captured) => void) | null = null;
  /** Hold or toggle (settings): the guard toggled on, the carve held on, and the presses last frame. */
  private guardOn = false;
  private carveOn = false;
  private carveOnFor = 0;
  private prevGuardHeld = false;
  private prevBrakeHeld = false;
  /** When the held flick next repeats (performance.now, ms). */
  private flickNext = 0;
  /** Buttons that were down when a menu closed: ignored until they are let go. */
  private swallow = 0;
  onDeviceChange: (d: Device) => void = () => {};
  /** Called on the first key, click or button: browsers need a gesture before audio. */
  onFirstGesture: () => void = () => {};
  private gestured = false;

  constructor() {
    // A phone or tablet starts out on its screen (a pad or keyboard takes over as soon as it is used).
    try {
      if (typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches) this.device = 'touch';
    } catch {
      /* no media queries here */
    }
    const artReview = new URLSearchParams(location.search).get('artReview') === '1';
    window.addEventListener('keydown', (e) => {
      if (typing()) {
        // Typing a callsign or a code: only Enter, Esc and the arrows (up
        // and down) still work the menu.
        this.touch('keys');
        if (e.repeat) return;
        if (e.code === 'Enter' || e.code === 'NumpadEnter') this.menu.push('confirm');
        else if (e.code === 'Escape') this.menu.push('back');
        else if (e.code === 'ArrowUp') this.menu.push('up');
        else if (e.code === 'ArrowDown') this.menu.push('down');
        return;
      }
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      // Rebinding: the next key is the binding (Esc calls it off), and nothing else.
      if (this.capturing) {
        e.preventDefault();
        const cb = this.capturing;
        this.capturing = null;
        this.touch('keys');
        cb(e.code === 'Escape' ? { cancel: true } : { key: e.code });
        return;
      }
      if (e.code === 'KeyF') this.toggleFullscreen();
      this.keys.add(e.code);
      this.tapped.add(e.code);
      this.touch('keys');
      const m = this.menu;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') m.push('up');
      if (e.code === 'ArrowDown' || e.code === 'KeyS') m.push('down');
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') m.push('left');
      if (e.code === 'ArrowRight' || e.code === 'KeyD') m.push('right');
      if (e.code === 'Enter' || e.code === 'Space') m.push('confirm');
      if (e.code === 'Escape' || e.code === 'Backspace') m.push('back');
      if (e.code === 'Escape' || e.code === 'KeyP') m.push('pause');
      if (e.code === 'KeyT' || e.code === 'Backquote') m.push('tune');
      if (e.code === 'KeyG') m.push('look');
      if (e.code === 'KeyX') m.push('x');
      if (e.code === 'KeyY') m.push('y');
      if (e.code === 'KeyQ') m.push('lb');
      if (e.code === 'KeyE') m.push('rb');
      if (e.code === 'KeyM') m.push('track');
      if (artReview && e.code === 'KeyB') m.push('model');
      if (artReview && e.code === 'KeyN') m.push('rosterModel');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', (e: Event) => {
      this.gesture();
      // A finger on the screen means touch controls; the mouse back means the keyboard.
      const kind = (e as PointerEvent).pointerType;
      if (kind === 'touch') this.touch('touch');
      else if (kind === 'mouse' && this.device === 'touch') this.touch('keys');
    }, { capture: true });
    window.addEventListener('gamepadconnected', (e) => {
      this.padName = e.gamepad.id;
      this.touch('pad');
    });
  }

  /** Full screen on and off. Some embedded views refuse it; that is fine. */
  private toggleFullscreen(): void {
    void toggleFullscreen();
  }

  private gesture(): void {
    if (this.gestured) return;
    this.gestured = true;
    this.onFirstGesture();
  }

  /** The on-screen controls: read in place of the pad and keys while the screen is what was used last. */
  attachTouch(t: TouchControls): void {
    this.touchPad = t;
    t.onTouch = () => this.touch('touch');
    t.onMenu = (p) => this.menu.push(p);
  }

  /** A press from outside the devices (a touch button, a tool). */
  pushMenu(p: MenuInput): void {
    this.menu.push(p);
  }

  private touch(d: Device): void {
    this.gesture();
    if (this.device !== d) {
      this.device = d;
      this.onDeviceChange(d);
    }
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Read the devices. Call once per frame before using `state`. */
  poll(): void {
    const s = this.state;
    // Held keys plus anything tapped since the last frame.
    const k = this.tapped;
    for (const code of this.keys) k.add(code);
    // ---- keyboard (its keys as remapped: settings.ts)
    const held = (id: ActionId) => actionKeys(id).some((c) => k.has(c));
    let mx = (held('right') ? 1 : 0) - (held('left') ? 1 : 0);
    let my = (held('accel') ? 1 : 0) - (held('brake') ? 1 : 0);
    let throttle = held('accel') ? 1 : 0;
    let brake = held('brake') ? 1 : 0;
    // Carving on the keys: the direction key digs in over a moment (KEY_DIG_FROM).
    if (!this.battle && brake > 0 && mx !== 0) {
      const now = performance.now();
      if (this.digDir !== mx) {
        this.digDir = mx;
        this.digAt = now;
      }
      mx *= Math.min(1, KEY_DIG_FROM + ((1 - KEY_DIG_FROM) * (now - this.digAt)) / (KEY_DIG_SECS * 1000));
    } else this.digDir = 0;
    let buttons = 0;
    for (const a of BUTTON_ACTIONS) if (held(a.id)) buttons |= a.bit;
    let cmd = k.has('Digit1') ? 1 : k.has('Digit2') ? 2 : k.has('Digit3') ? 3 : k.has('Digit4') ? 4 : 0;
    let camX = 0;
    let camY = 0;
    let lookBack = held('lookBack');

    // ---- gamepad
    const p = this.pad();
    if (p) {
      const b = (i: number) => (p.buttons[i] ? p.buttons[i].pressed : false);
      const v = (i: number) => (p.buttons[i] ? p.buttons[i].value : 0);
      let lx = p.axes[0] ?? 0;
      let ly = p.axes[1] ?? 0;
      const mag = Math.hypot(lx, ly);
      if (mag < 0.16) {
        lx = 0;
        ly = 0;
      } else {
        const g = Math.min(1, (mag - 0.16) / 0.8) / mag;
        lx *= g;
        ly *= g;
      }
      const rx = dead(p.axes[2] ?? 0, 0.2);
      const ry = dead(p.axes[3] ?? 0, 0.2);
      // Its buttons as remapped (settings.ts). A trigger's value is how far
      // it is pulled; a button's, all or nothing.
      const value = (id: ActionId) => {
        const i = padButton(id);
        return i === null ? 0 : v(i) || (b(i) ? 1 : 0);
      };
      const rt = value('accel');
      let lt = value('brake');
      let pb = 0;
      // Locked on there is nothing to brake or carve: the left trigger is the guard.
      if (this.battle && lt > 0.35) pb |= BTN.GUARD;
      if (this.battle) lt = 0;
      for (const a of BUTTON_ACTIONS) {
        const i = padButton(a.id);
        if (i !== null && b(i)) pb |= a.bit;
      }
      // Flick the right stick left or right to change target; hold it over
      // and it keeps stepping, a little under three targets a second.
      const flick = Math.abs(rx) > 0.6 ? Math.sign(rx) : 0;
      const now = performance.now();
      if (flick !== 0 && flick !== this.prevFlick) {
        this.flickHold = 3;
        this.flickNext = now + 450;
      } else if (flick !== 0 && now >= this.flickNext) {
        this.flickHold = 3;
        this.flickNext = now + 350;
      }
      if (this.flickHold > 0) {
        pb |= this.prevFlickDir(flick) > 0 ? BTN.TNEXT : BTN.TPREV;
        this.flickHold--;
      }
      this.prevFlick = flick;
      const pc = b(PAD.UP) ? 1 : b(PAD.RIGHT) ? 2 : b(PAD.DOWN) ? 3 : b(PAD.LEFT) ? 4 : 0;
      // Use the same dead zones for device selection and movement. A second,
      // larger threshold silently discarded gentle steering after key navigation.
      const active = lx !== 0 || ly !== 0 || rt > 0.1 || lt > 0.1 || pb !== 0 || pc !== 0 || rx !== 0 || ry !== 0 || b(PAD.START);
      if (active) this.touch('pad');
      if (this.device === 'pad') {
        mx = lx;
        my = -ly;
        throttle = rt;
        brake = lt;
        buttons = pb;
        cmd = pc;
        camX = rx;
        camY = ry;
        const lb = padButton('lookBack');
        lookBack = lb !== null && b(lb);
      }
      // Rebinding: the first button pressed is the binding (Start calls it off).
      const edge = (i: number) => b(i) && !this.prevPad[i];
      if (this.capturing) {
        for (let i = 0; i < p.buttons.length; i++) {
          if (!edge(i)) continue;
          const cb = this.capturing;
          this.capturing = null;
          this.touch('pad');
          cb(i === PAD.START ? { cancel: true } : { pad: i });
          break;
        }
        for (let i = 0; i < p.buttons.length; i++) this.prevPad[i] = b(i);
        this.prevStickX = Math.abs(lx) > 0.6 ? Math.sign(lx) : 0;
        this.prevStickY = Math.abs(ly) > 0.6 ? Math.sign(ly) : 0;
        this.tapped = new Set();
        return;
      }
      // Menu edges.
      const m = this.menu;
      const sx = Math.abs(lx) > 0.6 ? Math.sign(lx) : 0;
      const sy = Math.abs(ly) > 0.6 ? Math.sign(ly) : 0;
      if (edge(PAD.UP) || (sy < 0 && this.prevStickY >= 0)) m.push('up');
      if (edge(PAD.DOWN) || (sy > 0 && this.prevStickY <= 0)) m.push('down');
      if (edge(PAD.LEFT) || (sx < 0 && this.prevStickX >= 0)) m.push('left');
      if (edge(PAD.RIGHT) || (sx > 0 && this.prevStickX <= 0)) m.push('right');
      if (edge(PAD.A)) m.push('confirm');
      if (edge(PAD.B)) m.push('back');
      if (edge(PAD.START)) m.push('pause');
      if (edge(PAD.X)) m.push('x');
      if (edge(PAD.Y)) m.push('y');
      if (edge(PAD.LB)) m.push('lb');
      if (edge(PAD.RB)) m.push('rb');
      if (edge(PAD.RS)) m.push('track');
      if (edge(PAD.BACK)) m.push('tune');
      this.prevStickX = sx;
      this.prevStickY = sy;
      for (let i = 0; i < p.buttons.length; i++) this.prevPad[i] = b(i);
    }

    // ---- the screen
    if (this.device === 'touch' && this.touchPad) {
      const t = this.touchPad.read();
      mx = t.mx;
      my = t.my;
      throttle = t.throttle;
      brake = t.brake;
      buttons = t.buttons;
      cmd = t.cmd;
      camX = 0;
      camY = 0;
      lookBack = false;
    }

    // Locked on, the keys and the touch screen hold full pace (the throttle is
    // the pace a lock carries you at); pushing toward a target behind eases off.
    if (this.battle && this.device !== 'pad') throttle = 1 - Math.max(0, my) * this.battleBehind;

    // Hold or toggle (Settings, Accessibility). The guard: a press raises
    // it, the next lowers it. The carve: a press with the stick over starts
    // it and holds it on (while the race says it is carving), the next lets
    // it go; a press with the stick near the middle still brakes, held.
    if (settings.toggleGuard) {
      const guardHeld = (buttons & BTN.GUARD) !== 0;
      if (guardHeld && !this.prevGuardHeld) this.guardOn = !this.guardOn;
      this.prevGuardHeld = guardHeld;
      buttons = this.guardOn ? buttons | BTN.GUARD : buttons & ~BTN.GUARD;
    } else this.guardOn = false;
    if (settings.toggleCarve && !this.battle) {
      const brakeHeld = brake > 0.5;
      if (brakeHeld && !this.prevBrakeHeld) {
        if (this.carveOn) this.carveOn = false;
        else if (Math.abs(mx) >= CARVE_MIN_STEER) {
          this.carveOn = true;
          this.carveOnFor = 0;
        }
      }
      this.prevBrakeHeld = brakeHeld;
      if (this.carveOn) {
        // (It has a moment to start; once the race says it is not carving, it is off.)
        this.carveOnFor++;
        if (!this.carving && this.carveOnFor > 12) this.carveOn = false;
        else brake = 1;
      }
    } else this.carveOn = false;
    // The look turned round (Settings, Camera).
    if (settings.invertX) camX = -camX;
    if (settings.invertY) camY = -camY;

    this.tapped = new Set();
    // A button still held from closing a menu is not a press in the race.
    this.swallow &= buttons;
    buttons &= ~this.swallow;
    s.mx = mx;
    s.my = my;
    s.throttle = throttle;
    s.brake = brake;
    s.buttons = buttons;
    s.cmd = cmd;
    this.camX = camX;
    this.camY = camY;
    this.lookBack = lookBack;
  }

  private lastFlickDir = 1;
  private prevFlickDir(flick: number): number {
    if (flick !== 0) this.lastFlickDir = flick;
    return this.lastFlickDir;
  }

  /**
   * Call when a menu closes and play resumes. Whatever is held at that moment
   * (the button that picked "Resume", say) is ignored until it is released,
   * so it cannot fire a boost, a dash or an ability.
   */
  swallowHeld(): void {
    this.poll();
    this.swallow = this.state.buttons | this.swallow;
    this.state.buttons = 0;
    this.menu = [];
  }

  /** Menu presses since the last call, oldest first. */
  consumeMenu(): MenuInput[] {
    const m = this.menu;
    this.menu = [];
    return m;
  }

  /** Scales every rumble. Set from the tuning panel. */
  rumbleScale = 1;
  /**
   * The player's mech is locked on and fighting: the pad's left trigger then
   * raises the guard (as RB does) instead of braking. Set by the game each frame.
   */
  battle = false;
  /** The player's mech is carving (for a toggled carve: see poll). Set by the game each frame. */
  carving = false;

  /**
   * Rebinding: the next key or gamepad button pressed goes to `cb` instead
   * of the game (Esc or Start calls it off). Only one at a time.
   */
  capture(cb: (c: Captured) => void): void {
    this.capturing = cb;
    // (What is already held is not the answer: only a fresh press.)
    const p = this.pad();
    if (p) for (let i = 0; i < p.buttons.length; i++) this.prevPad[i] = !!p.buttons[i]?.pressed;
  }

  /** Called off from outside (the screen closed). */
  cancelCapture(): void {
    this.capturing = null;
  }

  /** Whether a rebinding is waiting for its press. */
  get capturingNow(): boolean {
    return this.capturing !== null;
  }

  /** The toggled guard and carve let go (a new race, a menu). */
  resetToggles(): void {
    this.guardOn = false;
    this.carveOn = false;
  }
  /**
   * Locked on, how far behind the mech its target is: 0 ahead or abreast, 1
   * dead astern. Set by the game each frame. The keys and the touch screen
   * have no trigger to ease off with, so pushing toward a target behind
   * eases off for them, by as much as it is behind.
   */
  battleBehind = 0;
  /** Until when (performance.now) a hit's rumble should not be overwritten by the road's. */
  private rumbleBusyUntil = 0;

  /** Rumble the pad if it can. Strength 0..1. */
  /** No rumble at all for now (a replay is being watched). */
  rumbleMuted = false;

  rumble(strength: number, ms: number): void {
    if (this.rumbleMuted) return;
    this.rumbleBusyUntil = performance.now() + ms;
    this.pulse(Math.min(1, strength), Math.min(1, strength * 0.6), ms);
  }

  /** Low continuous rumble (road, strips, scraping). Gives way to a hit that is still playing. */
  rumbleRoad(strong: number, weak: number, ms: number): void {
    if (this.rumbleMuted) return;
    if (performance.now() < this.rumbleBusyUntil) return;
    this.pulse(strong, weak, ms);
  }

  private pulse(strong: number, weak: number, ms: number): void {
    if (this.device !== 'pad' || this.rumbleScale <= 0) return;
    const p = this.pad() as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: object) => Promise<unknown> } }) | null;
    const act = p?.vibrationActuator;
    if (act?.playEffect) {
      const k = this.rumbleScale;
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) }).catch(() => {});
    }
  }
}

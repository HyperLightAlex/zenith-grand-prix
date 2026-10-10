// Controller input. Gamepad first, keyboard as a full fallback. Produces the
// MechInput the simulation wants, plus menu navigation and camera controls.
import { BTN, emptyInput, type MechInput } from '../../sim/index';

/** One menu press. Presses are queued, so none are lost on a slow frame. */
export type MenuInput = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause' | 'tune';

const KEY_BUTTONS: Record<string, number> = {
  Space: BTN.A,
  KeyJ: BTN.X,
  KeyK: BTN.Y,
  KeyL: BTN.GUARD,
  ShiftLeft: BTN.GUARD,
  ShiftRight: BTN.GUARD,
  KeyQ: BTN.LOCK,
  Tab: BTN.LOCK,
  KeyE: BTN.ALLY,
  KeyR: BTN.ABILITY,
  KeyC: BTN.TNEXT,
  KeyZ: BTN.TPREV,
};

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
  device: 'pad' | 'keys' = 'keys';
  padName = '';
  private keys = new Set<string>();
  /** Keys pressed since the last poll, so a tap shorter than a frame still counts. */
  private tapped = new Set<string>();
  private prevPad: boolean[] = [];
  private prevStickX = 0;
  private prevStickY = 0;
  private prevFlick = 0;
  private flickHold = 0;
  /** Buttons that were down when a menu closed: ignored until they are let go. */
  private swallow = 0;
  onDeviceChange: (d: 'pad' | 'keys') => void = () => {};
  /** Called on the first key, click or button: browsers need a gesture before audio. */
  onFirstGesture: () => void = () => {};
  private gestured = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
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
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', () => this.gesture());
    window.addEventListener('gamepadconnected', (e) => {
      this.padName = e.gamepad.id;
      this.touch('pad');
    });
  }

  /** Full screen on and off. Some embedded views refuse it; that is fine. */
  private toggleFullscreen(): void {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen().catch(() => {});
    } catch {
      /* not available here */
    }
  }

  private gesture(): void {
    if (this.gestured) return;
    this.gestured = true;
    this.onFirstGesture();
  }

  private touch(d: 'pad' | 'keys'): void {
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
    // ---- keyboard
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let throttle = my > 0 ? 1 : 0;
    let brake = my < 0 ? 1 : 0;
    let buttons = 0;
    for (const code in KEY_BUTTONS) if (k.has(code)) buttons |= KEY_BUTTONS[code];
    let cmd = k.has('Digit1') ? 1 : k.has('Digit2') ? 2 : k.has('Digit3') ? 3 : k.has('Digit4') ? 4 : 0;
    let camX = 0;
    let camY = 0;
    let lookBack = k.has('KeyV');

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
      const rt = v(PAD.RT);
      const lt = v(PAD.LT);
      let pb = 0;
      if (b(PAD.A)) pb |= BTN.A;
      if (b(PAD.X)) pb |= BTN.X;
      if (b(PAD.Y)) pb |= BTN.Y;
      if (b(PAD.RB)) pb |= BTN.GUARD;
      if (b(PAD.LB)) pb |= BTN.LOCK;
      if (b(PAD.B)) pb |= BTN.ABILITY;
      if (b(PAD.LS)) pb |= BTN.ALLY;
      // Flick the right stick to change target.
      const flick = Math.abs(rx) > 0.7 ? Math.sign(rx) : 0;
      if (flick !== 0 && flick !== this.prevFlick) this.flickHold = 3;
      if (this.flickHold > 0) {
        pb |= this.prevFlickDir(flick) > 0 ? BTN.TNEXT : BTN.TPREV;
        this.flickHold--;
      }
      this.prevFlick = flick;
      const pc = b(PAD.UP) ? 1 : b(PAD.RIGHT) ? 2 : b(PAD.DOWN) ? 3 : b(PAD.LEFT) ? 4 : 0;
      const active = mag > 0.3 || rt > 0.1 || lt > 0.1 || pb !== 0 || pc !== 0 || Math.abs(rx) > 0.3 || b(PAD.START);
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
        lookBack = b(PAD.RS);
      }
      // Menu edges.
      const m = this.menu;
      const edge = (i: number) => b(i) && !this.prevPad[i];
      const sx = Math.abs(lx) > 0.6 ? Math.sign(lx) : 0;
      const sy = Math.abs(ly) > 0.6 ? Math.sign(ly) : 0;
      if (edge(PAD.UP) || (sy < 0 && this.prevStickY >= 0)) m.push('up');
      if (edge(PAD.DOWN) || (sy > 0 && this.prevStickY <= 0)) m.push('down');
      if (edge(PAD.LEFT) || (sx < 0 && this.prevStickX >= 0)) m.push('left');
      if (edge(PAD.RIGHT) || (sx > 0 && this.prevStickX <= 0)) m.push('right');
      if (edge(PAD.A)) m.push('confirm');
      if (edge(PAD.B)) m.push('back');
      if (edge(PAD.START)) m.push('pause');
      if (edge(PAD.BACK)) m.push('tune');
      this.prevStickX = sx;
      this.prevStickY = sy;
      for (let i = 0; i < p.buttons.length; i++) this.prevPad[i] = b(i);
    }

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
  /** Until when (performance.now) a hit's rumble should not be overwritten by the road's. */
  private rumbleBusyUntil = 0;

  /** Rumble the pad if it can. Strength 0..1. */
  rumble(strength: number, ms: number): void {
    this.rumbleBusyUntil = performance.now() + ms;
    this.pulse(Math.min(1, strength), Math.min(1, strength * 0.6), ms);
  }

  /** Low continuous rumble (road, strips, scraping). Gives way to a hit that is still playing. */
  rumbleRoad(strong: number, weak: number, ms: number): void {
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

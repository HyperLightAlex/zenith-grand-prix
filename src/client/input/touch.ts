// Touch controls for phones and tablets: a stick wherever the left thumb lands,
// and a cluster of buttons under the right thumb that changes with what you
// are doing (racing, or locked on and fighting). The throttle is held for
// you once the race is on; Brake / Carve takes it off.
//
// The layer covers the whole window, not the picture's frame: with a 4:3
// picture on a wide phone the controls sit in the bars either side of it.
// It reports where it overlaps the frame (setReserved) so the HUD can keep
// clear of the thumbs.
//
// This only collects presses; Input.poll() turns them into the MechInput the
// simulation reads, exactly as it does for the pad and keys.

import { BTN, TACTIC } from '../../sim/index';
import { ICONS, type IconName } from '../ui/hudArt';
import { h, setClass, setText } from '../ui/dom';
import type { MenuInput } from './input';

/** What the cluster shows: free steering, locked on, or out of it (finished, retired: only the camera). */
export type TouchMode = 'race' | 'battle' | 'out';

interface Btn {
  el: HTMLElement;
  label: HTMLElement;
  ico: HTMLElement;
  /** What it presses while held (a BTN bit), or a special action. */
  bit: number;
  /** Brake / Carve: the trigger, not a button. */
  brake?: boolean;
  action?: () => void;
  /** Pointers holding it. */
  held: Set<number>;
}

/** Where each button goes: [mode, slot, label, bit, icon]. Slots are placed by layout(). */
type Slot = 'primary' | 'a1' | 'a2' | 'a3' | 'o1' | 'o2' | 'o3' | 'o4';

const PLAYS: Array<[number, string, IconName]> = [
  [TACTIC.BLITZ, 'Blitz', 'blitz'],
  [TACTIC.RUN, 'Run', 'run'],
  [TACTIC.SHIELD, 'Shield', 'shield'],
  [TACTIC.MARK, 'Mark', 'mark'],
];

function ico(name: IconName | null): HTMLElement {
  const el = h('i.tico');
  if (name) el.style.setProperty('--ico', `url(${ICONS[name]})`);
  return el;
}

export class TouchControls {
  readonly root = h('div.touchpad');
  /** Shown during a race while the last thing used was the screen. */
  private shown = false;
  mode: TouchMode = 'race';
  private builtMode: TouchMode | null = null;
  /** The countdown: the throttle is only held while the stick is (hold it as the lights go for a launch). */
  countdown = false;
  // The stick.
  private zone = h('div.tzone');
  private base = h('div.tbase');
  private knob = h('div.tknob');
  private stickId = -1;
  private ox = 0;
  private oy = 0;
  private sx = 0;
  private sy = 0;
  // The buttons.
  private cluster = h('div.tcluster');
  private buttons: Btn[] = [];
  private pauseBtn = h('div.tbtn.tsys.tpause', h('i.tbars'));
  private plays = h('div.tplays');
  private playsOpen = false;
  /** Bits pressed since the last read, so a tap shorter than a frame still counts. */
  private tapped = 0;
  private brakeTapped = false;
  /** A team play, sent for a few reads (the pad's D-pad is held for as many). */
  private cmd = 0;
  private cmdHold = 0;
  /** The ability button's name and whether it can be used now (set by the game each frame). */
  private abilityText = '';
  private abilityIcon: IconName | null = null;
  private abilityReady = false;
  private attackReady = false;
  private specialReady = true;
  /** Locked on a team-mate: the lock button reads "Fight" (it goes back to the rival last fought). */
  private escorting = false;
  /** No team (a Sprint): no Escort button and no team plays. */
  private solo = false;
  /** Button size, CSS pixels. */
  private u = 52;
  /** Something on the layer was touched: the input switches to touch. */
  onTouch: () => void = () => {};
  /** A menu press (Pause). */
  onMenu: (p: MenuInput) => void = () => {};
  /** The frame the picture fills, to say how far the controls reach into it. */
  frameRect: () => { x: number; y: number; w: number; h: number } = () => ({ x: 0, y: 0, w: innerWidth, h: innerHeight });

  constructor(parent: HTMLElement) {
    this.root.hidden = true;
    this.base.append(this.knob);
    this.root.append(this.zone, this.base, this.cluster, this.plays, this.pauseBtn);
    parent.append(this.root);
    // A long press is a held button, not the browser's menu.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => this.stickDown(e));
    z.addEventListener('pointermove', (e) => this.stickMove(e));
    const up = (e: PointerEvent) => this.stickUp(e);
    z.addEventListener('pointerup', up);
    z.addEventListener('pointercancel', up);
    z.addEventListener('lostpointercapture', up);
    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onTouch();
      this.closePlays();
      this.onMenu('pause');
    });
    for (const [tac, name, icon] of PLAYS) {
      const el = h('div.tbtn.tplay', ico(icon), h('span', name));
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onTouch();
        this.cmd = tac;
        this.cmdHold = 4;
        this.closePlays();
      });
      this.plays.append(el);
    }
    this.plays.hidden = true;
    window.addEventListener('resize', () => this.layout());
  }

  /** Show the layer (a race, played by touch) or hide it, letting go of everything. */
  show(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.hidden = !on;
    if (!on) {
      this.release();
      const root = document.documentElement.style;
      for (const v of ['--tc-br-w', '--tc-br-h', '--tc-tr']) root.setProperty(v, '0px');
    } else this.layout();
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Let go of everything (a menu opened, the layer hid). */
  release(): void {
    this.stickId = -1;
    this.sx = this.sy = 0;
    setClass(this.base, 'on', false);
    for (const b of this.buttons) {
      b.held.clear();
      setClass(b.el, 'held', false);
    }
    this.tapped = 0;
    this.brakeTapped = false;
    this.closePlays();
  }

  /** What the ability button says, and which buttons are live, for this frame. */
  setState(mode: TouchMode, ability: { name: string; icon: IconName; ready: boolean }, attackReady: boolean, escorting = false, specialReady = true, solo = false): void {
    const fresh = mode !== this.builtMode || solo !== this.solo;
    this.solo = solo;
    if (fresh) this.build(mode);
    this.mode = mode;
    if (fresh || escorting !== this.escorting) {
      const lock = mode === 'battle' ? this.buttons.find((x) => x.bit === BTN.LOCK) : null;
      if (lock) setText(lock.label, escorting ? 'Fight' : 'Let go');
    }
    this.escorting = escorting;
    const ab = this.buttons.find((x) => x.bit === BTN.ABILITY);
    if (ab && (fresh || ability.name !== this.abilityText || ability.icon !== this.abilityIcon)) {
      setText(ab.label, ability.name);
      ab.ico.style.setProperty('--ico', `url(${ICONS[ability.icon]})`);
      ab.el.classList.remove('noico');
    }
    this.abilityText = ability.name;
    this.abilityIcon = ability.icon;
    if (ab && (fresh || ability.ready !== this.abilityReady)) setClass(ab.el, 'dim', !ability.ready);
    this.abilityReady = ability.ready;
    const atk = this.buttons.find((x) => x.bit === BTN.X);
    if (atk && (fresh || attackReady !== this.attackReady)) setClass(atk.el, 'dim', mode === 'race' && !attackReady);
    this.attackReady = attackReady;
    // The special, dimmed while it recharges.
    const sp = this.buttons.find((x) => x.bit === BTN.Y);
    if (sp && (fresh || specialReady !== this.specialReady)) setClass(sp.el, 'dim', !specialReady);
    this.specialReady = specialReady;
  }

  /** The buttons for a mode. */
  private build(mode: TouchMode): void {
    this.builtMode = mode;
    for (const b of this.buttons) b.held.clear();
    this.buttons = [];
    this.cluster.replaceChildren();
    const add = (slot: Slot, label: string, bit: number, icon: IconName | null, opts: { brake?: boolean; action?: () => void } = {}) => {
      const lab = h('span', label);
      const ic = ico(icon);
      const el = h('div.tbtn.' + slot + (slot === 'primary' ? '.big' : slot.startsWith('o') ? '.small' : ''), ic, lab);
      if (!icon) el.classList.add('noico');
      const b: Btn = { el, label: lab, ico: ic, bit, brake: opts.brake, action: opts.action, held: new Set() };
      el.addEventListener('pointerdown', (e) => this.btnDown(b, e));
      const up = (e: PointerEvent) => this.btnUp(b, e);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      this.buttons.push(b);
      this.cluster.append(el);
    };
    const team = () => (this.playsOpen ? this.closePlays() : this.openPlays());
    if (mode === 'race') {
      add('primary', 'Boost', BTN.A, null);
      add('a1', 'Carve', 0, null, { brake: true });
      add('a2', 'Lock on', BTN.LOCK, 'lockedOn');
      add('a3', this.abilityText || 'Ability', BTN.ABILITY, this.abilityIcon);
      add('o1', 'Attack', BTN.X, null);
      if (!this.solo) {
        add('o2', 'Escort', BTN.ALLY, 'escorting');
        add('o3', 'Team', 0, 'blitz', { action: team });
      }
    } else if (mode === 'battle') {
      add('primary', 'Attack', BTN.X, null);
      add('a1', 'Guard', BTN.GUARD, 'guard');
      add('a2', 'Special', BTN.Y, null);
      add('a3', 'Dash', BTN.A, null);
      add('o1', this.abilityText || 'Ability', BTN.ABILITY, this.abilityIcon);
      add('o2', 'Switch', BTN.TNEXT, null);
      add('o3', 'Let go', BTN.LOCK, null);
      if (!this.solo) add('o4', 'Team', 0, 'blitz', { action: team });
    } else {
      // Out of the race: the lock button changes whose camera you ride; plays still go out.
      add('primary', 'Next camera', BTN.LOCK, null);
      if (!this.solo) add('o3', 'Team', 0, 'blitz', { action: team });
    }
    this.layout();
  }

  private openPlays(): void {
    this.playsOpen = true;
    this.plays.hidden = false;
    this.layout();
  }

  private closePlays(): void {
    this.playsOpen = false;
    this.plays.hidden = true;
  }

  private btnDown(b: Btn, e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.onTouch();
    try {
      b.el.setPointerCapture(e.pointerId);
    } catch {
      /* already gone */
    }
    if (b.action) {
      b.action();
      return;
    }
    if (this.playsOpen) this.closePlays();
    b.held.add(e.pointerId);
    setClass(b.el, 'held', true);
    if (b.brake) this.brakeTapped = true;
    else this.tapped |= b.bit;
  }

  private btnUp(b: Btn, e: PointerEvent): void {
    if (!b.held.delete(e.pointerId)) return;
    setClass(b.el, 'held', b.held.size > 0);
  }

  // ---- the stick -----------------------------------------------------------

  private stickDown(e: PointerEvent): void {
    if (this.stickId >= 0) return;
    e.preventDefault();
    this.onTouch();
    this.closePlays();
    this.stickId = e.pointerId;
    try {
      this.zone.setPointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
    // The stick's centre is where the thumb lands, kept far enough in that the whole base shows.
    const r = this.radius();
    this.ox = Math.max(r + 6, Math.min(innerWidth - r - 6, e.clientX));
    this.oy = Math.max(r + 6, Math.min(innerHeight - r - 6, e.clientY));
    this.sx = this.sy = 0;
    this.base.style.left = `${this.ox}px`;
    this.base.style.top = `${this.oy}px`;
    setClass(this.base, 'on', true);
    this.stickMove(e);
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    const r = this.radius();
    let dx = (e.clientX - this.ox) / r;
    let dy = (e.clientY - this.oy) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.sx = dx;
    this.sy = dy;
    this.knob.style.transform = `translate(${(dx * r).toFixed(1)}px, ${(dy * r).toFixed(1)}px)`;
  }

  private stickUp(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = -1;
    this.sx = this.sy = 0;
    this.knob.style.transform = '';
    setClass(this.base, 'on', false);
    this.base.style.left = '';
    this.base.style.top = '';
  }

  private radius(): number {
    return this.u * 1.15;
  }

  // ---- reading ---------------------------------------------------------------

  /** The controls as they stand: steering, throttle, brake, buttons and any team play. */
  read(): { mx: number; my: number; throttle: number; brake: number; buttons: number; cmd: number } {
    // A little dead zone in the middle, then straight through.
    const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.08)) / 0.92);
    const mx = dz(this.sx);
    const my = -dz(this.sy);
    let buttons = this.tapped;
    let braking = this.brakeTapped;
    for (const b of this.buttons) {
      if (!b.held.size) continue;
      if (b.brake) braking = true;
      else buttons |= b.bit;
    }
    this.tapped = 0;
    this.brakeTapped = false;
    let cmd = 0;
    if (this.cmdHold > 0) {
      cmd = this.cmd;
      this.cmdHold--;
    }
    const steering = this.stickId >= 0;
    // The throttle is held for you once the race is on (the countdown: only while the stick is).
    const throttle = braking ? 0 : this.countdown ? (steering ? 1 : 0) : 1;
    return { mx, my, throttle, brake: braking ? 1 : 0, buttons, cmd };
  }

  // ---- layout ------------------------------------------------------------------

  /** Size and place everything for the window, and tell the frame what the controls cover. */
  layout(): void {
    if (typeof innerWidth !== 'number') return;
    const W = innerWidth;
    const H = innerHeight;
    const s = this.root.style;
    const u = Math.round(Math.max(46, Math.min(66, Math.min(W, H) * 0.105)));
    this.u = u;
    s.setProperty('--u', `${u}px`);
    // Offsets of each slot's centre from the primary's, in u (y down).
    const P = 1.45;
    const ring = (deg: number, r: number) => [Math.cos((deg * Math.PI) / 180) * r, -Math.sin((deg * Math.PI) / 180) * r];
    const slots: Record<Slot, number[]> = {
      primary: [0, 0],
      a1: ring(180, 1.5),
      a2: ring(135, 1.5),
      a3: ring(90, 1.5),
      o1: ring(176, 2.68),
      o2: ring(146, 2.68),
      o3: ring(116, 2.68),
      o4: ring(86, 2.68),
    };
    // The primary's centre, from the bottom right corner (inside any notch).
    const cx = 0.42 * u + (P * u) / 2;
    const cy = 0.38 * u + (P * u) / 2;
    for (const b of this.buttons) {
      const slot = (Object.keys(slots) as Slot[]).find((k) => b.el.classList.contains(k)) ?? 'primary';
      const [dx, dy] = slots[slot];
      // dy is down the screen; bottom counts up from the edge.
      b.el.style.right = `${(cx - dx * u).toFixed(1)}px`;
      b.el.style.bottom = `${(cy - dy * u).toFixed(1)}px`;
    }
    // The cluster's reach: from the corner to the far side of its farthest button.
    let reachX = 0;
    let reachY = 0;
    for (const b of this.buttons) {
      const r = (b.el.classList.contains('big') ? P : b.el.classList.contains('small') ? 0.74 : 0.98) * 0.5 * u;
      reachX = Math.max(reachX, parseFloat(b.el.style.right) + r);
      reachY = Math.max(reachY, parseFloat(b.el.style.bottom) + r);
    }
    // Team plays fan out above the cluster.
    this.plays.style.right = `${(0.3 * u).toFixed(0)}px`;
    this.plays.style.bottom = `${(reachY + 0.25 * u).toFixed(0)}px`;
    // What the controls cover inside the frame, for the HUD to keep clear of.
    const f = this.frameRect();
    const frameRight = W - (f.x + f.w);
    const root = document.documentElement.style;
    root.setProperty('--tc-br-w', `${Math.max(0, reachX - frameRight).toFixed(0)}px`);
    root.setProperty('--tc-br-h', `${Math.max(0, reachY - (H - (f.y + f.h))).toFixed(0)}px`);
    const pauseReach = 0.3 * u + 0.8 * u;
    root.setProperty('--tc-tr', `${Math.max(0, pauseReach - frameRight).toFixed(0)}px`);
  }
}

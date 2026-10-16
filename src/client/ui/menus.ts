// Menus: a stack of screens, worked by the same MenuInput from pad or
// keyboard, and by mouse (hover moves the highlight, a click confirms).
//
// Every screen has Back (B, or Esc) to the one before; a screen's own
// actions are on X and Y, and LB and RB move between its panels. The bottom
// of each screen names its actions with the glyphs of the device last used.
// Coming back to a screen puts the highlight where it was left.
//
// The screens themselves are in ./screens/: each is a render function plus
// what it does with X, Y, LB, RB and Back. This file is only the machinery.

import type { MatchConfig, Role } from '../../sim/index';
import type { MenuInput } from '../input/input';
import { h, setClass } from './dom';

export type ScreenId =
  | 'title'
  | 'modes'
  | 'hangar'
  | 'setup'
  | 'gp'
  | 'briefing'
  | 'standings'
  | 'award'
  | 'online'
  | 'room'
  | 'entry'
  | 'dialog'
  | 'controls'
  | 'video'
  | 'pause'
  | 'results';

/** The old single-screen names, still used by tools that drive the game: 'garage' is the hangar. */
export type Screen = ScreenId | 'garage' | null;
type Device = 'pad' | 'keys';

export interface GarageChoice {
  role: Role;
  /** Your faction (an index into LIVERIES). */
  team: number;
  /** The rival faction, or -1 for one drawn at random at the start of each match. */
  rival: number;
  /** 0 rookie, 1 pro, 2 ace. */
  rivals: number;
  /** Index into MATCH_OPTIONS. */
  match: number;
  /** Circuit id. */
  track: string;
}

/** What the setup screens say about each circuit. */
export const TRACK_BLURBS: Record<string, string> = {
  meridian: 'The original. An elevated loop over the sea at golden hour: sweepers, a hairpin and long straights.',
  canyon: 'Built for fighting. The Narrows, a corkscrew, a bowl you can take flat out, a fork whose routes cross, and a sky bridge with no barriers.',
  helios: 'Built for speed and air, above the clouds. The Drop, a full loop, the Carousel, and Split Decision: a jump or the safe way round.',
};

/** The match formats on offer. A single race is a series of one. */
export const MATCH_OPTIONS: Array<{ label: string; blurb: string; cfg: MatchConfig }> = [
  { label: 'Single race', blurb: 'One race. Most points wins.', cfg: { mode: 'series', bestOf: 1, target: 50 } },
  { label: 'Series, best of 3', blurb: 'Win two rounds. A round level on points goes to whoever came home first.', cfg: { mode: 'series', bestOf: 3, target: 50 } },
  { label: 'Series, best of 5', blurb: 'Win three rounds. A round level on points goes to whoever came home first.', cfg: { mode: 'series', bestOf: 5, target: 50 } },
  { label: 'Points race to 50', blurb: 'Points carry over. First team to 50 at the end of a round wins.', cfg: { mode: 'points', bestOf: 3, target: 50 } },
  { label: 'Points race to 80', blurb: 'Points carry over. First team to 80 at the end of a round wins.', cfg: { mode: 'points', bestOf: 3, target: 80 } },
];

export const RIVALS = ['Rookie', 'Pro', 'Ace'];

/** A prompt on the bottom bar: the button, what it does, and what a click on it presses. */
export interface Prompt {
  pad: string;
  keys: string;
  label: string;
  press?: MenuInput;
}

export interface ItemOpts {
  /** A stable name, so the highlight stays on this item when the screen is drawn again. */
  key?: string;
  /** Shown but fixed by the mode: pressing it says why. */
  locked?: string | null;
}

interface Item {
  el: HTMLElement;
  key: string;
  activate?: () => void;
  change?: (dir: number) => void;
  locked?: string | null;
}

export interface ScreenDef<D = unknown> {
  render(m: Menus, data: D): void;
  /** X, Y, LB, RB (and anything else not handled by the list). Return true when handled. */
  press?(m: Menus, key: MenuInput, data: D): boolean;
  /** B. Default: back to the screen before. */
  back?(m: Menus, data: D): void;
  /** The list goes left and right instead of up and down. */
  horizontal?: boolean;
  /** The item highlighted when the screen first opens (by key). */
  initialFocus?: string;
  /** The highlight moved to the item with this key (to describe it, say). */
  selected?(m: Menus, key: string, data: D): void;
}

interface Entry {
  id: ScreenId;
  data: unknown;
  sel: number;
  key: string;
}

export interface MenuHost {
  sound(name: 'ui_move' | 'ui_select' | 'ui_back'): void;
  lookOn(): boolean;
  /** The screen on top changed (or the menus closed): the scene behind follows. */
  screenChanged(id: ScreenId | null): void;
}

export class Menus {
  readonly root = h('div.ui.menu');
  private readonly defs = new Map<ScreenId, ScreenDef<never>>();
  private stack: Entry[] = [];
  private items: Item[] = [];
  private sel = 0;
  device: Device = 'keys';
  private toastEl = h('div.toast');
  private toastTimer = 0;

  constructor(
    parent: HTMLElement,
    private host: MenuHost,
  ) {
    this.root.hidden = true;
    parent.append(this.root);
  }

  register<D>(id: ScreenId, def: ScreenDef<D>): void {
    this.defs.set(id, def as ScreenDef<never>);
  }

  /** The screen on top, or null when no menu is up. */
  get screen(): ScreenId | null {
    return this.stack.length ? this.stack[this.stack.length - 1].id : null;
  }

  get data(): unknown {
    return this.stack.length ? this.stack[this.stack.length - 1].data : undefined;
  }

  /** Whether a screen is anywhere in the stack. */
  has(id: ScreenId): boolean {
    return this.stack.some((e) => e.id === id);
  }

  setDevice(d: Device): void {
    if (this.device === d) return;
    this.device = d;
    if (this.screen) this.refresh();
  }

  private saveSel(): void {
    const top = this.stack[this.stack.length - 1];
    if (top) {
      top.sel = this.sel;
      top.key = this.items[this.sel]?.key ?? '';
    }
  }

  /** A screen on top of the current one. */
  push<D>(id: ScreenId, data?: D): void {
    this.saveSel();
    this.stack.push({ id, data, sel: 0, key: '' });
    this.open();
  }

  /** Back to the screen before (or close the menus if there is none). */
  pop(): void {
    this.stack.pop();
    this.open();
  }

  /** Take the screen opened with this data out of the stack, wherever it is (a request that was withdrawn). */
  remove(data: unknown): boolean {
    const i = this.stack.findIndex((e) => e.data === data);
    if (i < 0) return false;
    const top = i === this.stack.length - 1;
    this.stack.splice(i, 1);
    if (top) this.open();
    return true;
  }

  /** Back down to a screen in the stack (it stays); false if it is not there. */
  popTo(id: ScreenId): boolean {
    const i = this.stack.map((e) => e.id).lastIndexOf(id);
    if (i < 0) return false;
    this.stack.length = i + 1;
    this.open();
    return true;
  }

  /** Swap the screen on top for another. */
  replace<D>(id: ScreenId, data?: D): void {
    this.stack.pop();
    this.stack.push({ id, data, sel: 0, key: '' });
    this.open();
  }

  /** A fresh stack: this screen and the ones given beneath it (for Back to go through). */
  reset<D>(id: ScreenId | null, data?: D, under: Array<ScreenId | { id: ScreenId; data: unknown }> = []): void {
    this.stack = under.map((u) => (typeof u === 'string' ? { id: u, data: undefined, sel: 0, key: '' } : { id: u.id, data: u.data, sel: 0, key: '' }));
    if (id) this.stack.push({ id, data, sel: 0, key: '' });
    this.open();
  }

  /** The old one-screen call: a fresh stack with this screen alone (null closes the menus). */
  show(screen: Screen): void {
    this.reset(screen === 'garage' ? 'hangar' : screen);
  }

  private open(): void {
    const top = this.stack[this.stack.length - 1];
    this.root.hidden = !top;
    this.sel = top?.sel ?? 0;
    this.host.screenChanged(top?.id ?? null);
    if (top) this.render(top);
    else this.root.replaceChildren();
  }

  /** Draw the screen on top again (its data changed), keeping the highlight. */
  refresh(): void {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    this.saveSel();
    this.render(top);
  }

  private render(top: Entry): void {
    const def = this.defs.get(top.id);
    const R = this.root;
    R.replaceChildren();
    R.onclick = null;
    // The styles lay each screen out by name.
    R.dataset.screen = top.id === 'hangar' ? 'garage' : top.id;
    setClass(R, 'anime', this.host.lookOn());
    this.items = [];
    def?.render(this, top.data as never);
    R.append(this.toastEl);
    // Keep the highlight on the same item when it is still there.
    const byKey = top.key ? this.items.findIndex((it) => it.key === top.key) : def?.initialFocus ? this.items.findIndex((it) => it.key === def.initialFocus) : -1;
    const i = byKey >= 0 ? byKey : Math.min(top.sel, this.items.length - 1);
    if (this.items.length) this.select(Math.max(0, i), false);
  }

  // ---- building blocks ---------------------------------------------------------

  /** A button glyph for the current device. */
  key(pad: string, keys: string): HTMLElement {
    return h('span.key', this.device === 'pad' ? pad : keys);
  }

  /** The prompts bar. Each prompt is also a button. */
  footer(...prompts: Prompt[]): HTMLElement {
    const bar = h('div.footer-hints');
    for (const p of prompts) {
      const el = h('span.prompt', this.key(p.pad, p.keys), p.label);
      if (p.press) {
        el.classList.add('clickable');
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handle([p.press!]);
        });
      }
      bar.append(el);
    }
    return bar;
  }

  addItem(list: HTMLElement, el: HTMLElement, activate?: () => void, change?: (dir: number) => void, opts: ItemOpts = {}): HTMLElement {
    const index = this.items.length;
    if (opts.locked) el.classList.add('locked');
    this.items.push({ el, key: opts.key ?? `#${index}`, activate, change, locked: opts.locked });
    el.addEventListener('pointerenter', () => this.select(index, false));
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.select(index, false);
      this.activate(index);
    });
    list.append(el);
    return el;
  }

  /** An item that is a label and a value, changed with left and right. */
  choice(list: HTMLElement, label: string, value: string, change: (dir: number) => void, opts: ItemOpts = {}): HTMLElement {
    return this.addItem(list, h('div.item', h('span', label), h('span.choice', value)), undefined, change, opts);
  }

  /** An item that does something. */
  button(list: HTMLElement, label: string | HTMLElement, activate: () => void, opts: ItemOpts & { go?: boolean; note?: string } = {}): HTMLElement {
    const el = h('div.item' + (opts.go ? '.go' : ''), typeof label === 'string' ? h('span', label) : label, opts.note ? h('small', opts.note) : null);
    return this.addItem(list, el, activate, undefined, opts);
  }

  /**
   * Confirm (or a click) on an item: what it does, or for a plain choice, its
   * next value. An item with both (a room's seat: pick it, or left and right
   * to look across at the other team) is picked.
   */
  private activate(index: number): void {
    const it = this.items[index];
    if (!it) return;
    if (it.locked) {
      this.host.sound('ui_back');
      this.toast(it.locked);
      return;
    }
    if (it.activate) {
      this.host.sound('ui_select');
      it.activate();
    } else if (it.change) {
      it.change(1);
      this.host.sound('ui_move');
    }
  }

  /** Left or right on an item that changes. */
  private nudge(index: number, dir: number): void {
    const it = this.items[index];
    if (!it?.change) return;
    // A locked choice says why; left and right on a seat only move the highlight, so they always work.
    if (it.locked && !it.activate) {
      this.host.sound('ui_back');
      this.toast(it.locked);
      return;
    }
    it.change(dir);
    this.host.sound('ui_move');
  }

  select(i: number, sound = true): void {
    if (!this.items.length) return;
    this.sel = (i + this.items.length) % this.items.length;
    this.items.forEach((it, k) => setClass(it.el, 'sel', k === this.sel));
    const top = this.stack[this.stack.length - 1];
    if (top) {
      top.sel = this.sel;
      top.key = this.items[this.sel]?.key ?? '';
      this.defs.get(top.id)?.selected?.(this, top.key, top.data as never);
    }
    this.items[this.sel]?.el.scrollIntoView?.({ block: 'nearest' });
    if (sound) this.host.sound('ui_move');
  }

  /** The highlighted item's key. */
  get selectedKey(): string {
    return this.items[this.sel]?.key ?? '';
  }

  /** Highlight the item with this key, if it is on screen. */
  focus(key: string): void {
    const i = this.items.findIndex((it) => it.key === key);
    if (i >= 0) this.select(i, false);
  }

  /** A short message at the bottom of the screen. */
  toast(text: string, seconds = 2.6): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), seconds * 1000);
  }

  /** The anime look shows by the root's class. */
  refreshLook(): void {
    setClass(this.root, 'anime', this.host.lookOn());
    this.root.querySelectorAll('.look-label').forEach((el) => (el.textContent = `Look: ${this.host.lookOn() ? '80s anime' : 'plain'}`));
  }

  /** Feed navigation presses, in the order they happened. */
  handle(presses: MenuInput[]): void {
    setClass(this.root, 'anime', this.host.lookOn());
    let backed = false;
    for (const p of presses) {
      const top = this.stack[this.stack.length - 1];
      if (!top) return;
      // Esc is both Back and Pause: once it has gone back a screen, it does not also resume.
      if (p === 'pause' && backed) continue;
      backed = p === 'back';
      const def = this.defs.get(top.id);
      const horizontal = !!def?.horizontal;
      if (p === 'confirm') this.activate(this.sel);
      else if (p === 'back') {
        this.host.sound('ui_back');
        if (def?.back) def.back(this, top.data as never);
        else this.pop();
      } else if (p === (horizontal ? 'left' : 'up')) this.select(this.sel - 1);
      else if (p === (horizontal ? 'right' : 'down')) this.select(this.sel + 1);
      else if (!horizontal && (p === 'left' || p === 'right')) {
        const it = this.items[this.sel];
        if (it?.change) this.nudge(this.sel, p === 'left' ? -1 : 1);
        else def?.press?.(this, p, top.data as never);
      } else def?.press?.(this, p, top.data as never);
    }
  }
}

/** A painted image, as an element. */
export function art(url: string, spec: string, alt: string): HTMLImageElement {
  const img = h<'img'>(spec);
  img.src = url;
  img.alt = alt;
  img.draggable = false;
  return img;
}

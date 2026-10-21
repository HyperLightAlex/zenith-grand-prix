// Menus: a stack of screens, worked by the same MenuInput from pad or
// keyboard, by mouse (hover moves the highlight, a click confirms), and by
// touch (a tap picks; the ‹ › of a choice step it; the bottom bar's prompts
// are buttons).
//
// What a screen shows goes in its panes (Menus.panes): on a big screen they
// are laid out as drawn, on a phone or handheld they become columns that
// scroll, and the highlight scrolls them to keep itself, and what is round
// it, in view (see styles.css, html.compact and html.portrait).
//
// Every screen has Back (B, or Esc) to the one before; a screen's own
// actions are on X and Y, and LB and RB move between its panels. The bottom
// of each screen names its actions with the glyphs of the device last used.
// Coming back to a screen puts the highlight where it was left.
//
// The screens themselves are in ./screens/: each is a render function plus
// what it does with X, Y, LB, RB and Back. This file is only the machinery.

import type { MatchConfig, Role } from '../../sim/index';
import type { Device, MenuInput } from '../input/input';
import { h, setClass } from './dom';

/** The screens on the hangar computer: styled as the hangar is (data-screen 'garage'). */
const HANGAR_COMPUTER = new Set<string>(['hangar', 'pilot', 'custom', 'custom-parts', 'custom-paint']);

export type ScreenId =
  | 'title'
  | 'modes'
  | 'hangar'
  | 'pilot'
  | 'custom'
  | 'custom-parts'
  | 'custom-paint'
  | 'setup'
  | 'gp'
  | 'briefing'
  | 'standings'
  | 'award'
  | 'online'
  | 'online-gp'
  | 'room'
  | 'entry'
  | 'dialog'
  | 'controls'
  | 'video'
  | 'pause'
  | 'results';

/** The old single-screen names, still used by tools that drive the game: 'garage' is the hangar. */
export type Screen = ScreenId | 'garage' | null;

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

/**
 * Things to pick by sight, laid out as a grid (the portraits, the paints). A
 * click or a tap on one picks it. On the pad or the keys, A on the item that
 * opens the grid takes the highlight into it: the arrows move it up, down and
 * across (each cell it lands on is put on, so the change shows as you go), A
 * keeps the cell and B puts back the one that was on.
 */
export interface Grid {
  cells: HTMLElement[];
  /** The cell that is on now (-1 for none). */
  on(): number;
  /** Put a cell on. */
  set(i: number): void;
}

/** The bottom bar while the highlight is in a grid. */
const GRID_PROMPTS: Prompt[] = [
  { pad: 'D-pad', keys: '← ↑ → ↓', label: 'Choose' },
  { pad: 'A', keys: 'Enter', label: 'Keep', press: 'confirm' },
  { pad: 'B', keys: 'Esc', label: 'Cancel', press: 'back' },
];

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
  /** The arrows move the highlight by where the items sit on screen, across and up and down (a keyboard's keys). */
  spatial?: boolean;
  /** The item highlighted when the screen first opens (by key). */
  initialFocus?: string;
  /** The highlight moved to the item with this key (to describe it, say). */
  selected?(m: Menus, key: string, data: D): void;
  /**
   * A screen that moves through stages by itself (a Grand Prix room: the
   * briefing, the standings, the award): the stage it is at, and the item to
   * highlight when it reaches a new one, so a press meant for the last stage
   * cannot land on whatever now sits where its button was.
   */
  stage?(m: Menus, data: D): { id: string; focus: string } | null;
}

interface Entry {
  id: ScreenId;
  data: unknown;
  sel: number;
  key: string;
  /** The stage last drawn (see ScreenDef.stage). */
  stage?: string;
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
  /** The bottom bar on screen, and what it says (a grid says something else while the highlight is in it). */
  private footerEl: HTMLElement | null = null;
  private footerPrompts: Prompt[] = [];
  /** The grid the highlight is in: its cell, and the one that was on when it went in. */
  private gridding: { grid: Grid; at: number; start: number } | null = null;

  constructor(
    parent: HTMLElement,
    private host: MenuHost,
  ) {
    this.root.hidden = true;
    parent.append(this.root);
    // A click anywhere but a cell takes the highlight out of a grid, keeping what is on.
    this.root.addEventListener('click', () => this.leaveGrid());
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

  /** The top screen that is none of `over` (the dialogs and pages that open over others), or null. */
  under(over: ReadonlySet<ScreenId>): ScreenId | null {
    for (let i = this.stack.length - 1; i >= 0; i--) if (!over.has(this.stack[i].id)) return this.stack[i].id;
    return null;
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
    this.render(top, true);
  }

  /** `again`: the screen was already up, so its panels do not switch on again (the anime look's CRT). */
  private render(top: Entry, again = false): void {
    const def = this.defs.get(top.id);
    const R = this.root;
    R.replaceChildren();
    R.onclick = null;
    this.gridding = null;
    setClass(R, 'gridding', false);
    this.footerEl = null;
    // The styles lay each screen out by name.
    // The Pilot screen and the custom mech editor are the hangar computer's, styled as the hangar is.
    R.dataset.screen = HANGAR_COMPUTER.has(top.id) ? 'garage' : top.id;
    setClass(R, 'anime', this.host.lookOn());
    setClass(R, 'still', again);
    this.items = [];
    def?.render(this, top.data as never);
    R.append(this.toastEl);
    // A new stage: its own item. Otherwise keep the highlight on the same item when it is still there.
    const stage = def?.stage?.(this, top.data as never) ?? null;
    if (stage && stage.id !== top.stage) {
      // (Reached once its item is there: the room may be drawn before it knows you.)
      const at = this.items.findIndex((it) => it.key === stage.focus);
      if (at >= 0) {
        top.stage = stage.id;
        // A new stage is a new page: it switches on.
        setClass(R, 'still', false);
        return this.select(at, false);
      }
    }
    const byKey = top.key ? this.items.findIndex((it) => it.key === top.key) : def?.initialFocus ? this.items.findIndex((it) => it.key === def.initialFocus) : -1;
    const i = byKey >= 0 ? byKey : Math.min(top.sel, this.items.length - 1);
    if (this.items.length) this.select(this.shownFrom(Math.max(0, i), 1), false);
  }

  /** The first item from `i` on (going `dir`) that is showing: `i` itself if none is. */
  private shownFrom(i: number, dir: number): number {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const j = (((i + dir * k) % n) + n) % n;
      if (!this.items[j].el.hidden) return j;
    }
    return i;
  }

  // ---- building blocks ---------------------------------------------------------

  /** A button glyph for the current device (none on touch: the screen is the button). */
  key(pad: string, keys: string): HTMLElement {
    const el = h('span.key', this.device === 'pad' ? pad : keys);
    if (this.device === 'touch' || (this.device === 'keys' && !keys)) el.hidden = true;
    return el;
  }

  /**
   * What a screen shows, as panes: laid out as drawn on a big screen; on a
   * small one, columns that scroll with the highlight (or one column, upright).
   */
  panes(...children: Array<HTMLElement | string | null | undefined>): HTMLElement {
    const el = h('div.panes', ...children);
    el.dataset.scroll = '';
    return el;
  }

  /**
   * The prompts bar. Each prompt with a press is also a button; on touch only
   * those show (Select is a tap on the item, Change a tap on its arrows).
   */
  footer(...prompts: Prompt[]): HTMLElement {
    const bar = h('div.footer-hints');
    this.footerEl = bar;
    this.footerPrompts = prompts;
    this.fillFooter(bar, prompts);
    return bar;
  }

  private fillFooter(bar: HTMLElement, prompts: Prompt[]): void {
    bar.replaceChildren();
    for (const p of prompts) {
      if (this.device === 'touch' && (!p.press || p.press === 'confirm')) continue;
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
  }

  addItem(list: HTMLElement, el: HTMLElement, activate?: () => void, change?: (dir: number) => void, opts: ItemOpts = {}): HTMLElement {
    const index = this.items.length;
    if (opts.locked) el.classList.add('locked');
    this.items.push({ el, key: opts.key ?? `#${index}`, activate, change, locked: opts.locked });
    // The mouse highlights what it is over; a finger only what it taps (a
    // drag across the list is scrolling). Neither scrolls the list itself.
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') this.select(index, false, false);
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.leaveGrid();
      this.select(index, false, false);
      this.activate(index);
    });
    // The arrows of a choice step it back and forth.
    if (change) {
      el.querySelectorAll<HTMLElement>('.arr').forEach((arr) => {
        arr.addEventListener('click', (e) => {
          e.stopPropagation();
          this.leaveGrid();
          this.select(index, false, false);
          this.nudge(index, arr.classList.contains('l') ? -1 : 1);
        });
      });
    }
    list.append(el);
    return el;
  }

  /**
   * An item that is a label and a value, changed with left and right.
   * `open`: what A (or a click on it) does instead of the next value (a grid to pick it from).
   */
  choice(list: HTMLElement, label: string, value: string, change: (dir: number) => void, opts: ItemOpts & { open?: () => void } = {}): HTMLElement {
    return this.addItem(list, h('div.item', h('span', label), h('span.choice', h('i.arr.l', '‹'), h('span.val', value), h('i.arr.r', '›'))), opts.open, change, opts);
  }

  /**
   * Change an item where it is, without drawing the screen again: its value
   * (a choice's), its label, whether it is locked (and why), whether it shows.
   */
  update(key: string, c: { value?: string; label?: string; locked?: string | null; hidden?: boolean }): void {
    const i = this.items.findIndex((it) => it.key === key);
    const it = this.items[i];
    if (!it) return;
    if (c.value !== undefined) {
      const v = it.el.querySelector('.val');
      if (v && v.textContent !== c.value) v.textContent = c.value;
    }
    if (c.label !== undefined) {
      const s = it.el.querySelector(':scope > span');
      if (s && s.textContent !== c.label) s.textContent = c.label;
    }
    if (c.locked !== undefined) {
      it.locked = c.locked;
      setClass(it.el, 'locked', !!c.locked);
    }
    if (c.hidden !== undefined && it.el.hidden !== c.hidden) {
      it.el.hidden = c.hidden;
      // The highlight does not stay on what went.
      if (c.hidden && i === this.sel) this.select(this.shownFrom(i, 1), false);
    }
  }

  /**
   * Make cells pickable by sight (see Grid): a click or a tap on one puts it
   * on. Returns what takes the highlight into them (for A on the item that
   * opens them).
   */
  grid(grid: Grid): () => void {
    grid.cells.forEach((cell, i) => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        this.leaveGrid();
        this.host.sound('ui_select');
        grid.set(i);
      });
    });
    return () => {
      const at = grid.on();
      const start = at >= 0 && at < grid.cells.length ? at : 0;
      this.gridding = { grid, at: start, start: at };
      setClass(this.root, 'gridding', true);
      grid.cells[start].parentElement?.classList.add('grid-on');
      this.gridCursor();
      if (this.footerEl) this.fillFooter(this.footerEl, GRID_PROMPTS);
    };
  }

  /** Whether the highlight is in a grid. */
  get inGrid(): boolean {
    return this.gridding !== null;
  }

  /** The grid's highlight on its cell, in view. */
  private gridCursor(): void {
    const g = this.gridding;
    if (!g) return;
    g.grid.cells.forEach((c, i) => setClass(c, 'cur', i === g.at));
    const cell = g.grid.cells[g.at];
    if (cell) this.bringIntoView(cell, g.grid.cells);
  }

  /** Take the highlight out of the grid it is in (`back`: put back the cell that was on when it went in). */
  private leaveGrid(back = false): void {
    const g = this.gridding;
    if (!g) return;
    this.gridding = null;
    setClass(this.root, 'gridding', false);
    for (const c of g.grid.cells) c.classList.remove('cur');
    g.grid.cells[0]?.parentElement?.classList.remove('grid-on');
    if (this.footerEl) this.fillFooter(this.footerEl, this.footerPrompts);
    if (back && g.start >= 0 && g.grid.on() !== g.start) g.grid.set(g.start);
  }

  /** A press while the highlight is in a grid. */
  private gridPress(p: MenuInput): void {
    const g = this.gridding!;
    if (p === 'confirm') {
      this.host.sound('ui_select');
      if (g.grid.on() !== g.at) g.grid.set(g.at);
      this.leaveGrid();
    } else if (p === 'back') {
      this.host.sound('ui_back');
      this.leaveGrid(true);
    } else if (p === 'up' || p === 'down' || p === 'left' || p === 'right') {
      const next = spatialStep(g.grid.cells, g.at, p);
      if (next === g.at) return;
      g.at = next;
      this.host.sound('ui_move');
      g.grid.set(next);
      this.gridCursor();
    }
  }

  /** An item that does something. `hint`: a line shown only while it is highlighted. */
  button(list: HTMLElement, label: string | HTMLElement, activate: () => void, opts: ItemOpts & { go?: boolean; note?: string; hint?: string } = {}): HTMLElement {
    const el = h('div.item' + (opts.go ? '.go' : ''), typeof label === 'string' ? h('span', label) : label, opts.note ? h('small', opts.note) : null, opts.hint ? h('small.hint', opts.hint) : null);
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

  select(i: number, sound = true, scroll = true): void {
    if (!this.items.length) return;
    this.sel = (i + this.items.length) % this.items.length;
    this.items.forEach((it, k) => setClass(it.el, 'sel', k === this.sel));
    const top = this.stack[this.stack.length - 1];
    if (top) {
      top.sel = this.sel;
      top.key = this.items[this.sel]?.key ?? '';
      this.defs.get(top.id)?.selected?.(this, top.key, top.data as never);
    }
    if (scroll) this.reveal(this.sel);
    if (sound) this.host.sound('ui_move');
  }

  /**
   * Scroll whatever holds the item so it shows: the first item of a pane
   * brings the pane back to its top (the heading over the list shows), the
   * last takes it to its end (the notes under it), anything else just comes
   * into view with a little of what is round it.
   */
  private reveal(index: number): void {
    const el = this.items[index]?.el;
    if (el) this.bringIntoView(el, this.items.map((it) => it.el));
  }

  /** Scroll `el` into view, as reveal does: `among` are the things the highlight moves through (the first and last of a pane go to its ends). */
  private bringIntoView(el: HTMLElement, among: HTMLElement[]): void {
    if (!el.isConnected) return;
    const pane = scroller(el, this.root);
    if (!pane) return;
    // Pinned in place (the results' buttons): already showing.
    if (pinned(el, pane)) return;
    const inPane = among.filter((it) => pane.contains(it) && !pinned(it, pane));
    const p = pane.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const margin = Math.min(p.height * 0.18, r.height * 1.2);
    const max = pane.scrollHeight - pane.clientHeight;
    let to = pane.scrollTop;
    if (inPane[0] === el && r.bottom - p.top + pane.scrollTop <= pane.clientHeight) to = 0;
    else if (inPane[inPane.length - 1] === el && r.top - p.top + pane.scrollTop - max >= 0) to = max;
    else if (r.top < p.top + margin) to = pane.scrollTop - (p.top + margin - r.top);
    else if (r.bottom > p.bottom - margin) to = pane.scrollTop + (r.bottom - (p.bottom - margin));
    to = Math.max(0, Math.min(max, to));
    if (Math.abs(to - pane.scrollTop) > 0.5) pane.scrollTo({ top: to, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  /** Scroll the screen's text by `dy` pixels (the right stick, or the D-pad on a screen with nothing to pick). */
  scrollBy(dy: number): void {
    const el = this.items[this.sel]?.el;
    const pane = (el && scroller(el, this.root)) || firstScroller(this.root);
    if (pane) pane.scrollTop += dy;
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
      // In a grid, the arrows, A and B are the grid's; nothing else does anything until it is left.
      if (this.gridding) {
        this.gridPress(p);
        continue;
      }
      const def = this.defs.get(top.id);
      const horizontal = !!def?.horizontal;
      // Nothing to pick (the controls): up and down read the page.
      if (this.items.length === 0 && (p === 'up' || p === 'down')) {
        this.scrollBy((p === 'up' ? -1 : 1) * Math.max(60, this.root.clientHeight * 0.3));
        continue;
      }
      if (def?.spatial && (p === 'up' || p === 'down' || p === 'left' || p === 'right')) {
        const next = spatialStep(this.items.map((it) => it.el), this.sel, p);
        if (next !== this.sel) this.select(next);
        continue;
      }
      if (p === 'confirm') this.activate(this.sel);
      else if (p === 'back') {
        this.host.sound('ui_back');
        if (def?.back) def.back(this, top.data as never);
        else this.pop();
      } else if (p === (horizontal ? 'left' : 'up')) this.select(this.shownFrom(this.sel - 1, -1));
      else if (p === (horizontal ? 'right' : 'down')) this.select(this.shownFrom(this.sel + 1, 1));
      else if (!horizontal && (p === 'left' || p === 'right')) {
        const it = this.items[this.sel];
        if (it?.change) this.nudge(this.sel, p === 'left' ? -1 : 1);
        else def?.press?.(this, p, top.data as never);
      } else def?.press?.(this, p, top.data as never);
    }
  }
}

/**
 * Where an arrow goes from `from` among elements laid out in rows (a grid of
 * portraits, a keyboard's keys and the buttons under them), by where they sit
 * on screen: left and right along its row, round to the row's other end; up
 * and down to the row above or below, to the element nearest across, round
 * to the far row. Elements not showing are passed over.
 */
export function spatialStep(els: readonly HTMLElement[], from: number, dir: 'up' | 'down' | 'left' | 'right'): number {
  const r = els.map((e) => e.getBoundingClientRect());
  const a = r[from];
  if (!a || a.width === 0 || a.height === 0) return from;
  const cx = (b: DOMRect) => b.left + b.width / 2;
  const cy = (b: DOMRect) => b.top + b.height / 2;
  const shown = r.map((b, i) => i).filter((i) => i !== from && r[i].width > 0 && r[i].height > 0);
  const inRow = (b: DOMRect, y: number) => Math.abs(cy(b) - y) < Math.min(a.height, b.height) / 2;
  const nearestAcross = (cands: number[]) => cands.reduce((best, i) => (Math.abs(cx(r[i]) - cx(a)) < Math.abs(cx(r[best]) - cx(a)) ? i : best), cands[0]);
  if (dir === 'left' || dir === 'right') {
    const s = dir === 'right' ? 1 : -1;
    const row = shown.filter((i) => inRow(r[i], cy(a)));
    if (!row.length) return from;
    const ahead = row.filter((i) => (cx(r[i]) - cx(a)) * s > 0.5);
    // The next along, or round to the far end of the row.
    if (ahead.length) return ahead.reduce((best, i) => ((cx(r[i]) - cx(r[best])) * s < 0 ? i : best), ahead[0]);
    return row.reduce((best, i) => ((cx(r[i]) - cx(r[best])) * s < 0 ? i : best), row[0]);
  }
  const s = dir === 'down' ? 1 : -1;
  const off = shown.filter((i) => !inRow(r[i], cy(a)));
  if (!off.length) return from;
  const ahead = off.filter((i) => (cy(r[i]) - cy(a)) * s > 0);
  // The nearest row that way, or round to the farthest the other way.
  const pool = ahead.length ? ahead : off;
  const rowY = cy(r[pool.reduce((best, i) => ((ahead.length ? 1 : -1) * (Math.abs(cy(r[i]) - cy(a)) - Math.abs(cy(r[best]) - cy(a))) < 0 ? i : best), pool[0])]);
  return nearestAcross(pool.filter((i) => Math.abs(cy(r[i]) - rowY) < r[i].height / 2 + 0.5));
}

/** The nearest element between `el` and `root` that scrolls and has more than it shows. */
function scroller(el: HTMLElement, root: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** The first pane on the screen with more than it shows. */
function firstScroller(root: HTMLElement): HTMLElement | null {
  for (const p of root.querySelectorAll<HTMLElement>('[data-scroll], [data-scroll] *')) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

/** Whether the element is held in place in its pane (position: sticky on it or between). */
function pinned(el: HTMLElement, pane: HTMLElement): boolean {
  for (let p: HTMLElement | null = el; p && p !== pane; p = p.parentElement) {
    if (getComputedStyle(p).position === 'sticky') return true;
  }
  return false;
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A painted image, as an element. */
export function art(url: string, spec: string, alt: string): HTMLImageElement {
  const img = h<'img'>(spec);
  img.src = url;
  img.alt = alt;
  img.draggable = false;
  return img;
}

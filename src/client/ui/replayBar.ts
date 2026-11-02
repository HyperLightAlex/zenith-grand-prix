// The replay's controls: a timeline with the race's moments marked on it, and
// a row of controls, each with its key or button for the device in hand (and
// each a button to click or tap).

import type { Device } from '../input/input';
import type { Highlight } from '../game/replay';
import { h, setClass, setText } from './dom';

export interface ReplayBarState {
  tick: number;
  ticks: number;
  paused: boolean;
  speed: number;
  pilot: string;
  camera: string;
  /** Preparing (0 to 1), or null once ready. */
  preparing: number | null;
  highlights: readonly Highlight[];
  /** The race no longer plays out as raced (the game has changed since). */
  drifted: boolean;
}

export interface ReplayBarActions {
  playPause(): void;
  seekBy(seconds: number): void;
  seekTo(fraction: number): void;
  speed(dir: number): void;
  pilot(dir: number): void;
  camera(): void;
  moment(): void;
  menu(): void;
}

type Control = 'play' | 'seek' | 'speed' | 'pilot' | 'camera' | 'moment' | 'menu';

const KEYS: Record<Device, Record<Control, string>> = {
  pad: { play: 'A', seek: '◀ ▶', speed: '▲ ▼', pilot: 'LB RB', camera: 'X', moment: 'Y', menu: 'Start' },
  keys: { play: 'Space', seek: 'A D', speed: 'W S', pilot: 'Q E', camera: 'X', moment: 'Y', menu: 'Esc' },
  touch: { play: '', seek: '', speed: '', pilot: '', camera: '', moment: '', menu: '' },
};

const TICKS_PER_SECOND = 60;

function clock(ticks: number): string {
  const s = Math.max(0, ticks) / TICKS_PER_SECOND;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export class ReplayBar {
  readonly root = h('div.ui.replaybar');
  private fill = h('i.fill');
  private marks = h('div.marks');
  private line = h('div.timeline', this.fill, this.marks);
  private time = h('span.time', '');
  private status = h('span.status', '');
  private keys = new Map<Control, HTMLElement>();
  private labels = new Map<Control, HTMLElement>();
  private marksKey = '';
  private device: Device = 'keys';

  constructor(parent: HTMLElement, private readonly act: ReplayBarActions) {
    const row = h('div.playback');
    const add = (c: Control, label: string, run: (side: number) => void, sides = false) => {
      const key = h('span.key', '');
      const text = h('span.label', label);
      const el = h('div.ctl', key, text);
      el.dataset.ctl = c;
      if (sides) {
        // A two-way control: its left half goes back, its right half on.
        const back = h('b.arrow', '‹');
        const on = h('b.arrow', '›');
        back.addEventListener('pointerdown', (e) => (e.stopPropagation(), run(-1)));
        on.addEventListener('pointerdown', (e) => (e.stopPropagation(), run(1)));
        el.prepend(back);
        el.append(on);
      } else el.addEventListener('pointerdown', (e) => (e.stopPropagation(), run(1)));
      this.keys.set(c, key);
      this.labels.set(c, text);
      row.append(el);
    };
    add('play', 'Play', () => act.playPause());
    add('seek', '5 s', (d) => act.seekBy(5 * d), true);
    add('speed', '×1', (d) => act.speed(d), true);
    add('pilot', '', (d) => act.pilot(d), true);
    add('camera', '', () => act.camera());
    add('moment', 'Next moment', () => act.moment());
    add('menu', 'Menu', () => act.menu());
    this.line.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const r = this.line.getBoundingClientRect();
      act.seekTo(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    });
    this.root.append(h('div.top', this.time, this.status), this.line, row);
    this.root.hidden = true;
    parent.append(this.root);
    this.setDevice('keys');
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  setDevice(d: Device): void {
    if (d === this.device && this.root.dataset.device) return;
    this.device = d;
    this.root.dataset.device = d;
    for (const [c, el] of this.keys) {
      setText(el, KEYS[d][c]);
      el.hidden = !KEYS[d][c];
    }
  }

  update(s: ReplayBarState): void {
    const preparing = s.preparing !== null;
    setClass(this.root, 'preparing', preparing);
    setText(this.time, preparing ? 'Preparing the replay' : `${clock(s.tick)} / ${clock(s.ticks)}`);
    setText(this.status, preparing ? `${Math.round((s.preparing ?? 0) * 100)}%` : s.drifted ? 'May differ from the race: the game has changed since' : '');
    this.fill.style.transform = `scaleX(${(preparing ? (s.preparing ?? 0) : s.tick / Math.max(1, s.ticks)).toFixed(4)})`;
    setText(this.labels.get('play')!, s.paused ? 'Play' : 'Pause');
    setText(this.labels.get('speed')!, s.speed === 1 ? '×1' : s.speed < 1 ? `×${s.speed === 0.5 ? '½' : '¼'}` : `×${s.speed}`);
    setText(this.labels.get('pilot')!, s.pilot);
    setText(this.labels.get('camera')!, s.camera);
    const key = `${s.ticks}|${s.highlights.length}`;
    if (key !== this.marksKey) {
      this.marksKey = key;
      this.marks.replaceChildren(
        ...s.highlights.map((m) => {
          const el = h('i.mark.' + m.kind);
          el.style.left = `${((m.tick / Math.max(1, s.ticks)) * 100).toFixed(2)}%`;
          el.title = m.label;
          return el;
        }),
      );
    }
  }
}

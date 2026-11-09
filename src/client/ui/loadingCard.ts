// While a race loads: the circuit being raced, over pictures of it taken in
// the game (art/circuits, by tools/capture/loading-shots.json), its outline
// drawn in as the loading gets on, and tips for the race. So the race opens
// on a circuit that is all there (its titan, its painted textures, every
// shader ready) rather than filling in during the flight over it. It gives
// way to the flight's title card: the same band in the same place.

import type { Device } from '../input/input';
import { h, setClass } from './dom';
import { markSeen, tipParts, type Tip } from './loadingTips';

/** Each circuit's pictures, `<circuit>-<n>.webp`, in order. */
const SHOT_FILES = import.meta.glob('./art/circuits/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const SHOTS = new Map<string, string[]>();
for (const path of Object.keys(SHOT_FILES).sort()) {
  const m = /\/([a-z]+)-\d+\.webp$/.exec(path);
  if (!m) continue;
  SHOTS.set(m[1], [...(SHOTS.get(m[1]) ?? []), SHOT_FILES[path]]);
}

/** A circuit's pictures (none: the card's dark ground alone). */
export function circuitShots(track: string): readonly string[] {
  // (A layout on trial, 'zenith-a', has its circuit's.)
  return SHOTS.get(track) ?? SHOTS.get(track.split('-')[0]) ?? [];
}

const fetched = new Set<string>();
/** Fetch a circuit's first pictures ahead, so the card has them the moment it is up (when the circuit is named). */
export function preloadCircuitShots(track: string): void {
  for (const url of circuitShots(track).slice(0, 2)) {
    if (fetched.has(url)) continue;
    fetched.add(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}

/** How long a picture, and a tip, stays before the next, ms. */
const SHOT_EVERY = 6500;
const TIP_EVERY = 7000;
/** The least the card stays up, so a quick load does not just flash it, ms. */
const MIN_SHOWN = 1200;

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export class LoadingCard {
  readonly root = h('div.ui.loadcard');
  private shotsBox = h('div.lc-shots');
  private layers = [h<'img'>('img.lc-shot'), h<'img'>('img.lc-shot')];
  private event = h('div.tc-event');
  private name = h('div.tc-name');
  private what = h('div.lc-what');
  // The circuit's outline: drawn in as it loads (the progress), from the line round.
  private mapBox = h('div.lc-map');
  private map = svg('svg', { viewBox: '-4 -4 108 108', preserveAspectRatio: 'xMaxYMin meet', 'aria-hidden': 'true' });
  private drawn = svg('path', { class: 'lc-drawn' });
  private base = svg('path', { class: 'lc-road' });
  private edge = svg('path', { class: 'lc-edge' });
  private head = svg('circle', { class: 'lc-head', r: '2.2' });
  private line = svg('path', { class: 'lc-line' });
  private facts = h('div.lc-facts');
  private tip = h('p.lc-tip-text');
  private tipBox = h('div.lc-tip', this.tip, h('i.lc-tip-time'));
  private shownAt = 0;
  private shots: readonly string[] = [];
  private shotAt = 0;
  private layer = 0;
  private tips: Tip[] = [];
  private tipAt = 0;
  private device: Device = 'keys';
  private timers: number[] = [];
  /** The outline's points (0 to 100 across) and how far round each is. */
  private plan: Array<[number, number]> = [];
  private along: number[] = [];

  constructor(parent: HTMLElement) {
    for (const img of this.layers) {
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      this.shotsBox.append(img);
    }
    this.map.append(this.edge, this.base, this.drawn, this.line, this.head);
    this.mapBox.append(this.map, this.facts);
    this.mapBox.setAttribute('role', 'progressbar');
    this.mapBox.setAttribute('aria-valuemin', '0');
    this.mapBox.setAttribute('aria-valuemax', '100');
    this.mapBox.setAttribute('aria-label', 'Loading');
    this.root.append(this.shotsBox, h('div.lc-shade'), this.mapBox, h('div.tc-band', this.event, this.name, this.what), this.tipBox);
    this.root.hidden = true;
    parent.append(this.root);
  }

  get showing(): boolean {
    return !this.root.hidden && !this.root.classList.contains('out');
  }

  /**
   * Up, for a race on `track` (its pictures, from the first), with its tips
   * (the first shown at once). Again for the same race (the event's line
   * known once the race is built): the line changes, the rest carries on.
   */
  show(c: { event: string; circuit: string; track: string; tips?: Tip[]; device?: Device }): void {
    this.event.textContent = c.event;
    this.name.textContent = c.circuit;
    if (this.showing && this.root.dataset.track === c.track) return;
    this.stop();
    this.root.dataset.track = c.track;
    this.progress(0, 'Loading the circuit');
    this.outline(null);
    // The pictures: the first at once (fetched ahead if the circuit was named), the rest in turn.
    this.shots = circuitShots(c.track);
    this.shotAt = 0;
    for (const img of this.layers) setClass(img, 'on', false);
    if (this.shots.length) this.showShot();
    if (this.shots.length > 1) this.timers.push(window.setInterval(() => this.showShot(), SHOT_EVERY));
    // The tips.
    this.device = c.device ?? 'keys';
    this.tips = c.tips ?? [];
    this.tipAt = 0;
    this.tipBox.hidden = !this.tips.length;
    if (this.tips.length) {
      this.showTip();
      if (this.tips.length > 1) this.timers.push(window.setInterval(() => this.nextTip(), TIP_EVERY));
    }
    this.root.hidden = false;
    setClass(this.root, 'out', false);
    this.shownAt = performance.now();
  }

  /** The next picture, faded in over the last (drifting slowly while it shows). */
  private showShot(): void {
    const url = this.shots[this.shotAt % this.shots.length];
    this.shotAt++;
    const next = this.layers[this.layer ^ 1];
    const last = this.layers[this.layer];
    const on = () => {
      if (next.dataset.url !== url) return;
      // (Restarted, so its drift starts with it.)
      setClass(next, 'on', false);
      void next.offsetWidth;
      setClass(next, 'on', true);
      setClass(last, 'on', false);
      this.layer ^= 1;
    };
    next.dataset.url = url;
    if (next.src.endsWith(url) && next.complete) on();
    else {
      next.onload = on;
      next.src = url;
    }
  }

  private showTip(): void {
    const tip = this.tips[this.tipAt % this.tips.length];
    this.tip.replaceChildren(...tipParts(tip, this.device).map((p) => (p.key ? h('span.key', p.text) : document.createTextNode(p.text))));
    markSeen(tip.id);
    // (The tip's clock, run again.)
    setClass(this.tipBox, 'run', false);
    void this.tipBox.offsetWidth;
    setClass(this.tipBox, 'run', this.tips.length > 1);
  }

  private nextTip(): void {
    setClass(this.tipBox, 'swap', true);
    this.timers.push(
      window.setTimeout(() => {
        this.tipAt++;
        this.showTip();
        setClass(this.tipBox, 'swap', false);
      }, 300),
    );
  }

  /**
   * The circuit's outline (its plan, x and z, 0 to 1 across, from the start
   * line round in the way it is raced), and its facts; null to clear.
   */
  outline(points: ArrayLike<number> | null, facts = ''): void {
    this.facts.textContent = facts;
    const ok = !!points && points.length >= 4;
    setClass(this.mapBox, 'ready', ok);
    this.plan = [];
    this.along = [];
    if (!ok) {
      for (const p of [this.edge, this.base, this.drawn, this.line]) p.setAttribute('d', '');
      return;
    }
    const n = points.length / 2;
    // Round, back to the line.
    for (let i = 0; i <= n; i++) this.plan.push([points[(i % n) * 2] * 100, points[(i % n) * 2 + 1] * 100]);
    let run = 0;
    this.plan.forEach(([x, y], i) => {
      if (i) run += Math.hypot(x - this.plan[i - 1][0], y - this.plan[i - 1][1]);
      this.along.push(run);
    });
    // Framed close round it (a long circuit is a short box: its facts sit under it).
    const xs = this.plan.map((p) => p[0]);
    const ys = this.plan.map((p) => p[1]);
    const [x0b, y0b] = [Math.min(...xs) - 5, Math.min(...ys) - 5];
    this.map.setAttribute('viewBox', `${x0b.toFixed(1)} ${y0b.toFixed(1)} ${(Math.max(...xs) + 5 - x0b).toFixed(1)} ${(Math.max(...ys) + 5 - y0b).toFixed(1)}`);
    const d = this.path(this.plan);
    this.edge.setAttribute('d', d);
    this.base.setAttribute('d', d);
    // The line: across the road at the start, square to it.
    const [[x0, y0], [x1, y1]] = this.plan;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const [nx, ny] = [-(y1 - y0) / len, (x1 - x0) / len];
    this.line.setAttribute('d', `M${(x0 - nx * 4).toFixed(2)} ${(y0 - ny * 4).toFixed(2)}L${(x0 + nx * 4).toFixed(2)} ${(y0 + ny * 4).toFixed(2)}`);
    this.progress(Number(this.mapBox.getAttribute('aria-valuenow') ?? 0) / 100);
  }

  private path(points: Array<[number, number]>): string {
    return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
  }

  /** How far it has got (0 to 1), and what it is doing: the outline drawn in that far, from the line. */
  progress(f: number, what?: string): void {
    const k = Math.max(0, Math.min(1, f));
    this.mapBox.setAttribute('aria-valuenow', String(Math.round(k * 100)));
    if (what !== undefined) this.what.textContent = what;
    const total = this.along[this.along.length - 1] ?? 0;
    if (!total) return;
    // The points up to that far round, and the last part of the way to the next.
    const want = k * total;
    let i = 1;
    while (i < this.along.length - 1 && this.along[i] < want) i++;
    const [ax, ay] = this.plan[i - 1];
    const [bx, by] = this.plan[i];
    const seg = this.along[i] - this.along[i - 1] || 1;
    const t = Math.max(0, Math.min(1, (want - this.along[i - 1]) / seg));
    const end: [number, number] = [ax + (bx - ax) * t, ay + (by - ay) * t];
    this.drawn.setAttribute('d', k > 0 ? this.path([...this.plan.slice(0, i), end]) : '');
    this.head.setAttribute('cx', end[0].toFixed(2));
    this.head.setAttribute('cy', end[1].toFixed(2));
  }

  private stop(): void {
    for (const t of this.timers) {
      clearInterval(t);
      clearTimeout(t);
    }
    this.timers = [];
  }

  /**
   * Away, fading, once it has been up long enough to see (a circuit already
   * loaded is quick: it does not flash); resolves as it starts to go.
   */
  async hide(): Promise<void> {
    if (this.root.hidden) return;
    const wait = MIN_SHOWN - (performance.now() - this.shownAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setClass(this.root, 'out', true);
    window.setTimeout(() => {
      if (!this.root.classList.contains('out')) return;
      this.root.hidden = true;
      this.stop();
      delete this.root.dataset.track;
    }, 400);
  }

  /** Gone at once (the race it was for is gone). */
  drop(): void {
    this.root.hidden = true;
    setClass(this.root, 'out', false);
    this.stop();
    delete this.root.dataset.track;
  }
}

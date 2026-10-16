// The dash: speed, Drive, armour, guard and Cells in one cluster in a
// corner, everything flowing into the speed in the middle (the way Kingdom
// Hearts wraps its gauges round the portrait).
//
//   the dial    the speed, with the limiter beside it
//   the ring    Drive: round the dial and out along the bottom. It drains
//               from the far end of the tail, so the ring round the speed is
//               the last of it; one smooth sweep; it glows while Drive comes in
//   armour      the bar over the tail, as long as the frame is tough (a
//               defender's longest); drains toward the dial; blinks red when
//               critical; a white trail shows the last hit
//   (guard has its own meter under your mech while it matters: hud.ts)
//   Cells       the bar over that, one segment a Cell, filling by halves,
//               rising into the dial at the end; the ability it pays for
//               (button, icon, name) sits on it, gold when it can be used
//
// Drawn in SVG with one unit to the cluster's em, so the HTML laid over it
// (the speed, the numbers, the labels) lines up by the same numbers.

import { CLASSES, DRIVE_MAX, CRITICAL_HP, type MechState, type RaceState } from '../../sim/index';
import { h, setClass, setText } from './dom';
import { ICONS, type IconName } from './hudArt';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: SVGElement[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) e.append(k);
  return e;
}

const f2 = (v: number) => v.toFixed(2);

// ---- the geometry, in the cluster's em, the dial's centre at 0,0 ----------
/** The dial. */
const R = 3.15;
/** Where the bars keep clear of the dial (and the ring's inner edge). */
const CLEAR = R + 0.3;
/** The Drive ring: its width and the radius of its middle. */
const RW = 0.95;
const RR = CLEAR + RW / 2;
const ROUT = RR + RW / 2;
/** Where the ring starts, up and to the left of the dial (degrees, clockwise from 3 o'clock). */
const RING_START = 212;
/** The tail's far end. */
const TAIL_X = -17.4;
/** The armour bar: its top and bottom, and its length for the toughest frame. */
const HP_TOP = 2.4;
const HP_BOT = 3.19;
const HP_LEN = 13;
const HP_TOUGHEST = 2000;
/** The Cells bar: its thin part, and the ramp up into the dial. */
const CL_X = -14.5;
const CL_TOP = 1.45;
const CL_BOT = 2.02;
const CL_RAMP_X = -9.2;
const CL_RAMP_TOP = 0.3;
/** Slant of the segment edges (the HUD's skew). */
const SLANT = 0.32;
/** The box the cluster draws in. */
const X0 = -17.6;
const Y0 = -4.6;
const BOX_W = ROUT + 0.2 - X0;
const BOX_H = ROUT + 0.2 - Y0;

/** The x where a bar at height y meets the dial's clearance. */
const edgeX = (y: number) => -Math.sqrt(Math.max(0, CLEAR * CLEAR - y * y));

/** A bar from x0 to the dial between two heights: its left end slanted, its right end along the dial. */
function barShape(x0: number, top: number, bot: number): string {
  const pts: string[] = [`${f2(x0 + SLANT * (bot - top))},${f2(top)}`];
  for (let i = 0; i <= 6; i++) {
    const y = top + ((bot - top) * i) / 6;
    pts.push(`${f2(edgeX(y))},${f2(y)}`);
  }
  pts.push(`${f2(x0)},${f2(bot)}`);
  return 'M' + pts.join(' L') + ' Z';
}

/** The Cells bar: thin along the armour, rising at the end into the dial. */
function cellsShape(): string {
  const pts: string[] = [`${f2(CL_X)},${f2(CL_BOT)}`, `${f2(CL_X + SLANT * (CL_BOT - CL_TOP))},${f2(CL_TOP)}`, `${f2(CL_RAMP_X)},${f2(CL_TOP)}`];
  // A long, low wedge up to the dial, then the right end runs down along it.
  const rx = edgeX(CL_RAMP_TOP) - 0.35;
  pts.push(`${f2(rx)},${f2(CL_RAMP_TOP)}`);
  for (let i = 0; i <= 10; i++) {
    const y = CL_RAMP_TOP + ((CL_BOT - CL_RAMP_TOP) * i) / 10;
    pts.push(`${f2(edgeX(y))},${f2(y)}`);
  }
  return 'M' + pts.join(' L') + ' Z';
}

/** The Drive path: from the ring's start, round the dial clockwise to the bottom, then out along the tail. */
function drivePath(): string {
  const a = (RING_START * Math.PI) / 180;
  const sx = RR * Math.cos(a);
  const sy = RR * Math.sin(a);
  return `M${f2(sx)},${f2(sy)} A${RR},${RR} 0 1 1 0,${f2(RR)} L${TAIL_X},${f2(RR)}`;
}

/** A slanted slice of the box from bottom-left x a to bottom-left x b. */
function slice(a: number, b: number): string {
  const lean = SLANT * (CL_BOT - (CL_RAMP_TOP - 0.5));
  const top = CL_RAMP_TOP - 0.5;
  return `${f2(a + lean)},${f2(top)} ${f2(b + lean)},${f2(top)} ${f2(b)},${f2(CL_BOT + 0.1)} ${f2(a)},${f2(CL_BOT + 0.1)}`;
}

/**
 * An anchor for HTML laid over the drawing at x, y (the cluster's em). The
 * anchor keeps the cluster's type size, so the numbers line up; the piece
 * in it sizes its own type and hangs off the point: centred on it ('c'), to
 * its left ('r', right-aligned), or above and to the right ('a').
 */
function at(piece: HTMLElement, x: number, y: number, hang: 'c' | 'r' | 'a'): HTMLElement {
  const anchor = h('div.dash-at.' + hang, piece);
  move(anchor, x, y);
  return anchor;
}

function move(anchor: HTMLElement, x: number, y: number): void {
  anchor.style.left = `${f2(x - X0)}em`;
  anchor.style.top = `${f2(y - Y0)}em`;
}

export class Dash {
  readonly root = h('div.dash');
  private svg: SVGSVGElement;
  private ringFill: SVGPathElement;
  private hpTrack: SVGPathElement;
  private hpClip: SVGPathElement;
  private hpFill: SVGRectElement;
  private hpGhost: SVGRectElement;
  private cellsG: SVGGElement;
  private cellFills: SVGPolygonElement[] = [];
  private cellCuts: Array<[number, number]> = [];
  private hpLen = -1;
  private lastCells = -1;
  private lastDrive = -1;
  // The HTML over the drawing.
  readonly mph = h('span.mph', '0');
  readonly limiter = h('div.limiter', '');
  private speed = h('div.dash-speed', this.mph, h('span.unit', 'mph'));
  private hpVal = h('span.dash-hp', '');
  private hpAt: HTMLElement;
  private abilityKey = h('span.key', '');
  private abilityIco = h('i.ico');
  private abilityName = h('span', '');
  private ability = h('div.dash-ability', this.abilityKey, this.abilityIco, this.abilityName);

  constructor() {
    const d = drivePath();
    this.ringFill = el('path', { class: 'ring-fill', d, pathLength: 100 });
    this.hpTrack = el('path', { class: 'bar-track' });
    this.hpClip = el('path');
    this.hpGhost = el('rect', { class: 'hp-ghost' });
    this.hpFill = el('rect', { class: 'hp-fill' });
    this.cellsG = el('g', { 'clip-path': 'url(#dash-cells)' });
    const cellsD = cellsShape();
    this.svg = el(
      'svg',
      { class: 'dash-svg', viewBox: `${X0} ${Y0} ${f2(BOX_W)} ${f2(BOX_H)}`, 'aria-hidden': 'true' },
      el(
        'defs',
        {},
        el('clipPath', { id: 'dash-hp' }, this.hpClip),
        el('clipPath', { id: 'dash-cells' }, el('path', { d: cellsD })),
        el('linearGradient', { id: 'dash-cell-grad', x1: '0', x2: '1', y1: '0', y2: '0' }, el('stop', { offset: '0', 'stop-color': '#ffd23d' }), el('stop', { offset: '1', 'stop-color': '#ff7a1a' })),
      ),
      el('circle', { class: 'dial', r: R }),
      el('path', { class: 'ring-track', d }),
      this.ringFill,
      this.hpTrack,
      el('g', { 'clip-path': 'url(#dash-hp)' }, this.hpGhost, this.hpFill),
      el('path', { class: 'bar-track cells-track', d: cellsD }),
      this.cellsG,
    );
    this.hpAt = at(this.hpVal, -15, (HP_TOP + HP_BOT) / 2, 'r');
    this.root.append(this.svg, at(this.speed, 0, 0.05, 'c'), this.hpAt, at(this.ability, CL_X + 0.15, CL_TOP - 0.22, 'a'), at(this.limiter, -4.2, -2.15, 'r'));
  }

  /** Room for the carve meter, over the dial's upper left. */
  hold(piece: HTMLElement): void {
    this.root.append(at(piece, -4.2, -3.7, 'r'));
  }

  /** The armour bar as long as this frame's armour (a defender's is the longest). */
  private sizeArmour(maxHp: number): void {
    const len = HP_LEN * Math.min(1, maxHp / HP_TOUGHEST);
    if (Math.abs(len - this.hpLen) < 1e-3) return;
    this.hpLen = len;
    const x0 = edgeX(HP_TOP) - len;
    const hp = barShape(x0, HP_TOP, HP_BOT);
    this.hpTrack.setAttribute('d', hp);
    this.hpClip.setAttribute('d', hp);
    // Fills grow from the dial's side (scaled about their right edge).
    const right = -1;
    for (const r of [this.hpFill, this.hpGhost]) {
      r.setAttribute('x', f2(x0 - 0.1));
      r.setAttribute('y', f2(HP_TOP - 0.1));
      r.setAttribute('width', f2(right - (x0 - 0.1)));
      r.setAttribute('height', f2(HP_BOT - HP_TOP + 0.2));
    }
    // The number sits just off the bar's far end.
    move(this.hpAt, x0 - 0.45, (HP_TOP + HP_BOT) / 2);
  }

  /** One segment per whole Cell the rules allow. */
  private buildCells(n: number): void {
    if (n === this.cellFills.length) return;
    this.cellsG.replaceChildren();
    this.cellFills = [];
    this.cellCuts = [];
    const right = edgeX(CL_BOT) + 0.05;
    const span = right - CL_X;
    const gap = 0.24;
    for (let i = 0; i < n; i++) {
      const a = CL_X + (span * i) / n + (i ? gap / 2 : -0.5);
      const b = CL_X + (span * (i + 1)) / n - (i < n - 1 ? gap / 2 : -0.5);
      this.cellCuts.push([a, b]);
      this.cellsG.append(el('polygon', { class: 'cell-track', points: slice(a, b) }));
      const fill = el('polygon', { class: 'cell-fill', points: slice(a, a) });
      this.cellFills.push(fill);
      this.cellsG.append(fill);
    }
    this.lastCells = -1;
  }

  /**
   * Show the pilot's state. `abilityKey` is the button for the ability (none
   * on touch), `limiter` what the limiter tag says, and its kind.
   */
  update(race: RaceState, me: MechState, ability: { name: string; icon: IconName; ready: boolean; waiting: boolean }, abilityKey: string, speedMph: number, boosting: boolean, limiter: { text: string; kind: '' | 'off' | 'pack' }): void {
    const c = CLASSES[me.role];
    this.sizeArmour(c.maxHp);
    // Drive.
    const drive = Math.max(0, Math.min(1, me.drive / DRIVE_MAX));
    if (Math.abs(drive - this.lastDrive) > 0.0005) {
      this.lastDrive = drive;
      this.ringFill.style.strokeDasharray = `${(drive * 100).toFixed(2)} 101`;
    }
    setClass(this.root, 'gain', me.onStrip || me.linked);
    setClass(this.root, 'boost', boosting);
    setClass(this.root, 'empty', me.drive < 6);
    // Armour.
    const hpF = Math.max(0, me.hp / me.maxHp);
    this.hpFill.style.transform = `scaleX(${hpF.toFixed(3)})`;
    this.hpGhost.style.transform = `scaleX(${hpF.toFixed(3)})`;
    setClass(this.root, 'low', hpF < CRITICAL_HP && !me.retired);
    setText(this.hpVal, String(Math.ceil(me.hp)));
    // Cells.
    this.buildCells(Math.max(0, Math.min(6, Math.ceil(race.rules.cellMax))));
    const cells = Math.round(me.cells * 100) / 100;
    if (cells !== this.lastCells) {
      if (this.lastCells >= 0 && cells > this.lastCells + 0.01) {
        this.root.classList.remove('cell-gain');
        void this.root.offsetWidth;
        this.root.classList.add('cell-gain');
      }
      this.lastCells = cells;
      this.cellFills.forEach((fill, i) => {
        const [a, b] = this.cellCuts[i];
        const f = Math.max(0, Math.min(1, cells - i));
        fill.setAttribute('points', slice(a, a + (b - a) * f));
        setClass(fill as unknown as HTMLElement, 'full', f >= 1);
      });
    }
    // The ability.
    setText(this.abilityKey, abilityKey);
    setText(this.abilityName, ability.waiting ? `${ability.name} (lap ${race.rules.overdriveLap})` : ability.name);
    const ico = `url(${ICONS[ability.icon]})`;
    if (this.abilityIco.style.getPropertyValue('--ico') !== ico) this.abilityIco.style.setProperty('--ico', ico);
    setClass(this.ability, 'ready', ability.ready);
    // Speed and limiter.
    setText(this.mph, String(speedMph));
    setText(this.limiter, limiter.text);
    this.limiter.className = 'limiter' + (limiter.kind ? ' ' + limiter.kind : '');
  }
}

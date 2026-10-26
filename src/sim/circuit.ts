// Circuits in three dimensions.
//
// A CircuitDef is driven like a turtle: a run of pieces, each a straight, a
// level turn, a climb, a pitch (the parts of a jump), a loop, a corkscrew
// roll, a barrel (a roll round an axis off the road: round the inside of a
// tube, or round the outside of a column), a spiral (a turn that climbs,
// widening or tightening as it goes) or a twist (a pitch whose road rolls
// over as it goes: a loop and a corkscrew at once),
// starting at the start line facing -z. The builder carries a full
// frame (forward, right, up) through every piece, so a loop really turns the
// road over and a corkscrew really rolls it, then samples the result every
// four units into the same Track a flat plan produces.
//
// Pieces can also carry: a road width, a bank angle for a turn, a jump gap,
// an open edge (no barrier), and membership of a fork (a wall down the middle
// splitting the road into two routes, each drawn off to its own side).
//
// The lap has to end where it began. Turns must add up to a whole circle and
// every climb, pitch and roll must cancel; the builder then lengthens two
// straights (`closeWith`) to close the plan and sets the height of one climb
// (`settle`) to close the height.

import { CLASSES, GRAVITY, HOLD_TURN_SPEED } from './config';
import { clamp } from './math';
import { registerCircuitBuilder, smoothRing, type Fork, type Gate, type GateDef, type Pad, type Route, type Strip, type StripDef, type Track } from './track';

/** Grip gained in a turn per unit of sin(bank) toward its inside. */
export const BANK_GRIP = 1.2;
const STEP = 0.5;
const SAMPLE = 4;
/** The tightest a steered fork's routes bend as they part (see ForkSpec.carried): about what a mech can follow flat out. */
const ROUTE_BEND_RADIUS = 300;
/** How long a steered fork's routes run fully apart at the least, in its middle. */
const ROUTE_APART = 40;

export interface ForkSpec {
  /** Pieces carrying the same id, one after another, form one fork. */
  id: string;
  /** Half width of the wall down the middle. */
  median: number;
  /** Drawing only: each route moved across (positive right) and up at full spread. */
  left?: { shift: number; rise: number };
  right?: { shift: number; rise: number };
  /**
   * Drawing only, in place of left and right: the two routes twisted round
   * each other as a double helix about the road's line, `turns` whole turns,
   * each route's middle `radius` from the line, the right one rising over
   * the left as it starts, then crossing under it, and so on, side by side
   * again at the end.
   */
  braid?: { turns: number; radius: number };
  /**
   * The routes carry a mech as they are drawn apart: moved with its route
   * and turned to face along it, it steers as if the road ran straight on.
   * For a fork too short, or twisted too hard, to part gently enough to
   * steer (Titan's Rest's Hull, Zenith Ring's Dock, Abyss Line's Braid).
   * Otherwise a route's parting is a bend like any other, steered into.
   */
  carried?: boolean;
}

export interface PieceProps {
  /** Half width of the road through this piece; the circuit's own otherwise. */
  width?: number;
  /** Bank through a turn, degrees toward its inside. Turns without one bank by curvature. */
  bank?: number;
  /** No road: a jump gap, across the whole road or on one route of a fork. */
  gap?: true | 'left' | 'right';
  /** No barrier on that side. */
  open?: 'left' | 'right' | 'both';
  /**
   * The skates grip the rail through this piece whatever the speed and
   * whichever way up, as through a loop: for a crest that must not throw a
   * mech off (the outside of the Zenith's ring, with nothing past it but
   * the drop to Earth).
   */
  hold?: true;
  fork?: ForkSpec;
  /** For the designer's own reference. */
  name?: string;
}

export type Piece = PieceProps &
  (
    | { straight: number }
    /** Level turn: radius and degrees, positive to the right. */
    | { turn: [radius: number, degrees: number] }
    /** An S-shaped climb (or drop, height negative) over a level distance. */
    | { climb: [length: number, height: number] }
    /** A vertical arc: radius and degrees, positive nose up; moving `shift` to the right on the way round (as a loop does). */
    | { pitch: [radius: number, degrees: number, shift?: number] }
    /** A full loop of this radius, moving `shift` to the right on the way round so it clears itself. */
    | { loop: [radius: number, shift: number] }
    /** A corkscrew: this length of straight rolled through the angle, positive rolling right. */
    | { roll: [length: number, degrees: number] }
    /**
     * A barrel: like a roll, but round an axis `radius` away along the road's
     * up (positive: overhead, the road running round the inside of a tube;
     * negative: underneath, the road wrapping round the outside of a column).
     * The axis runs on straight for `length`; the turn eases in and out, so
     * the road swings off its line and back without a kink. Whole turns only.
     */
    | { barrel: [length: number, degrees: number, radius: number] }
    /**
     * A spiral: a turn about the vertical that climbs `height` (negative to
     * descend) as it goes round `degrees` (positive to the right), its
     * radius going from `r0` to `r1`. The climb eases in and out (SPIRAL_EASE
     * of the way at each end), so it starts and ends on level road; `ease`
     * says which ends ease ('both', the default), so a run of spirals can
     * climb at one steady grade from piece to piece (see spiralRun). Banks as
     * a turn does.
     */
    | { spiral: [r0: number, r1: number, degrees: number, height: number, ease?: SpiralEase] }
    /**
     * A twist: a pitch (radius and degrees, as a pitch takes them, and a
     * `shift` to the right on the way round) whose road rolls through `roll`
     * degrees about its own line as it goes (positive rolling right), easing
     * in and out. A whole loop with a whole roll goes up the inside, over
     * the top on the outside and down the inside again. `out` moves the road
     * that far away from the arc's centre as it goes (easing too), so a road
     * rolled over onto the outside of a ring's band runs on its outer face.
     * Its road turns under a mech wherever it is rolled across the arc.
     */
    | { twist: [radius: number, degrees: number, roll: number, shift?: number, out?: number] }
  );

export type SpiralEase = 'both' | 'in' | 'out' | 'none';

/** The share of a spiral's way round over which its climb eases in, and out. */
const SPIRAL_EASE = 0.15;

export interface PadDef {
  at: number;
  piece?: number;
  len: number;
  d: number;
  halfW: number;
}

export interface CircuitDef {
  id: string;
  name: string;
  /** Scenery and music to use with it (client side). */
  theme?: string;
  halfWidth: number;
  /** Height of the start line above the ground. */
  height: number;
  /** Automatic banking for turns that do not set their own: radians per unit of curvature, and the cap. */
  bankGain: number;
  maxBank: number;
  pieces: Piece[];
  /** Two level, non-parallel straights the builder may lengthen to close the plan. */
  closeWith: [number, number];
  /** A climb whose height the builder sets so the lap ends at its starting height. */
  settle: number;
  strips: StripDef[];
  gates?: GateDef[];
  pads?: PadDef[];
}

/**
 * A jump: a ramp of `ramp` degrees, then an arc that a mech doing exactly
 * `speed` would follow in free flight, with the middle `gap` of it missing,
 * a landing slope of `down` degrees (as steep as the ramp unless set) and a
 * run-out back to level. Faster than `speed` flies longer and lands further
 * down the slope; slower falls into the gap. A shallower landing slope
 * catches a fast mech sooner, so it overshoots by less (and lands harder).
 */
export function jump(o: { ramp: number; speed: number; gap?: number; land?: number; down?: number; side?: 'left' | 'right'; props?: PieceProps }): Piece[] {
  const gap = o.gap ?? 0.7;
  const down = o.down ?? o.ramp;
  const arc = o.ramp + down;
  const crest = (o.speed * o.speed) / GRAVITY;
  const lip = (arc * (1 - gap)) / 2;
  const p = o.props ?? {};
  return [
    { ...p, pitch: [crest * 0.6, o.ramp], name: 'ramp' },
    { ...p, pitch: [crest, -lip], name: 'lip' },
    { ...p, pitch: [crest, -arc * gap], gap: o.side ?? true, name: 'gap' },
    { ...p, pitch: [crest, -lip], name: 'landing' },
    { ...p, straight: o.land ?? 120, name: 'landing slope' },
    { ...p, pitch: [crest * 1.4, down], name: 'run-out' },
  ];
}

// ---- vector helpers ----------------------------------------------------------

type V3 = [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Rotate v about the unit axis k by angle a (right-handed). */
function rot(v: V3, k: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

interface Turtle {
  p: V3;
  t: V3;
  r: V3;
  u: V3;
}

interface Fine {
  p: V3;
  u: V3;
  piece: number;
  /** Turn curvature (positive right) and pitch curvature (positive toward up). */
  kh: number;
  kv: number;
}

function kindOf(pc: Piece): string {
  return 'straight' in pc ? 'straight' : 'turn' in pc ? 'turn' : 'climb' in pc ? 'climb' : 'pitch' in pc ? 'pitch' : 'loop' in pc ? 'loop' : 'spiral' in pc ? 'spiral' : 'barrel' in pc ? 'barrel' : 'twist' in pc ? 'twist' : 'roll';
}

/** A spiral's grade (rise over run) a share `f` of the way round: level at an end that eases, steady between. */
function spiralGrade(f: number, peak: number, ease: SpiralEase): number {
  const a = ease === 'both' || ease === 'in' ? f / SPIRAL_EASE : 1;
  const b = ease === 'both' || ease === 'out' ? (1 - f) / SPIRAL_EASE : 1;
  return peak * clamp(Math.min(a, b), 0, 1);
}

/** The share of a spiral's run its climb is spread over, given the ends that ease. */
function spiralSpread(ease: SpiralEase): number {
  return 1 - (ease === 'both' ? SPIRAL_EASE : ease === 'none' ? 0 : SPIRAL_EASE / 2);
}

/**
 * A spiral in several pieces that climbs at one steady grade throughout,
 * easing in at the first piece's start and out at the last one's end: so a
 * stretch of it can carry its own properties (an open edge, a width). Its
 * radius goes from `r0` to `r1` evenly over `degrees`; `cuts` are the
 * degrees (from its start) where one piece ends and the next begins, each
 * piece taking the props of the same index (and `props` all of them).
 * `grade` is the steady rise over run.
 */
export function spiralRun(o: { r0: number; r1: number; degrees: number; grade: number; cuts: number[]; parts?: PieceProps[]; props?: PieceProps }): Piece[] {
  const edges = [0, ...o.cuts, o.degrees];
  const radius = (deg: number) => o.r0 + ((o.r1 - o.r0) * deg) / o.degrees;
  const out: Piece[] = [];
  for (let k = 0; k + 1 < edges.length; k++) {
    const a = edges[k];
    const b = edges[k + 1];
    const ease: SpiralEase = edges.length === 2 ? 'both' : k === 0 ? 'in' : k === edges.length - 2 ? 'out' : 'none';
    const run = (Math.abs(((b - a) * Math.PI) / 180) * (radius(a) + radius(b))) / 2;
    out.push({ ...o.props, ...(o.parts?.[k] ?? {}), spiral: [radius(a), radius(b), b - a, o.grade * run * spiralSpread(ease), ease] });
  }
  return out;
}

/** Drive the pieces. Returns the fine steps, where each piece begins, and the final frame. */
function walk(def: CircuitDef, pieces: Piece[]): { steps: Fine[]; starts: number[]; end: Turtle; heads: V3[] } {
  const T: Turtle = { p: [0, def.height, 0], t: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0] };
  const steps: Fine[] = [];
  const starts: number[] = [];
  const heads: V3[] = [];
  const push = (piece: number, kh: number, kv: number) => steps.push({ p: [...T.p], u: [...T.u], piece, kh, kv });
  const advance = (h: number, lat = 0) => {
    T.p = [T.p[0] + T.t[0] * h + T.r[0] * lat, T.p[1] + T.t[1] * h + T.r[1] * lat, T.p[2] + T.t[2] * h + T.r[2] * lat];
  };
  const fix = () => {
    T.t = norm(T.t);
    T.u = norm(cross(T.r, T.t));
    T.r = norm(cross(T.t, T.u));
  };
  const pitchArc = (i: number, R: number, deg: number, shift = 0) => {
    const a = (deg * Math.PI) / 180;
    const L = R * Math.abs(a);
    const n = Math.max(1, Math.ceil(L / STEP));
    const da = a / n;
    for (let k = 0; k < n; k++) {
      push(i, 0, Math.sign(a) / R);
      T.t = rot(T.t, T.r, da / 2);
      T.u = rot(T.u, T.r, da / 2);
      advance(L / n, shift / n);
      T.t = rot(T.t, T.r, da / 2);
      T.u = rot(T.u, T.r, da / 2);
    }
    fix();
  };
  pieces.forEach((pc, i) => {
    starts.push(steps.length);
    heads.push([...T.t]);
    if ('straight' in pc) {
      const n = Math.max(1, Math.ceil(pc.straight / STEP));
      for (let k = 0; k < n; k++) {
        push(i, 0, 0);
        advance(pc.straight / n);
      }
    } else if ('turn' in pc) {
      if (Math.abs(T.u[1] - 1) > 1e-4) throw new Error(`circuit ${def.id}: piece ${i} turns on a road that is not level`);
      const [R, deg] = pc.turn;
      const a = (deg * Math.PI) / 180;
      const L = R * Math.abs(a);
      const n = Math.max(1, Math.ceil(L / STEP));
      const da = -a / n; // a right turn is clockwise seen from above
      for (let k = 0; k < n; k++) {
        push(i, Math.sign(a) / R, 0);
        T.t = rot(T.t, T.u, da / 2);
        T.r = rot(T.r, T.u, da / 2);
        advance(L / n);
        T.t = rot(T.t, T.u, da / 2);
        T.r = rot(T.r, T.u, da / 2);
      }
      fix();
    } else if ('climb' in pc) {
      const [L, H] = pc.climb;
      if (Math.abs(H) < 1e-9) {
        const n = Math.max(1, Math.ceil(L / STEP));
        for (let k = 0; k < n; k++) {
          push(i, 0, 0);
          advance(L / n);
        }
      } else {
        // Two equal arcs, up then down (or the reverse): an S of exactly H over L.
        const alpha = 2 * Math.atan(Math.abs(H) / L);
        const R = L / (2 * Math.sin(alpha));
        const deg = (alpha * 180) / Math.PI;
        pitchArc(i, R, H > 0 ? deg : -deg);
        pitchArc(i, R, H > 0 ? -deg : deg);
      }
    } else if ('pitch' in pc) {
      pitchArc(i, pc.pitch[0], pc.pitch[1], pc.pitch[2]);
    } else if ('twist' in pc) {
      const [R, deg, rollDeg, shift = 0, out = 0] = pc.twist;
      const a = (deg * Math.PI) / 180;
      const roll = (rollDeg * Math.PI) / 180;
      const sg = Math.sign(a) || 1;
      const t0 = T.t;
      const r0 = T.r;
      const u0 = T.u;
      // The arc's centre: toward the road's up for a pitch nose up, away for nose down.
      const C: V3 = [T.p[0] + u0[0] * sg * R, T.p[1] + u0[1] * sg * R, T.p[2] + u0[2] * sg * R];
      const ease = (f: number) => f - Math.sin(2 * Math.PI * f) / (2 * Math.PI);
      // The road a share f of the way: on the arc (a pitch would carry the
      // frame so), out from it, across, and rolled about its line.
      const at = (f: number) => {
        const ta = rot(t0, r0, a * f);
        const ua = rot(u0, r0, a * f);
        const rad = R + out * ease(f);
        const p: V3 = [C[0] - ua[0] * sg * rad + r0[0] * shift * f, C[1] - ua[1] * sg * rad + r0[1] * shift * f, C[2] - ua[2] * sg * rad + r0[2] * shift * f];
        return { p, t: ta, u: rot(ua, ta, roll * ease(f)), toward: [ua[0] * sg, ua[1] * sg, ua[2] * sg] as V3, rad };
      };
      const n = Math.max(1, Math.ceil(Math.hypot(Math.abs(a) * (R + out / 2), shift) / STEP));
      for (let k = 0; k < n; k++) {
        // The arc's curve, toward its centre, seen from the road: the part
        // along its up holds a mech to it (as a loop's does), the part across
        // it turns it (positive right).
        const mid = at((k + 0.5) / n);
        const right = cross(mid.t, mid.u);
        push(i, dot(mid.toward, right) / mid.rad, dot(mid.toward, mid.u) / mid.rad);
        const nx = at((k + 1) / n);
        T.p = nx.p;
        T.t = nx.t;
        T.u = nx.u;
        T.r = cross(T.t, T.u);
      }
      fix();
    } else if ('spiral' in pc) {
      // (Off level road, or on from the piece before in a run of them.)
      if (Math.abs(T.r[1]) > 1e-4) throw new Error(`circuit ${def.id}: piece ${i} spirals off a road that is banked or rolled`);
      const [r0, r1, deg, H, ease = 'both'] = pc.spiral;
      const a = (deg * Math.PI) / 180;
      const sgn = Math.sign(a);
      // Round the way at the radius each step is at; the climb's grade is
      // steady between the eases (which take SPIRAL_EASE of the way each).
      const run = (Math.abs(a) * (r0 + r1)) / 2;
      const n = Math.max(1, Math.ceil(run / STEP));
      const peak = H / (run * spiralSpread(ease));
      const Y: V3 = [0, 1, 0];
      let h: V3 = norm([T.t[0], 0, T.t[2]]);
      for (let k = 0; k < n; k++) {
        const fm = (k + 0.5) / n;
        const r = r0 + (r1 - r0) * fm;
        const dphi = a / n;
        const dh = r * Math.abs(dphi);
        const g = spiralGrade(fm, peak, ease);
        const hm = rot(h, Y, -dphi / 2);
        T.t = norm([hm[0] + g * Y[0], g, hm[2]]);
        T.r = norm(cross(T.t, Y));
        T.u = norm(cross(T.r, T.t));
        // The pitch's rate of change along the road (toward up: positive as the climb steepens).
        const dg = (spiralGrade((k + 1) / n, peak, ease) - spiralGrade(k / n, peak, ease)) / (dh * Math.sqrt(1 + g * g));
        push(i, sgn / r, dg / (1 + g * g));
        T.p = [T.p[0] + hm[0] * dh, T.p[1] + g * dh, T.p[2] + hm[2] * dh];
        h = rot(h, Y, -dphi);
      }
      // Leaving level (an end that eases), or still climbing into the next piece of the run.
      const gEnd = spiralGrade(1, peak, ease);
      T.t = norm([h[0], gEnd, h[2]]);
      T.r = norm(cross(T.t, [0, 1, 0]));
      T.u = norm(cross(T.r, T.t));
    } else if ('loop' in pc) {
      const [R, shift] = pc.loop;
      const L = 2 * Math.PI * R;
      const n = Math.max(1, Math.ceil(L / STEP));
      const da = (2 * Math.PI) / n;
      for (let k = 0; k < n; k++) {
        push(i, 0, 1 / R);
        T.t = rot(T.t, T.r, da / 2);
        T.u = rot(T.u, T.r, da / 2);
        advance(L / n, shift / n);
        T.t = rot(T.t, T.r, da / 2);
        T.u = rot(T.u, T.r, da / 2);
      }
      fix();
    } else if ('barrel' in pc) {
      const [L, deg, R] = pc.barrel;
      const th = (deg * Math.PI) / 180;
      // The turn so far, a share f of the way along: easing in and out (no
      // turning at either end), so the road leaves its line smoothly.
      const turned = (f: number) => th * (f - Math.sin(2 * Math.PI * f) / (2 * Math.PI));
      const n = Math.max(1, Math.ceil(Math.hypot(L, th * R) / STEP));
      const A: V3 = [T.p[0] + T.u[0] * R, T.p[1] + T.u[1] * R, T.p[2] + T.u[2] * R];
      const r0 = T.r;
      const u0 = T.u;
      for (let k = 0; k < n; k++) {
        // Curvature toward the road's up: toward the axis for a tube, away round a column.
        const dth = Math.abs(turned((k + 1) / n) - turned(k / n));
        const c = dth > 1e-12 ? L / n / dth : Infinity;
        push(i, 0, Number.isFinite(c) ? R / (R * R + c * c) : 0);
        const a = turned((k + 1) / n);
        T.r = rot(r0, T.t, a);
        T.u = rot(u0, T.t, a);
        A[0] += (T.t[0] * L) / n;
        A[1] += (T.t[1] * L) / n;
        A[2] += (T.t[2] * L) / n;
        T.p = [A[0] - T.u[0] * R, A[1] - T.u[1] * R, A[2] - T.u[2] * R];
      }
      fix();
    } else {
      const [L, deg] = pc.roll;
      const n = Math.max(1, Math.ceil(L / STEP));
      const da = ((deg * Math.PI) / 180) / n;
      for (let k = 0; k < n; k++) {
        push(i, 0, 0);
        T.r = rot(T.r, T.t, da / 2);
        T.u = rot(T.u, T.t, da / 2);
        advance(L / n);
        T.r = rot(T.r, T.t, da / 2);
        T.u = rot(T.u, T.t, da / 2);
      }
      fix();
    }
  });
  return { steps, starts, end: T, heads };
}

/** Lengthen two straights and set one climb so the lap closes on itself. */
function closePieces(def: CircuitDef, check = true): Piece[] {
  const pieces: Piece[] = def.pieces.map((p) => ({ ...p }));
  const [ia, ib] = def.closeWith;
  const pa = pieces[ia];
  const pb = pieces[ib];
  const st = pieces[def.settle];
  if (!('straight' in pa) || !('straight' in pb)) throw new Error(`circuit ${def.id}: closeWith must name straights`);
  if (!('climb' in st)) throw new Error(`circuit ${def.id}: settle must name a climb`);
  for (let iter = 0; iter < 4; iter++) {
    const { end, heads } = walk(def, pieces);
    if (iter === 0) {
      if (dot(end.t, [0, 0, -1]) < 0.9999 || dot(end.u, [0, 1, 0]) < 0.9999) {
        throw new Error(`circuit ${def.id}: the pieces do not come back round to the start heading (turns must total 360, climbs, pitches and rolls must cancel)`);
      }
    }
    const ex = end.p[0];
    const ey = end.p[1] - def.height;
    const ez = end.p[2];
    const ha = heads[ia];
    const hb = heads[ib];
    if (Math.abs(ha[1]) > 1e-6 || Math.abs(hb[1]) > 1e-6) throw new Error(`circuit ${def.id}: closeWith straights must be level`);
    const det = ha[0] * hb[2] - ha[2] * hb[0];
    if (Math.abs(det) < 0.05) throw new Error(`circuit ${def.id}: closeWith straights are too close to parallel`);
    // Solve da * ha + db * hb = -(ex, ez) in plan.
    const da = (-ex * hb[2] + ez * hb[0]) / det;
    const db = (-ha[0] * ez + ha[2] * ex) / det;
    (pa as { straight: number }).straight += da;
    (pb as { straight: number }).straight += db;
    const c = (st as { climb: [number, number] }).climb;
    (st as { climb: [number, number] }).climb = [c[0], c[1] - ey];
    if (Math.abs(ex) + Math.abs(ey) + Math.abs(ez) < 1e-6) break;
  }
  const a = (pa as { straight: number }).straight;
  const b = (pb as { straight: number }).straight;
  if (check && (a < 30 || b < 30)) throw new Error(`circuit ${def.id}: closing the lap needs straights of ${a.toFixed(0)} and ${b.toFixed(0)}`);
  return pieces;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function buildCircuit(def: CircuitDef): Track {
  const pieces = closePieces(def);
  const { steps, starts } = walk(def, pieces);

  // Arc length along the fine steps (the last one runs back to the first).
  const m = steps.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = steps[i].p;
    const b = steps[(i + 1) % m].p;
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const total = cum[m];
  const pieceS = starts.map((k) => cum[k]);
  const pieceEnd = (i: number) => (i + 1 < pieces.length ? pieceS[i + 1] : total);

  // Resample every SAMPLE units.
  const n = Math.round(total / SAMPLE);
  const ds = total / n;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const tu: V3[] = new Array(n);
  const pieceOf = new Int32Array(n);
  const khRaw = new Float32Array(n);
  const kvRaw = new Float32Array(n);
  {
    let j = 0;
    for (let k = 0; k < n; k++) {
      const target = k * ds;
      while (j < m - 1 && cum[j + 1] <= target) j++;
      const a = steps[j];
      const b = steps[(j + 1) % m];
      const span = cum[j + 1] - cum[j];
      const f = span > 0 ? (target - cum[j]) / span : 0;
      px[k] = a.p[0] + (b.p[0] - a.p[0]) * f;
      py[k] = a.p[1] + (b.p[1] - a.p[1]) * f;
      pz[k] = a.p[2] + (b.p[2] - a.p[2]) * f;
      tu[k] = norm([a.u[0] + (b.u[0] - a.u[0]) * f, a.u[1] + (b.u[1] - a.u[1]) * f, a.u[2] + (b.u[2] - a.u[2]) * f]);
      pieceOf[k] = a.piece;
      khRaw[k] = a.kh;
      kvRaw[k] = a.kv;
    }
  }

  // Frames: tangent from the samples, up carried from the turtle, banked below.
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const tz = new Float32Array(n);
  const rx = new Float32Array(n);
  const ry = new Float32Array(n);
  const rz = new Float32Array(n);
  const ux = new Float32Array(n);
  const uy = new Float32Array(n);
  const uz = new Float32Array(n);
  let kappa = smoothRing(khRaw, 3, 2);
  const kv = smoothRing(kvRaw, 2, 1);
  const bankRaw = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const pc = pieces[pieceOf[k]];
    if ('turn' in pc || 'spiral' in pc) {
      const dir = Math.sign('turn' in pc ? pc.turn[1] : pc.spiral[2]);
      bankRaw[k] = pc.bank !== undefined ? (dir * pc.bank * Math.PI) / 180 : clamp(khRaw[k] * def.bankGain, -def.maxBank, def.maxBank);
    }
  }
  const bank = smoothRing(bankRaw, 12, 2);
  const upY = new Float32Array(n);
  const grip = new Float32Array(n);
  const mag = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const a = (k - 1 + n) % n;
    const b = (k + 1) % n;
    const t = norm([px[b] - px[a], py[b] - py[a], pz[b] - pz[a]]);
    let u = tu[k];
    const d = dot(u, t);
    u = norm([u[0] - d * t[0], u[1] - d * t[1], u[2] - d * t[2]]);
    const r = cross(t, u);
    const c = Math.cos(bank[k]);
    const s = Math.sin(bank[k]);
    tx[k] = t[0];
    ty[k] = t[1];
    tz[k] = t[2];
    rx[k] = r[0] * c - u[0] * s;
    ry[k] = r[1] * c - u[1] * s;
    rz[k] = r[2] * c - u[2] * s;
    ux[k] = u[0] * c + r[0] * s;
    uy[k] = u[1] * c + r[1] * s;
    uz[k] = u[2] * c + r[2] * s;
    upY[k] = uy[k];
    const inward = Math.abs(kappa[k]) > 1e-5 && Math.sign(kappa[k]) === Math.sign(bank[k]);
    grip[k] = 1 + (inward ? BANK_GRIP * Math.sin(Math.abs(bank[k])) : 0);
  }

  // Rolled road (barrels and twists): the bend a mech steers by is the
  // road's own turn within its surface, worked out from the frames just
  // built, not the plan's. A barrel's plan has none, but its road swings
  // out round its column or tube and back; a twist's turns the right way
  // but misses the kink where it joins the road either side. (Turns and
  // spirals keep the plan's: a banked turn is steered as the turn it is.)
  {
    const raw = Float32Array.from(khRaw);
    const near = 3;
    for (let k = 0; k < n; k++) {
      let rolled = false;
      for (let q = -near; q <= near && !rolled; q++) {
        const kind = kindOf(pieces[pieceOf[(k + q + n) % n]]);
        rolled = kind === 'barrel' || kind === 'twist';
      }
      const own = kindOf(pieces[pieceOf[k]]);
      if (!rolled || own === 'turn' || own === 'spiral') continue;
      const a = (k - 1 + n) % n;
      const b = (k + 1) % n;
      raw[k] = ((tx[b] - tx[a]) * rx[k] + (ty[b] - ty[a]) * ry[k] + (tz[b] - tz[a]) * rz[k]) / (2 * ds);
    }
    kappa = smoothRing(raw, 3, 2);
    for (let k = 0; k < n; k++) {
      const inward = Math.abs(kappa[k]) > 1e-5 && Math.sign(kappa[k]) === Math.sign(bank[k]);
      grip[k] = 1 + (inward ? BANK_GRIP * Math.sin(Math.abs(bank[k])) : 0);
    }
  }
  // ...and round them the skates' hold grips as hard as that bend needs for
  // any frame to follow it at HOLD_TURN_SPEED (with a margin). Only the grip:
  // how fast a frame can swing round is its own (turnMax), so the tightest
  // of it, at full speed, is a stretch for the heavier frames.
  const hold = new Float32Array(n).fill(1);
  {
    const gripMin = Math.min(...CLASSES.map((c) => c.grip));
    const holdRaw = new Float32Array(n).fill(1);
    for (let k = 0; k < n; k++) {
      const kind = kindOf(pieces[pieceOf[k]]);
      if (kind !== 'barrel' && kind !== 'twist') continue;
      holdRaw[k] = Math.max(1, (HOLD_TURN_SPEED * HOLD_TURN_SPEED * Math.abs(kappa[k]) * 1.15) / (gripMin * grip[k]));
    }
    // Eased in and out over a little road either side.
    const eased = smoothRing(holdRaw, 4, 2);
    for (let k = 0; k < n; k++) hold[k] = Math.max(1, eased[k], holdRaw[k]);
  }

  // Width, gaps, open edges.
  const hwRaw = new Float32Array(n);
  const roadL = new Uint8Array(n);
  const roadR = new Uint8Array(n);
  const wallL = new Uint8Array(n);
  const wallR = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const pc = pieces[pieceOf[k]];
    hwRaw[k] = pc.width ?? def.halfWidth;
    roadL[k] = pc.gap === true || pc.gap === 'left' ? 0 : 1;
    roadR[k] = pc.gap === true || pc.gap === 'right' ? 0 : 1;
    wallL[k] = roadL[k] && pc.open !== 'left' && pc.open !== 'both' ? 1 : 0;
    wallR[k] = roadR[k] && pc.open !== 'right' && pc.open !== 'both' ? 1 : 0;
    // The skates grip the rail through loops, corkscrews, twists, anything
    // steeper than about 60 degrees and anything that says so; where there
    // is no road there is no rail (a gap in road going straight down is a
    // fall along it, not off it).
    const kind = kindOf(pc);
    mag[k] = (kind === 'loop' || kind === 'roll' || kind === 'barrel' || kind === 'twist' || pc.hold || upY[k] < 0.5) && roadL[k] && roadR[k] ? 1 : 0;
  }
  const hw = smoothRing(hwRaw, 6, 2);

  // Forks: consecutive pieces sharing an id.
  const median = new Float32Array(n);
  const shiftL = new Float32Array(n);
  const riseL = new Float32Array(n);
  const shiftR = new Float32Array(n);
  const riseR = new Float32Array(n);
  const forkSpans: Array<{ spec: ForkSpec; s0: number; s1: number }> = [];
  for (let i = 0; i < pieces.length; i++) {
    const f = pieces[i].fork;
    if (!f) continue;
    const last = forkSpans[forkSpans.length - 1];
    if (last && last.spec.id === f.id && Math.abs(last.s1 - pieceS[i]) < 1e-6) last.s1 = pieceEnd(i);
    else forkSpans.push({ spec: f, s0: pieceS[i], s1: pieceEnd(i) });
  }
  const OPEN = 60;
  for (const fs of forkSpans) {
    const len = fs.s1 - fs.s0;
    const braid = fs.spec.braid;
    if (braid) {
      // Out to the helix's radius as the wall down the middle comes up, round
      // it (the turning easing in and out), and back in as the wall goes.
      const a = fs.s0 + OPEN;
      const b = fs.s1 - OPEN;
      for (let k = 0; k < n; k++) {
        const s = k * ds;
        if (s < fs.s0 || s > fs.s1) continue;
        const open = smoothstep(fs.s0, fs.s0 + OPEN, s) * (1 - smoothstep(fs.s1 - OPEN, fs.s1, s));
        median[k] = Math.max(median[k], fs.spec.median * open);
        const out = smoothstep(fs.s0 + OPEN * 0.5, a + 60, s) * (1 - smoothstep(b - 60, fs.s1 - OPEN * 0.5, s));
        const f = clamp((s - a) / Math.max(b - a, 1), 0, 1);
        const th = 2 * Math.PI * braid.turns * (f - Math.sin(2 * Math.PI * f) / (2 * Math.PI));
        // Each route's middle, side by side where the routes open (half way
        // across its lane), out on the helix in between.
        const mid = (hw[k] + median[k]) / 2;
        const rho = mid + (braid.radius - mid) * out;
        shiftL[k] = mid - rho * Math.cos(th);
        riseL[k] = -rho * Math.sin(th) * out;
        shiftR[k] = rho * Math.cos(th) - mid;
        riseR[k] = rho * Math.sin(th) * out;
      }
      continue;
    }
    // Routes that cross over and under each other (each drawn toward the
    // other's side) part vertically first, while still side by side, and
    // only swing across once the upper one is high enough to clear a mech
    // on the lower (rising and swinging together, the decks met with 5
    // units between them and the mechs below drove through the one above).
    const crossing = (fs.spec.left?.shift ?? 0) > 0 || (fs.spec.right?.shift ?? 0) < 0;
    // A carried fork parts as it always has. A steered one parts as gently
    // as it has room for: no tighter than ROUTE_BEND_RADIUS (a smoothstep
    // across S over L bends at most 6 S / L^2), short of a stretch of
    // ROUTE_APART fully apart in the middle.
    const S = Math.max(Math.abs(fs.spec.left?.shift ?? 0), Math.abs(fs.spec.right?.shift ?? 0));
    const gentle = Math.sqrt(6 * S * ROUTE_BEND_RADIUS);
    const room = len / 2 - OPEN - ROUTE_APART / 2;
    const ramp = fs.spec.carried ? clamp((len - 2 * OPEN) / (crossing ? 2.7 : 2), 0, 170) : clamp(gentle, 0, room);
    for (let k = 0; k < n; k++) {
      const s = k * ds;
      if (s < fs.s0 || s > fs.s1) continue;
      const open = smoothstep(fs.s0, fs.s0 + OPEN, s) * (1 - smoothstep(fs.s1 - OPEN, fs.s1, s));
      median[k] = Math.max(median[k], fs.spec.median * open);
      let across = 0;
      let up = 0;
      if (ramp > 0 && !crossing) {
        across = up = smoothstep(fs.s0 + OPEN, fs.s0 + OPEN + ramp, s) * (1 - smoothstep(fs.s1 - OPEN - ramp, fs.s1 - OPEN, s));
      } else if (ramp > 0 && fs.spec.carried) {
        up = smoothstep(fs.s0 + 20, fs.s0 + OPEN + 0.7 * ramp, s) * (1 - smoothstep(fs.s1 - OPEN - 0.7 * ramp, fs.s1 - 20, s));
        across = smoothstep(fs.s0 + OPEN + 0.35 * ramp, fs.s0 + OPEN + 1.35 * ramp, s) * (1 - smoothstep(fs.s1 - OPEN - 1.35 * ramp, fs.s1 - OPEN - 0.35 * ramp, s));
      } else if (ramp > 0) {
        // Steered and crossing: across over the whole ramp, and up a good
        // deal sooner, so that where the decks first overlap (about a fifth
        // of the way across) the upper one is already well clear of a mech
        // on the lower.
        up = smoothstep(fs.s0 + 20, fs.s0 + OPEN + 0.45 * ramp, s) * (1 - smoothstep(fs.s1 - OPEN - 0.45 * ramp, fs.s1 - 20, s));
        across = smoothstep(fs.s0 + OPEN, fs.s0 + OPEN + ramp, s) * (1 - smoothstep(fs.s1 - OPEN - ramp, fs.s1 - OPEN, s));
      }
      shiftL[k] = (fs.spec.left?.shift ?? 0) * across;
      riseL[k] = (fs.spec.left?.rise ?? 0) * up;
      shiftR[k] = (fs.spec.right?.shift ?? 0) * across;
      riseR[k] = (fs.spec.right?.rise ?? 0) * up;
    }
  }

  // Steered forks: how fast each route moves across as it goes (its slope
  // off the road's line) and how its heading turns (its own bend, over the
  // road's), for the sim to move and steer a mech by its route.
  const slopeL = new Float32Array(n);
  const slopeR = new Float32Array(n);
  const bendL = new Float32Array(n);
  const bendR = new Float32Array(n);
  for (const fs of forkSpans) {
    if (fs.spec.carried) continue;
    const k0 = Math.floor(fs.s0 / ds);
    const k1 = Math.ceil(fs.s1 / ds);
    for (const [shift, slope, bend] of [
      [shiftL, slopeL, bendL],
      [shiftR, slopeR, bendR],
    ] as const) {
      for (let k = k0; k <= k1; k++) {
        const j = (k + n) % n;
        slope[j] = (shift[(j + 1) % n] - shift[(j - 1 + n) % n]) / (2 * ds);
      }
      for (let k = k0; k <= k1; k++) {
        const j = (k + n) % n;
        bend[j] = (Math.atan(slope[(j + 1) % n]) - Math.atan(slope[(j - 1 + n) % n])) / (2 * ds);
      }
    }
  }

  // Racing line and braking look-ahead, as on a plan track, with banking's
  // extra grip taken off the curvature a pilot has to respect.
  const wide = smoothRing(kappa, 36, 2);
  const line = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const maxOff = Math.max(0, hw[k] - 7);
    line[k] = clamp(wide[(k + 14) % n] * 7000, -maxOff, maxOff);
  }
  const kappaAhead = new Float32Array(n);
  const look = Math.round(220 / ds);
  for (let k = 0; k < n; k++) {
    let mx = 0;
    for (let q = 0; q < look; q += 2) {
      const j = (k + q) % n;
      mx = Math.max(mx, Math.abs(kappa[j]) / grip[j]);
    }
    kappaAhead[k] = mx;
  }

  const place = (at: number, piece?: number): number => (piece === undefined ? at * total : pieceS[piece] + at * (pieceEnd(piece) - pieceS[piece]));
  const strips: Strip[] = def.strips.map((sd) => {
    const s0 = place(sd.at, sd.piece);
    return { s0, s1: s0 + sd.len, d: sd.d, halfW: sd.halfW };
  });
  const gates: Gate[] = (def.gates ?? []).slice(0, 30).map((g) => ({ s: place(g.at, g.piece), d: g.d, halfW: g.halfW }));
  const pads: Pad[] = (def.pads ?? []).map((pd) => {
    const s0 = place(pd.at, pd.piece);
    return { s0, s1: s0 + pd.len, d: pd.d, halfW: pd.halfW };
  });

  const forks: Fork[] = forkSpans.map((fs) => {
    const route = (side: number): Route => {
      const inSpan = (s: number) => s >= fs.s0 && s <= fs.s1;
      let jumpGap = false;
      for (let k = Math.floor(fs.s0 / ds); k <= Math.min(n - 1, Math.ceil(fs.s1 / ds)); k++) {
        if ((side < 0 ? roadL : roadR)[k] === 0) jumpGap = true;
      }
      return {
        strips: strips.filter((st) => inSpan(st.s0) && Math.sign(st.d) === side).length,
        gates: gates.filter((g) => inSpan(g.s) && Math.sign(g.d) === side).length,
        pads: pads.filter((p) => inSpan(p.s0) && Math.sign(p.d) === side).length,
        jump: jumpGap,
      };
    };
    return { s0: fs.s0, s1: fs.s1, median: fs.spec.median, left: route(-1), right: route(1), carried: !!fs.spec.carried };
  });

  let minHw = Infinity;
  let maxHw = 0;
  for (let k = 0; k < n; k++) {
    minHw = Math.min(minHw, hw[k]);
    maxHw = Math.max(maxHw, hw[k]);
  }

  return {
    def,
    length: total,
    halfWidth: def.halfWidth,
    n,
    ds,
    px,
    py,
    pz,
    tx,
    ty,
    tz,
    rx,
    ry,
    rz,
    ux,
    uy,
    uz,
    kappa,
    bank,
    line,
    kappaAhead,
    strips,
    gates,
    hw,
    roadL,
    roadR,
    wallL,
    wallR,
    median,
    shiftL,
    slopeL,
    slopeR,
    bendL,
    bendR,
    riseL,
    shiftR,
    riseR,
    kv,
    upY,
    mag,
    grip,
    hold,
    pads,
    forks,
    air: true,
    minHw,
    maxHw,
  };
}

/** For designing: the plan of the lap as written, before it is closed (every 10th step). */
export function rawPlan(def: CircuitDef): Array<[number, number, number, number]> {
  const { steps } = walk(def, def.pieces);
  return steps.filter((_, i) => i % 10 === 0).map((st) => [st.p[0], st.p[1], st.p[2], st.piece]);
}

/** For designing: the lengths the closing straights and the settling climb would need. */
export function closure(def: CircuitDef): { a: number; b: number; settle: number } {
  const p = closePieces(def, false);
  return { a: (p[def.closeWith[0]] as { straight: number }).straight, b: (p[def.closeWith[1]] as { straight: number }).straight, settle: (p[def.settle] as { climb: [number, number] }).climb[1] };
}

/** Where each piece starts along the lap, for placing things and for tests. */
export function pieceStarts(def: CircuitDef): number[] {
  const pieces = closePieces(def);
  const { steps, starts } = walk(def, pieces);
  const out: number[] = [];
  let acc = 0;
  let k = 0;
  for (let i = 0; i < steps.length && k < starts.length; i++) {
    while (k < starts.length && starts[k] === i) {
      out.push(acc);
      k++;
    }
    const a = steps[i].p;
    const b = steps[(i + 1) % steps.length].p;
    acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return out;
}

registerCircuitBuilder(buildCircuit);

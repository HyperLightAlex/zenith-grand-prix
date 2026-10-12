// Circuits in three dimensions.
//
// A CircuitDef is driven like a turtle: a run of pieces, each a straight, a
// level turn, a climb, a pitch (the parts of a jump), a loop or a corkscrew
// roll, starting at the start line facing -z. The builder carries a full
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

import { GRAVITY } from './config';
import { clamp } from './math';
import { registerCircuitBuilder, smoothRing, type Fork, type Gate, type GateDef, type Pad, type Route, type Strip, type StripDef, type Track } from './track';

/** Grip gained in a turn per unit of sin(bank) toward its inside. */
export const BANK_GRIP = 1.2;
const STEP = 0.5;
const SAMPLE = 4;

export interface ForkSpec {
  /** Pieces carrying the same id, one after another, form one fork. */
  id: string;
  /** Half width of the wall down the middle. */
  median: number;
  /** Drawing only: each route moved across (positive right) and up at full spread. */
  left?: { shift: number; rise: number };
  right?: { shift: number; rise: number };
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
    /** A vertical arc: radius and degrees, positive nose up. */
    | { pitch: [radius: number, degrees: number] }
    /** A full loop of this radius, moving `shift` to the right on the way round so it clears itself. */
    | { loop: [radius: number, shift: number] }
    /** A corkscrew: this length of straight rolled through the angle, positive rolling right. */
    | { roll: [length: number, degrees: number] }
  );

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
 * a landing slope and a run-out back to level. Faster than `speed` flies
 * longer and lands further down the slope; slower falls into the gap.
 */
export function jump(o: { ramp: number; speed: number; gap?: number; land?: number; side?: 'left' | 'right'; props?: PieceProps }): Piece[] {
  const gap = o.gap ?? 0.7;
  const arc = o.ramp * 2;
  const crest = (o.speed * o.speed) / GRAVITY;
  const lip = (arc * (1 - gap)) / 2;
  const p = o.props ?? {};
  return [
    { ...p, pitch: [crest * 0.6, o.ramp], name: 'ramp' },
    { ...p, pitch: [crest, -lip], name: 'lip' },
    { ...p, pitch: [crest, -arc * gap], gap: o.side ?? true, name: 'gap' },
    { ...p, pitch: [crest, -lip], name: 'landing' },
    { ...p, straight: o.land ?? 120, name: 'landing slope' },
    { ...p, pitch: [crest * 1.4, o.ramp], name: 'run-out' },
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
  return 'straight' in pc ? 'straight' : 'turn' in pc ? 'turn' : 'climb' in pc ? 'climb' : 'pitch' in pc ? 'pitch' : 'loop' in pc ? 'loop' : 'roll';
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
  const pitchArc = (i: number, R: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    const L = R * Math.abs(a);
    const n = Math.max(1, Math.ceil(L / STEP));
    const da = a / n;
    for (let k = 0; k < n; k++) {
      push(i, 0, Math.sign(a) / R);
      T.t = rot(T.t, T.r, da / 2);
      T.u = rot(T.u, T.r, da / 2);
      advance(L / n);
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
      pitchArc(i, pc.pitch[0], pc.pitch[1]);
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
  const kappa = smoothRing(khRaw, 3, 2);
  const kv = smoothRing(kvRaw, 2, 1);
  const bankRaw = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const pc = pieces[pieceOf[k]];
    if ('turn' in pc) {
      const dir = Math.sign(pc.turn[1]);
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
    const kind = kindOf(pieces[pieceOf[k]]);
    mag[k] = kind === 'loop' || kind === 'roll' || upY[k] < 0.5 ? 1 : 0;
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
    const ramp = clamp((len - 2 * OPEN) / 2, 0, 170);
    for (let k = 0; k < n; k++) {
      const s = k * ds;
      if (s < fs.s0 || s > fs.s1) continue;
      const open = smoothstep(fs.s0, fs.s0 + OPEN, s) * (1 - smoothstep(fs.s1 - OPEN, fs.s1, s));
      median[k] = Math.max(median[k], fs.spec.median * open);
      const e = ramp > 0 ? smoothstep(fs.s0 + OPEN, fs.s0 + OPEN + ramp, s) * (1 - smoothstep(fs.s1 - OPEN - ramp, fs.s1 - OPEN, s)) : 0;
      shiftL[k] = (fs.spec.left?.shift ?? 0) * e;
      riseL[k] = (fs.spec.left?.rise ?? 0) * e;
      shiftR[k] = (fs.spec.right?.shift ?? 0) * e;
      riseR[k] = (fs.spec.right?.rise ?? 0) * e;
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
    return { s0: fs.s0, s1: fs.s1, median: fs.spec.median, left: route(-1), right: route(1) };
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
    riseL,
    shiftR,
    riseR,
    kv,
    upY,
    mag,
    grip,
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

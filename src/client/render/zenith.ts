// Zenith Ring's station, in the plain look, built round the road from the
// circuit's own measures (sim/tracks/zenith.ts): the Ring (its band, the
// road up its inner face and down its outer face, its rims, spokes and hub),
// the spine from the hub to the core and the core the Möbius loops round, the
// Mass Driver's keel and coils, the docking ring over its jump, the docking
// module the road runs through and over, the solar arrays under the Solar
// Wings, and the paddock by the line. Everything is checked against the
// space the road needs (titan/keepout.ts) and left out where it would stand
// in it: the Ring's band opens where the road comes in through its foot,
// rolls through it at the top and rolls out from under it.
//
// With the painted background (the anime look), each kind of surface takes
// its painting (Z4: plating, gold foil, solar cells, radiators, machinery,
// the band's windowed face), and things far off in orbit (Z3) hang in the
// sky round it. A stand-in until the station has a model of its own.
import * as THREE from 'three';
import { alsoWears } from './owned';
import { moves } from './still';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pieceStarts, type CircuitDef } from '../../sim/circuit';
import { frameAt, makeFrame, type Track } from '../../sim/track';
import { MOBIUS, RING } from '../../sim/tracks/zenith';
import { paintedCardMaterial, paintedSurfaceMaterial, paintedTexture, paintedTrack, type PaintedSet } from './painted';
import { toonMaterial } from './palette';
import { KEEP_OUT } from './titan/keepout';
import { trackMatrix, trackPoint } from './trackSpace';

/** What the world builder hands over (world.ts's context has all of it). */
export interface StationCtx {
  track: Track;
  group: THREE.Group;
  inRoad(g: THREE.BufferGeometry, step?: number): boolean;
  updates: Array<(time: number, camera: THREE.Camera) => void>;
  /** The painted background, if there is one, and the switch between it and the plain look. */
  painted: PaintedSet | null;
  paintedOnly: THREE.Object3D[];
  swaps: Array<(painted: boolean) => void>;
}

const f = makeFrame();
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Where the stretch called `name` runs along the lap: [start, end). */
function rangeOf(track: Track, starts: number[], name: string): [number, number] | null {
  const def = track.def as CircuitDef;
  const i = def.pieces.findIndex((p) => p.name === name);
  if (i < 0) return null;
  return [starts[i], i + 1 < starts.length ? starts[i + 1] : track.length];
}

/** The road's frame at s, as vectors: where, forward, right, up. */
function frameVecs(track: Track, s: number): { p: THREE.Vector3; t: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3 } {
  frameAt(track, s, f);
  return { p: v3(f.px, f.py, f.pz), t: v3(f.tx, f.ty, f.tz), r: v3(f.rx, f.ry, f.rz), u: v3(f.ux, f.uy, f.uz) };
}

/** A point off the centreline at s (no fork's routes: across and up from the middle). */
function plainPoint(track: Track, s: number, d: number, h: number): THREE.Vector3 {
  frameAt(track, s, f);
  return v3(f.px + f.rx * d + f.ux * h, f.py + f.ry * d + f.uy * h, f.pz + f.rz * d + f.uz * h);
}

/**
 * The Ring as the road lays it: its centre, its axis (the road's right where
 * it comes in), and the two directions across its plane (down to where the
 * road comes in, and forward); the band reaches from `a0` to `a1` along the
 * axis from the road's line where it comes in.
 */
export interface RingFrame {
  centre: THREE.Vector3;
  axis: THREE.Vector3;
  down: THREE.Vector3;
  fwd: THREE.Vector3;
  a0: number;
  a1: number;
}

/** Past the road's widest lane, the band's edge each side (the rims stand there). */
const BAND_MARGIN = 54;

export function ringFrame(track: Track, starts: number[]): RingFrame | null {
  const r = rangeOf(track, starts, 'up the inside');
  if (!r) return null;
  // The way the road faces on the straight into it (on the Ring its frame
  // leans a little with its drift across the band).
  const { p } = frameVecs(track, r[0]);
  const { t, r: right, u } = frameVecs(track, r[0] - 20);
  return { centre: p.clone().addScaledVector(u, RING.radius), axis: right, down: u.clone().negate(), fwd: t, a0: -BAND_MARGIN, a1: RING.across + BAND_MARGIN };
}

/** A point of the Ring: `deg` round from where the road comes in (the way it goes), `rad` out from its centre, `a` along its axis. */
function ringPoint(rf: RingFrame, deg: number, rad: number, a: number): THREE.Vector3 {
  const th = (deg * Math.PI) / 180;
  return rf.centre.clone().addScaledVector(rf.axis, a).addScaledVector(rf.down, Math.cos(th) * rad).addScaledVector(rf.fwd, Math.sin(th) * rad);
}

// ---- geometry --------------------------------------------------------------------

/** A closed solid of eight corners (0-3 round one end, 4-7 round the other, in the same order), faces turned outward. Non-indexed, flat normals. */
function solid(c: THREE.Vector3[]): THREE.BufferGeometry {
  const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const mid = v3();
  for (const p of c) mid.add(p);
  mid.multiplyScalar(1 / c.length);
  const pos: number[] = [];
  const e1 = v3(), e2 = v3(), n = v3(), fc = v3();
  for (const q of faces) {
    const [a, b, cc, d] = q.map((k) => c[k]);
    e1.subVectors(b, a);
    e2.subVectors(cc, a);
    n.crossVectors(e1, e2);
    fc.copy(a).add(b).add(cc).add(d).multiplyScalar(0.25).sub(mid);
    const tris = n.dot(fc) >= 0 ? [a, b, cc, a, cc, d] : [a, cc, b, a, d, cc];
    for (const p of tris) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A cylinder from a to b, `r` round (non-indexed, capped). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 16, r2 = r): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r2, r, Math.max(len, 0.01), sides, 1, false).toNonIndexed();
  g.deleteAttribute('uv');
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir);
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  g.computeVertexNormals();
  return g;
}

/** A box beam from a to b, `w` by `h` across (its h along `up` where it can). */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, up = v3(0, 1, 0)): THREE.BufferGeometry {
  const t = b.clone().sub(a).normalize();
  let side = v3().crossVectors(t, up);
  if (side.lengthSq() < 1e-6) side = v3().crossVectors(t, v3(1, 0, 0));
  side.normalize();
  const upr = v3().crossVectors(side, t).normalize();
  const corners: THREE.Vector3[] = [];
  for (const end of [a, b]) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) corners.push(end.clone().addScaledVector(side, (sx * w) / 2).addScaledVector(upr, (sy * h) / 2));
  }
  return solid(corners);
}

/** A ring (torus) round `centre`, its hole along `axis`. */
function hoop(centre: THREE.Vector3, axis: THREE.Vector3, radius: number, tube: number, seg = 64, sides = 8): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, tube, sides, seg).toNonIndexed();
  g.deleteAttribute('uv');
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), axis.clone().normalize()));
  g.translate(centre.x, centre.y, centre.z);
  g.computeVertexNormals();
  return g;
}

/** A flat panel: centre, its two half-extent vectors, and a thickness along their normal. */
function panel(c: THREE.Vector3, ex: THREE.Vector3, ey: THREE.Vector3, thick: number): THREE.BufferGeometry {
  const n = v3().crossVectors(ex, ey).normalize().multiplyScalar(thick / 2);
  const corners: THREE.Vector3[] = [];
  for (const k of [-1, 1]) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) corners.push(c.clone().addScaledVector(ex, sx).addScaledVector(ey, sy).addScaledVector(n, k));
  return solid(corners);
}

/** One colour on every vertex. */
function colour(g: THREE.BufferGeometry, c: number | THREE.Color): THREE.BufferGeometry {
  const col = c instanceof THREE.Color ? c : new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = col.r;
    a[i * 3 + 1] = col.g;
    a[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * A section swept along the road from s0 to s1: `section(s)` gives its
 * outline as points across and up in the road's frame (no fork's routes),
 * or null to leave a break; closed round.
 */
function sweep(track: Track, s0: number, s1: number, step: number, section: (s: number) => Array<[number, number]> | null): THREE.BufferGeometry | null {
  const rows: Array<THREE.Vector3[] | null> = [];
  for (let s = s0; s <= s1 + 1e-6; s += step) {
    const sec = section(Math.min(s, s1));
    rows.push(sec ? sec.map(([d, h]) => plainPoint(track, Math.min(s, s1), d, h)) : null);
  }
  const pos: number[] = [];
  for (let k = 0; k + 1 < rows.length; k++) {
    const a = rows[k];
    const b = rows[k + 1];
    if (!a || !b || a.length !== b.length) continue;
    for (let q = 0; q < a.length; q++) {
      const q2 = (q + 1) % a.length;
      for (const p of [a[q], b[q], b[q2], a[q], b[q2], a[q2]]) pos.push(p.x, p.y, p.z);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---- materials ---------------------------------------------------------------------

const HULL = 0xdfe4ec;
const HULL_DARK = 0x9aa4b4;
const HULL_SEAM = 0x7a8496;
const FOIL = 0xd9a441;
const STRIPE = 0xff7a2a;
const RADIATOR = 0xf2f4f7;
const SOLAR = 0x1b2c5c;
const SOLAR_FRAME = 0x8a93a6;

/**
 * The station's kinds of surface: each a mesh, and with the painted
 * background its painting (Z4) and how many units one repeat of it covers.
 * Trim keeps its plain colour either way.
 */
type Kind = 'plating' | 'foil' | 'solar' | 'radiator' | 'machinery' | 'band' | 'trim';
const REPEAT: Record<Exclude<Kind, 'trim'>, number> = { plating: 24, foil: 16, solar: 9, radiator: 14, machinery: 12, band: 18 };

/** The coils' glow: a pulse running down the Mass Driver, coil after coil. */
function coilMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float phase;
      varying float vPhase;
      void main() {
        vPhase = phase;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying float vPhase;
      void main() {
        float p = fract(vPhase - uTime * 0.8);
        float b = 0.3 + 0.7 * pow(1.0 - p, 5.0);
        gl_FragColor = vec4(mix(vec3(0.04, 0.3, 0.55), vec3(0.55, 1.2, 1.3), b), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---- the station -------------------------------------------------------------------

export function buildZenith(ctx: StationCtx): void {
  const { track, group } = ctx;
  const def = track.def as CircuitDef;
  if (!('pieces' in def)) return;
  const starts = pieceStarts(def);
  const range = (name: string) => rangeOf(track, starts, name);
  const rnd = mulberry(9101);

  const parts: Record<Kind, THREE.BufferGeometry[]> = { plating: [], foil: [], solar: [], radiator: [], machinery: [], band: [], trim: [] };
  const glow: THREE.BufferGeometry[] = [];
  /** Keep a piece (of a kind of surface, or a light) unless it stands in the road's space. */
  const keep = (kind: Kind | 'glow', g: THREE.BufferGeometry | null, c: number | THREE.Color, step = 3): boolean => {
    if (!g) return false;
    if (ctx.inRoad(g, step)) return false;
    (kind === 'glow' ? glow : parts[kind]).push(colour(g, c));
    return true;
  };

  // ---- the Ring ----
  const rf = ringFrame(track, starts);
  if (rf) {
    const R = RING.radius;
    const B = RING.band;
    const STEP = 2.5;
    const LANES = 16;
    const lane = (rf.a1 - rf.a0) / LANES;
    const shade = new THREE.Color();
    for (let deg = 0; deg < 360; deg += STEP) {
      for (let k = 0; k < LANES; k++) {
        const a0 = rf.a0 + k * lane;
        const a1 = a0 + lane;
        // Between the road's two faces: under the deck going up the inside,
        // under it coming down the outside.
        const c = [
          ringPoint(rf, deg, R + 1, a0), ringPoint(rf, deg, R + B - 1, a0), ringPoint(rf, deg, R + B - 1, a1), ringPoint(rf, deg, R + 1, a1),
          ringPoint(rf, deg + STEP, R + 1, a0), ringPoint(rf, deg + STEP, R + B - 1, a0), ringPoint(rf, deg + STEP, R + B - 1, a1), ringPoint(rf, deg + STEP, R + 1, a1),
        ];
        const tile = solid(c);
        // Plating, a seam every 15 degrees, the outermost lanes darker, a
        // run of gold foil here and there.
        const seam = Math.round(deg / STEP) % 6 === 0;
        const foil = (Math.floor(deg / 30) * 5 + k) % 11 === 3;
        shade.set(seam ? HULL_SEAM : foil ? FOIL : k === 0 || k === LANES - 1 ? HULL_DARK : HULL).multiplyScalar(0.96 + rnd() * 0.04);
        // (Finely, where the road rolls through the band at the top.)
        keep(seam ? 'plating' : foil ? 'foil' : k === 0 || k === LANES - 1 ? 'machinery' : 'band', tile, shade, deg > 140 && deg < 220 ? 1 : 3);
      }
      // The rims along the band's edges, standing in past its inner face, a
      // band of lit windows along each.
      for (const [a, out] of [[rf.a0, -1], [rf.a1, 1]] as const) {
        const rim = solid([
          ringPoint(rf, deg, R - 18, a), ringPoint(rf, deg, R + B + 3, a), ringPoint(rf, deg, R + B + 3, a + out * 5), ringPoint(rf, deg, R - 18, a + out * 5),
          ringPoint(rf, deg + STEP, R - 18, a), ringPoint(rf, deg + STEP, R + B + 3, a), ringPoint(rf, deg + STEP, R + B + 3, a + out * 5), ringPoint(rf, deg + STEP, R - 18, a + out * 5),
        ]);
        if (keep('plating', rim, deg % 30 < STEP ? HULL_SEAM : HULL_DARK)) {
          for (const side of [-0.3, 5.3]) {
            const ax = a + out * side;
            const lit = (Math.floor(deg / STEP) * 7 + (out > 0 ? 3 : 0)) % 5 !== 0;
            if (!lit) continue;
            keep('glow', solid([
              ringPoint(rf, deg + 0.3, R - 12, ax), ringPoint(rf, deg + 0.3, R - 8, ax), ringPoint(rf, deg + 0.3, R - 8, ax + out * 0.2), ringPoint(rf, deg + 0.3, R - 12, ax + out * 0.2),
              ringPoint(rf, deg + STEP - 0.3, R - 12, ax), ringPoint(rf, deg + STEP - 0.3, R - 8, ax), ringPoint(rf, deg + STEP - 0.3, R - 8, ax + out * 0.2), ringPoint(rf, deg + STEP - 0.3, R - 12, ax + out * 0.2),
            ]), 0xffd89a);
          }
        }
      }
    }
    // The hub on the axle, and the spokes out to the rims.
    const HUB = 44;
    const hubA0 = rf.a0 - 70;
    const hubA1 = rf.a1 + 70;
    const at = (a: number) => rf.centre.clone().addScaledVector(rf.axis, a);
    keep('plating', rod(at(hubA0), at(hubA1), HUB, 24), HULL);
    for (const a of [hubA0 + 12, rf.a0 - 10, rf.a1 + 10, hubA1 - 12]) keep('machinery', rod(at(a - 4), at(a + 4), HUB + 5, 24), HULL_SEAM);
    keep('glow', rod(at((hubA0 + hubA1) / 2 - 1.5), at((hubA0 + hubA1) / 2 + 1.5), HUB + 1, 24), 0x7ff4ff);
    // A docking port on its far end.
    keep('machinery', rod(at(hubA0 - 50), at(hubA0), 22, 16, 30), HULL_DARK);
    keep('glow', hoop(at(hubA0 - 50), rf.axis, 24, 1.2, 32, 6), 0x7ff4ff);
    for (const deg of [45, 135, 225, 315]) {
      for (const a of [rf.a0 + 2.5, rf.a1 - 2.5]) {
        keep('machinery', beam(ringPoint(rf, deg, HUB, a), ringPoint(rf, deg, R - 18, a), 9, 9, rf.axis), HULL_DARK);
        keep('glow', beam(ringPoint(rf, deg, HUB + 6, a), ringPoint(rf, deg, R - 24, a), 1.2, 9.6, rf.axis), 0x7ff4ff);
      }
    }
  }

  // ---- the core, and the spine out to it from the hub ----
  const mob = range('the Möbius');
  if (mob && rf) {
    const { p } = frameVecs(track, mob[0]);
    const { r: right, u } = frameVecs(track, mob[0] - 20);
    const centre = p.clone().addScaledVector(u, MOBIUS.radius);
    const CORE = 66;
    const along = (a: number) => centre.clone().addScaledVector(right, a);
    // Round the road's loop (it moves `across` along the core on the way round).
    const a0 = Math.min(0, MOBIUS.across) - 36;
    const a1 = Math.max(0, MOBIUS.across) + 36;
    keep('plating', rod(along(a0), along(a1), CORE, 32), HULL);
    for (let a = a0 + 14; a < a1 - 6; a += 24) keep('glow', rod(along(a - 1.5), along(a + 1.5), CORE + 0.8, 32), 0x7ff4ff);
    // The reactor past it, away from the hub, and its glowing end.
    const toHub = rf.centre.clone().sub(centre).dot(right) > 0 ? 1 : -1;
    const hubFace = toHub > 0 ? a1 : a0;
    const awayFace = toHub > 0 ? a0 : a1;
    const tip = awayFace - toHub * 120;
    keep('foil', rod(along(awayFace), along(awayFace - toHub * 60), CORE - 10, 32, CORE), FOIL);
    keep('machinery', rod(along(awayFace - toHub * 60), along(tip), CORE - 24, 24, CORE - 10), HULL_DARK);
    keep('glow', rod(along(tip), along(tip - toHub * 4), CORE - 32, 24), 0xa8f8ff);
    // The spine, from the hub's end to the core.
    const hubEnd = rf.centre.clone().addScaledVector(rf.axis, rf.a1 + 70);
    const coreEnd = along(hubFace);
    const spineDir = coreEnd.clone().sub(hubEnd);
    const spineLen = spineDir.length();
    spineDir.normalize();
    keep('machinery', rod(hubEnd, coreEnd, 13, 16), HULL_DARK);
    const side = v3().crossVectors(spineDir, v3(0, 1, 0)).normalize();
    for (let a = 40; a < spineLen - 30; a += 46) {
      const c = hubEnd.clone().addScaledVector(spineDir, a);
      keep('machinery', rod(c.clone().addScaledVector(spineDir, -3), c.clone().addScaledVector(spineDir, 3), 18, 16), HULL_SEAM);
      // Pods off it, round and round; radiators off every other collar.
      const k = Math.round(a / 46);
      const dir = [v3(0, 1, 0), side, v3(0, -1, 0), side.clone().negate()][k % 4];
      if (k % 3 !== 1) keep(k % 2 ? 'foil' : 'plating', rod(c.clone().addScaledVector(dir, 14), c.clone().addScaledVector(dir, 60), 15, 16), k % 2 ? FOIL : HULL);
      if (k % 2 === 0) {
        const out = [side, side.clone().negate()][Math.floor(k / 2) % 2];
        keep('radiator', panel(c.clone().addScaledVector(out, 70), out.clone().multiplyScalar(52), spineDir.clone().multiplyScalar(14), 1.6), RADIATOR);
      }
    }
    // Two great solar wings off the middle of the spine, turned to the sun.
    const mid = hubEnd.clone().addScaledVector(spineDir, spineLen * 0.5);
    for (const out of [side, side.clone().negate()]) {
      keep('machinery', beam(mid.clone().addScaledVector(out, 16), mid.clone().addScaledVector(out, 330), 4, 4), SOLAR_FRAME);
      for (let k = 0; k < 6; k++) {
        const c = mid.clone().addScaledVector(out, 50 + k * 48);
        const tilt = v3(0, 1, 0).applyAxisAngle(out, 0.5).multiplyScalar(36);
        keep('solar', panel(c, out.clone().multiplyScalar(22), v3().crossVectors(out, tilt).normalize().multiplyScalar(36), 1), SOLAR);
      }
    }
  }

  // ---- the Mass Driver: a keel under the road and coils round it ----
  const driver = range('the Mass Driver');
  const coils: THREE.BufferGeometry[] = [];
  if (driver) {
    const from = starts[def.pieces.findIndex((pc) => pc.name === 'the Mass Driver') - 1];
    const lip = range('lip');
    const to = lip ? lip[1] : driver[1];
    keep('machinery', sweep(track, from, to, 8, () => [[-26, -9], [26, -9], [20, -30], [-20, -30]]), HULL_DARK);
    keep('glow', sweep(track, from, to, 8, () => [[-26.4, -9.5], [-26.4, -11.5], [-25.4, -11.5], [-25.4, -9.5]]), 0x7ff4ff);
    keep('glow', sweep(track, from, to, 8, () => [[25.4, -9.5], [25.4, -11.5], [26.4, -11.5], [26.4, -9.5]]), 0x7ff4ff);
    const n = Math.floor((driver[1] - driver[0] - 20) / 30);
    for (let k = 0; k <= n; k++) {
      const s = driver[0] + 10 + k * 30;
      const { t } = frameVecs(track, s);
      const g = hoop(plainPoint(track, s, 0, 8), t, 37, 2.6, 48, 8);
      if (ctx.inRoad(g)) continue;
      g.setAttribute('phase', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(k / 6), 1));
      coils.push(g);
    }
    if (coils.length) {
      const mat = coilMaterial();
      const mesh = new THREE.Mesh(mergeGeometries(coils.map((g) => { g.deleteAttribute('normal'); return g; })), mat);
      mesh.name = 'mass driver coils';
      group.add(mesh);
      ctx.updates.push((time) => (mat.uniforms.uTime.value = time));
    }
  }

  // ---- the docking ring over the jump ----
  const gap = range('gap');
  if (gap) {
    const s = (gap[0] + gap[1]) / 2;
    const { t, u } = frameVecs(track, s);
    // Mechs at any pace pass its middle within a few units of the road's
    // line (it flies the arc a mech at the jump's own speed would): a tight
    // ring to thread.
    const c = plainPoint(track, s, 0, 9);
    keep('plating', hoop(c, t, 42, 4, 72, 10), HULL);
    keep('glow', hoop(c.clone().addScaledVector(t, -4.2), t, 42, 1, 72, 6), 0x7ff4ff);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dir = u.clone().applyAxisAngle(t, a);
      keep('machinery', beam(c.clone().addScaledVector(dir, 45), c.clone().addScaledVector(dir, 70), 5, 5, t), HULL_DARK);
      keep('glow', rod(c.clone().addScaledVector(dir, 70).addScaledVector(t, -1), c.clone().addScaledVector(dir, 70).addScaledVector(t, 1), 3, 8), k % 2 ? 0xff4a3a : 0x4aff7a);
    }
  }

  // ---- the docking module: the road lands on its back and runs through and over it ----
  const landing = range('landing');
  const dock = range('the Dock');
  if (landing && dock) {
    const end = dock[1] + 40;
    // The body under it all.
    keep('plating', sweep(track, landing[0], end, 8, () => [[-72, -12], [72, -12], [64, -60], [-64, -60]]), HULL);
    keep('foil', sweep(track, landing[0] - 30, landing[0] + 4, 8, () => [[-66, -12], [66, -12], [58, -56], [-58, -56]]), FOIL);
    // The gallery's raised back under the right route, and the corridor
    // walled and roofed round the left one, where the routes have swung out.
    const v = v3();
    const routeSweep = (side: -1 | 1, section: (i: number) => Array<[number, number]>, c: number, kind: Kind | 'glow') => {
      const rows: THREE.Vector3[][] = [];
      for (let s = dock[0]; s <= dock[1]; s += 4) {
        const i = Math.floor(s / track.ds) % track.n;
        if (Math.abs(side < 0 ? track.shiftL[i] : track.shiftR[i]) < 12) {
          rows.push([]);
          continue;
        }
        rows.push(section(i).map(([d, h]) => trackPoint(track, s, d, h, v).clone()));
      }
      const pos: number[] = [];
      for (let r = 0; r + 1 < rows.length; r++) {
        const a = rows[r], b = rows[r + 1];
        if (!a.length || !b.length) continue;
        for (let k = 0; k < a.length; k++) {
          const k2 = (k + 1) % a.length;
          for (const p of [a[k], b[k], b[k2], a[k], b[k2], a[k2]]) pos.push(p.x, p.y, p.z);
        }
      }
      if (!pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      keep(kind, g, c);
    };
    const edge = (i: number) => track.hw[i] + KEEP_OUT.side + 3;
    routeSweep(1, (i) => [[0.5, -1], [edge(i), -1], [edge(i), -12 - track.riseR[i]], [0.5, -12 - track.riseR[i]]], HULL_DARK, 'machinery');
    const roof = KEEP_OUT.up + 12;
    routeSweep(-1, (i) => [[-edge(i) - 6, -12 - track.riseL[i]], [-edge(i) - 6, roof], [-edge(i), roof], [-edge(i), -12 - track.riseL[i]]], HULL, 'band');
    routeSweep(-1, (i) => [[-edge(i) - 6, roof], [-edge(i) - 6, roof + 6], [-0.4, roof + 6], [-0.4, roof]], HULL_SEAM, 'machinery');
    routeSweep(-1, (i) => [[-edge(i) - 0.2, roof - 2], [-edge(i) - 0.2, roof - 4], [-edge(i), roof - 4], [-edge(i), roof - 2]], 0x7ff4ff, 'glow');
  }

  // ---- the solar arrays under the Solar Wings ----
  const wings = range('the Solar Wings');
  const wingsEnd = range('down off the wings');
  if (wings && wingsEnd) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = Infinity;
    for (let s = wings[0]; s < wingsEnd[0]; s += 8) {
      frameAt(track, s, f);
      x0 = Math.min(x0, f.px); x1 = Math.max(x1, f.px);
      z0 = Math.min(z0, f.pz); z1 = Math.max(z1, f.pz);
      y = Math.min(y, f.py);
    }
    const W = 46, D = 26;
    const tilt = 0.45;
    for (let x = x0 - 260; x <= x1 + 260; x += W + 6) {
      for (let z = z0 - 300; z <= z1 + 300; z += D * 2 + 10) {
        const c = v3(x + (rnd() - 0.5) * 2, y - 70 - rnd() * 6, z);
        const ey = v3(0, Math.sin(tilt), Math.cos(tilt)).multiplyScalar(D);
        keep('solar', panel(c, v3(W / 2, 0, 0), ey, 0.8), SOLAR);
        keep('machinery', beam(c.clone().add(v3(-W / 2, -1, 0)), c.clone().add(v3(W / 2, -1, 0)), 1.6, 1.6), SOLAR_FRAME);
      }
      // The mast each row hangs from.
      keep('machinery', beam(v3(x, y - 74, z0 - 320), v3(x, y - 74, z1 + 320), 3, 3), SOLAR_FRAME);
    }
  }

  // ---- the paddock by the line ----
  const start = range('start straight');
  if (start) {
    keep('band', sweep(track, start[0] - 220, start[0] + 260, 10, () => [[-104, -6], [-58, -6], [-58, 30], [-104, 30]]), HULL);
    keep('glow', sweep(track, start[0] - 220, start[0] + 260, 10, () => [[-57.8, 14], [-57.6, 14], [-57.6, 20], [-57.8, 20]]), 0xffd89a);
    keep('trim', sweep(track, start[0] - 220, start[0] + 260, 10, () => [[-108, 30], [-54, 30], [-54, 34], [-108, 34]]), STRIPE);
  }

  // ---- the sign over the road into the Ring, on a frame from the deck's edges ----
  const intake = range('the Intake');
  if (intake) {
    // (Back from the Ring's foot: the road down its outside comes low over the line here.)
    const s = intake[0] - 90;
    const W = 96;
    const H = 30;
    const Y = 40;
    const m = new THREE.Matrix4();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: zenithSign(), side: THREE.DoubleSide }));
    trackMatrix(track, s, 0, Y, Math.PI, m);
    sign.applyMatrix4(m);
    group.add(sign);
    // Painted (track sheet T7), on a panel of its own shape in the same frame.
    const own = paintedTrack.circuitSigns[def.theme ?? ''];
    if (own) {
      const ph = Math.min(H, W / own.aspect);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, ph), new THREE.MeshBasicMaterial({ map: paintedTexture(own.url), side: THREE.DoubleSide }));
      trackMatrix(track, s, 0, Y + (H - ph) / 2, Math.PI, m);
      panel.applyMatrix4(m);
      group.add(panel);
      ctx.swaps.push((on) => {
        sign.visible = !on;
        panel.visible = on;
      });
    }
    for (const side of [-1, 1]) keep('machinery', beam(plainPoint(track, s, side * (W / 2 + 4), -8), plainPoint(track, s, side * (W / 2 + 4), Y + H / 2 + 3), 3, 3), HULL_DARK);
    keep('machinery', beam(plainPoint(track, s, -W / 2 - 6, Y + H / 2 + 3), plainPoint(track, s, W / 2 + 6, Y + H / 2 + 3), 3, 3), HULL_DARK);
  }

  // ---- into the scene ----
  const plain = toonMaterial({ color: 0xffffff });
  for (const kind of Object.keys(parts) as Kind[]) {
    if (!parts[kind].length) continue;
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(mergeGeometries(parts[kind]), plain);
    mesh.name = `station ${kind}`;
    group.add(mesh);
    const url = kind !== 'trim' ? ctx.painted?.surfaces[kind] : undefined;
    if (url && kind !== 'trim') {
      // (The painting only once it is in: until then a painted material draws black.)
      let on = false;
      let ready = false;
      const map = paintedTexture(url, {
        repeat: true,
        onReady: () => {
          ready = true;
          mesh.material = on ? painted : plain;
        },
      });
      const painted = paintedSurfaceMaterial(map, map, REPEAT[kind], REPEAT[kind], THREE.FrontSide, { toon: true, dip: 0 });
      alsoWears(mesh, plain, painted);
      ctx.swaps.push((p) => {
        on = p;
        mesh.material = on && ready ? painted : plain;
      });
    }
  }
  farOff(ctx, rf);
  if (glow.length) {
    const mesh = new THREE.Mesh(mergeGeometries(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    mesh.name = 'station lights';
    group.add(mesh);
  }
}

/**
 * Things far off in orbit, with the painted background: its cards (Z3: a
 * satellite, another station, a freighter, a spent stage, a radio
 * telescope, some wreckage), hung a few kilometres out round the station,
 * above the Earth's limb, each turned to face the camera.
 */
function farOff(ctx: StationCtx, rf: RingFrame | null): void {
  const set = ctx.painted;
  if (!set || set.clouds.cards.length === 0) return;
  const { cards, url } = set.clouds;
  const map = paintedTexture(url);
  const mats = cards.map((c) => paintedCardMaterial(map, [c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0], 1, THREE.DoubleSide));
  const geo = new THREE.PlaneGeometry(1, 1);
  const centre = rf ? rf.centre.clone().add(v3(700, -150, 300)) : v3();
  // Card, how wide, how far out, which way round (degrees), how high (degrees above level).
  const hung: Array<[number, number, number, number, number]> = [
    [0, 180, 2600, 30, 14],
    [1, 900, 7000, 140, 6],
    [2, 420, 3800, 215, 22],
    [3, 220, 3000, 290, -3],
    [4, 380, 4600, 340, 30],
    [5, 160, 2200, 100, 3],
    [0, 120, 4200, 250, 40],
    [5, 110, 2700, 190, -5],
  ];
  const group = new THREE.Group();
  group.name = 'far off';
  const meshes: Array<{ m: THREE.Mesh; spin: number }> = [];
  for (const [k, w, r, az, el] of hung) {
    if (!cards[k]) continue;
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    const m = new THREE.Mesh(geo, mats[k]);
    m.position.set(centre.x + Math.cos(a) * Math.cos(e) * r, centre.y + Math.sin(e) * r, centre.z + Math.sin(a) * Math.cos(e) * r);
    m.scale.set(w, w / cards[k].aspect, 1);
    m.renderOrder = -6;
    m.frustumCulled = false;
    group.add(m);
    meshes.push({ m: moves(m), spin: (k % 2 ? 1 : -1) * (0.004 + (k * 0.0013) % 0.004) });
  }
  ctx.group.add(group);
  ctx.paintedOnly.push(group);
  ctx.updates.push((time, camera) => {
    if (!group.visible) return;
    // Facing the camera, turning slowly in its own plane as things adrift do.
    for (const { m, spin } of meshes) {
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(time * spin);
    }
  });
}

/** Zenith Ring's sign over the road into the Ring, as the plain look letters it. */
function zenithSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a1030';
  g.fillRect(0, 0, 640, 200);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 620, 180);
  const band = g.createLinearGradient(40, 0, 600, 0);
  band.addColorStop(0, '#4a90ff');
  band.addColorStop(1, '#9ad8ff');
  g.fillStyle = band;
  g.fillRect(40, 142, 560, 14);
  g.fillStyle = '#ffffff';
  let size = 92;
  g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  while (g.measureText('ZENITH RING').width > 560 && size > 30) {
    size -= 4;
    g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  }
  g.fillText('ZENITH RING', 320, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

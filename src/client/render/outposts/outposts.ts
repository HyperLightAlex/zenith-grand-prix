// The settlements that explain a circuit out in the wild: who built it, how
// the crowd and the teams get there. A salvage camp (Titan's Rest), a
// paddock, a car park and a fuel stop (Corkscrew Canyon), a polar station
// (Frostline), put together by world.ts in a Site: each in its own frame (x
// across, y up, z along, the origin on the ground, +z toward the road).
//
// Its buildings are the outposts' Blender kit (art/blender/outposts/
// README.txt): containers, cabins, a workshop, tower cranes, a tank farm,
// masts, a helipad, lamps, a polar station's modules and links, a radome, a
// hangar, the teams' garages and hospitality, trucks, a fuel stop's canopy
// and shop, cars, salvage under tarps, runway flags, each built as its real
// counterpart is, on its foundations, framed, closed and with a way in. A
// site places them and draws each kind's slots instanced, painted in its
// palette (the paint slot tinted per building). What is built in place,
// flat-coloured, is what runs along the ground: fences, car parks'
// markings, runways, roads.
//
// With the painted background (the anime look), the circuit's outposts
// sheet (C5, F4, R5: art/bg-sheets) is laid on them by a Skin: a garage's
// roller doors, a hospitality unit's panels, ribbed and corrugated walls, a
// container's side, a cabin's, a tarpaulin, a module's wall with its lit
// windows, a radome's, a tank's, concrete aprons; and on the ground the
// highway, the car park, the tracks and the runway.
import * as THREE from 'three';
import { paintedSignMaterial, swapWhenPainted, type PaintedMaps } from '../painted';
import { modelLoader, readSlots } from '../slotModel';

const urls = import.meta.glob('./assets/outposts.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const OUTPOST_KINDS = [
  'container',
  'cabin',
  'workshop',
  'crane',
  'tankfarm',
  'mast',
  'helipad',
  'lamp',
  'module',
  'link',
  'radome',
  'hangar',
  'garages',
  'hospitality',
  'truck',
  'canopy',
  'shop',
  'car',
  'tarp',
  'flag',
] as const;
export type OutpostKind = (typeof OUTPOST_KINDS)[number];

export const OUTPOST_SLOTS = ['paint', 'steel', 'concrete', 'cladding', 'panel', 'roof', 'glass', 'dark', 'marking', 'accent', 'lamp'] as const;
export type OutpostSlot = (typeof OUTPOST_SLOTS)[number];

/** One building of the kit: its meshes, one geometry to a slot (its own frame: front toward +z, its origin on the ground at its middle), and the box round them. */
export interface OutpostShape {
  slots: Map<OutpostSlot, THREE.BufferGeometry>;
  box: THREE.Box3;
}
export type OutpostModel = Map<OutpostKind, OutpostShape>;

/** Read the kit from its scene: each kind's node, its meshes in its own frame. */
export function readOutposts(scene: THREE.Object3D): OutpostModel {
  const out: OutpostModel = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const kind = o.name as OutpostKind;
    if ((o as THREE.Mesh).isMesh || !OUTPOST_KINDS.includes(kind) || out.has(kind)) return;
    const slots = readSlots(o, OUTPOST_SLOTS, o.matrixWorld.clone().invert());
    const box = new THREE.Box3();
    for (const g of slots.values()) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    out.set(kind, { slots, box });
  });
  return out;
}

const model = modelLoader(urls['./assets/outposts.glb'], readOutposts, 'outposts');
/** Load the kit (once), for the circuits built after it. Null when it is not in the build. */
export const loadOutposts = model.load;
/** The kit once loaded; null before (or without it), when the sites have only what they build in place. */
export const outpostModel = model.get;
/** Use this kit (the tests', read from the file), or none. */
export const useOutpostModel = model.use;

/** What a site paints its buildings' slots (but paint, which each building has its own of). */
export type Palette = Record<Exclude<OutpostSlot, 'paint'>, number>;

export const PALETTE: Palette = {
  steel: 0x5a606b,
  concrete: 0xaaa69c,
  cladding: 0xb9bdc3,
  panel: 0xe6e2d8,
  roof: 0x5e5751,
  glass: 0x2a3a4c,
  dark: 0x2c313a,
  marking: 0xf2f0e8,
  accent: 0xff7a1a,
  lamp: 0xfff0c8,
};

/** Lamps lit another colour: aviation red atop what is tall, a pad's edge lights, a module's windows. */
const LAMP: Partial<Record<OutpostKind, number>> = { crane: 0xff3020, mast: 0xff3020, helipad: 0x9cf5ff, module: 0xffd88a };

/** One coloured piece built in place (non-indexed, position and normal and colour only). */
export type Piece = THREE.BufferGeometry;

function coloured(g: THREE.BufferGeometry, c: number | THREE.Color, keepUv = false): Piece {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  if (n.attributes.uv && !keepUv) n.deleteAttribute('uv');
  const col = new THREE.Color(c);
  const arr = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = col.r;
    arr[i + 1] = col.g;
    arr[i + 2] = col.b;
  }
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}

interface Placed {
  kind: OutpostKind;
  m: THREE.Matrix4;
  paint: THREE.Color;
}

/**
 * How one of a circuit's painted squares is laid on a slot of the kit's
 * buildings. A slot's UVs are metres (art/blender/outposts/README.txt): on a
 * wall along it and up it, on a roof or a floor along y and along x.
 */
export interface Lay {
  /** The painted surface (its name in the circuit's set). */
  tile: string;
  /** How far one repeat of it reaches, across and up, in metres. */
  size: readonly [number, number];
  /** Where its bottom left corner lies, in those metres. */
  at?: readonly [number, number];
  /** Held at its top and its foot rather than repeating up (a wall whose foot is in the sand, run on up into its gable). */
  clampV?: boolean;
  /** Its row (0 at its foot to 1 at its top) laid all over the roofs and floors, which the wall's painting does not fit. */
  flat?: number;
  /** Its lights alone (lit windows), glowing. */
  lit?: string;
}

/** A circuit's lays: by `kind.slot`, or by slot for every kind. */
export type Skin = Partial<Record<string, Lay>>;

/** What a site needs to be painted with the painted background: the switch, the circuit's surfaces, its skin. */
export interface Look {
  swaps: Array<(painted: boolean) => void>;
  surfaces: Record<string, string> | undefined;
  skin: Skin;
  /** Slots (`kind.slot`) drawn only in the plain look: what the painting shows instead (a module's lit windows). */
  plainOnly?: string[];
  /** Each texture loaded once (painted.ts). */
  maps?: PaintedMaps;
}

/** A slot's geometry with its UVs laid as `lay` says, made once for each lay. */
const laidCache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();

function laidOut(g: THREE.BufferGeometry, lay: Lay): THREE.BufferGeometry {
  const [su, sv] = lay.size;
  const [au, av] = lay.at ?? [0, 0];
  const key = JSON.stringify([su, sv, au, av, !!lay.clampV, lay.flat ?? null]);
  let byLay = laidCache.get(g);
  if (!byLay) laidCache.set(g, (byLay = new Map()));
  let out = byLay.get(key);
  if (out) return out;
  out = g.clone();
  const uv = out.attributes.uv;
  const nor = out.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const u = (uv.getX(i) - au) / su;
    let v = (uv.getY(i) - av) / sv;
    if (lay.clampV) v = Math.min(0.999, Math.max(0.001, v));
    if (lay.flat !== undefined && nor && Math.abs(nor.getY(i)) > 0.7) v = lay.flat;
    uv.setXY(i, u, v);
  }
  byLay.set(key, out);
  return out;
}

/** The painted material for a lay: its square (tinted, on the paint slot, by each building's paint), its lights glowing. */
function paintWith(look: Look, mesh: THREE.Mesh, lay: Lay): void {
  const url = look.surfaces?.[lay.tile];
  if (!url) return;
  const lit = lay.lit ? look.surfaces?.[lay.lit] : undefined;
  swapWhenPainted(
    look.swaps,
    mesh,
    lit ? [url, lit] : [url],
    ([map, glow]) => {
      const m = new THREE.MeshLambertMaterial({ map });
      if (glow) {
        m.emissiveMap = glow;
        m.emissive.set(0xffffff);
      }
      return m;
    },
    look.maps,
  );
}

/**
 * A piece laid on the ground (UVs in its square's repeats), painted with
 * `tile`: a road, a car park, a runway. Painted, it is drawn as the
 * painted ground round it is, the painting as painted, unlit.
 */
export function paintedGround(g: Piece, look: Look | undefined, tile: string): THREE.Mesh {
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.frustumCulled = false;
  const url = look?.surfaces?.[tile];
  if (look && url) swapWhenPainted(look.swaps, mesh, [url], ([map]) => paintedSignMaterial(map), look.maps);
  return mesh;
}

const Z = new THREE.Vector3(0, 0, 1);

/** A frame to build in: where its origin is (on the ground) and which way its +z faces. */
export class Site {
  readonly m = new THREE.Matrix4();
  readonly pieces: Piece[] = [];
  /** Lit things built in place, drawn unlit and bright. */
  readonly lights: Piece[] = [];
  /** The kit's buildings put down here. */
  readonly placed: Placed[] = [];
  /** Ground laid with a painted square (a car park, a runway). */
  readonly grounds: Array<{ g: Piece; tile: string }> = [];
  readonly palette: Palette;

  constructor(x: number, y: number, z: number, yaw: number, palette: Partial<Palette> = {}) {
    this.m.makeRotationY(yaw).setPosition(x, y, z);
    this.palette = { ...PALETTE, ...palette };
  }

  /** Put a piece built in this site's frame into the world. */
  put(g: THREE.BufferGeometry, c: number | THREE.Color, lit = false): this {
    (lit ? this.lights : this.pieces).push(coloured(g.applyMatrix4(this.m), c));
    return this;
  }

  /** Lay a piece of ground built in this site's frame, its UVs in repeats of the painted square `tile` (plain, coloured `c`). */
  ground(g: THREE.BufferGeometry, c: number, tile: string): this {
    this.grounds.push({ g: coloured(g.applyMatrix4(this.m), c, true), tile });
    return this;
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, c: number, yaw = 0): this {
    return this.put(new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y + h / 2, z), c);
  }

  /** A square member `s` thick from a to b. */
  strut(a: THREE.Vector3, b: THREE.Vector3, s: number, c: number): this {
    const d = b.clone().sub(a);
    const g = new THREE.BoxGeometry(s, s, d.length()).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, d.normalize()));
    return this.put(g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), c);
  }

  /** Put down one of the kit's buildings at (x, z), `y` up, turned `yaw` (unturned, its front toward +z), its paint this colour. */
  place(kind: OutpostKind, x: number, z: number, yaw = 0, paint: number = 0xe8e4da, y = 0): this {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z).premultiply(this.m);
    this.placed.push({ kind, m, paint: new THREE.Color(paint) });
    return this;
  }

  /**
   * A row of containers, `rows` side by side (along x, turned `yaw`), each
   * column stacked up to `high` and each on the one under it (a column's
   * stack stops where it stops), their colours from `hues`.
   */
  containers(x: number, z: number, rows: number, high: number, hues: number[], rnd: () => number, yaw = 0): this {
    for (let r = 0; r < rows; r++) {
      const ox = (r - (rows - 1) / 2) * 2.7;
      for (let k = 0; k < high; k++) {
        if (k > 0 && rnd() < 0.3) break;
        this.place('container', x + ox * Math.cos(yaw), z - ox * Math.sin(yaw), yaw, hues[Math.floor(rnd() * hues.length)], k * 2.59);
      }
    }
    return this;
  }

  /**
   * A chain-link fence round a rectangle w by d (its middle at x, z): line
   * posts every 3 m on concrete footings, a top rail, a mid rail and a
   * bottom wire; its corner posts heavier and braced into both runs. A gate
   * `gate` wide in the middle of its +z side (and one `back` wide in its -z
   * side, if it has one) between gate posts, braced too: two leaves that
   * slide apart, standing open inside the fence either side of it on their
   * rails.
   */
  fence(x: number, z: number, w: number, d: number, gate: number, back = 0, c = 0x8e949e): this {
    const H = 2.4;
    const footing = this.palette.concrete;
    const runs: Array<[number, number, number, number, boolean, boolean]> = [];
    // [from x, z, to x, z, whether each end is a gate post (else a corner)]
    const side = (zz: number, gap: number) => {
      if (gap > 0) runs.push([-w / 2, zz, -gap / 2, zz, false, true], [gap / 2, zz, w / 2, zz, true, false]);
      else runs.push([-w / 2, zz, w / 2, zz, false, false]);
    };
    side(d / 2, gate);
    side(-d / 2, back);
    runs.push([-w / 2, -d / 2, -w / 2, d / 2, false, false], [w / 2, -d / 2, w / 2, d / 2, false, false]);
    const v = (px: number, py: number, pz: number) => new THREE.Vector3(x + px, py, z + pz);
    const post = (px: number, pz: number, s: number, h: number) => {
      this.box(x + px, 0, z + pz, s * 4, 0.12, s * 4, footing);
      this.box(x + px, 0, z + pz, s, h, s, c);
    };
    const posts = new Set<string>();
    for (const [ax, az, bx, bz, gateA, gateB] of runs) {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const yaw = Math.atan2(ux, uz);
      const mx = x + (ax + bx) / 2;
      const mz = z + (az + bz) / 2;
      this.put(new THREE.BoxGeometry(0.06, 0.06, len).rotateY(yaw).translate(mx, H - 0.05, mz), c);
      this.put(new THREE.BoxGeometry(0.045, 0.045, len).rotateY(yaw).translate(mx, 1.25, mz), c);
      this.put(new THREE.BoxGeometry(0.025, 0.025, len).rotateY(yaw).translate(mx, 0.15, mz), c);
      const n = Math.max(1, Math.ceil(len / 3));
      for (let i = 0; i <= n; i++) {
        const px = ax + (bx - ax) * (i / n);
        const pz = az + (bz - az) * (i / n);
        const end = i === 0 || i === n;
        const key = `${px.toFixed(2)},${pz.toFixed(2)}`;
        if (posts.has(key)) continue;
        posts.add(key);
        const isGate = (i === 0 && gateA) || (i === n && gateB);
        post(px, pz, isGate ? 0.22 : end ? 0.14 : 0.08, isGate ? 2.9 : end ? 2.6 : H);
      }
      // Each end post braced into its run: a strut from high on it to the next post's foot.
      for (const [ex, ez, dir] of [
        [ax, az, 1],
        [bx, bz, -1],
      ] as const) {
        const next = Math.min(3, len / n);
        this.strut(v(ex, 1.9, ez), v(ex + ux * dir * next, 0.15, ez + uz * dir * next), 0.05, c);
      }
    }
    // The gates' leaves, slid open inside the fence: a frame each, braced corner to corner, on its ground rail.
    for (const [zz, gap, inward] of [
      [d / 2, gate, -1],
      [-d / 2, back, 1],
    ] as const) {
      if (gap <= 0) continue;
      const leaf = gap / 2;
      const lz = zz + inward * 0.6;
      for (const s of [-1, 1]) {
        const x0 = s * (gap / 2 + 0.3);
        const x1 = s * (gap / 2 + 0.3 + leaf);
        const mx = x + (x0 + x1) / 2;
        for (const y of [0.25, 2.2]) this.put(new THREE.BoxGeometry(leaf, 0.08, 0.08).translate(mx, y, z + lz), c);
        const bays = Math.max(1, Math.round(leaf / 3));
        for (let k = 0; k <= bays; k++) {
          const px = x0 + (x1 - x0) * (k / bays);
          this.box(x + px, 0.25, z + lz, 0.08, 1.95, 0.08, c);
          if (k < bays) this.strut(v(px, 0.25, lz), v(x0 + (x1 - x0) * ((k + 1) / bays), 2.2, lz), 0.05, c);
        }
        this.box(mx, 0, z + lz, leaf + 1.2, 0.06, 0.12, this.palette.steel);
      }
    }
    return this;
  }

  /**
   * Its meshes: what it builds in place, merged (lit and unlit), its ground
   * laid, and its buildings, each kind's slots instanced; without anything
   * `keep` turns down (a piece, or the box round a building). With `look`,
   * painted as its skin says with the painted background.
   */
  meshes(keep: (g: THREE.BufferGeometry) => boolean = () => true, look?: Look): THREE.Object3D[] {
    const out: THREE.Object3D[] = siteMeshes(this.pieces.filter(keep), this.lights.filter(keep));
    for (const { g, tile } of this.grounds) if (keep(g)) out.push(paintedGround(g, look, tile));
    const kit = outpostModel();
    if (!kit) return out;
    const byKind = new Map<OutpostKind, Placed[]>();
    const size = new THREE.Vector3();
    const mid = new THREE.Vector3();
    for (const p of this.placed) {
      const shape = kit.get(p.kind);
      if (!shape) continue;
      shape.box.getSize(size);
      shape.box.getCenter(mid);
      const round = new THREE.BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z).applyMatrix4(p.m).toNonIndexed();
      const ok = keep(round);
      round.dispose();
      if (!ok) continue;
      const list = byKind.get(p.kind) ?? [];
      list.push(p);
      byKind.set(p.kind, list);
    }
    for (const [kind, list] of byKind) {
      for (const [slot, g] of kit.get(kind)!.slots) {
        const lit = slot === 'lamp';
        const colour = slot === 'paint' ? 0xffffff : lit ? (LAMP[kind] ?? this.palette.lamp) : this.palette[slot];
        const mat = lit ? new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }) : new THREE.MeshLambertMaterial({ color: colour });
        const id = `${kind}.${slot}`;
        const lay = look && g.attributes.uv ? (look.skin[id] ?? look.skin[slot]) : undefined;
        const painted = lay && look?.surfaces?.[lay.tile];
        const mesh = new THREE.InstancedMesh(painted ? laidOut(g, lay) : g, mat, list.length);
        mesh.name = `outpost ${kind} ${slot}`;
        list.forEach((p, i) => {
          mesh.setMatrixAt(i, p.m);
          if (slot === 'paint') mesh.setColorAt(i, p.paint);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        if (painted) paintWith(look!, mesh, lay);
        if (look?.plainOnly?.includes(id)) look.swaps.push((on) => (mesh.visible = !on));
        out.push(mesh);
      }
    }
    return out;
  }
}

/**
 * A road over open ground: a ribbon `width` wide through `points` (world,
 * on the ground), `lift` above it, for a dirt or an ice road in to a
 * circuit. Its UVs: across it 0 to 1, along it a repeat to every `width`
 * (for a painted road's square, laid along its length).
 */
export function groundRoad(points: THREE.Vector3[], width: number, c: number, lift = 0.25): Piece {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const run = [0];
  for (let k = 1; k < points.length; k++) run.push(run[k - 1] + Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z));
  const at = (k: number, side: number) => {
    const a = points[Math.max(0, k - 1)];
    const b = points[Math.min(points.length - 1, k + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const p = points[k];
    return new THREE.Vector3(p.x + (dz / l) * side * width * 0.5, p.y + lift, p.z - (dx / l) * side * width * 0.5);
  };
  for (let k = 0; k + 1 < points.length; k++) {
    const a0 = at(k, -1);
    const a1 = at(k, 1);
    const b0 = at(k + 1, -1);
    const b1 = at(k + 1, 1);
    const va = run[k] / width;
    const vb = run[k + 1] / width;
    for (const tri of [
      [
        [a0, 0, va],
        [b0, 0, vb],
        [a1, 1, va],
      ],
      [
        [a1, 1, va],
        [b0, 0, vb],
        [b1, 1, vb],
      ],
    ] as Array<Array<[THREE.Vector3, number, number]>>) {
      const [[p], [q], [r]] = tri;
      // Facing up.
      const up = (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x) < 0;
      for (const [v, u, w] of up ? tri : [tri[0], tri[2], tri[1]]) {
        pos.push(v.x, v.y, v.z);
        nor.push(0, 1, 0);
        uvs.push(u, w);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return coloured(g, c, true);
}

/** Pieces as meshes: the solid ones lit by the scene, the lamps unlit and bright. */
export function siteMeshes(pieces: Piece[], lights: Piece[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const merge = (list: Piece[]) => {
    let n = 0;
    for (const g of list) {
      if (!g.attributes.normal) g.computeVertexNormals();
      n += g.attributes.position.count * 3;
    }
    const pos = new Float32Array(n);
    const nor = new Float32Array(n);
    const col = new Float32Array(n);
    let at = 0;
    for (const g of list) {
      pos.set(g.attributes.position.array as Float32Array, at);
      nor.set(g.attributes.normal.array as Float32Array, at);
      col.set(g.attributes.color.array as Float32Array, at);
      at += g.attributes.position.count * 3;
      g.dispose();
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return m;
  };
  if (pieces.length) out.push(new THREE.Mesh(merge(pieces), new THREE.MeshLambertMaterial({ vertexColors: true })));
  if (lights.length) out.push(new THREE.Mesh(merge(lights), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  for (const m of out) m.frustumCulled = false;
  return out;
}

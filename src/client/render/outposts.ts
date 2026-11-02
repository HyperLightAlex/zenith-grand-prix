// The settlements that explain a circuit out in the wild: who built it, how
// the crowd and the teams get there. A kit of simple structures, each built
// in place in its own frame (x across, y up, z along, the frame's origin on
// the ground) and coloured flat, for world.ts to put together into a
// salvage camp (Titan's Rest), a paddock and a fuel stop (Corkscrew
// Canyon) or a polar base (Frostline): huts and sheds, shipping containers,
// tanks, masts, lattice cranes, fences, landing pads, domes, lamp posts,
// and the roads in and out.
import * as THREE from 'three';

/** One coloured piece of an outpost (non-indexed, position and normal and colour only). */
export type Piece = THREE.BufferGeometry;

function coloured(g: THREE.BufferGeometry, c: number | THREE.Color): Piece {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  if (n.attributes.uv) n.deleteAttribute('uv');
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

/** A frame to build in: where its origin is (on the ground) and which way its +z faces. */
export class Site {
  readonly m = new THREE.Matrix4();
  readonly pieces: Piece[] = [];
  /** Lit things (lamps, beacons), drawn unlit and bright. */
  readonly lights: Piece[] = [];

  constructor(x: number, y: number, z: number, yaw: number) {
    this.m.makeRotationY(yaw).setPosition(x, y, z);
  }

  /** Put a piece built in this site's frame into the world. */
  put(g: THREE.BufferGeometry, c: number | THREE.Color, lit = false): this {
    (lit ? this.lights : this.pieces).push(coloured(g.applyMatrix4(this.m), c));
    return this;
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, c: number, yaw = 0): this {
    return this.put(new THREE.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y + h / 2, z), c);
  }

  /** A shed or hut: walls, a shallow pitched roof, a door. */
  hut(x: number, z: number, w: number, d: number, h: number, wall: number, roof: number, yaw = 0): this {
    this.box(x, 0, z, w, h, d, wall, yaw);
    // Two slopes meeting over the middle.
    for (const s of [-1, 1]) {
      const slope = new THREE.BoxGeometry(w * 0.56, 0.35, d + 0.8).rotateZ(-s * 0.3).translate(s * w * 0.25, h + w * 0.075, 0).rotateY(yaw).translate(x, 0, z);
      this.put(slope, roof);
    }
    const door = new THREE.BoxGeometry(w * 0.22, h * 0.7, 0.3).translate(0, (h * 0.7) / 2, d / 2 + 0.1).rotateY(yaw).translate(x, 0, z);
    return this.put(door, 0x2c313a);
  }

  /** A shipping container, 12 m by 2.5 by 2.6, ribbed doors at one end. */
  container(x: number, y: number, z: number, c: number, yaw = 0): this {
    this.box(x, y, z, 2.5, 2.6, 12, c, yaw);
    const ends = new THREE.BoxGeometry(2.6, 2.7, 0.2).translate(0, 1.35, 6.05).rotateY(yaw).translate(x, y, z);
    return this.put(ends, new THREE.Color(c).multiplyScalar(0.7).getHex());
  }

  /** A stack of containers, `rows` long, `high` high, colours from `hues`. */
  containers(x: number, z: number, rows: number, high: number, hues: number[], rnd: () => number, yaw = 0): this {
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < high; k++) {
        if (k > 0 && rnd() < 0.25) continue;
        const ox = (r - (rows - 1) / 2) * 2.7;
        this.container(x + ox * Math.cos(yaw), k * 2.6, z - ox * Math.sin(yaw), hues[Math.floor(rnd() * hues.length)], yaw);
      }
    return this;
  }

  /** A storage tank: a drum on a plinth, a band round it. */
  tank(x: number, z: number, r: number, h: number, c: number, band = 0x9aa3ae): this {
    this.put(new THREE.CylinderGeometry(r, r, h, 18).translate(x, h / 2 + 0.6, z), c);
    this.put(new THREE.CylinderGeometry(r + 0.6, r + 0.6, 0.6, 18).translate(x, 0.3, z), 0x8d8a84);
    return this.put(new THREE.CylinderGeometry(r + 0.08, r + 0.08, 0.8, 18).translate(x, h * 0.7, z), band);
  }

  /** A lattice mast with a red lamp at the top. */
  mast(x: number, z: number, h: number, c = 0xb8bcc4): this {
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [0, 0.9]]) this.put(new THREE.CylinderGeometry(0.15, 0.2, h, 4).translate(x + dx, h / 2, z + dz), c);
    for (let y = 4; y < h; y += 5) this.put(new THREE.CylinderGeometry(1.2, 1.2, 0.2, 3).translate(x, y, z), c);
    return this.put(new THREE.SphereGeometry(0.7, 8, 6).translate(x, h + 0.6, z), 0xff3020, true);
  }

  /** A tower crane: a lattice tower, its jib out over `jibYaw`, a counterweight behind, a hook hanging. */
  crane(x: number, z: number, h: number, jib: number, jibYaw: number, c = 0xf2b632): this {
    this.put(new THREE.BoxGeometry(2.4, h, 2.4).translate(x, h / 2, z), c);
    for (let y = 3; y < h; y += 3) this.put(new THREE.BoxGeometry(2.6, 0.25, 2.6).translate(x, y, z), 0x8a6a2a);
    const arm = new THREE.BoxGeometry(1.6, 1.8, jib * 1.35).translate(0, h + 1, jib * 0.5 - jib * 0.175).rotateY(jibYaw).translate(x, 0, z);
    this.put(arm, c);
    const weight = new THREE.BoxGeometry(3.4, 2.6, 4).translate(0, h + 0.6, -jib * 0.32).rotateY(jibYaw).translate(x, 0, z);
    this.put(weight, 0x6e7380);
    const cab = new THREE.BoxGeometry(2.6, 2.2, 2.6).translate(1.6, h - 1.4, 0).rotateY(jibYaw).translate(x, 0, z);
    this.put(cab, 0xe8e4da);
    const hookAt = new THREE.Vector3(0, 0, jib * 0.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), jibYaw);
    this.put(new THREE.CylinderGeometry(0.08, 0.08, h * 0.45, 4).translate(x + hookAt.x, h - h * 0.225, z + hookAt.z), 0x2c313a);
    this.put(new THREE.SphereGeometry(0.7, 6, 4).translate(x + hookAt.x, h * 0.55, z + hookAt.z), 0x2c313a);
    return this.put(new THREE.SphereGeometry(0.5, 8, 6).translate(x, h + 2.6, z), 0xff3020, true);
  }

  /** A fence round a rectangle w by d: posts every 6 m and two rails, a gap for the gate at the middle of its +z side. */
  fence(x: number, z: number, w: number, d: number, gate: number, c = 0x8e949e): this {
    const sides: Array<[number, number, number, number]> = [
      [-w / 2, -d / 2, w / 2, -d / 2],
      [w / 2, -d / 2, w / 2, d / 2],
      [-w / 2, -d / 2, -w / 2, d / 2],
      [-w / 2, d / 2, -gate / 2, d / 2],
      [gate / 2, d / 2, w / 2, d / 2],
    ];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      const yaw = Math.atan2(bx - ax, bz - az);
      for (const y of [0.9, 1.9]) this.put(new THREE.BoxGeometry(0.12, 0.12, len).rotateY(yaw).translate(x + (ax + bx) / 2, y, z + (az + bz) / 2), c);
      for (let t = 0; t <= len; t += 6) {
        const f = t / len;
        this.put(new THREE.BoxGeometry(0.18, 2.2, 0.18).translate(x + ax + (bx - ax) * f, 1.1, z + az + (bz - az) * f), c);
      }
    }
    return this;
  }

  /** A landing pad: a raised disc, a ring and an H, lights round its edge. */
  pad(x: number, z: number, r: number): this {
    this.put(new THREE.CylinderGeometry(r, r + 0.6, 0.6, 24).translate(x, 0.3, z), 0x6e737c);
    this.put(new THREE.RingGeometry(r * 0.72, r * 0.8, 32).rotateX(-Math.PI / 2).translate(x, 0.63, z), 0xf2f0e8);
    for (const dx of [-r * 0.25, r * 0.25]) this.put(new THREE.PlaneGeometry(r * 0.1, r * 0.6).rotateX(-Math.PI / 2).translate(x + dx, 0.64, z), 0xf2f0e8);
    this.put(new THREE.PlaneGeometry(r * 0.5, r * 0.1).rotateX(-Math.PI / 2).translate(x, 0.64, z), 0xf2f0e8);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      this.put(new THREE.SphereGeometry(0.35, 6, 4).translate(x + Math.cos(a) * (r - 0.4), 0.8, z + Math.sin(a) * (r - 0.4)), 0x8ff0ff, true);
    }
    return this;
  }

  /** A dome (a radome or a shelter) on a short drum. */
  dome(x: number, z: number, r: number, c = 0xeef2f6): this {
    this.put(new THREE.CylinderGeometry(r, r, r * 0.3, 20).translate(x, r * 0.15, z), 0xa9b0bb);
    return this.put(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, r * 0.3, z), c);
  }

  /** A module on legs (a polar station's): a long box raised clear of the snow, windows along it. */
  module(x: number, z: number, w: number, d: number, c: number, yaw = 0, lift = 3): this {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(new THREE.BoxGeometry(0.6, lift, 0.6).translate(sx * (w / 2 - 1), lift / 2, sz * (d / 2 - 1)).rotateY(yaw).translate(x, 0, z), 0x6e737c);
    this.put(new THREE.BoxGeometry(w, 4.2, d).translate(0, lift + 2.1, 0).rotateY(yaw).translate(x, 0, z), c);
    const windows = new THREE.BoxGeometry(w + 0.1, 0.9, d * 0.8).translate(0, lift + 2.6, 0).rotateY(yaw).translate(x, 0, z);
    return this.put(windows, 0xffd88a, true);
  }

  /** A lamp post, its lamp lit. */
  lamp(x: number, z: number, h = 8): this {
    this.put(new THREE.CylinderGeometry(0.12, 0.16, h, 5).translate(x, h / 2, z), 0x4a505c);
    return this.put(new THREE.BoxGeometry(1.2, 0.3, 0.5).translate(x, h, z), 0xfff0c8, true);
  }
}

/**
 * A road over open ground: a ribbon `width` wide through `points` (world,
 * on the ground), `lift` above it, shoulders a shade darker, for a dirt or
 * an ice road in to a circuit.
 */
export function groundRoad(points: THREE.Vector3[], width: number, c: number, lift = 0.25): Piece {
  const pos: number[] = [];
  const nor: number[] = [];
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
    for (const [p, q, r] of [
      [a0, b0, a1],
      [a1, b0, b1],
    ]) {
      // Facing up.
      const up = (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x) < 0;
      for (const v of up ? [p, q, r] : [p, r, q]) {
        pos.push(v.x, v.y, v.z);
        nor.push(0, 1, 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return coloured(g, c);
}

/** A site's pieces as meshes in `group`: its solid pieces lit by the scene, its lamps unlit and bright. */
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

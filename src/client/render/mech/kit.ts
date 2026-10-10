// A tiny modelling kit. Mechs are assembled in code from tapered boxes,
// extruded profiles and low-poly cylinders, then merged per limb. Every part
// is tagged with a livery slot so the same frame can wear any team's colours,
// and swapping a part later (upgrades, customisation) is a data change.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, toonMaterial, type Livery } from '../palette';

/** P primary armour, S secondary panels, F frame, T trim, D deep shadow parts, C canopy glass. */
export type Slot = 'P' | 'S' | 'F' | 'T' | 'D' | 'C';

export interface Xf {
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

export interface BoxOpts extends Xf {
  /** Scale of the top face relative to the bottom, in x and z. */
  taper?: [number, number];
  /** Shift of the top face along z (forward) and x. */
  lean?: number;
  leanX?: number;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const vp = new THREE.Vector3();
const vs = new THREE.Vector3();

function xf(g: THREE.BufferGeometry, o?: Xf): THREE.BufferGeometry {
  if (!o) return g;
  const r = o.rot ?? [0, 0, 0];
  const p = o.at ?? [0, 0, 0];
  const s = o.scale ?? [1, 1, 1];
  e.set(r[0], r[1], r[2]);
  q.setFromEuler(e);
  m4.compose(vp.set(p[0], p[1], p[2]), q, vs.set(s[0], s[1], s[2]));
  g.applyMatrix4(m4);
  return g;
}

let outlineMaterial: THREE.ShaderMaterial | null = null;

/** Inverted-hull ink line: back faces pushed out along smoothed normals. */
function outlineMat(): THREE.ShaderMaterial {
  if (outlineMaterial) return outlineMaterial;
  outlineMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(COLORS.outline) }, uWidth: { value: 0.075 } }]),
    vertexShader: /* glsl */ `
      uniform float uWidth;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position + normal * uWidth, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  return outlineMaterial;
}

let armorMaterial: THREE.MeshToonMaterial | null = null;
const glowMaterials = new Map<number, THREE.MeshBasicMaterial>();

export function glowMaterial(color: number, gain = 1.7): THREE.MeshBasicMaterial {
  const key = color * 10 + Math.round(gain * 4);
  let m = glowMaterials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain), toneMapped: false });
    glowMaterials.set(key, m);
  }
  return m;
}

export interface Built {
  group: THREE.Group;
  armor: THREE.Mesh | null;
  glow: THREE.Mesh | null;
}

export class Kit {
  private armor: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  private colors: Record<Slot, THREE.Color>;

  constructor(readonly livery: Livery) {
    this.colors = {
      P: new THREE.Color(livery.primary),
      S: new THREE.Color(livery.secondary),
      F: new THREE.Color(livery.frame),
      T: new THREE.Color(livery.trim),
      D: new THREE.Color(livery.frame).multiplyScalar(0.55),
      C: new THREE.Color(livery.glow).multiplyScalar(0.3),
    };
  }

  private push(g: THREE.BufferGeometry, slot: Slot | 'G', o?: Xf): this {
    let geo = g.index ? g.toNonIndexed() : g;
    geo = xf(geo, o);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    if (slot === 'G') {
      this.glow.push(geo);
    } else {
      const c = this.colors[slot];
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.armor.push(geo);
    }
    return this;
  }

  /** Box centred on the origin; `taper` and `lean` turn it into a wedge or trapezoid. */
  box(slot: Slot | 'G', w: number, h: number, d: number, o: BoxOpts = {}): this {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const [tx, tz] = o.taper ?? [1, 1];
    const lean = o.lean ?? 0;
    const leanX = o.leanX ?? 0;
    if (tx !== 1 || tz !== 1 || lean !== 0 || leanX !== 0) {
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / h + 0.5;
        pos.setX(i, pos.getX(i) * (1 + (tx - 1) * t) + leanX * t);
        pos.setZ(i, pos.getZ(i) * (1 + (tz - 1) * t) + lean * t);
      }
    }
    return this.push(g, slot, o);
  }

  /**
   * Side profile in (z, y), extruded across x and centred. `taperX` narrows
   * the far end (max z) for blades and fins.
   */
  prism(slot: Slot | 'G', pts: Array<[number, number]>, width: number, o: Xf = {}): this {
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    // Extrude runs along +z with the profile in (x, y); turn it so the profile
    // lies in (z, y) and the thickness runs along x.
    g.rotateY(-Math.PI / 2);
    g.translate(width / 2, 0, 0);
    return this.push(g, slot, o);
  }

  /** Front profile in (x, y), extruded along z and centred. */
  plate(slot: Slot | 'G', pts: Array<[number, number]>, depth: number, o: Xf = {}): this {
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.push(g, slot, o);
  }

  /** Low-poly cylinder or cone along `axis`. */
  cyl(slot: Slot | 'G', rTop: number, rBottom: number, h: number, sides: number, o: Xf & { axis?: 'x' | 'y' | 'z'; open?: boolean } = {}): this {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1, o.open ?? false);
    if (o.axis === 'x') g.rotateZ(Math.PI / 2);
    else if (o.axis === 'z') g.rotateX(Math.PI / 2);
    return this.push(g, slot, o);
  }

  ball(slot: Slot | 'G', r: number, o: Xf = {}): this {
    return this.push(new THREE.IcosahedronGeometry(r, 0), slot, o);
  }

  /** Merge everything added so far into meshes under one group. */
  build(): Built {
    const group = new THREE.Group();
    let armor: THREE.Mesh | null = null;
    let glow: THREE.Mesh | null = null;
    if (this.armor.length) {
      const geo = mergeGeometries(this.armor)!;
      geo.computeVertexNormals();
      armorMaterial ??= toonMaterial();
      armor = new THREE.Mesh(geo, armorMaterial);
      group.add(armor);
      // Outline hull: same shape with normals averaged across hard edges.
      const hull = new THREE.BufferGeometry();
      hull.setAttribute('position', geo.attributes.position.clone());
      const welded = mergeVertices(hull, 1e-3);
      welded.computeVertexNormals();
      const line = new THREE.Mesh(welded, outlineMat());
      group.add(line);
    }
    if (this.glow.length) {
      const geo = mergeGeometries(this.glow)!;
      glow = new THREE.Mesh(geo, glowMaterial(this.livery.glow));
      group.add(glow);
    }
    this.armor = [];
    this.glow = [];
    return { group, armor, glow };
  }
}

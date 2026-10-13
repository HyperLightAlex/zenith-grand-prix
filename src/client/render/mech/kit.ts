// A small modelling kit. Mechs are assembled in code from chamfered boxes,
// bevelled extrusions, lathed parts and low-poly cylinders, then merged per
// limb. Every part is tagged with a livery slot so the same frame can wear any
// team's colours, and swapping a part later (upgrades, customisation) is a
// data change. Each slot also carries a surface type (painted armour, bare
// metal, rubber, glass) that the armour shader lights differently.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { COLORS, toonGradient, type Livery } from '../palette';

/**
 * P primary armour, S secondary panels, T trim (all painted); F frame (bare
 * metal); D deep parts (dark metal and rubber: joints, vents, wheels);
 * C canopy and lenses (glass); K inner frame (gunmetal, between the armour).
 */
export type Slot = 'P' | 'S' | 'F' | 'T' | 'D' | 'C' | 'K';

/** Surface type per slot: 0 paint, 1 metal, 2 rubber and dark metal, 3 glass. */
const SURFACE: Record<Slot, number> = { P: 0, S: 0, T: 0, F: 1, K: 1, D: 2, C: 3 };

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
  /** Size of the chamfer on every edge. Defaults to a small one in proportion; 0 for a sharp box. */
  bevel?: number;
}

export interface ExtrudeOpts extends Xf {
  /** Chamfer round the two faces of the extrusion. Defaults to a small one; 0 for none. */
  bevel?: number;
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

/** Default chamfer for a part this size: enough to catch the light, never more than a fifth of its thinnest side. */
function autoBevel(...sizes: number[]): number {
  const t = Math.min(...sizes);
  return Math.min(0.07, t * 0.2);
}

/** A box with every edge and corner chamfered: the convex hull of its corners pulled in by `c` two ways at a time. */
function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  if (c <= 1e-4) return new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push(new THREE.Vector3(sx * hx, sy * (hy - c), sz * (hz - c)));
        pts.push(new THREE.Vector3(sx * (hx - c), sy * hy, sz * (hz - c)));
        pts.push(new THREE.Vector3(sx * (hx - c), sy * (hy - c), sz * hz));
      }
    }
  }
  return new ConvexGeometry(pts);
}

let outlineMaterial: THREE.ShaderMaterial | null = null;

/**
 * Show or hide the mechs' hull outlines. The anime look's ink pass draws
 * its own contour (with weight and breaks), so it turns these off while it
 * is inking.
 */
export function setHullOutlines(on: boolean): void {
  outlineMat().visible = on;
}

/** Inverted-hull ink line: back faces pushed out along smoothed normals. */
function outlineMat(): THREE.ShaderMaterial {
  if (outlineMaterial) return outlineMaterial;
  outlineMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(COLORS.outline) }, uWidth: { value: 0.06 } }]),
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

/**
 * What the armour reflects: the sky above and the ground below. Shared by
 * every mech, and set for each circuit's light (see setArmorEnvironment).
 */
const ENV = {
  uEnvHigh: { value: new THREE.Color(0x9cc0ff) },
  uEnvLow: { value: new THREE.Color(0x6a5a50) },
  uRim: { value: new THREE.Color(0xdfe9ff).multiplyScalar(0.55) },
};

/** Tint the armour's reflections and rim light for a circuit's sky and ground. */
export function setArmorEnvironment(sky: number, ground: number, rim: number): void {
  ENV.uEnvHigh.value.setHex(sky);
  ENV.uEnvLow.value.setHex(ground);
  ENV.uRim.value.setHex(rim).multiplyScalar(0.55);
}

let armorMaterial: THREE.MeshToonMaterial | null = null;

/**
 * The armour shader: three's toon lighting (hard bands, real shadows) plus
 * what makes painted and bare metal parts read as different materials: a
 * hard-edged anime highlight sized by surface type, a rim of sky light round
 * the silhouette, and a sky-and-ground reflection on metal and glass.
 */
export function armorMat(): THREE.MeshToonMaterial {
  if (armorMaterial) return armorMaterial;
  const mat = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ENV);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute float aMat;
        varying float vMat;
        varying vec3 vWorldN;
        varying vec3 vWorldP;`,
      )
      .replace(
        '#include <fog_vertex>',
        /* glsl */ `#include <fog_vertex>
        vMat = aMat;
        vWorldN = normalize(mat3(modelMatrix) * objectNormal);
        vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <lights_toon_pars_fragment>',
        /* glsl */ `
        varying vec3 vViewPosition;
        varying float vMat;
        varying vec3 vWorldN;
        varying vec3 vWorldP;
        uniform vec3 uEnvHigh;
        uniform vec3 uEnvLow;
        uniform vec3 uRim;
        struct ToonMaterial {
          vec3 diffuseColor;
          float spec;
          float shine;
        };
        void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
          vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
          reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
          // A hard-edged highlight, with a little soft spill round it.
          vec3 H = normalize( directLight.direction + geometryViewDir );
          float s = pow( max( dot( geometryNormal, H ), 0.0 ), material.shine );
          float lit = step( 0.0, dot( geometryNormal, directLight.direction ) );
          reflectedLight.directSpecular += directLight.color * ( smoothstep( 0.45, 0.52, s ) * 0.85 + s * 0.25 ) * material.spec * lit;
        }
        void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
        }
        #define RE_Direct RE_Direct_Toon
        #define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
        `,
      )
      .replace(
        '#include <lights_toon_fragment>',
        /* glsl */ `
        ToonMaterial material;
        material.diffuseColor = diffuseColor.rgb;
        // 0 paint, 1 metal, 2 rubber and dark metal, 3 glass.
        float isMetal = 1.0 - step( 0.5, abs( vMat - 1.0 ) );
        float isDark = 1.0 - step( 0.5, abs( vMat - 2.0 ) );
        float isGlass = step( 2.5, vMat );
        material.spec = mix( mix( mix( 0.32, 0.6, isMetal ), 0.1, isDark ), 1.2, isGlass );
        material.shine = mix( mix( mix( 46.0, 22.0, isMetal ), 12.0, isDark ), 120.0, isGlass );
        `,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        /* glsl */ `
        vec3 wN = normalize( vWorldN );
        vec3 eyeDir = normalize( vWorldP - cameraPosition );
        // Rim: a thin edge of sky light round the silhouette, stronger on top.
        float fres = pow( 1.0 - clamp( dot( wN, -eyeDir ), 0.0, 1.0 ), 3.0 );
        vec3 rim = uRim * smoothstep( 0.25, 0.6, fres ) * ( 0.55 + 0.45 * clamp( wN.y + 0.4, 0.0, 1.0 ) );
        // Reflection of the sky and the ground, for metal and glass (a hint on paint).
        vec3 R = reflect( eyeDir, wN );
        vec3 env = mix( uEnvLow, uEnvHigh, smoothstep( -0.25, 0.35, R.y ) );
        float envK = mix( mix( mix( 0.07, 0.3, isMetal ), 0.04, isDark ), 0.55, isGlass );
        vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular
          + totalEmissiveRadiance + rim + env * envK * mix( 0.6, 1.0, fres );
        `,
      );
  };
  mat.customProgramCacheKey = () => 'zgp-armor-v1';
  // The anime look paints the armour's metal and glass (see look.ts).
  mat.userData.celArmor = true;
  armorMaterial = mat;
  return mat;
}

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
      K: new THREE.Color(livery.frame).lerp(new THREE.Color(0x6c7486), 0.45),
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
      const mat = new Float32Array(n).fill(SURFACE[slot]);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 1));
      this.armor.push(geo);
    }
    return this;
  }

  /** Box centred on the origin, edges chamfered; `taper` and `lean` turn it into a wedge or trapezoid. */
  box(slot: Slot | 'G', w: number, h: number, d: number, o: BoxOpts = {}): this {
    const c = slot === 'G' ? 0 : (o.bevel ?? autoBevel(w, h, d));
    const g = chamferBox(w, h, d, c);
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

  /** An outline extruded to `depth`, its two faces chamfered, centred on the extrusion. */
  private extrude(pts: Array<[number, number]>, depth: number, bevel: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
    shape.closePath();
    const b = Math.min(bevel, depth * 0.3);
    const g =
      b > 1e-3
        ? new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1 })
        : new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, b > 1e-3 ? -(depth - 2 * b) / 2 : -depth / 2);
    return g;
  }

  /** Side profile in (z, y), extruded across x and centred. */
  prism(slot: Slot | 'G', pts: Array<[number, number]>, width: number, o: ExtrudeOpts = {}): this {
    const g = this.extrude(pts, width, slot === 'G' ? 0 : (o.bevel ?? autoBevel(width * 1.6)));
    // The profile was drawn in (x, y) with the thickness along z: turn it so
    // the profile lies in (z, y) and the thickness runs along x.
    g.rotateY(-Math.PI / 2);
    return this.push(g, slot, o);
  }

  /** Front profile in (x, y), extruded along z and centred. */
  plate(slot: Slot | 'G', pts: Array<[number, number]>, depth: number, o: ExtrudeOpts = {}): this {
    const g = this.extrude(pts, depth, slot === 'G' ? 0 : (o.bevel ?? autoBevel(depth * 1.6)));
    return this.push(g, slot, o);
  }

  /** Low-poly cylinder or cone along `axis`, its rims chamfered unless `bevel` is 0. */
  cyl(slot: Slot | 'G', rTop: number, rBottom: number, h: number, sides: number, o: Xf & { axis?: 'x' | 'y' | 'z'; open?: boolean; bevel?: number } = {}): this {
    const c = slot === 'G' || o.open ? 0 : Math.min(o.bevel ?? autoBevel(h, rTop * 2, rBottom * 2), h * 0.3);
    const g =
      c > 1e-3
        ? new THREE.LatheGeometry(
            [
              new THREE.Vector2(0, -h / 2),
              new THREE.Vector2(rBottom - c, -h / 2),
              new THREE.Vector2(rBottom, -h / 2 + c),
              new THREE.Vector2(rTop, h / 2 - c),
              new THREE.Vector2(rTop - c, h / 2),
              new THREE.Vector2(0, h / 2),
            ],
            sides,
          )
        : new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1, o.open ?? false);
    if (o.axis === 'x') g.rotateZ(Math.PI / 2);
    else if (o.axis === 'z') g.rotateX(Math.PI / 2);
    return this.push(g, slot, o);
  }

  /** A turned part from an (r, y) profile, bottom to top: nozzles, collars, sensor domes. */
  lathe(slot: Slot | 'G', profile: Array<[number, number]>, sides: number, o: Xf & { axis?: 'x' | 'y' | 'z' } = {}): this {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      sides,
    );
    if (o.axis === 'x') g.rotateZ(Math.PI / 2);
    else if (o.axis === 'z') g.rotateX(Math.PI / 2);
    return this.push(g, slot, o);
  }

  /**
   * A thruster bell pointing down -z from the origin: a collar, the flared
   * nozzle and a lit throat. Returns the kit for chaining.
   */
  nozzle(r: number, len: number, o: Xf = {}, sides = 10): this {
    const at = o.at ?? [0, 0, 0];
    const rot = o.rot ?? [0, 0, 0];
    const place = (z: number): Xf => {
      // Offset along the nozzle's own axis, then rotate with it.
      const v = new THREE.Vector3(0, 0, z).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      return { at: [at[0] + v.x, at[1] + v.y, at[2] + v.z], rot };
    };
    // The bell: open lathe, flaring toward the mouth (lathe y runs along -z after the turn).
    // A shell with some thickness, so the inside of the bell is solid from behind.
    const bell: Array<[number, number]> = [
      [r * 0.55, 0], [r * 0.62, len * 0.35], [r * 0.82, len * 0.75], [r, len],
      [r * 0.86, len], [r * 0.7, len * 0.75], [r * 0.5, len * 0.35], [r * 0.44, 0], [r * 0.55, 0],
    ];
    this.lathe('D', bell, sides, { axis: 'z', ...place(0), rot: [rot[0] + Math.PI, rot[1], rot[2]] });
    this.cyl('F', r * 0.72, r * 0.72, len * 0.28, sides, { axis: 'z', ...place(len * 0.1) });
    this.cyl('G', r * 0.36, r * 0.36, 0.02, sides, { axis: 'z', ...place(-len * 0.3) });
    return this;
  }

  /** A recessed grille: a dark well with `slats` bars across it, facing +z. */
  vent(w: number, h: number, slats: number, o: Xf & { depth?: number; lit?: boolean } = {}): this {
    const dp = o.depth ?? 0.12;
    const at = o.at ?? [0, 0, 0];
    const rot = o.rot ?? [0, 0, 0];
    const eul = new THREE.Euler(rot[0], rot[1], rot[2]);
    const off = (x: number, y: number, z: number): [number, number, number] => {
      const v = new THREE.Vector3(x, y, z).applyEuler(eul);
      return [at[0] + v.x, at[1] + v.y, at[2] + v.z];
    };
    this.box('D', w, h, dp, { at: off(0, 0, -dp / 2), rot, bevel: 0.01 });
    if (o.lit) this.box('G', w * 0.8, h * 0.8, 0.01, { at: off(0, 0, -dp * 0.6), rot });
    for (let i = 0; i < slats; i++) {
      const y = -h / 2 + ((i + 0.5) / slats) * h;
      this.box('K', w * 0.96, (h / slats) * 0.42, dp * 0.6, { at: off(0, y, -dp * 0.15), rot: [rot[0] + 0.5, rot[1], rot[2]], bevel: 0 });
    }
    return this;
  }

  ball(slot: Slot | 'G', r: number, o: Xf = {}): this {
    return this.push(new THREE.IcosahedronGeometry(r, 1), slot, o);
  }

  /** Merge everything added so far into meshes under one group. */
  build(): Built {
    const group = new THREE.Group();
    let armor: THREE.Mesh | null = null;
    let glow: THREE.Mesh | null = null;
    if (this.armor.length) {
      const geo = mergeGeometries(this.armor)!;
      geo.computeVertexNormals();
      armor = new THREE.Mesh(geo, armorMat());
      armor.castShadow = true;
      armor.receiveShadow = true;
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

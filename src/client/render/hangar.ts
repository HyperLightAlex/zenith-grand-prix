// The garage's set: your team's hangar, built round the mech you have chosen.
// The circuit and the other mechs are hidden while it is up, and the camera
// circles the mech inside it. Everything is in the hangar's own frame: the
// mech stands at the origin facing +Z, toward the open bay door; +X is its
// left. The walls stand clear of the camera's circle (about 17 m out), and
// nothing tall stands inside it, so nothing passes between the lens and the
// mech; the clutter is round the walls and up in the roof.
//
// It brings its own two lights (one key, one fill) in place of the circuit's,
// so the materials keep the same lights and never recompile; and its own sky
// mesh on the circuit's sky material, seen through the door.
import * as THREE from 'three';
import { look } from './look';
import { paintedHangar, paintedTexture } from './painted';

const W = 52; // inside width (x)
const BACK = -24; // back wall (z)
const FRONT = 26; // door wall (z)
const ROOF = 18;
const DOOR_W = 30;
const DOOR_H = 13;
const APRON = 44; // how far the floor runs out past the door

export interface HangarTeam {
  /** The team's id, for its painted lettering if there is one. */
  id: string;
  /** The team's name, painted on the walls. */
  name: string;
  /** Paint for the stripes, as CSS. */
  css: string;
  /** The team's glow, for the pad's lamps and the control room's screens. */
  glow: number;
  /** The team's emblem image. */
  emblem: string;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** Yellow and black hazard stripes, one repeat a metre. */
function hazardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#23262e';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#f0bf2c';
  for (let k = -64; k < 128; k += 32) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 16, 0);
    g.lineTo(k + 16 - 64, 64);
    g.lineTo(k - 64, 64);
    g.closePath();
    g.fill();
  }
  return texture(c, [1, 1]);
}

/** Wall cladding: one 4 m panel with its seams and a row of rivets. */
function wallTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#5a667b';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#4a5468';
  g.fillRect(0, 0, 128, 3);
  g.fillRect(0, 0, 3, 128);
  g.fillRect(62, 0, 2, 128);
  g.fillStyle = '#66738a';
  g.fillRect(3, 3, 125, 2);
  g.fillStyle = '#48526a';
  for (let y = 12; y < 128; y += 20) {
    g.fillRect(8, y, 3, 3);
    g.fillRect(117, y, 3, 3);
  }
  return texture(c);
}

/**
 * The hangar floor's markings: the bay's hazard square, the turntable, the
 * lines out to the door, and the wear round the bay. With `base`, on concrete
 * slabs (the plain look); without, on clear, to lie over the painted floor.
 */
function floorTexture(base: boolean): THREE.CanvasTexture {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const D = FRONT - BACK;
  const px = (x: number) => ((x + W / 2) / W) * S;
  // The canvas's top is the back wall; its bottom the door.
  const pz = (z: number) => ((z - BACK) / D) * S;
  const m = S / W; // pixels a metre (across)
  if (base) {
    g.fillStyle = '#5f6878';
    g.fillRect(0, 0, S, S);
    // Slabs, 4 m.
    g.strokeStyle = '#535b6b';
    g.lineWidth = 2;
    for (let x = -24; x <= 24; x += 4) {
      g.beginPath();
      g.moveTo(px(x), 0);
      g.lineTo(px(x), S);
      g.stroke();
    }
    for (let z = BACK; z <= FRONT; z += 4) {
      g.beginPath();
      g.moveTo(0, pz(z));
      g.lineTo(S, pz(z));
      g.stroke();
    }
  }
  // Oil and wear, darker round the bay.
  const wear = g.createRadialGradient(px(0), pz(0), m * 3, px(0), pz(0), m * 14);
  wear.addColorStop(0, 'rgba(40, 46, 58, 0.35)');
  wear.addColorStop(1, 'rgba(40, 46, 58, 0)');
  g.fillStyle = wear;
  g.fillRect(0, 0, S, S);
  // The lines out to the door.
  g.fillStyle = '#e2b72e';
  for (const x of [-3.6, 3.4]) g.fillRect(px(x), pz(8.6), m * 0.22, pz(FRONT) - pz(8.6));
  for (let z = 10; z < FRONT; z += 3) g.fillRect(px(-0.08), pz(z), m * 0.16, m * 1.6);
  // The bay: a hazard-striped square.
  const half = 8.6;
  const band = 0.7;
  g.save();
  g.beginPath();
  g.rect(px(-half), pz(-half), m * half * 2, m * half * 2);
  g.rect(px(-half + band), pz(-half + band), m * (half - band) * 2, m * (half - band) * 2);
  g.clip('evenodd');
  g.fillStyle = '#23262e';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#f0bf2c';
  for (let k = -S; k < S * 2; k += m * 1.4) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + m * 0.7, 0);
    g.lineTo(k + m * 0.7 - S, S);
    g.lineTo(k - S, S);
    g.closePath();
    g.fill();
  }
  g.restore();
  // The turntable: a lighter disc, its rim, and a tick every 15 degrees.
  g.fillStyle = '#6c7586';
  g.beginPath();
  g.arc(px(0), pz(0), m * 6.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e8ecf2';
  g.lineWidth = m * 0.16;
  g.beginPath();
  g.arc(px(0), pz(0), m * 6.4, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = m * 0.08;
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    const r0 = a % 6 === 0 ? 4.9 : 5.6;
    g.beginPath();
    g.moveTo(px(Math.cos(t) * r0), pz(Math.sin(t) * r0));
    g.lineTo(px(Math.cos(t) * 6.2), pz(Math.sin(t) * 6.2));
    g.stroke();
  }
  return texture(c);
}

/** The apron outside the door: tarmac, the taxi line, a hazard edge. */
function apronTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#4a5262';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#e2b72e';
  for (let y = 0; y < 230; y += 22) g.fillRect(126, y, 4, 12);
  g.fillStyle = '#e8ecf2';
  g.fillRect(0, 0, 256, 3);
  return texture(c);
}

/** A big painted number, for the floor of the bay. */
function numberTexture(): [THREE.CanvasTexture, (n: number) => void] {
  const [c, g] = canvas(256, 256);
  const t = texture(c);
  const draw = (n: number) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(232, 236, 242, 0.92)';
    g.font = "italic 800 230px 'Barlow Condensed', 'DIN Condensed', 'Arial Narrow', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 128, 140);
    t.needsUpdate = true;
  };
  return [t, draw];
}

/**
 * A painted light: added to what is behind it, leaving the frame's alpha (the
 * anime look's character mark) as it was, so a shaft of light across a mech
 * neither inks nor un-inks it.
 */
function lightMaterial(map: THREE.Texture, color: THREE.ColorRepresentation, opacity: number, side: THREE.Side = THREE.DoubleSide): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, side, fog: false });
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

/**
 * A see-through decal (a sign, the emblem, painted lettering) blends its
 * colour as usual but leaves the frame's alpha alone, so its soft edges do
 * not read to the anime look's ink as anything but background.
 */
function keepAlpha<M extends THREE.Material>(m: M): M {
  m.transparent = true;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendEquationAlpha = THREE.AddEquation;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

/** A painted tile from the hangar kit, repeated `rx` by `ry` times across what it covers. */
function tile(name: keyof typeof paintedHangar.surfaces, rx: number, ry: number): THREE.Texture {
  const t = paintedTexture(paintedHangar.surfaces[name], { repeat: true });
  t.repeat.set(rx, ry);
  return t;
}

/** A shaft or beam: bright at its top (v = 1), gone at its foot, soft at its sides. */
function beamTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 256);
  const img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    const along = Math.pow(1 - y / 255, 0.25) * (1 - Math.pow(y / 255, 6)) ;
    for (let x = 0; x < 64; x++) {
      const u = Math.abs(x / 63 - 0.5) * 2;
      const across = 1 - Math.min(1, Math.max(0, (u - 0.55) / 0.45));
      const a = (1 - y / 255) * across * along;
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

/** A soft round glow, for pools of light and the haloes round lamps. */
function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return texture(c);
}

/** A soft-edged oblong of light, for the haloes round the roof's lamp panels. */
function haloTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 64);
  const img = g.createImageData(128, 64);
  const edge = (u: number) => {
    const d = Math.abs(u - 0.5) * 2;
    const t = Math.min(1, Math.max(0, (d - 0.35) / 0.65));
    return 1 - t * t * (3 - 2 * t);
  };
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(edge(x / 127) * edge(y / 63) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

/** Painted wall lettering: white heavy italic capitals with a navy outline and shadow, on clear. */
function letteringTexture(w: number, h: number): [THREE.CanvasTexture, (text: string) => void] {
  const [c, g] = canvas(w, h);
  const t = texture(c);
  const draw = (text: string) => {
    g.clearRect(0, 0, w, h);
    let size = h * 0.78;
    const font = (px: number) => `italic 800 ${px}px 'Barlow Condensed', 'DIN Condensed', 'Arial Narrow', sans-serif`;
    g.font = font(size);
    const wide = g.measureText(text).width;
    if (wide > w * 0.9) size *= (w * 0.9) / wide;
    g.font = font(size);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const x = w / 2;
    const y = h * 0.52;
    g.fillStyle = '#0d1630';
    g.fillText(text, x + size * 0.05, y + size * 0.06);
    g.lineWidth = size * 0.09;
    g.strokeStyle = '#0d1630';
    g.strokeText(text, x, y);
    g.fillStyle = '#f4f6fb';
    g.fillText(text, x, y);
    t.needsUpdate = true;
  };
  return [t, draw];
}

/** A bay's board on its cradle: BAY over a big number, white on dark. */
function bayBoardTexture(): [THREE.CanvasTexture, (n: number) => void] {
  const [c, g] = canvas(256, 192);
  const t = texture(c);
  const draw = (n: number) => {
    g.fillStyle = '#1b2130';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#f0bf2c';
    g.fillRect(0, 0, 256, 10);
    g.fillRect(0, 182, 256, 10);
    g.fillStyle = '#e8ecf2';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = "italic 700 34px 'Barlow Condensed', 'DIN Condensed', 'Arial Narrow', sans-serif";
    g.fillText('BAY', 128, 40);
    g.font = "italic 800 128px 'Barlow Condensed', 'DIN Condensed', 'Arial Narrow', sans-serif";
    g.fillText(String(n), 128, 116);
    t.needsUpdate = true;
  };
  return [t, draw];
}

export class Hangar {
  /** Add this to the scene: the hangar and its sky. Hidden until `show`. */
  readonly root = new THREE.Group();
  /** Everything in the hangar's own frame. */
  private readonly inside = new THREE.Group();
  private readonly sky: THREE.Mesh;
  private readonly teamMat = new THREE.MeshLambertMaterial({ color: 0x3d8bff });
  private readonly glowMat = new THREE.MeshBasicMaterial({ color: 0x45e8ff });
  private readonly screenMat = keepAlpha(new THREE.MeshBasicMaterial({ color: 0x45e8ff, opacity: 0.75 }));
  private readonly emblemMat = keepAlpha(new THREE.MeshLambertMaterial({ alphaTest: 0.4 }));
  private readonly drawNumber: (n: number) => void;
  private readonly drawName: (text: string) => void;
  /**
   * The anime look's painted kit: each plain material's painted twin, the
   * things shown only with it, and which look the hangar is dressed for.
   */
  private readonly twins = new Map<THREE.Material, THREE.Material>();
  private readonly paintedOnly: THREE.Object3D[] = [];
  private readonly swaps: Array<(painted: boolean) => void> = [];
  private painted: boolean | null = null;
  /** The team's name on the walls: drawn in code, or painted (for a team whose lettering has been painted). */
  private readonly names: Array<{ mesh: THREE.Mesh; plainWidth: number; paintedWidth: number }> = [];
  private readonly nameDrawn: THREE.MeshLambertMaterial;
  private readonly namePainted: THREE.MeshLambertMaterial;
  private teamId = '';
  private readonly drawBays: Array<(n: number) => void> = [];
  /** The daylight in through the door, in the circuit's light. */
  private readonly spillMat: THREE.MeshBasicMaterial;
  private emblemUrl = '';
  private readonly loader = new THREE.TextureLoader();
  /** The emblems, loaded once each. */
  private readonly emblems = new Map<string, THREE.Texture>();

  constructor() {
    this.root.visible = false;
    this.inside.matrixAutoUpdate = false;
    this.root.add(this.inside);
    // The circuit's sky, through the door, following the camera like the circuit's own.
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.root.add(this.sky);

    const add = (mesh: THREE.Object3D) => {
      this.inside.add(mesh);
      return mesh;
    };
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, y, z);
      return add(b) as THREE.Mesh;
    };
    const plane = (w: number, h: number, mat: THREE.Material) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

    const steel = new THREE.MeshLambertMaterial({ color: 0x3d475a });
    const rail = new THREE.MeshLambertMaterial({ color: 0x8a95a8 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x252c3b });
    const hazard = hazardTexture();
    // Hazard stripes a metre apart, whatever the size of what they are painted on.
    const hazardMat = (across: number, up: number) => {
      const t = hazard.clone();
      t.repeat.set(across, up);
      t.needsUpdate = true;
      const plain = new THREE.MeshLambertMaterial({ map: t });
      this.twins.set(plain, new THREE.MeshLambertMaterial({ map: tile('hazard', across, up) }));
      return plain;
    };
    const wallTex = wallTexture();

    // ---- lights: a key from high over the door's left, and a cool fill
    const key = new THREE.DirectionalLight(0xfff0dc, 2.3);
    key.position.set(16, 30, 22);
    const aim = new THREE.Object3D();
    key.target = aim;
    add(key);
    add(aim);
    add(new THREE.HemisphereLight(0xb4c4dc, 0x3c4354, 1.0));

    // ---- floor, and the apron out through the door
    const floorPlain = new THREE.MeshLambertMaterial({ map: floorTexture(true) });
    this.twins.set(floorPlain, new THREE.MeshLambertMaterial({ map: tile('floor', W / 4, (FRONT - BACK) / 4) }));
    const floor = plane(W, FRONT - BACK, floorPlain);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.01, (FRONT + BACK) / 2);
    add(floor);
    // Over the painted floor, the markings on their own.
    const marks = plane(W, FRONT - BACK, keepAlpha(new THREE.MeshLambertMaterial({ map: floorTexture(false), depthWrite: false })));
    marks.rotation.x = -Math.PI / 2;
    marks.position.set(0, -0.005, (FRONT + BACK) / 2);
    marks.renderOrder = 1;
    add(marks);
    this.paintedOnly.push(marks);
    const apronTex = apronTexture();
    apronTex.wrapS = apronTex.wrapT = THREE.RepeatWrapping;
    apronTex.repeat.set(1, 2);
    const apron = plane(DOOR_W + 30, APRON, new THREE.MeshLambertMaterial({ map: apronTex }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.02, FRONT + APRON / 2);
    add(apron);
    // The apron's edge: a hazard kerb and a rail, and the sky past it.
    box(DOOR_W + 30, 0.3, 0.6, hazardMat(DOOR_W + 30, 1), 0, 0.15, FRONT + APRON);
    box(DOOR_W + 30, 0.12, 0.12, rail, 0, 1.15, FRONT + APRON);
    for (let x = -28; x <= 28; x += 4) box(0.12, 1.15, 0.12, rail, x, 0.58, FRONT + APRON);
    // The bay's number, painted on the floor behind the mech, read from the door.
    const [numTex, draw] = numberTexture();
    this.drawNumber = draw;
    const num = plane(6, 6, keepAlpha(new THREE.MeshLambertMaterial({ map: numTex, alphaTest: 0.3 })));
    num.rotation.x = -Math.PI / 2;
    num.position.set(0, 0.0, -12.5);
    add(num);
    // The turntable's lamps, round its rim, in the team's glow.
    const lampGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.08, 8);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const lamp = new THREE.Mesh(lampGeo, this.glowMat);
      lamp.position.set(Math.cos(a) * 6.85, 0.04, Math.sin(a) * 6.85);
      add(lamp);
    }

    // ---- walls: cladding, a hazard skirt, the team's stripe
    const wall = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
      const t = wallTex.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(w / 4, h / 4);
      t.needsUpdate = true;
      const plain = new THREE.MeshLambertMaterial({ map: t });
      this.twins.set(plain, new THREE.MeshLambertMaterial({ map: tile('cladding', w / 4, h / 4) }));
      const p = plane(w, h, plain);
      p.position.set(x, y, z);
      p.rotation.y = ry;
      add(p);
    };
    const D = FRONT - BACK;
    const midZ = (FRONT + BACK) / 2;
    wall(W, ROOF, 0, ROOF / 2, BACK, 0);
    wall(D, ROOF, W / 2, ROOF / 2, midZ, -Math.PI / 2);
    wall(D, ROOF, -W / 2, ROOF / 2, midZ, Math.PI / 2);
    const side = (W - DOOR_W) / 2;
    wall(side, ROOF, -(DOOR_W / 2 + side / 2), ROOF / 2, FRONT, Math.PI);
    wall(side, ROOF, DOOR_W / 2 + side / 2, ROOF / 2, FRONT, Math.PI);
    wall(DOOR_W, ROOF - DOOR_H, 0, (ROOF + DOOR_H) / 2, FRONT, Math.PI);
    // The skirt and the stripe, just off each wall.
    const trim = (len: number, x: number, z: number, ry: number) => {
      const skirt = box(len, 1.1, 0.12, hazardMat(len, 1), x, 0.55, z);
      skirt.rotation.y = ry;
      const stripe = box(len, 0.55, 0.1, this.teamMat, x, 5.4, z);
      stripe.rotation.y = ry;
    };
    trim(W, 0, BACK + 0.1, 0);
    trim(D, W / 2 - 0.1, midZ, Math.PI / 2);
    trim(D, -W / 2 + 0.1, midZ, Math.PI / 2);
    // Hazard stripes are on the door's posts too, and its shutter is rolled up into the lintel.
    const doorPost = hazardMat(1.2, DOOR_H);
    for (const sx of [-1, 1]) box(1.2, DOOR_H, 1.2, doorPost, sx * (DOOR_W / 2 + 0.6), DOOR_H / 2, FRONT - 0.6);
    box(DOOR_W + 2.4, 1.6, 1.6, steel, 0, DOOR_H + 0.8, FRONT - 0.8);
    for (let k = 0; k < 4; k++) box(DOOR_W, 0.12, 0.08, rail, 0, DOOR_H + 0.25 + k * 0.38, FRONT - 1.65);

    // ---- the team's emblem, high on the back wall, on a band of its colour
    box(16, 11, 0.15, this.teamMat, 0, 11.5, BACK + 0.12);
    const emblem = plane(9, 9, this.emblemMat);
    emblem.position.set(0, 11.5, BACK + 0.25);
    add(emblem);

    // ---- the roof: trusses, light panels, and an overhead crane
    this.twins.set(roofMat, new THREE.MeshLambertMaterial({ map: tile('roof', W / 4, D / 4) }));
    const roof = plane(W, D, roofMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, ROOF, midZ);
    add(roof);
    // Just brighter than white: a touch of bloom in the plain look, none in the anime look's higher threshold.
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.12, 1.05) });
    for (let z = BACK + 4; z < FRONT; z += 8) {
      box(W, 1.0, 0.5, steel, 0, ROOF - 0.9, z);
      box(W, 0.3, 0.3, steel, 0, ROOF - 2.6, z);
      for (let x = -24; x <= 24; x += 3) {
        const web = box(0.2, 2.2, 0.2, steel, x, ROOF - 1.75, z);
        web.rotation.z = ((x / 3) % 2 === 0 ? 1 : -1) * 0.6;
      }
    }
    for (let z = BACK + 8; z < FRONT - 2; z += 8) for (const x of [-15, 0, 15]) box(7, 0.25, 1.4, lampMat, x, ROOF - 0.5, z);
    // The crane: rails along the roof, a bridge across them, the hoist and its hook.
    for (const x of [-13, 13]) box(0.6, 0.8, D - 4, steel, x, ROOF - 3.4, midZ);
    box(27, 1.1, 1.3, this.teamMat, 0, ROOF - 4.3, -6);
    box(2.2, 1.6, 2.0, steel, 4, ROOF - 5.6, -6);
    box(0.08, 4.5, 0.08, rail, 4, ROOF - 8.6, -6);
    box(0.9, 0.5, 0.5, hazardMat(1, 0.5), 4, ROOF - 11, -6);

    // ---- catwalks along the side walls, and the control room on the left one
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 1.2);
      const deck = new THREE.MeshLambertMaterial({ color: 0x3d475a });
      this.twins.set(deck, new THREE.MeshLambertMaterial({ map: tile('grating', 2.4 / 1.5, (D - 2) / 1.5) }));
      box(2.4, 0.25, D - 2, deck, x, 7.4, midZ);
      box(0.08, 0.08, D - 2, rail, x - sx * 1.15, 8.5, midZ);
      box(0.08, 0.08, D - 2, rail, x - sx * 1.15, 7.95, midZ);
      for (let z = BACK + 2; z <= FRONT - 2; z += 3) {
        box(0.08, 1.1, 0.08, rail, x - sx * 1.15, 7.95, z);
        box(0.3, 7.4, 0.3, steel, x + sx * 0.9, 3.7, z);
      }
    }
    // The control room: a glazed box out from the wall, its screens in the team's glow.
    box(3.2, 4, 10, steel, W / 2 - 1.6, 10.8, -10);
    const glass = plane(9, 2.4, this.screenMat);
    glass.position.set(W / 2 - 3.25, 11.1, -10);
    glass.rotation.y = -Math.PI / 2;
    add(glass);
    box(0.25, 0.2, 9.4, rail, W / 2 - 3.3, 9.85, -10);

    // ---- empty maintenance cradles either side of the back wall
    const cradleFoot = hazardMat(0.5, 1.2);
    const cradleDeck = new THREE.MeshLambertMaterial({ color: 0x3d475a });
    this.twins.set(cradleDeck, new THREE.MeshLambertMaterial({ map: tile('grating', 7.2 / 1.5, 4.8 / 1.5) }));
    for (const sx of [-1, 1]) {
      const cx = sx * 17;
      const cz = BACK + 5.5;
      for (const dx of [-3.4, 3.4]) {
        for (const dz of [-2.2, 2.2]) {
          box(0.4, 12, 0.4, steel, cx + dx, 6, cz + dz);
          box(0.42, 1.2, 0.42, cradleFoot, cx + dx, 0.6, cz + dz);
        }
      }
      for (const y of [4.2, 8.4]) {
        box(7.2, 0.25, 4.8, cradleDeck, cx, y, cz);
        box(7.2, 0.08, 0.08, rail, cx, y + 1.1, cz + 2.4);
      }
      box(7.6, 0.6, 5.2, this.teamMat, cx, 12.2, cz);
    }

    // ---- crates, tanks and a parts cart along the walls
    const crate = new THREE.MeshLambertMaterial({ color: 0x7d7556 });
    const crate2 = new THREE.MeshLambertMaterial({ color: 0x5b6a57 });
    const tank = new THREE.MeshLambertMaterial({ color: 0xc8ccd4 });
    const stack = (x: number, z: number, n: number, mat: THREE.Material) => {
      for (let k = 0; k < n; k++) box(2.2, 2.0, 2.2, mat, x, 1.0 + k * 2.0, z).rotation.y = (k % 2) * 0.12;
    };
    stack(-22.5, 8, 2, crate);
    stack(-22.5, 10.6, 1, crate2);
    stack(-20, 9, 1, crate);
    stack(22.5, 14, 3, crate2);
    stack(22.5, 16.6, 1, crate);
    stack(20.4, 2, 1, crate2);
    for (let k = 0; k < 4; k++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 12), tank);
      t.position.set(-23.6 + (k % 2) * 1.0, 0.9, -2 - Math.floor(k / 2) * 1.0);
      add(t);
    }
    box(3.4, 1.0, 1.6, steel, 18, 0.9, -3.5);
    box(3.0, 0.5, 1.2, this.teamMat, 18, 1.65, -3.5);

    // ================= light =================
    // No more real lights (a circuit has one key and one fill, and so does
    // the hangar, so nothing recompiles): the rest is painted light, added
    // over the scene.
    const beam = beamTexture();
    const glow = glowTexture();
    const warm = 0xfff1dc;

    // ---- high windows down the left wall, and the shafts of daylight through them
    const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.08, 1.12) });
    const shaftDir = new THREE.Vector3(-0.6, -0.78, 0.16).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const shaftLen = 15 / -shaftDir.y;
    for (const z of [-15, -7, 1, 9]) {
      const pane = plane(2.6, 3.2, windowMat);
      pane.position.set(W / 2 - 0.05, 15, z);
      pane.rotation.y = -Math.PI / 2;
      add(pane);
      for (const dz of [-0.45, 0.45]) box(0.1, 3.2, 0.1, steel, W / 2 - 0.1, 15, z + dz);
      box(0.1, 0.12, 2.6, steel, W / 2 - 0.1, 15, z);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.4, shaftLen, 2.0), lightMaterial(beam, warm, 0.075));
      shaft.position.set(W / 2 - 0.3, 15, z).addScaledVector(shaftDir, shaftLen / 2);
      shaft.quaternion.setFromUnitVectors(up, shaftDir.clone().negate());
      shaft.renderOrder = 2;
      add(shaft);
      // Where it lands: a patch of brighter floor.
      const pool = plane(6.5, 3.4, lightMaterial(glow, warm, 0.22, THREE.FrontSide));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(W / 2 - 0.3 + shaftDir.x * shaftLen, 0.02, z + shaftDir.z * shaftLen);
      pool.renderOrder = 1;
      add(pool);
    }

    // ---- floodlights on the cradles and the catwalks, all aimed at the mech
    const target = new THREE.Vector3(0, 4.5, 0);
    const lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.2, 1.1) });
    const flood = (x: number, y: number, z: number) => {
      const at = new THREE.Vector3(x, y, z);
      const dir = target.clone().sub(at).normalize();
      const lamp = new THREE.Group();
      lamp.position.copy(at);
      lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 0.6), steel);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.58), lensMat);
      lens.position.z = 0.31;
      lamp.add(housing, lens);
      add(lamp);
      // The beam: a faint cone out to just short of the mech.
      const len = at.distanceTo(target) * 0.8;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 3.2, len, 20, 1, true), lightMaterial(beam, warm, 0.07));
      cone.position.copy(at).addScaledVector(dir, len / 2 + 0.3);
      cone.quaternion.setFromUnitVectors(up, dir.clone().negate());
      cone.renderOrder = 2;
      add(cone);
    };
    for (const sx of [-1, 1]) {
      flood(sx * 14.2, 12.9, BACK + 8);
      flood(sx * 19.8, 12.9, BACK + 8);
      flood(sx * (W / 2 - 2.5), 8.9, 4);
    }
    // The turntable stands in a pool of their light.
    const stage = plane(17, 17, lightMaterial(glow, warm, 0.2, THREE.FrontSide));
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = 0.03;
    stage.renderOrder = 1;
    add(stage);

    // ---- haloes round the roof's lamps
    const haloTex = haloTexture();
    for (let z = BACK + 8; z < FRONT - 2; z += 8) {
      for (const x of [-15, 0, 15]) {
        const halo = plane(9.5, 3.2, lightMaterial(haloTex, warm, 0.2, THREE.FrontSide));
        halo.rotation.x = Math.PI / 2;
        // Just above the panel's face, which hides its middle: the glow shows round it and never piles up into bloom on it.
        halo.position.set(x, ROOF - 0.6, z);
        halo.renderOrder = 2;
        add(halo);
      }
    }

    // ---- daylight in through the door, across the floor
    this.spillMat = lightMaterial(beam, warm, 0.16, THREE.FrontSide);
    const spill = plane(DOOR_W, 16, this.spillMat);
    spill.rotation.x = -Math.PI / 2;
    // The texture's bright end (v = 1) at the door.
    spill.rotation.z = Math.PI;
    spill.position.set(0, 0.025, FRONT - 8);
    spill.renderOrder = 1;
    add(spill);

    // ================= set dressing =================
    const primer = new THREE.MeshLambertMaterial({ color: 0x9aa1ad });
    const dark = new THREE.MeshLambertMaterial({ color: 0x232936 });
    const red = new THREE.MeshLambertMaterial({ color: 0xc23b33 });

    // ---- a spare arm on trestles by the right-hand wall
    {
      const arm = new THREE.Group();
      arm.position.set(-19.6, 0, 1.5);
      const part = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, y, z);
        b.rotation.x = rx;
        arm.add(b);
        return b;
      };
      for (const z of [-2.2, 2.4]) {
        part(2.6, 0.25, 0.5, dark, 0, 2.0, z);
        for (const sx of [-1, 1]) part(0.18, 2.2, 0.18, dark, sx * 1.1, 1.0, z).rotation.z = sx * 0.18;
      }
      part(1.7, 1.6, 5.6, primer, 0, 2.95, 0.2);
      part(1.9, 0.3, 4.8, this.teamMat, 0, 3.85, 0.2);
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.9, 14), dark);
      elbow.rotation.z = Math.PI / 2;
      elbow.position.set(0, 2.95, -2.9);
      arm.add(elbow);
      part(1.9, 1.3, 1.6, primer, 0, 2.85, 3.8);
      for (let k = 0; k < 4; k++) part(0.36, 0.42, 1.1, dark, -0.6 + k * 0.4, 2.55, 4.85, 0.7);
      part(0.42, 0.42, 0.9, dark, 0.95, 3.15, 4.4, 0.3);
      for (const z of [-1.2, 1.6]) part(0.5, 0.35, 0.5, hazardMat(0.5, 0.35), 0, 3.9, z);
      add(arm);
    }

    // ---- tool chests and shelving
    const chest = (x: number, z: number, ry: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.9, 0.9), red);
      body.position.y = 1.15;
      g.add(body);
      for (let k = 0; k < 5; k++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.02), dark);
        line.position.set(0, 0.45 + k * 0.33, 0.46);
        g.add(line);
      }
      for (const sx of [-0.6, 0.6]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx, 0.1, 0.3);
        g.add(wheel);
      }
      add(g);
    };
    chest(23.6, 5.5, -Math.PI / 2);
    chest(23.6, 7.4, -Math.PI / 2);
    chest(-10.5, BACK + 0.9, 0);
    const shelving = (x: number) => {
      for (const sx of [-1.6, 1.6]) for (const sz of [-0.5, 0.5]) box(0.1, 4.6, 0.1, dark, x + sx, 2.3, BACK + 1.0 + sz);
      for (const y of [0.4, 1.9, 3.4, 4.5]) box(3.3, 0.08, 1.1, dark, x, y, BACK + 1.0);
      const bins = [primer, this.teamMat, red, primer];
      for (let k = 0; k < 6; k++) box(0.75, 0.6, 0.8, bins[k % 4], x - 1.1 + (k % 3) * 1.1, (k < 3 ? 0.4 : 1.9) + 0.34, BACK + 1.0);
      box(1.4, 0.9, 0.9, primer, x - 0.7, 3.4 + 0.49, BACK + 1.0);
    };
    shelving(10.5);

    // ---- cables: sagging between the trusses near the walls, and a power feed across the floor to the turntable
    const cable = (pts: THREE.Vector3[], r: number) => {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 8, r, 6), dark);
      add(tube);
    };
    for (const x of [-21, -19.5, 20.5]) {
      for (let z = BACK + 4; z < FRONT - 8; z += 8) {
        const sag = 1.1 + ((x * 7 + z) % 3) * 0.25;
        const y = ROOF - 2.75;
        cable([new THREE.Vector3(x, y, z), new THREE.Vector3(x, y - sag * 0.75, z + 2), new THREE.Vector3(x, y - sag, z + 4), new THREE.Vector3(x, y - sag * 0.75, z + 6), new THREE.Vector3(x, y, z + 8)], 0.05);
      }
    }
    // The feed: from a junction box on the right-hand wall, down and across the floor to a plug at the turntable's rim.
    box(1.2, 1.6, 0.5, dark, -W / 2 + 0.35, 2.4, -7);
    box(0.9, 0.5, 0.6, hazardMat(0.9, 0.5), -6.9, 0.25, -2.6);
    cable(
      [
        new THREE.Vector3(-W / 2 + 0.5, 1.7, -7),
        new THREE.Vector3(-W / 2 + 1.0, 0.12, -7.3),
        new THREE.Vector3(-20, 0.12, -6.2),
        new THREE.Vector3(-15, 0.12, -7.6),
        new THREE.Vector3(-10.5, 0.12, -4.5),
        new THREE.Vector3(-7.2, 0.12, -2.8),
      ],
      0.13,
    );

    // ---- the team's name on the right-hand wall and over the door: drawn
    // in code, or as painted in the anime look (sized by `fitNames`)
    const [nameTex, drawName] = letteringTexture(1024, 200);
    this.drawName = drawName;
    this.nameDrawn = keepAlpha(new THREE.MeshLambertMaterial({ map: nameTex, alphaTest: 0.35 }));
    this.namePainted = keepAlpha(new THREE.MeshLambertMaterial({ map: null, alphaTest: 0.35 }));
    const side1 = plane(1, 1, this.nameDrawn);
    side1.position.set(-W / 2 + 0.06, 12.4, 2);
    side1.rotation.y = Math.PI / 2;
    add(side1);
    this.names.push({ mesh: side1, plainWidth: 22, paintedWidth: 16 });
    const overDoor = plane(1, 1, this.nameDrawn);
    overDoor.position.set(0, 15.7, FRONT - 0.06);
    overDoor.rotation.y = Math.PI;
    add(overDoor);
    this.names.push({ mesh: overDoor, plainWidth: 18, paintedWidth: 12 });

    // ---- the anime look's own: pipes along the foot of the walls, and the safety signs
    const strip = (len: number, x: number, z: number, ry: number) => {
      const t = tile('services', len / (4 * paintedHangar.servicesAspect), 1);
      t.wrapT = THREE.ClampToEdgeWrapping;
      const p = plane(len, 4, new THREE.MeshLambertMaterial({ map: t }));
      p.position.set(x, 1.1 + 2, z);
      p.rotation.y = ry;
      add(p);
      this.paintedOnly.push(p);
    };
    strip(W, 0, BACK + 0.05, 0);
    strip(D, W / 2 - 0.05, midZ, -Math.PI / 2);
    strip(D, -W / 2 + 0.05, midZ, Math.PI / 2);
    const sign = (name: keyof typeof paintedHangar.signs, height: number, x: number, y: number, z: number, ry: number) => {
      const s = paintedHangar.signs[name];
      const p = plane(height * s.aspect, height, keepAlpha(new THREE.MeshLambertMaterial({ map: paintedTexture(s.url), alphaTest: 0.4 })));
      p.position.set(x, y, z);
      p.rotation.y = ry;
      add(p);
      this.paintedOnly.push(p);
    };
    for (const sx of [-1, 1]) sign('caution', 2.6, sx * 19.5, 7.6, FRONT - 0.08, Math.PI);
    sign('noSmoking', 1.35, -W / 2 + 0.08, 6.45, -3.5, Math.PI / 2);
    sign('voltage', 1.35, -W / 2 + 0.08, 6.45, -7, Math.PI / 2);
    sign('firePoint', 1.35, W / 2 - 0.08, 6.45, 9.5, -Math.PI / 2);
    // The other two bays' boards, on the front of their cradles.
    for (const sx of [-1, 1]) {
      const [t, draw] = bayBoardTexture();
      this.drawBays.push(draw);
      const board = plane(3.4, 2.55, new THREE.MeshLambertMaterial({ map: t }));
      board.position.set(sx * 17, 10.6, BACK + 5.5 + 2.65);
      add(board);
    }

    // Every mesh whose material has a painted twin wears it in the anime look.
    this.inside.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const plain = mesh.material as THREE.Material | undefined;
      const twin = plain && !Array.isArray(plain) ? this.twins.get(plain) : undefined;
      if (twin) this.swaps.push((on) => (mesh.material = on ? twin : plain!));
    });
  }

  /** Dress the hangar for a look: the painted kit in the anime look, drawn in code in the plain one. */
  private dress(painted: boolean): void {
    this.painted = painted;
    for (const f of this.swaps) f(painted);
    for (const o of this.paintedOnly) o.visible = painted;
    this.fitNames();
  }

  /** The team's name: painted, where it has been, in the anime look; drawn in code otherwise. */
  private fitNames(): void {
    const sign = this.painted ? paintedHangar.signs[this.teamId as keyof typeof paintedHangar.signs] : undefined;
    if (sign && this.namePainted.userData.url !== sign.url) {
      this.namePainted.map = paintedTexture(sign.url);
      this.namePainted.userData.url = sign.url;
      this.namePainted.needsUpdate = true;
    }
    for (const n of this.names) {
      const w = sign ? n.paintedWidth : n.plainWidth;
      n.mesh.material = sign ? this.namePainted : this.nameDrawn;
      n.mesh.scale.set(w, w / (sign ? sign.aspect : 5.12), 1);
    }
  }

  /** The circuit's sky material (a new circuit brings a new one), and its daylight for the spill through the door. */
  setSky(material: THREE.Material, daylight: THREE.ColorRepresentation = 0xfff1dc): void {
    this.sky.material = material;
    this.spillMat.color.set(daylight);
  }

  /** Dress the hangar in a team's colours and emblem. */
  setTeam(team: HangarTeam): void {
    this.teamMat.color.set(team.css);
    this.drawName(team.name);
    this.teamId = team.id;
    this.fitNames();
    this.glowMat.color.setHex(team.glow);
    this.screenMat.color.setHex(team.glow);
    if (team.emblem !== this.emblemUrl) {
      this.emblemUrl = team.emblem;
      this.emblemMat.map = this.emblem(team.emblem);
      this.emblemMat.needsUpdate = true;
    }
  }

  /** Start loading the emblems before the garage first needs one. */
  preload(urls: string[]): void {
    for (const url of urls) this.emblem(url);
  }

  private emblem(url: string): THREE.Texture {
    let t = this.emblems.get(url);
    if (!t) {
      t = this.loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      this.emblems.set(url, t);
    }
    return t;
  }

  /** The number painted on the bay's floor; the empty cradles either side are the other two bays, in order. */
  setBay(n: number): void {
    this.drawNumber(n);
    const others = [1, 2, 3].filter((k) => k !== n);
    this.drawBays.forEach((draw, i) => draw(others[i]));
  }

  /** Stand the hangar round a mech whose transform is `frame`, and show it. */
  show(frame: THREE.Matrix4): void {
    this.inside.matrix.copy(frame);
    this.inside.matrixWorldNeedsUpdate = true;
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }

  get showing(): boolean {
    return this.root.visible;
  }

  /** Each frame while it is up: the sky stays round the camera. */
  update(camera: THREE.Camera): void {
    this.sky.position.copy(camera.position);
    if (look.on !== this.painted) this.dress(look.on);
  }
}

// Markings: a sheet of small decals drawn once per team (the team emblem,
// caution stripes, stencils and warning marks) and stuck on the armour as
// little planes, lit like the armour so they sit in its shadows.
import * as THREE from 'three';
import { EMBLEMS } from '../../ui/hudArt';
import { toonGradient, type Livery } from '../palette';
import { MARKS, type MarkName } from './mechArt';

export type DecalKind = 'emblem' | 'caution' | 'stencil' | 'warning' | 'text' | 'arrow' | 'stripes' | 'lift';
const CELLS: DecalKind[] = ['emblem', 'caution', 'stencil', 'warning', 'text', 'arrow', 'stripes', 'lift'];
const CELL = 128;

const sheets = new Map<string, THREE.MeshToonMaterial>();

const css = (c: number) => `#${new THREE.Color(c).getHexString()}`;

function drawSheet(livery: Livery): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CELL * 4;
  c.height = CELL * 2;
  const g = c.getContext('2d')!;
  const trim = css(livery.trim);
  const dark = '#151a26';
  const light = css(livery.primary);
  const font = (w: number, px: number) => `italic ${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % 4) * CELL, Math.floor(i / 4) * CELL);
    g.beginPath();
    g.rect(0, 0, CELL, CELL);
    g.clip();
    draw();
    g.restore();
  };
  // Team emblem: Solstice a rising sun, Vanta a split chevron.
  cell(0, () => {
    g.fillStyle = trim;
    g.strokeStyle = trim;
    g.lineWidth = 7;
    if (livery.id === 'vanta') {
      g.beginPath();
      g.moveTo(14, 26);
      g.lineTo(64, 112);
      g.lineTo(114, 26);
      g.lineTo(90, 26);
      g.lineTo(64, 72);
      g.lineTo(38, 26);
      g.closePath();
      g.fill();
      g.fillRect(56, 12, 16, 30);
    } else {
      g.beginPath();
      g.arc(64, 84, 30, Math.PI, 0);
      g.closePath();
      g.fill();
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + (k / 6) * Math.PI;
        g.beginPath();
        g.moveTo(64 + Math.cos(a) * 40, 84 + Math.sin(a) * 40);
        g.lineTo(64 + Math.cos(a) * 58, 84 + Math.sin(a) * 58);
        g.stroke();
      }
      g.fillRect(14, 94, 100, 8);
    }
  });
  // Caution stripes.
  cell(1, () => {
    g.fillStyle = '#f2b51c';
    g.fillRect(0, 34, CELL, 60);
    g.fillStyle = dark;
    for (let x = -60; x < CELL + 60; x += 30) {
      g.beginPath();
      g.moveTo(x, 94);
      g.lineTo(x + 15, 94);
      g.lineTo(x + 75, 34);
      g.lineTo(x + 60, 34);
      g.closePath();
      g.fill();
    }
  });
  // Stencil: the series code.
  cell(2, () => {
    g.fillStyle = dark;
    g.font = font(800, 54);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ZGP', 64, 52);
    g.font = font(700, 26);
    g.fillText(livery.short + '-01', 64, 96);
  });
  // Warning triangle.
  cell(3, () => {
    g.fillStyle = '#f2b51c';
    g.beginPath();
    g.moveTo(64, 14);
    g.lineTo(118, 110);
    g.lineTo(10, 110);
    g.closePath();
    g.fill();
    g.fillStyle = dark;
    g.fillRect(58, 44, 12, 38);
    g.fillRect(58, 90, 12, 12);
  });
  // Small print.
  cell(4, () => {
    g.fillStyle = dark;
    g.font = font(700, 17);
    const lines = ['CAUTION', 'THRUSTER EXHAUST', 'KEEP CLEAR 30M', 'ZENITH GP REG.', 'FRAME CLASS A'];
    lines.forEach((l, i) => g.fillText(l, 8, 24 + i * 21));
  });
  // Direction arrow.
  cell(5, () => {
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(10, 50);
    g.lineTo(78, 50);
    g.lineTo(78, 28);
    g.lineTo(120, 64);
    g.lineTo(78, 100);
    g.lineTo(78, 78);
    g.lineTo(10, 78);
    g.closePath();
    g.fill();
  });
  // Twin racing stripes in the trim colour.
  cell(6, () => {
    g.fillStyle = trim;
    g.fillRect(0, 26, CELL, 26);
    g.fillRect(0, 76, CELL, 26);
  });
  // Lifting point: a ringed target.
  cell(7, () => {
    g.strokeStyle = livery.id === 'vanta' ? light : dark;
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 40, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(64, 64, 14, 0, Math.PI * 2);
    g.fillStyle = g.strokeStyle;
    g.fill();
  });
  return c;
}

// ---- the anime look's painted markings ----------------------------------------
// The same eight cells, painted (art/mech-sheets, P2), with the team emblem
// from the HUD's U3 sheet: the white markings coloured for the team (dark on
// Solstice's white, light on Vanta's charcoal; the stripes in the trim), the
// caution stripes and the warning triangle as painted. Swapped in for the
// drawn sheet while the look is on (setPaintedMarkings).

const PAINTED_CELL = 256;
const images = new Map<string, Promise<HTMLImageElement>>();

function image(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    p = img.decode().then(() => img);
    images.set(url, p);
  }
  return p;
}

/** The colour for a team's white markings: dark on white armour, light on dark. */
function inkFor(livery: Livery): string {
  return livery.id === 'vanta' ? css(livery.trim) : '#151a26';
}

/**
 * Draw `img` fitted inside a cell (`pad` of it clear round the edge), centred.
 * `tint`: 'fill' recolours it entirely (a white marking), 'multiply' keeps its
 * dark outline (the race numbers), null leaves it as painted.
 */
function drawFitted(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number, pad: number, tint: string | null, mode: 'fill' | 'multiply' = 'fill'): void {
  const room = size * (1 - 2 * pad);
  const s = Math.min(room / img.width, room / img.height);
  const w = img.width * s;
  const h = img.height * s;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const cg = c.getContext('2d')!;
  cg.drawImage(img, 0, 0, c.width, c.height);
  if (tint) {
    cg.globalCompositeOperation = mode === 'fill' ? 'source-in' : 'multiply';
    cg.fillStyle = tint;
    cg.fillRect(0, 0, c.width, c.height);
    if (mode === 'multiply') {
      cg.globalCompositeOperation = 'destination-in';
      cg.drawImage(img, 0, 0, c.width, c.height);
    }
  }
  g.drawImage(c, x + (size - w) / 2, y + (size - h) / 2);
}

/** The painted sheet for a team, in the drawn sheet's layout; filled in once its pictures are in. */
function paintedSheet(livery: Livery): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = PAINTED_CELL * 4;
  c.height = PAINTED_CELL * 2;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.shared = true;
  const ink = inkFor(livery);
  const trim = css(livery.trim);
  const cells: Record<DecalKind, [string, string | null, number]> = {
    emblem: [EMBLEMS[livery.id === 'vanta' ? 1 : 0], null, 0.04],
    caution: [MARKS.caution.url, null, 0.02],
    stencil: [MARKS.stencil.url, ink, 0.08],
    warning: [MARKS.warning.url, null, 0.08],
    text: [MARKS.text.url, ink, 0.04],
    arrow: [MARKS.arrow.url, ink, 0.06],
    stripes: [MARKS.stripes.url, trim, 0.0],
    lift: [MARKS.lift.url, ink, 0.12],
  };
  const g = c.getContext('2d')!;
  Promise.all(CELLS.map((k) => image(cells[k][0]))).then((imgs) => {
    imgs.forEach((img, i) => {
      const [, tint, pad] = cells[CELLS[i]];
      drawFitted(g, img, (i % 4) * PAINTED_CELL, Math.floor(i / 4) * PAINTED_CELL, PAINTED_CELL, pad, tint);
    });
    t.needsUpdate = true;
  });
  return t;
}

/** Materials whose map has a painted twin: [material, drawn map, painted map (made when first wanted)]. */
const swappable = new Set<{ mat: THREE.MeshToonMaterial | THREE.MeshBasicMaterial; plain: THREE.Texture; painted: () => THREE.Texture; made?: THREE.Texture }>();
let paintedOn = false;

/** Show the painted markings (the anime look) or the drawn ones. */
export function setPaintedMarkings(on: boolean): void {
  if (on === paintedOn) return;
  paintedOn = on;
  for (const s of swappable) swapMarking(s);
}

function swapMarking(s: { mat: THREE.MeshToonMaterial | THREE.MeshBasicMaterial; plain: THREE.Texture; painted: () => THREE.Texture; made?: THREE.Texture }): void {
  if (paintedOn && !s.made) s.made = s.painted();
  s.mat.map = paintedOn ? s.made! : s.plain;
}

/** Register a material whose map swaps with the look; it leaves the list when disposed. */
export function paintedTwin(mat: THREE.MeshToonMaterial | THREE.MeshBasicMaterial, painted: () => THREE.Texture): void {
  const entry = { mat, plain: mat.map!, painted };
  swappable.add(entry);
  mat.addEventListener('dispose', () => swappable.delete(entry));
  swapMarking(entry);
}

/** A race number as painted, in the team's trim colour with its dark outline kept. */
export function paintedNumber(text: string, livery: Livery): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const name: MarkName | undefined = ({ '1': 'one', '2': 'two', '3': 'three' } as Record<string, MarkName>)[text];
  if (name) {
    image(MARKS[name].url).then((img) => {
      drawFitted(c.getContext('2d')!, img, 0, 0, 256, 0.1, css(livery.trim), 'multiply');
      t.needsUpdate = true;
    });
  }
  return t;
}

/** The decal material for a team: one canvas, shared by every decal on its mechs. */
function sheetMaterial(livery: Livery): THREE.MeshToonMaterial {
  let m = sheets.get(livery.id);
  if (!m) {
    const t = new THREE.CanvasTexture(drawSheet(livery));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.shared = true;
    m = new THREE.MeshToonMaterial({
      map: t,
      gradientMap: toonGradient(),
      transparent: true,
      alphaTest: 0.35,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    sheets.set(livery.id, m);
    paintedTwin(m, () => paintedSheet(livery));
  }
  return m;
}

/**
 * Stick a decal on `parent`. The plane faces +z before `rot`; `size` is its
 * width and height in metres (height defaults to the width).
 */
export function decal(parent: THREE.Object3D, livery: Livery, kind: DecalKind, at: [number, number, number], rot: [number, number, number], w: number, h = w): THREE.Mesh {
  const i = CELLS.indexOf(kind);
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const u0 = (i % 4) / 4;
  const v0 = 1 - (Math.floor(i / 4) + 1) / 2;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 2);
  const mesh = new THREE.Mesh(geo, sheetMaterial(livery));
  mesh.position.set(at[0], at[1], at[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

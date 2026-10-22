// Markings: a sheet of small decals drawn once per team (the team emblem,
// caution stripes, stencils and warning marks) and stuck on the armour as
// little planes, lit like the armour so they sit in its shadows.
import * as THREE from 'three';
import { emblemUrlFor, paintLeagueBadge } from '../../ui/factionArt';
import { toonGradient, type Livery } from '../palette';
import { MARKS, type MarkName } from './mechArt';

export type DecalKind = 'emblem' | 'caution' | 'stencil' | 'warning' | 'text' | 'arrow' | 'stripes' | 'lift' | 'chevrons' | 'roundel';
const CELLS: DecalKind[] = ['emblem', 'caution', 'stencil', 'warning', 'text', 'arrow', 'stripes', 'lift', 'chevrons', 'roundel'];
const CELL = 128;
/** The sheet is four cells across and this many down. */
const ROWS = 3;

const sheets = new Map<string, THREE.MeshToonMaterial>();

const css = (c: number) => `#${new THREE.Color(c).getHexString()}`;

/** The faction a sheet is for: its variants (light or dark armour, an emblem's colour) are named `<faction>:<variant>`. */
const factionOf = (livery: Livery) => livery.id.split(':')[0];

function drawSheet(livery: Livery): HTMLCanvasElement {
  const faction = factionOf(livery);
  const c = document.createElement('canvas');
  c.width = CELL * 4;
  c.height = CELL * ROWS;
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
  // Team emblem: Solstice a rising sun, Vanta a split chevron, Mirage a
  // winged sun disc, Aurora a sword through a halo, Tempest a lightning bolt
  // through a swirl of wind; the league (no faction) its badge.
  cell(0, () => {
    g.fillStyle = trim;
    g.strokeStyle = trim;
    g.lineWidth = 7;
    if (faction === 'league') {
      // The league's badge (a pilot flying for no faction), all in the trim.
      g.scale(128 / 192, 128 / 192);
      paintLeagueBadge(g, null, trim, trim);
    } else if (faction === 'mirage') {
      g.beginPath();
      g.arc(64, 64, 18, 0, Math.PI * 2);
      g.fill();
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(64 + s * 20, 56 + k * 8);
          g.lineTo(64 + s * (60 - k * 9), 44 + k * 13);
          g.lineTo(64 + s * (56 - k * 9), 54 + k * 13);
          g.lineTo(64 + s * 20, 66 + k * 8);
          g.closePath();
          g.fill();
        }
      }
    } else if (faction === 'aurora') {
      // The sword, point up, through a halo.
      g.beginPath();
      g.moveTo(64, 10);
      g.lineTo(72, 26);
      g.lineTo(72, 78);
      g.lineTo(56, 78);
      g.lineTo(56, 26);
      g.closePath();
      g.fill();
      g.fillRect(36, 76, 56, 9);
      g.fillRect(60, 85, 8, 22);
      g.beginPath();
      g.arc(64, 112, 7, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 6;
      g.beginPath();
      g.arc(64, 80, 24, 0, Math.PI * 2);
      g.stroke();
    } else if (faction === 'tempest') {
      // Three curls of wind round the middle, a lightning bolt through them.
      g.lineWidth = 7;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        g.beginPath();
        g.arc(64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16, 26, a + 0.4, a + 2.2);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(74, 6);
      g.lineTo(46, 68);
      g.lineTo(66, 66);
      g.lineTo(52, 122);
      g.lineTo(84, 54);
      g.lineTo(64, 56);
      g.closePath();
      g.fill();
    } else if (faction === 'vanta') {
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
  // Hazard chevrons for the thrusters: four, pointing along the cell.
  cell(8, () => {
    g.fillStyle = livery.darkArmour ? light : dark;
    for (let k = 0; k < 4; k++) {
      const x = 6 + k * 30;
      g.beginPath();
      g.moveTo(x, 34);
      g.lineTo(x + 16, 34);
      g.lineTo(x + 34, 64);
      g.lineTo(x + 16, 94);
      g.lineTo(x, 94);
      g.lineTo(x + 18, 64);
      g.closePath();
      g.fill();
    }
  });
  // A racing roundel to set a number on: white on light armour, the team's secondary colour on dark.
  cell(9, () => {
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fillStyle = livery.darkArmour ? css(livery.secondary) : '#f4f4f8';
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = dark;
    g.stroke();
  });
  // Lifting point: a ringed target.
  cell(7, () => {
    g.strokeStyle = livery.darkArmour ? light : dark;
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
// The same ten cells, painted (art/mech-sheets, P2), with the team emblem
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
  return livery.darkArmour ? css(livery.trim) : '#151a26';
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
  c.height = PAINTED_CELL * ROWS;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.shared = true;
  const ink = inkFor(livery);
  const trim = css(livery.trim);
  const cells: Record<DecalKind, [string, string | null, number, ('fill' | 'multiply')?]> = {
    emblem: [emblemUrlFor(factionOf(livery)), null, 0.04],
    caution: [MARKS.caution.url, null, 0.02],
    stencil: [MARKS.stencil.url, ink, 0.08],
    warning: [MARKS.warning.url, null, 0.08],
    text: [MARKS.text.url, ink, 0.04],
    arrow: [MARKS.arrow.url, ink, 0.06],
    stripes: [MARKS.stripes.url, trim, 0.0],
    lift: [MARKS.lift.url, ink, 0.12],
    chevrons: [MARKS.chevrons.url, ink, 0.04],
    // White on light armour; the team's secondary colour on dark, so its pale number reads.
    roundel: [MARKS.roundel.url, livery.darkArmour ? css(livery.secondary) : null, 0.04, 'multiply'],
  };
  const g = c.getContext('2d')!;
  Promise.all(CELLS.map((k) => image(cells[k][0]))).then((imgs) => {
    imgs.forEach((img, i) => {
      const [, tint, pad, mode] = cells[CELLS[i]];
      drawFitted(g, img, (i % 4) * PAINTED_CELL, Math.floor(i / 4) * PAINTED_CELL, PAINTED_CELL, pad, tint, mode);
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
/**
 * The markings sheet for a team on armour of either darkness: its white
 * markings dark on light armour, light on dark (a custom mech's parts each
 * have their own paint, so their markings follow each part's).
 */
export function markingsMaterial(livery: Livery, dark: boolean): THREE.MeshToonMaterial {
  if (dark === livery.darkArmour) return sheetMaterial(livery);
  return sheetMaterial({ ...livery, id: `${livery.id}:${dark ? 'dark' : 'light'}`, darkArmour: dark });
}

/**
 * The markings sheet for a team's emblem laid over armour of colour `under`
 * (where a modelled insignia was): the emblem in the team's trim, as the
 * other markings have it, unless the trim would not show on that armour;
 * then in the team's main colour, its accent, or ink, whichever shows first.
 */
export function emblemMaterial(livery: Livery, dark: boolean, under: number): THREE.MeshToonMaterial {
  const lum = (c: number) => {
    const k = new THREE.Color(c);
    return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;
  };
  const shows = (c: number) => (Math.max(lum(c), lum(under)) + 0.05) / (Math.min(lum(c), lum(under)) + 0.05) >= 2.2;
  const ink = lum(under) > 0.18 ? 0x151a26 : 0xf4f2ee;
  const colour = [livery.trim, livery.primary, livery.secondary].find(shows) ?? ink;
  if (colour === livery.trim) return markingsMaterial(livery, dark);
  return sheetMaterial({ ...livery, id: `${livery.id}:${dark ? 'dark' : 'light'}:emblem-${colour.toString(16)}`, darkArmour: dark, trim: colour });
}

/** Whether a mesh is one of a team's markings (drawn from its sheet). */
export function isMarking(o: THREE.Object3D, livery: Livery): o is THREE.Mesh {
  return o instanceof THREE.Mesh && o.material === sheetMaterial(livery);
}

export function decal(parent: THREE.Object3D, livery: Livery, kind: DecalKind, at: [number, number, number], rot: [number, number, number], w: number, h = w): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h);
  toSheetCell(geo, kind);
  const mesh = new THREE.Mesh(geo, sheetMaterial(livery));
  mesh.position.set(at[0], at[1], at[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

/** Map a decal's own uv (0 to 1 across it, upright) onto its kind's cell of the sheet. */
export function toSheetCell(geo: THREE.BufferGeometry, kind: DecalKind): void {
  const i = CELLS.indexOf(kind);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = (i % 4) / 4;
  const v0 = 1 - (Math.floor(i / 4) + 1) / ROWS;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / ROWS);
  uv.needsUpdate = true;
}

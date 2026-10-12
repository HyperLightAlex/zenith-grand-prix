// Markings: a sheet of small decals drawn once per team (the team emblem,
// caution stripes, stencils and warning marks) and stuck on the armour as
// little planes, lit like the armour so they sit in its shadows.
import * as THREE from 'three';
import { toonGradient, type Livery } from '../palette';

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

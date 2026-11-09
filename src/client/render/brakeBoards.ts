// Brake boards: before each tight corner that comes after a straight, three
// boards on the outside of it, 300, 200 and 100 m out (three bars, two, one,
// and the distance), turned to the mechs coming up to them, so a corner can
// be seen coming before it is in sight. Stood behind the barrier, their
// faces above it, wherever the road is plain (upright, both sides, no fork).

import * as THREE from 'three';
import { hwAt, wrapS, type Track } from '../../sim/index';
import { trackMatrix } from './trackSpace';
import { mergeStatic } from './mergeStatic';

/** A corner this tight (1/m) or tighter, after this long (m) with nothing half as tight: boards before it. */
const TIGHT = 0.004;
const STRAIGHT = 220;
const OUT = [300, 200, 100] as const;

/** Where the boards go: each corner's entry and which side its outside is (-1 left, 1 right). */
export function brakeBoardCorners(track: Track): Array<{ s: number; side: number }> {
  const out: Array<{ s: number; side: number }> = [];
  let calm = 0;
  for (let i = 0; i < track.n; i++) {
    const k = Math.abs(track.kappa[i]);
    if (k < TIGHT * 0.5) calm += track.ds;
    else if (k > TIGHT) {
      if (calm > STRAIGHT) out.push({ s: i * track.ds, side: track.kappa[i] > 0 ? -1 : 1 });
      calm = 0;
    }
  }
  return out;
}

function boardTexture(bars: number, distance: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#10182c';
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#f3f5fa';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 182);
  // The bars, slanted the way the HUD's italics are.
  g.fillStyle = '#f3f5fa';
  const w = 34;
  const gap = 18;
  const x0 = 128 - (bars * w + (bars - 1) * gap) / 2;
  for (let b = 0; b < bars; b++) {
    const x = x0 + b * (w + gap);
    g.beginPath();
    g.moveTo(x + 16, 26);
    g.lineTo(x + w + 16, 26);
    g.lineTo(x + w - 8, 116);
    g.lineTo(x - 8, 116);
    g.fill();
  }
  g.fillStyle = '#35f0ff';
  g.font = 'italic 800 54px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(distance), 128, 152);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildBrakeBoards(track: Track): THREE.Group {
  const group = new THREE.Group();
  group.name = 'brake boards';
  const n = track.n;
  const plain = (s: number) => {
    const j = Math.floor(wrapS(track, s) / track.ds) % n;
    return track.roadL[j] === 1 && track.roadR[j] === 1 && track.mag[j] === 0 && track.median[j] < 0.1 && track.upY[j] > 0.85 && Math.abs(track.ty[j]) < 0.35;
  };
  const faces = OUT.map((d, i) => new THREE.MeshBasicMaterial({ map: boardTexture(3 - i, d) }));
  const backMat = new THREE.MeshLambertMaterial({ color: 0x2c3442 });
  const face = new THREE.PlaneGeometry(7, 5.25);
  const back = new THREE.BoxGeometry(7.4, 5.6, 0.35);
  const post = new THREE.BoxGeometry(0.35, 1, 0.35);
  const m = new THREE.Matrix4();
  for (const corner of brakeBoardCorners(track)) {
    OUT.forEach((dist, i) => {
      const s = corner.s - dist;
      if (!plain(s) || !plain(s - 20) || !plain(s + 20)) return;
      const d = corner.side * (hwAt(track, s) + 3.4);
      // Facing back down the road, turned a little in toward it.
      trackMatrix(track, s, d, 0, Math.PI + corner.side * 0.35, m);
      const board = new THREE.Group();
      board.matrixAutoUpdate = false;
      board.matrix.copy(m);
      const top = 12;
      const f = new THREE.Mesh(face, faces[i]);
      f.position.set(0, top - 2.8, 0.2);
      const b = new THREE.Mesh(back, backMat);
      b.position.set(0, top - 2.8, 0);
      board.add(f, b);
      for (const x of [-2.6, 2.6]) {
        const p = new THREE.Mesh(post, backMat);
        p.scale.y = top - 5.4;
        p.position.set(x, (top - 5.4) / 2, 0);
        board.add(p);
      }
      group.add(board);
    });
  }
  // All of them as four meshes (the three faces' and the backs'), not four a board.
  const boards = [...group.children];
  if (boards.length) group.add(mergeStatic(boards, group, 'brake boards'));
  return group;
}

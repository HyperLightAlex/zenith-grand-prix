// How the road of Titan's Rest fits the fallen titan: where any part of it
// reaches into the space the road needs, how far the road floats over the
// parts it runs on, and a JSON of both for plot_fit.py to draw.
//   npx tsx tools/titan/fit.ts [out.json] [--model posed.glb]
// With --model, the titan is that model (glTF in the game's axes, posed as
// the wreck: tools/titan/pose_model.py) instead of its simple shapes.
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readTitanLevel } from '../../src/client/render/titan/read';
import { buildTrack } from '../../src/sim/track';
import { trackById } from '../../src/sim/tracks/index';
import { pieceStarts, type CircuitDef } from '../../src/sim/circuit';
import { KEEP_OUT, RoadIndex } from '../../src/client/render/titan/keepout';
import { surfacePoints, titanShapes, TITAN_POSE, fitToRoad, type V3 } from '../../src/client/render/titan/pose';

const args = process.argv.slice(2);
const modelAt = args.indexOf('--model');
const model = modelAt >= 0 ? args.splice(modelAt, 2)[1] : null;
const out = args[0] ?? 'titan-fit.json';
const def = trackById('titan') as CircuitDef;
const t = buildTrack(def);
const starts = pieceStarts(def);
const pieceAt = (s: number) => {
  let k = 0;
  while (k + 1 < starts.length && starts[k + 1] <= s) k++;
  return k;
};
const pieceName = (k: number) => def.pieces[k]?.name ?? `#${k}`;
const index = new RoadIndex(t);
/** Each part's surface as points about `step` apart, from the model or the simple shapes. */
async function partPoints(step: number): Promise<Array<{ part: string; mat: string; pts: V3[] }>> {
  if (!model) return titanShapes(fitToRoad(TITAN_POSE, t)).map((s) => ({ part: s.part, mat: s.mat, pts: surfacePoints(s, step) }));
  const bytes = readFileSync(model);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const list: Array<{ part: string; mat: string; pts: V3[] }> = [];
  for (const [part, geo] of readTitanLevel(gltf.scene)) {
    for (const [slot, g] of Object.entries(geo)) {
      const p = g!.attributes.position.array as Float32Array;
      const pts: V3[] = [];
      for (let k = 0; k < p.length; k += 9) {
        const a = [p[k], p[k + 1], p[k + 2]], b = [p[k + 3], p[k + 4], p[k + 5]], c = [p[k + 6], p[k + 7], p[k + 8]];
        const n = Math.max(1, Math.min(48, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2])) / step)));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) pts.push([a[0] + (b[0] - a[0]) * (i / n) + (c[0] - a[0]) * (j / n), a[1] + (b[1] - a[1]) * (i / n) + (c[1] - a[1]) * (j / n), a[2] + (b[2] - a[2]) * (i / n) + (c[2] - a[2]) * (j / n)]);
      }
      list.push({ part, mat: slot === 'gold' ? 'gold' : slot, pts });
    }
  }
  return list;
}
const shapes = await partPoints(6);

// Parts in the space the road needs (hard) or in the sky over it (soft).
const hard = new Map<string, Map<string, number>>();
const soft = new Map<string, Map<string, number>>();
const note = (m: Map<string, Map<string, number>>, part: string, where: string) => {
  let pm = m.get(part);
  if (!pm) m.set(part, (pm = new Map()));
  pm.set(where, (pm.get(where) ?? 0) + 1);
};
// Under the road: the highest part below the slab at each sample.
const under = new Float32Array(t.n).fill(-1e9);
const scratch: number[] = [];
const near: number[] = [];
const shapeOut: Array<{ part: string; mat: string; pts: V3[] }> = [];
for (const s of shapes) {
  const pts = s.pts;
  const keep: V3[] = [];
  for (let k = 0; k < pts.length; k++) {
    const [x, y, z] = pts[k];
    if (k % 3 === 0) keep.push([Math.round(x), Math.round(y), Math.round(z)]);
    const i = index.hit(x, y, z, KEEP_OUT.up, scratch);
    if (i >= 0) note(hard, s.part, pieceName(pieceAt(i * t.ds)));
    else {
      const j = index.hit(x, y, z, KEEP_OUT.sky, scratch);
      if (j >= 0) note(soft, s.part, pieceName(pieceAt(j * t.ds)));
    }
    for (const i of index.near(x, z, near)) {
      const vx = x - t.px[i], vy = y - t.py[i], vz = z - t.pz[i];
      const along = vx * t.tx[i] + vy * t.ty[i] + vz * t.tz[i];
      if (Math.abs(along) > t.ds) continue;
      const d = vx * t.rx[i] + vy * t.ry[i] + vz * t.rz[i];
      const h = vx * t.ux[i] + vy * t.uy[i] + vz * t.uz[i];
      if (Math.abs(d) <= t.hw[i] && h < -KEEP_OUT.down && h > -400) under[i] = Math.max(under[i], h);
    }
  }
  shapeOut.push({ part: s.part, mat: s.mat, pts: keep });
}

console.log(`${def.name}: ${t.length.toFixed(0)} m, ${t.n} samples, heights ${Math.min(...t.py).toFixed(0)}..${Math.max(...t.py).toFixed(0)}`);
const report = (label: string, m: Map<string, Map<string, number>>) => {
  console.log(label + (m.size ? '' : ' none'));
  for (const [part, pm] of m) console.log(`  ${part}: ${[...pm].map(([w, n]) => `${w} (${n})`).join(', ')}`);
};
report('Inside the road space:', hard);
report('In the sky over the road (soft):', soft);
console.log('Each piece: height of the road, and the gap from the slab down to the titan under it (where it is under the road):');
for (let k = 0; k < def.pieces.length; k++) {
  const s0 = starts[k], s1 = k + 1 < starts.length ? starts[k + 1] : t.length;
  const i0 = Math.floor(s0 / t.ds), i1 = Math.max(i0 + 1, Math.floor(s1 / t.ds));
  let y0 = 1e9, y1 = -1e9, gMin = 1e9, gMax = -1e9, over = 0;
  for (let i = i0; i < i1; i++) {
    y0 = Math.min(y0, t.py[i]);
    y1 = Math.max(y1, t.py[i]);
    if (under[i] > -1e8) {
      const gap = -KEEP_OUT.down - under[i];
      gMin = Math.min(gMin, gap);
      gMax = Math.max(gMax, gap);
      over++;
    }
  }
  const g = over ? `gap ${gMin.toFixed(0)}..${gMax.toFixed(0)} over ${((100 * over) / (i1 - i0)).toFixed(0)}%` : '';
  console.log(`  ${String(k).padStart(2)} ${pieceName(k).padEnd(24)} s ${s0.toFixed(0).padStart(5)}  y ${y0.toFixed(0)}..${y1.toFixed(0)}  ${g}`);
}

const road = [];
for (let i = 0; i < t.n; i += 2) road.push([t.px[i], t.py[i], t.pz[i], t.hw[i], t.rx[i], t.rz[i], pieceAt(i * t.ds), t.roadL[i] && t.roadR[i] ? 1 : 0].map((v) => Math.round(Number(v) * 100) / 100));
const labels = def.pieces.map((p, k) => {
  const i = Math.floor((starts[k] + (k + 1 < starts.length ? (starts[k + 1] - starts[k]) / 2 : 0)) / t.ds) % t.n;
  return { name: p.name ?? '', x: t.px[i], y: t.py[i], z: t.pz[i] };
}).filter((l) => l.name);
writeFileSync(out, JSON.stringify({ road, labels, shapes: shapeOut }));
console.log('wrote', out);

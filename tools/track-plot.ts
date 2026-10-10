// Prints lap statistics for a track and writes a plan-view SVG.
//   npx tsx tools/track-plot.ts [out.svg]
import { writeFileSync } from 'node:fs';
import { buildTrack } from '../src/sim/track';
import { MERIDIAN } from '../src/sim/tracks/meridian';

const t = buildTrack(MERIDIAN);
let maxK = 0, maxKs = 0, minY = 1e9, maxY = -1e9, maxGrade = 0;
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (let i = 0; i < t.n; i++) {
  if (Math.abs(t.kappa[i]) > maxK) { maxK = Math.abs(t.kappa[i]); maxKs = i * t.ds; }
  minY = Math.min(minY, t.py[i]); maxY = Math.max(maxY, t.py[i]);
  maxGrade = Math.max(maxGrade, Math.abs(t.ty[i]));
  minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]);
  minZ = Math.min(minZ, t.pz[i]); maxZ = Math.max(maxZ, t.pz[i]);
}
console.log(`length ${t.length.toFixed(1)}  samples ${t.n}  ds ${t.ds.toFixed(3)}`);
console.log(`min radius ${(1 / maxK).toFixed(0)} at s=${maxKs.toFixed(0)}  height ${minY.toFixed(0)}..${maxY.toFixed(0)}  max grade ${(maxGrade * 100).toFixed(1)}%`);
console.log(`extent x ${minX.toFixed(0)}..${maxX.toFixed(0)}  z ${minZ.toFixed(0)}..${maxZ.toFixed(0)}`);
// Corner list: stretches where radius < 600.
let inCorner = false, start = 0, peak = 0;
for (let i = 0; i <= t.n; i++) {
  const k = Math.abs(t.kappa[i % t.n]);
  if (k > 1 / 600 && !inCorner) { inCorner = true; start = i; peak = k; }
  else if (inCorner && k > 1 / 600) peak = Math.max(peak, k);
  else if (inCorner) {
    inCorner = false;
    const dir = t.kappa[Math.floor((start + i) / 2) % t.n] > 0 ? 'R' : 'L';
    console.log(`  corner ${dir} s=${(start * t.ds).toFixed(0)}..${(i * t.ds).toFixed(0)}  min radius ${(1 / peak).toFixed(0)}`);
  }
}
// Self-proximity check: any two far-apart samples closer than 3 widths in plan.
let closest = 1e9;
for (let i = 0; i < t.n; i += 4) for (let j = i + 100; j < t.n; j += 4) {
  if (t.n - (j - i) < 100) continue;
  const dd = Math.hypot(t.px[i] - t.px[j], t.pz[i] - t.pz[j]);
  if (dd < closest) closest = dd;
}
console.log(`closest approach between separate stretches: ${closest.toFixed(0)}`);

const pad = 200, W = maxX - minX + pad * 2, H = maxZ - minZ + pad * 2;
let path = '';
const segs: string[] = [];
for (let i = 0; i < t.n; i += 2) {
  const j = (i + 2) % t.n;
  const k = Math.min(1, Math.abs(t.kappa[i]) * 300);
  const col = `rgb(${Math.round(60 + 195 * k)},${Math.round(200 - 150 * k)},${Math.round(255 - 200 * k)})`;
  segs.push(`<line x1="${t.px[i] - minX + pad}" y1="${t.pz[i] - minZ + pad}" x2="${t.px[j] - minX + pad}" y2="${t.pz[j] - minZ + pad}" stroke="${col}" stroke-width="${t.halfWidth * 2}" stroke-linecap="round"/>`);
}
const marks: string[] = [];
for (let s = 0; s < t.length; s += 500) {
  const i = Math.floor(s / t.ds);
  marks.push(`<text x="${t.px[i] - minX + pad + 40}" y="${t.pz[i] - minZ + pad}" font-size="60" fill="#fff">${s} (y${t.py[i].toFixed(0)})</text>`);
}
for (const st of t.strips) {
  for (let s = st.s0; s < st.s1; s += 8) {
    const i = Math.floor((s % t.length) / t.ds) % t.n;
    marks.push(`<circle cx="${t.px[i] + t.rx[i] * st.d - minX + pad}" cy="${t.pz[i] + t.rz[i] * st.d - minZ + pad}" r="${st.halfW}" fill="#ff0"/>`);
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="1200" height="${Math.round(1200 * H / W)}"><rect width="100%" height="100%" fill="#101820"/>${segs.join('')}${marks.join('')}</svg>`;
writeFileSync(process.argv[2] ?? 'track.svg', svg);

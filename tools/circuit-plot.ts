// Lap statistics and a picture of a circuit: plan view coloured by feature,
// and the height profile underneath.
//   npx tsx tools/circuit-plot.ts <track id> [out.svg]
import { writeFileSync } from 'node:fs';
import { buildTrack } from '../src/sim/track';
import { trackById } from '../src/sim/tracks/index';
import '../src/sim/circuit';

const id = process.argv[2] ?? 'meridian';
const out = process.argv[3] ?? `${id}.svg`;
const def = trackById(id);
const t = buildTrack(def);
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9;
for (let i = 0; i < t.n; i++) {
  minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]);
  minZ = Math.min(minZ, t.pz[i]); maxZ = Math.max(maxZ, t.pz[i]);
  minY = Math.min(minY, t.py[i]); maxY = Math.max(maxY, t.py[i]);
}
console.log(`${def.name}: length ${t.length.toFixed(0)}  samples ${t.n}  height ${minY.toFixed(0)}..${maxY.toFixed(0)}  width ${t.minHw.toFixed(0)}..${t.maxHw.toFixed(0)}`);
let gaps = 0, mag = 0, open = 0, inverted = 0;
for (let i = 0; i < t.n; i++) {
  if (!t.roadL[i] || !t.roadR[i]) gaps++;
  if (t.mag[i]) mag++;
  if (!t.wallL[i] || !t.wallR[i]) open++;
  if (t.upY[i] < 0) inverted++;
}
console.log(`gap ${(gaps * t.ds).toFixed(0)}u  held ${(mag * t.ds).toFixed(0)}u  upside down ${(inverted * t.ds).toFixed(0)}u  open edge ${(open * t.ds).toFixed(0)}u  forks ${t.forks.length}  pads ${t.pads.length}  strips ${t.strips.length}  gates ${t.gates.length}`);
for (const f of t.forks) console.log(`  fork ${f.s0.toFixed(0)}..${f.s1.toFixed(0)} left ${JSON.stringify(f.left)} right ${JSON.stringify(f.right)}`);
// Closest approach in 3D between stretches far apart along the lap.
let closest = 1e9, at = [0, 0];
for (let i = 0; i < t.n; i += 2) for (let j = i + 60; j < t.n; j += 2) {
  if (t.n - (j - i) < 60) continue;
  const dd = Math.hypot(t.px[i] - t.px[j], t.py[i] - t.py[j], t.pz[i] - t.pz[j]);
  if (dd < closest) { closest = dd; at = [i * t.ds, j * t.ds]; }
}
console.log(`closest approach between separate stretches: ${closest.toFixed(0)} (s ${at[0].toFixed(0)} and ${at[1].toFixed(0)})`);
let minR = 1e9, minRs = 0, maxKv = 0;
for (let i = 0; i < t.n; i++) {
  if (Math.abs(t.kappa[i]) > 1e-6 && 1 / Math.abs(t.kappa[i]) < minR) { minR = 1 / Math.abs(t.kappa[i]); minRs = i * t.ds; }
  maxKv = Math.max(maxKv, Math.abs(t.kv[i]));
}
console.log(`tightest turn radius ${minR.toFixed(0)} at s=${minRs.toFixed(0)}; tightest vertical radius ${(1 / maxKv).toFixed(0)}`);

const pad = 160, W = maxX - minX + pad * 2, H = maxZ - minZ + pad * 2, EH = 500;
const X = (x: number) => x - minX + pad, Z = (z: number) => z - minZ + pad;
const segs: string[] = [];
for (let i = 0; i < t.n; i++) {
  const j = (i + 1) % t.n;
  const gap = !t.roadL[i] || !t.roadR[i];
  const col = gap ? '#ff2a2a' : t.mag[i] ? '#34e07a' : t.median[i] > 0.5 ? '#b065ff' : !t.wallL[i] || !t.wallR[i] ? '#ffd23d' : t.grip[i] > 1.3 ? '#ff8a1f' : '#9aa6bd';
  segs.push(`<line x1="${X(t.px[i])}" y1="${Z(t.pz[i])}" x2="${X(t.px[j])}" y2="${Z(t.pz[j])}" stroke="${col}" stroke-width="${t.hw[i] * 2}" stroke-linecap="round"/>`);
}
const marks: string[] = [];
for (let s = 0; s < t.length; s += 500) {
  const i = Math.floor(s / t.ds);
  marks.push(`<text x="${X(t.px[i]) + 40}" y="${Z(t.pz[i])}" font-size="54" fill="#fff">${s}</text>`);
}
for (const g of t.gates) {
  const i = Math.floor(g.s / t.ds) % t.n;
  marks.push(`<circle cx="${X(t.px[i] + t.rx[i] * g.d)}" cy="${Z(t.pz[i] + t.rz[i] * g.d)}" r="12" fill="#ffc93a" stroke="#000" stroke-width="4"/>`);
}
for (const st of t.strips) {
  const i = Math.floor((st.s0 % t.length) / t.ds) % t.n;
  marks.push(`<circle cx="${X(t.px[i] + t.rx[i] * st.d)}" cy="${Z(t.pz[i] + t.rz[i] * st.d)}" r="10" fill="#35f0ff"/>`);
}
marks.push(`<circle cx="${X(t.px[0])}" cy="${Z(t.pz[0])}" r="30" fill="none" stroke="#fff" stroke-width="8"/>`);
// Elevation profile below the plan.
const prof: string[] = [];
const ex = (s: number) => pad + (s / t.length) * (W - pad * 2);
const ey = (y: number) => H + EH - 40 - ((y - minY) / Math.max(1, maxY - minY)) * (EH - 80);
let d = '';
for (let i = 0; i <= t.n; i++) d += `${i ? 'L' : 'M'}${ex(i * t.ds).toFixed(1)},${ey(t.py[i % t.n]).toFixed(1)}`;
prof.push(`<path d="${d}" stroke="#fff" stroke-width="6" fill="none"/>`);
prof.push(`<text x="${pad}" y="${H + 50}" font-size="44" fill="#fff">height ${minY.toFixed(0)}..${maxY.toFixed(0)}</text>`);
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + EH}" width="${Math.round(W / 4)}" height="${Math.round((H + EH) / 4)}"><rect width="100%" height="100%" fill="#1d2433"/>${segs.join('')}${marks.join('')}${prof.join('')}</svg>`);
console.log('wrote', out);

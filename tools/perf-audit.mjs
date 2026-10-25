// What the game asks of a device: what it downloads and holds, how much it
// draws, and what each frame costs on the CPU. For keeping performance work
// honest: record a baseline from one build, then compare another against it.
//
//   node tools/perf-audit.mjs <out.json> [sections] [--compare base.json]
//   sections (comma-separated, default all): load, frame, gpu, memory
//   BASE=http://127.0.0.1:8091/  another server (default :8090)
//   TRACKS=meridian,titan        circuits for 'frame' (default all nine)
//
// Software-rendered (SwiftShader) in headless Chromium at a phone's size:
// counts (draw calls, triangles, bytes, textures) are exact and comparable
// anywhere; milliseconds are this machine's, comparable only between runs on
// it. The GPU's own time is not measured (a software rasteriser says nothing
// useful about a phone's GPU): count the work instead.
//
//   load    boot to the title: bytes by kind (before the title, and in the
//           next 15 s), main-thread long tasks
//   frame   per circuit, mid-race: draw calls and triangles by pass, shader
//           programs, objects whose matrices update each frame, textures
//           uploaded each frame, the JS time of a frame without drawing
//           (logic) and of handing a frame to WebGL with its draws made no-ops
//           (submit)
//   gpu     every texture, renderbuffer and buffer WebGL holds, totalled after
//           each race of Meridian, Monsoon, Zenith, then the three again and
//           Meridian: what a change of circuit fails to let go of
//   memory  the browser's page process memory (resident) at the title and in
//           races on three circuits, with the music on
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const args = process.argv.slice(2);
const cmpAt = args.indexOf('--compare');
const basePath = cmpAt >= 0 ? args.splice(cmpAt, 2)[1] : null;
const [outPath = 'perf-audit.json', sectionList = 'load,frame,gpu,memory'] = args;
const BASE = process.env.BASE ?? 'http://127.0.0.1:8090/';
const TRACKS = (process.env.TRACKS ?? 'meridian,canyon,helios,crucible,frostline,titan,abyss,monsoon,zenith').split(',');
const sections = new Set(sectionList.split(','));
const PHONE = { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const result = { base: BASE, at: new Date().toISOString() };

const seeded = () => {
  window.requestAnimationFrame = () => 0;
  let s = 9;
  Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
};
const bootPage = async (browser, ctxOpts, query, init) => {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  for (const f of init) await page.addInitScript(f);
  await page.goto(BASE + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined, null, { timeout: 600000, polling: 200 });
  return { ctx, page };
};
const race = (page, track, at, frames = 4) => page.evaluate(([track, at, frames]) => {
  const g = window.game;
  g.menus.reset('modes', undefined, ['title']);
  g.loadout.team = 4; g.loadout.role = 0; g.free.rival = 3; g.free.track = track; g.free.mode = 'teams';
  g.startFree();
  g.session.fastForward(at);
  for (let i = 0; i < frames; i++) g.frame(g.last + 1000 / 60);
}, [track, at, frames]);
const waitTitan = (page, track) => track === 'titan' ? page.waitForFunction(() => !!window.game.renderer.scene.getObjectByName('titan'), null, { polling: 200, timeout: 600000 }) : null;

// ---- load -------------------------------------------------------------------
async function load() {
  const browser = await chromium.launch({ args: FLAGS });
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const t0 = Date.now();
  const reqs = new Map(), done = [];
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.end = Date.now() - t0; done.push(r); } });
  await page.addInitScript(() => {
    window.__long = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: true }); } catch { /* no long tasks API */ }
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined && !document.getElementById('boot'), null, { timeout: 600000, polling: 100 });
  const tGame = Date.now() - t0;
  const kind = (u) => (/\.glb/.test(u) ? 'models' : /\/music\//.test(u) ? 'music' : /\/sfx\//.test(u) ? 'sfx' : /\.(webp|png|jpg)/.test(u) ? 'images' : /woff/.test(u) ? 'fonts' : 'code');
  const sum = (list) => { const o = {}; for (const r of list) { const k = kind(r.url); o[k] ??= { files: 0, MB: 0 }; o[k].files++; o[k].MB += (r.bytes || 0) / 1048576; } for (const k in o) o[k].MB = +o[k].MB.toFixed(2); return o; };
  const before = sum(done.filter((r) => r.end <= tGame));
  const longMs = Math.round(await page.evaluate(() => window.__long));
  await page.waitForTimeout(15000);
  const after = sum(done.filter((r) => r.end > tGame));
  await browser.close();
  return { msToTitle: tGame, longTaskMs: longMs, beforeTitle: before, next15s: after };
}

// ---- frame ------------------------------------------------------------------
async function frame() {
  const browser = await chromium.launch({ args: FLAGS });
  const { page } = await bootPage(browser, PHONE, '?mute=1&perf=1&seed=9&demo=1', [seeded]);
  const out = {};
  for (const track of TRACKS) {
    await race(page, track, 40);
    await waitTitan(page, track);
    const row = await page.evaluate(() => {
      const g = window.game, r = g.renderer, R = r.renderer, scene = r.scene, gl = R.getContext();
      r.adapt = () => {};
      for (let i = 0; i < 3; i++) g.frame(g.last + 1000 / 60);
      gl.finish();
      // Draw calls and triangles by pass: the scene, the travellers' mask (if any), the rest.
      let pass = 'post';
      const by = {};
      const rbd = R.renderBufferDirect;
      R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
        let n = group ? group.count : geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
        if (Number.isFinite(geometry.drawRange.count)) n = Math.min(n, geometry.drawRange.count);
        const inst = object.isInstancedMesh ? object.count : 1;
        const e = (by[pass] ??= { calls: 0, tris: 0 });
        e.calls++;
        if (object.isMesh) e.tris += Math.round((n / 3) * inst);
        return rbd.apply(this, arguments);
      };
      const rp = r.composer.passes[0], rpo = rp.render;
      rp.render = function () { pass = 'scene'; rpo.apply(this, arguments); pass = 'post'; };
      const dtr = r.drawTravellers;
      r.drawTravellers = function () { pass = 'travellers'; dtr.apply(this, arguments); pass = 'post'; };
      // Textures uploaded in a frame.
      let uploads = 0;
      const tsi = gl.texSubImage2D, ti = gl.texImage2D;
      gl.texSubImage2D = function () { uploads++; return tsi.apply(this, arguments); };
      gl.texImage2D = function () { uploads++; return ti.apply(this, arguments); };
      g.frame(g.last + 1000 / 60);
      const upA = uploads;
      g.frame(g.last + 1000 / 60);
      const uploadsPerFrame = (uploads + upA) / 2;
      R.renderBufferDirect = rbd; rp.render = rpo; r.drawTravellers = dtr; gl.texSubImage2D = tsi; gl.texImage2D = ti;
      let objects = 0, autoMatrix = 0;
      scene.traverse((o) => { objects++; if (o.matrixAutoUpdate) autoMatrix++; });
      const calls = Object.values(by).reduce((a, e) => a + e.calls, 0);
      const tris = Object.values(by).reduce((a, e) => a + e.tris, 0);
      // JS time: the frame without drawing (the scene's matrices still updated, as a render would), then the drawing alone with draws made no-ops.
      const draw = r.render;
      r.render = () => scene.updateMatrixWorld();
      const time = (n, f) => { const ms = []; for (let i = 0; i < n; i++) { const t = performance.now(); f(); ms.push(performance.now() - t); } ms.sort((a, b) => a - b); return { mean: +(ms.reduce((a, b) => a + b, 0) / n).toFixed(2), p95: +ms[Math.floor(n * 0.95)].toFixed(2) }; };
      for (let i = 0; i < 30; i++) g.frame(g.last + 1000 / 60);
      const logic = time(300, () => g.frame(g.last + 1000 / 60));
      r.render = draw;
      const noop = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'blitFramebuffer', 'clear'];
      const kept = noop.map((f) => gl[f]);
      for (const f of noop) gl[f] = () => {};
      const scale = r.scale; r.scale = 0.1; r.viewport.width = 0; r.resize();
      for (let i = 0; i < 10; i++) r.render(1 / 60, g.time);
      gl.finish();
      const submit = time(200, () => r.render(1 / 60, g.time));
      noop.forEach((f, i) => (gl[f] = kept[i]));
      r.scale = scale; r.viewport.width = 0; r.resize();
      return { calls, tris, byPass: by, programs: R.info.programs.length, objects, autoMatrix, uploadsPerFrame, logicMs: logic, submitMs: submit };
    });
    out[track] = row;
    console.log(track, JSON.stringify(row));
  }
  await browser.close();
  return out;
}

// ---- gpu --------------------------------------------------------------------
function trackGL() {
  const P = WebGL2RenderingContext.prototype;
  const L = (window.__gl = { tex: new Map(), rb: new Map(), buf: new Map(), boundTex: new Map(), boundRb: null, boundBuf: new Map(), faces: new Map() });
  const px = (fmt, type) => (type === 0x140b || type === 0x8d61 ? 8 : type === 0x1406 ? 16 : 4);
  const ifmtBytes = (f) => (f === 0x881a ? 8 : f === 0x8814 ? 16 : 4);
  const wrap = (name, fn) => { const o = P[name]; P[name] = function (...a) { const r = o.apply(this, a); fn(r, ...a); return r; }; };
  wrap('createTexture', (t) => L.tex.set(t, 0));
  wrap('deleteTexture', (_, t) => { L.tex.delete(t); L.faces.delete(t); });
  wrap('bindTexture', (_, target, t) => L.boundTex.set(target, t));
  wrap('texImage2D', (_, target, level, ...a) => {
    if (level !== 0) return;
    const t = L.boundTex.get(target === 0x0de1 ? 0x0de1 : 0x8513);
    if (!t) return;
    let w, h, fmt, type;
    if (a.length === 4) { const src = a[3]; w = src?.width ?? src?.videoWidth ?? 0; h = src?.height ?? src?.videoHeight ?? 0; fmt = a[1]; type = a[2]; } else { [, w, h, , fmt, type] = a; }
    const f = L.faces.get(t) ?? {};
    f[target] = w * h * px(fmt, type);
    L.faces.set(t, f);
    L.tex.set(t, Object.values(f).reduce((x, y) => x + y, 0));
  });
  wrap('texStorage2D', (_, target, levels, ifmt, w, h) => { const t = L.boundTex.get(target); if (t) L.tex.set(t, w * h * ifmtBytes(ifmt) * (target === 0x8513 ? 6 : 1)); });
  wrap('texStorage3D', (_, target, levels, ifmt, w, h, d) => { const t = L.boundTex.get(target); if (t) L.tex.set(t, w * h * d * ifmtBytes(ifmt)); });
  wrap('createRenderbuffer', (r) => L.rb.set(r, 0));
  wrap('deleteRenderbuffer', (_, r) => L.rb.delete(r));
  wrap('bindRenderbuffer', (_, __, r) => { L.boundRb = r; });
  wrap('renderbufferStorageMultisample', (_, __, samples, ifmt, w, h) => { if (L.boundRb) L.rb.set(L.boundRb, w * h * Math.max(1, samples) * ifmtBytes(ifmt)); });
  wrap('renderbufferStorage', (_, __, ifmt, w, h) => { if (L.boundRb) L.rb.set(L.boundRb, w * h * ifmtBytes(ifmt)); });
  wrap('createBuffer', (b) => L.buf.set(b, 0));
  wrap('deleteBuffer', (_, b) => L.buf.delete(b));
  wrap('bindBuffer', (_, target, b) => L.boundBuf.set(target, b));
  wrap('bufferData', (_, target, data) => { const b = L.boundBuf.get(target); if (b) L.buf.set(b, typeof data === 'number' ? data : data?.byteLength ?? 0); });
}
async function gpu() {
  const browser = await chromium.launch({ args: FLAGS });
  const { page } = await bootPage(browser, { ...PHONE, deviceScaleFactor: 2 }, '?mute=1&seed=9&demo=1', [seeded, trackGL]);
  const tally = () => page.evaluate(() => {
    const L = window.__gl, mb = (m) => +([...m.values()].reduce((a, b) => a + b, 0) / 1048576).toFixed(1);
    return { textures: L.tex.size, textureMB: mb(L.tex), renderbufferMB: mb(L.rb), buffers: L.buf.size, bufferMB: mb(L.buf) };
  });
  const out = [];
  for (const track of ['meridian', 'monsoon', 'zenith', 'meridian', 'monsoon', 'zenith', 'meridian']) {
    await race(page, track, 30, 3);
    await page.waitForTimeout(5000); // the painted art
    await page.evaluate(() => { const g = window.game; for (let i = 0; i < 3; i++) g.frame(g.last + 1000 / 60); g.renderer.renderer.getContext().finish(); });
    const t = { track, ...(await tally()) };
    out.push(t);
    console.log(JSON.stringify(t));
  }
  await browser.close();
  return out;
}

// ---- memory -----------------------------------------------------------------
async function memory() {
  // A profile folder of its own, to find this browser's processes by.
  const dir = mkdtempSync(join(tmpdir(), 'perf-audit-'));
  const ctx = await chromium.launchPersistentContext(dir, { ...PHONE, args: [...FLAGS, '--autoplay-policy=no-user-gesture-required'] });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => { let s = 9; Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296); });
  await page.goto(BASE + '?seed=9&demo=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined, null, { timeout: 600000, polling: 200 });
  const browser = { close: () => ctx.close() };
  const main = execSync('ps -eo pid,args', { encoding: 'utf8' }).split('\n').find((l) => l.includes(`--user-data-dir=${dir}`) && !l.includes('--type='));
  const pid = Number(main?.trim().split(/\s+/)[0]);
  // This browser's page (renderer) processes only, resident MB.
  const rss = () => {
    const rows = execSync('ps -eo pid,ppid,rss,args', { encoding: 'utf8' }).trim().split('\n').slice(1).map((l) => { const [p, pp, kb, ...a] = l.trim().split(/\s+/); return { pid: +p, ppid: +pp, kb: +kb, args: a.join(' ') }; });
    const mine = new Set([pid]);
    for (let grew = true; grew;) { grew = false; for (const r of rows) if (mine.has(r.ppid) && !mine.has(r.pid)) { mine.add(r.pid); grew = true; } }
    const pick = (re) => Math.round(rows.filter((r) => mine.has(r.pid) && re.test(r.args)).reduce((a, r) => a + r.kb, 0) / 1024);
    return { pageMB: pick(/--type=renderer/), gpuProcessMB: pick(/--type=gpu-process/) };
  };
  const out = [];
  const mark = async (label) => { const m = { label, ...rss() }; out.push(m); console.log(JSON.stringify(m)); };
  await mark('title');
  await page.mouse.click(400, 200);
  await page.waitForTimeout(20000);
  await mark('title +20 s');
  for (const track of ['meridian', 'canyon', 'monsoon', 'meridian']) {
    await page.evaluate((track) => {
      const g = window.game;
      g.menus.reset('modes', undefined, ['title']);
      g.loadout.team = 4; g.loadout.role = 0; g.free.rival = 3; g.free.track = track; g.free.mode = 'teams';
      g.startFree();
    }, track);
    await page.waitForTimeout(25000);
    await mark(`racing ${track}`);
  }
  await browser.close();
  return out;
}

const run = { load, frame, gpu, memory };
for (const s of ['load', 'frame', 'gpu', 'memory']) if (sections.has(s)) { console.log(`--- ${s}`); result[s] = await run[s](); }
writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`written ${outPath}`);

// ---- compare ----------------------------------------------------------------
if (basePath) {
  const b = JSON.parse(readFileSync(basePath, 'utf8'));
  const lines = [];
  const row = (label, was, now, unit = '') => {
    if (was === undefined || now === undefined) return;
    const d = now - was;
    const pct = was ? ` (${d >= 0 ? '+' : ''}${((d / was) * 100).toFixed(0)}%)` : '';
    lines.push(`${label.padEnd(38)} ${String(was).padStart(9)} -> ${String(now).padStart(9)}${unit}${pct}`);
  };
  if (b.load && result.load) {
    row('load: ms to title', b.load.msToTitle, result.load.msToTitle);
    row('load: long tasks ms', b.load.longTaskMs, result.load.longTaskMs);
    for (const k of new Set([...Object.keys(b.load.beforeTitle), ...Object.keys(result.load.beforeTitle)])) row(`load: ${k} MB before title`, b.load.beforeTitle[k]?.MB ?? 0, result.load.beforeTitle[k]?.MB ?? 0);
    for (const k of new Set([...Object.keys(b.load.next15s), ...Object.keys(result.load.next15s)])) row(`load: ${k} MB in next 15 s`, b.load.next15s[k]?.MB ?? 0, result.load.next15s[k]?.MB ?? 0);
  }
  if (b.frame && result.frame) for (const t of Object.keys(result.frame)) {
    const x = b.frame[t], y = result.frame[t];
    if (!x) continue;
    row(`${t}: draw calls`, x.calls, y.calls);
    row(`${t}: triangles`, x.tris, y.tris);
    row(`${t}: programs`, x.programs, y.programs);
    row(`${t}: auto-updated matrices`, x.autoMatrix, y.autoMatrix);
    row(`${t}: texture uploads / frame`, x.uploadsPerFrame, y.uploadsPerFrame);
    row(`${t}: logic ms (mean)`, x.logicMs.mean, y.logicMs.mean);
    row(`${t}: submit ms (mean)`, x.submitMs.mean, y.submitMs.mean);
  }
  if (b.gpu && result.gpu) b.gpu.forEach((x, i) => { const y = result.gpu[i]; if (y) row(`gpu: ${i + 1}. ${x.track} texture MB`, x.textureMB, y.textureMB); });
  if (b.gpu && result.gpu) row('gpu: renderbuffer MB', b.gpu.at(-1).renderbufferMB, result.gpu.at(-1).renderbufferMB);
  if (b.memory && result.memory) b.memory.forEach((x, i) => { const y = result.memory[i]; if (y) row(`memory: ${x.label} page MB`, x.pageMB, y.pageMB); });
  console.log(`--- compared with ${basePath}\n` + lines.join('\n'));
}

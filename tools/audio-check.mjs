// Runs tools/audio-check.html in headless Chromium and prints what it measured.
//
//   node tools/audio-check.mjs [--quick] [--dump <dir>] [--url <page url>]
//
// --quick  skip the real-time pass (offline renders only, a few seconds)
// --dump   write the offline renders to <dir> as WAV files, for listening
//
// Uses the Vite dev server on http://localhost:5173 (or the local port in
// --url) and starts one for the duration of the run if nothing is listening
// there. Exits non-zero if any sound is silent or clips, and on any page
// error, console error or audio warning.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const quick = flag('--quick');
const dumpDir = value('--dump');
const base = value('--url') ?? 'http://localhost:5173/tools/audio-check.html';
const query = [quick ? 'quick=1' : '', dumpDir ? 'dump=1' : ''].filter(Boolean).join('&');
const url = query ? `${base}?${query}` : base;

async function reachable() {
  try {
    const r = await fetch(base, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await reachable())) {
  const { hostname, port } = new URL(base);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    console.error(`could not reach ${base}`);
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`no dev server on :${port || 80}, starting one`);
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', port || '80', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await reachable()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await reachable())) {
    server.kill();
    console.error(`could not reach ${base}`);
    process.exit(2);
  }
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => {
  const type = m.type();
  const text = m.text();
  if (type === 'error') problems.push(`console error: ${text}`);
  else if (type === 'warning' && text.includes('[audio]')) problems.push(`audio warning: ${text}`);
  if (type === 'error' || type === 'warning') console.log(`  [${type}] ${text}`);
  else if (text.startsWith('---') || text.startsWith('FAIL')) console.log(`  ${text}`);
});
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
// Vite's live-reload client would restart the page if a source file changed mid-run.
await page.route('**/@vite/client', (r) => r.fulfill({
  contentType: 'text/javascript',
  body: 'export const createHotContext = () => ({ accept() {}, dispose() {}, prune() {}, on() {}, off() {}, invalidate() {}, send() {} }); export const updateStyle = () => {}; export const removeStyle = () => {}; export const injectQuery = (u) => u;',
}));
if (dumpDir) {
  mkdirSync(dumpDir, { recursive: true });
  await page.exposeFunction('__audioDump', (name, b64) => {
    writeFileSync(join(dumpDir, `${name}.wav`), Buffer.from(b64, 'base64'));
  });
}

const started = Date.now();
let report = null;
try {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__audioReport?.done === true, null, { timeout: 420000, polling: 250 });
  report = await page.evaluate(() => window.__audioReport);
} catch (err) {
  problems.push(`check did not finish: ${err.message}`);
  report = await page.evaluate(() => window.__audioReport ?? null).catch(() => null);
}
await browser.close();
server?.kill();

function print(title, rows) {
  if (!rows.length) return;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => (v === undefined ? '' : String(v));
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals) => vals.map((v, i) => (typeof v === 'number' ? cell(v).padStart(width[i]) : cell(v).padEnd(width[i]))).join('  ');
  console.log(`\n${title}`);
  console.log(line(cols));
  console.log(width.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
}

if (report) {
  for (const [title, rows] of Object.entries(report.tables)) {
    if (title === 'startup') {
      console.log('\nstartup');
      for (const [k, v] of Object.entries(rows[0])) console.log(`  ${k}: ${v}`);
    } else print(title, rows);
  }
  if (report.notes.length) {
    console.log('\nnotes');
    for (const n of report.notes) console.log(`  ${n}`);
  }
}
const failures = [...(report?.failures ?? []), ...problems];
console.log(`\n${((Date.now() - started) / 1000).toFixed(1)} s`);
if (failures.length) {
  console.log(`\nFAILED (${failures.length})`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nOK: every sound is audible, nothing clips, no errors.');

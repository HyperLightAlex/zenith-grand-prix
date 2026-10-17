// Draws the opening frame by frame in the compositor (comp/index.html) and
// saves each frame as a JPEG. Serves the repo itself on a spare port while
// it runs, so the compositor can load the footage, the game's art and fonts.
//   node tools/trailer/render.mjs <out dir> [from] [to] [--frames a,b,c] [--q foot=../out/frames]
// Frames are 24 a second; the opening is 1795 frames (74.8 s).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const args = process.argv.slice(2);
const out = args[0];
if (!out) throw new Error('usage: render.mjs <out dir> [from] [to] [--frames a,b,c] [--q query]');
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const list = opt('--frames')?.split(',').map(Number);
const from = +(args[1] ?? 0), to = +(args[2] ?? 1795);
const frames = list ?? Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
mkdirSync(out, { recursive: true });

// The repo, read-only, on a port of its own.
const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.srt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const server = createServer((req, res) => {
  const path = normalize(join(ROOT, decodeURIComponent((req.url ?? '/').split('?')[0])));
  if (!path.startsWith(ROOT) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(`http://127.0.0.1:${port}/tools/trailer/comp/index.html?${opt('--q') ?? ''}`);
await page.waitForFunction(() => window.compReady, null, { timeout: 120000, polling: 200 });
const t0 = Date.now();
for (const n of frames) {
  const url = await page.evaluate(async (n) => { await window.renderFrame(n); return document.getElementById('c').toDataURL('image/jpeg', 0.95); }, n);
  writeFileSync(`${out}/${String(n).padStart(4, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
}
console.log(frames.length, 'frames in', ((Date.now() - t0) / 1000).toFixed(1), 's');
await browser.close();
server.close();

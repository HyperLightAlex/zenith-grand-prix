// Dev helper: open a page in headless Chromium and save a screenshot.
//   node tools/shot.mjs <url> <out.png> [waitMs] [width] [height] [jsToRunBefore]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const [url, out, wait = '1500', w = '1280', h = '720', js = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
await page.goto(url, { waitUntil: 'load' });
if (js) await page.evaluate(js);
await page.waitForTimeout(+wait);
// Optional extra shots: SHOTS="name:waitMs:js;name2:waitMs:js"
await page.screenshot({ path: out });
if (process.env.SHOTS) {
  for (const part of process.env.SHOTS.split(';;')) {
    const [name, ms, ...code] = part.split('::');
    if (code.length) await page.evaluate(code.join('::'));
    await page.waitForTimeout(+ms);
    await page.screenshot({ path: out.replace(/\.png$/, `-${name}.png`) });
  }
}
const info = await page.evaluate(() => JSON.stringify(window.__info ?? null));
console.log('info', info);
for (const l of logs.slice(0, 40)) console.log(l);
await browser.close();

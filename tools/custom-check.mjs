// Custom mechs: every part of every design on every other design of its
// frame, built in a browser (the mech viewer's window.customCheck), each
// checked for armour on every joint at every level of detail, its ink, its
// markings, its thrusters and the muzzle on the gun arm. Needs the game
// served (npm start, or npm run dev with URL=http://localhost:5173/).
//
//   URL=http://127.0.0.1:8090/ node tools/custom-check.mjs

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const base = process.env.URL ?? 'http://localhost:8090/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?debug=mechs&customCheck&role=0&turn`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.customCheck === 'function', null, { timeout: 180000 });
let bad = 0;
for (const role of [0, 1, 2]) {
  const t = Date.now();
  const { built, failed } = await page.evaluate((r) => window.customCheck(r), role);
  console.log(`${['Swift', 'Vector', 'Bulwark'][role]}: ${built} built in ${((Date.now() - t) / 1000).toFixed(0)} s, ${failed.length} problems`);
  for (const f of failed.slice(0, 40)) console.log('  ' + f);
  bad += failed.length;
}
if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
await browser.close();
console.log(bad || errors.length ? 'FAILED' : 'OK: every part fits every design of its frame');
process.exit(bad || errors.length ? 1 : 0);

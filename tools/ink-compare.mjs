// Before and after for the look's line work: the same frozen frames from two
// builds, side by side. Each scene is played until it settles, then the game
// loop is stopped and the last frame drawn again with nothing moving, so two
// builds can be compared pixel for pixel (the race and the hangar's orbit
// are seeded, so the scenes match closely, not exactly).
//
//   URL_A=http://localhost:8091/ URL_B=http://localhost:8090/ node tools/ink-compare.mjs out
//   SIZES=desk,nova  SCENES=hangar,race  LOOK=plain  ...
//
// Writes out/<a|b>-<size>-<scene>.png and out/compare-<size>-<scene>.png
// (A over B, plus a 2x crop of the player's mech side by side). Needs two
// servers (npm start on two ports, one per build) and Playwright.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const out = process.argv[2] ?? 'ink-compare-out';
mkdirSync(out, { recursive: true });
const builds = { a: process.env.URL_A ?? 'http://localhost:8091/', b: process.env.URL_B ?? 'http://localhost:8090/' };
const sizes = (process.env.SIZES ?? 'desk').split(',');
const scenes = (process.env.SCENES ?? 'hangar,race').split(',');
const SZ = { desk: { width: 1280, height: 720, scale: 1 }, nova: { width: 640, height: 480, scale: 2 }, phone: { width: 844, height: 390, scale: 3 } };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--in-process-gpu'] });
const crops = {};
for (const [tag, base] of Object.entries(builds)) {
  for (const sz of sizes) {
    for (const scene of scenes) {
      const s = SZ[sz];
      const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale });
      page.on('pageerror', (e) => console.log(`${tag} ${sz} ${scene} pageerror: ${e.message}`));
      await page.goto(`${base}?mute=1&seed=5${process.env.LOOK ? `&look=${process.env.LOOK}` : ''}`);
      await page.waitForFunction(() => window.game !== undefined, null, { timeout: 180000 });
      // Play on for `t` seconds of game time (software rendering is slow; this waits however long that takes).
      const run = async (t) => {
        const t0 = await page.evaluate(() => window.game.time);
        await page.waitForFunction(([t0, t]) => window.game.time - t0 > t, [t0, t], { timeout: 600000 });
      };
      if (scene === 'hangar') {
        await page.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openFreePlay(); });
        await run(2.5);
        await page.evaluate(() => { document.querySelector('.menu').style.visibility = 'hidden'; });
      } else {
        await page.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.startFree(); });
        await page.waitForFunction(() => window.game.debugState().state === 'race', null, { timeout: 120000 });
        await page.evaluate(() => window.game.session.fastForward(95));
        await run(1.5);
        await page.evaluate(() => { document.querySelector('.hud').style.visibility = 'hidden'; });
      }
      // Stop the loop on this frame and draw it again with nothing moving.
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      await page.waitForTimeout(3000);
      // Where the player's mech is on screen, for the crop.
      crops[`${sz}-${scene}`] ??= await page.evaluate(() => {
        const g = window.game;
        const p = g.view.plates[g.view.focusId] ?? null;
        return p && p.visible ? { x: p.cx, y: p.cy, h: Math.abs(p.cy - p.y) } : null;
      });
      await page.evaluate(() => window.game.renderer.composer.render(0));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${out}/${tag}-${sz}-${scene}.png`, timeout: 300000 });
      console.log(`${tag} ${sz} ${scene}`);
      await page.close();
    }
  }
}
await browser.close();

// The sheets, with Python and Pillow if they are there.
const py = String.raw`
import json, sys
from PIL import Image
out, crops = sys.argv[1], json.loads(sys.argv[2])
for key, c in crops.items():
    a = Image.open(f'{out}/a-{key}.png').convert('RGB'); b = Image.open(f'{out}/b-{key}.png').convert('RGB')
    w, h = a.size
    sheet = Image.new('RGB', (w, h * 2 + 8)); sheet.paste(a, (0, 0)); sheet.paste(b, (0, h + 8))
    sheet.save(f'{out}/compare-{key}.png')
    if c:
        # The mech's body: centred on it, about as tall as head to feet and a bit.
        r = max(60, c['h'] * 1.6)
        box = (max(0, int(c['x'] - r)), max(0, int(c['y'] - r * 1.2)), min(w, int(c['x'] + r)), min(h, int(c['y'] + r * 1.2)))
        ca, cb = a.crop(box), b.crop(box)
        ca = ca.resize((ca.width * 2, ca.height * 2), Image.NEAREST); cb = cb.resize((cb.width * 2, cb.height * 2), Image.NEAREST)
        pair = Image.new('RGB', (ca.width * 2 + 8, ca.height)); pair.paste(ca, (0, 0)); pair.paste(cb, (ca.width + 8, 0))
        pair.save(f'{out}/crop-{key}.png')
`;
try {
  // Plate positions are in CSS pixels; the screenshots are in device pixels.
  const scaled = Object.fromEntries(Object.entries(crops).map(([k, c]) => {
    const s = SZ[k.split('-')[0]].scale;
    return [k, c ? { x: c.x * s, y: c.y * s, h: c.h * s } : null];
  }));
  execFileSync('python3', ['-c', py, out, JSON.stringify(scaled)], { stdio: 'inherit' });
} catch {
  console.log('(no Python/Pillow: compare the a- and b- images by hand)');
}

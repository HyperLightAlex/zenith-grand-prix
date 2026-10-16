import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
// The Video settings in a real browser: each setting, the 4:3 frame, the CRT,
// settings kept after a reload, and the screen from the pause menu.
//
//   URL=http://localhost:8090/ node tools/video-check.mjs      against npm start
//   SHOTS=some/folder  also saves screenshots there
const base = process.env.URL ?? 'http://localhost:5173/';
const out = process.env.SHOTS;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.setDefaultTimeout(150000);
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console ' + m.text().slice(0, 200)); });
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push(what); };
await page.goto(base + '?mute=1');
await page.waitForFunction(() => window.game !== undefined);
await page.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); });
await page.locator('.menu .item', { hasText: 'Video' }).click();
await page.waitForFunction(() => window.game.menus.screen === 'video');
const items = await page.evaluate(() => [...document.querySelectorAll('.menu .item')].map((x) => x.textContent));
check(items.length === 5, `the Video screen: ${items.join(' / ')}`);
await page.waitForTimeout(2500);
if (out) await page.screenshot({ path: `${out}/video-plain.png` });
const click = (label) => page.locator('.menu .item', { hasText: label }).click();
await click('CRT screen');
await page.waitForTimeout(400);
check(await page.evaluate(() => document.documentElement.classList.contains('crt-on') && window.game.renderer.crtPass.enabled), 'CRT on: the layer and the pass');
await click('Screen shape');
await page.waitForTimeout(800);
const box = await page.evaluate(() => { const c = document.getElementById('stage').getBoundingClientRect(); return { w: c.width, h: c.height, x: c.x, narrow: document.documentElement.classList.contains('narrow') }; });
check(Math.abs(box.w / box.h - 4 / 3) < 0.01 && box.x > 100 && box.narrow, `4:3: the picture boxed in the middle (${Math.round(box.w)}x${Math.round(box.h)} at x ${Math.round(box.x)}), narrow layouts on`);
await click('Animation');
await page.waitForTimeout(400);
check(await page.evaluate(() => window.game.drawingsPerSecond === 30), 'animation: 30 drawings a second');
const before = await page.evaluate(() => window.game.view.mechs.length);
await click('Armor panel lines');
await page.waitForTimeout(800);
check(await page.evaluate(() => !JSON.parse(localStorage.getItem('zgp.video')).panels), 'panel lines off, and saved');
await page.waitForTimeout(2500);
if (out) await page.screenshot({ path: `${out}/video-crt43.png` });
// The settings stay after a reload.
await page.reload();
await page.waitForFunction(() => window.game !== undefined);
const kept = await page.evaluate(() => ({ cls: document.documentElement.className, steps: window.game.drawingsPerSecond, v: JSON.parse(localStorage.getItem('zgp.video')) }));
check(kept.cls.includes('aspect-43') && kept.cls.includes('crt-on') && kept.steps === 30 && kept.v.panels === false, `kept after a reload (${kept.cls}; ${kept.steps}; ${JSON.stringify(kept.v)})`);
// In the pause menu too.
await page.evaluate(() => window.game.startFree());
await page.waitForFunction(() => window.game.debugState().state === 'race');
await page.waitForTimeout(3000);
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.game.menus.screen === 'pause');
const pauseItems = await page.evaluate(() => [...document.querySelectorAll('.menu .item')].map((x) => x.textContent));
check(pauseItems.some((t) => t === 'Video'), `Video in the pause menu (${pauseItems.join(' / ')})`);
await page.locator('.menu .item', { hasText: 'Video' }).click();
await page.waitForFunction(() => window.game.menus.screen === 'video');
await click('Armor panel lines');
await page.waitForTimeout(1500);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('zgp.video')).panels === true && window.game.debugState().state === 'paused'), 'panel lines back on mid-race, still paused');
await page.waitForFunction(() => window.game.menus.screen === 'video');
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.game.menus.screen !== 'video', null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ screen: window.game.menus.screen, state: window.game.debugState().state }));
check(after.screen === 'pause' && after.state === 'paused', 'Back returns to the pause menu (' + JSON.stringify(after) + ')');
if (out) await page.screenshot({ path: `${out}/video-race43.png` });
// Back to the defaults for anyone else using this browser profile.
await page.evaluate(() => { localStorage.removeItem('zgp.video'); });
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'no errors or failed checks');
await browser.close();
process.exit(problems.length ? 1 : 0);

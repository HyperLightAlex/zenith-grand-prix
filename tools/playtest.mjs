// Dev helper: drive the real game with keyboard input in headless Chromium
// and report what happened. Needs the dev server running (npm run dev).
//   node tools/playtest.mjs [outDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const out = process.argv[2] ?? 'playtest-out';
mkdirSync(out, { recursive: true });
const url = process.env.URL ?? 'http://localhost:5173/?seed=5';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
const state = () => page.evaluate(() => window.game.debugState());
const me = async () => { const s = await state(); return { ...s.mechs[s.focus], tick: s.tick, state: s.state, lapPhase: s.lapPhase, phase: s.phase }; };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const log = (...a) => console.log(...a);
const untilTick = async (tick, limitMs = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < limitMs) { const s = await state(); if (s.tick >= tick) return s; await page.waitForTimeout(250); } throw new Error('timeout waiting for tick ' + tick); };

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.game !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(1500);
log('title:', (await state()).state);
await shot('1-title');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
log('after Enter:', (await state()).state);
// Frame -> Vector (midfielder), then down to Start race.
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1200);
await shot('2-garage');
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
let s = await state();
log('race started:', s.state, 'tick', s.tick, 'focus', s.focus, s.mechs[s.focus].name);
const t0 = Date.now();
await untilTick(215);
await page.keyboard.down('KeyW');
await untilTick(260);
log('fps estimate:', (260 / 60 / ((Date.now() - t0) / 1000)).toFixed(2), 'x real time');
await untilTick(420);
let m = await me();
log('3 s after GO: speed', m.speed, 's', m.s, 'place', m.place);
await shot('3-racing');
// Steer right for a second, then left.
const d0 = await page.evaluate(() => window.game.session.race.mechs[window.game.session.localId].d);
await page.keyboard.down('KeyD');
await untilTick(470);
await page.keyboard.up('KeyD');
const d1 = await page.evaluate(() => window.game.session.race.mechs[window.game.session.localId].d);
log('steer right: d', d0.toFixed(1), '->', d1.toFixed(1));
await page.keyboard.down('KeyA');
await untilTick(500);
await page.keyboard.up('KeyA');
// Boost.
const drive0 = await page.evaluate(() => window.game.session.race.mechs[window.game.session.localId].drive);
await page.keyboard.down('Space');
await untilTick(560);
await page.keyboard.up('Space');
m = await me();
const drive1 = await page.evaluate(() => window.game.session.race.mechs[window.game.session.localId].drive);
log('boost: speed', m.speed, 'drive', drive0.toFixed(0), '->', drive1.toFixed(0));
// Weapons are locked on lap 1.
await page.keyboard.press('KeyJ');
await page.waitForTimeout(300);
// Team command.
await page.keyboard.press('Digit3');
await page.waitForTimeout(500);
log('tactic after 3:', await page.evaluate(() => window.game.session.race.teams[window.game.session.race.mechs[window.game.session.localId].team].tactic));
// Lock on to whoever is near.
await page.keyboard.press('KeyQ');
await page.waitForTimeout(600);
m = await me();
log('after lock: mode', m.mode);
await shot('4-locked');
await page.keyboard.press('KeyQ');
// Pause and resume.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
log('paused:', (await state()).state);
await shot('5-paused');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
log('resumed:', (await state()).state);
// Jump ahead to the battle lap by fast-forwarding the session (AI flies meanwhile).
await page.evaluate(() => { const g = window.game; const me = g.session.race.mechs[g.session.localId]; me.human = false; g.session.fastForward(90); me.human = true; });
s = await state();
log('after fast-forward: tick', s.tick, 'lapPhase', s.lapPhase);
// Fight: lock, close in, attack, guard, dash.
await page.keyboard.press('KeyQ');
await page.waitForTimeout(400);
for (let i = 0; i < 12; i++) {
  await page.keyboard.press(i % 3 === 2 ? 'KeyK' : 'KeyJ');
  await page.waitForTimeout(350);
  if (i === 5) { await page.keyboard.down('KeyL'); await page.waitForTimeout(500); await page.keyboard.up('KeyL'); await page.keyboard.press('Space'); }
  if (i === 6) await shot('6-fight');
}
m = await me();
const dealt = await page.evaluate(() => window.game.session.race.mechs[window.game.session.localId].dmgDealt);
log('fight: mode', m.mode, 'hp', m.hp, 'damage dealt', Math.round(dealt));
await page.keyboard.press('KeyQ');
// Skip to the end and let the results come up.
await page.evaluate(() => { const g = window.game; const me = g.session.race.mechs[g.session.localId]; me.human = false; g.session.fastForward(150); });
await page.waitForFunction(() => window.game.debugState().state === 'results', null, { timeout: 240000 });
await page.waitForTimeout(1500);
await shot('7-results');
log('results shown');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
log('after "Back to garage":', (await state()).state);
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);
log('after Esc:', (await state()).state);
const audio = await page.evaluate(() => (window.game.audio.debugInfo ? window.game.audio.debugInfo() : null));
log('audio:', JSON.stringify(audio));
log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.slice(0, 30).join('\n') : 'no console errors or warnings');
await browser.close();

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
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
const state = () => page.evaluate(() => window.game.debugState());
const mine = () => page.evaluate(() => { const g = window.game; const m = g.session.race.mechs[g.session.localId]; return { speed: Math.round(m.speed), s: Math.round(m.s), d: +m.d.toFixed(1), drive: Math.round(m.drive), cells: m.cells, mode: m.mode, act: m.act, place: m.place, hp: Math.round(m.hp), overdriveT: m.overdriveT, cloakT: m.cloakT, target: m.target, lap: m.lap }; });
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const log = (...a) => console.log(...a);
const check = (ok, what) => { log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push('check failed: ' + what); };
const untilTick = async (tick, limitMs = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < limitMs) { const s = await state(); if (s.tick >= tick) return s; await page.waitForTimeout(200); } throw new Error('timeout waiting for tick ' + tick); };
const ticks = async (n) => untilTick((await state()).tick + n);
// Let the computer fly the player's mech while the simulation is run ahead.
const skip = (seconds) => page.evaluate((sec) => { const g = window.game; const me = g.session.race.mechs[g.session.localId]; me.human = false; g.session.fastForward(sec); me.human = true; }, seconds);

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.game !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(1500);
log('title:', (await state()).state);
await shot('1-title');
// Title -> Play -> Free Play -> Hangar -> Match setup -> Start.
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await shot('2-garage');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
// Circuit, Rival team, Rival pilots, Match, Start: the format stays a best of 3.
for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.game.debugState().state === 'race', null, { timeout: 15000 }).catch(() => {});
let s = await state();
log('race started:', s.state, 'tick', s.tick, 'match', JSON.stringify(s.match));
check(s.state === 'race' && s.match && s.match.mode === 'series', 'a best-of-3 series started from Free Play');

// ---- formation lap
const t0 = Date.now();
await untilTick(215);
await page.keyboard.down('KeyW');
await untilTick(300);
log('speed of play:', (300 / 60 / ((Date.now() - t0) / 1000)).toFixed(2), 'x real time');
await untilTick(420);
let m = await mine();
log('3 s after GO:', JSON.stringify(m));
// A launch bonus (10) and three seconds of the lap-1 trickle at most.
check(m.drive <= 16, `Drive starts empty: only a launch bonus and the lap-1 trickle (drive ${m.drive})`);
await shot('3-lap1');
// The ability is locked on lap 1 and must not cost anything.
await page.evaluate(() => { const g = window.game; g.session.race.mechs[g.session.localId].cells = 1; });
await page.keyboard.press('KeyR');
await ticks(6);
m = await mine();
check(m.cells === 1 && m.overdriveT === 0, 'ability refused on the formation lap, Cell kept');
await page.evaluate(() => { const g = window.game; g.session.race.mechs[g.session.localId].cells = 0; });
// Let the computer take the rest of the lap so some gates get threaded.
await skip(78);
m = await mine();
s = await state();
log('end of lap 1:', JSON.stringify(m), 'lapPhase', s.lapPhase);
check(s.lapPhase === 2, 'into the battle lap');
check(m.cells > 0, `the computer pilot threaded gates on our behalf (cells ${m.cells})`);
check(m.drive > 10, `Drive came from the strips (drive ${m.drive})`);

// ---- abilities
await page.evaluate(() => { const g = window.game; g.session.race.mechs[g.session.localId].cells = 3; });
// (The computer may have handed the mech back mid-fight: let go first, and
// wait out any stagger, when the button would throw a Break Away instead.)
if ((await mine()).mode !== 0) { await page.keyboard.press('KeyQ'); await ticks(4); }
await ticks(20);
for (let i = 0; i < 20; i++) { const x = await mine(); if (x.mode === 0 && x.act !== 2) break; if (x.mode !== 0) await page.keyboard.press('KeyQ'); await ticks(6); }
await page.keyboard.press('KeyR');
await ticks(8);
m = await mine();
// Overdrive waits for the speed lap (rules.overdriveLap): refused, Cell kept.
check(m.overdriveT === 0 && m.cells === 3, `Overdrive refused on the battle lap, Cell kept (timer ${m.overdriveT}, cells ${m.cells})`);
// The ability's name on the dash, beside the Cells.
const tag = await page.evaluate(() => document.querySelector('.hud .dash-ability > span:last-child')?.textContent ?? '');
check(tag === 'Overdrive (lap 3)', `the HUD says when it opens (${tag})`);
await ticks(30);
await shot('4-overdrive-waits');
// Lock on and break away.
await page.keyboard.press('KeyQ');
await ticks(20);
m = await mine();
log('after lock:', JSON.stringify(m));
if (m.mode === 1) {
  await shot('5-locked');
  await ticks(50);
  await page.keyboard.press('KeyR');
  await ticks(6);
  m = await mine();
  check(m.mode === 0 && m.cloakT > 0 && m.cells === 2, `Break Away fired from a lock on the battle lap (mode ${m.mode}, cloak ${m.cloakT}, cells ${m.cells})`);
} else {
  log('  (nobody in lock range; Break Away not exercised)');
}

// ---- pause, tuning panel, resume without a phantom press
await ticks(60);
const before = await mine();
// (Software rendering draws a frame every second or so: wait for each step, not a set time.)
const settle = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
await page.keyboard.press('Escape');
await settle(() => window.game.debugState().state === 'paused');
check((await state()).state === 'paused', 'paused');
await page.keyboard.press('KeyT');
check(await settle(() => window.game.panel.open), 'tuning panel opens over the pause menu');
// Move one rule from the keyboard: over to the Pace tab (the Look tab is
// first), down to its first row, the lap-1 limiter.
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await settle(() => window.game.tuning.changedCount() > 0 && window.game.input.menu.length === 0);
const lim = await page.evaluate(() => ({ live: window.game.session.race.rules.limiter1, stored: window.game.tuning.rules.limiter1, changed: window.game.tuning.changedCount() }));
check(lim.live === 112 && lim.stored === 112 && lim.changed === 1, `a slider reaches the running race (limiter ${lim.live}, ${lim.changed} changed)`);
await shot('6-tuning');
await page.keyboard.press('Enter'); // back to the default
check(await settle(() => window.game.session.race.rules.limiter1 === 110 && window.game.tuning.changedCount() === 0), 'confirm puts the value back to its default');
await page.keyboard.press('Escape');
await settle(() => !window.game.panel.open && window.game.input.menu.length === 0);
await page.waitForTimeout(1500);
check(!(await page.evaluate(() => window.game.panel.open)) && (await state()).state === 'paused', 'Esc closes the panel and leaves the game paused');
// Resume with Space held (the "confirm" key, which is also boost and dash).
await page.keyboard.down('Space');
check(await settle(() => window.game.debugState().state === 'race'), 'resumed');
await ticks(8);
m = await mine();
check(m.cells === before.cells, 'resuming did not burn a Cell');
check(m.drive >= before.drive - 1, `resuming with the confirm key held did not boost or dash (drive ${before.drive} -> ${m.drive})`);
await page.keyboard.up('Space');

// ---- finish the round, then the match
await page.keyboard.up('KeyW');
for (let round = 1; round <= 3; round++) {
  await page.evaluate(() => { const g = window.game; g.session.race.mechs[g.session.localId].human = false; g.session.fastForward(260); });
  await page.waitForFunction(() => window.game.debugState().state === 'results', null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  s = await state();
  log(`round ${round} results:`, JSON.stringify(s.match));
  check(s.match.rounds === round, `round ${round} banked once`);
  await shot(`7-results-round${round}`);
  if (s.match.winner >= 0) break;
  await page.keyboard.press('Enter'); // Next round
  await page.waitForTimeout(1200);
  s = await state();
  check(s.state === 'race' && s.tick < 120, `round ${round + 1} started from the grid`);
}
s = await state();
check(s.match.winner >= 0, `the series was decided (${s.match.wins.join('-')})`);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
s = await state();
log('after "Change setup":', s.state, s.screen);
check(s.screen === 'setup', 'the results lead back to the match setup');
await shot('8-garage-again');
const audio = await page.evaluate(() => (window.game.audio.debugInfo ? window.game.audio.debugInfo() : null));
log('audio:', JSON.stringify(audio));
log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.slice(0, 30).join('\n') : 'no console errors, warnings or failed checks');
await browser.close();

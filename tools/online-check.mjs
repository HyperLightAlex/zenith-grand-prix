// Two browsers through the online game: one opens Online and makes a room,
// the other follows the invite link; both ready up, race (one-lap races if
// the server was started with TEST_LAPS=1), and the host ends the match.
// Needs the game served (npm run dev, or npm start) and its server running.
//
//   node tools/online-check.mjs                     against the dev server (5173)
//   URL=http://localhost:8090/ node tools/online-check.mjs   against npm start
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const base = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push('check failed: ' + what); };
async function player(name, url) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(150000);
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} [error] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${name} [pageerror] ${e.message}`));
  await page.addInitScript((n) => { try { localStorage.setItem('zgp.callsign', n); } catch {} }, name);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined, null, { timeout: 90000 });
  // Software rendering is slow: draw nothing, so the game runs at full speed.
  await page.evaluate(() => { window.game.renderer.render = () => {}; });
  return page;
}
const state = (p) => p.evaluate(() => window.game.debugState());
const a = await player('Alpha', base + '?mute=1');
await a.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openOnline(); });
await a.waitForFunction(() => window.game.online.squad, null, { timeout: 60000 });
check(true, 'Online opens and makes a squad of one');
await a.evaluate(() => window.game.createRoom());
await a.waitForFunction(() => window.game.online.lobby, null, { timeout: 60000 });
const code = await a.evaluate(() => window.game.online.room.roomId);
check(/^[A-Z2-9]{5}$/.test(code), `a room with a code (${code})`);
const b = await player('Bravo', `${base}?mute=1&room=${code}`);
await b.waitForFunction(() => window.game.online.lobby && window.game.menus.screen === 'room', null, { timeout: 60000 });
check(true, 'the invite link goes straight into the room');
const lobby = await a.evaluate(() => window.game.online.lobby);
check(lobby.players.length === 2 && lobby.players[0].side !== lobby.players[1].side, 'two people, one on each team');
await a.evaluate(() => window.game.online.sendRoom('settings', { match: 0 }));
await a.waitForTimeout(500);
for (const p of [a, b]) await p.evaluate(() => window.game.online.sendRoom('ready', { ready: true }));
await a.waitForFunction(() => window.game.debugState().state === 'race', null, { timeout: 30000 });
await b.waitForFunction(() => window.game.debugState().state === 'race', null, { timeout: 30000 });
check(true, 'everyone ready: the countdown runs and the race starts for both');
await a.waitForTimeout(8000);
const sa = await state(a);
check(sa.net && sa.net.gaps === 0 && sa.net.confirmed > 100, `the race runs (confirmed tick ${sa.net?.confirmed}, ${sa.net?.ahead} inputs predicted ahead)`);
await a.waitForFunction(() => window.game.debugState().state === 'results', null, { timeout: 400000 });
check(true, 'the results come up at the flag');
await a.waitForFunction(() => window.game.menus.screen === 'room', null, { timeout: 60000 });
check(true, 'after the final results, back in the room');
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'no errors or failed checks');
await browser.close();
process.exit(problems.length ? 1 : 0);

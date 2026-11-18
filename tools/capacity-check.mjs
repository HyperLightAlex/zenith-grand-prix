// Two browsers against a server with room for two connections: what a
// player sees while the servers are full. Alpha takes one connection (the
// squad everyone has online) and Bravo the other. Bravo's search for a race
// is told the servers are full, says so and keeps trying; when Alpha goes,
// it gets in by itself. Then Charlie arrives at a full server: the Online
// screen says so and locks what cannot be started, until Bravo leaves.
// Needs the game served and its server running with that limit:
//
//   MAX_SOCKETS=2 npx tsx server/index.ts &  npm run dev &
//   node tools/capacity-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const base = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push('check failed: ' + what); };
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(150000);
  // (A refused request is what this check is about: the browser logs each one.)
  page.on('console', (m) => { if (m.type() === 'error' && !/503|Service Unavailable/.test(m.text())) problems.push(`${name} [error] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${name} [pageerror] ${e.message}`));
  await page.addInitScript((n) => { try { localStorage.setItem('zgp.callsign', n); } catch {} }, name);
  await page.goto(base + '?mute=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined, null, { timeout: 90000 });
  await page.evaluate(() => { window.game.renderer.render = () => {}; });
  await page.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openOnline(); });
  await page.waitForFunction(() => window.game.menus.screen === 'online', null, { timeout: 60000 });
  return page;
}
const until = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const status = (p) => p.evaluate(() => document.querySelector('.menu .status')?.textContent ?? '');
const locked = (p, text) => p.evaluate((t) => [...document.querySelectorAll('.menu .item')].find((x) => x.textContent.startsWith(t))?.classList.contains('locked') ?? null, text);

const a = await player('Alpha');
check(await until(a, () => !!window.game.online.squad), 'Alpha is online (one connection)');
const b = await player('Bravo');
check(await until(b, () => !!window.game.online.squad), 'Bravo is online (two: the server is full)');

// A search on a full server: said on the screen, and tried again by itself.
await b.locator('.menu .item', { hasText: 'Quick Play' }).first().click();
await until(b, () => window.game.menus.screen === 'quick');
await b.locator('.menu .item', { hasText: 'Sprint' }).first().click();
check(await until(b, () => window.game.serversFull === true), 'Bravo\'s search is told the servers are full');
const said = await status(b);
check(/servers are full/i.test(said) && /Searching again in \d+ s/.test(said), `the screen says so and counts down ("${said}")`);
check((await locked(b, 'Sprint')) === true, 'the playlists wait while it does');
check((await b.evaluate(() => window.game.menus.screen)) === 'quick', 'no error dialog, no way out of the screen taken');
const first = Number(said.match(/in (\d+) s/)?.[1]);
await b.waitForTimeout(2500);
const later = Number((await status(b)).match(/in (\d+) s/)?.[1]);
check(later < first, `the count runs down (${first} then ${later})`);

// A place frees up: the search gets in without being asked again.
await a.context().close();
check(await until(b, () => window.game.menus.screen === 'room' && window.game.online.lobby?.quick === 'sprint', null, 45000), 'when Alpha leaves, Bravo is put in a lobby by itself');
check((await b.evaluate(() => window.game.serversFull)) === false && (await b.evaluate(() => window.game.onlineStatus)) === '', 'and the notice is gone');

// Arriving at a full server (Bravo holds both connections: squad and lobby).
const c = await player('Charlie');
check(await until(c, () => window.game.serversFull === true), 'Charlie, arriving, is told the servers are full');
const hub = await status(c);
check(/servers are full/i.test(hub) && /Trying again in \d+ s/.test(hub), `the Online screen says so ("${hub}")`);
check((await locked(c, 'Quick Play')) === true && (await locked(c, 'Create room')) === true && (await locked(c, 'Join room')) === true, 'what cannot be started is locked, with the reason');
// Backing out stops the tries; coming back starts them again.
await c.evaluate(() => window.game.leaveOnline());
await c.waitForTimeout(500);
check((await c.evaluate(() => window.game.serversFull)) === false && (await c.evaluate(() => window.game.menus.screen)) === 'modes', 'leaving Online stops the tries');
await c.evaluate(() => window.game.openOnline());
check(await until(c, () => window.game.serversFull === true), 'coming back, it is still full and says so');
await b.context().close();
check(await until(c, () => !!window.game.online.squad && window.game.serversFull === false, null, 45000), 'when Bravo leaves, Charlie is online by itself');
check((await locked(c, 'Quick Play')) === false, 'and Quick Play opens');

await browser.close();
if (problems.length) { console.log('\nPROBLEMS:\n' + problems.join('\n')); process.exit(1); }
console.log('\ncapacity check passed');

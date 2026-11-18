// Three browsers through Quick Play: a squad of two (Alpha leading, Charlie)
// searches a playlist from the Online screen and is put in a lobby together
// on one team; Bravo, searching alone, is put in with them on the other.
// The race starts by itself with computer pilots in the free places. After
// it the lobby opens again on another circuit, without Charlie, who never
// touched the controls. Needs the game served and its server running with
// one-lap races:
//
//   TEST_LAPS=1 npx tsx server/index.ts &  npm run dev &
//   node tools/quick-check.mjs                       against the dev server (5173)
//   URL=http://localhost:8090/ node tools/quick-check.mjs   against npm start (TEST_LAPS=1)
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
const until = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const items = (p) => p.evaluate(() => [...document.querySelectorAll('.menu .item')].map((x) => x.textContent));
const online = async (p) => {
  await p.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openOnline(); });
  await p.waitForFunction(() => window.game.online.squad && window.game.menus.screen === 'online', null, { timeout: 60000 });
};

const a = await player('Alpha', base + '?mute=1');
await online(a);
const squadCode = await a.evaluate(() => window.game.online.squad.roomId);
const c = await player('Charlie', `${base}?mute=1&squad=${squadCode}`);
check(await until(c, () => window.game.online.squadView?.members.length === 2 && window.game.menus.screen === 'online', null, 60000), 'Charlie joins Alpha\'s squad');
const b = await player('Bravo', base + '?mute=1');
await online(b);

// The hub: Quick Play first, for the leader; a member is told who starts the search.
const hubA = await items(a);
check(/^Quick Play/.test(hubA[0] ?? ''), `Quick Play heads the Online screen (${hubA.slice(0, 3).join(' / ')})`);
await c.locator('.menu .item', { hasText: 'Quick Play' }).first().click();
await c.waitForTimeout(400);
check((await c.evaluate(() => window.game.menus.screen)) === 'online', 'a squad\'s member cannot start the search');

// The leader picks a playlist from the list.
await a.locator('.menu .item', { hasText: 'Quick Play' }).first().click();
check(await until(a, () => window.game.menus.screen === 'quick'), 'Quick Play opens its playlists');
const lists = await items(a);
check(['Team Race', 'Team Series', 'Points Race', 'Sprint', 'Sprint Series'].every((n) => lists.some((t) => t.startsWith(n))), `every playlist is there (${lists.map((t) => t.slice(0, 14)).join(' / ')})`);
const panel = await a.evaluate(() => document.querySelector('.menu .panel')?.textContent ?? '');
check(/squad of 2 goes in together/.test(panel), 'the screen says the squad goes in together');
await a.locator('.menu .item', { hasText: 'Team Race' }).first().click();
check(await until(a, () => window.game.menus.screen === 'room' && window.game.online.lobby?.quick === 'team-race'), 'the search puts Alpha in a Team Race lobby');
check(await until(c, () => window.game.menus.screen === 'room' && window.game.online.lobby?.quick === 'team-race'), 'Charlie follows the leader in');
// Bravo, alone, searches the same playlist and lands in the same lobby.
await b.evaluate(() => void window.game.quickPlay('team-race'));
check(await until(b, () => window.game.menus.screen === 'room' && window.game.online.lobby?.players.length === 3), 'Bravo, searching alone, is put in with them');
const rooms = await Promise.all([a, b, c].map((p) => p.evaluate(() => window.game.online.room?.roomId)));
check(rooms[0] && rooms.every((r) => r === rooms[0]), `one lobby for all three (${rooms.join(', ')})`);
const sides = await a.evaluate(() => Object.fromEntries(window.game.online.lobby.players.map((p) => [p.callsign, p.side])));
check(sides.Alpha === sides.Charlie && sides.Bravo !== sides.Alpha, `the squad on one team, Bravo on the other (${JSON.stringify(sides)})`);

// The lobby: Quick Play's bar and clock, nothing a host would have, the settings locked.
const bar = await a.evaluate(() => document.querySelector('.menu .roombar')?.textContent ?? '');
check(/Quick Play · Team Race/.test(bar) && /Race starts in \d+/.test(bar) && /finding more pilots/.test(bar) && /Single race/.test(bar), `the lobby says what it is and counts down (${bar})`);
const roomItems = await a.evaluate(() => [...document.querySelectorAll('.menu .panel.actions-panel .item')].map((x) => x.textContent));
check(roomItems.some((t) => /^Ready/.test(t)) && roomItems.some((t) => /^Leave/.test(t)) && !roomItems.some((t) => /Invite|Start now|End match/.test(t)), `Ready and Leave, no Invite or Start now (${roomItems.join(' / ')})`);
const track0 = await a.evaluate(() => window.game.online.lobby.settings.track);
await a.evaluate(() => window.game.online.sendRoom('settings', { track: 'meridian', match: 2 }));
await a.waitForTimeout(600);
const set = await a.evaluate(() => window.game.online.lobby.settings);
check(set.track === track0 && set.match === 0 && set.mode === 'teams', `nobody changes its settings (${JSON.stringify(set)})`);

// The race starts by itself: six mechs, three of them people.
const started = await Promise.all([a, b, c].map((p) => until(p, () => window.game.debugState().state === 'race', null, 60000)));
check(started.every(Boolean), 'the race starts by itself for all three');
const grid = await a.evaluate(() => { const r = window.game.session.race; return { mechs: r.mechs.length, people: r.mechs.filter((m) => m.human).length }; });
check(grid.mechs === 6 && grid.people === 3, `six mechs, three people, three computer pilots (${JSON.stringify(grid)})`);
// Alpha and Bravo fly (steering to and fro); Charlie never touches the controls.
let racing = true;
const fly = async (p) => {
  while (racing) {
    for (const k of ['ArrowLeft', 'ArrowRight']) {
      if (!racing) break;
      await p.keyboard.down('ArrowUp').catch(() => {});
      await p.keyboard.down(k).catch(() => {});
      await p.waitForTimeout(350).catch(() => {});
      await p.keyboard.up(k).catch(() => {});
    }
  }
};
const flying = [fly(a), fly(b)];
const flagged = await until(a, () => { const s = window.game.debugState().state; return s === 'results' || s === 'podium'; }, null, 420000);
racing = false;
await Promise.all(flying);
check(flagged, 'the race runs to the flag');
// Everyone on from the results: the lobby again, on another circuit, counting down to the next race.
await a.waitForTimeout(1500);
for (const p of [a, b, c]) await p.evaluate(() => window.game.online.sendRoom('continue', { at: 'final' }));
check(await until(a, () => window.game.menus.screen === 'room' && window.game.online.lobby?.phase === 'lobby', null, 60000), 'the lobby opens again after the match');
const next = await a.evaluate(() => ({ track: window.game.online.lobby.settings.track, timer: window.game.online.lobby.timer, players: window.game.online.lobby.players.map((p) => p.callsign) }));
check(next.track !== track0 && next.timer > 0, `another circuit, and the clock runs for the next race (${track0} -> ${next.track}, ${next.timer} s)`);
check(next.players.includes('Alpha') && next.players.includes('Bravo') && !next.players.includes('Charlie'), `Charlie, never at the controls, is out; the others stay together (${next.players.join(', ')})`);
const out = await until(c, () => window.game.menus.screen === 'dialog' || window.game.menus.screen === 'online', null, 20000);
const told = await c.evaluate(() => document.querySelector('.menu')?.textContent ?? '');
check(out && /away for the whole race/.test(told), 'Charlie is told why, back at the Online screen');
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'no errors or failed checks');
await browser.close();
process.exit(problems.length ? 1 : 0);

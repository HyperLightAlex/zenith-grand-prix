// A squad of three, in three browsers, into a room and a Grand Prix:
//
//   1. Alpha leads; Bravo and Charlie join the squad by its link; Alpha makes
//      a room and both follow, all on the squad's team.
//   2. The late one: Alpha and Bravo are already in a room (a plain one, then
//      the squad's Grand Prix) when Charlie joins the squad. Charlie is taken
//      in after them, onto the squad's team.
//   3. Nobody is left on "Joining…": every room screen has its room.
//   4. Every joiner sees the whole squad; joining a squad while your own squad
//      of one is still being made leaves you in theirs (and nobody behind).
//
// Needs the game served and its server running (npm run build, npm start).
//
//   URL=http://127.0.0.1:8090/ node tools/squad-check.mjs
//   SERVER=http://127.0.0.1:8092 ...   the game server somewhere else (say, behind
//                                      a proxy that adds a real network's delay)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const base = process.env.URL ?? 'http://127.0.0.1:8090/';
const server = process.env.SERVER ? `&server=${encodeURIComponent(process.env.SERVER)}` : '';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push('check failed: ' + what); };

async function player(name, url) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} [error] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${name} [pageerror] ${e.message}`));
  await page.addInitScript((n) => { try { localStorage.setItem('zgp.callsign', n); } catch {} }, name);
  await page.goto(url + server, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined, null, { timeout: 180000 });
  // Software rendering is slow: draw nothing, so the game keeps up.
  await page.evaluate(() => { window.game.renderer.render = () => {}; });
  return page;
}
const until = (p, fn, arg, timeout = 20000) => p.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const seats = (p) => p.evaluate(() => { const v = window.game.online.lobby; return v ? Object.fromEntries(v.players.map((x) => [x.callsign, x.side])) : null; });
const shownJoining = (p) => p.evaluate(() => window.game.menus.screen === 'room' && /Joining/.test(document.querySelector('.menu')?.textContent ?? ''));

async function squadOf(names) {
  const [lead, ...rest] = names;
  const a = await player(lead, base + '?mute=1');
  await a.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openOnline(); });
  await a.waitForFunction(() => window.game.online.squad);
  const code = await a.evaluate(() => window.game.online.squad.roomId);
  const pages = [a];
  for (const n of rest) {
    const p = await player(n, `${base}?mute=1&squad=${code}`);
    pages.push(p);
    await until(a, (k) => window.game.online.squadView?.members.length === k, pages.length);
    // The joiner sees the whole squad too, straight away (its first view used to be lost).
    if (!(await until(p, (k) => window.game.online.squadView?.members.length === k, pages.length, 5000))) problems.push(`${n} joined the squad but does not see it`);
  }
  return { pages, code };
}
const make = (a, gp) => a.evaluate((gp) => (gp ? window.game.createGpRoom('cup') : window.game.createRoom()), gp);
async function leave(pages) {
  for (const p of pages) await p.context().close();
}

// 1. Three follow their leader in.
for (const gp of [false, true]) {
  const label = gp ? 'the Grand Prix' : 'a room';
  const { pages } = await squadOf(['Alpha', 'Bravo', 'Charlie']);
  const [a, b, c] = pages;
  check((await a.evaluate(() => window.game.online.squadView.members.length)) === 3, `${label}: a squad of three`);
  await make(a, gp);
  const all = await Promise.all(pages.map((p) => until(p, () => window.game.menus.screen === 'room' && window.game.online.lobby?.players.length === 3)));
  check(all.every(Boolean), `${label}: all three in, with the room on screen`);
  const s = await seats(c);
  check(s && s.Alpha === 0 && s.Bravo === 0 && s.Charlie === 0, `${label}: all three on the squad's team (${JSON.stringify(s)})`);
  await leave(pages);
}

// 2. The third joins the squad while the other two are already in.
for (const gp of [false, true]) {
  const label = gp ? 'the Grand Prix' : 'a room';
  const { pages, code } = await squadOf(['Alpha', 'Bravo']);
  const [a, b] = pages;
  await make(a, gp);
  check(await until(b, () => window.game.online.lobby?.players.length === 2), `${label}: Alpha and Bravo in`);
  const c = await player('Charlie', `${base}?mute=1&squad=${code}`);
  const inside = await until(c, () => window.game.menus.screen === 'room' && window.game.online.lobby?.players.length === 3, null, 30000);
  const s = await seats(a);
  check(inside, `${label}: Charlie, joining the squad late, is taken in after them`);
  check(s && s.Charlie === 0, `${label}: on the squad's team (${JSON.stringify(s)})`);
  check(!(await shownJoining(c)), `${label}: and not left on "Joining…"`);
  // Out of the room, the leader no longer takes newcomers in. (Charlie
  // leaves the squad to make room: a closed tab's place is kept a minute.)
  await a.evaluate(() => window.game.leaveRoom());
  await until(a, () => !window.game.online.room);
  await c.evaluate(() => window.game.online.leaveSquad());
  await until(a, () => window.game.online.squadView?.members.length === 2);
  const d = await player('Delta', `${base}?mute=1&squad=${code}`);
  await until(a, () => window.game.online.squadView?.members.length === 3);
  await d.waitForTimeout(3000);
  const where = await d.evaluate(() => ({ screen: window.game.menus.screen, room: window.game.online.room?.roomId ?? null }));
  check(where.screen === 'online' && !where.room, `${label}: someone joining once the leader is back at the hub stays at the hub (${JSON.stringify(where)})`);
  await leave([a, b, c, d]);
}

// 3. Opening Online makes a squad of one in the background: joining a friend's
// squad while it is still on its way ends in the friend's squad, with nobody
// left behind in it when you leave.
{
  const { pages, code } = await squadOf(['Alpha']);
  const [a] = pages;
  const d = await player('Delta', base + '?mute=1');
  await d.evaluate((code) => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openOnline(); void g.online.joinSquad(code, { faction: 0, role: 2 }); }, code);
  check(await until(d, (c) => window.game.online.squad?.roomId === c && window.game.online.squadView?.members.length === 2, code), 'joining a squad while your own is still being made: you end up in theirs, and see it');
  await d.waitForTimeout(2000);
  check((await d.evaluate(() => window.game.online.squad?.roomId)) === code, '...and stay there');
  await d.evaluate(() => window.game.leaveSquad());
  check(await until(a, () => window.game.online.squadView?.members.length === 1, null, 5000), 'leaving takes you out of their squad at once');
  await leave([a, d]);
}

await browser.close();
if (problems.length) {
  console.log('\nProblems:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nAll good.');

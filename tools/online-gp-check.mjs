// Two browsers through the squad's Grand Prix online: Alpha makes a squad,
// Charlie joins it, Alpha starts the cup from the online hub and Charlie
// follows; they ready up, race (one-lap races if the server was started with
// TEST_LAPS=1), and go briefing, race, standings, briefing... to the award.
// Needs the game served and its server running.
//
//   URL=http://localhost:8090/ node tools/online-gp-check.mjs [shots dir]
//   ROUNDS=1: stop after the first round's standings (0: once in the room).
//   EVENT='Ascent Cup' (or 'Frontier Cup', 'Grand Tour', 'Zenith Cup short
//   season'): the event Alpha starts, instead of the Horizon Cup.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const base = process.env.URL ?? 'http://localhost:5173/';
const shots = process.argv[2] ?? null;
if (shots) mkdirSync(shots, { recursive: true });
const rounds = Number(process.env.ROUNDS ?? 3);
const eventName = process.env.EVENT ?? 'Horizon Cup';
/** What the room's event should be, for the entry Alpha picks. */
const EXPECT = {
  'Horizon Cup': { kind: 'cup', cup: 'horizon', rounds: 3 },
  'Frontier Cup': { kind: 'cup', cup: 'frontier', rounds: 3 },
  'Ascent Cup': { kind: 'cup', cup: 'ascent', rounds: 3 },
  'Grand Tour': { kind: 'tour', cup: 'tour', rounds: 9 },
  'Zenith Cup short season': { kind: 'season', rounds: 5 },
}[eventName];
if (!EXPECT) throw new Error(`EVENT: one of Horizon Cup, Frontier Cup, Ascent Cup, Grand Tour, Zenith Cup short season (not ${eventName})`);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push('check failed: ' + what); };
async function player(name, url, viewport = { width: 960, height: 540 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(150000);
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} [error] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`${name} [pageerror] ${e.message}`));
  await page.addInitScript((n) => { try { localStorage.setItem('zgp.callsign', n); } catch {} }, name);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined, null, { timeout: 180000 });
  await blind(page);
  return page;
}
// Software rendering is slow: draw only for a screenshot, so the game keeps up.
const blind = (p) => p.evaluate(() => { const r = window.game.renderer; r.__draw ??= r.render; r.render = () => {}; });
const sighted = (p) => p.evaluate(() => { const r = window.game.renderer; if (r.__draw) r.render = r.__draw; });
const shot = async (p, name) => {
  if (!shots) return;
  await sighted(p);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${shots}/${name}.png` });
  await blind(p);
};
const until = (p, fn, arg, timeout = 20000) => p.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
const phase = (p) => p.evaluate(() => window.game.online.lobby?.phase ?? null);
const items = (p) => p.evaluate(() => [...document.querySelectorAll('.menu .item')].map((x) => ({ text: x.textContent, locked: x.classList.contains('locked') })));

const a = await player('Alpha', base + '?mute=1');
await a.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openOnline(); });
await a.waitForFunction(() => window.game.online.squad, null, { timeout: 60000 });
// Alone: the Grand Prix is there, but locked, and says why on highlight.
await until(a, () => window.game.menus.screen === 'online');
let gp = (await items(a)).find((x) => x.text.startsWith('Grand Prix'));
check(!!gp && gp.locked, 'alone, the hub shows the Grand Prix, locked');
await a.evaluate(() => window.game.menus.focus('gp'));
const hint = await a.evaluate(() => { const el = document.querySelector('.menu .item.sel small.hint'); return el && getComputedStyle(el).display !== 'none' ? el.textContent : null; });
check(!!hint && /squad of 2 or 3/.test(hint), `highlighted, it says what it needs (${hint})`);
await shot(a, '1-hub-alone');

const squadCode = await a.evaluate(() => window.game.online.squad.roomId);
const c = await player('Charlie', `${base}?mute=1&squad=${squadCode}`, { width: 640, height: 480 });
check(await until(c, () => window.game.online.squadView?.members.length === 2 && window.game.menus.screen === 'online', null, 60000), 'Charlie joins the squad');
check(await until(a, () => !document.querySelector('.menu .item.locked')?.textContent.startsWith('Grand Prix') && window.game.online.squadView?.members.length === 2), "with two, Alpha's Grand Prix opens");
gp = (await items(c)).find((x) => x.text.startsWith('Grand Prix'));
check(!!gp && gp.locked, "Charlie's is locked: the leader starts it");
await c.evaluate(() => window.game.menus.focus('gp'));
await shot(c, '2-hub-member');
await a.evaluate(() => window.game.menus.focus('gp'));
await a.keyboard.press('Enter');
check(await until(a, () => window.game.menus.screen === 'online-gp'), "Alpha's Grand Prix: the setup");
await shot(a, '3-setup');
await a.locator('.menu .item', { hasText: new RegExp('^' + eventName) }).click();
await a.mouse.move(2, 2);
check(await until(a, () => window.game.menus.screen === 'room' && window.game.online.lobby?.gp, null, 60000), `Alpha is in the ${eventName}`);
check(await until(c, () => window.game.menus.screen === 'room' && window.game.online.lobby?.gp, null, 60000), 'Charlie follows into it');
const view = await a.evaluate(() => window.game.online.lobby);
check(view.gp?.kind === EXPECT.kind && (EXPECT.cup === undefined || view.gp.cup === EXPECT.cup) && view.gp.rounds.length === EXPECT.rounds, `it is the ${eventName} (${view.gp?.kind} ${view.gp?.cup}, ${view.gp?.rounds.length} rounds)`);
check(view.settings.track === view.gp?.rounds[0].circuit, `round 1 is on ${view.gp?.rounds[0].circuit}`);
check(view.players.length === 2 && view.players.every((p) => p.side === 0), 'both on the squad\'s team');
check(view.sides[1].faction === view.gp.rounds[0].you.b && view.sides[0].faction === view.gp.faction, 'the briefing is round 1 against its rival');
// Charlie takes another frame from the briefing (a click on its row), so both can lock in.
const aRole = await a.evaluate(() => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).role; });
await c.locator('.menu .seat.cpu').first().click();
check(await until(c, (r) => { const o = window.game.online; const me = o.lobby.players.find((x) => x.pid === o.pid); return me.role !== r; }, aRole), 'a click on a free frame in the briefing picks it');
await shot(a, '4-briefing');
await shot(c, '4-briefing-4x3');

for (let r = 0; r < rounds; r++) {
  // Ready up (Charlie with a click, Alpha from the keyboard), and race.
  await c.locator('.menu .item', { hasText: /^Ready/ }).click();
  // Alpha from the keyboard: each briefing opens with Ready highlighted.
  // (The mouse out of the way first: the item under it takes the highlight.)
  await a.mouse.move(2, 2);
  check(await until(a, () => /^Ready/.test(document.querySelector('.menu .item.sel')?.textContent ?? '')), `round ${r + 1}: the briefing opens on Ready`);
  await a.keyboard.press('Enter');
  const started = await until(a, () => window.game.state === 'race', null, 30000);
  check(started, `round ${r + 1}: the race starts`);
  if (!started) {
    for (const p of [a, c]) console.log('   ', JSON.stringify(await p.evaluate(() => { const g = window.game; const v = g.online.lobby; return { state: g.state, screen: g.menus.screen, phase: v?.phase, timer: v?.timer, players: v?.players.map((x) => [x.callsign, x.role, x.ready, x.connected]), toast: document.querySelector('.menu .toast')?.textContent }; })));
    await shot(a, 'x-stuck-a');
    await shot(c, 'x-stuck-c');
    break;
  }
  // The race runs out (computer pilots fly both); through the results to the standings.
  const done = await until(a, () => window.game.online.lobby?.phase === 'final', null, 400000);
  check(done, `round ${r + 1}: the match ends`);
  if (r === 0) await shot(a, '5-results');
  for (const p of [a, c]) await p.evaluate(() => window.game.online.sendRoom('continue', { at: 'final' }));
  const standing = await until(a, () => window.game.online.lobby?.phase === 'standings' && window.game.menus.screen === 'room', null, 30000);
  check(standing, `round ${r + 1}: the standings`);
  if (!standing) {
    for (const p of [a, c]) console.log('   ', JSON.stringify(await p.evaluate(() => { const g = window.game; const v = g.online.lobby; return { state: g.state, mode: g.mode, screen: g.menus.screen, stack: g.menus.stack.map((e) => e.id), phase: v?.phase, timer: v?.timer, room: !!g.online.room }; })));
    await shot(a, 'x-standings-a');
    break;
  }
  const results = await until(a, () => window.game.online.lobby.timer > 0, null, 120000);
  check(results, `round ${r + 1}: the other results come in`);
  if (!results) {
    console.log('   ', JSON.stringify(await a.evaluate(() => { const g = window.game; const v = g.online.lobby; return { screen: g.menus.screen, phase: v?.phase, timer: v?.timer, current: v?.gp.current, round: v?.gp.rounds[v.gp.current] }; })));
    break;
  }
  // Each continues with a click (screenshots are slow here: the table's timer
  // may run out first, which moves everyone on anyway).
  if (r === 0) await shot(c, '6-standings-4x3');
  for (const p of [a, c]) {
    if ((await phase(p)) !== 'standings') break;
    await p.locator('.menu .item', { hasText: /^(Continue|Final standings)/ }).click({ timeout: 10000 }).catch(() => {});
    await p.mouse.move(2, 2);
    if (r === 0 && p === a) await shot(a, '6-standings');
  }
  const next = r === EXPECT.rounds - 1 ? 'award' : 'lobby';
  check(await until(a, (n) => window.game.online.lobby?.phase === n, next, 30000), `round ${r + 1}: on to the ${next === 'lobby' ? 'next briefing' : 'award'}`);
  if (next === 'lobby') {
    const v = await a.evaluate(() => window.game.online.lobby);
    check(v.sides[1].faction === v.gp.rounds[v.gp.current].you.b && v.settings.track === v.gp.rounds[v.gp.current].circuit, `round ${r + 2}: its rival and circuit`);
  }
}
if (rounds >= EXPECT.rounds) {
  await shot(a, '7-award');
  await a.locator('.menu .item', { hasText: /^Back to Online/ }).click();
  check(await until(a, () => window.game.menus.screen === 'online' && !window.game.online.room), 'Back to Online leaves the room for the hub');
}
console.log((await phase(c)) ?? 'out');
await browser.close();
if (problems.length) {
  console.log('\nProblems:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nAll good.');

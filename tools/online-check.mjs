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
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 20000 }).then(() => true, () => false);
const a = await player('Alpha', base + '?mute=1');
await a.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openOnline(); });
await a.waitForFunction(() => window.game.online.squad, null, { timeout: 60000 });
check(true, 'Online opens and makes a squad of one');

// A squad: Charlie joins Alpha's and keeps the hangar open while Alpha, the
// leader, changes the faction. Charlie's hangar has to follow.
{
  const squadCode = await a.evaluate(() => window.game.online.squad.roomId);
  const c = await player('Charlie', `${base}?mute=1&squad=${squadCode}`);
  const joined = await c.waitForFunction(() => window.game.online.squadView?.members.length === 2 && window.game.menus.screen === 'online', null, { timeout: 60000 }).then(() => true, () => false);
  check(joined, 'the squad link joins the squad');
  await c.keyboard.press('KeyY');
  await c.waitForFunction(() => window.game.menus.screen === 'hangar', null, { timeout: 20000 });
  const teamText = (p) => p.locator('.menu .item', { hasText: 'Team' }).first().locator('.choice').textContent();
  const cBefore = await teamText(c);
  await a.keyboard.press('KeyY');
  await a.waitForFunction(() => window.game.menus.screen === 'hangar', null, { timeout: 20000 });
  await a.evaluate(() => window.game.menus.focus('team'));
  await a.keyboard.press('ArrowRight');
  await a.waitForFunction(([w]) => {
    const el = [...document.querySelectorAll('.menu .item')].find((x) => x.textContent.startsWith('Team'));
    const t = el?.querySelector('.choice')?.textContent;
    return t && t !== w;
  }, [cBefore], { timeout: 20000 }).catch(() => {});
  const aAfter = await teamText(a);
  const followed = await c.waitForFunction((want) => {
    const el = [...document.querySelectorAll('.menu .item')].find((x) => x.textContent.startsWith('Team'));
    return el?.querySelector('.choice')?.textContent === want && window.game.garageShown?.team === window.game.online.squadView.faction;
  }, aAfter, { timeout: 20000 }).then(() => true, () => false);
  check(aAfter !== cBefore && followed, `a member's open hangar follows the leader's faction (${cBefore} -> ${aAfter})`);
  // A third: three positions, one each, and the buttons that still apply.
  const d = await player('Delta', `${base}?mute=1&squad=${squadCode}`);
  await d.waitForFunction(() => window.game.online.squadView?.members.length === 3, null, { timeout: 60000 }).catch(() => {});
  const roles = await d.evaluate(() => window.game.online.squadView.members.map((x) => x.role));
  check(roles.length === 3 && new Set(roles).size === 3, `three in a squad, each in their own position (${roles.join(', ')})`);
  await a.keyboard.press('Escape');
  await a.waitForFunction(() => window.game.menus.screen === 'online', null, { timeout: 20000 });
  const hub = await a.evaluate(() => [...document.querySelectorAll('.menu .item')].map((x) => x.textContent));
  check(!hub.some((t) => /Invite to squad|Join a squad/.test(t)) && hub.some((t) => /Leave squad/.test(t)), `a full squad: no Invite or Join a squad, Leave squad there (${hub.filter((t) => t.length < 30).join(' / ')})`);
  // Charlie's hangar lists the squad, and the Frame row asks for a squadmate's position.
  const crew = await c.evaluate(() => [...document.querySelectorAll('.menu .crew-row b')].map((x) => x.textContent));
  check(crew.length === 3 && ['Alpha', 'Charlie', 'Delta'].every((n) => crew.includes(n)), `the hangar shows who flies what (${crew.join(', ')})`);
  const cRole = await c.evaluate(() => window.game.loadout.role);
  await c.evaluate(() => window.game.menus.focus('frame'));
  await c.keyboard.press('ArrowRight');
  const target = await c.evaluate((r) => window.game.online.squadView.members.find((x) => x.role === (r + 1) % 3), cRole);
  const asked = target.callsign === 'Alpha' ? a : d;
  check(await until(asked, () => window.game.menus.screen === 'dialog'), `${target.callsign} is asked to swap positions`);
  await asked.keyboard.press('Enter');
  check(await until(c, (r) => window.game.loadout.role === (r + 1) % 3, cRole), 'accepted: Charlie flies their frame, and the hangar shows it');
  const after = await c.evaluate(() => window.game.online.squadView.members.map((x) => x.role));
  check(new Set(after).size === 3, 'still one position each');
  await d.evaluate(() => window.game.leaveSquad());
  await d.context().close();
  await c.evaluate(() => window.game.leaveSquad());
  await a.waitForFunction(() => window.game.online.squadView?.members.length === 1, null, { timeout: 20000 });
  await c.context().close();
}

await a.evaluate(() => window.game.createRoom());
await a.waitForFunction(() => window.game.online.lobby, null, { timeout: 60000 });
const code = await a.evaluate(() => window.game.online.room.roomId);
check(/^[A-Z2-9]{5}$/.test(code), `a room with a code (${code})`);
const b = await player('Bravo', `${base}?mute=1&room=${code}`);
await b.waitForFunction(() => window.game.online.lobby && window.game.menus.screen === 'room', null, { timeout: 60000 });
check(true, 'the invite link goes straight into the room');
const lobby = await a.evaluate(() => window.game.online.lobby);
check(lobby.players.length === 2 && lobby.players[0].side !== lobby.players[1].side, 'two people, one on each team');

// The room screen by hand, with clicks and keys as a player would use it.
const mine = (p) => p.evaluate(() => { const o = window.game.online; const me = o.lobby.players.find((x) => x.pid === o.pid); return { side: me.side, role: me.role, factions: o.lobby.sides.map((s) => s.faction) }; });
const aSide = (await mine(a)).side;
// Bravo clicks a computer pilot's seat on Alpha's team.
await b.locator('.menu .sides .side').nth(aSide).locator('.seat.cpu').first().click();
check(await until(b, (s) => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).side === s; }, aSide), 'a click on an empty seat on the other team moves you there');
// ...then another one on the same team: a different role.
const before = await mine(b);
await b.locator('.menu .sides .side').nth(aSide).locator('.seat.cpu').first().click();
check(await until(b, (r) => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).role !== r; }, before.role), 'a click on an empty seat on your own team changes your role');
await b.screenshot({ path: process.env.SHOT ?? 'online-check-room.png' }).catch(() => {});
const cpuNames = await b.evaluate(() => [...document.querySelectorAll('.menu .seat.cpu .who b')].map((x) => x.textContent));
check(cpuNames.length > 0 && cpuNames.every((n) => n && n !== 'Computer'), `computer seats show the pilot who flies them (${cpuNames.join(', ')})`);
// Factions: pick a team's name. Alpha (host and captain) changes their own team's...
const head = (p, side) => p.locator('.menu .sides .side').nth(side).locator('.side-head');
const f0 = (await mine(a)).factions[aSide];
await head(a, aSide).click();
check(await until(b, ([s, f]) => window.game.online.lobby.sides[s].faction !== f, [aSide, f0]), 'the host changes their team\'s faction from the room, and the teammate sees it');
// ...and the other team's, all computer pilots.
const g0 = (await mine(a)).factions[1 - aSide];
await head(a, 1 - aSide).click();
check(await until(b, ([s, f]) => window.game.online.lobby.sides[s].faction !== f, [1 - aSide, g0]), "the host changes the computer pilots' faction");
// Bravo is neither: both stay.
const fs = (await mine(a)).factions;
await head(b, aSide).click();
await head(b, 1 - aSide).click();
await b.waitForTimeout(1500);
check(JSON.stringify((await mine(a)).factions) === JSON.stringify(fs), "someone who isn't captain or host can't change either");
// Shot calling: Bravo asks three times; Alpha gets one question, answers it once, and no error follows.
const callerNow = () => a.evaluate((s) => window.game.online.lobby.sides[s].caller, aSide);
const bPid = await b.evaluate(() => window.game.online.pid);
const aPid = await a.evaluate(() => window.game.online.pid);
if ((await callerNow()) === bPid) await b.evaluate(() => window.game.online.sendRoom('caller', { action: 'pass' }));
await until(a, ([s, p]) => window.game.online.lobby.sides[s].caller === p, [aSide, aPid]);
const notices = [];
await a.exposeFunction('noteNotice', (t) => notices.push(t)).catch(() => {});
await a.evaluate(() => window.game.online.on('notice', ({ text }) => window.noteNotice(text)));
for (let i = 0; i < 3; i++) await b.evaluate(() => window.game.online.sendRoom('caller', { action: 'ask' }));
await until(a, () => window.game.menus.screen === 'dialog');
await a.waitForTimeout(1500);
const dialogs = await a.evaluate(() => window.game.menus.stack.filter((e) => e.id === 'dialog').length);
await a.keyboard.press('Enter');
check(await until(a, ([s, p]) => window.game.online.lobby.sides[s].caller === p, [aSide, bPid]), 'the shot caller hands it over');
await a.waitForTimeout(1500);
const left = await a.evaluate(() => window.game.menus.stack.filter((e) => e.id === 'dialog').length);
check(dialogs === 1 && left === 0 && notices.length === 0, `three asks make one question, gone once answered (${dialogs} shown, ${left} left, notices: ${notices.join('; ') || 'none'})`);
await b.evaluate(() => window.game.online.sendRoom('caller', { action: 'pass' }));
// Back to the other team with the keyboard: highlight a seat there, Enter.
await b.evaluate((s) => window.game.menus.focus(`seat-${s}-0`), 1 - aSide);
await b.keyboard.press('Enter');
check(await until(b, (s) => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).side === s; }, 1 - aSide), 'Enter on a highlighted seat moves you there');

await a.evaluate(() => window.game.online.sendRoom('settings', { match: 0 }));
await a.waitForTimeout(500);
for (const p of [a, b]) await p.evaluate(() => window.game.online.sendRoom('ready', { ready: true }));
await a.waitForFunction(() => window.game.debugState().state === 'race', null, { timeout: 30000 });
await b.waitForFunction(() => window.game.debugState().state === 'race', null, { timeout: 30000 });
check(true, 'everyone ready: the countdown runs and the race starts for both');
await a.waitForTimeout(8000);
const sa = await state(a);
// On a built game the pause menu has no debug tools (tuning, the look).
if (!/[?&](dev|tune)\b/.test(base)) {
  await a.keyboard.press('Escape');
  await a.waitForFunction(() => window.game.menus.screen === 'pause', null, { timeout: 20000 }).catch(() => {});
  const items = await a.evaluate(() => [...document.querySelectorAll('.menu .item')].map((x) => x.textContent));
  const isDev = await a.evaluate(() => location.port === '5173');
  check(isDev || !items.some((t) => /Tuning|Look:/.test(t)), `no tuning or look in the pause menu (${items.join(' / ')})`);
  await a.keyboard.press('KeyT');
  await a.waitForTimeout(800);
  check(isDev || !(await a.evaluate(() => window.game.panel.open)), 'T does not open the tuning panel');
  await a.keyboard.press('Escape');
}
check(sa.net && sa.net.gaps === 0 && sa.net.confirmed > 100, `the race runs (confirmed tick ${sa.net?.confirmed}, ${sa.net?.ahead} inputs predicted ahead)`);
await a.waitForFunction(() => window.game.debugState().state === 'results', null, { timeout: 400000 });
check(true, 'the results come up at the flag');
await a.waitForFunction(() => window.game.menus.screen === 'room', null, { timeout: 60000 });
check(true, 'after the final results, back in the room');
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'no errors or failed checks');
await browser.close();
process.exit(problems.length ? 1 : 0);

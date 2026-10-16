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
  // A third: the buttons that still apply to a full squad.
  const d = await player('Delta', `${base}?mute=1&squad=${squadCode}`);
  const three = await d.waitForFunction(() => window.game.online.squadView?.members.length === 3, null, { timeout: 60000 }).then(() => true, () => false);
  check(three, 'three in a squad');
  await a.keyboard.press('Escape');
  await a.waitForFunction(() => window.game.menus.screen === 'online', null, { timeout: 20000 });
  const hub = await a.evaluate(() => [...document.querySelectorAll('.menu .item')].map((x) => x.textContent));
  check(!hub.some((t) => /Invite to squad|Join a squad/.test(t)) && hub.some((t) => /Leave squad/.test(t)), `a full squad: no Invite or Join a squad, Leave squad there (${hub.filter((t) => t.length < 30).join(' / ')})`);
  // Everyone's hangar shows their own pick, and picks are free: Charlie takes Delta's frame, no questions asked.
  await d.keyboard.press('KeyY');
  await d.waitForFunction(() => window.game.menus.screen === 'hangar', null, { timeout: 20000 });
  const ownFrame = (p) => p.evaluate(() => window.game.garageShown?.role === window.game.loadout.role && document.querySelector('.menu .hh-name b')?.textContent);
  const cFrame = await until(c, () => window.game.garageShown?.role === window.game.loadout.role);
  const dFrame = await until(d, () => window.game.garageShown?.role === window.game.loadout.role);
  check(cFrame && dFrame, `each hangar shows its own pick (Charlie: ${await ownFrame(c)}, Delta: ${await ownFrame(d)})`);
  const crew = await c.evaluate(() => [...document.querySelectorAll('.menu .crew-row b')].map((x) => x.textContent).join(', '));
  check(['Alpha', 'Charlie', 'Delta'].every((n) => crew.includes(n)), `the hangar shows who picked what (${crew})`);
  // Everyone on a different frame (from the hangar's Frame row): no marks.
  // One press at a time, each waited for: rebuilding the hangar's mech stalls a software-rendered page.
  const setFrame = async (p, want) => {
    await p.evaluate(() => window.game.menus.focus('frame'));
    for (let i = 0; i < 3; i++) {
      const was = await p.evaluate(() => window.game.loadout.role);
      if (was === want) break;
      await p.keyboard.press('ArrowRight');
      await until(p, (r) => window.game.loadout.role !== r && window.game.menus.selectedKey === 'frame', was);
    }
    return (await p.evaluate(() => window.game.loadout.role)) === want;
  };
  const aRoleSq = await a.evaluate(() => window.game.loadout.role);
  await setFrame(c, (aRoleSq + 1) % 3);
  await setFrame(d, (aRoleSq + 2) % 3);
  check(await until(a, () => !document.querySelector('.menu .bay-card em.clash')), 'three frames, no marks');
  // Charlie takes Delta's frame: allowed, shown in the hangar, marked on the squad panel, nobody asked.
  const picked = await setFrame(c, (aRoleSq + 2) % 3);
  check(picked && (await until(c, (r) => window.game.garageShown?.role === r, (aRoleSq + 2) % 3)), "Charlie picks Delta's frame and sees it in the hangar");
  check(await until(a, () => !!document.querySelector('.menu .bay-card em.clash')), 'the squad panel marks the two on one frame');
  await d.waitForTimeout(1000);
  check((await d.evaluate(() => window.game.menus.screen)) === 'hangar', 'and nobody is asked anything');
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
// Bravo clicks a computer pilot's frame on Alpha's team.
await b.locator('.menu .sides .side').nth(aSide).locator('.seat.cpu').first().click();
check(await until(b, (s) => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).side === s; }, aSide), "a click on a frame on the other team moves you there, flying it");
// ...then another one on the same team: a different frame.
const before = await mine(b);
await b.locator('.menu .sides .side').nth(aSide).locator('.seat.cpu').first().click();
check(await until(b, (r) => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).role !== r; }, before.role), 'a click on another frame on your team picks it');
if (process.env.SHOT) await b.screenshot({ path: process.env.SHOT }).catch(() => {});
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
// Lock-in: Alpha readies, locking their frame. Bravo may still pick it (to look),
// but can't ready on it; another frame and Bravo can.
await a.locator('.menu .item', { hasText: /^Ready/ }).click();
check(await until(a, () => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).ready; }), "Ready locks Alpha's frame in");
const aRole = (await a.evaluate(() => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).role; }));
await b.evaluate((r) => window.game.online.sendRoom('pick', { role: r }), aRole);
check(await until(b, (r) => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).role === r; }, aRole), "Bravo can pick Alpha's frame to look at it");
check(await until(b, () => [...document.querySelectorAll('.menu .item.locked')].some((x) => x.textContent.startsWith('Ready'))), "...but Bravo's Ready is locked: Alpha has it");
await b.locator('.menu .item', { hasText: /^Ready/ }).click();
await b.waitForTimeout(1000);
check(!(await b.evaluate(() => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).ready; })), 'and pressing it changes nothing');
await b.locator('.menu .sides .side').nth(aSide).locator('.seat.cpu').first().click();
await b.waitForTimeout(800);
await b.locator('.menu .item', { hasText: /^Ready/ }).click();
check(await until(b, () => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).ready; }), 'another frame, and Bravo locks it in');
// Alpha lets go (Not ready), so the countdown doesn't start yet.
await a.locator('.menu .item', { hasText: /^Not ready/ }).click();
await until(a, () => { const o = window.game.online; return !o.lobby.players.find((x) => x.pid === o.pid).ready; });
// Each hangar shows its own pick.
for (const p of [a, b]) await p.keyboard.press('KeyY');
const hangarsOk = (await until(a, () => window.game.menus.screen === 'hangar' && window.game.garageShown?.role === window.game.online.lobby.players.find((x) => x.pid === window.game.online.pid).role)) && (await until(b, () => window.game.menus.screen === 'hangar' && window.game.garageShown?.role === window.game.online.lobby.players.find((x) => x.pid === window.game.online.pid).role));
check(hangarsOk, 'in the room, each hangar shows its own frame');
check(await b.evaluate(() => [...document.querySelectorAll('.menu .item.locked')].some((x) => x.textContent.startsWith('Frame'))), "a locked-in player's Frame row is locked");
for (const p of [a, b]) await p.keyboard.press('Escape');
await until(a, () => window.game.menus.screen === 'room');
await until(b, () => window.game.menus.screen === 'room');
await b.locator('.menu .item', { hasText: /^Not ready/ }).click();
await until(b, () => { const o = window.game.online; return !o.lobby.players.find((x) => x.pid === o.pid).ready; });
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
await until(b, () => { const o = window.game.online; return !o.lobby.players.find((x) => x.pid === o.pid).ready; });
await b.evaluate((s) => window.game.menus.focus(`seat-${s}-0`), 1 - aSide);
await until(b, (s) => window.game.menus.selectedKey === `seat-${s}-0`, 1 - aSide);
await b.keyboard.press('Enter');
const moved = await until(b, (s) => { const o = window.game.online; return o.lobby.players.find((x) => x.pid === o.pid).side === s; }, 1 - aSide);
check(moved, 'Enter on a highlighted frame moves you there');
if (!moved) console.log('   Bravo:', JSON.stringify(await b.evaluate(() => { const o = window.game.online; return { me: o.lobby.players.find((x) => x.pid === o.pid), screen: window.game.menus.screen, sel: window.game.menus.selectedKey, toast: document.querySelector('.toast')?.textContent }; })));

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

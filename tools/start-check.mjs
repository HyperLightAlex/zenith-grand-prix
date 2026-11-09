// Races started the way a player starts them, through the loading card: from
// the title by keys to Free Play's Paddock (a team race, and a Sprint, whose
// Paddock shows a mech in no faction's colours), then Start. The other tools
// start their races at once (?instant), past the loading, so this is what
// checks it: the card comes up, goes, and the race is under way, with no
// errors on the page. Needs the game served (npm run dev, or npm start).
//
//   node tools/start-check.mjs                      against the dev server (5173)
//   URL=http://localhost:8090/ node tools/start-check.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const base = process.env.URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) problems.push(what);
};

for (const mode of ['teams', 'sprint']) {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // Low resolution (software drawing is slow), and the tutorial already offered.
  await page.addInitScript((mode) => {
    try {
      localStorage.setItem('zgp.video', JSON.stringify({ resolution: 'low' }));
      localStorage.setItem('zgp.tutorial', JSON.stringify({ done: true, offered: true }));
      const free = JSON.parse(localStorage.getItem('zgp.free') ?? 'null') ?? {};
      localStorage.setItem('zgp.free', JSON.stringify({ ...free, mode, track: 'meridian' }));
    } catch {}
  }, mode);
  await page.goto(base + '?mute=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.game?.debugState().state === 'title', null, { timeout: 300000, polling: 500 });
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(500);
  };
  const to = async (item) => {
    await page.evaluate((item) => window.game.menus.focus(item), item);
    await key('Enter');
  };
  const screen = () => page.evaluate(() => window.game.menus.screen);
  await key('Enter');
  await to('free');
  await page.waitForTimeout(1000);
  await to('start');
  await page.waitForFunction(() => window.game.menus.screen === 'paddock', null, { timeout: 60000 }).catch(() => {});
  check((await screen()) === 'paddock', `${mode}: the Paddock from the title, by keys`);
  await page.waitForTimeout(2000);
  await to('go');
  const card = await page.waitForFunction(() => { const c = document.querySelector('.loadcard'); return !!c && !c.hidden; }, null, { timeout: 10000, polling: 100 }).then(() => true, () => false);
  check(card, `${mode}: Start puts the loading card up`);
  const loaded = await page.waitForFunction(() => !window.game.raceLoad && document.querySelector('.loadcard')?.hidden, null, { timeout: 120000, polling: 250 }).then(() => true, () => false);
  check(loaded, `${mode}: the card goes and the race is let go`);
  const runs = loaded && (await page.waitForFunction(() => (window.game.session?.race?.tick ?? 0) > 0, null, { timeout: 600000, polling: 1000 }).then(() => true, () => false));
  check(runs, `${mode}: the race runs (${await page.evaluate(() => `${window.game.session?.track?.def?.id}, ${window.game.session?.race?.sprint ? 'a Sprint' : 'teams'}`)})`);
  check(!errors.length, `${mode}: no errors on the page${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`);
  await page.close();
}
await browser.close();
console.log(problems.length ? `\nFAILED (${problems.length})` : '\nOK: races start from the Paddock, through the loading card.');
process.exit(problems.length ? 1 : 0);

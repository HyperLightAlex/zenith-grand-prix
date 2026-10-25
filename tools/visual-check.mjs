// Pictures of the game at fixed moments, the same on every run, for checking
// that a change which should not alter the picture does not (and, for one
// that should, seeing exactly where it does). Races on every circuit in both
// looks, at a desktop size and a phone's, with the HUD; and the menus.
//
//   node tools/visual-check.mjs <out dir> [case id prefixes...]
//   BASE=http://127.0.0.1:8091/ node tools/visual-check.mjs before   (a build of main: tools/capture/build-ref.sh main)
//   node tools/visual-check.mjs after
//   python3 tools/capture/diff.py before after report
//
// Determinism: requestAnimationFrame is stubbed and the game is stepped
// frame by frame at 60 a second, the page's clock and timers with it;
// Math.random is reseeded before each race and each menu; CSS animations are
// held at their start; the painted art and the titan's model are waited for
// before the first frame is drawn. Two runs of
// the same build should give identical pictures (diff.py reports 0).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const [out = 'visual-out', ...only] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://127.0.0.1:8090/';
mkdirSync(out, { recursive: true });

const CIRCUITS = ['meridian', 'canyon', 'helios', 'crucible', 'frostline', 'titan', 'abyss', 'monsoon', 'zenith'];
// Teams and rivals cycled so every faction's mechs are drawn somewhere.
const PAIRS = [[0, 1], [2, 3], [4, 0], [1, 2], [3, 4], [0, 2], [1, 3], [2, 4], [3, 0]];
const SIZES = {
  desk: { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
// A case: a race moment (circuit, seconds into the race to look at) or a menu.
const CASES = [
  ...CIRCUITS.map((t, i) => ({ id: `race-anime-desk-${t}`, size: 'desk', look: 'anime', track: t, pair: PAIRS[i], at: [14, 52] })),
  ...['meridian', 'titan', 'monsoon'].map((t) => ({ id: `race-plain-desk-${t}`, size: 'desk', look: 'plain', track: t, pair: PAIRS[CIRCUITS.indexOf(t)], at: [30] })),
  ...['helios', 'abyss', 'zenith'].map((t) => ({ id: `race-anime-phone-${t}`, size: 'phone', look: 'anime', track: t, pair: PAIRS[CIRCUITS.indexOf(t)], at: [30] })),
  ...['anime', 'plain'].flatMap((look) => ['desk', 'phone'].map((size) => ({ id: `menus-${look}-${size}`, size, look, menus: ['title', 'modes', 'hangar', 'gp'] }))),
].filter((c) => !only.length || only.some((o) => c.id.startsWith(o)));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const groups = new Map();
for (const c of CASES) {
  const k = `${c.size}/${c.look}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
const errors = [];
let shots = 0;
for (const [key, cases] of groups) {
  const [size, look] = key.split('/');
  const ctx = await browser.newContext(SIZES[size]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${key}: ${e.message}`));
  // Requests in flight, to wait for the painted art.
  let inflight = 0;
  page.on('request', () => inflight++);
  page.on('requestfinished', () => inflight--);
  page.on('requestfailed', () => inflight--);
  const settle = async () => {
    for (let quiet = 0, n = 0; quiet < 6 && n < 600; n++) {
      await page.waitForTimeout(250);
      quiet = inflight <= 0 ? quiet + 1 : 0;
    }
  };
  // The page's clock (Date, performance.now, timers) is Playwright's: it runs
  // on its own while the game boots, and is held and stepped with the frames
  // for each picture, so the HUD's timed messages come at the same moments.
  // (Installed before the stub below, so the stub's requestAnimationFrame wins:
  // the game draws only when stepped.)
  await page.clock.install({ time: 1_700_000_000_000 });
  let held = 1_800_000_000_000;
  const hold = async () => { held += 3_600_000; await page.clock.pauseAt(held); };
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    let s = 1;
    Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
    window.__seed = (n) => { s = n >>> 0; };
  });
  await page.goto(`${BASE}?mute=1&demo=1&seed=7${look === 'plain' ? '&look=plain' : '&look=anime'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game && !document.getElementById('boot'), null, { timeout: 600000, polling: 250 });
  await settle();
  // (Each frame finished before the next, so the software GPU never falls far behind.)
  const step = async (n) => {
    for (let i = 0; i < n; i++) {
      await page.clock.runFor(16);
      await page.evaluate(() => { const g = window.game; g.frame(g.last + 1000 / 60); g.renderer.renderer.getContext().finish(); });
    }
  };
  const shoot = async (name) => {
    await page.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 0; } });
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
    shots++;
  };
  for (const c of cases) {
    if (c.menus) {
      for (const screen of c.menus) {
        await hold();
        await page.evaluate((screen) => {
          window.__seed(11);
          const g = window.game;
          if (screen === 'title') g.menus.reset('title');
          else if (screen === 'modes') g.menus.reset('modes', undefined, ['title']);
          else if (screen === 'hangar') { g.menus.reset('modes', undefined, ['title']); g.openFreePlay(); }
          else if (screen === 'gp') g.menus.reset('gp', undefined, ['title', 'modes']);
        }, screen);
        await settle();
        await step(10);
        await shoot(`${c.id}-${screen}`);
      }
      continue;
    }
    const [team, rival] = c.pair;
    await hold();
    await page.evaluate(([track, team, rival]) => {
      window.__seed(1234);
      const g = window.game;
      g.menus.reset('modes', undefined, ['title']);
      g.loadout.team = team; g.loadout.role = 0; g.free.rival = rival; g.free.track = track; g.free.mode = 'teams';
      g.startFree();
    }, [c.track, team, rival]);
    // (Polled from here: the page's own timers are held.)
    if (c.track === 'titan') for (let n = 0; n < 2400 && !(await page.evaluate(() => !!window.game.renderer.scene.getObjectByName('titan'))); n++) await page.waitForTimeout(250);
    await settle();
    let t = 0;
    for (const at of c.at) {
      // Most of the way there without drawing, then the last third of a second drawn, so trails and the camera are as in play.
      await page.evaluate((dt) => window.game.session.fastForward(dt), Math.max(0, at - 1 / 3 - t));
      await step(20);
      t = at;
      await shoot(`${c.id}-${String(at).padStart(3, '0')}s`);
    }
  }
  await ctx.close();
  console.log(`${key}: done`);
}
await browser.close();
console.log(`${shots} pictures in ${out}`);
if (errors.length) {
  console.log('page errors:\n ' + errors.slice(0, 20).join('\n '));
  process.exitCode = 1;
}

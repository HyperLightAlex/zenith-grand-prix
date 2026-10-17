// What the capture tools share: Playwright (the project's, or a global one),
// a software-rendered Chromium, and the game opened on a seeded race with
// the computer flying every mech. Not a tool itself.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

/** The game's address: BASE (default the local server on 8090). */
export const BASE = process.env.BASE ?? 'http://127.0.0.1:8090/';

export function launch() {
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--in-process-gpu'] });
}

/**
 * A page on a seeded race, waiting for the game, its own clock stopped (the
 * tools step it). `auto`: whose mech the game camera follows (FW, MF, DF).
 */
export async function openRace(browser, { seed, track = 'canyon', team = 0, rival = 1, auto = process.env.AUTO ?? 'FW', w = 480, h = 270, query = process.env.QUERY ?? '' }) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(`${BASE}?mute=1&auto=${auto}&demo=1&seed=${seed}&track=${track}&team=${team}&rival=${rival}&rivals=2&match=0${query}`);
  await page.waitForFunction(() => window.game && !document.getElementById('boot'), null, { timeout: 300000, polling: 200 });
  return page;
}

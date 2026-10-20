// Races to their results with ?music=suno, in headless Chromium: the win
// theme if the player's team won the round, the loss theme if it lost (the
// menu music while there is none); the other outcome, by turning the round
// round; and off the results, the menu music again.
//
//   URL=http://127.0.0.1:8090/ node tools/results-check.mjs
//
// Needs the game served (npm run build, then npm start).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const base = process.env.URL ?? 'http://127.0.0.1:8090/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const problems = [];
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push(what); };
for (const seed of [7, 11]) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', (m) => { if (m.type() === 'error' || /\[audio\]/.test(m.text())) problems.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}?auto=FW&demo=1&seed=${seed}&track=meridian&music=suno&skip=205`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.game !== undefined, null, { timeout: 180000 });
  await page.evaluate(() => { window.game.renderer.render = () => {}; window.game.audio.unlock(); });
  await page.waitForFunction(() => window.game.state === 'results', null, { timeout: 240000, polling: 200 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const g = window.game;
    const race = g.resultsRace;
    const me = race.mechs[g.resultsLocal];
    const round = g.match.rounds[g.match.rounds.length - 1];
    const m = g.audio.debugInfo().music;
    return { won: round.winner === me.team, music: m?.name, style: m?.style, song: m?.song?.state };
  });
  console.log(`seed ${seed}: ${r.won ? 'won' : 'lost'} the round; music ${r.music} (${r.style}${r.song ? ', ' + r.song : ''})`);
  const hasLoss = await page.evaluate(() => window.game.audio.debugScreenSongs().has('results-loss'));
  const lossOk = (m) => (hasLoss ? m.music === 'results' && m.style === 'loss' : m.music === 'menu');
  check(r.won ? r.music === 'results' && r.style === 'win' && r.song === 'playing' : lossOk(r), `seed ${seed}: the results play ${r.won ? 'the win theme' : hasLoss ? 'the loss theme' : 'the menu music (no loss theme yet)'}`);
  // The other outcome, by turning the round round: the music follows.
  const flip = await page.evaluate(async () => {
    const g = window.game;
    const round = g.match.rounds[g.match.rounds.length - 1];
    round.winner = 1 - round.winner;
    g.resultsMusic();
    await new Promise((res) => setTimeout(res, 1500));
    const m = g.audio.debugInfo().music;
    const me = g.resultsRace.mechs[g.resultsLocal];
    return { won: round.winner === me.team, music: m?.name, style: m?.style };
  });
  check(flip.won ? flip.music === 'results' && flip.style === 'win' : lossOk(flip), `seed ${seed}, the other way (${flip.won ? 'won' : 'lost'}): ${flip.music}`);
  // Off the results: the menu music.
  await page.evaluate(() => window.game.toSetup());
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({ screen: window.game.menus.screen, music: window.game.audio.debugInfo().music?.name }));
  check(after.music === 'menu', `seed ${seed}: off the results (to ${after.screen}), the menu music (${after.music})`);
  await page.close();
}
await browser.close();
console.log(problems.length ? 'Problems:\n' + problems.join('\n') : 'All good.');
process.exit(problems.length ? 1 : 0);

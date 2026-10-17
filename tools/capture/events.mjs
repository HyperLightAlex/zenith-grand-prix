// Lists the sim events of some types between two ticks of a seeded race (no
// drawing), one a line: tick, type, mech (or attacker), attack (or ability).
// Quick for finding a moment to shoot: a boost, a shot, a Ram.
//   node tools/capture/events.mjs <seed> <track> <from tick> <to tick> <types,comma>
//   node tools/capture/events.mjs 3 canyon 1200 4800 boost,shot
import { launch, openRace } from './browser.mjs';

const [seed, track, from, to, types] = process.argv.slice(2);
const browser = await launch();
const page = await openRace(browser, { seed, track });
const rows = await page.evaluate(([from, to, types]) => {
  const g = window.game, ses = g.session, r = g.renderer;
  r.render = () => {};
  g.last = 0;
  if (from - ses.race.tick > 0) ses.fastForward((from - ses.race.tick) / 60);
  const want = new Set(types.split(','));
  const out = [];
  while (ses.race.tick < to) {
    g.frame(g.last + 1000 / 60);
    for (const e of ses.race.events) if (want.has(e.type)) out.push([ses.race.tick, e.type, e.mech ?? e.attacker ?? '', e.attack ?? e.ability ?? ''].join(' '));
  }
  return out;
}, [+from, +to, types]);
console.log(rows.join('\n'));
await browser.close();

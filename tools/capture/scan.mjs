// Runs a whole seeded race with no drawing and logs what happens: every sim
// event, and every mech's state six times a second, so shots can be cut
// from known moments (fights.py reads these).
//   node tools/capture/scan.mjs <seed> <out.json> [team] [rival] [track]
// Name the file <anything>-<team>v<rival>... for fights.py, e.g.
// scans/s5-0v1-canyon.json.
import { writeFileSync } from 'node:fs';
import { launch, openRace } from './browser.mjs';

const [seed, out, team = '0', rival = '1', track = 'canyon'] = process.argv.slice(2);
const browser = await launch();
const page = await openRace(browser, { seed, track, team, rival, w: 640, h: 360 });
const log = await page.evaluate(() => {
  const g = window.game, ses = g.session, race = ses.race;
  const keys = ['s', 'd', 'speed', 'h', 'air', 'mode', 'target', 'hp', 'overdriveT', 'carving', 'carveTier', 'boosting', 'drafting', 'lap', 'place', 'finished', 'retired', 'cells', 'tow'];
  const mechs = race.mechs.map((m) => ({ id: m.id, team: m.team, role: m.role, name: m.name }));
  const events = [], states = [];
  for (let t = 0; t < 60 * 60 * 6; t++) {
    ses.fastForward(1 / 60);
    for (const e of race.events) events.push({ tick: race.tick, ...e });
    if (race.tick % 10 === 0) states.push({ tick: race.tick, phase: race.phase, m: race.mechs.map((m) => keys.map((k) => (typeof m[k] === 'number' ? +m[k].toFixed(2) : m[k]))) });
    if (race.phase === 2 && race.mechs.every((m) => m.finished || m.retired)) break;
  }
  return { mechs, keys, events, states, length: ses.track.length, pieces: ses.track.def.pieces?.length ?? 0, tick: race.tick };
});
writeFileSync(out, JSON.stringify(log));
console.log('ticks', log.tick, 'events', log.events.length, 'states', log.states.length, 'track length', log.length.toFixed(0));
await browser.close();

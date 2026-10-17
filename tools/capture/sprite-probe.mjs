// Steps a seeded race 60 times a second (no drawing: the effects and the
// camera are still worked out) and, for every drawn effect of one kind on
// screen, prints how it is turned: the turn it is drawn at next to the turn
// its direction projects to, and how far that direction points into the
// view. A pointing effect that flips shows as a big jump from one frame to
// the next. (Made for the Ram's prow.)
//   node tools/capture/sprite-probe.mjs <seed> <track> <from tick> <to tick> [kind=ram]
import { launch, openRace } from './browser.mjs';

const [seed, track, from, to, kind = 'ram'] = process.argv.slice(2);
const browser = await launch();
const page = await openRace(browser, { seed, track });
const rows = await page.evaluate(([from, to, kind]) => {
  const g = window.game, ses = g.session, r = g.renderer;
  r.setResolution(1); r.resize(); g.last = 0;
  r.render = () => {};
  if (from - ses.race.tick > 0) ses.fastForward((from - ses.race.tick) / 60);
  const out = [];
  const pool = g.view.fx.sprites.pool;
  const V = r.camera.position.constructor;
  const a = new V(), b = new V(), fwd = new V(), ax = new V();
  while (ses.race.tick < to) {
    g.frame(g.last + 1000 / 60);
    const cam = r.camera; cam.getWorldDirection(fwd);
    for (const s of pool) {
      if (s.frame < 0 || s.kind !== kind || !s.dir || !s.shown) continue;
      a.copy(s.mesh.position).project(cam);
      if (a.z > 1 || Math.abs(a.x) > 1.1 || Math.abs(a.y) > 1.1) continue; // off screen
      const asp = cam.aspect;
      b.copy(s.mesh.position).add(s.dir).project(cam);
      const raw = Math.atan2(b.y - a.y, (b.x - a.x) * asp);
      ax.set(1, 0, 0).applyQuaternion(s.mesh.quaternion).add(s.mesh.position).project(cam);
      const drawn = Math.atan2(ax.y - a.y, (ax.x - a.x) * asp);
      out.push([ses.race.tick, s.key ?? 'start', +(s.dir.dot(fwd) / s.dir.length()).toFixed(2), Math.round(raw * 57.3), Math.round(drawn * 57.3), +s.mesh.scale.x.toFixed(1)]);
    }
  }
  return out;
}, [+from, +to, kind]);
console.log('tick key dirDotFwd projected drawn size');
for (const r of rows) console.log(r.join(' '));
await browser.close();

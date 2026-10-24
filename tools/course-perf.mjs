// How much a circuit asks of the renderer: draw calls and triangles per frame
// (the last pass, as three counts them), at points along its first lap, in a
// free race seeded the same way each time. For comparing two builds (one
// served on another port: tools/capture/build-ref.sh) on the same race:
//
//   node tools/course-perf.mjs <url> [track=titan] [seconds into the race, comma-separated]
//
// Software-rendered here, so the frame times printed say little about a real
// GPU; the counts are what to compare. Waits for the titan's model on
// Titan's Rest.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const [base = 'http://127.0.0.1:8090/', track = 'titan', at = '12,25,48,58,66'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.addInitScript(() => {
  window.requestAnimationFrame = () => 0;
  let s = 9;
  Math.random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
});
const url = new URL(base);
// The computer flies the player's mech round, so the camera goes round the lap.
for (const [k, v] of Object.entries({ mute: '1', perf: '1', seed: '9', demo: '1' })) url.searchParams.set(k, v);
await page.goto(url.href);
await page.waitForFunction(() => window.game, null, { polling: 100, timeout: 120000 });
const out = [];
let prev = 0;
for (const t of at.split(',').map(Number)) {
  await page.evaluate(
    ([dt, first, track]) => {
      const g = window.game, r = g.renderer;
      if (first) {
        g.menus.reset('modes', undefined, ['title']);
        g.loadout.team = 4;
        g.loadout.role = 0;
        g.free.rival = 3;
        g.free.track = track;
        g.startFree();
      }
      g.session.fastForward(dt);
      r.setQuality('high');
      r.scale = 0.5;
      r.resize();
      r.adapt = () => {};
    },
    [t - prev, prev === 0, track],
  );
  prev = t;
  if (track === 'titan') await page.waitForFunction(() => !!window.game.renderer.scene.getObjectByName('titan'), null, { polling: 200, timeout: 120000 });
  const res = await page.evaluate(() => {
    const g = window.game, r = g.renderer, o = [];
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      g.frame(g.last + 1000 / 60);
      o.push({ ms: performance.now() - t0, calls: r.renderer.info.render.calls, tris: r.renderer.info.render.triangles });
    }
    const m = g.session.race.mechs.find((x) => x.id === g.session.localId) ?? g.session.race.mechs[0];
    return { s: m.s, samples: o.slice(2) };
  });
  const avg = (k) => res.samples.reduce((a, v) => a + v[k], 0) / res.samples.length;
  out.push({ t, s: Math.round(res.s), calls: Math.round(avg('calls')), triangles: Math.round(avg('tris')), ms: +avg('ms').toFixed(1) });
}
console.log(JSON.stringify(out));
await browser.close();

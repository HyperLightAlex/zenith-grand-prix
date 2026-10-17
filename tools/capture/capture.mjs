// Renders the game, frame by frame, through scripted cameras: footage for
// a trailer, or the same moment before and after a change to compare.
// Each shot is a moment of a seeded race with its own camera, stepped on a
// virtual clock, so the frames are smooth however slowly this machine draws
// (software rendering is fine). See tools/capture/README.md.
//
//   node tools/capture/capture.mjs <shots.json> <frames dir> [ids...]
//
// Needs the built game served (npm run build && npm start). BASE=<url> to use
// another server (default http://127.0.0.1:8090/), AUTO=MF (or DF) to follow
// that role's mech with the 'game' camera (default FW), QUERY=&look=plain
// to add to the page's address, PREVIEW=n for n small frames a shot.
//
// A shots file: { seed, race?: { seed, track, team, rival }, shots: [...] }.
// A shot: { id, tick (race tick to start at), frames, step (race seconds per
// frame), w, h, cam: {...}, race?: {...}, warm?, impact: [frame...],
// still: [[frame, seconds]...] }. Cameras: 'game' (the game's own), 'mech'
// (offsets in the track's frame at a mech), 'orbit' (round a mech, or
// between two with `with`), 'fixed' (beside the track). Any number can be a
// move: [from, to], eased over the shot, or [a, b, c...] through points.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const BASE = process.env.BASE ?? 'http://127.0.0.1:8090/';
const AUTO = process.env.AUTO ?? 'FW';
const [shotsFile, outDir, ...only] = process.argv.slice(2);
const all = JSON.parse(readFileSync(shotsFile, 'utf8'));
// Which race a shot comes from: its own seed, factions and circuit, or the file's.
const raceOf = (shot) => ({ seed: all.seed, team: 0, rival: 1, track: 'canyon', ...(all.race ?? {}), ...(shot.race ?? {}) });
const raceKey = (r) => `seed=${r.seed}&track=${r.track}&team=${r.team}&rival=${r.rival}`;
// PREVIEW=n: each shot as n small frames spread over the same stretch of race and camera move.
const preview = +(process.env.PREVIEW ?? 0);
// The longest step the game takes between drawn frames (SUBSTEP=0.0167: as it runs, at 60 a second).
const SUB = +(process.env.SUBSTEP ?? 0.09);
const shots = all.shots
  .filter((s) => !s.skip && (only.length ? only.some((o) => s.id === o || s.id.startsWith(o + '-')) : true))
  .map((s) => {
    if (!preview) return s;
    const n = Math.min(preview, s.frames), k = s.frames / n, map = (f) => Math.min(n - 1, Math.round(f / k));
    return { ...s, frames: n, step: (s.step ?? 1 / 12) * k, w: 640, h: 360, impact: (s.impact ?? []).map(map), still: (s.still ?? []).map(([f, x]) => [map(f), x]) };
  })
  .sort((a, b) => (raceKey(raceOf(a)) < raceKey(raceOf(b)) ? -1 : raceKey(raceOf(a)) > raceKey(raceOf(b)) ? 1 : a.tick - b.tick));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--in-process-gpu'] });

let page = null, size = '';
async function open(w, h, race) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(`${BASE}?mute=1&auto=${AUTO}&demo=1&${raceKey(race)}&rivals=2&match=0${process.env.QUERY ?? ''}`);
  await page.waitForFunction(() => window.game && !document.getElementById('boot'), null, { timeout: 300000, polling: 200 });
  await page.evaluate(() => {
    const g = window.game, r = g.renderer;
    r.setResolution(1); r.resize();
    g.last = 0;
    document.querySelector('.hud').style.visibility = 'hidden';
    document.querySelector('.menu') && (document.querySelector('.menu').style.visibility = 'hidden');
    const draw = r.render.bind(r);
    window.__draw = draw;
    // After the shot's camera: the sky (a small sphere kept on the camera),
    // the clouds facing it, every mech shown at full detail (the game hides
    // a mech the camera is close to, and picks detail from its own camera).
    window.__fixScene = () => {
      const c = r.camera;
      g.world.update(g.worldTime, c);
      for (const v of g.view.mechs) {
        if (!v) continue;
        v.rig.root.visible = v.pos.distanceTo(c.position) > 2.2;
        v.rig.detailLevels.forEach((gs, i) => gs.forEach((x) => (x.visible = i === 0)));
        v.rig.detailLevel = 0;
      }
    };
    // The shot's camera goes on just before drawing, after the game has placed
    // its effects for its own camera: they are placed again for the shot's
    // (camera-facing sprites, what they point along, how near they are drawn).
    r.render = (dt, now) => { if (window.__cam) { window.__cam(); window.__fixScene(); g.view.fx.update(0, r.camera); } if (!window.__skipDraw) draw(dt, now); };
    const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
    const T = g.session.track;
    // The track's frame at s, between samples.
    window.__frame = (s) => {
      const n = T.n, x = (((s % T.length) + T.length) % T.length) / T.ds, i = Math.floor(x) % n, f = x - Math.floor(x), j = (i + 1) % n;
      const L = (a) => a[i] + (a[j] - a[i]) * f;
      return { p: V(L(T.px), L(T.py), L(T.pz)), t: V(L(T.tx), L(T.ty), L(T.tz)), r: V(L(T.rx), L(T.ry), L(T.rz)), u: V(L(T.ux), L(T.uy), L(T.uz)) };
    };
  });
  size = `${w}x${h} ${raceKey(race)}`;
}

for (const shot of shots) {
  const w = shot.w ?? 1280, h = shot.h ?? 720;
  const dir = `${outDir}/${shot.id}`;
  if (existsSync(`${dir}/done.json`)) { console.log('skip', shot.id); continue; }
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  // A fresh page when the shot starts before where the race already is, or at another size.
  const now = page ? await page.evaluate(() => window.game.session.race.tick) : Infinity;
  const warm = shot.warm ?? 30; // ticks of play (not drawn) before the first frame, for the poses and effects to settle
  const race = raceOf(shot);
  if (!page || size !== `${w}x${h} ${raceKey(race)}` || now > shot.tick - warm) await open(w, h, race);
  await page.evaluate(([tick, warm]) => {
    const g = window.game, ses = g.session;
    const ahead = tick - warm - ses.race.tick;
    if (ahead > 0) ses.fastForward(ahead / 60);
    window.__cam = null;
    window.__skipDraw = true;
    while (ses.race.tick < tick) g.frame(g.last + 1000 / 60);
    window.__skipDraw = false;
  }, [shot.tick, warm]);
  // The camera for this shot (see cams below), then the frames.
  await page.evaluate((cam) => {
    const g = window.game, r = g.renderer, c = r.camera;
    const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
    const lerp = (a, b, k) => a + (b - a) * k;
    const ease = (k) => k * k * (3 - 2 * k);
    // Where a mech is: its root (at the skates), or one of its joints (cam.at: 'head', 'chest'...).
    const mechPos = (id, at) => { const rig = g.view.mechs[id].rig; const p = (at ? rig.joints[at] : rig.root).getWorldPosition(new c.position.constructor()); return { x: p.x, y: p.y, z: p.z }; };
    const mechS = (id) => { const ses = g.session; return ses.prevS[id] + (ses.race.mechs[id].s - ses.prevS[id]) * ses.alpha; };
    // A number, or a move: [from, to] eased over the shot, or [a, b, c...] through evenly spaced points.
    const val = (v, k) => {
      if (!Array.isArray(v)) return v;
      const e = cam.ease === false ? k : ease(k);
      const x = Math.min(v.length - 1.0001, e * (v.length - 1)), i = Math.floor(x);
      return lerp(v[i], v[i + 1], x - i);
    };
    window.__camK = 0;
    if (cam.type === 'game') { window.__cam = null; return; }
    window.__cam = () => {
      const k = window.__camK;
      const id = cam.mech ?? 0;
      let target = mechPos(id, cam.at), apart = 0;
      // Two mechs (a fight): aim between them, and stand back far enough for both.
      if (cam.with !== undefined) {
        const o = mechPos(cam.with, cam.at), b = val(cam.bias ?? 0.5, k);
        apart = Math.hypot(o.x - target.x, o.y - target.y, o.z - target.z);
        target = { x: lerp(target.x, o.x, b), y: lerp(target.y, o.y, b), z: lerp(target.z, o.z, b) };
      }
      const s = mechS(id);
      let F = window.__frame(s);
      let pos, look;
      if (cam.type === 'mech') {
        // Offsets in the track's frame at the mech: x right, y up, z ahead.
        pos = add(add(add(target, F.r, val(cam.x ?? 0, k)), F.u, val(cam.y ?? 3, k)), F.t, val(cam.z ?? -10, k));
        look = add(add(add(target, F.r, val(cam.lx ?? 0, k)), F.u, val(cam.ly ?? 3, k)), F.t, val(cam.lz ?? 0, k));
      } else if (cam.type === 'orbit') {
        const a = (val(cam.a, k) * Math.PI) / 180, R = Math.max(val(cam.R ?? 10, k), (cam.fit ?? 0) * apart);
        pos = add(add(add(target, F.r, Math.sin(a) * R), F.t, Math.cos(a) * R), F.u, val(cam.y ?? 3, k));
        look = add(add(target, F.u, val(cam.ly ?? 3, k)), F.t, val(cam.lz ?? 0, k));
      } else {
        // Fixed beside the track at s0 (+ along the shot), looking at the mech.
        const F0 = window.__frame(val(cam.s, k));
        pos = add(add(F0.p, F0.r, val(cam.d ?? 30, k)), F0.u, val(cam.h ?? 4, k));
        look = add(add(add(target, F.u, val(cam.ly ?? 3, k)), F.t, val(cam.lz ?? 0, k)), F.r, val(cam.lx ?? 0, k));
        // Or at a point of the track (cam.look: { s, d, h }) rather than a mech.
        if (cam.look) {
          const FL = window.__frame(val(cam.look.s, k));
          look = add(add(FL.p, FL.r, val(cam.look.d ?? 0, k)), FL.u, val(cam.look.h ?? 0, k));
        }
        F = F0;
      }
      c.position.set(pos.x, pos.y, pos.z);
      c.up.set(F.u.x, F.u.y, F.u.z);
      c.lookAt(look.x, look.y, look.z);
      const roll = val(cam.roll ?? 0, k);
      if (roll) c.rotateZ((roll * Math.PI) / 180);
      c.fov = val(cam.fov ?? 45, k);
      c.updateProjectionMatrix();
      c.updateMatrixWorld();
      // The speed effects follow the game's own camera; a shot can set its own.
      const u = r.speedPass.uniforms;
      if (cam.speed !== undefined) u.uSpeed.value = val(cam.speed, k);
      if (cam.boost !== undefined) u.uBoost.value = val(cam.boost, k);
      if (cam.travel !== undefined) u.uTravel.value = val(cam.travel, k);
    };
  }, shot.cam);
  for (let f = 0; f < shot.frames; f++) {
    const url = await page.evaluate(([f, shot, sub]) => {
      const g = window.game, r = g.renderer;
      window.__camK = shot.frames > 1 ? f / (shot.frames - 1) : 0;
      if ((shot.impact ?? []).includes(f)) r.impactFrame(0.12, true);
      for (const [sf, secs] of shot.still ?? []) if (sf === f) r.paintedStill(secs);
      // The game takes at most a tenth of a second a frame: longer steps (previews) go in parts.
      const step = shot.step ?? 1 / 12, parts = Math.ceil(step / sub - 1e-9);
      window.__skipDraw = true;
      for (let i = 1; i < parts; i++) g.frame(g.last + (step / parts) * 1000);
      window.__skipDraw = false;
      g.frame(g.last + (step / parts) * 1000);
      return r.renderer.domElement.toDataURL('image/jpeg', 0.95);
    }, [f, shot, SUB]);
    writeFileSync(`${dir}/${String(f).padStart(4, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  const info = await page.evaluate(() => ({ tick: window.game.session.race.tick }));
  writeFileSync(`${dir}/done.json`, JSON.stringify({ ...shot, endTick: info.tick, seconds: (Date.now() - t0) / 1000 }));
  console.log(shot.id, shot.frames, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's, ended at tick', info.tick);
}
await browser.close();

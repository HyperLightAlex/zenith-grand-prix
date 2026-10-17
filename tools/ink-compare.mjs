// Before and after for the look's line work: the same frozen frames from two
// builds, side by side. Each scene is played until it settles, then the game
// loop is stopped and the last frame drawn again with nothing moving, so two
// builds can be compared pixel for pixel (the race and the hangar's orbit
// are seeded and their animation/effect phases are aligned).
//
//   URL_A=http://localhost:8091/ URL_B=http://localhost:8090/ node tools/ink-compare.mjs out
//   SIZES=desk,nova  SCENES=hangar,race  LOOK=plain  ...
//
// Writes out/<a|b>-<size>-<scene>.png and out/compare-<size>-<scene>.png
// (A over B, plus a 2x crop of the player's mech side by side). Needs two
// servers (npm start on two ports, one per build) and Playwright.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const out = process.argv[2] ?? 'ink-compare-out';
mkdirSync(out, { recursive: true });
const builds = { a: process.env.URL_A ?? 'http://localhost:8091/', b: process.env.URL_B ?? 'http://localhost:8090/' };
const sizes = (process.env.SIZES ?? 'desk').split(',');
const scenes = (process.env.SCENES ?? 'hangar,race').split(',');
const SZ = { desk: { width: 1280, height: 720, scale: 1 }, nova: { width: 640, height: 480, scale: 2 }, phone: { width: 844, height: 390, scale: 3 } };

const browser = await chromium.launch({ ...(process.env.PW_CHANNEL ? {channel:process.env.PW_CHANNEL} : {}), args: process.env.PW_SOFTWARE==='0' ? ['--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--in-process-gpu'] });
const crops = {};
for (const [tag, base] of Object.entries(builds)) {
  for (const sz of sizes) {
    for (const scene of scenes) {
      const s = SZ[sz];
      const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale });
      page.on('pageerror', (e) => console.log(`${tag} ${sz} ${scene} pageerror: ${e.message}`));
      // Fixed simulation/drawing clocks and seeded film weave make background
      // equality measurable. No real-time callbacks run between captures.
      await page.addInitScript(() => {
        let seed=12345;
        window.__resetInkSeed=(value)=>{seed=value;};
        Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
        window.requestAnimationFrame=()=>0;
      });
      const url=new URL(base);url.searchParams.set('mute','1');url.searchParams.set('seed','5');
      if(process.env.LOOK)url.searchParams.set('look',process.env.LOOK);
      await page.goto(url.href);
      await page.waitForFunction(() => window.game !== undefined, null, { timeout: 180000, polling:100 });
      await page.waitForTimeout(600);
      const run=async(t)=>page.evaluate(t=>{
        const g=window.game,r=g.renderer,render=r.render.bind(r);
        r.scale=1;r.resize();r.adapt=()=>{};
        g.last=0;
        // Rig construction consumes UUID randomness differently when it has ink
        // meshes. Align the deliberately random idle/flame phases as well.
        g.view.mechs.forEach((v,id)=>{
          v.anim.time=id;
          v.rig.root.traverse(o=>{
            const materials=Array.isArray(o.material)?o.material:[o.material];
            for(const m of materials)if(m?.uniforms?.uPhase)m.uniforms.uPhase.value=id%3;
          });
        });
        const frames=Math.round(t*60);
        // Draw only the last few warm-up frames, identical on both builds.
        r.render=()=>{};
        for(let i=0;i<frames;i++) {
          if(i===frames-3)r.render=render;
          window.__resetInkSeed(5000+i);
          g.frame(g.last+1000/60);
        }
        r.render=render;
      },t);
      if (scene === 'hangar') {
        await page.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.openFreePlay(); });
        await run(2.5);
        await page.evaluate(() => { document.querySelector('.menu').style.visibility = 'hidden'; });
      } else {
        await page.evaluate(() => { const g = window.game; g.menus.reset('modes', undefined, ['title']); g.startFree(); });
        await run(.1);
        await page.evaluate(() => window.game.session.fastForward(95));
        await run(1.5);
        await page.evaluate(() => { document.querySelector('.hud').style.visibility = 'hidden'; });
      }
      // Stop the loop on this frame and draw it again with nothing moving.
      await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
      await page.waitForTimeout(100);
      // Where the player's mech is on screen, for the crop.
      crops[`${sz}-${scene}`] ??= await page.evaluate(() => {
        const g = window.game;
        const p = g.view.plates[g.view.focusId] ?? null;
        return p && p.visible ? { x: p.cx, y: p.cy, h: Math.abs(p.cy - p.y) } : null;
      });
      await page.evaluate(() => window.game.renderer.composer.render(0));
      await page.waitForTimeout(100);
      await page.screenshot({ path: `${out}/${tag}-${sz}-${scene}.png`, timeout: 300000 });
      writeFileSync(`${out}/state-${tag}-${sz}-${scene}.json`,JSON.stringify(await page.evaluate(()=>{const g=window.game,r=g.renderer;return {time:g.time,worldTime:g.worldTime,cam:r.camera.matrixWorld.elements,ink:Object.fromEntries(Object.entries(r.inkPass.uniforms).filter(([k])=>k.startsWith('u')).map(([k,v])=>[k,v.value])),film:Object.fromEntries(Object.entries(r.filmPass.uniforms).filter(([k])=>k.startsWith('u')).map(([k,v])=>[k,v.value]))};}),null,2));
      const mask=await page.evaluate(()=>{
        const r=window.game.renderer,t=r.inkPass.mask,a=new Uint8Array(t.width*t.height*4);
        r.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,a);
        return {width:t.width,height:t.height,data:Array.from(a.filter((_,i)=>i%4===0))};
      });
      writeFileSync(`${out}/mask-${tag}-${sz}-${scene}.json`,JSON.stringify(mask));
      console.log(`${tag} ${sz} ${scene}`);
      await page.close();
    }
  }
}
await browser.close();

// The sheets, with Python and Pillow if they are there.
const py = String.raw`
import json, sys
from PIL import Image
out, crops = sys.argv[1], json.loads(sys.argv[2])
for key, c in crops.items():
    a = Image.open(f'{out}/a-{key}.png').convert('RGB'); b = Image.open(f'{out}/b-{key}.png').convert('RGB')
    w, h = a.size
    sheet = Image.new('RGB', (w, h * 2 + 8)); sheet.paste(a, (0, 0)); sheet.paste(b, (0, h + 8))
    sheet.save(f'{out}/compare-{key}.png')
    if c:
        # The mech's body: centred on it, about as tall as head to feet and a bit.
        r = max(60, c['h'] * 1.6)
        box = (max(0, int(c['x'] - r)), max(0, int(c['y'] - r * 1.2)), min(w, int(c['x'] + r)), min(h, int(c['y'] + r * 1.2)))
        ca, cb = a.crop(box), b.crop(box)
        ca = ca.resize((ca.width * 2, ca.height * 2), Image.NEAREST); cb = cb.resize((cb.width * 2, cb.height * 2), Image.NEAREST)
        pair = Image.new('RGB', (ca.width * 2 + 8, ca.height)); pair.paste(ca, (0, 0)); pair.paste(cb, (ca.width + 8, 0))
        pair.save(f'{out}/crop-{key}.png')
`;
try {
  // Plate positions are in CSS pixels; the screenshots are in device pixels.
  const scaled = Object.fromEntries(Object.entries(crops).map(([k, c]) => {
    const s = SZ[k.split('-')[0]].scale;
    return [k, c ? { x: c.x * s, y: c.y * s, h: c.h * s } : null];
  }));
  execFileSync(process.env.PYTHON ?? 'python3', ['-c', py, out, JSON.stringify(scaled)], { stdio: 'inherit' });
} catch {
  console.log('(no Python/Pillow: compare the a- and b- images by hand)');
}

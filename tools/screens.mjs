// A tour of every screen at a list of screen sizes, saved as screenshots, for
// checking the layouts on handhelds, phones (both ways round), tablets and
// desktops. Needs the game served with its room server (npm start, or npm
// run dev with npm run server) and Playwright.
//
//   node tools/screens.mjs out-folder                  every size
//   SIZES=nova43,phone-l node tools/screens.mjs out    some of them
//   URL=http://localhost:5173/ ...                     another address
//   SCREENS=title,hud ...                              some of the screens
//   ASPECT=classic ...                                 the 4:3 picture setting
//   LOOK=plain ...                                     the plain look instead of the 80s anime one
//
// Phones and handhelds are emulated as touch devices at their pixel ratio
// (the -pad sizes as the same screen worked by its buttons).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const out = process.argv[2] ?? 'screens-out';
const base = process.env.URL ?? 'http://localhost:8090/';
mkdirSync(out, { recursive: true });

/** CSS pixel viewports. The Retroid Pocket Nova is 1280x960 at 4.5 inches: about 640x480 in a browser. */
const SIZES = {
  'nova43': { width: 640, height: 480, scale: 2, touch: true },
  'nova43-pad': { width: 640, height: 480, scale: 2, touch: false },
  'desktop-short': { width: 1280, height: 600, scale: 1, touch: false },
  'nova43-small': { width: 533, height: 400, scale: 2.4, touch: true },
  'phone-l': { width: 844, height: 390, scale: 3, touch: true },
  'phone-se-l': { width: 667, height: 375, scale: 2, touch: true },
  'phone-p': { width: 390, height: 844, scale: 3, touch: true },
  'phone-small-p': { width: 360, height: 740, scale: 2, touch: true },
  'tablet43': { width: 1024, height: 768, scale: 2, touch: true },
  'desktop169': { width: 1280, height: 720, scale: 1, touch: false },
  'desktop-hd': { width: 1920, height: 1080, scale: 1, touch: false },
};
const pick = (process.env.SIZES ?? Object.keys(SIZES).join(',')).split(',');
const only = process.env.SCREENS ? new Set(process.env.SCREENS.split(',')) : null;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];

async function tour(name) {
  const s = SIZES[name];
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale, hasTouch: s.touch, isMobile: s.touch });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => problems.push(`${name} [pageerror] ${e.message}`));
  const aspect = process.env.ASPECT === 'classic' ? 'classic' : 'wide';
  await page.addInitScript((aspect) => { try { localStorage.setItem('zgp.callsign', 'Alpha'); localStorage.setItem('zgp.pilot', JSON.stringify({ v: 1, portrait: 0, made: 'Comet' })); localStorage.setItem('zgp.video', JSON.stringify({ panels: true, crt: false, aspect })); } catch {} }, aspect);
  await page.goto(base + '?mute=1&seed=5' + (process.env.LOOK ? `&look=${process.env.LOOK}` : ''));
  await page.waitForFunction(() => window.game !== undefined);
  const g = (fn, arg) => page.evaluate(fn, arg);
  // Draw only when a screenshot is taken: software rendering is slow.
  await g(() => { const r = window.game.renderer; r.__render = r.render.bind(r); r.render = () => {}; });
  const shot = async (screen, prep, wait = 600) => {
    if (only && !only.has(screen)) return;
    try {
      await prep();
      await page.waitForTimeout(wait);
      // Software rendering warms up slowly (shaders, the hangar's model): let the game run a few frames first.
      const t0 = await g(() => window.game.time);
      await page.waitForFunction((t0) => window.game.time - t0 > 0.4, t0, { timeout: 120000 }).catch(() => {});
      await g(() => { const r = window.game.renderer; r.__render(0.016, performance.now() / 1000); });
      await page.screenshot({ path: `${out}/${name}${aspect === 'classic' ? '-43' : ''}${process.env.LOOK ? '-' + process.env.LOOK : ''}--${screen}.png` });
      // Anything cut off: an element of the menu wider or taller than the screen, or outside it.
      const over = await g(() => {
        // The frame: the window, or the 4:3 box in it.
        const box = document.querySelector('.menu')?.getBoundingClientRect() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        const bad = [];
        // Inside a pane that scrolls: reachable by scrolling, as long as the pane itself is on screen.
        const scrolls = (el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const oy = getComputedStyle(p).overflowY;
            if (oy === 'auto' || oy === 'scroll') return p;
          }
          return null;
        };
        for (const el of document.querySelectorAll('.menu *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
          const pane = scrolls(el);
          const q = pane ? pane.getBoundingClientRect() : box;
          // Wider than its pane is cut off even there (panes scroll up and down only).
          const lim = pane ? { left: Math.max(q.left, box.left), right: Math.min(q.right, box.right), top: -1e9, bottom: 1e9 } : box;
          if (r.right > lim.right + 1 || r.bottom > lim.bottom + 1 || r.left < lim.left - 1 || r.top < lim.top - 1) bad.push((el.className || el.tagName) + '');
        }
        // Panes themselves must be inside the frame (up and down only matters for those that do not scroll inside another).
        for (const p of document.querySelectorAll('.menu .panes, .menu .panes > *')) {
          const r = p.getBoundingClientRect();
          if (r.width === 0) continue;
          const inner = p.parentElement && scrolls(p) && p.parentElement.classList.contains('panes');
          if (r.right > box.right + 1 || r.left < box.left - 1 || (!inner && (r.bottom > box.bottom + 1 || r.top < box.top - 1))) bad.push('pane ' + p.className);
        }
        return [...new Set(bad)].slice(0, 6);
      });
      if (over.length) problems.push(`${name} ${screen}: off screen: ${over.join(', ')}`);
    } catch (e) {
      problems.push(`${name} ${screen}: ${e.message.split('\n')[0]}`);
    }
  };
  await shot('title', () => g(() => window.game.menus.reset('title')));
  await shot('modes', () => g(() => window.game.menus.reset('modes', undefined, ['title'])));
  await shot('video', () => g(() => window.game.menus.push('video')));
  await shot('controls', () => g(() => window.game.menus.reset('controls', undefined, ['title', 'modes'])));
  await shot('hangar', () => g(() => { window.game.menus.reset('modes', undefined, ['title']); window.game.openFreePlay(); }), 2500);
  await shot('pilot', () => g(() => window.game.menus.push('pilot')), 1500);
  await shot('setup', () => g(() => { if (window.game.menus.has('pilot')) window.game.menus.pop(); window.game.menus.push('setup'); }), 1500);
  await shot('gp', () => g(() => window.game.menus.reset('gp', undefined, ['title', 'modes'])), 1500);
  await shot('gp-season', () => g(() => window.game.menus.focus('season')), 500);
  // The cups with a medal won in the first (so the second is open, the third not yet).
  await shot('gp-cups', () => g(() => {
    localStorage.setItem('zgp.gp.medals', JSON.stringify({ horizon: { 1: 'silver', 2: 'bronze' } }));
    window.game.menus.reset('gp-cups', undefined, ['title', 'modes', 'gp']);
  }), 1500);
  await shot('briefing', () => g(() => window.game.openGp('season')), 2000);
  await shot('callsign', () => g(() => window.game.askCallsign()));
  await shot('online', async () => {
    await g(() => { window.game.menus.reset('modes', undefined, ['title']); window.game.openOnline(); });
    await page.waitForFunction(() => window.game.online.squad, null, { timeout: 30000 }).catch(() => {});
  }, 1500);
  await shot('room', async () => {
    await g(() => window.game.createRoom());
    await page.waitForFunction(() => window.game.menus.screen === 'room' && window.game.online.lobby, null, { timeout: 30000 }).catch(() => {});
  }, 1500);
  await g(() => { try { window.game.online.leaveRoom(); window.game.online.leaveSquad(); } catch {} });
  // A phone held upright: the race asks to be turned and waits, so there is no HUD to see.
  if (s.height > s.width && s.touch) {
    await shot('rotate', async () => {
      await g(() => { window.game.menus.reset('modes', undefined, ['title']); window.game.startFree(); });
      await page.waitForFunction(() => window.game.debugState().state === 'paused');
    }, 1500);
    await ctx.close();
    return;
  }
  await shot('hud', async () => {
    await g(() => { window.game.menus.reset('modes', undefined, ['title']); window.game.startFree(); });
    await page.waitForFunction(() => window.game.debugState().state === 'race');
    await g(() => { const s = window.game.session; s.fastForward?.(95); });
  }, 1500);
  // The HUD's pieces must not cover each other, the touch buttons, or run off the frame.
  if (!only || only.has('hud')) {
    const clash = await g(() => {
      const pick = ['.hud-place', '.tower', '.score', '.matchline', '.mapbox', '.dash', '.hints', '.tactics', '.comms', '.chips', '.target'];
      const box = document.querySelector('.hud').getBoundingClientRect();
      const shown = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
      };
      const rects = [];
      for (const sel of pick) {
        const el = document.querySelector('.hud ' + sel);
        if (shown(el)) rects.push([sel, el.getBoundingClientRect()]);
      }
      for (const el of document.querySelectorAll('.touchpad:not([hidden]) .tbtn')) if (shown(el)) rects.push(['button ' + el.textContent, el.getBoundingClientRect()]);
      const out = [];
      for (const [n, r] of rects) {
        if (n.startsWith('button')) continue;
        if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) out.push(`${n} off the frame`);
      }
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const [a, p] = rects[i];
          const [b, q] = rects[j];
          if (a.startsWith('button') && b.startsWith('button')) continue;
          const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left);
          const oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
          if (ox > 2 && oy > 2) out.push(`${a} over ${b}`);
        }
      return out;
    });
    if (clash.length) problems.push(`${name} hud: ${clash.join('; ')}`);
  }
  // Locked on and fighting, guard up and half spent: the race is held still
  // (the session stops stepping) with your mech locked on to the nearest rival.
  await shot('hud-battle', async () => {
    await g(() => {
      const s = window.game.session;
      s.update = () => { s.events.length = 0; };
      const me = s.race.mechs[s.localId];
      const rivals = s.race.mechs.filter((m) => m.team !== me.team && !m.retired);
      rivals.sort((a, b) => Math.abs(a.s - me.s) - Math.abs(b.s - me.s));
      me.mode = 1;
      me.target = rivals[0].id;
      me.guarding = true;
      me.guard *= 0.45;
    });
  }, 600);
  await shot('pause', () => g(() => window.game.pause()), 800);
  await shot('results', async () => {
    await g(() => { const gm = window.game; gm.resume(); const s = gm.session; s.race.mechs[s.localId].human = false; s.fastForward(260); });
    await page.waitForFunction(() => window.game.debugState().state === 'results', null, { timeout: 120000 });
  }, 1500);
  await ctx.close();
}

for (const name of pick) {
  if (!SIZES[name]) { problems.push(`no size called ${name}`); continue; }
  const t0 = Date.now();
  await tour(name);
  console.log(`${name}: done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join('\n') : 'no problems found');

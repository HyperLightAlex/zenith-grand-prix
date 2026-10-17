// The opening, frame by frame: the game footage cut to the song, with the
// titles, lyrics and graphics drawn over it. window.renderFrame(n) draws
// frame n (24 a second) on the canvas; render.mjs saves each one.
const W = 1920, H = 1080, FPS = 24;
const q = new URLSearchParams(location.search);
const FOOT = q.get('foot') ?? '../out/frames';
const cv = document.getElementById('c');
const X = cv.getContext('2d');

// ---- material ----------------------------------------------------------------

const shots = Object.fromEntries(
  (await Promise.all(['../shots.json', '../shots2.json'].map(async (u) => (await (await fetch(u)).json()).shots))).flat().map((s) => [s.id, s]),
);

const ART = {};
// The game's own art, from the repo (the page is served from its root).
const ART_FROM = { 'hud-u2-pilots.png': '/art/hud-sheets/', 'bg-c1-sky.png': '/art/bg-sheets/' };
await Promise.all(['logo.webp', 'cover.webp', 'solstice.webp', 'vanta.webp', 'mirage.webp', 'aurora.webp', 'tempest.webp', 'three.webp', 'two.webp', 'one.webp', 'go.webp', 'hud-u2-pilots.png', 'bg-c1-sky.png'].map(async (n) => {
  const im = new Image();
  im.src = (ART_FROM[n] ?? '/src/client/ui/art/') + n;
  await im.decode();
  ART[n.split('.')[0]] = im;
}));

const EN = [
  'Blue sparks tear through the night',
  'Wind against a chest of steel',
  'The red lamps strike the signal',
  'Holding only your voice in my heart',
  'Off we run, past the limit',
  'Trembling fingers grip the future',
  'Betting everything on this one lap',
  'Run, wings of steel!',
  'At a speed that overtakes the stars',
  'Burning hearts made one',
  'Seize tomorrow, race on through',
  'Take the final corner',
  'A new sky we win together',
];
const LYR = [];
for (const blk of (await (await fetch('../lyrics.srt')).text()).trim().split(/\r?\n\s*\r?\n/)) {
  const L = blk.split(/\r?\n/);
  const m = L[1]?.match(/(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)/);
  const txt = L.slice(2).join(' ').trim();
  if (!m || !txt || txt.startsWith('[')) continue;
  const ts = (h, mi, s, ms) => +h * 3600 + +mi * 60 + +s + +ms / 1000;
  LYR.push({ t0: ts(m[1], m[2], m[3], m[4]), t1: ts(m[5], m[6], m[7], m[8]), jp: txt, en: EN[LYR.length] });
}

await Promise.all([
  ...['600', '700', '800', '900'].map((w) => document.fonts.load(`italic ${w} 100px "Barlow Condensed"`)),
  document.fonts.load('600 100px "Barlow Condensed"'),
  document.fonts.load('100px "Dela Gothic One"', '走れゼニス・グランプリファイナルラップコークスクリュー・キャニオン勝ヘリオス・ドロップメリディアン・スカイウェイ撃破ウィナー'),
  document.fonts.load('700 100px "Noto Serif CJK JP"', LYR.map((l) => l.jp).join('')),
]);

// Footage frames come and go; a few hundred stay decoded.
const cache = new Map();
function load(url) {
  let p = cache.get(url);
  if (!p) {
    const im = new Image();
    im.src = url;
    p = im.decode().then(() => im, () => null);
    cache.set(url, p);
    if (cache.size > 160) cache.delete(cache.keys().next().value);
  }
  return p;
}

// ---- helpers -----------------------------------------------------------------

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
/** A hit at a that fades out by b: 0 before it, 1 at it, 0 by b. */
const after = (t, a, b) => (t < a ? 0 : 1 - prog(t, a, b));
const eOut = (k) => 1 - (1 - k) ** 3;
const eIn = (k) => k ** 3;
const eIO = (k) => k * k * (3 - 2 * k);
const eBack = (k) => { const c = 1.9; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
/** Graphics drawn on twos, like the footage: 12 drawings a second. */
const twos = (t) => Math.floor(t * 12 + 1e-6) / 12;
function rng(seed) {
  let s = (Math.floor(seed) * 2654435761 + 1013904223) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// The five teams: emblem, name, colour (the game's own).
const TEAMS = {
  solstice: ['SOLSTICE', '#3d8bff'],
  vanta: ['VANTA', '#ff3d5a'],
  mirage: ['MIRAGE', '#ff8f2e'],
  aurora: ['AURORA', '#a66bff'],
  tempest: ['TEMPEST', '#3ddc84'],
};
const C = {
  ink: '#0b1030', navy: '#0a1440', blue: '#1f56e0', sky: '#53b4ff', orange: '#ff7a1a', gold: '#ffc23d',
  white: '#f7f5ef', red: '#e3263a', crimson: '#7a0d1c', phos: '#45e8ff', cyan: '#7ff4ff',
};

function reset() {
  X.setTransform(1, 0, 0, 1, 0, 0);
  X.globalAlpha = 1;
  X.globalCompositeOperation = 'source-over';
  X.filter = 'none';
  X.shadowBlur = 0;
  X.shadowColor = 'transparent';
  X.letterSpacing = '0px';
}

// Night: the dusk pushed down into moonlit blue; only the lights (the cyan
// glows, the skates' sparks, the white armour catching them) keep their colour.
const gradeCanvas = new OffscreenCanvas(W, H);
const gctx = gradeCanvas.getContext('2d', { willReadFrequently: true });
function nightGrade(im) {
  gctx.drawImage(im, 0, 0, W, H);
  const d = gctx.getImageData(0, 0, W, H), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    let R = (y + (r - y) * 0.35) * 0.3, G = (y + (g - y) * 0.35) * 0.4, B = (y + (b - y) * 0.35) * 0.8 + 0.03;
    const cyan = clamp(((g + b) * 0.5 - r * 0.7 - 0.12) * 3);
    const white = clamp((y - 0.72) * 4);
    const k = Math.max(cyan, white * 0.75);
    R += (r * 1.05 - R) * k;
    G += (g * 1.05 - G) * k;
    B += (b * 1.1 - B) * k;
    p[i] = R * 255;
    p[i + 1] = G * 255;
    p[i + 2] = B * 255;
  }
  gctx.putImageData(d, 0, 0);
  return gradeCanvas;
}

const KICKS = [45.91, 47.48, 48.27, 49.06, 50.64, 52.41, 63.39, 64.37];

/** Footage of shot `id` at video time t (drawn at 24 a second), filling the frame. */
async function foot(id, t, o = {}) {
  const s = shots[id];
  if (!s) throw new Error('no shot ' + id);
  // A speed ramp (o.ramp: 0..1 of the shot's time to 0..1 of its frames) retimes it.
  const v0 = o.from ?? s.v0;
  const used = Math.round((s.v1 - s.v0) * FPS);
  const raw = o.ramp ? o.ramp(clamp((t - v0) / (s.v1 - s.v0))) * used : (t - v0) * FPS;
  const f = o.freeze ?? clamp(Math.floor(raw + 1e-4) + (o.offset ?? 0), 0, s.frames - 1);
  const im = await load(`${FOOT}/${id}/${String(f).padStart(4, '0')}.jpg`);
  X.save();
  // The big kicks of the chorus and outro punch the picture in a little.
  let kick = 0;
  for (const b of KICKS) if (t >= b && t < b + 0.4) kick = Math.max(kick, 0.035 * Math.exp(-(t - b) * 9));
  const z = (o.zoom ?? 1) * (1 + kick), w = W * z, h = H * z;
  const x = (W - w) / 2 + (o.dx ?? 0), y = (H - h) / 2 + (o.dy ?? 0);
  if (!im) {
    X.fillStyle = '#2a3150';
    X.fillRect(0, 0, W, H);
    X.fillStyle = '#fff';
    X.font = 'italic 700 64px "Barlow Condensed"';
    X.fillText(`${id} ${f}`, 80, 140);
    X.restore();
    return;
  }
  if (o.grade === 'night') {
    X.drawImage(nightGrade(im), x, y, w, h);
  } else {
    X.filter = o.filter ?? 'none';
    X.drawImage(im, x, y, w, h);
  }
  X.restore();
}

/** Text with strokes under the fill (widest first), optional glow. */
function text(str, x, y, o) {
  X.save();
  X.font = o.font;
  X.textAlign = o.align ?? 'left';
  X.textBaseline = o.base ?? 'alphabetic';
  X.letterSpacing = (o.ls ?? 0) + 'px';
  X.lineJoin = 'round';
  if (o.alpha != null) X.globalAlpha *= o.alpha;
  if (o.glow) { X.shadowColor = o.glow; X.shadowBlur = o.glowR ?? 24; }
  for (const [w, c] of o.strokes ?? []) {
    X.lineWidth = w;
    X.strokeStyle = c;
    X.strokeText(str, x, y);
    X.shadowBlur = 0;
  }
  if (o.fill) {
    X.fillStyle = o.fill;
    X.fillText(str, x, y);
  }
  X.restore();
}
function measure(str, font, ls = 0) {
  X.save();
  X.font = font;
  X.letterSpacing = ls + 'px';
  const m = X.measureText(str).width;
  X.restore();
  return m;
}

/** A four-point star glint: k runs 0..1 over its life. */
function glint(x, y, size, k, o = {}) {
  if (k <= 0 || k >= 1) return;
  const s = size * Math.sin(Math.PI * k) ** 0.7;
  X.save();
  X.translate(x, y);
  X.rotate((o.rot ?? 0) + k * (o.spin ?? 0.5));
  X.globalCompositeOperation = 'lighter';
  const g = X.createRadialGradient(0, 0, 0, 0, 0, s * 0.55);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.25, o.tint ?? 'rgba(150,215,255,0.45)');
  g.addColorStop(1, 'rgba(120,180,255,0)');
  X.fillStyle = g;
  X.beginPath();
  X.arc(0, 0, s * 0.55, 0, Math.PI * 2);
  X.fill();
  X.fillStyle = '#fff';
  const ray = (len, wid) => {
    X.beginPath();
    X.moveTo(-len, 0);
    X.quadraticCurveTo(0, -wid, len, 0);
    X.quadraticCurveTo(0, wid, -len, 0);
    X.fill();
  };
  ray(s, s * 0.09);
  X.rotate(Math.PI / 2);
  ray(s * 0.85, s * 0.09);
  X.rotate(Math.PI / 4);
  ray(s * 0.3, s * 0.06);
  X.rotate(Math.PI / 2);
  ray(s * 0.3, s * 0.06);
  X.restore();
}

/** Manga focus lines: wedges from the frame's edge in toward (cx, cy). */
function focusLines(cx, cy, seed, o = {}) {
  const r = rng(seed);
  X.save();
  X.fillStyle = o.color ?? '#fff';
  X.globalAlpha *= o.alpha ?? 1;
  const n = o.n ?? 110, R = 1600;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, w = 0.003 + r() * (o.w ?? 0.012), r0 = (o.inner ?? 420) * (0.7 + r() * 0.7);
    X.beginPath();
    X.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    X.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
    X.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
    X.fill();
  }
  X.restore();
}

/** Horizontal speed streaks across a band, moving with t. */
function streaks(y0, y1, t, seed, o = {}) {
  const r = rng(seed);
  X.save();
  X.fillStyle = o.color ?? 'rgba(255,255,255,0.5)';
  const n = o.n ?? 40, v = o.speed ?? 2600, dir = o.dir ?? 1;
  for (let i = 0; i < n; i++) {
    const y = lerp(y0, y1, r()), len = 120 + r() * (o.len ?? 600), th = 1 + r() * (o.th ?? 4);
    const span = W + len * 2;
    const x = ((r() * span + t * v * (0.6 + r() * 0.8)) % span) - len;
    X.globalAlpha = 0.3 + r() * 0.7;
    X.fillRect(dir > 0 ? x : W - x - len, y, len, th);
  }
  X.restore();
}

// A pilot's portrait: one 512 cell of the pilot sheet.
const PILOT = { kite: [0, 0], lark: [512, 0], atlas: [1024, 0], shrike: [0, 512], moth: [512, 512], golem: [1024, 512] };
function pilot(name, src, dst, flip = false) {
  const [ox, oy] = PILOT[name];
  const [sx, sy, sw, sh] = src, [dx, dy, dw, dh] = dst;
  X.save();
  if (flip) {
    X.translate(dx + dw, dy);
    X.scale(-1, 1);
    X.drawImage(ART['hud-u2-pilots'], ox + sx, oy + sy, sw, sh, 0, 0, dw, dh);
  } else X.drawImage(ART['hud-u2-pilots'], ox + sx, oy + sy, sw, sh, dx, dy, dw, dh);
  X.restore();
}

/** A whole portrait whose sides fade out, so its own background melts into the panel's. */
const softCells = {};
function pilotSoft(name, dst, flip = false) {
  let c = softCells[name];
  if (!c) {
    c = softCells[name] = new OffscreenCanvas(512, 512);
    const g = c.getContext('2d');
    const [ox, oy] = PILOT[name];
    g.drawImage(ART['hud-u2-pilots'], ox, oy, 512, 512, 0, 0, 512, 512);
    g.globalCompositeOperation = 'destination-in';
    const m = g.createLinearGradient(0, 0, 512, 0);
    m.addColorStop(0, 'rgba(0,0,0,0)');
    m.addColorStop(0.16, 'rgba(0,0,0,1)');
    m.addColorStop(0.84, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, 512, 512);
  }
  const [dx, dy, dw, dh] = dst;
  X.save();
  if (flip) {
    X.translate(dx + dw, dy);
    X.scale(-1, 1);
    X.drawImage(c, 0, 0, dw, dh);
  } else X.drawImage(c, dx, dy, dw, dh);
  X.restore();
}

/** Draw an image to cover the frame, scaled by z about (fx, fy) of the image. */
function cover(im, z = 1, fx = 0.5, fy = 0.5, dx = 0, dy = 0) {
  const s = Math.max(W / im.width, H / im.height) * z;
  const w = im.width * s, h = im.height * s;
  X.drawImage(im, W / 2 - w * fx + dx, H / 2 - h * fy + dy, w, h);
}

function flash(color, a) {
  if (a <= 0) return;
  X.save();
  X.globalAlpha = clamp(a);
  X.fillStyle = color;
  X.fillRect(-50, -50, W + 100, H + 100);
  X.restore();
}
function invert() {
  X.save();
  X.globalCompositeOperation = 'difference';
  X.fillStyle = '#fff';
  X.fillRect(0, 0, W, H);
  X.restore();
}
function shakeAt(t, t0, dur, amp, seed = 1) {
  const k = prog(t, t0, t0 + dur);
  if (k <= 0 || k >= 1) return [0, 0];
  const r = rng(Math.floor(t * 24) + seed * 101);
  const a = amp * (1 - k) ** 2;
  return [(r() - 0.5) * 2 * a, (r() - 0.5) * 2 * a];
}

// Film grain over everything, on twos, so the drawn titles sit in the same picture as the footage.
const grain = [0, 1, 2, 3].map((i) => {
  const c = new OffscreenCanvas(960, 540), g = c.getContext('2d'), d = g.createImageData(960, 540), r = rng(i + 7);
  for (let p = 0; p < d.data.length; p += 4) {
    const v = 128 + (r() + r() - 1) * 120;
    d.data[p] = d.data[p + 1] = d.data[p + 2] = v;
    d.data[p + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c;
});
function grainPass(n, a) {
  X.save();
  X.globalCompositeOperation = 'overlay';
  X.globalAlpha = a;
  X.drawImage(grain[Math.floor(n / 2) % 4], 0, 0, W, H);
  X.restore();
}

/** A circuit's name, sliding in at the lower left. */
function circuitCard(t, at, en, jp) {
  const ck = prog(t, at, at + 0.14);
  if (ck <= 0) return;
  const x = lerp(-760, 110, eOut(ck));
  X.fillStyle = C.orange;
  X.fillRect(x, 952, 600, 10);
  text(jp, x + 4, 846, { font: '34px "Dela Gothic One"', ls: 8, fill: C.gold, strokes: [[10, C.ink]] });
  text(en, x, 936, { font: 'italic 900 100px "Barlow Condensed"', ls: 6, fill: C.white, strokes: [[16, C.ink]] });
}

/** 撃破 (shot down): stamped on the knockout's painted still. */
function koStamp(t, at) {
  const k = prog(t, at, at + 0.08), out = prog(t, at + 0.78, at + 0.9);
  if (k <= 0 || out >= 1) return;
  X.save();
  X.globalAlpha = 1 - out;
  X.translate(1500, 470);
  X.rotate(-0.08);
  const sc = lerp(2.4, 1, eOut(k)) * (1 + 0.04 * (t - at));
  X.scale(sc, sc);
  text('撃破', 0, 0, { font: '250px "Dela Gothic One"', align: 'center', base: 'middle', fill: C.red, strokes: [[44, C.ink], [16, '#fff']] });
  text('KNOCKOUT', 0, 170, { font: 'italic 900 64px "Barlow Condensed"', ls: 16, align: 'center', fill: '#fff', strokes: [[12, C.ink]] });
  X.restore();
  flash('#fff', 0.6 * after(t, at, at + 0.1));
}

/** Who is fighting: two teams' emblems and names on one line, top left. */
function matchChip(t, at, a, b) {
  const k = prog(t, at, at + 0.12);
  if (k <= 0) return;
  const font = 'italic 900 54px "Barlow Condensed"', vsFont = 'italic 800 34px "Barlow Condensed"';
  const wa = measure(TEAMS[a][0], font, 4), wb = measure(TEAMS[b][0], font, 4), wv = measure('VS', vsFont, 4);
  const E = 92, gap = 16, total = E + gap + wa + 22 + wv + 22 + wb + gap + E;
  const x = lerp(-total - 120, 70, eOut(k)), y = 64, h = 108;
  X.save();
  X.fillStyle = 'rgba(6,10,30,0.74)';
  X.beginPath();
  X.moveTo(x - 24, y); X.lineTo(x + total + 44, y); X.lineTo(x + total + 14, y + h); X.lineTo(x - 24, y + h);
  X.fill();
  let cx = x;
  X.drawImage(ART[a], cx, y + 8, E, E);
  cx += E + gap;
  text(TEAMS[a][0], cx, y + 74, { font, ls: 4, fill: TEAMS[a][1], strokes: [[8, C.ink]] });
  cx += wa + 22;
  text('VS', cx, y + 70, { font: vsFont, ls: 4, fill: C.white, strokes: [[6, C.ink]] });
  cx += wv + 22;
  text(TEAMS[b][0], cx, y + 74, { font, ls: 4, fill: TEAMS[b][1], strokes: [[8, C.ink]] });
  cx += wb + gap;
  X.drawImage(ART[b], cx, y + 8, E, E);
  X.restore();
}

// ---- the boot: race control powering up (0 - 3.27) -----------------------------

const BOOT = [
  [0.35, 'Race program', 'OK'],
  [0.70, 'Frame 01  Sunhawk', 'Linked'],
  [1.11, 'Frame 02  Razor', 'Linked'],
  [1.51, 'Frame 03  Daystar', 'Linked'],
  [1.90, 'Frame 04  Stinger', 'Linked'],
  [2.30, 'Frame 05  Rampart', 'Linked'],
  [2.69, 'Frame 06  Maul', 'Linked'],
  [3.13, 'All 6 frames', 'Online'],
];
function boot(t) {
  const P = C.phos, dim = 'rgba(69,232,255,0.38)', faint = 'rgba(69,232,255,0.14)';
  // The tube switches on (a line, then the picture) and, at the end, off.
  const on = prog(t, 0.04, 0.4), off = prog(t, 3.17, 3.27);
  let sx = 1, sy = 1, bright = 1;
  if (on < 1) {
    sy = on < 0.45 ? 0.012 : lerp(0.012, 1, eOut((on - 0.45) / 0.55));
    sx = on < 0.45 ? lerp(0.6, 1, eOut(on / 0.45)) : 1;
    bright = lerp(4, 1, on);
  }
  if (off > 0) {
    sy = off < 0.55 ? lerp(1, 0.012, eIn(off / 0.55)) : 0.012;
    sx = off < 0.55 ? 1 : lerp(1, 0.02, eIn((off - 0.55) / 0.45));
    bright = lerp(1, 5, off);
  }
  // The last line lands: everything flares.
  bright += 1.2 * Math.max(0, 1 - Math.abs(t - 3.14) / 0.08);
  X.save();
  X.translate(W / 2, H / 2);
  X.scale(sx, sy);
  X.translate(-W / 2, -H / 2);
  if (bright > 1.01) X.filter = `brightness(${bright.toFixed(2)})`;
  const x0 = 110, y0 = 80, x1 = W - 110, y1 = H - 80;
  X.beginPath();
  X.roundRect(x0, y0, x1 - x0, y1 - y0, 30);
  X.fillStyle = '#02060d';
  X.fill();
  const glow = X.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, 900);
  glow.addColorStop(0, faint);
  glow.addColorStop(1, 'rgba(69,232,255,0)');
  X.fillStyle = glow;
  X.fill();
  X.lineWidth = 2;
  X.strokeStyle = dim;
  X.stroke();
  X.save();
  X.clip();
  // Head.
  const head = { font: 'italic 600 36px "Barlow Condensed"', ls: 6, glow: 'rgba(69,232,255,0.7)', glowR: 14 };
  text('ZENITH RACE CONTROL', x0 + 70, y0 + 86, { ...head, fill: P });
  text('FRAME LINK', x1 - 70, y0 + 86, { ...head, align: 'right', fill: C.orange, glow: 'rgba(255,122,26,0.7)' });
  X.fillStyle = dim;
  X.fillRect(x0 + 70, y0 + 112, x1 - x0 - 140, 2);
  // Scope.
  const cx = 580, cy = 560, R = 260;
  X.save();
  X.strokeStyle = P;
  X.shadowColor = dim;
  X.shadowBlur = 10;
  X.globalAlpha = 0.7;
  X.lineWidth = 2.4;
  X.beginPath();
  X.arc(cx, cy, R, 0, Math.PI * 2);
  X.stroke();
  X.globalAlpha = 0.55;
  X.lineWidth = 16;
  X.setLineDash([2.6, 14.4]);
  X.lineDashOffset = -t * 9;
  X.beginPath();
  X.arc(cx, cy, R - 22, 0, Math.PI * 2);
  X.stroke();
  X.setLineDash([7, 11]);
  X.lineDashOffset = 0;
  X.lineWidth = 2;
  X.globalAlpha = 0.5;
  X.beginPath();
  X.arc(cx, cy, R * 0.66, 0, Math.PI * 2);
  X.stroke();
  X.setLineDash([]);
  X.globalAlpha = 0.8;
  X.lineWidth = 2.6;
  X.beginPath();
  X.moveTo(cx - R - 26, cy); X.lineTo(cx - R + 30, cy);
  X.moveTo(cx + R - 30, cy); X.lineTo(cx + R + 26, cy);
  X.moveTo(cx, cy - R - 26); X.lineTo(cx, cy - R + 30);
  X.moveTo(cx, cy + R - 30); X.lineTo(cx, cy + R + 26);
  X.stroke();
  // The sweep.
  const sw = X.createConicGradient(twos(t) * Math.PI * 2 / 1.6 - Math.PI / 2, cx, cy);
  sw.addColorStop(0, 'rgba(69,232,255,0.42)');
  sw.addColorStop(0.08, 'rgba(69,232,255,0.06)');
  sw.addColorStop(0.2, 'rgba(69,232,255,0)');
  sw.addColorStop(0.95, 'rgba(69,232,255,0)');
  sw.addColorStop(1, 'rgba(69,232,255,0.42)');
  X.fillStyle = sw;
  X.globalAlpha = 1;
  X.shadowBlur = 0;
  X.beginPath();
  X.arc(cx, cy, R * 0.94, 0, Math.PI * 2);
  X.fill();
  X.restore();
  // The count: how many lines are in, eased between them.
  let done = 0;
  for (let i = 0; i < BOOT.length; i++) {
    if (t >= BOOT[i][0]) done = i + 1;
  }
  const prev = done ? BOOT[done - 1][0] : 0.1, next = BOOT[done]?.[0] ?? prev + 1;
  const pct = Math.min(100, Math.round(((done + 0.6 * eIO(prog(t, prev, next))) / BOOT.length) * 100 * (done === BOOT.length ? 1 : 0.999)));
  const pstr = pct >= 100 ? '100' : String(pct).padStart(2, '0');
  text(pstr, cx - 8, cy + 46, { font: 'italic 800 190px "Barlow Condensed"', align: 'center', fill: P, glow: 'rgba(69,232,255,0.75)', glowR: 26 });
  const pw = measure(pstr, 'italic 800 190px "Barlow Condensed"');
  text('%', cx - 8 + pw / 2 + 8, cy - 20, { font: 'italic 700 60px "Barlow Condensed"', fill: P, alpha: 0.85 });
  const frames = Math.max(0, Math.min(6, done - 1));
  text(`FRAMES ${String(frames).padStart(2, '0')} / 6`, cx, cy + 120, { font: '600 30px "Barlow Condensed"', ls: 5, align: 'center', fill: P, alpha: 0.85 });
  // The log, each line typed in.
  const lx = 990, rx = 1700, ly = 300, step = 64;
  BOOT.forEach(([at, label, status], i) => {
    if (t < at) return;
    const k = Math.floor(prog(t, at, at + 0.22) * 14) / 14;
    const y = ly + i * step;
    X.save();
    X.beginPath();
    X.rect(lx - 10, y - 50, (rx - lx + 20) * k, 70);
    X.clip();
    const last = i === BOOT.length - 1;
    const col = last ? C.orange : P;
    const font = 'italic 600 40px "Barlow Condensed"';
    text(label.toUpperCase(), lx, y, { font, ls: 4, fill: col, glow: last ? 'rgba(255,122,26,0.8)' : 'rgba(69,232,255,0.6)', glowR: 12 });
    const lw = measure(label.toUpperCase(), font, 4), stw = measure(status.toUpperCase(), font, 4);
    X.fillStyle = last ? 'rgba(255,122,26,0.5)' : dim;
    for (let dx = lx + lw + 20; dx < rx - stw - 18; dx += 12) X.fillRect(dx, y - 4, 4, 4);
    const signal = status === 'Linked' || last;
    text(status.toUpperCase(), rx, y, { font, ls: 4, align: 'right', fill: signal ? C.orange : P, glow: signal ? 'rgba(255,122,26,0.75)' : 'rgba(69,232,255,0.6)', glowR: 12 });
    X.restore();
  });
  // The waiting cursor, under the last line.
  if (done < BOOT.length && Math.floor(t / 0.4) % 2 === 0) text('_', lx, ly + done * step, { font: 'italic 600 40px "Barlow Condensed"', fill: P });
  // The meter.
  const bx = x0 + 70, bw = x1 - x0 - 140, by = y1 - 110;
  for (let sx2 = 0; sx2 < bw; sx2 += 28) {
    X.fillStyle = sx2 / bw < pct / 100 ? P : faint;
    X.fillRect(bx + sx2, by, 21, 26);
  }
  X.restore();
  X.restore();
}

// ---- the title (15.14 - 19.23) -------------------------------------------------

const LOGO_STAR = [760 / 1200, 62 / 465];
function logoAt(cx, cy, w, alpha = 1) {
  const im = ART.logo, h = (w * im.height) / im.width;
  X.save();
  X.globalAlpha *= alpha;
  X.shadowColor = 'rgba(5,10,40,0.65)';
  X.shadowBlur = 40;
  X.shadowOffsetY = 12;
  X.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  X.restore();
  return { x: cx - w / 2, y: cy - h / 2, w, h, star: [cx - w / 2 + w * LOGO_STAR[0], cy - h / 2 + h * LOGO_STAR[1]] };
}

function title(t) {
  const k = prog(t, 15.14, 19.23);
  cover(ART['bg-c1-sky'], lerp(1.16, 1.04, eOut(k)), 0.5, 0.45);
  // Deepen the bottom so the emblems read.
  const g = X.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(10,14,50,0)');
  g.addColorStop(1, 'rgba(10,14,50,0.75)');
  X.fillStyle = g;
  X.fillRect(0, 0, W, H);
  // Twinkles in the sky.
  const r = rng(77);
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = r() * H * 0.4, t0 = 15.3 + r() * 3.6;
    glint(x, y, 26 + r() * 22, prog(t, t0, t0 + 0.5));
  }
  // The logo slams in, then rises to make room.
  const slam = prog(t, 15.14, 15.27);
  const up = eIO(prog(t, 16.75, 17.08));
  const scale = slam < 1 ? lerp(1.9, 1, eOut(slam)) : 1 + 0.035 * Math.exp(-(t - 15.27) * 9) * Math.cos((t - 15.27) * 40);
  const w = lerp(1300, 1000, up) * scale;
  const L = logoAt(960, lerp(470, 300, up), w, clamp(slam * 3));
  glint(L.star[0], L.star[1], 220, prog(t, 15.5, 16.05), { spin: 0.4 });
  glint(L.star[0], L.star[1], 160, prog(t, 18.66, 19.05), { spin: 0.4 });
  // The name in katakana under it.
  if (t > 16.72) {
    const kk = prog(t, 16.72, 16.98);
    const y = L.y + L.h + 60;
    X.save();
    X.beginPath();
    X.rect(0, y - 80, W * eOut(kk), 120);
    X.clip();
    text('ゼニス・グランプリ', 960, y, { font: '52px "Dela Gothic One"', ls: 24, align: 'center', fill: C.white, strokes: [[12, C.ink]] });
    X.restore();
  }
  // The five teams stamp in, one a beat.
  ['solstice', 'vanta', 'mirage', 'aurora', 'tempest'].forEach((id, i) => {
    const at = [17.11, 17.51, 17.90, 18.30, 18.69][i];
    const kk = prog(t, at, at + 0.12);
    if (kk <= 0) return;
    const x = 960 + (i - 2) * 340, y = 735, sz = 230 * lerp(1.7, 1, eOut(kk));
    X.save();
    X.shadowColor = 'rgba(0,0,0,0.5)';
    X.shadowBlur = 30;
    X.drawImage(ART[id], x - sz / 2, y - sz / 2, sz, sz);
    X.restore();
    const [name, col] = TEAMS[id];
    text(name, x, y + 182, { font: 'italic 900 62px "Barlow Condensed"', ls: 8, align: 'center', fill: C.white, strokes: [[12, C.ink]], alpha: eOut(kk) });
    X.fillStyle = col;
    X.fillRect(x - 80, y + 202, 160 * eOut(kk), 8);
    flash('#fff', 0.22 * after(t, at, at + 0.12));
  });
  flash('#fff', 0.95 * after(t, 15.14, 15.45) ** 2);
}

// ---- lyrics ------------------------------------------------------------------

function lyrics(t) {
  const l = LYR.find((x) => t >= x.t0 && t < x.t1);
  if (!l) return;
  const a = Math.min(prog(t, l.t0, l.t0 + 0.12), 1 - prog(t, l.t1 - 0.15, l.t1));
  const jpFont = '700 60px "Noto Serif CJK JP"', enFont = 'italic 600 38px "Barlow Condensed"';
  const y = 968;
  const w = measure(l.jp, jpFont, 4), x = 960 - w / 2;
  X.save();
  X.globalAlpha = a;
  text(l.jp, x, y, { font: jpFont, ls: 4, fill: C.white, strokes: [[14, C.ink]] });
  // The karaoke wipe: sung text turns gold, left to right across the line's time.
  const sung = clamp((t - l.t0 - 0.1) / Math.max(0.6, (l.t1 - l.t0) * 0.82));
  if (sung > 0) {
    X.save();
    X.beginPath();
    X.rect(x - 10, y - 80, (w + 20) * sung, 110);
    X.clip();
    const g = X.createLinearGradient(0, y - 52, 0, y + 6);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.55, C.gold);
    g.addColorStop(1, C.orange);
    text(l.jp, x, y, { font: jpFont, ls: 4, fill: g, strokes: [[14, '#2a0d0a']] });
    X.restore();
  }
  text(l.en, 960, y + 58, { font: enFont, ls: 2, align: 'center', fill: '#eef3ff', strokes: [[8, C.ink]] });
  X.restore();
}

// ---- scenes ------------------------------------------------------------------

async function portraits(t) {
  // Kite on Solstice blue, then Shrike cuts in on a diagonal: the two voices.
  const kIn = prog(t, 25.40, 25.62), split = prog(t, 26.98, 27.12);
  const bg = X.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b2a8f');
  bg.addColorStop(1, '#2a6af0');
  X.fillStyle = bg;
  X.fillRect(0, 0, W, H);
  X.fillStyle = 'rgba(255,255,255,0.12)';
  for (let y = 18; y < H; y += 36) X.fillRect(0, y, W, 2);
  streaks(0, H, twos(t), 3, { color: 'rgba(200,230,255,0.5)', n: 34, speed: 1800 });
  const kx = lerp(-900, 140, eOut(kIn)) - 260 * eIO(split) + (t - 25.4) * 30;
  pilotSoft('kite', [kx, 0, 1080, 1080]);
  // Kite's name, until Shrike takes the right side.
  const nameA = 1 - eIO(split);
  if (nameA > 0) {
    const nx = lerp(2100, 1240, eOut(prog(t, 25.5, 25.72)));
    text('SOLSTICE', nx + 8, 420, { font: 'italic 800 54px "Barlow Condensed"', ls: 14, fill: C.gold, strokes: [[10, C.ink]], alpha: nameA });
    text('KITE', nx, 650, { font: 'italic 900 290px "Barlow Condensed"', ls: 6, fill: C.white, strokes: [[26, C.ink], [10, C.blue]], alpha: nameA });
    text('FRAME  SUNHAWK', nx + 12, 730, { font: 'italic 700 46px "Barlow Condensed"', ls: 10, fill: '#cfe3ff', strokes: [[8, C.ink]], alpha: nameA });
  }
  comms(t, 1240, 860, 560, C.cyan, nameA);
  if (split > 0) {
    // The Vanta side: a slanted panel from the right.
    const off = (1 - eOut(split)) * 1300;
    const top = 1180 + off, bot = 820 + off;
    X.save();
    X.beginPath();
    X.moveTo(top, 0);
    X.lineTo(W + 20, 0);
    X.lineTo(W + 20, H);
    X.lineTo(bot, H);
    X.closePath();
    X.save();
    X.clip();
    const rg = X.createLinearGradient(0, 0, 0, H);
    rg.addColorStop(0, '#3b0710');
    rg.addColorStop(1, '#d2213a');
    X.fillStyle = rg;
    X.fillRect(0, 0, W, H);
    X.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 18; y < H; y += 36) X.fillRect(0, y, W, 2);
    streaks(0, H, twos(t), 9, { color: 'rgba(255,190,190,0.45)', n: 30, speed: 1800, dir: -1 });
    pilotSoft('shrike', [880 + off - (t - 27) * 30, 0, 1080, 1080], true);
    const sa = prog(t, 27.1, 27.3);
    text('VANTA', 1850, 600, { font: 'italic 800 54px "Barlow Condensed"', ls: 14, align: 'right', fill: '#ff8a8a', strokes: [[10, '#14060a']], alpha: sa });
    text('SHRIKE', 1860 + (1 - eOut(sa)) * 200, 790, { font: 'italic 900 210px "Barlow Condensed"', ls: 4, align: 'right', fill: C.white, strokes: [[24, '#14060a'], [9, C.red]], alpha: sa });
    X.restore();
    // The cut itself: a white edge.
    X.lineWidth = 14;
    X.strokeStyle = '#fff';
    X.shadowColor = '#fff';
    X.shadowBlur = 30;
    X.beginPath();
    X.moveTo(top, -10);
    X.lineTo(bot, H + 10);
    X.stroke();
    X.restore();
    comms(t, 1240, 150, 560, '#ff7c8c', prog(t, 27.15, 27.35));
    flash('#fff', 0.7 * after(t, 26.98, 27.18));
  }
  flash('#fff', 0.8 * after(t, 25.40, 25.55));
}

/** A comm channel's waveform: the voice in the headset. */
function comms(t, x, y, w, col, a) {
  if (a <= 0) return;
  X.save();
  X.globalAlpha = a;
  X.fillStyle = 'rgba(5,10,30,0.55)';
  X.beginPath();
  X.roundRect(x - 20, y - 70, w + 40, 140, 12);
  X.fill();
  text('COMM', x, y - 38, { font: '600 26px "Barlow Condensed"', ls: 6, fill: col });
  X.strokeStyle = col;
  X.lineWidth = 4;
  X.shadowColor = col;
  X.shadowBlur = 14;
  X.beginPath();
  const tt = twos(t);
  for (let i = 0; i <= 120; i++) {
    const u = i / 120, env = Math.sin(Math.PI * u) * (0.45 + 0.55 * Math.abs(Math.sin(tt * 7.3 + u * 3)));
    const v = Math.sin(u * 46 + tt * 31) * 0.6 + Math.sin(u * 97 - tt * 23) * 0.4;
    const px = x + u * w, py = y + 18 + v * env * 38;
    if (i) X.lineTo(px, py); else X.moveTo(px, py);
  }
  X.stroke();
  X.restore();
}

function finalLap(t) {
  const a0 = 35.64, a1 = 37.24;
  if (t < a0 || t > a1 + 0.2) return;
  const inK = eOut(prog(t, a0, a0 + 0.16)), outK = eIn(prog(t, a1, a1 + 0.16));
  const sh = shakeAt(t, 36.85, 0.25, 12, 4);
  X.save();
  X.translate(960 + sh[0], 470 + sh[1]);
  X.rotate(-0.12);
  const bx = (1 - inK) * -2600 + outK * 2600;
  X.translate(bx, 0);
  // The band: white with the logo's blue and orange speed stripes.
  X.fillStyle = '#fff';
  X.fillRect(-1600, -120, 3200, 240);
  X.fillStyle = C.blue;
  X.fillRect(-1600, -150, 3200, 22);
  X.fillStyle = C.orange;
  for (let i = -30; i < 30; i++) {
    X.beginPath();
    const x = i * 110 + ((twos(t) * 600) % 110);
    X.moveTo(x, 128); X.lineTo(x + 80, 128); X.lineTo(x + 66, 152); X.lineTo(x - 14, 152);
    X.fill();
  }
  const tx = (1 - inK) * -700 + outK * 900;
  text('FINAL LAP', tx, 64, { font: 'italic 900 200px "Barlow Condensed"', ls: 14, align: 'center', fill: C.ink });
  text('ファイナルラップ', tx + 560, -76, { font: '34px "Dela Gothic One"', ls: 8, align: 'right', fill: C.blue });
  text('3 / 3', tx - 560, -70, { font: 'italic 800 44px "Barlow Condensed"', ls: 6, fill: C.orange });
  X.restore();
}

async function eyes(t, who, t0) {
  // An eyes-only close-up over manga focus lines: Kite in ink on white,
  // Shrike, the rival, in red on black.
  const rival = who === 'shrike';
  X.fillStyle = rival ? '#07040a' : '#fff';
  X.fillRect(0, 0, W, H);
  focusLines(960, 540, Math.floor(t * 12), { color: rival ? C.red : '#11131c', n: 150, inner: 520, w: 0.01 });
  const band = 380, y = 540 - band / 2;
  X.fillStyle = '#000';
  X.fillRect(0, y - 14, W, band + 28);
  const src = who === 'kite' ? [80, 150, 400, 120] : [110, 142, 400, 79];
  const k = t - t0;
  const s = 1 + k * 0.06;
  X.save();
  X.beginPath();
  X.rect(0, y, W, band);
  X.clip();
  const dw = 1920 * s, dh = (dw * src[3]) / src[2];
  if (rival) X.filter = 'grayscale(1) contrast(1.5) brightness(1.1)';
  pilot(who, src, [960 - dw / 2, 540 - dh / 2, dw, dh], rival);
  X.filter = 'none';
  if (rival) {
    X.globalCompositeOperation = 'multiply';
    X.fillStyle = '#ff3346';
    X.fillRect(0, y, W, band);
  }
  X.restore();
}

async function trio(t) {
  // Solstice, three as one: panels rise in on the beats, a strip across the
  // top left, so the fight under them stays in view.
  const panels = [['kite', 'KITE', 'SUNHAWK', 48.69], ['lark', 'LARK', 'DAYSTAR', 49.09], ['atlas', 'ATLAS', 'RAMPART', 49.46]];
  const out = 51.43;
  X.save();
  X.translate(30, -62);
  X.scale(0.46, 0.46);
  panels.forEach(([who, name, frame, at], i) => {
    const kin = prog(t, at, at + 0.18), kout = prog(t, out + i * 0.06, out + i * 0.06 + 0.16);
    if (kin <= 0 || kout >= 1) return;
    const dy = (1 - eBack(kin)) * 1100 - eIn(kout) * 1200;
    const x = 150 + i * 560, y = 250 + dy, w = 520, h = 640, sk = 70;
    X.save();
    X.beginPath();
    X.moveTo(x + sk, y); X.lineTo(x + w + sk, y); X.lineTo(x + w - sk, y + h); X.lineTo(x - sk, y + h);
    X.closePath();
    X.save();
    X.clip();
    const bg = X.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#0b2a8f');
    bg.addColorStop(1, '#2a6af0');
    X.fillStyle = bg;
    X.fillRect(x - sk, y, w + sk * 2, h);
    pilot(who, [20, 0, 492, 512], [x - 60 + (t - at) * 12, y - 10, 640, 666]);
    const g = X.createLinearGradient(0, y + h - 220, 0, y + h);
    g.addColorStop(0, 'rgba(6,18,70,0)');
    g.addColorStop(1, 'rgba(6,18,70,0.92)');
    X.fillStyle = g;
    X.fillRect(x - sk, y, w + sk * 2, h);
    text(name, x + 10, y + h - 54, { font: 'italic 900 120px "Barlow Condensed"', ls: 4, fill: C.white, strokes: [[16, C.ink]] });
    text(frame, x + 22, y + h - 18, { font: 'italic 700 34px "Barlow Condensed"', ls: 10, fill: C.gold });
    X.restore();
    X.lineWidth = 10;
    X.strokeStyle = '#fff';
    X.stroke();
    X.restore();
    flash('#fff', 0.15 * after(t, at, at + 0.12));
  });
  X.restore();
  // The emblem stamps beside them.
  const ek = prog(t, 50.25, 50.36), eo = prog(t, out, out + 0.15);
  if (ek > 0 && eo < 1) {
    const s = lerp(2, 1, eOut(ek)) * 190 * (1 - eIn(eo));
    X.save();
    X.shadowColor = 'rgba(0,0,0,0.5)';
    X.shadowBlur = 24;
    X.drawImage(ART.solstice, 1000 - s / 2, 200 - s / 2, s, s);
    X.restore();
    glint(1050, 135, 120, prog(t, 50.4, 50.85));
  }
}

function sparkles(t, t0, t1, seed) {
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = r() * H * 0.55, s = lerp(t0, t1, r()), size = 30 + r() * 50;
    glint(x, y, size, prog(t, s, s + 0.35 + r() * 0.2), { spin: 0.8 });
  }
}

function firstPlace(t) {
  const at = 61.23;
  if (t < at) return;
  const k = prog(t, at, at + 0.1);
  X.save();
  X.translate(1380, 470);
  X.rotate(-0.1);
  const s = lerp(2.4, 1, eOut(k));
  X.scale(s, s);
  const g = X.createLinearGradient(0, -170, 0, 40);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.45, C.gold);
  g.addColorStop(1, C.orange);
  text('1ST', 0, 0, { font: 'italic 900 330px "Barlow Condensed"', align: 'center', base: 'middle', fill: g, strokes: [[38, C.ink], [14, '#fff']] });
  text('ウィナー', 0, 150, { font: '46px "Dela Gothic One"', ls: 20, align: 'center', fill: '#fff', strokes: [[12, C.ink]] });
  X.restore();
  glint(1500, 330, 230, prog(t, 61.32, 61.62));
}

function endCard(t, n) {
  const k = prog(t, 66.32, 74.77);
  X.save();
  cover(ART.cover, lerp(1.1, 1.16, eOut(k)), 0.45, 0.5);
  X.restore();
  // The empty sky on the left holds the logo, the line, the modes.
  const lk = prog(t, 67.90, 68.25);
  const pulse = 1 + 0.04 * Math.exp(-Math.max(0, t - 70.82) * 6) * (t > 70.82 ? 1 : 0);
  if (lk > 0) {
    const w = 820 * pulse;
    X.save();
    X.beginPath();
    X.rect(0, 0, 120 + 900 * eOut(lk), H);
    X.clip();
    const L = logoAt(560, 330, w);
    X.restore();
    // A light streak runs across as it appears.
    if (lk < 1) {
      const sx = 120 + 900 * eOut(lk);
      const g = X.createLinearGradient(sx - 120, 0, sx + 20, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.9)');
      X.fillStyle = g;
      X.fillRect(sx - 120, 140, 140, 380);
    }
    glint(L.star[0], L.star[1], 520, prog(t, 70.78, 71.6), { spin: 0.3 });
    glint(L.star[0], L.star[1], 160, prog(t, 68.2, 68.7));
  }
  const tk = prog(t, 68.68, 69.0);
  if (tk > 0) text('WIN THE SKY TOGETHER', 560, 600, { font: 'italic 800 56px "Barlow Condensed"', ls: 10, align: 'center', fill: C.white, strokes: [[12, C.ink]], alpha: eOut(tk) });
  const mk = prog(t, 69.54, 69.9);
  if (mk > 0) {
    const modes = ['GRAND PRIX', 'FREE PLAY', 'ONLINE ROOMS'];
    const font = 'italic 700 38px "Barlow Condensed"';
    const ws = modes.map((m) => measure(m, font, 6)), gap = 64, total = ws.reduce((a, b) => a + b, 0) + gap * 2;
    let x = 560 - total / 2;
    modes.forEach((m, i) => {
      text(m, x, 680, { font, ls: 6, fill: C.gold, strokes: [[9, C.ink]], alpha: eOut(mk) });
      x += ws[i];
      if (i < 2) {
        // The chest diamond between them.
        X.save();
        X.globalAlpha = eOut(mk);
        X.translate(x + gap / 2, 666);
        X.fillStyle = C.cyan;
        X.strokeStyle = C.ink;
        X.lineWidth = 4;
        X.beginPath();
        X.moveTo(0, -14); X.lineTo(8, 0); X.lineTo(0, 14); X.lineTo(-8, 0);
        X.closePath();
        X.stroke();
        X.fill();
        X.restore();
      }
      x += gap;
    });
  }
  // The five teams, under it all.
  ['solstice', 'vanta', 'mirage', 'aurora', 'tempest'].forEach((id, i) => {
    const ek = prog(t, 70.01 + i * 0.07, 70.13 + i * 0.07);
    if (ek <= 0) return;
    const sz = 92 * lerp(1.6, 1, eOut(ek));
    X.save();
    X.globalAlpha = eOut(ek);
    X.shadowColor = 'rgba(0,0,0,0.45)';
    X.shadowBlur = 16;
    X.drawImage(ART[id], 560 + (i - 2) * 112 - sz / 2, 770 - sz / 2, sz, sz);
    X.restore();
  });
  flash('#fff', 0.6 * after(t, 66.32, 66.8) ** 2);
  flash('#fff', 0.35 * after(t, 70.80, 71.1));
  flash('#000', eIO(prog(t, 72.6, 74.6)));
}

// ---- the cut -------------------------------------------------------------------

async function scene(t, n) {
  if (t < 3.27) return boot(t);
  if (t < 13.27) {
    if (t < 6.43) await foot('s02', t, { grade: 'night' });
    else if (t < 9.61) await foot('c03', t, { grade: 'night' });
    else await foot('s04', t, { grade: 'night' });
    glint(EYE[0], EYE[1], 130, prog(t, 11.95, 12.3), { tint: 'rgba(120,255,255,0.5)' });
    glint(EYE[0], EYE[1], 170, prog(t, 12.56, 12.95), { tint: 'rgba(120,255,255,0.5)' });
    flash('#fff', 0.9 * after(t, 3.27, 3.45) ** 2);
    flash('#fff', 0.35 * after(t, 6.43, 6.53));
    flash('#fff', 0.35 * after(t, 9.61, 9.71));
    flash('#fff', prog(t, 13.12, 13.27) ** 2);
    return;
  }
  if (t < 15.14) {
    // The three circuits, a caption each.
    const cut = t < 13.96 ? ['s05b', 13.27] : t < 14.55 ? ['v_hel', 13.96] : ['v_mer', 14.55];
    await foot(cut[0], t, { from: cut[1], zoom: 1.02 + 0.03 * prog(t, cut[1], cut[1] + 0.6) });
    if (t < 13.96) circuitCard(t, 13.31, 'CORKSCREW CANYON', 'コークスクリュー・キャニオン');
    else if (t < 14.55) circuitCard(t, 13.98, 'HELIOS DROP', 'ヘリオス・ドロップ');
    else circuitCard(t, 14.57, 'MERIDIAN SKYWAY', 'メリディアン・スカイウェイ');
    flash('#fff', after(t, 13.27, 13.4));
    flash('#fff', 0.5 * after(t, 13.96, 14.06));
    flash('#fff', 0.5 * after(t, 14.55, 14.65));
    return;
  }
  if (t < 19.23) {
    title(t);
    // Out on a diagonal wipe into the grid.
    const wk = prog(t, 19.06, 19.23);
    if (wk > 0) {
      X.save();
      X.fillStyle = C.navy;
      X.beginPath();
      const x = lerp(-600, W + 600, eIn(wk));
      X.moveTo(x - 1400, 0); X.lineTo(x + 300, 0); X.lineTo(x - 100, H); X.lineTo(x - 1800, H);
      X.fill();
      X.restore();
    }
    return;
  }
  if (t < 22.24) {
    await foot('s07', t);
    // In from the wipe.
    const wk = prog(t, 19.23, 19.4);
    if (wk < 1) {
      X.fillStyle = C.navy;
      X.beginPath();
      const x = lerp(0, W + 1800, eOut(wk));
      X.moveTo(x - 1400, 0); X.lineTo(W + 600, 0); X.lineTo(W + 600, H); X.lineTo(x - 1800, H);
      X.fill();
    }
    streaks(80, H - 300, twos(t), 21, { color: 'rgba(255,240,230,0.22)', n: 14, len: 900, th: 2, speed: 3000, dir: -1 });
    return;
  }
  if (t < 25.40) {
    const cd = [[22.24, 's08a', 'three', 0.52], [23.03, 's08b', 'two', 0.52], [23.82, 's08c', 'one', 0.52], [24.61, 's08d', 'go', 0.68]];
    let cur = cd[0];
    for (const c of cd) if (t >= c[0]) cur = c;
    const [b, id, num, size] = cur;
    await foot(id, t);
    const k = t - b, go = num === 'go';
    // The lamp: the frame washes red on the beat (white on GO).
    X.save();
    X.globalCompositeOperation = 'screen';
    X.fillStyle = go ? 'rgba(200,250,255,1)' : 'rgba(255,40,50,1)';
    X.globalAlpha = (go ? 0.8 : 0.55) * (1 - prog(k, 0, 0.3));
    X.fillRect(0, 0, W, H);
    X.restore();
    if (go) focusLines(960, 540, Math.floor(t * 12), { color: '#fff', alpha: 0.7 * (1 - prog(k, 0.1, 0.6)), n: 90 });
    const im = ART[num];
    const sc = (k < 0.09 ? lerp(1.8, 1, eOut(k / 0.09)) : 1 + 0.03 * (k - 0.09)) * (1 + eIn(prog(k, 0.66, 0.79)) * 0.3);
    const h = H * size * sc, w = (h * im.width) / im.height;
    X.save();
    X.globalAlpha = 1 - prog(k, 0.68, 0.79);
    X.shadowColor = 'rgba(0,0,0,0.5)';
    X.shadowBlur = 30;
    X.drawImage(im, 960 - w / 2, 490 - h / 2, w, h);
    X.restore();
    return;
  }
  if (t < 28.56) {
    await portraits(t);
    flash('#fff', prog(t, 28.44, 28.56) ** 2);
    return;
  }
  if (t < 32.51) {
    // The start, then the other teams at it, a cut each two beats.
    const cut = t < 30.14 ? 's10a' : t < 30.93 ? 'f1' : t < 31.72 ? 'f2' : 'f3';
    await foot(cut, t);
    if (cut === 'f1') matchChip(t, 30.16, 'mirage', 'aurora');
    if (cut === 'f2') matchChip(t, 30.95, 'aurora', 'tempest');
    if (cut === 'f3') matchChip(t, 31.74, 'tempest', 'mirage');
    flash('#fff', 0.5 * after(t, 28.56, 28.7));
    for (const c of [30.14, 30.93, 31.72]) flash('#fff', 0.4 * after(t, c, c + 0.1));
    return;
  }
  if (t < 35.64) {
    await foot('p1', t);
    flash('#fff', 0.3 * after(t, 32.51, 32.61));
    return;
  }
  if (t < 38.82) {
    // A slow push in on the long lens, toward Kite in the distance.
    const z = 1 + 0.22 * eIO(prog(t, 36.6, 38.82));
    await foot('s12', t, { zoom: z, dx: -0.06 * (W - W * z) });
    finalLap(t);
    return;
  }
  if (t < 41.98) {
    // Faster and faster: faces and hands, then the eyes.
    if (t < 41.17) {
      const id = t < 39.61 ? 's13a' : t < 40.40 ? 's13b' : t < 40.80 ? 'i1' : 'i2';
      await foot(id, t, { zoom: 1 + 0.06 * prog(t, shots[id].v0, shots[id].v1) });
      flash('#fff', 0.35 * after(t, shots[id].v0, shots[id].v0 + 0.1));
      return;
    }
    if (t < 41.59) {
      await eyes(t, 'kite', 41.17);
      flash('#fff', after(t, 41.17, 41.3));
      return;
    }
    await eyes(t, 'shrike', 41.59);
    flash('#fff', 0.8 * after(t, 41.59, 41.68));
    return;
  }
  if (t < 44.72) {
    // THE PUNCH.
    await foot(t < shots.s14b.v0 ? 's14a' : 's14b', t, { zoom: 1.04 });
    const k = prog(t, 41.98, 42.77);
    if (k < 1) {
      focusLines(960, 560, Math.floor(t * 12), { color: '#fff', alpha: 0.85 * (1 - prog(t, 42.3, 42.77)), n: 120, inner: 380 });
      const s = (t < 42.1 ? lerp(2.8, 1, eOut(prog(t, 41.98, 42.1))) : 1 + 0.04 * (t - 42.1)) * (1 + 2.2 * eIn(prog(t, 42.62, 42.77)));
      X.save();
      X.globalAlpha = 1 - prog(t, 42.64, 42.77);
      X.translate(960, 520);
      X.transform(1, 0, -0.18, 1, 0, 0);
      X.scale(s, s);
      text('走れ', 0, 0, { font: '470px "Dela Gothic One"', align: 'center', base: 'middle', fill: '#fff', strokes: [[64, C.ink], [34, C.red], [10, '#fff']] });
      X.restore();
    }
    flash('#fff', 0.9 * after(t, 41.98, 42.12));
    flash('#fff', 0.45 * after(t, shots.s14b.v0, shots.s14b.v0 + 0.13));
    return;
  }
  if (t < 47.51) {
    await foot(t < 46.32 ? 's15a' : 's15b', t);
    if (t < 46.32) sparkles(t, 44.75, 46.2, 31);
    flash('#fff', 0.4 * after(t, 44.72, 44.85));
    flash('#fff', 0.3 * after(t, 46.32, 46.42));
    return;
  }
  if (t < 51.83) {
    await foot('t1', t);
    await trio(t);
    flash('#fff', 0.3 * after(t, 47.51, 47.6));
    return;
  }
  if (t < 56.15) {
    const id = t < 54.57 ? 'k1' : 's17c';
    await foot(id, t);
    // The knockout: while the game holds the frame as a painted still, the word goes on it.
    if (id === 'k1') koStamp(t, KO_AT);
    if (id === 's17c') sparkles(t, 54.6, 56.0, 53);
    flash('#fff', 0.4 * after(t, shots[id].v0, shots[id].v0 + 0.1));
    return;
  }
  if (t < 61.63) {
    if (t < 58.10) await foot('s18a', t);
    else if (t < 60.84) await foot('s18b', t);
    else {
      // Across the line: the frame held, printed in hard colour, the place stamped on it.
      const held = t >= 61.23;
      await foot('s18c', t, held ? { freeze: FINISH_FRAME, filter: 'contrast(1.35) saturate(1.35)' } : {});
      if (held) focusLines(960, 540, 4, { color: 'rgba(255,255,255,0.85)', n: 80, inner: 520 });
      firstPlace(t);
      flash('#fff', after(t, 61.23, 61.4));
    }
    flash('#fff', 0.35 * after(t, 56.15, 56.27));
    flash('#fff', 0.3 * after(t, 58.10, 58.2));
    return;
  }
  if (t < 66.32) {
    await foot('s19', t, { filter: 'saturate(1.12) contrast(1.05)' });
    // Up into the new sky: stars come out.
    if (t > 64.6) sparkles(t, 64.7, 66.0, 91);
    flash('#fff', 0.5 * after(t, 61.63, 61.8));
    // Into the sky, and through it to the painting.
    flash('#fff', 0.85 * eIn(prog(t, 65.8, 66.32)));
    return;
  }
  return endCard(t, n);
}

// Where the Sunhawk's eye is in s04 (for its glints), and the finish frame to hold.
const EYE = (q.get('eye') ?? '866,372').split(',').map(Number);
const FINISH_FRAME = +(q.get('finish') ?? 9);
// When the knockout's painted still comes up in k1 (its frame 42).
const KO_AT = 51.83 + 42 / 24;

window.renderFrame = async (n) => {
  const t = n / FPS;
  reset();
  X.fillStyle = '#000';
  X.fillRect(0, 0, W, H);
  // The whole picture shakes on the big hits.
  const shakes = [[KO_AT, 0.35, 16], [15.14, 0.4, 16], [41.98, 0.6, 22], [43.17, 0.25, 10], [61.23, 0.3, 12], [70.82, 0.3, 8]];
  let sx = 0, sy = 0;
  for (const [a, d, amp] of shakes) {
    const [x, y] = shakeAt(t, a, d, amp, a);
    sx += x;
    sy += y;
  }
  X.save();
  if (sx || sy) {
    X.translate(W / 2 + sx, H / 2 + sy);
    X.scale(1.03, 1.03);
    X.translate(-W / 2, -H / 2);
  }
  await scene(t, n);
  X.restore();
  reset();
  lyrics(t);
  grainPass(n, t < 3.27 ? 0.1 : 0.06);
  return t;
};
window.compReady = true;

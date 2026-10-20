// A race with a circuit's recorded song (?music=suno), in headless Chromium:
// checks that the song loads, comes in lap by lap on bar lines, loops, and
// goes to its ending at the finish, that the synthesised music's stingers
// and jingles stay out of it, and measures each layer's level on each lap
// from the page's own audio graph.
//
//   URL=http://127.0.0.1:8090/ node tools/song-check.mjs [skip seconds, default 70]
//   TRACK=canyon ...   another circuit with a song (default meridian)
//
// Needs the game served (npm run build, then npm start; or the dev server).
// The computer flies the player's mech; skip starts the race that far in, so
// the lap changes come sooner (the song still starts from its top). The
// results are held back 12 s after the race ends, as when the player is over
// the line before the others, so the song's ending plays out on the race
// screen and the menu music has to take over from it.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const base = process.env.URL ?? 'http://127.0.0.1:8090/';
const skip = Number(process.argv[2] ?? 70);
const track = process.env.TRACK ?? 'meridian';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || /\[audio\]/.test(m.text())) problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  FAIL', what); if (!ok) problems.push('check failed: ' + what); };

await page.goto(`${base}?auto=FW&demo=1&seed=7&track=${track}&music=suno&skip=${skip}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.game !== undefined, null, { timeout: 180000 });
// Software rendering is slow: draw nothing, so the race runs at its own pace.
await page.evaluate(() => { const r = window.game.renderer; r.render = () => {}; });
await page.evaluate(() => window.game.audio.unlock());
// Every sound the game asks for, to see which cues it leaves out over the song.
await page.evaluate(() => {
  const a = window.game.audio;
  const play = a.play.bind(a);
  window.__played = [];
  a.play = (name, opts) => {
    window.__played.push(name);
    play(name, opts);
  };
});
const t0 = Date.now();
// (The race's song: the menus and the results can have songs of their own now.)
await page.waitForFunction(() => { const m = window.game.audio.debugInfo().music; return m?.name === 'race' && m.song?.state === 'playing'; }, null, { timeout: 120000 });
const first = await page.evaluate(() => window.game.audio.debugInfo().music.song);
console.log(`song playing ${((Date.now() - t0) / 1000).toFixed(1)} s after the audio started; decoded at ${first.rate} Hz, decoder ${first.shiftMs} ms off ffmpeg's`);
// Chromium's decoders start on ffmpeg's sample: anything else here is the check itself going wrong.
check(first.shiftMs === 0, "the decoder check finds this browser starting the audio where ffmpeg does");

// Meters on each layer, read in the page.
await page.evaluate(() => {
  const a = window.game.audio;
  const ctx = a.context;
  const meters = {};
  for (const [k, node] of Object.entries(a.debugTaps())) {
    if (!k.startsWith('music.')) continue;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    node.connect(an);
    meters[k.slice(6)] = an;
  }
  const buf = new Float32Array(2048);
  const spec = new Float32Array(1024);
  window.__meter = () => {
    const out = {};
    for (const [k, an] of Object.entries(meters)) {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      an.getFloatFrequencyData(spec);
      // Share of the layer's energy above 2 kHz.
      let hi = 0, lo = 0, all = 0;
      for (let i = 1; i < spec.length; i++) { const e = 10 ** (spec[i] / 10); all += e; if ((i * ctx.sampleRate) / 2048 > 2000) hi += e; }
      for (let i = 1; i < spec.length; i++) if ((i * ctx.sampleRate) / 2048 < 250) lo += 10 ** (spec[i] / 10);
      out[k] = { rms: s / buf.length, hi: all > 0 ? hi / all : 0, lo: all > 0 ? lo / all : 0 };
    }
    return out;
  };
});

const samples = [];
const lapAt = {};
let finishAt = null;
let menuAt = null;
let resultsAt = null;
const manifest = await page.evaluate((t) => fetch(`music/${t}/song.json`).then((r) => r.json()), track);
// The race stingers in the song's own keys, if it has them, while it plays.
const keys = await page.evaluate(() => window.game.audio.stingerKey?.() ?? null);
check(JSON.stringify(keys) === JSON.stringify(manifest.stingers ?? null), `the stingers in the song's keys (${JSON.stringify(keys)})`);
let lastPhase = null;
for (let i = 0; i < 3000; i++) {
  const s = await page.evaluate(() => {
    const g = window.game;
    const race = g.session.race;
    const me = race.mechs[g.session.localId];
    const d = g.audio.debugInfo();
    return { state: g.state, time: d.time, lapPhase: race.lapPhase, finished: me.finished, over: race.phase === 2, music: d.music, meter: window.__meter() };
  });
  samples.push(s);
  if (s.lapPhase !== lastPhase) {
    if (lastPhase !== null) lapAt[s.lapPhase] = s.time;
    lastPhase = s.lapPhase;
  }
  // Over for the player as the game tells the music: finished, or the race is over.
  if ((s.finished || s.over) && finishAt === null) {
    finishAt = s.time;
    // Hold the results back, as when the player is over the line and the
    // others are still racing: the song's ending plays out on the race screen.
    await page.evaluate(() => { const g = window.game; const hold = () => { if (g.resultsAt > 0) g.resultsAt = g.time + 12; else setTimeout(hold, 50); }; hold(); });
  }
  if (s.music?.name === 'menu' && menuAt === null) menuAt = s.time;
  if (s.state === 'results' && resultsAt === null) resultsAt = s.time;
  // On a little into the results (or well past the song's end, if they are slow to come).
  if ((resultsAt !== null && s.time > resultsAt + 2) || (finishAt !== null && s.time > finishAt + 20)) break;
  await page.waitForTimeout(200);
}
const last = samples.findLast((s) => s.music?.name === 'race' && s.music?.song) ?? samples[samples.length - 1];
const log = last.music?.song?.log ?? [];
console.log('\nwhat the song did (audio clock):');
for (const e of log) console.log(`  ${e.at.toFixed(3).padStart(8)}  ${e.what}${e.bar >= 0 ? `, bar ${e.bar}` : ''}`);
console.log('the race: ' + Object.entries(lapAt).map(([p, t]) => `lap phase ${p} at ${t.toFixed(2)}`).join(', ') + (finishAt ? `, over for the player at ${finishAt.toFixed(2)}` : ', not over'));

// Each lap's layers heard on the beat after the lap change (and only just after).
const barMax = Math.max(...manifest.bars.slice(1).map((b, i) => b - manifest.bars[i]));
for (const [p, t] of Object.entries(lapAt)) {
  const e = log.find((x) => x.what === `lap ${p}`);
  // (Polled every 200 ms: allow for that.)
  check(!!e && e.at >= t - 0.25 && e.at <= t + 0.05 + barMax / 4 + 0.25, `lap ${p} comes in on the beat as the lap changes (${e ? (e.at - t).toFixed(2) + ' s after' : 'never'})`);
}
// A song with a finale jumps to it after lap 3's layers, on its bar line (a finale with a phrase: that phrase's first).
if (manifest.finale && lapAt[3] !== undefined) {
  const l3 = log.find((x) => x.what === 'lap 3');
  const fi = log.find((x) => x.what === 'finale');
  const wait = manifest.finale.phrase ? manifest.finale.phrase.bars : 1;
  check(!!l3 && !!fi && fi.at >= l3.at - 1e-6 && fi.at <= l3.at + 0.3 + barMax * wait + 0.05, `lap 3 goes on to the finale on the bar line after (${fi && l3 ? (fi.at - l3.at).toFixed(2) + ' s after, bar ' + fi.bar : 'never'})`);
}
if (finishAt) {
  const e = log.find((x) => x.what === 'ending');
  // Once the ending has played out, music again: the menu music, before the
  // results if they are slow to come, or with them.
  if (e) {
    const songEnd = e.at + (manifest.end - manifest.ending);
    const gap = menuAt === null ? Infinity : menuAt - songEnd;
    console.log(`the song ended at ${songEnd.toFixed(2)}, the menu music came in at ${menuAt?.toFixed(2) ?? 'never'}, the results at ${resultsAt?.toFixed(2) ?? 'never'}`);
    check(gap >= 0 && gap <= 1.5 && (resultsAt === null || menuAt < resultsAt), `the menu music within moments of the song's end, on the race screen (${gap === Infinity ? 'never' : gap.toFixed(2) + ' s after'})`);
  }
  // (finishAt is when this check saw it, polling every 200 ms; the engine
  // sees it on the frame, and can queue the ending 0.12 s on, before that.)
  check(!!e && e.at >= finishAt - 0.25 && e.at <= finishAt + 0.12 + barMax + 0.25, `the ending starts on a bar line within a bar of the finish (${e ? (e.at - finishAt).toFixed(2) + ' s after' : 'never'})`);
}

// Over a song, the synthesised music's stingers and jingles are left out
// (the song marks those moments itself); the lap chime is not.
const played = await page.evaluate(() => window.__played);
const musical = played.filter((n) => ['lap_phase', 'final_lap', 'finish', 'win', 'lose'].includes(n));
check(musical.length === 0, `no stingers or jingles over the song (${musical.join(', ') || 'none played'})`);
const chimes = played.filter((n) => n === 'lap').length;
check(chimes > 0, `the lap chime still plays as the player's laps count (${chimes})`);

// Levels: each layer by lap, from the meters (mean power over each stretch, in dB).
const dB = (p) => (p > 1e-12 ? (10 * Math.log10(p)).toFixed(1) : '  -  ');
const stretch = (from, to) => samples.filter((s) => s.music?.name === 'race' && s.music?.song && s.time > from && s.time < to && s.meter);
const changes = Object.fromEntries(log.filter((x) => /^lap|^ending/.test(x.what)).map((x) => [x.what, x.at]));
const spans = [
  ['lap 1', samples.find((s) => s.music?.name === 'race' && s.music?.song?.state === 'playing')?.time ?? 0, changes['lap 2'] ?? Infinity],
  ['lap 2', changes['lap 2'] ?? Infinity, changes['lap 3'] ?? Infinity],
  ['lap 3', changes['lap 3'] ?? Infinity, changes.ending ?? Infinity],
  ['ending', changes.ending ?? Infinity, (changes.ending ?? Infinity) + 7.5],
];
const layers = Object.keys(samples.find((s) => s.meter && Object.keys(s.meter).length)?.meter ?? {});
console.log('\neach layer, by lap (dB, as the meters read it; drums: share of their energy below 250 Hz and above 2 kHz)');
console.log('         ' + layers.map((l) => l.padStart(8)).join(''));
const table = {};
for (const [name, a, b] of spans) {
  const ss = stretch(a + 0.3, b - 0.1);
  if (!ss.length) continue;
  const row = {};
  for (const l of layers) row[l] = ss.reduce((acc, s) => acc + s.meter[l].rms, 0) / ss.length;
  const hi = ss.reduce((acc, s) => acc + (s.meter.drums?.hi ?? 0), 0) / ss.length;
  const lo = ss.reduce((acc, s) => acc + (s.meter.drums?.lo ?? 0), 0) / ss.length;
  table[name] = { ...row, hi, lo };
  console.log(name.padEnd(9) + layers.map((l) => dB(row[l]).padStart(8)).join('') + `   ${(lo * 100).toFixed(1)}% / ${(hi * 100).toFixed(1)}%`);
}
// Each lap plays the layers song.json has on for it, and only those.
for (const [lap, name] of [[1, 'lap 1'], [2, 'lap 2'], [3, 'lap 3']]) {
  if (!table[name]) continue;
  const on = layers.filter((l) => manifest.laps[l]?.[lap - 1] !== null);
  const off = layers.filter((l) => manifest.laps[l]?.[lap - 1] === null);
  check(on.every((l) => table[name][l] > 1e-6) && off.every((l) => table[name][l] < 1e-9), `${name}: ${on.join(', ')} play${off.length ? `, not ${off.join(', ')}` : ''}`);
}
// A layer heard through a high-pass on some laps has no low end there.
const f = manifest.filter;
if (f?.type === 'highpass' && f.layer === 'drums' && table['lap 1'] && table['lap 2']) check(table['lap 1'].lo < 0.01 && table['lap 2'].lo > 0.2, 'lap 2: the kick drops in (none on lap 1)');
if (table.ending) check(layers.every((l) => table.ending[l] > 1e-7), 'the ending: everything plays');

await browser.close();
if (problems.length) {
  console.log('\nProblems:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('\nAll good.');

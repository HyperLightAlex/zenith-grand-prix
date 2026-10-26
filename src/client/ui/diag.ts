// A readout for testing on a device (?diag=1): how fast the game draws, how
// long its worst frames take, and what the sound is doing, with a short log
// of what went wrong and when (also written to the console as [diag], for
// remote debugging). For finding out, on a handheld, whether music cutting
// out comes with the frames stalling, the audio being suspended, or neither.

import type { AudioEngine } from '../audio/audio';
import type { SongSource } from '../audio/song';

interface DiagAudio {
  debugInfo?: () => { state: string; music: { name: string; style?: string; song?: { state: string; pos: number; log: Array<{ what: string }> } } | null };
  debugSongs?: () => ReadonlyMap<string, SongSource>;
  context?: BaseAudioContext | null;
}

interface DiagGame {
  renderer: { render: (dt: number, now: number) => void };
}

export function startDiagnostics(game: DiagGame, audio: AudioEngine, canvas: HTMLCanvasElement): void {
  const box = document.createElement('div');
  box.className = 'diag';
  Object.assign(box.style, {
    position: 'fixed',
    left: '4px',
    top: '40%',
    zIndex: '100000',
    font: '11px/1.35 ui-monospace, monospace',
    color: '#d8f4ff',
    background: 'rgba(0, 0, 0, 0.62)',
    padding: '4px 6px',
    whiteSpace: 'pre',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(box);

  const t0 = performance.now();
  const secs = (t: number) => ((t - t0) / 1000).toFixed(1);
  const events: string[] = [];
  const note = (what: string) => {
    const line = `${secs(performance.now())} s  ${what}`;
    events.push(line);
    if (events.length > 6) events.shift();
    console.log('[diag]', line);
  };

  // Frames drawn (the renderer's), and animation frames (the screen's).
  let drawn = 0;
  let lastDraw = 0;
  let worst = 0;
  let worstSince = performance.now();
  let long = 0;
  const r = game.renderer;
  const draw = r.render.bind(r);
  r.render = (dt: number, now: number) => {
    const t = performance.now();
    if (lastDraw > 0) {
      const gap = t - lastDraw;
      worst = Math.max(worst, gap);
      if (gap > 100) long++;
      if (gap > 1000) note(`no frame drawn for ${(gap / 1000).toFixed(1)} s`);
    }
    lastDraw = t;
    drawn++;
    draw(dt, now);
  };
  let ticks = 0;
  const tick = () => {
    ticks++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Main-thread tasks over 50 ms, where the browser reports them.
  let tasks = 0;
  let taskMs = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        tasks++;
        taskMs += e.duration;
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* not reported here */
  }
  canvas.addEventListener('webglcontextlost', () => note('graphics context lost'));
  canvas.addEventListener('webglcontextrestored', () => note('graphics context back'));
  document.addEventListener('visibilitychange', () => note(document.hidden ? 'page hidden' : 'page shown'));

  const a = audio as unknown as DiagAudio;
  let lastState = '';
  let lastResumes = 0;
  let lastMusic = '';
  let lastAt = performance.now();
  let lastDrawn = 0;
  let lastTicks = 0;
  setInterval(() => {
    const now = performance.now();
    const span = (now - lastAt) / 1000;
    const fps = Math.round((drawn - lastDrawn) / span);
    const hz = Math.round((ticks - lastTicks) / span);
    lastAt = now;
    lastDrawn = drawn;
    lastTicks = ticks;
    if (now - worstSince > 5000) {
      worstSince = now;
      worst = 0;
    }
    const lines = [`drawn ${fps} a second, screen ${hz} Hz`, `worst frame ${Math.round(worst)} ms (5 s), over 100 ms: ${long}`];
    const info = a.debugInfo?.();
    if (info) {
      const ctx = a.context as AudioContext | null | undefined;
      const lat = ctx && 'outputLatency' in ctx ? `, out ${Math.round(((ctx.baseLatency ?? 0) + (ctx.outputLatency ?? 0)) * 1000)} ms` : '';
      lines.push(`audio ${info.state}${ctx ? `, ${ctx.sampleRate} Hz` : ''}${lat}`);
      if (info.state !== lastState) {
        if (lastState) note(`audio ${lastState} -> ${info.state}`);
        lastState = info.state;
      }
      const m = info.music;
      const song = m?.song;
      if (m && song) {
        const src = a.debugSongs?.().get(m.style ?? '') ?? null;
        const bufs = src?.buffers ?? [];
        const have = bufs.filter((b) => b).length;
        const rate = bufs.find((b) => b)?.sampleRate;
        const resumes = song.log.filter((e) => e.what === 'resume').length;
        lines.push(`music ${m.name} ${m.style ?? ''}: ${song.state}${song.pos >= 0 ? ` ${song.pos.toFixed(1)} s` : ''}${src ? `, layers ${have}/${bufs.length}${rate ? ` at ${rate / 1000} kHz` : ''}` : ''}`);
        if (resumes > lastResumes) note('music fell behind and picked up again');
        lastResumes = resumes;
      } else lines.push(`music ${m ? m.name : 'none'}`);
      const now2 = `${m?.name ?? ''} ${m?.style ?? ''} ${song?.state ?? ''}`;
      if (now2 !== lastMusic) {
        lastMusic = now2;
        lastResumes = 0;
      }
    }
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    lines.push(`${mem ? `script heap ${Math.round(mem.usedJSHeapSize / 1e6)} MB, ` : ''}long tasks ${tasks} (${(taskMs / 1000).toFixed(1)} s)`);
    box.textContent = [...lines, ...events].join('\n');
  }, 500);
  note('diagnostics on');
}

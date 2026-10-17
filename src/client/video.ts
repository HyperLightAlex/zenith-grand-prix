// Video settings: what a player can change about the picture, remembered on
// this device. The drawings a second live with the look's tuning
// (lookSteps), so the tuning panel and this agree; the rest live here.
//
//   panels  the panel lines on the mechs' armor
//   crt     the CRT screen: a pass on the 3D picture (render/lookPasses.ts)
//           and a layer of scanlines, phosphor mask and vignette over
//           everything (.crt-layer in styles.css)
//   aspect  'wide' fills the window; 'classic' is a 4:3 picture boxed in it,
//           the HUD and the menus with it
//   resolution  how sharp the 3D picture is drawn: full, or a share of it
//           for a slow device, or 'auto' (lowered and raised with the frame
//           rate). The player's choice: the game never lowers it unasked.
//
// And the frame: the part of the window the picture, the HUD and the menus
// fill (the whole window, or the 4:3 box), how big the interface's type is in
// it, and which layout fits it. Every layout rule in styles.css keys off the
// classes set here, never off the window, so a 4:3 picture on a wide screen
// and a 4:3 screen get the same layout.

export type Aspect = 'wide' | 'classic';

/** How sharp the 3D picture is drawn (see RESOLUTIONS). */
export type Resolution = 'full' | 'high' | 'medium' | 'low' | 'auto';

/** The choices, in the order the setting steps through them: share of full resolution ('auto': follows the frame rate). */
export const RESOLUTIONS: ReadonlyArray<{ id: Resolution; label: string; scale: number | 'auto' }> = [
  { id: 'full', label: 'Full', scale: 1 },
  { id: 'high', label: '85%', scale: 0.85 },
  { id: 'medium', label: '70%', scale: 0.7 },
  { id: 'low', label: '55%', scale: 0.55 },
  { id: 'auto', label: 'Automatic', scale: 'auto' },
];

export interface VideoSettings {
  panels: boolean;
  crt: boolean;
  aspect: Aspect;
  resolution: Resolution;
}

const KEY = 'zgp.video';
const DEFAULTS: VideoSettings = { panels: true, crt: false, aspect: 'wide', resolution: 'full' };

function load(): VideoSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<VideoSettings>;
    return {
      panels: typeof v.panels === 'boolean' ? v.panels : DEFAULTS.panels,
      crt: typeof v.crt === 'boolean' ? v.crt : DEFAULTS.crt,
      aspect: v.aspect === 'classic' ? 'classic' : 'wide',
      resolution: RESOLUTIONS.some((r) => r.id === v.resolution) ? (v.resolution as Resolution) : DEFAULTS.resolution,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const video: VideoSettings = load();

export function saveVideo(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(video));
  } catch {
    /* private window: kept for this visit */
  }
}

/** The interface's type: 1.75% of the frame's short side, never under 11 px (readable on a phone) or over 24. */
export const EM_SHARE = 0.0175;
export const EM_MIN = 11;
export const EM_MAX = 24;
/**
 * The roomy layouts are drawn for a frame about 57 lines of type tall (the
 * short side over the type size). Below this many there is not room for
 * them: phones, handhelds and short windows get the compact layouts.
 */
export const COMPACT_LINES = 52;
/** ...and frames narrower than this many type sizes (a tablet or a window held upright). */
export const COMPACT_WIDTH = 62;

export interface Frame {
  /** The frame in the window, CSS pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The interface's type size, CSS pixels. */
  em: number;
  /** Width over height of 4:3 or less: the narrow layouts. */
  narrow: boolean;
  /** Not room for the roomy layouts. */
  compact: boolean;
  /** Taller than wide: the menus stack in one column; a race asks to be turned sideways on a phone. */
  portrait: boolean;
  /**
   * How the menus lay out their panes: as drawn (roomy and wide), side by
   * side columns that each scroll (a phone sideways, a 4:3 tablet), or one
   * column that scrolls (a handheld's 4:3 screen, a phone upright).
   */
  layout: 'roomy' | 'cols' | 'single';
  /** The screen's own unsafe edges (a notch, rounded corners), as they fall inside the frame. */
  safe: { l: number; r: number; t: number; b: number };
}

export const frame: Frame = { x: 0, y: 0, w: 1280, h: 720, em: 12.6, narrow: false, compact: false, portrait: false, layout: 'roomy', safe: { l: 0, r: 0, t: 0, b: 0 } };

const listeners: Array<(f: Frame) => void> = [];

/** Called whenever the frame changes (the window, the orientation, the 4:3 setting). */
export function onFrame(fn: (f: Frame) => void): void {
  listeners.push(fn);
}

let probe: HTMLElement | null = null;

/** The screen's unsafe edges: env(safe-area-inset-*) read off an element padded with them. */
function safeInsets(): { l: number; r: number; t: number; b: number } {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
}

/** The frame and its layout for a window this size (pure: the tests use it). */
export function frameFor(winW: number, winH: number, aspect: Aspect, screenSafe = { l: 0, r: 0, t: 0, b: 0 }): Frame {
  const W = Math.max(1, winW);
  const H = Math.max(1, winH);
  // The 4:3 box is a landscape picture: on a window held upright the menus
  // fill it instead (a race there asks to be turned sideways).
  const boxed = aspect === 'classic' && W >= H;
  const w = boxed ? Math.min(W, (H * 4) / 3) : W;
  const h = boxed ? Math.min(H, (W * 3) / 4) : H;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  const em = Math.min(EM_MAX, Math.max(EM_MIN, EM_SHARE * Math.min(w, h)));
  const ratio = w / h;
  const narrow = ratio <= 4 / 3 + 1e-3;
  const compact = Math.min(w, h) / em < COMPACT_LINES || w / em < COMPACT_WIDTH;
  const portrait = ratio < 0.95;
  return {
    x,
    y,
    w,
    h,
    em,
    narrow,
    compact,
    portrait,
    layout: portrait || (compact && narrow) ? 'single' : compact || narrow ? 'cols' : 'roomy',
    safe: {
      l: Math.max(0, screenSafe.l - x),
      r: Math.max(0, screenSafe.r - x),
      t: Math.max(0, screenSafe.t - y),
      b: Math.max(0, screenSafe.b - y),
    },
  };
}

/** The page's frame from the settings and the window: its box, its type size and its layout classes. */
export function applyFrame(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const f = frameFor(window.innerWidth, window.innerHeight, video.aspect, safeInsets());
  Object.assign(frame, f);
  const boxed = f.w < window.innerWidth - 0.5 || f.h < window.innerHeight - 0.5;
  root.classList.toggle('aspect-43', boxed);
  root.classList.toggle('crt-on', video.crt);
  root.classList.toggle('narrow', f.narrow);
  root.classList.toggle('compact', f.compact);
  root.classList.toggle('portrait', f.portrait);
  root.classList.toggle('lay-cols', f.layout === 'cols');
  root.classList.toggle('lay-single', f.layout === 'single');
  const s = root.style;
  s.setProperty('--fx', `${f.x}px`);
  s.setProperty('--fy', `${f.y}px`);
  s.setProperty('--fw', `${f.w}px`);
  s.setProperty('--fh', `${f.h}px`);
  s.setProperty('--ui-em', `${f.em.toFixed(2)}px`);
  s.setProperty('--sl', `${f.safe.l}px`);
  s.setProperty('--sr', `${f.safe.r}px`);
  s.setProperty('--st', `${f.safe.t}px`);
  s.setProperty('--sb', `${f.safe.b}px`);
  for (const fn of listeners) fn(frame);
}

let installed = false;

/** Once, at start: the CRT layer, and the frame kept in step with the window. */
export function installFrame(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const layer = document.createElement('div');
  layer.className = 'crt-layer';
  document.body.append(layer);
  window.addEventListener('resize', applyFrame);
  // Turning a phone: some browsers report the new size a moment after the event.
  window.addEventListener('orientationchange', () => {
    applyFrame();
    setTimeout(applyFrame, 250);
  });
  applyFrame();
}

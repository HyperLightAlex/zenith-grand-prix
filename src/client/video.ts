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

export type Aspect = 'wide' | 'classic';

export interface VideoSettings {
  panels: boolean;
  crt: boolean;
  aspect: Aspect;
}

const KEY = 'zgp.video';
const DEFAULTS: VideoSettings = { panels: true, crt: false, aspect: 'wide' };

function load(): VideoSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<VideoSettings>;
    return {
      panels: typeof v.panels === 'boolean' ? v.panels : DEFAULTS.panels,
      crt: typeof v.crt === 'boolean' ? v.crt : DEFAULTS.crt,
      aspect: v.aspect === 'classic' ? 'classic' : 'wide',
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

/**
 * The page's frame from the settings: the 4:3 box, the CRT layer, and the
 * narrow layouts, which are for any frame 4:3 or narrower (a 4:3 picture, or
 * a narrow window).
 */
export function applyFrame(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('aspect-43', video.aspect === 'classic');
  root.classList.toggle('crt-on', video.crt);
  const ratio = video.aspect === 'classic' ? 4 / 3 : window.innerWidth / Math.max(1, window.innerHeight);
  root.classList.toggle('narrow', ratio <= 4 / 3 + 1e-3);
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
  applyFrame();
}

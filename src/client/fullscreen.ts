// Full screen, and holding a phone's screen sideways while a race is on.
// Browsers allow both only from a tap or a key press, and some views (an
// embedded page, an iPhone's Safari) not at all; failing quietly is fine.

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

export function canFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}

/** Full screen on or off. Resolves once the browser has answered. */
export async function setFullscreen(on: boolean): Promise<void> {
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* refused here */
  }
}

export function toggleFullscreen(): Promise<void> {
  return setFullscreen(!isFullscreen());
}

/** Hold the screen sideways (a race on a phone, in full screen), or let it turn again. */
export function holdLandscape(on: boolean): void {
  try {
    const o = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
    if (!o) return;
    if (on) void o.lock?.('landscape')?.catch(() => {});
    else o.unlock?.();
  } catch {
    /* not here */
  }
}

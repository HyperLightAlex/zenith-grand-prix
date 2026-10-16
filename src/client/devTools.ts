// The tuning panel and the switch between the 80s anime look and the plain
// one are tools for working on the game, not player settings. They are on
// while developing (npm run dev), or on a built game with ?dev=1 (or ?tune=1,
// which also opens the panel) on the address.

function devTools(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
    const q = new URLSearchParams(location.search);
    return q.has('dev') || q.has('tune');
  } catch {
    return false;
  }
}

export const DEV_TOOLS = devTools();

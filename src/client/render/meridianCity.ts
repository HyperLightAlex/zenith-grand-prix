// Meridian Skyway's city: built out on the sea on planned islands, the way
// a sea city is. Each island is a deck of reclaimed ground behind a
// seawall, a promenade round its edge, laid out in blocks on a grid of
// streets, its towers tallest at its heart and low along the water, a park
// or two among them. Bridges on piers join the islands into one city. The
// skyway runs over it all on its pylons; under the start straight an island
// of its own carries the paddock plaza, the grandstands' footings and the
// twin towers of the start, joined high over the road by a sky bridge.
//
// Only the layout is here (pure: for the world's builder and the tests);
// world.ts builds the meshes from it.

export interface Island {
  /** Middle, half its length and width (x and z before turning), and its turn (radians about y). */
  x: number;
  z: number;
  a: number;
  b: number;
  rot: number;
  /** How tall its towers stand (1: a city's heart; less: the outer districts). */
  height: number;
  /** Space kept clear of towers (the start island's plaza): a ring round its middle this wide. */
  plaza?: number;
}

/** The island's deck: top and how deep its seawall goes. */
export const DECK_TOP = 8;
export const DECK_FOOT = -10;
/** A block of the grid, and the street round it. */
export const BLOCK = 64;
export const STREET = 14;
/** The promenade along the seawall, kept clear of blocks. */
export const PROMENADE = 22;
/** How round an island's corners are (4: a rounded rectangle; 2: an ellipse). */
const SQUARE = 4;

/** Where (x, z) is in the island's own frame: along its length, across it. */
export function toIsland(isle: Island, x: number, z: number): [number, number] {
  const c = Math.cos(isle.rot);
  const s = Math.sin(isle.rot);
  const dx = x - isle.x;
  const dz = z - isle.z;
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** And back to the world. */
export function fromIsland(isle: Island, u: number, v: number): [number, number] {
  const c = Math.cos(isle.rot);
  const s = Math.sin(isle.rot);
  return [isle.x + u * c - v * s, isle.z + u * s + v * c];
}

/** Whether (u, v), in the island's frame, is on it with `inset` to spare from its edge. */
export function onIsland(isle: Island, u: number, v: number, inset = 0): boolean {
  const a = isle.a - inset;
  const b = isle.b - inset;
  if (a <= 0 || b <= 0) return false;
  return Math.abs(u / a) ** SQUARE + Math.abs(v / b) ** SQUARE <= 1;
}

/** The island's edge, `n` points round it (in the world, anticlockwise from above). */
export function islandOutline(isle: Island, n = 64): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const u = isle.a * Math.sign(c) * Math.abs(c) ** (2 / SQUARE);
    const v = isle.b * Math.sign(s) * Math.abs(s) ** (2 / SQUARE);
    out.push(fromIsland(isle, u, v));
  }
  return out;
}

/** How far along the street at `v` (or `u`) runs inside the island's blocks: half its length. */
export function streetHalf(isle: Island, across: number, along: 'u' | 'v'): number {
  const a = isle.a - PROMENADE;
  const b = isle.b - PROMENADE;
  const [len, wid] = along === 'u' ? [a, b] : [b, a];
  const f = 1 - Math.abs(across / wid) ** SQUARE;
  return f <= 0 ? 0 : len * f ** (1 / SQUARE);
}

/** The grid's blocks that lie wholly on the island (inside its promenade): their middles, in its frame. */
export function islandBlocks(isle: Island): Array<[number, number]> {
  const step = BLOCK + STREET;
  const out: Array<[number, number]> = [];
  const nu = Math.floor(isle.a / step) + 1;
  const nv = Math.floor(isle.b / step) + 1;
  for (let i = -nu; i <= nu; i++) {
    for (let j = -nv; j <= nv; j++) {
      const u = i * step;
      const v = j * step;
      const h = BLOCK / 2;
      if ([-h, h].every((du) => [-h, h].every((dv) => onIsland(isle, u + du, v + dv, PROMENADE)))) out.push([u, v]);
    }
  }
  return out;
}

/** Where the bridge between two islands leaves each one's edge (world), along the line between their middles. */
export function bridgeEnds(a: Island, b: Island): [[number, number], [number, number]] {
  const edge = (from: Island, to: Island): [number, number] => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    let lo = 0;
    let hi = len;
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      const [u, v] = toIsland(from, from.x + (dx / len) * m, from.z + (dz / len) * m);
      if (onIsland(from, u, v)) lo = m;
      else hi = m;
    }
    // A little in from the very edge, onto the deck.
    const at = Math.max(0, lo - 4);
    return [from.x + (dx / len) * at, from.z + (dz / len) * at];
  };
  return [edge(a, b), edge(b, a)];
}

/**
 * Which islands the bridges join: each to its nearest not yet joined, until
 * all are one city (the shortest bridges that join them all).
 */
export function bridgeLinks(isles: readonly Island[]): Array<[number, number]> {
  const gap = (i: number, j: number) => Math.hypot(isles[i].x - isles[j].x, isles[i].z - isles[j].z) - Math.max(isles[i].a, isles[i].b) - Math.max(isles[j].a, isles[j].b);
  const joined = new Set([0]);
  const links: Array<[number, number]> = [];
  while (joined.size < isles.length) {
    let best: [number, number] | null = null;
    let bestGap = Infinity;
    for (const i of joined) {
      for (let j = 0; j < isles.length; j++) {
        if (joined.has(j)) continue;
        const g = gap(i, j);
        if (g < bestGap) {
          bestGap = g;
          best = [i, j];
        }
      }
    }
    if (!best) break;
    links.push(best);
    joined.add(best[1]);
  }
  return links;
}

/**
 * Meridian's islands, about its circuit (`bounds`: the circuit's extent in
 * plan, its middle cx, cz), the start island under the start straight
 * (`start`: where it is, and its turn, along the road).
 */
export function meridianIslands(
  bounds: { cx: number; cz: number; minX: number; maxX: number; minZ: number; maxZ: number },
  start: { x: number; z: number; rot: number },
): Island[] {
  const { cx, cz, minX, maxX, minZ, maxZ } = bounds;
  return [
    // The start island: the paddock's plaza, the stands' footings, the twin towers.
    { x: start.x, z: start.z, a: 235, b: 430, rot: start.rot, height: 0.45, plaza: 120 },
    // The city's heart, inside the loop, and the districts round it.
    { x: cx - 60, z: cz - 80, a: 540, b: 470, rot: 0.12, height: 1 },
    { x: cx + 300, z: cz + 700, a: 300, b: 230, rot: -0.35, height: 0.7 },
    { x: cx - 420, z: cz - 840, a: 270, b: 200, rot: 0.5, height: 0.55 },
    { x: minX - 620, z: cz - 200, a: 300, b: 380, rot: -0.2, height: 0.65 },
    { x: maxX + 700, z: cz + 300, a: 420, b: 360, rot: 0.3, height: 0.85 },
    { x: cx + 100, z: minZ - 760, a: 430, b: 330, rot: -0.1, height: 0.75 },
    { x: cx - 300, z: maxZ + 700, a: 360, b: 300, rot: 0.42, height: 0.6 },
  ];
}

/** Whether two islands' decks overlap (or come nearer than `gap`). */
export function islandsMeet(p: Island, q: Island, gap = 0): boolean {
  for (const [a, b] of [[p, q], [q, p]] as const) {
    for (const [x, z] of islandOutline(a, 96)) {
      const [u, v] = toIsland(b, x, z);
      if (onIsland(b, u, v, -gap)) return true;
    }
  }
  return false;
}

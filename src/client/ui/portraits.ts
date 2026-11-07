// The cast's portraits in any team's colours. A person may wear any cast
// pilot's portrait (identity.ts); on a team other than that pilot's, or
// flying for no team (a Sprint: the league's colours, lit in their pilot
// colour), the portrait's suit and headset are repainted in that team's
// colours, over that team's ground. The pictures come from
// tools/portraits/suits.py (art/portraits/keyed/: the cast repainted with
// the suit and headset in key colours): each pilot cut out of its ground,
// and a map of which pixels are suit and how (a key, and a shade from the
// ink to the key's colour), which here is painted ink + shade x (the team's
// colour - ink). On their own team a pilot is shown as painted, unless the
// player's version leaves something out (Squall's Tempest bolt).

import { leagueLivery } from '../render/palette';
import { PILOT_COLOURS } from '../../net/protocol';

interface Suits {
  /** The cast, in the gallery's order (hudArt.ts PILOTS). */
  cast: string[];
  /** The keys, in the map's order: main, main shadow, accent, its shadow, trim, its shadow, inner suit, its shadow. */
  keys: string[];
  /** Shades per key in the map. */
  shades: number;
  ink: [number, number, number];
  /** Each team's suit colours, by key name (Solstice, Vanta, Mirage, Aurora, Tempest). */
  teams: Record<string, [number, number, number]>[];
  /** Pilots always repainted (their own painting carries what the player's version leaves out). */
  plain: string[];
}

const url = (files: Record<string, string>, name: string): string => {
  const hit = Object.entries(files).find(([path]) => path.endsWith('/' + name));
  if (!hit) throw new Error(`no portrait picture ${name}`);
  return hit[1];
};
const FACES = import.meta.glob('./art/pilots/face-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const MAPS = import.meta.glob('./art/pilots/suit-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const GROUNDS = import.meta.glob('./art/pilots/ground-*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const SUITS = Object.values(import.meta.glob('./art/pilots/suits.json', { eager: true, import: 'default' }))[0] as Suits;

const TEAM_GROUNDS = ['solstice', 'vanta', 'mirage', 'aurora', 'tempest'];
/** The size the pictures are painted at, and the size a portrait is made. */
const SRC = 512;
const SIZE = 256;

type RGB = readonly [number, number, number];

/** A portrait's own team (the cast is three a team). */
export const castTeam = (portrait: number): number => Math.floor(portrait / 3);

/**
 * Whether a portrait is repainted for a seat on this team (-1: none): not on
 * its own team, unless its player's version leaves something out.
 */
export function repainted(portrait: number, faction: number): boolean {
  if (portrait < 0 || portrait >= SUITS.cast.length) return false;
  return faction !== castTeam(portrait) || SUITS.plain.includes(SUITS.cast[portrait]);
}

const rgb = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** The suit colours, in the map's key order, for a team (0 to 4) or, at -1, the league's in this pilot colour. */
export function suitColours(faction: number, colour: number): RGB[] {
  if (faction >= 0 && SUITS.teams[faction]) return SUITS.keys.map((k) => SUITS.teams[faction][k]);
  const l = leagueLivery(PILOT_COLOURS[colour] ?? PILOT_COLOURS[0]);
  const glow = rgb(l.glow);
  return [rgb(l.primary), rgb(l.shades.primary), glow, scale(glow, 0.6), rgb(l.trim), rgb(l.shades.trim), rgb(l.frame), rgb(l.shades.frame)];
}

/**
 * Repaint a portrait's suit pixels: `map` (one byte a pixel: 0 for none,
 * else 1 + shades x key + shade) over `px` (RGBA, four bytes a pixel), each
 * such pixel ink + shade x (its key's colour - ink).
 */
export function repaint(px: Uint8ClampedArray, map: Uint8Array | Uint8ClampedArray, colours: readonly RGB[], ink: RGB = SUITS.ink, shades = SUITS.shades): void {
  for (let i = 0, n = map.length; i < n; i++) {
    const v = map[i];
    if (!v) continue;
    const key = Math.floor((v - 1) / shades);
    const t = ((v - 1) % shades) / (shades - 1);
    const c = colours[key];
    if (!c) continue;
    const o = i * 4;
    px[o] = ink[0] + t * (c[0] - ink[0]);
    px[o + 1] = ink[1] + t * (c[1] - ink[1]);
    px[o + 2] = ink[2] + t * (c[2] - ink[2]);
  }
}

// ---- the pictures, loaded once --------------------------------------------------

interface Source {
  face: ImageData;
  map: Uint8Array;
}
let sources: Source[] | null = null;
let grounds: HTMLImageElement[] = [];
let loading: Promise<void> | null = null;

const image = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`portrait picture ${src}`));
    img.src = src;
  });

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('no 2D canvas');
  return [c, g];
}

function pixels(img: HTMLImageElement): ImageData {
  const [, g] = canvas(SRC);
  g.drawImage(img, 0, 0, SRC, SRC);
  return g.getImageData(0, 0, SRC, SRC);
}

/**
 * Load the pictures (once; the boot waits for it). Until they are in, or if
 * they fail, a portrait is shown as painted.
 */
export function preparePortraits(): Promise<void> {
  loading ??= (async () => {
    try {
      const [faces, maps, gs] = await Promise.all([
        Promise.all(SUITS.cast.map((n) => image(url(FACES, `face-${n}.webp`)))),
        Promise.all(SUITS.cast.map((n) => image(url(MAPS, `suit-${n}.png`)))),
        Promise.all([...TEAM_GROUNDS, 'league'].map((n) => image(url(GROUNDS, `ground-${n}.webp`)))),
      ]);
      sources = faces.map((face, i) => {
        const m = pixels(maps[i]).data;
        const map = new Uint8Array(SRC * SRC);
        for (let p = 0; p < map.length; p++) map[p] = m[p * 4];
        return { face: pixels(face), map };
      });
      grounds = gs;
    } catch (error) {
      console.warn('Portraits stay as painted:', error);
      sources = null;
    }
  })();
  return loading;
}

const made = new Map<string, string>();

/**
 * A cast portrait as a seat on this team wears it (`faction` -1: no team, in
 * pilot colour `colour`), as an image URL; null where it is shown as painted
 * (its own team) or the pictures are not in.
 */
export function teamFace(portrait: number, faction: number, colour: number): string | null {
  if (!repainted(portrait, faction)) return null;
  if (!sources) {
    void preparePortraits();
    return null;
  }
  const team = faction >= 0 && faction < TEAM_GROUNDS.length ? faction : -1;
  const key = team >= 0 ? `${portrait}:${team}` : `${portrait}:-1:${colour}`;
  let done = made.get(key);
  if (done) return done;
  const src = sources[portrait];
  const face = new ImageData(new Uint8ClampedArray(src.face.data), SRC, SRC);
  repaint(face.data, src.map, suitColours(team, colour));
  const [fc, fg] = canvas(SRC);
  fg.putImageData(face, 0, 0);
  const [c, g] = canvas(SIZE);
  if (team >= 0) g.drawImage(grounds[team], 0, 0, SIZE, SIZE);
  else {
    // The league's ground: its fade and lines in grey, lit in the pilot colour.
    const glow = PILOT_COLOURS[colour] ?? PILOT_COLOURS[0];
    g.fillStyle = '#' + glow.toString(16).padStart(6, '0');
    g.fillRect(0, 0, SIZE, SIZE);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(grounds[TEAM_GROUNDS.length], 0, 0, SIZE, SIZE);
    g.globalCompositeOperation = 'source-over';
  }
  g.imageSmoothingQuality = 'high';
  g.drawImage(fc, 0, 0, SIZE, SIZE);
  // (A JPEG: the portrait is opaque, and it encodes ten times faster than a WebP, which a gallery of fifteen feels.)
  done = c.toDataURL('image/jpeg', 0.92);
  made.set(key, done);
  return done;
}

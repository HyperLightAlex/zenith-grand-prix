// A custom mech: a design for each of its eleven parts, all of one frame
// (docs/CUSTOMIZATION.md), and its paint: a scheme for the whole mech (main,
// accent, trim from the paint catalogue; the frame from the metals) and any
// part's own. Shared by the client (which draws it) and the server (which
// checks one sent with a seat). Shown only: nothing here reaches the race.

import { callsignProblem, cleanCallsign } from '../net/protocol';
import { CLASSES, ROLE, type Role } from '../sim/config';

/** The parts a mech is built from, each from any design of its frame. */
export const PART_SLOTS = ['head', 'shoulders', 'chest', 'backpack', 'waist', 'hips', 'armL', 'armR', 'thighs', 'shins', 'feet'] as const;
export type PartSlot = (typeof PART_SLOTS)[number];

export const PART_NAMES: Record<PartSlot, string> = {
  head: 'Head',
  shoulders: 'Shoulders',
  chest: 'Chest',
  backpack: 'Back thrusters',
  waist: 'Waist',
  hips: 'Hips',
  armL: 'Left arm',
  armR: 'Right arm',
  thighs: 'Thighs',
  shins: 'Shins',
  feet: 'Feet',
};

/** The parts named in the plural (a pair, or the back's thrusters): "the feet have", not "has". */
export const PLURAL_PARTS: ReadonlySet<PartSlot> = new Set<PartSlot>(['shoulders', 'backpack', 'hips', 'thighs', 'shins', 'feet']);

/**
 * Each frame's designs, one per faction in the factions' order (palette.ts
 * LIVERIES: Solstice, Vanta, Mirage, Aurora, Tempest), by the models' ids. A
 * build names a design by its place here, which is also its faction.
 */
export const FRAME_DESIGNS: Record<Role, readonly string[]> = {
  [ROLE.FW]: ['sunhawk', 'razor', 'anubis', 'seraph', 'kamaitachi'],
  [ROLE.MF]: ['daystar', 'stinger', 'horus', 'longbow', 'fujin'],
  [ROLE.DF]: ['rampart', 'maul', 'sobek', 'paladin', 'raijin'],
};

/** A paint or a metal: its colour, and its shadow colour for the anime look's cel shading. */
export interface Paint {
  name: string;
  color: number;
  /**
   * Mixed as a cel painter mixed shadow paint: its own colour, not the paint
   * darkened, leaning violet (palette.ts, Livery.shades). The factions' are
   * theirs; the rest were mixed by the same rule (about two thirds the
   * lightness, the hue turned up to 22 degrees toward violet, the light ones
   * greyed more) and set by eye.
   */
  shade: number;
}

/** The paints for armour (main, accent, trim). The factions' first, then the rest by hue. */
export const PAINTS: readonly Paint[] = [
  { name: 'Porcelain', color: 0xf4f6fb, shade: 0xa6a3c8 },
  { name: 'Solstice Blue', color: 0x1f6fff, shade: 0x1e2a9c },
  { name: 'Sun Gold', color: 0xffb21a, shade: 0xc0601e },
  { name: 'Charcoal', color: 0x4b4a5e, shade: 0x2e2a44 },
  { name: 'Vanta Red', color: 0xe0263c, shade: 0x7c1036 },
  { name: 'Silver White', color: 0xe6e8f0, shade: 0x9a96b6 },
  { name: 'Desert Sand', color: 0xdcc59a, shade: 0x9a7f72 },
  { name: 'Rust', color: 0xc75f2a, shade: 0x7a2c2c },
  { name: 'Dynasty Gold', color: 0xe9b43c, shade: 0xa8601e },
  { name: 'Royal Violet', color: 0x5a3ea6, shade: 0x31226e },
  { name: 'Pearl', color: 0xece8f4, shade: 0x9d94bc },
  { name: 'Moon Silver', color: 0xc8ccda, shade: 0x7c7d9c },
  { name: 'Jade', color: 0x2e9e6b, shade: 0x1a5a5e },
  { name: 'Storm Black', color: 0x23292a, shade: 0x111523 },
  { name: 'Storm Gold', color: 0xd9b13b, shade: 0xa0601f },
  { name: 'Crimson', color: 0xb0182e, shade: 0x6d1b45 },
  { name: 'Burgundy', color: 0x6e1630, shade: 0x451535 },
  { name: 'Signal Orange', color: 0xff6a13, shade: 0xa31817 },
  { name: 'Copper', color: 0xb8653a, shade: 0x753032 },
  { name: 'Canary', color: 0xffd23f, shade: 0xc27a1e },
  { name: 'Cream', color: 0xf1e6c8, shade: 0xb79887 },
  { name: 'Olive', color: 0x6b7442, shade: 0x3c4f2d },
  { name: 'Lime', color: 0x9bd83a, shade: 0x468c2e },
  { name: 'Racing Green', color: 0x1f6b3a, shade: 0x1a4438 },
  { name: 'Teal', color: 0x17a2a4, shade: 0x194966 },
  { name: 'Ice', color: 0xcfe8f2, shade: 0x8b9db8 },
  { name: 'Sky', color: 0x5ab7ff, shade: 0x4462a7 },
  { name: 'Navy', color: 0x1b2a6b, shade: 0x181b43 },
  { name: 'Lavender', color: 0xb9a7e8, shade: 0x8174ab },
  { name: 'Magenta', color: 0xd42a8e, shade: 0x852880 },
  { name: 'Sakura', color: 0xf4a6c4, shade: 0xb770a5 },
  { name: 'Graphite', color: 0x3a3f4b, shade: 0x242239 },
  { name: 'Matte Black', color: 0x1a1b22, shade: 0x100f1a },
];

/**
 * The metals for the frame (bare metal, shaded as metal: a paint there reads
 * as plastic). The inner frame and the dark parts (joints, vents, wheels)
 * follow it, as they always have.
 */
export const METALS: readonly Paint[] = [
  { name: 'Dark Steel', color: 0x2a3142, shade: 0x171a2e },
  { name: 'Black Steel', color: 0x1d1d27, shade: 0x100f1c },
  { name: 'Umber Iron', color: 0x3b2a22, shade: 0x1f1418 },
  { name: 'Violet Steel', color: 0x241f3a, shade: 0x120f22 },
  { name: 'Green Iron', color: 0x1a2421, shade: 0x0b0f18 },
  { name: 'Gunmetal', color: 0x3a4152, shade: 0x272a38 },
  { name: 'Titanium', color: 0x6c7486, shade: 0x3f4258 },
  { name: 'Silver', color: 0xaab3c2, shade: 0x737684 },
  { name: 'Bronze', color: 0x8a6a44, shade: 0x5e372e },
];

/** A whole mech's paint, or a part's own: paints for main, accent and trim, a metal for the frame (indices). */
export interface Scheme {
  main: number;
  accent: number;
  trim: number;
  frame: number;
}
export const CHANNELS = ['main', 'accent', 'trim', 'frame'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_NAMES: Record<Channel, string> = { main: 'Main', accent: 'Accent', trim: 'Trim', frame: 'Frame' };

/** Each faction's colours as a scheme (its livery: primary, secondary, trim, frame). */
export const FACTION_SCHEMES: readonly Scheme[] = [
  { main: 0, accent: 1, trim: 2, frame: 0 },
  { main: 3, accent: 4, trim: 5, frame: 1 },
  { main: 6, accent: 7, trim: 8, frame: 2 },
  { main: 9, accent: 10, trim: 11, frame: 3 },
  { main: 12, accent: 13, trim: 14, frame: 4 },
];

export interface MechBuild {
  /** Each part's design: its place in FRAME_DESIGNS[role] (its faction). */
  parts: Record<PartSlot, number>;
  paint: Scheme;
  /** A part's own paint, channel by channel; anything left out follows the mech's. */
  own: Partial<Record<PartSlot, Partial<Scheme>>>;
  /** What the player calls it ('' for none). */
  name: string;
}

export const NAME_MAX = 16;

/** A faction's stock mech of a frame as a build: every part its design, in its colours. */
export function stockBuild(faction: number): MechBuild {
  const f = Math.max(0, Math.min(FACTION_SCHEMES.length - 1, faction | 0));
  return {
    parts: Object.fromEntries(PART_SLOTS.map((s) => [s, f])) as Record<PartSlot, number>,
    paint: { ...FACTION_SCHEMES[f] },
    own: {},
    name: '',
  };
}

/** What a custom mech is called: its name, or "Custom <frame>". */
export function customName(role: Role, b: MechBuild | null): string {
  return b?.name || `Custom ${CLASSES[role].frame}`;
}

/** What a seat's mech is called: its custom mech's name if it flies one, `stock` (the faction's model) otherwise. */
export function mechName(m: { role: Role; look: string }, stock: string): string {
  const b = m.look ? decodeBuild(m.look) : null;
  return b ? customName(m.role, b) : stock;
}

/** The paint a part wears: its own where it has it, the mech's otherwise. */
export function schemeFor(b: MechBuild, slot: PartSlot): Scheme {
  return { ...b.paint, ...(b.own[slot] ?? {}) };
}

/** Why a mech's name cannot be used, or null ('' is no name). Checked as a callsign is. */
export function nameProblem(name: string): string | null {
  if (name === '') return null;
  return callsignProblem(name);
}

// ---- as text --------------------------------------------------------------------
// A build travels and is kept as a short line of text:
//   c1/<eleven digits, each part's design>/<main accent trim: two base-36 digits each><frame: one>/<own>/<name>
// <own> is a run of entries: a part's letter (a to k, in PART_SLOTS order), a
// channel's (m a t f), and its paint (two digits; a metal one). Anything that
// does not read back exactly is refused (decodeBuild gives null).

const CH_LETTER: Record<Channel, string> = { main: 'm', accent: 'a', trim: 't', frame: 'f' };
const LETTER_CH: Record<string, Channel> = { m: 'main', a: 'accent', t: 'trim', f: 'frame' };

const two = (n: number) => n.toString(36).padStart(2, '0');

export function encodeBuild(b: MechBuild): string {
  const parts = PART_SLOTS.map((s) => String(b.parts[s])).join('');
  const paint = two(b.paint.main) + two(b.paint.accent) + two(b.paint.trim) + b.paint.frame.toString(36);
  let own = '';
  PART_SLOTS.forEach((s, i) => {
    const o = b.own[s];
    if (!o) return;
    for (const ch of CHANNELS) {
      const v = o[ch];
      if (v === undefined) continue;
      own += String.fromCharCode(97 + i) + CH_LETTER[ch] + (ch === 'frame' ? v.toString(36) : two(v));
    }
  });
  return `c1/${parts}/${paint}/${own}/${b.name}`;
}

const validPaint = (ch: Channel, v: number) => Number.isInteger(v) && v >= 0 && v < (ch === 'frame' ? METALS.length : PAINTS.length);

/** A build from its text, checked through: null if anything is off. */
export function decodeBuild(text: unknown): MechBuild | null {
  if (typeof text !== 'string' || text.length > 200) return null;
  const seg = text.split('/');
  if (seg.length !== 5 || seg[0] !== 'c1') return null;
  const [, partsText, paintText, ownText, name] = seg;
  if (!/^[0-4]{11}$/.test(partsText)) return null;
  if (!/^[0-9a-z]{7}$/.test(paintText)) return null;
  const parts = Object.fromEntries(PART_SLOTS.map((s, i) => [s, Number(partsText[i])])) as Record<PartSlot, number>;
  const paint: Scheme = {
    main: parseInt(paintText.slice(0, 2), 36),
    accent: parseInt(paintText.slice(2, 4), 36),
    trim: parseInt(paintText.slice(4, 6), 36),
    frame: parseInt(paintText.slice(6, 7), 36),
  };
  for (const ch of CHANNELS) if (!validPaint(ch, paint[ch])) return null;
  const own: MechBuild['own'] = {};
  let i = 0;
  while (i < ownText.length) {
    const slot = PART_SLOTS[ownText.charCodeAt(i) - 97];
    const ch = LETTER_CH[ownText[i + 1]];
    if (!slot || !ch) return null;
    const width = ch === 'frame' ? 1 : 2;
    const digits = ownText.slice(i + 2, i + 2 + width);
    if (digits.length !== width || !/^[0-9a-z]+$/.test(digits)) return null;
    const v = parseInt(digits, 36);
    if (!validPaint(ch, v)) return null;
    const o = (own[slot] ??= {});
    if (o[ch] !== undefined) return null;
    o[ch] = v;
    i += 2 + width;
  }
  if (name !== cleanCallsign(name) || nameProblem(name)) return null;
  const b: MechBuild = { parts, paint, own, name };
  // Only the one way of writing it: the same build always reads the same.
  return encodeBuild(b) === text ? b : null;
}

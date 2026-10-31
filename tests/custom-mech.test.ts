import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  CHANNELS,
  FACTION_SCHEMES,
  FRAME_DESIGNS,
  METALS,
  PAINTS,
  PART_NAMES,
  PART_SLOTS,
  PLURAL_PARTS,
  customName,
  decodeBuild,
  encodeBuild,
  mechName,
  nameProblem,
  schemeFor,
  stockBuild,
  type MechBuild,
} from '../src/custom/mechBuild';
import { LIVERIES } from '../src/client/render/palette';
import { ROLE } from '../src/sim/index';

const mixed = (): MechBuild => ({
  parts: { head: 1, shoulders: 2, chest: 0, backpack: 3, waist: 4, hips: 0, armL: 3, armR: 1, thighs: 4, shins: 0, feet: 2 },
  paint: { main: 15, accent: 32, trim: 2, frame: 7 },
  own: { head: { main: 19 }, feet: { accent: 0, frame: 8 } },
  name: 'Storm Kite',
});

describe('the paint catalogue', () => {
  it('holds every faction\'s colours exactly, as its stock scheme', () => {
    LIVERIES.forEach((l, f) => {
      const s = FACTION_SCHEMES[f];
      expect([PAINTS[s.main].color, PAINTS[s.accent].color, PAINTS[s.trim].color, METALS[s.frame].color]).toEqual([l.primary, l.secondary, l.trim, l.frame]);
      expect([PAINTS[s.main].shade, PAINTS[s.accent].shade, PAINTS[s.trim].shade, METALS[s.frame].shade]).toEqual([l.shades.primary, l.shades.secondary, l.shades.trim, l.shades.frame]);
    });
  });

  it('gives every paint and metal a name of its own and a shadow darker than it', () => {
    const lum = (c: number) => {
      const k = new THREE.Color(c);
      return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b;
    };
    for (const list of [PAINTS, METALS]) {
      expect(new Set(list.map((p) => p.name)).size).toBe(list.length);
      for (const p of list) expect(lum(p.shade), p.name).toBeLessThan(lum(p.color));
    }
    // Indices travel as two base-36 digits (paints) and one (metals).
    expect(PAINTS.length).toBeLessThanOrEqual(36 * 36);
    expect(METALS.length).toBeLessThanOrEqual(36);
  });

  it('names each frame\'s designs in the factions\' order', () => {
    for (const role of [ROLE.FW, ROLE.MF, ROLE.DF]) expect(FRAME_DESIGNS[role]).toEqual(LIVERIES.map((l) => l.models[role].toLowerCase()));
  });
});

describe('heads on other chests', () => {
  it('match the shipped seating snapshot and independently verify every native head/chest pair', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const report = execFileSync(process.execPath, [`${root}node_modules/tsx/dist/cli.mjs`, 'tools/head-seats.ts', '--check'], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
    expect(report).toContain('validated 75 native head/chest pairs against runtime seating');
    expect(report).toContain('headSeats.ts is up to date');
  }, 120000);
});

describe('the parts\' names', () => {
  it('call the backpack the back thrusters, and know which are plural', () => {
    expect(PART_NAMES.backpack).toBe('Back thrusters');
    for (const s of PLURAL_PARTS) expect(PART_NAMES[s].endsWith('s') || s === 'feet', s).toBe(true);
    expect(PLURAL_PARTS.has('head')).toBe(false);
  });
});

describe('a custom mech as text', () => {
  it('reads back exactly what was written', () => {
    for (const b of [mixed(), stockBuild(0), stockBuild(4), { ...stockBuild(2), name: '' }]) {
      const text = encodeBuild(b);
      expect(text.length).toBeLessThan(80);
      expect(decodeBuild(text)).toEqual(b);
    }
  });

  it('refuses anything else', () => {
    const good = encodeBuild(mixed());
    const bad = [
      '',
      null,
      42,
      good.replace('c1/', 'c2/'),
      good.replace(/\/[0-4]{11}\//, '/0123401234/'), // ten parts
      good.replace(/\/[0-4]{11}\//, '/01234012345/'), // a sixth design
      good.replace('0f0w027', '0f0w02z'), // no such metal
      good.replace('0f0w027', 'zz0w027'), // no such paint
      good.replace('am0j', 'zm0j'), // no such part
      good.replace('am0j', 'ax0j'), // no such channel
      good.replace('am0j', 'am0jam0k'), // a channel set twice
      good + '/', // a sixth field
      good.replace('Storm Kite', 'Storm  Kite'), // not as it would be written
      good.replace('Storm Kite', 'x'), // too short a name
      good.replace('Storm Kite', 'Storm/Kite'),
      good.replace('Storm Kite', 'a'.repeat(17)),
    ];
    for (const t of bad) expect(decodeBuild(t), String(t)).toBeNull();
    // The parts' entries written out of order: not the one way of writing it.
    expect(good).toContain('/am0jka00kf8/');
    expect(decodeBuild(good.replace('am0jka00kf8', 'ka00kf8am0j'))).toBeNull();
  });
});

describe('a custom mech', () => {
  it('starts as a faction\'s stock mech: every part its design, in its colours', () => {
    const b = stockBuild(3);
    for (const s of PART_SLOTS) expect(b.parts[s]).toBe(3);
    expect(b.paint).toEqual(FACTION_SCHEMES[3]);
    expect(b.own).toEqual({});
  });

  it('paints each part with its own colours where it has them, the mech\'s elsewhere', () => {
    const b = mixed();
    expect(schemeFor(b, 'head')).toEqual({ main: 19, accent: 32, trim: 2, frame: 7 });
    expect(schemeFor(b, 'feet')).toEqual({ main: 15, accent: 0, trim: 2, frame: 8 });
    expect(schemeFor(b, 'chest')).toEqual(b.paint);
    for (const ch of CHANNELS) expect(schemeFor(b, 'waist')[ch]).toBe(b.paint[ch]);
  });

  it('is called by its name, or after its frame', () => {
    expect(customName(ROLE.FW, mixed())).toBe('Storm Kite');
    expect(customName(ROLE.DF, { ...mixed(), name: '' })).toBe('Custom Bulwark');
    expect(mechName({ role: ROLE.MF, look: '' }, 'Daystar')).toBe('Daystar');
    expect(mechName({ role: ROLE.MF, look: encodeBuild(mixed()) }, 'Daystar')).toBe('Storm Kite');
    expect(nameProblem('')).toBeNull();
    expect(nameProblem('ok')).not.toBeNull();
  });
});

describe('your custom mechs on this device', () => {
  afterEach(() => vi.unstubAllGlobals());
  async function fresh(store = new Map<string, string>()) {
    vi.resetModules();
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    });
    return { id: await import('../src/client/net/identity'), store };
  }

  it('keeps one per frame, flown when you choose, and kept from visit to visit', async () => {
    const { id, store } = await fresh();
    expect(id.customMech(ROLE.MF)).toBeNull();
    expect(id.seatLook(ROLE.MF)).toBe('');
    id.setCustomMech(ROLE.MF, mixed());
    expect(id.customMech(ROLE.MF)).toEqual(mixed());
    // Made, but not flown until chosen.
    expect(id.fliesCustom(ROLE.MF)).toBe(false);
    id.setFliesCustom(ROLE.MF, true);
    expect(id.seatLook(ROLE.MF)).toBe(encodeBuild(mixed()));
    expect(id.seatLook(ROLE.FW)).toBe('');
    // No custom mech: nothing to fly.
    id.setFliesCustom(ROLE.DF, true);
    expect(id.fliesCustom(ROLE.DF)).toBe(false);
    const again = (await fresh(store)).id;
    expect(again.customMech(ROLE.MF)).toEqual(mixed());
    expect(again.fliesCustom(ROLE.MF)).toBe(true);
    // Deleted: the stock mech again.
    again.setCustomMech(ROLE.MF, null);
    expect(again.fliesCustom(ROLE.MF)).toBe(false);
    expect(again.seatLook(ROLE.MF)).toBe('');
  });

  it('reads a pilot record from before custom mechs, and drops a mech it cannot read', async () => {
    const store = new Map([['zgp.pilot', JSON.stringify({ v: 1, portrait: 4, made: 'Comet', mechs: ['c1/garbage', '', ''], fly: [true, false, false] })]]);
    const { id } = await fresh(store);
    expect(id.portrait()).toBe(4);
    expect(id.customMech(ROLE.FW)).toBeNull();
    expect(id.fliesCustom(ROLE.FW)).toBe(false);
    const old = new Map([['zgp.pilot', JSON.stringify({ v: 1, portrait: 2, made: 'Vega' })]]);
    const before = (await fresh(old)).id;
    expect(before.pilotName()).toBe('Vega');
    expect(before.customMech(ROLE.DF)).toBeNull();
  });
});

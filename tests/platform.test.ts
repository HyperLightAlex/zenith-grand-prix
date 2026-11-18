// The platform seam (src/client/platform.ts): on a page of its own the game
// uses the browser; inside a host (Akeru) it uses what the host gives and
// nothing of the browser's storage, and every key it keeps is one the host
// was told of.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAVE_KEYS, makePlatform, memoryStore } from '../src/client/platform';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.ts$/.test(name) ? [p] : [];
  });
}

describe('the platform', () => {
  it('is the browser on a page of its own', () => {
    const p = makePlatform(undefined);
    expect(p.name).toBe('standalone');
    expect(p).toMatchObject({ hostMenu: false, fullscreen: true, links: true, downloads: true });
    // (No address given: the page's own server.)
    expect(p.server).toBeUndefined();
    expect(p.rumble).toBeUndefined();
    // Where the browser's storage is missing (here: Node), reading finds nothing and nothing throws but a write.
    expect(p.storage.getItem('zgp.settings')).toBeNull();
    expect(() => p.storage.removeItem('zgp.settings')).not.toThrow();
    expect(p.getGamepads()).toEqual([]);
    expect(() => p.beginInputFrame()).not.toThrow();
  });

  it('inside a host takes what the host gives, and keeps nothing in the browser otherwise', () => {
    const saves = memoryStore();
    const pads: Gamepad[] = [];
    const p = makePlatform({ name: 'akeru', storage: saves, getGamepads: () => pads, hostMenu: true });
    expect(p.name).toBe('akeru');
    expect(p.storage).toBe(saves);
    expect(p.getGamepads()).toBe(pads);
    // Not given: for this visit only, never the browser's own.
    p.session.setItem('zgp.resume', '{}');
    expect(p.session.getItem('zgp.resume')).toBe('{}');
    expect(makePlatform({}).session.getItem('zgp.resume')).toBeNull();
    // No server unless the host names one, and nothing a framed page cannot do.
    expect(p).toMatchObject({ server: null, hostMenu: true, fullscreen: false, links: false, downloads: false });
    expect(makePlatform({ server: 'https://rooms.example' }).server).toBe('https://rooms.example');
    expect(makePlatform({}).name).toBe('host');
  });

  it('lists every key the game keeps, each once', () => {
    expect(new Set(SAVE_KEYS).size).toBe(SAVE_KEYS.length);
    const used = new Set<string>();
    for (const file of sources('src')) {
      if (file.endsWith('platform.ts')) continue;
      for (const m of readFileSync(file, 'utf8').matchAll(/['"`]((?:zgp|zenith-gp)\.[A-Za-z0-9.]+)['"`]/g)) used.add(m[1]);
    }
    // (Kept for the visit, in the session; and the ghosts' keys are made from a circuit's id.)
    used.delete('zgp.resume');
    used.delete('zgp.ghosts.');
    // (The tuning as it was once kept: read once, to carry it over; never written.)
    used.delete('zenith-gp.tuning.v2');
    expect(used.size).toBeGreaterThan(15);
    for (const key of used) expect(SAVE_KEYS, key).toContain(key);
    for (const key of SAVE_KEYS) if (!key.startsWith('zgp.ghosts.')) expect([...used], key).toContain(key);
  });

  it('never reaches for the browser\'s storage or controllers but through the platform', () => {
    const direct = /\b(?:localStorage|sessionStorage|indexedDB)\b|navigator\.getGamepads/;
    const found = sources('src/client')
      .filter((f) => !f.endsWith('platform.ts'))
      .filter((f) => readFileSync(f, 'utf8').split('\n').some((line) => direct.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)));
    expect(found).toEqual([]);
  });
});

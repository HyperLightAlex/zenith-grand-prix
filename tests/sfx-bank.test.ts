import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../src/client/audio/dsp';
import { SFX_META, SFX_NAMES } from '../src/client/audio/sfx';
import { onset, SfxBank, type SfxBankManifest } from '../src/client/audio/sfxBank';
import type { SfxName } from '../src/client/audio/audio';

/** A stand-in AudioBuffer: `lead` seconds of silence, then a sound. */
function buffer(lead: number, seconds = 0.5, channels = 1, sampleRate = 48000): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(Math.round(seconds * sampleRate)));
  const from = Math.round(lead * sampleRate);
  for (let i = from; i < data[0].length; i++) data[channels - 1][i] = Math.sin(i / 7) * Math.exp(-(i - from) / 4000) * 0.8;
  return { sampleRate, length: data[0].length, numberOfChannels: channels, duration: seconds, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
}

describe('where a recorded take starts', () => {
  it('skips the silence a decoder leaves in front, keeping half a millisecond', () => {
    expect(onset(buffer(0.026))).toBeCloseTo(0.026 - 0.0005, 3);
    // In whichever channel the sound is.
    expect(onset(buffer(0.04, 0.5, 2))).toBeCloseTo(0.04 - 0.0005, 3);
  });

  it('starts at once when the sound does, and gives up on silence too long to be a priming', () => {
    expect(onset(buffer(0))).toBe(0);
    expect(onset(buffer(0.3))).toBe(0);
  });
});

describe('the bank of recorded sounds', () => {
  const manifest: SfxBankManifest = { sounds: { hit_heavy: { gain: -6, files: ['hit_heavy-1.mp3', 'hit_heavy-2.mp3', 'hit_heavy-3.mp3'] }, ko: { gain: 0, files: ['ko-1.mp3'] } } };
  const serve = (m: SfxBankManifest | null) => async (url: string) => {
    if (url.endsWith('manifest.json')) return { ok: !!m, status: m ? 200 : 404, json: async () => m };
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
  };
  // Decodes each file into a buffer whose length says which file it was.
  const ctx = {
    sampleRate: 48000,
    decodeAudioData: (data: ArrayBuffer, ok: (b: AudioBuffer) => void) => {
      const name = new TextDecoder().decode(data);
      const b = buffer(0.01, 0.1 + name.length / 1000);
      ok(b);
      return Promise.resolve(b);
    },
  } as unknown as BaseAudioContext;

  it('plays a different take from last time, and every take in time', async () => {
    vi.stubGlobal('fetch', serve(manifest));
    try {
      const bank = new SfxBank('sfx/');
      bank.decode(ctx);
      await vi.waitFor(() => expect(bank.state).toBe('ready'));
      expect(bank.names().sort()).toEqual(['hit_heavy', 'ko']);
      expect(bank.has('hit_heavy')).toBe(true);
      expect(bank.has('parry')).toBe(false);
      expect(bank.pick('parry', new Rng(1))).toBeNull();
      const rng = new Rng(7);
      const seen = new Set<AudioBuffer>();
      let last: AudioBuffer | null = null;
      for (let k = 0; k < 60; k++) {
        const p = bank.pick('hit_heavy', rng)!;
        expect(p.take.buffer).not.toBe(last);
        expect(p.gain).toBeCloseTo(10 ** (-6 / 20), 6);
        expect(p.take.start).toBeCloseTo(0.0095, 3);
        last = p.take.buffer;
        seen.add(p.take.buffer);
      }
      expect(seen.size).toBe(3);
      // One take: that one, every time.
      const ko = bank.pick('ko', rng)!.take;
      expect(bank.pick('ko', rng)!.take).toBe(ko);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with nothing built yet, is ready with no recordings, and says nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A static host's 404, and a dev server's page in place of the missing file.
    const page = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), json: async () => JSON.parse('<!doctype html>') });
    try {
      for (const fetch of [serve(null), page]) {
        vi.stubGlobal('fetch', fetch);
        const bank = new SfxBank('sfx/');
        bank.decode(ctx);
        await vi.waitFor(() => expect(bank.state).toBe('ready'));
        expect(bank.names()).toEqual([]);
      }
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe('the recorded sounds shipped', () => {
  const dir = 'public/sfx/';
  it.runIf(existsSync(dir + 'manifest.json'))('are all sounds the game plays, with their files there and a sane gain', () => {
    const m = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8')) as SfxBankManifest;
    for (const [name, s] of Object.entries(m.sounds)) {
      expect(SFX_NAMES, name).toContain(name as SfxName);
      expect(SFX_META[name as SfxName]).toBeDefined();
      expect(s.files.length, name).toBeGreaterThan(0);
      for (const f of s.files) expect(existsSync(dir + f), f).toBe(true);
      expect(Math.abs(s.gain), name).toBeLessThan(24);
    }
  });
});

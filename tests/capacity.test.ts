import { describe, expect, it } from 'vitest';
import { atCapacity, fullReply, readable } from '../server/capacity';
import { FULL_RETRY_SECONDS, FULL_TEXT } from '../src/net/protocol';
import { FULL_NOTICE, failure, isFull } from '../src/client/net/failure';

describe('a full server', () => {
  it('is full at its limit, and never without one', () => {
    expect(atCapacity(95, 96)).toBe(false);
    expect(atCapacity(96, 96)).toBe(true);
    expect(atCapacity(200, 96)).toBe(true);
    expect(atCapacity(10_000, 0)).toBe(false);
  });

  it('says so in a reply the game can read, and when to ask again', () => {
    const r = fullReply('https://title.example', ['https://title.example']);
    expect(r.status).toBe(503);
    expect(r.headers['retry-after']).toBe(String(FULL_RETRY_SECONDS));
    expect(r.headers['access-control-allow-origin']).toBe('https://title.example');
    expect(JSON.parse(r.body)).toEqual({ code: 503, error: FULL_TEXT });
  });

  it('lets only the sites it serves read a refusal', () => {
    expect(readable('https://title.example', ['https://title.example'])['access-control-allow-origin']).toBe('https://title.example');
    expect(readable('https://other.example', ['https://title.example'])).toEqual({});
    // No list: the game is served from here, or anyone may ask.
    expect(readable('https://anyone.example', [])['access-control-allow-origin']).toBe('https://anyone.example');
    // The game's requests carry credentials: a wildcard would hide the reply from it.
    expect(readable('https://anyone.example', [])['access-control-allow-credentials']).toBe('true');
    // Not a browser asking: nothing to add.
    expect(readable('', ['https://title.example'])).toEqual({});
  });

  it('is told apart from a full room and from no server at all', () => {
    const full = new Error(FULL_TEXT);
    expect(isFull(full)).toBe(true);
    expect(failure(full)).toBe(FULL_NOTICE);
    expect(isFull({ message: `${FULL_TEXT} (503)` })).toBe(true);
    for (const other of [new Error('room "ABCD" is full'), new Error('Failed to fetch'), new Error('no rooms found'), 'Too many room codes tried']) {
      expect(isFull(other)).toBe(false);
      expect(failure(other)).not.toBe(FULL_NOTICE);
    }
    expect(failure(new Error('room is full'))).toBe('Room full');
    // Quick Play searches again when a place went to someone else, not when the servers are full.
    expect(/full|free place/i.test(FULL_TEXT)).toBe(false);
  });
});

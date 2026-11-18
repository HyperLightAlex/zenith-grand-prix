// The server when it is full: what a player's game is told, in a form its
// page can read from another site.

import { FULL_RETRY_SECONDS, FULL_TEXT } from '../src/net/protocol';

/**
 * Headers that let the page that asked read a refusal. A page on another
 * site (the game inside a host) is shown nothing of a reply without them:
 * to the game the refusal would look like no server at all.
 */
export function readable(origin: string, allowed: readonly string[]): Record<string, string> {
  if (!origin) return {};
  if (allowed.length && !allowed.includes(origin)) return {};
  // (Named, not '*': the game's requests carry credentials, and a browser
  // shows such a reply only to the one site it names.)
  return { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'origin' };
}

/** Is there no place for one more connection? (`max` 0: no limit.) */
export const atCapacity = (held: number, max: number): boolean => max > 0 && held >= max;

/** The reply to a search, a new room or a join while the server is full. */
export function fullReply(origin: string, allowed: readonly string[]): { status: number; headers: Record<string, string>; body: string } {
  return {
    status: 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': String(FULL_RETRY_SECONDS), ...readable(origin, allowed) },
    body: JSON.stringify({ code: 503, error: FULL_TEXT }),
  };
}

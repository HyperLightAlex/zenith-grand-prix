// Why a room could not be made, found or joined, in words a player can act on.

import { FULL_TEXT } from '../../net/protocol';

const words = (e: unknown): string => (e instanceof Error ? e.message : typeof e === 'string' ? e : String((e as { message?: string })?.message ?? e));

/** Was this the server saying it is full (every connection it holds is taken)? */
export const isFull = (e: unknown): boolean => words(e).includes(FULL_TEXT);

/** What a player is told while the servers are full. */
export const FULL_NOTICE = 'The servers are full right now. Try again in a few minutes.';

/** A failed create or join, in words a player can act on. */
export function failure(e: unknown): string {
  const msg = words(e);
  if (isFull(e)) return FULL_NOTICE;
  if (/not found|does not exist|no rooms? (found|available)/i.test(msg)) return 'No room with that code. Check it and try again.';
  if (/locked|maxClients|is full/i.test(msg)) return 'Room full';
  if (/fetch|network|ECONNREFUSED|Failed to|NetworkError|load failed/i.test(msg)) return "Can't reach the game server. Check your connection and try again.";
  if (/Too many/i.test(msg)) return 'Too many room codes tried. Wait a minute.';
  return msg || 'Something went wrong.';
}

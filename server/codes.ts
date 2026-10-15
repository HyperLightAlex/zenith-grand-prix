// Room and squad codes in use in this process, so no two are alike.

import crypto from 'node:crypto';
import { makeCode } from '../src/net/protocol';

const inUse = new Set<string>();

export function claimCode(): string {
  const rand = () => crypto.randomInt(0, 1 << 30) / (1 << 30);
  for (let i = 0; i < 1000; i++) {
    const c = makeCode(rand);
    if (!inUse.has(c)) {
      inUse.add(c);
      return c;
    }
  }
  throw new Error('No free codes');
}

export function releaseCode(code: string): void {
  inUse.delete(code);
}

export function codesInUse(): number {
  return inUse.size;
}

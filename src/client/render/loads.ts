// What is still loading: every model and picture fetched through three.js's
// loaders (its default loading manager), counted, so a race can wait for the
// circuit it built to be all in (the titan, the painted textures) before it
// is shown, rather than showing it filling in.

import * as THREE from 'three';

let outstanding = 0;
let started = 0;
let ended = 0;
const settled = new Set<() => void>();

// Counted from the first load on (this module is loaded with the renderer, before any).
{
  const m = THREE.DefaultLoadingManager;
  const start = m.itemStart.bind(m);
  const end = m.itemEnd.bind(m);
  m.itemStart = (url: string) => {
    outstanding++;
    started++;
    start(url);
  };
  // (A load that fails ends too: three's loaders report the error, then the end.)
  m.itemEnd = (url: string) => {
    end(url);
    ended++;
    outstanding = Math.max(0, outstanding - 1);
    if (!outstanding) for (const f of [...settled]) f();
  };
}

/** Loads under way now. */
export const loadsPending = (): number => outstanding;

/** How far through the loads started since `from` (loadsMark()) it is, 0 to 1. */
export const loadsMark = (): { started: number; ended: number } => ({ started, ended });
export function loadsDone(from: { started: number; ended: number }): number {
  const total = started - from.started;
  return total <= 0 ? 1 : Math.min(1, (ended - from.ended) / total);
}

const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Resolves once nothing is loading, and nothing more has started a moment
 * later (what a load leads on to: a model's own pictures). Gives up waiting
 * after `timeout` ms (a load stuck on a bad network shows as it was).
 */
export function loadsSettled(timeout = 20000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      settled.delete(check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      void (async () => {
        await macrotask();
        await macrotask();
        if (!outstanding) finish();
      })();
    };
    const timer = setTimeout(finish, timeout);
    settled.add(check);
    check();
  });
}

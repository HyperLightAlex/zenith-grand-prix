import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSeason, pendingFixtures } from '../src/gp/grandPrix';

// A stand-in worker that answers at once with a made-up result.
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage(msg: { id: number }): void {
    queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, result: { wins: [2, 1], points: [40, 30], races: 3, winner: 0 } } }));
  }
  terminate(): void {}
}
vi.mock('../src/client/gp/gpWorker?worker&inline', () => ({ default: FakeWorker }));
vi.mock('../src/client/gp/gpStore', () => ({ saveEvent: () => {} }));

afterEach(() => vi.restoreAllMocks());

describe('the background race runner', () => {
  it('works through every background race of a season, one after another', async () => {
    const { GpRunner } = await import('../src/client/gp/gpRunner');
    const ev = newSeason(0, 1, 9);
    const runner = new GpRunner();
    let results = 0;
    runner.onResult = () => results++;
    runner.run(ev);
    for (let i = 0; i < 50 && pendingFixtures(ev).length; i++) await new Promise((r) => setTimeout(r, 0));
    expect(pendingFixtures(ev)).toHaveLength(0);
    // Eight matchdays with one other match, and the two you sit out with two.
    expect(results).toBe(12);
  });
});

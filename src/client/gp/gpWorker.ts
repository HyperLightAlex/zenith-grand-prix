// Runs the Grand Prix's background races off the main thread: each a whole
// race (or a best-of-3) between computer pilots, a second or so apiece.
import { simulateFixture, type GpFixture } from '../../gp/grandPrix';
import type { MatchConfig } from '../../sim/index';

interface Job {
  id: number;
  fixture: GpFixture;
  cfg: MatchConfig;
  skill: number;
  names: [string[], string[]];
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, fixture, cfg, skill, names } = e.data;
  const result = simulateFixture(fixture, cfg, skill, names);
  (self as unknown as Worker).postMessage({ id, result });
};

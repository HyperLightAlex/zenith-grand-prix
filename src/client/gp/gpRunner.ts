// Runs an event's background races: in a worker when the browser has one,
// else on the page between frames. Results land in the event (and its save)
// as they finish; anyone waiting on a round is told.

import { GP_SKILL, matchFormat, pendingFixtures, simulateFixture, type GpEvent, type GpFixture, type GpFixtureResult } from '../../gp/grandPrix';
import type { MatchConfig } from '../../sim/index';
import { PILOT_NAMES } from '../../net/factions';
import { saveEvent } from './gpStore';
import GpWorker from './gpWorker?worker&inline';

interface Job {
  id: number;
  event: GpEvent;
  fixture: GpFixture;
  cfg: MatchConfig;
  skill: number;
}

export class GpRunner {
  private worker: Worker | null = null;
  /** The race being run now. The worker's replies are matched against it. */
  private job: Job | null = null;
  private event: GpEvent | null = null;
  private nextId = 1;
  /** Called whenever a background result comes in. */
  onResult: () => void = () => {};

  /** Work through this event's background races, earliest first. */
  run(ev: GpEvent | null): void {
    this.event = ev;
    this.pump();
  }

  /** Background races still to run. */
  get remaining(): number {
    return this.event ? pendingFixtures(this.event).length : 0;
  }

  private names(f: GpFixture): [string[], string[]] {
    return [[...PILOT_NAMES[f.a]], [...PILOT_NAMES[f.b]]];
  }

  private pump(): void {
    const ev = this.event;
    if (!ev || this.job) return;
    const next = pendingFixtures(ev)[0];
    if (!next) return;
    const job: Job = { id: this.nextId++, event: ev, fixture: next, cfg: matchFormat(ev), skill: GP_SKILL[ev.difficulty] ?? GP_SKILL[1] };
    this.job = job;
    try {
      this.ensureWorker().postMessage({ id: job.id, fixture: next, cfg: job.cfg, skill: job.skill, names: this.names(next) });
    } catch {
      this.worker = null;
      this.onPage(job);
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new GpWorker();
    w.onmessage = (e: MessageEvent<{ id: number; result: GpFixtureResult }>) => {
      if (this.job && e.data.id === this.job.id) this.finish(this.job, e.data.result);
    };
    w.onerror = () => {
      // No worker after all: the race in hand, and the rest, run on the page.
      w.terminate();
      this.worker = null;
      if (this.job) this.onPage(this.job);
    };
    this.worker = w;
    return w;
  }

  private finish(job: Job, result: GpFixtureResult): void {
    if (this.job !== job) return;
    this.job = null;
    job.fixture.result = result;
    if (this.event === job.event) saveEvent(job.event);
    this.onResult();
    this.pump();
  }

  /** No worker: one race on the page, after a frame. */
  private onPage(job: Job): void {
    setTimeout(() => this.finish(job, simulateFixture(job.fixture, job.cfg, job.skill, this.names(job.fixture))), 30);
  }
}

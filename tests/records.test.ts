// Personal records (client/game/records.ts): every lap timed and traced,
// the fastest speed lap and race kept by circuit and frame with the lap as
// a ghost, and the career's totals; all of it saved, and read back safely.

import { describe, expect, it } from 'vitest';
import { COUNTDOWN_TICKS, DT, ROLE, stepRace } from '../src/sim/index';
import { GHOST_RATE, LapTracer, RecordBook, ghostAt, packGhost, recordKey, unpackGhost, type Ghost } from '../src/client/game/records';
import { FW0, TRACK, newRace } from './helpers';

/** A race run to its end by the computer pilots, its forward's laps traced (the first race from `seed` on in which the forward reaches the flag). */
function tracedRace(seed = 3) {
  for (let k = seed; ; k++) {
    const race = newRace(k);
    const tracer = new LapTracer(FW0, TRACK);
    for (let t = 0; t < 8 * 60 * 60 && race.phase !== 2; t++) {
      stepRace(race, TRACK, []);
      tracer.after(race);
    }
    if (race.mechs[FW0].finished || k > seed + 20) return { race, tracer };
  }
}

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe('a ghost', () => {
  it('packs its samples and gives them back, to the precision it keeps', () => {
    const samples = [
      [0, -3.21, 0, 0.1234, 150.12, 1],
      [15.37, -2.5, 1.05, 0.2, 152.4, 3],
      [31.02, 4.44, 0, -3.1, 160, 0],
      [3000.5, 12, 0, 3.1, 199.9, 16],
    ];
    const back = unpackGhost({ data: packGhost(samples) });
    expect(back).toHaveLength(4);
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(samples[i][0], 1);
      expect(p[1]).toBeCloseTo(samples[i][1], 1);
      expect(p[3]).toBeCloseTo(samples[i][3], 2);
      expect(p[4]).toBeCloseTo(samples[i][4], 0);
      expect(p[5]).toBe(samples[i][5]);
    });
  });

  it('says where it is at any moment of its lap, eased between samples', () => {
    const data = packGhost([
      [0, 0, 0, 0, 100, 0],
      [10, 2, 0, 0.5, 100, 1],
      [20, 4, 0, 1, 100, 0],
    ]);
    const g: Ghost = { v: 1, track: 'meridian', role: ROLE.FW, look: { faction: 0, build: '', colour: -1, name: 'Kite' }, time: 0.2, rate: GHOST_RATE, data };
    expect(ghostAt(g, 0).s).toBeCloseTo(0);
    expect(ghostAt(g, 0.05).s).toBeCloseTo(5, 1);
    expect(ghostAt(g, 0.05).d).toBeCloseTo(1, 1);
    expect(ghostAt(g, 0.15).facing).toBeCloseTo(0.75, 2);
    // Held at the ends.
    expect(ghostAt(g, 9).s).toBeCloseTo(20, 1);
    expect(ghostAt(g, -1).s).toBeCloseTo(0);
  });
});

describe('the lap tracer', () => {
  it('times each lap of a race, to the part of a tick, and they add up to the race', () => {
    const { race, tracer } = tracedRace();
    const m = race.mechs[FW0];
    expect(m.finished && !m.retired).toBe(true);
    expect(tracer.laps.map((l) => l.lap)).toEqual([1, 2, 3]);
    const sum = tracer.laps.reduce((a, l) => a + l.time, 0);
    expect(sum).toBeCloseTo(m.finishTime - COUNTDOWN_TICKS * DT, 6);
    // The speed lap is the quickest.
    expect(tracer.laps[2].time).toBeLessThan(tracer.laps[1].time);
  });

  it('samples each lap ten times a second, from the line to the line', () => {
    const { tracer } = tracedRace();
    for (const l of tracer.laps) {
      expect(l.samples[0][0]).toBeLessThan(5);
      expect(l.samples[l.samples.length - 1][0]).toBeCloseTo(TRACK.length, 3);
      expect(Math.abs(l.samples.length - l.time * GHOST_RATE)).toBeLessThan(3);
      // Never backwards along the road.
      for (let i = 1; i < l.samples.length; i++) expect(l.samples[i][0]).toBeGreaterThanOrEqual(l.samples[i - 1][0] - 0.5);
    }
  });
});

describe('the record book', () => {
  const look = { faction: 0, build: '', colour: -1, name: 'Kite' };

  it('keeps the fastest speed lap and race by circuit and frame, the lap as a ghost, and only beats them with better', () => {
    const store = new MemoryStorage();
    const book = new RecordBook(store);
    const { race, tracer } = tracedRace();
    const first = book.addRace({ race, track: 'meridian', local: FW0, mode: 'Free Play', laps: tracer.laps, look });
    expect(first.lap?.time).toBeCloseTo(tracer.laps[2].time, 6);
    expect(first.lap?.was).toBeNull();
    expect(first.race).not.toBeNull();
    const rec = book.lap('meridian', ROLE.FW)!;
    expect(rec.ghost?.track).toBe('meridian');
    expect(unpackGhost(rec.ghost!).length).toBe(tracer.laps[2].samples.length);
    // The same race again: nothing new.
    const again = book.addRace({ race, track: 'meridian', local: FW0, mode: 'Free Play', laps: tracer.laps, look });
    expect(again.lap).toBeNull();
    expect(again.race).toBeNull();
    // A quicker lap: a new record, and what it beat.
    const quicker = tracer.laps.map((l) => (l.lap === 3 ? { ...l, time: l.time - 1 } : l));
    const better = book.addRace({ race, track: 'meridian', local: FW0, mode: 'Free Play', laps: quicker, look });
    expect(better.lap?.was).toBeCloseTo(tracer.laps[2].time, 6);
    // Each frame and circuit its own.
    expect(book.lap('meridian', ROLE.MF)).toBeNull();
    expect(Object.keys(book.data.laps)).toEqual([recordKey('meridian', ROLE.FW)]);
    // The career: three races counted.
    expect(book.data.career.races).toBe(3);
    expect(book.data.career.byRole[ROLE.FW].races).toBe(3);
    expect(book.data.career.byTrack.meridian.races).toBe(3);
    // Saved, and read back.
    const again2 = new RecordBook(store);
    expect(again2.data).toEqual(book.data);
  });

  it('starts empty from nothing or from anything that is not a record book', () => {
    for (const raw of [null, '', 'nonsense', '{"v":7}', '[]', '{"v":1,"career":null,"laps":5}']) {
      const store = new MemoryStorage();
      if (raw !== null) store.setItem('zgp.records', raw);
      const book = new RecordBook(store);
      expect(book.data.career.races).toBe(0);
      expect(book.lap('meridian', ROLE.FW)).toBeNull();
    }
    // No storage at all (a private window): it works, and keeps nothing.
    const none = new RecordBook(null);
    const { race, tracer } = tracedRace();
    none.addRace({ race, track: 'meridian', local: FW0, mode: 'Free Play', laps: tracer.laps, look });
    expect(none.data.career.races).toBe(1);
  });
});

// Replays (client/game/replay.ts): a race recorded as the person's inputs
// plays out again exactly, from the start or from any tick it is sent to,
// whatever the frame rate it was raced at; a replay that no longer plays out
// the same says so.

import { describe, expect, it } from 'vitest';
import { MERIDIAN, PHASE, TICK_RATE, emptyInput, type MechInput, type RaceConfig } from '../src/sim/index';
import { LocalSession } from '../src/client/game/session';
import { AFTER_FLAG, ReplaySession, fingerprint, makeReplay, type Replay } from '../src/client/game/replay';
import { FW0, MF0, makeRandom, makeSeats, mash, steerToward } from './helpers';

/** Race a whole race in a LocalSession at a ragged frame rate, a person flying `seat`, and keep the replay. */
function raceAndRecord(seed: number, seat: number, opts: { mashing?: boolean; lesson?: boolean } = {}): { replay: Replay; final: string; session: LocalSession } {
  const cfg: RaceConfig = { seed, seats: makeSeats([seat], 0.5), lesson: opts.lesson ? { pupil: seat, spar: 1 } : undefined };
  const session = new LocalSession(MERIDIAN, cfg, seat);
  const rnd = makeRandom(seed * 7 + 1);
  const input = emptyInput();
  let frames = 0;
  while (!session.recorder.done && frames < 60 * 60 * 12) {
    const me = session.race.mechs[seat];
    steerToward(me, input, 4 * Math.sin(session.race.tick / 400));
    if (opts.mashing) mash(rnd, input);
    // Frames of every length a browser produces: 60 and 144 Hz, hitches, and the odd one that runs no tick.
    const dt = [1 / 60, 1 / 144, 1 / 30, 0.004, 0.051][frames % 5];
    session.update(dt, input as MechInput);
    frames++;
  }
  expect(session.recorder.done, 'the recording ended').toBe(true);
  const replay = makeReplay(session.recorder, MERIDIAN.id, session.cfg, seat, [0, 1], 'Test', session.race);
  // (The session raced on after the recording ended; the replay ends where it did.)
  return { replay, final: replay.end, session };
}

function prepared(replay: Replay): ReplaySession {
  const r = new ReplaySession(replay);
  while (!r.prepare(1000));
  return r;
}

describe('a replay', () => {
  it('plays a whole race out again exactly, and ends just after the flag', () => {
    for (const [seed, seat, mashing] of [[3, FW0, false], [8, MF0, true]] as const) {
      const { replay } = raceAndRecord(seed, seat, { mashing });
      // Run-length encoding keeps it small.
      expect(replay.inputs.length).toBeLessThan(replay.ticks);
      expect(JSON.stringify(replay).length).toBeLessThan(400_000);
      const r = prepared(replay);
      expect(r.faithful, `seed ${seed}`).toBe(true);
      // Watched through at double speed, a frame at a time: the same race.
      r.speed = 2;
      while (r.race.tick < replay.ticks) r.update(1 / 60, null);
      expect(fingerprint(r.race)).toBe(replay.end);
      expect(r.race.phase).toBe(PHASE.FINISHED);
      const finishedAt = r.race.firstFinishTick;
      expect(replay.ticks).toBeGreaterThan(finishedAt);
      expect(r.paused).toBe(true);
      void AFTER_FLAG;
    }
  });

  it('can be sent to any tick, backwards or forwards, and carries on from there exactly', () => {
    const { replay } = raceAndRecord(5, FW0, { mashing: true });
    const r = prepared(replay);
    const fresh = (tick: number) => {
      const f = new ReplaySession(replay);
      f.seek(tick);
      return fingerprint(f.race);
    };
    for (const t of [replay.ticks - 1, 30 * TICK_RATE + 17, 5, 2 * 60 * TICK_RATE, 0, 61 * TICK_RATE]) {
      r.seek(t);
      expect(r.race.tick).toBe(t);
      expect(fingerprint(r.race), `tick ${t}`).toBe(fresh(t));
    }
    // From a seek, playing on is the race as raced.
    r.seek(40 * TICK_RATE);
    r.paused = false;
    r.speed = 4;
    while (r.race.tick < replay.ticks) r.update(1 / 30, null);
    expect(fingerprint(r.race)).toBe(replay.end);
  });

  it('finds the moments worth jumping to', () => {
    const { replay } = raceAndRecord(3, FW0);
    const r = prepared(replay);
    const kinds = new Set(r.highlights.map((h) => h.kind));
    expect(kinds.has('start')).toBe(true);
    expect(kinds.has('lap')).toBe(true);
    expect(kinds.has('finish')).toBe(true);
    const ticks = r.highlights.map((h) => h.tick);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    // A moment is listed once, however many times it is reported.
    r.highlights.forEach((h, i) => {
      for (let j = i - 1; j >= 0 && h.tick - r.highlights[j].tick < 2 * TICK_RATE; j--) expect(r.highlights[j].label).not.toBe(h.label);
    });
  });

  it('plays a tutorial race too (the lesson is part of the setup)', () => {
    const { replay } = raceAndRecord(4, FW0, { lesson: true });
    expect(replay.cfg.lesson).toEqual({ pupil: FW0, spar: 1 });
    expect(prepared(replay).faithful).toBe(true);
  });

  it('says so when the race no longer plays out as raced', () => {
    const { replay } = raceAndRecord(3, FW0);
    const changed: Replay = { ...replay, cfg: { ...replay.cfg, rules: { ...(replay.cfg.rules ?? {}), tow: 0.2 } } };
    expect(prepared(changed).faithful).toBe(false);
  });

  it('keeps the computer flying a seat handed to it (a demo)', () => {
    const cfg: RaceConfig = { seed: 2, seats: makeSeats([FW0], 0.5) };
    const session = new LocalSession(MERIDIAN, cfg, FW0);
    session.race.mechs[FW0].human = false;
    while (!session.recorder.done) session.update(1 / 60, null);
    const replay = makeReplay(session.recorder, MERIDIAN.id, session.cfg, FW0, [0, 1], 'Demo', session.race);
    expect(replay.local).toBe(-1);
    expect(replay.cfg.seats[FW0].human).toBe(false);
    expect(prepared(replay).faithful).toBe(true);
  });
});

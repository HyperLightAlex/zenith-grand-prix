import { describe, expect, it } from 'vitest';
import { CALLER, PHASE, TACTIC, assignData, cloneRace, emptyInput, raceChecksum, restoreRace, stepRace, type MechInput } from '../src/sim/index';
import { DF0, FW0, MF0, TRACK, makeInputs, mash, makeRandom, newRace, runCountdown, snapshot } from './helpers';

describe('race copies', () => {
  it('a copy taken mid-race runs on exactly as the original does', () => {
    const a = newRace(11, { humans: [FW0] });
    const rand = makeRandom(5);
    const inputs = makeInputs(a);
    const pad = emptyInput();
    const drive = () => {
      mash(rand, pad);
      inputs[FW0] = pad;
    };
    for (let i = 0; i < 1500; i++) {
      drive();
      stepRace(a, TRACK, inputs);
    }
    const b = cloneRace(a);
    expect(snapshot(b)).toBe(snapshot(a));
    // Through JSON as well: the copy a client gets over the wire.
    const c = JSON.parse(JSON.stringify(a));
    const seq: Array<MechInput | null> = [];
    for (let i = 0; i < 600; i++) {
      drive();
      seq.push({ ...inputs[FW0]! });
      stepRace(a, TRACK, inputs);
    }
    for (const r of [b, c]) {
      for (let i = 0; i < 600; i++) {
        inputs[FW0] = seq[i];
        stepRace(r, TRACK, inputs);
      }
      expect(snapshot(r)).toBe(snapshot(a));
      expect(raceChecksum(r)).toBe(raceChecksum(a));
    }
  });

  it('restoring in place keeps the objects a view holds', () => {
    const a = newRace(3);
    runCountdown(a);
    const saved = cloneRace(a);
    const mech0 = a.mechs[0];
    const before = snapshot(a);
    for (let i = 0; i < 300; i++) stepRace(a, TRACK, []);
    expect(snapshot(a)).not.toBe(before);
    restoreRace(a, saved);
    expect(a.mechs[0]).toBe(mech0);
    expect(snapshot(a)).toBe(before);
  });

  it('assignData copies shapes that do not match', () => {
    const dst: { a: number[]; b: { c: number } | null; d?: number } = { a: [1, 2, 3], b: null, d: 4 };
    assignData(dst, { a: [9], b: { c: 2 } });
    expect(dst).toEqual({ a: [9], b: { c: 2 } });
  });

  it('the checksum changes when the race does', () => {
    const a = newRace(3);
    runCountdown(a);
    const sum = raceChecksum(a);
    const b = cloneRace(a);
    b.mechs[2].s += 1e-9;
    expect(raceChecksum(b)).not.toBe(sum);
  });
});

describe('shot callers', () => {
  function raceWith(humans: number[]) {
    const race = newRace(21, { humans });
    const inputs = makeInputs(race);
    runCountdown(race, inputs);
    return { race, inputs };
  }

  it('by default any person on the team calls the play', () => {
    const { race, inputs } = raceWith([FW0, MF0]);
    expect(race.phase).toBe(PHASE.RACING);
    inputs[MF0] = { ...emptyInput(), throttle: 1, cmd: TACTIC.BLITZ };
    stepRace(race, TRACK, inputs);
    expect(race.teams[0].tactic).toBe(TACTIC.BLITZ);
  });

  it('only the shot caller is listened to when the room names one', () => {
    const { race, inputs } = raceWith([FW0, MF0]);
    race.teams[0].caller = FW0;
    inputs[MF0] = { ...emptyInput(), cmd: TACTIC.RUN };
    stepRace(race, TRACK, inputs);
    expect(race.teams[0].tactic).toBe(TACTIC.FREE);
    inputs[MF0] = emptyInput();
    inputs[FW0] = { ...emptyInput(), cmd: TACTIC.SHIELD };
    stepRace(race, TRACK, inputs);
    expect(race.teams[0].tactic).toBe(TACTIC.SHIELD);
  });

  it('nobody calls on a team set to NONE', () => {
    const { race, inputs } = raceWith([FW0, MF0, DF0]);
    race.teams[0].caller = CALLER.NONE;
    inputs[FW0] = { ...emptyInput(), cmd: TACTIC.BLITZ };
    stepRace(race, TRACK, inputs);
    expect(race.teams[0].tactic).toBe(TACTIC.FREE);
  });

  it('the computer captain takes over a team whose people have all dropped', () => {
    const { race, inputs } = raceWith([FW0]);
    inputs[FW0] = null;
    // With a human seat and the default rule, the captain stays out of it.
    for (let i = 0; i < 60 * 60; i++) stepRace(race, TRACK, inputs);
    const quiet = race.events.length >= 0 && race.teams[0].captainAt;
    expect(quiet).toBe(0);
    race.teams[0].caller = CALLER.CAPTAIN;
    stepRace(race, TRACK, inputs);
    expect(race.teams[0].captainAt).toBeGreaterThan(race.tick);
  });
});

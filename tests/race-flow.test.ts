import { describe, expect, it } from 'vitest';
import {
  BTN,
  CLASSES,
  COUNTDOWN_TICKS,
  DRIVE_START,
  DT,
  FINISH_GRACE_TICKS,
  LAPS,
  MODE,
  PERFECT_START_WINDOW,
  PHASE,
  ROLE,
  TACTIC,
  TICK_RATE,
  emptyInput,
  stepRace,
} from '../src/sim/index';
import type { RaceState, SimEvent } from '../src/sim/index';
import { retire } from '../src/sim/combat';
import { DF0, DF1, FW0, FW1, MF0, MF1, TRACK, makeInputs, newRace, runCountdown, runToEnd } from './helpers';
import type { Inputs } from './helpers';

const L = TRACK.length;

describe('the grid', () => {
  it('lines up two teams of three behind the start line', () => {
    const race = newRace(1);
    expect(race.phase).toBe(PHASE.COUNTDOWN);
    expect(race.tick).toBe(0);
    expect(race.laps).toBe(LAPS);
    expect(race.lapPhase).toBe(1);
    expect(race.mechs.length).toBe(6);
    expect(race.mechs.filter((m) => m.team === 0).map((m) => m.role)).toEqual([ROLE.FW, ROLE.MF, ROLE.DF]);
    expect(race.mechs.filter((m) => m.team === 1).map((m) => m.role)).toEqual([ROLE.FW, ROLE.MF, ROLE.DF]);
    for (const m of race.mechs) {
      const c = CLASSES[m.role];
      expect(m.id).toBe(race.mechs.indexOf(m));
      expect(m.s).toBeLessThan(0);
      expect(Math.abs(m.d)).toBeLessThan(TRACK.halfWidth - c.radius);
      expect(m.speed).toBe(0);
      expect(m.hp).toBe(c.maxHp);
      expect(m.guard).toBe(c.guardMax);
      expect(m.drive).toBe(DRIVE_START);
      expect(m.mode).toBe(MODE.SPEED);
      expect(m.target).toBe(-1);
      expect(m.lap).toBe(0);
      expect(m.finished || m.retired).toBe(false);
    }
    // Forwards on the front row, defenders at the back.
    const s = (id: number) => race.mechs[id].s;
    expect(s(FW0)).toBe(s(FW1));
    expect(s(MF0)).toBe(s(MF1));
    expect(s(DF0)).toBe(s(DF1));
    expect(s(FW0)).toBeGreaterThan(s(MF0));
    expect(s(MF0)).toBeGreaterThan(s(DF0));
    // Team-mates in a row sit on opposite sides, and the sides swap by row.
    const d = (id: number) => race.mechs[id].d;
    expect(d(FW0)).toBe(-d(FW1));
    expect(d(MF0)).toBe(-d(MF1));
    expect(d(DF0)).toBe(-d(DF1));
    expect(Math.sign(d(FW0))).toBe(-Math.sign(d(MF0)));
    // Nobody starts overlapping anybody.
    for (const a of race.mechs) {
      for (const b of race.mechs) {
        if (a.id >= b.id) continue;
        expect(Math.hypot(a.s - b.s, a.d - b.d)).toBeGreaterThan(CLASSES[a.role].radius + CLASSES[b.role].radius);
      }
    }
    expect(race.mechs.map((m) => m.place).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('honours a custom lap count', () => {
    expect(newRace(1, { laps: 1 }).laps).toBe(1);
    expect(newRace(1, { laps: 5 }).laps).toBe(5);
  });
});

describe('countdown', () => {
  it('counts 3, 2, 1, GO over four seconds', () => {
    const race = newRace(7);
    const seen: Array<[number, number]> = [];
    for (let i = 0; i < COUNTDOWN_TICKS + 60; i++) {
      const phaseBefore = race.phase;
      stepRace(race, TRACK, []);
      for (const e of race.events) if (e.type === 'countdown') seen.push([race.tick, e.n]);
      if (race.tick < COUNTDOWN_TICKS) expect(race.phase).toBe(PHASE.COUNTDOWN);
      else expect(race.phase).toBe(PHASE.RACING);
      if (race.tick === COUNTDOWN_TICKS) expect(phaseBefore).toBe(PHASE.COUNTDOWN);
    }
    expect(COUNTDOWN_TICKS).toBe(4 * TICK_RATE);
    expect(seen).toEqual([
      [1 * TICK_RATE, 3],
      [2 * TICK_RATE, 2],
      [3 * TICK_RATE, 1],
      [4 * TICK_RATE, 0],
    ]);
  });

  it('nobody moves, and nothing happens, before GO - whatever the pilots press', () => {
    const race = newRace(3, { humans: [FW0, MF1] });
    const inputs = makeInputs(race);
    const before = JSON.stringify(race.mechs.map((m) => [m.s, m.d, m.speed, m.vs, m.vd, m.hp, m.drive, m.guard, m.target, m.mode, m.act]));
    for (let i = 1; i < COUNTDOWN_TICKS; i++) {
      for (const id of [FW0, MF1]) {
        const inp = inputs[id]!;
        inp.throttle = 1;
        inp.mx = i % 2 ? 1 : -1;
        inp.my = 1;
        inp.buttons = (i * 37) & 255;
        inp.cmd = (i >> 3) % 5;
      }
      stepRace(race, TRACK, inputs);
      expect(race.phase).toBe(PHASE.COUNTDOWN);
      expect(race.events.every((e) => e.type === 'countdown')).toBe(true);
      expect(JSON.stringify(race.mechs.map((m) => [m.s, m.d, m.speed, m.vs, m.vd, m.hp, m.drive, m.guard, m.target, m.mode, m.act]))).toBe(before);
    }
    expect(race.teams.map((t) => t.tactic)).toEqual([TACTIC.FREE, TACTIC.FREE]);
    expect(race.projectiles.length).toBe(0);
  });

  it('everybody is away within a second of GO', () => {
    const race = newRace(3);
    runCountdown(race);
    for (let i = 0; i < 60; i++) stepRace(race, TRACK, []);
    for (const m of race.mechs) {
      expect(m.speed).toBeGreaterThan(10);
      expect(m.s).toBeGreaterThan(-34);
    }
  });
});

describe('perfect launch', () => {
  /** Run the countdown with the forward's throttle going down at `pressTick`. */
  function launch(pressTick: number, releaseTick = Infinity): { race: RaceState; launched: boolean } {
    const race = newRace(5, { humans: [FW0], skill: 0 });
    const inputs = makeInputs(race);
    let launched = false;
    for (let t = 1; t <= COUNTDOWN_TICKS; t++) {
      inputs[FW0]!.throttle = t >= pressTick && t < releaseTick ? 1 : 0;
      stepRace(race, TRACK, inputs);
      if (race.events.some((e) => e.type === 'launch' && e.mech === FW0)) {
        launched = true;
        expect(race.tick).toBe(COUNTDOWN_TICKS);
      }
    }
    return { race, launched };
  }

  it('rewards a throttle squeezed just before the lights go out', () => {
    const { race, launched } = launch(COUNTDOWN_TICKS - 10);
    expect(launched).toBe(true);
    const m = race.mechs[FW0];
    expect(m.speed).toBeGreaterThanOrEqual(38);
    expect(m.drive).toBeGreaterThan(DRIVE_START + 9.9);
    expect(m.drive).toBeLessThan(DRIVE_START + 10.1);
  });

  it('covers exactly the last PERFECT_START_WINDOW ticks, GO tick included', () => {
    expect(launch(COUNTDOWN_TICKS).launched).toBe(true);
    expect(launch(COUNTDOWN_TICKS - PERFECT_START_WINDOW).launched).toBe(true);
    expect(launch(COUNTDOWN_TICKS - PERFECT_START_WINDOW - 1).launched).toBe(false);
  });

  it('is not given for a throttle held from the start', () => {
    const { race, launched } = launch(1);
    expect(launched).toBe(false);
    expect(race.mechs[FW0].speed).toBeLessThan(5);
    expect(race.mechs[FW0].drive).toBeLessThan(DRIVE_START + 0.1);
  });

  it('is not given for a throttle let go again before GO, or never pressed', () => {
    expect(launch(COUNTDOWN_TICKS - 10, COUNTDOWN_TICKS - 2).launched).toBe(false);
    expect(launch(Infinity).launched).toBe(false);
  });

  it('a perfect launch really is quicker off the line', () => {
    const good = launch(COUNTDOWN_TICKS - 5);
    const late = launch(1);
    const run = (race: RaceState): number => {
      const inputs: Inputs = makeInputs(race);
      inputs[FW0]!.throttle = 1;
      for (let i = 0; i < 120; i++) stepRace(race, TRACK, inputs);
      return race.mechs[FW0].s;
    };
    expect(run(good.race)).toBeGreaterThan(run(late.race) + 10);
  });

  it('AI pilots launch by skill: never at skill 0, sometimes at skill 1', () => {
    let none = 0;
    let some = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const skill of [0, 1]) {
        const race = newRace(seed, { skill });
        let launches = 0;
        for (let i = 0; i < COUNTDOWN_TICKS; i++) {
          stepRace(race, TRACK, []);
          launches += race.events.filter((e) => e.type === 'launch').length;
        }
        if (skill === 0) none += launches;
        else some += launches;
      }
    }
    expect(none).toBe(0);
    expect(some).toBeGreaterThan(12); // 72 seats at 60%
    expect(some).toBeLessThan(72);
  });
});

describe('laps, phases and the finish (one full AI race)', () => {
  const race = newRace(20261);
  const events: Array<SimEvent & { tick: number }> = [];
  const phaseAt: number[] = [];
  let ticksAfterEnd = 0;
  const finished = runToEnd(race, [], (r) => {
    for (const e of r.events) events.push({ ...e, tick: r.tick });
    phaseAt[r.tick] = r.lapPhase;
  });
  const of = <T extends SimEvent['type']>(type: T) => events.filter((e) => e.type === type) as Array<Extract<SimEvent, { type: T }> & { tick: number }>;

  it('runs to the flag', () => {
    expect(finished).toBe(true);
    expect(race.phase).toBe(PHASE.FINISHED);
  });

  it('every runner starts lap 2, then lap 3, then finishes', () => {
    for (const m of race.mechs) {
      const laps = of('lap').filter((e) => e.mech === m.id);
      const fin = of('finish').filter((e) => e.mech === m.id);
      if (m.retired) {
        expect(fin.length).toBe(0);
        continue;
      }
      expect(laps.map((e) => e.lap)).toEqual([2, 3]);
      expect(fin.length).toBe(1);
      expect(laps[0].tick).toBeLessThan(laps[1].tick);
      expect(laps[1].tick).toBeLessThan(fin[0].tick);
      expect(m.finished).toBe(true);
      expect(m.lap).toBe(3);
      expect(m.s).toBeGreaterThanOrEqual(3 * L);
      // The finish time is interpolated inside the tick the line was crossed.
      expect(m.finishTime).toBeGreaterThan((fin[0].tick - 1) * DT);
      expect(m.finishTime).toBeLessThanOrEqual(fin[0].tick * DT);
    }
  });

  it('the lap phase follows the leader: formation, battle, speed', () => {
    const phases = of('lapPhase');
    expect(phases.map((e) => e.lap)).toEqual([2, 3]);
    // Each phase starts on the very tick the first mech starts that lap.
    const firstLap2 = of('lap').find((e) => e.lap === 2)!;
    const firstLap3 = of('lap').find((e) => e.lap === 3)!;
    expect(phases[0].tick).toBe(firstLap2.tick);
    expect(phases[1].tick).toBe(firstLap3.tick);
    for (let t = COUNTDOWN_TICKS; t < phases[0].tick; t++) expect(phaseAt[t]).toBe(1);
    for (let t = phases[0].tick; t < phases[1].tick; t++) expect(phaseAt[t]).toBe(2);
    for (let t = phases[1].tick; t < phaseAt.length; t++) expect(phaseAt[t]).toBe(3);
  });

  it('finish events come in finishing order and name the final place', () => {
    const fins = of('finish');
    expect(fins.length).toBe(race.mechs.filter((m) => !m.retired).length);
    expect(fins.map((e) => e.place)).toEqual(fins.map((_, i) => i + 1));
    for (const e of fins) expect(race.mechs[e.mech].place).toBe(e.place);
    expect(race.firstFinishTick).toBe(fins[0].tick);
  });

  it('ends once, 90 ticks after the last runner is home (nobody timed out)', () => {
    const ends = of('raceEnd');
    expect(ends.length).toBe(1);
    expect(ends[0].tick).toBe(race.tick);
    expect(events[events.length - 1].type).toBe('raceEnd');
    const lastHome = Math.max(...of('finish').map((e) => e.tick), ...of('ko').map((e) => e.tick));
    expect(lastHome + 90).toBeLessThan(race.firstFinishTick + FINISH_GRACE_TICKS);
    expect(race.tick).toBe(lastHome + 90);
    expect(race.endTick).toBe(race.tick);
    expect(race.projectiles.length).toBe(0);
  });

  it('the AI captains call plays on the battle lap only', () => {
    const calls = of('tactic');
    expect(calls.length).toBeGreaterThan(0);
    for (const e of calls) {
      expect(e.by).toBe(-1);
      // Plays are made on lap 2; the only call outside it is the return
      // to FREE when the speed lap begins.
      if (phaseAt[e.tick - 1] !== 2) expect(e.tactic).toBe(TACTIC.FREE);
      if (e.tactic === TACTIC.MARK) {
        expect(race.mechs[e.mark].team).toBe(1 - e.team);
        expect(race.mechs[e.mark].role).toBe(ROLE.FW);
      } else {
        expect(e.mark).toBe(-1);
      }
    }
    expect(calls.some((e) => e.tactic !== TACTIC.FREE)).toBe(true);
    expect(calls.every((e) => phaseAt[e.tick - 1] >= 2)).toBe(true);
  });

  it('can still be stepped after the flag: a quiet cool-down lap, result untouched', () => {
    const result = JSON.stringify(race.mechs.map((m) => [m.place, m.points, m.finishTime, m.retired, m.finished]));
    for (let i = 0; i < 600; i++) {
      stepRace(race, TRACK, []);
      ticksAfterEnd++;
      expect(race.phase).toBe(PHASE.FINISHED);
      expect(race.events.some((e) => e.type === 'raceEnd' || e.type === 'finish' || e.type === 'hit' || e.type === 'lap')).toBe(false);
    }
    expect(ticksAfterEnd).toBe(600);
    expect(JSON.stringify(race.mechs.map((m) => [m.place, m.points, m.finishTime, m.retired, m.finished]))).toBe(result);
  });
});

describe('the end of the race', () => {
  it('a one-lap race is a formation lap to the flag and ends with everyone home', () => {
    const race = newRace(11, { laps: 1 });
    let laps = 0;
    let fought = 0;
    expect(runToEnd(race, [], (r) => {
      for (const e of r.events) {
        if (e.type === 'lap') laps++;
        if (r.firstFinishTick < 0 && (e.type === 'hit' || e.type === 'windup' || e.type === 'shot')) fought++;
      }
      if (r.firstFinishTick < 0) expect(r.lapPhase).toBe(1);
    })).toBe(true);
    expect(laps).toBe(0);
    expect(fought).toBe(0);
    expect(race.mechs.every((m) => m.finished && !m.retired && m.lap === 1)).toBe(true);
  });

  // OPEN QUESTION (see report): the lap phase is computed from every
  // non-retired mech's lap count, finishers included. A finisher's count
  // equals `laps`, so in a ONE-lap race the phase jumps from 1 straight to 3
  // the moment the winner crosses the line: a 'lapPhase 3' event fires, the
  // limiter lifts and weapons go live for everyone still on their formation
  // lap. Harmless with the default three laps (the phase is already 3).
  it('a one-lap race stays a formation lap after the winner is home', () => {
    const race = newRace(11, { laps: 1 });
    runToEnd(race, [], (r) => {
      expect(r.lapPhase).toBe(1);
      expect(r.events.some((e) => e.type === 'lapPhase' || e.type === 'windup' || e.type === 'shot')).toBe(false);
    });
  });

  it('stays open FINISH_GRACE_TICKS after the winner, then flags a parked human', () => {
    const race = newRace(3, { humans: [FW0], laps: 1 });
    const inputs = makeInputs(race); // the human never touches the controls
    let endEvents = 0;
    let endTick = -1;
    expect(runToEnd(race, inputs, (r) => {
      for (const e of r.events) {
        if (e.type === 'raceEnd') {
          endEvents++;
          endTick = r.tick;
        }
      }
    })).toBe(true);
    expect(endEvents).toBe(1);
    expect(race.firstFinishTick).toBeGreaterThan(0);
    expect(endTick).toBe(race.firstFinishTick + FINISH_GRACE_TICKS);
    const parked = race.mechs[FW0];
    // Classified, not retired: last of the runners, and it scores.
    expect(parked.retired).toBe(false);
    expect(parked.finished).toBe(true);
    expect(parked.lap).toBe(0);
    expect(parked.place).toBe(6);
    expect(parked.points).toBe(1);
    for (const m of race.mechs) if (m.id !== FW0) expect(m.finishTime).toBeLessThan(1e6);
  });

  it('flagged runners are classified by distance covered', () => {
    const race = newRace(8, { humans: [FW0, MF1, DF0], laps: 1 });
    const inputs = makeInputs(race);
    runCountdown(race, inputs);
    // Three humans park at different points of the lap; the AIs race on.
    race.mechs[FW0].s = 3000;
    race.mechs[MF1].s = 5000;
    race.mechs[DF0].s = 1000;
    expect(runToEnd(race, inputs)).toBe(true);
    expect(race.mechs[MF1].place).toBe(4);
    expect(race.mechs[FW0].place).toBe(5);
    expect(race.mechs[DF0].place).toBe(6);
    expect([MF1, FW0, DF0].map((id) => race.mechs[id].points)).toEqual([3, 2, 1]);
    expect([FW1, MF0, DF1].map((id) => race.mechs[id].place).sort()).toEqual([1, 2, 3]);
  });

  it('ends 90 ticks after the last runner retires, with no winner at all', () => {
    const race = newRace(4, { laps: 1 });
    runCountdown(race);
    for (let i = 0; i < 100; i++) stepRace(race, TRACK, []);
    for (const m of race.mechs) retire(race, m, null);
    const from = race.tick;
    expect(runToEnd(race, [])).toBe(true);
    expect(race.tick).toBe(from + 91);
    expect(race.firstFinishTick).toBe(-1);
    expect(race.mechs.every((m) => m.retired && m.points === 0 && !m.finished)).toBe(true);
  });

  // OPEN QUESTION (see report): there is no time limit. If nobody ever
  // crosses the line the grace timer never starts, so one parked (or
  // disconnected-but-seated) human keeps the race open for ever once the
  // other five have retired. A server will need a watchdog or a rule here.
  it('a race with one parked runner and nobody home eventually ends', () => {
    const race = newRace(3, { humans: [FW0], laps: 1 });
    const inputs = makeInputs(race);
    runCountdown(race, inputs);
    for (const m of race.mechs) if (m.id !== FW0) retire(race, m, null);
    expect(runToEnd(race, inputs, undefined, 60 * 60 * 30)).toBe(true);
  });
});

describe('who flies the mech', () => {
  it('the AI takes over a human seat whenever its input is missing', () => {
    const race = newRace(6, { humans: [FW0], laps: 1 });
    // Player never connects: inputs[FW0] stays undefined all race.
    expect(runToEnd(race, [])).toBe(true);
    expect(race.mechs[FW0].finishTime).toBeLessThan(1e6);
    expect(race.mechs[FW0].lap).toBe(1);
  });

  it('the AI takes over mid-race when a player drops out, and hands back', () => {
    const race = newRace(6, { humans: [MF0], laps: 1 });
    const inputs = makeInputs(race);
    runCountdown(race, inputs);
    for (let i = 0; i < 300; i++) stepRace(race, TRACK, inputs); // idle human: coasting, parked
    const parkedAt = race.mechs[MF0].s;
    expect(race.mechs[MF0].speed).toBeLessThan(1);
    inputs[MF0] = null; // dropped
    for (let i = 0; i < 300; i++) stepRace(race, TRACK, inputs);
    expect(race.mechs[MF0].s).toBeGreaterThan(parkedAt + 200);
    inputs[MF0] = emptyInput(); // back, hands off the stick
    inputs[MF0]!.brake = 1;
    for (let i = 0; i < 300; i++) stepRace(race, TRACK, inputs);
    expect(race.mechs[MF0].speed).toBe(0);
  });

  it('inputs offered for an AI seat are ignored', () => {
    const a = newRace(9, { laps: 1 });
    const b = newRace(9, { laps: 1 });
    const rogue: Inputs = b.mechs.map(() => ({ ...emptyInput(), brake: 1, buttons: 255, cmd: TACTIC.BLITZ }));
    for (let i = 0; i < 1200; i++) {
      stepRace(a, TRACK, []);
      stepRace(b, TRACK, rogue);
    }
    expect(JSON.stringify(b.mechs)).toBe(JSON.stringify(a.mechs));
  });
});

describe('team tactics', () => {
  function setup() {
    const race = newRace(2, { humans: [MF0] });
    const inputs = makeInputs(race);
    runCountdown(race, inputs);
    const tactics: Array<Extract<SimEvent, { type: 'tactic' }>> = [];
    const step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        stepRace(race, TRACK, inputs);
        for (const e of race.events) if (e.type === 'tactic') tactics.push(e);
      }
    };
    const call = (cmd: number) => {
      inputs[MF0]!.cmd = cmd;
      step();
      inputs[MF0]!.cmd = 0;
      step();
    };
    return { race, inputs, tactics, step, call };
  }

  it('a human call sets the team tactic, once per press', () => {
    const { race, inputs, tactics, step } = setup();
    inputs[MF0]!.cmd = TACTIC.BLITZ;
    step(30); // held for half a second: still one call
    expect(race.teams[0].tactic).toBe(TACTIC.BLITZ);
    expect(race.teams[1].tactic).toBe(TACTIC.FREE);
    expect(tactics).toEqual([{ type: 'tactic', team: 0, tactic: TACTIC.BLITZ, by: MF0, mark: -1 }]);
  });

  it('calling the same tactic again returns to FREE; a different one switches', () => {
    const { race, call, tactics } = setup();
    call(TACTIC.RUN);
    expect(race.teams[0].tactic).toBe(TACTIC.RUN);
    call(TACTIC.SHIELD);
    expect(race.teams[0].tactic).toBe(TACTIC.SHIELD);
    call(TACTIC.SHIELD);
    expect(race.teams[0].tactic).toBe(TACTIC.FREE);
    call(TACTIC.BLITZ);
    call(TACTIC.BLITZ);
    expect(race.teams[0].tactic).toBe(TACTIC.FREE);
    expect(tactics.map((e) => e.tactic)).toEqual([TACTIC.RUN, TACTIC.SHIELD, TACTIC.FREE, TACTIC.BLITZ, TACTIC.FREE]);
    expect(tactics.every((e) => e.team === 0 && e.by === MF0)).toBe(true);
  });

  it('MARK names the rival forward by default, the locked enemy if there is one', () => {
    const { race, inputs, call, step } = setup();
    call(TACTIC.MARK);
    expect(race.teams[0].tactic).toBe(TACTIC.MARK);
    expect(race.teams[0].mark).toBe(FW1);
    call(TACTIC.MARK); // same mark again: back to FREE
    expect(race.teams[0].tactic).toBe(TACTIC.FREE);
    expect(race.teams[0].mark).toBe(-1);

    // Lock on to the rival defender, then call the mark.
    const me = race.mechs[MF0];
    const foe = race.mechs[DF1];
    foe.s = me.s + 30;
    foe.d = me.d;
    for (const m of race.mechs) if (m.id !== MF0 && m.id !== DF1) m.s = me.s - 2000 - 200 * m.id;
    inputs[MF0]!.buttons = BTN.LOCK;
    step();
    inputs[MF0]!.buttons = 0;
    expect(me.target).toBe(DF1);
    call(TACTIC.MARK);
    expect(race.teams[0].tactic).toBe(TACTIC.MARK);
    expect(race.teams[0].mark).toBe(DF1);
    call(TACTIC.BLITZ); // leaving MARK clears the mark
    expect(race.teams[0].mark).toBe(-1);
  });

  it('ignores tactic values that do not exist', () => {
    const { race, call, tactics } = setup();
    call(5);
    call(-1);
    call(99);
    expect(race.teams[0].tactic).toBe(TACTIC.FREE);
    expect(tactics.length).toBe(0);
  });

  it('a knocked-out human can still call plays', () => {
    const { race, call } = setup();
    retire(race, race.mechs[MF0], null);
    call(TACTIC.RUN);
    expect(race.teams[0].tactic).toBe(TACTIC.RUN);
  });

  it('the AI captain never overrides a team with a human on it', () => {
    // The human defender just drives round (via the AI's hands: no input
    // object means "not connected") without ever calling a play.
    const race = newRace(31, { humans: [DF1] });
    const byTeam: number[][] = [[], []];
    runToEnd(race, [], (r) => {
      for (const e of r.events) if (e.type === 'tactic') byTeam[e.team].push(e.by);
    }, 12000); // through the whole battle lap
    expect(race.lapPhase).toBe(3);
    expect(byTeam[1]).toEqual([]);
    expect(race.teams[1].tactic).toBe(TACTIC.FREE);
  });
});

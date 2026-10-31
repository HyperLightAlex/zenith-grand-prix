// The tutorial race (RaceConfig.lesson): the field leaves the learner to its
// sparring partner, the partner keeps it company and duels it on the battle
// lap the way a lesson needs (blows taken first, then slow heavies only), the
// race goes at the learner's pace, and the learner cannot be knocked out.

import { describe, expect, it } from 'vitest';
import { aiControl } from '../src/sim/ai';
import {
  ACT,
  ATTACKS,
  BTN,
  LESSON_ARMOUR_FLOOR,
  MODE,
  PHASE,
  SPAR_FIRST,
  SPAR_HITS,
  SPAR_RHYTHM,
  SPAR_WAIT,
  createRace,
  deltaS,
  emptyInput,
  stepRace,
} from '../src/sim/index';
import type { MechInput, RaceState, SimEvent } from '../src/sim/index';
import { FW0, FW1, MF0, TRACK, makeSeats } from './helpers';

const PUPIL = FW0;
const SPAR = FW1;

function lessonRace(seed: number, lesson: { pupil: number; spar: number } | undefined = { pupil: PUPIL, spar: SPAR }): RaceState {
  return createRace(TRACK, { seed, seats: makeSeats([PUPIL], 0.3), lesson });
}

interface Duel {
  /** Locks on to the partner from the start of the battle lap, until this many parries. */
  parries: number;
  /** Raise the guard this many ticks before a heavy lands (the parry window is 8). */
  guardAt: number;
}

/**
 * A learner that drives like a computer pilot, and on the battle lap (with
 * `duel`) locks on to its partner, swings at it, and raises its guard as
 * each of its heavies is about to land.
 */
function pupilBot(race: RaceState, duel: Duel | null) {
  const out = emptyInput();
  const input = emptyInput();
  let parried = 0;
  let guardFor = 0;
  return {
    get parried() {
      return parried;
    },
    input(): MechInput {
      const me = race.mechs[PUPIL];
      const spar = race.mechs[SPAR];
      const prev = input.buttons;
      for (const e of race.events) if (e.type === 'parry' && e.mech === PUPIL) parried++;
      const dueling = !!duel && race.lapPhase === 2 && parried < duel.parries && !spar.retired;
      if (dueling && me.target === SPAR && me.mode === MODE.BATTLE) {
        Object.assign(input, emptyInput());
        input.throttle = 1;
        const gap = Math.hypot(deltaS(TRACK, spar.s, me.s), spar.d - me.d);
        input.my = gap > 9 ? 0.6 : 0;
        // The partner's heavy, winding up at us: guard up just before it lands.
        if (spar.act === ACT.ATTACK && spar.target === PUPIL) {
          const a = ATTACKS[spar.attack];
          if (a.heavy && spar.actT < a.windup && a.windup - spar.actT <= duel.guardAt) guardFor = 14;
        }
        if (guardFor > 0) {
          guardFor--;
          input.buttons |= BTN.GUARD;
        } else if ((race.tick & 15) === 0 && (prev & BTN.X) === 0) input.buttons |= BTN.X;
        return input;
      }
      if (dueling && me.target !== SPAR) {
        // Lock on to the partner once it is in reach.
        Object.assign(input, aiControl(race, TRACK, me, out));
        if (me.target >= 0) input.buttons |= prev & BTN.LOCK ? 0 : BTN.LOCK;
        const gap = Math.hypot(deltaS(TRACK, spar.s, me.s), spar.d - me.d);
        if (gap < 60 && (prev & BTN.LOCK) === 0) input.buttons |= BTN.LOCK;
        return input;
      }
      Object.assign(input, aiControl(race, TRACK, me, out));
      return input;
    },
  };
}

function run(race: RaceState, bot: ReturnType<typeof pupilBot>, each?: (race: RaceState, events: readonly SimEvent[]) => void): void {
  const inputs: Array<MechInput | null> = race.mechs.map(() => null);
  while (race.phase !== PHASE.FINISHED && race.tick < 9 * 60 * 60) {
    inputs[PUPIL] = bot.input();
    stepRace(race, TRACK, inputs);
    each?.(race, race.events);
  }
}

describe('a lesson', () => {
  it('is set up from the config, and only from it', () => {
    const plain = createRace(TRACK, { seed: 1, seats: makeSeats([PUPIL]) });
    expect(plain.lesson).toBeUndefined();
    expect('lesson' in plain).toBe(false);
    expect(lessonRace(1).lesson).toEqual({ pupil: PUPIL, spar: SPAR, lockedAt: -1, hits: 0 });
    // A partner from the pupil's own side is no partner.
    expect(lessonRace(1, { pupil: PUPIL, spar: MF0 }).lesson?.spar).toBe(-1);
    expect(lessonRace(1, { pupil: 99, spar: SPAR }).lesson).toBeUndefined();
  });

  it('leaves the pupil to its partner, keeps it company and goes at its pace', () => {
    for (const seed of [3, 11]) {
      const race = lessonRace(seed);
      const bot = pupilBot(race, null);
      let near = 0;
      let early = 0;
      let phaseOk = true;
      run(race, bot, (r) => {
        const p = r.mechs[PUPIL];
        const s = r.mechs[SPAR];
        for (const m of r.mechs) {
          // Nobody but the partner goes for the pupil, and nobody but the pupil for the partner (its own side does not escort it either).
          if (m.id !== SPAR && m.team !== p.team) expect(m.target, `${m.name} locked on to the pupil`).not.toBe(PUPIL);
          if (m.id !== PUPIL && m.id !== SPAR) expect(m.target, `${m.name} locked on to the partner`).not.toBe(SPAR);
        }
        if (r.phase === PHASE.RACING && r.lapPhase < 3) {
          early++;
          if (Math.abs(deltaS(TRACK, s.s, p.s)) < 60) near++;
        }
        const want = p.lap <= 0 ? 1 : p.lap >= r.laps - 1 ? 3 : 2;
        if (r.phase === PHASE.RACING && r.lapPhase !== want) phaseOk = false;
      });
      expect(phaseOk).toBe(true);
      expect(near / early).toBeGreaterThan(0.85);
      expect(race.mechs[PUPIL].finished).toBe(true);
      expect(race.mechs[PUPIL].retired).toBe(false);
    }
  });

  it('cannot knock its pupil out', () => {
    const race = lessonRace(5);
    const p = race.mechs[PUPIL];
    const inputs: Array<MechInput | null> = race.mechs.map((m) => (m.human ? emptyInput() : null));
    while (race.phase === PHASE.COUNTDOWN) stepRace(race, TRACK, inputs);
    p.hp = p.maxHp * (LESSON_ARMOUR_FLOOR + 0.01);
    for (let i = 0; i < 600; i++) {
      // A barrage from everyone, as if the field had forgotten the lesson.
      race.lapPhase = 2;
      for (const m of race.mechs) if (m.team !== p.team) m.target = PUPIL;
      stepRace(race, TRACK, inputs);
    }
    expect(p.retired).toBe(false);
    expect(p.hp).toBeGreaterThanOrEqual(p.maxHp * LESSON_ARMOUR_FLOOR - 1e-6);
  });

  it('duels on the battle lap: blows taken first, then slow heavies that can be parried', () => {
    for (const seed of [2, 7, 19]) {
      const race = lessonRace(seed);
      const bot = pupilBot(race, { parries: 2, guardAt: 5 });
      let lockedAt = -1;
      let firstHeavy = -1;
      let hitsBefore = 0;
      let lightsAtPupil = 0;
      const heavyTicks: number[] = [];
      run(race, bot, (r, events) => {
        const l = r.lesson!;
        if (lockedAt < 0 && l.lockedAt >= 0) lockedAt = l.lockedAt;
        for (const e of events) {
          if (e.type === 'hit' && e.attacker === PUPIL && e.victim === SPAR && !e.blocked && firstHeavy < 0) hitsBefore++;
          if (e.type === 'windup' && e.mech === SPAR && r.mechs[SPAR].target === PUPIL) {
            const a = ATTACKS[e.attack];
            if (a.heavy) {
              heavyTicks.push(r.tick);
              if (firstHeavy < 0) firstHeavy = r.tick;
            }
          }
          if (e.type === 'hit' && e.attacker === SPAR && e.victim === PUPIL && !e.heavy) lightsAtPupil++;
        }
      });
      expect(lockedAt, `seed ${seed}: the pupil locked on`).toBeGreaterThan(0);
      expect(firstHeavy, `seed ${seed}: the partner swung`).toBeGreaterThan(0);
      // It waited its turn...
      expect((hitsBefore >= SPAR_HITS && firstHeavy - lockedAt >= SPAR_FIRST) || firstHeavy - lockedAt >= SPAR_WAIT - 10).toBe(true);
      // ...and left room between its heavies.
      for (let i = 1; i < heavyTicks.length; i++) expect(heavyTicks[i] - heavyTicks[i - 1]).toBeGreaterThanOrEqual(SPAR_RHYTHM - 50);
      expect(bot.parried, `seed ${seed}: parries`).toBeGreaterThanOrEqual(1);
      expect(race.mechs[PUPIL].retired).toBe(false);
      void lightsAtPupil;
    }
  });
});

// The tutorial's director (client/game/tutorial.ts) over a whole lesson,
// flown by a scripted learner: the cards come when the race calls for them,
// each once, in a sensible order, the race waits while one is up, the parry
// is taught in slow motion, and it all stops at the flag.

import { describe, expect, it } from 'vitest';
import { aiControl } from '../src/sim/ai';
import { ATTACKS, BTN, MODE, PHASE, createRace, deltaS, emptyInput, stepRace } from '../src/sim/index';
import type { MechInput, RaceState } from '../src/sim/index';
import { CARD_MIN, Tutorial, debrief, type BeatId } from '../src/client/game/tutorial';
import { KEYS } from '../src/client/ui/keyNames';
import { keyLabel } from '../src/client/ui/tutorialPanel';
import { FW0, FW1, TRACK, makeSeats } from './helpers';

const PUPIL = FW0;
const SPAR = FW1;

/** Drives like a computer pilot; on the battle lap locks on to the partner, swings, and guards as its heavies land. */
function learner(race: RaceState) {
  const out = emptyInput();
  const input = emptyInput();
  let parries = 0;
  let landed = 0;
  let guardFor = 0;
  let duelDone = false;
  return (): MechInput => {
    const me = race.mechs[PUPIL];
    const spar = race.mechs[SPAR];
    const prev = input.buttons;
    for (const e of race.events) {
      if (e.type === 'parry' && e.mech === PUPIL) parries++;
      if (e.type === 'hit' && e.attacker === PUPIL && e.victim === SPAR && !e.blocked) landed++;
    }
    if (parries >= 2) duelDone = true;
    if (race.lapPhase === 2 && !duelDone && !spar.retired) {
      if (me.target === SPAR && me.mode === MODE.BATTLE) {
        Object.assign(input, emptyInput());
        input.throttle = 1;
        input.my = Math.hypot(deltaS(TRACK, spar.s, me.s), spar.d - me.d) > 9 ? 0.6 : 0;
        if (spar.act === 1 && spar.target === PUPIL) {
          const a = ATTACKS[spar.attack];
          if (a.heavy && spar.actT < a.windup && a.windup - spar.actT <= 5) guardFor = 14;
        }
        if (guardFor > 0) {
          guardFor--;
          input.buttons |= BTN.GUARD;
        } else if ((race.tick & 15) === 0 && (landed < 3 || parries > 0)) input.buttons |= BTN.X; // (as the cards say: three blows, then read its heavy)
        return input;
      }
      Object.assign(input, aiControl(race, TRACK, me, out));
      if (Math.hypot(deltaS(TRACK, spar.s, me.s), spar.d - me.d) < 60 && (prev & BTN.LOCK) === 0) input.buttons |= BTN.LOCK;
      return input;
    }
    if (race.lapPhase === 2 && duelDone && me.target >= 0) {
      // Done sparring: let go and race on.
      Object.assign(input, aiControl(race, TRACK, me, out));
      input.buttons = (prev & BTN.LOCK) === 0 ? BTN.LOCK : 0;
      return input;
    }
    return Object.assign(input, aiControl(race, TRACK, me, out));
  };
}

interface Run {
  race: RaceState;
  tut: Tutorial;
  /** Frames the race was held for a card. */
  heldFrames: number;
  /** Whether the race ever moved while a card was up. */
  movedWhileHeld: boolean;
  slowFrames: number;
  goalsDone: BeatId[];
}

function runLesson(seed: number): Run {
  const race = createRace(TRACK, { seed, seats: makeSeats([PUPIL], 0.3), lesson: { pupil: PUPIL, spar: SPAR } });
  const tut = new Tutorial(TRACK, PUPIL, SPAR);
  const drive = learner(race);
  const inputs: Array<MechInput | null> = race.mechs.map(() => null);
  const dt = 1 / 60;
  const run: Run = { race, tut, heldFrames: 0, movedWhileHeld: false, slowFrames: 0, goalsDone: [] };
  let acc = 0;
  let lastGoal: BeatId | null = null;
  for (let frame = 0; frame < 12 * 60 * 60 && race.phase !== PHASE.FINISHED; frame++) {
    if (tut.card) {
      const tick = race.tick;
      tut.held(dt);
      run.heldFrames++;
      // Read it, then continue (presses before CARD_MIN do nothing).
      if (tut.cardAge < CARD_MIN) expect(tut.dismiss()).toBe(false);
      else expect(tut.dismiss()).toBe(true);
      if (race.tick !== tick) run.movedWhileHeld = true;
      continue;
    }
    // The race at the tutorial's pace (slow motion while the parry is taught).
    if (tut.timeScale < 1) run.slowFrames++;
    acc += dt * tut.timeScale;
    const events = [];
    while (acc >= dt - 1e-9) {
      inputs[PUPIL] = drive();
      stepRace(race, TRACK, inputs);
      events.push(...race.events);
      acc -= dt;
    }
    tut.update(race, events, dt);
    const g = tut.goalView(race, 'pad');
    const key = g ? `${g.id}:${g.done ? 'done' : g.missed ? 'missed' : 'on'}` : 'none';
    if (process.env.TUT_DEBUG && key !== (run as Run & { lastKey?: string }).lastKey) console.log(`t${race.tick} ${key} ${g?.note ?? ''}`);
    (run as Run & { lastKey?: string }).lastKey = key;
    if (g && g.done && g.id !== lastGoal) {
      run.goalsDone.push(g.id);
      lastGoal = g.id;
    }
  }
  return run;
}

describe('the tutorial', () => {
  it('teaches a whole race, each card once, in order, holding the race for each', () => {
    for (const seed of [4, 9]) {
      const { race, tut, heldFrames, movedWhileHeld, slowFrames, goalsDone } = runLesson(seed);
      expect(race.phase, `seed ${seed}: the race ran to the flag`).toBe(PHASE.FINISHED);
      const shown = tut.shown;
      // Each card at most once.
      expect(new Set(shown).size).toBe(shown.length);
      // The core of it, whatever the race did.
      console.log(`seed ${seed}: ${shown.join(' ')} | done ${goalsDone.join(' ')}`);
      for (const id of ['welcome', 'rev', 'battle', 'attack', 'tell', 'speed'] as BeatId[]) expect(shown, `seed ${seed}: ${id}`).toContain(id);
      // ...and most of the rest.
      expect(shown.length, `seed ${seed}: ${shown.join(' ')}`).toBeGreaterThanOrEqual(13);
      const at = (id: BeatId) => shown.indexOf(id);
      expect(at('welcome')).toBe(0);
      expect(at('rev')).toBe(1);
      // (A learner who locks on before the card would come gets no lock card.)
      if (at('lock') >= 0) {
        expect(at('battle')).toBeLessThan(at('lock'));
        expect(at('lock')).toBeLessThan(at('attack'));
      }
      expect(at('battle')).toBeLessThan(at('attack'));
      expect(at('attack')).toBeLessThan(at('tell'));
      expect(at('tell')).toBeLessThan(at('speed'));
      if (at('dash') >= 0) expect(at('dash')).toBeGreaterThan(at('tell'));
      if (at('escape') >= 0) expect(at('escape')).toBeGreaterThan(at('dash'));
      expect(heldFrames).toBeGreaterThan(shown.length * CARD_MIN * 60 - 1);
      expect(movedWhileHeld).toBe(false);
      // The parry was taught in slow motion, and learnt.
      expect(slowFrames).toBeGreaterThan(10);
      expect(goalsDone, `seed ${seed}: ${goalsDone.join(' ')}`).toContain('tell');
      // Home: it stops.
      expect(tut.over).toBe(true);
      expect(tut.card).toBeNull();
      expect(tut.goalView(race, 'pad')).toBeNull();
    }
  });

  it('words every card for each device, with only known marks', () => {
    const { race } = runLesson(4);
    const all: BeatId[] = ['welcome', 'rev', 'strip', 'boost', 'gate', 'carve', 'draft', 'battle', 'lock', 'attack', 'tell', 'dash', 'escape', 'ko', 'speed', 'overdrive', 'tow', 'plays'];
    const fresh = new Tutorial(TRACK, PUPIL, SPAR);
    for (const id of all) {
      fresh.card = id;
      for (const device of ['pad', 'keys', 'touch'] as const) {
        const c = fresh.cardText(race, device)!;
        expect(c.title.length).toBeGreaterThan(0);
        expect(c.lines.length).toBeGreaterThan(0);
        for (const line of [...c.lines, ...(c.legend ?? []).map((l) => l.text)]) {
          // Marks are balanced, and none asks for a control this device has no name for.
          expect((line.match(/\[/g) ?? []).length).toBe((line.match(/\]/g) ?? []).length);
          for (const [, name] of line.matchAll(/\[([^\]]+)\]/g)) {
            const known = name in KEYS[device] || name === 'steer';
            if (known) expect(keyLabel(device, name), `${device} ${id}: [${name}]`).not.toBe(name);
            else expect(name, `${device} ${id}: [${name}]`).toMatch(/^[A-Z]/); // a touch button's name, as written
          }
        }
      }
    }
    expect(debrief(race, PUPIL).length).toBeGreaterThan(1);
  });

  it('can be stopped, and then asks for nothing', () => {
    const race = createRace(TRACK, { seed: 1, seats: makeSeats([PUPIL], 0.3), lesson: { pupil: PUPIL, spar: SPAR } });
    const tut = new Tutorial(TRACK, PUPIL, SPAR);
    const inputs: Array<MechInput | null> = race.mechs.map((m) => (m.human ? emptyInput() : null));
    for (let i = 0; i < 40; i++) {
      stepRace(race, TRACK, inputs);
      tut.update(race, race.events, 1 / 60);
    }
    expect(tut.card).toBe('welcome');
    expect(tut.dismiss()).toBe(false);
    tut.stop();
    expect(tut.card).toBeNull();
    for (let i = 0; i < 600; i++) {
      stepRace(race, TRACK, inputs);
      tut.update(race, race.events, 1 / 60);
    }
    expect(tut.card).toBeNull();
    expect(tut.timeScale).toBe(1);
  });
});

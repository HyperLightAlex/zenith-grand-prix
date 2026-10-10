// Abilities, part one: the button, what it costs, when it is refused, and the
// forward's two moves (Overdrive free steering, Break Away locked on or mid-hit).
// The midfielder's and defender's moves are in abilities-attacks.test.ts.
import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  ABILITY,
  ABILITY_COOLDOWN,
  ACT,
  ATK,
  ATTACKS,
  BREAKAWAY_IFRAMES,
  BTN,
  BTN_MASK,
  CLASSES,
  COAST_DRAG,
  DEFAULT_RULES,
  DT,
  MODE,
  OVERCAP_DRAG,
  OVERDRIVE_ACCEL,
  PHASE,
  ROLE,
  SPEED_CEILING,
  abilityFor,
  clamp,
  cycleTarget,
  lockable,
  ownTopSpeed,
  pickTarget,
  setTarget,
  speedCap,
  stepRace,
  ticks,
  weaponsFree,
} from '../src/sim/index';
import type { Ability, MechInput, MechState, Rules } from '../src/sim/index';
import { applyHit, retire, setStagger, tryAbility } from '../src/sim/combat';
import { Arena, DF0, DF1, FW0, FW1, MF0, MF1, TRACK, effectTimers, giveCells, makeInputs, newRace, runCountdown } from './helpers';

const L = TRACK.length;
const EPS = 1e-9;

// ---- one scenario per ability ----------------------------------------------

interface Scene {
  a: Arena;
  /** The mech that will press the button. */
  user: MechState;
  /** Put everything the ability needs back in place (the rival in the sights, the lock held). */
  arm: () => void;
}

interface Case {
  ability: Ability;
  id: number;
  locked: boolean;
  make: (lapPhase?: 1 | 2 | 3, rules?: Partial<Rules>) => Scene;
}

/** A mech with a full set of Cells, and a rival placed `ahead`/`side` of it whenever the scene is armed. */
function scene(id: number, locked: boolean, ahead: number, side: number): Case['make'] {
  return (lapPhase = 2, rules) => {
    const a = new Arena(lapPhase, 1, rules);
    const user = giveCells(a.put(id, -200, 0));
    const foe = a.put(FW1, -200 + ahead, side);
    const arm = () => {
      a.recenter([id, FW1], 250, 400);
      foe.s = user.s + ahead;
      foe.d = user.d + side;
      if (locked && user.target !== FW1 && user.act !== ACT.STAGGER) setTarget(a.race, user, FW1);
    };
    arm();
    a.step(2);
    arm();
    a.clearLog();
    return { a, user, arm };
  };
}

const CASES: Case[] = [
  { ability: ABILITY.OVERDRIVE, id: FW0, locked: false, make: scene(FW0, false, 60, 14) },
  { ability: ABILITY.BREAKAWAY, id: FW0, locked: true, make: scene(FW0, true, 30, 8) },
  { ability: ABILITY.SNARE, id: MF0, locked: false, make: scene(MF0, false, 40, 0) },
  { ability: ABILITY.PULSE, id: MF0, locked: true, make: scene(MF0, true, 16, 8) },
  { ability: ABILITY.RAM, id: DF0, locked: false, make: scene(DF0, false, 60, 14) },
  { ability: ABILITY.AEGIS, id: DF0, locked: true, make: scene(DF0, true, 30, 8) },
];
const nameOf = (ab: number) => ABILITIES[ab].name;

/** Ability events raised by one mech so far. */
const uses = (a: Arena, id: number) => a.events('ability').filter((e) => e.mech === id);

describe('the ability table', () => {
  it('six abilities, two per frame: one free steering, one locked on', () => {
    expect(ABILITY).toEqual({ OVERDRIVE: 0, BREAKAWAY: 1, SNARE: 2, PULSE: 3, RAM: 4, AEGIS: 5 });
    expect(ABILITIES.map((a) => a.key)).toEqual(['overdrive', 'breakaway', 'snare', 'pulse', 'ram', 'aegis']);
    expect(ABILITIES.map((a) => a.name)).toEqual(['Overdrive', 'Break Away', 'Snare', 'Disruptor', 'Ram', 'Aegis']);
    for (const a of ABILITIES) expect(a.blurb.length).toBeGreaterThan(10);
    expect(CLASSES.map((c) => [c.abilityFree, c.abilityLocked])).toEqual([
      [ABILITY.OVERDRIVE, ABILITY.BREAKAWAY],
      [ABILITY.SNARE, ABILITY.PULSE],
      [ABILITY.RAM, ABILITY.AEGIS],
    ]);
    expect(CLASSES.map((c) => c.role)).toEqual([ROLE.FW, ROLE.MF, ROLE.DF]);
  });

  it('the button is bit 256, inside the mask of bits a controller may send', () => {
    expect(BTN.ABILITY).toBe(256);
    expect(BTN_MASK).toBe(0x1ff);
    expect(BTN.ABILITY & BTN_MASK).toBe(BTN.ABILITY);
    const bits = Object.values(BTN);
    expect(bits.reduce((m, b) => m | b, 0)).toBe(BTN_MASK);
    expect(new Set(bits).size).toBe(bits.length);
    for (const b of bits) expect(b & (b - 1)).toBe(0); // one bit each
  });

  it('the ability attacks are in the attack table, out of reach of the attack buttons', () => {
    expect(ATTACKS[ATK.MF_SNARE].key).toBe('mf_snare');
    expect(ATTACKS[ATK.MF_PULSE].key).toBe('mf_pulse');
    expect(ATTACKS[ATK.DF_RAM].key).toBe('df_ram');
    const reachable = new Set<number>();
    for (const c of CLASSES) {
      for (let i = c.primary; i >= 0; i = ATTACKS[i].next) reachable.add(i);
      for (let i = c.secondary; i >= 0; i = ATTACKS[i].next) reachable.add(i);
    }
    for (const idx of [ATK.MF_SNARE, ATK.MF_PULSE, ATK.DF_RAM]) expect(reachable.has(idx)).toBe(false);
    // The pulse and the ram are heavy and cannot be parried; nothing else in the table is unparryable.
    expect(ATTACKS.filter((x) => x.noParry).map((x) => x.key).sort()).toEqual(['df_ram', 'mf_pulse']);
    expect(ATTACKS[ATK.MF_PULSE].heavy && ATTACKS[ATK.DF_RAM].heavy).toBe(true);
    expect(ATTACKS[ATK.MF_SNARE].heavy).toBe(false);
  });
});

describe('abilityFor: which move the button would fire', () => {
  it('free steering gives the free move, a lock gives the locked one', () => {
    for (const c of CASES) {
      const { user } = c.make();
      expect(abilityFor(user)).toBe(c.ability);
      expect(user.mode === MODE.BATTLE && user.target >= 0).toBe(c.locked);
    }
  });

  it('a lock on a team-mate counts as a lock', () => {
    const a = new Arena(2);
    for (const [id, mate, want] of [
      [FW0, MF0, ABILITY.BREAKAWAY],
      [MF0, DF0, ABILITY.PULSE],
      [DF0, FW0, ABILITY.AEGIS],
    ] as const) {
      const m = a.put(id, 0, 0);
      a.put(mate, 25, 8);
      expect(abilityFor(m)).toBe(CLASSES[m.role].abilityFree);
      a.tap(id, BTN.ALLY);
      expect(m.target).toBe(mate);
      expect(abilityFor(m)).toBe(want);
      a.tap(id, BTN.ALLY); // let go again
      a.put(id, -1000 - 300 * id, 0, 0);
      a.put(mate, -1200 - 300 * mate, 0, 0);
    }
  });

  it('reeling from a hit, only the forward has one: Break Away, locked or not', () => {
    const a = new Arena(2);
    for (const id of [FW0, MF0, DF0]) {
      const m = a.put(id, 100 * id, 0);
      setStagger(m, 30);
      expect(abilityFor(m)).toBe(id === FW0 ? ABILITY.BREAKAWAY : -1);
    }
    // ...and the same in a lock.
    const b = new Arena(2);
    for (const id of [FW0, MF0, DF0]) {
      const m = b.put(id, 100 * id, 0);
      b.put(FW1, 100 * id + 30, 8);
      setTarget(b.race, m, FW1);
      setStagger(m, 30);
      expect(abilityFor(m)).toBe(id === FW0 ? ABILITY.BREAKAWAY : -1);
      setTarget(b.race, m, -1);
    }
  });

  it('other actions do not change it: mid-attack and mid-dash it is still free or locked', () => {
    const a = new Arena(2);
    const m = a.put(MF0, 0, 0);
    m.act = ACT.ATTACK;
    expect(abilityFor(m)).toBe(ABILITY.SNARE);
    m.act = ACT.DASH;
    expect(abilityFor(m)).toBe(ABILITY.SNARE);
  });
});

describe('using an ability', () => {
  for (const c of CASES) {
    const name = nameOf(c.ability);

    it(`${name}: one press spends one Cell, raises the event and starts the cooldown`, () => {
      const { a, user } = c.make();
      expect(user.cells).toBe(3);
      expect(user.cdAbility).toBe(0);
      const T = a.ability(c.id);
      expect(uses(a, c.id)).toEqual([{ type: 'ability', mech: c.id, ability: c.ability, tick: T }]);
      expect(a.events('ability').length).toBe(1);
      expect(user.cells).toBe(2);
      expect(user.cdAbility).toBe(ABILITY_COOLDOWN);
      expect(a.events('denied').length).toBe(0);
    });

    it(`${name}: cannot be used again for ABILITY_COOLDOWN ticks`, () => {
      /** Use it, then press again `offset` ticks later. How many uses? */
      const again = (offset: number): number => {
        const { a, user, arm } = c.make();
        const T = a.ability(c.id);
        a.step(offset - 1, arm);
        arm();
        expect(user.cdAbility).toBe(ABILITY_COOLDOWN - (offset - 1));
        a.clearLog();
        expect(a.ability(c.id)).toBe(T + offset);
        // A cooldown is silent: it is not a "denied".
        if (a.events('ability').length === 0) expect(a.events('denied').length).toBe(0);
        expect(user.cells).toBe(a.events('ability').length ? 1 : 2);
        return 1 + a.events('ability').filter((e) => e.mech === c.id).length;
      };
      expect(again(2)).toBe(1);
      expect(again(20)).toBe(1);
      expect(again(ABILITY_COOLDOWN - 1)).toBe(1);
      expect(again(ABILITY_COOLDOWN)).toBe(2);
      expect(ABILITY_COOLDOWN).toBe(45);
    });

    it(`${name}: is refused on the formation lap ("weapons"), and costs nothing`, () => {
      const { a, user } = c.make(1);
      expect(weaponsFree(a.race)).toBe(false);
      const T = a.ability(c.id);
      a.step(10);
      expect(a.events('ability').length).toBe(0);
      expect(a.events('denied')).toEqual([{ type: 'denied', mech: c.id, reason: 'weapons', tick: T }]);
      expect(user.cells).toBe(3);
      expect(user.cdAbility).toBe(0);
      expect(a.race.projectiles.length).toBe(0);
      expect(a.events('hit').length + a.events('shot').length + a.events('unlock').length).toBe(0);
      for (const m of a.race.mechs) expect(effectTimers(m)).toEqual([0, 0, 0, 0, 0]);
      // The whole race is exactly where it would be had the button never been
      // touched (bar the bookkeeping of the "denied" cue itself).
      const control = c.make(1);
      control.a.step(11);
      user.deniedTick = control.user.deniedTick;
      expect(JSON.stringify(a.race.mechs)).toBe(JSON.stringify(control.a.race.mechs));
    });

    it(`${name}: is refused without a whole Cell ("cells")`, () => {
      for (const cells of [0, 0.5, 0.99]) {
        const { a, user } = c.make();
        user.cells = cells;
        const T = a.ability(c.id);
        expect(a.events('ability').length).toBe(0);
        expect(a.events('denied')).toEqual([{ type: 'denied', mech: c.id, reason: 'cells', tick: T }]);
        expect(user.cells).toBe(cells);
        expect(user.cdAbility).toBe(0);
        expect(effectTimers(user)).toEqual([0, 0, 0, 0, 0]);
        expect(a.race.projectiles.length).toBe(0);
      }
      // Exactly one is enough, and then it is gone.
      const { a, user, arm } = c.make();
      user.cells = 1;
      a.ability(c.id);
      expect(a.events('ability').length).toBe(1);
      expect(user.cells).toBe(0);
      a.step(ABILITY_COOLDOWN + 5, arm);
      a.clearLog();
      a.ability(c.id);
      expect(a.events('ability').length).toBe(0);
      expect(a.events('denied').map((e) => e.reason)).toEqual(['cells']);
      expect(user.cells).toBe(0);
    });

    it(`${name}: holding the button down is one use, however long`, () => {
      const { a, user, arm } = c.make();
      a.hold(c.id, BTN.ABILITY);
      a.step(300, arm);
      expect(uses(a, c.id).length).toBe(1);
      expect(user.cells).toBe(2);
      // Let go and press again: that is a second press.
      a.release(c.id, BTN.ABILITY).step(2, arm);
      a.ability(c.id);
      expect(uses(a, c.id).length).toBe(2);
      expect(user.cells).toBe(1);
    });

    it(`${name}: hammering the button cannot burn Cells faster than one per cooldown, or more than there are`, () => {
      const { a, user, arm } = c.make();
      const at: number[] = [];
      for (let i = 0; i < 400; i++) {
        arm();
        // Down on even ticks, up on odd ones: a press edge every other tick.
        if (i % 2 === 0) a.hold(c.id, BTN.ABILITY);
        else a.release(c.id, BTN.ABILITY);
        const before = user.cells;
        a.step(1);
        for (const e of a.race.events) if (e.type === 'ability' && e.mech === c.id) at.push(a.race.tick);
        expect(user.cells === before || user.cells === before - 1).toBe(true);
        expect(user.cells).toBeGreaterThanOrEqual(0);
      }
      expect(at.length).toBe(3);
      expect(at[1] - at[0]).toBeGreaterThanOrEqual(ABILITY_COOLDOWN);
      expect(at[2] - at[1]).toBeGreaterThanOrEqual(ABILITY_COOLDOWN);
      expect(user.cells).toBe(0);
      expect(a.events('denied').some((e) => e.mech === c.id && e.reason === 'cells')).toBe(true);
    });
  }

  it('the press is an edge: a button already down when the mech becomes able does nothing', () => {
    // Held through a stagger (when a midfielder has no move), and still down when it ends.
    const { a, user } = CASES[2].make();
    setStagger(user, 20);
    a.hold(MF0, BTN.ABILITY).step(60);
    expect(user.act).toBe(ACT.NONE);
    expect(a.events('ability').length).toBe(0);
    expect(a.events('denied').length).toBe(0);
    expect(user.cells).toBe(3);
  });

  it('a staggered midfielder or defender has no ability: nothing happens, nothing is spent', () => {
    for (const c of CASES.filter((x) => x.id !== FW0)) {
      const { a, user } = c.make();
      setStagger(user, 30);
      a.ability(c.id);
      expect(a.events('ability').length).toBe(0);
      expect(a.events('denied').length).toBe(0);
      expect(user.cells).toBe(3);
      expect(user.cdAbility).toBe(0);
      // Once it has recovered the same press works.
      a.step(40);
      expect(user.act).toBe(ACT.NONE);
    }
  });

  it('a wreck, a finisher and a mech in the countdown cannot use one', () => {
    // Knocked out.
    const w = CASES[0].make();
    retire(w.a.race, w.user, null);
    w.a.ability(FW0);
    w.a.step(5);
    expect(w.a.events('ability').length).toBe(0);
    expect(w.user.cells).toBe(3);
    expect(w.user.overdriveT).toBe(0);

    // Across the line.
    const f = new Arena(3);
    const done = giveCells(f.put(FW0, L - 30, 0));
    f.until(() => done.finished, 60);
    expect(done.finished).toBe(true);
    f.ability(FW0);
    f.step(5);
    expect(f.events('ability').length).toBe(0);
    expect(done.cells).toBe(3);
    expect(done.overdriveT).toBe(0);

    // On the grid, with Cells in hand from the rules.
    const race = newRace(3, { humans: [FW0], rules: { cellStart: 3 } });
    const inputs = makeInputs(race);
    for (let i = 0; i < 200; i++) {
      (inputs[FW0] as MechInput).buttons = i % 3 === 0 ? BTN.ABILITY : 0;
      stepRace(race, TRACK, inputs);
      expect(race.events.every((e) => e.type === 'countdown')).toBe(true);
    }
    expect(race.mechs[FW0].cells).toBe(3);
    expect(race.mechs[FW0].cdAbility).toBe(0);
  });

  it('after the flag nothing fires either', () => {
    const race = newRace(3, { humans: [FW0], laps: 1, rules: { cellStart: 3 } });
    const inputs = makeInputs(race);
    runCountdown(race, inputs);
    race.lapPhase = 2;
    race.phase = PHASE.FINISHED;
    for (let i = 0; i < 20; i++) {
      (inputs[FW0] as MechInput).buttons = i % 2 ? BTN.ABILITY : 0;
      stepRace(race, TRACK, inputs);
      expect(race.events.some((e) => e.type === 'ability' || e.type === 'denied')).toBe(false);
    }
    expect(race.mechs[FW0].cells).toBe(3);
  });

  it('works on the speed lap exactly as on the battle lap', () => {
    for (const c of CASES) {
      const { a, user } = c.make(3);
      a.ability(c.id);
      expect(uses(a, c.id).map((e) => e.ability)).toEqual([c.ability]);
      expect(user.cells).toBe(2);
    }
  });

  it('the "denied" cue is not repeated more than twice a second', () => {
    const { a } = CASES[0].make(1);
    for (let i = 0; i < 30; i++) {
      a.ability(FW0);
      a.step(1);
    }
    expect(a.events('denied').length).toBe(2);
    expect(a.events('denied').every((e) => e.reason === 'weapons')).toBe(true);
  });

  it('tryAbility itself is what refuses: called directly, the answers are the same', () => {
    const { a, user } = CASES[4].make();
    user.cells = 0;
    expect(tryAbility(a.race, TRACK, user)).toBe(false);
    user.cells = 1;
    expect(tryAbility(a.race, TRACK, user)).toBe(true);
    expect(user.cells).toBe(0);
    expect(user.ramT).toBe(ticks(a.race.rules.ramSecs));
    user.cells = 3;
    expect(tryAbility(a.race, TRACK, user)).toBe(false); // cooling down
    expect(user.cells).toBe(3);
  });

  it('every timer counts down one a tick and stops at zero', () => {
    const a = new Arena(2);
    const m = a.put(MF0, 0, 0);
    m.cdAbility = 5;
    m.overdriveT = 7;
    m.ramT = 3;
    m.shieldT = 9;
    m.snareT = 4;
    m.cloakT = 6;
    const seen: number[][] = [];
    a.step(10, () => seen.push([m.cdAbility, ...effectTimers(m)]));
    for (let k = 1; k <= 10; k++) {
      expect(seen[k - 1]).toEqual([5, 7, 3, 9, 4, 6].map((t) => Math.max(0, t - k)));
    }
  });

  it('the durations come from the rules, in seconds', () => {
    const a = new Arena(2, 1, { overdriveSecs: 1, ramSecs: 2, aegisSecs: 0.5, breakawaySecs: 3 });
    const fw = giveCells(a.put(FW0, 0, 0));
    const df = giveCells(a.put(DF0, -100, 0));
    a.ability(FW0);
    a.ability(DF0);
    expect(fw.overdriveT).toBe(59); // 60 when pressed, a tick ago
    expect(df.ramT).toBe(120);
    a.step(ABILITY_COOLDOWN);
    a.put(FW1, 30, 8);
    a.put(MF1, -70, 8);
    setTarget(a.race, fw, FW1);
    setTarget(a.race, df, MF1);
    a.hold(FW0, BTN.ABILITY).hold(DF0, BTN.ABILITY).step(1);
    expect(fw.cloakT).toBe(180);
    expect(df.shieldT).toBe(30);
  });
});

// =============================================================================
// OVERDRIVE
// =============================================================================

describe('Overdrive', () => {
  /** A forward alone on the straight, Cells full, cruising at the cap of the lap. */
  function solo(lapPhase: 2 | 3 = 2, rules?: Partial<Rules>) {
    const a = new Arena(lapPhase, 1, rules);
    const m = giveCells(a.put(FW0, -200, 0));
    if (lapPhase === 3) a.step(200, () => a.recenter([FW0]));
    const cap0 = speedCap(a.race, m, CLASSES[m.role]);
    expect(m.speed).toBeCloseTo(cap0, 6);
    return { a, m, cap0 };
  }

  it('lifts the speed cap by rules.overdriveMult for rules.overdriveSecs, to the tick', () => {
    for (const lapPhase of [2, 3] as const) {
      const { a, m, cap0 } = solo(lapPhase);
      const c = CLASSES[m.role];
      const { overdriveMult, overdriveSecs } = a.race.rules;
      const n = ticks(overdriveSecs);
      expect(n).toBe(240);
      const T = a.ability(FW0);
      expect(m.overdriveT).toBe(n);
      expect(speedCap(a.race, m, c)).toBeCloseTo(cap0 * overdriveMult, 9);
      const caps: number[] = [];
      const left: number[] = [];
      a.step(n + 5, () => {
        a.recenter([FW0]);
        caps.push(speedCap(a.race, m, c));
        left.push(m.overdriveT);
      });
      // The press tick was the first of n; the cap is up for exactly n ticks.
      for (let k = 1; k < n; k++) {
        expect(left[k - 1]).toBe(n - k);
        expect(caps[k - 1]).toBeCloseTo(cap0 * overdriveMult, 9);
      }
      for (let k = n; k <= n + 5; k++) {
        expect(left[k - 1]).toBe(0);
        expect(caps[k - 1]).toBeCloseTo(cap0, 9);
      }
      expect(a.race.tick).toBe(T + n + 5);
    }
  });

  it('the mech really goes that fast: the limiter x 1.3 on lap 2, top speed x 1.3 on lap 3', () => {
    for (const lapPhase of [2, 3] as const) {
      const { a, m, cap0 } = solo(lapPhase);
      const fast = cap0 * a.race.rules.overdriveMult;
      a.ability(FW0);
      let max = 0;
      let prev = m.speed;
      a.step(ticks(a.race.rules.overdriveSecs) - 1, () => {
        a.recenter([FW0]);
        expect(m.speed).toBeGreaterThanOrEqual(prev - EPS); // all the way up, no wobble
        prev = m.speed;
        max = Math.max(max, m.speed);
      });
      expect(max).toBeCloseTo(fast, 6);
      expect(max).toBeLessThanOrEqual(fast + EPS);
      expect(m.speed).toBeCloseTo(fast, 6);
      // When it runs out the mech is over its cap: cut to SPEED_CEILING x cap
      // at once, then dragged the rest of the way.
      a.step(1);
      expect(m.speed).toBeCloseTo(Math.min(fast, cap0 * SPEED_CEILING), 6);
      a.step(120, () => a.recenter([FW0]));
      expect(m.speed).toBeCloseTo(cap0, 6);
    }
    expect(CLASSES[0].topSpeed * DEFAULT_RULES.overdriveMult).toBe(208);
  });

  it('accelerates at OVERDRIVE_ACCEL times the frame\'s own rate', () => {
    const { a, m, cap0 } = solo(2);
    const c = CLASSES[m.role];
    const cap = cap0 * a.race.rules.overdriveMult;
    const v0 = m.speed;
    a.ability(FW0);
    const room = clamp(1.2 - v0 / cap, 0.18, 1);
    expect(m.speed).toBeCloseTo(v0 + c.accel * OVERDRIVE_ACCEL * room * DT, 9);
    // Against a boost from the same speed to the same cap: Overdrive gets there sooner.
    const od = solo(2);
    od.a.ability(FW0);
    const tOd = od.a.until(() => od.m.speed >= 150, 400);
    const b = solo(2, { boostMult: 1.3 });
    b.m.drive = 100;
    b.a.hold(FW0, BTN.A);
    const tBoost = b.a.until(() => b.m.speed >= 150, 400);
    expect(tOd).toBeGreaterThan(0);
    expect(tBoost).toBeGreaterThan(tOd);
    expect(OVERDRIVE_ACCEL).toBeGreaterThan(1);
  });

  it('ignores the armour penalty while it runs, and the penalty returns when it ends', () => {
    const a = new Arena(3);
    const m = giveCells(a.put(FW0, -200, 0));
    const c = CLASSES[m.role];
    m.hp = c.maxHp * 0.25;
    const floor = a.race.rules.armourFloor;
    const hurt = c.topSpeed * (floor + (1 - floor) * 0.25);
    expect(ownTopSpeed(a.race, m, c)).toBeCloseTo(hurt, 9);
    expect(hurt).toBeLessThan(c.topSpeed - 5);
    a.ability(FW0);
    // The frame's full figure, as if undamaged, times the Overdrive.
    expect(ownTopSpeed(a.race, m, c)).toBe(c.topSpeed);
    expect(speedCap(a.race, m, c)).toBeCloseTo(c.topSpeed * a.race.rules.overdriveMult, 9);
    let max = 0;
    a.step(ticks(a.race.rules.overdriveSecs) - 1, () => {
      a.recenter([FW0]);
      max = Math.max(max, m.speed);
    });
    expect(max).toBeCloseTo(c.topSpeed * a.race.rules.overdriveMult, 6);
    a.step(1);
    expect(ownTopSpeed(a.race, m, c)).toBeCloseTo(hurt, 9);
    a.step(200, () => a.recenter([FW0]));
    expect(m.speed).toBeCloseTo(hurt, 6);
    expect(m.hp).toBe(c.maxHp * 0.25); // it does not mend anything
  });

  it('takes the place of the boost: it cannot be lit, and no Drive is burnt', () => {
    const { a, m } = solo(2, { drivePassive: 0 });
    m.drive = 60;
    a.ability(FW0);
    a.hold(FW0, BTN.A);
    const n = ticks(a.race.rules.overdriveSecs);
    a.step(n - 1, () => {
      a.recenter([FW0]);
      expect(m.boosting).toBe(false);
    });
    expect(m.drive).toBe(60);
    expect(a.events('boost').length).toBe(0);
    // The moment it ends, the button (still down) lights the boost.
    a.step(1);
    expect(m.boosting).toBe(true);
    expect(a.events('boost').length).toBe(1);
    expect(m.drive).toBeLessThan(60);
  });

  it('a boost already burning goes out when Overdrive starts', () => {
    const { a, m } = solo(2, { drivePassive: 0 });
    m.drive = 60;
    a.hold(FW0, BTN.A).step(30);
    expect(m.boosting).toBe(true);
    const left = m.drive;
    a.hold(FW0, BTN.ABILITY).step(1);
    expect(m.overdriveT).toBeGreaterThan(0);
    expect(m.boosting).toBe(false);
    expect(m.drive).toBe(left);
    // No stacking: the cap is the Overdrive's, not Overdrive x boost.
    let max = 0;
    a.step(200, () => {
      a.recenter([FW0]);
      max = Math.max(max, m.speed);
    });
    expect(max).toBeLessThanOrEqual(a.pace * a.race.rules.overdriveMult + EPS);
    expect(m.drive).toBe(left);
  });

  it('burns off a Snare', () => {
    const { a, m, cap0 } = solo(2);
    const c = CLASSES[m.role];
    m.snareT = 150;
    a.step(1);
    expect(speedCap(a.race, m, c)).toBeCloseTo(cap0 * a.race.rules.snareMult, 9);
    a.ability(FW0);
    expect(m.snareT).toBe(0);
    expect(speedCap(a.race, m, c)).toBeCloseTo(cap0 * a.race.rules.overdriveMult, 9);
  });

  it('...but a Snare that lands during it still bites: the two multiply', () => {
    const { a, m, cap0 } = solo(2);
    a.ability(FW0);
    a.step(30);
    m.snareT = 100;
    const { overdriveMult, snareMult } = a.race.rules;
    expect(speedCap(a.race, m, CLASSES[m.role])).toBeCloseTo(cap0 * overdriveMult * snareMult, 9);
  });

  it('stacks with the tow, each multiplying the cap', () => {
    const a = new Arena(3);
    const m = giveCells(a.put(FW0, -200, 0));
    const lead = a.put(FW1, -170, 0);
    a.step(150, () => {
      a.recenter([FW0, FW1]);
      lead.s = m.s + 30;
    });
    expect(m.tow).toBe(1);
    a.ability(FW0);
    let max = 0;
    a.step(200, () => {
      a.recenter([FW0, FW1]);
      lead.s = m.s + 30;
      max = Math.max(max, m.speed);
    });
    const { overdriveMult, tow3 } = a.race.rules;
    expect(max).toBeCloseTo(CLASSES[0].topSpeed * overdriveMult * (1 + tow3), 4);
    expect(max).toBeLessThanOrEqual(CLASSES[0].topSpeed * overdriveMult * (1 + tow3) + EPS);
  });

  it('a second Overdrive restarts the clock; it does not add to it or to the speed', () => {
    const { a, m, cap0 } = solo(2);
    a.ability(FW0);
    a.step(99);
    expect(m.overdriveT).toBe(141);
    a.ability(FW0);
    expect(m.overdriveT).toBe(240);
    expect(m.cells).toBe(1);
    expect(speedCap(a.race, m, CLASSES[m.role])).toBeCloseTo(cap0 * a.race.rules.overdriveMult, 9);
  });

  it('needs nobody else around, and is the forward\'s move only while free steering', () => {
    const { a, m } = solo(2);
    a.ability(FW0);
    expect(a.events('ability')).toMatchObject([{ ability: ABILITY.OVERDRIVE }]);
    // The same button in a lock is Break Away, and does not start an Overdrive.
    const b = CASES[1].make();
    b.a.ability(FW0);
    expect(b.user.overdriveT).toBe(0);
    expect(m.cloakT).toBe(0);
  });

  it('the strength and the length are rules', () => {
    const { a, m, cap0 } = solo(2, { overdriveMult: 1.5, overdriveSecs: 1.5 });
    a.ability(FW0);
    expect(m.overdriveT).toBe(90);
    expect(speedCap(a.race, m, CLASSES[m.role])).toBeCloseTo(cap0 * 1.5, 9);
    a.step(89);
    expect(m.overdriveT).toBe(1);
    a.step(1);
    expect(m.overdriveT).toBe(0);
  });

  it('carries into a lock as a timer only: a fight is not carried any faster', () => {
    const a = new Arena(2);
    const m = giveCells(a.put(FW0, -200, 0));
    const foe = a.put(FW1, -170, 8);
    a.ability(FW0);
    a.step(1);
    a.tap(FW0, BTN.LOCK);
    expect(m.mode).toBe(MODE.BATTLE);
    a.step(90, () => {
      a.recenter([FW0, FW1]);
      foe.s = m.s + 30;
    });
    expect(m.overdriveT).toBeGreaterThan(0);
    expect(m.vs).toBeCloseTo(foe.vs, 1);
    expect(m.vs).toBeLessThan(a.pace * 1.05);
  });
});

// =============================================================================
// BREAK AWAY
// =============================================================================

describe('Break Away', () => {
  /**
   * A forward locked on a rival ahead, with two rivals locked on to it and a
   * team-mate escorting it.
   */
  function hunted(rules?: Partial<Rules>, lapPhase: 2 | 3 = 2) {
    const a = new Arena(lapPhase, 1, rules);
    const fw = giveCells(a.put(FW0, -200, 0));
    const foe = a.put(FW1, -170, 8);
    const hunter = a.put(MF1, -215, -8);
    const mate = a.put(MF0, -210, 10);
    a.tap(FW0, BTN.LOCK);
    a.tap(FW1, BTN.LOCK);
    a.tap(MF1, BTN.LOCK);
    a.tap(MF0, BTN.ALLY);
    expect([fw.target, foe.target, hunter.target, mate.target]).toEqual([FW1, FW0, FW0, FW0]);
    a.clearLog();
    return { a, fw, foe, hunter, mate };
  }

  it('lets go of the lock, shakes every rival\'s lock, and leaves the team-mate\'s alone', () => {
    const { a, fw, foe, hunter, mate } = hunted();
    const T = a.ability(FW0);
    expect(a.events('ability')).toEqual([{ type: 'ability', mech: FW0, ability: ABILITY.BREAKAWAY, tick: T }]);
    expect(fw.target).toBe(-1);
    expect(fw.mode).toBe(MODE.SPEED);
    expect(foe.target).toBe(-1);
    expect(foe.mode).toBe(MODE.SPEED);
    expect(hunter.target).toBe(-1);
    expect(hunter.mode).toBe(MODE.SPEED);
    expect(mate.target).toBe(FW0);
    expect(mate.mode).toBe(MODE.BATTLE);
    expect(a.events('unlock').map((e) => e.mech).sort()).toEqual([FW0, FW1, MF1]);
    expect(a.events('unlock').every((e) => e.tick === T)).toBe(true);
    expect(fw.cells).toBe(2);
  });

  it('gives BREAKAWAY_IFRAMES of invulnerability and rules.breakawaySecs of cloak', () => {
    const { a, fw } = hunted();
    a.ability(FW0);
    expect(fw.iframes).toBe(BREAKAWAY_IFRAMES);
    expect(fw.cloakT).toBe(ticks(a.race.rules.breakawaySecs));
    expect(fw.cloakT).toBe(90);
    a.step(BREAKAWAY_IFRAMES - 1);
    expect(fw.iframes).toBe(1);
    a.step(1);
    expect(fw.iframes).toBe(0);
    a.step(90 - BREAKAWAY_IFRAMES - 1);
    expect(fw.cloakT).toBe(1);
    a.step(1);
    expect(fw.cloakT).toBe(0);
  });

  it('throws the forward clear: speed mode, straightened up, at 1.1 x its cap', () => {
    const { a, fw } = hunted();
    const cap = speedCap(a.race, fw, CLASSES[fw.role]);
    expect(fw.speed).toBeCloseTo(cap, 3);
    a.ability(FW0);
    // 1.1 x the cap at the press, less the tick of over-the-cap drag that followed.
    expect(fw.speed).toBeCloseTo(cap * 1.1 - (COAST_DRAG + OVERCAP_DRAG) * DT, 6);
    expect(fw.speed).toBeLessThanOrEqual(cap * SPEED_CEILING);
    expect(Math.abs(fw.heading)).toBeLessThan(0.05);
    expect(fw.facing).toBe(fw.heading);
    // It is a burst, not a new top speed: back on the cap inside half a second.
    let prev = fw.speed;
    a.step(30, () => {
      expect(fw.speed).toBeLessThanOrEqual(prev + EPS);
      prev = fw.speed;
    });
    expect(fw.speed).toBeCloseTo(cap, 6);
  });

  it('a forward already going faster than that keeps its speed (up to the ceiling)', () => {
    const { a, fw } = hunted();
    const cap = speedCap(a.race, fw, CLASSES[fw.role]);
    fw.vs = cap * 1.18;
    a.ability(FW0);
    expect(fw.speed).toBeCloseTo(cap * 1.18 - (COAST_DRAG + OVERCAP_DRAG) * DT, 6);
  });

  it('enemies cannot take a lock during the cloak: not by LOCK, not by cycling, not by an attack press', () => {
    const { a, fw, foe, hunter, mate } = hunted();
    a.ability(FW0);
    a.step(3);
    a.clearLog();
    // The helpers agree...
    expect(lockable(fw, foe)).toBe(false);
    expect(lockable(fw, hunter)).toBe(false);
    expect(lockable(fw, mate)).toBe(true);
    expect(lockable(foe, fw)).toBe(true); // it can still lock them
    expect(pickTarget(a.race, TRACK, foe, false, -1)).toBe(MF0); // the escort, not the forward
    expect(pickTarget(a.race, TRACK, mate, true, -1)).toBe(FW0);
    // ...and so do the buttons. The escort is moved out of reach so the
    // forward is the only rival about.
    setTarget(a.race, mate, -1);
    mate.s -= 400;
    a.tap(FW1, BTN.LOCK);
    expect(foe.target).toBe(-1);
    expect(a.events('denied')).toMatchObject([{ mech: FW1, reason: 'target' }]);
    // A melee press right beside it would normally take the lock for you.
    hunter.s = fw.s - 8;
    hunter.d = fw.d;
    a.step(40);
    a.clearLog();
    a.tap(MF1, BTN.Y);
    expect(hunter.target).toBe(-1);
    expect(a.events('windup').length).toBe(0);
    expect(a.events('denied')).toMatchObject([{ mech: MF1, reason: 'target' }]);
    expect(fw.cloakT).toBeGreaterThan(0);
  });

  it('cycling targets skips a cloaked forward', () => {
    const a = new Arena(2);
    const fw = giveCells(a.put(FW0, -200, 0));
    const mate = a.put(MF0, -190, -12);
    const foe = a.put(FW1, -230, 0);
    a.tap(FW1, BTN.LOCK);
    expect([FW0, MF0]).toContain(foe.target);
    a.put(DF1, -170, 8);
    a.tap(FW0, BTN.LOCK);
    a.ability(FW0);
    expect(fw.cloakT).toBeGreaterThan(0);
    // Whatever it had, the rival is on the midfielder now or on nothing, and cycling stays there.
    if (foe.target < 0) a.tap(FW1, BTN.LOCK);
    expect(foe.target).toBe(MF0);
    for (let i = 0; i < 4; i++) {
      a.step(1);
      a.tap(FW1, i % 2 ? BTN.TNEXT : BTN.TPREV);
      expect(foe.target).toBe(MF0);
    }
    expect(cycleTarget(a.race, TRACK, foe, 1)).toBe(MF0);
    void mate;
  });

  it('team-mates can still lock a cloaked forward', () => {
    const { a, fw } = hunted();
    const df = a.put(DF0, -225, 4);
    a.ability(FW0);
    a.step(2);
    a.tap(DF0, BTN.ALLY);
    expect([FW0, MF0]).toContain(df.target);
    if (df.target !== FW0) {
      a.step(1);
      a.tap(DF0, BTN.ALLY); // hop to the other team-mate
    }
    expect(df.target).toBe(FW0);
    expect(fw.cloakT).toBeGreaterThan(0);
  });

  it('the cloak ends: after rules.breakawaySecs the forward can be locked again', () => {
    const lockAfter = (wait: number): number => {
      const { a, fw, foe, mate } = hunted();
      setTarget(a.race, mate, -1);
      mate.s -= 400;
      const T = a.ability(FW0);
      a.step(wait - 1, () => {
        foe.s = fw.s + 30; // stay in range
      });
      expect(a.tap(FW1, BTN.LOCK)).toBe(T + wait);
      return foe.target;
    };
    const n = ticks(DEFAULT_RULES.breakawaySecs);
    expect(lockAfter(10)).toBe(-1);
    expect(lockAfter(n - 2)).toBe(-1);
    // (On the last tick or two it depends which of the two pilots the sim updates first.)
    expect(lockAfter(n + 1)).toBe(FW0);
    expect(lockAfter(n + 30)).toBe(FW0);
  });

  it('a blow that lands during the i-frames is evaded', () => {
    const { a, fw, foe } = hunted();
    a.ability(FW0);
    const hp = fw.hp;
    expect(applyHit(a.race, TRACK, foe, fw, ATTACKS[ATK.FW_LANCE], ATK.FW_LANCE)).toBe(false);
    expect(fw.hp).toBe(hp);
    expect(fw.act).toBe(ACT.NONE);
    a.step(BREAKAWAY_IFRAMES);
    expect(applyHit(a.race, TRACK, foe, fw, ATTACKS[ATK.FW_LANCE], ATK.FW_LANCE)).toBe(true);
    expect(fw.hp).toBeLessThan(hp);
  });

  it('works in the middle of a hit, locked on: the stagger and the chain are gone', () => {
    const { a, fw, foe } = hunted();
    // Two blows in: staggered, with a chain building.
    a.race.tick++;
    applyHit(a.race, TRACK, foe, fw, ATTACKS[ATK.FW_SLASH1], ATK.FW_SLASH1);
    a.race.tick++;
    applyHit(a.race, TRACK, foe, fw, ATTACKS[ATK.FW_SLASH2], ATK.FW_SLASH2);
    expect(fw.act).toBe(ACT.STAGGER);
    expect(fw.chain).toBe(2);
    expect(fw.mode).toBe(MODE.BATTLE);
    expect(abilityFor(fw)).toBe(ABILITY.BREAKAWAY);
    a.ability(FW0);
    expect(a.events('ability')).toMatchObject([{ mech: FW0, ability: ABILITY.BREAKAWAY }]);
    expect(fw.act).toBe(ACT.NONE);
    expect(fw.chain).toBe(0);
    expect(fw.chainT).toBe(0);
    expect(fw.mode).toBe(MODE.SPEED);
    expect(fw.target).toBe(-1);
    expect(foe.target).toBe(-1);
    expect(fw.iframes).toBe(BREAKAWAY_IFRAMES);
    expect(fw.speed).toBeGreaterThan(a.pace);
    // And it is flying again at once: steering and throttle answer.
    a.inputs[FW0].mx = 1;
    a.step(10);
    expect(fw.d).toBeGreaterThan(0);
    expect(fw.act).toBe(ACT.NONE);
  });

  it('works in the middle of a hit at racing speed, with no lock at all', () => {
    const a = new Arena(2);
    const fw = giveCells(a.put(FW0, -200, 0));
    const foe = a.put(MF1, -208, 0);
    a.tap(MF1, BTN.LOCK);
    expect(foe.target).toBe(FW0);
    a.race.tick++;
    applyHit(a.race, TRACK, foe, fw, ATTACKS[ATK.MF_KICK], ATK.MF_KICK);
    expect(fw.mode).toBe(MODE.SPEED);
    expect(fw.act).toBe(ACT.STAGGER);
    expect(fw.speed).toBeLessThan(a.pace); // the hit cost pace
    expect(abilityFor(fw)).toBe(ABILITY.BREAKAWAY);
    a.clearLog();
    a.ability(FW0);
    expect(a.events('ability')).toMatchObject([{ mech: FW0, ability: ABILITY.BREAKAWAY }]);
    expect(fw.overdriveT).toBe(0); // not the free-steering move
    expect(fw.act).toBe(ACT.NONE);
    expect(fw.cloakT).toBe(ticks(a.race.rules.breakawaySecs));
    expect(foe.target).toBe(-1);
    expect(fw.speed).toBeGreaterThan(a.pace);
    expect(fw.cells).toBe(2);
  });

  it('even from a standstill it comes out at 1.1 x the cap', () => {
    const a = new Arena(2);
    const fw = giveCells(a.put(FW0, -200, 0, 0));
    a.inputs[FW0].throttle = 1;
    setStagger(fw, 60);
    a.step(3);
    expect(fw.speed).toBe(0);
    a.ability(FW0);
    const cap = speedCap(a.race, fw, CLASSES[fw.role]);
    expect(fw.speed).toBeCloseTo(cap * 1.1 - (COAST_DRAG + OVERCAP_DRAG) * DT, 6);
  });

  it('a midfielder or defender cannot do the same', () => {
    for (const id of [MF0, DF0]) {
      const a = new Arena(2);
      const m = giveCells(a.put(id, -200, 0));
      a.put(FW1, -170, 8);
      a.tap(id, BTN.LOCK);
      setStagger(m, 40);
      a.clearLog();
      a.ability(id);
      expect(a.events('ability').length).toBe(0);
      expect(m.act).toBe(ACT.STAGGER);
      expect(m.cloakT).toBe(0);
      expect(m.cells).toBe(3);
    }
  });

  it('cancels the forward\'s own attack', () => {
    const { a, fw, foe } = hunted();
    foe.s = fw.s + 9;
    foe.d = fw.d;
    a.tap(FW0, BTN.X);
    expect(fw.act).toBe(ACT.ATTACK);
    a.step(2);
    a.clearLog();
    a.ability(FW0);
    expect(fw.act).toBe(ACT.NONE);
    a.step(20);
    expect(a.events('hit').length).toBe(0);
    expect(a.events('swing').length).toBe(0);
    expect(foe.hp).toBe(CLASSES[foe.role].maxHp);
  });

  it('drops a guard, and shakes off a Snare', () => {
    const { a, fw, foe } = hunted();
    a.step(20);
    a.hold(FW0, BTN.GUARD).step(5);
    expect(fw.guarding).toBe(true);
    fw.snareT = 120;
    a.release(FW0, BTN.GUARD);
    a.hold(FW0, BTN.ABILITY).step(1);
    expect(fw.guarding).toBe(false);
    expect(fw.snareT).toBe(0);
    expect(speedCap(a.race, fw, CLASSES[fw.role])).toBe(a.pace);
    void foe;
  });

  it('breaks an escort lock too: the forward\'s own lock on a team-mate is a lock', () => {
    const a = new Arena(2);
    const fw = giveCells(a.put(FW0, -200, 0));
    const mate = a.put(MF0, -180, 8);
    const foe = a.put(FW1, -230, -6);
    a.tap(FW0, BTN.ALLY);
    a.tap(FW1, BTN.LOCK);
    expect(fw.target).toBe(MF0);
    expect(foe.target).toBe(FW0);
    a.ability(FW0);
    expect(a.events('ability')).toMatchObject([{ ability: ABILITY.BREAKAWAY }]);
    expect(fw.target).toBe(-1);
    expect(foe.target).toBe(-1);
    void mate;
  });

  it('with nobody hunting it, it still breaks its own lock and bursts clear', () => {
    const { a, user } = CASES[1].make();
    a.ability(FW0);
    expect(user.target).toBe(-1);
    expect(user.cloakT).toBe(90);
    expect(a.events('unlock').map((e) => e.mech)).toEqual([FW0]);
  });

  it('the cloak length is a rule; zero is a single tick', () => {
    for (const [breakawaySecs, want] of [
      [0.5, 30],
      [4, 240],
      [0, 1],
    ] as const) {
      const { a, user } = CASES[1].make(2, { breakawaySecs });
      a.ability(FW0);
      expect(user.cloakT).toBe(want);
      // The i-frames are a constant, whatever the rule says.
      expect(user.iframes).toBe(BREAKAWAY_IFRAMES);
    }
  });

  it('a second Break Away needs a new lock (or another hit), and the cooldown', () => {
    const { a, user, arm } = CASES[1].make();
    a.ability(FW0);
    // Free steering now: the button is the Overdrive, once the cooldown is over.
    a.step(ABILITY_COOLDOWN, () => a.recenter([FW0, FW1], 250, 400));
    a.ability(FW0);
    expect(uses(a, FW0).map((e) => e.ability)).toEqual([ABILITY.BREAKAWAY, ABILITY.OVERDRIVE]);
    // Lock on again and it is Break Away once more.
    a.step(ABILITY_COOLDOWN, () => a.recenter([FW0, FW1], 250, 400));
    arm();
    a.ability(FW0);
    expect(uses(a, FW0).map((e) => e.ability)).toEqual([ABILITY.BREAKAWAY, ABILITY.OVERDRIVE, ABILITY.BREAKAWAY]);
    expect(user.cells).toBe(0);
  });
});

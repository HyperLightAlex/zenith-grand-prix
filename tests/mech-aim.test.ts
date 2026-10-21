import { describe, expect, it } from 'vitest';
import { MechRig } from '../src/client/render/mech/rig';
import { MechAnimator } from '../src/client/render/mech/animate';
import { ACT, ATK, ATTACKS, BTN, ROLE, type MechState } from '../src/sim/index';
import { newRace } from './helpers';

const DIMS = { hipY: 5.5, hipX: 0.72, hipDrop: 0.25, thigh: 2.35, shin: 2.3, ankleY: 0.6, spineY: 0.4, chestY: 0.8, shoulderX: 1.5, shoulderY: 0.95, headY: 1.5, headZ: 0.15, upperArm: 1.5, foreArm: 1.45, height: 8.8 };
const DT = 1 / 60;

function mechOf(role: number): MechState {
  const m = newRace(3).mechs.find((q) => q.role === role);
  if (!m) throw new Error('no mech in that role');
  return m;
}

/**
 * Plays a run of attacks through the animator as the sim would: each one's
 * act, then the ticks of nothing between (the cooldown), with the trigger
 * held or not. Returns the gun arm's weight on every tick.
 */
function play(m: MechState, attack: number, bursts: number, gap: number, held: boolean, after: number): { w: number; act: number }[] {
  const anim = new MechAnimator(new MechRig(DIMS));
  const a = ATTACKS[attack];
  const len = a.windup + a.active + a.recovery;
  const out: { w: number; act: number }[] = [];
  const tick = (act: number, actT: number, buttons: number) => {
    m.act = act as MechState['act'];
    m.attack = act === ACT.ATTACK ? attack : -1;
    m.actT = actT;
    m.actDur = act === ACT.ATTACK ? len : 0;
    m.prevButtons = buttons;
    anim.update(DT, m, 0);
    out.push({ w: anim.aimWeight, act });
  };
  for (let b = 0; b < bursts; b++) {
    for (let t = 0; t < len; t++) tick(ACT.ATTACK, t, held ? BTN.X : 0);
    for (let t = 0; t < gap; t++) tick(ACT.NONE, 0, held ? BTN.X : 0);
  }
  for (let t = 0; t < after; t++) tick(ACT.NONE, 0, 0);
  return out;
}

describe('a gun held up between bursts', () => {
  const burstLen = ATTACKS[ATK.MF_BURST].windup + ATTACKS[ATK.MF_BURST].active + ATTACKS[ATK.MF_BURST].recovery;

  it('the carbine stays raised through a run of bursts with the trigger held', () => {
    const w = play(mechOf(ROLE.MF), ATK.MF_BURST, 5, ATTACKS[ATK.MF_BURST].cooldown, true, 0);
    // From the first burst's shots on, the arm never drops.
    const from = ATTACKS[ATK.MF_BURST].windup + 2;
    expect(Math.min(...w.slice(from).map((s) => s.w))).toBeGreaterThan(0.95);
  });

  it('stays raised while the trigger is held, however long the pause', () => {
    const w = play(mechOf(ROLE.MF), ATK.MF_BURST, 1, 120, true, 0);
    expect(Math.min(...w.slice(burstLen).map((s) => s.w))).toBeGreaterThan(0.95);
  });

  it('with the trigger let go, stays up a moment after the last burst, then comes down', () => {
    const w = play(mechOf(ROLE.MF), ATK.MF_BURST, 3, ATTACKS[ATK.MF_BURST].cooldown, false, 90);
    const end = w.length - 90;
    // Up for half a second after the last burst ended (its cooldown and on)...
    const last = end - ATTACKS[ATK.MF_BURST].cooldown;
    expect(Math.min(...w.slice(last, last + 30).map((s) => s.w))).toBeGreaterThan(0.95);
    // ...and down within a second of it.
    expect(w[end + 60].w).toBeLessThan(0.02);
    expect(w[w.length - 1].w).toBe(0);
  });

  it('drops at once for anything else the mech does', () => {
    const m = mechOf(ROLE.MF);
    const anim = new MechAnimator(new MechRig(DIMS));
    const a = ATTACKS[ATK.MF_BURST];
    for (let t = 0; t < a.windup + a.active + a.recovery; t++) {
      Object.assign(m, { act: ACT.ATTACK, attack: ATK.MF_BURST, actT: t, prevButtons: BTN.X });
      anim.update(DT, m, 0);
    }
    expect(anim.aimWeight).toBeGreaterThan(0.95);
    Object.assign(m, { act: ACT.DASH, attack: -1, actT: 0, actDur: 12, prevButtons: BTN.X });
    anim.update(DT, m, 0);
    expect(anim.aimWeight).toBe(0);
    // Back to nothing with the trigger still held: it is not raised again until it fires.
    Object.assign(m, { act: ACT.NONE, actT: 0, actDur: 0 });
    anim.update(DT, m, 0);
    expect(anim.aimWeight).toBe(0);
  });

  it('the scatter cannon, one shot, still lowers with its shot', () => {
    const a = ATTACKS[ATK.DF_SCATTER];
    const w = play(mechOf(ROLE.DF), ATK.DF_SCATTER, 1, 10, true, 0);
    const len = a.windup + a.active + a.recovery;
    expect(Math.max(...w.slice(0, len).map((s) => s.w))).toBeGreaterThan(0.95);
    expect(w[len - 1].w).toBeLessThan(0.05);
    for (const s of w.slice(len)) expect(s.w).toBe(0);
  });
});

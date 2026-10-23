// Where a circuit throws a mech off its road, and for how far, at a held
// speed: the sim's own rules for leaving the road and flying (stepAir in
// sim.ts), run along the middle of the road at each speed given. Jumps (a gap
// in the road) and the rest (crests, a pitch over into a drop) are listed
// apart.
//
//   npx tsx tools/airtime.ts [track] [speed,speed...] [--grip G] [--hold H]
//
// --grip: the skates' hold on the road, u/s^2 on top of gravity's share (the
// road keeps a mech until a crest asks for more than both). --hold: pulled back
// this much harder while flying over road (not a gap) and still rising off it.
// Both the game's SKATE_HOLD unless given (0 and 0: the rules before it).
import { GRAVITY, MAG_PULL, SKATE_HOLD } from '../src/sim/config';
import { buildTrack, type Track } from '../src/sim/track';
import { TRACKS, trackById } from '../src/sim/tracks/index';
import { pieceStarts, type CircuitDef } from '../src/sim/circuit';

const args = process.argv.slice(2);
const opt = (k: string, dflt: number) => {
  const i = args.indexOf(k);
  if (i < 0) return dflt;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  return v;
};
const GRIP = opt('--grip', SKATE_HOLD);
const HOLD = opt('--hold', SKATE_HOLD);
const ids = args[0] && args[0] !== 'all' ? [args[0]] : TRACKS.map((t) => t.id);
const speeds = (args[1] ?? '125,160,200,225').split(',').map(Number);
const DT = 1 / 60;

interface Flight {
  s0: number;
  s1: number;
  top: number;
  gap: boolean;
  piece: string;
}

function fly(t: Track, v: number, pieceAt: (s: number) => string): Flight[] {
  const at = (s: number) => Math.floor((((s % t.length) + t.length) % t.length) / t.ds) % t.n;
  const out: Flight[] = [];
  let air = false;
  let h = 0;
  let vh = 0;
  let cur: Flight | null = null;
  // Twice round: start the second lap with whatever the first left it doing.
  for (let s = 0; s < t.length * 2; s += v * DT) {
    const i = at(s);
    const on = t.roadL[i] === 1 && t.roadR[i] === 1;
    const mag = t.mag[i] === 1;
    if (!air) {
      if (!on || (!mag && GRAVITY * t.upY[i] + GRIP + t.kv[i] * v * v < 0)) {
        air = true;
        vh = 0;
        if (s >= t.length) cur = { s0: s - t.length, s1: 0, top: 0, gap: false, piece: pieceAt(s - t.length) };
      } else continue;
    }
    if (!on && Math.abs(t.upY[i]) < 0.5) {
      vh = 0;
      h = Math.max(0, h);
      if (cur) cur.gap = true;
      continue;
    }
    const pull = mag ? -MAG_PULL : -GRAVITY * t.upY[i] - t.kv[i] * v * v - (on && vh > 0 ? HOLD : 0);
    vh += pull * DT;
    h += vh * DT;
    if (cur) {
      cur.top = Math.max(cur.top, h);
      if (!on) cur.gap = true;
    }
    if (h > 0) continue;
    if (on) {
      air = false;
      h = 0;
      vh = 0;
      if (cur) {
        cur.s1 = s - t.length;
        out.push(cur);
        cur = null;
      }
    } else if (h < -3) {
      // Fell: put back on the road further on, as the drone does.
      air = false;
      h = 0;
      vh = 0;
      if (cur) {
        cur.s1 = s - t.length;
        cur.piece += ' (FELL)';
        out.push(cur);
        cur = null;
      }
    }
  }
  return out;
}

for (const id of ids) {
  const def = trackById(id);
  if (!('pieces' in def)) continue;
  const t = buildTrack(def);
  const starts = pieceStarts(def as CircuitDef);
  const pieceAt = (s: number) => {
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1] <= s) k++;
    return (def as CircuitDef).pieces[k]?.name ?? `#${k}`;
  };
  console.log(`== ${id} (${t.length.toFixed(0)} m), grip ${GRIP}, hold ${HOLD}`);
  for (const v of speeds) {
    const f = fly(t, v, pieceAt);
    const jumps = f.filter((x) => x.gap);
    const rest = f.filter((x) => !x.gap);
    const len = (x: Flight) => x.s1 - x.s0;
    const total = rest.reduce((a, x) => a + len(x), 0);
    console.log(`  ${v} u/s: jumps ${jumps.map((x) => `${x.piece} ${len(x).toFixed(0)} m`).join(', ') || 'none'}; off the road elsewhere ${total.toFixed(0)} m in ${rest.length}`);
    for (const x of rest.sort((a, b) => len(b) - len(a)).slice(0, 6)) {
      console.log(`      ${x.piece.padEnd(26)} s ${x.s0.toFixed(0).padStart(5)}  ${len(x).toFixed(0).padStart(4)} m, up to ${x.top.toFixed(1)} m`);
    }
  }
}

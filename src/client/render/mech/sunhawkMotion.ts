import type { Pose } from './rig';

/** Retarget the shared clips to Sunhawk's shorter thighs and fuller armor.
 * Called on a private copy: the reference model and shared clips stay intact.
 */
export function fitSunhawkPose(p: Pose): void {
  const originalPitch = p.hips[2] + p.spine[0] + p.chest[0];
  p.hips[2] *= p.hips[2] > 0 ? .86 : 1;
  p.spine[0] *= p.spine[0] > 0 ? .78 : 1;
  p.chest[0] *= p.chest[0] > 0 ? .80 : 1;
  const pitch = p.hips[2] + p.spine[0] + p.chest[0];
  // Keep the eye line on the road when the torso is less folded.
  p.head[0] += originalPitch - pitch;
  for (const side of [1, -1]) {
    const shoulder = side === 1 ? p.shL : p.shR;
    const elbow = side === 1 ? p.elL : p.elR;
    const sweep = smooth(.35, .85, shoulder[0]);
    shoulder[0] += (Math.min(shoulder[0] * .62, Math.max(.15, 1.65 - pitch)) - shoulder[0]) * sweep;
    shoulder[2] += (side * Math.max(.24, side * shoulder[2]) - shoulder[2]) * sweep;
    // Leave a corridor for the helmet and shoulder towers in a raised guard.
    const guard = smooth(.4, .9, -shoulder[0]) * smooth(1, 1.4, -elbow[0]);
    shoulder[0] *= 1 - .10 * guard;
    shoulder[2] += (side * Math.max(.32, side * shoulder[2]) - shoulder[2]) * guard;
    shoulder[1] *= 1 - .28 * guard;
    elbow[0] *= 1 - .22 * guard;
    elbow[2] += side * .12 * guard;
  }
  // The fins frame the back rather than crossing behind the neck in a tuck.
  p.wingL[1] *= .72;
  p.wingR[1] *= .72;
  const finCounterPitch = Math.max(0, pitch - .4) * .65;
  p.wingL[0] -= finCounterPitch;
  p.wingR[0] -= finCounterPitch;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

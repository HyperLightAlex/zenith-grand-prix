// Cell gates: narrow gold arches on the road. Thread one for a share of an
// ability charge. Each has two posts, a lit lintel, a film of light across
// the opening, a spinning cell above it and a tall beacon so it can be picked
// out from a long way back.
import * as THREE from 'three';
import type { Track } from '../../sim/track';
import { COLORS, toonMaterial } from './palette';
import { trackMatrix } from './trackSpace';

export interface GateVisual {
  group: THREE.Group;
  /** How lit each gate is for the pilot being followed: 0 dark, 1 live. */
  lit: number[];
  /** Flash a gate that has just been threaded. */
  pulse(i: number): void;
  setLit(i: number, target: number): void;
  update(time: number): void;
}

const filmVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const filmFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime, uLit, uPulse;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // Bright at the frame, faint in the middle, with chevrons rising through it.
  float edge = smoothstep(0.55, 1.0, abs(p.x));
  float top = smoothstep(0.5, 1.0, p.y);
  float chev = fract((vUv.y * 3.0 + abs(p.x) * 0.9) - uTime * 0.9);
  float arrows = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.3, 0.42, chev));
  float a = (0.06 + edge * 0.45 + top * 0.25 + arrows * 0.22) * uLit + uPulse * 0.9;
  a *= smoothstep(0.0, 0.08, vUv.y);
  gl_FragColor = vec4(uColor * a * 1.7, a);
}`;

export function buildGates(track: Track): GateVisual {
  const group = new THREE.Group();
  const lit: number[] = [];
  const want: number[] = [];
  const pulses: number[] = [];
  const films: THREE.ShaderMaterial[] = [];
  const glows: THREE.MeshBasicMaterial[] = [];
  const icons: THREE.Mesh[] = [];
  const gold = new THREE.Color(COLORS.cell);
  const frame = toonMaterial({ vertexColors: false, color: 0x2c3442 });
  const m = new THREE.Matrix4();
  let last = 0;

  track.gates.forEach((g) => {
    const node = new THREE.Group();
    node.matrixAutoUpdate = false;
    // Model space here is (left, up, forward).
    trackMatrix(track, g.s, g.d, 0, 0, m);
    node.matrix.copy(m);
    // The inner faces of the posts stand just outside what scores, so a mech
    // whose centre passes between them has threaded the gate.
    const half = g.halfW + 0.6;
    const top = 10.5;

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, top, 1.6), frame);
      post.position.set(side * half, top / 2, 0);
      node.add(post);
      // Swept-back foot, so the arch reads as built for speed.
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 4.2), frame);
      foot.position.set(side * half, 0.45, -1.1);
      node.add(foot);
    }
    const glow = new THREE.MeshBasicMaterial({ color: gold.clone().multiplyScalar(1.7), toneMapped: false });
    glows.push(glow);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.9, 0.7, 1.2), glow);
    lintel.position.set(0, top, 0);
    node.add(lintel);
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, top - 1, 0.5), glow);
      stripe.position.set(side * (half - 0.56), top / 2 + 0.3, 0.6);
      node.add(stripe);
    }

    const film = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: gold.clone() }, uTime: { value: 0 }, uLit: { value: 1 }, uPulse: { value: 0 } },
      vertexShader: filmVertex,
      fragmentShader: filmFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    films.push(film);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(g.halfW * 2, top - 0.4), film);
    sheet.position.set(0, (top - 0.4) / 2, 0);
    sheet.renderOrder = 5;
    node.add(sheet);

    // Beacon: a thin shaft of light well above the arch.
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 46, 0.5), glow);
    beam.position.set(0, top + 23.5, 0);
    node.add(beam);

    const icon = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), glow);
    icon.position.set(0, top + 3.4, 0);
    icon.scale.set(1, 1.5, 1);
    node.add(icon);
    icons.push(icon);

    group.add(node);
    lit.push(1);
    want.push(1);
    pulses.push(0);
  });

  return {
    group,
    lit,
    pulse(i: number) {
      if (i >= 0 && i < pulses.length) pulses[i] = 1;
    },
    setLit(i: number, target: number) {
      if (i >= 0 && i < want.length) want[i] = target;
    },
    update(time: number) {
      const dt = Math.min(0.1, Math.max(0, time - last));
      last = time;
      for (let i = 0; i < films.length; i++) {
        lit[i] += (want[i] - lit[i]) * (1 - Math.exp(-8 * dt));
        pulses[i] = Math.max(0, pulses[i] - dt * 2.4);
        const u = films[i].uniforms;
        u.uTime.value = time;
        u.uLit.value = lit[i];
        u.uPulse.value = pulses[i];
        glows[i].color.copy(gold).multiplyScalar(0.18 + lit[i] * 1.5 + pulses[i] * 1.5);
        icons[i].rotation.y = time * 1.8 + i;
        icons[i].visible = lit[i] > 0.3;
      }
    },
  };
}

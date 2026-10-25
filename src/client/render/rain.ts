// Rain, drawn the way the anime drew a downpour, round the camera wherever
// it goes (Monsoon Ruins):
//
// - Streaks in three layers: near ones few, long-ish and bright; a middle
//   layer finer and denser; far ones fine and faint, thickest of all, the
//   rain's grey sheets. Each is a line along the rain's way past the
//   camera, its fall and a share of the camera's own speed, so at racing
//   speed the rain rakes in toward it; they fade into the fog with the rest.
// - Splashes on the road ahead: each a crown that rises and breaks into
//   drops over three drawings (held at 12 a second, as an effects animator
//   would time it, not smoothed), white with a blue-grey edge, and a thin
//   ring spreading on the wet road under it.
//
// Everything is placed on the GPU from a few numbers a frame (the streaks)
// or a few hundred splashes respawned as they play out, so it costs little.
import * as THREE from 'three';
import { frameAt, makeFrame, type Track } from '../../sim/track';

export interface RainCtx {
  track: Track;
  group: THREE.Group;
  updates: Array<(time: number, camera: THREE.Camera) => void>;
  /** Where on the road a splash can land at sample `i`: each lane's middle and half width, across from the centreline. */
  lanes(i: number): Array<{ d: number; half: number; rise: number }>;
}

export interface Rain {
  /** The lightning: streaks and splashes lit up by `v` (0..1). */
  flash(v: number): void;
}

const STREAK_VERTEX = /* glsl */ `
  attribute vec4 aSeed;
  attribute vec2 corner;
  uniform vec3 uCam;
  uniform vec3 uBox;
  uniform vec3 uFall;
  uniform vec3 uRel;
  uniform float uTime;
  uniform float uWidth;
  uniform float uShutter;
  uniform float uMaxLen;
  uniform vec2 uRes;
  varying float vAlpha;
  varying float vAcross;
  varying float vAlong;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    // Its place in the box round the camera, falling, wrapped round.
    vec3 base = aSeed.xyz * uBox + uFall * uTime;
    vec3 local = mod(base - uCam, uBox) - 0.5 * uBox;
    vec3 head = uCam + local;
    float speed = length(uRel);
    vec3 dir = speed > 1e-3 ? uRel / speed : vec3(0.0, -1.0, 0.0);
    float len = min(speed * uShutter * (0.6 + 0.8 * aSeed.w), uMaxLen);
    vec3 tail = head - dir * len;
    vec4 h = projectionMatrix * viewMatrix * vec4(head, 1.0);
    vec4 t = projectionMatrix * viewMatrix * vec4(tail, 1.0);
    // Across the streak on the screen, so it is as wide however it lies.
    vec2 sd = (h.xy / max(h.w, 1e-3) - t.xy / max(t.w, 1e-3)) * uRes;
    float sl = length(sd);
    vec2 n = sl > 1e-4 ? vec2(-sd.y, sd.x) / sl : vec2(1.0, 0.0);
    vec4 clip = mix(h, t, corner.y);
    clip.xy += n / uRes * uWidth * max(1.0, uRes.y / 720.0) * corner.x * clip.w;
    gl_Position = clip;
    vec4 mvPosition = viewMatrix * vec4(mix(head, tail, corner.y), 1.0);
    vAlpha = 0.55 + 0.45 * fract(aSeed.w * 7.31);
    // Faded out toward the box's edges, so its wrapping is never seen, and
    // none crossing the camera (or right on top of it).
    vec3 e = abs(local) / (0.5 * uBox);
    vAlpha *= 1.0 - smoothstep(0.65, 1.0, max(max(e.x, e.y), e.z));
    vAlpha *= step(1.2, min(h.w, t.w));
    vAcross = corner.x;
    vAlong = corner.y;
    #include <fog_vertex>
  }`;

const STREAK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFlash;
  varying float vAlpha;
  varying float vAcross;
  varying float vAlong;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    // A hard-edged line, its head the brightest, thinning to its tail.
    float a = smoothstep(1.0, 0.55, abs(vAcross)) * mix(1.0, 0.3, vAlong) * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (1.0 + uFlash * 1.6), a);
    #include <fog_fragment>
  }`;

/** One layer of streaks: `count` of them in a box `box` round the camera. */
function streaks(count: number, box: [number, number, number], o: { width: number; opacity: number; maxLen: number; shutter: number; colour: number }) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1], 2));
  // (A position attribute, for three's bookkeeping; the shader places everything.)
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18).fill(-1e5), 3));
  const seed = new Float32Array(count * 4);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < seed.length; i++) seed[i] = rnd();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uCam: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(...box) },
        uFall: { value: new THREE.Vector3(5, -42, 3) },
        uRel: { value: new THREE.Vector3(0, -42, 0) },
        uTime: { value: 0 },
        uWidth: { value: o.width },
        uShutter: { value: o.shutter },
        uMaxLen: { value: o.maxLen },
        uRes: { value: new THREE.Vector2(1280, 720) },
        uColor: { value: new THREE.Color(o.colour) },
        uOpacity: { value: o.opacity },
        uFlash: { value: 0 },
      },
    ]),
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'rain';
  return { mesh, mat };
}

const SPLASH_VERTEX = /* glsl */ `
  attribute vec2 corner;
  attribute vec3 aPos;
  attribute vec3 aUp;
  attribute vec2 aBorn;
  uniform float uTime;
  uniform float uFlat;
  varying vec2 vQ;
  varying float vFrame;
  varying float vSeed;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    float size = aBorn.y;
    vec3 up = normalize(aUp);
    vec3 p;
    if (uFlat > 0.5) {
      // Flat on the road: a square round the splash's foot.
      vec3 a = normalize(cross(up, abs(up.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)));
      vec3 b = cross(up, a);
      p = aPos + up * 0.06 + (a * corner.x + b * (corner.y * 2.0 - 1.0)) * size * 1.1;
      vQ = vec2(corner.x, corner.y * 2.0 - 1.0);
    } else {
      // Upright (along the road's up), turned to face the camera.
      vec3 toCam = cameraPosition - aPos;
      vec3 side = normalize(cross(up, toCam));
      p = aPos + side * corner.x * size + up * corner.y * size * 1.3;
      vQ = vec2(corner.x, corner.y);
    }
    // Drawn on twos: a new drawing each twelfth of a second.
    vFrame = floor((uTime - aBorn.x) * 12.0);
    vSeed = fract(aBorn.x * 13.17 + aPos.x * 0.37);
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const SPLASH_FRAGMENT = /* glsl */ `
  uniform float uFlat;
  uniform float uFlash;
  varying vec2 vQ;
  varying float vFrame;
  varying float vSeed;
  #include <common>
  #include <fog_pars_fragment>
  // Distance from p to the segment a-b.
  float seg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }
  void main() {
    if (vFrame < 0.0 || vFrame > 2.0) discard;
    float d = 1.0;
    vec2 q = vQ;
    if (uFlat > 0.5) {
      // The ring spreading on the road, broken here and there.
      float r = length(vec2(q.x, q.y * 1.15));
      float rr = 0.25 + vFrame * 0.33;
      d = abs(r - rr) - 0.035;
      float gap = step(0.25, fract(atan(q.y, q.x) * 0.95 + vSeed));
      d = mix(1.0, d, gap);
    } else {
      // The crown: a blob as the drop lands, then the crown's points
      // flung up and out, then its drops thrown clear.
      if (vFrame < 0.5) {
        d = length(vec2(q.x * 1.4, (q.y - 0.12) * 3.2)) - 0.26;
      } else if (vFrame < 1.5) {
        d = length(vec2(q.x * 1.1, (q.y - 0.08) * 4.0)) - 0.42;
        for (int k = 0; k < 5; k++) {
          float x = (float(k) - 2.0) * 0.3;
          vec2 tip = vec2(x * 1.6, 0.55 - abs(x) * 0.5 + 0.12 * fract(vSeed * 7.0 + float(k) * 0.31));
          d = min(d, seg(q, vec2(x * 0.7, 0.08), tip) - 0.05);
          d = min(d, length(q - tip - vec2(x * 0.15, 0.13)) - 0.05);
        }
      } else {
        for (int k = 0; k < 6; k++) {
          float x = (float(k) - 2.5) * 0.34;
          vec2 dp = vec2(x * 1.9, 0.55 - x * x * 0.55 + 0.15 * fract(vSeed * 3.0 + float(k) * 0.43));
          d = min(d, length(q - dp) - 0.055);
        }
      }
    }
    if (d > 0.0) discard;
    // White, with a blue-grey edge.
    vec3 c = mix(vec3(0.42, 0.52, 0.58), vec3(0.94, 0.97, 1.0), step(d, -0.025));
    gl_FragColor = vec4(c * (1.0 + uFlash * 1.2), uFlat > 0.5 ? 0.32 : 0.78);
    #include <fog_fragment>
  }`;

export function buildRain(ctx: RainCtx): Rain {
  const { track, group } = ctx;
  const layers = [
    streaks(900, [36, 30, 36], { width: 2.2, opacity: 0.55, maxLen: 3.5, shutter: 0.05, colour: 0xd8e2e6 }),
    streaks(4200, [140, 90, 140], { width: 1.3, opacity: 0.38, maxLen: 8, shutter: 0.06, colour: 0xc4d0d4 }),
    streaks(6000, [420, 180, 420], { width: 1.0, opacity: 0.24, maxLen: 18, shutter: 0.09, colour: 0xb4c2c6 }),
  ];
  for (const l of layers) {
    group.add(l.mesh);
    // The streaks' widths are in pixels: the size it is drawn at, as it is drawn.
    l.mesh.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(l.mat.uniforms.uRes.value);
    };
  }

  // ---- splashes on the road ahead ----
  const N = 560;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.Float32BufferAttribute([-1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1], 2));
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18).fill(-1e5), 3));
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const up = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const born = new THREE.InstancedBufferAttribute(new Float32Array(N * 2).fill(-10), 2);
  pos.setUsage(THREE.DynamicDrawUsage);
  up.setUsage(THREE.DynamicDrawUsage);
  born.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', pos);
  geo.setAttribute('aUp', up);
  geo.setAttribute('aBorn', born);
  geo.instanceCount = N;
  const splashMat = (flat: boolean) =>
    new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uFlat: { value: flat ? 1 : 0 }, uFlash: { value: 0 } }]),
      vertexShader: SPLASH_VERTEX,
      fragmentShader: SPLASH_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
  const crowns = new THREE.Mesh(geo, splashMat(false));
  const rings = new THREE.Mesh(geo, splashMat(true));
  for (const m of [crowns, rings]) {
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.name = 'splashes';
    group.add(m);
  }

  const f = makeFrame();
  let s0 = -1;
  let seed = 777;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const camPrev = new THREE.Vector3();
  const camVel = new THREE.Vector3();
  const step = new THREE.Vector3();
  let tPrev = -1;
  let flashV = 0;
  /** The road sample nearest `p`, looking near the last one first. */
  const nearest = (p: THREE.Vector3) => {
    const n = track.n;
    let best = -1;
    let bd = Infinity;
    const scan = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        const i = ((k % n) + n) % n;
        const dd = (track.px[i] - p.x) ** 2 + (track.py[i] - p.y) ** 2 + (track.pz[i] - p.z) ** 2;
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
    };
    if (s0 < 0) scan(0, n - 1);
    else scan(s0 - 60, s0 + 60);
    if (bd > 400 * 400) scan(0, n - 1);
    return { i: best, d: Math.sqrt(bd) };
  };
  ctx.updates.push((time, camera) => {
    const cam = camera.position;
    const dt = tPrev < 0 ? 0 : time - tPrev;
    if (dt > 1e-4 && dt < 0.5) camVel.lerp(step.subVectors(cam, camPrev).divideScalar(dt).multiplyScalar(0.35), 0.4);
    else if (dt >= 0.5) camVel.set(0, 0, 0);
    camPrev.copy(cam);
    tPrev = time;
    for (const l of layers) {
      const u = l.mat.uniforms;
      u.uCam.value.copy(cam);
      u.uTime.value = time;
      u.uRel.value.copy(u.uFall.value).sub(camVel);
      u.uFlash.value = flashV;
    }
    // Respawn the splashes that have played out, on the road ahead.
    const near = nearest(cam);
    s0 = near.i;
    const ahead = Math.sign(camVel.x * track.tx[s0] + camVel.y * track.ty[s0] + camVel.z * track.tz[s0]) || 1;
    let changed = false;
    if (near.d < 80) {
      for (let k = 0; k < N; k++) {
        if (time - born.getX(k) < 0.25 + 0.05 * (k % 3)) continue;
        // Most near the camera, fewer far off.
        const along = 6 + Math.pow(rnd(), 1.25) * 165;
        const i = (((s0 + Math.round((ahead * along) / track.ds)) % track.n) + track.n) % track.n;
        const lanes = ctx.lanes(i);
        const ln = lanes[Math.floor(rnd() * lanes.length)];
        frameAt(track, i * track.ds, f);
        const d = ln.d + (rnd() * 2 - 1) * Math.max(0, ln.half - 0.8);
        pos.setXYZ(k, f.px + f.rx * d + f.ux * ln.rise, f.py + f.ry * d + f.uy * ln.rise, f.pz + f.rz * d + f.uz * ln.rise);
        up.setXYZ(k, f.ux, f.uy, f.uz);
        // (Started a little apart, so they do not all draw together.)
        born.setXY(k, time - rnd() * 0.08, 0.42 + rnd() * 0.5);
        changed = true;
      }
    }
    if (changed) {
      pos.needsUpdate = true;
      up.needsUpdate = true;
      born.needsUpdate = true;
    }
    for (const m of [crowns, rings]) {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = time;
      u.uFlash.value = flashV;
    }
  });

  return {
    flash(v: number) {
      flashV = v;
    },
  };
}

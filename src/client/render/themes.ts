// Each circuit's setting: the light, the sky, what lies below the road and
// the fog that blends them. world.ts builds the scenery from the `ground`
// kind; the colours here are all it needs to retint.
import * as THREE from 'three';
import { COLORS } from './palette';

export interface Theme {
  id: string;
  /** Key light and the hemisphere fill. */
  sunLight: number;
  sunIntensity: number;
  skyLight: number;
  groundLight: number;
  hemiIntensity: number;
  /** Sky gradient, zenith to horizon, and the sun's halo (linear RGB). */
  skyZenith: number;
  skyMid: number;
  skyHorizon: number;
  halo: [number, number, number];
  /** The disc in the plain sky (the sun, or a night's moon) and the wash round it (linear RGB); the sun's when absent. */
  disc?: [number, number, number];
  discGlow?: [number, number, number];
  /** High cloud: its lit colour (linear RGB) and how much of it there is (0..1). */
  cirrus: [number, number, number];
  cirrusAmount: number;
  fog: number;
  fogDensity: number;
  /** The aurora's curtains in the plain sky: how bright (0 or absent: none). */
  aurora?: number;
  /** What the circuit stands on, and how far down it is ('orbit': nothing; the sky is space, with the Earth below). */
  ground: 'sea' | 'desert' | 'clouds' | 'pit' | 'ice' | 'wreck' | 'orbit';
  groundY: number;
  groundDeep: number;
  groundLight2: number;
  /** Far mountains. */
  ridge: number;
  /** Cumulus: emissive tint (shadow side) and how many. */
  cloudShade: number;
  clouds: number;
}

export const THEMES: Record<string, Theme> = {
  // Golden hour over open sea, a city inside the loop.
  meridian: {
    id: 'meridian',
    sunLight: COLORS.sunLight,
    sunIntensity: 2.3,
    skyLight: COLORS.skyLight,
    groundLight: COLORS.groundLight,
    hemiIntensity: 0.95,
    skyZenith: COLORS.skyZenith,
    skyMid: COLORS.skyMid,
    skyHorizon: COLORS.skyHorizon,
    halo: [1.0, 0.7, 0.4],
    cirrus: [1.0, 0.86, 0.74],
    cirrusAmount: 0.6,
    fog: COLORS.fog,
    fogDensity: 0.00011,
    ground: 'sea',
    groundY: -6,
    groundDeep: COLORS.seaDeep,
    groundLight2: COLORS.seaShallow,
    ridge: 0x8fa3c4,
    cloudShade: 0x7f86b8,
    clouds: 34,
  },
  // Dusk in the desert: low copper light, a violet sky, red rock.
  canyon: {
    id: 'canyon',
    sunLight: 0xffc58f,
    sunIntensity: 2.2,
    skyLight: 0x9a8fd6,
    groundLight: 0xc77a4a,
    hemiIntensity: 0.9,
    skyZenith: 0x231f5c,
    skyMid: 0x7b4f9a,
    skyHorizon: 0xff9a55,
    halo: [1.0, 0.45, 0.2],
    cirrus: [1.0, 0.62, 0.5],
    cirrusAmount: 0.75,
    fog: 0xd88a6a,
    fogDensity: 0.00016,
    ground: 'desert',
    groundY: 0,
    groundDeep: 0x9a4f2c,
    groundLight2: 0xd99a62,
    ridge: 0x7a4a5e,
    cloudShade: 0x8a4a6a,
    clouds: 14,
  },
  // High noon above a sea of cloud: thin air, a deep blue sky, white light.
  helios: {
    id: 'helios',
    sunLight: 0xfff8ec,
    sunIntensity: 2.5,
    skyLight: 0xa9cfff,
    groundLight: 0xe8eef8,
    hemiIntensity: 1.0,
    skyZenith: 0x0a2f8f,
    skyMid: 0x3d8ff0,
    skyHorizon: 0xc4dcfa,
    halo: [1.0, 0.95, 0.85],
    cirrus: [1.0, 1.0, 1.0],
    cirrusAmount: 0.35,
    fog: 0xbcd3f2,
    fogDensity: 0.00007,
    ground: 'clouds',
    groundY: -70,
    groundDeep: 0x7f9ad0,
    groundLight2: 0xe4edf9,
    ridge: 0xb4c6e6,
    cloudShade: 0x8d9fd0,
    clouds: 46,
  },
  // Night over an open-pit mine: a cold moon, a violet sky with the city's
  // neon glowing magenta along the horizon, molten metal lighting the pit
  // from below. groundY is the plateau round the pit (see pit.ts).
  crucible: {
    id: 'crucible',
    sunLight: 0x9aa2c8,
    sunIntensity: 1.6,
    skyLight: 0x4c4290,
    groundLight: 0xff7a3c,
    hemiIntensity: 1.0,
    skyZenith: 0x04061a,
    skyMid: 0x1b1250,
    skyHorizon: 0x7a2a74,
    halo: [0.45, 0.55, 1.0],
    disc: [1.55, 1.65, 1.9],
    discGlow: [0.55, 0.62, 1.0],
    cirrus: [0.42, 0.26, 0.55],
    cirrusAmount: 0.35,
    fog: 0x3a1c4c,
    fogDensity: 0.00017,
    ground: 'pit',
    groundY: 406,
    groundDeep: 0x14121c,
    groundLight2: 0x2a2634,
    ridge: 0x1c1432,
    cloudShade: 0x2a1a40,
    clouds: 0,
  },
  // Blue hour on an ice shelf: the sun just down, a deep blue sky with a
  // pink band along the horizon, the aurora's curtains overhead, cold light
  // off the snow. groundY is the sea round the shelf (see frost.ts).
  frostline: {
    id: 'frostline',
    sunLight: 0xc4d2ff,
    sunIntensity: 1.5,
    skyLight: 0x7f9ce6,
    groundLight: 0xdbe6ff,
    hemiIntensity: 1.15,
    skyZenith: 0x070f33,
    skyMid: 0x22417e,
    skyHorizon: 0xd99ab6,
    halo: [0.55, 0.62, 1.0],
    disc: [1.5, 1.58, 1.8],
    discGlow: [0.45, 0.55, 0.95],
    cirrus: [0.62, 0.66, 0.92],
    cirrusAmount: 0.2,
    aurora: 1,
    fog: 0x6f7fb4,
    fogDensity: 0.00012,
    ground: 'ice',
    groundY: 0,
    groundDeep: 0x0a1630,
    groundLight2: 0x29507e,
    ridge: 0x3a4a78,
    cloudShade: 0x5a6aa8,
    clouds: 0,
  },
  // Morning in a white desert: a low white-gold sun in a clear aqua sky,
  // bone-white sand with cool blue shadows, a colossus lying in it.
  titan: {
    id: 'titan',
    sunLight: 0xfff0d6,
    sunIntensity: 2.3,
    skyLight: 0x9fd0dc,
    groundLight: 0xefe6d0,
    hemiIntensity: 1.0,
    skyZenith: 0x2f7fa8,
    skyMid: 0x9fd0dc,
    skyHorizon: 0xf2dca8,
    halo: [1.0, 0.9, 0.65],
    cirrus: [1.0, 0.95, 0.86],
    cirrusAmount: 0.4,
    fog: 0xd9c7a2,
    fogDensity: 0.00011,
    ground: 'wreck',
    groundY: 0,
    groundDeep: 0xb9b6cc,
    groundLight2: 0xefe6d0,
    ridge: 0xa9afcb,
    cloudShade: 0x9aa2c8,
    clouds: 16,
  },
  // In orbit: black sky and hard white sunlight, the Earth filling the sky
  // below the station, blue light coming up off it. groundY is far under
  // everything (nothing stands on it).
  zenith: {
    id: 'zenith',
    sunLight: 0xffffff,
    sunIntensity: 2.6,
    skyLight: 0x56648e,
    groundLight: 0x7eaae6,
    hemiIntensity: 1.35,
    skyZenith: 0x000004,
    skyMid: 0x02040c,
    skyHorizon: 0x2a5cb0,
    halo: [1.0, 0.98, 0.95],
    disc: [3.2, 3.1, 2.9],
    discGlow: [1.1, 1.05, 0.95],
    cirrus: [1, 1, 1],
    cirrusAmount: 0,
    fog: 0x05070f,
    fogDensity: 0.00001,
    ground: 'orbit',
    groundY: -3000,
    groundDeep: 0x0b2a5c,
    groundLight2: 0x3f7fc8,
    ridge: 0x1a2a4a,
    cloudShade: 0x8090b0,
    clouds: 0,
  },
};

export function themeFor(id: string | undefined): Theme {
  return THEMES[id ?? 'meridian'] ?? THEMES.meridian;
}

/** Free the GPU side of everything under `root`: geometry, materials and their textures. */
export function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<object>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const v of Object.values(m as unknown as Record<string, unknown>)) {
        if (v instanceof THREE.Texture && !seen.has(v) && !v.userData.shared) {
          seen.add(v);
          v.dispose();
        }
      }
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) {
        for (const e of Object.values(u)) {
          if (e && e.value instanceof THREE.Texture && !seen.has(e.value) && !e.value.userData.shared) {
            seen.add(e.value);
            e.value.dispose();
          }
        }
      }
      m.dispose();
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

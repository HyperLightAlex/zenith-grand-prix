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
  /** High cloud: its lit colour (linear RGB) and how much of it there is (0..1). */
  cirrus: [number, number, number];
  cirrusAmount: number;
  fog: number;
  fogDensity: number;
  /** What the circuit stands on, and how far down it is. */
  ground: 'sea' | 'desert' | 'clouds';
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

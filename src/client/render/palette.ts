// Colours and shared material helpers. One place to restyle the game.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();

export const COLORS = {
  sunLight: 0xfff1dc,
  skyLight: 0x9cc0ff,
  groundLight: 0xd9b48c,
  skyZenith: 0x1848ad,
  skyMid: 0x4f9df2,
  skyHorizon: 0xffc690,
  fog: 0xe6c9b4,
  seaDeep: 0x0f4f7a,
  seaShallow: 0x2f9bb5,
  road: 0xa7acb8,
  wall: 0xc9d1dc,
  wallDark: 0x39414f,
  accent: 0xff7a1a,
  charge: 0x35f0ff,
  cell: 0xffc93a,
  snare: 0xff7a2a,
  outline: 0x141a2a,
};

/**
 * Carve sparks by tier: pale while it builds, then cyan, gold and magenta as
 * it climbs. The HUD and the burst use the same.
 */
export const CARVE_COLORS = [0xd8ecff, 0x36dcff, 0xffbd2a, 0xff3fd8] as const;

export interface Livery {
  id: string;
  name: string;
  short: string;
  /** Main armour colour, secondary panels, dark frame, trim, and glow. */
  primary: number;
  secondary: number;
  frame: number;
  trim: number;
  glow: number;
  /**
   * The anime look's shadow colour for each paint, mixed the way a cel
   * painter mixed them: not the paint darkened but a colour of its own,
   * leaning violet (white armour shades to lavender grey, blue to deep
   * ultramarine-violet, red to maroon, gold to burnt orange). The circuit's
   * light leans them a little further (see setCelTheme).
   */
  shades: { primary: number; secondary: number; frame: number; trim: number };
  /** CSS colour for the HUD. */
  css: string;
  cssDim: string;
}

export const LIVERIES: Livery[] = [
  {
    id: 'solstice',
    name: 'Team Solstice',
    short: 'SOL',
    primary: 0xf4f6fb,
    secondary: 0x1f6fff,
    frame: 0x2a3142,
    trim: 0xffb21a,
    glow: 0x45e8ff,
    shades: { primary: 0xa6a3c8, secondary: 0x1e2a9c, frame: 0x171a2e, trim: 0xc0601e },
    css: '#3d8bff',
    cssDim: '#16356b',
  },
  {
    id: 'vanta',
    name: 'Team Vanta',
    short: 'VNT',
    primary: 0x4b4a5e,
    secondary: 0xe0263c,
    frame: 0x1d1d27,
    trim: 0xe6e8f0,
    glow: 0xff4a78,
    shades: { primary: 0x2e2a44, secondary: 0x7c1036, frame: 0x100f1c, trim: 0x9a96b6 },
    css: '#ff3d5a',
    cssDim: '#6b1626',
  },
];

let gradient: THREE.DataTexture | null = null;

/** Three-step ramp for cel shading. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 230, 230, 230, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  // Shared by every toon material: never freed with a circuit's scenery.
  gradient.userData.shared = true;
  return gradient;
}

export function toonMaterial(opts: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true, ...opts });
}

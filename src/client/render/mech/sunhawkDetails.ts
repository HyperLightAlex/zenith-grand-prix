import * as THREE from 'three';
import atlasUrl from './assets/sunhawk-details.png?url';
import { factionName, toonGradient, type Livery } from '../palette';

let material: THREE.MeshToonMaterial;
let loading: Promise<void> | undefined;

/** One small shared atlas for the seven conforming, UV-mapped armor overlays. */
export function preloadSunhawkDetails(): Promise<void> {
  return loading ??= new THREE.TextureLoader().loadAsync(atlasUrl).then((map) => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = false; // UVs already follow glTF's top-left image convention.
    map.anisotropy = 4;
    map.userData.shared = true;
    material = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient(), transparent: true,
      alphaTest: .03, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  });
}

/**
 * The painted details for the team a Sunhawk part flies for. Its own (left
 * out, or Solstice) is the atlas as painted; any other team's has the
 * Solstice lettering on it ("SOL / S1", "SOLSTICE") redrawn as that team's,
 * since a part carries no faction's marks of its own (docs/CUSTOMIZATION.md).
 */
export function sunhawkDetailMaterial(team?: Livery): THREE.MeshToonMaterial {
  if (!material) throw new Error('Sunhawk detail atlas must load before building a frame');
  if (!team || team.id === 'solstice') return material;
  let m = teams.get(team.id);
  if (!m) {
    m = material.clone();
    m.map = teamAtlas(material.map!, team);
    teams.set(team.id, m);
  }
  return m;
}

const teams = new Map<string, THREE.MeshToonMaterial>();

/** The lettering painted in the atlas: the box it fills (pixels), its centre line, and what a team's says. */
const LETTERING: Array<{ box: [number, number, number, number]; cx: number; text: (l: Livery) => string }> = [
  { box: [210, 71, 263, 87], cx: 236, text: (l) => `${l.short} / S1` },
  { box: [723, 876, 789, 890], cx: 755.5, text: (l) => factionName(l).toUpperCase() },
];

/** The atlas with a team's lettering in place of Solstice's, in the same ink and size. */
function teamAtlas(base: THREE.Texture, team: Livery): THREE.Texture {
  const img = base.image as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  g.fillStyle = 'rgba(39, 53, 79, 0.64)';
  g.font = '500 13px "Barlow", "Arial", sans-serif';
  g.textAlign = 'center';
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '1px';
  for (const t of LETTERING) {
    const [x0, y0, x1, y1] = t.box;
    g.clearRect(x0, y0, x1 - x0, y1 - y0);
    g.fillText(t.text(team), t.cx, y1 - 3);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.anisotropy = 4;
  map.userData.shared = true;
  return map;
}

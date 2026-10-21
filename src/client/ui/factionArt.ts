// Each faction's emblem and pilots' portraits, by faction (an index into
// LIVERIES), painted, from hudArt.ts (the HUD and faction sheets). A faction
// added before its art is painted gets a stand-in drawn here in its own
// colours: a badge for the emblem, and the badge on a dark card for a pilot.
import { LIVERIES } from '../render/palette';
import { EMBLEMS, PILOTS } from './hudArt';

const drawn = new Map<string, string>();

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Tempest: a lightning bolt through three curls of wind on a jade shield. Anyone else: their initial on a disc. Drawn 192 px square. */
function paintEmblem(g: CanvasRenderingContext2D, f: number): void {
  const l = LIVERIES[f];
  const ink = '#0d1630';
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = ink;
  if (l.id === 'tempest') {
    // The shield, leaning like the painted ones.
    g.beginPath();
    g.moveTo(48, 30);
    g.lineTo(170, 14);
    g.lineTo(150, 128);
    g.lineTo(92, 178);
    g.lineTo(26, 120);
    g.closePath();
    g.fillStyle = hex(l.primary);
    g.fill();
    g.stroke();
    // The wind.
    g.strokeStyle = '#f4f6fb';
    g.lineWidth = 9;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      g.beginPath();
      g.arc(98 + Math.cos(a) * 20, 92 + Math.sin(a) * 20, 34, a + 0.4, a + 2.2);
      g.stroke();
    }
    // The bolt, breaking out top and bottom.
    g.lineWidth = 6;
    g.strokeStyle = ink;
    g.beginPath();
    g.moveTo(118, 4);
    g.lineTo(78, 98);
    g.lineTo(102, 94);
    g.lineTo(80, 188);
    g.lineTo(124, 80);
    g.lineTo(100, 84);
    g.closePath();
    g.fillStyle = hex(l.trim);
    g.fill();
    g.stroke();
  } else {
    g.beginPath();
    g.arc(96, 96, 80, 0, Math.PI * 2);
    g.fillStyle = l.css;
    g.fill();
    g.stroke();
    g.fillStyle = '#f4f6fb';
    g.font = "italic 800 110px 'Barlow Condensed', 'DIN Condensed', 'Arial Narrow', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(l.short[0], 96, 100);
  }
}

function drawEmblem(f: number): string {
  const [c, g] = canvas(192);
  paintEmblem(g, f);
  return c.toDataURL('image/png');
}

/** A faction's emblem, as an image URL. */
export function emblemUrl(f: number): string {
  if (EMBLEMS[f]) return EMBLEMS[f];
  const key = `emblem-${f}`;
  let url = drawn.get(key);
  if (!url) {
    url = drawEmblem(f);
    drawn.set(key, url);
  }
  return url;
}

/** A faction's emblem by its id (for the mechs' markings, which know the livery). */
export function emblemUrlFor(id: string): string {
  return emblemUrl(Math.max(0, LIVERIES.findIndex((l) => l.id === id)));
}

/**
 * A seat's portrait: the person's own (`portrait`, an index into the
 * gallery) or, at -1, the faction's pilot for the seat.
 */
export function faceUrl(f: number, role: number, portrait = -1): string {
  return (portrait >= 0 && PILOTS[portrait]) || pilotUrl(f, role);
}

/** A faction pilot's portrait, as an image URL: painted, or the faction's badge on a dark card. */
export function pilotUrl(f: number, role: number): string {
  if (PILOTS[f * 3 + role]) return PILOTS[f * 3 + role];
  const key = `pilot-${f}`;
  let url = drawn.get(key);
  if (!url) {
    const l = LIVERIES[f];
    const [c, g] = canvas(256);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, l.cssDim);
    grad.addColorStop(1, '#0b0f1c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.translate(32, 36);
    paintEmblem(g, f);
    url = c.toDataURL('image/png');
    drawn.set(key, url);
  }
  return url;
}

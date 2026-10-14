// Each faction's emblem and pilots' portraits, by faction (an index into
// LIVERIES). Painted ones come from hudArt.ts (the HUD and faction sheets):
// every faction's pilots, and Solstice's and Vanta's emblems. Art still to be
// painted gets a stand-in drawn here in the faction's own colours: a badge for
// the emblem, and the badge on a dark card for a pilot.
import { LIVERIES } from '../render/palette';
import { EMBLEMS, PILOTS } from './hudArt';

const drawn = new Map<string, string>();

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Mirage: a winged sun disc in gold on a rust gateway. Aurora: a four-point star in a halo on a violet shield. Anyone else: their initial on a disc. Drawn 192 px square. */
function paintEmblem(g: CanvasRenderingContext2D, f: number): void {
  const l = LIVERIES[f];
  const ink = '#0d1630';
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = ink;
  if (l.id === 'mirage') {
    // The gateway: a pylon, wider at its foot.
    g.beginPath();
    g.moveTo(40, 22);
    g.lineTo(152, 22);
    g.lineTo(170, 170);
    g.lineTo(22, 170);
    g.closePath();
    g.fillStyle = hex(l.secondary);
    g.fill();
    g.stroke();
    // The wings, three feathers a side.
    g.fillStyle = hex(l.trim);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(96 + s * 18, 86 + k * 10);
        g.lineTo(96 + s * (84 - k * 12), 70 + k * 16);
        g.lineTo(96 + s * (78 - k * 12), 84 + k * 16);
        g.lineTo(96 + s * 18, 100 + k * 10);
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    // The sun.
    g.beginPath();
    g.arc(96, 92, 24, 0, Math.PI * 2);
    g.fillStyle = hex(l.trim);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(96, 92, 11, 0, Math.PI * 2);
    g.fillStyle = hex(l.secondary);
    g.fill();
  } else if (l.id === 'aurora') {
    // A heater shield.
    g.beginPath();
    g.moveTo(30, 24);
    g.lineTo(162, 24);
    g.lineTo(162, 92);
    g.quadraticCurveTo(160, 150, 96, 176);
    g.quadraticCurveTo(32, 150, 30, 92);
    g.closePath();
    g.fillStyle = hex(l.primary);
    g.fill();
    g.stroke();
    // The halo.
    g.beginPath();
    g.ellipse(96, 92, 50, 16, 0, 0, Math.PI * 2);
    g.lineWidth = 9;
    g.strokeStyle = hex(l.trim);
    g.stroke();
    // The star.
    g.lineWidth = 6;
    g.strokeStyle = ink;
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + (k / 8) * Math.PI * 2;
      const r = k % 2 === 0 ? 60 : 15;
      g.lineTo(96 + Math.cos(a) * r, 92 + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = hex(l.secondary);
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

/** A pilot's portrait, as an image URL: painted, or the faction's badge on a dark card. */
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

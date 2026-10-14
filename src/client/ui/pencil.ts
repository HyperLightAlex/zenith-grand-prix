// Red pencil on the anime look's paper menus: a ring drawn round the chosen
// row, a line under your own result. Drawn fresh each time, so no two rings
// are quite the same, as if marked up by hand on a model sheet.
const SVG = 'http://www.w3.org/2000/svg';

function svgBox(w: number, h: number, cls: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function stroke(svg: SVGSVGElement, pts: Array<[number, number]>, width: number): void {
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L'));
  path.setAttribute('pathLength', '1');
  path.setAttribute('stroke-width', width.toFixed(2));
  svg.append(path);
}

/**
 * A loop round a box `w` by `h` pixels (the ring's own box, a little larger
 * than what it circles). A squarish loop, so a row's ends stay inside it; it
 * goes round once and a bit, drifting outward so the ends cross.
 */
export function pencilRing(w: number, h: number, width: number): SVGSVGElement {
  const svg = svgBox(w, h, 'pencil ring');
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - width * 1.5;
  const ry = h / 2 - width * 1.5;
  const start = Math.PI * (1.12 + Math.random() * 0.16);
  const turns = 1.08 + Math.random() * 0.06;
  const phase = Math.random() * Math.PI * 2;
  const tilt = (Math.random() - 0.5) * 0.03;
  const pts: Array<[number, number]> = [];
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + t * turns * Math.PI * 2;
    // Squarer than an ellipse: |cos|^(2/3) keeps the long sides straight.
    const c = Math.cos(a);
    const s = Math.sin(a);
    const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.62);
    const sy = Math.sign(s) * Math.pow(Math.abs(s), 0.62);
    const r = 0.95 + 0.07 * t + 0.018 * Math.sin(t * Math.PI * 3.4 + phase);
    const x = sx * rx * r;
    const y = sy * ry * (0.92 + 0.12 * t) * r;
    pts.push([cx + x - y * tilt, cy + y + x * tilt]);
  }
  stroke(svg, pts, width);
  return svg;
}

/** A pencil line under something `w` pixels wide: not quite straight, hooked at the end. */
export function pencilLine(w: number, h: number, width: number): SVGSVGElement {
  const svg = svgBox(w, h, 'pencil line');
  const pts: Array<[number, number]> = [];
  const y0 = h * 0.5;
  const slope = (Math.random() - 0.5) * h * 0.3;
  const phase = Math.random() * Math.PI * 2;
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([width + t * (w - width * 2), y0 + slope * t + Math.sin(t * Math.PI * 2.2 + phase) * h * 0.08]);
  }
  // The flick back where the pencil left the paper.
  const [ex, ey] = pts[pts.length - 1];
  pts.push([ex - h * 0.9, ey - h * 0.32]);
  stroke(svg, pts, width);
  return svg;
}

import type * as THREE from 'three';

/** Opt-in local QA overlay (?perf=1). No telemetry or work in normal play. */
export class ReviewProbe {
  private readonly output = document.createElement('pre');
  private intervals: number[] = [];
  private last = 0;
  private published = 0;
  private frames = 0;
  private elapsed = 0;
  private totalCalls = 0;
  private totalTriangles = 0;
  private maxGeometries = 0;
  private context = 'loading';
  private lods = '';
  private previewMs = 0;

  recordPreview(ms: number): void { this.previewMs = +ms.toFixed(1); }

  constructor() {
    this.output.id = 'render-review';
    this.output.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:90;margin:0;padding:8px 10px;background:#07121ce8;color:#d9f6ff;font:11px/1.45 monospace;pointer-events:none';
    this.output.setAttribute('aria-label','Render review statistics');
    document.body.append(this.output);
  }

  setContext(state: string, lods: string): void { this.context = state; this.lods = lods; }

  record(renderer: THREE.WebGLRenderer, quality: string, scale: number, cap: number): void {
    const now = performance.now();
    const interval = this.last ? now - this.last : 0;
    this.last = now;
    if (interval > 0 && this.context.startsWith('race')) {
      this.frames++;
      this.elapsed += interval;
      this.intervals.push(interval);
      if (this.intervals.length > 600) this.intervals.shift();
      this.totalCalls += renderer.info.render.calls;
      this.totalTriangles += renderer.info.render.triangles;
      this.maxGeometries = Math.max(this.maxGeometries, renderer.info.memory.geometries);
    }
    if (now - this.published < 1000) return;
    this.published = now;
    const sorted = this.intervals.slice().sort((a,b) => a-b);
    const stats = { context: this.context, frames: this.frames, seconds: +(this.elapsed/1000).toFixed(1),
      meanFps: +(this.frames*1000/Math.max(1,this.elapsed)).toFixed(1),
      recentP95ms: +(sorted[Math.floor(sorted.length*.95)] ?? 0).toFixed(1),
      meanDrawCalls: Math.round(this.totalCalls/Math.max(1,this.frames)),
      meanTrianglesAllPasses: Math.round(this.totalTriangles/Math.max(1,this.frames)),
      geometries: renderer.info.memory.geometries, maxGeometries: this.maxGeometries,
      resolution: `${renderer.domElement.width}×${renderer.domElement.height}`, quality, scale, cap, lods: this.lods, previewMs: this.previewMs };
    this.output.dataset.stats = JSON.stringify(stats);
    this.output.textContent = `${stats.context} · ${stats.frames} frames / ${stats.seconds}s\n${stats.meanFps} mean fps · ${stats.recentP95ms}ms recent p95\n${stats.meanDrawCalls} calls · ${stats.meanTrianglesAllPasses.toLocaleString()} tris (all passes)\n${stats.resolution} · ${quality} · scale ${scale.toFixed(2)} · cap ${cap || 'off'}\nMech LOD ${this.lods || '—'} · ${stats.geometries} geometries\nGarage build ${this.previewMs}ms`;
  }
}

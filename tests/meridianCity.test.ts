// Meridian's city layout (render/meridianCity.ts): its blocks lie on their
// islands inside the promenade, the bridges leave from the islands' edges
// and join every island into one city.

import { describe, expect, it } from 'vitest';
import { TRACKS, buildTrack } from '../src/sim/index';
import { BLOCK, PROMENADE, bridgeEnds, bridgeLinks, fromIsland, islandBlocks, islandOutline, islandsMeet, meridianIslands, onIsland, toIsland } from '../src/client/render/meridianCity';
import { trackPoint } from '../src/client/render/trackSpace';
import * as THREE from 'three';

// The islands as the game lays them round Meridian Skyway.
const track = buildTrack(TRACKS.find((t) => t.id === 'meridian')!);
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < track.n; i += 8) {
  minX = Math.min(minX, track.px[i]);
  maxX = Math.max(maxX, track.px[i]);
  minZ = Math.min(minZ, track.pz[i]);
  maxZ = Math.max(maxZ, track.pz[i]);
}
const start = trackPoint(track, -120, 0, 0, new THREE.Vector3());
const isles = meridianIslands({ cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, minX, maxX, minZ, maxZ }, { x: start.x, z: start.z, rot: Math.atan2(track.tz[0], track.tx[0]) + Math.PI / 2 });

describe("Meridian's city", () => {
  it('keeps its islands apart, sea between every two', () => {
    for (let i = 0; i < isles.length; i++) for (let j = i + 1; j < isles.length; j++) expect(islandsMeet(isles[i], isles[j], 8), `${i} and ${j}`).toBe(false);
  });

  it('puts the start island under the start straight, the twin towers on it', () => {
    for (const side of [-1, 1]) {
      const at = trackPoint(track, 120, side * 150, 0, new THREE.Vector3());
      const [u, v] = toIsland(isles[0], at.x, at.z);
      expect(onIsland(isles[0], u, v, 40)).toBe(true);
    }
  });

  it('turns between the world and an island and back', () => {
    for (const isle of isles) {
      const [x, z] = fromIsland(isle, 37, -91);
      const [u, v] = toIsland(isle, x, z);
      expect(u).toBeCloseTo(37, 6);
      expect(v).toBeCloseTo(-91, 6);
    }
  });

  it('lays every block wholly on its island, inside the promenade', () => {
    for (const isle of isles) {
      const blocks = islandBlocks(isle);
      expect(blocks.length).toBeGreaterThan(4);
      for (const [u, v] of blocks) {
        for (const du of [-BLOCK / 2, BLOCK / 2]) for (const dv of [-BLOCK / 2, BLOCK / 2]) expect(onIsland(isle, u + du, v + dv, PROMENADE)).toBe(true);
      }
    }
  });

  it('draws its edge round the island', () => {
    for (const isle of isles) {
      for (const [x, z] of islandOutline(isle, 32)) {
        const [u, v] = toIsland(isle, x, z);
        expect(onIsland(isle, u * 0.99, v * 0.99)).toBe(true);
        expect(onIsland(isle, u * 1.02, v * 1.02)).toBe(false);
      }
    }
  });

  it('joins every island into one city, each bridge from one edge to the other', () => {
    const links = bridgeLinks(isles);
    expect(links.length).toBe(isles.length - 1);
    const reached = new Set([0]);
    for (const [a, b] of links) {
      expect(reached.has(a)).toBe(true);
      reached.add(b);
    }
    expect(reached.size).toBe(isles.length);
    for (const [a, b] of links) {
      const [p, q] = bridgeEnds(isles[a], isles[b]);
      // Each end on its own island, near its edge; neither on the other.
      for (const [end, own, other] of [[p, isles[a], isles[b]], [q, isles[b], isles[a]]] as const) {
        const [u, v] = toIsland(own, end[0], end[1]);
        expect(onIsland(own, u, v)).toBe(true);
        expect(onIsland(own, u, v, 12)).toBe(false);
        const [ou, ov] = toIsland(other, end[0], end[1]);
        expect(onIsland(other, ou, ov)).toBe(false);
      }
    }
  });
});

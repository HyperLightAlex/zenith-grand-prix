// A preview of the titan's Blender model in the game, until the Blender agent
// cuts the road's openings into it (art/blender/titan/README.txt, phase 2):
// the model posed as the wreck (pose_model.py) with every triangle that
// reaches into the space round the road taken out (the game's own test,
// keepout.ts), so the road runs clear through it. The openings are rough,
// triangles gone where the road passes, not shaped. The chest is opened up to
// the sky over the road, as the placeholder's is, so the road can be seen
// through it.
//
//   npx tsx tools/titan/cut_preview.ts <posed.glb> <out titan.glb>
//
// Writes one mesh per part and material slot, named titan/<part>/<slot>, as
// read.ts reads them.
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readTitanLevel } from '../../src/client/render/titan/read';
import { KEEP_OUT, RoadIndex, triangleInRoad } from '../../src/client/render/titan/keepout';
import { buildTrack } from '../../src/sim/track';
import { trackById } from '../../src/sim/tracks/index';

const [src, out] = process.argv.slice(2);
const OPEN_TO_SKY = new Set(['chest']);
const t = buildTrack(trackById('titan'));
const index = new RoadIndex(t);
const bytes = readFileSync(src);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const level = readTitanLevel(gltf.scene);

interface Prim { part: string; slot: string; pos: Float32Array; nor: Float32Array; idx: Uint32Array }
const prims: Prim[] = [];
let before = 0;
let after = 0;
const scratch: number[] = [];
for (const [part, bySlot] of level) {
  const up = OPEN_TO_SKY.has(part) ? KEEP_OUT.sky : KEEP_OUT.up;
  for (const [slot, g] of Object.entries(bySlot)) {
    const p = g!.attributes.position.array as Float32Array;
    const n = g!.attributes.normal.array as Float32Array;
    // Welded back into shared vertices (by position and normal) as it goes.
    const key = new Map<string, number>();
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k < p.length; k += 9) {
      before++;
      if (triangleInRoad(index, p, k, 2, up, KEEP_OUT.down, scratch)) continue;
      after++;
      for (let v = k; v < k + 9; v += 3) {
        const id = `${p[v].toFixed(3)},${p[v + 1].toFixed(3)},${p[v + 2].toFixed(3)},${n[v].toFixed(2)},${n[v + 1].toFixed(2)},${n[v + 2].toFixed(2)}`;
        let i = key.get(id);
        if (i === undefined) {
          i = pos.length / 3;
          key.set(id, i);
          pos.push(p[v], p[v + 1], p[v + 2]);
          nor.push(n[v], n[v + 1], n[v + 2]);
        }
        idx.push(i);
      }
    }
    if (idx.length) prims.push({ part, slot, pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) });
  }
}

// ---- a minimal GLB: a node, a mesh and a material per part and slot ----------
const slots = [...new Set(prims.map((q) => q.slot))];
const chunks: Buffer[] = [];
let offset = 0;
const views: object[] = [];
const accessors: object[] = [];
const view = (data: Float32Array | Uint32Array, target: number) => {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const pad = (4 - (buf.length % 4)) % 4;
  chunks.push(buf, Buffer.alloc(pad));
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  offset += buf.length + pad;
  return views.length - 1;
};
const nodes: object[] = [];
const meshes: object[] = [];
for (const q of prims) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < q.pos.length; k += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], q.pos[k + a]);
      max[a] = Math.max(max[a], q.pos[k + a]);
    }
  }
  accessors.push({ bufferView: view(q.pos, 34962), componentType: 5126, count: q.pos.length / 3, type: 'VEC3', min, max });
  const P = accessors.length - 1;
  accessors.push({ bufferView: view(q.nor, 34962), componentType: 5126, count: q.nor.length / 3, type: 'VEC3' });
  const N = accessors.length - 1;
  accessors.push({ bufferView: view(q.idx, 34963), componentType: 5125, count: q.idx.length, type: 'SCALAR' });
  const I = accessors.length - 1;
  meshes.push({ name: `titan/${q.part}/${q.slot}`, primitives: [{ attributes: { POSITION: P, NORMAL: N }, indices: I, material: slots.indexOf(q.slot) }] });
  nodes.push({ name: `titan/${q.part}/${q.slot}`, mesh: meshes.length - 1, extras: { part: q.part, name: `titan/${q.part}/${q.slot}` } });
}
const json = {
  asset: { version: '2.0', generator: 'tools/titan/cut_preview.ts' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, k) => k) }],
  nodes,
  meshes,
  materials: slots.map((name) => ({ name, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } })),
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: offset }],
};
let text = Buffer.from(JSON.stringify(json));
text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
const bin = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
const chunk = (type: number, data: Buffer) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(data.length, 0);
  h.writeUInt32LE(type, 4);
  return Buffer.concat([h, data]);
};
writeFileSync(out, Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]));
console.log(`${before} triangles, ${after} left (${before - after} in the road's space cut); ${prims.length} meshes; wrote ${out} (${(12 + 16 + text.length + bin.length) / 1e6} MB)`);

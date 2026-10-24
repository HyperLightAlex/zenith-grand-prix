// The titan model's top from above (read.ts titanTopGrid), for the road's
// supports to stand on and the scenery to keep off, from titan.glb into
// assets/titan-top.json beside it. Run whenever titan.glb changes (the tests
// check the two agree):
//
//   npx tsx tools/titan/top.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readTitanLevel, titanTopGrid } from '../../src/client/render/titan/read';

const dir = new URL('../../src/client/render/titan/assets/', import.meta.url);
const bytes = readFileSync(new URL('titan.glb', dir));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const grid = titanTopGrid(readTitanLevel(gltf.scene));
writeFileSync(new URL('titan-top.json', dir), JSON.stringify(grid) + '\n');
console.log(`titan-top.json: ${grid.nx} x ${grid.nz} cells of ${grid.cell}, from (${grid.x0}, ${grid.z0})`);

/** Capture the original designs as separate modelling components, never render.
 * Run: node tools/roster/capture.mjs [model-name]
 * This is a modelling input, not the upgraded game asset.
 */
import { createServer } from 'vite';
import * as THREE from 'three';
import { writeFile, mkdir } from 'node:fs/promises';
const ctx = new Proxy({}, { get: (_, k) => k === 'measureText' ? () => ({width:32}) : () => {}, set: () => true });
globalThis.document = { createElement: () => ({width:128,height:128,getContext:()=>ctx}) };
THREE.TextureLoader.prototype.load = () => new THREE.Texture();
const server = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
try {
  const { Kit } = await server.ssrLoadModule('/src/client/render/mech/kit.ts');
  const { buildFrame } = await server.ssrLoadModule('/src/client/render/mech/frames.ts');
  const { setSunhawkModel } = await server.ssrLoadModule('/src/client/render/mech/sunhawkSelection.ts');
  const { setRosterModel } = await server.ssrLoadModule('/src/client/render/mech/rosterSelection.ts');
  const { LIVERIES } = await server.ssrLoadModule('/src/client/render/palette.ts');
  setSunhawkModel('game');
  setRosterModel('current');
  await mkdir('art/blender/roster/source',{recursive:true});
  const tags = new WeakMap();
  let activeNozzle;
  let activeVent;
  const nozzle = Kit.prototype.nozzle;
  Kit.prototype.nozzle = function(r, len, o = {}, sides = 10) {
    activeNozzle = {r,len,at:o.at ?? [0,0,0],rot:o.rot ?? [0,0,0],sides};
    try { return nozzle.call(this,r,len,o,sides); }
    finally { activeNozzle = undefined; }
  };
  const vent = Kit.prototype.vent;
  Kit.prototype.vent = function(w,h,slats,o={}) {
    activeVent={w,h,at:o.at ?? [0,0,0],rot:o.rot ?? [0,0,0]};
    try { return vent.call(this,w,h,slats,o); }
    finally { activeVent=undefined; }
  };
  const push = Kit.prototype.push;
  Kit.prototype.push = function(g, slot, o, ...rest) {
    const hand = /at (fist|clawHand)\b/.test(new Error().stack);
    const result = push.call(this,g,slot,o,...rest);
    const list = slot === 'G' ? this.glow : this.armor;
    tags.set(list.at(-1), {hand,nozzle:activeNozzle,vent:activeVent});
    return result;
  };
  Kit.prototype.build = function() {
    const group = new THREE.Group();
    group.userData.parts = [...this.armor.map((g,i)=>({g,slot:this.armorSlots[i],...tags.get(g)})), ...this.glow.map(g=>({g,slot:'G',...tags.get(g)}))];
    this.armor=[];this.armorSlots=[];this.armorPanels=[];this.glow=[];
    return {group,armor:null,glow:null};
  };
  for (const livery of LIVERIES) for (const role of [0,1,2]) {
    if (livery.id === 'solstice' && role === 0) continue;
    const id = livery.models[role].toLowerCase();
    if (process.argv[2] && process.argv[2] !== id) continue;
    const rig=buildFrame(role,livery,String(role+1));
    const joints={...rig.joints,skirtL:rig.skirts.l,skirtR:rig.skirts.r,skirtBack:rig.skirts.back};
    const byObj = new Map(Object.entries(joints).map(([n,o])=>[o,n]));
    rig.root.updateMatrixWorld(true);
    const parts=[];
    rig.root.traverse(o=>{
      if (!o.userData.parts) return;
      let parent=o;
      while(parent && !byObj.has(parent)) parent=parent.parent;
      if(!parent) throw new Error('Unbound geometry');
      const matrix=parent.matrixWorld.clone().invert().multiply(o.matrixWorld);
      for(const p of o.userData.parts) {
        const g=p.g.clone().applyMatrix4(matrix);
        parts.push({joint:byObj.get(parent),slot:p.slot,hand:p.hand,nozzle:p.nozzle,vent:p.vent,positions:Array.from(g.getAttribute('position').array)});
        g.dispose();p.g.dispose();
      }
    });
    const jointData=Object.fromEntries(Object.entries(joints).map(([n,o])=>[n,{position:o.position.toArray(),world:o.getWorldPosition(new THREE.Vector3()).toArray()}]));
    await writeFile(`art/blender/roster/source/${id}.json`,JSON.stringify({id,role,livery,dims:rig.dims,joints:jointData,parts}));
    console.log(`${id}: ${parts.length} components, ${parts.reduce((s,p)=>s+p.positions.length/9,0)} source triangles`);
  }
} finally { await server.close(); }

#!/usr/bin/env node
/**
 * Prove that part-tag exports only regroup the existing stock assets.
 * Expands indexed GLB triangles and line segments, compares joint/paint-slot
 * multisets with multiplicity, and preserves triangle winding. Cyclic triangle
 * rotation and undirected line endpoint ordering are the only normalizations.
 * No positional/normal/width tolerance is used for a PASS.
 *
 * node tools/parts-compare.mjs --baseline <commit> [--design daystar]
 *     [--report art/blender/roster/previews/parts/triangle-equivalence.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function option(name,fallback) { const i=args.indexOf(name); return i<0?fallback:args[i+1]; }
const baseline=option('--baseline','e3acda26ca8c9c77f3d1fff6a3b8d2a773cbfa0a');
const baselineCommit=execFileSync('git',['rev-parse',`${baseline}^{commit}`],{cwd:root,encoding:'utf8'}).trim();
const designFilter=option('--design');
const reportPath=resolve(root,option('--report','art/blender/roster/previews/parts/triangle-equivalence.json'));
const designs=['sunhawk','daystar','rampart','razor','stinger','maul','anubis','horus','sobek','seraph','longbow','paladin','kamaitachi','fujin','raijin'];
if(designFilter&&!designs.includes(designFilter)) throw new Error(`Unknown design: ${designFilter}`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fromGit=path=>execFileSync('git',['show',`${baselineCommit}:${path}`],{cwd:root,maxBuffer:64*1024*1024});
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const components={5120:[1,'readInt8'],5121:[1,'readUInt8'],5122:[2,'readInt16LE'],5123:[2,'readUInt16LE'],5125:[4,'readUInt32LE'],5126:[4,'readFloatLE']};
function glb(bytes) {
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2) throw new Error('Expected GLB 2');
  let json,bin;
  for(let offset=12;offset<bytes.length;) {
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));if(type===0x004e4942)bin=chunk;offset+=8+length;
  }
  if(!json||!bin)throw new Error('Missing GLB JSON or binary chunk');
  const accessors=new Map();
  function accessor(index) {
    if(accessors.has(index))return accessors.get(index);
    const a=json.accessors[index],v=json.bufferViews[a.bufferView];
    if(a.sparse||v.buffer!==0)throw new Error('Unsupported sparse/external accessor');
    const [size,method]=components[a.componentType],width=widths[a.type],stride=v.byteStride??size*width;
    const offset=(v.byteOffset??0)+(a.byteOffset??0),values=[];
    for(let i=0;i<a.count;i++) {
      const row=[];
      for(let k=0;k<width;k++) {
        let x=bin[method](offset+i*stride+k*size);
        if(a.normalized&&a.componentType!==5126) {
          if(a.componentType===5120)x=Math.max(-1,x/127);
          else if(a.componentType===5121)x/=255;
          else if(a.componentType===5122)x=Math.max(-1,x/32767);
          else if(a.componentType===5123)x/=65535;
        }
        if(!Number.isFinite(x))throw new Error(`Non-finite accessor ${index}`);
        row.push(x===0?0:x);
      }
      values.push(row);
    }
    accessors.set(index,values);return values;
  }
  const parents=new Map();
  json.nodes.forEach((n,i)=>(n.children??[]).forEach(child=>parents.set(child,i)));
  function transform(i) {
    const chain=[];
    while(i!==undefined) {
      const n=json.nodes[i];
      if(n.matrix)chain.push({matrix:n.matrix});
      if(n.translation||n.rotation||n.scale)chain.push({translation:n.translation??[0,0,0],rotation:n.rotation??[0,0,0,1],scale:n.scale??[1,1,1]});
      i=parents.get(i);
    }
    return chain;
  }
  const buckets=new Map(),presentParts=new Set();
  const get=joint=>{if(!buckets.has(joint))buckets.set(joint,{triangles:[],lines:[]});return buckets.get(joint);};
  json.nodes.forEach((node,nodeIndex)=>{
    if(node.mesh===undefined)return;
    const {joint,slot,part,ink_lines,detail=false}=node.extras??{};
    if(!joint)throw new Error(`Untagged joint on ${node.name}`);
    const matrix=transform(nodeIndex);
    for(const primitive of json.meshes[node.mesh].primitives) {
      const mode=primitive.mode??4,isLine=mode===1;
      if(!isLine&&mode!==4)throw new Error(`Unsupported primitive mode ${mode}`);
      if(isLine&&ink_lines!==1)throw new Error(`Unmarked ink primitive ${node.name}`);
      const attrs=Object.keys(primitive.attributes).sort();
      if(!isLine&&!(detail?['POSITION','NORMAL','TEXCOORD_0']:['POSITION','NORMAL','_OUTLINE_NORMAL','_INK_WIDTH']).every(key=>attrs.includes(key)))throw new Error(`Missing triangle attributes on ${node.name}`);
      if(isLine&&!attrs.includes('_LINE_KIND'))throw new Error(`Missing line kind on ${node.name}`);
      const data=attrs.map(attr=>accessor(primitive.attributes[attr]));
      const indices=primitive.indices===undefined?data[0].map((_,i)=>i):accessor(primitive.indices).map(v=>v[0]);
      const step=isLine?2:3;
      if(indices.length%step)throw new Error(`Incomplete primitive ${node.name}`);
      const bucket=get(joint)[isLine?'lines':'triangles'];
      for(let i=0;i<indices.length;i+=step) {
        const vertices=indices.slice(i,i+step).map(index=>data.map(values=>values[index]));
        const candidates=isLine?[vertices,[vertices[1],vertices[0]]]:[vertices,[vertices[1],vertices[2],vertices[0]],[vertices[2],vertices[0],vertices[1]]];
        const canonical=candidates.map(v=>({v,key:JSON.stringify(v)})).sort((a,b)=>a.key.localeCompare(b.key))[0];
        const key=JSON.stringify([isLine?'INK':`${slot}:${detail?'detail':'armour'}`,attrs,matrix,canonical.v]);
        // Approximate positions are diagnostics only; exact keys above decide PASS.
        const p=attrs.indexOf('POSITION');
        const round=v=>v.map(n=>Math.round(n*1e5)/1e5);
        const ordered=candidates.map(v=>({v,key:JSON.stringify(v.map(vertex=>round(vertex[p])))})).sort((a,b)=>a.key.localeCompare(b.key))[0];
        const diagnosticKey=JSON.stringify([isLine?'INK':`${slot}:${detail?'detail':'armour'}`,attrs,matrix,ordered.key]);
        bucket.push({key,diagnosticKey,values:ordered.v.flat(2)});
      }
      if(!isLine&&part)presentParts.add(part);
    }
  });
  const rootNode=json.nodes.find(n=>n.extras?.roster_schema||n.extras?.sunhawk_schema);
  if(!rootNode)throw new Error('Missing asset schema root');
  return {buckets,presentParts:[...presentParts].sort(),rootContract:rootNode.extras};
}
function compareRecords(before,after) {
  const a=before.map(r=>r.key).sort(),b=after.map(r=>r.key).sort();
  const exact=a.length===b.length&&a.every((v,i)=>v===b[i]);
  let maximumAttributeDelta=exact?0:null,diagnosticMatchedCount=exact?a.length:0;
  if(!exact) {
    const group=rows=>{const out=new Map();for(const r of rows){if(!out.has(r.diagnosticKey))out.set(r.diagnosticKey,[]);out.get(r.diagnosticKey).push(r);}return out;};
    const ga=group(before),gb=group(after);let delta=0,matched=0;
    for(const [key,rows] of ga) {
      const other=gb.get(key);if(!other||other.length!==rows.length)continue;
      const ordered=rows.slice().sort((x,y)=>x.key.localeCompare(y.key)),next=other.slice().sort((x,y)=>x.key.localeCompare(y.key));
      for(let i=0;i<ordered.length;i++) {
        if(ordered[i].values.length!==next[i].values.length)continue;
        matched++;ordered[i].values.forEach((value,k)=>delta=Math.max(delta,Math.abs(value-next[i].values[k])));
      }
    }
    diagnosticMatchedCount=matched;maximumAttributeDelta=matched===a.length&&matched===b.length?delta:null;
  }
  return {exact,before:before.length,after:after.length,maximumAttributeDelta,diagnosticMatchedCount,
    beforeSha256:sha(a.join('\n')),afterSha256:sha(b.join('\n')),
    ...(!exact?{firstDifference:a.find((v,i)=>v!==b[i])?.slice(0,600)??'count changed'}:{})};
}
const results=[];
for(const design of designs.filter(d=>!designFilter||d===designFilter)) {
  const lods=[];
  for(let lod=0;lod<3;lod++) {
    const suffix=lod?`-lod${lod}`:'';
    const path=`src/client/render/mech/assets/${design==='sunhawk'?'sunhawk-updated':`roster/${design}`}${suffix}.glb`;
    const oldBytes=fromGit(path),newBytes=readFileSync(resolve(root,path));
    const before=glb(oldBytes),after=glb(newBytes),joints=[];
    for(const joint of [...new Set([...before.buckets.keys(),...after.buckets.keys()])].sort()) {
      const old=before.buckets.get(joint)??{triangles:[],lines:[]},next=after.buckets.get(joint)??{triangles:[],lines:[]};
      joints.push({joint,triangles:compareRecords(old.triangles,next.triangles),inkSegments:compareRecords(old.lines,next.lines)});
    }
    const rootContractEqual=JSON.stringify(before.rootContract)===JSON.stringify(after.rootContract);
    const exact=rootContractEqual&&joints.every(j=>j.triangles.exact&&j.inkSegments.exact);
    lods.push({level:lod,path,exact,rootContractEqual,parts:after.presentParts,
      hasBackpack:after.presentParts.includes('backpack'),beforeFileSha256:sha(oldBytes),afterFileSha256:sha(newBytes),joints});
    console.log(`${exact?'PASS':'FAIL'} ${design} LOD${lod}: ${joints.reduce((n,j)=>n+j.triangles.after,0)} triangles, ${joints.reduce((n,j)=>n+j.inkSegments.after,0)} ink segments`);
    if(!exact)for(const j of joints.filter(j=>!j.triangles.exact||!j.inkSegments.exact))console.log(`  ${j.joint}: triangles delta=${j.triangles.maximumAttributeDelta}, lines delta=${j.inkSegments.maximumAttributeDelta}`);
  }
  results.push({design,exact:lods.every(l=>l.exact),lods});
}
const currentPath='src/client/render/mech/assets/sunhawk-current.glb';
const currentBefore=sha(fromGit(currentPath)),currentAfter=sha(readFileSync(resolve(root,currentPath)));
const currentSunhawk={path:currentPath,byteIdentical:currentBefore===currentAfter,beforeSha256:currentBefore,afterSha256:currentAfter};
const report={schema:1,baselineCommit,method:'Exact expanded per-joint/per-paint-slot triangle and undirected ink-segment multisets, preserving multiplicity and triangle winding; POSITION, NORMAL, _OUTLINE_NORMAL, _INK_WIDTH, every other authored attribute and node transforms included. No tolerance accepted. Approximate position buckets are diagnostic only.',
  exact:results.every(r=>r.exact)&&currentSunhawk.byteIdentical,currentSunhawk,designs:results};
mkdirSync(dirname(reportPath),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(`Current Sunhawk byte-identical: ${currentSunhawk.byteIdentical}; report ${reportPath}`);
if(!report.exact)process.exitCode=1;

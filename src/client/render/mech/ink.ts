// Authored mech ink. Rigid joints are batched into two draws per mech/LOD,
// with exactly the same joint matrices as the armour (no second animation).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { MechRig } from './rig';

export interface InkLines<J extends string = string> { joint: J; positions: Float32Array; kinds: Float32Array }
export const geometryMarks = new Float32Array(6);
const live = new Set<THREE.ShaderMaterial>();
const shared = {
  uInkColor: { value: new THREE.Color(0x150f22) },
  uRes: { value: new THREE.Vector2(1280,720) },
  uStrength: { value: 1 },
};
let enabled = false;
export function configureMechInk(on: boolean, color: THREE.Color, strength: number): void {
  enabled = on;
  shared.uInkColor.value.copy(color);
  shared.uStrength.value = Math.min(1, Math.max(0, strength));
  for (const m of live) m.visible = on;
}
export function resizeMechInk(w: number, h: number): void { shared.uRes.value.set(w,h); }

/** Validate LINES as strictly as the armour: no unknown joints or NaN strokes. */
export function readInkLines<J extends string>(o: THREE.LineSegments, joints: readonly string[]): InkLines<J> {
  const { joint, ink_lines } = o.userData;
  if (!joints.includes(joint) || ink_lines !== 1) throw new Error(`Invalid ink joint ${o.name}`);
  const g=o.geometry, p=g.getAttribute('position'), kind=g.getAttribute('_line_kind');
  const count=g.index?.count ?? p?.count ?? 0;
  if (!p || p.itemSize!==3 || count===0 || count%2 || !kind || kind.itemSize!==1 || kind.count!==p.count) throw new Error(`Invalid ink segments ${o.name}`);
  const positions=new Float32Array(count*3), kinds=new Float32Array(count/2);
  const v=new THREE.Vector3(), previous=new THREE.Vector3();
  for(let i=0;i<count;i++) {
    const k=g.index?.getX(i) ?? i;
    if (!Number.isInteger(k) || k<0 || k>=p.count) throw new Error(`Invalid ink index ${o.name}`);
    v.fromBufferAttribute(p,k).applyMatrix4(o.matrixWorld);
    if (![v.x,v.y,v.z].every(Number.isFinite)) throw new Error(`Nonfinite ink ${o.name}`);
    v.toArray(positions,i*3);
    if (i%2 && v.distanceToSquared(previous)<1e-12) throw new Error(`Degenerate ink ${o.name}`);
    const type=kind.getX(k);
    if (![0,1,2].includes(type) || (i%2 && kinds[(i-1)/2]!==type)) throw new Error(`Invalid ink kind ${o.name}`);
    if (!(i%2)) { kinds[i/2]=type; previous.copy(v); }
  }
  return { joint, positions, kinds };
}

export function validateOutline(g: THREE.BufferGeometry): void {
  const count=g.getAttribute('position').count;
  const normal=g.getAttribute('_outline_normal'), width=g.getAttribute('_ink_width');
  if (!normal || !width || normal.itemSize!==3 || width.itemSize!==1 || normal.count!==count || width.count!==count) throw new Error('Missing outline attributes');
  for(let i=0;i<count;i++) {
    const n=Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i)),w=width.getX(i);
    if (!Number.isFinite(n) || Math.abs(n-1)>.002 || !Number.isFinite(w) || w<0 || w>1) throw new Error('Invalid outline attributes');
  }
}

const BONES = 24;
const hullVertex = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  uniform mat4 uJoints[24];
  uniform vec2 uRes;
  uniform float uStrength;
  attribute float aJoint;
  attribute float aCharMark;
  attribute vec3 _outline_normal;
  attribute float _ink_width;
  varying float vMark, vWidth;
  void main() {
    mat4 joint=uJoints[int(aJoint)];
    vec4 mvPosition=modelViewMatrix*joint*vec4(position,1.0);
    vec3 n=normalize(normalMatrix*mat3(joint)*_outline_normal);
    vec4 clip=projectionMatrix*mvPosition;
    vec4 tip=projectionMatrix*vec4(mvPosition.xyz+n,1.0);
    vec2 dir=(tip.xy/max(0.001,tip.w)-clip.xy/max(0.001,clip.w))*uRes;
    dir/=max(length(dir),0.0001);
    float width=clamp(uRes.y/1080.0,0.55,3.0)*mix(3.4,1.3,smoothstep(8.0,70.0,-mvPosition.z));
    clip.xy+=dir*width*0.7*_ink_width*uStrength*2.0/uRes*clip.w;
    gl_Position=clip;
    vMark=aCharMark;vWidth=_ink_width;
    #include <fog_vertex>
  }`;
const hullFragment = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uInkColor;
  uniform float uMask;
  varying float vMark,vWidth;
  void main() {
    if(vWidth<0.001)discard;
    gl_FragColor=vec4(uInkColor,vMark);
    #include <colorspace_fragment>
    #include <fog_fragment>
    if(uMask>0.5)gl_FragColor=vec4(1.0);
  }`;

/** The only r186 LineMaterial patches; fail loudly if three changes its source. */
export function patchInkLineShader(shader: {vertexShader: string; fragmentShader: string}, count = BONES): void {
  const replace=(s:string, from:string,to:string)=>{
    if(!s.includes(from)) throw new Error(`LineMaterial contract changed: ${from}`);
    return s.replace(from,to);
  };
  shader.vertexShader=replace(shader.vertexShader,'#include <common>',`#include <common>
    uniform mat4 uJoints[${count}];
    uniform float uDistance, uStrength;
    attribute float instanceJoint, instanceKind;
    varying float vInkWidth;`);
  shader.vertexShader=replace(shader.vertexShader,'vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );','vec4 start = modelViewMatrix * uJoints[int(instanceJoint)] * vec4(instanceStart,1.0);');
  shader.vertexShader=replace(shader.vertexShader,'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );',`vec4 end = modelViewMatrix * uJoints[int(instanceJoint)] * vec4(instanceEnd,1.0);
    float nearInk=1.0-smoothstep(22.0,60.0,uDistance);
    float weight=instanceKind>0.5 && instanceKind<1.5 ? nearInk : mix(0.4,1.0,nearInk);
    vInkWidth=weight*uStrength;
    // Very small camera bias, unlike depthTest=false: rear strokes stay hidden.
    start.z+=0.0015;end.z+=0.0015;`);
  shader.vertexShader=replace(shader.vertexShader,'offset *= linewidth;', 'offset *= linewidth * vInkWidth;');
  shader.fragmentShader=replace(shader.fragmentShader,'uniform vec3 diffuse;',`uniform vec3 diffuse;
    uniform vec3 uInkColor;
    uniform float uMark,uMask;
    varying float vInkWidth;`);
  shader.fragmentShader=replace(shader.fragmentShader,'gl_FragColor = vec4( diffuseColor.rgb, alpha );',`if(vInkWidth<0.08)discard;
    gl_FragColor=vec4(uInkColor,uMark);`);
  shader.fragmentShader=replace(shader.fragmentShader,'#include <premultiplied_alpha_fragment>',`#include <premultiplied_alpha_fragment>
    if(uMask>0.5)gl_FragColor=vec4(1.0);`);
}

/** One shared pair of materials per mech, one pair of meshes per LOD. */
export class MechInkBuilder {
  private matrices=Array.from({length:BONES},()=>new THREE.Matrix4());
  private inverse=new THREE.Matrix4();
  private center=new THREE.Vector3();
  private names: string[];
  private uniforms: Record<string,THREE.IUniform>;
  private hull: THREE.ShaderMaterial;
  private line: LineMaterial;
  constructor(private rig: MechRig, private joints: Record<string,THREE.Object3D>) {
    this.names=Object.keys(joints);
    if(this.names.length>BONES)throw new Error('Too many ink joints');
    this.uniforms={...shared,uJoints:{value:this.matrices},uMark:{value:.5},uMask:{value:0},uDistance:{value:0}};
    this.hull=new THREE.ShaderMaterial({uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),...this.uniforms},vertexShader:hullVertex,fragmentShader:hullFragment,side:THREE.BackSide,fog:true});
    this.line=new LineMaterial({worldUnits:false,linewidth:1,resolution:shared.uRes.value.clone(),color:0xffffff,fog:true,transparent:false,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-.5,polygonOffsetUnits:-.5});
    this.line.onBeforeCompile=shader=>{Object.assign(shader.uniforms,this.uniforms);patchInkLineShader(shader);};
    this.line.customProgramCacheKey=()=> 'mech-ink-r186-v1';
    for(const m of [this.hull,this.line]) {
      m.visible=enabled;m.allowOverride=false;m.toneMapped=false;
      m.userData.mechInkMark=this.uniforms.uMark;
      live.add(m);m.addEventListener('dispose',()=>live.delete(m));
    }
    rig.root.userData.geometryInk=true;
  }
  private update(camera: THREE.Camera, scene: THREE.Scene): void {
    this.inverse.copy(this.rig.root.matrixWorld).invert();
    this.names.forEach((n,i)=>this.matrices[i].multiplyMatrices(this.inverse,this.joints[n].matrixWorld));
    this.center.set(0,this.rig.dims.height*.5,0).applyMatrix4(this.rig.root.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const z=Math.max(0,-this.center.z);
    this.uniforms.uDistance.value=z;
    this.uniforms.uMask.value=scene.overrideMaterial ? 1 : 0;
    this.line.linewidth=THREE.MathUtils.clamp(shared.uRes.value.y/1080,.55,3)*THREE.MathUtils.lerp(1.6,1,THREE.MathUtils.smoothstep(z,8,40))*.72;
    this.line.resolution.copy(shared.uRes.value);
  }
  addLevel(parts: readonly {joint:string;slot:string;geometry:THREE.BufferGeometry;detail?:boolean}[], lines: readonly InkLines[], groups: THREE.Object3D[]): void {
    const geometries:THREE.BufferGeometry[]=[];
    for(const p of parts) {
      if(p.slot==='G'||p.detail)continue;
      const g=new THREE.BufferGeometry();
      for(const name of ['position','_outline_normal','_ink_width'])g.setAttribute(name,p.geometry.getAttribute(name).clone());
      if(p.geometry.index)g.setIndex(p.geometry.index.clone());
      g.setAttribute('aJoint',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(this.names.indexOf(p.joint)),1));
      geometries.push(g);
    }
    const group=new THREE.Group();group.name='Mech geometry ink';
    const h=new THREE.Mesh(mergeGeometries(geometries)!,this.hull);
    h.name='Batched ink hull';h.userData.ownMaterial=true;h.frustumCulled=true;h.castShadow=false;
    // Conservative root-space bounds enclose every rigid animation, including
    // outstretched arms and fins. Joint-local transport bounds cannot cull these.
    h.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,this.rig.dims.height*.5,0),this.rig.dims.height);
    h.onBeforeRender=(_r,s,c)=>this.update(c,s);
    group.add(h);geometries.forEach(g=>g.dispose());
    if(lines.length) {
      const positions:number[]=[],joints:number[]=[],kinds:number[]=[];
      for(const l of lines) {positions.push(...l.positions);joints.push(...Array(l.kinds.length).fill(this.names.indexOf(l.joint)));kinds.push(...l.kinds);}
      const g=new LineSegmentsGeometry().setPositions(positions);
      g.setAttribute('instanceJoint',new THREE.InstancedBufferAttribute(new Float32Array(joints),1));
      g.setAttribute('instanceKind',new THREE.InstancedBufferAttribute(new Float32Array(kinds),1));
      const l=new LineSegments2(g,this.line);l.name='Batched authored ink';l.frustumCulled=true;g.boundingSphere=h.geometry.boundingSphere.clone();l.castShadow=false;l.userData.ownMaterial=true;
      const object: THREE.Object3D=l;
      object.onBeforeRender=(_r,s,c)=>this.update(c,s);
      group.add(l);
    }
    this.rig.root.add(group);groups.push(group);
  }
}

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { MechInkBuilder, configureMechInk, resizeMechInk, readInkLines, patchInkLineShader, geometryMarks } from '../src/client/render/mech/ink';
import { readRosterAsset } from '../src/client/render/mech/rosterAsset';
import { MechRig } from '../src/client/render/mech/rig';
import { POSES } from '../src/client/render/mech/poses';
import { markCharacter } from '../src/client/render/look';
import { markTraveller, TRAVELLER_LAYER } from '../src/client/render/renderer';
import { setMechDetail } from '../src/client/render/mech/detail';

async function load(level=0) {
  const data=await readFile(new URL(`../src/client/render/mech/assets/roster/daystar${level?`-lod${level}`:''}.glb`,import.meta.url));
  return readRosterAsset((await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'')).scene,'daystar');
}

describe('batched authored mech ink',()=>{
  it('follows the same moving joints at every LOD with only two ink draws, and preserves the traveller mask/mark',async()=>{
    const assets=await Promise.all([0,1,2].map(load));
    const rig=new MechRig(assets[0].dims);
    const joints={...rig.joints,skirtL:rig.skirts.l,skirtR:rig.skirts.r,skirtBack:rig.skirts.back};
    const ink=new MechInkBuilder(rig,joints);
    assets.forEach(a=>{const groups:THREE.Object3D[]=[];ink.addLevel(a.parts,a.lines,groups);rig.detailLevels.push(groups);});
    markCharacter(rig.root,4);markTraveller(rig.root);
    expect(geometryMarks[4]).toBe(1);
    configureMechInk(true,new THREE.Color(0x150f22),1);resizeMechInk(1280,960);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();scene.add(rig.root);
    rig.root.position.set(14,3,-20);rig.root.rotation.y=.5;
    camera.position.set(14,10,10);camera.lookAt(14,7,-20);camera.updateMatrixWorld(true);
    for(let level=0;level<3;level++) {
      setMechDetail(rig,level);
      expect(rig.detailLevels.map(gs=>gs.every(g=>g.visible))).toEqual([0,1,2].map(i=>i===level));
      const children=rig.detailLevels[level][0].children as THREE.Mesh[];
      expect(children.length).toBe(level===2?1:2);
      const hull=children[0],mat=hull.material as THREE.ShaderMaterial;
      for(const pose of [POSES.standby,POSES.boost,POSES.guard,POSES.victory]) {
        rig.apply(pose);scene.updateMatrixWorld(true);
        hull.onBeforeRender({} as THREE.WebGLRenderer,scene,camera,hull.geometry,mat,null as never);
        // The shaders read each joint's matrix from the joint texture (see ink.ts).
        expect(mat.uniforms.uJointTex.value).toBeInstanceOf(THREE.DataTexture);
        const ids=hull.geometry.getAttribute('aJoint'),p=hull.geometry.getAttribute('position');
        for(let i=0;i<p.count;i+=137) {
          const local=new THREE.Vector3().fromBufferAttribute(p,i);
          const actual=local.clone().applyMatrix4(ink.jointMatrix(ids.getX(i))).applyMatrix4(rig.root.matrixWorld);
          const joint=Object.values(joints)[ids.getX(i)];
          expect(actual.distanceTo(joint.localToWorld(local))).toBeLessThan(1e-5);
        }
      }
      expect(mat.allowOverride).toBe(false);
      scene.overrideMaterial=new THREE.MeshBasicMaterial();
      hull.onBeforeRender({} as THREE.WebGLRenderer,scene,camera,hull.geometry,mat,null as never);
      expect(mat.uniforms.uMask.value).toBe(1);scene.overrideMaterial.dispose();scene.overrideMaterial=null;
      for(const child of children) {
        expect(child.layers.mask & (1<<TRAVELLER_LAYER)).not.toBe(0);
        expect(child.castShadow).toBe(false);
        expect((child.material as THREE.Material).transparent).toBe(false);
        expect((child.material as THREE.Material).userData.mechInkMark.value).toBeCloseTo(.36);
      }
      expect(hull.geometry.getAttribute('aCharMark').getX(0)).toBeCloseTo(.36);
      if(level<2)expect(children[1]).toBeInstanceOf(LineSegments2);
    }
    configureMechInk(false,new THREE.Color(),1);
    rig.root.traverse(o=>{if(o instanceof THREE.Mesh){expect((o.material as THREE.Material).visible).toBe(false);o.geometry.dispose();(o.material as THREE.Material).dispose();}});
    markCharacter(new THREE.Group(),4);expect(geometryMarks[4]).toBe(0);
  });

  it('patches the installed r186 fat-line shader and keeps an opaque mark after its colour/fog output',()=>{
    const shader={vertexShader:THREE.ShaderLib.line.vertexShader,fragmentShader:THREE.ShaderLib.line.fragmentShader};
    patchInkLineShader(shader);
    expect(shader.vertexShader).toContain('inkJoint(instanceJoint)');
    expect(shader.vertexShader).toContain('texelFetch(uJointTex');
    expect(shader.vertexShader).not.toContain('uJoints');
    expect(shader.fragmentShader).toContain('gl_FragColor=vec4(uInkColor,uMark)');
    expect(shader.fragmentShader).toContain('if(uMask>0.5)gl_FragColor=vec4(1.0)');
    expect(()=>patchInkLineShader({vertexShader:'changed',fragmentShader:''})).toThrow('contract changed');
  });

  it('rejects malformed joint lines, categories and positions at load time',()=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0],3));g.setAttribute('_line_kind',new THREE.Float32BufferAttribute([0,0],1));
    const o=new THREE.LineSegments(g);o.userData={joint:'head',ink_lines:1};
    expect(readInkLines(o,['head']).positions).toHaveLength(6);
    expect(()=>readInkLines(o,['chest'])).toThrow('joint');
    g.getAttribute('_line_kind').setX(1,1);expect(()=>readInkLines(o,['head'])).toThrow('kind');
    g.getAttribute('_line_kind').setX(1,0);g.getAttribute('position').setX(1,NaN);expect(()=>readInkLines(o,['head'])).toThrow('Nonfinite');
    g.getAttribute('position').setX(1,0);expect(()=>readInkLines(o,['head'])).toThrow('Degenerate');
    g.setIndex([0,5]);expect(()=>readInkLines(o,['head'])).toThrow('index');
    g.dispose();(o.material as THREE.Material).dispose();
  });
});

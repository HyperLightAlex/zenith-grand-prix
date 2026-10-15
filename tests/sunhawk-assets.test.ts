import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readSunhawkAsset } from '../src/client/render/mech/sunhawkAsset';
import { Kit } from '../src/client/render/mech/kit';
import { LIVERIES } from '../src/client/render/palette';
import { MechRig, copyPose, makePose } from '../src/client/render/mech/rig';
import { POSES } from '../src/client/render/mech/poses';
import { MechAnimator } from '../src/client/render/mech/animate';
import { Arena, FW0 } from './helpers';
import { fitSunhawkPose } from '../src/client/render/mech/sunhawkMotion';
import { detailLevelForPixels, setMechDetail } from '../src/client/render/mech/detail';

for (const variant of ['current', 'updated'] as const) {
  describe(`${variant} Blender Sunhawk`, () => {
    const load = async () => {
      const bytes = await readFile(new URL(`../src/client/render/mech/assets/sunhawk-${variant}.glb`, import.meta.url));
      return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    };

    it('loads the real export with finite, normalized authored normals and a complete rig contract', async () => {
      const { scene } = await load();
      const asset = readSunhawkAsset(scene, variant);
      expect(asset.parts.length).toBeGreaterThan(20);
      let triangles = 0;
      for (const { geometry } of asset.parts) {
        const pos = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        expect(normal.count).toBe(pos.count);
        let maxNormalError = 0;
        for (let i = 0; i < pos.count; i++) {
          if (![pos.getX(i), pos.getY(i), pos.getZ(i)].every(Number.isFinite)) throw new Error('Non-finite export position');
          maxNormalError = Math.max(maxNormalError, Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1));
        }
        expect(maxNormalError).toBeLessThan(.001);
        triangles += (geometry.index?.count ?? pos.count) / 3;
      }
      // Catch accidentally exporting the outline shells, stage or both variants.
      expect(triangles).toBeGreaterThan(18_000);
      expect(triangles).toBeLessThan(30_000);
      // Fixed towers must not follow the upper arms into the knees in a tuck.
      const bounds = (joint: string) => {
        const box = new THREE.Box3();
        for (const part of asset.parts.filter((p) => p.joint === joint)) {
          part.geometry.computeBoundingBox();
          box.union(part.geometry.boundingBox!);
        }
        return box;
      };
      expect(bounds('chest').max.y).toBeGreaterThan(2.7);
      expect(bounds('shL').max.y).toBeLessThan(.6);
      expect(bounds('shR').max.y).toBeLessThan(.6);
    });

    it('preserves authored normals when merged into the game material without mutating cached geometry', async () => {
      const asset = readSunhawkAsset((await load()).scene, variant);
      const part = asset.parts.find((p) => p.joint === 'chest' && p.slot === 'P')!;
      const expected = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
      const before = Array.from(part.geometry.getAttribute('normal').array);
      const { armor } = new Kit(LIVERIES[0]).geometry('P', part.geometry, -1).box('T', .1, .1, .1).build();
      const normals = armor!.geometry.getAttribute('normal');
      expect(Array.from(normals.array).slice(0, expected.getAttribute('normal').array.length)).toEqual(Array.from(expected.getAttribute('normal').array));
      expect(Array.from(part.geometry.getAttribute('normal').array)).toEqual(before);
      expect(part.geometry.hasAttribute('aPanel')).toBe(false);
      for (const name of ['color', 'aShade', 'aMat', 'aPanel']) {
        expect(armor!.geometry.getAttribute(name).count).toBe(normals.count);
      }
      expect(armor!.geometry.getAttribute('aPanel').getX(0)).toBe(-1);
    });

    it('keeps both skates on their targets through the racing and combat poses', async () => {
      const { dims } = readSunhawkAsset((await load()).scene, variant);
      const rig = new MechRig(dims);
      for (const pose of [POSES.standby, POSES.tuck, POSES.boost, POSES.carveRight, POSES.guard, POSES.slashHit, POSES.lanceHit]) {
        rig.apply(pose);
        rig.root.updateMatrixWorld(true);
        for (const [joint, foot] of [[rig.joints.ankleL, pose.footL], [rig.joints.ankleR, pose.footR]] as const) {
          const actual = joint.getWorldPosition(new THREE.Vector3());
          const target = new THREE.Vector3(foot[0], dims.ankleY + foot[1], foot[2]);
          expect(actual.distanceTo(target)).toBeLessThan(.035);
        }
        expect(rig.skirts.l.rotation.x).toBeLessThanOrEqual(0);
        expect(rig.skirts.r.rotation.x).toBeLessThanOrEqual(0);
      }
    });

    it('rejects an export missing a moving part instead of silently assembling a broken mech', async () => {
      const { scene } = await load();
      const missing: THREE.Object3D[] = [];
      scene.traverse((o) => { if (o.userData.joint === 'ankleL') missing.push(o); });
      missing.forEach((o) => o.removeFromParent());
      expect(() => readSunhawkAsset(scene, variant)).toThrow('Incomplete');
    });

    it('has forward back plates and rear-curling fingers on both inner-thumb hands', async () => {
      const { parts } = readSunhawkAsset((await load()).scene, variant);
      for (const joint of ['wrL','wrR']) {
        const plate = parts.find((p) => p.joint === joint && p.slot === 'P')!.geometry;
        plate.computeBoundingBox();
        expect(plate.boundingBox!.min.z).toBeGreaterThan(.10);
        const hand = parts.find((p) => p.joint === joint && p.slot === 'F')!.geometry;
        const pos = hand.getAttribute('position');
        const tips = Array.from({ length: pos.count }, (_, i) => i).filter((i) => pos.getY(i) < -.78);
        expect(tips.length).toBeGreaterThan(0);
        expect(Math.max(...tips.map((i) => pos.getZ(i)))).toBeLessThan(-.15);
      }
    });

    it('retains the animated pose when changing the rig during a race', async () => {
      const { dims } = readSunhawkAsset((await load()).scene, variant);
      const old = new MechRig(dims);
      const animator = new MechAnimator(old);
      const mech = new Arena(1).put(FW0, 0, 0);
      mech.boosting = true;
      for (let i = 0; i < 12; i++) animator.update(1 / 60, mech, .5);
      const replacement = new MechRig(dims);
      animator.replaceRig(replacement);
      for (const name of Object.keys(old.joints) as Array<keyof typeof old.joints>) {
        expect(replacement.joints[name].quaternion.toArray()).toEqual(old.joints[name].quaternion.toArray());
        expect(replacement.joints[name].position.toArray()).toEqual(old.joints[name].position.toArray());
      }
      expect(replacement.skirts.l.rotation.x).toBe(old.skirts.l.rotation.x);
      expect(replacement.skirts.r.rotation.x).toBe(old.skirts.r.rotation.x);
    });
  });
}

describe('updated Sunhawk production preparation', () => {
  const load = async (level = 0) => {
    const bytes = await readFile(new URL(`../src/client/render/mech/assets/sunhawk-updated${level ? `-lod${level}` : ''}.glb`, import.meta.url));
    return readSunhawkAsset((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene, 'updated');
  };

  it('reduces vertex storage without changing triangles, normal seams or the cached asset', async () => {
    const asset = await load();
    const part = asset.parts.find((p) => p.joint === 'chest' && p.slot === 'P')!;
    const original = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const built = new Kit(LIVERIES[0], .018, 1.15, true).geometry('P', part.geometry, -1).build();
    const geo = built.armor!.geometry;
    expect(geo.index!.count).toBe(original.getAttribute('position').count);
    expect(geo.getAttribute('position').count).toBeLessThan(geo.index!.count * .8);
    const expanded = geo.toNonIndexed();
    for (const attr of ['position','normal']) {
      const before = original.getAttribute(attr).array;
      const after = expanded.getAttribute(attr).array;
      let error = 0;
      for (let i=0;i<before.length;i++) error = Math.max(error,Math.abs(before[i]-after[i]));
      expect(error).toBeLessThan(.0001);
    }
    const outline = built.group.children[1] as THREE.Mesh;
    expect(outline.geometry.index!.count).toBe(geo.index!.count);
    expect(part.geometry.hasAttribute('color')).toBe(false);
  });

  it('keeps road targets and skate orientation under bank without changing shared poses', async () => {
    const { dims } = await load();
    const rig = new MechRig(dims);
    rig.fitPose = fitSunhawkPose;
    rig.keepFeetOnRoad = true;
    for (const pose of [POSES.tuck, POSES.boost, POSES.carveRight, POSES.guard]) {
      const before = JSON.stringify(pose);
      for (const bank of [-.45, 0, .45]) {
        rig.body.rotation.set(.06, .03, bank);
        rig.apply(pose); rig.root.updateMatrixWorld(true);
        for (const [joint, foot] of [[rig.joints.ankleL,pose.footL],[rig.joints.ankleR,pose.footR]] as const) {
          expect(joint.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(foot[0],dims.ankleY+foot[1],foot[2]))).toBeLessThan(.035);
          const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(foot[3],foot[4],0,'YXZ'));
          expect(joint.getWorldQuaternion(new THREE.Quaternion()).angleTo(target)).toBeLessThan(.001);
        }
      }
      expect(JSON.stringify(pose)).toBe(before);
    }
  });

  it('retargets blended shoulder and guard motion continuously', () => {
    let previous: number[] | undefined;
    for (let i = 0; i <= 400; i++) {
      const pose = copyPose(makePose(), POSES.guard);
      pose.shL[0] = -1.5 + i / 100;
      fitSunhawkPose(pose);
      const now = [...pose.shL,...pose.elL];
      if (previous) expect(Math.max(...now.map((n,j) => Math.abs(n-previous![j])))).toBeLessThan(.025);
      previous = now;
    }
  });

  it('uses valid UV details up close and smaller, complete exports at distance', async () => {
    const levels = await Promise.all([0,1,2].map(load));
    const counts = levels.map((a) => a.parts.reduce((n,p) => n + (p.geometry.index?.count ?? p.geometry.getAttribute('position').count) / 3, 0));
    expect(counts[1]).toBeLessThan(counts[0] * .60);
    expect(counts[2]).toBeLessThan(counts[0] * .32);
    expect(levels[0].parts.filter((p) => p.detail)).toHaveLength(7);
    for (const [level,asset] of levels.entries()) {
      expect(asset.dims).toEqual(levels[0].dims);
      for (const p of asset.parts) {
        const pos = p.geometry.getAttribute('position');
        const normal = p.geometry.getAttribute('normal');
        for (let i = 0; i < pos.count; i++) {
          if (![pos.getX(i),pos.getY(i),pos.getZ(i)].every(Number.isFinite)) throw new Error('Nonfinite LOD');
          if (Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)>.001) throw new Error('Invalid LOD normal');
        }
        if (p.detail) {
          expect(level).toBe(0);
          const uv = p.geometry.getAttribute('uv');
          expect(uv.count).toBe(pos.count);
          expect(Math.min(...uv.array)).toBeGreaterThanOrEqual(0);
          expect(Math.max(...uv.array)).toBeLessThanOrEqual(1);
        }
        p.geometry.computeBoundingBox();
        const original = levels[0].parts.find((h) => h.joint === p.joint && h.slot === p.slot && h.detail === p.detail)!;
        original.geometry.computeBoundingBox();
        expect(p.geometry.boundingBox!.min.distanceTo(original.geometry.boundingBox!.min)).toBeLessThan(.12);
        expect(p.geometry.boundingBox!.max.distanceTo(original.geometry.boundingBox!.max)).toBeLessThan(.12);
      }
    }
  });

  it('switches exactly one detail level and resists threshold flicker', async () => {
    const rig = new MechRig((await load()).dims);
    for (let i=0;i<3;i++) rig.detailLevels.push([new THREE.Group(),new THREE.Group()]);
    for (const level of [0,1,2,0,2,1]) {
      setMechDetail(rig,level);
      expect(rig.detailLevels.map((gs) => gs.every((g) => g.visible))).toEqual([0,1,2].map((i) => i===level));
    }
    expect(detailLevelForPixels(200,0)).toBe(0);
    expect(detailLevelForPixels(200,1)).toBe(1);
    expect(detailLevelForPixels(75,1)).toBe(1);
    expect(detailLevelForPixels(75,2)).toBe(2);
    expect(detailLevelForPixels(400,2)).toBe(0);
    expect(detailLevelForPixels(40,0)).toBe(2);
  });
});

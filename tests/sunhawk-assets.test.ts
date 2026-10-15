import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readSunhawkAsset } from '../src/client/render/mech/sunhawkAsset';
import { Kit } from '../src/client/render/mech/kit';
import { LIVERIES } from '../src/client/render/palette';
import { MechRig } from '../src/client/render/mech/rig';
import { POSES } from '../src/client/render/mech/poses';
import { MechAnimator } from '../src/client/render/mech/animate';
import { Arena, FW0 } from './helpers';

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

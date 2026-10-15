import * as THREE from 'three';
import { decal } from './decals';
import { Kit } from './kit';
import { numberDecal, type FrameCtx } from './parts';
import { sunhawkAsset, type AssetJoint } from './sunhawkAsset';
import { getSunhawkPanels, type SunhawkAssetVariant } from './sunhawkSelection';
import { fitSunhawkPose } from './sunhawkMotion';
import { sunhawkDetailMaterial } from './sunhawkDetails';
import { setMechDetail } from './detail';

/** Art-authored rigid parts on the same pose/IK system as every other mech. */
export function buildImportedSunhawk(c: FrameCtx, number: string, variant: SunhawkAssetVariant): void {
  const { rig, livery } = c;
  const u = variant === 'updated';
  const paint = u ? { ...livery, primary: 0xeaf0f9, shades: { ...livery.shades, primary: 0x9ba8c9, trim: 0xc88024, frame: 0x1c263d } } : livery;
  const J = rig.joints;
  if (variant === 'updated') {
    rig.fitPose = fitSunhawkPose;
    rig.keepFeetOnRoad = true;
  }
  const joints = { ...J, skirtL: rig.skirts.l, skirtR: rig.skirts.r, skirtBack: rig.skirts.back };
  rig.skirts.l.position.set(.65,.11,.36);
  rig.skirts.r.position.set(-.65,.11,.36);
  rig.skirts.back.position.set(0,.15,-.34);
  for (const s of [1,-1]) {
    // Preserve the artwork's gentle outward arm rake and swept fin attachment.
    (s === 1 ? J.elL : J.elR).position.x = s*.13;
    (s === 1 ? J.wrL : J.wrR).position.x = s*.13;
    (s === 1 ? J.wingL : J.wingR).position.set(s*.62,.99,-.65);
  }
  for (let level = 0; level < (u ? 3 : 1); level++) {
    const groups: THREE.Object3D[] = [];
    const kits = new Map<AssetJoint, Kit>();
    for (const part of sunhawkAsset(variant, level).parts) {
      if (part.detail) {
        const mesh = new THREE.Mesh(part.geometry.clone(), sunhawkDetailMaterial());
        mesh.name = `Sunhawk details / ${part.joint}`;
        mesh.renderOrder = 2;
        joints[part.joint].add(mesh);
        groups.push(mesh);
        continue;
      }
      let k = kits.get(part.joint);
      // Fine bevels need thin plain-look ink; indexed vertices retain authored seams.
      if (!k) kits.set(part.joint, k = new Kit(paint, .018, u ? 1.15 : 1.7, u));
      k.geometry(part.slot, part.geometry, getSunhawkPanels() ? undefined : -1);
    }
    for (const [joint,k] of kits) {
      const built = k.build(/^(el|wr|hip[LR]|knee|ankle)/.test(joint));
      joints[joint].add(built.group);
      groups.push(built.group);
      if (built.glow) rig.glowMeshes.push(built.glow);
    }
    rig.detailLevels.push(groups);
  }
  setMechDetail(rig, 0);
  for (const s of [1,-1]) {
    const towerX = s*(u ? 1.63 : 1.83);
    decal(J.chest,livery,s === -1 ? 'emblem' : 'warning',[towerX,1.79,.39],[-.08,0,0],.29);
    c.flame(J.chest,[s*.30,.21,-1.06],[-.38,0,0],u ? .22 : .20,3.4,'main');
    c.flame(s === 1 ? J.kneeL : J.kneeR,[0,-1.25,u ? -.77 : -.57],[-.38,0,0],u ? .18 : .13,1.6,'leg');
    (s === 1 ? rig.handL : rig.handR).position.set(0,-.3,.2);
  }
  rig.heels.forEach((heel) => heel.position.set(0,-rig.dims.ankleY+.12,-.56));
  rig.muzzle.position.set(-.39,u ? -2.90 : -3.0,.14);
  J.elR.add(rig.muzzle);
  decal(J.chest,livery,'roundel',[0,.79,-.955],[0,Math.PI,0],.57);
  const num = numberDecal(number,livery);
  num.scale.setScalar(.48); num.position.set(0,.79,-.96); num.rotation.y=Math.PI;
  num.renderOrder = 3; // Draw over the transparent roundel (order 2).
  J.chest.add(num);
  if (u) for (const f of rig.flames) {
    // The paired backpack nozzles are close together. Keep their end-on flares
    // inside the back silhouette so a boost does not hide the armor and fins.
    if (f.burner) (f.burner.material as THREE.ShaderMaterial).uniforms.uSize.value = f.bank === 'main' ? .38 : .55;
  }
  rig.root.userData.sunhawkModel=variant;
}

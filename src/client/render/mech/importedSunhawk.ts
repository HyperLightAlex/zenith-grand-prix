import { MechInkBuilder } from './ink';
import * as THREE from 'three';
import { decal } from './decals';
import { Kit } from './kit';
import { numberDecal, type FrameCtx } from './parts';
import type { MechRig } from './rig';
import { sunhawkAsset, type AssetJoint, type SunhawkAsset } from './sunhawkAsset';
import { getSunhawkPanels, type SunhawkAssetVariant } from './sunhawkSelection';
import { attachSunhawkTowers, fitSunhawkPose } from './sunhawkMotion';
import { sunhawkDetailMaterial } from './sunhawkDetails';
import { setMechDetail } from './detail';
import { addArmour, finishRoster, nativeRosterFittings, thrusterEffectSize } from './importedRoster';

/** Art-authored rigid parts on the same pose/IK system as every other mech. */
export function buildImportedSunhawk(c: FrameCtx, number: string, variant: SunhawkAssetVariant): void {
  const { rig, livery } = c;
  const u = variant === 'updated';
  const paint = u ? { ...livery, primary: 0xeaf0f9, shades: { ...livery.shades, primary: 0x9ba8c9, trim: 0xc88024, frame: 0x1c263d } } : livery;
  const asset = sunhawkAsset(variant);
  const towers = sunhawkJoints(rig, u, asset);
  const joints = { ...rig.joints, ...towers, skirtL: rig.skirts.l, skirtR: rig.skirts.r, skirtBack: rig.skirts.back, skirtFront: rig.skirts.front };
  if (asset.sourceTextureSchema === 1) {
    sunhawkFittings(c, number, u, towers, asset);
    addArmour(rig, joints, [0,1,2].map(level => sunhawkAsset(variant, level)), () => livery, asset.ink);
    finishRoster(rig);
    rig.root.userData.sunhawkModel = variant;
    return;
  }
  const ink=u && sunhawkAsset(variant).ink ? new MechInkBuilder(rig,joints) : null;
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
    ink?.addLevel(sunhawkAsset(variant,level).parts,sunhawkAsset(variant,level).lines,groups);
    rig.detailLevels.push(groups);
  }
  setMechDetail(rig, 0);
  sunhawkFittings(c, number, u, towers);
  if (u) for (const f of rig.flames) {
    // Head-on: a visible circular jet. Off-axis: the painted exhaust. Reducing
    // only the circle made the unchanged flame dominate the chase view.
    if (f.burner) (f.burner.material as THREE.ShaderMaterial).uniforms.uSize.value = .72;
    if (f.drawn) (f.drawn.material as THREE.ShaderMaterial).uniforms.uEndOnFade.value = 1;
  }
  rig.root.userData.sunhawkModel=variant;
}

/**
 * The Sunhawk's skeleton, as its artwork has it: the shoulder towers, the
 * hip skirts' hinges, the arms' outward rake and the fins' swept roots (and,
 * updated, its own pose fitting and skates kept on the road).
 */
export function sunhawkJoints(rig: MechRig, u: boolean, asset?: SunhawkAsset): { towerL: THREE.Group; towerR: THREE.Group } {
  const J = rig.joints;
  if (u) {
    rig.fitPose = fitSunhawkPose;
    rig.keepFeetOnRoad = true;
  }
  const towers = attachSunhawkTowers(rig);
  if (asset?.sourceTextureSchema === 1) return towers;
  rig.skirts.l.position.set(.65,.11,.36);
  rig.skirts.r.position.set(-.65,.11,.36);
  rig.skirts.back.position.set(0,.15,-.34);
  for (const s of [1,-1]) {
    // Preserve the artwork's gentle outward arm rake and swept fin attachment.
    (s === 1 ? J.elL : J.elR).position.x = s*.13;
    (s === 1 ? J.wrL : J.wrR).position.x = s*.13;
    (s === 1 ? J.wingL : J.wingR).position.set(s*.62,.99,-.65);
  }
  return towers;
}

/** The Sunhawk's fittings: its markings and number, its thrusters, the hands, heels and muzzle. */
export function sunhawkFittings(c: FrameCtx, number: string, u: boolean, towers: { towerL: THREE.Group; towerR: THREE.Group }, asset?: SunhawkAsset): void {
  const { rig, livery } = c;
  const J = rig.joints;
  if (asset?.sourceTextureSchema === 1) {
    const joints = { ...J, ...towers, skirtL: rig.skirts.l, skirtR: rig.skirts.r, skirtBack: rig.skirts.back, skirtFront: rig.skirts.front };
    for (const t of asset.mainThrusters ?? []) {
      const size=thrusterEffectSize(t);c.flame(joints[t.joint],t.outlet,t.rotation,size.width,size.length,'main');
    }
    for (const t of asset.calfThrusters ?? []) {
      const size=thrusterEffectSize(t);c.flame(joints[t.joint],t.outlet,t.rotation,size.width,size.length,'leg');
    }
    const num = numberDecal(number, livery);
    J.chest.add(num);
    nativeRosterFittings(rig, asset, towers);
    return;
  }
  for (const s of [1,-1]) {
    const towerX = s*(u ? 1.63 : 1.83);
    decal(s === 1 ? towers.towerL : towers.towerR,livery,s === -1 ? 'emblem' : 'warning',
      [towerX-s*rig.dims.shoulderX,1.79-rig.dims.shoulderY,.39],[-.08,0,0],.29);
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
}

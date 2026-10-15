import { decal } from './decals';
import { Kit } from './kit';
import { numberDecal, type FrameCtx } from './parts';
import { sunhawkAsset, type AssetJoint } from './sunhawkAsset';
import { getSunhawkPanels, type SunhawkAssetVariant } from './sunhawkSelection';

/** Art-authored rigid parts on the same pose/IK system as every other mech. */
export function buildImportedSunhawk(c: FrameCtx, number: string, variant: SunhawkAssetVariant): void {
  const { rig, livery } = c;
  const J = rig.joints;
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
  const kits = new Map<AssetJoint, Kit>();
  for (const part of sunhawkAsset(variant).parts) {
    let k = kits.get(part.joint);
    // These fine bevels need thinner plain-look ink than the procedural frames.
    if (!k) kits.set(part.joint, k = new Kit(livery, .018));
    // Broad clean armor by default; the comparison menu can restore panel masks.
    k.geometry(part.slot, part.geometry, getSunhawkPanels() ? undefined : -1);
  }
  for (const [joint,k] of kits) c.put(joints[joint],k);
  const u = variant === 'updated';
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
  rig.root.userData.sunhawkModel=variant;
}

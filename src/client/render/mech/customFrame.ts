// A custom mech (docs/CUSTOMIZATION.md): each of its eleven parts from any
// design of its frame, each painted as the build says. Every part brings what
// it carries with it: its armour and ink, and its fittings (markings,
// thrusters, the race number, the hands and the weapon's muzzle), taken from
// its own design built as usual and moved across. Its skeleton is each part's
// own: the legs' lengths from the thighs, shins and feet, the shoulders' and
// neck's sockets from the chest, and so on, so the Sunhawk (built on a
// skeleton of its own) mixes with the other Swifts.

import * as THREE from 'three';
import { ROLE, type Role } from '../../../sim/config';
import { FRAME_DESIGNS, METALS, PAINTS, PART_SLOTS, schemeFor, type Channel, type MechBuild, type PartSlot, type Scheme } from '../../../custom/mechBuild';
import { LIVERIES, type Livery } from '../palette';
import { isMarking, markingsMaterial } from './decals';
import { DIMS, designBuilder } from './frames';
import { HEAD_SEATS } from './headSeats';
import { addArmour, finishRoster, fitRosterPose, rosterAnchors, type ArmourPiece } from './importedRoster';
import { sunhawkFittings, sunhawkJoints } from './importedSunhawk';
import type { InkLines } from './ink';
import { insigniaEmblem } from './insignia';
import { frameCtx } from './parts';
import { MechRig, type FrameDims } from './rig';
import { rosterAsset } from './rosterAsset';
import { sunhawkAsset } from './sunhawkAsset';
import { sunhawkDetailMaterial } from './sunhawkDetails';
import { attachSunhawkTowers, fitSunhawkPose } from './sunhawkMotion';

/** The part a joint's pieces belong to; the shoulders' and the chest's carry two (see partAt). */
const JOINT_PART: Record<string, PartSlot | null> = {
  head: 'head',
  chest: null,
  spine: 'waist',
  hips: 'hips',
  skirtL: 'hips',
  skirtR: 'hips',
  skirtBack: 'hips',
  shL: null,
  shR: null,
  towerL: 'shoulders',
  towerR: 'shoulders',
  elL: 'armL',
  wrL: 'armL',
  elR: 'armR',
  wrR: 'armR',
  wingL: 'backpack',
  wingR: 'backpack',
  hipL: 'thighs',
  hipR: 'thighs',
  kneeL: 'shins',
  kneeR: 'shins',
  ankleL: 'feet',
  ankleR: 'feet',
};

/** A design's armour and ink at a level of detail. */
function pieces(id: string, level: number): { parts: readonly ArmourPiece[]; lines: readonly InkLines[]; dims: FrameDims } {
  return id === 'sunhawk' ? sunhawkAsset('updated', level) : rosterAsset(id, level);
}

/** A design's skeleton. */
function dimsOf(id: string, role: Role): FrameDims {
  return id === 'sunhawk' ? sunhawkAsset('updated').dims : DIMS[role];
}

/** Where each part's pieces sit on a joint that carries two, for a design (joint-local boxes, at full detail). */
const boxes = new Map<string, Map<PartSlot, THREE.Box3>>();
function partBoxes(id: string, joint: string): Map<PartSlot, THREE.Box3> {
  const key = `${id}/${joint}`;
  let m = boxes.get(key);
  if (!m) {
    m = new Map();
    for (const p of pieces(id, 0).parts) {
      if (p.joint !== joint || !p.part) continue;
      p.geometry.computeBoundingBox();
      const b = m.get(p.part) ?? new THREE.Box3();
      b.union(p.geometry.boundingBox!);
      m.set(p.part, b);
    }
    boxes.set(key, m);
  }
  return m;
}

/** The part a design's fitting belongs to: its joint's, or on a joint of two, the part it sits on (the nearest). */
function partAt(id: string, joint: string, at: THREE.Vector3): PartSlot | null {
  const own = JOINT_PART[joint];
  if (own !== null) return own ?? null;
  let best: PartSlot | null = null;
  let bestD = Infinity;
  for (const [part, box] of partBoxes(id, joint)) {
    const d = box.distanceToPoint(at);
    if (d < bestD) {
      bestD = d;
      best = part;
    }
  }
  return best;
}

/** The paint a part wears, as the kit takes it: the team's glow and markings, the part's colours. */
function paintLivery(team: Livery, s: Scheme): Livery {
  const main = PAINTS[s.main];
  const accent = PAINTS[s.accent];
  const trim = PAINTS[s.trim];
  const frame = METALS[s.frame];
  return {
    ...team,
    primary: main.color,
    secondary: accent.color,
    trim: trim.color,
    frame: frame.color,
    shades: { primary: main.shade, secondary: accent.shade, trim: trim.shade, frame: frame.shade },
    darkArmour: darkPaint(main.color),
  };
}

/** Whether markings on this paint should be light (a dark paint) rather than dark. */
export function darkPaint(color: number): boolean {
  const c = new THREE.Color(color);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.3;
}

interface Donor {
  rig: MechRig;
  /** Its joints by name, the hip skirts' and (the Sunhawk's) the towers' included. */
  joints: Record<string, THREE.Object3D>;
  /** What the rig itself owns (joints, hands, heels, muzzle, skirts, towers): never moved. */
  own: Set<THREE.Object3D>;
}

/** A design built as usual but without armour: its fittings, on its own skeleton, to take parts' fittings from. */
function donor(role: Role, id: string, team: Livery, number: string): Donor {
  let rig: MechRig;
  let towers: Record<string, THREE.Group> = {};
  if (id === 'sunhawk') {
    rig = new MechRig(dimsOf(id, role));
    towers = sunhawkJoints(rig, true);
    sunhawkFittings(frameCtx(rig, team), number, true, towers as { towerL: THREE.Group; towerR: THREE.Group });
  } else {
    rig = new MechRig(DIMS[role]);
    designBuilder(role, FRAME_DESIGNS[role].indexOf(id))(frameCtx(rig, team, false), number);
    rosterAnchors(rig, id);
  }
  const joints = { ...rig.joints, skirtL: rig.skirts.l, skirtR: rig.skirts.r, skirtBack: rig.skirts.back, ...towers };
  const own = new Set<THREE.Object3D>([...Object.values(joints), rig.handL, rig.handR, rig.muzzle, ...rig.heels]);
  return { rig, joints, own };
}

/** Free what a donor kept (the fittings of parts it did not give). */
function dispose(o: THREE.Object3D): void {
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    if (mesh.userData.ownMaterial) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

/**
 * The paint channels a design's part has armour in (not every one does: most
 * designs' waists are bare frame, many feet have no accent), so the editor
 * offers only those. The frame covers the inner frame and the dark parts too.
 */
export function partChannels(role: Role, design: number, slot: PartSlot): Set<Channel> {
  const out = new Set<Channel>();
  for (const p of pieces(FRAME_DESIGNS[role][design], 0).parts) {
    if (p.part !== slot) continue;
    if (p.slot === 'P') out.add('main');
    else if (p.slot === 'S') out.add('accent');
    else if (p.slot === 'T') out.add('trim');
    else if (p.slot === 'F' || p.slot === 'K' || p.slot === 'D') out.add('frame');
  }
  return out;
}

/** The design each part of a build comes from (its model id). */
export function designsOf(role: Role, b: MechBuild): Record<PartSlot, string> {
  return Object.fromEntries(PART_SLOTS.map((s) => [s, FRAME_DESIGNS[role][b.parts[s]]])) as Record<PartSlot, string>;
}

/** The skeleton a build stands on: each length from the part it spans. */
export function customDims(role: Role, b: MechBuild): FrameDims {
  const of = designsOf(role, b);
  const d = (s: PartSlot) => dimsOf(of[s], role);
  const thigh = d('thighs').thigh;
  const shin = d('shins').shin;
  const ankleY = d('feet').ankleY;
  const hipDrop = d('hips').hipDrop;
  const hipY = thigh + shin + ankleY + hipDrop;
  const chest = d('chest');
  const spineY = d('waist').spineY;
  const chestY = d('waist').chestY;
  return {
    hipY,
    hipX: d('hips').hipX,
    hipDrop,
    thigh,
    shin,
    ankleY,
    spineY,
    chestY,
    shoulderX: chest.shoulderX,
    shoulderY: chest.shoulderY,
    // The neck's socket from the chest; the head up or down it, to sit on that chest as on its own.
    headY: chest.headY + (HEAD_SEATS[of.chest]?.[of.head] ?? 0),
    headZ: chest.headZ,
    upperArm: d('armR').upperArm,
    foreArm: d('armR').foreArm,
    height: chest.height + (hipY + spineY + chestY) - (chest.hipY + chest.spineY + chest.chestY),
  };
}

/** A custom mech for a team (whose glow, markings and number it wears). */
export function buildCustomFrame(role: Role, team: Livery, b: MechBuild, number: string): MechRig {
  const of = designsOf(role, b);
  const ids = [...new Set(PART_SLOTS.map((s) => of[s]))];
  const rig = new MechRig(customDims(role, b));
  const towers = of.shoulders === 'sunhawk' ? attachSunhawkTowers(rig) : null;
  const joints: Record<string, THREE.Object3D> = { ...rig.joints, skirtL: rig.skirts.l, skirtR: rig.skirts.r, skirtBack: rig.skirts.back, ...(towers ?? {}) };
  const paints = new Map(PART_SLOTS.map((s) => [s, paintLivery(team, schemeFor(b, s))]));

  // Each part's fittings from its own design, where that design put them.
  const donors = new Map(ids.map((id) => [id, donor(role, id, team, number)]));
  const at = new THREE.Vector3();
  for (const [id, d] of donors) {
    const moved = new Set<THREE.Object3D>();
    for (const [name, node] of Object.entries(d.joints)) {
      const target = joints[name];
      for (const child of [...node.children]) {
        if (d.own.has(child)) continue;
        const part = partAt(id, name, at.copy(child.position));
        if (!part || of[part] !== id || !target) continue;
        target.add(child);
        moved.add(child);
        // Markings on this part's paint: light on dark, dark on light.
        if (isMarking(child, team)) child.material = markingsMaterial(team, paints.get(part)!.darkArmour);
      }
    }
    for (const f of d.rig.flames) if (moved.has(f.mesh)) rig.flames.push(f);
  }

  // What the rig holds itself, set as each part's design has it.
  const from = (s: PartSlot) => donors.get(of[s])!;
  for (const [side, el, wr, hand] of [['armL', 'elL', 'wrL', 'handL'], ['armR', 'elR', 'wrR', 'handR']] as const) {
    const a = from(side).rig;
    rig.joints[el].position.copy(a.joints[el].position);
    rig.joints[wr].position.copy(a.joints[wr].position);
    rig[hand].position.copy(a[hand].position);
    rig[hand].rotation.copy(a[hand].rotation);
    rig[hand].scale.copy(a[hand].scale);
  }
  const gun = from('armR').rig.muzzle;
  if (gun.parent) {
    joints[gun.parent.name].add(rig.muzzle);
    rig.muzzle.position.copy(gun.position);
    rig.muzzle.rotation.copy(gun.rotation);
  }
  from('feet').rig.heels.forEach((h, i) => rig.heels[i]?.position.copy(h.position));
  for (const w of ['wingL', 'wingR'] as const) {
    rig.joints[w].position.copy(from('backpack').rig.joints[w].position);
    rig.joints[w].rotation.copy(from('backpack').rig.joints[w].rotation);
  }
  for (const k of ['l', 'r', 'back'] as const) rig.skirts[k].position.copy(from('hips').rig.skirts[k].position);
  for (const d of donors.values()) dispose(d.rig.root);

  // A part flown for another faction than its design's wears the team's
  // insignia, not its own: its modelled badge is left off and the team's
  // emblem put in its place (docs/CUSTOMIZATION.md, "Faction insignias").
  const teamIndex = LIVERIES.findIndex((l) => l.id === team.id);
  const foreign = (s: PartSlot) => FRAME_DESIGNS[role].indexOf(of[s]) !== teamIndex;
  const keep = (x: { part?: PartSlot; insignia?: string }, id: string) => !!x.part && of[x.part] === id && !(x.insignia && foreign(x.part));

  // The armour, each part's from its design, in its paint.
  const levels = [0, 1, 2].map((level) => {
    const parts: ArmourPiece[] = [];
    const lines: InkLines[] = [];
    for (const id of ids) {
      const p = pieces(id, level);
      parts.push(...p.parts.filter((x) => keep(x, id)));
      lines.push(...p.lines.filter((x) => keep(x, id)));
    }
    return { parts, lines };
  });
  // The Sunhawk's painted details with the team's lettering (a part carries no faction's marks of its own).
  addArmour(rig, joints, levels, (p) => paints.get(p.part!)!, true, ids.includes('sunhawk') ? sunhawkDetailMaterial(team) : undefined);
  const insignias: { kept: string[]; replaced: string[] } = { kept: [], replaced: [] };
  for (const id of ids) {
    if (id === 'sunhawk') continue;
    for (const a of rosterAsset(id).insignias) {
      if (of[a.part] !== id) continue;
      if (!foreign(a.part)) {
        insignias.kept.push(`${id}/${a.id}`);
        continue;
      }
      const under = pieces(id, 0).parts.filter((x) => x.joint === a.joint && x.part === a.part && !x.insignia && !x.detail && x.slot !== 'G');
      const emblem = insigniaEmblem(a, under, team, paints.get(a.part)!);
      if (!emblem) continue;
      joints[a.joint].add(emblem);
      insignias.replaced.push(`${id}/${a.id}`);
    }
  }
  rig.root.userData.insignias = insignias;
  finishRoster(rig);
  rig.fitPose = of.chest === 'sunhawk' ? fitSunhawkPose : (p) => fitRosterPose(p, role === ROLE.DF, of.backpack);
  rig.root.userData.modelId = 'custom';
  return rig;
}

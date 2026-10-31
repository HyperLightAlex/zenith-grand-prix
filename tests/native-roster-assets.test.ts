/** Validate the shipped models independently of the Blender construction scripts. */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PART_SLOTS } from '../src/custom/mechBuild';
import { readRosterAsset, ROSTER_IDS, type RosterJoint } from '../src/client/render/mech/rosterAsset';
import { fitRosterPose, nativeRosterFittings } from '../src/client/render/mech/importedRoster';
import { fitSunhawkPose, attachSunhawkTowers } from '../src/client/render/mech/sunhawkMotion';
import { MechRig, type FrameDims } from '../src/client/render/mech/rig';
import { POSES } from '../src/client/render/mech/poses';

const designs = ['sunhawk', ...ROSTER_IDS];
const heavy = new Set(['rampart', 'maul', 'sobek', 'paladin', 'raijin']);
const manifestDirectory = new URL('../art/blender/roster/production/manifests/', import.meta.url);
interface Manifest {
  model: string;
  production_schema: number;
  dims: FrameDims;
  joints: Record<string, { pivot: [number, number, number]; parent: string | null }>;
  lods: Array<{ level: number; file: string; sha256: string; triangles: number; by_part: Record<string, number> }>;
}
interface Engine {
  id: string;
  joint: RosterJoint;
  part: string;
  outlet: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  length: number;
  effectWidth: number;
  effectLength: number;
}
interface ExportJson {
  nodes: Array<{ extras?: { roster_schema?: number; model?: string; all_thrusters_json?: string } }>;
  images?: unknown[];
  textures?: unknown[];
  skins?: unknown[];
}
async function load(id: string, level: number) {
  const stem = id === 'sunhawk' ? 'sunhawk-updated' : `roster/${id}`;
  const file = `src/client/render/mech/assets/${stem}${level ? `-lod${level}` : ''}.glb`;
  const bytes = await readFile(new URL(`../${file}`, import.meta.url));
  const json: ExportJson = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const asset = readRosterAsset(scene, id);
  const metadata = json.nodes.find(n => n.extras?.roster_schema === 1 && n.extras.model === id)!.extras!;
  return { file, bytes, json, scene, asset, metadata };
}
const entries = await Promise.all(designs.map(async id => ({
  id,
  manifest: JSON.parse(await readFile(new URL(`${id}.json`, manifestDirectory), 'utf8')) as Manifest,
  levels: await Promise.all([0, 1, 2].map(level => load(id, level))),
})));
type Entry = typeof entries[number];

function makeRig(entry: Entry) {
  const asset = entry.levels[0].asset;
  const rig = new MechRig(asset.dims);
  const extra = entry.id === 'sunhawk' ? attachSunhawkTowers(rig) : {};
  const joints: Record<string, THREE.Object3D> = {
    ...rig.joints, ...extra,
    skirtL: rig.skirts.l, skirtR: rig.skirts.r, skirtFront: rig.skirts.front, skirtBack: rig.skirts.back,
  };
  // Native fittings bind to the same effect objects made by the game builders.
  for (const t of asset.mainThrusters!) {
    const mesh = new THREE.Mesh();
    mesh.position.x = t.id === 'mainL' ? 1 : -1;
    rig.joints.chest.add(mesh);
    rig.flames.push({ mesh, bank: 'main', width: 1, length: 1 });
  }
  nativeRosterFittings(rig, asset, extra);
  rig.fitPose = pose => entry.id === 'sunhawk'
    ? fitSunhawkPose(pose)
    : fitRosterPose(pose, heavy.has(entry.id), entry.id);
  rig.keepFeetOnRoad = true;
  return { rig, joints };
}

it('ships exactly the fifteen accepted default native designs', async () => {
  expect(entries).toHaveLength(15);
  const manifests = (await readdir(manifestDirectory)).filter(file => file.endsWith('.json')).sort();
  expect(manifests).toEqual(designs.map(id => `${id}.json`).sort());
});

for (const entry of entries) describe(`${entry.id} native production contract`, () => {
  const { id, manifest, levels } = entry;

  it('matches the production manifest hashes, dimensions, counts and declared sockets', () => {
    expect(manifest.model).toBe(id);
    expect(manifest.production_schema).toBe(1);
    expect(manifest.lods).toHaveLength(3);
    const { rig, joints } = makeRig(entry);
    rig.root.updateMatrixWorld(true);
    expect(Object.keys(joints).sort()).toEqual(Object.keys(manifest.joints).sort());
    for (const [name, joint] of Object.entries(joints)) {
      const socket = manifest.joints[name];
      expect(joint.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...socket.pivot)), `${id}/${name} socket`).toBeLessThan(2e-6);
      if (socket.parent) expect(joint.parent).toBe(joints[socket.parent]);
    }
    for (const [level, { asset, bytes, file }] of levels.entries()) {
      const record = manifest.lods[level];
      expect(record.level).toBe(level);
      expect(record.file).toBe(file);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
      expect(asset.dims).toEqual(manifest.dims);
      expect(asset.sourceTextureSchema).toBe(1);
      expect(asset.fittings).toEqual(levels[0].asset.fittings);
      const triangles: Record<string, number> = {};
      for (const part of asset.parts) triangles[part.part!] = (triangles[part.part!] ?? 0) + part.geometry.index!.count / 3;
      expect(triangles).toEqual(record.by_part);
      const count = Object.values(triangles).reduce((n, value) => n + value, 0);
      expect(count).toBe(record.triangles);
      expect(count).toBeGreaterThan(1_000);
      expect(count).toBeLessThan([50_000, 25_000, 15_000][level]);
      if (level) expect(count).toBeLessThan(manifest.lods[level - 1].triangles);
    }
  });

  it('has all eleven rigid, solid-colour parts with valid indexed shading and ink data at every LOD', () => {
    for (const [level, { asset, json, scene }] of levels.entries()) {
      expect([...new Set(asset.parts.map(p => p.part))].sort()).toEqual([...PART_SLOTS].sort());
      expect(json.images ?? []).toHaveLength(0);
      expect(json.textures ?? []).toHaveLength(0);
      expect(json.skins ?? []).toHaveLength(0);
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
        expect(PART_SLOTS).toContain(object.userData.part);
        expect(manifest.joints[object.userData.joint]).toBeDefined();
        expect(object.userData.texture_set).toBeUndefined();
        if (object instanceof THREE.LineSegments) expect(object.userData.ink_lines).toBe(1);
        else expect(object instanceof THREE.SkinnedMesh).toBe(false);
      });
      let invalid = 0;
      for (const { geometry } of asset.parts) {
        const position = geometry.getAttribute('position'), index = geometry.index;
        expect(index).not.toBeNull();
        expect(index!.count % 3).toBe(0);
        for (const key of ['position', 'normal', '_outline_normal', '_ink_width']) {
          const attribute = geometry.getAttribute(key);
          expect(attribute, `${id}/LOD${level}/${key}`).toBeDefined();
          expect(attribute.count).toBe(position.count);
          for (const value of attribute.array) if (!Number.isFinite(value)) invalid++;
        }
        for (const key of ['normal', '_outline_normal']) {
          const normal = geometry.getAttribute(key);
          for (let i = 0; i < normal.count; i++) if (Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) > .003) invalid++;
        }
        for (const value of geometry.getAttribute('_ink_width').array) if (value < 0 || value > 1) invalid++;
        for (const value of index!.array) if (!Number.isInteger(value) || value < 0 || value >= position.count) invalid++;
        for (const name of ['skinWeight', 'skinIndex', 'uv']) expect(geometry.hasAttribute(name)).toBe(false);
      }
      expect(invalid, `${id}/LOD${level}`).toBe(0);
      for (const line of asset.lines) {
        expect(line.positions.length).toBe(line.kinds.length * 6);
        expect(Array.from(line.positions).every(Number.isFinite)).toBe(true);
        expect(Array.from(line.kinds).every(kind => [0, 1, 2].includes(kind))).toBe(true);
        expect(asset.parts.some(part => part.joint === line.joint && part.part === line.part && part.insignia === line.insignia)).toBe(true);
      }
    }
  });

  it('binds exactly four downward engines, fin accessories and the race number to their swappable owners', () => {
    for (const { asset, metadata } of levels) {
      expect(asset.mainThrusters?.map(t => t.id).sort()).toEqual(['mainL', 'mainR']);
      expect(asset.calfThrusters.map(t => t.joint).sort()).toEqual(['kneeL', 'kneeR']);
      expect(asset.mainThrusters).toEqual(levels[0].asset.mainThrusters);
      expect(asset.calfThrusters).toEqual(levels[0].asset.calfThrusters);
      const engines: Engine[] = JSON.parse(metadata.all_thrusters_json!);
      expect(engines.map(t => t.id).sort()).toEqual(['calfL', 'calfR', 'mainL', 'mainR']);
      for (const t of engines) {
        const main = t.id.startsWith('main');
        expect(t.joint).toBe(main ? 'chest' : `knee${t.id.slice(-1)}`);
        expect(t.part).toBe(main ? 'backpack' : 'shins');
        expect(asset.parts.some(p => p.joint === t.joint && p.part === t.part)).toBe(true);
        expect([...t.outlet, ...t.rotation, t.radius, t.length, t.effectWidth, t.effectLength].every(Number.isFinite)).toBe(true);
        for (const value of [t.radius, t.length, t.effectWidth, t.effectLength]) expect(value).toBeGreaterThan(0);
        const axis = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(...t.rotation));
        expect(axis.y).toBeLessThan(0);
        expect(axis.z).toBeLessThan(0);
      }
      for (const part of [...asset.parts, ...asset.lines].filter(p => p.joint === 'wingL' || p.joint === 'wingR')) expect(part.part).toBe('backpack');
      const number = asset.fittings?.anchors?.raceNumber;
      expect(number).toBeDefined();
      const numberPart = number!.part ?? 'backpack';
      expect(PART_SLOTS).toContain(numberPart);
      expect(asset.parts.some(p => p.joint === number!.joint && p.part === numberPart)).toBe(true);
    }
  });

  it('seats both skate soles on the neutral ground at every LOD', () => {
    const { rig, joints } = makeRig(entry);
    rig.root.updateMatrixWorld(true);
    for (const { asset } of levels) for (const joint of ['ankleL', 'ankleR']) {
      let bottom = Infinity;
      for (const part of asset.parts.filter(p => p.part === 'feet' && p.joint === joint)) {
        const position = part.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) bottom = Math.min(bottom, new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(joints[joint].matrixWorld).y);
      }
      expect(Number.isFinite(bottom)).toBe(true);
      expect(Math.abs(bottom), `${id}/${joint} ground height`).toBeLessThan(.025);
    }
  });

  it('retains finite weapon, hand, heel and badge placements at all three LODs', () => {
    for (const { asset } of levels) {
      for (const name of ['handL', 'handR', 'heelL', 'heelR', 'muzzle', 'raceNumber'] as const) {
        const fitting = asset.fittings?.anchors?.[name];
        expect(fitting, `${id}/${name}`).toBeDefined();
        expect(fitting!.position).toHaveLength(3);
        expect(fitting!.position.every(Number.isFinite)).toBe(true);
        expect(manifest.joints[fitting!.joint!]).toBeDefined();
        if (fitting!.rotation) expect(fitting!.rotation.every(Number.isFinite)).toBe(true);
      }
      expect(asset.insignias).toEqual(levels[0].asset.insignias);
      for (const anchor of asset.insignias) {
        expect([...anchor.center, ...anchor.normal, ...anchor.up, anchor.width].every(Number.isFinite)).toBe(true);
        expect(anchor.width).toBeGreaterThan(0);
        const normal = new THREE.Vector3(...anchor.normal), up = new THREE.Vector3(...anchor.up);
        expect(normal.length()).toBeCloseTo(1, 5);
        expect(up.length()).toBeCloseTo(1, 5);
        expect(normal.dot(up)).toBeCloseTo(0, 5);
        expect(asset.parts.some(p => p.insignia === anchor.id && p.joint === anchor.joint && p.part === anchor.part)).toBe(true);
      }
    }
  });

  it('keeps every part rigid through the game poses and restores the bind pose without drift', () => {
    const { rig, joints } = makeRig(entry), objects = [rig.root, rig.body, ...Object.values(joints)];
    rig.root.updateMatrixWorld(true);
    const state = objects.map(object => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), world: object.matrixWorld.clone() }));
    const restore = () => { for (const s of state) { s.object.position.copy(s.position); s.object.quaternion.copy(s.quaternion); s.object.scale.copy(s.scale); } };
    const points = levels.flatMap(({ asset }) => asset.parts.map(part => {
      const position = part.geometry.getAttribute('position');
      const a = new THREE.Vector3().fromBufferAttribute(position, 0), b = new THREE.Vector3().fromBufferAttribute(position, position.count - 1);
      return { joint: joints[part.joint], a, b, distance: a.distanceTo(b) };
    }));
    let error = 0;
    for (const pose of Object.values(POSES)) {
      restore();
      const copy = structuredClone(pose), before = JSON.stringify(copy);
      rig.apply(copy); rig.root.updateMatrixWorld(true);
      expect(JSON.stringify(copy)).toBe(before);
      for (const object of objects) if (!object.matrixWorld.elements.every(Number.isFinite) || Math.abs(object.matrixWorld.determinant() - 1) > 1e-6) error++;
      for (const p of points) if (Math.abs(p.a.clone().applyMatrix4(p.joint.matrixWorld).distanceTo(p.b.clone().applyMatrix4(p.joint.matrixWorld)) - p.distance) > 1e-6) error++;
    }
    restore(); rig.root.updateMatrixWorld(true);
    expect(error).toBe(0);
    for (const s of state) expect(s.object.matrixWorld.elements.every((value, i) => Math.abs(value - s.world.elements[i]) < 1e-10)).toBe(true);
  });
});

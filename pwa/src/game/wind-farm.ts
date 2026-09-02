// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIND FARM, drawn (R43). The engine decided where every tower stands,
// how tall the machine is and how wide its rotor (`engine/mapgen/energy.ts`);
// this module builds what it was told — and turns it. A turbine is the
// biggest thing on any stage by an order of magnitude: two hundred metres
// to the blade tip over trees of twenty, so the string on the ridge is in
// view from the moment the road comes within the fog's reach and stays
// there for a kilometre of driving. That is the whole point of it, and it
// is why the farms are NOT part of the road chunks: a chunk goes dark when
// the camera leaves the road it was built for, and a tower half a
// kilometre off the road belongs to no chunk in particular.
//
// The blades turn in the game's own wind (`GameState.wind`, the gusting
// vector every step already leans the rain by), and the nacelle yaws to
// face into it — slowly, the way a real one hunts the mean bearing rather
// than every gust. Where the blades ARE this frame is renderer state on
// the renderer's clock, the livestock's way: nothing collides with a
// blade, nothing scores one, so nothing about it is `GameState`.
//
// Three draw calls per farm, whatever its size: the towers as one merged
// vertex-coloured geometry, the nacelles as one instanced mesh that yaws,
// the rotors as one that yaws and spins — plus the beacons, one instanced
// mesh of red dots that blink in step across the whole stage, because a
// wind farm's lights do.

import * as THREE from "three";
import {
  createRng,
  STAGE_RULES,
  TOWER_BASE,
  type GameState,
  type Track,
  type WindFarm,
} from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import type { GroundBeside } from "./road-mesh.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture, gravelTexture } from "./textures.ts";

const W = STAGE_RULES.energy.wind;

const TINT = {
  towerFoot: new THREE.Color(0xc4c8cc),
  tower: new THREE.Color(0xe8eaec),
  plinth: new THREE.Color(0x8e9194),
  door: new THREE.Color(0x4f545b),
  nacelle: new THREE.Color(0xdfe2e5),
  nacelleDark: new THREE.Color(0xb9bdc2),
  hub: new THREE.Color(0xe2e4e6),
  blade: new THREE.Color(0xf0f1f2),
  bladeTip: new THREE.Color(0xd8322a),
};

/** The machine's proportions that are not the engine's to decide, m. */
const MACHINE = {
  /** Tower top radius; the foot's is the engine's `TOWER_BASE`. */
  towerTop: 1.6,
  /** The plinth the tower is bolted to, and the door in its foot. */
  plinth: { r: 3.7, h: 0.7 },
  door: { w: 1.6, h: 2.4 },
  /** The nacelle: its width, height and length, and how far in front of
   * the tower's axis the rotor's hub centre sits. */
  nacelle: { w: 4.2, h: 4.0, len: 11.5, ahead: 5.4 },
  /** The hub: the nose cone's radius and length, and the blade root's. */
  hub: { r: 1.9, nose: 2.8 },
  root: { r: 1.05, len: 2.2 },
  /** The blade: chord at the root, at the tip, and how flat it is across
   * the chord (a share of the chord). */
  blade: { rootChord: 2.6, tipChord: 0.42, flat: 0.28 },
  /** The beacon on the nacelle's roof. */
  beacon: { r: 1.5, up: 2.8, back: 2.0 },
};

/** The crane pad's gravel: the car park's shade — driven over, never raked. */
const padMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ map: gravelTexture(), color: 0xcdbf9f }),
);
const machineMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);
/** The beacon glows: unlit, so it reads at night, when it is the only
 * thing on the ridge that does. */
const beaconMaterial = shareOne(() => new THREE.MeshBasicMaterial({ color: 0xff2e1e }));

/** How the rotor turns with the wind: the rpm at no wind (a big machine
 * idles rather than stands, or the farm reads as switched off), the rpm at
 * the top of the band, and the wind that reaches it, m/s. */
const SPIN = { idleRpm: 2.4, fullRpm: 13.5, fullWind: 11 };
/** How fast the nacelle hunts the wind's bearing, rad/s — a real one takes
 * a minute to come round; this takes a few seconds, so a veer is seen. */
const YAW_RATE = 0.16;
/** The beacons' blink: period and how long they are lit, s. */
const BLINK = { period: 1.6, lit: 0.28 };
/** How far from the car a farm keeps turning, m — past the fog, with room
 * for the draw-distance option's reach. Beyond it the rotors freeze,
 * unseen. */
const LIVE_RANGE = 1400;
/** How far the pad's gravel is drawn above the plane the terrain graded. */
const PAD_LIFT = 0.04;

/** One tower and its plinth, standing at the origin with its foot on y = 0. */
function towerGeometry(hub: number, rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  b.cyl(TINT.plinth, MACHINE.plinth.r, MACHINE.plinth.r + 0.2, MACHINE.plinth.h, 0, {}, 12);
  const tower = new THREE.CylinderGeometry(MACHINE.towerTop, TOWER_BASE, hub, 14);
  tower.translate(0, MACHINE.plinth.h + hub / 2, 0);
  b.add(tower, [TINT.towerFoot, TINT.tower]);
  const door = new THREE.BoxGeometry(MACHINE.door.w, MACHINE.door.h, 0.2);
  door.translate(0, MACHINE.plinth.h + MACHINE.door.h / 2, TOWER_BASE - 0.02);
  b.add(door, TINT.door);
  return b.build();
}

/** The nacelle, in its own frame: the hub axis along z at y = 0, the
 * rotor end toward -z, the tower under its middle. */
function nacelleGeometry(rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const { w, h, len, ahead } = MACHINE.nacelle;
  const body = new THREE.BoxGeometry(w, h, len);
  body.translate(0, 0, len / 2 - ahead + 1.2);
  b.add(body, [TINT.nacelleDark, TINT.nacelle]);
  // The cowl behind the hub: a short fat cylinder the nose sits on.
  const cowl = new THREE.CylinderGeometry(MACHINE.hub.r, MACHINE.hub.r + 0.3, 1.6, 12);
  cowl.rotateX(Math.PI / 2);
  cowl.translate(0, 0, -ahead + 1.3);
  b.add(cowl, TINT.nacelleDark);
  return b.build();
}

/** The rotor, in its own frame: the hub centre at the origin, the blades in
 * the XY plane spinning about z, the nose cone pointing down -z. */
function rotorGeometry(rotor: number, rand: () => number): THREE.BufferGeometry {
  const b = new GeoBuilder(rand);
  const nose = new THREE.ConeGeometry(MACHINE.hub.r, MACHINE.hub.nose, 12);
  nose.rotateX(-Math.PI / 2);
  nose.translate(0, 0, -MACHINE.hub.nose / 2);
  b.add(nose, TINT.hub);
  const hubBody = new THREE.CylinderGeometry(MACHINE.hub.r, MACHINE.hub.r, 1.4, 12);
  hubBody.rotateX(Math.PI / 2);
  hubBody.translate(0, 0, 0.7);
  b.add(hubBody, TINT.hub);
  const length = rotor / 2 - MACHINE.hub.r;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    // The root: a round stub out of the hub. The blade: a tapered stalk
    // flattened across the chord, its tip painted red the way an aviation
    // rule paints the tips of anything this tall.
    const root = new THREE.CylinderGeometry(MACHINE.root.r, MACHINE.root.r, MACHINE.root.len, 8);
    root.translate(0, MACHINE.hub.r + MACHINE.root.len / 2 - 0.4, 0);
    root.rotateZ(a);
    b.add(root, TINT.hub);
    const span = length - MACHINE.root.len + 0.4;
    const blade = new THREE.CylinderGeometry(
      MACHINE.blade.tipChord / 2,
      MACHINE.blade.rootChord / 2,
      span,
      6,
    );
    blade.scale(1, 1, MACHINE.blade.flat);
    blade.translate(0, MACHINE.hub.r + MACHINE.root.len - 0.4 + span / 2, 0);
    // Pitched a little about its own axis, so the three faces the light
    // differently as the rotor comes round — a flat rotor reads as a disc.
    blade.rotateY(0.35);
    blade.rotateZ(a);
    b.add(blade, [TINT.blade, TINT.blade]);
    const tip = new THREE.CylinderGeometry(
      MACHINE.blade.tipChord / 2,
      MACHINE.blade.tipChord / 2 + 0.16,
      span * 0.09,
      6,
    );
    tip.scale(1, 1, MACHINE.blade.flat);
    tip.translate(0, MACHINE.hub.r + MACHINE.root.len - 0.4 + span - span * 0.045, 0);
    tip.rotateY(0.35);
    tip.rotateZ(a);
    b.add(tip, TINT.bladeTip);
  }
  return b.build();
}

/** The pad: a disc of gravel on the plane the terrain graded, its uvs in
 * world metres so the speckle is anchored to the ground. */
function padGeometry(x: number, z: number, y: number): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(W.pad.radius, 28);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x, y + PAD_LIFT, z);
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 3.5, pos.getZ(i) / 3.5);
  return geo;
}

/** One farm as built: the meshes and the per-turbine state the frame
 * loop advances. */
type BuiltFarm = {
  atS: number;
  /** The string's middle, for the live-range gate. */
  x: number;
  z: number;
  group: THREE.Group;
  nacelles: THREE.InstancedMesh;
  rotors: THREE.InstancedMesh;
  beacons: THREE.InstancedMesh;
  /** Per turbine: the hub's world position, its yaw, its rotor's phase and
   * the share of the farm's rate it turns at (no two machines agree). */
  hubs: THREE.Vector3[];
  yaw: number[];
  phase: number[];
  rate: number[];
  geometries: THREE.BufferGeometry[];
};

export type WindFarms = {
  group: THREE.Group;
  /** Build a farm the engine placed, footed on the ground the terrain made. */
  add: (track: Track, farm: WindFarm, beside: GroundBeside) => void;
  /** Turn the rotors and hunt the wind, for the farms within reach of the car. */
  update: (state: GameState, dt: number) => void;
  /** Endless: drop the farms the run has left behind. */
  pruneBefore: (s: number) => void;
  dispose: () => void;
};

/** The wind's bearing, the way the engine spells it: the direction it
 * blows TO. A nacelle faces the way it comes FROM. */
function upwindOf(x: number, z: number): number {
  return Math.atan2(x, z) + Math.PI;
}

/** The shortest turn from one bearing to another, rad, in (-π, π]. */
function turnTo(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWindFarms(): WindFarms {
  const group = new THREE.Group();
  const farms: BuiltFarm[] = [];
  let clock = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qSpin = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const off = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const none = new THREE.Vector3(0, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3(0, 0, 1);

  /** Write every instance matrix of a farm from its state. */
  const pose = (farm: BuiltFarm, lit: boolean): void => {
    for (let i = 0; i < farm.hubs.length; i++) {
      const hub = farm.hubs[i];
      q.setFromAxisAngle(up, farm.yaw[i]);
      m.compose(hub, q, one);
      farm.nacelles.setMatrixAt(i, m);
      // The rotor hangs ahead of the tower's axis along the nacelle's own
      // -z, then spins about that axis.
      off.set(0, 0, -MACHINE.nacelle.ahead).applyQuaternion(q);
      pos.copy(hub).add(off);
      qSpin.setFromAxisAngle(axis, farm.phase[i]);
      m.compose(pos, q.multiply(qSpin), one);
      farm.rotors.setMatrixAt(i, m);
      q.setFromAxisAngle(up, farm.yaw[i]);
      off.set(0, MACHINE.beacon.up, MACHINE.beacon.back).applyQuaternion(q);
      pos.copy(hub).add(off);
      m.compose(pos, q, lit ? one : none);
      farm.beacons.setMatrixAt(i, m);
    }
    farm.nacelles.instanceMatrix.needsUpdate = true;
    farm.rotors.instanceMatrix.needsUpdate = true;
    farm.beacons.instanceMatrix.needsUpdate = true;
  };

  const add = (track: Track, farm: WindFarm, beside: GroundBeside): void => {
    const rng = createRng((track.seed ^ 0x5e1fa2c9 ^ Math.round(farm.atS)) >>> 0);
    const rand = (): number => rng.next();
    const built = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const n = farm.turbines.length;
    const hubs: THREE.Vector3[] = [];
    let cx = 0;
    let cz = 0;
    for (const t of farm.turbines) {
      // Footed on the ground as the terrain made it — the crane pad's level,
      // which the record's own `y` was the bare country's guess at.
      const y = beside.heightAt(t.x, t.z);
      hubs.push(new THREE.Vector3(t.x, y + MACHINE.plinth.h + farm.hub, t.z));
      cx += t.x / n;
      cz += t.z / n;
    }
    // The towers and the pads, merged: one geometry each for the string.
    const towerParts: THREE.BufferGeometry[] = farm.turbines.map((t) => {
      const geo = towerGeometry(farm.hub, rand);
      geo.translate(t.x, beside.heightAt(t.x, t.z), t.z);
      return geo;
    });
    const towerMesh = new THREE.Mesh(mergeLit(towerParts), machineMaterial());
    geometries.push(towerMesh.geometry);
    built.add(towerMesh);
    const padParts = farm.turbines.map((t) => padGeometry(t.x, t.z, beside.heightAt(t.x, t.z)));
    const padMesh = new THREE.Mesh(mergePlain(padParts), padMaterial());
    geometries.push(padMesh.geometry);
    built.add(padMesh);
    const nacelleGeo = nacelleGeometry(rand);
    const rotorGeo = rotorGeometry(farm.rotor, rand);
    const beaconGeo = new THREE.SphereGeometry(MACHINE.beacon.r, 8, 6);
    geometries.push(nacelleGeo, rotorGeo, beaconGeo);
    const nacelles = new THREE.InstancedMesh(nacelleGeo, machineMaterial(), n);
    const rotors = new THREE.InstancedMesh(rotorGeo, machineMaterial(), n);
    const beacons = new THREE.InstancedMesh(beaconGeo, beaconMaterial(), n);
    // A rotor two hundred metres tall sweeps a sphere the instanced mesh's
    // own bound does not know about: give it one, or the frustum cull drops
    // the string the moment its hubs leave the view.
    for (const mesh of [nacelles, rotors, beacons]) {
      mesh.frustumCulled = false;
      built.add(mesh);
    }
    const record: BuiltFarm = {
      atS: farm.atS,
      x: cx,
      z: cz,
      group: built,
      nacelles,
      rotors,
      beacons,
      hubs,
      yaw: farm.turbines.map(() => rng.range(0, Math.PI * 2)),
      phase: farm.turbines.map(() => rng.range(0, Math.PI * 2)),
      rate: farm.turbines.map(() => rng.range(0.92, 1.08)),
      geometries,
    };
    pose(record, true);
    farms.push(record);
    group.add(built);
  };

  const update = (state: GameState, dt: number): void => {
    if (farms.length === 0) return;
    clock += dt;
    const lit = clock % BLINK.period < BLINK.lit;
    const wind = state.wind;
    const speed = Math.hypot(wind.x, wind.z);
    // Into the gust when there is one to speak of; onto the stage's mean
    // bearing when the air is still, so a farm on a calm day still faces
    // one way rather than wherever the seed left it.
    const facing = speed > 0.6 ? upwindOf(wind.x, wind.z) : state.env.windDir + Math.PI;
    const rpm =
      SPIN.idleRpm +
      (SPIN.fullRpm - SPIN.idleRpm) * Math.min(1, Math.max(0, speed / SPIN.fullWind));
    const omega = (rpm * Math.PI * 2) / 60;
    for (const farm of farms) {
      if (Math.hypot(farm.x - state.car.x, farm.z - state.car.z) > LIVE_RANGE) continue;
      for (let i = 0; i < farm.hubs.length; i++) {
        const turn = turnTo(farm.yaw[i], facing);
        farm.yaw[i] += Math.max(-YAW_RATE * dt, Math.min(YAW_RATE * dt, turn));
        farm.phase[i] = (farm.phase[i] - omega * farm.rate[i] * dt) % (Math.PI * 2);
      }
      pose(farm, lit);
    }
  };

  const drop = (farm: BuiltFarm): void => {
    group.remove(farm.group);
    for (const geo of farm.geometries) geo.dispose();
    farm.nacelles.dispose();
    farm.rotors.dispose();
    farm.beacons.dispose();
  };

  const pruneBefore = (s: number): void => {
    while (farms.length > 0 && farms[0].atS < s) drop(farms.shift() as BuiltFarm);
  };

  const dispose = (): void => {
    for (const farm of farms) drop(farm);
    farms.length = 0;
  };

  return { group, add, update, pruneBefore, dispose };
}

/** Merge whole vertex-coloured geometries — position, normal, colour and
 * uv — into one, disposing the parts. */
function mergeLit(sources: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color", "uv"]) {
    const size = sources[0].getAttribute(name).itemSize;
    let count = 0;
    for (const geo of sources) count += geo.getAttribute(name).count;
    const merged = new Float32Array(count * size);
    let at = 0;
    for (const geo of sources) {
      const attr = geo.getAttribute(name);
      merged.set(attr.array as ArrayLike<number>, at);
      at += attr.count * size;
    }
    out.setAttribute(name, new THREE.Float32BufferAttribute(merged, size));
  }
  for (const geo of sources) geo.dispose();
  return out;
}

/** Merge plain textured geometries — position, normal and uv, indexed —
 * into one non-indexed geometry, disposing the parts. */
function mergePlain(sources: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = sources.map((geo) => {
    const plain = geo.toNonIndexed();
    geo.dispose();
    return plain;
  });
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const size = flat[0].getAttribute(name).itemSize;
    let count = 0;
    for (const geo of flat) count += geo.getAttribute(name).count;
    const merged = new Float32Array(count * size);
    let at = 0;
    for (const geo of flat) {
      const attr = geo.getAttribute(name);
      merged.set(attr.array as ArrayLike<number>, at);
      at += attr.count * size;
    }
    out.setAttribute(name, new THREE.Float32BufferAttribute(merged, size));
  }
  for (const geo of flat) geo.dispose();
  return out;
}

/** One whole machine standing at the origin, for the item sheet: the
 * tower, the nacelle and the rotor as the game builds them, at a mid-band
 * hub height and rotor. */
export function buildTurbine(rand: () => number): THREE.Group {
  const hub = (W.hub.min + W.hub.max) / 2;
  const rotor = (W.rotor.min + W.rotor.max) / 2;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(towerGeometry(hub, rand), machineMaterial()));
  const nacelle = new THREE.Mesh(nacelleGeometry(rand), machineMaterial());
  nacelle.position.y = MACHINE.plinth.h + hub;
  group.add(nacelle);
  const spinner = new THREE.Mesh(rotorGeometry(rotor, rand), machineMaterial());
  spinner.position.set(0, MACHINE.plinth.h + hub, -MACHINE.nacelle.ahead);
  spinner.rotation.z = 0.4;
  group.add(spinner);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(MACHINE.beacon.r, 8, 6), beaconMaterial());
  beacon.position.set(0, MACHINE.plinth.h + hub + MACHINE.beacon.up, MACHINE.beacon.back);
  group.add(beacon);
  return group;
}

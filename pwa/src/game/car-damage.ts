// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The damage made visible: the engine's crush ledger (state.car.damage)
// bent into the body's actual polygons, and its partBreak events turned
// into pieces tumbling off down the road. Every mesh on the car keeps a
// pristine copy of its vertices; whenever the ledger's version moves, each
// vertex is re-derived from that copy through ONE displacement field
// (car-crumple.ts: the fold, the bulge, the creases, the tear, the kink,
// the sagged belly and the caved roof), every face is then LIT AGAIN from
// the plane it now lies in, and the paint is scuffed and chipped where the
// metal folded. The engine owns every number here; this module only draws
// what it says.
//
// Everything bolted to the shell bends WITH it, out of the same routine:
// the lamp lenses (their own mesh only because a lamp is lit rather than
// painted), the bolt-on panels (a bumper is the first thing to meet a
// trunk, and one left pristine in front of a folded nose is the one wrong
// thing on the car), and the cabin, whose cage would otherwise stand up
// through a caved roof. The field is a function of rest position alone, so
// meshes bent apart stay joined where they meet.
//
// Three more things the ledger says, drawn here because they are the body
// coming apart rather than something thrown off it: the WHEELS, which go
// flat and bent on their own ledger and then come off (the corner drops
// onto its hub, and the whole car sits crooked from then on — `pose`; the
// wheel itself leaves as a body of its own, loose-wheel.ts, when the video
// options allow one); the
// GLASS, which shatters out of its frame rather than flying (its slice of
// the glass buffer goes to alpha zero, and the grime film over it with it);
// and the DOORS, which fly like any other part and leave the cabin open
// behind them (the flank inside the door's rectangle is painted into the
// hole, stripes and all).

import * as THREE from "three";
import { TUNING, WHEEL_PARTS, type DamagePart, type GameEvent, type GameState } from "@engine";

import type { CarBodyParts, GlassPane } from "./car-body.ts";
import { lambert } from "./car/builder.ts";
import { crumple, noise, rimOf, type CrumpleFrame } from "./car-crumple.ts";
import { looseWheel, stepLooseWheel, throwWheel, type LooseWheel } from "./loose-wheel.ts";
import { stepTumble, tumbleFrom, type TumbleBody } from "./tumble.ts";

/** Scuffed metal darkens toward this fraction of its paint... */
const SCUFF = 0.45;
/** ...over this much local crush, m — the first bad hit takes the paint
 * off the metal that folded, and only that metal. */
const SCUFF_OVER = 0.12;
/** The scuff is uneven: this share of it rides a noise, so folded paint
 * reads as scraped rather than dyed. */
const SCUFF_GRAIN = 0.5;
/** Where the paint has come off altogether: bare primer, and the size of
 * the chips, m. */
const PRIMER = { r: 0.5, g: 0.5, b: 0.52 };
const CHIP_SCALE = 0.12;
/** What the cabin behind a missing door is painted: the dark of a room
 * seen from outside. */
const HOLE = new THREE.Color(0x0d1013);
/** How far in from the flank a vertex still counts as the door's, as a
 * fraction of the body's widest half — the underbody and the floor are
 * inboard of this and stay whatever colour they were. */
const HOLE_REACH = 0.55;
/** The ledger can move dozens of times a second while a roll grinds along
 * on one flank, and every move is a full re-bend of fifteen thousand
 * vertices: at most one per this many seconds, which is still every
 * third frame. The last move is never lost — a version left unbent is
 * bent on the next frame that is allowed to. */
const BEND_EVERY = 0.05;

/** How far over the ground a torn-off piece's centre ends up over and
 * above its own half-thickness, m — the gravel it is lying on. */
const DEBRIS_REST = 0.02;
/** What the hit that tears a wheel off adds to the corner's own velocity,
 * m/s: out of the arch and up over it. The rest of what the wheel leaves
 * with is the car's speed and the tread's spin (loose-wheel.ts). */
const WHEEL_KICK = { out: 2.2, up: 3 };
/** Which of a torn-off panel's own axes is its face — the one the tumbler
 * turns upward so it comes to rest lying flat (tumble.ts). A lamp or a
 * mirror is a lump and lies however it lands. */
const PANEL_FACE: Partial<Record<DamagePart, "x" | "y" | "z">> = {
  hood: "y",
  hatch: "y",
  spoiler: "y",
  doorL: "x",
  doorR: "x",
  bumperF: "z",
  bumperR: "z",
};

/** THE FLAT. A tyre with no air in it is this much of its height... */
const FLAT_SQUASH = 0.78;
/** ...and this much longer where it spreads on the road. */
const FLAT_SPREAD = 1.08;
/** ...leaning this far in at the top, rad — the rim is bent with it... */
const BENT_CAMBER = 0.16;
/** ...knocked this far out of line, rad — a bent upright toes the wheel... */
const BENT_TOE = 0.1;
/** ...and wobbling this far either way once per turn, rad: a bent rim is
 * never round again, and the wheel says so at every speed. */
const BENT_WOBBLE = 0.07;
/** THE HUB. A corner with no wheel on it rides on this much of the tyre's
 * radius — the hub, the disc and the stub of the upright — which is how far
 * that corner of the body drops. */
const HUB_SHARE = 0.36;

export type CarPose = {
  /** Extra roll, rad — positive lifts the engine's right side, as the
   * engine's own `roll` does. */
  roll: number;
  /** Extra pitch, rad, nose-up positive, as the engine's own. */
  pitch: number;
  /** How far the whole sprung mass has dropped, m (negative is down). */
  drop: number;
};

export type CarDamageVisual = {
  /** World-anchored group the torn-off pieces tumble in — the renderer
   * adds it to the scene beside the car. */
  debris: THREE.Group;
  /** How crooked the body sits on what is left of its wheels — read by the
   * car mesh every frame and added to the springs' own attitude. All zero
   * on a car with four wheels. */
  pose: CarPose;
  update: (state: GameState, dt: number) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  /** Whether a torn-off wheel is thrown as a rolling body or simply gone —
   * the video options' call (`LOOSE_WHEELS` in settings.ts). */
  setLooseWheels: (on: boolean) => void;
  dispose: () => void;
};

/** One mesh's vertices, plus the pristine copy every bend is re-derived
 * from — every mesh on the car gets one, and `bend` walks them all. */
type Crumpleable = {
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  restPos: Float32Array;
  /** The colour each vertex was baked with, DIVIDED BACK OUT of the sun's
   * term for the face it sat in: the paint itself, to be lit again from
   * whatever plane the fold leaves the face in. */
  paint: Float32Array;
};

function crumpleable(mesh: THREE.Mesh): Crumpleable {
  const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const col = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
  const restPos = new Float32Array(pos.array as Float32Array);
  const paint = new Float32Array(pos.count * 3);
  const stride = col.itemSize;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const k = faceLight(restPos, i);
    for (let v = i; v < i + 3; v++) {
      paint[v * 3] = col.array[v * stride] / k;
      paint[v * 3 + 1] = col.array[v * stride + 1] / k;
      paint[v * 3 + 2] = col.array[v * stride + 2] / k;
    }
  }
  return { pos, col, restPos, paint };
}

/** The baked sun's term for the triangle starting at vertex `i` of a
 * position buffer. A face the fold has flattened to nothing keeps the
 * light of a face pointing straight up — no plane, no shade. */
function faceLight(p: ArrayLike<number>, i: number): number {
  const ax = p[i * 3];
  const ay = p[i * 3 + 1];
  const az = p[i * 3 + 2];
  const bx = p[i * 3 + 3] - ax;
  const by = p[i * 3 + 4] - ay;
  const bz = p[i * 3 + 5] - az;
  const cx = p[i * 3 + 6] - ax;
  const cy = p[i * 3 + 7] - ay;
  const cz = p[i * 3 + 8] - az;
  const nx = by * cz - bz * cy;
  const ny = bz * cx - bx * cz;
  const nz = bx * cy - by * cx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9) return lambert(0, 1, 0);
  return lambert(nx / l, ny / l, nz / l);
}

/** The meshes the field bends: everything on the sprung body that is
 * painted, lit, or bolted on — and the cabin, which is inside the shell and
 * has to come down with the roof. Only meshes sat at the chassis's own
 * origin qualify: a part on a mount of its own (the steering wheel) holds
 * its vertices in the mount's frame, and the field would read them as a
 * point at the middle of the car. */
function bendable(body: CarBodyParts): Map<THREE.Mesh, Crumpleable> {
  const meshes: THREE.Mesh[] = [body.body];
  if (body.lenses) meshes.push(body.lenses);
  if (body.boltOns) meshes.push(body.boltOns);
  for (const mesh of Object.values(body.breakables)) meshes.push(mesh);
  if (body.cabinTrim) {
    for (const child of body.cabinTrim.children) {
      if (!(child instanceof THREE.Mesh) || !child.geometry.getAttribute("color")) continue;
      if (child.position.lengthSq() > 0 || !child.quaternion.equals(IDENTITY)) continue;
      meshes.push(child);
    }
  }
  return new Map(meshes.map((mesh) => [mesh, crumpleable(mesh)]));
}

const IDENTITY = new THREE.Quaternion();

const GLASS_PANES: readonly GlassPane[] = ["glassF", "glassB", "glassL", "glassR"];

function isGlass(part: DamagePart): part is GlassPane {
  return (GLASS_PANES as readonly string[]).includes(part);
}

export function createCarDamage(body: CarBodyParts): CarDamageVisual {
  const panels = bendable(body);
  const glassCol = body.glassMesh
    ? (body.glassMesh.geometry.getAttribute("color") as THREE.BufferAttribute)
    : null;
  const spec = body.spec;
  const frame: CrumpleFrame = {
    rim: rimOf((panels.get(body.body) as Crumpleable).restPos),
    halfWidth: Math.max(...spec.profile.map((p) => p.half)),
    floorY: spec.floorY,
    beltY: spec.beltY,
    roofY: spec.cabin.roofY,
    noseZ: spec.profile[0].z,
    tailZ: spec.profile[spec.profile.length - 1].z,
  };

  const debris = new THREE.Group();
  const flying: TumbleBody[] = [];
  /** The wheels off this car, still moving. */
  const rolling: LooseWheel[] = [];
  let wheelsRoll = true;
  /** Whether the ledger has been read once: a car BUILT with damage in its
   * ledger — a rival that lost a wheel out of sight — wears it from the
   * first frame, and throws nothing (`breakOff`'s `thrown`). */
  let caughtUp = false;
  const detached = new Set<DamagePart>();
  const pose: CarPose = { roll: 0, pitch: 0, drop: 0 };
  let bentVersion = -1;
  let sinceBend = BEND_EVERY;
  const halfWidth = widest(body);
  const hubY = body.wheelRadius * HUB_SHARE;
  let hubGeo: THREE.BufferGeometry | null = null;
  const bent = { x: 0, y: 0, z: 0 };
  const folded = new Float32Array(3);

  /** One mesh's worth of that: every triangle bent, lit again, scuffed. */
  const bendPanel = (
    { pos, col, restPos, paint }: Crumpleable,
    damage: GameState["car"]["damage"],
  ): void => {
    const holes = body.doors.filter((door) => damage.broken.includes(door.part));
    const out = pos.array as Float32Array;
    for (let i = 0; i + 2 < pos.count; i += 3) {
      for (let v = 0; v < 3; v++) {
        const j = i + v;
        folded[v] = crumple(
          damage,
          frame,
          restPos[j * 3],
          restPos[j * 3 + 1],
          restPos[j * 3 + 2],
          bent,
        );
        out[j * 3] = bent.x;
        out[j * 3 + 1] = bent.y;
        out[j * 3 + 2] = bent.z;
      }
      const light = faceLight(out, i);
      for (let v = 0; v < 3; v++) {
        const j = i + v;
        const x0 = restPos[j * 3];
        const y0 = restPos[j * 3 + 1];
        const z0 = restPos[j * 3 + 2];
        // Scuff: folded metal loses its paint toward primer-dark, unevenly,
        // and in patches loses it altogether.
        const mark = Math.min(1, folded[v] / SCUFF_OVER);
        const grain = 1 - SCUFF_GRAIN + SCUFF_GRAIN * (0.5 + 0.5 * noise(x0 * 6, y0 * 6, z0 * 6));
        const keep = 1 - (1 - SCUFF) * mark * grain;
        const chip =
          mark *
          smoothstep(0.25, 0.7, noise(x0 / CHIP_SCALE + 5.1, y0 / CHIP_SCALE, z0 / CHIP_SCALE));
        let cr = (paint[j * 3] * keep * (1 - chip) + PRIMER.r * chip) * light;
        let cg = (paint[j * 3 + 1] * keep * (1 - chip) + PRIMER.g * chip) * light;
        let cb = (paint[j * 3 + 2] * keep * (1 - chip) + PRIMER.b * chip) * light;
        // The hole where a door was: everything on that flank inside the
        // door's rectangle — the shell and whatever stripe was painted over
        // it — is the dark of the cabin now.
        for (const hole of holes) {
          if (
            hole.side * x0 > halfWidth * HOLE_REACH &&
            z0 <= hole.zFrom &&
            z0 >= hole.zTo &&
            y0 >= hole.yFrom &&
            y0 <= hole.yTo
          ) {
            cr = HOLE.r;
            cg = HOLE.g;
            cb = HOLE.b;
          }
        }
        col.setXYZ(j, cr, cg, cb);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  };

  /** A wheel as its ledger says it is: round, flat and bent, or gone. The
   * groups are the unsprung mass — car-mesh.ts steers and spins them and
   * leaves their lean, their squash and their height to this. */
  const bendWheels = (damage: GameState["car"]["damage"]): void => {
    const flatAt = TUNING.collision.chassis.wheelFlat;
    // How the body sits on what is left. Each corner's height is fitted to
    // a plane: the mean is the drop, the sides' difference the roll, the
    // ends' difference the pitch. The wheel groups know where the corners
    // are — x is the track, z the axle.
    const heights = [0, 0, 0, 0];
    for (let i = 0; i < body.wheelGroups.length; i++) {
      const wheel = body.wheelGroups[i];
      const side = i % 2 === 1 ? 1 : -1;
      if (detached.has(WHEEL_PARTS[i])) {
        wheel.scale.set(1, 1, 1);
        wheel.position.y = hubY;
        wheel.rotation.z = 0;
        wheel.rotation.y = 0;
        heights[i] = hubY - body.wheelRadius;
      } else if (damage.wheels[i] >= flatAt) {
        wheel.scale.set(1, FLAT_SQUASH, FLAT_SPREAD);
        wheel.position.y = body.wheelRadius * FLAT_SQUASH;
        wheel.rotation.z = side * BENT_CAMBER;
        wheel.rotation.y = side * BENT_TOE;
        heights[i] = body.wheelRadius * (FLAT_SQUASH - 1);
      } else {
        wheel.scale.set(1, 1, 1);
        wheel.position.y = body.wheelRadius;
        wheel.rotation.z = 0;
        wheel.rotation.y = 0;
      }
    }
    const [fl, fr, rl, rr] = heights;
    const track = Math.abs(body.wheelGroups[0]?.position.x ?? 0.8) * 2;
    const wheelbase = Math.abs(
      (body.wheelGroups[0]?.position.z ?? 1.2) - (body.wheelGroups[2]?.position.z ?? -1.2),
    );
    pose.drop = (fl + fr + rl + rr) / 4;
    pose.roll = track > 0 ? (fr + rr - fl - rl) / 2 / track : 0;
    pose.pitch = wheelbase > 0 ? (fl + fr - rl - rr) / 2 / wheelbase : 0;
  };

  /** Re-derive every vertex on the car from its pristine copy and the ledger. */
  const bend = (state: GameState): void => {
    const damage = state.car.damage;
    for (const panel of panels.values()) bendPanel(panel, damage);
    bendWheels(damage);
    bentVersion = damage.version;
    sinceBend = 0;
  };

  /** Send a mesh flying from where it stands on the car, at the car's own
   * speed, thrown up and out — and then the world has it: it falls onto the
   * ground under wherever it gets to, not onto a plane at the height the
   * car happened to be at when it tore off. */
  const throwOff = (
    mesh: THREE.Object3D,
    state: GameState,
    rest: number,
    flat: "x" | "y" | "z" | null = null,
  ): void => {
    // attach() keeps the world transform while re-parenting into the
    // world-anchored debris group — the piece separates mid-motion.
    debris.attach(mesh);
    const c = state.car;
    const sinH = Math.sin(c.heading);
    const cosH = Math.cos(c.heading);
    flying.push(
      tumbleFrom(
        mesh,
        new THREE.Vector3(
          (sinH * c.u + cosH * c.w) * 0.8 + (Math.random() - 0.5) * 3,
          2.5 + Math.random() * 3,
          (cosH * c.u - sinH * c.w) * 0.8 + (Math.random() - 0.5) * 3,
        ),
        new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 14,
        ),
        rest,
        false,
        flat,
      ),
    );
  };

  /** A pane out of its frame: its triangles go to alpha zero and stay
   * there, and the film the wipers were keeping over it goes with it. */
  const shatter = (pane: GlassPane): void => {
    if (glassCol) {
      for (const { start, count } of body.panes[pane]) {
        for (let i = start; i < start + count; i++) glassCol.setW(i, 0);
      }
      glassCol.needsUpdate = true;
    }
    body.wipers.shatter(pane);
  };

  /** A wheel off the car: what is left at the corner is the hub it was
   * bolted to, and the wheel itself leaves as a body of its own — a copy
   * of the mesh on the hub, let go at the corner's speed with the tread's
   * spin, from here on the world's (loose-wheel.ts). `thrown` false leaves
   * only the hub. */
  const loseWheel = (index: number, state: GameState, thrown: boolean): void => {
    const wheel = body.wheelGroups[index];
    const spin = body.wheelSpin[index] as THREE.Mesh;
    if (thrown && wheelsRoll) {
      const loose = new THREE.Mesh(spin.geometry, spin.material);
      wheel.add(loose);
      loose.position.copy(spin.position);
      loose.rotation.copy(spin.rotation);
      // attach() keeps the world transform while re-parenting into the
      // world-anchored debris group — the wheel separates mid-motion, and
      // its own X in the world is the axle it was turning on.
      debris.attach(loose);
      const axle = new THREE.Vector3(1, 0, 0).applyQuaternion(loose.quaternion);
      const corner = { fwd: wheel.position.z, right: wheel.position.x };
      const start = throwWheel(state.car, corner, axle, spec.wheelRadius, WHEEL_KICK);
      rolling.push(looseWheel(loose, start.vel, start.spin, spec.wheelRadius, spec.wheelWidth / 2));
    }
    spin.visible = false;
    if (!hubGeo) {
      hubGeo = new THREE.CylinderGeometry(hubY * 0.9, hubY * 0.9, 0.12, 10).rotateZ(Math.PI / 2);
    }
    const hub = new THREE.Mesh(hubGeo, new THREE.MeshBasicMaterial({ color: 0x2a2d33 }));
    hub.name = "hub";
    wheel.add(hub);
  };

  /** Tear a part off the body and hand it to the world to tumble — or,
   * with `thrown` false, take it off the body and throw nothing: the car
   * was built with the part already gone. */
  const breakOff = (part: DamagePart, state: GameState, thrown = true): void => {
    if (detached.has(part)) return;
    const wheel = WHEEL_PARTS.indexOf(part);
    if (wheel >= 0) {
      detached.add(part);
      loseWheel(wheel, state, thrown);
      bentVersion = -1;
      return;
    }
    if (isGlass(part)) {
      detached.add(part);
      shatter(part);
      return;
    }
    const mesh = body.breakables[part];
    // A part with nothing of its own to throw — a smashed lamp is glass
    // that the crumple has already scuffed dark, and the bloom over it is
    // car-mesh.ts's to switch off — is booked and nothing more.
    detached.add(part);
    if (!mesh) return;
    // The bolt-ons stop being one thing the moment one of them stops being
    // bolted on: until here they are drawn as a single mesh (car-body.ts),
    // and this is the frame that hands each of them back its own.
    body.unbolt();
    // A part is modelled where it sits on the car, around the car's own
    // origin — and a loose piece has to turn about ITSELF. So its vertices
    // are moved onto its centre and the mesh is stood where they were, in
    // the shape the ledger had already folded it into: from here on it is
    // the world's, and no longer re-derived from its pristine copy.
    panels.delete(mesh);
    if (!thrown) {
      mesh.removeFromParent();
      if (part === "doorL" || part === "doorR") bentVersion = -1;
      return;
    }
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox as THREE.Box3;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    geo.translate(-centre.x, -centre.y, -centre.z);
    mesh.position.copy(centre);
    const rest = Math.min(size.x, size.y, size.z) / 2 + DEBRIS_REST;
    throwOff(mesh, state, rest, PANEL_FACE[part] ?? null);
    // A door leaves a hole that is painted into the flank: re-bend.
    if (part === "doorL" || part === "doorR") bentVersion = -1;
  };

  const onEvents = (state: GameState, events: GameEvent[]): void => {
    for (const ev of events) {
      if (ev.type === "partBreak") breakOff(ev.part, state);
    }
  };

  const update = (state: GameState, dt: number): void => {
    // Events can only be missed across a rebuild; the ledger cannot —
    // anything it says is broken and still bolted on comes off now. On
    // the first read it comes off without flying: whatever tore it off
    // happened before this body existed.
    for (const part of state.car.damage.broken) breakOff(part, state, caughtUp);
    caughtUp = true;
    sinceBend += dt;
    if (state.car.damage.version !== bentVersion && sinceBend >= BEND_EVERY) bend(state);

    // A bent rim wobbles as it turns: once per turn, either way.
    const flatAt = TUNING.collision.chassis.wheelFlat;
    for (let i = 0; i < body.wheelGroups.length; i++) {
      if (detached.has(WHEEL_PARTS[i]) || state.car.damage.wheels[i] < flatAt) continue;
      const side = i % 2 === 1 ? 1 : -1;
      body.wheelGroups[i].rotation.z =
        side * BENT_CAMBER + BENT_WOBBLE * Math.sin(body.wheelSpin[i].rotation.x);
    }

    // A piece that has come to rest is scenery the run drove past: it keeps
    // lying where it landed, and costs nothing to leave there.
    const ground = state.terrain.groundAt;
    for (let i = flying.length - 1; i >= 0; i--) {
      if (!stepTumble(flying[i], dt, ground)) flying.splice(i, 1);
    }
    // The wheels are bodies: they meet the ground, the car they came off
    // and whatever stands in the way, and the ones that have stopped are
    // scenery like everything else.
    for (let i = rolling.length - 1; i >= 0; i--) {
      if (!stepLooseWheel(rolling[i], dt, ground, state.car, state.terrain)) rolling.splice(i, 1);
    }
  };

  const setLooseWheels = (on: boolean): void => {
    wheelsRoll = on;
  };

  const dispose = (): void => {
    for (const d of flying) debris.remove(d.object);
    flying.length = 0;
    for (const w of rolling) debris.remove(w.object);
    rolling.length = 0;
    hubGeo?.dispose();
    for (const wheel of body.wheelGroups) {
      const hub = wheel.getObjectByName("hub") as THREE.Mesh | undefined;
      if (hub) (hub.material as THREE.Material).dispose();
    }
  };

  return { debris, pose, update, onEvents, setLooseWheels, dispose };
}

function smoothstep(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/** The body's widest half, m, read off the wheels — the flank sits about
 * a tyre's width inside them — so the door hole's inboard limit is a share
 * of THIS car's width rather than a number written for one of them. */
function widest(body: CarBodyParts): number {
  let x = 0;
  for (const wheel of body.wheelGroups) x = Math.max(x, Math.abs(wheel.position.x));
  return x > 0 ? x : 0.8;
}

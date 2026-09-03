// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The damage made visible: the engine's crush ledger (state.car.damage)
// bent into the body's actual polygons, and its partBreak events turned
// into pieces tumbling off down the road. The body mesh keeps a pristine
// copy of its vertices; whenever the ledger's version moves, every vertex
// is re-derived from that copy — pulled inward by the crush of the zone it
// faces, torn about by a deterministic per-vertex crumple, sagged by the
// underside's belly crush, caved from above by the roof's, and scuffed
// darker where the metal folded. The
// engine owns every number here; this module only draws what it says.
//
// The LENSES bend on the same terms, out of the same routine. They are a
// separate mesh only because a lamp is lit rather than painted (car-body.ts),
// and they sit exactly where a nose or a tail gets crushed — left pristine,
// a lamp would stand out in front of a folded cap as the one undamaged
// thing on the car. The scuff darkens them too, which is a smashed lamp.
//
// Three more things the ledger says, drawn here because they are the body
// coming apart rather than something thrown off it: the WHEELS, which go
// flat and bent on their own ledger and then come off (the corner drops
// onto its hub, and the whole car sits crooked from then on — `pose`); the
// GLASS, which shatters out of its frame rather than flying (its slice of
// the glass buffer goes to alpha zero, and the grime film over it with it);
// and the DOORS, which fly like any other part and leave the cabin open
// behind them (the flank inside the door's rectangle is painted into the
// hole, stripes and all).

import * as THREE from "three";
import {
  DAMAGE_ZONES,
  TUNING,
  WHEEL_PARTS,
  type DamagePart,
  type GameEvent,
  type GameState,
} from "@engine";

import type { CarBodyParts, GlassPane } from "./car-body.ts";
import { stepTumble, tumbleFrom, type TumbleBody } from "./tumble.ts";

/** Crumple hash — any cheap deterministic per-vertex jitter works; the
 * shape only has to look torn, not be reproducible across sessions. */
function jitter(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** How far in from the rim a vertex still crumples (fraction of its radial
 * distance kept as reach) — the centerline never moves, so the cabin keeps
 * its volume however hard the panels fold. */
const REACH_START = 0.2;
/** How far the fold reaches at full crush, as a multiple of the ledger's
 * metres: a head-on at 100 km/h writes a quarter of a metre down, and the
 * nose it leaves has to read as HALF A METRE shorter and a wreck, not as a
 * bumper pushed in — the front of a car that has hit something square is
 * the part that no longer exists. */
const FOLD = 1.6;
/** The crumple's spread about that fold, 0..1 of it: adjacent vertices
 * pulled in by different amounts is what makes a fold look torn rather
 * than scaled. */
const CRUMPLE = 0.7;
/** How far the metal is thrown sideways and up as it folds, as a multiple
 * of the fold: a panel does not slide in along a line, it buckles. */
const WARP = 0.55;
/** Scuffed metal darkens toward this fraction of its paint... */
const SCUFF = 0.45;
/** ...over this much crush, m — the first bad hit takes the paint off. */
const SCUFF_OVER = 0.2;
/** The body sits this much lower per meter of belly crush (shot springs). */
const BELLY_SAG = 0.6;
/** THE CAVED ROOF. Where the greenhouse starts, m above the wheel plane —
 * the waist line, under which nothing a roll folds from above reaches... */
const ROOF_FROM = 0.7;
/** ...and how far above it the fold is at its full depth, m: the roof
 * panel itself. Between the two the pillars take a share of it, which is
 * what makes the cabin lean rather than telescope. */
const ROOF_SPAN = 0.65;
/** How far the deck comes down per meter of roof crush — more than one, as
 * the belly's sag is less: the ledger measures the fold, and a roof folding
 * takes the pillars under it with it. */
const ROOF_FOLD = 1.3;
/** ...and how far in, as a share of that: a roof does not come straight
 * down, it goes over to the side the car was turning onto. */
const ROOF_LEAN = 0.45;
/** What the cabin behind a missing door is painted: the dark of a room
 * seen from outside. */
const HOLE = new THREE.Color(0x0d1013);
/** How far in from the flank a vertex still counts as the door's, as a
 * fraction of the body's widest half — the underbody and the floor are
 * inboard of this and stay whatever colour they were. */
const HOLE_REACH = 0.55;

/** How far a torn-off piece's own origin ends up sitting over the ground —
 * the body's parts are modelled around their mounting point, not around the
 * face that ends up lying in the dirt. */
const DEBRIS_REST = 0.08;
/** ...and a wheel's, which lies on its side with its own half-width up. */
const WHEEL_REST = 0.1;

/** THE FLAT. A tyre with no air in it is this much of its height... */
const FLAT_SQUASH = 0.78;
/** ...leaning this far in at the top, rad — the rim is bent with it... */
const BENT_CAMBER = 0.16;
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
  dispose: () => void;
};

/** One mesh's vertices, plus the pristine copy every bend is re-derived
 * from — the shell and the lenses each get one, and `bend` walks them all. */
type Crumpleable = {
  pos: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  restPos: Float32Array;
  restCol: Float32Array;
};

function crumpleable(mesh: THREE.Mesh): Crumpleable {
  const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const col = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
  return {
    pos,
    col,
    restPos: new Float32Array(pos.array as Float32Array),
    restCol: new Float32Array(col.array as Float32Array),
  };
}

const GLASS_PANES: readonly GlassPane[] = ["glassF", "glassB", "glassL", "glassR"];

function isGlass(part: DamagePart): part is GlassPane {
  return (GLASS_PANES as readonly string[]).includes(part);
}

export function createCarDamage(body: CarBodyParts): CarDamageVisual {
  const panels = [crumpleable(body.body)];
  if (body.lenses) panels.push(crumpleable(body.lenses));
  const glassCol = body.glassMesh
    ? (body.glassMesh.geometry.getAttribute("color") as THREE.BufferAttribute)
    : null;

  const debris = new THREE.Group();
  const flying: TumbleBody[] = [];
  const detached = new Set<DamagePart>();
  const pose: CarPose = { roll: 0, pitch: 0, drop: 0 };
  let bentVersion = -1;
  const halfWidth = widest(body);
  const hubY = body.wheelRadius * HUB_SHARE;
  let hubGeo: THREE.BufferGeometry | null = null;

  /** One mesh's worth of that. */
  const bendPanel = (
    { pos, col, restPos, restCol }: Crumpleable,
    damage: GameState["car"]["damage"],
    span: number,
  ): void => {
    const zones = damage.zones;
    const holes = body.doors.filter((door) => damage.broken.includes(door.part));
    for (let i = 0; i < pos.count; i++) {
      const x0 = restPos[i * 3];
      const y0 = restPos[i * 3 + 1];
      const z0 = restPos[i * 3 + 2];
      // Ring crush at this vertex's bearing, blended between the two
      // nearest zones so the folds wrap the corners instead of stepping.
      const a = Math.atan2(x0, z0);
      const t = a / span;
      const lo = Math.floor(t);
      const frac = t - lo;
      const zoneA = ((lo % DAMAGE_ZONES) + DAMAGE_ZONES) % DAMAGE_ZONES;
      const zoneB = (zoneA + 1) % DAMAGE_ZONES;
      const crush = zones[zoneA] * (1 - frac) + zones[zoneB] * frac;

      const r = Math.hypot(x0, z0);
      const reach = Math.min(1, Math.max(0, (r - REACH_START) / 1.0));
      const fold = crush * FOLD * reach;
      const crumple = 1 - CRUMPLE / 2 + CRUMPLE * jitter(i);
      const inward = Math.min(fold * crumple, r * 0.8);
      const scale = r > 1e-6 ? 1 - inward / r : 1;
      // The buckle: the metal that is not going inward is going somewhere,
      // and it goes up and across — a different somewhere per vertex.
      const warp = fold * WARP;
      const up = warp * (jitter(i * 3 + 1) - 0.5);
      const across = warp * (jitter(i * 5 + 2) - 0.5);
      // Across the fold's own direction, in the ground plane.
      const tx = r > 1e-6 ? z0 / r : 0;
      const tz = r > 1e-6 ? -x0 / r : 0;

      // Belly: the whole body settles on its shot springs, and the low
      // panels wrinkle — a beaten floorpan reads in the rocker line.
      const low = Math.max(0, 1 - y0 / 1.1);
      const sag = damage.belly * BELLY_SAG * low;
      const wrinkle = damage.belly * low * (jitter(i * 7 + 3) - 0.5) * 0.5;

      // Roof: the mirror of it, and the one fold a car cannot get without
      // having been upside down. Only the greenhouse moves — the deck comes
      // down and goes over, the pillars under it take a share, and the
      // waist and everything below it stay where they were.
      const high = Math.min(1, Math.max(0, (y0 - ROOF_FROM) / ROOF_SPAN));
      const cave = damage.roof * ROOF_FOLD * high * (1 - CRUMPLE / 2 + CRUMPLE * jitter(i * 11));
      const lean = cave * ROOF_LEAN;

      pos.setXYZ(
        i,
        x0 * scale + wrinkle + tx * across + lean,
        Math.max(0.05, y0 - sag - cave + up),
        z0 * scale + wrinkle + tz * across,
      );

      // Scuff: folded metal loses its paint toward primer-dark.
      const mark = Math.min(1, (crush + damage.belly * low + damage.roof * high) / SCUFF_OVER);
      const keep = 1 - (1 - SCUFF) * mark;
      let cr = restCol[i * 3] * keep;
      let cg = restCol[i * 3 + 1] * keep;
      let cb = restCol[i * 3 + 2] * keep;
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
      col.setXYZ(i, cr, cg, cb);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  };

  /** A wheel as its ledger says it is: round, flat and bent, or gone. The
   * groups are the unsprung mass — car-mesh.ts steers and spins them and
   * leaves their lean, their squash and their height to this. */
  const bendWheels = (damage: GameState["car"]["damage"]): void => {
    const flatAt = TUNING.collision.chassis.wheelFlat;
    for (let i = 0; i < body.wheelGroups.length; i++) {
      const wheel = body.wheelGroups[i];
      const side = i % 2 === 1 ? 1 : -1;
      if (detached.has(WHEEL_PARTS[i])) {
        wheel.scale.y = 1;
        wheel.position.y = hubY;
        wheel.rotation.z = 0;
      } else if (damage.wheels[i] >= flatAt) {
        wheel.scale.y = FLAT_SQUASH;
        wheel.position.y = body.wheelRadius * FLAT_SQUASH;
        wheel.rotation.z = side * BENT_CAMBER;
      } else {
        wheel.scale.y = 1;
        wheel.position.y = body.wheelRadius;
        wheel.rotation.z = 0;
      }
    }
    // How the body sits on what is left. Each corner's height is fitted to
    // a plane: the mean is the drop, the sides' difference the roll, the
    // ends' difference the pitch. The wheel groups know where the corners
    // are — x is the track, z the axle.
    let sum = 0;
    let right = 0;
    let left = 0;
    let front = 0;
    let rear = 0;
    const drop = -(body.wheelRadius - hubY);
    for (let i = 0; i < body.wheelGroups.length; i++) {
      const h = detached.has(WHEEL_PARTS[i]) ? drop : 0;
      sum += h;
      if (i % 2 === 1) right += h;
      else left += h;
      if (i < 2) front += h;
      else rear += h;
    }
    const track = Math.abs(body.wheelGroups[0]?.position.x ?? 0.8) * 2;
    const wheelbase = Math.abs(
      (body.wheelGroups[0]?.position.z ?? 1.2) - (body.wheelGroups[2]?.position.z ?? -1.2),
    );
    pose.drop = sum / 4;
    pose.roll = track > 0 ? (right - left) / 2 / track : 0;
    pose.pitch = wheelbase > 0 ? (front - rear) / 2 / wheelbase : 0;
  };

  /** Re-derive every body vertex from its pristine copy and the ledger. */
  const bend = (state: GameState): void => {
    const damage = state.car.damage;
    const span = (Math.PI * 2) / DAMAGE_ZONES;
    for (const panel of panels) bendPanel(panel, damage, span);
    bendWheels(damage);
    bentVersion = damage.version;
  };

  /** Send a mesh flying from where it stands on the car, at the car's own
   * speed, thrown up and out — and then the world has it: it falls onto the
   * ground under wherever it gets to, not onto a plane at the height the
   * car happened to be at when it tore off. */
  const throwOff = (mesh: THREE.Object3D, state: GameState, rest: number): void => {
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

  /** A wheel off the car: the one on the hub goes flying as a copy of
   * itself, and what is left at the corner is the hub it was bolted to. */
  const loseWheel = (index: number, state: GameState): void => {
    const wheel = body.wheelGroups[index];
    const spin = body.wheelSpin[index] as THREE.Mesh;
    const loose = new THREE.Mesh(spin.geometry, spin.material);
    wheel.add(loose);
    loose.position.copy(spin.position);
    loose.rotation.copy(spin.rotation);
    throwOff(loose, state, WHEEL_REST);
    spin.visible = false;
    if (!hubGeo) {
      hubGeo = new THREE.CylinderGeometry(hubY * 0.9, hubY * 0.9, 0.12, 10).rotateZ(Math.PI / 2);
    }
    const hub = new THREE.Mesh(hubGeo, new THREE.MeshBasicMaterial({ color: 0x2a2d33 }));
    hub.name = "hub";
    wheel.add(hub);
  };

  /** Tear a part off the body and hand it to the world to tumble. */
  const breakOff = (part: DamagePart, state: GameState): void => {
    if (detached.has(part)) return;
    const wheel = WHEEL_PARTS.indexOf(part);
    if (wheel >= 0) {
      detached.add(part);
      loseWheel(wheel, state);
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
    throwOff(mesh, state, DEBRIS_REST);
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
    // anything it says is broken and still bolted on comes off now.
    for (const part of state.car.damage.broken) breakOff(part, state);
    if (state.car.damage.version !== bentVersion) bend(state);

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
  };

  const dispose = (): void => {
    for (const d of flying) debris.remove(d.object);
    flying.length = 0;
    hubGeo?.dispose();
    for (const wheel of body.wheelGroups) {
      const hub = wheel.getObjectByName("hub") as THREE.Mesh | undefined;
      if (hub) (hub.material as THREE.Material).dispose();
    }
  };

  return { debris, pose, update, onEvents, dispose };
}

/** The body's widest half, m, read off the wheels — the flank sits about
 * a tyre's width inside them — so the door hole's inboard limit is a share
 * of THIS car's width rather than a number written for one of them. */
function widest(body: CarBodyParts): number {
  let x = 0;
  for (const wheel of body.wheelGroups) x = Math.max(x, Math.abs(wheel.position.x));
  return x > 0 ? x : 0.8;
}

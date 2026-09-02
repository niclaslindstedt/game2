// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car in the scene: a body generated part-by-part from the car's
// CarBodySpec (car-body.ts builds it, car-styles.ts shapes it), plus the
// one visual that sells the jump — a blob shadow that stays on the ground
// and shrinks while the car is airborne. The engine owns everything about
// how the car sits: position, heading, and both attitude angles; this file
// only spends them on the right three.js axes.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { CarSpec, GameEvent, GameState } from "@engine";

import {
  backlightNormal,
  buildCarBody,
  cockpitWheelTurn,
  dialAngle,
  frontLampAnchors,
  rearLampAnchors,
  steeringTurn,
  DIAL_TOP_SPEED,
  GLASS_OPACITY,
  INSTRUMENT_MATERIAL,
  LENS_MATERIAL,
  type FilmDetail,
  type InteriorDetail,
} from "./car-body.ts";
import type { CrewLook } from "./car-crew.ts";
import { createCarDamage } from "./car-damage.ts";
import { createCarDirt, groundTravel, wheelSpray } from "./car-dirt.ts";
import type { Livery } from "./car-livery.ts";
import { revTremble, trembleAt } from "./car-shake.ts";
import type { ScreenRain } from "./car/screen-rain.ts";
import { bodySpecFor } from "./car-styles.ts";
import { drivenAxles, wheelSurfaceSpeed } from "./car-wheels.ts";
import { glowTexture } from "./textures.ts";

/** A lamp's own light: a bloom laid over each cluster so the lamp reads as
 * SWITCHED ON rather than as a coloured panel. The car is fullbright and
 * takes the time of day as a tint (renderer.ts), which is right for paint and
 * wrong for a lamp — a lamp is the one thing on the body that gets brighter
 * as the light goes, not darker. Additive over the lens, and exempt from the
 * tint by name, so the failing light cannot bleach the red out of it.
 *
 * The bloom is only half of it: the lens GEOMETRY behind it (car/lamps.ts)
 * is a reflector bowl with a hot spot on its floor, carrying its own
 * material for the same reason. The bloom is the light escaping the lamp;
 * the bowl is the lamp. Neither alone reads as lit. */
const LAMP_GLOW = 0xff2a14;
/** ...and the warm white at the other end. A headlamp is pointed AWAY from
 * the chase camera, so what shows is spill around the rim rather than the
 * beam — which is why it is a paler, tighter bloom than the tail's. */
const HEAD_GLOW = 0xffe6b4;
/** The name that exempts it — matched in the renderer's `applyTint`. */
export const LAMP_MATERIAL = "car-lamp";
/** How far the bloom spreads past the lens, as a multiple of the lens size. */
const LAMP_SPREAD = 3.4;
const HEAD_SPREAD = 2.6;
/** Bloom strength with the lights off (daylight) and on (dusk, night). A
 * tail lamp is a marker, not a headlight pointed at the player: at the few
 * car lengths a chase is fought over, a bloom that reads as a lamp from a
 * hundred metres is a red smear over the whole tail up close. */
const LAMP_DAY = 0.11;
const LAMP_NIGHT = 0.55;
/** The headlamps' pair. Nothing in daylight — a switched-off headlight is
 * glass, and a lit one competing with the sun is a car with its dipped
 * beams on, which nobody can see from behind either. */
const HEAD_DAY = 0;
const HEAD_NIGHT = 0.5;
/** How much of the bloom a fully caked lens swallows, 0..1. A stage's worth
 * of gravel on the glass is the reason rally cars carry lamp pods and
 * somebody wipes them at every service. */
const LAMP_GRIME = 0.6;
/** What the lenses keep of the world's light when the lamps are OFF. Their
 * material is driven instead of tinted, so this is the whole of what dusk
 * does to a dark lamp: enough to sit in the failing light with the paint
 * around it, and never so little that the glass goes to mud. Lit, they go
 * to full — the authored colour, whatever the stage is doing. */
const LENS_DARK = 0.42;
/** Full brightness, as the lerp target for the above and the colour a lit
 * lens is multiplied by — the authored vertex colours, untouched. */
const WHITE = new THREE.Color(1, 1, 1);

/** The glass, per frame. `GLINT` is how much opacity a fully glancing view
 * adds to a clean pane — the baked sky at the top of every window is already
 * there, and raising the pane's opacity is what brings it forward over the
 * cabin behind it, so a car thrown sideways flares along its whole
 * greenhouse. `GRIME` is the same number for filth: a screen nobody has
 * wiped stops being something you can see a crew through. `CEILING` keeps
 * both short of solid, because a window that closes completely is a panel. */
const GLASS = { glint: 0.26, grime: 0.24, ceiling: 0.94, falloff: 3 };

/** What the glass keeps of that when the camera is INSIDE the car. Every
 * number above is authored for a pane read from outside — a baked sky
 * gradient brought forward by the angle and the filth on it — and from the
 * driver's seat the same pane is a wash of pale blue over the top half of
 * the road. A windscreen looked THROUGH is nearly clear, and the little that
 * is left is what keeps the window from reading as an empty hole. */
const GLASS_INSIDE = 0.25;

/** WHAT THE CABIN KEEPS OF THE WORLD'S LIGHT, by day and once the lamps are
 * on. A closed box gets no sun: even in daylight the room around the driver
 * is a clear step darker than the paint outside it, which is most of what
 * makes the road through the windscreen read as bright. At night it goes to
 * almost nothing — a rally car's cabin is unlit, and the two instruments are
 * the only things in it that are not. Those keep their authored colours
 * whatever the sky is doing (INSTRUMENT_MATERIAL is exempted from the tint
 * the same way a lamp is), so the darker the stage the more they are the
 * only thing there is to see. */
const CABIN_LIGHT = { day: 0.78, night: 0.16 };

/** Where a car with no authored lamps at one end throws its beam from, m
 * from the centerline — a spec is allowed to have a bare face, and a beam
 * still has to come from somewhere sensible. */
const LAMP_FALLBACK = 0.6;

/** Front-wheel visual steer: radians of wheel angle at full lock... */
const WHEEL_STEER_LOCK = 0.55;
/** ...hard-clamped here, rad — past this the wheels read as broken. */
const WHEEL_STEER_MAX = 0.7;
/** How fast the drawn wheels chase the input, 1/s — quick enough to read
 * as the driver's hands, slow enough not to strobe on per-step input. */
const WHEEL_STEER_RATE = 14;

export type CarVisual = {
  group: THREE.Group;
  /** The first-person cabin, when this car was built with one. Handed out
   * for the same reason the cabin is: the rear-view mirror looks back from
   * between the seats, and a fascia in the way answers nothing. Null on
   * every car but the player's. */
  cockpit: THREE.Object3D | null;
  /** The cabin and the glass over it. Handed out for one reason: the
   * rear-view mirror's lens sits between this car's own seats, so the mirror
   * pass has to take both out first or it draws the back of the bulkhead
   * through the inside of the rear screen instead of the road
   * (renderer.ts). */
  cabin: THREE.Object3D;
  /** THE WATER ON THE WINDSCREEN (car/screen-rain.ts). Handed out because
   * it is the one thing on a car the renderer has to DRAW itself: the drops
   * refract the frame, so they go on after the frame is made, in a pass of
   * their own. The car drives everything else about it from `update`. Null
   * on every car but the player's, and on that one when the video options
   * have asked for clean screens. */
  screenRain: ScreenRain | null;
  /** The blob shadow, in its own group so it can lie on the ground's slope
   * while the car above it pitches, rolls and flies. */
  shadow: THREE.Group;
  /** World-anchored debris (torn-off parts) — scene sibling of the car. */
  debris: THREE.Group;
  /** `eye` is where the camera is standing, in world metres — what decides
   * how hard the glass catches the light this frame. Left off, the pane
   * keeps whatever it had. */
  update: (state: GameState, dt: number, eye?: THREE.Vector3) => void;
  /** Whether the camera is sat INSIDE this car. It swaps the cabin the
   * player is looking at — the interior's furniture out, the cockpit in,
   * because from the driver's seat the two occupy the same space — and
   * thins the glass down to what a windscreen looked through actually is.
   * A no-op on a car built without a cockpit. */
  setInside: (inside: boolean) => void;
  /** Whether the rear view is live this frame — what puts a picture in the
   * cockpit mirror's pane rather than leaving it dark glass. */
  setRearView: (on: boolean) => void;
  onEvents: (state: GameState, events: GameEvent[]) => void;
  /** Whether the run's light is gone — the lamps burn harder when it is,
   * and their lenses stop taking the tint the paint takes. Pushed from the
   * environment, which owns both decisions, along with the tint itself so
   * an unlit lens can still sit in the light the rest of the car is in. */
  setLights: (on: boolean, tint?: THREE.Color) => void;
  /** How hard it is raining on this car, 0..1 — what wets its screens and
   * sets its wipers going. Pushed from the environment for the same reason
   * the light is: the weather is the stage's, not the car's. */
  setWet: (rain: number) => void;
  /** How filthy the car has got, 0..1 — the environment dims its beams by
   * it, because the dirt is on the glass too. */
  grime: () => number;
  /** How far off the centerline this car's lamps sit, m. The environment
   * hangs a beam on each one, so a wide car lights a wide road. */
  lampSpread: { front: number; rear: number };
  dispose: () => void;
};

/** How much of itself a ghost car shows, 0..1. Solid enough to hold its
 * shape and its tail lamps at the few car lengths a chase is actually
 * decided over, thin enough that the road runs visibly through it and it can
 * never be taken for a car that is there — a ghost is a picture: it runs its
 * own game, so there is nothing to touch and nothing to be hit by. */
const GHOST_OPACITY = 0.46;

export type CarOptions = {
  /** Build the car as a ghost: see-through, and dimmer where it glows. */
  ghost?: boolean;
  /** The rear view, for the pane in the cockpit mirror's glass. */
  rearView?: { texture: THREE.Texture; aspect: number };
  /** Also build the first-person cabin (car/cockpit.ts) — the player's car
   * only. Fifteen fascias nobody will ever sit behind is fifteen fascias. */
  cockpit?: boolean;
  /** How much cabin is built behind the glass — the player's VIDEO option.
   * Defaults to the full one; the field builds itself down a level, because
   * fifteen cabins is a different bill from one. */
  interior?: InteriorDetail;
  /** Repaint the body in one of the field's schemes (car-livery.ts) rather
   * than the livery car-styles.ts authored for it — how a car that is not
   * the player's is told apart from the player's. */
  paint?: Livery;
  /** The crew behind the glass (car-crew.ts). Defaults to the player's. */
  crew?: CrewLook;
  /** How finely the screens carry the grime film the wipers clear
   * (car/wipers.ts) — see `CarBodyOptions.screens`. Defaults to `fine`. */
  screens?: FilmDetail;
};

/** How far off the centerline this car's beams hang, front and rear. */
function lampSpread(bodySpec: Parameters<typeof frontLampAnchors>[0]): {
  front: number;
  rear: number;
} {
  const off = (anchors: { x: number }[]): number =>
    anchors.length > 0 ? Math.abs(anchors[0].x) : LAMP_FALLBACK;
  return { front: off(frontLampAnchors(bodySpec)), rear: off(rearLampAnchors(bodySpec)) };
}

/** Push the environment onto one body: its light, and how hard it is
 * raining on it. Everything on a car carries BAKED vertex colours on
 * fullbright materials, so the time of day arrives as a multiply into
 * `material.color` rather than as a light — except a LAMP, which is the one
 * thing the failing light makes brighter, and is therefore switched rather
 * than tinted. Both of a lamp's surfaces are exempted here: the bloom over
 * it, and the lens under that. `setLights` drives them from the same tint. */
export function tintCar(
  visual: CarVisual,
  tint: THREE.Color,
  lampsLit: boolean,
  rain: number,
): void {
  visual.group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Points)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      const painted = mat instanceof THREE.MeshBasicMaterial || mat instanceof THREE.PointsMaterial;
      // Three names are driven rather than tinted: the lamp bloom and its
      // lens, which get BRIGHTER as the light goes, and the cockpit's own
      // instruments, which do not answer to the sky at all. The cabin is
      // tinted here and then darkened again by `setLights`.
      const driven =
        mat.name === LAMP_MATERIAL ||
        mat.name === LENS_MATERIAL ||
        mat.name === INSTRUMENT_MATERIAL;
      if (painted && !driven) mat.color.copy(tint);
    }
  });
  visual.setLights(lampsLit, tint);
  visual.setWet(rain);
}

export function buildCar(spec: CarSpec, options: CarOptions = {}): CarVisual {
  const group = new THREE.Group();
  // Which wheels the engine can spin, and which ones only the road turns.
  const driven = drivenAxles(spec.drive);
  const bodySpec = bodySpecFor(spec, options.paint);
  const body = buildCarBody(bodySpec, {
    interior: options.interior,
    crew: options.crew,
    cockpit: options.cockpit,
    rearView: options.rearView,
    screens: options.screens,
  });
  // Panels, parts and wheels share one material, so a ghost is one flag.
  // Its own back faces still occlude its front ones (depth writing stays
  // on): a car you can see through is a ghost, a car you can see the
  // INSIDE of is a bag of polygons.
  const fade = options.ghost ? GHOST_OPACITY : 1;
  if (options.ghost) {
    const shell = body.body.material as THREE.MeshBasicMaterial;
    shell.transparent = true;
    shell.opacity = GHOST_OPACITY;
  }
  // The glass is already translucent, so a ghost's glass is a fade ON a
  // fade: whatever the pane works out to this frame, times the ghost's own.
  const glassMat = body.glass;
  const screen = backlightNormal(bodySpec);
  const view = new THREE.Vector3();
  group.add(body.group);
  const dirt = createCarDirt(body.group, wheelSpray(bodySpec));
  const damage = createCarDamage(body);

  // The lamp blooms ride the SPRUNG body, so they squat and rebound with the
  // panel they are stuck to instead of hovering where the tail used to be.
  // One material per END, because the two ends neither glow the same colour
  // nor come on together: a tail lamp is a marker that is faintly there in
  // daylight, a headlamp is nothing at all until the light goes.
  const lampMap = glowTexture();
  const bloomMat = (name: string, color: number, opacity: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      name,
      map: lampMap,
      color,
      transparent: true,
      opacity: opacity * fade,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  const lampMat = bloomMat(LAMP_MATERIAL, LAMP_GLOW, LAMP_DAY);
  const headMat = bloomMat(LAMP_MATERIAL, HEAD_GLOW, HEAD_DAY);
  const lampGeos: THREE.BufferGeometry[] = [];
  /** Hang the blooms for one END, as ONE mesh holding both quads. A plane
   * apiece is the obvious way to write this and costs a draw call per lamp:
   * with fifteen cars on a stage that is thirty draws for four triangles of
   * additive haze. `dir` is the cap's outward direction — the quads sit just
   * off the lenses and face the same way. */
  const hangBlooms = (
    anchors: ReturnType<typeof rearLampAnchors>,
    mat: THREE.MeshBasicMaterial,
    spread: number,
    dir: number,
  ): void => {
    if (anchors.length === 0) return;
    const pos: number[] = [];
    const uv: number[] = [];
    for (const lamp of anchors) {
      const w = (lamp.width * spread) / 2;
      const h = (lamp.height * spread * 1.5) / 2;
      const z = lamp.z + dir * 0.05;
      // Corners counter-clockwise seen from outside the cap: mirroring
      // across z reverses the winding, so the tail runs the cycle backwards.
      const corner = (u: number, v: number): number[] => [
        lamp.x + (u * 2 - 1) * w * dir,
        lamp.y + (v * 2 - 1) * h,
        z,
      ];
      const quad: [number, number][] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      for (const [a, b, c] of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        for (const i of [a, b, c]) {
          pos.push(...corner(quad[i][0], quad[i][1]));
          uv.push(quad[i][0], quad[i][1]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    body.chassis.add(new THREE.Mesh(geo, mat));
    lampGeos.push(geo);
  };
  hangBlooms(rearLampAnchors(bodySpec), lampMat, LAMP_SPREAD, -1);
  hangBlooms(frontLampAnchors(bodySpec), headMat, HEAD_SPREAD, 1);
  const lensMat = body.lens;
  if (lensMat && options.ghost) {
    lensMat.transparent = true;
    lensMat.opacity = GHOST_OPACITY;
  }
  let lit = false;
  const worldLight = new THREE.Color(1, 1, 1);
  const setLights = (on: boolean, tint?: THREE.Color): void => {
    lit = on;
    if (tint) worldLight.copy(tint);
  };
  let wet = 0;
  const setWet = (rain: number): void => {
    wet = clamp(rain, 0, 1);
  };
  /** The blooms, dimmed by whatever the run has thrown at the lenses — and
   * the lenses themselves, which are switched between the world's light and
   * their own rather than tinted along with the paint. */
  const shineLamps = (): void => {
    const clean = 1 - LAMP_GRIME * dirt.level();
    lampMat.opacity = (lit ? LAMP_NIGHT : LAMP_DAY) * clean * fade;
    headMat.opacity = (lit ? HEAD_NIGHT : HEAD_DAY) * clean * fade;
    if (lensMat) {
      if (lit) lensMat.color.setRGB(1, 1, 1);
      else lensMat.color.copy(worldLight).lerp(WHITE, LENS_DARK);
    }
    // The cabin: the world's light, taken down again by how much of it gets
    // into a closed box. `tintCar` has already put the raw tint on it.
    const cabinMat = body.cockpitMaterial;
    if (cabinMat) {
      cabinMat.color.copy(worldLight).multiplyScalar(lit ? CABIN_LIGHT.night : CABIN_LIGHT.day);
    }
  };

  const length = bodySpec.profile[0].z - bodySpec.profile[bodySpec.profile.length - 1].z;
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(length * 0.42, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.28 * fade }),
  );
  // Laid flat, then lifted along whatever "up" its parents end up meaning —
  // the clearance has to leave the GROUND, not the world's y axis, or the
  // disc knifes into a hillside and reads as a hole under the car.
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.06;
  // Same two-group nesting as the car itself, so the disc takes the same
  // heading-then-attitude chain and lands flush on the same triangle.
  const shadowTilt = new THREE.Group();
  shadowTilt.add(blob);
  const shadow = new THREE.Group();
  shadow.add(shadowTilt);

  let steerVisual = 0;
  // The ground's own attitude, held over a flight: in the air the car's
  // angles are the arc's and the tumble's, and the shadow belongs to the
  // ground the car left, not to the car.
  let groundPitch = 0;
  let groundRoll = 0;
  /** How much of itself the glass is showing this frame: its own baked
   * gradient, brought forward by the angle the eye is standing at and by
   * whatever the stage has caked on it. The angle is taken in the CAR's own
   * frame — the pane turns with the car, and a drift is exactly the moment
   * the two disagree. */
  const shineGlass = (state: GameState, eye?: THREE.Vector3): void => {
    if (!glassMat) return;
    let glint = 0;
    if (eye) {
      const dx = eye.x - state.car.x;
      const dz = eye.z - state.car.z;
      const h = -state.car.heading;
      view
        .set(
          dx * Math.cos(h) + dz * Math.sin(h),
          eye.y - state.car.y,
          -dx * Math.sin(h) + dz * Math.cos(h),
        )
        .normalize();
      glint = Math.pow(1 - Math.abs(view.dot(screen)), GLASS.falloff);
    }
    const want = GLASS_OPACITY + GLASS.glint * glint + GLASS.grime * dirt.level();
    glassMat.opacity = Math.min(want, GLASS.ceiling) * fade * (inside ? GLASS_INSIDE : 1);
  };

  /** Whether the lens is inside this car this frame — what the glass and
   * the two cabins are swapped by. */
  let inside = false;
  const setInside = (next: boolean): void => {
    if (!body.cockpit || inside === next) return;
    inside = next;
    body.cockpit.group.visible = next;
    if (body.cabinTrim) body.cabinTrim.visible = !next;
  };

  const setRearView = (on: boolean): void => {
    if (body.cockpit?.mirrorGlass) body.cockpit.mirrorGlass.visible = on;
  };

  const update = (state: GameState, dt: number, eye?: THREE.Vector3): void => {
    const car = state.car;
    group.position.set(car.x, car.y, car.z);
    group.rotation.y = car.heading;

    // Both attitude angles come off the engine already settled. In the car's
    // local frame +z is the nose and +x its right side, so a positive roll
    // (right side up) IS +z rotation, while a nose-up pitch is a NEGATIVE
    // rotation about +x — turning the nose down is the positive direction
    // there. A rally car still goes sideways FLAT: the roll is the camber
    // of the ground and the tumble of a flight, never a lean into the
    // slide, which reads through the yaw, the counter-steer and the dust.
    body.group.rotation.z = car.roll;
    body.group.rotation.x = -car.pitch;

    // The springs, on the SPRUNG mass only: the body squats into a landing,
    // rebounds out of it and dives under the brakes while the wheels stay
    // exactly where the ground put them. This is the whole visible half of
    // the car having weight — the engine decides how far, this just draws
    // it (positive pitchLoad lifts the nose, so it rotates like `pitch`).
    //
    // The engine's own tremble goes on the same sprung mass and for the same
    // reason: it is the BODY that is shaken by what is bolted under it,
    // while the wheels stay where the ground put them. Millimetres, and only
    // while the revs are up and the car is not (car-shake.ts).
    const tremble = trembleAt(state.t, revTremble(car.rev, car.u));
    body.chassis.position.y = car.ride + tremble.heave;
    body.chassis.rotation.x = -car.pitchLoad + tremble.pitch;
    body.chassis.rotation.z = tremble.roll;

    // Wheels: the front pair points where the driver points them —
    // counter-steer in a drift shows because the input does — and each wheel
    // turns at the speed of its own contact patch, plus, on the driven axles
    // only, whatever the engine is spinning it beyond that (car-wheels.ts).
    const wantSteer = clamp(car.steer * WHEEL_STEER_LOCK, -WHEEL_STEER_MAX, WHEEL_STEER_MAX);
    steerVisual += (wantSteer - steerVisual) * clamp(WHEEL_STEER_RATE * dt, 0, 1);
    for (let i = 0; i < body.wheelSpin.length; i++) {
      const front = i < 2;
      const speed = wheelSurfaceSpeed(
        car,
        body.wheelGroups[i].position,
        front ? steerVisual : 0,
        front ? driven.front : driven.rear,
      );
      body.wheelSpin[i].rotation.x += (speed * dt) / bodySpec.wheelRadius;
      if (front) body.wheelGroups[i].rotation.y = steerVisual;
    }

    const lock = steerVisual / WHEEL_STEER_LOCK;
    if (body.steering) body.steering.rotation.z = steeringTurn(lock);
    // The cockpit's own wheel goes further than the one behind the glass —
    // it is read at arm's length rather than through a tinted pane — and its
    // two needles are the only instruments in the game that are GEOMETRY.
    // Both are driven off the same numbers the HUD reads, so a glance down
    // at the dials and a glance up at the readout never disagree.
    if (body.cockpit && inside) {
      body.cockpit.steering.rotation.z = cockpitWheelTurn(lock);
      body.cockpit.tacho.rotation.z = dialAngle(car.rev);
      body.cockpit.speedo.rotation.z = dialAngle(Math.abs(car.u) / DIAL_TOP_SPEED);
    }

    dirt.update(state, dt);
    // The glass answers to the weather landing on it, the filth the stage
    // has thrown at the rest of the car, and — because road spray is thrown
    // by the wheels rather than settling out of the air — how far the car
    // actually drove while it was being thrown.
    body.wipers.update(wet, dirt.level(), groundTravel(car, dt), dt);
    // …and the WATER on the windscreen, which answers to the same weather
    // and to the arm that has just been moved. It also needs what the car
    // is doing, and only the car is in a position to say: how fast the air
    // is dragging the runs up the glass, and how hard the corner is pushing
    // them sideways. Speed times yaw rate is the honest centripetal figure
    // — positive is a left turn, which throws the water to the right.
    body.screenRain?.update(
      { wet, speed: Math.abs(car.u), lateral: car.u * car.yawRate, wipe: body.wipers.front },
      dt,
    );
    shineGlass(state, eye);
    shineLamps();
    damage.update(state, dt);

    // Blob shadow: pinned to the ground under the car, lying on its slope,
    // fading with height.
    if (!car.airborne) {
      groundPitch = car.pitch;
      groundRoll = car.roll;
    }
    const ground = groundYUnder(state);
    const height = Math.max(0, car.y - ground);
    shadow.position.set(car.x, ground, car.z);
    shadow.rotation.y = car.heading;
    shadowTilt.rotation.z = groundRoll;
    shadowTilt.rotation.x = -groundPitch;
    const s = clamp(1 - height * 0.12, 0.35, 1);
    shadow.scale.set(s, s, s);
    (blob.material as THREE.MeshBasicMaterial).opacity = 0.28 * s * fade;
  };

  const dispose = (): void => {
    damage.dispose();
    body.dispose();
    blob.geometry.dispose();
    (blob.material as THREE.MeshBasicMaterial).dispose();
    for (const geo of lampGeos) geo.dispose();
    lampMat.dispose();
    headMat.dispose();
  };

  return {
    group,
    cabin: body.cabin,
    cockpit: body.cockpit?.group ?? null,
    screenRain: body.screenRain,
    shadow,
    debris: damage.debris,
    update,
    setInside,
    setRearView,
    onEvents: damage.onEvents,
    setLights,
    setWet,
    grime: dirt.level,
    lampSpread: lampSpread(bodySpec),
    dispose,
  };
}

/** Ground height under the car. Out in the wild the road sample the car is
 * measured against can be a hillside away, so the terrain answers directly
 * there — a shadow at the road's elevation floats over the valley below. */
function groundYUnder(state: GameState): number {
  if (state.offRoad) return state.terrain.groundAt(state.car.x, state.car.z);
  return state.track.samples[state.nearIndex]?.elevation ?? 0;
}

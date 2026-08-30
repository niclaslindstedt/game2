// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FIELD ON THE ROAD — the rivals as things you can see and hit.
//
// The classification has always stepped fourteen real games beside the
// player's (standings.ts). This is what puts them in the world: each crew in
// its own car, in its own paint (car-livery.ts), driven by the same
// `GameState` the results are read off. Nothing here simulates anything —
// the states arrive already stepped, and this module only ever reads them.
//
// A stage is driven ten seconds apart, so almost none of the field is ever
// on screen. That is what the module is built around:
//
//   BUILT LAZILY. A rival's body is generated the first time that crew comes
//   within `BUILD_RANGE`, and kept from then on. Most runs build one car —
//   the crew in front, who is stood on the line as the establishing shot
//   opens — and several build none at all. Building all fourteen up front
//   would cost every run the geometry of a field it will never meet.
//
//   DRAWN BY RANGE. Past `DRAW_RANGE` a car is a couple of pixels that still
//   costs its draw calls, so it is switched off rather than shrunk. The map
//   view takes the whole field off for the same reason it takes the dust off.
//
//   NAMED WHILE IN RANGE. Every built car carries a name tag (name-tag.ts)
//   with its crew's alias and start number on it, so the car you are closing
//   on is Frostbite rather than a blue coupe. The tag is hung and dropped
//   with the body; its own shorter range is the module's, not this one's.
//
// A crew still in the start control, or already through the finish, is not
// here at all: `onRoad` in standings.ts is the one place that decides, and
// the collision in App.tsx reads the same answer.
//
//   TOWING DUST, from one cloud shared by the whole entry list. A rally
//   where only the player's car raises anything is a rally with one car in
//   it — a rival is very often a plume over the trees a corner before it is
//   a car — so every crew on the road feeds the field's plume (plume.ts),
//   and because a cloud is one pool and one draw call, fourteen of them
//   cost what one does. Their lamps light it, and everybody else's, through
//   the register in dust-light.ts.
//
// Everything on the road is DRAWN, with no near limit under the far one: the
// field is entered off to one side of the player's grid slot
// (`GRID_STAGGER`), so the closest two cars ever get in the start control is
// alongside each other, and the contact model keeps them apart from there.

import * as THREE from "three";
import { type GameEvent, type GameState } from "@engine";

import type { FilmDetail, InteriorDetail } from "./car-body.ts";
import { buildCar, tintCar, type CarVisual } from "./car-mesh.ts";
import { crewLookFor } from "./car-crew.ts";
import { liveryForCrew } from "./car-livery.ts";
import { lightDust } from "./dust-light.ts";
import { plumeGround } from "./ground-tint.ts";
import { createNameTag, type NameTag } from "./name-tag.ts";
import { createPlume } from "./plume.ts";
import { onRoad, type RivalRun } from "./standings.ts";
import { rockAt } from "./terrain.ts";

/** How near a crew has to come before their car is generated, m. Wider than
 * the range they are drawn at, so the build lands while they are still out
 * of sight rather than as they pop into frame. */
const BUILD_RANGE = 420;

/** ...and how near before it is drawn, m. Past this a rally car is a few
 * pixels of dust-coloured fuzz, and the road ahead is doing a better job of
 * saying somebody is up there than the car is. */
const DRAW_RANGE = 340;

/** How many bodies may be GENERATED in one frame. A car is thousands of
 * triangles put together part by part and costs tens of milliseconds to
 * build, which on a rally start is fine — one crew comes into range at a
 * time. A GRID is the case that breaks it: the whole entry list is inside
 * `BUILD_RANGE` on the first frame of the establishing shot, and building
 * all of them there is a freeze at exactly the moment the player is watching
 * the lights. One a frame spends the ceremony instead, and nothing is shown
 * on the frame it was built on anyway. */
const BUILD_BUDGET = 1;

/** How thick a rival's cloud is against the player's own — see `createPlume`.
 * Half, so the whole entry list shares one pool without any of them tearing
 * a hole in anybody's tail. */
const FIELD_PLUME = 0.5;

/** How near a crew has to be before the dust they are towing is raised, m —
 * and it is deliberately WIDER than the range their car is built at, let
 * alone drawn at.
 *
 * A rally car is a plume over the road a corner before it is a car, and that
 * is the whole reason the field has dust at all: what tells you somebody is
 * up there is not a body two pixels wide at the vanishing point, it is the
 * tan smear hanging over the trees where the road goes. Culling the cloud
 * with the body would delete exactly the distance the effect is FOR — and it
 * would buy nothing, because a plume is one pool and one draw call however
 * many crews are feeding it. */
const DUST_RANGE = 560;

/** …and how many of them may feed it at once, nearest first. The pool is the
 * cloud's whole budget (`createPlume`), so this is what stops a concertina
 * of five crews inside half a kilometre from recycling each other's puffs
 * until every one of them has a tail with holes in it. */
const DUST_CARS = 3;

/** How many of the field light the dust at once. The register holds four
 * cars and the player is always one of them (dust-light.ts), so this is what
 * is left — and it is spent on the NEAREST, because a lamp four hundred
 * metres up the road is not putting a colour on anything the player can
 * see. */
const LAMP_CARS = 3;

/** The beats the field is worth drawing in. Past the line the player's own
 * run is over and the rest of the entry list is a classification being
 * settled at thousands of steps a frame (R30's `settleField`) — a car moving
 * that fast is a streak across the country, not a rival. */
function onScreen(phase: GameState["phase"]): boolean {
  return phase !== "rollout" && phase !== "finished";
}

export type FieldCars = {
  /** Put a field on the road. Takes the last one off first: a restart is a
   * new entry list, not the old one carried over. */
  set: (runs: RivalRun[]) => void;
  /** Take the whole field off — a run with nobody entered, or a menu. */
  clear: () => void;
  /** Read every run this frame and place, hide or build its car — and raise
   * the dust each of them is towing. `shown` is false under the map view,
   * which is looking at a stage rather than at cars and takes the whole
   * field off along with the player's own body. */
  update: (viewer: GameState, camera: THREE.PerspectiveCamera, dt: number, shown: boolean) => void;
  /** The two things the field's dust needs and only the renderer knows:
   * whether the rain has settled this stage (there is no cloud to tow off a
   * soaked road) and how thick the transient FX are allowed to be. */
  setDust: (wet: boolean, fx: number) => void;
  /** Hang the nearest crews' lamps on the register the clouds are lit from
   * (dust-light.ts) — a rival ahead of you in the dark is a red glow inside
   * its own dust before it is a car. `power` is how much of a beam the
   * daylight leaves (the environment's own number), so a field running lights
   * under a black noon storm does not out-light the car being driven.
   * Separate from `update` because the register has one owner of the moment
   * it is emptied, and that is the renderer. */
  lightDust: (power: number) => void;
  /** Whether a crew that is on the road is NAMED while it is there — the
   * player's option (name-tag.ts). */
  setNames: (on: boolean) => void;
  /** One rival's own events, spent on ITS body alone: a car the player put
   * into the trees crumples and sheds parts, and makes no sound, because
   * neither happened here. (The dust it TOWS is not an event — it is the
   * ground under the car, read every frame like the player's own.) */
  events: (run: RivalRun, events: GameEvent[]) => void;
  /** The conditions: the tint every baked-colour surface takes, whether the
   * lamps are lit, and how hard it is raining on the glass. Pushed by the
   * renderer, which owns all three. */
  paint: (tint: THREE.Color, lampsLit: boolean, rain: number) => void;
  /** How much of a rival is built for the sake of what is only visible up
   * close: how much cabin its glass has behind it — the player's VIDEO
   * option, taken down a level here (`fieldInterior`) — and how finely its
   * screens carry the grime film its wipers clear. Both read when a car is
   * BUILT, so they land on the next stage rather than mid-run, which is the
   * same contract the undergrowth setting keeps; one call because they are
   * one setting. */
  setCarDetail: (detail: InteriorDetail, screens: FilmDetail) => void;
  /** How many rival cars are being drawn right now (the debug overlay). */
  drawn: () => number;
  dispose: () => void;
};

/** One crew's body and the plate over it, built and dropped together. */
type FieldCar = { visual: CarVisual; tag: NameTag };

/** What a RIVAL's cabin is built at, given what the player chose for their
 * own. A level down off the top one: the full cabin's extra is a roll cage
 * and a steering wheel that turns on its own mesh, and neither of those is
 * readable through somebody else's glass at the distance one is seen from —
 * while eight of them are eight cages and eight more draw calls. The lower
 * two settings are left alone: a player already on the cheap cabin has paid
 * the smallest bill there is, and taking the crews out of the cars around
 * them on top of it would be a change to what the field LOOKS like rather
 * than to what it costs. */
function fieldInterior(detail: InteriorDetail): InteriorDetail {
  return detail === "high" ? "low" : detail;
}

export function createFieldCars(scene: THREE.Scene): FieldCars {
  let runs: RivalRun[] = [];
  const built = new Map<RivalRun, FieldCar>();
  let drawn = 0;
  let interior: InteriorDetail = fieldInterior("high");
  let screens: FilmDetail = "coarse";
  let tint = new THREE.Color(1, 1, 1);
  let lampsLit = false;
  let rain = 0;
  let named = true;
  let wetGround = false;
  let fx = 1;
  /** One cloud for the whole entry list — see the module note. Off until
   * somebody is entered (`showCloud`). */
  const plume = createPlume(FIELD_PLUME);
  plume.points.visible = false;
  scene.add(plume.points);
  /** The crews within `DUST_RANGE` this frame, nearest first: who raises
   * dust, and whose lamps light it. Kept as one array and rewritten in
   * place, because this is a per-frame path and a fresh array a frame is
   * garbage the collector answers with a pause in the middle of a stage. */
  const near: { run: RivalRun; range: number }[] = [];

  /** Whether the field's cloud is worth drawing at all. Two ways it is not,
   * and the second is the common one: rain has settled the stage (what a
   * wheel picks up off a soaked road is clods, and those are the renderer's
   * grains, not this), or there is no field — a time trial, a roam, the
   * menu's own backdrop. Hidden rather than merely starved, because a
   * `Points` nobody has spawned into still costs its draw call and its
   * texture bind on every pass of every frame. */
  const showCloud = (): void => {
    plume.points.visible = !wetGround && runs.length > 0;
  };

  const drop = ({ visual, tag }: FieldCar): void => {
    scene.remove(visual.group, visual.shadow, visual.debris, tag.sprite);
    visual.dispose();
    tag.dispose();
  };

  const clear = (): void => {
    for (const car of built.values()) drop(car);
    built.clear();
    runs = [];
    drawn = 0;
  };

  const show = ({ visual, tag }: FieldCar, on: boolean): void => {
    visual.group.visible = on;
    visual.shadow.visible = on;
    visual.debris.visible = on;
    if (!on) tag.hide();
  };

  return {
    set: (next) => {
      clear();
      runs = next;
      showCloud();
    },
    clear: () => {
      clear();
      showCloud();
    },
    update: (viewer, camera, dt, shown) => {
      drawn = 0;
      near.length = 0;
      let budget = BUILD_BUDGET;
      // The same gate the bodies are behind, and the dust needs it MORE than
      // they do. Past the line the classification is settled by stepping
      // every remaining crew thousands of times a frame (R30's
      // `settleField`), so a car is a streak across the country — and a
      // cloud raised off one is a line of puffs drawn from here to the
      // finish. Nothing on the road is worth drawing in those beats.
      const beat = onScreen(viewer.phase);
      // The cloud ages once however many crews are feeding it, and it keeps
      // ageing while they are out of range: a plume the player is driving
      // INTO was raised by a car that is already gone.
      plume.step(dt);
      for (const run of runs) {
        const existing = built.get(run);
        if (!onRoad(run)) {
          // Out of the world: still in the control, or home. The body is
          // KEPT — a crew that has finished is the crew you were racing, and
          // building it again the next time one comes past costs more than
          // leaving it standing.
          if (existing) show(existing, false);
          continue;
        }
        const car = run.state.car;
        const range = Math.hypot(car.x - viewer.car.x, car.z - viewer.car.z);
        // Who is near enough to matter to the DUST, which is a longer reach
        // than either the body's or the plate's — see `DUST_RANGE`. Gathered
        // before the build gate below, because a crew can be raising a cloud
        // a corner ahead while their car does not exist yet.
        if (beat && range <= DUST_RANGE) near.push({ run, range });
        if (!existing) {
          if (range > BUILD_RANGE || budget === 0) continue;
          budget -= 1;
          const livery = liveryForCrew(run.entry.crew.id, run.entry.number);
          // Their own paint, and their own crew inside it: the pair of
          // helmets behind the glass is that crew's, not a copy of yours.
          const visual = buildCar(run.state.spec, {
            paint: livery,
            interior,
            crew: crewLookFor(run.entry.crew.id),
            // Their glass gets filthy like everybody's, at the resolution a
            // car seen from OUTSIDE needs: nobody reads the swept arc on a
            // rival, they read that its windows have gone brown, and that is
            // 48 triangles rather than 3,456 (car/wipers.ts).
            screens,
          });
          // The plate wears the car's own paint and the number off its door,
          // so the name and the colour coming up the road are one crew.
          const tag = createNameTag(run.entry.crew.alias, livery.number, {
            color: livery.paint,
          });
          scene.add(visual.group, visual.shadow, visual.debris, tag.sprite);
          const fresh = { visual, tag };
          built.set(run, fresh);
          tintCar(visual, tint, lampsLit, rain);
          visual.update(run.state, 0, camera.position);
          show(fresh, false);
          continue;
        }
        const seen = shown && beat && range <= DRAW_RANGE;
        show(existing, seen);
        if (!seen) continue;
        drawn += 1;
        existing.visual.update(run.state, dt, camera.position);
        if (named) existing.tag.place(car.x, car.y, car.z, camera);
      }
      near.sort((a, b) => a.range - b.range);
      // The dust each of the nearest crews is towing, off the ground THEY
      // are standing on: a rival crossing a meadow raises nothing while the
      // player on the road beside them raises a wall, which is the same rule
      // read twice rather than one answer shared.
      for (let i = 0; i < near.length && i < DUST_CARS; i++) {
        const crew = near[i];
        if (!crew) continue;
        const state = crew.run.state;
        plume.raise(
          crew.run,
          state,
          dt,
          fx,
          plumeGround(state.surface, wetGround, () =>
            rockAt(state.terrain.groundAt, state.car.x, state.car.z),
          ),
        );
      }
    },
    setDust: (wet, budget) => {
      wetGround = wet;
      fx = budget;
      showCloud();
    },
    lightDust: (power) => {
      if (!lampsLit) return;
      // No grime term: how filthy a rival's lenses are is not tracked, and
      // at the range one of these is ever seen through dust it would not be
      // the difference between two frames.
      for (let i = 0; i < near.length && i < LAMP_CARS; i++) {
        const rival = near[i]?.run.state.car;
        if (rival) lightDust(rival, power, power);
      }
    },
    setCarDetail: (detail, grime) => {
      interior = fieldInterior(detail);
      screens = grime;
    },
    setNames: (on) => {
      named = on;
      if (!on) for (const { tag } of built.values()) tag.hide();
    },
    events: (run, events) => built.get(run)?.visual.onEvents(run.state, events),
    paint: (next, lit, wet) => {
      tint = next;
      lampsLit = lit;
      rain = wet;
      for (const { visual } of built.values()) tintCar(visual, tint, lampsLit, rain);
    },
    drawn: () => drawn,
    dispose: () => {
      clear();
      scene.remove(plume.points);
      plume.dispose();
    },
  };
}

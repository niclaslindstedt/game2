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
// Everything on the road is DRAWN, with no near limit under the far one: the
// field is entered off to one side of the player's grid slot
// (`GRID_STAGGER`), so the closest two cars ever get in the start control is
// alongside each other, and the contact model keeps them apart from there.

import * as THREE from "three";
import { type GameEvent, type GameState } from "@engine";

import type { InteriorDetail } from "./car-body.ts";
import { buildCar, tintCar, type CarVisual } from "./car-mesh.ts";
import { crewLookFor } from "./car-crew.ts";
import { liveryForCrew } from "./car-livery.ts";
import { createNameTag, type NameTag } from "./name-tag.ts";
import { onRoad, type RivalRun } from "./standings.ts";

/** How near a crew has to come before their car is generated, m. Wider than
 * the range they are drawn at, so the build lands while they are still out
 * of sight rather than as they pop into frame. */
const BUILD_RANGE = 420;

/** ...and how near before it is drawn, m. Past this a rally car is a few
 * pixels of dust-coloured fuzz, and the road ahead is doing a better job of
 * saying somebody is up there than the car is. */
const DRAW_RANGE = 340;

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
  /** Read every run this frame and place, hide or build its car. `shown`
   * is false under the map view, which is looking at a stage rather than at
   * cars and takes the whole field off along with the player's own body. */
  update: (viewer: GameState, camera: THREE.PerspectiveCamera, dt: number, shown: boolean) => void;
  /** Whether a crew that is on the road is NAMED while it is there — the
   * player's option (name-tag.ts). */
  setNames: (on: boolean) => void;
  /** One rival's own events, spent on ITS body alone: a car the player put
   * into the trees crumples and sheds parts, and makes no sound and no dust,
   * because none of that happened here. */
  events: (run: RivalRun, events: GameEvent[]) => void;
  /** The conditions: the tint every baked-colour surface takes, whether the
   * lamps are lit, and how hard it is raining on the glass. Pushed by the
   * renderer, which owns all three. */
  paint: (tint: THREE.Color, lampsLit: boolean, rain: number) => void;
  /** How much cabin the rivals' own glass has behind it — the player's VIDEO
   * option, pushed by the renderer. Read when a car is BUILT, so it lands on
   * the next stage rather than mid-run, which is the same contract the
   * undergrowth setting keeps. */
  setInterior: (detail: InteriorDetail) => void;
  /** How many rival cars are being drawn right now (the debug overlay). */
  drawn: () => number;
  dispose: () => void;
};

/** One crew's body and the plate over it, built and dropped together. */
type FieldCar = { visual: CarVisual; tag: NameTag };

export function createFieldCars(scene: THREE.Scene): FieldCars {
  let runs: RivalRun[] = [];
  const built = new Map<RivalRun, FieldCar>();
  let drawn = 0;
  let interior: InteriorDetail = "high";
  let tint = new THREE.Color(1, 1, 1);
  let lampsLit = false;
  let rain = 0;
  let named = true;

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
    },
    clear,
    update: (viewer, camera, dt, shown) => {
      drawn = 0;
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
        if (!existing) {
          if (range > BUILD_RANGE) continue;
          const livery = liveryForCrew(run.entry.crew.id, run.entry.number);
          // Their own paint, and their own crew inside it: the pair of
          // helmets behind the glass is that crew's, not a copy of yours.
          const visual = buildCar(run.state.spec, {
            paint: livery,
            interior,
            crew: crewLookFor(run.entry.crew.id),
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
        const near = shown && onScreen(viewer.phase) && range <= DRAW_RANGE;
        show(existing, near);
        if (!near) continue;
        drawn += 1;
        existing.visual.update(run.state, dt, camera.position);
        if (named) existing.tag.place(car.x, car.y, car.z, camera);
      }
    },
    setInterior: (detail) => {
      interior = detail;
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
    dispose: clear,
  };
}

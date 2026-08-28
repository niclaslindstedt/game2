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
// A crew still in the start control, or already through the finish, is not
// here at all: `onRoad` in standings.ts is the one place that decides, and
// the collision in App.tsx reads the same answer.

import * as THREE from "three";
import { TUNING, type GameEvent, type GameState } from "@engine";

import { buildCar, tintCar, type CarVisual } from "./car-mesh.ts";
import { liveryForCrew } from "./car-livery.ts";
import { onRoad, type RivalRun } from "./standings.ts";

/** How near a crew has to come before their car is generated, m. Wider than
 * the range they are drawn at, so the build lands while they are still out
 * of sight rather than as they pop into frame. */
const BUILD_RANGE = 420;

/** ...and how near before it is drawn, m. Past this a rally car is a few
 * pixels of dust-coloured fuzz, and the road ahead is doing a better job of
 * saying somebody is up there than the car is. */
const DRAW_RANGE = 340;

/** ...and how near is TOO near, m: half a car length between two centres is
 * one body standing inside another, which happens in exactly one place —
 * the start control, where the whole field is built on the same grid sample
 * and the crew in front leaves from the line the player is sat on. Drawing
 * it there is two shells fighting over the same pixels. The contact model
 * never leaves two cars this deep inside each other, so nothing that is
 * actually ON the road is hidden by it. */
const IN_THE_CONTROL = TUNING.collision.halfLength;

export type FieldCars = {
  /** Put a field on the road. Takes the last one off first: a restart is a
   * new entry list, not the old one carried over. */
  set: (runs: RivalRun[]) => void;
  /** Take the whole field off — a run with nobody entered, or a menu. */
  clear: () => void;
  /** Read every run this frame and place, hide or build its car. `shown`
   * is false under the map view, which is looking at a stage rather than at
   * cars and takes the whole field off along with the player's own body. */
  update: (viewer: GameState, dt: number, shown: boolean) => void;
  /** One rival's own events, spent on ITS body alone: a car the player put
   * into the trees crumples and sheds parts, and makes no sound and no dust,
   * because none of that happened here. */
  events: (run: RivalRun, events: GameEvent[]) => void;
  /** The light: the tint every baked-colour surface takes, and whether the
   * lamps are lit. Pushed by the renderer, which owns both. */
  paint: (tint: THREE.Color, lampsLit: boolean) => void;
  /** How many rival cars are being drawn right now (the debug overlay). */
  drawn: () => number;
  dispose: () => void;
};

export function createFieldCars(scene: THREE.Scene): FieldCars {
  let runs: RivalRun[] = [];
  const built = new Map<RivalRun, CarVisual>();
  let drawn = 0;
  let tint = new THREE.Color(1, 1, 1);
  let lampsLit = false;

  const drop = (visual: CarVisual): void => {
    scene.remove(visual.group, visual.shadow, visual.debris);
    visual.dispose();
  };

  const clear = (): void => {
    for (const visual of built.values()) drop(visual);
    built.clear();
    runs = [];
    drawn = 0;
  };

  const show = (visual: CarVisual, on: boolean): void => {
    visual.group.visible = on;
    visual.shadow.visible = on;
    visual.debris.visible = on;
  };

  return {
    set: (next) => {
      clear();
      runs = next;
    },
    clear,
    update: (viewer, dt, shown) => {
      drawn = 0;
      for (const run of runs) {
        const visual = built.get(run);
        if (!onRoad(run)) {
          // Out of the world: still in the control, or home. The body is
          // KEPT — a crew that has finished is the crew you were racing, and
          // building it again the next time one comes past costs more than
          // leaving it standing.
          if (visual) show(visual, false);
          continue;
        }
        const car = run.state.car;
        const range = Math.hypot(car.x - viewer.car.x, car.z - viewer.car.z);
        if (!visual) {
          if (range > BUILD_RANGE) continue;
          const fresh = buildCar(run.state.spec, {
            paint: liveryForCrew(run.entry.crew.id, run.entry.number),
          });
          scene.add(fresh.group, fresh.shadow, fresh.debris);
          built.set(run, fresh);
          tintCar(fresh, tint, lampsLit);
          fresh.update(run.state, 0);
          show(fresh, false);
          continue;
        }
        const near = shown && range <= DRAW_RANGE && range > IN_THE_CONTROL;
        show(visual, near);
        if (!near) continue;
        drawn += 1;
        visual.update(run.state, dt);
      }
    },
    events: (run, events) => built.get(run)?.onEvents(run.state, events),
    paint: (next, lit) => {
      tint = next;
      lampsLit = lit;
      for (const visual of built.values()) tintCar(visual, tint, lampsLit);
    },
    drawn: () => drawn,
    dispose: clear,
  };
}

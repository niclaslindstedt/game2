// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MAP VIEW: the whole stage from the sky, turning — the framing the Roam
// page is a window onto, and the one camera in the game that is not watching
// a car.
//
// It is its own module for the same reason the in-car rig and god mode's are
// (camera-eye.ts, camera-free.ts): it shares nothing with the chase rigs but
// the lens. Where a chase camera follows a body, this one FRAMES a footprint
// — it solves its own standoff from the stage's bounds and the pane's actual
// half-angles, its own near and far planes from the island it is looking at,
// and it is steered in units nothing else in the game uses (an azimuth, a
// tilt, a zoom multiplier, and a pan in metres off the stage's centre).
//
// Two things about it are load-bearing and easy to undo:
//
//   - The zoom's floor is a STANDOFF in metres, not a fraction of the
//     framing. Leaning in has to reach the same few metres off the ground on
//     an eleven-kilometre epic as on a sprint, or the developer's layers
//     (map-layers.ts) can only be read on short stages.
//   - The aim rides the GROUND under it rather than the world's zero. At the
//     framing distance that is a rounding error; leaned all the way in it is
//     the difference between standing over a hillside and standing inside it.

import * as THREE from "three";
import type { GameState } from "@engine";

import { clamp } from "../lib/angles.ts";
import { verticalFovFor } from "../lib/fov.ts";
import { ISLAND_MARGIN } from "./map-island.ts";

/** The map view's design fov, deg — tight enough that the stage reads as a
 * model on a table rather than a fisheyed globe. */
const MAP_FOV = 42;
/** How far above the horizon the map camera sits by default, radians (~57°).
 * Steeper flattens the hills and lakeshores into a paint job and the map
 * stops being worth looking at; shallower and the far half of the stage
 * starts hiding behind the near ridges. The player can tilt away from it —
 * see `nudge` — and these are the ends of that travel: never overhead, where
 * relief disappears, and never so low that the stage is a strip of land seen
 * edge-on. */
const PITCH = 1.0;
const PITCH_MIN = 0.16;
const PITCH_MAX = 1.45;
/** How far the view can be pulled out: never past the framing that holds the
 * whole stage, because there is nothing out there to see. */
const ZOOM_MAX = 1;
/** ...and how close it can be pulled IN — as a STANDOFF in metres rather
 * than as a fraction of the framing, so the answer does not depend on how
 * big the stage happens to be. A few metres puts the lens among the trees,
 * which is the point: a generator defect is usually a thing the size of a
 * car, and looking at it from a third of the way in is looking at a valley. */
const RANGE_MIN = 5;
/** How long the map holds still after the player last touched it, s, before
 * the slow turn picks up again from wherever they left it. */
const HOLD = 4;
/** Vertical slack around the framed footprint, m — hills, trees and gates
 * stand above the ground plane the fit is solved in, and the near and far
 * planes are cut from that footprint. */
const RELIEF = 140;
/** Landscape kept around the stage's bounds, m. The map view cuts the world
 * to the route dilated by `ISLAND_MARGIN` (map-island.ts), so that IS what
 * there is to frame — anything further out has been clipped away. A little
 * over, so the coastline is not flush with the frame. */
const MARGIN = ISLAND_MARGIN * 1.08;
/** Azimuth rate, rad/s — a full turn every ~70 s. */
const SPIN = 0.09;
/** How far short of the map's centre the view aims, as a fraction of the
 * standoff — the correction a pitched frustum needs (see `update`). */
const LEAN = 0.06;

/** The map view's framing, in the units it is steered in: where it is
 * looking from (azimuth and tilt, radians), how far in it is pulled (a
 * multiplier on the framing standoff), the standoff itself, and how far the
 * aim has been walked off the stage's centre, m. */
export type MapPose = {
  az: number;
  pitch: number;
  zoom: number;
  range: number;
  panX: number;
  panZ: number;
  /** How much GROUND the pane is holding across its width, m. The one number
   * that says what the map is currently a map OF, and what anything drawn on
   * it as an annotation has to be measured against. */
  across: number;
  /** The frustum the map is cut to, m. Worth writing down: at map scale the
   * planes are solved rather than fixed, and "the ground vanished when I
   * leaned in" is a near plane every single time. */
  near: number;
  far: number;
  /** Where the lens actually ended up, and the height of the ground it is
   * aimed at, m. The two together are what say whether a map that came out
   * empty was pointed at nothing or standing inside a hill. */
  eye: { x: number; y: number; z: number };
  aimY: number;
};

export type MapCamera = {
  /** Place the lens for this frame, and answer the horizontal fov it wants. */
  update: (camera: THREE.PerspectiveCamera, state: GameState, dt: number) => number;
  /** The standoff that FRAMES the stage, m — 0 until one has been framed.
   * The renderer hangs the map's fog off it. Zoom moves the camera, never
   * this: fog that closed in as the player leaned in would grey out the
   * thing they leaned in to see. */
  range: () => number;
  /** Turn, tilt and zoom by hand: azimuth and pitch in radians, zoom as a
   * MULTIPLIER on the standoff (below 1 pulls in). The slow turn holds for
   * `HOLD` after every nudge and then picks up from there. */
  nudge: (dAz: number, dPitch: number, zoomBy: number) => void;
  /** Walk it SIDEWAYS: the deltas are fractions of the pane the drag
   * crossed, and what comes out is the land moving with the pointer — the
   * point under it stays under it. Held inside the framed island, so a pan
   * can never leave the stage behind and the map cannot be lost. */
  pan: (dxFrac: number, dyFrac: number) => void;
  /** Back to the framing that holds the whole stage: default tilt, no pan. */
  reset: () => void;
  /** Park it exactly where a link says it was — the map's own repro line
   * (map-debug.ts). Absent components are left where they already were. */
  place: (pose: Partial<MapPose>) => void;
  /** Stop the idle turn, and let it go again. A map with a debug layer
   * painted on it is a MEASUREMENT being read: two screenshots of one that
   * kept turning are two different pictures, and comparing them is the
   * entire loop the layers exist for. */
  hold: (held: boolean) => void;
  pose: () => MapPose;
};

export function createMapCamera(): MapCamera {
  /** Where the map is being looked at from: the azimuth the turn has walked
   * to, the tilt, and how far in it is zoomed (1 frames the whole stage). */
  let az = 0;
  let pitch = PITCH;
  let zoom = 1;
  /** ...and how far the aim has been walked off the stage's centre, m. Zoom
   * alone can only ever lean into the middle of a stage; a defect is
   * somewhere else, so the pan is what makes leaning in worth anything. */
  let panX = 0;
  let panZ = 0;
  /** The framing standoff, and the height of the ground under the aim. */
  let range = 0;
  let aimY = 0;
  /** How much WORLD one pane's width and height are worth at the current
   * framing, m — solved by `update`, which is the only place that knows the
   * frustum, and spent by `pan`, which only knows pixels. */
  let across = 0;
  let down = 0;
  /** Seconds since the view was last moved by hand, and whether the idle
   * turn is pinned off entirely. */
  let held = HOLD;
  let pinned = false;
  /** The frustum last solved, for the debug box to write down. */
  let near = 1;
  let far = 1;
  const eye = { x: 0, y: 0, z: 0 };

  const update = (camera: THREE.PerspectiveCamera, state: GameState, dt: number): number => {
    held += dt;
    // The turn is the page's idle state, not a mode: a drag interrupts it and
    // it picks up again from wherever the drag finished, so nothing ever
    // snaps back to a framing the player did not choose.
    if (!pinned && held >= HOLD) az += SPIN * dt;
    const b = state.track.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const vHalf = (verticalFovFor(MAP_FOV, camera.aspect) * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    // The island is the route dilated by a margin, so what has to fit is a
    // circle on the bounds' own DIAGONAL — not on its longer side. Fitting
    // the side instead runs the two nearest corners of a squarish stage off
    // the bottom of the pane, which is exactly where the start line tends to
    // be.
    const radius = Math.max(100, Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2) + MARGIN;
    // Fit BOTH axes, and only the depth axis is foreshortened. The map lies
    // in the ground plane and the camera looks down it at `pitch`, so what
    // the pane must hold vertically is the footprint's depth SQUASHED by
    // sin(pitch). Fitting the raw span to the vertical angle instead — as a
    // fit that ignored the pitch would — pushes the camera a fifth too far
    // out and leaves the map floating in a paneful of sky.
    range = Math.max((radius * Math.sin(pitch)) / Math.tan(vHalf), radius / Math.tan(hHalf));
    // The zoom's floor is applied HERE because here is the only place that
    // knows what the framing distance actually came out at — see RANGE_MIN.
    zoom = clamp(zoom, Math.min(ZOOM_MAX, RANGE_MIN / range), ZOOM_MAX);
    const standoff = range * zoom;
    // The pan is held inside the framed island. Past that edge there is
    // nothing built and nothing drawn, so a pan with no stop is a control
    // whose whole travel past halfway is a black pane.
    const panLen = Math.hypot(panX, panZ);
    if (panLen > radius) {
      panX *= radius / panLen;
      panZ *= radius / panLen;
    }
    const aimX = cx + panX;
    const aimZ = cz + panZ;
    aimY = state.terrain.groundAt(aimX, aimZ);
    const ground = Math.cos(pitch) * standoff;
    camera.position.set(
      aimX + Math.sin(az) * ground,
      aimY + Math.sin(pitch) * standoff,
      aimZ + Math.cos(az) * ground,
    );
    eye.x = camera.position.x;
    eye.y = camera.position.y;
    eye.z = camera.position.z;
    // Aimed a little SHORT of the centre, on the camera's own side. The fit
    // above is symmetric in ANGLE, and a pitched frustum spends more of its
    // vertical angle on the near half of the ground than on the far one — so
    // an aim on the exact middle runs the nearest coast off the bottom of the
    // pane while leaving empty sky at the top.
    const lean = standoff * LEAN;
    camera.lookAt(aimX + Math.sin(az) * lean, aimY, aimZ + Math.cos(az) * lean);
    // What a whole pane is worth in metres of ground at this framing, for the
    // pan to spend: the width straight off the horizontal angle, the height
    // foreshortened by the tilt, because the pane's vertical axis is laid
    // along the ground rather than across it.
    across = 2 * Math.tan(hHalf) * standoff;
    down = (2 * Math.tan(vHalf) * standoff) / Math.sin(pitch);
    // The frustum is cut to the footprint it is actually looking at. A stage
    // is kilometres across, and a driving near plane a quarter of a metre out
    // under a far plane that distant leaves the depth buffer barely a metre
    // of resolution out where the map is — which is a lake and the lakebed
    // under it swapping places every time the view turns. Everything drawn
    // lies within `reach` of the island's CENTRE — not of the aim, which the
    // pan has walked away from — so the distance to that centre is what the
    // planes are cut from.
    const reach = radius + RELIEF;
    const toCentre = Math.hypot(eye.x - cx, eye.y - aimY, eye.z - cz);
    near = Math.max(0.4, toCentre - reach);
    far = toCentre + reach;
    camera.near = near;
    camera.far = far;
    return MAP_FOV;
  };

  return {
    update,
    range: () => range,
    nudge: (dAz, dPitch, zoomBy) => {
      held = 0;
      az += dAz;
      pitch = clamp(pitch + dPitch, PITCH_MIN, PITCH_MAX);
      // Only the ceiling is applied here; the floor is a standoff in metres
      // and `update` is the one that knows the framing distance.
      zoom = Math.min(zoom * zoomBy, ZOOM_MAX);
    },
    pan: (dxFrac, dyFrac) => {
      held = 0;
      // GRAB THE LAND: the point under the pointer stays under it, so the aim
      // walks the other way along the screen's own axes — the pane's across
      // is the camera's right, and the pane's down is the ground running
      // back toward the lens.
      const sideways = across * dxFrac;
      const back = down * dyFrac;
      const sin = Math.sin(az);
      const cos = Math.cos(az);
      panX += -cos * sideways - sin * back;
      panZ += sin * sideways - cos * back;
    },
    reset: () => {
      held = 0;
      pitch = PITCH;
      zoom = 1;
      panX = 0;
      panZ = 0;
    },
    place: (pose) => {
      held = 0;
      if (pose.az !== undefined) az = pose.az;
      if (pose.pitch !== undefined) pitch = clamp(pose.pitch, PITCH_MIN, PITCH_MAX);
      if (pose.zoom !== undefined) zoom = Math.min(pose.zoom, ZOOM_MAX);
      if (pose.panX !== undefined) panX = pose.panX;
      if (pose.panZ !== undefined) panZ = pose.panZ;
    },
    hold: (next) => {
      pinned = next;
    },
    pose: () => ({
      az,
      pitch,
      zoom,
      range: range * zoom,
      panX,
      panZ,
      across,
      near,
      far,
      eye: { ...eye },
      aimY,
    }),
  };
}

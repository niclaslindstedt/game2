// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RAIN ON THE GLASS — what the driver, and only the driver, is looking
// through. A pane laid on the outside of the windscreen, and another over
// the flanks' windows, each carrying a shader that beads, runs and streaks —
// and on the windscreen is scrubbed off again by the arm sweeping over it.
//
// WHY THIS IS NOT car/wipers.ts's FILM. The grime film is a coat carried on
// the VERTICES of a tessellated pane: the wipe walks them and multiplies each
// one down, which is the right machine for a slowly deepening wash of road
// filth seen from any camera on the ladder. Water is the opposite problem.
// It is not a wash but a field of DISCRETE things — beads a couple of
// millimetres across, and the runs they leave when one breaks loose — and at
// arm's length from the driver's eye those millimetres are tens of pixels. A
// vertex grid fine enough to carry one bead would be a hundred thousand
// triangles on one window. So the water is procedural: the panes are a few
// hundred triangles of nothing, and every drop on them is solved per pixel.
//
// THE THREE THINGS THAT MAKE IT READ AS WATER RATHER THAN AS SPOTS:
//
//   IT REFRACTS. A drop is a lens. What sells one is not that it is a pale
//   blob but that the world behind it is bent, turned over and pulled in at
//   its edges. So the finished frame is copied to a texture before the panes
//   are drawn, and every covered pixel samples that copy at an offset taken
//   from the drop's own surface slope. That is the whole reason this is a
//   second pass rather than another mesh in the scene: it needs the picture
//   the scene has already made.
//
//   IT RUNS THE RIGHT WAY, AND THE RIGHT WAY IS A DIFFERENT WAY ON EACH
//   PANE. Water on a windscreen does not fall. Below about twenty kilometres
//   an hour it creeps DOWN under its own weight; above it the air coming
//   over the scuttle drags it UP the screen, faster the faster the car goes,
//   and a corner leans the runs over toward the outside of the bend. One
//   signed number (`RUN`) covers all of it, crossing zero through a moment
//   where the water barely moves at all — which is exactly what a windscreen
//   does as a car rolls to a halt. A SIDE window is edge-on to the same air:
//   standing still it only beads, and at speed every drop on it is blown
//   BACK along the car in a horizontal streak. Same shader, with the frame
//   the runs are solved in turned a quarter (`uSide`).
//
//   THE ARM ACTUALLY CLEARS IT. There is no per-pixel memory to write a
//   wipe into, so the glass is not cleared: it is ASKED how long ago the
//   blade went past, and it works the answer out from the stroke itself. The
//   blade's angle is `park + sweep(1 − cos φ)/2`, so the phase at which it
//   crosses any given point is an arccos — twice a cycle, going out and
//   coming back — and the shortest way back from the phase it is at now to
//   either of those is the age of the water there (`wipeAge`). Everything
//   else is a function of that one number: nothing behind the blade, beads
//   filling in over the second after it, a full screen out at the corners
//   the arm never reaches, and the faint arcs of smear the rubber leaves
//   for the half second after it passes. The flanks have no arm, so on them
//   that age is simply forever, and they stream for the whole stage.
//
// It is the PLAYER'S CAR ONLY, and only while the camera is in it. Nobody
// reads beading on a rival two hundred metres up the road, and the pass
// costs a full-frame copy — see `draw`.

import * as THREE from "three";

import { patchAt, type V3 } from "./builder.ts";
import { GLASS_LIFT, screenPanes, type ScreenPane } from "./greenhouse.ts";
import { paneFrame } from "./pane-frame.ts";
import type { CarBodySpec } from "./spec.ts";
import type { WipeState } from "./wipers.ts";

/** How far proud of the glass the water sits, m. It has to clear the pane
 * (`GLASS_LIFT`) and the grime film laid on it, and it has to stay UNDER the
 * blades — water is on the outside of the screen and the rubber rides on
 * top of it, so the arm must occlude the drops rather than the other way
 * round. car/wipers.ts owns the two numbers this sits between. */
const RAIN_LIFT = GLASS_LIFT + 0.006;

/** How finely a pane is tessellated. It carries nothing per-vertex — every
 * drop is solved in the fragment shader — so this is only about following
 * the glass's own warp closely enough that the metric coordinates handed to
 * the shader do not shear across a cell. A dozen across is more than that
 * costs to be sure of; the flanks are flatter and get by on half. */
const GRID = { front: { cols: 12, rows: 9 }, side: { cols: 6, rows: 5 } };

/** HOW THE WATER TRAVELS OVER THE WINDSCREEN, m/s along the pane's own up
 * axis, and it is ONE SIGNED NUMBER on purpose.
 *
 * `gravity` is what a standing car has: a slow creep down the screen. `air`
 * is what the airflow over the scuttle adds once there is any, and it is up
 * — a windscreen at speed drives every drop toward the header. The two are
 * summed rather than switched between, so somewhere around `lift` the sum
 * passes through zero and the water hangs almost still on the glass, which
 * is precisely what happens as a car slows to a walk. A switch there would
 * flip every run on the screen in one frame. */
const RUN = {
  gravity: -0.075,
  air: 1.15,
  /** Road speed the airflow starts to tell at, m/s, and where it is doing
   * all it is going to. */
  lift: 4,
  full: 34,
};

/** …AND OVER A SIDE WINDOW, which is a different pane in a different wind.
 *
 * It stands edge-on to the air, so nothing over the scuttle lifts what is
 * on it: standing still the water only beads, and the little that runs,
 * runs down too slowly to draw. Moving, the whole sheet of air going past
 * the door blows every drop BACK along the car — faster than the screen's
 * runs, because there is no rake to climb, and drawn out into longer
 * streaks for the same reason. `flowing` is the road speed at which the
 * runs are fully going; under `RUN.lift` they are not going at all, which
 * is what lets the pane sit still on the grid without a flip anywhere.
 * `scale` is how big its drops are against the screen's: the door glass is
 * a third of the distance from the eye, so the same millimetres are three
 * times the pixels, and a bead sized for the screen is a puddle there. */
const SIDE = { air: 1.6, flowing: 14, stretch: 3.4, scale: 0.55 };

/** How far the runs LEAN, as metres across the glass per metre up it, at the
 * hardest cornering a rally car does. Water has mass: it keeps going while
 * the car turns under it, so a left-hander pushes it right. Small — this is
 * a lean on the runs, not a river across the screen — but it is one of those
 * details that is only noticed when it is missing. */
const LEAN = 0.55;

/** …and the lateral acceleration that counts as that hardest cornering,
 * m/s². Speed times yaw rate is the honest centripetal figure and a rally
 * car on gravel lives around 8. */
const LEAN_AT = 9;

/** How long the glass takes to go from cleared to fully beaded again, s, in
 * a spit and in a downpour. The fast end is what makes a wiper feel like it
 * is losing: at a real downpour the screen is beading again before the arm
 * has finished the stroke, and the driver is reading the road through the
 * half second after each pass. It has to be read against the STROKE, which
 * runs between 0.6 and 1.25 seconds (car/wipers.ts) — a refill slower than
 * the beat is a screen the arm is permanently ahead of, which is a screen
 * with nothing visible on it and no reason to carry a wiper at all. */
const REFILL = { drizzle: 3.2, downpour: 0.55 };

/** How much taller than it is wide a bead's own cell is. It is the ceiling
 * on how far a drop may be drawn out along its run — past it a bead would
 * be clipped at the seam between two cells — and the reason there is any
 * room at all is that a windscreen is RAKED: what is round on the glass is
 * already a lozenge on the screen, so the shape is stretched back toward
 * round before the airflow gets to stretch it any further. */
const MIST_TALL = 2.2;

/** THE MOST OF THE ROAD THE WATER MAY EVER TAKE, 0..1 of opaque.
 *
 * This is the one number in the file that is not about water at all. A
 * screen in a real downpour at rally pace is genuinely close to opaque
 * between strokes, and drawing that honestly is a stage nobody can drive:
 * the road disappears and the corner call on the HUD becomes the only way
 * through the stage, which is a worse game and a worse picture. Under one,
 * every drop keeps a ghost of the true image inside it, so the road is
 * always readable THROUGH the water rather than behind it. */
const HEAVIEST = 0.9;

/** How long the smear a blade leaves takes to clear, s. Rubber does not dry
 * a screen — it leaves a thin film in arcs following the way it went, which
 * flares against a low sun and is gone within the second. */
const SMEAR_LIFE = 0.65;

/** How much longer than it is wide the air draws a drop out, at the top of
 * `RUN.full`. A bead standing on a screen at a hundred and twenty is a tear
 * with a tail on it, and the stretch is most of why a fast car's glass reads
 * differently from a parked one's. */
const STRETCH = 1.4;

/** …and how many times faster the water ARRIVES at the same top speed. A
 * parked car collects what falls on the area of its screen; a car at rally
 * pace sweeps out a column of wet air several times that in the same second.
 * This is why a wiper that copes on the start line is losing by third gear,
 * and it is the difference between a wet stage that reads as weather and one
 * that reads as a screen somebody forgot to clean. */
const CATCH = 1.7;

/** How far a drop bends the world behind it at its own rim, as a MULTIPLE OF
 * ITS OWN RADIUS ON SCREEN. Well over one, because a bead really is a
 * fisheye: what a drop shows is not the patch of world it is sitting on
 * nudged a little, it is a wide inverted view pulled in from a long way
 * outside itself.
 *
 * IT HAS TO BE THIS FAR IN THIS GAME PARTICULARLY. The world is flat-shaded
 * fields of one colour — a green bank, a brown road, a grey sky — and a lens
 * that reaches a few pixels shows green over green and disappears. What
 * makes a drop READ here is that it reaches far enough to pull in a
 * different thing entirely: the horizon inside a drop that is sitting on the
 * grass, the road inside one on the sky. */
const BEND = 2.7;

/** How fast the rain the shader is drawing follows the rain that is
 * actually falling, per second — filling and drying. Filling is quick,
 * because a screen in a squall is wet in a moment; drying is slow, because
 * a screen the shower has left keeps its water until the arm or the airflow
 * takes it. Without the lag, rain stopping deletes every drop in one frame. */
const FOLLOW = { wet: 2.6, dry: 0.4 };

/** Under this there is nothing on the glass worth a render pass. */
const NOTHING = 0.004;

export type ScreenRainDrive = {
  /** How hard it is raining on the car, 0..1 — the same number the wipers
   * and the sheet in the air are scaled by. */
  wet: number;
  /** Road speed, m/s: what drags the water up the screen and back along
   * the doors. */
  speed: number;
  /** Lateral acceleration, m/s², positive to the car's right: what leans
   * the runs over. */
  lateral: number;
  /** What the arm on the windscreen is doing (car/wipers.ts). */
  wipe: WipeState | null;
};

export type ScreenRain = {
  /** The windscreen's pane, and the one mesh carrying every flank window.
   * Both live in a scene of their OWN rather than on the car — see `draw`
   * — so nothing else in the renderer should be adding them anywhere. */
  mesh: THREE.Mesh;
  sides: THREE.Mesh;
  /** Whether there is enough on the glass to be worth drawing. */
  active: () => boolean;
  /** Advance the water one frame — everything the CAR knows about it. */
  update: (drive: ScreenRainDrive, dt: number) => void;
  /** …and the two things it does not: the world's own light, which a drop
   * catching the sky goes out with, and how bright that sky is with
   * lightning. A wet screen is the first surface in the frame a strike
   * lights up. Pushed by whoever owns the weather. */
  setSky: (tint: THREE.Color, flash: number) => void;
  /**
   * Draw the drops over the frame that is already in the buffer.
   *
   * This is the whole reason the panes are not simply meshes hanging off
   * the chassis. A drop refracts, so it has to sample the picture behind it,
   * so the picture has to already exist — which means the panes are drawn
   * AFTER the scene, from a copy of the finished frame.
   *
   * The depth buffer is left exactly as the scene pass wrote it, so a pane
   * is still occluded by everything nearer the eye than its glass: the
   * pillars, the door lining, the mirror hanging in the screen, the fascia
   * under it, and the blade itself, which is the one that matters.
   */
  draw: (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => void;
  dispose: () => void;
};

/** A pane in the shader's own terms: metres across the glass from the
 * middle of its sill and metres up it, plus how big the pane is in each, so
 * one mesh can carry several. Both the drop field and the wipe arc are
 * solved in these, which is why the arm's pivot can be handed over as a
 * plain pair of numbers. */
const VERT = /* glsl */ `
attribute vec2 pane;
attribute vec2 size;
varying vec2 vPane;
varying vec2 vSize;
varying vec4 vClip;

void main() {
  vPane = pane;
  vSize = size;
  vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vClip;
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uScene;
/** One pixel of the copied frame, in its own coordinates. The refraction is
 * worked out in PIXELS and converted with this, because how far a drop bends
 * the world is a property of the drop's own SIZE ON SCREEN — a 3 mm bead
 * twenty pixels across bends what is behind it right across itself, and the
 * same bead at four pixels barely bends anything. A fixed offset in texture
 * coordinates gets both of those wrong at once. */
uniform vec2 uTexel;
/** WHICH GLASS THIS IS. On the windscreen the runs go up and down the pane
 * and lean with the corner; on a flank they go along the car, which in the
 * pane's own metres is ACROSS it — so the frame the runs are solved in is
 * turned a quarter, and everything else falls out unchanged. */
uniform float uSide;
/** How much of the water is being carried anywhere at all, 0..1. Always on
 * a windscreen, whose runs merely change direction; on a flank the air is
 * the only thing that moves a drop, so standing still there is nothing to
 * run and the pane is beads alone. */
uniform float uFlowing;
/** How big the drops on this pane are, as a multiple of the windscreen's.
 * Every size below is metres of glass, and the door window is a third of
 * the distance from the driver's eye that the middle of the screen is: the
 * same bead is three times the pixels there, and what reads as rain on the
 * screen reads as a puddle on the door. */
uniform float uScale;
/** Metres of travel the water has done along the run axis since the stage
 * began, and how far it is leaning. INTEGRATED on the CPU rather than taken
 * as speed times time: the rate changes with the car, and a rate multiplied
 * by a running clock teleports every drop on the glass the instant it
 * does. */
uniform float uRun;
uniform float uLean;
/** Which way the water is going, +1 along the run axis and -1 against it,
 * and how much of a TRAIL it is leaving — nothing at all when it is barely
 * moving, which is what hides the moment the sign changes. */
uniform float uDir;
uniform float uTrail;
/** How far the air going past has drawn a drop out along its own run, 1 at
 * a standstill. A bead on a screen at rally pace is a tear, not a circle. */
uniform float uStretch;
/** How much water is arriving, 0..1, already lagged behind the weather. */
uniform float uWet;
/** …times over, for a car that is DRIVING INTO it. A parked car collects
 * what falls on the area of its screen; one at rally pace sweeps out a
 * column of wet air several times that in the same second, which is why a
 * wiper that copes at a standstill is losing by third gear. */
uniform float uCatch;
uniform vec3 uTint;
uniform float uFlash;
/** The arc: pivot across the sill and up from it, the park angle, and the
 * signed swing from it. */
uniform vec4 uArc;
/** The arm: how far out the rubber starts, and how far it reaches, m. */
uniform vec2 uArm;
/** The stroke: phase 0..2PI, how long one out-and-back is taking, how long
 * the blades have been sat at the park, and whether they are running. */
uniform vec4 uStroke;

varying vec2 vPane;
/** This pane: half its width and its height, m — for the feather at the
 * edges and the pooling along the sill. */
varying vec2 vSize;
varying vec4 vClip;

const float TAU = 6.28318530718;
/** What wipeAge hands back for a point no blade will ever reach. Long
 * enough that every "how long since" below saturates. */
const float FOREVER = 1000.0;

float sat(float x) { return clamp(x, 0.0, 1.0); }

vec3 hash31(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}

/** HOW MANY SECONDS AGO THE BLADE WENT OVER THIS POINT.
 *
 * The stroke is an out-and-back: angle = park + sweep * (1 - cos(phase)) / 2,
 * with phase running 0..2PI. Inverting it gives the phase at which the blade
 * crosses a given angle — an arccos, which has two answers a cycle, one on
 * the way out and one on the way back. The age is then however far the
 * stroke has run since the nearer of those, plus however long the arm has
 * been sat at the park since. Points off the end of the arm, inside its
 * boss, or outside the arc it swings through were never wiped at all —
 * which on a pane with no arm over it is every point there is. */
float wipeAge(vec2 p) {
  vec2 d = p - uArc.xy;
  float r = length(d);
  if (r < uArm.x || r > uArm.y) return FOREVER;
  // The blade's own convention, not a compass bearing: turning an arm by a
  // about the pane's normal puts its tip at (-sin a, cos a).
  float a = atan(-d.x, d.y);
  float t = (a - uArc.z) / uArc.w;
  if (t < 0.0 || t > 1.0) return FOREVER;
  float out0 = acos(clamp(1.0 - 2.0 * t, -1.0, 1.0));
  float since = min(mod(uStroke.x - out0, TAU), mod(uStroke.x - (TAU - out0), TAU));
  return since / TAU * uStroke.y + uStroke.z;
}

/** A DROP, as (coverage, slope across, slope along, radius in metres) — the
 * slope being what the refraction and the highlight are both taken off, and
 * the radius what says how far a drop of this size ought to bend the world
 * at all.
 *
 * It is a body of water with an EDGE on it, not a soft blot: solid right out
 * to its rim, and feathered there over one pixel of glass (aa) rather than
 * over a fraction of its own radius. That distinction is the whole
 * difference between water and spots. The slope is at its strongest at the
 * RIM and nothing at all in the middle, so a bead faded in from its rim has
 * every part that was doing the work transparent: what is left is a flat
 * centre showing the world un-bent, with a highlight sitting on it.
 *
 * A drop smaller than the pixel it lands in gives up its coverage in
 * proportion rather than being drawn at pixel size — otherwise a screen
 * drying out ends as a field of half-lit single pixels, which is the one
 * artifact of this that looks like a broken texture. */
vec4 drop(vec2 dm, float rad, float aa) {
  float cover = (1.0 - smoothstep(rad - aa, rad + aa, length(dm))) * sat(rad / aa);
  return vec4(cover, dm / rad * cover, rad);
}

/** ONE LAYER OF RUNNERS: the drops big enough to have broken loose, each
 * with the dotted trail it left where it came from.
 *
 * The glass is cut into tall narrow columns and each column holds one drop,
 * which travels the length of it and wraps. Everything is measured back into
 * METRES before it is compared, so a column being ten times taller than it
 * is wide does not make an oval of a bead. */
vec4 runners(vec2 q, vec2 cell, float seed, float density, float stretch, float aa) {
  vec2 g = q / cell;
  vec2 id = floor(g);
  vec2 f = fract(g);
  vec3 r = hash31(id * 1.7 + seed);
  // Not every column has a drop running down it, and how many do is how
  // hard it is coming down.
  if (r.z > density) return vec4(0.0);

  // Bigger drops run faster, which is what keeps a layer from reading as a
  // sheet of things moving in step.
  float pace = 0.55 + 0.9 * r.y;
  float head = fract(r.x + uRun * pace / cell.y);
  // The wander down the column. Its period divides the column exactly, so
  // the path does not step where one wraps into the next.
  float wob = 0.045 + 0.05 * r.y;
  float px = 0.5 + (r.x - 0.5) * 0.42;

  // THE HEAD. Distances wrap the column the short way round, so a drop
  // sitting on the seam is one drop rather than two halves.
  float hx = px + wob * sin(head * TAU * 2.0 + r.z * 30.0);
  float dy = fract(f.y - head + 0.5) - 0.5;
  vec2 dm = vec2(f.x - hx, dy) * cell;
  // Dragged into a tear by the air going past. A drop on a screen at speed
  // is not a circle and never has been.
  dm.y /= stretch;
  vec4 head0 = drop(dm, (0.17 + 0.20 * r.y) * cell.x, aa);

  // THE TRAIL. How far behind the head we are, measured the way the water
  // is going, so the trail is always upstream of it.
  float back = fract((head - f.y) * uDir);
  float fade = pow(1.0 - back, 2.4) * uTrail;
  // On the path the head actually took, not on a straight line under it.
  float onPath = (f.x - (px + wob * sin(f.y * TAU * 2.0 + r.z * 30.0))) * cell.x;
  // Beads at a fixed spacing along that path: a trail is a row of droplets
  // left behind, not a drawn line.
  float per = 9.0;
  float gap = (fract(f.y * per + r.z * 11.0) - 0.5) / per * cell.y;
  vec4 trail = drop(vec2(onPath, gap), max(head0.w * 0.42 * fade, 1e-5), aa);
  trail.x *= fade;
  trail.y *= fade;
  trail.z *= fade;

  return mix(trail, head0, step(trail.x, head0.x));
}

/** THE MIST: the fine beading that lands everywhere and is too small to run.
 * A jittered grid, one drop per cell, and the drops GROW rather than appear
 * — a screen filling in has beads swelling on it, not beads switching on. */
vec4 mist(vec2 q, float across, float seed, float grow, float aa, float shape) {
  // The cell is TALLER than it is wide by exactly as much as a drop in it
  // may be stretched, so a bead drawn out along its run still fits the
  // square it was born in and is never clipped at the seam.
  vec2 cell = vec2(across, across * ${MIST_TALL.toFixed(2)});
  vec2 g = q / cell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec3 r = hash31(id * 3.1 + seed);
  // Jittered nearly the whole width of its cell, and with a wide spread of
  // sizes on top: a grid whose drops are the same size in the middle of
  // every square reads as a grid, however fine it is, and that is the one
  // failure of a procedural field nobody ever mistakes for anything else.
  vec2 dm = (f - (r.xy - 0.5) * 0.86) * cell;
  dm.y /= min(shape, ${MIST_TALL.toFixed(2)});
  return drop(dm, max(across * (0.09 + 0.27 * r.z * r.z) * grow, 1e-5), aa);
}

void main() {
  vec2 p = vPane;

  // THE FRAME THE WATER RUNS IN: x across the runs, y along them. On the
  // windscreen that is the pane's own frame, sheared over by however hard
  // the car is cornering so every run on the glass leans the same way at
  // once. On a flank the runs go along the CAR, so the two axes swap — the
  // pane's x already runs toward the tail there (see the geometry).
  vec2 q = uSide > 0.5 ? vec2(p.y, p.x) : vec2(p.x - uLean * p.y, p.y);

  // HOW BIG A PIXEL IS, in metres of glass. The pane is not flat, is not
  // square on and is not the same shape in portrait, so this is different at
  // the header from at the sill — asking the derivative is the honest way to
  // find out and it costs nothing. Everything drawn on the glass is sized
  // and antialiased against it.
  float perPixel = max(fwidth(q.x), 1e-6);

  // HOW MUCH THE VIEW FORESHORTENS THE GLASS along the run: a metre UP a
  // windscreen laid back this far covers a fraction of the pixels a metre
  // across it does, and a metre ALONG a door window seen from the seat
  // beside it is worse still — so a drop that is round on the glass comes
  // out a lozenge on the screen. Most of that is given back, because a drop
  // has to READ as a drop, and the air drawing it out along its run is
  // folded into the same number.
  float rake = clamp(max(fwidth(q.y), 1e-6) / perPixel, 1.0, 4.0);
  float shape = min(mix(1.0, rake, 0.75) * uStretch, 4.0);

  // HOW WET THIS POINT IS. Everything on the glass is a function of how long
  // ago the blade cleared it and how fast the weather is putting it back.
  float age = wipeAge(p);
  float refill = mix(${REFILL.drizzle.toFixed(2)}, ${REFILL.downpour.toFixed(2)}, sat(uWet)) / uCatch;
  // Water runs down to the sill and stands there, so the bottom of a pane
  // is always the wettest part of it.
  float pooling = 1.0 + 0.18 * (1.0 - sat(p.y / vSize.y));
  float wet = sat(age / refill) * sat(uWet * 2.4) * pooling;

  // Three passes of water, coarse to fine — the sizes being metres of real
  // glass, and generous ones. A windscreen bead is two or three millimetres
  // across and at this focal length that is under a pixel: honest scale here
  // is a screen with nothing visible on it, which is the whole reason every
  // game that has ever done this has drawn the drops a size larger than
  // life. The coarse layer is the drops that are actually going somewhere,
  // the fine one the haze of beading that fills in between them within a
  // second of a wipe.
  float carried = wet * uFlowing;
  float s = uScale;
  vec4 w = runners(q, vec2(0.115, 0.50) * s, 0.0, sat(carried * 1.35 - 0.3), shape, perPixel);
  vec4 b = runners(q + vec2(0.047, 0.21) * s, vec2(0.072, 0.31) * s, 7.3, sat(carried * 1.2 - 0.45), shape, perPixel);
  w = mix(w, b, step(w.x, b.x));
  // Two passes of mist rather than one, at scales that do not divide each
  // other: one grid at one size is a grid however hard its cells are
  // jittered, and two laid over each other is a scatter.
  vec4 m = mist(q, 0.042 * s, 21.7, sat(wet * 1.6 - 0.05), perPixel, shape);
  w = mix(w, m, step(w.x, m.x));
  vec4 m2 = mist(q + vec2(0.017, 0.011) * s, 0.027 * s, 53.1, sat(wet * 1.4 - 0.3), perPixel, shape);
  w = mix(w, m2, step(w.x, m2.x));

  // THE FILM UNDER THEM. Between the beads a wet screen carries a continuous
  // skin of water, rippling as the air drags it over the glass, and it is
  // nearly invisible taken on its own: a soft wobble in the world and
  // nothing more. It is also the difference between a screen that is WET and
  // a clean pane with spots painted on it, which is what any number of beads
  // alone will always look like.
  float skin = sat(wet * 1.2) * sat(uWet * 2.0);
  vec2 rq = q * vec2(23.0, 8.0) + vec2(0.0, uRun * 4.0);
  vec2 ripple = vec2(sin(rq.x + sin(rq.y * 0.8) * 1.7), sin(rq.x * 0.47 + rq.y * 1.9)) * 0.26;

  // The beads stand ON the film: wherever one is, it owns the pixel.
  float bead = sat(w.x * 2.0);
  float cover = max(w.x, skin * 0.42);
  vec2 slope = mix(ripple * skin, w.yz, bead);
  // The film's own thickness is a thickness, not a strength — how much of it
  // there is rides on the coverage, not on how far it bends what is behind.
  float rad = mix(0.016, w.w, bead);

  // THE BOW WAVE. A blade shoves the water it is clearing ahead of itself,
  // so the one place a screen is WETTER for being wiped is the few
  // millimetres in front of the rubber.
  vec2 dp = p - uArc.xy;
  float rr = length(dp);
  if (uStroke.w > 0.5 && rr > uArm.x && rr < uArm.y) {
    // Which way the blade is going, and how fast: the stroke's own
    // derivative. It passes through zero at each end of the sweep, and the
    // ramp on it is not a nicety — at a standstill the "ahead of the blade"
    // test has no side to be on and would flood the whole arc.
    float going = sin(uStroke.x) * sign(uArc.w);
    float push = smoothstep(0.06, 0.4, abs(going));
    float ahead = (atan(-dp.x, dp.y) - uArc.z - uArc.w * (1.0 - cos(uStroke.x)) * 0.5) * sign(going);
    float wave = smoothstep(0.09, 0.005, ahead) * step(0.0, ahead) * push * sat(uWet * 3.0);
    vec2 tang = normalize(vec2(-dp.y, dp.x)) * sign(going);
    cover = max(cover, wave * 0.75);
    slope += tang * wave * 0.5;
    rad = max(rad, wave * 0.006);
  }

  // THE SMEAR. What rubber leaves for the half second after it passes: a
  // thin film of water in arcs following the way it went. Concentric about
  // the pivot, because that is the shape a blade draws, and irregular,
  // because a blade is not a squeegee. It is a FILM rather than a fog, so it
  // is added as a displacement along the arc the blade drew and not as a
  // second sample of the frame — which also keeps the whole pane down to one
  // texture fetch.
  float fresh = sat(1.0 - age / ${SMEAR_LIFE.toFixed(2)});
  float band = 0.5 + 0.5 * sin(rr * 190.0) * sin(rr * 71.0 + 2.1);
  float smear = fresh * fresh * band * sat(uWet * 2.0);
  vec2 along = rr > 1e-4 ? vec2(-dp.y, dp.x) / rr : vec2(0.0);
  slope += along * smear * 0.3;
  cover = max(cover, smear * 0.4);
  rad = max(rad, smear * 0.010);

  // The slope is solved in the run frame; the bend it buys is applied on
  // the screen, whose axes are the pane's. On a flank that is the swap
  // back.
  if (uSide > 0.5) slope = slope.yx;

  // Feathered at the very edge, so the pane ends in water thinning out
  // against the seal rather than in a cut line across the glass.
  float edge = min(min(vSize.x - abs(p.x), p.y), vSize.y - p.y);
  cover *= smoothstep(0.0, 0.012, edge);

  // WHAT IS BEHIND, BENT. The drop is a lens: the world through it comes in
  // pulled toward the middle and turned over, and it is the inversion rather
  // than the brightness that says "water" to anybody looking.
  //
  // HOW FAR it bends is the drop's own size ON SCREEN, which is why the
  // radius is carried this far.
  vec2 uv = vClip.xy / vClip.w * 0.5 + 0.5;
  vec2 bent = clamp(uv - slope * (rad / perPixel) * ${BEND.toFixed(2)} * uTexel,
                    vec2(0.002), vec2(0.998));
  vec3 behind = texture2D(uScene, bent).rgb;

  // The bead's own surface, as something standing off the glass. A lens
  // gathers light in the middle and goes dark at the rim, where what is
  // coming through it has turned away from the eye entirely — that ring is
  // most of what makes a drop read as a solid little body of water rather
  // than as a soft spot on the picture.
  vec3 n = normalize(vec3(slope * 1.3, 1.0));
  float rim = smoothstep(0.4, 1.0, length(slope));
  vec3 col = behind * (1.14 - 0.72 * rim);

  // …and the sky lying in it. On a screen raked back this far the sky is
  // most of the way UP the glass and a little to the driver's side, which is
  // where every drop on a real windscreen carries its highlight. It is the
  // ONE thing on the pane that is added rather than refracted, so it is the
  // one thing that survives a drop sitting over something black.
  float spec = pow(sat(dot(n, normalize(vec3(-0.22, 0.62, 0.75)))), 18.0);
  col += uTint * (spec * (1.35 + 5.0 * uFlash) + smear * 0.06) * cover;

  if (cover < 0.004) discard;
  gl_FragColor = vec4(col, sat(cover) * ${HEAVIEST.toFixed(2)});
}
`;

/** One mesh over a set of panes, tessellated on each pane's own warp and
 * carrying, per vertex, where on its pane it stands and how big that pane
 * is. `side` turns the flank panes' x to run TOWARD THE TAIL on both sides
 * of the car — the left flank's frame points the other way (car/pane-frame.ts
 * keeps every frame right-handed against its own outward normal) — so the
 * shader has one answer to "which way is back" on both doors. */
function paneMesh(
  panes: ScreenPane[],
  grid: { cols: number; rows: number },
  side: boolean,
  material: THREE.Material,
): THREE.Mesh {
  const position: number[] = [];
  const local: number[] = [];
  const size: number[] = [];
  const index: number[] = [];
  const at = new THREE.Vector3();
  for (const pane of panes) {
    const frame = paneFrame(pane);
    // The car's nose is +z, so a frame whose `right` runs toward -z already
    // points back down the car; one running the other way is turned.
    const tail = side && frame.right.z > 0 ? -1 : 1;
    const base = position.length / 3;
    for (let j = 0; j <= grid.rows; j++) {
      for (let i = 0; i <= grid.cols; i++) {
        const u = pane.rect.u0 + ((pane.rect.u1 - pane.rect.u0) * i) / grid.cols;
        const v = pane.rect.v0 + ((pane.rect.v1 - pane.rect.v0) * j) / grid.rows;
        const q: V3 = patchAt(pane.patch, u, v);
        at.set(q[0], q[1], q[2]).addScaledVector(frame.normal, RAIN_LIFT);
        position.push(at.x, at.y, at.z);
        at.sub(frame.origin);
        local.push(at.dot(frame.right) * tail, at.dot(frame.up));
        size.push(frame.width / 2, frame.height);
      }
    }
    for (let j = 0; j < grid.rows; j++) {
      for (let i = 0; i < grid.cols; i++) {
        const a = base + j * (grid.cols + 1) + i;
        const c = a + grid.cols + 1;
        index.push(a, a + 1, c + 1, a, c + 1, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("pane", new THREE.Float32BufferAttribute(local, 2));
  geometry.setAttribute("size", new THREE.Float32BufferAttribute(size, 2));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  // Placed from the chassis every time it is drawn, so nothing about it is
  // worth recomposing from a position and a quaternion it never has.
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}

/** The shader's knobs, for one pane. The two panes carry the same shader
 * with different answers in these, which is what makes them two materials
 * (and one compiled program). */
function rainUniforms(side: boolean) {
  return {
    uScene: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    uSide: { value: side ? 1 : 0 },
    uFlowing: { value: side ? 0 : 1 },
    uScale: { value: side ? SIDE.scale : 1 },
    uRun: { value: 0 },
    uLean: { value: 0 },
    uDir: { value: side ? 1 : -1 },
    uTrail: { value: 0 },
    uStretch: { value: 1 },
    uWet: { value: 0 },
    uCatch: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFlash: { value: 0 },
    uArc: { value: new THREE.Vector4(0, 0, 0, 1) },
    uArm: { value: new THREE.Vector2(0, 0) },
    uStroke: { value: new THREE.Vector4(0, 1, 1000, 0) },
  };
}

function rainMaterial(uniforms: ReturnType<typeof rainUniforms>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    // The scene pass already wrote the depth this pane is tested against;
    // writing more of it would only put the water in front of the wiper the
    // next frame round.
    depthWrite: false,
    // Seen from the driver's seat a pane is being looked at from BEHIND,
    // and from a bonnet camera it would be looked at from the front. One
    // material either way — there is one of these on one car.
    side: THREE.DoubleSide,
  });
}

/** Build the water on one car's glass. `anchor` is the object the panes
 * ride — the sprung chassis, so the glass squats into a landing with the
 * body around it. It is READ rather than parented to: the panes live in a
 * scene of their own, because they are drawn in a pass of their own
 * (`draw`). */
export function buildScreenRain(spec: CarBodySpec, anchor: THREE.Object3D): ScreenRain {
  const panes = screenPanes(spec);
  const front = rainUniforms(false);
  const flank = rainUniforms(true);
  const frontMat = rainMaterial(front);
  const flankMat = rainMaterial(flank);
  const mesh = paneMesh([panes.front], GRID.front, false, frontMat);
  const sides = paneMesh(panes.sides, GRID.side, true, flankMat);
  const stage = new THREE.Scene();
  stage.add(mesh, sides);

  /** The finished frame, copied so the drops have something to bend. Cut to
   * the drawing buffer the first time it is needed and re-cut whenever that
   * changes — a copy at the wrong size is a copy of a corner of the frame. */
  let scene: THREE.FramebufferTexture | null = null;
  let sceneW = 0;
  let sceneH = 0;

  /** The rain as the glass has it, which lags the rain that is falling. */
  let shown = 0;
  /** Metres of water travel along each pane's run axis, integrated: up the
   * screen (signed), and back along the doors. */
  let run = 0;
  let sideRun = 0;
  /** Which way the screen's water is going, held through the crossover —
   * see `RUN`. */
  let dir = -1;
  let lean = 0;

  const update = (drive: ScreenRainDrive, dt: number): void => {
    const want = Math.max(0, Math.min(1, drive.wet));
    shown += (want - shown) * Math.min(1, dt * (want > shown ? FOLLOW.wet : FOLLOW.dry));

    // The signed rate the screen's water is travelling at, and the distance
    // that makes over this frame. Integrated, never speed × clock: see
    // `uRun`.
    const lift = Math.max(0, Math.min(1, (drive.speed - RUN.lift) / (RUN.full - RUN.lift)));
    const rate = RUN.gravity + RUN.air * lift;
    run += rate * dt;
    // The trail dies away as the water slows, which is what hides the frame
    // the direction flips on: there is nothing behind a drop that is not
    // going anywhere.
    const creep = Math.abs(rate);
    if (creep > 0.02) dir = rate > 0 ? 1 : -1;
    front.uDir.value = dir;
    front.uTrail.value = Math.min(1, creep / 0.28);
    front.uRun.value = run;
    // Drawn out along the run by the air going past — a tear at pace, a
    // bead at a standstill — and arriving that much faster for being driven
    // into rather than merely stood under.
    const pace = Math.min(1, Math.max(0, drive.speed / RUN.full));
    front.uStretch.value = 1 + STRETCH * pace;
    front.uCatch.value = 1 + CATCH * pace;

    // Water keeps going while the car turns under it, so it is pushed the
    // way the car is NOT: a left-hander leans the runs to the right.
    const bend = -LEAN * Math.max(-1, Math.min(1, drive.lateral / LEAN_AT));
    lean += (bend - lean) * Math.min(1, dt * 3);
    front.uLean.value = lean;

    // THE DOORS. Only the air moves what is on them, and only backward: no
    // gravity term, no crossover, no lean — a pane that beads on the grid
    // and streams the moment the car is rolling (`SIDE`).
    const blown = Math.max(0, Math.min(1, (drive.speed - RUN.lift) / (SIDE.flowing - RUN.lift)));
    sideRun += SIDE.air * blown * dt;
    flank.uRun.value = sideRun;
    flank.uFlowing.value = blown;
    flank.uTrail.value = blown;
    flank.uStretch.value = 1 + SIDE.stretch * pace;

    front.uWet.value = shown;
    flank.uWet.value = shown;

    const w = drive.wipe;
    if (w) {
      front.uArc.value.set(w.pivotX, w.pivotY, w.park, w.sweep);
      front.uArm.value.set(w.inner, w.reach);
      front.uStroke.value.set(w.phase, w.period, w.parkAge, w.running ? 1 : 0);
    }
  };

  const setSky = (tint: THREE.Color, flash: number): void => {
    for (const u of [front, flank]) {
      u.uTint.value.copy(tint);
      u.uFlash.value = flash;
    }
  };

  const active = (): boolean => shown > NOTHING;

  const buffer = new THREE.Vector2();
  const draw = (renderer: THREE.WebGLRenderer, camera: THREE.Camera): void => {
    if (!active()) return;
    renderer.getDrawingBufferSize(buffer);
    const w = Math.max(2, Math.floor(buffer.x));
    const h = Math.max(2, Math.floor(buffer.y));
    if (!scene || sceneW !== w || sceneH !== h) {
      scene?.dispose();
      scene = new THREE.FramebufferTexture(w, h);
      scene.minFilter = THREE.LinearFilter;
      scene.magFilter = THREE.LinearFilter;
      scene.generateMipmaps = false;
      sceneW = w;
      sceneH = h;
      for (const u of [front, flank]) {
        u.uScene.value = scene;
        u.uTexel.value.set(1 / w, 1 / h);
      }
    }
    renderer.copyFramebufferToTexture(scene);

    // The panes ride the sprung body. Their matrix is taken from the
    // chassis the scene pass has just placed rather than recomposed here,
    // so the water cannot end up a frame behind the glass it is on.
    for (const m of [mesh, sides]) {
      m.matrix.copy(anchor.matrixWorld);
      m.matrixWorldNeedsUpdate = true;
    }

    const autoClear = renderer.autoClear;
    // The depth the scene pass wrote is what keeps the pillars, the mirror
    // and above all the BLADE in front of the water. Clearing it here would
    // paint every drop over the arm that is supposed to be wiping them off.
    renderer.autoClear = false;
    renderer.render(stage, camera);
    renderer.autoClear = autoClear;
  };

  const dispose = (): void => {
    mesh.geometry.dispose();
    sides.geometry.dispose();
    frontMat.dispose();
    flankMat.dispose();
    scene?.dispose();
  };

  return { mesh, sides, active, update, setSky, draw, dispose };
}

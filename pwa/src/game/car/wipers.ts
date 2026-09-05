// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIPERS — and the grime that gives them something to do. Two halves of
// one effect, which is why they are one module:
//
//   THE FILM. Each screen carries a pane of its own, laid a hair proud of
//   the glass and tessellated into a grid whose VERTICES carry the coat:
//   the pale smear water leaves, road-brown once a gravel stage has been
//   throwing filth at it. The coat is the vertex's ALPHA, so a clean vertex
//   is not there at all — which is what lets the glass under it be seen
//   through. Colours and alpha both interpolate across a cell, so a wiped
//   edge is a gradient rather than a staircase.
//
//   THE BLADES. One long arm on each screen, pivoting in the plane of that
//   screen off a boss in the middle of its sill (`ARMS` has why).
//   What makes them read as wipers rather than as metronomes is that they
//   only clear THE ARC THEY PASS THROUGH: every vertex of the pane knows
//   its polar position about each pivot, so a stroke clears exactly the
//   band the blade swept and leaves the corners it never reaches dirty. The
//   swept arc then greys over again while the blade is away — which is the
//   whole picture of driving in weather, and the reason the wipe has to be
//   a sweep instead of a fade on the whole pane.
//
// The blades run on demand, not on a switch: they start when there is
// something on the glass and always finish the stroke they are on, so they
// park where they started. What "something" means is two different answers
// (`WIPE`) — rain is a reason to keep wiping, dust is a reason to clear the
// screen once and wait — and both are read off the part of the pane the
// blades can actually REACH (`swept`). Off the whole pane they would never
// switch off at all: the corners no arm can get to cake solid over a stage
// and hold the average above any threshold forever.
//
// The blades are hardware and ride the body's own fullbright material; the
// film has a material of its own because it is the one part of the car that
// has to be able to disappear. Both take the time of day with everything
// else, as a multiply into the material colour.
//
// WATER IS NOT HERE. The rain on the player's own windscreen is a shader on
// a pane of its own (car/screen-rain.ts), because a bead is a discrete thing
// millimetres across and a vertex grid fine enough to carry one would be a
// hundred thousand triangles on one window. What it needs from this file is
// where the arm IS — `WipeState`, handed out live.

import * as THREE from "three";

import { NO_DIRT } from "../car-dirt.ts";
import { MeshBuilder, patchAt, rectAt, shadeFactor, type V3 } from "./builder.ts";
import { GLASS_LIFT, screenPanes, type GlassPane, type ScreenPane } from "./greenhouse.ts";
import { paneFrame, type PaneFrame } from "./pane-frame.ts";
import type { CarBodySpec } from "./spec.ts";

/** How far proud of the panel the film and the blades sit, m. Both clear
 * the glass (`GLASS_LIFT`), and the blades clear the film. */
const FILM_LIFT = GLASS_LIFT + 0.003;
const BLADE_LIFT = GLASS_LIFT + 0.014;

/** How finely a screen's film is tessellated, and it is a LADDER because the
 * resolution answers two completely different questions depending on whose
 * car it is.
 *
 * `fine` is what the car being driven needs. The resolution there is not
 * about how fine the dirt is — it is about the EDGE of the swept arc, which
 * is the one line on the whole car the eye reads as "a wiper did that". At a
 * handful of cells across, a blade's fan comes out as three big triangles of
 * clean glass and reads as a texture glitch; the arc has to have an arc in
 * it. That costs 3,456 triangles across the two panes, drawn in the
 * transparent pass with their colours rewritten as the coat moves — the
 * right bill for the one surface a player spends a stage looking through.
 *
 * `coarse` is what every OTHER car needs, and it is a different question
 * with a much cheaper answer. Nobody reads the arc on a rival: a car two
 * hundred metres up the road is thirty pixels of bodywork, and what tells
 * you its crew have been out there is simply that its glass has gone brown
 * while yours is being wiped. That is a TINT, not an arc — the alpha
 * interpolates across a cell either way — so it needs the corners of the
 * pane and barely more. At 48 triangles the pair it is 1.4% of the fine
 * film, which is the difference between a grid that can afford dirty
 * windows and one that cannot. */
export type FilmDetail = "off" | "coarse" | "fine";

const GRID = {
  fine: { cols: 36, rows: 24 },
  // Not 1x1: a single cell has no vertex the blades can clear WITHOUT
  // clearing the whole pane, so the screen would flash rather than wipe.
  // Four across is enough that a stroke takes the middle of the glass and
  // leaves the corners, which is the whole of what reads at range.
  coarse: { cols: 4, rows: 3 },
};

/** THE SIDE GLASS IS ALWAYS COARSE, on every car including the one being
 * driven, and that is not a compromise. The fine grid exists to carry the
 * EDGE of a swept arc; nothing sweeps a flank, so there is no edge on it to
 * carry — what a side window has is one slowly deepening wash, and alpha
 * interpolates across a cell for free. Fine tessellation there would be
 * three thousand triangles spent on a gradient. */
const SIDE_GRID = GRID.coarse;

/** WHAT IS ON THE GLASS, and it is three things rather than two.
 *
 * `WATER` is the pale smear rain alone leaves. The other two are both ROAD
 * grime, and the difference between them is the weather: what a dry gravel
 * stage cakes a screen with is pale SAND — the single loudest thing about a
 * rally car's back window, and the reason it goes lighter than the paint
 * around it rather than darker — where the same grime with rain in it is
 * the dark brown of wet earth. One tone for both is why a dry stage used to
 * leave a screen looking like it had been through a puddle. */
const WATER_TONE = new THREE.Color(0x9fabb4);
const DUST_TONE = new THREE.Color(0xcbb083);
const MUD_TONE = new THREE.Color(0x6d5a3c);

/** Most of the film a full coat can reach on a SCREEN, 0..1 of opaque —
 * short of 1, so even a caked screen is still glass rather than a painted
 * panel. High: the back window of a car that has done a gravel stage is a
 * window you cannot see out of, and the whole point of the blade is that it
 * cuts a hole in something. */
const COAT_MAX = 0.88;

/** ...and the ceiling on a SIDE window, which is lower for a reason that has
 * nothing to do with dirt. Nothing wipes the flanks, so whatever they reach
 * they keep for the rest of the stage — and what is behind them is the crew.
 * At the screens' ceiling a stage ends with two solid tan slabs where the
 * helmets were, which is the interior deleting itself. This is filthy enough
 * to read as a car that has been somewhere and sheer enough to keep the pair
 * of them showing through it. */
const SIDE_COAT_MAX = 0.6;

/** What soils a screen, at a downpour and at a filthy car — and the two
 * are measured against different things, which is the whole of why they
 * are separate numbers rather than one. Rain falls on a car whether or not
 * it is moving, so `rain` is coat per SECOND and films a screen in seconds.
 * Road spray is thrown by the wheels, so `road` is coat per METRE driven
 * and takes most of a stage: a car standing still on the gravel has nothing
 * arriving at its glass, however filthy the rest of it already is. Nor has a
 * car DRIVING on something that throws nothing — the metres are scaled by
 * what is actually coming off the ground (`glassSpray` in car-dirt.ts), so
 * tarmac and grass leave the screens exactly as they found them.
 *
 * THE ORDER IS THE POINT, and it is the same order in both columns: the
 * BACKLIGHT dirtiest, the windscreen next, the flanks last. The backlight
 * sits in the car's own wake, so everything the wheels throw up and
 * everything left hanging in the air behind it comes down on that pane —
 * which is why it is the window that ends a rally caked. The windscreen is
 * scoured by the airflow and only catches what the car drives into. The
 * flanks are edge-on to the direction of travel and catch least of all,
 * which is the whole reason they can be left unwiped for a stage and still
 * be windows at the end of it. */
const SOIL = {
  front: { rain: 0.17, road: 0.0023 },
  rear: { rain: 0.2, road: 0.005 },
  // Under the screens, and it has to be: NOTHING takes this back off. A
  // screen's rate is what it regains between strokes, so it can be fast and
  // still read as a screen being kept clear; a flank's is the whole of what
  // it will ever carry, and its ceiling (`SIDE_COAT_MAX`) is what stops it
  // going opaque. These are sized to reach that ceiling about a kilometre
  // into a gravel stage — sooner in the slides — so from the seat the side
  // glass has closed in by the first few corners rather than in the last
  // one: half a coat on a flank is a faint warmth over the trees that
  // nobody reads as dirt, and the whole point of the flanks is that the
  // driver is boxed in by them.
  side: { rain: 0.035, road: 0.0009 },
};

/** What a blade leaves behind, as a fraction of what it found — and it is
 * multiplied by the vertex's own soiling bias rather than applied flat. A
 * blade that cleared to nothing reads as an eraser; a blade that cleared to
 * an even tenth reads as a stencil. What a real one leaves is STREAKS, in
 * arcs following the way it went, and taking the smear off the same noise
 * the coat gathers by is what puts them there for nothing. */
const SMEAR = 0.11;

/** Seconds for one out-and-back stroke, barely wet through to a downpour.
 * A real pair runs somewhere between 45 and 70 cycles a minute, and it is
 * the SLOW end that gives the effect away: a blade taking two seconds to go
 * out and come back does not read as a wiper at all, it reads as an arm
 * being animated. */
const STROKE = { slow: 1.25, fast: 0.6 };

/** How long the blades sit at the park between strokes, and it is two
 * numbers because there are two reasons to be wiping.
 *
 * `drizzle` is the intermittent setting: water is still arriving, so the
 * next stroke is a few seconds out at most. `dry` is what a stage's DUST
 * gets, and it is far longer, because a dry screen is not a problem that
 * comes back in two seconds — a driver clears it and then leaves it alone
 * until it is worth clearing again. Without the split, a car filthy enough
 * to soil its screen at all wipes continuously for the rest of the stage,
 * which is the same failure as never switching off. */
const REST = { drizzle: 2.4, dry: 7 };

/** The backlight's arm is the slower of the two, the way a hatch's is. */
const REAR_RATE = 1.6;

/** WHAT SWITCHES THE BLADES ON, and it is deliberately not one number.
 *
 * Rain is a reason to keep wiping and it starts them at the first hint of
 * it, because that is what a windscreen in rain looks like. Grime is a
 * reason to clear the glass ONCE, and the screen has to have properly gone
 * off before it is worth a stroke — a car on a dry gravel stage is soiling
 * its screen every second of the run, so a threshold low enough to catch
 * that is a threshold the blades never come back under.
 *
 * `off` is where they give up at the end of a stroke, and it sits under
 * what one stroke leaves behind (`SMEAR` of what it found), so a wipe that
 * did its job is always followed by the blades parking. */
const WIPE = { rain: 0.04, grime: 0.38, off: 0.12 };

/** Where a screen's arms are hung and how far they swing. `pivots` are
 * across the pane as fractions of its half-width and `base` is up from its
 * bottom edge as a fraction of its height; `reach` is the arm's length as a
 * fraction of the pane's height. `park` is the blade's angle at rest and
 * `sweep` how far it swings from there, both measured the way a turn about
 * the screen's own normal runs — from straight up, TOWARD −x.
 *
 * ONE ARM ON EACH SCREEN, ON THE CENTRELINE, LYING FLAT, SWEEPING A HALF
 * CIRCLE. On the windscreen that is a rally car's answer rather than a road
 * car's: a tandem pair is what a showroom car wears, and a stage car runs a
 * single long arm off a pivot in the middle of the scuttle, because one
 * blade that reaches most of the way across is less to go wrong and less to
 * lift at speed.
 *
 * All three of those choices are the same choice, and it is about the
 * SHAPE LEFT ON THE GLASS rather than about the arm. What the player looks
 * at for a whole stage is the back window, and what is on it is a clean
 * fan cut out of a caked screen. Park the arm flat against the bottom edge,
 * put its pivot on the centreline, and sweep it the whole way to flat on
 * the other side, and that fan is a half disc sitting on the sill — the
 * shape the eye already knows. Any of the three off — a pivot to one side,
 * a park at forty-five degrees, a sweep that stops short — and it is an
 * off-centre wedge that reads as a hole in the texture instead.
 *
 * `reach` is the arm's length as a fraction of the pane's height MEASURED UP
 * THE GLASS, and it is the number that decides how far up the screen the fan
 * gets — which is the thing anybody actually looks at. Just under one: the
 * arc reaches most of the way to the header and stops short of it, so the
 * top of the screen and all four corners stay caked, which is the shape a
 * rally car's back window wears. At one the blade scrubs the header clean
 * and the cake is a thin frame; much under it and the fan is a bubble in
 * the middle of a filthy window.
 *
 * The same number is also what keeps the arm honest. A blade is never
 * longer than the window is tall, so it cannot leave the glass at the top
 * of its arc and read as an aerial — and it is clamped again to the
 * half-width below, so it cannot swing off the side of the screen it parks
 * on. The two can pull against each other on a hard-raked backlight, where
 * a screen that stands half a metre runs the best part of a metre up the
 * rake: an arm long enough to sweep that screen looks long lying across it.
 * The fan wins. It is the shape that reads from behind; the parked arm is a
 * black stick either way. */
const ARMS = {
  front: { pivots: [0], base: 0.02, reach: 0.9, park: -1.52, sweep: 3.04 },
  rear: { pivots: [0], base: 0.03, reach: 0.9, park: -1.5, sweep: 3 },
};

/** The arm, the blade and the pivot boss, in metres of arm length. */
const BLADE = { armWidth: 0.011, bladeWidth: 0.016, from: 0.16, boss: 0.028 };
const BLADE_COLOR = 0x1a1d22;
const ARM_COLOR = 0x2b2f36;

/** How wide a blade's own shadow on the glass is, rad, on top of the arc it
 * swept. Without it a fast stroke at a low frame rate leaves gaps. */
const WIPE_EDGE = 0.05;

/** WHAT THE BLADE ON ONE SCREEN IS DOING, in that screen's own frame
 * (car/pane-frame.ts) — handed out live rather than copied, so a reader gets
 * this frame's stroke without the wipers having to know who is reading.
 *
 * It exists because the blade is no longer the only thing on the glass. The
 * grime film is cleared by the sweep itself, vertex by vertex, and needs
 * none of this; the RAIN (car/screen-rain.ts) is a shader that has no
 * vertices to clear and has to work out for itself how long ago the arm went
 * past any given point of the pane. Everything below is what that takes: the
 * geometry of the arc, and where in the out-and-back the arm is right now.
 *
 * `park`, `sweep` and `angle` are all measured the way a turn about the
 * screen's own normal runs — from straight up, TOWARD −x. */
export type WipeState = {
  /** The pivot in the pane's own metres: across from the middle of the
   * sill, and up from it. */
  pivotX: number;
  pivotY: number;
  /** How long the arm is, m, and how much of that length near the pivot is
   * bare arm rather than rubber. */
  reach: number;
  inner: number;
  /** Where the blade rests, and the signed swing from there, rad. */
  park: number;
  sweep: number;
  /** Where the blade is now, rad, and how far through its own out-and-back,
   * 0..2π. */
  angle: number;
  phase: number;
  /** How long the out-and-back it is on takes, s. Not a constant: the arms
   * speed up as the weather does (`STROKE`). */
  period: number;
  /** Seconds since the blades last came to rest AT THE PARK — zero while a
   * stroke is running, and counting up through a beat between strokes and
   * through the whole time they are switched off. Anything working out how
   * long ago the arm passed a point needs this on top of the phase: a screen
   * that has been parked for six seconds is six seconds wetter than the
   * phase alone can say. */
  parkAge: number;
  running: boolean;
};

export type CarWipers = {
  group: THREE.Group;
  /** The WINDSCREEN's blade, live — what anything else drawn on that glass
   * answers to. A car built without arms still has one: parked, never
   * running, its `parkAge` climbing for the whole stage, which is exactly
   * what "nothing ever clears this screen" looks like to a reader. */
  front: WipeState | null;
  /** The grime pane itself — handed out so the assembly can order it over
   * the glass it is laid on, which no distance sort can be trusted to get
   * right for two surfaces three millimetres apart. Null on a car built
   * without one, where the arms still sweep and there is simply nothing on
   * the glass for them to take off. */
  film: THREE.Mesh | null;
  /** A pane has gone (car-damage.ts): there is no glass left for a coat to
   * sit on, so the film over it is cleared for good and stays clear. The
   * arms keep sweeping — a wiper on a screen with no glass in it is exactly
   * what a crashed car looks like. */
  shatter: (pane: GlassPane) => void;
  /**
   * Drive the glass one step.
   *
   * `wet` is how hard it is raining on the car, 0..1 (the environment owns
   * that number); `spray` is how hard the ground under the wheels is
   * throwing at the glass right now (`glassSpray` in car-dirt.ts — nothing
   * at all on tarmac and on grass, one on gravel, more in a slide);
   * `travel` is how far the car drove this step, m, which is what turns that
   * into an amount, because road spray is thrown by the wheels rather than
   * settling out of the air.
   */
  update: (wet: number, spray: number, travel: number, dt: number) => void;
  dispose: () => void;
};

function vec(p: V3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

/** One pivot on a screen, with every film vertex already resolved into
 * polar coordinates about it — the sweep test is then two comparisons. */
type Pivot = { reach: number; radius: Float32Array; angle: Float32Array };

/** One screen's film: the slice of the shared buffers it owns, the coat on
 * each of its vertices, and the arm(s) that clear it.
 *
 * On a car built with no film `count` is zero and every per-vertex array is
 * empty, so all four of the loops below fall through; `level` is what the
 * arms read instead. The arms and their beat are shared between the two: a
 * rival's wipers still come on in the rain, they just have nothing drawn
 * for them to clear. */
type Film = {
  offset: number;
  count: number;
  coat: Float32Array;
  /** The screen's coat as ONE number, 0..1 — the same reading the swept
   * average gives, kept for the filmless car where there are no vertices to
   * average. Maintained either way, so `sweep` reads one field. */
  level: number;
  /** Painted coat, quantised — the buffer is only rewritten when the glass
   * has visibly moved. */
  shown: Float32Array;
  /** Per-vertex soiling bias, so the coat gathers in streaks instead of
   * arriving as one even wash. */
  bias: Float32Array;
  soil: { rain: number; road: number };
  /** The vertices some blade can actually reach — what "how dirty is this
   * screen" is asked of. See the module note. */
  swept: Int32Array;
  /** How much of what is on this screen came off the ROAD rather than out
   * of the sky, 0..1 — the mix between the water film and the grime. */
  mud: number;
  /** …and how much water is in that grime, 0..1: dry sand at nothing, wet
   * earth at one. The two are separate questions and answering them with
   * one number paints a dry stage's dust the colour of mud. */
  soak: number;
  tone: THREE.Color;
  shade: number;
  /** How opaque this pane's coat may get — `COAT_MAX` on a screen, less on
   * a side window, which nothing ever takes it back off (`SIDE_COAT_MAX`). */
  ceiling: number;
  pivots: Pivot[];
  blades: THREE.Object3D[];
  /** How much slower this screen's arm is than the windscreen's. */
  rate: number;
  /** What is left of the beat before the next stroke, s. */
  rest: number;
  /** The stroke itself, in the form anything else on this glass reads it —
   * see `WipeState`. A pane with no arm still carries one, parked, so
   * nothing downstream has to branch on whether a window has a wiper. */
  wipe: WipeState;
};

function hash(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** One arm, authored about its own pivot: it points along +y, lies in the
 * z ≈ 0 plane of the screen, and sweeps by turning about z. */
function bladeGeometry(reach: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0, 0, 0, BLADE.boss, BLADE.boss, 0.014, ARM_COLOR);
  b.box(0, reach * 0.34, 0.002, BLADE.armWidth, reach * 0.68, 0.011, ARM_COLOR);
  const from = reach * BLADE.from;
  b.box(0, (from + reach) / 2, 0.007, BLADE.bladeWidth, reach - from, 0.009, BLADE_COLOR);
  return b.geometry();
}

/** Build the arms, and the grime pane they clear at whichever resolution the
 * car warrants (`FilmDetail`). The two are separate questions: a car with no
 * film still sweeps, it simply has nothing drawn to take off, and a car with
 * `arms` off carries the film and never clears it — the solid car, whose
 * glass nobody looks through and whose wipers would be hardware on a panel.
 * The spec has the last word either way: a body authored without wipers
 * never grows any. */
export function buildWipers(
  spec: CarBodySpec,
  material: THREE.Material,
  filmMaterial: THREE.Material,
  film: FilmDetail = "fine",
  arms = true,
): CarWipers {
  const group = new THREE.Group();
  const panes = screenPanes(spec);
  const armed = arms && spec.cabin.wipers === true;

  const position: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  const films: Film[] = [];
  const bladeGeos: THREE.BufferGeometry[] = [];

  /** Every pane that gets dirty, and what each one is: the two screens with
   * their arms, then the flanks' windows with none. A side window is the
   * same film with nothing to take it off again, which is why it is worth so
   * little geometry and has to stop short of opaque. */
  const screens: {
    pane: ScreenPane;
    arm: (typeof ARMS)["front"] | null;
    soil: { rain: number; road: number };
    grid: { cols: number; rows: number };
    ceiling: number;
  }[] = [
    {
      pane: panes.front,
      arm: ARMS.front,
      soil: SOIL.front,
      grid: GRID[film === "off" ? "coarse" : film],
      ceiling: COAT_MAX,
    },
    {
      pane: panes.rear,
      arm: ARMS.rear,
      soil: SOIL.rear,
      grid: GRID[film === "off" ? "coarse" : film],
      ceiling: COAT_MAX,
    },
    ...panes.sides.map((pane) => ({
      pane,
      arm: null,
      soil: SOIL.side,
      grid: SIDE_GRID,
      ceiling: SIDE_COAT_MAX,
    })),
  ];

  for (const screen of screens) {
    const pane = screen.pane;
    const grid = screen.grid;
    const arm = screen.arm;
    const frame: PaneFrame = paneFrame(pane);
    const offset = position.length / 3;
    const cols = grid.cols;
    const rows = grid.rows;
    const count = film === "off" ? 0 : (cols + 1) * (rows + 1);

    // The film follows the patch's own warp rather than a plane through it,
    // so it lies on the glass at the corners as well as the middle.
    const local: number[] = [];
    if (film !== "off") {
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const [u, v] = rectAt(pane.rect, i / cols, j / rows);
          const p = vec(patchAt(pane.patch, u, v)).addScaledVector(frame.normal, FILM_LIFT);
          position.push(p.x, p.y, p.z);
          color.push(0, 0, 0, 0);
          p.sub(frame.origin);
          local.push(p.dot(frame.right), p.dot(frame.up));
        }
      }
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const a = offset + j * (cols + 1) + i;
          const b = a + 1;
          const c = a + cols + 1;
          const d = c + 1;
          index.push(a, b, d, a, d, c);
        }
      }
    }

    // An arm long enough to swing off the side of the glass is the one way
    // this reads as wrong from any angle, so the reach answers to where its
    // own pivot sits rather than to a figure picked for one car.
    const spread = arm ? (Math.max(...arm.pivots.map(Math.abs)) * frame.width) / 2 : 0;
    const clear = arm
      ? (frame.width / 2 - spread) / Math.max(0.2, Math.abs(Math.sin(arm.park)))
      : 0;
    // A shade OVER the half-width rather than under it. The tip of a parked
    // blade sitting exactly on the glass edge is a blade that looks short;
    // a real one runs to the edge and disappears under the trim, and the
    // few centimetres of overhang are what let the fan reach up the screen
    // instead of stopping halfway. Much more than this and the arm swings
    // out over the bodywork, which is the one way this reads as wrong from
    // every angle at once.
    const reach = arm ? Math.min(frame.height * arm.reach, clear * 1.06) : 0;
    const pivots: Pivot[] = [];
    const blades: THREE.Object3D[] = [];
    const geo = armed && arm ? bladeGeometry(reach) : null;
    if (geo) bladeGeos.push(geo);
    const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.normal);
    for (const at of arm?.pivots ?? []) {
      const px = (at * frame.width) / 2;
      const py = arm ? arm.base * frame.height : 0;
      const radius = new Float32Array(count);
      const angle = new Float32Array(count);
      for (let k = 0; k < count; k++) {
        const dx = local[k * 2] - px;
        const dy = local[k * 2 + 1] - py;
        radius[k] = Math.hypot(dx, dy);
        // The blade's own angle, not a compass bearing: turning an arm by
        // `a` about +z puts its tip at (−sin a, cos a), so a point's angle
        // is atan2(−x, y). Take the bearing instead and the wipe clears the
        // mirror image of the arc the blade actually swept.
        angle[k] = Math.atan2(-dx, dy);
      }
      pivots.push({ reach, radius, angle });
      if (!geo) continue;
      // The mount holds the screen's own orientation and the blade holds
      // nothing but its sweep. They cannot be one object: an Euler's z is
      // not a turn about the local z of a basis already in the same Euler,
      // so writing `rotation.z` onto the mount would throw the frame away
      // and swing the blade through the roof.
      const mount = new THREE.Group();
      mount.quaternion.setFromRotationMatrix(basis);
      mount.position
        .copy(frame.origin)
        .addScaledVector(frame.right, px)
        .addScaledVector(frame.up, py)
        .addScaledVector(frame.normal, BLADE_LIFT);
      const blade = new THREE.Mesh(geo, material);
      blade.rotation.z = arm?.park ?? 0;
      mount.add(blade);
      group.add(mount);
      blades.push(blade);
    }

    const shade = shadeFactor([frame.normal.x, frame.normal.y, frame.normal.z]);
    const bias = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      // Streaky, and heavier down the screen: what runs down the glass
      // gathers at the bottom of it.
      const down = 1 - local[k * 2 + 1] / frame.height;
      bias[k] = (0.5 + 0.9 * hash(offset + k)) * (0.7 + 0.6 * down);
    }

    // WHICH VERTICES A BLADE CAN GET TO — the same reach and arc test the
    // wipe itself runs, taken once at build time over the whole stroke
    // rather than per frame over the slice of it. It is what the screen's
    // dirtiness is measured across: a pane's unreachable corners are always
    // filthy by the end of a stage, and averaging them in is why blades that
    // are supposed to run on demand end up running for the whole run.
    const reachable: number[] = [];
    // Both ends of the stroke, in order — `sweep` is signed (an arm that
    // parks on the right swings the other way), so the arc's bounds are a
    // min and a max rather than a start and a start-plus.
    const swungLo = arm ? Math.min(arm.park, arm.park + arm.sweep) - WIPE_EDGE : 0;
    const swungHi = arm ? Math.max(arm.park, arm.park + arm.sweep) + WIPE_EDGE : 0;
    for (let k = 0; k < count; k++) {
      for (const p of pivots) {
        const inner = p.reach * BLADE.from;
        const r = p.radius[k] as number;
        if (r < inner || r > p.reach) continue;
        const a = p.angle[k] as number;
        if (a < swungLo || a > swungHi) continue;
        reachable.push(k);
        break;
      }
    }

    films.push({
      offset,
      count,
      coat: new Float32Array(count),
      level: 0,
      shown: new Float32Array(count).fill(-1),
      bias,
      soil: screen.soil,
      swept: Int32Array.from(reachable),
      mud: 0,
      soak: 0,
      tone: new THREE.Color(),
      shade,
      ceiling: screen.ceiling,
      pivots,
      blades,
      rate: arm === ARMS.rear ? REAR_RATE : 1,
      rest: 0,
      wipe: {
        pivotX: arm ? ((arm.pivots[0] ?? 0) * frame.width) / 2 : 0,
        pivotY: arm ? arm.base * frame.height : 0,
        reach,
        inner: reach * BLADE.from,
        park: arm?.park ?? 0,
        sweep: arm?.sweep ?? 0,
        angle: arm?.park ?? 0,
        phase: 0,
        period: STROKE.slow,
        parkAge: 0,
        running: false,
      },
    });
  }

  let filmGeo: THREE.BufferGeometry | null = null;
  let colors: THREE.Float32BufferAttribute | null = null;
  let filmMesh: THREE.Mesh | null = null;
  if (film !== "off") {
    filmGeo = new THREE.BufferGeometry();
    filmGeo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    colors = new THREE.Float32BufferAttribute(color, 4);
    filmGeo.setAttribute("color", colors);
    filmGeo.setIndex(index);
    filmMesh = new THREE.Mesh(filmGeo, filmMaterial);
    // The film paints itself every step it moves; the dirt painter bakes from
    // a pristine copy, and two writers on one buffer is a flicker.
    filmMesh.userData[NO_DIRT] = true;
    group.add(filmMesh);
  }

  const grime = new THREE.Color();
  const paint = (f: Film): void => {
    if (!colors) return;
    // What the road put there first — sand, or the same sand with the
    // weather in it — and then how much of the film is that rather than
    // rain's own smear.
    grime.copy(DUST_TONE).lerp(MUD_TONE, f.soak);
    f.tone.copy(WATER_TONE).lerp(grime, f.mud).multiplyScalar(f.shade);
    const arr = colors.array as Float32Array;
    for (let k = 0; k < f.count; k++) {
      const i = (f.offset + k) * 4;
      arr[i] = f.tone.r;
      arr[i + 1] = f.tone.g;
      arr[i + 2] = f.tone.b;
      arr[i + 3] = f.coat[k] * f.ceiling;
      f.shown[k] = f.coat[k];
    }
    colors.needsUpdate = true;
  };
  for (const f of films) paint(f);

  /**
   * Advance one screen's arms and clear whatever they passed over. `wet` is
   * the rain falling on the car and `coat` is what is on the part of the
   * glass the blades can reach — kept apart all the way down, because they
   * are the two different reasons to be wiping and they ask for two
   * different behaviours out of the same arm.
   */
  const sweep = (f: Film, wet: number, coat: number, dt: number): void => {
    const w = f.wipe;
    // Time at the park runs whatever the arms are doing — it is what says
    // how long the glass has been left alone, and a screen with no arm over
    // it has been left alone since the start of the stage. Zeroed below the
    // moment a stroke is actually moving.
    w.parkAge += dt;
    if (f.blades.length === 0) return;
    // Rain starts them at a hint of it; dry grime has to have properly
    // built up first. See `WIPE`.
    const need = Math.max(wet, coat);
    if (!w.running) {
      if (wet < WIPE.rain && coat < WIPE.grime) return;
      w.running = true;
      w.phase = 0;
    }
    if (f.rest > 0) {
      f.rest -= dt;
      return;
    }
    w.period = (STROKE.slow + (STROKE.fast - STROKE.slow) * Math.min(1, need * 1.3)) * f.rate;
    w.parkAge = 0;
    const was = w.angle;
    w.phase += (Math.PI * 2 * dt) / w.period;
    if (w.phase >= Math.PI * 2) {
      // A stroke always finishes: the blades stop at the park, never
      // halfway up the glass. Where they go from there is the whole switch:
      // a clean enough screen parks them, rain keeps them going (with a
      // beat between strokes while it is only spitting), and a DRY screen
      // that is merely dusty gets one stroke and a long wait.
      w.phase = 0;
      // With no pane there is nothing per-vertex to smear, so the stroke
      // takes its share off the one number the arms are reading instead —
      // which is what stops a filmless car's wipers running for the rest of
      // the stage on a coat that never comes down.
      if (f.count === 0) f.level *= SMEAR;
      if (need < WIPE.off) w.running = false;
      else if (wet < WIPE.rain) f.rest = REST.dry;
      else if (wet < 0.4) f.rest = REST.drizzle * (1 - wet);
    }
    w.angle = w.park + (w.sweep * (1 - Math.cos(w.phase))) / 2;
    for (const blade of f.blades) blade.rotation.z = w.angle;

    const lo = Math.min(was, w.angle) - WIPE_EDGE;
    const hi = Math.max(was, w.angle) + WIPE_EDGE;
    for (const pivot of f.pivots) {
      const inner = pivot.reach * BLADE.from;
      for (let k = 0; k < f.count; k++) {
        const r = pivot.radius[k];
        if (r < inner || r > pivot.reach) continue;
        const a = pivot.angle[k];
        if (a < lo || a > hi) continue;
        // Streaked rather than flat: what a blade leaves is arcs, and the
        // vertex's own soiling bias is the noise they come off.
        f.coat[k] *= SMEAR * (0.4 + 1.2 * (f.bias[k] as number));
      }
    }
  };

  const update = (wet: number, spray: number, travel: number, dt: number): void => {
    for (const f of films) {
      // The two arrivals are metered by different things (see `SOIL`), so
      // they are resolved into this step's COAT before they are added: one
      // over the seconds that passed, the other over the metres driven —
      // and the second only over the metres driven on something that is
      // throwing anything (`spray`).
      const rain = f.soil.rain * wet * dt;
      const road = f.soil.road * spray * travel;
      const laid = rain + road;
      if (laid > 0) {
        f.mud += (road / laid - f.mud) * Math.min(1, laid * 5);
        // Rain is what makes road grime MUD rather than dust, and it takes
        // a moment either way — a shower does not turn the dust on a screen
        // brown the instant it starts.
        f.soak += (Math.min(1, wet * 3) - f.soak) * Math.min(1, dt * 1.5);
        f.level = Math.min(1, f.level + laid);
        for (let k = 0; k < f.count; k++) {
          f.coat[k] = Math.min(1, f.coat[k] + laid * f.bias[k]);
        }
      }
      // What the arms answer to is what is on the part of the glass they
      // can actually clear, and the weather about to put more there — the
      // two handed over separately, because they mean different things to
      // the blades (see `sweep`).
      // A pane with no arm has no swept set to average, and its `level` is
      // the running total above — nothing reads it, because nothing sweeps
      // it, but zeroing it here would be a lie in the one field that says
      // how dirty the glass is.
      if (f.count > 0 && f.swept.length > 0) {
        let sum = 0;
        for (let i = 0; i < f.swept.length; i++) sum += f.coat[f.swept[i] as number] as number;
        f.level = sum / f.swept.length;
      }
      sweep(f, wet, f.level, dt);

      let moved = false;
      for (let k = 0; k < f.count && !moved; k++) {
        moved = Math.abs(f.coat[k] - f.shown[k]) > 1 / 32;
      }
      if (moved) paint(f);
    }
  };

  /** The films in pane order: the screen, the backlight, then the flanks'
   * windows two at a time — the right flank's, then the left's — which is
   * the order `screenPanes` hands them out in. */
  const filmsOf = (pane: GlassPane): Film[] => {
    if (pane === "glassF") return films.slice(0, 1);
    if (pane === "glassB") return films.slice(1, 2);
    const perFlank = Math.max(0, (films.length - 2) / 2);
    const from = pane === "glassR" ? 2 : 2 + perFlank;
    return films.slice(from, from + perFlank);
  };

  const shatter = (pane: GlassPane): void => {
    for (const f of filmsOf(pane)) {
      f.ceiling = 0;
      f.coat.fill(0);
      f.level = 0;
      paint(f);
    }
  };

  const dispose = (): void => {
    filmGeo?.dispose();
    for (const geo of bladeGeos) geo.dispose();
  };

  return { group, front: films[0]?.wipe ?? null, film: filmMesh, shatter, update, dispose };
}

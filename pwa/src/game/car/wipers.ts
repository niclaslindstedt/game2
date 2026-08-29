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
//   THE BLADES. A tandem pair on the windscreen and a single arm on the
//   backlight, each a rigid body pivoting in the plane of its own screen.
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

import * as THREE from "three";

import { NO_DIRT } from "../car-dirt.ts";
import { MeshBuilder, patchAt, patchNormal, shadeFactor, type V3 } from "./builder.ts";
import { GLASS_LIFT, screenPanes, type ScreenPane } from "./greenhouse.ts";
import type { CarBodySpec } from "./spec.ts";

/** How far proud of the panel the film and the blades sit, m. Both clear
 * the glass (`GLASS_LIFT`), and the blades clear the film. */
const FILM_LIFT = GLASS_LIFT + 0.003;
const BLADE_LIFT = GLASS_LIFT + 0.014;

/** The grid each screen is tessellated into. The resolution is not about
 * how fine the dirt is — it is about the EDGE of the swept arc, which is
 * the one line on the whole car the eye reads as "a wiper did that". At a
 * handful of cells across, a blade's fan comes out as three big triangles
 * of clean glass and reads as a texture glitch; the arc has to have an arc
 * in it.
 *
 * It is not free, though, and it is the reason `film` exists: at this
 * resolution the two panes are 3,456 triangles — more than a third of the
 * whole car — drawn in the transparent pass, with their colours rewritten
 * and re-uploaded on every frame the coat moves. On the car being driven
 * that is the right bill for the one surface the player looks THROUGH; on
 * anybody else's it buys nothing at any distance a rival is ever seen at. */
const GRID = { front: { cols: 36, rows: 24 }, rear: { cols: 36, rows: 24 } };

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

/** Most of the film a full coat can reach, 0..1 of opaque — short of 1, so
 * even a caked screen is still glass rather than a painted panel. High: the
 * back window of a car that has done a gravel stage is a window you cannot
 * see out of, and the whole point of the blade is that it cuts a hole in
 * something. */
const COAT_MAX = 0.88;

/** What soils a screen, at a downpour and at a filthy car — and the two
 * are measured against different things, which is the whole of why they
 * are separate numbers rather than one. Rain falls on a car whether or not
 * it is moving, so `rain` is coat per SECOND and films a screen in seconds.
 * Road spray is thrown by the wheels, so `road` is coat per METRE driven
 * and takes most of a stage: a car standing still on the gravel has nothing
 * arriving at its glass, however filthy the rest of it already is.
 *
 * The BACKLIGHT is the other way round from the windscreen — it sits out of
 * the rain and in the wake, which is exactly why it is the window that ends
 * a rally caked. */
const SOIL = {
  front: { rain: 0.5, road: 0.0023 },
  rear: { rain: 0.2, road: 0.005 },
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

export type CarWipers = {
  group: THREE.Group;
  /** The grime pane itself — handed out so the assembly can order it over
   * the glass it is laid on, which no distance sort can be trusted to get
   * right for two surfaces three millimetres apart. Null on a car built
   * without one, where the arms still sweep and there is simply nothing on
   * the glass for them to take off. */
  film: THREE.Mesh | null;
  /**
   * Drive the glass one step.
   *
   * `wet` is how hard it is raining on the car, 0..1 (the environment owns
   * that number); `dirt` is how filthy the car has got, which is the same
   * reading the lamps are dimmed by; `travel` is how far it drove this step,
   * m, which is what decides how much of that filth reaches the glass.
   */
  update: (wet: number, dirt: number, travel: number, dt: number) => void;
  dispose: () => void;
};

/** A screen's own metric frame: an origin at the middle of its bottom edge,
 * `right` across it, `up` along it, `normal` out of it. Built from the
 * patch rather than assumed, because a windscreen is a warped quad and the
 * backlight's own v axis runs the other way. */
type Frame = {
  origin: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  height: number;
};

function vec(p: V3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

function frameOf(pane: ScreenPane): Frame {
  const { patch, rect } = pane;
  const uMid = (rect.u0 + rect.u1) / 2;
  // Which v edge is the BOTTOM is the screen's own business: the windscreen
  // runs cowl → roof and the backlight roof → deck.
  const low = vec(patchAt(patch, uMid, rect.v0));
  const high = vec(patchAt(patch, uMid, rect.v1));
  const flip = low.y > high.y;
  const vBottom = flip ? rect.v1 : rect.v0;
  const vTop = flip ? rect.v0 : rect.v1;

  const origin = vec(patchAt(patch, uMid, vBottom));
  const up = vec(patchAt(patch, uMid, vTop)).sub(origin);
  const height = up.length() || 1;
  up.divideScalar(height);

  const left = vec(patchAt(patch, rect.u0, vBottom));
  const right = vec(patchAt(patch, rect.u1, vBottom)).sub(left);
  const width = right.length() || 1;
  right.divideScalar(width);
  // Orthogonalise against `up`, then point the frame the same way the panel
  // faces — a left-handed frame would sweep the blades behind the glass.
  right.addScaledVector(up, -right.dot(up)).normalize();
  const normal = vec(patchNormal(patch));
  if (new THREE.Vector3().crossVectors(right, up).dot(normal) < 0) right.negate();
  return { origin, right, up, normal, width, height };
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
  pivots: Pivot[];
  blades: THREE.Object3D[];
  park: number;
  sweep: number;
  rate: number;
  /** Where the blades are in their stroke: the phase of the out-and-back,
   * the angle it last put them at, and the rest before the next one. */
  phase: number;
  angle: number;
  rest: number;
  running: boolean;
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

/** Build the arms, and — when `film` is set — the grime pane they clear.
 * Only the car the player is IN needs the pane: it is the surface they look
 * through, and it is also a third of the car's triangles and a colour buffer
 * rewritten as the coat moves. Everyone else gets the arms alone. */
export function buildWipers(
  spec: CarBodySpec,
  material: THREE.Material,
  filmMaterial: THREE.Material,
  film = true,
): CarWipers {
  const group = new THREE.Group();
  const panes = screenPanes(spec);
  const armed = spec.cabin.wipers === true;

  const position: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  const films: Film[] = [];
  const bladeGeos: THREE.BufferGeometry[] = [];

  for (const which of ["front", "rear"] as const) {
    const pane = panes[which];
    const grid = GRID[which];
    const arm = ARMS[which];
    const frame = frameOf(pane);
    const offset = position.length / 3;
    const cols = grid.cols;
    const rows = grid.rows;
    const count = film ? (cols + 1) * (rows + 1) : 0;

    // The film follows the patch's own warp rather than a plane through it,
    // so it lies on the glass at the corners as well as the middle.
    const local: number[] = [];
    if (film) {
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const u = pane.rect.u0 + ((pane.rect.u1 - pane.rect.u0) * i) / cols;
          const v = pane.rect.v0 + ((pane.rect.v1 - pane.rect.v0) * j) / rows;
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
    const spread = (Math.max(...arm.pivots.map(Math.abs)) * frame.width) / 2;
    const clear = (frame.width / 2 - spread) / Math.max(0.2, Math.abs(Math.sin(arm.park)));
    // A shade OVER the half-width rather than under it. The tip of a parked
    // blade sitting exactly on the glass edge is a blade that looks short;
    // a real one runs to the edge and disappears under the trim, and the
    // few centimetres of overhang are what let the fan reach up the screen
    // instead of stopping halfway. Much more than this and the arm swings
    // out over the bodywork, which is the one way this reads as wrong from
    // every angle at once.
    const reach = Math.min(frame.height * arm.reach, clear * 1.06);
    const pivots: Pivot[] = [];
    const blades: THREE.Object3D[] = [];
    const geo = armed ? bladeGeometry(reach) : null;
    if (geo) bladeGeos.push(geo);
    const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.normal);
    for (const at of arm.pivots) {
      const px = (at * frame.width) / 2;
      const py = arm.base * frame.height;
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
      blade.rotation.z = arm.park;
      mount.add(blade);
      group.add(mount);
      blades.push(blade);
    }

    const shade = shadeFactor(patchNormal(pane.patch));
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
    const swungLo = Math.min(arm.park, arm.park + arm.sweep) - WIPE_EDGE;
    const swungHi = Math.max(arm.park, arm.park + arm.sweep) + WIPE_EDGE;
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
      soil: SOIL[which],
      swept: Int32Array.from(reachable),
      mud: 0,
      soak: 0,
      tone: new THREE.Color(),
      shade,
      pivots,
      blades,
      park: arm.park,
      sweep: arm.sweep,
      rate: which === "rear" ? REAR_RATE : 1,
      phase: 0,
      angle: arm.park,
      rest: 0,
      running: false,
    });
  }

  let filmGeo: THREE.BufferGeometry | null = null;
  let colors: THREE.Float32BufferAttribute | null = null;
  let filmMesh: THREE.Mesh | null = null;
  if (film) {
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
      arr[i + 3] = f.coat[k] * COAT_MAX;
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
    if (f.blades.length === 0) return;
    // Rain starts them at a hint of it; dry grime has to have properly
    // built up first. See `WIPE`.
    const need = Math.max(wet, coat);
    if (!f.running) {
      if (wet < WIPE.rain && coat < WIPE.grime) return;
      f.running = true;
      f.phase = 0;
    }
    if (f.rest > 0) {
      f.rest -= dt;
      return;
    }
    const period = (STROKE.slow + (STROKE.fast - STROKE.slow) * Math.min(1, need * 1.3)) * f.rate;
    const was = f.angle;
    f.phase += (Math.PI * 2 * dt) / period;
    if (f.phase >= Math.PI * 2) {
      // A stroke always finishes: the blades stop at the park, never
      // halfway up the glass. Where they go from there is the whole switch:
      // a clean enough screen parks them, rain keeps them going (with a
      // beat between strokes while it is only spitting), and a DRY screen
      // that is merely dusty gets one stroke and a long wait.
      f.phase = 0;
      // With no pane there is nothing per-vertex to smear, so the stroke
      // takes its share off the one number the arms are reading instead —
      // which is what stops a filmless car's wipers running for the rest of
      // the stage on a coat that never comes down.
      if (f.count === 0) f.level *= SMEAR;
      if (need < WIPE.off) f.running = false;
      else if (wet < WIPE.rain) f.rest = REST.dry;
      else if (wet < 0.4) f.rest = REST.drizzle * (1 - wet);
    }
    f.angle = f.park + (f.sweep * (1 - Math.cos(f.phase))) / 2;
    for (const blade of f.blades) blade.rotation.z = f.angle;

    const lo = Math.min(was, f.angle) - WIPE_EDGE;
    const hi = Math.max(was, f.angle) + WIPE_EDGE;
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

  const update = (wet: number, dirt: number, travel: number, dt: number): void => {
    for (const f of films) {
      // The two arrivals are metered by different things (see `SOIL`), so
      // they are resolved into this step's COAT before they are added: one
      // over the seconds that passed, the other over the metres driven.
      const rain = f.soil.rain * wet * dt;
      const road = f.soil.road * dirt * travel;
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
      if (f.count > 0) {
        let sum = 0;
        for (let i = 0; i < f.swept.length; i++) sum += f.coat[f.swept[i] as number] as number;
        f.level = f.swept.length > 0 ? sum / f.swept.length : 0;
      }
      sweep(f, wet, f.level, dt);

      let moved = false;
      for (let k = 0; k < f.count && !moved; k++) {
        moved = Math.abs(f.coat[k] - f.shown[k]) > 1 / 32;
      }
      if (moved) paint(f);
    }
  };

  const dispose = (): void => {
    filmGeo?.dispose();
    for (const geo of bladeGeos) geo.dispose();
  };

  return { group, film: filmMesh, update, dispose };
}

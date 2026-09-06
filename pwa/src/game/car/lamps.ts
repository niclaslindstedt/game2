// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The lamps: headlamps, tail clusters, corner indicators and the rally
// pods. Two things separate a lamp from every other panel on the car, and
// both of them are the reason this is its own module.
//
// A lamp is DEEP. A real one is a bowl — a housing standing proud of the
// panel, a reflector sloping back into it, divider bars breaking the lens
// into cells, and the bulb's hot spot on the floor of each. Drawn as one
// flat coloured plate on the cap it reads as a sticker at any distance,
// because what says "lamp" is not the colour: it is the ring of shading
// around the bowl and the frame cutting across it. That geometry is what
// this file is for, and it is what the polygons are spent on.
//
// A lamp is also SWITCHED. Everything else on the body takes the time of
// day as a multiply into its material colour (car-mesh.ts), which is right
// for paint and exactly backwards here: the darker the stage gets, the
// BRIGHTER a lamp is. So every lit surface goes onto a second builder —
// `LampSurfaces.lens` — whose mesh carries its own material, switched
// between an off and an on tone rather than tinted with the rest of the
// car. Housings, bezels and divider bars are hardware, and stay on `body`.

import { mixHex, type MeshBuilder, type V3 } from "./builder.ts";
import type { CarBodySpec, Indicators, LampPods, Lights, TailLights } from "./spec.ts";

/** How far a lamp's PAN — the floor of its bowl — sits off the cap it is
 * bolted to, m. Enough to beat depth fighting at any camera distance, and
 * no more: everything else about a lamp is built outward from here.
 *
 * Outward, because the cap it stands on is a solid face. Sink the bowl into
 * the panel instead and the pan and the bulb end up BEHIND that face, which
 * draws over them — leaving a ring of reflector around a hole full of body
 * paint. That reads exactly like a flat sticker, which is the thing this
 * module exists to stop. A real lamp of this era stands proud of the panel
 * anyway; the housing around it is what makes that read as deliberate. */
const PROUD = 0.01;
/** The reflector floor, as a fraction of the rim opening. A bowl this steep
 * gives every wall a different angle to the baked sun, which is the whole
 * reason the lamp reads as a hollow instead of a panel. */
const FLOOR = 0.44;
/** The bulb's hot spot on that floor, as a fraction of it. */
const CORE = 0.44;
/** The three tones a bowl is painted in, brightest last: the reflector
 * walls, the pan they sweep back to, and the bulb burning on it. */
type LampTone = { wall: number; pan: number; core: number };

/** Every real reflector is CHROME, and what makes a tail lamp red is the
 * glass in front of it. There is no glass here — a translucent pane over a
 * lamp this size is a draw call and a sorting problem for something two
 * pixels wide — so a coloured lamp fakes it the other way round: the bowl
 * itself is painted in the lens colour, and only the bulb burns through it
 * toward white. Which is also what a lit cluster looks like from behind.
 *
 * The lift is deliberately shallow. The lamp has to read as its COLOUR
 * first and as a lamp second: at the few car lengths a chase is fought
 * over, a bowl lifted far enough to look hot up close is a white smear
 * where a red light should be. */
function glassTone(lens: number): LampTone {
  return { wall: lens, pan: mixHex(lens, 0xffffff, 0.2), core: mixHex(lens, 0xffffff, 0.55) };
}

/** ...and a clear lamp, where the chrome is the whole point: the bowl is
 * silver whatever tone the lens is, so the baked sun has two tones to put
 * a shadow across instead of white on white. */
function chromeTone(lens: number): LampTone {
  return { wall: 0xa8b0ba, pan: mixHex(lens, 0xffffff, 0.35), core: 0xffffff };
}

/** The two surfaces a lamp is built across. `body` is hardware and takes
 * the environment's tint with the rest of the car; `lens` is switched. */
export type LampSurfaces = { body: MeshBuilder; lens: MeshBuilder };

/** The name on the lenses' material. car-mesh.ts's `tintCar` matches it to
 * leave the lenses OUT of the environment tint, and drives them itself. */
export const LENS_MATERIAL = "car-lens";

/** A ring in a z-plane, or — with `zIn` ≠ `zOut` — the wall of a reflector
 * bowl sweeping from `rIn` at `zIn` back to the rim at `rOut`, `zOut`.
 *
 * The winding is derived once rather than guessed at: with x = r·cos θ and
 * y = r·sin θ, stepping OUTWARD in radius and then FORWARD in angle gives a
 * +z normal, and that still holds when the outward step also moves toward
 * +z. So `facing` −1 reverses the cycle, and a bowl opening toward the tail
 * is the nose one mirrored. */
export function ring(
  b: MeshBuilder,
  cx: number,
  cy: number,
  rIn: number,
  zIn: number,
  rOut: number,
  zOut: number,
  color: number,
  facing: number,
  facets = 12,
): void {
  const p = (r: number, z: number, a: number): V3 => [
    cx + r * Math.cos(a),
    cy + r * Math.sin(a),
    z,
  ];
  for (let i = 0; i < facets; i++) {
    const a0 = (i / facets) * Math.PI * 2;
    const a1 = ((i + 1) / facets) * Math.PI * 2;
    const q = [p(rIn, zIn, a0), p(rOut, zOut, a0), p(rOut, zOut, a1), p(rIn, zIn, a1)];
    if (facing > 0) b.quad(q[0], q[1], q[2], q[3], color);
    else b.quad(q[3], q[2], q[1], q[0], color);
  }
}

/** A flat disc — the degenerate ring, and the shape a bezel, an exhaust
 * mouth or a bulb plate wants. */
export function disc(
  b: MeshBuilder,
  cx: number,
  cy: number,
  z: number,
  r0: number,
  r1: number,
  color: number,
  facing: number,
  facets = 12,
): void {
  ring(b, cx, cy, r0, z, r1, z, color, facing, facets);
}

/** One lamp cluster's place on the car, in car space. */
export type LampAnchor = { x: number; y: number; z: number; width: number; height: number };

/** Where a car's lamp clusters sit, one per side — the same numbers the
 * lenses below are laid on. The bloom over each pair (car-mesh.ts) and the
 * beams both ends throw (environment.ts) read these, so restyling a face
 * moves a lamp and its light together instead of leaving a bloom floating
 * off the corner. Empty where a spec has no lamps at that end.
 *
 * On a quad-headlight face the anchor is the cluster's optical CENTRE, not
 * whichever of the pair was authored first: one beam belongs to the pair. */
export function frontLampAnchors(spec: CarBodySpec): LampAnchor[] {
  const l = spec.front?.lights;
  if (!l) return [];
  const outer = l.pairGap === undefined ? l.x : l.x + l.pairGap;
  const outerSize = l.pairGap === undefined ? l.size : (l.pairSize ?? l.size);
  const span = Math.abs(outer - l.x) + l.size + outerSize;
  return [-1, 1].map((side) => ({
    x: (side * (l.x + outer)) / 2,
    y: l.y,
    z: spec.profile[0].z,
    width: span,
    height: (l.kind === "round" ? l.size : (l.height ?? l.size)) * 2,
  }));
}

/** ...and the clusters at the other end, where `x` already IS the centre. */
export function rearLampAnchors(spec: CarBodySpec): LampAnchor[] {
  const l = spec.rear?.lights;
  if (!l) return [];
  return [-1, 1].map((side) => ({
    x: side * l.x,
    y: l.y,
    z: spec.profile[spec.profile.length - 1].z,
    width: l.width,
    height: l.height,
  }));
}

/** The housing around a lamp opening, as FOUR BARS rather than a plate: a
 * plate here sits in front of the bowl and hides the whole lamp. Each bar
 * is a box spanning the cap out to the rim, so the housing has real depth
 * where the light catches it from three-quarters on — which is the angle a
 * chased car is seen at, and the angle a flat lamp gives itself away at. */
function frame(
  b: MeshBuilder,
  cx: number,
  cy: number,
  zMid: number,
  halfW: number,
  halfH: number,
  bar: number,
  depth: number,
  color: number,
): void {
  const outerW = (halfW + bar) * 2;
  for (const side of [-1, 1]) {
    b.box(cx, cy + side * (halfH + bar / 2), zMid, outerW, bar, depth, color);
    b.box(cx + side * (halfW + bar / 2), cy, zMid, bar, halfH * 2, depth, color);
  }
}

/** A rectangular reflector bowl with the bulb's hot spot on its floor: four
 * walls sloping from the rim opening back into the car, the floor, and the
 * filament plate over it. `dir` is the cap's outward direction, so the one
 * routine serves the nose and the tail — mirroring across z reverses the
 * winding, which is what `dir` is doing in every `quad` below. */
function bowl(
  b: MeshBuilder,
  cx: number,
  cy: number,
  zPan: number,
  halfW: number,
  halfH: number,
  depth: number,
  dir: number,
  tone: LampTone,
): void {
  const zRim = zPan + dir * depth;
  const fw = halfW * FLOOR;
  const fh = halfH * FLOOR;
  // Rim and floor as matching rectangles, corners counter-clockwise seen
  // from outside the cap, so a wall is one step outward then one forward.
  const rect = (w: number, h: number, z: number): V3[] => [
    [cx - w, cy - h, z],
    [cx + w, cy - h, z],
    [cx + w, cy + h, z],
    [cx - w, cy + h, z],
  ];
  const rim = rect(halfW, halfH, zRim);
  const floor = rect(fw, fh, zPan);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const q = [floor[i], rim[i], rim[j], floor[j]];
    if (dir > 0) b.quad(q[0], q[1], q[2], q[3], tone.wall);
    else b.quad(q[3], q[2], q[1], q[0], tone.wall);
  }
  if (dir > 0) b.quad(floor[0], floor[1], floor[2], floor[3], tone.pan);
  else b.quad(floor[3], floor[2], floor[1], floor[0], tone.pan);
  // The filament, a few millimetres off the pan so it wins the depth test
  // against the pan it is lying on at every camera distance.
  const hot = rect(fw * CORE, fh * CORE, zPan + dir * 0.005);
  if (dir > 0) b.quad(hot[0], hot[1], hot[2], hot[3], tone.core);
  else b.quad(hot[3], hot[2], hot[1], hot[0], tone.core);
}

/** The round version: a cone of reflector back to a bulb plate. */
function bowlRound(
  b: MeshBuilder,
  cx: number,
  cy: number,
  zPan: number,
  radius: number,
  depth: number,
  dir: number,
  tone: LampTone,
  facets = 12,
): void {
  const zRim = zPan + dir * depth;
  const r = radius * FLOOR;
  ring(b, cx, cy, r, zPan, radius, zRim, tone.wall, dir, facets);
  disc(b, cx, cy, zPan, 0, r, tone.pan, dir, facets);
  disc(b, cx, cy, zPan + dir * 0.005, 0, r * CORE, tone.core, dir, facets);
}

/** A cluster: a framed opening divided into cells across its width, each
 * cell its own bowl. One cell is a sealed-beam unit; three with a divider
 * between them is the segmented tail light every car of this era wore. */
function cluster(
  s: LampSurfaces,
  cx: number,
  cy: number,
  z: number,
  halfW: number,
  halfH: number,
  cells: number,
  depth: number,
  dir: number,
  tone: LampTone | LampTone[],
  bar: number,
  barColor: number,
): void {
  const zPan = z + dir * PROUD;
  // The housing stands from the cap out past the rim, and is centred there.
  const stand = PROUD + depth;
  const zMid = z + (dir * stand) / 2;
  if (bar > 0) frame(s.body, cx, cy, zMid, halfW, halfH, bar, stand, barColor);
  const cellW = (halfW * 2) / cells;
  const gap = cells > 1 ? Math.min(bar > 0 ? bar : 0.012, cellW * 0.18) : 0;
  for (let i = 0; i < cells; i++) {
    const x = cx - halfW + cellW * (i + 0.5);
    // A list of tones is one per cell, in the cluster's own -x → +x order;
    // a short list runs out into its last entry.
    const cell = Array.isArray(tone) ? tone[Math.min(i, tone.length - 1)] : tone;
    bowl(s.lens, x, cy, zPan, cellW / 2 - gap / 2, halfH, depth, dir, cell);
    // The divider between this cell and the next, standing the same height
    // as the housing so the two read as one moulding.
    if (i < cells - 1) {
      s.body.box(x + cellW / 2, cy, zMid, gap, halfH * 2, stand, barColor);
    }
  }
}

/** The headlamps. A round face gets sealed-beam bowls behind a bezel ring;
 * a rectangular one gets the same framed, celled cluster the tail wears. */
export function buildHeadlights(s: LampSurfaces, l: Lights, z: number): void {
  const lens = l.color ?? 0xf7f2dc;
  const bezel = l.bezel ?? 0;
  const bezelColor = l.bezelColor ?? 0xb9bec6;
  const depth = l.depth ?? 0.05;
  const lamps: { x: number; size: number }[] = [{ x: l.x, size: l.size }];
  if (l.pairGap !== undefined) {
    lamps.push({ x: l.x + l.pairGap, size: l.pairSize ?? l.size });
  }
  for (const side of [-1, 1]) {
    for (const lamp of lamps) {
      const x = side * lamp.x;
      if (l.kind === "round") {
        if (bezel > 0) {
          // A sleeve, not a flat washer: the ring runs from the rim out
          // front back down to the cap, so the chrome has a lit side and a
          // shaded one the way a real bezel does.
          const zRim = z + PROUD + depth;
          ring(s.body, x, l.y, lamp.size, zRim, lamp.size + bezel, z + PROUD, bezelColor, 1);
        }
        bowlRound(s.lens, x, l.y, z + PROUD, lamp.size, depth, 1, chromeTone(lens));
      } else {
        const h = l.height ?? lamp.size * 0.55;
        cluster(
          s,
          x,
          l.y,
          z,
          lamp.size,
          h,
          l.cells ?? 2,
          depth,
          1,
          chromeTone(lens),
          bezel,
          bezelColor,
        );
      }
    }
  }
}

/** The tail clusters: the main lens across the top, and — where a spec asks
 * for one — the reverse/amber band under it, both divided into the same
 * cells so the divider bars line up down the whole cluster. A cluster that
 * runs its colours ACROSS instead (`cellColors`) gets one tone per cell. */
export function buildTailLights(s: LampSurfaces, l: TailLights, z: number): void {
  const lens = l.color ?? 0xc4231b;
  const lower = l.lower ?? 0;
  const cells = l.cells ?? 2;
  const depth = l.depth ?? 0.038;
  const bar = l.bezel ?? 0.016;
  const barColor = l.bezelColor ?? 0x1a1d22;
  const halfW = l.width / 2;
  for (const side of [-1, 1]) {
    const x = side * l.x;
    const upperH = (l.height * (1 - lower)) / 2;
    const upper = l.y + (l.height * lower) / 2;
    // The cells are laid -x → +x, so the outboard-first list reads straight
    // on the left cluster and backwards on the right one.
    const tones = l.cellColors?.map(glassTone);
    const tone = tones ? (side < 0 ? tones : [...tones].reverse()) : glassTone(lens);
    cluster(s, x, upper, z, halfW, upperH, cells, depth, -1, tone, bar, barColor);
    if (lower > 0) {
      const lowerH = (l.height * lower) / 2;
      cluster(
        s,
        x,
        l.y - (l.height * (1 - lower)) / 2,
        z,
        halfW,
        lowerH,
        cells,
        depth * 0.7,
        -1,
        glassTone(l.lowerColor ?? 0xe0a326),
        bar,
        barColor,
      );
    }
  }
}

/** The corner lamps. Small enough that a bowl is all they get — a frame
 * this size closes the opening rather than framing it. */
export function buildIndicators(s: LampSurfaces, ind: Indicators, z: number, dir: number): void {
  const lens = ind.color ?? 0xe89b23;
  for (const side of [-1, 1]) {
    bowl(
      s.lens,
      side * ind.x,
      ind.y,
      z,
      ind.width / 2,
      ind.height / 2,
      0.028,
      dir,
      glassTone(lens),
    );
  }
}

/** The rally lamp bar: a stub barrel on the bumper with a bowl in the front
 * of it. The bracket is implied by the bumper it stands on, which keeps a
 * pod to a barrel and a lens. */
export function buildLampPods(s: LampSurfaces, pods: LampPods, trim: number): void {
  const lens = pods.color ?? 0xf7f2dc;
  for (const x of pods.offsets) {
    s.body.box(
      x,
      pods.y,
      pods.z - pods.radius * 0.6,
      pods.radius * 1.9,
      pods.radius * 1.9,
      0.1,
      trim,
    );
    bowlRound(s.lens, x, pods.y, pods.z, pods.radius, pods.radius * 0.8, 1, chromeTone(lens), 10);
  }
}

// ── What the car actually lights the road with ────────────────────────────
//
// Everything above builds a lamp so it READS as one. This is the other half
// of the same numbers: what each of those lamps THROWS, as a list of light
// sources the renderer can hang real beams on (environment.ts) and the dust
// register can be filled from (dust-light.ts).
//
// It is derived rather than authored because a lamp's optics are already
// implied by the panel it is let into. A car with four round lamps has two
// low beams and two driving beams; a car with one wide cluster each side has
// two; a car carrying a pod bar has those as well, and a pod is a SPOT — the
// same bulb behind a deeper reflector, so nearly all of it goes down a narrow
// cone. Restating that per car in a table would be three chances to have a
// face and its light disagree, which is the bug this module already exists
// to stop for the bloom (`frontLampAnchors`).

/** What a light source is FOR, which is the whole of what decides its shape.
 * A `main` is a low beam: a wide pool a car length or two ahead. A `spot` is
 * aimed down the road and reaches twice as far in a third of the width. A
 * `flood` is the opposite trade — short, broad, and what fills in the ditch
 * at the edge of a night stage. A `tail` is a marker: it exists to be seen,
 * not to see by. */
export type LampRole = "main" | "spot" | "flood" | "tail";

/** One light source on one car, in car space. `power` is against a full-size
 * lamp of its own role, so a machine that can afford four beams and one that
 * can afford two both light the road with the STRONGEST lamps this car has
 * rather than with an average of all of them. */
export type LampSource = {
  role: LampRole;
  /** Signed offset from the centreline, m — the lens's own place. */
  x: number;
  /** Height above the contact patch, m. */
  y: number;
  /** Along the car, nose positive, m. */
  z: number;
  power: number;
  /** Half-angle of the cone, rad. */
  cone: number;
  /** How far the light carries, m. */
  reach: number;
  /** How far below the horizontal it is aimed, rad. */
  tilt: number;
  /** How far OUTWARD it is aimed, rad per metre it sits off the centreline.
   * Real headlamps are near enough parallel; splaying them is what turns one
   * pool into the double-lobed one a car actually lays down, and it is the
   * per-role figure because a pod aimed sideways is a pod aimed wrong. */
  splay: number;
};

/** The aperture a lamp is measured against, m — a full-size sealed beam of
 * the period, and about the widest thing any of the shipped faces carries.
 * The light a reflector gathers goes with its AREA, which is why the ratio
 * below is squared: the difference between a 160 mm lamp and a 200 mm one is
 * a third of the light, not a fifth of it. */
const FULL_APERTURE = 0.115;

/** ...and the band that ratio is held inside. A lamp is never worth nothing —
 * a spec is allowed to author a small one and it still has to light the road
 * enough to be worth a beam — and never worth more than a shade over a full
 * one, because a big cluster is big for the look of the car and not because
 * somebody fitted an aircraft landing light to it. */
const POWER_FLOOR = 0.4;
const POWER_CEILING = 1.15;

/** What each role does with the light it gathers, and the shape it throws. */
const ROLE_OPTICS: Record<LampRole, Omit<LampSource, "role" | "x" | "y" | "z" | "power">> = {
  main: { cone: 0.42, reach: 70, tilt: 0.072, splay: 0.26 },
  spot: { cone: 0.25, reach: 105, tilt: 0.04, splay: 0.06 },
  flood: { cone: 0.66, reach: 30, tilt: 0.14, splay: 0.45 },
  tail: { cone: 0.8, reach: 18, tilt: 0.125, splay: 0.45 },
};

/** ...and the gain the same bulb gets from that optic on the axis of its own
 * cone. A spot is the identical lamp with all of it pointed one way, so it is
 * brighter where it is looking and dark everywhere else; a flood pays for its
 * width out of the same bulb. */
const ROLE_GAIN: Record<LampRole, number> = { main: 1, spot: 1.45, flood: 0.78, tail: 1 };

/** How strong a lamp of this aperture in this role is. */
function lampPower(role: LampRole, aperture: number): number {
  const gathered = (aperture / FULL_APERTURE) ** 2 * ROLE_GAIN[role];
  return Math.min(POWER_CEILING, Math.max(POWER_FLOOR, gathered));
}

/** A rectangular lens as the round one it gathers as much light as. */
function equivalent(halfW: number, halfH: number): number {
  return Math.sqrt(halfW * halfH);
}

function source(role: LampRole, x: number, y: number, z: number, aperture: number): LampSource {
  return { role, x, y, z, power: lampPower(role, aperture), ...ROLE_OPTICS[role] };
}

/** Strongest first, and — between two of a kind — the outboard pair first,
 * so a machine that can only afford two beams lights the road with the pair
 * that is furthest apart and gets the widest pool out of them. Every source
 * is authored as a symmetric pair, so an even budget always takes whole
 * pairs and a car never drives round with one lamp lit. */
function ranked(sources: LampSource[]): LampSource[] {
  return sources.sort((a, b) => b.power - a.power || Math.abs(b.x) - Math.abs(a.x));
}

/** THE HEADLAMPS AND THE PODS, as light sources. The bigger lamp of a pair
 * is the low beam and the smaller one beside it the driving beam — which is
 * the way round a quad face of this era was actually wired, and the reason
 * the inner lamps of one are the ones that reach. A pod row is a spot where
 * it is the biggest on the car and a flood where it is not: a rally bar is
 * two of each, and which is which is the size of the bowl.
 *
 * The CELLS of one opening are not two sources, for the reason the tail's
 * are not: a low/high pair inside one housing is 18 cm apart, and two cones
 * that close cast one pool at every distance a car is seen from. So a face
 * throws as many beams as it has housings — which is what makes a quad car
 * four and a wide-cluster car two, and the wide-cluster car's two the
 * strongest on the roster, because that is what the bowls measure. */
export function headLampSources(spec: CarBodySpec): LampSource[] {
  const out: LampSource[] = [];
  const l = spec.front?.lights;
  const z = spec.profile[0].z;
  if (l) {
    const inner = l.kind === "round" ? l.size : equivalent(l.size, l.height ?? l.size * 0.55);
    const outerSize = l.pairSize ?? l.size;
    const outer =
      l.kind === "round" ? outerSize : equivalent(outerSize, l.height ?? outerSize * 0.55);
    // One lamp each side is the low beam whatever it measures. A pair gets
    // the role off the bowls: the wider one gathers more and spreads it.
    const paired = l.pairGap !== undefined;
    const lamps: { x: number; aperture: number; role: LampRole }[] = paired
      ? [
          { x: l.x, aperture: inner, role: inner >= outer ? "main" : "spot" },
          { x: l.x + l.pairGap!, aperture: outer, role: outer > inner ? "main" : "spot" },
        ]
      : [{ x: l.x, aperture: inner, role: "main" }];
    for (const lamp of lamps) {
      for (const side of [-1, 1]) out.push(source(lamp.role, side * lamp.x, l.y, z, lamp.aperture));
    }
  }
  const pods = spec.front?.lampPods;
  const rows = pods ? (Array.isArray(pods) ? pods : [pods]) : [];
  const biggest = rows.reduce((r, row) => Math.max(r, row.radius), 0);
  for (const row of rows) {
    const role: LampRole = row.radius >= biggest ? "spot" : "flood";
    for (const x of row.offsets) out.push(source(role, x, row.y, row.z, row.radius));
  }
  return ranked(out);
}

/** ...and the tail clusters. One source per cluster: the cells of a period
 * cluster are centimetres apart, and at the reach a marker has there is no
 * telling two of them from one. */
export function tailLampSources(spec: CarBodySpec): LampSource[] {
  const l = spec.rear?.lights;
  if (!l) return [];
  const z = spec.profile[spec.profile.length - 1].z;
  const aperture = equivalent(l.width / 2, l.height / 2);
  return ranked([-1, 1].map((side) => source("tail", side * l.x, l.y, z, aperture)));
}

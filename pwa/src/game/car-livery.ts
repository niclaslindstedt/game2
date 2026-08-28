// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Paint schemes: a way to put one of the catalog's bodies on a stage in a
// color and a pattern it was not authored in. A livery is a palette plus a
// PATTERN — the shape the second color takes on the flank — and applying
// one rewrites a CarBodySpec's paint and its livery bands while leaving the
// car's hardware (bumpers, arch trim, rubbing strips, glass) exactly where
// the spec put it. That split is what `SideBand.role` is for.
//
// This is for the FIELD, not for the player: nothing here is exposed as an
// option, and the three catalog cars keep the liveries car-styles.ts
// authored for them. A start list picks by index, so the car you line up
// against in third place looks the same every time you line up against it.
//
// Every scheme is ORIGINAL, in the period rally idiom — blocked color, a
// swept crescent, a comb of pinstripes, a chequer run, a contrasting bonnet
// or roof, a door roundel. No real team's livery, sponsor mark or wordmark
// is reproduced, and no color pairing is used as a badge.
//
// Pure data — no three.js import — so Node tooling reads it the same way it
// reads car-styles.ts.

import type { CarBodySpec, DeckStripes, SideBand } from "./car-body.ts";

/** The shape a livery's second color takes on the flank. Each is a
 * different silhouette at 30 px in a chase cam, which is the only size that
 * decides whether two cars in a field read as two cars. */
export type PaintPattern =
  /** Nothing on the flank — the color and the roof do all the work. */
  | "solid"
  /** A crescent sweeping the length of the door under a fan of thinner
   * arcs: the shape a works livery draws to make a flat side look fast. */
  | "sweep"
  /** Front and rear painted apart on a raked seam, with a comb of
   * pinstripes stepping across the join. */
  | "split"
  /** Three fine lines running the whole flank and kicking up at the tail. */
  | "pinstripe"
  /** A contrasting bonnet and rear quarter, the quarter slashed by a
   * chevron. */
  | "panel"
  /** Two-tone: everything under the belt line in the second color, with a
   * divider along the join. */
  | "duotone"
  /** A chequer run along the rocker, two rows deep. */
  | "chequer"
  /** Blocked front wing and rear quarter with the door left bare — the
   * clubman scheme a roundel sits in the middle of. */
  | "blocks"
  /** Longitudinal stripes over the bonnet and the boot, carried onto the
   * flank as one low band. */
  | "bands";

export type Livery = {
  /** The body color. */
  paint: number;
  /** The pattern's own color — the one that draws the shape. */
  accent: number;
  /** The third color: the fine lines inside a pattern, and the shade a
   * two-tone drops to. Readable against BOTH of the others. */
  detail: number;
  /** Wheel centers. Rally cars run painted rims, and it is the cheapest
   * per-car tell there is at distance. */
  hub: number;
  /** Whether the roof and its pillars take the accent. */
  roof: "paint" | "accent";
  pattern: PaintPattern;
  /** Competition number for the door roundel. */
  number: string;
};

type Palette = { paint: number; accent: number; detail: number; hub: number };

/** The palettes. Each is a body color, the color that draws the pattern on
 * it, a third for fine detail, and a rim color — picked so every pair still
 * separates in fog, at dusk, and against the greens and gravel greys the
 * stages are made of. A body color is never so dark it reads as a hole nor
 * so pale it disappears into a dust cloud. */
const PALETTES: Palette[] = [
  { paint: 0x1b3f8f, accent: 0xe8dc3c, detail: 0x5fc2e6, hub: 0xc9ced5 },
  { paint: 0xf2efe6, accent: 0xc4211d, detail: 0x1f3f7a, hub: 0xbe3227 },
  { paint: 0x1d4a37, accent: 0xa8d030, detail: 0xf2efe6, hub: 0xe4e0d4 },
  { paint: 0xb2b8c0, accent: 0xdd6412, detail: 0x22262c, hub: 0x2a2e34 },
  { paint: 0x6b1a2b, accent: 0xe7dcc0, detail: 0xd2a13c, hub: 0xd2a13c },
  { paint: 0x1a6f78, accent: 0xf2efe6, detail: 0xe8663c, hub: 0xe4e0d4 },
  { paint: 0xe8b820, accent: 0x21356b, detail: 0xf2efe6, hub: 0x2b3a5e },
  { paint: 0xd4581c, accent: 0xf2efe6, detail: 0x22262c, hub: 0xe4e0d4 },
  { paint: 0x3d4658, accent: 0xe0c14a, detail: 0xd44b2a, hub: 0xd2a13c },
  { paint: 0x8c2f8f, accent: 0xb8e02c, detail: 0xf2efe6, hub: 0xe4e0d4 },
  { paint: 0x2f6bd4, accent: 0xf2efe6, detail: 0xe23c78, hub: 0xf0ece0 },
  { paint: 0xe2ddc8, accent: 0x7a4420, detail: 0xd4801c, hub: 0x9a6a34 },
  { paint: 0x0f7a4c, accent: 0xf2efe6, detail: 0xc4211d, hub: 0xc9ced5 },
  { paint: 0x9fb2c8, accent: 0xc4211d, detail: 0x21356b, hub: 0x2a2e34 },
];

const PATTERNS: PaintPattern[] = [
  "sweep",
  "split",
  "pinstripe",
  "panel",
  "duotone",
  "chequer",
  "blocks",
  "bands",
  "solid",
];

/** Numbers a stage-rally field carries. Kept to one and two digits: the
 * door roundel is drawn from a 3x5 font and a third digit shrinks all of
 * them below what reads at any distance the car is seen from. */
const NUMBERS = [
  "2",
  "4",
  "6",
  "7",
  "8",
  "9",
  "11",
  "14",
  "16",
  "17",
  "19",
  "21",
  "23",
  "26",
  "31",
  "33",
  "38",
  "42",
  "44",
  "51",
];

/** How many liveries the field draws from before any pair of them shares
 * both a palette and a pattern. */
export const LIVERY_COUNT = PALETTES.length * PATTERNS.length;

/** How far the pattern table steps per slot. Coprime with its length, so
 * the step visits every pattern before repeating one. */
const PATTERN_STEP = 4;

/** A cheap integer scramble, so consecutive slots on a start list do not
 * walk the palette and the pattern tables in lockstep — two cars sharing a
 * pattern is fine, a whole field marching through the patterns in order is
 * not. */
function scramble(n: number): number {
  let h = (n + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The livery for a slot in the field. Deterministic and total: any integer
 * gets a scheme, and the same integer always gets the same one. */
export function liveryFor(slot: number): Livery {
  const i = Math.abs(Math.trunc(slot));
  const palette = PALETTES[i % PALETTES.length];
  const h = scramble(i);
  // The two tables are stepped through at coprime rates, so consecutive
  // slots share neither a palette nor a pattern and the pair only repeats
  // once every LIVERY_COUNT cars. A hash here instead would collide inside
  // the first handful of slots, which is exactly the range a start list
  // uses — a field of nine wants nine different schemes, not five.
  const pattern = PATTERNS[(i * PATTERN_STEP) % PATTERNS.length];
  return {
    ...palette,
    // A contrasting roof is the one livery cue that survives being seen
    // from directly behind, which is where a chased car is seen from — so
    // it is decided per slot rather than per palette, and the patterns
    // that already paint the shoulder skip it.
    roof: h % 5 === 0 || pattern === "solid" || pattern === "duotone" ? "accent" : "paint",
    pattern,
    number: NUMBERS[(h >>> 8) % NUMBERS.length],
  };
}

/** The measurements every pattern is authored against, read off whichever
 * body is being painted — the patterns have to land on a short upright
 * hatch and a long low sedan alike. */
type Metrics = {
  nose: number;
  tail: number;
  /** Front and rear axle centers, m. */
  front: number;
  rear: number;
  /** The flank's usable band: clear of the rocker below and the belt above. */
  low: number;
  high: number;
  /** Where the doors are — between the cowl and the rear of the cabin. */
  doorFront: number;
  doorRear: number;
};

function metricsOf(spec: CarBodySpec): Metrics {
  const nose = spec.profile[0].z;
  const tail = spec.profile[spec.profile.length - 1].z;
  const shift = spec.axleShift ?? 0;
  const flank = spec.beltY - spec.floorY;
  return {
    nose,
    tail,
    front: spec.wheelbase / 2 + shift,
    rear: -spec.wheelbase / 2 + shift,
    // The arch openings reach most of the way to the belt over each axle,
    // so a band's usable window is the middle of the side, not all of it.
    low: spec.floorY + flank * 0.2,
    high: spec.beltY - 0.02,
    doorFront: spec.cabin.cowlZ - 0.04,
    doorRear: spec.cabin.baseRearZ + 0.1,
  };
}

/** The flank shapes for one pattern. Bands are drawn in order, so a later
 * one lies over an earlier one. */
function flankBands(spec: CarBodySpec, livery: Livery): SideBand[] {
  const m = metricsOf(spec);
  const { accent, detail } = livery;
  const span = m.high - m.low;
  // Every pattern starts and stops inside the bodywork rather than at the
  // profile's end stations: a band run right to the cap wraps the corner
  // and shows as a smear on the nose.
  const front = m.nose - 0.1;
  const back = m.tail + 0.1;

  switch (livery.pattern) {
    case "solid":
      return [];

    case "sweep": {
      // A crescent: level at both ends, bellied down through the door, and
      // thickening toward the tail. Over it, two finer arcs on the same
      // curve — the fan is what stops the shape reading as a bent stripe.
      const wave = { amp: span * 0.16, cycles: 0.5, phase: 0.5 };
      const y = m.low + span * 0.24;
      return [
        {
          zFrom: front,
          zTo: back,
          yFrom: y,
          yTo: y + span * 0.34,
          wave,
          taper: 1.5,
          proud: 0.01,
          color: accent,
        },
        {
          zFrom: front,
          zTo: back,
          yFrom: y + span * 0.42,
          yTo: y + span * 0.5,
          wave,
          taper: 1.6,
          proud: 0.012,
          color: detail,
        },
        {
          zFrom: front,
          zTo: back,
          yFrom: y + span * 0.56,
          yTo: y + span * 0.62,
          wave,
          taper: 1.7,
          proud: 0.012,
          color: accent,
        },
      ];
    }

    case "split": {
      // The nose half in accent, its top edge raked down toward a seam in
      // the middle of the door, then a comb of vertical bars stepping the
      // color the rest of the way back. The comb is one band with `dashes`,
      // so every bar hugs the flare it crosses.
      const seam = (m.doorFront + m.doorRear) / 2;
      return [
        {
          zFrom: front,
          zTo: seam,
          yFrom: m.low - span * 0.3,
          yTo: m.high,
          taper: 0.55,
          proud: 0.01,
          overArch: "clip",
          color: accent,
        },
        {
          zFrom: seam,
          zTo: seam - Math.abs(m.doorRear - seam) * 0.9,
          yFrom: m.low,
          yTo: m.low + span * 0.72,
          dashes: { count: 5, duty: 0.42 },
          taper: 0.45,
          proud: 0.012,
          color: accent,
        },
      ];
    }

    case "pinstripe": {
      // Three fine lines running the whole car on ONE wave, which is what
      // makes them a set rather than three stripes. One and a half cycles
      // over the length puts a crest above each axle and the trough in the
      // middle of the door — so the lines climb the arches instead of being
      // eaten by them, and no line ever has to be clipped into another.
      const wave = { amp: span * 0.26, cycles: 1.5, phase: 0 };
      const y = m.low + span * 0.6;
      const line = (dy: number, color: number): SideBand => ({
        zFrom: front,
        zTo: back,
        yFrom: y + dy,
        yTo: y + dy + span * 0.06,
        wave,
        proud: 0.01,
        color,
      });
      return [line(0, detail), line(span * 0.075, accent), line(span * 0.15, detail)];
    }

    case "panel": {
      // A hard-edged block over the rear quarter, slashed by a chevron in
      // the third color. The bonnet takes the accent too (deckStripes).
      const quarter = (m.doorRear + m.rear) / 2;
      return [
        {
          zFrom: quarter + Math.abs(quarter - m.doorRear) * 0.6,
          zTo: back,
          yFrom: m.low,
          yTo: m.high,
          proud: 0.01,
          overArch: "clip",
          color: accent,
        },
        {
          zFrom: m.doorFront,
          zTo: back + Math.abs(back - quarter) * 0.2,
          yFrom: m.low + span * 0.26,
          yTo: m.low + span * 0.46,
          rise: span * 0.36,
          proud: 0.013,
          color: detail,
        },
      ];
    }

    case "duotone":
      // The split is cut into the loft (colors.lower), so all the flank
      // needs is the line that draws the join.
      return [
        {
          zFrom: front,
          zTo: back,
          yFrom: spec.beltY - span * 0.07,
          yTo: spec.beltY - span * 0.01,
          proud: 0.01,
          overArch: "ride",
          color: detail,
        },
      ];

    case "chequer": {
      // Two rows half a pitch out of step, run BETWEEN the arches. A
      // chequer taken the length of the car is eaten by both openings and
      // comes out as a row of blocks with two holes in it, which reads as
      // a bug; stopping it at the wheels reads as a decision.
      const r = spec.arches?.radius ?? spec.wheelRadius;
      const y = m.low + span * 0.16;
      const h = span * 0.3;
      const row = (dy: number, phase: number, color: number): SideBand => ({
        zFrom: m.front - r,
        zTo: m.rear + r,
        yFrom: y + dy,
        yTo: y + dy + h,
        dashes: { count: 6, duty: 0.5, phase },
        proud: 0.01,
        color,
      });
      return [row(0, 0, accent), row(h, 0.5, accent), row(0, 0.5, detail), row(h, 0, detail)];
    }

    case "blocks":
      // Front wing and rear quarter blocked, the door left bare for the
      // roundel — the scheme a club car is painted in over a weekend.
      return [
        {
          zFrom: front,
          zTo: m.doorFront,
          yFrom: m.low - span * 0.2,
          yTo: m.high,
          proud: 0.012,
          overArch: "clip",
          color: accent,
        },
        {
          zFrom: m.doorRear,
          zTo: back,
          yFrom: m.low - span * 0.2,
          yTo: m.high,
          proud: 0.012,
          overArch: "clip",
          color: accent,
        },
      ];

    case "bands":
      // The flank half of a full-length stripe set: one low band that ties
      // the bonnet's stripes to the boot's.
      return [
        {
          zFrom: front,
          zTo: back,
          yFrom: m.low,
          yTo: m.low + span * 0.16,
          proud: 0.01,
          overArch: "ride",
          color: accent,
        },
        {
          zFrom: front,
          zTo: back,
          yFrom: m.low + span * 0.19,
          yTo: m.low + span * 0.24,
          proud: 0.012,
          color: detail,
        },
      ];
  }
}

/** What the pattern puts on the horizontal surfaces. The bonnet and the
 * boot lid are the whole of the car a following driver sees over the wing,
 * and a scheme that stops at the shoulder reads as an unpainted car from
 * there. */
function deckStripes(spec: CarBodySpec, livery: Livery): DeckStripes[] {
  const m = metricsOf(spec);
  const hood = { zFrom: m.nose - 0.06, zTo: spec.cabin.cowlZ + 0.02 };
  // Only a car with a boot LID has a rear deck to paint. A hatchback's
  // tail is cabin all the way to the tailgate, and a stripe laid on the
  // silhouette there is drawn inside the greenhouse and never seen.
  const lid = spec.rear?.deck;
  const boot: DeckStripes[] = lid
    ? [
        {
          offsets: [-0.16, 0.16],
          width: 0.2,
          // From the back of the cabin rather than from the lid's own shut
          // line: a stripe that starts at the seam reads as a stub sitting
          // on the tail instead of as the run the bonnet's stripes finish.
          zFrom: spec.cabin.baseRearZ - 0.02,
          zTo: lid.zTo + 0.04,
          color: livery.accent,
        },
      ]
    : [];
  switch (livery.pattern) {
    case "bands":
      return [
        { offsets: [-0.16, 0.16], width: 0.2, ...hood, color: livery.accent },
        { offsets: [0], width: 0.06, ...hood, color: livery.detail },
        ...boot,
      ];
    case "panel":
      // A whole contrasting bonnet, edged in the third color.
      return [
        { offsets: [0], width: 1.05, ...hood, color: livery.accent },
        { offsets: [-0.48, 0.48], width: 0.05, ...hood, color: livery.detail },
      ];
    case "split":
    case "blocks":
      return [{ offsets: [0], width: 1.05, ...hood, color: livery.accent }];
    case "sweep":
    case "pinstripe":
      return [{ offsets: [0], width: 0.34, ...hood, color: livery.accent }];
    case "chequer":
      return [{ offsets: [-0.2, 0.2], width: 0.15, ...hood, color: livery.accent }];
    default:
      return [];
  }
}

/** The door roundel: an off-white panel with near-black digits, whatever
 * the car is painted. That pairing is the one thing on a rally car that is
 * never a style choice — it is what makes the number legible from a road
 * side at speed, and it is what makes the field countable on screen. */
const ROUNDEL = 0xf2efe6;
const ROUNDEL_INK = 0x16181c;

/** `base` repainted in `livery`: same body, same hardware, new paint. The
 * spec is deep-copied, so the catalog's own specs are never touched. */
export function applyLivery(base: CarBodySpec, livery: Livery): CarBodySpec {
  const spec: CarBodySpec = structuredClone(base);
  const m = metricsOf(spec);
  const flank = spec.beltY - spec.floorY;

  spec.colors = {
    ...spec.colors,
    paint: livery.paint,
    accent: livery.accent,
    hub: livery.hub,
    // Only a two-tone splits the loft; every other pattern is laid on top
    // of a single body color, and leaving `lower` set would put a seam
    // under all of them.
    lower: livery.pattern === "duotone" ? livery.detail : undefined,
  };
  spec.cabin = { ...spec.cabin, roofPaint: livery.roof };

  // Hardware bands survive the repaint; the old car's paint does not.
  const hardware = (spec.sideBands ?? []).filter((band) => band.role === "trim");
  spec.sideBands = [...hardware, ...flankBands(spec, livery)];

  const stripes = deckStripes(spec, livery);
  spec.stripes = stripes.length > 0 ? stripes : undefined;

  // The roundel sits in the middle of the door, sized off the flank so it
  // lands the same way on a tall hatch and a low sedan.
  const roundelH = flank * 0.62;
  spec.raceNumber = {
    text: livery.number,
    z: (m.doorFront + m.doorRear) / 2,
    y: spec.floorY + flank * 0.62,
    size: roundelH * 0.62,
    color: ROUNDEL_INK,
    panel: {
      width: roundelH * (livery.number.length > 1 ? 1.5 : 1.15),
      height: roundelH,
      color: ROUNDEL,
    },
  };
  return spec;
}

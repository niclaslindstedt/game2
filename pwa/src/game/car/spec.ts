// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The CarBodySpec vocabulary: every dimension, part and color a generated
// car is authored from. Pure types plus JSON-friendly shapes — the specs
// in car-styles.ts are plain data so Node tooling (scripts/car-preview.mjs)
// and the --variants iteration loop can read and clone them without a
// TypeScript build or a three.js import.
//
// Everything past the shell is OPTIONAL and defaults to off, so a new part
// can land here without touching a spec that does not want it.

/** One silhouette station: where the top surface (hood/roof-deck/trunk)
 * sits and how wide the belt line is at that point along the car. Stations
 * run nose (+z) → tail (−z); the loft interpolates linearly between them,
 * which is exactly the faceted look the art direction wants. */
export type ProfilePoint = {
  /** Position along the car, m — +z is the nose, −z the tail. */
  z: number;
  /** Height of the body's top surface at this station, m. */
  topY: number;
  /** Half-width at the belt line here, m. */
  half: number;
};

export type Spoiler =
  | { kind: "none" }
  /** A subtle lip riding the tail/hatch edge. */
  | { kind: "lip"; z: number; y: number; span: number; color?: number }
  /** The full rally wing: posts, blade, endplates. */
  | { kind: "wing"; z: number; y: number; span: number; chord: number; color?: number }
  /** A hatchback's roof-edge blade, on stubby end posts. */
  | { kind: "roof"; z: number; y: number; span: number; chord: number; color?: number };

/** Wheel faces, in rally-car vocabulary. `alloy` is a multi-spoke rim;
 * `steel` is a painted rim under a small hubcap; `split` is the wide
 * four-spoke period classic with a polished lip. */
export type WheelStyle = "alloy" | "steel" | "split";

/** A flat band laid on the flank between two z stations — livery stripes,
 * a rubbing strip, a rocker skirt. Heights are absolute, m. */
export type SideBand = {
  zFrom: number;
  zTo: number;
  /** What the band IS. `trim` is hardware that happens to be a band — a
   * rubbing strip, a sill skirt — and belongs to the car whatever it is
   * painted; `livery` (the default) is paint, and a repaint replaces it. */
  role?: "livery" | "trim";
  /** Band bottom and top, m — absolute heights, sampled onto whatever
   * width the flank has at each z. */
  yFrom: number;
  yTo: number;
  color: number;
  /** Rake, m — how much higher the band sits at its front end than its
   * rear, so a stripe can climb the fender the way a race livery does. */
  rise?: number;
  /** How far proud of the flank it floats, m. Bigger than a decal's few
   * mm turns the band into a physical rubbing strip. */
  proud?: number;
  /** What the band does where a wheel arch has cut the flank away.
   * `clip` (the default) lets the opening eat into it, so a painted panel
   * stops where the metal does; `ride` keeps the band's full height and
   * arcs it over the arch, the way a rocker stripe runs. */
  overArch?: "clip" | "ride";
  /** A sine swept along the band's length — the sweep a works livery draws
   * down the flank instead of a ruled line. `amp` is the peak rise in m,
   * `cycles` how many full waves fit across the span (0.5 is one arc, 1 a
   * dip between two crests), `phase` turns the wave in cycles. */
  wave?: { amp: number; cycles?: number; phase?: number };
  /** Height at the band's REAR end as a fraction of its front height. Under
   * 1 the band is a dart that sharpens toward the tail; over 1 it opens
   * out. The taper is taken off the top edge, so the bottom stays where it
   * was authored and the band reads as pinched rather than as sliding. */
  taper?: number;
  /** Break the band into evenly pitched blocks instead of one continuous
   * run: a chequer row, a dashed flash, a set of chevrons. `duty` is how
   * much of each pitch a block fills (0..1); `phase` shifts the ladder
   * along the span in pitches, and half a pitch on the second row is what
   * makes two rows a chequerboard. */
  dashes?: { count: number; duty?: number; phase?: number };
};

/** Stripes laid along the top surfaces — hood, boot lid. They sample the
 * silhouette, so a stripe that crosses a fold climbs it. */
export type DeckStripes = {
  /** x centers, m — one stripe per entry. */
  offsets: number[];
  width: number;
  zFrom: number;
  zTo: number;
  color?: number;
};

/** A grille: a recessed dark panel with a colored surround (the bright
 * frame a period hot hatch outlines its grille with) and bars across it. */
export type Grille = {
  /** Full width and height of the opening, m. */
  width: number;
  height: number;
  /** Center height above the ground, m. */
  y: number;
  /** How deep the panel sits into the nose, m. */
  depth?: number;
  /** Frame thickness, m. 0 leaves the grille flush with the paint. */
  surround?: number;
  surroundColor?: number;
  color?: number;
  /** Horizontal bars across the opening; 0 leaves it a plain dark mouth. */
  bars?: number;
  barColor?: number;
};

export type Lights = {
  kind: "round" | "rect";
  /** Center of the INNER lamp of each pair, m from the centerline. */
  x: number;
  y: number;
  /** Round: radius. Rect: half-width. Both m. */
  size: number;
  /** Rect lamps only — half-height, m. */
  height?: number;
  /** A second, smaller lamp outboard of the first (the quad-headlight
   * face). Distance from the inner lamp, m. */
  pairGap?: number;
  pairSize?: number;
  /** Chrome or black ring around each lamp, m of extra radius. On a
   * rectangular face it is the housing FRAME, and its own thickness. */
  bezel?: number;
  bezelColor?: number;
  color?: number;
  /** How far the reflector bowl sinks into the cap, m. */
  depth?: number;
  /** Rect lamps only — how many cells the opening is divided into across
   * its width. Two is a low/high pair; one is a single sealed unit. */
  cells?: number;
};

/** The tail cluster: one framed opening per side, divided into cells. */
export type TailLights = {
  /** Center of each cluster from the centerline, m. */
  x: number;
  y: number;
  width: number;
  height: number;
  color?: number;
  /** A second stripe under the red one — the amber/white of a period
   * cluster. Fraction of the cluster height, 0 disables. */
  lower?: number;
  lowerColor?: number;
  /** The housing frame around the cluster and between its cells, m. */
  bezel?: number;
  bezelColor?: number;
  /** How many cells the lens is divided into across its width. */
  cells?: number;
  /** How far the reflector bowls sink into the cap, m. */
  depth?: number;
};

/** Amber corner lamps, laid on the bumper's own face. */
export type Indicators = { y: number; x: number; width: number; height: number; color?: number };

/** The tow-hook lamp bar a rally car carries, x offsets in m. */
export type LampPods = { y: number; z: number; radius: number; offsets: number[]; color?: number };

/** The front clip: everything laid onto the nose cap. */
export type FrontSpec = {
  grille?: Grille;
  lights?: Lights;
  /** Amber corner lamps, sized as a fraction of the nose half-width. */
  indicators?: Indicators;
  /** The bumper bar. `wrap` runs it back along the flanks around the
   * corners; a shallow `height` reads as a 70s chrome blade, a deep one
   * as the plastic slab of an 80s car. */
  bumper?: { y: number; height: number; depth: number; wrap?: number; color?: number };
  /** Air dam / chin spoiler under the bumper. */
  splitter?: { y: number; height: number; depth: number; span: number; color?: number };
  /** Bonnet shut line: the hood's half-width and how far back it runs. */
  hood?: { half: number; zFrom: number; zTo: number };
  /** A tow hook / lamp bar the rally cars carry, x offsets in m. */
  lampPods?: LampPods;
};

/** A hatchback's tailgate: the panel that IS the back of the car, standing
 * on the tail cap between two heights with a shut line run round it.
 *
 * It gets its own geometry rather than a painted rectangle because it is
 * the one panel the chase camera holds for a whole stage — everything else
 * on a car is glimpsed, and this is looked at. */
export type Tailgate = {
  /** Bottom and top of the panel on the tail face, m. */
  yFrom: number;
  yTo: number;
  /** How far inboard of the flank the shut line runs, m. */
  inset: number;
  /** How far the panel stands proud of the cap, m. */
  proud?: number;
  /** Width of the dark shut line drawn round the panel, m. */
  seam?: number;
  /** The pressed grab recess the hatch is opened by: a dark let-in strip
   * across the panel. `y` is its centre height, m. */
  handle?: { y: number; width: number; height: number; color?: number };
  /** A raised rib across the panel — the pressed swage a tailgate stiffens
   * itself with, and the line that keeps a big flat panel from reading as
   * cardboard. `y` is its centre height, m. */
  rib?: { y: number; height: number; proud?: number; inset?: number; color?: number };
};

/** The rear clip: everything laid onto the tail cap. */
export type RearSpec = {
  lights?: TailLights;
  bumper?: { y: number; height: number; depth: number; wrap?: number; color?: number };
  /** Recessed number plate, m. */
  plate?: { y: number; width: number; height: number; color?: number };
  /** Exhaust pipe under the valance, at +x of the centerline (m). */
  exhaust?: { x: number; y: number; radius: number };
  /** Boot/hatch shut line — mirrors FrontSpec.hood on the tail deck. */
  deck?: { half: number; zFrom: number; zTo: number };
  /** The tailgate, for a car whose back is a door. */
  tailgate?: Tailgate;
  /** The panel under the rear bumper — the step a hatchback's tail drops
   * to, and what the exhaust comes out beneath. Mirrors FrontSpec.splitter
   * on the tail. */
  valance?: { y: number; height: number; depth: number; span: number; color?: number };
  /** Reversing lamps let into the valance or the bumper's face — the pair
   * of pale squares low on the back of a period rally car, and the one
   * thing down there that catches the light at all. */
  lamps?: Indicators;
};

export type CarBodySpec = {
  /** Belt-line silhouette, nose → tail. First/last stations are the caps. */
  profile: ProfilePoint[];
  /** Underside height, m — the body floor; wheels hang below it. */
  floorY: number;
  /** Belt line (widest point of the body side), m. */
  beltY: number;
  /** How much the flank tucks in below the belt (`rocker`) and above it
   * (`shoulder`), as fractions of the belt half-width. The defaults give a
   * softly rounded section; a boxy car wants both near 1, which is most of
   * what separates a slab-sided hatch from a curvy coupe. */
  side?: { rocker?: number; shoulder?: number };
  wheelbase: number;
  /** Shifts both axles toward the nose (+) or tail (−), m. */
  axleShift?: number;
  /** Lateral distance from centerline to each wheel's center, m. */
  trackHalf: number;
  wheelRadius: number;
  wheelWidth: number;
  wheelStyle?: WheelStyle;
  /** Spokes per wheel face, overriding the style's own count. */
  wheelSpokes?: number;
  /** Spoke width as a fraction of the tire radius, overriding the style's
   * own. A five-spoke with broad blades and a mesh with fine ones are the
   * same builder and the same count range — the width is what tells them
   * apart, so it belongs to the car rather than to the style. */
  wheelSpokeWidth?: number;
  /** Wheel arch openings cut into the flank. Without this the body sides
   * run straight down to the floor and the wheels read as bolted on. */
  arches?: {
    /** Opening radius, m. Bigger than wheelRadius leaves a visible gap. */
    radius: number;
    /** How far above the wheel center the arch is struck, m — raises the
     * whole opening without making it rounder. */
    lift?: number;
    /** Plastic arch extension bolted around the opening. */
    trim?: { width: number; drop: number; color?: number };
  };
  /** The glass house. roofPaint "accent" gives the rally two-tone roof. */
  cabin: {
    cowlZ: number;
    roofFrontZ: number;
    roofRearZ: number;
    baseRearZ: number;
    roofY: number;
    roofHalf: number;
    roofPaint?: "paint" | "accent";
    /** Body-colored frame left around the glass, m. The cabin is built as
     * a solid shell and the glass is cut into it, so these widths ARE the
     * pillars: a/b/c are the windscreen, door and rear posts. */
    pillars?: {
      a?: number;
      b?: number;
      c?: number;
      /** Metal under the side windows (the door top) and over them. */
      sill?: number;
      header?: number;
      /** B-pillar position along the cabin, 0 at the cowl, 1 at the tail. */
      split?: number;
      /** Extra sill under the rear quarter window — the rally kick-up. */
      quarterRise?: number;
      /** HOW MUCH OF THE CAR'S BACK THE BACKLIGHT TAKES, 0..1 of the
       * cabin's rear panel — a share rather than the `c` post's metres,
       * because what reads from behind is the PROPORTION of glass to
       * bodywork, and that has to hold on a narrow hatch and a wide coupe
       * alike. The rear post is thin where it crosses the screen and keeps
       * its width on the flank, which is what a real one does. */
      backWidth?: number;
    };
    pillarPaint?: "paint" | "accent";
    /** Rain gutters along the roof edges — the detail that dates a car to
     * the era both launch cars come from. Width in m. */
    gutter?: { width: number; color?: number };
    /** Arms on the glass: a single centre arm on each screen — the rally
     * answer rather than the road car's tandem pair — which sweep when
     * there is something on the screen to clear (car/wipers.ts). Off leaves
     * the car with glass that soils and never comes clean. */
    wipers?: boolean;
    /** Black-out band around the glass openings, m. Reads as the rubber
     * seal that separates a glass opening from a painted panel. */
    seal?: number;
  };
  /** Fender flares: extra belt half-width over each axle, m. `smooth`
   * swells to a peak over the axle and tapers away; `box` holds the full
   * width across the whole length and steps off at each end, which is the
   * bolted-on Group-4 look. */
  flare?: { extra: number; length: number; kind?: "smooth" | "box" };
  spoiler?: Spoiler;
  /** Accent stripes laid on the hood/deck. A list runs several groups —
   * hood stripes and a boot-lid block are different runs of the same
   * vocabulary, and one spec wants both. */
  stripes?: DeckStripes | DeckStripes[];
  /** Panel shut lines cut into the flank, at these z positions (m). */
  doorSeams?: number[];
  /** Livery and trim bands on the flank, drawn in order. */
  sideBands?: SideBand[];
  /** A racing number on each door, drawn from a blocky 3x5 font. */
  raceNumber?: {
    text: string;
    z: number;
    y: number;
    /** Height of a digit, m. */
    size: number;
    color?: number;
    /** White (or accent) panel behind the digits — the door roundel. */
    panel?: { width: number; height: number; color?: number };
  };
  front?: FrontSpec;
  rear?: RearSpec;
  mudflaps?: boolean;
  mirrors?: boolean;
  /** Door handles on the flank, one per door seam gap. */
  handles?: { z: number[]; y: number };
  colors: {
    paint: number;
    accent: number;
    /** Second body color under the belt line — the two-tone that splits a
     * car horizontally. Cut into the loft rather than laid over it, so it
     * follows the flares exactly and wraps the nose and tail caps. */
    lower?: number;
    glass?: number;
    trim?: number;
    hub?: number;
    bumper?: number;
    /** Inside of the wheel arches and the underbody. */
    shadow?: number;
  };
};

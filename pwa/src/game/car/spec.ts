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
  | { kind: "roof"; z: number; y: number; span: number; chord: number; color?: number }
  /** A TAILGATE wing: a deep blade carried on two swept posts standing at
   * its ENDS, rising off the tailgate's top edge and back over the glass —
   * the whale tail of the late-80s homologation hatch. `z` and `y` are the
   * blade's centre; `post` is where the posts stand as a fraction of the
   * half span. `lip` adds the second, flat blade on the tailgate's own edge
   * under it — the extra the evolution model of such a car carried. */
  | {
      kind: "gate";
      z: number;
      y: number;
      span: number;
      chord: number;
      thick?: number;
      post?: number;
      lip?: { z: number; chord: number; span?: number };
      color?: number;
    };

/** Wheel faces, in rally-car vocabulary. `alloy` is a multi-spoke rim;
 * `steel` is a painted rim under a small hubcap; `split` is the wide
 * four-spoke period classic with a polished lip; `lattice` is the woven
 * cross-spoke mesh of the 80s performance saloon, every spoke running from
 * the hub to the rim a pitch off the radius so the two families cross. */
export type WheelStyle = "alloy" | "steel" | "split" | "lattice";

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
  /** How far the band's two ENDS lean, m of z per m of height: the top of
   * each end stands this much further forward than its foot, so the band
   * is a parallelogram with slanted ends and level edges — the diagonal
   * flash a works livery cuts across a door. `zFrom`/`zTo` are the ends at
   * `yFrom`; the band's top corners are that much further along. */
  slant?: number;
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

/** Stripes laid along the top surfaces — hood, boot lid, and the roof.
 * On the deck they sample the silhouette, so a stripe that crosses a fold
 * climbs it; on the roof they lie on the roof panel between its front and
 * rear edges. */
export type DeckStripes = {
  /** x centers, m — one stripe per entry. */
  offsets: number[];
  width: number;
  zFrom: number;
  zTo: number;
  color?: number;
  /** Which panel carries the run: the profile's deck (the default) or the
   * roof. A race car's twin stripes are two groups — one on the bonnet up
   * to the cowl, one on the roof — with the windscreen left between them. */
  on?: "deck" | "roof";
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
  /** Rect lamps only — how far the lens carries on round the corner along
   * the FLANK, m: the wraparound cluster of a late-eighties car, and the
   * whole of what a headlamp is from the side. Laid on the flank in the
   * lamp's own height, framed like the face. */
  wrap?: number;
  /** The colour of the wrap's trailing third — amber where that is the
   * side repeater. Left off, the whole wrap is the lamp's own glass. */
  wrapColor?: number;
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
  /** The lens colour of each cell, OUTBOARD cell first — the amber, red and
   * white a period cluster runs across its width in. A shorter list repeats
   * its last entry; left off, every cell is `color`. */
  cellColors?: number[];
  /** How far the reflector bowls sink into the cap, m. */
  depth?: number;
};

/** Amber corner lamps, laid on the bumper's own face. */
export type Indicators = { y: number; x: number; width: number; height: number; color?: number };

/** A row of auxiliary lamps on the nose, x offsets in m. One row is the
 * bumper bar; a car with a second, bigger pair up at the bonnet's corners
 * carries two rows. */
export type LampPods = { y: number; z: number; radius: number; offsets: number[]; color?: number };

/** A bumper bar. `wrap` runs it back along the flanks around the corners;
 * a shallow `height` reads as a 70s chrome blade, a deep one as the plastic
 * slab of an 80s car. `strip` is the rubbing strip let into a body-coloured
 * slab: a dark band across its face and round its wraps, which is most of
 * what stops a painted bumper reading as more bodywork. */
export type Bumper = {
  y: number;
  height: number;
  depth: number;
  wrap?: number;
  color?: number;
  /** The bar's full width, m. Left off it is the cap's; stated, the bar
   * can stand wider than the body it is bolted to — the aero bumper of a
   * late-80s saloon is the widest thing on the car, wider than the tail
   * above it — and its wraps run in from that width to the flank. */
  width?: number;
  strip?: { y: number; height: number; color?: number };
};

/** Louvred vents let into the bonnet, one per x offset, m — the pair over
 * the intercooler that mark out the turbocharged car from the one it was
 * built from. `z` is their centre along the car, `length` their run. */
export type HoodVents = {
  z: number;
  width: number;
  length: number;
  offsets: number[];
  color?: number;
};

/** The front clip: everything laid onto the nose cap. */
export type FrontSpec = {
  grille?: Grille;
  lights?: Lights;
  /** Amber corner lamps, sized as a fraction of the nose half-width. */
  indicators?: Indicators;
  bumper?: Bumper;
  /** Air dam / chin spoiler under the bumper. */
  splitter?: { y: number; height: number; depth: number; span: number; color?: number };
  /** Bonnet shut line: the hood's half-width and how far back it runs. */
  hood?: { half: number; zFrom: number; zTo: number };
  /** Vents let into that bonnet; they come off with it. */
  vents?: HoodVents;
  /** The auxiliary lamps the rally cars carry — one row, or several at
   * their own heights and sizes. */
  lampPods?: LampPods | LampPods[];
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
  bumper?: Bumper;
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
  /** The rim's diameter as a fraction of the tyre's. Left off, the rim
   * fills most of the wheel — the low-profile look. A period gravel wheel
   * is a fifteen-inch rim under a tall tyre and sits near two thirds; the
   * sidewall is most of what dates a wheel at any distance. */
  rimShare?: number;
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
    /** The roof's half-width at its REAR edge, m, where it differs from the
     * front's — a glasshouse that narrows toward the tail, the way a
     * fastback's does above its raked backlight. Left off, the roof is one
     * width. */
    roofRearHalf?: number;
    /** The roof's height at its REAR edge, m, where it falls toward the
     * backlight rather than running level to it. Left off, the roof is one
     * height. */
    roofRearY?: number;
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
      /** B-pillar position along the cabin, 0 at the cowl, 1 at the tail.
       * A FRACTION of the flank, so the post leans with the flank's own
       * rake — the roof edge is shorter than the sill, and a fixed share of
       * each lands at different z. */
      split?: number;
      /** The B-pillar's centre in METRES along the car (the sill's z),
       * overriding `split`. Stated this way the post stands PLUMB — its top
       * is placed straight above its foot — which is what a hatchback's
       * door frame does, and it is stated in metres so it can be put on the
       * same line as the `doorSeams` entry the door shuts against. */
      splitZ?: number;
      /** The quarter glass's REAR edge in METRES along the car, overriding
       * `c` the way `splitZ` overrides `split`: the edge is placed at one z
       * on the sill and on the roof edge alike, so it stands plumb, and what
       * is left of the flank behind it is the sail panel beside the
       * backlight — wide at the deck and a hand at the roof, which is what
       * the C-pillar of a three-door fastback IS. */
      quarterZ?: number;
      /** How far AHEAD of that foot the quarter glass's rear edge stands at
       * the roof, m — a trailing edge raked forward, the way a three-door
       * fastback's runs parallel to its backlight and leaves the sail panel
       * as a wedge behind it. Zero, the default, is a plumb edge. Only read
       * with `quarterZ`. */
      quarterRake?: number;
      /** The height, m, at which that raked trailing edge stops and the
       * glass turns DOWN to the sill — a rounded rear corner rather than
       * a point running on to the pillar. The tip the rake would have cut
       * is filled with the pillar's paint in two facets. Only read with
       * `quarterRake`. */
      quarterCornerY?: number;
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
    /** Scoops standing on the roof — the cabin vents a works car of the
     * late eighties wore at the front of its roof, one each side. `z` is
     * their centre along the car; `offsets` the x of each; the box is
     * `width` across, `length` along and `height` tall, m. */
    roofVents?: {
      z: number;
      offsets: number[];
      width: number;
      length: number;
      height: number;
      color?: number;
    };
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
  /** Mud flaps behind every wheel, in the trim colour — or, given an
   * object, in a colour of their own: a works car's flaps are the one
   * thing under the tail painted to be seen. */
  mudflaps?: boolean | { color: number };
  /** THE TAIL IN THE ROOF'S COLOUR: everything on the loft from this z
   * back — deck, flank and cap — and the boot lid over it, painted the
   * way the roof is, so an accent roof runs down the rear posts, across
   * the quarters and off the back. It is the blacked-out rear third of a
   * works sedan, and it is what the chase camera looks at all stage. The
   * break lands on a station of its own, and it must fall BEHIND the door
   * seams: a door skin is painted body colour whatever stands behind it. */
  tailPaint?: { z: number };
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

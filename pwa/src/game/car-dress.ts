// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A MODELLED CAR IS PAINTED, by the name of the material its builder
// gave each face (`scripts/blender/car.py`). A model carries no colour of
// its own that the game keeps: every face is a ROLE — the paint, the lower
// two-tone, the roof, a bumper, the tyre — and the role is dressed here off
// the CarBodySpec the car is built from, livery and all, exactly as the
// code-built car's own builders colour the same surface (car/shell.ts's
// `segmentColor` and `paintAt`, car/trim.ts, car/fascia.ts, car/wheels.ts).
// So a field car in a rival's scheme is the same model in that scheme, and
// the dirt, the scuffing and the door holes land on colours the damage
// model knows (car-damage.ts re-derives from them).
//
// DOM-free, so Node (the Blender driver hands the studio these colours) and
// the root suite (which holds every role `car.py` names to this table,
// `tests/models_test.ts`) both read it.

import type { CarBodySpec } from "./car/spec.ts";
import { SHINE } from "./car/builder.ts";
import { paintAt, roofColor, shade } from "./car/shell.ts";
import { TYRE_TONES } from "./car/wheels.ts";

/** Every role a modelled car's faces may carry. */
export const CAR_ROLES = [
  // The shell, as car/shell.ts paints its ring: the paint (and behind the
  // tail-paint break, the roof's colour), the two-tone under the belt, the
  // shut lines in shadow, the underbody and the wheel wells.
  "paint",
  "paint_tail",
  "lower",
  "lower_tail",
  "seam",
  "seam_lower",
  "seam_tail",
  "under",
  "well",
  // The greenhouse: the roof, the posts, the rubber round the glass, the
  // gutters and the roof scoops with their dark mouths.
  "roof",
  "pillar",
  "seal",
  "gutter",
  "vent",
  "vent_mouth",
  // The bolt-ons and the dress.
  "door",
  "hood",
  "hood_edge",
  "hatch",
  "hatch_edge",
  "bumper_f",
  "bumper_r",
  "strip_f",
  "strip_r",
  "spoiler",
  "spoiler_post",
  "mirror",
  "mirror_stalk",
  "mirror_glass",
  "flap",
  "arch_trim",
  "splitter",
  "valance",
  // A tailgate: the panel, the shut line round it, the pressed rib.
  "gate",
  "gate_line",
  "gate_rib",
  // The wheel.
  "tyre",
  "tread",
  "rim",
  "barrel",
  "dish",
  "bolt",
  "disc",
] as const;

export type CarRole = (typeof CAR_ROLES)[number];

const TRIM = 0x14181f;
const SHADOW = 0x191d24;
const SEAL = 0x14171c;
const BUMPER = 0x23272e;
const MIRROR_GLASS = 0x7e9fc7;
const BOLT = 0x2b3037;
const DISC = 0x55595f;
/** A shut line's shade of the panel it cuts (car/shell.ts's `SEAM_SHADE`),
 * and the bonnet's edge (car/fascia.ts's lid skirt). */
const SEAM_SHADE = 0.5;
/** A tailgate's shut line and its swage (car/fascia.ts's `buildTailgate`). */
const GATE_LINE = 0.42;
const GATE_RIB = 0.82;

function isRole(name: string): name is CarRole {
  return (CAR_ROLES as readonly string[]).includes(name);
}

/** The colour a role is painted on this body, as a hex — or null for a
 * name this table does not know (a material the game leaves as the model
 * made it). */
export function dressOf(name: string, spec: CarBodySpec): number | null {
  if (!isRole(name)) return null;
  const c = spec.colors;
  const tail = spec.tailPaint ? roofColor(spec) : c.paint;
  const hub = c.hub ?? 0xe6e3da;
  switch (name) {
    case "paint":
      return c.paint;
    case "paint_tail":
      return tail;
    case "lower":
      return c.lower ?? c.paint;
    case "lower_tail":
      return c.lower ?? tail;
    case "seam":
      return shade(c.paint, SEAM_SHADE);
    case "seam_lower":
      return shade(c.lower ?? c.paint, SEAM_SHADE);
    case "seam_tail":
      return shade(tail, SEAM_SHADE);
    case "under":
      return c.trim ?? TRIM;
    case "well":
      return c.shadow ?? SHADOW;
    case "roof":
      return roofColor(spec);
    case "pillar":
      return spec.cabin.pillarPaint === "accent" ? c.accent : c.paint;
    case "seal":
      return SEAL;
    case "gutter":
      return spec.cabin.gutter?.color ?? c.trim ?? TRIM;
    case "vent":
      return spec.cabin.roofVents?.color ?? c.trim ?? TRIM;
    case "vent_mouth":
      return c.shadow ?? SHADOW;
    case "door":
      return c.lower ?? c.paint;
    case "hood":
      return paintAt(spec, spec.front?.hood?.zFrom ?? 0);
    case "hood_edge":
      return shade(paintAt(spec, spec.front?.hood?.zFrom ?? 0), SEAM_SHADE);
    case "hatch":
      return paintAt(spec, spec.rear?.deck?.zFrom ?? 0);
    case "hatch_edge":
      return shade(paintAt(spec, spec.rear?.deck?.zFrom ?? 0), SEAM_SHADE);
    case "bumper_f":
      return spec.front?.bumper?.color ?? c.bumper ?? BUMPER;
    case "bumper_r":
      return spec.rear?.bumper?.color ?? c.bumper ?? BUMPER;
    case "strip_f":
      return spec.front?.bumper?.strip?.color ?? c.trim ?? TRIM;
    case "strip_r":
      return spec.rear?.bumper?.strip?.color ?? c.trim ?? TRIM;
    case "spoiler":
      return spec.spoiler && spec.spoiler.kind !== "none"
        ? (spec.spoiler.color ?? c.paint)
        : c.paint;
    case "spoiler_post":
      return spec.spoiler?.kind === "wing" ? (c.trim ?? TRIM) : dressOf("spoiler", spec)!;
    case "mirror":
      return c.paint;
    case "mirror_stalk":
      return c.trim ?? TRIM;
    case "mirror_glass":
      return c.glass ?? MIRROR_GLASS;
    case "flap":
      return typeof spec.mudflaps === "object" ? spec.mudflaps.color : (c.trim ?? TRIM);
    case "arch_trim":
      return spec.arches?.trim?.color ?? c.trim ?? TRIM;
    case "splitter":
      return spec.front?.splitter?.color ?? c.trim ?? TRIM;
    case "valance":
      return spec.rear?.valance?.color ?? c.trim ?? TRIM;
    case "gate":
      return c.paint;
    case "gate_line":
      return shade(c.paint, GATE_LINE);
    case "gate_rib":
      return spec.rear?.tailgate?.rib?.color ?? shade(c.paint, GATE_RIB);
    case "tyre":
      return TYRE_TONES.carcass;
    case "tread":
      return TYRE_TONES.tread;
    case "rim":
      return hub;
    case "barrel":
      return shade(hub, 0.6);
    case "dish":
      return shade(hub, 0.45);
    case "bolt":
      return BOLT;
    case "disc":
      return DISC;
  }
}

/** How much highlight a role holds (car/builder.ts's `SHINE`): lacquer,
 * chrome, rubber or plastic. */
export function shineOf(name: string): number {
  switch (name) {
    case "tyre":
    case "tread":
    case "seal":
    case "flap":
    case "mirror_stalk":
      return SHINE.rubber;
    case "under":
    case "well":
    case "vent_mouth":
    case "arch_trim":
    case "splitter":
    case "valance":
    case "strip_f":
    case "strip_r":
    case "gutter":
    case "vent":
    case "bolt":
    case "spoiler_post":
      return SHINE.trim;
    case "rim":
    case "barrel":
    case "dish":
    case "disc":
      return SHINE.chrome;
    case "mirror_glass":
      return SHINE.glass;
    default:
      return SHINE.paint;
  }
}

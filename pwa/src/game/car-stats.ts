// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car's spec sheet — what the pre-race page tells a player about the
// car they are about to choose.
//
// Every number here is DERIVED from the catalog (engine/game/defs/cars.ts)
// rather than authored beside it, so a car retuned in the catalog reads
// correctly on the card without anyone remembering a second table exists.
//
// The bars are RELATIVE TO THE ROSTER, not absolute: with three cars that
// differ by a few percent on some axes, a bar scaled against zero would
// show three identical full bars and say nothing. What a player wants from
// a spec sheet is which car is the quickest, the grippiest, the most
// willing to go sideways — so the roster's own spread is the scale, and
// `BAR_FLOOR` keeps the worst car's bar a bar rather than an empty slot.
//
// The roster is every car through EITHER GEARBOX, so the transmission the
// player is choosing under the sheet moves the bars it is worth something
// on as well as the figures above them.
//
// DOM-free: it is imported by a test, and the root test project has no DOM
// lib in it.

import { CARS, TUNING, gearedSpec, type CarSpec, type GearboxMode } from "@engine";

/** How much of the bar the roster's WORST car on an axis still fills. */
const BAR_FLOOR = 0.3;

/** The speed the acceleration figure is quoted to, m/s — 100 km/h, the
 * benchmark every road car has been measured against for sixty years. */
const SPRINT_TO = 100 / 3.6;

/** Top speed, km/h — the last gear's ceiling, through the chosen box. Drag
 * holds every car a few km/h under it on the flat, so this is billing
 * rather than a promise, the same way a manufacturer's figure is. */
export function topSpeedKph(spec: CarSpec, gearbox: GearboxMode): number {
  const geared = gearedSpec(spec, gearbox);
  return geared.gearTop[geared.gearTop.length - 1] * 3.6;
}

/** Seconds to reach `target` m/s from rest, integrating the box's own
 * per-gear acceleration and charging it for every shift taken on the way:
 * the manual pulls harder in each gear and hands a beat of throttle back at
 * each swap, and a figure that ignored the swaps would bill it as quicker
 * off the line than it is.
 *
 * The tires are still assumed to hook up — it is the paper figure, and what
 * the car does off a wet gravel start line is the TRACTION bar's job to
 * warn about. */
export function sprintTime(
  spec: CarSpec,
  gearbox: GearboxMode,
  target: number = SPRINT_TO,
): number {
  const geared = gearedSpec(spec, gearbox);
  // A healthy automatic swaps gears without lifting; the manual's cut is
  // the same one car.ts holds the throttle down for.
  const cut = gearbox === "manual" ? TUNING.gearbox.shiftCut : 0;
  let time = 0;
  let from = 0;
  for (let gear = 0; gear < geared.gearTop.length && from < target; gear += 1) {
    const to = Math.min(geared.gearTop[gear], target);
    time += (to - from) / geared.gearAccel[gear] + (gear > 0 ? cut : 0);
    from = to;
  }
  return time;
}

/** How hard the car can corner on a surface family, m/s² — the tire
 * compound against the chassis' own lateral limit, which is the number the
 * engine reads when it decides a turn has become a slide. */
function gripOn(spec: CarSpec, surface: "sealed" | "loose"): number {
  return spec.gripAccel * spec.tyres[surface];
}

/** Every box a car can be handed, which is the OTHER axis the bars are
 * scaled across (see `carBars`). */
const GEARBOXES: GearboxMode[] = ["auto", "manual"];

/** The axes a car is billed on, each a function of the catalog row and the
 * box it is driven through. Order is the order they are drawn in: what the
 * car DOES down the road first, then what it does in a corner.
 *
 * Most of them ignore the box, because a transmission only decides the
 * gearing and how much of the engine survives the trip to the road: the
 * tires, the brakes and the chassis are the car's whichever box is bolted
 * behind the engine. */
const AXES: {
  key: string;
  label: string;
  of: (spec: CarSpec, gearbox: GearboxMode) => number;
}[] = [
  // Quicker is better, so the bar reads the reciprocal of the time.
  { key: "accel", label: "ACCELERATION", of: (spec, gearbox) => 1 / sprintTime(spec, gearbox) },
  { key: "top", label: "TOP SPEED", of: topSpeedKph },
  { key: "traction", label: "TRACTION", of: (spec) => spec.traction },
  { key: "brake", label: "BRAKING", of: (spec) => spec.brake },
  { key: "sealed", label: "TARMAC GRIP", of: (spec) => gripOn(spec, "sealed") },
  { key: "loose", label: "GRAVEL GRIP", of: (spec) => gripOn(spec, "loose") },
  { key: "turn", label: "TURN-IN", of: (spec) => spec.steerRate },
  // How readily the car stays sideways once it is: yaw authority in the
  // slide against the lateral grip that would pull it straight again.
  { key: "slide", label: "SLIDE", of: (spec) => spec.driftYaw / spec.driftLat },
];

export type CarBar = {
  key: string;
  label: string;
  /** BAR_FLOOR..1 — where this car sits between the roster's worst and best
   * on the axis. Never 0: an empty bar reads as a missing value. */
  value: number;
};

/** Where every axis of one car, through one box, sits against the rest of
 * the roster.
 *
 * The scale spans every car through EVERY box rather than through the one
 * being asked about. That is what makes the transmission row visible up
 * here as well as in the figures: the manual's taller set is worth six
 * percent of top speed, and a scale rebuilt per box would renormalize that
 * away and draw the same bar for both. So the roster's best car in the
 * racing set is the full bar, and picking the automatic visibly gives some
 * of it back — while the sprint, charged for every shift the driver now has
 * to take, moves the other way. */
export function carBars(spec: CarSpec, gearbox: GearboxMode): CarBar[] {
  return AXES.map((axis) => {
    const all = CARS.flatMap((car) => GEARBOXES.map((box) => axis.of(car, box)));
    const low = Math.min(...all);
    const high = Math.max(...all);
    // A roster with one car, or an axis every car shares, is a full bar
    // rather than a division by zero.
    const share = high > low ? (axis.of(spec, gearbox) - low) / (high - low) : 1;
    return { key: axis.key, label: axis.label, value: BAR_FLOOR + (1 - BAR_FLOOR) * share };
  });
}

/** What each drive layout is called on the card. The three-letter form is
 * what a rally car wears; the word after it is for everyone who has never
 * had to know. */
export const DRIVE_LABELS: Record<CarSpec["drive"], { short: string; long: string }> = {
  fwd: { short: "FWD", long: "Front-wheel drive" },
  rwd: { short: "RWD", long: "Rear-wheel drive" },
  awd: { short: "AWD", long: "All-wheel drive" },
};

export type CarFact = { key: string; label: string; value: string };

/** The hard numbers, as figures rather than bars: the four a player reads
 * off a car before they look at anything else. Which wheels are driven is
 * not among them — the picker prints it under the car itself, and a fact
 * stated twice a hand's width apart reads as two different facts.
 *
 * They are quoted THROUGH the gearbox, because the two boxes are not the
 * same car: the manual's taller set and lower losses move both the top
 * speed and the sprint, and the transmission row sits directly under these
 * figures so flipping it has to move them. */
export function carFacts(spec: CarSpec, gearbox: GearboxMode): CarFact[] {
  return [
    { key: "top", label: "TOP SPEED", value: `${Math.round(topSpeedKph(spec, gearbox))} KM/H` },
    { key: "sprint", label: "0–100", value: `${sprintTime(spec, gearbox).toFixed(1)} S` },
    { key: "mass", label: "MASS", value: `${spec.mass} KG` },
    { key: "gears", label: "GEARS", value: `${spec.gearTop.length}` },
  ];
}

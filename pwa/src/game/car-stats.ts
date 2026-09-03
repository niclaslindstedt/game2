// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car's spec sheet — what the pre-race page tells a player about the
// car they are about to choose.
//
// Every number here is DERIVED from the catalog (engine/game/defs/cars.ts)
// rather than authored beside it, so a car retuned in the catalog reads
// correctly on the card without anyone remembering a second table exists.
//
// FOUR AXES, and no more. A card that billed eight was a card nobody read:
// MASS and GEARS are trivia a player cannot act on, BRAKING and TURN-IN
// separate the roster by a few percent, and TRACTION, TARMAC GRIP and
// GRAVEL GRIP were three bars answering one question. What is left is what
// a player actually chooses between — how quickly it gets going, how fast
// it ends up, how hard it holds on, and how far sideways it will go — and
// the space the other four gave back went to the car itself.
//
// The two the card can put a NUMBER on it puts a number on as well: a top
// speed in km/h and a sprint in seconds say what the car is, and the bar
// beside each says what it is against the other two. Neither reading is the
// other's — 223 km/h means nothing to a player who has not driven the
// roster, and a full bar means nothing to one deciding whether to take the
// long stage.
//
// The bars are RELATIVE TO THE ROSTER, not absolute: with three cars that
// differ by a few percent on some axes, a bar scaled against zero would
// show three identical full bars and say nothing. What a player wants from
// a spec sheet is which car is the quickest, the grippiest, the most
// willing to go sideways — so the roster's own spread is the scale, and
// `BAR_FLOOR` keeps the worst car's bar a bar rather than an empty slot.
//
// The scale spans every car through EITHER GEARBOX, so the transmission
// chosen above the sheet moves the two bars it is worth something on as
// well as the two figures. It cannot touch grip or drift: a box is gearing
// and losses, and none was ever fitted with different tires or a different
// driven axle.
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
 * the car does off a wet gravel start line is the GRIP bar's job to warn
 * about. */
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

/** HOW HARD THE CAR HOLDS ON — one number where the card used to print
 * three. Cornering grip is the tire compound against the chassis' own
 * lateral limit, averaged over the two surface families because a rally
 * stage is both and a player choosing a car has not seen the road yet;
 * `traction` multiplies it because putting the power down is the same
 * question asked longitudinally, and a car that spins its wheels off every
 * loose hairpin does not feel grippy however well it corners.
 *
 * Splitting the two surfaces back out is a real trade the roster makes —
 * the hatch's road rubber against the saloon's — but it is one the blurb
 * says in a sentence, and two bars that move in opposite directions on
 * every car is a comparison nobody completes. */
function gripOf(spec: CarSpec): number {
  return spec.gripAccel * ((spec.tyres.sealed + spec.tyres.loose) / 2) * spec.traction;
}

/** HOW FAR SIDEWAYS IT WILL GO. The layout's `depth` is the fraction of a
 * fully developed slide the car reaches on the wheel alone — 1 for the
 * rear-driver, which is what every other knob in the drift is calibrated
 * against — and the car's own yaw against the grip that would pull it
 * straight is how willingly it STAYS there once it is.
 *
 * The layout is the half that matters, and it is why this bar reads as a
 * rear-driver's bar: `driftYaw / driftLat` alone put the coupe within a
 * quarter of the saloon, which is not what the two cars do. */
function driftOf(spec: CarSpec): number {
  return TUNING.drivetrain[spec.drive].depth * (spec.driftYaw / spec.driftLat);
}

/** Every box a car can be handed, which is the OTHER axis the bars are
 * scaled across (see `carBars`). */
const GEARBOXES: GearboxMode[] = ["auto", "manual"];

/** The four axes a car is billed on, in the order they are drawn: what it
 * does down the road first, then what it does in a corner.
 *
 * The last two ignore the box, because a transmission only decides the
 * gearing and how much of the engine survives the trip to the road: the
 * tires and the driven axle are the car's whichever box is bolted behind
 * the engine. */
const AXES: {
  key: string;
  label: string;
  of: (spec: CarSpec, gearbox: GearboxMode) => number;
}[] = [
  // Quicker is better, so the bar reads the reciprocal of the time.
  { key: "accel", label: "ACCELERATION", of: (spec, gearbox) => 1 / sprintTime(spec, gearbox) },
  { key: "top", label: "TOP SPEED", of: topSpeedKph },
  { key: "grip", label: "GRIP", of: gripOf },
  { key: "drift", label: "DRIFTING", of: driftOf },
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
 * being asked about. That is what makes the transmission visible in the
 * bars as well as in the figures: the manual's taller set is worth six
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

export type CarFact = {
  key: string;
  label: string;
  /** The figure ITSELF, not a rendered string: the card counts to it when
   * the transmission or the car under it changes (`lib/count.ts`), and a
   * counter cannot interpolate "223 KM/H". */
  value: number;
  /** How many decimals it is read to. */
  places: number;
  /** What is written after it. */
  unit: string;
};

/** The hard numbers, as figures rather than bars: the two a player reads
 * off a car before they look at anything else. Which wheels are driven is
 * not among them — the picker prints it under the car itself, and a fact
 * stated twice a hand's width apart reads as two different facts. Neither
 * is the kerb weight or the number of ratios: both were trivia, and a card
 * that answers a question nobody asked is a card with less room for the
 * car.
 *
 * They are quoted THROUGH the gearbox, because the two boxes are not the
 * same car: the manual's taller set and lower losses move both the top
 * speed and the sprint, and the transmission block sits directly under
 * these figures so flipping it has to move them. */
export function carFacts(spec: CarSpec, gearbox: GearboxMode): CarFact[] {
  return [
    { key: "top", label: "TOP SPEED", value: topSpeedKph(spec, gearbox), places: 0, unit: "KM/H" },
    { key: "sprint", label: "0–100", value: sprintTime(spec, gearbox), places: 1, unit: "S" },
  ];
}

/** What the racing set is worth at the top end, as the whole percent the
 * card quotes. Read off the tuning rather than written into a sentence: a
 * retune of the ratios that left the card claiming six percent would be a
 * card lying about the only choice on it. */
export function manualGain(): number {
  return Math.round(
    (TUNING.gearbox.set.manual.gearing / TUNING.gearbox.set.auto.gearing - 1) * 100,
  );
}

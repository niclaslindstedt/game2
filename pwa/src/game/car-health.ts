// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW THE CAR IS FEELING, as four colours.
//
// The damage ledger (`engine/game/state.ts`) is nine crush depths, six
// system numbers, four wheels and a list of parts on the road behind the
// car — twenty-odd figures, none of which a driver can read at 140 km/h.
// This module folds them into the handful a SCHEMATIC can be painted with:
// one tier per piece of the car, drawn nose-up in hud-health.tsx.
//
// TWO RULES SHAPE EVERY WEIGHT BELOW.
//
// The first is that a REGION IS AS BAD AS THE WORST THING IN IT. The parts
// are summed with weights, but a vital one is not averaged away: an engine
// at the top of its ledger is a front compartment at 1, whatever the bonnet
// over it is doing, because the car is finished and the panel is not the
// news. `max` of the weighted parts, not their mean — a mean is how a dead
// engine comes out amber next to two sound headlamps.
//
// The second is that THE PANEL AND THE CALLS MAY NEVER DISAGREE. The middle
// of the screen says ENGINE DAMAGED / FAILING / DEAD on the lines in
// `TUNING.collision.callAt`, and a driver told one thing in words and
// another in colour believes neither. So the tiers ARE those lines: the
// three coloured ones are named for the three `DamageStage`s they are said
// on, and everything that is not a system ledger is remapped into the same
// space before it is read (`wheelScore`, `crushScore`).
//
// DOM-free on purpose — the drawing is next door, the arithmetic is here,
// and tests/car_health_test.ts reads this file.

import {
  FRONT_LAMPS,
  INTERNAL_SYSTEMS,
  REAR_LAMPS,
  TUNING,
  type CarDamage,
  type DamagePart,
  type DamageStage,
  type InternalSystem,
} from "@engine";

import { clamp } from "../lib/util.ts";

const C = TUNING.collision;

/** WHAT COLOUR A PIECE OF THE CAR IS. `ok` is green and is the only tier a
 * sound car ever shows; the other three are the engine's own damage stages,
 * because they are the lines the HUD already SAYS out loud. Yellow is a
 * part giving, orange is a part doing most of what it will ever do, red is
 * a part with nothing left. */
export type HealthTier = "ok" | DamageStage;

/** The lines a 0..1 score crosses, in the ledger's own space. */
export function healthTier(score: number): HealthTier {
  if (score >= C.callAt.dead) return "dead";
  if (score >= C.callAt.spent) return "spent";
  if (score >= C.callAt.hurt) return "hurt";
  return "ok";
}

/** THE PIECES THE SCHEMATIC IS SPLIT INTO — four panels down the plan, and
 * they are four because that is as many as a drawing the size of a stamp
 * can be read as. The engine bay is deliberately ONE: everything under the
 * bonnet is invisible from above and half of it has no shape worth drawing,
 * so the machinery is said again underneath as icons (`healthSystems`) and
 * the panel itself only carries how bad the front of the car is. */
export type HealthPanel = "nose" | "screen" | "cabin" | "tail";

export const HEALTH_PANELS: readonly HealthPanel[] = ["nose", "screen", "cabin", "tail"];

/** The whole car, ready to paint. Everything here is a tier — the scores
 * are spent on the way out, because the HUD refreshes twelve times a second
 * and a colour is what it draws. */
export type CarHealth = {
  /** The four body panels. */
  panels: Record<HealthPanel, HealthTier>;
  /** The four wheels, in SCREEN order — front-left, front-right, rear-left,
   * rear-right as the player sees them (see `SCREEN_WHEELS`). */
  wheels: HealthTier[];
  /** The four lamps, in SCREEN order — front-left, front-right, rear-left,
   * rear-right. A lamp is on the car or it is not, so these are only ever
   * `ok` or `dead`. */
  lamps: HealthTier[];
  /** The machinery, worst first and only where there is something to say:
   * a sound system is not on the list. This is the icon row under the car. */
  systems: { system: InternalSystem; tier: HealthTier }[];
  /** The worst tier anywhere on the car — the outline the whole schematic
   * stands on takes it, so the shape says at a glance what a read of the
   * parts says in detail. The LAMPS are left out of it: a lamp is binary,
   * so a car that clipped one hedge on a night stage would otherwise report
   * itself broken for the rest of the run, and a summary that says the
   * worst word for the smallest loss is a summary nobody reads twice. */
  worst: HealthTier;
};

/** THE FLIP, made once. The engine names its sides in its own frame
 * (positive `w` is its right) and the rendered world mirrors the map view,
 * so the engine's right-hand corner is the one the player sees on the LEFT
 * of the car in front of them — the same flip `wheelCall` and the audio
 * route make. The schematic is a plan of the car the player is looking at,
 * so it is drawn in the screen's frame and the swap happens here: these are
 * the engine's wheel indices in SCREEN order.
 *
 * `WHEEL_PARTS` is FL, FR, RL, RR in the ENGINE's frame; screen front-left
 * is therefore engine front-right, and so down the car. */
const SCREEN_WHEELS = [1, 0, 3, 2];

/** ...and the lamps the same way. `FRONT_LAMPS` / `REAR_LAMPS` are each
 * [engine left, engine right], so the screen reads them backwards. */
const SCREEN_LAMPS: readonly DamagePart[] = [
  FRONT_LAMPS[1],
  FRONT_LAMPS[0],
  REAR_LAMPS[1],
  REAR_LAMPS[0],
];

/** WHAT EACH PANEL IS MADE OF. One row per contributing piece of the
 * ledger, and the panel's score is the worst of them once each has been put
 * through its own weight — see the `max`-not-mean rule at the top.
 *
 * A weight is "how much of this panel is this part". 1 means the part IS
 * the panel: an engine at the top of its ledger paints the nose red on its
 * own, which is the whole point of drawing a compartment rather than a
 * bonnet. A panel that has come off the car scores `PART_GONE` — well past
 * amber, short of red, because a car missing its bonnet is badly hurt and
 * still going, and red is reserved for things that are finished. */
const PART_GONE = 0.9;

/** How much of a face's crush counts as that panel being finished. The
 * ledger caps every face at its own stroke — `zoneMax` for the ring and
 * the floorpan, the cage's `roofMax` for the roof — so a face folded to the
 * cage is a panel with nothing left — 1 — and everything under it ramps to
 * that. Read against the face's OWN cap, or a roof at the cage reads as a
 * roof barely marked. */
function crushScore(depth: number, cap: number = C.zoneMax): number {
  return clamp(depth / cap, 0, 1);
}

/** A WHEEL, remapped into the ledger's own space. The wheel ledger has two
 * landmarks the call ladder does not — `chassis.wheelFlat` is the tyre down
 * and the rim bent, 1 is the wheel on the road behind the car — so the two
 * are pinned together: a flat reads exactly where the HUD starts saying a
 * part is giving, and a wheel gone reads dead. Between them it ramps, which
 * is a corner riding further and further onto its hub. */
function wheelScore(damage: number): number {
  const flat = C.chassis.wheelFlat;
  if (damage >= 1) return 1;
  if (damage <= 0) return 0;
  if (damage < flat) return (damage / flat) * C.callAt.hurt;
  const past = (damage - flat) / (1 - flat);
  return C.callAt.hurt + past * (1 - C.callAt.hurt);
}

/** The worst of a set of scores, where an absent contributor is 0. */
function worstOf(scores: number[]): number {
  let worst = 0;
  for (const score of scores) if (score > worst) worst = score;
  return worst;
}

/** THE CAR, FOLDED DOWN TO ITS COLOURS. Everything the schematic paints,
 * off the one ledger the physics keeps. */
export function carHealth(damage: CarDamage): CarHealth {
  const gone = (part: DamagePart): number => (damage.broken.includes(part) ? PART_GONE : 0);
  const zone = (index: number): number => crushScore(damage.zones[index]);
  const sys = (system: InternalSystem): number => damage.systems[system];

  // THE NOSE is the engine bay, and the engine is the whole of it: a motor
  // at 1 is a run that is over where it stops, which is the most a panel
  // can ever have to say. The radiator is next — an engine's clock rather
  // than its end — then the rack that lives between the front wheels, then
  // the sheet metal in front of the lot.
  const nose = worstOf([
    sys("engine"),
    sys("cooling") * 0.9,
    sys("steering") * 0.8,
    gone("hood"),
    gone("bumperF") * 0.5,
    worstOf([zone(7), zone(0), zone(1)]),
  ]);
  // THE SCREEN is the glass and the roof over it. A windscreen gone is not
  // a panel: the driver is looking through the hole and steering late for
  // the rest of the stage (`damage.ts` charges it against steering), so it
  // is the one lost part that paints its panel red on its own.
  const screen = worstOf([
    damage.broken.includes("glassF") ? 1 : 0,
    gone("glassL") * 0.55,
    gone("glassR") * 0.55,
    crushScore(damage.roof, C.structure.roofMax),
  ]);
  // THE CABIN is the shell itself — the flanks, the doors, and the wear
  // that is the shell giving up its shape for good. Wear reaching 1 is the
  // wreck, so it goes in at its face value and nothing scales it.
  const cabin = worstOf([
    damage.wear,
    gone("doorL"),
    gone("doorR"),
    crushScore(damage.belly),
    worstOf([zone(2), zone(6)]),
  ]);
  // THE TAIL: the boot lid, the wing that was making downforce, the glass,
  // and the gearbox under the floor between them.
  const tail = worstOf([
    sys("gearbox") * 0.9,
    gone("hatch"),
    gone("glassB") * 0.6,
    gone("spoiler") * 0.5,
    gone("bumperR") * 0.5,
    worstOf([zone(3), zone(4), zone(5)]),
  ]);

  // A CORNER IS ITS WHEEL AND WHAT HOLDS IT ON. The tyre is the corner's
  // own number and everything else about it is shared, so failing springs
  // or a lost pedal walk all four corners up together while a puncture
  // moves one — which is exactly the difference the driver has to read.
  const corner = worstOf([sys("suspension") * 0.9, sys("brakes") * 0.8]);

  const wheels = SCREEN_WHEELS.map((index) =>
    healthTier(worstOf([wheelScore(damage.wheels[index]), corner])),
  );
  const lamps = SCREEN_LAMPS.map((part): HealthTier =>
    damage.broken.includes(part) ? "dead" : "ok",
  );
  const panels: Record<HealthPanel, HealthTier> = {
    nose: healthTier(nose),
    screen: healthTier(screen),
    cabin: healthTier(cabin),
    tail: healthTier(tail),
  };
  const systems = healthSystems(damage);
  const worst = worstTier([
    ...HEALTH_PANELS.map((panel) => panels[panel]),
    ...wheels,
    ...systems.map((entry) => entry.tier),
  ]);
  return { panels, wheels, lamps, systems, worst };
}

/** THE MACHINERY, AS AN ICON ROW. Only what has something to say: a sound
 * system is not drawn at all, so an undamaged car carries a bare schematic
 * and the row appearing under it is itself the news. Worst first, because
 * the row is read left to right and the thing about to end the run should
 * not be third.
 *
 * The brakes and the rest are read straight off the ledger with no weight
 * on them — this row IS the ledger, said in pictures where the middle of
 * the screen says it in words. */
export function healthSystems(damage: CarDamage): { system: InternalSystem; tier: HealthTier }[] {
  const rows: { system: InternalSystem; tier: HealthTier; score: number }[] = [];
  for (const system of INTERNAL_SYSTEMS) {
    const score = damage.systems[system];
    const tier = healthTier(score);
    if (tier === "ok") continue;
    rows.push({ system, tier, score });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.map(({ system, tier }) => ({ system, tier }));
}

/** THE MOST MARKS THAT MAY STAND IN ONE ROW under the car. Three is what
 * fits across a drawing about as wide as a thumbnail without the marks
 * having to shrink to make room for each other. */
export const HEALTH_MARKS_PER_ROW = 3;

/** ...and how a row of marks is BROKEN when there are more than that. Not
 * "fill three, then the rest": four marks laid out 3 and 1 reads as a row
 * with something dropped off the end of it, where 2 and 2 reads as a block.
 * So the rows are balanced — the count is spread as evenly as it goes, with
 * any odd one landing in the EARLIER row, which is the shape a stack of
 * things is read in (3 and 2, never 2 and 3).
 *
 * Generic because the split is about counting and not about damage, and
 * because that is what lets tests/car_health_test.ts state the shapes
 * directly instead of building a ledger for each one. */
export function markRows<T>(items: readonly T[]): T[][] {
  if (items.length === 0) return [];
  const rows = Math.ceil(items.length / HEALTH_MARKS_PER_ROW);
  const out: T[][] = [];
  let taken = 0;
  for (let row = 0; row < rows; row += 1) {
    const size = Math.ceil((items.length - taken) / (rows - row));
    out.push(items.slice(taken, taken + size));
    taken += size;
  }
  return out;
}

/** The worst tier in a list — the panel's own frame reads it. */
export function worstTier(tiers: HealthTier[]): HealthTier {
  let worst: HealthTier = "ok";
  for (const tier of tiers) if (TIER_ORDER[tier] > TIER_ORDER[worst]) worst = tier;
  return worst;
}

const TIER_ORDER: Record<HealthTier, number> = { ok: 0, hurt: 1, spent: 2, dead: 3 };

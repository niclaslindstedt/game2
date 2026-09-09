// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A CAR IS MADE OF, as far as breaking it is concerned: the ring of
// damage zones round the shell, every part that can bend, crack or come
// off, and the systems under the bodywork that degrade rather than
// detach — plus the ledger (`CarDamage`) all of it is written into.
//
// Data, not behaviour: what a hit COSTS is `crush.ts`'s, and what a
// degraded system does to the handling is `damage.ts`'s.

/** How many crush zones ring the body: zone 0 is dead ahead, indices grow
 * clockwise in map view (matching the heading), 45° each — nose, front-right
 * corner, right flank, rear-right corner, tail, and round the left side. */
export const DAMAGE_ZONES = 8;

/** The pieces an impact can tear off the body. The engine decides WHEN one
 * breaks — zone crush past its bolt strength for the panels, a pane's own
 * crazing reaching the top for the glass (`glassCrack`), a wheel's own
 * ledger for a wheel, and the FLOOR's fold for the exhaust — and the
 * renderer owns what flies.
 *
 * THE EXHAUST IS THE ONE PART THE GROUND TAKES. Everything else on this
 * list is sheared by something the car ran into; the pipe hangs under the
 * floorpan, lower than the car itself, so what tears it off is a stage
 * taken too fast over ground that is not flat — a jump landed heavily, a
 * crest bottomed out on. It is the cheapest thing on the car to lose and
 * the loudest: nothing about the driving changes, and the car spends the
 * rest of the stage trailing black smoke out of the break. A door is bolted
 * deeper than anything on the flank, and a wheel deeper still: the first
 * takes a flank folded most of the way to the cage, the second a corner
 * driven into something at pace, or landed on.
 *
 * THE GLASS IS THE ONE PART THAT IS ALREADY DAMAGED before it comes off.
 * Every other piece here is bolted on until the fold shears it; a pane
 * cracks the whole way there, and the driver is looking through those
 * cracks for as long as it holds. When it does let go it leaves as a
 * PLATE — the pane carries the car's speed away with it, less what
 * breaking the bond around it cost, and comes to rest in the grass.
 *
 * THE LAMPS ARE FOUR, not two. A lamp is glass at the very corner of a cap,
 * and which corner met the tree decides which one is gone: a car that
 * clipped a trunk with its right-hand wing drives the rest of the stage on
 * one headlamp, which is half the light down the road and a fact about
 * every night stage after it. Only a square hit on the nose takes the pair.
 * Left and right are the ENGINE's (positive `w` is the right side). */
export type DamagePart =
  | "bumperF"
  | "bumperR"
  | "lampFL"
  | "lampFR"
  | "lampRL"
  | "lampRR"
  | "mirrorL"
  | "mirrorR"
  | "spoiler"
  | "exhaust"
  | "hood"
  | "hatch"
  | "glassF"
  | "glassB"
  | "glassL"
  | "glassR"
  | "doorL"
  | "doorR"
  | "wheelFL"
  | "wheelFR"
  | "wheelRL"
  | "wheelRR";

/** THE HEADLAMPS and the tail clusters, each end's pair in engine order
 * (left, right) — read by anything that has to ask how much light is left
 * at one end of the car. */
export const FRONT_LAMPS: readonly DamagePart[] = ["lampFL", "lampFR"];
export const REAR_LAMPS: readonly DamagePart[] = ["lampRL", "lampRR"];

/** The four wheels in the order `CarDamage.wheels` keeps them, and the
 * part each one becomes when it comes off: front-left, front-right,
 * rear-left, rear-right. Left and right are the ENGINE's (positive `w`
 * is the right side) — the screen flips once, in the HUD. */
export const WHEEL_PARTS: readonly DamagePart[] = ["wheelFL", "wheelFR", "wheelRL", "wheelRR"];

/** The one pane on the car that is LAMINATED — two sheets bonded to a
 * layer of plastic, which is what keeps a windscreen in one piece when it
 * has stopped being a windscreen. Every other window is TEMPERED and dices
 * into gravel the moment it lets go anywhere, which is the same fact
 * `collision.glass.tempered` prices the crazing with: stated once, here,
 * because the renderer has to draw the difference and must not restate it. */
export const LAMINATED_GLASS: DamagePart = "glassF";

/** The machinery under the panels. Each system takes damage from the crush
 * landing nearest to it and degrades ITS OWN job: the engine loses power
 * and, at the end of it, stops for good; the COOLING loses the coolant that
 * keeps the engine alive at all; the suspension loses grip and landing
 * tolerance; the gearbox shifts slower and harsher; the steering loses
 * authority; the brakes lose the pedal and the lever. */
export type InternalSystem =
  "engine" | "cooling" | "suspension" | "gearbox" | "steering" | "brakes";

export const INTERNAL_SYSTEMS: readonly InternalSystem[] = [
  "engine",
  "cooling",
  "suspension",
  "gearbox",
  "steering",
  "brakes",
];

/** WHY A RUN IS OVER SHORT OF THE LINE. `engine` is a motor that has
 * stopped for good; `wheels` is a car with fewer than three of them left
 * on it. Both are a car that is never going to move again under its own
 * power, which is what separates them from every other line in the
 * ledger. */
export type RetireReason = "engine" | "wheels";

/** WHAT A DAMAGE CALL IS ABOUT: one of the four systems, or the shell they
 * are all bolted into. The chassis is not a system — nothing under the
 * bonnet is wearing out, the body is simply losing its shape — but it fails
 * the same way and it is said the same way, so the call carries it. */
export type DamageCall = InternalSystem | "chassis";

/** HOW FAR GONE a part is, at the moment it says so. `hurt` is the first
 * line — the part is giving, and there is still something the driver can do
 * about it. `spent` is the second — it is doing most of what it will ever do
 * to the car. `dead` is the top of the ledger, and it means exactly what it
 * says: nothing is left. Only a system that has somewhere past `spent` to go
 * ever reaches it, and for the ENGINE that is the run over. The lines
 * themselves are `TUNING.collision.callAt`. */
export type DamageStage = "hurt" | "spent" | "dead";

/** The car's accumulated damage — the physics writes it, the renderer bends
 * the body's polygons from it. Crashing never resets it: the dents are the
 * run's history. The one thing that does is the run STARTING AGAIN — a
 * fresh game, or the respawn that puts the car back on a line it has driven
 * nothing from (`healCar`). */
export type CarDamage = {
  /** Crush depth per zone, m — how far that side's panels have folded in. */
  zones: number[];
  /** Underside crush from slammed landings, m — the floorpan taking the
   * hit the suspension could not. The renderer sags and wrinkles the body
   * from it rather than folding a flank. */
  belly: number;
  /** ROOF crush, m — the greenhouse folding under a car that came down on
   * top of itself. Its own ledger rather than a ring zone because the ring
   * is a plan view and has no room for the one face a roll spends most of
   * its time on: the pillars go, the glass goes with them, and the shell
   * is a different shape from above than a flank ever makes it. */
  roof: number;
  /** Structural wear, 0..1 — reaching 1 is the wreck: a car with nothing
   * left to give, still driveable, patched back to a fraction of its life
   * the next time it is put back on the road. */
  wear: number;
  /** Damage per internal system, 0 (sound) .. 1 (broken) — fed by where
   * the crush lands, read back by the handling model. Never repaired short
   * of the run beginning again (`healCar`). */
  systems: Record<InternalSystem, number>;
  /** Damage per wheel, 0 (sound) .. 1 (off the car), in `WHEEL_PARTS`
   * order. Fed by the flank and corner folding nearest each one and by a
   * landing taken on the side: past `chassis.wheelFlat` the tyre is down
   * and the rim is bent, at 1 the wheel is on the road behind the car and
   * the corner is riding on its hub. */
  wheels: number[];
  /** Parts already torn off, in the order they went. */
  broken: DamagePart[];
  /** Bumped on every deformation change — the renderer re-bends the body
   * when it moves, instead of re-reading nine numbers every frame. */
  version: number;
};

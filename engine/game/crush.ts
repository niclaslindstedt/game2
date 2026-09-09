// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A CONTACT COSTS THE CAR. The contact itself — what was hit, how
// hard, and which way the body went afterwards — is `collision.ts`'s; this
// is the ledger it writes into. Where on the shell a hit landed
// (`damageZoneAt`), how deep the panels there fold, which of them that
// shears off, which pane cracks and when it goes, what a wheel takes, and
// which of the systems under the bodywork is called hurt, spent or dead.
//
// A hard LANDING is the same arithmetic arriving from above, so it is here
// too.

// a face the wheels cannot climb refuses the car exactly like a trunk does.
// Every contact also loads the springs (state.ride/pitchLoad), which is what
// makes a hit rock the car rather than nudge a sprite. The car's mass sets
// how much of all this it takes: heavier spins less, folds deeper. Numbers
// live in defs/tuning.ts.

import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import { arrestLoad, cornerLoads, mountFailure, shedSpeed } from "./mounts.ts";
import {
  type CrushFace,
  crushCap,
  diveShare,
  folded,
  landingFace,
  massRatio,
} from "./structure.ts";
import {
  DAMAGE_ZONES,
  WHEEL_PARTS,
  rollTilt,
  type CarState,
  type DamageCall,
  type DamagePart,
  type GameEvent,
  type RunStats,
} from "./state.ts";

const T = TUNING;

/** Which zones hold each part on, and how much crush shears its bolts. A
 * part is listed under every zone whose folding can take it off. Two
 * things are not here, because neither of them shears at a line: a WHEEL
 * comes off its own ledger (`dealWheels`), and the GLASS crazes toward the
 * crush that finishes it (`glassCrack`) — a pane the driver has been
 * looking through a web of cracks in for the whole of the way there.
 *
 * The LAMPS are where the zone list does real work rather than merely being
 * generous. Each of the four is listed under its own corner and under the
 * cap's centre zone, and nothing else: clip a tree with the right-hand wing
 * (zone 1) and the right headlamp goes while the left one stays lit for the
 * rest of the stage, and only a nose driven in square (zone 0) takes the
 * pair. That is the whole difference between damage that happened to the
 * car and damage that happened to a SIDE of it. */
const PART_BOLTS: { part: DamagePart; zones: number[]; crushAt: number }[] = [
  { part: "bumperF", zones: [7, 0, 1], crushAt: T.collision.partAt.bumper },
  { part: "bumperR", zones: [3, 4, 5], crushAt: T.collision.partAt.bumper },
  { part: "lampFL", zones: [7, 0], crushAt: T.collision.partAt.lamp },
  { part: "lampFR", zones: [0, 1], crushAt: T.collision.partAt.lamp },
  { part: "lampRL", zones: [4, 5], crushAt: T.collision.partAt.lamp },
  { part: "lampRR", zones: [3, 4], crushAt: T.collision.partAt.lamp },
  { part: "mirrorR", zones: [1, 2], crushAt: T.collision.partAt.mirror },
  { part: "mirrorL", zones: [6, 7], crushAt: T.collision.partAt.mirror },
  { part: "spoiler", zones: [3, 4, 5], crushAt: T.collision.partAt.spoiler },
  { part: "exhaust", zones: [3, 4, 5], crushAt: T.collision.partAt.bumper },
  { part: "hood", zones: [7, 0, 1], crushAt: T.collision.partAt.lid },
  { part: "hatch", zones: [3, 4, 5], crushAt: T.collision.partAt.lid },
  { part: "doorR", zones: [2], crushAt: T.collision.partAt.door },
  { part: "doorL", zones: [6], crushAt: T.collision.partAt.door },
];

/** ...and what the FLOOR shears, against `CarDamage.belly`. The exhaust is
 * the whole of it, because it is the whole of what hangs below the
 * floorpan: every other part on the car is bolted somewhere the ground
 * cannot reach without the car being off its wheels, and a car off its
 * wheels is folding a flank or the roof rather than the floor. This is the
 * one list a car collects entries on WITHOUT hitting anything — the stage
 * itself is what takes the pipe off, which is why the ledger it reads is
 * the one that grows on every heavy landing. */
const BELLY_BOLTS: { part: DamagePart; crushAt: number }[] = [
  { part: "exhaust", crushAt: T.collision.partAt.exhaust },
];

/** ...and what the ROOF folding shears, against `CarDamage.roof`. The
 * greenhouse is not a ring zone, so it carries its own list: the mirrors
 * hung off the pillars that just went, and then the lids, whose hinges the
 * fold reaches only once it has pulled the whole deck. The GLASS is not on
 * it — a roof fold crazes every pane at once (`glassCrack`), because a
 * shell that has lost its shape cannot hold laminated glass in it, and it
 * takes them out at `partAt.roofGlass` the way it always did. */
const ROOF_BOLTS: { part: DamagePart; crushAt: number }[] = [
  { part: "mirrorR", crushAt: T.collision.partAt.roofMirror },
  { part: "mirrorL", crushAt: T.collision.partAt.roofMirror },
  { part: "hood", crushAt: T.collision.partAt.roofLid },
  { part: "hatch", crushAt: T.collision.partAt.roofLid },
];

/** THE FOUR PIECES OF GLASS, in the order `glassCrack` reads them: the
 * windscreen, the backlight, and each flank's windows together. Left and
 * right are the ENGINE's — a positive `w` is its right. */
export const GLASS_PARTS: readonly DamagePart[] = ["glassF", "glassB", "glassL", "glassR"];

/** The ring zone each pane FACES, in `GLASS_PARTS` order — zone 0 is the
 * nose and indices grow clockwise, so the screen looks out over the nose,
 * the backlight over the tail, and each flank's windows over their own
 * side. */
const FACING: readonly number[] = [0, 4, 6, 2];

/** Which zones craze each pane, as (zone, share) pairs — the same idea as
 * `WHEELS_AT`, read from the pane's end. A pane's own face is worth a full
 * share; the two zones either side of it reach it at an angle and are
 * worth `glass.oblique`. Nothing else reaches it at all: a door driven
 * into a rock leaves the windscreen sitting there. */
const ZONES_OF: readonly (readonly [number, number])[][] = FACING.map((zone) => {
  const o = T.collision.glass.oblique;
  const wrap = (z: number): number => (z + DAMAGE_ZONES) % DAMAGE_ZONES;
  return [
    [zone, 1],
    [wrap(zone - 1), o],
    [wrap(zone + 1), o],
  ];
});

/** HOW BROKEN ONE PANE IS, 0 (clear) .. 1 (out of its frame and lying in
 * the ditch) — `pane` indexes `GLASS_PARTS`. Read off the crush the panels
 * around it have already taken rather than kept as a ledger of its own,
 * which is what makes a hand-written wreck (`shearedParts`, a preview
 * tool's staged ledger) and a car that crashed its way there agree by
 * construction.
 *
 * Everything in between is a screen with a web of cracks across it, and
 * that is the whole point: a knock that costs a car nothing else still
 * leaves a mark in the corner of the glass, and the driver has to keep
 * looking through it for the rest of the stage.
 *
 * The ROOF and the FLOOR are added to the ring's own sum because a shell
 * that has lost its shape cannot hold laminated glass in it, however
 * square the fold was — from above or from underneath. TEMPERED glass —
 * the flanks and the backlight — crazes faster than the laminated screen:
 * it holds together for a moment and then it is gravel, so it spends far
 * less of its life cracked. */
export function glassCrack(damage: CarState["damage"], pane: number): number {
  const P = T.collision.partAt;
  let sum = damage.roof / P.roofGlass + damage.belly / P.bellyGlass;
  for (const [zone, share] of ZONES_OF[pane]) sum += (damage.zones[zone] * share) / P.glass;
  const G = T.collision.glass;
  const share = Math.min(1, sum * (pane === 0 ? 1 : G.tempered));
  // The pane still leaves at exactly the fold that always finished it —
  // the curve only decides what the way there LOOKS like, because 1 to any
  // power is 1.
  return share ** G.crazeCurve;
}

/** Every pane's crack BEFORE a dealt crush, so the one bite that carries a
 * pane over the top can be told from the dozens either side of it. One
 * array for the whole engine: `dealCrush` runs on every bite of a contact,
 * a roll grinding along a flank is dozens of them a second, and it is read
 * and spent inside the same call. */
const WAS_GLASS = [0, 0, 0, 0];

/** ...and each corner's helping of an arrival, in `WHEEL_PARTS` order. One
 * array for the whole engine, for the same reason: it is written and spent
 * inside one `mountLoads` call. */
export const CORNER_SHARE = [1, 1, 1, 1];

export function readCracks(damage: CarState["damage"], into: number[]): void {
  for (let pane = 0; pane < GLASS_PARTS.length; pane++) into[pane] = glassCrack(damage, pane);
}

/** ...and the panes the crush just carried over the top: each one leaves
 * its frame exactly once, the way any other part does. */
export function shearGlass(
  damage: CarState["damage"],
  was: number[],
  events: GameEvent[],
  shed: number,
): void {
  for (let pane = 0; pane < GLASS_PARTS.length; pane++) {
    if (was[pane] >= 1 || glassCrack(damage, pane) < 1) continue;
    shear(damage, GLASS_PARTS[pane], events, shed);
  }
}

/** Which wheels each ring zone folds onto, as (wheel index, share) pairs —
 * `WHEEL_PARTS` order: FL, FR, RL, RR. A corner is one wheel's; a flank is
 * both wheels on that side, half each; the nose and the tail reach none. */
const WHEELS_AT: readonly (readonly [number, number])[][] = [
  [],
  [[1, 1]],
  [
    [1, 0.5],
    [3, 0.5],
  ],
  [[3, 1]],
  [],
  [[2, 1]],
  [
    [0, 0.5],
    [2, 0.5],
  ],
  [[0, 1]],
];

/** The zone an impact angle lands in — angle 0 is the nose, positive is the
 * right side, each zone spans 45°. */
export function damageZoneAt(angle: number): number {
  const span = (Math.PI * 2) / DAMAGE_ZONES;
  return ((Math.round(angle / span) % DAMAGE_ZONES) + DAMAGE_ZONES) % DAMAGE_ZONES;
}

/** Has `part` just crossed one of the lines worth telling the driver about?
 * Compared against the value BEFORE the damage was dealt, so a system that
 * walks past a line in a dozen small hits calls out on the one that took it
 * there and stays quiet through the rest.
 *
 * The DEAD line is the top of the ledger and is said last, because it is
 * the only one that is not a warning: a part at 1 is a part that has
 * finished happening, and for the engine it is the run. Nothing announces
 * "dead" ahead of time — that is the whole reason the line exists. */
export function callDamage(
  system: DamageCall,
  was: number,
  now: number,
  events: GameEvent[],
): void {
  const { hurt, spent, dead } = T.collision.callAt;
  if (was < dead && now >= dead) events.push({ type: "systemFail", system, stage: "dead" });
  else if (was < spent && now >= spent) events.push({ type: "systemFail", system, stage: "spent" });
  else if (was < hurt && now >= hurt) events.push({ type: "systemFail", system, stage: "hurt" });
}

/** Crush reaching past the panels: which system lives nearest each zone,
 * as (system, share-of-transfer) pairs. */
export function dealSystems(
  car: CarState,
  face: CrushFace,
  crush: number,
  events: GameEvent[],
): void {
  const S = T.collision.systems;
  const sys = car.damage.systems;
  const deal = (key: keyof typeof sys, amount: number): void => {
    const was = sys[key];
    sys[key] = Math.min(1, sys[key] + amount);
    callDamage(key, was, sys[key], events);
  };
  if (face === "belly") {
    // Everything the FLOOR of a car has under it: the arms and their
    // mounts, the box and the shafts out of it, the lines and the
    // handbrake's own cable running back along the tunnel — and, lower
    // than any of them, the sump and the rack.
    deal("suspension", crush * S.suspensionFromBelly);
    deal("gearbox", crush * S.gearboxFromBelly);
    deal("brakes", crush * S.brakesFromBelly);
    deal("engine", crush * S.engineFromBelly);
    deal("steering", crush * S.steeringFromBelly);
    return;
  }
  if (face === "roof") {
    deal("suspension", crush * S.suspensionFromRoof);
    deal("steering", crush * S.steeringFromRoof);
    return;
  }
  const zone = face;
  // The core stands in front of everything, and a rally car's bar is what
  // stands in front of IT: once the front bumper is on the road there is
  // nothing left between the radiator and the next tree.
  const bare = car.damage.broken.includes("bumperF") ? S.coolingBareCore : 1;
  if (zone === 0) {
    deal("engine", crush * S.engineFromNose);
    deal("cooling", crush * S.coolingFromNose * bare);
  } else if (zone === 1 || zone === 7) {
    deal("engine", crush * S.engineFromNose * 0.5);
    deal("cooling", crush * S.coolingFromNose * bare * 0.5);
    deal("steering", crush * S.steeringFromCorner);
    deal("brakes", crush * S.brakesFromCorner);
  } else if (zone === 2 || zone === 6) {
    deal("suspension", crush * S.suspensionFromFlank);
    deal("brakes", crush * S.brakesFromFlank);
  } else if (zone === 3 || zone === 5) {
    deal("gearbox", crush * S.gearboxFromRear * 0.5);
    deal("suspension", crush * S.suspensionFromFlank * 0.5);
    deal("brakes", crush * S.brakesFromCorner * 0.5);
  } else {
    deal("gearbox", crush * S.gearboxFromRear);
  }
}

/** Hurt one wheel by `amount` and say so as it crosses each of its two
 * lines: the flat (`chassis.wheelFlat`) and the wheel coming off (1), the
 * latter also a `partBreak` for the piece itself. Compared against the
 * value before, like every call: dozens of small bites cross a line once. */
export function dealWheel(
  car: CarState,
  wheel: number,
  amount: number,
  events: GameEvent[],
  shed: number,
): void {
  if (amount <= 0) return;
  const wheels = car.damage.wheels;
  const was = wheels[wheel];
  wheels[wheel] = Math.min(1, was + amount);
  const flat = T.collision.chassis.wheelFlat;
  if (was < 1 && wheels[wheel] >= 1) {
    events.push({ type: "wheelFail", wheel, off: true });
    const part = WHEEL_PARTS[wheel];
    if (!car.damage.broken.includes(part)) {
      car.damage.broken.push(part);
      events.push({ type: "partBreak", part, shed });
    }
  } else if (was < flat && wheels[wheel] >= flat) {
    events.push({ type: "wheelFail", wheel, off: false });
  }
}

/** The crush reaching the wheels: the corner's own, the flank's shared,
 * and — from underneath or above — a little to all four. */
export function dealWheels(
  car: CarState,
  face: CrushFace,
  crush: number,
  flat: boolean,
  events: GameEvent[],
  shed: number,
): void {
  const S = T.collision.systems;
  if (face === "belly" || face === "roof") {
    const per = face === "belly" ? S.wheelFromBelly : S.wheelFromRoof;
    for (let i = 0; i < WHEEL_PARTS.length; i++) dealWheel(car, i, crush * per, events, shed);
    return;
  }
  // A GROUND arrival across the whole of a flank is not a trunk driven into
  // one corner of it. The ring's rates are a point impact's — the solid
  // reaches past the panel and into the upright behind it — and the ground
  // does no such thing. What a car lying on its side does to its wheels is
  // `landingDamage`'s own `wheelFromSideLand`; this would be a second
  // helping of the same arrival.
  if (flat) return;
  const zone = face;
  const corner = zone === 1 || zone === 3 || zone === 5 || zone === 7;
  const per = corner ? S.wheelFromCorner : S.wheelFromFlank;
  for (const [wheel, share] of WHEELS_AT[zone]) {
    dealWheel(car, wheel, crush * per * share, events, shed);
  }
}

/** Book one dealt crush: fold the panels (a ring zone, or the underside
 * when `zone` is null), hurt the system living behind them, take the wear,
 * tear off whatever the folding sheared through, and tell the world.
 *
 * `dealt` is the fold the contact earned; what is written down is that
 * times the car's own `damageScale` (state.ts). The hit itself has already
 * happened by the time this is called — the impulse is spent, the springs
 * are loaded — and the event goes out whatever the scale is, so a car that
 * keeps none of the damage still crashes as loudly as one that keeps all
 * of it. */
export function dealCrush(
  car: CarState,
  face: CrushFace,
  dealt: number,
  angle: number,
  speed: number,
  events: GameEvent[],
  stats: RunStats,
  flat = false,
): void {
  const damage = car.damage;
  stats.impacts += 1;
  // A flat-on arrival — the floor or the roof — has no bearing to it: the
  // ground came at a whole face at once.
  events.push({ type: "impact", speed, angle, belly: typeof face !== "number" });
  const asked = dealt * car.damageScale;
  if (asked <= 0) return;
  // WHAT THE FACE ACTUALLY TOOK. Past its cap (`crushCap` — the ring's
  // `zoneMax`, the cage's own stroke for the roof) the cage is holding and
  // the panel has nowhere left to fold, so the machinery behind it stops
  // taking the fold too — only the wear goes on. Without this a car pinned
  // against one face goes on losing its engine, its wheels and its arms to
  // a panel that is not moving any more, which is exactly what a roll
  // grinding along on one flank does for a second and a half.
  const before = folded(damage, face);
  const crush = Math.min(asked, crushCap(face) - before);
  const wasWear = damage.wear;
  const spent = crush + (asked - crush) * T.collision.wearPastCap;
  damage.wear = Math.min(1, damage.wear + spent * T.collision.wearPerCrush);
  callDamage("chassis", wasWear, damage.wear, events);
  damage.version += 1;
  if (crush <= 0) return;
  // How fast anything the fold shears through LEAVES the car — the contact's
  // own speed through the wedge it is squeezed out of (`shedSpeed`).
  const shed = shedSpeed(speed);
  dealSystems(car, face, crush, events);
  dealWheels(car, face, crush, flat, events, shed);
  // The GLASS is read off the crush rather than written, so its before is
  // taken here — after the early returns that cannot craze anything, and
  // before the fold that can. EVERY face can: the ring around the panes,
  // the cage they are hung off, and the floor pulling the whole shell out
  // of true from underneath.
  readCracks(damage, WAS_GLASS);
  if (face === "belly") {
    damage.belly = before + crush;
    shearGlass(damage, WAS_GLASS, events, shed);
    for (const bolt of BELLY_BOLTS) {
      if (damage.belly < bolt.crushAt) continue;
      shear(damage, bolt.part, events, shed);
    }
    return;
  }
  if (face === "roof") {
    damage.roof = before + crush;
    shearGlass(damage, WAS_GLASS, events, shed);
    for (const bolt of ROOF_BOLTS) {
      if (damage.roof < bolt.crushAt) continue;
      shear(damage, bolt.part, events, shed);
    }
    return;
  }
  const zone = face;
  damage.zones[zone] = before + crush;
  shearGlass(damage, WAS_GLASS, events, shed);
  for (const bolt of PART_BOLTS) {
    if (!bolt.zones.includes(zone)) continue;
    if (damage.zones[zone] < bolt.crushAt) continue;
    shear(damage, bolt.part, events, shed);
  }
}

/** EVERY PART A LEDGER HAS SHEARED, read back from the bolt lists rather
 * than from `damage.broken` — what a ledger WRITTEN BY HAND (a staged wreck
 * in a preview tool, a test fixture) owes its `broken` list, so the parts
 * the renderer tears off agree with the folds it draws. The live game never
 * needs it: `dealCrush` shears each part on the bite that reaches its bolt.
 * A wheel at 1 is off the car like anything else on the list. */
export function shearedParts(damage: CarState["damage"]): DamagePart[] {
  const parts: DamagePart[] = [];
  const add = (part: DamagePart): void => {
    if (!parts.includes(part)) parts.push(part);
  };
  for (const bolt of PART_BOLTS) {
    if (bolt.zones.some((zone) => damage.zones[zone] >= bolt.crushAt)) add(bolt.part);
  }
  for (const bolt of ROOF_BOLTS) if (damage.roof >= bolt.crushAt) add(bolt.part);
  for (const bolt of BELLY_BOLTS) if (damage.belly >= bolt.crushAt) add(bolt.part);
  GLASS_PARTS.forEach((part, pane) => {
    if (glassCrack(damage, pane) >= 1) add(part);
  });
  damage.wheels.forEach((w, i) => {
    if (w >= 1) add(WHEEL_PARTS[i]);
  });
  return parts;
}

/** One part off its bolts, once — a piece already on the road behind the
 * car cannot come off a second time. `shed` is how fast it leaves. */
export function shear(
  damage: CarState["damage"],
  part: DamagePart,
  events: GameEvent[],
  shed: number,
): void {
  if (damage.broken.includes(part)) return;
  damage.broken.push(part);
  events.push({ type: "partBreak", part, shed });
}

/** The ground hitting back at touchdown. `slam` is the descent speed
 * relative to the ground, m/s; what the car cannot absorb folds whichever
 * face of it arrived (`landingFace`) — the underside on its wheels, an END
 * of it on a car that went over an edge nose-first, a flank on its side,
 * the greenhouse on its roof. `pitch` is the attitude it arrived AT, and
 * only a car falling out of the air has one worth reading: the other
 * callers are on the ground and their pitch is the grade under the wheels.
 *
 * WHAT IS FREE depends on that face, and it is the difference between a
 * jump and a roll. A car on its tyres has the whole of its suspension
 * travel to swallow the arrival with, and `hardLandSpeed` is what that is
 * worth; a car on its shell has nothing under it at all, so almost every
 * contact of a roll folds something (`air.roll.shellFree`). A nose-first
 * arrival is the hand-over between the two (`diveShare`).
 *
 * The fold is not the whole account. Everything BOLTED to the car is
 * brought to a stop over the same stroke, and past a point the arms and
 * the engine mounts are not rated for what that asks of them — which is
 * what a plunge does that a wall never does (`mountLoads`). */
export function landingDamage(
  spec: CarSpec,
  car: CarState,
  slam: number,
  events: GameEvent[],
  stats: RunStats,
  pitch = 0,
): void {
  const face = landingFace(rollTilt(car.roll), pitch);
  // How far out of the load path the springs are: none of the way on the
  // tyres, all of the way on a flank or a roof, and somewhere between on a
  // car that came down on an end of itself.
  const onShell = face === "belly" ? 0 : face === 0 || face === 4 ? diveShare(pitch) : 1;
  // Shot dampers absorb less: suspension damage narrows what lands free.
  const sprung =
    T.collision.hardLandSpeed *
    (1 - T.collision.systems.landTolerance * car.damage.systems.suspension);
  const tolerance = sprung + (T.air.roll.shellFree - sprung) * onShell;
  const over = slam - tolerance;
  if (over <= 0) return;
  // ...and the ROOF is the cage: the same arrival folds it by less than it
  // folds a panel, and what it does not fold it passes on to the body
  // (`structure.foldSpeed`), which is why a car coming down on its roof is
  // thrown by the contact where one coming down on its nose is stopped.
  const stiff = face === "roof" ? T.collision.structure.roofCrush : 1;
  const crush = T.collision.crushPerSpeed * over * massRatio(spec) * stiff;
  // THE STROKE THE CAR ACTUALLY STOPPED OVER, m — read before the fold is
  // dealt, because a face already at its cap folds no further and a car
  // that cannot fold is a car that stops in no distance at all. That is
  // the term the mounts answer to, and the reason the same descent taken
  // on a folded nose is worse than the first one taken on a fresh one.
  const room = Math.max(0, crushCap(face) - folded(car.damage, face));
  const M = T.collision.mounts;
  const springs = (T.suspension.travel + M.tyreSquash) * (1 - onShell);
  const stroke = Math.min(crush * car.damageScale, room) + M.shellSquash + springs;
  if (typeof face !== "number") {
    dealCrush(car, face, crush, 0, slam, events, stats, true);
    mountLoads(car, slam, stroke, pitch, events);
    return;
  }
  // Zone 0 is the nose and the indices grow clockwise, so a face's own
  // bearing is a straight eighth of a turn apiece — the nose square on,
  // each flank at a quarter.
  const bearing = face * (Math.PI / 4);
  dealCrush(
    car,
    face,
    crush,
    bearing > Math.PI ? bearing - Math.PI * 2 : bearing,
    slam,
    events,
    stats,
    true,
  );
  // ...and the wheels on that side are what it came down on — the whole of
  // what the arrival reaches them with, since the ground folding a flank
  // does not reach the uprights the way a solid driven into one does. The
  // nose and the tail reach no wheel at all: what a car that dived onto
  // its bumper does to its arms is the load, below, and not the panel.
  const extra = crush * car.damageScale * T.collision.systems.wheelFromSideLand;
  const shed = shedSpeed(slam);
  for (const [wheel, share] of WHEELS_AT[face]) dealWheel(car, wheel, extra * share, events, shed);
  if (extra > 0) car.damage.version += 1;
  mountLoads(car, slam, stroke, pitch, events);
}

/** WHAT THE ARRIVAL ASKED OF THE BOLTS. The panels folding is the car
 * being destroyed from the outside in; this is it coming apart from the
 * inside, and it is the only reason a fall off a mountain is not simply a
 * very hard landing.
 *
 * The load is `mounts.ts`'s arithmetic — the descent stopped over the
 * stroke the car actually travelled, in g — and every mount rated under it
 * lets go: the uprights first, taking their wheels with them, then the
 * drive shafts through their own joints, and last the engine, which goes
 * on falling inside the shell until the bulkhead stops it. Nothing here
 * knows how far the car fell, or that it fell at all.
 *
 * The load is not shared evenly: `pitch` and the roll say which corner the
 * car actually came down on, and that corner takes more of it and throws
 * its wheel harder (`cornerLoads`, `shedSpeed`). */
export function mountLoads(
  car: CarState,
  slam: number,
  stroke: number,
  pitch: number,
  events: GameEvent[],
): void {
  const failed = mountFailure(arrestLoad(slam, stroke));
  const hub = failed.hub * car.damageScale;
  const shafts = failed.drive * car.damageScale;
  const block = failed.engine * car.damageScale;
  if (hub <= 0 && shafts <= 0 && block <= 0) return;
  // WHICH CORNER TOOK IT. A car almost never lands level, and the load goes
  // down through the corner that reached the ground first — which is what
  // makes a nose-first plunge tear off its FRONT wheels and throw them
  // further than the pair that was still in the air.
  cornerLoads(rollTilt(car.roll), pitch, CORNER_SHARE);
  for (let wheel = 0; wheel < WHEEL_PARTS.length; wheel++) {
    const share = CORNER_SHARE[wheel];
    dealWheel(car, wheel, hub * share, events, shedSpeed(slam, share));
  }
  const sys = car.damage.systems;
  const deal = (key: "gearbox" | "engine", amount: number): void => {
    if (amount <= 0) return;
    const was = sys[key];
    sys[key] = Math.min(1, sys[key] + amount);
    callDamage(key, was, sys[key], events);
  };
  deal("gearbox", shafts);
  deal("engine", block);
  // ...and the shell paid for all of it: nothing tears off a car without
  // taking the structure it was bolted to with it.
  const damage = car.damage;
  const wasWear = damage.wear;
  damage.wear = Math.min(1, damage.wear + (hub + shafts + block) * T.collision.mounts.wearPerMount);
  callDamage("chassis", wasWear, damage.wear, events);
  damage.version += 1;
}

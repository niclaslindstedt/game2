// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R45 — THE GRID. The country that makes power (R43) has to send it
// somewhere, and what that looks like from a rally stage is a 400 kV
// transmission line: two lattice legs under one crossarm, three bundled
// conductors on insulator strings and two earth wires on the peaks,
// marching away over the hills.
//
// It is NOT a thing placed beside the road, and that is the whole design.
// Every other piece of furniture on a stage is decided from the stage — a
// slot along the arc rolls, a probe goes out sideways, something stands
// there. A power line decided that way would follow the road, which is the
// one thing a real one never does. So this module works like `highway.ts`:
// it crosses the whole map, rim to rim, from the seed and the bare country
// alone, and the rally passes under it wherever it happens to. The moment
// worth having is the crossing, and a crossing you can plan for is not one.
//
// What it does is the SURVEYOR'S OWN METHOD, and it is worth stating,
// because it is not the method anything else here uses:
//
//   THE TOWERS ARE THE LINE. There is no path to place towers on. A line
//   can only change direction AT a tower, so the walk goes tower to tower:
//   from each one, a bearing at the far rim, swung off it only to get round
//   water the line could not span, and turned at all only by what the
//   structure carries. Past `angle.suspension` the tower is an ANGLE tower
//   — heavier, strung with horizontal tension insulators — and a line does
//   not put one in every span. A TENSION tower goes in every `section`
//   spans regardless, which is what stops one failure taking a kilometre of
//   line down with it, and is why a dead straight line still has heavy
//   towers on it.
//
//   WHERE THE NEXT TOWER STANDS IS A CLEARANCE PROBLEM. Sag goes as the
//   SQUARE of the span at a fixed tension, so the wire between two towers
//   is a parabola whose depth the span itself decides — and the next tower
//   goes at the LONGEST span whose wire still clears the ground under it.
//   That is the sag template laid on the profile, and it is the reason real
//   towers are on the brows and the long spans are over the hollows:
//   nothing here PREFERS high ground, and it comes out standing on it
//   anyway, which is the difference between a rule and a result.
//
//   A SPAN THAT WILL NOT CLOSE STRETCHES, AND THEN REFUSES. Where the whole
//   band has nowhere in it — a lake, a village, the road and its verges,
//   ground too steep to foot a tower on — the span reaches to
//   `span.stretch` and carries over, which is the ridge-to-ridge crossing
//   span and the one that looks like something. A window that refuses even
//   stretched refuses the LINE, and another entry on the rim is tried: a
//   grid with a hole in it is worse than a country with no grid.
//
// The renderer draws the machines and hangs the catenaries off the points
// this module hands it; the terrain makes the legs solid and cuts the
// wayleave through the forest under them.

import { createRng, type Rng } from "../lib/prng.ts";
import type { LandField } from "./land.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { standSolid, WALL_BAY, WALL_STOREY, type WildObstacle } from "./solids.ts";

const P = R.powerline;

/** A probe's hook for tallying why a line or a tower was refused (`note`
 * is null in the game) — `energyTally`'s reason, and its shape. */
export const powerlineTally: { note: ((why: string) => void) | null } = { note: null };
const note = (why: string): void => powerlineTally.note?.(why);

/** What a tower is FOR, which is what it looks like. A SUSPENSION tower
 * carries the wire on strings that hang: the commonest, and the only one
 * that may not take a real deviation or an unbalanced pull. An ANGLE tower
 * is where the line turns, and a TENSION tower is the section break a
 * straight line gets anyway — both are strung horizontally, along the line
 * and into the tower, so the wire is anchored rather than merely resting. */
export type PylonKind = "suspension" | "angle" | "tension";

/** One tower. `y` is the bare country at its foot — the renderer re-foots
 * every leg on the ground the terrain actually made, so this is what the
 * surveyor judged rather than where the steel ends up. `heading` is the
 * line's bearing through it, bisected at a turn, and the crossarm lies
 * square across that. */
export type Pylon = {
  x: number;
  z: number;
  y: number;
  heading: number;
  kind: PylonKind;
  /** How far the line turns here, rad — signed, + to the line's right, and
   * the crossarm squares the bisector of the two bearings. Small but rarely
   * zero on a suspension tower: a couple of degrees is what one carries,
   * and past `angle.suspension` the tower is an ANGLE tower instead. */
  deviation: number;
  /** The span BACK to the tower before this one, m; 0 on the first. What
   * the sag is computed from, and what the analysis measures. */
  span: number;
};

export type PowerLine = {
  /** Height to the crossarm, m — one make of tower for the whole line. */
  height: number;
  pylons: Pylon[];
  /** The box the towers occupy, grown by the wayleave: the cheap first
   * question every field asks before walking the spans. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

/** Everything the placer has to ask about what is already on the map.
 * Functions rather than the compiler's state, for `EnergyContext`'s
 * reason: a test drives it with a flat rig and no roads at all. */
export type PowerlineContext = {
  seed: number;
  /** Half-extent of the world the stage is built in, m. */
  worldBound: number;
  land: LandField;
  /** Distance to the nearest piece of ROUTE, m. */
  routeDistance: (x: number, z: number) => number;
  branchDistance: (x: number, z: number) => number;
  highwayDistance: (x: number, z: number) => number;
  /** R37/R39 — distance to the nearest town lot's or homestead's pad rim. */
  settledDistance: (x: number, z: number) => number;
  /** R43 — distance to the nearest turbine's crane pad or solar fence. */
  energyDistance: (x: number, z: number) => number;
  /** R31 — the band the ground may stand in at a point without the road's
   * own cone reshaping it. */
  shelfBand: (x: number, z: number) => { floor: number; ceiling: number };
  /** What the WIRE has to clear at a point, and by how much: the height of
   * the highest thing under it, and the air it owes over that.
   *
   * `ground` is not `land.heightAt`, and the difference is a real defect
   * rather than a refinement. A road is laid ALONG the country but not ON
   * it — it rides embankments and shelves metres above the ground the
   * survey read — so a span planned against the bare land came out with
   * seven metres of clearance where it had promised twelve, and another was
   * drawn through a branch's embankment. `need` is the road's own figure
   * where a road is under the wire, because that is the one place anybody
   * is standing under it.
   *
   * ONE call rather than a height and two distance queries beside it: this
   * is asked at every dozen metres of every candidate span of every tower,
   * and the road queries behind it walk lists. Split three ways it was the
   * whole cost of surveying a line. */
  clearanceAt: (x: number, z: number) => { ground: number; need: number };
};

/** How far off the wanted bearing a tower tries, as shares of the
 * deviation it is allowed to carry — the survey's own line first, then out
 * either side of it in steps. */
const TURN_TRIES = [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1, -1];

/** Signed shortest turn from `from` to `to`, rad. */
function angleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ── The wire ──────────────────────────────────────────────────────────────

/** How far a span of `length` metres hangs below the straight line between
 * its two attachment points, at `t` along it.
 *
 * The sag at mid-span goes as the SQUARE of the span (`w·L²/8H` at a fixed
 * tension), which is the single fact that shapes this whole module: the
 * band's shortest span hangs three metres and the stretch over a valley
 * hangs thirty, so a long span needs a hollow under it and a line over
 * level ground cannot have one. The curve itself is the parabola rather
 * than the catenary — within half a percent of it under a tenth of the
 * span, which every span here is.
 *
 * Here rather than in the renderer because it is not only drawn: the
 * SURVEY is this curve laid on the ground profile, and the analysis
 * measures the clearance with it. A wire the placer thinks is ten metres
 * up and the picture shows at four is worse than no rule at all. */
export function spanSag(length: number, t: number): number {
  const mid = (P.sag * length * length) / P.span.ruling;
  return 4 * mid * t * (1 - t);
}

// ── The ground a tower stands on ──────────────────────────────────────────

/** Will the country hold a tower here: dry, level enough across the base,
 * ground R31 is not about to reshape, and clear of everything already on
 * the map.
 *
 * Measured over the tower's OWN FOOTPRINT rather than at its centre, and
 * that is not fussiness. A portal's legs stand seventeen metres apart: a
 * centre-only test put a tower on a lake shore with one leg in the water
 * and another on the lip of a cutting with eight metres of fall under it,
 * and both were legal by every number the placer was reading. `bearing` is
 * the line's through the tower, which is what says where the legs are. */
function towerClear(ctx: PowerlineContext, x: number, z: number, bearing: number): boolean {
  if (ctx.routeDistance(x, z) < P.clear.route) return refuse("wires: route");
  if (ctx.branchDistance(x, z) < P.clear.road) return refuse("wires: branch");
  if (ctx.highwayDistance(x, z) < P.clear.road) return refuse("wires: highway");
  if (ctx.settledDistance(x, z) < P.clear.settled) return refuse("wires: settled");
  if (ctx.energyDistance(x, z) < P.clear.energy) return refuse("wires: energy");
  const across = { x: Math.cos(bearing), z: -Math.sin(bearing) };
  const along = { x: Math.sin(bearing), z: Math.cos(bearing) };
  let lo = Infinity;
  let hi = -Infinity;
  for (const a of [-P.tower.base / 2, 0, P.tower.base / 2]) {
    for (const l of [-P.tower.foot, 0, P.tower.foot]) {
      const px = x + across.x * a + along.x * l;
      const pz = z + across.z * a + along.z * l;
      if (ctx.land.flooded(px, pz, P.shoreFreeboard)) return refuse("wires: water");
      const h = ctx.land.heightAt(px, pz);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
      // R31 — and ground the road's own cone is about to move. A tower
      // spotted on the bare country beside a cutting is a tower the terrain
      // then blasts the ground out from under: the cone is the compiler
      // saying in advance where that will happen, and it is the same
      // question a turbine's crane pad asks.
      const band = ctx.shelfBand(px, pz);
      if (h > band.ceiling || h < band.floor) return refuse("wires: cone");
    }
  }
  // A real tower does climb a hillside — its legs are cut to length and its
  // footings poured to a working level — so this is a limit on the ground
  // under ONE machine, not a demand for the flat.
  if (hi - lo > P.tower.level) return refuse("wires: tower level");
  return true;
}

function refuse(why: string): false {
  note(why);
  return false;
}

/** THE SAG TEMPLATE. Does the lowest conductor of the span from `a` to `b`
 * keep its clearance over everything under it?
 *
 * The attachment points are the conductor's, not the ground's — a span
 * between two towers of one height on ground at two heights is a wire on a
 * slope, and the clearance that bites is at neither end. Sampled at the
 * probe's own resolution, because a hollow narrower than that is a hollow
 * the wire is over rather than in. */
function spanClears(
  ctx: PowerlineContext,
  a: { x: number; z: number; y: number },
  b: { x: number; z: number; y: number },
  height: number,
): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const hang = height - P.wire.insulator;
  // UPLIFT. The wire's lowest point is `0.5 + rise / 8·mid` along a span
  // that rises by `rise`; outside 0..1 it is off the end of the span
  // altogether, which means the whole weight of the wire hangs on the
  // upper tower and the LOWER one is being pulled up out of the ground.
  // A suspension tower cannot take that — the real answer is a body
  // extension or a tower designed for it, and the surveyor's answer is to
  // stand it somewhere else. Sag grows as the span squared, so the way out
  // of uplift is a LONGER span, which is the direction this walk searches
  // from anyway.
  const mid = spanSag(length, 0.5);
  if (mid > 0 && Math.abs(b.y - a.y) > 4 * mid) return false;
  const steps = Math.max(2, Math.ceil(length / P.probe));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const wire = a.y + hang + (b.y - a.y) * t - spanSag(length, t);
    // A road under the span gets more air than a field does, for a railway
    // crossing's reason: what passes under it is tall, and the wire is the
    // one part of this a driver is ever underneath.
    const owed = ctx.clearanceAt(x, z);
    if (wire - owed.ground < owed.need) return false;
  }
  return true;
}

// ── The walk ──────────────────────────────────────────────────────────────

/** Where a tower could stand, and what the country there is. */
type Spot = { x: number; z: number; y: number };

/** Where the next tower goes along `bearing`: a span between `lo` and `hi`
 * that lands on ground which will take a tower and keeps the wire off the
 * country under it.
 *
 * Which END of the band it starts from is the economics, and the two bands
 * pull opposite ways. Inside the ORDINARY band the longest span wins —
 * every tower is a foundation, and a line with more of them than the ground
 * demands is a line somebody paid for twice. In the STRETCH band the
 * shortest wins: the only reason to be there at all is that the ordinary
 * band had nowhere in it, and reaching six hundred metres when four hundred
 * and twenty would do buys nothing but conductor and sag. */
function nextTower(
  ctx: PowerlineContext,
  from: Spot,
  bearing: number,
  height: number,
  lo: number,
  hi: number,
  longestFirst: boolean,
): Spot | null {
  const sin = Math.sin(bearing);
  const cos = Math.cos(bearing);
  const steps = Math.max(1, Math.round((hi - lo) / P.probe));
  for (let i = 0; i <= steps; i++) {
    const span = longestFirst ? hi - i * P.probe : lo + i * P.probe;
    if (span < P.span.min) break;
    const x = from.x + sin * span;
    const z = from.z + cos * span;
    if (!towerClear(ctx, x, z, bearing)) continue;
    const spot = { x, z, y: ctx.land.heightAt(x, z) };
    if (!spanClears(ctx, from, spot, height)) {
      note("wires: span refused");
      continue;
    }
    return spot;
  }
  return null;
}

/** The longest unbroken run of water along a bearing out of a point, m —
 * how wide the wet would be if the line went that way. Capped at the look,
 * which is all any caller compares against. */
function wetRun(land: LandField, x: number, z: number, bearing: number): number {
  const sin = Math.sin(bearing);
  const cos = Math.cos(bearing);
  let run = 0;
  let worst = 0;
  for (let d = P.probe * 2; d <= P.shoreLook; d += P.probe * 2) {
    if (land.flooded(x + sin * d, z + cos * d, P.shoreFreeboard)) {
      run += P.probe * 2;
      if (run > worst) worst = run;
    } else {
      run = 0;
    }
  }
  return worst;
}

/** Walk one whole line, from an entry on the rim to wherever it leaves the
 * map. Empty where it never got out the far side. */
function walkLine(seed: number, ctx: PowerlineContext, height: number): Pylon[] {
  const rng = createRng(seed);
  const reach = ctx.worldBound + P.overrun;
  // THE SURVEY: a chain of ANGLE POINTS from an entry on the rim to an exit
  // on the far side, which is how a real route is defined — the line is
  // fixed as a handful of points and the towers are spotted between them
  // afterwards. Aiming at the exit alone comes out dead straight across
  // every seed, because nothing in a bare country is a reason to turn: what
  // turns a real line is land nobody would sell and places somebody wanted
  // it to pass, and neither of those is on this map. The dice stand in for
  // the surveyor, and the deviation limit still decides what the structure
  // can carry.
  const entry = rng.range(0, Math.PI * 2);
  const exit = entry + Math.PI + rng.range(-0.38, 0.38);
  const from = { x: Math.sin(entry) * reach, z: Math.cos(entry) * reach };
  const to = { x: Math.sin(exit) * reach, z: Math.cos(exit) * reach };
  const chord = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  const across = { x: (to.z - from.z) / chord, z: -(to.x - from.x) / chord };
  const survey: { x: number; z: number }[] = [];
  const bends = rng.int(P.angle.points.min, P.angle.points.max);
  for (let k = 0; k < bends; k++) {
    const along = (k + 1) / (bends + 1);
    const off = rng.range(-P.angle.offset, P.angle.offset) * reach;
    survey.push({
      x: from.x + (to.x - from.x) * along + across.x * off,
      z: from.z + (to.z - from.z) * along + across.z * off,
    });
  }
  survey.push(to);
  let aimAt = 0;
  const target = (): { x: number; z: number } => survey[aimAt];
  // The first tower: walked in from the rim until the country takes one.
  // Its own bearing is the aim, because there is no line behind it yet.
  const x0 = from.x;
  const z0 = from.z;
  let heading = Math.atan2(target().x - x0, target().z - z0);
  let at: Spot | null = null;
  for (let d = 0; d < 2 * reach && !at; d += P.probe) {
    const x = x0 + Math.sin(heading) * d;
    const z = z0 + Math.cos(heading) * d;
    if (towerClear(ctx, x, z, heading)) at = { x, z, y: ctx.land.heightAt(x, z) };
  }
  if (!at) {
    note("wires: no entry");
    return [];
  }
  let cursor: Spot = at;
  const pylons: Pylon[] = [
    { x: at.x, z: at.z, y: at.y, heading, kind: "tension", deviation: 0, span: 0 },
  ];
  let sinceAngle: number = P.angle.apart;
  let sinceTension = 0;
  let entered = false;
  // Twice the crossing at the shortest span is more legs than any line
  // needs; past it the walk is going in circles rather than anywhere.
  const limit = Math.ceil((4 * reach) / P.span.min);
  for (let i = 0; i < limit; i++) {
    // Onto the next angle point once this one is within a span: aiming at a
    // point the walk is about to stand on swings the bearing through a right
    // angle for the sake of a few metres.
    while (
      aimAt + 1 < survey.length &&
      Math.hypot(survey[aimAt].x - cursor.x, survey[aimAt].z - cursor.z) < P.span.max
    ) {
      aimAt++;
    }
    // WHERE THE LINE WANTS TO GO is the angle point it is walking toward;
    // what it does about water is swing off that aim by as little as gets it
    // round. A swing it cannot pay for at a tower not allowed to turn is a
    // swing it does not make.
    const aim = Math.atan2(target().x - cursor.x, target().z - cursor.z);
    let bearing = aim;
    let wet = wetRun(ctx.land, cursor.x, cursor.z, aim);
    if (wet > P.span.stretch) {
      for (const swing of [0.1, -0.1, 0.2, -0.2, P.angle.most, -P.angle.most]) {
        const tried = wetRun(ctx.land, cursor.x, cursor.z, heading + swing);
        if (tried < wet) {
          wet = tried;
          bearing = heading + swing;
        }
        if (wet <= P.span.stretch) break;
      }
    }
    const most = sinceAngle >= P.angle.apart ? P.angle.most : P.angle.suspension;
    const wanted = Math.max(-most, Math.min(most, angleDiff(heading, bearing)));
    // AND WHERE THE LINE CAN GO is the tower's answer, not the survey's.
    // The wanted bearing first, then further and further off it: a span
    // the country will not close is got round by TURNING, which is what a
    // surveyor does with it and the reason a line has angle points at all.
    // Only then does the span stretch — a bend is cheaper than six hundred
    // metres of conductor, and both are cheaper than no line.
    let turn = wanted;
    let next: Spot | null = null;
    const bands: [number, number, boolean][] = [
      [P.span.min, P.span.max, true],
      [P.span.max + P.probe, P.span.stretch, false],
    ];
    for (const [lo, hi, longest] of bands) {
      for (const off of TURN_TRIES) {
        const tried = Math.max(-most, Math.min(most, wanted + off * most));
        next = nextTower(ctx, cursor, heading + tried, height, lo, hi, longest);
        if (next) {
          turn = tried;
          break;
        }
      }
      if (next) break;
    }
    if (!next) {
      note("wires: unspannable");
      return [];
    }
    heading += turn;
    const angled = Math.abs(turn) > P.angle.suspension;
    sinceAngle = angled ? 0 : sinceAngle + 1;
    sinceTension = angled ? 0 : sinceTension + 1;
    // A turn is carried by the tower it happens AT, so the deviation is
    // written on the tower the line is LEAVING, not the one it reaches, and
    // the crossarm there squares the BISECTOR of the two bearings.
    //
    // Every tower, not only the angle ones: a suspension tower carries a
    // couple of degrees, and a couple of degrees is still a bend the arm
    // has to bisect. Recorded as zero it read as a line that turned between
    // two towers, which is the one thing a line cannot do — and it is what
    // the deviation test caught.
    const last = pylons[pylons.length - 1];
    last.deviation = turn;
    last.heading = heading - turn / 2;
    if (angled) {
      last.kind = "angle";
    } else if (sinceTension >= P.section) {
      last.kind = last.kind === "suspension" ? "tension" : last.kind;
      sinceTension = 0;
    }
    pylons.push({
      x: next.x,
      z: next.z,
      y: next.y,
      heading,
      kind: "suspension",
      deviation: 0,
      span: Math.hypot(next.x - cursor.x, next.z - cursor.z),
    });
    cursor = next;
    if (Math.hypot(cursor.x, cursor.z) <= ctx.worldBound) entered = true;
    if (entered && Math.hypot(cursor.x, cursor.z) > reach) {
      // The far rim, and the line is out. Its last tower is a tension one:
      // a section always closes at one, and this one closes past the fog.
      pylons[pylons.length - 1].kind = "tension";
      return pylons;
    }
  }
  note("wires: never crossed");
  return [];
}

// ── The line, laid ────────────────────────────────────────────────────────

/** R45 — lay the transmission line this seed's country carries, if it
 * carries one. Deterministic in the seed, the country and what is already
 * on the map; at most one line, and none at all on a little under half the
 * seeds. Called once per stage, after everything a tower keeps off has
 * been built. */
export function placePowerLines(ctx: PowerlineContext): PowerLine[] {
  const rng: Rng = createRng((ctx.seed ^ 0x6d2b79f5) >>> 0);
  if (!rng.chance(P.chance)) return [];
  const height = rng.range(P.tower.height.min, P.tower.height.max);
  for (let attempt = 0; attempt < P.tries; attempt++) {
    const pylons = walkLine(
      (ctx.seed ^ 0x1b873593 ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0,
      ctx,
      height,
    );
    // Two towers is a span, not a line. Anything that short begins and ends
    // inside the fog, which is the one thing a grid may never look like.
    if (pylons.length < 3) continue;
    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of pylons) {
      bounds.minX = Math.min(bounds.minX, p.x - P.wayleave);
      bounds.maxX = Math.max(bounds.maxX, p.x + P.wayleave);
      bounds.minZ = Math.min(bounds.minZ, p.z - P.wayleave);
      bounds.maxZ = Math.max(bounds.maxZ, p.z + P.wayleave);
    }
    return [{ height, pylons, bounds }];
  }
  note("wires: no line");
  return [];
}

// ── What the car can hit, and what the forest keeps off ───────────────────

/** How fat one leg's ring of wall bays stands, m — inside the drawn foot,
 * for `windFarmSolids`' reason. */
const LEG_RADIUS = P.tower.foot / 2 - 0.25;

/** Where a tower's two legs stand: the crossarm runs square across the
 * line, so the legs are `base` apart along that square. One list, read by
 * the solids and by the renderer, so the steel and the collision agree. */
export function pylonLegs(pylon: Pylon): { x: number; z: number }[] {
  const across = { x: Math.cos(pylon.heading), z: -Math.sin(pylon.heading) };
  return [-1, 1].map((side) => ({
    x: pylon.x + across.x * side * (P.tower.base / 2),
    z: pylon.z + across.z * side * (P.tower.base / 2),
  }));
}

/** R45 — where the concrete stops and the steel starts, per leg.
 *
 * A lattice tower is bolted to poured pad-and-chimney footings, and on a
 * slope those are poured to ONE WORKING LEVEL rather than each to its own
 * ground: that is what a level crossarm on a hillside is standing on. The
 * level is the highest leg's ground plus the chimney it stands proud by;
 * a footing may reach `footing.most` toward it, and whatever fall is left
 * over is taken up by the LEG being longer, which is the other half of how
 * a real tower fits a hillside.
 *
 * Stated here rather than in the renderer because the renderer is not its
 * only reader — the item sheet stands one on a flat grid and the analysis
 * measures the steel from it — and because a footing the drawing invents
 * for itself is a footing that disagrees with the collision ring round it.
 * `grounds` is per leg, in `pylonLegs` order. */
export function pylonFootings(grounds: readonly number[]): number[] {
  const F = P.tower.footing;
  const level = Math.max(...grounds) + F.proud;
  return grounds.map((g) => Math.min(level, g + F.most));
}

/** R45 — every leg as a ring of wall bays, the tower's full height to the
 * physics: a car does not get over one and does not move one. The wires are
 * not solid — nothing a rally car does reaches them. */
export function powerLineSolids(
  line: PowerLine,
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
  out: WildObstacle[] = [],
): WildObstacle[] {
  const n = Math.max(4, Math.round((2 * Math.PI * LEG_RADIUS) / WALL_BAY));
  for (const pylon of line.pylons) {
    for (const leg of pylonLegs(pylon)) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = leg.x + Math.cos(a) * LEG_RADIUS;
        const z = leg.z + Math.sin(a) * LEG_RADIUS;
        const y = groundAt(x, z);
        out.push(
          standSolid({
            x,
            z,
            y: Number.isNaN(y) ? pylon.y : y,
            kind: "wall",
            size: line.height / WALL_STOREY,
            spin: a,
          }),
        );
      }
    }
  }
  return out;
}

/** The ground each tower keeps everything else off: a rectangle round its
 * base, square to the crossarm. Not a pad — the country under a tower is
 * the country, and a real one stands on the hillside its legs were cut to
 * fit; flattening a disc under every tower would put a step in the country
 * every three hundred metres. */
export function powerLineFootprints(
  line: PowerLine,
): { x: number; z: number; heading: number; width: number; depth: number }[] {
  return line.pylons.map((pylon) => ({
    x: pylon.x,
    z: pylon.z,
    heading: pylon.heading,
    width: P.tower.base + P.tower.foot * 2,
    depth: P.tower.foot * 3,
  }));
}

/** R45 — is this point under the WAYLEAVE: the ride cut through the forest
 * along the line, `wayleave` metres either side of it. Trees only — the
 * stones and the scrub stay, because a corridor is cut on a cycle of years
 * rather than bulldozed — so it is asked at the tree placer and nowhere
 * else. */
export function underWayleave(line: PowerLine, x: number, z: number): boolean {
  const { bounds } = line;
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
  const w2 = P.wayleave * P.wayleave;
  for (let i = 0; i + 1 < line.pylons.length; i++) {
    const a = line.pylons[i];
    const b = line.pylons[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const ox = a.x + dx * t - x;
    const oz = a.z + dz * t - z;
    if (ox * ox + oz * oz <= w2) return true;
  }
  return false;
}

/** Where the wires hang on one tower, in the tower's own frame: `across`
 * the crossarm from its middle (+ toward the line's right) and `up` from
 * the tower's foot. One list, so the renderer hangs the wires exactly where
 * the survey put them and the analysis measures them.
 *
 * The three conductors hang UNDER the crossarm on insulator strings — one
 * at each end and one in the middle — and each is a BUNDLE of sub-wires on
 * spacers, which is why they come in pairs when you are near enough to see.
 * The two earth wires ride the peaks above the crossarm's ends, and that is
 * what makes the silhouette read as a portal rather than a goalpost. */
export function pylonWirePoints(height: number): { across: number; up: number; earth: boolean }[] {
  const arm = P.tower.arm / 2;
  const hang = height - P.wire.insulator;
  const out: { across: number; up: number; earth: boolean }[] = [];
  /** Spread `n` attachments evenly over the crossarm, -1..1 of its half. */
  const spread = (i: number, n: number): number => (n < 2 ? 0 : (i / (n - 1)) * 2 - 1);
  for (let i = 0; i < P.wire.conductors; i++) {
    const t = spread(i, P.wire.conductors);
    for (let k = 0; k < P.wire.bundle; k++) {
      const off = (k - (P.wire.bundle - 1) / 2) * P.wire.bundleGap;
      out.push({ across: t * arm + off, up: hang, earth: false });
    }
  }
  for (let i = 0; i < P.wire.earth; i++) {
    out.push({ across: spread(i, P.wire.earth) * arm, up: height + P.tower.peak, earth: true });
  }
  return out;
}

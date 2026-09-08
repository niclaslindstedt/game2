// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT COMES OUT OF A TAILPIPE — the whole of it as numbers, with nothing
// drawn. fumes.ts is the cloud this describes; this is what a pipe is doing.
//
// DOM-free, and its own module for the reason every payload in this game is
// split off from its renderer: what an exhaust IS can then be asserted in a
// test (tests/exhaust_test.ts) rather than photographed, and the two clouds
// that draw it — the player's own and the one the whole field shares — cannot
// drift into telling different stories about the same engine.
//
// WHAT COMES OUT OF A PIPE IS TWO SUBSTANCES, and everything here follows
// from keeping them apart:
//
//   WATER, which is invisible until the air is cold enough to condense it.
//   Burning petrol makes about its own weight in water, and it leaves the
//   pipe as vapour every time — what changes is whether the air it mixes
//   into can hold it. On a summer stage it cannot be seen at all; at ten
//   below it is the white plume that hangs over a start line, and it is
//   the same plume as breath on a cold morning for exactly the same reason.
//   This is why an exhaust is a WINTER effect: the pipe is doing the same
//   thing in August, and the air is simply swallowing it.
//
//   SOOT, which is carbon the combustion did not finish and the pipework
//   did not scrub. It is a fact about the THROTTLE, not about the air: an
//   engine given a bootful, and given it low down where the mixture is
//   richest, blows what the silencer had collected out of the back of the
//   car. This is the dark half, and it is visible in any weather — it is
//   just thin, because a modern-enough pipe is not a coal fire.
//
// So the cloud is PALE and BARELY THERE by default, whitens and thickens as
// the air gets cold, and DARKENS as the pedal goes down. Off the throttle
// entirely in warm air there is nothing to draw at all, and nothing is
// drawn: `pipeWork` returns a burst of no puffs and the pool is never
// touched, which is also the cheapest the effect ever is.

import { temperatureAt, type Climate, type Weather } from "@engine";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * WHAT THE PIPE PUTS OUT, and what the air does with it. Every number here
 * is one of the two substances in the header or the rate they arrive at.
 */
export const EXHAUST = {
  /** Seconds between bursts, from an engine merely idling to one being
   * given everything it has. The worked end is a pipe firing thirty-odd
   * times a second, which no frame rate answers one burst at a time —
   * which is what `pipeBursts` is for. It is deliberately not faster: a
   * puff here BILLOWS and hangs for a couple of seconds (`look`), so the
   * density comes from the overlap of the ones already up rather than from
   * making more of them, and a rate that outruns the life only spends the
   * pool on puffs stacked in one place. */
  every: { idle: 0.11, worked: 0.03 },
  /** THE FUEL, 0..1 of what the engine can drink. `idle` is what it takes
   * to keep itself turning with the pedal up; the rest is the pedal, worth
   * `rev` of its full share at the bottom of the rev range and all of it at
   * the top — an engine at 1,000 rpm on a wide-open throttle is burning far
   * less per second than the same throttle at the limiter, however hard the
   * driver is trying.
   *
   * Fuel burned is the whole of how MUCH gas there is: the rate, the size
   * of a burst, and what pushes it out of the pipe all answer this and not
   * the speedometer — which is why the grid, where the car is going nowhere
   * at all, is not the quietest place on the stage. */
  burn: { idle: 0.09, rev: 0.35 },
  /** Puffs in a burst at full fuel. A blip has to read as a BURST rather
   * than a tick, so a worked engine spends its fuel on several at once. */
  puffs: 4,
  /** What pushes the gas out of the pipe at full fuel, m/s, on top of the
   * wake. Gentle, because a stationary car's cloud has to BILLOW and hang
   * around the back of it — anything jetted hard streams straight past the
   * chase camera and leaves the start line looking clean. */
  blast: 1.5,
  /** THE SOOT, 0 pale .. 1 black — the carbon the burn did not finish.
   * `clean` is a warm engine with the pedal up, which is very nearly
   * nothing. `rich` is what a bootful adds, and `lug` is the share of that
   * a bootful still earns at the TOP of the rev range: the mixture is
   * richest where the engine is working hardest for its revs, so wide open
   * low down is the sootiest a pipe gets and the same pedal at the limiter
   * is half of it. That one term is also the whole of the throttle BLIP —
   * the revs chase the pedal rather than arriving with it, so a stab makes
   * a puff of black that clears as the engine comes up, which is what a
   * blip looks like. `launch` is the clutch coming out on a lit axle. */
  soot: { clean: 0.06, rich: 0.72, lug: 0.45, launch: 0.3 },
  /** THE WATER, and whether the air will show it. Visible from `from`
   * degrees down, a full plume at `full` and colder. `damp` is the share a
   * bone-dry sky still condenses — the rest is the weather's (a wet sky is
   * already carrying its water and has no room for the pipe's).
   *
   * Nothing here asks how hard the engine is working, and that is the
   * point: a revving engine makes more water AND more gas to carry it, so
   * the concentration is about constant and what the throttle changes is how
   * much plume there is, not how white it is. The quantity is already `every`
   * and `puffs`, and an exhaust that takes the fuel a second time here is an
   * idling car at ten below with a wisp behind it — the one thing a cold
   * idling car never looks like.
   *
   * `cold` is the COLD PIPE at the start of a run, worth this much again on
   * top, fading over `warmUp` seconds. Everything before the flag is inside
   * that window on purpose: a car that has been sitting on the line has
   * cold steel from the manifold back, the water condenses INSIDE the pipe
   * rather than a metre behind it, and a winter start line is the thickest
   * this effect ever legitimately gets. */
  condense: { from: 12, full: -10, damp: 0.7, cold: 0.6, warmUp: 30 },
  /** How much of the SOOT's darkness a full water plume washes out. The two
   * substances leave together, so a cold stage's hard acceleration is a big
   * grey billow rather than the black wisp the same pedal makes in summer —
   * there is simply more water around each grain of carbon. */
  wash: 0.5,
  /** HOW MUCH THERE IS TO SEE, which is not the same question as how much
   * gas there is. `soot` is how much of a puff a fully sooty exhaust is
   * worth on its own, against a full water plume's 1 — a warm stage's
   * hardest acceleration is a haze, not a smokescreen. Under `faint` there
   * is nothing worth a draw call and the pipe spawns nothing at all, which
   * is what makes a summer stage's exhaust free.
   *
   * `floor` is the share of the RATE a barely-visible cloud still fires at,
   * so the two do not collapse together: a haze is meant to be a lot of
   * nearly invisible puffs overlapping, and a rate that fell with the
   * opacity would make it a handful of faint blobs with road between them,
   * which reads as sprites rather than as smoke. */
  seen: { soot: 0.6, faint: 0.05, floor: 0.35 },
  /** WHAT A PUFF IS. The size it is born at and the swell over its life
   * both open out with the water in it, because that is the difference
   * between a wisp off a warm pipe and a plume that rolls: `dry` is the
   * share of each a puff with no water in it gets. The LIFE goes the same
   * way — a condensation plume hangs until it has mixed with enough air to
   * evaporate again, where a wisp of soot is gone in well under a second. */
  look: {
    dry: { size: 0.42, grow: 1.9 },
    wet: { size: 1.3, grow: 4.2 },
    life: { dry: 0.7, wet: 2.4, vary: 0.35 },
    /** Warm gas rises — and the hotter and thicker the plume, the more of
     * it there is to rise. */
    rise: { base: 0.55, wet: 0.5, vary: 0.5 },
  },
  /** THE PIPE TORN OFF BY THE GROUND (`DamagePart` "exhaust"). What is
   * left is an open port under the floor: nothing silencing it, and
   * nothing between the combustion chamber and the daylight, so what the
   * engine failed to burn leaves as soot instead of being finished on the
   * way out. `every` scales the interval between bursts — under 1 the car
   * smokes harder than any intact pipe ever does — `puffs` is the extra
   * each burst carries, and `shade` is the floor the soot is held above,
   * so a broken car is black on the pedal and stays black off it rather
   * than clearing. `blast` is what the unsilenced port throws them out
   * with. */
  broken: { every: 0.5, puffs: 2, shade: 0.9, blast: 1.1 },
};

/** THE AIR THE PLUME MIXES INTO — everything about the world the pipe is
 * in, read once a frame and handed to every pipe in it. */
export type PipeAir = {
  /** °C, at the PIPE's own height rather than at the datum: the temperature
   * is a field (climate.ts), so a stage that climbs to a pass drives into
   * its own winter and the plume thickens on the way up. */
  temperature: number;
  /** How much water the sky is already carrying, 0 bone dry .. 1 saturated
   * — a wet sky has no room for the pipe's and condenses all of it. */
  damp: number;
  /** Seconds the engine has been running, for the cold-pipe start. */
  since: number;
};

/** The air over a car at height `y`, read off the stage's own climate and
 * weather. Stated here so the player's pipe and the field's cannot disagree
 * about what the weather is doing to them — they are two different runs'
 * states on the same road, which is why this takes the three facts it needs
 * rather than a whole `GameState`. */
export function pipeAir(
  run: { track: { climate: Climate }; env: { weather: Weather }; t: number },
  y: number,
): PipeAir {
  return {
    temperature: temperatureAt(run.track.climate, y),
    damp: run.env.weather === "clear" ? 0 : 1,
    since: run.t,
  };
}

/** What a puff LOOKS like — the part of the pipe's work the pool needs. */
export type PipeLook = {
  /** Soot, 0 pale .. 1 black. */
  shade: number;
  /** How much of the puff is condensing water, 0 a dry wisp .. 1 a full
   * winter plume: how white it is, how big it is born, how far it swells
   * and how long it hangs. */
  bloom: number;
  /** How much of it there is to SEE at all, 0..1 — the puff's own opacity
   * against the cloud's. */
  body: number;
};

/** How hard a pipe is working this instant. */
export type PipeWork = PipeLook & {
  /** Seconds between bursts. */
  every: number;
  /** Puffs in one of them. ZERO where there is nothing to see: a warm
   * engine off the throttle puts out gas the air swallows whole, and the
   * honest picture of that is an empty pool. */
  puffs: number;
  /** What pushes them out of the pipe, m/s, on top of the wake. */
  blast: number;
};

/** What the exhaust needs to know about the car it is bolted to. */
export type PipeEngine = {
  /** Engine revs, 0 idle .. 1 redline. */
  rev: number;
  /** Road speed, m/s. */
  u: number;
  /** The pedal the engine is being given, 0..1 (`CarState.pedal`). */
  pedal: number;
  /** The clutch coming out on a lit axle, 0..1. */
  launchSpin: number;
};

/** …and about the pipework itself.
 *
 *   `thickness` — how much of a pipe it gets: 1 for the car being driven,
 *   less for a rival, which is the same bargain the field's dust makes
 *   (`FIELD_PLUME`). A cloud seen across a start line does not need the
 *   density of the one coming off your own bumper, and eight of them at
 *   full rate would spend the shared pool in a third of a second.
 *
 *   `pipes` — HOW MANY EXITS IT HAS, and the answer is a share rather than
 *   a multiplier: an engine burns the fuel it burns whichever way out the
 *   gas leaves, so a twin-exit car fires each of its pipes half as often
 *   and puts the same amount of smoke behind itself as a single. Left as a
 *   multiplier the works sedan would ask its cloud for twice the pool it
 *   holds at the limiter, and the answer to that is not more smoke, it is
 *   a cloud tearing holes in itself at the moment it is thickest. Each
 *   burst keeps its full `puffs`, because that is what makes a blip read
 *   as a burst rather than a tick, and it is per pipe.
 *
 *   `vapour` — HOW MUCH OF THE WINTER PLUME THIS MACHINE HAS AGREED TO
 *   DRAW, 0..1 (the DETAIL row's exhaust stop, `EXHAUST_SEEN`). It is the
 *   condensation and only the condensation, because that is the half with
 *   the cost in it: the water plume is drawn with the biggest, longest-
 *   lived, most overlapping sprites the cloud makes, and a winter grid of
 *   eight cars is the one frame in the game where an exhaust is measurable.
 *   The soot rides every stop untouched — it is a wisp either way, and a
 *   car whose pedal made no difference to its pipe would read as a bug.
 *
 *   `broken` — the pipework torn off by the ground, which is the one thing
 *   here that is not a fact about the throttle or the weather. It goes on
 *   top of whatever the engine was doing rather than replacing it, so a
 *   wrecked car still blips blacker than it idles; and it holds the soot up
 *   from below rather than setting it, so a broken car cannot come out
 *   PALER than the intact one it was a moment ago. */
export type PipeFit = {
  thickness?: number;
  pipes?: number;
  vapour?: number;
  broken?: boolean;
};

/**
 * Read the pipe off the engine and the air around it.
 *
 * `fx` is the transient-FX budget; `fit` is what this particular pipe
 * brings to it (see `PipeFit`).
 */
export function pipeWork(
  engine: PipeEngine,
  air: PipeAir,
  fx: number,
  fit: PipeFit = {},
): PipeWork {
  const X = EXHAUST;
  const thickness = fit.thickness ?? 1;
  const pipes = Math.max(1, fit.pipes ?? 1);
  const gone = fit.broken ? X.broken : null;

  // THE FUEL. Everything about how much gas there is comes off this one
  // number, and nothing about it comes off the speedometer.
  const pedal = clamp01(engine.pedal);
  const rev = clamp01(engine.rev);
  const fuel = clamp01(
    X.burn.idle + (1 - X.burn.idle) * pedal * (X.burn.rev + (1 - X.burn.rev) * rev),
  );

  // THE SOOT. Richest wide open and low down, which is also what makes a
  // stab of throttle a puff of black that clears as the revs come up.
  const rich = pedal * (X.soot.lug + (1 - X.soot.lug) * (1 - rev));
  const soot = clamp01(
    X.soot.clean + (X.soot.rich - X.soot.clean) * rich + X.soot.launch * clamp01(engine.launchSpin),
  );

  // THE WATER, and whether this air will show it.
  const C = X.condense;
  const chill = clamp01((C.from - air.temperature) / (C.from - C.full));
  const wet = C.damp + (1 - C.damp) * clamp01(air.damp);
  const cold = 1 + C.cold * (1 - clamp01(air.since / C.warmUp));
  const bloom = clamp01(chill * wet * cold) * clamp01(fit.vapour ?? 1);

  // ...and how much of the pair there is to see. A broken pipe is soot with
  // nothing scrubbing it, so it carries its own floor into the visibility
  // rather than only into the colour.
  const shade = Math.max(gone?.shade ?? 0, soot * (1 - X.wash * bloom));
  const body = clamp01(bloom + Math.max(soot, gone?.shade ?? 0) * X.seen.soot);
  const density = X.seen.floor + (1 - X.seen.floor) * body;

  return {
    every:
      (pipes * (gone?.every ?? 1) * (X.every.idle + (X.every.worked - X.every.idle) * fuel)) /
      (Math.max(0.2, fx) * thickness * density),
    puffs:
      body < X.seen.faint
        ? 0
        : (gone ? gone.puffs : 0) + 1 + Math.round((X.puffs - 1) * fuel * thickness),
    shade,
    bloom,
    body,
    blast: (gone?.blast ?? 0) + engine.u * 0.15 + X.blast * fuel,
  };
}

/** The most bursts one frame may make good on. A pipe at the limiter fires
 * sixty-odd times a second, which no frame rate answers one burst at a time
 * — so a pipe carries its remainder (`pipeBursts`) and a slow frame pays
 * several at once. The cap is what stops a frame that arrived LATE — a stage
 * built, a tab woken, a lockup — from emptying the whole pool into one spot
 * in a single position. Eight covers a pipe at full rate down to about eight
 * frames a second, which is well under anything the game is played at. */
const BURST_CAP = 8;

/** How many bursts a pipe with `clock` seconds banked owes at a rate of one
 * every `every` seconds. The caller adds the frame's `dt` to its own clock
 * and takes `bursts * every` back off it, so the REMAINDER survives the
 * frame.
 *
 * That remainder is the whole point. A clock reset to zero on every burst
 * makes at most one burst per frame however hard the engine is working, and
 * the exhaust's thickness stops being a fact about the engine and becomes a
 * fact about the frame rate — the same car smokes half as much on a 30 fps
 * phone as on a 60 fps desktop, and not at all under a headless renderer.
 * This is the same bargain the dust plume strikes with its `debts`. */
export function pipeBursts(clock: number, every: number): number {
  return Math.min(BURST_CAP, Math.floor(clock / every));
}

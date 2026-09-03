// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BED'S SCHEDULER — the half that reads the live `GameState` once a frame
// and steers every continuous voice the run has. What a voice IS lives in
// `engine-voice.ts` (the machinery), `road-voice.ts` (the tyres, the wind,
// the weather and the slide) and `ambience.ts` (the country); this is the
// one place that turns a state into their targets, and the one place the
// CUES the simulation never reports are raised from: the start lights, the
// exhaust crackle on a lift, the wipers, the marshal's whistle.
//
// NOTHING HERE IS BOOKED AHEAD. The layers run on the audio thread and
// every frame merely tells them where to go next, over a glide; a frame
// that arrives late — a garbage-collection pause, a phone throttling itself,
// a stall while the world is built — leaves every layer holding its last
// value. A bed that had to be fed on a cadence breathed with the frame rate
// and stuttered when it was starved, and a stutter is what a player reports
// as crackle.

import { lineAt, startsIn, trainAt, type GameState, type RailCrossing } from "@engine";

import { squallOf, wetnessOf } from "../weather.ts";

import type { Synth } from "../../lib/voice.ts";

import { createWorld, type World, type WorldVoice } from "./ambience.ts";
import { WORLD_BANK } from "./bank-world.ts";
import { RUN_BANK } from "./bank.ts";
import {
  ENGINE_GLIDE,
  ENGINE_LAYERS,
  engineTargets,
  rpmAt,
  type EngineLayer,
} from "./engine-voice.ts";
import { listenerFor, type Listener } from "./listener.ts";
import { playSound } from "./play.ts";
import { createRack, type Rack } from "./rack.ts";
import { ROAD_GLIDE, ROAD_LAYERS, roadTargets, type RoadLayer } from "./road-voice.ts";

/**
 * HOW HARD THE TYRES ARE BEING ASKED TO TURN THE CAR, as a lateral
 * acceleration, m/s² — the point at which they are working flat out.
 *
 * Lateral acceleration (`u * yawRate`) is the honest signal for cornering and
 * it costs a multiply: it is zero on a straight at any speed, zero at a
 * standstill with the wheel on full lock, and largest exactly where a tyre is
 * loudest. Measured over bot-driven stages, a stage's straights sit under
 * 1.5 m/s² and its corners run 8–15, so this is where "at the limit" is.
 */
const LAT_LIMIT = 14;

/** The wind speed at which the gale layer is as loud as it gets, m/s. A
 * storm's mean runs to 11 and the gusts swing it half as far again, so this
 * is the top of what the game can actually blow. */
const GALE_FULL = 16;

/** How much wheelspin, m/s of the driven wheels outrunning the road, is a
 * tyre fully lit. */
const SPIN_FULL = 6;

/** How quickly the smoothed signals follow, as time constants in seconds.
 * Written as taus rather than as per-frame fractions because a fraction is
 * only true at the frame rate it was tuned at — the same engine would pick up
 * load twice as fast on a 120 Hz display as on a phone at 40. */
const RISE_TAU = 0.039;
const FALL_TAU = 0.13;

/** THE LIFT. Load has to have been over `from` and fallen under `to` with
 * the revs above `revs` for the exhaust to crackle — and it crackles at
 * most once per `gap` seconds, because a driver feathering the throttle
 * through a corner is not a car popping every frame. */
const LIFT = { from: 0.55, to: 0.25, revs: 0.45, gap: 0.9 };

/** THE WIPERS' STROKE, s — the same two numbers the drawn blades run on
 * (`STROKE` in `car/wipers.ts`, which this cannot import without pulling
 * three.js into the audio). A stroke slows to `slow` in a drizzle and
 * quickens to `fast` in a storm; below `from` the blades stay parked. */
const WIPE = { slow: 1.25, fast: 0.6, from: 0.25 };

/** How far from the line the start control's crowd is heard, m, and how far
 * before the finish its stands are. */
const CROWD_REACH = 120;
const FINISH_REACH = 160;

/** How close a paddock has to be to be heard, m. */
const STOCK_REACH = 160;

/** The railway's three distances, m: how far a train is heard at all, how
 * far from the crossing it sounds its horn, and how close the car has to be
 * to the crossing for the bell. */
const TRAIN_REACH = 700;
const HORN_AT = 450;
const BELL_AT = 120;

/** When the marshal's whistle goes, seconds into the intro. */
const WHISTLE_AT = 1.6;

/** One step of an asymmetric one-pole filter: quick to rise, slower to fall.
 * A tyre loads up the instant the car turns in and unloads over the following
 * moment, and an engine picks up load the instant the throttle opens. */
function follow(previous: number, target: number, dt: number): number {
  const tau = target > previous ? RISE_TAU : FALL_TAU;
  return previous + (target - previous) * (1 - Math.exp(-dt / tau));
}

/**
 * HOW HARD THE ENGINE IS WORKING, 0..1 — and the state has no throttle in it,
 * so it is inferred.
 *
 * A car that is accelerating is on the power; one holding speed is
 * part-throttle; one slowing down is off it. Acceleration is the honest signal
 * for all three and it is available. Braking forces it to nothing outright,
 * because a car on the brakes is never under load however fast it is going.
 */
function loadFrom(previous: number, accel: number, braking: boolean, dt: number): number {
  const target = braking ? 0.05 : Math.min(1, Math.max(0.12, 0.2 + accel * 0.35));
  return follow(previous, target, dt);
}

/** The bed's own memory between frames. */
type BedState = {
  /** Smoothed engine load, 0..1 — see `loadFrom`. */
  load: number;
  /** Smoothed lateral work, 0..1 — see `LAT_LIMIT`. Smoothed because the raw
   * yaw rate twitches over every rut, and a bed whose level twitches with it
   * is a flutter. */
  corner: number;
  /** The countdown second last announced, so each light sounds once. */
  lastLight: number;
  /** Whether the load was up before this frame — the lift detector. */
  wasLoaded: boolean;
  /** Audio time of the last crackle. */
  lastPop: number;
  /** The wipers' stroke phase, 0..1, and whether they are running. */
  wipe: number;
  wiping: boolean;
  /** Whether this run's whistle has gone. */
  whistled: boolean;
};

/** The road bed, for the whole life of one app. */
export type DriveBed = {
  /**
   * Steer every layer and raise every due cue. Call once per rendered frame
   * with the live state and the frame's own elapsed time; it is cheap when
   * nothing changed and silent when the context is locked.
   */
  update: (state: GameState, dt: number) => void;
  /** Which camera the run is being watched from — the mix follows it. */
  setView: (view: string) => void;
  /** How hard the engine is on boost right now, 0..1 — what the router
   * asks before it lets a shift dump the wastegate. */
  boost: () => number;
  /**
   * THE RUN IS STILL THERE BUT NOBODY IS HEARING IT — a pause card, god
   * mode's hold, a menu over the top. Tear the layers down without forgetting
   * a thing the run is still owed: the next `update` builds them again and
   * the stage picks up where the player left it, with the countdown light it
   * had already called and the whistle it had already blown still spent.
   *
   * Silencing has to be SAID. Nothing here is booked ahead, so a bed that is
   * merely stopped being fed holds its last target forever — which is an
   * engine note and a wind that carry on behind a card that stopped the car.
   */
  silence: () => void;
  /** The run is over or the player left it: silence the beds and forget
   * everything the next run should not inherit. */
  reset: () => void;
};

export function createDriveBed(synth: Synth, random: () => number = Math.random): DriveBed {
  const bed: BedState = {
    load: 0.2,
    corner: 0,
    lastLight: -1,
    wasLoaded: false,
    lastPop: -Infinity,
    wipe: 0,
    wiping: false,
    whistled: false,
  };
  let lastU = 0;
  let lastRev = 0;
  let listener: Listener = listenerFor("chase");
  const engine: Rack<EngineLayer> = createRack(synth, ENGINE_LAYERS, ENGINE_GLIDE);
  const road: Rack<RoadLayer> = createRack(synth, ROAD_LAYERS, ROAD_GLIDE);
  const world: World = createWorld(synth, random);

  /** Every layer down, and the world's roster rolled fresh. The roster's
   * clocks are absolute audio times and that clock runs through a pause, so a
   * world that kept them would come back owing every bird, cow and cicada at
   * once. What the RUN has spent is not touched — that is `reset`'s. */
  const hush = (): void => {
    engine.stop();
    road.stop();
    world.stop();
    world.reset();
  };

  /** The car's own axes, for placing something beside it. */
  const sideOf = (state: GameState, x: number, z: number): { d: number; pan: number } => {
    const dx = x - state.car.x;
    const dz = z - state.car.z;
    const d = Math.hypot(dx, dz);
    // Travel is (sin h, cos h); the driver's right is (-cos h, sin h).
    const right = (-dx * Math.cos(state.car.heading) + dz * Math.sin(state.car.heading)) / (d || 1);
    return { d, pan: Math.max(-0.8, Math.min(0.8, right)) };
  };

  /** The nearest paddock the road runs past. */
  const stockNear = (state: GameState): WorldVoice["stock"] => {
    let best: WorldVoice["stock"] = null;
    for (const home of state.track.homesteads) {
      const paddock = home.farm?.paddock;
      if (!paddock) continue;
      const { d, pan } = sideOf(state, paddock.rect.x, paddock.rect.z);
      if (d >= STOCK_REACH) continue;
      const near = 1 - d / STOCK_REACH;
      if (!best || near > best.near) best = { kind: paddock.stock, near, pan };
    }
    return best;
  };

  /** The train on the line, if the car is anywhere near it. */
  const trainNear = (state: GameState): WorldVoice["train"] => {
    let best: WorldVoice["train"] = null;
    for (const crossing of state.track.rails as RailCrossing[]) {
      const train = trainAt(crossing, state.t);
      if (!train) continue;
      const head = lineAt(crossing.line, train.headS);
      const { d, pan } = sideOf(state, head.x, head.z);
      const atCrossing = sideOf(state, crossing.x, crossing.z).d;
      if (d >= TRAIN_REACH && atCrossing >= TRAIN_REACH) continue;
      const near = Math.max(0, 1 - d / TRAIN_REACH);
      const toCrossing = (crossing.line.crossingS - train.headS) * train.direction;
      const horn = toCrossing > 0 && toCrossing < HORN_AT && atCrossing < TRAIN_REACH;
      const bell = atCrossing < BELL_AT;
      if (!best || near > best.near) best = { near, pan, horn, bell };
    }
    return best;
  };

  return {
    update(state, dt) {
      const now = synth.now();
      if (now === null) {
        // Locked, suspended or muted to nothing. Nudge the context; the
        // racks rebuild whatever they need the moment it is back.
        synth.resume();
        return;
      }
      const car = state.car;
      const spec = state.spec;
      const topSpeed = spec.gearTop[spec.gearTop.length - 1];
      const speed = Math.hypot(car.u, car.w);
      const air = Math.min(1, speed / topSpeed);
      const biome = state.track.knobs.biome;
      const wet = wetnessOf(state.env, biome);
      const gale = Math.min(1, Math.hypot(state.wind.x, state.wind.z) / GALE_FULL);

      // The lights before the off: one per whole second remaining, and the
      // engine's own `go` event handles the last one. Done here rather than
      // from an event because the countdown is a CLOCK rather than a moment
      // — nothing happens in the simulation when a light changes.
      if (state.phase === "countdown" || state.phase === "intro") {
        const light = Math.ceil(startsIn(state));
        if (state.phase === "countdown" && light !== bed.lastLight && light > 0) {
          bed.lastLight = light;
          playSound(synth, RUN_BANK, "countdown_tick");
        }
        if (!bed.whistled && state.t >= WHISTLE_AT) {
          bed.whistled = true;
          playSound(synth, WORLD_BANK, "marshal_whistle", { gain: listener.world });
        }
      } else {
        bed.lastLight = -1;
      }

      // Measured over the FRAME rather than over a step: several simulation
      // steps happen between two calls, so a step-sized divisor would read
      // every frame's speed change as five times the acceleration it was.
      const frame = Math.max(1 / 240, Math.min(0.1, dt));
      const accel = (car.u - lastU) / frame;
      lastU = car.u;
      bed.load = loadFrom(bed.load, accel, car.braking, frame);
      bed.corner = follow(
        bed.corner,
        Math.min(1, Math.abs(car.u * car.yawRate) / LAT_LIMIT),
        frame,
      );
      const rev = Math.min(1, Math.max(0, car.rev));

      // THE LIFT. Coming off a loaded engine at revs puts unburnt fuel in a
      // hot exhaust, and that is the crackle every rally car makes at the
      // top of a straight. Detected off the smoothed load's own edge.
      const loaded = bed.load > LIFT.from;
      if (
        bed.wasLoaded &&
        bed.load < LIFT.to &&
        lastRev > LIFT.revs &&
        now - bed.lastPop > LIFT.gap
      ) {
        bed.lastPop = now;
        playSound(synth, RUN_BANK, "overrun_pop", {
          gain: (0.6 + 0.6 * lastRev) * listener.exhaust,
          pitch: 0.85 + 0.25 * random(),
        });
      }
      if (loaded) bed.wasLoaded = true;
      else if (bed.load < LIFT.to) bed.wasLoaded = false;
      lastRev = rev;

      // ── The engine ─────────────────────────────────────────────────────
      // The revs exactly as the tachometer reads them, so the needle, the
      // shift light and the noise can never disagree.
      engine.apply(
        engineTargets(
          { rpm: rpmAt(car.rev), rev, load: bed.load, wear: car.damage.wear },
          { engine: listener.engine, exhaust: listener.exhaust, tone: listener.tone },
        ),
      );

      // ── The road ───────────────────────────────────────────────────────
      road.apply(
        roadTargets(
          {
            speed,
            air,
            surface: state.surface,
            corner: bed.corner,
            slide: car.slide,
            spin: Math.max(car.launchSpin, Math.min(1, car.wheelspin / SPIN_FULL)),
            sideways: car.w,
            airborne: car.airborne,
            // The weather, as one number, read against the country it is
            // over (a desert storm is dry). Fixed for the whole run.
            wet,
            // The weather's two live numbers. Both come off the wind, so the
            // gust the car is being shoved by is the same gust the player
            // HEARS arrive — see `weather.ts`.
            squall: squallOf(state.wind, state.env.windSpeed),
            gale,
          },
          {
            tyres: listener.tyres,
            scrub: listener.scrub,
            wind: listener.wind,
            weather: listener.weather,
          },
        ),
      );

      // ── The wipers ─────────────────────────────────────────────────────
      // Only heard from inside, and in step with the drawn blades: one
      // stroke per period, quicker the harder it is coming down.
      if (wet >= WIPE.from && listener.wipers > 0) {
        const period = WIPE.slow + (WIPE.fast - WIPE.slow) * Math.min(1, wet * 1.3);
        if (!bed.wiping) {
          bed.wiping = true;
          bed.wipe = 0;
        }
        bed.wipe += frame / period;
        if (bed.wipe >= 1) {
          bed.wipe -= 1;
          playSound(synth, RUN_BANK, "wiper", { gain: listener.wipers * (0.7 + 0.3 * wet) });
        }
      } else {
        bed.wiping = false;
      }

      // ── The world ──────────────────────────────────────────────────────
      const finishS = state.track.finishS;
      const atStart = Math.max(0, 1 - state.progressS / CROWD_REACH);
      const atFinish =
        finishS === null
          ? 0
          : state.progressS >= finishS
            ? 1
            : Math.max(0, 1 - (finishS - state.progressS) / FINISH_REACH);
      world.update(
        {
          biome,
          timeOfDay: state.env.timeOfDay,
          wet,
          gale,
          air,
          crowd: Math.max(atStart, atFinish),
          stock: stockNear(state),
          train: trainNear(state),
          world: listener.world,
        },
        now,
      );
    },

    setView(view) {
      listener = listenerFor(view);
    },

    boost: () => bed.load * lastRev,

    silence: hush,

    reset() {
      hush();
      bed.load = 0.2;
      bed.corner = 0;
      bed.lastLight = -1;
      bed.wasLoaded = false;
      bed.lastPop = -Infinity;
      bed.wipe = 0;
      bed.wiping = false;
      bed.whistled = false;
      lastU = 0;
      lastRev = 0;
    },
  };
}

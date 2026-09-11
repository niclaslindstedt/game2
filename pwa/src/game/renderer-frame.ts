// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE FRAME. Everything above this decides what is in the scene and what
// just happened to it; this is where a picture is made of it — the cameras
// aimed and stepped, the mirror's own pass, the world's chunks built and
// pruned on the frame's budget, the FX pools advanced, and finally the
// draw itself, which is more than one `render()` (the mirror fills its own
// target, and the map view draws its pane over a cleared canvas — see the
// note in AGENTS.md about what `make profile` counts as a frame).
//
// It also owns the canvas's size, the context-loss watch, and the meter.

import * as THREE from "three";
import { FRONT_LAMPS, REAR_LAMPS, TUNING, lampShare, type GameState } from "@engine";

import { clamp } from "../lib/util.ts";
import {
  LAMP_BEAMS,
  DUST_RAISED,
  TRAIL_LEFT,
  EXHAUST_SEEN,
  GLASS_RAIN,
  TV_BOKEH,
} from "./settings.ts";
import { createTvLens } from "./camera-tv-lens.ts";
import type { FrameCost, SceneShare } from "./benchmark-report.ts";
import { SHADOW_REACH } from "./car-shadow.ts";
import { PIPE_AXIS } from "./car/shell.ts";
import {
  AXLE,
  WET_THROW,
  LAUNCH,
  launchThrow,
  paceScale,
  TARMAC_SMOKE,
  WILD_THROW,
} from "./dust.ts";
import { clearDustLamps } from "./dust-light.ts";
import { SOOT, sootySmoke } from "./ground-tint.ts";
import { drawnGround } from "./snow-marks.ts";
import { CRASH_THROW } from "./crash-throw.ts";
import { bodyOffset } from "./car-anchor.ts";
import { watchGpuContext } from "./gpu-context.ts";
import { pipeAir, pipeBursts, pipeWork } from "./exhaust.ts";
import { fallbackMount } from "./mirror.ts";
import { refillGap } from "./mirror-pace.ts";
import { ENGINE_SMOKE, FOAM, ROUTE_SHARE, WATER_DROPS } from "./renderer-face.ts";
import type { RenderScene } from "./renderer-scene.ts";
import type { createEventFx } from "./renderer-fx.ts";

export function createFrame(parts: RenderScene, fx: ReturnType<typeof createEventFx>) {
  const { crashGrind_ } = fx;
  const { mut, live } = parts;
  const { applyAspect, applyRange, applyResolution, bayAt, canvas, carFx } = parts;
  const { chase, clipWorld, dustFx, environment, exhaustFx } = parts;
  const { field, floraFocus, floraShadows, fxScale, groundDust, marks } = parts;
  const { mirror, mirrorPace, pipeAt, pipeAxis, plumeDust, renderer, scene } = parts;
  const { smokeTint, wayHomeArrow } = parts;
  const { dust, mud, smoke, plume, gravel, spray, foam, fumes, life, celebration } = carFx;

  const render = (state: GameState, dt: number): void => {
    // Everything below aims at a picture — the FX pools, the mirror's aim,
    // the cull — and there is nowhere to put one while the GPU holds the
    // context (gpu-context.ts). Said here as well as in the app's frame loop
    // because the renderer is what knows: any caller drawing a frame during
    // an outage would otherwise run a stage's worth of effects blind.
    if (gpu.lost()) return;
    // A FRAME IS EVERY PASS IN IT. Three clears its render counters on each
    // `render()`, and this draws more than one — so the reset is here, at
    // the top of the frame, and `autoReset` is off underneath (`meterFrames`).
    if (metering) renderer.info.reset();
    const c = state.car;
    const view = chase.mode();
    const fwdX = Math.sin(c.heading);
    const fwdZ = Math.cos(c.heading);
    const rightX = Math.cos(c.heading);
    const rightZ = -Math.sin(c.heading);

    // Gravel kicked up at the wheels — the ground-contact half of the speed
    // feel. On a loose surface three overlapping sources, strongest first:
    // the drift/off-road rooster tail, the braking plume, and the plain
    // rolling kickup that rides with pace. A sealed road has none of them
    // and answers on its own terms (TARMAC_SMOKE). Particles inherit part
    // of the car's wake plus the wind, so every cloud streams backward and
    // leans downwind.
    const fx = fxScale();
    // ...and the share of it the GROUND is allowed, which the player's DUST
    // row can take to nothing on its own. Everything below that reads this
    // instead of `fx` is a cloud lifted off the stage by a wheel; everything
    // that keeps `fx` is made of the car — the tyre smoke, the shards, the
    // spray, the grit a crash ploughs up.
    const groundFx = dustFx();
    // The trail is a decal and takes no light of its own, so it is handed
    // the same ambient the dust is (snow-marks.ts, `light`).
    marks.light(environment.dustTint());
    // ...and it is laid on the DUST row's say, off `TRAIL_LEFT` rather than
    // the budget above it: what the wheels LEAVE is a mesh built once, not a
    // cloud spawned per frame, and the driven car's is drawn at every stop
    // of the row. `lay` is safe to call on any surface — off snow it only
    // breaks the run so the next mark does not span the gap — so there is
    // no gate here and nothing to take down until the stage changes.
    if (TRAIL_LEFT[live.quality.dust].player) marks.lay(state, drawnGround(state));
    else marks.forget(state);
    // The engine tracks the driven surface — road fords AND the wild's
    // lakes and streams throw the blue spray, and the stage's sealed
    // sections throw nothing at all until the tires start smoking.
    const sealed = state.surface === "asphalt";
    // THE TOWED CLOUD, which is the other half of a loose surface and comes
    // up on its own terms: not thrown by a wheel, so not part of the wheel
    // logic below, and off entirely where the ground has no loose dry dust
    // in it. `plumeDust` is that whole judgement — a sealed road, water, a
    // stage the rain has settled and a grass verge all come back null.
    plume.update(state, dt, groundFx, plumeDust(state));
    // ...and the ground a body that is OVER is ploughing up, which no wheel
    // cloud can throw: they all spawn at an axle, and a car on its roof has
    // its axles in the air. This is the cloud a rollover and a long grind
    // on the shell are mostly MADE of.
    crashGrind_(state, dt);
    // THE ROOSTER TAIL — the stones a slide throws out sideways, off the side
    // the car is going. Its own module (drift-spray.ts) because its throw
    // has a direction none of the wheel logic's grains have, and its own
    // rate: it is a continuous effect written per second, not a burst every
    // few frames. The ground decides what it is made of and how much: a
    // sealed road has no stones to throw, the wild gives up less than a
    // graded road, and a soaked one throws clods where a dry one throws grit.
    gravel.update(
      state,
      dt,
      groundFx,
      sealed
        ? 0
        : (state.surface === "nature" || state.surface === "snowfield" ? WILD_THROW : 1) *
            (live.wetGround ? WET_THROW : 1),
      () => groundDust(state),
    );

    // How hot the tires are, which only tarmac has any use for. A tire
    // cooks while it is sliding and cools the moment it hooks back up, and
    // the soot in its smoke follows it up and down.
    //
    // THREE ways a tire is being dragged rather than rolled, not one. The
    // settled angle is only the last of them: the lever locks the rear
    // wheels outright before the car has taken up any angle at all, and a
    // spun car is dragging all four sideways. Cooking off `drifting` alone
    // left the smokiest moments on tarmac — the whole first half of a
    // handbrake turn, and every spin — coming out white.
    const scrubbing = c.drifting || c.locked || c.spun;
    // A locked or spun tire is fully overwhelmed whatever `slide` reads, so
    // it cooks at the full rate rather than at the slide's fraction.
    const cooking = c.locked || c.spun ? 1 : c.slide;
    mut.rubberHeat = Math.max(
      0,
      Math.min(1, mut.rubberHeat + (sealed && scrubbing ? cooking * SOOT.heat : -SOOT.cool) * dt),
    );
    mut.dustClock += dt;
    // What the wheels throw is two different substances on two different
    // roads — the tyre's own smoke on a sealed one, the stage itself on
    // every other — so the budget over them is whichever belongs to what is
    // being thrown. A player who has asked for no dust still gets smoke off
    // a locked wheel on tarmac: that came out of the tyre, not the ground.
    const wheelFx = sealed ? fx : groundFx;
    if (wheelFx > 0 && !c.airborne && mut.dustClock > (sealed ? TARMAC_SMOKE.every : 0.03)) {
      mut.dustClock = 0;
      // A wet stage throws clods where a dry one throws grit: same wheel
      // logic, same tuning, different matter under it.
      const cloud = sealed ? smoke : live.wetGround ? mud : dust;
      const color = sealed ? sootySmoke(mut.rubberHeat) : groundDust(state);
      // Smoke is boiled off the tire and left behind; grit is thrown by it.
      // So the wake it inherits is gentler, and it spreads instead of arcing.
      const wake = sealed ? 0.12 : 0.35;
      const wakeX = -fwdX * c.u * wake + state.wind.x * 0.6;
      const wakeZ = -fwdZ * c.u * wake + state.wind.z * 0.6;
      // The tires letting go is what throws gravel — `slide` is that
      // number, so the plume comes up the instant the car is asked for more
      // grip than it has, not once the angle has already developed.
      const sideways = c.slide > 0.15 && c.u > 6;
      // Off the line the driven wheels are spinning rather than rolling, so
      // they move far more ground than their road speed says they should.
      // The launch takes the pace scale OVER until the tires hook up (it
      // never lowers it), which keeps the standing start the one moment a
      // slow car is allowed a big cloud.
      const launch = sealed ? 0 : launchThrow(c.u, c.wheelspin);
      // How much ground this wheel is actually moving: pace decides the
      // size of any thrown cloud, and the wild gives up far less of itself
      // than the road does. Neither applies to smoke, which is made of the
      // tire rather than the ground.
      const pace = sealed ? 1 : Math.max(paceScale(c.u), launch);
      const thrown = sealed
        ? 1
        : pace *
          (state.surface === "nature" || state.surface === "snowfield" ? WILD_THROW : 1) *
          (live.wetGround ? WET_THROW : 1);
      const grains = (count: number): number => {
        mut.grainDebt += count * wheelFx * thrown;
        const whole = Math.floor(mut.grainDebt);
        mut.grainDebt -= whole;
        return whole;
      };
      /** How far forward of the car's middle the DRIVEN wheels are — the
       * rear axle on everything but a front-driver, which spins up under
       * its own nose. Only the launch cares: a scrubbing tyre throws
       * whether or not anything is turning it, but a wheel LIT UP off the
       * line is by definition one the engine is driving. */
      const drivenAt = state.spec.drive === "fwd" ? AXLE.front : -AXLE.rear;
      /** One wheel's worth, off `at` metres forward of the middle. `push`
       * is a backward throw of the wheel's own, m/s, for the case where
       * the car is not yet moving fast enough to carry its grains away
       * for it. */
      const wheel = (at: number, side: number, count: number, spread: number, push = 0): void =>
        cloud.spawn(
          c.x + fwdX * at + rightX * side * AXLE.side,
          c.y + AXLE.height,
          c.z + fwdZ * at + rightZ * side * AXLE.side,
          color,
          grains(count),
          spread * pace,
          wakeX - fwdX * push,
          wakeZ - fwdZ * push,
        );
      if (sealed) {
        const T = TARMAC_SMOKE;
        if (c.u < T.launch.speed && c.wheelspin > LAUNCH.from) {
          // Off the line: the driven wheels are ahead of the car, and that
          // is the whole of it — it stops the instant they hook up. How far
          // ahead is how much smoke, so a dropped clutch is a cloud and a
          // clean getaway is a wisp.
          const spun = launchThrow(c.u, c.wheelspin);
          const puffs = T.launch.puffs + Math.round(T.launch.spun * spun);
          wheel(drivenAt, -1, puffs, T.spread);
          wheel(drivenAt, 1, puffs, T.spread);
        } else if (scrubbing) {
          // A readout, never the raw `slide`: `drifting` is the settled
          // ANGLE with hysteresis behind it, so smoke comes up for the drift
          // a player can SEE and not for every corner that leans on the
          // tires — and `locked` and `spun` are the two ways a tire is being
          // dragged before, or long past, any angle worth the name. A
          // sliding tire on tarmac makes a few big puffs where gravel throws
          // grains, and they hang where they were made.
          const puffs = T.drift.puffs + Math.round(cooking * 3);
          wheel(-AXLE.rear, -1, puffs, T.spread);
          wheel(-AXLE.rear, 1, puffs, T.spread);
          // A spin has all four dragged sideways, so the fronts make their
          // own — which is what separates the picture of a spin from the
          // picture of a drift held a beat too long.
          if (c.spun) {
            wheel(AXLE.front, -1, puffs, T.spread);
            wheel(AXLE.front, 1, puffs, T.spread);
          }
        } else if (c.braking && c.u > T.brake.speed) {
          wheel(-AXLE.rear, Math.random() < 0.5 ? -1 : 1, T.brake.puffs, T.spread);
        }
      } else if (sideways || (state.offRoad && c.u > 6)) {
        // The drift plume also blows toward the slide, off the outside
        // wheels, and thickens as the slide deepens. Off-road earns it at
        // the same speed a slide does — a car picking its way back to the
        // track at walking pace is not excavating anything.
        // ...and a SPIN throws far more of it than a drift does, off all
        // four corners rather than the two the drift hangs out. Tarmac has
        // always drawn that distinction (the fronts make their own smoke
        // above); on gravel a car going round backwards at 100 km/h threw
        // exactly what a tidy drift threw, which is the one moment in a run
        // that ought to be unmistakable from any camera.
        const perWheel = Math.round((4 + c.slide * 5) * (c.spun ? CRASH_THROW.spun : 1));
        wheel(-AXLE.rear, -1, perWheel, 3.5);
        wheel(-AXLE.rear, 1, perWheel, 3.5);
        if (c.spun) {
          wheel(AXLE.front, -1, perWheel, 3.5);
          wheel(AXLE.front, 1, perWheel, 3.5);
        }
      } else if (c.braking && c.u > 8) {
        wheel(-AXLE.rear, -1, 4, 2.5);
        wheel(-AXLE.rear, 1, 4, 2.5);
      } else if (launch > 0) {
        // Both driven wheels, digging in and throwing straight back: the
        // plume that says the car LEFT rather than rolled away. Twice the
        // deepest drift's under a fully lit axle, thinning with the
        // wheelspin and gone by 50 km/h, where the rolling kickup below
        // picks the cloud back up. A launch off the limiter holds it up for
        // a second and a half, so the pair of them dig a proper hole rather
        // than flashing once — which is the picture that has to tell the
        // player why the car ahead is pulling away from them.
        const perWheel = 6 + Math.round(launch * 10);
        const push = LAUNCH.push * launch;
        wheel(drivenAt, -1, perWheel, 3, push);
        wheel(drivenAt, 1, perWheel, 3, push);
      } else if (c.u > 15) {
        // Rolling kickup is loose-surface only: a sealed road has nothing
        // lying on it to pick up.
        wheel(-AXLE.rear, Math.random() < 0.5 ? -1 : 1, 2, 1.6);
      }
    }

    // Exhaust: puffs off every tailpipe the car's bodywork has
    // (`pipeAnchors`), thicker the more fuel the engine is drinking, sootier
    // the harder the pedal is asking for it, whiter the colder the air is
    // around it — and handed to the wind the moment they leave the pipe. The
    // rate is shared across the pipes rather than paid per pipe, so a
    // twin-exit car puts up two plumes and the same amount of smoke.
    // A car revving on the grid is drinking plenty and turning none of it
    // into road speed, so it smokes harder than one at pace; a warm car off
    // the throttle puts out gas the air swallows whole, and `pipe.puffs`
    // comes back zero rather than spending the pool on nothing.
    const pipeFx = exhaustFx();
    const blown = c.damage.broken.includes("exhaust");
    const ports = blown ? live.pipeStub : live.pipes;
    const pipe = pipeWork(c, pipeAir(state, c.y), pipeFx, {
      pipes: ports.length,
      vapour: EXHAUST_SEEN[live.quality.exhaust].vapour,
      broken: blown,
    });
    const smoking = pipeFx > 0 && ports.length > 0 && !c.airborne && pipe.puffs > 0;
    // The clock only runs while there is something to make good on. Left
    // running through a warm stage's whole coast it banks seconds, and the
    // first frame back on the pedal pays the burst cap out of the pool in
    // one position — a puff of smoke where the car ISN'T.
    mut.fumeClock = smoking ? mut.fumeClock + dt : 0;
    const bursts = smoking ? pipeBursts(mut.fumeClock, pipe.every) : 0;
    if (bursts > 0) {
      mut.fumeClock -= bursts * pipe.every;
      // Off the car's WHOLE attitude and not just its heading, because the
      // pipe is bolted to the shell: a car on its roof carries its pipes
      // over its own floor, on the mirrored side, aimed at the sky
      // (`car-anchor.ts`). The blast keeps only what the pipe is pointing
      // along the ground — the puff's own buoyancy owns the vertical, and
      // an exhaust cannot push smoke down through the road anyway.
      bodyOffset(PIPE_AXIS, c.heading, c.roll, c.pitch, pipeAxis);
      for (const at of ports) {
        bodyOffset(at, c.heading, c.roll, c.pitch, pipeAt);
        for (let i = 0; i < bursts * pipe.puffs; i++) {
          fumes.spawn(
            c.x + pipeAt.x,
            c.y + pipeAt.y,
            c.z + pipeAt.z,
            pipeAxis.x * pipe.blast + state.wind.x * 0.85,
            pipeAxis.z * pipe.blast + state.wind.z * 0.85,
            pipe,
          );
        }
      }
    }

    // ENGINE SMOKE: the one piece of damage news that is otherwise only a
    // word on the screen. From the moment the engine is called DAMAGED
    // steam comes off the bonnet — pale and thin at first, thicker and
    // darker as the damage climbs, and black once the engine is dead and
    // the car is sitting wherever it stopped. It rises off the bay rather
    // than streaming from a pipe, so a stopped car is wrapped in it.
    //
    // A CLIMBING TEMPERATURE puts the same cloud up without darkening it,
    // which is the honest difference between the two: a holed radiator
    // boils its coolant off as white steam over a motor that is still
    // perfectly good, and a beaten one burns. So the heat drives how much
    // there is and the engine's own damage drives what colour it is —
    // which is also what tells a driver, at a glance, which of the two
    // things is happening to them.
    const hurt = c.damage.systems.engine;
    const smokeFrom = TUNING.collision.callAt.hurt;
    const cool = TUNING.collision.cooling;
    const boil = clamp((c.heat - cool.warnAt) / (cool.redline - cool.warnAt), 0, 1);
    if (fx > 0 && (hurt >= smokeFrom || boil > 0)) {
      const bad = Math.max(0, Math.min(1, (hurt - smokeFrom) / (1 - smokeFrom)));
      const thick = Math.max(bad, boil);
      const every =
        ENGINE_SMOKE.every.first + (ENGINE_SMOKE.every.dead - ENGINE_SMOKE.every.first) * thick;
      mut.smokeClock += dt;
      const puffs = pipeBursts(mut.smokeClock, every / Math.max(0.2, fx));
      if (puffs > 0) {
        mut.smokeClock -= (puffs * every) / Math.max(0.2, fx);
        smokeTint.copy(ENGINE_SMOKE.steam).lerp(ENGINE_SMOKE.soot, bad);
        // The bay travels with the shell the tailpipes do: on a car that has
        // come to rest upside down the engine is under the road-facing
        // floor, not a metre in the air over it.
        bodyOffset(ENGINE_SMOKE.bay, c.heading, c.roll, c.pitch, bayAt);
        // A dead engine burns: three puffs a burst, so the cloud over a car
        // that has stopped for good is a cloud and not a wisp.
        smoke.spawn(
          c.x + bayAt.x,
          c.y + bayAt.y,
          c.z + bayAt.z,
          smokeTint.getHex(),
          puffs * (bad >= 1 ? 3 : 1),
          1.3,
          state.wind.x * 0.5,
          state.wind.z * 0.5,
          ENGINE_SMOKE.rise * (0.4 + 0.6 * thick),
        );
      }
    }

    // A car going down keeps the water working the whole time. While the
    // hull rides the surface it is still displacing — droplets slopping
    // off it as it rocks — and once the roof is under, all that is left is
    // what the body is letting go of, breaking on a surface with nothing
    // visible beneath it. The engine owns the beat (TUNING.crash.drown);
    // this is what it looks like.
    if (fx > 0 && state.drowning) {
      const D = TUNING.crash.drown;
      const surface = state.drowning.waterY;
      const age = state.t - state.drowning.since;
      // The entry is still boiling for the first second or so; by the time
      // the hull has settled the water around it is nearly flat again.
      const working = Math.max(0, 1 - age / D.float);
      const awash = c.y + D.roof > surface;
      mut.drownClock += dt;
      if (mut.drownClock > 0.05) {
        mut.drownClock = 0;
        // Somewhere AROUND the hull, never on top of it. The chase camera
        // sits barely a metre over the waterline while this plays, so
        // anything born at the car's own position drifts straight across
        // the lens as a white wash; a ring keeps the water where the water
        // is, and stops the churn reading as a fountain bolted to the
        // car's middle besides.
        const a = Math.random() * Math.PI * 2;
        const ring = 1.3 + Math.random() * 0.9;
        const rx = c.x + Math.cos(a) * ring;
        const rz = c.z + Math.sin(a) * ring;
        if (awash) {
          spray.spawn(
            rx,
            surface + 0.05,
            rz,
            WATER_DROPS,
            Math.round((3 + 12 * working) * fx),
            1 + 1.8 * working,
          );
        }
        // Bubbles break AT the surface however deep the car is: under a
        // lake nobody can see them leave the body.
        foam.spawn(rx, surface + 0.06, rz, FOAM, Math.round(3 * fx), 0.9);
      }
    }

    carFx.step(dt);
    // An endless run streams its world: the road chunks and terrain tiles
    // ahead get built here, the ones far behind get dropped.
    live.world?.sync(state, dt);
    live.world?.update(state, dt, live.knockPlay ?? undefined);
    // The trees that cast onto the car (flora-shadow.ts). The pool is
    // refilled from the live chunks only when the chunk set has actually
    // changed — `floraCasters()` walks and allocates, and on a finite stage
    // it changes exactly once.
    if (live.world && live.world.floraAge() !== mut.floraAge) {
      mut.floraAge = live.world.floraAge();
      floraShadows.setSources(live.world.floraCasters());
    }
    floraShadows.follow(floraFocus.set(state.car.x, state.car.y, state.car.z), SHADOW_REACH);
    celebration.update(dt);
    live.car?.update(state, dt, chase.camera.position);
    if (live.ghost && live.ghostCar) live.ghostCar.update(live.ghost, dt, chase.camera.position);
    // The entry list, off their own games; off under the map view like the
    // player's own body below.
    // ...and the two budgets they spend: one per cloud, each the effects
    // budget or nothing, because the EXHAUST and DUST rows are both asked
    // about the FIELD separately from the car being driven — the half a
    // struggling machine gives up first, since a rival's plume and a rival's
    // pipe are worth everything to the picture and nothing to the driving
    // (settings.ts).
    field.setClouds(
      live.wetGround,
      EXHAUST_SEEN[live.quality.exhaust].field ? fx : 0,
      EXHAUST_SEEN[live.quality.exhaust].vapour,
      DUST_RAISED[live.quality.dust].field ? fx : 0,
    );
    // ...and whether they MARK the snow, which is the same row and not the
    // same budget (`TRAIL_LEFT`): a rival's ruts are a mesh it builds once,
    // not sprites it spawns, so they survive an EFFECTS budget spent all the
    // way down — a stage where the field is visibly driving through snow and
    // leaving none of it behind was the effects row answering a question it
    // was never asked.
    field.setTrails(TRAIL_LEFT[live.quality.dust].field);
    field.update(state, chase.camera, dt, view !== "map");
    // THE DIP SWITCH. Main beam is for a road with nobody on it: the moment
    // a crew is close enough ahead for the driving lamps to land on them the
    // driver drops to dipped, and the pod bar goes out with them. The field
    // knows where everybody is; the lamps know how far their own beams
    // throw, which is what "close enough" means (car-lamps.ts).
    environment.setCompany(field.nearestAhead());
    // The way home is a DRIVING aid, bolted to the camera. Under the menu's
    // drone, the map view and god mode's free camera there is nobody lost
    // and nobody to point: left running, it would hang a compass needle over
    // the middle of the menu, or over a stage nobody is driving. And there
    // is nobody to point while the water is taking the car either: a compass
    // needle over a sinking wreck is an instruction the player has no way to
    // act on.
    //
    // Stated as "not the views nobody drives from" rather than as a list of
    // the play cameras, because that list grows: naming them is how the
    // arrow quietly stops appearing in the next camera somebody adds.
    //
    // Spectating is the other kind of nobody: the state under the camera is
    // a rival's, so there is a car being driven — just not by the player,
    // and none of the three things this gates is theirs to read.
    const driving =
      view !== "drone" && view !== "map" && view !== "free" && !state.drowning && !live.watched;
    wayHomeArrow.group.visible = driving;
    if (driving) wayHomeArrow.update(state, chase.camera, dt);
    chase.update(state, dt);
    environment.setGrime(live.car?.grime() ?? 0);
    // ...and how much of each end's lighting the crash has left: the lamps
    // break one at a time, so a beam is a SHARE and not a switch — one
    // headlamp gone is half the light down the road for the rest of the
    // stage (car-mesh.ts darkens the lamp itself and snuffs its bloom).
    environment.setLampsBroken(lampShare(state.car, FRONT_LAMPS), lampShare(state.car, REAR_LAMPS));
    // The weather is the environment's, the FX budget is the renderer's.
    environment.setEffects(fx);
    environment.update(state, chase.camera, dt);
    // THE LAMPS THE DUST SEES — the register every cloud in the scene is lit
    // from (dust-light.ts), refilled from scratch each frame. Emptied HERE
    // rather than by whoever writes to it first, because it is one register
    // with several contributors and the order they run in is the renderer's
    // business, not theirs. The player goes on first so a field closing up
    // can never crowd their own tail lamps out of it.
    clearDustLamps();
    environment.lightDust(state.car);
    // ...and the rivals' own, which the LIGHTING row can put away entirely:
    // they are the only light anything but the driven car casts, so this is
    // where "the field lights nothing" is decided rather than left to the
    // register's cap to drop them by luck.
    if (LAMP_BEAMS[live.quality.lighting].field) field.lightDust(environment.lampPower());
    if (fx > 0) {
      // The sky's light moves with the sun, so what the birds and the
      // contrails are lit by is read every frame: a trail at airliner
      // height burns the sunset's orange after the valley has gone grey.
      life.setSky(environment.carTint(), environment.ceiling(), environment.highTint());
      life.update(chase.camera, state.wind.x, state.wind.z, dt, state.terrain.groundAt, state.car);
    }
    life.group.visible = fx > 0;
    // The map framing changes with the stage and the pane, and the fog rides
    // it — see MAP_FOG_NEAR.
    if (live.mapView) {
      applyAspect();
      applyRange();
      // The stage is still growing in behind the map (world.sync), and a
      // slice raised this frame has materials that have never seen the cut.
      clipWorld();
    }
    // The route ribbon is sized to READ at the framing that holds the whole
    // stage, which makes it far wider than the road under it — a deliberate
    // annotation. Leaned in, that annotation becomes a runway painted over
    // the thing being looked at, so it retires once it would cover more of
    // the pane than a line has any business covering, and what is left is
    // the actual road.
    if (live.route) {
      const across = chase.mapPose().across;
      live.route.group.visible =
        view === "map" && (across <= 0 || live.route.width <= across * ROUTE_SHARE);
    }
    // ...and the layers with it: an X-ray of the ground is a thing to read a
    // map by, not something to drive through.
    if (live.layers) live.layers.group.visible = view === "map" && live.layerId !== null;
    // THE CAR IS DRAWN IN EVERY VIEW, the map included — the hood cam because
    // the bonnet under the lens is the whole point of that angle, and the map
    // because its LAMPS were never hidden with it. The environment throws
    // those whatever is drawn, so hiding the body after dark left a pool of
    // headlight travelling along an empty road, which is a stranger thing to
    // see than a small car; and now that the map leans in to a few metres, it
    // also hid the one thing on the stage that is actually moving.
    //
    // ONE BEAT TAKES IT OFF, and it is the beat where there is no such car:
    // spectating hands `render` a rival's game, so the player's body would be
    // drawn wrapped around somebody else's — a second car inside the one the
    // field is already drawing, in the wrong paint. A finished run has
    // nowhere on a rally stage to stand, which is the same rule the field
    // keeps for a crew who is home (`onRoad`).
    mut.glassRain = false;
    if (live.car) {
      const mine = !live.watched;
      live.car.group.visible = mine;
      live.car.debris.visible = mine;
      // Behind the wheel the player is looking at the FIRST-PERSON cabin,
      // not the one authored to be read through glass from a car's length
      // back — the two stand in the same space, so only one of them is ever
      // up. The finish takes the camera out of the car and plants it on the
      // road, so the swap follows the shot rather than the mode.
      const inside = view === "cockpit" && driving;
      live.car.setInside(inside);
      // THE WATER ON THE WINDSCREEN is the driver's alone, and the pass that
      // draws it costs a copy of the whole frame — so it runs only from the
      // seat, only while there is something on the glass, and only on an FX
      // budget that can carry it (`GLASS_RAIN`: a LOW detail machine goes
      // without). The sky is pushed here rather than by the car, which knows
      // nothing about the weather it is being rained on by
      // (car/screen-rain.ts).
      mut.glassRain =
        mine &&
        inside &&
        !live.mapView &&
        GLASS_RAIN[live.quality.effects] &&
        ((live.car.screenRain?.active() ?? false) || (live.car.screenSnow?.active() ?? false));
      if (mut.glassRain) {
        live.car.screenRain?.setSky(environment.carTint(), environment.flash());
        live.car.screenSnow?.setSky(environment.carTint(), environment.flash());
      }
      // From the seat the road behind is read off the mirror hanging in the
      // windscreen, so the strip at the top of the frame stands down and the
      // pane lights up instead. One rear view, in whichever of the two homes
      // the player is actually looking at.
      live.car.setRearView(inside && mut.mirrorUp);
    }
    // The ghost is the one car the hood cam must keep: it is out there on
    // the road being chased, not wrapped around the camera.
    if (live.ghostCar) {
      live.ghostCar.group.visible = view !== "map";
    }
    if (live.ghost && live.ghostTag) {
      const g = live.ghost.car;
      if (live.nameTags && view !== "map") live.ghostTag.place(g.x, g.y, g.z, chase.camera);
      else live.ghostTag.hide();
    }
    // The mirror is bolted to the CAR, so it is aimed from the state rather
    // than from whatever the camera did with it — which is what lets the
    // same strip of glass answer the same question under every view. It
    // hangs on the same rule as the way home above: the views nobody drives
    // from have nothing behind them worth showing, and neither does a run
    // the water has already taken or a car being paraded past the line.
    mut.mirrorUp =
      live.mirrorOption && driving && state.phase !== "finished" && state.phase !== "retired";
    // The cockpit shows the same picture in its own mirror (car/cockpit.ts),
    // so the strip over the frame is not drawn as well.
    mut.mirrorStrip = mut.mirrorUp && view !== "cockpit";
    // ...BUT IT IS ONLY REFILLED ON ITS OWN CLOCK, and how fast that clock
    // runs is what this machine can afford this second (mirror-pace.ts). The
    // pass behind the strip is the whole scene drawn a second time and it is
    // the most expensive thing in a driving frame, so it is the first thing
    // to give way when the frame rate does. The composite over the top still
    // happens every frame, so what the player sees is a continuous strip
    // showing an answer a fraction of a second old.
    //
    // The pace is judged on frames the glass was actually IN. A slow frame
    // with the mirror down says nothing about what the mirror costs, and a
    // ladder that climbed through a menu would arrive at the first corner
    // having proved nothing.
    if (mut.mirrorUp) {
      if (!mut.mirrorWas) mirrorPace.settle();
      mirrorPace.frame(dt);
    }
    mut.mirrorWas = mut.mirrorUp;
    const pace = mirrorPace.tier();
    mut.mirrorRange = pace.range;
    mut.mirrorAge += dt;
    mut.mirrorFill = mut.mirrorUp && mut.mirrorAge >= refillGap(pace.hz);
    if (mut.mirrorFill) mut.mirrorAge = 0;
    // Aimed on the frames it is filled on, and only those: pointing a camera
    // nothing is about to render through is arithmetic for nobody.
    if (mut.mirrorFill) {
      const mount = live.car?.mirrorMount ?? fallbackMount(live.driverEyeY);
      mirror.aim(
        state,
        mount,
        live.car?.mirrorFrame ?? null,
        environment.fogFar() * mut.mirrorRange,
      );
    }
    // The road and its scenery are built for the WHOLE stage; the frame
    // only pays for the part the air is still clear enough to show. Last,
    // because the map view sets its fog from the framing it just solved —
    // culling ahead of that would measure the stage against a driving fog
    // and blank the entire map for the frame the view opens on.
    live.world?.cull(chase.camera, environment.fogFar(), mut.mirrorUp ? mirror.camera : null);
    drawScene();
  };

  /** The box the buffer was last cut to, in CSS pixels — three's own answer,
   * asked for rather than remembered so nothing can be remembered wrong. */
  const cut = new THREE.Vector2();

  /** Cut the drawing buffer to a canvas box `w`x`h` CSS pixels, and re-frame
   * the camera on it — but only when it is not already that. The buffer is
   * checked in DEVICE pixels too: a canvas whose backing store was resized
   * out from under the page (a mobile browser reclaiming it while the app was
   * away) still reads back the size three last asked for, and the pixels are
   * the only place that shows. */
  const syncSize = (w: number, h: number): void => {
    const ratio = renderer.getPixelRatio();
    renderer.getSize(cut);
    const sameBox = cut.x === w && cut.y === h;
    const sameBuffer =
      canvas.width === Math.floor(w * ratio) && canvas.height === Math.floor(h * ratio);
    if (sameBox && sameBuffer) return;
    // The desktop row names a HEIGHT, so the share it works out to is a
    // property of the box about to be cut — re-derived here rather than left
    // at whatever the last window size made it.
    applyResolution(h);
    renderer.setSize(w, h, false);
    applyAspect();
  };

  /** One frame, into the whole canvas or into the map pane. Scissoring the
   * pane leaves the rest of the canvas painted flat sky, which is what the
   * Roam page's cards sit on. */
  const drawScene = (): void => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    // The viewport below is measured fresh every frame; the BUFFER it lands
    // in is cut once per resize. Let those two drift apart and the frame is
    // drawn into a corner of a canvas that is a different size — the game in
    // a band down one side, flat page colour through the rest of it, which is
    // exactly what an iOS PWA does on the way back from the background: it
    // comes back to a box it never announced with a `resize` event, so
    // nothing re-cuts the buffer and only a rotation (which does announce
    // itself) puts it right. So the frame checks its own canvas instead of
    // trusting the last event: same measurement for both, every frame, or
    // the size is re-applied here before anything is drawn.
    syncSize(w, h);
    if (!live.mapView || !live.mapRect) {
      // THE REAR VIEW IS DRAWN FIRST, because one of its two homes is inside
      // the frame rather than over it: the cockpit's mirror is geometry, and
      // geometry samples a texture that has to already exist. The strip over
      // the top of the screen does not care either way.
      if (mut.mirrorFill) {
        // The way home is parented to the FORWARD camera, so in the mirror
        // pass it would hang in mid-air beside the car with its needle
        // pointing at nothing. Nothing else in the scene is camera-bound.
        const arrow = wayHomeArrow.group.visible;
        wayHomeArrow.group.visible = false;
        // The air comes in with the far plane, so the world leaves the
        // mirror's frustum where it had already gone solid — see withHaze.
        // The car settles which of its cabins the lens looks back through
        // (`mirrorPass`), whatever view the player is in.
        const fill = (): void =>
          environment.withHaze(mut.mirrorRange, () => mirror.fill(renderer, scene, w, h));
        if (live.car) live.car.mirrorPass(fill);
        else fill();
        wayHomeArrow.group.visible = arrow;
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      // THE TV CAM'S LENS, and the only place the world is not drawn straight
      // to the canvas. It is stood up on the first frame a TRIPOD has and
      // given back the moment one does not, so every other view costs nothing
      // — not the pass, not the target (`camera-tv-lens.ts`). The TV mode
      // spends most of a stage on the chase boom, which has no focal plane
      // worth solving, so the switch is `tvTrackside` and not the mode.
      const bokeh = chase.tvTrackside() && TV_BOKEH[live.quality.effects];
      if (bokeh) {
        mut.tvLens ??= createTvLens();
        mut.tvLens.draw(renderer, scene, chase.camera, chase.tvFocus(), w, h);
      } else {
        mut.tvLens?.dispose();
        mut.tvLens = null;
        renderer.render(scene, chase.camera);
      }
      // THE RAIN ON THE GLASS GOES ON AFTER THE WORLD, because every drop on
      // it is a lens showing the world BENT — so the world has to have been
      // drawn before there is anything to bend. It reads the frame that is
      // now in the buffer, and lays the water over it with the same depth
      // the scene pass left, so the wiper still passes in front of the
      // drops it is clearing (car/screen-rain.ts).
      if (mut.glassRain) {
        live.car?.screenSnow?.draw(renderer, chase.camera);
        live.car?.screenRain?.draw(renderer, chase.camera);
      }
      if (mut.mirrorStrip) mirror.composite(renderer, w, h);
      return;
    }
    // Clear the whole canvas first, then draw only inside the pane. WebGL's
    // origin is the BOTTOM-left; the rect arrives measured from the top.
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    renderer.clear();
    const y = h - live.mapRect.y - live.mapRect.height;
    renderer.setViewport(live.mapRect.x, y, live.mapRect.width, live.mapRect.height);
    renderer.setScissor(live.mapRect.x, y, live.mapRect.width, live.mapRect.height);
    renderer.setScissorTest(true);
    renderer.render(scene, chase.camera);
    renderer.setScissorTest(false);
  };

  const resize = (): void => {
    syncSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  };

  /** COMPILE EVERY SHADER THE STAGE IS ABOUT TO NEED, before a frame of it is
   * asked for. A three.js material is compiled the first time something
   * wearing it is drawn, so a stage's programs would otherwise arrive during
   * the establishing shot and the first corners — a dozen stalls of tens of
   * milliseconds each, spread through exactly the part of a run a player is
   * building their first impression of. Behind the loading card it is one
   * cost, paid once, where there is nothing to stutter.
   *
   * It compiles what is IN the scene, so it belongs after the world, the car
   * and the field are built and after `setConditions` has put the stage's own
   * light on them — which is where `race-loader.ts` calls it. */
  const warm = (): void => {
    if (!live.game) return;
    // Programs first: this walks the scene and links one for every material
    // in it, which is the half `compile` is for.
    renderer.compile(scene, chase.camera);
    // ...and then a WHOLE FRAME, thrown away, which is the half that actually
    // costs the time. Linking a program is not compiling it: WebGL drivers
    // defer the real work — the shader compile, the texture upload, the
    // buffer upload — until something is first DRAWN with it. Measured on
    // this stage, `compile` alone took sixteen milliseconds and the first
    // frame after it took three and a half seconds, which is precisely the
    // stall this is meant to be spending on the player's behalf.
    //
    // It is the renderer's own frame rather than a bare `render(scene, cam)`
    // so that every pass a real frame has is warmed with it: the mirror's own
    // target, the screen effects, the sky. Nothing moves — a zero-length
    // frame advances no clock — and it is drawn behind the loading card, so
    // the picture it puts on the canvas is one nobody sees.
    render(live.game, 0);
  };

  /** Who to tell when the GPU takes the context away or gives it back. */
  let contextWatcher: ((lost: boolean) => void) | null = null;
  const gpu = watchGpuContext(canvas, {
    onLost: () => contextWatcher?.(true),
    onRestored: () => {
      // The buffer that comes back is a new one and the canvas may have been
      // resized while the page was away, so it is cut before the first frame
      // is allowed to draw into it.
      resize();
      contextWatcher?.(false);
    },
  });

  const dispose = (): void => {
    gpu.dispose();
    marks.dispose();
    live.world?.dispose();
    live.route?.dispose();
    live.layers?.dispose();
    live.car?.dispose();
    live.ghostCar?.dispose();
    live.ghostTag?.dispose();
    field.dispose();
    carFx.dispose();
    wayHomeArrow.dispose();
    mirror.dispose();
    environment.dispose();
    renderer.dispose();
  };

  resize();
  /** Whether the frames are being counted (`meterFrames`). Off by default:
   * the walk below is the sort of thing that must not run in a frame nobody
   * asked to measure. */
  let metering = false;

  const meterFrames = (on: boolean): void => {
    metering = on;
    // Three clears its render counters on every `render()`; a frame here is
    // several. Off, and `render` owns the reset (at the top of the frame);
    // back on, and three goes back to doing it itself.
    renderer.info.autoReset = !on;
    if (!on) renderer.info.reset();
  };

  /** THE SCENE, WALKED, and bucketed by what it belongs to. The bucket is
   * the nearest NAMED ancestor, which is why the groups this adds to the
   * scene carry names: without one an object would be reported against the
   * scene itself and the breakdown would be a single row saying "all of it".
   *
   * Only what would actually be DRAWN: an invisible object, and everything
   * under it, is skipped exactly as three's own traversal skips it — a
   * breakdown that counted the map's pane while the map was shut would send
   * somebody optimising a thing that was never submitted. */
  const sceneTally = (): SceneShare[] => {
    const buckets = new Map<string, SceneShare>();
    const walk = (object: THREE.Object3D, under: string): void => {
      if (!object.visible) return;
      const name = object.name !== "" ? object.name : under;
      const geometry = (object as Partial<THREE.Mesh>).geometry;
      if (geometry !== undefined) {
        const share = buckets.get(name) ?? { name, objects: 0, triangles: 0 };
        share.objects += 1;
        const index = geometry.getIndex();
        const position = geometry.getAttribute("position");
        const verts = index ? index.count : (position?.count ?? 0);
        const instances = (object as Partial<THREE.InstancedMesh>).count ?? 1;
        share.triangles += (verts / 3) * instances;
        buckets.set(name, share);
      }
      for (const child of object.children) walk(child, name);
    };
    walk(scene, "scene");
    return [...buckets.values()];
  };

  const meter = (): FrameCost => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    programs: renderer.info.programs?.length ?? 0,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  });

  return {
    render,
    resize,
    warm,
    dispose,
    meter,
    meterFrames,
    sceneTally,
    /** Who to tell when the GPU takes the context away or gives it back. */
    onContext: (fn: (lost: boolean) => void): void => {
      contextWatcher = fn;
    },
  };
}

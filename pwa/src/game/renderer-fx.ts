// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ENGINE'S EVENTS, TURNED INTO THINGS YOU SEE. A step of the engine
// hands back what happened — a wheel dropped a stone, a landing slammed,
// glass broke, a wing came off, the car went into the water — and this is
// where each of those becomes dust, a splash, a burst of shards, a piece of
// body tumbling away. Nothing here decides anything about the run; it is
// the one place the game's events are read.

import { isWooden, rollTilt, type GameEvent, type GameState } from "@engine";

import { AXLE } from "./dust.ts";
import { groundTints } from "./ground-tint.ts";
import { CRASH_THROW, crashContact, crashBurst as burstCount, crashGrind } from "./crash-throw.ts";
import { classify } from "./standings.ts";
import {
  FOAM,
  GLASS_AT,
  GLASS_BURST,
  GLASS_SHARDS,
  SLAM_FLOOR,
  SLAM_FULL,
  SPLASH_FULL,
  SPLINTERS,
  WATER_DROPS,
} from "./renderer-face.ts";
import type { RenderScene } from "./renderer-scene.ts";

export function createEventFx(parts: RenderScene) {
  const { live, carFx } = parts;
  const { groundDust, fxScale } = parts;
  const { fitCar, chase, DOWN } = parts;
  const { dust, crash, mud, spray, foam, celebration } = carFx;
  const { atWheels, showCrash } = carFx;

  /** THE GROUND A BODY THAT IS OVER IS PLOUGHING, thrown from the corner of
   * the shell that is actually down.
   *
   * Everything else that moves ground on a stage is a tyre and spawns at an
   * axle. A car past its outside wheels has no tyre on the ground — it has
   * one corner of itself, somewhere round the hull depending on how far
   * over it is (`crashContact`) — and that corner is doing all of the work.
   *
   * `grains` and `puffs` are whole particles the caller has already worked
   * out; this only decides WHERE they leave from and HOW. The grit is flung
   * back along the travel and up, because it was thrown; the smoke is left
   * where it was made and drifts, because it was only disturbed. */
  const throwFromShell = (state: GameState, grains: number, puffs: number): void => {
    if (grains <= 0 && puffs <= 0) return;
    // The pool is parked between crashes — the biggest one in the game, for
    // an effect most runs never see — so say it is being used before using
    // it, or the grains are written into a cloud nothing draws.
    showCrash();
    const c = state.car;
    const at = crashContact(rollTilt(c.roll));
    const rightX = Math.cos(c.heading);
    const rightZ = -Math.sin(c.heading);
    const x = c.x + rightX * at.across;
    const z = c.z + rightZ * at.across;
    // Just clear of the ground the corner is in, so the cloud comes off the
    // contact rather than out of it.
    const y = c.y + at.up + 0.15;
    const K = CRASH_THROW;
    const wind = state.wind;
    if (grains > 0) {
      crash.spawn(
        x,
        y,
        z,
        groundDust(state),
        grains,
        K.spread,
        -c.u * Math.sin(c.heading) * K.kick + wind.x * 0.4,
        -c.u * Math.cos(c.heading) * K.kick + wind.z * 0.4,
        K.lift,
      );
    }
    if (puffs > 0) {
      // The HANGING half of the same cloud, and it is the same SUBSTANCE:
      // ground-coloured grit thrown slower, higher and wider, so it is left
      // behind where the grains are flung ahead. Not the tyre-smoke pool —
      // that one is big soft growing billboards tuned for rubber cooking on
      // tarmac, and a handful of them over a rolling car reads as a pale
      // wedge hanging in the air rather than as anything the car did. The
      // world is chunky and vertex-coloured; its dust has to be too.
      crash.spawn(
        x,
        y + 0.2,
        z,
        groundDust(state),
        puffs,
        K.smokeSpread,
        -c.u * Math.sin(c.heading) * K.smokeKick + wind.x * 0.8,
        -c.u * Math.cos(c.heading) * K.smokeKick + wind.z * 0.8,
        K.smokeLift,
      );
    }
  };

  /** One CONTACT of a body that is over: a corner of the shell arriving. */
  const crashBurst = (state: GameState, took: number): void => {
    const burst = burstCount(took);
    const fx = fxScale();
    throwFromShell(state, Math.round(burst.grains * fx), Math.round(burst.puffs * fx));
  };

  /** ...and the GRIND between them, as a rate with its fraction carried:
   * a cloud's density is a rate per second, and an emitter that rounds per
   * frame makes its density the frame rate instead. */
  let grindGrains = 0;
  let grindPuffs = 0;
  const crashGrind_ = (state: GameState, dt: number): void => {
    const c = state.car;
    if (!c.rolling || c.airborne) {
      // Nothing owed while the body is in the air between its contacts —
      // and the debt is dropped rather than banked, so a long flight does
      // not land as one enormous puff.
      grindGrains = 0;
      grindPuffs = 0;
      return;
    }
    const fx = fxScale();
    const rate = crashGrind(Math.hypot(c.u, c.w));
    grindGrains += rate.grains * dt * fx;
    grindPuffs += rate.puffs * dt * fx;
    const grains = Math.floor(grindGrains);
    const puffs = Math.floor(grindPuffs);
    grindGrains -= grains;
    grindPuffs -= puffs;
    throwFromShell(state, grains, puffs);
  };
  const onEvents = (state: GameState, events: GameEvent[]): void => {
    const c = state.car;
    const fx = fxScale();
    for (const ev of events) {
      if (ev.type === "landing") {
        // HOW HARD, not how long: the descent the springs just swallowed is
        // what the car felt, and it is the only number that tells a hop off
        // a kerb from a moon shot. Air time cannot — a long floaty flight
        // onto ground running away underneath it arrives softer than a
        // short one off a steep lip. The floor under it is the weight of
        // the car: nothing about a landing is ever free.
        const slam = SLAM_FLOOR + (1 - SLAM_FLOOR) * Math.min(1, Math.abs(ev.slam) / SLAM_FULL);
        // Straight down: the wheels stop falling and the driver's head does
        // not, which is the whole of what a landing feels like from inside.
        chase.kick((ev.clean ? 0.34 : 0.62) * slam, DOWN, "landing");
        if (c.rolling) {
          // ...unless the car is OVER, in which case there are no tyres:
          // there is a corner of the shell ploughing into the ground, and
          // the burst belongs where that corner is. `atWheels` would put it
          // at four points a metre and a half in the air.
          crashBurst(state, ev.took);
        } else {
          // Four tyres hitting the ground at once, and each of them throws.
          atWheels(
            live.wetGround ? mud : dust,
            state,
            groundDust(state),
            Math.round((ev.clean ? 18 : 32) * slam * fx),
            3.5,
          );
        }
      } else if (ev.type === "splash") {
        // How much water the car moved. A ford taken at pace throws a
        // sheet off the nose; a car going into a lake throws a COLUMN, and
        // since that one is the last thing the run does it gets the frame:
        // several times the droplets, thrown wider and harder, with froth
        // left working on the surface behind it.
        const force = Math.min(1, ev.speed / SPLASH_FULL);
        const surface = (state.drowning?.waterY ?? c.y) + 0.1;
        // The nose is what displaces the water, so the column comes up in
        // front of the car and carries part of its way in with it.
        const nose = c.heading;
        const reach = ev.deep ? 1.4 : 1;
        chase.kick(
          ev.deep ? 0.45 + 0.25 * force : 0.2 + 0.2 * force,
          { x: Math.sin(nose), y: -0.4, z: Math.cos(nose) },
          "water",
        );
        spray.spawn(
          c.x + Math.sin(nose) * reach,
          surface,
          c.z + Math.cos(nose) * reach,
          WATER_DROPS,
          Math.round((ev.deep ? 140 + 180 * force : 24 + 46 * force) * fx),
          (ev.deep ? 4.5 : 3) + 3 * force,
          Math.sin(nose) * ev.speed * 0.25,
          Math.cos(nose) * ev.speed * 0.25,
        );
        foam.spawn(
          c.x,
          surface,
          c.z,
          FOAM,
          Math.round((ev.deep ? 26 : 8) * fx),
          ev.deep ? 2.6 : 1.6,
        );
      } else if (ev.type === "sink") {
        // The water closing over the roof: the column is long gone, and
        // what is left is the hole in the surface filling itself in.
        const surface = (state.drowning?.waterY ?? c.y) + 0.06;
        chase.kick(0.18, undefined, "water");
        spray.spawn(c.x, surface, c.z, WATER_DROPS, Math.round(46 * fx), 2.2);
        foam.spawn(c.x, surface, c.z, FOAM, Math.round(30 * fx), 2.4);
      } else if (ev.type === "takeoff") {
        // The scuff the wheels leave on the lip on their way off it.
        atWheels(live.wetGround ? mud : dust, state, groundDust(state), 10 * fx, 3);
      } else if (ev.type === "finish") {
        // R25 — the salute, sized by where the time placed. Fourth and
        // worse fire nothing, and `fire` knows it.
        celebration.fire(
          live.standing ?? classify(state.track, ev.time).place,
          live.world?.muzzles() ?? [],
        );
      } else if (ev.type === "kerbHit") {
        // R26 — a block on the inside of an apex. Nothing folds and nothing
        // breaks, so there is no burst and no shake: what there IS, from
        // inside, is the car being thrown off its line, and the head going
        // with it a beat late. From outside there is the car climbing the
        // block and rolling onto the springs it just loaded, and the shot
        // holds still and lets it.
        chase.kick(
          Math.min(0.22, 0.06 + ev.speed * 0.004),
          { x: Math.cos(c.heading), y: 0.5, z: -Math.sin(c.heading) },
          "contact",
        );
      } else if (ev.type === "respawn") {
        // THE CREW PUT BACK AT THE LAST BOARD. The car is somewhere else on
        // the road and pointing down the stage again, and every reading the
        // shot is holding belongs to where it was — so the rig is stood
        // around it rather than flown across the gap, and the blow is the
        // whole of what the player is shown moving.
        chase.replant();
        chase.kick(0.3, undefined, "reset");
      } else if (ev.type === "repair") {
        // THE CAR HANDED BACK WHOLE (step.ts). The body wears its damage in
        // its own geometry — a torn-off door is a mesh lying down the road,
        // a shattered pane is a slice of the glass buffer at alpha zero, a
        // lost wheel is a hub, and the run's dirt is baked into the paint —
        // and none of that is re-derived from the ledger each frame. So a
        // healed LEDGER on this body would read as a schematic saying the
        // car is fine over a wreck that still looks like one. The honest
        // answer is the one the menu gives when a different car is picked:
        // build the car again.
        fitCar(state);
      } else if (ev.type === "solidBreak") {
        // Something came out of the landscape. The engine has already taken
        // it out of the field and worked out where the piece is going; the
        // world stops drawing it standing and throws it, and the burst here
        // is the splinters and grit that went with it.
        live.world?.fell(ev.solid, ev.vx, ev.vy, ev.vz);
        const wooden = isWooden(ev.solid.kind);
        dust.spawn(
          ev.solid.x,
          ev.solid.y + ev.solid.height * 0.3,
          ev.solid.z,
          wooden ? SPLINTERS : groundTints(state.track.knobs.biome).stone,
          Math.round((ev.broke ? 26 : 14) * fx),
          3.5,
        );
      } else if (ev.type === "partBreak") {
        // The GLASS does not fly, it goes everywhere: a burst of pale
        // shards out of the frame that lost it. For every window but the
        // laminated screen that burst is the WHOLE of it (car-damage.ts) —
        // tempered glass dices, and there is no sheet left to throw.
        //
        // How much of it, and how far it opens, is how hard the pane was
        // let go of (`partBreak.shed`, m/s): a window popping out of its
        // seal drops a handful of gravel down the door, and one let go by a
        // car that came down on it throws a windowful across the road. Both
        // ends are bounded, because a burst that scales without a ceiling
        // empties the pool the wheels and the crash are sharing.
        const glass = GLASS_AT[ev.part];
        const sinH = Math.sin(c.heading);
        const cosH = Math.cos(c.heading);
        if (glass) {
          const hard = Math.min(1, ev.shed / GLASS_BURST.shedFull);
          carFx.showGlass();
          carFx.glass.spawn(
            c.x + sinH * glass.fwd + cosH * glass.side,
            c.y + glass.up,
            c.z + cosH * glass.fwd - sinH * glass.side,
            GLASS_SHARDS,
            Math.round((GLASS_BURST.grains + GLASS_BURST.moreGrains * hard) * fx),
            GLASS_BURST.spread + GLASS_BURST.moreSpread * hard,
          );
        } else if (ev.part.startsWith("wheel")) {
          const front = ev.part === "wheelFL" || ev.part === "wheelFR";
          const side = ev.part === "wheelFR" || ev.part === "wheelRR" ? 1 : -1;
          const along = front ? AXLE.front : -AXLE.rear;
          (live.wetGround ? mud : dust).spawn(
            c.x + sinH * along + cosH * side * AXLE.side,
            c.y + AXLE.height,
            c.z + cosH * along - sinH * side * AXLE.side,
            groundDust(state),
            Math.round(28 * fx),
            4,
          );
        }
      } else if (ev.type === "impact") {
        // The hit lands where the engine says it did: a debris-grey burst
        // at that point on the body, and — from inside the car — the
        // driver's head thrown at the part of the body that took it. A shunt
        // on the nose throws the head forward, one on the left throws it
        // left, and a belly slam throws it down, because the car stopped and
        // the driver did not. From outside the shot does not move at all:
        // the car crushing, dipping and rocking on its springs IS the hit,
        // and a camera that jumps with it hides the one thing worth seeing.
        const a = c.heading + ev.angle;
        chase.kick(
          Math.min(0.9, 0.25 + ev.speed * 0.02),
          ev.belly ? DOWN : { x: Math.sin(a), y: 0.15, z: Math.cos(a) },
          "contact",
        );
        const reach = ev.belly ? 0 : 1.6;
        dust.spawn(
          c.x + Math.sin(a) * reach,
          c.y + (ev.belly ? 0.1 : 0.5),
          c.z + Math.cos(a) * reach,
          0x8a8578,
          Math.round(Math.min(30, 8 + ev.speed) * fx),
          3.5,
        );
      }
    }
    live.car?.onEvents(state, events);
  };

  const onGhostEvents = (state: GameState, events: GameEvent[]): void => {
    live.ghostCar?.onEvents(state, events);
  };

  return { onEvents, onGhostEvents, crashGrind_ };
}

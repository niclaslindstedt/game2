// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Exhaust fumes: a pooled puff cloud off the tailpipe. Puffs inherit a
// little of the car's wake, then the WIND owns them — idling fumes drift
// downwind, a storm rips them sideways. Same recycled-in-place Points
// architecture as dust.ts; presentation only.
//
// TWO CLOUDS COME OUT OF HERE and they are pooled differently. The player's
// car has one to itself (car-fx.ts), sized for the hardest one pipe ever
// works. The FIELD shares a second between every crew on the road
// (field-cars.ts) — a grid of eight cars blipping is eight pipes at once,
// and eight private pools would be eight draw calls for a cloud that reads
// as one. `pipeWork` below is what keeps them telling the same story: how
// hard a pipe is working is a function of the engine, not of whose car it
// is bolted to.

import * as THREE from "three";
import type { GameState } from "@engine";

import { puffTexture } from "./textures.ts";

/** Big enough to hold a full second of the hardest the pipe ever works —
 * the grid's redline burst — without recycling a puff that is still on
 * screen, which would show up as the cloud tearing holes in itself at
 * exactly the moment it is thickest. */
const POOL = 384;

/**
 * WHAT THE PIPE DOES WITH THE THROTTLE. Fuel burned is fumes made, so the
 * exhaust answers the ENGINE and not the speedometer — which is why the
 * grid, where the car is going nowhere at all, is not the quietest place on
 * the stage.
 */
export const EXHAUST = {
  /** Seconds between puffs: sitting at idle, and rolling. */
  every: { idle: 0.12, rolling: 0.045 },
  /** How sooty the cloud is, 0 pale .. 1 black. `base` is a cold idle,
   * darkening by `pace` as road speed comes up to `paceAt` m/s. */
  shade: { base: 0.35, pace: 0.4, paceAt: 30 },
  /** REVVING ON THE GRID: the throttle blipped against a car that cannot
   * move. None of the fuel it drinks becomes road speed, so all of it
   * leaves through the pipe — the one moment the exhaust is the loudest
   * thing on screen. Below `from` on the rev counter the engine is merely
   * idling and none of this applies; at the redline the puffs come `every`
   * seconds, `puffs` at a time so a blip reads as a BURST rather than a
   * tick, at `shade` soot. `blast` is what pushes
   * them out of the pipe, m/s, in place of a car pulling away from them:
   * gentle, because a stationary car's cloud has to BILLOW and hang around
   * the back of it — anything jetted hard streams straight past the chase
   * camera and leaves the start line looking clean. */
  rev: { from: 0.12, every: 0.016, puffs: 4, shade: 0.85, blast: 1.4 },
};

/** WHERE THE PIPE IS, in metres off the car's own axes: back from the
 * centre, out to one side, and up off the road. One statement of it, because
 * a rival's exhaust leaving from somewhere its own bodywork is not would be
 * visible on any car the player sits behind. */
export const PIPE = { back: 1.9, side: 0.35, up: 0.32 } as const;

/** How hard a pipe is working this instant. */
export type PipeWork = {
  /** Seconds between bursts. */
  every: number;
  /** Puffs in one of them — a blip has to read as a BURST rather than a
   * tick, so a worked engine spends its fuel on several at once. */
  puffs: number;
  /** Soot, 0 pale .. 1 black. */
  shade: number;
  /** What pushes them out of the pipe, m/s, on top of the wake. */
  blast: number;
};

/** Read the pipe off the engine. `rev` is the rev counter and `u` the road
 * speed, and the PHASE is what says which of the two the revs mean: in the
 * start control nothing is geared and `rev` is the pedal itself, so none of
 * the fuel it drinks becomes road speed and all of it leaves through the
 * pipe. Everywhere else `rev` is gearing plus speed, and a car at pace
 * smokes less than one going nowhere loudly.
 *
 * `fx` is the transient-FX budget and `thickness` is how much of a pipe this
 * car gets: 1 for the car being driven, less for a rival, which is the same
 * bargain the field's dust makes (`FIELD_PLUME`). A cloud seen across a
 * start line does not need the density of the one coming off your own
 * bumper, and eight of them at full rate would spend the shared pool in a
 * third of a second. */
export function pipeWork(
  rev: number,
  u: number,
  phase: GameState["phase"],
  fx: number,
  thickness = 1,
): PipeWork {
  const X = EXHAUST;
  const blipping = phase === "intro" || phase === "countdown";
  const worked = blipping ? Math.max(0, (rev - X.rev.from) / (1 - X.rev.from)) : 0;
  const idling = u > 1 ? X.every.rolling : X.every.idle;
  const rolling = X.shade.base + X.shade.pace * Math.min(1, u / X.shade.paceAt);
  return {
    every: (idling + (X.rev.every - idling) * worked) / (Math.max(0.2, fx) * thickness),
    puffs: 1 + Math.round((X.rev.puffs - 1) * worked * thickness),
    shade: rolling + (X.rev.shade - rolling) * worked,
    blast: u * 0.15 + X.rev.blast * worked,
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

export type Fumes = {
  points: THREE.Points;
  /** One puff at the pipe. `vx`/`vz` seed the base velocity (wake + wind);
   * `shade` 0–1 picks idle-pale → redline-dark soot. */
  spawn: (x: number, y: number, z: number, vx: number, vz: number, shade: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

/** A cloud. `pool` is how many puffs it may have alive at once — the default
 * is one pipe's worth; a cloud several cars are feeding needs its own
 * number, because the puffs come out of one ring and a pool spent faster
 * than it ages recycles a puff that is still on screen. */
export function createFumes(pool: number = POOL): Fumes {
  const positions = new Float32Array(pool * 3);
  const colors = new Float32Array(pool * 3);
  const velocities = new Float32Array(pool * 3);
  const life = new Float32Array(pool);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // Exhaust is SMOKE, not grit, so it takes the same answer tire smoke does
  // to the low chase cam: a puff big enough to read gets a lumpy MASK
  // (textures.ts) rather than being shrunk into a speck. Shrinking is what
  // grains want; a smoke sprite made small enough not to look like a square
  // just stops looking like smoke, and a whole pipe's worth of them
  // disappears against the road.
  const map = puffTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.55,
    map,
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const pale = new THREE.Color(0x9aa0a8);
  const soot = new THREE.Color(0x3c4046);
  const tint = new THREE.Color();

  const spawn = (x: number, y: number, z: number, vx: number, vz: number, shade: number): void => {
    const i = cursor;
    cursor = (cursor + 1) % pool;
    positions[i * 3] = x + (Math.random() - 0.5) * 0.2;
    positions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.15;
    positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
    // A wide scatter, so a burst of puffs made in the same millisecond at
    // the same pipe FANS rather than travelling out as one rope.
    velocities[i * 3] = vx + (Math.random() - 0.5) * 0.9;
    velocities[i * 3 + 1] = 0.6 + Math.random() * 0.6; // warm smoke rises
    velocities[i * 3 + 2] = vz + (Math.random() - 0.5) * 0.9;
    tint.copy(pale).lerp(soot, shade);
    const v = 0.85 + Math.random() * 0.3;
    colors[i * 3] = tint.r * v;
    colors[i * 3 + 1] = tint.g * v;
    colors[i * 3 + 2] = tint.b * v;
    life[i] = 0.8 + Math.random() * 0.6;
  };

  const update = (dt: number): void => {
    for (let i = 0; i < pool; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      // No gravity — smoke hangs, slows its rise, and rides whatever wind
      // was baked into its spawn velocity.
      velocities[i * 3 + 1] = Math.max(0.15, velocities[i * 3 + 1] - 0.5 * dt);
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      if (life[i] <= 0) positions[i * 3 + 1] = -50;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
  };

  for (let i = 0; i < pool; i++) positions[i * 3 + 1] = -50;
  return { points, spawn, update, dispose };
}

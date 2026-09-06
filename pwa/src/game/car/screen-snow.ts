// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SNOW ON THE WINDSCREEN, from the driver's own seat — the flakes that land
// on the glass under a snowfall (environment.ts says how many, climate.ts
// says whether they are flakes at all), and what becomes of them.
//
// What a real screen does, and what this one is held to:
//
//   IT STARTS SNOWY. A cold screen — the first minute of a run, the heater
//   not yet through — holds every flake that lands on it as a white speck:
//   an irregular blob two to eight millimetres across, opaque, brighter
//   than anything behind it. At speed the glass is SWEPT through the fall,
//   so it fills far faster than it would parked; a blizzard cakes it.
//
//   THEN IT MELTS. The cabin warms the glass from behind (`WARM`), and a
//   warm screen melts a flake within a second or two of it landing: the
//   speck goes translucent and grey, shrinks, and is water — which is the
//   rain pane's business (screen-rain.ts): the meltwater is handed over as
//   wetness, so a snowy drive ends up with a screen that is merely wet,
//   with runs and beads and the wipers on. How much heat it takes is the
//   outside air's call: at minus fifteen the corners stay caked however
//   long the heater runs.
//
//   THE WIPERS CLEAR IT, in their arc — and pile what they clear at the arc's
//   rim, where a bank of packed snow builds that no blade reaches. Below
//   the sweep the flakes bank up along the sill, which is where a screen
//   in falling snow goes white first.
//
// Its own pane over the front glass, in a pass of its own after the frame
// (like the rain's, and drawn just before it, so the water lies over the
// flakes). No refraction: a flake is a white body, not a lens, so it needs
// no copy of the frame — only the scene's depth, so the pillars and the
// blade stay in front of it.

import * as THREE from "three";
import { GRID, paneMesh } from "./screen-rain.ts";
import { GLASS_LIFT, screenPanes } from "./greenhouse.ts";
import type { CarBodySpec } from "./spec.ts";
import type { WipeState } from "./wipers.ts";

/** Lifted off the glass under the rain pane, so the water draws over it. */
const SNOW_LIFT = GLASS_LIFT + 0.004;

/** How fast the glass fills, per second of a full snowfall at a standstill,
 * and how much faster at `full` m/s — the screen is swept through the
 * fall, so a moving car catches many times what a parked one does. */
const CATCH = { still: 0.06, full: 0.55, at: 30 };
/** How the cabin warms the glass: the time constant, s, of the heater
 * getting through — a couple of minutes to most of the way. */
const WARM = 75;
/** How fast a warm screen melts what is on it, per second, and the
 * trickle a cold one loses to the air anyway. `thawAt` is the outside
 * temperature by which the heater wins outright; at `frozenAt` and under
 * it barely helps. */
const MELT = { cold: 0.015, warm: 0.42, thawAt: -2, frozenAt: -18 };
/** How much wetness melting snow hands the rain pane, per unit of load
 * melted per second. */
const WATER = 5;
/** Coverage under which nothing is worth drawing. */
const NOTHING = 0.006;
/** The flake field: two cells, m, and the radius of a flake in each. */
const FLAKE = { coarse: { cell: 0.013, radius: 0.0045 }, fine: { cell: 0.0062, radius: 0.0021 } };

export type ScreenSnowDrive = {
  /** How hard it is snowing ON the car, 0..1 — the precipitation's share
   * that is flakes at this height. */
  flakes: number;
  /** Road speed, m/s. */
  speed: number;
  /** Seconds the run has been going — the heater's clock. */
  time: number;
  /** The outside air at the car, °C. */
  temperature: number;
  /** What the arm on the windscreen is doing (car/wipers.ts). */
  wipe: WipeState | null;
};

export type ScreenSnow = {
  mesh: THREE.Mesh;
  /** Whether there is enough on the glass to be worth drawing. */
  active: () => boolean;
  /** The WATER the melt is making, as a wetness for the rain pane, 0..1. */
  water: () => number;
  update: (drive: ScreenSnowDrive, dt: number) => void;
  setSky: (tint: THREE.Color, flash: number) => void;
  draw: (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => void;
  dispose: () => void;
};

const VERT = /* glsl */ `
attribute vec2 pane;
attribute vec2 size;
varying vec2 vPane;
varying vec2 vSize;

void main() {
  vPane = pane;
  vSize = size;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

/** How much of the glass is under unmelted snow, 0..1. */
uniform float uLoad;
/** How far the snow that is there has gone to water, 0..1. */
uniform float uMelt;
uniform vec3 uTint;
uniform float uFlash;
/** The arm, exactly as the rain pane has it (screen-rain.ts). */
uniform vec4 uArc;
uniform vec2 uArm;
uniform vec4 uStroke;

varying vec2 vPane;
varying vec2 vSize;

const float TAU = 6.28318530718;
const float FOREVER = 1000.0;
const float COARSE_CELL = ${FLAKE.coarse.cell.toFixed(4)};
const float COARSE_R = ${FLAKE.coarse.radius.toFixed(4)};
const float FINE_CELL = ${FLAKE.fine.cell.toFixed(4)};
const float FINE_R = ${FLAKE.fine.radius.toFixed(4)};

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/** Seconds since a blade last passed this point — the rain pane's own
 * reading of the arm, restated so the two panes clear the same arc. */
float wipeAge(vec2 p) {
  vec2 d = p - uArc.xy;
  float r = length(d);
  if (r < uArm.x || r > uArm.y) return FOREVER;
  float a = atan(-d.x, d.y);
  float t = (a - uArc.z) / uArc.w;
  if (t < 0.0 || t > 1.0) return FOREVER;
  float out0 = acos(clamp(1.0 - 2.0 * t, -1.0, 1.0));
  float since = min(mod(uStroke.x - out0, TAU), mod(uStroke.x - (TAU - out0), TAU));
  return since / TAU * uStroke.y + uStroke.z;
}

/** One layer of flakes: (coverage, how melted the flake here is). A flake
 * is a jagged blob at a jittered spot in its cell, present where the
 * cell's roll is under the load; the ones rolled under the melt have gone
 * translucent and small. */
vec2 flakes(vec2 p, float cell, float radius, float seed, float load) {
  vec2 g = p / cell;
  vec2 id = floor(g) + seed;
  vec2 f = fract(g);
  float h = hash(id);
  if (h > load) return vec2(0.0);
  vec2 c = vec2(hash(id + 3.1), hash(id + 7.7)) * 0.6 + 0.2;
  float melting = step(hash(id + 5.5), uMelt);
  float r = radius * (0.6 + 0.8 * hash(id + 11.3)) * mix(1.0, 0.55, melting);
  vec2 d = (f - c) * cell;
  float ang = atan(d.y, d.x);
  float edge = r * (0.82 + 0.18 * sin(ang * 6.0 + h * 40.0) * sin(ang * 11.0 + h * 9.0));
  float a = 1.0 - smoothstep(edge * 0.6, edge, length(d));
  return vec2(a, melting);
}

void main() {
  vec2 p = vPane;
  // How much of the fall has settled HERE. Along the sill the flakes bank
  // up first, and the wipers' arc is kept clear while they run.
  float up = clamp(p.y / max(vSize.y, 0.001), 0.0, 1.0);
  float sill = smoothstep(0.16, 0.0, up) * 0.6;
  float load = clamp(uLoad * (1.0 + sill) + sill * uLoad * 0.5, 0.0, 1.0);
  float age = wipeAge(p);
  float swept = uStroke.w > 0.5 ? smoothstep(0.0, 2.5, age) : smoothstep(0.0, 40.0, age);
  load *= swept;

  vec2 coarse = flakes(p, COARSE_CELL, COARSE_R, 0.0, load * 0.85);
  vec2 fine = flakes(p, FINE_CELL, FINE_R, 17.0, load);
  float cover = max(coarse.x, fine.x);
  float melting = cover > 0.0 ? (coarse.x >= fine.x ? coarse.y : fine.y) : 0.0;

  // THE BANK at the arc's rim: what the blades have shoved aside, packed
  // white along the outer edge of the sweep once there is enough on the
  // glass to shove.
  vec2 dp = p - uArc.xy;
  float rr = length(dp);
  float aa = atan(-dp.x, dp.y);
  float t = (aa - uArc.z) / uArc.w;
  float rim = 0.0;
  if (uStroke.w > 0.5 && uLoad > 0.12) {
    float band = smoothstep(0.0, 0.006, rr - uArm.y) * (1.0 - smoothstep(0.012, 0.03, rr - uArm.y));
    float inArc = step(0.0, t) * step(t, 1.0);
    float ragged = 0.7 + 0.3 * hash(floor(p / 0.004));
    rim = band * inArc * clamp((uLoad - 0.12) * 2.5, 0.0, 1.0) * ragged;
  }
  cover = max(cover, rim);
  if (cover < 0.004) discard;

  // A flake is white lit by the sky; a melting one is grey, and thin.
  vec3 fresh = uTint * (1.06 + 0.8 * uFlash);
  vec3 wet = uTint * 0.72;
  vec3 col = mix(fresh, wet, melting * 0.8);
  float alpha = cover * mix(0.96, 0.4, melting);
  gl_FragColor = vec4(col, alpha);
}
`;

export function buildScreenSnow(spec: CarBodySpec, anchor: THREE.Object3D): ScreenSnow {
  const panes = screenPanes(spec);
  const uniforms = {
    uLoad: { value: 0 },
    uMelt: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFlash: { value: 0 },
    uArc: { value: new THREE.Vector4(0, 0, 0, 1) },
    uArm: { value: new THREE.Vector2(0, 0) },
    uStroke: { value: new THREE.Vector4(0, 1, 1000, 0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = paneMesh([panes.front], GRID.front, false, material, SNOW_LIFT);
  const stage = new THREE.Scene();
  stage.add(mesh);

  /** How much of the glass is under snow, and how far that snow has gone
   * to water. Two numbers rather than a field: the shader picks which
   * flakes are the melting ones off a roll, so the picture is stable
   * while the totals move. */
  let load = 0;
  let melt = 0;
  let water = 0;

  const update = (drive: ScreenSnowDrive, dt: number): void => {
    const pace = Math.max(0, Math.min(1, drive.speed / CATCH.at));
    const landing =
      Math.max(0, Math.min(1, drive.flakes)) * (CATCH.still + (CATCH.full - CATCH.still) * pace);
    // The heater: through in a couple of minutes, and worth less the
    // colder it is outside.
    const warm = 1 - Math.exp(-Math.max(0, drive.time) / WARM);
    const thaw = Math.max(
      0,
      Math.min(1, (drive.temperature - MELT.frozenAt) / (MELT.thawAt - MELT.frozenAt)),
    );
    const melting = MELT.cold + MELT.warm * warm * (0.15 + 0.85 * thaw);
    const gone = Math.min(load, melting * dt * Math.max(load, 0.05));
    load = Math.max(0, Math.min(1, load + landing * dt - gone));
    // The share of what is there that is on its way to water: follows the
    // melt rate against the arrival rate, so a cold screen under heavy
    // snow is crisp and a warm one under a flurry is all beads.
    const wantMelt = landing > 0 ? Math.max(0, Math.min(1, melting / (melting + landing * 2))) : 1;
    melt += (wantMelt - melt) * Math.min(1, dt * 0.8);
    water = Math.max(0, Math.min(1, (gone / Math.max(dt, 1e-3)) * WATER));
    uniforms.uLoad.value = load;
    uniforms.uMelt.value = melt;
    const w = drive.wipe;
    if (w) {
      uniforms.uArc.value.set(w.pivotX, w.pivotY, w.park, w.sweep);
      uniforms.uArm.value.set(w.inner, w.reach);
      uniforms.uStroke.value.set(w.phase, w.period, w.parkAge, w.running ? 1 : 0);
    }
  };

  const setSky = (tint: THREE.Color, flash: number): void => {
    uniforms.uTint.value.copy(tint);
    uniforms.uFlash.value = flash;
  };

  const active = (): boolean => load > NOTHING;

  const draw = (renderer: THREE.WebGLRenderer, camera: THREE.Camera): void => {
    if (!active()) return;
    mesh.matrix.copy(anchor.matrixWorld);
    mesh.matrixWorldNeedsUpdate = true;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(stage, camera);
    renderer.autoClear = autoClear;
  };

  const dispose = (): void => {
    mesh.geometry.dispose();
    material.dispose();
  };

  return { mesh, active, water: () => water, update, setSky, draw, dispose };
}

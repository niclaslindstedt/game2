// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COCKPIT'S INSTRUMENTS AND ITS MIRROR — the parts of the first-person
// cabin a screenshot cannot vouch for.
//
// A dial with the wrong figure on it, a readout that lights the wrong bars
// for a 7, a tripmeter that does not right-align, a mirror lens standing
// outside the car, and — above all — a mirror whose picture is NOT reversed
// all look plausible in a frame at speed. So the claims are made here:
//
//   * a seven-segment figure lights the bars the character needs and no
//     others, a point rides the figure before it, and a readout fills from
//     the right the way an LED meter does;
//   * every reading the dash shows comes off the state the way the HUD's
//     cluster reads it, so the two can never disagree;
//   * on every catalog body the mirror's lens stands inside the cabin, under
//     the roof and over the sill, looking BACK at the middle of the
//     backlight;
//   * the mirror's pane is oriented so that, with the pass's texture
//     reversed once (mirror.ts), the car's own left is on the driver's left
//     of the glass — the way every mirror shows the road behind.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  CARS,
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
  type GameState,
} from "@engine";

import { buildCockpit, cockpitEyeFor, cockpitMirrorFor } from "../pwa/src/game/car/cockpit.ts";
import { DIALS, dialAngle } from "../pwa/src/game/car/cockpit-dials.ts";
import { cabinOf } from "../pwa/src/game/car/interior.ts";
import {
  FIGURES,
  POINT,
  buildReadout,
  figureBars,
  figureBits,
  textBars,
} from "../pwa/src/game/car/segment-display.ts";
import { screenPanes } from "../pwa/src/game/car/greenhouse.ts";
import { patchAt, rectAt } from "../pwa/src/game/car/builder.ts";
import { instrumentReadings, tachometer } from "../pwa/src/game/car-instruments.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";
import { fallbackMount } from "../pwa/src/game/mirror.ts";

const bodies = Object.entries(CAR_BODIES);

/** The bars a lamp panel currently shows lit, read back off the colours it
 * wrote — the only honest way to ask a readout what it says. */
function litBars(mesh: THREE.Mesh, lit: number): number[] {
  const color = mesh.geometry.getAttribute("color");
  const want = new THREE.Color(lit);
  const out: number[] = [];
  for (let i = 0; i < color.count / 4; i++) {
    const on =
      Math.abs(color.getX(i * 4) - want.r) < 1e-3 &&
      Math.abs(color.getY(i * 4) - want.g) < 1e-3 &&
      Math.abs(color.getZ(i * 4) - want.b) < 1e-3;
    out.push(on ? 1 : 0);
  }
  return out;
}

const count = (bits: number): number => bits.toString(2).split("1").length - 1;

describe("seven-segment figures", () => {
  it("light the bars each character needs and nothing for one it cannot draw", () => {
    expect(count(figureBits("8"))).toBe(7);
    expect(count(figureBits("1"))).toBe(2);
    expect(count(figureBits("0"))).toBe(6);
    expect(figureBits("x")).toBe(0);
    expect(figureBits(" ")).toBe(0);
    // Every digit is a distinct shape, or two readings look the same.
    const shapes = new Set("0123456789".split("").map(figureBits));
    expect(shapes.size).toBe(10);
    expect(FIGURES["n"]).not.toBe(FIGURES["r"]);
  });

  it("carries a point on the figure before it, taking no room of its own", () => {
    const plain = textBars("340", 0.01);
    const pointed = textBars("3.40", 0.01);
    expect(pointed.length).toBe(plain.length + 1);
    // Same figures in the same slots: the point changed nothing else.
    const withoutPoint = pointed.filter(
      (bar) => !plain.every((p) => p.x0 !== bar.x0 || p.y0 !== bar.y0),
    );
    expect(withoutPoint.length).toBe(plain.length);
  });

  it("mirrors about x when asked, for a face seen from behind", () => {
    const bars = textBars("7", 0.01);
    const mirrored = textBars("7", 0.01, true);
    for (const bar of bars) {
      expect(mirrored.some((m) => Math.abs(m.x0 + bar.x1) < 1e-9 && m.y0 === bar.y0)).toBe(true);
    }
  });

  it("keeps a figure's bars inside its own cell", () => {
    const bars = figureBars(0.01);
    for (const bar of bars.slice(0, 7)) {
      expect(bar.y0).toBeGreaterThanOrEqual(-0.005 - 1e-9);
      expect(bar.y1).toBeLessThanOrEqual(0.005 + 1e-9);
    }
    expect(bars[7]!.x0).toBeGreaterThan(bars[1]!.x1 - 1e-9);
  });
});

describe("a readout", () => {
  const tone = { lit: 0xff4a35, dark: 0x2c1a18 };
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });

  it("fills from the right and ghosts the figures it does not need", () => {
    const readout = buildReadout(5, 0.01, tone, (geo) => geo, material);
    readout.set("3.40");
    const lit = litBars(readout.mesh, tone.lit);
    expect(lit.length).toBe(40);
    // Two leading figures dark, then 3. 4 0.
    expect(lit.slice(0, 16).every((b) => b === 0)).toBe(true);
    const figure = (slot: number): number =>
      lit.slice(slot * 8, slot * 8 + 8).reduce((acc, b, k) => acc | (b << k), 0);
    expect(figure(2)).toBe(figureBits("3") | POINT);
    expect(figure(3)).toBe(figureBits("4"));
    expect(figure(4)).toBe(figureBits("0"));
    readout.dispose();
  });

  it("shows a gear as one figure, and n and r as themselves", () => {
    const gear = buildReadout(1, 0.02, tone, (geo) => geo, material);
    for (const text of ["1", "6", "n", "r"]) {
      gear.set(text);
      const lit = litBars(gear.mesh, tone.lit);
      const bits = lit.reduce((acc, b, k) => acc | (b << k), 0);
      expect(bits).toBe(figureBits(text));
    }
    gear.dispose();
  });
});

describe("the dials", () => {
  it("sweep 270° from 7:30, and the needle's angle is the scale's", () => {
    expect(dialAngle(0)).toBeCloseTo(DIALS.zero, 9);
    expect(dialAngle(1)).toBeCloseTo(DIALS.zero - DIALS.sweep, 9);
    expect(dialAngle(2)).toBe(dialAngle(1));
    expect(dialAngle(-1)).toBe(dialAngle(0));
  });

  it("label the tacho in thousands and the speedo in km/h to its top speed", () => {
    const tacho = DIALS.tacho;
    expect(tacho.label(0)).toBe("0");
    expect(tacho.label(tacho.ticks)).toBe("10");
    const speedo = DIALS.speedo;
    expect(speedo.label(0)).toBe("0");
    expect(Number(speedo.label(speedo.ticks))).toBeCloseTo(DIALS.topSpeed * 3.6, 6);
    // A figure on every major, and majors divide the sweep evenly.
    expect(tacho.ticks % tacho.majorEvery).toBe(0);
    expect(speedo.ticks % speedo.majorEvery).toBe(0);
  });
});

const RUNWAY = [{ kind: "straight", length: 12000, feature: "none" }] as const;

function game(skipCountdown = true): GameState {
  return createGame({
    seed: 0,
    carId: CARS[0]!.id,
    gearbox: "manual",
    skipCountdown,
    track: compileTrack(0, [...RUNWAY]),
  });
}

describe("what the dashboard reads", () => {
  it("shows n on the line with every lamp lit for the bulb check", () => {
    const state = game(false);
    const read = instrumentReadings(state, false);
    expect(read.gear).toBe("n");
    expect(read.lamps.every(Boolean)).toBe(true);
    expect(read.total).toBe("0.00");
    expect(read.interval).toBe("0.00");
    expect(read.shift).toBe(false);
  });

  it("reads the gear, the trip and the revs off the state once racing", () => {
    const state = game();
    for (let i = 0; i < Math.round(5 / TUNING.dt); i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    }
    const read = instrumentReadings(state, true);
    expect(read.gear).toBe(`${state.car.gear + 1}`);
    expect(read.speed).toBeGreaterThan(5);
    expect(Number(read.total)).toBeCloseTo(state.stats.distance / 1000, 2);
    // Only the beams have anything to say on the road.
    expect(read.lamps[0]).toBe(true);
    expect(read.lamps.slice(1).some(Boolean)).toBe(false);
    // The needle reads what the HUD's tachometer reads.
    expect(read.rev).toBe(tachometer(state));
    expect(read.rev).toBeGreaterThanOrEqual(0.18);
    expect(read.rev).toBeLessThanOrEqual(1);
  });

  it("reads r while the car is backing out", () => {
    const state = game();
    for (let i = 0; i < Math.round(3 / TUNING.dt); i++) {
      step(state, { ...NEUTRAL_INPUT, brake: 1 });
    }
    expect(state.car.reversing).toBe(true);
    expect(instrumentReadings(state, false).gear).toBe("r");
  });
});

describe("the mirror's lens", () => {
  it("stands inside the cabin on every body, looking back at the middle of the backlight", () => {
    for (const [id, spec] of bodies) {
      const cabin = cabinOf(spec);
      const { at, look } = cockpitMirrorFor(spec);
      const eye = cockpitEyeFor(spec);
      // Under the roof, over the sill, and in the top of the screen — ahead
      // of the driver's eye and behind the cowl.
      expect(at.y, id).toBeLessThan(cabin.roofY);
      expect(at.y, id).toBeGreaterThan(cabin.sillY);
      expect(at.y, id).toBeGreaterThan(eye.y);
      expect(at.z, id).toBeGreaterThan(eye.z);
      expect(at.z, id).toBeLessThan(cabin.cowlZ + 0.05);
      expect(Math.abs(at.x), id).toBeLessThan(cabin.inner);
      // Aimed at the backlight's own centre, which is behind the lens.
      const rear = screenPanes(spec).rear;
      const [u, v] = rectAt(rear.rect, 0.5, 0.5);
      const centre = patchAt(rear.patch, u, v);
      expect(look.x, id).toBeCloseTo(centre[0], 9);
      expect(look.y, id).toBeCloseTo(centre[1], 9);
      expect(look.z, id).toBeCloseTo(centre[2], 9);
      expect(look.z, id).toBeLessThan(at.z - 0.5);
    }
  });

  it("falls back to a lens over the roof looking back and a touch down", () => {
    const mount = fallbackMount(1.2);
    expect(mount.at.y).toBeGreaterThan(1.5);
    expect(mount.look.z).toBeLessThan(mount.at.z);
    expect(mount.look.y).toBeLessThan(mount.at.y);
  });

  it("puts the car's left on the driver's left of the glass — the picture is REVERSED", () => {
    // The pass draws the road behind the right way round and its texture is
    // reversed ONCE (repeat.x = −1 in mirror.ts): texel u = 0 is the raw
    // frame's right edge, and a lens looking down the car's −z has the
    // car's +x on its right — so u = 0 holds the car's +x side. From the
    // seat, looking down +z, the car's +x is on the driver's LEFT. A
    // mirror image therefore needs u = 0 on the pane's +x end.
    const material = new THREE.MeshBasicMaterial();
    for (const [id, spec] of bodies) {
      const cockpit = buildCockpit(spec, {
        shell: material,
        instrument: material,
        tint: material,
        mirror: material,
      });
      const glass = cockpit.mirrorGlass as THREE.Mesh;
      const pos = glass.geometry.getAttribute("position");
      const uv = glass.geometry.getAttribute("uv");
      let xAtU0 = 0;
      let xAtU1 = 0;
      for (let i = 0; i < uv.count; i++) {
        if (uv.getX(i) < 0.5) xAtU0 = pos.getX(i);
        else xAtU1 = pos.getX(i);
      }
      expect(xAtU0, id).toBeGreaterThan(xAtU1);
      // ...and the pane sits where the mount says the lens stands.
      const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
      const centre = box.getCenter(new THREE.Vector3());
      expect(centre.x, id).toBeCloseTo(cockpit.mirror.at.x, 3);
      expect(centre.y, id).toBeCloseTo(cockpit.mirror.at.y, 3);
      expect(centre.z, id).toBeCloseTo(cockpit.mirror.at.z, 2);
      cockpit.dispose();
    }
  });
});

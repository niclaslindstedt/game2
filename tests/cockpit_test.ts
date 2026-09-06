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
import { patchAt, rectAt, type Patch, type UVRect } from "../pwa/src/game/car/builder.ts";
import { instrumentReadings, tachometer } from "../pwa/src/game/car-instruments.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";
import { MIRROR_ASPECT, fallbackMount } from "../pwa/src/game/mirror.ts";

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

const UP = new THREE.Vector3(0, 1, 0);

/** Does a ray out of `eye` land on a pane's glass? The pane is a bilinear
 * patch with a leaning rect cut in it, so it is walked as a grid of
 * triangles and the ray is put through each — an intersection test that
 * shares nothing with the 2-D fit the answer is being checked against
 * (car/mirror-fit.ts), which is the point of asking it this way. */
function onGlass(
  pane: { patch: Patch; rect: UVRect },
  eye: THREE.Vector3,
  direction: THREE.Vector3,
): boolean {
  const ray = new THREE.Ray(eye, direction);
  const hit = new THREE.Vector3();
  const corner = (s: number, t: number): THREE.Vector3 => {
    const [u, v] = rectAt(pane.rect, s, t);
    const p = patchAt(pane.patch, u, v);
    return new THREE.Vector3(p[0], p[1], p[2]);
  };
  const cells = 16;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = corner(i / cells, j / cells);
      const b = corner((i + 1) / cells, j / cells);
      const c = corner((i + 1) / cells, (j + 1) / cells);
      const d = corner(i / cells, (j + 1) / cells);
      if (ray.intersectTriangle(a, b, c, false, hit)) return true;
      if (ray.intersectTriangle(a, c, d, false, hit)) return true;
    }
  }
  return false;
}

describe("the mirror's lens", () => {
  it("stands inside the cabin on every body, looking back through the backlight", () => {
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
      // Aimed back through the backlight, TILTED UP off its middle — the
      // adjustment a driver makes, so the glass opens on the horizon rather
      // than on the ground right behind the car (car/mirror-fit.ts). Asked
      // as an ANGLE, because `look` is a marker down the aim rather than a
      // point on the glass: above the line to the middle of the window and
      // below the line to its top edge, or the tilt is aimed at the lining.
      const rear = screenPanes(spec).rear;
      const pitchTo = (p: readonly number[]): number => Math.atan2(p[1] - at.y, at.z - p[2]);
      const [u, v] = rectAt(rear.rect, 0.5, 0.5);
      const middle = pitchTo(patchAt(rear.patch, u, v));
      // The rect's v runs from the window's top edge down, so v = 0 is the
      // header end of the glass.
      const [topU, topV] = rectAt(rear.rect, 0.5, 0);
      const aim = pitchTo([look.x, look.y, look.z]);
      expect(aim, id).toBeGreaterThan(middle);
      expect(aim, id).toBeLessThan(pitchTo(patchAt(rear.patch, topU, topV)));
      expect(look.z, id).toBeLessThan(at.z - 0.5);
    }
  });

  it("opens no wider than the back window — the frame's own corners are on glass", () => {
    for (const [id, spec] of bodies) {
      const { at, look, fov } = cockpitMirrorFor(spec);
      const rear = screenPanes(spec).rear;
      // The frame, as a solid angle: `fov` across and `fov / MIRROR_ASPECT`
      // up, about the aim. Every one of its corners has to land on the
      // glass, because a corner that misses is a corner of cabin in the
      // strip — which is the whole point of fitting the lens to the body.
      const eye = new THREE.Vector3(at.x, at.y, at.z);
      const ahead = new THREE.Vector3(look.x, look.y, look.z).sub(eye).normalize();
      const across = new THREE.Vector3().crossVectors(ahead, UP).normalize();
      const up = new THREE.Vector3().crossVectors(across, ahead);
      const t = Math.tan((fov * Math.PI) / 360);
      // The pane as a plane through its own middle: a ray is on glass if it
      // crosses that plane inside the rect the greenhouse cut in it.
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const ray = ahead
          .clone()
          .addScaledVector(across, sx * t)
          .addScaledVector(up, (sy * t) / MIRROR_ASPECT)
          .normalize();
        expect(onGlass(rear, eye, ray), `${id} corner ${sx},${sy}`).toBe(true);
      }
    }
  });

  it("falls back to a lens over the roof looking back and a touch down", () => {
    const mount = fallbackMount(1.2);
    expect(mount.at.y).toBeGreaterThan(1.5);
    expect(mount.look.z).toBeLessThan(mount.at.z);
    expect(mount.look.y).toBeLessThan(mount.at.y);
    // ...at a field in the same band a fitted one comes out at, so the
    // picture does not change scale on a car with no cabin to fit to.
    expect(mount.fov).toBeGreaterThan(18);
    expect(mount.fov).toBeLessThan(46);
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

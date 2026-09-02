// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WATER ON THE WINDSCREEN, and the arm that clears it.
//
// Almost all of what car/screen-rain.ts does happens in a fragment shader,
// where no test can reach it — the drops, the runs and the swept arc are
// looked at with `make screenshots`, not asserted. What IS assertable is
// everything the shader is DRIVEN by, and it is the half that goes wrong
// silently: which way the water is being carried, how far it has gone, where
// the arm is in its stroke, and — the one that is invisible until somebody
// looks at a frame — whether the water is laid under the blade or over it.
//
// It reaches into pwa/ for the same reason car_geometry_test.ts does: the
// pane frame and the body specs are arithmetic over plain data. three.js is
// built here, but nothing is rendered, so there is no DOM and no GL.

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { patchAt } from "../pwa/src/game/car/builder.ts";
import { screenPanes } from "../pwa/src/game/car/greenhouse.ts";
import { paneFrame } from "../pwa/src/game/car/pane-frame.ts";
import { buildScreenRain } from "../pwa/src/game/car/screen-rain.ts";
import { buildWipers } from "../pwa/src/game/car/wipers.ts";
import { CAR_BODIES } from "../pwa/src/game/car-styles.ts";

const bodies = Object.entries(CAR_BODIES);
const SPEC = CAR_BODIES.compact;

/** A car standing in the rain with no wiper on it — the simplest drive to
 * write, and the one that isolates whatever is being asked about. */
function still(over: Partial<Parameters<ReturnType<typeof buildScreenRain>["update"]>[0]> = {}) {
  return { wet: 1, speed: 0, lateral: 0, wipe: null, ...over };
}

function rain(spec = SPEC) {
  return buildScreenRain(spec, new THREE.Object3D());
}

function uniformsOf(built: ReturnType<typeof buildScreenRain>) {
  return (built.mesh.material as THREE.ShaderMaterial).uniforms;
}

describe("a screen's own metric frame", () => {
  it.each(bodies)("%s: the windscreen frame is orthonormal and faces out", (_id, spec) => {
    const frame = paneFrame(screenPanes(spec).front);
    expect(frame.right.length()).toBeCloseTo(1, 6);
    expect(frame.up.length()).toBeCloseTo(1, 6);
    expect(Math.abs(frame.right.dot(frame.up))).toBeLessThan(1e-6);
    // Right-handed against the outward normal, or every blade on the car
    // sweeps its arc mirrored (car/wipers.ts).
    const cross = new THREE.Vector3().crossVectors(frame.right, frame.up);
    expect(cross.dot(frame.normal.clone().normalize())).toBeGreaterThan(0.99);
    // A windscreen faces FORWARD and up: the car's nose is +z.
    expect(frame.normal.clone().normalize().z).toBeGreaterThan(0.3);
    expect(frame.normal.clone().normalize().y).toBeGreaterThan(0);
  });

  it.each(bodies)(
    "%s: the origin is the middle of the sill, up runs to the header",
    (_id, spec) => {
      const pane = screenPanes(spec).front;
      const frame = paneFrame(pane);
      // Every corner of the glass, in the frame's own metres.
      const corners = [
        [pane.rect.u0, pane.rect.v0],
        [pane.rect.u1, pane.rect.v0],
        [pane.rect.u0, pane.rect.v1],
        [pane.rect.u1, pane.rect.v1],
      ].map(([u, v]) => {
        const q = patchAt(pane.patch, u as number, v as number);
        const d = new THREE.Vector3(q[0], q[1], q[2]).sub(frame.origin);
        return { x: d.dot(frame.right), y: d.dot(frame.up) };
      });
      // Nothing off the top of the pane, nothing under its sill, nothing
      // outside its half-width — the shader feathers its edges against
      // exactly these, so a corner outside them is a corner with a hard line
      // across it.
      for (const c of corners) {
        expect(c.y).toBeGreaterThan(-1e-6);
        expect(c.y).toBeLessThan(frame.height + 1e-6);
        expect(Math.abs(c.x)).toBeLessThan(frame.width / 2 + 1e-6);
      }
      // And the glass really does reach both ends of both axes.
      expect(Math.max(...corners.map((c) => c.y))).toBeCloseTo(frame.height, 6);
      expect(Math.max(...corners.map((c) => c.x))).toBeGreaterThan(frame.width / 2 - 1e-6);
    },
  );
});

describe("where the water is laid", () => {
  it.each(bodies)("%s: under the blade, over the grime film", (_id, spec) => {
    const material = new THREE.MeshBasicMaterial();
    const wipers = buildWipers(spec, material, new THREE.MeshBasicMaterial(), "fine");
    const water = rain(spec);
    const pane = screenPanes(spec).front;
    const frame = paneFrame(pane);
    const corner = patchAt(pane.patch, pane.rect.u0, pane.rect.v0);
    const base = new THREE.Vector3(corner[0], corner[1], corner[2]);
    /** How far proud of the glass a point sits, m. */
    const lift = (p: THREE.Vector3): number => p.clone().sub(base).dot(frame.normal);

    const first = (mesh: THREE.Mesh): THREE.Vector3 => {
      const a = mesh.geometry.getAttribute("position");
      return new THREE.Vector3(a.getX(0), a.getY(0), a.getZ(0));
    };
    // The two panes are tessellated from the same corner of the same rect,
    // so their first vertices differ only in how far out they stand.
    const film = lift(first(wipers.film as THREE.Mesh));
    const water0 = lift(first(water.mesh));
    // The arm's mount is the first Group hung on the wipers — everything
    // else there is a mesh.
    const mount = wipers.group.children.find((c) => c.type === "Group") as THREE.Object3D;
    const blade = mount.position.clone().sub(base).dot(frame.normal);

    expect(water0).toBeGreaterThan(film);
    // THE ONE THAT SHOWS. Water is on the OUTSIDE of a windscreen and the
    // rubber rides on top of it: laid proud of the blade, every drop is
    // drawn over the arm that is supposed to be clearing them, and the wipe
    // stops reading as a wipe at all.
    expect(water0).toBeLessThan(blade);

    wipers.dispose();
    water.dispose();
    material.dispose();
  });

  it("the pane spans the glass in the coordinates the shader solves in", () => {
    const water = rain();
    const local = water.mesh.geometry.getAttribute("pane");
    const half = uniformsOf(water).uSize.value.x as number;
    const height = uniformsOf(water).uSize.value.y as number;
    let maxX = 0;
    let maxY = 0;
    let minY = Infinity;
    for (let i = 0; i < local.count; i++) {
      maxX = Math.max(maxX, Math.abs(local.getX(i)));
      maxY = Math.max(maxY, local.getY(i));
      minY = Math.min(minY, local.getY(i));
    }
    expect(maxX).toBeCloseTo(half, 5);
    expect(maxY).toBeCloseTo(height, 5);
    expect(minY).toBeCloseTo(0, 5);
    water.dispose();
  });
});

describe("which way the water runs", () => {
  it("creeps DOWN a standing screen and is dragged UP a moving one", () => {
    const parked = rain();
    parked.update(still(), 1);
    expect(uniformsOf(parked).uRun.value as number).toBeLessThan(0);
    expect(uniformsOf(parked).uDir.value as number).toBe(-1);

    const flying = rain();
    flying.update(still({ speed: 30 }), 1);
    expect(uniformsOf(flying).uRun.value as number).toBeGreaterThan(0);
    expect(uniformsOf(flying).uDir.value as number).toBe(1);
    parked.dispose();
    flying.dispose();
  });

  it("leaves no trail through the crossover, where it is barely moving", () => {
    // Somewhere between creeping down and being blown up the two cancel, and
    // that is the one moment the direction flips. A trail there would flip
    // with it, in one frame, on every drop at once.
    let quietest = 1;
    const water = rain();
    for (let speed = 0; speed <= 12; speed += 0.25) {
      water.update(still({ speed }), 0.02);
      quietest = Math.min(quietest, uniformsOf(water).uTrail.value as number);
    }
    expect(quietest).toBeLessThan(0.15);
    water.dispose();
  });

  it("is drawn out along its run the faster the car goes", () => {
    const water = rain();
    water.update(still(), 0.02);
    const stopped = uniformsOf(water).uStretch.value as number;
    water.update(still({ speed: 40 }), 0.02);
    const flat = uniformsOf(water).uStretch.value as number;
    expect(stopped).toBeCloseTo(1, 6);
    expect(flat).toBeGreaterThan(stopped * 1.2);
    water.dispose();
  });

  it("arrives faster on a car that is driving into it", () => {
    // A parked car collects what falls on the area of its screen; one at
    // rally pace sweeps out a much bigger column of wet air in the same
    // second. Without it a wet stage at speed reads as a screen somebody
    // forgot to clean rather than as weather.
    const water = rain();
    water.update(still(), 0.02);
    const parked = uniformsOf(water).uCatch.value as number;
    water.update(still({ speed: 40 }), 0.02);
    const flying = uniformsOf(water).uCatch.value as number;
    expect(parked).toBeCloseTo(1, 6);
    expect(flying).toBeGreaterThan(2);
    water.dispose();
  });

  it("leans the runs the way a corner throws the water, and settles back", () => {
    const water = rain();
    // A LEFT-hander is a positive lateral acceleration, and it throws
    // everything loose in the car — the water on the glass included — to the
    // right. Left and right have to come out opposite; which sign is which
    // is settled by looking at the frame, not here.
    for (let i = 0; i < 200; i++) water.update(still({ speed: 25, lateral: 9 }), 0.02);
    const left = uniformsOf(water).uLean.value as number;
    for (let i = 0; i < 200; i++) water.update(still({ speed: 25, lateral: -9 }), 0.02);
    const right = uniformsOf(water).uLean.value as number;
    expect(Math.abs(left)).toBeGreaterThan(0.3);
    expect(Math.sign(left)).toBe(-Math.sign(right));

    for (let i = 0; i < 400; i++) water.update(still({ speed: 25, lateral: 0 }), 0.02);
    expect(Math.abs(uniformsOf(water).uLean.value as number)).toBeLessThan(0.02);
    water.dispose();
  });
});

describe("when the pass is worth running", () => {
  it("is nothing on a dry stage, and does not vanish the moment rain stops", () => {
    const water = rain();
    for (let i = 0; i < 100; i++) water.update(still({ wet: 0 }), 0.02);
    expect(water.active()).toBe(false);

    for (let i = 0; i < 200; i++) water.update(still({ wet: 1 }), 0.02);
    expect(water.active()).toBe(true);
    expect(uniformsOf(water).uWet.value as number).toBeGreaterThan(0.9);

    // A shower ending does not take the water off the glass with it: the arm
    // or the airflow does, over seconds.
    water.update(still({ wet: 0 }), 0.02);
    expect(uniformsOf(water).uWet.value as number).toBeGreaterThan(0.9);
    expect(water.active()).toBe(true);
    for (let i = 0; i < 1500; i++) water.update(still({ wet: 0 }), 0.02);
    expect(water.active()).toBe(false);
    water.dispose();
  });
});

describe("the stroke the water is read against", () => {
  const armed = () => {
    const material = new THREE.MeshBasicMaterial();
    return buildWipers(SPEC, material, new THREE.MeshBasicMaterial(), "fine");
  };

  it("hands out an arc the water can be measured in", () => {
    const wipers = armed();
    const front = wipers.front;
    expect(front).not.toBeNull();
    const frame = paneFrame(screenPanes(SPEC).front);
    // The arm has to reach up the glass without swinging off the side of it
    // — the shader tests both bounds and simply never wipes past them.
    expect(front!.reach).toBeGreaterThan(frame.height * 0.5);
    expect(front!.inner).toBeGreaterThan(0);
    expect(front!.inner).toBeLessThan(front!.reach);
    expect(Math.abs(front!.sweep)).toBeGreaterThan(2.5);
    expect(front!.angle).toBeCloseTo(front!.park, 6);
    wipers.dispose();
  });

  it("sits at the park until there is a reason, then runs while it rains", () => {
    const wipers = armed();
    const front = wipers.front!;
    for (let i = 0; i < 100; i++) wipers.update(0, 0, 0, 0.02);
    expect(front.running).toBe(false);
    // Nothing has cleared this glass in two seconds, and the water has to be
    // able to say so — a parkAge stuck at zero is a screen that never wets.
    expect(front.parkAge).toBeGreaterThan(1.9);

    let swung = 0;
    for (let i = 0; i < 60; i++) {
      wipers.update(1, 0, 0, 0.02);
      swung = Math.max(swung, Math.abs(front.angle - front.park));
    }
    expect(front.running).toBe(true);
    // Mid-stroke, so nothing is owed to the park.
    expect(front.parkAge).toBe(0);
    expect(front.period).toBeGreaterThan(0.1);
    // The arm has actually crossed the glass — a stroke that never leaves
    // the park would satisfy every other assertion here.
    expect(swung).toBeGreaterThan(Math.abs(front.sweep) * 0.9);
    wipers.dispose();
  });

  it("wipes faster the harder it rains, and always finishes at the park", () => {
    const beat = (wet: number): number => {
      const wipers = armed();
      const front = wipers.front!;
      for (let i = 0; i < 40; i++) wipers.update(wet, 0, 0, 0.02);
      const period = front.period;
      wipers.dispose();
      return period;
    };
    expect(beat(1)).toBeLessThan(beat(0.05));

    // Run it dry from a soaked screen and it must come to rest AT the park,
    // never halfway up the glass — the arm is drawn there and the water is
    // measured from there.
    const wipers = armed();
    const front = wipers.front!;
    for (let i = 0; i < 60; i++) wipers.update(1, 0, 0, 0.02);
    for (let i = 0; i < 2000; i++) wipers.update(0, 0, 0, 0.02);
    expect(front.running).toBe(false);
    expect(front.angle).toBeCloseTo(front.park, 6);
    expect(front.parkAge).toBeGreaterThan(1);
    wipers.dispose();
  });

  it("hands the arc straight through to the glass", () => {
    // The two must not derive the pivot separately: the shader's whole model
    // of "how long ago was this cleared" is solved about it, and an arc a
    // few millimetres off the arm's is a fan that does not line up with the
    // blade drawn over it.
    const wipers = armed();
    const water = rain();
    for (let i = 0; i < 60; i++) wipers.update(1, 0, 0, 0.02);
    water.update(still({ wipe: wipers.front }), 0.02);
    const u = uniformsOf(water);
    const arc = u.uArc.value as THREE.Vector4;
    const arm = u.uArm.value as THREE.Vector2;
    const stroke = u.uStroke.value as THREE.Vector4;
    const front = wipers.front!;
    expect(arc.x).toBe(front.pivotX);
    expect(arc.y).toBe(front.pivotY);
    expect(arc.z).toBe(front.park);
    expect(arc.w).toBe(front.sweep);
    expect(arm.x).toBe(front.inner);
    expect(arm.y).toBe(front.reach);
    expect(stroke.x).toBe(front.phase);
    expect(stroke.y).toBe(front.period);
    expect(stroke.z).toBe(front.parkAge);
    expect(stroke.w).toBe(1);
    wipers.dispose();
    water.dispose();
  });
});

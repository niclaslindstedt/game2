// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOOSE THINGS — the marshal's cones and the marker posts the car drives
// through, and the tumbler every knocked-free object falls under.
//
// None of this is engine state: a cone stops nothing, no run changes for
// having hit one, and the whole field lives renderer-side. What it owes is
// entirely a LOOK, and the two ways that look breaks are both invisible in a
// diff and instant on screen:
//
//   * A piece that HANGS. Anything that falls onto a fixed floor height —
//     the ground under the car at the moment it came loose — hovers over
//     every hillside in the game. The floor has to be the drawn ground under
//     wherever the piece has actually got to.
//   * A piece the world FORGETS. A cone stepped only while the car is beside
//     it freezes mid-arc the moment the car drives on, which is the same
//     fault seen from the other end.
//
// The posts are the same idea drawn a cheaper way: they never leave the
// instanced batch the stage draws them all in, so what is read back here is
// an instance matrix rather than an object of their own.
//
// So the tests here drive a real car at a real cone over ground that is not
// flat, and then look at where things end up.
//
// This is a renderer module and still a plain-Node test: what it exercises is
// three's scene graph and maths, and nothing in the field reaches for a DOM.
// Anything about how a cone LOOKS is a screenshot's job, not this file's.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  KERB_MARKER,
  NEUTRAL_INPUT,
  compileStage,
  compileTrack,
  createGame,
  createRng,
  step,
  type CarInput,
  type GameState,
  type KerbMarker,
  type SegmentPlan,
} from "@engine";

import { createConeField } from "../pwa/src/game/cones.ts";
import { createPostField } from "../pwa/src/game/kerbs.ts";
import { buildRoadSpill } from "../pwa/src/game/road-spill.ts";
import { GROUND_SCALE } from "../pwa/src/game/settings.ts";
import { stepTumble, tumbleFrom } from "../pwa/src/game/tumble.ts";

const LONG_STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 6000, feature: "none" }];

const drive = (overrides: Partial<CarInput> = {}): CarInput => ({
  ...NEUTRAL_INPUT,
  ...overrides,
});

/** A run on a landscape the test owns, so the ground a cone lands on is
 * exactly the ground the test says it is. */
function onGround(heightAt: (x: number, z: number) => number): GameState {
  const state = createGame({
    seed: 5,
    skipCountdown: true,
    track: compileTrack(5, LONG_STRAIGHT),
  });
  state.terrain = {
    ...state.terrain,
    heightAt,
    groundAt: heightAt,
    waterAt: () => null,
    obstaclesNear: () => [],
    treesNear: () => [],
  };
  return state;
}

/** Put the car out in the wild, pointed down +z at the given pace. */
function intoTheWild(state: GameState, speed: number): void {
  state.car.x = 120;
  state.car.z = 200;
  state.car.heading = 0;
  state.car.y = state.terrain.groundAt(state.car.x, state.car.z);
  state.car.u = speed;
}

/** Stand a cone `ahead` metres down the car's nose. */
function coneAhead(state: GameState, field: ReturnType<typeof createConeField>, ahead: number) {
  const sinH = Math.sin(state.car.heading);
  const cosH = Math.cos(state.car.heading);
  const x = state.car.x + sinH * ahead;
  const z = state.car.z + cosH * ahead;
  field.plant(x, state.terrain.groundAt(x, z), z, 0);
  return field.group.children[field.group.children.length - 1];
}

/** Run the car and the field together for `seconds`, at the engine's own step. */
function run(state: GameState, field: ReturnType<typeof createConeField>, seconds: number): void {
  const dt = 1 / 120;
  for (let i = 0; i < seconds * 120; i++) {
    step(state, drive({ throttle: 1 }));
    field.update(state, dt);
  }
}

describe("driving through the cones", () => {
  it("sends one flying and leaves it lying on the ground", () => {
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 22);
    const cone = coneAhead(state, field, 25);
    const from = cone.position.clone();

    run(state, field, 6);

    // It went somewhere, and it is no longer standing where it stood.
    expect(cone.position.distanceTo(from)).toBeGreaterThan(4);
    // …and it came back down: at rest on the ground, not hanging over it.
    expect(cone.position.y).toBeLessThan(from.y);
    expect(cone.position.y).toBeGreaterThan(20 - 0.01);
    // A knocked cone lies over rather than standing back up.
    const upright = Math.abs(cone.rotation.x) + Math.abs(cone.rotation.z);
    expect(upright).toBeGreaterThan(0.2);
  });

  it("settles on the ground it flew over, not on the ground it left", () => {
    // A hillside falling away ahead of the car — the case a fixed floor
    // height gets wrong, and gets more wrong the further the cone travels.
    const heightAt = (_x: number, z: number): number => 60 - z * 0.25;
    const state = onGround(heightAt);
    const field = createConeField();
    intoTheWild(state, 26);
    const cone = coneAhead(state, field, 25);

    run(state, field, 8);

    const under = heightAt(cone.position.x, cone.position.z);
    expect(cone.position.y).toBeGreaterThan(under - 0.01);
    expect(cone.position.y - under).toBeLessThan(0.6);
  });

  it("keeps stepping a cone the car has already driven past", () => {
    // The car is long gone by the time the cone lands. A field that only
    // stepped what is near the car would leave this one in the air.
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 30);
    const cone = coneAhead(state, field, 20);

    run(state, field, 10);

    const gone = Math.hypot(state.car.x - cone.position.x, state.car.z - cone.position.z);
    expect(gone).toBeGreaterThan(60); // well past it
    expect(cone.position.y).toBeGreaterThan(20 - 0.01);
    expect(cone.position.y).toBeLessThan(20 + 0.5);
  });

  it("leaves a cone the car never reaches standing exactly where it was put", () => {
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 18);
    // Well off the car's line, and past the reach of its body box.
    const cone = coneAhead(state, field, 40);
    cone.position.x += 12;
    const from = cone.position.clone();

    run(state, field, 4);

    expect(cone.position.distanceTo(from)).toBe(0);
  });

  it("does not re-launch the cone under a car that has stopped on it", () => {
    const state = onGround(() => 20);
    const field = createConeField();
    intoTheWild(state, 0);
    const cone = coneAhead(state, field, 0.4);
    const dt = 1 / 120;
    for (let i = 0; i < 240; i++) {
      step(state, drive());
      field.update(state, dt);
    }
    // A parked car is not driving through anything: the cone stays put
    // rather than being kicked once per frame forever.
    expect(cone.position.y).toBeCloseTo(20 + 0.55, 5);
  });
});

describe("a long thing coming to rest", () => {
  /** Step one body until it settles, or give up. Returns the steps it took. */
  function settle(body: ReturnType<typeof tumbleFrom>, groundY: number): number {
    const dt = 1 / 120;
    for (let i = 0; i < 1200; i++) if (!stepTumble(body, dt, () => groundY)) return i;
    return -1;
  }

  /** Where the body's own length points, in the world. */
  function longAxis(object: THREE.Object3D): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
  }

  it("lays a snapped trunk down instead of leaving it standing in the ground", () => {
    // A trunk stood on end, nudged: the case that used to leave a bare pole
    // sticking out of the hillside, because a body that never tumbled far
    // sank to its resting height still upright.
    const trunk = new THREE.Object3D();
    trunk.position.set(0, 20 + 4, 0);
    const body = tumbleFrom(
      trunk,
      new THREE.Vector3(1.5, 0, 0),
      new THREE.Vector3(0, 0, -2.4),
      0.3,
      true,
    );

    expect(settle(body, 20)).toBeGreaterThan(0);
    expect(Math.abs(longAxis(trunk).y)).toBeLessThan(0.05);
    expect(trunk.position.y).toBeCloseTo(20.3, 5);
  });

  it("lays one down whatever it was hit at, at rest on the ground it fell on", () => {
    for (const speed of [0.2, 6, 24]) {
      const trunk = new THREE.Object3D();
      trunk.position.set(0, 12 + 3, 0);
      const body = tumbleFrom(
        trunk,
        new THREE.Vector3(speed, speed * 0.3, 0),
        new THREE.Vector3(0, 0, -2.4 - speed * 0.2),
        0.25,
        true,
      );
      expect(settle(body, 12)).toBeGreaterThan(0);
      expect(Math.abs(longAxis(trunk).y)).toBeLessThan(0.05);
      expect(trunk.position.y).toBeCloseTo(12.25, 5);
    }
  });

  it("leaves a body that is not long to settle however it landed", () => {
    // The cones and the torn-off panels: nothing about them is long, so
    // nothing turns them — a panel that landed on edge stays on edge.
    const panel = new THREE.Object3D();
    panel.position.set(0, 8 + 2, 0);
    panel.rotation.set(0.7, 0, 0);
    const body = tumbleFrom(panel, new THREE.Vector3(), new THREE.Vector3(), 0.2, false);
    expect(settle(body, 8)).toBeGreaterThan(0);
    expect(panel.rotation.x).toBeCloseTo(0.7, 5);
  });
});

describe("driving through the marker posts", () => {
  /** Stand a post `ahead` metres down the car's nose, and take it under a
   * fresh field's management. The batch is an InstancedMesh, so what the
   * test reads back is the instance matrix rather than an object's own
   * position — which is the point: a knocked post never stops being one of
   * the hundreds the stage draws in a single call. */
  function postAhead(state: GameState, field: ReturnType<typeof createPostField>, ahead: number) {
    const sinH = Math.sin(state.car.heading);
    const cosH = Math.cos(state.car.heading);
    const x = state.car.x + sinH * ahead;
    const z = state.car.z + cosH * ahead;
    const marker: KerbMarker = {
      kind: "post",
      x,
      y: state.terrain.groundAt(x, z),
      z,
      spin: state.car.heading,
      s: 0,
      side: 1,
    };
    return field.plant([marker]) as THREE.InstancedMesh;
  }

  /** Where instance 0 of a batch has got to, and how far from upright. */
  function poseOf(batch: THREE.InstancedMesh): { at: THREE.Vector3; tilt: number } {
    const m = new THREE.Matrix4();
    batch.getMatrixAt(0, m);
    const at = new THREE.Vector3();
    const q = new THREE.Quaternion();
    m.decompose(at, q, new THREE.Vector3());
    // How far the stake's own up axis has fallen away from the world's.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    return { at, tilt: Math.acos(Math.min(1, Math.abs(up.y))) };
  }

  it("lays a post flat on the ground and thuds once for it", () => {
    const state = onGround(() => 20);
    const field = createPostField();
    intoTheWild(state, 24);
    const batch = postAhead(state, field, 25);
    const stood = poseOf(batch);
    expect(stood.tilt).toBeLessThan(0.01);

    let knocks = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 6 * 120; i++) {
      step(state, drive({ throttle: 1 }));
      field.update(state, dt, () => (knocks += 1));
    }

    // It made exactly one noise — a post is knocked over once, however many
    // frames the car spends on top of where it used to stand.
    expect(knocks).toBe(1);
    const down = poseOf(batch);
    // It is DOWN: lying on the ground rather than standing in it, and past
    // halfway to flat rather than merely leaning.
    expect(down.tilt).toBeGreaterThan(Math.PI / 4);
    expect(down.at.y).toBeLessThan(20 + KERB_MARKER.post.width);
    expect(down.at.y).toBeGreaterThan(20 - 0.01);
    // ...and it went somewhere doing it.
    expect(down.at.distanceTo(stood.at)).toBeGreaterThan(1);
  });

  it("leaves a post the car never reaches standing exactly where it was put", () => {
    const state = onGround(() => 20);
    const field = createPostField();
    intoTheWild(state, 20);
    const batch = postAhead(state, field, 12);
    // Off to one side, well outside anything the body could brush.
    state.car.x += 9;
    const stood = poseOf(batch);

    for (let i = 0; i < 4 * 120; i++) {
      step(state, drive({ throttle: 1 }));
      field.update(state, 1 / 120);
    }

    const after = poseOf(batch);
    expect(after.at.distanceTo(stood.at)).toBe(0);
    expect(after.tilt).toBeLessThan(0.01);
  });
});

// R16 — THE SPILL at the road's edge: the loose stone that makes a gravel
// road run out into the country instead of ending at a line. It is drawn
// app-side with no engine state, exactly as the cones are and for the same
// reason — every piece of it is a few centimetres tall and the car drives
// straight over it — so this is where it gets tested.
describe("the stone spilled at the road's edge (R16)", () => {
  const track = compileStage(4, "medium");
  /** Where the spill actually put its stones, over 300 samples of road. The
   * ground is flat and nothing is blocked: what is under test is the
   * scatter, not the landscape it lands on. */
  const stones = (density: number): { x: number; z: number; y: number }[] => {
    const rng = createRng(0x51ed);
    const spill = buildRoadSpill(
      track,
      0,
      300,
      rng,
      density,
      () => 0,
      () => false,
    );
    const out: { x: number; z: number; y: number }[] = [];
    const m = new THREE.Matrix4();
    const at = new THREE.Vector3();
    for (let i = 0; i < spill.mesh.count; i++) {
      spill.mesh.getMatrixAt(i, m);
      at.setFromMatrixPosition(m);
      out.push({ x: at.x, z: at.z, y: at.y });
    }
    spill.dispose();
    return out;
  };

  it("thins from the road's edge outward, and never stands on the mat", () => {
    const placed = stones(1);
    expect(placed.length).toBeGreaterThan(200);
    // Every stone is OUTSIDE the mat — the surfacing draws its own gravel,
    // and a chipping standing on the road is litter the wheels bounce off.
    // ...and the count falls with distance: that gradient IS the effect.
    const bands = [0, 0, 0, 0];
    for (const p of placed) {
      let nearest = Infinity;
      let half = track.width / 2;
      for (const s of track.samples) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < nearest) {
          nearest = d;
          half = s.width / 2;
        }
      }
      const out = nearest - half;
      expect(out).toBeGreaterThan(-0.6);
      const band = Math.min(3, Math.floor(out / 2));
      if (band >= 0) bands[band] += 1;
    }
    expect(bands[0]).toBeGreaterThan(bands[1]);
    expect(bands[1]).toBeGreaterThan(bands[2]);
    expect(bands[2]).toBeGreaterThan(bands[3]);
  });

  it("thins with OPTIONS ▸ VIDEO ▸ GROUND DETAIL, and never to nothing", () => {
    const rich = stones(GROUND_SCALE.rich).length;
    const normal = stones(GROUND_SCALE.normal).length;
    const plain = stones(GROUND_SCALE.plain).length;
    expect(plain).toBeLessThan(normal);
    expect(normal).toBeLessThanOrEqual(rich);
    // The road's edge still TRANSITIONS at the cheapest setting: a hard
    // line between gravel and grass is a defect, not a level of detail.
    expect(plain).toBeGreaterThan(normal * 0.15);
  });
});

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TV CAM's gallery (pwa/src/game/camera-tv.ts) — the one camera in the
// game whose subject is not where the lens goes each frame but where the
// TRIPODS were planted before the run started, and in what order the
// director walks them.
//
// None of that is visible in a screenshot: a still of a fixed camera and a
// still of a rig standing unusually far back are the same picture. What a
// picture cannot show, and what breaks first, is a stand pitched ON the road
// (a lens inside a car), a stand pitched under the ground, a gallery that
// walks backwards, and a camera that quietly starts following the car —
// which is every other camera in the game and would look almost right.
//
// Driven directly rather than through `step`: the camera only ever READS
// state, so walking the car down the centreline is the whole scenario.
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { compileTrack, createGame, type GameState, type SegmentPlan } from "@engine";

import { TV, createTvCamera } from "../pwa/src/game/camera-tv.ts";

/** A stage with real corners in it, both ways, long and short. */
const WINDING: SegmentPlan[] = [
  { kind: "straight", length: 220, feature: "none" },
  { kind: "turn", length: 160, dir: 1, radius: 55, severity: "medium", feature: "none" },
  { kind: "straight", length: 140, feature: "none" },
  { kind: "turn", length: 90, dir: -1, radius: 30, severity: "hard", feature: "none" },
  { kind: "straight", length: 200, feature: "none" },
  { kind: "turn", length: 240, dir: -1, radius: 120, severity: "soft", feature: "none" },
  { kind: "straight", length: 300, feature: "none" },
];

/** ...and one with none at all, which is what the gap filler is for. */
const DEAD_STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1400, feature: "none" }];

function game(plan: SegmentPlan[]): GameState {
  return createGame({
    seed: 4,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(4, plan),
  });
}

/** One frame of the shot: where the lens stood, which way it looked, where
 * the car was and which sample that was. */
type Shot = { at: THREE.Vector3; aim: THREE.Vector3; car: THREE.Vector3; index: number };

/** Walk the car down the centreline a sample at a time and photograph the
 * camera at each step. `stride` is how many samples the car covers per
 * frame — two samples at 2 m each is 240 km/h, which is faster than the game
 * goes and therefore the harshest cut rate the director can be asked for. */
function drive(state: GameState, stride = 1): Shot[] {
  const cam = createTvCamera();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.25, 900);
  const out: Shot[] = [];
  for (let i = 0; i < state.track.samples.length; i += stride) {
    const sample = state.track.samples[i];
    state.car.x = sample.x;
    state.car.z = sample.z;
    state.car.y = sample.elevation + 0.6;
    state.car.heading = sample.heading;
    state.nearIndex = i;
    cam.update(camera, state, 1 / 60);
    const aim = new THREE.Vector3();
    camera.getWorldDirection(aim);
    out.push({
      at: camera.position.clone(),
      aim,
      car: new THREE.Vector3(state.car.x, state.car.y, state.car.z),
      index: i,
    });
  }
  return out;
}

/** The distinct tripods a drive actually stood on, in the order they were
 * cut to — the gallery, read back off the shot rather than reached into. */
function galleryOf(shots: Shot[]): Shot[] {
  const stands: Shot[] = [];
  for (const shot of shots) {
    const last = stands[stands.length - 1];
    if (!last || last.at.distanceTo(shot.at) > 1e-6) stands.push(shot);
  }
  return stands;
}

describe("the TV cam's gallery", () => {
  it("plants every tripod off the road, never on it", () => {
    const state = game(WINDING);
    const inTheRoad = galleryOf(drive(state)).filter((stand) => {
      // The nearest sample to the stand, scanned whole: a tripod is planted
      // beside the corner it watches and the car is somewhere else entirely,
      // so the car's own hint says nothing about which road it is beside.
      let nearest = state.track.samples[0];
      let best = Infinity;
      for (const sample of state.track.samples) {
        const d = Math.hypot(sample.x - stand.at.x, sample.z - stand.at.z);
        if (d < best) {
          best = d;
          nearest = sample;
        }
      }
      return best < nearest.width / 2;
    });
    expect(inTheRoad.map((s) => `${s.at.x.toFixed(1)},${s.at.z.toFixed(1)}`)).toEqual([]);
  });

  it("stands the lens over the ground rather than inside the hill", () => {
    const state = game(WINDING);
    const buried = galleryOf(drive(state)).filter(
      (stand) => stand.at.y <= state.terrain.groundAt(stand.at.x, stand.at.z),
    );
    expect(buried.length).toBe(0);
  });

  it("cuts forward down the stage and never back up it", () => {
    const state = game(WINDING);
    const stands = galleryOf(drive(state));
    // More than one tripod, or there is no gallery to walk and the rest of
    // this says nothing.
    expect(stands.length).toBeGreaterThan(2);
    const back = stands.filter((stand, i) => i > 0 && stand.index <= stands[i - 1].index);
    expect(back.length).toBe(0);
  });

  it("holds each tripod still — the car moves, the camera does not", () => {
    // The failure this exists for is the one that would look almost right: a
    // TV cam that quietly drifted with the car is a chase camera with a long
    // boom, and every frame of it is a plausible screenshot. So the rule is
    // stated as an absolute — between two frames the lens has either not
    // moved AT ALL, or it has cut, and there is nothing in between.
    const shots = drive(game(WINDING));
    const crept = shots.filter((shot, i) => {
      if (i === 0) return false;
      const moved = shots[i - 1].at.distanceTo(shot.at);
      return moved > 1e-6 && moved < TV.minGap / 2;
    });
    expect(crept.length).toBe(0);
  });

  it("puts cameras on a road with no corners on it at all", () => {
    // Nothing in `WINDING` proves this: a stage whose every stand came from
    // a bend would leave a straight — or the training ground, which is one —
    // with a single tripod at the start and a car driving into the distance
    // for a kilometre.
    const state = game(DEAD_STRAIGHT);
    const stands = galleryOf(drive(state));
    expect(stands.length).toBeGreaterThan(2);
    const gaps = stands
      .slice(1)
      .map(
        (stand, i) => state.track.samples[stand.index].s - state.track.samples[stands[i].index].s,
      );
    expect(Math.max(...gaps)).toBeLessThanOrEqual(TV.maxGap + TV.hold + state.track.step);
  });

  it("keeps the car in the frame it cuts to", () => {
    // Checked on the CUT, which is the frame the aim is snapped on and so
    // the one that has to be right on its own: the pan that follows is
    // deliberately lagged, and a car going past a lens six metres away
    // outruns any honest operator for a moment. A stand that opened pointing
    // somewhere else would never find the car at all — the pan only ever
    // closes on where the aim already is.
    // Against the point the shot is actually built on rather than the car's
    // own origin: the aim sits `TV.aimUp` over the roof, which from a tripod
    // a dozen metres away is four degrees of the answer.
    const worst = galleryOf(drive(game(WINDING))).reduce((deg, stand) => {
      const to = stand.car
        .clone()
        .setY(stand.car.y + TV.aimUp)
        .sub(stand.at)
        .normalize();
      return Math.max(deg, (stand.aim.angleTo(to) * 180) / Math.PI);
    }, 0);
    expect(worst).toBeLessThan(0.01);
  });
});

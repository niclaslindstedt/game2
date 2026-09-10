// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TV MODE'S DIRECTOR (pwa/src/game/camera-tv-cut.ts) — which of its two
// cameras has the frame, and what the two edits between them actually look
// like on the lens.
//
// Three rules, and every one of them is a claim about a PICTURE that a
// picture cannot check: a still of a tripod shot and a still of a chase shot
// are both stills of a car on a road, and the whole subject here is which one
// is up WHEN and how the change between them was made. So the lens is metered
// instead — how far it is standing from the car, and how far it moved since
// the last frame:
//
//   THE ROAD BETWEEN THE CORNERS IS THE BOOM. On a stage with nothing tight
//   on it the tripods never get the frame at all, however many stands the
//   gallery planted along it.
//
//   GOING TO A CORNER IS A CUT, which on the lens is one frame that moves it
//   tens of metres — the length of the edit, and the thing that makes it read
//   as television.
//
//   COMING BACK IS A MOVE, which is the same distance spent over a second
//   with no frame in it larger than a fast pan. That asymmetry is the whole
//   of camera-tv-cut.ts, and it is exactly what a per-frame displacement
//   series separates.
//
// The camera only ever reads state, so a scripted drive along the arc is the
// whole scenario and no physics is needed.
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { compileTrack, createGame, type GameState, type SegmentPlan } from "@engine";

import { createGameCamera } from "../pwa/src/game/camera.ts";
import { TV_CUT } from "../pwa/src/game/camera-tv-cut.ts";
import { TV } from "../pwa/src/game/camera-tv.ts";

const FRAME = 1 / 60;
/** Rally pace, m/s — fast enough that the lead window is the ceiling rather
 * than the floor, which is the case a stage actually spends its time in. */
const PACE = 30;

/** A stage with one HAIRPIN in the middle of it and nothing else: a long
 * run-up, a corner well inside the director's bar, and a long run-out. A
 * radius under `1 / TV_CUT.tight` is the whole point — this is the stage the
 * shot is supposed to happen on. */
const HAIRPIN: SegmentPlan[] = [
  { kind: "straight", length: 700, feature: "none" },
  { kind: "turn", length: 90, dir: 1, radius: 30, severity: "hard", feature: "none" },
  { kind: "straight", length: 700, feature: "none" },
];

/** ...and the same shape with the corner opened out past the bar. The
 * gallery still plants stands on it — `TV.corner` is a 70 m radius — so this
 * is the stage that separates "the director is choosing" from "the director
 * cuts to whatever the gallery planted". */
const SWEEPER: SegmentPlan[] = [
  { kind: "straight", length: 700, feature: "none" },
  { kind: "turn", length: 90, dir: 1, radius: 110, severity: "soft", feature: "none" },
  { kind: "straight", length: 700, feature: "none" },
];

function stage(segments: SegmentPlan[]): GameState {
  return createGame({
    seed: 4,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(4, segments),
  });
}

type Shot = {
  /** Whether a tripod had this frame. */
  trackside: boolean;
  /** How far the lens moved since the last one, m. */
  moved: number;
  /** ...and how far it is standing from the car, m. */
  range: number;
  /** Where the car was along the stage, m. */
  s: number;
};

/** Put the car on the stage's own line at `s` metres along it, travelling at
 * `PACE`. Everything the camera reads about where the car IS comes off the
 * samples and `nearIndex`, so placing it on them is the honest drive: the
 * alternative is a bot that arrives at the corner at a speed the test cannot
 * state. */
function placeAt(state: GameState, s: number): void {
  const samples = state.track.samples;
  const step = Math.max(1e-3, state.track.step);
  const i = Math.min(samples.length - 1, Math.max(0, Math.round(s / step)));
  const sample = samples[i];
  const car = state.car;
  car.x = sample.x;
  car.z = sample.z;
  car.y = sample.elevation;
  car.heading = sample.heading;
  car.u = PACE;
  car.w = 0;
  car.vy = 0;
  car.airborne = false;
  car.planted = true;
  state.nearIndex = i;
}

/** Drive from `from` to `to` metres along the stage in the TV mode, metering
 * the lens frame by frame. */
function watch(state: GameState, from: number, to: number): Shot[] {
  const cam = createGameCamera(1280, 720);
  cam.setMode("tv");
  const shots: Shot[] = [];
  const at = new THREE.Vector3();
  let prev: THREE.Vector3 | null = null;
  for (let s = from; s <= to; s += PACE * FRAME) {
    placeAt(state, s);
    cam.update(state, FRAME);
    at.copy(cam.camera.position);
    const car = state.car;
    shots.push({
      trackside: cam.tvTrackside(),
      moved: prev ? at.distanceTo(prev) : 0,
      range: at.distanceTo(new THREE.Vector3(car.x, car.y, car.z)),
      s: state.track.samples[state.nearIndex].s,
    });
    prev = prev ? prev.copy(at) : at.clone();
  }
  // The first frame plants the lens wherever the car is; a plant is not a
  // move, and neither is the second frame's ease off it.
  return shots.slice(2);
}

describe("the TV mode's two cameras", () => {
  it("stays on the boom down a stage with nothing tight on it", () => {
    const shots = watch(stage(SWEEPER), 60, 1400);
    // Not one tripod, despite a gallery that certainly planted stands: the
    // sweeper is inside `TV.corner` and outside `TV_CUT.tight`, and the gap
    // fillers are not corners at all.
    expect(shots.some((shot) => shot.trackside)).toBe(false);
    // ...and the shot that IS up is a boom: a lens the length of a rod behind
    // the car, all the way down.
    const ranges = shots.map((shot) => shot.range);
    expect(Math.max(...ranges)).toBeLessThan(14);
  });

  it("cuts to the tripods on the approach to a hairpin and lets go past it", () => {
    const shots = watch(stage(HAIRPIN), 60, 1400);
    const on = shots.filter((shot) => shot.trackside);
    expect(on.length).toBeGreaterThan(0);
    // The corner turns in at 700 m. The shot starts inside the lead window
    // ahead of that and is over within a stand's `hold` of the far end of the
    // bend — never at the apex, and never left running down the road after.
    const first = on[0].s;
    const last = on[on.length - 1].s;
    expect(first).toBeGreaterThan(700 - TV_CUT.leadMax - 2);
    expect(first).toBeLessThanOrEqual(700);
    expect(last).toBeLessThan(700 + 90 + TV.exitPast + TV.hold + TV.maxGap);
    // A tripod stands beside the road rather than behind the car, so the
    // shot's own signature is a standoff no boom ever reaches.
    expect(Math.max(...on.map((shot) => shot.range))).toBeGreaterThan(30);
  });

  it("cuts in and flies out", () => {
    const shots = watch(stage(HAIRPIN), 60, 1400);
    const cut = shots.findIndex((shot) => shot.trackside);
    const back = shots.findIndex((shot, i) => i > cut && !shot.trackside);
    expect(cut).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(cut);
    // GOING is one frame with the whole edit in it.
    expect(shots[cut].moved).toBeGreaterThan(20);
    // COMING BACK is the same ground covered over `TV_CUT.back` seconds, and
    // the frame the hand-back starts on is not allowed to be a cut of its
    // own. A pan at 30 m/s covers half a metre a frame; the bound is well
    // inside the jump above and well outside anything a flight does.
    const flight = shots.slice(back, back + Math.round(TV_CUT.back / FRAME));
    expect(Math.max(...flight.map((shot) => shot.moved))).toBeLessThan(6);
    // ...and it LANDS on the boom rather than near it: by the end of the
    // flight the lens is a rod behind the car and staying there.
    const after = shots.slice(back + Math.round((TV_CUT.back + 0.3) / FRAME));
    expect(after.length).toBeGreaterThan(30);
    expect(Math.max(...after.slice(0, 30).map((shot) => shot.range))).toBeLessThan(14);
  });
});

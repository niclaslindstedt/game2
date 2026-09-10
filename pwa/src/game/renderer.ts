// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The renderer facade: owns the THREE scene, swaps worlds when a new stage
// arrives, and draws one frame from the GameState the engine produced. The
// engine never imports THREE; this module never steps physics. Sky, fog,
// lights, and weather live in environment.ts; this file wires them to the
// run and drives the ground-contact and exhaust particle systems.

import { type VideoSettings } from "./settings.ts";
import { setGroundReach } from "./terrain.ts";
import { type GameRenderer } from "./renderer-face.ts";
import { createEventFx } from "./renderer-fx.ts";
import { createFrame } from "./renderer-frame.ts";
import { createScene } from "./renderer-scene.ts";

export type { GameRenderer } from "./renderer-face.ts";

export function createRenderer(canvas: HTMLCanvasElement, video: VideoSettings): GameRenderer {
  const parts = createScene(canvas, video);
  const fx = createEventFx(parts);
  const { onEvents, onGhostEvents } = fx;
  const frame = createFrame(parts, fx);
  const { live, chase, environment, field, mirrorPace } = parts;
  const { setCamera, setCar, setConditions, setGame, setGhost, setMapRect, setVideo } = parts;
  const { dispose, meter, meterFrames, render, resize, sceneTally, warm } = frame;
  return {
    setGame,
    setCar,
    warm,
    setVideo,
    setCamera,
    setMirror: (on) => {
      live.mirrorOption = on;
      // A mirror the player has switched off comes OFF the car, rather than
      // hanging there with nothing in it.
      live.car?.setMirrorFitted(on);
    },
    setView: (view) => {
      chase.setViewTuning({
        rise: view.seat,
        ahead: view.reach,
        fov: view.fov,
        motion: view.headMotion,
      });
    },
    setNameTags: (on) => {
      live.nameTags = on;
      field.setNames(on);
      if (!on) live.ghostTag?.hide();
    },
    setMapRect,
    nudgeMap: (dAz, dPitch, zoomBy) => chase.nudgeMap(dAz, dPitch, zoomBy),
    panMap: (dxFrac, dyFrac) => chase.panMap(dxFrac, dyFrac),
    resetMap: () => chase.resetMap(),
    setMapLayer: (id) => {
      live.layerId = id;
      return live.layers?.show(id) ?? null;
    },
    holdMap: (held) => chase.holdMap(held),
    placeMap: (pose) => chase.placeMap(pose),
    setFreeFov: (deg) => chase.setFreeFov(deg),
    setAir: (far) => {
      chase.setReach(far);
      // The GROUND has to be built before any of the rest matters: opening
      // the fog and the far plane over unbuilt country only reveals the
      // ridge backdrop standing where the land should be.
      setGroundReach(far);
      // The fog is deliberately THINNER than the driving preset's, not just
      // longer. Kept at the preset's own 160-of-520 shape it starts hazing a
      // third of the way out, and since a shot with the horizon in it spends
      // most of its frame in the far half, the whole country came back white.
      // Holding it clear to well past halfway leaves the land readable and
      // still closes the air over the last of it, so the drawn edge arrives
      // as haze rather than as a line.
      // …and the fog closes exactly AT the drawn edge rather than short of
      // it. That is the whole job it has here: the ground stops at `far`
      // whatever the air does, so the air has to have gone solid by then or
      // the country ends on a visible line. Clear until nearly there, so the
      // land the shot is actually about stays land rather than haze.
      if (far > 0) environment.setFogRange(far * 0.78, far);
    },
    mapPose: () => chase.mapPose(),
    setConditions,
    onThunder: environment.onThunder,
    onKnock: (play) => {
      live.knockPlay = play;
    },
    setGhost,
    onGhostEvents,
    field,
    setStanding: (place) => {
      live.standing = place;
    },
    spectate: (run) => {
      live.watched = run;
      field.watch(run);
      // The lens changes car, and the rig has to be re-stood around the new
      // one either way: coming BACK it is standing behind somebody else's car
      // on another part of the stage, and the flying finish would otherwise
      // plant its shot there.
      //
      // ARRIVING at a crew it FLIES — a second, in an arc over whatever
      // country lies between (camera-sweep.ts) — because the gap between two
      // cars on a stage is hundreds of metres and a cut across it says
      // nothing about where either of them is. Standing down is a cut: the
      // destination there is the results card, not a shot.
      const onto = run ? run.state : live.game;
      if (onto) chase.retake(onto, run !== null);
    },
    cycleCamera: (watching) => chase.cycle(watching),
    flyCamera: (move) => {
      // The look deltas and the wheel steps ACCUMULATE until the camera
      // consumes them, so a frame the camera skipped is a nudge that still
      // arrives rather than one that is lost.
      chase.freeMove.forward = move.forward;
      chase.freeMove.right = move.right;
      chase.freeMove.up = move.up;
      chase.freeMove.fast = move.fast;
      chase.freeMove.yawDelta += move.yawDelta;
      chase.freeMove.pitchDelta += move.pitchDelta;
      chase.freeMove.speedSteps += move.speedSteps;
    },
    flyFrozen: (dt) => chase.flyOnly(dt),
    placeCamera: (pose) => chase.free.place(pose),
    cameraPose: () => ({ ...chase.pose(), speed: chase.free.speed(), mode: chase.mode() }),
    mirrorPace: () => mirrorPace.tier(),
    lampState: () => ({ stage: environment.lampStage(), ahead: field.nearestAhead() }),
    pinMirrorPace: mirrorPace.pin,
    skipIntroShot: chase.skipStartShot,
    render,
    meter,
    meterFrames,
    sceneTally,
    onEvents,
    resize,
    onContext: frame.onContext,
    dispose,
  };
}

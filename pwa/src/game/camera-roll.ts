// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROLL, WATCHED — the beat that takes the frame when the car goes over,
// and the third of the planted shots beside camera-start.ts and
// camera-finish.ts.
//
// A rolling car is the one thing on a stage a BOOM cannot follow. It is off
// its wheels and turning about its own centre at up to a turn a second, its
// heading and its travel direction have come apart, and it is airborne
// between every pair of contacts — so a chase rig tracking a blend of nose
// and travel whips through a full circle while its framing flickers between
// grounded and flying. That is the rig doing exactly what it was built to do,
// to a car that has stopped being the thing it was built to follow.
//
// THE THREE SEATS INSIDE THE CAR ARE NOT THIS SHOT'S BUSINESS, and camera.ts
// keeps them out of it. A lens bolted to the bumper, the scuttle or the
// driver's own head is not failing when the car goes over — it is showing
// the roll from the one place nobody can buy a ticket for, and the world
// turning over outside the screen pillars is the best thing that happens in
// there. Only the rigs that stand OUTSIDE the car plant.
//
// So the camera stops being a rig and becomes a BYSTANDER: it plants where
// it stood, comes to rest, and watches the car go past it and over. What
// makes it read as somebody standing at the side of the road rather than as
// a camera that was switched off:
//
//   IT COASTS TO A STOP RATHER THAN STOPPING DEAD. The lens was travelling
//   with the car at the moment the car left; it keeps a share of that and
//   runs down over a fraction of a second (`carry`). A stop in one frame is
//   a cut to a tripod, and the eye reads it as the picture freezing rather
//   than as the car being taken away.
//
//   IT PLANTS WHERE THE PLAYER ALREADY WAS — the finish's rule, for the
//   finish's reason: whichever rig was up, the shot opens on the view they
//   were driving in rather than cutting to one they have never seen. What it
//   adds is a STANDOFF, for the tightest boom on the ladder: `close` sits
//   four metres off the bumper, and four metres is not a shot of an accident.
//   The stand steps back along its own view axis until there is a car's
//   length or two of air in front of it, which the longer rigs already have
//   and pay nothing for.
//
//   IT PANS LATE, AND IT DOES NOT FLINCH. The aim follows the car loosely,
//   and none of the blows the roll lands reach the lens: every face arriving
//   is a `landing` and the chase rigs rattle for those, but the person
//   holding this camera is standing on the verge and nothing has hit them.
//   Late, though, is not lost: the lag is capped at a few degrees off the
//   middle of the frame, because an operator who loses the subject is not
//   panning late, they are missing the shot.
//
//   IT ZOOMS. A planted camera and a car leaving it at 90 km/h is a car that
//   is six pixels across by the time it stops turning over, and the whole
//   subject of the shot is what the BODY is doing. So the lens holds the car
//   at a constant size in frame instead of a constant angle: `frame` metres
//   of world across the height of the picture, at whatever distance the car
//   has got to, between a wide end and a long one.
//
//   AND IT PEEKS. The one thing a planted shot cannot do is stand behind the
//   hill the car has just gone over — and a roll ends downhill of wherever
//   it started more often than not, because that is where a car that has run
//   out of road goes. So the sight line to the car is walked every frame,
//   and any ground standing in it lifts the camera and walks it forward
//   until the line is clear: the operator rising onto the bank and stepping
//   out to keep the car in view. Rate-limited in both directions, so it
//   reads as somebody moving rather than as a shot being solved.
//
// It hands the frame BACK the way the establishing shot hands it over: the
// driving rig is stood every frame underneath the shot, and the last stretch
// is a blend into the pose it has already written, so the return has no cut
// in it whichever camera the player drives with. The hold before that blend
// is the engine's own `air.roll.lieFor` — exactly as long as a car that came
// to rest on its roof is left lying there before the crew are sent back to
// the last board.
//
// ...unless the car is somewhere else entirely, which after a roll it very
// often is: that same respawn teleports it hundreds of metres up the road.
// A shot cannot pan across a teleport, so the plant is DROPPED and the rig
// takes the frame back in one frame, which is what a respawn is anyway.

import * as THREE from "three";
import { TUNING, type GameState } from "@engine";
import { clamp } from "../lib/angles.ts";

const ROLL = {
  /** How much of the car's own speed the lens keeps as the shot plants,
   * 0..1, and the seconds it runs that down over. Together they are how far
   * the camera coasts: a chase rig leaving a car at 110 km/h carries about
   * three metres past the plant before it is still, which is a camera being
   * stopped rather than a camera stopping. */
  carry: 0.45,
  coast: 0.22,
  /** The least air between the lens and the car at the moment of the plant,
   * m. Read against where the camera ALREADY stands, so most of the ladder
   * pays nothing for it — `chase` and everything behind it is further off
   * the bumper than this already, and the shot they plant is a lens COASTING
   * to a stop and nothing else, because a retreat that cancels the coast
   * reads as a cut to a tripod. It is `close`, four metres off the bumper,
   * that spends it: a car going over from four metres away is bodywork
   * filling the frame rather than an accident anybody can read. */
  standoff: 7,
  /** How far the stand steps back and rises to reach that, s. */
  settle: 0.32,
  /** ...and how far it rises off the plant while it does, m. A bystander is
   * standing up, and a lens at hub height looking at a car that is now above
   * it reads as a dropped camera. */
  lift: 1.2,
  /** THE ZOOM. How much world the frame is filled with at the car, m — the
   * lens is solved from this and the distance rather than set, so the car
   * stays the same size in the picture as it goes away. Wide enough to hold
   * the body, the ground it is hitting and the dirt coming off it. */
  frame: 12,
  /** ...between a long end and a wide one, degrees. The long end is where a
   * hand-held zoom stops being steady enough to hold anything; the wide end
   * is what the shot opens on, close to what the ladder drives with. */
  fovMin: 18,
  fovMax: 58,
  /** How fast the lens answers, 1/s — quick enough to keep up with a car
   * putting twenty metres between them in a second, slow enough to read as a
   * zoom being pulled rather than as the frame breathing. */
  zoom: 3.2,
  /** How fast the aim follows the car, 1/s. Loose, for the finish's reason:
   * a pan that tracks perfectly is a lock, not an operator. */
  pan: 3,
  /** ...but never further off the middle of the frame than this, rad, and
   * never past half of whatever the zoom has left of the half-angle either.
   * The lag is character; losing the car is a bug, and a cap in degrees that
   * ignores the lens is a cap that means one thing at the wide end and lets
   * the car off the edge of the frame at the long one. */
  lead: 0.14,
  /** How far above the car the aim sits, m — at its roof rather than its
   * wheels, since half of what there is to see is the body in the air. */
  aimUp: 0.7,
  /** THE PEEK. How many places along the sight line are asked what the
   * ground is doing there, and how much air the line is asked to clear it
   * by, m. */
  look: 12,
  clear: 1,
  /** How far the operator will climb to see over something, m, and how far
   * forward they will walk per metre of that climb — stepping out shortens
   * the lever the ridge has, so the two together clear a bank neither would
   * on its own. */
  climb: 14,
  stepIn: 0.8,
  stepInMax: 12,
  /** How fast they get up there, and back down, m/s. Up HARD — the height a
   * ridge asks for is at its worst the moment the car drops behind it and
   * falls away as the car gets further, so a lens that climbs slowly spends
   * the whole spike looking at a bank — and down at a stroll, because a lens
   * that drops the moment the line clears bobs over every hummock the car
   * rolls behind. */
  rise: 14,
  fall: 2.5,
  /** The blend back into the driving rig, s, once the hold is over. A roll
   * ends tens of metres from where the lens is standing, so this is a real
   * flight home rather than a fade — long enough that it reads as one. */
  handOver: 0.9,
  /** A jump in the car's position this shot cannot follow, m in one frame —
   * a respawn, or a spectator's lens changing crew. Nothing a car does under
   * its own power comes near it: a frame at 200 km/h is under a metre. */
  teleport: 20,
};

/** Smoothstep — the same easing the other two planted shots run on. */
function ease(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export type RollCamera = {
  /** Whether the shot owns the frame: the car is going over, or it has come
   * to rest and the beat afterwards has not run out. Read before `fly`, and
   * it changes nothing. */
  watching: (state: GameState) => boolean;
  /** Fly the shot for this frame, over whatever the driving rig has already
   * written into `camera` — the caller stands the rig FIRST, and the pose it
   * leaves is what the hand-back blends into. `clearance` is how far the
   * lens may never sink below the ground under it, the chase rigs' own
   * number. Returns the design fov for this frame. */
  fly: (
    camera: THREE.PerspectiveCamera,
    state: GameState,
    drivingFov: number,
    clearance: number,
    dt: number,
  ) => number;
  /** How far the hand-back has got, 0..1 — 0 while the shot owns the frame
   * outright, 1 on the frame the rig takes it back. The lens's own ceilings
   * ride it across, exactly as they ride a change of seat. */
  at: () => number;
  /** Drop the plant. Called when the run the shot belongs to is not the run
   * on the screen any more (a new stage, a change of crew), and by the shot
   * itself the moment it is finished. */
  reset: () => void;
};

export function createRollCamera(): RollCamera {
  /** Where the camera stood as the car went over, which way "back" is from
   * there, and how fast it was travelling. Null until it plants. */
  let planted: {
    x: number;
    y: number;
    z: number;
    back: THREE.Vector3;
    vx: number;
    vz: number;
    dist: number;
  } | null = null;
  /** Seconds since the plant — the settle and the coast run off it. */
  let stood = 0;
  /** Seconds since the roll stopped, and where the car was last frame: the
   * hold runs off the first, the teleport guard off the second. */
  let rested = 0;
  let hand = 0;
  /** The shot's OWN lens, degrees — eased from the one the rig was driving
   * with toward the long one. Carried here rather than handed back and forth
   * through the caller: the rig underneath is still stretching its own fov
   * with the car's speed every frame, and a shot easing off THAT number
   * never arrives anywhere. */
  let lens = 0;
  /** How far the operator has climbed to keep the car in sight, m, and how
   * far they have stepped out to do it. Both rate-limited, so they are a
   * person moving rather than a solve landing. */
  let climbed = 0;
  let stepped = 0;
  const was = new THREE.Vector3();
  const aim = new THREE.Vector3();

  const reset = (): void => {
    planted = null;
    stood = 0;
    rested = 0;
    hand = 0;
    lens = 0;
    climbed = 0;
    stepped = 0;
  };

  return {
    at: () => hand,
    reset,
    watching: (state) =>
      state.car.rolling || (planted !== null && rested < TUNING.air.roll.lieFor + ROLL.handOver),
    fly: (camera, state, drivingFov, clearance, dt) => {
      const car = state.car;
      if (!planted) {
        // Behind the camera along its own view axis, flattened: which way
        // "back" is without assuming the lens was ever facing down the road,
        // and without a top-down rig stepping back into the sky.
        const back = new THREE.Vector3();
        camera.getWorldDirection(back);
        back.y = 0;
        if (back.lengthSq() < 1e-6) back.set(0, 0, 1);
        back.normalize().negate();
        const sinH = Math.sin(car.heading);
        const cosH = Math.cos(car.heading);
        planted = {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          back,
          vx: car.u * sinH + car.w * cosH,
          vz: car.u * cosH - car.w * sinH,
          dist: Math.hypot(camera.position.x - car.x, camera.position.z - car.z),
        };
        aim.set(car.x, car.y + ROLL.aimUp, car.z);
        was.set(car.x, car.y, car.z);
        lens = drivingFov;
      }
      // A jump no pan can cross: the crew have been put back at the last
      // split board, and there is nothing left on this piece of road to
      // watch. The rig already holds this frame's pose, so handing it back
      // is a matter of not touching it.
      if (Math.hypot(car.x - was.x, car.z - was.z) > ROLL.teleport) {
        reset();
        return drivingFov;
      }
      was.set(car.x, car.y, car.z);
      stood += dt;
      rested = car.rolling ? 0 : rested + dt;
      hand = ease((rested - TUNING.air.roll.lieFor) / ROLL.handOver);
      if (hand >= 1) {
        reset();
        return drivingFov;
      }

      // THE STAND: the coast the plant kept, run down; the step back to a
      // standoff (the whole of the coast included, or the shot spends its
      // standoff chasing the car); and the rise onto the operator's feet.
      const settled = ease(stood / ROLL.settle);
      const run = ROLL.carry * ROLL.coast * (1 - Math.exp(-stood / ROLL.coast));
      const step = Math.max(0, ROLL.standoff - planted.dist) * settled;
      // ...and then the peek: out toward the car by whatever the last look
      // along the sight line asked for, which is what a bank in the way buys
      // over a climb alone.
      const toCar = new THREE.Vector2(car.x, car.z);
      let px = planted.x + planted.vx * run + planted.back.x * step;
      let pz = planted.z + planted.vz * run + planted.back.z * step;
      const out = toCar.sub(new THREE.Vector2(px, pz));
      if (out.lengthSq() > 1e-6) {
        out.normalize();
        px += out.x * stepped;
        pz += out.y * stepped;
      }
      const floor = state.terrain.groundAt(px, pz) + clearance;
      const stand = Math.max(planted.y + ROLL.lift * settled, floor);
      const py = Math.max(stand + climbed, floor);
      // WHAT IS IN THE WAY. The sight line walked from the lens to the roof
      // of the car: at each place along it, the height the lens would have
      // to be standing at for the line to clear the ground there. The worst
      // of those is what the operator has to climb to see the accident.
      const top = car.y + ROLL.aimUp;
      let need = stand;
      for (let i = 1; i < ROLL.look; i++) {
        const t = i / ROLL.look;
        // The air asked for over the ground FADES toward the car: the car is
        // standing on that ground, so a metre of clearance demanded at its
        // own feet is a metre no lens can ever have, and asking for it lifts
        // the camera off a dead flat field.
        const ridge = state.terrain.groundAt(px + (car.x - px) * t, pz + (car.z - pz) * t);
        const want = (ridge + ROLL.clear * (1 - t) - top * t) / (1 - t);
        if (want > need) need = want;
      }
      const wantClimb = clamp(need - stand, 0, ROLL.climb);
      climbed += clamp(wantClimb - climbed, -ROLL.fall * dt, ROLL.rise * dt);
      const wantStep = clamp(wantClimb * ROLL.stepIn, 0, ROLL.stepInMax);
      stepped += clamp(wantStep - stepped, -ROLL.fall * dt, ROLL.rise * dt);

      // Where the driving rig would have had the lens, kept before the shot
      // writes over it: the hand-back flies to that pose rather than to a
      // point in the world, so the last blended frame and the first driven
      // one are the same frame in aim as well as position.
      const seat = camera.position.clone();
      const driving = camera.quaternion.clone();
      camera.position.set(px, py, pz).lerp(seat, hand);
      // THE PAN, lagging — and then pulled back in if the lag has let the
      // car drift toward the edge of a frame the zoom has been tightening
      // underneath it. A cap in metres at the car's own distance is the same
      // thing as a cap in degrees, and it is what the aim is measured in.
      const follow = clamp(ROLL.pan * dt, 0, 1);
      aim.x += (car.x - aim.x) * follow;
      aim.y += (car.y + ROLL.aimUp - aim.y) * follow;
      aim.z += (car.z - aim.z) * follow;
      const range = Math.hypot(car.x - px, car.y - py, car.z - pz);
      const lag = Math.hypot(aim.x - car.x, aim.y - top, aim.z - car.z);
      const most = Math.tan(Math.min(ROLL.lead, ((lens * Math.PI) / 360) * 0.5)) * range;
      if (lag > most) {
        const pull = most / lag;
        aim.set(
          car.x + (aim.x - car.x) * pull,
          top + (aim.y - top) * pull,
          car.z + (aim.z - car.z) * pull,
        );
      }
      camera.lookAt(aim);
      camera.quaternion.slerp(driving, hand);
      // THE ZOOM: the lens that puts `frame` metres across the picture at the
      // car's distance, which is the same car-sized subject however far it
      // has got.
      const want = clamp(
        (2 * Math.atan(ROLL.frame / (2 * Math.max(1, range))) * 180) / Math.PI,
        ROLL.fovMin,
        ROLL.fovMax,
      );
      lens += (want - lens) * clamp(ROLL.zoom * dt, 0, 1);
      return lens * (1 - hand) + drivingFov * hand;
    },
  };
}

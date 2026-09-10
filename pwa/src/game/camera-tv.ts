// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TV CAM — the stage as a broadcast rather than as a drive.
//
// Every other camera in the game is hung off the car. This one is not: it is
// a GALLERY of tripods stood along the road before the run starts, and the
// only thing that happens while the car drives is that the director cuts
// from one of them to the next. Nothing follows the car. The car arrives.
//
// Three decisions make it read as television instead of as a security feed:
//
//   THE STANDS ARE WHERE A CREW WOULD ACTUALLY PUT THEM, WHICH IS THE EXIT.
//   Every stand is on the OUTSIDE of the bend — the side the crowd is not on
//   — and the outside is where the car comes CLOSE twice: going in, and
//   coming out running wide. Those two are not the same shot. Going in, the
//   car is still gripped: the slide has not built, and a lens there
//   photographs a car driving straight at it. Coming out it is fully crossed
//   up, on the power, and travelling sideways toward the outside edge the
//   camera is standing on — so it arrives already drifting and puts its
//   rooster tail on the glass. That is why the exit stand is the one EVERY
//   corner gets, and why a long enough bend also earns one a third of the
//   way through it, where the angle is on and there is corner left to watch.
//   A jump lip gets a stand beside the landing.
//
//   THE OPERATOR IS SLOW. The pan lags the car (`pan`), so the car leads the
//   frame going past and the camera catches up after it — which is what a
//   human on a tripod does and what a tracking rig never does. The lens
//   breathes with the distance too, long when the car is a speck up the road
//   and wide open as it arrives, so a stand two hundred metres back is still
//   a shot of a car rather than a shot of a valley.
//
//   THE CAR COMES AT THE LENS. A stand is live for the whole APPROACH to it
//   and lets go almost the moment the car is past (`hold`), so what the shot
//   is made of is a car arriving — growing in the frame, turning in, and
//   throwing its dirt at the glass as it goes by — and never a car receding
//   up the road with its tail lights on. It is the difference between a
//   broadcast camera and a security one, and it is one number.
//
// ALL THREE ARE CHOICES MADE FOR AN AUDIENCE, WHICH IS WHY NOBODY DRIVES FROM
// IT. A shot framed on the corner the car is arriving at is a shot with the
// road beyond it off the frame, and the cut to the next stand lands at the
// moment the driver most needs to already be reading it. So this camera is
// off the ladder the camera key walks in a run and off the options page
// (`PLAY_CAMERAS` in settings.ts), and reachable in the two places nobody is
// steering: a REPLAY, which opens on it and walks back onto it with the
// camera key (`WATCHING_CAMERAS`), and a scripted shot pinning it with
// `?camera=tv` — it is the shot the screenshot harness stages a drift into.

import * as THREE from "three";
import { clamp } from "../lib/angles.ts";
import { groundOver } from "./camera-ground.ts";
import type { GameState, Track } from "@engine";

/** The whole camera, as numbers. Metres, seconds and degrees. */
export const TV = {
  /** Curvature a bend has to reach before it is a CORNER worth a camera,
   * 1/m — a 70 m radius, which is about where a car has to be placed rather
   * than merely aimed. Once a run has started it is held down to `release`
   * of that, so the exit of a corner opening out is still the same corner
   * and not the start of a new one. */
  corner: 1 / 70,
  release: 0.45,
  /** Arc a bend must hold before it counts, m, and the arc past which it is
   * long enough to deserve a second stand at its exit. */
  runMin: 24,
  runLong: 60,
  /** Where a long corner's SECOND stand goes: this share of the way through
   * the bend, capped at `midMax` metres in. Deliberately not at the turn-in.
   * A slide takes a second or so to build, so a lens at the turn-in is a lens
   * photographing a car that is still gripped and still pointed where it is
   * going — and the whole reason to stand beside a corner is to see a car
   * that is not. A third of the way in, the angle is on. */
  midShare: 1 / 3,
  midMax: 70,
  /** How far past the corner's release the EXIT stand sits, m — the primary
   * stand, and the one every corner gets. Far enough out that the car has
   * finished the bend and is running wide onto the outside edge the camera
   * stands on, close enough that it is still sideways when it arrives. */
  exitPast: 24,
  /** ...and how far past a jump lip the landing stand sits, m. */
  jumpPast: 26,
  /** How far beyond the road's own edge a tripod stands, m. Close: the
   * whole point of the outside of a corner is the dirt, and dirt does not
   * carry. Far enough that the car goes past the lens rather than through
   * it. */
  setback: 4.2,
  /** How high the lens is held over the ground it stands on, m, and the band
   * over the ROAD's crown it is kept inside whatever that ground does — a
   * stand on the outside of a corner cut into a hillside is as often metres
   * below the road as metres above it, and neither is a tripod. */
  lift: 1.9,
  overRoad: 1.2,
  /** ...and the CEILING on the same thing, m. The floor stops a stand on the
   * low side of a shelf from filming a bank; without a ceiling the stand on
   * the HIGH side climbs it instead, and a lens six metres over the road is
   * a crane looking down on a car rather than a tripod a car goes past. An
   * operator on a bank stands part-way down it, which is what this is. Kept
   * above head height so the shot still clears the verge. */
  overRoadMax: 2.6,
  /** How close two stands may be, m, and the gap past which a stretch gets
   * a plain roadside camera whether or not it bends. The second is what
   * keeps a long straight — or a synthetic test rig with no corners in it
   * at all — from leaving the director with nothing to cut to. */
  minGap: 90,
  maxGap: 260,
  /** How much road either GATE keeps to itself, m. The start line and the
   * finish are the two places on a stage that are already built: a gantry
   * over the road, its posts either side of it, the boards and the barriers
   * around them. A tripod planted in that is a tripod looking at the back of
   * a post — and the start is exactly where the gap filler wants to plant
   * one, because the run-up bends nowhere and earns nothing. Nobody puts a
   * broadcast camera inside the arch; the first stand is past it.
   *
   * Big enough to clear the furniture and no bigger, so the shot of a mass
   * start still has the grid in it: at three and a half seconds off the line
   * a car is about this far down the road. */
  gateClear: 45,
  /** How far past a stand the car travels before the cut, m — half a second
   * of rally pace, and deliberately the smallest number that still reads as
   * a cut rather than a flinch.
   *
   * THIS IS THE KNOB THE WHOLE CAMERA TURNS ON. A stand is chosen by being
   * the next one the car has not passed, so this number is the only part of
   * a stand's window spent watching the car GO. Anything generous here — a
   * second and a half was tried — spends half of every shot on a departing
   * car photographed from behind, which is the one thing a trackside camera
   * is not for: the dust is thrown AWAY from a lens the car has passed, and
   * at the lens it is coming at. Short, and the approach is the shot. */
  hold: 14,
  /** How fast the aim follows the car, 1/s. Loose on purpose. */
  pan: 5.5,
  /** How far over the car's own height the aim sits, m. */
  aimUp: 0.9,
  /** THE ZOOM, which is most of what makes this camera read as television.
   *
   * `frame` is the width of world the lens tries to cover at the car, m, and
   * everything else follows from holding it: far away the shot is a long
   * lens, and as the car closes the operator has to open right up to keep it
   * in — then goes long again behind it. That whole gesture is one number
   * and a range, and it costs nothing to compute.
   *
   * The width is a decision about the CAR's size in shot, so it is sized to
   * the car: about four times a rally car's length, which puts it a quarter
   * of the frame across at the distance the operator is holding. Sized to
   * the ROAD instead — a comfortable thirty-odd metres — a car a hundred
   * metres up the stage is four pixels and the shot is a picture of a
   * valley.
   *
   * `fovMin` is what lets the long end actually be long. It is the ceiling
   * on the zoom, not a safety rail: at 24° a car two hundred metres out is
   * still a speck, and the whole drama of a trackside shot is a dot on the
   * horizon that becomes a car. `fovMax` is the other end, and it is wide
   * enough that a car passing six metres away is still inside the frame
   * rather than cropped to a wheel arch. */
  frame: 18,
  fovMin: 9,
  fovMax: 66,
  /** How fast the lens works, 1/s.
   *
   * Slower than the pan, and deliberately not fast enough to keep up. A car
   * closing at thirty metres a second walks the solved fov faster than any
   * hand on a barrel, so the lens is always a little behind: it is still
   * long as the car arrives, which is what makes the arrival read as sudden,
   * and it is still wide for a beat after the car has gone, which is the
   * operator catching up. A zoom that tracked the solve exactly would be a
   * rubber band with a car in it. */
  zoom: 3.2,
};

/** One tripod. Fixed for the life of the stage — nothing here moves. */
type TvStand = {
  /** Arc along the stage the stand is planted at, m: what the director
   * compares the car against, and the order the gallery is kept in. */
  s: number;
  x: number;
  y: number;
  z: number;
};

/** Which way is RIGHT of a heading, as the rest of the renderer reads it:
 * forward is (sin h, cos h), so right is its derivative in h. A positive
 * curvature turns toward it, which is why `-sign(curvature)` is the outside
 * of a bend. */
function rightOf(heading: number): [number, number] {
  return [Math.cos(heading), -Math.sin(heading)];
}

/** Plant one stand beside sample `index`, `side` metres of road-edge out
 * (+1 right of travel, -1 left). Returns null where the index is off the
 * end of the samples built so far — an endless stage is asked for road it
 * has not streamed yet on nearly every corner it finds. */
function standAt(state: GameState, index: number, side: number): TvStand | null {
  const track = state.track;
  const samples = track.samples;
  if (index < 0 || index >= samples.length) return null;
  const sample = samples[index];
  // Never inside a gate's own structure (`gateClear`). The finish is checked
  // against `finishS` rather than the last sample, because R25 carries road
  // on past the gate for the car to coast down and a camera IS wanted out
  // there — it is the arch itself that has no room beside it.
  if (sample.s < TV.gateClear) return null;
  if (track.finishS !== null && Math.abs(sample.s - track.finishS) < TV.gateClear) return null;
  const [rx, rz] = rightOf(sample.heading);
  const out = sample.width / 2 + TV.setback;
  const x = sample.x + rx * out * side;
  const z = sample.z + rz * out * side;
  // The ground the tripod stands on, read over a footprint rather than
  // under a point for the reason every outside camera reads it that way
  // (camera-ground.ts) — and floored against the road, so a stand on the
  // low side of a shelf is still looking at the road rather than up at it.
  const y = Math.min(
    Math.max(groundOver(state, x, z) + TV.lift, sample.elevation + TV.overRoad),
    sample.elevation + TV.overRoadMax,
  );
  return { s: sample.s, x, y, z };
}

/** The sample nearest an arc position, by search rather than by dividing
 * through `track.step` — the gap filler is the only caller and it would
 * rather ask than assume the samples are evenly spaced. */
function indexAtS(track: Track, s: number): number {
  const samples = track.samples;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Walk `[from, samples.length)` and plant the gallery over it, appending to
 * `stands` in stage order.
 *
 * On an endless stage this is called again for each new kilometre as it
 * streams, and the bend the walk was in the middle of when it ran out of road
 * is forgotten between calls — that corner gets no stand of its own. It is
 * left that way deliberately: carrying the run across would mean carrying it
 * across a re-plan too, and the gap filler already puts a camera on any
 * stretch that earned nothing.
 *
 * Two passes over one stretch of road, because the stands are FOUND out of
 * order and have to be KEPT in order. The first pass reads the road: a bend
 * is watched until it lets go, and only then — when its arc is known — is it
 * worth an entry stand, an exit stand, both or neither; a jump lip is worth
 * one either way. The second walks what came back in stage order, drops
 * anything crowding its neighbour, and fills any stretch that earned nothing
 * with a plain roadside camera. Without that last rule a long straight — or
 * a synthetic test rig with no corners in it at all — leaves the director
 * with nothing to cut to.
 */
function planStands(state: GameState, from: number, stands: TvStand[]): number {
  const track = state.track;
  const samples = track.samples;
  const step = Math.max(1e-3, track.step);
  const found: TvStand[] = [];
  const add = (stand: TvStand | null): void => {
    if (stand) found.push(stand);
  };
  /** Where the bend under the cursor started, and which way it goes; null on
   * straight road. */
  let run: { at: number; sign: number } | null = null;
  for (let i = from; i < samples.length; i += 1) {
    const sample = samples[i];
    const k = sample.curvature;
    const sign = Math.sign(k);
    if (run && (sign !== run.sign || Math.abs(k) < TV.corner * TV.release)) {
      const held = sample.s - samples[run.at].s;
      // Planted on the OUTSIDE — away from where the crowd stands, and into
      // the path of everything the outside rear throws. A long bend earns a
      // stand partway through it as well; the EXIT is the one every corner
      // gets, because that is where a car arrives already sideways.
      if (held >= TV.runLong) {
        const into = Math.min(held * TV.midShare, TV.midMax);
        add(standAt(state, run.at + Math.round(into / step), -run.sign));
      }
      if (held >= TV.runMin) add(standAt(state, i + Math.round(TV.exitPast / step), -run.sign));
      run = null;
    }
    if (!run && Math.abs(k) >= TV.corner) run = { at: i, sign };
    // A jump is its own kind of camera: beside the landing, with the car
    // coming over the lip at it.
    if (sample.jump) add(standAt(state, i + Math.round(TV.jumpPast / step), i % 2 === 0 ? 1 : -1));
  }

  found.sort((a, b) => a.s - b.s);
  let lastS = stands.length > 0 ? stands[stands.length - 1].s : -Infinity;
  const keep = (stand: TvStand | null): void => {
    if (!stand || stand.s - lastS < TV.minGap) return;
    // A stand found back down the road from one already planted is a stand
    // out of order, and the director walks the gallery forwards.
    if (stands.length > 0 && stand.s < stands[stands.length - 1].s) return;
    stands.push(stand);
    lastS = stand.s;
  };
  const fillTo = (s: number): void => {
    if (!Number.isFinite(lastS)) return;
    let want = lastS + TV.maxGap;
    while (want <= s) {
      const before = lastS;
      const at = indexAtS(track, want);
      keep(standAt(state, at, at % 2 === 0 ? -1 : 1));
      // The road can REFUSE a filler — inside a gate's own furniture, off
      // the end of the samples, too near what is already planted — and the
      // answer is to probe on rather than to give up on the stretch. A
      // straight stage asks for its first camera at the start line, where
      // the gate refuses it; a filler that stopped there would leave the
      // whole opening kilometre with nothing to cut to. Either way `want`
      // grows by at least a gap each pass, so this always ends.
      want = lastS > before ? lastS + TV.maxGap : want + TV.minGap;
    }
  };
  const first = samples[from];
  if (!Number.isFinite(lastS) && first) lastS = first.s - TV.maxGap;
  for (const stand of found) {
    fillTo(stand.s);
    keep(stand);
  }
  const last = samples[samples.length - 1];
  if (last) fillTo(last.s);
  return samples.length;
}

export type TvCamera = {
  /** Stand the gallery for this frame and cut to whichever tripod owns the
   * car. Returns the design fov (horizontal reference) the shot wants. */
  update: (camera: THREE.PerspectiveCamera, state: GameState, dt: number) => number;
  /** How far the live stand is from the car, m — the distance the shot is
   * FOCUSED at (camera-tv-lens.ts). Stated here rather than measured again
   * by the renderer because this is the range the lens already solved its
   * own zoom from, and a focus worked out from a slightly different point
   * would put the sharp plane somewhere the operator did not choose. */
  focus: () => number;
};

export function createTvCamera(): TvCamera {
  /** The stage the gallery belongs to, and how much of it has been walked.
   * An endless stage grows its samples and never prunes them, so the mark
   * is an index and the walk resumes from it. */
  let plannedFor: Track | null = null;
  let planned = 0;
  let stands: TvStand[] = [];
  /** Which tripod is live, and the aim and the lens it is holding. Both are
   * SNAPPED on a cut and eased the rest of the time: a cut is a new camera,
   * and easing across one would fly the lens down the road between two
   * stands a hundred metres apart. */
  let live = -1;
  const aim = new THREE.Vector3();
  let fov = TV.fovMax;
  /** The range the last frame was solved at, m — the zoom's input and the
   * lens's focal distance, which are the same number by construction. */
  let range = 50;

  return {
    focus: () => range,
    update: (camera, state, dt) => {
      const track = state.track;
      if (track !== plannedFor) {
        plannedFor = track;
        stands = [];
        planned = 0;
        live = -1;
      }
      if (planned < track.samples.length) planned = planStands(state, planned, stands);

      const car = state.car;
      // Where the car is along the stage. `nearIndex` is the sample it is
      // actually nearest to rather than how far the run has got, which is
      // the honest one here: a car that has spun back down the road is
      // filmed by the camera it is in front of, not by the one it earned.
      const here = track.samples[Math.min(state.nearIndex, track.samples.length - 1)];
      const s = here?.s ?? 0;
      // The director's whole rule: the first tripod the car is not yet
      // `hold` metres past — so the live stand is nearly always one the car
      // is coming TOWARD. Everything else falls out of it: the car arriving
      // out of the distance, the cut landing as it goes by, and a circuit
      // re-using the same gallery on every lap.
      let next = stands.findIndex((stand) => stand.s + TV.hold >= s);
      if (next < 0) next = stands.length - 1;
      if (next < 0) {
        // No gallery at all, which is a stage with no samples under the
        // car yet. Leave the lens wherever it was rather than pointing it
        // at the origin.
        return fov;
      }

      const stand = stands[next];
      const cut = next !== live;
      live = next;
      camera.position.set(stand.x, stand.y, stand.z);

      const targetX = car.x;
      const targetY = car.y + TV.aimUp;
      const targetZ = car.z;
      if (cut) aim.set(targetX, targetY, targetZ);
      else {
        const follow = clamp(TV.pan * dt, 0, 1);
        aim.x += (targetX - aim.x) * follow;
        aim.y += (targetY - aim.y) * follow;
        aim.z += (targetZ - aim.z) * follow;
      }
      camera.lookAt(aim);

      // The lens, solved from how far away the car is so that it fills about
      // `frame` of world however far up the road it is. Clamped at both ends:
      // wider than `fovMax` is a fish-eye of a car going past a hedge, and
      // longer than `fovMin` is a shot nobody can tell is moving.
      const dx = targetX - stand.x;
      const dy = targetY - stand.y;
      const dz = targetZ - stand.z;
      range = Math.max(4, Math.hypot(dx, dy, dz));
      const want = clamp(
        (2 * Math.atan(TV.frame / (2 * range)) * 180) / Math.PI,
        TV.fovMin,
        TV.fovMax,
      );
      fov = cut ? want : fov + (want - fov) * clamp(TV.zoom * dt, 0, 1);
      return fov;
    },
  };
}

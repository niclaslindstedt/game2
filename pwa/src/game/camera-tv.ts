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
//   THE STANDS ARE WHERE A CREW WOULD ACTUALLY PUT THEM. A corner is worth a
//   camera and a straight is not, so the walk in `planStands` places one just
//   inside the turn-in of every corner it finds, on the OUTSIDE of the bend —
//   the side the crowd is not on, and the side the car is thrown toward. A
//   car turning in on the limit comes at that lens and then goes sideways
//   across it, close enough that the rooster tail off the outside rear lands
//   on the glass. A long corner gets a second stand past its exit, because
//   the shot of a car coming OUT of a bend under power is a different shot
//   from the one of it going in; a jump lip gets one beside the landing.
//
//   THE OPERATOR IS SLOW. The pan lags the car (`pan`), so the car leads the
//   frame going past and the camera catches up after it — which is what a
//   human on a tripod does and what a tracking rig never does. The lens
//   breathes with the distance too, long when the car is a speck up the road
//   and wide open as it arrives, so a stand two hundred metres back is still
//   a shot of a car rather than a shot of a valley.
//
//   THE CUT IS LATE. The director does not cut when the car reaches the next
//   camera; it cuts once the car is `hold` metres PAST the current one, so
//   every stand keeps the car for a beat as it goes away. Cutting on arrival
//   would mean never once seeing a car leave.
//
// It is a camera on the ladder, not a replay mode: the camera key reaches it
// and a stage can be driven from it, the way a top-down view can be driven
// from. It is also the shot the screenshot harness stages a drift into.

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
  /** How far INTO the corner from the turn-in the entry stand sits, m. Not
   * at the turn-in itself: a few metres in is where the car is nearest the
   * outside edge with the slide already started, which is the frame the
   * shot exists for. */
  entryInto: 12,
  /** ...and how far past the corner's end the exit stand sits, and how far
   * past a jump lip the landing stand sits. */
  exitPast: 20,
  jumpPast: 26,
  /** How far beyond the road's own edge a tripod stands, m. Close: the
   * whole point of the outside of a corner is the dirt, and dirt does not
   * carry. Far enough that the car goes past the lens rather than through
   * it. */
  setback: 4.2,
  /** How high the lens is held over the ground it stands on, m, and how far
   * over the ROAD's crown it is never allowed to fall — a stand on the
   * outside of a corner cut into a hillside is often on ground metres below
   * the road, and a lens down there is filming a bank. */
  lift: 1.9,
  overRoad: 1.2,
  /** How close two stands may be, m, and the gap past which a stretch gets
   * a plain roadside camera whether or not it bends. The second is what
   * keeps a long straight — or a synthetic test rig with no corners in it
   * at all — from leaving the director with nothing to cut to. */
  minGap: 90,
  maxGap: 260,
  /** How far past a stand the car travels before the cut, m. About a second
   * and a half of rally pace: enough to watch a car leave, short enough
   * that the next stand still has the car coming toward it. */
  hold: 55,
  /** How fast the aim follows the car, 1/s. Loose on purpose. */
  pan: 5.5,
  /** How far over the car's own height the aim sits, m. */
  aimUp: 0.9,
  /** The width of world the lens tries to cover at the car, m, and the
   * band it may solve that within, deg. `frame` is what makes the zoom a
   * decision about the CAR's size in shot rather than about distance. */
  frame: 34,
  fovMin: 24,
  fovMax: 62,
  /** How fast the lens works, 1/s. Slower than the pan: a zoom that kept up
   * with the closing rate of a rally car would be a rubber band. */
  zoom: 2.6,
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
  const samples = state.track.samples;
  if (index < 0 || index >= samples.length) return null;
  const sample = samples[index];
  const [rx, rz] = rightOf(sample.heading);
  const out = sample.width / 2 + TV.setback;
  const x = sample.x + rx * out * side;
  const z = sample.z + rz * out * side;
  // The ground the tripod stands on, read over a footprint rather than
  // under a point for the reason every outside camera reads it that way
  // (camera-ground.ts) — and floored against the road, so a stand on the
  // low side of a shelf is still looking at the road rather than up at it.
  const y = Math.max(groundOver(state, x, z) + TV.lift, sample.elevation + TV.overRoad);
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
      // the path of everything the outside rear throws. A long corner earns
      // the exit as well: a car coming out under power is not the same
      // picture as a car going in on the brakes.
      if (held >= TV.runMin)
        add(standAt(state, run.at + Math.round(TV.entryInto / step), -run.sign));
      if (held >= TV.runLong) add(standAt(state, i + Math.round(TV.exitPast / step), -run.sign));
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
    while (Number.isFinite(lastS) && s - lastS > TV.maxGap) {
      const at = indexAtS(track, lastS + TV.maxGap);
      const before = lastS;
      keep(standAt(state, at, at % 2 === 0 ? -1 : 1));
      // The road can refuse a filler — off the end of the samples, or too
      // near what is already there — and a `while` that trusted it not to
      // would spin forever on the stage that does.
      if (lastS === before) break;
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

  return {
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
      // `hold` metres past. Everything else — the late cut, the car
      // arriving from a distance, a circuit re-using the same gallery on
      // every lap — falls out of it.
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
      const range = Math.max(4, Math.hypot(dx, dy, dz));
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

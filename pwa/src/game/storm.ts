// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELECTRICS — lightning, and the thunder that arrives after it.
//
// A storm is not a light that blinks on a timer. Four things separate one
// that reads as weather from one that reads as a screen effect, and all
// four are cheap:
//
//   IT COMES IN CELLS. Real storms pulse: a run of strikes a few seconds
//   apart while the cell is overhead, then a minute of nothing. The
//   intervals are drawn from a rate that itself breathes, so the quiet
//   stretches are what make the next crack land.
//
//   IT FLICKERS. A flash is not one pulse. A cloud-to-ground strike is
//   several RETURN STROKES down the same channel, tens of milliseconds
//   apart — that stutter IS what lightning looks like, and a single smooth
//   decay is the clearest tell that a flash was drawn rather than struck.
//
//   IT HAS A DISTANCE, and the distance decides everything else: how bright
//   the flash is, whether there is a visible channel at all or only the
//   cloud lighting up from inside, and — the one nobody fakes — HOW LONG
//   THE SOUND TAKES TO ARRIVE. Sound covers about 343 m/s, so a strike two
//   kilometres out is six seconds of silence and then a roll. Counting the
//   gap is a thing every player has done since they were a child, and
//   getting it right is most of what makes a storm feel like a place.
//
//   IT IS HEARD DIFFERENTLY NEAR AND FAR. A close strike is a crack: a
//   broadband rip with a body behind it. A distant one has had its
//   transient smeared out by kilometres of air and ground reflection, and
//   arrives as a low roll with no attack in it at all.
//
// Presentation only: nothing here is read by the engine, so its randomness
// is its own and can never desync a replay.

import * as THREE from "three";

import type { Preset } from "./sky.ts";
import { glowTexture } from "./textures.ts";
import type { Clap } from "./weather.ts";

/** How fast sound goes, m/s — the whole reason thunder lags its flash. */
const SOUND_SPEED = 343;

/** How far a strike can be and still be part of this storm, m. Past the
 * far end the flash is under the horizon and the sound never arrives. */
const NEAR = 220;
const FAR = 9000;

/** Inside this a strike has a visible channel; past it the cloud simply
 * lights up from within, which is what sheet lightning is. */
const CHANNEL_RANGE = 2600;

/** How far out a channel is actually DRAWN, m. A strike beyond this is
 * still drawn here, thinner and dimmer, because the sky dome is only
 * hundreds of metres across and a bolt placed at its true distance would be
 * outside the world the camera can see. */
const CHANNEL_DRAW_MAX = 820;

/** Peak strike rate, strikes/s, at full power with the cell overhead —
 * about twenty a minute, which is an active storm directly above. */
const PEAK_RATE = 0.34;
/** Bounds on the gap between strikes, s. The floor keeps a burst from
 * becoming a strobe; the ceiling keeps a quiet cell from feeling broken. */
const GAP = { min: 0.7, max: 34 };

/** How fast a stroke's light falls, 1/s — and the slower fall of the
 * afterglow once the last stroke has gone down the channel. */
const STROKE_DECAY = 11;
const GLOW_DECAY = 3.4;
/** Reduced motion keeps the storm and takes away the strobe: one soft
 * pulse per strike, at a fraction of the level, decaying slowly. */
const CALM = { peak: 0.28, decay: 1.8 };

/** How many claps can be in the air at once. At the peak rate the far end
 * of the range is half a minute of flight time, so several genuinely are. */
const MAX_PENDING = 8;

/** The channel's own shape. */
const STEPS = 16;
/** Segments the ribbon can hold — the trunk plus its forks. */
const MAX_SEGMENTS = 44;

export type Storm = {
  /** Everything drawn, for the camera-riding group to adopt. */
  group: THREE.Group;
  /** Arm the storm for these conditions; a sky with no thunder in it
   * silences and hides the whole system. */
  apply: (p: Preset) => void;
  update: (dt: number, camera: THREE.Camera) => void;
  /** The light a strike is putting on the world right now, 0..1. */
  surge: () => number;
  /** …and the direction it is arriving from, while it lasts. */
  from: () => THREE.Vector3;
  setVisible: (show: boolean) => void;
  dispose: () => void;
};

export function createStorm(onThunder: (clap: Clap) => void): Storm {
  const group = new THREE.Group();
  const glowMap = glowTexture();

  // The bloom: the cloud itself lit from inside. Every strike has one —
  // it is the only thing a distant one has.
  const bloomMat = new THREE.MeshBasicMaterial({
    map: glowMap,
    transparent: true,
    opacity: 0,
    color: 0xdce8ff,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bloom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bloomMat);
  bloom.renderOrder = -2;
  bloom.visible = false;
  group.add(bloom);

  // The channel: a ribbon of camera-facing quads down a jagged path, with
  // a couple of forks off it. Built once at full size and rewritten per
  // strike — a bolt lasts a fifth of a second and allocating one would put
  // a collection inside the flash.
  const boltPos = new Float32Array(MAX_SEGMENTS * 6 * 3);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute("position", new THREE.BufferAttribute(boltPos, 3));
  const boltMat = new THREE.MeshBasicMaterial({
    color: 0xf2f6ff,
    transparent: true,
    opacity: 0,
    fog: false,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.renderOrder = -1;
  bolt.frustumCulled = false;
  bolt.visible = false;
  group.add(bolt);

  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** How electric the sky is, 0..1 — 0 turns the whole system off. */
  let power = 0;
  /** How high the cloud base is, m: where a channel starts. */
  let ceiling = 200;
  /** Seconds of storm, for the cell's own slow breathing. */
  let clock = 0;
  let nextStrike = 0;

  /** The flash, and what is left of the strike it belongs to. */
  let flash = 0;
  let strokesLeft = 0;
  let strokeIn = 0;
  let strokePeak = 0;
  const fromDir = new THREE.Vector3(0, 1, 0);

  /** Claps in flight: how long each still has to travel, and what it will
   * sound like when it lands. Written as a plain array with a live length
   * because it is walked every frame and is never longer than a handful. */
  const pending: { in: number; clap: Clap }[] = [];

  /**
   * HOW BUSY THE CELL IS RIGHT NOW, 0..1.
   *
   * Two slow oscillators at unrelated periods, so the storm never settles
   * into a rhythm the player can predict — one carries the cell arriving
   * and passing (about a minute and a half), the other the smaller lulls
   * inside it. Cubed, because a storm is quiet most of the time and then
   * very busy: a linear activity gives an even drizzle of flashes, which
   * is the same fault as a flash on a fixed timer.
   */
  const activity = (): number => {
    const slow = 0.5 + 0.5 * Math.sin(clock * 0.07);
    const fast = 0.5 + 0.5 * Math.sin(clock * 0.23 + 1.9);
    return Math.pow(0.65 * slow + 0.35 * fast, 3);
  };

  /** Lay out one channel from the cloud base to the ground, in the bolt's
   * own local frame: x across, y up, the ribbon facing -z. */
  const buildChannel = (width: number): void => {
    let seg = 0;
    const push = (x0: number, y0: number, x1: number, y1: number, half: number): void => {
      if (seg >= MAX_SEGMENTS) return;
      const i = seg++ * 18;
      // Two triangles: a quad from (x0,y0) to (x1,y1), `half` wide.
      const p = [
        x0 - half,
        y0,
        x0 + half,
        y0,
        x1 - half,
        y1,
        x1 - half,
        y1,
        x0 + half,
        y0,
        x1 + half,
        y1,
      ];
      for (let k = 0; k < 6; k++) {
        boltPos[i + k * 3] = p[k * 2];
        boltPos[i + k * 3 + 1] = p[k * 2 + 1];
        boltPos[i + k * 3 + 2] = 0;
      }
    };
    // The trunk. The channel wanders more the further it has fallen — a
    // leader steps toward the ground and each step is free to go anywhere,
    // so the spread grows with the distance travelled.
    const trunkX: number[] = [];
    const trunkY: number[] = [];
    let x = 0;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      trunkX.push(x);
      trunkY.push(ceiling * (1 - t) - 4 * t);
      x += (Math.random() * 2 - 1) * width * (2.5 + 9 * t);
    }
    for (let i = 0; i < STEPS; i++) {
      push(trunkX[i], trunkY[i], trunkX[i + 1], trunkY[i + 1], width * (1 - 0.45 * (i / STEPS)));
    }
    // …and the forks. A bolt without them is a scribbled line; two or
    // three dying branches are what make it read as electricity choosing
    // its way down.
    const forks = 2 + Math.floor(Math.random() * 2);
    for (let f = 0; f < forks; f++) {
      const at = 3 + Math.floor(Math.random() * (STEPS - 5));
      let fx = trunkX[at];
      let fy = trunkY[at];
      const lean = (Math.random() * 2 - 1) * width * 9;
      const life = 2 + Math.floor(Math.random() * 4);
      for (let s = 0; s < life; s++) {
        const nx = fx + lean + (Math.random() * 2 - 1) * width * 5;
        const ny = fy - ceiling / STEPS / (1 + s * 0.3);
        push(fx, fy, nx, ny, width * (0.5 - 0.08 * s));
        fx = nx;
        fy = ny;
      }
    }
    // Everything the strike did not use collapses to a point, which draws
    // nothing rather than leaving the last bolt's tail hanging in the sky.
    for (let i = seg * 18; i < boltPos.length; i++) boltPos[i] = 0;
    boltGeo.getAttribute("position").needsUpdate = true;
  };

  /** Put a strike in the sky, and a clap in the air behind it. */
  const strike = (): void => {
    const busy = activity();
    // Most flashes are somewhere out in the weather; a busy cell is the
    // one standing over the stage, so it brings them in.
    const reach = NEAR + (FAR - NEAR) * Math.pow(Math.random(), 1.9) * (1 - 0.5 * busy);
    const distance = Math.max(NEAR, reach);
    const azimuth = Math.random() * Math.PI * 2;
    const sin = Math.sin(azimuth);
    const cos = Math.cos(azimuth);
    // What the eye gets of a flash falls off with the air between, and it
    // saturates: everything inside a few hundred metres is simply as
    // bright as the screen goes.
    const bright = Math.min(1, 1.15 / (1 + Math.pow(distance / 900, 1.35)));
    fromDir.set(sin, 0.55, cos).normalize();

    strokePeak = bright;
    strokesLeft = reducedMotion ? 1 : 1 + Math.floor(Math.random() * 4);
    strokeIn = 0;

    if (distance < CHANNEL_RANGE) {
      const draw = Math.min(distance, CHANNEL_DRAW_MAX);
      // Held at a constant ANGULAR width, so a channel reads as the same
      // thread of light however far out it is drawn rather than as a
      // ribbon that fattens up when it comes close.
      buildChannel(draw * 0.0045);
      bolt.position.set(sin * draw, 0, cos * draw);
      // The ribbon is flat, so it is turned to face the camera once, here:
      // the group rides the camera in x and z, which means this bearing
      // stays true for the whole life of the flash.
      bolt.rotation.y = Math.atan2(-bolt.position.x, -bolt.position.z);
      bolt.visible = true;
    } else {
      bolt.visible = false;
    }

    // The bloom sits where the cloud is lit, which for a distant strike is
    // the sky above the horizon in that direction and for a near one is
    // the top of the channel itself.
    const bloomAt = Math.min(distance, 700);
    const size = 260 + 520 * Math.min(1, distance / FAR);
    bloom.position.set(sin * bloomAt, ceiling * (0.8 + 0.9 * Math.random()), cos * bloomAt);
    bloom.scale.setScalar(size);
    bloom.visible = true;

    if (pending.length < MAX_PENDING) {
      pending.push({
        in: distance / SOUND_SPEED,
        // Where it was, as the ear places it: the compass bearing flattened
        // onto the stereo stage.
        clap: { distance, pan: Math.max(-1, Math.min(1, sin)) },
      });
    }
  };

  const apply = (p: Preset): void => {
    power = p.thunder;
    ceiling = p.deck ? p.deck.base : 220;
    clock = 0;
    flash = 0;
    strokesLeft = 0;
    pending.length = 0;
    bloomMat.opacity = 0;
    boltMat.opacity = 0;
    bloom.visible = false;
    bolt.visible = false;
    group.visible = power > 0;
    // The first flash of a run is not on the clock's own schedule: a storm
    // the player drives into has been going for a while already.
    nextStrike = power > 0 ? 1.5 + Math.random() * 6 : Infinity;
  };

  const update = (dt: number, camera: THREE.Camera): void => {
    if (power <= 0) return;
    clock += dt;
    // The bloom is a flat quad and has to face the camera, or the light
    // inside the cloud is a rectangle hanging in the sky.
    if (bloom.visible) bloom.lookAt(camera.position);

    // Thunder, arriving. Walked back to front so a clap can be dropped
    // where it stands.
    for (let i = pending.length - 1; i >= 0; i--) {
      const wait = pending[i];
      wait.in -= dt;
      if (wait.in > 0) continue;
      onThunder(wait.clap);
      pending.splice(i, 1);
    }

    nextStrike -= dt;
    if (nextStrike <= 0) {
      const rate = PEAK_RATE * power * activity();
      // Gaps drawn from an exponential, which is what the intervals of
      // independent events actually look like: mostly around the mean,
      // occasionally a long silence, occasionally two on top of each other.
      const gap = rate > 0 ? -Math.log(1 - Math.random() * 0.999) / rate : GAP.max;
      nextStrike = Math.min(GAP.max, Math.max(GAP.min, gap));
      strike();
    }

    // The strokes: each one re-lights the same channel a few hundredths of
    // a second after the last, and the light between them never quite
    // reaches nothing.
    if (strokesLeft > 0) {
      strokeIn -= dt;
      if (strokeIn <= 0) {
        strokesLeft--;
        flash = reducedMotion ? CALM.peak : strokePeak * (0.55 + 0.45 * Math.random());
        strokeIn = 0.035 + Math.random() * 0.075;
        // Each return stroke down a channel that is already ionised is
        // weaker than the one before it.
        strokePeak *= 0.78;
      }
    }

    if (flash > 0) {
      const decay = reducedMotion ? CALM.decay : strokesLeft > 0 ? STROKE_DECAY : GLOW_DECAY;
      flash = Math.max(0, flash - decay * dt);
      const surge = flash * flash;
      bloomMat.opacity = Math.min(1, surge * 1.25);
      boltMat.opacity = Math.min(1, Math.sqrt(flash) * 1.4);
      if (flash === 0) {
        bloom.visible = false;
        bolt.visible = false;
      }
    }
  };

  const dispose = (): void => {
    bloom.geometry.dispose();
    bloomMat.dispose();
    boltGeo.dispose();
    boltMat.dispose();
  };

  return {
    group,
    apply,
    update,
    surge: () => flash * flash,
    from: () => fromDir,
    setVisible: (show) => {
      group.visible = show && power > 0;
    },
    dispose,
  };
}

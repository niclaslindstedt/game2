// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW OFTEN THE REAR VIEW IS REDRAWN, DECIDED BY WHAT THE MACHINE CAN AFFORD.
//
// The mirror pass is the whole scene drawn a second time, and metered it is
// the most expensive thing in a driving frame: 153 draw calls of 397, two
// fifths of the triangles. It is also the one thing on screen that can be
// made cheaper without touching the game — the forward view IS the racing,
// the mirror is an instrument beside it, and an instrument that answers a
// tenth of a second late is still answering. So when the frame rate goes,
// the mirror is what gives way first: before the resolution, before the draw
// distance, before anything the player chose in the video options.
//
// The two ways it can give way are both here, because they are rungs of one
// ladder rather than two settings:
//
//   * HOW OFTEN the glass is refilled. The cheapest saving there is: the
//     strip keeps compositing the last answer in between, so what halves is
//     the cost and not the picture.
//   * HOW FAR it sees. This one pays TWICE. It is the mirror camera's own
//     far plane, so it decides what that pass draws; and the same frustum is
//     handed to the world's cull (`world.cull`'s `also`), so it also decides
//     how much open country BEHIND the car the forward pass is forbidden to
//     throw away. It is the only lever here that makes the frame the player
//     is actually looking at cheaper.
//
// Rate first, reach second: dropping frames off an instrument is invisible,
// and shortening what it shows is not.

/** One rung of the ladder: how often the glass is refilled, times a second,
 * and how far it sees, as a fraction of what the forward view is given. */
export type MirrorTier = {
  hz: number;
  range: number;
};

/** The ladder, best first.
 *
 * THE RATE. Being a rate and not a frame count is what makes the top rung
 * mean anything: the glass then updates at the same speed on a phone at
 * sixty and a monitor at a hundred and forty-four, instead of being twice as
 * fresh on the machine that needed the help least. Sixty is the mirror as
 * live as the road in front of it; thirty is a question that does not change
 * inside a thirtieth of a second at any speed a stage is driven at; fifteen
 * is the floor, because a mirror is read for whether anybody is close enough
 * to matter and a car forty metres back moves half a metre between two of
 * those frames. Below that the strip reads as a slideshow bolted to the
 * screen, which is worse than a mirror that is merely a little stale.
 *
 * THE REACH, as a fraction of the forward view's fog distance. A mirror
 * answers one question — is anyone close enough to matter — and a rival four
 * hundred metres back is not an answer anybody acts on. A fifth of the
 * forward view is already generous for that; a tenth still holds every car
 * that could be about to touch this one. The world leaves the mirror's
 * frustum at the range the fog is pulled in to (`environment.withHaze`), so
 * nothing is cut off in mid-view — it goes the way distance goes.
 *
 * Only the bottom rung gives up reach, and that is deliberate: the first
 * step down is the one taken most often, and it should cost the picture
 * nothing at all. */
export const MIRROR_TIERS: readonly MirrorTier[] = [
  { hz: 60, range: 0.2 },
  { hz: 30, range: 0.2 },
  { hz: 15, range: 0.1 },
];

/** The rate the ladder exists to protect, fps — what everything below is
 * measured against. */
const TARGET_FPS = 60;

/** How much of a tolerance a refill is allowed to arrive early with, seconds.
 *
 * Without one the top rung is worth HALF of what it says. Sixty a second is
 * exactly the rate a sixty-hertz display delivers frames at, and no display
 * delivers them exactly 16.67 ms apart: a frame arriving at 16.5 ms is a
 * refill skipped, the next one is 33 ms of age and refills, and a mirror
 * asked for sixty settles at thirty. Two milliseconds is the same tolerance
 * the phone's frame ceiling takes for the same reason (`frameFloorMs` in
 * settings.ts), and it is far too small to let a rung run fast: it is a
 * fifteenth of the shortest interval on the ladder. */
const SLACK = 0.002;

/** The age at which the glass is due for a refill at `hz`, seconds. */
export function refillGap(hz: number): number {
  return Math.max(0, 1 / hz - SLACK);
}

/** Under this the machine is not holding the target in any sense worth
 * defending, fps. Not the target itself: no display delivers frames exactly
 * 16.67 ms apart, and a threshold sitting on it would fire on jitter alone. */
const DROP_FPS = 55;

/** ...and at or over this it IS holding it, fps. The gap between the two is
 * the dead band that stops a rate parked on the line from walking the ladder
 * up and down all stage. */
const HOLD_FPS = 58;

/** How the frame time is smoothed before any of that is asked, seconds. A
 * fifth of a second of frames: long enough that one stalled frame — a
 * collection, a chunk of stage built — cannot answer the question, short
 * enough to notice a car arriving in a forest. */
const SMOOTH = 0.2;

/** How long the rate has to stay under DROP_FPS before a rung is given up,
 * seconds. Cheap to fall: a second of a mirror that is too fresh is a second
 * of stutter, and nobody can see the rung it lands on. A second rather than
 * a frame because a hitch is not a verdict. */
const DROP_DWELL = 1;

/** ...and how long it has to HOLD before one is taken back, seconds.
 * Expensive to climb, because climbing is a GUESS: the only way to find out
 * whether this machine can afford the faster pace is to charge it and watch,
 * and the watching costs the player frames whenever the answer is no. */
const RISE_DWELL = 6;

/** How much longer to wait after a climb that had to be given straight back,
 * and the longest that wait ever gets, seconds. A machine that has failed
 * the probe three times cannot do it, and asking again every six seconds is
 * a stutter every six seconds for the rest of the stage. */
const RISE_BACKOFF = 2;
const RISE_CEILING = 60;

/** How soon after a climb a fall counts as that climb being ANSWERED,
 * seconds. Past this the rate went for reasons of its own — a forest, a
 * storm, fourteen cars in shot — and the ladder should not learn from it. */
const PROBE_GRACE = 10;

export type MirrorPace = {
  /** One drawn frame the mirror was IN, `dt` seconds long. Frames it was not
   * in say nothing about what it costs, so they are not offered — see where
   * the renderer calls this. */
  frame: (dt: number) => void;
  /** The rung in force. */
  tier: () => MirrorTier;
  /** The smoothed rate the decision is being made on, fps — for the debug
   * overlay, which is the only way to watch the ladder work. */
  fps: () => number;
  /** Forget the last few seconds WITHOUT giving up the rung: the mirror has
   * just come back up after being down, and the frames either side of that
   * were drawn under different loads. */
  settle: () => void;
  /** Hold the rung offering `hz` and stop judging — or hand the ladder back
   * to the frame rate with null.
   *
   * This is for TOOLING, and `make profile` is why it exists. That harness
   * meters the frame in headless Chromium, which rasterizes in software at a
   * handful of frames a second, so the ladder does exactly what it is built
   * to do and falls to the floor — and the draw calls that come back are a
   * measurement of the governor rather than of the renderer, on a machine
   * nobody plays on. Pinned, the mirror costs what it costs on the machine
   * the numbers are being read FOR. */
  pin: (hz: number | null) => void;
};

export function createMirrorPace(): MirrorPace {
  let at = 0;
  /** Smoothed seconds per frame. Seeded at the target, so a machine that
   * cannot hold it has to prove that over DROP_DWELL like any other. */
  let frameTime = 1 / TARGET_FPS;
  /** Seconds the rate has been under DROP_FPS, and at or over HOLD_FPS. Only
   * ever one of them at a time; inside the dead band, neither. */
  let under = 0;
  let over = 0;
  /** How long the rate has to hold before the next climb: RISE_DWELL until a
   * climb is given back, and longer every time one is. */
  let climb = RISE_DWELL;
  /** Seconds since the last climb, for judging whether a fall answered it.
   * Starts past any grace — the first fall of a session answers nothing. */
  let sinceRise = Infinity;
  /** Set by `pin`: the ladder is held here and stops judging. */
  let held = false;

  const settle = (): void => {
    under = 0;
    over = 0;
  };

  const frame = (dt: number): void => {
    // A held frame (god mode, a frozen backdrop) is time nobody drew, and a
    // frame time of zero is a rate of infinity — the one sample that could
    // climb the whole ladder on no evidence at all.
    if (!(dt > 0)) return;
    frameTime += (dt - frameTime) * Math.min(1, dt / SMOOTH);
    const rate = 1 / frameTime;
    sinceRise += dt;

    if (rate < DROP_FPS) {
      under += dt;
      over = 0;
    } else if (rate >= HOLD_FPS) {
      over += dt;
      under = 0;
    } else {
      under = 0;
      over = 0;
    }

    // The rate is still smoothed while the ladder is pinned — the overlay's
    // reading of it is the reason anybody pins one — but nothing moves.
    if (held) return;
    // Both changes clear the dwells: the rung that was just taken or given
    // up is a different load, and the seconds measured under the old one
    // cannot be spent again on the next decision.
    if (under >= DROP_DWELL && at < MIRROR_TIERS.length - 1) {
      at++;
      climb = sinceRise <= PROBE_GRACE ? Math.min(climb * RISE_BACKOFF, RISE_CEILING) : RISE_DWELL;
      settle();
    } else if (over >= climb && at > 0) {
      at--;
      sinceRise = 0;
      settle();
    }
  };

  const pin = (hz: number | null): void => {
    held = hz !== null;
    if (hz === null) return;
    // The nearest rung rather than an exact match: a pin is a request for a
    // pace, and answering "there is no such rung" by ignoring it would leave
    // a harness metering a ladder it believes it switched off.
    let best = 0;
    for (let i = 1; i < MIRROR_TIERS.length; i++) {
      if (Math.abs(MIRROR_TIERS[i].hz - hz) < Math.abs(MIRROR_TIERS[best].hz - hz)) best = i;
    }
    at = best;
    settle();
  };

  return {
    frame,
    tier: () => MIRROR_TIERS[at],
    fps: () => 1 / frameTime,
    settle,
    pin,
  };
}

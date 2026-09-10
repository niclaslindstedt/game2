// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DIRECTOR'S CUT — which of the TV mode's two cameras has the frame.
//
// A broadcast does not watch a rally stage from tripods all the way down it.
// Between the corners there is nothing a trackside lens can say that the road
// itself is not already saying, and a gallery cut every two hundred metres of
// straight reads as a slideshow: the shot has barely arrived before the next
// one replaces it, and no camera ever gets to show anything happening. So the
// stage runs on the CHASE boom — the view the game is actually driven from,
// which is where the speed lives — and the tripods are saved for the one
// thing they alone can show, which is a car crossed up on the outside of a
// corner (camera-tv.ts).
//
// THE TWO EDITS ARE NOT THE SAME EDIT, and that asymmetry is the whole of
// this file:
//
//   GOING TO THE CORNER IS A CUT. Television cuts to the corner camera; it
//   does not fly there, because the point of the edit is that the next thing
//   you see is ALREADY the corner, framed and waiting, with the car arriving
//   into it out of the distance. A move would spend the approach travelling,
//   and the approach is the shot.
//
//   COMING BACK IS A MOVE. Cutting from a tripod to a boom behind the same
//   car is the one edit with nothing in it: both frames are of the same car,
//   a second apart, and all a cut says is that the picture has been replaced.
//   Worse, it happens at the exit of the corner — the moment the run is
//   fastest and most continuous — so the edit lands on the one beat that
//   should not be interrupted. Flown instead, the lens leaves the operator's
//   position and closes on the car it was watching go past, arriving on the
//   boom: the shot becomes the drive. That flight is `camera-change.ts`,
//   which already carries a lens onto a rig's own written pose and blends the
//   lens with it — a long trackside lens opening out to the chase's is the
//   zoom half of the same gesture, and it costs nothing extra.
//
// WHICH CORNERS. Every bend the gallery planted a stand beside is a candidate
// (`TvCue`), and two rules cut that down: it has to be genuinely TIGHT, and
// there has to have been some road since the last one. Both exist for the
// same reason — a trackside shot is an interruption, and an interruption that
// happens every few seconds is not an interruption, it is the programme.
//
// It reads `GameState` and arc positions and nothing else: no lens, no
// three.js, no clock. The camera's own tests can drive it.

import { clamp } from "../lib/angles.ts";
import { travelSpeed, type GameState } from "@engine";
import type { TvCue } from "./camera-tv.ts";

/** The whole decision, as numbers. Metres, seconds and 1/m. */
export const TV_CUT = {
  /** How tight a bend has to be before the shot leaves the boom for it,
   * 1/m — a 45 m radius, which is a corner a car has to be THROWN at rather
   * than merely placed. The gallery plants stands from 1/70 (`TV.corner`)
   * because a stand costs nothing and a stage wants cameras along it; a cut
   * costs the drive, so the bar is higher here. Well under half the bends on
   * an ordinary stage clear it, which is the intent: what makes the cut
   * read as an event is that most corners do not get one. */
  tight: 1 / 45,
  /** How far before the turn-in the cut lands, as seconds of the car's own
   * travel, and the metres that is held between.
   *
   * TIME, NOT DISTANCE, because what the number is really buying is how long
   * the car is in shot before it turns in — and a corner arrived at in fifth
   * needs three times the road to give the same beat as one arrived at in
   * second. The floor keeps a slow hairpin from being cut to on top of the
   * apex; the ceiling keeps a flat-out sweeper from cutting to a stand the
   * car is still a speck at (`TV.fovMin` is where the lens runs out of
   * length, at about 230 m).
   *
   * The cut only ever lands INSIDE this window: a corner whose window went by
   * with the boom still up — the rest below said no — is not picked up
   * halfway round. A trackside shot that starts at the apex has skipped the
   * arrival, which was the reason to stand there. */
  lead: 2.2,
  leadMin: 34,
  leadMax: 95,
  /** ...and the road there has to be between the car and the corner's FIRST
   * lens at the cut, m. The lead above says when the corner is close enough
   * to be worth cutting for; this says the shot has an ARRIVAL in it. They
   * are not the same number and neither implies the other — a corner's first
   * stand can be a third of the way round it, so a cut placed a comfortable
   * two seconds before the turn-in can still land on a lens the car reaches
   * in half of one. Two seconds of rally pace, which is a car coming out of
   * the distance and turning in, and the only thing worth leaving a boom
   * for. Under it the corner keeps the boom. */
  reach: 60,
  /** How much road the boom keeps to itself after a trackside shot lets go,
   * m. About eight seconds at rally pace — long enough that the drive is the
   * thing being watched and the corner cameras are punctuation in it, and
   * short enough that a genuinely twisty stage still gets several. */
  rest: 260,
  /** How long the flight back onto the boom takes, s. Longer than a change of
   * seat (camera-change.ts sizes those by how far the lens has to go, and
   * caps them well under this): this one is a SHOT rather than a player
   * changing their mind, and its length is a decision about the picture. Long
   * enough that the lens visibly closes on the car; short enough that the
   * exit of the corner is not spent travelling. */
  back: 1.1,
};

/** What the director has just done, if anything: `cut` the frame the tripods
 * take the picture, `back` the frame they hand it to the boom. */
export type TvEdit = "cut" | "back" | null;

export type TvCut = {
  /** Whether the trackside gallery owns this frame. */
  trackside: () => boolean;
  /** The earliest stand the gallery may take while this shot runs, by arc —
   * the first lens on the corner it was cut for, so the shot opens on the
   * camera it MEANT rather than on the next tripod down the road. `-Infinity`
   * off a shot, which is the gallery's own default. */
  from: () => number;
  /** Read the road under the car against the gallery's corners, and edit.
   * Called once a frame while the TV mode is up, BEFORE anything is placed —
   * the caller's hand-back is flown from the frame already on screen. */
  step: (state: GameState, cues: readonly TvCue[]) => TvEdit;
  /** Put the shot back on the boom with nothing carried across — a new
   * stage, another crew's car, a respawn. */
  drop: () => void;
  /** HOLD THE TRIPODS, for a scripted still that has to come off the same
   * lens every time it is taken (`?tvstand=1`, app-url.ts). The director
   * stops editing: the gallery takes the frame on the next step and never
   * gives it back. It survives a `drop`, because the pin is a property of
   * the session the tool asked for and not of the stage under it. */
  pin: () => void;
};

export function createTvCut(): TvCut {
  let on = false;
  /** The bend the live shot belongs to, by its turn-in arc; -1 off a shot.
   * Held rather than re-derived so the shot ends where it started, on the
   * corner it was cut for, and not on whatever cue the car has since
   * wandered into. */
  let bend = -1;
  /** Where the live shot's first lens stands, m; `-Infinity` off a shot. */
  let from = -Infinity;
  /** Where the last trackside shot let go, m along the stage. */
  let leftAt = -Infinity;
  /** Whether a tool has pinned the gallery up (`pin`). */
  let pinned = false;

  return {
    trackside: () => on,
    from: () => from,
    pin: () => {
      pinned = true;
    },
    drop: () => {
      on = false;
      bend = -1;
      from = -Infinity;
      leftAt = -Infinity;
    },
    step: (state, cues) => {
      // Pinned: one cut onto the gallery, and no edit ever again.
      if (pinned) {
        if (on) return null;
        on = true;
        bend = -1;
        from = -Infinity;
        return "cut";
      }
      const samples = state.track.samples;
      // Where the car IS, not how far the run has got — the same reading the
      // gallery chooses its live tripod by, so the two can never disagree
      // about which corner is under the car.
      const here = samples[Math.min(state.nearIndex, samples.length - 1)];
      const s = here?.s ?? 0;
      if (on) {
        const shot = cues.find((cue) => cue.at === bend);
        if (shot && s <= shot.until) return null;
        on = false;
        bend = -1;
        from = -Infinity;
        leftAt = s;
        return "back";
      }
      if (s - leftAt < TV_CUT.rest) return null;
      const lead = clamp(travelSpeed(state.car) * TV_CUT.lead, TV_CUT.leadMin, TV_CUT.leadMax);
      const shot = cues.find(
        (cue) =>
          cue.tight >= TV_CUT.tight &&
          s >= cue.at - lead &&
          s <= cue.at &&
          cue.first - s >= TV_CUT.reach,
      );
      if (!shot) return null;
      on = true;
      bend = shot.at;
      from = shot.first;
      return "cut";
    },
  };
}

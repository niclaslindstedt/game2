// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN'S AUDIO FRONT DOOR: engine events in, sound out, plus the beds
// that run underneath all of it.
//
// The engine emits `GameEvent`s from `step()` and has no idea any of them make
// a noise; this is the one place that opinion lives. A moment the simulation
// never reports — the countdown lights, the tyres, the wind, a bird — is not
// an event and never becomes one: it is read off the state by the bed
// (`drive-bed.ts`).
//
// WHICH sound an event makes is `route.ts`; this module owns WHEN, WHERE
// FROM (the camera's ear, `listener.ts`), and the two rules that only a
// funnel every sound passes through can enforce.
//
// This module is imported alongside the renderer rather than from the app's
// entry, so the whole run bank stays off the startup path — the interface's
// own sounds live in `ui.ts` and are the only audio the menu pulls in.

import type { GameEvent, GameState } from "@engine";

import type { Clap } from "../weather.ts";

import { RUN_BANK } from "./bank.ts";
import { sfx } from "./bus.ts";
import { createDriveBed, type DriveBed } from "./drive-bed.ts";
import { listenerFor, type Listener } from "./listener.ts";
import { playSound } from "./play.ts";
import { heardFrom, soundForEvent, soundForThunder } from "./route.ts";

export { setAudioVolumes, unlockAudio } from "./bus.ts";
export { RUN_BANK } from "./bank.ts";
export { soundForEvent, soundForThunder } from "./route.ts";

export type RunAudio = {
  /** Translate one step's events into sound. */
  events: (list: readonly GameEvent[]) => void;
  /** Advance the continuous beds; call once per rendered frame. */
  frame: (state: GameState, dt: number) => void;
  /** A strike's sound has finished its journey and arrived. Raised by the
   * renderer, which is where the storm is simulated — the engine has no
   * weather in it and never reports one. */
  thunder: (clap: Clap) => void;
  /** Something light has gone over — a marshal's cone, a marker post out
   * of the verge — at `speed` m/s. Raised by the renderer for the same
   * reason: neither is an engine prop, so `step()` never reports one. */
  knock: (speed: number) => void;
  /** Which camera the run is watched from. The whole mix moves with it. */
  setView: (view: string) => void;
  /** A run ended or the player left it. */
  reset: () => void;
};

/** How close together two knocks may be heard, s. A car through a run of
 * marker posts puts one over every couple of tenths, and at the top of
 * fourth several inside one frame: past a handful a second the ear stops
 * hearing individual posts and starts hearing a buzz, so the extra copies
 * buy nothing and cost the mix. */
const KNOCK_GAP_S = 0.06;

/** How close together two claps may land, s. An active cell can put three
 * strikes in the air inside a second and their sounds arrive from different
 * distances; stacking the rolls turns a storm into mud, and the ear cannot
 * separate them anyway. */
const THUNDER_GAP_S = 0.45;

/** How hard the engine has to be on boost for an upshift to dump the
 * wastegate, 0..1 of `DriveBed.boost`. */
const WASTEGATE_FROM = 0.45;

export function createRunAudio(): RunAudio {
  const bed: DriveBed = createDriveBed(sfx);
  let ear: Listener = listenerFor("chase");
  let lastGear = 0;
  let lastClap = -Infinity;
  let lastKnock = -Infinity;

  return {
    events(list) {
      // TWO EVENTS THAT MAKE THE SAME SOUND IN ONE STEP PLAY ONCE. Everything
      // in a step is simultaneous, so a car that clipped three trunks between
      // two steps would start three sample-aligned copies of one waveform:
      // that is not three impacts, it is one impact at three times the level,
      // driving the mix into the limiter for no gain in information.
      const played = new Set<string>();
      for (const event of list) {
        const hit = soundForEvent(event, lastGear);
        if (event.type === "shift") {
          // An upshift under boost dumps the turbo, and that is a second
          // sound beside the selector rather than a bigger selector.
          if (event.gear > lastGear && bed.boost() > WASTEGATE_FROM && !played.has("wastegate")) {
            played.add("wastegate");
            playSound(sfx, RUN_BANK, "wastegate", heardFrom({ gain: bed.boost() }, ear));
          }
          lastGear = event.gear;
        }
        if (!hit || played.has(hit.id)) continue;
        played.add(hit.id);
        playSound(sfx, RUN_BANK, hit.id, heardFrom(hit.shape, ear));
      }
    },

    frame(state, dt) {
      bed.update(state, dt);
    },

    thunder(clap) {
      const now = sfx.now();
      if (now === null) return;
      if (now - lastClap < THUNDER_GAP_S) return;
      lastClap = now;
      const hit = soundForThunder(clap);
      playSound(sfx, RUN_BANK, hit.id, heardFrom(hit.shape, ear));
    },

    knock(speed) {
      const now = sfx.now();
      if (now === null) return;
      if (now - lastKnock < KNOCK_GAP_S) return;
      lastKnock = now;
      // How hard it was hit, as one sound at a size — a post flicked off a
      // verge at a crawl and one taken flat out are the same hollow knock.
      const hard = Math.min(1, Math.max(0, (speed - 1) / 11));
      playSound(
        sfx,
        RUN_BANK,
        "knock",
        heardFrom({ gain: 0.6 + 0.7 * hard, pitch: 1.12 - 0.22 * hard }, ear),
      );
    },

    setView(view) {
      ear = listenerFor(view);
      bed.setView(view);
    },

    reset() {
      bed.reset();
      lastGear = 0;
      lastClap = -Infinity;
      lastKnock = -Infinity;
    },
  };
}

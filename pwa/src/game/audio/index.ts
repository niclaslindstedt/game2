// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN'S AUDIO FRONT DOOR: engine events in, sound out, plus the road bed
// that runs underneath all of it.
//
// The engine emits `GameEvent`s from `step()` and has no idea any of them make
// a noise; this is the one place that opinion lives. A moment the simulation
// never reports — the countdown lights, the tyres, the wind — is not an event
// and never becomes one: it is read off the state by the bed (`drive-bed.ts`).
//
// WHICH sound an event makes is `route.ts`; this module owns WHEN, and the two
// rules that only a funnel every sound passes through can enforce.
//
// This module is imported alongside the renderer rather than from the app's
// entry, so the whole run bank stays off the startup path — the interface's
// own sounds live in `ui.ts` and are the only audio the menu pulls in.

import type { GameEvent, GameState } from "@engine";

import { RUN_BANK } from "./bank.ts";
import { sfx } from "./bus.ts";
import { createDriveBed, type DriveBed } from "./drive-bed.ts";
import { playSound } from "./play.ts";
import { soundForEvent } from "./route.ts";

export { setAudioVolumes, unlockAudio } from "./bus.ts";
export { RUN_BANK } from "./bank.ts";
export { soundForEvent } from "./route.ts";

export type RunAudio = {
  /** Translate one step's events into sound. */
  events: (list: readonly GameEvent[]) => void;
  /** Advance the continuous beds; call once per rendered frame. */
  frame: (state: GameState, dt: number) => void;
  /** A run ended or the player left it. */
  reset: () => void;
};

export function createRunAudio(): RunAudio {
  const bed: DriveBed = createDriveBed(sfx);
  let lastGear = 0;

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
        if (event.type === "shift") lastGear = event.gear;
        if (!hit || played.has(hit.id)) continue;
        played.add(hit.id);
        playSound(sfx, RUN_BANK, hit.id, hit.shape);
      }
    },

    frame(state, dt) {
      bed.update(state, dt);
    },

    reset() {
      bed.reset();
      lastGear = 0;
    },
  };
}

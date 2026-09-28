// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROOM every sound in this game was voiced in: the echo the one synth is
// built with (bus.ts), and the audition page builds its synth with the same,
// so what is judged there is what plays here.
//
// A shorter, wetter, brighter slap than the framework's default — the
// constants the game's own synth carried before the instrument moved into
// `@niclaslindstedt/oss-game-framework/audio/synth`, kept so no sound moved.

import type { SynthOptions } from "@niclaslindstedt/oss-game-framework/audio/synth";

export const ROOM: SynthOptions = { echo: { delayS: 0.19, feedback: 0.28, dampHz: 2200 } };

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INTERFACE'S OWN SOUNDS — browsing the menus.
//
// A bank of its own, apart from the run's, because the menu is on the app's
// STARTUP path: a title screen that wanted one click must not pull the engine
// bed, the crash bank and two scores into the entry chunk with it.
//
// THE REGISTER IS A CAR'S INTERIOR, NOT A CONSOLE'S. A chip menu goes "blip".
// What a rally game's menu should sound like is hardware: a switch with a
// spring in it, a relay, a damped click with a little wooden body under it.
// Every sound here is therefore a short filtered noise transient (the contact)
// over a low sine (the body it happened in) — the same two-part recipe a real
// button makes, and the reason none of these reads as a beep.
//
// They are also QUIET. A player moving down a list hears `ui_move` twenty
// times in five seconds; it is the most-played sound in the game and sits at
// less than half the level of anything the car does.

import type { SoundBank } from "./types.ts";

/** The moments the interface makes a noise. */
export type UiCue = "move" | "select" | "back" | "toggle" | "deny" | "page" | "start";

export const UI_BANK: SoundBank = {
  ui_move: {
    description:
      "The cursor stepping to the next row: one damped contact click, dry and " +
      "small. A single bandpass tick over a short sine body — the sound of a " +
      "detent, not of a note. It must survive being heard twenty times in five " +
      "seconds, which is what keeps it this short and this quiet.",
    voices: [
      {
        call: "noise",
        durationMs: 26,
        volume: 0.026,
        filter: { type: "bandpass", frequency: 2600, q: 2.4 },
      },
      { call: "tone", type: "sine", from: 520, to: 430, durationMs: 45, volume: 0.02 },
    ],
  },

  ui_select: {
    description:
      "A choice committed: the click of `ui_move` given a body and somewhere " +
      "to land. The contact is brighter and a touch longer, a driven triangle " +
      "steps up a fifth under it, and a low sine thump says the switch bottomed " +
      "out. Warm rather than triumphant — a fanfare belongs to finishing a " +
      "stage, not to opening a submenu.",
    voices: [
      {
        call: "noise",
        durationMs: 34,
        volume: 0.034,
        filter: { type: "bandpass", frequency: 3100, q: 2 },
      },
      {
        call: "tone",
        type: "triangle",
        from: 392,
        durationMs: 90,
        volume: 0.03,
        drive: 0.25,
        echo: 0.12,
      },
      {
        call: "tone",
        type: "triangle",
        from: 587,
        durationMs: 130,
        volume: 0.026,
        delayMs: 55,
        drive: 0.2,
        echo: 0.16,
      },
      { call: "tone", type: "sine", from: 150, to: 90, durationMs: 120, volume: 0.032 },
    ],
  },

  ui_back: {
    description:
      "Leaving a page: `ui_select` walked backwards and shut down. The interval " +
      "falls instead of rising, the contact is darker, and the low body decays " +
      "further — the door closing behind you rather than opening in front.",
    voices: [
      {
        call: "noise",
        durationMs: 30,
        volume: 0.026,
        filter: { type: "lowpass", frequency: 1500 },
      },
      { call: "tone", type: "triangle", from: 392, durationMs: 100, volume: 0.026, drive: 0.2 },
      {
        call: "tone",
        type: "triangle",
        from: 294,
        durationMs: 150,
        volume: 0.024,
        delayMs: 50,
        drive: 0.2,
        echo: 0.14,
      },
      { call: "tone", type: "sine", from: 130, to: 72, durationMs: 150, volume: 0.03 },
    ],
  },

  ui_toggle: {
    description:
      "A switch thrown. Two contacts a hair apart — the throw and the latch — " +
      "with almost no pitch to it at all, because a toggle is a mechanism and " +
      "not a note. The caller shifts it up for ON and down for OFF, so the two " +
      "states are audibly different without being two sounds.",
    voices: [
      {
        call: "noise",
        durationMs: 18,
        volume: 0.03,
        filter: { type: "bandpass", frequency: 3400, q: 3 },
      },
      {
        call: "noise",
        durationMs: 26,
        volume: 0.024,
        delayMs: 34,
        filter: { type: "bandpass", frequency: 2000, q: 2.6 },
      },
      { call: "tone", type: "sine", from: 190, to: 140, durationMs: 70, volume: 0.024 },
    ],
  },

  ui_deny: {
    description:
      "A row that will not open — a locked stage, an unavailable option. A " +
      "short driven square low in the register with the contact click missing: " +
      "the switch did not move, so nothing latched. Refusal, not punishment; it " +
      "is over in a tenth of a second.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 150,
        to: 120,
        durationMs: 110,
        volume: 0.03,
        drive: 0.35,
        filter: { type: "lowpass", frequency: 1100 },
      },
      {
        call: "noise",
        durationMs: 60,
        volume: 0.016,
        color: "brown",
        filter: { type: "lowpass", frequency: 500 },
      },
    ],
  },

  ui_page: {
    description:
      "A page or a tab changing under the cursor: a short filtered air movement " +
      "rather than a click, because nothing was pressed — the picture moved. " +
      "One pink-noise sweep opening from a mutter to a hiss, which is the " +
      "cheapest honest whoosh there is, with a soft sine underneath so it has " +
      "somewhere to have happened.",
    voices: [
      {
        call: "noise",
        durationMs: 220,
        volume: 0.024,
        color: "pink",
        attackMs: 40,
        filter: { type: "bandpass", frequency: 400, to: 2600, q: 1.1 },
      },
      {
        call: "tone",
        type: "sine",
        from: 220,
        to: 330,
        durationMs: 200,
        volume: 0.014,
        attackMs: 30,
      },
    ],
  },

  ui_start: {
    description:
      "The launch out of the menu and onto a stage — the one big noise the " +
      "interface makes, and it is allowed to be, because it happens once. A " +
      "brown-noise sweep rising through a resonant lowpass (the world arriving), " +
      "a low sine drop under it (the weight of it), and a bright fifth on top " +
      "that rings into the echo bus after the rest has gone.",
    voices: [
      {
        call: "noise",
        durationMs: 700,
        volume: 0.05,
        color: "brown",
        attackMs: 260,
        filter: { type: "lowpass", frequency: 180, to: 2400, q: 3.5 },
      },
      {
        call: "tone",
        type: "sine",
        from: 180,
        to: 55,
        durationMs: 620,
        volume: 0.045,
        attackMs: 20,
      },
      {
        call: "tone",
        type: "triangle",
        from: 392,
        durationMs: 90,
        volume: 0.03,
        delayMs: 430,
        drive: 0.3,
        echo: 0.3,
      },
      {
        call: "tone",
        type: "triangle",
        from: 587,
        durationMs: 480,
        volume: 0.032,
        delayMs: 500,
        detuneCents: 8,
        drive: 0.25,
        echo: 0.42,
      },
    ],
  },
};

/** A cue's id in the bank. */
export const UI_SOUND: Record<UiCue, string> = {
  move: "ui_move",
  select: "ui_select",
  back: "ui_back",
  toggle: "ui_toggle",
  deny: "ui_deny",
  page: "ui_page",
  start: "ui_start",
};

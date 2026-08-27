// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN'S SOUND BANK — everything discrete the car and the stage do.
//
// A sound here is data: a description of what it should feel like, and the
// list of synth voices that try to. The continuous stuff — the engine, the
// tyres, the wind, the scrub of a slide — is not here and cannot be, because
// its pitch and level ride parameters that move every frame; that lives in
// `engine-bed.ts` and `drive-bed.ts`.
//
// THE PALETTE IS PLAYSTATION-ERA RALLY, and three habits carry it:
//
//   * EVERY IMPACT IS THREE LAYERS — a transient (what touched what), a body
//     (what it was made of), and a tail (the room and the debris). A one-layer
//     hit is a chip hit however loud it is.
//   * NOISE CARRIES THE MATERIAL. Brown is mass and distance, pink is gravel
//     and water, white is glass and grit. Picking the colour before picking
//     the filter is what stops everything sounding like the same hiss.
//   * FILTERS MOVE. A crash that opens and shuts, a spray that thins out, a
//     turbo that spools — all one `filter.to` away, and all impossible with a
//     static cutoff.
//
// Mixing: the crash is the ceiling at ~0.1; ordinary contacts sit at 0.04–0.07;
// anything that can happen twice a second (shifts, scuffs) stays under 0.04.
// If everything is loud, nothing is.

import type { SoundBank } from "./types.ts";

export const RUN_BANK: SoundBank = {
  // ── The start of it ──────────────────────────────────────────────────────
  countdown_tick: {
    description:
      "One of the lights before the off. A dry mid tone with a contact click " +
      "on it — a timing device on a pole in a forest, not a musical note. " +
      "Deliberately plain so that GO can be the same sound transformed.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 660,
        durationMs: 130,
        volume: 0.03,
        holdMs: 70,
        filter: { type: "lowpass", frequency: 2200 },
      },
      {
        call: "noise",
        durationMs: 20,
        volume: 0.018,
        filter: { type: "bandpass", frequency: 3000, q: 3 },
      },
    ],
  },

  race_go: {
    description:
      "Lights out. The countdown tick an octave up, held twice as long and " +
      "opened out with a resonant sweep and a send into the echo — the same " +
      "device saying the opposite thing. Nothing celebratory: the celebration " +
      "is at the finish, this is permission.",
    voices: [
      {
        call: "tone",
        type: "square",
        from: 990,
        durationMs: 420,
        volume: 0.042,
        holdMs: 260,
        detuneCents: 7,
        echo: 0.28,
        filter: { type: "lowpass", frequency: 1400, to: 4200 },
      },
      {
        call: "noise",
        durationMs: 30,
        volume: 0.026,
        filter: { type: "bandpass", frequency: 3400, q: 3 },
      },
      { call: "tone", type: "sine", from: 165, to: 110, durationMs: 300, volume: 0.03 },
    ],
  },

  lap: {
    description:
      "Across the line with laps still to run. The finish's brass stab on its " +
      "own, a fifth lower and half as long, with no swell of crowd under it — " +
      "the same voice saying 'again' instead of 'done', so the finish still " +
      "arrives as something the lap board was only counting toward.",
    voices: [
      {
        call: "tone",
        type: "sawtooth",
        from: 262,
        to: 392,
        durationMs: 220,
        volume: 0.03,
        attackMs: 10,
        holdMs: 110,
        detuneCents: 8,
        drive: 0.22,
        echo: 0.18,
        filter: { type: "lowpass", frequency: 2400 },
      },
      {
        call: "noise",
        durationMs: 90,
        volume: 0.016,
        color: "pink",
        attackMs: 8,
        filter: { type: "bandpass", frequency: 1600, q: 1.2 },
      },
    ],
  },

  finish: {
    description:
      "Through the flying finish. A rising two-note brass stab over a swell of " +
      "pink air — the noise of arriving somewhere with people at it — cut off " +
      "clean rather than allowed to ring, so the results screen lands in quiet.",
    voices: [
      {
        call: "noise",
        durationMs: 900,
        volume: 0.03,
        color: "pink",
        attackMs: 260,
        holdMs: 220,
        filter: { type: "bandpass", frequency: 700, to: 1800, q: 0.9 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 392,
        durationMs: 260,
        volume: 0.036,
        attackMs: 14,
        holdMs: 130,
        detuneCents: 10,
        drive: 0.3,
        echo: 0.24,
        filter: { type: "lowpass", frequency: 2600 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 587,
        durationMs: 620,
        volume: 0.04,
        delayMs: 230,
        attackMs: 16,
        holdMs: 300,
        detuneCents: 12,
        drive: 0.28,
        echo: 0.36,
        filter: { type: "lowpass", frequency: 3000 },
      },
      {
        call: "tone",
        type: "sine",
        from: 98,
        durationMs: 700,
        volume: 0.038,
        delayMs: 230,
        holdMs: 340,
      },
    ],
  },

  // ── The drivetrain ───────────────────────────────────────────────────────
  shift_up: {
    description:
      "A gear going in: the mechanical clack of the selector and the momentary " +
      "hole in the exhaust while the clutch is out. Short, dry, and quiet — it " +
      "happens five times up every straight, and the engine bed's pitch drop " +
      "is what the player actually reads the shift from.",
    voices: [
      {
        call: "noise",
        durationMs: 32,
        volume: 0.03,
        filter: { type: "bandpass", frequency: 1700, to: 900, q: 2.2 },
      },
      {
        call: "tone",
        type: "square",
        from: 220,
        to: 150,
        durationMs: 70,
        volume: 0.022,
        drive: 0.4,
        filter: { type: "lowpass", frequency: 900 },
      },
    ],
  },

  shift_down: {
    description:
      "The same selector the other way, with the blip of throttle that matches " +
      "the revs. Brighter than the upshift because the engine comes UP to meet " +
      "the gear rather than falling away from it.",
    voices: [
      {
        call: "noise",
        durationMs: 30,
        volume: 0.028,
        filter: { type: "bandpass", frequency: 1500, to: 2400, q: 2.2 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 170,
        to: 300,
        durationMs: 110,
        volume: 0.026,
        drive: 0.45,
        filter: { type: "lowpass", frequency: 1600 },
      },
    ],
  },

  boost_start: {
    description:
      "The booster lighting: a spool — white hiss climbing through a resonant " +
      "bandpass — with a low pressure surge under it. It is a rush of air with " +
      "something behind it, not a laser.",
    voices: [
      {
        call: "noise",
        durationMs: 520,
        volume: 0.036,
        attackMs: 90,
        holdMs: 200,
        filter: { type: "bandpass", frequency: 900, to: 5200, q: 4 },
      },
      {
        call: "tone",
        type: "sine",
        from: 70,
        to: 180,
        durationMs: 480,
        volume: 0.04,
        attackMs: 60,
        holdMs: 220,
      },
      {
        call: "noise",
        durationMs: 260,
        volume: 0.02,
        color: "brown",
        delayMs: 40,
        filter: { type: "lowpass", frequency: 420 },
      },
    ],
  },

  boost_empty: {
    description:
      "The tank running dry mid-burn. The spool played backwards and given up " +
      "on: the hiss falls away through the filter and a dry valve click closes " +
      "it. No alarm, no tone — the sound of a thing stopping.",
    voices: [
      {
        call: "noise",
        durationMs: 420,
        volume: 0.03,
        holdMs: 60,
        filter: { type: "bandpass", frequency: 4200, to: 600, q: 3 },
      },
      {
        call: "noise",
        durationMs: 26,
        volume: 0.024,
        delayMs: 330,
        filter: { type: "bandpass", frequency: 1900, q: 3.2 },
      },
    ],
  },

  // ── Leaving the road, and the ground under it ────────────────────────────
  offroad_enter: {
    description:
      "The wheels leaving the graded surface for whatever is beside it: a burst " +
      "of loose material thrown up all at once, before the tyre bed settles " +
      "into its rough-ground voice. A scatter, not a hit.",
    voices: [
      {
        call: "noise",
        durationMs: 260,
        volume: 0.032,
        color: "pink",
        attackMs: 18,
        filter: { type: "bandpass", frequency: 2400, to: 1100, q: 1.2 },
      },
      {
        call: "noise",
        durationMs: 140,
        volume: 0.022,
        color: "brown",
        filter: { type: "lowpass", frequency: 300 },
      },
    ],
  },

  offroad_exit: {
    description:
      "Back onto the road. The scatter of `offroad_enter` shorter and cleaner " +
      "— the last of the dirt leaving the treads — with none of the low weight, " +
      "because the surface got firmer rather than softer.",
    voices: [
      {
        call: "noise",
        durationMs: 170,
        volume: 0.026,
        color: "pink",
        filter: { type: "bandpass", frequency: 1600, to: 3000, q: 1.4 },
      },
    ],
  },

  splash: {
    description:
      "A ford taken at speed. The front of the car displacing water is a wide " +
      "pink swell that opens fast and thins out as the sheet leaves the " +
      "wheels; a brown thump under it is the mass of it hitting the panels. " +
      "The one sound in the bank with no hard transient at all — water does " +
      "not click.",
    voices: [
      {
        call: "noise",
        durationMs: 620,
        volume: 0.055,
        color: "pink",
        attackMs: 30,
        holdMs: 120,
        filter: { type: "bandpass", frequency: 900, to: 4200, q: 0.8 },
      },
      {
        call: "noise",
        durationMs: 300,
        volume: 0.04,
        color: "brown",
        attackMs: 12,
        filter: { type: "lowpass", frequency: 380 },
      },
      {
        call: "noise",
        durationMs: 900,
        volume: 0.02,
        delayMs: 180,
        filter: { type: "highpass", frequency: 3600 },
        echo: 0.2,
      },
    ],
  },

  // ── Air ──────────────────────────────────────────────────────────────────
  takeoff: {
    description:
      "The moment the wheels stop carrying the car: the suspension topping out " +
      "with a soft metallic clonk, and everything under the floor going quiet " +
      "at once. Quiet by design — what sells a jump is the silence after it, " +
      "which the tyre bed provides by having nothing to roll on.",
    voices: [
      {
        call: "noise",
        durationMs: 90,
        volume: 0.03,
        color: "brown",
        filter: { type: "lowpass", frequency: 700, to: 300 },
      },
      {
        call: "tone",
        type: "triangle",
        from: 210,
        to: 150,
        durationMs: 130,
        volume: 0.024,
        drive: 0.3,
      },
    ],
  },

  land_clean: {
    description:
      "Landing on the wheels with the car pointing where it is going. The " +
      "suspension takes it: a compressed brown thump, the tyres finding the " +
      "surface again in a scatter of loose material, and no metal anywhere. " +
      "Scaled by air time by the caller, so a hop and a forty-metre flight are " +
      "the same sound at very different sizes.",
    voices: [
      {
        call: "noise",
        durationMs: 200,
        volume: 0.055,
        color: "brown",
        filter: { type: "lowpass", frequency: 900, to: 260 },
      },
      {
        call: "noise",
        durationMs: 300,
        volume: 0.03,
        color: "pink",
        delayMs: 25,
        filter: { type: "bandpass", frequency: 2000, to: 900, q: 1.1 },
      },
      { call: "tone", type: "sine", from: 90, to: 52, durationMs: 240, volume: 0.04 },
    ],
  },

  land_hard: {
    description:
      "Landing badly: sideways, nose-first, or from further up than the springs " +
      "have travel for. Everything `land_clean` has, plus the two things that " +
      "say it hurt — the bang of the floorpan reaching its stop, and a bright " +
      "scrape of the underside taking some of the impact the wheels should have.",
    voices: [
      {
        call: "noise",
        durationMs: 260,
        volume: 0.075,
        color: "brown",
        filter: { type: "lowpass", frequency: 1100, to: 200 },
      },
      {
        call: "noise",
        durationMs: 60,
        volume: 0.055,
        filter: { type: "bandpass", frequency: 1400, q: 1.6 },
      },
      { call: "tone", type: "sine", from: 110, to: 40, durationMs: 340, volume: 0.055 },
      {
        call: "tone",
        type: "square",
        from: 340,
        to: 190,
        durationMs: 180,
        volume: 0.024,
        delayMs: 20,
        drive: 0.5,
        echo: 0.2,
        filter: { type: "bandpass", frequency: 1800, q: 2.4 },
      },
      {
        call: "noise",
        durationMs: 420,
        volume: 0.02,
        delayMs: 60,
        filter: { type: "highpass", frequency: 2800 },
      },
    ],
  },

  // ── Hitting things ───────────────────────────────────────────────────────
  impact_scuff: {
    description:
      "A brush past something solid — a branch down the flank, a wheel clipping " +
      "a rock. A rasp rather than a bang: bandpass noise sweeping down as the " +
      "car goes past, with barely any body under it. Cheap on purpose, because " +
      "at pace through trees this fires constantly.",
    voices: [
      {
        call: "noise",
        durationMs: 130,
        volume: 0.036,
        filter: { type: "bandpass", frequency: 3200, to: 1400, q: 1.8 },
      },
      { call: "tone", type: "sine", from: 170, to: 120, durationMs: 90, volume: 0.02 },
    ],
  },

  impact_hit: {
    description:
      "A real contact: the car has stopped being the shape it was. The " +
      "transient is a broadband crack, the body is a driven square panel note " +
      "that bends as it decays, and a brown thump carries the mass of two " +
      "tonnes changing direction. This is the sound the damage instrument moves " +
      "to, and it should make the player wince rather than jump.",
    voices: [
      {
        call: "noise",
        durationMs: 45,
        volume: 0.07,
        filter: { type: "bandpass", frequency: 2200, q: 1.1 },
      },
      {
        call: "noise",
        durationMs: 280,
        volume: 0.055,
        color: "brown",
        filter: { type: "lowpass", frequency: 1200, to: 220 },
      },
      {
        call: "tone",
        type: "square",
        from: 260,
        to: 130,
        durationMs: 220,
        volume: 0.03,
        drive: 0.55,
        echo: 0.16,
        filter: { type: "bandpass", frequency: 900, to: 420, q: 2 },
      },
      { call: "tone", type: "sine", from: 120, to: 46, durationMs: 320, volume: 0.05 },
    ],
  },

  impact_crunch: {
    description:
      "A big one, taken square. `impact_hit` with the layer that only a heavy " +
      "impact has: the long metallic aftermath — panels settling, glass, " +
      "something rolling away — spread out behind the initial crack on the echo " +
      "bus. It is the loudest thing in the bank, and it is meant to be.",
    voices: [
      {
        call: "noise",
        durationMs: 60,
        volume: 0.09,
        filter: { type: "bandpass", frequency: 1800, q: 0.9 },
      },
      {
        call: "noise",
        durationMs: 420,
        volume: 0.08,
        color: "brown",
        filter: { type: "lowpass", frequency: 1500, to: 160 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 210,
        to: 70,
        durationMs: 380,
        volume: 0.045,
        drive: 0.65,
        echo: 0.24,
        filter: { type: "lowpass", frequency: 1400, to: 340 },
      },
      { call: "tone", type: "sine", from: 130, to: 38, durationMs: 520, volume: 0.06 },
      {
        call: "noise",
        durationMs: 260,
        volume: 0.03,
        delayMs: 90,
        filter: { type: "bandpass", frequency: 4200, q: 2.6 },
        echo: 0.34,
      },
      {
        call: "noise",
        durationMs: 500,
        volume: 0.022,
        delayMs: 220,
        filter: { type: "highpass", frequency: 2400 },
        echo: 0.4,
      },
    ],
  },

  part_break: {
    description:
      "A piece of the car leaving it. Metal giving way is a bright tearing " +
      "sweep — a bandpass climbing as the fastening lets go — and then the part " +
      "itself, tumbling away behind the car as a scatter of dry clatter on the " +
      "echo bus. No low end: what came off weighs a few kilos.",
    voices: [
      {
        call: "noise",
        durationMs: 110,
        volume: 0.05,
        filter: { type: "bandpass", frequency: 1200, to: 4600, q: 2.8 },
      },
      {
        call: "tone",
        type: "square",
        from: 620,
        to: 310,
        durationMs: 160,
        volume: 0.026,
        drive: 0.5,
        echo: 0.2,
        filter: { type: "bandpass", frequency: 2200, q: 2.6 },
      },
      {
        call: "noise",
        durationMs: 40,
        volume: 0.03,
        delayMs: 150,
        filter: { type: "bandpass", frequency: 3000, q: 3.4 },
        echo: 0.35,
      },
      {
        call: "noise",
        durationMs: 40,
        volume: 0.024,
        delayMs: 260,
        filter: { type: "bandpass", frequency: 2400, q: 3.4 },
        echo: 0.35,
      },
      {
        call: "noise",
        durationMs: 40,
        volume: 0.018,
        delayMs: 400,
        filter: { type: "bandpass", frequency: 3600, q: 3.4 },
        echo: 0.35,
      },
    ],
  },

  sink: {
    description:
      "The water closing over the roof. The car is already gone by the time " +
      "this plays, so nothing in it is an impact: a soft pink swell folding " +
      "shut over a descending note, with the last bubbles thinning out behind " +
      "it. The filters all travel DOWNWARD — everything about this sound is " +
      "leaving.",
    voices: [
      {
        call: "noise",
        durationMs: 900,
        volume: 0.038,
        color: "pink",
        attackMs: 90,
        holdMs: 120,
        filter: { type: "lowpass", frequency: 1600, to: 200 },
      },
      {
        call: "tone",
        type: "sine",
        from: 130,
        to: 44,
        durationMs: 850,
        volume: 0.034,
        attackMs: 50,
        holdMs: 120,
      },
      {
        call: "noise",
        durationMs: 1100,
        volume: 0.022,
        color: "white",
        delayMs: 140,
        attackMs: 40,
        filter: { type: "bandpass", frequency: 3200, to: 900, q: 2.2 },
        echo: 0.35,
      },
    ],
  },

  crash: {
    description:
      "The run over: the car somewhere it cannot drive out of. Not an impact — " +
      "a settling. Everything drops away into a long brown swell that closes " +
      "down to nothing, with a single deep note under it and water in the top " +
      "end. The longest sound in the bank because it is the one nothing follows.",
    voices: [
      {
        call: "noise",
        durationMs: 1400,
        volume: 0.06,
        color: "brown",
        attackMs: 60,
        holdMs: 260,
        filter: { type: "lowpass", frequency: 900, to: 120 },
      },
      {
        call: "tone",
        type: "sine",
        from: 88,
        to: 33,
        durationMs: 1300,
        volume: 0.055,
        attackMs: 30,
        holdMs: 200,
      },
      {
        call: "noise",
        durationMs: 700,
        volume: 0.03,
        color: "pink",
        delayMs: 60,
        filter: { type: "bandpass", frequency: 2600, to: 700, q: 1 },
        echo: 0.3,
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 165,
        to: 82,
        durationMs: 900,
        volume: 0.022,
        delayMs: 40,
        drive: 0.4,
        echo: 0.4,
        filter: { type: "lowpass", frequency: 800, to: 260 },
      },
    ],
  },

  respawn: {
    description:
      "Put back on the road. A reverse swell — pink air pulled inward through a " +
      "closing filter — landing on the dry thump of the car being set down on " +
      "its wheels. Short, so it never delays getting going again.",
    voices: [
      {
        call: "noise",
        durationMs: 420,
        volume: 0.03,
        color: "pink",
        attackMs: 300,
        filter: { type: "bandpass", frequency: 3600, to: 800, q: 1.4 },
      },
      {
        call: "noise",
        durationMs: 140,
        volume: 0.045,
        color: "brown",
        delayMs: 400,
        filter: { type: "lowpass", frequency: 700, to: 240 },
      },
      {
        call: "tone",
        type: "sine",
        from: 120,
        to: 60,
        durationMs: 200,
        volume: 0.036,
        delayMs: 400,
      },
    ],
  },
};

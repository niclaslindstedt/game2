// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAR'S SOUND BANK — everything discrete the car itself does.
//
// A sound here is data: a description of what it should feel like, and the
// list of synth voices that try to. The continuous stuff — the engine, the
// tyres, the wind, the scrub of a slide — is not here and cannot be, because
// its pitch and level ride parameters that move every frame; that lives in
// `engine-voice.ts`, `road-voice.ts` and the scheduler in `drive-bed.ts`.
// What the STAGE does — the lights, the line, the crowd, the sky — is the
// bank beside this one (`bank-stage.ts`); the two are served together as
// `RUN_BANK` so the router never has to know which is which.
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
//     wastegate that empties — all one `filter.to` away.
//
// AND NOTHING HERE IS BRIGHT FOR ITS OWN SAKE. A Bluetooth codec turns dense
// top end into a swirl, and the lower half of every sound is where its
// weight is anyway: the transients live in the 1–4 kHz band, the bodies
// under 1 kHz, and the only thing above 5 kHz is glass.
//
// Mixing: the crash is the ceiling at ~0.1; ordinary contacts sit at 0.04–0.07;
// anything that can happen twice a second (shifts, scuffs, pops) stays under
// 0.04. If everything is loud, nothing is.

import { STAGE_BANK } from "./bank-stage.ts";
import type { SoundBank } from "./types.ts";

export const CAR_BANK: SoundBank = {
  // ── The drivetrain ───────────────────────────────────────────────────────
  shift_up: {
    description:
      "A gear going in: the mechanical clack of the selector and the momentary " +
      "hole in the exhaust while the clutch is out. Short, dry, and quiet — it " +
      "happens five times up every straight, and the engine's pitch drop is " +
      "what the player actually reads the shift from.",
    voices: [
      {
        call: "noise",
        durationMs: 30,
        volume: 0.028,
        filter: { type: "bandpass", frequency: 1600, to: 900, q: 2.2 },
      },
      {
        call: "tone",
        type: "square",
        from: 220,
        to: 150,
        durationMs: 70,
        volume: 0.02,
        drive: 0.5,
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
        durationMs: 28,
        volume: 0.026,
        filter: { type: "bandpass", frequency: 1400, to: 2200, q: 2.2 },
      },
      {
        call: "tone",
        type: "sawtooth",
        from: 170,
        to: 300,
        durationMs: 110,
        volume: 0.024,
        drive: 0.55,
        filter: { type: "lowpass", frequency: 1500 },
      },
    ],
  },

  overrun_pop: {
    description:
      "Unburnt fuel going off in the exhaust on a lift — the crackle a rally " +
      "car makes coming off the throttle at the top of a gear. Three short " +
      "brown pops, spaced unevenly, each a filtered thump with a little " +
      "square bark in it, thrown behind the car. Quiet and quick: it is " +
      "texture on the lift, never a bang.",
    voices: [
      {
        call: "noise",
        durationMs: 40,
        volume: 0.026,
        color: "brown",
        filter: { type: "bandpass", frequency: 520, to: 260, q: 1.4 },
      },
      {
        call: "tone",
        type: "square",
        from: 180,
        to: 90,
        durationMs: 50,
        volume: 0.012,
        drive: 0.6,
        filter: { type: "lowpass", frequency: 700 },
      },
      {
        call: "noise",
        durationMs: 34,
        volume: 0.02,
        color: "brown",
        delayMs: 110,
        filter: { type: "bandpass", frequency: 600, to: 280, q: 1.4 },
      },
      {
        call: "noise",
        durationMs: 44,
        volume: 0.023,
        color: "brown",
        delayMs: 290,
        filter: { type: "bandpass", frequency: 480, to: 240, q: 1.4 },
      },
      {
        call: "tone",
        type: "square",
        from: 160,
        to: 80,
        durationMs: 60,
        volume: 0.011,
        delayMs: 290,
        drive: 0.6,
        filter: { type: "lowpass", frequency: 700 },
      },
    ],
  },

  wastegate: {
    description:
      "The turbo dumping its boost on an upshift under full load: a short " +
      "sharp PSSHT of pink air, opening bright and shutting fast, with the " +
      "whistle of the impeller winding down under it. Over in a fifth of a " +
      "second and only ever raised with the engine on boost.",
    voices: [
      {
        call: "noise",
        durationMs: 190,
        volume: 0.03,
        color: "pink",
        attackMs: 6,
        filter: { type: "bandpass", frequency: 3400, to: 1400, q: 1.1 },
      },
      {
        call: "tone",
        type: "sine",
        from: 3600,
        to: 1500,
        durationMs: 240,
        volume: 0.008,
        attackMs: 10,
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
        volume: 0.03,
        color: "pink",
        attackMs: 18,
        filter: { type: "bandpass", frequency: 2200, to: 1000, q: 1.2 },
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
        volume: 0.024,
        color: "pink",
        filter: { type: "bandpass", frequency: 1500, to: 2600, q: 1.4 },
      },
    ],
  },

  spin: {
    description:
      "The drift gone. Past the angle where the front tyres still have " +
      "something to pull against, all four are dragged sideways at once and " +
      "the car is rotating on nothing but the speed it arrived with. A wide " +
      "band that SWELLS rather than hits — nothing struck anything — and " +
      "then falls away as the sideways drag eats the speed that is making " +
      "it, with the mass of the car coming round underneath. It must not " +
      "read as a crash: a spin is a mistake the driver made, and a player " +
      "who hears an impact here will brake out of every slide.",
    voices: [
      {
        call: "noise",
        durationMs: 900,
        volume: 0.034,
        color: "pink",
        attackMs: 110,
        holdMs: 180,
        filter: { type: "bandpass", frequency: 1800, to: 700, q: 0.9 },
      },
      {
        call: "noise",
        durationMs: 700,
        volume: 0.026,
        color: "brown",
        attackMs: 90,
        filter: { type: "lowpass", frequency: 420, to: 140 },
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
        filter: { type: "bandpass", frequency: 900, to: 3800, q: 0.8 },
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
        volume: 0.016,
        color: "pink",
        delayMs: 180,
        filter: { type: "highpass", frequency: 3200 },
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
        volume: 0.022,
        drive: 0.4,
      },
    ],
  },

  land_clean: {
    description:
      "Landing on the wheels with the car pointing where it is going. The " +
      "suspension takes it: a compressed brown thump, the tyres finding the " +
      "surface again in a scatter of loose material, and no metal anywhere. " +
      "Scaled by the slam by the caller, so a hop and a forty-metre flight " +
      "are the same sound at very different sizes.",
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
        volume: 0.028,
        color: "pink",
        delayMs: 25,
        filter: { type: "bandpass", frequency: 1900, to: 900, q: 1.1 },
      },
      { call: "tone", type: "sine", from: 90, to: 52, durationMs: 240, volume: 0.04 },
    ],
  },

  land_hard: {
    description:
      "Landing badly: sideways, nose-first, or from further up than the springs " +
      "have travel for. Everything `land_clean` has, plus the two things that " +
      "say it hurt — the bang of the floorpan reaching its stop, and a scrape " +
      "of the underside taking some of the impact the wheels should have.",
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
        volume: 0.05,
        filter: { type: "bandpass", frequency: 1400, q: 1.6 },
      },
      { call: "tone", type: "sine", from: 110, to: 40, durationMs: 340, volume: 0.055 },
      {
        call: "tone",
        type: "square",
        from: 340,
        to: 190,
        durationMs: 180,
        volume: 0.022,
        delayMs: 20,
        drive: 0.6,
        echo: 0.2,
        filter: { type: "bandpass", frequency: 1800, q: 2.4 },
      },
      {
        call: "noise",
        durationMs: 420,
        volume: 0.016,
        color: "pink",
        delayMs: 60,
        filter: { type: "highpass", frequency: 2600 },
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
        volume: 0.034,
        color: "pink",
        filter: { type: "bandpass", frequency: 3000, to: 1300, q: 1.8 },
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
        drive: 0.65,
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
        drive: 0.8,
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
        volume: 0.02,
        color: "pink",
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
        filter: { type: "bandpass", frequency: 1200, to: 4400, q: 2.8 },
      },
      {
        call: "tone",
        type: "square",
        from: 620,
        to: 310,
        durationMs: 160,
        volume: 0.024,
        drive: 0.6,
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

  wood_break: {
    description:
      "A trunk giving way under a car. The bole is what makes the sound: a " +
      "long dry CRACK that starts as a splintering tear high up and drops as " +
      "the fibres let go, over a short woody thud of the whole weight of the " +
      "tree shifting. Nothing metallic and nothing bright at the top — wood " +
      "breaking is loud in the middle of the range and dead everywhere else.",
    voices: [
      {
        call: "noise",
        durationMs: 90,
        volume: 0.075,
        color: "pink",
        filter: { type: "bandpass", frequency: 2600, to: 900, q: 3.2 },
      },
      {
        call: "tone",
        type: "square",
        from: 220,
        to: 62,
        durationMs: 220,
        volume: 0.05,
        drive: 0.85,
        filter: { type: "lowpass", frequency: 1400, to: 400 },
      },
      {
        call: "noise",
        durationMs: 260,
        volume: 0.03,
        delayMs: 120,
        filter: { type: "bandpass", frequency: 1100, to: 520, q: 2.2 },
        echo: 0.3,
      },
    ],
  },

  stone_shove: {
    description:
      "A rock coming off its bed and going. A hard flat knock with grit under " +
      "it — stone on steel, then the lump rolling away through the scree. No " +
      "tail to speak of: what left is heavy and it lands close.",
    voices: [
      {
        call: "noise",
        durationMs: 60,
        volume: 0.07,
        color: "pink",
        filter: { type: "bandpass", frequency: 1500, to: 700, q: 2.4 },
      },
      {
        call: "tone",
        type: "triangle",
        from: 150,
        to: 84,
        durationMs: 130,
        volume: 0.045,
        drive: 0.75,
        filter: { type: "lowpass", frequency: 900 },
      },
      {
        call: "noise",
        durationMs: 150,
        volume: 0.022,
        delayMs: 110,
        filter: { type: "bandpass", frequency: 2100, q: 2.8 },
        echo: 0.25,
      },
    ],
  },

  // ── The car giving up ────────────────────────────────────────────────────
  system_give: {
    description:
      "A system crossing its first line — the engine down a third, a spring " +
      "gone soft, the box baulking. A metallic knock felt through the " +
      "bulkhead, a short rattle behind it, and nothing bright: it is news the " +
      "player cannot see, so it is a sound with a body and no drama, small " +
      "enough to sit under whatever just happened to the car.",
    voices: [
      {
        call: "noise",
        durationMs: 50,
        volume: 0.034,
        color: "brown",
        filter: { type: "bandpass", frequency: 640, q: 2 },
      },
      {
        call: "tone",
        type: "triangle",
        from: 240,
        to: 150,
        durationMs: 140,
        volume: 0.024,
        drive: 0.5,
        filter: { type: "lowpass", frequency: 900 },
      },
      {
        call: "noise",
        durationMs: 220,
        volume: 0.014,
        color: "pink",
        delayMs: 70,
        filter: { type: "bandpass", frequency: 1500, q: 2.6 },
      },
    ],
  },

  system_gone: {
    description:
      "A system finished: the engine dead, the box jammed, the steering " +
      "bent. `system_give` with the weight left in: a heavier clunk, a " +
      "descending driven note that stalls rather than rings, and a hiss of " +
      "something venting — steam, oil, air — that goes on after the rest.",
    voices: [
      {
        call: "noise",
        durationMs: 80,
        volume: 0.045,
        color: "brown",
        filter: { type: "bandpass", frequency: 420, q: 1.6 },
      },
      {
        call: "tone",
        type: "square",
        from: 200,
        to: 70,
        durationMs: 420,
        volume: 0.028,
        attackMs: 10,
        holdMs: 60,
        drive: 0.6,
        filter: { type: "lowpass", frequency: 800, to: 300 },
      },
      {
        call: "noise",
        durationMs: 900,
        volume: 0.018,
        color: "pink",
        delayMs: 120,
        attackMs: 60,
        holdMs: 300,
        filter: { type: "bandpass", frequency: 2600, to: 1600, q: 1.2 },
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
        volume: 0.02,
        color: "white",
        delayMs: 140,
        attackMs: 40,
        filter: { type: "bandpass", frequency: 3000, to: 900, q: 2.2 },
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
        drive: 0.5,
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
        filter: { type: "bandpass", frequency: 3400, to: 800, q: 1.4 },
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

  // ── The screen ───────────────────────────────────────────────────────────
  wiper: {
    description:
      "One stroke of the wiper across a wet screen, heard from the seat: the " +
      "rubber dragging up the glass as a soft pink sweep rising in pitch, a " +
      "tiny knock at the top of the stroke, and the sweep back down. Only " +
      "ever raised inside the car, in time with the blades, and quiet enough " +
      "to be noticed rather than heard.",
    voices: [
      {
        call: "noise",
        durationMs: 330,
        volume: 0.014,
        color: "pink",
        attackMs: 40,
        holdMs: 160,
        filter: { type: "bandpass", frequency: 900, to: 1700, q: 1.4 },
      },
      {
        call: "noise",
        durationMs: 18,
        volume: 0.012,
        color: "brown",
        delayMs: 340,
        filter: { type: "bandpass", frequency: 700, q: 2 },
      },
      {
        call: "noise",
        durationMs: 300,
        volume: 0.011,
        color: "pink",
        delayMs: 380,
        attackMs: 40,
        holdMs: 140,
        filter: { type: "bandpass", frequency: 1600, to: 800, q: 1.4 },
      },
    ],
  },
};

/** Everything a RUN can make a noise with: the car and the stage, served
 * as one bank so the router never has to know which is which. */
export const RUN_BANK: SoundBank = { ...CAR_BANK, ...STAGE_BANK };

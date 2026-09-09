// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAMPAIGN'S COUNTRIES, and the six stages each of them runs. Every
// level is a SEED plus the dials it is built at — the stages are generated,
// not authored — so a location is a short table of them with the banner
// and the name the menu shows. Curating one is the `level-rating` skill's
// loop, and the numbers here are its output.

import type { CampaignLocation } from "./campaign.ts";

/** The Taiga ladder — the first country, and the game's opening hour.
 * Gravel through spruce, a village with tarmac through it, and water the
 * road fords rather than crosses.
 *
 * IT RUNS SPRING TO AUTUMN, and never in winter. The cold country is the
 * ALPINE's, six levels later, and a taiga that opened on ice said the game
 * had one landscape rather than three — the boreal forest under snow is a
 * different biome to look at, not a fourth face of this one. Winter here is
 * Roam's: every seed can still be driven in it, and R48's ice road with it.
 *
 * THE FIRST THREE RUNGS ARE THE TUTORIAL THE GAME DOES NOT HAVE, so they
 * are built rather than merely chosen. Each carries its own dials
 * (`knobs`), which is the whole reason a level may: a WIDER road, because
 * the first thing a player is learning is where the car points and a lane
 * that punishes a late turn-in teaches nothing; and a small DESCENT (R49),
 * because a road that gives speed back reads as fast without asking for
 * anything, and because this game rolls a car easily enough that a big one
 * would be a cliff to fall off rather than a gift. They fall away by rung —
 * 22 m of road at level one, then 21, then 19 — so the road has closed to
 * the game's own width by the time the ladder is asking real questions.
 *
 *   seed 30 short   sprint   1.79 km   82 s   79 km/h   a ford, a crest, 20.0 m of road
 *   seed 11 medium  circuit  1.72×3   225 s   82 km/h   16 calls a lap, 28 m of climb
 *   seed 48 medium  sprint   4.85 km  208 s   84 km/h   43 calls, two jumps, a bridge
 *   seed 46 long    circuit  2.74×3   372 s   80 km/h   28 bends a lap, 28% sealed
 *   seed 45 long    sprint   7.48 km  344 s   78 km/h   the country stands up, in rain
 *   seed  1 xlong   sprint  10.42 km  457 s   82 km/h   92 calls, 17 of them hard
 *
 * The bot drives all eighteen clean in all three cars: no spin, no roll,
 * no respawn and no damage anywhere on the ladder — which is the bar the
 * first three rungs exist to clear, because a wide road that still rolls
 * the car has taught nobody anything.
 */
const TAIGA: CampaignLocation = {
  id: "taiga",
  name: "Taiga",
  blurb: "Spruce, granite and cold water",
  biome: "taiga",
  levels: [
    {
      id: "taiga-1",
      name: "Broad Ford",
      seed: 30,
      length: "short",
      hour: 13,
      weather: "clear",
      season: "summer",
      // R21/R49 — the widest road in the game and a gentle fall through it.
      knobs: { width: 0.85, tilt: 0.7 },
      blurb: "A wide road falling through the spruce, one ford",
    },
    {
      id: "taiga-2",
      name: "Morning Loop",
      seed: 11,
      length: "medium",
      shape: "circuit",
      hour: 7,
      weather: "clear",
      season: "spring",
      // Still wide. No tilt: a lap comes back to its own start line, so
      // there is no descent to ask for (R49) — what a circuit wants is
      // FLAT, and this seed climbs 19 m a km against a band that allows 42.
      knobs: { width: 0.8 },
      blurb: "Three flat laps past the town, in the early light",
    },
    {
      id: "taiga-3",
      name: "Turbine Road",
      seed: 48,
      length: "medium",
      hour: 15,
      weather: "rain",
      season: "spring",
      // The last of the wide ones, and the narrowest of the three.
      knobs: { width: 0.7, tilt: 0.6 },
      blurb: "Forty-three calls under the turbines, in the wet",
    },
    {
      id: "taiga-4",
      name: "Village Loop",
      seed: 46,
      length: "long",
      shape: "circuit",
      hour: 19,
      weather: "storm",
      season: "summer",
      blurb: "Three laps through the village, a storm coming over",
    },
    {
      id: "taiga-5",
      name: "Hunter's Line",
      seed: 45,
      length: "long",
      hour: 22,
      weather: "rain",
      season: "autumn",
      blurb: "The country stands up, and the rain comes with it",
    },
    {
      id: "taiga-6",
      name: "The Long Dark",
      seed: 1,
      length: "xlong",
      hour: 23,
      weather: "storm",
      season: "autumn",
      blurb: "Ten kilometres and ninety calls, in the dark",
    },
  ],
};

/** The Desert ladder — the second country (R40), opened by winning the
 * taiga's table. Sand off the mountain, one length of real blacktop, and a
 * sky with two weathers in it: clear, and the dust coming across.
 *
 *   seed 33 short   sprint   1.73 km   83 s   75 km/h   one jump off the fan
 *   seed 43 medium  circuit  1.60×3   192 s   90 km/h   half of it sealed
 *   seed 16 medium  sprint   4.80 km  226 s   76 km/h   five jumps
 *   seed  4 long    circuit  2.75×3   436 s   68 km/h   25 bends a lap, none soft
 *   seed 11 long    sprint   7.92 km  393 s   72 km/h   68 bends in the dust
 *   seed 23 xlong   sprint  10.63 km  583 s   66 km/h   102 bends, no tarmac at all
 *
 * The desert's winter is its WET season (climate.ts), which is why the
 * fourth rung is the one before dawn in January and not the one at noon in
 * July. */
const DESERT: CampaignLocation = {
  id: "desert",
  name: "Desert",
  blurb: "Sand, saguaro and a sky with nothing in it",
  biome: "desert",
  levels: [
    {
      id: "desert-1",
      name: "Bajada",
      seed: 33,
      length: "short",
      hour: 12,
      weather: "clear",
      season: "summer",
      blurb: "Sand off the mountain, one jump",
    },
    {
      id: "desert-2",
      name: "Blacktop Ring",
      seed: 43,
      length: "medium",
      shape: "circuit",
      hour: 22,
      weather: "clear",
      season: "autumn",
      blurb: "Three laps, half of them on real road, after dark",
    },
    {
      id: "desert-3",
      name: "Arroyo",
      seed: 16,
      length: "medium",
      hour: 17.5,
      weather: "clear",
      season: "spring",
      blurb: "Five jumps in five kilometres, into a low sun",
    },
    {
      id: "desert-4",
      name: "Cold Dawn",
      seed: 4,
      length: "long",
      shape: "circuit",
      hour: 4,
      weather: "clear",
      season: "winter",
      blurb: "Three laps before sunrise, in the desert's one wet month",
    },
    {
      id: "desert-5",
      name: "Haboob",
      seed: 11,
      length: "long",
      hour: 18,
      weather: "storm",
      season: "autumn",
      blurb: "Eight kilometres with the dust coming across",
    },
    {
      id: "desert-6",
      name: "Dune Sea",
      seed: 23,
      length: "xlong",
      hour: 23,
      weather: "storm",
      season: "summer",
      blurb: "Ten kilometres of sand, not a metre of tarmac, at night",
    },
  ],
};

/** The Alpine ladder — the third country (R47), opened by winning the
 * desert's table. Every stage of it starts beside the snow, and every
 * sprint COMES DOWN — which is the country's whole character and is
 * test-enforced (`tests/campaign_test.ts`). The circuits close on
 * themselves and so stay up on the shoulder they start on.
 *
 *   seed 17 short   sprint   1.56 km   72 s   78 km/h   97 m down in a mile
 *   seed 30 medium  circuit  1.72×3   222 s   84 km/h   three laps on the shoulder
 *   seed 27 medium  sprint   5.12 km  209 s   88 km/h   225 m down, 64% sealed
 *   seed 41 long    circuit  2.55×3   469 s   59 km/h   three jumps a lap
 *   seed  3 long    sprint   7.48 km  361 s   75 km/h   259 m down, half of it sealed
 *   seed 38 xlong   sprint  10.96 km  594 s   66 km/h   306 m down, two tunnels
 *
 * Its dials are the country rather than the level: a high massif, and a
 * pass sealed to halfway up the rock band. */
const ALPINE_KNOBS = { elevation: 0.6, steepness: 0.6, asphalt: 0.5 };
const ALPINE: CampaignLocation = {
  id: "alpine",
  name: "Alps",
  blurb: "Snow, rock and a road that comes down",
  biome: "alpine",
  levels: [
    {
      id: "alpine-1",
      name: "The Col",
      seed: 17,
      length: "short",
      knobs: ALPINE_KNOBS,
      hour: 12,
      weather: "clear",
      season: "summer",
      blurb: "Off the pass and down, ninety metres in a mile",
    },
    {
      id: "alpine-2",
      name: "First Light",
      seed: 30,
      length: "medium",
      shape: "circuit",
      knobs: ALPINE_KNOBS,
      hour: 4,
      weather: "clear",
      season: "spring",
      blurb: "Three laps on the shoulder, before the sun clears the ridge",
    },
    {
      id: "alpine-3",
      name: "Switchbacks",
      seed: 27,
      length: "medium",
      knobs: ALPINE_KNOBS,
      hour: 23,
      weather: "rain",
      season: "spring",
      blurb: "Two hundred metres down wet tarmac, into the town",
    },
    {
      id: "alpine-4",
      name: "Ridge Ring",
      seed: 41,
      length: "long",
      shape: "circuit",
      knobs: ALPINE_KNOBS,
      hour: 17.5,
      weather: "clear",
      season: "autumn",
      blurb: "Three laps high up, with three jumps on each of them",
    },
    {
      id: "alpine-5",
      name: "Cloud Line",
      seed: 3,
      length: "long",
      knobs: ALPINE_KNOBS,
      hour: 21,
      weather: "storm",
      season: "autumn",
      blurb: "Two hundred and sixty metres down, half of it sealed, in a storm",
    },
    {
      id: "alpine-6",
      name: "Summit to Valley",
      seed: 38,
      length: "xlong",
      knobs: ALPINE_KNOBS,
      hour: 23,
      weather: "storm",
      season: "winter",
      blurb: "Three hundred metres down and through two tunnels, in a blizzard",
    },
  ],
};

export const LOCATIONS: CampaignLocation[] = [TAIGA, DESERT, ALPINE];

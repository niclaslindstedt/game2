// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FIELD — the fourteen crews the campaign is raced against.
//
// A rally stage is driven alone against the clock: the cars leave the start
// control one at a time, `START_INTERVAL` seconds apart, and the result is
// where your time slots into everybody else's. The player is always the LAST
// car on the road, which is why a position can only ever improve or hold as
// the stage goes on — everybody ahead has already been through the board you
// are arriving at.
//
// Each crew here is DATA: a name, a car, where they sit in the field, and a
// shape — how they like to spend the points a difficulty gives them
// (skill.ts). The shape is the interesting half. Every crew gets more points
// as the difficulty rises, but they always spend them the same way, so the
// field keeps its characters at every setting: Blink is always the one with
// the hands and no eyes, Metronome is always the one who never makes a
// mistake and never makes a move.
//
// Nothing in here is shown to the player yet beyond the alias on a timing
// screen. The descriptions are for whoever is TUNING the field — a crew you
// cannot describe in a sentence is a crew that is not actually different
// from the one above it.

import { budgetFor, profileFor, spend, type BotSkill, type Difficulty } from "./skill.ts";
import type { BotProfile } from "./bot.ts";

/** Seconds between cars leaving the start control. One minute's interval is
 * the real thing on a long stage and forever in a game; ten seconds is the
 * short end of what a club rally actually runs, and it is what makes the
 * player's start number a number rather than an afternoon. */
export const START_INTERVAL = 10;

export type RivalCrew = {
  id: string;
  /** What the timing screens call them. Aliases rather than names because a
   * position board read at 140 km/h has room for one word. */
  alias: string;
  driver: string;
  carId: string;
  /** Where the crew sits in the field's budget band: 0 is the tail, 1 the
   * head. Two crews never share one — the seeding order is this, sorted. */
  standing: number;
  /** How they spend what they are given. Relative weights, not points: a
   * crew is a SHAPE, and the difficulty decides how much of it they can
   * afford. Never zero — an axis nobody has any of is a car that cannot be
   * driven rather than a weakness. */
  weights: BotSkill;
  /** What they are good at and what lets them down, for whoever is tuning
   * the field. */
  notes: string;
};

const W = (
  commitment: number,
  attack: number,
  vision: number,
  hands: number,
  nerve: number,
  recovery: number,
): BotSkill => ({ commitment, attack, vision, hands, nerve, recovery });

export const RIVALS: RivalCrew[] = [
  {
    id: "frostbite",
    alias: "Frostbite",
    driver: "Elina Roine",
    carId: "coupe",
    standing: 1,
    weights: W(9, 8, 9, 8, 7, 7),
    notes:
      "The benchmark, and the only crew in the field with no hole in it. Nothing is her best and nothing is her worst: she looks a corner and a half ahead, leans on the tires exactly as hard as they will take, and is gone before the flick has finished. Beating her takes a clean run of your own rather than somebody else's accident.",
  },
  {
    id: "blink",
    alias: "Blink",
    driver: "Aron Tahti",
    carId: "compact",
    standing: 0.92,
    weights: W(9, 8, 2, 10, 9, 7),
    notes:
      "Reflexes that can save anything, and no interest at all in seeing it coming — he aims at his own bonnet and sorts the rest out with his hands. Devastating where he can improvise: open, flowing, wide. Expensive anywhere blind, where he meets the hairpin already far too fast and then catches it beautifully, forty metres late.",
  },
  {
    id: "wolverine",
    alias: "Wolverine",
    driver: "Kaisa Ahonen",
    carId: "coupe",
    standing: 0.85,
    weights: W(8, 10, 6, 7, 6, 10),
    notes:
      "Attacks every corner as though it owes her money, and is out of the ditch and back on the throttle before the dust has come down. Gives away time she never needed to give away and takes it straight back. Stages that punish a mistake HARD — trees, water, a narrow shelf — are where the arithmetic stops working for her.",
  },
  {
    id: "metronome",
    alias: "Metronome",
    driver: "Otto Lindqvist",
    carId: "compact",
    standing: 0.78,
    weights: W(7, 2, 10, 9, 1, 8),
    notes:
      "Never quick, never wrong. He does not drift and he does not gamble; he is on the brakes before anybody else has seen the corner and he has never once been surprised by one. Over a short stage the attackers simply walk away from him. Over a long one they come back to him, one mistake at a time.",
  },
  {
    id: "skarv",
    alias: "Skarv",
    driver: "Halvard Sund",
    carId: "coupe",
    standing: 0.71,
    weights: W(10, 5, 10, 3, 6, 4),
    notes:
      "Named for the cormorant, and he flies a stage the same way: long, flat, and looking a very long way ahead. Carries enormous entry speed on the strength of what he has already seen. The wheel answers slowly, though, so anything that asks for a sudden correction — a crest that lands crooked, a rut, a rock — costs him twice what it should.",
  },
  {
    id: "sanna",
    alias: "Sideways",
    driver: "Sanna Hult",
    carId: "classic",
    standing: 0.64,
    weights: W(6, 10, 6, 9, 10, 5),
    notes:
      "Sideways from the first junction to the finish board, and genuinely fast doing it: the slide is her technique, not her showmanship. She barely touches the brakes all stage. What she does not have is the patience to slow a car that is already too fast for the corner, so the tight ones cost her everything the fast ones won.",
  },
  {
    id: "granite",
    alias: "Granite",
    driver: "Pirjo Laine",
    carId: "coupe",
    standing: 0.57,
    weights: W(10, 1, 7, 6, 1, 5),
    notes:
      "Brakes the way a landslide stops. She will out-carry anybody INTO a corner and out-stop them at the end of it, but nothing except the front tires ever rotates that car, so a hairpin takes her about twice as long as it needs to. Give her a fast, open stage and she is a problem.",
  },
  {
    id: "anvil",
    alias: "The Anvil",
    driver: "Yrjo Palo",
    carId: "classic",
    standing: 0.5,
    weights: W(10, 9, 1, 6, 7, 6),
    notes:
      "Hits the stage one corner at a time, and hits it hard. What is beyond the next bend has never been information he wanted. Flat and open, he is a match for crews a tier above him; give him a blind crest onto a hairpin and he arrives at it entirely by surprise.",
  },
  {
    id: "kettle",
    alias: "Kettle",
    driver: "Liina Marttinen",
    carId: "compact",
    standing: 0.43,
    weights: W(6, 9, 5, 6, 9, 1),
    notes:
      "Boils over. She has the attack of a crew two tiers up and absolutely nothing to fall back on when it goes wrong — a car off the road stays off the road, nose against a trunk, while the whole field files past. Every stage she does finish, she finishes well.",
  },
  {
    id: "diesel",
    alias: "Diesel",
    driver: "Mika Kervinen",
    carId: "classic",
    standing: 0.36,
    weights: W(9, 1, 8, 4, 5, 6),
    notes:
      "Hauls it along the straights and declines to turn. He sees everything coming and answers all of it with the throttle: never lifts where he does not have to, never rotates where he should. The stage's shape decides his whole result — a fast open one flatters him, a tight one buries him.",
  },
  {
    id: "oldsnow",
    alias: "Old Snow",
    driver: "Vidar Fjell",
    carId: "classic",
    standing: 0.29,
    weights: W(4, 3, 10, 1, 2, 7),
    notes:
      "Twenty years of stages behind the eyes and none of the hands left. He knows what is coming before anybody, brakes for it earlier than anybody needs to, and then takes an age getting the car pointed at the exit. Dark, wet and slow suits him. Anything quick does not.",
  },
  {
    id: "birch",
    alias: "Birch",
    driver: "Tor Backlund",
    carId: "compact",
    standing: 0.21,
    weights: W(1, 2, 8, 10, 1, 7),
    notes:
      "Perfectly tidy and perfectly slow. Lovely hands, sensible lines, and no willingness whatsoever to lean on the tires: every corner is taken at the speed he is certain of rather than the speed the car has. Nobody has ever passed him in a ditch, and nobody has ever had to.",
  },
  {
    id: "moth",
    alias: "The Moth",
    driver: "Nea Virtala",
    carId: "compact",
    standing: 0.12,
    weights: W(6, 7, 1, 1, 6, 10),
    notes:
      "Drawn to the scenery. She will commit to anything and hold a line through none of it, so a good half of her stage is spent finding the road again — which, to her credit, she does faster than anyone else in the field. On a wide forgiving stage that is merely untidy. In the trees it is a results sheet.",
  },
  {
    id: "sprat",
    alias: "Sprat",
    driver: "Rasmus Oberg",
    carId: "classic",
    standing: 0.04,
    weights: W(5, 5, 5, 5, 5, 5),
    notes:
      "The tail of the field, and the only crew in it with no shape at all: a little of everything and not enough of anything. He is the line every other rival is measured against — a difficulty that cannot beat Sprat is not a difficulty.",
  },
];

/** Everybody on the start list, the player included. */
export const FIELD_SIZE = RIVALS.length + 1;

/** One crew, entered for a stage at a difficulty: their start number and the
 * driver the bot actually becomes. */
export type RivalEntry = {
  crew: RivalCrew;
  /** Start number, 1-based. Car 1 leaves first; the player is last. */
  number: number;
  skill: BotSkill;
  profile: BotProfile;
};

/** The player's own start number — last car on the road (R29). */
export const PLAYER_NUMBER = FIELD_SIZE;

/** The field entered for a stage, in START ORDER. Seeded the way a gravel
 * rally seeds: the crews with the reputation go first, so the road ahead of
 * the player gets slower as the numbers climb, and the last car out is the
 * one with everything to prove. */
export function rivalField(difficulty: Difficulty): RivalEntry[] {
  return [...RIVALS]
    .sort((a, b) => b.standing - a.standing)
    .map((crew, index) => {
      const skill = spend(budgetFor(difficulty, crew.standing), crew.weights);
      return { crew, number: index + 1, skill, profile: profileFor(skill) };
    });
}

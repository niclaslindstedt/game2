// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW GOOD A BOT IS — the skill model the campaign's field is built out of.
//
// The bot driver (bot.ts) reads a `BotProfile`: ten numbers that say how
// much grip it plans around, how far ahead it looks, how hot it arrives.
// Those numbers are a good driver's, and they are not a difficulty dial:
// nothing about them says which of two profiles is the better crew, and
// nothing stops a hand-authored one being fast in a way no human is.
//
// So this module puts a BUDGET in front of them. Skill is spent on six
// AXES, each worth up to `AXIS_MAX` points, and each axis moves one or two
// profile numbers from what a novice does to what the best crew in the game
// does. A difficulty is then a single number — how many points the field
// gets to spend — and a crew is a way of spending them.
//
// Two things fall out of that, and they are the whole reason it is built
// this way:
//
//   * EVERY axis is a real driving skill, and every point buys pace the
//     honest way — reading further ahead, braking more precisely, trusting
//     more of the tire. There is no handicap knob, no time penalty, no
//     rubber band. An easy bot is slow because it drives like somebody who
//     is slow, and it makes a slow driver's mistakes.
//   * A budget cannot buy everything. A crew that spends its points on
//     attack has none left for vision, so it arrives at the hairpin quicker
//     AND later — which is what makes fourteen rivals fourteen characters
//     rather than one bot at fourteen volumes.
//
// What the budget does NOT buy is how a crew behaves around other cars. That
// is temperament rather than skill — it is not monotone in pace, so no axis
// can own it — and it comes off the crew's own `temper` through the band a
// difficulty sets (`temperFor`, and `AGGRO` in bot.ts).
//
// Tuning happens here and in rivals.ts, and it is measured with
// `npm run sim -- --field`, which drives the whole field and prints what
// each difficulty actually does to the clock.

import { clamp } from "../lib/math.ts";
import type { GearboxMode } from "../game/defs/cars.ts";
import { RALLY_BOT, type BotProfile } from "./bot.ts";

/** The six things a rally driver can be good at, as this game's bot has
 * levers for. Every one of them is MONOTONE IN PACE — more points is a
 * quicker driver, never a slower one — and that is not an assumption: each
 * range below was swept one knob at a time against `RALLY_BOT` over four
 * campaign stages and all three cars before it was written down. An axis
 * whose knob turned out to do nothing (the bot's `planHorizon`, which is
 * flat above about a second) is not an axis. */
export const SKILL_AXES = [
  /** How much of the car's grip they are willing to lean on. */
  "commitment",
  /** How hot they arrive at a corner, and how many corners they think are
   * worth flicking at all. */
  "attack",
  /** How far through the corner they are already looking. */
  "vision",
  /** How much authority the wheel has in their hands. */
  "hands",
  /** How far over their own plan they will run before touching the brakes. */
  "nerve",
  /** How fast they get out of a mistake once they are in one. */
  "recovery",
] as const;

export type SkillAxis = (typeof SKILL_AXES)[number];

/** Points on ONE axis. Ten, so a crew's spend reads as a percentage and a
 * whole-number weight can still land on a fraction of an axis. */
export const AXIS_MAX = 10;

/** The most any crew can be worth: every axis maxed. */
export const SKILL_MAX = AXIS_MAX * SKILL_AXES.length;

/** A crew's points, per axis. */
export type BotSkill = Record<SkillAxis, number>;

/** The profile fields an axis is allowed to move. `rotationRef` is the
 * calibration `hotEntry` is quoted against rather than a skill, and
 * `planHorizon` measured flat, so neither is one of them. */
type TunedKnob =
  | "latFraction"
  | "steerGain"
  | "lookahead"
  | "hardCurvature"
  | "hotEntry"
  | "brakeMargin"
  | "brakeUse"
  | "reverseAfter"
  | "reverseSpeed"
  | "offRoadGiveUp";

/** What a point on each axis BUYS: the profile number at zero points, and
 * the same number with the axis maxed. Read each pair as novice → ace,
 * whichever direction the number runs.
 *
 * The measured authority of each axis, as a fraction of `RALLY_BOT`'s stage
 * time swept end to end, is in the comments. They are not equal and there is
 * no point pretending they are: this bot is limited almost entirely by the
 * speed it plans corners at, so `commitment` is worth more than the other
 * five together. What the rest buy is the difference between crews on the
 * same budget — which is the half of the model the player actually meets. */
const AXIS_KNOBS: { axis: SkillAxis; knob: TunedKnob; novice: number; ace: number }[] = [
  // ±20%. The corner-speed plan is sqrt(latCeiling · latFraction / κ), so
  // this is most of the difference between a crew that arrives and one that
  // has already gone. Quoted against the TRACTION CEILING (`game/limits.ts`)
  // — what the tires deliver — rather than against `gripAccel`, which is
  // where the slide starts easing in and is `1 / latCeiling` of it.
  { axis: "commitment", knob: "latFraction", novice: 0.24, ace: 0.61 },
  // ±5%: a novice brakes down to the geometric cap and drives round it, an
  // ace arrives over it and lets the slide scrub the rest…
  { axis: "attack", knob: "hotEntry", novice: 0, ace: 5 },
  // …±10%: and thinks far more of the road is worth a flick. The threshold
  // a bend has to bend past to earn one comes DOWN as the axis fills.
  { axis: "attack", knob: "hardCurvature", novice: 1 / 20, ace: 1 / 48 },
  // ±15%. Where the eyes are: a novice aims at their own bonnet and saws at
  // the wheel all the way round, an ace is already looking at the exit and
  // the car takes the shorter line for free.
  { axis: "vision", knob: "lookahead", novice: 0.34, ace: 1.2 },
  // ±10%. Below about 1.6 the wheel is not answering the road any more.
  { axis: "hands", knob: "steerGain", novice: 0.8, ace: 2.4 },
  // ±14% together. Nerve is how LITTLE they brake: the margin they will run
  // over their own plan before the pedal is touched, and how much of the
  // car's braking that plan trusts it will get if it is. On gravel the
  // quick crews barely brake at all — the slide is what scrubs the speed.
  { axis: "nerve", knob: "brakeMargin", novice: 0.6, ace: 7 },
  { axis: "nerve", knob: "brakeUse", novice: 0.45, ace: 0.95 },
  // Nothing at all on a clean run, and whole minutes on a bad one: this is
  // not pace, it is what a mistake COSTS. A crew with no recovery sits
  // against the trunk it hit while the field files past.
  { axis: "recovery", knob: "reverseAfter", novice: 3, ace: 0.55 },
  { axis: "recovery", knob: "reverseSpeed", novice: 2, ace: 4.5 },
  { axis: "recovery", knob: "offRoadGiveUp", novice: 14, ace: 5 },
];

/** The driving profile a spend produces. */
export function profileFor(skill: BotSkill): BotProfile {
  const profile: BotProfile = { ...RALLY_BOT };
  for (const { axis, knob, novice, ace } of AXIS_KNOBS) {
    const at = clamp(skill[axis] / AXIS_MAX, 0, 1);
    profile[knob] = novice + (ace - novice) * at;
  }
  return profile;
}

/** Points on `hands` from which a crew takes the gears themselves.
 *
 * The manual is the racing set — taller and pulling harder, for a beat of
 * throttle at every shift (TUNING.gearbox) — and it is the crews with the
 * car control who are trusted with it, so the box is part of a character
 * rather than a rank: the one with the hands drives their own box at every
 * difficulty, and a crew who spent their points on eyes and nerve leaves it
 * to the automatic however quick they are. It is also why the head of the
 * field gets FASTER as the difficulty climbs by more than their plan alone:
 * a hard field is a field driving its own gearboxes.
 *
 * Set where the ladder READS: nobody on easy, the two crews who bought
 * hands on medium, and six of the fourteen on hard. */
export const MANUAL_HANDS = 5.5;

/** Which box a crew drives, from what they are worth. */
export function gearboxFor(skill: BotSkill): GearboxMode {
  return skill.hands >= MANUAL_HANDS ? "manual" : "auto";
}

/** What a crew is WORTH, in points — the sum of its axes. */
export function skillPoints(skill: BotSkill): number {
  let total = 0;
  for (const axis of SKILL_AXES) total += skill[axis];
  return total;
}

/** Spend `budget` points across the axes in the proportions `weights` asks
 * for. An axis that fills up keeps its cap and its share goes back into the
 * pot, so a crew that wanted everything in one place still ends up with a
 * complete car rather than throwing points away — which is what makes a
 * lopsided character a SHAPE at low budgets and merely a lean at high ones.
 */
export function spend(budget: number, weights: BotSkill): BotSkill {
  const skill = {} as BotSkill;
  for (const axis of SKILL_AXES) skill[axis] = 0;
  let left = clamp(budget, 0, SKILL_MAX);
  let open = SKILL_AXES.filter((axis) => weights[axis] > 0);
  while (left > 1e-9 && open.length > 0) {
    let total = 0;
    for (const axis of open) total += weights[axis];
    const pot = left;
    left = 0;
    const filled: SkillAxis[] = [];
    for (const axis of open) {
      skill[axis] += (pot * weights[axis]) / total;
      if (skill[axis] >= AXIS_MAX) {
        left += skill[axis] - AXIS_MAX;
        skill[axis] = AXIS_MAX;
        filled.push(axis);
      }
    }
    if (filled.length === 0) break;
    open = open.filter((axis) => !filled.includes(axis));
  }
  return skill;
}

/** The three settings the campaign offers, and what the field is worth in
 * each. `budget` is the points the MIDDLE of the field gets; `spread` is how
 * far the head of the field is from its tail, so a difficulty is a band of
 * crews rather than fourteen copies of one.
 *
 * The bands overlap on purpose: the quickest easy crew is about as good as
 * the slowest medium one, which is what makes stepping up a difficulty feel
 * like the field closing in rather than a different game. `RALLY_BOT` — the
 * profile the repo's sim tables are measured with — is worth about 44
 * points, which puts it at the head of MEDIUM and in the middle of HARD. */
export type Difficulty = "easy" | "medium" | "hard";

/** How a difficulty's field behaves AROUND OTHER CARS, as the band the
 * crews' own tempers are spread across (`temperFor`). It is a second dial
 * beside the budget and deliberately not part of it: `aggression` is not a
 * skill and is not monotone in pace (bot.ts), so a crew cannot buy it and a
 * quick field is not automatically a dirty one.
 *
 * The bands are read against bot.ts's `AGGRO` thresholds, and they are what
 * each setting PROMISES:
 *
 *   EASY tops out just past `AGGRO.clean`, so the field gives way, the
 *   worst of it is a nudge from the two or three crews with a temper, and
 *   nobody on it is trying to put anyone off the road.
 *   MEDIUM tops out just under `AGGRO.dirty`: half the field will lean on
 *   you and none of it will end your run on purpose.
 *   HARD reaches the top of the scale, and its floor is high enough that
 *   even the mild crews will hold their line. This is where the rear
 *   quarter gets used. */
export type TemperBand = {
  /** What the mildest crew in the field is worth. */
  calm: number;
  /** …and the one with the reputation. */
  wild: number;
};

export const DIFFICULTIES: Record<
  Difficulty,
  { label: string; budget: number; spread: number; aggression: TemperBand }
> = {
  easy: { label: "EASY", budget: 11, spread: 15, aggression: { calm: 0, wild: 0.5 } },
  medium: { label: "MEDIUM", budget: 19, spread: 17, aggression: { calm: 0.1, wild: 0.72 } },
  hard: { label: "HARD", budget: 28, spread: 16, aggression: { calm: 0.25, wild: 1 } },
};

export const DIFFICULTY_IDS: Difficulty[] = ["easy", "medium", "hard"];

/** The points one crew gets: the difficulty's budget, moved by where the
 * crew stands in the field (0 is the tail, 1 is the head). */
export function budgetFor(difficulty: Difficulty, standing: number): number {
  const { budget, spread } = DIFFICULTIES[difficulty];
  return clamp(budget + spread * (clamp(standing, 0, 1) - 0.5), 0, SKILL_MAX);
}

/** What one crew is worth AROUND OTHER CARS: their own temper (0 is the
 * mildest driver on the roster, 1 the one with the reputation), placed in
 * the difficulty's band. A crew keeps its rank in the field's temper at
 * every setting — Scrapper is always the one to watch — and what moves is
 * how much the setting lets any of them do about it. */
export function temperFor(difficulty: Difficulty, temper: number): number {
  const { calm, wild } = DIFFICULTIES[difficulty].aggression;
  return calm + (wild - calm) * clamp(temper, 0, 1);
}

// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the stage generator's rule book (`rules.ts`): WHAT THE
// DIFFICULTY DIAL MULTIPLIES (R46) — one `{ easy, hard }` pair per rule the
// dial reaches, read through `challengeMul` / `challengeSkew` in
// `rules-country.ts`. Spread into `STAGE_RULES` by `rules-book.ts`.

export const DIAL_RULES = {
  /** R46 — THE DIFFICULTY DIAL, and every rule above that it leans on.
   *
   * Each entry is read at the dial's two ENDS. A `{ easy, hard }` pair is a
   * MULTIPLIER on the rule's own number — `easy` at the bottom of the dial,
   * `hard` at the top, and exactly 1 in the middle (`challengeMul`), which
   * is what makes the middle of this dial the game as it was measured. A
   * bare number is a SKEW (`challengeSkew`) on the roll that is about to be
   * read onto a band: positive leans the draw toward the top of that band,
   * negative toward the bottom, and neither ever leaves it — the vocabulary
   * still says what a corner or a lip may BE, and this only says which of
   * them the dice keep landing on.
   *
   * The numbers are deliberately modest either side of the middle. A dial
   * that doubles a rule does not make a harder stage, it makes a different
   * generator: the corners stop being corners the car can take, and the
   * search spends its attempts refusing its own geometry. */
  challenge: {
    /** How much of the stage is corner at all (`turnChance`). At the top
     * of the dial five segments in six bend. */
    turns: { easy: 0.82, hard: 1.16 },
    /** ...and how many of those corners come out of R3's HARD bucket
     * (`severityChance.hard`). The medium share is left where it is, so
     * what a harder dial spends is the SOFT turns — the ones taken flat.
     *
     * It does NOT buy many more hairpins, and cannot: R4 says a hard turn
     * only follows a straight, and a harder stage has fewer straights, so
     * most of the extra hard rolls come back down as mediums (measured
     * over seeds 1-8: the hairpin share sits at 8% of the corners at every
     * dial position). What the dial actually spends this on is the FAST
     * corners — half the turns are soft at the bottom of the dial and a
     * sixth at the top. */
    hardShare: { easy: 0.55, hard: 1.3 },
    /** Where in its own severity's radius band a corner is drawn (R3).
     * Down: a hard dial's mediums are the tight mediums. */
    radius: -0.9,
    /** ...and how far round that radius it is swept (R3's angle band). Up,
     * because a corner is hard for how long it holds the car as much as
     * for how tight it is. */
    angle: 0.6,
    /** Where in R6's ramp band a lip is drawn. Up is a steeper ramp, which
     * is a longer flight and more air under the car — the search still has
     * to find somewhere for it to land. */
    jump: 0.9,
    /** ...and how LONG the ramp that grade is raised over is, drawn down as
     * the dial rises. A grade alone does not make a bigger jump: the lip it
     * multiplies out to is capped (`jump.lipHeight`), and on the longest
     * ramps that cap is what the car actually leaves at — 2.2 m over 22 m
     * is the gentlest launch in the band whatever the roll said. Shorter,
     * and the ramp is built at the grade that was drawn. */
    rampLength: -0.7,
    /** ...and how often an eligible straight carries a lip at all
     * (`featureChance.jump`). It has to RISE with the dial to stand still:
     * a harder stage is more corner, so there are fewer straights long
     * enough to hold a jump, and the steeper ramps are refused more often
     * by R6's landing zone. Measured over seeds 1-8 at medium, a flat
     * chance took the stage from fourteen jumps to four. */
    jumpChance: { easy: 0.8, hard: 1.9 },
    /** R21 — a multiplier on the road's own width. Clamped back inside
     * `roadWidth` afterwards (`roadWidthOf`), so nothing downstream ever
     * meets a road outside the band it was built for. */
    width: { easy: 1.12, hard: 0.82 },
    /** R34 — how high the country beside the road stands its relief, road
     * roll and all. This is the half of the dial you meet by LEAVING the
     * road: a hillside to fall down rather than a field to spin on. */
    relief: { easy: 0.85, hard: 1.3 },
  },
} as const;

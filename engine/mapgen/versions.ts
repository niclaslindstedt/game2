// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH GENERATOR BUILT THIS ROAD — the stage generator's versions, and the
// contract that lets a campaign level outlive a change to the rules.
//
// The problem this exists for: a stage is generated fresh from its seed, so
// the rules ARE the stage. Move a turn radius, a placement rule, a
// compilation step, and seed 30 stops being the road that was rated, timed,
// previewed and written a blurb for — silently, everywhere, at once. The
// campaign is the one part of the game where that is not acceptable: those
// eighteen roads were CURATED, and a ladder that re-rolls under its own
// levels is a ladder nobody chose.
//
// So a level names the version it was curated under, and that version keeps
// building it. Nothing else does: Roam, the daily seed, every sweep and
// every test take `CURRENT` and move with the rules, which is the whole
// point of having a generator.
//
// THE CONTRACT, in four lines:
//
//   1. A change that moves what a seed builds gets a NEW version — a row
//      here, with a note saying what moved.
//   2. The old row keeps the old behaviour, through a TRAIT read at the one
//      place the behaviour differs (see `GeneratorTraits` below).
//   3. A campaign level moves to the new version DELIBERATELY: re-rated,
//      re-timed, re-previewed, re-blurbed. That is the `level-rating`
//      skill's curation loop, and it is the reason this file exists.
//   4. A version no campaign level names any more is DELETED — the row, and
//      every trait branch that only existed for it. `tests/generator_version_test.ts`
//      is what refuses to let one linger.
//
// Rule 4 is the half people forget, and it is what keeps this from becoming
// a museum of every generator the game ever had. Backward compatibility is
// owed to the eighteen committed roads and to nothing else.

/** A generator version — a whole number that only ever counts up. */
export type GeneratorVersion = number;

/** One version of the generator: what it is, and every way it differs from
 * the current rules.
 *
 * `version` and `note` are the whole row today, because there is one
 * version and it has nothing to be different from. A LEGACY trait is added
 * here as an OPTIONAL field the moment a change first re-rolls a pinned
 * road — `{ tightHairpins?: boolean }`, `{ fordWidth?: number }` — set on
 * the old rows and absent from the current one, so the code reads
 *
 *     const traits = generatorTraits(knobs.version);
 *     const radius = traits.tightHairpins ? OLD : R.turn.hard.radius;
 *
 * at the ONE place the behaviour differs and nowhere else. Absent means
 * "build it the way the rules say", which is what makes the current row's
 * branch the one the optimiser and the reader both see first.
 *
 * A trait is never a dial. Dials are `StageKnobs` and a player turns them;
 * a trait is a fossil kept alive for as long as a curated road stands on
 * it, and it goes in the ground with its version. */
export type GeneratorTraits = {
  version: GeneratorVersion;
  /** One line on what this version of the generator is. On a legacy row,
   * what the version AFTER it changed — which is what tells the next
   * session whether the row is still earning its keep. */
  note: string;
};

/** Every version the generator can still build, oldest first.
 *
 * The last row is the rules as they stand in this tree; everything above it
 * is a fossil, alive only because a campaign level still names it. */
export const GENERATOR_VERSIONS: readonly GeneratorTraits[] = [
  {
    version: 1,
    note: "The generator as the campaign's eighteen roads were curated on it.",
  },
];

/** What a stage is built by unless something pins it to an older set of
 * rules. Every entry point that is not a campaign level lands here. */
export const CURRENT_GENERATOR_VERSION: GeneratorVersion =
  GENERATOR_VERSIONS[GENERATOR_VERSIONS.length - 1].version;

/** The versions this build can still be asked for, as a set — the check
 * `resolveKnobs` makes, and the list a test walks. */
export const GENERATOR_VERSION_IDS: readonly GeneratorVersion[] = GENERATOR_VERSIONS.map(
  (row) => row.version,
);

export function isGeneratorVersion(value: unknown): value is GeneratorVersion {
  return typeof value === "number" && GENERATOR_VERSION_IDS.includes(value);
}

/** The rules a version builds by. A version this build has never heard of —
 * a stale link, a save from a tree where the row still existed — is the
 * CURRENT one rather than an error: the road will not be the one that save
 * remembers, and there is no version of this code that could make it be. */
export function generatorTraits(version: GeneratorVersion): GeneratorTraits {
  return (
    GENERATOR_VERSIONS.find((row) => row.version === version) ??
    GENERATOR_VERSIONS[GENERATOR_VERSIONS.length - 1]
  );
}

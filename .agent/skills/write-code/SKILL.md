---
name: write-code
description: "Use before writing or changing ANY code in this repo — engine, app, scripts, tests. Owns every rule about the code itself: what a comment is for and the COMMENT PRUNING pass that strips history references and promotes the lessons worth keeping, leaving the tree cleaner than you found it (every warning, every needlessly bad algorithm), the sub-second edit loop, the 1000-line file cap, the test conventions, and the generic pools and import aliases. Load it alongside the skill that owns the SUBJECT — this one is about the code, that one is about the thing."
---

# Writing code

Load this **whenever a task will change a source file**, alongside the skill
that owns the subject (`engine-system`, `mapgen-improvement`, `bot-improvement`,
…). That one knows what you are building; this one knows how code is written
here.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs write-code --list`, then the ones your task
touches (`--scope=…`, `--concepts=…`). Reflecting them back before the commit
is the `skill-reflection` skill's job; load it at both ends of the session.

**Where a given piece of code GOES is not this skill's question** — that is the
"Where new code goes" table and the "Hard rules" in `AGENTS.md`. Read those
first when the location is in doubt; come back here for how the code inside the
file reads.

---

## Comment pruning

The comments in this repo carry real design reasoning and are worth having.
What they should not carry is **the history of how the code got here**: "it
used to be", "the old behaviour", "this replaced", "previously". Every one of
those is already in the repo's history, told better and with the diff attached.

### Where it comes from — so stop doing it

An agent changes a number and writes a comment narrating the change. That reads
perfectly at the moment of writing and is landfill a month later, because the
reader has no idea which "used to" is from which change or whether any of it is
still true.

> **The commit message and the PR description are where a change is narrated.
> A comment is where the code that is there is explained.**

Write the comment for somebody who has never seen the previous version, because
that is who reads it.

### Prune what you touch

Pruning is **opportunistic, not a sweep**: when you open a file to change it,
prune the comments in it. Do not go hunting the whole tree unless the task is
explicitly a pruning pass — and if a prune balloons past the change that
prompted it, split it into its own commit so the real diff stays readable.

### The decision table

| The comment says…                                                          | Do                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| How the code works, why a number is that number, what a caller must not do | **KEEP** — this is the comment doing its job                                    |
| What the code USED to be, and nothing else                                 | **DELETE**                                                                      |
| A live rule, _justified by_ what it used to be                             | **REWRITE** — keep the rule, restate the reason in the present, cut the story   |
| A rule bigger than this file (a seam, a budget, a trap in another module)  | **VALIDATE**, move it to a lesson fragment or the doc that owns it, then delete |
| Commented-out code                                                         | **DELETE**                                                                      |
| A restatement of the line below it (`// increment i`)                      | **DELETE**                                                                      |
| A `TODO`/`FIXME` whose condition has already been met                      | **DELETE** — do the thing or drop the note                                      |

**The third row is the one that matters, and the one a careless pass gets
wrong.** History is usually _welded to_ a real rule rather than standing alone,
so deleting the paragraph deletes the reasoning with it. Keep the claim; drop
the narrative.

### Moving a lesson out of the code — VALIDATE FIRST

Some history comments are load-bearing: they are the only written record of a
trap that bites somewhere else in the tree. Those get promoted rather than
deleted — but **a comment is not evidence.** It was written against a version of
the code that is gone, and the thing it warns about may already have been
fixed, renamed, or made impossible. **A false lesson is worse than no lesson**,
because the next session obeys it.

Three gates before anything leaves a comment and becomes a fragment:

1. **Is it still TRUE?** Prove it against today's code — read the function it
   names, run the test that would fail, `grep` for the pattern it forbids.
   **When a comment names a symbol, grep for it first** — a symbol whose only
   remaining hits are other comments is a GHOST, and ghosts travel in packs:
   sweep every hit in one pass, or the next session finds the survivors and
   assumes the thing is real.
2. **Is it bigger than this file?** A rule that only explains the function it
   sits above stays a comment. Promote only what a session working in a
   _different_ file would need and would not find.
3. **Does something already say it?** Check `AGENTS.md`, the doc named in its
   sync table, and the owning skill's `SKILL.md` and lessons
   (`node scripts/skill-lessons.mjs --scope=<path>`). A rule in two places
   drifts, and then neither is trustworthy.

Then write it where it belongs — the doc if `AGENTS.md`'s sync table names one,
otherwise a lesson fragment on the skill that owns the subject. Only then
delete the comment.

### Finding them

```sh
grep -rnE '(//|\*) ?.*\b(used to|previously|formerly|originally|no longer|we once|old behaviou?r|this replaces|renamed from|before the refactor)\b' --include='*.ts' --include='*.tsx' --include='*.mjs' <path>
```

Read every hit — the phrase is a _candidate_, not a verdict. "No longer" is
often a live statement about how the code behaves today, and that one stays.

---

## What a comment is for

- **The WHY, not the WHAT.** The code says what it does. A comment earns its
  place by saying what the code cannot: the reason for a number, the invariant
  a caller must not break, the thing that looks wrong and is deliberate.
- **Units and ranges on every tuning number** (meters, m/s, m/s², seconds,
  radians, 0–1). The engine works in meters and seconds; a bare number in
  `defs/tuning.ts` or `defs/cars.ts` without a unit is a bug waiting for its
  next reader.
- **Match the file's density and voice.** This repo's engine and defs modules
  are deliberately prose-heavy, and that is the house style — pruning is about
  HISTORY, never about stripping a file back to bare declarations. A file whose
  neighbours all carry a block header gets one too.
- **Name the failure a rule prevents.** "Counter-steer only once the nose is
  nearly where it should be — damping earlier is what runs a drift wide" beats
  "damp the counter-steer".

---

## Leave the tree cleaner than you found it

- **Fix every error and warning you encounter, even ones you didn't cause.** A
  `make lint` / `make test` / typecheck run that surfaces a pre-existing error
  or warning is part of the job: fix it in the same session rather than working
  around it or reporting it as "not mine". The baseline is zero errors and zero
  warnings — anything above zero hides the next real regression.
- **Fix inefficient algorithms on sight.** A needlessly bad complexity or a
  wasteful hot-path pattern (an O(n²) scan over track samples where an index
  walk works, per-step allocation inside `step()` — it runs 120×/s, per-frame
  allocation in the renderer) gets fixed even when it is unrelated to the task.
  Keep the fix behaviour-preserving, verify it with the relevant tests (and
  `make sim` when it touches the engine), and mention it in the PR description.
- **Prune the comments in what you touch** (above).
- Never widen the scope past this. Refactoring a module you merely read is not
  leaving the tree cleaner; it is a second PR.

---

## The edit loop

Whole-repo checks cost the same whether one file changed or four hundred did.
**They are the GATE on the commit, not a step on the way to it.** While
iterating, check only what you touched; all of these are fast:

| Just edited                  | Run                                                           |
| ---------------------------- | ------------------------------------------------------------- |
| a `.ts`/`.tsx`/`.mjs` file   | `npx eslint <paths>`                                          |
| anything type-bearing        | `npx tsc --noEmit -p tsconfig.json` (or `pwa/tsconfig.json`)  |
| a test's subject             | `npx vitest run tests/<that-one>_test.ts`                     |
| formatting you are unsure of | `npx prettier --check <paths>`                                |
| handling / generator numbers | `npm run sim -- --seeds 1,2,3` — a slice, not the whole sweep |

The full gate, split by cost, belongs to the `commit` skill — load it when the
work is done. Two of its rules are worth carrying into the edit loop: verify
with `make test` / `make lint`, **never** a bare ad-hoc invocation habit (the
Make targets are the definition of green CI enforces), and run `make fmt`
before the commit is written.

---

## File size

- Non-test source files stay under **1000 physical lines** (§20.5 of
  `OSS_SPEC.md`). Past the cap, split by concern — sibling modules, extracted
  helpers — rather than relaxing it. A file that big is nearly always doing
  more than one thing.
- Splitting a file is also the moment to prune it: an oversized module usually
  has history in it.

---

## Tests

- **Tests live in the root `tests/` directory, never inline in source.** One
  file per topic, named `<topic>_test.ts` — the `_test` suffix is mandated by
  OSS_SPEC §20.2 and checked by the validator. Runner: vitest via `make test`;
  the include pattern (`tests/**/*_test.ts`) is in `vitest.config.ts`.
- **Engine tests only** — no DOM, no browser, plain Node. The renderer is
  verified by looking (`make screenshots`, the `playtest` skill), not by unit
  tests.
- Import the engine through the **`@engine`** alias (→ `engine/index.ts`),
  never a relative path into `engine/`.
- Physics tests build **synthetic tracks** via `compileTrack(seed, segments)`
  and script inputs step by step — see the `test-scenario` skill. Widen the
  injected track's `width` when a scenario slides far sideways, so the drift is
  measured rather than the off-road respawn.
- Simulation tests use `simulateStage` — deterministic, so digests can be
  compared exactly.
- Assert the rule you claim. "A token flick pays no boost" is a claim and owes
  an assertion.
- No extra test dependencies; everything runs on plain Node.

---

## The generic pools, and the aliases

- **Keep generic game code separate.** Anything not specific to THIS game
  (math, PRNG, angle helpers engine-side; general UI utilities app-side) goes
  in `engine/lib/` or `pwa/src/lib/` — never tangled into a game-specific
  module. Those pools are what a sequel keeps as-is.
- **The engine's only public surface is `engine/index.ts`.** Export new
  types/constants the app or the tests need from there; the app and tests
  import `@engine`, nothing deeper.
- **The app renders with Preact and still spells it `react`.** `react`,
  `react-dom` and `react-dom/client` are aliased to `preact/compat`
  (`pwa/tsconfig.json` `paths` + the Vite preset), so components and the
  oss-framework's typings keep working without `@types/react`. Do not install
  React.
- **`@niclaslindstedt/oss-framework` resolves from GitHub Packages**, which
  needs a read token even for public reads — in web sessions
  `.claude/hooks/session-start.sh` handles it; locally the token lives in
  `~/.npmrc`. A fresh-environment `npm install` failure on a 401 is that, not
  a broken lockfile.

---

## Checklist

- [ ] Loaded the skill that owns the SUBJECT, and read both skills' lessons
- [ ] The code sits where `AGENTS.md`'s tables say it sits; the hard rules hold
      (engine imports nothing from `pwa/`, renderer never mutates `GameState`,
      randomness only via the state's seeded RNG)
- [ ] Comments in every file touched are pruned: no history, no dead code, no
      restatement — and every rule kept, in the present tense
- [ ] Anything promoted out of a comment was VALIDATED against today's code
      before it became a fragment, and the comment is now gone
- [ ] Every warning the session saw is fixed, not stepped around
- [ ] Files still under 1000 lines; tests in `tests/`, `_test.ts`, via `@engine`
- [ ] Iterated with the fast checks; the whole-repo gate ran ONCE, at the end
- [ ] `skill-reflection` CLOSE pass run for every skill loaded

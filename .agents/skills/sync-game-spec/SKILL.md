---
name: sync-game-spec
description: "Use when the repository may have drifted from OSS_GAME_SPEC.md — after a big merge, before a release, before a store submission, or when a review flags a conformance smell. Walks the spec's chapters against the repository offline, records each verdict in docs/spec-conformance.md, and fixes what is fixable."
---

# Sync with the game spec

This repository conforms to `OSS_GAME_SPEC.md`, and the committed copy at the
repository root **is** the spec — there is no upstream document to fetch and
no validator to call. Amending it is a reviewed pull request like any other
governing file, and §21.5 requires that the same pull request propagates the
new mandate into the tree or records why it does not yet apply.

Unlike the `update-*` skills — which react to a change in the code by
propagating it into a derived artifact — this skill reacts to accumulated
drift in the REPO by bringing it back under the spec's mandates. Run it as
the final step of a `maintenance` sweep, standalone when something smells
off, and always before a store submission (§33.5).

**The ledger is `docs/spec-conformance.md`.** It carries one row per chapter
with a verdict, the evidence, and — for anything short of conformant — what
the gap costs and what closing it would take. A sweep that changes nothing in
the code still updates the ledger, because a verdict with no date behind it
is an opinion.

## Walking the spec offline

The spec has two halves and both are normative. Walk them in this order,
because the game half leans on the baseline half:

### The OSS baseline (§1–§22)

| Chapter | Checks |
| --- | --- |
| §3 | README structure (What/Why/Usage tables in sync with reality — overlap with `update-readme`) |
| §7.2 | `AGENTS.md` carries the four game sections: role map, content pipeline, the rules that bite, craft index |
| §8.5 | Every PR settles a fragment or the `no-changelog` label; `tests/changeset_test.ts` holds the vocabulary |
| §9.1 | One documented command per capability — content, assets, sim, playtest, bench |
| §11 | `docs/` coverage, the page-is-the-product rules, SEO and PWA surfaces (`update-docs` / `update-website`) |
| §12 | Every tool reachable by one command, `--help`, non-zero on an unknown flag, prints its inputs and outputs |
| §13.1 | Examples are runnable and CI-exercised, not restatements of the README |
| §13.2 | `prompts/` versioning format (overlap with `update-prompts`) |
| §19.4 | The central output module — engine code prints through `engine/output.ts`, never bare `console.*` |
| §19.5 | Nothing logs per entity per frame; diagnostics never change the simulation; the in-build developer surface |
| §20 | Test layout: root `tests/`, `_test.ts` suffix, no inline tests; §20.3's rule/content split; §20.5's cap |
| §21 | Every `update-*` in the `maintenance` registry, each with `SKILL.md` + `.last-updated`; §21.9 craft skills |

### The game shape (§23–§40)

| Chapter | Checks |
| --- | --- |
| §23 | Core framework-free and headless; one entry surface (`engine/index.ts`); dependency direction; sequel test |
| §23.9 | The startup-path budget is named and gated (`scripts/check-seo.mjs`), and the gate is not raised to pass |
| §24 | Catalogs authored as data, schema-validated, generated output gitignored, drift guards, one ordered pipeline |
| §25 | Seeded run-owned randomness, fixed step, deterministic iteration, no presentation draw, replay/digest guard |
| §26–§27 | The scripting seam and the mod surface, where they exist |
| §28 | Interface authored as content, where it exists |
| §29 | Every derived asset from one source; the style definition; the audio routing key; generated store rasters |
| §30–§31 | The narrative tiers, where there is narrative; the naming document and its four identity carriers |
| §32 | Headless simulator (scenario, progression, seed, A/B, verdict, no-rebuild tuning); automated player; bench |
| §33 | Shells add reach not rules; each shell's own build and checks; generated, drift-tested store metadata |
| §34 | Session service, where there is multiplayer |
| §35 | Reference device and viewport; perception rules; accessibility; the mature gate; one identity manifest |
| §36 | Save versioning, migration fixtures, namespaced storage identity, slots that do not share it |
| §37 | Input sampled and consumed without loss; the clamped accumulator; focus loss; the wall clock is not a rule |
| §38 | A contained rule error; the crash report carries the repro; the running build says what it is |
| §39 | No user-visible string literal in source; layout survives the longest string; templates, not concatenation |
| §40 | Asset and dependency provenance; telemetry opt-in and personal-data-free; a claim is never shown as a fact |

Chapters that do not apply (no multiplayer, no narrative, no mature content)
are recorded as **N/A with the reason**, not silently skipped — the reason is
what a future contributor checks when the condition changes.

## Process

1. Walk both tables, collecting a verdict and its evidence per chapter. Prefer
   evidence a command produces (a grep, a test name, a file path) over a
   reading of the code.
2. Fix each violation in the repo — **never** by weakening the spec copy. When
   a violation overlaps an `update-*` skill's territory, run that skill rather
   than duplicating its work here.
3. Where a violation is a programme rather than a patch (a catalog that is
   code and would have to become data, a mod seam that does not exist), do not
   half-do it. Record it in the ledger with its cost and the first step, and
   say so in the PR body.
4. If the spec copy itself was amended, propagate the new mandate or record in
   the ledger why it does not yet apply. A spec edit merged alone ships as
   documentation and is a violation in its own right.
5. Update `docs/spec-conformance.md` — every row's verdict and its date — and
   write `git rev-parse HEAD` into `.last-updated`.
6. `make fmt && make lint`, then the test files the change touched; leave the
   rest to the PR.

## Verification

1. `docs/spec-conformance.md` has a row for every chapter, none of them stale.
2. No reference to a retired spec file or an external validator survives
   (`grep -rIn "OSS_SPEC\|validate.sh" --exclude-dir=node_modules .`).
3. `make lint` and `make fmt-check` are green.

## Skill self-improvement

Record recurring violation classes (the mandate this repo keeps re-breaking)
as lesson fragments via the **`skill-reflection`** skill; promote a violation
the repo hits every sweep into a CI check or a git hook, then delete the
lesson. A gap that the ledger has carried unchanged through three sweeps is
either work somebody must schedule or a deviation the spec copy should record
deliberately — decide which, and stop re-discovering it.

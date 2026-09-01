---
name: sync-oss-spec
description: "Use when the repository may have drifted from OSS_SPEC.md — after a big merge, before a release, or when a review flags a conformance smell. Walks the spec's mandates against the repository and fixes each violation, using the committed spec copy as the source of truth (with the upstream validator as the online fast path)."
---

# Sync with OSS_SPEC

This repository conforms to `OSS_SPEC.md`; the committed copy is the version
the repo was last validated against, and it is the tie-breaker on layout,
naming, and workflow questions (per `AGENTS.md`). Unlike the `update-*` skills
— which react to a change in the code by propagating it into a derived
artifact — this skill reacts to accumulated drift in the REPO by bringing it
back under the spec's existing mandates. Run it as the final step of a
`maintenance` sweep, or standalone when something smells off.

## Two ways to check

1. **Online fast path** — the upstream validator re-checks and refreshes the
   committed copy:

   ```sh
   bash <(curl -fsSL https://raw.githubusercontent.com/niclaslindstedt/oss-spec/main/scripts/validate.sh) .
   ```

   If it updates `OSS_SPEC.md`, the diff is the list of NEW mandates to walk.

2. **Offline** — walk the committed spec directly. The high-traffic chapters
   for this repo, and what each checks:

   | Chapter | Checks                                                                                                       |
   | ------- | ------------------------------------------------------------------------------------------------------------ |
   | §3      | README structure (What/Why/Usage tables in sync with reality — overlap with `update-readme`)                 |
   | §11     | `docs/` coverage, the website-as-product rules, SEO surfaces (overlap with `update-docs` / `update-website`) |
   | §13.5   | `prompts/` versioning format (overlap with `update-prompts`)                                                 |
   | §19.4   | The central output module — engine code prints through `engine/output.ts`, never bare `console.*`            |
   | §20     | Test layout: root `tests/`, `_test.ts` suffix, no inline tests; **§20.5** the 1000-line source-file cap      |
   | §21     | Skills: every `update-*` in the `maintenance` registry, each with `SKILL.md` + `.last-updated`               |

## Process

1. Run (or walk) the check and collect the violations.
2. Fix each violation in the repo — never by weakening the spec copy. When a
   violation overlaps an `update-*` skill's territory, run that skill instead
   of duplicating its work here.
3. If the spec copy itself was refreshed and now mandates something new,
   propagate the mandate (and note it in the PR body — a spec bump is
   reviewable news).
4. `make test && make lint && make fmt-check` on the result.

## Skill self-improvement

Record recurring violation classes (the mandate this repo keeps re-breaking)
as lesson fragments via the **`skill-reflection`** skill; promote a violation
the repo hits every sweep into a CI check or a git hook, then delete the
lesson.

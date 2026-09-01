---
name: changelog
description: "Use when opening any PR, to settle the one call every PR owes: a changeset fragment under `.changes/unreleased/` when the change is something a player would notice, or the `no-changelog` label when it isn't. Covers the fragment format, the type-to-semver mapping, the skip-list traps, and the release-time constraints a missing or malformed fragment breaks."
---

# Changelog fragments

The changelog is never written at release time and never comes from commit
messages or PR titles. It is assembled from **one small file per change**,
dropped under `.changes/unreleased/` by the PR that makes the change. At
release time `release.yml` collates those files into a dated `CHANGELOG.md`
section, publishes it as the GitHub Release body, and — reading the same
front matter — derives the semver bump. **Never edit `CHANGELOG.md` by hand**;
the pre-commit hook blocks it.

## The one decision, and every PR makes it

**A PR gets exactly one of these. Never both, never neither.**

| The PR…                                 | Do this                         |
| --------------------------------------- | ------------------------------- |
| changes something a player would notice | add a fragment (below)          |
| changes nothing a player would notice   | label the PR **`no-changelog`** |

CI's `changeset` job (`scripts/release/check-changeset.mjs`) fails a PR that
does neither. It re-runs on `labeled`/`unlabeled`, so applying the label
clears a red check without a push.

"A player would notice" is the whole test. Not "is this file important" — a
rewrite of the entire renderer that changes nothing on screen is
`no-changelog`; a one-word change to the HUD is a fragment.

## Writing a fragment

```
.changes/unreleased/$(date +%s)-short-slug.md
```

```markdown
---
type: Added # Added | Changed | Fixed | Removed | Security | Deprecated
title: Short title # optional — bolded at the head of the bullet
breaking: true # optional — forces a major bump
---

One sentence a player can read.
```

- **One file per change, always a new one.** Never append to a fragment
  somebody else added. Separate files are the entire reason parallel PRs never
  conflict here; the `<unix-ts>-` prefix sorts lexically, which loosely tracks
  commit order.
- Front matter is plain `key: value` lines. A malformed line, an unknown
  `type`, or an empty body fails the release loudly
  (`scripts/release/fragments.mjs`).
- The bullet renders as `- **<title>** — <body>`. With no `title:` the body is
  the whole bullet.

### ONE SENTENCE — the rule that drifts

The `title:` is the scannable headline. The body is **one sentence saying what
changed for the player** — not a design note, not the rationale, not a tour of
the sub-features. The long-form explanation belongs in `docs/`. Nothing
enforces this rule, which is exactly why it is worth holding.

```markdown
<!-- good -->

Fords now throw a proper spray wall on entry.

<!-- bad: three sentences, implementation detail, no player in it -->

Water segments now emit a splash event carrying entry speed. The renderer
spawns a particle burst scaled by it. This also fixes the silent ford bug.
```

## What each type buys

| `type`                                   | Bump  |
| ---------------------------------------- | ----- |
| `Added` `Changed` `Removed` `Deprecated` | minor |
| `Fixed` `Security`                       | patch |
| any type **+ `breaking: true`**          | major |

The release takes the **highest** level across all fragments, so one
`breaking: true` makes the whole release a major. Removing a feature is not by
itself breaking — `breaking: true` is for changes an older installed build (or
its cached state) cannot survive.

## When `no-changelog` is the honest answer

Pure refactors, CI and build tweaks, comment and docs edits, test-only
changes, formatting. Apply the label to the PR; the job re-runs and passes.

A PR is also let through automatically when **every** changed file matches the
skip-list in `check-changeset.mjs`: `tests/`, `.github/`, `.agents/`,
`.claude/`, `.changes/`, `docs/`, `scripts/`, `Makefile`, **any `*.md`**, the
dotfile configs (`.nvmrc`, `.editorconfig`, `.prettierrc*`, `.gitignore`,
`.gitattributes`), `eslint.config.js`, `vite.config.ts`, any
`tsconfig*.json`, and `package-lock.json`.

**THE TRAP: `engine/` and `pwa/` are deliberately NOT skip-listed.** The check
reads paths, not diffs, so a comment-only or rename-only PR under either still
demands a fragment. That is the common false red. The answer is the label —
never a fragment invented for a change no player can see.

## Constraints that bite at release time

1. **Never an empty set.** The collate step refuses to write an empty release,
   so a release with genuinely nothing to say still needs one fragment.
2. **The `## [Unreleased]` anchor in `CHANGELOG.md` must survive.** Collate
   splices each new section in under it; deleting it means no release can be
   cut at all.
3. **Collating CONSUMES the fragments** — it deletes every file it read, so
   the local preview is destructive.

## Verify before you push

```sh
make bump                        # the bump these fragments derive — read-only
make changelog VERSION=X.Y.Z     # preview the section — DESTRUCTIVE
git checkout -- CHANGELOG.md .changes/   # …so always revert it
```

`make bump` prints the resolved bump, which is the fastest way to catch a
`type` that implies more or less than you meant.

## What the release does with them

`release.yml` collates the fragments into `CHANGELOG.md`, rewrites every
version string via `scripts/update-versions.sh` (the ONLY way versions move —
`engine/version.ts` and the `package.json`s stay in lockstep), commits, tags
`vX.Y.Z`, publishes the Release with the new section as its body, and chains
into `pages.yml` so the tag is served at `/`.

## Skill self-improvement

Record traps and drift signals as lesson fragments under
`.agents/skills/changelog/.lessons/` via the **`skill-reflection`** skill
(`node scripts/skill-lessons.mjs changelog --list`); it owns pruning, merging,
and promoting them into this file.

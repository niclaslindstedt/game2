---
name: commit
description: "Commit staged changes, push the branch, and create or update a PR with a conventional-commit-formatted title. Use after completing a feature or fix. Owns the quality-gate split (format, lint and the AFFECTED tests before the commit; the whole suite left to the PR's CI), the repo's commit and PR conventions, and the sim-table obligation on handling/generator PRs."
---

# Commit, Push & PR

This skill handles the full workflow: verify quality gates → commit → push →
create or update a PR. It is also the owner of this repo's **commit and PR
conventions**.

**Merges, rebases and the conflicts they raise are the `conflict` skill's**, not
this one's. Load it whenever a branch has to move onto another — a conflict has
appeared, a PR is reported un-mergeable, or you are told to rebase or catch a
branch up with `main`.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs commit --list`, then the ones this task touches
(`--scope=…`, `--concepts=…`). Reading them here and reflecting on them before
the commit is the **`skill-reflection`** skill's job — load it at both ends of
the session.

## The conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(engine): …`, `fix(pwa): …`). The `commit-msg` hook (`make hooks`)
  enforces the format. Types: `feat fix docs refactor test build ci chore perf
style revert`; breaking changes use `!` or a `BREAKING CHANGE:` footer.
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format too.
- **THE PUSH AND THE PR ARE ONE STEP.** The moment a branch is pushed as
  finished work, open its pull request — same turn, no waiting for a suite, a
  review, or permission. A pushed branch with no PR is invisible: nothing runs
  the PR-only checks against it, nobody is asked to look at it, and the work
  sits done and unmergeable until somebody notices. If a PR is already open
  for the branch, the push updates it and there is nothing more to do.
- **RUN THE TESTS FOR WHAT YOU WROTE. LET CI RUN THE REST.** The whole suite
  is over a thousand cases and takes ten minutes serially; CI shards it across
  three runners and runs it on every push whatever you do here. Running it
  locally first spends that time twice and delays the PR by the length of the
  slower copy. So before the commit, run the files that cover the change and
  the ones it plausibly reaches — `npx vitest run tests/<topic>_test.ts …` —
  and push. The PR is where the whole-repo answer comes from.
- **A red PR is a normal state, not a failure of process.** The point of
  pushing early is that CI finds what a local run would have found, sooner,
  and a follow-up commit onto a branch that was going to need one anyway costs
  nothing. What is NOT acceptable is leaving it red: a CI failure on your own
  PR is work now, and the drive-to-green rules say what to do with it.
- **Know when the blast radius is wider than the diff.** A change to
  `TUNING`, `engine/game/car.ts`, `engine/sim/`, or the generator moves numbers
  that tests three directories away assert on — a drift retune has gone red in
  `tape_test`, `water_test` and `analysis_test` at once, none of them files
  anyone would have thought to run. For those, name the affected topics
  generously rather than running everything: the sim-driven suites
  (`simulation`, `rivals`, `tape`, `drift`, `drivetrain`) are the ones a
  handling change actually reaches.
- **`make sim` is not optional and is not the suite.** It takes three minutes,
  it is the table the PR owes on any handling or generator change, and no
  amount of CI replaces reading it yourself.
- **Handling or generator changes carry the `make sim` table, before AND
  after**, pasted into the PR description. This is the contract in
  CONTRIBUTING.md and the PR template's checklist — a tuning PR without both
  tables is incomplete.
- **Do not babysit PRs — but do fix what breaks.** Once a PR is opened, write
  out its URL and a short summary of what was done. If a CI failure or a merge
  conflict arrives for the PR and you can fix it, push the fix. Leave review
  comments and the merge decision to a human unless asked.

## Step 1: Quality Gates

**RUN EVERY CHECK CI RUNS, AND RUN THE CHEAP ONES BEFORE THE COMMIT.**
`.github/workflows/ci.yml` is the list, and there is nothing on it a local
clone cannot run. The split is by COST, not by importance:

| Before the commit is written (seconds to ~a minute)                                      | Left to CI on the PR (minutes)         |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `make fmt`, then `make fmt-check`                                                        | `make test` — the WHOLE suite, sharded |
| `npx eslint <the files you changed>` — 2 s, against 24 s for the repo                    | `make lint` over everything            |
| `npx tsc --noEmit` — whole-program on purpose (see below), and 3 s                       | `make build`                           |
| the tests that cover the change, by file (`npx vitest run tests/<topic>_test.ts`)        | `make check-seo`                       |
| `make actionlint` / `make shellcheck` — only if a workflow, hook, or `.sh` was touched   |                                        |
| the changeset call: a fragment under `.changes/unreleased/`, or the `no-changelog` label |                                        |
| `make sim` — if handling or generator moved; the PR owes its table                       |                                        |

**ESLINT SCOPES; THE TYPECHECK DOES NOT.** eslint reads each file on its own,
so pointing it at the ten files you touched costs 2 seconds where the repo
costs 24 — ten times the wait to check code nobody edited. `tsc` is the
opposite: it checks a PROGRAM, and naming files on its command line makes it
ignore `tsconfig.json` outright (`TS5112`) and answer a different question.
That is also exactly the check you want whole: a changed signature breaks its
CALLERS, which are by definition files you did not touch. It costs 3 seconds.
So scope the linter, never the typechecker.

**`make fmt` is the one that gets skipped, and it is the one that costs nothing
to run.** Prettier has an opinion about some line nobody thought about, the
`format` CI job runs `fmt-check` on every push, and a red CI on whitespace
burns a whole round-trip and buries any real failure underneath it. It is also
the only check whose fix is GENERATED rather than authored, so there is no
version of "push and see" that is faster than just running it.

Stop if a FAST check fails. Fix the issue, then re-run.

**AND NONE OF THE WHOLE-REPO CHECKS BELONGS IN THE EDIT LOOP.** While
ITERATING, check only what you touched — the sub-second table lives in the
`write-code` skill. A whole-repo check is the GATE on the commit, not a step on
the way to it.

**`make fmt` in particular runs HERE and nowhere else.** Formatting carries no
information about whether the code is right, so a session that runs it after
every edit spends minutes re-formatting files it already formatted and learns
nothing for them. Once, at the gate, fixes every one of those edits at the same
cost.

**`make fmt` stays whole-repo** — it is a rewrite, not a check, and it is
seconds. `make lint` bundles the two halves above; run its pieces directly
while iterating and let CI run the target.

**A targeted `npx vitest run tests/<topic>_test.ts` is the local habit; `make
test` is CI's.** The Make target is still the definition of green — it is just
not worth running serially here to learn what three parallel runners are about
to tell you.

## Step 2: Create a Feature Branch

**Always work on a feature branch — never commit directly to `main`.**

```sh
git branch --show-current
```

If on `main`, create and switch to a feature branch before staging anything —
`<type>/<short-topic>` in kebab-case (`feat/water-spray`,
`fix/hairpin-respawn`). In a remote/managed session, keep the harness-assigned
branch. If already on a feature branch, continue with it — do not create
another one.

## Step 3: Review Changes

```sh
git status && git diff --staged && git diff
```

Understand what changed so you can write an accurate commit message and PR
title.

## Step 4: Changelog Fragment

**The changelog and version bump come from `.changes/unreleased/` fragments,
not from commit messages or PR titles.** Every PR owes exactly one of two
things: a fragment when the branch changes something a player would notice, or
the `no-changelog` label when it doesn't. CI's `changeset` job fails a PR that
gives neither.

**Load the `changelog` skill and follow it** — it owns the fragment format, the
type→semver mapping, when the label is the honest answer, and the traps
(`engine/` and `pwa/` are not skip-listed, so even a comment-only change there
needs the label).

## Step 5: Stage & Commit

Stage relevant files (prefer specific paths over `git add -A` to avoid
accidentally including secrets or build artifacts):

```sh
git add <files...>
git commit -m "type(scope): summary in imperative mood"
```

Scopes are lowercase, comma-separated if multiple: `feat(engine,pwa): …`.
Never skip hooks (`--no-verify`) — fix the underlying issue instead.

## Step 6: Fetch main and rebase, THEN push

**`main` moves while a task is being done, and a branch is only mergeable
against the `main` that exists when it is pushed.** So the last thing before
every push is a fresh fetch and a rebase onto it — not the one from the start
of the session, which is stale by however long the work took:

```sh
git fetch origin main
git rev-list --left-right --count origin/main...HEAD   # left > 0 ⇒ main moved
```

Left side zero: push.

```sh
git push -u origin HEAD
```

Left side non-zero: **load the `conflict` skill and sync before pushing** — it
owns the backup branch, the fetch-immediately-before rule, and how to resolve
honestly (the answer to two people adding a row to the same table is BOTH
rows, never one). Then re-run the gates **on the rebased tree**, because that
combination is what CI will actually run, and push:

```sh
git push --force-with-lease   # a rebase rewrote history; plain push after a merge
```

Doing this here rather than after CI goes red is the whole point: a conflict
found locally is a resolution, and the same conflict found on the PR is a
resolution plus a round-trip. It is also the only place a semantic conflict
gets caught — two branches that merge cleanly and still disagree (a signature
that grew a parameter on both sides, a rule main rewrote under the feature
being built on it) only show up when the gates run on the combined tree.

## Step 7: Create or Update the PR

> In remote/managed sessions the `gh` CLI may be unavailable — use the GitHub
> MCP tools (`create_pull_request`, `update_pull_request`,
> `list_pull_requests`) with the same titles and bodies instead.

**Check if a PR already exists for this branch** (`gh pr view` or the list
tool). If one exists, re-evaluate the title and description to reflect the
**combined** scope of all commits on the branch, and update it.

If none exists, create one. The title **must** be a conventional-commit subject
(it becomes the squash commit on `main`) matched to the overall intent of the
branch. The body follows `.github/PULL_REQUEST_TEMPLATE.md`: **What & why**,
**Test plan** (commands run; the before/after `make sim` tables for
handling/generator changes; screenshots for visual changes), **Checklist**.

**A `no-changelog` PR carries its label ON THE CREATE CALL.** CI's `changeset`
job reads the labels out of the event payload, which for the `opened` event is
the list at that instant — though the job also re-runs on `labeled`/
`unlabeled`, so labelling after the fact clears the red check without a push.

## Key Reminders

- **PR title = squashed commit on main.** Choose the type and summary
  carefully; individual branch commits disappear at merge.
- **The changelog rides `.changes/unreleased/` fragments** — not the PR title.
  No user-visible change ships without one (Step 4). **Never edit
  CHANGELOG.md** — the pre-commit hook blocks it, and the release workflow owns
  it.
- Docs move with the code: check the "Documentation sync points" table in
  `AGENTS.md` before calling the branch done.
- Once the PR is open, write out its URL and a short summary, then stop.
- **Before the commit, run `skill-reflection`** for every skill this session
  loaded.

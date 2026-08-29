# Contributing to Scandinavian Flick

Thanks for wanting to make the drifting better. This document covers everything from a clean checkout to a merged PR. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md); security problems go through [SECURITY.md](SECURITY.md), never public issues.

## Prerequisites

- Node.js 22+ (CI pins 24 via `.nvmrc`), npm 10+
- A GitHub token with `read:packages` in `~/.npmrc` (the `@niclaslindstedt/oss-framework` dependency resolves from GitHub Packages — see the README's Configuration section)
- Optional: `shellcheck` and `actionlint` for the shell-lint targets, a Chromium for `make screenshots`

## Getting the code running

```sh
git clone https://github.com/niclaslindstedt/game2
cd game2
npm install
make hooks       # install the pre-commit / commit-msg git hooks
npm run dev      # play your working copy
```

## The canonical commands

CI runs exactly these Make targets — if they pass locally, they pass in CI:

```sh
make build       # typecheck + production build
make test        # vitest: generator rules, physics, bot simulations
                 # (CI slices it three ways with SHARD=i/3; locally, run the lot)
make lint        # eslint + typecheck (zero warnings)
make fmt         # prettier, in place
make fmt-check   # what CI runs
make sim         # the balance sweep (also a CI job)
```

**Verify with `make test` / `make lint`, not ad-hoc tool invocations** — the Make targets are the definition of green.

## The workflow

1. **Fork and branch.** Branch from `main`, named `<type>/<short-topic>` — e.g. `feat/water-spray`, `fix/hairpin-respawn`.
2. **Change the code.** Where things go is mapped in [AGENTS.md](AGENTS.md) ("Where new code goes") — the short version: gameplay in `engine/`, rendering in `pwa/src/game/`, never physics in the renderer.
3. **For handling or generator changes, run the sim before and after.** `make sim` prints the pace/drift/air/respawn table; paste both tables in the PR description. A change that makes bots stop finishing stages or stop drifting is a regression until argued otherwise.
4. **Add or update tests.** Physics moments (drift enter/exit, jump/landing) and generator rules are test-covered; a behavior change without a matching test change is incomplete. Tests live in `tests/*_test.ts` (see AGENTS.md → Test conventions).
5. **Drop a changeset fragment** for anything user-visible: a file in `.changes/unreleased/` named `<unix-ts>-<slug>.md`:

   ```markdown
   ---
   type: Added # Added | Changed | Fixed | Removed | Security | Deprecated
   title: Water spray
   ---

   Fords now throw a proper spray wall on entry.
   ```

   Pure refactors, CI tweaks, and docs-only changes skip this (the `changeset` CI job knows); a maintainer can also apply the `no-changelog` label. **Never edit CHANGELOG.md directly** — the release workflow generates it from the fragments, and the pre-commit hook blocks manual edits.

6. **Update docs** the change touches (`docs/driving.md` for feel changes, `docs/track-generator.md` for rules, the README's Usage table for new commands).
7. **Commit** with [conventional commits](https://www.conventionalcommits.org/): `feat(engine): give fords a spray wall`. Types: `feat fix docs refactor test build ci chore perf style revert`; breaking changes use `!` or a `BREAKING CHANGE:` footer. The `commit-msg` hook enforces this.
8. **Open the PR** against `main` and fill in the template — the test plan and the checklist are read, not decoration.

## Review and merging

Every PR needs green CI (`tests`, `format`, `lint`, `build`, `simulate`, `seo`, `shell-lint`, `changeset`) and maintainer approval. Those all run beside each other, so the run costs its slowest job rather than the sum of them; `tests` is one check over a three-way shard of the suite, and it is the one to require rather than the individual `test (1..3)` shards. PRs are **squash-merged**, so the PR title must itself be a conventional-commit subject — it becomes the commit on `main`. Review normally lands within a few days; small, focused PRs merge much faster than sprawling ones.

## Governance

This is a single-maintainer project: [@niclaslindstedt](https://github.com/niclaslindstedt) has merge rights, decides disputes, and cuts releases (via the `release` workflow, which derives the version from the changeset fragments). Sustained, quality contributions are the path to being added as a maintainer — asked, not applied for. Disagreements are argued in the PR or issue on technical merit; the maintainer has the final word. Should the project be abandoned, the license already permits noncommercial forks, and the maintainer will link a successor fork from the README if one emerges.

## Communication

- **Bugs & feature requests** → [GitHub Issues](https://github.com/niclaslindstedt/game2/issues) (use the templates)
- **Questions & ideas** → [GitHub Discussions](https://github.com/niclaslindstedt/game2/discussions)
- **Security** → privately, per [SECURITY.md](SECURITY.md)

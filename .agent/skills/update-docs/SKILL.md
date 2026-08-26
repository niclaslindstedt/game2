---
name: update-docs
description: "Use when docs/ may be stale. Discovers commits since the last docs sync, maps changed source to the pages that describe it, and brings docs/*.md back into agreement with the code."
---

# Updating the docs

**Governing spec sections:** §11.1 (`docs/` — real prose, no stubs, resolving cross-links), §21.5 (mandated because `docs/` is drift-prone).

The `docs/` pages describe the engine, the generator's rules, the sim harness, and the deploy plumbing. Each has concrete source files it must agree with; this skill re-syncs them.

## Tracking mechanism

`.agent/skills/update-docs/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the initial commit.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-docs/.last-updated)
   ```

2. List changed files since then:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

3. Walk the mapping table; every hit schedules the named page for a re-read against its sources.

4. For scheduled pages, read the page AND its source files side by side; fix what disagrees (numbers, names, commands, claims).

## Mapping table

| Changed source                                                    | Page(s) to re-sync                           |
| ----------------------------------------------------------------- | -------------------------------------------- |
| `engine/game/car.ts`, `engine/game/defs/*`                        | `docs/driving.md`                            |
| `engine/mapgen/rules.ts` (the R-rules are quoted verbatim)        | `docs/track-generator.md`                    |
| `engine/mapgen/generate.ts`, `compile.ts`                         | `docs/track-generator.md`                    |
| `engine/sim/*`, `scripts/simulate-run.mjs`                        | `docs/simulation.md`                         |
| `engine/index.ts`, module moves under `engine/` or `pwa/src/`     | `docs/architecture.md`                       |
| `pwa/src/game/input.ts`, `hud.tsx`                                | `docs/getting-started.md`                    |
| `.github/workflows/pages.yml`, `release.yml`, `pwa/pwa-plugin.ts` | `docs/configuration.md`, `docs/platforms.md` |
| `pwa/src/identity.ts`, `pwa/public/*`                             | `docs/configuration.md`                      |
| New shells (`electron/`, `tauri/`, `native/`)                     | `docs/platforms.md`                          |
| Error-shaped changes (new failure modes, new tooling)             | `docs/troubleshooting.md`                    |

## Update checklist

- [ ] Read baseline and diff
- [ ] Re-sync every scheduled page against its sources
- [ ] Verify cross-links between docs pages and from the README still resolve
- [ ] `make fmt-check`
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-docs/.last-updated

## Verification

1. Every quoted rule, number, command, and filename in the touched pages exists in the source it cites.
2. No page contains "TODO" or stub text.
3. `.last-updated` points at the new HEAD.

## Skill self-improvement

After a run, grow the mapping table with any new source → page relationship you discovered, note recurring drift patterns (e.g. tuning constants quoted in prose), and commit the skill edit together with the docs edit.

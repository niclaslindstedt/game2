---
name: update-readme
description: "Use when README.md may be stale. Discovers commits since the last README update, identifies what user-facing surfaces changed, and brings README.md back into sync."
---

# Updating the README

**Governing spec sections:** §3 (`README.md` — required sections and content), §21.5 (this skill is mandated because `README.md` is a drift-prone artifact).

`README.md` is the primary user-facing documentation for Scandinavian Flick. Per §3 of `OSS_SPEC.md` it must keep its twelve sections (What / Why / Prerequisites / Install / Quick start / Usage / Configuration / Examples / Troubleshooting / Documentation / Contributing / License) accurate. It goes stale whenever a command, a car, a control, a URL, or the install story changes without a matching edit.

## Tracking mechanism

`.agent/skills/update-readme/.last-updated` contains the git commit hash from the last successful run. Empty means "never run" — fall back to the initial commit of the repository.

## Discovery process

1. Read the baseline:

   ```sh
   BASELINE=$(cat .agent/skills/update-readme/.last-updated)
   ```

2. List commits since the baseline:

   ```sh
   git log --oneline "$BASELINE"..HEAD
   ```

3. List changed files:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

4. Categorize the changes using the mapping table below.

5. Read the current `README.md` so you can preserve voice and unrelated sections while editing.

## Mapping table

| Changed files / scope                         | README section(s) to update                  |
| --------------------------------------------- | -------------------------------------------- |
| `package.json` scripts, `Makefile` targets    | **Usage** table                              |
| `engine/game/defs/cars.ts`                    | **What** (the car list)                      |
| `pwa/src/game/input.ts`, `hud.tsx`            | **Quick start** (controls)                   |
| `pwa/src/identity.ts`, `pwa/public/CNAME`     | Links, badges, **What**, **Usage** (install) |
| `engine/mapgen/rules.ts`                      | **Why** (generator claims)                   |
| `.github/workflows/*`                         | Badge row                                    |
| `docs/*.md` added/renamed                     | **Documentation** link list                  |
| Dependency/auth changes (`.npmrc`, framework) | **Prerequisites**, **Configuration**         |
| `LICENSE`                                     | **License** section, badges                  |

Extend this table every time you find a new source-of-truth file that feeds the README.

## Update checklist

- [ ] Read baseline from `.last-updated` and run `git log` / `git diff --name-only`
- [ ] Read the current `README.md`
- [ ] Walk the mapping table and update each affected section
- [ ] Verify every shell example is still syntactically valid and every link resolves
- [ ] Run `make test` and `make fmt-check`
- [ ] Write the new baseline:

      git rev-parse HEAD > .agent/skills/update-readme/.last-updated

## Verification

1. Re-read every edited section against the corresponding source of truth.
2. Confirm the twelve §3 sections are all present, in order.
3. Confirm `.last-updated` was rewritten with the new `HEAD`.

## Skill self-improvement

After a run, improve this file in place:

1. **Grow the mapping table** with any new source → README relationship you discovered.
2. **Record patterns** for recurring edits.
3. **Commit the skill edit** together with the README edit so the knowledge compounds.

---
name: maintenance
description: "Use when you want to bring every drift-prone artifact in the repo back into sync. Dispatches to all individual update-* skills in the correct order, aggregates their results, and leaves a single combined change ready to review."
---

# Maintenance

This is the umbrella skill for game2, mandated by §21.6 of `OSS_SPEC.md`. It does no rewriting itself — it decides which sync skills are stale, runs each one, and reports a combined summary. Use it when you do not know which specific artifact is out of date, or when several have likely drifted at once (for example, after a large merge).

## When to run

- After a big merge from the default branch when you are not sure which surfaces moved.
- On a cadence (weekly / before a release) as a "drift sweep".
- When a review flags stale docs but it is unclear which skill to invoke.

Do **not** use this skill for a targeted fix — if you know exactly which artifact is stale, call the corresponding `update-*` skill directly.

## Registry

The registry is the single source of truth for which sync skills exist in this repo. Every `update-*` directory under `.agents/skills/` must appear here exactly once. Add rows whenever you create a new sync skill.

| Skill            | Fixes                                                        | Spec sections | Run order |
| ---------------- | ------------------------------------------------------------ | ------------- | --------- |
| `update-docs`    | `docs/*.md` vs. engine/app/tooling source of truth           | §11.1         | 1         |
| `update-readme`  | `README.md` vs. current commands, cars, controls, URLs       | §3            | 2         |
| `update-website` | SEO surfaces + identity-derived shell vs. `identity.ts`/docs | §11.2–§11.3   | 3         |
| `update-prompts` | `prompts/` templates vs. their sources of truth (dormant)    | §13.5         | 4         |

Run order matters: `update-docs` runs before `update-readme` because the README links into docs pages and summarizes their content — a README synced against stale docs re-imports the staleness. `update-website` runs after both because the site's SEO copy describes what the README and docs claim; `update-prompts` runs last (currently dormant — no prompts shipped yet, so it usually just refreshes its baseline).

After the registry, finish a full sweep with the `sync-oss-spec` skill — it catches residual conformance violations the per-artifact skills did not touch.

## Discovery process

For each skill in the registry, decide whether it needs to run:

1. Read the skill's baseline:

   ```sh
   BASELINE=$(cat .agents/skills/<skill>/.last-updated)
   ```

   An empty or missing file means "never run" — schedule it.

2. Diff the watched paths for that skill against the baseline:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

   If any file in the skill's mapping table appears in the diff, schedule the skill.

3. Build the list of skills to run, preserving the run order from the registry.

## Execution

For each scheduled skill, in order:

1. Load `.agents/skills/<skill>/SKILL.md`.
2. Follow its discovery process, mapping table, and update checklist exactly.
3. Verify the skill's own verification section passes.
4. Record the commit hash the skill wrote to its `.last-updated`.

Between skills, do **not** commit — aggregate all edits into a single working tree so the final commit covers the whole sync sweep.

## Tracking mechanism

This skill's own `.agents/skills/maintenance/.last-updated` records the commit of the last full sweep. Individual skills keep their own baselines; this one only marks "a sweep happened".

## Update checklist

- [ ] Read every skill's `.last-updated` and build the schedule
- [ ] Run each scheduled skill per its SKILL.md
- [ ] Run `make test` and `make lint` over the combined result
- [ ] Write `git rev-parse HEAD` into this skill's `.last-updated`
- [ ] Summarize per-skill outcomes in the commit/PR body

## Verification

1. Every scheduled skill's verification section passed.
2. `make test`, `make lint`, and `make fmt-check` are green on the combined tree.
3. All `.last-updated` files (this one included) point at the new HEAD.

## Skill self-improvement

After a sweep, improve this file in place: add newly created `update-*` skills to the registry (with a run-order rationale), record recurring cross-skill orderings you discovered, and commit the skill edit together with the sweep so the knowledge compounds.

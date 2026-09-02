---
title: Check that node_modules exists before the first gate — a session the start hook skipped fails `make test` with "vitest: not found" and `make fmt` with the WRONG prettier
date: 2026-09-02
concepts: [harness, session-start, dependencies, gates, formatting]
---

`.claude/hooks/session-start.sh` installs the root dependency tree in the
background, but it does not run in every web session (a multi-repository
session opened without it), and nothing in the preflight notices. The tree
then looks fine — `npm run icons` and every pure-Node script work — right up
to the gate, where the failures are misleading in different ways:

- `make test` → `sh: vitest: not found`; `make lint` → `Cannot find package
'@eslint/js'`. Obvious once seen, but both arrive at the END of the session.
- `make fmt` is the dangerous one: `npx prettier` fetches the LATEST prettier
  when none is installed, and that version reformats files the lockfile's
  version leaves alone (`engine/game/state.ts`, `pwa/src/game/settings.ts`,
  `pwa/src/tools/item-catalog.ts` all moved). The diff looks like drift on
  `main` that a tidy session should sweep in; it is not, and committing it
  makes CI's `fmt-check` red for the next person.

So, as part of §1: `ls node_modules/.bin/vitest` — and if it is missing, run
`CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh` (it needs a
GitHub token in the environment, which the web session has). Do it BEFORE the
first `make fmt`, never after.

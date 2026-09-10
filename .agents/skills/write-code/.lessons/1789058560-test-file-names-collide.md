---
title: `tests/<topic>_test.ts` names are deterministic, so the obvious name for a new suite is usually TAKEN — check before `cat >`
date: 2026-09-10
scope: tests/
concepts: [test-conventions, tooling, silent-failure]
---

The suite convention (OSS_GAME_SPEC §20.2, one file per topic named for the
topic) means two sessions working on the same subject reach for the same
filename. Writing a new suite with a heredoc — `cat > tests/<topic>_test.ts` —
therefore has a real chance of silently DESTROYING an existing one, and the
damage does not surface until `git status` shows the file as ` M` rather than
`??` some time later.

`ls tests/ | grep <topic>` first, and read `git status --short` after: an
intended-new test file that shows as modified is a file that was overwritten.
Recovery is `cp` the new suite somewhere, `git checkout -- <path>`, then land
the new one under a name of its own — but only while nothing else has been
committed over it.

A second suite for a subject that already has one is normal here and is what
the sharding rules ask for anyway: `mapgen_test` / `mapgen_bands_test`, and
`camera_tv_test` (where the tripods are planted) beside `camera_tv_cut_test`
(which of the mode's cameras has the frame). Name the second for the thing it
actually asserts rather than widening the first.

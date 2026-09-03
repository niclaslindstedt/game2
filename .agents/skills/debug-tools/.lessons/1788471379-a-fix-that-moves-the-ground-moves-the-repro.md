---
title: A fix that moves the GROUND invalidates the repro pose — re-read PLACE's `N m up`, then re-shoot both trees at a new pose
date: 2026-09-03
scope: scripts/debug-shot.mjs, pwa/src/game/debug-info.ts
concepts: [repro, screenshots, god-mode, review, verification]
---

`make debug-shot` replays an ABSOLUTE camera pose (`gx/gy/gz`). When the fix
changes terrain height at that spot, the same pose is no longer the same
shot: on seed 27 the road came up 1.3 m under the camera, PLACE went from
`ground 6.9 m · 2.4 m up` to `8.2 m · 1.1 m up`, and the "after" frame was
half-buried in the road — which reads as a worse bug than the one that was
fixed.

The `ground` / `N m up` pair in the PLACE box is the tell, and it is printed
as text by the script, so check it before trusting the picture.

The honest before/after is then NOT the reported pose. Pick a pose that
frames the subject with the NEW ground (raise `gy` by the height delta), and
shoot it on **both** trees — `git worktree add <dir> origin/main`, build
there, and run `scripts/debug-shot.mjs` from inside that tree, since the
script serves that tree's own `pwa/dist`. Keep the original pose's pair of
shots too: it is what the reporter actually saw.

Two smaller traps from the same pass: the report's REPRO line may be a
DRIVING repro whose subject is reached by a code path a `borrowed` flag
gates, so confirm which builder actually ran (a circuit's junction arms come
from `buildSpur`, a sprint's from `cutSpur`) before instrumenting one; and
a builder called both as a trial and for real logs many walks, so tag or
take the LAST one.

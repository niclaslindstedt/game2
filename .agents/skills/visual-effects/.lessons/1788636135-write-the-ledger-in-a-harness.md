---
title: A damage-state effect cannot be provoked by DRIVING under software rendering — write the ledger in a harness page, and run the sheet in the background
date: 2026-09-05
scope: pwa/src/tools/, scripts/
concepts: [harness, damage, screenshotting, events, verification]
---

Six runs of the crash scene across three seeds, three turns and two
timings, each waited on for ninety seconds of wall clock, stripped no wheel:
SwiftShader advances the sim at about a twentieth of wall time, so a
ninety-second wait is four seconds of stage, and whether a corner reaches
the ledger's line in those seconds is a lottery the seed decides. An effect
that only exists in a DAMAGE STATE is not photographed by driving into it.

The honest harness writes the ledger the way the engine would (the field at
its line, the part on `damage.broken`, `damage.version` bumped) and hands the
renderer the events the engine would have raised (`wheelFail` + `partBreak`
for a wheel), then lets the bot drive on — `pwa/src/tools/wheel-preview.ts`
is the pattern, copied from `roll-preview.ts`. The engine's own consequences
(the hub's drag, the pull) still happen, because the ledger IS the state.

And a three-seat sheet at 320×180 is over the ten-minute cap of a foreground
tool call under SwiftShader; the run dies with `Terminated` and no sheet.
Launch `npm run <lab> -- --skip-build` in the background after the first
build, and read `previews/<out>.png` when the task notification arrives.

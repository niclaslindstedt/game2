---
title: To photograph a surface that needs a finished run, seed its store instead of driving one — and shrink the viewport when you must drive
date: 2026-09-08
scope: pwa/src/game/, scripts/
concepts: [harness, screenshots, ui, tooling, indexeddb]
---

Software rasterization in a web session is PIXEL-bound, and the fixed-timestep
loop only advances as fast as the frames do. At 1280x720 a 68-second stage took
over fifteen minutes of wall time to reach its finish; at 480x270 the same run
took about seven. Drive small and resize to the shot viewport once the moment
has arrived — `page.setViewportSize` mid-run is free.

Better still, do not drive at all. A surface that only appears after a run
(the results card's presses, the replays page, anything reading a roll) can be
reached by writing the record straight into its own store:

    make record SEED=38 LENGTH=short OUT=previews/ref.jsonl   # a bot tape, headless
    # then, in the page: indexedDB.open("scanflick-replays", 1) → put({meta, tape})
    # reload, and the menu row is there

That turns a twenty-minute verification into a two-minute one, and it is the
only practical way to shoot the same surface three times while iterating on its
CSS. `?at=finish` is not a substitute where a RECORDING is involved: a placed
run arms no tape and no ghost, deliberately.

Two harness details that cost a cycle each: a scratch script must live inside
the repo (`previews/` is gitignored) or `playwright-core` will not resolve; and
a `waitForFunction` on the HUD clock can match the OUTGOING run's clock while a
load is still standing the next stage up, so wait on something the new run
owns.

---
title: A look-harness that discards `step()`'s return photographs a world with no event-driven effects in it — and says nothing about the omission
date: 2026-09-04
scope: pwa/src/tools/, scripts/
concepts: [harness, screenshotting, events, particles, verification, silent-failure]
---

`make rollcam` renders the real renderer over a real staged roll, so it
looked like the obvious place to judge a new crash effect. Three shots came
back with nothing in them, and the effect was fine.

The harness stepped the sim and threw the events away:

```ts
for (let t = 0; t < ticks; t++) step(game, botInput(game));
renderer.render(game, FRAME); // ...but never renderer.onEvents(...)
```

`renderer.onEvents` is the whole channel from the simulation to every
one-shot effect — landing bursts, impact debris, splashes, parts coming off,
the camera's own kicks. A harness that skips it draws a world where none of
them exist, and nothing anywhere reports that: the frames render, the car
moves, the sheet looks plausible. This one had been blind since it was
written; it exists to judge the CAMERA, and the camera reads state.

So: **before concluding an effect does not work, check that the harness
forwards the events.** And when adding a harness, forward them even if the
thing under test is state-driven — a sheet of a crash with no crash effects
in it is worse than no sheet, because it is read as evidence.

The fix is three lines and it improved the tool for everything else too.

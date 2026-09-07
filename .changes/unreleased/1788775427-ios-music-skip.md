---
type: Fixed
title: Music no longer skips after switching away from the app and back
---

Coming back to the game — most obviously on iOS, where the app is installed to
the home screen — left the score playing in stuttering bursts for a few
seconds. The sequencer books notes a fixed distance ahead of the audio clock,
and any tick arriving later than that leaves a stretch with nothing under it;
the first seconds back are exactly when the page is busiest, so it opened one
gap after another. It now books further ahead as soon as it sees the ticks
running late, and tightens back up once they are punctual again. The engine,
tyre and wind beds are also hushed when the app goes away, instead of holding
their last note for as long as the player is in another app.

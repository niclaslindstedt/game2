---
type: Fixed
title: The loading mark keeps moving while a stage is being built
---

On a long stage the loading screen's skid marks sat frozen for several
seconds before starting to move, which read as a hung game rather than a
loading one. The mark was drawn with a stroke animation, and those run on
the same thread that compiles the road and builds the country — so it
stopped dead for exactly as long as the heaviest work took.

It is filled by a sliding band now, which the browser runs off that thread
and which keeps climbing throughout. Both tracks also fill together, from
the tail at the bottom to the head at the top, the way a car lays them.

The developer menu's BENCHMARK works again: it was starting before the
stage it measures had been built, and now waits for it — so it also times
frames of racing rather than frames with a stage still being stood up
underneath them.

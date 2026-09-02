---
title: For a sound with a JOURNEY, distance picks the def — and a road layer is found by its NAME, never by its filter
date: 2026-08-28
scope: pwa/src/game/audio/
concepts: [bank, route, weather, beds, filters, test-conventions]
---

Thunder is the worked example of a sound whose whole character is the trip
it made. Two defs rather than one with a gain on it, because air absorbs
the transient far faster than the body: `thunder_near` leads with the rip
of the channel (a voice with essentially no attack), and `thunder_far` has
NO onset anywhere in it — an attack on distant thunder is what turns it
into a drum in the next room. `soundForThunder` then moves all four
`PlayShape` axes off the distance, and each for a physical reason: gain
(energy spreads), pitch (which scales every filter, because HF absorption
means a far strike is DARKER not quieter), stretch (the same wavefront off
a dozen hillsides), pan. The delay is the real prize and it is free —
`distance / 343` seconds, held by the renderer's own storm queue so leaving
the stage cancels the claps still in the air.

It is a CUE, not a `GameEvent`: the engine has no weather in it. Raise it
straight from the app and cap the repeat rate (`THUNDER_GAP_S`), because an
active cell puts several strikes in the air inside a second and the rolls
stack into mud.

**Adding a layer to a bed:** every layer has a NAME — a key in
`ROAD_LAYERS` / `ENGINE_LAYERS` / `WORLD_LAYERS`, its glide table and its
target function — and `tests/audio_test.ts` reads the targets by that name.
So a new layer is a new key in all three and a line in the test that sums
the right group (`SURFACE_LAYERS`, `SCRUB_LAYERS`, `WEATHER`), never a
filter-type heuristic that a neighbouring layer can silently satisfy.

---
title: A camera-dependent sound is a ROW in the listener table, never a branch in a bed or a def
date: 2026-09-02
scope: pwa/src/game/audio/listener.ts, pwa/src/game/audio/drive-bed.ts, pwa/src/game/audio/route.ts
concepts: [listener, camera, mixing, beds, route]
---

"The engine should be louder in the cockpit and the wipers only audible
inside" reads like two `if (view === "cockpit")` branches, one in the
engine bed and one in the scheduler. Written that way the third request
(the rain on the screen, the wind at the seals, a duller impact through a
cabin) is a third branch in a third file, and nobody can read what a seat
sounds like.

`listener.ts` is one table, one row per `PlayCamera`, with a multiplier per
part of the mix (`engine`, `exhaust`, `tone`, `tyres`, `scrub`, `wind`,
`weather`, `world`, `wipers`, `events`, `muffle`). The beds take the
numbers they need as a MIX argument (`EngineMix`, `RoadMix`) so their
target functions stay pure; the router applies `events` and `muffle`
through `heardFrom`. A new seat-dependent behaviour is a new column, and a
new camera is a new row. `RunAudio.setView` is called wherever
`playCameraRef` is assigned in `App.tsx` — four places, and the camera KEY
is the one that is easy to miss.

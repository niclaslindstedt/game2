---
title: An exit that gathers itself is the REDIRECT's doing, not the weathervane's — and the two are bound by Δtravel = Δnose + slip
date: 2026-08-28
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, exit, release, redirect, traction-ceiling, probe]
---

"Releasing the wheel straightens the car too easily" reads like a
`releaseSnap`/`releaseHang` complaint. It is usually not. Sweep those two
first and the table comes back nearly flat — because the slip is being eaten
by the lateral redirect, which decays it on its own at `latRate × latGive`
regardless of what the yaw is doing.

Check before tuning: trace the exit and print the HEADING and the WORLD
TRAVEL DIRECTION separately, not just the slip. Travel direction is
`heading + slip` (not minus — `rotateFrame` keeps world velocity fixed, so
the two must cancel). From 47° of slip the nose moved 17° while the travel
direction swung 62° onto it in 0.7 s: the tires ate the whole sideways
momentum, so the drift finished the corner and handed the car back straight,
FASTER than it went in.

The identity that governs every exit: **Δtravel = Δnose + slip consumed**.
The angle has to go somewhere. Slowing the redirect does not reduce the total
— it just hands more of it to the nose. So "the car should end up aimed off
the line" is a demand that the NOSE do the unwinding, and the only way to get
there is to take lateral force away while the car is sideways.

`latGive` is why there is so much of it. The demand is capped by `latCeiling`
but the residual slope is linear and unbounded: at the 6–7× over the ceiling
a real drift asks for, that term alone delivers more than twice the ceiling,
so a car pinned at 45° is pulled straight nearly as hard as one tracking true.

Fading the redirect by slip angle alone is NOT the fix — it costs the held
drift its radius (full-lock gravel 39 → 72 m, hairpins gone). Gate it on the
WHEEL instead: sideways, the front tires are as crossed up as the body is, so
fade only where a CENTRED wheel meets a real slip angle. Held drift
arithmetically untouched, counter-steer unchanged, and the mechanic that
falls out — lock is what re-grips the car — is the one the complaint was
asking for.

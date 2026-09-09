---
title: A particle sheet lit by the car's lamps shows NOTHING until its ambient rides the daylight down
date: 2026-09-09
scope: pwa/src/game/snowfall.ts, pwa/src/game/sky.ts, pwa/src/game/dust-light.ts
concepts: [snow, weather, rendering, lighting, night, particles]
---

Grafting the dust-lamp register (`dustLampSum`, dust-light.ts) onto the
snowfall lit the flakes correctly on the first try and changed the frame by
nothing measurable — even at a deliberately absurd gain of 40. The cause was
not the graft: `snowTone` floored the flakes' AMBIENT near white at night
(`Math.max(0.35, hemiIntensity)` plus a flat 45% lerp toward white), so every
flake was already at the top of the range and adding light had nowhere to go.

The rule generalises to anything lit per-particle off that register: the effect
is the CONTRAST between lit and unlit, so the ambient half has to fall with
`dayLight(preset)` or the lamp half is invisible. dust.ts's own header already
says this ("what makes a night plume nearly invisible where a noon one is
not") — the snow simply had not followed it.

Two things that made this expensive to find, both worth reusing. A gain sweep
proves nothing when the output is already saturated, so probe the MECHANISM
instead: temporarily replace the summed term with a flat `vec3(1,0,0)` (every
particle turns red = the graft lands), then with `vec3(sum.r * 20, float(count)
* 0.4, 0)` (green = the register is filled at draw time, yellow = this particle
is actually in a cone). Two builds answered what six gain tweaks could not.
And judge it on a cropped, enlarged night frame — a full 1280x720 thumbnail
hides a several-fold brightness change on sprites a few pixels across.

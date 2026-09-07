---
title: The two skies' additive layers land on very different GROUNDS — parity is of the chart, not of the opacity number
date: 2026-09-07
scope: pwa/src/game/night-sky.ts, pwa/src/game/clouds.ts, pwa/src/game/starfield.ts
concepts: [sky, parity, rendering, stars]
---

The simple sky's dome is much LIGHTER at night than the shader dome — a
grey-blue midnight against a near-black one. So an additive layer (the Milky
Way, and anything else added over the gradient) drawn at one strength on both
is not one look on both: at the strength that read as a faint glow on the
shader dome, the same band on the simple sky read as a searchlight parked
behind the hills. `night-sky.ts` carries `BAND_ON_SIMPLE` for exactly this.

So when the LOW sky stands in for something the dome evaluates, hold the two to
the same CHART — same frame, same place, same shape, same noise — and let the
strength differ, with the reason written next to the number. Both rows on the
sheet at the same hour is how you see it.

Two measurement notes for the same loop. Eyeballing a faint glow at a
thumbnail lies in both directions: crop the cells at native resolution and take
a `median` column profile through the sky band (the median kills the stars and
leaves the glow), then compare the two rows' profiles — that is how the band
was proved to be in the same PLACE on both skies while being at different
brightness. And a strip mesh standing in for a field must be tapered to nothing
at its own rim: cut off where the field is still non-zero, the strip draws its
two edges across the sky as straight seams.

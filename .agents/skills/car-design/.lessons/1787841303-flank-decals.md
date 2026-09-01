---
title: A decal on the flank must sample the body's own folds and sit on ONE plane
date: 2026-08-27
scope: pwa/src/game/car/shell.ts, pwa/src/game/car/trim.ts
concepts: [livery, decals, stripes, flares, wheel-arch]
---

Anything laid on the flank — a stripe, a rubbing strip, a race number — is
drawn a few mm proud of `flankX(z, y)`. Two things break that, both of
which look like rendering bugs rather than sampling bugs:

**Uniform z sampling bursts through a fold.** A band stepped evenly along z
cuts a straight chord across a box flare's step, and the bodywork comes
through the paint as vertical slivers that read as drips. No amount of
`proud` fixes it — the overshoot is half the flare's whole extra width.
`sideBand` samples at its own ladder UNION the spec's flare stations and
profile stations for exactly this reason; a new decal builder must do the
same or reuse `sideBand`.

**Per-cell depth splits a glyph.** Sampling `flankX` separately for each
cell of a blocky number puts neighbouring cells at slightly different x,
and the glyph shows hairline cracks between its rows at a grazing angle.
Compute ONE plane for the whole glyph (the max `flankX` over its footprint)
and lay every cell on it.

Related: a band must never hang inside a wheel opening. `sideBand` takes
`overArch` — `clip` lets the arch eat into a painted panel, `ride` keeps a
rocker stripe's height and arcs it over. Both cap at just above the belt;
without that cap a band pushed up by an arch climbs onto the shoulder and
balloons into a dome.

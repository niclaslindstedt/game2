---
title: Measure a reference photo against its AXLES with a ruled crop — and know the two bars a measured spec cannot cross
date: 2026-09-05
scope: pwa/src/game/car-styles.ts
concepts: [proportions, reference, measurement, contact-sheet, car-design, collision, fastback]
---

Two eyeball reads of one side elevation disagreed by twenty centimetres.
What works: a twenty-line `playwright-core` page in the scratchpad that draws
the image scaled and rules a labelled line every N source pixels (PIL and
ImageMagick are not installed; `ln -s <repo>/node_modules` into the scratchpad
so the import resolves). Read every landmark as a pixel coordinate and convert
against the wheel centres: scale from the wheelbase, z from the axles, y from
the ground under the tyre. An end elevation gives the cross-car numbers the
same way, scaled off the body's width. Write the metres into the spec.

What works: crop the reference into thirds with a gridded canvas — a
Playwright page that draws the image scaled and rules a labelled line every
twenty source pixels at three times zoom (a fifty-pixel grid at twice zoom
read a rounded nose ten centimetres high, and the miss survived a first
overlay) (a twenty-line `.mjs` in the scratchpad; PIL and
ImageMagick are not installed in a web session) — then read every landmark
as a pixel coordinate and convert against the two things nothing can argue
with: the wheel centres. Scale from the wheelbase, place z from the axles,
place y from the ground under the tyre. Do the door, the pillars, the roof's
ends, the tailgate's foot, the lamp corners and the bumper edges all in one
sitting and write the metres into the spec's comment, not the fractions of
length — the axles are where the loft already puts its wheels.

- **The nose cannot go under 0.84 m.** `SOLID_PROP_HEIGHT` (0.5) must sit
  between 45% and 60% of the LOWEST `profile[0].topY` in the catalog. A real
  aero nose at 0.69 fails it; lift the cap to the bar, keep the cowl and the
  belt honest, and say so in the spec.
- **Bumper faces stop at `TUNING.collision.halfLength` (2.1 m).** A 4.46 m
  car does not fit; scale the WHOLE car to ~95% — length, heights and
  widths alike. Shortened alone it reads tall the moment SKILL.md's
  overlay lays it over the photo.

Fastback specifics: `cabin.baseRearZ` is the BACKLIGHT'S FOOT, so a raked
rear glass is the tail patch itself; the quarter glass's rear edge goes in
metres (`quarterZ`) so it stands plumb and the flank left behind it is the
sail-panel wedge. A B-pillar leans at a fixed `split`; state it as `splitZ`.
A rim of 0.86 of the tyre is a modern wheel; a period one is 0.65.

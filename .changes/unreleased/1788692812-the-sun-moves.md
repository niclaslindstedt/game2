---
type: Added
title: The sun moves — an hour on the clock, a sky of real clouds, mist in the valleys
---

A stage is no longer set to "dawn" or "dusk": it is set to an HOUR, and the
sun moves from there at an hour a minute of racing. Start at sunset and the
stage is driven down through the afterglow into the dark; start in the small
hours and the dawn comes up over the last corners. Where the sun stands at a
given hour is real astronomy for the season and the country — 16:00 in a
taiga winter is already night, a midsummer night there never gets darker
than twilight, and the desert's December four o'clock is a golden afternoon
— so the same hour is a different sky in every country. Roam's TIME row is
now HOUR, a clock in whole hours with a sun or a moon on it for the light it
is; a `?hour=` link sets it, and the old `?tod=` words still work as the
hour that light happens at. The campaign's stages carry their own hours.

The sky itself is new. On MEDIUM and HIGH detail the dome is drawn as one
shader: the cloud chart's sheets at their real altitudes — cumulus a
kilometre up, altocumulus at three, cirrus combed along the wind at nine —
foreshortened into the haze, lit and shaded by where the sun is, and dressed
per stage from its seed: a summer forest builds cumulus, a winter one sits
under a stratocumulus sheet, the desert has a few heaps a long way up and
cirrus, the Alps build cumulus over the peaks and comb altocumulus into
lenticular streaks. The sun sets on the layers one at a time, lowest first,
so a cirrus sheet and the airliners' contrails burn orange over a valley
that has gone grey. A cumulus crossing the sun dims the stage and softens
the cars' shadows for as long as it takes to pass. Under rain and a storm
the same dome draws the deck and the scud under it, dark at night rather
than a white ceiling over a black stage.

Morning MIST lies in the valleys: thickest around sunrise, burnt off by
mid-morning, most in autumn, none in a dry desert — a sheet over the
taiga's bogs, and a CLOUD SEA in the Alps that a pass looks down onto. The
sun glows through it, and the country's own shadow is marched off the
heightfield so a low sun stops at the ridge: a valley goes into the
mountain's shade while the peaks across it are still lit, and the sea in it
is grey under an orange sky. HIGH adds the sunlit edges on every cloud and
the clouds' shadows crossing the ground. LOW keeps the arcade sky it had.
The `make sky` sheet is now a September day over the taiga, hour by hour.

Ghosts and stored Roam settings written before the hour existed are read
as the hour their word meant; a time-trial ghost recorded before this
change no longer matches its level and is recorded again on the next run.

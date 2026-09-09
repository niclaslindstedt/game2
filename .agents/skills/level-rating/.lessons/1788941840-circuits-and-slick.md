---
title: A circuit's net drop is always zero, and `slick` is surface grip — two hard limits on what a ladder can be asked for
date: 2026-09-09
scope: engine/rating/, pwa/src/game/campaign.ts
concepts: [campaign, circuits, demand, cars, seasons]
---

Two structural facts that end otherwise-reasonable curation attempts, both
worth knowing before the sweep rather than after it.

**A circuit cannot be tilted.** A lap comes back to its own start line, so
its net elevation change is zero for every seed and every dial position. Any
"this stage descends" ask applies to sprints only; what a circuit can be
asked for instead is FLATNESS — `relief.climb` (m of ascent per km, band
16–42) is the number, and it is paid once per lap, so a 37 m/km circuit over
three laps is 282 m of climbing.

**`slick` is the ROAD's surface grip, not the weather** (`slickness()` in
character.ts reads `TUNING.surfaces.grip` times each sample's `bite`). Rain
does not raise it. The `slide` demand row leans on `slick` at 0.9, so in a
country whose only slick surface is snow or ice, taking WINTER away caps the
sideways car's demand structurally — a snow-free taiga tops out near 46%
slide however narrow, unsealed and enclosed the road is made. Do not chase a
slide target in such a country; either accept the ceiling or note that the
country is not that car's.

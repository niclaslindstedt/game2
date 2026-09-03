---
title: A HANDLING change re-rolls every fixture a test found by DRIVING — and a seed list holding one qualifying seed is a pinned seed wearing a search's clothes
date: 2026-09-03
scope: tests/
concepts: [seeds, test-conventions, measurement, physics]
---

The seed-fixture trap is not only the generator's. A test whose fixture is
found by driving — `water_test`'s "a shore the car can scramble back out of"
searches ~70 seeds by driving a minute of full lock off-road, `circuit_test`
races seed 3 for three laps — re-rolls on any change to the CAR, because what
the seed has to supply is a drive that survives.

Two things this cost, both worth planning for:

- **A search over a wide list can still be a pin.** `water_test` looks like a
  search and its comment says the tail is "the search SPACE, wide on purpose".
  On `origin/main` exactly ONE seed in ~48 qualified. A roll model change knocked
  that seed out and every one of them failed with "no seed put a shore the car
  could drive back out of", which reads as the feature being broken. Before
  re-pinning, run the search over a wider range and count the hits: nine seeds
  in 100–360 still qualified, so the property was fine and the list was thin.
  A search whose hit rate is one is worth widening whether or not it is red.
- **Check the baseline before rewriting a fixture.** `git worktree add ../base
origin/main` and run the same probe there. It said `water_test`'s property
  held on main and `rivals_test`'s did not depend on my change at all — one
  crew simply now takes three times the winner's time, which spends a debt the
  test asserted would stand. That told me which assertion was incidental
  (`owed > 0`) and which was the actual claim (home, timed, never on the road).

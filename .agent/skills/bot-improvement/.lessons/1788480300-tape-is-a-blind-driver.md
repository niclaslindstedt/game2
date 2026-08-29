---
title: A recorded run cannot be re-raced against a field it never met — the rally start's neighbour shunts it within two seconds
date: 2026-08-29
scope: engine/sim/race.ts, engine/sim/tape.ts, engine/sim/field.ts
concepts: [difficulty, calibration, run-tape, rivals, determinism]
---

The obvious way to ask "what would this drive be worth at hard" is to replay
the recording against a hard field. It does not work, and the failure is
silent-looking: the run simply DNFs a kilometre off line.

Two reasons, both structural. A tape is a blind driver — it steers where it
steered, so a car that was not there when it was recorded is a car it drives
into. Worse, a shunt that DID happen was steered out of on the recording, so
replaying those corrections without it swerves. And the rally start puts the
crew in front at `GRID_STAGGER` (2.4 m) alongside the player, both leaving at
once: measured, the player's line diverges within **two seconds** of the
green. Recorded at hard, seed 42: reproduction 0.01 m drift, the same tape
against easy 1955 m.

The working answer is `placeAmongField` (`engine/sim/race.ts`): race the
crews with nobody on the road with them and slot the recorded TIME into the
result. It is exact rather than approximate, because rivals are never
resolved against each other (`rubRivals` is the player's alone) — so a crew's
time is the same time whether or not anybody was out there with them.

Keep the re-race for one job only: replaying the tape into its OWN field, as
the validity check. Its drift says whether today's handling still drives the
recording the way it was driven.

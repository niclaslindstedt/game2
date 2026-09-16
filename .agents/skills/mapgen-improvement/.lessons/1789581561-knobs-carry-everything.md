---
title: Anything that must reach ALL of mapgen rides on StageKnobs — and then four road-identity keys have to learn about it
date: 2026-09-16
scope: engine/mapgen/, pwa/src/game/
concepts: [dials, determinism, caching, generator-version, stage-spec]
---

`StageKnobs` is the only object handed to every module in `mapgen/` — the
search, the compiler, `createLandField`, `createGeology`, `createTerrain`. So a
new thing that decides what a seed builds (the generator VERSION was the first)
goes there rather than being threaded as a parameter through nine signatures.
`resolveKnobs` is the funnel that makes it safe: one place clamps and defaults
it, and every entry point already runs through it.

The cost is that FOUR places identify a road by its dials, and all four are
wrong until they learn about the new field. Three of them fail silently:

| Where | What breaks if it is missed |
| --- | --- |
| `land.ts`'s memo key | a stage built from another stage's country |
| `pwa/src/game/app-actions.ts`'s `ensureTrack` key | the wrong compiled track is reused |
| `pwa/src/game/split-records.ts`'s `splitStageId` | two different roads share one board |
| `pwa/src/game/stage-spec.ts`'s `sameStage` | the run is not rebuilt when it should be |

`land.ts`'s comment already warns about this for dials; the other three do not.
`ghostMatches` walks every key of the type, so it is free.

Two more consequences worth knowing before starting: a field on `StageKnobs`
must be excluded from `NumericKnob` unless it really is a 0..1 band (`biome`
was the only precedent), and `tests/ghost_test.ts` and `tests/tape_test.ts`
spell every knob out literally, so each addition costs two fixture edits.

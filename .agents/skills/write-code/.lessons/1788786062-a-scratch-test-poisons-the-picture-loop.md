---
title: A scratch probe left in `tests/` fails `make build` — and the picture tools happily photograph the stale dist anyway
date: 2026-09-07
scope: tests/, scripts/
concepts: [test-conventions, tooling, harness, typecheck, screenshots]
---

`make build` runs `tsc --noEmit` over the ROOT project first, and the root
project includes `tests/`. So a throwaway `tests/zz_scratch_test.ts` — the
quickest way to print a number out of a pwa module with the `@engine` aliases
already wired — fails the BUILD from then on, in a file that has nothing to do
with the change.

Vitest never says so: it transpiles with esbuild and does not typecheck, so
the scratch file runs green while `tsc` rejects it. The same asymmetry bites a
real test — `bodySpecFor("coupe")` (it takes a `CarSpec`, not an id) passed six
vitest runs and failed the gate.

The expensive part is the second-order effect. `make build && make <lab>`
chained with `&&` stops, but a lab run as its own command does not care that
the build failed: every harness serves `pwa/dist`, so the shot comes back from
the PREVIOUS build. The picture then shows the last change rather than this
one, which reads as "my fix did nothing" and sends the session off retuning
something that was never in the binary.

Two habits that cost nothing:

- Delete a scratch probe the moment it has printed its number, before the next
  `make build`.
- Read the build's own last line. `✓ built in 1.7s` is the only thing that
  makes the next photograph about this change; `make: *** Error 2` scrolling
  past above a lab's output is the whole failure.

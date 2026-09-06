---
title: The crash ledger's "never puts energy in" test passes on a LUCKY arrival — 53 of 120 drop heights break it on untouched main
date: 2026-09-06
scope: engine/game/roll.ts, engine/game/roll-contact.ts, tests/crash_ground_test.ts
concepts: [ledger, contacts, pivot, invariant, tests, latent-bug, probes]
---

`crash_ground_test.ts`'s "never puts energy into the crash, on any surface"
holds `crashEnergy` to not rising by more than `crashTurbulence` on the step a
body lands. It passes on `main`. It does NOT pass in general: sweep the
`drop({ height })` it stages from 8.5 m to 9.5 m in 25 mm steps and **53 of
120 surface/height pairs break it**, several by 5.5 J/kg against an allowance
of 0.035 — 150x. The committed `height: 9` simply sits in a clean window.

So the first thing to establish when a change of yours reddens it is whether
the change caused it or merely walked the crash off the lucky height. The
probe is cheap: copy the test, wrap its body in a height sweep, write the
worst overshoot per height to a file (vitest's config swallows `console.log`
here — use `writeFileSync`), and run it on a clean worktree at `origin/main`.
Perturbing `u` by ±1 m/s is NOT enough to find it; the height is.

Where the energy comes from: on the failing steps the body is RISING off a
contact, and it gains more height than its vertical speed accounts for. The
extra is the attitude — `weightOverOrigin` lifting the weight as the body
rotates — without the rotation rates paying for it. That is the pivot exchange
in `roll-contact.ts`, not the flight, and it is a real defect rather than a
tolerance question.

The practical consequence for anything touching a FLIGHT: adding even a 1%
per-hop perturbation to `roll.ts`'s between-contact branch (air drag, say) is
enough to reroute the accident onto a breaking arrival. That is not a reason
to abandon the change, but it is a reason not to read the red as your own
bookkeeping error — check `main` under the sweep first, and consider keeping
the perturbation out of `roll.ts` until the pivot exchange is fixed.

---
title: "`--skip-build` skips the PREVIEW HARNESS bundle, not `pwa/dist` — so `make build` does not cover it, and the sheet silently photographs the previous build"
date: 2026-09-07
scope: scripts/car-preview.mjs, pwa/src/tools/car-preview.ts
concepts: [preview, measurement, before-after, build, car-design]
---

The contact-sheet tool builds its own bundle under `previews/.car-preview`,
and that is what `--skip-build` skips. `make build` builds `pwa/dist`, which
the harness never loads. The two are unrelated, and running the first does
nothing at all for the second.

So after editing `car-body.ts`, `car/`, or anything the harness imports, a
`--skip-build` sheet renders the code as it was at the last full harness
build. There is no warning and no stale-cache message; the sheet comes back
looking plausible.

The symptom is an A/B that shows no difference. Three sheets in a row came
back identical while a shader graft was being tuned, which read as "the
effect is not being applied" and sent the session hunting through the graft,
the material and the detail gating — none of which was wrong. Forcing the
effect to its maximum and re-rendering WITH a full build is what settled it:
if the extreme does not show, the picture is not of your code.

The skill's own note is accurate — spec-only iterations may skip the build,
because a spec is data the harness reads. The trap is that `make build` in
the same command line looks like it covers the difference. It does not.

Rule of thumb: `--skip-build` is for `--variants` runs and nothing else. Any
sheet meant to show a CODE change is a full run, and a before/after pair is
two full runs.

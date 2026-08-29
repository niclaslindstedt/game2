---
title: There is no deterministic screenshot of a RIVAL mid-stage — verify the field with a page probe, not a scene
date: 2026-08-29
scope: scripts/screenshot.mjs, pwa/src/game/field-cars.ts, pwa/src/game/standings.ts
concepts: [screenshotting, field, rivals, determinism, verification]
---

Three things stack up, and together they mean a `capture` at a fixed stage
clock cannot promise a rival in frame:

- The player is always car 15 of 15, so every crew is AHEAD — and ahead on a
  rally stage means round a bend or over a crest. At stage time 16 the
  nearest was 86 m away and still not in shot, from the chase cam or the
  helicopter.
- The field is simulated on a catch-up budget of a few ms per frame
  (`CATCHUP_MS`), so under the software renderer `make screenshots` uses,
  where anybody IS depends on the frame rate of the machine taking the
  picture.
- `?start=1` cannot reach a field at all — only a campaign walk-in enters
  one, which costs a menu walk and a minute of stage time per attempt.

The harness already says this about name tags; it is true of anything the
field does. Do not ship a scene that names one state and captures another —
delete it and verify another way.

What works instead, and costs about five minutes: build with a throwaway
`window.__probe` written from the per-frame path, serve `pwa/dist` from a
tiny node http server (set the content-type off the RESOLVED path, or `/`
comes back as a download rather than a page), walk the campaign, and read it
at several stage clocks. Ranges and a rising spawn count answer "is this
code running on real cars" definitively, where a photograph only answers
"was one in frame". Then revert the probe. `make profile` is the other half:
a new pooled cloud shows up as exactly +1 draw per RENDER PASS, so +2 on the
driving frame — and if it appears in scenes that have no field, hide the
`Points` when the entry list is empty rather than leaving it to be culled.

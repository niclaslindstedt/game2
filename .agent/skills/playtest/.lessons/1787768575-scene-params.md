---
title: Scene URL params must be MERGED, not appended — the first duplicate key wins
date: 2026-08-26
scope: scripts/screenshot.mjs
concepts: [harness, seeds, scenes]
---

`capture()` built its URL as `?seed=42&start=1${params}`, so a scene passing
`"&seed=28"` produced `seed=42&seed=28` — and `URLSearchParams.get` returns
the FIRST match, so the override silently did nothing and the scene screenshot
the default stage instead. Merge overrides through
`new URLSearchParams({ ...defaults, ...params })`. The failure is invisible:
the shot renders fine, it is just of the wrong stage, so check the HUD's
STAGE number in the PNG before trusting a seed-pinned scene. Pinning a seed
is what makes a scene stageable at all — a scene that needs the car at a
specific feature ("in the air") should pin a seed whose opening straight
carries that feature and drive to it on a timer.

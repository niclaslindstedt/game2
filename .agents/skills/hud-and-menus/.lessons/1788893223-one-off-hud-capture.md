---
title: Photograph a HUD state no suite scene reaches with a throwaway script AT THE REPO ROOT, over `serveDir` — and retry, because a live readout races the capture
date: 2026-09-07
scope: scripts/screenshot.mjs, scripts/lib/serve-dist.mjs
concepts: [screenshots, review, hud, harness]
---

Some HUD states cannot be waited for from a driving scene: the gear plate's
QUIET form (the bot holds the revs against the limiter), or a pacenote call
mid-fill. `scripts/screenshot.mjs` has no way to add a scene for one look and
`capture()` is not exported, so write a throwaway that imports
`serveDir` from `scripts/lib/serve-dist.mjs` (it serves `pwa/dist` with the
right MIME types — do not hand-roll the `node:http` server) and launches
`chromium` on `process.env.CHROMIUM_PATH`.

- **Write it in the repo root, not the scratchpad.** `playwright-core`
  resolves from `node_modules`, so an ESM file outside the tree fails with
  `ERR_MODULE_NOT_FOUND`. Write `./.something-tmp.mjs` and delete it in the
  same command.
- **A live HUD element races the capture.** The snapshot rebuilds the strip
  about twelve times a second, so between `waitForSelector` and the shot the
  node can be replaced: `elementHandle.screenshot()` fails "element is not
  stable" and `boundingBox()` returns null. Read the rect and everything else
  you want (`aria-label`, classes) in ONE `page.evaluate`, then
  `page.screenshot({ clip })`, and wrap the pair in a retry loop.
- **Crop with `clip`.** There is no ImageMagick and no PIL in a web session,
  so a full frame cannot be cut down afterwards and 1280×720 is too small to
  judge one instrument in. To view several crops together, inline them into
  one page as `data:image/png;base64` — a `file://` `<img>` will not load from
  a `setContent` page.
- **Seed-pinned scenes go stale silently.** `shot-pace-jump-*` name a lip by
  seed and arc position; a generator change moves it and the scene dies on a
  240 s `waitForSelector` timeout. Re-list the stage's lips and re-pick.

---
title: To photograph a HUD state no suite scene reaches, copy the harness preamble into a throwaway script AT THE REPO ROOT
date: 2026-09-07
scope: scripts/screenshot.mjs
concepts: [screenshots, review, hud, harness]
---

Some HUD states cannot be waited for from a driving scene. The gear plate's
QUIET form is one: the bot holds the revs against the limiter, so every
driving shot catches the shift light instead, and the plate's normal look
is only on screen on the start line and off the throttle.

`scripts/screenshot.mjs` has no way to add a scene for one look, and
`capture()` is not exported. The cheap move is a throwaway script that
copies its preamble — the static `node:http` server over `pwa/dist`, then
`chromium.launch({ executablePath: process.env.CHROMIUM_PATH })` — and
waits on whatever cursor the state has (`.hud-lamp-red` counts for the
countdown). Two things bite:

- **Write it in the repo root, not the scratchpad.** `playwright-core`
  resolves from `node_modules`, so an ESM file outside the tree fails with
  `ERR_MODULE_NOT_FOUND`. Write it as `./.something-tmp.mjs` and delete it
  in the same command.
- **Take the MIME type off the resolved FILE, not the request path.** `/`
  has no extension, so a lookup on the path serves `index.html` as
  `application/octet-stream` and Playwright fails the navigation with
  "Download is starting".

Use `page.screenshot({ clip })` for the crop: there is no ImageMagick and
no PIL in a web session, so a full frame cannot be cut down afterwards and
a 1280×720 shot is too small to judge one instrument in.

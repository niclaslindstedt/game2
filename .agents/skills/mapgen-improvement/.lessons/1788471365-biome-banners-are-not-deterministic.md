---
title: `make previews` writes two artifacts and only ONE is deterministic — re-encoded biome banners are diff noise, not evidence
date: 2026-09-03
scope: scripts/biome-preview.mjs, scripts/stage-routes.mjs, pwa/public/previews/
concepts: [preview, review, determinism, tooling]
---

`AGENTS.md` requires `make previews` after any generator change, and it
regenerates two different things:

- `pwa/src/game/stage-routes.ts` — pure Node, deterministic. If a change
  altered a campaign stage's road, this file moves. **This is the evidence.**
  It coming back identical is a real result worth reporting.
- `pwa/public/previews/biome-*.jpg` — renders driven through headless
  Chromium, and NOT byte-stable: two consecutive runs on an unchanged tree
  produce different bytes.

So a modified `biome-*.jpg` proves nothing on its own. Check it before
committing: run `npm run biomes` twice and compare `md5sum`. If the bytes
move on an unchanged tree, `git checkout --` the images rather than
committing a re-encode that reads as "the generator changed the countries".

The banners are shot over each location's FIRST stage (`taiga-1` seed 38,
`desert-1` seed 16 — both sprints today), so a change scoped to another
shape or another seed cannot have moved them geometrically. Confirm that
from `pwa/src/game/campaign.ts` and let the routes file carry the argument.

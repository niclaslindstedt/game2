---
title: Before blaming a worse biome banner on a new opener seed, re-shoot the OLD seed from a baseline worktree
date: 2026-09-08
scope: scripts/biome-preview.mjs, pwa/public/previews/
concepts: [campaign, previews, measurement, baseline]
---

Re-seeding a country's first level re-shoots its banner, and the new taiga and
desert banners came back as near-white fog where the committed ones show road,
trees and a lake. That reads as the new seeds sitting in a hollow, and it was
not: shot from a `git worktree add ../base origin/main` tree, the OLD seeds
come back foggy too. The committed banners are stale against main — the
atmosphere moved under them, and nothing catches it, because
`tests/stage_preview_test.ts` checks the shot's RECEIPT (which level it was
of), never its pixels.

So the A/B is the first move, not the last: link `node_modules` into the
baseline worktree, `make build`, `npm run biomes -- --out tmp/shots`, and
compare. It costs about ten minutes and it decides whether you are curating a
level or chasing a rendering regression that belongs to `atmosphere`.

The banner is still worth choosing an opener on. Shooting five candidates
(patch the seed in `campaign.ts`, `npm run biomes -- --out <dir>`, restore) is
about two minutes each, and the spread between the best and the worst was
large — file size is a usable first sort, since a foggy frame compresses to a
third of a detailed one.

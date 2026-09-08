---
title: LOOK at what `make biomes` produced before committing it — a headless render that fails silently writes a plausible-looking file
date: 2026-09-08
scope: scripts/
concepts: [preview, review, rendering, biomes, campaign]
---

`make biomes` after a generator change re-shot all three country banners and
reported success for each, with sizes and camera lines. The files were broken:
the alpine banner was a flat blue silhouette with no terrain, no road and no
colour, and the taiga's and desert's dropped from 40 KB and 38 KB to 23 KB and
11 KB — despite both countries being provably unchanged (digest parity clean,
`make routes` moving only the alpine's polylines).

The tell was the two banners that had no business changing at all. A country
whose stages are byte-identical must re-shoot to a near-identical file; when it
does not, the RENDERER is what changed, not the generator, and in a headless
web session that usually means the world chunks never finished loading.

So: after `make biomes`, read the JPEGs — actually open them — and compare the
sizes of the countries the change did not touch. A stale banner is a much
smaller problem than a committed blank one, so revert all three and flag the
re-shoot rather than shipping what came back. The same caution applies to any
`make` target that drives Chromium (`previews`, `screenshots`, `cars`, `sky`):
success is the picture being right, never the command exiting 0.

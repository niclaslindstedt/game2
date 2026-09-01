---
title: Placement is chunked for endless runs — props ahead of the road get retired, not prevented
date: 2026-08-26
scope: pwa/src/game/world.ts, pwa/src/game/flora.ts
concepts: [placement, endless, streaming, retire]
---

world.ts builds scenery per road CHUNK (an endless stage streams chunks in
ahead of the car and prunes them behind; a finite stage is one chunk). A
chunk's props are validated against road that EXISTS at build time — the
endless stream's future road can later run through an already-planted
grove, and no placement rule can prevent that. The mechanism is
`Flora.retire(hits)` plus the litter equivalent in
`SceneryChunk.clearNear`: when a new chunk lands, every live chunk zeroes
the instances the new samples claim. Placement RNG is seeded per chunk
(`seed ^ 0x5f356495 ^ imul(from, …)`), so a finite stage (from=0) keeps the
exact pre-chunking forest. Nothing may grow in a stream either —
`inStream` from streams.ts guards flora, undergrowth and litter. ENGINE
props (`buildWild`) retire on a different rule: they go when the field
stops placing them, not on a radius of the renderer's own.

---
name: nature
description: "Use when working on the NATURE the stages run through — biomes, trees and other flora, ground cover, terrain ground colors, bedrock, or the rally-gate dressing. Owns the biome-as-data model (communities/groves, contextual overrides), the flora library's parametric low-poly builders, the terrain's paint layers (noise bands, slope bedrock, detail speckle), the placement rules that keep everything off the road and out of the lakes, and the look-first verification loop."
---

# The nature: biomes, flora, and the living ground

The landscape IS half the game's look — the road is a ribbon through it.
This skill owns everything that grows or weathers beside that ribbon: which
biome a stage is set in, which plant communities quilt it, how each tree is
built, how the ground is painted, and where the bedrock shows through.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs nature --list`, then the ones the task
touches. Load **`skill-reflection`** at both ends of the session, and
**`write-code`** beside this one for any code change. For anything that
moves or animates (dust, spray), that is `visual-effects`; for the road and
its generation, `mapgen-improvement`.

## The four files, one direction of flow

| File                      | Owns                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pwa/src/game/biome.ts`   | Biomes AS DATA: the ground palette, the plant communities (weighted species mixes + density + ground cover), the contextual overrides (lakeshore, highland), grove scale |
| `pwa/src/game/flora.ts`   | HOW each plant is shaped: the `GeoBuilder` merge helper, ~26 parametric variants, the two shared materials, the ground-cover sway shader                                 |
| `pwa/src/game/terrain.ts` | The heightfield AND its paint: altitude bands, moss/heath/forest-floor noise patches, slope-revealed bedrock, the tiling detail speckle, the road-apron shelf            |
| `pwa/src/game/world.ts`   | WHERE things stand: seeded placement, community lookup, road clearance, verge ground cover, boulders, cut-wall outcrop slabs, the rally gates and hay bales              |

Biome → flora ids are strings on purpose: `biome.ts` imports nothing from
`flora.ts`, and `buildFlora` throws on an unknown id, so a typo in a new
mix fails loudly on the first stage build. Shared value noise lives in
`pwa/src/lib/noise.ts` — terrain shaping and grove placement must keep
drawing from the same helpers or their patches stop lining up.

## The biome model

- **A biome is data, not code.** Ground palette + communities + overrides.
  A new biome is a new `Biome` row and a `biomeFor()` decision — no new
  systems. Today `biomeFor()` always returns `TAIGA`.
- **Trees come in COMMUNITIES, not confetti.** A real forest is groves: a
  spruce wood, a birch grove, a pine heath, an open meadow. `communityAt`
  in `world.ts` hashes grove-scale cells (wobbled by noise so borders
  meander) into the biome's weighted community list; each spot then draws
  its species from THAT community's small mix. You should see one or two
  species per stretch, all ~26 only across a whole stage.
- **`density` is what makes meadows.** A community with near-zero density
  is open land — its rare trees read as lone rowans, its `groundCover`
  multiplier fills it with swaying tall grass instead.
- **Context beats community.** Within ~4 m of the water table the
  lakeshore mix wins (willow, birch); above 26 m terrain altitude the
  highland mix wins (squat spruce, juniper, snags). Those bands mirror the
  terrain's own painting, so flora and ground always tell the same story.

## The taiga roster (26 variants)

Spruces `spruceTall/Old/Young/Squat/Dark`, pines `pineTall/Crooked/Young`,
firs `firSlim/Dense`, broadleaves `birch/birchPair/birchYoung`, `aspen`,
`oak`, `maple`, `rowan` (berry accents), larches `larch/larchOld`, shrubs
`willowShrub/juniper`, dead wood `deadSnag/stump/fallenLog`, ground cover
`tallGrass/fern/largeFern/heathShrub` (the last four are the two-sided,
wind-swayed set).

## The craft rules

- **Everything is merged vertex-colored low-poly under Lambert light.** One
  `GeoBuilder` geometry per variant, one `InstancedMesh` per variant used,
  two shared materials — a whole forest is ~30 draw calls. New parts go
  through the builder's helpers (`cone`, `cyl`, `blob`, `blade`); per-facet
  brightness jitter and the shared `detailTexture()` speckle are what keep
  big color fields from reading plastic.
- **Placement is seeded by the track seed** (`createRng(track.seed ^ …)`),
  so a seed always grows the same forest. Cosmetic-only randomness (facet
  jitter, instance tint) still goes through the passed RNG — keep it
  deterministic; it costs nothing.
- **Nothing grows on the road** — `clearOfRoad` walks the APRONED samples
  (the dirt run-up before the start gate and run-off past the finish are
  road too), and nothing stands below `LAKE_Y + 1.2`.
- **Bedrock shows where the ground is steep.** The terrain colors by slope
  (normals first, colors second), so road cuts between high ground paint
  themselves as rock; `world.ts` doubles the effect with outcrop slabs
  wherever the embankment climbs hard beside the shoulder. Ground accents
  (moss, heath, forest floor) are big soft noise patches, not per-vertex
  confetti.
- **The ground-cover sway is a vertex shader** on the shared two-sided
  material (`onBeforeCompile`, phase from the instance's world position,
  displacement weighted by local height). It runs on `world.update(dt)` —
  renderer time, never simulation state.

## Verify by LOOKING

Numbers can't judge a forest. After any nature change:

1. `make build`, then `CHROMIUM_PATH=/opt/pw-browsers/chromium make
screenshots` — the grid shot shows the start dressing, speed/drift show
   the verge at racing pace.
2. Drive a few OTHER seeds deep into their stages (the screenshot script
   pins seed 42; a scratch script over seeds 7/13/99/1234 is the pattern)
   and check: do groves read as groves? Are meadows open? Does bedrock
   show in the cuts? Anything floating or drowned?
3. Day is not enough — check dusk and night captures too; the flora is
   Lambert-lit and must sit in the environment's light, never glow.

## Adding things

- **A new tree**: a `VariantDef` in `flora.ts` (build with the helpers,
  base at y = 0, real-world meters), then weights in the communities that
  should carry it. Nothing else changes.
- **A new community**: a row in the biome's `communities` with an id,
  weight, density and small species mix. Check it appears at the grove
  scale by driving seeds.
- **A new biome**: a new `Biome` in `biome.ts` (palette + communities +
  overrides) and a `biomeFor()` rule for when it applies. The terrain and
  placement code already speak biome.

## Skill self-improvement

Record lessons under `.agent/skills/nature/.lessons/` in the
`skill-reflection` format; that skill decides at session end what gets
promoted into this file. Never append lessons here directly.

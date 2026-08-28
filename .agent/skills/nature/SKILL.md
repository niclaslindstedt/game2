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

## The files, one direction of flow

| File                            | Owns                                                                                                                                                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/src/game/biome.ts`         | Biomes AS DATA: the ground palette, the plant communities (weighted species mixes + density + ground cover), the contextual overrides (lakeshore, highland), grove scale                                                                                                               |
| `pwa/src/game/flora-build.ts`   | The primitives and the paint box: the `GeoBuilder` merge helper, every authored colour, and what the seasons do to them                                                                                                                                                                |
| `pwa/src/game/flora-species.ts` | HOW each plant is shaped: the ~40 parametric variants, as recipes over the builder                                                                                                                                                                                                     |
| `pwa/src/game/flora.ts`         | The shape cache, the two shared materials, the ground-cover sway shader, and the two ways a population is instanced                                                                                                                                                                    |
| `pwa/src/game/planting.ts`      | Which species dresses a given patch of ground, which of them read as solid trunks and which as brush, how one engine prop is dressed, and the understory skirt around a mature trunk                                                                                                   |
| `pwa/src/game/wild.ts`          | The open country beyond the road bands: pooled flora and the wild's stone, streamed in cells around the CAR                                                                                                                                                                            |
| `pwa/src/game/terrain.ts`       | The heightfield AND its paint: altitude bands, moss/heath/forest-floor noise patches, slope-revealed bedrock, the tiling detail speckle, the road-apron shelf                                                                                                                          |
| `pwa/src/game/world.ts`         | WHERE the SOFT things stand (ground cover, stumps, shrubs), dressing engine trunks with species, road clearance, boulders' rock meshes, cut-wall outcrop slabs, the rally gates and hay bales                                                                                          |
| `engine/mapgen/props.ts`        | WHERE the SOLID things stand: the region/grove/stand quilt (`REGIONS`, `GROVES`, `regionAt`, `groveAt`) and every collidable trunk (`treesNear`) and prop (`obstaclesNear`) — the car crashes into these, so placement is the engine's (the `collision` skill owns the contact itself) |
| `engine/mapgen/terrain.ts`      | The heightfield, water and streams the props stand on; it builds the prop field and re-exports it                                                                                                                                                                                      |

Biome → flora ids are strings on purpose: `biome.ts` imports nothing from
the flora modules, and `buildFlora` throws on an unknown id, so a typo in a
new mix fails loudly on the first stage build. `biome.ts` also checks at
import that every engine grove and region has a row, so a quilt id with no
community cannot silently fall back to the wrong wood. Shared value noise lives in
`pwa/src/lib/noise.ts` — terrain shaping and grove placement must keep
drawing from the same helpers or their patches stop lining up.

## The biome model

- **A biome is data, not code.** Ground palette + communities + regions +
  overrides. A new biome is a new `Biome` row and a `biomeFor()` decision
  — no new systems. Today `biomeFor()` always returns `TAIGA`.
- **The landscape is quilted at THREE scales**, all placed in the engine
  because the trunks are solid: a SUB-REGION (~900 m) says what kind of
  country this is and re-weights the groves under it; a GROVE (~150 m)
  picks the community; a STAND noise (~42 m) clumps the trees INSIDE one
  grove into closed thickets and the clearings between them. The stand
  noise is what stops a forest reading as evenly sprinkled, and its mean is
  exactly 1, so it redistributes the forest without thinning it.
- **Trees come in COMMUNITIES, not confetti.** A real forest is groves: a
  spruce wood, a birch grove, a pine heath, an open meadow. The quilt
  lives in the ENGINE (`terrain.groveAt` over the `GROVES` weight/density
  rows — wobbled grove-scale cells, so borders meander), because the
  trunks it places are solid; the biome's community rows in `biome.ts`
  match those ids and supply the species mixes. Each engine trunk carries
  a `roll` + `grove` and `world.ts` dresses it (`treePlacement`) from that
  community's mix — filtered to species with real trunks (`solidMix`); the
  soft rest (stumps, junipers, shrubs, `SOFT_FLORA`) stays app-placed and
  drive-over. You should see one or two species per stretch, all ~26 only
  across a whole stage.
- **`density` is what makes meadows.** A grove row with near-zero density
  is open land — its rare trees read as lone rowans, its community's
  `groundCover` multiplier fills it with swaying tall grass instead.
  Forest density itself is `TREE_CELL`/`TREE_DENSITY` in
  `engine/mapgen/terrain.ts` (~1 trunk per 500 m² in a closed forest —
  gaps a car threads, walls it cannot ignore).
- **Context beats community**, and it lives in one place (`planting.ts`'s
  `mixAt`). Within ~4 m of the water table the lakeshore mix wins (willow,
  birch); inside `RIPARIAN_BAND` of a stream the riparian mix wins; above
  26 m terrain altitude the highland mix wins (squat spruce, juniper,
  snags). Those bands mirror the terrain's own painting, so flora and
  ground always tell the same story. Keep the water-side mixes CONTEXTUAL
  rather than making them regions — a noise field will happily put a
  lakeside where there is no lake.

## The taiga roster (~40 variants)

Canopy conifers `spruceTall/Old/Young/Squat/Dark`, `pineTall/Crooked/Young`,
`firSlim/Dense`, larches `larch/larchOld`; broadleaves
`birch/birchPair/birchYoung`, `aspen`, `oak`, `maple`, `rowan`; a middle
storey of `spruceSapling`, `pineSapling` and the bog's stunted `bogPine`;
shrubs `willowShrub/juniper/bogShrub/berryBush`; dead and cut wood
`deadSnag/brokenTrunk/leaningSnag/stump/fallenLog/rootLog/driftwood/fallenBranch`
and the logging block's `logPile`; ground cover
`tallGrass/fern/largeFern/heathShrub/mossPatch` and the wet ground's
`reeds/sedgeTuft/cottonGrass` (the grass, fern, reed and sedge families are
the two-sided, wind-swayed set).

## The seasons

`RaceEnv.season` is `spring | summer | autumn` — the taiga has three,
because the boreal forest under snow is the ARCTIC biome, not a fourth
season of this one. A season is a colour MAP applied inside
`GeoBuilder.add`, so a species recipe names the summer colour it means and
nothing in the roster knows what month it is; a colour absent from the
table does not change, which is why every conifer, bark and dead-wood tone
holds still while the broadleaves, the larch, the ground and the bogs move.
That stillness is the point — it is what keeps the silhouette while the
colour turns. The ground palette gets a per-season override, and the LIGHT
is derived from the sun's actual noon elevation at 62°N rather than
art-directed (`environment.ts`).

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

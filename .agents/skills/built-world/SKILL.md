---
name: built-world
description: "Use when working on what PEOPLE put beside the road — homesteads and farms, the livestock in a paddock, towns and their buildings, the crowd's car park, wind and solar farms, the transmission line and its towers, the railway and its train, the public traffic and its signs, tunnels, kerbs and markers, blockades on abandoned arms, split boards, and parked cars. Owns the engine's placers (R37, R39, R41-R45) and the renderer's builders for each, the manager-outside-the-chunks pattern a thing seen from far away needs, and the `make items` turntable that is the only way to judge a prop that is six pixels at racing speed. Not the road itself (`mapgen-improvement`) and not what grows beside it (`nature`)."
---

# The built world: what people put beside the road

The stage runs through a country somebody lives in. This skill owns every
man-made thing standing off the racing line — the farm the road passes, the
village on the borrowed tarmac, the pylons marching over the ridge, the train
that may be at the crossing when you get there.

Everything here is placed in **two halves**, and keeping them apart is the
whole design: the ENGINE decides WHERE (deterministically, from the seed, so
the collision is the same in a headless sim as on screen) and the RENDERER
decides what it LOOKS like. A placer never builds geometry; a builder never
picks a position.

**Read this skill's lessons first** — `node scripts/skill-lessons.mjs
built-world --list`, then the ones the task touches. Load **`skill-reflection`**
at both ends and **`write-code`** beside this one for any code change. Load
**`mapgen-improvement`** when the placement RULE is what is changing (it owns
the search, the R-rules and `make analyze`), **`nature`** for the grown half of
the same landscape, and **`collision`** for what hitting one of these costs.

## Where each thing lives

| Thing | Placed by (engine) | Drawn by (`pwa/src/game/`) |
| --- | --- | --- |
| A house off the stage, its drive and yard | `mapgen/homesteads.ts` (R37) | `homestead.ts`, the building itself `house.ts` (from the engine's `HousePlan`) |
| What makes a homestead a FARM | `mapgen/farms.ts` (R37) — barn, paddock, field, gear | `barn.ts`, `paddock.ts`, `farm-gear.ts` |
| The cows and sheep grazing it | the paddock is the engine's | `livestock.ts` — where they MAY be is the engine's, where each STANDS is the renderer's (the crowd's pattern) |
| A town: where it stands, its lots | `mapgen/towns.ts` (R39), on borrowed tarmac or an abandoned arm | `town.ts` |
| What a BUILDING is — kind, plan, walls | `mapgen/buildings.ts` — the plans both placers draw, and the footprint-to-solids walk | `building.ts` (flats, grocery, post, workshop) over the house's primitives |
| Where the crowd PARKED, the lane in, the trails | `mapgen/carparks.ts` (R42) over `carpark-map.ts`, on the terrain field from the stands | `carpark.ts` |
| A car that only STANDS there | — | `parked-car.ts` — a dozen boxes from one roll; NEVER the catalog's builder, which is a thousand times the geometry |
| A wind farm or a solar farm | `mapgen/energy.ts` (R43); numbers `STAGE_RULES.energy`, the country's say `BiomeRules.energy` | `wind-farm.ts` (reads `state.wind`), `solar-farm.ts` (one instanced mesh of tables per farm) |
| The transmission line and its towers | `mapgen/powerline.ts` (R45) surveys the line, spots the towers; numbers `STAGE_RULES.powerline` | `powerline.ts` |
| The railway, the crossing's ramp, the timetable | `mapgen/railway.ts` (R41) over `highway.ts`'s `rail` line and `crossing.ts`'s solve; numbers `STAGE_RULES.rail` | `train.ts` (the consist, posed off `trainCars`) + `railway.ts` (ballast, sleepers, rails, deck, boards) |
| Where the TRAFFIC drives, and its speed limit signs | `mapgen/traffic.ts` (R44) plans routes over the arms and car-park lanes; numbers `STAGE_RULES.traffic` | `traffic.ts` (posed off `state.traffic` every frame) |
| How a MOTORIST drives, and what hitting one costs | `game/traffic.ts` — the fleet, stepped inside `step()`; the twenty vehicles and the knobs in `game/defs/traffic.ts` | `traffic-fleet.ts` — one merged mesh per body kind |
| A tunnel | R47 in `mapgen/search.ts` decides where one is bored | `tunnel.ts` + `tunnel-lid.ts` (the mountain drawn back over the engine's trench, off `field.lidAt`) |
| The marking beside the road | `mapgen/kerbs.ts` places every marker (one of them is solid) | `kerbs.ts` |
| Where an abandoned branch is shut, and with what | `placeBlock` in `mapgen/spurs.ts` | `blockade.ts` |
| A split board on the stage | `STAGE_RULES.checkpoint` + the placement in `mapgen/compile.ts` (R28) | `split-board.ts` — a pair of flags at the line, planted in the cone field so a clipped one goes over |

## The two patterns everything here follows

- **A thing seen from far outside its chunk gets its own manager.** The road
  is streamed in chunks and a prop parented to a chunk vanishes when that
  chunk does. A turbine, a pylon, a train or a traffic vehicle is visible
  from far beyond the chunk it stands in, so each has a manager of its own
  outside the chunk system (`wind-farm.ts`, `powerline.ts`, `train.ts`,
  `traffic.ts`). Anything tall or moving belongs in that list.
- **Instance the repetition.** A solar farm is one instanced mesh of tables
  per farm; a fleet is one merged mesh per body kind. These are things the
  player drives past at speed — geometry spent on them is geometry taken from
  the road. `make profile` before and after anything that adds a manager or a
  material.

## The loop

```sh
make items-list                      # every item the sheet knows, by group
make items GROUP=homestead           # …or ITEMS=pylon, TURNTABLE=<seats>
make level LEVEL=1                   # what actually got placed on a stage
make analyze                         # the generator's own score, if a PLACER moved
```

`make items` photographs ONE thing at a time, on a metre grid, from a
turntable. Most of what the world is made of is six pixels at the speed you
pass it, and this is the only place it gets rotated and measured — a prop that
reads as a grey lump at 120 km/h is judged here, not in a screenshot.

A change to a PLACER is a generator change: run `make analyze` before and
after, and remember that a placer that refuses is part of the search, not a
failure. A change to a BUILDER is a look change: `make items`, then
`make screenshots` to see it at racing speed.

## Craft rules

- **Nothing here may reach the racing line.** Every placer keeps its clearance
  off the road and out of the water; the road's own dressing is
  `mapgen-improvement`'s.
- **A solid one thing is collided with, a soft one is not.** If the car can
  hit it, the engine has to know where it is — the placement moves into the
  engine, and `collision` owns what the contact does.
- **Determinism.** Placement draws only from the seeded RNG in state. A prop
  positioned from `Math.random`, wall-clock time or a frame counter breaks the
  sim, the tape and every fixture that asserts a stage.
- **The player never inspects these; they read them.** Detail goes into the
  silhouette and the value contrast, not into the panel lines.

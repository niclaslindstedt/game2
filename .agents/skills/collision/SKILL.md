---
name: collision
description: "Use when working on COLLISION or DAMAGE — the car hitting solid things (trees, boulders, fallen trunks), hard landings, body crush and bent polygons, breaking parts off (panels, glass, doors, wheels), the internal systems (engine/suspension/gearbox/steering/brakes) degrading, the wreck, the retirement a dead engine or a second lost wheel ends the run with, the damage calls on the HUD, or the engine smoke. Owns the contact model in engine/game/collision.ts, the solid-trunk field in the terrain, the renderer's deformation module, and the stage-a-crash → LOOK verification loop."
---

# Collision and damage

Cars bend and break — they never teleport. A hit is an impulse (bounce a
little, scrape a lot), a yaw kick (clipped corners spin the car), and CRUSH:
a permanent ledger the renderer bends the body's real polygons from, the
trigger that tears parts off, the damage that reaches the machinery, and
the wear that eventually wrecks the chassis. This skill owns that whole
chain, engine to pixels.

Load **`write-code`** beside this one (always), **`engine-system`** when the
change grows a new mechanic, **`nature`** when the work touches where trees
STAND, and **`test-scenario`** for staging exact contacts.

## The map — who owns what

| Piece                                                                                                                              | File                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Contact model: OBB-vs-circle, impulse, yaw kick, crush, parts, systems, hard landings                                              | `engine/game/collision.ts` (`collideCar`, `landingDamage`)                       |
| What the SOLID is made of: mass, rooting, snapping strength, and each kind's shape                                                 | `engine/mapgen/solids.ts` (`standSolid`, `solidShape`)                           |
| Whether it gives way, and the roll a low one trips into the body                                                                   | `engine/game/collision.ts` (`meetSolid`, `tripRoll`) + `TUNING.collision.solids` |
| The piece a felled solid leaves behind, flying                                                                                     | `pwa/src/game/breakage.ts`, over `tumble.ts`; retired via `world.fell`           |
| The GROUND as a solid: a face too steep to climb, met at the bumper                                                                | `engine/game/collision.ts` (`collideSlope`) + `car.ts` (`hitFace`)               |
| The springs: heave, dive/squat, the landing bounce — the car's WEIGHT                                                              | `engine/game/car.ts` (`stepSuspension`), `TUNING.suspension`                     |
| Every number: box size, restitution, crush rates, part bolts, system transfer + effects, the springs                               | `engine/game/defs/tuning.ts` → `TUNING.collision`, `TUNING.suspension`           |
| The ledger: `CarState.damage` (zones, belly, wear, systems, broken, version), impact/partBreak/crash events                        | `engine/game/state.ts`                                                           |
| What a damaged car DRIVES like: the whole ledger as multipliers (power, misfire, rack, pull, grip, brake, drag, gears)             | `engine/game/damage.ts` — reads `car.damage`, never writes; spent in `car.ts`    |
| When collision runs, the wedge check that is the only way home, deep-water crash                                                   | `engine/game/step.ts`                                                            |
| Solid trunks + grove quilt (`treesNear`); every other solid (`obstaclesNear`) + the `SOLID_PROP_HEIGHT` bar                        | `engine/mapgen/terrain.ts`                                                       |
| Bending the polygons, scuff darkening, debris, the flat/bent/missing wheels and the crooked `pose`, shattered glass, the door hole | `pwa/src/game/car-damage.ts` (+ `car-body.ts` `breakables`/`panes`/`doors`)      |
| The door skins, and where each one is                                                                                              | `doorSkins` in `pwa/src/game/car/trim.ts`                                        |
| Which slice of the glass buffer is which pane, and the grime film over it                                                          | `buildGreenhouse` (`GlassPanes`) + `CarWipers.shatter` in `car/wipers.ts`        |
| Engine smoke off the bonnet, the glass burst, the wheel's throw                                                                    | `pwa/src/game/renderer.ts` (`ENGINE_SMOKE`, `GLASS_AT`)                          |
| The retirement card                                                                                                                | `pwa/src/game/hud-finish.tsx` (`retired`) + `App.tsx`'s `retiredRef`             |
| Drawing the springs: the sprung-mass group the heave and dive move                                                                 | `pwa/src/game/car-body.ts` (`chassis`) + `car-mesh.ts`                           |
| Drawing the engine's trunks as trees (species stays app-side)                                                                      | `pwa/src/game/world.ts` (`treePlacement`, `solidMix`)                            |
| Drawing the engine's stone (boulders, rocks, outcrops) where its circles are                                                       | `pwa/src/game/world.ts` (`buildWild`, `stoneMatrix`)                             |
| What the HUD SAYS about damage (there is no gauge): the system calls, and the wheel calls with the screen's left/right flip        | `pwa/src/game/hud.tsx` (`damageCall`, `wheelCall`) + `App.tsx`'s event loop      |
| Tests                                                                                                                              | `tests/collision_test.ts` (+ the boulder scenario in `explore_test.ts`)          |

## The invariants — each one is load-bearing

- **The engine owns every number and every decision.** The renderer bends
  and tumbles what `car.damage` says, nothing more. New damage behavior
  starts in `collision.ts`/`tuning.ts`, never in `car-damage.ts`.
- **A solid is never infinitely heavy unless its mass says so.** Mass,
  rooting and snapping strength come out of `standSolid` — from the shape
  the renderer draws and the material it is drawn in — and the contact
  weighs the car against them. Never special-case a KIND in
  `collision.ts`: if a rock should shrug the car off, that is a number in
  `solids.ts`, and it moves what the renderer draws with it.
- **A felled solid leaves BOTH fields.** The engine's field (via the
  `fell` callback) and the renderer's own instance (`world.fell`) — the
  wild streams cells in for as long as the run lasts, and a field that
  still places a felled trunk stands it back up the moment the player
  drives away and comes back.
- **Anything solid is placed engine-side.** The renderer draws colliders
  where the engine put them (`treesNear`/`obstaclesNear`) — never the
  reverse, and never a drawn solid without a collider or a collider
  without a drawing. Species/looks stay app-side (the tree's `roll` +
  `grove` pick them); the only things the renderer may PLACE are the ones
  that stand under `SOLID_PROP_HEIGHT` (0.45 m — the middle of the hood):
  brush (`SOFT_FLORA` in world.ts), ground cover, and stone litter capped
  by `PEBBLE_MAX`. Anything taller is an engine prop, drawn where the
  field put it.
- **Zones are ENGINE space; the screen flips once.** Zone 0 is the nose,
  indices grow clockwise in map view. The rendered world MIRRORS the map
  view, so the engine's right-hand wheel is the one the player sees on the
  LEFT: the HUD's `wheelCall` (hud.tsx) and the audio route's impact pan
  each flip once, at the screen, like steering and the wind arrow. Never
  compensate anywhere else — the renderer draws engine coordinates as they
  are.
- **After changing `car.w`, call `updateSlip(car)`** (from state.ts) — the
  grounded lateral redirect rebuilds velocity from `car.slip` and silently
  erases any impulse applied against a stale angle.
- **Crush is monotonic and capped** (`zoneMax`); `damage.version` bumps on
  every change — that is the renderer's only re-bend trigger. Wear is the
  only thing a respawn resets (`repairTo`, and only on a wrecked chassis);
  dents, parts and systems persist for the run.
- **A contact never ends the excursion — the LEDGER does.** `collideCar`
  bends the car and returns nothing; wear reaching 1 is a wreck that keeps
  driving. The only automatic way home is `TUNING.offTrack.stuck` — throttle
  held without covering ground — so any change that stops a hit car from
  moving at all costs a respawn two seconds later, EXCEPT for the two
  states `beyondDriving` (damage.ts) names: an engine at 1 and two wheels
  off. Those are the run over: step.ts stands the wedge rescue and the reset
  aside for them, drags the car to rest (`chassis.deadEngineBrake`,
  `hubBrake`) and retires the phase where it stops (`retire` event). Never
  add a third way to `beyondDriving` without the same coast-to-rest, or the
  stuck rule respawns a car that should be parked.
- **Nothing in the ledger is decoration.** `damage.ts` is the one place that
  turns `car.damage` into handling, and every field in the ledger has to come
  out of it somewhere — wear, both kinds of crush, all four systems, every
  part that can come off. A field in `CarDamage` that `damageEffects` does not
  read is a gauge the player watches move while the car drives exactly the
  same, which is the bug this module exists to answer.
- **Damage degrades right up to the two things that end the run.** Every
  system effect short of a dead engine and a second lost wheel is sized so
  a broken system cripples the car's feel without parking it — bots must
  still finish (`make sim`, whose `fin` column is where a retirement shows
  up). `engineFromNose` is set against one bar: a square hit at 100 km/h
  is the engine gone, at 50 a third of it — move `crushPerSpeed` and that
  number has to move with it.
- **A wheel is a ledger, not a bolt.** Panels and glass come off a ZONE's
  crush (`PART_BOLTS`); a wheel comes off its own `damage.wheels[i]`
  reaching 1 (`dealWheel`), fed from the corner, the flank and the side it
  lands on. Left/right and FL/FR/RL/RR are the ENGINE's frame; the HUD's
  `wheelCall` is where the screen flips them, once.
- **The collision box must CONTAIN the larger drawn shell.** One box serves
  both cars; size it off the longest/widest station in
  `pwa/src/game/car-styles.ts`, not the average. A body poking out of its
  collider reads as the whole contact model being broken.
- **The springs are a readout, never an input.** `car.ride` and
  `car.pitchLoad` are written by `stepSuspension` and drawn by the renderer;
  nothing in the handling model reads them back. The renderer moves the
  `chassis` group only — the wheels and the shadow stay on the ground.
- **Synthetic terrain overrides must stub `treesNear` too** (see
  `flatWild` in explore_test.ts), or the scenario collides with the real
  forest invisibly.

## Workflow

1. **Stage it.** Reproduce the contact exactly: a synthetic track
   (`compileTrack`) plus an injected obstacle via a `terrain` override
   (`obstaclesNear`/`treesNear` returning your solid), or `collideCar`
   called directly on a crafted `CarState` — both patterns live in
   `tests/collision_test.ts`.
2. **Tune defs first.** If the change is feel (bounces too hard, parts too
   sticky, wreck too soon), it is a `TUNING.collision` number with units in
   the comment — not a model edit.
3. **Assert the rule you claim** in `tests/collision_test.ts`: head-on,
   glancing (needs real closing speed — a pure side contact with no
   sideways velocity closes at 0 and does nothing), part-breaks-once,
   scuff floor, the wreck that stays put, system effects.
4. **Measure.** `make sim` before and after — watch the `hit` column and
   respawns; bots must keep finishing at pace. A respawn in the table now
   means a bot wedged itself hard enough to sit there for two seconds, so
   any movement off zero is a real regression.
5. **LOOK.** Build, then drive a crash on purpose (playtest-style script:
   full throttle off the road into the treeline, screenshot over several
   seconds) — the crumple must read on the 3D body, the debris must fly,
   the HUD instrument must light where the hit landed.
6. Docs: the model is described in `docs/driving.md` ("Collision and
   damage"); the sim columns in `docs/simulation.md`.

## Tuning intuition

- `crushPerSpeed × (closing − scuffSpeed)` is the whole damage economy:
  a 30 m/s head-on ≈ 0.3 m of fold ≈ `wearPerCrush`×0.3 of the car's life.
  Move `wearPerCrush` to change how many big hits a run survives; move
  `partAt` bolts to change how gladly parts fly.
- `restitution` low + `tangentKeep` high is what makes forest driving
  playable: brushes are scrapes, only square hits stop you.
- `yawKick` sells the crash — too low reads as hitting glue, too high
  turns every brush into a spin.
- `hardLandSpeed` sits just over a designed ramp jump's touchdown, so
  marks come from cliff plunges and botched flights, not from every lip.
- The springs are `freq` × `damping`: the frequency is how long a landing
  takes to settle, the damping ratio is how many times it comes back.
  Under ~0.3 reads as weight; at 1 the car reads as a cushion. `heaveMax`
  is a LOOK budget, not a physics number — past ~0.2 m the sills reach the
  ground on a body whose floor sits at 0.33 m.
- `climbLimit`/`wallSlope` decide where a hill stops being drivable and
  starts being a crash. Widen the gap for a more forgiving landscape;
  a narrow one turns every bank into a wall.

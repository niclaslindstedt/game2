---
name: collision
description: "Use when working on COLLISION or DAMAGE — the car hitting solid things (trees, boulders, fallen trunks), hard landings, body crush and bent polygons, breaking parts off, the internal systems (engine/suspension/gearbox/steering) degrading, the wreck, or the HUD damage instrument. Owns the contact model in engine/game/collision.ts, the solid-trunk field in the terrain, the renderer's deformation module, and the stage-a-crash → LOOK verification loop."
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

| Piece                                                                                                       | File                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Contact model: OBB-vs-circle, impulse, yaw kick, crush, parts, systems, hard landings                       | `engine/game/collision.ts` (`collideCar`, `landingDamage`)              |
| The GROUND as a solid: a face too steep to climb, met at the bumper                                         | `engine/game/collision.ts` (`collideSlope`) + `car.ts` (`hitFace`)      |
| The springs: heave, dive/squat, the landing bounce — the car's WEIGHT                                       | `engine/game/car.ts` (`stepSuspension`), `TUNING.suspension`            |
| Every number: box size, restitution, crush rates, part bolts, system transfer + effects, the springs        | `engine/game/defs/tuning.ts` → `TUNING.collision`, `TUNING.suspension`  |
| The ledger: `CarState.damage` (zones, belly, wear, systems, broken, version), impact/partBreak/crash events | `engine/game/state.ts`                                                  |
| Damaged-handling effects (power, grip, shift cuts, steering, landing tolerance)                             | `engine/game/car.ts` — reads `car.damage.systems`, never writes         |
| When collision runs, the wedge check that is the only way home, deep-water crash                            | `engine/game/step.ts`                                                   |
| Solid trunks + grove quilt (`treesNear`, `groveAt`, `GROVES`); boulders/logs (`obstaclesNear`)              | `engine/mapgen/terrain.ts`                                              |
| Bending the polygons, scuff darkening, debris                                                               | `pwa/src/game/car-damage.ts` (+ `car-body.ts` `breakables`)             |
| Drawing the springs: the sprung-mass group the heave and dive move                                          | `pwa/src/game/car-body.ts` (`chassis`) + `car-mesh.ts`                  |
| Drawing the engine's trunks as trees (species stays app-side)                                               | `pwa/src/game/world.ts` (`treePlacement`, `solidMix`)                   |
| The HUD damage instrument                                                                                   | `pwa/src/game/hud.tsx` (`DamagePanel`) + `App.tsx` snapshot             |
| Tests                                                                                                       | `tests/collision_test.ts` (+ the boulder scenario in `explore_test.ts`) |

## The invariants — each one is load-bearing

- **The engine owns every number and every decision.** The renderer bends
  and tumbles what `car.damage` says, nothing more. New damage behavior
  starts in `collision.ts`/`tuning.ts`, never in `car-damage.ts`.
- **Anything solid is placed engine-side.** The renderer draws colliders
  where the engine put them (`treesNear`/`obstaclesNear`) — never the
  reverse, and never a drawn solid without a collider or a collider
  without a drawing. Species/looks stay app-side (the tree's `roll` +
  `grove` pick them); only SOFT flora (stumps, shrubs, junipers — see
  `SOFT_FLORA` in world.ts) may be app-placed, because it is driven over.
- **Zones are ENGINE space; the screen flips once.** Zone 0 is the nose,
  indices grow clockwise in map view. The rendered world MIRRORS the map
  view, so the HUD snapshot (`damageSnapshot` in App.tsx) flips zones and
  swaps the mirrors — one flip, there, like steering and the wind arrow.
  Never compensate anywhere else.
- **After changing `car.w`, call `updateSlip(car)`** (from state.ts) — the
  grounded lateral redirect rebuilds velocity from `car.slip` and silently
  erases any impulse applied against a stale angle.
- **Crush is monotonic and capped** (`zoneMax`); `damage.version` bumps on
  every change — that is the renderer's only re-bend trigger. Wear is the
  only thing a respawn resets (`repairTo`, and only on a wrecked chassis);
  dents, parts and systems persist for the run.
- **A contact never ends the excursion.** `collideCar` bends the car and
  returns nothing; wear reaching 1 is a wreck that keeps driving. The only
  automatic way home is `TUNING.offTrack.stuck` — throttle held without
  covering ground — so any change that stops a hit car from moving at all
  now costs a respawn two seconds later.
- **Damage degrades, never disables.** Every system effect is sized so a
  broken system cripples the car's feel without parking it — bots must
  still finish (`make sim`).
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

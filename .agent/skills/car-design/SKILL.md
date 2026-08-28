---
name: car-design
description: "Use when designing or changing how a CAR LOOKS — its silhouette, proportions, panels, wheels, spoiler, livery, or colors. Owns the parametric body builder (pwa/src/game/car-body.ts), the per-car specs (car-styles.ts), and the render-compare-iterate loop: generate candidate variants, contact-sheet them with `make cars` from the gaming perspective and turntable angles, LOOK, pick a winner, refine, then verify in the real game."
---

# Car design

Cars in this game are not modeled in a DCC tool and not hand-placed boxes:
they are **generated**. `pwa/src/game/car-body.ts` lofts a low-poly body from
a `CarBodySpec` — silhouette stations, cabin, flares, wheels, spoiler,
colors — and bakes a fixed fake sun into vertex colors so the fullbright
arcade look still has panel definition. Designing a car means editing a spec
and LOOKING, never guessing from numbers.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs car-design --list`, then what the task
touches. Load `skill-reflection` at both ends, and `write-code` beside this
skill for any code change.

## Where everything lives

| Piece                            | Role                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pwa/src/game/car-body.ts`       | The assembly line: builds the parts, packages the meshes, names the breakables                          |
| `pwa/src/game/car/spec.ts`       | The whole `CarBodySpec` vocabulary. Pure types — a new part starts with an optional field here          |
| `pwa/src/game/car/builder.ts`    | `MeshBuilder` (baked-sun triangles), `bakeShading`, the bilinear-patch helpers                          |
| `pwa/src/game/car/shell.ts`      | The chassis loft: stations, the ring, wheel-arch openings, shut-line grooves, `flankX`, `sideBand`      |
| `pwa/src/game/car/greenhouse.ts` | Windows cut out of a solid cabin; gutters, wipers                                                       |
| `pwa/src/game/car/fascia.ts`     | Nose and tail: grille, lamps, bumpers, air dam, plate, exhaust, the detachable bonnet and boot lid      |
| `pwa/src/game/car/trim.ts`       | Arch extensions, mirrors, handles, mud flaps, livery bands, door numbers, spoilers                      |
| `pwa/src/game/car/wheels.ts`     | The tire and three rim styles                                                                           |
| `pwa/src/game/car-styles.ts`     | The specs — one `CarBodySpec` per catalog id. **Pure data, no three.js import** (Node tooling loads it) |
| `pwa/src/game/car-livery.ts`     | The FIELD's paint: palettes × patterns, and `applyLivery`, which repaints any spec. Pure data too       |
| `pwa/src/game/car-livery.ts`     | The FIELD's paint: palettes x patterns, and `applyLivery` — a repaint of any spec. Pure data too        |
| `pwa/src/game/car-dirt.ts`       | The grime a stage puts on it. Its painter is what the preview's `dirty` column calls                    |
| `tests/car_geometry_test.ts`     | Holds every spec inside `TUNING.collision`'s box and inside real-car dimensions                         |
| `pwa/src/game/car-mesh.ts`       | Scene wrapper: attitude (drift roll / air pitch), wheel spin + steer, blob shadow                       |
| `pwa/src/tools/car-preview.ts`   | The harness page the preview tool drives (contact-sheet renderer)                                       |
| `scripts/car-preview.mjs`        | The tool: `make cars` / `make liveries`; `--variants`, `--cars`, `--liveries`, `--out`, `--skip-build`  |
| `engine/game/defs/cars.ts`       | NOT this skill's file — handling numbers and the catalog. Only `color`/`accent` feed the default look   |

## The loop: generate → render → LOOK → iterate

1. **Render the current state**: `make cars` (Chromium required; in web
   sessions `CHROMIUM_PATH=/opt/pw-browsers/chromium`). The sheet lands in
   `previews/cars.png`: per car one row — chase-cam **game** view first
   (straight + mid-drift, the view that actually matters), then front 3/4,
   side, rear 3/4, top.
2. **Generate candidates, several at a time.** Write a scratch script that
   imports `CAR_BODIES`, clones a spec (`JSON.parse(JSON.stringify(...))`),
   patches ONE axis per variant (silhouette, cabin, glass tone, spoiler…),
   and writes `{ cars: [{ id, spec }] }` to a JSON file. Then:

   ```sh
   node scripts/car-preview.mjs --variants candidates.json --out candidates
   ```

   Label variant ids by what changed (`cpt-A-boxy`, `cls-C-fastback`) so the
   sheet reads as an A/B/C test.

3. **LOOK — with the Read tool, and zoom.** The full sheet shrinks in
   terminal view; crop cells out (PIL or the harness cell math: 440×310 per
   cell) before judging details like wheel arches or light placement.
4. **Pick the winner, fold it into `car-styles.ts`, re-render.** Spec-only
   iterations can pass `--skip-build` — the harness bundle only needs a
   rebuild when `car-body.ts` or the harness itself changed.
5. **Close in the real game**: `make build` then `make screenshots` (the
   `playtest` skill). The contact sheet judges the sculpture; only the game
   proves the read at speed, in fog, against the world palette.

## Judging a car (what "good" means here)

- **The game view is the verdict.** A car is judged at 7 m behind and 2.5 m
  up, mid-drift, at 30 px tall — silhouette, roof color, and wing must read
  THERE. Turntable views only diagnose.
- **Identity per car, one glance apart**: the small car is short, tall,
  boxy (white roof, lip spoiler); the big car is long, low, rear-set cabin
  with the full wing. Any new car needs its own one-glance signature.
- **Match the world's art direction**: fullbright, faceted, chunky. No
  smooth curves — the loft's hard stations ARE the style. Keep glass light
  (an arcade near-sky tone, not black): a dark greenhouse reads as a hole.
- **Wheels sell rally**: big, proud of the body (tire face outside the
  rocker), light hubs. If wheels vanish under the body, raise `floorY` or
  push `trackHalf` out rather than shrinking the body.
- **Physical scale is fixed**: cars stay roughly real-sized (3.6–4.6 m long,
  ~1.7–1.8 m wide, roof ≤ ~1.4 m) — the camera, dust, and road width are
  tuned for it. Changing a car's LENGTH does not change physics (the engine
  is a point-mass), but ONE collision box serves the whole catalog and has
  to contain every shell: `tests/car_geometry_test.ts` fails a spec that
  outgrows `TUNING.collision`, and it measures length to the BUMPER face,
  which stands proud of the profile's end station.

## Spec-editing craft

- The z axis points out the NOSE; stations run nose → tail, and the loft
  interpolates linearly between them — add a station only where the
  silhouette bends.
- `beltY`/`floorY` are spec-wide; per-station `topY`/`half` do the shaping.
  The rocker/shoulder tuck ratios live in `car-body.ts` (`ROCKER`,
  `SHOULDER`) and apply to every car.
- Flares are a triangular bulge over each axle (`flare.extra` ≈ 0.05–0.07 m
  reads Group-A wide-body without silliness).
- Colors are plain hex numbers so specs stay JSON-serializable — that is
  what lets `--variants` bypass the TypeScript build entirely.
- New body part (light pods, snorkel, roof scoop…) → an optional field in
  `car/spec.ts` and a builder in whichever `car/` module owns that end of
  the car, defaulting OFF, so every existing spec keeps rendering
  unchanged.
- **Anything laid ON the flank** — a stripe, a rubbing strip, a door number
  — goes through `sideBand`/`flankX` in `car/shell.ts` rather than a hand
  placed quad, so it hugs the fenders and rides or clips against the wheel
  arches instead of hanging in the opening.
- A `SideBand` carries a `role`: `trim` is hardware that happens to be a
  band (a rubbing strip, a sill skirt) and survives a repaint; anything
  else is paint and a repaint replaces it. Tag a new structural band, or
  `applyLivery` will strip it off the field's cars.

## Painting the field

A livery is a palette (`paint`/`accent`/`detail`/`hub`) plus a PATTERN, and
`applyLivery(spec, livery)` composes the pattern out of the same vocabulary
a hand-authored spec uses — `sideBands`, `stripes`, `colors.lower`,
`raceNumber`, `roofPaint`. So a new pattern is a case in `flankBands`, not
new geometry, as long as the shape it wants exists: `wave` sweeps a band on
a sine, `taper` pinches it toward the tail, `dashes` breaks it into blocks
(a comb of vertical bars is one tall dashed band), and `colors.lower` cuts
a belt-line two-tone into the loft itself.

Two traps, both of which look like rendering bugs:

- **A pattern is authored against the body it lands on**, never in absolute
  metres — the same numbers have to work on a short upright hatch and a
  long low sedan. Everything comes off `metricsOf`.
- **`overArch: "ride"` shares one floor.** Two bands riding the same arch
  are pushed to the same height and z-fight into a stipple. Either clip
  them, or put them on a `wave` whose crests clear the openings (1.5 cycles
  over the length puts a crest above each axle) — which is also the shape
  the liveries with a set of lines down the flank actually have.

Judge it with `make liveries` (`CAR=classic`, `COUNT=12`), and judge it in
the GAME column first: a field is a success when nine cars read as nine
teams at 30 px, which is colour and roof before it is ever pattern.

## Ship checklist

- [ ] Winner folded into `car-styles.ts` (specs stay pure data), or the
      pattern into `car-livery.ts`
- [ ] `make cars` sheet checked — including the `dirty` column — AND
      `make screenshots` in-game check
- [ ] `npx vitest run tests/car_geometry_test.ts` (the collision box)
- [ ] `npx tsc --noEmit -p pwa/tsconfig.json` + eslint on touched files
- [ ] A changeset fragment (a car's look is player-visible — `changelog` skill)
- [ ] docs/architecture.md still describes the car pipeline truthfully

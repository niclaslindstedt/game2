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

| Piece                            | Role                                                                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/src/game/car-body.ts`       | The assembly line: builds the parts, packages the meshes, names the breakables                                                                                                                                                                 |
| `pwa/src/game/car/spec.ts`       | The whole `CarBodySpec` vocabulary. Pure types — a new part starts with an optional field here                                                                                                                                                 |
| `pwa/src/game/car/builder.ts`    | `MeshBuilder` (baked-sun triangles), `bakeShading`, the bilinear-patch helpers                                                                                                                                                                 |
| `pwa/src/game/car/shell.ts`      | The chassis loft: stations, the ring, wheel-arch openings, shut-line grooves, `flankX`, `sideBand`                                                                                                                                             |
| `pwa/src/game/car/greenhouse.ts` | Windows cut out of a solid cabin; gutters; the two screens as glass (`screenPanes`)                                                                                                                                                            |
| `pwa/src/game/car/wipers.ts`     | The screens' grime film and the blades that sweep it — arms, park and sweep angles, how fast the glass soils                                                                                                                                   |
| `pwa/src/game/car/crew.ts`       | The people, built parametrically: torso, head, helmet styles, hair, face, the wheel hands and the road book                                                                                                                                    |
| `pwa/src/game/car-crew.ts`       | The sixteen characters and their gear colours, plus who drives for which crew. **Pure data, no three.js**                                                                                                                                      |
| `pwa/src/game/car/fascia.ts`     | Nose and tail: grille, lamps, bumpers, air dam, plate, exhaust, the detachable bonnet and boot lid                                                                                                                                             |
| `pwa/src/game/car/engine-bay.ts` | What is under that bonnet once an impact takes it off: the well cut into the deck, and the engine standing in it                                                                                                                               |
| `pwa/src/game/car/trim.ts`       | Arch extensions, mirrors, handles, mud flaps, livery bands, door numbers, spoilers                                                                                                                                                             |
| `pwa/src/game/car/wheels.ts`     | The tire and four rim styles (multi-spoke, steel, split, cross-spoke lattice)                                                                                                                                                                  |
| `pwa/src/game/car-styles.ts`     | The specs — one `CarBodySpec` per catalog id. **Pure data, no three.js import** (Node tooling loads it)                                                                                                                                        |
| `pwa/src/game/car-livery.ts`     | The FIELD's paint: palettes × patterns, and `applyLivery`, which repaints any spec. Pure data too                                                                                                                                              |
| `pwa/src/game/car-livery.ts`     | The FIELD's paint: palettes x patterns, and `applyLivery` — a repaint of any spec. Pure data too                                                                                                                                               |
| `pwa/src/game/car-dirt.ts`       | The grime a stage puts on it. Its painter is what the preview's `dirty` column calls                                                                                                                                                           |
| `tests/car_geometry_test.ts`     | Holds every spec inside `TUNING.collision`'s box and inside real-car dimensions                                                                                                                                                                |
| `pwa/src/game/car-mesh.ts`       | Scene wrapper: attitude (drift roll / air pitch), wheel spin + steer; the shell casts into the sun's shadow map (`car-shadow.ts`)                                                                                                              |
| `pwa/src/tools/car-preview.ts`   | The harness page the preview tool drives (contact-sheet renderer)                                                                                                                                                                              |
| `scripts/car-preview.mjs`        | The tool: `make cars` / `make liveries` / `make field`; `--variants`, `--cars`, `--liveries`, `--field`, `--out`, `--skip-build`; `--views "elevation side"` is an orthographic elevation at a known scale, for measuring against a photograph |
| `scripts/overlay.mjs`            | Lays that elevation over the photograph it was measured from, half transparent, anchored and scaled — the `car-creation` skill owns the loop                                                                                                   |
| `scripts/item-preview.mjs`       | The OTHER tool: `make items ITEMS=car,interior,engine-bay,wheel` — one part at a time, fitted and measured, plus a driver's seat                                                                                                               |
| `engine/game/defs/cars.ts`       | NOT this skill's file — handling numbers and the catalog. Only `color`/`accent` feed the default look                                                                                                                                          |

## The loop: generate → render → LOOK → iterate

1. **Render the current state**: `make cars` (Chromium required; in web
   sessions `CHROMIUM_PATH=/opt/pw-browsers/chromium`). The sheet lands in
   `previews/cars.png`: per car one row — chase-cam **game** view first
   (straight + mid-drift, the view that actually matters), then front 3/4,
   side, rear 3/4, top.
   **For a PART rather than a whole car**, `make items ITEMS=interior` (or
   `car`, `engine-bay`, `wheel`) frames it on its own, on a metre grid, with a
   seat behind the wheel — the cabin is the one thing `make cars` cannot
   review, because at chase-cam range it is behind a tinted pane six metres
   away, and the engine bay is the other, because `make cars` never takes the
   bonnet off.
2. **Generate candidates, several at a time.** Write a scratch script that
   imports `CAR_BODIES`, clones a spec (`JSON.parse(JSON.stringify(...))`),
   patches ONE axis per variant (silhouette, cabin, glass tone, spoiler…),
   and writes `{ cars: [{ id, spec }] }` to a JSON file. Then:

   ```sh
   node scripts/car-preview.mjs --variants candidates.json --out candidates
   ```

   Label variant ids by what changed (`cpt-A-boxy`, `cls-C-fastback`) so the
   sheet reads as an A/B/C test.

3. **LOOK — with the Read tool, and zoom.** A sheet of more than three or
   four rows shrinks past the point of judging anything. **Re-render the
   subset** rather than cropping the big sheet: build a `--variants` file
   holding just the cars in question and render that. Cropping is the trap
   it looks like the shortcut for — an image viewer handed a 3000×4300 PNG
   scales it to fit, so a "crop of the top half" silently comes back as the
   whole sheet shrunk, and it is not obvious that it did. (Cells are 440×310
   if you do need the geometry, and PIL is not installed in a web session.)
4. **Pick the winner, fold it into `car-styles.ts`, re-render.** Spec-only
   iterations can pass `--skip-build` — the harness bundle only needs a
   rebuild when `car-body.ts` or the harness itself changed.
   **A car measured off a reference is PROVED against it, not eyeballed:**
   `--views "side elevation,front elevation,rear elevation"` renders
   orthographic elevations with the ground off and writes
   `previews/<out>.marks.json` — the axles, the tyres' contact corners and
   the lamp clusters' outer edges, in sheet pixels. A scratch canvas page
   (playwright-core, in the scratchpad) keys the sky colour out of the
   cell and draws it over the photo at half opacity, registered by a
   similarity transform on two marks — the hubs on a side view, the lamp
   edges on an end view — then rules the result with the same grid the
   photo was measured on. Offsets read in centimetres; a car scaled in
   length but not in height shows itself in one look.
5. **Close in the real game**: `make build` then `make screenshots` (the
   `playtest` skill). The contact sheet judges the sculpture; only the game
   proves the read at speed, in fog, against the world palette.

## Judging a car (what "good" means here)

- **The game view is the verdict.** A car is judged at 7 m behind and 2.5 m
  up, mid-drift, at 30 px tall — silhouette, roof color, and wing must read
  THERE. Turntable views only diagnose.
- **Identity per car, one glance apart**: the small car is short, tall,
  boxy (white over blue, roof blade); the big car is long, low, a fastback
  under a whale tail on a red roof; the coupe is red on box flares. Any new
  car needs its own one-glance signature.
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

## The people in the car

Every cabin has two of them, and they come from `car-crew.ts`: sixteen
characters — the player, the campaign's fourteen crews, and a privateer for
any slot the campaign never named. A character is a set of MULTIPLIERS on a
standard adult sat in a bucket seat (stature, shoulders, girth, head, neck,
lean), what is on the head (`full` lid / `open` lid / flat `cap` / `bare`), a
hairstyle, optional face hair, and five colours: suit, trim, helmet, skin,
hair. The first three are the crew's GEAR and are the signature — authored
beside the paint the car wears rather than copied from it.

What to hold on to when adding or retuning one:

- **The cabin is a 300 mm tray and a helmet is 290 mm across.** There is no
  room to be tall in, so height is nearly free of effect and WIDTH is not:
  shoulders, girth and head size are what separate two people through a
  tinted pane. Author across, not up.
- **The roof is enforced, not authored around.** `proportions` clamps every
  head under the headliner, and `buildHair` squashes tall hair into whatever
  room is left — the face stays at window height and the bouffant flattens.
  `tests/car_crew_test.ts` holds every character against every catalog body,
  which is the only way to catch a head through a coupe's roof from a sheet
  rendered on the hatch.
- **A `full` lid hides everything.** Hair and face hair are not drawn under
  one, so the characters carrying the big hair wear an open lid, a cap or
  nothing. Authoring a moustache under a full-face helmet is authoring
  nothing.
- **The map reader is one model for the whole field.** They wear the
  DRIVER's colours and hold the road book. A co-driver with a silhouette of
  their own competes with the person whose stage it is.

Judge it with `make crew` (`CREW=blink,diesel` for a subset, `CAR=coupe` for
the tightest cabin in the catalog): both seats close up with the glass off,
the driver through it, the pair through the windscreen, and the game view as
the reminder of how little of any of it survives at range.

Judge it with `make liveries` (`CAR=classic`, `COUNT=12`), and judge it in
the GAME column first: a field is a success when nine cars read as nine
teams at 30 px, which is colour and roof before it is ever pattern.

## The named crews

The campaign's fourteen rivals do not draw from `liveryFor(slot)`: each has
a scheme authored for them in `RIVAL_SCHEMES`, because the colour is the
only thing about a rival the player can learn at a glance and it should say
something true about how that crew DRIVES. Three rules hold it together, and
`tests/car_livery_test.ts` asserts all of them:

- **one palette each** — fourteen crews, fourteen palettes, so no two cars
  in a start list can ever be the same colour;
- **the door roundel is the START NUMBER**, not a number out of a hat;
- **`solid` and `duotone` take an accent roof** — they leave the flank plain,
  so the roof is the only cue left from directly behind, which is where a
  chased car is seen from.

Patterns repeat (there are nine) and that is fine: colour is read first.
`make field` renders the actual start list, each crew in their own car — the
sheet to judge a new crew or a repaint against, because `--liveries` puts
every scheme on ONE body and the field never looks like that.

## Ship checklist

- [ ] Winner folded into `car-styles.ts` (specs stay pure data), or the
      pattern into `car-livery.ts`
- [ ] `make cars` sheet checked — including the `dirty` column — AND
      `make screenshots` in-game check
- [ ] `make crew` sheet checked if the people changed — in the COUPE as well,
      which has the shallowest cabin in the catalog
- [ ] `npx vitest run tests/car_geometry_test.ts` (the collision box)
- [ ] `make profile` before AND after, if the change added geometry, a mesh
      or a material — a car is drawn up to fifteen times a frame, so a part
      that costs one draw call costs fifteen
- [ ] `npx tsc --noEmit -p pwa/tsconfig.json` + eslint on touched files
- [ ] A changeset fragment (a car's look is player-visible — `changelog` skill)
- [ ] docs/architecture.md still describes the car pipeline truthfully

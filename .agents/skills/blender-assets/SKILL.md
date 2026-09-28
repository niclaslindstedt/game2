---
name: blender-assets
description: "Use when a CAR is to be MODELLED IN BLENDER off the game's own numbers, or when the models in the game change — studio renders, a real-time glTF with LODs, a model's rig and clips, or how a modelled car is drawn, dressed and damaged in the game. Owns `make blender` (`scripts/blender.mjs`, the registry of KINDS, and `scripts/lib/car-model-data.mjs`, the JSON a car is handed), the Blender shelf (`scripts/blender/lib.py`: the helpers, the gravel-stage studio, the game-budget export) and the car builder (`scripts/blender/car.py`), the RIG and its clips (`pwa/src/game/car-rig.ts`), the lab sheets that set a model beside the code-built car (`make cars ARGS=\"--asset …\"`, `--models`, `--wrecks`, `--rig`), and THE MODELS IN THE GAME: `make models`, the committed `pwa/models/`, `pwa/models-plugin.ts`, `car-models.ts` (loaded, dressed, POURED INTO the code-built car part for part), `car-dress.ts` (the roles and their colours), the FORM/dress line in `MeshBuilder.form`, the `VITE_MODEL_CARS` switch and `make ci-models`. Not the code car's own builders and specs (`car-design`, `car-creation`) — though they are what every model is built off and held against."
---

# Blender assets

The game draws its **cars from the models made here** — committed in
`pwa/models/` by `make models` — and builds everything else (and, one switch
away, the cars too) in code. A model is the same car MODELLED: the same
numbers, a real surface (a creased subdivision cage where the code lofts flat
facets, rounded bars and lids, turned tyres and rims), so that "how good could
this look, and what would it cost?" is answered with a render, a triangle
count and a picture in the game's own lab.

Four rules, and every step below serves one of them:

1. **A model is built off the game's data, never off numbers of its own.**
   `scripts/lib/car-model-data.mjs` hands Blender the code's own tables for
   one car — the `CarBodySpec` (`bodySpecFor`), the shell's stations and
   rings (`buildStations`, `stationAt`, `ring`), the greenhouse's panels as
   world quads (`cabinPanels`, `panelMinus`, `frameOf`), every bolt-on's PLAN
   (`bumperPlan`, `tailgatePlan`, `mirrorPlan`, `spoilerPieces`,
   `archTrimPlan`, `mudflapPlan`, `gutterBoxes`, `roofVentBoxes`, `doorSkins`),
   the wheel (`RIM_STYLES`, `rimRadii`, `RIM_SHAPE`) and the rig's numbers
   (`CAR_CLIPS`). A placement the code builds inline is first pulled out into
   a plan function the code builder draws from too (the hash check below
   proves the code car did not move) — never restated in Python.
2. **The lab's outputs are not committed; the game's models are.** Renders,
   `.blend`s and LODs land in the gitignored `previews/blender/`; only `make
   models` publishes — every car's LOD0 into `pwa/models/<id>.glb`, with
   `sources.json` (the hash of `MODEL_SOURCES`).
3. **A model is judged beside the code car, in the game's own renderer, with
   the code's dress on it** — `make cars ARGS="--asset …"` — not only in a
   Blender studio, which flatters everything.
4. **The code car is still the car.** A model is poured INTO it (below): the
   code builds every mesh the game knows, and a model only replaces the
   geometry of the FORMS it carries. `VITE_MODEL_CARS=0` is the code-built car,
   byte for byte as it was.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs blender-assets --list`. Load `car-design`
beside it (its judging rules apply to a model), `collision` for anything the
damage model reads, and `skill-reflection` at both ends.

## Where everything lives

| Piece | Role |
| --- | --- |
| `scripts/blender.mjs` | THE DRIVER (`make blender`): `KINDS` (a kind's ids, its data, its builder, its default), finds Blender, runs each QUALITY, echoes what matters (`PARTS`, `BONES`, `CLIPS`, `TRIANGLES`, `NOTE`, what was saved, any traceback) and fails on a Python error |
| `scripts/lib/car-model-data.mjs` | WHAT A CAR IS HANDED: the code's own stations (plus more off `stationAt`, never inside a shut line), the deck's openings as the code snaps them, the greenhouse quads, every plan, the wheel, the rig, and — for the stills alone — every role's colour in linear light |
| `scripts/blender/lib.py` | THE SHELF: the scene, `mat`, the geometry (`loft`, `superellipse`, `tube`, `cyl`, `box`, `lathe`, `crease`, `subdivide`), THE RIG (`rides`, `part`, `bone`, `clip`) and `finish()` — one mesh a PART, parented rigidly to its bone, the clips on NLA tracks, the gravel stage at the edge of a wood, the Cycles stills, LOD0 and the decimated LODs |
| `scripts/blender/car.py` | THE CAR BUILDER: the shell, the greenhouse, the tailgate, arch trim, flaps, air dam and valance, bumpers, lids, doors, mirrors, spoiler, the wheels and the rig — every dimension off the data |
| `pwa/src/game/car-rig.ts` | THE RIG'S CONTRACT: `WHEEL_BONES` (the engine's wheel order), `STEER_BONES`, `CAR_CLIPS` (steer lock to lock at `WHEEL_STEER_LOCK`, travel full bump to full droop at `TUNING.suspension`, one revolution) and `clipMoments` |
| `pwa/src/game/car-dress.ts` | THE ROLES: `CAR_ROLES` (every material name a model may carry) and `dressOf(role, spec)` (its colour on this body, livery and all, as the code builders colour the same surface), `shineOf` (the gloss) |
| `pwa/src/game/car-models.ts` | THE MODELS IN THE GAME: `MODELS.cars` (the switch), `loadCarModels`, `carModel(id)`, `modelOf` (a glTF baked into the body frame, filed by part), `dressPart` (a part in the code's four attributes, dressed) |
| `pwa/src/game/car-body.ts` | where a model is POURED: `options.model` → `modelled(names, builder)` |
| `pwa/models-plugin.ts`, `scripts/models.mjs` | packing (every build, before `appPwa`; a missing model FAILS the build naming `make models`) and publishing (`MODEL_SOURCES`, `sourcesHash`, `sources.json`) |
| `pwa/src/tools/car-preview.ts` + `scripts/car-preview.mjs` | THE SHEETS: `--asset a.glb,b.glb` (a model row under its code car — a file's name starts with its car's id), `--models` (the committed ones), with `--wrecks` (the wreck lab bends the MODEL) and `--rig` (the code car posed by car-mesh.ts's numbers over the model's own clips at the same moments) |
| `previews/blender/` | everything made: `<id>.json`, `<id>-render-<view>.png`, `<id>-lod{0,1,2}.glb`, `<id>-{render,game}.blend` |

## The loop

1. **Look at what the game draws first**: `make cars ARGS="--cars classic
   --views 'front 3/4,rear 3/4,side' --cell 800x520"`. That is the bar.
2. **References, locally.** A studio side profile and a three-quarter view of
   a real car of the class go in the session's scratchpad ONLY — never under
   the tree, never named (not the maker, not the model, not in a file name).
   `AGENTS.md`: NAME NO REAL PRODUCT.
3. **Iterate in render quality**, one or two views, few samples: `make
   blender ID=classic ARGS="--quality render --views three,rear3 --samples
   16"` — about twenty seconds a pass on four CPU cores. The studio has no
   glass and no lamps (those are the code's): judge the forms.
4. **Then the budget**: `make blender ID=classic ARGS="--quality game --views
   none"` (seconds). `PIECES=1` in the environment prints the fourteen
   heaviest objects before the join.
5. **Then the game's lab** — the verdict: `make cars ARGS="--cars classic
   --asset previews/blender/classic-lod0.glb --views 'game,front 3/4,rear
   3/4,rear' --cell 640x440"`. The model row wears the code's dress and
   glass; a band buried in the flank, a lamp floating off the cap or a seam
   gone grey is read here and nowhere else. Then `--wrecks classic --asset …
   --scene flank,rolled,wreck` and `--rig`.
6. **Publish**: `make models`, commit `pwa/models/` with the change, then
   `make build` and `make screenshots` against a `VITE_MODEL_CARS=0` build,
   and `make profile`.
7. **Prove the code car did not move** when a code builder was touched (a
   plan pulled out, a `formed` added): hash every code-built body's
   attributes (`buildCarBody` for each car, with and without interior and
   cockpit) on a clean worktree and on the change, and compare — the
   attributes must be byte-identical.

## The frame

A car is modelled in its own BODY FRAME: game x to the car's right, y up from
the road, z forward (the nose +z). Blender is z up, so a game point (x, y, z)
is modelled at (x, −z, y) — a rotation, not a mirror, so a face wound
outward in the game is wound outward in Blender — and the glTF export turns
it straight back. The game reads a model with NOTHING to turn: `modelOf`
bakes every mesh's world matrix into its positions and normals and the result
IS the chassis frame. The sides are the game's (`mirrorR`, `doorR` and
`wheel_fr` are at +x). Never bake a turn into a model.

## Poured in, not hung beside

game4 hangs its sled models beside the code machine and collapses the code's
drawn parts. A car here is POURED IN instead, because a car is DAMAGED:
`car-damage.ts` re-derives every mesh on the sprung body from a pristine copy
through one displacement field (`car-crumple.ts`), scuffs and chips the
paint, paints a door's hole into the flank, tears the breakables off and
throws them, and the dirt painter (`car-dirt.ts`) lays its coat per face over
all of it. Every one of those reads a MESH of the code car. So the code car
is built as always and a model only swaps the geometry in the meshes it has a
part for:

- `body` ← the model's `body` (+ `cabin_deck`, except on the car that is sat
  in, where the cockpit is built in that hole) and the code's DRESS off the
  shell's builder;
- each breakable (`bumperF`, `bumperR`, `hood`, `hatch`, `doorL`, `doorR`,
  `mirrorL`, `mirrorR`, `spoiler`) ← the model's part and whatever dress the
  code drew on that part (a bonnet's vents, the stripes on a lid, a
  tailgate's handle);
- each side's wheel geometry ← the model's `wheel_fl` / `wheel_fr`, moved
  onto its axle — which car-mesh.ts then steers and spins, and the damage
  model flattens, bends and throws, exactly as it does the code's.

**THE FORM/DRESS LINE** is `MeshBuilder.form` (`formed(fn)` round a piece):
FORM is what a model replaces — the lofted shell, the greenhouse's metal, its
seals, gutters and scoops, the bumpers, the air dam and valance, the lids,
the tailgate, the doors, the arch trim, the flaps, the mirrors, the spoiler,
the wheels. DRESS is everything else and stays the code's: the livery bands,
the deck and roof stripes, the race number, the grille, every lamp's housing
and lens, the indicators, the pods, the plate, the handles, the exhaust, the
engine bay, the bay paint under a lid and the quarter-light corners painted
over the glass. `builder.geometry(true)` is the dress alone. **What the
model does NOT carry, on purpose, and why the code keeps it**: the glass
(per-pane alpha ranges the damage model zeroes, the crazing web, the
reflection, the wipers' film), the lamp lenses (switched rather than lit, and
snuffed per lamp), the cabin, the crew and the cockpit (read through the
glass and from the seat), the dirt and the scuffs (painted at run time), the
hub a lost wheel leaves, and the crew's rig (the crew are the code's figures;
modelling them is open work).

**Smooth panels under a fold.** The code car is flat-shaded and the crumple
rewrites every face's normal flat (`writeFaceNormal`). A model's geometry
carries `SMOOTH_NORMALS` in `userData`; for it the damage model keeps the
REST normals and turns each by the rotation that takes the face's rest plane
onto its bent one (`turnFaceNormals`) — a panel the fold did not move keeps
the model's shading, one it moved catches the light at its new angle.

## Modelling craft (what the cars taught)

- **The shell is the code's own rings under a subdivision surface.** Loft the
  16-point ring through every station, weld the points that only open over an
  arch (a degenerate quad becomes a triangle; subdivision takes it), and
  CREASE by ring point: the wheel well and the arch lip 1.0 (and sharp), the
  belt 0.92, the deck's edge 0.55. With the creases the flanks stay where
  `flankX` says, so a livery band laid 6 mm proud still lies ON the model.
- **Crease across a station where the code folds**: a shut line's four
  stations at 1.0 (without it the V smooths into a pale grey smear several
  centimetres wide), a BOX flare's folded ends at 0.85 (or the box becomes a
  bulge), the caps' rims at 0.7, the authored profile's stations lightly.
- **A cap is an inset ring and a panel**, flat at the cap's own z: the lamps,
  the grille and the plate the code lets into it stand where they always did,
  and the corner still rounds.
- **The deck's holes are the code's holes**: the ring carries points at every
  opening's half-width on every station (straight on the deck, so they move
  nothing), and the faces inside the bonnet's opening are simply not made —
  the code's engine bay closes it. The cabin's is its own part.
- **Paint follows the cage's faces**, a ROLE per face (`segment_role`), so
  every colour edge runs along a crease after subdivision.
- **A bar is a loft along its plan outline**: the face line across the cap,
  a curved corner, and the wrap's own stations down the flank, a rounded
  rectangle reaching the bar's depth into the car at the face and a few
  centimetres at the wraps.
- **Solidify INWARD** (`offset=-1`) whatever the code's glass or dress is laid
  proud of — the greenhouse's metal, the doors — so the outer face stays on
  the plane the code measures from.
- **A lathe's outside is on the LEFT of the profile's run in the (x, r)
  plane**; `flip` runs it the other way. An outward face ported the wrong way
  round is culled in the game and not in Cycles — judge in the game's lab.

## The budget

Measured (Blender 5.2, game quality): LOD0 **23.0k–24.2k** triangles a car
(the shell 8.8k–11k of it, each wheel ~1.5k, each bumper 0.9k–2k), LOD1
~10.5k, LOD2 ~3.8k, **560–620 KiB** a glTF. Render quality ~100k. The field
draws every rival at LOD0, roughly double the code's ~10k exterior: `make
profile` on seed 42 (off → on) is driving 363 → 374 draws and 414k → 456k
triangles, the grid 424 → 424 and 446k → 476k, heads-up 607 → 608 draws and
614k → 911k triangles, with its geometry 38 → 85 MB (every car's forms are
its own buffers, because every car is bent on its own). Rivals at range on
LOD1 is open work, as is a hand-built LOD2 (a blind decimation tears up
close).

## The rig and the clips

Every part is its own mesh, parented RIGIDLY to one bone — never skinned and
never joined across parts, because the game takes each part over as a mesh
of its own. `root` carries the body and the bolt-ons; `steer_fl` / `steer_fr`
stand up through the front wheels' centres (a turn about them is the lock);
each `wheel_*` bone runs out along its axle (a turn about it rolls the wheel,
a lift is the travel), the fronts on their steer bones. The clips are
`CAR_CLIPS`'s, handed over in the data: `steer`, `travel`, `roll`, one glTF
animation each. In a race none of it is played — the wheels are poured into
car-mesh.ts's own wheel groups — so the rig is the model's statement of the
same motion, judged on `--rig`.

## Blender, headless

- **Linux**: the release tarball on the PATH (or `BLENDER=`); Cycles runs on
  the CPU. **macOS**: the app; the driver runs Blender with
  `PYTHONDONTWRITEBYTECODE=1` and `--python-use-system-env` (stale bytecode in
  a signed bundle blocks Python's start for ever otherwise).
- **A Python error exits 0** unless Blender is given `--python-exit-code 1`;
  the driver passes it.
- **API traps (5.x):** add every bmesh LAYER before making the first vertex —
  adding one afterwards invalidates every `BMVert` already held
  (`ReferenceError: BMesh data of type BMVert has been removed`); creases are
  the `crease_edge` float attribute; `bmesh.ops.create_cone` takes
  `radius1`/`radius2`; curve objects are converted before a join or export.

## Adding a kind (the crew, …)

1. **The data**: a row in `KINDS` (`ids()`, `data(id)` off the game's own
   modules through `aliasEngine`).
2. **The builder**, `scripts/blender/<kind>.py`: `from lib import *`, its
   frame in its header, `part()` / `rides()` / `bone()` / `clip()`, then
   `finish(...)`.
3. **The lab**: the kind's own lab owes an `--asset` row beside the code's.
4. **The game**: a `VITE_MODEL_*` switch in `model-switch.ts`'s family, its
   files in `modelFiles`, its sources in `MODEL_SOURCES` (or a stamp of its
   own), and a test like `tests/models_test.ts`.

## Skill self-improvement

Load **`skill-reflection`** before a session that used this skill commits.
What belongs here: a Blender or glTF trap met, a budget measured on a new
kind or a new car, a modelling move that made a class read (or failed to), a
subsystem moved across the form/dress line.

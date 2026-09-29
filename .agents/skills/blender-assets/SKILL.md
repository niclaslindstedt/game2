---
name: blender-assets
description: "Use when a game asset is to be MODELLED IN BLENDER off the game's own data — the cars and every tree today; the crew or any other drawn thing when its kind is added — for studio renders, a real-time glTF with LODs, or to find out how good an authored version of something the game builds in code could look. Owns `make blender` (`scripts/blender.mjs`, the registry of KINDS, and the data each is handed: `scripts/lib/car-model-data.mjs`, `scripts/lib/tree-model-data.mjs`), the Blender shelf (`scripts/blender/lib.py`: the helpers, the gravel-stage studio, the two rigs, the game-budget export) and each kind's builder (`scripts/blender/car.py`, `tree.py`), the RIG and its clips (`pwa/src/game/car-rig.ts`), the lab sheets that set a model beside the code's own (`make cars ARGS=\"--asset …\"`, `--models`, `--wrecks`, `--rig`; `make trees ARGS=\"--models --compare\"`), and THE MODELS IN THE GAME: `make models` (`SET=cars|trees`), the committed `pwa/models/`, `pwa/models-plugin.ts` (`MODEL_SOURCES`, `TREE_SOURCES`), `car-models.ts` (loaded, dressed, POURED INTO the code-built car part for part), `car-dress.ts`, the FORM/dress line in `MeshBuilder.form`, `tree-models.ts` (a variant's model dressed in the season's paint in place of its code shape), the tree rows (`flora-trees.ts`, `flora-tree-rows.ts`), the meshopt packer `scripts/lib/glb-pack.mjs`, the `VITE_MODEL_CARS` / `VITE_MODEL_TREES` switches and `make ci-models`. Not the code's own builders and specs (`car-design`, `car-creation`, `nature`) — though they are what every model is built off and held against."
---

# Blender assets

The game draws its **cars and its trees from the models made here** —
committed in `pwa/models/` by `make models` — and builds everything else
(and, one switch away, the cars and the trees too) in code. A model is the
same thing MODELLED: the same numbers, a real surface (a creased
subdivision cage where the code lofts flat facets, turned tyres and rims; a
whorl of drooping boughs where the code stacks a cone, a lumpy clump of
leaves where it drops an icosahedron), so that "how good could this look,
and what would it cost?" is answered with a render, a triangle count and a
picture in the game's own lab rather than a guess. The shelf, the tree
builder and the packer came across from the sibling snowmobile game, which
models its sleds, its rider and its forest the same way; what is this
game's own is the car POURED INTO the code car, and every tree modelled
over the skeleton the code's recipe lays.

Four rules, and every step below serves one of them:

1. **A model is built off the game's data, never off numbers of its own.**
   The driver hands Blender the very tables the game's builders read, as one
   JSON file: a car's `CarBodySpec`, the shell's own stations and rings, the
   greenhouse's panels, every bolt-on's PLAN, the wheel and the rig's numbers
   (`scripts/lib/car-model-data.mjs`); a tree kind's ROWS — the numbers each
   recipe draws with (`flora-tree-rows.ts`) — and each one's SKELETON, the
   parts the code's own builder lays for it (`scripts/lib/tree-model-data.mjs`,
   `GeoBuilder`'s `trace`). A placement the code builds inline is first
   pulled out into a plan or a row the code builder draws from too (the hash
   check below proves the code did not move) — never restated in Python.
2. **The lab's outputs are not committed; the game's models are.** Renders,
   `.blend`s and LODs land in the gitignored `previews/blender/`; only `make
   models` publishes — every car's LOD0 into `pwa/models/<id>.glb` and every
   kind of tree, packed, into `pwa/models/trees/<kind>.glb`, with
   `sources.json` (the two halves' hashes).
3. **A model is judged beside the code's own, in the game's own renderer**
   — the car with the code's dress on it (`make cars ARGS="--asset …"`), the
   tree through the flora's own material from a car's seat (`make trees
   ARGS="--models --compare"`) — not only in a Blender studio, which flatters
   everything.
4. **The code is still the thing.** A car model is poured INTO the code car
   (below); a tree model stands in for its variant's code shape, in the very
   frame and metres it stood in, so the instancing, the shadow pool and the
   winter's load take it unchanged. `VITE_MODEL_CARS=0` / `VITE_MODEL_TREES=0`
   is the code-built world, byte for byte as it was.

**Before starting, read this skill's lessons** —
`npx ogf-skill-lessons blender-assets --list`. Load `car-design` beside it
for a car (its judging rules apply to a model), `collision` for anything the
damage model reads, `nature` for a tree, and `skill-reflection` at both ends.

## Where everything lives

| Piece | Role |
| --- | --- |
| `scripts/blender.mjs` | THE DRIVER (`make blender`): `KINDS` (a kind's ids, its data, its builder, its default: `car`, `tree`), finds Blender, runs each QUALITY, echoes what matters (`PARTS`, `BONES`, `CLIPS`, `TRIANGLES`, `NOTE`, what was saved, any traceback) and fails on a Python error |
| `scripts/lib/car-model-data.mjs` | WHAT A CAR IS HANDED: the code's own stations (plus more off `stationAt`, never inside a shut line), the deck's openings as the code snaps them, the greenhouse quads, every plan, the wheel, the rig, and — for the stills alone — every role's colour in linear light |
| `scripts/lib/tree-model-data.mjs` | WHAT A KIND OF TREE IS HANDED: every variant's row and its skeleton (shape 0's rolls, the build the world draws first), its bounds, and — for the stills — every colour it wears in the summer, in linear light |
| `scripts/blender/lib.py` | THE SHELF (the sibling's, whole, with the car's needs beside it): the scene, `mat` (one material per NAME), the geometry (`loft`, `superellipse`, `tube`, `cyl` — open ends too — `box`, `ellipsoid`, `coil`, `lathe`, `crease`, `subdivide`, `catmull`, `resample`, boolean cutters), THE RIG two ways (`rides`, `bone`, `clip`; RIGID PARTS — `part` — for a car, SKINNED — `weights`, `marker`, `morph`, linkages — for a figure that bends), the gravel stage at the edge of a wood, `_sky`, the Cycles stills, and `finish()` — LOD0 and the decimated LODs |
| `scripts/blender/car.py` | THE CAR BUILDER: the shell, the greenhouse, the tailgate, arch trim, flaps, air dam and valance, bumpers, lids, doors, mirrors, spoiler, the wheels and the rig — every dimension off the data |
| `scripts/blender/tree.py` | THE TREE BUILDER (`KIND=tree`, `ID=<kind>` or `all`): a kind's variants off their rows and skeletons, each a full tree and a far sketch, one glTF a kind; no rig (§ "The trees") |
| `pwa/src/game/flora-trees.ts`, `flora-tree-rows.ts`, `flora-tree-rows-dry.ts` | THE TREES AS DATA (three-free): the twenty KINDS, what each paint colour IS on a tree (`TREE_PAINT_ROLE`), the forms, and every tree variant's row — read by the code's recipes (`flora-species.ts`, `flora-alpine.ts`, `flora-desert.ts`) and by the driver |
| `pwa/src/game/car-rig.ts` | THE CAR RIG'S CONTRACT: `WHEEL_BONES`, `STEER_BONES`, `CAR_CLIPS` (steer lock to lock at `WHEEL_STEER_LOCK`, travel full bump to full droop at `TUNING.suspension`, one revolution) and `clipMoments` |
| `pwa/src/game/car-dress.ts` | THE CAR'S ROLES: `CAR_ROLES` (every material name a model may carry) and `dressOf(role, spec)`, `shineOf` |
| `pwa/src/game/car-models.ts` | THE CARS IN THE GAME: `MODELS.cars` (the switch), `loadCarModels`, `carModel(id)`, `modelOf`, `dressPart` |
| `pwa/src/game/car-body.ts` | where a car model is POURED: `options.model` → `modelled(names, builder)` |
| `pwa/src/game/tree-models.ts` | THE TREES IN THE GAME: `TREE_MODELS` (the switch), `loadTreeModels`, `piecesOf`, `paintColours`, `treeModel(id, season, sketch)` — a variant's model dressed in the season's paint, in the code shape's frame; read by `flora.ts`'s `shapeFor` |
| `pwa/models-plugin.ts`, `scripts/models.mjs`, `scripts/lib/glb-pack.mjs` | packing (every build, before `appPwa`; a missing model FAILS the build naming `make models`) and publishing (`MODEL_SOURCES`, `TREE_SOURCES`, `sourcesHash`, `sources.json`; every tree through the meshopt packer) |
| `pwa/src/tools/car-preview.ts` + `scripts/car-preview.mjs` | THE CAR SHEETS: `--asset a.glb,b.glb`, `--models`, with `--wrecks` and `--rig` |
| `pwa/src/tools/trees-preview.ts` + `scripts/trees-preview.mjs` | THE TREE SHEET (`make trees`): every kind a row, every variant a column, from a car's seat through the flora's material; `--models` (with `--from`), `--compare` (the code's row over the model's, triangles under each), `--sketch`, `--season`, `--kinds` |
| `previews/blender/` | everything made: `<id>.json`, `<id>-render-<view>.png`, a car's `<id>-lod{0,1,2}.glb` and `<id>-{render,game}.blend`, a tree kind's `<kind>.glb` and `<kind>-{render,game}-{row,far,close}.png` |

## The loop

1. **Look at what the game draws first**: `make cars ARGS="--cars classic
   --views 'front 3/4,rear 3/4,side' --cell 800x520"`, or `make trees
   ARGS="--kinds pine,birch"`. That is the bar.
2. **References, locally.** A studio side profile and a three-quarter view of
   a real car of the class, a photograph of the species at the size a stage
   plants it, go in the session's scratchpad ONLY — never under the tree,
   never named (not the maker, not the model, not in a file name).
   `AGENTS.md`: the repository is public, and names no product.
3. **Iterate in render quality**, one or two views, few samples: `make
   blender ID=classic ARGS="--quality render --views three,rear3 --samples
   16"` — about twenty seconds a pass on four CPU cores; a tree kind, `make
   blender KIND=tree ID=spruce ARGS="--quality render --views row,close
   --samples 16"`, fifteen. The car studio has no glass and no lamps (those
   are the code's): judge the forms.
4. **Then the budget**: `make blender ID=classic ARGS="--quality game --views
   none"` (seconds; `PIECES=1` prints the fourteen heaviest objects before the
   join), `make blender KIND=tree ID=all ARGS="--quality game --views none"`
   (every variant's full and far triangles, the whole forest in a minute).
5. **Then the game's lab** — the verdict: `make cars ARGS="--cars classic
   --asset previews/blender/classic-lod0.glb --views 'game,front 3/4,rear
   3/4,rear' --cell 640x440"` (then `--wrecks classic --asset … --scene
   flank,rolled,wreck` and `--rig`); `make trees ARGS="--models --from
   previews/blender --compare --kinds …"` — the code's row over the model's,
   the triangles under each. A band buried in a car's flank, a lamp floating
   off the cap, a crown that reads as a plate, a canopy darker than the wood
   beside it is read here and nowhere else.
6. **Publish**: `make models` (`SET=trees` or `SET=cars` for one half),
   commit `pwa/models/` with the change, then `make build` and `make
   screenshots` against a `VITE_MODEL_CARS=0` / `VITE_MODEL_TREES=0` build,
   and `make profile`.
7. **Prove the code did not move** when a code builder was touched (a plan
   pulled out, a `formed` added, a recipe's numbers moved to a row): hash
   every code-built car body's attributes (`buildCarBody` for each car, with
   and without interior and cockpit), and every flora variant's code shape
   (all four seasons, all three shapes), on a clean worktree and on the
   change, and compare — the attributes must be byte-identical. And after a
   change to the SHELF, rebuild the cars and compare the glTFs: `make blender`
   is deterministic, so an unchanged car is an unchanged file.

## The frame

A builder states its asset in the frame the game's data is in, and the glTF
export turns it straight back, so the game reads a model with NOTHING to
turn. A car is modelled in its own BODY FRAME: game x to the car's right, y
up from the road, z forward (the nose +z); a tree in its own METRES, y up,
its foot at the origin, as its code shape stands. Blender is z up, so a game
point (x, y, z) is modelled at (x, −z, y) — a rotation, not a mirror, so a
face wound outward in the game is wound outward in Blender. `modelOf` bakes
a car's every mesh's world matrix into its positions and normals and the
result IS the chassis frame; `piecesOf` does the same for a tree. The sides
are the game's (`mirrorR`, `doorR` and `wheel_fr` are at +x). Never bake a
turn into a model.

## Poured in, not hung beside

The sibling hangs its sled models beside the code machine and collapses the
code's drawn parts. A car here is POURED IN instead, because a car is
DAMAGED: `car-damage.ts` re-derives every mesh on the sprung body from a
pristine copy through one displacement field (`car-crumple.ts`), scuffs and
chips the paint, paints a door's hole into the flank, tears the breakables
off and throws them, and the dirt painter (`car-dirt.ts`) lays its coat per
face over all of it. Every one of those reads a MESH of the code car. So the
code car is built as always and a model only swaps the geometry in the
meshes it has a part for:

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

Measured (Blender 5.2, game quality): a car's LOD0 **23.0k–24.2k** triangles
(the shell 8.8k–11k of it, each wheel ~1.5k, each bumper 0.9k–2k), LOD1
~10.5k, LOD2 ~3.8k, **560–620 KiB** a glTF. Render quality ~100k. The field
draws every rival at LOD0, roughly double the code's ~10k exterior: `make
profile` on seed 42 (off → on) is driving 363 → 374 draws and 414k → 456k
triangles, the grid 424 → 424 and 446k → 476k, heads-up 607 → 608 draws and
614k → 911k triangles, with its geometry 38 → 85 MB (every car's forms are
its own buffers, because every car is bent on its own). Rivals at range on
LOD1 is open work, as is a hand-built LOD2 (a blind decimation tears up
close). The trees' budget is § "The trees".

## The rig and the clips

The shelf has two rigs, and `part()` is what picks: a car calls it, so a car
is on the RIGID PARTS rig. Every part is its own mesh, parented RIGIDLY to one
bone — never skinned and never joined across parts, because the game takes
each part over as a mesh of its own. `root` carries the body and the
bolt-ons; `steer_fl` / `steer_fr` stand up through the front wheels' centres
(a turn about them is the lock); each `wheel_*` bone runs out along its axle
(a turn about it rolls the wheel, a lift is the travel), the fronts on their
steer bones. The clips are `CAR_CLIPS`'s, handed over in the data: `steer`,
`travel`, `roll`, one glTF animation each, keyed and never baked (a rigid
part has no linkage to follow). In a race none of it is played — the wheels
are poured into car-mesh.ts's own wheel groups — so the rig is the model's
statement of the same motion, judged on `--rig`.

The SKINNED rig is the sibling's, kept on the shelf for the first kind that
bends (the crew): every part rides a bone wholly or across several
(`weights`), joined into one skinned mesh; a DRIVER bone is set by the game,
a LINKAGE is aimed at a `marker` on another part, rigid (`DAMPED_TRACK`) or
stretched (`STRETCH_TO`), its target written into the glTF as `extras.aim` /
`extras.stretch` (constraints do not survive into glTF), and the clips are
BAKED visually so the linkages' motion is in the file. Its traps: an NLA
track left unmuted plays under the next clip's bake (mute each as it is laid,
unmute at the end, `use_nla` off for the stills); a three.js action set to
its full length wraps to frame 0 (`LoopOnce` with `clampWhenFinished`); a
joined mesh takes its DATA name from the active part — name both; a shape key
forbids the join's modifiers being applied, so a morphed part keeps its own
mesh.

## The trees

`KIND=tree`, `ID=<kind>` (or `all`): ONE glTF a kind, every variant twice —
`<id>` (the tree the road's band draws) and `<id>_far`, a HAND-BUILT sketch
the WILD draws (the land past the road's own 150 m, `buildFloraField`) — a
decimation shreds a crown of separate pieces. Twenty kinds carry every flora
variant that is a TREE:

| Kind | Variants (the flora ids) |
| --- | --- |
| spruce | `spruceTall`, `spruceOld`, `spruceDark`, `spruceLean`, `spruceSnapped`, `spruceYoung`, `spruceSquat`, `spruceGiant`, `spruceSapling` |
| fir | `firSlim`, `firDense`, `firOld` |
| larch | `larch`, `larchOld`, `larchAlpine` (the treeline's flagged one) |
| pine | `pineTall`, `pineCrooked`, `pineOld`, `pineTwin`, `pineGiant`, `pineYoung`, `pineSapling`, `bogPine` |
| stonepine | `arolla`, `arollaOld`, `arollaYoung` |
| birch, aspen | `birch`, `birchPair`, `birchYoung`, `birchOld`, `birchLean`; `aspen`, `aspenTall` |
| oak, maple, rowan, alder, willow | one each, and `willowYoung` |
| snag | `deadSnag`, `deadGiant`, `leaningSnag`, `brokenTrunk`, `drownedTrunk`, `deadArolla` |
| saguaro, organpipe, joshua | `saguaro`, `saguaroOld`, `saguaroYoung`, `deadSaguaro`; `organPipe`; `joshuaTree`, `joshuaYoung` |
| mesquite, paloverde, ironwood, pinyon | one each |

What stays the code's, because it is not a tree: every shrub (the juniper
and the willow shrub of a taiga, the alpenrose, the desert's scrub), the
krummholz mat of mountain pine (two metres of springy stems a car goes
OVER), the small cacti and the ocotillo's canes, the ground cover, and the
stumps, logs, log piles and driftwood (props whose drawn size is held to a
collision circle).

- **Rows, then the skeleton.** A kind's numbers are its rows
  (`flora-tree-rows.ts`: a spruce's height, width, tiers, bare share, shade
  pair, lean and raggedness; a recipe that is a list of the builder's calls
  as `parts`), which the code's recipe draws with. `tree-model-data.mjs` then
  builds each variant through the code's own `GeoBuilder` with a `trace`
  handed in, and every part the recipe lays comes out as a SKELETON part —
  a tube or a cone from its base to its top (off its first two rings of
  vertices), a clump with its radii, a fluted column with its ribs, a stub —
  in the paint it wears. `tree.py` models each part where the code has it,
  which is what keeps a model's silhouette the code's and its girth the one
  the breakage effects cut their splinters to.
- **What each part becomes** (by the paint's ROLE, `TREE_PAINT_ROLE`): a trunk
  out of the ground flares into its roots, darker at the foot, its pair
  blended up it — a conifer's carried on up through the crown; a limb bows a
  little; a needle CONE is a whorl of blunt-tipped, drooping, ridged boughs
  (the sibling's) over a dark CORE through the whole stack (a wood reads solid
  between the boughs), the fir's flatter, the larch's thinner and sparser; a
  needle or leaf BLOB is a lumpy CLUMP (a shell pushed out in a few lobes,
  flatter underneath, darker inside and under) with leaves standing off it
  to break its edge — hanging on a birch and a willow, fewer on a wash
  tree's small ones; a berry blob is a cluster; a birch's dark BANDS are
  black marks lying on the white bark, broken and uneven; a fluted column is
  ribs and grooves with a ribbed dome on its tip; a Joshua tree's hanging
  cone is a shag of dead leaves and its rosette cones are daggers; a
  splinter cone is a jagged spike; a stub is a broken bar with splinters.
- **No colour in the file.** A face's material is NAMED for its paint — a
  colour of the paint box (`SPRUCE_DARK`) or a pair (`TRUNK_DARK>PINE_BARK`);
  a vertex's `tone` is a SHADE and a BLEND. `treeModel` dresses it per
  season through `floraPalette`, as the code's builder paints its own, and
  lays the speckle map across it by position (the code's parts each take it
  once; `GRAIN`). The winter's load is the MATERIAL's (`snow-cap.ts`), so a
  model carries no snow: its VOLUME normals (out of the crown and up) are
  what the load lies on.
- **Volume normals, and never down.** A leaf's, a bough's and a twig's both
  faces lean out and up — a downward underside turned a crown black from
  under it.
- **Shade up.** A crown built too dark reads as a hole in a wood of code
  trees: the shells and boughs start at 0.62 and the undersides at 0.5 —
  the code's per-facet jitter is 0.9–1.1 on colours authored bright.
- **A tuft is a mass.** A pine's or a stone pine's blob modelled as the
  sibling's flat needle cushion read as a stack of dark plates from the
  road; as a clump it reads as the crown the code's icosahedron meant.
- **Winding.** Blender is z up, so a ring by `(cos a, sin a)` in x, y runs
  anticlockwise from above; judge a face's side in the game's lab, which
  culls the back where Cycles does not.
- **Budget** (game quality): full 109–1,796 triangles (spruce 234–1,005, fir
  902–1,089, larch 776–883, pine 110–1,062, stone pine 222–1,630, birch
  448–1,218, aspen 512–552, oak 586, maple 559, rowan 366, alder 568, willow
  316–452, snag 109–426, saguaro 168–1,128, organ pipe 896, Joshua 542–874,
  mesquite 1,796, palo verde 1,347, ironwood 1,710, pinyon 255) against the
  code's 40–1,170; sketches 21–444 (a crowded crown's sketch keeps its
  biggest clumps and every other one of the rest). `tree.py` shares a
  conifer's boughs out of 30 rather than growing past them. THE WOOD IS
  THE COST: the road's band plants hundreds of trees in view, so a model
  a few times the code's is most of a frame's new triangles — measure it
  (`make profile`) before a budget moves up.
- **Packed.** `make models` runs each kind through `scripts/lib/glb-pack.mjs`
  (reordered; positions to 4 mm on the node's scale, normals and tone to 8
  bits; one meshopt view a stream): 6–120 KiB a kind, ~0.58 MB the forest.
  The packer's dependency is `meshoptimizer`, a devDependency; three's own
  `MeshoptDecoder` reads it.
- **Judged** on `make trees ARGS="--models --from previews/blender --compare
  --kinds …"` (the code's row over the model's), then `make build` and a
  forest seen from the road against a `VITE_MODEL_TREES=0` build, on a
  forest biome and a dry one, and `make profile`.
- **Stamped apart** (`TREE_SOURCES`, `sources.json`'s `trees`; `make models
  SET=trees`) — the rows, the recipe files and the builder under them are all
  sources, since the skeleton is read off them; `blender.mjs` and `lib.py`
  are in both lists.

## Blender, headless

- **Linux**: the release tarball on the PATH (or `BLENDER=`); Cycles runs on
  the CPU. Four shared cores: a tree kind's stills at 16 samples are ~15 s,
  the whole forest at game quality a minute. **macOS**: the app; the driver
  runs Blender with `PYTHONDONTWRITEBYTECODE=1` and `--python-use-system-env`
  (stale bytecode in a signed bundle blocks Python's start for ever
  otherwise — `sample <pid>` showing `os_open` under Python's init is the
  tell). Models made on either differ only in their floats' last bits.
- **A Python error exits 0** unless Blender is given `--python-exit-code 1`;
  the driver passes it.
- **API traps (5.x):** add every bmesh LAYER before making the first vertex —
  adding one afterwards invalidates every `BMVert` already held
  (`ReferenceError: BMesh data of type BMVert has been removed`); creases are
  the `crease_edge` float attribute; `bmesh.ops.create_cone` takes
  `radius1`/`radius2`; curve objects are converted before a join or export;
  `use_nodes` is deprecated (set it in a `try`); Principled inputs are `Coat
  Weight`, `Transmission Weight`, `Emission Color`; the RGBA Mix node's
  colours are inputs 6 and 7 and its result output 2.
- **Node's type stripping** runs the game's modules for the driver, and it
  refuses a TypeScript PARAMETER PROPERTY (`constructor(private readonly x)`)
  — a module the driver imports declares its fields.

## Adding a kind (the crew, …)

1. **The data**: a row in `KINDS` (`ids()`, `data(id)` off the game's own
   modules through `aliasEngine`). The car and the tree are the worked
   examples — a plan handed over, and a skeleton traced off the code's own
   builder.
2. **The builder**, `scripts/blender/<kind>.py`: `from lib import *`, its
   frame in its header, `part()` / `rides()` / `bone()` / `clip()` (or no
   rig, as a tree), then `finish(...)` or its own export. A helper two kinds
   need goes into `lib.py`.
3. **The lab**: the kind's own lab owes a view of the model beside the code's
   (`--asset`, `--compare`).
4. **The game**: a `VITE_MODEL_*` switch in `model-switch.ts`'s family (and
   its secret in every workflow's build step and `make ci-models`), its files
   in `modelFiles`, its sources in `MODEL_SOURCES` or a stamp of its own, and
   a test like `tests/models_test.ts` / `tests/tree_models_test.ts` — and its
   row in the registry (below) flipped to `blender`.

## The models in the game

Every build draws them — local, CI, the site's slots, a release, the desktop
and store apps — unless SWITCHED BACK: `VITE_MODEL_CARS=0` (the code-built
cars) and/or `VITE_MODEL_TREES=0` (the code-built trees), in the environment
or the root `.env`; unset, empty or anything else is on (`model-switch.ts`).
Every workflow's build step hands on the repository SECRETS of the same
names, so `make ci-models MODELS=off` switches every CI build back with no
commit (`MODELS=on` returns them).

- **Committed, stamped, drift-tested.** `make models` makes every car and
  every kind of tree at game quality (no stills) and `scripts/models.mjs`
  publishes them with `sources.json`: the hash of `MODEL_SOURCES` and of
  `TREE_SOURCES`. `tests/models_test.ts` recomputes both: a change to any
  source FAILS the suite until `make models` is run and `pwa/models/`
  committed with it. CI therefore needs no Blender. Add a file a builder or a
  data script reads to its list, or its changes go unseen.
- **Packed by the build.** `pwa/models-plugin.ts` emits them as
  `models/<id>.glb` and `models/trees/<kind>.glb` into the bundle (before
  `appPwa`, so the worker precaches them) and serves them the same way in
  dev; a build whose model is missing FAILS, naming `make models`.
- **Fetched before anything is built.** `loadCarModels()` and
  `loadTreeModels()` run with the renderer's chunk (`run-loop.ts`), and the
  cars' again where the car card's stand and the portraits land.
- **A tree stands where its code shape stood.** `flora.ts`'s `shapeFor` asks
  `treeModel(id, season, far)` first: the model, dressed and cached per
  season (shared, as the code's shapes are), for every one of the code's
  three shapes of a variant; the wild's pool its far sketch; any flora id
  that is no tree, and any kind whose file did not load, the code's recipe.
  The instancing, the shadow pool (`flora-shadow.ts`, which takes whatever
  geometry the planting hands it) and the winter's load go on as they were.
- **Cost**: a car's LOD0 (~24k triangles) for every car on the grid; a
  tree's full model where the road's band plants it and its sketch in the
  wild — every variant still one instanced mesh, so the draws do not move.
  `make profile` on seed 42 (trees off → on): driving 384 → 385 draws and
  471k → 736k triangles, the grid 426 → 429 and 476k → 742k — the woods are
  most of the frame's new triangles, and a band nearer than the road's 150 m
  drawing the full model (the rest the sketch) is the open lever.

## The registry

`pwa/src/game/model-registry.ts` is the one list of every kind of object the game draws and whether what the player sees is a Blender model or code — its ids, its code builder (always one: the switch's other side), its Blender builder, committed files and switch when modelled. `docs/models.md` is its table (`make model-registry`), and `tests/model_registry_test.ts` holds the Blender rows to exactly what `modelFiles` packs. **Modelling a kind is a row flipped from `code` to `blender` in the same change that ships its models**; the suite fails until the row, the files and the page agree.

## Skill self-improvement

Load **`skill-reflection`** before a session that used this skill commits.
What belongs here: a Blender or glTF trap met, a budget measured on a new
kind or a new car, a modelling move that made a class or a species read (or
failed to), a subsystem moved across the form/dress line.

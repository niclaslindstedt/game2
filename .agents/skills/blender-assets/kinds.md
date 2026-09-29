# The kinds: the trees, the plants and the props

The companion to `SKILL.md` (which owns the loop, the frame, the car and the
models in the game): what each kind of tree, plant and prop is made of,
how its builder reads the skeleton, its budget and its stamp. Read the
section for the kind at hand before modelling in it.

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

## The plants

The same pipeline as the trees, one row short: a shrub, a tuft or a log has
no row, its recipe being a shape of its own, so `PLANT_KINDS`
(`flora-trees.ts`) groups the forty-seven non-tree flora ids into seven
kinds — `shrub`, `grass`, `wetland`, `ground`, `scrub`, `cactus`,
`deadwood` — and each is made through `tree.py` off the skeleton alone,
one glTF a kind in `pwa/models/flora/`, each id a full model and a far
sketch, dressed per season through `treeModel` exactly as a tree is. What
`plant.py` makes of the parts, by their paint's ROLE: a `blade` (a grass
quad of the code's) an ARCHED blade tapering to a point, both faces lit
out and up, or a FROND of leaflets on a midrib where the paint is a fern's;
`moss` a lumpy CUSHION flat underneath, or a LILY PAD with a notch and a
skirt for its thickness; a `head` a ring of PETALS (the gentian, the
arnica, the lily's bloom, the alpenrose), a cattail's SAUSAGE, a cotton
PUFF, or a cluster of fruit; `spine` a three-sided SPIKE; `stone` a faceted
LUMP; `bone` a soft dome; a `wood` clump a TANGLE of stems (the
tumbleweed); a flesh cylinder standing on edge a rounded PAD (the prickly
pear); an agave's `dagger` a broad folded LEAF; a stem shorter than a
metre and a half and wider than a hand a cut STUMP with three root
buttresses; a tube lying along the ground a LOG cut flat at both ends.
`TracedPart.m` (the primitive's whole frame, recovered by least squares
from three's own pristine copy, `pristineFrame`) is what lets a blade or a
pad be rebuilt where the recipe leaned it rather than from its bounds.

- **Budget** (game quality, full models): grass 72–550 (the ferns' fronds
  the top), shrubs 96–1,272 (the mountain pine's mat), wetland 62–364,
  ground 98–372, scrub 96–1,258 (the bursage's many stems), cacti 39–1,918
  (the cholla), dead wood 104–2,026 (the log pile) — against the code's
  12–1,048. Sketches a fifth to a third of that.
- **A flat thing under a hand's height is judged on the turntable**
  (`make items ARGS=--models`): the tree sheet's seat, a metre and a
  third up and metres back, shows a lily pad or a salt crust as nothing at
  all, and the model is not wrong.

## The props

`KIND=prop`, `ID=<kind>` (or `all`): one glTF a kind in
`pwa/models/props/`, each id a mesh. The kinds are `PROP_KINDS`
(`prop-models.ts`): `traffic` (every `TRAFFIC_MODELS` id), `train` (the
five cars), `farm` (the five machines, the two bales), `livestock` (three
breeds in two poses), `energy` (the turbine's nacelle and rotor, the
solar table and cabin), `stone` (one unit lump the wild seats and scales),
`crowd` (a figure's leg, torso, head and arm), `roadside` (the stake, the
snow pole, the block, the two cones). What is NOT a prop kind, on purpose:
anything built to its own place on the stage — a house to its plan, a pylon
footed leg by leg, a gate to its road's width, a fence along its paddock,
the tunnels swept along the bore, the rails, the crew to its car (the
cabin's parametric figures), a parked car to its rolled dimensions.

- **The skeleton is caught, not handed.** A prop's factory makes its own
  `GeoBuilder`, so the driver hangs the trace on `GeoBuilder.onMake` for
  the one call and every box, cylinder, cone and blob the factory adds
  comes out with its whole frame (`TracedPart.m`, `size`) and its ROLE:
  the name of the module's tint table entry it was painted with (the
  tables are exported by role — `TRAFFIC_TINT`, `TRAIN_PAINT`, …), `paint`
  for the colour object the driver handed in as the paint (a traffic
  vehicle's `trafficPaintColor`, a tractor's `tractorPaint`), or the
  colour's own value where the factory tinted a one-off. A colour made per
  call cannot be named — cache it (`trafficPaintColor`) or make it outside
  the factory (`tractorPaint`) so the same object reaches the builder and
  the driver.
- **Dressed by role, disposed by the caller.** `propModel(kind, id,
  dress)` returns a FRESH geometry every call, unindexed, with the code's
  own attributes (position, normal, colour, uv on the speckle's grain),
  and the module keeps and disposes it exactly as it did the code's — a
  cached shared geometry would be freed by the first teardown. `dressOf(
  tints, paint)` is the dress off a tint table; the stone's dress is white
  (the material's colour carries the bedrock, the moss is laid over the
  shade by normal as before); the crowd's is white (the instance colour
  tints it). A geometry that depends on a farm's own number is the model
  scaled: the rotor is made at `MODEL_ROTOR` (130 m) and scaled to each
  farm's, blades, hub and nose alike.
- **Faces are wound by their normals.** `prop.py`'s `Mesh.f` turns a face
  whose winding runs against its vertices' normals, so a ring laid the
  other way round (three's rings run clockwise about +y, a loft's basis
  may be either hand) is never culled in the game — Cycles, which culls
  nothing, showed the same inward faces as black.
- **The generic pass, then the craft.** Every kind starts from
  `generic()`: a box with real chamfered edges, flat-lit; a cylinder or
  cone turned round and smooth; a tyre and hub pair a wheel with rounded
  shoulders, a tread's shading and a dished rim with a centre cap; a blob
  a smooth ellipsoid. The craft is per kind: a passenger body's two boxes
  LOFTED into one shell (`car_shell`: rounded cross-sections nose to tail,
  the belt, a tumblehome to the glass, the roof's tuck, a raked screen and
  backlight, the glass a band of the shell's own faces; `SHELLS` says how
  each body rakes and where its glass runs), a cow's hide boxes lofted
  into one body on round legs, a sheep's fleece lumpy, a figure's parts
  rounded lofts with a boot and a hand in the shade, a stake's white cap,
  a block's orange ends, a cone with its band on a square base, a snow
  pole's bands turned, the nacelle rounded and the blades smooth.
- **Budget** (game quality, a kind's file): traffic ~34k for twenty
  vehicles (1.5–3.5k a vehicle, the code's 0.4–0.9k; a vehicle is a mesh,
  a handful on screen), train ~15k, farm ~6k, livestock ~4k (instanced),
  energy ~1k, stone 80 (instanced by the hundred), crowd 224 for a figure's
  four parts (instanced by the hundred: this one is held tight), roadside
  ~550. `tests/prop_models_test.ts` holds each kind's file to a budget and
  every model to the code geometry's bounds.
- **Stamped apart** (`PROP_SOURCES`, `sources.json`'s `props`; `make models
  SET=props`): the builder, the driver, the data script, the packer, the
  props' modules and every factory a skeleton is traced off.


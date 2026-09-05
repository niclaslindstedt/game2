---
name: car-creation
description: "Use when a car in the catalog has to be REMADE AFTER A REAL CAR, or a new one built from photographs — a request that names a make and model, or hands over pictures and says 'make it look like this'. Owns the whole pass: which pictures to ask for before starting, the ruled-crop measurement that turns a photograph into metres against the axles, the box the catalog's collider forces every body into, writing the spec in the period idiom WITHOUT naming the car, the overlay that proves the render against the photograph, and the vocabulary the builder is most likely to be missing. Loads `car-design` for the builder and the contact-sheet loop; this skill is what happens before and around it."
---

# Building a car from photographs

`car-design` owns HOW a body is built and judged. This skill owns the pass
where the target is a REAL car: somebody sends pictures, or names a model,
and wants the catalog's front-driver / rear-driver / four-wheel-drive to
look like it. That pass has its own traps, and every one of them was paid
for once.

**Before starting, read this skill's lessons and `car-design`'s** —
`node scripts/skill-lessons.mjs car-creation --list`, then
`node scripts/skill-lessons.mjs car-design --list`. Load `skill-reflection`
at both ends and `write-code` beside this on any code change.

---

## 0. The car is never named

The catalog's cars are ORIGINAL designs in a period idiom, and the header
of `pwa/src/game/car-styles.ts` says so. A body measured off photographs
of a real car is still described that way: **no make, no model, no team,
no badge, no wordmark — not in the spec's comment, not in a commit
message, not in the changeset fragment, not in the PR, not in a lesson.**
Describe the car by what it IS: "a four-door turbo sedan of the Group A
years", "a late-seventies two-box hatch". The user may name the car in
the conversation; the repository never does. A user who says so
explicitly is restating the rule, not relaxing it.

The same goes for the livery. A works scheme is reproduced as COLOUR
BLOCKING — the diagonal, the blackout, the roof colour — never as the
sponsors and marks that made it that team's.

## 1. Ask for the right pictures first

A photograph is a measuring instrument only when it is a true elevation.
Before measuring anything, check what was handed over against this list,
and ASK for what is missing — one round of "could you find a straight
side view" costs a minute; a body measured off a three-quarter shot costs
the whole session and is still wrong.

| Picture                                     | What it is FOR                                                                                                     | What it must be                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Side elevation** (required)               | Every length and height: overhangs, cowl, pillars, roof, door lengths, belt, arch size, bumper heights, the wheel. | Dead side-on, telephoto (a long lens — the front and rear wheels the same size on the picture), wheels straight, unobstructed |
| **Front** (wanted)                          | The LAYOUT of the face: lamp shape and count, grille width, pods, scoops, air dam, indicator position              | Straight on. It will be perspective — use it for what is where and how wide, never for heights                                |
| **Rear** (wanted — the chase camera's view) | The layout of the tail: lamp band, plate position, bumper depth, valance, spoiler, exhaust side                    | Straight on, ideally of the same body — a road-car rear is fine for the layout, the rally car for the furniture               |
| **Wheel close-up** (wanted)                 | Spoke count, spoke breadth, rim share of the tyre, hub size, colour                                                | Any angle that shows the whole face; the side elevation often serves                                                          |
| The real car's dimensions                   | Length, wheelbase, width, height — to scale the picture and to know what has to be compressed                      | From memory or a spec sheet; state them in the spec's comment                                                                 |

A three-quarter view, a moving shot, a wide-angle shot from knee height:
all reference for the FEEL, none of them measurable. Say so, and ask.

## 2. Measure against the axles, with a ruled crop

Never read a proportion off a picture by eye. Two eyeball reads of the
same elevation disagreed by twenty centimetres (`car-design`'s lesson).
The procedure:

1. **Rule the picture — FINE.** `tools/rule.mjs` beside this skill draws
   the photograph scaled and rules a labelled line every N source pixels
   (`node rule.mjs photo.jpg x0 y0 x1 y1 scale step out.png`; run it from
   a scratch directory with the repo's `node_modules` symlinked in, and
   `CHROMIUM_PATH` set). Twenty source pixels at three times zoom, over a
   third of the car at a time (nose, doors, tail, wheels); a fifty-pixel
   grid at twice zoom read a rounded nose ten centimetres high and a cowl
   seven high, and both survived a first overlay. Read every landmark
   twice, from two crops, as a pixel coordinate, and read the picture with
   the `Read` tool. The same tool rules an OVERLAY, which is how a miss is
   read in centimetres rather than seen.
2. **Scale from the wheelbase.** The two wheel centres are the only
   points nothing can argue with: `mm per pixel = real wheelbase / pixel
distance between hub centres`. Cross-check against the tyre diameter.
3. **Place z from the axles, y from the ground under the tyre.** State
   every landmark in metres from the nearest axle — the loft already puts
   its wheels there. Do the whole car in one sitting: bonnet edge, cowl,
   A-pillar foot and roof front, door shut lines, B-pillar, side-glass
   end, roof rear, backlight foot, boot, tail, bumper top and bottom, lamp
   top and bottom, belt, sill, rubbing strip, handles, flaps, arch tops.
4. **Write the metres into the spec's comment**, from the axles, as the
   front-driver's and the sedan's comments do. Fractions of overall length
   are what the next reader cannot check.

## 3. Fit the collision box, and say how

One box in `TUNING.collision` serves the whole catalog and
`tests/car_geometry_test.ts` fails any spec outside it — `halfLength` is
measured to the BUMPER FACE (`bumper.depth − 0.02` past the cap), and the
cars ship on a ~2.4 m wheelbase. A 4.5 m car does not fit. The honest
compression is **scale every LENGTH by one factor and no height or width**
— the picture's proportions along the car survive, the proportions up
and across it stay real — and the factor goes in the comment. Then put the
tail cap and the nose cap where the two bumper faces both land inside the
box, using `axleShift` to centre the overhangs rather than shortening
one of them. **Put the caps where the picture has them, never out at the
box's edge**: the box is a ceiling, not a target, and a cap pushed out to
fill it is a nose a hand too long on the overlay. Only the bumper's
`depth` flexes, and it should be shallow on a car whose nose is its lamps.

The other forced numbers, all from the same test: the arch radius is the
tyre plus the springs' whole travel (`TUNING.suspension.heaveMax`), which
is bigger than any real arch — accept it; and **the first profile station
is tied to the world's solid-stone bar**: the engine plants a roadside
stone as a solid against the lowest bonnet in the catalog
(`SOLID_PROP_HEIGHT` in `engine/mapgen/solids.ts`, with
`collision.rideOver` a little over it), and `tests/car_geometry_test.ts`
holds the bar inside the lowest nose's upper half. Today that nose is the
four-wheel-drive's 0.74 m lip and the bar sits at 0.43 m; a nose lower
than about 0.72 m needs the bar lowered again, which is a GENERATOR
change in its own PR — more stones become solids on every stage — with
`make analyze` and `make sim` before and after, `make previews`, and the
suites over solids, collision, the arena and the farms. Never draw a
nose flat at the bar to dodge that; the overlay keeps showing it.

## 4. Write the spec — and expect to extend the vocabulary

Read `pwa/src/game/car/spec.ts` end to end before writing. The vocabulary
is rich but it was written for the cars that exist; a new silhouette
always wants two or three things it has not got. Every one so far has
been an OPTIONAL field defaulting off (a second lamp-pod row, a coloured
mud flap, roof scoops, a band with slanted ends, a second body colour
from a station back) and a few lines in the builder that owns that end of
the car. Add the field, keep every existing spec rendering unchanged, and
make anything painted SYMBOLIC (`"accent"`, the roof's colour) rather
than a hex, so `applyLivery` carries it onto the field's repaints.

Two of the rules bite on every real car:

- **A door is one straight line.** `splitZ` in metres, and the same z in
  `doorSeams`. A four-door is three seams and two handles.
- **The back is where the geometry is spent.** The chase camera holds the
  tail for a whole stage. Lamp band, plate, bumper, valance, spoiler,
  flaps, tail paint: do all of it, and judge it in the `game` column.

## 5. Render, then OVERLAY — the proof is the two pictures as one

`make cars` judges the sculpture (`car-design`'s loop, with the `Read`
tool on re-rendered subsets, never crops of the big sheet). It cannot
say whether the body matches the photograph. For that:

```sh
# a true elevation: orthographic, 4.6 m across the cell, centred 0.7 m up
node scripts/car-preview.mjs --cars coupe --views "elevation side,elevation front,elevation rear" --cell 920x630 --out elev
# lay it over the photograph, half transparent, anchored on the front hub
node scripts/overlay.mjs --under photo.jpg --over previews/elev.png \
  --anchor <photo hub x,y> --at <render hub x,y> \
  --scale-x <photo px/m ÷ render px/m ÷ length factor> --scale-y <photo px/m ÷ render px/m>
```

Every sheet also writes `previews/<out>.marks.json` — where each cell's
camera put the car's landmarks (axles, tyre corners, roof corners, lamp
edges, bumper corners, wing tips), in sheet pixels — so the overlay can
register itself: `--marks previews/elev.marks.json --cell 0:0 --on
axleF=<photo x,y> --on axleR=<photo x,y> --length-factor 0.95 --key` lands
the first mark on its photo point, scales by the marks' distance (the hubs
put the compressed lengths on the real ones by construction, so the
factor goes on the real HEIGHTS instead), and keys the sky out so only the
car lies on the picture. A correctly measured body lands ON the photograph and
every miss is visible as a doubled edge: a post too wide at the top, pods
too far in, a lamp band a hand too high. Fix, re-render with
`--skip-build`, overlay again. Two things the overlay shows that are not misses: a 3 cm halo over a
bonnet with deck stripes (the lid is 2 cm proud of the loft and the paint
1 cm over that, on every car), and an arch a hand bigger than the
photograph's (the springs' travel, forced by the geometry test).

**The side elevation is the measuring overlay.** A front or rear
photograph is PERSPECTIVE: laid under an elevation registered on the
lamps, its roof and its wing sit lower than the drawing's however right
the car is, and the tail reads "too high" for no reason in the spec. To
measure an END view, fit the photograph's camera:
`tools/fit-camera.mjs <car> <az> points.json out.json` (az 0 for the
nose, π for the tail; `points.json` names the landmarks with their photo
pixels — mind that the engine's +x is the car's LEFT, so from behind the
"R" landmarks are on the photo's left). It searches height and distance
by least squares, prints every landmark's residual in photo pixels, and
writes a `--variants` file whose one view IS that camera; render it, then
overlay it on the lamp edges with `--marks` and no length factor (an end
view's axes are both real). Residuals under ten pixels on a 1800-pixel
frame are a match; the ones that stay say where the spec is wrong — a roof
that does not narrow toward the tail, a wing too short across.

Then `make build` and a shot in the real game
(`node scripts/debug-shot.mjs '?seed=42&start=1&debug=1&car=<id>&bot=1'`),
because the sheet is lit for daylight on a flat plain.

## 6. Ship

`car-design`'s checklist, plus: the catalog comment in
`engine/game/defs/cars.ts` and the car's paragraph in `docs/driving.md`
still describe the shape truthfully; `docs/architecture.md` names any new
vocabulary; the changeset fragment describes the car in idiom terms.
Commit with the `commit` skill — and re-read the commit message, the PR
and the fragment for a make or model that slipped in.

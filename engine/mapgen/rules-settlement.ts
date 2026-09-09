// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the stage generator's rule book (`rules.ts`): WHERE PEOPLE
// LIVE AND WHAT THEY BUILT — homesteads, the wind and solar farms, the
// transmission line, the towns, and the crowd's car parks. Spread into
// `STAGE_RULES` by `rules-book.ts`.

export const SETTLEMENT_RULES = {
  /** R37 — THE HOMESTEADS: where a house may stand off the stage, what its
   * drive is like, and what is in the yard. Meters unless noted. */
  homestead: {
    /** The stage is walked in SLOTS this far apart, and every slot rolls
     * for a homestead against `spacing.mean` — so the mean distance between
     * two is the mean, and the actual distance is whatever the dice and the
     * country made it. `spacing.min` is the least the dice may do: two
     * houses in one view is a village, and a village is a different
     * feature. */
    slot: 40,
    spacing: { mean: 250, min: 380 },
    /** The stage's two ends are left alone: the start's apron and the field
     * standing on it, and the run into the line (R2, R25). And so is the
     * road either side of a FORD or a BRIDGE, along the stage: a drive's
     * shelf beside the road fills the channel the water is supposed to be
     * seen running through (R18), and nobody builds the track to their
     * house down into a river. */
    keepOff: { start: 240, finish: 140, water: 90 },
    /** Tightest corner (as a radius, m) the drive may leave from. A drive
     * meets a straight — nobody builds the track to their house onto the
     * outside of a bend, and a square meeting is only square against a
     * road that is going somewhere definite. */
    straight: 150,
    /** The DRIVE: a lane's width of gravel (a car and a half), how far it
     * runs before the yard, how tightly it may wander doing it (as a
     * radius, m) and how steep it may climb. It leaves the stage straight
     * for `straight` metres, so the junction reads as a junction. */
    drive: {
      width: 4.2,
      length: { min: 46, max: 118 },
      minRadius: 90,
      straight: 24,
      bend: 28,
      maxGrade: 0.08,
      /** The least room the drive keeps between itself and any OTHER piece
       * of route, branch or public road, m — past the corridor it is
       * leaving. A track that comes down to two roads is a shortcut, and
       * the stage has R14 for what to do about those. */
      clear: 26,
    },
    /** The YARD: the graded gravel the house stands on, as a disc — its
     * radius, how far past its rim the country is eased back onto it, and
     * how much the bare ground may differ from the yard's level anywhere on
     * it before the pad would be a cliff or a pit. */
    yard: { radius: { min: 10.5, max: 13.5 }, blend: 11, level: 4.2 },
    /** Where the house stands on the yard, as a share of its radius past
     * the centre, and how far back from the drive's own line its front
     * wall keeps. */
    house: { setBack: 0.42 },
    /** The cars outside: how often there are two. */
    cars: { two: 0.36 },
    /** The lane trees, on both sides: their spacing, how far off the
     * drive's edge they stand, and how big they are (the trunk field's
     * `size`). They start past the barrier, so the barrier is seen. */
    trees: {
      spacing: { min: 9, max: 14 },
      offset: { min: 3, max: 4.6 },
      size: { min: 0.8, max: 1.2 },
    },
    /** How far apart two homesteads' yards have to be on the MAP, m —
     * `spacing` is measured along the stage, and a stage that folds back
     * on itself can bring two arc positions a kilometre apart within a
     * field of each other. */
    apart: 150,

    /** R37 — THE FARMS: which homesteads are one, and what a farm has.
     * Only in a country that is farmed (`BiomeRules.farms`). */
    farm: {
      /** How many homesteads roll a farm. Half: a stage sees two or three
       * houses, and one of them being a farm is a country that is worked. */
      chance: 0.5,
      /** A farm's yard is bigger than a house's, because the barn stands
       * on it: its corners have to be on the pad, and a barn is long. */
      yard: { radius: { min: 21, max: 24 } },
      /** THE BARN: its footprint — `width` along the front, which faces
       * the yard, and `depth` back from it — and how far in from the
       * yard's rim its front stands, as a share of the radius. Longer,
       * wider and taller (two storeys of byre and loft) than any house. */
      barn: { width: { min: 18, max: 27 }, depth: { min: 9, max: 11.5 }, setIn: 0.28 },
      /** A tower silo beside the barn's gable, on some farms. */
      silo: { chance: 0.35, radius: { min: 2.2, max: 3 }, height: { min: 9, max: 14 } },
      /** THE PADDOCK: a fenced rectangle of grazing, this far past the
       * barn or the house, no more than `slope` out of level corner to
       * corner, a post every `postPitch` metres and a `gate`-metre gate in
       * the side nearest the yard. `cows` is how often it is cattle rather
       * than sheep, and `head` how many of each graze it. */
      paddock: {
        width: { min: 40, max: 70 },
        depth: { min: 28, max: 45 },
        gap: 4,
        slope: 9,
        postPitch: 3.2,
        gate: 4.5,
        cows: 0.65,
        head: { cows: { min: 5, max: 12 }, sheep: { min: 8, max: 18 } },
      },
      /** THE FIELD: bigger than the paddock, flatter, and the bales the
       * baler leaves across a hay field. */
      field: {
        width: { min: 60, max: 110 },
        depth: { min: 40, max: 70 },
        gap: 6,
        slope: 7,
        bales: { min: 6, max: 12 },
      },
      /** The machinery: how far in front of the barn the tractor stands,
       * and how often there is a trailer. */
      gear: { apron: 5, trailer: 0.6 },
      /** The sizes a paddock or a field is tried at, as shares of the
       * rolled one, largest first: a hillside that will not take a hectare
       * often takes half of one. */
      shrink: [1, 0.75, 0.55],
    },
  },

  /** R43 — THE ENERGY: the wind farms on the high ground and the solar
   * farms on the flat. Only in a country modern enough to have built them
   * (`BiomeRules.energy`). Meters unless noted. */
  energy: {
    /** THE WIND FARMS: a string of turbines along a rise off the stage,
     * each two hundred metres to the blade tip, seen from a kilometre
     * before the road gets near them. */
    wind: {
      /** The stage is walked in slots this far apart, each rolling against
       * `spacing.mean`; `spacing.min` is the floor between two strings
       * along the stage. A wind farm is a landmark — one or two on a stage,
       * never a row of them. */
      slot: 60,
      spacing: { mean: 900, min: 800 },
      /** The stage's two ends are left alone (R2, R25). */
      keepOff: { start: 300, finish: 200 },
      /** How far off the route's centerline the string is looked for, and
       * how finely the lateral ray is probed: the highest dry ground in
       * that band is where the first tower stands. Near enough that the
       * towers fill the sky over the road (the fog takes everything past
       * half a kilometre), far enough that a blade tip never sweeps it. */
      offset: { min: 170, max: 400 },
      probe: 30,
      /** The least a turbine's foot stands over the road it is seen from:
       * a wind farm is on the HIGH ground, or it is not one. And the most
       * a tower on the string may stand UNDER the first — the string was
       * placed for the rise, and a tower that has walked off it into the
       * bog beside is not on the rise. */
      rise: 3,
      drop: 30,
      /** The least a tower's foot keeps from the route's centerline, from
       * any other road's, and from a town's or a homestead's pad. The route
       * figure is the rotor's radius plus the road's own corridor with
       * room to spare. */
      clear: { route: 150, road: 70, settled: 160, solar: 90 },
      /** How many towers a string is: under `count.min` it is not a farm
       * and is not built. */
      count: { min: 3, max: 7 },
      /** How far apart the towers stand along the string — a little over a
       * rotor's diameter and a half, the closest a real string is packed —
       * and how far the string may swing off the road's own heading, rad,
       * so every tower stays in the band the road sees it from. */
      pitch: { min: 190, max: 260 },
      swing: 0.45,
      /** How far each tower may walk off its slot on the string to the
       * highest ground near it: a string follows the ridge, not a ruler. */
      seek: 40,
      /** THE TURBINE: hub height and rotor diameter, drawn once per farm
       * (a string is one make of machine). Modern onshore sizes. */
      hub: { min: 105, max: 125 },
      rotor: { min: 120, max: 140 },
      /** The crane pad each tower stands on: a disc of graded gravel, how
       * far past its rim the country is eased back onto it, and how far
       * out of level the bare ground may be across it. */
      pad: { radius: 16, blend: 14, level: 7 },
      /** How far apart two farms' towers have to be on the map. */
      apart: 500,
    },
    /** THE SOLAR FARMS: panels en masse on level ground beside the stage,
     * fenced, all facing the same way — from a paddock's worth to a field
     * of them. */
    solar: {
      slot: 40,
      spacing: { mean: 600, min: 520 },
      /** The stage's two ends, and the road either side of a FORD or a
       * BRIDGE along it: a ford's channel runs tens of metres either side
       * of the road (R18), and a fence beside it is a fence in a river. */
      keepOff: { start: 260, finish: 160, water: 90 },
      /** Tightest corner (as a radius, m) a farm is laid beside. */
      straight: 80,
      /** How far the fence stands off the route's corridor: the gap
       * between the road's outer verge and the nearest fence line. */
      gap: { min: 18, max: 90 },
      /** The bearing the panels FACE, rad — the sun's own azimuth, the one
       * `pwa/src/game/sky.ts` lights the world from (`SUN_AZIMUTH`; a test
       * holds the two together). Every farm on every stage faces it, so a
       * driver learns which way is south. And how steeply they are tilted
       * toward it, rad. */
      facing: 0.9,
      tilt: 0.55,
      /** THE SIZES: how often each is rolled, and its fence's extent —
       * `width` along the rows, `depth` across them. */
      sizes: [
        { chance: 0.5, width: { min: 30, max: 60 }, depth: { min: 20, max: 40 } },
        { chance: 0.3, width: { min: 70, max: 120 }, depth: { min: 50, max: 80 } },
        { chance: 0.2, width: { min: 140, max: 220 }, depth: { min: 90, max: 150 } },
      ],
      /** How far out of level the ground may be across the fence, as a
       * grade over the rect's diagonal: the tables follow the ground, but a
       * hillside is a hillside. */
      slope: 0.07,
      /** THE ROWS: how far in from the fence the rows start across them,
       * how far in from the fence they END along their length (room for the
       * cabin and a track round the ends), how far apart the rows stand (a
       * table's shadow at a low sun), how long one table is along the row
       * and the gap between tables, and how deep a table is across the row. */
      margin: 4,
      end: 6,
      row: { pitch: 6.5, table: 8, gap: 0.8, depth: 3.2 },
      /** The fence: a post every `postPitch` metres, and a gate this wide
       * in the side nearest the road. */
      fence: { postPitch: 3.2, gate: 5 },
      /** The inverter cabin just inside the gate. */
      cabin: { width: 5.5, depth: 3.2 },
      /** What a fence line keeps from any other road's centerline, from a
       * town's or a homestead's pad, and from a turbine's foot. */
      clear: { road: 40, settled: 110, wind: 90 },
      /** How far apart two farms have to be on the map, fence to fence. */
      apart: 300,
      /** The sizes a farm is tried at, as shares of the rolled one. */
      shrink: [1, 0.75, 0.55, 0.42],
    },
  },

  /** R45 — THE GRID: the transmission line that takes the power away,
   * laid rim to rim across the map before the rally. Meters unless noted.
   * Only in a country that makes power (`BiomeRules.energy`) — the same
   * flag the wind and the solar farms read, because a grid and the things
   * that feed it are one fact about a country.
   *
   * The numbers are a 400 kV line's, which is what the portal tower in
   * Scandinavia carries: three conductors on one crossarm in bundles of
   * two, two earth wires on the peaks, towers between fifteen and
   * fifty-five metres, a ruling span in the low hundreds and a corridor
   * cut through the forest around fifty metres wide. Nothing here is a
   * number picked to look right — it is what a line of this class is,
   * and the placer that reads them is the surveyor's own method. */
  powerline: {
    /** How often a seed's country carries one at all. A line is a
     * LANDMARK: seen once on a stage it is a place, seen on every stage it
     * is wallpaper, and at a little under half the seeds a driver meets one
     * often enough to know it and rarely enough to look up. Never two —
     * two lines across one map cross each other, and a crossing of two
     * grids is a substation, which is a different thing entirely. */
    chance: 0.45,
    /** How many entry points on the rim a line may be tried from before
     * the country is judged not to carry one. Far fewer than a road's: a
     * refused line costs a whole walk of towers, and one that will not fit
     * at ten entries is on a seed that is mostly lake. */
    tries: 10,
    /** How far outside the world bound a line starts and ends, m — past
     * the fog's own reach, so it is never seen beginning, and past
     * anything a wayleave could betray.
     *
     * There is no `step` for the line itself, and there cannot be: a line
     * is a chain of TOWERS, and it can only change direction at one. What
     * gets walked is the tower list. */
    overrun: 650,
    /** THE SPANS. `ruling` is the span the line's TENSION was designed at
     * — everything about the sag follows from it — and `min`..`max` is the
     * band the ground is allowed to move a span inside. `stretch` is the
     * long crossing span: the ridge-to-ridge reach a surveyor takes when
     * the ordinary band has nowhere in it to stand a tower, which is where
     * a line gets over a lake, and where it looks like something.
     *
     * A 400 kV line's own numbers. Past `stretch` the line is refused
     * rather than drawn with a gap in it. */
    span: { min: 190, ruling: 350, max: 400, stretch: 640 },
    /** How finely a span is searched, m. A tower moves ALONG the line and
     * never off it: the bearing is the survey's, and a tower shuffled
     * sideways to dodge a fence is the one thing that would say plainly
     * this was generated. */
    probe: 12,
    /** How far a span sags at its middle at the RULING span, as a share of
     * it. Sag goes as the SQUARE of the span at a fixed tension
     * (`w·L²/8H`), so this one number gives every span its own: the band's
     * shortest hangs a few metres, and the stretch over a valley hangs
     * thirty. That is not a licence — it is the whole reason a long span
     * needs a valley under it, and it is what makes the crossing spans
     * read as the big ones. The parabola the game draws is within half a
     * percent of the catenary under a tenth of the span, which every span
     * here is. */
    sag: 0.028,
    /** THE CLEARANCE the lowest conductor keeps over the ground, and over
     * a public or rally ROAD, m. This — not a spacing rule — is what
     * actually spots a tower: the surveyor lays the sag curve on the
     * ground profile and stands a tower where it would otherwise touch,
     * which is why real towers are on the brows and the long spans are
     * over the hollows. The ground figure is a 400 kV line's statutory
     * one; a crossing gets more, the way a railway crossing does. */
    clearance: { ground: 8.8, road: 12 },
    /** HOW A LINE TURNS. `most` is the biggest deviation a tower here
     * carries, rad (a real line's heavy angle towers go further, but past
     * this the structure is a different machine and the line stops reading
     * as straight). `suspension` is the most an ORDINARY tower carries:
     * past it the tower is an ANGLE tower, which is heavier, strung with
     * horizontal tension insulators instead of hanging ones, and not a
     * thing a line puts in every span — hence `apart`, the least spans
     * between two of them. */
    angle: {
      most: 0.34,
      suspension: 0.035,
      apart: 3,
      /** How many ANGLE POINTS the survey fixes between the two rims, and
       * how far off the straight one may be pushed, as a share of the
       * map's own reach. A line aimed at one point comes out dead straight
       * on every seed, because nothing in a bare country is a reason to
       * turn — what turns a real line is land nobody would sell and places
       * somebody wanted it to pass, and neither of those is on this map.
       * The dice stand in for the surveyor; `most` still decides what the
       * structure can carry, so a survey that asks for more than a tower
       * can take gets a longer, gentler bend rather than a kink. */
      points: { min: 1, max: 2 },
      offset: 0.3,
    },
    /** ...and the most spans a line runs before it puts a TENSION tower in
     * anyway. A line strung suspension tower to suspension tower for
     * kilometres falls over kilometres at a time when one of them goes:
     * the section breaks are what stop a cascade, and they are the reason
     * a straight line still has heavy towers on it. */
    section: 5,
    /** How far ahead the line looks for water when it is choosing its
     * bearing at a tower, and how far above the water table the ground has
     * to stand before a tower could go there. It swings off its aim to get
     * round water it could not span, and spans the rest. */
    shoreLook: 520,
    shoreFreeboard: 1.5,
    /** What a tower's foot keeps clear of: the route's centerline (the
     * corridor at its widest, and half as much again of field past it —
     * far enough that a car has to be a long way wrong to reach one, near
     * enough that the wires still cross the road in front of you), any
     * other road's centerline, a town's or a homestead's pad rim, and a
     * turbine's crane pad or a solar farm's fence. */
    clear: { route: 34, road: 26, settled: 40, energy: 55 },
    /** THE TOWER — the Nordic portal (the type Scandinavia, Ireland and
     * much of North America carry): two splayed lattice legs under one
     * horizontal crossarm, the conductors on insulator strings under it
     * and the earth wires up on the crossarm's two peaks. Height to the
     * crossarm, how far apart the legs stand at the ground, how long the
     * crossarm is, and how high the peaks stand over it. Inside the 15-55
     * m band real towers are built in, at the height a 400 kV portal is.
     * Drawn once per LINE: a grid is one make of tower the whole way
     * across a country. */
    tower: {
      height: { min: 28, max: 36 },
      base: 17,
      arm: 20,
      peak: 3.9,
      /** How wide one leg stands at its foot, and how far in from the
       * crossarm's END its top sits. The gap between the two is the whole
       * silhouette: the legs meet the arm well inboard of its tips and
       * SPLAY out to nearly the arm's own width at the ground, which is
       * what makes a portal read as a portal rather than as two masts
       * somebody laid a beam across. */
      foot: 2.2,
      inset: 5.5,
      /** The most the bare ground may fall across the tower's own base
       * before the ground is judged not to hold one, m. A real tower
       * stands on legs cut to length and does climb a hillside; what this
       * refuses is the bank of a cutting and the lip of a crag. */
      level: 4.5,
      /** THE FOOTINGS. A lattice tower is not planted in the dirt: each
       * leg is bolted to a poured concrete pad with a CHIMNEY on it that
       * stands proud of the ground, and on a hillside the footings are
       * poured to one working level so the downhill one stands taller.
       * How wide the chimney is, how far it stands proud on the level, and
       * the most it may stand before the difference is taken up by the LEG
       * instead — which is the other half of how a real tower fits a
       * slope, and why `level` above may be more than `most` here. */
      footing: { width: 1.5, proud: 0.5, most: 2.2 },
    },
    /** THE WIRES: how many conductors the crossarm carries and how far
     * under it they hang on their insulator strings, how many sub-wires
     * each conductor is BUNDLED from and how far apart they are spaced (a
     * 400 kV phase is two wires on spacers, which is why the wires come in
     * pairs when you are near enough to see), and how many earth wires
     * ride the peaks. One circuit, three phases, two earth wires: the line
     * in the photograph. */
    wire: { conductors: 3, insulator: 3.2, bundle: 2, bundleGap: 0.45, earth: 2 },
    /** THE WAYLEAVE: how far either side of the line the forest is cut
     * back, m — half of a 400 kV corridor, which runs a little under fifty
     * metres wide. A straight ride through the trees that runs over the
     * hills and out of sight: the half of a transmission line that is
     * visible from further away than the towers are. It clears TREES and
     * nothing else — the stones, the scrub and the ground cover stay,
     * because a corridor is cut on a cycle of years and what grows back
     * between cuts is exactly that. */
    wayleave: 24,
  },

  /** R39 — THE TOWNS: where the tarmac leads. */
  town: {
    /** How many buildings a town is. Under `size.min` it is not a town and
     * is not built; the dice pick a target inside the band and the street
     * decides how much of it fits. */
    size: { min: 10, max: 20 },
    /** How many towns a finite stage may carry, and — on an endless one —
     * the least stage arc between two, m. */
    perStage: 1,
    spacing: 4000,
    /** How likely a town is on a street the stage only MEETS (an abandoned
     * arm past a junction or a crossing) rather than drives. The borrowed
     * run itself always gets one where one fits: that tarmac was laid to
     * reach somewhere, and the rally is about to find out where. */
    armChance: 0.8,
    /** THE STREET: how long a piece of sealed road has to be before a town
     * fits on it, m, and how far along an abandoned arm the town may reach
     * — past which the arm is out in the country and out of the fog. The
     * tightest bend (as a radius, m) a lot may stand beside: a village
     * street sweeps, and a house on the outside of a corner is a wall a car
     * arrives at. */
    street: { min: 150, reach: 420, minRadius: 70 },
    /** THE LOT: how far the front wall stands past the road's verge, m
     * (the front yard — a shop gets the deep end, for the cars outside
     * it), the gap between two buildings along the street, how far past
     * the building's footprint its graded pad reaches, how far past the
     * pad's rim the country is eased back onto it, and how much the bare
     * ground may differ from the pad's level across it before the lot
     * would be a cut or a fill nobody would build on. */
    lot: {
      front: { min: 4.5, max: 9 },
      shopFront: 8.5,
      gap: { min: 4, max: 9 },
      margin: 1.5,
      blend: 6,
      level: 6,
      /** ...and how far the ground under a building may end up from the
       * building's own floor, m. A lot is graded level ACROSS the street
       * and follows the street's fall ALONG it (a level pad against a
       * graded road is a step at one end of the lot and a trench at the
       * other) — but a building is not a plane, it is a box with a level
       * floor, so a front that spans `width` metres of a street falling at
       * `grade` stands half of `width * grade` clear of the ground at one
       * end and half of it buried at the other. Bounding the DIFFERENCE
       * rather than the grade is what makes a village on a hillside
       * possible: a nine-metre house takes a one-in-twelve street, and the
       * block of flats that would need eighty metres of it stands
       * somewhere else. */
      step: 0.4,
    },
    /** THE PLATFORM the whole town stands on: the street's own verge
     * level, held out past the deepest lot on each side and along the
     * whole frontage. `step` is how often the band's spine samples the
     * street, `margin` how much ground it keeps past a lattice cell's
     * worth beyond the last back wall, and `blend` how far past its rim
     * the country is eased back onto it. The lattice cell is the reason
     * the band exists at all — a lot's own pad is narrower than one, so
     * grading a disc per lot never reaches the drawn ground (`lattice.ts`)
     * — which is why `margin` is a margin ON a cell rather than a width of
     * its own. */
    platform: { step: 10, margin: 2, blend: 20 },
    /** How likely a town is to have each kind of building at all, and the
     * most of each it may have (a second one is half as likely as the
     * first, a third half as likely again). Houses fill in whatever is
     * left, and the shops stand in the middle of the town. */
    kinds: {
      villa: { chance: 0.9, max: 3 },
      apartments: { chance: 0.75, max: 2 },
      grocery: { chance: 0.9, max: 1 },
      post: { chance: 0.7, max: 1 },
      workshop: { chance: 0.65, max: 1 },
    },
    /** The cars outside: how many stand in front of each kind of building,
     * as a band, and the spacing between two along a front. */
    cars: {
      house: { min: 0, max: 2 },
      villa: { min: 1, max: 2 },
      apartments: { min: 2, max: 4 },
      grocery: { min: 2, max: 4 },
      post: { min: 1, max: 2 },
      workshop: { min: 1, max: 3 },
      /** A village has no barn (R37's farms do); the row is here so the
       * vocabulary's every kind has one. */
      barn: { min: 0, max: 0 },
      pitch: 3.2,
    },
  },

  /** R42 — THE CAR PARKS: where the crowd left its cars, and how it walked
   * in from there. Placed against the built world, from the stands (R27)
   * backwards: a stand needs a trail, the trail needs a car park, and the
   * car park needs a road to the outside world. */
  carPark: {
    /** How far a spectator will walk from the car to the stand, m — the
     * longest a trail may be, and how far from a stand a car park is
     * looked for. A rally crowd walks a few hundred metres in; it does not
     * walk a kilometre. */
    walk: 460,
    /** How far past a stand the road has to be committed before the stand's
     * car park is decided, m: every stand the same car park could also
     * serve exists by then, so a streamed stage decides the same clusters
     * however it was chunked. `walk` plus the longest corner a stand waits
     * on. */
    hold: 620,
    /** How far from a stand an existing PUBLIC road is looked for, m — an
     * abandoned arm past its barrier (R17, R36), a public road the route
     * never met (`publicroad.ts`), or an earlier car park's own lane. Past
     * this the car park drives a lane of its own out to one of them. */
    reach: 420,
    /** R17 + R42 — how many extra public roads are DRAWN FOR across the
     * country once the route is compiled (`layExtraRoads`), before the ones
     * the land and R23 refuse are thrown away.
     *
     * The search's own tarmac is one road across a medium map, and it
     * cannot be two: the route may not cross a public road, so a second
     * line laid before the search partitions the country it has left and
     * some seeds then generate at no sub-seed at all (`highwayCount` names
     * the one that proved it). Drawn AFTERWARDS the same lines cost the
     * search nothing — a candidate that runs into the route is thrown away
     * instead of routed around — and what they buy is the difference
     * between a country with a road network and a country with one road:
     * with a single line, two thirds of the corners on a stage sit in a
     * pocket no lane could reach a road from, and R42 puts no crowd at a
     * corner nobody could have driven to. */
    roads: 5,
    /** R42 — how far the pad stands from the ROUTE, m — at least, measured
     * to its centre.
     *
     * Nobody parks at the edge of a live rally stage. The cars are left
     * where the marshals let cars be left, which is a field somewhere off
     * the course, and the crowd walks the rest — and the walk in is most of
     * what being at a rally is. A pad sixty metres off the road, which is
     * what an unconstrained search finds every time (it is looking for the
     * NEAREST place the country will take), reads as a lay-by beside the
     * stage and puts twenty cars inside the distance a car leaving the road
     * covers.
     *
     * Under `walk`, with room to spare for a trail that has to wind round a
     * stream or a mound rather than run straight. */
    standOff: 200,
    /** THE PAD: the graded gravel the cars stand on, as a disc — how far
     * past the bay layout its rim reaches, how far past the rim the country
     * is eased back onto it, the steepest plane it may be graded to (m per
     * m: a field the cars are parked across, not a table cut into a hill),
     * how much the ground may differ from that plane across it (the plane
     * itself never stands over R31's cone — the terrain's own), the bare
     * country it keeps between its rim and the route's corridor, and how
     * far apart two pads have to be. */
    pad: { margin: 2.5, blend: 12, maxGrade: 0.09, level: 6, clear: 8, apart: 100 },
    /** R42 — HOW MANY PEOPLE ARRIVE IN ONE CAR. A rally crowd comes in
     * families and carfuls, not one to a seat: eight people at a corner is
     * three cars in the field behind it, and that is what a car park is
     * sized from. Both ends of the band are load-bearing, and they are the
     * two halves of one rule — the cars have to have been able to CARRY the
     * crowd (no fewer than `heads / max` of them) and the crowd has to have
     * been able to FILL them (no more than `heads / min`).
     *
     * The floor is two rather than one because a car park with a car per
     * spectator is a commuter station, and it is the shape the placer had
     * before this: twenty-four cars nosed into a pad behind a corner
     * eighteen people were standing at. */
    occupancy: { min: 2, max: 5 },
    /** THE BAYS: two rows nosed in either side of one aisle down the middle.
     * `pitch` is the width of one, `depth` how far it reaches back from the
     * aisle, `aisle` the aisle's width, and `spare` how many bays over the
     * cars actually parked the marshals bladed. How MANY bays there are is
     * not a dial — it is the crowd's head count divided by `occupancy`
     * (`carsFor`), because the whole point is that the two agree. `most`
     * is only a ceiling on the biggest bank of all, the finish. */
    bays: {
      most: 20,
      spare: { min: 0, max: 2 },
      pitch: 3,
      depth: 5.4,
      aisle: 6.5,
    },
    /** THE ROAD in: a lane's width of the country's loose surface, leaving
     * a public road SQUARE and running straight to the middle of the pad,
     * `approach` metres away — or, where there is no public road to leave,
     * leaving the pad and driven out to the edge of the map the way an
     * abandoned branch is (`buildSpur`). `maxGrade` is how steep it may
     * climb, `clear` the least room it keeps from any other road, and
     * `rim` the least run it has between the road's lip and the pad's rim
     * — the room it needs to climb onto the pad's plane at its grade. */
    road: { width: 5, approach: { min: 38, max: 64 }, maxGrade: 0.08, clear: 26, rim: 20 },
    /** THE TRAILS: a trodden path from the pad's rim to the back of each
     * stand it serves, this wide, walked in steps this long, never inside
     * the route's corridor and never through the water. */
    trail: { width: 1.3, step: 3, clear: 1.5 },
    /** THE SIGNS along a trail — an arrow board the crowd follows from the
     * cars to the stand: the first `first` metres up the trail from the pad,
     * then one every `pitch` metres. */
    sign: { first: 5, pitch: 70 },
  },
} as const;

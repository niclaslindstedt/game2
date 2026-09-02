// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stage generator's RULE BOOK. Every constraint that keeps a generated
// stage inside "rally reality" lives here as data, separate from the
// generator's search loop (generate.ts), so tuning the vocabulary never
// touches the algorithm and the tests can assert directly against the rules.
//
// The rules, in prose (each is enforced in generate.ts or realized in
// compile.ts, and asserted in tests/mapgen_test.ts):
//
//   R1  A stage opens with a straight — a start grid plus room to build speed.
//   R2  A finite stage closes with a straight — a visible finish, no blind
//       final turn. (An endless stage never closes.)
//   R3  Turns come in three severities with distinct radius/angle
//       vocabularies: soft (fast, open), medium (a real corner), and hard
//       (slow, tight — up to hairpin). It governs the corners the rally
//       DRAWS. A BORROWED public road (R17) is not drawn at all — it is a
//       line being tracked, and its bends are the road's own — so those
//       segments are outside the vocabulary, exactly as R5 already exempts
//       them from the same-direction run.
//   R4  A hard turn only follows a straight: there is always a braking zone.
//   R5  At most two consecutive same-direction turns — no endless spirals.
//   R6  Jumps sit on straights, with a clear run-up before the lip and a
//       landing zone after it; jumps keep a minimum spacing between lips.
//   R7  Water (a ford) sits on straights only, never in the landing zone of
//       a jump, and never on the opening or closing straight.
//   R8  Crests (blind brows) sit on straights and never combine with a jump
//       or a ford on the same segment.
//   R9  A finite stage's centerline stays inside its length's world bounds;
//       when the stage nears the boundary the generator must turn back
//       toward the middle. (An endless stage roams an unbounded world.)
//   R10 The centerline never crosses itself — non-adjacent parts of the
//       stage keep at least `minSelfDistance` between them. On an endless
//       stage the guarantee covers the trailing `endless.tailWindow` meters:
//       road further back than that is long gone behind the car.
//   R11 Total stage length lands inside the selected stage length's band.
//   R12 A ford sits in a dip: the road eases down to FLAT water and climbs
//       back out. Water never stands on a rise — it collects at a local low
//       point, fed by the stream that crosses the road there.
//   R13 A water crossing too wide to wade carries a BRIDGE instead of a
//       ford: the road stays level across it, the water runs in a ravine
//       below, and the deck is timber up to `bridge.timberMax` — past that
//       only concrete spans it. A concrete deck is WALLED: its parapet is
//       an unbroken run of solids down both edges, cast into the deck and
//       immovable, and it is the one wall on a stage that is there on
//       purpose — R31 cuts every other one away. A timber deck's rail is
//       posts and a rail, and a car goes through it.
//   R14 The inside of a sharp corner is GUARDED: a turn (or a combination)
//       that bends past `guard.angle` gets the ground between its entry and
//       its exit filled with a steep mound or a dense grove, so cutting
//       across the grass costs more than the corner does.
//   R15 Asphalt is not a SURFACE the stage puts on, it is a ROAD the stage
//       borrows. The public roads are laid across the country before the
//       route exists (R17), whole and end to end; a stage turns onto one,
//       runs on it for a while, and turns off again. So a sealed length is
//       always hundreds of metres long and never a chequerboard, and the
//       knobs' `asphalt` is what the route SPENDS on borrowing rather than
//       a share it paints on afterwards.
//   R16 The road has a CROSS-SECTION, and it is CURVED: five lines across
//       its width — a loose edge either side that nothing drives on, two
//       worn wheel tracks a real car's track apart, and the crown between
//       them — plus a berm of pushed gravel at its edges and a shoulder
//       that falls gently away to the landscape. No ditch — a trench beside
//       a rally road is a trap the eye reads as a scar, not as drainage.
//   R17 TARMAC IS LAID BEFORE THE STAGE IS. The public roads belong to the
//       country, not to the rally: they are drawn across the seed first,
//       whole, running off one edge of the map and out the other, and they
//       are where the houses and the towns will stand. THEN the rally road
//       is routed, and it may borrow one for a while — but it may never
//       WANDER ACROSS one (R36 says how it may cross), and half of a public
//       road may never turn to gravel because a stage went that way.
//       Where the two meet it is a planned junction, ON the centerline: the
//       route turns off (or onto) the road at a real corner, and the SEALED
//       road runs STRAIGHT THROUGH — the route's collinear arm on one side,
//       the arm it abandons on the other, same width, same surface, its
//       markings unbroken past the crossing. The dirt road is the MINOR
//       one: it arrives at an angle and its mouth FLARES, widening as it
//       closes on the tarmac the way every car that has turned out of it
//       has widened it, until its mat meets the main road's edge with no
//       country left between them. The ground they share is one graded
//       platform, their two verges merge into one band across it, and the
//       abandoned arm is taped shut and carries on to the edge of the map
//       STILL SEALED — because it was always the whole road, and a tarmac
//       road that turns to gravel in an empty field is a road that goes
//       nowhere. ONE surface change is not a junction, and R20 owns it:
//       where a seal reaches a corner no public road would have, the
//       surfacing runs out there instead.
//   R19 Turns are BANKED. A road built through a corner is superelevated so
//       water and cars both stay on it: the cross-fall rolls from the crown
//       into the turn over a runoff, tops out at `bank.max` for the
//       surface, and rolls back out again. Never a wall of a bank — this is
//       a country road, not a speedway.
//   R20 A JUMP never sits on sealed road, and neither does a HAIRPIN. A
//       tarmac section is a public road the rally borrows: nobody builds a
//       launch ramp into one, and a highway authority laying it out for
//       traffic that is not racing sweeps rather than doubling back. So the
//       sealed road takes no turn from R3's `hard` bucket — the tight stuff
//       is the rally's, and the rally's road is the gravel. Where a seal
//       reaches one anyway, the SURFACING RUNS OUT at the corner's start:
//       the one surface change on a stage that is not a junction, and the
//       exception R17 carries.
//   R21 The road's WIDTH is a dial: `knobs.width` runs from a narrow lane
//       the trees crowd to a broad boulevard with room to place the car.
//   R22 A stage is SHAPED as a sprint or as a CIRCUIT. A circuit's last
//       sample lands back on its first, on the same heading, so the start
//       line is also the finish line and the stage can be raced over laps:
//       the line leaves the grid, is steered around a ring by a bearing
//       that turns once through a full circle over the target lap, and is
//       closed onto the grid exactly by a solved turn-straight-turn.
//       Everything else — the vocabulary, R3 through R8, R10's
//       self-distance (measured cyclically), the features — is the sprint's.
//   R23 No two pieces of road share ground. The terrain lays its shelf under
//       ONE road, so a second corridor over the same country is left hanging
//       in the air with nothing under it and nothing to drive on. R10's
//       distance is therefore a floor, not the rule: the rule is `roadClear`,
//       measured centerline to centerline and sized from the road's own
//       width, and it binds the abandoned branches and the public roads
//       (R17) exactly as it binds the route. Its one exemption is a
//       JUNCTION, and a junction is a PLACE: inside `junction.parting` of
//       the point two roads meet at they ARE one road, and everywhere else
//       — including further along the same two roads — they are not.
//   R24 The START is a PLACE, not a line: the grid, the APRON of dirt behind
//       it, and `roadClear` of country around both belong to the start. On a
//       sprint the route may not come back into it and no branch may cross
//       it — a road floating over the start is the first thing a run ever
//       sees. A circuit closes onto its own start line by construction
//       (R22), so what it must not do is come at it ACROSS the apron; its
//       closure lies along it.
//   R25 A SPRINT's finish line is not the end of its road. It carries on
//       past the gate for a RUN-OUT — road the car coasts down after the
//       clock stops, so the finish is a line drawn across a road rather
//       than the cliff edge of a world that ran out of budget. A circuit
//       needs none: its finish is its own start line, with a whole lap of
//       road already the other side of it.
//   R26 Red-and-white KERBING is placed where a driver needs it and nowhere
//       else: on the inside of a corner at its apex, on the outside where
//       the corner unwinds onto a straight, on the outside of the braking
//       zone before a hard turn, and around a hazard. A rally road edged in
//       stripes from end to end is a bobsleigh run, not a road — and on
//       gravel the kerb is a run of marker posts, never a continuous
//       painted band (see docs/track-generator.md for the placement guide).
//   R27 A stage is WATCHED. Spectators gather where a rally crowd actually
//       gathers — at the finish, and at the corners worth standing at — on
//       ground clear of the road, on the OUTSIDE of the bend where nothing
//       leaving the road is coming at them.
//   R28 A stage is SPLIT INTO CHECKPOINTS, roughly a quarter-minute of
//       driving apart, and every one of them stands just past the EXIT of a
//       corner — the tighter the better. A checkpoint is both a split
//       (where the run is measured against whoever it is racing) and the
//       place a lost, drowned or crashed car is put back on the road, so it
//       belongs where the road has just asked the driver a question rather
//       than in the middle of a straight where it would cost nothing.
//       Preferred, not required: past `checkpoint.forced` gaps' worth of
//       road with no corner worth taking, a board goes down anyway. A
//       kilometre of borrowed public road (R17) sweeps and asks nothing,
//       and a stage with no split on it for a kilometre has a clock with
//       no shape.
//       EVERY BOARD IS A GATE, AND THE STAGE IS THE WHOLE OF THEM, IN
//       ORDER. A board counts when the car drives THROUGH it — across its
//       line, between its ends (`checkpoint.gate`), going the way the stage
//       goes — and the next one due is the only one a car can take, so the
//       boards are collected in the order they stand in. The finish line
//       does not end a run, and a circuit's start line does not book a lap,
//       until every one of them is behind the car: a stage cut short across
//       country is not a stage that was driven.
//   R31 The road and the ground beside it are RIDEABLE. Within a BENCH of
//       a road — the route's or an abandoned branch's — the landscape never
//       stands above that road's own corridor, and past the bench it may
//       only rise at a grade the car can climb. Whatever the country was
//       doing there is CUT where it would otherwise be a wall a car sliding
//       off the road stops dead against, or a hillside the ground lattice
//       drags up through the tarmac. The bench is a LATTICE CELL DIAGONAL
//       wide because that is the reach of the triangles the ground is drawn
//       and driven on: pin every corner that could sit over a road, and no
//       triangle can cut up through one.
//       What is cut is the LANDSCAPE. A cut is taken against the road the
//       ground is beside, and it never reaches in under a DIFFERENT road's
//       own shelf — one road's rideability is not a licence to hollow out
//       the ground another is standing on. Without that, a branch running
//       sixty metres away and twenty metres below took fourteen metres of
//       hillside out from under the route, and left its ribbon hanging in
//       the air with a vertical face down the side of it.
//   R34 Where a road meets ground it cannot go round, it is CUT THROUGH it,
//       and the face it is cut through is the face that ground would stand
//       at. R31 says the country beside a road may only rise at a grade a
//       car could climb, and taken alone that is a country with no rock in
//       it: every shoulder the road forces gets battered back into the same
//       gentle ramp, and a stage laid across mountains reads as a stage laid
//       across a lawn. So the grade R31 holds the country to is not one
//       number, it is the ANGLE OF REPOSE OF WHAT IS THERE:
//         · Deep till slumps. It is battered back to R31's own climb, and a
//           car that runs wide onto it comes back down onto the road.
//         · Rock stands. Where the cover is thin the face is left standing at
//           the rock's own angle, and it reads as what it is — a cutting,
//           with the bedrock showing, nothing rooted on it and stone at its
//           foot.
//       ...and how far it is worth blasting depends on what the road is
//       worth. A SEALED road is a public road somebody engineered: it holds
//       its line and takes the shoulder out of the way. A gravel road is
//       scraped in by a grader for the cost of the diesel, and a grader goes
//       ROUND — so an unsealed stage gets the shallow cut and the sealed
//       sections get the walls. `knobs.steepness` says how hard the country
//       is on both counts.
//       The BENCH is untouched either way: a cut face begins outside the
//       flat ground R31 keeps beside every road, so a car running wide has
//       the same room it always had before it reaches the rock.
//   R36 A stage may CROSS a public road, and the only way it may do it is
//       SQUARE. Not a junction: nobody turns. The gravel arrives at right
//       angles, goes straight over the tarmac and carries on out the far
//       side, so the two dirt roads meeting the seal lie exactly opposite
//       each other and what the map shows is a CROSSROADS — one road
//       passing over another, which is a place, rather than two junctions
//       that happened to land near one another. The tarmac is the road that
//       does not notice: full width, full surface, markings unbroken from
//       one side to the other.
//       R23 is not weakened by any of this, and the SQUARENESS is why. What
//       R23 forbids is two roads SHARING GROUND — a gravel road laid along
//       a sealed one, or dragged over it at a slant, leaves the terrain a
//       shelf it can only lay under one of them and the other hangs in the
//       air. A square crossing shares one PLACE and parts immediately: the
//       two dirt arms are collinear, so the gravel is off the tarmac's mat
//       within half a road width of the middle of it, and everywhere else
//       the clearance binds exactly as it always did. Crossing at an angle
//       is what would share ground, and it stays forbidden.
//       BOTH its arms are shut. A junction abandons one arm and the rally
//       drives up the other; a crossing abandons the road entirely, so the
//       public road is closed on both sides of the stage and a barrier
//       stands on each — the crossing is the one place on a stage where two
//       blocks face each other across the road the car is on.
//       And the tarmac STANDS PROUD. A public road is built up on a graded
//       formation and a rally track is scraped along the field beside it, so
//       the gravel climbs a short ramp onto the seal and drops off the far
//       edge — which at stage speed is a jump, and is the reason a road
//       crossing is a place a driver remembers. The step is the ROAD's, not
//       a feature laid on the route: the whole crossing is one level
//       platform standing `crossing.stand` above the country, and the ramps
//       either side of it are how the rally gets up there and back down.
//       R20 is not bent by that, and the geometry is what keeps it: what
//       R20 forbids is a LIP on sealed road, and a crossing's sealed part is
//       the flat TOP. The tarmac's own mat is the level table in the middle;
//       both ramps are gravel, and so is the far edge the car leaves. So the
//       one piece of this that throws a car is on the rally's own surface,
//       where every other jump on a stage is.
//   R37 The country is LIVED IN. Every so often — far between, never two in
//       sight of each other — a HOMESTEAD stands off the stage: a house on
//       its own graded yard, a car or two outside it, and a dirt drive that
//       comes down to the rally road and meets it SQUARE, the way a track
//       off a farm meets the road it was built to reach. Squareness is what
//       keeps R23 honest, exactly as it does for R36: a drive that ran
//       alongside the stage would be a second carriageway on the stage's
//       own shelf, a square one shares one place and parts at once. The
//       drive is a real road — the ground flattens a shelf under it, the
//       physics gives it gravel, the forest keeps off it — and it is shut
//       where it leaves the stage with whatever the marshals had on the
//       lorry, for the same reason a branch is: a driver arriving at a fork
//       must not have to wonder which way the rally goes. The house is on
//       gravel of its own that the drive runs onto, and the trees along the
//       drive are planted, not survived — a lane of them, on both sides,
//       which is the one shape of forest a stage has that somebody put
//       there on purpose. Nothing about a homestead may cost the route
//       anything: it goes where a straight, dry, gently graded piece of
//       country beside the road allows one, and where none does, there is
//       no homestead. It never stands on another road (R17's tarmac or a
//       branch), never in the water (R35), never beside a ford or a bridge
//       (R18's channel has to be seen past the road's edge), never on the
//       start's apron or inside the last stretch before the line, and its
//       walls and its parked cars are as solid as they look.
//   R38 The route never runs more than `straightRun.max` meters without a
//       corner in it. A stage is corners joined by straights, and the
//       straight is the joint — long enough to change up through the box
//       and pick a line into the next corner, and never long enough to
//       become somewhere the driver is going. The rule is about the RUN and
//       not the segment, because a straight followed by a straight is one
//       straight however the plan is written, and stringing them together
//       was how a stage ended up with four hundred metres of nothing in the
//       middle of it. A bend wider than `straightRun.bend` does not break
//       the run either: at rally pace that is a lean and not a corner, so a
//       kilometre of dead-flat public road is a straight no matter which
//       vocabulary drew it.
//   R39 TARMAC LEADS TO A TOWN. A public road (R17) was laid to reach
//       somewhere, and every so often the somewhere is on the stage: a
//       small town of ten to twenty buildings standing along the sealed
//       road, on both sides of it, each on its own graded lot with its
//       front to the street. It stands on the piece of tarmac the rally
//       BORROWS — so the stage runs straight through it between the walls
//       — or, where the stage only meets the road at a junction or a
//       crossing, along the arm the tape shuts, so the road the rally does
//       not take can be seen going somewhere. A town is a VILLAGE, not a
//       row of farms: most of it is houses, but it has what a farm has not
//       — a block of flats, a grocery, the post office, a workshop — and
//       the shops stand in the middle of it. The lots keep off the road's
//       own verge (R31's bench is still the bench), off every other road
//       (R23) and its junctions' platforms, out of the water (R35), and
//       clear of the homesteads (R37), which keep clear of them; the ground
//       is graded level with the street's edge under each one, and the
//       walls and the cars outside them are as solid as they look. One
//       town on a stage, because a town is a place and two of them in five
//       kilometres is a suburb.
//   R40 A STAGE IS BUILT IN A COUNTRY, and the country is a DIAL. The
//       biome (`knobs.biome`, `biomes.ts`) says what the land is made of
//       and how it stands, whether there is water in it, what grows on it
//       and in what company, and what the sky over it can do — as rows the
//       generator reads, never as a branch in it. The taiga is the country
//       every other rule was written against, and every multiplier in its
//       row is 1. The desert has no water at all: no groundwater that
//       surfaces, no basin that fills, no crossing on the route and no
//       river traced through one; its hollows flatten into pans instead,
//       its ranges are low, and the wind has piled its sand into dune
//       fields the road rides as a run of crests. A biome never switches a
//       rule off — a desert stage still obeys every one above — it moves
//       what the rules draw from, exactly as the other dials do.
//   R41 THE RAILWAY IS LAID BEFORE THE STAGE IS, like the tarmac (R17), and
//       the rally goes OVER it on a ramp. A country that carries one
//       (`biomes.ts`, `rail.chance` of its seeds) has a single track laid
//       across the map edge to edge on nothing but the seed and the bare
//       country, at a railway's radii, held off every road; the route plans
//       round it exactly as it plans round tarmac (R23), may never borrow
//       or join it, and may cross it once, SQUARE, by R36's own solve. The
//       crossing is a JUMP the organisers built: the gravel climbs
//       `rail.lip.height` metres over `rail.lip.ramp` of ramp to a lip
//       `rail.gap` short of the rails, and the road on the far side is at
//       grade — so a car arriving at pace flies over the line, and over
//       whatever is on it. A train IS on it, every so often: a timetable
//       drawn per crossing runs one through around the time a driver at
//       stage pace arrives and every `rail.train.period` after, each way in
//       turn, and the train is as solid as it looks and moving as fast as
//       it looks (`railway.ts`). A car that arrives slow lands on the rails
//       under it. Both arms of the line are cut to the edge of the map and
//       neither is shut: nobody drives a railway, and the crossing is
//       signed rather than taped.

import { isBiomeId, type BiomeId } from "./biomes.ts";

/** Sample spacing along the compiled centerline, meters. It lives here
 * because it is not only the compiler's business: a search that has to land
 * a road exactly on a point (R22's closure) must walk it the way the
 * compiler will, step for step. */
export const SAMPLE_STEP = 2;

export type TurnSeverity = "soft" | "medium" | "hard";
/** R22 — how a stage is laid out: a sprint runs from a start line to a
 * finish somewhere else; a circuit comes back to where it started, which is
 * what makes laps possible. */
export type StageShape = "sprint" | "circuit";
export type SegmentFeature = "none" | "jump" | "water" | "crest";
/** How a stage crosses water: wade through it, or span it. */
export type Crossing = "ford" | "timber" | "concrete";

/** The generator's DIALS — four numbers, each 0..1, that a player (or the
 * tooling) turns to ask for a different kind of stage. They never break a
 * rule: they move the ranges the rules draw from, and 0.5 on every dial is
 * the stage this generator built before they existed. */
export type StageKnobs = {
  /** How hilly: the rolling road profile's amplitude and the landscape's
   * relief around it. 0 is a plain, 1 is mountain country. */
  elevation: number;
  /** How wet: how often water crosses the road (and how wide, which is
   * what decides ford vs bridge), and how much of the nature is lake. */
  water: number;
  /** How forested: the density of the solid trunk field the car crashes
   * into. 0 is open heath, 1 is closed forest. */
  trees: number;
  /** The share of the road that is asphalt, 0..1 — grip, tighter lines,
   * and tire smoke instead of a gravel plume. */
  asphalt: number;
  /** R21 — how wide the road is, 0..1 across `roadWidth`'s band. 0 is a
   * narrow lane where the line is the only line there is; 1 is a broad
   * boulevard with room to throw the car at a corner and still be on the
   * road when it lands. */
  width: number;
  /** R34 — how STEEP the country stands. Not how HIGH it stands, which is
   * `elevation`: this is the angle the same relief is held at. At 0 the
   * ice has been over everything — long slopes, whaleback summits, fault
   * steps worn back into hillsides, and a road that is graded gently into
   * whatever it crosses. At 1 the rock keeps its faces, and where the road
   * has to go through a shoulder of it rather than round, it goes through
   * a CUT: a blasted face standing over the verge instead of a bank
   * battered back to something a car could climb. */
  steepness: number;
  /** R40 — which COUNTRY the stage is built in (`biomes.ts`). The one dial
   * that is a name rather than a number: it does not move a range, it says
   * which set of ranges — the taiga's lakes and spruce, or the desert's
   * dunes and saguaros — the other five are read against. */
  biome: BiomeId;
};

/** The numeric dials — everything in `StageKnobs` that is a position on a
 * band rather than the name of a country. What the menus put a row of
 * stops under and the URL readers parse as a number. */
export type NumericKnob = Exclude<keyof StageKnobs, "biome">;

export const NUMERIC_KNOBS: readonly NumericKnob[] = [
  "elevation",
  "water",
  "trees",
  "asphalt",
  "width",
  "steepness",
];

/** The default dial positions — the stage the rules built before the knobs
 * existed, so an un-knobbed call keeps its old character. */
export const DEFAULT_KNOBS: StageKnobs = {
  biome: "taiga",
  elevation: 0.5,
  water: 0.5,
  trees: 0.5,
  // Sealed road is a guest on a rally stage, not the host: a quarter of it
  // is enough for the tarmac sections to be an event, and the sim says
  // that is about what the stage's drift time can pay for.
  asphalt: 0.25,
  // The width the stage vocabulary — turn radii, the bot's line, the drift
  // tuning — was measured against.
  width: 0.55,
  // Middling country: rock faces where the road has to force a shoulder,
  // worn slopes everywhere it does not.
  steepness: 0.5,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0;
}

/** Fill in and clamp a partial set of dials. Every entry point takes
 * `Partial<StageKnobs>` and runs it through here, so a knob is always a
 * number in 0..1 by the time any rule reads it. */
export function resolveKnobs(knobs?: Partial<StageKnobs>): StageKnobs {
  return {
    // A biome this build does not know — a stale URL, a save from another
    // version — is the taiga, which is the country every seed was built in
    // before there was a choice.
    biome: isBiomeId(knobs?.biome) ? knobs.biome : DEFAULT_KNOBS.biome,
    elevation: clamp01(knobs?.elevation ?? DEFAULT_KNOBS.elevation),
    water: clamp01(knobs?.water ?? DEFAULT_KNOBS.water),
    trees: clamp01(knobs?.trees ?? DEFAULT_KNOBS.trees),
    asphalt: clamp01(knobs?.asphalt ?? DEFAULT_KNOBS.asphalt),
    width: clamp01(knobs?.width ?? DEFAULT_KNOBS.width),
    steepness: clamp01(knobs?.steepness ?? DEFAULT_KNOBS.steepness),
  };
}

/** Read a knob onto a `{ min, max }` band — the one way a dial ever
 * reaches a rule. */
export function knobScale(knob: number, band: { min: number; max: number }): number {
  return band.min + (band.max - band.min) * knob;
}

/** The menu's stage lengths. The finite ones map to a length band sized for
 * the target minutes at measured bot pace; `endless` streams new sections
 * from the seed for as long as the run lasts. */
export type StageLength = "short" | "medium" | "long" | "xlong" | "endless";
export type FiniteStageLength = Exclude<StageLength, "endless">;

export const STAGE_RULES = {
  /** R11 — the length bands, meters, and the world half-extent (R9) each is
   * searched inside. Bands are sized from the sim's measured bot pace
   * (~95–105 km/h on the current vocabulary) so the menu's minutes come out
   * roughly true: 1 / 3 / 5 / 7 minutes of driving. Bigger stages get a
   * bigger world so the search folds the line instead of fighting the
   * boundary. */
  stageLengths: {
    short: { minutes: 1, band: { min: 1450, max: 1800 }, worldBound: 900 },
    medium: { minutes: 3, band: { min: 4400, max: 5200 }, worldBound: 1500 },
    long: { minutes: 5, band: { min: 7400, max: 8400 }, worldBound: 2000 },
    xlong: { minutes: 7, band: { min: 10400, max: 11800 }, worldBound: 2500 },
  },

  /** The endless stage: sections stream ahead of the car forever. `horizon`
   * is how much compiled road is kept ahead of the car; `tailWindow` is how
   * far back the self-distance guarantee (R10) reaches — road behind that is
   * out of sight and out of the search's memory, which is what lets the
   * stream run in a bounded working set. */
  endless: {
    horizon: 700,
    tailWindow: 1200,
    /** How much road the very first compile materializes, meters — enough
     * that the grid never sees the world being built. */
    initial: 1100,
    /** The stream is point-to-point: it follows a course bearing that
     * random-walks by up to `courseDrift` radians per segment, and the
     * road's heading stays within `maxCourseError` of it (turns that would
     * stray further are steered back). That forward pull is what keeps an
     * unbounded walk from curling into its own tail — and what makes an
     * endless run read as a journey rather than a scribble. The error
     * budget still clears a 150° hairpin. */
    courseDrift: 0.12,
    maxCourseError: 2.6,
    /** How far the search runs ahead of the road it hands out. Only plans
     * this far behind the generation frontier are final; inside the lag the
     * stream may still backtrack out of a pocket, exactly like the finite
     * search — the one escape hatch an infinite road cannot live without. */
    commitLag: 900,
    /** R35 — how many failed placements in a row the stream tries before
     * giving the water another rung of its setback. The finite search gets
     * to throw a whole attempt away and start again; a stream has to get
     * past whatever is in front of it, so it squeezes instead. Small
     * enough that a genuine bottleneck is through in a few backtracks,
     * large enough that ordinary boxing-in is solved by backtracking
     * rather than by walking to the water's edge. */
    wetPatience: 12,
  },

  /** R22 — the circuit. A lap is the stage length's band divided by the
   * laps a circuit is raced over, so "medium" means the same three minutes
   * of driving whichever shape it is built in — with a floor, because a
   * ring shorter than that is a roundabout and not a race track.
   *
   * The search steers the line around a ring by a bearing that turns once
   * through a full circle over `target` meters (radius `target / 2π`), then
   * CLOSES it: from `closeFrom` of the way round, every iteration tries to
   * solve a turn-straight-turn back onto the grid's own pose. The solve is
   * exact — it lands on the start line to the millimeter — so the only
   * question is whether the corners it asks for are ones this generator
   * would have drawn anyway, which is what `closeRadii` and R3's own angle
   * bands decide. */
  circuit: {
    /** Laps a circuit is raced over, and the divisor the lap band uses. */
    laps: 3,
    /** Shortest lap worth building, m. */
    minLap: 1150,
    /** How far round the ring before the line stops following the ring
     * bearing and starts being steered at the grid itself. The CLOSURE is
     * not gated on this — it is tried wherever one could land inside the
     * band — but a line that never turns for home rarely gives it the
     * chance. */
    homeFrom: 0.7,
    /** How many radii per severity the closure is solved at. The radii
     * themselves come out of `turn` — a closing corner is drawn from the
     * same vocabulary as every other corner (R3), and the solve's job is
     * to find a place on the lap where one of them fits. */
    closeRadii: 3,
    /** The straight between the closure's two arcs. The ceiling decides how
     * far from the grid a closure can be solved at all, so it is also the
     * one number that says how often a lap manages to shut.
     *
     * It is R38's cap (`straightRun.max`), and it used to be 380. A lap
     * does want a main straight — somewhere to pull top gear down before
     * the line — but the closure is not where it comes from: a straight
     * that long is a runway bolted onto the end of the lap, and it is the
     * one the driver meets on every single lap. What a circuit gets
     * instead is the closing straight and the grid's own opening run at
     * the line, which are R1's and R2's and are a start-finish straight by
     * design. */
    closeStraight: { min: 25, max: 135 },
  },

  /** R1/R2 — opening and closing straights, meters. */
  openingStraight: 110,
  closingStraight: 80,

  /** R1 — and what the opening straight has to be long enough FOR. A rally
   * start is one car and needs nothing; a HEADS-UP start is the whole field
   * stood on the apron behind the gate, and the back row is `startZone.apron`
   * metres further from the first corner than pole is. So the road off the
   * line has to hold the grid's own depth plus a run for it to string out
   * on, and the first corner may not be a slow one — sixteen cars arriving
   * at a hairpin still stacked is a pile-up, not a start.
   *
   * `launch` is the run measured from the GATE (the apron is behind it and
   * is added on top); the opening straight is drawn at least this long.
   * `firstTurn` is the tightest severity the corner at the end of it may be
   * drawn from. */
  launch: { run: 150, firstTurn: "soft" as TurnSeverity },

  /** R25 — the RUN-OUT: road built past a sprint's finish gate, meters. The clock
   * stops at the line and the car keeps going, so there has to be
   * somewhere for it to go. Long enough to shed rally pace without using
   * the brakes as a wall — a car crossing at 50 m/s coasts to walking pace
   * in well under this — and long enough that the road still reaches the
   * horizon in the shot the finish is watched from, which is what stops
   * the gate reading as the end of the world. It is NOT part of the raced
   * stage: R11's length band measures the road up to the line. */
  runOut: 220,

  /** Straight vocabulary, meters. Short breathers between corners are the
   * norm; the long bucket is where the top gears live, drawn less often so
   * the stage reads as corners connected by straights rather than the other
   * way around. The long bucket's ceiling is R38's cap — the longest
   * straight the vocabulary may draw is the longest run the route may
   * make. */
  straightShort: { min: 30, max: 70 },
  straightLong: { min: 100, max: 135 },
  longStraightChance: 0.4,

  /** R38 — THE STRAIGHT RUN: the most road the route may cover without a
   * corner in it.
   *
   * `max` is stated in METRES because that is what the search can count,
   * but the number behind it is a TIME: five seconds, which is as long as
   * anyone wants to sit holding a wheel that is doing nothing. Metres come
   * out of seconds through the speed the road is met at, and the binding
   * case is not the fast one — it is a straight taken OUT OF A SLOW CORNER,
   * where the car spends the first half of it accelerating. So the cap is
   * set by the slow case and the fast case comes in well under it.
   *
   * MEASURED, on the analyzer's reference profile over seeds 1-24 at
   * medium: at 145 m the slowest exits ran to 5.0-5.1 s and seven runs on
   * six seeds sat over the line; at 135 the worst anywhere is 4.9 and
   * nothing is over. It is the ceiling of the long straight bucket too —
   * the longest straight the vocabulary may draw is the longest run the
   * route may make — and it clears everything a straight has to be long
   * enough to CARRY: a jump with its run-up and landing (`jump.minStraight`
   * is 107), a crest, a bridge, and R36's passage over a public road.
   *
   * It is a RUN and not a segment. Two straights drawn back to back are one
   * straight to the person driving them, and stringing four of them
   * together is how a stage came out with four hundred metres of nothing in
   * the middle of it — every one of them legal on its own.
   *
   * `borrowed` is the same five seconds on TARMAC (R17), and it is longer
   * because the road under it is faster: a sealed stretch is entered off a
   * junction the car takes at speed and held at speed, where a gravel
   * straight is most often taken out of a corner the car has had to stop
   * for. One rule, one budget in seconds, two proxies for it in metres,
   * each measured against the speed its own road is driven at — and the
   * check in `analysis/drive.ts` reads the clock on both, so neither proxy
   * can drift away from the rule it stands in for.
   *
   * It is also what makes R17 possible at all. A public road is not a
   * rally stage: it is laid to get somewhere, and it runs straight for two
   * or three hundred metres at a time between its bends whatever the
   * generator does. At 135 m the rally could borrow almost nothing —
   * measured over seeds 1-8 at long, 95% of every stretch the search
   * looked at was refused and the `asphalt` dial stopped buying tarmac.
   *
   * `bend` is how wide a corner may be and still count as one, m. Under it
   * the road breaks the run; over it the run carries straight on through
   * the bend. The rally's own vocabulary never draws anything near this
   * wide (a soft turn tops out at 100 m), so the number is there for the
   * borrowed road: one of those bends at 220 m at its tightest and runs
   * arrow-straight for kilometres at its loosest, and only the second of
   * those is a straight. `ANALYSIS.drive.straightRadius` measures the
   * built stage against the same radius, for the same reason. */
  straightRun: { max: 135, borrowed: 220, bend: 700 },

  /** R3 — turn vocabulary: radius in meters, angle in radians. Soft turns
   * are taken flat-out or near it; mediums are real corners that ask for a
   * lift and a line; hards are the drift moments — down to proper hairpins
   * (the angle ceiling is ~150°). */
  turn: {
    soft: {
      radius: { min: 55, max: 100 },
      angle: { min: Math.PI / 6, max: Math.PI / 2.4 },
    },
    medium: {
      radius: { min: 32, max: 55 },
      angle: { min: Math.PI / 4.5, max: Math.PI / 1.6 },
    },
    hard: {
      radius: { min: 13, max: 30 },
      angle: { min: Math.PI / 3.2, max: Math.PI * 0.85 },
    },
  },

  /** Severity mix for a drawn turn. Hard needs the braking zone a preceding
   * straight provides (R4); when the previous segment is a turn, the hard
   * share re-rolls as medium so the corner density survives without an
   * unbrakeable ambush. The remainder is soft. */
  severityChance: { hard: 0.45, medium: 0.32 },

  /** R5 — cap on same-direction turns in a row, and on how much heading a
   * same-direction run may accumulate. The angle cap kills near-loops
   * before the self-distance probe has to: two tight turns summing much
   * past a half circle curl the line back onto itself, which R10 would
   * reject anyway after the geometry is built and probed. */
  maxSameDirectionTurns: 2,
  maxSameDirectionAngle: Math.PI * 1.15,

  /** R21 — road width, meters (full width; centerline to edge is half).
   * The `width` dial reads this band: the low end is a real country lane,
   * where the road is the only line and a corner is a commitment; the high
   * end is an arcade boulevard with room to place the car sideways and
   * still land on tarmac. The default position (0.55) is the width the
   * turn vocabulary and the drift tuning were measured against, so moving
   * the dial changes the stage's character and not its rules. */
  roadWidth: { min: 9, max: 22 },

  /** Rolling elevation, laid under the feature ramps: seeded value NOISE
   * summed over a few octaves along arc length, so no two hills on a stage
   * are the same shape and none of them repeat. Sine layers do repeat —
   * every rise identical to the last — and a layer shorter than a few dozen
   * meters is not a hill at all but a washboard, a grade that flips sign
   * every ripple across a road sampled every 2 m. Hence: one amplitude, one
   * length, and octaves that only ever get SMALLER than it. Per-stage
   * character is drawn from these ranges, so a seed can be near-flat or
   * genuinely hilly. Applied to GENERATED stages only — synthetic test
   * tracks stay flat rigs. */
  elevation: {
    /** Height of the longest wave, meters (peak to trough is twice this).
     *
     * A word about what this band is NOT for, because it looks like the
     * knob to reach for and it is not. How far the road actually travels up
     * and down over a kilometre is dominated by `follow` below — the
     * COUNTRY the road is laid along — and this noise is the road's own
     * character riding on top of it. Measured on seeds 1-8 at medium, the
     * roll contributes about 5 m/km against the country's 29, and raising
     * the band by half moved a stage's total travel by under a metre per
     * kilometre while pushing the road's crossings far enough off the
     * ground to float R18's watercourses. Reach for `follow.lag` instead:
     * that is the number that says how much of the country reaches the
     * road, and it moves the answer. */
    amplitude: { min: 3, max: 7 },
    /** Length of that longest wave, meters. */
    wavelength: { min: 450, max: 750 },
    /** How many further octaves ride under it, each half as long... */
    octaves: 4,
    /** ...and this much of the amplitude. Well under 0.5, so the shorter the
     * wave the gentler its grade — that is what keeps the road rolling
     * rather than rippling. */
    roughness: { min: 0.28, max: 0.38 },
    /** The `elevation` knob multiplies the amplitude by this band — a flat
     * dial still rolls a little (a billiard table is not a rally stage),
     * a full one doubles the hills the road climbs. */
    knob: { min: 0.4, max: 2 },

    /** R34 — and what the roll RIDES ON. A road is not a profile somebody
     * drew and then laid on a country: it is laid ALONG the country, down
     * the valleys, and it climbs only where it has to get over something.
     * The rolling noise above is the road's own character on top of that,
     * not the whole of its height.
     *
     * So the road follows the bare landscape, through a lag and two clamps
     * — which between them are what a road IS. The lag is a road builder's
     * eye: it takes the broad shape of the country and ignores every
     * hummock, so the road runs level across ground that is not. The clamps
     * are what anything is willing to drive over. Where the country is
     * gentler than they are the road simply follows it; where it is not the
     * road cannot, and the difference is CUT AND FILL — the embankment
     * across a hollow and the cutting through a shoulder, which is where
     * R34's rock faces come from and the only place they come from.
     *
     * All three are causal and per-step, so an endless stage streams
     * through this unchanged and a stage is still a pure function of its
     * seed.
     *
     * `lag` is the response length, m — AND IT IS THE STAGE'S UNEVENNESS,
     * which is not obvious and is worth stating where somebody looking for
     * that knob will find it. How much the road travels up and down is
     * almost entirely how much of the country reaches it, and this is the
     * number that decides that: it is the eye of the man who laid it out.
     * Long, and he is a highway engineer running a graded line across the
     * landscape and reading nothing under a quarter of a kilometre — a
     * road that is smoother than the ground it is on, everywhere, which
     * over a whole stage reads as a ribbon laid on a picture of a country.
     * Short, and he is following the ground with a bulldozer, and the road
     * rises and dips with every shoulder and hollow it crosses.
     *
     * MEASURED. Over seeds 1, 3 and 7 at medium the road's total travel is
     * 30 / 56 / 33 m per km at 200, 39 / 52 / 41 at 120, and 48 / 64 / 47
     * at 70. 120 is where the road is plainly following the country
     * without the cut and fill (and the analyzer's ground findings) that
     * comes with hugging every hummock of it. `analysis/drive.ts`'s
     * `rolling` check is what holds it there.
     *
     * `grade` is the gradient, and has to leave room under
     * `ANALYSIS.drive.grade` for the rolling noise riding on top of it,
     * which is where the rest of that budget goes — the two ADD, and a
     * follower given the whole budget puts every stage over it.
     *
     * `crest` is the VERTICAL CURVATURE, per m: how fast the gradient
     * itself may change. It is the clamp that stops the road being a ramp.
     * A gradient limit alone says nothing about the corner between two
     * gradients, so a follower that ran up to its cap and straight back
     * down built a brow at every hilltop the country had — the sim came
     * back with air time nearly doubled and three cars in the field wrecked
     * on the landings. Lengthening the lag fixes that by refusing to follow
     * the country at all, which takes the cuttings with it; this fixes it
     * where it happens. It is a real road-building number too: this is the
     * vertical curve every crest on a road is designed around, and 0.0035
     * is a radius of about 280 m.
     *
     * `freeboard` is the one thing the road refuses to follow the country
     * into: the water. A road builder goes round a lake or builds a
     * causeway over it, and never lays a carriageway on a lake bed — so
     * the height the road follows is the ground or this far over the water
     * table, whichever is higher, and low ground crossed at that height
     * comes out as the embankment it should be. Without it a stage that
     * routes across a tarn drives along the bottom of it. */
    follow: { lag: 140, grade: 0.075, crest: 0.004, freeboard: 3.5 },
    /** R34 — how far the road may stand OFF the country it crosses, m: up
     * on fill, down in cut. The lag and the grade clamp say how fast the
     * road may follow the land; nothing said how far behind it was allowed
     * to get, and over ground that falls away faster than the clamp lets
     * the road descend, the answer was as far as it liked.
     *
     * That is what builds a road flying thirty metres over a hollow with a
     * sixty-degree side, which is not an embankment — it is a wall the car
     * goes over and does not come back from. The terrain cannot fix it
     * either way round: hold the fill up and it is a mesa, let it go and
     * the road hangs in the air.
     *
     * Measured rather than guessed. Over 24 seeds the fill a stage
     * actually needs is 6.7 m at the median and 18.2 m at the ninetieth
     * percentile — and then a tail running to 68 m, which is a viaduct
     * nobody asked for. The cap sits above the ninetieth so ordinary cut
     * and fill is untouched and only the tail is refused; the search then
     * draws a different line, which is what it is for. */
    maxFill: 22,
    maxCut: 24,
    /** ...and how the cap RELAXES when a country will not yield a stage
     * inside it, the way the water's setback does. Some countries are all
     * ridge and ravine, and a stage has to cross them somehow; the last
     * rung is no cap at all, which is where this rule started. */
    fillLadder: [1, 1.7, 3, 0],
  },

  /** R32 — THE GROUND, IN LAYERS. What the country beside the road is made
   * of, laid in the order it was made: rock, then the water in it, then the
   * soil on top. `geology.ts` builds the field; these are its numbers, and
   * every one of them is in meters unless it says otherwise.
   *
   * The single most important number here is `smoothness`. It is drawn per
   * seed rather than read off a dial, because it says which COUNTRY a stage
   * is in — how long the ice sat on it — and that is not a slider anybody
   * was asked about. At the low end the rock keeps its sharp crests, its
   * cliffs and its fine grain; at the high end it is planed into whaleback
   * summits, filled valleys and worn-back slopes. */
  geology: {
    /** How glacially planed a country may be, 0 (alpine) to 1 (shield).
     * Neither end is reached: a stage with no texture at all reads as a
     * heightmap, and one with nothing worn is a set of teeth.
     *
     * The band is what `steepness` moves (see `steep` below); the position
     * INSIDE it is still drawn from the seed, because a stage is set
     * somewhere and the dial only says which countries the seed may land
     * in. This pair is the worn end, held for `steepness` 0. */
    smoothness: { min: 0.5, max: 0.95 },

    /** R34 — where the `steepness` dial reaches into the rock.
     *
     * `sharp` is the smoothness band at the top of the dial: the ice barely
     * touched this country, so it keeps its crests, its fine grain and its
     * fault steps as cliffs. Reading between the two bands rather than
     * replacing one number with a dial is what keeps `smoothness` a
     * per-seed property — every dial position still builds a range of
     * countries, it just builds a different range.
     *
     * `rise` is the same dial on the SIZE of the relief, because sharp
     * country does not only hold its slopes steeper, it stands them
     * higher: the same escarpment the ice would have worn into a hillside
     * is a hundred-foot step where it did not. */
    steep: {
      sharp: { min: 0.08, max: 0.5 },
      rise: { min: 0.85, max: 1.45 },
      /** ...and how much steeper the ground BESIDE THE ROAD is allowed to
       * lean at the top of the dial — the per-side embankment grade in
       * `terrain.ts`, which is what actually stands a hillside up next to
       * the car. A multiplier on the rising half of the band only: the
       * falling half is a drop off the road's shoulder, and how far a car
       * that goes over the edge falls is not what this dial is about. */
      bank: { min: 0.8, max: 1.9 },
    },

    /** How much of the finest octave the ice planes off at full
     * smoothness — the grain that separates a weathered hillside from a
     * scoured one. */
    grain: { planed: 0.72 },

    /** The mountain's height band across the smoothness range: sharp
     * country stands its crests higher than the shield does, and the two
     * crest SHAPES (a cube against a smoothstep) do the rest. */
    mountain: { tall: 1.3, planed: 0.5 },

    bedrock: {
      /** The broad swell of the country — the wave a stage crosses two or
       * three of. `amp` is peak to trough. */
      swell: { scale: 430, amp: 54 },
      /** Hills riding on it. This is the layer a DRIVER reads: the swell is
       * slower than a stage is long, and the grain is finer than a corner,
       * so a hill you crest and a hollow you drop into is this one and
       * nothing else. It is deliberately short and tall enough to hold a
       * real grade — a country whose only shape is its swell is the country
       * you can see clean across, which is a rare view even on a plain. */
      hills: {
        scale: 130,
        amp: 21,
        /** The step the hills' own GRADIENT is differenced over, m, and the
         * grade at which the ground it describes counts as fully scoured.
         *
         * This is the only derivative `geology.ts` pays for, and it is not
         * optional. Every other steepness term in the module comes free off
         * a smoothstep — a mountain flank, an escarpment face, a pit's rim
         * — but value noise hands back nothing, and the hills are the layer
         * that carries the grade a driver actually reads. Without it the
         * soil model cannot see the slopes it is supposed to strip, and the
         * analysis quite correctly reports two metres of till lying down
         * the side of every hill on the map. */
        grade: 26,
        steep: 0.55,
      },
      /** ...and the fine grain the ice takes away. */
      grain: { scale: 46, amp: 4.5 },
      /** Where a mountain chain stands (`from` is the share of the mask
       * below which there is none) and how high its crest gets. */
      mountain: { scale: 1150, from: 0.57, height: 72 },
      /** ...and where its crest RUNS. */
      ridge: { scale: 300 },
      /** The fault steps: a wandering line the ground drops over. `span`
       * is how much of the noise the step is spread across — narrow is a
       * cliff, wide is a hillside, and the smoothness reads between them. */
      escarpment: { scale: 520, from: 0.52, span: { min: 0.042, max: 0.22 }, rise: 15 },
      /** The sea basins: broad hollows sunk under the lake table. `wetter`
       * and `deeper` are what the `water` dial adds to each. */
      /** `wetter` and `deeper` are what the `water` dial adds. Both are
       * modest: `from` is a THRESHOLD ON AN AREA, so a tenth off it is a
       * large share of the map turning to sea, and at the top of the dial
       * the land has to still be land. */
      basin: { scale: 1600, from: 0.86, span: 0.34, depth: 30, wetter: 0.18, deeper: 20 },
      /** ...and the ponds, on a tighter scale — the tarns and lakes the
       * road runs past rather than over. */
      pond: { scale: 340, from: 0.9, span: 0.1, depth: 10, wetter: 0.05, deeper: 8 },
      /** Where sea level sits relative to the rock's own zero. */
      datum: -6,
    },

    /** The groundwater. The table is the broad shape of the land dropped by
     * `depth`, plus `drain` times how steep the ground is — steep ground
     * sheds its water and stands dry, flats and hollows hold theirs and go
     * to bog. Where the table comes up through the surface the ground is
     * WET, which is what a mire is. */
    groundwater: { depth: 4.5, drain: 42 },

    /** THE PITS — the hollows that hold standing water, and the whole
     * reason a landscape has lakes in it rather than only rivers.
     *
     * They come in three sizes because the water bodies they make are three
     * different things, and the difference is not scale but the SHAPE of
     * the hollow. A pit's floor is cut toward the water table, so how far
     * BELOW that floor lands is what decides what fills it:
     *
     *   `mere`  broad and barely under the table — a wide sheet of shallow
     *           water, which is a SWAMP. Reeds and sedge stand in it, you
     *           can see the bottom, and a car can wade it. The shallowest
     *           of the three and by far the widest.
     *   `tarn`  a few hundred metres across and properly deep — a lake.
     *   `pool`  small and deep: a kettle hole, a flooded quarry, the pond
     *           at the bottom of a field.
     *
     * `from` is the share of the noise below which no pit forms (so it sets
     * how much of the country is pitted), `span` how sharp the rim is, and
     * `depth` how far under the table a fully-formed floor sits.
     *
     * A pit only forms where the water table is ALREADY near the surface:
     * flat lowland. A hollow gouged into a mountainside drains, and one cut
     * on a summit is a crater. `flat` is how steep the ground may be before
     * it stops holding water, and `lowland` how far above the table the
     * ground may stand before pits fade out entirely, m. */
    pits: {
      mere: { scale: 620, from: 0.76, span: 0.22, depth: 0.55 },
      tarn: { scale: 300, from: 0.8, span: 0.12, depth: 7 },
      pool: { scale: 110, from: 0.86, span: 0.09, depth: 4.5 },
      flat: 0.3,
      /** How far above the lake table the ground may stand before pits stop
       * forming, m. It is a SMALL number on purpose: the country's own datum
       * sits only a few metres over the table, so a generous reach makes
       * almost every flat hectare on the map eligible and a wet dial then
       * drowns the lot. Pits belong in the genuinely low ground. */
      lowland: 13,
      /** How much the `water` dial opens the thresholds. Small, because the
       * thresholds are the share of the map that is pitted and the dial is
       * multiplying an area: a tenth here is already the difference between
       * a stage with a tarn on it and a stage in an archipelago. */
      wetter: 0.06,
      /** Depth below the water table under which standing water is a SWAMP
       * rather than a lake, m: shallow enough to see the bottom of, to
       * grow reeds in, and to drive through. */
      swamp: 1.2,
    },

    /** R35 — SITING. Where in the country the stage's own origin lands.
     *
     * A stage starts at (0, 0) and no search chooses that point: the route
     * is drawn outward from it. So where the seed's country happens to put
     * a sea basin there, the start line is in a lake and every metre of
     * road leaving it is an embankment — which is what a stage looked like
     * on nearly half of all seeds before the country was allowed to move
     * under the stage instead.
     *
     * It is a SEARCH over the country, not a nudge: the origin walks out
     * along a spiral until it finds ground standing clear of the water
     * across the whole footprint a start needs, and the country is read
     * from there. Deterministic and rng-free, so a seed's landscape is the
     * same landscape it always was — sampled from a spot a stage can start
     * on. */
    siting: {
      /** How much dry ground the start needs around it, m — the apron, the
       * grid, and the run down to the first corner. */
      reach: 210,
      /** How far clear of the water that ground has to stand, m: the
       * road's own freeboard, plus enough that a shoreline is a view from
       * the grid rather than something the front row is parked in. */
      freeboard: 6,
      /** How far the origin may walk to find such a place, m, and in what
       * steps. A basin is a kilometre or two across, so the walk has to be
       * able to leave one; past `far` the country has no dry ground worth
       * the search and the driest spot found is taken. */
      step: 120,
      far: 2600,
      /** How many points the footprint is judged on: `rings` rings of
       * `ring` points out to `reach`. Enough to catch a shore cutting
       * across the apron, cheap enough to run a few hundred times. */
      ring: 8,
      rings: 3,
    },

    /** The soil lying on the rock. Till and washed sediment: it collects
     * where water slows down and is stripped where it does not, so the
     * flanks and the escarpment faces come out bare and the valley floors
     * come out deep. Trees need it, big rocks only surface where it is
     * thin, and bare rock carries moss and grass and nothing with a root. */
    soil: {
      /** Deepest the cover ever gets, m. */
      max: 3.2,
      /** How far below the country's broad shape counts as a full hollow,
       * m — the depth over which the till gets from thin to deep. */
      hollow: 14,
      /** The patchiness of the cover: its noise scale, and the least of it
       * a patch may keep, so nowhere is scoured to nothing by chance
       * alone. */
      patch: { scale: 210, min: 0.3 },
      /** Height above which the ice scoured the ground bare, m, and the
       * band it does it over — the treeline, in effect. */
      alpine: { from: 46, over: 40 },
      /** How much a glaciated country moves off its highs and into its
       * hollows, over and above what slope alone does. */
      glacial: 0.5,
      /** Subtracted from the surface so that adding a soil layer does not
       * raise the whole country by its own mean depth — the water table
       * and every number tuned against the old ground stay where they
       * were. Half of `max`, which is roughly what the cover averages. */
      datum: 1.6,
    },
  },

  /** R33 — a gravel road is NOT SMOOTH, and a sealed one is.
   *
   * The difference is how they are built. Tarmac is LAID: a paving machine
   * leaves a plane, and a plane is what it should be — a sealed section of a
   * rally stage is a public road the event borrowed, and it reads as one
   * precisely because it is the smooth part. Gravel is BLADED, and then
   * driven on, frozen, thawed and bladed again, and what that leaves is not
   * a rougher plane: it is a good surface with things wrong with it HERE AND
   * THERE. A frost heave. A hollow worn at a corner exit. A stone the blade
   * rode over.
   *
   * So the model is sparse, not continuous. A continuous grain — noise added
   * along the whole stage — is a washboard however small you make it, and it
   * is wrong in the same way an evenly-sprinkled forest is wrong: real
   * defects come in ones, with clean road between them.
   *
   * Every bump is MARGINAL by design. A hand's height is what the car
   * notices as a road with a surface; half a metre is a pothole, and a
   * generator that scatters potholes has made a different and worse game.
   *
   * THE BAND THIS COVERS IS THE POINT, and it is why the numbers are wider
   * than "a bump" sounds. The road's own rolling profile
   * (`elevation.wavelength`) is hundreds of metres long and the country it
   * follows is longer still, so between those and a stone under the blade
   * there was NOTHING: no shape at the ten-to-thirty-metre scale, which is
   * exactly the scale a car reads as the road being uneven. A road with
   * long hills and a clean surface between them reads as a ribbon somebody
   * extruded, however far it climbs. So a defect here runs from a couple of
   * metres — a stone, a scour — up to a frost heave the length of a house,
   * which is what real frost heaves are. */
  roughness: {
    /** One candidate bump per this much arc, m, and the chance it is there.
     * Together they set the spacing: at 14 m and a bit under a half, a bump
     * every thirty metres or so of gravel, which is a road you can feel
     * without a road that is fighting you. */
    cell: 14,
    chance: 0.45,
    /** How proud or how sunk one is, m — a heave or a hollow, either sign.
     * The ceiling is the number that keeps this a surface rather than an
     * obstacle: at the long end of `halfWidth` it is a grade of two per
     * cent, which the car breathes over, and at the short end it is the
     * lip of a scour. */
    height: { min: 0.03, max: 0.14 },
    /** ...and how long it is, m (half-width, so a bump is twice this end to
     * end). Longer than the sample spacing by enough that the compiled road
     * actually draws the shape rather than aliasing it into a step, and
     * capped under `cell` so that summing the three cells around a query
     * catches the whole of one — a bump whose tail reached past that would
     * be cut off at a cell boundary, which is a step, which is the one
     * thing this must not produce. */
    halfWidth: { min: 2.2, max: 11 },

    /** R33 — and the gravel road's WIDTH is not one number either. A dirt
     * road is TIGHT for most of its length — as narrow as the traffic on it
     * can live with, because every metre of it had to be cut and has to be
     * bladed again every spring — and it opens out here and there where two
     * vehicles have to be able to meet, and at the corners, where the
     * sweep of anything long enough to need one has widened the bend.
     *
     * Three terms, and they are three different facts about the road:
     *
     * `narrow` is the share of the stage's nominal width the gravel is
     * actually cut to. Under 1 on purpose: `roadWidth` is the width the
     * turn vocabulary, the grid and R23's clearance are all sized from, and
     * every one of those wants the wide answer, but the road a car drives
     * down should be tighter than that or a corner is not a commitment.
     *
     * `vary` is the share of the nominal it then swings either way, so the
     * road runs from `narrow - vary` to `narrow + vary` of the stage's
     * width — enough to see, to place the car against, and to notice
     * arriving. `wave` is how far it takes to swing, m: long, so this reads
     * as the road opening out and pinching in rather than as a ragged edge.
     *
     * `corner` gives it back at the bends. A drift needs somewhere to go,
     * and a road cut to a lane everywhere is a stage that can only be
     * driven neatly — so a corner opens out toward the nominal again,
     * `gain` of the width at its widest and half of that at `pivotRadius`.
     * It is the same shape the bank uses and for the same reason: what is
     * being asked is how much of a corner this is.
     *
     * SEALED road does none of this. A paving machine lays a constant
     * width, which is the same reason the tarmac has no bumps on it. */
    width: {
      narrow: 0.8,
      vary: 0.11,
      wave: { long: 210, short: 74 },
      shortShare: 0.35,
      corner: { gain: 0.24, pivotRadius: 70 },
      /** Meters of road the width rolls in and out over. Curvature steps at
       * a segment boundary, so the corner term steps with it — and a mat
       * that gains a metre inside one 2 m sample is a notch in the edge of
       * the road, not a road opening out. The same triangular walk the bank
       * gets (`R.bank.runoff`), for the same reason. */
      runoff: 40,
    },
  },

  /** R6 — jump placement. */
  jump: {
    /** Segment must be at least this long to carry a lip — and it is the
     * SUM OF THE PARTS, not a number chosen next to them. At 90 it was
     * shorter than the run-up, the longest ramp and the landing added
     * together, so a straight could pass it and then have nowhere to put
     * the lip except inside its own run-up. `tests/rules_test.ts` holds the
     * two together. */
    minStraight: 107,
    runUp: 35, // meters of straight before the lip
    landing: 50, // meters of straight after the lip
    minSpacing: 200, // meters of stage between two lips
    /** The ramp, as a height and the run it is raised over. What matters is
     * the RATIO — that is the launch angle, and the flight off a lip is
     * ballistics from there: at rally pace a car leaves at `v·sin(θ)` and is
     * in the air for `2v·sin(θ)/g`, so a tenth of a radian either way is
     * thirty metres of flight.
     *
     * The bands are deliberately WIDE and overlapping, so that jumps differ
     * from each other: a stage whose every lip is drawn from the same narrow
     * ratio has one jump on it, repeated. The steep end is where the moon
     * shots come from, so it is capped by the landing zone below rather than
     * chosen for its own sake — `make analyze` reports the flight, the air
     * and the height under the car for every lip on the stage, and that is
     * the measurement this band is set against. */
    lipHeight: { min: 0.9, max: 2.2 },
    /** R6 — the RAMP'S OWN GRADE, which is what actually launches the car,
     * drawn directly instead of falling out of two independent bands.
     *
     * Height and length drawn apart can multiply out to a ramp shallower
     * than the road is allowed to climb anyway: 0.9 m over 22 m is 0.041,
     * against an `elevation.follow.grade` of 0.075. A quarter of all jumps
     * came out that way — and on a road already descending at its clamp
     * such a "jump" does not launch the car at all, it just flattens the
     * descent for twenty metres. The bot flew one for 0.017 s.
     *
     * So the floor is set clear of that clamp: a jump is a ramp STEEPER
     * than any hill the road could have been on, or it is not a jump. */
    ratio: { min: 0.1, max: 0.16 },
    rampLength: { min: 12, max: 22 },
  },

  /** R7/R12 — ford placement and the dip it sits in. The apron is the
   * carved approach on each side: the road eases down from the rolling
   * grade to the flat water over this many meters, and the water surface
   * sits `bedDepth` below the lowest surrounding grade — a stream bed, not
   * a puddle on a hilltop. Water keeps at least an apron's distance from
   * both segment ends so the whole dip lives on its own straight. */
  water: {
    minStraight: 100,
    length: { min: 8, max: 16 },
    /** Widest water the wheels may go THROUGH, meters (R13). Anything
     * wider is a river, and a river gets a deck over it — this is the one
     * number that decides which. */
    fordMax: 16,
    clearAfterJump: 50, // meters past a lip before water may start
    apron: 30,
    bedDepth: 0.5,
    /** Water must remain visible beyond both road edges at a ford. A ford
     * that only covers the ribbon reads as a puddle painted on the road,
     * rather than a channel the road passes through. */
    fordOutside: 2,
    /** R35 — how far back from the standing water a ROUTE has to stay, m,
     * measured ACROSS THE GROUND. The search rejects any line whose probe
     * points come within this of a lake, so a stage is drawn round the
     * water rather than through it and the terrain is never asked to raise
     * an embankment across one.
     *
     * A distance and not a height, which is worth saying because the
     * obvious version of this rule is a height and the obvious version is
     * wrong. Water is flat and its shores are not, so "keep three metres
     * above the lake" describes a band lying at the waterline on a beach
     * and at the TOP OF THE BANK on anything steep — and the top of the
     * bank is the one place a rideable verge (R31) cannot be cut. Every
     * height this was tried at, from 3 m to 9 m, broke R31 about seven
     * times as often as no rule at all, and the magnitude barely moved it:
     * the damage was in pinning the road to the steep band, not in how
     * wide the band was. Measured in metres of ground instead, the road
     * ends up back on the flat, which is where a road beside a lake
     * actually goes.
     *
     * The value is about a road's width: room for the corridor, its verge,
     * and a watercourse to reach the lake between the two, without pushing
     * every coastal stage inland. Measured, not guessed — over a 24-seed
     * sweep it is where `water.float` falls furthest (65 findings on 22
     * seeds to 47 on 16) before the extra setback starts shoving stages
     * onto ground steep enough to cost more than the water gains.
     *
     * A crossing is a different thing and is unaffected: a ford or a deck
     * is a place the road MEANS to meet water, and it carves its own
     * channel (R12/R13). This is about the lake it should have gone
     * around. */
    routeClear: 20,
    /** ...and how that setback RELAXES when a country will not yield a
     * stage at the full standard. An archipelago is a real place and a
     * seed is not allowed to simply fail, so the attempts walk down this
     * ladder: most of them at the full setback, then a few progressively
     * closer to the water, and the last of them at nothing.
     *
     * Nothing is not the same as "through the lake" — at a factor of zero
     * the route may run right down to the waterline, but it still may not
     * cross it, because `flooded` at a margin of zero is the water itself.
     * That part is never negotiable; only the elbow room is. */
    routeClearLadder: [1, 0.5, 0.25, 0],
  },

  /** R13 — the crossings a car cannot wade. A ford is water the wheels go
   * THROUGH; past `fordMax` the water is a river, and a river gets a deck
   * over it. The span decides the architecture: a timber deck is two
   * trunks and a plank floor, which only reaches so far — a wider gap
   * needs concrete piers. The road stays level across the whole deck (a
   * bridge is the one place the rolling profile is switched off) and the
   * water runs `clearance` below it, deep enough to drown a car that
   * misses the parapet. */
  bridge: {
    minStraight: 120,
    /** Span band, meters. The `water` knob decides where in it a crossing
     * lands, so a wet stage gets the big concrete spans. */
    span: { min: 18, max: 52 },
    /** Widest span a timber deck carries; past it, concrete. */
    timberMax: 28,
    /** Level road each side of the deck, meters — the run-on that keeps
     * the approach readable and the deck out of the segment's ends. */
    margin: 20,
    /** Water surface below the deck, meters, per deck kind. */
    clearance: { timber: 3.2, concrete: 5.5 },
    /** How deep the channel is cut below its own surface, m — deeper than
     * TUNING.crash.deepWater, so going over the side is a sinking. */
    depth: 1.8,
    /** Meters past a jump's lip before a deck may start. */
    clearAfterJump: 70,
  },

  /** R14 — the corner guard. A sharp corner whose inside is open grass is
   * not a corner at all: the fast line is straight across it. Every turn
   * combination that bends past `angle` gets its inside filled — a steep
   * mound where there is room for one, a dense grove where there is not.
   * Neither is a wall: a mound can be climbed and a grove threaded, but
   * both cost more than the corner they replace, which is the point. */
  /** R26 — where the marking goes. The level-design guide states the
   * placement in prose (docs/track-generator.md); these are the numbers it
   * resolves to. A zone is an arc-length span on ONE side of the road, and
   * the four roles are the four reasons a kerb is ever painted:
   *
   *   apex   — inside the bend, around its tightest point: the target the
   *            driver aims at, and the thing that stops the line being cut
   *            into the ditch.
   *   exit   — outside the road through the last of the bend, where the
   *            corner unwinds: the edge of the usable width as the car is
   *            pushed wide under power.
   *   entry  — outside the road through the first of a hard corner: the
   *            turn-in board.
   *   hazard — wrapped around something that will hurt: a bridge parapet,
   *            a jump lip's shoulders.
   *
   * Corners under `minAngle` get nothing at all. That threshold is what
   * makes kerbing an event: on a stage of soft sweepers almost nothing is
   * marked, and the one hairpin reads from a long way out. And every corner
   * zone is CLIPPED to its corner — a straight carries no marking, so these
   * spans are ceilings the bend can be shorter than, never runs of road the
   * marking is guaranteed. */
  kerb: {
    /** Total bend a turn (or a same-direction combination) must carry
     * before it is marked at all, radians — a shade over 40°, which puts
     * every hairpin and every real medium in and leaves the sweepers bare. */
    minAngle: 0.72,
    /** ...and the bend past which the corner also earns a turn-in board on
     * its way in, radians. A hard corner is the one place a rally actually
     * boards the outside edge. */
    entryAngle: 1.25,
    /** How much of the corner the apex kerb covers, as a fraction of its
     * arc, centred on the middle of the bend — and the meters it is held
     * between, so a hairpin is not marked by a stub and a long fourth-gear
     * sweeper is not marked from end to end. */
    apexSpan: { frac: 0.5, min: 14, max: 55 },
    /** The exit kerb ends where the corner ends and reaches back this far
     * into it, meters. */
    exitRun: { min: 16, max: 40 },
    /** The turn-in board starts where the corner starts and runs this far
     * into it, meters. */
    entryRun: 34,
    /** Kerbing on either side of a hazard's own span, meters. */
    hazardPad: 12,
    /** Marker posts on gravel stand this far apart, meters (R26 — a dirt
     * road is marked by posts, not by a painted band). */
    postSpacing: 6,
    /** ...and the anti-cut blocks laid through an apex, meters. Wider than
     * the posts because a block is wider than a post and because it is a
     * thing the car is meant to be able to WEAVE at: a continuous wall
     * along the inside of a corner is a barrier, and a barrier there is a
     * corner nobody may take tight. */
    blockSpacing: 3.4,
  },

  /** R27 — the crowd. Spectators stand where a rally crowd stands: at the
   * finish, and on the outside of the corners worth watching, back far
   * enough that a car losing it does not arrive among them. */
  /** R28 — the checkpoints. `spacing` is the target gap in SECONDS of
   * driving, which is what a split is actually measured in; it becomes
   * meters through `pace`, the same measured bot pace the length bands are
   * sized from (~95 km/h). Boards are placed at corner EXITS only, and the
   * severity a corner must reach to earn one relaxes the longer the stage
   * goes without a board: nothing but a hairpin will do inside `early` of
   * the last one, a real corner will do past the target gap, and past
   * `late` any bend at all is taken rather than let the split drift. That
   * ordering is the "prefer tight corners" rule — a board just past the
   * exit of a hairpin is one a driver has to earn, and one they will feel
   * being sent back to. */
  checkpoint: {
    /** Target gap between boards, seconds of driving. */
    spacing: 15,
    /** ...at this pace, m/s — `stageLengths` is sized from the same number
     * (`make sim` measures it). Seconds × pace is the gap in meters. */
    pace: 26,
    /** Fractions of that gap at which the severity bar drops: inside
     * `early` no corner is close enough to the last board to earn one,
     * from `early` only a hard one does, from 1 a medium will do, and past
     * `late` any turn is taken. */
    early: 0.55,
    late: 1.7,
    /** How far past a corner's exit the board stands, m — far enough that
     * it reads as the corner's reward rather than part of the corner, and
     * capped by the road that follows so it never lands in the next bend
     * (a turn takes its board on the exit itself). */
    runOut: 30,
    /** ...and past THIS many gaps a board goes down wherever the road has
     * got to, corner or no corner.
     *
     * Boards stand at corner exits because that is where one reads — but a
     * board is a timing split first, and a split the stage never takes is a
     * stage the clock has no shape. R17's borrowed tarmac is what made the
     * difference: a public road sweeps, so a kilometre of it closes no
     * pacenote and offers nothing to hang a board on, and seed 4's medium
     * went 1166 m between splits where the bar is 1014. Well past `late`,
     * so a corner is still preferred wherever there is one. */
    forced: 2.2,
    /** No board within this much road of the finish gate, m: a split
     * measured a few car lengths before the line says nothing the line is
     * not about to say properly. */
    finishClear: 150,
    /** How far OUTSIDE the road's own edge a board still counts a car
     * through, m. A board is a gate across the stage, and the finish's own
     * gate is the road plus its verge and nothing more — but the finish is
     * a line a driver aims at, and a split board is one they go past at the
     * exit of the hardest corner on the stage, sideways, with the outside
     * verge under two wheels. Wide enough that anyone actually driving the
     * stage is through it; far too narrow for the cut across country that
     * skipping a board is the whole point of catching. */
    gate: 12,
  },

  crowd: {
    /** A corner earns a stand once it bends this far, radians — the same
     * corners worth marking are the ones worth watching, a shade looser. */
    minAngle: 0.9,
    /** Never two stands closer together than this along the stage, m. */
    spacing: 320,
    /** How far back from the road EDGE a stand is planted, m — a band, so
     * a run of them is not a fence ruled parallel to the road. */
    setback: { min: 7, max: 13 },
    /** How wide a stand is along the road, m, and how many rows deep. */
    width: { min: 7, max: 15 },
    rows: { min: 2, max: 4 },
    /** People per meter of front row — a crowd, not a queue. */
    density: 0.55,
    /** How far back down the road the finish crowd is banked, m: the one
     * place on the stage where the stands are guaranteed and biggest. */
    finishReach: 70,
    /** How close to the car a stand has to be before it is HEARD, m. */
    cheerRange: 46,
    /** ...and the pace under which nobody bothers, m/s. */
    cheerSpeed: 11,
  },

  guard: {
    /** Total bend that makes a combination worth cutting, radians. */
    angle: 1.5,
    /** Spacing of guard patches along the shortcut, meters. */
    spacing: 10,
    /** Widest one patch gets, meters. */
    maxRadius: 15,
    /** Clearance a grove keeps from the road EDGE, meters... */
    groveClear: 4,
    /** ...and the wider berth a mound keeps, since its slope reaches out
     * past its crown and must never lift the road's own shelf. */
    moundClear: 9,
    /** Under this radius a patch is not worth building at all, and under
     * `minMoundRadius` it can only ever be a grove, m. */
    minRadius: 2.5,
    minMoundRadius: 7,
    /** Mound height per meter of its radius, and the ceiling — a mound is
     * always steep enough that climbing it beats nothing. */
    rise: 0.9,
    maxHeight: 18,
  },

  /** R15 — the paving field. The stage ALTERNATES: a run of gravel, a run
   * of asphalt, a run of gravel. `run` is how long one sealed section is,
   * meters — long, because what the tarmac has to read as is a road the
   * rally borrows for a while (R17) and not a chequerboard — and the
   * gravel between two of them is stretched to whatever makes
   * `knobs.asphalt` the share of the stage that comes out sealed, inside
   * `gap`. Under `floor` the dial means none at all: one short section of
   * tarmac in a seven-kilometer stage is not a feature, it is a mistake. */
  paving: {
    run: { min: 350, max: 800 },
    gap: { min: 260, max: 6000 },
    floor: 0.03,
    /** R17 — a surface change is a JUNCTION, and a junction is a place
     * where one road meets another, not a place where two roads dissolve
     * into each other. So the change only ever happens at a CORNER inside
     * this angle band: the route arrives on one road, turns onto the
     * other, and the road it turned off carries straight on past the
     * junction (taped shut). Too shallow a corner and the two roads merge
     * at a glance instead of meeting; too tight and the junction is a
     * hairpin, which is not how roads are laid out either. */
    junctionAngle: { min: Math.PI / 2.8, max: Math.PI * 0.62 },
    /** ...and only at a corner tight enough that the two carriageways
     * actually PART. The route's corner and the arm it abandons share a
     * tangent at the meeting point, so they run over the same ground until
     * the corner has swung the route clear of the main road's mat. Let
     * that take long enough and what the picture shows is two ribbons
     * peeling slowly away from each other — a slip road, not a junction.
     * Measured in road WIDTHS, because how a junction reads is a matter of
     * proportion: a narrow lane may part in fifteen meters and a boulevard
     * take forty, and both look like the same place. */
    junctionParts: 2.4,
    /** ...and NOT SO TIGHT that the corner turns inside out. In road
     * widths, for the same reason `junctionParts` is: a junction is a
     * proportion, not a length.
     *
     * Two things fall out of it, and the second is the one that was asked
     * for. A corner tighter than the road is wide has an inner kerb of
     * negative radius — there is no inside to it, and seed 3 drew one at 13
     * m on a 16 m road. And the angle the dirt road CROSSES the tarmac's
     * edge at is `acos(1 − half / radius)`, which is a monotonic function
     * of exactly this ratio: at one width it is 60°, at one and a half 48°,
     * at two 41°. Anything much shallower reads as two roads merging rather
     * than meeting, which is what a junction is for. One width is the
     * tightest a corner can be and still have an inside, and it is also the
     * squarest crossing the vocabulary can give. */
    junctionRadius: 1,

    /** R20 — THE TIGHTEST BEND A BORROWED ROAD MAY HAVE, m.
     *
     * A sealed section is a public road the rally borrowed, and a public
     * road is laid out by a highway authority for traffic that is not
     * racing: it sweeps. Hairpins on tarmac belong to mountain passes, and
     * a rally stage that meets one every time it joins the main road reads
     * as a race track somebody painted grey — which is the opposite of what
     * the tarmac is for. The tight stuff is the RALLY's, and the rally's
     * road is the gravel.
     *
     * Stated as `turn.hard`'s ceiling rather than as a number of its own:
     * the vocabulary already divides corners into the ones a public road
     * has and the ones it does not, and R3's `hard` bucket IS the drift
     * moments. So the rule is simply that a borrowed road takes no hard
     * turns, and moving R3's bands moves this with them.
     *
     * Enforced at the JOIN, in `compile.ts`: the route will not turn onto
     * the tarmac at all if the run it would spend there has a corner
     * tighter than this in it. Refusing costs nothing — the surface change
     * already waits for a corner to happen at (R17), so it simply waits for
     * a later one, or the stage stays on gravel.
     *
     * The two places it is NOT enforced are worth stating, because both
     * look like better homes for it and neither is. Not in the SEARCH: it
     * cannot know where a seal really ends, so covering that means capping
     * corners on the gravel around the paving field's bands, and the
     * straighter route that comes out runs alongside its own valleys —
     * across seeds 1-24 that took R18's `water.road` findings from 37 to
     * 134 while leaving the tight tarmac where it was. And not by
     * UNSEALING a hairpin the road has already arrived at, which is a
     * surface change with no junction at it: a worse lie than the one it
     * fixes (R17).
     *
     * `analysis/roads.ts`'s `sweeps` check is what says how well it holds:
     * 6.1% of the sealed road at its worst with the rule off, and with it
     * on, nothing outside the junction crossings themselves. */
    minRadius: 32,

    /** R17 — BORROWING the tarmac. The sealed roads are laid before the
     * route (`highway.ts`), so a paved stretch of stage is not a stripe the
     * generator painted: it is a piece of a real road the rally went and
     * found. This group is how it goes and finds one.
     *
     * `seek` is how far off the tarmac the route will consider a join
     * from, m. It is a REACH, not a taste: the approach is one
     * turn-straight-turn, so the furthest road it can arrive on is the
     * straight's ceiling plus what two corners carry, and a road past that
     * has no solve to find however much the stage would like one. The
     * route does not steer toward the tarmac at all — it asks, at every
     * corner, whether the road is already within reach.
     *
     * `meet` is the stretch of road that rendezvous is looked for over, m,
     * and how far apart the candidate meeting points are: a junction close
     * to where the route already is costs the stage less detour than one at
     * the far end of the look, so the nearest is tried first and this only
     * says how far the looking goes.
     *
     * `runOn` is how far the route stays on the tarmac, m, before it turns
     * off again — and it is WHERE THE ASPHALT DIAL SPENDS. The route asks
     * for what the dial still owes it, so a stage set to a fifth tarmac
     * takes a kilometre of road and one set to four fifths takes as much of
     * it as R11 leaves room for. The floor is what makes a borrow worth
     * making: anything shorter is a detour onto a road and straight off it
     * again, which reads as a mistake rather than as a stage using a road.
     *
     * There is no ceiling, and that is the fix for a dial that did not
     * work. Capped at 900 m, every borrow on every seed came out the same
     * length whatever the dial said: over seeds 1-24 at medium the sealed
     * share was 11% at 0.15 and 13% at 0.80. What bounds a borrow instead
     * is `share`, the most of what the stage has LEFT that one may spend —
     * a sprint's whole band is under two kilometres, so a borrow drawn at
     * the vocabulary's own length is most of the stage, R11 refuses it
     * every time, and from outside that reads as a route that never finds
     * a road. */
    borrow: {
      seek: 600,
      meet: { reach: 600, step: 55 },
      runOn: { min: 320 },
      share: 0.45,
      /** How far the route travels before it is worth LOOKING for a road
       * again, m, after a look that found none. The solve is a few thousand
       * turn-straight-turn closures over every meeting point in reach and
       * it is the most expensive thing in the whole search; asked again
       * forty metres down the same straight it asks the same question and
       * gets the same answer. A segment's worth of road is enough to have
       * changed it. */
      look: 200,
    },
  },

  /** R17 — the junction PLATFORM: the graded area where the two roads
   * overlap and become one piece of ground. */
  junction: {
    /** How far from the meeting point the platform reaches, as a multiple
     * of the separation distance the two carriageways need — the whole
     * region where their mats overlap, plus a little. Inside it neither
     * road wears a border, a marking or a camber, and the ground is one
     * plane on the through road's own grade. */
    platform: 0.95,
    /** ...clamped, m, so a junction is a junction and not a car park. */
    reach: { min: 20, max: 40 },

    /** R17 — THE MOUTH: how the MINOR road opens out where it meets the
     * sealed one. A dirt road that arrives at a junction the same width it
     * ran at leaves a wedge of country between its near edge and the main
     * road's, tapering to a knife point — which is the tell that two
     * ribbons collided rather than two roads meeting. In life there is no
     * wedge, and the reason is traffic: every car that turns out of the
     * lane cuts the corner, and season after season the mouth is worn and
     * bladed WIDER until the two mats are one piece of ground.
     *
     * So the minor road's mat is flared into a TRUMPET, and three
     * properties of that shape are the whole point. Getting any of them
     * wrong is visible from the air, and each has been:
     *
     * - It is WIDEST AT THE TARMAC. The mouth's job is to give a car
     *   leaving the dirt road room to turn either way onto the seal, and
     *   that room is needed where the two meet. A flare that peaks a few
     *   meters short and closes again reads as a bulge in a lane.
     * - It opens GRADUALLY. Narrow down the length of the lane, opening
     *   over a stretch of it, not a step.
     * - It STOPS at the main road's edge, and the dirt stops with it. Past
     *   that line the ground belongs to the through road, which is already
     *   paving it — carrying the flare across puts a mushroom of dirt out
     *   into the field on the far side, and carrying the SURFACE across
     *   drives a band of gravel through the middle of a sealed road.
     *
     * `wide` is the extra half-width at the tarmac and `taper` the length of
     * lane it opens over, both as shares of the road's own width, so the
     * mouth of a lane and the mouth of a boulevard are the same PLACE at two
     * scales. At 0.6 and 1.1 the throat is a little over twice the road and
     * opens over a road and a bit of it — which is what a graded side road
     * meeting a country highway looks like. `run` bounds how far back the
     * widening may reach at all, in road widths: a corner that hugs the main
     * road for a hundred meters is not a hundred meters of mouth. */
    mouth: { run: 3, wide: 0.45, taper: 1.1 },
    /** R17 — how far a junction's abandoned arm is allowed to be from the
     * edge of the map, as a share of the run a branch may take getting
     * there. A junction is only built where the arm it abandons can LEAVE:
     * a branch that cannot get clear of the country stops in a field, and a
     * tarmac road ending in a field is the loudest mistake the generator
     * can make. Measured as a share of the box's own diagonal, so it means
     * the same on a sprint and on a stage four times the size — and well
     * under 1, because a branch does not fly straight out: it wanders, and
     * it steers round water and round the road it left. */
    armReach: 0.8,
    /** R23's exemption around a junction: how far from the MEETING POINT
     * the route and the arm it abandons are still one road, m of plain
     * ground distance.
     *
     * A junction IS two carriageways sharing ground, so R23 cannot bind
     * there. What it binds on is everything else — and the exemption has to
     * be a PLACE, because that is what a junction is. Stated as an arc
     * window along the stage instead, it exempted every piece of route
     * within a few hundred metres of arc no matter where that route had
     * wandered to on the ground: measured over seeds 1-12 at medium, four
     * branches lay within a metre of the route a hundred metres and more up
     * their own length, one of them 5.9 m below it, and the analysis
     * exempted exactly the same stretch so not one of them was reported.
     * Two roads on one piece of ground at two heights is a cliff between
     * them, which is what the terrain has to build to keep both standing.
     *
     * The size is what it takes the two to actually part. A junction's own
     * platform reaches `reach.max`; past that the branch holds the main
     * road's line (`SPUR.straight`) while the route swings away through the
     * corner, and by 80 m from the meeting point the pair measure 33-40 m
     * apart on the seeds above — near enough `roadClearance` that the rule
     * has nothing left to forgive.
     *
     * The branch builder measures against it and the analysis exempts the
     * same neighbourhood, so a junction is not reported as two roads
     * sharing ground by the one instrument that would otherwise see every
     * one. It also lapses the moment the branch is properly clear of the
     * stage (spurs.ts): a branch that has wandered a kilometre and folded
     * back has no claim on the road beside its own junction. */
    parting: 80,
  },

  /** R36 — THE LEVEL CROSSING: the route going STRAIGHT OVER a public road
   * instead of turning onto it.
   *
   * A crossing is not a small junction and none of `junction`'s numbers
   * describe it. A junction is a corner — the two roads share a tangent and
   * the whole craft of it is the length over which they PART. A crossing has
   * no corner in it at all: the gravel arrives square, spends one road width
   * on the tarmac and is gone, and the two dirt arms are one straight line
   * through the middle of the seal. That is what makes it legal under R23
   * (see R36): the ground the two roads share is a place a car is on for
   * half a second, not a stretch either of them runs along.
   *
   * So the shape is stated the other way round from a junction's. A
   * junction's platform is elongated ALONG the main road, because that is
   * where the two mats overlap; a crossing's is elongated ACROSS it, along
   * the RALLY, because what has to be graded is the ramp the gravel climbs
   * to get up onto the seal. */
  crossing: {
    /** How far the route runs dead straight either side of the tarmac's
     * centerline, m. It is the whole reason the crossing is square: the
     * approach solves onto a pose this far short of the road, and the
     * straight that carries the route over it is `2 * clear` long — which
     * has to be a length the vocabulary can draw (`straightLong`), because
     * a crossing is an ordinary straight with a road lying across it.
     *
     * It also has to outreach the mats. Half a boulevard plus its verge is
     * about 15 m and R23's clearance a little over 40, so a route that
     * straightens up 55 m out is off the tarmac's ground before the corner
     * that aimed it there ever begins. */
    clear: 55,
    /** How far off the route a road is worth crossing from, m, and the
     * stretch of it the rendezvous is looked for over. Shorter than the
     * BORROW's reach on purpose: a borrow is the stage going and finding a
     * road because the dial asked for tarmac, and it is worth a detour. A
     * crossing is not something the stage wants — it is what the stage does
     * about a road that is in the way — so it only ever looks at road it has
     * nearly arrived at. */
    seek: 420,
    meet: { reach: 420, step: 55 },
    /** How far the route travels before a look that found nothing is worth
     * repeating, m. The solve is the same expensive turn-straight-turn
     * closure the borrow pays for (`paving.borrow.look` says why). */
    look: 200,

    /** R36 — HOW HIGH THE TARMAC STANDS above the country the rally crosses
     * it on, m, and over how much gravel the climb happens.
     *
     * This is the jump, and it is a jump nobody built. A public road is laid
     * on a graded formation — cut, filled, drained and rolled until it holds
     * one line across country that does not — and a rally track is scraped
     * along whatever the field was doing. Where the two cross, the field has
     * to come up to meet the road and go back down the other side, and a car
     * doing that at stage speed leaves the ground. Every rally in the world
     * has one of these and everybody remembers it.
     *
     * `stand` is deliberately modest. What throws the car is not the height,
     * it is the RATE — and `ramp` is metres of RALLY ROAD, measured from
     * where the platform's own flat top ends. Its steepest point is half
     * again as steep as the average, because the ramp eases in and out on a
     * smoothstep and a smoothstep's peak slope is 1.5. That is the
     * arithmetic to do before touching either number, and it is the one that
     * was missed the first time these were chosen: 1.3 m over an
     * eight-metre ramp measured 22% at the middle before the country under
     * it was counted, and with it, 33%.
     *
     * At 1 m and 14 the steepest point is 11%, and the curvature over the
     * lip throws the car off the ground from about 65 km/h up — which is
     * what a road crossing is for, and comfortably under the speed anything
     * arrives at one. Raising `stand` instead of shortening `ramp` buys the
     * same jump on a taller embankment, and an embankment is a wall for
     * anything that runs wide.
     *
     * It is a RAMP AND NOT A PLATFORM, and that separation is the whole
     * reason this is its own number. The graded, paved, levelled area is the
     * junction's own (`spread`) — twenty metres, the tarmac's mat with a toe
     * either side. Sized to the ramp instead, the platform was a
     * sixty-metre plateau of bare earth with a face round its rim, sitting
     * in a field: what a crossing needs graded is the road, and what it
     * needs RAISED is the road and the ramps up to it. So the ramps move the
     * elevation only. They keep their crown, their camber and their gravel,
     * and the terrain's shelf follows them the way it follows any road —
     * which is a narrow embankment along the rally rather than a car park. */
    stand: 1,
    ramp: 14,
    /** ...and how far the crossing's graded platform runs ALONG the tarmac,
     * in road widths. Enough for the seal's own mat plus the mouths the
     * gravel opens either side of it — the crossing's whole footprint on the
     * public road, and no more: a platform that reaches further is a paved
     * square in the countryside. */
    reach: 1.45,
    /** R36 — how much of a junction's DRAG-OUT a crossing gets, as a share.
     *
     * A junction's smear is laid down by cars TURNING: a tire under lateral
     * load scrubs gravel off the dirt road and prints it on the seal, and in
     * life it is the most obvious thing about the place. Nobody turns at a
     * crossing. What goes across is what the tread happened to be holding,
     * which is a dirty band, not a resurfacing.
     *
     * It is worth a number of its own because at a junction the smear is off
     * to one side of the carriageway and at a crossing it is dead centre and
     * continuous — so the same strength that reads as dirt at one reads at
     * the other as the gravel road CARRYING ON through the tarmac, which is
     * the exact lie R17 spends a paragraph forbidding. At full strength the
     * seal disappeared under it for the whole width of the rally road. */
    drag: 0.45,
  },

  /** R41 — THE RAILWAY, and the ramp the rally crosses it on. Meters and
   * seconds unless noted. */
  rail: {
    /** How many of a railway country's seeds carry a line at all. Most:
     * the train is the point, and a railway with no crossing on the stage
     * costs nothing but the search's clearance round it. The land still
     * refuses some (a rim in a lake, a line that never gets clear). */
    chance: 0.75,
    /** THE LINE itself: how wide its formation is, ballast shoulder to
     * shoulder — what the terrain shelves, the forest keeps off, and the
     * search keeps the route clear of, in place of a road's carriageway. */
    line: { width: 6 },
    /** How far the route runs dead straight either side of the rails: the
     * crossing's own `clear`, longer than a road's because the run-up and
     * the ramp have to fit in it before the lip, and R6's landing after.
     * `2 * clear` has to be a straight the vocabulary can draw
     * (`straightLong`). */
    clear: 65,
    /** How far off the route a line is worth crossing from, the stretch of
     * it the rendezvous is looked for over, and how far the route travels
     * before a look that found nothing is repeated — the road crossing's
     * numbers, for the road crossing's reasons. */
    seek: 420,
    meet: { reach: 420, step: 55 },
    look: 200,
    /** How far short of the rails' centerline the lip stands, m. The rails
     * are laid flush with the road at grade, so past the lip the car is in
     * the air over a drop of the lip's height with the line under it — and
     * the closer the lip is to the rails, the higher the car is over them.
     * Just past the crossing deck's own half-width, so the ramp is built
     * beside the line rather than on it. */
    gap: 6,
    /** THE RAMP: how high its lip stands over the road at grade, m, and how
     * much road it climbs over. This is what a car has to be thrown over a
     * train by — `RAILCAR.height` (3.4 m) of it, standing on rails at
     * grade — so the lip is a third of a metre short of the train's roof
     * and the flight makes up the rest: a car leaving a 22% lip at 15 m/s
     * is climbing at 3.2 m/s and is 4 m over the rails 6 m out, a car at
     * 10 m/s is 3.2 m over them and hits the wagon. That is the rule: fast
     * clears, slow does not. The ramp's own grade is `height / ramp`, and
     * the ramp rises on a square (`segmentElevation`), so the launch angle
     * at the lip is twice that: 0.11 average, 0.22 at the lip. The
     * analysis's `jumps` checks (`impact`, `height`) measure the landing
     * this throws. */
    lip: { height: 3.1, ramp: 28 },
    /** THE TRAIN and its timetable. */
    train: {
      /** The pace a driver's arrival at the crossing is guessed at, m/s —
       * the sim's mean over the roster, near enough — from which the first
       * train's time is set. */
      pace: 22,
      /** How far either side of that guessed arrival the first train's
       * head reaches the crossing, s. Skewed late: a train that has just
       * gone is a train nobody saw, one arriving as the car does is the
       * whole feature. */
      lead: { min: -3, max: 9 },
      /** How far either side of the crossing a train exists, m: it comes
       * out of the fog there and goes back into it. Past the fog ceiling,
       * so it is never seen appearing; short enough that one train has
       * cleared the whole of it before the next is due. */
      reach: 700,
      /** Seconds between trains. A single line is not this busy anywhere,
       * and it is this busy here so a second run at the stage meets one.
       * The floor is the reach's transit at the slowest speed with the
       * longest train (`rules_test` holds it), or two trains would be on
       * one line pointing at each other. */
      period: { min: 90, max: 140 },
      /** Line speed, m/s — a country railway's, not a main line's. */
      speed: { min: 18, max: 26 },
      /** How often the train is a RAILBUS (one or two cars, no wagons)
       * rather than a locomotive and freight. */
      railbus: 0.35,
      /** How many wagons a freight hauls. */
      wagons: { min: 3, max: 7 },
      /** Vehicle lengths over the buffers, m — a two-axle railbus, a
       * four-axle diesel, and the wagons. */
      length: { railbus: 24.5, loco: 15.5, timber: 19, box: 15, tank: 13 },
    },
  },

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
    },
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

  /** R19 — SUPERELEVATION: how far a turn is banked into itself. A road
   * built through a corner is tilted so the outside edge stands proud of
   * the inside; it is what stops the water — and the cars — running off
   * the outside. The rate is read off the turn's radius against
   * `pivotRadius` (a corner twice as tight banks twice as hard, up to the
   * ceiling), and the ceiling itself is a real road's, not a speedway's:
   * a rally car has to be able to stop on it, and a road nobody could park
   * on is a road nobody built. Gravel takes more than tarmac — a graded
   * surface is shaped by the blade every season, and a bladed corner is
   * always banked harder than a paved one. */
  bank: {
    /** Cross-fall ceiling, m per m of road width, per surface. */
    max: { gravel: 0.125, asphalt: 0.055 },
    /** The radius that earns half the ceiling, m — tighter corners bank
     * harder, and the curve flattens off rather than running away.
     *
     * PER SURFACE, because the two cross-falls have different causes. A
     * sealed road's is DESIGNED: a highway engineer superelevates the
     * corners that need it and leaves the rest of the road on its camber,
     * so the tilt is reserved for genuinely tight geometry and the pivot is
     * short. A gravel road's is WORN — every car that has ever turned here
     * has pushed loose stone from the inside of the bend to the outside,
     * and that happens on any corner at all, not just the ones an engineer
     * would have banked. So the gravel pivot is long: the tilt is in by the
     * time the road is merely bending, which is what stops a stage of
     * fourth-gear sweepers reading as flat ground with a line painted on
     * it. Verified by `analysis/drive.ts`'s `tilt` check, which measures
     * what the gravel corners on a stage actually come out at. */
    pivotRadius: { gravel: 105, asphalt: 42 },
    /** Meters of road the cross-fall rolls in and out over. A road does not
     * change its cross-section in a step; the runoff is what makes a banked
     * corner something the car settles into instead of hits. */
    runoff: 34,
  },

  /** R8 — crest placement. A blind brow is a long, gentle rise that hides
   * what is past it, not a ramp: the height/length ratio here keeps its
   * steepest grade around 13%, in the same band as the rolling ground it
   * sits on. */
  crest: {
    minStraight: 70,
    height: { min: 1.2, max: 2.6 },
    length: { min: 60, max: 100 },
  },

  /** R9 — soft margin inside the world bound where turn-back kicks in: at
   * least `min` meters, growing with the world (`frac` of the bound) so a
   * long stage starts circulating well before it can drive itself into a
   * corner it then has to backtrack out of. (The bound itself is per stage
   * length, `stageLengths[*].worldBound`.) */
  boundMargin: { min: 240, frac: 0.18 },

  /** R10 — floor under the distance between non-adjacent centerline points,
   * m. The distance actually enforced is R23's `roadClear`, which grows with
   * the road: this is only the least it may ever be. */
  minSelfDistance: 30,

  /** R23 — the room a road keeps to itself. `margin` is the bare country
   * left between two corridors' outer LIPS, m; what the rule enforces is
   * that plus both corridors' full reach, so it widens with the `width`
   * dial instead of letting a boulevard-wide stage lay its mats over each
   * other. The margin is the most room that can be asked for without
   * costing the stage vocabulary its tightest folds: the hairpin's two arms
   * are a road's width apart by definition, and pushing this further starts
   * rejecting hard corner combinations instead of crossings (the sim's
   * severity mix is the measurement that says where the line is). */
  roadClear: { margin: 13 },

  /** R31 — the RIDEABLE VERGE: how far the ground beside a road is held
   * under it, and how steeply it may climb away past that. A rally car
   * leaves the road constantly and has to be able to get back on, so the
   * country next to the road is the one place the landscape does not get
   * the last word. */
  verge: {
    /** Half-width of the bench, m, measured from the road's centerline:
     * inside it nothing stands above the road's own corridor. The number is
     * one GROUND LATTICE CELL DIAGONAL, rounded up, and that is what makes
     * it load-bearing — every corner of a lattice cell a road crosses lies
     * inside that radius of the road, so pinning them under it is what
     * stops a ground triangle cutting up through the tarmac. Shrink it
     * below the diagonal and the guarantee stops being one; the cell size
     * lives in terrain.ts and a test pins the two together. */
    bench: 20,
    /** ...and the grade the ground may rise at past the bench, m per m.
     * Under `collision.climbLimit` with room to spare, because the lattice
     * reads a field of this grade BACK at up to `climb * SQRT2` across a
     * cell diagonal, and that steeper number is the face the car meets.
     *
     * This is the grade for ground that CANNOT stand steeper — deep till,
     * which slumps. Where the road has been cut through rock instead, R34's
     * `cut` band says what the face is held at. */
    climb: 0.45,

    /** R34 — THE CUT. What the road does with ground it cannot go round.
     *
     * These are grades past the bench, m per m, and they replace `climb`
     * by however much of a cut this piece of road is in. The face is a
     * cone like R31's and it starts at the same bench, so nothing here
     * touches the flat ground beside the road: it changes only how the
     * country stands up once it is past it.
     *
     * `face` is the band the rock is held at, read off `knobs.steepness`.
     * The top of it is a shade under 60° — steep enough that the renderer
     * paints it as bare rock and a car cannot climb it, and short of
     * vertical because the ground it is built out of is sampled on a 14 m
     * lattice and a face that turns over inside one cell is a fold, not a
     * cliff.
     *
     * `sealed` and `loose` are how much of that face each kind of road
     * actually gets. A tarmac road was engineered and blasted; a gravel
     * road was scraped in by a grader, and a grader goes round what it
     * can and battered back what it cannot. The gap between the two is
     * the whole visible difference R34 is about.
     *
     * `soil` is the depth of cover, m, past which the ground can no longer
     * hold a face at all — it is till, and till slumps to `climb`
     * whatever the road is surfaced with and whatever the dial says. The
     * cut fades out over it rather than switching, so a cutting runs out
     * into a bank instead of ending at a ruled line. */
    cut: {
      face: { min: 0.75, max: 1.7 },
      sealed: 1,
      loose: 0.34,
      soil: 0.8,
      /** How deep the road is CUT IN before there is a face beside it at
       * all — the natural ground's height at the road, minus the road's
       * own grade, m.
       *
       * This is the gate that decides WHERE a cutting is, and it is the
       * whole reason the road follows the country (`elevation.follow`)
       * rather than floating at a height of its own. A road runs down the
       * valleys, and down a valley it stands at or above the ground on its
       * own low embankment: nothing is cut, and what is beside it is soil.
       * It is only where it has to climb over a shoulder to get anywhere
       * that its grade runs under the ground, and that — and nowhere else
       * — is where anybody blasts.
       *
       * `from` is a ditch's worth, below which there is no face; by `full`
       * the road is properly down in it. */
      depth: { from: 2.5, full: 10 },
      /** How far the country has to stand ABOVE what the cut left before
       * the ground there reads as a FACE rather than as a bank, m: `over`
       * where it starts counting, `full` where it is all rock. Everything
       * that treats a cutting as a cutting reads this — nothing roots on
       * it, so the trunks and the undergrowth stop; the ground paint takes
       * the bedrock (it already does, off the slope); and the analysis
       * counts the stage's cuttings by it. */
      bare: { over: 1.5, full: 7 },
    },
  },

  /** R24 — the start zone. `apron` is the dirt extrapolated straight past
   * each stage end, m: the run-up before the gate and the run-off past the
   * flying finish. Road is drawn on it, the terrain lays its shelf under it
   * and the physics rides it, so it is stage and it is kept clear like
   * stage. `fromArc` is how far the route has to have travelled before it
   * counts as coming BACK to the start — inside it the road is simply
   * leaving, which is not a violation of anything. */
  startZone: {
    /** Meters of dirt extrapolated straight off each stage end. Its length
     * is set by the HEADS-UP GRID, because that is the only thing that
     * needs it long: a mass start stands the whole field on it behind the
     * gate, one car per row (`sim/grid.ts`), so the apron is
     * `(field - 1) * TUNING.massStart.rowGap` plus a car's own length. At
     * 3.5 m a row and a sixteen-car field that is 55 m, rounded up — and
     * the apron is what `GRID_MAX` is derived FROM, so lengthening it here
     * is how a deeper grid gets built. A rally start uses the same road as
     * a run-up and does not care how much of it there is. */
    apron: 56,
    /** How far the route has to have travelled before it counts as coming
     * BACK to the start (R24) — inside it the road is simply leaving. */
    fromArc: 160,
  },

  /** Feature probabilities per eligible straight. The water entry is the
   * chance of ANY crossing; the `water` knob scales it and splits it into
   * fords and bridges. */
  featureChance: { jump: 0.4, water: 0.35, crest: 0.3 },

  /** Everything the `water` knob reaches. */
  wet: {
    /** Multiplier on `featureChance.water`: a dry stage fords the odd
     * stream, a wet one meets water every other straight. */
    crossingChance: { min: 0.3, max: 1.8 },
    /** Share of crossings too wide to wade — the ones that get a deck. */
    bridgeShare: { min: 0.15, max: 0.7 },
    /** How far up the bridge span band a stage reaches, 0..1: the dial is
     * what decides whether its rivers need concrete. */
    spanReach: { min: 0.3, max: 1 },
    /** How much of the far landscape sinks under the water table into
     * ponds and lakes — the water the road runs PAST rather than over. */
    ponds: { min: 0, max: 1 },
    /** R35 — what the dial does to the ROUTE's setback from that water, as
     * a multiplier on `water.routeClear`.
     *
     * It has to shrink as the dial rises, and the reason is not a tuning
     * preference — it is that the rule inverts the dial otherwise. Turning
     * the water up puts more lakes on the map, a fixed setback then pushes
     * the route into whatever dry corridors are left, and the stage you
     * drive comes out with LESS water beside it than a dry seed's: the
     * analysis measured a wet stage at 0.29 of water against a dry one's
     * 0.37, which is the dial working backwards.
     *
     * It is also simply what lakeland roads do. In dry country a road can
     * afford to keep its distance from the one pond it passes; in a
     * country that is half water there is nowhere to keep it, so the road
     * runs the shore — which is the whole character of the place. */
    routeSetback: { min: 1.3, max: 0.3 },
  },

  /** The `trees` knob multiplies the solid trunk field's density. */
  forest: {
    density: { min: 0.2, max: 2 },
    /** R32 — what the SOIL decides about a wood. A trunk needs `depth`
     * metres of cover before a cell is forest at all; from there the stand
     * thickens with the soil, from `thin` of its density up to full over
     * `full` more metres. Bare rock keeps its moss and its grass and grows
     * nothing with a trunk, which is what puts the open ground on the ridges
     * and the mountain flanks rather than scattering it at random. */
    rooting: { depth: 0.4, thin: 0.35, full: 1.6 },
  },

  /** Chance the next segment is a turn rather than a straight. */
  turnChance: 0.72,
} as const;

/** R22 — the band ONE LAP of a circuit is searched inside: the sprint band
 * for the same stage length divided by the laps it is raced over, so a
 * "medium" circuit is the same three minutes of driving a medium sprint is.
 * The floor is what stops the short band collapsing into a roundabout. */
export function circuitLapBand(length: FiniteStageLength): { min: number; max: number } {
  const band = STAGE_RULES.stageLengths[length].band;
  const { laps, minLap } = STAGE_RULES.circuit;
  return { min: Math.max(minLap, band.min / laps), max: Math.max(minLap * 1.3, band.max / laps) };
}

export type SegmentPlan = {
  kind: "straight" | "turn";
  /** Arc length of the segment, meters. */
  length: number;
  /** Turn-only: rotation sense of the heading walk; +1 grows the heading
   * (which the chase cam reads as a LEFT turn — the rendered world mirrors
   * the engine's map view). */
  dir?: 1 | -1;
  /** Turn-only: radius in meters. */
  radius?: number;
  /** Turn-only: severity bucket the radius/angle were drawn from. */
  severity?: TurnSeverity;
  feature: SegmentFeature;
  /** Feature geometry offsets within the segment, meters from its start. */
  featureStart?: number;
  featureEnd?: number;
  /** Jump-only: lip height in meters. */
  lipHeight?: number;
  /** Crest-only: brow height in meters. */
  crestHeight?: number;
  /** Water-only (R13): how the road gets across — waded, or on a deck. */
  crossing?: Crossing;
  /** R25 — set on a sprint's last segment: how many of its meters lie
   * PAST the finish gate. The line is drawn where the segment has this
   * much left to run, and everything after it is run-out. */
  runOut?: number;
  /** R17 — set where this segment is the route running ON a tarmac road it
   * borrowed (`highway.ts`). The SEARCH decides it, not a paving field
   * downstream: which stretches of a stage are sealed is a question about
   * where the roads are, and only the search knows where the line went. The
   * junction is the boundary — the segment that turns onto the tarmac is
   * unpaved, and the meeting point is its far end. */
  paved?: boolean;
  /** ...and which road, and where along it, so the compiler can hand the
   * junction the arm the route does not take without guessing. */
  onRoad?: { road: number; from: number; to: number };
  /** R36 — set on the STRAIGHT that carries the route square over a public
   * road, saying which road and which of its points the crossing sits on.
   * R41 — or over the RAILWAY: the line's `kind` says which, and a railway
   * crossing's straight carries the ramp as its `jump` feature.
   *
   * The search decides it for the same reason it decides `paved`: only the
   * search knows the line went there, and a compiler left to notice a
   * crossing by measuring its own samples against the network would also
   * "notice" every near miss the clearance already allows. */
  overRoad?: { road: number; index: number };
};

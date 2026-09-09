// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One chapter of the stage generator's rule book (`rules.ts`): WHAT THE ROAD
// CARRIES — tunnels, jumps, water and the crossings over it, ice, bridges,
// kerbs, checkpoints, the crowd and the guards beside them, and the paving.
// Spread into `STAGE_RULES` by `rules-book.ts`.

export const FEATURE_RULES = {
  /** R47 — THE TUNNEL. A straight whose line runs under the country by
   * more than `depth` for at least `minLength` of its run, in a country
   * that bores (`BiomeLand.tunnels`), goes THROUGH rather than being
   * refused as too deep a cut — where the country stands `cover` over
   * the line somewhere along the run, which is what makes it a mountain
   * to bore and not a shoulder to blast. The bore spans exactly the run that is
   * under by `depth`, less nothing: the portal at each end is where the
   * line meets the face. `portal` is how far past the mouth the country
   * is still cut back to the road (R31's cone) so the face stands a few
   * metres out from the drawn portal rather than through it; `maxLength`
   * stops a straight boring the whole width of a ridge — a stage is a
   * road over a mountain, not a railway under one — and a straight that
   * would have to is refused like any other. `level` is the grade the road
   * eases to inside: a bore is driven near level because that is what a
   * bore is, and a road that kept following the country up through the
   * rock would come out of the far portal higher than the ridge.
   * `clearance` is the bore's height over the crown, m, and `wall` how far
   * outside the road's edge the wall stands — the renderer builds the
   * lining to these and the physics stands a wall there. */
  tunnel: {
    depth: 16,
    /** The least the country must stand over the line SOMEWHERE along the
     * bore, m — the mountain it is bored through. `depth` is where a
     * cutting becomes a portal; this is what makes the run between the
     * portals worth boring rather than blasting open: a shoulder eleven
     * metres over the road was being tunnelled with a roof thinner than
     * the lining at its far end, where a cutting is what a road does. */
    cover: 35,
    minLength: 60,
    maxLength: 420,
    portal: 14,
    level: 0.025,
    clearance: 5.2,
    wall: 0.9,
    /** How much of a stage may be BORED at most, as a share of its target
     * length, and the least open road between one bore's far portal and
     * the next bore's mouth, m. A pass road has a tunnel or two on it; a
     * road that is a fifth tunnel is a railway. Over the alpine's first
     * forty medium seeds the search bored up to a quarter of a stage
     * unbudgeted — four bores in five kilometres. */
    share: 0.1,
    gap: 400,
    /** The least rock a sample needs OVER it to be inside the bore, m.
     * The search finds a bore's portals on its own coarser profile, and
     * the compiled road through the shoulder can stand a few metres over
     * it; at the far mouth that left samples flagged as tunnel under three
     * metres of country, where the vault alone is six and a half. Under
     * the clearance plus the lining's own rise, a sample is open road in
     * a cutting — the brow it was under was thinner than the lining. */
    brow: 7,
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
    /** R6 — how far the road may FALL AWAY under the flight, m: the most
     * the line may stand below the lip's own base anywhere in the landing
     * zone. The lip throws the car by its own height; a road dropping away
     * past the lip adds every metre of that drop to the flight, and a
     * ramp drawn at the gentle end of the band on a road running downhill
     * came out as a ninety-metre jump. Held by the search off the line it
     * walks (`jumpLands`); the landing zone itself is `landing`. */
    landingFall: 2.5,
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
    /** R12 — A FORD LIES IN ITS VALLEY. The water is laid at the bare
     * land's own level at the crossing (never above the road's line), and
     * the road dips DOWN to it from wherever its line was running — which
     * on a stage that rolls over the country is metres up. So the apron is
     * not a fixed length: it is as long as the drop needs to stay a ramp,
     * `apron` at the least, and the search only lets a straight carry a
     * ford whose aprons fit inside it (`crossingSits` sets the plan's own
     * `apron`).
     *
     * `apronGrade` is the steepest the ramp may run, m per m. The apron is
     * a smoothstep, whose slope peaks at one and a half times its average,
     * so the length is sized as `1.5 · drop / apronGrade`. A SPLASH, not a
     * highway ramp: a rally ford is a dip the car drops into and climbs
     * out of, so this sits over `ANALYSIS.drive.grade.warn` and well under
     * its `fail`, with the road's own grade into the crossing riding on
     * top. Sized at the warn instead, two fords in three found no straight
     * long enough to hold their aprons and the taiga lost its water.
     *
     * Before the water was laid against the land it was laid against the
     * ROAD — the roll's lowest point, `bedDepth` under the line — so a ford
     * on an embankment anchored its river (R18) that far over the country
     * the water was meant to lie in, and the reach floated above both its
     * banks; and a ford on a hillside, held at the downhill mouth's level,
     * gave the uphill apron the whole window's fall to lose in thirty
     * metres: 25-36% ramps on every hillside ford of a dozen seeds. */
    apronGrade: 0.16,
    /** R12 — THE CULVERT: a stream the road goes OVER on its own fill,
     * through a pipe. The third way across water, and the commonest on
     * any real road: a ford is a dip to the water where the road can
     * afford to dip, a bridge is a deck where the water is too wide to
     * wade, and everything else is a pipe under the embankment. Before it
     * existed the generator had two answers to a stream below the road —
     * dip to it, however deep, or refuse the crossing — and the dip left a
     * sheet on the road standing a metre over the river running off it.
     *
     * `fordDrop` is the deepest a ford's dip may be, m, from the road's
     * line to the water; past it the road is far enough over the valley
     * that dipping to it is a hole in the road, and the water goes under
     * instead. `cover` is the least the line may stand over the stream for
     * the pipe to fit, m — its bore and the fill over it. `bore` is the
     * pipe's radius, m; `stream` the half-width the water through it is
     * drawn at — a ford's, not a brook's, because the ground lattice is
     * fourteen metres a cell and a channel narrower than that runs under
     * tiles that never dip into it, unseen and undrivable; `span` how much
     * road the crossing occupies along the stage, m. */
    culvert: { fordDrop: 2.2, cover: 1.6, bore: 0.9, stream: 5, span: 8 },
    /** ...and how far either side of the road the land is read for that
     * valley, m. A stream crosses a road at the bottom of the country
     * ACROSS the road as well as along it: read at the centerline alone,
     * a crossing drawn over a low ridge laid its water on the crest, a
     * metre or more over the banks the analyzer measures it against
     * (`ANALYSIS.water.float` reads them at the channel's half-width plus
     * the bank blend plus six, which for the widest deck's river is thirty
     * metres out). This reaches a little past those. */
    bankReach: 32,
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
    /** R35 — the least the road's SURFACE may stand over a lake in view
     * of it, m, wherever the route runs (`keepsDry`). Under the freeboard
     * the road follows the country up to (`elevation.follow.freeboard`),
     * because that is a target the follower lags toward and this is a
     * floor the line is refused under: enough for the tile sink and a
     * ford's wading lip, so no ground tile beside the road is under the
     * lake. */
    underLake: 1,
  },

  /** R48 — THE ICE ROAD: a rally route across a lake the cold has frozen
   * solid (climate.ts's `waterFrozen`).
   *
   * It is the one place a stage is allowed inside R35's setback, and it is
   * allowed because the reason for the setback has gone: a frozen body is
   * a floor, and it is the flattest, widest, most obviously drivable
   * ground in the country. Real winter rallies use them for exactly that
   * reason, and so does this one — the ice is not a hazard the route
   * dodges, it is a section the route is pleased to find. */
  ice: {
    /** The tightest corner the route may draw with ANY of it on the ice, m
     * of radius.
     *
     * A lake gives no camber, no crown and no loose skin to cut down
     * through, and the surfaces table gives ice less hold than it gives
     * even snow: everything a rally car changes direction hard WITH is
     * missing, so a hairpin on ice is not a corner, it is a spin with a
     * start line. Set inside R3's SOFT band and above the whole of its
     * medium one, so what the crossing carries is the long open sweeper
     * and the straight — flat-out road, which is what an ice section is
     * for — and every corner that asks for a lift or a lever stays on the
     * land either side of it. Over the soft band's own ceiling it would
     * ban curves on the ice outright, and a crossing with no shape in it
     * is a bridge. */
    minRadius: 80,
    /** ...and how far off the sheet that rule reaches, m. A corner is
     * refused for coming NEAR the ice, not only for standing on it, and
     * the margin is a road's width rather than a rounding: the search
     * probes every `PROBE_STEP` metres and its Euler walk parts company
     * with the compiler's finer one by metres over a stage, so a turn
     * judged only where it was sampled still laid tens of the built road's
     * samples across shorelines it never saw. Measured over a twelve-seed
     * winter sweep — at 15 m the tightest corner reaching the ice was a
     * 27 m hairpin, and at this it is exactly `minRadius`. Higher costs
     * crossings for nothing: 60 m halved the ice a sweep produced and
     * bought no corner the rule had not already refused. */
    cornerClear: 30,
    /** THE HIGHEST A LINE MAY CROSS A FROZEN BODY, m over the sheet —
     * a floor under the route in `keepsDry`, and the difference between a
     * bank running out onto a lake and a viaduct over one.
     *
     * It is needed because the road follows the country through a 140 m
     * lag (`elevation.follow.lag`) and a lake is a couple of hundred
     * metres across: a line arriving at a shore still up on a hillside
     * crosses the whole body before the follower has brought it down.
     * Unbounded, a twelve-seed winter sweep flew six metres and more over
     * open ice, which is exactly the causeway R35 exists to prevent.
     * At four the same sweep never stands over three and a third, and
     * three quarters of the road over frozen water is down ON it — the
     * rest being the short bank at either end, which is what an approach
     * to a real ice crossing is. Tighter and the feature evaporates: at
     * 1.5 m the sweep produced 300 m of ice road in twelve stages,
     * because the country almost never offers a flat run at a shore. */
    lift: 4,
    /** ...and the band inside which the road actually IS the sheet, m —
     * what the compiler calls a sample `ice` in. Separate from the lift
     * above, and much tighter, because the two are different claims: one
     * is how much bank a crossing may be approached over, and this is
     * where the bank stops and the ice road starts. A sheet's thickness
     * and a road's crown, not a tolerance. */
    onSheet: 1.5,
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
   * ordering is the "prefer tight corners" rule — a board a driver has to
   * earn is one they will feel being sent back to. HOW FAR past the exit is
   * `tight`'s question: a corner that sweeps past it takes its board on the
   * exit itself, and everything gentler takes it `runOut` further on. */
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
    /** ...but a corner sweeping at least THIS far, radians, gets NONE of
     * that run-out: its board stands the instant the curve finishes.
     *
     * The run-out is road, and road past a corner is where a car that cut
     * the corner rejoins. A board 30 m down it is one the cut is back on
     * the road in time to drive through, so the shortcut books the split
     * and costs nothing; a board on the exit itself is one only a car that
     * came round the curve is in front of. Set at the sweep where a corner
     * starts doubling back on itself and the inside becomes worth taking —
     * a bend that barely bends has no inside to cut, and its board is
     * better off reading as the corner's reward. */
    tight: 1.9,
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
    /** A corner earns a stand once it bends this far, radians. A rally
     * crowd walks in from a car park and stands at the corners worth the
     * walk — the hairpins and the tight thirds, not every kink R26 bothers
     * to mark. Tighter than the marking bar on purpose: a stand is only
     * placed at all where the country will carry a car park within a walk
     * of it (R42), and spending that search on a fourth-gear bend is what
     * put spectators down every straightish sweep of the stage. */
    minAngle: 1.3,
    /** Never two stands closer together than this along the stage, m. One
     * car park serves everything inside its own walk, so stands closer
     * together than that are one crowd drawn twice. */
    spacing: 460,
    /** How far back from the road EDGE a stand is planted, m — a band, so
     * a run of them is not a fence ruled parallel to the road. */
    setback: { min: 7, max: 13 },
    /** How wide a stand is along the road, m, and how many rows deep. */
    width: { min: 7, max: 15 },
    rows: { min: 2, max: 4 },
    /** People per meter of front row — a crowd, not a queue. What turns a
     * stand's rectangle into a HEAD COUNT (`standHeads`), which is the
     * engine's number and not the renderer's: R42 sizes a car park from the
     * crowd it serves, so how many people are standing there has to be
     * something the generator knows. */
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
    /** Mound height per meter of its radius, and the ceiling. A mound is a
     * raised cosine (`guards.ts`), whose steepest point is `rise · π / 2`,
     * and R31 holds that under `verge.climbable`: a mound is a hill that
     * costs the corner-cutter time, never a wall that stops the car — at
     * 0.9 it stood at 55° and did exactly that. Steep enough that climbing
     * it beats nothing, and no steeper. `rules_test` pins the pair. */
    rise: 0.39,
    maxHeight: 6,
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
    /** R47 — in a mountain country the route is not routed onto tarmac,
     * it IS the tarmac: a pass road, sealed from the valley up to a
     * height and gravel above it, where the money ran out. The dial moves
     * the height: at its floor the line stands at the ROCK LINE (the
     * valley, the forest and the alp under it are tarmac; the rock and
     * the snow are not), at its top `sealAbove` metres over the snowline
     * (above everything, so the whole road is a sealed pass), and the
     * middle puts it halfway up the rock band — the lower half of a stage
     * that starts beside the snow and comes down; below `floor` nothing is
     * sealed. The change of surface still happens where R17 says it
     * does — at a corner that can carry a junction, with the arm to the
     * map's edge — through the same painted path a circuit uses. */
    sealAbove: 60,
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
} as const;

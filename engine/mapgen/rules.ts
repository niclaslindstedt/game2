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
//       point, fed by the stream that crosses the road there. So a ford
//       LIES IN ITS VALLEY: its water is laid at the bare land's own level,
//       the road dips down to it over an apron as long as that drop needs
//       to stay a ramp (`water.apronGrade`), and the search only lets a
//       straight carry a ford whose aprons fit inside it. A ford laid at
//       the road's height instead is a river drawn at the embankment's
//       height, and a fixed apron on a hillside is a ramp that drops the
//       hill's whole fall in thirty metres. Where the road stands too far
//       over the water to dip to it (`water.culvert.fordDrop`) it stays on
//       its fill and the stream goes UNDER it, through a CULVERT: no dip,
//       no water on the road, the same water at the same level on both
//       sides of it, and a pipe's mouth in each side of the embankment.
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
//       (R17) exactly as it binds the route. It binds IN HEIGHT as well:
//       two arms of the route that pass each other need the room for the
//       ground between them to get from one to the other at the grade R31
//       allows beside a road (`armSeparation`) — the upper arm's corridor,
//       the lower arm's bench, and `verge.climb` between the two — or no
//       ground satisfies both and the difference stands up as a face along
//       the upper road's edge. Its one exemption is a
//       JUNCTION, and a junction is a PLACE: inside `junction.parting` of
//       the point two roads meet at they ARE one road, and everywhere else
//       — including further along the same two roads — they are not.
//   R24 The START is a PLACE, not a line: the grid, the APRON of dirt behind
//       it, and `roadClear` of country around both belong to the start. On a
//       sprint the route may not come back into it and no branch may cross
//       it — a road floating over the start is the first thing a run ever
//       sees. Kept in HEIGHT as well as on the map, by R23's own clause:
//       the apron is an arm of the stage, and a stretch passing it at the
//       plain clearance a dozen metres above it leaves the ground between
//       nothing to be but a face. A circuit closes onto its own start line
//       by construction (R22), so what it must not do is come at it ACROSS
//       the apron; its closure lies along it.
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
//       gathers — at the finish, and at the corners worth the walk in — on
//       ground clear of the road and on the INSIDE of the bend, which is
//       the safety rule every rally briefs and a rule about where a car
//       GOES when it lets go: it leaves at a tangent and finishes on the
//       OUTSIDE, so the outside is the side a marshal tapes off. They
//       stand IN corners and never along a straight, and only where R42
//       finds them somewhere to have parked — a corner with no such
//       country behind it gets nobody.
//   R28 A stage is SPLIT INTO CHECKPOINTS, roughly a quarter-minute of
//       driving apart, and every one of them stands at the EXIT of a
//       corner — the tighter the better. A checkpoint is both a split
//       (where the run is measured against whoever it is racing) and the
//       place a lost, drowned or crashed car is put back on the road, so it
//       belongs where the road has just asked the driver a question rather
//       than in the middle of a straight where it would cost nothing.
//       A corner tight enough to double back on itself takes its board the
//       instant the curve finishes, with no run-out at all: the run-out is
//       road a car that CUT the corner rejoins on, and a board it rejoins
//       in front of is a split the shortcut books for free.
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
//       And NOTHING A ROAD BUILDS IS STEEPER THAN A CAR CAN CLIMB unless it
//       is rock, and says so. Every slope the terrain shapes — the cone
//       letting go of the country at the end of its reach, a road's or a
//       branch's embankment running out to the field, a stream's bank — is
//       held under `verge.climbable`; where a mountain stands over the cone
//       by more than a climbable slope can take up, the join is a FACE and
//       it is declared one (`terrain.cutAt`), so the car meets bare rock it
//       can see and never a grass hillside it cannot get up. The analysis
//       holds the whole drawn lattice to it (`ground.climb`).
//       A FILL'S SIDE IS ONE SLOPE, NOT A SUM OF THEM. An embankment falls
//       at the verge grade until it lands on the country, and is let go
//       only at the end of the road's reach — never eased toward the
//       country from the lip, because an ease has a grade of its own and
//       stood it on top of the embankment's. Where the country itself
//       falls away from under the road, the side falls at the country's
//       own grade and what it takes to land within reach, which is what a
//       fill on a hillside stands at. And the ground between two roads
//       carries the TALLER fill whichever road is nearer: a fill handed
//       over at the midline is a step the height of the fill.
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
//       clear of the homesteads (R37), which keep clear of them, and the
//       walls and the cars outside them are as solid as they look.
//       THE GROUND UNDER THE WHOLE VILLAGE IS ONE GRADED BAND, level with
//       the street's own verge, running from under the street's mat out
//       past the back gardens for the length of the town and eased back
//       onto the country past that — never a graded pad per lot, because
//       the drawn ground is a lattice of corners fourteen metres apart
//       (`lattice.ts`) and a pad ten metres across falls between them:
//       flattened a lot at a time nothing reaches the surface anyone
//       stands on, and four houses in five end up hanging over the
//       country's own slope or buried in it. Where another road, a
//       homestead or the water is in the way the band stops short and the
//       ground goes back to being theirs — a ROAD takes its own corridor
//       back whatever the band wanted, so a lot only ever stands where
//       there is a lattice cell of road-free ground behind it. What the band
//       cannot do is make a hillside level: a building is a box with a
//       level floor, so a front may only span as much of the street's fall
//       as it can carry (`lot.step`) — which is what puts the block of
//       flats on the flat and leaves the steep end of the street to the
//       houses. A watercourse keeps off the band as it keeps off a road
//       (R18). One town on a stage, because a town is a place and two of
//       them in five kilometres is a suburb.
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
//       fields THE ROAD ACTUALLY RIDES: a sand road is bladed rather than
//       surveyed, so it follows the country at 0.3 of the taiga's lag and
//       1.4 times its grade (`BiomeLand.lag`, `BiomeLand.grade`), which
//       takes it from a quarter of the sand's rise to two thirds of it and
//       halves the cut and fill it stands on. HOW HIGH THAT SAND
//       STANDS IS A DIAL (`knobs.dunes`, `STAGE_RULES.dunes`, 0-100 m
//       through `duneHeightOf`): a MAXIMUM, reached where the erg is
//       deepest and nowhere else, and one that builds a BIGGER dune field
//       rather than a taller one — the period grows with the height, and
//       the ergs with the period, because sand cannot stand steeper than
//       its own angle of repose. At 0 the country comes back with no dune
//       row at all. A biome never switches a rule off — a desert stage
//       still obeys every one above — it moves what the rules draw from,
//       exactly as the other dials do.
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
//   R42 THE CROWD DROVE HERE. Every stand (R27) is reached from a CAR
//       PARK: a patch of bladed gravel in the grass, `standOff` metres
//       clear of the course at least, with the crowd's own cars nosed onto
//       it — enough of them to have CARRIED that crowd and no more of them
//       than there were people to drive them, at a carful apiece
//       (`occupancy`), so a corner with eight spectators at it has three
//       cars in the field behind it and never twenty-four. It is reached
//       by a gravel LANE off a road that is NOT the rally road: an
//       abandoned arm past its barrier (R17, R36), a public road the route
//       never met, the lane out of an earlier car park, or — where the
//       pocket of country the corner sits in carries none of those — out
//       to the edge of the map the way a branch goes, which is where the
//       tarmac it would have joined runs too. From the pad a TRAIL is
//       trodden through the grass to the back of each stand the car park
//       serves, never across the route and never through the water, with
//       arrow boards along it pointing the crowd the way. It is placed the
//       way a marshal plans it, BACKWARDS: from the stand to a common car
//       park, and from the car park out to a road. Nothing about it costs
//       the route anything — the pad, the lane and the trails keep off the
//       route's corridor, every other road, the water, the guards' mounds
//       and the buildings. AND A STAND THE COUNTRY LEAVES NO ROOM TO SERVE
//       IS NOT A STAND: it is taken off the stage, because a crowd that
//       could not have got to a corner does not stand at it. The pad is a
//       pad the terrain flattens, the lane is a road it shelves, and the
//       cars are as solid as they look.
//   R43 THE COUNTRY MAKES POWER. A stage in a modern country
//       (`BiomeRules.energy`) runs past the two things a hillside has on it
//       now: WIND FARMS and SOLAR FARMS. A wind farm is a string of three
//       to seven turbines, each two hundred metres to the blade tip, on the
//       highest dry ground a band off the road — the first tower where a
//       lateral probe from the stage finds the country rising, the rest
//       along a string that follows the road's bearing and walks each tower
//       onto the highest ground near its slot; every foot stands over the
//       road it is seen from, off every road's corridor by more than a
//       rotor, and on a crane pad of graded gravel the terrain flattens.
//       A solar farm is a fenced rectangle of panel tables on level ground
//       beside the stage, from a paddock's worth to a field of them, every
//       one facing the sun's own azimuth (`energy.solar.facing`) — a
//       clearing the forest keeps off, with the fence, the tables and the
//       inverter cabin as solid as they look. Both keep off the water,
//       every road, every town and homestead, and each other, and neither
//       costs the route anything. `roads.energy` measures every one.
//   R45 THE POWER GOES SOMEWHERE ELSE. The country that makes power
//       (`BiomeRules.energy`) carries the GRID that takes it away: one
//       400 kV transmission line, laid rim to rim across the map from
//       nothing but the seed and the bare country, on a little over half
//       the seeds and never two. It is not a thing beside the road — it
//       is a thing the road passes under, and the moment worth having is
//       the crossing.
//
//       IT IS A CHAIN OF TOWERS, AND IT TURNS ONLY AT ONE. There is no
//       line to place towers on: the towers ARE the line. From each one
//       the bearing runs at the far rim, swinging off it only to get
//       round water the line could not span, and turning at all only by
//       `angle.most` — past `angle.suspension` the tower is an ANGLE
//       tower, heavier and strung with horizontal tension insulators, and
//       a line does not put one in every span (`angle.apart`). A TENSION
//       tower goes in every `section` spans in any case: a line strung
//       suspension to suspension for kilometres falls over for
//       kilometres when one goes.
//
//       WHERE THE NEXT TOWER STANDS IS A CLEARANCE PROBLEM, not a
//       spacing one. The conductor hangs in a parabola whose sag goes as
//       the SQUARE of the span (`sag` at the ruling span), and the next
//       tower goes at the LONGEST span, `span.max` down to `span.min`,
//       whose wire still clears the ground under it by `clearance.ground`
//       — `clearance.road` where it crosses a road. That is the surveyor's
//       own method with the sag template, and it is why the towers come
//       out on the brows and the long spans over the hollows. Where the
//       whole band refuses — a lake, a village, the road and its verges,
//       ground too steep to foot a tower on, a hollow the wire would dip
//       into — the span STRETCHES to `span.stretch` and carries over: the
//       ridge-to-ridge crossing span, sagging thirty metres, which is the
//       one that looks like something. A window that refuses even
//       stretched refuses the whole line, and another entry on the rim is
//       tried: a grid with a hole in it is worse than a country with no
//       grid.
//
//       Every foot stands off the route, every other road, every town,
//       homestead and energy plant (`clear`), and out of the water. Under
//       the wires the forest is cut back to a WAYLEAVE `wayleave` metres
//       either side — a straight ride through the trees, over the hills,
//       which is the half of this that is visible from a kilometre away —
//       and only the trees: the stones and the scrub stay, because a
//       corridor is cut on a cycle of years. The towers' legs are as
//       solid as they look; nothing else about the line touches the car,
//       and none of it costs the route anything. `roads.wires` measures
//       the spans, the clearances and the ground every tower stands on.
//   R46 HOW HARD A STAGE IS, is a DIAL — `knobs.challenge` — and it is a
//       dial across the rules above rather than a rule of its own. Turned
//       up: more of the stage is corner and more of those corners are
//       drawn from R3's hard bucket, each one is taken from the tight end
//       of its own severity's radius band and swept further round it, the
//       lips are drawn from the steep end of R6's ramp band, the road is
//       narrower than R21's dial alone would have made it, and the country
//       either side stands its relief higher, so a car that slides off the
//       outside of a corner has somewhere to fall. It never draws anything
//       the vocabulary does not already contain: a hard turn on a savage
//       stage is still a hard turn, it is just the tightest one R3 has.
//       AT REST — the middle of the dial — every one of those is exactly
//       the number the rule states, so the stage a seed has always built
//       is the stage it still builds.
//   R47 A MOUNTAIN ROAD SOLVES THE MOUNTAIN. In a country with a MASSIF
//       (`BiomeLand.massif`, the alpine) the geography comes first — a
//       ridge system hundreds of metres high, concave flanks, flat valley
//       floors with the lakes cut into them, a treeline, a rock line and
//       a snowline (`BiomeLand.zones`) — and the road is made to fit it,
//       never the other way round. Four things make that true. The stage
//       STARTS HIGH (`startHigh`): the origin is sited on the highest
//       shoulder the grid will stand on, so a stage runs down off the
//       mountain. The search READS THE COUNTRY when it draws a corner
//       (`steer`): it walks both directions and keeps the one whose end
//       the road can follow the land to, weighed toward the lower ground —
//       which is what lays a road along a contour, and what turns it back
//       on itself in a HAIRPIN where the flank is too steep to take
//       straight, so a sequence of switchbacks down a face is what the
//       vocabulary builds there without a rule that says "switchback". The
//       road may follow the country steeper (`grade`), because a pass has
//       further to climb than a forest road. And a cut deeper than a road
//       would be blasted is BORED: a straight whose line runs more than
//       `tunnel.depth` under the country for `tunnel.minLength` or more
//       becomes a TUNNEL — the road holds its grade through the shoulder,
//       the country stands over it untouched, its walls are as solid as
//       they look, and the two portals are cut into the face at either
//       end. Only in a country that bores (`tunnels`); the taiga's deep
//       cut is still refused, and the search draws another line. ABOVE THE
//       SNOWLINE THE ROAD IS SNOW: whatever it was laid as, a sample
//       standing higher than `zones.snow` is a packed snow road, a surface
//       of its own to the physics (`TUNING.surfaces.snow`) and a bladed one
//       to everything about the road's shape. None of it touches a country
//       without a massif: every multiplier in the taiga's row is 1, its
//       `steer` is 0 and it bores nothing, so every seed it ever built is
//       the seed it still builds.
//
//   R49 WHICH WAY A STAGE RUNS THROUGH ITS COUNTRY is a DIAL —
//       `knobs.tilt` — and it is decided by WHERE THE STAGE STARTS. The
//       road follows the bare land through a lag (R34), so its height at
//       any point is the country's; what the stage does over its whole
//       length is therefore almost entirely how high the ground under the
//       start line stands against the country's own average. So the dial
//       moves R35's siting walk and nothing else: above the middle the
//       origin walks for the highest level shoulder it can find and the
//       stage comes down off it, below the middle for the lowest ground it
//       can start on and the stage climbs. HOW FAR it walks is what the
//       dial's magnitude buys (`siteBiasOf`), because the best site is the
//       best site whatever the score is scaled by — a gentle setting means
//       the high ground NEARBY, a full one the best shoulder in the
//       county. The middle asks for nothing and is R35's plain spiral, so
//       every seed built without a tilt is the seed it always was; a
//       country that already starts high (R47's alpine) is exactly its old
//       self at the middle and takes the dial as an offset either way. It
//       can only trade inside the relief the country actually has, and it
//       never touches the road's own grade — nothing it does can make a
//       stage steeper than R34 already allows. It says nothing at all to a
//       CIRCUIT (R22): a lap comes back to its own start line, so its net
//       drop is zero however the country is sited under it.

export * from "./rules-book.ts";
export * from "./rules-country.ts";
export * from "./rules-knobs.ts";

import type { Crossing, SegmentFeature, TurnSeverity } from "./rules-knobs.ts";

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
  /** R12/R13 — set by the search on a ford or a deck: how long the two
   * ramps either side of the crossing are, m — the one the road arrives on
   * and the one it leaves on. `water.apron` at the least for a ford's dip,
   * `bridge.margin` for a deck's approach, and longer by however far the
   * road's line stands off the water, or the deck, at that mouth. Two
   * numbers, because a crossing on a grade has one mouth near its level
   * and the whole of the fall to lose at the other. */
  apronIn?: number;
  apronOut?: number;
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

# The driving model

The handling model (`engine/game/car.ts`, numbers in `engine/game/defs/`) is arcade by conviction: the car is a point with a nose, forward speed `u`, sideways speed `w`, and a yaw rate. Everything is tuned around three moments.

## Turning, and the drift

The slip angle (`atan2(w, |u|)`) is the drift, and there is no state machine
behind it: **drifting is just what a car does when you turn harder than the
tires can pay for.** One number, the **slide** (0..1), carries the whole
thing, and every force below fades in and out with it, so grip and slide are
one continuous response rather than two modes.

- **The slide** — the turn being asked for costs lateral acceleration; the
  car has `gripAccel` to spend. The slide (0..1) is how far past that
  ceiling the WHEEL is asking, eased in with a smoothstep that starts a
  little before the limit (`TUNING.drift.entryAt`) and finishes well past
  it (`entrySpread`). Both ends of that ramp are flat on purpose: there is
  no corner in the car's response anywhere, so there is no instant at which
  the car changes what it is doing — grip becomes slide without an event.
  What was asked a moment ago also has not fully let go (`release`), which
  carries one corner's angle into the next. Gentle steering never earns an
  angle at any speed. No flick, no handbrake, no kick — nothing is ever
  injected into the car's velocity.
- **The speed floor** — under **70 km/h** (`TUNING.drift.slideFrom`, read
  off the GROUND speed the speedo shows) there is no slide at all: the whole
  gate multiplies out to zero, so the wheel steers the car and does nothing
  else. It closes over five km/h (`slideSpan`) rather than at a hard edge,
  it caps a slide already running — a drift that runs out of speed is let go
  by the floor rather than carried down to a standstill — and every lever
  that takes the rear away passes through it, the handbrake included. A car
  going sideways at walking pace is not this game's drama; it is a car that
  will not go where it is pointed.
- **The demand is what the wheel ASKS for**, never the yaw the car ended up
  with. The slide feeds extra yaw authority back into the car, so measuring
  it off the resulting yaw closes a positive feedback loop with no
  equilibrium in the middle — the car would have exactly two states,
  gripped or fully sideways, a notch of wheel apart. Commanded demand is
  what makes the angle a continuous function of lock and speed.
- **The rotation** — as the slide opens, the car gains yaw authority
  (`driftYaw`) and the slip starts turning the nose itself — sustained by
  steering INTO the slide, so releasing the wheel stops feeding it and
  counter-steer both cuts the deepening and steers the catch.
- **The lock has weight.** The wheel is not a switch: the commanded lock
  eases toward what the driver is asking for at `TUNING.steering.rackRate`,
  and everything above reads that, not the raw input. Turn-in builds over a
  beat instead of arriving in a tick — the steady-state corner is exactly
  the one it always was, but the car answers like something with mass on
  the front axle rather than a cursor.
- **The wheel commands the angle.** Every force that deepens a slide fades
  as the slip approaches the angle this much lock is asking for
  (`angleSpan × breakaway × slide`, over a band `angleBand` wide, both
  scaled by the surface — see below). The setpoint moves
  with the wheel, so full lock is a deep drift, half lock a shallower one,
  and a centred wheel hands the car back. At 119 km/h the compact — the
  FRONT-driver, so the shallowest slide on the roster (`depth`, below) —
  answers a lock sweep like this, with no step in it anywhere:

  | lock     | 0.2 | 0.3 | 0.4 | 0.5 | 0.6  | 0.7  | 0.8  | 0.9  | 1.0  |
  | -------- | --- | --- | --- | --- | ---- | ---- | ---- | ---- | ---- |
  | slip°    | 1.4 | 2.5 | 4.3 | 7.6 | 12.5 | 17.8 | 22.8 | 27.1 | 30.6 |
  | radius m | 181 | 112 | 74  | 53  | 41   | 34   | 28   | 24   | 21   |

- **The exit overshoots a tad.** Unwinding the lock does not stop the car
  rotating: while the slide lets go, the yaw answers its target more slowly
  (`releaseHang`) and the rear weathervanes the nose back toward the
  direction of travel (`releaseSnap`). A spring with light damping — so a
  deep drift swings back through centre by a degree or two and asks for a
  dab of opposite lock, while a moderate one just gathers up.
- **The exit belongs to the driver.** Dropping the wheel mid-slide gathers
  the NOSE up, but it does not put the car back on the road: the car carries
  on out toward the outside, going very nearly where it was already going,
  and steering is what tips it back into the middle. What makes that true is
  `TUNING.grip.tailPeak` / `tailBand` / `tailFade` — sideways, the front
  tires are as crossed up as the body is and have almost nothing to pull
  against, so past a real slip angle a CENTRED wheel gives up most of the
  redirect. Lock takes it straight back, either way round: the corner held on
  or the catch on the way out. Without that gate the tires ate the car's whole
  sideways momentum on their own — the velocity swung thirty degrees back in
  behind the nose after the hands came off, so the slide finished the corner
  by itself and handed the car back straight, on the line and faster than it
  went in, with nothing left to catch. It is gated by the speed floor and by
  the wheel, so a held drift is untouched and a slow scrabble cannot use it.
- **Power oversteer** — for the car with a driven REAR axle, and the EXIT
  is where it shows: steered into the slide the corner behaves classically,
  but once the wheel stops asking for the angle the driven axle keeps
  feeding it for a beat (`TUNING.grip.powerYaw`, ungated by saturation,
  faded by steering into the slide). So a centred wheel on the power lets
  the slide LINGER before grip gathers the car up — and a counter-steer
  settles it faster still. A front-driven car does the opposite on the same
  pedal, and a four-wheel-drive sits between them; see **The drivetrain**
  below. The catch carries yaw momentum
  (`yawResponse.slide` sits a touch under the grip-matched rate), so an
  over-held counter swings the pendulum: the slip crosses centre into a
  second drift the other way, which needs its own counter. Balancing that
  on the wheel is the game.
- Two stabilizers keep it a dance instead of an instant spin:
  - **Saturation** — everything that deepens a slide fades as the car
    reaches the angle the wheel is asking for and is gone once it is past,
    except the power's own oversteer. The band (`angleBand`) is wide enough
    that the drift is a slope to lean on rather than a wall the car hits.
    Only counter-steer keeps full authority.
  - **Lift-to-tighten** — lateral grip scales up as the throttle lifts
    (arcade weight transfer). On the power the slide runs; breathe and the
    car both tightens its line and calms its tail. This is the tool against
    running wide and the no-hands way out of a drift.
- **Lift-to-rotate.** A closed throttle also asks the slide to go DEEPER
  (`TUNING.drift.liftSpan`): the weight goes forward, the driven axle
  unloads and the tail comes further round than the wheel alone would ever
  take it. It moves the SETPOINT rather than pushing on the forces —
  `askedSlip` is what every deepening term, `liftYaw` included, fades out
  against, so a lift that only pushed harder would be pushing against a band
  that had already shut and the pedal would do nothing to the angle at all.
  With the setpoint moved the band reopens and the whole slide carries the
  car there, while lift-to-tighten above pulls the line in underneath it —
  one pedal, both halves of a rally turn-in. The weight is lagged
  (`CarState.lift`, at `TUNING.grip.liftSettle`) rather than read off the
  pedal: the throttle is a key on a keyboard and the mass it moves is not, and
  read raw, every dab became a wobble and one long drift was counted and drawn
  as a dozen twitchy little ones.
- **Speed costs radius.** The redirect is a rate, and a rate times a speed
  is a force the tires have to find: left unbounded it lets the car hold a
  hairpin's radius at a straight's speed, which is what makes a car feel
  like it steers into a corner rather than driving round one. The lateral
  acceleration is therefore capped at what the tires actually hold
  (`TUNING.grip.latCeiling`, a multiple of the car's own `gripAccel`), and
  it saturates rather than clipping — `tanh`, so the tires roll off their
  peak instead of falling off a cliff, with a residual slope
  (`latGive`) that keeps more lock worth something all the way up the
  throw. What it buys is the shape of the whole stage: the tightest line
  the car can hold grows as u², so a long sweeper is a flat-out drift and a
  hairpin has to be braked for or flicked round on the handbrake. Over the
  ceiling the velocity simply stops catching the nose up — the car runs
  WIDE at a bigger angle, which is the drift doing what a drift is for.
- **The cost** — the tires **redirect** the car instead of braking it: the
  velocity swings back in behind the nose while its magnitude is kept, so a
  corner taken sideways comes out at pace. Only `TUNING.grip.scrub × sin²
(slip)` is actually burned off — ordinary cornering costs nothing, and even
  a big drift bleeds a few percent per second. A drift is never _felt_ as a
  brake; that is the whole point.
- **The handbrake** — cuts rear grip and adds yaw while it is held. It
  unsticks the car; it does not teleport it sideways, and it does not slow it
  down. It works by lowering the grip ceiling, so the same lock asks far
  more of what is left. It is a flick, not a hold: with the power down and full lock, a held
  handbrake takes the rear past any catch and spins the car around. Below the
  speed floor both halves of it — the yaw and the grip cut — are gone, and
  the lever is a pair of locked wheels: it is not a way round the floor.
  What the lever cuts is the REAR: `handbrakeGrip` is the rear letting go, up
  at the slide threshold, and `handbrakeLat` — much higher — is what the
  lateral redirect keeps, because the fronts go on rolling and go on
  steering. They are two numbers for a reason. Folded into one, the handbrake
  pivoted the car through seventy degrees and then carried it straight on past
  the apex on a WIDER arc than a plain lift would have taken: spectacular, and
  useless for the hairpin the lever exists to get round.

  The three tools are a ladder, each going both deeper and tighter than the
  last — full lock on gravel, held to a settled angle and radius:

  |               | on the power | lift       | handbrake  |
  | ------------- | ------------ | ---------- | ---------- |
  | compact (fwd) | 32° / 39 m   | 40° / 21 m | 63° / 16 m |
  | classic (rwd) | 44° / 23 m   | 46° / 13 m | 73° / 10 m |
  | coupe (awd)   | 37° / 37 m   | 41° / 22 m | 73° / 16 m |

`car.slide` and `car.drifting` are readouts for the dust, the HUD and the
balance table — nothing in the model branches on them. `drifting` is read off
the slip ANGLE, with hysteresis, because the angle is what a player sees and
because it moves smoothly, AND off a slide that is actually open: below the
speed floor a hard turn is understeer, which is not a drift and must not
light the dust or the counter. Drift score accumulates as `|slip| × speed ×
time` — sideways AND fast — purely as a measurement; nothing in the game
rewards it, and no drift seconds are counted at the player.

## The jump

- **The ground** — grounded, the car **rides** the road: its vertical speed is the road's own, sampled between centerline points rather than snapped to the nearest one, so it climbs a ramp smoothly instead of hopping up it in 2 m stairs.
- **Attitude** — the engine owns how the car SITS, in `CarState.pitch` and `CarState.roll` (positive lifts the nose and the right side). Grounded, both are the ground under the wheels: the nose takes the grade along the heading, the body takes the camber across it. Airborne, the pitch is the flight's own arc and the roll is the tumble the take-off put in. Both ease toward their target at `TUNING.attitude.settle` — that lag IS the suspension travel a landing settles through. The renderer only spends the two angles on the right axes; it never derives them.
- **Takeoff** — jump segments ramp up to a lip; crossing it throws the car with vertical speed proportional to pace × ramp slope (`takeoff`). The ramp EASES IN, steepest right at the lip, because a ramp that flattens as it reaches the top hands the car no upward speed at the one moment that matters. A crest launches the car too, but only when the road's own curvature would pull it down harder than gravity can (`TUNING.air.crestSpan`, `crestPull`) — so a real brow throws you at pace and holds you at a crawl, while the rolling ground under every stage is just ridden over. Off the road a sharp EDGE does the same: ground falling away by more than `edgeDrop` under the car's own footprint is a cliff lip, not a face to be driven down. Both gates read the speed the car is COVERING GROUND at rather than the speed it is pointing at, because sideways those are different numbers — a drift over a mountain top flies exactly like a straight one would.
- **The roll** — a car that leaves the ground crossed up trips over its outside wheels: the take-off puts roll in the body from the slide it was holding plus the rotation already in it, and nothing in the air takes it out. The same trip about the vertical axis puts SPIN in it (`air.yawFromSlide`): the tires that were holding the slide let go all at once, so a car that goes over a ledge sideways keeps turning the way the slide was turning it, all the way down. Straight and level flies flat; properly sideways goes a long way over; the unluckiest launches go all the way round. Landing on your side is never a clean landing. The ground unwinds the roll toward the nearest upright, and then onto the CAMBER under the wheels — level on the road, tipped with the hillside out in the wild.
- **Airborne** — the velocity vector is committed. Gravity is arcade-heavy (floatier hangs read as slow motion), the nose answers only faintly, and a small seeded turbulence rolls the car — flying, slightly out of control, exactly as intended. No lateral grip: whatever attitude you took off with survives to the ground.
- **Landing** — straight (slip inside the clean limit) keeps all your speed: `CLEAN AIR`. Landing sideways scrubs speed and wobbles the car. Line up before the lip. Whatever the descent was, the springs take it (below), and a slam past what they can travel through bounces the whole chassis back off the ground for a beat — one landing still happening, not a second flight, so it draws no turbulence and never counts as a jump.

## Reverse

The brake pedal has two jobs and no gear to choose between them (`TUNING.reverse`). Above walking pace it is unambiguously the brake. Once it has stopped the car — `engageBelow`, 0.6 m/s — holding it backs the car out instead, at `accel` up to a `top` of 8 m/s (~29 km/h). It is a RECOVERY, not a way to drive the stage: deliberately slow to build and far too slow to be a tactic, so a nose in a tree is something the player digs out of rather than waits out a respawn for.

- **Throttle always wins.** Gas cancels the manoeuvre outright — there is nothing to select on the way out of it.
- **The manoeuvre latches** (`CarState.reversing`) and stays latched through the pedal coming up until the car is back at a stop, which is what separates the driver putting the car in reverse from something throwing it backwards: a rebound off a cliff face is negative forward speed too, and it belongs to the collision, which keeps every bit of it. While the latch holds and the pedal is up, the drivetrain gathers the car back to rest at `coastStop` — rolling drag alone is tuned for a car with an engine holding it up against it, and would let a released reverse coast on for the better part of a minute.
- **The wheel answers the other way round**, as it does in any car. Everything in the yaw model reads the SPEED rather than the signed forward velocity, so a car rolling backwards is a car that can be steered — a wheel with no authority at all is how you get stuck twice.
- **Brake lights stay for braking** (`CarState.braking`), and the HUD's gear reads `R`.
- **Backing out counts as asking to move**, so the wedge rescue (`TUNING.offTrack.stuck`) keeps its clock running through the attempt: a car pinned in front AND behind still gets dragged home on time, and one that reverses free resets the anchor and drives on. The bot uses exactly this — see [simulation.md](simulation.md).

## The booster

A finite tank of raw thrust (`TUNING.boost`): hold boost to burn it for extra forward acceleration on top of engine torque, unaffected by gearing or surface. The thrust fades to zero approaching an overrun cap just past the car's final gear top, so it stretches the top end rather than breaking it. The tank never refills — not even on respawn — and rationing it across the stage is the game. Grounded only: airborne the velocity is committed, booster included. Emits `boostStart` on ignition and `boostEmpty` once, when the tank runs dry.

## Wind and weather

Every stage blows a seeded wind (`GameState.env` + the per-step `state.wind` vector). The pre-race weather setting picks the band (`TUNING.wind.speed`): clear is a breeze, rain is a stiff wind, a storm genuinely blows. The wind gusts and veers deterministically with sim time, so replays and sim digests hold. It touches the car three ways (`TUNING.wind`):

- **Head/tailwind** pushes on forward speed (`longForce`) — a storm headwind trims the top end, a tailwind stretches it.
- **Carry** — a fraction of the wind velocity translates the whole car downwind (`carry`): small while gripping, larger mid-drift, largest airborne, where a storm gust visibly moves a jump sideways. A translation, never a torque — the wind cannot spin the car.
- The HUD shows an arrow + km/h readout once the wind is worth knowing about.

Time of day is presentation only; weather is the lever that reaches the physics (through the wind).

## Hills

Generated stages roll (`STAGE_RULES.elevation` — long climbs, medium rollers, surface bumps; grades live on straights and flatten through corners). Gravity acts along the grade (`TUNING.hills.gravityAlong`): climbs cost speed, descents give it back, and a crest taken flat-out can go light. Ground height under the car interpolates between centerline samples, so grades stay smooth at any speed — and ACROSS the road it is the same corridor profile the road mesh is drawn from (R16 in [track-generator.md](track-generator.md)), carried out past the mat into the shoulder and the ground leaning away from it, so a car putting two wheels wide rides the verge it can see instead of hovering over it.

## Surfaces

| Surface     | Effect                                                                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gravel      | The baseline: full power, honest grip, dust off the rear when sideways — and a plume towed off the back wheels from 30 km/h up                                                                                                                       |
| **Asphalt** | A third more lateral grip and a third of the breakaway angle: the corner that needed a slide is driven round, the drift has to be ASKED for and stays small when it comes — and it throws nothing at all until a tire is overwhelmed, then smokes it |
| Water       | Fords and shallows: a splash on entry, heavy drag, reduced grip and power                                                                                                                                                                            |
| Nature      | The open landscape off the road: loose grip, fast — up to ~150 km/h                                                                                                                                                                                  |

Asphalt is not a different handling model, because there isn't one: it is
two numbers on the same one, and they pull opposite ways.
`TUNING.surfaces.grip` is how HARD a surface holds — the sealed road's
ceiling sits a third higher, so the slide starts later and the car carries
more speed through the corner. `TUNING.surfaces.breakaway` is how far
sideways it has to be pushed before it gives up, and there the sealed road
is the small one. That is the real difference between the two surfaces and
not a scalar friction: loose gravel's breakaway is a long way out, which is
why a rally car has to be properly sideways before the tires let go, and
the big angle is what digs down through the loose stuff to the firm surface
under it. Tarmac peaks a few degrees off straight and falls away past it —
it holds harder than gravel ever will and it hates being sideways.

So a paved corner is DRIVEN round, and the drifts that do happen are the
ones you committed to — entered hot, flicked, or pulled on the handbrake —
and they are short and smoky rather than a rally angle carried to the exit.
The tarmac sections are laid as long runs joined to the stage at planned
junctions (R15/R17 in [track-generator.md](track-generator.md)), so a
stretch of grip is an event in the stage rather than a texture swap.

### The plume, and what the rain does to it

A loose surface gives up two separate things and they are separate systems.
The GRIT is thrown by the wheels — the rooster tail off a slide, the plume
off the line, the scatter under braking — and it is over inside a second.
The CLOUD is towed: the fine stuff the whole underside lifts, which does not
arc anywhere. It starts at 30 km/h (`PLUME.from` in `pwa/src/game/dust.ts`,
spawned by `plume.ts`) and thickens with pace the whole way to the top of
the stage's speeds, and it is dragged along in the low pressure behind the
car at a fraction of the car's own velocity — signed, so reversing tows it
backwards. Mostly off the REAR axle whatever is driving the car
(`DRIVEN_REAR`): a driven wheel is what tears the surface open, but the back
wheels then run through everything the fronts have loosened, and the wake
that carries a plume at all sits behind the car. The drivetrain tilts the
split rather than deciding it.

Off the road it does not come up at all over turf. Grass is what BINDS a
surface, so a field has no loose dry dust to lift, and a green cloud is a
substance that does not exist — `plumeGround` in `ground-tint.ts` is the one
place that decides, and over a meadow it answers with nothing. What the wild
still gives is what the wheels TEAR OUT: earth, mostly, with torn blades
through it (`WILD_DUST`), at close to the count the road throws
(`WILD_THROW`) because it is the only ground-contact effect the wild has
left. Above the tree line the plume comes back — bare bedrock is dust again,
so a scree flank throws a full stone cloud (`STONE_DUST`) and a hillside
going over to rock fades between the two.

Rain takes it away completely. Water is what binds a loose surface, so
there is no dust left to lift: what a wheel picks up in the wet is dark
clods of mud (the `MUD` style, and `MUD_CLODS` in `ground-tint.ts`), thrown
harder and on the ground again inside a second. The wet stage sounds
different too — see [audio.md](audio.md).

A sealed road has nothing lying on it to pick up, so it is also the one
surface that throws nothing for ordinary driving, however hard it is being
driven. What it gives instead is TIRE SMOKE, and only at the three moments a
tire is genuinely overwhelmed: the wheels spinning up off the line, a
committed drift (`car.drifting`, the settled angle — not `car.slide`, which
moves in every corner), and braking hard from real speed. Sparingly at each
— the policy is `TARMAC_SMOKE` in `pwa/src/game/dust.ts`, and the four
`shot-tarmac-*` screenshot scenes are its acceptance test, one of which
exists to show that flat out on tarmac leaves nothing behind the car.

A tyre also COOKS. Smoke off a tyre that has only just let go is clean and
white; one that has been sliding for a second or more is burning, and the
cloud behind it goes black (`SOOT` in `pwa/src/game/ground-tint.ts` — the
renderer keeps the heat, because it is the one thing about a tyre that is a
history rather than an instant). The soot builds slowly on purpose: it is
the reward for committing to a slide, not the price of turning the wheel.

## The road's cross-section

A rally road is not a flat carpet ruled onto the landscape, and the car
feels the difference (`engine/mapgen/road.ts`, R16 — one module the drawn
ribbon, the terrain's verge and the physics all read):

- **Camber.** The road is crowned so water runs off it; the further out
  you run, the more the ground falls away under you and the more the car
  is shed toward the outside.
- **The bank.** Where the road TURNS it is superelevated (R19): the whole
  cross-section rolls into the corner, outside edge proud of the inside,
  over a runoff long enough that the car settles onto it rather than hits
  it. The tighter the corner the harder it banks, up to a ceiling that is
  a road's and not a speedway's. The crown comes out as the bank goes in —
  a banked corner is one plane, or the inside edge would be a gutter — and
  the physics gets it for free, because the cross-slope under the wheels
  is the same lateral pull a hillside gives. On a corner it is the biggest
  of the three, and it is what makes a turn something you can lean on.
- **The five lines.** A dirt road is not one surface: read across it there
  are a loose pale edge on each side that no wheel ever touches, two worn
  TRACKS where every car before you put its wheels, and the crown between
  them. The tracks sit a real car's track-width apart — a wheel track is a
  wheel track whether the road is a lane or a boulevard, so they do not
  scale out with the width — and they are troughs deep enough to feel: the
  car settles into one and has to be steered out of it, and a car left to
  itself on the crown will drift off into a track. That curvature across
  the road is also what stops a gravel stage looking like a flat brown
  ribbon. Asphalt polishes rather than ruts.
- **The mat.** Asphalt is laid ON the ground: the mat stands proud of the
  verge with its edge chippings spilled down the side, and the joint at
  each end of a sealed run ramps rather than steps.
- **The verge.** Past the shoulder the ground breaks over and leans away
  into the field — a slope a car can run out onto and get back off, drawn
  by the road ribbon (sampled every 2 m) rather than the 14 m ground
  lattice, which could not hold an edge. There is no ditch: a trench ruled
  down both sides of a rally road reads as a scar cut by a machine, and it
  swallows a car the moment it puts a wheel wide.

## Crossing the line

The finish is a gate on a road, not the end of one. R25 builds a RUN-OUT
past it — a couple of hundred metres of road the clock never sees — and the
run does not stop when the time does. Crossing the line puts the run into
its `rollout` phase: the result goes up immediately, control leaves the
player, and the car is driven home by `TUNING.rollOut` — off the throttle,
easing onto a trailing brake rather than standing on it, steering gently
back toward the middle of the road so a car that arrived sideways gathers
itself up. The camera plants where it was standing and pans to watch the
car go. The run is over when the car has stopped (or, for a wreck facing a
hill, when `rollOut.maxTime` runs out).

A circuit has no run-out and needs none: its finish is its own start line,
with a whole lap of road already the other side of it, so it finishes at the
line the way it always has.

Anything measuring the run measures it at the LINE: `raceTime` stops there,
and the sim's `trackLength` is the raced distance rather than the whole
compiled ribbon, so a pace column never has a coast-down folded into it.

## Checkpoints (R28)

A stage is cut into split boards roughly `STAGE_RULES.checkpoint.spacing`
seconds of driving apart (15 s at the measured bot pace, so ~390 m), and
every board stands just past a corner's EXIT. Which corner is the rule that
matters: inside the target gap nothing but a hard turn earns a board, from
the gap a medium will do, and only past `late` is a soft bend taken rather
than let the split drift. A board is therefore something the road made you
work for, and being sent back through that corner is what makes it cost.
The generator does the placing (`engine/mapgen/compile.ts`); no board is
laid inside `finishClear` of the finish gate, where a split would only say
what the line is about to say properly.

Driving through one books a split: `checkpoint` fires with the board's
index, how many the lap has, and the race clock as it passed, and the time
goes on `state.checkpointTimes`. The window is arc position (the same
mechanism R27's crowd uses), so a car put back on a board it has already
driven through never books it twice. A circuit re-arms all of them each lap;
the times stay on one list for the whole run.

Two things read the splits. The HUD puts the gap up under the race clock for
a few seconds — measured against the ghost's own splits, which ride on the
tape (`GhostRun.splits`) rather than being read back off the replay, so the
number is there from the first board even on a run that is well up the road
on its ghost. And a respawn goes to the last board (above).

## The open world

The road runs through a landscape the car can actually drive
(`engine/mapgen/terrain.ts` — the same seeded field the renderer draws, so
the ground under the wheels IS the ground on screen). Leaving the road is
not a mistake anymore; it is exploration:

- **The ground** — off the verge the car rides the terrain — and it rides
  the DRAWN terrain: the physics samples the same triangle lattice the
  renderer builds its ground tiles from (`TerrainField.groundAt`,
  `GROUND_CELL`), so the car sits on the slope on screen instead of
  sinking into it where the analytic field and the mesh disagree. It
  rides that ground on its whole FOOTPRINT rather than on the one point
  under its middle: the body's four corners are sampled and the car is
  seated on the highest of them, so ground the body's own attitude cannot
  follow — a face steeper than `TUNING.attitude.pitchMax`, the crease
  where two lattice triangles meet, the foot of a cut bank — no longer
  buries one end of it. A corner over ground rising harder than
  `TUNING.collision.climbLimit` is against a WALL rather than standing on
  a slope, so its claim is capped there and the contact model takes over.
  The
  grade under the wheels is read over a wheelbase-scale baseline
  (`TUNING.hills.gradeSpan`) along the heading AND across it: banks push
  back the moment the wheels touch them, the nose pitches with the local
  hillside, and a side slope pulls the car toward its downhill side. The
  brow keeps the road's wide baseline, so a cliff edge or a sharp bank at
  pace still throws the car — spontaneous jumps, no ramp required. Rough
  ground caps pace around 150 km/h (`TUNING.surfaces.natureTop`); the road
  is faster, always.
- **Water** — the landscape floods below the water table
  (`terrain.LAKE_Y`): lakes, sea basins, and the rivers that run into them
  (R18). Shallows and fords slow the car and splash; **deep water is the
  one crash left** — and it is a drowning, not a teleport: see below.
  Nothing solid ever crashes the car. The channel under a bridge is cut
  deep enough to qualify, so going over a parapet is a drowning, not a
  shortcut. Water is only water where the ground the car rides is UNDER it
  (`terrain.waterAt` asks the ground lattice, and a road standing over the
  water answers for itself): a lake under an embankment, a channel running
  under a hillside the tiles never dip into, and the river under a bridge
  deck are all somebody else's problem to the car on top of them.
- **Other people's roads** — the branch the route abandons at each junction
  is real road: the terrain flattens its shelf, the forest keeps off it,
  and a car that drives past the tape drives on the surface that branch is
  actually made of (`terrain.spurSurfaceAt`) — tarmac grip on a sealed one,
  gravel on a graded one, and neither of them the rough ground's cap. It
  runs off the map; where it goes is between the player and the horizon.
- **The ends of the stage** — off the road is not only sideways. The stage
  is drawn and shelved for one APRON (30 m) past each end — the run-up
  before the start gate and the run-off past the flying finish — and that
  apron is road: flat at the gate's own height, with the terrain's shelf
  under it. Past it the stage is over and the terrain owns the ground, the
  same as if the car had driven off the side. Reverse away from the start
  line for long enough and the country takes over, hills and all.
- **Solid props and the forest** — the wild scatters boulders and fallen
  trunks, loose rock litter, cut stumps under the woods, ROCKY OUTCROPS
  (five to ten stones bedded into one steep hillside, strung along the
  contour, biggest in the middle) and the bedrock slabs that shoulder out
  of a cut wall beside the road (`terrain.obstaclesNear`); the forest's
  trees stand on solid trunks of their own (`terrain.treesNear`, placed by
  the same engine-side grove quilt the renderer picks species from) —
  everything seeded, kept off the road, and drawn exactly where the physics
  collides with it. Contact does not teleport the car anywhere: it bends
  it — see the collision model below. A fallen trunk lies low enough to
  jump; a tree is not.
- **Blowdowns** — where a noise field says a gale went through, the deep
  wild's fallen timber thickens, grows to old-tree size, and comes down in
  twos and threes lying PARALLEL: down the fall line where the ground has
  one, along that seed's own gale bearing where it does not, and spaced
  across that line rather than end to end, so a car meets one trunk at a
  time. A lying trunk's `spin` is the compass bearing it lies along rather
  than a free yaw — `planting.ts` turns it into the rotation the drawn log
  needs.
- **The forest stands in clumps** — a tree cell holds a CLUMP rather than a
  trunk: one to four stems thrown into a couple of metres around the cell's
  candidate, more of them where the stand noise is thick, one of them
  always the biggest. The cell's own chance is divided by the clump's
  expected size, so a hectare of forest carries exactly as many trunks as
  it did — what changes is that they arrive in knots with light between
  them instead of one per ten-metre cell.
- **What counts as an obstacle** — `SOLID_PROP_HEIGHT` (0.45 m) is the
  bar, and it is the MIDDLE OF THE HOOD: the catalog's bonnets sit about
  0.87 m over the ground, so anything standing higher than half of that
  meets the body and is placed as a solid. Stone shorter than the bar is
  litter the renderer scatters for itself and the wheels ride straight
  over, and it is the only stone the renderer is allowed to plant. Nothing
  solid stands inside the road ribbon's own reach (`ROAD_CROSS.reach`,
  6.5 m past the mat) — rim included, not just centre — so the shoulder
  and the ditch stay as survivable as they ever were, and the first thing
  a car running wide can hit is out where the trees already stood.

### Going under

Water more than `TUNING.crash.deepWater` (0.9 m) over the ground the car is
standing on is water it is not driving out of. The run is lost at that
instant — a big `splash` (`deep: true`, carrying the entry speed) and the
`crash` event — but the car is **not** lifted off the lake. `state.drowning`
is set instead, and for `TUNING.crash.drown.duration` seconds nothing else
in the run advances: no input is read, no progress accrues, no surface is
resolved and the wedge clock does not run. The race clock does, and those
seconds ARE the penalty.

What happens inside them is three beats, and it needs to be three or it
reads as a teleport with a delay bolted on:

1. **The plunge.** The water takes the momentum over `stopIn` (0.5 s) and
   the yaw over the slower `slewIn` (2.5 s), so the car carries its line a
   few metres in and keeps swinging after it has stopped going anywhere. A
   fall from a bridge is swallowed only as far as `plunge` (7 m/s) — enough
   to duck the whole car under, not enough to put it on the bed before it
   has floated.
2. **The float.** Buoyancy is an underdamped spring (`buoyancy`, `damping`)
   pulling the hull to its waterline `draft` (0.5 m) under the surface, so
   the entry corks back up past it and rocks two or three times before the
   lake goes flat. The attitude forgets the crash that put it there over
   `settle`, and the roll settles through a decaying swell (`rock`,
   `rockRate`, `calm`).
3. **The sink.** From `float` (2.4 s) to the end, that waterline walks down
   — smoothstepped, so the water starts winning gradually — toward
   `depth` (3.4 m) or the bed, whichever is shallower: in a tarn the car
   settles on the bottom with its roof awash rather than sinking through
   the landscape. The nose drops `noseDown` on the way, because the engine
   is the heavy end. When the roof (`roof`, 1.3 m over the wheels) passes
   under, a one-shot `sink` event fires — the gulp, not the entry.

The respawn is at the far end, and it is the only thing that clears
`state.drowning`.

- **The way home** — exploring never times out, and hitting things never
  ends it: crash into trees for as long as the car still moves. Only two
  things put a car back on the road, and they land in DIFFERENT places. The
  **reset input** (`CarInput.reset`, the B key / the HUD's TRACK button) is
  the run being given up on, so it costs the road back to the last
  checkpoint (`lastCheckpoint`, R28) — the same place a drowning respawns
  at. The **wedge check** — throttle held for `TUNING.offTrack.stuck.after`
  seconds without covering `stuck.radius` meters — is not: nobody asked for
  it, the car is pinned through no decision of the driver's, and a rescue
  that cost a checkpoint would put the car back at a board it has already
  proved it can drive from into the same trunk, forever. That one goes to
  the road where the car stands (`wayHome`). A car pinned against a trunk is
  not driving out of it; anything still making ground is left alone. Either
  way `state.progressIndex` comes back with the car: the road in between is
  road the run has to drive again. The TRACK button is there
  the whole time the car is off the road — a driver two metres into a ditch
  should not have to be lost first — but the ALERT waits for the car to
  actually be lost (`trackLost`, `TUNING.offTrack.guide`): more than 20 m
  out AND pointed more than 110° away from the way home. Two wheels on the
  verge is not lost, and neither is a clearing crossed perpendicular with the
  stage running alongside. Once it is, the co-driver's strip reads RETURN TO
  TRACK with the distance to the road, a footnote saying what the button
  costs (the last checkpoint), and an arrow hangs over the car pointing at
  the road itself. Going OFF has no threshold of its own: the alert is an
  instruction, so the only thing that clears it is the track being back
  under the wheels. Nearing the road or aiming at it leaves it up, which is
  also what stops a wandering car blinking it on and off.

## Weight: the springs

The wheels track the ground exactly; the **body does not**. `TUNING.suspension`
is a second-order spring the whole sprung mass rides on, deliberately
under-damped so it OVERSHOOTS and settles rather than easing to rest — a body
that just cushions reads as a sprite on a plane, and the rebound is what reads
as mass. Two readouts come out of it, both written by the engine and only ever
drawn by the renderer:

- **`CarState.ride`** — how far the body sits from where the wheels put it, m
  (negative is compressed). It is excited by one thing: a change in the
  WHEELS' vertical speed. A dip flattening out at the bottom of a descent, a
  landing, a bank that stops the nose — each arrives as a jolt the springs
  swallow and give back. Past `travel`/`droop` the bump stops catch it, stiff
  and heavily damped, so a slam is absorbed rather than pogoed. Heavier cars
  ride the same springs more slowly (ω ∝ √(k/m)).

  **The whole envelope is a bodywork measurement.** `heaveMax` is held at the
  tightest gap between arch and tire on the roster (0.08–0.11 m — see
  `arches.radius` against `wheelRadius` in `pwa/src/game/car-styles.ts`),
  because past that the shell is visibly sliding off its own wheels rather
  than riding on them. Two things keep the springs inside it. The ground-
  follow jolt is capped at `joltMax`: a valley floor at pace is several g held
  for a fifth of a second, no spring soft enough to feel like a rally car
  holds a body against that inside a wheel arch, and past the cap the dampers
  are simply out of authority and the whole car rides the ground up — which is
  what a bottomed suspension does. A landing and an impact are velocity steps
  of their own and are not capped. And the wheels' vertical speed is read from
  the car's DIRECTION OF TRAVEL, not its heading (`slope` × `u` plus
  `slopeLat` × `w`, which is the ground's gradient dotted with the velocity),
  so a car sliding across a uniform hillside no longer reports a vertical
  speed that swings with its own yaw.

- **`CarState.pitchLoad`** — the dive under the brakes, the squat on the power
  and the nose-dip an impact throws in. Kept apart from `pitch` (the ground's
  own attitude) because only the BODY takes it: the wheels stay on the ground,
  and so does the shadow.

The renderer draws both on a `chassis` group that holds every panel and no
wheel (`pwa/src/game/car-body.ts`). The hood cam's mount is bolted to the body
and rides all of it — though what the player looks through is the driver's
HEAD, a damped spring chasing that mount, so the picture lags every jolt the
body takes and settles a beat after it does. The cameras close behind share a
little of the heave so a landing lands in the FRAME too, and the ones flown
high above the car share none.

Each car's `mass` (kg, in `engine/game/defs/cars.ts`) is read against
`TUNING.collision.refMass`: a heavier car is harder for a clipped tree to
spin, folds deeper into what it hits (the energy is real), and rides its
springs more slowly. It deliberately does NOT divide the longitudinal model —
`gearAccel` is already an acceleration.

## Collision and damage

The contact model lives in `engine/game/collision.ts`; every number is in
`TUNING.collision`. The car is an oriented box in the ground plane — sized to
CONTAIN the larger of the two drawn shells, because a box smaller than the
body is a car that visibly passes through trunks before anything happens —
every solid is a circle, and a hit does several things at once:

- **The impulse.** Speed INTO the surface comes back at a low restitution
  (a tree absorbs a rally car, it does not trampoline it); speed ALONG it
  mostly survives, so a glancing blow is a scrape that carries on. The
  lever arm turns the velocity change into yaw — clipping a trunk with a
  corner spins the car instead of politely stopping it. Below
  `scuffSpeed`, contact is a scuff: the car stops against the rock,
  unmarked.
- **What the solid does about it.** Nothing in the wild is infinitely
  heavy. Every standing thing carries a mass, a rooting (how much of it
  the ground holds) and a snapping strength, all three derived from the
  shape it is drawn as and the material it is drawn in
  (`engine/mapgen/solids.ts`). The contact weighs the car against them and
  the weaker of two things gives first: the GROUND'S HOLD, and the thing
  comes out of its bed and leaves with the momentum the car gave it; or
  its own STRUCTURE, and it breaks, taking exactly the impulse that cost
  and letting the car through. Either way it is gone from the world —
  a `solidBreak` event the renderer retires the drawing for and tumbles
  the piece away from (`pwa/src/game/breakage.ts`).

  So the size of what you hit is now the whole story. A football-sized
  stone is a bang and a scratch and the stone is what leaves; a boulder
  ten times the car's weight has not moved since the ice age and never
  will. A sapling goes down under an ordinary excursion; the biggest
  spruce on the stage is a wall until about 120 km/h, and going through
  one costs very nearly everything you arrived with.

- **The trip.** A solid standing below the car's centre of mass catches
  the bottom of it while the body above keeps going, which is how a rally
  car actually rolls: not off a bank, off a rock at the side of the road.
  A flank sliding at pace into something low and solid rolls hard enough
  to lift the inside wheels off the ground, and from there the car is
  FLYING and finishes the roll in the air. A trunk, which meets the whole
  side of the car at once, only ever shoves it (`solids.trip`).
- **The crush.** Closing speed past the scuff floor folds the struck
  panels in, permanently — eight zones ring the body (`CarState.damage`),
  and the renderer bends the body's actual polygons from the ledger
  (`pwa/src/game/car-damage.ts`): pulled inward, crumpled, scuffed darker.
  Zone crush past a part's bolt strength (`partAt`) tears it off —
  mirrors, bumpers, the wing — as a `partBreak` event the renderer turns
  into tumbling debris. **Hard landings are impacts too**: descent the
  suspension cannot absorb (`hardLandSpeed`) crushes the underside (the
  `belly`), or the flank the car came down on. **So is the ground itself**:
  off the road, a face rising faster than `climbLimit` under the wheels stops
  being a hill and starts refusing the car, at `wallSlope` completely. The
  terrain's gradient at the bumper IS the contact normal, so a cliff met head
  on takes the pace and folds the nose while one met at an angle deflects the
  car along it — and the car is backed out of however much of the step the
  face refused, which is why it never ends up inside a mountain.
- **The springs.** Every contact also loads them (`TUNING.suspension`):
  the wheels stop and the body does not, so the car rocks and the nose dips
  for a beat afterwards. See [Weight: the springs](#weight-the-springs).
- **The wear.** Every crush adds structural wear; wear 1 is the wreck — a
  car with nothing left to give, which keeps driving exactly where it is.
  Nothing recovers it: a wreck is driven home, and the chassis is patched
  back to `repairTo` only once something (the reset, the wedge check) puts
  it back on the road. The dents, the torn-off parts and the hurt systems
  all stay: the run remembers.

### What a broken car drives like

Nothing in the damage ledger is decoration. `engine/game/damage.ts` reads
the whole of it once per step and hands the handling model the multipliers
it drives through; `TUNING.collision.systems` and `TUNING.collision.chassis`
hold every number. The rule sizing all of them is that damage **degrades and
never disables** — a car the player cannot move is a respawn two seconds
later, not a consequence — so a car with every gauge at its worst still
crawls to the finish at somewhere around a third of its sound top speed.

Under the panels live four **internal systems** (`damage.systems`), each
fed by the crush landing nearest to it and each degrading its own job:

| System     | Hurt by                     | Effect when damaged                                                       |
| ---------- | --------------------------- | ------------------------------------------------------------------------- |
| Engine     | Nose and front-corner crush | Power fades (`systems.powerLoss`), and past `chassis.misfireFrom` the     |
|            |                             | ignition drops beats outright — the car lurches instead of pulling        |
| Suspension | Flank and belly crush       | Less lateral grip, narrower landing tolerance, wobblier touchdowns        |
| Gearbox    | Rear and belly crush        | Shift cuts stretch; past `chassis.topGearAt` the top ratio stops engaging |
| Steering   | Front-corner crush          | The rack loses authority (up to `systems.steerLoss`)                      |

The rest of the ledger is felt too:

| Signal                      | Effect on the driving                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| Structural wear             | Lateral grip and braking fall away (`chassis.wearGrip`, `wearBrake`) and   |
|                             | the shell drags (`wearDrag`) — a spent car is slow, loose, and stops long  |
| Crush, left side vs right   | **The pull**: a body folded harder down one side carries lock with the     |
|                             | wheel dead straight (`chassis.pullPerCrush`), so the driver holds a        |
|                             | correction into it down every straight                                     |
| Crush anywhere, belly crush | Drag: a car folded on every corner is not the shape it was drawn as, and a |
|                             | folded floorpan ploughs (`chassis.crushDrag`, `bellyDrag`)                 |
| Parts left on the road      | Drag, per part (`chassis.partDrag`) — a mirror is a rounding error, a      |
|                             | missing bonnet is a scoop with the engine bay behind it                    |
| The spoiler specifically    | Downforce the back of the car no longer has, faded in with pace            |
|                             | (`chassis.spoilerGrip` over `spoilerSpeed`)                                |

Grip is the one place the taxes stack — suspension, structure and the missing
wing all pull on it — so `chassis.gripFloor` is the floor under all three
together: below about two thirds of the sound car's grip nothing can be
pointed, and an unpointable car is not a consequence either.

Nothing repairs mid-run. The HUD's damage instrument (top of the bottom-left
cluster, over the rev counter) is a single top-view car: the crush ring wears
the folds where the hits landed, the breakables cross out red as they tear
off, the shell's own outline is the chassis the wreck is called on, and each
system is drawn as the part it is — the engine block under the bonnet, the
rack across the front axle, the gearbox down the tunnel, the suspension at
the four wheels. A sound part reads as quiet steel; a hurt one takes color,
yellow folding to red as it gives out, so a glance finds the one part that is
wrong instead of scanning a row of bars.

Seven pieces can come off: the two bumpers, the two mirrors, the spoiler, and
the two lids. A bonnet or boot lid is bolted deeper than the bumper in front
of it (`TUNING.collision.partAt.lid`), so it only lets go once the clip around
it has folded far enough to pull its hinges — and what is left showing is the
dark bay the panel was covering.

## The drivetrain

Which wheels a car drives is real physics, not a badge. `spec.drive` selects
a row of `TUNING.drivetrain`, and that row scales the magnitudes in
`TUNING.grip` and `TUNING.drift`. Nothing branches per CAR — the model reads
the layout's row and the car's own numbers, and that is the whole difference
between the three in the roster.

What the layout decides:

- **What the throttle does mid-slide.** A driven rear axle feeds the slide
  (`powerYaw`). Driven front wheels pull the car toward where they point, so
  the throttle pulls it STRAIGHT out of one (`pullStraight`) — ungated by
  the wheel, because power-on understeer is exactly what is felt while you
  are still asking for the corner. Four-wheel-drive sits between the two.
- **What a LIFT does.** Taking the weight off the driven axle swings the
  tail (`liftYaw`). It is what a front-driver has instead of power
  oversteer: it is rotated on the pedal, not on the wheel.
- **Whether torque alone can unstick it.** A rear axle with real torque
  under it spins up at the bottom of the gear and steps the tail out at
  walking pace (`torqueSpin` × `spec.torque` × the layout's `spin`). That is
  why the rear-driver can be drifted at 10 km/h and the front-driver — whose
  axle just goes straight on when it lets go — cannot be drifted at all.
- **Where the slide starts and how fast it lets go** (`entry`, `release`):
  a front-driver understeers up to the limit and gathers itself up quickly;
  a rear-driver has gone before it gets there and hangs on afterwards.
- **How far the slide DEVELOPS once it has started** (`depth`, 0..1 against
  the rear-driver's fully developed one). Where it begins and how deep it
  goes are different questions: a front axle that runs out of grip WASHES
  WIDE, so the hatch crosses the same threshold and then holds roughly half
  the angle the saloon does at the same lock. Reaching a real angle in it
  costs a flick, a lift or the handbrake rather than just the wheel — and the
  handbrake still gets there, because the lever's yaw goes around this. Never
  set over 1: an asked slide above the carried one pins `releasing` at zero
  and the exit stops existing.
- **How much torque reaches the ground** (`bite` × `spec.traction` × the
  surface's grip). One driven axle on a loose surface spins where four
  driven wheels hook up, worst at the bottom of the gear and gone by the top
  of it. It is the four-wheel-drive's whole case and the rear-driver's whole
  cost — a standing start through water keeps well under half its dry pace.
- **Which wheels are SEEN to spin.** The same torque loss above is carried
  out to the renderer as `CarState.wheelspin` (0..1, chased at
  `TUNING.engine.spinSettle` so a throttle fed in and out of a corner cannot
  strobe the drawn wheels), and the app spins the DRIVEN axle by it and no
  other. Every wheel otherwise turns at the speed of its own contact patch —
  the car's velocity at that corner of it, projected onto the way the wheel
  points — so an undriven pair can only ever report the road: a front-driver
  lighting its tyres up on the line still has two wheels standing still, and a
  rear-driver's fronts visibly slow when opposite lock drags them sideways.
- **How hard the rear weathervanes the nose straight** (`snap` ×
  `TUNING.drift.releaseSnap`) — which is what decides how long a slide
  LINGERS once the wheel is centred. Not `release`: a slower release holds
  the slide up and the weathervane scales with exactly that, so the two
  cancel. A rear axle still under power resists being pulled straight; an
  undriven one, dragging, does the pulling.
- **Where the speed floor under the whole slide sits** (`driftFloor` ×
  `TUNING.drift.slideFrom`). The floor is what stops a hairpin at walking
  pace, a scrabble out of a ditch and a nudge on the grid all reading as
  drifts, and it is a rule the player is told (it will not drift under 70).
  The rear-driver is its ONE exception, down at walking pace — that is what
  makes its tail-out register at all, and it is the whole reason the floor is
  a per-layout number.

### The flick

The move the game is named after. Wind the wheel away from the corner and
snap it back: the weight thrown across the car takes the rear wide with no
driven axle involved at all, which is how a FRONT-driven car gets sideways
in the first place. It reads the rack's SPEED rather than its position (a
wheel held at full lock throws nothing) and only counts hands that are
CROSSING the car rather than chasing it, so winding on more lock mid-corner
is not a flick and neither is catching a slide.

The throw both takes grip away (`grip.flickThrow`, into the same demand the
wheel's own lateral ask feeds) and puts yaw in (`grip.flickYaw`). The load
is held on `car.flick` and settles over the better part of half a second
(`steering.flickSettle`) — the hands are only over the other side for about
fifty milliseconds, and a torque that lived only that long would do nothing.
At 25 m/s the front-driver settles at about 8° of slip on a lock it turns
straight in on, and around 15° on the same lock flicked.

## Cars and gearboxes

Cars are data rows (`engine/game/defs/cars.ts`), and the roster is three
ANSWERS to the same stage rather than three points on one scale:

- **Vireo GT (FWD)** — an upright two-box hatch on road rubber. The most
  lateral grip in the roster on a sealed surface and the sharpest turn-in,
  a peaky engine that has to be kept in the band, and the second-shortest
  gearing. It understeers up to the limit and straightens itself on the
  power, so it is rotated on the lift or on a flick. Owns the tarmac stage;
  worst of the three on loose.
- **Sable 1600 (RWD)** — a light three-box saloon on gravel rubber. The
  least powerful and lowest-geared car here, with the most low-gear shove
  and the most rotation: it will hang its tail out at 10 km/h and it turns a
  loose stage into a series of drifts. It spins its wheels off the line on
  anything slippery and has nothing to lean on when the road is sealed.
  Owns dry gravel; worst of the three on tarmac.
- **Kestrel RS (AWD)** — a flared two-door with a turbocharged four and
  drive to all of it. Heaviest, most powerful, tallest-geared, and the only
  one that puts its torque down whatever it is standing on. Lazy to turn in
  and never as playful as the other two — and quicker than both wherever the
  surface is mixed, the road climbs, or there is water in it. Never worst at
  anything.

Nominal gear tops overshoot what surface drag lets a car hold; the real
equilibria rank the same way the gearing does, and `tests/explore_test.ts`
pins both the ranking and the spread.

**The gearbox is the driver's, not the car's.** Every car in the roster takes
either box; which one is a player setting — offered on the pre-race card
where the car is chosen, and again under OPTIONS → CONTROLS — carried for
the run on `CarState.gearbox` and defaulting to the automatic. The bot
shifts a manual by the same thresholds the auto box uses, so both are
simulated fairly (see [simulation.md](simulation.md)).

**The box is a TRADE, and it has numbers on it** (`TUNING.gearbox.set`). The
automatic is the road box: the catalog's ratios, taken for you, never
fluffed. The manual is the racing set — every gear 6% taller and pulling 5%
harder, worth about **+6% top speed in any car** (204 → 216 km/h in the
Vireo, 242 → 256 in the Kestrel) — paid for with `shiftCut` (0.1 s of
throttle) at every shift the driver now has to take themselves. Off the line
the two are within a tenth of each other to 100 km/h, and which way depends
on how many shifts the car needs to get there.

`gearedSpec(spec, gearbox)` (`defs/cars.ts`) folds the box into the run's
`GameState.spec` once, at `createGame`. Everything downstream — the shift
points, the taper, the bot's target speed, the boost's overrun cap, the rev
counter, the engine note, the pre-race card's spec sheet — reads one spec
and knows nothing about transmissions. Both boxes are multipliers on the
same catalog row, so no car is handed a better box than another and the
roster's spread stays the roster's.

**Balance is measured, not asserted.** `npm run sim -- --sweep` races the
whole roster over five stage archetypes and ranks them per archetype; one
car being fastest on all five is the failure it exists to catch. Any change
to these numbers owes that table.

**Revs** (`CarState.rev`, 0 at idle and 1 at the redline) are gearing plus
forward speed — there is no crank in the model, and reading them off the
speed the gearbox itself shifts on is what keeps the tachometer, the shift
light and the engine note from ever disagreeing. The one exception is the
START CONTROL: through both of its beats nothing is geared (the HUD reads
**N**) and the car is not moving, so the throttle drives the revs directly,
up at `TUNING.revs.blip` and down at `settle`. Blipping it on the line is the
only thing the player can do while they wait, and the needle and the engine
both answer.

## The start control

A run opens held, in two beats, and neither is driveable:

- **`intro`** (`TUNING.intro`, 7 s) — the establishing shot. The camera
  circles the start control and comes down onto the car
  (`pwa/src/game/camera-start.ts`), and the crew in front — stood alongside
  the player's own slot, `GRID_STAGGER` metres to their right, because two
  rally cars do not occupy the same square metre of road — leaves the line
  and drives away up the road. Any deliberate pedal, the handbrake or a shift
  skips it (`skipIntro`), which jumps the field on by the same seconds so the
  stagger is not quietly shortened. The ENGINE's skip is instant, because the
  field's stagger depends on it being one step; the CAMERA answers it by
  flying the rest of the shot at speed (`RUSH`), so skipping is a quick move
  to the driving view rather than a cut.
- **`countdown`** (`TUNING.countdown`, 3 s) — the gantry. One red per second,
  a tick on each, then green. Nobody skips this one.

The two are sized to sum to `START_INTERVAL`, so the player's green light
lands exactly one interval after the car ahead of them left — the stagger the
classification is read off is a thing the player WATCHES rather than a rule
they are told about. `startsIn(state)` counts through both; `skipCountdown`
(the sim, the menu's demo, every rival) skips them both.

## Car against car

Everything above is the car against the world. The one contact where nothing
is anchored is the car against ANOTHER car — the crew in front, once you have
caught them (`collideCars`, `TUNING.collision.cars`).

The body is a CAPSULE here rather than the oriented box the wild's solids
meet: a spine down the middle of the car with the box's own half-width as its
radius. Two boxes need a separating-axis solve, and the normal it yields
snaps between faces as they slide past each other — which is exactly the
contact that has to feel smooth, the long scrape down a flank. Two capsules
give one continuous normal and round the corners off, which is what a bumper
is anyway.

The exchange is a proper two-body one, contact point and all: an impulse
along the normal with `cars.restitution`, a friction term across it that
keeps `cars.tangentKeep` of the relative slide, separation shared out by
inverse mass, and a yaw kick on each body from its own lever arm. The
velocity is read AT the contact, so a car swinging its tail into the one
beside it delivers the tail's speed. Both cars pay: crush lands on both, at
`cars.crushShare` of what the same closing speed into a tree would fold,
because a post does not deform and a car does. Under `scuffSpeed` it is a
nudge — separated, undamaged, no event.

Contacts exist only between cars that are both ON THE ROAD: a car still in
the start control cannot be touched, which is what lets the whole field be
built on one staging slot. Rivals never resolve against each other — see
[simulation.md](simulation.md).

## Tuning etiquette

Numbers live in `engine/game/defs/tuning.ts` (global feel) and `cars.ts` (per car) — never inline in the model. **`TUNING.drift` is the group that shapes the slide itself** — where it starts, how it comes in, how deep it goes, how it lets go, and when it reads as a drift — and the [`drift-feel`](../.agent/skills/drift-feel/SKILL.md) skill is the map to it: read that before touching any of it. `TUNING.steering` holds the wheel's own response (the rack's rate, the low-speed ramp-in, the high-speed fade, the centred-wheel commitment floor, the tail-torque chatter guard), `TUNING.grip` what is left of the tires (scrub, the slip's self-rotation, power oversteer, the front axle's pull, the lift, the flick, the handbrake), `TUNING.engine` how a car's torque arrives inside a gear and how much of it reaches the ground, and `TUNING.drivetrain` what all of that is worth to each layout. Any change here must run `make sim` before and after, and keep `tests/drift_test.ts` / `tests/jump_test.ts` honest: those tests encode the moments this document describes.

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
  by the floor rather than carried down to a standstill — and everything the
  wheel alone can do passes through it. A car going sideways at walking pace
  is not this game's drama; it is a car that will not go where it is
  pointed. The one thing that argues with it is a MOVE (below): the corners
  that need one are the slow ones, so a full provocation lowers the floor by
  `provokeFloor` — the handbrake, on its own, to about 31 km/h. It costs a
  deliberate act to claim, so a scrabble out of a ditch and a nudge on the
  grid are as gripped as they ever were.
- **What a MOVE buys.** How much slide the WHEEL alone develops is the
  layout's (`TUNING.drivetrain[].depth`), and on anything but the
  rear-driver that is deliberately not much. The three ways a driver takes
  the weight off the rear each lift that ceiling toward the reference slide
  — the mass thrown by a flick (`drift.flickDepth`), the nose pitched down
  on a trailed brake (`brakeDepth` × the layout's own `brake`), and the rear
  wheels locked outright (`leverDepth`). The largest wins rather than the
  sum; the lift it is worth is the layout's own shortfall against its own
  CEILING (`drivetrain[].cap`), so a move is worth most to the car with the
  least of its own and still never takes that car past what the layout can
  do. The ceiling is the roster's whole spread: the saloon's is the
  reference slide, the four-wheel-drive reaches 0.96 of it and the hatch
  0.92 — nearly level, on purpose. Real layouts differ far less in the
  angle they can be GOT to than in what holds them there: provoked, all
  three go round (25° / 29° / 36° off the lever on gravel), and what
  separates them is the throttle — `drift.powerSpan` and `pullStraight`
  below. Lifted toward 1 instead — which is what this used to do — a
  provocation handed every layout the reference angle, and the hatch, having
  the furthest to be lifted, came out of a hairpin on the lever as sideways
  as the saloon that had it all along. And it is HELD once made
  (`provokeSettle`): the lever comes up in a tick and the weight it moved
  does not. None of them rotates anything by itself — they open the slide,
  and `grip.flickYaw`, `brakeYaw`, `liftYaw` and `handbrakeYaw` are what
  walk the car through the gap.
- **The demand is what the wheel ASKS for**, never the yaw the car ended up
  with. The slide feeds extra yaw authority back into the car, so measuring
  it off the resulting yaw closes a positive feedback loop with no
  equilibrium in the middle — the car would have exactly two states,
  gripped or fully sideways, a notch of wheel apart. Commanded demand is
  what makes the angle a continuous function of lock and speed.
- **THE THROTTLE IS THE DIFFERENCE BETWEEN THE LAYOUTS.** A rear-driver on
  the power has a real steady-state drift — the rear tyre's longitudinal
  force is what holds it out there, so the angle stays for as long as the
  pedal is down. A front-driver has no such equilibrium at all: the driven
  wheels pull the velocity back under the nose, so its big angles are entry
  transients off the lever, the brake or a lift and they die the moment the
  power goes on. That is `drift.powerSpan` (the throttle deepening the ANGLE
  ASKED FOR, ×the layout's `powerYaw`) and `grip.pullStraight` (the throttle
  pulling a front-driver out of one), and it is why the three cars want
  opposite pedals mid-corner. Asked to hold twenty degrees on gravel the
  saloon settles at 15.8° on the power and 12.1° off it; the hatch settles
  at 9.9° on and 10.4° OFF — the pedal takes its angle away. It is a far
  bigger difference than the angles the three can reach, which is exactly
  the shape real layouts have.
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
  and a centred wheel hands the car back. At 119 km/h the classic — the
  REAR-driver, the layout every knob in the group is calibrated against and
  so the deepest slide on the roster — answers a lock sweep like this, with
  no step in it anywhere:

  | lock     | 0.2 | 0.3 | 0.4 | 0.5 | 0.6  | 0.7  | 0.8  | 0.9  | 1.0  |
  | -------- | --- | --- | --- | --- | ---- | ---- | ---- | ---- | ---- |
  | slip°    | 1.2 | 2.4 | 4.7 | 7.8 | 11.4 | 14.0 | 16.0 | 17.6 | 18.8 |
  | radius m | 224 | 128 | 83  | 67  | 64   | 64   | 63   | 63   | 63   |

  ...and the compact, the FRONT-driver, answers the same sweep with half the
  angle, because on the wheel alone it WASHES WIDE — which is the point of
  it, and what the moves below exist to give it a way out of:

  | lock     | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1.0  |
  | -------- | --- | --- | --- | --- | --- | --- | --- | --- | ---- |
  | slip°    | 1.3 | 2.0 | 2.9 | 4.1 | 5.5 | 6.9 | 8.1 | 9.3 | 10.2 |
  | radius m | 236 | 161 | 120 | 96  | 82  | 73  | 68  | 65  | 62   |

  The radii converge at the top of the throw and the angles do not, and
  that is the model saying where a tight line at PACE comes from: past the
  traction ceiling it is bought with slip angle through `grip.latGive`'s
  residual slope, so at 119 km/h neither car will turn inside about 60 m
  however much lock is wound on. In a real corner — braked for, at corner
  speed — the saloon still holds the tightest line of the three, averaged
  over the drift lab's whole sheet. Corners cost more braking than they used to, which is the
  price of the angles coming down: the old model let a 35° drift buy half
  again the lateral acceleration the tyres were supposed to have.

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
- **One drift makes the next one bigger.** A drift leaves the tires worse
  than it found them, so the corner after it is entered on rubber that has
  already been scrubbed: `CarState.chain` steps up once per drift STARTED
  (`drift.linkStep`) and cools the whole time (`linkFade`), and while it is
  warm the slide both lets go earlier (`linkEntry` off `entryAt`) and goes
  deeper once it has (`linkDepth` off `angleSpan`). It is what makes a
  chicane harder than the same two corners a kilometre apart, and a straight
  is what hands the driver fresh tires back. Booked on the COUNT rather than
  on time spent sliding, deliberately: a term that grew with the slide would
  be the feedback loop this whole group is built to avoid, and it would
  punish one long committed drift instead of a series of quick ones.
- **...and past a point the car is simply gone.** `drift.spinAt` (×the
  surface's breakaway, like every other angle here) is the top edge of the
  drift: past it the front tires point so far from the travel that neither
  the held lock nor the catch reaches the road, so the wheel keeps only
  `spinSteer` of its authority, the redirect gives up its lock exemption,
  and the car scrubs at `spinScrub` times the normal rate — four tires
  dragged sideways being the most effective brake in the game. And it GOES
  ROUND: the model has no yaw inertia, the nose chases a target rate, and a
  spun car is the one place that shows, so while spun the yaw never falls
  under `spinCarry` in the direction the car was already turning
  (`CarState.spinDir`, latched at the entry) — through backwards and on,
  scrubbing whenever it is sideways, until the speed is gone. The tyre has
  let go of the car's travel too: the redirect that turns the velocity back
  under the nose, and the weathervane and self-straightening that are the
  same tyre read as a torque, keep only `spinHold` of themselves, or the
  deepest spin in the game scrubbed itself back into a thirty-degree drift
  and drove on. Once spun, spun until `spinOut`: the slip is read from the
  nearer axis, so a car going round reads as straight twice a turn, and a
  spin that ended there swapped ends on the lock the driver still had on
  and counted itself again each time. Where it stops is where it stops —
  and often enough that is facing the way it came, at walking pace, a
  couple of seconds after a lever pulled at rally pace. The same floor
  guards the entry: a car beached on a bank or scrabbling out of a ditch at
  an angle is pointing the wrong way, not spinning. It reads GROUND speed
  and not `car.u` — a car at seventy degrees of slip has almost no forward
  component however fast it is travelling. A `spin` event and `stats.spins`
  come off the entry. Without a wall like this the deepest angle a car
  could be pushed to was also a corner it got away with, and the escalation
  above would have escalated into nothing.
- **...and short of it, the tail RUNS.** The wheel's own top is where a
  held lock parks (`overFrom` of the way through `angleBand` past the angle
  it asked for); a real rear tyre is past its peak there, so a car carried
  beyond that — a flick thrown too hard, the lever held, the power kept on,
  a landing taken crossed up — keeps coming on its own at `drift.overYaw`,
  and only counter-steer holds it. The run needs a DRIVER: it is fed by the
  throw the move put into the car (`CarState.thrown`, fading at
  `thrownSettle`, slower than the weight the move shifted) or a lifted
  throttle, never by landing skitter or a chained entry on their own; it
  comes in with pace over the slide's speed floor (`overSpeed`), so a lever
  under the floor is a pivot the driver owns and the same over-commitment
  at rally pace is a car that has to be caught; it has at least `overBand`
  of room to develop in; and it is off once the car is spun. Sized so a
  catch made anywhere short of `spinAt` gathers the car and none at all does
  not: the lever held on the rear-driver at 120 km/h runs to a spin in
  about a second, a flick held on at 100 parks a hand short of the wall —
  the deepest drift in the game, and one lift from over it — and a full
  lock held on the wheel alone still parks, because the wheel named that
  angle. This is the whole difference between a drift and a spin being
  something the player does, and why keeping a car on the road is a feat
  rather than a given.
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
  one pedal, both halves of a rally turn-in. It also lifts the DEPTH
  (`drift.liftDepth`, ×the layout's `liftYaw`), because on a layout whose
  own depth is 0.4 there is nothing under the setpoint for the pedal to
  move — which is why a lift used to do nothing at all to a front-driver on
  a surface with a small slip vocabulary. That lift is squared, so a
  maintenance throttle is almost nothing and a driver who genuinely came off
  the power gets all of it; and alone among the four moves it does NOT claim
  the floor exception (`provokeFloor`), because the lever and the brake are
  things a driver does to get a car round and a closed throttle is a driver
  stopping doing something. So a lift-drift trades speed for a little angle
  and then the floor closes on it as the car slows — which is exactly the
  shape a lift should have. The weight is lagged
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
- **The handbrake** — cuts rear grip, adds yaw, and STOPS THE CAR. Two
  wheels dragged down the road is about a third of what four of them do, so
  the lever brakes at `grip.handbrakeBrake` of the car's own braking
  (the deeper of it and the pedal, never their sum — with the brake already
  on the floor the rears are locked whichever handle did it), and a car
  sideways on it scrubs `handbrakeScrub` times as hard as one sideways on
  rolling tyres. That is what makes it a last resort rather than the
  cheapest move in the game: for a long time it unstuck the rear, span the
  car and cost it nothing at all, and there was never a reason not to hold
  it. Now a full-lock yank from 60 km/h has the car under even the LOWERED
  floor inside a second and a half.

  The rotation it adds fades against the angle already asked for
  (`sat`, like the lift's and the brake's), which is what keeps it a move
  rather than a mode: ungated, a held lever walked every car in the roster
  to 87° and a spin, whatever the layout was supposed to be able to do. It
  is a flick, not a hold — and on gravel from 30 m/s, full lock, it peaks
  the hatch at 22°, the four-wheel-drive at 27° and the saloon at 38°. That
  is how it is used in the real thing too: on the tightest hairpins only,
  TAPPED rather than held, and carefully, because holding it bogs the car
  down.
  Below the speed floor both halves of it — the yaw and the grip cut — are
  gone, and the lever is a pair of locked wheels: it is not a way round the
  floor.
  What the lever cuts is the REAR: `handbrakeGrip` is the rear letting go, up
  at the slide threshold, and `handbrakeLat` — much higher — is what the
  lateral redirect keeps, because the fronts go on rolling and go on
  steering. They are two numbers for a reason. Folded into one, the handbrake
  pivoted the car through seventy degrees and then carried it straight on past
  the apex on a WIDER arc than a plain lift would have taken: spectacular, and
  useless for the hairpin the lever exists to get round.

  The three tools are a ladder, each going both deeper and tighter than the
  last — full lock on gravel from 30 m/s, the first two held to a settled
  angle and radius, the lever read at its PEAK because it is a yank and
  because it is now braking the car the whole time it is pulled:

  |               | on the power | lift       | handbrake       |
  | ------------- | ------------ | ---------- | --------------- |
  | compact (fwd) | 10° / 58 m   | 11° / 28 m | 22° peak / 16 m |
  | classic (rwd) | 18° / 50 m   | 16° / 23 m | 38° peak / 10 m |
  | coupe (awd)   | 14° / 64 m   | 12° / 27 m | 27° peak / 11 m |

`car.slide` and `car.drifting` are readouts for the dust, the smoke, the HUD
and the balance table — nothing in the model branches on them. `drifting` is
read off the slip ANGLE, with hysteresis and in the surface's own breakaway,
because the angle is what a player sees and because it moves smoothly, AND
off a slide that is actually open: below the speed floor a hard turn is
understeer, which is not a drift and must not light the dust or the counter.
`car.locked` and `car.spun` are the two other ways a tire can be dragged
rather than rolled — the lever has the rear wheels locked before the car has
taken up any angle at all, and a spun car is dragging all four — and the
tarmac smoke reads all three, or the smokiest moments on a sealed road come
out white. Drift score accumulates as `|slip| × speed ×
time` — sideways AND fast — purely as a measurement; nothing in the game
rewards it, and no drift seconds are counted at the player.

## The jump

- **The ground** — grounded, the car **rides** the ground under it, read where the car has just moved TO (`engine/game/ground.ts`): on the road that is the road's own profile sampled between centerline points rather than snapped to the nearest one, so it climbs a ramp smoothly instead of hopping up it in 2 m stairs; off it, the terrain lattice. The two are ONE surface — the terrain beside a road interpolates the stage's elevation exactly as the road does — so leaving the mat and coming back onto it is a bump the springs take rather than a step the car is dropped down. Its vertical speed (`CarState.vy`) is the smoothed grade's, which the attitude, the camera and the landings read; what the wheels actually did this step is `CarState.wheelVy`, and the difference between the two is a BUMP for the springs (below).
- **Attitude** — the engine owns how the car SITS, in `CarState.pitch` and `CarState.roll` (positive lifts the nose and the right side). Grounded, both are the ground under the wheels: the nose takes the grade along the heading, the body takes the camber across it. Airborne, the pitch is the flight's own arc and the roll is the tumble the take-off put in. Both ease toward their target at `TUNING.attitude.settle` — that lag IS the suspension travel a landing settles through. The renderer only spends the two angles on the right axes; it never derives them.
- **Takeoff** — the body has its own vertical momentum, and the ground is a one-sided constraint on it: it can push the car UP and never pull it down. Every grounded step the body is put where its momentum takes it — the vertical speed it had, falling from there at `TUNING.air.hold` of gravity (about a real g, against the arcade gravity of the flight) — and compared with where the wheels have just found the ground. Under the ground, and the ground has the car. Above it, the ground is falling away faster than the body can follow, the wheels reach down after it on their droop, and the gap is `CarState.loft`. For the first `air.loft` of that the car is grounded and LIGHT (the tyres bleed toward `weightFloor`, the body rides up off the arches); between `loft` and `air.leave` it is SKIPPING — wheels off the ground for a few tenths over a bump or a crown, the tyres carrying nothing, the car still steered; past `leave` the ground has genuinely gone and the car leaves with whatever vertical speed the body actually has. That one rule is every launch there is: a brow holds a slow car, unloads a quick one and throws a fast one, and the one it only just throws lifts off late and low. A crest the flight's own gravity would have held is a HOP (`hopRate`, `hopTime`) — the car bobs over it, books no jump, and comes down soft — and the same at any pace under `crestSpeed`. Two shapes are read directly rather than through the gap: a flagged jump LIP (R6) launches the car from the top of the ramp the moment the ground under its middle drops at `edgeSpeed`, with the launch speed the lip is designed around (`launchKeep` of the wheels' climb, or the smoothed grade's, whichever is more — and from either direction, so a car coming back the other way is thrown off the landing face); and a sharp EDGE — ground falling by more than `edgeDrop` under the car's middle in one step — is a cliff lip at pace and a drop at a crawl, never a face to be driven down. The gap is grown from SPEEDS and never read off heights: the body's against the FOOT's, the mean of the four wheels over the ground they actually covered (`Seat.foot`, `CarState.foot`), because the body rides the four and not the point under its middle — a rut takes one wheel down a hand's width and the body a quarter of that. And the body arrives at each step with the smallest climb any reading of the ground gives it (a wall says the car is climbing at absurd speed while the wheels go nowhere) and never a slower fall than the foot has been doing over the last `footLag` (`CarState.footMean`) — the smoothed grade under a car sliding across a banked, crowned road reads a gentler descent than the wheels are on, and a body reset to that every step lifted off nothing. Two things the momentum model steps aside for: a car PROPPED on a face out in the wild — the seat lifted off the ground under its middle by more than `leave`, a corner up against a bank asking for the top of its reach — follows that plane down as it backs off, the way it follows the wall check, because the plane is the contact model's fiction and not a hill (a car reversing off a bank was otherwise thrown a body-height into the air); and a car PUT DOWN — the grid, a respawn, the beaching after a drowning — is planted (`plant`) with its foot already read, or its first step measured the whole cross-section of the ground as a fall and launched it light onto the line.
- **...and so does the road taken FROM THE SIDE.** A road is a surface, not a line: along the stage it brows and dips, and across it there is R16's crown, the bank R19 puts on a corner, and the ground beside it leaning away. The curvature the takeoff reads is both of those resolved onto the direction of TRAVEL (`pathCurvature`, over `air.crestSpan` lengthways and `crossSpan` of the road's half-width across), so what a car meets depends on where it is going. Drive down the stage and it is all brows; ride up the verge and over the road and it is all crown — and with enough speed that crown throws the car exactly like a lip does. A narrow road is the sharper hump, because the same 17 cm of camber is bent into a tighter radius the less road there is to spread it over; a sealed one is sharper again, standing `asphaltLift` proud of its own shoulder.
- **The roll** — a car that leaves the ground crossed up trips over its outside wheels: a SUDDEN launch — a ledge, a lip, an edge — puts roll in the body from the slide it was holding plus the rotation already in it, and nothing in the air takes it out. The same trip about the vertical axis puts SPIN in it (`air.yawFromSlide`): the tires that were holding the slide let go all at once, so a car that goes over a ledge sideways keeps turning the way the slide was turning it, all the way down. A body that came off its wheels over a brow left tyres that had unloaded across the whole of the loft, and they let go of nothing. Straight and level flies flat; properly sideways goes a long way over; the unluckiest launches go all the way round. Landing on your side is never a clean landing. A lean the springs can still take is unwound toward the nearest upright and then onto the CAMBER under the wheels — level on the road, tipped with the hillside out in the wild. A lean past what they can take is not unwound at all: it is a roll, and the roll owns the car from there.
- **...and the LANDING trips it too.** A car that comes down crossed up is a car whose tyres bite while the body is still going sideways: the bottom stops, the top does not, and it goes over its outside wheels. The first `air.tripSlide` m/s of sideways speed at touchdown is spent skipping and scrubbing on the wheels; every m/s past it is `tripRoll` of roll rate in the body (capped at `tripMax`), scaled by what the tyres are STANDING on — the trip is the tyre biting, so tarmac sends a car over where the same landing in sand is a long ugly slide that stays on its wheels. Whether it goes over is then not a threshold anywhere: `goesOver` weighs that roll against the lift up to the body's own sill corner. About twelve m/s across the car does it on gravel — 26° of yaw at 100 km/h, 20° at 130, 15° at 170 — so the faster the jump, the straighter it has to be landed, and a flick thrown before a lip is a car on its roof. A hop's soft touchdown trips nothing.
- **THE ROLL ITSELF** (`engine/game/roll.ts`) is a body with a shape and a weight in it, and it counts nothing. The car is the box in `TUNING.collision` standing on the ground — two wheel contacts and the four corners of the shell — and rotating that outline traces a curve of centre-of-mass height with valleys where a face is down (wheels, either flank, the roof) and peaks on the corners between. Gravity pulls the centre along that curve; the ground DRIVES the roll on while the car is still travelling sideways (`roll.grip`, paid for out of that sideways speed, which is why a roll ends when the travel does); each contact swaps which corner the body pivots about, keeping a share of the roll that falls out of the geometry alone — about half on a flank, which carries the car on over, and under a fifth square on the roof, which is where one stops. A wheel arriving is swallowed by its spring (`roll.sprung`) rather than taken out of the body. Past about three rad/s the outline falls away faster than gravity can follow and the body is genuinely flying between its contacts, which the roll flies itself: a turning body arcs about its own centre while the wheel plane goes round with it. So a car goes over as many times as it has the energy for and comes to rest on whichever face it ran out on — and the wheels-down valley is the deepest, which is why most rolls end there without anybody deciding they should.
- **A car the roll leaves off its wheels is a run that is over where it lies.** There is no tyre on the ground, so nothing the driver asks for reaches the car; `state.overturned` holds it there for `roll.lieFor` and then puts the crew back at the last split board (R28), exactly as a drowning does. It is the same rule for the FIELD, without a line of its own — every rival is stepped through the same code.
- **Airborne** — the velocity vector is committed. Gravity is arcade-heavy (floatier hangs read as slow motion), the nose answers only faintly, and a small seeded turbulence rolls the car — flying, slightly out of control, exactly as intended. No lateral grip: whatever attitude you took off with survives to the ground.
- **Landing** — straight (slip inside the clean limit) keeps all your speed: `CLEAN AIR`. Landing sideways scrubs speed and wobbles the car, and past the trip above it rolls. Line up before the lip. Whatever the descent was, the springs take it (below), and a slam past what they can travel through bounces the whole chassis back off the ground for a beat — one landing still happening, not a second flight, so it draws no turbulence and never counts as a jump.
- **...and the car goes LIGHT on it.** A landing is not over when the wheels touch: the springs bottom and throw the body back up, and the wheels hop on their own rubber for the better part of a second. A wheel that is intermittently in the air holds intermittently, so the grip goes with it (`CarState.settle` → `tyreLoad`, below) — a nose a few degrees off line or a wheel with any lock on it takes the car sideways where the same input on the flat would not. All of it is sized by the SLAM, the descent the springs had to swallow, which is the number the `landing` event carries and the camera, the dust and the sound are all scaled off. Even the shallowest lip R6 can build arrives hard enough to be felt: a car is heavy, and the smallest jump on the stage is still a hit.
- **Going light WITHOUT leaving the ground.** A tire is worth the load on it, and the same curvature that decides the takeoff decides the load on the way there: below the launch threshold the ground still spends part of the car's weight on pulling it down after the shape, and the tires keep what is left (`CarState.weight` → `tyreLoad`, `suspension.weightGain` / `weightFloor` / `weightCeil` / `weightRate`). Crest a brow, or ride up a bank and run straight off the top of it, and the grip bleeds off with the weight — the slide comes easier, the nose is harder to hold, and a lock that was a corner on the flat is a spin here. Push it further and the wheels leave: going light and flying are one continuum, not two rules. Through a compression it runs the other way and the car is pressed on. On a level road it reads exactly one, so an ordinary corner pays nothing.

## Reverse

The brake pedal has two jobs and no gear to choose between them (`TUNING.reverse`). Above walking pace it is unambiguously the brake. Once it has stopped the car — `engageBelow`, 0.6 m/s — holding it backs the car out instead, at `accel` up to a `top` of 8 m/s (~29 km/h). It is a RECOVERY, not a way to drive the stage: deliberately slow to build and far too slow to be a tactic, so a nose in a tree is something the player digs out of rather than waits out a respawn for.

- **Throttle always wins.** Gas cancels the manoeuvre outright — there is nothing to select on the way out of it.
- **The manoeuvre latches** (`CarState.reversing`) and stays latched through the pedal coming up until the car is back at a stop, which is what separates the driver putting the car in reverse from something throwing it backwards: a rebound off a cliff face is negative forward speed too, and it belongs to the collision, which keeps every bit of it. While the latch holds and the pedal is up, the drivetrain gathers the car back to rest at `coastStop` — rolling drag alone is tuned for a car with an engine holding it up against it, and would let a released reverse coast on for the better part of a minute.
- **The wheel answers the other way round**, as it does in any car. Everything in the yaw model reads the SPEED rather than the signed forward velocity, so a car rolling backwards is a car that can be steered — a wheel with no authority at all is how you get stuck twice.
- **Brake lights stay for braking** (`CarState.braking`), and the HUD's gear reads `R`.
- **Backing out counts as asking to move**, so the wedge rescue (`TUNING.offTrack.stuck`) keeps its clock running through the attempt: a car pinned in front AND behind still gets dragged home on time, and one that reverses free resets the anchor and drives on. The bot uses exactly this — see [simulation.md](simulation.md).

## Wind and weather

Every stage blows a seeded wind (`GameState.env` + the per-step `state.wind` vector). The pre-race weather setting picks the band (`TUNING.wind.speed`): clear is a breeze, rain is a stiff wind, a storm genuinely blows. The wind gusts and veers deterministically with sim time, so replays and sim digests hold. It touches the car three ways (`TUNING.wind`):

- **Head/tailwind** pushes on forward speed (`longForce`) — a storm headwind trims the top end, a tailwind stretches it.
- **Carry** — a fraction of the wind velocity translates the whole car downwind (`carry`): small while gripping, larger mid-drift, largest airborne, where a storm gust visibly moves a jump sideways. A translation, never a torque — the wind cannot spin the car.
- The wind is never drawn as an instrument: what it does to the car is the readout.

Time of day is presentation only; weather is the lever that reaches the physics (through the wind).

## Hills

Generated stages roll (`STAGE_RULES.elevation` — long climbs, medium rollers, surface bumps; grades live on straights and flatten through corners). Gravity acts along the grade (`TUNING.hills.gravityAlong`): climbs cost speed, descents give it back, and a crest taken flat-out goes light, hops, or flies — the body's own momentum against the ground falling away (the jump, above). Ground height under the car interpolates between centerline samples, so grades stay smooth at any speed — and ACROSS the road it is the same corridor profile the road mesh is drawn from (R16 in [track-generator.md](track-generator.md)), carried out past the mat into the shoulder and the ground leaning away from it, so a car putting two wheels wide rides the verge it can see instead of hovering over it.

The car FEELS that whole profile, not just the height of it. The cross-slope is read over the corridor at the car's real offset rather than off the mat's edge, so going over the edge of a sealed road leans the body onto the drop and pulls the car toward the low side — two wheels on the shoulder is a slope the handling knows about, not a place the height falls away while the physics insists the ground is level. The one exception is a bridge deck, which has no verge: past its parapet is air, so it reads its own mat and nothing outside it.

And the grade is felt on the CAR's own axes, not the road's. A road states its shape in its own frame — the climb down the centerline and the camber across it — and the car on it may be pointed anywhere: down the stage, back up it, or straight across. That pair is turned onto the car's nose and its right before anything reads it, so gravity holds back whichever car is climbing, the body pitches and leans the way the ground under it actually goes, and a car crossing a road feels the crown rather than the hill. A hill is the same hill whichever way you are pointed at it.

## Surfaces

| Surface     | Effect                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gravel      | The baseline: full power, honest grip, dust off the rear when sideways — and a plume towed off the back wheels from 30 km/h up                                                                                                                                                                         |
| Sand        | The desert's bladed road (R40): a fifth less grip than gravel, a breakaway a fifth further out, half again the drag and some of the throttle swallowed — slower in a straight line, sideways sooner in every corner, and a slide that runs further and settles later. Same loose-surface rubber        |
| **Asphalt** | A third more lateral grip, a sharper wheel to spend it with, and under two thirds of the breakaway angle: the corner that needed a slide is driven round, the drift has to be ASKED for and stays small when it comes — and it throws nothing at all until a tire is overwhelmed, then smokes it black |
| Water       | Fords and shallows: a splash on entry, heavy drag, reduced grip and power                                                                                                                                                                                                                              |
| Nature      | The open landscape off the road: loose grip, fast — up to ~150 km/h                                                                                                                                                                                                                                    |

Asphalt is not a different handling model, because there isn't one: it is
three numbers on the same one, and the first two pull opposite ways.
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

The third is `TUNING.grip.steerGrip`, and it is what lets the first one
reach the road at all. In the gripped range the yaw is `steer × steerGain`
and `steerRate` is a property of the rack, so without a surface term a
grippier road could not actually POINT the car: every car in the roster
held a wider line on tarmac than on gravel at the same lock while arriving
a third faster, and the paved section — the one surface a car should be
quick on — was a place to run wide off. `steerGrip` is the fraction of a
surface's grip advantage **over gravel** that becomes steering authority,
quoted against the car's own loose-surface rubber so gravel is exactly
neutral for every car. It is why the hatch, on sealed tires, gains most on
tarmac and the saloon on skinny loose ones gains almost nothing. It reads
the surface's own grip and not the landing's transient load: what a road is
worth to the rack is a standing fact, and folding a landing into it made a
landed car slide LESS than one on the flat.

What counts as a drift is sized in the surface too (`enterSlip × breakaway`),
and it has to be. Tarmac's whole slip vocabulary is a fraction of gravel's
by construction — every technique lands at almost exactly `breakaway` times
what the same technique buys on the loose — so held against one absolute
angle the entire paved range sat under the threshold, and a driver could
throw the car at a corner on the lever and get no smoke, no dust and no
counter for it. Sized in the surface, tarmac drifts at tarmac angles: fewer
degrees than gravel, and really happening.

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

The third thing is the ROOSTER TAIL, and it has a direction the other two
do not: the stones a sliding car throws out SIDEWAYS, off the side the tail
is going (`drift-spray.ts`, every number of it in `DRIFT_SPRAY`). Two things
throw it and they add. A tyre dragged across loose ground ploughs what is in
front of it, so the leading wheels — the ones on the side the car is sliding
towards — fan stones out ahead of themselves however the car is driven, and
the rear axle does this on every layout because a sliding tail moves
sideways whatever is turning it. A DRIVEN wheel that is also outrunning the
road (`wheelspin`) is spinning on the same patch and fires what it digs out
backward as well, so the axle the drivetrain lights up throws more and
throws it further back: a rear-driver sprays off its tail, a front-driver
off its nose, all-wheel drive off both. The tail thickens with the slide,
with how fast the tyres are being dragged sideways and with pace, leaves the
ground at a low rally angle rather than as a fountain, and is made of the
ground it came off — the same tint the grit takes, so a soaked stage throws
clods and a sealed one throws nothing.

EVERY CAR ON THE ROAD TOWS ONE, not just the one being driven. The field's
crews raise a cloud of their own from a second instance of the same system
(`field-cars.ts` over `plume.ts`), and they raise it out to a wider range
than their bodies are even built at — a rally car is a plume over the road a
corner before it is a car. It costs nothing to do this: a cloud is one
pooled `Points` and one draw call however many crews are feeding it, so the
whole entry list is as expensive as one car, and the pool is shared at half
rate (`FIELD_PLUME`) so none of them tears a hole in anybody else's tail.
A run with nobody entered — a time trial, a roam — draws no field cloud at
all.

### What the light does to a cloud

Dust is not in the lit scene. A particle is a point sprite with no normals,
so the sun, the sky and the four spotlights on the car all pass straight
through it — which is the right trade for a thousand puffs, and also why an
untreated plume is the same tan at midnight that it is at noon. So the
clouds carry their own two-term lighting instead
(`pwa/src/game/dust-light.ts`):

- **The sky**, as a flat ambient on the material (`dustTintFor` in
  `sky.ts`). It is the car's own measurement with a different curve on it:
  pinned to 1 at noon, so the daylight plume is untouched, and squared under
  that, so the failing light bites a cloud markedly harder than it bites the
  paint. The floor under it is barely a floor — a plume you can still see by
  at midnight is a plume emitting its own light.
- **The lamps**, from a small register of cones summed per particle in the
  vertex shader. Every lit car hangs two on it — one throwing forward, one
  throwing back — so the headlights put a warm cone into anything hanging
  ahead of the car and the tail lamps turn the near cloud RED, which is the
  part the chase camera is looking straight through. The player is always on
  the register; the nearest of the field fill what is left, so a rival ahead
  of you in the dark is a red glow inside its own dust before it is a car.
  `shot-night-plume` is the acceptance test.

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

A board is a GATE, tested exactly as the finish line is: the plane across
the road at the board, entered between its ends, in the direction the stage
runs. The ends are the road plus `checkpoint.gate` either side — wider than
the finish's own gate, because the finish is a line a driver aims at and a
board is one they go past at the exit of the hardest corner on the stage,
sideways, with the outside verge under two wheels. Progress alone would not
do: progress is the nearest sample, so a car cutting across country walks it
past every board it never went near.

Only ONE board is armed at a time — the next one due, `checkpoints[state.checkpointsPassed]`.
That is what makes the boards ordered (the fourth cannot be taken without
the third), what stops a car put back on a board it has already driven
through from booking it twice, and what makes a missed board recoverable:
driving back down the stage and through it forwards is still a crossing.
Taking one books a split — `checkpoint` fires with the board's index, how
many the lap has, and the race clock as it passed, and the time goes on
`state.checkpointTimes`. A circuit re-arms all of them each lap; the times
stay on one list for the whole run.

**A run is not over until every board is behind it.** Crossing the finish
line owing a split books nothing — no finish, no roll-out, and on a circuit
no lap; the run simply carries on, and `missed` fires with the board still
owed so the HUD can say which one it is. The way back is the way it always
is: turn round and drive to it, or take the way-home button, which puts the
car at the last board it DID take and hands it the road from there.

Two things read the splits. The HUD puts the gap up under the race clock for
a few seconds — measured against the ghost's own splits, which ride on the
tape (`GhostRun.splits`) rather than being read back off the replay, so the
number is there from the first board even on a run that is well up the road
on its ghost. And a respawn goes to the last board (above). The minimap
marks the board still owed as a ring on the route, which is the mark to
steer at from a field or a wrong turn — the one mark on that map that can be
BEHIND the car.

## The open world

The road runs through a landscape the car can actually drive
(`engine/mapgen/terrain.ts` — the same seeded field the renderer draws, so
the ground under the wheels IS the ground on screen). Leaving the road is
not a mistake anymore; it is exploration:

- **The ground** — off the verge the car rides the terrain — and it rides
  the DRAWN terrain: the physics samples the same triangle lattice the
  renderer builds its ground tiles from (`TerrainField.groundAt`,
  `GROUND_CELL`), so the car sits on the slope on screen instead of
  sinking into it where the analytic field and the mesh disagree. That
  rule is not only the car's: everything the renderer STANDS on the
  ground — every stone, tree, stump and tuft — is planted on the same
  drawn surface (`Terrain.standOn`), because the analytic field runs
  metres clear of a 14 m triangle over a rounded shoulder and a boulder
  bedded on it hangs in the air over the hillside it belongs to. It
  rides that ground on its whole FOOTPRINT rather than on the one point
  under its middle: the body's four corners are sampled and the car is
  seated on the highest of them, so ground the body's own attitude cannot
  follow — a face steeper than `TUNING.attitude.pitchMax`, the crease
  where two lattice triangles meet, the foot of a cut bank — no longer
  buries one end of it. A corner over ground rising harder than
  `TUNING.collision.climbLimit` is against a WALL rather than standing on
  a slope, so its claim is capped there and the contact model takes over —
  and the limit is arcade-generous, a little under 45°, with the full
  refusal (`wallSlope`) not until nearly 70°: a bank, a cut verge, the
  landing face of a jump are things the car bounces up over, and only
  ground it plainly could not climb is a wall. The
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
  one crash left** — and it is a drowning, not a teleport, with a shoreline
  the car may yet drive back out onto: see below.
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
- **What counts as an obstacle** — `SOLID_PROP_HEIGHT` (0.5 m) is the
  bar, set as high up the hood as the catalog allows: the bonnets sit
  about 0.87 m over the ground, and anything standing higher than the bar
  meets the body and is placed as a solid. Stone shorter than the bar is
  litter the renderer scatters for itself and the wheels ride straight
  over, and it is the only stone the renderer is allowed to plant. Of what
  IS placed, the shortest are still the wheels' business: a solid whose top
  stands under `TUNING.collision.rideOver` (0.6 m) over the car's own
  ground is under the bumper's lower lip, and the car drives OVER it the
  way it drives over an anti-cut block (`clipSolids`) — speed, a lurch, a
  thump, the stone shoved out of its bed and away, never a fold. Only what
  stands taller meets the body. The
  litter field is deliberately sparse (`ROCK_DENSITY` in `props.ts`): the
  wild is a place to drive, and the solids that stand in it are the ones a
  driver can see coming. What a solid that GIVES costs is a shove, not a
  wall: a rock the car knocks off its bed hands back only
  `solids.looseRestitution` of the closing speed, so the smallest solid on
  a stage is a bang and a dent rather than a third of the car's pace. Nothing
  solid stands inside the road ribbon's own reach (`ROAD_CROSS.reach`,
  6.5 m past the mat) — rim included, not just centre — so the shoulder
  and the ditch stay as survivable as they ever were, and the first thing
  a car running wide can hit is out where the trees already stood.

### Going under

Water more than `TUNING.crash.deepWater` (0.9 m) over the ground the car is
standing on has the car. It is a crash at that instant — a big `splash`
(`deep: true`, carrying the entry speed) and the `crash` event — but the car
is **not** lifted off the lake. `state.drowning` is set instead, and for
`TUNING.crash.drown.duration` seconds nothing else in the run advances: no
input is read, no progress accrues, no surface is resolved and the wedge
clock does not run. The race clock does, and those seconds ARE the penalty.

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

The respawn is at the far end of all three. It is not the only way out,
though: the first two beats are a race the car is allowed to win.

**Driving out again.** A lake has a shore and a river has a far bank, and an
entry taken at pace carries the car toward one — `stopIn` gives it half a
second of real travel, which is metres. While the hull is still afloat
(before `float`, so before the water has started taking it down), any step
that finds it over ground carrying no more than
`deepWater - drown.shallows` (0.7 m) of water **beaches** it: `drowning`
clears, the wheels go back on the seat the driving model would have given
them (`seatOn`), the wedge clock re-anchors where the car stands, a shallow
`splash` marks the car heaving itself out, and the driver has it back. No
`sink`, no respawn, no checkpoint paid — the run is exactly where it was
left, and the entry cost it the second or so it spent swimming.

The depth is read over the GROUND rather than over the car, because a
drowning hull is being held at its waterline and would answer "deep" while
standing on a beach. The margin is what makes it a different bar from the
one that started the drowning: on the same bar a car bobbing at the
deep-water line would beach and drown again on alternate steps.

The check runs BEFORE the depth maths of beats 2 and 3, and has to: those
pull the body toward a waterline that, for a car which has climbed a bank,
is metres below the ground it is standing on. A car left to them after it
has driven out does not drown in the lake, it drowns in the beach.

- **The way home** — exploring never times out, and hitting things never
  ends it: crash into trees for as long as the car still moves. Only two
  things put a car back on the road, and they land in DIFFERENT places. The
  **reset input** (`CarInput.reset`, the B key) is the run being given up
  on, so it costs the road back to the last
  checkpoint (`lastCheckpoint`, R28) — the same place a drowning respawns
  at. The **wedge check** — throttle held for `TUNING.offTrack.stuck.after`
  seconds without covering `stuck.radius` meters — is not: nobody asked for
  it, the car is pinned through no decision of the driver's, and a rescue
  that cost a checkpoint would put the car back at a board it has already
  proved it can drive from into the same trunk, forever. That one goes to
  the road where the car stands (`wayHome`). A car pinned against a trunk is
  not driving out of it; anything still making ground is left alone. Either
  way `state.progressIndex` comes back with the car: the road in between is
  road the run has to drive again. Progress is a SCORE and only creeps
  forward; where the car actually is on the centerline is
  `state.nearIndex`, which follows it back down the stage. Every search for
  the road under the wheels starts from that one — started from progress, a
  car that had doubled back was handed the height of road it had reached
  rather than the road it was on. The reset key answers the whole time the
  car is off the road — a driver two metres into a ditch should not have to
  be lost first — but the ALERT waits for the car to actually be lost (`trackLost`, `TUNING.offTrack.guide`): more than 20 m
  out AND pointed more than 110° away from the way home. Two wheels on the
  verge is not lost, and neither is a clearing crossed perpendicular with the
  stage running alongside. Once it is, the co-driver's strip reads RETURN TO
  TRACK with the distance to the road, a footnote saying what the button
  costs (the last checkpoint), and a small arrow hangs in the frame just
  UNDER that sign, pointing at the road itself — measured off the sign
  rather than parked at a fixed height, so the two stay stacked in either
  orientation and with or without a mirror hanging over them.
  Going OFF has no threshold of its own: the alert is an
  instruction, so the only thing that clears it is the track being back
  under the wheels. Nearing the road or aiming at it leaves it up, which is
  also what stops a wandering car blinking it on and off.

- **The wrong way** — the other thing the co-driver's slot takes over for,
  and the opposite problem: the road is still under the wheels and it is
  being driven back up. `stageDirection` reads the car against the
  centerline sample under it and answers two questions, because on its own
  each one is something a rally driver does on purpose. How far the NOSE is
  off the road's own heading — a car reversing out of a ditch is travelling
  the wrong way with the nose still pointed down the stage, and telling that
  driver to turn round is the opposite of what they need. And how fast the
  car is actually TRAVELLING along the road — a spun car points back up the
  stage for a second while its momentum still carries it down, and that is a
  moment to be driven out of. Both have to hold — past `TUNING.wrongWay.away`
  (110°, the same angle the way home calls pointed away) and running back
  faster than `wrongWay.speed` (3 m/s) — for `wrongWay.after` (1.2 s), which
  is long enough that a three-point turn on a narrow road finishes inside it.
  Then the strip reads TURN AROUND under a U-turn mark, in the HUD's red
  rather than the way home's amber: this is the one call in the strip that is
  a mistake already being made rather than a corner coming up. Coming off is
  its own, narrower threshold: the nose back inside `wrongWay.back` (60°).
  Stopping does not clear it and neither does swinging the nose to the edge
  of the angle it came up at, which is what would strobe the sign through
  every shuffle of a turn on a narrow road. A respawn clears it, having done
  the turning.

  The call takes ITS OWN fix whenever the car has dropped behind its
  progress, and that is load-bearing rather than tidiness. Every other fix
  in the run hunts from `state.progressIndex`, which only ever climbs, and
  `locatePoint` reaches fifteen samples back from its hint — so a car more
  than thirty metres down the road it came up is pinned to the far end of
  that window: measured against the heading of a corner it is nowhere near,
  and reported OFF a road its wheels never left. `state.wrongWayAt` is the
  one cursor on the state that follows the car backwards, and the extra
  search is skipped entirely for a car at its own progress, which is every
  step of a run that never doubles back. Because that honest fix is the one
  that knows, the wrong-way call VETOES being lost (`state.lost = !wrongWay
&& trackLost(state)`): a car on the road going backwards must not be sent
  RETURN TO TRACK over a track it is standing on.

## Weight: the springs

The wheels track the ground exactly; the **body does not**. `TUNING.suspension`
is a second-order spring the whole sprung mass rides on, deliberately
under-damped so it OVERSHOOTS and settles rather than easing to rest — a body
that just cushions reads as a sprite on a plane, and the rebound is what reads
as mass. Three readouts come out of it, all written by the engine; the first
two are drawn and never read back, and the third is what a landing costs the
car in grip.

- **`CarState.ride`** — how far the body sits from where the wheels put it, m
  (negative is compressed). It is excited by one thing: a change in the
  WHEELS' vertical speed. A dip flattening out at the bottom of a descent, a
  landing, a bank that stops the nose — each arrives as a jolt the springs
  swallow and give back. Past `travel`/`droop` the bump stops catch it, stiff
  and heavily damped ON THE WAY IN — coming back out they keep only
  `stopRelease` of that damping, because a rubber stop pushes, and that push
  is the rebound of a landing. Damped equally both ways the car squatted onto
  its stops and stayed there, which is a landing with no weight in it.
  Heavier cars ride the same springs more slowly (ω ∝ √(k/m)).

  **The whole envelope is a bodywork measurement.** `heaveMax` is held at the
  tightest gap between arch and tire on the roster (0.08–0.11 m — see
  `arches.radius` against `wheelRadius` in `pwa/src/game/car-styles.ts`),
  because past that the shell is visibly sliding off its own wheels rather
  than riding on them. What the ground hands the springs comes in TWO
  CHANNELS (`groundJolt` in `ground.ts`), because the ground does two
  different things and one cap cannot serve both. The SHAPE — a valley
  floor, a brow, a bank — arrives through the smoothed grade and is capped at
  `joltMax`: a valley floor at pace is several g held for a fifth of a
  second, no spring soft enough to feel like a rally car holds a body against
  that inside a wheel arch, and past the cap the dampers are simply out of
  authority and the whole car rides the ground up — which is what a bottomed
  suspension does. The BUMP — a kerb, the shoulder's step off the mat, a
  lattice crease, the landing face of a jump met from behind — is everything
  the smoothed grade did not predict: the change, step to step, in how far the
  wheels' real vertical speed (`CarState.wheelVy`) runs ahead of the smoothed
  one. It is a spike by nature and carries its own ceiling, `bumpMax`, sized
  so the worst step in the ground squats the body onto its stops and no
  further. Without it the shape cap swallowed every step along with the
  shapes it was written for, and a car crossing the verge at pace moved on its
  springs by nothing at all — the read that made the car look bolted to the
  road. A landing and an impact are velocity steps of their own and are not
  capped. And the wheels' vertical speed is read from the car's DIRECTION OF
  TRAVEL, not its heading (`slope` × `u` plus `slopeLat` × `w`, which is the
  ground's gradient dotted with the velocity), so a car sliding across a
  uniform hillside never reports a vertical speed that swings with its own
  yaw.

- **`CarState.settle`** — how much the car is still SKITTERING after
  arriving, 0..1: the wheels themselves hopping on their own rubber, which is
  a beat of the car the one-mass spring model above cannot hold. A landing
  writes it, sized by the descent the springs had to swallow (`settleSlam`),
  and it fades at `settleFade`.

- **Weight on the tires** (`tyreLoad`) — `settle`, read back into the
  handling as one multiplier on `surfaceGrip`, which is the single number the
  slide threshold, the redirect rate, the traction ceiling and the driven
  axle's bite all come off. A full skitter costs `loadSkitter` of the grip,
  and it never falls below `loadFloor`, so a slide out of a jump stays
  recoverable. It reads exactly 1 everywhere else, so a corner pays nothing
  for it.

  **Why not off the springs?** Because a body dragging up off its wheels is
  the obvious signal and the wrong one: `ride` cannot tell a landing from a
  road. R16's cross-section — the crown, the ruts, the worn tracks — moves
  the body 3–5 cm every time the car crosses it, which is MORE than the
  ~2 cm rebound out of a bottomed landing, so a springs-driven version took a
  fifth of the tires away in every steered corner on an ordinary road: 3–4°
  more slip on the drift lab's hard corners and five of its 120 rows running
  off the road, none of it to do with a jump. A landing needs a signal that
  says "a landing", and `settle` is it.

- **`CarState.pitchLoad`** — the dive under the brakes, the squat on the power
  and the nose-dip an impact throws in. Kept apart from `pitch` (the ground's
  own attitude) because only the BODY takes it: the wheels stay on the ground,
  and so does the shadow.

The renderer draws both on a `chassis` group that holds every panel and no
wheel (`pwa/src/game/car-body.ts`). The three in-car cameras — the cockpit,
the bonnet and the nose — mount on that body and ride all of it, though what
the player looks through is the driver's HEAD: a stiff, well damped neck
hinged below the eyes, leaned by the LOAD the driver is under rather than by
where the shell has got to. The brakes throw it toward the nose, the power
tips it back, a corner leans it out, and the arc it swings on bounds all of
it — about four centimetres, approached and never reached, whatever the car
hits. What the head does NOT do is chase the shell's own chatter, and that is
what makes the view drivable rather than merely accurate: a head moving
against the shell moves the CABIN, half a metre from the lens, not the road
twenty metres out, so travel that reads as weight from the bonnet reads as the
dashboard swimming from the seat. A hit throws the head along the direction
the blow came from and rings a wave on the gaze that says how hard it was
(`pwa/src/game/camera-eye.ts`). The cameras close behind share a little of the
heave so a landing lands in the FRAME too, and the ones flown high above the
car share none.

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
  a face rising faster than `climbLimit` under the wheels — the terrain, or
  a road profile where it stands up — stops being a hill and starts refusing
  the car, at `wallSlope` completely. The ground's gradient at the bumper IS
  the contact normal, so a cliff met head on takes the pace and folds the
  nose while one met at an angle deflects the car along it — and the car is
  backed out of however much of the step the face refused, which is why it
  never ends up inside a mountain. A face has its own scuff floor
  (`faceScuff`, above the solids' `scuffSpeed`): a steep bank taken at
  50 km/h costs speed and paint, never the run, while a cliff at pace still
  folds the nose.
- **The springs.** Every contact also loads them (`TUNING.suspension`):
  the wheels stop and the body does not, so the car rocks and the nose dips
  for a beat afterwards. See [Weight: the springs](#weight-the-springs).
- **The anti-cut blocks are the exception to all of it.** R26 lays a low
  slab of concrete along the inside of a hard corner, exactly where a
  driver wants to put two wheels, and it is resolved by `clipKerbs`
  (`TUNING.collision.kerb`) rather than as a solid — because it is a thing
  the car rides OVER rather than into. It costs a share of the speed the
  car was carrying, rolls the body away from the wheels that mounted it,
  loads the springs, shoves the car back out of the inside of the corner
  and drags the nose round after it. What it never does is fold a panel or
  put the car in the air: cutting an apex has to be PAID FOR, not punished
  with the run, or every corner on the stage becomes one nobody goes near.
  A marker post is the opposite extreme — it stops nothing, never reaches
  the physics at all, and is knocked flat renderer-side like a cone.
  - **The BITE CEILING is what keeps it a kerb.** The slab is bedded into
    the verge — only `KERB_MARKER.block.proud` of its thickness stands
    above the ground — and climbing that costs what it costs however fast
    the car arrives. So the shove, the yaw, the roll and the heave are all
    priced off `min(closing, kerb.biteMax)` rather than off the closing
    speed itself, and only the scrub (`keep`) is a share of what the car
    was carrying. Without the ceiling the closing speed into a block dead
    ahead is the car's whole road speed and the shove off it is a head-on
    into a wall: a full apex row took a car from 90 km/h to walking pace
    in five bites. Priced properly it is about a fifth of the car's speed
    for the whole row, which `analysis/drive.ts`'s `kerb` check measures by
    driving the reference car down every row on a stage.
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
hold every number. The rule sizing nearly all of them is that damage
**degrades** — a hurt car drives badly, crookedly and out of breath for as
long as it can drive at all, so a car with every gauge one step short of its
worst still crawls to the finish at a fraction of its sound top speed. Two
things are past that, and they END THE RUN (below): an engine at 1 is dead,
and a car on fewer than three wheels is not a car.

Under the panels live five **internal systems** (`damage.systems`), each
fed by the crush landing nearest to it and each degrading its own job:

| System     | Hurt by                       | Effect when damaged                                                       |
| ---------- | ----------------------------- | ------------------------------------------------------------------------- |
| Engine     | Nose and front-corner crush   | Power fades (`systems.powerLoss`), past `chassis.misfireFrom` the         |
|            |                               | ignition drops beats outright — the car lurches instead of pulling — and  |
|            |                               | at 1 it is DEAD: no power, a seized crank, smoke off the bonnet, the run  |
| Suspension | Flank and belly crush         | Less lateral grip, narrower landing tolerance, wobblier touchdowns        |
| Gearbox    | Rear and belly crush          | Shift cuts stretch; past `chassis.topGearAt` the top ratio stops engaging |
| Steering   | Front-corner crush            | The rack loses authority (up to `systems.steerLoss`)                      |
| Brakes     | Corner, flank and belly crush | The pedal loses `systems.brakeLoss` of its bite, and the LEVER nearly all |
|            |                               | of it (`leverLoss`): a car with cut lines cannot be flicked on the lever  |

The **wheels** carry a ledger each (`damage.wheels`, FL/FR/RL/RR), fed by the
crush on their own corner, half of the crush on their flank, a little from the
belly, and — on a landing taken on the side — the side they came down on
(`systems.wheelFrom…`). Past `chassis.wheelFlat` the tyre is DOWN and the rim
bent: the corner loses `flatGrip`, the car pulls toward it (`flatPull`, in
lock, held down every straight) and the rim drags (`flatDrag`); the drawn wheel
squashes, leans and wobbles once per turn. At 1 the wheel is OFF THE CAR — a
`partBreak` the renderer sends tumbling, with the corner dropped onto its hub
for the rest of the run — and the same three costs come at `wheelOff…` size,
plus `wheelOffPower` of the engine's push gone into a hub ploughing the road.
One wheel off is a car that crawls, crookedly; two is the run.

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
pointed, and an unpointable car is not a consequence either. The wheels are
the one thing allowed under it, to their own floor (`wheelOffGripFloor`): a car
on three wheels genuinely cannot be pointed well.

### The end of the run

A stage can now be lost to the car rather than to the clock. Two states are
BEYOND DRIVING (`beyondDriving` in `damage.ts`): an engine at 1, and two wheels
off. Neither makes any power, both drag the car to a standstill in a few
lengths (`chassis.deadEngineBrake`, `hubBrake` — a seized crank on the driven
wheels, a hub ploughing the road), and the moment such a car has come to rest
on the ground (`collision.retire.restSpeed`) the run's phase goes to `retired`
and a `retire` event says why. Nothing steps it again; the card comes up over
the car where it stopped, with the reason and the two ways off — the same stage
from the grid, or the menu — and no time, place, points or board, because none
was earned. The wedge rescue and the reset both stand aside for such a car:
putting a dead engine back on the road would only park it there.

What it takes is a head-on. `systems.engineFromNose` is sized so a wall met
square at 100 km/h — a quarter of a metre of fold — is the engine gone in one
hit, and one met at 50 km/h is a third of it, the `ENGINE DAMAGED` line and
steam off the bonnet. Above about 50 km/h a straight-on hit is really bad; at
100 it is the run. A rival's engine dies the same way and files them as a DNF.
The difficulty's damage assist (`CarState.damageScale`) scales all of this
exactly as it scales every other mark, so an EASY run cannot be retired by the
car at all.

Nothing repairs mid-run. And nothing about it is drawn as an instrument: the
damage the player can see is already on the screen — the wing is folded, the
bonnet went over the roof three corners ago — and the damage they cannot see
is the machinery under it. So the machinery **says** so. Each system, and the
shell around them, crosses two lines on its way out
(`TUNING.collision.callAt`), and each crossing is one `systemFail` event the
app puts up in the middle of the screen where the splits and the lap times
are said: `ENGINE DAMAGED` as it gives, `ENGINE BROKEN` as it goes, and
`ENGINE DEAD` at the end of the engine. Once per line per run — damage never
heals, so a line crossed stays crossed. A wheel says the same two things about
itself (`wheelFail`): `FRONT LEFT PUNCTURE`, then `FRONT LEFT WHEEL LOST` —
named as the player sees the car, which is the engine's frame flipped once, in
the HUD, like every other left and right. And an engine that has been called
DAMAGED SMOKES: steam off the bonnet, thin at first, thicker and darker as the
damage climbs, black once it is dead.

Nineteen pieces can come off. The two LAMP pairs go first (`partAt.lamp`, the
first fold past a brush): a smashed headlamp is a dark hole in the face of the
car — no bloom, no beam on the road ahead, no glow in the dust behind for the
tail lamps — and the HUD says `HEADLIGHTS BROKEN` or `TAILLIGHTS BROKEN`,
because a driver looking out of the car cannot see its own lamps. The two
bumpers, the two mirrors, the spoiler and the two lids fly as they always did: a bonnet or boot lid is bolted deeper
than the bumper in front of it (`TUNING.collision.partAt.lid`), so it only lets
go once the clip around it has folded far enough to pull its hinges — and what
is left showing is what the panel was covering. Behind a boot lid that is a
dark bay painted on the deck; behind a BONNET it is a real one, a well cut down
into the front of the body with an engine standing in it
(`pwa/src/game/car/engine-bay.ts`), which crumples with the nose the same folds
do. The four pieces of GLASS — windscreen, backlight, and each flank's windows
together — shatter rather than fly, between the bumper and the lid
(`partAt.glass`): the pane is simply gone, the grime film over it with it, and
the cabin is seen straight into. The two DOORS are the deepest thing on the
flank (`partAt.door`, most of the way to the cage): a skin between the door
seams that tumbles off and leaves the flank behind it painted into the dark of
the cabin, stripes and all. And the four WHEELS come off their own ledger.

The polygons fold to match. A quarter of a metre in the ledger reads as half a
metre of car gone (`FOLD` in `car-damage.ts`), torn about rather than scaled —
every vertex pulled in by its own share and thrown up and across by the rest —
and scuffed to primer over the first bad hit. A car that has met a wall at
100 km/h has no front.

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
  the rear-driver's fully developed one, which is the 1) **and how far it
  ever develops, however hard it is asked** (`cap`). Where it begins, how
  deep it goes on the wheel and how deep it goes at all are three
  questions: a front axle that runs out of grip WASHES WIDE, so the hatch
  crosses the same threshold and then holds about half the angle the saloon
  does at the same lock, on a line a fifth wider. Reaching a real angle in
  it costs a MOVE — a flick, a trailed brake or the lever — and what each
  of those is worth is the `flickDepth` / `brakeDepth` / `leverDepth` group
  above: they lift this toward the layout's `cap` for as long as the weight
  is off the rear, and no further, which is what stops a provoked hatch
  from being a saloon. Never set over
  1: an asked slide above the carried one pins `releasing` at zero and the
  exit stops existing.
- **How much a TRAILED BRAKE is worth to it** (`brake`, × `drift.brakeDepth`
  and `grip.brakeYaw`). Biggest on the front-driver, whose loaded axle is at
  the front, and which has nothing else: the throttle only ever pulls it
  straight, so the brake is what turns it in. Smallest on the rear-driver —
  not because the brake does less, but because a rear axle already loose on
  the throttle has nothing left for it to unstick.
- **How much torque reaches the ground** (`bite` × `spec.traction` × the
  surface's grip). One driven axle on a loose surface spins where four
  driven wheels hook up, worst at the bottom of the gear and gone by the top
  of it. It is the four-wheel-drive's whole case and the rear-driver's whole
  cost — a standing start through water keeps well under half its dry pace.
- **Which wheels are SEEN to spin, and how fast.** The driven axle carries
  `CarState.wheelspin` — how far ahead of the road the engine is turning it,
  m/s. Two things put it there: the torque above that never reaches the
  ground, which is a LAUNCH (including whatever the clutch dropped on it —
  see [the launch](#the-launch)) and fades with `1 - rev` up the gear, and a
  tyre spending its grip sideways (`TUNING.engine.slideSpin` × `slide`),
  which is a DRIFT and does not. It is capped by the gear it is in — a wheel with a gear
  engaged cannot turn faster than the engine can spin it, so a fully lit axle
  winds to `gearTop × TUNING.revs.limiter` and no further, which is why first
  gear spins away from a standstill and top gear cannot spin at all — and
  chased at `TUNING.engine.spinSettle`, because a tyre lights up over a few
  frames rather than instantly.

  Every wheel otherwise turns at the speed of its own contact patch — the
  car's velocity at that corner of it, projected onto the way the wheel points
  — so an undriven pair can only ever report the road: a front-driver lighting
  its tyres up on the line still has two wheels standing still, and a
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
  a per-layout number. The other exception is not a layout at all: a MOVE
  lowers the floor for anybody who makes one (`drift.provokeFloor`), because
  the corner that needs the lever is a hairpin taken at fifty.

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
It also lifts the layout's slide ceiling while the load is across the car
(`drift.flickDepth`), which is what lets a front-driver reach an angle its
own `depth` would never allow. On gravel at 30 m/s the hatch holds about 9°
on 0.85 of lock driven straight in, and peaks near 24° on the same lock
flicked — nearly three times the angle, and the wheel alone cannot get
anywhere near it, which is the whole reason the move exists and the game is
named after it. The gap widened when the wheel's own depths came down: the
less a layout finds by turning, the more the move is worth to it.

### The trailed brake

The other pedal that turns a car, and the front-driver's everyday one. A
lift takes the drive off the loaded axle; standing on the brakes stands the
whole car on its nose and leaves the rear light enough to come round. The
weight is a lagged state (`CarState.brakeLoad`, on `grip.liftSettle`), so a
stab down the straight is a brake and only a brake carried PAST the turn-in
is a rotation: it opens the slide (`drift.brakeDepth` × the layout's own
`brake`) and `grip.brakeYaw` walks the car into it.

On gravel at 30 m/s the hatch takes a corner on the throttle at about 15° of
slip on a 44 m line, and the same corner trailing the brake at nearly 20° on
a 26 m one — the angle is the smaller half of it. What the pedal really buys
is the LINE, which is why a car that will not rotate can still be quick.

### Seeing it

`make drift` drives every corner the generator can build, once per technique,
and prints what each one bought — plus `previews/drift-<car>.png`, where the
car is drawn every sixth of a second with its travel arrow, so the slip angle
is the visible gap between where the nose points and where the car is going.

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
where the car is chosen, and again under OPTIONS ▸ DRIVING — carried for
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
points, the taper, the bot's target speed, the rev counter, the engine
note, the pre-race card's spec sheet — reads one spec
and knows nothing about transmissions. Both boxes are multipliers on the
same catalog row, so no car is handed a better box than another and the
roster's spread stays the roster's.

**Balance is measured, not asserted.** `npm run sim -- --sweep` races the
whole roster over five stage archetypes and ranks them per archetype; one
car being fastest on all five is the failure it exists to catch. Any change
to these numbers owes that table.

**Revs** (`CarState.rev`, 0 at idle and 1 at the redline) are the DRIVEN
WHEELS read back through the gearing — road speed plus whatever `wheelspin`
the axle is carrying — because with a gear engaged that is the only thing the
crank can be doing. So the needle flares when the tyres light up, the engine
note flares with it, and the wheels the renderer draws are turning at exactly
what the needle says. The GEARBOX still shifts on road speed alone, and so
does the shift light (`gearedRev` in the app's `snapshot.ts`): a needle flared
by a lit-up axle is not a gear that has run out, and a car spinning its wheels
in second wants the throttle backed off, never third. The one exception is the
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

### The launch

Nothing on the grid moves the car, so the throttle there is free REVS
(`TUNING.revs.blip` / `settle`, into `CarState.rev`) — and those revs are the
one decision the start line asks for. On the green they are handed to the
tyres whole (`clutchDump`), because that is what a clutch coming out on a
standing axle does: everything the engine was carrying arrives at once.
`CarState.launchSpin` holds how lit the axle is, 0..1, and spins away
`TUNING.engine.spinLoss` of `gearAccel` for as long as it lasts.

- **Sitting on the revs costs you.** A driver against the limiter when the
  lights change is 13–17 m behind at five seconds. A driver who waited with
  the pedal up and took a THIRD OF A SECOND to react is still a few metres
  ahead of them; one who took half a second has given it all back. The
  penalty is deliberately sized against a human reaction time and not beyond
  it — the start is a skill, not a stage.
- **The pedal alone barely lights anything** (`pedalSpin`, 0.1 of the excess
  over `pedalHold` × the axle's bite). Torque fed smoothly finds a slip the
  tyre can live at; only the clutch's step lights an axle properly. Keeping
  the two apart is what stops the start-line rule from becoming a
  corner-exit rule, and it is why FLOORING IT REMAINS THE RIGHT CALL — the
  game is played on binary pedals (a keyboard, a phone's thumb zone) as
  often as on analogue ones.
- **What an analogue pedal does buy is a shorter mistake.** A lit axle hooks
  back up at `spinHook`, and up to `1 + hookLift` times that for a driver
  easing off — so a launch that went wrong can be gathered up rather than
  ridden out.
- **A four-wheel-drive clears it** — its bite is over 1 to begin with, so it
  can be floored off the line and takes only the clutch's own step. A
  rear-driver spins its wheels away from a standstill however the start is
  made.

It shows as much as it costs: `wheelspin` carries it into the drawn wheels
and the tachometer, the launch cloud is thrown off the same number
(`launchThrow` in `pwa/src/game/dust.ts`), the pipe smokes hardest at
exactly the moment none of the fuel is becoming road speed (`pipeWork` in
`pwa/src/game/fumes.ts`), and the body trembles on its
mounts while the revs are up and the car is not
(`pwa/src/game/car-shake.ts` — millimetres, on the sprung mass and on the
in-car eye, and gone by 50 km/h where the road's own grain takes over).

**And every car on the line does all three, not just the one being driven.**
On a heads-up grid the rivals sit through the same ceremony, and the bot
spends it blipping its own throttle — deeper, oftener and higher at the
green the more temper the crew has (the grid ritual, in
[simulation.md](simulation.md)). Because `car.rev` is the same number for
everybody, the tremble and the exhaust follow for nothing: the rivals'
bodies already read it (`car-mesh.ts`), and the field smokes out of a second
shared cloud on the same terms as its dust (`field-cars.ts` over
`fumes.ts`), thinned by `FIELD_FUMES` and capped to the nearest few crews.
The revs a rival is sat on are the revs its clutch drops on, so the smoke
and the shake at the lights are a true advertisement of who is about to
light their tyres up.

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

Numbers live in `engine/game/defs/tuning.ts` (global feel) and `cars.ts` (per car) — never inline in the model. **`TUNING.drift` is the group that shapes the slide itself** — where it starts, how it comes in, how deep it goes, how it lets go, and when it reads as a drift — and the [`drift-feel`](../.agents/skills/drift-feel/SKILL.md) skill is the map to it: read that before touching any of it. `TUNING.steering` holds the wheel's own response (the rack's rate, the low-speed ramp-in, the high-speed fade, the centred-wheel commitment floor, the tail-torque chatter guard), `TUNING.grip` what is left of the tires (scrub, the slip's self-rotation, power oversteer, the front axle's pull, the lift, the flick, the handbrake), `TUNING.engine` how a car's torque arrives inside a gear and how much of it reaches the ground, and `TUNING.drivetrain` what all of that is worth to each layout. Any change here must run `make drift` and `make sim` before and after — the first says what the CAR does when a driver asks it something, the second what the bot does with the same car — and keep `tests/drift_test.ts` / `tests/jump_test.ts` honest: those tests encode the moments this document describes. What a car CAN do (the traction ceiling, how much slide the wheel finds, where the speed floor sits) is stated once in `engine/game/limits.ts` and read by both the physics and the bot; never restate one of those in a second place.

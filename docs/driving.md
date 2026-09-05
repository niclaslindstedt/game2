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
  least of its own and still never takes it past what the layout can do.
  Lifted toward 1 instead — which is what this used to do — a provocation
  handed every layout the reference angle, and the hatch, having the
  furthest to be lifted, came out of a hairpin on the lever as sideways as
  the saloon that had it all along. And it is HELD once made
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
- **THE THROTTLE IS WHAT HOLDS A REAR-DRIVEN SLIDE.** `drift.angleSpan` is
  the angle a rear-driver holds at full lock ON THE POWER — the state a rally
  car spends a corner in — and `drift.powerSpan` is what coming off it costs,
  ×the layout's own `powerYaw`. A rear-driver has a real steady-state drift
  there: the rear tyre's longitudinal force is what holds the car out, so
  full lock on the throttle sits at 35° and the same lock on a closed one at
  27°. A front-driver has no such equilibrium at all — `powerYaw` is zero, so
  this term is exactly 1 for it and the throttle is still the way OUT of a
  slide (`grip.pullStraight`), which is why the hatch goes the other way: 19°
  on the power and 24° on a lift. The two layouts want opposite pedals
  mid-corner, and that is the single thing a player relearns moving between
  them.
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

  | lock     | 0.2 | 0.3 | 0.4 | 0.5  | 0.6  | 0.7  | 0.8  | 0.9  | 1.0  |
  | -------- | --- | --- | --- | ---- | ---- | ---- | ---- | ---- | ---- |
  | slip°    | 1.3 | 2.7 | 6.2 | 12.0 | 18.6 | 24.1 | 28.1 | 31.2 | 33.6 |
  | radius m | 212 | 115 | 70  | 52   | 44   | 40   | 37   | 34   | 31   |

  ...and the compact, the FRONT-driver, answers the same sweep with about
  half the angle and a line a third wider, because on the wheel alone it
  WASHES WIDE — which is the point of it, and what the moves below exist to
  give it a way out of:

  | lock     | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7  | 0.8  | 0.9  | 1.0  |
  | -------- | --- | --- | --- | --- | --- | ---- | ---- | ---- | ---- |
  | slip°    | 1.4 | 2.3 | 3.5 | 5.6 | 8.3 | 11.2 | 13.5 | 16.2 | 18.5 |
  | radius m | 223 | 146 | 104 | 78  | 63  | 51   | 46   | 43   | 41   |

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
  own depth is 0.42 there is nothing under the setpoint for the pedal to
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
- **Attitude** — the engine owns how the car SITS, in `CarState.pitch` and `CarState.roll` (positive lifts the nose and the right side). Grounded, both are the ground under the wheels: the nose takes the grade along the heading, the body takes the camber across it. Airborne, the pitch is the flight's own arc and the roll is the tumble the take-off put in. It is the body's LONG AXIS that lies along the arc, so which END is leading decides the sign: a car falling forwards has its nose down, one falling backwards has it UP, and one falling dead sideways stays level along its length. Both ease toward their target at `TUNING.attitude.settle` — that lag IS the suspension travel a landing settles through. The renderer only spends the two angles on the right axes; it never derives them.
- **Takeoff** — the body has its own vertical momentum, and the ground is a one-sided constraint on it: it can push the car UP and never pull it down. Every grounded step the body is put where its momentum takes it — the vertical speed it had, falling from there at `TUNING.air.hold` of gravity (about a real g, against the arcade gravity of the flight) — and compared with where the wheels have just found the ground. Under the ground, and the ground has the car. Above it, the ground is falling away faster than the body can follow, the wheels reach down after it on their droop, and the gap is `CarState.loft`. For the first `air.loft` of that the car is grounded and LIGHT (the tyres bleed toward `weightFloor`, the body rides up off the arches); between `loft` and `air.leave` it is SKIPPING — wheels off the ground for a few tenths over a bump or a crown, the tyres carrying nothing, the car still steered; past `leave` the ground has genuinely gone and the car leaves with whatever vertical speed the body actually has. That one rule is every launch there is: a brow holds a slow car, unloads a quick one and throws a fast one, and the one it only just throws lifts off late and low. A crest the flight's own gravity would have held is a HOP (`hopRate`, `hopTime`) — the car bobs over it, books no jump, and comes down soft — and the same at any pace under `crestSpeed`. Two shapes are read directly rather than through the gap: a flagged jump LIP (R6) launches the car from the top of the ramp the moment the ground under its middle drops at `edgeSpeed`, with the launch speed the lip is designed around (`launchKeep` of the wheels' climb, or the smoothed grade's, whichever is more — and from either direction, so a car coming back the other way is thrown off the landing face); and a sharp EDGE — ground falling by more than `edgeDrop` under the car's middle in one step — is a cliff lip at pace and a drop at a crawl, never a face to be driven down. The gap is grown from SPEEDS and never read off heights: the body's against the FOOT's, the mean of the four wheels over the ground they actually covered (`Seat.foot`, `CarState.foot`), because the body rides the four and not the point under its middle — a rut takes one wheel down a hand's width and the body a quarter of that. And the body arrives at each step with the smallest climb any reading of the ground gives it (a wall says the car is climbing at absurd speed while the wheels go nowhere) and never a slower fall than the foot has been doing over the last `footLag` (`CarState.footMean`) — the smoothed grade under a car sliding across a banked, crowned road reads a gentler descent than the wheels are on, and a body reset to that every step lifted off nothing. A flight ENDS where the body meets the ground, not where the point under its middle does: out in the wild the seat the car will stand on (`seatOn`) is read at the attitude the flight is holding, so a car pitched into a hillside lands on it rather than flying on with an end of itself inside the hill until its middle catches up. Flat ground and the road's own smooth profile give the centre back exactly, so an ordinary jump lands where it always did. Two things the momentum model steps aside for: a car PROPPED on a face out in the wild — the seat lifted off the ground under its middle by more than `leave`, a corner up against a bank asking for the top of its reach — follows that plane down as it backs off, the way it follows the wall check, because the plane is the contact model's fiction and not a hill (a car reversing off a bank was otherwise thrown a body-height into the air); and a car PUT DOWN — the grid, a respawn, the beaching after a drowning — is planted (`plant`) with its foot already read, or its first step measured the whole cross-section of the ground as a fall and launched it light onto the line.
- **...and so does the road taken FROM THE SIDE.** A road is a surface, not a line: along the stage it brows and dips, and across it there is R16's crown, the bank R19 puts on a corner, and the ground beside it leaning away. The curvature the takeoff reads is both of those resolved onto the direction of TRAVEL (`pathCurvature`, over `air.crestSpan` lengthways and `crossSpan` of the road's half-width across), so what a car meets depends on where it is going. Drive down the stage and it is all brows; ride up the verge and over the road and it is all crown — and with enough speed that crown throws the car exactly like a lip does. A narrow road is the sharper hump, because the same 17 cm of camber is bent into a tighter radius the less road there is to spread it over; a sealed one is sharper again, standing `asphaltLift` proud of its own shoulder.
- **The roll** — a car that leaves the ground crossed up trips over its outside wheels: a SUDDEN launch — a ledge, a lip, an edge — puts roll in the body from the slide it was holding plus the rotation already in it, and nothing in the air takes it out. The same trip about the vertical axis puts SPIN in it (`air.yawFromSlide`): the tires that were holding the slide let go all at once, so a car that goes over a ledge sideways keeps turning the way the slide was turning it, all the way down. A body that came off its wheels over a brow left tyres that had unloaded across the whole of the loft, and they let go of nothing. Straight and level flies flat; properly sideways goes a long way over; the unluckiest launches go all the way round. Landing on your side is never a clean landing. A lean the springs can still take is unwound toward the nearest upright and then onto the CAMBER under the wheels — level on the road, tipped with the hillside out in the wild. A lean past what they can take is not unwound at all: it is a roll, and the roll owns the car from there.
- **...and the LANDING trips it too.** A car that comes down crossed up is a car whose tyres bite while the body is still going sideways: the bottom stops, the top does not, and it goes over its outside wheels. The first `air.tripSlide` m/s of sideways speed at touchdown is spent skipping and scrubbing on the wheels; every m/s past it is `tripRoll` of roll rate in the body (capped at `tripMax`), scaled by what the tyres are STANDING on — the trip is the tyre biting, so tarmac sends a car over where the same landing in sand is a long ugly slide that stays on its wheels. Whether it goes over is then not a threshold anywhere: `goesOver` weighs that roll against the lift up to the body's own sill corner. About twelve m/s across the car does it on gravel — 26° of yaw at 100 km/h, 20° at 130, 15° at 170 — so the faster the jump, the straighter it has to be landed, and a flick thrown before a lip is a car on its roof. A hop's soft touchdown trips nothing.
- **...AND THE DRIVER DECIDES HOW HARD THEY BITE** (`tripBite`, `engine/game/flight.ts`). The trip is the tyres refusing to go sideways, and how hard they refuse is not a constant — it is three things, every one of them committed IN THE AIR, because the lock is already wound on and the pedal already pressed by the time the rubber touches. THE HANDS: only the front pair is pointed by anybody, so aiming them along the way the car is actually travelling stops them refusing and takes the front axle's half of the moment with it — and aiming them the other way grows it (`air.tripLock`, `tripFront`, `tripMiss`). The wheel can be OVERDONE, which nobody wrote down: the best catch points the fronts exactly along the travel, so a full lock into a slide shallower than the lock is past the mark, and at 21° of slide half a turn of the wheel is the better save than all of it. THE PEDALS, through the friction circle: a tyre has one budget and the trip is that budget spent sideways, so a pedal that takes its share along the car first roughly halves the bite (`tripPedal`) — and the save is never free, because rubber that is not gripping is not scrubbing the sideways speed off either, and the car that talked its way out is still travelling sideways into whatever is next. THE ARRIVAL: the moment is the lateral force times the weight's height and the force is what the load will pay for, so a car that SLAMS down loads its tyres past its own weight while the springs are taking it and bites half again as hard (`tripLoad`), which is why getting the car flat and level in the air is the other half of the save. Measured on one landing at 11 m/s across, the roll the bite puts in runs from 0.75 rad/s caught and braked to 2.41 sawed the wrong way, against 1.92 for a driver doing nothing at all; at 16 m/s across, caught-and-braked is the only input of the eight that stays on its wheels.
- **THE ROLL ITSELF** (`engine/game/roll.ts`) is a body with a shape and a weight in it, and it counts nothing. The car is the box in `TUNING.collision` standing on the ground — four wheel contacts and the eight corners of the shell (`roll-hull.ts`) — and turning that box traces a SURFACE of centre-of-mass height over BOTH of its angles, with valleys where a face is down (wheels, either flank, the roof, either end) and ridges on the corners between. Two angles rather than one because a crashing body is rolled and pitched at once: a car goes over ACROSS itself into a barrel roll and ALONG itself into an end-over-end, and usually both, which is what a corkscrew is. Gravity pulls the centre along that curve; the ground DRIVES the roll on while the car is still travelling sideways — and that drive is one Coulomb budget, `roll.faceGrip` times the body's own weight, pointing against the way it is actually going: the share ACROSS the car works on the lever of its centre height and turns it over, the share ALONG it simply retards it, and the two are the same friction spent once. It is paid for out of the travel, which is why a roll ends when the travel does. Each contact swaps which corner the body pivots about, keeping a share of the roll that falls out of the geometry alone — about half on a flank, which carries the car on over, and under a fifth square on the roof, which is where one stops. A wheel arriving is swallowed by its spring (`roll.sprung`) rather than taken out of the body. Past about three rad/s the surface falls away faster than gravity can follow and the body is genuinely flying between its contacts, which the roll flies itself: a turning body arcs about its own centre while the wheel plane goes round with it. So a car goes over as many times as it has the energy for and comes to rest on whichever face it ran out on — and the wheels-down valley is the deepest, which is why most rolls end there without anybody deciding they should.
- **A ROLL CARRIES.** `roll.faceGrip` is the shell's coefficient and not a tyre's — accident reconstruction measures a real rollover at around half a g, and the model comes out at 0.42 on bare ground, measured as a fraction of THIS world's gravity, which is the only way the two are comparable (the game's gravity is 1.6x the real one and the crash's retardation scales with it, so the ratio is the coefficient and the absolute figure is not) — and it is the ONLY thing that slows a rolling car down, so a body in contact loses about five m/s² and a body between contacts, which is most of a fast roll, loses nothing at all. A car that goes over at 165 km/h therefore covers the better part of a hundred metres, bouncing forward and hitting whatever is in its way, rather than stopping and spinning on the spot. Two things had to go for that to be true, and both had read as a car hitting glue: a flat exponential scrub on the travel beside the friction, and the friction itself charged against arrivals the body never made. A contact is charged only for what the FLIGHT put in (`g × airTime`, capped by the closing speed against the curve) — never for the seat's own rotation, which is the centre climbing its corner under the body's own roll and which the pivot exchange already prices — and a WHEEL arriving does not drag the travel at all, because a tyre rolls and hands the blow back through its spring (`roll.sprung`), exactly as it does with the rotation. Without that last one, every pass through upright — once a turn — was billed as a full sliding stop. **And a contact has to be a corner CLOSING on the ground**, not a body found below its own surface: the surface sweeps up and down at slope × rate as the body turns, which past a corner is ten metres a second, so a body going over at eight rad/s is overtaken by it and left underneath it every step or two while one and the same corner is still coming down. Read as arrivals, those steps were charged a full pivot exchange each — one hand-over billed four times, 8.2 rad/s down to 3.3 through a single corner, on contacts whose descent was nothing at all. **And a body between contacts does not ride the terrain.** The height a flight carries is the weight's WORLD height; comparing it against the ground under the body every step re-seats a flying car onto whatever it happens to be over, so it climbs hills for free in steps where the only term that ran was gravity. On flat ground that cancels exactly, which is why only a crash thrown off a lip into the wild ever showed it — there it was an eighth of the whole budget.
- **WHAT IS ON THE GROUND DECIDES WHAT IT COSTS** (`roll.faceGrip`). The shell is not one surface, so the coefficient is one per face, blended across the quarter turns between them: `wheels` is rubber being dragged sideways and is the highest of the three — it is what bites at the start of a trip and sends the body over its outside wheels; `flank` is a door skin and a sill, smooth, and the longest slide of the three; `roof` is glass, gutters, the pillars and whatever aerial is still attached, all of which dig in, so a car on its roof stops noticeably faster than one on its side. Blended rather than stepped, because a body going over passes through every attitude between them and a coefficient that jumped at each face would kick the roll every quarter turn. The three SHELL faces sit in accident reconstruction's own range for a body sliding on its panels over soil and gravel (0.4–0.6); they were each a couple of hundredths higher while the crash ledger was leaking a fifth of every fast roll, because a body handed free energy at each hand-over needs more friction to stop in a plausible distance. `wheels` did not move with them — it is a tyre being dragged sideways, and nothing about the ledger was ever an argument about rubber.
- **A ROLL HAS TWO HALVES, AND THE STATE NAMES THEM.** A body past its outside wheels TURNS over its corners — walking sideways, airborne between contacts, swapping which corner it pivots about — and then, when the turning is spent but the travel is not, it SLIDES: lying flat on one face and going somewhere. They share a model (one Coulomb budget under whatever is on the ground, one centre-of-mass curve), which is why the roll owns both and `CarState.rolling` stays true through a slide; `CarState.sliding` says which half it is in, and is only ever true while `rolling` is. They do not share an appearance — a turning body is the one thing a boom cannot follow, a body sliding flat and straight is the one thing it can — so anything choosing a shot, a sound or an effect reads `sliding` rather than assuming a car off its wheels is cartwheeling. A slide is not over: the ground can put the car back over at any moment.
- **THE CURVE IS READ AGAINST THE GROUND, NOT THE HORIZON.** Every valley of `centreHeight` is a face a body comes to rest on, and on a hillside those rest attitudes are the hillside's — the same angle a car settles its springs onto (`camber`). So the roll resolves its attitude against the cross-slope under it (`bed`) before asking which way gravity takes it, and rounds its settled face against the bed too. Without that the model has no idea a slope is there: a body on its ROOF sits at the bottom of the roof's valley and gravity pulls it back in however steep the ground, and a car slid down a 24° bank upside down for eleven metres without once threatening to go over. **What actually turns a slide back into a roll is an EDGE**, not a ramp — a roof resting on a plane is a stable face however steep the plane, and it is the ground running out from under one side that puts the car over. Off a solid and off the drag levering the body past its own corner are the other two ways.
- **...AND A CAR THAT ENDS UP ON ITS ROOF GRINDS TO A STOP.** The roll owns the car until it has stopped TRAVELLING as well as turning, unless the face it settled on is its wheels — that one is a car that drives on and is handed straight back. There are no tyres under a car on its roof: there is a roof, and the ground goes on taking the travel out of it at the same friction that was turning it over, which for 70 km/h onto a roof is a couple of seconds and twenty-odd metres of grinding at nearly a g. Handing the car back the instant the ROTATION stopped froze it instead: `step.ts` sets `overturned` on a body that is down, still and off its wheels, and `stepOverturned` returns before anything moves, so a car that settled onto its roof at 63 km/h stood there like a statue for the whole of `roll.lieFor` with the speed still unspent in its velocity. `roll.restSpeed` is where the grinding stops and the lying begins.
- **A CAR UP ON TWO WHEELS IS A CAR SOMEBODY IS DRIVING.** Past `air.leanFree` the body stops being held by its springs and becomes a rigid body pivoting on its outer contact line, turned by `leanTorque`: gravity down the rollover's own surface, plus the lateral force the tyres are making working on the lever of the weight's own height. Steer INTO the side the car is standing on and the cornering force pushes it back down onto four wheels; steer AWAY and it holds up there, or goes over. Nobody scripted that — it is the sign of the cornering against the sign of the lean, and it falls out of the same geometry the rollover runs on. Measured with a driver correcting every tenth of a second (a person, not a 120 Hz loop), the balance is playable between about **40° and 52°** of lean and holds for seconds; below 40° the weight is still well inboard of the contact line, gravity simply wins and the car is back on four wheels inside a third of a second whatever the driver does; at 54° the sill corner takes over from the tyres and it is a rollover. `air.leanFree` sits at 26° — below the band on purpose, because the hand-over is what settles the body onto a new camber and switching it off mid-settle leaves the car leaning at an angle the ground never asked for. **The throttle does not read**: it reaches the balance only through the speed in `u × yawRate`, and over the third of a second a save lasts that barely moves.
- **AND THE DRIVER IS STILL DRIVING WHILE IT GOES OVER** (`driveRolling`). The pedals and the wheel reach the world through tyres and through nothing else, so what a player has left in a crash is whatever of the contact patch is still rubber (`tyreShare`): all of it on the wheels, about 0.6 balanced at the sill corner, and exactly none from the flank round to the roof. Nobody writes down "this crash is now unrecoverable" — the geometry says it, and it says it continuously. What that buys is not an escape hatch but a fight: the steering force acts at the ground on the same lever the friction turns the body over on, so one way it pushes the car back onto four wheels and the other leaves the roll to finish, exactly as `leanTorque` already does for a car balanced on two wheels — the same lock, on both sides of the moment the roll hands the car back, because a driver who had to reverse their hands on a flag they cannot see would be worse off than with no authority at all. The throttle carries the car further and lengthens the accident by a couple of tenths of a second (it was four tenths while the ground under a crash was steel — a road that gives and a shell whose faces fold differently turn the body less per contact, so more accidents settle onto a face the throttle cannot reach through); the brake lands it on its wheels instead of on its side — one accident in ten that would have left the car lying there for the crew — which is the difference between a bad moment and a retirement. What the brake does NOT do is stop the car harder, or even end the accident sooner: a body already sliding has the ground dragging at the whole of the patch's budget in the direction it is going, no pedal can ask for more friction than the patch has, and swept over ninety trips the brake moves a roll's length by a hundredth of a second. It was once written down here as four tenths off the roll, measured at one staging — and a rollover is chaotic enough that any single staging will show a pedal doing something, half the time the opposite of what it does. **It is one patch and one budget**: the driver points the tyre and the ground drags with what is left (`air.roll.driver`), because a commanded force the ground then reacted to in full would be the same friction charged twice, and steering either way would trip the car. And **only the engine may add speed** — the wheel and the brake redirect and retard, so with them the crash ledger stays where a crash with nobody driving leaves it.
- **...and it hits what is in front of it.** A car going over rides over nothing (`ridesOver`): it has no wheels underneath it to climb anything with, and its origin is held a hull's width off the ground, so the ride-over bar measured from there used to fly it over every stone, post and tyre stack in its path. Solids reach a rolling body the same way they reach any other — an impulse, a yaw kick and a trip (`tripRoll`) — which is what turns one roll into a different accident half way through it.
- **The body WALKS over its corners.** A rolling car turns about the corner of itself that is on the ground, and that corner is a metre out from its middle — so going over carries the whole car sideways, about two metres per half turn. Placing the body by its height alone puts the right corner on the ground at every attitude but leaves it turning about a fixed point under its own middle, which reads as a car holding on to a bar at ground level and spinning round it. The walk per radian is exactly how tall the body is standing on that corner (`clearOn`, in `roll-hull.ts`): zero flat on its wheels, widest up on a corner — and it happens in BOTH planes, so an end-over-end strides the car down the road as well. In the AIR there is no corner, and the body turns about its WEIGHT: the weight flies straight, and the origin — the wheel plane under the car's middle, which is what `CarState.x/y/z` is and what the renderer hangs the body off — goes round it (`weightFromOrigin`), out to the side as the car comes onto its flank and back under it on the roof, in height, across and along at once. Fly the origin straight instead and the weight swings round the wheel plane on the arm of its own height, which reads from every seat as a car slung round an axis somewhere under it.
- **NO FACE ARRIVES FLAT, AND THE GROUND IS WHAT SAYS SO.** The corner reaching the ground reaches it before the rest of that face does, so every contact throws the body about all three of its axes — and none of that is seeded any more. One Coulomb budget under one patch, pointing against the way that patch is actually moving, does every job at once: the share across the car rolls it, the share along it pitches it, and the whole vector working on the patch's own offset from the weight SPINS it. So a crash's spin answers to how fast the car is going, is checked by the ground, and changes hand with the slide — which a kick with a ceiling on it could not do, and which is why `air.roll`'s `pitchKick`, `yawKick`, `yawMax` and `kickAt` are gone rather than retuned. `CarState.pitchRate` is a real degree of freedom for the length of a roll, free in the air and damped on the ground (`air.roll.pitchDamp`). That is the corkscrew, and it is why two rolls off the same lip end up facing different ways.
- **AND THE CORNER IT LANDS ON TURNS IT** (`slamTurn`, `roll-contact.ts`). The ground stops the patch; the rest of the body does not stop; and the impulse that arrested it acted an arm's length from the weight, so it TURNS the car — which is Newton's third law and the whole of why which part lands matters. Without it the ground could do exactly one thing to a crash, take SPEED out of it: every accident ran out along the plane it started in, a barrel roll stayed a barrel roll, and the thing a rollover is famous for — the change of hand half way through, when a corner digs in and the car goes somewhere else — could not happen, because nothing carried a torque from one axis to the other. `pivotKeep` is the ROTATION's own arrival and works in one plane by construction; this is the FALL's, and a fall does not know what plane the body was turning in. It is resolved along `seatSlopes`, the same surface gradient gravity is already written on, so the two can never disagree about which way a body falls; and it saturates as the shell FOLDS rather than resolving the whole arrival, because a panel is not a billiard ball — it collapses at a roughly fixed force, and what reaches the body flattens off however hard the corner came down. **What that asymptote IS depends on what arrived** (`collision.structure.fold`, read through `engine/game/structure.ts`): the nose and the tail are crumple zones and pass on the least, so a car coming down on its nose is stopped by the contact; a flank is a door over its bars; the roof is the CAGE, the stiffest thing on a rally car, which folds a hand's breadth (`structure.roofMax`) and passes the rest on, so a car coming down on its roof is THROWN by the contact — which is what a rollover on a caged car looks like. It is divided by the car's own mass ratio, because a fixed force changes a heavy body's speed less: the coupe is turned less by the same corner than the hatch and folds deeper for it. And every face climbs toward the bare cage's figure as it is used up (`fold.cage`), so a car gets HARDER as it is destroyed: the first contact of a roll is a door skin folding and the fifth is the ground meeting the bar behind it. That last part is not a detail: resolved in full, a car thrown off a lip at eight rad/s met the ground at ten metres a second, had all of it taken out through the arm of the corner it caught, and came out at 0.8 rad/s — one turn, from an accident that runs to two and a half. A rollover is not a stop.
- **A CRASH IS ONE ENERGY BUDGET, AND IT IS METERED** (`crashEnergy`). What the car is travelling with, what it is turning with, and how high its weight still is, as one number in joules per kg — everything in the model may only ever TAKE from it, and the single exception is the flight's turbulence, which is bounded and averages to nothing. Gravity is inside the budget rather than outside it, which is what makes a car rolling DOWN a hill legitimately gain speed and one rolling UP a bank pay for the climb, with the total flat either way. It is never clamped: a cap on a budget hides the bookkeeping error that made it wrong instead of showing it, so this is an INVARIANT for the labs and tests to hold the model to, and `make crash` prints the ledger under every scenario — **split by REGIME**, which is the whole reason it is readable: a gain read as one percentage is a number to argue about, and read as `air->air` / `air->grd` / `grd->grd` it names the term at fault, because the three are different physics. Every rotational fault this module has had broke the invariant, and none of them errored — they read as numbers that wanted tuning. What is LEFT of the leak is one or two steps at each hand-over between the ground and the air, and it is not a bug to be found: a body in flight turns about its own weight, a body on the ground turns about the corner under it and carries the weight round on that arm, and the two hand-overs disagree about that arm by a fifth of a fast roll's budget. Charging it — either by scaling the rotation to what the arrival could pay for, or by settling the residual as a normal impulse at the corner — does close it, and both flatten `make roll` to half a turn at every entry from 24 to 50 m/s, because they take from the rotation at every one of the touchdowns a fast roll makes and a slow one does not. Closing it honestly means the grounded step coupling the travel to the rotation, on an inertia of `spin + slopes²` rather than the constant the model integrates on today — a different model and a full retune of the crash's feel.
- **THE MASS DISTRIBUTION IS THE CAR'S OWN, AND IT IS MEASURED** (`massSpread`, `air.roll.spread`). What a rotation is worth against the corners is three radii of gyration, and they come from the NHTSA Light Vehicle Inertial Parameter Database's regressions for cars — several hundred vehicles put on an inertia measurement facility and swung: roll `Ixx = 0.497m − 181`, pitch `Iyy = 3.079m − 1729`, yaw `Izz = 3.176m − 1754`, in kg·m² against kerb mass. Divided by the mass they are the radii squared, which is what the model wants, because every term here is mass-normalised and the mass divides straight out. So a heavy car does not roll slowly for BEING heavy; it rolls slowly because its weight is further from its axes — and across this roster's 1020–1300 kg that is 12% in roll and about a quarter in pitch and yaw, which the coupe feels as genuine resistance to an end-over-end and to a spin. The inertia about the CORNER the body goes over is the same distribution moved onto that corner by the parallel-axis theorem rather than a second set of numbers, so the two can never disagree with each other or with the box. **Plus the cage** (`spread.cage`), which none of the database's road cars carried: forty-odd kilograms of tube at the sills, the pillars and the roof, at its own radii, added per kilogram of the car it is in — three to four per cent on every axis, all of it resisting the turn.
- **AND WHERE THE WEIGHT SITS IS THE CAR'S OWN TOO** (`CarSpec.centreHeight`, `balance` → `MassSpread.weight`). The box is one box for the catalog; the weight in it rides at each car's own height and its own place along the wheelbase, and every geometric question the crash asks — the centre-of-mass surface and its gradient, the arm a contact turns the body on, the patch's offset the friction spins it about, the arms `pivotKeep` trades between, the parallel-axis arms — is asked of that weight. So the tall front-driven hatch climbs its sill corner on less roll than the low four-door and goes over its nose more readily than its tail, and a nose-heavy car sliding sideways is spun about a patch that sits BEHIND its weight — the tail comes round first. **A valley floor is flat.** Each face of the surface is a V with a kink at its bottom, and the central difference the gradient is read with straddles it: with the weight on the box's centreline the two sides cancel, but a weight carried forward makes every V asymmetric, and the mean at the bottom read as a steady slope — a car lying flat on its four wheels pitched at a third of a g by ground it was resting on. Where the two sides rise both ways the body is in the valley and the gradient is nothing (`seatSlopes`, `kinked`); a ridge keeps the mean, because there the only question is which way it falls.
- **AND NOTHING IN THE MODULE CAN ADD ROTATION.** Gravity trades it against the surface, the ground's one budget is capped at the impulse that would bring the slipping patch to a common speed with the ground (friction stops a slip, it never drives one), the damps and the pivot exchange only ever take, and the flight's turbulence is bounded and averages to nothing. That invariant is the model's spine, and every rotational fault it has had has been something quietly breaking it. Two did at once: the spin's torque was written with the sign that turns the patch FURTHER into the slide rather than out of it, which is anti-damping by construction and wound a car merely lying on its roof from a third of a rad/s up to 6.7; and the patch's slip did not include the sweep the spin itself was putting under it, so the friction could not oppose the rotation it was creating. A third — re-expressing the roll on the car's swinging axes without handing the pitch its half back — put 0.086 rad/s a step into the roll of a crash at six rad/s of yaw, half again what the ground was taking out. The exchange is gone entirely: it is a change of basis or it is nothing, and the honest pair needs the rate the NOSE comes round at rather than the body's rate about the world vertical, which the module cannot have while the ground's spin torque is conjugate to the heading.
- **WHAT IS BEARING AND WHAT IT IS LYING ON ARE TWO QUESTIONS.** The contact is the points actually carrying load — within a couple of centimetres of the lowest, because neither the shell nor the ground is the plane the arithmetic pretends. The FACE is everything near enough to the ground _for how far out it is_ to take the load as the body rocks the last degree or two down onto it, which is an ANGLE (`air.roll.settled`) and not a height. That distinction is what lets a face answer a moment at all: the normal force shifts within the face it is on, so a car sliding squarely on its roof tracks straight instead of tumbling end over end, and a car up on a corner, where there is no face to shift within, does not. Asked as a height it was never true — over five crash scenarios a whole face was down in one step out of nineteen hundred — so nothing ever answered the friction, and the roll could never report that it had come to lie on anything. **And four points down is not a face if they lie in a LINE.** A car up on one side has four — two wheels and the two sill corners over them — reaching two metres along the car and a hand's breadth across it, which is the RIDGE between two faces and the one attitude a crash most needs to know is not a resting place. Counting alone called it a face, and both ends of that were wrong: the settle handed back a car balanced on its edge as one that had come to rest, and `step.ts` booked it overturned in the same breath, so braking a rollover to a standstill could still end at the last split board. A face has to reach `air.roll.faceSpan` both ways, which sits between an edge's fifth of a metre and the smallest real face on the box — an END, the body's width one way and floor-to-roof the other.
- **WHAT THE GROUND THROWS IS WHAT IT WAS GIVEN** (`landing.took` → `crashBurst`). The gravel and the dust off a contact are sized by the energy the ground had to swallow, J per kg, and never by how fast the corner was going. Two halves: the arriving corner's own `slam²/2`, which is the same quantity a car landing on its WHEELS reports so both kinds of arrival sit on one scale; and the crash ledger's own drop across the contact, which is the rotation the pivot exchange really took. The first is needed because most of a fast roll's contacts are glancing taps that keep nearly all their rotation, so the body's total barely moves while a corner ploughs into the ground at ten metres a second; the second is the half a speed cannot see, and it is what makes a contact that arrives gently but stops a whole rollover throw like the accident it is. Energy goes as the SQUARE of the arrival, so a contact twice as hard throws four times the stones — which is what makes a big one read as an event rather than as a slightly bigger scuff.
- **A roll STRIPS the car.** Every contact of a roll is the ground meeting sheet metal with nothing sprung under it, so the landing's own tolerance does not apply: `air.roll.shellFree` is what a shell arrival gets for free, and it is a fraction of `collision.hardLandSpeed`. A car that has been over loses its glass and its mirrors, folds the faces it came down on, and past a certain roll loses the doors, the lids and eventually a pair of wheels. The roof folds by half what a panel does for the same arrival (`structure.roofCrush`) and stops at the cage (`structure.roofMax`) — the health schematic reads it against that stroke, not the ring's. See "Collision and damage" below for the faces that fold.
- **THE GROUND UNDER A CRASH IS NOT STEEL** (`TUNING.surfaces.give` / `plough`, `groundOf` in `roll-contact.ts`). Gravel displaces, soil furrows and sand swallows a corner, and every bit of that is arrival that neither turns the body nor folds the shell — the ground took it. So a contact's reaction and the crush it books are both read net of the surface's GIVE (a quarter in open country, a third in sand, a twentieth on a graded road, nothing on tarmac), which is why the same fall onto sand turns the body less and marks it less than onto a sealed road, and why the rollover that strips a car is the one on the tarmac section. A sill dragging a furrow through loose ground costs friction a door skin on pavement does not, and that is the PLOUGH: added to the shell's own coefficient for whatever of the patch is shell rather than tyre, over the grind and never at the arrival — an arrival's budget is already `grip × descent`, and a coefficient added on top of it overspent the patch and read as energy made at the touchdown. Accident reconstruction has a rollover on soil stopping harder than one on pavement, and this is that difference. A bench with no surface is a rigid plane. A hard landing on the WHEELS reads the same give against the underside.
- **AND THE OUTSIDE CAMERA GETS OFF ITS BOOM** (`pwa/src/game/camera-roll.ts`).
  A rolling car is the one thing on a stage a boom cannot follow — it is off
  its wheels, its heading and its travel have come apart, and it is in the air
  between every pair of contacts — so a chase rig tracking a blend of nose and
  travel whips through a full circle. The five outside rigs therefore stop
  being rigs for the length of a roll: the lens coasts to a stop where it was
  standing, steps back if it was sitting right behind the bumper, and watches
  from the verge. It zooms to hold the car a readable size as it goes away,
  caps how far off centre the pan may lag (against the lens it is actually
  drawing at), and CLIMBS — up and forward, rate-limited — until its sight
  line to the car clears whatever ground has got between them. It holds for
  `roll.lieFor` afterwards and then flies home into the pose the driving rig
  has been standing in underneath it all along, unless the car has been
  respawned out from under it, which no pan can cross. **The hold is for a car
  that is LYING there, and only that** — it is asked of `state.overturned`, the
  engine's own answer to whether anybody is driving this car, rather than of
  `rolling` going false. The crash hands a car back the moment its tyres are
  down and the rotation is spent, however far over it is still holding, and
  standing the verge lens through a wreck's beat left the shot watching the
  player accelerate away up the road for a second and a half.
  **...and once the driver has the car, the shot is finished with that
  accident.** It hands the frame back on a short clock (`rescue`, half the
  `handOver` a finished crash gets — halving it is felt, quartering it is
  seen as a cut) and then LATCHES itself off: a car that has been fought back
  from is very often not out of it, the body is still leaning and one more
  edge puts it over again, and a shot that planted for each of those would
  take the camera away from the player exactly as often as they were saving
  the car with it. What clears the latch is `CarState.planted` — all four
  tyres carrying and the body inside the lean its springs hold, which is the
  handling model's own line for a car that has fully come back rather than a
  threshold restated in the renderer. A respawn clears it by putting the car
  down planted. So the verge shot is available once per accident, and the
  next accident begins only when the last one has genuinely ended.
  **The three in-car views keep theirs**, and go over WITH the car: a lens
  bolted to the bumper, the scuttle or the driver's head is not failing when
  the car rolls, it is showing the roll from the one seat nobody can buy a
  ticket for. Driving, those rigs take only a share of the body's roll through
  a bit of play (`rollFollow`, `rollPlay` — a driver levels their head against
  a camber); while `car.rolling` the neck hands over to a bolt
  (`camera-eye.ts`), and the gaze becomes the body's own basis one for one,
  because two thirds of a turn while the car takes a whole one slides the
  interior round the lens. That share is also why the eye reads `rollTilt`
  rather than the raw angle — `car.roll` is never wrapped, and a fraction of
  the whole turn a car carries after going over once is not zero.
- **A car the roll leaves off its wheels is a run that is over where it lies.** There is no tyre on the ground, so nothing the driver asks for reaches the car; `state.overturned` holds it there for `roll.lieFor` and then puts the crew back at the last split board (R28), exactly as a drowning does. It is the same rule for the FIELD, without a line of its own — every rival is stepped through the same code.
- **...AND WHICH WAY UP IS ASKED OF THE BOX, NOT OF THE ROLL ANGLE.** With a free pitch axis the attitude is the COMPOSITION of the two angles, and half the ways a car ends up off its wheels do not show in the roll at all: no roll and half a turn of pitch is a car lying on its roof, and half a turn of BOTH is a car sitting squarely on its tyres facing backwards. Reading the roll alone got those two wrong in opposite directions — the first was left where it lay for the rest of the run because nothing ever marked it overturned, and the second was teleported to a split board for facing the wrong way. The catch is that `CarState.pitch` is two things under one name: the box's own rotation, and the nose angle a DRIVEN car carries on its suspension. `settlePitch` CLAMPS the second at `attitude.pitchMax`, which is more than the box's own pitch basin, so the two separate exactly — within that clamp it is an attitude and reads level, past it nothing but a crash can have put the car there.
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

**The verge is one surface, not two readers.** The mat is stated by the road (its crown, its wheel tracks, its shoulder) and the country by the terrain lattice, and they are the same ground for the mat and the bare metre and a half past it — but the road's cross-section is a FORMULA, and past that it runs on for ever, gently, where the real ground drops away down an embankment. Metres out, which is exactly where a car's own body corners are asking, the ribbon is a fiction worth up to a body's height. So it hands over to the terrain ACROSS the verge, on the same smoothstep R16 draws the shoulder with, and by the line where the car counts as off the road the two are the identical surface. This is load-bearing rather than tidy: the body's momentum is measured against the ground the wheels found (`Seat.foot`) and the wheels' own speed is a height difference divided by `dt`, so reading one surface on one step and the other on the next was not a small error but tens of m/s of ground apparently falling out from under a car that was merely driving off a road — a whole loft opened in a single step, the car thrown upward at the verge line and left riding the fiction across the country. The corner lift the body is seated on (`seatOn`) hands over on the same ramp for the same reason: none of it on the mat, where a road is built smooth across the body's length and a car seated on its own crown would ride high on every stage; all of it out in the country; and never a third of a metre of body arriving in one step at the line. A bridge deck is the exception both halves keep: past a parapet is air rather than a shoulder, so a deck holds its own mat out to the parapet and hands a car that has left it to the river below.

And the grade is felt on the CAR's own axes, not the road's. A road states its shape in its own frame — the climb down the centerline and the camber across it — and the car on it may be pointed anywhere: down the stage, back up it, or straight across. That pair is turned onto the car's nose and its right before anything reads it, so gravity holds back whichever car is climbing, the body pitches and leans the way the ground under it actually goes, and a car crossing a road feels the crown rather than the hill. A hill is the same hill whichever way you are pointed at it.

## Surfaces

| Surface     | Effect                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gravel      | The baseline: full power, honest grip, dust off the rear when sideways — and a plume towed off the back wheels from 30 km/h up                                                                                                                                                                         |
| Sand        | The desert's bladed road (R40): a fifth less grip than gravel, a breakaway a fifth further out, half again the drag and some of the throttle swallowed — slower in a straight line, sideways sooner in every corner, and a slide that runs further and settles later. Same loose-surface rubber        |
| **Asphalt** | A third more lateral grip, a sharper wheel to spend it with, and under two thirds of the breakaway angle: the corner that needed a slide is driven round, the drift has to be ASKED for and stays small when it comes — and it throws nothing at all until a tire is overwhelmed, then smokes it black |
| Water       | Fords and shallows: a splash on entry, heavy drag, reduced grip and power                                                                                                                                                                                                                              |
| Nature      | The open landscape off the road: loose grip, and NO top end of its own — the wild digs at the driven wheels off the line (`natureDig`) and lets go of them by ~125 km/h, so it is slow to get out of and then runs to whatever the gearbox is worth                                                    |

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
is going (`drift-spray.ts`, every number of it in `DRIFT_SPRAY` in `drift-throw.ts`). Two things
throw it and they add. A tyre dragged across loose ground ploughs what is in
front of it, so the leading wheels — the ones on the side the car is sliding
towards — fan stones out ahead of themselves however the car is driven, and
the rear axle does this on every layout because a sliding tail moves
sideways whatever is turning it. The trailing wheel of each pair is running
in the furrow the leading one has just dug and finds far less left to throw,
and the harder the pair is being dragged the wider that gap opens — which is
what puts the tail out on the OUTSIDE of the car as the angle comes on,
rather than under the middle of it. A DRIVEN wheel digs DOWN into the
surface as well as being pushed across it, so it throws half as much again
as a merely dragged one before it has broken loose at all; once it is also
outrunning the road (`wheelspin`) it is spinning on the same patch and fires
what it digs out backward too, at nearly four times the plain throw. So the
axle the drivetrain turns carries most of the tail: a rear-driver sprays off
its tail, a front-driver off its nose, all-wheel drive off both. The tail thickens with the slide,
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

Two things read the splits. The HUD flashes the board under the mirror for
a few seconds: the SEGMENT — how long the road since the last board took —
big, which board it was beside it, and under that the gap to whatever the run
is chasing, measured against the ghost's own splits, which ride on the tape
(`GhostRun.splits`) rather than being read back off the replay, so the number
is there from the first board even on a run that is well up the road on its
ghost. That segment is also offered to the machine's own record book
(`pwa/src/game/split-records.ts`): quicker between those two boards than
anything ever driven here and the flash says NEW RECORD! in green. The book is
per stage and per board on the lap, it is written the moment the board goes
by rather than at the finish, and the time it holds is never shown — the news
is that it was beaten, not by how much. God mode posts nothing, and neither
does an endless stage, whose boards stand wherever the road happened to
stream. And a respawn goes to the last board (above). The minimap
marks the board still owed — a ring while it is inside the window it draws,
a chevron on the rim pointing at it while it is not, which on a stage of any
length is most of the time. It is the mark to steer at from a field or a
wrong turn, and the one mark on that map that can be BEHIND the car.

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
  buries one end of it. A corner over ground rising harder than the wheels
  carry the car at its speed (`climbGrade`, limits.ts) is against a WALL
  rather than standing on a slope, so its claim is capped there and the
  contact model takes over — and the limit is arcade-generous: a little
  under 45° (`TUNING.collision.climbLimit`) from a crawl, rising with speed
  to the full refusal (`wallSlope`) at nearly 70° once the car arrives at
  `climbSpeed.to`. Speed carries a car up a bank: a 55° face is a stop at
  walking pace and a climb at 80 km/h, with the grade draining the speed
  on the way up. A bank, a cut verge, the landing face of a jump are things
  the car bounces up over, and only ground steeper than 70° is a wall at
  any speed — rock or soil, the same face to a wheel. The
  grade under the wheels is read over a wheelbase-scale baseline
  (`TUNING.hills.gradeSpan`) along the heading AND across it: banks push
  back the moment the wheels touch them, the nose pitches with the local
  hillside, and a side slope pulls the car toward its downhill side. The
  brow keeps the road's wide baseline, so a cliff edge or a sharp bank at
  pace still throws the car — spontaneous jumps, no ramp required.
  Rough ground costs ACCELERATION, not top speed: a driven wheel on
  unconsolidated ground digs rather than drives, so the wild takes
  `TUNING.surfaces.natureDig` out of the throttle from a standstill and has
  given all of it back by `natureDigSpeed` (~125 km/h). A field is half
  again as long to 100 km/h as the road is — and past that it is a road
  with nothing painted on it. Nothing but the gearbox holds the top end:
  ground flat and open enough runs a car out to the same 190–240 km/h the
  stage does, and the crest at the end of that run is taken at whatever it
  was worth. In practice the LANDSCAPE is the limit — hills, trees and the
  grade underfoot settle a straight-line excursion somewhere between 130
  and 200 km/h depending on the country — which is the limit worth having,
  because finding a plain and using it is a thing the player did. What the
  wild costs is the time it takes to build the speed, and the corner that
  cannot be taken once it is built (`grip` out there is 0.7).
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
- **What counts as an obstacle** — `SOLID_PROP_HEIGHT` (0.43 m) is the
  bar, set as high up the hood as the catalog allows: the lowest nose in
  the catalog rounds down to a 0.74 m lip and the other bonnets sit near
  0.85 m, and anything standing higher than the bar meets the body and is
  placed as a solid. Stone shorter than the bar is
  litter the renderer scatters for itself and the wheels ride straight
  over, and it is the only stone the renderer is allowed to plant. Of what
  IS placed, the shortest are still the wheels' business: a solid whose top
  stands under `TUNING.collision.rideOver` (0.52 m) over the car's own
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
  at, and, while the first lap has taken no board at all, the start line
  with a WHOLE CAR on it (the damage ledger, below). The **wedge check** — throttle held for `TUNING.offTrack.stuck.after`
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

- **The impulse.** Speed INTO the surface comes back at a restitution that
  FALLS with how hard the car arrived (`restitutionAt`, `structure.ts`):
  `collision.restitution` is a gentle contact's coefficient — the bumpers
  and the bark giving and returning — and past the scuff floor it falls as
  `elasticSpeed / (elasticSpeed + over)`, because the arrival is spent
  deforming the car and a fold returns nothing. That is the curve every
  barrier test draws: about a third at walking pace, a tenth at 50 km/h, a
  twentieth at 100. A constant coefficient, however low, threw a car that
  met a wall at 120 km/h back up the road at 35 — a rubber ball where there
  should be a wreck; now it is stopped and folded where it stands with a
  walking pace of rebound. The same law governs a bank that refuses the car
  and two cars meeting. Speed ALONG the surface
  mostly survives, so a glancing blow is a scrape that carries on. The
  lever arm turns the velocity change into yaw — clipping a trunk with a
  corner spins the car instead of politely stopping it. Below
  `scuffSpeed`, contact is a scuff: the car stops against the rock,
  unmarked.

  The spin one contact can add SATURATES (`yawKickMax`, through a `tanh`,
  as the lateral grip does). The kick is linear in the velocity change and
  in the lever arm both, so the worst case multiplies two big numbers: a
  car arriving sideways at pace and catching a trunk on its nose corner
  had its whole lateral speed reversed at the full half-length of the body
  and came away turning four times a second. Past the ceiling that speed
  goes into folding the nose instead, which the zone's crush already
  books — the same argument `air.tripMax` makes about the roll axis. The
  ceiling is on the KICK and not on the car, so a car already going round
  for reasons of its own is not straightened by a scrape.

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
  (`pwa/src/game/car-damage.ts` over the field in `car-crumple.ts`):
  folded back from the rim, bulged, creased, scuffed and chipped.
  Zone crush past a part's bolt strength (`partAt`) tears it off —
  mirrors, bumpers, the wing — as a `partBreak` event the renderer turns
  into tumbling debris. Past the face's cap (`zoneMax` for the ring and the
  floorpan, the cage's own `structure.roofMax` for the roof) the panel has
  nowhere left to fold
  and the cage is taking the blow instead: the machinery behind that face
  stops taking the crush, and only the wear goes on (at `wearPastCap` of
  its rate) — or a car pinned against one face grinds its engine and its
  wheels away through metal that is no longer moving.
- **Hard landings are impacts too**, and WHICH FACE arrives decides both
  what folds and what it costs. On its wheels it is the underside (the
  `belly`), and the suspension travels through `hardLandSpeed` of descent
  for free. Past `air.rollLandLimit` of lean it is a flank; past three
  quarters of a turn it is the ROOF — its own ledger (`damage.roof`)
  rather than a ring zone, because the ring is a plan view and has no room
  for the one face a roll spends most of its time on. A shell arrival has
  no suspension under it and gets only `air.roll.shellFree` for nothing,
  which is why a roll strips a car and a jump does not. Roof crush shears
  every pane of glass first (a shell that has lost its shape cannot hold
  laminated glass in it), then the mirrors, then the lids; the renderer
  caves the greenhouse down and over from the same ledger. A ground
  arrival across a whole face feeds the wheels through `wheelFromSideLand`
  / `wheelFromRoof` only — the ring's own rates are a point impact's,
  where a solid reaches past the panel into the upright behind it, and the
  ground does no such thing. **So is the ground itself**:
  a face rising faster than the car's speed carries it (`climbGrade`:
  `climbLimit` from a crawl, `wallSlope` at pace) under the wheels — the
  terrain, or a road profile where it stands up — stops being a hill and
  starts refusing the car by the shortfall, at `wallSlope` completely and
  at any speed. The ground's gradient at the bumper IS
  the contact normal, so a cliff met head on takes the pace and folds the
  nose while one met at an angle deflects the car along it — and the car is
  backed out of however much of the step the face refused, which is why it
  never ends up inside a mountain. A bank the speed DOES carry the car up
  is still an arrival, and the SPRINGS decide what it costs: the wheels'
  vertical speed jumping by more than the most one bump may throw into
  them (`suspension.bumpMax`) in one step is more than they can lift the
  body with, and the rest reaches the belly as a hard landing would, with
  the tolerance shot dampers narrow — a bank taken at the speed it asks
  for is free, the same bank at twice that costs the floor. A face has its own scuff floor
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
- **...until the run starts again.** The one thing that does clear the whole
  ledger is the attempt beginning from scratch: RESTART, which builds a new
  car, and the respawn that lands on the START LINE — the reset button or a
  drowning while the first lap has taken no split board, where the way home
  (`lastCheckpoint`, R28) is the line itself. Being put back there is not a
  penalty inside a run, it is the run starting over with nothing behind it,
  so the crew hand over the car that left the line: the crush, the wear, the
  hurt systems, the flats and the parts on the road all go (`healCar`, and a
  `repair` event so the renderer puts a whole BODY on the road with it — the
  damage lives in the geometry). A later lap of a circuit crosses the same
  line with a lap already driven and is charged as usual; a wedge rescue,
  which lands where the car stands rather than at a board, never heals.

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

Under the panels live six **internal systems** (`damage.systems`), each
fed by the crush landing nearest to it and each degrading its own job:

| System     | Hurt by                       | Effect when damaged                                                        |
| ---------- | ----------------------------- | -------------------------------------------------------------------------- |
| Engine     | Nose and front-corner crush   | Power fades (`systems.powerLoss`), past `chassis.misfireFrom` the          |
|            |                               | ignition drops beats outright — the car lurches instead of pulling — and   |
|            |                               | at 1 it is DEAD: no power, no reverse, a seized crank, and the run         |
| Cooling    | Nose and front-corner crush   | The radiator stands in front of the block, so it is holed FIRST and hard   |
|            |                               | (`systems.coolingFromNose`, above `engineFromNose`, and again by           |
|            |                               | `coolingBareCore` once the front bumper is gone). It costs no power of     |
|            |                               | its own — it starts a clock (below)                                        |
| Suspension | Flank and belly crush         | Less lateral grip, narrower landing tolerance, wobblier touchdowns         |
| Gearbox    | Rear and belly crush          | Shift cuts stretch; past `chassis.topGearAt` the top ratio stops engaging, |
|            |                               | and past `secondGearAt` a second one goes with it                          |
| Steering   | Front-corner crush            | The rack loses authority (`systems.steerLoss`) and answers CROOKED         |
|            |                               | (`chassis.steerPull`, toward whichever front corner folded deeper)         |
| Brakes     | Corner, flank and belly crush | The pedal loses `systems.brakeLoss` of its bite, and the LEVER nearly all  |
|            |                               | of it (`leverLoss`): a car with cut lines cannot be flicked on the lever   |

### The temperature, and the clock a holed radiator starts

`engine/game/cooling.ts` is the one piece of the damage model that takes its
time, and the only one the driver is still deciding about while it happens.
`CarState.heat` runs 0 (running temperature) to 1 (boiling): the engine makes
heat with the throttle (`cooling.loadHeat`, `idleHeat`) and the car sheds it
through what is left of the core — the fan and the block standing still
(`still`), plus the ram air rising with pace (`ram` at `airSpeed`), all of it
scaled by how much of the system a hole has cost (`lost`). A sound car makes
its heat and sheds more of it at every speed, so the needle never leaves its
peg and the whole system is invisible until something folds the nose.

Past the red line the engine takes damage every second it stays there
(`cookRate`, `cookPerOver`) — and engine damage reaching 1 is the run. Before
that the needle is already worth something: `heatPower` pulls up to
`cooling.heatPower` of the engine's output out of a hot motor, faded in from
the first warning, which is what a driver feels before anything breaks.

The way out is the throttle. Heat is made by load and shed by air, so lifting
on the straights, short-shifting and giving away ten seconds a split is the
difference between limping a holed radiator to the line and parking it in a
forest. A core a quarter gone is survivable flat out; one three quarters gone
cooks the engine inside two minutes at full throttle and never boils at all if
the driver eases the pedal. That trade is the whole point of the group: every
other line in the ledger is a thing that has already happened to you, and this
is a thing you are still deciding.

It says so both ways (`overheat`): `TEMPERATURE RISING` at `warnAt`,
`ENGINE OVERHEATING` at the red line, and `TEMPERATURE OK` when a lift brings
it back off — the one damage call in the game that is ever good news, and the
one that can be given more than once, because a temperature is a thing to be
managed rather than a line that has been crossed for good. A respawn puts the
needle back on its peg (the car has been standing) and does nothing at all
about the hole, so a holed core climbs straight back.

The **wheels** carry a ledger each (`damage.wheels`, FL/FR/RL/RR), fed by the
crush on their own corner, half of the crush on their flank, a little from the
belly, and — on a landing taken on the side — the side they came down on
(`systems.wheelFrom…`). Past `chassis.wheelFlat` the tyre is DOWN and the rim
bent: the corner loses `flatGrip`, the car pulls toward it (`flatPull`, in
lock, held down every straight) and the rim drags (`flatDrag`); the drawn wheel
squashes, leans and wobbles once per turn. At 1 the wheel is OFF THE CAR — a
`partBreak` the renderer turns into a wheel with a life of its own
(`pwa/src/game/loose-wheel.ts`: it leaves at the corner's speed with the
tread still turning, bounces on its tyre, rolls on ahead for a long way,
keels over once slow and settles flat — on every car on the road, unless the
video options' EFFECTS row has switched loose wheels off), with the corner
dropped onto its hub for the rest of the run — and the same three costs come at `wheelOff…` size,
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
| Parts left on the road      | The air, below — the holes are aerodynamic, not mechanical                 |

### Two kinds of loss: the hub and the air

Keeping these apart is what makes a broken car read right. A MECHANICAL loss —
a rim on the road, a rubbing hub, a shell pulled out of square — is a share of
the speed, so it is felt everywhere and hurts the exit of a hairpin as much as
a straight. An AERODYNAMIC loss — a door, a bonnet, a windscreen — goes as the
SQUARE of the speed, so it is nothing at all at 40 km/h and the whole top end
at 140. A car that has lost its panels still launches like a rally car; it
simply never arrives anywhere.

`TUNING.collision.aero` holds the second kind, and every entry is stated as
CdA (drag coefficient times frontal area, m²) — the number a wind tunnel
actually reports, and the only form in which the entries can be compared with
each other or with anything real. A whole rally car is about 0.65 of these;
`damage.ts` adds up what has left the car and `car.ts` spends the total the
way the air spends it, `½·ρ·CdA·u²` over the car's own mass, so a heavy car
carries a hole better than a light one. A sound car's total is exactly 0 — the
roster's top speeds are its gearing and its rolling drag, and nothing here is
felt until something comes off.

| Off the car      | CdA added  | What it does                                                                                                   |
| ---------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| A mirror, a lamp | 0.004–0.01 | Nothing you can feel. A car missing a mirror is a car missing a mirror                                         |
| A door           | 0.08       | About a tenth of the car's drag again, and a PULL toward the open flank                                        |
| A side window    | 0.032      | A window down, and the same pull at a fifth of the size                                                        |
| The bonnet       | 0.16       | An open engine bay: a quarter of the drag again, and the nose goes light                                       |
| The windscreen   | 0.23       | The cabin stops being a shape and becomes a bucket — and the driver is squinting into the blast (`aero.blast`) |
| The rear wing    | **−0.033** | Faster in a straight line. That is what a wing is for: drag bought on purpose                                  |

What that buys, driven: the small stuff is a few tenths of a per cent of the
top end. The big openings cost a per cent or so each until the total reaches
the point where the box will no longer pull its highest ratio at all, and from
there the top end falls off a cliff — a car with no windscreen tops out a whole
gear down, around 165 km/h against 205. That cliff is the gearbox's and not the
air's, and it is the honest shape of the thing: a wrecked car does not top out
slightly lower, it stops being able to pull top gear. Crush counts too
(`aero.crush`) — a metre of fold spread over the body is about a fifth of the
car's drag again without a single panel having left it.

Three things fall out of the same table, all of them faded in with pace
(`aero.speed`, and the square of it, like the drag):

- **Downforce that is no longer being made** (`aero.lift`). The wing is most of
  it and always was; a missing bonnet is the other kind, with the air getting
  under the nose and the front of the car no longer being the end that turns.
- **The blast** (`aero.blast`). A hundred and forty of open air in the face
  with no windscreen is a hundred and forty the driver is squinting through,
  and the line goes where it can be seen rather than where it should be. Not
  the rack — the driver.
- **The pull of a hole down ONE side** (`aero.yawPerDrag`). Drag standing off
  the centreline is a yaw moment, so a car with its left door gone wanders left
  all the way down every straight. A hole on each side goes straight again.

Grip is the one place the taxes stack — suspension, structure and the lost
downforce all pull on it — so `chassis.gripFloor` is the floor under all three
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

What it takes is a head-on, in one hit or over a minute.
`systems.engineFromNose` is sized so a wall met square at 100 km/h — a quarter
of a metre of fold — is the engine gone outright, and one met at 50 km/h is a
third of it, the `ENGINE DAMAGED` line and steam off the bonnet. The SLOW way
is the radiator: the core stands in front of the block, so that same 50 km/h
wall leaves an engine that still pulls and a cooling system that no longer
works, and from there the needle decides the run (above). A rival's engine dies
either way and files them as a DNF. The difficulty's damage assist
(`CarState.damageScale`) scales all of this exactly as it scales every other
mark, so an EASY run cannot be retired by the car at all.

A dead engine is DEAD, and that includes the one path outside the throttle: the
reverse manoeuvre is gated on the engine making power, so a car whose motor has
seized cannot back itself out of the trees. Without that gate "engine dead"
means nothing, which is the whole reason the state exists.

Nothing repairs mid-run. It is reported twice, and the split is deliberate.

**A CALL IS NEWS; THE SCHEMATIC IS STATE.** A line in the middle of the screen
is how something that just happened gets said, and then it ages out and the
driver is on their own again — which is the right way to break news and the
wrong way to hold an answer to "what have I got left". So under the minimap
there is a plan of the car with a colour per piece
(`pwa/src/game/hud-health.tsx`, off the DOM-free fold in `car-health.ts`):
green is well, yellow is damaged, orange is very damaged, red is broken. The
nose, the windscreen, the cabin and the tail each carry their own colour, as
do all four wheels and all four lamps — named as the player sees the car,
which is the engine's frame flipped once, like every other left and right in
the HUD.

Two rules make it a diagram rather than an average. A **panel is as bad as the
worst thing in it**: the parts are weighted, but a vital one is never averaged
away by the sound parts around it, so an engine at the top of its ledger is a
front compartment at 1 whatever the bonnet over it is doing. And **the panel
and the calls may never disagree**: the four tiers ARE the `callAt` lines
below, so a car whose nose has just gone amber is a car the middle of the
screen has just called DAMAGED. A wheel's own ledger and a face's crush depth
are remapped into that same space rather than given an opinion of their own
(`wheelScore`, `crushScore`) — a puncture reads exactly where the calls start.

The MACHINERY has no shape worth drawing from above, so it is not drawn into
the panels: under the car there is one mark per system with something wrong
with it, in the same four colours and with no caption. A sound car draws an
empty row, and the row filling up is itself the news. A sound car is also
QUIET — the whole instrument stands back at reduced strength until there is
something to say. `make health` is the only honest way to judge any of it:
seeing the schematic amber from inside the game means crashing the car amber
first, so the lab draws every state it can reach at once, at desktop size and
at the size the narrowest phone gives it, over gravel, tarmac, grass and a
night sky.

That leaves the damage the player can already see — the wing is folded, the
bonnet went over the roof three corners ago — and the damage they cannot,
which is the machinery under it. So the machinery also **says** so.

**Every line has to be true of the car the player is driving.** A call is the
only account a driver gets of machinery they cannot see, so a word that
overstates it is worse than no word at all: a car told its engine is DEAD and
then driven away from the spot is a car whose HUD nobody has a reason to
believe again. Each system, and the shell around them, crosses up to three
lines on its way out (`TUNING.collision.callAt` → `DamageStage`), and each
crossing is one `systemFail` event the app puts up in the middle of the screen
where the splits and the lap times are said:

| Stage   | At   | Says                                                                                                                |
| ------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `hurt`  | 0.45 | `ENGINE DAMAGED`, `RADIATOR LEAKING`, `BRAKES DAMAGED` — a warning the driver can still act on                      |
| `spent` | 0.85 | `ENGINE FAILING`, `RADIATOR DRY`, `GEARBOX FAILING` — a fact about the rest of the stage                            |
| `dead`  | 1    | `GEARBOX SHOT`, `BRAKES SHOT` — and `ENGINE DEAD`, the one literal word in the set, on the one line the run ends at |

SHOT rather than BROKEN at the bottom of every ladder but the engine's, for
the same reason: a gearbox at the top of its ledger has lost two ratios and
still shifts, and brakes at theirs still have a circuit. A car told a part is
BROKEN and then driven on it has been told something untrue.

Once per line per run — damage never heals, so a line crossed stays crossed.
The needle is the exception both ways (above), because a temperature is
managed rather than crossed. A wheel says two things about itself
(`wheelFail`): `FRONT LEFT PUNCTURE`, then `FRONT LEFT WHEEL LOST` — named as
the player sees the car, which is the engine's frame flipped once, in the HUD,
like every other left and right. And an engine that has been called DAMAGED
SMOKES: steam off the bonnet, thin at first, thicker and darker as the damage
climbs, black once it is dead.

Twenty-one pieces can come off. The four LAMPS go first (`partAt.lamp`, the
first fold past a brush), and they go ONE AT A TIME: each is listed under its
own corner zone and under the centre of its cap, so clipping a tree with the
right-hand wing takes the right headlamp and leaves the left one lit for the
rest of the stage, while only a nose driven in square takes the pair. Which
side is the whole of the news, so the HUD says `LEFT HEADLIGHT OUT` — named as
the player sees the car, flipped once like the wheels, and coalesced to a
single `HEADLIGHTS OUT` when a step takes the pair — and the beam down the
road is a SHARE and not a switch (`lampShare`, engine-side): one lamp gone is
half the light on every night corner after it, and a dark hole in the face of
the car where the bloom was. The two
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

The polygons fold to match, through one displacement field over each
vertex's rest position (`pwa/src/game/car-crumple.ts`) — the shortcut every
game that cannot afford a soft body takes, with the ledger's faces as its
control values. A quarter of a metre in the ledger reads as half a metre of
car gone at a cap (`FOLD`), and a third of that at a flank (`FOLD_FLANK`,
because a door skin driven past the seats is a door standing inside the
cabin). The metal TELESCOPES — the fold dies out with depth, so the bumper
goes furthest and the bulkhead not at all; what went in comes OUT through
the surface as a bulge (a bonnet tents, a wing bows); the panel CORRUGATES
in accordion creases across the fold; a coherent noise over the position
tears it; and the whole nose or tail section KINKS about the bulkhead,
toward the corner that took more and down under a square hit. A FLANK is
the stage's own accident — a slide that finds a trunk with the door — and
folds like one: not the cap's square fold but a V (`FLANK_PEAK`), deepest
at the belt line where the body meets the trunk first (`FLANK_WAIST`), and
past a certain depth the whole car bows round it, both ends toward the hit
(`WRAP`). A FLANK is
the stage's own accident — a slide that finds a trunk with the door — and
folds like one: not the cap's square fold but a V (`FLANK_PEAK`), deepest
at the belt line where the body meets the trunk first (`FLANK_WAIST`), and
past a certain depth the whole car bows round it, both ends toward the hit
(`WRAP`). Every face
is then lit again from the plane it now lies in, and the paint scuffs dark
and chips to primer where — and only where — the metal actually folded.
Everything bolted to the shell bends with it (the lenses, the bumpers and
lids, the cabin under a caved roof), and because the field is a function
of position alone, meshes bent apart stay joined where they meet. A car
that has met a wall at 100 km/h has no front. `make wrecks` is the lab:
one body through every accident the ledger can describe, from the chase
camera and the turntable.

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
  the rear-driver's fully developed one, which is the 1). Where it begins
  and how deep it goes are different questions: a front axle that runs out
  of grip WASHES WIDE, so the hatch crosses the same threshold and then
  holds well under half the angle the saloon does at the same lock, on a
  line a third wider. Reaching a real angle in it costs a MOVE — a flick, a
  trailed brake or the lever — and what each of those is worth is the
  `flickDepth` / `brakeDepth` / `leverDepth` group above: they lift this
  ceiling toward 1 for as long as the weight is off the rear. Never set over
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
own `depth` would never allow. On gravel at 30 m/s the hatch holds about 15°
on 0.85 of lock driven straight in, and peaks near 26° on the same lock
flicked — the wheel alone cannot get anywhere near that, which is the whole
reason the move exists and the game is named after it.

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

`make roll` is the same idea for the thing that happens when a drift has gone
too far. It trips a car at a range of speeds and draws each roll FROM BEHIND —
the hull's outline every sixth of a second, standing on the ground its own
contacts traced, with the corner it is pivoting about marked on each frame —
and prints what the roll cost: turns, how far it walked the car sideways,
parts gone, roof caved, wear. Required before and after any change to the roll
model, because the failure it catches is one no table shows: a body turning
about a fixed point under its middle draws a stack of outlines in one place,
where a body going over its corners walks across the picture.

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
- **Kestrel RS (AWD)** — a four-door turbo sedan of the Group A years, with
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
Whose pipe smokes at all is the player's, on the EXHAUST lever of the DETAIL
row (`EXHAUST_SEEN` in `settings.ts`): a grid steaming on the line is what
the effect is FOR, so it survives to the second stop of the ladder on the
car being driven and only a LOW picture puts it away entirely.
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

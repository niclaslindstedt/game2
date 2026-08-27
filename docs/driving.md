# The driving model

The handling model (`engine/game/car.ts`, numbers in `engine/game/defs/`) is arcade by conviction: the car is a point with a nose, forward speed `u`, sideways speed `w`, and a yaw rate. Everything is tuned around three moments.

## Turning, and the drift

The slip angle (`atan2(w, |u|)`) is the drift, and there is no state machine
behind it: **drifting is just what a car does when you turn harder than the
tires can pay for.** One number, the **slide** (0..1), carries the whole
thing, and every force below fades in and out with it, so grip and slide are
one continuous response rather than two modes.

- **The slide** — the turn being asked for costs `u × yawRate` of lateral
  acceleration; the car has `gripAccel` to spend. Past that ceiling the slide
  opens up (`TUNING.grip.slideRange`), and an angle already established keeps
  it alive on its own (`slideSlip`) so the car does not snap back to grip in
  the instant the wheel passes centre. Gentle steering never slides at any
  speed; a committed turn slides from about 70 km/h up. No flick, no
  handbrake, no kick — nothing is ever injected into the car's velocity.
- **The rotation** — as the slide opens, the car gains yaw authority
  (`driftYaw`) and the slip starts turning the nose itself — sustained by
  steering INTO the slide, so releasing the wheel stops feeding it and
  counter-steer both cuts the deepening and steers the catch.
- **The wheel commands the angle.** The drift never steers itself: the
  self-feeding forces are kept well under the wheel's authority, so full
  lock is a deep drift, half lock a shallower one, and a centred wheel
  hands the car back. What the front wheels show is what the car does.
- **Power oversteer** — these are rear-wheel-drive cars, and the EXIT is
  where it shows: steered into the slide the corner behaves classically,
  but once the wheel stops asking for the angle the driven axle keeps
  feeding it for a beat (`TUNING.grip.powerYaw`, ungated by saturation,
  faded by steering into the slide). So a centred wheel on the power lets
  the slide LINGER before grip gathers the car up — and a counter-steer
  settles it faster still. The catch carries yaw momentum
  (`yawResponse.slide` sits a touch under the grip-matched rate), so an
  over-held counter swings the pendulum: the slip crosses centre into a
  second drift the other way, which needs its own counter. Balancing that
  on the wheel is the game.
- Two stabilizers keep it a dance instead of an instant spin:
  - **Saturation** — from ~17° of slip everything that deepens the slide
    fades, reaching zero around 43° (`satAt` + `satWidth`), except the
    power's own oversteer. The fade is deliberately WIDE: a narrow band
    would park every steer past a third of lock at the same angle, while
    the wide one moves the parked angle with the wheel. Only counter-steer
    keeps full authority.
  - **Lift-to-tighten** — lateral grip scales up as the throttle lifts
    (arcade weight transfer). On the power the slide runs; breathe and the
    car both tightens its line and calms its tail. This is the tool against
    running wide and the no-hands way out of a drift.
- **The cost** — the tires **redirect** the car instead of braking it: the
  velocity swings back in behind the nose while its magnitude is kept, so a
  corner taken sideways comes out at pace. Only `TUNING.grip.scrub × sin²
(slip)` is actually burned off — ordinary cornering costs nothing, and even
  a big drift bleeds a few percent per second. A drift is never _felt_ as a
  brake; that is the whole point.
- **The handbrake** — cuts rear grip and adds some yaw while it is held. It
  unsticks the car; it does not teleport it sideways, and it does not slow it
  down. It is a flick, not a hold: with the power down and full lock, a held
  handbrake takes the rear past any catch and spins the car around.

`car.slide` and `car.drifting` are readouts for the dust, the HUD and the
balance table — nothing in the model branches on them. `drifting` is read off
the slip ANGLE, with hysteresis, because the angle is what a player sees and
because it moves smoothly. Drift score accumulates as `|slip| × speed ×
time` — sideways AND fast — purely as a measurement; nothing in the game
rewards it, and no drift seconds are counted at the player.

## The jump

- **The ground** — grounded, the car **rides** the road: its vertical speed is the road's own, sampled between centerline points rather than snapped to the nearest one, so it climbs a ramp smoothly and nose-up (the renderer reads that attitude straight off `vy/u`) instead of hopping up it in 2 m stairs.
- **Takeoff** — jump segments ramp up to a lip; crossing it throws the car with vertical speed proportional to pace × ramp slope (`takeoff`). The ramp EASES IN, steepest right at the lip, because a ramp that flattens as it reaches the top hands the car no upward speed at the one moment that matters. A crest launches the car too, but only when the road's own curvature would pull it down harder than gravity can (`TUNING.air.crestSpan`, `crestPull`) — so a real brow throws you at pace and holds you at a crawl, while the rolling ground under every stage is just ridden over.
- **The roll** — a car that leaves the ground crossed up trips over its outside wheels: the take-off puts roll in the body from the slide it was holding plus the rotation already in it, and nothing in the air takes it out. Straight and level flies flat; properly sideways goes a long way over; the unluckiest launches go all the way round. Landing on your side is never a clean landing. The ground unwinds the roll toward the nearest upright, so a car most of the way over finishes the roll rather than rewinding it.
- **Airborne** — the velocity vector is committed. Gravity is arcade-heavy (floatier hangs read as slow motion), the nose answers only faintly, and a small seeded turbulence rolls the car — flying, slightly out of control, exactly as intended. No lateral grip: whatever attitude you took off with survives to the ground.
- **Landing** — straight (slip inside the clean limit) keeps all your speed: `CLEAN AIR`. Sideways scrubs speed and wobbles the car. Line up before the lip.

## The booster

A finite tank of raw thrust (`TUNING.boost`): hold boost to burn it for extra forward acceleration on top of engine torque, unaffected by gearing or surface. The thrust fades to zero approaching an overrun cap just past the car's final gear top, so it stretches the top end rather than breaking it. The tank never refills — not even on respawn — and rationing it across the stage is the game. Grounded only: airborne the velocity is committed, booster included. Emits `boostStart` on ignition and `boostEmpty` once, when the tank runs dry.

## Wind and weather

Every stage blows a seeded wind (`GameState.env` + the per-step `state.wind` vector). The pre-race weather setting picks the band (`TUNING.wind.speed`): clear is a breeze, rain is a stiff wind, a storm genuinely blows. The wind gusts and veers deterministically with sim time, so replays and sim digests hold. It touches the car three ways (`TUNING.wind`):

- **Head/tailwind** pushes on forward speed (`longForce`) — a storm headwind trims the top end, a tailwind stretches it.
- **Carry** — a fraction of the wind velocity translates the whole car downwind (`carry`): small while gripping, larger mid-drift, largest airborne, where a storm gust visibly moves a jump sideways. A translation, never a torque — the wind cannot spin the car.
- The HUD shows an arrow + km/h readout once the wind is worth knowing about.

Time of day is presentation only; weather is the lever that reaches the physics (through the wind).

## Hills

Generated stages roll (`STAGE_RULES.elevation` — long climbs, medium rollers, surface bumps; grades live on straights and flatten through corners). Gravity acts along the grade (`TUNING.hills.gravityAlong`): climbs cost speed, descents give it back, and a crest taken flat-out can go light. Ground height under the car interpolates between centerline samples, so grades stay smooth at any speed.

## Surfaces

| Surface | Effect                                                                    |
| ------- | ------------------------------------------------------------------------- |
| Gravel  | The baseline: full power, honest grip, dust off the rear when sideways    |
| Water   | Fords and shallows: a splash on entry, heavy drag, reduced grip and power |
| Nature  | The open landscape off the road: loose grip, fast — up to ~150 km/h       |

## The open world

The road runs through a landscape the car can actually drive
(`engine/mapgen/terrain.ts` — the same seeded field the renderer draws, so
the ground under the wheels IS the ground on screen). Leaving the road is
not a mistake anymore; it is exploration:

- **The ground** — off the verge the car rides the terrain — and it rides
  the DRAWN terrain: the physics samples the same triangle lattice the
  renderer builds its ground tiles from (`TerrainField.groundAt`,
  `GROUND_CELL`), so the car sits on the slope on screen instead of
  sinking into it where the analytic field and the mesh disagree. The
  grade under the wheels is read over a wheelbase-scale baseline
  (`TUNING.hills.gradeSpan`) along the heading AND across it: banks push
  back the moment the wheels touch them, the nose pitches with the local
  hillside, and a side slope pulls the car toward its downhill side. The
  brow keeps the road's wide baseline, so a cliff edge or a sharp bank at
  pace still throws the car — spontaneous jumps, no ramp required. Rough
  ground caps pace around 150 km/h (`TUNING.surfaces.natureTop`); the road
  is faster, always.
- **Water** — the landscape floods below the water table
  (`terrain.LAKE_Y`): lakes, and whole sea basins. Shallows and streams
  slow the car and splash; **deep water is a crash** — splash, `crash`
  event, and a respawn on the track at last progress.
- **Solid props and the forest** — the wild scatters boulders and fallen
  trunks (`terrain.obstaclesNear`), and the forest's trees stand on solid
  trunks of their own (`terrain.treesNear`, placed by the same engine-side
  grove quilt the renderer picks species from) — everything seeded, kept
  off the road, and drawn exactly where the physics collides with it.
  Contact does not teleport the car anywhere: it bends it — see the
  collision model below. A fallen trunk lies low enough to jump; a tree is
  not.
- **The way home** — exploring never times out and never teleports the car:
  the only ways back to the track are a crash or the **reset input**
  (`CarInput.reset`, the B key / the HUD's TRACK button), which respawns at
  the last on-road progress.

## Collision and damage

The contact model lives in `engine/game/collision.ts`; every number is in
`TUNING.collision`. The car is an oriented box in the ground plane, every
solid a circle, and a hit does three things at once:

- **The impulse.** Speed INTO the surface comes back at a low restitution
  (a tree absorbs a rally car, it does not trampoline it); speed ALONG it
  mostly survives, so a glancing blow is a scrape that carries on. The
  lever arm turns the velocity change into yaw — clipping a trunk with a
  corner spins the car instead of politely stopping it. Below
  `scuffSpeed`, contact is a scuff: the car stops against the rock,
  unmarked.
- **The crush.** Closing speed past the scuff floor folds the struck
  panels in, permanently — eight zones ring the body (`CarState.damage`),
  and the renderer bends the body's actual polygons from the ledger
  (`pwa/src/game/car-damage.ts`): pulled inward, crumpled, scuffed darker.
  Zone crush past a part's bolt strength (`partAt`) tears it off —
  mirrors, bumpers, the wing — as a `partBreak` event the renderer turns
  into tumbling debris. **Hard landings are impacts too**: descent the
  suspension cannot absorb (`hardLandSpeed`) crushes the underside (the
  `belly`), or the flank the car came down on.
- **The wear.** Every crush adds structural wear; wear 1 is the wreck —
  `crash` event, respawn at last progress, chassis patched back to
  `repairTo`. The dents, the torn-off parts and the hurt systems all stay:
  the run remembers.

Under the panels live four **internal systems** (`damage.systems`), each
fed by the crush landing nearest to it and each degrading its own job:

| System     | Hurt by                     | Effect when damaged                                                |
| ---------- | --------------------------- | ------------------------------------------------------------------ |
| Engine     | Nose and front-corner crush | Power fades (up to `systems.powerLoss`) — the car limps            |
| Suspension | Flank and belly crush       | Less lateral grip, narrower landing tolerance, wobblier touchdowns |
| Gearbox    | Rear and belly crush        | Manual shift cuts stretch; the auto box starts cutting throttle    |
| Steering   | Front-corner crush          | The rack loses authority (up to `systems.steerLoss`)               |

Nothing repairs mid-run. The HUD's damage instrument (top of the bottom-left
cluster, over the rev counter) is a single top-view car: the crush ring wears
the folds where the hits landed, the breakables cross out red as they tear
off, the shell's own outline is the chassis the wreck is called on, and each
system is drawn as the part it is — the engine block under the bonnet, the
rack across the front axle, the gearbox down the tunnel, the suspension at
the four wheels. A sound part reads as quiet steel; a hurt one takes color,
yellow folding to red as it gives out, so a glance finds the one part that is
wrong instead of scanning a row of bars.

## Cars and gearboxes

Cars are data rows (`engine/game/defs/cars.ts`) — the model never branches per car:

- **Vireo GT (auto)** — shifts itself, quicker off the line, grippier, softer top end (~215 km/h flat out). The phone-first car.
- **Sable 4WD (manual)** — six gears on the driver, taller top (~230 km/h flat out), less grip to lean on so it slides earlier and further. Per-gear torque tapers near each gear's ceiling, so holding a gear too long stops pulling — shifting is part of the pace.

Nominal gear tops overshoot what surface drag lets a car hold; the flat-out
speeds above are the real equilibria, and `tests/explore_test.ts` pins them.

A manual shift cuts throttle briefly while it engages. The bot shifts by the same thresholds the auto box uses, so both cars are simulated fairly (see [simulation.md](simulation.md)).

## Tuning etiquette

Numbers live in `engine/game/defs/tuning.ts` (global feel) and `cars.ts` (per car) — never inline in the model. The steering response has its own knob group (`TUNING.steering`: low-speed ramp-in, high-speed fade, the centred-wheel commitment floor, the tail-torque chatter guard) beside the grip/drift group (`TUNING.grip`). Any change here must run `make sim` before and after, and keep `tests/drift_test.ts` / `tests/jump_test.ts` honest: those tests encode the moments this document describes.

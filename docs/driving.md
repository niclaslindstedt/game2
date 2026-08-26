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
  (`driftYaw`) and the slip starts turning the nose itself: the tail leads
  and you catch it on the counter. Two stabilizers keep it a dance instead of
  a spin:
  - **Saturation** — past ~26° of slip everything that deepens the slide
    fades to zero, so held full lock parks the car at a big stable angle
    rather than spinning out. Only counter-steer keeps full authority.
  - **Lift-to-tighten** — lateral grip scales up as the throttle lifts
    (arcade weight transfer). On the power the slide runs; breathe and the
    line tightens. This is the tool against running wide.
- **The cost** — the tires **redirect** the car instead of braking it: the
  velocity swings back in behind the nose while its magnitude is kept, so a
  corner taken sideways comes out at pace. Only `TUNING.grip.scrub × sin²
(slip)` is actually burned off — ordinary cornering costs nothing, and even
  a big drift bleeds a few percent per second. A drift is never _felt_ as a
  brake; that is the whole point.
- **The handbrake** — cuts rear grip and adds some yaw while it is held. It
  unsticks the car; it does not teleport it sideways, and it does not slow it
  down.

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

| Surface | Effect                                                                 |
| ------- | ---------------------------------------------------------------------- |
| Gravel  | The baseline: full power, honest grip, dust off the rear when sideways |
| Water   | Fords: a splash on entry, heavy drag, reduced grip and power           |
| Grass   | Off the road: heavy drag, half grip — the road is faster, always       |

Too far off the road (or lingering off it) respawns the car back on the centerline at the cost of all momentum.

## Cars and gearboxes

Cars are data rows (`engine/game/defs/cars.ts`) — the model never branches per car:

- **Vireo GT (auto)** — shifts itself, quicker off the line, grippier, softer top end. The phone-first car.
- **Sable 4WD (manual)** — six gears on the driver, taller top, less grip to lean on so it slides earlier and further. Per-gear torque tapers near each gear's ceiling, so holding a gear too long stops pulling — shifting is part of the pace.

A manual shift cuts throttle briefly while it engages. The bot shifts by the same thresholds the auto box uses, so both cars are simulated fairly (see [simulation.md](simulation.md)).

## Tuning etiquette

Numbers live in `engine/game/defs/tuning.ts` (global feel) and `cars.ts` (per car) — never inline in the model. Any change here must run `make sim` before and after, and keep `tests/drift_test.ts` / `tests/jump_test.ts` honest: those tests encode the moments this document describes.

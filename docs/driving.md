# The driving model

The handling model (`engine/game/car.ts`, numbers in `engine/game/defs/`) is arcade by conviction: the car is a point with a nose, forward speed `u`, sideways speed `w`, and a yaw rate. Everything is tuned around three moments.

## The drift

The slip angle (`atan2(w, |u|)`) is the drift. The state machine:

- **Start** — two ways in: the **handbrake flick** at speed (injects a sideways kick and a yaw impulse — the car snaps sideways immediately), or a **committed steering flick** that pushes slip past the entry threshold. Emits `driftStart`.
- **Hold** — while drifting, lateral grip drops (per-car `driftLat`), the slip self-rotates the car into the slide, and the wheel is the throttle of the slide: steering into it deepens it, releasing lets grip straighten the car, counter-steering exits fast. Two stabilizers keep it a dance instead of a spin:
  - **Saturation** — past ~28° of slip, everything that deepens the slide fades to zero, so held full lock parks the car at a big stable angle rather than spinning out. Only counter-steer keeps full authority.
  - **Lift-to-tighten** — lateral grip scales up as the throttle lifts (arcade weight transfer). On the power the slide runs; breathe and the line tightens. This is the tool against running wide.
- **End** — slip under the exit threshold ends the drift (`driftEnd`). A drift that lasted and held real angle is **clean** and pays a speed boost proportional to its duration (capped). A token flick pays nothing; scrubbing to a crawl mid-slide ends the drift unpaid.

Drift score accumulates as `|slip| × speed × time` — sideways AND fast is the score.

## The jump

- **Takeoff** — jump segments ramp up to a lip; crossing it throws the car with vertical speed proportional to pace × ramp slope (`takeoff`). Fast crests can also lift the car when the ground falls away.
- **Airborne** — the velocity vector is committed. Gravity is arcade-heavy (floatier hangs read as slow motion), the nose answers only faintly, and a small seeded turbulence rolls the car — flying, slightly out of control, exactly as intended. No lateral grip: whatever attitude you took off with survives to the ground.
- **Landing** — straight (slip inside the clean limit) keeps all your speed: `CLEAN AIR`. Sideways scrubs speed and wobbles the car. Line up before the lip.

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
- **Sable 4WD (manual)** — six gears on the driver, taller top, looser rear, a stronger drift boost. Per-gear torque tapers near each gear's ceiling, so holding a gear too long stops pulling — shifting is part of the pace.

A manual shift cuts throttle briefly while it engages. The bot shifts by the same thresholds the auto box uses, so both cars are simulated fairly (see [simulation.md](simulation.md)).

## Tuning etiquette

Numbers live in `engine/game/defs/tuning.ts` (global feel) and `cars.ts` (per car) — never inline in the model. Any change here must run `make sim` before and after, and keep `tests/drift_test.ts` / `tests/jump_test.ts` honest: those tests encode the moments this document describes.

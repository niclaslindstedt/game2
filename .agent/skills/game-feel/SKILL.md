---
name: game-feel
description: "Use when the task is about how the game FEELS to play — the sensation of speed, the drift as a moment of drama, the camera's framing, how pace and danger read on screen. The feeling of racing and drifting IS the core product; this skill owns the reference (Sega Rally 1995), the levers that create the sensation across engine, camera, world scale and FX, how they interact, and the look-first verification loop. Load it for any change whose acceptance test is 'does it feel fast / does the drift feel right', alongside the skill that owns the specific subsystem being edited."
---

# Game feel — speed and the drift

The feeling of racing and drifting is the core part of this game. A change can
pass every test and still fail the product: **the acceptance test for feel is a
screenshot or a run, looked at**, next to the reference. This skill owns that
judgement and the levers behind it.

**Read this skill's lessons first** —
`node scripts/skill-lessons.mjs game-feel`. Record what a tuning session
learns at the end (`skill-reflection` owns the format).

## The reference: Sega Rally Championship (1995)

The arcade original is the north star for how speed and drifting should read.
The proportions, measured off its chase cam:

- **The car anchors the BOTTOM of the frame** — wheels ~80% down the screen,
  roof around the middle. The road and world own the frame, not the car.
- **The camera is at roof height (~2 m), pitched only ~4–6° down**, close
  behind (the car spans roughly a quarter of the frame width). Height above
  the car is what makes a game read slow and toy-like; Sega Rally is low.
- **The horizon rides high** (top third), so the ground plane streams past at
  a shallow, speed-selling angle.
- **The camera follows the ROAD, not the nose.** Mid-drift the car sits yawed
  25–30° across the frame while the road still flows to the vanishing point.
  The drift is DISPLAYED by the framing; chase cams that track the nose hide
  it.
- **~160 km/h in 3rd gear**, and past ~70 km/h a sharp turn IS a drift entry
  — no handbrake required. Speed and sideways are the default state, not the
  exception.
- **The ground answers back**: dense low gravel spray at the driven and
  sliding wheels, and a car that gets visibly dirtier as the stage goes on.

Reference frame: search the web for "sega rally lakeside" screenshots (the
Topgear one used for the 2026 rework is 1680×945 and shows all of the above).

## The levers, and who owns each

Feel is produced by five subsystems TOGETHER. A change to one usually needs a
sympathetic change in another — scaling speed without scaling the stages makes
the game harder, not faster.

| Lever                | Where                                         | Owning skill         |
| -------------------- | --------------------------------------------- | -------------------- |
| Speed & drift model  | `engine/game/defs/{tuning,cars}.ts`, `car.ts` | `engine-system`      |
| Stage scale          | `engine/mapgen/rules.ts`                      | `mapgen-improvement` |
| Camera               | `pwa/src/game/camera.ts`                      | (this skill)         |
| Ground-contact FX    | `pwa/src/game/{dust,renderer,car-dirt}.ts`    | `visual-effects`     |
| The car's motion cue | `pwa/src/game/car-mesh.ts` (wheels, roll)     | `car-design`         |

What each contributes:

- **Camera height and pitch** set the baseline: low + shallow = fast.
  FOV stretching with speed (`wantFov`) is the acceleration cue; camera
  pull-back with speed is the "the car is straining ahead" cue. The
  travel-direction yaw blend (`angleLerp(heading, velAngle, w)`) is what makes
  drifts visible — raising the travel weight shows more drift angle.
- **The turn swing** (`swing` in camera.ts): the camera slides toward the
  outside of the corner with yaw rate, so turning reads in the framing before
  the drift angle develops.
- **Speed numbers only feel fast against world scale.** Higher `gearTop`s need
  longer straights, larger soft-turn radii and a wider road
  (`STAGE_RULES`) or the game reads as twitchy instead of quick. Hard-turn
  radii stay tight on purpose — they are the drift moments.
- **The wheels must visibly turn** — spoked alloys break the face's rotational
  symmetry, tread lugs break the tread's. An axisymmetric wheel reads parked
  at any speed.
- **Gravel spray** scales with what the tires are doing (rolling < braking <
  drifting/off-road), inherits the car's wake so it streams backward, and uses
  many small particles — a large point sprite near the low camera renders as a
  glitchy square.
- **Dirt accumulation** (`car-dirt.ts`) makes pace leave a mark: light tan
  dust (dark mud is invisible on dark paint), low-heavy, speckled per face,
  never past ~0.7 so the livery survives.

## The workflow

1. **State the feeling** being tuned in one sentence ("the exit of a hairpin
   should feel like a slingshot"), and find the reference moment for it.
2. **Change the smallest set of levers** that plausibly produce it. Numbers in
   defs/rules, not new mechanics, unless the mechanic is the gap.
3. **`make sim` before and after** any engine or rules lever — the feeling is
   never allowed to cost the bots the stage (finishes, drifts, respawns are
   the regression surface).
4. **LOOK**: `make screenshots` (in web sessions
   `CHROMIUM_PATH=/opt/pw-browsers/chromium`), plus a staged run for the
   specific moment (`test-scenario` / `playtest` own the tooling). Put the
   shot next to the reference and compare proportions, not vibes: where do
   the wheels sit vertically? where is the horizon? how many degrees of drift
   show in the framing?
5. **Iterate camera/FX freely** — they are presentation and cost nothing to
   re-tune. Engine feel numbers move in small steps; each step re-simmed.

## Hard-earned constraints

- The renderer never mutates `GameState`; feel state that must persist
  (dirt level, camera smoothing) lives in renderer-side closures and resets
  with the next stage's meshes.
- Readouts the FX need from the driver (steer, braking) are CarState fields
  written by the engine step — the renderer never re-derives intent from
  physics deltas.
- The screen is a MIRROR of the engine's map view (see the `engine-system`
  lesson): camera and FX code work in world coords and stay sign-consistent;
  never flip a sign in the camera to fix a perceived left/right issue.
- Speed thresholds quoted in feel terms convert as 70 km/h ≈ 19.5 m/s; the
  engine is all meters and seconds.

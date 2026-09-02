---
name: visual-effects
description: "Use when creating or tuning a VISUAL EFFECT in the 3D world — dust, a ford's spray, a landing puff, skid marks, a finish flourish, camera shake, a screen wash. Covers the event → effect flow (the engine emits GameEvents, the renderer turns them into transient visuals), the two surfaces (the three.js scene for world-anchored FX, the HUD/CSS layer for screen-space), the low-poly art direction the effects must sit inside, and the craft rules that make an effect read as speed instead of noise."
---

# Authoring & tuning visual effects

Transient FX are **presentation only** — the engine (`engine/`) knows nothing
of them. It emits an EVENT; the app turns that event into a short-lived drawn
effect. Keep every effect out of the simulation: an effect must never change
what happens, only how it looks. The renderer reads `GameState` and the
events `step()` returns; it never mutates state and never steps physics.

There are **two rendering surfaces**. Pick by what the effect is anchored to:

| Surface                         | Use for                                                                                                                                            | Lives in                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **The three.js scene**          | WORLD-anchored FX that sit in the world and pan with the camera: dust off the rear, spray from a ford, a landing puff, skid marks, gate flourishes | `pwa/src/game/` — `dust.ts` is the reference pattern; wired from `renderer.ts` |
| **The HUD / CSS overlay layer** | SCREEN-space treatment: a speed vignette, a clean-drift flash, a finish wash — usually ONE instance at a time                                      | `pwa/src/game/hud.tsx` + keyframes in `pwa/src/styles.css`                     |

Camera behavior (shake, FOV kick, drift-angle framing) is the camera's —
`pwa/src/game/camera.ts` owns modes and their motion; an effect that wants
the camera to react goes there, not into an ad-hoc transform on the scene.

**Before starting, read this skill's lessons** —
`node scripts/skill-lessons.mjs visual-effects --list`, then the ones this
task touches. Load **`skill-reflection`** at both ends of the session.

## The flow: event → effect → draw

1. **The engine emits an event.** Add/extend a `GameEvent` variant in
   `engine/game/state.ts` and push it from the step where it happens. Carry
   only DATA the app needs (position, a speed, an intensity) — the event is
   the whole channel from simulation to presentation, and `step()` returns
   each step's events exactly once, so the app never misses or double-plays
   one.
2. **The renderer turns the event into an effect.** The render loop consumes
   the step's events and spawns/updates the effect's scene objects. Continuous
   effects (dust while sideways) can also read state directly each frame —
   state-driven for "while", event-driven for "at the moment of".
3. **The effect animates by its own progress `t`** (0→1 over its life),
   driven from the sim clock so pause and slow motion carry the effects with
   them.

## The art direction — effects must sit inside it

The whole world is **fullbright, vertex-colored, low-poly, with procedural
speckle textures** (`textures.ts`) — the rough arcade look is deliberate. An
effect that ships PBR smoke or a soft-particle shader reads as pasted on.

- **Match the palette.** Colors come from the world's own vocabulary
  (`identity.ts` PALETTE: gravel dust is gravel-colored, ford foam is `foam`,
  grass clods are grass-colored). No greys the world doesn't contain.
- **Chunky over misty.** A few dozen visible, simple particles (the `dust.ts`
  pattern) beat a thousand alpha-blended sprites — and match the look.
- **Motion carries the effect, not fidelity.** Speed reads through spawn
  rate, velocity inheritance, and lifetime — a dust trail that streams
  backward sells 120 km/h better than any texture.

## Craft rules

- **Presentation-only, structurally.** No effect writes `GameState`, draws
  from the state's RNG, or feeds anything back into `step()`. Renderer-side
  randomness (particle jitter) may use its own source — it can never desync a
  replay because the sim never reads it.
- **t-driven timelines with distinct beats.** A flat fade reads cheap: a
  splash is a burst → a sheet → drips, each in its own sub-window of `t`
  (`clamp01((t - a) / (b - a))`).
- **Ease, don't lerp.** Ease-out for bursts throwing outward, ease-in for
  settling. Linear motion reads robotic.
- **Budget per frequency.** Dust runs continuously while sideways and must be
  near-free — pre-allocated pools, no per-frame allocation, no new
  geometries/materials per spawn (allocate once, recycle instances; that is
  the `dust.ts` architecture — keep it for every new system). A once-per-run
  finish flourish can afford more.
- **Cull.** Effects tied to a world position stop updating/drawing when far
  behind the camera; only a genuine full-screen effect opts out.
- **Reduced motion.** Anything screen-filling or flashing on the CSS surface
  needs a `prefers-reduced-motion` fallback that keeps the information.
- **Events for sound too.** If the effect's moment would also want audio one
  day, make sure the EVENT carries what audio would need — the event is
  designed once, consumed by every presentation channel.

## The iterate loop — LOOK at it

Never tune an effect blind:

1. **A scene in `scripts/screenshot.mjs`** that drives the game into the
   effect's moment (the drift scene already stages dust; a ford effect wants
   a scene that scripts the drive into water on a known seed — pick the seed
   by reading `make track` previews for an early ford). An effect you are
   ADDING gets its scene in the same change — it is how a human reviews the
   effect without playing for it.
2. `make build && CHROMIUM_PATH=/opt/pw-browsers/chromium make screenshots`,
   then **read the PNGs**. For a timeline, screenshot the scene at two or
   three offsets and judge each beat.
3. For motion quality (does the dust stream, does the spray arc), run headed:
   `npm run dev` and drive into it.
4. Judge, refine the worst beat, re-shoot. Repeat until every beat reads.

**A shutter cannot race the thing it is photographing**, and every effect
worth this skill is transient. Three ways a scene lies, and the fix for
each:

- **A blinking element.** Waiting for its lit half still loses — the
  shutter fires after the predicate resolves and the blink has flipped.
  Kill the animation for the shot
  (`page.evaluate("document.querySelector('.x').style.animation = 'none'")`),
  which parks it on its base style. A still cannot show a blink anyway.
- **A beat that only exists while something loads.** Reach it by holding
  its dependency back (`page.route("**/renderer-*.js", …)` with a delay
  before `route.continue()`), never by timing: the world builds fast enough
  here that a "loading" scene reliably caught the READY card. A scene that
  names one state and captures another is worse than no scene — do not ship
  it.
- **A beat a few tenths of SIM time long.** `atStageTime` is the honest
  cursor a second or more in, but under software rendering one frame can
  carry most of a second of sim, so it overshoots badly down there (a 0.35 s
  wait for the launch landed at 0.81 s and 32 km/h). Ask for the FIRST frame
  that qualifies at all (`.hud-speed-num > 0`) — the earliest frame the
  predicate can see is the closest a still gets to the instant.

**Some effects have no run screenshot that can review them** — the sky is
the standing example: the weather is chosen per stage, so a shot of a run
can only ever show one of them, and the difference between the white rain
sky and the black storm one is a COMPARISON. Those get a contact sheet
instead: `make sky` renders every weather against every time of day and
waits for a near lightning strike. If an effect you are adding has that
shape (one instance per run, or a beat too brief to catch), build it a
harness page under `pwa/src/tools/` with a `scripts/*.mjs` driver, the way
`make cars` and `make sky` are built.

**Before building one, check whether `make items` already is it.** Anything
with a SHAPE — a bird, a marker, a part that breaks off — is five lines in
`pwa/src/tools/item-catalog.ts`: an id, a group, a `build` returning the
object, optionally the `views` worth seeing it from. `make items ITEMS=<id>`
then turntables it against a metre grid, which is the only honest look at a
silhouette a run shows as six pixels. It cannot photograph MOTION, so an
effect whose subject is movement still owes a driven shot beside it.

## Ship checklist

- [ ] Effect is presentation-only — no simulation state touched, no state-RNG
      draws.
- [ ] Right surface (scene for world-anchored, HUD/CSS for screen-space);
      camera reactions live in `camera.ts`.
- [ ] Sits inside the art direction: palette colors, chunky particles, no
      foreign fidelity.
- [ ] Pooled allocations; no per-frame garbage in a continuous effect.
- [ ] `prefers-reduced-motion` fallback for anything full-screen/flashing.
- [ ] A screenshot scene exists and you LOOKED at the frames.
- [ ] A `.changes/unreleased/` fragment (effects are player-visible by
      definition); `make lint`, `make fmt-check`, `make test` green.

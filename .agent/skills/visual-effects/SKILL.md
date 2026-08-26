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

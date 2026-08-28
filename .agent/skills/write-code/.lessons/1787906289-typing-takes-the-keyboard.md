---
title: A surface that is TYPED INTO must take the keyboard off the input manager — preventDefault does not stop a sibling listener
date: 2026-08-28
scope: pwa/src/game/input.ts, pwa/src/game/
concepts: [input, ui, harness, keyboard]
---

`createInput()` binds `keydown` on `window`, and the driving bindings are
LETTERS: `R` restarts the run, `M` walks out to the main menu, `B` resets to
track, `WASD` are the pedals (`DEFAULT_KEYS` in `settings.ts`). Any new UI that
reads characters — the high score board's initials entry was the first — shares
that target, so its own `e.preventDefault()` changes nothing: both listeners
fire, and typing `RM` restarts the stage and then leaves it.

`InputManager.setTyping(true)` is the handover, and it is the only thing that
works: it makes `onKeyDown`/`onKeyUp` no-ops and clears `held`/`downCodes`, so
a key that was down when the surface appeared has no stuck action left behind
it. Call it from an effect keyed on the surface being up, with the cleanup
setting it false, so an unmount can never leave the car unable to be driven.

Not a hypothetical: the entry looked correct in isolation and was only caught
by pressing `R` at it in the built app.

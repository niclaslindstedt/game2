---
title: A new rebindable key is four edits and NO settings migration — but a HUD key first has to pick which of the two HUD-off channels it drives
date: 2026-09-12
scope: pwa/src/game/settings-input.ts, pwa/src/game/input.ts, pwa/src/game/run-events.ts
concepts: [input, settings, hud, menus, migration]
---

Adding an action to the keyboard is four edits and nothing else: the
`KeyAction` union, the `KEY_ACTIONS` row (the KEYBOARD page walks that list, so
the bind row appears for free), the `DEFAULT_KEYS` entry, and — if the app
rather than the car reacts — the `InputAction` union plus its branch in
`input.ts`'s keydown and in `run-events.ts`'s `onAction`.

**No migration.** `loadSettings` builds `keys` from a fresh copy of
`DEFAULT_KEYS` and then `Object.assign`s the stored blob over it, so an action
added today is already bound for a player whose settings were written last
year. Do not write a `migrateCameraKey` twin for it — that helper exists to
SWAP two keys that already shipped, which is a different problem. The
uniqueness test in `settings_test.ts` ("gives neither key to anything else")
catches a default that collides, so pick the letter and let it fail.

**A HUD key has a prior question**, because the repo hides the HUD two ways and
they are not interchangeable:

| Channel | What it is | Where |
| --- | --- | --- |
| `input.hudHidden()` | TRANSIENT chrome-off for photographing a frame — ALT held, god-mode Z. Polled once a frame by `run-loop.ts`, and deliberately dropped when the tool that set it goes away | `input.ts` |
| `settings.hud.on` | The player's STANDING choice, through `hudShow()`. Already has rows on OPTIONS ▸ HUD and the pause card | `settings.ts` |

A player-facing toggle belongs on the second: it persists, and the menu rows
already on screen explain a missing HUD that a private latch would not. Reach
it with `applyOptions({ ...optionsRef.current, ... })` — `run-events` is built
once per run, but `applyOptions` reads through refs, so the first render's copy
is the right one to close over.

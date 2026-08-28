---
title: A root test may only import pwa modules whose WHOLE import graph is DOM-free — the root tsconfig has no DOM lib
date: 2026-08-28
scope: tests/, pwa/src/game/
concepts: [test-conventions, typecheck, dom, tooling]
---

`tsconfig.json` (the root project, which includes `tests/`) is `lib: ["ES2022"]`
plus `types: ["node"]`. Tests already import pwa modules — `audio/bank.ts`,
`car-styles.ts`, `ghost.ts`, `splash.ts` — but only ones that are DOM-free
_transitively_: one `window`, `matchMedia` or `navigator.maxTouchPoints`
anywhere in the import graph fails `make lint` at `tsc --noEmit`, in a file the
test never mentions.

`localStorage` and a bare `navigator` do NOT trip it (Node 22's `@types/node`
declares both), so a module can look DOM-free and still not be.

Adding `tests/camera_test.ts` hit exactly this: `camera.ts` imports
`PLAY_CAMERAS` from `settings.ts`, whose `deviceControls()` was the one DOM
reader in an otherwise DOM-free file. The fix is to MOVE the DOM reader to a
module that already owns the DOM (it went to `input.ts`, which is where asking
the browser about input belongs anyway) — not to widen the root `lib`, which
would let `document` into the engine and pass.

---
title: An effect's DECIDING arithmetic belongs in a DOM-free module — a test that imports a pwa module reaching textures.ts breaks the whole-program typecheck
date: 2026-09-03
scope: pwa/src/game/drift-spray.ts, pwa/src/game/drift-throw.ts, tests/
concepts: [particles, testing, tsconfig, module-split, dust]
---

Most of what a particle effect IS lives in a few lines of arithmetic — WHICH
wheels throw the rooster tail and how hard — and a screenshot of a thousand
sprites in the air cannot measure it. So that half wants a test. But the root `tsconfig.json` includes only `engine`, `tests` and
`vitest.config.ts`, with `"lib": ["ES2022"]` and no DOM: a test that imports a
`pwa/src/game/` module pulls every module that one imports into the SAME
non-DOM program. `drift-spray.ts` → `dust.ts` → `textures.ts` is enough, and
`make build` comes back with a wall of `TS2584: Cannot find name 'document'`
in a file the change never touched. `import type` does not save you — the type
is erased, but tsc still adds the file to the program.

The fix is the split the repo already uses everywhere (`mirror-pace.ts`,
`sky-traffic.ts`, `shift-window.ts`): a DOM-free sibling holding the knobs and
the pure function, and the three.js module importing them back. Two traps in
doing it:

- `AXLE` lives in `dust.ts`, so any table carrying WHERE a wheel sits drags
  the DOM back in. Split the table instead of duplicating it: the pure half
  owns the four patches as `{side, rear}` and the fixed ORDER the weights
  index by, and the drawn half adds `along` from AXLE at spawn time.
- A style object typed `DustStyle` has to stay on the drawn side or the
  excess-property check that catches a typo'd knob is lost (assigning one
  already-typed variable to another is not a freshness check). Move only the
  numbers that are DERIVED and must move together — here `STONE_LIFE` and
  `STONE_POOL`, because the pool is rate x max-throw x life.

That pair paid for the split at once: with the pool beside the rate that
determines it, `pool >= rate * max(wheelThrow) * life.max` went red on the
code as it stood. The worst case is not the held drift it is tempting to size
against but a SPUN car, whose front axle throws as its rear does.

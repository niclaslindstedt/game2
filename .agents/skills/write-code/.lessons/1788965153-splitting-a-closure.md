---
title: Split a big closure by CHAINING FACTORIES and letting ReturnType infer the seam — never by hand-typing a deps object
date: 2026-09-09
scope: engine/, pwa/src/
concepts: [file-size, module-split, refactor, typescript]
---

The tree's oversized files were nearly all ONE closure — `createCompiler`,
`createTerrain`, `createRenderer`, `App()` — holding dozens of locals. The
obvious split (lift a block out, pass it a `deps` object) is the expensive one:
the deps type has to be written by hand, and it runs to fifty fields.

Do it as a CHAIN instead. Extract a PREFIX of the closure into its own factory,
return everything it declared, and type the next stage's parameter as
`ReturnType<typeof createX>`. Nothing is hand-typed and tsc names every miss:

```ts
export type Cone = ReturnType<typeof createCone>;
export function createCone(track: Track) { …; return { BENCH, coneRise, … }; }
export function createShaping(track: Track, cone: Cone) { const { BENCH } = cone; … }
```

Two things make or break it:

- **`let`s that both halves write** are the only real obstacle. Sort them
  first: a `let` only the SUFFIX touches simply moves with it; the rest go into
  one named record (`mut` in `renderer-frame.ts`) with the comment saying who
  writes it. Read-only-in-the-suffix locals go into a getter/setter object
  (`live`), so the suffix sees the current value without a re-render.
- **Destructure the bundle at the top of every stage** (`const { BENCH, … } =
  cone;`). The moved bodies then need no rewriting at all, which is what keeps
  the diff a move rather than an edit.

Verify a DATA split (a big `as const`) by dumping the object before and after
and comparing deep-equal — a dropped key typechecks and is invisible in review.

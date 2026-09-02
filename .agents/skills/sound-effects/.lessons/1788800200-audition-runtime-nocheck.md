---
title: The audition page's runtime is compiled with `--noCheck` — an `@engine` type import in an audio module fails plain `tsc` without it
date: 2026-09-02
scope: scripts/audition.mjs, pwa/src/game/audio/
concepts: [audition, tooling, harness, typecheck]
---

`scripts/audition.mjs` compiles the audio modules with a bare `tsc` call
(no tsconfig, so no `paths`), then inlines the emitted JS. An audio module
that says `import type { BiomeId } from "@engine"` is fine for `make lint`
and erased from the emit — but plain `tsc` cannot resolve `@engine`, exits
non-zero, and the script treats that as a failed build even though the JS
it wanted was written.

`--noCheck` (TypeScript 5.5+) is the answer: emit only. The modules are
typechecked by the lint gate already, so the page loses nothing. Two other
rules of that script still hold: `RUNTIME` is in DEPENDENCY ORDER (a module
before the ones that call it — `rack.ts` and `listener.ts` before the beds,
`bank-world.ts` before `ambience.ts`), and only `export function/const`
names cross module scopes, so a bed's spec tables must be `export const`.

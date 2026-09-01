---
title: A Node script reads an app DATA module through `aliasEngine`, not a Vite build — and a `type`-only `@engine` import is why some app files import fine without it
date: 2026-09-01
scope: scripts/
concepts: [tooling, alias, imports, harness]
---

`pwa/src/game/campaign.ts` (the level table) and its kind are plain
TypeScript with no DOM at module scope, so a `scripts/*.mjs` tool can
`import()` them directly under `--experimental-strip-types`. The one thing
that stops it is the `@engine` alias, which only Vite and vitest know.
`aliasEngine(root)` in `scripts/lib/engine-alias.mjs` registers a
`module.registerHooks` resolve hook mapping `@engine` to `engine/index.ts`;
call it before the first `import()` of an app module. That is the whole cost:
no bundler, no browser, a five-millisecond load.

The trap that hides the need for it: `car-styles.ts` imports `@engine` with
`import type`, which the stripper erases, so `car-preview.mjs` imported it
for years with no alias at all. The first app module that imports a VALUE
from `@engine` (`DEFAULT_KNOBS`, `createRng`) dies with a bare-specifier
error two files away from the script. Reach for the hook, not for a Vite
build of a page — that path is for tooling that has to RENDER app components
(see the browser-tooling-pages lesson).

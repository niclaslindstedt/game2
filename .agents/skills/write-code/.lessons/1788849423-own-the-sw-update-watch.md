---
title: The update watch is ours now — the first install must not prompt, and Preact's useSyncExternalStore takes TWO arguments
date: 2026-09-08
scope: pwa/src/lib/pwa-update.ts, pwa/src/main.tsx
concepts: [pwa, service-worker, preact, harness]
---

`pwa/src/lib/pwa-update.ts` replaced `@niclaslindstedt/oss-framework/pwa`'s
`usePwaUpdate`, which was the last thing the app took from the framework. Two
traps came with owning it, and neither shows up in a typecheck or the suite.

**A `controllerchange` listener that reloads unconditionally reloads every
first-time visitor.** The emitted worker calls `clients.claim()` on activate,
so an uncontrolled page gains a controller the first time anyone opens the
site — on bytes it is already running. Workbox hid this behind its
`event.isUpdate`; written by hand the guard is
`navigator.serviceWorker.controller !== null` read ONCE at registration, not
inside the handler, where it is always true by the time it fires. The same
distinction gates the prompt: `installing.state === "installed"` is the FIRST
install without a controller and a waiting update with one.

**Preact's `useSyncExternalStore` has no `getServerSnapshot` parameter.** The
React signature takes three arguments; porting code that passes a server
snapshot fails `npm run typecheck --workspace pwa` with
`TS2554: Expected 2 arguments, but got 3`. There is no SSR here — drop it.

Verify a change to this file by driving the real thing, not by reading it:
serve `pwa/dist` over HTTP, load it, assert NO `.update-nudge` appears, append
a byte to the served `sw.js`, reload, and assert the button turns up. A pure
unit test cannot see either trap.

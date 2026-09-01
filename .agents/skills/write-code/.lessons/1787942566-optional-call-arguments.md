---
title: An optional call does not evaluate its arguments — never put work inside `cb?.(doIt())`
date: 2026-08-28
scope: pwa/src/game/
concepts: [callbacks, optional-chaining, renderer, silent-failure]
---

`notify?.(knock(thing))` is not "knock it, then tell anyone listening". JS
short-circuits the WHOLE call expression when `notify` is nullish, arguments
included — so with no listener the knock never happens at all.

This is the worst shape a bug can take in this tree, because the listener is
optional exactly where the feature is: `cones.update(state, dt)` in the tests
and `world.update(state, dt, play)` in the app. Every test passed the two-arg
form, so the cones silently stopped being knocked over while the game itself
still worked, and the failure read as "the tumbler is broken" rather than as
a missing argument evaluation.

Always split it:

```ts
const speed = knock(thing, …);
notify?.(speed);
```

Grep for the shape when adding an optional reporting callback to anything
that already does work: `\w+\?\.\(\w+\(`. It compiles, it lints, and only a
test that drives the no-listener path catches it.

---
title: `react-hooks/purity` rejects `Date.now()` anywhere in a component body — move the stamp into the module that owns it
date: 2026-09-08
scope: pwa/src/
concepts: [lint, react-hooks, ui, storage]
---

The eslint config leaves `react-hooks/purity` on, and it is textual: any
`Date.now()` (or other impure call) written inside the component function is an
error, even in a `const handler = () => {…}` that is only ever called from an
event. The existing calls that pass — the score board's `at: Date.now()` — pass
because they sit inside a `useEffect` callback, not because the rule
understands who calls what.

The fix that is also better design: give the stamp to the module that owns the
record. `replay-store.ts` mints ids (`newReplayId()`) and stamps `savedAt`
inside `putReplay`, and App never touches a clock — which is right anyway,
since "when was this kept" is the store's fact and nothing else's. Wrapping
`Date.now` in a local helper to dodge the rule is the wrong answer; the rule is
pointing at a real seam.

Same file, a smaller trap: `@typescript-eslint/no-unused-vars` is configured
with `argsIgnorePattern: "^_"` and nothing else, so the drop-a-field idiom
`const { tape: _tape, ...meta } = record` is an ERROR here. Shape the record so
nothing has to be dropped (`{ meta, tape }` rather than a flat spread) instead
of reaching for the config.

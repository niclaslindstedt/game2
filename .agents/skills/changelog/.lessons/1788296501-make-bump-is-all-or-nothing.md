---
title: `make bump` validates the WHOLE fragment directory, so one bad fragment on main hides yours
date: 2026-09-01
concepts: [changelog, fragments, release, verification]
---

`make bump` is the skill's suggested check on a new fragment, but
`readFragments` throws on the FIRST malformed file it meets anywhere in
`.changes/unreleased/`. A fragment committed by someone else with a bad
`type:` (`fix` instead of `Fixed`) therefore fails the target outright, and
the error names their file, not yours — so the check says nothing about the
fragment you just wrote and reads as though you broke something.

To check only your own, run `readFragments` over a directory holding just it:

```sh
D=<scratch>/frag; mkdir -p $D && cp .changes/unreleased/<yours>.md $D/
node --experimental-strip-types --disable-warning=ExperimentalWarning -e \
  "import('./scripts/release/fragments.mjs').then(m=>console.log(m.readFragments('$D')))"
```

A broken fragment already on `main` will fail the release for everyone, but it
is not the current PR's to sweep in — report it and leave it.

---
title: Name plates stack wherever the field is dense — the one thing to sweep for in a pack frame
date: 2026-09-08
scope: scripts/store-shots/recipes.mjs
concepts: [grid, pack, captions, sweep, outstanding]
---

Putting the field in the frame brings its NAME PLATES with it, and they are the
only thing in these two frames that needs a second look.

- `grid` at `+0.5s`: fifteen cars off the line with dust off all of them — and
  the field still nose to tail, so the plates overlap into a partial pile
  (`METR..RAPPER` over `BLIN` over `FROSTBITE`).
- `pack` at `+1.4s`: a dozen cars fighting into taiga-1's first corner with the
  player's roof in the bottom of the frame. The best frame in the set, and it
  carries five or six plates across the middle of the picture, a couple of them
  overlapping.

The plate is a constant SIZE on screen by design (`sizeAttenuation: false` in
`name-tag.ts`), so distance never thins them out; only the field spreading does.
And they are depth-tested, so a plate is only ever drawn where its car is —
which is exactly why the pile means the cars really are that close.

**Do not switch them off.** A wall of rival names is busy, but it is also the
frame saying these are named crews rather than traffic, which is a feature worth
advertising. The fix is an OFFSET, not a setting.

**And that sweep has not been run.** Both offsets were chosen from a single
frame apiece, because one costs five minutes on a GPU-less runner — which is
precisely the situation the sweep exists for. On a machine that can draw:
`make store-sweep ARGS="--shot grid"` and `--shot pack`, and look for the
earliest offset where three or four plates read apart from each other while the
moment is still legibly a launch, or still legibly a fight for a corner. Write
the winners into `captureAtS`.

The same caution applies to `heli` over any grid: it looks down the column,
which stacks the plates worse than any offset can fix. That is why `grid` is
shot on `far`.

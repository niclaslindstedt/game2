---
title: A MAP repro says where the LENS is, never where on the STAGE it is looking — convert the pan yourself
date: 2026-08-30
scope: pwa/src/game/map-debug.ts, pwa/src/game/menu-roam.tsx
concepts: [repro, screenshots, map-layers, mapgen, review]
---

The driving overlay's PLACE box carries `stage-s` and `off-road` — the two
numbers that actually name a spot on a stage. The MAP's box carries neither.
It gives `pan`, `lens` and the stage's `centre`, and none of those answers
"which corner is this, and is it a straight?" — which is the first question
of every generator defect reported from above.

Convert it by hand. The aim point is the stage's centre plus the pan:

```
aimX = centre.x + mpanx      aimZ = centre.z + mpanz
```

Then compile the same stage headlessly and walk `track.samples` for the
nearest one — that gives `s`, the surface, and (against `track.pacenotes`)
whether the place is inside a corner or out on a straight:

```sh
node --experimental-strip-types --disable-warning=ExperimentalWarning - <<'EOF'
const { compileStage } = await import("/abs/path/engine/index.ts");
const track = compileStage(38, "short", { asphalt: 0.25, /* …the dials off the block */ }, "sprint");
EOF
```

Two frames reported on one stage came back as `s=160.7, gravel, 18 m before
a corner` and `s=1224.0, asphalt` — which is what turned "cones on a
straight" into "the entry zone reaches 46 m outside its note" and "grass on
tarmac" into "the inward tuft branch is not surface-gated". Neither was
readable off the picture.

Worth adding to the map's debug box if a pass is ever in there anyway; until
then, do the conversion before forming a hypothesis.

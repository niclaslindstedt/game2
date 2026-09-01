---
title: Splitting a renderer module silently drops the per-frame calls its old owner made for it
date: 2026-08-28
scope: pwa/src/game/
concepts: [refactor, billboards, camera, review]
---

When a scene object moves out of the module that used to update it, the
one-liners the old `update()` did on its behalf do not come with it —
because they were never part of the object, only of the caller's loop.

Concretely: `environment.update` billboarded the storm's glow quad with a
bare `bolt.lookAt(cam)` beside the sun's and the halo's. Moving lightning
into `storm.ts` took the mesh and left the `lookAt`, and the result was a
huge axis-aligned additive rectangle hanging in the sky — which did not
look like a missing billboard, it looked like the whole effect being wrong.
It only showed up on the contact sheet.

Before splitting, grep the old `update()` for every mention of the names
you are taking (`lookAt`, `visible`, `needsUpdate`, `count`, material
colour writes) and carry each one into the new module's own update — which
is also the moment to give it whatever it needs to do that job (the storm
now takes the camera). Then LOOK at a frame; a missing per-frame call is
invisible in a diff and obvious in a picture.

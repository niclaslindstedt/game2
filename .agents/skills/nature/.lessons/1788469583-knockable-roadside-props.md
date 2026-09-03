---
title: A knockable roadside prop must be LOCAL geometry positioned at its own centre, and plantProp REPARENTS it out of your group
date: 2026-09-03
scope: pwa/src/game/
concepts: [renderer, props, tumble, cones, dressing]
---

Anything beside the road that should go over when it is clipped goes into the
cone field (`pwa/src/game/cones.ts`) via `plantProp(object, s, shape)`. Two
things about that call decide how the builder has to be written, and both are
silent when got wrong:

- **`plantProp` calls `group.add(object)` on the FIELD's group.** An
  `Object3D` has one parent, so a builder that does `myGroup.add(mesh)` and
  then plants it hands the mesh to the field and returns an empty group.
  Either build in the field's terms and return nothing (`plantSplitBoard`,
  `plantJumpCones` — called as a statement from `world.ts`), or keep the
  fixed pieces and the loose ones apart the way `blockade.ts` does.
- **The tumble swings the object about its OWN ORIGIN.** So the mesh's
  geometry has to be in a local frame with the origin at the assembly's
  centre — build it about `y = 0` spanning `±height / 2` and set
  `mesh.position.y = foot + height / 2` — never world-space vertices on a
  mesh sitting at the origin, which tumbles the whole thing about the map's
  origin instead of its own foot.

The local frame that matches every roadside builder here is `+x` right of
travel, `+z` the direction of travel, with `mesh.rotation.y = sample.heading`
— which is exactly `rightOf(heading)` from `ribbon.ts`.

Stand the foot on `sample.elevation + corridorOffset(sample, lat,
sample.width)` (the drawn road/verge profile, the same one `kerbs.ts` reads),
not on the terrain lattice, and use `sample.width` rather than `track.width`
so R33's wander does not leave a post in the road.

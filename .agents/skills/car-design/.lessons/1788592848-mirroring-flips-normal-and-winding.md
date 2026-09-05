---
title: Mirroring across x flips BOTH the normal and the winding — the symptom is a face that is silently not there, on the flank the sheet never shows
date: 2026-08-27
scope: pwa/src/game/car/
concepts: [mirroring, normals, winding, patches, greenhouse, interior, cockpit, culling, door-numbers, contact-sheet]
---

Three facts that each cost a session, because the failure raises nothing: a
single-sided face wound the wrong way, or lifted along the wrong normal, is
not an error — it is a surface that is not there, or one hidden behind the
panel it was meant to stand proud of.

- `patchNormal` builds from the diagonals, so the x-mirror of a patch gets
  `-(mirror of n)` — a normal pointing INTO the car. `patchQuad` negates
  `lift` when `mirrored` is set; any new helper that mirrors geometry and
  offsets it along a computed normal owes the same flip. The whole left
  flank had no side windows for this, sunk behind their own panel.
- Every camera looks down +z, which puts world +x on the LEFT of the frame
  (`new THREE.Vector3(1,0,5).project(cam)` comes back negative — check it,
  do not reason about it). Inside the cabin every hand-wound face points
  INWARD, and a wall built once for `side` of ±1 faces the same way on both
  sides, so one of the pair vanishes: state the FACING and derive the corner
  order from it (`wallX`/`wallZ` in `car/cockpit.ts`). A dial built in the
  obvious xy plane sweeps backwards; turning its frame by π about y fixes
  the mirroring, the facing and the needle's depth at once.
- Before touching direction code for a door number that "reads mirrored",
  look at an ASYMMETRIC digit (`17`): a `3` reads as `Ǝ` at sheet scale
  because the eye picks the light notches. `buildRaceNumber`'s digits are
  correct; a "fix" breaks both flanks.

Prove any of it without a render: a throwaway `node
--experimental-strip-types` probe that builds the patch and its mirror and
prints each drawn corner's |x| against the un-lifted `patchAt(u, v)` under
it — proud on one side and sunk on the other is unambiguous. And look from
INSIDE the car for inward faces: from outside a missing one is invisible.

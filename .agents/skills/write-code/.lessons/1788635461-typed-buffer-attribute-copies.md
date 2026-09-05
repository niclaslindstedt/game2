---
title: A Float32BufferAttribute COPIES the array it is handed — write through `attr.array`, or build a BufferAttribute on your own array
date: 2026-09-05
scope: pwa/src/game/
concepts: [three, rendering, buffers, lamps]
---

`new THREE.Float32BufferAttribute(array, 3)` is `new BufferAttribute(new
Float32Array(array), 3)`: it copies, even from a Float32Array. A module that
keeps the array it built the attribute from and rewrites it per frame (a lamp
panel lighting a segment, a film moving its coat) is writing into a buffer
the GPU never sees, and `needsUpdate = true` uploads the untouched copy. The
symptom is a display that is simply dark, with no warning anywhere.

Either construct `new THREE.BufferAttribute(ownArray, 3)` (no copy) or write
through `attr.array as Float32Array`, the way `car/wipers.ts` paints its
film. A unit test that reads the colours BACK off `geometry.getAttribute("color")`
after a `set()` catches this in Node without a GPU — `tests/cockpit_test.ts`
does.

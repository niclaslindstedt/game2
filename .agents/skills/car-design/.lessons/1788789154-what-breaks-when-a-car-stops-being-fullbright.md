---
title: Making the car LIT breaks every scene that draws one without a sky, and the lamps' wash has to move out of the albedo
date: 2026-09-07
scope: pwa/src/game/, pwa/src/tools/car-preview.ts
concepts: [rendering, three, materials, lighting, preview, car-design]
---

Moving the bodies off fullbright onto `MeshPhongMaterial` (`car-surface.ts`)
has two consequences that no amount of reading the diff reveals.

**Three scenes draw a car with no lights in them at all**, and each renders a
black car the moment the material becomes lit: the pre-race card
(`car-portrait.ts`), the menu turntable (`car-turntable.ts`) and the preview
tool's contact sheets (`tools/car-preview.ts`). Only the first is even
player-facing; the other two are the review loop this skill runs on, so a
sheet of black cars is also the tool you would use to notice. `studioLights()`
stands the rig up, and it deliberately reproduces the sun the vertex colours
used to carry (high, front-right, with a hemisphere floor) so a new sheet
stays comparable with every sheet shot before the change.

**Anything that adds authored light to the body must go into the OUTGOING
light, never into `diffuse`.** On a fullbright material the colour is the
final answer, so adding a term there was right. On a lit one the albedo is
what the sun and sky get MULTIPLIED BY — so the car's own lamp spill folded
in there is multiplied by a night sky of nearly nothing and vanishes on
exactly the frames it exists for. The anchor changes with it: the fullbright
body's `vec3 outgoingLight = reflectedLight.indirectDiffuse;` is not a string
that appears in the Phong shader at all, and a `.replace` that matches
nothing fails silently.

Keep the face normals FLAT (one per triangle, `writeFaceNormal`). A low-poly
body lit per face reads as panels; `computeVertexNormals` averages, and the
same body comes back a bar of soap.

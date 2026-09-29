---
title: A plant under a hand's height is judged on the items turntable — the tree sheet's seat shows a lily pad or a salt crust as nothing at all
date: 2026-09-29
scope: pwa/src/tools/trees-preview.ts, pwa/src/tools/item-preview.ts
concepts: [lab, flora, camera, verification]
---

`make trees --compare` stands its camera a metre and a third up and metres
back, framed on `max(1, height)`: a lily pad three centimetres thick, a
salt crust, a moss patch's model land in a cell as plain ground, while the
same models dress and render correctly (the Node check of the dressed
geometry's bounds, colours and normals is sane). The model is not wrong;
the seat is. `make items ARGS="--models --from previews/blender"` stands
each on a turntable FITTED to its own bounding sphere, five views round,
and the pad, the crust and the flower are all there. Shoot the same ids
once more without `--models` for the code's own beside them. Reach for the
turntable for anything flat or small; the tree sheet is for what stands
over the seat.

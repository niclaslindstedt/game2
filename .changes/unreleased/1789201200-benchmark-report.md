---
type: Added
title: The benchmark writes down what the frame was doing
---

The card answers "is this machine coping". The new **COPY DEBUG REPORT**
button answers the other question — "what was the frame actually doing" —
which is where anyone making the game faster has to start.

The report carries the conditions (stage, field, buffer, device pixel ratio
and every video row), what one frame cost the renderer as a median over the
run (draw calls, triangles, and the programs, geometries and textures the
stage is holding), a breakdown of what was standing in the scene by
subsystem, and every reading with its draw calls sitting in the same row as
its frame rate. That last part is the point: a rate that fell while the draw
calls did not is the machine, and one that fell with them is the scene.

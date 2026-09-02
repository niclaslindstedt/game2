---
type: Fixed
title: An endless stage's road no longer changes width and camber with how it was streamed
---

The cross-fall and the width of the road are each rolled in and out over a
window, and on an endless stage that window was cut off at every streaming
frontier: when the next chunk landed, the pass re-ran over the previous
chunk's tail from its own smoothed output, and with the tail's neighbours
sliced away — so the road came out up to three quarters of a metre narrower
at every seam, depending on how far ahead the renderer had asked for road.
Both passes now smooth from the values the walk laid down, over the whole
road, and an endless stage is the same stage however its extends are
chunked. The homesteads beside it, whose drives read the road's edge, are
the same too.

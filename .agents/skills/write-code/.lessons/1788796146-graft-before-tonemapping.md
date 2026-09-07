---
title: A shader graft that writes COLOUR must land before `tonemapping_fragment` — anchored on the fog it lands after the colour-space encode, and linear values come out dark with no error
date: 2026-09-07
scope: pwa/src/game/
concepts: [rendering, three, shader, materials, color-space]
---

Three's fragment chunks run in this order, and the gap between the second and
the fourth is where grafts go wrong:

```
#include <opaque_fragment>      // gl_FragColor is assembled here
#include <tonemapping_fragment>
#include <colorspace_fragment>  // linear -> the output encoding
#include <fog_fragment>
```

"Before the fog" is the natural-sounding anchor for anything that wants to be
fogged like the rest of the frame, and `#include <fog_fragment>` is the
obvious hook — the height fog's own graft lives there. But it is AFTER the
colour-space conversion. Colours in this repo are authored linear (a
`THREE.Color` from a hex converts sRGB to linear on the way in), so a graft
that mixes one in at that point writes a linear value into a buffer that has
already been encoded. It comes back much darker than authored.

Nothing reports this. There is no compile error and no missing symbol: the
effect simply reads as far too weak, which sends the session tuning
strengths, doubting the material, and re-checking whether the graft ran at
all.

Anchor on `#include <tonemapping_fragment>` instead — the moment the
surface's own colour is finished. Tone mapping, the encode and the fog all
run after it, so the contribution is tone-mapped, encoded and fogged exactly
like the surface it sits on, which is what you wanted from "before the fog"
in the first place.

On a LIT material this is the same anchor the outgoing-light rule already
demands, for a second reason: written into `diffuse` it would be albedo the
scene's light gets multiplied by.

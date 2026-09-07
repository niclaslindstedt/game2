---
title: Anything the dome draws per pixel is sized in PIXELS, not radians — an angular size is invisible on the contact sheet and a blob at 1080p
date: 2026-09-07
scope: pwa/src/game/sky-shader.ts, pwa/src/game/starfield.ts
concepts: [sky, rendering, screenshots, stars]
---

A star written as an angular radius looked like the obvious choice — a real
star IS an angle — and cost two full `make build && make sky` cycles before the
cause was clear. `make sky`'s cells are 400 px at 64° FOV, about 0.16° a pixel;
the shader's faint grid put its stars at 0.06°, so they were evaluated at one
sub-pixel sample and the whole shell came back as an empty sky. The same
number at 1080p would have been a five-pixel blob. Meanwhile the LOW sky's
`gl_PointSize` guaranteed one to three real pixels and looked correct, which
made it read as a shader bug rather than a units bug.

The fix is one line: measure how many radians a pixel is worth off the view
ray's own derivative (`float pixel = max(length(fwidth(ray)), 1e-5);`) and size
the feature by it. Take the derivative where the flow is still uniform — the
strength guard above it is a uniform branch, the ones under it are not.
Derivatives need no extension pragma here; `three` is on WebGL2 and two other
shaders in `pwa/src/game/` already use `fwidth`/`dFdx`.

The grid then does the one job it is good at — deciding HOW MANY there are —
and the sheet and the game agree. Generalise it: any point-like or hairline
thing added to the dome (a star, a satellite, a distant lamp) wants the same
treatment, and a sub-pixel feature judged on the contact sheet is judged wrong
in whichever direction you are not expecting.

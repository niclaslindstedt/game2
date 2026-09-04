---
title: A CSS transition on a group whose geometry is REBUILT underneath it animates the seam — suppress it on the frame the rebuild lands
date: 2026-09-04
scope: pwa/src/game/, pwa/src/styles.css
concepts: [hud, css, svg, caching, ui]
---

The cheap way to make a HUD surface that follows the car is to build its
geometry around an ANCHOR now and then, and carry the drift between that
anchor and the car as a transform on the group. The minimap does exactly
this (`minimap-scene.ts`): paths cut every twenty metres, slid every
snapshot, with `transition: transform 120ms linear` so the 12 Hz snapshot
scrolls instead of stepping.

The seam is the frame the anchor moves. There the transform JUMPS back
toward zero and the path data jumps with it, and the two compose to the same
picture — but only if the transform arrives instantly. Transitioned, the
browser eases the transform over 120 ms while the paths are already at their
new values, so the whole surface slides by the anchor's slack and back,
twice a second at speed. It reads as judder in something that was supposed
to remove judder, and it is invisible in a screenshot.

The fix that works: give the payload an id that changes only when the
geometry was rebuilt, and render that one frame with `transition: none`
(a `useRef` holding the last id, compared during render). The next frame
restores the transition with a small delta, which is smooth. The same trap
is waiting for any surface that quantises an expensive rebuild and carries
the remainder as a transform — a zoom compensated by a scale has it too.

Test it by asserting the id changes exactly when the built output does; the
glitch itself cannot be caught by a still.
